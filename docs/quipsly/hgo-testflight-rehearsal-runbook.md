# High Ground Odyssey TestFlight Rehearsal

Last verified: 2026-07-30 02:44 UTC

This is the operator runbook for the first Charlie-and-Homer Quipsly Capture
rehearsal. It distinguishes what is ready now from what the rehearsal still
needs to prove.

## Current release state

- App: **Quipsly Capture 1.0 (13)**
- Exact native source:
  `a554b8cbcc768b012fbfe5440eb83090ba178a61`
- Qualified IPA: 20,173,922 bytes, SHA-256
  `9e19b99518362649a479d1feea188c7c7eaf556223e7b746fbce68dc1cb1bea3`
- External TestFlight group: **Quipsly Capture Rehearsal**
- TestFlight Apple Account: `shomers@icloud.com`
- Quipsly Google identity: `shomers@gmail.com`
- Apple state: `IN_BETA_TESTING` / `APPROVED`
- Public installation link:
  `https://testflight.apple.com/join/XwRRcYUm`
- Public-link capacity: limited to 100 testers
- Automatic tester notification: enabled
- Installation mode: public-link-only; neither a named-tester email nor a
  redemption code is required
- Private Nest:
  `https://nest.quipsly.com/nests/high-ground-odyssey-rehearsal/episodes/testflight-rehearsal`
- Session: **High Ground Odyssey TestFlight Rehearsal**
- Session state: planned, LiveKit configured, Charlie and Homer assigned
- Consent state: requested for both people; neither receipt has been granted on
  anyone's behalf
- Episode writing: **The Swear Jar**, exact 34-block private import
- Shared Watch order:
  1. `Ted Lasso Be Curious.mp4`
  2. `I love lucy.mp4`
  3. `LOTR Ring Back.mp4`
- Lead clip: **Ted Lasso Be Curious**, selected and paused
- 2026-07-29 authenticated media readback: all three production objects match
  the current local files byte-for-byte; unauthenticated playback returns
  HTTP 401. Be Curious remains first, selected, paused, with zero watched
  segments and no started rehearsal session.
- The 09:28 UTC idempotent production staging pass made no content or room
  changes. The selected Be Curious object returned the exact 19,100,059 local
  bytes at SHA-256
  `acddc14133f11580d602fa744f4b448a8e16061b81aebe9597e832df3b8175e3`;
  the exact 34-block manuscript and all three Watch sources passed again.
- The 10:19 UTC **native bearer-only** proof passed against zero-traffic Cloud
  Run preview `studio-00428-cef`, exact source
  `96eebffc27bc1bae2b1789b0f0adb27d70bd3987`. The Watch projection and Be
  Curious media both returned HTTP 401 without credentials and HTTP 200 with
  the short-lived Firebase bearer. The preview returned revision 5, the exact
  three-clip order above, Be Curious selected and paused, no started Watch
  session, no active or closed segment, and the exact 19,100,059-byte source at
  the SHA-256 above. The verifier issued GET requests only.
- The 10:48 UTC local source qualification decoded the complete Be Curious
  file with FFmpeg's fail-on-error path. It is an MP4 with H.264 Main
  1280×638 video at 24000/1001 fps and AAC-LC 44.1 kHz stereo audio; both
  streams begin at 0, the container is 254.630 seconds, and full video/audio
  decode completed with no errors. Its 19,100,059 bytes still hash to the
  exact protected-cloud SHA-256 above.
- At 10:55 UTC, the upgraded native bearer-only verifier streamed **all three**
  protected sources from the same exact preview revision. Every source denied
  an outsider with HTTP 401, returned HTTP 200 to the short-lived Firebase
  bearer, and matched its local byte count and SHA-256:
  - Be Curious: 19,100,059 bytes,
    `acddc14133f11580d602fa744f4b448a8e16061b81aebe9597e832df3b8175e3`
  - Lucy: 10,880,177 bytes,
    `7ea7a14735b99cd6e4c5b4c35aecfb97a97df04a7c6f7ba61cf9d3623bcc8078`
  - Samwise: 28,459,489 bytes,
    `0cd069b802ff719859673878061d63daee89dd7743a245c360a0f05d857d08bf`
  The room remained revision 5 and paused, with Be Curious first and selected,
  no started Watch session, and no watched spans. The receipt is
  `/private/tmp/quipsly-watch-preview-96eebffc-all-media-receipt.json`, mode
  0600.
