# Append-only audio mastery review

Date: 2026-08-04
Worktree: `/Users/wall-e/Dev/high-ground-studio-product`
Priority: trustworthy audio automation without destructive or untraceable approval

## Outcome

Quipsly now has a durable listening-decision layer between a verified mastering preview and any future promotion. The Episode editor guides an authorized reviewer through the source moments most likely to reveal whether the master is acceptable, retains the decision as an append-only receipt, and leaves both source and preview unchanged.

This is deliberately a lifecycle boundary rather than a modal confirmation. Automated measurement can prove delivery values. The player can retain what it played. Only a person can judge intelligibility, tone, artifacts, comfort, and creative intent.

## Review workflow

The desk derives three recommended moments from complete-decode measurements:

1. the loudest source true-peak moment;
2. the quietest non-silent three-second source passage;
3. the largest aligned short-term loudness shift between source and preview.

Approval remains disabled until the browser has advanced through approximately three seconds around every required moment in both source and preview and has operated in both modes:

- matched loudness, which attenuates only the louder monitor feed to reduce louder-is-better bias;
- delivery level, which plays both files at unity monitor gain.

A rejection can be retained after preview playback when the reviewer supplies a note. This makes early failure reporting easy without pretending the complete approval path was performed.

## Durable contract

`StudioAudioMasterReviewReceipt` retains:

- exact project, asset, mastery job, actor, and client request identity;
- approved or rejected decision and optional/required note;
- delivery profile;
- immutable source SHA-256 and generation;
- verified preview SHA-256;
- bounded source and preview second bins, monitor modes, and completion time;
- derived coverage of each recommended moment;
- a stable request hash for exact idempotent replay.

The service independently reloads the completed job, rechecks the exact attached source, hashes the current original and preview, verifies the preview receipt, and uses a serializable transaction plus advisory lock before appending a receipt.

## Honesty boundary

Browser-tracked progress is useful operating evidence, not proof of audibility, attention, or subjective judgment. The retained evidence says this explicitly. A sufficiently privileged or modified client can fabricate browser evidence; server authorization, source binding, bounded values, immutable hashes, append-only history, and user accountability reduce ambiguity but cannot turn software telemetry into proof of human hearing.

Approval is also not promotion. This slice creates no media variant, timeline edit, task, goal, delivery, publication, or source mutation. A future promotion operation must recheck a current approval against the same source and preview hashes and create a separate versioned delivery receipt.

## Retained operation

The local retained operation used the existing High Ground Odyssey Episode 4 mastering fixture:

- asset: `cmse192a8000e8jxldysq5b1u`;
- source: `cmse1929v000d8jxlwao4837y`;
- mastery job: `audio_mastery_9cafe8cc6c684e90bcb07ca008bfd48c`;
- source SHA-256: `6aeaaacd1ceeab3923b119297a0efd0a17c95e1fe0ec4a9de60a5795b8d3ac0e`;
- preview SHA-256: `10e108059673d6ad89e0f2779a517ff5f3b5418f9ba9ef64298e53acc35416b4`;
- source duration: 12 seconds;
- verified preview: -15.97 LUFS, -9.44 dBTP, Apple Podcasts dialogue profile.

The rendered operation selected the shared processing map, advanced protected preview playback, switched to the protected source without losing the playhead, and verified the approval control remained disabled. An authenticated request with empty playback coverage returned HTTP 409 and `AUDIO_MASTER_REVIEW_INCOMPLETE`.

The same operation proved:

- signed-out review: HTTP 401;
- separate-account review: HTTP 403;
- incomplete review receipt count before/after: unchanged;
- source, preview, asset, and processing receipts before/after: unchanged;
- browser exceptions: 0;
- horizontal overflow: none.

Automation did not create an approval or rejection because either decision would claim a person's listening judgment.

## Verification

- Prisma schema format, validation, generation, migration application, and current-status readback: pass;
- focused mastery UI, processing-map, API, and server tests: pass;
- retained operation contract test: pass;
- rendered retained source/preview operation: pass.
- strict shared-media and Nest TypeScript: pass;
- full Nest Jest: 277 suites and 1,463 runnable tests pass, with 38 suites / 110 tests intentionally skipped;
- optimized 170-page Nest production build: pass with an 8 GB Node build heap after the default 4 GB worker limit was exhausted during build-time TypeScript.
