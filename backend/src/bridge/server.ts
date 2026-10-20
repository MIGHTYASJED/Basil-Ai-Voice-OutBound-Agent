import { WebSocketServer, WebSocket } from 'ws';
import { pathToFileURL } from 'node:url';
import { prisma } from '../db.js';
import { config } from '../config.js';
import { phoneToGemini, geminiToPhone } from './audio.js';
import { GeminiLiveSession } from './gemini.js';
import { buildCallPrompt } from './prompt.js';
import { callBus } from '../telephony/bus.js';
import { toJson } from '../lib/json.js';
import { publish } from '../realtime/hub.js';
import type { AiOutcome, TranscriptTurn } from '../telephony/types.js';

// Media bridge used in LIVE mode. It runs INSIDE the API process (started from
// index.ts) because it reports results on the in-process callBus that the
// orchestrator listens to — a separate process would silently lose every
// transfer and outcome.
//
// Flow per call:
//   1. Carrier (Telnyx/Twilio) opens a media WebSocket when the driver answers:
//      wss://<bridge>/media?call_id=<id>
//   2. We open a Gemini Live session seeded with the agent's assembled prompt.
//   3. Inbound μ-law 8k frames → 16k PCM → Gemini.  Gemini 24k PCM → μ-law 8k → carrier.
//   4. Gemini function calls drive the outcome:
//        transfer_to_dispatcher → `transfer` event (driver parked, queued for a human)
//        end_call               → `outcome` event (DNC / callback / not interested …)
//        save_driver_info       → captured into the call note
//   5. If the carrier hangs up first, we report a `hung_up` outcome.
//
// IMPORTANT: this must run on always-on infrastructure (it holds an open
// socket for the whole call). Do not deploy on pure serverless.

type Live = {
  callId: string;
  gemini: GeminiLiveSession | null;
  transcript: TranscriptTurn[];
  driverInfo: string[];
  startedAt: number;
  carrier: WebSocket;
  streamId?: string;
  reported: boolean; // transfer/outcome already sent to the orchestrator
  finalized: boolean;
  timer?: NodeJS.Timeout;
};

let wss: WebSocketServer | null = null;

export function startMediaBridge(port = config.bridgePort) {
  if (wss) return wss;
  wss = new WebSocketServer({ port, path: '/media' });
  wss.on('connection', (carrier, req) => {
    onConnection(carrier, req.url ?? '').catch((err) => {
      console.error('[bridge] connection failed:', err);
      try { carrier.close(); } catch { /* ignore */ }
    });
  });
  console.log(`🎧 Media bridge listening on ws://localhost:${port}/media`);
  return wss;
}

async function onConnection(carrier: WebSocket, rawUrl: string) {
  const url = new URL(rawUrl, 'http://localhost');
  const callId = url.searchParams.get('call_id') ?? '';
  const call = await prisma.call.findUnique({ where: { id: callId }, include: { agent: true, driver: true, load: true } });
  if (!call) {
    console.warn(`[bridge] unknown call_id ${callId}; closing stream`);
    carrier.close();
    return;
  }

  const live: Live = { callId, gemini: null, transcript: [], driverInfo: [], startedAt: Date.now(), carrier, reported: false, finalized: false };
  const prompt = await buildCallPrompt(call);

  if (config.gemini.enabled) {
    live.gemini = new GeminiLiveSession(
      prompt,
      {
        onAudio: (b64) => sendToCarrier(live, geminiToPhone(Buffer.from(b64, 'base64'))),
        onInputTranscript: (text) => appendTurn(live, 'DRIVER', text),
        onOutputTranscript: (text) => appendTurn(live, 'BASIL', text),
        onInterrupted: () => clearCarrierAudio(live),
        onToolCall: (name, args, respond) => handleToolCall(live, name, args, respond),
        onClose: () => { /* carrier close drives finalization */ },
      },
      { voiceName: call.agent?.voiceId, temperature: call.agent?.temperature ?? 0.7 },
    );
    void live.gemini.connect();
  } else {
    console.warn('[bridge] GEMINI_API_KEY not set — live call has no AI voice');
  }

  carrier.on('message', (raw) => onCarrierMessage(live, raw));
  carrier.on('close', () => void finalize(live));
  carrier.on('error', () => void finalize(live));

  // Hard duration cap (cost runaway guard).
  const maxMs = (call.agent?.maxCallDurationSec ?? 300) * 1000;
  live.timer = setTimeout(() => {
    appendTurn(live, 'SYSTEM', 'Max call duration reached.');
    try { carrier.close(); } catch { /* ignore */ }
  }, maxMs);
}

function appendTurn(live: Live, speaker: string, text: string) {
  // Transcription arrives in fragments; merge consecutive fragments per speaker.
  const last = live.transcript.at(-1);
  if (last && last.speaker === speaker && elapsed(live) - last.t < 4) last.text = `${last.text}${text}`.replace(/\s+/g, ' ');
  else live.transcript.push({ speaker, text: text.trim(), t: elapsed(live) });
  publish('live-calls', 'transcript', { callId: live.callId, speaker, text, t: elapsed(live), append: !!last && last.speaker === speaker });
}

