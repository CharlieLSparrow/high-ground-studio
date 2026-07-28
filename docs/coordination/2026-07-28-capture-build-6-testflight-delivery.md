# Capture Build 6 TestFlight delivery checkpoint

**Date:** 2026-07-28  
**Status:** exact qualified Build 6 uploaded, processed, and assigned to one
internal tester; physical TestFlight installation and operation remain open

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

## Authorization and environment readback

App Store Connect authentication was completed through the account holder's
passkey. The organization has not yet enabled App Store Connect API access; the
UI presents a one-time `Request Access` action. Creating persistent API access
or accepting related terms still requires explicit account-holder approval.
This does not invalidate the current Organizer upload.

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

iPhone Mirroring currently reports:

`iPhone Microphone in Use — iPhone Mirroring will connect when iPhone microphone is no longer in use.`

CoreDevice still does not enumerate the iPhone over Xcode's device channel.
Neither state blocks installing an internal build directly through TestFlight
on the phone, but both prevent agent-operated physical readback right now.

After the microphone is released:

1. open TestFlight on the iPhone under the invited Apple Account;
2. accept the invitation if Apple presents one;
3. install Quipsly Capture `1.0 (6)`;
4. read back the installed version and build in the app;
5. sign into the production Quipsly account;
6. operate the physical checklist in
   [`ios-capture-reviewer-smoke-checklist.md`](../quipsly/ios-capture-reviewer-smoke-checklist.md);
7. update the exact receipt only after observed installation and operation.

Do not claim the physical gate from provider invitation, an Organizer upload,
or simulator tests. Build 6 is distributed to internal testing, but physical
installation and real-device behavior remain unproved.
