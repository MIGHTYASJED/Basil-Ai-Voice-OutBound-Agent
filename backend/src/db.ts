// ───────────────────────────────────────────────────────────────────────────
// Data layer.
//
// This is a compact, Prisma-client-COMPATIBLE adapter built on Node's built-in
// `node:sqlite` (Node 22+). It implements exactly the query surface Basil uses
// (findMany/findUnique/findFirst/create/update/updateMany/upsert/delete/
// deleteMany/count, with where in/contains/gte/lt/not/OR, orderBy, take, and
// relation `include`). Every route file uses `prisma.<model>.<method>()`
// unchanged.
//
// Why not the Prisma engine? It requires downloading a platform binary, which
// fails in locked-down/offline environments. `node:sqlite` is built into the
// runtime — no downloads, no native compilation — so `npm run setup` is
// instant anywhere. The schema in prisma/schema.prisma remains the source of
// truth and the migration path to real Prisma + Postgres for production scale.
// ───────────────────────────────────────────────────────────────────────────

import { DatabaseSync } from 'node:sqlite';
import { nanoid } from 'nanoid';

const dbPath = (process.env.DATABASE_URL ?? 'file:./basil.db').replace(/^file:/, '');
const sqlite = new DatabaseSync(dbPath);
sqlite.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = OFF;');

type ColType = 'string' | 'int' | 'float' | 'bool' | 'date';
type Col = { type: ColType; default?: any; nullable?: boolean };
type Rel = { kind: 'one' | 'many'; target: string; local: string; foreign: string };
type ModelDef = { table: string; cols: Record<string, Col>; unique: string[]; relations: Record<string, Rel> };

const S = (def?: any): Col => ({ type: 'string', default: def });
const I = (def = 0): Col => ({ type: 'int', default: def });
const F = (def = 0): Col => ({ type: 'float', default: def });
const B = (def = false): Col => ({ type: 'bool', default: def });
const D = (): Col => ({ type: 'date' });
const NOW = (): Col => ({ type: 'date', default: 'now' });
const ID = (): Col => ({ type: 'string', default: 'cuid' });

