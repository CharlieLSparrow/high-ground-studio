# Quipsly Guidance Supersession Index

Date: 2026-06-02

This file records which docs are current authority and which docs are historical
reference for Quipsly, Studio, Manuscript Desk, and related creative-system work.

Do not delete or move old docs during the all-night Quipsly sprint. Existing
agents, memories, and handoff notes may still point at them.

## Current Authority

Use these first:

- `docs/vision/quipsly-creative-os-north-star.md`
- `docs/architecture/quipsly-document-kernel.md`
- `docs/plans/quipsly-kernel-now-next-later.md`
- `docs/agents/quipsly-current-brief.md`

## Still Useful Source Material

These docs contain useful prior work, but should not override the current
kernel/north-star docs:

- `docs/analysis/studio-manuscript-writing-tool-competitive-research.md`
- `docs/plans/studio-manuscript-desk-improvement-roadmap.md`
- `docs/architecture/studio-manuscript-persistence-adr.md`
- `docs/architecture/studio-manuscript-library-plan.md`
- `docs/architecture/studio-manuscript-first-collaboration-ui.md`
- `docs/architecture/studio-collaboration-roadmap.md`
- `docs/architecture/studio-collaboration-manuscript-adapter-plan.md`
- `docs/architecture/studio-collaboration-annotation-durability.md`
- `docs/architecture/studio-collaboration-materialized-annotation-state.md`
- `docs/architecture/quipsly-quiplore-foundation.md`
- `docs/plans/quipsly-quiplore-now-next-later.md`
- `docs/agents/quipsly-quiplore-codex-brief.md`
- `docs/agents/quipsly-quiplore-implementation-result.md`

## Superseded Assumptions

The following assumptions are no longer current:

- Quipsly is only a quote/discovery app.
- Studio or Content Studio is the main product shell.
- Browser-local manuscript state is acceptable as the primary durable truth.
- Blocks are the canonical manuscript model.
- A visual graph is the canonical story model.
- Video editing is a separate domain with no shared substrate.
- Agentic AI should primarily generate prose from a black box.

## Current Assumptions

- `apps/quipsly` is the active app package.
- `nest.quipsly.com` is the app domain.
- Quipsly should own a document kernel.
- The kernel should support text, media, annotations, projections, and
  agent-readable context.
- Current DB block/span records are materialized projections during transition.
- Romance Lab is a private workspace type that can share the kernel while
  keeping content walled off from HGO collaborators.

## How To Archive Old Docs Later

When there is time:

1. Keep old files in place.
2. Add a short header to each superseded file pointing here.
3. Promote only stable facts into current docs.
4. Do not bulk-move historical docs unless all references and agent briefs are
   updated in the same pass.
