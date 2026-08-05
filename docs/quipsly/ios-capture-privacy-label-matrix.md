# Quipsly iOS Capture privacy label and reviewer matrix

Date: 2026-08-05
Status: Build 28 signed-archive aggregate verified; App Store Connect publication still requires Account Holder review
Target app: `apps/mobile-capture/HighGroundCapture`

## Purpose

This matrix keeps Quipsly Capture honest for App Store review and for people
using the product. Quipsly records coaching calls, podcast sessions, interviews,
and field notes only after explicit consent. Those sources can become
transcripts, notes, action items, packets, and publishing assets.

This is not legal advice. The Account Holder must review the final answers
against production behavior, vendors, retention policy, and account deletion
before publishing them in App Store Connect.

## Public routes and provider state

- Privacy policy: `https://quipsly.com/privacy`
- Privacy choices and account deletion:
  `https://quipsly.com/privacy/account-deletion`
- Mobile readiness: `GET https://nest.quipsly.com/api/mobile/capture/readiness`

Both public policy routes and the readiness endpoint are reachable. Build 28 is
valid, in external beta testing, included in the enabled public-link group, and
assigned to iOS App Version 1.0. The redacted provider and signed-archive
receipts stay outside Git with retained QA artifacts.

## Signed archive aggregate

The app-owned `PrivacyInfo.xcprivacy` is necessary but is not the complete App
Store label. Apple requires the answers to include integrated third-party
partners. The exact signed and uploaded Build 28 archive contains 14 privacy
manifests. Google Sign-In 9.1.0 contributes phone number, coarse location, other
data, other usage data, and analytics purposes that the earlier source-only
matrix omitted.

The canonical engineering recommendation is
`release/app-store/quipsly-capture/privacy-questionnaire.json`. Its exact
manifest-set hash is
`ee7e45d0a664095c7b02ce8b1e9d5ecd038c9191d673140733335aca3707af0b`.
Run both boundaries before every App Store candidate:

```bash
pnpm quipsly:capture:privacy -- --strict
pnpm quipsly:capture:privacy -- --strict --archive <QuipslyCapture.xcarchive>
```

The source check verifies the app manifest, reviewed SDK data-type contract,
and exact Swift package pins. The archive check aggregates every bundled
manifest and compares types, purposes, linkage, tracking, domains, count, and
hash. This is engineering readback, not provider publication.

## Recommended App Store Connect answers for Build 28

| App Store category / type | Purposes | Linked to user? | Tracking? | Evidence |
| --- | --- | --- | --- | --- |
| Contact Info / Name | App Functionality | Yes | No | Quipsly app and Google Sign-In manifests |
| Contact Info / Email Address | App Functionality | Yes | No | Quipsly app and Google Sign-In manifests |
| Contact Info / Phone Number | App Functionality | Yes | No | Google Sign-In manifest |
| Location / Coarse Location | App Functionality | Yes | No | Google Sign-In manifest; Quipsly does not link CoreLocation |
| Identifiers / User ID | App Functionality, Analytics | Yes | No | Quipsly app and Google Sign-In manifests |
| Identifiers / Device ID | App Functionality, Analytics | Yes | No | Quipsly app and Google Sign-In manifests |
| User Content / Audio Data | App Functionality | Yes | No | Quipsly app manifest and retained recordings |
| User Content / Photos or Videos | App Functionality | Yes | No | Quipsly app manifest and retained camera sources |
| User Content / Other User Content | App Functionality | Yes | No | Notes, transcripts, tasks, manifests, corrections, and session work |
| Other Data / Other Data Types | App Functionality, Analytics | Yes | No | Google Sign-In manifest |
| Usage Data / Other Usage Data | Analytics | Yes | No | Google Sign-In manifest |

No current bundled manifest declares tracking or a tracking domain. LiveKit's
bundled manifests declare required-reason APIs but no retained collected-data
type. Quipsly-retained room audio/video remains disclosed as Audio Data and
Photos or Videos regardless of the transport provider.

The current iPhone target does not link an advertising SDK, advertising
identifier, Stripe SDK, StoreKit purchase flow, or CoreLocation. The redacted
support snapshot is shown to the user and opens the iOS share sheet; Quipsly
does not automatically transmit it. Apple's guidance permits generic free-form
text and voice to be represented as Other User Content and Audio Data rather
than every possible sensitive topic someone may enter.

App Store privacy answers apply at the app level across platforms. Quipsly is
not releasing a macOS or visionOS binary under this app record; if either is
enabled later, its complete signed-bundle aggregate must be reviewed before the
shared answers are changed.

## Recording disclosure requirements

- Recording never starts secretly.
- Audio recording, video recording, and transcription are separate explicit
  choices. Declining transcription must not block a consented local take.
- Consent can be granted, declined, or revoked, and the policy version and copy
  presented are bound into receipt evidence.
- Everyone who may be heard or seen must be informed and agree before capture.
- Recording state remains visible while active.
- Local capture may continue only while consent remains valid.
- Provider-room transport, provider recording, and local recording are
  separate paths.
- Transcription starts only after exact upload verification and current
  transcription authorization.

## Account deletion posture

The app has an easy-to-find in-app request, visible status, a disclosed 30-day
target, and the public explanation route. Account deletion is distinct from
deleting one local original.

The dedicated worker inventories the account, refuses shared or
retention-ambiguous records, deactivates access before destructive work,
deletes eligible private database/GCS/Firebase identity data, sends completion
confirmation, and retains a sanitized durable receipt. It is disabled by
default outside the controlled worker and supports idempotent recovery. The
local disposable end-to-end proof passes; one controlled disposable production
execution, independent completion readback, and Account Holder retention review
remain required.

## Reviewer account requirements

The reviewer account needs working sign-in, at least one planned session, local
fallback, consent not granted by default, visible grant/decline/revoke controls,
and the reachable account-deletion request.

Reviewer flow:

1. Sign in with the supplied test account.
2. Open the supplied capture session.
3. Observe provider readiness and local fallback.
4. Review the consent sheet and choose audio/video/transcription independently.
5. Confirm everyone who may be captured was informed and agreed.
6. Record and stop a short disposable source.
7. Observe local preservation and upload/recovery state.
8. Open Account and confirm privacy and account-deletion controls.

## Current gaps before App Store submission

- Physical-iPhone Build 28 TestFlight validation of microphone fidelity,
  wired/USB/Bluetooth routes, lock/background, interruption, route loss, force
  quit, reboot, background upload recovery, solo video, podcast-camera video,
  camera switching, assembled playback, and cross-device readback.
- Real Nest-issued LiveKit/CallKit room operation and provider reconciliation on
  device.
- One disposable production account deletion through completion with sanitized
  receipt and independent identity/storage readback.
- Account Holder review and publication of this 11-type App Privacy
  questionnaire, followed by provider readback.
- DSA trader verification and Apple Silicon Mac / Vision availability opt-out.
- Five approved screenshots recaptured from the exact signed/TestFlight
  candidate. The five clean DEBUG layouts are composition evidence only.

## Product principle

Quipsly should reduce systems anxiety by making every sensitive state visible:
signed in, session selected, consent, recording, upload, verification,
transcript, sharing, and deletion.
