export const agents = [
  { name: "Basil-01", role: "Cold Caller — Dry Van", voice: "Josh (ElevenLabs)", model: "Claude Sonnet 4 · Temp 0.7", phone: "+1 (555) 012-3456", maxDuration: "5 min", status: "live" as const, activeCalls: 3, group: "dallas-cold" as string | null, today: { calls: 47, connected: 18, booked: 4, avgDur: "1:12" } },
  { name: "Basil-02", role: "General Dispatch", voice: "Antoni (ElevenLabs)", model: "Claude Sonnet 4 · Temp 0.6", phone: "+1 (555) 012-3457", maxDuration: "5 min", status: "live" as const, activeCalls: 1, group: "dallas-cold" as string | null, today: { calls: 23, connected: 8, booked: 1, avgDur: "0:58" } },
  { name: "Basil-Reefer", role: "Reefer Specialist", voice: "Adam (ElevenLabs)", model: "Claude Sonnet 4 · Temp 0.7", phone: "+1 (555) 012-3458", maxDuration: "5 min", status: "idle" as const, activeCalls: 0, group: null as string | null, today: { calls: 0, connected: 0, booked: 0, avgDur: "—" } },
  { name: "Basil-Night", role: "After Hours", voice: "Bella (ElevenLabs)", model: "Claude Sonnet 4 · Temp 0.5", phone: "+1 (555) 012-3459", maxDuration: "5 min", status: "offline" as const, activeCalls: 0, group: null as string | null, today: { calls: 0, connected: 0, booked: 0, avgDur: "—" } },
  { name: "Basil-Callback", role: "Warm Follow-up", voice: "Josh (ElevenLabs)", model: "Claude Sonnet 4 · Temp 0.6", phone: "+1 (555) 012-3460", maxDuration: "5 min", status: "live" as const, activeCalls: 1, group: null as string | null, today: { calls: 12, connected: 9, booked: 2, avgDur: "1:32" } },
];

export const agentGroups = [
  { id: "dallas-cold", name: "Dallas Cold Callers", description: "Cold calling team for Dallas outbound", color: "green", members: ["Basil-01", "Basil-02"] },
];

export const campaigns = [
  { id: "c1", name: "Summer Reefer Push", status: "Active", loads: 4, called: 78, total: 120, conv: "8.5%", agents: ["Basil-01", "Basil-02"], created: "May 20" },
  { id: "c2", name: "Dallas Dry Van", status: "Active", loads: 2, called: 34, total: 89, conv: "5.2%", agents: ["Basil-01"], created: "May 22" },
  { id: "c3", name: "Night Shift Run", status: "Paused", loads: 3, called: 18, total: 80, conv: "3.1%", agents: ["Basil-Night"], created: "May 18" },
  { id: "c4", name: "Memphis lanes follow-up", status: "Active", loads: 5, called: 74, total: 120, conv: "18.4%", agents: ["Basil-Callback"], created: "May 24" },
  { id: "c5", name: "Q3 Push", status: "Draft", loads: 6, called: 0, total: 0, conv: "—", agents: [], created: "May 27" },
  { id: "c6", name: "Test Run", status: "Completed", loads: 1, called: 50, total: 50, conv: "12.0%", agents: ["Basil-01"], created: "May 10", completedAt: "May 12, 3:20 PM", booked: 6, callbacks: 9, notInterested: 12, noAnswer: 23, revenue: "$15,200" },
];

