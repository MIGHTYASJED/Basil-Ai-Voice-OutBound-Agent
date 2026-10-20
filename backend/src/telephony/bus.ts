import { EventEmitter } from 'node:events';
import type { TelephonyEvent } from './types.js';

// All providers emit normalized TelephonyEvents here; the call orchestrator
// subscribes. Webhook handlers (Telnyx/Twilio) also translate raw provider
// webhooks into these events and emit them here.
class CallBus extends EventEmitter {
  emitEvent(ev: TelephonyEvent) {
    this.emit('event', ev);
  }
  onEvent(handler: (ev: TelephonyEvent) => void) {
    this.on('event', handler);
  }
}

export const callBus = new CallBus();
