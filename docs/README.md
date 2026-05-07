# Docs Index

This `docs/` tree is the durable memory layer for local-repo + Codex CLI + terminal-agent work.

## Read First

- `project-context/current-state.md`
- `architecture/system-overview.md`
- `architecture/domain-model.md`
- `runbooks/local-dev.md`
- `agents/codex-handoff.md`

## Sections

- `analysis/`: repo audits and grounded assessments
- `architecture/`: system shape, boundaries, and domain model
- `project-context/`: current product and repo reality
- `plans/`: prioritized planning docs
- `public/`: public-facing documentation drafts not yet wired into the website
- `runbooks/`: repeatable operational steps
- `sessions/`: short-lived but still useful session notes and stabilization logs
- `workflows/`: reusable agent workflows
- `agents/`: handoff notes for future Codex work

## Operating Docs

- `workflows/documentation-operating-system.md`: how to write and maintain public docs, team docs, agent docs, session notes, architecture docs, runbooks, and roadmap docs.
- `plans/kanban-operating-model.md`: lightweight kanban model for visible progress, small cards, shipped proof, and weekly updates for Homer.
- `project-context/weekly-ship-log.md`: recurring proof-of-progress artifact Chuck can show Homer.
- `public/high-ground-field-guide-draft.md`: draft public-facing field guide entry for `Welcome To High Ground Odyssey`.

## Current High-Signal Session Notes

- `sessions/stripe-recovery-result.md`
- `sessions/episodes-build-investigation-result.md`
- `sessions/episodes-loader-guard-result.md`
- `sessions/coaching-current-state-sync-result.md`
- `sessions/documentation-kanban-operating-model-result.md`

These session docs explain stabilization history and recent operating-model truth, including why:
- Stripe checkout is currently rolled back
- `/coaching` is intentionally a non-checkout front door
- the episodes route uses a guarded Fumadocs loader

Treat them as historical stabilization records.
Current repo truth belongs in the durable docs under `project-context/`, `architecture/`, `runbooks/`, and `agents/`.

## Maintenance Rule

If a conclusion is likely to matter on the next turn, it belongs in `docs/`.
