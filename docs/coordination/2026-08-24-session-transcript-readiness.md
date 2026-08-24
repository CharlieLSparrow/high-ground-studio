# Session transcript readiness

Date: 2026-08-24

## Correction

The Session finishing surfaces previously reduced a transcript attempt to job
status and segment count. A job with `COMPLETED` plus one provider segment could
therefore advance the source journey and the coach's simple follow-up path even
when its exact recording binding, provider result, word timing, worker receipt,
or speaker authority was missing.

The production Session projection now retains and evaluates the evidence that
already exists in the canonical transcript and recording models:

- retained RecordingAsset SHA-256 and storage generation;
- transcript job source SHA-256 and generation;
- manifest, result, provider-request, provider-response, and worker-build
  receipts;
- immutable provider segment and word counts;
- routing topology and timing granularity; and
- isolated-source, provider-candidate, or unresolved speaker authority.

No schema migration was required.

## States

- **Ready** requires a verified retained source, matching SHA and generation,
  complete receipt chain, provider segments and words, usable timing, and
  participant identity supplied by an isolated source.
- **Review required** keeps provider text inspectable when receipts, word
  anchors, routing, timing, or speaker authority are incomplete. Mixed-room
  provider labels remain candidates even when diarization returned labels.
- **Processing** identifies attempts that have not completed.
- **Held** covers failed/held attempts and any mismatch with the retained
  source. Provider text and prior correction overlays remain unchanged.

Segment-timed evidence is truthfully identified as segment-editable rather than
word-editable. Timing evidence never claims the provider words are accurate.

## Product behavior

The source journey, finishing cockpit, transcript-ready count, and coaching
four-step path consume this projection. A completed-but-unready transcript no
longer advances follow-through. Instead it presents a transcript review action
and explains whether source, timing, receipt, or speaker evidence is open.

## Qualification

- Five transcript-readiness tests cover exact ready evidence, source hash
  mismatch, missing receipts/words, mixed-room speaker review, and segment-only
  editing precision.
- Source journey, finishing cockpit, cockpit UI, and coaching quick-path tests
  exercise the integrated contract.
- 30 focused Jest tests pass.
- Strict Quipsly TypeScript passes after Next route type generation.

## Acceptance still required

Automated evidence does not prove word accuracy, perceptual synchronization,
or correct human speaker identification. A real coach/client recording still
needs beginning/middle/ending playback against highlighted words, corrections,
speaker review, refresh/cross-device readback, and transcript-based trim review.

