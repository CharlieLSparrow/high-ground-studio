# Capture room convergence proof — 2026-08-24

## Product risk

Coach and client recordings intentionally finalize as independent immutable uploads. Those upload transactions have different upload identities but converge on one `CallRoom` projection. Under Serializable isolation, ordinary simultaneous stop/finalize traffic could therefore produce `P2034` write-conflict retries and noisy Prisma error telemetry even when both requests ultimately returned 200.

This was recoverable, but it added latency and made an expected two-person workflow look unhealthy to operations.

## Convergence design

- Keep the existing per-upload advisory lock so a duplicate request cannot create duplicate normalized media evidence.
- Lock the canonical `CallRoom` row before any upload finalizer reads or rewrites shared room projections.
- Use the same row lock before applying durable room-state receipts.
- Preserve the authorization boundary: room-state first proves the actor can access the room, then locks it, then rereads all authoritative state under the lock.
- Use Read Committed isolation so a waiter sees the winner's committed room and receipt state after acquiring the row lock instead of retaining a stale Serializable snapshot.
- Retain bounded retry handling for genuine adapter-level deadlocks, unique races, and transient conflicts outside the shared room boundary.
- Keep the existing episode-projection row lock; participant sources can still finalize independently and converge on one episode without lost `importedMedia` updates.

## Automated evidence

Source contracts:

```text
PASS: capture room receipts are required, append-only, room-serialized, replay-safe, and ordering-safe.
PASS: capture finalization is room-serialized, normalized, idempotent, hold-safe, and explicitly releasable.
```

Focused finalization tests:

```text
Test Suites: 1 passed, 1 total
Tests:       2 passed, 2 total
```

Quipsly application typecheck:

```text
next typegen && tsc --noEmit --incremental false
Types generated successfully
```

Fresh two-person local product flight:

- Receipt: `artifacts/coaching-acceptance/82f6bea9/fresh-coaching-flight-receipt.json`
- Fresh signup, appointment, invitation acceptance, and client return: passed.
- Neighboring-Nest, Session, and coaching-relationship isolation: passed.
- Two connected endpoints and two independently verified participant sources: passed.
- Participant-attributed transcription and protected playback: passed.
- Shared and private work, cross-account task completion: passed.
- Light edit, private preview, recipient release, playback, and revoke: passed.
- Automatic post-call audio readiness: passed with an improved listening copy while the original source and capture manifest remained unchanged.

The log segment for the fresh room contained no `P2034`, `prisma.callRoom.update()` conflict, or HTTP 500. Its two finalization requests both returned 200; application work completed in approximately 786 ms for the lock holder and 141 ms for the waiter after convergence. The first request's wall time also included development-time route compilation and is not a production latency measurement.

## Honest boundary

The flight used two fresh local accounts, rendered browser surfaces, fake browser media, and distinct controlled speech files. It does not prove physical-device behavior, natural speech quality, real mailbox delivery, human understanding, or production-scale contention. Those remain deferred validation evidence, not reasons to halt unrelated product work.
