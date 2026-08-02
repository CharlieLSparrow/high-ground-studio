# Coaching goal progress readback

Checkpoint: 2026-08-02 MDT

## Outcome

Quipsly now distinguishes a client progress check-in made after an immutable
follow-up release from a change to the goal definition or status. The assigned
client can open the same canonical Goal from the next coaching Session, append
a bounded progress percentage and evidence note, and return to Session
preparation. Nest and Quipsly Capture show that exact receipt to the client and
assigned coach while an unrelated Session participant learns neither the Goal
nor Task title.

The projection does not copy work into the next Session. It reads the original
Task, Goal, and newest `GoalProgressReceipt` through their canonical IDs.

## Product contract

- `changedSinceRelease` continues to mean that the current Goal definition,
  status, or target differs from the hash-covered released snapshot.
- `progressedSinceRelease` means that the newest progress receipt occurred
  strictly after the release timestamp.
- A progress receipt that predates or coincides with the release is not
  relabelled as new follow-through.
- The summary counts a Goal once when either its definition changed or it has a
  post-release check-in; it does not double-count a Goal satisfying both.
- Nest labels new evidence as **New check-in since release** rather than
  implying that an Active Goal was completed or rewritten.
- Quipsly Capture shows the percentage, evidence note, and same distinction in
  the next-Session preparation card. The optional native decode preserves
  compatibility with an older Nest response during a staggered release.

Only the Goal owner receives the Work mutation link. The coach receives
read-only preparation context. Authorization remains the same exact Nest,
Session purpose, assigned client, and assigned coach relationship as the
released client follow-up.

## Operated web acceptance

The retained client signed into local rendered Nest at phone width, opened
Session 2, completed the exact canonical Task, opened the exact canonical Goal,
and saved:

- progress: `75%`;
- evidence: `I used the smaller boundary in one difficult conversation and
  recovered before overcommitting.`

The client then returned to Session 2 and read back `2 updated`, the completed
Task, the 75% check-in, the evidence note, and **New check-in since release**.
The assigned coach saw the same live state without a client-owned Work mutation
link. The retained outsider saw no follow-through card, Task title, or Goal
title.

Independent PostgreSQL readback proved exactly one new progress receipt,
unchanged Goal status `ACTIVE`, zero copied Tasks and Goals in Session 2, and an
unchanged released output ID and SHA-256. Delivery-event, Calendar-link, and
Session-output counts did not change.

Retained evidence:

`/Volumes/My Passport/Quipsly QA Artifacts/Coaching Follow Through/20260802T062526167Z`

That directory contains four visual readbacks and a mode-`0600` receipt. No
password, bearer token, cookie, OAuth secret, or database URL is retained.

## Operated iPhone acceptance

The compiled Quipsly Capture app authenticated as the retained coach against
local Firebase Auth and local Nest, selected the exact canonical Session 2,
and read the same 75% receipt and evidence sentence. It also revealed the
actor-private continuity brief and returned to the exact originating Session.

Selected XCTest:

`CaptureRoomRuntimeSmokeTests/testPriorCoachingContinuityProjectsIntoExactNextSession`

Result: 1 passed, 0 failed, 0 skipped, with zero unexpected runtime warnings.

Result bundle:

`/private/tmp/quipsly-retained-native-coaching-continuity-1785652090570-6200.xcresult`

## Verification

- focused Session projection, rendered card, and Work actions: 30/30;
- strict Quipsly TypeScript: pass;
- retained three-account rendered operation: pass;
- retained compiled Capture operation: 1/1;
- retained native operator contract: 1/1;
- mobile cross-surface source contracts: 84/84;
- Capture/App Store static contracts: 999/999;
- phone- and desktop-width visual inspection: pass;
- explicit diff check: pass.

## Truth boundary

This is durable local PostgreSQL, rendered browser, and compiled iPhone
simulator proof. The check-in is synthetic retained QA evidence, not a claim
that a genuine coaching commitment was completed. No Cloud Build, Cloud Run,
TestFlight, provider-calendar write, message, invitation, publication, billing
action, production database mutation, or physical-iPhone operation occurred.

Two genuine coaching workflows, physical two-account use, deployed parity,
TestFlight repetition, and the wider active product goal remain open.
