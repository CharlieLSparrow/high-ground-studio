# 2026-06-28 OneNote Floor Sidebar Pass

## Decision

The Nest writing surface must meet a OneNote-level navigation floor before richer Quipsly concepts are allowed to dominate the UI.

Quipsly can keep its stronger data model underneath, but the author-facing surface should feel like:

- Nest = notebook / workspace
- Notebook section = Writing, Notes, Sources, or All
- Page = the thing a human opens, writes in, renames, duplicates, exports, and returns to
- Structure = chapter / episode outline inside a page or manuscript
- Tools = lenses and workflow helpers, not the primary navigation model

## Patch made

Updated `/apps/quipsly/src/app/(app)/create/ViewFilter.tsx`.

The sidebar now:

- Names the current shelf as a `Notebook section`.
- Renames `Page Shelf` to `Notebook Sections`.
- Shows the active section shortcut in the `You are here` trail.
- Explains that filtering/searching only changes the sidebar view and does not move, rewrite, or publish work.
- Adds a recovery notice when the currently open page is hidden by search/section filters.
- Renames the document list heading to `Pages in <section>`.
- Keeps the existing safe document actions: rename, duplicate as draft, promote note to writing page, quick-create draft/note/source.

## Validation

Ran:

```bash
./node_modules/.bin/tsc -p apps/quipsly/tsconfig.json --noEmit
```

Result: passed.

## Product principle

Familiar nouns reduce systems anxiety.

The user should not need to understand `sourceLabel`, document lineage, semantic tags, or publishing lane state just to find a page and write.

## Next good writing-surface pass

Build the next slice around real notebook comfort:

- Better section/page grouping in the sidebar.
- Dedicated archive/delete flow with recovery.
- Drag or move pages between sections without changing source truth unexpectedly.
- A calmer writing canvas that clearly separates page body, notes, structure, assistant suggestions, and publishing metadata.
- A writing surface smoke script or agent driver that proves: create page, rename page, write blocks, create note, promote note, duplicate draft, export page.
