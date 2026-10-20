// Quick Gemini Live connectivity check. Reads the key from backend/.env —
// never hard-code API keys in source files.
//   node --env-file=.env test_api.mjs
import { GoogleGenAI, Modality } from '@google/genai';

const apiKey = process.env.GEMINI_API_KEY;
if (!apiKey) {
  console.error('Set GEMINI_API_KEY in backend/.env first.');
  process.exit(1);
}
const model = (process.env.GEMINI_MODEL || 'gemini-3.1-flash-live-preview').replace(/^models\//, '');
const ai = new GoogleGenAI({ apiKey });
console.log(`Connecting to ${model}...`);
const timer = setTimeout(() => { console.error('Timed out waiting for audio.'); process.exit(1); }, 20000);
const session = await ai.live.connect({
  model,
  config: { responseModalities: [Modality.AUDIO], speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Puck' } } } },
  callbacks: {
    onopen: () => console.log('Socket open.'),
    onmessage: (m) => {
      if (m.serverContent?.modelTurn?.parts?.some((p) => p.inlineData?.data)) {
        console.log('✅ Received audio from Gemini — the key and model work.');
        clearTimeout(timer);
        session.close();
        process.exit(0);
      }
    },
    onerror: (e) => { console.error('❌ Gemini error:', e?.message ?? e); process.exit(1); },
    onclose: (e) => console.log('Closed:', e?.reason ?? ''),
  },
});
session.sendClientContent({ turns: [{ role: 'user', parts: [{ text: 'Say hello in five words.' }] }], turnComplete: true });
