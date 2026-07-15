# Continuous Program Audio Render

Episode 4 proof: `20260715-episode4-continuous-audio-architecture-proof-v001`

- Camera chunks are picture-only and contain no audio streams.
- Reviewed picture decisions remain metadata-driven; mechanical alternation is disabled.
- Selected program-audio ranges are concatenated in PCM and encoded to AAC once.
- The continuous program stream is muxed once after picture assembly.
- Final proof streams start at `0.000s` and end together at `20.000s`.
- No non-monotonic DTS, invalid timestamp, corruption, or mux errors were emitted.
- Canonical Charlie, Homer, and clip-source stems remain the editable truth.
- The stereo mix remains a derived delivery artifact.

This replaces per-camera-chunk AAC encoding, which introduced priming and timestamp seams at edit boundaries.
