import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '../db.js';
import { authGuard } from '../auth/routes.js';
import { toJson, fromJson } from '../lib/json.js';
import { launchCampaign, pauseCampaign } from '../services/dialer.js';
import { campaignWindowOpen } from '../services/callWindow.js';
import { config } from '../config.js';
import { stringify } from 'csv-stringify/sync';

export async function campaignRoutes(app: FastifyInstance) {
  app.get('/campaigns', { preHandler: authGuard() }, async () => {
    const rows = await prisma.campaign.findMany({ orderBy: { createdAt: 'desc' } });
    return rows.map(serialize);
  });

  app.get('/campaigns/:id', { preHandler: authGuard() }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const c = await prisma.campaign.findUnique({ where: { id } });
    if (!c) return reply.code(404).send({ error: 'not found' });
    const loadIds = fromJson<string[]>(c.loadIds, []);
    const agentIds = fromJson<string[]>(c.agentIds, []);
    const [loads, agents, calls] = await Promise.all([
      prisma.load.findMany({ where: { id: { in: loadIds } } }),
      prisma.agent.findMany({ where: { id: { in: agentIds } }, include: { assignedNumber: true } }),
      prisma.call.findMany({ where: { campaignId: id }, include: { driver: true, agent: true, note: true }, orderBy: { createdAt: 'desc' }, take: 50 }),
    ]);
    // live agents currently on a call for this campaign
    const monitor = await Promise.all(agents.map(async (a) => {
      const active = await prisma.call.findFirst({ where: { agentId: a.id, campaignId: id, status: { in: ['dialing', 'ringing', 'ai_talking'] } }, include: { driver: true, load: true } });
      return {
        id: a.id, name: a.name, status: a.status,
        live: active ? { callId: active.id, driver: active.driver?.name, phone: active.toNumber, load: active.load?.reference, route: active.load ? `${active.load.originCity} → ${active.load.destCity}` : undefined, startedAt: active.answeredAt ?? active.startedAt, status: active.status } : null,
      };
    }));
    const allCalls = await prisma.call.findMany({ where: { campaignId: id } });
    const answered = allCalls.filter((x: any) => x.answeredAt);
    const done = allCalls.filter((x: any) => x.durationSec > 0);
    const avg = done.length ? Math.round(done.reduce((s2: number, x: any) => s2 + x.durationSec, 0) / done.length) : 0;
    const stats = {
      calls: allCalls.length,
      connected: answered.length,
      interested: allCalls.filter((x: any) => ['transferred', 'booked', 'callback'].includes(x.outcome)).length,
      transferred: allCalls.filter((x: any) => x.outcome === 'transferred').length,
      booked: allCalls.filter((x: any) => x.outcome === 'booked').length,
      callbacks: allCalls.filter((x: any) => x.outcome === 'callback').length,
      avgDurationSec: avg,
      cost: Number(allCalls.reduce((s2: number, x: any) => s2 + (x.cost ?? 0), 0).toFixed(2)),
    };
    return {
      ...serialize(c),
      stats,
      loads: loads.map((l) => ({ id: l.id, ref: l.reference, route: `${l.originCity} → ${l.destCity}`, type: l.truckType, perMi: l.ratePerMile, status: l.status })),
      agents: agents.map((a) => a.name),
      monitor,
      callLog: calls.map((c2) => ({ id: c2.id, time: c2.createdAt, agent: c2.agent?.name, driver: c2.driver?.name, dur: c2.durationSec, outcome: c2.outcome, summary: c2.note?.aiSummary })),
    };
  });

  // Preview how many drivers match a filter (campaign wizard step 2).
  app.post('/campaigns/preview-drivers', { preHandler: authGuard(true) }, async (req) => {
    const filter = z.object({ truckType: z.string().optional(), state: z.string().optional() }).parse(req.body);
    const where: any = { status: 'active' };
    if (filter.truckType) where.truckType = filter.truckType;
    if (filter.state) where.locationState = filter.state;
    const count = await prisma.driver.count({ where });
    const sample = await prisma.driver.findMany({ where, take: 5 });
    return { count, sample: sample.map((d) => ({ name: d.name, type: d.truckType, loc: [d.locationCity, d.locationState].filter(Boolean).join(', ') })) };
  });

  app.post('/campaigns', { preHandler: authGuard(true) }, async (req, reply) => {
    const body = z.object({
      name: z.string().min(1), loadIds: z.array(z.string()).default([]), agentIds: z.array(z.string()).default([]),
      agentGroupId: z.string().optional(), driverFilter: z.object({ truckType: z.string().optional(), state: z.string().optional() }).optional(),
      callWindowStart: z.string().regex(/^\d{1,2}:\d{2}$/).default('08:00'), callWindowEnd: z.string().regex(/^\d{1,2}:\d{2}$/).default('16:00'),
      timezone: z.string().default('America/Chicago'),
      maxRetries: z.number().int().min(0).max(5).default(2), retryDelayMin: z.number().int().min(15).max(1440).default(120),
      launch: z.boolean().default(false),
    }).parse(req.body);

    // resolve group → its agents
    let agentIds = body.agentIds;
    if (body.agentGroupId) {
      const groupAgents = await prisma.agent.findMany({ where: { groupId: body.agentGroupId } });
      agentIds = groupAgents.map((a) => a.id);
    }
    if (body.launch && agentIds.length === 0) return reply.code(400).send({ error: 'Pick at least one agent before launching.' });
    if (body.launch && body.loadIds.length === 0) return reply.code(400).send({ error: 'Pick at least one load before launching.' });

    // compute target driver count
    const where: any = { status: 'active' };
    if (body.driverFilter?.truckType) where.truckType = body.driverFilter.truckType;
    if (body.driverFilter?.state) where.locationState = body.driverFilter.state;
    const driversTotal = await prisma.driver.count({ where });

    const c = await prisma.campaign.create({
      data: {
        name: body.name, loadIds: toJson(body.loadIds), agentIds: toJson(agentIds), agentGroupId: body.agentGroupId,
        driverFilter: toJson(body.driverFilter ?? {}), callWindowStart: body.callWindowStart, callWindowEnd: body.callWindowEnd,
        timezone: body.timezone, maxRetries: body.maxRetries, retryDelayMin: body.retryDelayMin,
        driversTotal, status: body.launch ? 'calling' : 'draft',
      },
    });
    if (body.launch) await launchCampaign(c.id);
    return reply.code(201).send(serialize(c));
  });

  app.post('/campaigns/:id/launch', { preHandler: authGuard(true) }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const c = await prisma.campaign.findUnique({ where: { id } });
    if (!c) return reply.code(404).send({ error: 'Campaign not found' });
    if (fromJson<string[]>(c.agentIds, []).length === 0) return reply.code(400).send({ error: 'This campaign has no agents assigned.' });
    if (fromJson<string[]>(c.loadIds, []).length === 0) return reply.code(400).send({ error: 'Add at least one load before launching.' });
    await launchCampaign(id);
    return { ok: true };
  });

  // Edit campaign settings (name, window, retries).
  app.patch('/campaigns/:id', { preHandler: authGuard(true) }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const body = z.object({
      name: z.string().min(1).optional(),
      callWindowStart: z.string().regex(/^\d{1,2}:\d{2}$/).optional(), callWindowEnd: z.string().regex(/^\d{1,2}:\d{2}$/).optional(),
      timezone: z.string().optional(), maxRetries: z.number().int().min(0).max(5).optional(), retryDelayMin: z.number().int().min(15).max(1440).optional(),
    }).parse(req.body);
    if (!(await prisma.campaign.findUnique({ where: { id } }))) return reply.code(404).send({ error: 'Campaign not found' });
    const c = await prisma.campaign.update({ where: { id }, data: body });
    return serialize(c);
  });

  // Duplicate a campaign (same loads/agents/filter) as a new draft.
  app.post('/campaigns/:id/duplicate', { preHandler: authGuard(true) }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const c = await prisma.campaign.findUnique({ where: { id } });
    if (!c) return reply.code(404).send({ error: 'Campaign not found' });
    const copy = await prisma.campaign.create({
      data: {
        name: `${c.name} (copy)`, loadIds: c.loadIds, agentIds: c.agentIds, agentGroupId: c.agentGroupId, driverFilter: c.driverFilter,
        callWindowStart: c.callWindowStart, callWindowEnd: c.callWindowEnd, timezone: c.timezone,
        maxRetries: c.maxRetries, retryDelayMin: c.retryDelayMin, driversTotal: c.driversTotal, status: 'draft',
      },
    });
    return reply.code(201).send(serialize(copy));
  });

  // Full call report for one campaign as CSV.
  app.get('/campaigns/:id/export', { preHandler: authGuard() }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const c = await prisma.campaign.findUnique({ where: { id } });
    if (!c) return reply.code(404).send({ error: 'Campaign not found' });
    const calls = await prisma.call.findMany({ where: { campaignId: id }, include: { agent: true, driver: true, load: true, note: true }, orderBy: { createdAt: 'asc' } });
    const csv = stringify(calls.map((x: any) => ({
      time: x.createdAt.toISOString(), agent: x.agent?.name ?? '', driver: x.driver?.name ?? '', phone: x.toNumber ?? '',
      load: x.load?.reference ?? '', status: x.status, outcome: x.outcome ?? '', duration_sec: x.durationSec,
      cost_usd: x.cost, summary: x.note?.aiSummary ?? '', dispatcher_note: x.note?.dispatcherNote ?? '',
    })), { header: true });
    const safe = c.name.replace(/[^a-z0-9]+/gi, '-').toLowerCase();
    reply.header('Content-Type', 'text/csv');
    reply.header('Content-Disposition', `attachment; filename="${safe}-report.csv"`);
    return csv;
  });
  app.post('/campaigns/:id/pause', { preHandler: authGuard(true) }, async (req, reply) => {
    const { id } = req.params as { id: string };
    if (!(await prisma.campaign.findUnique({ where: { id } }))) return reply.code(404).send({ error: 'Campaign not found' });
    await pauseCampaign(id);
    return { ok: true };
  });
  app.post('/campaigns/:id/resume', { preHandler: authGuard(true) }, async (req, reply) => {
    const { id } = req.params as { id: string };
    if (!(await prisma.campaign.findUnique({ where: { id } }))) return reply.code(404).send({ error: 'Campaign not found' });
    await launchCampaign(id);
    return { ok: true };
  });

  // Append a single load to an existing campaign's loadIds array (idempotent).
  app.post('/campaigns/:id/add-load', { preHandler: authGuard(true) }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const { loadId } = z.object({ loadId: z.string().min(1) }).parse(req.body);
    const c = await prisma.campaign.findUnique({ where: { id } });
    if (!c) return reply.code(404).send({ error: 'Campaign not found' });
    const ids = fromJson<string[]>(c.loadIds, []);
    if (!ids.includes(loadId)) {
      ids.push(loadId);
      await prisma.campaign.update({ where: { id }, data: { loadIds: toJson(ids) } });
    }
    return { ok: true, loadIds: ids };
  });
}


