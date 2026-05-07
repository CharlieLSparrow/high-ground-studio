# Episode Chapter-Seeded Playground Result

## Branch

- `main`

## Files Inspected

- `apps/web/src/app/team/books/learning-to-lead/LivingManuscriptViewerClient.tsx`
- `apps/web/src/lib/server/episode-production.ts`
- `apps/web/src/lib/server/living-manuscript.ts`
- `apps/web/content/books/learning-to-lead/manuscript/learning-to-lead.living.mdx`
- `apps/web/content/books/learning-to-lead/arrangements/podcast-season-1.yml`
- `apps/web/content/books/learning-to-lead/episode-production/season-one.yml`
- `docs/sessions/episode-playground-result.md`
- `docs/analysis/episode-view-everything-draft-implementation-plan.md`
- `docs/project-context/season-one-production-state.md`
- `docs/project-context/weekly-ship-log.md`

## Files Changed

- `apps/web/content/books/learning-to-lead/arrangements/podcast-season-1.yml`
- `apps/web/content/books/learning-to-lead/episode-production/season-one.yml`
- `apps/web/src/lib/server/episode-production.ts`
- `docs/project-context/season-one-production-state.md`
- `docs/project-context/weekly-ship-log.md`
- `docs/sessions/episode-chapter-seeded-playground-result.md`

## Current Inventory

The living manuscript currently has these chapter values:

- `acknowledgments`
- `preface`
- `introduction`
- `chapter-zero`
- `chapter-one`
- `chapter-two-values`
- `chapter-three`
- `chapter-four`
- `chapter-five`
- `chapter-six`
- `chapter-seven`
- `chapter-eight`
- `chapter-nine`
- `chapter-ten`
- `chapter-eleven`
- `chapter-twelve`
- `ending`

Current podcast arrangement keys before this pass:

- `write-it-down`
- `look-for-lessons`
- `know-where-you-came-from`
- `early-life-lessons`
- `values`
- `values-toolkit`

Current production-state episodes before this pass:

- `episode-01`
- `episode-02`
- `episode-03`
- `episode-04`
- `episode-05`
- `episode-06`

No Episode 7+ production-state entries existed before this pass.

## Chapter-Seeded Arrangements Added

Added low-confidence brainstorm arrangement keys for the coarse Homer chapter/ending blocks after Chapter Two:

- `chapter-three-base`
- `chapter-four-base`
- `chapter-five-base`
- `chapter-six-base`
- `chapter-seven-base`
- `chapter-eight-base`
- `chapter-nine-base`
- `chapter-ten-base`
- `chapter-eleven-base`
- `chapter-twelve-base`
- `ending-base`

Each arrangement uses only the matching Homer manuscript block. Charlie material, research, clip candidates, production notes, and raw intake material were intentionally excluded.

## Production Cards Added

Added Episode 7 through Episode 17 as `Brainstorm` production-state cards:

- Episode 7: `chapter-three-base`
- Episode 8: `chapter-four-base`
- Episode 9: `chapter-five-base`
- Episode 10: `chapter-six-base`
- Episode 11: `chapter-seven-base`
- Episode 12: `chapter-eight-base`
- Episode 13: `chapter-nine-base`
- Episode 14: `chapter-ten-base`
- Episode 15: `chapter-eleven-base`
- Episode 16: `chapter-twelve-base`
- Episode 17: `ending-base`

These cards are book-text scaffolds for Playground planning. They are not final episode boundaries, public pages, edited drafts, or manuscript normalization.

## Parser Update

The episode production parser no longer expects exactly six Season One episodes. It now:

- requires only base episodes `episode-01` through `episode-06`
- keeps the Episode 5 six-item draft check
- keeps the Episode 6 five-item draft check
- warns on duplicate production keys
- warns on duplicate episode numbers

## Validation Performed

- arrangement references resolve to existing `ManuscriptBlock` IDs: passed
- production-state `manuscript-block` draft sources resolve to existing `ManuscriptBlock` IDs: passed
- production-state future arrangement keys resolve: passed
- `pnpm --filter web exec tsc --noEmit`: passed
- `pnpm --filter web exec next build --webpack`: passed
- `git diff --check`: passed
- direct `tsx` parser smoke test: not run because `tsx` is not installed and no dependency was added
- final `git status --short --branch`: pending after commit/push

## Known Limitations

- Episode 7+ cards are seeded from coarse chapter blocks, so they are intentionally too large for final episode prep.
- Playground can rearrange full `ManuscriptBlock` IDs but cannot split block bodies.
- Future cards may be split, merged, renamed, or rebuilt after Homer/Charlie review.
- Episode 6 still needs post-recording reconciliation before Chapter Two boundaries should be treated as stable.

## Intentionally Unchanged

- Living manuscript prose
- Manuscript block bodies
- Publish files
- Episode packet files
- Raw `_inbox` files
- Prisma schema
- Dependencies
- Server writes
- Draft-to-Live behavior
- Public episode pages
- Research, clip, and production-note promotion

## Recommended Next Book & Episodes Action

Open Episode 7 in Playground and test whether Chapter Three is one episode or needs to be split into smaller story/lesson units before any manuscript or arrangement normalization.
