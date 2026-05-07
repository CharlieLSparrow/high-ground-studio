# Live Story Drafts Design Result

## Branch

- `main`

## Files Inspected

- `prisma/schema.prisma`
- `apps/web/src/app/team/books/learning-to-lead/LivingManuscriptViewerClient.tsx`
- `apps/web/src/app/team/books/learning-to-lead/page.tsx`
- `apps/web/src/lib/server/living-manuscript.ts`
- `apps/web/src/lib/server/episode-production.ts`
- `apps/web/src/app/team/appointments/actions.ts`
- `apps/web/src/app/team/coaching-requests/actions.ts`
- `apps/web/src/app/team/clients/actions.ts`
- `apps/web/src/app/team/kanban/actions.ts`
- `apps/web/src/lib/authz.ts`
- `apps/web/src/lib/content-access.ts`
- `docs/architecture/story-map-and-story-candidates.md`
- `docs/sessions/story-map-view-result.md`
- `docs/project-context/current-state.md`
- `docs/project-context/weekly-ship-log.md`

## Files Changed

- `docs/architecture/live-story-drafts.md`
- `docs/analysis/live-story-drafts-implementation-plan.md`
- `docs/workflows/live-story-draft-workflow.md`
- `docs/project-context/weekly-ship-log.md`
- `docs/sessions/live-story-drafts-design-result.md`

## Design Summary

Designed a database-backed `StoryDraft` layer attached to Story Candidates.

The design keeps Story Candidates as planning-only cards and uses Prisma/Postgres for live writing drafts so Homer and Chuck can save work in the deployed app without editing canonical manuscript files.

The proposed model anchors every draft to a `sourceBlockId`, tracks Story Candidate and episode context, records creator/updater metadata, and uses an explicit lifecycle from rough draft through promotion or parking.

## Implementation Phases

- Phase 1: add Prisma model/migration, create/update server actions, and Story Map draft editor/display.
- Phase 2: add draft revision history, review metadata, and status filters.
- Phase 3: add promotion packet generation.
- Phase 4: add controlled promotion into real `ManuscriptBlock` truth.

## What Remained Unchanged

- Manuscript prose
- Real `ManuscriptBlock` entries
- Arrangement YAML
- Episode production YAML
- `virtual-splits.yml`
- Publish files
- Episode packet files
- Raw `_inbox` files
- Prisma schema
- Product code
- Dependencies
- Server writes
- Draft-to-Live behavior
- Public pages
- Research, clip, or production-note promotion

## Validation Performed

- `git diff --check`
- `git status --short --branch`

## Known Limitations

- This pass does not implement the schema or the editor.
- The access model needs a decision before implementation if Homer should write without broad team access.
- Revision history is recommended but can be deferred if Phase 1 needs to stay very small.
- Promotion remains a later controlled manuscript workflow.

## Recommended Next Book & Episodes Action

Approve the Phase 1 Story Draft scope, then implement the smallest Prisma-backed save loop on Story Map without adding promotion or public publishing behavior.