export const loads = [
  { ref: "#4521", origin: "Dallas, TX", dest: "Memphis, TN", type: "Dry Van", pickup: "May 29", rate: "$969", perMi: "2.85", miles: 340, status: "Available", group: "dallas-may29" as string | null },
  { ref: "#4533", origin: "Houston, TX", dest: "Atlanta, GA", type: "Reefer", pickup: "May 30", rate: "$2,418", perMi: "3.10", miles: 780, status: "Offered", group: "reefer-west" as string | null },
  { ref: "#4540", origin: "Austin, TX", dest: "Nashville, TN", type: "Dry Van", pickup: "May 29", rate: "$2,132", perMi: "2.60", miles: 820, status: "Booked", group: "dallas-may29" as string | null },
  { ref: "#4548", origin: "San Antonio, TX", dest: "Jacksonville, FL", type: "Reefer", pickup: "Jun 01", rate: "$3,190", perMi: "2.90", miles: 1100, status: "Available", group: "reefer-west" as string | null },
  { ref: "#4555", origin: "El Paso, TX", dest: "Phoenix, AZ", type: "Flatbed", pickup: "Jun 02", rate: "$1,496", perMi: "3.40", miles: 440, status: "Available", group: null as string | null },
  { ref: "#4561", origin: "Fort Worth, TX", dest: "Denver, CO", type: "Dry Van", pickup: "Jun 03", rate: "$2,030", perMi: "2.45", miles: 829, status: "Offered", group: "dallas-may29" as string | null },
  { ref: "#4570", origin: "Laredo, TX", dest: "Chicago, IL", type: "Reefer", pickup: "Jun 03", rate: "$3,520", perMi: "2.95", miles: 1193, status: "Available", group: "reefer-west" as string | null },
];

export const loadGroups = [
  { id: "dallas-may29", name: "Dallas Outbound May 29" },
  { id: "reefer-west", name: "Reefer West Coast" },
];

export const phoneNumbers = [
  { id: "p1", number: "+1 (555) 012-3456", label: "Main Line", status: "Assigned", assignedTo: "Basil-01" as string | null, provider: "Twilio", area: "469 — Dallas" },
  { id: "p2", number: "+1 (555) 012-3457", label: "Line 2", status: "Assigned", assignedTo: "Basil-02" as string | null, provider: "Twilio", area: "469 — Dallas" },
  { id: "p3", number: "+1 (555) 012-3458", label: "Reefer Line", status: "Assigned", assignedTo: "Basil-Reefer" as string | null, provider: "Twilio", area: "713 — Houston" },
  { id: "p4", number: "+1 (555) 012-3459", label: "Night Line", status: "Assigned", assignedTo: "Basil-Night" as string | null, provider: "Twilio", area: "214 — Dallas" },
  { id: "p5", number: "+1 (555) 012-3460", label: "Callback Line", status: "Assigned", assignedTo: "Basil-Callback" as string | null, provider: "Twilio", area: "972 — Dallas" },
  { id: "p6", number: "+1 (555) 012-3461", label: "Backup 1", status: "Available", assignedTo: null as string | null, provider: "Twilio", area: "469 — Dallas" },
  { id: "p7", number: "+1 (555) 012-3462", label: "Backup 2", status: "Available", assignedTo: null as string | null, provider: "Twilio", area: "469 — Dallas" },
  { id: "p8", number: "+1 (555) 012-3463", label: "Line 6", status: "Available", assignedTo: null as string | null, provider: "Vapi", area: "713 — Houston" },
  { id: "p9", number: "+1 (555) 012-3464", label: "Line 7", status: "Available", assignedTo: null as string | null, provider: "Vapi", area: "915 — El Paso" },
  { id: "p10", number: "+1 (555) 012-3465", label: "Line 8", status: "Available", assignedTo: null as string | null, provider: "Twilio", area: "210 — San Antonio" },
  { id: "p11", number: "+1 (555) 012-3466", label: "Line 9", status: "Available", assignedTo: null as string | null, provider: "Twilio", area: "512 — Austin" },
  { id: "p12", number: "+1 (555) 012-3467", label: "Line 10", status: "Available", assignedTo: null as string | null, provider: "Vonage", area: "817 — Fort Worth" },
  { id: "p13", number: "+1 (555) 012-3468", label: "Line 11", status: "Available", assignedTo: null as string | null, provider: "Vonage", area: "832 — Houston" },
  { id: "p14", number: "+1 (555) 012-3469", label: "Old Line", status: "Disabled", assignedTo: null as string | null, provider: "Twilio", area: "214 — Dallas" },
];

