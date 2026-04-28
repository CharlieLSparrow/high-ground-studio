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
- `runbooks/`: repeatable operational steps
- `sessions/`: short-lived but still useful session notes and stabilization logs
- `workflows/`: reusable agent workflows
- `agents/`: handoff notes for future Codex work

## Current High-Signal Session Notes

- `sessions/stripe-recovery-result.md`
- `sessions/episodes-build-investigation-result.md`
- `sessions/episodes-loader-guard-result.md`

These session docs explain why:
- Stripe checkout is currently rolled back
- `/coaching` is intentionally a non-checkout front door
- the episodes route uses a guarded Fumadocs loader

Treat them as historical stabilization records.
Current repo truth belongs in the durable docs under `project-context/`, `architecture/`, `runbooks/`, and `agents/`.

## Maintenance Rule

If a conclusion is likely to matter on the next turn, it belongs in `docs/`.
