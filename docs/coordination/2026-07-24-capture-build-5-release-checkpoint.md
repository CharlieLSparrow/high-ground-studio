# Capture build 5 release checkpoint

**Date:** 2026-07-24

**Status:** exact-source signed candidate complete; production parity,
TestFlight upload, and physical-iPhone proof remain blocked

## Release decision

Quipsly Capture `1.0 (5)` is the next uploadable build. Build 4 already exists
in App Store Connect, completed Apple processing on 2026-07-23, and currently
reports Missing Compliance. A second Build 4 cannot be uploaded.

Build 5 has not been uploaded. Its receipt deliberately records no upload
attempt, processing readback, tester assignment, or physical installation.

## Product and pipeline changes

The final Build 5 source closes the task-timing reachability failure found by
operating the complete iPhone suite:

- Work and Record open Quick Capture at full height.
- Task recurrence and one-time timing appear before the potentially long
  canonical tag catalog.
- One-time Tasks expose due date and private iPhone reminder as separate
  choices.
- The boundary copy states that a due date organizes Quipsly, a reminder
  schedules a device-private alert while retaining canonical intent in Nest,
  and neither creates a provider-calendar event.
- Quick Capture has an explicit keyboard Done action and interactive keyboard
  dismissal, so timing, tags, and Save remain reachable with a large taxonomy.
- UI tests verify toggle state rather than relying on blind coordinates.
- The app-group share owner bridge is explicitly nonisolated, removing the
  Swift default-actor warning without moving UI state off the main actor.

Test evidence is now isolated as carefully as release evidence. Each default UI
run receives a unique invocation directory. A dirty Capture working tree is
marked `-dirty`; a committed run is keyed to its exact source SHA. Reruns can no
longer overwrite or masquerade as an older result bundle.

The pinned Capture runner also exports the full Xcode developer directory
before invoking Fastlane so builds do not accidentally select Apple's
Command Line Tools.

## Exact candidate

The candidate was archived from detached committed source:

`1dc4550d17eaffa6d785ed8b6d6de04b318379e2`

Artifacts:

- archive:
  `/tmp/quipsly-capture-release/1dc4550d17ea/20260724T193518Z-84144/QuipslyCapture-1.0.5.xcarchive`;
- IPA:
  `/tmp/quipsly-capture-release/1dc4550d17ea/20260724T193518Z-84144/QuipslyCapture-1.0.5.ipa`;
- receipt:
  `/tmp/quipsly-capture-release/1dc4550d17ea/20260724T193518Z-84144/QuipslyCapture-1.0.5-release-receipt.json`;
- IPA bytes: `18,105,614`;
- IPA SHA-256:
  `9989cd50367dca10e5c289af10174d1f1778559ac6802c3c48fda05251f82e05`.

The release worktree was removed after export. `git worktree list` contains
only the primary checkout.

## Signed artifact proof

The exact-source release lane proved:

- app and Share Capture extension version `1.0 (5)`;
- Apple Distribution signing for team `585GUXMY5M`;
- App Store provisioning profiles for the app and extension;
- distribution-safe entitlements;
- strict nested signatures in the archive and exported IPA;
- packaged privacy manifest;
- bounded camera and microphone purpose strings;
- packaged audio background mode;
- packaged `ITSAppUsesNonExemptEncryption = false`.

The receipt truth is:

- `sourceIsolation: detached-worktree`;
- `uploadAttempted: false`;
- `uploadPerformed: false`;
- `uploadOutcome: not-attempted`;
- `buildProcessingWaitReturned: false`;
- `testerAssignmentPerformed: false`;
- `physicalTestFlightInstallReadbackPerformed: false`.

## Test and build proof

The final committed source passed:

- 30/30 serial native UI scenarios on iPhone 17 Pro Simulator, iOS 26.3.1;
- exact result bundle:
  `/tmp/quipsly-capture-ui-tests/1dc4550d17ea/20260724T192247Z-79072/HighGroundCapture.xcresult`;
