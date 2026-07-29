# iOS Coordinated Podcast Capture

Status: implementation architecture
Owner: Quipsly Capture
Last reviewed: 2026-07-29

## Outcome

Quipsly Capture will add one **Podcast audio + video** mode for an iPhone that
is also participating in an audio-only LiveKit room.

One visible Start action creates two independent local production sources:

1. an AAC microphone master from the selected iOS input; and
2. a fragmented video-only MOV from the selected iPhone camera.

Both sources share one capture-group UUID. Each samples the same Nest/CallRoom
clock service near its own Start boundary and keeps its own source UUID,
server-clock burst, durable START/STOP evidence, wall clock, monotonic clock,
local file, recovery state, upload job, and editor lane. The LiveKit room
remains the conversation path and is not copied into either master.

This is a coordinated group, not a promise that two independent Apple capture
pipelines begin on the same sample. Quipsly records the real start difference
and proposes placement from clock evidence; waveform review remains the
authority for final synchronization.

## Why this topology

`AVAudioSession` is process-wide. Quipsly, CallKit, LiveKit, and the local
microphone recorder must use one explicit owner for category, mode, route, and
activation. Apple's `playAndRecord` category is intended for simultaneous
recording and playback, and `voiceChat` is the appropriate mode for two-way
VoIP. CallKit reports the point at which its audio session is active.

