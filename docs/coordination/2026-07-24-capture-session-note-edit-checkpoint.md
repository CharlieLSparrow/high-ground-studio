# Capture Session-note editing checkpoint

**Date:** 2026-07-24

**Status:** final-source local signed-simulator and PostgreSQL proof complete;
physical iPhone, TestFlight-installed use, production parity, and App Store
submission remain open

## Product result

Quipsly Capture can now edit an actor-owned canonical Session Note from the
Record surface. The editor keeps purpose and audience distinct, uses the
Session Nest's canonical tags, and states plainly that editing does not send a
message, create work, schedule anything, or publish.

The phone writes the complete desired edit to an actor-partitioned,
file-protected outbox before sync. Nest rechecks authorship, Session access,
project authority, active same-Nest tags, and the expected revision inside a
serializable transaction. One successful edit atomically replaces content,
audience, purpose, and the complete tag set while appending exactly one
revision that retains the prior values.

Exact retries use a deterministic actor/request receipt and do not duplicate a
revision. Changed intent under the same request identity fails closed. A stale
edit is held on the phone, Nest's current note is refreshed, and the UI requires
the author to compare and deliberately rebase or discard the protected draft.
Held conflicts are never blindly retried.

## Operated proof

The normally signed iPhone 17 Pro / iOS 26.3.1 simulator used the real local
Firebase Auth emulator, Nest at `127.0.0.1:3012`, and PostgreSQL. In Session
`cmrrvwypq0006foxlduakksr4` it:

1. created client-safe Decision
   `mobile-note-97e618db-c8f9-4f41-94d3-801a2a2c91f2`;
2. opened that exact canonical note in the new editor;
3. changed it to ordinary author-private Session-note purpose;
4. selected canonical Nest tag `Capture taxonomy proof 20260723`;
5. waited for the exact revision acknowledgement;
6. terminated and relaunched the signed app; and
7. read the edited body and tag back from Nest with no protected draft left.

Independent PostgreSQL readback matched:

- revision 1 `created-from-ios-capture`;
- revision 2 `updated-from-ios-capture`;
- deterministic receipt
  `session-note-edit-9165ba5692f94eb7e1acbb3bfe5394da`;
- the same actor, note, Session, and tag identities;
- prior Decision/client-safe/title/body/empty-tag values retained in revision
  2;
- `previousContentRetainedInRevision: true`; and
- `externalSideEffects: false`.

The final-source signed runtime XCUITest passes 1/1 in 109.174 seconds and
includes app termination plus fresh canonical readback. The deterministic
preview journey also passes and proves preview mode does not invent an outbox
entry or canonical revision. Two superseded synthetic proof notes created before
the final-source rerun were deleted from the local-only rehearsal database after
their exact dependents were checked; the final proof note above remains.

## Verification boundary

The focused real-PostgreSQL route integration passes 4/4, including authorship
denial, stale conflict, atomic tags, exact retry, changed-intent rejection, and
an exact replay after a later Nest edit. The complete verification set passes:

- 128 Quipsly Jest suites / 621 runnable tests, with 25 suites / 70 tests
  deliberately skipped outside their opt-in environments;
- all 21 tracked TypeScript projects on pinned TypeScript 7.0.2;
- 80/80 Quipsly safety contracts;
- 102/102 local mobile source-and-network checks;
- 632/632 Capture App Store static assertions;
- Quipsly typecheck and focused real-PostgreSQL integration;
- unsigned iOS build-for-testing plus the deterministic and signed runtime
  journeys;
- local doctor and public/auth route smoke;
- `git diff --check`; and
- the isolated local release gate, including both Nest and
  HighGroundOdyssey production builds, with `LOCAL SOURCE READY`.

This checkpoint is not physical-device, TestFlight-installed, deployed
production, or separate-account mobile proof. It does not clear App Store
Connect Missing Compliance, move Cloud Run traffic, or submit the app.
