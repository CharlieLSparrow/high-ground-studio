# Quipsly production source capture

Status: architecture decision and delivery contract
Last reviewed: 2026-08-06

Implementation checkpoint: the protected local ledger and canonical resumable
manifest now carry a backward-compatible `audio | video` media kind,
`captureGroupId`, exact source profile, and monotonic start/stop evidence. The
native camera core now resolves the actual front/rear format from an explicit
4K/24, 4K/30, or endurance 1080p/24 intent, records fragmented
MOV sources behind an actor, makes pause/switch explicit source boundaries,
closes room receipts across failures, storage, process thermal state, camera
system pressure, identity, and foreground changes, and decodes each finalized
track through EOF before upload eligibility.
The finished MOV's actual encoded and presentation dimensions, rotation, codec,
frame rate, audio shape, and duration are persisted independently of the
negotiated camera profile. Material drift creates a visible upload hold without
damaging playback or relabeling the source. Library now watches video originals
through an app-owned AVPlayer surface instead of attempting audio-only playback.
Fixed portrait rotation has also been removed. Apple's device rotation
coordinator owns separate horizon-level preview and movie angles; the movie
angle and derived portrait/landscape shape are locked immediately before the
durable START receipt, preserved in source-profile schema v5, and compared with
the finished QuickTime track transform. Changing orientation requires a new
immutable source boundary rather than silently mutating one movie's semantics.
Old audio ledgers and v2 upload manifests normalize to one-source capture groups
without gaining new processing authority. The long-source verifier, durable GCS
queue, scoped Cloud Run Job release, IAM/scheduler setup, and fail-closed Nest
capability are implemented and container-proved from committed source. The
iPhone Record surface now exposes Audio, Solo video, and Podcast camera as
distinct modes with a real preview, front/rear selection, resolved profile,
storage estimate, source-specific consent, and explicit pause/switch
boundaries. This is simulator- and contract-qualified, not physical-camera
qualified; unsupported long sources remain visibly safe and upload-held.

Verified sources now project into one canonical episode-media boundary:
`StudioEpisodeProduction.productionJson.importedMedia`. New finalizations never
write imported media into `timelineJson`; existing timeline-owned rows remain
readable and are migrated without duplication on the next authorized episode
command. The Episode Room, editor API, media inventory, mobile session readback,
and native Mac catalog all consume the same merged projection. A byte-verified
video remains visible as **Proxying** and cannot enter shared Watch until a
registered playback derivative exists.

The next Capture-to-editor boundary is now implemented as an explicit guarded
materialization rather than an implied side effect of upload. It creates
deterministic source lanes, translates the canonical corrected transcript onto
reviewed source clocks, and maps a speaker to a camera only from unambiguous
participant identity. It preserves every unrelated human edit and appends a
replay-safe receipt. See
[`capture-take-materialization.md`](../architecture/capture-take-materialization.md).

The collaboration-proxy path is now executable rather than a placeholder:
released, exact-byte-verified video finalization creates a generation-bound
transactional workflow outbox, generation-bound manifest, and durable queue
receipt; a non-root FFmpeg Cloud Run Job creates an
immutable H.264/AAC fast-start MP4 without mutating the original; and Nest
reconciles the signed result into a proxy source, asset, variant, Nest
attachment, and canonical Episode Production projection. Episode Room and
mobile-session reads reconcile bounded completed work before rendering. The
worker release, least-privilege IAM, recovery scheduler, and exact-commit
materialization are implemented but must still be deployed and exercised
against a private GCS fixture before this checkpoint is called cloud-qualified.

