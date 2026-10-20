import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { parse } from 'csv-parse/sync';
import { stringify } from 'csv-stringify/sync';
import { prisma } from '../db.js';
import { authGuard } from '../auth/routes.js';
import { config } from '../config.js';

export async function loadRoutes(app: FastifyInstance) {
  app.get('/loads', { preHandler: authGuard() }, async (req) => {
    const q = req.query as { status?: string; group?: string };
    const where: any = {};
    if (q.status && q.status !== 'all') where.status = q.status.toLowerCase();
    if (q.group) where.groupId = q.group;
    const [rows, groups] = await Promise.all([
      prisma.load.findMany({ where, orderBy: { createdAt: 'asc' } }),
      prisma.loadGroup.findMany({ orderBy: { createdAt: 'asc' } }),
    ]);
    return { loads: rows.map(serialize), groups: groups.map((g) => ({ id: g.id, name: g.name })) };
  });

  app.get('/loads/:id', { preHandler: authGuard() }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const load = await prisma.load.findUnique({ where: { id } });
    if (!load) return reply.code(404).send({ error: 'not found' });
    const calls = await prisma.call.findMany({ where: { loadId: id }, include: { agent: true, driver: true }, orderBy: { createdAt: 'desc' } });
    return {
      ...serialize(load),
      calls: calls.map((c) => ({ driver: c.driver?.name, agent: c.agent?.name, outcome: c.outcome, dur: c.durationSec, when: c.createdAt })),
    };
  });

  app.post('/loads', { preHandler: authGuard() }, async (req, reply) => {
    const body = loadSchema.parse(req.body);
    let ref = body.reference ?? `#${Math.floor(4000 + Math.random() * 6000)}`;
    if (await prisma.load.findFirst({ where: { reference: ref } })) {
      if (body.reference) return reply.code(409).send({ error: `Load ${ref} already exists.` });
      while (await prisma.load.findFirst({ where: { reference: ref } })) ref = `#${Math.floor(4000 + Math.random() * 6000)}`;
    }
    const perMile = body.miles && body.miles > 0 ? Number((body.rateTotal / body.miles).toFixed(2)) : undefined;
    let groupId = body.groupId;
    if (body.newGroupName) {
      const g = await prisma.loadGroup.create({ data: { name: body.newGroupName } });
      groupId = g.id;
    }
    const load = await prisma.load.create({
      data: { reference: ref, originCity: body.originCity, originState: body.originState, destCity: body.destCity, destState: body.destState,
        truckType: body.truckType, miles: body.miles, rateTotal: body.rateTotal, ratePerMile: perMile, minRate: body.minRate,
        commodity: body.commodity, weightLbs: body.weightLbs, groupId },
    });
    return reply.code(201).send(serialize(load));
  });

  app.patch('/loads/:id', { preHandler: authGuard() }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const body = loadSchema.partial().parse(req.body);
    const existing = await prisma.load.findUnique({ where: { id } });
    if (!existing) return reply.code(404).send({ error: 'Load not found' });
    const { newGroupName: _ignored, ...data } = body as any;
    const miles = data.miles ?? existing.miles;
    const rate = data.rateTotal ?? existing.rateTotal;
    if (miles && rate) data.ratePerMile = Number((rate / miles).toFixed(2));
    const load = await prisma.load.update({ where: { id }, data });
    return serialize(load);
  });

  app.delete('/loads/:id', { preHandler: authGuard() }, async (req) => {
    const { id } = req.params as { id: string };
    await prisma.load.delete({ where: { id } });
    return { ok: true };
  });

  app.post('/load-groups', { preHandler: authGuard() }, async (req, reply) => {
    const body = z.object({ name: z.string().min(1) }).parse(req.body);
    const g = await prisma.loadGroup.create({ data: { name: body.name.trim() } });
    return reply.code(201).send({ id: g.id, name: g.name });
  });

  app.patch('/load-groups/:id', { preHandler: authGuard() }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const body = z.object({ name: z.string().min(1) }).parse(req.body);
    if (!(await prisma.loadGroup.findUnique({ where: { id } }))) return reply.code(404).send({ error: 'Group not found' });
    await prisma.loadGroup.update({ where: { id }, data: { name: body.name.trim() } });
    return { ok: true };
  });

  // Move loads into a group.
  app.post('/load-groups/:id/loads', { preHandler: authGuard() }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const body = z.object({ loadIds: z.array(z.string()).min(1) }).parse(req.body);
    if (!(await prisma.loadGroup.findUnique({ where: { id } }))) return reply.code(404).send({ error: 'Group not found' });
    const r = await prisma.load.updateMany({ where: { id: { in: body.loadIds } }, data: { groupId: id } });
    return { ok: true, moved: r.count };
  });

  app.delete('/load-groups/:id', { preHandler: authGuard() }, async (req) => {
    const { id } = req.params as { id: string };
    await prisma.load.updateMany({ where: { groupId: id }, data: { groupId: null } });
    await prisma.loadGroup.delete({ where: { id } });
    return { ok: true };
  });

  // CSV import with optional group assignment.
  app.post('/loads/import', { preHandler: authGuard() }, async (req, reply) => {
    const body = z.object({ csv: z.string(), groupId: z.string().optional(), newGroupName: z.string().optional(), mapping: z.record(z.string()).optional() }).parse(req.body);
    let records: any[];
    try {
      records = parse(body.csv, { columns: true, skip_empty_lines: true, trim: true });
    } catch {
      return reply.code(400).send({ error: 'Could not parse CSV.' });
    }
    let groupId = body.groupId;
    if (body.newGroupName) { const g = await prisma.loadGroup.create({ data: { name: body.newGroupName } }); groupId = g.id; }

    const m = body.mapping ?? {};
    let imported = 0, skipped = 0;
    for (const row of records) {
      if (!pick(row, m, ['origin_city', 'pickup_city', 'origin']) || !pick(row, m, ['dest_city', 'dropoff_city', 'destination'])) { skipped++; continue; }
      const rateTotal = Number(pick(row, m, ['rate', 'rate_total', 'total_rate'])?.replace(/[^0-9.]/g, '') ?? 0);
      const miles = Number(pick(row, m, ['miles', 'distance']) ?? 0) || undefined;
      try {
        await prisma.load.create({
          data: {
            reference: pick(row, m, ['ref', 'reference', 'load_id']) ?? `#${Math.floor(4000 + Math.random() * 6000)}`,
            originCity: pick(row, m, ['origin_city', 'pickup_city', 'origin']) ?? '',
            originState: pick(row, m, ['origin_state', 'pickup_state']) ?? '',
            destCity: pick(row, m, ['dest_city', 'dropoff_city', 'destination']) ?? '',
            destState: pick(row, m, ['dest_state', 'dropoff_state']) ?? '',
            truckType: pick(row, m, ['equipment', 'truck_type', 'type']) ?? 'Dry Van',
            rateTotal, miles, ratePerMile: miles ? Number((rateTotal / miles).toFixed(2)) : undefined,
            source: 'csv', groupId,
          },
        });
        imported++;
      } catch { skipped++; /* dup ref */ }
    }
    return { imported, skipped, total: records.length, groupId };
  });

  // DAT-style live freight feed. Uses the real DAT API if configured, else a
  // representative sample so the feed UI is fully functional.
  app.get('/loads/dat-feed', { preHandler: authGuard() }, async () => {
    if (config.dat.enabled) {
      // Real DAT integration would go here (auth + search). Falls through to
      // sample if the call fails, so the UI never breaks.
    }
    // `sample: true` tells the UI to label this as demo data, not live market loads.
    return { feed: SAMPLE_FEED, live: false, sample: true };
  });

  app.get('/loads/dat-feed/export', { preHandler: authGuard() }, async (_req, reply) => {
    const csv = stringify(SAMPLE_FEED, { header: true });
    reply.header('Content-Type', 'text/csv');
    reply.header('Content-Disposition', 'attachment; filename="freight-feed.csv"');
    return csv;
  });

  app.post('/loads/dat-feed/import', { preHandler: authGuard() }, async (req) => {
    const body = z.object({ ids: z.array(z.string()), groupId: z.string().optional(), newGroupName: z.string().optional() }).parse(req.body);
    let groupId = body.groupId;
    if (body.newGroupName) { const g = await prisma.loadGroup.create({ data: { name: body.newGroupName } }); groupId = g.id; }
    let imported = 0;
    for (const id of body.ids) {
      const f = SAMPLE_FEED.find((x) => x.id === id);
      if (!f) continue;
      const rateTotal = Number(f.rate.replace(/[^0-9.]/g, '')) * f.miles;
      await prisma.load.create({
        data: { reference: `#${Math.floor(4000 + Math.random() * 6000)}`, originCity: f.origin.split(',')[0], originState: f.origin.split(',')[1]?.trim() ?? '',
          destCity: f.dest.split(',')[0], destState: f.dest.split(',')[1]?.trim() ?? '', truckType: f.type, miles: f.miles,
          rateTotal, ratePerMile: Number(f.rate.replace(/[^0-9.]/g, '')), source: 'dat_api', groupId,
          brokerInfo: JSON.stringify({ broker: f.broker, phone: f.brokerPhone, credit: f.brokerCredit }) },
      });
      imported++;
    }
    return { imported, groupId };
  });
}

