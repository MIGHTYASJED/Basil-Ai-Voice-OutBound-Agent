import Fastify from 'fastify';
import cors from '@fastify/cors';
import jwt from '@fastify/jwt';
import multipart from '@fastify/multipart';
import websocket from '@fastify/websocket';
import { config } from './config.js';
import { authRoutes } from './auth/routes.js';
import { phoneRoutes } from './routes/phoneNumbers.js';
import { agentRoutes } from './routes/agents.js';
import { driverRoutes } from './routes/drivers.js';
import { loadRoutes } from './routes/loads.js';
import { campaignRoutes } from './routes/campaigns.js';
import { callRoutes } from './routes/calls.js';
import { queueRoutes } from './routes/queue.js';
import { dispatcherRoutes } from './routes/dispatchers.js';
import { missionRoutes } from './routes/mission.js';
import { analyticsRoutes } from './routes/analytics.js';
import { agentTestRoutes } from './routes/agentTest.js';
import { teamRoutes } from './routes/team.js';
import { registerClient } from './realtime/hub.js';
import { callBus } from './telephony/bus.js';
import { startOrchestrator } from './services/orchestrator.js';
import { startDialerLoop } from './services/dialer.js';
import { startMediaBridge } from './bridge/server.js';
import { ZodError } from 'zod';

const app = Fastify({ logger: false });

await app.register(cors, { origin: true, credentials: true });
await app.register(jwt, { secret: config.jwtSecret });
await app.register(multipart);
await app.register(websocket);

// Twilio posts webhooks as x-www-form-urlencoded, which Fastify doesn't parse by default.
app.addContentTypeParser('application/x-www-form-urlencoded', { parseAs: 'string' }, (_req, body, done) => {
  try { done(null, Object.fromEntries(new URLSearchParams(String(body)))); } catch (e: any) { done(e, undefined); }
});

// Validation errors are the client's fault → 400 with a readable message
// (previously every bad form submission surfaced as a generic 500).
app.setErrorHandler((err: any, _req, reply) => {
  if (err instanceof ZodError) {
    const first = err.issues[0];
    return reply.code(400).send({ error: first ? `${first.path.join('.') || 'input'}: ${first.message}` : 'Invalid input', issues: err.issues });
  }
  if (err?.statusCode && err.statusCode < 500) return reply.code(err.statusCode).send({ error: err.message });
  console.error('[api] unhandled error:', err);
  return reply.code(500).send({ error: err?.message ?? 'Internal error' });
});

// Health
app.get('/health', async () => ({ ok: true, mode: config.telephonyMode, gemini: config.gemini.enabled }));

// Realtime WebSocket — frontend subscribes to channels here.
app.register(async (instance) => {
  instance.get('/ws', { websocket: true }, (socket) => {
    registerClient(socket as any);
  });
});

// Provider webhooks (live mode). Normalize raw carrier events → callBus.
app.post('/webhooks/telnyx', async (req) => {
  const ev: any = (req.body as any)?.data;
  const eventType = ev?.event_type;
  let state: any = {};
  try {
    state = ev?.payload?.client_state ? JSON.parse(Buffer.from(ev.payload.client_state, 'base64').toString()) : {};
  } catch { /* foreign client_state */ }
  const callId = state.callId;
  if (!callId || state.leg === 'dispatcher') return { ok: true };
  const cause = String(ev?.payload?.hangup_cause ?? '');
  let out: any = null;
  switch (eventType) {
    case 'call.initiated': out = { type: 'initiated', callId, providerCallId: ev.payload.call_control_id }; break;
    case 'call.ringing': out = { type: 'ringing', callId }; break;
    case 'call.answered': out = { type: 'answered', callId, amd: 'unknown' }; break;
    case 'call.machine.premium.detection.ended':
    case 'call.machine.detection.ended': {
      const r = String(ev.payload?.result ?? '');
      if (r.includes('machine')) out = { type: 'answered', callId, amd: 'machine' };
      break;
    }
    case 'call.hangup':
      if (cause === 'timeout' || cause === 'no_answer' || cause === 'originator_cancel') out = { type: 'no_answer', callId };
      else if (cause === 'busy' || cause === 'user_busy') out = { type: 'busy', callId };
      else if (cause === 'call_rejected' || cause === 'unallocated_number') out = { type: 'failed', callId, reason: cause };
      else out = { type: 'hangup', callId, by: 'driver' };
      break;
  }
  if (out) callBus.emitEvent(out);
  return { ok: true };
});
app.post('/webhooks/twilio', async (req) => {
  const b: any = req.body ?? {};
  const q: any = req.query ?? {};
  const callId = q.callId ?? b.callId; // appended to the StatusCallback URL
  if (!callId) return { ok: true };
  const map: Record<string, any> = {
    initiated: { type: 'initiated', callId, providerCallId: b.CallSid },
    ringing: { type: 'ringing', callId },
    'in-progress': { type: 'answered', callId, amd: b.AnsweredBy?.startsWith('machine') ? 'machine' : 'human' },
    'no-answer': { type: 'no_answer', callId },
    busy: { type: 'busy', callId },
    failed: { type: 'failed', callId, reason: b.ErrorCode },
    completed: { type: 'hangup', callId, by: 'driver' },
  };
  if (map[b.CallStatus]) callBus.emitEvent(map[b.CallStatus]);
  return { ok: true };
});

// Mount all resource routes.
await app.register(authRoutes);
await app.register(phoneRoutes);
await app.register(agentRoutes);
await app.register(driverRoutes);
await app.register(loadRoutes);
await app.register(campaignRoutes);
await app.register(callRoutes);
await app.register(queueRoutes);
await app.register(dispatcherRoutes);
await app.register(missionRoutes);
await app.register(analyticsRoutes);
await app.register(agentTestRoutes);
await app.register(teamRoutes);

// Start the engines.
startOrchestrator();
startDialerLoop();
if (config.telephonyMode === 'live') startMediaBridge();

await app.listen({ port: config.port, host: '0.0.0.0' });
console.log(`🌿 Basil backend on http://localhost:${config.port}  (telephony: ${config.telephonyMode}, gemini: ${config.gemini.enabled ? 'live' : 'simulation'})`);
console.log(`   Realtime WS:  ${config.publicBaseUrl.replace('http', 'ws')}/ws`);