export const freightFeed = [
  { id: "f1", origin: "Dallas, TX", dest: "Memphis, TN", type: "Dry Van", rate: "$2.85", miles: 340, broker: "ABC Logistics", brokerPhone: "(555) 999-8888", brokerCredit: 95 },
  { id: "f2", origin: "Houston, TX", dest: "Atlanta, GA", type: "Reefer", rate: "$3.10", miles: 780, broker: "XYZ Freight", brokerPhone: "(555) 777-6543", brokerCredit: 88 },
  { id: "f3", origin: "Austin, TX", dest: "Phoenix, AZ", type: "Flatbed", rate: "$3.40", miles: 870, broker: "123 Transport", brokerPhone: "(555) 444-3333", brokerCredit: 91 },
  { id: "f4", origin: "San Antonio, TX", dest: "Jacksonville, FL", type: "Reefer", rate: "$2.90", miles: 1120, broker: "DEF Co", brokerPhone: "(555) 222-1111", brokerCredit: 79 },
  { id: "f5", origin: "El Paso, TX", dest: "Los Angeles, CA", type: "Dry Van", rate: "$2.20", miles: 740, broker: "GHI Logistics", brokerPhone: "(555) 666-5544", brokerCredit: 84 },
];

export const drivers = [
  { name: "Marcus Johnson", phone: "(555) 891-2345", email: "marcus.j@email.com", type: "Dry Van", loc: "Dallas, TX", truck: "2019 Freightliner Cascadia", calls: 12, bookings: 3, rating: 4, last: "2 min ago", status: "Active" },
  { name: "Sarah Chen", phone: "(555) 234-5678", email: "sarah.c@email.com", type: "Reefer", loc: "Houston, TX", truck: "2021 Kenworth T680", calls: 8, bookings: 1, rating: 3, last: "1 day ago", status: "Active" },
  { name: "James Rivera", phone: "(555) 555-1234", email: "j.rivera@email.com", type: "Flatbed", loc: "Fort Worth, TX", truck: "2020 Peterbilt 579", calls: 5, bookings: 2, rating: 5, last: "3 hr ago", status: "Active" },
  { name: "Michael Torres", phone: "(555) 200-1112", email: "m.torres@email.com", type: "Dry Van", loc: "Austin, TX", truck: "2018 Volvo VNL", calls: 7, bookings: 1, rating: 4, last: "5 min ago", status: "Active" },
  { name: "David Park", phone: "(555) 333-2244", email: "d.park@email.com", type: "Reefer", loc: "Memphis, TN", truck: "2022 Freightliner", calls: 3, bookings: 0, rating: 2, last: "2 hr ago", status: "DNC" },
  { name: "Lisa Wang", phone: "(555) 444-9988", email: "l.wang@email.com", type: "Dry Van", loc: "Phoenix, AZ", truck: "2019 Kenworth", calls: 9, bookings: 2, rating: 4, last: "yesterday", status: "Active" },
  { name: "Diego Alvarez", phone: "(555) 778-0091", email: "d.alvarez@email.com", type: "Reefer", loc: "El Paso, TX", truck: "2020 Peterbilt", calls: 4, bookings: 1, rating: 4, last: "12 min ago", status: "Active" },
  { name: "Tasha Cole", phone: "(555) 887-7762", email: "t.cole@email.com", type: "Dry Van", loc: "Atlanta, GA", truck: "2021 Volvo", calls: 11, bookings: 4, rating: 5, last: "30 min ago", status: "Active" },
];

