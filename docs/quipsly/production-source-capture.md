# Quipsly production source capture

Status: architecture decision and delivery contract
Last reviewed: 2026-07-27

Implementation checkpoint: the protected local ledger and canonical resumable
manifest now carry a backward-compatible `audio | video` media kind,
`captureGroupId`, exact source profile, and monotonic start/stop evidence. The
native camera core now resolves the actual front/rear format, records fragmented
MOV sources behind an actor, makes pause/switch explicit source boundaries,
closes room receipts across failures, storage, thermal, identity, and foreground
changes, and decodes each finalized track through EOF before upload eligibility.
Old audio ledgers and v2 upload manifests normalize to one-source capture groups
without gaining new processing authority. The long-source verifier, durable GCS
queue, scoped Cloud Run Job release, IAM/scheduler setup, and fail-closed Nest
capability are implemented and container-proved from committed source. Camera
capture UI remains disabled in environments where Nest does not advertise that
capability and until the physical-device acceptance gates exist.

Verified sources now project into one canonical episode-media boundary:
`StudioEpisodeProduction.productionJson.importedMedia`. New finalizations never
write imported media into `timelineJson`; existing timeline-owned rows remain
readable and are migrated without duplication on the next authorized episode
command. The Episode Room, editor API, media inventory, mobile session readback,
and native Mac catalog all consume the same merged projection. A byte-verified
video remains visible as **Proxying** and cannot enter shared Watch until a
registered playback derivative exists.

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

Riverside's current production model reinforces three decisions already present
in this architecture: record locally on each participant's device, preserve
separate high-quality participant tracks, and upload progressively with an
explicit completion state. Quipsly adds stricter source/proxy separation:
preserved originals remain immutable, while only registered derivatives may be
used for low-latency collaborative playback.

