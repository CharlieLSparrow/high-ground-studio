# Signal and speaker edit-evidence checkpoint

Date: 2026-08-03

## Outcome

The Episode editor now joins transcript timing to immutable decoded-audio
evidence without treating a missing word interval as silence. It also preserves
canonical speaker labels through timeline hydration and uses their timing for
overlap and camera-transition review candidates.

## Source resolution

Signal corroboration runs only when the server resolves exactly one attached
Capture recording that is:

- scoped to the authorized Nest and episode;
- `VERIFIED`;
- bound to a SHA-256 and storage generation;
- carrying a valid complete-frame signal profile; and
- currently released by the normalized media-processing and consent gate.

Zero sources remain unavailable. A held source remains held. Multiple eligible
sources remain ambiguous until the editor explicitly selects the transcript's
source. Quipsly never guesses which waveform owns a transcript.

The proposal binding records recording ID, source SHA-256, storage generation,
and signal-profile SHA-256. Exact edit analysis retains the validated on-device
waveform at its full bounded resolution (up to 1,200 points); the 180-point
projection remains a display optimization and is not used to infer coverage
across compacted spans.

## Interpretations

- A transcript gap with at least 85% decoded-window coverage and every strongest
  observed RMS window at or below the source's near-silence threshold becomes
  **Measured low-energy gap**. It may produce an unapplied, source-bound exact
  range proposal, but it remains proof-listen-before-apply and reversible.
- A covered gap reaching the source's surrounding-signal threshold becomes
  **Signal inside transcript gap**. This prioritizes possible missing words or
  intentional sound before any edit.
- Insufficient, held, unavailable, or ambiguous signal leaves the original
  timing-only candidate intact.
- RMS remains labeled as dBFS and explicitly not LUFS.
- Overlapping canonical transcript intervals become an exact overlap listening
  candidate.
- A canonical speaker-label transition becomes camera-review evidence, not an
  automatic multicamera switch.

All candidates preserve source bytes and are capped to bounded response counts.

## Operated local acceptance

A clearly labeled synthetic local QA recording was added to the dedicated
`high-ground-odyssey / deterministic-edit-evidence-20260803` episode. It has a
test-only checksum, storage generation, full signal profile, current explicit
consent evidence, immutable finalization receipt, and normalized release. It is
not represented as physical-iPhone evidence or real HGO media.

The rendered editor proved:

- decoded signal changed from held to available only after current consent
  evidence satisfied the real release gate;
- 100% decoded coverage over `00:04-00:07`, strongest window `-78.0 dBFS`, and
  near-silence threshold `-72.0 dBFS` rendered as measured low energy;
- the signal-profile fingerprint and `RMS is not LUFS` disclosure rendered;
- Charlie and Homer labels survived canonical hydration and Paper Edit showed
  three Charlie blocks and one Homer block;
- the Charlie-to-Homer transition rendered as camera-review evidence;
- Proof-listen sought the measured interval with context and applied nothing;
- one explicit restart proposal still applied only to the editable timeline and
  Undo restored the block and reported unchanged source media.

This operation also exposed and repaired an audio-first clock bug. Transcript-
only episodes previously derived runtime solely from video clips, producing an
invalid range such as `00:02 to 00:01`. Episode runtime now includes transcript
end timing. Operated Proof-listen read back `00:02 to 00:08` for the low-energy
gap and `00:07 to 00:12` for the speaker transition.

## Verification

- six focused suites: 36/36 passed;
- strict Nest TypeScript: passed;
- operated database, consent/release gate, rendered editor, proof-listen,
  apply, and Undo: passed;
- complete 164-route Nest production build: passed; and
- local PostgreSQL, all 48 migrations, Prisma generation, Firebase emulator,
  transcript worker, media worker, Nest health, login, and projects: green
  after the isolated build restart.

## Next join

The first-class range decision is now implemented in episode artifact v3; see
`docs/coordination/2026-08-03-persisted-audio-range-decisions.md`. Next bind
provider and deterministic proposals to persisted review receipts, map named
speakers to camera sources, and operate genuine consented HGO and coaching
recordings from Capture.
