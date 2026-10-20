import type { TelephonyProvider, PlaceCallParams } from './types.js';
import { config } from '../config.js';

// Real Telnyx Call Control v2 integration. Activates when TELNYX_API_KEY is set
// and TELEPHONY_MODE=live. Telnyx provides carrier-grade call control plus
// bidirectional RTP audio over WebSockets — the media stream connects to our
// bridge at params.mediaStreamUrl, where audio is transcoded and handed to
// Gemini Live (see src/bridge/).
//
// Webhooks from Telnyx hit POST /webhooks/telnyx and are normalized into
// TelephonyEvents on the callBus (see routes/webhooks.ts).

const API = 'https://api.telnyx.com/v2';

async function telnyx(path: string, method: string, body?: unknown) {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${config.telnyx.apiKey}`,
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Telnyx ${method} ${path} failed: ${res.status} ${text}`);
  }
  return res.json();
}

export class TelnyxProvider implements TelephonyProvider {
  readonly name = 'telnyx';

  async placeCall(params: PlaceCallParams): Promise<{ providerCallId: string }> {
    // Dial, then on `call.answered` webhook we issue a streaming_start command
    // pointing at our media bridge. client_state carries our internal callId.
    const res: any = await telnyx('/calls', 'POST', {
      connection_id: config.telnyx.connectionId,
      to: params.toNumber,
      from: params.fromNumber,
      timeout_secs: params.timeoutSeconds,
      answering_machine_detection: params.amdEnabled ? 'premium' : 'disabled',
      stream_url: params.mediaStreamUrl,
      stream_track: 'inbound_track',
      stream_bidirectional_mode: 'rtp',
      stream_bidirectional_codec: 'PCMU',
      send_silence_when_idle: true,
      client_state: Buffer.from(JSON.stringify({ callId: params.callId })).toString('base64'),
    });
    return { providerCallId: res?.data?.call_control_id ?? '' };
  }

  async hangup(providerCallId: string): Promise<void> {
    await telnyx(`/calls/${providerCallId}/actions/hangup`, 'POST', {});
  }

  async hold(providerCallId: string, holdAudioUrl?: string): Promise<void> {
    // Park the leg by playing looping hold audio — the call stays ALIVE.
    await telnyx(`/calls/${providerCallId}/actions/playback_start`, 'POST', {
      audio_url: holdAudioUrl ?? `${config.publicBaseUrl}/audio/hold.mp3`,
      loop: 'infinity',
    });
  }

  async unhold(providerCallId: string): Promise<void> {
    await telnyx(`/calls/${providerCallId}/actions/playback_stop`, 'POST', {});
  }

  async bridge(callIdA: string, callIdB: string): Promise<void> {
    await telnyx(`/calls/${callIdA}/actions/bridge`, 'POST', { call_control_id: callIdB });
  }

  async startRecording(providerCallId: string): Promise<void> {
    await telnyx(`/calls/${providerCallId}/actions/record_start`, 'POST', {
      format: 'mp3',
      channels: 'dual',
    });
  }

  async dialDispatcher(params: { toNumber: string; fromNumber?: string; callId: string }): Promise<{ providerCallId: string }> {
    // Caller ID must be a number we own (a pool number) — carriers reject spoofed caller IDs.
    if (!params.toNumber) throw new Error('Dispatcher has no verified phone number');
    if (!params.fromNumber) throw new Error('No pool number available as caller ID');
    const res: any = await telnyx('/calls', 'POST', {
      connection_id: config.telnyx.connectionId,
      to: params.toNumber,
      from: params.fromNumber,
      client_state: Buffer.from(JSON.stringify({ callId: params.callId, leg: 'dispatcher' })).toString('base64'),
    });
    return { providerCallId: res?.data?.call_control_id ?? '' };
  }
}
