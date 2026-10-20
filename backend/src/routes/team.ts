import type { FastifyInstance } from 'fastify';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { randomBytes } from 'node:crypto';
import { prisma } from '../db.js';
import { authGuard } from '../auth/routes.js';
import { config } from '../config.js';

// Team management (admin only) + workspace status for the Settings page.
export async function teamRoutes(app: FastifyInstance) {
  app.get('/team', { preHandler: authGuard(true) }, async () => {
    const users = await prisma.user.findMany({ orderBy: { createdAt: 'asc' } });
    const dispatchers = await prisma.dispatcher.findMany({});
    return users.map((u) => {
      const d = dispatchers.find((x) => x.userId === u.id);
      return { id: u.id, name: u.name, email: u.email, role: u.role, availability: d?.availability ?? null, phoneVerified: d?.phoneVerified ?? false };
    });
  });

  // Admin adds a teammate and gets a one-time temporary password to hand over.
  app.post('/team', { preHandler: authGuard(true) }, async (req, reply) => {
    const body = z.object({ name: z.string().min(2), email: z.string().email(), role: z.enum(['admin', 'dispatcher']).default('dispatcher') }).parse(req.body);
    const email = body.email.trim().toLowerCase();
    if (await prisma.user.findUnique({ where: { email } })) return reply.code(409).send({ error: 'That email already has an account.' });
    const tempPassword = randomBytes(6).toString('base64url');
    const me = req.user as any;
    const admin = await prisma.user.findUnique({ where: { id: me.id } });
    const user = await prisma.user.create({ data: { name: body.name, email, role: body.role, company: admin?.company, password: await bcrypt.hash(tempPassword, 10) } });
    if (body.role === 'dispatcher') await prisma.dispatcher.create({ data: { userId: user.id } });
    return reply.code(201).send({ id: user.id, email, tempPassword });
  });

  app.delete('/team/:id', { preHandler: authGuard(true) }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const me = req.user as any;
    if (id === me.id) return reply.code(400).send({ error: "You can't remove yourself." });
    await prisma.dispatcher.deleteMany({ where: { userId: id } });
    await prisma.user.delete({ where: { id } });
    return { ok: true };
  });

  // What's actually configured — never returns secret values.
  app.get('/workspace/status', { preHandler: authGuard() }, async () => {
    const since = new Date();
    since.setDate(1);
    since.setHours(0, 0, 0, 0);
    const calls = await prisma.call.findMany({ where: { createdAt: { gte: since } } });
    const minutes = Math.round(calls.reduce((s, c) => s + (c.durationSec ?? 0), 0) / 60);
    const cost = Number(calls.reduce((s, c) => s + (c.cost ?? 0), 0).toFixed(2));
    return {
      telephonyMode: config.telephonyMode,
      integrations: {
        gemini: { configured: config.gemini.enabled, model: config.gemini.model },
        telnyx: { configured: config.telnyx.enabled },
        twilio: { configured: config.twilio.enabled },
        vapi: { configured: config.vapi.enabled },
        dat: { configured: config.dat.enabled },
      },
      webhooks: { telnyx: `${config.publicBaseUrl}/webhooks/telnyx`, twilio: `${config.publicBaseUrl}/webhooks/twilio`, mediaBridge: `${config.publicBridgeWsUrl}/media` },
      limits: { numberDailyCallCap: config.numberDailyCallCap, maxParkSeconds: config.maxParkSeconds, callingHours: '08:00–21:00 driver local time (enforced in live mode)' },
      usageThisMonth: { calls: calls.length, minutes, estimatedCostUsd: cost },
    };
  });
}