- At 10:57 UTC, the read-only production identity rehearsal found Homer's
  canonical Quipsly user, active free membership, editor grant, invite ledger,
  room participant, and REQUESTED consent already present; it proposed zero
  repairs. `shomers@gmail.com` is intentionally not Firebase-linked until
  Homer completes **Continue with Google** once. That verified Google subject
  is transactionally attached to the existing Quipsly user by email, so Homer
  should not use password signup and does not need a Quipsly verification
  email. The redacted receipt is
  `/private/tmp/quipsly-capture-rehearsal/homer-identity-readback.json`, mode
  0600.
- Build 13's exact source contains the native **Continue with Google** surface,
  the Quipsly iOS OAuth client ID, and its registered callback scheme. On
  2026-07-30, an operated current-source simulator journey tapped that real
  button, confirmed Apple's protected prompt identified `google.com`, selected
  **Continue**, and reached Google's page identifying **Quipsly** as the OAuth
  audience. No provider account or credential was entered. The matching
  opt-in XCUITest passed 1/1 through the protected-provider handoff and stores
  no reviewer password. This proves the app-to-Google boundary; only Scott's
  action on his physical iPhone can link `shomers@gmail.com` to his existing
  Quipsly user.
- At 11:49 UTC, zero-traffic preview `studio-00429-niv` proved the complete
  read-only native rehearsal boundary from exact deployed source
  `8fa86d46977074f90386663fae92ea2fe0166167`. An outsider received HTTP 401
  for the canonical manuscript, Watch projection, and every protected media
  object. The authenticated projection returned all 34 canonical blocks,
  unique stable IDs, ascending orders, every body, and the exact first heading
  `**THE SWEAR JAR**`. A second request with the same opaque writing version
  returned metadata only instead of retransmitting the script. All three
  protected videos again matched their pinned local bytes and SHA-256 values.
  Watch remained revision 5, selected on Be Curious, paused at zero, with no
  session, active segment, watched span, recording, consent mutation, or
  provider join. The GET-only receipt is
  `/private/tmp/quipsly-native-rehearsal-preview-8fa86d46-receipt.json`, mode
  0600.
- At 13:50 UTC, the same GET-only proof passed against the newest
  zero-traffic preview `studio-00430-fop`, exact source
  `1ac5bd3d441a07938239f2073add2f6e2ed0a0eb`. All 34 manuscript blocks and
  all three protected clip byte counts and hashes still match. Watch remains
  revision 5, paused at zero, with Be Curious first and selected, no session,
  no active segment, and no watched segment. The redacted mode-0600 receipt is
  `/private/tmp/quipsly-watch-preview-1ac5bd3d-current-receipt.json`.
- At 14:00 UTC, the final Chrome security-check download was read back from
  disk. `Ted Lasso Be Curious.mp4` is complete rather than a partial browser
  file and still probes as 254.630 seconds of H.264 1280×638 video plus AAC
  44.1 kHz stereo audio. It is still exactly 19,100,059 bytes at SHA-256
  `acddc14133f11580d602fa744f4b448a8e16061b81aebe9597e832df3b8175e3`.
  Lucy and Samwise also probe cleanly, and no `.crdownload`, `.download`, or
  `.part` file remains.

## Approved Build 13 rehearsal lane

Build 13 carries the complete coordinated-podcast and source-evidence lineage
first qualified in Build 9, plus exact local-to-Nest evidence comparison and
canonical project creation from iPhone Work. It also keeps standalone audio
and video capture independent from Shared Watch's headphone requirement and
makes recurring-task authoring use a deterministic Settings-style picker. It
is no longer an unuploaded candidate:

- the detached exact-source release passed 36/36 deterministic UI journeys,
  produced a signed archive, and verified the exported `1.0 (13)` IPA;
- App Store Connect identifies Build
  `37410843-bb8c-4785-8127-137e25d29fb8` as `VALID`;
- the external `Quipsly Capture Rehearsal` group contains Build 13;
- the 02:43 UTC read-only API plan reports `IN_BETA_TESTING` / `APPROVED`,
  complete beta metadata, automatic notification enabled, and zero pending
  provider mutations;
- the exact public page is open and exposes the Quipsly title, beta heading,
  and `itms-beta` TestFlight handoff.

Fastlane's first upload handoff split the external-volume path at
`My Passport` and exited before transferring any bytes. App Store Connect
readback confirmed Build 13 was absent. The qualified IPA was then copied to a
space-free `/private/tmp` path, its SHA-256 was checked against both the
canonical artifact and receipt, and that byte-identical copy uploaded and
processed successfully. The pipeline now performs this verified temporary
staging automatically while preserving the canonical artifact on the release
volume.

