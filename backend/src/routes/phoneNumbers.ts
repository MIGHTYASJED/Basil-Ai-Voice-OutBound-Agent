import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '../db.js';
import { authGuard } from '../auth/routes.js';
import { config } from '../config.js';

export async function phoneRoutes(app: FastifyInstance) {
  // Pool health: numbers vs agents, buffer, status counts.
  app.get('/phone-numbers/pool-health', { preHandler: authGuard() }, async () => {
    const [total, available, assigned, disabled, cooldown, activeAgents] = await Promise.all([
      prisma.phoneNumber.count(),
      prisma.phoneNumber.count({ where: { status: 'available' } }),
      prisma.phoneNumber.count({ where: { status: 'assigned' } }),
      prisma.phoneNumber.count({ where: { status: 'disabled' } }),
      prisma.phoneNumber.count({ where: { status: 'cooldown' } }),
      prisma.agent.count({ where: { status: { in: ['live', 'idle'] } } }),
    ]);
    const healthy = total > activeAgents;
    return { total, available, assigned, disabled, cooldown, activeAgents, buffer: available, healthy, cap: config.numberDailyCallCap };
  });

  app.get('/phone-numbers', { preHandler: authGuard() }, async () => {
    const rows = await prisma.phoneNumber.findMany({ include: { agent: true }, orderBy: { createdAt: 'asc' } });
    return rows.map((r) => ({
      id: r.id, number: r.e164, label: r.label, status: cap(r.status),
      assignedTo: r.agent?.name ?? null, provider: r.provider, area: r.areaCode,
      dailyCallCount: r.dailyCallCount,
    }));
  });

  // Add single or bulk.
  app.post('/phone-numbers', { preHandler: authGuard(true) }, async (req, reply) => {
    const body = z.object({
      numbers: z.array(z.object({
        e164: z.string().min(5), label: z.string().optional(),
        provider: z.string().default('telnyx'), areaCode: z.string().optional(),
      })).min(1),
    }).parse(req.body);

    const created = [];
    for (const n of body.numbers) {
      try {
        const row = await prisma.phoneNumber.create({ data: { e164: n.e164, label: n.label, provider: n.provider, areaCode: n.areaCode } });
        created.push(row);
      } catch { /* duplicate e164 — skip */ }
    }
    return reply.code(201).send({ created: created.length });
  });

  app.patch('/phone-numbers/:id', { preHandler: authGuard(true) }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const body = z.object({ label: z.string().optional(), disabled: z.boolean().optional() }).parse(req.body);
    const num = await prisma.phoneNumber.findUnique({ where: { id }, include: { agent: true } });
    if (!num) return reply.code(404).send({ error: 'not found' });

    if (body.disabled === true && num.agent) {
      return reply.code(409).send({ error: `This number is assigned to ${num.agent.name}. Unassign it first.` });
    }
    await prisma.phoneNumber.update({
      where: { id },
      data: {
        label: body.label ?? num.label,
        status: body.disabled === true ? 'disabled' : body.disabled === false ? 'available' : num.status,
      },
    });
    return { ok: true };
  });

  app.delete('/phone-numbers/:id', { preHandler: authGuard(true) }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const num = await prisma.phoneNumber.findUnique({ where: { id }, include: { agent: true } });
    if (!num) return reply.code(404).send({ error: 'not found' });
    if (num.agent) return reply.code(409).send({ error: `Assigned to ${num.agent.name}. Unassign before deleting.` });
    await prisma.phoneNumber.delete({ where: { id } });
    return { ok: true };
  });
}

function cap(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
