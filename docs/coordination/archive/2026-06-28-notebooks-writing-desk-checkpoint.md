# Notebooks writing desk checkpoint

Date: 2026-06-28

## What changed

`/notebooks` is no longer a compatibility redirect to `/projects`.

It now renders a first-pass `Quipsly Writing Desk` that uses existing Nest and StudioDocument truth:

- Writing-capable Nests only: writing, study, research, fiction, course, mixed.
- Recent pages/documents are visible directly from the desk.
- Each page opens the existing `/create?project=<slug>&document=<id>` surface.
- The create form still uses the existing `createNotebook` server action.
- The page points users back to `/projects` for the full Nest registry.

## Follow-up slice added

The Writing Desk now also supports:

- Search across visible notebook/Nest names, descriptions, kinds, recent page titles, and stable IDs.
- Phrase search across visible `StudioDocumentBlock` titles and bodies, with snippets that open the owning page.
- Fast new page creation inside an existing writing-capable Nest.
- New page creation opens the existing `/create` editor immediately.
- Viewer access gets a plain-English explanation instead of a dead affordance.

The new page action creates a `StudioDocument` and an opening `StudioDocumentBlock`. It checks existing Nest write access before creating anything.

## Product rule reinforced

OneNote is the minimum anxiety bar.

The user should not need to understand Quipsly's entire project/media/publishing worldview before they can:

1. choose a notebook/Nest,
2. open a page,
3. write.

## Architecture rule

This is not a second writing datastore.

The Writing Desk is a friendlier door into existing Nests and StudioDocuments. Future work should strengthen this route and `/create` together instead of creating another disconnected writing product surface.

## Next useful pass

- Add page/section search that searches visible document titles and blocks.
- Make block search jump to or highlight the specific block inside `/create`.
- Make the `/create` sidebar and `/notebooks` labels match exactly: Nest, notebook/document, section, page, block.
- Add a visible breadcrumb in `/create`: Nest -> Page -> focused Chapter/Episode section.
