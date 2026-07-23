# Capture build 2 release checkpoint

**Date:** 2026-07-23
**Status:** Exact-commit App Store candidate and production signed-in smoke ready; physical iPhone and upload remain open

## Current distribution truth

Quipsly Capture `1.0 (1)` reached App Store Connect on 2026-07-21, but Apple
rejected its processing with `ITMS-90683`: the bundled LiveKit camera API
reference required `NSCameraUsageDescription`.

Build `1.0 (2)` fixes that exact rejection while preserving the audio-first
product boundary:

- packaged `NSCameraUsageDescription` says camera access occurs only after an
  explicit video choice and that audio recording does not use the camera;
- packaged `NSMicrophoneUsageDescription` covers explicit recording;
- packaged `UIBackgroundModes` contains `audio`;
- app and Share Capture extension both use build `2`;
- the app and extension contain Store provisioning profiles and distribution
  entitlements rather than development/device profiles.

Build 2 has not been uploaded. The release receipt deliberately records
`uploadPerformed: false`.

## Exact build 2 candidate

The current candidate was generated from clean Capture revision
`4dc0ccf5f0d5af87cb2f921a6d716fb95b04281a`:

- archive:
  `/tmp/quipsly-capture-release/4dc0ccf5f0d5/QuipslyCapture-1.0.2.xcarchive`;
- IPA:
  `/tmp/quipsly-capture-release/4dc0ccf5f0d5/QuipslyCapture-1.0.2.ipa`;
- receipt:
  `/tmp/quipsly-capture-release/4dc0ccf5f0d5/QuipslyCapture-1.0.2-release-receipt.json`;
- IPA bytes: `17,575,310`;
- IPA SHA-256:
  `f2f01e814eb1515b4949d369a696fdcf625946eb2ce6ef3c01d9baa62f8a1c4c`.

The verifier read the exported IPA—not only the development-signed archive—and
proved:

- Cloud Managed Apple Distribution signing for team `585GUXMY5M`;
- Store profiles for the app and Share Capture extension, expiring 2027-06-23;
- `get-task-allow = false`;
- `beta-reports-active = true`;
- strict nested signatures;
- matching bundle identifiers and versions;
- packaged privacy manifest, camera/microphone purposes, and background audio.

The LiveKit XCFramework distribution still does not provide matching dSYMs for
all bundled binary frameworks. Apple accepted the same dependency in build 1
with warnings, but third-party crash symbolication remains incomplete.

## Simulator UX and hands-on proof

The deterministic iPhone suite runs serially because Xcode 26.2 parallel clone
launches produced SpringBoard runner failures before app code executed.
Fastlane now encodes this instead of leaving it to an agent's command line.

Passing proof on iPhone 17 Pro Simulator, iOS 26.3.1:

- 19/19 `CaptureExperienceUITests`;
- 2/2 `CaptureLoginExperienceUITests`;
- 3/3 `ShareCaptureExtensionUITests`;
- 24 passed, 0 failed in the deterministic TestFlight gate.

The tests cover navigation, notes/tasks/goals/sources, Nest-scoped tags, due
dates, recurrence, reminders, consent, accessibility, transcript provenance,
goal evidence, session planning, Share Capture account boundaries, protected
outbox recovery, and cross-owner privacy.

Fifteen signed-in `CaptureRoomRuntimeSmokeTests` are intentionally excluded
from the deterministic lane. They require a short-lived reviewer credential
packet and real Nest data; reporting them as ordinary green simulator tests
would be false readiness.

The visible app was also operated directly in Simulator. A Homer coaching
session note was entered, tagged with the canonical `Coaching` tag, and saved.
Preview mode correctly returned “Preview only — no note, task, goal, or source
was saved” instead of inventing a sync receipt.

The read-only production runtime smoke now also passes through the native app:

- Firebase accepted the Keychain-backed reviewer credentials;
- Firebase account lookup proved the mailbox is verified;
- Quipsly verified the bearer token and returned the matching Home Nest;
- the app reached the protected Today surface and navigated the signed-in
  workflow in 21.656 seconds;
- the reviewer can see four production capture sessions.

This gate initially failed honestly because `codex@dev.test` had valid password
credentials but `emailVerified: false` in Firebase. The reviewer account was
repaired to `emailVerified: true`; Capture's protected-session rule was not
weakened. The live reviewer proof now checks the Firebase account record, so a
password-only success cannot be reported as native-ready again.

## Nest dependency

Production billing/auth are no longer the immediate blocker:

- `https://nest.quipsly.com/api/health` returns `ok: true`;
- local `http://127.0.0.1:3012/api/health` returns `ok: true`.

The production reviewer proof is read-only and now passes account, Home Nest,
session visibility, participant, consent, lifecycle, and safe-next-action
checks. It does not prove private note/task/goal/tag writes or
recording/upload/transcript recovery. Those remain physical-device dogfood
gates.

Local ADC also now carries quota project `quipsly-reef`. The Cloud preflight
must call Firebase Admin—not merely mint a token or describe the project—before
claiming local auth is ready.

## Physical-device gate

Xcode 26.2 and CoreDevice still list only unavailable iPads `Layla` and
`Morbo`. USB inventory contains no iPhone or Apple Mobile Device. This blocks:

- development install and launch on the intended iPhone;
- microphone, audio-route, interruption, background, and force-quit recovery;
- real session recording and local-file playback;
- TestFlight installation and tester smoke.

Reconnect the unlocked iPhone with a data-capable cable, accept **Trust This
Computer**, and keep the screen awake. The first required readback is:

```bash
DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer xcrun devicectl list devices
```

The iPhone must appear as `available` before installation is attempted.

## Upload gate

The `fastlane ios beta` lane now:

1. runs the 24-scenario deterministic UI gate serially;
2. rebuilds and verifies the exact committed Capture revision;
3. uploads without silently changing the committed build number.

It requires `APP_STORE_CONNECT_API_KEY_PATH` to point to a Fastlane-compatible
App Store Connect API key JSON. Do not create or commit that credential in this
repository.

No `AuthKey_*.p8` file was found through Spotlight and
`APP_STORE_CONNECT_API_KEY_PATH` is currently unset. Before upload, provide or
create the App Store Connect API credential and complete the physical
development install. After upload, inspect App Store Connect processing,
resolve any new Apple warning or rejection, install build 2 from TestFlight,
and repeat the physical smoke from the TestFlight-installed binary.

## Repository and pipeline boundary

This release does not require an emergency repository split. The working
boundary is now explicit:

- Capture source, tests, export configuration, verifier, and release receipt
  form one path-scoped release slice;
- artifacts are generated only from an exact clean Capture commit;
- deterministic simulator tests, credentialed production runtime checks,
  physical-device checks, and TestFlight-installed checks are separate gates;
- Nest deploy context and reviewer tooling are a separate slice and must not be
  swept into a broad monorepo commit.

The larger checkout remains preservation-sensitive and dirty. A repo split
should happen only after the Capture↔Nest API/auth/tagging contracts are
versioned and a clean extraction can preserve history. Splitting first would
copy the current uncommitted boundary confusion into multiple repositories.

## Platform-target decision

The compiler currently emits an iOS 17 minimum target while the active platform
policy calls for iOS 26. Do not change the minimum blindly before the intended
physical iPhone OS version is visible. Once the device is available, either:

1. migrate app, extension, docs, and tests to iOS 26 and prove the real device;
   or
2. record a concrete supported-device/customer exception to the latest-only
   policy.