export const callLog = [
  { time: "2:15 PM", agent: "Basil-01", driver: "Marcus Johnson", dur: "1:23", status: "done", outcome: "negotiating", load: "#4521", summary: "Driver interested in Load #4521 but wants $3/mi instead of $2.85. Basil offered to check with team. Callback expected.", driverInfo: ["Current location: Fort Worth, TX", "Available: Tomorrow 6 AM", "Preferred rate: $3.00/mi", "Has run Dallas→Memphis 4 times before"] },
  { time: "2:10 PM", agent: "Basil-02", driver: "Sarah Chen", dur: "0:45", status: "done", outcome: "not-interested", load: "#4533", summary: "Driver not running this lane. Asked to be called back if Memphis loads open up.", driverInfo: ["Currently in Houston", "Looking for Memphis lanes specifically"] },
  { time: "2:02 PM", agent: "Basil-01", driver: "David Park", dur: "—", status: "no-answer", outcome: "no-answer", load: "#4521", summary: "No answer after 4 rings. Retry queued in 2 hours.", driverInfo: [] },
  { time: "1:55 PM", agent: "Basil-03", driver: "James Rivera", dur: "2:10", status: "done", outcome: "booked", load: "#4521", summary: "Quick book at $2.92/mi. Rate confirm sent. Pickup confirmed for tomorrow 6 AM.", driverInfo: ["Booked at $2.92/mi", "Pickup 6 AM tomorrow"] },
  { time: "1:48 PM", agent: "Basil-Callback", driver: "Tasha Cole", dur: "1:32", status: "done", outcome: "booked", load: "#4498", summary: "Returning callback. Booked at $1,925 on PHX→LA dry van.", driverInfo: ["Booked PHX→LA"] },
  { time: "1:35 PM", agent: "Basil-Reefer", driver: "Diego Alvarez", dur: "0:52", status: "done", outcome: "callback", load: "#4548", summary: "Driver interested but cannot commit until evening. Callback scheduled 6 PM.", driverInfo: ["Callback scheduled 6 PM"] },
  { time: "1:21 PM", agent: "Basil-01", driver: "Lisa Wang", dur: "0:32", status: "done", outcome: "callback", load: "#4521", summary: "Driver requested callback 3 PM. Marked.", driverInfo: ["Callback 3 PM"] },
];

export const queueWaiting = [
  { id: "q1", name: "Marcus Johnson", phone: "+1 (555) 891-2345", email: "marcus.j@email.com", type: "Dry Van", loc: "Fort Worth, TX", truck: "2019 Freightliner Cascadia", waitedSec: 120, note: "Driver wants to negotiate rate on Load #4521. Interested but firm on $3/mi.", driverInfo: ["Available tomorrow 6 AM", "Has run this lane 4 times", "Prefers no-touch freight"], transferReason: "Rate negotiation beyond AI authority", load: { ref: "#4521", route: "Dallas TX → Memphis TN", rate: "$969 ($2.85/mi)", min: "$880 ($2.59/mi)" } },
  { id: "q2", name: "Sarah Chen", phone: "+1 (555) 234-5678", email: "sarah.c@email.com", type: "Reefer", loc: "Memphis, TN", truck: "2021 Kenworth T680", waitedSec: 305, note: "Has questions about detention policy and wants to talk to a human.", driverInfo: ["Asking about detention pay", "Wants $50/hr after 2 hours"], transferReason: "Policy question outside AI scope", load: { ref: "#4533", route: "Houston TX → Atlanta GA", rate: "$2,418 ($3.10/mi)", min: "$2,200" } },
  { id: "q3", name: "James Rivera", phone: "+1 (555) 555-1234", email: "j.rivera@email.com", type: "Flatbed", loc: "Houston, TX", truck: "2020 Peterbilt 579", waitedSec: 480, note: "Wants human confirmation on rate before signing rate confirm.", driverInfo: ["Wants to verify rate", "Available now"], transferReason: "Driver requested human confirmation", load: { ref: "#4555", route: "El Paso TX → Phoenix AZ", rate: "$1,496 ($3.40/mi)", min: "$1,400" } },
];
