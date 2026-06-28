# Notebook map writing surface checkpoint - 2026-06-28

## Why this pass happened

The writing surface kept drifting into Quipsly-specific abstractions before proving the OneNote floor. Homer already trusts OneNote because it gives him a simple place model: notebook, section, page. Quipsly needs to preserve that comfort before layering tags, AI, publishing, research graphs, or source provenance on top.

## What changed

- Added `/notebooks/[projectSlug]` as a Nest-specific notebook map.
- `/notebooks` now opens a notebook map first instead of sending the primary action directly into `/create`.
- The notebook map groups existing `StudioDocument` pages into simple sections:
  - Manuscript pages
  - Drafts
  - Notes
  - Sources and research
- Each section has a fast new-page form backed by the existing `createNotebookPage` action.
- Page cards show title, first-block preview, block count, source label, and updated time.
- `/create` remains the page editor and source of writing/editing behavior.

## Data model choice

No schema migration was added in this pass. The route uses existing truth:

- `StudioProject` = notebook/Nest container.
- `StudioDocument` = page.
- `StudioDocumentBlock` = page content blocks.
- `StudioDocument.sourceLabel` = lightweight page kind for section grouping.

This is intentionally reversible. If we later need true first-class `NotebookSection` records, we can migrate from the page kinds and current route behavior without breaking the user-facing model.

## Product rule

OneNote is the floor:

- A writer must always be able to find a notebook, choose a section, open a page, and write.
- Tags, AI, publishing, research packets, and media links are overlays.
- If the notebook path feels harder than OneNote, the clever part is wrong.

## Validation

```bash
./node_modules/.bin/tsc -p apps/quipsly/tsconfig.json --noEmit
```

Result: passed.

## Next best hardening

1. Add real section ordering and optional custom sections without turning it into project management.
2. Make `/create` visually inherit the current notebook/section context.
3. Add a writing-first split view: section/page list on the left, editor on the right.
4. Add a quick capture note path that creates a note page in the current or Home Nest.
5. Keep search useful before making tags more prominent.

