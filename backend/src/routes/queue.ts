import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '../db.js';
import { authGuard } from '../auth/routes.js';
import { getProvider } from '../telephony/registry.js';
import { publish } from '../realtime/hub.js';
import { fromJson } from '../lib/json.js';
import { refreshCampaignStats } from '../services/orchestrator.js';
import { config } from '../config.js';

export async function queueRoutes(app: FastifyInstance) {
  // Waiting + in-progress items. Also delivered live via the "dispatch-queue"
  // realtime channel, but this is the initial load / fallback.
  app.get('/queue', { preHandler: authGuard() }, async () => {
    const rows = await prisma.dispatchQueue.findMany({
      where: { status: { in: ['waiting', 'picking_up', 'connected'] } },
      include: { driver: true, call: { include: { note: true, load: true } } },
      orderBy: { enqueuedAt: 'asc' },
    });
    return rows.map(serialize);
  });

  // Recently finished items (handled or abandoned) for the "Recently handled" list.
  app.get('/queue/recent', { preHandler: authGuard() }, async () => {
    const rows = await prisma.dispatchQueue.findMany({
      where: { status: { in: ['completed', 'abandoned'] } },
      include: { call: true },
      orderBy: { completedAt: 'desc' },
      take: 10,
    });
    return rows.map((q: any) => ({
      id: q.id, name: q.driverName, by: q.lockedByName, status: q.status,
      outcome: q.call?.outcome, completedAt: q.completedAt,
    }));
  });

  // PICK UP — the heart of the transfer. Optimistic lock so only ONE
  // dispatcher can grab a given call; the loser gets a clean 409.
  app.post('/queue/:id/pickup', { preHandler: authGuard() }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const me = req.user as any;

    let dispatcher = await prisma.dispatcher.findUnique({ where: { userId: me.id } });
    if (!dispatcher) dispatcher = await prisma.dispatcher.create({ data: { userId: me.id } });
    const dispatcherName = me.name ?? 'Dispatcher';

    // Atomic claim: only succeeds if not already locked.
    const claim = await prisma.dispatchQueue.updateMany({
      where: { id, lockedById: null, status: 'waiting' },
      data: { lockedById: dispatcher.id, lockedByName: dispatcherName, status: 'picking_up', pickedUpAt: new Date() },
    });
    if (claim.count === 0) {
      return reply.code(409).send({ error: 'This call was just picked up by another dispatcher.' });
    }

    const item = await prisma.dispatchQueue.findUnique({ where: { id }, include: { call: true } });
    if (!item) return reply.code(404).send({ error: 'not found' });
    publish('dispatch-queue', 'locked', { id, by: dispatcherName });

    // Dial the dispatcher's phone (or signal their browser softphone), then
    // bridge that leg to the parked driver leg. In simulation this auto-answers.
    const provider = getProvider(item.call?.provider);
    const hasPhone = !!dispatcher.phoneNumber && dispatcher.phoneVerified && !dispatcher.useWebrtc;
    try {
      if (!hasPhone && !dispatcher.useWebrtc && config.telephonyMode === 'live') {
        throw new Error('set up your phone or browser softphone in Settings → My Connection first');
      }
      if (!hasPhone) {
        publish(`webrtc:${dispatcher.id}`, 'incoming', { queueId: id, driverName: item.driverName, parkedCallId: item.parkedProviderCallId });
      } else {
        const leg = await provider.dialDispatcher({ toNumber: dispatcher.phoneNumber, fromNumber: item.call?.fromNumber, callId: item.callId });
        if (item.parkedProviderCallId) {
          await provider.unhold(item.parkedProviderCallId).catch(() => {});
          await provider.bridge(item.parkedProviderCallId, leg.providerCallId);
        }
      }
    } catch (err: any) {
      // dispatcher didn't connect → release back to queue
      await prisma.dispatchQueue.update({ where: { id }, data: { lockedById: null, lockedByName: null, status: 'waiting', pickedUpAt: null } });
      publish('dispatch-queue', 'released', { id });
      return reply.code(502).send({ error: `Could not connect you (${err?.message ?? 'carrier error'}). The call is back in the queue.` });
    }

    await prisma.dispatchQueue.update({ where: { id }, data: { status: 'connected' } });
    await prisma.dispatcher.update({ where: { id: dispatcher.id }, data: { availability: 'busy' } });
    publish('dispatch-queue', 'connected', { id, by: dispatcherName });
    const full = await prisma.dispatchQueue.findUnique({ where: { id }, include: { driver: true, call: { include: { note: true, load: true } } } });
    return { ok: true, item: serialize(full) };
  });

  // Voluntarily release a claimed item back to the queue (only by its holder).
  app.post('/queue/:id/release', { preHandler: authGuard() }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const me = req.user as any;
    const dispatcher = await prisma.dispatcher.findUnique({ where: { userId: me.id } });
    const item = await prisma.dispatchQueue.findUnique({ where: { id } });
    if (!item) return reply.code(404).send({ error: 'not found' });
    if (item.lockedById && item.lockedById !== dispatcher?.id && me.role !== 'admin') {
      return reply.code(403).send({ error: 'Only the dispatcher handling this call can release it.' });
    }
    await prisma.dispatchQueue.update({ where: { id }, data: { lockedById: null, lockedByName: null, status: 'waiting', pickedUpAt: null } });
    publish('dispatch-queue', 'released', { id });
    return { ok: true };
  });

  // End the bridged call and record what happened.
  app.post('/queue/:id/end', { preHandler: authGuard() }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const body = z.object({
      outcome: z.enum(['booked', 'no_deal', 'callback', 'handled']).default('handled'),
      note: z.string().max(2000).optional(),
    }).parse(req.body ?? {});
    const item = await prisma.dispatchQueue.findUnique({ where: { id }, include: { call: true } });
    if (!item) return reply.code(404).send({ error: 'not found' });

    await prisma.dispatchQueue.update({ where: { id }, data: { status: 'completed', completedAt: new Date() } });
    if (item.parkedProviderCallId) await getProvider(item.call?.provider).hangup(item.parkedProviderCallId).catch(() => {});

    const callOutcome = body.outcome === 'booked' ? 'booked' : body.outcome === 'callback' ? 'callback' : body.outcome === 'no_deal' ? 'not_interested' : 'transferred';
    await prisma.call.update({ where: { id: item.callId }, data: { outcome: callOutcome } });
    if (item.driverId) {
      const statusCalled = body.outcome === 'booked' ? 'completed_booked' : body.outcome === 'callback' ? 'completed_callback' : 'completed_transferred';
      await prisma.driver.update({ where: { id: item.driverId }, data: { statusCalled } });
    }
    if (body.outcome === 'booked' && item.loadId && item.driverId) {
      await prisma.load.update({ where: { id: item.loadId }, data: { status: 'booked', bookedDriverId: item.driverId } });
    }
    await prisma.callNote.updateMany({
      where: { callId: item.callId },
      data: { dispatcherNote: body.note ?? null, dispatcherNoteBy: (req.user as any)?.name, outcome: callOutcome },
    });
    if (item.lockedById) {
      await prisma.dispatcher.updateMany({ where: { id: item.lockedById }, data: { availability: 'available' } });
    }
    await refreshCampaignStats(item.call?.campaignId ?? null);
    publish('dispatch-queue', 'completed', { id, outcome: body.outcome });
    publish('mission', 'call-update', { callId: item.callId, status: callOutcome });
    return { ok: true };
  });
}

function serialize(q: any) {
  const note = q.call?.note;
  const waitedSec = Math.floor((Date.now() - new Date(q.enqueuedAt).getTime()) / 1000);
  const load = q.call?.load;
  return {
    id: q.id, callId: q.callId, name: q.driverName, phone: q.driverPhone, email: q.driver?.email ?? '',
    type: q.truckType, loc: q.location, truck: q.driver?.truck ?? '—', waitedSec, status: q.status,
    lockedBy: q.lockedByName, lockedById: q.lockedById,
    note: q.aiSummary, transferReason: q.transferReason,
    driverInfo: note ? fromJson<string[]>(note.driverInfo, []) : [],
    transcript: note ? fromJson<any[]>(note.transcript, []) : [],
    load: q.loadRef ? { ref: q.loadRef, route: q.loadRoute, rate: q.loadRate, min: load?.minRate ? `$${load.minRate}` : '—' } : null,
  };
}
