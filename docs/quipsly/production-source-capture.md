# Quipsly production source capture

Status: architecture decision and delivery contract
Last reviewed: 2026-07-26

Implementation checkpoint: the protected local ledger and canonical resumable
manifest now carry a backward-compatible `audio | video` media kind,
`captureGroupId`, exact source profile, and monotonic start/stop evidence. Old
audio ledgers and v2 upload manifests normalize to one-source capture groups
without gaining new processing authority. Camera capture UI is not enabled yet.

## Outcome

Quipsly records a low-latency **audio room** for conversation and one or more
independent, high-quality **production sources** for editing. The room keeps
people together. It is not the camera master and it must not silently become the
only recording.

A podcast episode may contain all of these sources:

- Homer: iPhone rear or front camera master, normally 4K HEVC;
- Charlie: Canon EOS R8 internal 4K master;
- Charlie: Shure MV7i local 24-bit/48 kHz audio master;
- LiveKit: participant audio tracks or an audio-only room composite;
- Episode Room: watched-clip playback segments and shared control receipts;
- optional clap, sync tone, or waveform anchors used by the editor.

A solo Short or YouTube recording is the same source system without a LiveKit
room. It is not a separate camera prototype.

## Research decisions

Apple's current AVCam architecture puts `AVCaptureSession` behind an actor
because configuration and startup block, and uses `AVCaptureMovieFileOutput` for
movie lifecycle. Apple supports front/rear camera switching by atomically
replacing the active input, but a normal capture session has only one camera
input at a time. `AVCaptureMultiCamSession` is a separate, device-constrained
pipeline.

