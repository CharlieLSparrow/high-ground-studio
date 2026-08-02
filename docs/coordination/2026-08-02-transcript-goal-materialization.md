# Transcript goal materialization

Date: 2026-08-02

## Outcome

An accepted coaching or production transcript goal can now become one actor-owned canonical `Goal` after the person reviews:

- the exact title and definition of progress;
- an optional target date;
- active canonical tags from the Session's Nest project.

The same review is reachable in Nest Session review and Quipsly Capture on iPhone. Both clients send the same materialization intent to the same packet-goal route.

## Product boundary

Accepting a goal creates exactly one `ACTIVE` Goal and optional `GoalTagLink` rows inside the same serializable transaction as the packet review receipt. It does not create a task, focus block, reminder, calendar event, message, delivery, or publication. The provider transcript, correction overlay, and recording remain unchanged.

The immutable source anchor still includes the room, transcript job, segment, provider text hash, accepted correction when present, recording asset, and protected playback source.

## Retry contract

The materialization intent is canonicalized as:

```text
title + description + targetAt + sorted unique tagIds
```

An exact retry returns the existing Goal. Reusing the request identity with different wording, target date, or tags returns `409 IDEMPOTENCY_CONFLICT` (or the packet-specific conflict code) and does not edit the Goal. Historical undated and untagged receipts remain replayable when their reviewed draft and persisted Goal still agree.

Tag validation happens only for new materialization. Each selected tag must be active, unmerged, and belong to the Session project. Historical exact replay does not fail merely because taxonomy later changes.

## Operated evidence

The local collaboration operation creates real disposable PostgreSQL, Firebase-emulator, Session, recording, transcript, packet, project, and tag records, then uses the rendered and HTTP product boundaries. It proved:

- candidate projection from an exact transcript segment;
- viewer denial and editor authorization;
- actor-owned Goal creation with a 30-day target and canonical Session tag;
- protected playback provenance on the Goal;
- exact retry returns the same Goal;
- a changed target date fails closed;
- the same accepted Goal renders in Session review and Work;
- phone-width Nest review has no horizontal overflow;
- no external side effects;
- complete disposable cleanup, including Goal and Goal tag-link counts.

The first operated attempt exposed a real defect hidden by test mocks: the goal route omitted `CoachingNote.kind` from its packet-summary projection, so the shared correlation helper correctly refused to select the row as a SUMMARY. The route now selects `kind`, and its test asserts that database projection explicitly.

## Verification commands

```bash
pnpm --filter quipsly typecheck
pnpm --filter quipsly exec jest --runInBand --runTestsByPath \
  'src/app/(app)/sessions/[roomId]/session-review-model.test.ts' \
  'src/app/api/mobile/capture/transcripts/goals/route.test.ts' \
  'src/app/api/mobile/capture/transcripts/packet/goals/route.test.ts'
node scripts/quipsly-mobile-capture-contract-smoke.mjs
QUIPSLY_LOCAL_COLLABORATION_DOGFOOD=1 node --experimental-transform-types \
  --import ./scripts/register-ts-extension-loader.mjs \
  scripts/quipsly-local-session-collaboration-dogfood.mjs
xcodebuild -project apps/mobile-capture/HighGroundCapture/HighGroundCapture.xcodeproj \
  -scheme HighGroundCapture -sdk iphonesimulator \
  -destination 'generic/platform=iOS Simulator' CODE_SIGNING_ALLOWED=NO build
xcodebuild -project apps/mobile-capture/HighGroundCapture/HighGroundCapture.xcodeproj \
  -scheme HighGroundCapture \
  -destination 'platform=iOS Simulator,id=2E767456-A722-4429-BC96-FCD9E1CCC72A' \
  -only-testing:HighGroundCaptureUITests/CaptureExperienceUITests/testTranscriptReviewKeepsPreviewAndAIBehindTruthBoundaries \
  test CODE_SIGNING_ALLOWED=NO
```
