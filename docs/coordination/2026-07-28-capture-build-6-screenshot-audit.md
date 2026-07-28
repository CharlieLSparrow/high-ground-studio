# Capture Build 6 App Store screenshot audit

**Date:** 2026-07-28
**Status:** exact Build 6 layout drafts captured and visually audited; all
five remain rejected for App Store submission

## Exact-source evidence

The committed-source screenshot boundary ran against the exact Build 6 app
source:

`f10ceab5e83ce08e61092d3cf6a8e8ec2f457589`

Evidence root:

`/tmp/quipsly-capture-app-store-drafts/f10ceab5e83c/20260728T222408Z-17239`

Readback:

- disposable detached worktree;
- caller source drift excluded;
- one screenshot UI test passed, zero failed, zero skipped;
- iPhone 17 Pro Max simulator, iOS 26.3.1;
- five `1320 x 2868` PNGs;
- `sourceDirty: false`;
- `sourceIsolation: detached-worktree`;
- `submissionEligible: false`.

The Build 6 materializer contained a macOS path-identity defect: its direct-CLI
guard compared `/var/...` with `/private/var/...`, returned success, and skipped
the materialization body. The outer release boundary rejected the missing
receipt, then used the exact committed module's exported CLI function to
materialize the preserved attachments. The committed-source receipt records
`materializationMode: exact-committed-recovery`.

Future source fixes:

- `d4678ec` canonicalizes the materializer path with `realpath`;
- the committed wrapper has a tested exact-module recovery path;
- a symlinked CLI regression test proves the macOS alias no longer skips work.

## Visual audit

### 01 Today

The first viewport clearly communicates the next session, one focus block, and
committed work. It is intentionally dense. The partial tag chip at the right
edge accurately signals a horizontal tag rail, but the final capture should use
a reviewer account with a shorter representative tag set. The orange
`Preview data` badge is DEBUG-only and disqualifies this draft from submission.

### 02 Record

The consent sheet is the strongest safety story in the set. Audio, video,
transcription, and consent for everyone seen or heard are visibly independent.
The final capture should use the signed/TestFlight app and a synthetic reviewer
session; this DEBUG sheet remains composition evidence only.

### 03 Work

The selected project, task/goal/note entry points, counts, and canonical tags
read clearly. The orange preview badge is again a deliberate DEBUG boundary and
must not appear in the final asset.

### 04 Library

The card clearly distinguishes `Saved on iPhone`, `Waiting for Nest`, and
recoverability. The single-source layout leaves a large quiet area, but the
source-safety story is focused and unclipped. The preview-only action copy was
subsequently tightened from `Preview transcript review` to `Review transcript`.

### 05 Account

The exact Build 6 attachment was captured after XCUITest descendant queries
changed the SwiftUI scroll offset, clipping the stable top viewport. Direct
launch readback showed the real Account surface has a correct status/navigation
area and keeps Privacy policy, account-deletion information, and the destructive
request action reachable in one viewport. The screenshot test now resets
restored Account scroll state before capture and captures before descendant
queries.

This was a screenshot-harness determinism defect, not evidence that Build 6
lays out Account incorrectly. The affected draft is nevertheless rejected.

## Decision

No image from this run may enter
`release/app-store/quipsly-capture/screenshots/en-US`.

The run completed the exact-Build-6 composition audit and identified concrete
harness/copy improvements. Final assets still require:

1. Build 6 installed from TestFlight on the physical iPhone;
2. the approved synthetic reviewer account and visible synthetic session;
3. no DEBUG preview badges or private material;
4. a human visual review of each final PNG;
5. explicit `approved` metadata only after that review.

The screenshot blocker remains open.
