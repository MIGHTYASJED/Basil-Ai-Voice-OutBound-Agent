# Multiple Concurrent Dispatchers

Basil already supports **unlimited concurrent dispatcher accounts** out of the box.
No code changes are required to scale to multiple simultaneous human dispatchers.

---

## How it works

### 1. Shared queue, per-dispatcher accounts

Every dispatcher signs up with their own account (`/auth/signup` with `role: "dispatcher"`).
The dispatch queue (`call_queue` table) is **shared** — all dispatchers see the same waiting calls.

### 2. Each dispatcher configures their own connection

In **Settings → My Connection** each dispatcher independently sets up:

| Option | Description |
|---|---|
| **Phone number** | Verify a personal cell/desk phone via SMS code. Basil will call *that* number when the dispatcher picks up. |
| **WebRTC (browser)** | Enable in-browser audio — no phone required. Works via the existing WebRTC bridge. |

This is stored per-dispatcher in the `Dispatcher` table (`phoneNumber`, `useWebrtc`).

### 3. Optimistic locking prevents double-pickup

When two dispatchers click **Pick Up** on the same queue item at the same moment:

```
POST /queue/:id/pickup
```

The first request atomically claims the item and sets `status = 'connected'`, `lockedBy = dispatcherId`.
The second request arrives and finds `status ≠ 'waiting'` → returns **HTTP 409 Conflict**.

The losing dispatcher's client receives the 409, shows a toast ("Already picked up by another dispatcher"), and removes the item from their local list. No call is ever connected twice.

### 4. Real-time visibility via SSE

All dispatchers subscribe to the `dispatch-queue` SSE channel. When one dispatcher picks up a call, all others receive a `connected` event in real time and their UI removes the item — no polling needed.

```
events: locked | released | connected | completed | enqueued
```

---

## Adding more dispatchers

1. Each new dispatcher creates an account (or an admin creates one).
2. They log in and configure their connection in **Settings → My Connection**.
3. They immediately see the shared queue — done.

There is **no hard limit** on the number of simultaneous dispatchers. The optimistic locking and real-time SSE fan-out handle contention automatically.

---

## Summary

| Concern | Status |
|---|---|
| Multiple dispatcher accounts | ✅ Supported today |
| Per-dispatcher phone / WebRTC | ✅ Settings → My Connection |
| Shared queue | ✅ All dispatchers see same items |
| Double-pickup prevention | ✅ HTTP 409 + optimistic lock |
| Real-time sync between dispatchers | ✅ SSE `dispatch-queue` channel |
| Code changes needed | ❌ None required |
