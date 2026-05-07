# Episode 7 Virtual Chunk Playground Result

## Branch

- `main`

## Files Inspected

- `docs/analysis/episode-07-chapter-three-virtual-split-plan.md`
- `docs/analysis/future-episode-chapter-seed-map.md`
- `docs/sessions/playground-book-text-and-episode-07-split-plan-result.md`
- `apps/web/src/app/team/books/learning-to-lead/LivingManuscriptViewerClient.tsx`
- `apps/web/src/app/team/books/learning-to-lead/page.tsx`
- `apps/web/src/lib/server/living-manuscript.ts`
- `apps/web/src/lib/server/episode-production.ts`
- `apps/web/content/books/learning-to-lead/manuscript/learning-to-lead.living.mdx`
- `apps/web/content/books/learning-to-lead/episode-production/season-one.yml`
- `docs/project-context/weekly-ship-log.md`

## Files Changed

- `apps/web/content/books/learning-to-lead/episode-production/virtual-splits.yml`
- `apps/web/src/lib/server/episode-production.ts`
- `apps/web/src/app/team/books/learning-to-lead/page.tsx`
- `apps/web/src/app/team/books/learning-to-lead/LivingManuscriptViewerClient.tsx`
- `docs/analysis/episode-07-chapter-three-virtual-split-plan.md`
- `docs/project-context/weekly-ship-log.md`
- `docs/sessions/episode-07-virtual-chunk-playground-result.md`

## Virtual Split Data File Summary

Created `episode-production/virtual-splits.yml` as non-canonical planning state for Episode 7. It adds six virtual chunks derived from the Chapter Three split plan:

- `homer-chapter-three-mission-goal-and-mtc-discipline`
- `homer-chapter-three-speak-your-language-and-ventura`
- `homer-chapter-three-work-and-excellence-challenge`
- `homer-chapter-three-searls-stoker-and-listening-leadership`
- `homer-chapter-three-carias-trials-and-good-stories`
- `homer-chapter-three-leadership-calls-and-companion-fragments`

The file stores summaries and split guidance only. It does not copy large manuscript prose, create real `ManuscriptBlock` IDs, or change arrangement truth.

## Parser Summary

Added a controlled parser for `virtual-splits.yml` in `episode-production.ts`. It reads the narrow file shape, returns virtual chunks grouped by episode key, exposes only a repo-relative source label, and validates virtual chunk `sourceBlockId` values against the parsed living manuscript block IDs.

The parser is intentionally not a general YAML framework and does not parse or copy manuscript bodies.

## Playground UI Summary

Episode Playground now receives virtual split state from the server and shows a `Virtual Chunk Plan` section when the selected episode has a plan. The virtual cards display title, proposed future block ID, source block ID, source range summary, role, recommended placement, split recommendation, Charlie support opportunity, and notes.

The UI labels these cards as `Virtual chunk`, `Not a manuscript block`, and `Planning only`. They cannot be added to the canonical Playground sequence. The real Candidate Pool and Playground Sequence still use real manuscript blocks only.

Added copy helpers for:

- `Copy virtual split checklist`
- `Copy future block stub`

Both outputs are review aids for a later approved split pass, not file writes.

## Validation Performed

- `pnpm --filter web exec tsc --noEmit`: passed before final docs update.
- `pnpm --filter web exec next build --webpack`: passed before final docs update.
- Final validation was run after all edits before commit.

## Known Limitations

- Virtual chunks are summaries only; they do not show exact source ranges or excerpts.
- The Playground does not persist virtual chunk rearrangement.
- Virtual chunk stubs are copy-only and still require a human-approved manuscript split pass.
- Episode 7 may still become one episode or two; this pass does not decide that shape.

## Intentionally Unchanged

- `learning-to-lead.living.mdx`
- Real `ManuscriptBlock` entries
- `podcast-season-1.yml`
- Published episode/page content
- Raw `_inbox` files
- Prisma schema
- Dependencies
- Server writes
- Draft-to-Live publishing behavior
- Research, clip, or production-note promotion

## Recommended Next Book & Episodes Action

Review Episode 7 in Playground with the virtual chunk cards visible, choose one-episode vs two-episode shape, then approve the first real Chapter Three split pass only for the selected chunks.
