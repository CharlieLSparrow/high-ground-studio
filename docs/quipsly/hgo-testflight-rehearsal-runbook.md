# High Ground Odyssey TestFlight Rehearsal

Last verified: 2026-07-29 20:20 UTC

This is the operator runbook for the first Charlie-and-Homer Quipsly Capture
rehearsal. It distinguishes what is ready now from what the rehearsal still
needs to prove.

## Current release state

- App: **Quipsly Capture 1.0 (8)**
- External TestFlight group: **Quipsly Capture Rehearsal**
- TestFlight Apple Account: `shomers@icloud.com`
- Quipsly Google identity: `shomers@gmail.com`
- Apple state: `IN_BETA_TESTING` / `APPROVED`
- Public installation link:
  `https://testflight.apple.com/join/XwRRcYUm`
- Public-link capacity: limited to 100 testers
- Automatic tester notification: enabled
- Named external tester: the intended `shomers@icloud.com` TestFlight identity
  is assigned to the rehearsal group and Apple reports `INVITED`
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

## Qualified Build 9 candidate without changing the current TestFlight lane

Exact committed Build 9 source
`b44e2a90968a7cccc6a3bae137fc97039050cc4b` combines the
production-architected
**Podcast audio + video** mode from `5920e525` with native shared Episode Watch:
separate local AAC microphone and video-only MOV masters under one
capture-group identity while LiveKit remains the call, plus protected
preparation and revision-safe Play/Pause/Seek from the iPhone Record surface.
It also holds shared playback for everyone on private-route loss, manages
derived downloads visibly, sends paused receipt-backed spans to the
non-destructive editor lane, and opens the exact assembled episode in Nest.
While paused, either editor can choose the next staged clip directly in
Capture; Be Curious remains first and selected. Download completion is no
longer treated as playback readiness: iOS must confirm the protected file is
decodable, and a fatal decoder failure pauses shared Watch when authorized,
removes the unusable copy, and exposes a retry. The deterministic preview
mirrors the exact three-clip lineup, and the Watch header reflows instead of
clipping at accessibility text sizes. The authenticated media response must
also finish on the configured Nest origin, so an HTTP redirect cannot
substitute external bytes.

The candidate also places the canonical episode manuscript beside the Record
surface as a searchable, read-only reader. Its owner/project/episode-partitioned
offline copy uses complete file protection, is excluded from backup, is purged
on sign-out, and never turns the iPhone into an editable fork. The title is
derived from the real first canonical heading even when the import stores that
heading in the block body rather than its optional title field. The reader
does not join Watch's one-second polling path; unchanged requests return
metadata only.

The Record surface now keeps a compact **Before you record** summary directly
above the recorder. Expanding it reconciles the verified account, exact
Session/episode, mode-specific participant consent, real microphone route and
storage, selected camera profile, canonical manuscript, selected protected
Watch clip, private headphone route, and live-room connection. **Check this
iPhone** prepares those local/content dependencies but cannot grant consent,
join the room, or start recording. Once the live room is connected, it refuses
to reconfigure live audio and limits itself to refreshing the script and clip.

The candidate now also removes the unsafe dual-microphone-client topology:
LiveKit remains the single hardware owner during a room, while Quipsly records
the already-owned local-input PCM and waits for its first real callback before
claiming capture. Standalone audio still uses `AVAudioRecorder`; callback
starvation pauses visibly and closes the coordinated camera boundary.

The candidate now preserves rehearsal proof on the source itself instead of
leaving it in transient upload or in-process notification state. Capture-time
app/build, iPhone/OS, microphone route, room STOP receipt, canonical IDs, and
verified cloud SHA-256/size/generation/time survive relaunch in the protected
owner-partitioned source ledger. Library exposes **Review source evidence** and
can prepare a redacted, versioned JSON receipt only after streaming every
local byte through SHA-256 and proving that the file stayed unchanged. Verified
cloud proof commits to that permanent source row before the resumable job is
retired; failed job-ledger cleanup rolls back for safe replay.

