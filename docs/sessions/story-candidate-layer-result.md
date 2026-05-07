# Story Candidate Layer Result

## Branch

- `main`

## Files Inspected

- `docs/sessions/episode-07-virtual-chunk-playground-result.md`
- `apps/web/content/books/learning-to-lead/episode-production/virtual-splits.yml`
- `apps/web/src/app/team/books/learning-to-lead/LivingManuscriptViewerClient.tsx`
- `apps/web/src/lib/server/episode-production.ts`
- `apps/web/src/lib/server/living-manuscript.ts`
- `apps/web/content/books/learning-to-lead/manuscript/learning-to-lead.living.mdx`
- `apps/web/content/books/learning-to-lead/episode-production/season-one.yml`
- `apps/web/content/books/learning-to-lead/arrangements/podcast-season-1.yml`
- `docs/analysis/future-episode-chapter-seed-map.md`
- `docs/analysis/episode-07-chapter-three-virtual-split-plan.md`
- `docs/project-context/weekly-ship-log.md`

## Files Changed

- `apps/web/content/books/learning-to-lead/episode-production/virtual-splits.yml`
- `apps/web/src/app/team/books/learning-to-lead/LivingManuscriptViewerClient.tsx`
- `apps/web/src/lib/server/episode-production.ts`
- `docs/architecture/story-candidate-layer.md`
- `docs/analysis/book-wide-story-candidate-map.md`
- `docs/analysis/episode-07-chapter-three-virtual-split-plan.md`
- `docs/analysis/future-episode-chapter-seed-map.md`
- `docs/project-context/weekly-ship-log.md`
- `docs/sessions/story-candidate-layer-result.md`

## Story-Candidate Model Summary

Defined Story Candidates as the planning unit between large Homer chapter blocks and episode arrangements. They are non-canonical, source-linked story or lesson units used to plan future manuscript splits and episode shapes.

The intended flow is:

- Homer manuscript block
- Story Candidate planning card
- approved split into real `ManuscriptBlock`
- real block arranged into an episode
- public material only after later edit/publish workflow

## UI Terminology Updates

The Episode Playground now uses Story Candidate language in user-facing copy:

- `Virtual Chunk Plan` became `Story Candidate Plan`.
- `Virtual chunk` became `Story candidate`.
- `Copy virtual split checklist` became `Copy story checklist`.
- `Copy future block stub` became `Copy future story block stub`.

Technical parser/type names were left stable to avoid unnecessary churn.

## Book-Wide Map Summary

Created a first-pass map for Episodes 7-17. The map identifies Chapters Four, Five, Six, and Eight as the highest-risk oversized future seeds. Chapter Nine is probably too small to stand alone. Chapters Ten, Twelve, and the Ending include rough/quote/fragment material that should remain non-canonical until reviewed.

## Virtual-Splits / Story Data Update

Expanded `virtual-splits.yml` from Episode 7 only to Episodes 7-17. Episode 7 retains the six detailed candidates from the existing split plan. Episodes 8-17 now have lightweight Story Candidate scout entries with summaries only.

No large manuscript prose was copied into the planning file.

## Validation Performed

- Confirmed `learning-to-lead.living.mdx` was not edited.
- Confirmed `podcast-season-1.yml` was not edited.
- Confirmed Story Candidate `sourceBlockId` values resolve to existing manuscript block IDs.
- Final TypeScript, Next build, diff, and status checks were run before commit.

## Known Limitations

- Story Candidate source ranges are summaries, not exact paragraph spans.
- Episode 8-17 candidates are scouts, not final approved split plans.
- The UI still uses existing internal `virtualSplit` variable/type names.
- Story Candidates cannot be rearranged or persisted independently yet; they are planning cards and copy helpers only.

## Intentionally Unchanged

- Manuscript prose
- Real `ManuscriptBlock` entries
- Arrangement YAML
- Publish files
- Episode packet files
- Raw `_inbox` files
- Prisma schema
- Dependencies
- Server writes
- Draft-to-Live behavior
- Public pages
- Research, clip, or production-note promotion

## Recommended Next Book & Episodes Action

Use Episode 7 Story Candidates in Playground to approve the first real Chapter Three split set, then promote only those approved Story Candidates into manuscript blocks.
