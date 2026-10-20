import bcrypt from 'bcryptjs';
import { prisma } from './db.js';
import { toJson } from './lib/json.js';
import { DEFAULT_PROMPT_TEMPLATE, estimateTokens } from './bridge/prompt.js';

// Seeds data that mirrors the frontend mock so the app looks identical on
// first run — but now every row is real and editable in the database.

async function main() {
  console.log('🌱 Seeding Basil...');

  // wipe (dev convenience)
  await prisma.dispatchQueue.deleteMany();
  await prisma.callNote.deleteMany();
  await prisma.call.deleteMany();
  await prisma.promptVersion.deleteMany();
  await prisma.agent.deleteMany();
  await prisma.agentGroup.deleteMany();
  await prisma.phoneNumber.deleteMany();
  await prisma.load.deleteMany();
  await prisma.loadGroup.deleteMany();
  await prisma.driver.deleteMany();
  await prisma.campaign.deleteMany();
  await prisma.dispatcher.deleteMany();
  await prisma.user.deleteMany();

  // ── Users ──
  const adminPass = await bcrypt.hash('password123', 10);
  const admin = await prisma.user.create({ data: { name: 'Alex Morgan', email: 'admin@basil.demo', company: 'Northfleet Dispatch', password: adminPass, role: 'admin' } });
  const dispUser = await prisma.user.create({ data: { name: 'Dana Reed', email: 'dispatch@basil.demo', company: 'Northfleet Dispatch', password: adminPass, role: 'dispatcher' } });
  await prisma.dispatcher.create({ data: { userId: dispUser.id, phoneNumber: '+15550100200', phoneVerified: true, availability: 'available' } });
  console.log('  ✓ users (admin: admin@basil.demo / password123)');

  // ── Phone numbers (14) ──
  const numberDefs = [
    ['+15550123456', 'Main Line', 'telnyx', '469', 'assigned'],
    ['+15550123457', 'Line 2', 'telnyx', '469', 'assigned'],
    ['+15550123458', 'Reefer Line', 'telnyx', '713', 'assigned'],
    ['+15550123459', 'Night Line', 'telnyx', '214', 'assigned'],
    ['+15550123460', 'Callback Line', 'telnyx', '972', 'assigned'],
    ['+15550123461', 'Backup 1', 'telnyx', '469', 'available'],
    ['+15550123462', 'Backup 2', 'telnyx', '469', 'available'],
    ['+15550123463', 'Line 6', 'vapi', '713', 'available'],
    ['+15550123464', 'Line 7', 'vapi', '915', 'available'],
    ['+15550123465', 'Line 8', 'twilio', '210', 'available'],
    ['+15550123466', 'Line 9', 'twilio', '512', 'available'],
    ['+15550123467', 'Line 10', 'twilio', '817', 'available'],
    ['+15550123468', 'Line 11', 'twilio', '832', 'available'],
    ['+15550123469', 'Old Line', 'twilio', '214', 'disabled'],
  ] as const;
  const numbers: Record<string, string> = {};
  for (const [e164, label, provider, areaCode, status] of numberDefs) {
    const n = await prisma.phoneNumber.create({ data: { e164, label, provider, areaCode: `${areaCode} — TX`, status } });
    numbers[e164] = n.id;
  }
  console.log('  ✓ 14 phone numbers');

  // ── Agent group ──
  const group = await prisma.agentGroup.create({ data: { name: 'Dallas Cold Callers', description: 'Cold calling team for Dallas outbound', color: 'green' } });

  // ── Agents (5) ──
  const agentDefs = [
    ['Basil-01', 'Cold Caller — Dry Van', 'Puck', 0.7, '+15550123456', 'idle', group.id],
    ['Basil-02', 'General Dispatch', 'Charon', 0.6, '+15550123457', 'idle', group.id],
    ['Basil-Reefer', 'Reefer Specialist', 'Kore', 0.7, '+15550123458', 'idle', null],
    ['Basil-Night', 'After Hours', 'Aoede', 0.5, '+15550123459', 'paused', null],
    ['Basil-Callback', 'Warm Follow-up', 'Zephyr', 0.6, '+15550123460', 'idle', null],
  ] as const;
  const agents: Record<string, string> = {};
  for (const [name, role, voiceId, temperature, numE164, status, groupId] of agentDefs) {
    const a = await prisma.agent.create({
      data: { name, role, voiceId, voiceProvider: 'gemini', temperature, status, groupId: groupId ?? undefined, assignedNumberId: numbers[numE164], llmModel: 'gemini-3.1-flash-live-preview' },
    });
    agents[name] = a.id;
    await prisma.promptVersion.create({ data: { agentId: a.id, versionNumber: 1, content: DEFAULT_PROMPT_TEMPLATE, tokenCount: estimateTokens(DEFAULT_PROMPT_TEMPLATE), changeNote: 'Initial version' } });
  }
  console.log('  ✓ 5 agents + 1 group');

  // ── Load groups + loads ──
  const lgDallas = await prisma.loadGroup.create({ data: { name: 'Dallas Outbound May 29' } });
  const lgReefer = await prisma.loadGroup.create({ data: { name: 'Reefer West Coast' } });
  const loadDefs = [
    ['#4521', 'Dallas', 'TX', 'Memphis', 'TN', 'Dry Van', 340, 969, 2.85, 'available', lgDallas.id],
    ['#4533', 'Houston', 'TX', 'Atlanta', 'GA', 'Reefer', 780, 2418, 3.10, 'offered', lgReefer.id],
    ['#4540', 'Austin', 'TX', 'Nashville', 'TN', 'Dry Van', 820, 2132, 2.60, 'booked', lgDallas.id],
    ['#4548', 'San Antonio', 'TX', 'Jacksonville', 'FL', 'Reefer', 1100, 3190, 2.90, 'available', lgReefer.id],
    ['#4555', 'El Paso', 'TX', 'Phoenix', 'AZ', 'Flatbed', 440, 1496, 3.40, 'available', null],
    ['#4561', 'Fort Worth', 'TX', 'Denver', 'CO', 'Dry Van', 829, 2030, 2.45, 'offered', lgDallas.id],
    ['#4570', 'Laredo', 'TX', 'Chicago', 'IL', 'Reefer', 1193, 3520, 2.95, 'available', lgReefer.id],
  ] as const;
  const loads: Record<string, string> = {};
  for (const [reference, oc, os, dc, ds, type, miles, rate, perMi, status, gid] of loadDefs) {
    const l = await prisma.load.create({
      data: { reference, originCity: oc, originState: os, destCity: dc, destState: ds, truckType: type, miles, rateTotal: rate, ratePerMile: perMi, minRate: Math.round(rate * 0.9), status, groupId: gid ?? undefined },
    });
    loads[reference] = l.id;
  }
  console.log('  ✓ 7 loads + 2 groups');

  // ── Drivers (8) ──
  const driverDefs = [
    ['Marcus Johnson', '+15558912345', 'marcus.j@email.com', 'Dry Van', 'Dallas', 'TX', '2019 Freightliner Cascadia', 4, 'active'],
    ['Sarah Chen', '+15552345678', 'sarah.c@email.com', 'Reefer', 'Houston', 'TX', '2021 Kenworth T680', 3, 'active'],
    ['James Rivera', '+15555551234', 'j.rivera@email.com', 'Flatbed', 'Fort Worth', 'TX', '2020 Peterbilt 579', 5, 'active'],
    ['Michael Torres', '+15552001112', 'm.torres@email.com', 'Dry Van', 'Austin', 'TX', '2018 Volvo VNL', 4, 'active'],
    ['David Park', '+15553332244', 'd.park@email.com', 'Reefer', 'Memphis', 'TN', '2022 Freightliner', 2, 'dnc'],
    ['Lisa Wang', '+15554449988', 'l.wang@email.com', 'Dry Van', 'Phoenix', 'AZ', '2019 Kenworth', 4, 'active'],
    ['Diego Alvarez', '+15557780091', 'd.alvarez@email.com', 'Reefer', 'El Paso', 'TX', '2020 Peterbilt', 4, 'active'],
    ['Tasha Cole', '+15558877762', 't.cole@email.com', 'Dry Van', 'Atlanta', 'GA', '2021 Volvo', 5, 'active'],
  ] as const;
  const drivers: Record<string, string> = {};
  for (const [name, phone, email, type, city, state, truck, rating, status] of driverDefs) {
    const d = await prisma.driver.create({
      data: { name, phone, email, truckType: type, locationCity: city, locationState: state, truck, reliability: rating, status, statusCalled: status === 'dnc' ? 'completed_dnc' : 'pending' },
    });
    drivers[name] = d.id;
  }
  // A larger, realistic roster so campaigns have people to call. All numbers
  // use the 555-01XX range, which is reserved for fiction and never rings anyone.
  const first = ['Carlos', 'Ahmed', 'Brittany', 'Kevin', 'Rosa', 'Tyrone', 'Jake', 'Ana', 'Dmitri', 'Latoya', 'Hector', 'Megan', 'Raj', 'Curtis', 'Yolanda', 'Brandon', 'Ivan', 'Shanice', 'Luis', 'Travis', 'Priya', 'Dwayne', 'Olga', 'Mason', 'Keisha', 'Andre', 'Natalia', 'Cody', 'Fatima', 'Ray'];
  const last = ['Mendoza', 'Khan', 'Holt', 'Nguyen', 'Delgado', 'Brooks', 'Miller', 'Souza', 'Petrov', 'Grant', 'Ramos', 'Fisher', 'Patel', 'Lane', 'Price', 'Ward', 'Kowalski', 'Hayes', 'Ortega', 'Boone', 'Shah', 'Coleman', 'Ivanova', 'Reed', 'Morris', 'Jenkins', 'Rossi', 'Tate', 'Ali', 'Dunn'];
  const places = [['Dallas', 'TX'], ['Houston', 'TX'], ['San Antonio', 'TX'], ['Oklahoma City', 'OK'], ['Memphis', 'TN'], ['Little Rock', 'AR'], ['Shreveport', 'LA'], ['Atlanta', 'GA'], ['Phoenix', 'AZ'], ['Denver', 'CO'], ['Kansas City', 'MO'], ['Laredo', 'TX']];
  const types = ['Dry Van', 'Dry Van', 'Reefer', 'Flatbed'];
  const trucks = ['2019 Freightliner Cascadia', '2021 Kenworth T680', '2020 Peterbilt 579', '2018 Volvo VNL', '2022 International LT'];
  const areas = ['214', '713', '210', '405', '901', '501', '318', '404', '602', '303', '816', '956'];
  for (let i = 0; i < 30; i++) {
    const [city, state] = places[i % places.length];
    const name = `${first[i]} ${last[(i * 7) % last.length]}`;
    const d = await prisma.driver.create({
      data: {
        name, phone: `+1${areas[i % areas.length]}55501${String(i).padStart(2, '0')}`,
        email: `${first[i].toLowerCase()}.${last[(i * 7) % last.length].toLowerCase()}@example.com`,
        truckType: types[i % types.length], locationCity: city, locationState: state, truck: trucks[i % trucks.length],
        reliability: 3 + (i % 3), status: 'active', statusCalled: 'pending',
      },
    });
    drivers[name] = d.id;
  }
  console.log(`  ✓ ${Object.keys(drivers).length} drivers`);

  // ── Campaigns ──
  // Campaign counters are computed from real calls, so they start at zero and
  // fill in as the simulated dialer works through the roster.
  const countFor = (truckType: string) => prisma.driver.count({ where: { status: 'active', truckType } });
  await prisma.campaign.create({ data: { name: 'Summer Reefer Push', status: 'calling', loadIds: toJson([loads['#4533'], loads['#4548']]), agentIds: toJson([agents['Basil-Reefer']]), driverFilter: toJson({ truckType: 'Reefer' }), driversTotal: await countFor('Reefer'), startedAt: new Date() } });
  await prisma.campaign.create({ data: { name: 'Dallas Dry Van', status: 'calling', loadIds: toJson([loads['#4521'], loads['#4561']]), agentIds: toJson([agents['Basil-01'], agents['Basil-02']]), driverFilter: toJson({ truckType: 'Dry Van' }), driversTotal: await countFor('Dry Van'), startedAt: new Date() } });
  await prisma.campaign.create({ data: { name: 'Flatbed West', status: 'paused', loadIds: toJson([loads['#4555']]), agentIds: toJson([agents['Basil-Callback']]), driverFilter: toJson({ truckType: 'Flatbed' }), driversTotal: await countFor('Flatbed') } });
  await prisma.campaign.create({ data: { name: 'Q3 Push', status: 'draft', loadIds: toJson([]), agentIds: toJson([]), driversTotal: 0 } });
  console.log('  ✓ campaigns');

  // ── A couple of historical calls + notes (for Call Log / driver history) ──
  const c1 = await prisma.call.create({
    data: { agentId: agents['Basil-01'], driverId: drivers['Marcus Johnson'], loadId: loads['#4521'], numberId: numbers['+15550123456'], provider: 'telnyx', fromNumber: '+15550123456', toNumber: '+15558912345', status: 'transferred', outcome: 'transferred', durationSec: 83, answeredAt: new Date(), endedAt: new Date(), sentiment: 'Neutral-Positive', cost: 0.18 },
  });
  await prisma.callNote.create({ data: { callId: c1.id, driverId: drivers['Marcus Johnson'], loadId: loads['#4521'], aiSummary: 'Driver interested in Load #4521 but wants $3/mi instead of $2.85. Transferred for negotiation.', transcript: toJson([
    { speaker: 'BASIL', text: "Hey Marcus, this is Basil, an AI assistant calling for Northfleet Dispatch. Got a dry van load out of Dallas tomorrow — you running?", t: 1 },
    { speaker: 'DRIVER', text: "Yeah I'm around Fort Worth. Where's it going?", t: 7 },
    { speaker: 'BASIL', text: 'Dallas to Memphis, 340 miles, $969 — that works out to $2.85 a mile, pickup 6 AM.', t: 11 },
    { speaker: 'DRIVER', text: "I've run that lane four times. I need three bucks a mile.", t: 18 },
    { speaker: 'BASIL', text: "Understood — let me get a dispatcher on the line who can talk rate with you. One moment, Marcus.", t: 23 },
  ]), driverInfo: toJson(['Current location: Fort Worth, TX', 'Available: Tomorrow 6 AM', 'Preferred rate: $3.00/mi', 'Has run Dallas→Memphis 4 times']), outcome: 'transferred', sentiment: 'Neutral-Positive' } });

  // ── Live dispatch queue items (mirror the mock) ──
  await prisma.dispatchQueue.create({ data: { callId: c1.id, driverId: drivers['Marcus Johnson'], driverName: 'Marcus Johnson', driverPhone: '+15558912345', truckType: 'Dry Van', location: 'Fort Worth, TX', loadId: loads['#4521'], loadRef: '#4521', loadRoute: 'Dallas TX → Memphis TN', loadRate: '$969 ($2.85/mi)', aiSummary: 'Driver wants to negotiate rate on Load #4521. Interested but firm on $3/mi.', transferReason: 'rate_negotiation', status: 'waiting' } });

  const c2 = await prisma.call.create({ data: { agentId: agents['Basil-02'], driverId: drivers['Sarah Chen'], loadId: loads['#4533'], numberId: numbers['+15550123457'], provider: 'telnyx', fromNumber: '+15550123457', toNumber: '+15552345678', status: 'transferred', outcome: 'transferred', durationSec: 64, answeredAt: new Date(), endedAt: new Date(), cost: 0.14 } });
  await prisma.callNote.create({ data: { callId: c2.id, driverId: drivers['Sarah Chen'], aiSummary: 'Has questions about detention policy and wants to talk to a human.', driverInfo: toJson(['Asking about detention pay', 'Wants $50/hr after 2 hours']), transcript: toJson([
    { speaker: 'BASIL', text: 'Hi Sarah, this is Basil, an AI assistant for Northfleet Dispatch. I have a reefer load Houston to Atlanta at $3.10 a mile — interested?', t: 1 },
    { speaker: 'DRIVER', text: "Maybe. What's the detention policy on that shipper?", t: 8 },
    { speaker: 'BASIL', text: "Good question — I'll connect you with a dispatcher who can confirm detention terms. Hold just a moment.", t: 14 },
  ]), outcome: 'transferred' } });
  await prisma.dispatchQueue.create({ data: { callId: c2.id, driverId: drivers['Sarah Chen'], driverName: 'Sarah Chen', driverPhone: '+15552345678', truckType: 'Reefer', location: 'Memphis, TN', loadId: loads['#4533'], loadRef: '#4533', loadRoute: 'Houston TX → Atlanta GA', loadRate: '$2,418 ($3.10/mi)', aiSummary: 'Has questions about detention policy and wants to talk to a human.', transferReason: 'complex_question', status: 'waiting' } });

  // they're already on hold for a dispatcher — don't let the dialer ring them again
  await prisma.driver.updateMany({ where: { id: { in: [drivers['Marcus Johnson'], drivers['Sarah Chen']] } }, data: { statusCalled: 'completed_transferred', lastCalledAt: new Date() } });
  console.log('  ✓ call history + 2 queue items');
  console.log('✅ Seed complete.\n   Admin login:      admin@basil.demo / password123\n   Dispatcher login: dispatch@basil.demo / password123');
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
