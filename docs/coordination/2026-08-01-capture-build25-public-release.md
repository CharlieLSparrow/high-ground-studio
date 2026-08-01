# Quipsly Capture Build 25 public release

Date: 2026-08-01

## Outcome

Quipsly Capture 1.0 (25) is the canonical public TestFlight target. Apple has
processed and approved the exact build, the existing public rehearsal group
contains it, and the anonymous installation page is open. This checkpoint does
not claim that Build 25 has been installed or operated on a physical iPhone.

## Exact identity

- Source: `4ef8ddbacbba7949b16607d8dae5454ff28e9082`
- App Store Connect build: `bacb25d1-1e0a-40aa-90a3-3e7cd195ee33`
- Version/build: `1.0 (25)`
- Bundle: `com.highgroundodyssey.HighGroundCapture`
- Upload-bound IPA: 21,447,970 bytes
- IPA SHA-256:
  `ffc296f70a5afbd78b834908eed1d29e4f8d3e750c0e87fa917792c48d082071`
- External group: **Quipsly Capture Rehearsal**
- Distribution: public-link-only, limit 100
- Public link: `https://testflight.apple.com/join/XwRRcYUm`

## Qualification evidence

The exact pushed source passed the detached-source preflight after three stale
release proofs were repaired against the current shipping UI. The repairs also
closed two product-truth gaps: the Session panel now says whether this binary
contains the LiveKit runtime, and Studio handoff now says that attaching
prepares immutable source for review without publishing, trimming, or deleting
the recording.

Two independent release runs each passed all 47 serialized iPhone and Share
Extension journeys with zero failures. They cover navigation, authentication,
Google-first sign-in handoff, account recovery, consent, audio/video modes,
pause/relaunch behavior, camera controls, manuscript, Episode Room, shared
Watch, canonical tags, private Inbox, Today, projects, notes, tasks, goals,
reminders, recurrence, transcript evidence, source upload, Studio handoff, and
Share Extension owner/provenance boundaries.

- Candidate Xcode result:
  `/Volumes/My Passport/Quipsly QA Artifacts/Capture UI Tests/4ef8ddbacbba/20260801T063222Z-32240/HighGroundCapture.xcresult`
- Upload-lane Xcode result:
  `/Volumes/My Passport/Quipsly QA Artifacts/Capture UI Tests/4ef8ddbacbba/20260801T070154Z-38454/HighGroundCapture.xcresult`
- Upload receipt:
  `/Volumes/My Passport/Quipsly QA Artifacts/Capture Releases/4ef8ddbacbba/20260801T070154Z-38454/QuipslyCapture-1.0.25-release-receipt.json`

The upload-bound archive and IPA passed strict nested signature inspection for
the app and Share Extension, matching 1.0 (25) metadata, Apple Distribution
signing for team `585GUXMY5M`, App Store provisioning profiles,
distribution-safe entitlements, the privacy manifest, bounded camera and
microphone disclosures, export-compliance metadata, and the declared audio and
CallKit provider-room background modes.

## Provider proof

The upload returned successfully, Apple completed processing, and the build is
`VALID`. The first immediate internal-group readback correctly failed because
Apple had not yet exposed the group/build relationship reported by the upload
client. No release claim was made from that transient state.

The idempotent external operation then updated Build 25's test notes, enabled
automatic notification, assigned the build to the already-enabled public-link
group, and submitted beta review. Its provider receipt passed with external
state `IN_BETA_TESTING` and review state `APPROVED`.

A separate read-only API call proved the exact app, bundle, version, build ID,
`VALID` processing state, `IN_BETA_TESTING` external state, no non-exempt
encryption, external-group kind, exact build/group relationship, enabled
100-person public link, and tester/group aggregate boundaries. An anonymous
HTTP request returned 200 and Apple's page title **Join the Quipsly Capture
beta - TestFlight - Apple**.

- External apply receipt:
  `/Volumes/My Passport/Quipsly QA Artifacts/Capture Releases/4ef8ddbacbba/20260801T070154Z-38454/build-25-external-apply.json`
- Independent external readback:
  `/Volumes/My Passport/Quipsly QA Artifacts/Capture Releases/4ef8ddbacbba/20260801T070154Z-38454/build-25-external-readback.json`
- Anonymous public-link readback:
  `/Volumes/My Passport/Quipsly QA Artifacts/Capture Releases/4ef8ddbacbba/20260801T070154Z-38454/build-25-public-link-readback.json`

Build 25 is therefore the canonical public target. Build 24 remains provider
history and a rollback reference, not the current handoff.

## Retained dogfood policy

Durable private QA data is authorized for longitudinal testing. Use clearly
labeled synthetic users, Nests, projects, tags, notes, tasks, goals, sessions,
recordings, uploads, transcripts, timelines, and editor artifacts. Keep them
private and provenance-bearing; never substitute another person's consent,
place secrets in fixtures, publish externally, or describe simulated/media
fixture evidence as a physical-device result.

## Still open

- Install Build 25 from TestFlight on an enumerated physical iPhone and read
  back the installed app's version/build.
- Sign in through Scott's real Google flow and prove the existing Quipsly
  identity attaches without creating a duplicate user.
- Record consented real audio and video; pause/resume; switch cameras; survive
  interruption, backgrounding, process death, and relaunch; play the preserved
  local original.
- Verify protected upload and same-ID Nest receipt, then inspect the exact
  immutable sources and honest alignment state in Studio/editor playback.
- Run the Charlie-and-Scott two-participant call plus shared Watch rehearsal.

Physical proof remains parked until the iPhone enumerates through CoreDevice;
iPhone Mirroring or network reachability alone is not that boundary.
