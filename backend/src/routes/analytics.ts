import type { FastifyInstance } from 'fastify';
import { prisma } from '../db.js';
import { authGuard } from '../auth/routes.js';

export async function analyticsRoutes(app: FastifyInstance) {
  app.get('/analytics', { preHandler: authGuard() }, async (req) => {
    const q = req.query as { days?: string };
    const days = Math.min(365, Math.max(1, Number(q.days ?? 7) || 7));
    const since = new Date(Date.now() - days * 86_400_000);

    const calls = await prisma.call.findMany({ where: { createdAt: { gte: since } }, include: { agent: true } });

    // Funnel
    const dialed = calls.length;
    const answered = calls.filter((c) => c.answeredAt).length;
    const transferred = calls.filter((c) => c.outcome === 'transferred').length;
    const booked = calls.filter((c) => c.outcome === 'booked').length;

    // Outcomes distribution
    const outcomes: Record<string, number> = {};
    for (const c of calls) {
      const o = c.outcome ?? 'in_progress';
      outcomes[o] = (outcomes[o] ?? 0) + 1;
    }

    // Agent leaderboard
    const byAgent: Record<string, { name: string; calls: number; connected: number; booked: number; cost: number }> = {};
    for (const c of calls) {
      const name = c.agent?.name ?? 'Unassigned';
      const a = (byAgent[name] ??= { name, calls: 0, connected: 0, booked: 0, cost: 0 });
      a.calls++;
      if (c.answeredAt) a.connected++;
      if (c.outcome === 'booked') a.booked++;
      a.cost += c.cost;
    }
    const leaderboard = Object.values(byAgent).sort((a, b) => b.booked - a.booked);

    // Calls over time (per day)
    const series: Record<string, { date: string; calls: number; booked: number }> = {};
    for (const c of calls) {
      const date = new Date(c.createdAt).toISOString().slice(0, 10);
      const s = (series[date] ??= { date, calls: 0, booked: 0 });
      s.calls++;
      if (c.outcome === 'booked') s.booked++;
    }

    // Hour-of-day heatmap (connect rate by hour)
    const heatmap: { hour: number; calls: number; connected: number }[] = Array.from({ length: 24 }, (_, h) => ({ hour: h, calls: 0, connected: 0 }));
    for (const c of calls) {
      const h = new Date(c.createdAt).getHours();
      heatmap[h].calls++;
      if (c.answeredAt) heatmap[h].connected++;
    }

    const totalCost = calls.reduce((s, c) => s + c.cost, 0);

    return {
      funnel: { dialed, answered, transferred, booked },
      outcomes,
      leaderboard: leaderboard.map((a) => ({ ...a, cost: Number(a.cost.toFixed(2)) })),
      series: Object.values(series).sort((a, b) => a.date.localeCompare(b.date)),
      heatmap,
      cost: { total: Number(totalCost.toFixed(2)), perBooked: booked ? Number((totalCost / booked).toFixed(2)) : 0 },
    };
  });
}
