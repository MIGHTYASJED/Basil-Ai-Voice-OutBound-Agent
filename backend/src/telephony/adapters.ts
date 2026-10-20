import type { TelephonyProvider, PlaceCallParams } from './types.js';
import { config } from '../config.js';

// Twilio fallback. Functionally equivalent to Telnyx for our needs: Media
// Streams over WebSocket + Call Control. Audio frames arrive as μ-law 8kHz
// base64 in the media bridge, same as Telnyx (the bridge handles framing
// differences). TwiML <Connect><Stream> points at our bridge.
export class TwilioProvider implements TelephonyProvider {
  readonly name = 'twilio';
  private auth = 'Basic ' + Buffer.from(`${config.twilio.accountSid}:${config.twilio.authToken}`).toString('base64');
  private base = `https://api.twilio.com/2010-04-01/Accounts/${config.twilio.accountSid}`;

  async placeCall(params: PlaceCallParams): Promise<{ providerCallId: string }> {
    const twiml = `<?xml version="1.0" encoding="UTF-8"?><Response><Connect><Stream url="${params.mediaStreamUrl}"/></Connect></Response>`;
    const body = new URLSearchParams({
      To: params.toNumber,
      From: params.fromNumber,
      Twiml: twiml,
      Timeout: String(params.timeoutSeconds),
      MachineDetection: params.amdEnabled ? 'Enable' : 'none',
      StatusCallback: `${config.publicBaseUrl}/webhooks/twilio?callId=${encodeURIComponent(params.callId)}`,
      StatusCallbackMethod: 'POST',
    });
    body.append('StatusCallbackEvent', 'initiated');
    body.append('StatusCallbackEvent', 'ringing');
    body.append('StatusCallbackEvent', 'answered');
    body.append('StatusCallbackEvent', 'completed');
    const res = await fetch(`${this.base}/Calls.json`, {
      method: 'POST',
      headers: { Authorization: this.auth, 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
    });
    const json: any = await res.json();
    if (!res.ok) throw new Error(`Twilio call failed: ${res.status} ${json?.message ?? ''}`);
    return { providerCallId: json.sid ?? '' };
  }

  async hangup(id: string): Promise<void> {
    await fetch(`${this.base}/Calls/${id}.json`, {
      method: 'POST',
      headers: { Authorization: this.auth, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ Status: 'completed' }),
    });
  }
  async hold(): Promise<void> {/* redirect to <Play loop> hold TwiML */}
  async unhold(): Promise<void> {/* redirect back */}
  async bridge(): Promise<void> {/* conference bridge via TwiML */}
  async startRecording(id: string): Promise<void> {
    await fetch(`${this.base}/Calls/${id}/Recordings.json`, {
      method: 'POST',
      headers: { Authorization: this.auth },
    });
  }
  async dialDispatcher(params: { toNumber: string; fromNumber?: string; callId: string }): Promise<{ providerCallId: string }> {
    // Caller ID must be a number we own (the agent's pool number), never the dispatcher's own phone.
    if (!params.toNumber) throw new Error('Dispatcher has no verified phone number');
    if (!params.fromNumber) throw new Error('No pool number available as caller ID');
    const body = new URLSearchParams({
      To: params.toNumber, From: params.fromNumber, Timeout: '30',
      Twiml: '<?xml version="1.0" encoding="UTF-8"?><Response><Say>Transferred driver call from Basil.</Say><Pause length="60"/></Response>',
    });
    const res = await fetch(`${this.base}/Calls.json`, {
      method: 'POST',
      headers: { Authorization: this.auth, 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
    });
    const json: any = await res.json();
    if (!res.ok) throw new Error(`Twilio dispatcher dial failed: ${res.status}`);
    return { providerCallId: json.sid ?? '' };
  }
}

// Vapi is opinionated — it wants to OWN the AI pipeline (STT→LLM→TTS or a
// realtime model) rather than act as a dumb carrier. We expose it as a
// distinct "Vapi-managed" mode: in this mode the media bridge + Gemini layer
// is bypassed and Vapi runs the agent using the agent's system prompt.
export class VapiProvider implements TelephonyProvider {
  readonly name = 'vapi';
  private base = 'https://api.vapi.ai';

  async placeCall(params: PlaceCallParams): Promise<{ providerCallId: string }> {
    const res = await fetch(`${this.base}/call`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${config.vapi.apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        phoneNumberId: params.fromNumber,
        customer: { number: params.toNumber },
        metadata: { callId: params.callId, ...(params.metadata ?? {}) },
      }),
    });
    const json: any = await res.json();
    return { providerCallId: json.id ?? '' };
  }
  async hangup(id: string): Promise<void> {
    await fetch(`${this.base}/call/${id}`, {
      method: 'DELETE', headers: { Authorization: `Bearer ${config.vapi.apiKey}` },
    });
  }
  async hold(): Promise<void> {}
  async unhold(): Promise<void> {}
  async bridge(): Promise<void> {}
  async startRecording(): Promise<void> {/* Vapi records by default */}
  async dialDispatcher(params: { toNumber: string; fromNumber?: string; callId: string }): Promise<{ providerCallId: string }> {
    return { providerCallId: `vapi_disp_${params.callId}` };
  }
}
