# Browser recording receipt outbox

Date: 2026-08-25
Status: browser durability and automated account boundary implemented; physical two-account outage validation deferred

## Outcome

Browser recording coordination no longer depends on a fire-and-forget PATCH.
Before attempting delivery, Quipsly writes the complete endpoint request to a
participant-partitioned local journal. A lost response, offline transition, tab
close, or process restart can delay room status without losing the original
idempotency identity or fabricating a second request.

The immutable payload includes the device's original event time. Nest stores
that separately from server receipt time, so an outage cannot make `STARTED` or
`STOPPED` appear to have happened only when the browser reconnected. A replay
with a changed event time is an identity conflict, while legacy queued receipts
without the field remain accepted with server-time fallback.
Future-skewed device clocks are normalized against the immutable original
server receipt time during replay, so the same delayed request cannot drift as
wall-clock time advances.

Each receipt has its own local-storage key. That makes unrelated receipt writes
independent across tabs instead of rewriting one shared array. Initial
participant restoration, ordinary room polling, and the browser `online` event
all drain pending work. Concurrent drains for the same participant share one
in-flight promise. Pending receipts never expire; acknowledged and terminally
rejected diagnostics remain for 24 hours.

## Account and protocol boundary

The canonical private Session participant ID partitions both the receipt UUID
and outbox record. Normal application recovery enumerates and delivers only the
currently restored participant's queue. This is intentionally a logical app
boundary, not cryptographic isolation from the person who owns that browser
profile or its developer tools; same-origin browser storage is shared across
signed-in accounts. The rows contain coordination metadata, not media or auth
credentials. Existing pre-outbox UUIDs are reused when valid so a deployment
does not create duplicate endpoint evidence.

Authentication, unknown-endpoint, network, rate-limit, and server errors remain
retryable. Invalid requests, missing participant access, missing directives,
and immutable receipt-ID conflicts become retained rejected diagnostics. An
unreadable journal record is preserved byte-for-byte and surfaced as recovery
attention rather than overwritten.

## Truth boundary and UX

The status journal proves only that this browser retained a collaboration
update. It does not create or verify media, upload a source, materialize a
`RecordingAsset`, or prove playback. The visible notice therefore says room
status is saved and that any already-captured recording remains protected
separately; it never says recording succeeded merely because a status request
is queued.

## Automated evidence

- `browser-recording-receipt-outbox.test.ts`,
  `browser-recording-directive.test.ts`, and the recording-directive route:
  **25/25 passed**.
- Coverage includes participant isolation, exact replay after a lost response,
  terminal conflict retention, corrupt-byte preservation, legacy identity
  reuse through the directive client, and same-participant single-flight drain.
- Route coverage proves original device event-time persistence, exact replay,
  rejection when the same receipt identity changes its event time, and stable
  replay of a future-skewed device clock.
- `pnpm --dir apps/quipsly typecheck`: passed, including generated Next route
  types and non-incremental TypeScript checking.
- `git diff --check`: passed.

## Deferred physical validation

Run a real browser/iPhone two-account Session. Take the browser offline after
local `STARTED`, close the tab, reopen while offline, then restore the same
participant and network. Repeat after `STOPPED`. Before restoring one pending
receipt, switch to a different account and prove it cannot deliver the first
participant's update. Capture the exact directive, receipt, participant,
capture, endpoint, upload, and `RecordingAsset` identities; then listen to the
beginning, middle, and ending of the retained source.