- [Apple: playAndRecord](https://developer.apple.com/documentation/avfaudio/avaudiosession/category-swift.struct/playandrecord)
- [Apple: voiceChat](https://developer.apple.com/documentation/avfaudio/avaudiosession/mode-swift.struct/voicechat)
- [Apple: CallKit audio activation](https://developer.apple.com/documentation/callkit/cxproviderdelegate/provider%28_%3Adidactivate%3A%29)

The camera session deliberately has no audio input in this mode. It therefore
does not compete for the microphone or bake the voice-processed call path into
the camera master. `AVCaptureMovieFileOutput` owns the video file lifecycle,
and a ten-second movie-fragment interval keeps a crash-interrupted movie usable
through its last completed fragment.

- [Apple: AVCaptureMovieFileOutput](https://developer.apple.com/documentation/avfoundation/avcapturemoviefileoutput)
- [Apple: movieFragmentInterval](https://developer.apple.com/documentation/avfoundation/avcapturemoviefileoutput/moviefragmentinterval)

The first implementation uses one camera at a time. Front/back Flip closes and
validates the current MOV, then opens the opposite camera as another source in
the same group. It does not introduce `AVCaptureMultiCamSession`, hidden
quality reduction, or an unverifiable in-file lens transition.

## Product modes after this slice

| Mode | Local audio | Local video | May remain in LiveKit room |
| --- | --- | --- | --- |
| Audio | separate AAC master | none | yes |
| Podcast audio + video | separate AAC master | video-only MOV master | yes |
| Podcast camera | none | video-only MOV master | yes |
| Solo video | microphone inside MOV | camera MOV | no |

Podcast camera remains useful when another device or recorder owns the audio
master. Solo video remains the simple camera-plus-microphone path for Shorts,
YouTube, and single-person recording without a live room.

## Capture-group invariants

- Allocate the capture-group UUID before either source is armed.
- Allocate a distinct source UUID for each audio or video file.
- Refresh the exact Session, actor generation, and audio/video consent before
  opening either source.
- Measure a Nest/CallRoom clock burst for each source using the shared group
  UUID; never copy one source's timestamps onto its partner.
- Durably enqueue each source START before its bytes may begin.
- Never describe the group as recording until both source controllers report
  recording.
- If one source fails during group startup, close and preserve the other source
  and explain the partial group in Library.
- Do not overwrite or delete a surviving source because its partner failed.
- Preserve local originals after verified upload.
- Keep provider join, leave, mute, and route transitions locked while the local
  audio-bearing group is recording, paused, or finalizing.
- A source resumes only after an online authority and immutable-owner refresh.

## Start sequence

1. User selects the exact Session and independently saves current audio/video
   consent choices.
2. User prepares and reviews the real camera profile and microphone route.
3. Quipsly allocates one capture-group UUID.
4. Quipsly refreshes the Session and owner generation.
5. Quipsly samples the room clock, starts the video-only source, and waits for
   the `AVCaptureFileOutput` start callback.
6. Quipsly samples the room clock again, then arms and starts the local
   microphone source with the same group UUID.
7. The UI changes to **Recording two local sources** only after both controllers
   report recording.

Starting video first avoids claiming a camera source before AVFoundation
confirms it. The microphone begins immediately afterward. Both source profiles
retain monotonic start nanoseconds, so the small measured start difference is
evidence rather than hidden drift.

## Pause, resume, mark, and Flip

- **Pause** pauses the AAC recorder and closes the current MOV. The honest
  pause gap remains.
- **Resume** refreshes Session/consent/owner authority, starts a new MOV in the
  same group, then resumes the AAC recorder.
- **Mark** writes a source-relative mark against the continuing audio master.
  Later editor projection may show it across all lanes in the group.
- **Flip** closes and verifies only the current MOV, prepares the opposite
  camera, and starts a new MOV in the same group. Audio continues, so speech is
  not intentionally cut merely because the camera changed.
- **Stop** requests both controllers to close. The group is complete only after
  each controller reaches a terminal saved or explicitly failed state.

## Failure behavior

The group is fail-visible and source-preserving:

- identity or consent loss pauses/closes both sources;
- microphone route loss pauses audio and closes video so the group cannot
  continue with a silently missing master;
- app backgrounding closes video under the existing iPhone camera policy and
  therefore closes the coordinated audio group too;
- critical thermal or storage pressure closes video and then audio;
- media-services reset closes audio and then video;
- an individual finalization or upload failure remains attached to its exact
  source and does not invalidate a verified partner;
- a partial group is visible in Library and requires deliberate editor review.

`AVCaptureSession` runtime errors and interruptions must be observed and
translated into this group state. Apple notes that excessive system pressure
can interrupt or stop camera capture.

- [Apple: capture runtime errors](https://developer.apple.com/documentation/avfoundation/avcapturesession/runtimeerrornotification)
- [Apple: capture system pressure](https://developer.apple.com/documentation/avfoundation/avcapturesystempressurestate)

## UX contract

The Record surface must make these truths obvious:

- **Two local masters** is the primary label.
- The selected microphone route and live meter remain visible beside the camera
  preview.
- The camera profile says **video only**.
- Live room state is separate and joining never starts recording.
- The single Start/Stop control operates the coordinated group.
- Pause, Mark, and Flip explain which source they affect.
- Saving may finish one source before the other; the app shows both.
- Library groups the sources by capture-group UUID without concatenating them.

The mode picker uses short labels for reachability but always exposes the full
mode name and detail to VoiceOver.

## Release and acceptance

This slice may become a TestFlight build only after:

- Swift compilation for the canonical simulator architectures;
- static contract coverage for distinct source/group IDs, shared clocks,
  video-only camera configuration, durable START-before-bytes, partial-start
  cleanup, group stop, pause/resume, Flip, and provider-control locking;
- deterministic UI coverage for mode selection, camera/mic truth, and the one
  group control;
- existing durability, account-isolation, privacy, and App Store checks remain
  green;
- no regression to Audio, Podcast camera, or Solo video.

It is production-qualified only after a physical iPhone proves:

- connected LiveKit conversation plus local AAC and video-only MOV;
- the intended microphone/headphone route before and during capture;
- real source playback and metadata readback;
- front/back Flip with continuous audio and separate video pieces;
- pause/resume, Mark, backgrounding, route loss, storage, and thermal behavior;
- upload/relaunch recovery and local-original retention;
- editor import, waveform review, drift review, and assembled playback.

Build 8 remains the honest rehearsal lane until this Build 9 candidate crosses
those gates.
