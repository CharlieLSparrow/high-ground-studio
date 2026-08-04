# Deterministic edit evidence checkpoint

Date: 2026-08-03

## Outcome

The Episode editor now separates local deterministic analysis from disclosed
AI-provider suggestions. `Analyze locally` sends no provider consent and does
not require a provider key. It returns the same source-bound, stale-rejecting
proposal set used by provider analysis.

## Truth boundaries

- Explicit restart phrases create reversible exact-block proposals.
- Recording retake markers and repeated adjacent language are listen-only.
- Transcript gaps are timing observations, not silence claims.
- Gap candidates require decoded signal evidence before they can become cut
  proposals.
- Every proposal and candidate preserves source bytes, exact source intervals,
  local evidence hashes, rationale, confidence, and non-application state.
- Proof-watch/listen checks current project, episode, timeline hash, transcript
  hash, and block count before playing untouched source.

## Verification

- deterministic analyzer, contract, route, and editor suites: 25/25 passed;
- strict Nest TypeScript: passed;
- complete 164-route Nest production build: passed;
- local PostgreSQL, all 48 migrations, Firebase emulator, transcript worker,
  media worker, Nest health, login, and projects: green;
- a dedicated database-backed `high-ground-odyssey` QA episode rendered four
  source-bound transcript blocks in the real local editor;
- `Analyze locally` produced one reversible explicit-restart proposal and three
  listen-only candidates without opening provider disclosure or invoking a
  provider;
- the transcript timing-gap candidate was operated through Proof-listen and
  remained explicitly unconfirmed pending decoded signal evidence;
- the explicit-restart proposal was proof-watched, applied only to the editable
  timeline, and undone. The source block was restored and source media was never
  changed, saved, rendered, promoted, or published; and
- this pass exposed and repaired a stale status banner after Undo. The editor
  now reports the completed undo and unchanged-source boundary instead of still
  claiming that the cut is applied.

The synthetic QA episode has no attached media, so these controls exercised
real editor state transitions but do not constitute audible signal acceptance.
That remains part of the decoded-signal join below.

## Next join

Join transcript timing candidates to the existing decoded waveform evidence.
Only a measured low-energy interval with matching immutable source identity may
advance to a silence proposal. Speaker-aware proposals must wait for canonical
speaker timing rather than infer speakers from text.
