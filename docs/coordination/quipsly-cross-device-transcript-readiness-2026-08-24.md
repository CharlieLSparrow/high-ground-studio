# Quipsly cross-device transcript readiness

Date: 2026-08-24

## Problem closed

Audio and video recording consent already refreshed during a live browser
Session, but the participant's transcript choice did not. Changing “Create a
transcript” on iPhone could leave an open browser showing stale state, and the
iPhone Session projection did not carry a separate all-party transcript count.
That ambiguity is especially harmful after a successful call: a recording may
be valid while transcription must still remain held.

## Production behavior

- The canonical Session projection reports required participant count,
  transcript-enabled participant count, and all-party transcript readiness
  separately from audio/video recording readiness.
- The consent read endpoint and consent mutation return the same transcript
  readiness vocabulary.
- Browser consent polling adopts server-confirmed transcript changes while the
  call is open.
- If a person has changed the local transcript checkbox but has not saved it,
  polling does not overwrite that pending choice. The UI asks them to choose
  **Update choices**.
- Browser and iPhone state that recording may proceed once source consent is
  ready while transcription waits for every signed-in participant to enable
  it. Transcript readiness never blocks preservation of a valid recording.
- Older iPhone/server combinations that do not return a transcript count do
  not invent a zero-person count.

## Automated evidence

```text
pnpm --filter quipsly exec jest --runTestsByPath \
  'apps/quipsly/src/lib/server/mobile-capture-sessions.test.ts' \
  'apps/quipsly/src/app/api/mobile/capture/consent/route.test.ts' \
  'apps/quipsly/src/components/browser-source-recorder-consent.test.ts' \
  --runInBand

PASS: 3 suites, 33 tests
```

```text
pnpm --filter quipsly typecheck
PASS

node scripts/quipsly-mobile-capture-contract-smoke.mjs
PASS

node scripts/quipsly-ios-capture-app-store-static-smoke.mjs
PASS: 1,143/1,143

xcodebuild -quiet \
  -project apps/mobile-capture/HighGroundCapture/HighGroundCapture.xcodeproj \
  -scheme HighGroundCapture -configuration Debug -sdk iphonesimulator \
  -destination 'generic/platform=iOS Simulator' \
  -derivedDataPath /tmp/quipsly-capture-transcript-readiness-derived \
  CODE_SIGNING_ALLOWED=NO build
PASS
```

## Honest remaining validation

No TestFlight build or Nest deployment was made in this slice. The release
flight should open the same Session on iPhone and browser, change transcript
consent on each endpoint in turn, verify the other surface updates without a
reload, and confirm an unsaved browser change is not overwritten. Then record
a valid two-person take with one participant declining transcription and prove
that sources remain preserved while transcript processing stays held.
