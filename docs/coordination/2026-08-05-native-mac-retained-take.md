# Native Mac retained Episode 9 take

Date: 2026-08-05

## Outcome

The current-source, Apple Development signed Quipsly Mac app operated the
physically connected Shure MV7i and Canon R8 path as one local-only Episode 9
capture group. It finalized both sources, audited the exact bytes, atomically
saved and reloaded a two-lane Studio working session, and opened that session
in the editor. Nothing joined LiveKit, created a Nest START, uploaded, delivered,
or published.

Capture group:
`eb6b4641-1c34-48e7-b2ad-6efd63ccf372`

The selected routes were:

- Shure MV7i direct USB input and headphone output, two channels at 48 kHz;
- EOS Webcam Utility device
  `1E8F38ED-DE20-4458-A736-8DC95529E60F`;
- Canon internal recording guidance: 4K UHD at 23.98 fps, with the camera-card
  original remaining the authoritative picture master.

Three independently extracted EOS frames were visually reviewed before arm.
They showed a changing live R8 image rather than Canon's disconnected slate.
Quipsly therefore wrote an `agent-visual-review` signal receipt for the exact
selected device. A four-frame contact sheet from the finalized movie showed
the live picture continuing through the retained source.

## Exact retained sources

Audio master:

- path:
  `/Users/wall-e/Movies/QuipslyCaptures/episode-9/a9336d4f-c034-4493-aee6-1357a16392d3/local-mic-master.wav`
- PCM S24LE, 48 kHz, two channels;
- 12.300 seconds and 590,400 frames;
- 3,546,496 bytes;
- SHA-256
  `e53ea550b47d258aa75550e3c8f589afd618f47b3b5c4a38c3d8459c8a867325`;
- exact-route continuity remained locked through Stop.

Silent camera reference:

- path:
  `/Users/wall-e/Movies/QuipslyCaptures/episode-9/53e15a69-4128-4510-9d68-a6a41f10e452/local-camera-reference.mov`
- H.264, 1280 by 720, approximately 29 fps, no audio;
- 12.58631 seconds;
- 16,860,215 bytes;
- SHA-256
  `beda7fe9cb015f910fea6c3d5d2354bdd8d169dd1a284c7b72d0ce64523afb45`.

Fresh `stat`, `shasum`, and `ffprobe` reads matched both app receipts. The
app-owned take audit reported 20 passes, two warnings, zero holds, and
`machine-pass-human-review-required`. Video began 83 ms before audio, which is
a bounded first-placement clue rather than a reviewed synchronization decision.

The two expected warnings were honest:

- ambient audio was measurable but quiet at peak -34.3 dBFS and RMS
  -49.4 dBFS; a normal-spoken-level gain check remains mandatory;
- local-only mode contained no shared Nest clock burst, so waveform/opening cue
  and late-drift review remain mandatory.

## Durable editor handoff

The app atomically saved and reloaded:

`/Users/wall-e/Library/Application Support/Quipsly/MediaVault/sessions/capture-episode-9-eb6b4641-1c34-48e7-b2ad-6efd63ccf372-working.quipsly-session.json`

Readback preserved both capture lane IDs, source paths, capture group, project,
sequence, and offsets before **Open in Studio** became available. This proves
local source recovery and editor reachability, not a human proof-listen/watch,
reviewed sync, cloud handoff, transcript, delivery, or publication.

## Relaunch recovery repair

The canonical acceptance launcher exposed a real local-control-plane race. A
rapid normal-app to capture-app transition could leave `NWListener` failing
asynchronously with `Address already in use`; the previous server never
observed that state and therefore never retried.

`AgentServer` now observes listener state, exposes the state, last error, and
retry attempt in its projections, and retries with bounded exponential backoff.
The exact rapid relaunch reproduced the bind failure, reported retry attempt 1,
then made the new process the sole port-8080 listener and reached
`capture_setup_ready` with the real MV7i and EOS inventory. A delayed manual
launch is no longer required.

The strengthened launcher now requires both `agentListenerState=ready` and a
complete hardware inventory before it can pass. The signed Debug rebuild
(Team `585GUXMY5M`, CDHash
`01bce67463b92203d3343cd3d8d766025d98dc7c`) passed that launcher smoke and
all 120 XCTest cases plus four Swift Testing cases in QuipslyVideoCore.

## Remaining acceptance

The next real rehearsal should speak at episode intensity, listen through the
MV7i headphones, make a spoken slate and visible clap, record the Canon 4K/23.98
card master, and retain browser/iPhone sources in the same canonical Session
capture group. Then verify exact-byte upload, opening-cue placement, later drift,
assembled playback, and the full Canon master import. The direct sunlight in
this proof clipped part of the face, so exposure or light position should be
corrected before the episode.
