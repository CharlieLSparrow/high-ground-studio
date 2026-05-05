# Living Manuscript Episode View Result

Date: 2026-05-05

## Files Changed

- `apps/web/src/lib/server/living-manuscript.ts`
- `apps/web/src/app/team/books/learning-to-lead/page.tsx`
- `apps/web/src/app/team/books/learning-to-lead/LivingManuscriptViewerClient.tsx`
- `docs/sessions/living-manuscript-episode-view-result.md`

## Arrangement Parser Behavior

- reads `apps/web/content/books/learning-to-lead/arrangements/podcast-season-1.yml`
- uses a narrow line-based parser for the current simple YAML shape
- parses:
  - episode key
  - title
  - status
  - ordered block IDs
- resolves block IDs against the living manuscript server-side
- returns plain serializable episode records with:
  - resolved blocks
  - missing block IDs
  - warnings
  - derived primary chapter
  - total word count
- does not require a YAML package dependency

## Book View / Episode View Behavior

- Book View preserves the existing manuscript-first experience grouped by chapter
- Episode View organizes blocks by `podcast-season-1.yml` order instead of manuscript order
- Episode cards show:
  - title
  - episode key
  - status
  - visible/total block counts
  - missing block warnings
- Episode block stamps show:
  - arrangement position
  - title
  - block ID
  - voice
  - type
  - source chapter
  - status
  - word count
  - tags
  - cross-chapter marker when applicable
  - needs-citation marker when applicable
- existing search and metadata filters apply to both views
- the sidebar now switches between chapter groups and episode groups based on the active view mode

## Validation Performed

- ran a direct Node parser check for:
  - manuscript block count
  - podcast arrangement episode count
  - arrangement warning count
- ran `pnpm --filter web build`
- confirmed no manuscript, arrangement YAML, publish files, or episode packet files were modified

## Known Limitations

- only `podcast-season-1.yml` is loaded for arrangement view right now
- `book-v1.yml` does not yet have its own arrangement mode
- no editing or drag-and-drop
- no generated episode output
- no quote resolution yet
- the YAML parser is intentionally narrow and only supports the current arrangement shape

## Recommended Next Action

Add arrangement overlays for the other source-of-truth layers without changing prose:

1. load `book-v1.yml` and expose a third `Book Arrangement` mode
2. optionally surface `public-site.yml` membership as lightweight badges
3. add per-block arrangement membership badges so manuscript review can see where a block is currently used across book, podcast, and public planning layers
