# Basil — Autonomous AI Voice Agent for Freight Dispatch

> See **CHANGES.md** for the latest fix pass. With the backend running, `node backend/scripts/smoke.mjs` runs 38 end-to-end checks.

Basil makes outbound calls to truck drivers, pitches loads through natural
voice conversation, captures what the driver says, and hands warm/negotiating
leads to a human dispatcher by transferring the **live** call into a queue.

This repo is a full-stack, runnable system: a real backend (database, auth,
REST API, realtime WebSockets, telephony + AI integration) and the React
dashboard wired to it.

```
basil/
├── backend/    Node + TypeScript (Fastify) API, data layer, telephony, media bridge
└── frontend/   Vite + React dashboard + marketing site (the UI you provided)
```

---

## Quick start

You need **Node 22+** (the data layer uses the built-in `node:sqlite`, so there
is nothing to install for the database and nothing to download at setup time).

### 1. Backend

```bash
cd backend
cp .env.example .env          # defaults work out of the box (simulation mode)
npm install
npm run setup                 # creates the SQLite DB + seeds demo data
npm run dev                   # API on http://localhost:4000
```

### 2. Frontend (in a second terminal)

```bash
cd frontend
cp .env.example .env          # VITE_API_URL=http://localhost:4000
npm install
npm run dev                   # open the printed localhost URL

```

### Demo logins (seeded)

| Role       | Email                       | Password      |
|------------|-----------------------------|---------------|
| Admin      | `admin@basil.demo`          | `password123` |
| Dispatcher | `dispatch@basil.demo`       | `password123` |

Log in as the admin, open **Campaigns → New Campaign**, pick a load + agent and
hit **Launch**. The dialer starts placing calls; watch **Mission Control** and
the **Call Log** update live, and watch transferred drivers appear in the
**Dispatcher Queue** in real time. Open a second browser as the dispatcher to
see the optimistic-lock pickup (two dispatchers can't grab the same call).

---

## Test the agent's voice in your browser (no carrier needed)

Add a `GEMINI_API_KEY` to `backend/.env` and restart. Then in **Mission Control**
click **🎙 Test Agent** — pick an agent and talk to it live from your browser
(your mic → Gemini Live → your speakers), using the agent's real system prompt.

This test path is deliberately isolated:

- It works while `TELEPHONY_MODE=simulation` — it never uses a carrier, so you
  don't need Telnyx to hear the agent.
- It never touches the dialer, orchestrator, call records, or dispatch queue,
  and it writes nothing to the database.
- It skips the μ-law phone bridge entirely (browser sends PCM 16 kHz, plays back
  Gemini's PCM 24 kHz directly).

So you can tune prompts and hear the agent now, and when you later add Telnyx +
flip to live mode, the driver-calling pipeline works unchanged.

---

## Simulation vs. live (important)

Out of the box `TELEPHONY_MODE=simulation`. In this mode the **entire call
lifecycle runs end-to-end with no carrier or AI credentials** — a simulation
provider drives ringing/answer/outcome events and scripted conversations, so
every screen and button is exercised against real server logic and a real
database.

To go **live**, add credentials to `backend/.env` and set `TELEPHONY_MODE=live`:

- `GEMINI_API_KEY` — turns on the real Gemini Live (native audio) voice agent.
- `TELNYX_API_KEY` + `TELNYX_CONNECTION_ID` — real outbound calls + media stream.
  (Twilio and Vapi adapters are also included as fallback / alternative modes.)

The real provider code paths are already implemented (see
`backend/src/telephony/` and `backend/src/bridge/`). When live, you also run the
media bridge process:

```bash
cd backend && npm run bridge   # ws://localhost:4001/media
```

The bridge transcodes carrier audio (G.711 μ-law 8 kHz) ↔ Gemini
(PCM 16 kHz in / 24 kHz out) in both directions and handles barge-in and the
AI's function calls (`transfer_to_dispatcher`, `save_driver_info`, `end_call`).

---

## How a call flows

```
Campaign launched
   → Dialer picks an eligible driver + an available agent's phone number
       (respects per-number daily cap and one-call-per-number lock)
   → Provider places the call  ──>  driver answers
   → Media bridge streams audio to Gemini Live (live mode)
       or the simulator drives a scripted conversation (sim mode)
   → Outcome:
        • not interested / callback / no-answer  → logged, driver status updated
        • wants to negotiate / wants a human       → transfer_to_dispatcher
              → driver leg PARKED on hold (max 3 min)
              → a DispatchQueue row is created and pushed over WebSocket
              → dispatcher clicks "Pick Up" (optimistic lock: first wins, others 409)
              → system dials the dispatcher's phone or rings their browser softphone
              → the parked driver leg is bridged in
```

Per the product rules, the AI **does not book loads itself** on driver calls —
interested/negotiating drivers are transferred. (The `transfer_to_dispatcher`
behavior is driven by each agent's system prompt, so a broker-confirmation agent
can be told to carry the whole conversation instead.)

---

## What's wired

**Backend (complete, smoke-tested):** JWT auth + admin/dispatcher roles ·
agents (CRUD, groups/batch-create, prompt versioning) · phone-number pool
(health, caps, assignment guards) · drivers (CRUD, CSV import that stamps
`status_called`, DNC) · loads (CRUD, groups, CSV import, DAT-style feed) ·
campaigns (driver-match preview, launch/pause, completion tracking) · the
dialer + call orchestrator state machine · dispatch queue with optimistic
locking + park/bridge · mission control + capacity calculator · analytics ·
realtime hub · Telnyx/Twilio/Vapi adapters + Gemini Live client + audio codec.

**Frontend (wired to the API):** login/signup/session/logout · live data across
every dashboard page via a `DataProvider` (auto-refreshing on realtime events) ·
agent create/pause/duplicate/delete · campaign wizard (create + launch, live
driver preview) and row launch/pause · dispatcher queue pickup with realtime
locking · phone-number add/disable/delete · driver add/import/DNC · prompt
editor save + version history/restore · dispatcher connection setup (phone
verify + browser-softphone toggle + availability) · DAT feed import + CSV
export · load add/import.

---

## Production notes

- **Database:** the included data layer is a Prisma-client-compatible adapter
  over `node:sqlite` so it runs anywhere with zero setup. `prisma/schema.prisma`
  is the source of truth; for production scale, point it at Postgres and swap in
  real Prisma (the route code is already written against the Prisma client API).
- **Scale:** the in-process dialer/number-locks are fine for a single node; for
  10k–20k calls/day across many workers, move the lock to Redis and the dial
  loop to a queue (BullMQ). The capacity math: ~`agents × (60/avgCallSec) ×
  windowMinutes` calls/day, bounded by `numbers × dailyCap` — 20k/day ≈ 42
  agents + 100 numbers at a 200/number cap.
- **The media bridge must run on always-on infrastructure** (it holds an open
  socket for the duration of each call) — not on serverless.
- Set a strong `JWT_SECRET` in production.
```
Contributors: Muhammad Aadam [SAP: 70203107]