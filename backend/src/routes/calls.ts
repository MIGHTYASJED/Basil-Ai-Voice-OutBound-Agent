import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { stringify } from 'csv-stringify/sync';
import { prisma } from '../db.js';
import { authGuard } from '../auth/routes.js';
import { fromJson } from '../lib/json.js';
import { callBus } from '../telephony/bus.js';
import { getProvider } from '../telephony/registry.js';

export async function callRoutes(app: FastifyInstance) {
  app.get('/calls', { preHandler: authGuard() }, async (req) => {
    const q = req.query as { outcome?: string; agentId?: string; campaignId?: string; days?: string };
    const where: any = {};
    if (q.days) where.createdAt = { gte: new Date(Date.now() - Number(q.days) * 86_400_000) };
    if (q.outcome && q.outcome !== 'all') where.outcome = q.outcome;
    if (q.agentId) where.agentId = q.agentId;
    if (q.campaignId) where.campaignId = q.campaignId;
    const rows = await prisma.call.findMany({ where, include: { agent: true, driver: true, load: true, note: true }, orderBy: { createdAt: 'desc' }, take: 100 });
    return rows.map(serialize);
  });

  app.get('/calls/:id', { preHandler: authGuard() }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const c = await prisma.call.findUnique({ where: { id }, include: { agent: true, driver: true, load: true, note: true } });
    if (!c) return reply.code(404).send({ error: 'not found' });
    return {
      ...serialize(c),
      transcript: fromJson<any[]>(c.note?.transcript ?? '[]', []),
      driverInfo: fromJson<string[]>(c.note?.driverInfo ?? '[]', []),
      dispatcherNote: c.note?.dispatcherNote ?? null,
      recordingUrl: c.recordingUrl ?? null,
    };
  });

  app.post('/calls/:id/flag', { preHandler: authGuard() }, async (req, reply) => {
    const { id } = req.params as { id: string };
    if (!(await prisma.call.findUnique({ where: { id } }))) return reply.code(404).send({ error: 'not found' });
    await prisma.call.update({ where: { id }, data: { sentiment: 'flagged' } });
    return { ok: true };
  });

  // Supervisor controls for a call in progress (Listen-in modal).
  app.post('/calls/:id/end', { preHandler: authGuard(true) }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const c = await prisma.call.findUnique({ where: { id } });
    if (!c) return reply.code(404).send({ error: 'not found' });
    if (!['queued', 'dialing', 'ringing', 'ai_talking'].includes(c.status)) return reply.code(409).send({ error: 'This call already ended.' });
    callBus.emitEvent({ type: 'outcome', callId: id, outcome: 'hung_up', summary: 'Call ended by a supervisor.', driverInfo: [], transcript: [], durationSec: c.answeredAt ? Math.round((Date.now() - new Date(c.answeredAt).getTime()) / 1000) : 0 });
    if (c.providerCallId) await getProvider(c.provider).hangup(c.providerCallId).catch(() => {});
    return { ok: true };
  });

  app.post('/calls/:id/transfer', { preHandler: authGuard(true) }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const c = await prisma.call.findUnique({ where: { id } });
    if (!c) return reply.code(404).send({ error: 'not found' });
    if (c.status !== 'ai_talking') return reply.code(409).send({ error: 'Only a call in conversation can be transferred.' });
    callBus.emitEvent({ type: 'transfer', callId: id, reason: 'supervisor', summary: 'A supervisor pulled this call to a human dispatcher.', driverInfo: [], transcript: [], durationSec: c.answeredAt ? Math.round((Date.now() - new Date(c.answeredAt).getTime()) / 1000) : 0 });
    return { ok: true };
  });

  app.get('/calls/export', { preHandler: authGuard() }, async (_req, reply) => {
    const rows = await prisma.call.findMany({ include: { agent: true, driver: true }, orderBy: { createdAt: 'desc' }, take: 1000 });
    const csv = stringify(rows.map((c) => ({
      time: c.createdAt.toISOString(), agent: c.agent?.name ?? '', driver: c.driver?.name ?? '',
      duration: c.durationSec, status: c.status, outcome: c.outcome ?? '', cost: c.cost,
    })), { header: true });
    reply.header('Content-Type', 'text/csv');
    reply.header('Content-Disposition', 'attachment; filename="call-log.csv"');
    return csv;
  });
}

function serialize(c: any) {
  return {
    id: c.id, agentId: c.agentId, campaignId: c.campaignId, createdAt: c.createdAt, time: new Date(c.createdAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }),
    agent: c.agent?.name ?? '—', driver: c.driver?.name ?? '—', load: c.load?.reference ?? '—',
    dur: c.durationSec ? `${Math.floor(c.durationSec / 60)}:${String(c.durationSec % 60).padStart(2, '0')}` : '—',
    status: c.status === 'ai_talking' ? 'live' : c.endedAt ? 'done' : c.status,
    outcome: c.outcome ?? '—', summary: c.note?.aiSummary ?? '', sentiment: c.sentiment, cost: c.cost,
  };
}
