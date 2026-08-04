# Source-bound automated edit proposal checkpoint

Date: 2026-08-03

## Outcome

The Episode editor's existing AI-suggestion path has been replaced with a
production-shaped proposal contract. Suggestions are authorized at the
canonical project/episode boundary, cryptographically bound to exact transcript
and timeline state, visually explain their evidence, and can be proof-watched
against untouched source before one-at-a-time application.

## Implementation

- `apps/quipsly/src/lib/editor/ai-edit-proposal-contract.ts` defines the shared
  proposal, evidence, binding, and safety-boundary schema.
- `apps/quipsly/src/app/api/ai-edit/route.ts` checks authentication, project
  write authority, request bounds, provider output, and source interval bounds
  before returning proposals.
- `apps/quipsly/src/app/(app)/editor/page.tsx` computes browser SHA-256 bindings,
  rejects stale sets, renders rationale/confidence/source evidence, and performs
  source proof-watch with surrounding context.
- Apply mutates only the current editable timeline. It does not autosave,
  render, promote, publish, or alter immutable source media.

## Verification

- proposal contract and route suites: 9/9 passed;
- editor component suite: 10/10 passed, including a cryptographically current
  proposal and real proof-watch transition;
- strict TypeScript and the complete Nest production build remain required
  before commit.

## Scope boundary

This checkpoint establishes the trustworthy proposal spine. It does not claim
a production provider run, a persisted audit ledger, deterministic silence or
speaker analysis, an assembled automatic cut, a rendered video, a deployment,
or a physical-device result.

Architecture: `docs/architecture/source-bound-automated-edit-proposals.md`.
