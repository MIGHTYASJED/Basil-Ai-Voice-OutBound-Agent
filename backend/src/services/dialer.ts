import { prisma } from '../db.js';
import { config } from '../config.js';
import { getProvider, liveCarrierReady } from '../telephony/registry.js';
import { acquireNumberLock, releaseNumberLock } from '../telephony/numberLock.js';
import { fromJson } from '../lib/json.js';
import { publish } from '../realtime/hub.js';
import { campaignWindowOpen, driverCallableNow } from './callWindow.js';

// Places outbound calls for active campaigns. Respects: legal calling hours
// (08:00–21:00 in the driver's local time) and the campaign's call window,
// per-number daily cap, per-number concurrency lock, agent assignment, DNC,
// and the campaign's retry policy (maxRetries / retryDelayMin).
//
// In production the dialing loop is backed by BullMQ/Redis for horizontal
// scale; here it's an in-process sweep with the same guarantees.

// Driver statuses that may be dialed for the first time.
const FRESH = ['pending', 'queued'];
// Outcomes that are worth another attempt later.
const RETRYABLE = ['completed_no_answer', 'completed_callback'];

/** Calling-hour rules are always enforced live; in simulation they're opt-in so the demo works at any hour. */
function enforceHours() {
  return config.telephonyMode === 'live' || config.enforceCallWindowInSim;
}

export async function launchCampaign(campaignId: string) {
  const c = await prisma.campaign.findUnique({ where: { id: campaignId } });
  if (!c) throw new Error('Campaign not found');
  if (c.status === 'completed') throw new Error('Campaign already completed');
  await prisma.campaign.update({
    where: { id: campaignId },
    data: { status: 'calling', startedAt: c.startedAt ?? new Date() },
  });
  publish(`campaign:${campaignId}`, 'launched', { id: campaignId });
  // Kick a sweep immediately; the interval below keeps it going.
  void sweep();
}

export async function pauseCampaign(campaignId: string) {
  await prisma.campaign.update({ where: { id: campaignId }, data: { status: 'paused' } });
  publish(`campaign:${campaignId}`, 'paused', { id: campaignId });
}

let sweeping = false;
let sweepCount = 0;
let warnedNoCarrier = false;

/** One dialing pass across all active campaigns. */
export async function sweep() {
  if (sweeping) return;
  if (config.telephonyMode === 'live' && !liveCarrierReady()) {
    if (!warnedNoCarrier) console.warn('[dialer] TELEPHONY_MODE=live but no TELNYX/TWILIO/VAPI credentials — not dialing. Add a carrier key or switch back to simulation.');
    warnedNoCarrier = true;
    return;
  }
  sweeping = true;
  try {
    const all = await prisma.campaign.findMany({ where: { status: 'calling' }, orderBy: { createdAt: 'asc' } });
    // Rotate the starting campaign each pass so campaigns sharing agents take
    // turns instead of the oldest one starving the rest.
    const offset = all.length ? sweepCount++ % all.length : 0;
    const campaigns = [...all.slice(offset), ...all.slice(0, offset)];
    for (const c of campaigns) {
      if (enforceHours() && !campaignWindowOpen(c)) continue;

      const agentIds = fromJson<string[]>(c.agentIds, []);
      const loadIds = fromJson<string[]>(c.loadIds, []);
      if (agentIds.length === 0) continue;

      const agents = await prisma.agent.findMany({
        where: { id: { in: agentIds }, status: { in: ['live', 'idle'] } },
        include: { assignedNumber: true },
      });

      let placedThisPass = 0;
      for (const agent of agents) {
        const number = agent.assignedNumber;
        if (!number || number.status === 'disabled' || number.status === 'cooldown') continue;
        if (number.dailyCallCount >= config.numberDailyCallCap) {
          await prisma.phoneNumber.update({ where: { id: number.id }, data: { status: 'cooldown', cooldownUntil: nextMidnight() } });
          continue;
        }
        // one call in flight per number
        if (!acquireNumberLock(number.id)) continue;

        const driver = await nextDriver(c);
        if (!driver) {
          releaseNumberLock(number.id);
          continue;
        }
        const loadId = pickLoad(loadIds, driver);
        await placeOneCall({ campaignId: c.id, agent, number, driver, loadId });
        placedThisPass++;
      }

      // Nothing left to dial and nothing in flight → the campaign is done.
      if (placedThisPass === 0) await maybeComplete(c);
    }
  } catch (err) {
    console.error('[dialer] sweep failed:', err);
  } finally {
    sweeping = false;
  }
}

function pickLoad(loadIds: string[], _driver: any): string | null {
  // Rotate through the campaign's loads so every load gets pitched.
  if (!loadIds.length) return null;
  return loadIds[Math.floor(Math.random() * loadIds.length)];
}

function driverWhere(campaign: any) {
  const filter = fromJson<any>(campaign.driverFilter, {});
  const where: any = { status: 'active' };
  if (filter.truckType) where.truckType = filter.truckType;
  if (filter.state) where.locationState = filter.state;
  return where;
}

/** Number of dial attempts this campaign has already made to a driver. */
async function attemptsFor(campaignId: string, driverId: string) {
  return prisma.call.count({ where: { campaignId, driverId } });
}

