// Provider-agnostic telephony interface. Telnyx, Twilio, Vapi and the
// built-in Simulation provider all implement this. No business logic
// depends on which carrier is in use.

export type PlaceCallParams = {
  callId: string; // our internal call id (also passed back in webhooks)
  fromNumber: string; // one of our pool numbers (caller ID)
  toNumber: string; // the driver
  mediaStreamUrl: string; // bridge WS endpoint with ?call_id=
  amdEnabled: boolean;
  timeoutSeconds: number;
  metadata?: Record<string, string>;
};

export type TranscriptTurn = { speaker: string; text: string; t: number };

/** Final outcome reported by the AI (media bridge) for a live call. */
export type AiOutcome =
  | 'not_interested' | 'callback_requested' | 'booked' | 'no_capacity'
  | 'wrong_number' | 'dnc_requested' | 'hung_up';

export type TelephonyEvent =
  | { type: 'initiated'; callId: string; providerCallId: string }
  | { type: 'ringing'; callId: string }
  | { type: 'answered'; callId: string; amd: 'human' | 'machine' | 'unknown' }
  | { type: 'no_answer'; callId: string }
  | { type: 'busy'; callId: string }
  | { type: 'failed'; callId: string; reason?: string }
  | { type: 'hangup'; callId: string; by: 'driver' | 'agent' | 'system' }
  | { type: 'bridged'; callId: string }
  // Live mode: the AI asked to hand the driver to a human dispatcher.
  | { type: 'transfer'; callId: string; reason: string; summary: string; driverInfo: string[]; transcript: TranscriptTurn[]; durationSec: number }
  // Live mode: the AI (or the carrier closing) ended the conversation.
  | { type: 'outcome'; callId: string; outcome: AiOutcome; summary?: string; callbackTime?: string; driverInfo: string[]; transcript: TranscriptTurn[]; durationSec: number };

export interface TelephonyProvider {
  readonly name: string;
  placeCall(params: PlaceCallParams): Promise<{ providerCallId: string }>;
  hangup(providerCallId: string): Promise<void>;
  hold(providerCallId: string, holdAudioUrl?: string): Promise<void>;
  unhold(providerCallId: string): Promise<void>;
  bridge(callIdA: string, callIdB: string): Promise<void>;
  startRecording(providerCallId: string): Promise<void>;
  /** Dial a dispatcher's phone for a transfer pickup. Returns provider id. */
  dialDispatcher(params: { toNumber: string; fromNumber?: string; callId: string }): Promise<{ providerCallId: string }>;
}
