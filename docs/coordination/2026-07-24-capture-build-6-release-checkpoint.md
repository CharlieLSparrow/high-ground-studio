# Capture build 6 release checkpoint

**Date:** 2026-07-24

**Status:** exact-source signed candidate complete; production parity,
TestFlight upload, and physical-iPhone proof remain blocked

## Release decision

Quipsly Capture `1.0 (6)` is the current uploadable candidate. It supersedes
the local Build 5 candidate. No Build 6 upload has been attempted.

Build 6 must not be described as distributed, installed from TestFlight, or
submitted to App Review. Its receipt deliberately leaves provider processing,
tester assignment, and physical installation false.

## Product and repository changes

Build 6 contains the first operated canonical one-time Task editor:

- an existing Task can change title, detail, due local time, and timezone;
- a due date can be cleared without inventing a reminder or provider event;
- writes require the owner, expected revision, and serializable convergence;
- every accepted edit retains an append-only receipt;
- Today and Calendar read the same canonical Task after the edit.

The local dogfood workflow created a real Episode 5 project, note, Task, Goal,
shared canonical tag, Goal/Task relationship, due date, and focus block. It
then renamed `episode-5` to `HGO Episode 5`; searching the former name still
resolved the linked Task, Goal, note, and tag. Search copy now distinguishes
the number of returned records from the number of Nests searched.

The candidate also replaces both remaining
`AVAsset.tracks(withMediaType:)` calls with asynchronous track loading. The
editor view models now have explicit main-actor ownership, stale asynchronous
player rebuilds are discarded by revision, and AVFoundation callbacks return
to the main actor before mutating observable state.

Repository work continues only in the clean product worktree:

- worktree: `/Users/wall-e/Dev/high-ground-studio-product`;
- branch: `codex/quipsly-product-20260724`;
- candidate source: `e0525e68f9d2cedaa14c597ed978c4b66715b0f4`;
- the original dirty checkout remains preserved and was not used as release
  input;
- all 22 workspace projects use pinned TypeScript `7.0.2`;
- dependency build scripts have one explicit reviewed allowlist;
- every app has a release manifest and exact-commit release boundary.

## Exact candidate

The candidate was archived from a disposable detached worktree at:

`e0525e68f9d2cedaa14c597ed978c4b66715b0f4`

Artifacts:

- archive:
  `/tmp/quipsly-capture-release/e0525e68f9d2/20260724T204834Z-41877/QuipslyCapture-1.0.6.xcarchive`;
- IPA:
  `/tmp/quipsly-capture-release/e0525e68f9d2/20260724T204834Z-41877/QuipslyCapture-1.0.6.ipa`;
- receipt:
  `/tmp/quipsly-capture-release/e0525e68f9d2/20260724T204834Z-41877/QuipslyCapture-1.0.6-release-receipt.json`;
- IPA bytes: `18,058,977`;
- IPA SHA-256:
  `5612531c7130a5815b10da2e5397d99cd0a2789a5e4956f230d90b59c77666cb`.

The disposable release worktree was removed after export. The receipt records
`sourceIsolation: detached-worktree`, `uploadAttempted: false`,
`uploadPerformed: false`, and `uploadOutcome: not-attempted`.

## Signed artifact proof

The exact-source release lane proved:

- app and Share Capture extension version `1.0 (6)`;
- Apple Distribution signing for team `585GUXMY5M`;
- App Store provisioning profiles for the app and extension;
- distribution-safe entitlements;
- strict nested signatures in the archive and exported IPA;
- packaged privacy manifest;
- bounded camera and microphone purpose strings;
- packaged audio background mode;
- packaged `ITSAppUsesNonExemptEncryption = false`.

## Test proof

The committed source passed:

- 30/30 serial native UI scenarios on iPhone 17 Pro Simulator;
- exact result bundle:
  `/tmp/quipsly-capture-ui-tests/e0525e68f9d2/20260724T203625Z-34828/HighGroundCapture.xcresult`;
- a generic iOS Simulator build after the AVFoundation migration;
- 80/80 Quipsly safety contracts;
- 635/635 Capture App Store static assertions;
- release-source verification at matching app/extension Build 6;
- release-build isolation regression.

The native suite operated account safety, accessibility, consent, reminders,
relaunch, notes, Tasks, Goals, due dates, recurrence, canonical tags, Work,
transcript evidence boundaries, Share Sheet provenance, owner switching, and
protected outbox recovery. This is real simulator app operation, not
physical-device or TestFlight proof.

## Remaining external gates

Current read-only checks show:

1. `gcloud` selects `charlie@highgroundodyssey.com`, but user credentials,
   Application Default Credentials, deploy-project access, and Firebase Admin
   access cannot currently mint or authorize tokens.
2. GitHub CLI is signed out, so the clean branch is not pushed and has no draft
   pull request.
3. App Store Connect API-key and Apple-ID fallback variables are absent; no
   key exists in `~/.appstoreconnect/private_keys`.
4. CoreDevice sees no iPhone. It sees only unavailable devices `Layla` and
   `Morbo`.
5. System-wide `xcode-select` points to
   `/Library/Developer/CommandLineTools`. The pinned runner still builds and
   tests with full Xcode, but Xcode's post-test diagnostic collector cannot
   find `simctl`.

Operator commands:

```bash
gcloud auth login --update-adc --brief
gcloud auth application-default set-quota-project quipsly-reef
bash scripts/release/quipsly-gcloud-auth-check.sh

gh auth login

sudo xcode-select --switch /Applications/Xcode.app/Contents/Developer
xcrun --find simctl
```

Keep the App Store Connect API key outside the repository and expose it only
through `APP_STORE_CONNECT_API_KEY_PATH`.

## Next authorized sequence

1. Reauthenticate Google Cloud/Firebase and GitHub.
2. Push the clean product branch and open a draft pull request.
3. Preview-deploy its exact Nest source, run auth/privacy/mobile smokes,
   promote, and read back the production revision and all mobile routes.
4. Make one unlocked, trusted iPhone visible to CoreDevice.
5. Configure the external App Store Connect API key.
6. Upload Build 6 through `scripts/deploy-testflight.sh`, then read back Apple
   processing and tester assignment.
7. Install from TestFlight and operate real note, Task, Goal, tag, reminder,
   recording, offline/process-death recovery, upload, and same-ID Nest
   readback.
8. Complete metadata, screenshots, privacy labels, compliance, review notes,
   submission, and platform readback.

Fastlane `2.237.0` is available; the release remains intentionally pinned to
the reviewed `2.236.1` lockfile. Update it only in a separate dependency
change with a complete release regression.

Build 6 is a signed exact-source local candidate. It is not yet a distributed
beta or an App Store submission.
