# Quipsly Capture Build 9 Qualified Candidate

Date: 2026-07-29

## Release identity

- Product: **Quipsly Capture**
- Version/build: `1.0 (9)`
- Exact committed source:
  `b44e2a90968a7cccc6a3bae137fc97039050cc4b`
- Branch: `codex/quipsly-product-20260724`
- Source isolation: disposable detached worktree
- Release run: `20260729T143359Z-13507`

The candidate was produced from the exact committed source rather than the
maintainer checkout. The release receipt records
`candidateQualified: true` and `deterministicUITestPerformed: true`.

## Qualification evidence

- Full Capture preflight: passed.
- Strict TypeScript 7 checks: passed.
- Universal LiveKit-linked iOS simulator build: passed for arm64 and x86_64.
- Deterministic native UI suite: **36/36 passed**, 0 failures.
- Static App Store contract: **729/729 passed**.
- Source-evidence contract: **23/23 passed**.
- Coordinated podcast-capture contract: **23/23 passed**.
- Signed archive:
  `/private/tmp/quipsly-capture-release/b44e2a90968a/20260729T143359Z-13507/QuipslyCapture-1.0.9.xcarchive`
- Signed IPA:
  `/private/tmp/quipsly-capture-release/b44e2a90968a/20260729T143359Z-13507/QuipslyCapture-1.0.9.ipa`
- IPA size: `20,023,041` bytes.
- IPA SHA-256:
  `365fd2e8d90d3b1558fbfd7212d8d9459d2ddeeac7557407a56e898254ff972c`.
- UI result bundle:
  `/tmp/quipsly-capture-ui-tests/b44e2a90968a/20260729T143359Z-13507/HighGroundCapture.xcresult`
- Release receipt:
  `/private/tmp/quipsly-capture-release/b44e2a90968a/20260729T143359Z-13507/QuipslyCapture-1.0.9-release-receipt.json`

The archive uses Apple Distribution signing for team `585GUXMY5M`, contains
App Store profiles for the app and share extension, keeps both targets at
version `1.0 (9)`, and passes nested signing, entitlement, privacy-manifest,
camera/microphone purpose-string, background-mode, and export-compliance
inspection.

## Delivery truth

This is a qualified signed candidate, not TestFlight or physical-device proof.
The receipt intentionally records:

- `uploadAttempted: false`
- `uploadPerformed: false`
- `testerAssignmentPerformed: false`
- `physicalTestFlightInstallReadbackPerformed: false`

The App Store Connect API key used for the earlier Build 8 delivery was
ephemeral and is no longer present. A fresh App Store Connect login and
Team Admin API key are required before Build 9 can be uploaded and its
processing, group assignment, tester notification, and install state can be
read back. Build 8 therefore remains the current external-beta submission
until Apple and the release receipt prove otherwise.

## Remaining acceptance

After upload, keep each boundary distinct:

1. uploader return;
2. App Store Connect processing completion;
3. external-group assignment and beta-review state;
4. tester notification;
5. TestFlight installation and app-owned `1.0 (9)` readback;
6. real iPhone audio/video, camera flip, interruption, upload, relaunch, Watch,
   assembled playback, and source-evidence comparison.

No simulator, archive, upload, or provider row replaces the physical iPhone
gate.