Build 13's **Podcast audio + video** mode creates two immutable local masters
under one capture-group identity: a microphone AAC source and a video-only MOV
source. During a LiveKit call, LiveKit stays the single microphone hardware
owner and Quipsly records its already-owned local-input PCM instead of opening
a competing microphone client. The app waits for real PCM before claiming the
audio source started. Pause/Resume acts on both sources; Flip safely closes and
validates the current movie, starts the other camera in the same group, and
keeps the microphone source continuous.

The same build exposes the canonical **The Swear Jar** manuscript beside
Record, stages protected Episode Watch clips with revision-safe shared
Play/Pause/Seek, sends receipt-backed watched spans to the non-destructive
editor lane, and opens the assembled episode in Nest. **Before you record**
reconciles account, exact Session, consent, route, storage, camera profile,
manuscript, protected clip, headphones, and live-room readiness without
granting consent, joining, or starting capture.

Every completed source retains its app/build, iPhone/OS, route, capture-group,
room receipt, local hash, and verified cloud identity in an
owner-partitioned protected ledger. Library can prepare a redacted portable
receipt and **Compare with Nest** before the local upload job is retired.
Neither action deletes or overwrites the phone original.

The signed candidate receipt still says
`physicalTestFlightInstallReadbackPerformed: false`; Scott's installation and
the real two-account rehearsal below are the gates that can change that truth.
Provider readback receipts beside the artifact independently prove upload,
processing, internal assignment, external assignment, approval, and the open
public handoff.
Historical design and qualification evidence remains in:

- [`Coordinated podcast A/V candidate`](../coordination/2026-07-29-capture-coordinated-podcast-av-candidate.md)
- [`Build 9 qualification record`](../coordination/2026-07-29-capture-build-9-qualified-candidate.md)
- [`Build 11 qualification record`](../coordination/2026-07-29-capture-build-11-qualified-candidate.md)

Email delivery and App Store Connect team membership are not installation
gates. The enabled public external-testing link is the canonical path:

`https://testflight.apple.com/join/XwRRcYUm`

As a redundant internal path, Build 13 is also assigned to **Quipsly Capture
Internal**. Apple's 02:43 UTC relationship readback resolves
`shomers@icloud.com` in that group as `INVITED` and confirms the build is
`IN_BETA_TESTING`. This can make the app appear directly in TestFlight, but the
public link remains the recovery path when Apple's invitation email or library
refresh lags.

The public page briefly returned **This beta isn't accepting any new testers
right now** even though an approved build was assigned, the
group was enabled, and Apple's public-link metrics reported zero accepted
testers. The existing 10-person cap was raised to 100 and the link activation
was cycled off and back on without changing its ID. Fresh uncached iPhone and
desktop HTTP readback now returns **Join the Quipsly Capture beta**, the exact
Quipsly beta description, and the TestFlight handoff. Opening it on the iPhone
presents **Start Testing** and hands off to TestFlight without an invitation
email or redemption code.

Operators and release agents must verify that human-facing boundary directly,
not infer it from `publicLinkEnabled`:

```bash
pnpm quipsly:capture:testflight-public-link-readback \
  --output /private/tmp/quipsly-testflight-public-link-current.json
```

The verifier fails when Apple returns its generic closed page with HTTP 200 and
passes only when the exact Quipsly title, beta heading, and `itms-beta`
TestFlight handoff are all present. The optional receipt is mode 0600.

