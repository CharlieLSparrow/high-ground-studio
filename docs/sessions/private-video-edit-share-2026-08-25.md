# Private video edit and share

Date: 2026-08-25

## Product decision

The Session recording editor can produce either an audio copy or a video copy
without moving the user to a separate Studio application. Video is a deliberate
format choice, not an automatic side effect of selecting a camera source.

The first qualified video layout is intentionally simple: one exact primary
camera supplies the picture while one preferred participant-owned audio source
per participant supplies the program sound. Dedicated local audio wins over
embedded camera audio. This avoids comb filtering, echo, and accidental double
gain while preserving every original as immutable source truth.

## Contract

`quipsly-session-recording-share-job-v3` is backward compatible with stored v1
and v2 audio work. A v3 target is a discriminated audio or video target.

- Audio remains AAC-LC, 48 kHz, stereo in an M4A container.
- Video is 1920x1080 H.264, yuv420p, constant 24 fps with AAC-LC 48 kHz stereo
  in an MP4 container.
- A video job names one exact selected `primaryVideoRecordingAssetId`.
- Every selected source declares whether it participates in the audio mix.
- At least one audio-program source is required.
- Cloud source and output locators remain exact-generation bound.
- Result duration must match the reversible kept-range decision.

Old audio manifests, results, and durable local receipts remain readable. New
receipts identify the media kind explicitly.

## Render and verification

The renderer aligns sources on the existing Session program clock. The video
track is padded black before its source begins and after it ends; missing camera
time is not represented as captured footage. It follows the same kept ranges as
the audio program. At each multi-range join, video removes the same bounded join
duration that audio uses for its short crossfade.

The worker verifies container duration, AAC sample rate and channel count, H.264
codec, 1920x1080 dimensions, 24 fps, yuv420p pixel format, and a complete decode
of both streams. Cloud output is uploaded with immutable receipt metadata and
then downloaded by exact generation for byte readback before completion.

## User experience

Browser and iPhone show Audio/Video only when a verified camera source exists.
Video asks for one primary camera and explains that dedicated microphones supply
the sound. Both clients retain the existing private-preview, guided listening,
explicit release, and revocation boundaries. The iPhone downloads the verified
bytes, checks SHA-256 and size, stores the temporary copy with complete file
protection, and uses the native video player.

Once the exact copy has passed its guided review, Capture also offers Export
reviewed video/audio. It reuses only those already verified protected bytes and
then opens the standard iPhone share sheet. A recipient sees that action only
after Session release. Quipsly does not choose a destination or claim who
received a file, and canceling the sheet changes neither the output nor any
original recording.

Capture keeps the normal card compact, but a collapsed **Verified copy
details** disclosure exposes the format, duration, file size, exact source
count, selected picture source, revision, and SHA-256 digest. This gives coaches
and support staff a concrete receipt when investigating a file or proving which
copy was reviewed without turning routine export into an administrative form.

Local-development playback uses the same byte-range behavior as cloud playback.
It validates the confined local object's generation, size, content type,
expected SHA-256 receipt, and Session-share lineage before opening a file
stream. It no longer buffers the complete output in the Nest process or rejects
realistic local video merely because the result is larger than 1 GiB. This is a
development-only path; production continues to stream the exact GCS generation.

## Local evidence

- Shared contract and cloud policy tests: 11 passing.
- FFmpeg/local/cloud worker tests: 7 passing, including a real generated camera
  plus separate microphone rendered and fully decoded as 1080p24 H.264/AAC.
- Session server and browser editor tests: 30 passing.
- Media processor typecheck and production bundle: passing.
- Quipsly typecheck: passing.
- Quipsly Capture dual-architecture Simulator build: passing.
- The native export control, account/release gate, exact-byte preparation, and
  standard share-sheet integration compile for both Simulator architectures.
- The collapsed native verification receipt compiles for both Simulator
  architectures while leaving the default review/export path unchanged.
- Four private-media route tests prove authentication, local byte-range video
  streaming, stale receipt rejection, and metadata-only HEAD behavior; strict
  Quipsly TypeScript passes.

These checks prove deterministic contracts and local executable behavior. They
do not prove physical-iPhone playback or share-sheet delivery, live Cloud Run
execution, human judgment of picture/sound sync, or cross-account release.
Those remain in the deferred validation ledger.
