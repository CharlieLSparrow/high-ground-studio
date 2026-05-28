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
- `architecture/episode-production-lifecycle.md`: lifecycle/source-of-truth model for Episode View, Everything View, Draft View, and Live publishing gates.
- `project-context/season-one-production-state.md`: current Season One production truth across recording, OneNote prep, repo intake, living manuscript, arrangements, and public publish status.
- `project-context/weekly-ship-log.md`: recurring proof-of-progress artifact Chuck can show Homer.
- `architecture/quipsly-quiplore-foundation.md`: first-class Quipsly/QuipLore product, source, app-boundary, visual-language, and Google Cloud direction.
- `architecture/quiplore-discovery-architecture.md`: QuipStream discovery, event, API, recommendation, and trust architecture inspired by short-form vertical feeds.
- `plans/quipsly-quiplore-now-next-later.md`: staged Quipsly/QuipLore build sequence, stop conditions, and first useful demo scope.
- `agents/quipsly-quiplore-codex-brief.md`: startup brief for future Quipsly/QuipLore implementation agents.
- `agents/quipsly-quiplore-implementation-result.md`: current implementation result for the first QuipLore app, Quipsly API, and shared domain package pass.
- `analysis/studio-manuscript-writing-tool-competitive-research.md`: competitive research across Scrivener, Ulysses, Reedsy, Dabble, Atticus, Plottr, iA Writer, and Docs/Word for the next Manuscript Desk planning cycle.
- `plans/studio-manuscript-desk-improvement-roadmap.md`: big-swing roadmap for mobile writing, semantic lenses, manuscript map, revision timeline, compile profiles, source bible, review, and Codex handoff mode.
- `agents/codex-application-handoff-2026-05-26.md`: current handoff packet for passing this branch into the Codex application, including validation status and branch/worktree audit.
- `reference/quipsly-quiplore/visual-language-study.md`: visual notes from uploaded Quipsly/QuipLore reference assets.
- `analysis/episode-view-everything-draft-implementation-plan.md`: implementation plan for the next read-only Episode View cockpit slice.
- `analysis/episodes-01-06-onenote-intake-audit.md`: raw OneNote intake inventory and classification guidance for Episodes 1-6 before living-manuscript normalization.
- `analysis/charlie-presentation-taxonomy.md`: semantic and visual taxonomy for Charlie material before changing manuscript structure or viewer code.
- `public/high-ground-field-guide-draft.md`: draft public-facing field guide entry for `Welcome To High Ground Odyssey`.

## File-Backed Product State

- `../apps/web/content/books/learning-to-lead/episode-production/season-one.yml`: read-only Season One episode lifecycle and Draft/Everything cockpit state for the internal Learning to Lead viewer.

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