const MODELS: Record<string, ModelDef> = {
  user: {
    table: 'User', unique: ['email'],
    cols: { id: ID(), name: S(), email: S(), company: S(), password: S(), role: S('dispatcher'), createdAt: NOW() },
    relations: { dispatcher: { kind: 'one', target: 'dispatcher', local: 'id', foreign: 'userId' } },
  },
  dispatcher: {
    table: 'Dispatcher', unique: ['userId'],
    cols: { id: ID(), userId: S(), phoneNumber: S(), phoneVerified: B(false), useWebrtc: B(false), availability: S('offline'), createdAt: NOW() },
    relations: { user: { kind: 'one', target: 'user', local: 'userId', foreign: 'id' } },
  },
  agentGroup: {
    table: 'AgentGroup', unique: [],
    cols: { id: ID(), name: S(), description: S(), color: S('green'), voiceConfig: S(), modelConfig: S(), createdAt: NOW() },
    relations: { agents: { kind: 'many', target: 'agent', local: 'id', foreign: 'groupId' }, prompts: { kind: 'many', target: 'promptVersion', local: 'id', foreign: 'agentGroupId' } },
  },
  agent: {
    table: 'Agent', unique: ['name', 'assignedNumberId'],
    cols: {
      id: ID(), name: S(), description: S(), role: S(), color: S('green'), groupId: S(),
      voiceProvider: S('elevenlabs'), voiceId: S('Josh'), voiceStability: F(0.6), voiceSpeed: F(1.0),
      firstMessage: S(), endCallMessage: S(),
      llmModel: S('gemini-3.1-flash-live-preview'), temperature: F(0.7), maxCallDurationSec: I(300),
      ringTimeoutSec: I(24), recordingEnabled: B(true), amdEnabled: B(true), preferredProvider: S('telnyx'),
      assignedNumberId: S(), status: S('idle'), createdById: S(), createdAt: NOW(),
    },
    relations: {
      assignedNumber: { kind: 'one', target: 'phoneNumber', local: 'assignedNumberId', foreign: 'id' },
      group: { kind: 'one', target: 'agentGroup', local: 'groupId', foreign: 'id' },
      prompts: { kind: 'many', target: 'promptVersion', local: 'id', foreign: 'agentId' },
      calls: { kind: 'many', target: 'call', local: 'id', foreign: 'agentId' },
    },
  },
  phoneNumber: {
    table: 'PhoneNumber', unique: ['e164'],
    cols: { id: ID(), e164: S(), label: S(), provider: S('telnyx'), providerId: S(), areaCode: S(), status: S('available'), dailyCallCount: I(0), lastUsedAt: D(), cooldownUntil: D(), createdAt: NOW() },
    relations: { agent: { kind: 'one', target: 'agent', local: 'id', foreign: 'assignedNumberId' } },
  },
  driver: {
    table: 'Driver', unique: ['phone'],
    cols: {
      id: ID(), name: S(), phone: S(), email: S(), truckType: S(), locationCity: S(), locationState: S(), truck: S(),
      mcNumber: S(), dotNumber: S(), status: S('active'), statusCalled: S('pending'), reliability: I(3),
      preferredLanes: S(), rateExpectation: S(), notes: S(), lastCalledAt: D(), sourceSheetId: S(), createdAt: NOW(),
    },
    relations: { calls: { kind: 'many', target: 'call', local: 'id', foreign: 'driverId' } },
  },
  loadGroup: {
    table: 'LoadGroup', unique: [],
    cols: { id: ID(), name: S(), createdAt: NOW() },
    relations: { loads: { kind: 'many', target: 'load', local: 'id', foreign: 'groupId' } },
  },
  load: {
    table: 'Load', unique: ['reference'],
    cols: {
      id: ID(), reference: S(), originCity: S(), originState: S(), destCity: S(), destState: S(), truckType: S(),
      weightLbs: { type: 'int' }, commodity: S(), miles: { type: 'int' },
      rateTotal: F(0), ratePerMile: { type: 'float' }, minRate: { type: 'float' },
      pickupAt: D(), deliveryAt: D(), status: S('available'), groupId: S(), bookedDriverId: S(),
      source: S('manual'), brokerInfo: S(), specialReq: S(), createdAt: NOW(),
    },
    relations: { group: { kind: 'one', target: 'loadGroup', local: 'groupId', foreign: 'id' }, calls: { kind: 'many', target: 'call', local: 'id', foreign: 'loadId' } },
  },
  campaign: {
    table: 'Campaign', unique: [],
    cols: {
      id: ID(), name: S(), status: S('draft'), loadIds: S('[]'), driverFilter: S(), agentIds: S('[]'), agentGroupId: S(),
      callWindowStart: S('08:00'), callWindowEnd: S('16:00'), timezone: S('America/Chicago'),
      maxRetries: I(2), retryDelayMin: I(120), parallelPerAgent: I(1),
      driversTotal: I(0), driversCalled: I(0), connectedCount: I(0), bookedCount: I(0),
      startedAt: D(), completedAt: D(), createdAt: NOW(),
    },
    relations: { calls: { kind: 'many', target: 'call', local: 'id', foreign: 'campaignId' } },
  },
  call: {
    table: 'Call', unique: [],
    cols: {
      id: ID(), campaignId: S(), agentId: S(), driverId: S(), loadId: S(), numberId: S(),
      provider: S('telnyx'), providerCallId: S(), fromNumber: S(), toNumber: S(),
      status: S('queued'), outcome: S(), amdResult: S(), sentiment: S(), cost: F(0), recordingUrl: S(),
      startedAt: D(), answeredAt: D(), endedAt: D(), durationSec: I(0), transferredToDispatcherId: S(), createdAt: NOW(),
    },
    relations: {
      campaign: { kind: 'one', target: 'campaign', local: 'campaignId', foreign: 'id' },
      agent: { kind: 'one', target: 'agent', local: 'agentId', foreign: 'id' },
      driver: { kind: 'one', target: 'driver', local: 'driverId', foreign: 'id' },
      load: { kind: 'one', target: 'load', local: 'loadId', foreign: 'id' },
      number: { kind: 'one', target: 'phoneNumber', local: 'numberId', foreign: 'id' },
      note: { kind: 'one', target: 'callNote', local: 'id', foreign: 'callId' },
      queueItem: { kind: 'one', target: 'dispatchQueue', local: 'id', foreign: 'callId' },
    },
  },
  callNote: {
    table: 'CallNote', unique: ['callId'],
    cols: { id: ID(), callId: S(), driverId: S(), loadId: S(), aiSummary: S(), driverInfo: S('[]'), transcript: S('[]'), outcome: S(), sentiment: S(), dispatcherNote: S(), dispatcherNoteBy: S(), createdAt: NOW() },
    relations: {},
  },
  dispatchQueue: {
    table: 'DispatchQueue', unique: ['callId'],
    cols: {
      id: ID(), callId: S(), driverId: S(), driverPhone: S(), driverName: S(), truckType: S(), location: S(),
      loadId: S(), loadRef: S(), loadRoute: S(), loadRate: S(), aiSummary: S(), transferReason: S(),
      parkedProviderCallId: S(), status: S('waiting'), lockedById: S(), lockedByName: S(),
      enqueuedAt: NOW(), pickedUpAt: D(), completedAt: D(),
    },
    relations: {
      driver: { kind: 'one', target: 'driver', local: 'driverId', foreign: 'id' },
      call: { kind: 'one', target: 'call', local: 'callId', foreign: 'id' },
    },
  },
  promptVersion: {
    table: 'PromptVersion', unique: [],
    cols: { id: ID(), agentId: S(), agentGroupId: S(), versionNumber: I(1), content: S(), tokenCount: I(0), changeNote: S(), createdBy: S(), createdAt: NOW() },
    relations: {},
  },
};

