import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '../db.js';
import { authGuard } from '../auth/routes.js';
import { config } from '../config.js';

export async function missionRoutes(app: FastifyInstance) {
  app.get('/mission', { preHandler: authGuard() }, async () => {
    const since = startOfToday();
    const [liveCalls, agentsLive, agentsTotal, queueDepth, callsToday, numbers] = await Promise.all([
      prisma.call.findMany({ where: { status: { in: ['dialing', 'ringing', 'ai_talking'] } }, include: { agent: true, driver: true, load: true } }),
      prisma.agent.count({ where: { status: 'live' } }),
      prisma.agent.count(),
      prisma.dispatchQueue.count({ where: { status: { in: ['waiting', 'picking_up'] } } }),
      prisma.call.findMany({ where: { createdAt: { gte: since } } }),
      prisma.phoneNumber.count({ where: { status: { in: ['available', 'assigned'] } } }),
    ]);

    const connected = callsToday.filter((c) => c.answeredAt).length;
    const booked = callsToday.filter((c) => c.outcome === 'booked').length;
    const transferred = callsToday.filter((c) => c.outcome === 'transferred').length;
    const cost = callsToday.reduce((s, c) => s + c.cost, 0);

    return {
      live: liveCalls.map((c) => ({
        callId: c.id, agent: c.agent?.name, driver: c.driver?.name, phone: c.toNumber,
        load: c.load?.reference, status: c.status,
        startedAt: c.answeredAt ?? c.startedAt,
      })),
      stats: {
        callsToday: callsToday.length, connected, booked, transferred,
        connectRate: callsToday.length ? `${Math.round((connected / callsToday.length) * 100)}%` : '0%',
        agentsLive, agentsTotal, queueDepth, numbers, cost: Number(cost.toFixed(2)),
      },
    };
  });

  // CALL CAPACITY CALCULATOR
  // agents × (60 / avgCallDurationSec) = calls/min; × windowMinutes = calls/day.
  // Also computes the numbers needed given the per-number daily cap.
  app.post('/mission/capacity', { preHandler: authGuard() }, async (req) => {
    const body = z.object({
      agents: z.number().min(0).optional(),
      avgCallDurationSec: z.number().min(10).default(60),
      callWindowHours: z.number().min(1).max(24).default(8),
      targetCallsPerDay: z.number().optional(),
    }).parse(req.body ?? {});

    const agents = body.agents ?? (await prisma.agent.count({ where: { status: { in: ['live', 'idle'] } } }));
    const callsPerMinPerAgent = 60 / body.avgCallDurationSec;
    const windowMin = body.callWindowHours * 60;
    const callsPerDay = Math.floor(agents * callsPerMinPerAgent * windowMin);

    // numbers needed for a target (respecting per-number daily cap)
    let numbersForTarget: number | null = null;
    let agentsForTarget: number | null = null;
    if (body.targetCallsPerDay) {
      numbersForTarget = Math.ceil(body.targetCallsPerDay / config.numberDailyCallCap);
      agentsForTarget = Math.ceil(body.targetCallsPerDay / (callsPerMinPerAgent * windowMin));
    }

    const numbersOwned = await prisma.phoneNumber.count();
    return {
      agents, avgCallDurationSec: body.avgCallDurationSec, callWindowHours: body.callWindowHours,
      callsPerDay, callsPerHour: Math.floor(callsPerDay / body.callWindowHours),
      perNumberCap: config.numberDailyCallCap,
      numbersOwned,
      // capacity is also bounded by numbers × cap
      numberBoundedCallsPerDay: numbersOwned * config.numberDailyCallCap,
      target: body.targetCallsPerDay ?? null,
      numbersForTarget, agentsForTarget,
    };
  });
}

function startOfToday() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}
