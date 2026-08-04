# Audio treatment experiments

Date: 2026-08-04

Audio treatment in Quipsly is a source-bound experiment lane. It is not an
`enhance` toggle and it does not silently become the master. Every treatment
must be triggered by declared evidence, render separate bytes, independently
measure and diagnose those bytes, open in loudness-matched A/B review, and
remain unpromoted until a reviewer approves it.

## First qualified profile

`dc-rumble-correction-v1` is the first engine-qualified treatment profile:

- trigger: at least one complete-decode channel has absolute DC offset at or
  above `0.01`;
- operation: FFmpeg two-pole 20 Hz high-pass at Q `0.7071`;
- output: separate 48 kHz, 24-bit PCM WAV experiment;
- independent gate: absolute DC at or below `0.005`, at least 75% reduction,
  duration drift at or below 50 ms, complete output decode, equal channel
  count, and unchanged source SHA-256;
- exclusions: noise suppression, compression, de-essing, gating, silence
  removal, editorial cuts, delivery mastering, promotion, and publication.

The shared contract is
`packages/quipsly-media-processing/src/audio-treatment.ts`. It recomputes the
proposal from the source diagnosis, authorizes a deterministic target locator,
binds output measurement and diagnosis to the exact derivative bytes, and
fails closed if the claimed improvement cannot be reproduced.

The FFmpeg render is in
`apps/quipsly-media-processor/src/audio-mastering-ffmpeg.ts`. The same engine
that diagnoses the source diagnoses the output, but the two receipts have
different byte bindings and IDs. A successful experiment is explicitly not a
mastered delivery file.

## Neural speech enhancement decision

DeepFilterNet is the leading candidate for the neural-denoise experiment
provider because its official implementation targets full-band 48 kHz speech,
ships a command-line path, can compensate algorithmic delay, and publishes its
model and framework provenance. RNNoise remains valuable for live capture and
lower-complexity paths, but its official example operates on raw mono 16-bit
48 kHz PCM and is not a drop-in mastering workflow.

Neither provider is approved merely because it runs. Qualification requires a
versioned model digest, fixed resampling/channel policy, delay compensation,
speech-preservation and artifact benchmarks, transcript WER comparison,
source-to-output alignment proof, loudness-matched human review, and retained
podcast plus coaching examples. Provider output remains an experiment.

Primary references:

- [FFmpeg audio filters](https://www.ffmpeg.org/ffmpeg-filters.html)
- [DeepFilterNet official repository](https://github.com/Rikorose/DeepFilterNet)
- [DeepFilterNet full-band framework paper](https://arxiv.org/abs/2110.05588)
- [RNNoise official repository](https://github.com/xiph/rnnoise)

## Current delivery boundary

The local Nest vertical slice is qualified. It includes the contract,
deterministic target, leased `StudioAssetProcessingJob` execution, atomic
FFmpeg render, complete output diagnosis, independent verification, private
variant registration, queue/reconciliation UI, and same-playhead
loudness-matched audition.

On 2026-08-04 the UI imported and operated the retained test asset
`cmsecf2px0007q7xlyooqnys0`. Durable job
`audio_treatment_3076f60ac63d4242b55b23338a3324c3` completed with DC reduced
from `0.12` to `0.000008`, zero duration drift, complete output decode, and
independent source and derivative SHA-256 readback. Variant
`audio-treatment-preview` remained explicitly unpromoted and not a mastered
delivery file.

Explicit approval receipts, promotion policy, neural-denoise qualification,
and production cloud execution remain pending. This boundary is visible so a
qualified local workflow cannot be mistaken for a cloud-ready or
export-authorized treatment system.
