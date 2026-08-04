# Unified audio evidence clock operation

Date: 2026-08-04
Status: implemented and operated locally; no deployment performed

## Outcome

Quipsly now has a single high-resolution review surface where a producer or
coach can navigate the immutable source alongside transcript state, decoded
signal observations, capture evidence, mastery measurements, treatment
candidates, and exact source-bound automated-edit proposals. Each category
retains its own provenance and meaning; the UI does not collapse model
confidence, measured audio, listening, or an applied edit into one score.

## Defects uncovered and repaired

1. Selecting the waveform or spectrum moved the HTML media element but could
   leave the React playhead stale until a later media event. Selection now
   updates both immediately while clearing the playback-heard state.
2. A transcript provider without a comparable confidence threshold produced no
   review-navigation points. It now exposes one timed segment point rather than
   inventing a threshold.
3. Whole-source transcript binning chose one winning review state, which could
   hide a corrected or attention word. Bins now preserve every contained state
   and render a deterministic multistate gradient.
4. The evidence navigator and legend were visually present but initially lacked
   complete region semantics and edit-proposal identification. Both are now
   explicitly reachable and labeled.
5. Edit ranges were eligible to look source-specific based on time alone. They
   now enter the spectral surface only when the proposal binding is current and
   matches project, episode, Studio asset, protected source when declared, and
   source SHA-256 when available. Both the timeline and transcript fingerprints
   are rechecked, and the visible-ready state clears while those hashes are
   recomputed. Labels state `unapplied` and `source unchanged`.

## Real-work operation

High Ground Odyssey retained operation:

- project `high-ground-odyssey`;
- episode `episode-8-i-wasnt-born-a-leader`;
- retained source `Ted Lasso Be Curious.mp4`;
- all three spectral pyramid levels fetched through protected tile endpoints;
- shared transcript and signal overlay navigated and exact selected evidence
  explained;
- no browser exception, horizontal overflow, canonical-source mutation, or
  external action.

Retained coaching operation:

- desktop coach identity operated the same clock and evidence navigator;
- mobile coach identity operated ten-second zoom and keyboard source-clock
  movement at 390 by 844;
- client and outsider continuity remained concealed;
- the canonical source and coaching task remained unchanged;
- no browser exception, horizontal overflow, or external action.

The retained Be Curious source currently has transcript, signal, and spectral
jobs but no completed mastery or current source-bound automated-edit proposal.
Those overlay categories are therefore verified by rendered component tests,
not falsely claimed as present in that retained browser journey.

## Verification contract

- strict Quipsly TypeScript compilation;
- pure overlay tests for bounded transcript binning, non-interpolated loudness,
  deterministic navigation, and fail-closed edit binding;
- rendered Studio acceptance for transcript, signal, mastery, treatment, and
  unapplied-edit categories on one source clock;
- retained HGO and coaching browser operations, including mobile accessibility
  and authorization continuity;
- full Quipsly Jest, production build, diff, and repository-health gates before
  commit.