- [Apple AVCam](https://developer.apple.com/documentation/avfoundation/avcam-building-a-camera-app)
- [Apple capture-session setup](https://developer.apple.com/documentation/avfoundation/setting-up-a-capture-session)
- [Apple movie-file output](https://developer.apple.com/documentation/avfoundation/avcapturemoviefileoutput)
- [Apple supported multicamera device sets](https://developer.apple.com/documentation/avfoundation/avcapturedevice/discoverysession)

The iPhone 16 TrueDepth camera supports 4K Dolby Vision at 24/25/30/60 fps. We
must still query formats on the actual device and never promise a profile that
the active camera, thermal state, free space, or current audio pipeline cannot
sustain.

- [iPhone 16 technical specifications](https://www.apple.com/iphone-16/specs/)

QuickTime movie fragments are required. Apple's default movie-file fragment
interval is 10 seconds; fragments keep a partially written file usable through
the last completed fragment after an interruption or crash.

- [Apple movie fragment interval](https://developer.apple.com/documentation/avfoundation/avcapturemoviefileoutput/moviefragmentinterval)

LiveKit remains the realtime audio transport. Its Swift audio manager owns a
WebRTC/voice-processing pipeline unless Quipsly explicitly takes over
`AVAudioSession`; LiveKit can publish audio without publishing video. Egress can
produce an audio-only room composite or individual/participant tracks.

- [LiveKit Swift AudioManager](https://docs.livekit.io/reference/client-sdk-swift/documentation/livekit/audiomanager/)
- [LiveKit Swift audio publication](https://docs.livekit.io/reference/client-sdk-swift/documentation/livekit/localparticipant/publish%28audiotrack%3Aoptions%3A%29/)
- [LiveKit egress](https://docs.livekit.io/transport/media/ingress-egress/egress/)
- [LiveKit participant egress](https://docs.livekit.io/transport/media/ingress-egress/egress/participant/)

The Canon EOS R8 is a useful call preview over USB, but Canon documents its
UVC/UAC output as 1920x1080 at 30 fps. That stream is not the 4K production
master. The first production workflow records 4K internally to the R8 card and
imports the original after recording. HDMI capture is a later supported source,
not an assumption.

- [Canon EOS R8 USB streaming](https://cam.start.canon/en/C013/manual/html/UG-08_Set-up_0270.html)
- [Canon EOS R8 HDMI time code and record command](https://cam.start.canon/en/C013/manual/html/UG-04_Shooting-2_0180.html)

The Shure MV7i is a production-capable 24-bit/48 kHz USB source and interface.
Quipsly should expose the actual selected input and format. It must never call a
browser/WebRTC processed track the local master.

- [Shure MV7i product specifications](https://www.shure.com/en-US/products/microphones/mv7i)

Large source files use the existing private-GCS resumable contract. Background
transfers must be file-backed; Apple documents that data/stream uploads do not
survive process exit in a background session.

- [Apple URLSession](https://developer.apple.com/documentation/foundation/urlsession)
- [Apple background transfers](https://developer.apple.com/documentation/foundation/downloading-files-in-the-background)

## Product modes

### Podcast room camera

- Join LiveKit with microphone audio only.
- Record local camera video without adding the camera microphone to the movie.
- Keep the room audio session and camera capture session under one coordinator.
- Write a visible source receipt before video bytes begin.
- Upload the video as an independent `LOCAL_VIDEO` source.
- Align it to CallRoom and Episode Room clocks in the cloud.

This mode avoids fighting over the one process-wide iOS audio session. It also
avoids baking echo-cancelled call audio into the camera master.

### Solo video

- No LiveKit room is required.
- Record one camera plus the explicitly selected microphone into a fragmented
  QuickTime source.
- Reuse the same local ledger, consent/attestation, resumable upload, source
  verification, proxy, and editor attachment path.
- Support both vertical and horizontal composition without forcing a crop into
  the immutable original.

### External camera participant

- Use the Canon's UVC stream only as the room preview when desired.
- Record the production master internally on the R8 at the chosen 4K profile.
- Record Shure audio locally on the Mac and publish a realtime copy to LiveKit.
- Import camera-card originals with a source manifest and sync anchors.

The mature Mac endpoint is a native Capture companion using AVFoundation and
the same ledger/upload protocol as iPhone. A browser-only recorder is a fallback,
not the master-source architecture.

## Camera switching

The first production release does not mutate the active camera inside one
immutable movie. Tapping **Switch camera** performs a controlled source boundary:

1. close and validate the current fragmented movie;
2. persist its stopped time and source-clock evidence;
3. atomically replace the capture input on the capture actor;
4. show the new preview and resolved quality profile;
5. arm a new source with the same `captureGroupId`;
6. resume recording only after the new source ledger is durable.

The Episode Room displays this as a short, honest camera-switch gap. The editor
stacks both files against the same recording clock. This is recoverable,
testable, and preserves original camera metadata. Seamless multi-camera capture
comes later through `AVCaptureMultiCamSession` only on devices and profiles that
pass a thermal/storage compatibility matrix.

## Source identity and clock contract

Every independent file has:

- `sourceId`: one immutable local/server source identity;
- `captureGroupId`: one participant's continuous recording intention;
- `callRoomId`, `participantId`, `projectSlug`, and `episodeSlug`;
- media kind, camera position/device unique ID, codec, dimensions, frame rate,
  color space, orientation, and audio-route evidence;
- device wall-clock start/stop and monotonic host-clock start/stop;
- CallRoom recording start receipt and accepted server time when available;
- source segments for pause, interruption, route loss, and camera switching;
- byte count, SHA-256, object generation, and verification receipt;
- proxy, waveform, transcript, and alignment jobs as derived records.

Wall-clock subtraction is a first placement, not final synchronization.
Alignment quality is explicit:

1. exact shared device clock;
2. server receipt anchor;
3. Canon/HDMI time code;
4. watched-clip command anchor;
5. clap/sync-tone or waveform correlation;
6. human-reviewed offset.

The editor stores the selected method, confidence, offset, drift correction,
input hashes, and reviewer. It never rewrites source bytes.

## Cloud/editor pipeline

```text
local source ledger
  -> file-backed direct resumable upload
  -> exact-byte verification receipt
  -> RecordingAsset LOCAL_VIDEO/LOCAL_AUDIO
  -> episode attachment
  -> proxy + waveform + technical probe
  -> alignment proposal
  -> human review when confidence is not exact
  -> non-destructive timeline placement
```

An upload receipt proves preservation only. Proxy readiness, alignment,
transcription, and editorial readiness remain separate states.

The current `RecordingAsset`, `MobileCaptureFinalizationReceipt`,
`MobileCaptureEpisodeAttachment`, Studio media, and Episode Room watch-segment
contracts remain the authoritative server path. A `captureGroupId` starts in
the immutable source manifest so video can ship without a destructive schema
rewrite; it becomes a relational indexed field only with an additive migration
and backfill/readback gate.

## Recording UX

The Record surface becomes a calm preflight followed by a minimal live screen.

Preflight shows:

- Session and episode destination;
- `Audio room` input/output and participant state;
- `Camera master` device, lens/position, resolved resolution/fps/codec, framing;
- `Audio master` device and resolved format;
- available recording time at the selected profile;
- consent for audio, video, and transcription as separate choices;
- exactly which sources will start.

The live screen always keeps these controls reachable:

- one large Stop control;
- Pause/Resume;
- Mute room microphone, which does not pause local video;
- Switch camera, which explains the source boundary;
- Mark moment;
- shared Episode Room Play/Pause;
- source timers, storage/thermal warnings, room reconnect state, and local-safe
  status using text and shape rather than color alone.

Failure copy starts with what is safe. A network failure never stops a healthy
local source. Thermal pressure, route loss, or storage pressure creates a
visible controlled boundary and never silently downgrades 4K to another profile
mid-file.

## Delivery order

1. Bind Episode Room to a server-validated CallRoom recording clock and repair
   iPhone episode routing. **Complete locally.**
2. Generalize the protected local source ledger and upload metadata from audio
   wording to typed audio/video sources without changing audio behavior.
   **Complete through simulator build and immutable-manifest tests.**
3. Add solo fragmented iPhone movie capture, front/rear choice, exact resolved
   profile display, storage/thermal interlocks, recovery, and upload.
4. Add podcast-room video-only capture alongside LiveKit audio.
5. Add controlled camera-switch source boundaries.
6. Add cloud technical probe, proxy, alignment proposal, and Episode Room
   readback.
7. Build the native Mac Shure master lane and Canon import manifest.
8. Run the physical-device and real-episode acceptance matrix before TestFlight
   scope expands to video.

No step is accepted from a simulator-only green build.
