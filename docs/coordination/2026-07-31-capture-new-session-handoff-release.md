# Capture new-session handoff release

Checkpoint: 2026-07-31 MDT

## Product outcome

Creating a Session from either iPhone entry point now lands the user directly
on that Session's recorder. The root **New session** action closes its sheet and
selects **Record**. The recorder's Session chooser closes both the nested
creation sheet and the chooser. Neither path grants consent, starts a call, or
starts recording.

This fixes a shipping-shell defect found by operating the complete release
qualification lane: the Session was created and selected successfully, but the
Session chooser remained over the recorder. The app therefore appeared not to
have completed the action even though canonical state had changed.

The Episode manuscript test also now scrolls its existing read-only action
into view before asserting that the action is reachable. That was a test
interaction defect, not a product workaround.

## Release boundary proved before the native fix

The matching Nest backend and database contract were released from exact
source `12c97cbdfe8bfd19b74c557f7fba04dd935f5a23`:

- guarded schema release: passed
- on-demand Cloud SQL backup: `1785529000879`, read back `SUCCESSFUL`
- applied migration: `20260731120000_add_session_outputs_and_delivery_events`
- production schema drift: zero
- Cloud Build: `e3c6a97f-33b9-4423-a337-b43753b19556`, `SUCCESS`
- Cloud Run revision: `studio-00472-wey`
- immutable image digest:
  `sha256:8d757ae0f6259ba39cbe5adfcde92d475b11f96316d9bbbfb711e60e0b3374c4`
- zero-traffic authenticated acceptance: passed
- production promotion and post-promotion Capture contract: passed

The production smoke operated a real database-backed Capture Session and the
Nest, Projects, account-switching, writing, editor, recorder, research, and
publishing surfaces before traffic promotion.

## Native qualification evidence

The first exact-source candidate run completed 47 deterministic iPhone UI
tests before Xcode stalled while finalizing the failed result bundle:

- 45 passed
- 2 failed
- retained log:
  `/tmp/quipsly-capture-ui-tests/12c97cbdfe8b/20260731T203959Z-8184/HighGroundCapture-HighGroundCapture.log`
- retained partial result:
  `/tmp/quipsly-capture-ui-tests/12c97cbdfe8b/20260731T203959Z-8184/HighGroundCapture.xcresult`

After the two corrections, the focused simulator lane passed:

- 2 passed, 0 failed, 0 skipped
- duration: 36.684 seconds
- result bundle:
  `/Users/wall-e/Library/Developer/Xcode/DerivedData/HighGroundCapture-goskcwsbyzmhdubmpimixlrsbcye/Logs/Test/Test-HighGroundCapture-2026.07.31_15-13-20--0600.xcresult`
- App Store static contract: passed
- reviewer runway static contract: passed
- patch hygiene: passed

The corrections were committed and pushed as exact source
`34f9e0543c3c7863758f3c9e26ac976ba3b4205c`. A fresh detached-worktree
candidate then passed:

- complete deterministic iPhone UI lane: 47 passed, 0 failed, 0 skipped
- signed archive: succeeded
- App Store export: succeeded
- strict app and Share Extension signature inspection: passed
- App Store provisioning and distribution-safe entitlement inspection: passed
- version/build: Quipsly Capture 1.0 (22)
- IPA bytes: `21,287,411`
- IPA SHA-256:
  `8cf90821866ee2a5ca6bf2e6f945b2283c66291727225a7254fc4847d1b70f6d`
- receipt: `candidateQualified: true`, `uploadAttempted: false`,
  `uploadPerformed: false`
- durable evidence:
  `/Volumes/My Passport/Quipsly Release Evidence/2026-07-31-build22-34f9e054-qualified`

The copied IPA hash matches the qualified receipt. Independent result-bundle
readback reports `Passed`, 47 tests, zero failures, and zero skips. No IPA from
either candidate attempt has been uploaded yet.

## Retained QA and cleanup policy

Useful synthetic Sessions, projects, notes, tasks, goals, tags, recordings,
transcripts, uploads, and delivery receipts may remain as longitudinal QA data
when they follow `docs/runbooks/quipsly-retained-dogfood.md`. Retained artifacts
must use the QA identity and the `QA Retained ·` naming convention. This does
not authorize invitations, notifications, publication, charges, destructive
account tests, or external calendar mutations under a real collaborator's
identity.

During qualification, the startup disk reached 116 MiB free. Only explicitly
identified disposable exact-build contexts and one abandoned targeted
DerivedData directory were deleted. Source, archives, result evidence, and
retained product QA data were preserved. APFS readback afterward reported
7.7 GiB free.

## Open acceptance gates

- App Store Connect upload/readback for the corrected build
- physical iPhone TestFlight install
- physical audio/video capture, interruption recovery, upload, playback, and
  same-ID Nest/Studio readback

Simulator and cloud evidence must not be reported as physical-device proof.
