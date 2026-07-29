# Capture Build 6 TestFlight delivery checkpoint

**Date:** 2026-07-28  
**Status:** exact qualified Build 6 uploaded, processed, assigned, and reported
`INSTALLED` by App Store Connect; physical app launch and operation remain open

## Delivery decision

Quipsly Capture `1.0 (6)` from exact qualified source
`f10ceab5e83ce08e61092d3cf6a8e8ec2f457589` is now available through
App Store Connect internal testing.

This delivery uses the candidate proven in
[`2026-07-28-capture-build-6-qualified-candidate.md`](./2026-07-28-capture-build-6-qualified-candidate.md):

- IPA SHA-256:
  `080f8b9fa700a3270683a347419c0695cc9694e03b33b3c4cc34bef6b52c6c5a`;
- 32/32 deterministic iPhone and Share Capture UI tests;
- 701/701 App Store static checks;
- Apple Distribution team `585GUXMY5M`;
- strict app and Share Capture extension signature and profile verification.

No new source, rebuild, build-number mutation, or unqualified archive entered
the delivery path.

## Upload and provider readback

The exact archive was copied without mutation into Xcode's standard archive
index:

`/Users/wall-e/Library/Developer/Xcode/Archives/2026-07-28/Quipsly Capture 2026-07-28, 3.49 PM.xcarchive`

Xcode Organizer independently displayed:

- version `1.0 (6)`;
- identifier `com.highgroundodyssey.HighGroundCapture`;
- team Charles Sparrow;
- architecture `arm64`.

The App Store Connect distribution path completed with warnings. Xcode
Organizer then recorded:

- status `Uploaded to Apple`;
- submission status `Uploaded`;
- build number `6`;
- upload readback `Today at 4:00 PM`.

The two warnings are vendor-symbol gaps:

- no matching dSYM for `LiveKitWebRTC.framework`, UUID
  `4C4C4459-5555-3144-A11F-F51F02E1B3B4`;
- no matching dSYM for `RustLiveKitUniFFI.framework`, UUID
  `064A949F-C14A-3CC3-9FE5-74CF783C2936`.

They reduce third-party crash-symbol detail but did not reject the upload.
Treat a future LiveKit binary-package upgrade and matching dSYM availability
as a separate dependency-quality slice; do not unpin the reviewed dependency
inside this release.

App Store Connect provider readback then proved:

- provider build ID `47e5e730-e5bd-4cfb-afae-baef86d3923c`;
- upload status `Complete`;
- TestFlight status `Ready to Test`;
- expiry in 90 days;
- no `Missing Compliance` gate.

The current packaged `ITSAppUsesNonExemptEncryption = false` therefore closed
the export-compliance defect seen on Builds 2–4 without answering Apple's
manual legal questionnaire.

## Controlled internal distribution

The canonical tester copy was saved on Build 6:

> Quipsly Capture Build 6. Focus on sign-in, Home/session/project quick notes,
> Tasks, Goals, due dates, recurrence, reminders, canonical tags, Safari Share
> Capture, explicit recording consent, local audio/video capture, offline and
> relaunch recovery, playback, upload status, and same-ID Nest readback. Do not
> use an irreplaceable recording during beta testing. Report any data loss,
> cross-account visibility, consent, recording, or upload issue immediately.

Internal group:

- name `Quipsly Capture Internal`;
- provider group ID `aa092780-ff35-496c-bc65-49904d8b161c`;
- automatic distribution disabled permanently;
- Build `1.0 (6)` explicitly assigned;
- build status `Ready to Test`;
- one Account Holder tester added;
- tester status `Invited`.

Automatic distribution was deliberately disabled because the repository
distinguishes archive diagnostics from qualified candidates. No future Xcode
archive may reach testers merely because it exists.

The exact release receipt at
`/tmp/quipsly-capture-release/f10ceab5e83c/20260728T213508Z-94009/QuipslyCapture-1.0.6-release-receipt.json`
now records candidate qualification, Xcode Organizer upload, provider
processing, internal group assignment, tester invitation, vendor warnings, and
`physicalTestFlightInstallReadbackPerformed: false`.

## Authorization and API readback

App Store Connect authentication was completed through the account holder's
passkey. The account holder subsequently requested and received App Store
Connect API access, generated one Team Admin key, and downloaded it once. The
private `.p8` and Fastlane JSON now live outside the repository under
owner-only permissions. No private-key content, JWT, or tester email is
included in source, receipts, or logs.

A live API identity request returned HTTP 200 for:

- app ID `6780995957`;
- name `Quipsly Capture`;
- bundle ID `com.highgroundodyssey.HighGroundCapture`.

The repository-owned scoped readback then proved:

- provider build `47e5e730-e5bd-4cfb-afae-baef86d3923c`;
- marketing version `1.0`, build `6`;
- processing state `VALID`;
- internal state `IN_BETA_TESTING`;
- exact manually controlled internal group and build relationship;
- one assigned tester in state `INSTALLED`.

Evidence:

`/tmp/quipsly-capture-app-store-connect/f15fe8f40395/build-6-installed-readback.json`

The readback tool signs a five-minute ES256 JWT restricted to the required
read-only App Store Connect endpoints, refuses an overly permissive credential
file, redacts the tester email, and is covered in both Capture and repository
PR checks.

Google Cloud authentication was refreshed without exposing tokens. Current
readback passes:

- selected deployment account;
- gcloud user access-token minting;
- ADC access-token minting;
- `high-ground-odyssey` deploy-project access;
- `quipsly-reef` Firebase-project access;
- Firebase Admin access through ADC.

The Firebase ADC quota project is `quipsly-reef`.

## Remaining physical gate

iPhone Mirroring connected and displayed the phone. App Store Connect's
Reinvite action delivered a new inbox message to the same Apple Account shown
in TestFlight settings. Opening the Apple invitation link on the mirrored
iPhone reached the correct Quipsly Capture `1.0 (6)` card, with the expected
owl icon, developer, 90-day expiry, tester instructions, and `Install` button.
The scoped App Store Connect API subsequently reported the tester as
`INSTALLED`.

The current iPhone Mirroring boundary says `iPhone in Use — Lock your iPhone
to connect`; the app will reconnect when the physical phone is locked.
CoreDevice also still does not enumerate the iPhone over Xcode's device
channel. Provider state therefore closes installation but cannot substitute
for app-owned launch, build readback, or workflow evidence.

Required sequence:

1. lock the physical iPhone and let iPhone Mirroring reconnect;
2. open the installed Quipsly Capture app;
3. read back version `1.0` and build `6` from the app-owned surface;
4. sign into the production Quipsly account;
5. operate the physical checklist in
   [`ios-capture-reviewer-smoke-checklist.md`](../quipsly/ios-capture-reviewer-smoke-checklist.md);
6. update the exact receipt only after observed app operation.

Do not claim app operation from provider installation, an Organizer upload, or
simulator tests. Build 6 is installed for its internal tester, but real-device
Quipsly behavior remains unproved.
