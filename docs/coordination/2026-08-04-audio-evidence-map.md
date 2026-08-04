# Audio evidence map checkpoint

Date: 2026-08-04

## Outcome

Session transcript review now exposes a single interactive evidence map instead
of calling coarse RMS windows a waveform. The map is deliberately explicit
about what Quipsly knows:

- symmetrical bars are windowed RMS energy;
- thin lines are sample peaks from the same complete decode;
- gray and red regions are threshold observations, not listening judgments;
- capture boundaries, deterministic signal observations, the timed transcript
  end, and the selected source playhead share one clock;
- whole-source, 60-second, and 15-second views remain centered on the selected
  immutable-source time; and
- selecting evidence starts protected playback only when that source is
  authorized and ready.

The map does not claim sample-level waveform resolution, perceptual loudness,
speech presence, dropout classification, or transcript correctness. Those
remain separate evidence and human-review boundaries.

## Cross-edge signal contract

The retained Episode 4 fixture predated iPhone source-profile preservation, so
the visual acceptance lane initially had no signal evidence. A new bounded,
streaming FFmpeg analyzer now mirrors the iPhone `quipsly-audio-signal-window-v1`
contract for authorized local legacy fixtures:

- the primary audio stream is decoded completely as interleaved 32-bit float;
- channel energy is averaged without phase-canceling valid stereo;
- evidence is bounded to at most 1,200 windows with the same 100 ms minimum;
- RMS, sample peak, clipped frames, near-silent frame fraction, channel RMS,
  stereo balance, and listening-required observations use the same thresholds
  as Capture; and
- processing is streamed, so memory does not grow with source duration.

The dogfood seed binds that result to the existing immutable source SHA-256 and
stores it under `reportedSourceProfile.audioSignal`; it does not replace source
bytes or rewrite provider transcript evidence.

## Operated proof

The actual protected Episode 4 correction Session
`local-transcript-dogfood-episode-4` was reseeded from its authorized 60-second
WAV and operated through rendered login, APIs, playback, and UI.

The complete decode retained:

- 960,000 analyzed frames;
- 600 evidence windows;
- -45.743835 dBFS overall RMS;
- -18.289541 dBFS sample peak;
- zero clipped frames; and
- one possible-dropout listening candidate from 11.5 to 15.4 seconds.

The rendered operator selected the 15-second view, used the evidence map to
seek protected playback to 10.84 seconds, then completed the existing
speaker-attribution journey. Canonical provider segments, word-review counts,
corrections, and packet notes remained unchanged. The exact mutation replay
remained idempotent, the ungranted outsider still received a non-disclosing
404, and the page had no browser exception or horizontal overflow.

## Verification

- audio evidence map and transcript correction desk: 14/14 focused tests;
- streaming real-FFmpeg analyzer: 1/1;
- strict Nest TypeScript: passed;
- rendered protected-source map seek and playback: passed;
- provider transcript immutability and exact-request replay: passed;
- separate-account protected-media denial: passed; and
- source bytes changed: no.

## Next join

Use this shared-clock map as the visual spine for loudness curves, treatment
deltas, transcript confidence/review coverage, and later camera/sync evidence.
Run the same contract on genuine Capture and Canon/MV7i sources before calling
the cross-device lane qualified.