function ensureSchema() {
  for (const def of Object.values(MODELS)) {
    const colDefs = Object.entries(def.cols).map(([name, c]) => {
      const sqlType = c.type === 'int' || c.type === 'bool' ? 'INTEGER' : c.type === 'float' ? 'REAL' : 'TEXT';
      const pk = name === 'id' ? ' PRIMARY KEY' : '';
      return `"${name}" ${sqlType}${pk}`;
    });
    sqlite.exec(`CREATE TABLE IF NOT EXISTS "${def.table}" (${colDefs.join(', ')});`);
    for (const u of def.unique) {
      sqlite.exec(`CREATE UNIQUE INDEX IF NOT EXISTS "uq_${def.table}_${u}" ON "${def.table}" ("${u}");`);
    }
  }
}

function toDb(col: Col, value: any): any {
  if (value === undefined || value === null) return null;
  switch (col.type) {
    case 'bool': return value ? 1 : 0;
    case 'date': return value instanceof Date ? value.toISOString() : String(value);
    case 'int': return Math.trunc(Number(value));
    case 'float': return Number(value);
    default: return String(value);
  }
}
function fromDb(col: Col, value: any): any {
  if (value === null || value === undefined) return null;
  switch (col.type) {
    case 'bool': return value === 1 || value === '1' || value === true;
    case 'date': return new Date(value);
    case 'int': return Number(value);
    case 'float': return Number(value);
    default: return value;
  }
}
function rowFromDb(def: ModelDef, row: any): any {
  if (!row) return row;
  const out: any = {};
  for (const [name, col] of Object.entries(def.cols)) out[name] = fromDb(col, row[name]);
  return out;
}

function compileWhere(def: ModelDef, where: any): { sql: string; params: any[] } {
  if (!where || Object.keys(where).length === 0) return { sql: '', params: [] };
  const params: any[] = [];
  const clauses: string[] = [];
  for (const [key, cond] of Object.entries<any>(where)) {
    if (key === 'OR' && Array.isArray(cond)) {
      const ors = cond.map((c: any) => compileWhere(def, c));
      const sub = ors.filter((o) => o.sql).map((o) => `(${o.sql})`).join(' OR ');
      if (sub) { clauses.push(`(${sub})`); ors.forEach((o) => params.push(...o.params)); }
      continue;
    }
    if (key === 'AND' && Array.isArray(cond)) {
      const ands = cond.map((c: any) => compileWhere(def, c));
      const sub = ands.filter((a) => a.sql).map((a) => `(${a.sql})`).join(' AND ');
      if (sub) { clauses.push(`(${sub})`); ands.forEach((a) => params.push(...a.params)); }
      continue;
    }
    const col = def.cols[key];
    if (!col) continue;
    if (cond !== null && typeof cond === 'object' && !(cond instanceof Date)) {
      if ('in' in cond) {
        const arr = cond.in as any[];
        if (!arr.length) { clauses.push('0=1'); continue; }
        clauses.push(`"${key}" IN (${arr.map(() => '?').join(',')})`);
        arr.forEach((v) => params.push(toDb(col, v)));
      }
      if ('notIn' in cond) {
        const arr = cond.notIn as any[];
        if (arr.length) { clauses.push(`"${key}" NOT IN (${arr.map(() => '?').join(',')})`); arr.forEach((v) => params.push(toDb(col, v))); }
      }
      if ('contains' in cond) { clauses.push(`"${key}" LIKE ?`); params.push(`%${cond.contains}%`); }
      if ('gte' in cond) { clauses.push(`"${key}" >= ?`); params.push(toDb(col, cond.gte)); }
      if ('gt' in cond) { clauses.push(`"${key}" > ?`); params.push(toDb(col, cond.gt)); }
      if ('lte' in cond) { clauses.push(`"${key}" <= ?`); params.push(toDb(col, cond.lte)); }
      if ('lt' in cond) { clauses.push(`"${key}" < ?`); params.push(toDb(col, cond.lt)); }
      if ('not' in cond) {
        if (cond.not === null) clauses.push(`"${key}" IS NOT NULL`);
        else { clauses.push(`"${key}" != ?`); params.push(toDb(col, cond.not)); }
      }
    } else if (cond === null) {
      clauses.push(`"${key}" IS NULL`);
    } else {
      clauses.push(`"${key}" = ?`);
      params.push(toDb(col, cond));
    }
  }
  return { sql: clauses.join(' AND '), params };
}