The current Watch contract is 38/38, the manuscript contract is 10/10, and the
read-only rehearsal verifier is 7/7. Capture durability is 79/79,
coordinated-capture is 23/23, account isolation is 15/15, and the complete
mobile preflight plus LiveKit-linked arm64/x86_64 simulator build pass. The
rehearsal-readiness contract is 12/12 and its collapsed-to-expanded iPhone 17
Pro simulator journey passes.
The source-evidence contract is 23/23 and its no-false-receipt iPhone 17 Pro
simulator journey passes.
The targeted Record accessibility, episode-script reader, shared-Watch, and
source-evidence UI journeys plus the static, simulator, privacy,
server-preview, native-bearer, and protected-media gates are green. A detached
exact-commit release run qualified signed `1.0 (9)` with 36/36 deterministic
native UI scenarios and a 20,023,041-byte IPA at SHA-256
`365fd2e8d90d3b1558fbfd7212d8d9459d2ddeeac7557407a56e898254ff972c`.
The receipt truth remains `uploadAttempted: false`,
`testerAssignmentPerformed: false`, and
`physicalTestFlightInstallReadbackPerformed: false`. The exact server
projection is deployed separately from `1ac5bd3d` on zero-traffic preview
`studio-00430-fop`; Build 8 remains the externally submitted rehearsal
instruction set below until Build 9 upload, processing, assignment, and
physical-iPhone proof occur.

See
[`../coordination/2026-07-29-capture-coordinated-podcast-av-candidate.md`](../coordination/2026-07-29-capture-coordinated-podcast-av-candidate.md)
and the exact
[`Build 9 qualification record`](../coordination/2026-07-29-capture-build-9-qualified-candidate.md).

Apple approved Build 8 for external TestFlight testing. The 18:34 UTC API
readback reports `IN_BETA_TESTING` / `APPROVED`; Build 8 remains assigned to
the external `Quipsly Capture Rehearsal` group and the group is ready for
testing. Email delivery and the internal-tester invitation state are no longer
rehearsal blockers. The enabled public external-testing link is the canonical
installation path:

`https://testflight.apple.com/join/XwRRcYUm`

At 20:20 UTC the external group contains the intended named tester with
`inviteType: EMAIL` and `state: INVITED`. That named TestFlight assignment is
separate from Scott's accepted App Store Connect team membership.

The public page briefly returned **This beta isn't accepting any new testers
right now** even though Build 8 was approved, unexpired, and assigned, the
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

If the public link does not hand off to TestFlight:

1. copy and paste the exact link into Safari on the iPhone;
2. confirm TestFlight is installed and signed into the intended Apple Account;
3. tap **Start Testing** and then **Open in TestFlight**;
4. report the exact Safari/TestFlight screen before changing accounts or
   entering a redemption code.

## Ten-minute preflight

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

The present Build 8 architecture deliberately separates provider audio and
local source capture:

- **Audio** records the selected microphone locally and can coexist with the
  already-connected LiveKit room.
- **Podcast camera** records a video-only local master so LiveKit can keep the
  microphone.
- **Solo video** records camera plus local microphone, but intentionally
  refuses to coexist with a live room.
- Provider audio is not the same as a verified provider-egress recording.

For the most useful low-risk first proof:

1. Both people join the LiveKit room from **Record → Live room → Join room**.
   Joining must not start recording.
2. Both people choose **Audio** and start a local audio take on their own
   iPhone. Speak for 20–30 seconds, pause, resume, add a Mark, then stop.
3. Confirm each take appears in **Library**, plays locally, and moves through
   queued/uploading/verified state without deleting the phone original.
4. Record the Canon R8 or another independent camera throughout if a
   simultaneous video master is required.
5. As a separate camera-boundary proof, leave the live room on one iPhone,
   choose **Solo video**, prepare the front camera, record 10–15 seconds, tap
   **Flip**, record another 10–15 seconds, and stop. The Flip action should
   close and verify one immutable movie, then start the other camera in the
   same capture group; it is not an invisible in-file lens swap.
6. Play both resulting local video pieces in Library.

Do not describe this as a simultaneous same-iPhone audio-plus-video podcast
master. Build 8 intentionally allows LiveKit plus a video-only podcast camera,
or a solo camera-plus-microphone recording without LiveKit. A separate camera
is the mature production lane for the first episode rehearsal while a later
Capture slice adds one coordinated local audio-and-video group.

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
9. While paused, choose **Send watched spans to editor** on the iPhone
   candidate, or **Sync watched spans** in Nest on Build 8.
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

- Homer installed Build 8 through TestFlight and used Google sign-in;
- the pre-provisioned Quipsly identity linked without a duplicate account or
  email-verification loop;
- both people independently granted the intended consent choices;
- both joined and left the exact Session;
- each local audio take has START and STOP evidence, local playback, upload
  verification, a portable source-evidence receipt, and post-relaunch readback;
- the video test preserves front/back sources in one capture group and both
  pieces play;
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
- The current Mac browser call prototype is retired. Canon R8 + MV7i as a
  first-class Quipsly Mac call/capture lane remains a separate production
  feature.
- Same-iPhone concurrent local audio plus local video while LiveKit is active
  is not claimed by Build 8. Use two local sources or a separate camera for the
  first rehearsal.
