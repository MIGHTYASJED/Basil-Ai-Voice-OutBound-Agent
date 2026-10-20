import type { FastifyInstance } from 'fastify';
import { prisma } from '../db.js';
import { config } from '../config.js';
import { buildTestPrompt } from '../bridge/prompt.js';
import { GeminiLiveSession } from '../bridge/gemini.js';

// ─────────────────────────────────────────────────────────────────────────────
// "Talk to the agent" test endpoint.
//
// This is intentionally ISOLATED from the live call pipeline:
//   • It never touches the dialer, orchestrator, telephony provider, call
//     records, or the dispatch queue.
//   • It works in ANY telephony mode (simulation or live) — it only needs a
//     Gemini API key, because it connects your browser straight to Gemini Live.
//   • There is no carrier and no μ-law transcoding: the browser sends PCM
//     16 kHz and plays back Gemini's PCM 24 kHz directly.
//   • It uses the SAME Gemini client + prompt assembly as real calls, so what
//     you hear here is what drivers hear.
//
// Protocol (JSON frames over the socket):
//   browser → server: {type:'start', agentId?, token}  {type:'audio', data:<b64 pcm16>}  {type:'stop'}
//   server → browser: {type:'ready'} {type:'audio', data:<b64 pcm24>}
//                     {type:'transcript', role:'user'|'agent', text}
//                     {type:'tool', name, args} {type:'interrupted'} {type:'error',message} {type:'closed'}
// ─────────────────────────────────────────────────────────────────────────────

export async function agentTestRoutes(app: FastifyInstance) {
  app.register(async (instance) => {
    instance.get('/agent-test', { websocket: true }, (socket: any) => {
      let session: GeminiLiveSession | null = null;
      let started = false;

      const send = (obj: any) => {
        try { if (socket.readyState === 1) socket.send(JSON.stringify(obj)); } catch { /* ignore */ }
      };

      socket.on('message', async (raw: any) => {
        let msg: any;
        try { msg = JSON.parse(raw.toString()); } catch { return; }

        if (msg.type === 'start') {
          if (started) return;
          // Only signed-in users may spend Gemini credits.
          try {
            app.jwt.verify(String(msg.token ?? ''));
          } catch {
            send({ type: 'error', message: 'Please sign in again to test agents.' });
            return;
          }
          started = true;

          if (!config.gemini.enabled) {
            send({ type: 'error', message: 'Gemini API key not set. Add GEMINI_API_KEY to backend/.env and restart the backend to talk to the agent.' });
            return;
          }

          const agent = msg.agentId
            ? await prisma.agent.findUnique({ where: { id: msg.agentId } })
            : await prisma.agent.findFirst({});
          const prompt = await buildTestPrompt(agent);

          session = new GeminiLiveSession(prompt, {
            onReady: () => send({ type: 'ready' }),
            onAudio: (b64) => send({ type: 'audio', data: b64 }),
            onInputTranscript: (text) => send({ type: 'transcript', role: 'user', text }),
            onOutputTranscript: (text) => send({ type: 'transcript', role: 'agent', text }),
            onInterrupted: () => send({ type: 'interrupted' }),
            onToolCall: (name, args, respond) => {
              send({ type: 'tool', name, args });
              if (name === 'transfer_to_dispatcher') respond({ ok: true, message: '(test mode) Tell the driver a dispatcher is being connected.' });
              else respond({ ok: true });
            },
            onClose: (reason) => send({ type: 'closed', reason }),
          }, { voiceName: agent?.voiceId, temperature: agent?.temperature ?? 0.7 });
          await session.connect();
          return;
        }

        if (msg.type === 'audio' && session && msg.data) {
          session.sendAudio(String(msg.data));
          return;
        }

        if (msg.type === 'stop') {
          session?.close();
          session = null;
          send({ type: 'closed' });
        }
      });

      const cleanup = () => { session?.close(); session = null; };
      socket.on('close', cleanup);
      socket.on('error', cleanup);
    });
  });
}
