import { prisma } from '../db.js';
import { callBus } from '../telephony/bus.js';
import { getProvider } from '../telephony/registry.js';
import { releaseNumberLock } from '../telephony/numberLock.js';
import { publish } from '../realtime/hub.js';
import { config } from '../config.js';
import { toJson, fromJson } from '../lib/json.js';
import { simulateConversation } from '../bridge/conversation.js';
import { workspaceCompany } from '../bridge/prompt.js';
import type { TelephonyEvent, AiOutcome, TranscriptTurn } from '../telephony/types.js';

// Subscribes to telephony events and walks each call through the state machine:
// dialing → ringing → answered → (ai_talking) → outcome → completed, plus
// no_answer/busy/failed/voicemail and transfer → dispatcher queue.
//
// This module is the single place that mutates call/driver/campaign state in
// response to what happens on the wire, so the DB always reflects reality.
// The same code path serves simulation (scripted conversation) and live mode
// (the media bridge reports `transfer` / `outcome` events from Gemini).

const TERMINAL = ['completed', 'failed', 'transferred'];
let started = false;

export function startOrchestrator() {
  if (started) return;
  started = true;
  callBus.onEvent((ev) => {
    handleEvent(ev).catch((err) => console.error('[orchestrator] event failed:', ev.type, err));
  });
  // Drivers parked in the dispatcher queue must not wait forever.
  setInterval(() => void expireParkedCalls(), 10_000);
}

async function handleEvent(ev: TelephonyEvent) {
  const call = await prisma.call.findUnique({
    where: { id: ev.callId },
    include: { agent: true, driver: true, load: true, campaign: true },
  });
  if (!call) return;
  // Carriers re-deliver webhooks and AMD fires a second "answered"; once a call
  // is finished, later events must not change it (or double-count stats).
  if (TERMINAL.includes(call.status) && ev.type !== 'bridged') return;

  switch (ev.type) {
    case 'initiated':
      await prisma.call.update({ where: { id: call.id }, data: { providerCallId: ev.providerCallId, status: 'dialing', startedAt: new Date() } });
      pushCallUpdate(call, 'dialing');
      break;

    case 'ringing':
      if (call.status === 'ai_talking') break;
      await prisma.call.update({ where: { id: call.id }, data: { status: 'ringing' } });
      pushCallUpdate(call, 'ringing');
      break;

    case 'answered':
      if (ev.amd === 'machine') {
        await finalizeCall(call, { status: 'completed', outcome: 'no_answer', statusCalled: 'completed_no_answer', summary: 'Reached voicemail. Will retry later.' });
        // don't leave a robot talking to a voicemail box
        if (call.providerCallId) await getProvider(call.provider).hangup(call.providerCallId).catch(() => {});
      } else if (call.status !== 'ai_talking') {
        await prisma.call.update({ where: { id: call.id }, data: { status: 'ai_talking', answeredAt: new Date(), amdResult: ev.amd } });
        pushCallUpdate(call, 'ai_talking');
        // In simulation mode we drive the conversation here. In live mode the
        // media bridge runs Gemini and reports `transfer` / `outcome` events.
        if (config.telephonyMode === 'simulation') {
          void runSimulatedConversation(call).catch((err) => console.error('[orchestrator] sim conversation failed:', err));
        }
      }
      break;

    case 'no_answer':
      await finalizeCall(call, { status: 'completed', outcome: 'no_answer', statusCalled: 'completed_no_answer', summary: 'No answer after ring timeout.' });
      break;

    case 'busy':
      await finalizeCall(call, { status: 'completed', outcome: 'no_answer', statusCalled: 'completed_no_answer', summary: 'Line busy.' });
      break;

    case 'failed':
      await finalizeCall(call, { status: 'failed', outcome: 'failed', statusCalled: 'failed', summary: `Call failed: ${ev.reason ?? 'unknown'}` });
      break;

    case 'transfer':
      await transferToQueue(call, {
        reason: ev.reason, summary: ev.summary, driverInfo: ev.driverInfo,
        transcript: ev.transcript, sentiment: 'Neutral-Positive', durationSec: ev.durationSec,
      });
      break;

    case 'outcome':
      await applyAiOutcome(call, ev.outcome, ev);
      break;

    case 'hangup':
      if (call.status === 'ai_talking' && config.telephonyMode === 'live') {
        // The bridge reports the real outcome when its socket closes; give it a
        // moment so we don't overwrite a real result with a generic one.
        setTimeout(() => void lateHangup(call.id), 5000);
      } else if (['queued', 'dialing', 'ringing', 'ai_talking'].includes(call.status)) {
        await finalizeCall(call, { status: 'completed', outcome: 'no_answer', statusCalled: 'completed_no_answer', summary: 'Call ended before the conversation started.' });
      }
      break;
  }
}