function compileOrderBy(orderBy: any): string {
  if (!orderBy) return '';
  const entries = Array.isArray(orderBy) ? orderBy : [orderBy];
  const parts: string[] = [];
  for (const o of entries) {
    for (const [field, dir] of Object.entries<any>(o)) parts.push(`"${field}" ${String(dir).toUpperCase() === 'DESC' ? 'DESC' : 'ASC'}`);
  }
  return parts.length ? `ORDER BY ${parts.join(', ')}` : '';
}

function applyInclude(def: ModelDef, row: any, include: any): any {
  if (!row || !include) return row;
  for (const [relName, sub] of Object.entries<any>(include)) {
    const rel = def.relations[relName];
    if (!rel || !sub) continue;
    const targetDef = MODELS[rel.target];
    const localVal = row[rel.local];
    const where: any = {};
    where[rel.foreign] = localVal ?? null;
    if (rel.kind === 'one') {
      const found = localVal == null ? null : (queryMany(rel.target, { where, take: 1 })[0] ?? null);
      row[relName] = found && typeof sub === 'object' && sub.include ? applyInclude(targetDef, found, sub.include) : found;
    } else {
      const list = localVal == null ? [] : queryMany(rel.target, { where, orderBy: sub.orderBy });
      row[relName] = typeof sub === 'object' && sub.include ? list.map((r: any) => applyInclude(targetDef, r, sub.include)) : list;
    }
  }
  return row;
}

function queryMany(model: string, args: any): any[] {
  const def = MODELS[model];
  const { sql: whereSql, params } = compileWhere(def, args?.where);
  let q = `SELECT * FROM "${def.table}"`;
  if (whereSql) q += ` WHERE ${whereSql}`;
  q += ' ' + compileOrderBy(args?.orderBy);
  if (args?.take) q += ` LIMIT ${Math.trunc(args.take)}`;
  const stmt = sqlite.prepare(q.trim());
  const rows = (stmt.all(...params) as any[]).map((r) => rowFromDb(def, r));
  if (args?.include) return rows.map((r) => applyInclude(def, r, args.include));
  return rows;
}

function buildInsert(def: ModelDef, data: any): any {
  const record: any = {};
  for (const [name, col] of Object.entries(def.cols)) {
    let v = data[name];
    if (v === undefined) {
      if (col.default === 'cuid') v = nanoid();
      else if (col.default === 'now') v = new Date();
      else if (col.default !== undefined) v = col.default;
      else v = null;
    }
    record[name] = v;
  }
  return record;
}

function resolveUpdate(def: ModelDef, existing: any, data: any): any {
  const patch: any = {};
  for (const [k, v] of Object.entries<any>(data)) {
    if (v === undefined) continue;
    if (!def.cols[k]) continue;
    if (v !== null && typeof v === 'object' && !(v instanceof Date) && 'increment' in v) {
      patch[k] = Number(existing[k] ?? 0) + Number(v.increment);
    } else if (v !== null && typeof v === 'object' && !(v instanceof Date) && 'decrement' in v) {
      patch[k] = Number(existing[k] ?? 0) - Number(v.decrement);
    } else {
      patch[k] = v;
    }
  }
  return patch;
}
function runUpdate(def: ModelDef, where: any, patch: any) {
  const cols = Object.keys(patch);
  if (!cols.length) return;
  const { sql, params } = compileWhere(def, where);
  const setSql = cols.map((c) => `"${c}" = ?`).join(', ');
  const setParams = cols.map((c) => toDb(def.cols[c], patch[c]));
  sqlite.prepare(`UPDATE "${def.table}" SET ${setSql}${sql ? ` WHERE ${sql}` : ''}`).run(...setParams, ...params);
}

