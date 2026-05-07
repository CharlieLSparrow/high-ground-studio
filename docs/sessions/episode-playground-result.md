# Episode Playground Result

## Branch

- `main`

## Files Inspected

- `apps/web/src/app/team/books/learning-to-lead/LivingManuscriptViewerClient.tsx`
- `apps/web/src/app/team/books/learning-to-lead/page.tsx`
- `apps/web/src/lib/server/episode-production.ts`
- `apps/web/src/lib/server/living-manuscript.ts`
- `apps/web/content/books/learning-to-lead/episode-production/season-one.yml`
- `apps/web/content/books/learning-to-lead/arrangements/podcast-season-1.yml`
- `docs/sessions/episode-05-draft-state-alignment-result.md`
- `docs/architecture/episode-production-lifecycle.md`
- `docs/analysis/episode-view-everything-draft-implementation-plan.md`
- `docs/project-context/weekly-ship-log.md`

## Files Changed

- `apps/web/src/app/team/books/learning-to-lead/LivingManuscriptViewerClient.tsx`
- `apps/web/src/lib/server/episode-production.ts`
- `docs/project-context/weekly-ship-log.md`
- `docs/sessions/episode-playground-result.md`

## Summary

Added a third Episode View subview: `Everything | Draft | Playground`.

Playground is a fast, browser-only editorial workbench. It starts from the selected episode's Draft View sequence, shows a candidate pool, and lets Chuck test a possible episode order without writing any canonical source file.

The first implementation supports:

- candidate pool from matched arrangement blocks, draft item block sources, and blocks tagged with the selected episode key
- Add, Move Up, Move Down, Remove, Reset from Draft, Reset from Arrangement, and Clear controls
- copied arrangement YAML for a draft playground key
- copied `draftSelectedItems` YAML
- automatic reset when changing the selected episode, because the Playground component is keyed by episode

The server production-state shape check was also updated so Episode 5 expects six draft selected items, matching the current `values-toolkit` sequence.

## Validation Performed

- `pnpm --filter web exec tsc --noEmit`: passed
- `pnpm --filter web exec next build --webpack`: passed
- `git diff --check`: passed
- forbidden canonical content/data diff check: passed
- final `git status --short --branch`: pending after commit/push

## Known Limitations

- Playground state is intentionally temporary and browser-only.
- There is no drag-and-drop dependency; ordering uses buttons.
- Copied YAML is a planning aid, not a write operation.
- Candidate pool does not parse raw OneNote or structured intake bodies.
- Playground does not create, edit, publish, or persist episode content.

## Intentionally Unchanged

- Living manuscript prose
- Podcast arrangement YAML
- Episode production YAML
- Publish files
- Episode packet files
- Raw `_inbox` files
- Prisma schema
- Dependencies
- Server writes
- Editable canonical controls
- Draft-to-Live behavior
- Public episode pages

## Recommended Next Book & Episodes Action

Use Episode 5 Playground with Homer/Charlie to test one alternate sequence, then decide whether the current `values-toolkit` arrangement should stay as-is or receive a narrow arrangement revision.