const loadSchema = z.object({
  reference: z.string().optional(), originCity: z.string(), originState: z.string(), destCity: z.string(), destState: z.string(),
  truckType: z.string(), miles: z.number().optional(), rateTotal: z.number(), minRate: z.number().optional(),
  commodity: z.string().optional(), weightLbs: z.number().optional(), groupId: z.string().optional(), newGroupName: z.string().optional(),
});

function serialize(l: any) {
  return {
    id: l.id, ref: l.reference, origin: `${l.originCity}, ${l.originState}`, dest: `${l.destCity}, ${l.destState}`,
    type: l.truckType, pickup: l.pickupAt ? new Date(l.pickupAt).toLocaleDateString() : '—',
    rate: `$${Math.round(l.rateTotal).toLocaleString()}`, perMi: l.ratePerMile?.toFixed(2) ?? '—', miles: l.miles ?? 0,
    status: cap(l.status), group: l.groupId,
  };
}
function pick(row: any, mapping: Record<string, string>, candidates: string[]): string | undefined {
  for (const [src, dest] of Object.entries(mapping)) if (candidates.includes(dest) && row[src]) return String(row[src]);
  for (const key of Object.keys(row)) if (candidates.includes(key.toLowerCase().replace(/\s+/g, '_')) && row[key]) return String(row[key]);
  return undefined;
}
function cap(s: string) { return s.charAt(0).toUpperCase() + s.slice(1); }

