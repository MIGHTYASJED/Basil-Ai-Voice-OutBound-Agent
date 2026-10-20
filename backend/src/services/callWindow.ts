// Calling-hours guard.
//
// US telemarketing rules (TCPA 47 CFR 64.1200(c)(1)) forbid calls before 8 AM
// or after 9 PM in the *called party's* local time, and several states are
// stricter. Basil enforces two layers:
//   1. A hard legal floor/ceiling (08:00–21:00) that no campaign can override.
//   2. The campaign's own call window, evaluated in the campaign timezone.
// The driver's timezone is inferred from their state when known, so a Chicago
// campaign never rings a California driver at 6 AM Pacific.

const LEGAL_START_MIN = 8 * 60; // 08:00
const LEGAL_END_MIN = 21 * 60; // 21:00

// Primary IANA zone per state (good enough for calling-hour checks).
const STATE_TZ: Record<string, string> = {
  AL: 'America/Chicago', AK: 'America/Anchorage', AZ: 'America/Phoenix', AR: 'America/Chicago',
  CA: 'America/Los_Angeles', CO: 'America/Denver', CT: 'America/New_York', DE: 'America/New_York',
  DC: 'America/New_York', FL: 'America/New_York', GA: 'America/New_York', HI: 'Pacific/Honolulu',
  ID: 'America/Boise', IL: 'America/Chicago', IN: 'America/Indiana/Indianapolis', IA: 'America/Chicago',
  KS: 'America/Chicago', KY: 'America/New_York', LA: 'America/Chicago', ME: 'America/New_York',
  MD: 'America/New_York', MA: 'America/New_York', MI: 'America/Detroit', MN: 'America/Chicago',
  MS: 'America/Chicago', MO: 'America/Chicago', MT: 'America/Denver', NE: 'America/Chicago',
  NV: 'America/Los_Angeles', NH: 'America/New_York', NJ: 'America/New_York', NM: 'America/Denver',
  NY: 'America/New_York', NC: 'America/New_York', ND: 'America/Chicago', OH: 'America/New_York',
  OK: 'America/Chicago', OR: 'America/Los_Angeles', PA: 'America/New_York', RI: 'America/New_York',
  SC: 'America/New_York', SD: 'America/Chicago', TN: 'America/Chicago', TX: 'America/Chicago',
  UT: 'America/Denver', VT: 'America/New_York', VA: 'America/New_York', WA: 'America/Los_Angeles',
  WV: 'America/New_York', WI: 'America/Chicago', WY: 'America/Denver',
};

export function tzForState(state?: string | null): string | null {
  if (!state) return null;
  return STATE_TZ[state.trim().toUpperCase()] ?? null;
}

/** Minutes since local midnight in the given IANA timezone. */
export function minutesInZone(tz: string, at: Date = new Date()): number {
  try {
    const parts = new Intl.DateTimeFormat('en-US', { timeZone: tz, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(at);
    const h = Number(parts.find((p) => p.type === 'hour')?.value ?? 0);
    const m = Number(parts.find((p) => p.type === 'minute')?.value ?? 0);
    return h * 60 + m;
  } catch {
    return at.getUTCHours() * 60 + at.getUTCMinutes();
  }
}

function parseHHMM(s: string | null | undefined, fallback: number): number {
  const m = /^(\d{1,2}):(\d{2})$/.exec((s ?? '').trim());
  if (!m) return fallback;
  return Math.min(24 * 60, Number(m[1]) * 60 + Number(m[2]));
}

/** Is the campaign's own window open right now (in the campaign timezone)? */
export function campaignWindowOpen(campaign: { callWindowStart?: string; callWindowEnd?: string; timezone?: string }, at = new Date()): boolean {
  const tz = campaign.timezone || 'America/Chicago';
  const now = minutesInZone(tz, at);
  const start = Math.max(parseHHMM(campaign.callWindowStart, 8 * 60), LEGAL_START_MIN);
  const end = Math.min(parseHHMM(campaign.callWindowEnd, 16 * 60), LEGAL_END_MIN);
  return now >= start && now < end;
}

/** May we legally ring this driver right now (their local time)? */
export function driverCallableNow(driver: { locationState?: string | null }, campaignTz: string, at = new Date()): boolean {
  const tz = tzForState(driver.locationState) ?? campaignTz;
  const now = minutesInZone(tz, at);
  return now >= LEGAL_START_MIN && now < LEGAL_END_MIN;
}
