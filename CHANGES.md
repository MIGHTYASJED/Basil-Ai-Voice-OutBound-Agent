# Basil — fix pass (Oct 2026)

Run `cd backend && npm run setup && npm run dev`, then `cd frontend && npm run dev`.
With the backend running, `node scripts/smoke.mjs` runs 38 end-to-end API checks (all pass).

## Dialer & call engine
- **Calling hours enforced** (live mode): 08:00–21:00 in the *driver's* local time (from their state), plus each campaign's own window/timezone. Off in simulation unless `ENFORCE_CALL_WINDOW_IN_SIM=true`.
- **Retries actually happen**: no-answer/callback drivers are re-dialed after `retryDelayMin`, up to `maxRetries` (previously `scheduleRetry` was empty and those drivers were never called again).
- **Campaigns complete** when nobody is left to dial; progress counts distinct drivers (it used to count every attempt, so it could pass 100%).
- **Fair scheduling**: campaigns sharing agents take turns (the oldest used to starve the rest).
- **Agents return to idle** after each call (they stayed "live" forever).
- **Daily caps reset at midnight** for every number; numbers coming out of cooldown go back to *assigned*, not *available* (they could be handed to a second agent).
- **Voicemail** is hung up instead of having the AI talk to it.
- **Drivers on hold > MAX_PARK_SECONDS** are released and flagged for a callback (the limit was configured but never enforced).
- Duplicate carrier webhooks / second AMD event no longer double-finalize calls or double-count stats.
- Live mode **refuses to dial without carrier credentials** (it used to fake calls that hung in "talking" forever).

## Live AI voice (Gemini)
- **Media bridge now runs inside the API process** (it auto-starts when `TELEPHONY_MODE=live`). As a separate process its transfer/outcome events never reached the orchestrator, so live transfers never hit the dispatcher queue.
- `transfer_to_dispatcher` parks the driver and queues them; `end_call` outcomes are applied — **`dnc_requested` now marks the driver Do-Not-Call**, wrong numbers are deactivated, callbacks are retried.
- Fixed `sendRealtimeInput` call shape in the phone bridge, the model now comes from `GEMINI_MODEL`, tool schemas use the SDK's types; one shared Gemini client for calls and the browser test.
- **Mandatory system rules**: the agent says it's an AI in its first sentence, honors "stop calling me", handles wrong numbers. (FCC treats AI voices as "artificial voice" under the TCPA.)
- Live transcripts stream to the dashboard (Listen-in).
- Telnyx: correct hang-up cause mapping (no-answer/busy/failed), bidirectional PCMU stream. Twilio: status callbacks carry the call id and form-encoded webhooks are parsed.
- Dispatcher dial-out uses a pool number as caller ID (it used the dispatcher's own number, which carriers reject) and bridges the right call legs.
- The Test Agent socket requires a signed-in user.

## API & security
- **Anyone could sign up as admin** — now only the first account can; later admins are added in Settings → Team.
- Validation errors return 400 with a readable message (were 500s). JWTs expire after 7 days. Emails are case-insensitive.
- Driver phones normalized to E.164 (no more duplicates in different formats); driver delete/import is admin-only.
- Agent duplicate copies the prompt; renaming checks uniqueness; changing an agent's number frees the old one; deleting an agent mid-call is blocked.
- New: campaign settings edit, duplicate, CSV report; queue "recently handled" + booking outcomes (marks the load booked); load-group rename/move; team management; workspace status; supervisor end/transfer.
- **Removed a hard-coded Gemini API key from `backend/test_api.mjs` — rotate that key.**

## Dashboard
- Mission Control, Campaign detail, Call log, Analytics, Dispatcher queue, Agents, Settings and Listen-in now show **real data** (they rendered hard-coded demo numbers and scripted transcripts).
- Buttons that only showed a success toast now work: create agent / agent group, edit, pause, export report, duplicate campaign, load groups, bulk number import, call-log filters + CSV export, flag call.
- Campaign status filter fixed ("Calling" vs "Active"); clicking a campaign opens *that* campaign.
- Modals close on Escape; the freight feed is labelled as sample data.
- Landing page: removed fabricated traction ("50+ companies", "1M calls", fake logos) and the claim that the AI books loads itself.
