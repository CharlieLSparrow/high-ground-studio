# Capture Build 11 qualified-candidate checkpoint

**Date:** 2026-07-29  
**Status:** deterministic UI qualification and signed-artifact verification
complete; matching Nest deployment, upload, Apple processing, tester
distribution, and physical TestFlight operation remain open

## Decision

Quipsly Capture `1.0 (11)` is a complete local upload candidate from exact
committed source:

`563a85505779a92303227dcdddb5cae445ee61fc`

Build 11 carries the canonical project-creation client and UX. It must not be
uploaded until the matching Nest implementation from the same source has been
deployed through a zero-traffic preview, passed authenticated browser-to-native
acceptance, and been promoted with immutable source and image readback.

The currently live TestFlight fallback remains Build 8 through the public
rehearsal link. Build 10 is valid at Apple but was still missing its
`buildBetaDetail` relationship at the last provider readback, so no group or
tester mutation was attempted for it.

The change is committed and pushed on
`codex/quipsly-product-20260724` as `563a8550`.

## Exact evidence

Release run ID:

`build11-canonical-projects-20260729`

Artifacts:

- archive:
  `/tmp/quipsly-capture-release/563a85505779/build11-canonical-projects-20260729/QuipslyCapture-1.0.11.xcarchive`;
- IPA:
  `/tmp/quipsly-capture-release/563a85505779/build11-canonical-projects-20260729/QuipslyCapture-1.0.11.ipa`;
- release receipt:
  `/tmp/quipsly-capture-release/563a85505779/build11-canonical-projects-20260729/QuipslyCapture-1.0.11-release-receipt.json`;
- deterministic UI result:
  `/tmp/quipsly-capture-ui-tests/563a85505779/build11-canonical-projects-20260729/HighGroundCapture.xcresult`.

Independent readback proves:

- IPA bytes: `20,171,107`;
- IPA SHA-256:
  `4604ab58e1216c29b1828ce539e78042959c06df7e682165d54fbc37091716e6`;
- receipt source:
  `563a85505779a92303227dcdddb5cae445ee61fc`;
- receipt isolation: `detached-worktree`;
- `candidateQualified: true`;
- `deterministicUITestPerformed: true`;
- 36 tests passed, zero failed, zero skipped, and zero expected failures on
  iPhone 17 Pro Simulator 26.3.1;
- the receipt hash matches a fresh `shasum -a 256` of the IPA.

The complete isolated Capture preflight was also recreated from the same
committed SHA with the locked pnpm graph. It passed TypeScript compilation,
mobile/Nest static and ingestion contracts, App Store static checks, durability,
account isolation, coordinated podcast capture, manuscript, rehearsal, Watch,
provider-room, and LiveKit-linked simulator build gates. Evidence log:

`/var/folders/n8/75lt2yw16752qxw_l6j0khl00000gn/T/quipsly-build11-preflight-20260729T134700.log`

The receipt deliberately records:

- `uploadAttempted: false`;
- `uploadPerformed: false`;
- `uploadOutcome: not-attempted`;
- `buildProcessingWaitReturned: false`;
- `testerAssignmentPerformed: false`;
- `physicalTestFlightInstallReadbackPerformed: false`.

## Product qualification

The complete serial UI suite operated the real app and Share Capture extension
across:

- explicit recording consent and independent audio/video authorization;
- camera-source selection and local video-mode truth;
- episode manuscript, session plan, Watch staging, and source evidence;
- rehearsal readiness, new-session behavior, recording, and account controls;
- Google-first sign-in, password fallback, recovery, and account creation;
- canonical private Home Nest, session, and project targeting;
- creation and use of projects, notes, Tasks, Goals, tags, due dates,
  recurrence, and reminders;
- Today provenance, progress, and external-action truth boundaries;
- transcript and AI proposal truth boundaries;
- accessibility on the primary recorder and login surfaces;
- Safari selected-passage provenance;
- protected source-outbox recovery across relaunch and owner switching.

The new project workflow is backed by the canonical Nest creation kernel. It
uses a client-generated UUID for exact-payload retry, creates a private
project/document/starter-block workspace and owner grant in one serializable
transaction, generates collision-safe slugs, and does not reopen or transfer
an existing project based on a human-readable slug.

## Signed artifact qualification

The archive and IPA independently passed:

- app and Share Capture extension version `1.0 (11)`;
- Apple Distribution signing for team `585GUXMY5M`;
- strict nested signature verification;
- App Store provisioning profiles for both targets;
- distribution-safe TestFlight entitlements;
- packaged and valid privacy manifest;
- bounded microphone and camera usage descriptions;
- audio background mode;
- CallKit provider-room background mode;
- `ITSAppUsesNonExemptEncryption = false`.

## Deployment and delivery gates

The matching Nest endpoint is committed but not yet deployed. Google Cloud user
and Application Default Credentials are awaiting completion of the interactive
reauthentication flow. After authentication:

1. set the ADC quota project to `quipsly-reef`;
2. pass the scoped Google Cloud/Firebase authorization check;
3. run the deploy-specific committed production preflight at `563a8550`;
4. deploy a zero-traffic Cloud Run preview;
5. prove authenticated canonical project creation, idempotent retry, owner-only
   access, and browser-to-native readback;
6. verify immutable image and source provenance;
7. promote only that proven revision;
8. upload the exact qualified Build 11 IPA without rebuilding;
9. wait for Apple processing and read back the exact provider build;
10. attach the existing external rehearsal group without creating a duplicate;
11. install through TestFlight and operate the physical recording, video,
    project, note, Task, Goal, tag, upload, transcript, playback, and same-ID
    Nest checklist.

Build 11 is a qualified signed candidate. It is not yet a deployed,
TestFlight-distributed, physically operated, or App Store-submitted release.
