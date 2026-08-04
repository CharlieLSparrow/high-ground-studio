# Unified audio and transcript trust surface

Date: 2026-08-04
Worktree: `/Users/wall-e/Dev/high-ground-studio-product`
Priority: best-in-market audio visibility, transcription review, and evidence-led automation

## Outcome

The Episode editor now projects decoded audio energy, sample peaks, clipping and silence thresholds, transcript word timing, provider probability, correction state, transcript bounds, and protected playback onto one source clock.

This closes a real product gap. Quipsly already had complete-decode signal profiling, timed transcripts, playback-backed corrections, loudness measurement, mastering audition, and deterministic edit evidence, but the evidence was split across separate desks and players. The reusable audio map now belongs to the shared component layer and is used by both Session review and imported Studio media review.

## User workflow

For a completed imported-source transcript, a reviewer can now:

1. see the complete-decode waveform overview and zoom to 60-second or 15-second windows;
2. inspect RMS energy and sample peaks without confusing RMS dBFS with LUFS;
3. see measured clipping, near-silence, and possible-dropout markers;
4. see loaded provider-timed words and their corrected, confirmed, unchecked, or provider-attention state;
5. click the evidence map to seek the same protected source player;
6. select the transcript segment under that source time when it is loaded;
7. listen and then save a versioned correction or confirm the provider segment as heard.

If decoded signal evidence is absent, the desk states exactly what is unavailable and offers one bounded `Build decoded audio map` action. It never invents audio conditions from transcript confidence.

## Verification hardening

The browser review gate no longer treats a programmatic seek or scrub as listening. A selected segment becomes eligible for a correction decision only after the protected media element has entered playback and emitted source-clock progress inside that segment. The server continues to enforce exact source binding and a playback position inside the segment.

The transcript review API now returns canonical transcript start and end bounds from database aggregation rather than inferring the end from the currently loaded page.

## Retained Episode 8 operation

The retained operation used the real High Ground Odyssey Episode 8 source `Ted Lasso Be Curious.mp4`:

- asset: `cmsek11ae0005q8xl59k1zucr`;
- source: `cmsek11a50004q8xl5vjb1756`;
- immutable SHA-256: `acddc14133f11580d602fa744f4b448a8e16061b81aebe9597e832df3b8175e3`;
- decoded duration: 254.630023 seconds;
- decoded waveform windows: 1,200;
- transcript bounds: 3.98–249.22 seconds;
- transcript coverage: 84 segments and 597 provider-timed words;
- source and decoded profile status: unchanged source, complete decode, `signal-present`;
- signed-out reads: HTTP 401;
- unrelated retained account reads: HTTP 403;
- review without playback evidence: HTTP 409 with no correction or verification row added.

No correction or `heard as-is` receipt was created by automation. Those records make a human-listening claim and remain for Charlie or Homer to create through actual playback.

## Boundaries

- This is windowed complete-decode evidence, not a sample-level waveform editor.
- RMS dBFS is not LUFS and provider probability is not measured transcription accuracy.
- Audio observations prioritize listening; they do not automatically remove silence, denoise, EQ, compress, cut, or publish.
- The mastering preview remains a separate unpromoted derivative. Explicit approval and promotion are the next mastery lifecycle slice.
- Automated edit proposals remain reversible review candidates until a separate canonical timeline save.

## Verification

- shared map and Studio transcript desk tests: pass;
- Studio transcript review API tests: pass;
- strict Quipsly TypeScript: pass;
- local Nest/PostgreSQL/Firebase/transcript-worker/media-worker doctor: pass;
- retained Episode 8 transcript plus decoded-signal operation: pass;
- full Quipsly Jest: 276 suites and 1,455 runnable tests pass, with 38 suites / 110 tests intentionally skipped;
- optimized 169-route Next.js production build with strict TypeScript: pass.
