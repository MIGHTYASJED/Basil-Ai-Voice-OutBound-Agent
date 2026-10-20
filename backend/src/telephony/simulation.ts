import { nanoid } from 'nanoid';
import type { TelephonyProvider, PlaceCallParams } from './types.js';
import { callBus } from './bus.js';

// Drives a realistic call lifecycle using timers so the entire product is
// demonstrable end-to-end with no carrier account. Outcomes are randomized
// with weights that resemble real outbound dispatch dialing.

const PROVIDER_CALL: Record<string, { callId: string }> = {};

function rand(min: number, max: number) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

export class SimulationProvider implements TelephonyProvider {
  readonly name = 'simulation';

  async placeCall(params: PlaceCallParams): Promise<{ providerCallId: string }> {
    const providerCallId = `sim_${nanoid(10)}`;
    PROVIDER_CALL[providerCallId] = { callId: params.callId };

    callBus.emitEvent({ type: 'initiated', callId: params.callId, providerCallId });

    // ringing shortly after
    setTimeout(() => callBus.emitEvent({ type: 'ringing', callId: params.callId }), 400);

    // resolve the call: weighted outcome
    const roll = Math.random();
    const ringMs = rand(2000, 5000);

    setTimeout(() => {
      if (roll < 0.34) {
        // no answer
        callBus.emitEvent({ type: 'no_answer', callId: params.callId });
      } else if (roll < 0.40) {
        // busy
        callBus.emitEvent({ type: 'busy', callId: params.callId });
      } else if (roll < 0.44) {
        // voicemail (machine)
        callBus.emitEvent({ type: 'answered', callId: params.callId, amd: 'machine' });
      } else {
        // human answered → AI conversation begins (handled by orchestrator/bridge)
        callBus.emitEvent({ type: 'answered', callId: params.callId, amd: 'human' });
      }
    }, ringMs);

    return { providerCallId };
  }

  async hangup(providerCallId: string): Promise<void> {
    const rec = PROVIDER_CALL[providerCallId];
    if (rec) callBus.emitEvent({ type: 'hangup', callId: rec.callId, by: 'system' });
  }

  async hold(): Promise<void> {
    /* simulated: driver hears hold music; leg stays alive */
  }
  async unhold(): Promise<void> {
    /* simulated */
  }
  async bridge(callId: string): Promise<void> {
    callBus.emitEvent({ type: 'bridged', callId });
  }
  async startRecording(): Promise<void> {
    /* simulated */
  }
  async dialDispatcher(params: { toNumber: string; fromNumber?: string; callId: string }): Promise<{ providerCallId: string }> {
    const providerCallId = `sim_disp_${nanoid(8)}`;
    // dispatcher answers their phone within a couple seconds
    setTimeout(() => callBus.emitEvent({ type: 'bridged', callId: params.callId }), rand(1500, 3000));
    return { providerCallId };
  }
}
