# Audible-event independent corpus checkpoint

Date: 2026-08-06

Status: production-shaped local implementation and authenticated retained UI
operation complete; genuine human labels and physical-iPhone cost evidence open

## What changed

Classifier confirmations are no longer Quipsly's strongest available evidence.
The Audio Studio now supports independently selected positive and class-absent
windows, including missed events that never appeared in a detector queue.

The durable record freezes:

- project, asset, source, immutable SHA-256, generation, and duration;
- detector analysis, algorithm, classifier, configuration hash, and complete
  analysis snapshot;
- stable classification identifier, display label, and family;
- podcast or coaching workload and calibration, validation, or retained
  challenge split;
- the fully played review window and, for a positive, exact event range;
- actor-bound idempotency, listening note, and optional supersession; and
- explicit no-treatment, no-edit, and no-promotion boundaries.

## Qualification behavior

The projection excludes unlabeled time instead of silently counting it as
negative. It excludes calibration receipts from acceptance metrics, merges
overlapping reviewed windows, matches one prediction to one truth event, and
reports per-class precision, recall, F1, false positives per labeled hour,
onset/offset error, and podcast/coaching coverage. Invalid stored source or
detector evidence fails the board rather than being dropped.

Passing qualifies listening triage only. It cannot authorize audio treatment,
timeline edits, derivative promotion, or a production-default change.

## Operated evidence

- Prisma schema formatted, validated, generated, and migration
  `20260806033000_add_audible_event_truth_corpus` applied to local PostgreSQL.
- Focused pure evaluator, server, API, and React suites passed.
- The complete Quipsly typecheck passed.
- Local PostgreSQL, Firebase emulator, Nest, transcript worker, and media worker
  passed the owned-stack doctor.
- The retained media operator authenticated in the real local Nest and opened
  Episode 4 Part 2 Audio Studio.
- Selecting the retained Beep detector suggestion populated an independent
  eight-second positive-label form. Protected playback covered all eight
  source-clock bins and changed the UI to `Complete window observed`.
- The save action remained disabled without a listening note. No human
  audibility, ground-truth, treatment, or edit decision was fabricated.

## Next evidence

1. Have a person label this retained source and the real Charlie mouth-sound
   windows.
2. Add independently reviewed coaching positives and negatives.
3. Reach the per-class minimum corpus without using calibration evidence for
   acceptance.
4. Run the same detector configuration on physical-iPhone short and 60–120
   minute sources, preserving runtime, battery, thermal, interruption, and
   recovery receipts.
