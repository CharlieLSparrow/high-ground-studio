# Quipsly Studio audio spine architecture

## Decision

Mastered audio belongs in Quipsly Studio as a first-class derived source layer, not as a patched audio file dropped into a video export.

The editor needs to know three different truths:

- Raw synced sources: original Charlie, Homer, clip, call, and reference tracks remain immutable evidence.
- Mastered source spines: full-length derived audio files created from the synced sources, with provenance and QC.
- Final branch remasters: duration-safe remasters of an already-rendered edit, useful for deadline uploads but not canonical editing truth.

If these are blurred together, the app becomes hard to reason about. If they stay separate, the editor can move fast without becoming a monster in a trench coat.

## Product model

An audio spine candidate should have:

- `id`
- `episodeSlug`
- `kind`: `fullSourceMaster` or `branchRemaster`
- `scope`: source layer vs rendered branch
- `status`: candidate, selected, approved, deprecated, or deadline-safe-candidate
- artifact paths for WAV, M4A, MP3, muxed video when applicable
- duration, sample rate, channels, codec, and size
- source baseline id and transform/profile name
- QC report paths
- timeline mapping rules
- explicit safe and not-safe usage lists

## Editor rule

The editor should select an audio spine by registry id.

Full-source mastered spines can drive new edit branches because they share the episode sequence clock.

Final-branch remasters can be used for upload review or manual replacement of an already-rendered edit. They must not be silently treated as a full source spine unless a duration map exists.

## Immediate Episode 4 seam

The Episode 4 registry builder writes:

- `/Volumes/My Passport/Episode_and_Shorts_Test/Episode_4_Audio_Spine_Registry/episode4-audio-spine-registry.json`
- `/Volumes/My Passport/Episode_and_Shorts_Test/Episode_4_Audio_Spine_Registry/episode4-audio-spine-registry.md`

It also writes `LATEST_AUDIO_SPINE_REGISTRY.txt` pointers beside the baseline and upload packet.

This is intentionally small but durable: the app can read one normalized contract instead of learning every audio-workbench script output shape.

Current Episode 4 policy:

- v006 `episode4-full-source-master-v006-homer-preserving-clean` is the official machine-preferred candidate.
- v006 remains human-listen gated.
- v008/v009 are later full-source experiments, not silent replacements for v006.
- The v008 duration-safe 59:26 remaster is a rendered-branch artifact only.
- Branch rendering stays locked until a guarded human listen decision approves the selected source spine.

## Future app integration

The clean Swift integration should add:

- `AudioSpineCandidate` in the core model.
- `MediaSequence.audioSpineCandidates`.
- `MediaSequence.selectedAudioSpineCandidateID`.
- a Studio inspector panel that shows source-layer candidates separately from branch remasters.
- export logic that uses the selected full-source spine for program audio while preserving separate refined stems for timing-sensitive branch work.

Avoid using a generic audio lane as the final answer. A lane can display the selected spine for review, but the selected spine should remain explicit sequence metadata.