async function nextDriver(campaign: any) {
  const base = driverWhere(campaign);
  const tz = campaign.timezone || 'America/Chicago';
  const hours = enforceHours();

  // 1) Fresh drivers first (oldest first).
  const fresh = await prisma.driver.findMany({ where: { ...base, statusCalled: { in: FRESH } }, orderBy: { createdAt: 'asc' }, take: 50 });
  for (const d of fresh) {
    if (hours && !driverCallableNow(d, tz)) continue;
    return d;
  }

  // 2) Retries that are due and still have attempts left.
  const retryBefore = new Date(Date.now() - (campaign.retryDelayMin ?? 120) * 60_000);
  const due = await prisma.driver.findMany({
    where: { ...base, statusCalled: { in: RETRYABLE }, lastCalledAt: { lt: retryBefore } },
    orderBy: { lastCalledAt: 'asc' },
    take: 50,
  });
  for (const d of due) {
    if (hours && !driverCallableNow(d, tz)) continue;
    const attempts = await attemptsFor(campaign.id, d.id);
    if (attempts === 0) continue; // never called by THIS campaign — it isn't our retry
    if (attempts > (campaign.maxRetries ?? 2)) continue; // first call + maxRetries retries
    return d;
  }
  return null;
}

/** Mark the campaign completed once no driver is eligible and no call is in flight. */
async function maybeComplete(campaign: any) {
  const inFlight = await prisma.call.count({ where: { campaignId: campaign.id, status: { in: ['queued', 'dialing', 'ringing', 'ai_talking'] } } });
  if (inFlight > 0) return;
  const base = driverWhere(campaign);
  const freshLeft = await prisma.driver.count({ where: { ...base, statusCalled: { in: FRESH } } });
  if (freshLeft > 0) return;

  // Any retry still possible (attempts left)? Then wait for it.
  const retryable = await prisma.driver.findMany({ where: { ...base, statusCalled: { in: RETRYABLE } } });
  for (const d of retryable) {
    const attempts = await attemptsFor(campaign.id, d.id);
    if (attempts > 0 && attempts <= (campaign.maxRetries ?? 2)) return;
  }

  const calls = await prisma.call.count({ where: { campaignId: campaign.id } });
  // Never dialed anyone: give imports a minute to land before calling it done.
  const startedAt = campaign.startedAt ? new Date(campaign.startedAt).getTime() : Date.now();
  if (calls === 0 && Date.now() - startedAt < 60_000) return;
  await prisma.campaign.update({ where: { id: campaign.id }, data: { status: 'completed', completedAt: new Date() } });
  publish(`campaign:${campaign.id}`, 'completed', { id: campaign.id });
  publish('mission', 'campaign-completed', { id: campaign.id, name: campaign.name });
}

async function placeOneCall(args: { campaignId: string; agent: any; number: any; driver: any; loadId: string | null }) {
  const { campaignId, agent, number, driver, loadId } = args;

  // mark driver as in-flight so no one re-dials them
  await prisma.driver.update({ where: { id: driver.id }, data: { statusCalled: 'calling', lastCalledAt: new Date() } });
  await prisma.phoneNumber.update({ where: { id: number.id }, data: { dailyCallCount: { increment: 1 }, lastUsedAt: new Date() } });
  await prisma.agent.update({ where: { id: agent.id }, data: { status: 'live' } });
  publish('agent-status', 'updated', { id: agent.id, status: 'live' });

  const call = await prisma.call.create({
    data: {
      campaignId, agentId: agent.id, driverId: driver.id, loadId: loadId ?? undefined,
      numberId: number.id, provider: number.provider, fromNumber: number.e164, toNumber: driver.phone,
      status: 'queued',
    },
  });

  const provider = getProvider(agent.preferredProvider);
  const mediaStreamUrl = `${config.publicBridgeWsUrl}/media?call_id=${call.id}`;
  try {
    const { providerCallId } = await provider.placeCall({
      callId: call.id,
      fromNumber: number.e164,
      toNumber: driver.phone,
      mediaStreamUrl,
      amdEnabled: agent.amdEnabled,
      timeoutSeconds: agent.ringTimeoutSec,
      metadata: { agentId: agent.id, campaignId },
    });
    if (providerCallId) {
      const fresh = await prisma.call.findUnique({ where: { id: call.id } });
      if (fresh && !fresh.providerCallId) await prisma.call.update({ where: { id: call.id }, data: { providerCallId } });
    }
  } catch (err: any) {
    console.error('[dialer] placeCall failed:', err?.message ?? err);
    await prisma.call.update({ where: { id: call.id }, data: { status: 'failed', outcome: 'failed', endedAt: new Date() } });
    await prisma.driver.update({ where: { id: driver.id }, data: { statusCalled: 'failed' } });
    await prisma.agent.update({ where: { id: agent.id }, data: { status: 'idle' } });
    releaseNumberLock(number.id);
  }
}

function nextMidnight() {
  const d = new Date();
  d.setHours(24, 0, 0, 0);
  return d;
}

let lastResetDay = new Date().toDateString();

/** Background sweeps + daily counter reset + cooldown release. */
export function startDialerLoop() {
  setInterval(() => void sweep(), 4000);
  setInterval(() => void maintenance(), 60_000);
}

async function maintenance() {
  try {
    // Daily cap is per calendar day: reset every number's counter at midnight.
    const today = new Date().toDateString();
    if (today !== lastResetDay) {
      lastResetDay = today;
      await prisma.phoneNumber.updateMany({ where: {}, data: { dailyCallCount: 0 } });
    }
    // release expired cooldowns — back to 'assigned' if an agent still owns the
    // number (otherwise it would look free and get handed to a second agent).
    const expired = await prisma.phoneNumber.findMany({
      where: { status: 'cooldown', cooldownUntil: { lt: new Date() } },
      include: { agent: true },
    });
    for (const n of expired) {
      await prisma.phoneNumber.update({
        where: { id: n.id },
        data: { status: n.agent ? 'assigned' : 'available', cooldownUntil: null, dailyCallCount: 0 },
      });
    }
  } catch (err) {
    console.error('[dialer] maintenance failed:', err);
  }
}
