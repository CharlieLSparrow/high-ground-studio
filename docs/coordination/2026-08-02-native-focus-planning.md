# Native focus planning from canonical tasks

**Date:** 2026-08-02

**Surface:** Quipsly Capture Today + Nest Schedule
**Provider/calendar writes:** none

## Outcome

Capture can now plan a personal focus block directly from any open canonical
task, including one materialized from a human-reviewed coaching or podcast
transcript segment. The same `WorkPlanBlock` appears in Nest Schedule and
Capture Today; there is no mobile-only planning model.

The flow intentionally does not change:

- the task status, title, detail, deadline, recurrence, tags, or reminder;
- the linked goal or transcript source;
- a coaching booking or podcast Session;
- Google Calendar, Apple Calendar, attendees, or provider state.

External calendar placement remains a separate explicit projection decision.

## iPhone interruption and replay contract

Before Capture claims a save, it writes an account-partitioned,
file-protected plan containing:

- task ID and optimistic task revision;
- local wall-clock start, IANA timezone, and explicit duration;
- one stable UUID and capture time.

The server derives the canonical block ID as
`mobile-focus-create-<request UUID>`. A retry after timeout or process death
therefore resolves to the same block. An existing block is acknowledged only
when owner, task, target revision, interval, timezone, surface, and request ID
all match. Reusing an identity for different intent fails closed.

Capture holds non-retryable or acknowledgement-mismatch decisions for visible
human review. Switching accounts changes the visible ledger partition; one
account cannot see or acknowledge another account's pending plan.

## Canonical server boundary

`createWorkPlanBlockInTransaction` is shared by the Nest Schedule action and
the mobile Today route. It reauthorizes an accessible open task (or an
actor-owned active goal for Nest), rejects unreviewed transcript candidates,
resolves DST through the canonical task-time parser, and writes a creation
receipt declaring:

- `externalCalendarMutated:false`;
- `providerMutated:false`;
- `appointmentCreated:false`;
- `targetStatusMutated:false`;
- `targetDeadlineMutated:false`;
- `reminderScheduled:false`.

Mobile creation additionally uses Serializable transaction isolation,
optimistic target revision, deterministic block identity, and exact response
boundary verification.

## UX

Each open task exposes **Plan focus**. The sheet starts with a nearby rounded
time, a 50-minute default, 5-minute duration steps from 15 minutes through 12
hours, and a plain-language boundary section. Pending and held phone plans stay
beside their task with Retry and, for held decisions, Discard controls.

The existing **Record work** flow remains separate: it asks for explicit actual
minutes, completes only the focus block, and never completes the task or goal.

## Verification

- Nest Today and Schedule focused Jest suites: 32 passing.
- Quipsly TypeScript: passing.
- protected completion and creation outbox harnesses: passing.
- full unsigned iOS simulator target build: passing.
- native Today accessibility/UI acceptance: 1/1 passing against the compiled
  app on an iPhone 17 Pro Max simulator (`iOS 26.3.1`), including the planner,
  its no-side-effect disclosures, the disabled preview commit action, source
  navigation, tags, and the rest of the canonical follow-through card. The
  result bundle is
  `/Users/wall-e/Library/Developer/Xcode/DerivedData/HighGroundCapture-hdptnccsjtratddsvysdcgbqoxgf/Logs/Test/Test-HighGroundCapture-2026.08.02_21-19-07--0600.xcresult`.
- real persisted dogfood: passing against a disposable real Firebase identity,
  current local Nest source, and loopback PostgreSQL. The compiled app opened
  the exact canonical task, saved one 50-minute block, observed no pending
  outbox entry, terminated, relaunched, and read back the same block identity.
  The focused XCTest passed 1/1 on iPhone 17 Pro / iOS 26.3.1 at
  `/tmp/quipsly-capture-runtime-ui-focus-plan-20260803T034306Z-43329.xcresult`.
- independent PostgreSQL and Today-API proof: exactly one deterministic
  `mobile-focus-create-*` block existed before cleanup; task revision, status,
  and deadline were unchanged; the receipt declared no reminder, appointment,
  provider, external-calendar, target-status, or target-deadline mutation.
- disposable cleanup: the exact generated ActionItem and WorkPlanBlock both
  read back as zero afterward, all other generated database artifacts were
  absent, and the generated Firebase identity was independently absent.
- local lifecycle contract: 9/9 passing, including the DEBUG simulator-only,
  actor-bound auth reset that clears a deleted prior disposable identity once
  while preserving the current actor's authenticated state across the relaunch
  used by the persistence proof.

This closes retained local database write/readback for the slice. It does not
claim production Nest, a physical-iPhone interruption/recovery drill,
TestFlight distribution, or real cross-device visibility.
