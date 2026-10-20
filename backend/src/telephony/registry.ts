import type { TelephonyProvider } from './types.js';
import { SimulationProvider } from './simulation.js';
import { TelnyxProvider } from './telnyx.js';
import { TwilioProvider, VapiProvider } from './adapters.js';
import { config } from '../config.js';

const sim = new SimulationProvider();
const telnyx = new TelnyxProvider();
const twilio = new TwilioProvider();
const vapi = new VapiProvider();

/**
 * Returns the active provider for a given preference.
 * - In simulation mode (default, no credentials): always the SimulationProvider.
 * - In live mode: the requested provider if its credentials exist, else
 *   falls back down the chain telnyx → twilio.
 */
export function getProvider(preferred?: string): TelephonyProvider {
  if (config.telephonyMode === 'simulation') return sim;

  const want = preferred ?? config.defaultProvider;
  if (want === 'telnyx' && config.telnyx.enabled) return telnyx;
  if (want === 'twilio' && config.twilio.enabled) return twilio;
  if (want === 'vapi' && config.vapi.enabled) return vapi;

  // failover chain
  if (config.telnyx.enabled) return telnyx;
  if (config.twilio.enabled) return twilio;
  // Live mode with no carrier: the dialer checks liveCarrierReady() and
  // refuses to dial, so this fallback only serves non-dialing paths.
  return sim;
}

/** True when live mode has at least one real carrier configured. */
export function liveCarrierReady(): boolean {
  return config.telnyx.enabled || config.twilio.enabled || config.vapi.enabled;
}
