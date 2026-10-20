import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '../db.js';
import { authGuard } from '../auth/routes.js';
import { toJson, fromJson } from '../lib/json.js';
import { DEFAULT_PROMPT_TEMPLATE, estimateTokens } from '../bridge/prompt.js';
import { publish } from '../realtime/hub.js';

export async function agentRoutes(app: FastifyInstance) {
  // List agents (+ today stats derived from calls) and groups.
  app.get('/agents', { preHandler: authGuard() }, async () => {
    const [agents, groups] = await Promise.all([
      prisma.agent.findMany({ include: { assignedNumber: true }, orderBy: { createdAt: 'asc' } }),
      prisma.agentGroup.findMany({ orderBy: { createdAt: 'asc' } }),
    ]);
    const since = startOfToday();
    const enriched = await Promise.all(agents.map(async (a) => {
      const calls = await prisma.call.findMany({ where: { agentId: a.id, createdAt: { gte: since } } });
      const connected = calls.filter((c) => c.answeredAt).length;
      const booked = calls.filter((c) => c.outcome === 'booked').length;
      const active = await prisma.call.count({ where: { agentId: a.id, status: { in: ['dialing', 'ringing', 'ai_talking'] } } });
      return {
        id: a.id, name: a.name, role: a.role, description: a.description, 
        voice: a.voiceId, voiceId: a.voiceId,
        model: `${a.llmModel} · Temp ${a.temperature}`, llmModel: a.llmModel, temperature: a.temperature,
        phone: a.assignedNumber?.e164 ?? null, assignedNumberId: a.assignedNumberId,
        maxDuration: `${Math.round(a.maxCallDurationSec / 60)} min`, maxCallDurationSec: a.maxCallDurationSec,
        status: a.status, activeCalls: active, group: a.groupId,
        today: { calls: calls.length, connected, booked, avgDur: avgDur(calls) },
      };
    }));
    return {
      agents: enriched,
      groups: groups.map((g) => ({ id: g.id, name: g.name, description: g.description, color: g.color })),
    };
  });

  // Create single agent — enforces an available number exists.
  app.post('/agents', { preHandler: authGuard(true) }, async (req, reply) => {
    const body = z.object({
      name: z.string().min(1), role: z.string().optional(), description: z.string().optional(),
      color: z.string().default('green'),
      voiceProvider: z.string().default('gemini'), voiceId: z.string().default('Zephyr'),
      llmModel: z.string().default('gemini-3.1-flash-live-preview'), temperature: z.number().default(0.7),
      maxCallDurationSec: z.number().default(300), preferredProvider: z.string().default('telnyx'),
      numberId: z.string().optional(), promptContent: z.string().optional(),
    }).parse(req.body);

    if (await prisma.agent.findFirst({ where: { name: body.name } })) {
      return reply.code(409).send({ error: `An agent named "${body.name}" already exists.` });
    }
    let numberId = body.numberId;
    if (!numberId) {
      const free = await prisma.phoneNumber.findFirst({ where: { status: 'available' } });
      if (!free) return reply.code(409).send({ error: 'No phone numbers available. Add a number before creating an agent.' });
      numberId = free.id;
    }
    const number = await prisma.phoneNumber.findUnique({ where: { id: numberId } });
    if (!number || number.status !== 'available') return reply.code(409).send({ error: 'Selected number is not available.' });

    const agent = await prisma.agent.create({
      data: {
        name: body.name, role: body.role, description: body.description, color: body.color,
        voiceProvider: body.voiceProvider, voiceId: body.voiceId, llmModel: body.llmModel,
        temperature: body.temperature, maxCallDurationSec: body.maxCallDurationSec,
        preferredProvider: body.preferredProvider, assignedNumberId: numberId, status: 'idle',
      },
    });
    await prisma.phoneNumber.update({ where: { id: numberId }, data: { status: 'assigned' } });
    await prisma.promptVersion.create({
      data: { agentId: agent.id, versionNumber: 1, content: body.promptContent ?? DEFAULT_PROMPT_TEMPLATE, tokenCount: estimateTokens(body.promptContent ?? DEFAULT_PROMPT_TEMPLATE), changeNote: 'Initial version' },
    });
    publish('agent-status', 'created', { id: agent.id, name: agent.name });
    return reply.code(201).send({ id: agent.id });
  });

  // Create a GROUP of N agents sharing prompt/voice; auto-assign numbers.
  app.post('/agent-groups', { preHandler: authGuard(true) }, async (req, reply) => {
    const body = z.object({
      name: z.string().min(1), description: z.string().optional(), count: z.number().min(2).max(50),
      namingPattern: z.string().default('Basil-{N}'), color: z.string().default('green'),
      voiceProvider: z.string().default('gemini'), voiceId: z.string().default('Zephyr'),
      llmModel: z.string().default('gemini-3.1-flash-live-preview'), temperature: z.number().default(0.7),
      promptContent: z.string().optional(), numberIds: z.array(z.string()).optional(),
    }).parse(req.body);

    const available = await prisma.phoneNumber.findMany({ where: { status: 'available' }, take: body.count });
    const numbers = body.numberIds?.length ? await prisma.phoneNumber.findMany({ where: { id: { in: body.numberIds }, status: 'available' } }) : available;
    if (numbers.length < body.count) {
      return reply.code(409).send({ error: `You need ${body.count} numbers but only ${numbers.length} are available. Add ${body.count - numbers.length} more.` });
    }

    const group = await prisma.agentGroup.create({
      data: { name: body.name, description: body.description, color: body.color,
        voiceConfig: toJson({ voiceProvider: body.voiceProvider, voiceId: body.voiceId }),
        modelConfig: toJson({ llmModel: body.llmModel, temperature: body.temperature }) },
    });
    await prisma.promptVersion.create({
      data: { agentGroupId: group.id, versionNumber: 1, content: body.promptContent ?? DEFAULT_PROMPT_TEMPLATE, tokenCount: estimateTokens(body.promptContent ?? DEFAULT_PROMPT_TEMPLATE), changeNote: 'Initial group version' },
    });

    const pattern = body.namingPattern.includes('{N}') ? body.namingPattern : `${body.namingPattern}-{N}`;
    for (let i = 0; i < body.count; i++) {
      let name = pattern.replace('{N}', String(i + 1));
      for (let n = 2; await prisma.agent.findFirst({ where: { name } }); n++) name = `${pattern.replace('{N}', String(i + 1))}-${n}`;
      const number = numbers[i];
      const agent = await prisma.agent.create({
        data: { name, role: body.description, color: body.color, groupId: group.id,
          voiceProvider: body.voiceProvider, voiceId: body.voiceId, llmModel: body.llmModel,
          temperature: body.temperature, assignedNumberId: number.id, status: 'idle' },
      });
      await prisma.phoneNumber.update({ where: { id: number.id }, data: { status: 'assigned' } });
      await prisma.promptVersion.create({ data: { agentId: agent.id, versionNumber: 1, content: body.promptContent ?? DEFAULT_PROMPT_TEMPLATE, tokenCount: estimateTokens(body.promptContent ?? DEFAULT_PROMPT_TEMPLATE), changeNote: 'From group' } });
    }
    return reply.code(201).send({ id: group.id, created: body.count });
  });

  app.post('/agents/:id/pause', { preHandler: authGuard(true) }, async (req, reply) => {
    const { id } = req.params as { id: string };
    if (!(await prisma.agent.findUnique({ where: { id } }))) return reply.code(404).send({ error: 'Agent not found' });
    await prisma.agent.update({ where: { id }, data: { status: 'paused' } });
    publish('agent-status', 'updated', { id, status: 'paused' });
    return { ok: true };
  });
  app.post('/agents/:id/resume', { preHandler: authGuard(true) }, async (req, reply) => {
    const { id } = req.params as { id: string };
    if (!(await prisma.agent.findUnique({ where: { id } }))) return reply.code(404).send({ error: 'Agent not found' });
    await prisma.agent.update({ where: { id }, data: { status: 'idle' } });
    publish('agent-status', 'updated', { id, status: 'idle' });
    return { ok: true };
  });

  app.post('/agents/:id/duplicate', { preHandler: authGuard(true) }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const src = await prisma.agent.findUnique({ where: { id } });
    if (!src) return reply.code(404).send({ error: 'not found' });
    const free = await prisma.phoneNumber.findFirst({ where: { status: 'available' } });
    if (!free) return reply.code(409).send({ error: 'No available number to assign the duplicate.' });
    let copyName = `${src.name}-copy`;
    for (let n = 2; await prisma.agent.findFirst({ where: { name: copyName } }); n++) copyName = `${src.name}-copy-${n}`;
    const copy = await prisma.agent.create({
      data: { name: copyName, groupId: src.groupId, role: src.role, description: src.description, color: src.color,
        voiceProvider: src.voiceProvider, voiceId: src.voiceId, llmModel: src.llmModel, temperature: src.temperature,
        maxCallDurationSec: src.maxCallDurationSec, preferredProvider: src.preferredProvider,
        assignedNumberId: free.id, status: 'idle' },
    });
    await prisma.phoneNumber.update({ where: { id: free.id }, data: { status: 'assigned' } });
    // carry the prompt over, otherwise the copy silently falls back to the default script
    const latest = await prisma.promptVersion.findFirst({ where: { agentId: src.id }, orderBy: { versionNumber: 'desc' } });
    if (latest) {
      await prisma.promptVersion.create({ data: { agentId: copy.id, versionNumber: 1, content: latest.content, tokenCount: latest.tokenCount, changeNote: `Copied from ${src.name} v${latest.versionNumber}` } });
    }
    publish('agent-status', 'created', { id: copy.id, name: copy.name });
    return reply.code(201).send({ id: copy.id });
  });

  app.put('/agents/:id', { preHandler: authGuard(true) }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const body = z.object({
      name: z.string().optional(), role: z.string().optional(), description: z.string().optional(),
      voiceProvider: z.string().optional(), voiceId: z.string().optional(),
      llmModel: z.string().optional(), temperature: z.number().optional(),
      maxCallDurationSec: z.number().optional(), numberId: z.string().optional(),
    }).parse(req.body);

    const data: any = {};
    if (body.name !== undefined) data.name = body.name;
    if (body.role !== undefined) data.role = body.role;
    if (body.description !== undefined) data.description = body.description;
    if (body.voiceProvider !== undefined) data.voiceProvider = body.voiceProvider;
    if (body.voiceId !== undefined) data.voiceId = body.voiceId;
    if (body.llmModel !== undefined) data.llmModel = body.llmModel;
    if (body.temperature !== undefined) data.temperature = body.temperature;
    if (body.maxCallDurationSec !== undefined) data.maxCallDurationSec = body.maxCallDurationSec;
    const agent = await prisma.agent.findUnique({ where: { id } });
    if (!agent) return reply.code(404).send({ error: 'Agent not found' });
    if (body.name !== undefined && body.name !== agent.name && await prisma.agent.findFirst({ where: { name: body.name } })) {
      return reply.code(409).send({ error: `An agent named "${body.name}" already exists.` });
    }
    if (body.numberId !== undefined && body.numberId !== agent.assignedNumberId) {
      const next = await prisma.phoneNumber.findUnique({ where: { id: body.numberId } });
      if (!next || next.status !== 'available') return reply.code(409).send({ error: 'That number is not available.' });
      if (agent.assignedNumberId) await prisma.phoneNumber.update({ where: { id: agent.assignedNumberId }, data: { status: 'available' } });
      await prisma.phoneNumber.update({ where: { id: next.id }, data: { status: 'assigned' } });
      data.assignedNumberId = next.id;
    }

    await prisma.agent.update({ where: { id }, data });
    publish('agent-status', 'updated', { id, name: body.name });
    return { ok: true };
  });

  app.delete('/agents/:id', { preHandler: authGuard(true) }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const agent = await prisma.agent.findUnique({ where: { id } });
    if (!agent) return reply.code(404).send({ error: 'Agent not found' });
    const active = await prisma.call.count({ where: { agentId: id, status: { in: ['queued', 'dialing', 'ringing', 'ai_talking'] } } });
    if (active > 0) return reply.code(409).send({ error: `${agent.name} is on a call right now. Pause it first, then delete.` });
    if (agent.assignedNumberId) {
      await prisma.phoneNumber.update({ where: { id: agent.assignedNumberId }, data: { status: 'available' } });
    }
    await prisma.agent.delete({ where: { id } });
    await prisma.promptVersion.deleteMany({ where: { agentId: id } });
    publish('agent-status', 'deleted', { id });
    return { ok: true };
  });

  // ── Prompt versions ──
  app.get('/agents/:id/prompt/versions', { preHandler: authGuard(true) }, async (req) => {
    const { id } = req.params as { id: string };
    const versions = await prisma.promptVersion.findMany({ where: { agentId: id }, orderBy: { versionNumber: 'desc' } });
    return versions.map((v) => ({ id: v.id, version: v.versionNumber, content: v.content, tokenCount: v.tokenCount, changeNote: v.changeNote, createdBy: v.createdBy, createdAt: v.createdAt }));
  });

  app.post('/agents/:id/prompt', { preHandler: authGuard(true) }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const body = z.object({ content: z.string().min(20, 'Prompt is too short'), changeNote: z.string().optional() }).parse(req.body);
    if (!(await prisma.agent.findUnique({ where: { id } }))) return reply.code(404).send({ error: 'Agent not found' });
    const last = await prisma.promptVersion.findFirst({ where: { agentId: id }, orderBy: { versionNumber: 'desc' } });
    const version = (last?.versionNumber ?? 0) + 1;
    const created = await prisma.promptVersion.create({
      data: { agentId: id, versionNumber: version, content: body.content, tokenCount: estimateTokens(body.content), changeNote: body.changeNote ?? `v${version}` },
    });
    return reply.code(201).send({ id: created.id, version });
  });

  app.post('/agents/:id/prompt/restore/:versionId', { preHandler: authGuard(true) }, async (req, reply) => {
    const { id, versionId } = req.params as { id: string; versionId: string };
    const v = await prisma.promptVersion.findUnique({ where: { id: versionId } });
    if (!v || (v.agentId && v.agentId !== id)) return reply.code(404).send({ error: 'version not found' });
    const last = await prisma.promptVersion.findFirst({ where: { agentId: id }, orderBy: { versionNumber: 'desc' } });
    const version = (last?.versionNumber ?? 0) + 1;
    await prisma.promptVersion.create({ data: { agentId: id, versionNumber: version, content: v.content, tokenCount: v.tokenCount, changeNote: `Restored from v${v.versionNumber}` } });
    return { ok: true, version };
  });
}

function startOfToday() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}
function avgDur(calls: { durationSec: number }[]) {
  const done = calls.filter((c) => c.durationSec > 0);
  if (!done.length) return '—';
  const avg = done.reduce((s, c) => s + c.durationSec, 0) / done.length;
  const m = Math.floor(avg / 60);
  const s = Math.round(avg % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}
