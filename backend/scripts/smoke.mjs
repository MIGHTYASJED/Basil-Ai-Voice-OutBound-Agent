// End-to-end API smoke test (simulation mode). Run with the backend up:
//   node scripts/smoke.mjs
const BASE = process.env.API ?? 'http://localhost:4000';
let pass = 0, fail = 0;
const ok = (cond, msg) => { if (cond) { pass++; console.log('  ✓', msg); } else { fail++; console.log('  ✗', msg); } };
async function req(method, path, body, token) {
  const r = await fetch(BASE + path, { method, headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: body ? JSON.stringify(body) : undefined });
  const ct = r.headers.get('content-type') ?? '';
  return { status: r.status, body: ct.includes('json') ? await r.json() : await r.text() };
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

console.log('auth');
const admin = (await req('POST', '/auth/login', { email: 'Admin@Basil.demo', password: 'password123' })).body.token;
ok(!!admin, 'admin login (case-insensitive email)');
const disp = (await req('POST', '/auth/login', { email: 'dispatch@basil.demo', password: 'password123' })).body.token;
ok(!!disp, 'dispatcher login');
ok((await req('POST', '/auth/signup', { name: 'Eve', email: `eve${Date.now()}@x.com`, password: 'password123', role: 'admin' })).status === 403, 'random signup cannot become admin');
ok((await req('POST', '/auth/signup', { name: 'E', email: 'bad', password: '1' })).status === 400, 'invalid signup → 400 not 500');
ok((await req('GET', '/agents')).status === 401, 'protected route without token → 401');
ok((await req('POST', '/agents', { name: 'x' }, disp)).status === 403, 'dispatcher cannot create agents');

console.log('agents');
const ag = (await req('GET', '/agents', null, admin)).body;
ok(ag.agents.length >= 4, `list agents (${ag.agents.length})`);
const src = ag.agents[0];
await req('POST', `/agents/${src.id}/prompt`, { content: 'You are {AGENT_NAME}. Custom prompt for smoke test with enough length.' }, admin);
const dup = await req('POST', `/agents/${src.id}/duplicate`, null, admin);
ok(dup.status === 201, 'duplicate agent');
const dupVersions = (await req('GET', `/agents/${dup.body.id}/prompt/versions`, null, admin)).body;
ok(dupVersions.length === 1 && dupVersions[0].content.includes('Custom prompt'), 'duplicate carries the prompt over');
ok((await req('POST', '/agents', { name: src.name }, admin)).status === 409, 'duplicate agent name → 409');
ok((await req('DELETE', `/agents/${dup.body.id}`, null, admin)).status === 200, 'delete idle agent');

console.log('numbers');
const nums = (await req('GET', '/phone-numbers', null, admin)).body;
const assigned = nums.find((n) => n.assignedTo);
ok((await req('DELETE', `/phone-numbers/${assigned.id}`, null, admin)).status === 409, 'cannot delete an assigned number');
const add = await req('POST', '/phone-numbers', { numbers: [{ e164: `+1555${String(Date.now()).slice(-7)}` }] }, admin);
ok(add.body.created === 1, 'add number');

console.log('drivers + loads');
const phone = `(214) 555-${String(Date.now()).slice(-4)}`;
const d1 = await req('POST', '/drivers', { name: 'Smoke Driver', phone, truckType: 'Dry Van', locationState: 'TX' }, admin);
ok(d1.status === 201 && d1.body.phone.startsWith('+1'), 'create driver (phone normalized to E.164)');
ok((await req('POST', '/drivers', { name: 'Dup', phone: phone.replace(/\D/g, '') }, admin)).status === 409, 'same phone in another format → 409');
const imp = await req('POST', '/drivers/import', { csv: `name,phone,truck_type,state\nCsv One,+1972555${String(Date.now()).slice(-4)},Dry Van,TX\nNo Phone,,Dry Van,TX` }, admin);
ok(imp.body.imported === 1 && imp.body.skipped === 1, 'driver CSV import skips rows without phone');
const load = await req('POST', '/loads', { originCity: 'Dallas', originState: 'TX', destCity: 'Memphis', destState: 'TN', truckType: 'Dry Van', miles: 452, rateTotal: 1300, minRate: 1200 }, admin);
ok(load.status === 201, 'create load');
const grp = await req('POST', '/load-groups', { name: 'Smoke group' }, admin);
ok((await req('POST', `/load-groups/${grp.body.id}/loads`, { loadIds: [load.body.id] }, admin)).body.moved === 1, 'move load into group');
ok((await req('PATCH', `/load-groups/${grp.body.id}`, { name: 'Smoke group 2' }, admin)).status === 200, 'rename load group');

console.log('campaign end-to-end (simulation)');
ok((await req('POST', '/campaigns', { name: 'Bad', loadIds: [], agentIds: [], launch: true }, admin)).status === 400, 'cannot launch with no agents/loads');
// isolated roster so other running campaigns can't take these drivers
const tag = String(Date.now()).slice(-5);
for (let i = 0; i < 4; i++) await req('POST', '/drivers', { name: `Power ${i}`, phone: `+1469555${tag.slice(-2)}${i}${i}`, truckType: `Power Only ${tag}`, locationState: 'TX' }, admin);
const agentsNow = (await req('GET', '/agents', null, admin)).body.agents.filter((a) => a.name === 'Basil-Callback').map((a) => a.id);
const camp = await req('POST', '/campaigns', { name: `Smoke ${Date.now()}`, loadIds: [load.body.id], agentIds: agentsNow, driverFilter: { truckType: `Power Only ${tag}` }, maxRetries: 0, launch: true }, admin);
ok(camp.status === 201 && camp.body.status === 'Active', 'create + launch campaign (status shows Active)');
let detail;
for (let i = 0; i < 25; i++) {
  await sleep(2000);
  detail = (await req('GET', `/campaigns/${camp.body.id}`, null, admin)).body;
  if (detail.status === 'Completed') break;
}
ok(detail.stats.calls > 0, `campaign placed calls (${detail.stats.calls})`);
ok(detail.called > 0 && detail.called <= detail.total, `progress counts distinct drivers (${detail.called}/${detail.total})`);
ok(detail.status === 'Completed', `campaign auto-completes when no drivers remain (status=${detail.status})`);
const agentsAfter = (await req('GET', '/agents', null, admin)).body.agents;
ok(agentsAfter.filter((a) => agentsNow.includes(a.id)).every((a) => a.status !== 'live' || a.activeCalls > 0), 'agents go back to idle after their calls');
const csv = await req('GET', `/campaigns/${camp.body.id}/export`, null, admin);
ok(typeof csv.body === 'string' && csv.body.startsWith('time,agent'), 'campaign CSV export');
const copy = await req('POST', `/campaigns/${camp.body.id}/duplicate`, null, admin);
ok(copy.status === 201 && copy.body.status === 'Draft', 'duplicate campaign as draft');

console.log('dispatcher queue');
const queue = (await req('GET', '/queue', null, disp)).body;
ok(queue.length > 0, `queue has transferred drivers (${queue.length})`);
const item = queue.find((q) => q.status === 'waiting');
const [a, b] = await Promise.all([req('POST', `/queue/${item.id}/pickup`, null, disp), req('POST', `/queue/${item.id}/pickup`, null, admin)]);
ok([a.status, b.status].sort().join() === '200,409', `optimistic lock: one wins, one gets 409 (${a.status}/${b.status})`);
const end = await req('POST', `/queue/${item.id}/end`, { outcome: 'booked', note: 'Booked at $3.05/mi' }, disp);
ok(end.status === 200, 'end call with outcome');
const recent = (await req('GET', '/queue/recent', null, disp)).body;
ok(recent.some((r) => r.id === item.id && r.outcome === 'booked'), 'recently-handled list shows the booking');
const callDetail = (await req('GET', `/calls/${item.callId}`, null, admin)).body;
ok(callDetail.outcome === 'booked' && callDetail.dispatcherNote?.includes('3.05'), 'call record updated with booking + note');
ok(Array.isArray(callDetail.transcript) && callDetail.transcript.length > 0, 'transferred call has a transcript');
const campCalls = (await req('GET', `/calls?campaignId=${camp.body.id}`, null, admin)).body;
const answered = campCalls.find((c) => c.outcome !== 'no_answer');
if (answered) ok(((await req('GET', `/calls/${answered.id}`, null, admin)).body.transcript ?? []).length > 0, 'answered simulated call saved a transcript');

console.log('analytics + mission');
const an = (await req('GET', '/analytics?days=7', null, admin)).body;
ok(an.funnel.dialed > 0 && Array.isArray(an.leaderboard), 'analytics returns funnel + leaderboard');
const ms = (await req('GET', '/mission', null, admin)).body;
ok(typeof ms.stats.callsToday === 'number', 'mission control stats');

console.log('DNC');
ok((await req('POST', `/drivers/${d1.body.id}/dnc`, null, admin)).status === 200, 'mark driver DNC');
const dnc = (await req('GET', `/drivers/${d1.body.id}`, null, admin)).body;
ok(dnc.status === 'Dnc', 'driver is DNC');

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
