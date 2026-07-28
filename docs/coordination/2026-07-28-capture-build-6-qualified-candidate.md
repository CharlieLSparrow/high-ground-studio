# Capture Build 6 qualified-candidate checkpoint

**Date:** 2026-07-28  
**Status:** deterministic UI qualification and signed-artifact verification
complete; upload, Apple processing, tester assignment, and physical TestFlight
operation remain open

> Delivery status advanced later on 2026-07-28. Keep this file as the canonical
> pre-upload qualification record and use
> [`2026-07-28-capture-build-6-testflight-delivery.md`](./2026-07-28-capture-build-6-testflight-delivery.md)
> for upload, processing, internal-group, and tester readback.

## Decision

Quipsly Capture `1.0 (6)` is now a complete local upload candidate from exact
committed source:

`f10ceab5e83ce08e61092d3cf6a8e8ec2f457589`

This checkpoint supersedes the archive-only Build 6 receipts for release
selection. It does not supersede their historical product evidence.

The release pipeline now gives its terms precise meanings:

- `candidate` runs the complete deterministic iPhone and Share Capture UI
  suite, then archives, exports, and verifies the same detached commit;
- `release` is an archive-only diagnostic and cannot be treated as a qualified
  candidate;
- `beta` reuses the complete `candidate` lane before any TestFlight upload.

The change is committed and pushed on
`codex/quipsly-product-20260724` as `f10ceab`.

## Exact evidence

Release run ID:

`20260728T213508Z-94009`

Artifacts:

- archive:
  `/tmp/quipsly-capture-release/f10ceab5e83c/20260728T213508Z-94009/QuipslyCapture-1.0.6.xcarchive`;
- IPA:
  `/tmp/quipsly-capture-release/f10ceab5e83c/20260728T213508Z-94009/QuipslyCapture-1.0.6.ipa`;
- release receipt:
  `/tmp/quipsly-capture-release/f10ceab5e83c/20260728T213508Z-94009/QuipslyCapture-1.0.6-release-receipt.json`;
- deterministic UI result:
  `/tmp/quipsly-capture-ui-tests/f10ceab5e83c/20260728T213508Z-94009/HighGroundCapture.xcresult`.

Independent readback proves:

- IPA bytes: `18,555,196`;
- IPA SHA-256:
  `080f8b9fa700a3270683a347419c0695cc9694e03b33b3c4cc34bef6b52c6c5a`;
- receipt source:
  `f10ceab5e83ce08e61092d3cf6a8e8ec2f457589`;
- receipt isolation: `detached-worktree`;
- `candidateQualified: true`;
- `deterministicUITestPerformed: true`;
- 32 tests passed, zero failed, zero skipped, and zero expected failures on
  iPhone 17 Pro Simulator 26.3.1;
- the receipt hash matches a fresh `shasum -a 256` of the IPA.

The receipt deliberately records:

- `uploadAttempted: false`;
- `uploadPerformed: false`;
- `uploadOutcome: not-attempted`;
- `buildProcessingWaitReturned: false`;
- `testerAssignmentPerformed: false`;
- `physicalTestFlightInstallReadbackPerformed: false`.

## UI qualification

The serial suite operated the real app and Share Capture extension across:

- explicit consent and audio/video permission separation;
- recording, new-session, and source-selection boundaries;
- accessibility at the primary recording and login surfaces;
- account creation, recovery, deletion explanation, and verified-account
  posting locks;
- Home Nest, session, and project targeting;
- canonical tags, notes, Tasks, Goals, due dates, recurrence, and reminders;
- Today provenance, progress, recurrence, and external-action truth;
- transcript and AI proposal truth boundaries;
- Safari selected-passage provenance;
- protected outbox recovery across relaunch and owner switching.

Xcode printed a post-success diagnostics warning because the system-wide
developer directory still points to Command Line Tools. The test operation
itself returned `Test Succeeded`, the result bundle is readable through full
Xcode, and its independent summary reports all 32 tests passed. Set the
system-wide developer directory before the physical-device lane:

```bash
sudo xcode-select --switch /Applications/Xcode.app/Contents/Developer
xcrun --find simctl
```

## Signed artifact qualification

The archive and IPA independently passed:

- app and Share Capture extension version `1.0 (6)`;
- Apple Distribution signing for team `585GUXMY5M`;
- strict nested signature verification;
- App Store provisioning profiles for both targets;
- distribution-safe entitlements;
- packaged and valid privacy manifest;
- bounded microphone and dependency-required camera descriptions;
- audio background mode;
- `ITSAppUsesNonExemptEncryption = false`.

The current App Store static contract also passes 701/701 checks. The
committed-source isolation regression proves an uncommitted caller-worktree
sentinel cannot enter the candidate and confirms cleanup of the disposable
worktree.

## Production compatibility

Production Nest is currently deployed from the independently qualified web
release source `9d3faeccf1f469decaaddbcf3d3e9eabfe3cebde`, revision
`studio-00414-tut`, runtime digest
`sha256:60a1814125d5b08ce0f659db7edcb09d65e70a63fa5c6c8e27d4610c3a6a1a41`.
Its post-promotion gate passed all 104 mobile Capture contracts. A fresh
unauthenticated production contract run on 2026-07-28 again passed all 104
checks; authenticated lifecycle proof remains a separate gate.

## Current external gates

Read-only checks after candidate qualification show:

1. the selected Google account remains
   `charlie@highgroundodyssey.com`, but user credentials, ADC, deploy-project
   access, Firebase-project access, and Firebase Admin token minting require
   interactive reauthentication;
2. App Store Connect is signed out and no external API-key JSON is configured;
3. CoreDevice still sees only unavailable iPads `Layla` and `Morbo`, not the
   iPhone;
4. native QuipslyStudio has a configured email but no saved or verified
   Firebase session;
5. GitHub CLI is signed out, although the exact branch and candidate commit
   were successfully pushed through the repository HTTPS credential.

Google recovery:

```bash
gcloud auth login --update-adc --brief
gcloud auth application-default set-quota-project quipsly-reef
bash scripts/release/quipsly-gcloud-auth-check.sh
```

The App Store Connect API key must remain outside the repository and be exposed
only as `APP_STORE_CONNECT_API_KEY_PATH`. Do not guess answers to Apple legal,
encryption, or export-compliance questions; obtain explicit account-holder
approval and read back the exact processed build.

## Next authorized sequence

1. Complete Google, native Firebase, and App Store Connect authentication.
2. Read back App Store Connect and confirm Build 6 is still unused.
3. Upload the exact qualified candidate through the isolated `beta` lane.
4. Wait for and read back processing; resolve warnings against the exact build.
5. Assign Build 6 to the intended internal TestFlight group.
6. Install from TestFlight on the physical iPhone.
7. Operate recording, note, Task, Goal, tag, due date, recurrence, reminder,
   Share Sheet, genuine offline/relaunch recovery, upload, transcript packet,
   playback, and same-ID Nest readback.
8. Capture and approve final screenshots, reconcile privacy labels and review
   notes, then submit only after the remaining production and physical gates
   pass.

Build 6 is a qualified signed candidate. It is not yet an uploaded or
distributed beta and is not an App Store submission.
