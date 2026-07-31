# Retained separate-account privacy dogfood

Checkpoint: 2026-07-31 MDT

## Outcome

Quipsly's retained transcript-to-follow-through corpus now has an operated
second-account privacy lane across rendered Nest, native Capture, private APIs,
protected media, export, notification intent, and independent database
readback.

The outsider is a reserved test identity whose email hashes to
`55459d519089e5eda1da12395dc18b61ac61eac4746eb3e12bb58222bf550d99`.
Its durable test account and Home Nest remain available for longitudinal
privacy regression. Its temporary password packet was removed, and the
password exposed during controlled browser diagnostics was rotated before
cleanup.

## Exact retained owner corpus

- Session: `local-transcript-dogfood-episode-4`
- Task: `transcript-task-f874d8605e8e94fdbfdfa3bb`
- Goal: `transcript-goal-5e4c6fb62fc1d1636dfaabca`
- Private document: `cms8oj49k004qz3xlid6fs329`
- Protected media source: `local-transcript-source-episode-4`
- Exact transcript segment: `local-transcript-segment-episode-4-1`
- Evidence preserved after the run: 5 segments and 12 provider-timed words

The task remained `OPEN` with no due date. The goal remained `ACTIVE` with no
target date. The document remained private. The outsider gained no project
grant, Session-participant row, task ownership, goal ownership, or document
ownership.

## Rendered Nest operation

The reserved outsider signed in through the real local Firebase Auth emulator
and Quipsly session exchange. In the actual rendered product:

- Today showed no accessible upcoming Session, committed task, active goal, or
  transcript proposal.
- Direct Session navigation returned the signed-in Quipsly shell with a
  concealed 404.
- Direct writing navigation redirected to the accessible Nest picker and said
  the requested Nest could not be found.
- Direct task and goal navigation showed the outsider's empty Work Queue plus
  **Could not open that task/goal** and **Nothing was changed**.
- Permission-filtered Search returned zero results across tasks, goals,
  Sessions, notes, documents, sources, annotations, media, and tags.

No UI action created, edited, scheduled, messaged, delivered, or published
anything.

## Adversarial API and media readback

The reusable local-only command
`pnpm quipsly:privacy:retained-dogfood` signs in the reserved outsider without
printing credentials and rejects non-loopback Nest, Firebase, database, and
credential paths.

The outsider received its own bounded workspace from Sessions, Today, and Work
with none of the exact private IDs or text markers. Exact private reads returned:

- Session context: 404
- Transcript correction desk: 404
- Session source-evidence export: 404
- Protected media: 404
- Research export: 404

Today returned zero task-reminder intents and did not contain the retained task
ID. Every private denial is non-publicly-cacheable. Independent database
readback repeated all owner and evidence assertions after the requests.

## Defects corrected

1. Session-context responses were actor-scoped but did not consistently send
   `Cache-Control: private, no-store` and
   `Vary: Authorization, Cookie`. Every success, denial, validation failure,
   conflict, and service failure now uses the private response contract.
2. Protected media returned 403 for a real source that belonged to another
   account and 404 for a nonexistent source, disclosing source existence. Both
   states now return the same `404 Source not found`; authorized project,
   global, and staff reads remain intact.
3. Research-export success was private, but its actor-specific error responses
   were not. All export responses now share the private, non-cacheable,
   authorization-varying contract.
4. Native empty states lacked stable semantic identities. Today's empty
   follow-through and the empty Session picker now expose accessible,
   automation-stable boundaries.

## Native Capture operation

Selected XCTest:
`CaptureRoomRuntimeSmokeTests/testOutsiderCannotSeeRetainedTranscriptFollowThrough`

Device: iPhone 17 Pro simulator, iOS 26.3.1

Result bundle:
`/tmp/quipsly-capture-account-isolation-20260731-v1.xcresult`

Result: 1 passed, 0 failed, 0 skipped.

The signed-in outsider reached the canonical empty Today boundary, did not
receive the exact retained task or goal, opened Record, and saw an empty Session
chooser without the retained Session ID or title.

## Verification

- Focused privacy and response-contract tests: 17/17
- Full Quipsly Jest: 190 suites / 956 tests passed; 33 environment-gated suites
  and 99 tests skipped
- Quipsly TypeScript: pass
- Native account-partition static checks: 15/15
- App Store and native static invariants: 955/955
- Retained outsider web/API/database dogfood: pass
- Signed-in native outsider runtime acceptance: 1/1
- `git diff --check`: pass

## Truth boundary

This is strong local rendered-web, local-service, real-PostgreSQL, and iPhone
simulator proof over exact retained records. It does not claim a production
outsider attempt, a TestFlight-installed or physical-iPhone attempt, a real
coach/client visibility matrix, notification delivery behavior, a collaborator
role matrix, or public/private publication behavior. Those remain required
before the full goal can close.
