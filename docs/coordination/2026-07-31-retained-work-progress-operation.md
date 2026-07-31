# Retained Work progress operation

Date: 2026-07-31

Exact source `82c4223e1beb8ce936fa38b27b03ffac1b1d65db` turns the
durable-test-artifact policy into a rendered mutation and canonical-readback
lane. The operation uses only the fixed local `.test` media operator and the
existing retained Capture-to-Nest goal.

## Defects found by doing real work

The first rendered mutation attempt stopped before writing because Work showed
two goals with the same title: the current goal and a portable-restore copy.
Both were labeled only `Canonical goal`, so a person or automation could not
reliably identify the intended record.

Work now:

- detects `quipsly-portable-goal-restore-v1` provenance;
- gives the copy a visible **Restored copy** badge;
- explains that the restored copy has its own identity and history;
- gives the restored heading a distinct accessible name; and
- leaves both records intact for recovery and comparison.

The next attempt reached the correct card but found that the compact progress
form's nested labels did not expose stable exact accessible names. The
progress selector and evidence field now have explicit accessible names.

The visible save then succeeded, but the first independent readback selected
between the same-titled current and restored database rows nondeterministically.
The retained operator now binds readback to the one non-restored current goal,
requires exactly one match, and refuses to append the same latest evidence
note twice.

No failed attempt deleted or rewrote either goal. The one visible save that
preceded the readback repair remains as useful retained evidence.

## Exact committed operation

The clean committed source was operated through the rendered `/work` UI with
this visibly labeled evidence:

> QA Retained · Exact committed Work operation 82c4223e verified restored-copy
> identity, accessible progress entry, append-only receipt, session cleanup,
> and canonical readback on 2026-07-31.

Independent readback proved:

- one current goal selected by owner, title, and non-restored provenance;
- progress stayed at 25% rather than implying goal completion;
- receipt count advanced from 3 to 4;
- latest row, embedded evidence, source receipt, actor, note, and percentage
  agree;
- the receipt explicitly records `externalSideEffects: false`;
- the rendered session cleared successfully;
- browser exceptions: 0;
- screenshots and secrets captured: none; and
- the new progress artifact remains preserved.

The operation reports only hashes for goal, row, evidence, and note identity.
It accepts only loopback Nest and PostgreSQL targets, reads the password from
the dedicated macOS Keychain item, and contains no product-artifact cleanup
path.

## Verification

- Focused Work model and rendered interactions: 39/39 passed.
- Retained-operation boundary tests: 3/3 passed.
- Cross-surface Quipsly contracts: 176/176 passed.
- Quipsly TypeScript 7 typecheck: passed.
- Optimized Quipsly production build: passed for all 150 routes.
- Explicit diff checks: passed.

This is real local product operation and retained canonical state. It is not a
production deployment, external side effect, physical-iPhone run, completed
episode, or completed coaching workflow.
