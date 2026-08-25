# Quipsly recording-preview renderer parity

Date: 2026-08-24

## Outcome

Nest and Quipsly Capture now enable **Create private preview** whenever either
verified rendering path is available. Production can therefore use the
private, queued cloud renderer without requiring a renderer on the Nest web
container or the iPhone.

The user-facing flow remains one conventional action. Renderer placement is an
operational detail, not a choice the coach must understand.

## Failure behavior

- When a local or cloud renderer is available, the same private-preview action
  remains enabled.
- When neither renderer is available, the action stays disabled and both
  clients explain that preparation is temporarily unavailable.
- Existing trim and transcript choices stay on screen; the clients do not
  claim a draft exists or mutate original recordings.
- A failed render now offers **Review trim and try again**, reopens the exact
  retained choices, and states that no recording was shared or lost.
- Authorization, source verification, immutable render inputs, private review,
  explicit release, and revocation boundaries are unchanged.

## Automated evidence

```text
pnpm --filter quipsly exec jest --runInBand --runTestsByPath \
  'src/app/(app)/sessions/[roomId]/session-recording-share-card.test.tsx'

PASS: 1 suite, 12 tests
```

The focused browser suite includes a cloud-only renderer case, a true
no-renderer case, and failed-render recovery with retained edit choices.

```text
pnpm --filter quipsly typecheck
PASS: Next route types generated; TypeScript clean
```

```text
node scripts/quipsly-mobile-capture-contract-smoke.mjs --source-only
PASS: native contract requires local-or-cloud renderer capability
```

```text
xcodebuild -project \
  apps/mobile-capture/HighGroundCapture/HighGroundCapture.xcodeproj \
  -scheme HighGroundCapture -sdk iphonesimulator -configuration Debug \
  CODE_SIGNING_ALLOWED=NO build

PASS: arm64 and x86_64 simulator application build
```

## Release boundary

This checkpoint is local release evidence. It does not claim a Nest deployment,
a new TestFlight build, or successful rendering against the credentialed cloud
processor. Those remain deliberate release-train and live-service checks.
