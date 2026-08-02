# Evidence-backed weekly review operation

Date: 2026-08-02

Implementation commit: `03a316e1`

## Outcome

Quipsly now turns canonical goals, linked tasks, weekly commitments, coaching
Sessions, and personal focus blocks into one deterministic weekly review. The
same projection appears in Nest Work and Capture Today. It does not ask a model
to judge a person's week, infer missing work, complete a task or goal, send a
message, or mutate a provider.

Actual time is now a first-class nullable receipt on `WorkPlanBlock`:

- planning preserves the proposed window;
- completing a block asks for the minutes actually worked;
- historical and older-client completions remain visibly `time not recorded`;
- the linked task and goal retain their independent status; and
- portable exports preserve the field while restores retain the original value
  as source evidence on their intentionally canceled planning records.

The shared `@high-ground/quipsly-domain/weekly-review` projector owns the
calculation for both web and iPhone. Its output records explicit boundaries for
deterministic projection, actual-time-only accounting, non-inference, no target
status mutation, and no external side effects.

## Defect found by operating the product

The retained client/coach/outsider run found that the old Work query treated
every room participant as authorized to read every task and goal in that room.
That was correct for unbooked podcast production rooms but too broad for a
booking-backed coaching room: a room producer who was neither coach nor client
could see client-owned coaching work.

Work access now distinguishes the two cases:

- unbooked production rooms keep participant collaboration; and
- booking-backed coaching work follows the explicit client/coach relationship,
  plus direct task assignment or goal ownership.

Weekly review adds a second reviewer-ID check before projecting another
person's week. A relationship unit test and the rendered outsider denial both
guard the boundary.

The complete cross-surface contract run also found consent copy that said only
`anyone nearby`. Capture now explicitly tells the presenter that the audible-
participant confirmation includes people who are not signed into Quipsly.

## Retained local operation

`pnpm quipsly:retained:weekly-review` is a loopback-only, Keychain-backed
operator. It preserves a fixed synthetic goal, linked task, progress receipt,
weekly plan, and focus block in the local PostgreSQL database. It has no cleanup
path and prints only record hashes.

The operated path proved:

1. The retained client opened rendered Calendar and recorded 37 actual minutes.
2. The block became `COMPLETED`; its task stayed `OPEN`; its goal stayed
   `ACTIVE`.
3. Rendered client Work showed planned time, explicit actual time, evidence,
   support, the next task, and Session contribution.
4. The signed-in Capture Today API returned the same canonical review and goal.
5. The explicitly assigned coach saw the same client review.
6. The unrelated room producer could not read the private goal or client review.
7. Independent PostgreSQL readback matched the completion receipt and its
   `targetStatusMutated: false` boundary.

The operation recorded zero browser exceptions, screenshots, printed secrets,
or external effects. The local schema migration was applied only to loopback
PostgreSQL. No Cloud Run revision, production database, TestFlight build, App
Store record, calendar provider, notification provider, recording, or media
artifact changed.

## Compatibility and calendar identity

The currently distributed Build 25 predates actual-time entry. Its existing
completion request remains accepted so the installed app is not broken by a
server rollout. That path stores `actualMinutes: null` and an explicit
`not-recorded-legacy-client` receipt; it never substitutes the planned window.
Current Capture clients send and validate 1–1,440 actual minutes.

Weekly commitments use a noon-UTC storage marker to preserve their calendar
date. The projector treats that marker as identity, not as the evidence-window
start, so work performed Monday morning is not dropped. Canceled blocks are
also excluded from both planned and actual totals.

## Verification

- Focused web/domain/portability contracts: 89/89 passed.
- Full Nest Jest suite: 224 suites passed, 1,174 tests passed; 35 suites and 105
  tests remained intentionally skipped.
- Strict Quipsly TypeScript and domain typecheck: passed.
- Retained-operation boundary tests: 3/3 passed.
- Rendered client/coach/outsider operation plus independent database readback:
  passed.
- iPhone 17 Pro simulator weekly-review journey: passed.
- Capture/App Store static gate: 1,007/1,007 passed.
- Cross-surface Quipsly contracts: 213/213 passed.
- Optimized Nest production build: passed at the release verifier's 8 GiB Node
  heap setting and produced all 158 routes. The first default-heap attempt
  compiled successfully but exhausted Node's 4 GiB heap during TypeScript.

The first simulator attempt compiled but could not install its test runner
because the system volume had only 103 MiB free. Only the two disposable
weekly-review DerivedData directories were removed, recovering about 2.8 GiB;
the successful rerun placed DerivedData on the external QA volume. No retained
evidence or product media was deleted.

## Remaining release boundaries

- Run the guarded production schema lane for
  `20260802090000_add_work_plan_actual_minutes` before deploying this Nest
  source.
- Qualify the exact committed Nest image at zero traffic, then promote only
  after authenticated acceptance and immutable source/image readback.
- Assign this client work a new Capture build rather than changing Build 25 in
  place.
- Perform the real physical-iPhone actual-time and weekly-review readback; the
  simulator does not satisfy the physical-device gate.
