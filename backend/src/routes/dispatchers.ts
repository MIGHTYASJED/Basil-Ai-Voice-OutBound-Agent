import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '../db.js';
import { authGuard } from '../auth/routes.js';
import { publish } from '../realtime/hub.js';

// Dispatcher number setup + availability. A dispatcher receives transferred
// calls either on their verified phone number (system dials it and bridges)
// or via an in-browser WebRTC softphone.

export async function dispatcherRoutes(app: FastifyInstance) {
  app.get('/dispatchers/me', { preHandler: authGuard() }, async (req) => {
    const me = req.user as any;
    let d = await prisma.dispatcher.findUnique({ where: { userId: me.id } });
    if (!d) d = await prisma.dispatcher.create({ data: { userId: me.id } });
    return { id: d.id, phoneNumber: d.phoneNumber, phoneVerified: d.phoneVerified, useWebrtc: d.useWebrtc, availability: d.availability };
  });

  // Begin phone verification (in production: send an SMS/voice OTP).
  app.post('/dispatchers/phone/start', { preHandler: authGuard() }, async (req) => {
    const me = req.user as any;
    const body = z.object({ phoneNumber: z.string().min(7) }).parse(req.body);
    await prisma.dispatcher.upsert({
      where: { userId: me.id },
      create: { userId: me.id, phoneNumber: body.phoneNumber, phoneVerified: false },
      update: { phoneNumber: body.phoneNumber, phoneVerified: false },
    });
    // Simulation: code is always 123456. Live: dispatch a real OTP here.
    return { ok: true, devCode: '123456' };
  });

  app.post('/dispatchers/phone/verify', { preHandler: authGuard() }, async (req, reply) => {
    const me = req.user as any;
    const body = z.object({ code: z.string() }).parse(req.body);
    if (body.code !== '123456') return reply.code(400).send({ error: 'Invalid verification code.' });
    await prisma.dispatcher.update({ where: { userId: me.id }, data: { phoneVerified: true, useWebrtc: false } });
    return { ok: true };
  });

  app.post('/dispatchers/use-webrtc', { preHandler: authGuard() }, async (req) => {
    const me = req.user as any;
    const body = z.object({ enabled: z.boolean() }).parse(req.body);
    await prisma.dispatcher.upsert({
      where: { userId: me.id },
      create: { userId: me.id, useWebrtc: body.enabled },
      update: { useWebrtc: body.enabled },
    });
    return { ok: true };
  });

  app.post('/dispatchers/availability', { preHandler: authGuard() }, async (req) => {
    const me = req.user as any;
    const body = z.object({ availability: z.enum(['available', 'busy', 'offline']) }).parse(req.body);
    const d = await prisma.dispatcher.upsert({
      where: { userId: me.id },
      create: { userId: me.id, availability: body.availability },
      update: { availability: body.availability },
    });
    publish('agent-status', 'dispatcher-availability', { id: d.id, availability: body.availability });
    return { ok: true };
  });
}
