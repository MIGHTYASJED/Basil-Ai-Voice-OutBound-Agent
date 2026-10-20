import { GoogleGenAI, Modality, Type, type FunctionDeclaration, type LiveConnectConfig, type Session } from '@google/genai';
import { config } from '../config.js';

// Gemini Live API client (@google/genai). Shared by the phone media bridge and
// the in-browser "Test Agent" socket so both behave identically.
// Streams 16 kHz PCM in, receives 24 kHz PCM out, plus input/output
// transcription and function calls.
//
// Tools: transfer_to_dispatcher, save_driver_info, end_call. The agent ACTS
// only through these. Note: 3.1 Flash Live runs tool calls sequentially — the
// model waits for our tool response, so respond() must always be called.

export const GEMINI_VOICES = ['Aoede', 'Charon', 'Fenrir', 'Kore', 'Puck', 'Zephyr'] as const;

// Legacy / ElevenLabs voice names → nearest Gemini Live voice.
const VOICE_MAP: Record<string, string> = {
  Josh: 'Puck', Adam: 'Charon', Bella: 'Kore', Rachel: 'Aoede', Elli: 'Fenrir', Sam: 'Zephyr',
  Antoni: 'Puck', Arnold: 'Charon', Domi: 'Kore', Emily: 'Aoede',
};

export function resolveVoice(name?: string | null): string {
  if (name && (GEMINI_VOICES as readonly string[]).includes(name)) return name;
  return (name && VOICE_MAP[name]) || 'Zephyr';
}

export const FUNCTION_DECLARATIONS: FunctionDeclaration[] = [
  {
    name: 'transfer_to_dispatcher',
    description: 'Transfer the live call to a human dispatcher when the driver wants to negotiate beyond your authority, wants to book, requests a human, asks a question outside your scope, or your instructions say to.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        reason: { type: Type.STRING, description: 'rate_negotiation | human_requested | complex_question | booking_confirmation' },
        summary: { type: Type.STRING, description: 'One-line synopsis of what the driver wants' },
      },
      required: ['reason', 'summary'],
    },
  },
  {
    name: 'save_driver_info',
    description: 'Record structured information the driver shares during the call. Call this whenever the driver provides new details.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        current_location: { type: Type.STRING },
        available_date: { type: Type.STRING },
        preferred_rate: { type: Type.STRING },
        equipment: { type: Type.STRING },
        notes: { type: Type.STRING },
      },
    },
  },
  {
    name: 'end_call',
    description: 'End the call with a final outcome. Use dnc_requested whenever the driver asks not to be called again.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        outcome: { type: Type.STRING, description: 'not_interested | callback_requested | booked | no_capacity | wrong_number | dnc_requested' },
        callback_time: { type: Type.STRING },
        summary: { type: Type.STRING, description: 'One-line summary of the call' },
      },
      required: ['outcome'],
    },
  },
];

export type GeminiHandlers = {
  onReady?: () => void;
  onAudio: (pcm24kBase64: string) => void;
  onInputTranscript: (text: string) => void;
  onOutputTranscript: (text: string) => void;
  onToolCall: (name: string, args: any, respond: (result: any) => void) => void;
  onInterrupted: () => void;
  onClose: (reason?: string) => void;
};

export interface GeminiConfig {
  voiceName?: string;
  temperature?: number;
  /** Text nudge so the agent speaks first (outbound calls open with the agent). */
  openingCue?: string;
}

export class GeminiLiveSession {
  private ai: GoogleGenAI;
  private session: Session | null = null;
  private ready = false;
  private closed = false;

  constructor(
    private systemInstruction: string,
    private handlers: GeminiHandlers,
    private sessionConfig: GeminiConfig = {},
  ) {
    this.ai = new GoogleGenAI({ apiKey: config.gemini.apiKey });
  }

  async connect() {
    const liveConfig: LiveConnectConfig = {
      responseModalities: [Modality.AUDIO],
      speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: resolveVoice(this.sessionConfig.voiceName) } } },
      temperature: this.sessionConfig.temperature ?? 0.7,
      inputAudioTranscription: {},
      outputAudioTranscription: {},
      systemInstruction: { parts: [{ text: this.systemInstruction }] },
      tools: [{ functionDeclarations: FUNCTION_DECLARATIONS }],
    };
    try {
      this.session = await this.ai.live.connect({
        model: config.gemini.model,
        config: liveConfig,
        callbacks: {
          onopen: () => {
            this.ready = true;
            this.handlers.onReady?.();
          },
          onmessage: (message: any) => {
            const content = message.serverContent;
            if (content?.interrupted) this.handlers.onInterrupted();
            if (content?.inputTranscription?.text) this.handlers.onInputTranscript(content.inputTranscription.text);
            if (content?.outputTranscription?.text) this.handlers.onOutputTranscript(content.outputTranscription.text);
            for (const part of content?.modelTurn?.parts ?? []) {
              if (part.inlineData?.data) this.handlers.onAudio(part.inlineData.data);
            }
            for (const fc of message.toolCall?.functionCalls ?? []) {
              let answered = false;
              const respond = (result: any) => {
                if (answered) return;
                answered = true;
                try {
                  this.session?.sendToolResponse({ functionResponses: [{ id: fc.id, name: fc.name, response: result }] });
                } catch (e) {
                  console.error('[gemini] tool response failed:', e);
                }
              };
              try {
                this.handlers.onToolCall(fc.name, fc.args ?? {}, respond);
              } catch (e) {
                console.error('[gemini] tool handler failed:', e);
                respond({ ok: false });
              }
            }
          },
          onclose: (e: any) => {
            this.ready = false;
            if (!this.closed) this.handlers.onClose(e?.reason);
            this.closed = true;
          },
          onerror: (err: any) => {
            console.error('[gemini] session error:', err?.message ?? err);
          },
        },
      });
      // Outbound call: the agent opens the conversation.
      this.session.sendClientContent({
        turns: [{ role: 'user', parts: [{ text: this.sessionConfig.openingCue ?? '(The driver just picked up the phone and said "Hello?")' }] }],
        turnComplete: true,
      });
    } catch (e: any) {
      console.error('[gemini] connect failed:', e?.message ?? e);
      this.closed = true;
      this.handlers.onClose(e?.message ?? 'connect failed');
    }
  }

  /** Stream a 16 kHz PCM chunk (raw bytes or base64) to Gemini. */
  sendAudio(pcm16k: Buffer | string) {
    if (!this.ready || !this.session) return;
    try {
      this.session.sendRealtimeInput({
        audio: { data: typeof pcm16k === 'string' ? pcm16k : pcm16k.toString('base64'), mimeType: 'audio/pcm;rate=16000' },
      });
    } catch (e) {
      console.error('[gemini] sendAudio failed:', e);
    }
  }

  close() {
    this.closed = true;
    try { this.session?.close(); } catch { /* ignore */ }
    this.session = null;
    this.ready = false;
  }
}