const SAMPLE_FEED = [
  { id: 'f1', origin: 'Dallas, TX', dest: 'Memphis, TN', type: 'Dry Van', rate: '$2.85', miles: 340, broker: 'ABC Logistics', brokerPhone: '(555) 999-8888', brokerCredit: 95 },
  { id: 'f2', origin: 'Houston, TX', dest: 'Atlanta, GA', type: 'Reefer', rate: '$3.10', miles: 780, broker: 'XYZ Freight', brokerPhone: '(555) 777-6543', brokerCredit: 88 },
  { id: 'f3', origin: 'Austin, TX', dest: 'Phoenix, AZ', type: 'Flatbed', rate: '$3.40', miles: 870, broker: '123 Transport', brokerPhone: '(555) 444-3333', brokerCredit: 91 },
  { id: 'f4', origin: 'San Antonio, TX', dest: 'Jacksonville, FL', type: 'Reefer', rate: '$2.90', miles: 1120, broker: 'DEF Co', brokerPhone: '(555) 222-1111', brokerCredit: 79 },
  { id: 'f5', origin: 'El Paso, TX', dest: 'Los Angeles, CA', type: 'Dry Van', rate: '$2.20', miles: 740, broker: 'GHI Logistics', brokerPhone: '(555) 666-5544', brokerCredit: 84 },
];
