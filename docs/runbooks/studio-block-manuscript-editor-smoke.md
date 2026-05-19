# Studio Block Manuscript Editor Smoke Checklist

Date: 2026-05-19

## Purpose

Use this checklist to manually smoke test the browser-local Manuscript
Attribution Desk MVP.

This is not a deployment runbook. Do not run Cloud Build, deploy Cloud Run,
mutate Google Cloud resources, change IAM, change DNS, create or mutate
secrets, mutate databases, or write canonical manuscript files while using this
checklist.

## Route And Storage Boundary

Open:

```text
/manuscript
```

The MVP persists one browser-local draft in localStorage:

```text
high-ground-studio.manuscript-editor.v1
```

The draft includes:

- schema version
- title
- imported source file name
- TipTap/ProseMirror editor JSON
- active author
- author and semantic color toggles
- last updated timestamp

The MVP is not database-backed. It does not write Prisma rows, remote Studio
documents, public projections, `.docx` exports, manuscript MDX, or imported
archive files.

## Manual Smoke Script

1. Open `/manuscript`.
2. Sign in with an authorized Studio account if prompted.
3. Confirm the page says the draft is saved locally in this browser and not yet
   synced to the Studio database.
4. Upload a `.docx` containing Scott/Homer manuscript text.
5. Confirm editable content appears in the manuscript surface.
6. Confirm the source file name appears in the draft status.
7. Confirm the block inspector lists paragraph, heading, or list-item block
   IDs.
8. If imported text was not already marked, click `Mark all as Homer / Scott`.
9. Select a span and click `Mark selection as Charlie`.
10. Add new Charlie text in the editor.
11. Use the active author selector or toolbar to mark the new text as Charlie.
12. Select meaningful text, choose a semantic tag, and click
    `Apply semantic highlight`.
13. Confirm author counts update.
14. Confirm semantic highlights appear in the inspector.
15. Toggle `Hide author colors`, then confirm author color styling disappears.
16. Toggle `Show author colors`, then confirm author color styling returns.
17. Toggle `Hide semantic colors`, then confirm semantic outline styling
    disappears.
18. Toggle `Show semantic colors`, then confirm semantic outline styling
    returns.
19. Click `Export editor JSON`.
20. Confirm exported JSON contains block IDs and inline marks.
21. Copy the exported editor JSON, clear the editor or draft, paste it into
    `Import JSON`, and click `Import editor JSON`.
22. Confirm text, block IDs, author marks, and semantic marks return.
23. Click `Export full draft`.
24. Confirm the exported draft includes `schemaVersion`, title, source file
    name, editor JSON, active author, display toggles, and last updated time.
25. Click `Export HTML`.
26. Confirm HTML includes manuscript text and data attributes for marks.
27. Click `Export plain text`.
28. Confirm plain text contains the manuscript text without metadata.
29. Refresh the page.
30. Confirm the browser-local draft survives refresh.
31. Click `Clear local draft`.
32. Confirm the browser prompt.
33. Confirm only `high-ground-studio.manuscript-editor.v1` is removed from
    localStorage.

## What To Inspect In Exported JSON

Look for block node attributes:

```json
{
  "type": "paragraph",
  "attrs": {
    "blockId": "block-paragraph-..."
  }
}
```

Look for separate inline marks:

```json
{
  "type": "authorMark",
  "attrs": {
    "authorId": "homer",
    "authorLabel": "Homer / Scott"
  }
}
```

```json
{
  "type": "semanticHighlightMark",
  "attrs": {
    "tagType": "insight",
    "label": "Insight"
  }
}
```

Authorship and semantic marks should be able to coexist on the same text.
Clearing one should not clear the other.

## Source Truth

For this MVP, use Scott/Homer's original Word document as the import source.
Treat older OneNote and Markdown export attempts as future reference/archive
material, not as the source of truth for the editing workflow.

## Known MVP Limitations

- Drafts are browser-local only.
- Drafts do not sync across browsers or devices.
- Clearing browser storage can remove the draft.
- `.docx` import favors clean text structure over exact Word layout.
- `.docx` export is not implemented.
- There is no database-backed revision history.
- There is no Yjs or real-time collaboration.
- There are no import workers, embeddings, AI features, or public projections.