function serialize(c: any) {
  const pct = c.driversTotal > 0 ? Math.min(100, Math.round((c.driversCalled / c.driversTotal) * 100)) : 0;
  const conv = c.driversCalled > 0 ? `${((c.bookedCount / c.driversCalled) * 100).toFixed(1)}%` : '—';
  const enforce = config.telephonyMode === 'live' || config.enforceCallWindowInSim;
  return {
    id: c.id, name: c.name,
    // "calling" is the internal state; the UI calls it Active.
    status: c.status === 'calling' ? 'Active' : cap(c.status),
    loads: fromJson<string[]>(c.loadIds, []).length, loadIds: fromJson<string[]>(c.loadIds, []),
    called: c.driversCalled, total: c.driversTotal, pct, conv,
    connected: c.connectedCount, booked: c.bookedCount,
    agents: fromJson<string[]>(c.agentIds, []),
    callWindowStart: c.callWindowStart, callWindowEnd: c.callWindowEnd, timezone: c.timezone,
    maxRetries: c.maxRetries, retryDelayMin: c.retryDelayMin,
    // false = launched but waiting for the call window to open
    inWindow: !enforce || campaignWindowOpen(c),
    created: new Date(c.createdAt).toLocaleDateString(),
    completedAt: c.completedAt ? new Date(c.completedAt).toLocaleString() : null,
  };
}
function cap(s: string) { return s.charAt(0).toUpperCase() + s.slice(1); }