The executable worker and operator contract are documented in
[`capture-proxy-worker.md`](./capture-proxy-worker.md).

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
- [Apple supported frame-rate ranges](https://developer.apple.com/documentation/avfoundation/avcapturedevice/format/videosupportedframerateranges)
- [Apple active format](https://developer.apple.com/documentation/avfoundation/avcapturedevice/activeformat)
- [Apple camera system pressure](https://developer.apple.com/documentation/avfoundation/avcapturedevice/systempressurestate-swift.class)

The production default is UHD 3840×2160 at exactly 24 fps. Selection examines
each advertised frame-rate range independently; it never infers support across
a gap or turns a 24 fps request into 30 fps. UHD wins over a larger 4K shape for
editor/platform interoperability, and an exact-cadence 1080p fallback remains
usable only with an explicit visible **intent not fulfilled** receipt. The
requested intent, resolved format, camera identity, and system-pressure level at
Start are retained with source-profile schema v5. Once Start is durable, quality
does not change inside that immutable movie. Serious pressure warns; critical
or shutdown pressure closes and preserves the source rather than silently
downgrading it. Physical iPhone qualification remains required for each camera
and profile.

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

The browser uses the same Session room and short-lived Nest token rather than a
second web-call product. External microphone and camera permission are separate,
the chosen route is previewed before join, and a device-scoped media identity
allows the same Quipsly participant to stay present on iPhone and Mac. Browser
conversation media is not yet a retained local master; that recorder remains a
separate production gate. See
[`quipsly-collaboration-session-model.md`](../architecture/quipsly-collaboration-session-model.md).

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

Riverside also distinguishes raw local tracks from aligned exports and uses a
scratch/reference recording to line up independently captured sources. Quipsly
keeps that distinction visible: provider-aligned media may be useful evidence,
but the local master remains immutable and an editor must approve the final
timeline placement from clock, waveform, and later-take drift evidence.

- [Riverside recording architecture](https://riverside.fm/blog/what-is-riverside)
- [Riverside progressive uploading](https://riverside.fm/blog/progressive-video-uploading)
- [Riverside recording product](https://riverside.fm/recording)
- [Riverside raw and aligned file formats](https://support.riverside.fm/hc/en-us/articles/5260131045917-Video-and-audio-file-formats-Overview)
- [Riverside scratch-track alignment](https://support.riverside.fm/hc/en-us/articles/10989462140445-Recording-in-person-while-sharing-devices)

Descript Rooms confirms that double-ended browser capture is a viable future
guest lane: it records separate participant audio/video files and progressively
uploads primary sources while retaining lower-quality cloud backups. Its
published quality is still device-, browser-, light-, load-, and
network-dependent, and Descript explicitly does not support Rooms on mobile.
Its recovery workflow may also require a person to replace a partial or backup
track and recheck alignment. Those constraints reinforce Quipsly's split:

- native Capture owns iPhone camera sources and recovery;
- native Quipsly Studio owns Charlie's exact local MV7i WAV, Canon master
  import, route identity, and capture-group receipts;
- Nest Episode Room owns the call, script, shared clips, collaboration, and
  visible source status;
- a future browser double-ended recorder may serve guests, but never silently
  replaces a direct device master or an editor-approved alignment.

- [Descript Rooms overview](https://help.descript.com/hc/en-us/articles/28800967976205-Get-Started-with-Descript-Rooms)
- [Descript Rooms recording quality](https://help.descript.com/hc/en-us/articles/23103533895309-Audio-and-Video-Quality-in-SquadCast-Recordings)
- [Descript stalled-recording recovery](https://help.descript.com/hc/en-us/articles/30176966037005-Recover-and-replace-stalled-Rooms-recordings)

The proxy worker follows two current cloud/runtime boundaries:

- Cloud Run Jobs are finite tasks, not HTTP services; timeout and retry policy
  belong to the job template.
- Cloud Storage generation preconditions provide the create-once and
  compare-and-swap boundary. A retry reads the immutable object already written
  by a prior execution instead of overwriting it.
- FFmpeg's `libx264` wrapper provides the H.264 encoding surface, and MP4
  `faststart` moves the metadata atom ahead of media data for collaboration
  playback.

- [Create Cloud Run Jobs](https://cloud.google.com/run/docs/create-jobs)
- [Cloud Run Job retries](https://docs.cloud.google.com/run/docs/jobs-retries)
- [Cloud Storage request preconditions](https://docs.cloud.google.com/storage/docs/request-preconditions)
- [FFmpeg codecs](https://ffmpeg.org/ffmpeg-codecs.html)
- [FFmpeg formats](https://ffmpeg.org/ffmpeg-formats.html)

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

The coordinated iPhone audio-plus-camera implementation contract is in
[`ios-coordinated-podcast-capture.md`](./ios-coordinated-podcast-capture.md).
It extends the source system below without muxing call audio into the camera
master or changing the immutable-source/editor-review boundary.

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

Once joined, the native room keeps an exact route lease over both selected
provider device IDs. A LiveKit device update re-reads the available and active
input/output IDs. If either selected device disappears or LiveKit moves to a
fallback device, Quipsly synchronously mutes the provider engine, leaves the
room, and writes a versioned `route-lost` receipt containing both expected and
observed IDs. It does not stop or rewrite an independently healthy local WAV;
the recorder's own failure and audit boundaries remain authoritative.

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
- `captureId`: one actor-owned recording interval bound to the Episode Room's
  applied START receipt;
- `captureGroupId`: the server-owned identity for one canonical Session
  encounter/take; every participant/device source intentionally recorded for
  that Session shares it while retaining its own actor-bound `captureId`;
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
6. evidence-reviewed offset, attributed to a person or authorized software
   agent.

The editor stores the selected method, confidence, offset, drift correction,
input hashes, and reviewer. It never rewrites source bytes.

Episode Room reads alignment through the versioned
`quipsly-capture-alignment-proposal-v1` contract. A generic source-workflow
state such as `ready-to-sync` is not alignment evidence. For every capture
proposal the room shows the group-relative offset, clock uncertainty, proposed
server start, and the still-open waveform, drift, and evidence-review gates. A
proposal that claims sample accuracy, omits review, or lacks a proposed start
is downgraded to **Evidence needed** instead of being displayed as ready.
Episode Room remains a review/readback surface; it cannot approve or lock the
proposal.

The editor owns the next state transition through
`quipsly-reviewed-source-alignment-v1`. Approval is accepted only when the
authenticated reviewer records:

- a non-negative timeline anchor against an exact attached audio spine;
- distinct stable source identities, upgraded to `sha256-pair` only when both
  hashes are valid SHA-256 values;
- explicit opening-event waveform correlation;
- a later comparison interval and signed residual drift measurement;
- explicit person review or authorized-agent qualification of a reversible
  placement, with reviewer identity, decision basis, inspectable evidence, and
  delegation scope;
- the original capture-clock proposal snapshot when one exists.

The receipt always says `sampleAccurateClaimed:false`,
`sourceBytesMutated:false`, and `timelineDecisionReversible:true`. Generic
`synced` writes, including AI suggestions, fail closed and direct the editor to
Guided Sync. The UI distinguishes these authenticated receipts from legacy
sync markers. Undo restores the exact prior source-sync packet; unsupported
history entries are preserved and routed to their dedicated recovery workflow
instead of being silently discarded.

## Cloud/editor pipeline

```text
local source ledger
  -> file-backed direct resumable upload
  -> exact-byte verification receipt
  -> RecordingAsset LOCAL_VIDEO/LOCAL_AUDIO
  -> canonical episode source + attachment
  -> proxy + waveform + technical probe
  -> alignment proposal
  -> evidence review when confidence is not exact
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
   stream validation, and upload handoff. **Core plus preflight/live UX are
   complete through simulator build, operated mode selection, and durability
   contracts; physical-device proof remains.**
4. Add podcast-room video-only capture alongside LiveKit audio. **Implemented
   behind source-specific current-consent and room-readiness checks; real
   simultaneous LiveKit/camera operation remains a physical-device gate.**
5. Add controlled camera-switch source boundaries. **Implemented as
   close/validate/re-arm within one capture group; real front/rear gap and
   alignment proof remain.**
6. Add cloud technical probe, proxy, alignment proposal, and Episode Room
   readback. **Canonical source projection, exact-byte status, transcript/job
   evidence, native/web source readback, and fail-closed Watch proxy gating are
   complete locally. A deterministic, uncertainty-bearing clock proposal now
   survives finalization and appears on web/Mac readback without claiming
   sample accuracy. Episode Room now renders the real proposal, offset,
   uncertainty, and open review gates instead of re-labeling generic
   `ready-to-sync` state as alignment. Authenticated, provenance-bearing
   approval and reversible undo are complete and dogfooded locally. Cloud
   execution plus waveform/drift review on real production media remain.**
7. Build the native Mac Shure master lane and Canon import manifest.
   **The Core Audio inventory, truthful route policy, crash-recoverable
   48 kHz/24-bit WAV master, SHA-256 source receipt, and Episode Capture Setup
   controls are complete locally. The selected macOS camera route now has a
   live native preview and can record an independently recoverable, silent
   camera-reference MOV in the same capture group. Camera-card originals copy
   into managed storage without mutating the card, are independently rehashed,
   and attach to non-destructive editor lanes with durable receipts. The native
   LiveKit audio-only runtime now selects exact Core Audio-matching provider
   IDs, continuously holds that route, and mutes/leaves with expected-versus-
   observed evidence instead of silently falling back. Direct MV7i hardware
   qualification, Canon internal-4K operation, and a real authenticated
   two-participant coexistence run remain.**
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
- New source profiles serialize clock dates as ISO 8601. Nest also decodes the
  already-shipped Swift v1 numeric reference-date format, so old protected
  recordings retain their original clock meaning instead of being discarded or
  silently reinterpreted.
- Finalization validates room, take, actor, and applied START receipt identity,
  selects the lowest measured network-RTT sample, projects the source's
  monotonic start onto accepted server time, and stores the recomputed offset,
  uncertainty, wall-clock discontinuity, and receipt boundary in the canonical
  Episode Production source record.
- Mobile Session and native Mac readback group valid proposals by
  `captureGroupId` and expose relative millisecond offsets from the earliest
  source. Finalization writes the same group projection back into every
  affected canonical Episode Production sync packet while leaving unrelated
  imported media untouched. The state is **Alignment proposal ready**, never
  `aligned`: waveform correlation, drift review, and explicit human approval
  remain hard gates.
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

- Quipsly TypeScript 7 typecheck and the complete Nest Jest run: 143 suites,
  680 runnable tests, with 26 environment-gated suites skipped;
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

## Implementation checkpoint — July 27, 2026 (reviewed alignment)

- Guided Sync now exposes a valid capture-clock proposal as evidence, including
  group offset, uncertainty, projected start, receipt-backed baseline identity,
  and an explicit **Use as rough anchor** action. It never auto-applies an
  offset.
- Sync clocks render millisecond precision. This was corrected after the real
  browser exercise exposed a 500 ms proposal visually collapsing to `00:00`.
- A source cannot become `synced` through the general status API. The dedicated
  approval action resolves the target and audio spine server-side and builds an
  authenticated immutable review receipt with source identity, optional clock
  proposal, waveform check, later-take drift measurement, reviewer, notes, and
  reversible placement.
- The persisted review reader validates the complete receipt instead of
  trusting optimistic status strings. Invalid hashes cannot claim an immutable
  pair, and incomplete or sample-accuracy-claiming packets do not receive the
  reviewed UI state.
- Undo now restores reviewed alignment, ordinary sync, AI suggestion, and spine
  state through a tested plan. Unsupported history is retained with an
  explicit recovery error instead of being popped while the UI claims success.
- The editor shell now stacks on phone widths, wraps operator controls, keeps
  Guided Sync full-width, and uses responsive evidence/proposal grids instead
  of clipping the main editor beside a fixed 256 px media rail.
- Local dogfood used a disposable two-source Episode Production row and a
  generated spine derived from the attached MP4. Browser operation copied the
  500 ms clock proposal, played both sources, paused both, completed the three
  review gates, persisted the receipt, reloaded it at desktop and 390 x 844,
  then undid it. Independent FFmpeg readback matched five decoded seconds
  exactly at the proposed offset; PostgreSQL matched the reviewed receipt and
  then the exact restored `ready-to-sync` packet. The disposable row and
  waveform were removed with zero-fixture readback.
- Focused alignment/undo/readback tests pass 19/19. The complete Nest run passes
  146 suites / 701 runnable tests with 26 suites / 71 tests environment-gated;
  strict Quipsly TypeScript, all 150 production-build routes, 107/107 Quipsly
  contracts, six release manifests, repository health, 13/13 changed-surface
  governance tests, and an exact eight-path Nest-only planner result. Cloud,
  physical hardware, and real-episode gates remain separate and are not implied
  by this checkpoint.

## Implementation checkpoint — July 27, 2026 (native Mac camera reference)

The Mac endpoint now records the production mic master and the camera reference
as separate local sources rather than baking a browser-processed call track
into either one:

- Episode Capture Setup displays a real `AVCaptureVideoPreviewLayer` for the
  exact selected macOS camera route before the take. Camera inclusion is an
  explicit opt-in and recording remains locked if that exact route cannot be
  prepared.
- The camera recorder chooses the best landscape format no larger than
  1920x1080/30, records no audio, writes five-second QuickTime fragments, and
  preserves at least 1 GB of free disk. `AVCaptureSession` configuration and
  startup run on a dedicated serial queue rather than blocking SwiftUI.
- An in-progress receipt is written atomically before `startRecording`. The
  partial MOV is retained after interruption and becomes
  `local-camera-reference.mov` only after AVFoundation's finish delegate,
  duration probe, byte count, and streaming SHA-256 succeed. A reused recording
  identity or any protected output-path collision fails closed; no older movie
  or receipt is removed. Recovery also finds a movie that was moved into its
  final path if the final receipt write did not complete.
- An authorized Nest START receipt is applied before either local source opens.
  The camera reference starts before the WAV so both delegate-confirmed
  monotonic starts can be projected from one capture-group origin. Stop begins
  both finalizations, closes Nest only after the local stop boundary, and
  attaches every successfully finalized source even when its partner needs
  recovery.
- The editor writes the measured per-source monotonic offset and labels a
  two-source pair `capture-clock-proposed`. The receipt explicitly says this is
  deterministic first placement, not content-level lip-sync, waveform/drift
  review, or proof of the Canon camera-card 4K master. A surviving single
  source remains `needs-alignment`. Non-finite offsets and stronger, unknown
  alignment labels fail closed rather than entering lane metadata or JSON.
- EOS Webcam Utility therefore remains a silent 1080 reference. The
  authoritative Charlie video source is still the internally recorded Canon R8
  4K file imported and independently hashed after the take. MOTIV Mix Virtual
  remains rehearsal-only until Core Audio exposes and the app operates the
  direct physical MV7i input/headphone UIDs.

Automated verification covers finalized receipt truth, interrupted-partial
discovery, capture-clock timeline placement, and the existing audio, route,
room-boundary, upload, Canon-import, and editor-attachment contracts. The
physical acceptance gate is still a human-present short take followed by MOV
and WAV playback/probe/hash readback, direct MV7i headphone monitoring,
Canon-card 4K import, waveform/drift review, route-loss recovery, and a
long-take rehearsal.

## Implementation checkpoint — July 27, 2026 (Mac camera cloud preservation)

The silent Mac camera reference can now cross the same canonical boundary as
the local WAV without inventing a second upload system:

- `MacCaptureUploadJobStore` owns one durable, account-partitioned source
  descriptor for audio and video. A finalized MOV is rechecked against its
  receipt size and SHA-256 before a private upload capability can be issued.
- Audio and video source receipts preserve the verified Nest account that
  owned the recording action. Local-only and historical receipts with no owner
  cannot be armed later merely because somebody is currently signed in.
- New upload jobs preserve the exact applied START receipt as immutable
  evidence. The Mac accepts Nest's create/recovery response only when its
  returned room-readiness START matches that receipt. Protocol-v1 jobs remain
  recoverable under Nest's existing server-owned capture binding, but the
  stronger evidence cannot be retroactively invented.
- The MOV job uses `video/quicktime`, `sourceType=video`, an independent
  per-file upload-session ID, the shared capture-group ID, exact participant,
  consent, room, device UID, negotiated dimensions/frame rate, monotonic
  boundaries, and explicit `includesAudio=false`. Orientation and codec remain
  unknown until probed; they are not guessed from the preview.
- Relaunch recovery handles every pending WAV and MOV job for the active
  account, not only the newest file. Source-specific progress, hold, retry, and
  verified states are shown beside the corresponding local master.
- Exact-byte verification projects the video into canonical Episode
  Production and queues eligible proxy work. The UI explicitly does not equate
  this with proxy completion, transcription, reviewed alignment, or
  publication, and it never removes the local MOV.

Canon camera-card originals now use the same outbox only when their import
receipt inherited immutable authority from a finalized WAV or MOV in the exact
same capture group:

- every non-nil companion-source binding must agree on capture group, episode,
  participant, verified account, CallRoom, consent, and applied START receipt;
  disagreement fails closed;
- the currently selected Episode Room is never used to authorize a historical
  card file;
- an import with no same-take binding stays visibly local-only and cannot enter
  the private-vault outbox;
- a room-bound MP4, MOV, or MXF is revalidated against its durable import
  receipt and exact managed-copy bytes before the upload job is armed;
- relaunch recovery distinguishes card masters from camera-reference MOVs and
  restores each card source's own progress, retry, hold, and verified state;
- card creation time is retained only as unreviewed metadata. The source
  profile intentionally has no clock samples, so Nest keeps it
  `needs-alignment` until waveform correlation, drift review, playback, and
  explicit human approval.

## Implementation checkpoint — July 27, 2026 (Mac capture-clock bridge)

The native Mac WAV and camera-reference MOV now enter Nest with the same
uncertainty-bearing capture-clock evidence as iPhone sources:

- After Nest applies the exact room START and before either media engine opens,
  Quipsly Studio sends a bounded three-sample authenticated burst to the
  room-authorized capture-clock endpoint. Every request carries the same room
  and capture-group identity that will own the media.
- Each accepted sample records device wall and monotonic send/receive
  boundaries, server receive/send boundaries, measured network round trip,
  estimated offset, uncertainty, and wall-clock discontinuity. The same
  immutable sample set is written to both the WAV and MOV receipts and upload
  source profiles.
- A clock-network failure does not destroy or block an otherwise safe local
  take. It leaves explicit missing evidence, so Nest keeps the source in
  waveform/drift review instead of manufacturing clock alignment.
- An account, room, or capture-group mismatch closes the accepted START and
  refuses to open local media. It never lets clock evidence cross an identity
  boundary.
- Receipt dates preserve fractional ISO-8601 milliseconds while retaining
  backward-compatible decoding of whole-second ISO and earlier Swift
  reference-date numbers.
- Monotonic nanoseconds use lossless decimal strings at the Nest JSON boundary.
  This avoids JavaScript precision loss on a Mac with more than roughly
  104 days of uptime; local Swift receipts still read both prior numeric and
  current string encodings.
- Nest validates the exact room, take, capture group, actor, and applied START,
  selects the lowest-RTT valid sample, and creates only an alignment proposal.
  Waveform correlation, drift review, playback, and explicit editor approval
  remain mandatory before a source may be called aligned.

Verification for the combined clock and Canon-authority checkpoint passes the
complete 61-test
`QuipslyVideoCore` suite, the signed QuipslyMac build, strict Nest typecheck,
and eight focused server-alignment tests including the long-uptime integer
boundary and the no-invented-sync Canon path. The signed build is
`com.highground.QuipslyMac`, Team `585GUXMY5M`. The physical gate remains
unchanged: macOS camera and microphone permission must be granted through the
visible Episode Capture Setup control, then an actual MOV+WAV take and a real
Canon card original must be recorded/imported, played, probed, hashed, and read
back in the Episode Room/editor.

## Implementation checkpoint — July 27, 2026 (take acceptance receipt)

Episode Capture Setup now has an explicit acceptance boundary after local
finalization. It does not turn a successful recorder callback or matching
filename into editorial approval:

- `Verify take` performs a fresh streamed SHA-256 and byte-count read of the
  finalized WAV and silent MOV, then opens both through AVFoundation rather
  than trusting extension or receipt metadata.
- The machine receipt checks finalized/no-partial state, exact capture group,
  episode, participant, account, room, consent, applied START, shared clock
  sample identity, monotonic boundaries, and bounded first-placement offset.
- The WAV must still be 48 kHz, 24-bit linear PCM with the receipted channel
  and frame count. The reference must still be one silent video track at the
  receipted dimensions and no more than 30 fps. Duration drift is held.
- Every audit writes a new, append-only JSON receipt under
  `Movies/QuipslyCaptures/_take-audits`; an existing receipt ID is never
  overwritten.
- A machine pass is labeled `machine-pass-human-review-required`. The screen
  still requires watching the complete reference, listening to the complete
  mic master, correlating a visible/audible event or waveform, checking
  end-of-take drift, and explicitly approving or revising timeline placement.
- Local editor placement from the shared monotonic clock is labeled
  `capture-clock-proposed`, never `aligned`. The former historical
  `capture-clock-aligned` input spelling is normalized to proposal state so it
  cannot bypass review.
- Missing clock samples produce a visible warning rather than invented
  precision. Changed bytes, cross-take sources, partial authority, divergent
  clock bursts, unreadable media, or format/duration drift hold the take while
  preserving its files.

The complete QuipslyVideoCore suite passes 65/65, including real WAV/MP4
inspection, append-only collision protection, post-receipt byte mutation,
cross-take identity, clock divergence, media-shape, and duration-drift
fixtures. The Apple Development signed QuipslyMac build also passes. This is
machine acceptance of fixture media, not physical-camera or MV7i qualification;
the real MOV+WAV operation and human watch/listen gate remain open.

## Implementation checkpoint — July 27, 2026 (protected reviewed placement)

The proposal-to-timeline boundary now refuses both silent replacement and stale
undo:

- Guided Sync approval and `Undo last sync` carry the exact persisted Episode
  Production revision shown to the reviewer. Missing and stale revisions return
  a conflict before any review state is changed.
- Any nonempty authenticated reviewed-alignment packet is protected, including
  a damaged packet that cannot be trusted for readback. A new approval requires
  first undoing the exact retained post-change snapshot.
- Undo compares the current source sync or spine decision against the complete
  recorded `afterSync` state. A later edit, replacement, or partial legacy
  history fails closed while leaving evidence intact.
- Writes use one revision-qualified database compare-and-swap that returns its
  own updated revision atomically. An unrelated later write cannot be
  misreported as the revision produced by the earlier review.
- Routine episode lookup no longer touches the production row when canonical
  title, document, and boundary metadata already match. Revision tokens now
  represent real aggregate changes rather than reads.

Focused behavioral proof passes 23/23, the route/client contract passes 3/3,
all 109 Quipsly safety contracts, strict Quipsly TypeScript, six release
manifests, and repository health pass; the complete Nest suite passes 150
suites and 722 runnable tests. The reusable alignment dogfood also passed through real
local Firebase Auth, Nest HTTP, and PostgreSQL: stable repeated reads, one exact
approval, stale approval/undo refusal, protected replacement refusal, exact
undo restoration, stale replay refusal, and zero-row cleanup readback. A real
Mac MOV+WAV review and two rendered-browser collision rehearsal remain
required; this local API/database proof does not satisfy either gate.

## Implementation checkpoint — July 27, 2026 (physical MV7i and camera-signal truth)

The signed production app has now operated a preserved local take with the
actual Shure MV7i connected:

- Core Audio exposed one direct USB `Shure MV7i` UID as both the 48 kHz input
  and headphone output, distinct from `MOTIV Mix Virtual`. The 19.3-second
  local master is mono, 48 kHz, 24-bit PCM; fresh SHA-256
  `e22e6a5c28e0fdd76f255f4d57da303fdebc008cb7e2e538ee5429cced76233f`
  and byte-count readback match its finalized receipt. Signal inspection
  measured peak -25.0 dBFS and RMS -52.0 dBFS, so this proves a non-silent
  direct-MV7i file but not production gain, headphone monitoring, or a long
  take.
- AVFoundation negotiated EOS Webcam Utility at 1920x1080/30 and wrote a
  19.56-second silent H.264 MOV with matching fresh SHA-256
  `63487734761f7ed28c2fe29559c0f76ad42b8af1a51a238abca43a01744e259d`.
  Three sampled frames all showed Canon's disconnected USB slate. The MOV is
  structurally valid and byte-verified but visually rejected; it is preserved
  as failure evidence and is not an R8-signal qualification.
- This exposed a production truth defect: camera format negotiation had been
  labeled “live.” Quipsly now separates negotiated transport format from a
  fresh, explicit moving-live-image confirmation tied to the exact camera
  device. Recording with an included camera reference is held until that
  confirmation exists.
- Camera receipt protocol v3 preserves the verification device, method,
  timestamp, and limited truth. The confirmation expires after five minutes,
  cannot cross a device change, and still does not replace start-to-stop
  visual review. Legacy v1/v2 receipts remain readable and produce a visible
  audit warning instead of retroactive proof.
- The machine auditor now passes an exact fresh confirmation, holds malformed
  v3 evidence, and warns on legacy missing evidence. UI copy says
  **Format negotiated** and **Byte-verified camera reference**; neither phrase
  claims usable pictures.

The next physical action is to make the R8 deliver a real image through its
reference route, visually confirm movement, record another short sync take,
listen through headphones connected to the MV7i, and repeat as a long take.
For the EOS R8, Canon's product manual requires **Setup → Choose USB connection
app → Video calls/streaming** before reconnecting the interface cable; that
native UVC/UAC mode is specified as 1920×1080 at 30 fps. Quipsly must see the
physical route and moving image after that change before the gate is approved.
The authoritative video remains the internally recorded R8 4K card original,
which must be imported, hashed, aligned, watched, and explicitly approved.

## Local microphone master continuity

Selecting a professional microphone once is not enough. The recorder must own
and prove that exact physical route until the last source frame has been
accepted.

The Mac recorder therefore has one fail-closed continuity loop:

1. Before opening media, resolve the selected Core Audio UID to its current
   `AudioDeviceID` and assign that exact ID to the recorder Audio Unit.
2. After `AVAudioEngine` starts, read the Audio Unit's current device and require
   the observed UID to equal the selected UID.
3. While recording, re-evaluate every 200 milliseconds and on every
   `AVAudioEngineConfigurationChange`.
4. Require the selected UID to remain in Core Audio inventory, the active Audio
   Unit UID to remain exact, the engine to remain running, the writer to remain
   healthy, and frame count to advance within three seconds.
5. Re-run the same check immediately before a deliberate Stop. Only an exact,
   locked result may be finalized.

Any failure closes the writer and preserves
`local-mic-master.partial.wav`. The version-2 receipt records
`state=interrupted`, expected and observed UIDs, a typed continuity reason,
monotonic stop time, frame count, byte count, and a streamed partial-file hash
when the bytes remain readable. The failure path never renames the partial file
to `local-mic-master.wav`, never attaches it as an accepted editor lane, and
never arms canonical upload.

The capture coordinator also stops a paired camera reference, closes any active
Nest recording boundary, and presents one explicit safety hold. A manual Stop
that races route loss is resolved from the recorder's interrupted receipt, so
the UI cannot fall through to a misleading local-only **finalized** message.

The take auditor treats locked version-2 continuity as a required pass. A
version-1 receipt predating this evidence remains readable with a warning;
version 2 with missing, mismatched, or lost evidence is held.

This design is grounded in Apple's documented
[engine configuration-change notification](https://developer.apple.com/documentation/foundation/nsnotification/name-swift.struct/avaudioengineconfigurationchange),
[Audio Unit current-device property](https://developer.apple.com/documentation/audiotoolbox/kaudiooutputunitproperty_currentdevice),
and [Core Audio device inventory](https://developer.apple.com/documentation/coreaudio/kaudiohardwarepropertydevices).
Names, format negotiation, and route availability are useful UX facts but are
not continuity proof.

Current implementation evidence is 80/80 QuipslyVideoCore tests plus complete
signed Debug and optimized Release builds. A real direct-MV7i take remained
exact through normal Stop and finalized at 657.7 seconds as mono
48 kHz/24-bit PCM. Fresh probe, byte count `94,712,896`, and SHA-256
`5649fb0b7ed4167e6c560e09b54cd53e6c6943e77705a665c05e4279b1cfcd2d`
match the version-2 receipt; mean signal was -45.9 dBFS and peak was
-11.4 dBFS. A second armed take exposed live frame count, bytes written, and
exact-route status once per second, remained exact for 558.5 seconds, and was
stopped normally when no human unplug arrived.

The optimized signed Release is installed at
`/Users/wall-e/Applications/Quipsly Studio.app` with Team `585GUXMY5M` and
CDHash `4dc81468d7ef3e7261c99aaa3e60b5db5d6541f6`; its predecessor is preserved
under `/Users/wall-e/Applications/Quipsly Builds`. That exact installed app
completed a fresh five-second route-locked smoke whose 724,096-byte receipt,
48 kHz/24-bit probe, and SHA-256
`0ffe2fe4b900e414354bbcbf23e4020c7d229746d4e2b8bff21b0dddafdba1f6`
all match.

The deliberate unplug, interrupted-receipt readback, reconnect, and subsequent
clean finalization are still mandatory physical gates. Re-arm the take only
with a human ready at the MV7i cable; never substitute a software simulation for
this acceptance result.

## Implementation checkpoint — July 28, 2026 (audio-only take acceptance)

The Mac capture path can now audit a real podcast or coaching microphone master
without requiring a camera source that the creator did not enable:

- **Verify take** chooses the source-pair auditor when a finalized camera
  reference exists and the audio-only auditor when it does not. A camera remains
  optional for audio-first work; every enabled camera source must still finish
  before a mixed take can be audited.
- The audio-only receipt freshly re-reads byte count and SHA-256, opens the WAV
  through AVFoundation, checks 48 kHz/24-bit PCM shape, frame-derived duration,
  measurable signal, exact selected-route continuity, monotonic start/stop,
  complete-or-absent Episode Room authority, and room/clock identity when the
  source is room-bound.
- Digital silence, changed bytes, unreadable or malformed media, incomplete
  authority, lost route continuity, malformed current-protocol evidence, or
  cross-room clock samples hold the take. A measurable but quiet source warns
  rather than being mislabeled as either silent or production-ready.
- Each result is append-only at
  `_take-audits/<episode>/<capture-group>/audio-take-audit-<uuid>.json`.
  Machine success remains `machine-pass-human-review-required`; it never becomes
  a headphone listen, transcript, alignment, creative, or publication approval.
- The launch-only acceptance endpoint now exposes `sourceMode=audio-only` or
  `audio-video` and rejects an unavailable audit as
  `audit-rejected-no-finalized-source`, matching the user-visible model.

The Apple Development signed Debug app operated the physical direct-USB Shure
MV7i as both exact input and exact output and created capture group
`16788cfb-f945-4439-8522-78c57a4604c4`. Its preserved master is
`/Users/wall-e/Movies/QuipslyCaptures/high-ground-odyssey/267f1bc0-a802-44a6-b792-dbe6496c2e00/local-mic-master.wav`:

- 29.600 seconds, mono 48 kHz 24-bit PCM
- 4,266,496 bytes
- SHA-256
  `58a3c04e0e76db1d9fec7c45b5d0c444df7c99c10bc42516373457fabbc1a259`
- exact-route continuity locked through the stop boundary
- measurable but quiet signal: peak -35.8 dBFS and RMS -53.3 dBFS

The app itself wrote
`audio-take-audit-2e83b391-9f1b-4671-8313-82a3d5489ee7.json` with eleven
passes, one warning, zero holds, and disposition
`machine-pass-human-review-required`. Independent `shasum` and `ffprobe`
readback match the receipt. The signed build has Team `585GUXMY5M` and CDHash
`10145cb16ce5ff4c36c5e7d790bdd466c03ac6b0`.

Focused take-auditor verification passes 11/11, including deterministic quiet
signal, digital silence, append-only collision, byte mutation, room-bound clock
identity, divergent clock, and mixed-source identity/shape cases. The complete
QuipslyVideoCore suite passes 84/84 and the full signed Mac app builds.

This was an ambient/quiet source operation, not a spoken production gain test
or proof-listen. Listening start-to-stop through headphones connected to the
MV7i, confirming intelligible speech and usable gain, deliberate physical
unplug/recovery, a real Episode Room, participant comparison/drift, Canon R8
live image, and final human accept/hold/replace remain mandatory.

## Implementation checkpoint — July 30, 2026 (durable Mac capture projection)

Operating the current-source Mac app exposed an ownership race in its local
agent read model. Episode Capture Setup published exact route and take state
through the shared `/state` cache, while the main editor independently
published its own projection every few hundred milliseconds. The editor could
therefore overwrite capture truth before a caller observed the acknowledgement
from `capture_refresh_hardware`, even though the capture window had handled the
command correctly.

Capture now owns an independent, loopback-only `GET /capture_status`
projection. It contains the exact available and selected input, output, and
video device IDs; manufacturer, channel topology, default-route flags, and
sample rate; authorization; preview negotiation versus explicit
live-signal verification; local-only authority; active/finalized receipt
summaries including exact PCM shape; and take-audit disposition. Main editor
updates cannot overwrite it.
The endpoint does not add capture authority: start, stop, and audit commands
remain registered only in the explicit `--episode-capture-setup-only`
acceptance launch mode, which cannot answer privacy prompts, join a room,
create Nest boundaries, upload, deliver, or publish.

The canonical operator entrypoint is:

```bash
apps/QuipslyStudio/script/studioctl.sh launch-capture-acceptance --no-build
apps/QuipslyStudio/script/agentctl.sh capture-status
apps/QuipslyStudio/script/agentctl.sh capture-refresh-hardware
```

The strengthened launcher smoke reads normal editor state between two capture
reads and requires the capture projection and capture-group identity to remain
stable. The launcher also refuses to qualify while any noncanonical Quipsly
binary is running, so a receipt cannot be attributed to an installed archive
or older worktree build.

The signed current-source app then operated the directly connected Shure MV7i
as both exact input and output. Capture group
`109299d3-3511-4e36-bb2d-1f14a71c3ae5` produced:

- a 19.7-second two-channel 48 kHz, 24-bit PCM WAV;
- 5,677,696 bytes;
- SHA-256
  `ec169ed9601a5cc78d755d60d015ec84570293e1871f8cd8f2c277aea9580ca6`;
- exact selected-route continuity through final stop;
- eleven audit passes, one quiet-signal warning, and zero holds.

Fresh analysis measured a real but quiet signal at peak -49.8 dBFS and RMS
-68.6 dBFS. The disposition is therefore correctly
`machine-pass-human-review-required`, not production approval. EOS Webcam
Utility separately negotiated 1920x1080 at up to 30 fps, but Quipsly retained
`cameraSignalVerified=false`. A window-only readback of the real Quipsly
preview showed Canon's **EOS Webcam Utility** placeholder rather than a live
R8 image, so the app correctly refused to arm a camera reference. Format
negotiation is not evidence that the camera is awake or producing a moving
image.

Independent `ffprobe`, `stat`, and `shasum` readback confirmed PCM S24LE,
48 kHz, two channels, 19.700 seconds, 5,677,696 bytes, and the same SHA-256.

This closes durable route/take readback and another real direct-MV7i local
operation. Spoken gain, complete headphone proof-listen, a repaired and live
Canon USB-streaming path, camera recording, deliberate route-loss recovery, Episode Room authority,
cross-participant sync/drift, and final human acceptance remain open.

## Implementation checkpoint — July 30, 2026 (durable Capture-to-Studio handoff)

Real operation found that verified capture lanes were previously durable only
as source files and receipts. Their attachment to the active editor project was
in-memory, so relaunching Quipsly could display an empty project and make a safe
take appear lost from Studio.

The Capture surface now:

1. derives one stable working-session name from the Episode Space and capture
   group;
2. atomically saves the current `NativeEditorSession` through
   `LocalMediaVault`;
3. reloads the written session immediately;
4. requires the same project and active sequence plus exact capture-lane IDs,
   source paths, proxy paths, roles, offsets, media shape, fingerprints,
   receipt paths, capture group, Episode Space, ingest kind, alignment state,
   and source labels;
5. writes the verified session name as the normal Studio recovery target; and
6. enables **Open in Studio** only after that verification passes.

The failure state never changes source bytes or receipts. It says the lanes are
available only in the current process and exposes **Retry durable handoff**.
The loopback acceptance command `capture-open-editor` fails closed until a
verified working session exists.

The signed current-source app then captured a real local-only A/V pair under
capture group `43c53e60-8d6f-466f-aed7-62ced70b110c`:

- MV7i audio:
  `/Users/wall-e/Movies/QuipslyCaptures/hgo-macbook-av-durable-20260730/857f0a40-0342-42ae-90cc-61f9e9e097c7/local-mic-master.wav`;
  9.8 seconds, PCM S24LE, 48 kHz, two channels, 2,826,496 bytes, SHA-256
  `c65fa4a06f5b13831f40c1658df239ba52d5af8d7faec67fe4755eeb46d65e6b`.
- Built-in-camera reference:
  `/Users/wall-e/Movies/QuipslyCaptures/hgo-macbook-av-durable-20260730/3455b54d-924c-4d14-9094-ec05f3d7f74a/local-camera-reference.mov`;
  10.167770 seconds, silent H.264 1920x1080 at approximately 30 fps,
  24,824,457 bytes, SHA-256
  `cb7669f20a2fff68698bff337e488e5210e7fec744a9e4801a16094037069e98`.
- The camera began first; the audio lane retained an exact
  `0.07064375`-second offset.

The app-owned audit wrote
`/Users/wall-e/Movies/QuipslyCaptures/_take-audits/hgo-macbook-av-durable-20260730/43c53e60-8d6f-466f-aed7-62ced70b110c/take-audit-f5439388-7bea-4478-b63c-5b940fe413a6.json`.
It reported zero holds and two warnings: quiet ambient audio (peak -57.1 dBFS,
RMS -70.5 dBFS) and no shared capture-clock samples in local-only mode. Its
disposition is `machine-pass-human-review-required`.

The verified working session is:

`/Users/wall-e/Library/Application Support/Quipsly/MediaVault/sessions/capture-hgo-macbook-av-durable-20260730-43c53e60-8d6f-466f-aed7-62ced70b110c-working.quipsly-session.json`

Studio opened that exact session, generated an AAC audio proxy and a 960x540
H.264 video proxy, retained both immutable originals, added an explicit SHOW
decision to each lane, displayed the recorded frame in Program Output, and
advanced the playhead during edit playback. After a full app quit and relaunch,
it recovered the same two lanes, proxies, SHOW decisions, source offset, and
Program Output; playback advanced again after proxy validation converged.

This is machine/operator evidence of durable local recovery and playback state.
It is not a human proof-listen/watch or reviewed synchronization decision. The
audio was intentionally quiet, the camera was the built-in MacBook camera
rather than the R8, and no Episode Room, Nest boundary, upload, transcription,
delivery, or publication was involved.

The production transcription continuation is specified in
[capture-transcript-worker.md](./capture-transcript-worker.md). It preserves
the same immutable recording identity through background processing, Nest
correction, stable word anchors, and a fail-closed QuipslyStudio import.

## Implementation checkpoint — August 5, 2026 (R8 and MV7i retained Episode 9 take)

The signed current-source Mac app operated the direct Shure MV7i and EOS Webcam
Utility as one local-only Episode 9 capture group. It finalized a 12.300-second
stereo 48 kHz/24-bit WAV and a 12.586-second silent 1280x720 H.264 reference,
freshly re-read both byte counts and hashes, wrote a zero-hold take audit, and
atomically saved/reloaded the exact two-lane Studio session before opening it in
the editor. The camera carried a fresh `agent-visual-review` receipt after three
changing live frames proved the exact route was not Canon's disconnected slate.

The audio was ambient and quiet rather than a spoken gain test, and local-only
mode had no shared clock samples. The disposition therefore remains
`machine-pass-human-review-required`; waveform, late-drift, proof-listen/watch,
Canon 4K/23.98 camera-card import, and physical browser/iPhone Session operation
remain open.

The same operation exposed and repaired an asynchronous loopback-listener race
during rapid canonical relaunch. Listener state, last error, and retry attempt
are now observable, and bounded exponential retry recovered from the reproduced
port-ownership transition without a manual delayed launch. Full evidence is in
`docs/coordination/2026-08-05-native-mac-retained-take.md`.