function onCarrierMessage(live: Live, raw: any) {
  let msg: any;
  try { msg = JSON.parse(raw.toString()); } catch { return; }
  // Telnyx + Twilio both use connected/start/media/stop with base64 payloads.
  switch (msg.event) {
    case 'start':
      live.streamId = msg.stream_id ?? msg.streamSid ?? msg.start?.streamSid;
      break;
    case 'media': {
      // Telnyx sends both tracks; only forward what the driver says.
      if (msg.media?.track && msg.media.track !== 'inbound') return;
      const payload = msg.media?.payload;
      if (!payload || !live.gemini) return;
      live.gemini.sendAudio(phoneToGemini(Buffer.from(payload, 'base64')));
      break;
    }
    case 'stop':
      void finalize(live);
      break;
  }
}

function sendToCarrier(live: Live, mulaw: Buffer) {
  if (live.carrier.readyState !== WebSocket.OPEN) return;
  // Twilio expects streamSid; Telnyx accepts stream_id.
  live.carrier.send(JSON.stringify({ event: 'media', stream_id: live.streamId, streamSid: live.streamId, media: { payload: mulaw.toString('base64') } }));
}

function clearCarrierAudio(live: Live) {
  // Barge-in: flush buffered outbound audio so the AI stops the instant the driver speaks.
  if (live.carrier.readyState === WebSocket.OPEN) {
    live.carrier.send(JSON.stringify({ event: 'clear', stream_id: live.streamId, streamSid: live.streamId }));
  }
}

function handleToolCall(live: Live, name: string, args: any, respond: (r: any) => void) {
  switch (name) {
    case 'save_driver_info': {
      const parts = Object.entries(args ?? {}).filter(([, v]) => v).map(([k, v]) => `${k.replace(/_/g, ' ')}: ${v}`);
      live.driverInfo.push(...parts);
      respond({ ok: true });
      break;
    }
    case 'transfer_to_dispatcher':
      respond({ ok: true, message: 'Tell the driver you are connecting them to a dispatcher now and to hold for a moment.' });
      if (!live.reported) {
        live.reported = true;
        callBus.emitEvent({
          type: 'transfer', callId: live.callId,
          reason: String(args?.reason ?? 'human_requested'), summary: String(args?.summary ?? 'Driver asked for a dispatcher.'),
          driverInfo: live.driverInfo, transcript: live.transcript, durationSec: elapsed(live),
        });
      }
      // Stop the AI leg's media; the carrier keeps the driver on hold.
      setTimeout(() => { live.gemini?.close(); live.gemini = null; }, 4000);
      break;
    case 'end_call': {
      respond({ ok: true });
      if (!live.reported) {
        live.reported = true;
        callBus.emitEvent({
          type: 'outcome', callId: live.callId, outcome: normalizeOutcome(args?.outcome),
          summary: args?.summary, callbackTime: args?.callback_time,
          driverInfo: live.driverInfo, transcript: live.transcript, durationSec: elapsed(live),
        });
      }
      // let the goodbye finish playing before hanging up
      setTimeout(() => { try { live.carrier.close(); } catch { /* ignore */ } }, 2500);
      break;
    }
    default:
      respond({ ok: false, error: `unknown tool ${name}` });
  }
}

function normalizeOutcome(o: any): AiOutcome {
  const allowed: AiOutcome[] = ['not_interested', 'callback_requested', 'booked', 'no_capacity', 'wrong_number', 'dnc_requested'];
  return allowed.includes(o) ? o : 'not_interested';
}

async function finalize(live: Live) {
  if (live.finalized) return;
  live.finalized = true;
  if (live.timer) clearTimeout(live.timer);
  live.gemini?.close();
  if (!live.reported) {
    live.reported = true;
    callBus.emitEvent({ type: 'outcome', callId: live.callId, outcome: 'hung_up', summary: 'Call ended without a clear outcome.', driverInfo: live.driverInfo, transcript: live.transcript, durationSec: elapsed(live) });
  }
  await prisma.callNote.upsert({
    where: { callId: live.callId },
    create: { callId: live.callId, transcript: toJson(live.transcript), driverInfo: toJson(live.driverInfo) },
    update: { transcript: toJson(live.transcript), driverInfo: toJson(live.driverInfo) },
  }).catch(() => {});
}

function elapsed(live: Live) {
  return Math.round((Date.now() - live.startedAt) / 1000);
}

// `npm run bridge` used to start this as its own process, which disconnects it
// from the orchestrator. Keep the script working but explain the change.
if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  console.log('ℹ️  The media bridge now starts automatically with the API (`npm run dev`) when TELEPHONY_MODE=live.');
  console.log('   Starting it standalone for audio debugging only — transfers/outcomes will NOT reach the orchestrator.');
  startMediaBridge();
}