function makeDelegate(model: string) {
  const def = MODELS[model];
  return {
    findMany: async (args: any = {}) => queryMany(model, args),
    findFirst: async (args: any = {}) => queryMany(model, { ...args, take: 1 })[0] ?? null,
    findUnique: async (args: any) => queryMany(model, { ...args, take: 1 })[0] ?? null,
    count: async (args: any = {}) => {
      const { sql, params } = compileWhere(def, args?.where);
      const q = `SELECT COUNT(*) as n FROM "${def.table}"${sql ? ` WHERE ${sql}` : ''}`;
      return Number((sqlite.prepare(q).get(...params) as any).n);
    },
    create: async (args: any) => {
      const rec = buildInsert(def, args.data ?? {});
      const cols = Object.keys(rec);
      sqlite.prepare(`INSERT INTO "${def.table}" (${cols.map((c) => `"${c}"`).join(',')}) VALUES (${cols.map(() => '?').join(',')})`).run(...cols.map((c) => toDb(def.cols[c], rec[c])));
      const created = queryMany(model, { where: { id: rec.id }, take: 1 })[0];
      return args.include ? applyInclude(def, created, args.include) : created;
    },
    update: async (args: any) => {
      const existing = queryMany(model, { where: args.where, take: 1 })[0];
      if (!existing) throw new Error(`${def.table} record to update not found`);
      runUpdate(def, args.where, resolveUpdate(def, existing, args.data ?? {}));
      const updated = queryMany(model, { where: { id: existing.id }, take: 1 })[0];
      return args.include ? applyInclude(def, updated, args.include) : updated;
    },
    updateMany: async (args: any) => {
      const rows = queryMany(model, { where: args.where });
      for (const r of rows) runUpdate(def, { id: r.id }, resolveUpdate(def, r, args.data ?? {}));
      return { count: rows.length };
    },
    upsert: async (args: any) => {
      const existing = queryMany(model, { where: args.where, take: 1 })[0];
      if (existing) {
        runUpdate(def, { id: existing.id }, resolveUpdate(def, existing, args.update ?? {}));
        return queryMany(model, { where: { id: existing.id }, take: 1 })[0];
      }
      const rec = buildInsert(def, { ...args.where, ...args.create });
      const cols = Object.keys(rec);
      sqlite.prepare(`INSERT INTO "${def.table}" (${cols.map((c) => `"${c}"`).join(',')}) VALUES (${cols.map(() => '?').join(',')})`).run(...cols.map((c) => toDb(def.cols[c], rec[c])));
      return queryMany(model, { where: { id: rec.id }, take: 1 })[0];
    },
    delete: async (args: any) => {
      const { sql, params } = compileWhere(def, args.where);
      sqlite.prepare(`DELETE FROM "${def.table}"${sql ? ` WHERE ${sql}` : ''}`).run(...params);
      return { ok: true as const };
    },
    deleteMany: async (args: any = {}) => {
      const { sql, params } = compileWhere(def, args?.where);
      sqlite.prepare(`DELETE FROM "${def.table}"${sql ? ` WHERE ${sql}` : ''}`).run(...params);
      return { ok: true as const };
    },
  };
}

ensureSchema();

type Row = any; // rows are dynamic; models are defined in MODELS above
export type Delegate = {
  findMany(args?: any): Promise<Row[]>;
  findFirst(args?: any): Promise<Row | null>;
  findUnique(args: any): Promise<Row | null>;
  count(args?: any): Promise<number>;
  create(args: any): Promise<Row>;
  update(args: any): Promise<Row>;
  updateMany(args: any): Promise<{ count: number }>;
  upsert(args: any): Promise<Row>;
  delete(args: any): Promise<{ ok: true }>;
  deleteMany(args?: any): Promise<{ ok: true }>;
};
type ModelName = 'user' | 'dispatcher' | 'agentGroup' | 'agent' | 'phoneNumber' | 'driver' | 'loadGroup' | 'load' | 'campaign' | 'call' | 'callNote' | 'dispatchQueue' | 'promptVersion';

export const prisma = {} as Record<ModelName, Delegate>;
for (const model of Object.keys(MODELS)) (prisma as any)[model] = makeDelegate(model);

export { sqlite };
