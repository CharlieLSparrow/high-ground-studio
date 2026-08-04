# Broad-band frequency evidence — 2026-08-04

## Outcome

Quipsly now gives retained coaching Sessions and Studio source review a
source-bound frequency view alongside decoded RMS level, sample peak, capture
events, transcript timing, and playback review. The view answers a previously
invisible question: where does measurable energy live across rumble, warmth,
body, speech, presence, and air over the immutable source clock?

This is deliberately a broad-band overview, not a high-resolution repair
spectrogram. Professional repair tools use spectrograms to display time,
frequency, and amplitude and to target narrow time-frequency regions. Adobe
describes the same division: waveform view exposes amplitude while spectral
view exposes frequency over time. Quipsly's first production frequency layer
therefore improves orientation and diagnosis without pretending that six
filtered bands can support surgical repair.

Primary references:

- [FFmpeg audio filters](https://ffmpeg.org/ffmpeg-filters.html) document the
  high-pass and low-pass primitives used by the worker.
- [iZotope: Understanding spectrograms](https://www.izotope.com/en/learn/understanding-spectrograms.html)
  describes the time/frequency/amplitude model and the value of combining a
  waveform overview with spectral evidence.
- [Adobe Audition waveform and spectral display](https://helpx.adobe.com/audition/desktop/editing-audio-files/displaying-audio-waveform-editor.html)
  distinguishes amplitude visualization from frequency-over-time evidence.

## Receipt and worker architecture

The existing `quipsly-audio-signal-profile-result-v1` remains backward
readable. New jobs explicitly declare the additive
`quipsly-audio-broad-band-rms-v1` capability. Queue reuse requires that
capability, so an older amplitude-only receipt cannot masquerade as a completed
frequency analysis.

The durable worker performs a second complete decode:

1. FFmpeg makes its standard mono overview downmix.
2. The stream is split into up to six contiguous two-pole high/low-pass bands.
3. Interleaved float output is accumulated into the same bounded source-clock
   window count used by the level profile.
4. Every window and whole-program band stores absolute RMS dBFS.
5. The worker rejects non-finite samples, partial frames, more than 1,200
   windows, frame-count drift, clock drift, source-byte drift, or a band at or
   above Nyquist.

Bands are sample-rate aware. The 44.1 kHz Episode 8 source supports all six.
The 8 kHz coaching source supports five; `air` is omitted because it would be
outside the decodable bandwidth. Quipsly does not fabricate an empty band.

Receipt boundaries state that:

- broad bands are not a repair spectrogram;
- measurements are not EQ decisions;
- stereo is downmixed only for this frequency overview;
- original media remains source truth and is not changed by analysis.

## UX architecture repair

The retained Studio journey uncovered an unrelated but serious ownership bug.
`StudioTranscriptReviewDesk` rendered its complete player, audio map,
transcript, and correction surface inside a roughly 193-pixel imported-media
card. Desktop breakpoint classes responded to the viewport rather than the
card, collapsing six columns to zero-width text and producing a desk over
6,000 pixels tall.

The media card now owns only a compact readiness summary and one clear action.
Deep transcript/audio review opens in a full-width modal desk with:

- Escape and explicit Close behavior;
- initial focus on Close and focus return to the opener;
- body-scroll containment;
- the protected player, source-clock map, transcript segments, and review
  controls together at an appropriate working width;
- an auto-fit frequency metric grid that follows actual container width.

This is a product-boundary correction, not a test-selector workaround.

Studio review also no longer applies Deepgram's `0.65` triage threshold to
local Whisper probabilities. Quipsly preserves every provider probability,
but labels provider-attention words only when the provider has a supported
default or the transcript receipt carries an explicit threshold authority.
Otherwise the map says that no cross-provider confidence threshold exists.

## Operated evidence

### High Ground Odyssey Episode 8

The operation analyzed the genuine retained `Ted Lasso Be Curious.mp4` source:

- SHA-256 `acddc14133f11580d602fa744f4b448a8e16061b81aebe9597e832df3b8175e3`;
- 19,100,059 bytes;
- 254.630023 seconds, 44.1 kHz, stereo;
- 1,200 level windows and 1,200 six-band frequency windows;
- source hash and size unchanged.

The canonical transcript readback retained 84 segments and 597 timed words,
returned 401 signed out and 403 to an unrelated account, and refused a review
write without playback confirmation with HTTP 409. The rendered Studio journey
opened the full desk, displayed all six bands, switched to Frequency, operated
the exact source clock, and produced no overflow or browser exception.

### Retained coaching follow-up

The 80-second, 8 kHz retained coaching source was re-profiled into 800 level
windows and 800 five-band frequency windows. The original SHA stayed
`273d094bb7b38a672df5cf16eb37ace6c6c53852ebd7207e66150b0d492b6a3e`,
transcript segments were unchanged, and the rendered Session operated
Frequency mode and evidence navigation without overflow, browser exceptions,
credentials, screenshots, or external side effects.

## Verification

- media-processing and worker TypeScript pass;
- strict Quipsly TypeScript passes;
- the FFmpeg integration switches from 160 Hz to 4 kHz and proves the expected
  warmth-to-presence dominance change on the source clock;
- focused contract, evidence-map, transcript, server, and Studio desk tests
  pass;
- the complete Quipsly Jest run passes 278 suites and 1,478 tests (38 suites
  and 110 tests remain intentionally skipped by their existing environment
  gates);
- the production Next.js build and bundled media-worker build pass;
- retained HGO API/privacy and rendered Studio operations pass;
- retained coaching materialization and rendered Session operations pass.

The next spectral step should be a separately versioned, higher-resolution
repair view with bounded tile storage and zoom-dependent retrieval. It should
not be smuggled into this six-band receipt or allowed to auto-process source
media without a reversible candidate, exact A/B, and human review.
