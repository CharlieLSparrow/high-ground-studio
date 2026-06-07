
## Codex sprint note - 2026-06-05 Nest route/product pass

- Added `/nests` as a customer-facing alias for the existing project hub and `/nests/[slug]` as a shortcut into `/create?project=<slug>`.
- Added shared Nest document-kind domain contracts so writing, study, research, production, and publishing documents can be described consistently without forking the data model.
- Confirmed new Nest creation uses the shared project registry and seeds starter documents through the existing `/create` starter document system.
- Follow-up target: use the document-kind contracts in future document switchers and onboarding cards.

## Codex sprint note - 2026-06-06 output catalog pass

- Added shared output catalog at `packages/quipsly-domain/src/output-catalog.ts`.
- Added Nest `/outputs` route showing output families, status, priority, source inputs, packet shape, publishing targets, and human promise.
- Added Outputs to the Nest nav.
- This captures the "single source, many outputs" product model for HGO episode pages, podcast RSS, YouTube, social cuts, GIF loops, Patreon, QuipLore quote feeds, books, SCORM, story scrolls, and photo gallery review.