async function lateHangup(callId: string) {
  const call = await prisma.call.findUnique({ where: { id: callId } });
  if (!call || TERMINAL.includes(call.status)) return;
  await finalizeCall(call, { status: 'completed', outcome: 'not_interested', statusCalled: 'completed_not_interested', summary: 'Driver hung up.' });
}

// Map the AI's end_call outcome onto call + driver state.
async function applyAiOutcome(call: any, outcome: AiOutcome, ev: { summary?: string; callbackTime?: string; driverInfo: string[]; transcript: TranscriptTurn[]; durationSec: number }) {
  const extra = { durationSec: ev.durationSec, transcript: ev.transcript, driverInfo: ev.driverInfo, connected: true };
  switch (outcome) {
    case 'dnc_requested':
      await finalizeCall(call, { status: 'completed', outcome: 'dnc', statusCalled: 'completed_dnc', summary: ev.summary ?? 'Driver asked not to be called again. Added to Do-Not-Call.', ...extra });
      if (call.driverId) await prisma.driver.update({ where: { id: call.driverId }, data: { status: 'dnc' } });
      break;
    case 'wrong_number':
      await finalizeCall(call, { status: 'completed', outcome: 'wrong_number', statusCalled: 'completed_wrong_number', summary: ev.summary ?? 'Wrong number.', ...extra });
      if (call.driverId) await prisma.driver.update({ where: { id: call.driverId }, data: { status: 'inactive' } });
      break;
    case 'callback_requested':
      await finalizeCall(call, { status: 'completed', outcome: 'callback', statusCalled: 'completed_callback', summary: ev.summary ?? `Driver asked for a callback${ev.callbackTime ? ` (${ev.callbackTime})` : ''}.`, ...extra });
      break;
    case 'booked':
      // Product rule: the AI doesn't book on its own — treat as a hot lead and transfer.
      await transferToQueue(call, { reason: 'booking_confirmation', summary: ev.summary ?? 'Driver wants to book — needs a dispatcher to confirm.', driverInfo: ev.driverInfo, transcript: ev.transcript, sentiment: 'Positive', durationSec: ev.durationSec });
      break;
    case 'hung_up':
    case 'no_capacity':
    case 'not_interested':
    default:
      await finalizeCall(call, { status: 'completed', outcome: 'not_interested', statusCalled: 'completed_not_interested', summary: ev.summary ?? 'Driver not interested.', ...extra });
  }
}

async function runSimulatedConversation(call: any) {
  const durationMs = 1500 + Math.floor(Math.random() * 4000);
  const convo = simulateConversation({
    companyName: await workspaceCompany(),
    agentName: call.agent?.name ?? 'Basil',
    driverName: call.driver?.name ?? 'Driver',
    driverFirst: (call.driver?.name ?? 'Driver').split(' ')[0],
    loadRef: call.load?.reference ?? '#0000',
    origin: call.load ? `${call.load.originCity}, ${call.load.originState}` : 'Dallas, TX',
    dest: call.load ? `${call.load.destCity}, ${call.load.destState}` : 'Memphis, TN',
    rate: call.load ? `$${Math.round(call.load.rateTotal).toLocaleString()}` : '$969',
    perMile: call.load?.ratePerMile ? `$${call.load.ratePerMile.toFixed(2)}` : '$2.85',
  });

  publish('live-calls', 'transcript-start', { callId: call.id, agent: call.agent?.name, driver: call.driver?.name });
  // Stream the turns out as the "conversation" plays so Listen-in shows it live.
  const step = durationMs / Math.max(convo.transcript.length, 1);
  for (const turn of convo.transcript) {
    await new Promise((r) => setTimeout(r, step));
    const still = await prisma.call.findUnique({ where: { id: call.id } });
    if (!still || TERMINAL.includes(still.status)) return; // ended by a supervisor
    publish('live-calls', 'transcript', { callId: call.id, speaker: turn.speaker, text: turn.text, t: turn.t });
  }

  // The campaign may have been paused or the call closed meanwhile.
  const fresh = await prisma.call.findUnique({ where: { id: call.id } });
  if (!fresh || TERMINAL.includes(fresh.status)) return;

  const durationSec = Math.max(convo.transcript.at(-1)?.t ?? 0, Math.round(durationMs / 1000)) + 5;

  if (convo.outcome === 'transferred') {
    await transferToQueue(call, {
      reason: convo.transfer?.reason ?? 'rate_negotiation', summary: convo.aiSummary,
      driverInfo: convo.driverInfo, transcript: convo.transcript, sentiment: convo.sentiment,
      durationSec: 35 + Math.floor(Math.random() * 30),
    });
    return;
  }

  const statusCalled = convo.outcome === 'callback' ? 'completed_callback' : 'completed_not_interested';
  await finalizeCall(call, {
    status: 'completed', outcome: convo.outcome, statusCalled, summary: convo.aiSummary,
    durationSec, transcript: convo.transcript, driverInfo: convo.driverInfo, sentiment: convo.sentiment, connected: true,
  });
}

