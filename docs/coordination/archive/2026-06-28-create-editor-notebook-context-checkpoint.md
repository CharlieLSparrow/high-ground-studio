# Create editor notebook context checkpoint - 2026-06-28

## Why this pass happened

After adding the `/notebooks/[projectSlug]` notebook map, the editor still needed to feel like the page editor inside that notebook instead of a separate product surface. This matters because the writing lane must meet the OneNote floor before Quipsly-specific tags, AI, publishing, and research workflows become useful rather than stressful.

## What changed

- `/create` now derives a notebook section label from the active `StudioDocument.sourceLabel`.
- `Workspace` receives `notebookSectionLabel`.
- The editor header now shows a quiet breadcrumb:
  - Writing Desk
  - Notebook
  - Section label such as `Manuscript pages`, `Drafts`, `Notes`, or `Sources and research`
- The breadcrumb links back to `/notebooks` and `/notebooks/[projectSlug]`.

## Product rule reinforced

The writing path is:

1. `/notebooks` = bookshelf / writing desk.
2. `/notebooks/[projectSlug]` = notebook map / table of contents.
3. `/create?project=...&document=...` = page editor.

The page editor should never feel like a random schema cockpit. It should feel like opening a page from a notebook.

## Validation

```bash
./node_modules/.bin/tsc -p apps/quipsly/tsconfig.json --noEmit
```

Result: passed.

## Next best hardening

1. Add a left-side page list inside `/create` for faster OneNote-like switching.
2. Add quick capture that creates a `note` page without thinking about structure.
3. Let users move pages between lightweight sections.
4. Preserve the current data model until first-class custom sections are truly needed.

