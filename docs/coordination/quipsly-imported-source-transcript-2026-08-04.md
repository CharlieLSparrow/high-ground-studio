# Imported source transcript checkpoint — 2026-08-04

## Outcome

Quipsly now has one production-shaped transcript path for original and reference media imported into an episode Nest. The path is source-bound, durable, authorization-aware, append-only, and playable from the editor. It does not silently turn transcript text into edits, tasks, goals, or published material.

This is a checkpoint, not a claim that transcription is finished. Playback-verified correction, speaker review, provider comparison, longer-session qualification, cloud operation, and physical-device acceptance remain open gates.

## Architecture

1. An authenticated editor request identifies the exact project, episode production, media asset, and immutable media source.
2. The server independently inspects the local source and records its byte count, SHA-256 hash, and generation in a versioned job contract.
3. Original recordings require a participant-consent confirmation. Reference clips require a licensed-or-permitted-source confirmation.
4. One existing detached media worker claims the job with a lease. It runs local Whisper, retains the raw provider response, verifies the source before and after the read, and emits a validated result receipt.
5. The server validates the receipt again and serializably writes canonical transcript segments and words. The original media remains unchanged.
6. The editor shows timed transcript segments beside the source player. Selecting a segment seeks the source clock for review.

The canonical `TranscriptJob` now belongs to exactly one source family: either a Capture asset or a Studio media asset. A database constraint enforces that XOR boundary. Studio transcript rows must also name their project and episode production. No synthetic call room is created to make imported media fit the older call-only workflow.

## Evidence retained

- Immutable source identity: provider reference, generation, byte count, and SHA-256.
- Authorization kind, actor, role, and acceptance time.
- Worker attempt, lease, start, completion, and failure evidence.
- Provider name, model, language, raw-response path, and raw-response hash.
- Provider-timed segments and words with word probability when available.
- Honest capability declaration: this provider does not claim diarization, segment confidence, or alternatives.
- Canonical correction and playback-verification totals are calculated across the whole transcript, not a UI preview.

## Retained real-work operations

### High Ground Odyssey Episode 8 reference clip

- Source: `Ted Lasso Be Curious.mp4`
- Media asset: `cmsek11ae0005q8xl59k1zucr`
- Media source: `cmsek11a50004q8xl5vjb1756`
- Size: `19,100,059` bytes
- SHA-256: `acddc14133f11580d602fa744f4b448a8e16061b81aebe9597e832df3b8175e3`
- Processing job: `studio_transcript_7a24fe35dccd4c98a7f7fcd6b1d9eacf`
- Canonical transcript: `transcript_8682798b665a44e68d1158bfa7860057`
- Result: 84 timed segments and 597 timed words from 3.98s through 249.22s.
- Privacy boundary: signed-out read returned 401; unrelated retained user returned 403.
- Integrity boundary: source size and hash remained unchanged after transcription.

### Short retained High Ground Odyssey audio fixture

- Media asset: `cmse192a8000e8jxldysq5b1u`
- Processing job: `studio_transcript_9cc674f12e0d45628ee996b430bac5b3`
- Canonical transcript: `transcript_83a5de25657b4222b74bdc54267930d9`
- Result: one timed segment and two timed words.

## Defects found by real operation

The first real worker run exposed two bugs that unit fixtures did not:

1. A PostgreSQL retry-release query reused one parameter with incompatible timestamp and text types. The query now applies explicit types.
2. Whisper placed one timed word fractionally outside its segment. Quipsly now expands that segment deterministically to the provider word envelope while preserving the raw response and raw word times.

The editor status endpoint also exposed a transparency defect: it returned only the first 80 segments and derived its correction total from that partial list. The API now computes the correction count over the complete transcript, returns one explicitly bounded preview segment, and delegates review text to the paged correction desk.

## Accuracy finding

A provisional comparison against published subtitle timings for the relevant scene produced roughly 22% word error rate. That reference is not a human-approved Quipsly ground truth and differs from the edited clip, so it must not be stored or advertised as measured product accuracy. It is useful as a warning: local `large-v3-turbo` transcription of finished television audio is not yet qualified as the premium default. The next provider evaluation must use a human-reviewed reference aligned to the actual immutable source.

## Next gates

1. Build a source-agnostic correction and speaker-review desk with page-by-page transcript loading.
2. Require a playback attestation tied to the source clock before accepting a text or speaker correction.
3. Show word probability and correction provenance directly on the waveform/transcript surface without presenting probability as accuracy.
4. Benchmark local and cloud providers against the same human-approved HGO and coaching references.
5. Qualify long sessions, resume/retry behavior, and retained raw evidence.
6. Connect approved transcript revisions to reversible edit proposals; never mutate source media or an approved timeline implicitly.
7. Complete physical-iPhone capture, recovery, upload, transcript, playback, and Studio handoff acceptance.
