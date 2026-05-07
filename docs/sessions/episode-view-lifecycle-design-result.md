# Episode View Lifecycle Design Result

Date: 2026-05-07

## Branch

- `main`

## Files Inspected

- `AGENTS.md`
- `docs/README.md`
- `docs/project-context/season-one-production-state.md`
- `docs/analysis/episodes-01-06-onenote-intake-audit.md`
- `docs/analysis/charlie-presentation-taxonomy.md`
- `docs/architecture/living-manuscript-conventions.md`
- `docs/sessions/episodes-05-06-onenote-intake-reconciliation-result.md`
- `apps/web/content/books/learning-to-lead/episode-breakdowns/episode-05-values-toolkit.md`
- `apps/web/content/books/learning-to-lead/episode-breakdowns/episode-06-trust-through-consistency.md`
- `apps/web/content/books/learning-to-lead/episode-breakdowns/season-one-working-map.md`
- `apps/web/content/books/learning-to-lead/arrangements/book-v1.yml`
- `apps/web/content/books/learning-to-lead/arrangements/podcast-season-1.yml`
- `apps/web/src/app/team/books/learning-to-lead/page.tsx`
- `apps/web/src/app/team/books/learning-to-lead/LivingManuscriptViewerClient.tsx`
- `apps/web/src/lib/server/living-manuscript.ts`

## Files Changed

- `docs/architecture/episode-production-lifecycle.md`
- `docs/analysis/episode-view-everything-draft-implementation-plan.md`
- `docs/README.md`
- `docs/project-context/season-one-production-state.md`
- `docs/project-context/weekly-ship-log.md`
- `docs/sessions/episode-view-lifecycle-design-result.md`

## Design Summary

- Episode View should split into Everything View and Draft View.
- Everything View shows all candidate material, including raw/intake references, Homer candidates, Charlie candidates, research, clip candidates, reaction cues, production notes, and unresolved decisions.
- Draft View shows the curated episode draft: selected sequence, selected Homer/Charlie material, recording notes, show notes, and public-safe material when ready.
- Episode lifecycle statuses should be Brainstorm, Rough Draft, Ready to Record, Recorded, Edited, and Live.
- Everything View never publishes directly. Draft View becomes public source only when lifecycle status is `Live`.

## Current Implementation Findings

- Book View gets data from `book-v1.yml` resolved against living-manuscript blocks.
- Story View gets data from all parsed living-manuscript blocks plus metadata filters.
- Episode View gets data from `podcast-season-1.yml` resolved against living-manuscript blocks.
- Current Episode View has Board and Reading display modes, but no production lifecycle state.
- Episode 5 and Episode 6 structured intake files are not currently loaded into the viewer.
- `podcast-season-1.yml` is too coarse to own Everything/Draft state because it only has episode key, title, status, and block IDs.

## What Remained Unchanged

- No product code was modified.
- No living manuscript files were modified.
- No arrangement YAML files were modified.
- No publish files were modified.
- No episode packet files were modified.
- No raw inbox files were modified.
- Prisma schema and dependencies were not modified.
- No untracked images or generated build files were staged.

## Validation Performed

- `git diff --check`
- `git status --short --branch`

## Known Limitations

- This pass designed the model only. It did not create the file-backed production state or viewer UI.
- The proposed file path for episode production state is a recommendation, not an implemented contract.
- Episode 6 lifecycle status should be confirmed against the actual recording date before implementation.
- Draft-to-Live publishing still needs a later public-output safety design before code is written.

## Recommended Next Book & Episodes Action

Create a read-only Season One episode production state file and implement Everything/Draft Episode subviews using Episode 5 as the first full fixture.
