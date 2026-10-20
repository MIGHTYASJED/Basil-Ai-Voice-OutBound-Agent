import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { parse } from 'csv-parse/sync';
import { prisma } from '../db.js';
import { authGuard } from '../auth/routes.js';
import { fromJson } from '../lib/json.js';

export async function driverRoutes(app: FastifyInstance) {
  app.get('/drivers', { preHandler: authGuard() }, async (req) => {
    const q = req.query as { status?: string; search?: string; truckType?: string };
    const where: any = {};
    if (q.status && q.status !== 'all') where.status = q.status;
    if (q.truckType) where.truckType = q.truckType;
    if (q.search) where.OR = [{ name: { contains: q.search } }, { phone: { contains: q.search } }];
    const rows = await prisma.driver.findMany({ where, orderBy: { createdAt: 'asc' } });
    return rows.map(serialize);
  });

  app.get('/drivers/:id', { preHandler: authGuard() }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const d = await prisma.driver.findUnique({ where: { id } });
    if (!d) return reply.code(404).send({ error: 'not found' });
    const calls = await prisma.call.findMany({ where: { driverId: id }, include: { note: true, agent: true, load: true }, orderBy: { createdAt: 'desc' }, take: 30 });
    return {
      ...serialize(d),
      history: calls.map((c) => ({
        time: c.createdAt, agent: c.agent?.name, load: c.load?.reference, dur: fmtDur(c.durationSec),
        outcome: c.outcome, summary: c.note?.aiSummary,
      })),
    };
  });

  app.post('/drivers', { preHandler: authGuard() }, async (req, reply) => {
    const body = driverSchema.parse(req.body);
    body.phone = normalizePhone(body.phone);
    if (await prisma.driver.findFirst({ where: { phone: body.phone } })) return reply.code(409).send({ error: 'A driver with this phone already exists.' });
    try {
      const d = await prisma.driver.create({ data: { ...body, statusCalled: 'pending' } });
      return reply.code(201).send(serialize(d));
    } catch {
      return reply.code(409).send({ error: 'A driver with this phone already exists.' });
    }
  });

  app.patch('/drivers/:id', { preHandler: authGuard() }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const body = driverSchema.partial().parse(req.body);
    if (!(await prisma.driver.findUnique({ where: { id } }))) return reply.code(404).send({ error: 'Driver not found' });
    const d = await prisma.driver.update({ where: { id }, data: body });
    return serialize(d);
  });

  app.post('/drivers/:id/dnc', { preHandler: authGuard() }, async (req, reply) => {
    const { id } = req.params as { id: string };
    if (!(await prisma.driver.findUnique({ where: { id } }))) return reply.code(404).send({ error: 'Driver not found' });
    await prisma.driver.update({ where: { id }, data: { status: 'dnc', statusCalled: 'completed_dnc' } });
    return { ok: true };
  });

  app.delete('/drivers/:id', { preHandler: authGuard(true) }, async (req) => {
    const { id } = req.params as { id: string };
    await prisma.driver.delete({ where: { id } });
    return { ok: true };
  });

  // CSV import: maps columns, injects status_called=pending on every row,
  // dedups by phone. Returns counts.
  app.post('/drivers/import', { preHandler: authGuard(true) }, async (req, reply) => {
    const body = z.object({ csv: z.string(), mapping: z.record(z.string()).optional() }).parse(req.body);
    let records: any[];
    try {
      records = parse(body.csv, { columns: true, skip_empty_lines: true, trim: true });
    } catch {
      return reply.code(400).send({ error: 'Could not parse CSV.' });
    }
    const m = body.mapping ?? {};
    let imported = 0, skipped = 0;
    for (const row of records) {
      const rawPhone = pickField(row, m, ['phone', 'phone_number', 'cell', 'mobile']);
      if (!rawPhone) { skipped++; continue; }
      const phone = normalizePhone(rawPhone);
      const data = {
        name: pickField(row, m, ['name', 'driver', 'driver_name']) ?? 'Unknown',
        phone,
        email: pickField(row, m, ['email']),
        truckType: pickField(row, m, ['truck_type', 'equipment', 'type']),
        locationCity: pickField(row, m, ['city', 'location_city', 'location']),
        locationState: pickField(row, m, ['state', 'location_state']),
        truck: pickField(row, m, ['truck', 'tractor']),
        mcNumber: pickField(row, m, ['mc', 'mc_number']),
        statusCalled: 'pending',
      };
      try {
        await prisma.driver.create({ data });
        imported++;
      } catch {
        skipped++; // duplicate phone
      }
    }
    return { imported, skipped, total: records.length };
  });
}

const driverSchema = z.object({
  name: z.string().min(1), phone: z.string().min(5), email: z.string().optional(),
  truckType: z.string().optional(), locationCity: z.string().optional(), locationState: z.string().optional(),
  truck: z.string().optional(), mcNumber: z.string().optional(), status: z.string().optional(),
  notes: z.string().optional(), rateExpectation: z.string().optional(),
});

function serialize(d: any) {
  return {
    id: d.id, name: d.name, phone: d.phone, email: d.email, type: d.truckType,
    loc: [d.locationCity, d.locationState].filter(Boolean).join(', '), truck: d.truck,
    status: cap(d.status), statusCalled: d.statusCalled, rating: d.reliability,
    last: d.lastCalledAt ? rel(d.lastCalledAt) : '—', notes: d.notes,
  };
}
function pickField(row: any, mapping: Record<string, string>, candidates: string[]): string | undefined {
  for (const [src, dest] of Object.entries(mapping)) {
    if (candidates.includes(dest) && row[src] != null && row[src] !== '') return String(row[src]);
  }
  for (const key of Object.keys(row)) {
    if (candidates.includes(key.toLowerCase().replace(/\s+/g, '_'))) {
      const v = row[key];
      if (v != null && v !== '') return String(v);
    }
  }
  return undefined;
}
function cap(s: string) { return s.charAt(0).toUpperCase() + s.slice(1); }
function fmtDur(sec: number) { if (!sec) return '—'; return `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`; }
function rel(d: Date) {
  const diff = Date.now() - new Date(d).getTime();
  const min = Math.floor(diff / 60000);
  if (min < 1) return 'just now';
  if (min < 60) return `${min} min ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr} hr ago`;
  return `${Math.floor(hr / 24)} d ago`;
}

/** US-centric E.164 normalization so "(214) 555-0101" and "+12145550101" dedupe. */
function normalizePhone(p: string): string {
  const digits = p.replace(/[^0-9+]/g, '');
  if (digits.startsWith('+')) return digits;
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`;
  return digits;
}
