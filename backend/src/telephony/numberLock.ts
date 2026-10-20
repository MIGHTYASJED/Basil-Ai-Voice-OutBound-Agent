// Guarantees one in-flight outbound call per phone number, preventing
// collisions on a single caller ID. In production this becomes a Redis
// lock (SET NX with TTL) so it works across multiple server instances;
// the interface is identical so swapping is trivial.

type Lock = { acquiredAt: number; ttlMs: number };
const locks = new Map<string, Lock>();

export function acquireNumberLock(numberId: string, ttlMs = 300_000): boolean {
  const existing = locks.get(numberId);
  const now = Date.now();
  if (existing && now - existing.acquiredAt < existing.ttlMs) {
    return false; // still held
  }
  locks.set(numberId, { acquiredAt: now, ttlMs });
  return true;
}

export function releaseNumberLock(numberId: string): void {
  locks.delete(numberId);
}

export function isNumberLocked(numberId: string): boolean {
  const existing = locks.get(numberId);
  if (!existing) return false;
  if (Date.now() - existing.acquiredAt >= existing.ttlMs) {
    locks.delete(numberId);
    return false;
  }
  return true;
}