- 21/21 tracked TypeScript projects on pinned TypeScript `7.0.2`;
- 80/80 Quipsly safety contracts;
- 74/74 mobile source-contract checks;
- 104/104 local Nest mobile source-and-network checks;
- 635/635 Capture App Store static assertions;
- release-source verification and committed-worktree isolation regression;
- both production web builds and the complete local release gate:
  `LOCAL SOURCE READY`.

The native suite operates navigation, notes, tasks, goals, due dates,
recurrence, reminder permission, canonical tags, Work, transcript truth
boundaries, consent, accessibility, account recovery/deletion copy, Share
Sheet provenance, relaunch recovery, and owner isolation. This is real
simulator app operation, not physical-device or TestFlight proof.

## Production compatibility gate

The current production contract audit against `https://nest.quipsly.com`
passes 96 checks and fails 8. These routes return an HTML `404` instead of the
current protected JSON boundary:

- `GET /api/mobile/capture/today`;
- `GET /api/mobile/capture/work`;
- `POST /api/mobile/capture/today`;
- `POST /api/mobile/capture/transcripts/packet/actions`;
- `POST /api/mobile/capture/transcripts/packet/goals`;
- `POST /api/mobile/capture/transcripts/tasks`;
- `POST /api/mobile/capture/transcripts/goals`;
- `POST /api/mobile/capture/transcripts/drafts`.

Do not distribute Build 5 as a production-backed candidate until one committed
Nest revision is preview-deployed, separately smoked, promoted, and read back
with all 104 mobile checks green.

## Current external gates

1. Google Cloud user credentials, Application Default Credentials, project
   access, and Firebase Admin access require interactive reauthentication.
2. GitHub CLI is signed out, so the local commits are not yet pushed or
   represented by a pull request.
3. `APP_STORE_CONNECT_API_KEY_PATH` is not configured.
4. CoreDevice and Xcode see no available physical iPhone. They show only the
   Mac and two unavailable iPads.
5. The system-wide Xcode selection still points at
   `/Library/Developer/CommandLineTools`. The runner selects full Xcode, so
   builds and tests pass, but Xcode's detached diagnostic collector emits a
   nonfatal `simctl` lookup warning.

Operator commands:

```bash
gcloud auth login --update-adc --brief
gcloud auth application-default set-quota-project quipsly-reef
bash scripts/release/quipsly-gcloud-auth-check.sh

gh auth login

sudo xcode-select --switch /Applications/Xcode.app/Contents/Developer
xcrun --find simctl
```

The App Store Connect API key must be stored outside the repository and exposed
only through `APP_STORE_CONNECT_API_KEY_PATH`.

## Known nonblocking maintenance

Two deferred native video-editor helpers still call the iOS 16-deprecated
`AVAsset.tracks(withMediaType:)`. Correctly replacing them requires an async
`loadTracks(withMediaType:)` lifecycle and cancellation pass. They are not part
of the Capture-first task, note, session, or upload path and were not given a
cosmetic release-only rewrite.

Fastlane `2.237.0` is available; the release remains intentionally pinned to
the reviewed lockfile version `2.236.1`. Dependency updates belong in a
separate tested slice.

## Next authorized sequence

1. Reauthenticate Google Cloud/Firebase and GitHub.
2. Push the committed branch and establish reviewable remote provenance.
3. Preview-deploy the exact Nest source, run auth/privacy/mobile smokes, promote
   it, and read back production revision plus all 104 mobile checks.
4. Configure the external App Store Connect API-key JSON.
5. Upload Build 5 through `scripts/deploy-testflight.sh`, then read back Apple
   processing and tester assignment.
6. Make an unlocked, trusted iPhone visible, install from TestFlight, and
   operate real task/tag/note capture, reminder permission, recording,
   offline/process-death recovery, upload, and same-ID Nest readback.
7. Complete metadata, screenshots, privacy labels, compliance, review notes,
   submission, and platform readback.

Build 5 is a signed, exact-source local candidate. It is not yet a distributed
beta or an App Store submission.
