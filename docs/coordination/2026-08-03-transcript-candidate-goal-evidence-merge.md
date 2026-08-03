# Transcript candidate evidence on an existing goal

Date: 2026-08-03

## Outcome

Quipsly can now append one playback-reviewed transcript goal candidate as
evidence on one explicitly selected existing goal. The goal keeps its canonical
identity, definition, status, target date, project, tags, linked tasks, and
numeric progress. Quipsly adds a separate immutable evidence receipt instead
of creating a duplicate goal or treating transcript evidence as progress.

The operation is available in Nest and Quipsly Capture through the same
canonical API. A person must listen to and confirm the candidate's complete
source span, choose **Add evidence to existing goal**, choose the exact active
or paused goal, review the boundary disclosure, and confirm. Nothing is
automatically materialized from the transcript.

## Canonical architecture

The transcript candidate remains a packet projection until the reviewer makes
an explicit decision. `POST /api/mobile/capture/transcripts/packet/goals` owns
the merge. The request binds:

- Session, transcript job, recording asset, packet build, packet summary,
  candidate, and ordered source-segment identities;
- immutable provider and effective-source hashes;
- the explicitly selected goal identity and reviewed `updatedAt` value; and
- the current actor and stable packet review identity.

Inside one serializable transaction, the route rechecks Session/project
authority, release and consent gates, current packet and transcript identity,
complete playback verification, candidate evidence, target ownership, target
status, Session/project relationship, and optimistic target version. It locks
the packet and goal, appends one `TRANSCRIPT_CANDIDATE_MERGED`
`GoalProgressReceipt`, records the terminal packet-review receipt, and reads
the same canonical goal back.

The evidence receipt contains the exact source segment IDs and snapshot,
recording and transcript identities, packet build and candidate identities,
reviewer, playback verification, and the goal snapshot reviewed at merge time.
The shared domain parser projects that provenance into Nest Work and Capture
Today/Work. Both surfaces show transcript evidence separately from numeric
progress and link back to the exact first source segment.

## Identity, progress, and replay boundaries

This operation does not edit the goal. Its title, description, status, target,
project, room, parent, tags, tasks, achievement state, numeric progress, and
`updatedAt` remain unchanged. Because evidence is append-only, the target
picker counts only `TRANSCRIPT_CANDIDATE_MERGED` receipts. Numeric progress
receipts are not mislabeled as transcript evidence.

An exact retry returns the prior goal and receipt with
`idempotentReplay=true`; it does not append another receipt. A changed target,
stale target version, different packet build or candidate, missing playback
review, lost release permission, or target outside the actor/project boundary
fails closed.

The operation creates no task, note, calendar link, output, delivery, Studio
edit, or publication. Creating a new goal remains a separate explicit action.

## Cross-surface UX

Nest Session Review and Capture use the same decision vocabulary:

- **Accept as new goal** creates one reviewed canonical goal;
- **Add evidence to existing goal** preserves the selected goal and appends
  evidence;
- draft, defer, and reject remain noncanonical review decisions.

The picker lists only actor-owned active or paused goals in the current Session
or project. It shows the goal definition, target, status, and existing evidence
count before confirmation. After merging, Work and Today expose a dedicated
evidence card rather than folding evidence into the progress percentage. The
source action opens the transcript at the exact evidence boundary, including
after Capture is terminated and relaunched.

## Retained compiled-iPhone operation

`pnpm quipsly:retained:native-packet-goal-evidence-merge` is an explicitly
authorized, loopback-only retained operator. It uses the synthetic retained
coach, local Firebase Authentication, local Nest, loopback PostgreSQL, and a
checksum-verified recording fixture. It has no cleanup path.

The successful operation used:

- Session `qa-reviewed-packet-1785772274056-f5aba3b4`;
- recording asset `qa-reviewed-packet-1785772274056-f5aba3b4-asset`;
- transcript job `qa-reviewed-packet-1785772274056-f5aba3b4-transcript`;
- source SHA-256
  `309adeddf1851bf9929718113c5bf058d4501c65f59187e14b39a8de792a90e0`;
- goal `mobile-goal-47812a82-f589-4f78-a6a5-ee6e8cd4f626`; and
- evidence receipt `663676f5-e3d8-496d-bd23-89d96c19d992`.

The compiled iPhone 17 Pro simulator journey authenticated, installed the
recording, played and confirmed all three source segments, rebuilt the packet,
selected the exact existing goal, confirmed the evidence append, terminated
and relaunched Capture, read the evidence from Today, and returned to the exact
transcript source boundary.

Independent packet and PostgreSQL readback proved one goal, one existing 35%
numeric-progress receipt, one transcript-evidence receipt, and no changed goal
definition. An exact API replay returned the same receipt without duplication.
The room retained zero tasks, notes, calendar links, outputs, and deliveries.

The create-only receipt is
`/private/tmp/quipsly-packet-goal-evidence-merge-receipt-1785772441380-86156.json`.
The passing Xcode result bundle is
`/private/tmp/quipsly-packet-goal-evidence-merge-1785772275151-86156.xcresult`.

## Defect found by real operation

The first database-backed attempt found that the merge picker originally
counted every `GoalProgressReceipt` as transcript evidence. A goal with 35%
progress therefore appeared to have one evidence item before any transcript
merge. The projection now filters the relation count by
`TRANSCRIPT_CANDIDATE_MERGED`, and the retained operator requires an initial
evidence count of zero while independently proving the numeric receipt exists.
The Today/Work projection also reads one latest numeric receipt and one latest
transcript-evidence receipt with a bounded PostgreSQL `DISTINCT ON` query, so a
long history in either lane cannot crowd the other out. The source contract and
dedicated projection tests lock in both fixes.

## Verification and release boundary

The selected compiled-app XCTest passed 1/1 with no failures. The retained
operation then passed independent database readback, exact replay, result
bundle readback, and create-only receipt creation. A generic unsigned iOS
Simulator build also passed after the shared destination and evidence card were
factored into file-level reusable types.

Final bounded-source verification passed:

- focused Nest UI/model/API proof: 9 suites and 141 tests;
- full Nest Jest proof: 245 suites and 1,316 tests passed, with 37 suites and
  108 tests intentionally skipped;
- full repository Quipsly contracts: 259/259;
- mobile Capture source contract: 126/126;
- Quipsly and shared-domain strict TypeScript: passed;
- retained operation source contract: 1/1;
- generic unsigned iOS Simulator build: passed;
- retained compiled-app iPhone journey: 1/1; and
- iOS App Store static gate: 1,009/1,009.

This work used local services and an iPhone simulator. It is not
physical-iPhone, production Nest, TestFlight, production-database, or App Store
proof. No Cloud Build, cloud deployment, production migration, provider
mutation, invitation, external message, delivery, or publication occurred.
