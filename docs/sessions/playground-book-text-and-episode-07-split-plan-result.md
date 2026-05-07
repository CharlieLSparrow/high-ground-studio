# Playground Book Text And Episode 7 Split Plan Result

## Branch

- `main`

## Files Inspected

- `docs/sessions/episode-chapter-seeded-playground-result.md`
- `docs/sessions/episode-playground-result.md`
- `apps/web/src/app/team/books/learning-to-lead/LivingManuscriptViewerClient.tsx`
- `apps/web/src/lib/server/living-manuscript.ts`
- `apps/web/src/lib/server/episode-production.ts`
- `apps/web/content/books/learning-to-lead/manuscript/learning-to-lead.living.mdx`
- `apps/web/content/books/learning-to-lead/arrangements/podcast-season-1.yml`
- `apps/web/content/books/learning-to-lead/episode-production/season-one.yml`
- `docs/project-context/weekly-ship-log.md`
- `docs/project-context/season-one-production-state.md`

## Files Changed

- `apps/web/src/app/team/books/learning-to-lead/LivingManuscriptViewerClient.tsx`
- `apps/web/content/books/learning-to-lead/episode-production/season-one.yml`
- `docs/analysis/episode-07-chapter-three-virtual-split-plan.md`
- `docs/analysis/future-episode-chapter-seed-map.md`
- `docs/project-context/weekly-ship-log.md`
- `docs/sessions/playground-book-text-and-episode-07-split-plan-result.md`

## Book-First UI Summary

Episode View now treats Homer/book text as the visible backbone instead of hiding it behind metadata.

Added readable source previews to:

- selected Episode cockpit book-backbone panel
- Episode arrangement cards
- Episode sidebar/list cards
- Draft View selected items when the item source resolves to a manuscript block
- Playground Candidate Pool cards
- Playground Sequence cards

The Playground copy now says the working rule plainly: book text is the backbone, arrange Homer first, then layer Charlie support, clips, and discussion.

## Homer Text Preview Summary

Added a reusable `BookTextPreview` component with local expand/collapse behavior. It shows a short preview by default and uses the existing `SourceText` renderer for expanded full block text.

Homer blocks are labeled `Homer text` and use a warmer book-first treatment. Charlie blocks are labeled as support/reflection material and remain visually readable but secondary.

The sidebar uses a non-interactive short `BookTextSnippet` so episode list cards can show a Homer anchor without nesting buttons inside buttons.

## Oversized Block Cue Summary

Added size cues for manuscript blocks:

- `Maybe split` when `wordCount > 700`
- `Likely too large` when `wordCount > 1800`

The cues appear on Episode cards, Candidate Pool cards, Playground Sequence cards, and source preview panels. These are review cues only and do not split manuscript blocks.

## Episode 7 Split Plan Summary

Created `docs/analysis/episode-07-chapter-three-virtual-split-plan.md`.

Episode 7 currently points to:

- production key: `episode-07`
- arrangement key: `chapter-three-base`
- source block: `homer-chapter-three-none-of-it-works-unless-you-do`
- word count: `1800`

The plan proposes six virtual chunks:

- Mission Goal And MTC Discipline
- Speak Your Language
- None Of It Works Unless You Do
- Let The Other Person Teach
- Trials Make Good Stories
- Someone Has To Be The Adult In The Room

The last chunk is marked park/review because it includes rough companion/location fragments and needs human source judgment before canonical splitting.

## Future Seed Map Summary

Created `docs/analysis/future-episode-chapter-seed-map.md`.

The map covers Episodes 7-17, arrangement keys, source block IDs, source word counts, split risk, cues, and next actions.

High-risk future seeds:

- Episode 8 / Chapter Four: 3,440 words.
- Episode 9 / Chapter Five: 2,011 words.
- Episode 10 / Chapter Six: 3,243 words.
- Episode 12 / Chapter Eight: 2,274 words.

Episode 7 is marked as the first active split-planning target.

## Validation Performed

- manuscript changed: no
- new manuscript block IDs created: none
- Episode 7 arrangement key remains `chapter-three-base`
- arrangement references resolve: passed
- production-state arrangement keys resolve: passed
- `pnpm --filter web exec tsc --noEmit`: passed
- `pnpm --filter web exec next build --webpack`: passed
- `git diff --check`: passed
- final `git status --short --branch`: pending after commit/push

## Known Limitations

- Playground still rearranges full `ManuscriptBlock` IDs and cannot split body ranges.
- Episode 7 chunks are virtual planning units only.
- The split plan uses summaries of the source block, not new polished prose.
- Oversized cues are simple thresholds and do not replace editorial judgment.
- Episode 6 still needs post-recording reconciliation before Chapter Two boundaries become stable.

## Intentionally Unchanged

- Manuscript prose
- Manuscript block splitting
- Arrangement YAML
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

Review Episode 7 in Playground using the virtual split plan, then approve or revise the proposed chunks before creating any real child manuscript blocks.
