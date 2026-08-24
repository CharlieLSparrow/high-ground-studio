# Session transcript program clock

Date: 2026-08-24

## Problem closed

Quipsly already retained participant-owned recordings, source-bound transcript
jobs, and capture-clock proposals. The coaching report route nevertheless
placed participant transcripts by reported recording wall time. It also added
the offset to segment timestamps before handing them to a report builder that
accepted its own offset field. That split authority made stronger clock
evidence easy to ignore and made a future double-offset regression likely.

## Production contract

`assembleSessionTranscriptProgramClock` is now the reusable boundary between
immutable source time and provisional Session program time.

- Every source keeps its provider segment times unchanged.
- The assembler refuses duplicate recording or transcript identities.
- Sources that declare different capture groups fail closed rather than being
  merged as one conversation.
- A single source defines only its own zero point.
- Multiple sources prefer complete, validated
  `quipsly-capture-alignment-proposal-v1` evidence from the same capture group.
- When complete clock evidence is unavailable, reported recording starts are a
  visibly labelled fallback—not an exact-sync claim.
- Multi-source placement always requires waveform and drift review and always
  reports `sampleAccurateClaimed: false`.

The report builder applies each source's program offset exactly once. Every
turn retains both `sourceStartSeconds` / `sourceEndSeconds` and its derived
Session `startSeconds` / `endSeconds`. The Word report and download headers
disclose timing authority, uncertainty, and whether waveform review remains
required.

## Automated evidence

```text
pnpm --dir apps/quipsly exec jest --runInBand --runTestsByPath \
  src/lib/server/session-transcript-assembly.test.ts \
  src/lib/server/coaching-transcript-report.test.ts \
  'src/app/api/sessions/[roomId]/transcript-report/route.test.ts'

PASS: 3 suites, 14 tests
```

```text
pnpm --filter quipsly typecheck
PASS
```

The tests prove capture-clock proposals outrank skewed wall starts, fallback is
explicit, different or internally contradictory take identities are rejected,
one source does not imply cross-device sync, and a 65-second source-local turn
with a 1.25-second source offset appears
at 66.25 seconds on the program clock without changing its source timestamp.

## Honest remaining acceptance

This code does not prove perceptual or sample-accurate synchronization. A real
two-device flight must retain both exact sources and clock evidence, assemble
the same capture group, compare beginning/middle/end transcript highlighting
against protected playback, measure opening waveform alignment and late-take
drift, and preserve the reviewed offset as a separate editorial decision. The
same assembled projection still needs to replace single-job assumptions in the
ordinary browser and Capture transcript-review surfaces.
