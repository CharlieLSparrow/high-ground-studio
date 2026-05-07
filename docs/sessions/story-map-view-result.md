# Story Map View Result

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
- `docs/project-context/weekly-ship-log.md`

## Files Changed

- `apps/web/src/app/team/books/learning-to-lead/LivingManuscriptViewerClient.tsx`
- `docs/architecture/story-map-and-story-candidates.md`
- `docs/analysis/book-wide-story-candidate-map.md`
- `docs/project-context/weekly-ship-log.md`
- `docs/sessions/story-map-view-result.md`

## Story Map Summary

Added a top-level `Story Map` view to the internal Learning to Lead viewer. It groups Story Candidate planning cards by episode/chapter and lets Homer/Chuck review the story layer without entering the Episode Playground sequence.

The view shows source block IDs, source chapter/episode context, source range summaries, roles, recommended placements, split recommendations, Charlie support opportunities, notes, and clear planning-only labels.

## Story Candidate Terminology Summary

Created `docs/architecture/story-map-and-story-candidates.md` to define the difference between real `ManuscriptBlock` truth, Story Candidate planning cards, episode arrangements, production state, and public publish truth.

The core rule remains: Story Candidates are planning-only until promoted into real manuscript blocks.

## Copy Helper Summary

Story Map includes read-only clipboard helpers:

- Copy story checklist for an episode/chapter.
- Copy future story block stub for a Story Candidate.
- Copy Homer review list in plain English.

These helpers do not write files.

## Data Expansion Summary

No new data expansion was needed in this pass because `virtual-splits.yml` already contains Story Candidate scout entries for Episodes 7-17 from the prior Story Candidate layer pass.

Updated the book-wide Story Candidate map with a detailed Episode 7 candidate section.

## Validation Performed

- Confirmed `learning-to-lead.living.mdx` was not edited.
- Confirmed no new `ManuscriptBlock` entries were created.
- Confirmed `podcast-season-1.yml` was not edited.
- Confirmed Story Candidate `sourceBlockId` values resolve to existing manuscript block IDs.
- Final TypeScript, Next build, diff, and status checks were run before commit.

## Known Limitations

- Story Candidate source ranges are still summaries, not exact paragraph spans.
- Story Map is read-only and does not persist review decisions.
- The current planning data for Episodes 8-17 is first-pass scout material, not human-approved story ontology.
- Story Candidates cannot be inserted into arrangements until promoted into real manuscript blocks.

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

Use Story Map with Homer to review Episode 7 and mark which Chapter Three Story Candidates should be promoted in the first real manuscript split pass.