async function transferToQueue(call: any, t: { reason: string; summary: string; driverInfo: string[]; transcript: TranscriptTurn[]; sentiment: string; durationSec: number }) {
  // Re-read to pick up providerCallId and avoid double-enqueueing.
  const existing = await prisma.dispatchQueue.findUnique({ where: { callId: call.id } });
  if (existing) return;
  const fresh = (await prisma.call.findUnique({ where: { id: call.id }, include: { driver: true, load: true } })) ?? call;

  await prisma.call.update({
    where: { id: call.id },
    data: { status: 'transferred', outcome: 'transferred', durationSec: t.durationSec, sentiment: t.sentiment, endedAt: new Date(), cost: estimateCost(t.durationSec) },
  });
  await saveNote(call, { summary: t.summary, driverInfo: t.driverInfo, transcript: t.transcript, outcome: 'transferred', sentiment: t.sentiment });

  if (call.driverId) {
    await prisma.driver.update({ where: { id: call.driverId }, data: { statusCalled: 'completed_transferred', lastCalledAt: new Date() } });
  }

  // Keep the driver's leg alive on hold while a human is found.
  if (fresh.providerCallId) await getProvider(call.provider).hold(fresh.providerCallId).catch(() => {});

  const load = fresh.load;
  const loadRoute = load ? `${load.originCity} ${load.originState} → ${load.destCity} ${load.destState}` : undefined;
  const loadRate = load ? `$${Math.round(load.rateTotal).toLocaleString()} ($${load.ratePerMile?.toFixed(2) ?? '—'}/mi)` : undefined;
  const driver = fresh.driver;

  const item = await prisma.dispatchQueue.create({
    data: {
      callId: call.id,
      driverId: call.driverId,
      driverPhone: driver?.phone ?? call.toNumber ?? '',
      driverName: driver?.name ?? 'Unknown Driver',
      truckType: driver?.truckType,
      location: driver ? [driver.locationCity, driver.locationState].filter(Boolean).join(', ') : undefined,
      loadId: call.loadId,
      loadRef: load?.reference,
      loadRoute,
      loadRate,
      aiSummary: t.summary,
      transferReason: t.reason,
      parkedProviderCallId: fresh.providerCallId,
      status: 'waiting',
    },
  });

  await afterCallEnded(call, { connected: true });
  publish('dispatch-queue', 'enqueued', { id: item.id, name: item.driverName });
  pushCallUpdate(call, 'transferred');
}

type Finalize = {
  status: string; outcome: string; statusCalled: string; summary: string;
  durationSec?: number; transcript?: TranscriptTurn[]; driverInfo?: string[]; sentiment?: string; connected?: boolean;
};

async function finalizeCall(call: any, f: Finalize) {
  const durationSec = f.durationSec ?? 0;
  await prisma.call.update({
    where: { id: call.id },
    data: { status: f.status, outcome: f.outcome, durationSec, sentiment: f.sentiment, endedAt: new Date(), cost: estimateCost(durationSec) },
  });
  await saveNote(call, { summary: f.summary, driverInfo: f.driverInfo ?? [], transcript: f.transcript ?? [], outcome: f.outcome, sentiment: f.sentiment });

  if (call.driverId) {
    await prisma.driver.update({ where: { id: call.driverId }, data: { statusCalled: f.statusCalled, lastCalledAt: new Date() } });
  }
  await afterCallEnded(call, { connected: f.connected });
  pushCallUpdate(call, f.status);
}