- [Riverside recording architecture](https://riverside.fm/blog/what-is-riverside)
- [Riverside progressive uploading](https://riverside.fm/blog/progressive-video-uploading)
- [Riverside recording product](https://riverside.fm/recording)

The current synchronous finalize request is intentionally limited to 2 GiB.
Long-form 4K removes that limit by moving full-generation SHA-256 verification
to a dedicated Cloud Run Job, not by extending an interactive HTTP request or
weakening exact-byte evidence. Cloud Run Jobs can be executed through the API,
accept per-execution argument/environment overrides, and support task timeouts
up to seven days. Until that worker is deployed and read back, a source above
2 GiB stays playable and protected on the iPhone in an explicit upload-held
state.

- [Google Cloud Run Jobs](https://cloud.google.com/run/docs/create-jobs)
- [Execute Cloud Run Jobs](https://cloud.google.com/run/docs/execute/jobs)
- [Cloud Storage checksum validation](https://cloud.google.com/storage/docs/data-validation)

The accepted state machine, queue receipt, IAM boundary, release sequence, and
acceptance matrix are in
[`long-source-verification-worker.md`](./long-source-verification-worker.md).

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

## Coordinated product architecture

This is one capture system with five explicit planes:

| Plane | Owner | What it is allowed to claim |
| --- | --- | --- |
| Episode control | Nest Episode Room | identity, access, consent links, participants, chat, prepared clips, shared commands, accepted server time, and capture status |
| Realtime conversation | Native LiveKit audio room | low-latency talk/listen state and a recoverable network-quality reference; never camera-master quality |
| Local production | Quipsly Capture on iPhone and Quipsly Studio on Mac | immutable camera/audio source bytes, actual device/format, device clock, interruptions, and local retention |
| Preservation | private GCS plus verifier job | exact object generation, byte count, digest, durable receipts, retries, and dead letter evidence |
| Editorial | Quipsly Studio | proxies, waveform correlation, drift model, reviewed alignment, transcript, and non-destructive timeline decisions |

The Episode Room coordinates the take; it does not record a 4K camera through a
web request. LiveKit carries the conversation; it does not replace the raw mic
or camera masters. Studio aligns sources; it never rewrites an original to hide
a clock or capture failure.

### Mac ownership decision

The production Mac path lives in **Quipsly Studio**, not in an additional
browser recorder or another legacy desktop shell.

Quipsly Studio owns two explicit native branches:

1. select and read back the exact Core Audio input and headphone output;
2. preserve the input as a local 48 kHz/24-bit PCM WAV through the production
   recorder graph;
3. publish a separate realtime copy through LiveKit's voice-communication
   graph;
4. render remote room audio to the exact selected headphone output;
5. keep realtime processing out of the local master;
6. write local-source and call-route events as separate durable receipts.

The branches intentionally share only the selected physical device and the
capture-group identity. Joining the room never starts the recorder, stopping
the recorder never leaves the room, and no LiveKit token is persisted. A
future single-tap/application-audio graph is allowed only if it can retain the
same failure isolation and raw-master proof. The current dual-client Core Audio
path must pass an MV7i long-take and route-loss rehearsal before it is described
as physically qualified.

LiveKit's Swift `AudioManager` exposes input/output device selection and manual
rendering/application-audio hooks. The web platform can enumerate devices, but
explicit output routing such as `AudioContext.setSinkId()` is not consistently
available across major browsers. That makes a browser useful as an Episode Room
controller and recovery call, but not the canonical MV7i owner.

- [LiveKit Swift AudioManager](https://docs.livekit.io/reference/client-sdk-swift/documentation/livekit/audiomanager/)
- [MDN device enumeration](https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices/enumerateDevices)
- [MDN AudioContext output selection](https://developer.mozilla.org/en-US/docs/Web/API/AudioContext/setSinkId)

The preflight must show `Shure MV7i` twice when selected: once as **Local mic
master + call mic** and once as **Call + headphones**. Core Audio and LiveKit
must expose the same exact device UID; matching names are not accepted. A
virtual MOTIV Mix route is explicitly rehearsal-only and can never prove a
direct MV7i path. A meter, ten-second record/playback check, negotiated sample
rate/channels, available disk time, concurrent-call check, and route-loss test
must pass before the physical path is qualified. Hardware monitoring remains
available at the MV7i; Quipsly must not create a delayed software sidetone.

### Canon R8 decision

The first supported Canon workflow has two distinct sources:

- **Canon R8 USB preview**: UVC 1920x1080 at 30 fps for framing and an optional
  call/backup reference. Canon documents that USB power is not supplied in this
  mode, so preflight must show external-power/battery evidence.
- **Canon R8 4K master**: record internally to the camera card, then import the
  untouched original into the active capture group with camera time, filename,
  byte digest, card/import receipt, and sync anchors.

Quipsly never labels the USB preview as 4K. HDMI capture becomes a supported
third source only after a named capture device, cable, negotiated 4K format,
storage throughput, heat, long-take, and dropped-frame matrix passes.

### iPhone ownership decision

For a podcast room, Quipsly Capture runs the native audio-only LiveKit room and
a local camera master in the same app, but the camera movie does not include
the echo-cancelled call microphone. Both pipelines share a coordinator for
consent, route changes, foreground interruptions, source receipts, and Stop.

For a solo video, no room is required and the selected microphone is included
in the local movie. Switching cameras closes one source and starts another in
the same capture group. It is a visible boundary, not a fake seamless file.

### Shared clip playback

Prepared watch media is a source, not merely pixels on two screens.

1. Nest materializes and probes the exact clip before the take.
2. An editor issues a revisioned `PLAY`, `PAUSE`, `SEEK`, or `ENDED` command.
3. The server records acceptance time and a stable receipt ID.
4. Each device applies the command against its monotonic clock and acknowledges
   the actual local media time, apply time, blocked/autoplay state, and error.
5. Every local recorder stores the receipt/acknowledgement as a source marker.
6. Studio initially places the watched clip from the server receipt, then
   refines participant sources with waveform correlation and a drift model.

Either authorized editor can always pause. A device that cannot play reports
`blocked` instead of pretending to be synchronized. The editor preserves the
source clip as its own track, including when the room itself is audio-only.

### Clock and drift contract

Each capture endpoint periodically records a four-time clock sample:

- device monotonic send;
- server receive/accept;
- server send;
- device monotonic receive.

The lowest-round-trip samples estimate the initial device/server offset. Source
sample timestamps and the capture session's AVFoundation synchronization clock
remain authoritative within a device. The alignment record stores offset,
uncertainty, measured drift in parts per million, method, source hashes, and
review state. A single wall-clock timestamp is never described as
sample-accurate.

Apple guarantees capture output timestamps on the capture session's
synchronization clock and provides synchronized-data and timecode APIs for
stronger local/external alignment.

- [AVCaptureSession synchronization clock](https://developer.apple.com/documentation/avfoundation/avcapturesession/synchronizationclock)
- [AVCapture synchronized data timestamp](https://developer.apple.com/documentation/avfoundation/avcapturesynchronizeddata/timestamp)
- [AVCapture timecode generator](https://developer.apple.com/documentation/avfoundation/avcapturetimecodegenerator)

### Failure and recovery UX

The live surface has independent state rows for `Room`, `Camera master`,
`Audio master`, `Watch clip`, and `Upload`. Network loss may degrade the room
and stop progressive upload, but it does not stop healthy local sources.
Device/route loss closes only the affected source. Stop is complete only after
each armed local source has a durable close receipt or a visible recovery task.

After recording, the room shows every participant/source as:

- safe locally;
- uploading with exact bytes;
- upload held/retryable;
- byte verified;
- attached to episode;
- proxy ready;
- aligned/review needed.

Nobody is told to leave until the application has either verified the source or
made the recovery location and next action explicit.

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
- `uploadSessionId`: one immutable resumable-transfer identity for exactly one
  file; retries reuse it, while a second audio or video file receives another;
- `captureId`: the actor-owned recording interval bound to the Episode Room's
  applied START receipt; every source intentionally recorded in that interval
  may share it;
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
  -> canonical episode source + attachment
  -> proxy + waveform + technical probe
  -> alignment proposal
  -> human review when confidence is not exact
  -> non-destructive timeline placement
```

An upload receipt proves preservation only. Proxy readiness, alignment,
transcription, and editorial readiness remain separate states.

`StudioEpisodeProduction.productionJson.importedMedia` owns canonical episode
source membership. `timelineJson` owns editorial placement only. Every released
capture is idempotently projected into:

- a canonical imported-media source with recording, upload, group, participant,
  consent, exact-byte, processing, transcript, proxy, and alignment evidence;
- a `StudioAssetAttachment` binding the source to its Episode Room;
- an immutable `MobileCaptureEpisodeAttachment` finalization ledger;
- a `StudioWorkflowJob` for either video proxy creation or audio registration;
- the `RecordingAsset` promotion result returned to the native client.

Legacy `timelineJson.importedMedia` remains read-through compatible, but it
cannot regain ownership. Identity is deduplicated across source, asset,
recording, upload, and storage-object evidence rather than by display name.
Video Watch admission is fail-closed until its proxy is registered and ready.

The current `RecordingAsset`, `MobileCaptureFinalizationReceipt`,
`MobileCaptureEpisodeAttachment`, Studio media, and Episode Room watch-segment
contracts remain the authoritative server path. A `captureGroupId` starts in
the immutable source manifest so video can ship without a destructive schema
rewrite; it becomes a relational indexed field only with an additive migration
and backfill/readback gate.

The canonical resumable contract now keeps transfer identity separate from
recording identity. Existing clients that omit `captureId` continue to default
it—and then `captureGroupId`—to `uploadSessionId`. Production multi-source
clients send a unique `uploadSessionId` per file and the same explicit
`captureId`/`captureGroupId` for the take. Nest accepts that shared identity only
when the manifest's room, actor, and capture ID exactly match the stored
room-readiness evidence; disagreement is normalized to preservation-only rather
than inheriting processing authority. The long-video verifier independently
preserves and validates the same distinct capture ID.

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
   iPhone episode routing. **Complete locally through an authenticated,
   room-authorized, side-effect-free four-time sample contract.**
2. Generalize the protected local source ledger and upload metadata from audio
   wording to typed audio/video sources without changing audio behavior.
   **Complete through simulator build and immutable-manifest tests.**
3. Add the solo fragmented iPhone movie core, front/rear resolution, exact
   source profile, storage/thermal interlocks, controlled pause/switch, complete
   stream validation, and upload handoff. **Core complete through simulator
   build and durability contracts; preflight/live UX, long-source worker, and
   physical-device proof remain.**
4. Add podcast-room video-only capture alongside LiveKit audio.
5. Add controlled camera-switch source boundaries.
6. Add cloud technical probe, proxy, alignment proposal, and Episode Room
   readback. **Canonical source projection, exact-byte status, transcript/job
   evidence, native/web source readback, and fail-closed Watch proxy gating are
   complete locally. The executable proxy worker and reviewed clock/drift
   alignment remain.**
7. Build the native Mac Shure master lane and Canon import manifest.
   **The Core Audio inventory, truthful route policy, crash-recoverable
   48 kHz/24-bit WAV master, SHA-256 source receipt, and Episode Capture Setup
   controls are complete locally. Camera-card originals now copy into managed
   storage without mutating the card, are independently rehashed, and attach to
   non-destructive editor lanes with durable receipts. Direct MV7i hardware
   qualification and the audio-only LiveKit branch remain.**
8. Run the physical-device and real-episode acceptance matrix before TestFlight
   scope expands to video.

No step is accepted from a simulator-only green build.

## Implementation checkpoint — July 26, 2026

The first coordinated Mac/iPhone source-clock slice is now implemented:

- Nest exposes an authenticated, CallRoom-authorized capture-clock sample
  route. It echoes device identity and brackets server work without persisting
  a false server-side source event.
- iPhone audio and video capture collect three bounded samples concurrently,
  retain the lowest-round-trip results with the immutable source profile, and
  continue recording with explicit missing evidence when Nest is unavailable.
- Quipsly Studio inventories exact AVFoundation camera IDs and Core Audio input
  and output UIDs. The policy distinguishes Canon's virtual webcam reference
  from a direct R8 route and distinguishes MOTIV Mix Virtual from a proven
  physical MV7i master.
- `Episode Capture Setup…` can write an untouched local microphone master to
  `~/Movies/QuipslyCaptures/<episode>/<recording-id>/`.
- The recorder writes `source-receipt.json` before starting, keeps
  `local-mic-master.partial.wav` after interruption, and only renames it to
  `local-mic-master.wav` after a clean stop. Finalization records actual frames,
  duration, bytes, device UID, wall/monotonic boundaries, and a streaming
  SHA-256 digest.
- Long-file hashing runs away from the UI actor. The setup screen shows elapsed
  time, finalization state, the verified receipt, capture-folder access, and
  preserved interrupted takes.
- Canon card import accepts multiple movie files in one capture group, writes
  an in-progress receipt before copying, preserves a partial on failure,
  verifies the managed copy with an independent second SHA-256 pass, probes
  duration/dimensions/frame rate/codec/audio/timecode tracks, and explicitly
  keeps the declared R8 model separate from proven byte identity.
- Finalized Mac audio and verified Canon copies attach to the active Studio
  source timeline through one core operation. The lane stores its source
  receipt, capture group, episode, ingest kind, hash, and `needs-alignment`
  state; a second durable receipt proves local editor attachment without
  claiming upload, proxy, sync, transcription, or publication.
- The Mac setup screen loads Episode Rooms from Nest through the authenticated
  native account and binds source, participant, and call identity to the
  selected authorized session. Recording for that room remains locked unless
  explicit participant consent, `canRecordNow`, and Nest's capture-readiness
  verdict all agree. Record performs one final Nest revalidation; a failed
  refresh or a room removed from the authorized catalog locks capture instead
  of reusing stale evidence or selecting another episode. Local-only /
  solo-source capture is a deliberate separate selection and never inherits
  Nest consent.
- Refreshing an existing room updates its readiness without rotating capture
  identity. Selecting a different room—or deliberately entering local-only
  mode—starts a new capture group while leaving already finalized source files
  and receipts untouched.
- Authorized Mac recording now uses a protected, owner-partitioned START/STOP
  outbox. The server-returned verified account, stable room/session IDs, and
  capture group are committed before the request leaves the Mac. Nest must
  persist and apply START before `AVAudioEngine` opens. Stop closes and hashes
  the WAV first, durably journals STOP, then synchronizes it; network failure
  cannot invalidate or delete the local source. Relaunch recovery writes the
  missing STOP for an orphaned START and replays each capture in START-before-
  STOP order. Corrupt canonical ledgers are copied aside and locked read-only
  instead of reset.
- A STOP closes that recording interval. The same group remains available for
  Canon/iPhone sources from the take, but the UI requires **New capture group**
  before another microphone recording so media cannot appear after a terminal
  STOP identity.
- Finalized Episode Room WAVs can enter an explicit canonical upload outbox.
  The per-file `recordingID` becomes its unique `uploadSessionId`; the take's
  `captureGroupId` is sent as both shared `captureId` and `captureGroupId`.
  Before every attempt, the Mac streams the file again and requires its exact
  size and SHA-256 to match the finalized source receipt. The app persists job
  phase and immutable binding, but never persists the secret upload capability.
  It accepts only private GCS HTTPS capabilities in production and same-origin
  loopback capabilities in debug, sends bytes from the file URL, consumes exact
  server verification/finalization evidence, distinguishes processing holds
  from byte verification, and always retains the local master.
- Studio launch no longer synchronously loads the external 11 MB audio waveform
  map or walks the large publication/delivery state graph. Both operations are
  deferred so an empty project opens responsively.
- The Mac agent `/state` boundary returns its immutable in-memory JSON snapshot
  before any optional short-export reconciliation. A stale short-export
  manifest on a sleeping external disk previously made real status reads time
  out. Reconciliation is now coalesced on a utility queue, generation-bound so
  an older task cannot retire a newer export, and merged into the freshest
  cached snapshot.

The current Mac hardware readback is deliberately not overstated:

- visible cameras: MacBook Pro Camera, EOS Webcam Utility, and the iPhone
  Continuity Camera;
- visible audio: MacBook Pro input/output, iPhone microphone, Microsoft Teams
  virtual audio, and MOTIV Mix Virtual at 48 kHz;
- not visible yet: a direct physical MV7i Core Audio route or a direct Canon R8
  UVC route.

Local verification passed:

- Quipsly TypeScript 7 typecheck;
- Quipsly contract suite: 95/95, including the Mac agent-state responsiveness
  and off-request reconciliation boundary;
- mobile-session canonical identity/readiness tests: 11/11;
- capture-clock route tests: 4/4;
- QuipslyVideoCore tests: 43/43, including writing and reopening an actual
  48 kHz/24-bit PCM WAV, proving that a MOTIV virtual-route receipt cannot
  claim direct physical MV7i provenance, importing a real playable MP4 without
  modifying it, matching independent source/destination digests, attaching the
  verified source to a provenance-bearing editor lane, decoding the Nest room
  projection, refusing inconsistent recording-readiness evidence, durable
  START/STOP recovery and quarantine, immutable canonical upload jobs, and an
  independent pre-upload file digest, and exact HTTPS Google Storage upload
  capability host validation, and a fully persisted verified-session recovery
  against exact mocked Nest identity, byte, and finalization evidence;
- HighGroundCapture unsigned simulator build;
- QuipslyMac unsigned debug build;
- real QuipslyMac launch, responsive main editor readback, and visual readback
  of the one-window Episode Capture Setup smoke mode.

The permission boundary was reached in an isolated copy of the exact Mac build.
The capture window rendered with route selectors, capture-group identity, local
master controls, and Canon import controls, but Codex Computer Use requested a
new macOS screen/audio inspection permission before it could drive the file
picker. The temporary app was terminated without accepting that permission.
The real-file importer and attachment path are core-tested; file-picker
automation and a physical MV7i recording/playback receipt remain human-present
acceptance gates, not claimed passes.
