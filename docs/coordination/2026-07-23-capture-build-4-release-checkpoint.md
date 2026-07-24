# Capture build 4 release checkpoint

**Date:** 2026-07-23

**Status:** Apple processing and matching preview proof complete; export
compliance, production API promotion, and physical-iPhone proof remain open

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

The committed preview was then exercised with a disposable verified Firebase
identity against production Firebase and Cloud SQL:

- unverified email was denied before app-owned state was created;
- verified session exchange created the free tier and canonical Home Nest;
- `/api/mac/session-check` and `/api/mac/mobile-context` returned the same Home
  Nest and project truth;
- a canonically tagged Home Nest Note was created and exactly replayed;
- a Task was created with due date, reminder intent, and the same tag, without
  a provider calendar or device-notification claim;
- a Goal reused that canonical tag;
- account deletion was created, exactly replayed, and reopened;
- the generated deletion request, grants, Home Nest, membership, app user, and
  Firebase identity were all deleted after proof.

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
to older known-good revision `studio-00331-kll`. The matching server contract is
now validated on the isolated preview:

- source `21b746d3f70b9b909cd86082d7b7c87b5f23d27a`;
- revision `studio-00400-tep`;
- image digest
  `sha256:2d4703f30dfdccb82cb0158183c83a813535472ef29922568f3a8a62ef00523a`;
- tag URL
  `https://quipsly-preview---studio-hm2odnvjga-uc.a.run.app`;
- 0% production traffic.

Cloud Build `b8cdc87f-b63b-4008-b9c8-b158fabe78ba` completed successfully,
verified required route bundles, and Cloud Run reported the revision ready and
container healthy. The reusable signed journey is committed at `3d6d4dc`.

The two exact-SHA preview builds each took about eight minutes even though
their dependency manifests were unchanged. Audit found that `git archive`
assigned each context the source commit's timestamp, changing Kaniko `COPY`
cache keys. A remote repeat then proved that Cloud Build's source extraction
restamps the uploaded files again. A guarded normalizer now runs while
materializing the release context and again inside the worker before cache
evaluation; its regression test simulates that extraction drift and checks the
entire tree. Even with normalized inputs, Kaniko generated a third dependency
key for identical source. The pipeline now uses a digest-pinned Google Docker
builder plus version-pinned BuildKit and a separate registry cache exported in
`mode=max`. Preview builds also no longer mutate `studio:latest`.

The BuildKit proof is now complete:

- seed build `4f731c99-1ae0-44d0-b401-6caeefc7d2a9` succeeded in 6 minutes
  21 seconds of worker time and verified digest
  `sha256:1ef6e5d0e545a6e2fa7db5a7951e3116db690db3d69eeaacef41fc9f3e6a499f`;
- identical-context repeat `c02e02b1-a95f-4933-8f3d-b31cf583f5b7` succeeded in
  59.8 seconds of worker time and 120.0 seconds create-to-finish;
- the repeat reported `CACHED` for every Dockerfile layer, including
  `pnpm install` and the complete Next.js production build;
- both images independently passed digest readback and the six required route
  bundle checks;
- cross-commit build `e8078a2b-b911-4403-ac51-bf52cb042067`, from source
  `2d1c70f23fa0c3c4d5ee8ddb8e613ceebdb41e09`, reused every dependency layer
  through `pnpm install` while correctly rerunning `COPY . .` and the Next.js
  production build for the new source identity;
- that cross-commit build succeeded in 5 minutes 24 seconds of worker time and
  6 minutes 14 seconds create-to-finish, pushed digest
  `sha256:ac634454b1afef08b8a9128a69f1aebf761d648043b78724ab1c243aec3fc7a6`,
  and passed independent digest readback plus the six-route bundle check;
- production traffic remained 100% on `studio-00331-kll`, while validated
  preview `studio-00400-tep` remained a 0% tagged revision;
- legacy `studio:latest` still points to preview digest
  `sha256:2d4703f30dfdccb82cb0158183c83a813535472ef29922568f3a8a62ef00523a`
  and is no longer mutated by the preview-capable pipeline.

Do not distribute Build 4 as a working production account-deletion or Home Nest
candidate until production promotion is explicitly approved and its traffic,
source metadata, and signed contracts are read back.

## Physical-device boundary

The post-preview CoreDevice and USB inventories still contain no iPhone.
CoreDevice lists only two previously known, currently unavailable iPads
(`Layla` and `Morbo`), and macOS does not enumerate an Apple mobile device on
USB. No physical install, trust, permissions, recording, or TestFlight result
is claimed.

## Open release gates

1. The account holder must answer Build 4 export compliance in App Store
   Connect. The binary links LiveKit/WebRTC and uses transport security and
   integrity hashing; no legal encryption attestation was guessed.
2. Approve production promotion, then prove production traffic, source
   metadata, auth, and the mobile contracts against `https://nest.quipsly.com`.
3. Make the unlocked, trusted iPhone visible to CoreDevice, install Build 4
   from TestFlight, and repeat permission, recording, offline/relaunch,
   reminder, upload, account status, and Nest readback drills.
4. Implement and review the production deletion executor: deactivate identity,
   delete or anonymize eligible data, preserve required legal/security
   receipts, send completion confirmation, and prove failure recovery.
5. Have the account holder approve the 30-day target and the data-specific
   retention/legal matrix.
6. Complete App Store metadata, screenshots, privacy labels, support/privacy
   URLs, age rating, and final review notes.

Build 4 is processed by Apple and is the current candidate. It is not yet
available for a trustworthy production-backed end-to-end TestFlight drill and
is not approved for App Review submission.
