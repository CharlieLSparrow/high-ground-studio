# Quipsly reviewed-recording source continuity

Date: 2026-08-24

## Outcome

Nest and Quipsly Capture now reopen a reviewed recording from the exact source
manifest and text cuts stored with that revision. This closes a source-integrity
gap where a later edit could silently choose the current default participant
tracks and, on iPhone, clear the retained transcript exclusions.

This changes only editor state restoration. Original recordings, verified
source manifests, released outputs, and prior revisions remain immutable.

## Behavior

- A current output with a source manifest restores only those exact recording
  asset IDs that are still available in the Session take.
- A legacy output without a source manifest retains the established one-source-
  per-participant fallback, preferring the participant's local audio master.
- A manifest source that is no longer available is not replaced by another
  participant track. The editor shows a visible warning and requires deliberate
  source recovery or replacement.
- Web edit, web cancel, web transcript focus, native edit-again, and initial
  native output load all restore the persisted title, trim range, and transcript
  exclusions.
- The consent route no longer exports a test-only helper from a Next.js route
  module. Its test imports the canonical policy helper directly, keeping the
  production type-generation gate valid.

## Automated evidence

All commands ran from the coaching release worktree.

```text
pnpm --filter quipsly exec jest --runTestsByPath \
  'apps/quipsly/src/app/(app)/sessions/[roomId]/session-recording-share-card.test.tsx' \
  'apps/quipsly/src/lib/server/session-recording-share.test.ts' \
  'apps/quipsly/src/app/api/mobile/capture/consent/route.test.ts' --runInBand

PASS: 3 suites, 20 tests
```

```text
pnpm --filter quipsly typecheck
PASS: Next route types generated; TypeScript clean
```

```text
node scripts/quipsly-mobile-capture-contract-smoke.mjs
node scripts/quipsly-ios-capture-app-store-static-smoke.mjs
PASS: both Capture contract gates
```

```text
xcodebuild -quiet \
  -project apps/mobile-capture/HighGroundCapture/HighGroundCapture.xcodeproj \
  -scheme HighGroundCapture -configuration Debug -sdk iphonesimulator \
  -destination 'generic/platform=iOS Simulator' \
  -derivedDataPath /tmp/quipsly-capture-source-manifest-derived \
  CODE_SIGNING_ALLOWED=NO build
PASS: unsigned generic iOS Simulator build
```

## Remaining release evidence

This checkpoint does not claim a new TestFlight build or live production
deployment. Before release promotion, exercise a non-default reviewed source
and a retained text cut on a physical iPhone, reopen that revision on Nest, and
confirm the same source IDs and exclusions survive cross-surface readback. Also
exercise the missing-source warning with a controlled fixture; do not remove a
real source recording to manufacture that case.
