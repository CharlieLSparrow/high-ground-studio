# Living Manuscript Viewer MVP Result

Date: 2026-05-05

## Files Created

- `apps/web/src/lib/server/living-manuscript.ts`
- `apps/web/src/app/team/books/learning-to-lead/LivingManuscriptViewerClient.tsx`
- `apps/web/src/app/team/books/learning-to-lead/page.tsx`
- `docs/sessions/living-manuscript-viewer-mvp-result.md`

## Files Updated

- `apps/web/src/app/team/layout.tsx`

## Parser Behavior

- reads `apps/web/content/books/learning-to-lead/manuscript/learning-to-lead.living.mdx` directly from disk
- resolves the manuscript path safely from either the web app directory or the repo root
- parses simple frontmatter into plain serializable values
- scans for each `<ManuscriptBlock ...>...</ManuscriptBlock>` explicitly instead of relying on one giant regex
- parses these block props when present:
  - `id`
  - `title`
  - `type`
  - `voice`
  - `status`
  - `chapter`
  - `source`
  - `tags`
  - `pairsWith`
  - `quoteRefs`
  - `notes`
- computes `wordCount`
- validates required metadata and unique block IDs

## Viewer Features

- internal route at `/team/books/learning-to-lead`
- full manuscript blocks rendered in source order
- sidebar filter controls for:
  - chapter
  - voice
  - status
  - type
  - tags
- clear filters action
- visible result counts
- collapsible chapter groups in the sidebar
- block anchor links from the sidebar into the manuscript body
- global show/hide metadata toggle
- per-block metadata rendering when enabled
- read-only body rendering as source text, not compiled MDX
- team-nav entry for `Books`

## Validation Performed

- parser executed directly with Node type stripping
- confirmed manuscript title and block count at runtime
- ran `pnpm --filter web build`
- confirmed no manuscript, arrangement YAML, publish files, or episode packets were modified

## Known Limitations

- body text renders as source text paragraphs, not full compiled MDX
- no live editing
- no arrangement overlay yet
- no episode breakdown overlay yet
- no quote reference resolution yet
- no virtualized rendering yet

## Recommended Next Action

Build a second pass that adds arrangement-aware overlays without changing the manuscript source:

1. read the current arrangement YAML alongside the manuscript
2. surface which blocks appear in `book-v1`, `podcast-season-1`, and `public-site`
3. add lightweight arrangement badges or filters to the existing viewer
