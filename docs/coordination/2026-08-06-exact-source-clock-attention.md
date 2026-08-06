# Exact source-clock attention handoff

Date: 2026-08-06

## Outcome

Quipsly now projects unresolved transcript, audible-event, dialogue-repair,
audio-mastery, and edit-proposal evidence onto one exact source clock. Session
reviewers can play the protected source at the ranked range, then move to a
canonically bound transcript, Audio Studio, or Studio editor surface without
creating or applying an editorial decision.

This is a read-only projection over existing evidence and append-only review
receipts. It creates no workflow rows, mutates no source media, approves no
master, applies no edit, and publishes nothing.

## Authority boundaries

The queue deliberately shares time, not confidence semantics:

- Transcript provider confidence is not measured transcript accuracy.
- Audible-event detector confidence is not proof that an event is audible.
- Dialogue-repair confirmation authorizes a reversible comparison experiment,
  not replacement of the protected source.
- Decoded mastering observations locate evidence but do not replace listening.
- Edit heuristic confidence ranks review effort and is not a calibrated
  probability.
- Client-tracked playback is navigation and is not a proof-listen receipt.

Each authority contributes at most 20 items to the 100-item projection so a
noisy detector cannot starve a different evidence system.

## Real retained-data operation

- The retained coaching Session projected two exact audible-event ranges at
  59.25-60.75 seconds and played the protected 80-second source from the target
  range.
- The coaching finishing cockpit reported the two exact ranges alongside its
  recover, understand, repair, assemble, and finish evidence.
- A bound podcast Session rendered the honest empty state: the current
  canonical evidence produced no unresolved range, without claiming the source
  was fully proof-listened or that detector recall was measured.
- A direct Audio Studio handoff sought the selected protected source to 1.249
  seconds and remained paused for deliberate human playback.
- A Studio editor handoff hydrated the canonical timeline at 1.25 seconds and
  stated that no edit decision was applied.
- Project-private source-clock evidence stayed absent when the signed-in user
  could open a Session but lacked project visibility.

## Boundary defect found and repaired

A coaching source originally received an Audio Studio link without a canonical
episode binding. Audio Studio then selected an unrelated episode through its
fallback behavior. The projection now emits Audio Studio and Studio editor
links only when the source has a canonical episode binding. A regression test
protects this boundary.

There is a separate authorization mismatch to resolve: retained-coach project
list visibility can identify High Ground Odyssey as owned while the episode
inventory API denies the same account read access. That requires one canonical
project-access policy, not another UI fallback.

## Verification

- `pnpm --filter quipsly typecheck`
- Seven focused Jest suites, 71 tests, all passing. The command uses
  `--runTestsByPath` because route names contain parentheses and brackets.
- `git diff --check`

## Product research enabled by this slice

Future audio, transcription, and automated-editing research can now be judged
against one operational contract: every suggestion must resolve to protected
source identity, an exact source-clock range, an explicit authority boundary,
a reversible review action, and observable downstream consequences. Feature
research should compare mature products and primary technical sources by real
jobs-to-be-done and retained-work operation, not by checklist size.

The next dedicated feature-frontier pass should examine at least:

1. Audio diagnostics, restoration, loudness, room/noise analysis, matched
   audition, and transparent mastering automation.
2. Multi-provider transcription evaluation, diarization, vocabulary handling,
   correction learning, provenance, and measurable retained-set accuracy.
3. Transcript-driven and signal-aware automated video editing with proof-watch,
   versioned drafts, multicamera/source sync, and rollback.
4. Browser/iPhone/Mac recording, external device preflight, local isolated
   tracks, clock reconciliation, upload recovery, and collaborative clip
   playback.
5. Session-to-notes/tasks/goals/calendar workflows whose generated outputs
   remain traceable to exact transcript and source-clock evidence.

## Remaining gates

This slice does not replace physical iPhone acceptance, multi-participant
recording, upload-interruption recovery, TestFlight/App Store release evidence,
or a complete proof-listen/proof-watch of real episode media. Those remain
required product gates.
