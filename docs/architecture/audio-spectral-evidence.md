# High-resolution audio spectral evidence

Date: 2026-08-04
Status: local production lane implemented and operated on retained podcast and coaching media

Quipsly's high-resolution spectral view is a source-bound evidence system, not
an image export and not an automatic equalizer. It lets a reviewer inspect
time, frequency, and relative energy on the same clock as playback,
transcription, mastering, treatment experiments, and future edit proposals.
The immutable recording or import remains source truth.

## Why this is a tile pyramid

A single episode-sized spectrogram is either too coarse to diagnose a short
event or too large to move through a browser efficiently. Quipsly performs one
complete native decode into five-second detail tiles, then deterministically
max-pools those tiles into 30-second browse and 300-second overview levels.
Max pooling retains a narrow high-energy transient that averaging could erase.
No coarser level decodes the source a second time.

Each tile is a 512 by 192 `gray8` intensity plane with:

- a logarithmic frequency axis from 20 Hz to 47.5 percent of the decoded
  sample rate;
- high frequencies at the top and low frequencies at the bottom;
- a Hann analysis window and logarithmic magnitude display;
- a declared -120 to 0 dBFS visualization range;
- mono analysis downmix while preserving the original channel count in the
  media receipt.

The client colors the intensity plane at render time. Colors are presentation,
not stored evidence, which allows the accessibility palette to evolve without
invalidating the analysis receipt.

## Durable contract and storage

`packages/quipsly-media-processing/src/audio-spectral-evidence.ts` owns the
strict job and result contracts. A result is valid only when it preserves:

- the exact project, asset, source generation, source SHA-256, and byte size;
- deterministic level order, tile counts, byte offsets, and total pack size;
- the analyzer version and complete-decode declaration;
- the tile-pack locator, SHA-256, byte size, and generation;
- the original-source and review boundaries.

The processor writes a fixed-offset `.qspx` pack in overview, browse, detail
order. `StudioAssetProcessingJob` supplies durable queueing, leases, retry,
terminal failure, and output-ready registration. The worker hashes the source
before and after analysis and independently hashes the completed pack. Nest
rechecks both source and pack before changing `output-ready` to `completed`.

The final partial five-second interval is never dropped. FFmpeg can emit either
the floor or ceiling number of frames for a fractional tail; when it emits only
complete intervals, Quipsly separately decodes that exact tail with
`showspectrumpic` and appends one verified tile. Any other count fails closed as
source-clock drift.

## Access and UX

The public status projection excludes source paths, pack paths, source hashes,
pack hashes, requester identity, and lease details. Authenticated tile requests
name only a project, attached asset, completed job, level, and bounded tile
index. The server resolves the private pack and fixed byte offset; the caller
cannot supply a path or offset.

The shared `SpectralEvidenceViewer` is present in:

- the Episode editor's full transcript and audio desk;
- the coaching Session transcript-correction desk when its protected playback
  source resolves to an asset attached to that exact coaching project.

It provides whole-source, one-minute, and ten-second views, a keyboard-operable
shared playhead, click-to-seek, and double-click-to-listen. The UI explains that
a visible pattern is a listening target rather than proof of a fault or an
instruction to process the audio.

## Automation boundary

This lane may automatically decode, measure, tile, verify, and surface
candidate evidence. It does not automatically denoise, equalize, compress,
de-ess, remove a breath, cut video, replace transcript words, or promote a
derivative. A future detector may annotate likely hum, plosive, clipping,
sibilance, or room-tone regions, but a treatment still requires an explicit,
versioned experiment with loudness-matched A/B playback and a human-reviewable
receipt.

## Current proof

The retained operation generated and reverified:

- High Ground Odyssey `Ted Lasso Be Curious.mp4`: 254.630023 seconds, 44.1 kHz
  stereo, 61 tiles, 5,996,544-byte pack;
- retained coaching continuity WAV: 80 seconds, 8 kHz mono, 20 tiles,
  1,966,080-byte pack.

Rendered signed-in browser operations fetched all three levels in both Studio
and coaching, moved the shared source clock, found no horizontal overflow or
browser exceptions, and performed no external action. The retained media and
completed receipts remain available for regression work.

## Next qualified layer

1. Put transcript words, word confidence, corrections, discontinuities,
   mastering measurements, and treatment observations over this same zoomable
   clock.
2. Add deterministic spectral candidate detectors with a labeled evaluation
   corpus and false-positive reporting.
3. Add source/candidate difference views and loudness-matched A/B playback.
4. Add channel-select and mid/side evidence without discarding the mono
   diagnostic projection.
5. Materialize the same source-bound contract in the cloud worker without
   weakening private tile authorization or immutable generation checks.
