# Quipsly Capture Build 26 public TestFlight release

Date: 2026-08-02
Status: canonical internal and public-link TestFlight target; physical-iPhone operation remains unproved

## Outcome

Quipsly Capture 1.0 (26) is valid, approved, and in beta testing for both the
internal group and the existing public-link rehearsal group. Apple's anonymous
invitation page is open and exposes the exact TestFlight handoff. This is
provider delivery proof, not physical-iPhone installation or recording proof.

## Exact release identity

- source: `283d522058bb036d3d81ae966ebc8939af92e55d`
- version/build: `1.0 (26)`
- App Store Connect build:
  `0ef2cf7a-43d1-49bb-800f-c08239730b96`
- IPA bytes: `22,376,036`
- IPA SHA-256:
  `ffc30e329e4f872bc384f8f4d02ed88ee098bf8921cd4e1a9f1d1131766264f3`
- public link: `https://testflight.apple.com/join/XwRRcYUm`

## Qualification and upload

The detached-source candidate passed all 54 serialized iPhone and Share
Extension journeys. Signed archive and exported IPA inspection passed bundle
identity, nested signatures, App Store profiles, distribution entitlements,
privacy manifests, microphone/camera purpose strings, background modes,
encryption declaration, and matching app/extension versions.

The release pipeline then reverified the sealed receipt, IPA byte count and
SHA-256, UI result bundle, archive, IPA signatures, profiles, entitlements, and
packaged metadata without repeating the 54 journeys or rebuilding the same
artifact. The upload lane marked the receipt attempted immediately before the
provider call and would have required API readback instead of a blind retry if
the result were ambiguous.

The canonical release receipt is:

`/Volumes/My Passport/Quipsly QA Artifacts/Build 26/Releases/283d522058bb/20260802T120314Z-69176/QuipslyCapture-1.0.26-release-receipt.json`

It is mode 0600. It records successful upload, Apple processing, and internal
assignment readback while keeping
`physicalTestFlightInstallReadbackPerformed=false`.

## Provider readback

Independent App Store Connect API readback proves:

- processing state `VALID`;
- internal state `IN_BETA_TESTING` and membership in
  **Quipsly Capture Internal**;
- external state `IN_BETA_TESTING` and membership in
  **Quipsly Capture Rehearsal**;
- beta review `APPROVED`;
- build-specific localization ready;
- automatic tester notification enabled;
- public link enabled with a 100-tester limit; and
- `usesNonExemptEncryption=false`.

The external apply, independent API readback, and anonymous public-page receipts
are private mode-0600 artifacts under:

`/Volumes/My Passport/Quipsly QA Artifacts/Build 26/App Store Connect`

The public-page readback returned HTTP 200, matched **Quipsly Capture Beta**,
and found the exact `itms-beta` handoff. It did not use App Store Connect
credentials.

## Reviewer readiness

The stored synthetic reviewer credential passed production Firebase password
sign-in, account lookup, verified-email state, native bearer-token session
check, Home Nest readback, and the authenticated mobile capture sessions route.
The account has ten reviewer-safe Sessions; the chosen Session has an app-owned
participant, granted recording consent, and truthful LiveKit readiness. No new
Session, recording, charge, invite, calendar event, or publication was created
by this proof.

## App Store 1.0 listing readback

The editable App Store version now assigns the same provider build used by
TestFlight: `0ef2cf7a-43d1-49bb-800f-c08239730b96`, Build 26. The bounded
listing operator also read back the canonical localization, Productivity and
Photo & Video categories, manual release mode, App Review contact, and the
stored synthetic demo account without printing its password. It did not touch
legal declarations or submit the version.

The subsequent credentialed, read-only submission audit passed app identity,
editable-version state, exact build assignment, App Review details, content
rights, all age-rating questions, IDFA false, Free pricing, and USA-only
availability. It remains intentionally blocked by five screenshots, App
Privacy publication, account-level DSA determination, physical Build 26
acceptance, production account-deletion proof, and iPhone-only compatibility
cleanup.

Mode-0600 provider receipts are:

- `/Volumes/My Passport/Quipsly QA Artifacts/Build 26/App Store Connect/listing-apply-20260802T141900Z.json`
- `/Volumes/My Passport/Quipsly QA Artifacts/Build 26/App Store Connect/submission-readiness-20260802T141950Z.json`

## Screenshot candidate operation

The five private-data-safe screenshot stories were operated again from a clean
detached checkout of the exact Build 26 source. All five exported at Apple's
planned 1320 x 2868 size with individual SHA-256 receipts and were visually
inspected. The retained evidence is:

`/Volumes/My Passport/Quipsly QA Artifacts/Build 26/App Store Screenshot Drafts/283d522058bb/20260802T142000Z-build26`

Visual inspection found one real Work-copy defect: the singular archived-tag
sentence used the plural verb. Source `c621af95aa0e0d0318ee4c40bd1cf8c3a5f054e2`
repairs the product UI, adds an operated screenshot assertion, passes all
1,007 App Store static checks, and independently regenerated the five-screen
set from a clean detached checkout. That source is queued for a later spaced
release; it did not trigger a new upload or change the canonical Build 26
binary.

Both receipts deliberately report `submissionEligible=false`. These images are
strong exact-source composition evidence, not signed/TestFlight physical-device
approval, and were not uploaded to App Store Connect.

## Remaining acceptance boundary

Install Build 26 through TestFlight on a physical iPhone and operate the real
app. Acceptance still requires microphone and camera fidelity, front/back
camera switching, pause/resume, interruption and route-loss handling,
force-quit/offline recovery, direct upload verification, assembled playback,
timeline alignment, and same-ID Nest/Studio readback. Until that happens, the
release ledger must not claim a physical install or recording.
