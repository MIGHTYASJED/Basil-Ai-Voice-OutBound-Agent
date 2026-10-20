import type { FastifyInstance } from 'fastify';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { prisma } from '../db.js';
import { config } from '../config.js';

export async function authRoutes(app: FastifyInstance) {
  app.post('/auth/signup', async (req, reply) => {
    const body = z
      .object({
        name: z.string().min(2),
        email: z.string().email(),
        company: z.string().optional(),
        password: z.string().min(8),
        role: z.enum(['admin', 'dispatcher']).default('dispatcher'),
      })
      .parse(req.body);

    body.email = body.email.trim().toLowerCase();
    const existing = await prisma.user.findUnique({ where: { email: body.email } });
    if (existing) return reply.code(409).send({ error: 'An account with this email already exists.' });

    // Anyone on the internet can hit /auth/signup, so self-registering as
    // admin is only allowed for the very first account (workspace owner).
    if (body.role === 'admin' && !config.allowOpenAdminSignup) {
      const admins = await prisma.user.count({ where: { role: 'admin' } });
      if (admins > 0) {
        return reply.code(403).send({ error: 'Admin accounts are created by an existing admin. Sign up as a dispatcher, or ask your admin for access.' });
      }
    }

    const hash = await bcrypt.hash(body.password, 10);
    const user = await prisma.user.create({
      data: { name: body.name, email: body.email, company: body.company, password: hash, role: body.role },
    });
    if (body.role === 'dispatcher') {
      await prisma.dispatcher.create({ data: { userId: user.id } });
    }
    const token = app.jwt.sign({ id: user.id, role: user.role, name: user.name }, { expiresIn: '7d' });
    return { token, user: { id: user.id, name: user.name, email: user.email, company: user.company, role: user.role } };
  });

  app.post('/auth/login', async (req, reply) => {
    const body = z.object({ email: z.string().email(), password: z.string() }).parse(req.body);
    const user = await prisma.user.findUnique({ where: { email: body.email.trim().toLowerCase() } });
    if (!user) return reply.code(401).send({ error: 'Invalid email or password.' });
    const ok = await bcrypt.compare(body.password, user.password);
    if (!ok) return reply.code(401).send({ error: 'Invalid email or password.' });
    const token = app.jwt.sign({ id: user.id, role: user.role, name: user.name }, { expiresIn: '7d' });
    return { token, user: { id: user.id, name: user.name, email: user.email, company: user.company, role: user.role } };
  });

  app.get('/auth/me', async (req, reply) => {
    try {
      await req.jwtVerify();
    } catch {
      return reply.code(401).send({ error: 'unauthorized' });
    }
    const payload = req.user as any;
    const user = await prisma.user.findUnique({ where: { id: payload.id } });
    if (!user) return reply.code(401).send({ error: 'unauthorized' });
    return { user: { id: user.id, name: user.name, email: user.email, company: user.company, role: user.role } };
  });
}

/** Guard for protected routes; optionally require admin. */
export function authGuard(requireAdmin = false) {
  return async (req: any, reply: any) => {
    try {
      await req.jwtVerify();
    } catch {
      return reply.code(401).send({ error: 'unauthorized' });
    }
    if (requireAdmin && req.user?.role !== 'admin') {
      return reply.code(403).send({ error: 'admin only' });
    }
  };
}
