# Episode 9 hybrid recording runbook

Date: 2026-08-04

Status: locally rehearsed; production LiveKit and physical-device acceptance remain release gates

## Prepared room

- Nest: `high-ground-odyssey-manuscript`
- Episode Room: `episode-9`
- Title: `Episode 9: The Swear Jar`
- Podcast Session: the canonical Session linked from the Episode Room
- First Shared Watch source: `Ted Lasso Be Curious.mp4`
- Collaboration proxy: 254.63 seconds, H.264/AAC, playable from the Episode Room
- Editor handoff: `/editor?project=high-ground-odyssey-manuscript&episode=episode-9`

The Episode Room owns the working manuscript, episode thread, Shared Watch
receipts, recording clock, and timeline handoff. The linked Session owns the
take-specific participant room, consent, call, retained sources, and Session
thread. Importing media must never replace the Episode Room manuscript or
normalize its human title.

## Device roles

Use exactly one call-audio owner per person. Every additional device records
silently. This prevents echo and makes every high-quality camera or microphone
an isolated source instead of a second loudspeaker in the room.

### Charlie

1. Open the Episode Room on the Mac and select **Open mic, camera & call**.
2. Select `MOTIV Mix Virtual` as the browser microphone when it is the route
   carrying the MV7i. Confirm the physical MV7i input in MOTIV Mix before join.
3. Plug headphones into the MV7i. Select the MV7i/MOTIV output in the browser
   when supported; otherwise select it in macOS Sound.
4. Use the browser as Charlie's only live call-audio owner.
5. If the Canon R8 is used, select `EOS Webcam Utility` for call confidence or
   record a separate high-quality Canon source. Do not mistake call video for
   the retained camera master.
6. Start the visible retained browser source separately after all-party consent.

### Scott / Homer

1. Join the same Session from the laptop browser with headphones. The laptop is
   his live call-audio owner and Shared Watch/control surface.
2. Open the same Session in Quipsly Capture on the iPhone, but keep provider
   call audio disconnected or muted. Use the phone as silent local 4K capture.
3. Start local phone video only after consent and source/profile confirmation.
4. A front/back camera change deliberately closes one local segment and starts
   the next in the same capture group. It is a recoverable angle boundary, not
   a hidden same-file mutation.
5. Record Insta360 and DJI microphone backups independently. Keep their original
   files and clocks intact for later alignment.

If Scott uses only the iPhone, it may own both the LiveKit conversation and
coordinated local source. Do not also leave laptop speakers or microphone live.
If he uses only the browser, retain a browser camera-plus-audio source. The
recommended Episode 9 configuration remains laptop call plus silent iPhone 4K.

## Preflight

1. Confirm both people can hear each other through headphones with no speaker
   echo and no second active call device.
2. Run **Test selected setup** on each browser. Confirm the named microphone,
   output, sample rate, channels, processing flags, frame RMS, and sample peak.
3. Speak at real episode intensity. Avoid clipping risk; do not chase a visual
   percentage. Capture-time dBFS is setup evidence, not LUFS or true peak.
4. Confirm the Episode Room shows the exact Swear Jar manuscript and the 4:14
   Ted Lasso proxy.
5. Confirm every recorder shows available storage, selected profile, consent,
   and a visible stopped state.
6. Start each isolated recorder, then make one spoken slate and a visible clap:
   episode, take, person, device, and local time. Repeat after any interruption.
7. Bind Shared Watch to the authoritative recording clock after the Session is
   visibly recording. A rehearsal clock is never recording evidence.

## During the episode

- Either editor may play, seek, or pause Shared Watch. Canonical HTTPS receipts
  remain the source of truth; LiveKit data is only the low-latency wake-up.
- Keep the laptop/browser call running while using the manuscript, episode
  thread, Watch, and timeline surfaces.
- Make an explicit mark before and after a camera switch, device-route change,
  interruption, or repeated answer.
- If a source fails, keep the other sources running when safe, state the failure
  aloud, recover the failed source, then slate again. Never delete a partial take.

## Stop and verify

1. Stop each isolated source before leaving the call.
2. Wait for exact-byte checksum and server verification; a closed browser tab or
   successful call is not upload proof.
3. Confirm every source remains in its local recovery ledger until verified.
4. Stop the Session, then leave the live room.
5. Sync watched spans to the Episode timeline and open the editor route above.
6. Verify source duration, waveform/audio evidence, camera-switch segments,
   Shared Watch spans, and sync proposals. Listen around each source boundary.
7. Preserve original iPhone, browser, Canon, Insta360, and DJI files. Any master,
   alignment, transcript, or automated edit is a versioned derivative.

## Release gates still open

- Production LiveKit Cloud project and environment-scoped secrets.
- Exact-SHA, zero-traffic Cloud Run preview with a real two-person browser join.
- Physical browser plus iPhone join, record, upload, and editor playback.
- Production media-vault CORS readback for exact Nest origins.
- A spaced TestFlight build containing this source evidence and hybrid capture UI.