async function saveNote(call: any, n: { summary: string; driverInfo: string[]; transcript: TranscriptTurn[]; outcome: string; sentiment?: string }) {
  // Don't wipe a transcript the media bridge already saved with an empty one.
  const prev = await prisma.callNote.findUnique({ where: { callId: call.id } });
  const transcript = n.transcript.length ? n.transcript : fromJson<TranscriptTurn[]>(prev?.transcript, []);
  const driverInfo = n.driverInfo.length ? n.driverInfo : fromJson<string[]>(prev?.driverInfo, []);
  await prisma.callNote.upsert({
    where: { callId: call.id },
    create: {
      callId: call.id, driverId: call.driverId, loadId: call.loadId, aiSummary: n.summary,
      driverInfo: toJson(driverInfo), transcript: toJson(transcript), outcome: n.outcome, sentiment: n.sentiment,
    },
    update: { aiSummary: n.summary, driverInfo: toJson(driverInfo), transcript: toJson(transcript), outcome: n.outcome, sentiment: n.sentiment },
  });
}

/** Shared bookkeeping once a call stops using its agent + number. */
async function afterCallEnded(call: any, d: { connected?: boolean }) {
  releaseNumberLock(call.numberId ?? '');
  if (call.agentId) {
    const stillBusy = await prisma.call.count({ where: { agentId: call.agentId, status: { in: ['queued', 'dialing', 'ringing', 'ai_talking'] } } });
    const agent = await prisma.agent.findUnique({ where: { id: call.agentId } });
    if (agent && agent.status === 'live' && stillBusy === 0) {
      await prisma.agent.update({ where: { id: agent.id }, data: { status: 'idle' } });
      publish('agent-status', 'updated', { id: agent.id, status: 'idle' });
    }
  }
  await refreshCampaignStats(call.campaignId);
}

/** Recompute campaign counters from the call table (idempotent, never drifts). */
export async function refreshCampaignStats(campaignId: string | null) {
  if (!campaignId) return;
  const calls = await prisma.call.findMany({ where: { campaignId } });
  const drivers = new Set(calls.filter((c: any) => c.endedAt).map((c: any) => c.driverId));
  const connected = new Set(calls.filter((c: any) => c.answeredAt).map((c: any) => c.driverId));
  const booked = calls.filter((c: any) => c.outcome === 'booked').length;
  await prisma.campaign.update({
    where: { id: campaignId },
    data: { driversCalled: drivers.size, connectedCount: connected.size, bookedCount: booked },
  });
  publish(`campaign:${campaignId}`, 'progress', { id: campaignId, driversCalled: drivers.size });
}

/** Drivers on hold longer than MAX_PARK_SECONDS get released with a callback. */
async function expireParkedCalls() {
  try {
    const cutoff = new Date(Date.now() - config.maxParkSeconds * 1000);
    const stale = await prisma.dispatchQueue.findMany({ where: { status: 'waiting', enqueuedAt: { lt: cutoff } }, include: { call: true } });
    for (const item of stale) {
      await prisma.dispatchQueue.update({ where: { id: item.id }, data: { status: 'abandoned', completedAt: new Date() } });
      if (item.parkedProviderCallId) await getProvider(item.call?.provider).hangup(item.parkedProviderCallId).catch(() => {});
      if (item.driverId) await prisma.driver.update({ where: { id: item.driverId }, data: { statusCalled: 'completed_callback' } });
      await prisma.callNote.updateMany({
        where: { callId: item.callId },
        data: { dispatcherNote: `No dispatcher picked up within ${Math.round(config.maxParkSeconds / 60)} min — driver released, flagged for callback.` },
      });
      publish('dispatch-queue', 'abandoned', { id: item.id, name: item.driverName });
    }
  } catch (err) {
    console.error('[orchestrator] park expiry failed:', err);
  }
}

function estimateCost(durationSec: number): number {
  // ~$0.13/min blended (carrier + AI) — rough, for the analytics view.
  return Number(((durationSec / 60) * 0.13).toFixed(4));
}

function pushCallUpdate(call: any, status: string) {
  const payload = { callId: call.id, status, agent: call.agent?.name, driver: call.driver?.name, load: call.load?.reference };
  publish('live-calls', 'call-update', payload);
  publish('mission', 'call-update', payload);
}
