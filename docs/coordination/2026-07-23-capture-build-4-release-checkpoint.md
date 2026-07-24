# Capture build 4 release checkpoint

**Date:** 2026-07-23

**Status:** Apple processing complete; export compliance, production API
promotion, and physical-iPhone proof remain open

## What changed

Quipsly Capture `1.0 (4)` adds an honest, durable account-deletion operating
loop to the Build 3 personal-work candidate:

- Account automatically loads the signed-in user's latest deletion request.
- The app shows the current state, request date, 30-day target, policy version,
  next action, and completion date when available.
- A repeated request is idempotent and returns the existing active request.
- The public account-deletion page explains the same target and confirmation
  contract.
- Preview mode still refuses to claim that it submitted or refreshed account
  state.

This closes the in-app request and progress UX gap. It does not claim that
Quipsly has a production-safe destructive/anonymizing executor or completion
email yet.

## Exact candidate

The candidate was generated from clean Capture source revision
`6fd915e74bae6c126b656058e6e721ec8b453841`:

- archive:
  `/tmp/quipsly-capture-release/6fd915e74bae/QuipslyCapture-1.0.4.xcarchive`;
- IPA:
  `/tmp/quipsly-capture-release/6fd915e74bae/QuipslyCapture-1.0.4.ipa`;
- receipt:
  `/tmp/quipsly-capture-release/6fd915e74bae/QuipslyCapture-1.0.4-release-receipt.json`;
- IPA bytes: `17,609,909`;
- IPA SHA-256:
  `45955730f76dcca7285b8fc374d4c84a082cb625c8daa0347e678ffea4ca17e2`.

The artifact verifier proved:

- Apple Distribution signing for team `585GUXMY5M`;
- App Store profiles for the app and Share Capture extension;
- `get-task-allow = false` and `beta-reports-active = true`;
- strict nested signatures;
- matching app/extension version `1.0 (4)`;
- packaged privacy manifest, bounded microphone/camera purposes, and background
  audio.

## Operating-loop and test proof

The account-deletion flow was exercised against real local services, not only
mocked:

- a verified Firebase emulator identity authenticated to local Nest;
- local Nest and PostgreSQL created the request;
- exact replay returned the same request;
- authenticated GET returned current state and target;
- operator transitions through `REVIEWING` and `COMPLETED` were returned to the
  same signed-in user;
- the integration test cleaned up all created state.

The release slice also passed:

- 112 Quipsly Jest suites: 540 passed, 56 intentionally skipped, 0 failed;
- Quipsly production build: 149 pages;
- 628/628 Capture App Store static assertions;
- focused native account-deletion journey;
- complete serial native suite on iPhone 17 Pro Simulator, iOS 26.3.1:
  26 passed, 0 failed, 0 skipped.

The full native result bundle is:

`/tmp/quipsly-account-deletion-full-ui.xcresult`

## Apple delivery truth

The signed-in Xcode account uploaded the verified archive directly with
`xcodebuild -exportArchive` and `destination=upload`. Apple reported:

- `Uploaded package is processing`;
- `Upload succeeded`;
- `Uploaded HighGroundCapture`;
- `EXPORT SUCCEEDED`.

App Store Connect was then read back directly. Its TestFlight page shows:

- Build Upload `1.0 (4)`: `Complete`;
- created `Jul 23, 2026 9:24 PM`;
- Build 4 present in the TestFlight build list;
- current build status: `Missing Compliance`.

This proves upload processing completed. It does not prove export-compliance
clearance, tester availability, TestFlight installation, or App Review
submission.

LiveKit's binary WebRTC and Rust frameworks do not include every matching dSYM,
so Apple emitted third-party symbol-upload warnings. LiveKit documents that the
WebRTC warning does not block App Store submission or review. App-owned dSYMs
are present; crashes inside those vendor binaries may have incomplete
symbolication.

## Nest compatibility gate

Build 4 defaults to `https://nest.quipsly.com`. Production traffic still points
to older known-good revision `studio-00331-kll`. The currently tagged preview is
also older than Build 4:

- source `a4d13a3538839794c5724b17f0476d3aab77e510`;
- revision `studio-00398-cuz`;
- tag URL
  `https://quipsly-preview---studio-hm2odnvjga-uc.a.run.app`;
- 0% production traffic.

Do not distribute Build 4 as a working account-deletion or Home Nest candidate
until the matching committed server source is deployed to preview, its signed
contracts pass there, and production promotion is explicitly approved and read
back.

## Open release gates

1. The account holder must answer Build 4 export compliance in App Store
   Connect. The binary links LiveKit/WebRTC and uses transport security and
   integrity hashing; no legal encryption attestation was guessed.
2. Deploy exact committed server source to the isolated preview and repeat
   authenticated account-deletion plus Home Nest Note/Task/Goal/tag readback.
3. Approve production promotion, then prove production traffic, source
   metadata, auth, and the mobile contracts against `https://nest.quipsly.com`.
4. Make the unlocked, trusted iPhone visible to CoreDevice, install Build 4
   from TestFlight, and repeat permission, recording, offline/relaunch,
   reminder, upload, account status, and Nest readback drills.
5. Implement and review the production deletion executor: deactivate identity,
   delete or anonymize eligible data, preserve required legal/security
   receipts, send completion confirmation, and prove failure recovery.
6. Have the account holder approve the 30-day target and the data-specific
   retention/legal matrix.
7. Complete App Store metadata, screenshots, privacy labels, support/privacy
   URLs, age rating, and final review notes.

Build 4 is processed by Apple and is the current candidate. It is not yet
available for a trustworthy end-to-end TestFlight drill and is not approved for
App Review submission.