- [Apple: Invite external testers](https://developer.apple.com/help/app-store-connect/test-a-beta-version/invite-external-testers)
- [Apple: TestFlight overview](https://developer.apple.com/help/app-store-connect/test-a-beta-version/testflight-overview)

## Message to send Homer

> We are testing Quipsly Capture. Apple has approved the external beta.
>
> 1. Install **TestFlight** from the App Store.
> 2. On the iPhone, open
>    `https://testflight.apple.com/join/XwRRcYUm` in Safari.
> 3. Tap **Start Testing**, open TestFlight, then accept and install
>    **Quipsly Capture**. Ignore the Redeem button; this path does not require
>    an email or code.
> 4. Open Quipsly Capture and tap **Continue with Google**.
> 5. Choose `shomers@gmail.com`. Do not create a password account and do not
>    wait for a Quipsly verification email; Google sign-in is the intended
>    path.
> 6. Allow microphone and camera access when iOS asks.
> 7. Stop there if Charlie is not with you. We will choose the exact rehearsal
>    Session and make the recording-consent choices together.

The Apple Account signed into TestFlight is `shomers@icloud.com`; the Quipsly
account selected inside Capture is `shomers@gmail.com`. They identify Scott at
different provider boundaries and are intentionally not merged by email. The
public TestFlight link avoids the unreliable private-email invitation path
entirely.

The no-credential provider-boundary check can be repeated independently of the
signed-in runtime journeys:

```bash
QUIPSLY_CAPTURE_UI_TEST_MODE=google-handoff \
  QUIPSLY_CAPTURE_UI_TEST_DESTINATION='platform=iOS Simulator,name=iPhone 17 Pro' \
  bash apps/mobile-capture/HighGroundCapture/scripts/run-capture-runtime-ui-smoke.sh
```

It intentionally stops before selecting a Google account. It cannot prove
Scott's successful login or canonical Quipsly identity attachment.

If the public link does not hand off to TestFlight:

1. copy and paste the exact link into Safari on the iPhone;
2. confirm TestFlight is installed and signed into the intended Apple Account;
3. tap **Start Testing** and then **Open in TestFlight**;
4. report the exact Safari/TestFlight screen before changing accounts or
   entering a redemption code.

## Ten-minute preflight

From the exact product worktree, run the consolidated live readback first:

```bash
pnpm quipsly:capture:rehearsal-preflight \
  --output /private/tmp/quipsly-hgo-rehearsal-preflight-current.json
```

`infrastructureReady: true` proves the current Build 13/public-link boundary,
the exact private production Room, two participant records, just-in-time
Scott Google linking, the 34-block manuscript, all three protected Watch
objects, and the signed canonical Mac launcher. It intentionally leaves
`readyToRecordNow: false` until physical installation, Charlie's Mac handoff,
both human consent decisions, device routes, a listened/watched disposable
take, the two-person room, and same-ID upload/timeline readback are separately
proved. Never edit that receipt to make a human or physical gate green.

Both people:

1. Use headphones to avoid speaker echo.
2. Charge the iPhone and leave at least 10 GB free for this first video test.
3. Turn off Low Power Mode.
4. Use stable Wi-Fi.
5. Open Quipsly Capture and confirm the Account surface shows the intended
   Google identity.
6. Open **Record** and choose **High Ground Odyssey TestFlight Rehearsal**.
7. Confirm the Session—not a similarly named old room—is selected before
   granting consent or recording.

Charlie:

1. Open the private Episode Room URL on the Mac.
2. Confirm the writing begins with **The Swear Jar**.
3. Confirm **Be Curious** is the selected Watch clip and remains paused.
4. Keep a second browser tab ready for the Session review:
   `/sessions/cms5lylpx000001s6bz9pt1yu`.
5. If using the Canon R8 as the production video source, record it
   independently and preserve its original card/file clock. Quipsly can import
   and align it after the rehearsal.
6. If the MV7i is connected to an iPhone or Mac, verify the route name and
   headphones before the take. Do not infer that Quipsly selected it merely
   because the device is plugged in.

## Consent

Each signed-in participant must save their own choices. One person must never
grant the other person's receipt.

In **Record → Review choices**:

1. enable **Record audio** for a local audio take;
2. enable **Record video** if that iPhone will create a camera source;
3. enable **Create a transcript** only if everyone agrees to transcription;
4. confirm that every person who may be heard or seen was told and agreed;
5. tap **Save these choices**.

The app should show the participant counts reaching the required total before
record controls unlock.

## Recommended first rehearsal

Build 13 exposes four deliberate source modes:

- **Audio** creates a local microphone source. In a joined LiveKit room it
  records the room-owned local-input PCM instead of opening a second
  microphone client.
- **A/V** creates separate microphone and video-only masters in one capture
  group while LiveKit remains the call.
- **Solo** creates one camera-and-microphone movie and therefore refuses to
  coexist with a live room.
- **Camera** creates a video-only master beside the LiveKit conversation.

Provider audio still is not the same as a verified provider-egress recording.
The local source receipts and the LiveKit room remain separate truth.

For the most useful low-risk first proof:

1. Charlie opens the signed Quipsly Studio app. Complete the Google account
   handoff if Account still says **Not connected yet**, then open **Episode
   Capture Setup** with `Command-Shift-R`.
2. Charlie selects the exact rehearsal room, `Shure MV7i` for microphone and
   headphones, and `EOS Webcam Utility` for the Canon reference feed. Confirm
   a fresh live image. Keep Canon on-card recording as the independent 4K
   production master if desired.
3. Homer opens the same Session in Build 13. Both people join the LiveKit room.
   Joining must not start recording.
4. Homer selects **A/V**, prepares the front camera, expands **Before you
   record**, and runs **Check this iPhone**. Do not start until the exact
   Session, both consents, microphone route, camera profile, storage,
   manuscript, Be Curious, headphones, and room are all truthful.
5. Charlie starts the app-owned MV7i WAV and Canon reference source. Homer
   starts **Podcast audio + video**. Speak for 20–30 seconds and verify the app
   claims two local sources only after both have actually started.
6. Homer taps **Pause**, waits for both sources to show paused, then
   **Resume**. Tap **Flip** once while recording. Flip must validate the
   current movie and start the other camera in the same capture group while
   keeping the microphone source continuous.
7. Stop Homer's coordinated take, then stop Charlie's sources. Confirm every
   source appears locally and plays before relying on upload or timeline
   assembly.
8. If the Mac account or hardware lane cannot be made truthful, do not fake
   it: Charlie uses a second signed-in Capture device for the call/audio
   boundary and records the R8 independently. Record the Mac limitation as
   open evidence.

## Shared clip proof

With the Episode Room open in both collaborators' authenticated Nest sessions:

1. Charlie confirms **Be Curious** is selected.
2. Start the authoritative Capture recording clock, then use **Use recording
   clock** in Episode Room. Do not invent or type a start timestamp.
3. Charlie presses **Play for everyone**.
4. Homer presses **Pause for everyone** from the second device.
5. Confirm both players converge on the paused position and the latest receipt
   names Homer as the actor.
6. Resume, briefly disconnect one iPhone's private listening route, and confirm
   both players converge on the resulting authoritative Pause. Reconnect
   headphones before continuing; the phone speaker must never carry the
   reference clip during local or provider recording.
7. Seek to a useful moment, resume, and pause again.
8. Repeat with Lucy or Samwise only if the Be Curious pass is clean.
9. While paused, choose **Send watched spans to editor** in Capture, or
   **Sync watched spans** in Nest.
10. Open **Edit** and confirm the watched source ranges appear in the dedicated
   Shared Watch derivative lane without changing the original clips.

If a browser blocks remote autoplay, tap **Join playback** on that device. That
is a local browser-permission recovery; it does not create a second playback
clock.

## Stop and read back

1. Stop every local recording before leaving the room.
2. Leave the LiveKit room.
3. Keep the phone app open long enough to observe background upload state, then
   deliberately test one relaunch.
4. Confirm no local original disappears after upload verification.
5. In the Session review, verify START and STOP receipts, recording assets, and
   consent state.
6. In Episode Room and Edit, verify imported audio/video sources, shared-watch
   derivatives, and the exact recording-clock anchor.
7. Listen to the assembled audio and watch each camera boundary. Do not accept
   a transcript, alignment proposal, or final edit without source playback.
8. Record the app version/build, iPhone model/OS, route names, failures, and
   exact recovery actions.
9. In Library, open **Review source evidence** for every take. Prepare and
   share the JSON receipt, then confirm its local SHA-256/byte count, START and
   STOP IDs, capture group, app/device/route snapshot, and verified cloud proof
   match the Session and editor readback.
10. Tap **Compare with Nest**. Treat `Exact local and Nest source match` as the
    cryptographic pass, `Exact bytes preserved · processing held` as a policy
    hold, `Incomplete` as a retry/readiness state, and `Drift` as a stop-work
    integrity failure. Capture the exact issue list before retrying anything.

## Pass criteria

The rehearsal passes only when:

- Homer installed Build 13 through TestFlight and used Google sign-in;
- the pre-provisioned Quipsly identity linked without a duplicate account or
  email-verification loop;
- both people independently granted the intended consent choices;
- both joined and left the exact Session;
- Homer's coordinated take has START and STOP evidence for both local masters,
  local playback, upload verification, a portable source-evidence receipt for
  each source, and post-relaunch readback;
- the video test preserves front/back movies plus the continuous microphone
  source in one capture group and every piece plays;
- Charlie can play the reference clip and Homer can pause it;
- Be Curious produces a receipt-backed watched span and an explicit timeline
  derivative;
- the editor can audition the real sources and assembled result;
- no source original is overwritten or deleted; and
- every limitation or failure is recorded honestly.

## Current blockers that are not Homer failures

- Homer's first Google sign-in is the only remaining live identity-link step.
- A physical two-account rehearsal is still required; simulator and server
  tests do not substitute for it.
- Charlie's signed Quipsly Studio app still needs its native Google handoff,
  app-owned live MV7i/EOS confirmation, physical short take, room join, upload,
  and cross-device readback. Hardware enumeration and focused contracts do not
  substitute for those operations.
- Build 13 implements same-iPhone coordinated local audio plus video beside
  LiveKit, but the exact real-device microphone ownership, first PCM,
  Pause/Resume/Flip, upload, and assembled sync path remains unproven until
  this rehearsal.
