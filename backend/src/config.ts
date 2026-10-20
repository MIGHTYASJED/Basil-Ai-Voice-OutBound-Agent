// Minimal .env loader (no external dependency).
import { readFileSync } from 'node:fs';
try {
  const raw = readFileSync(new URL('../.env', import.meta.url), 'utf8');
  for (const line of raw.split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && process.env[m[1]] === undefined) {
      process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
    }
  }
} catch { /* no .env file — use real env / defaults */ }

export const config = {
  port: Number(process.env.PORT ?? 4000),
  bridgePort: Number(process.env.BRIDGE_PORT ?? 4001),
  jwtSecret: process.env.JWT_SECRET ?? 'dev-insecure-secret-change-me',
  publicBaseUrl: process.env.PUBLIC_BASE_URL ?? 'http://localhost:4000',
  publicBridgeWsUrl: process.env.PUBLIC_BRIDGE_WS_URL ?? 'ws://localhost:4001',

  telephonyMode: (process.env.TELEPHONY_MODE ?? 'simulation') as 'simulation' | 'live',
  defaultProvider: (process.env.DEFAULT_PROVIDER ?? 'telnyx') as 'telnyx' | 'twilio' | 'vapi',
  numberDailyCallCap: Number(process.env.NUMBER_DAILY_CALL_CAP ?? 200),
  maxParkSeconds: Number(process.env.MAX_PARK_SECONDS ?? 180),
  // Calling hours (08:00–21:00 driver-local + campaign window) are always
  // enforced in live mode. In simulation they're off by default so the demo
  // works at any hour; set this to true to rehearse real scheduling.
  enforceCallWindowInSim: process.env.ENFORCE_CALL_WINDOW_IN_SIM === 'true',
  // Allow anyone to sign up as admin? Off by default: only the very first
  // account may self-register as admin; later admins are created by an admin.
  allowOpenAdminSignup: process.env.ALLOW_OPEN_ADMIN_SIGNUP === 'true',

  gemini: {
    apiKey: process.env.GEMINI_API_KEY ?? '',
    model: (process.env.GEMINI_MODEL || 'gemini-3.1-flash-live-preview').replace(/^models\//, ''),
    enabled: Boolean(process.env.GEMINI_API_KEY),
  },
  telnyx: {
    apiKey: process.env.TELNYX_API_KEY ?? '',
    connectionId: process.env.TELNYX_CONNECTION_ID ?? '',
    enabled: Boolean(process.env.TELNYX_API_KEY),
  },
  twilio: {
    accountSid: process.env.TWILIO_ACCOUNT_SID ?? '',
    authToken: process.env.TWILIO_AUTH_TOKEN ?? '',
    enabled: Boolean(process.env.TWILIO_ACCOUNT_SID),
  },
  vapi: {
    apiKey: process.env.VAPI_API_KEY ?? '',
    enabled: Boolean(process.env.VAPI_API_KEY),
  },
  dat: {
    apiKey: process.env.DAT_API_KEY ?? '',
    enabled: Boolean(process.env.DAT_API_KEY),
  },
};
