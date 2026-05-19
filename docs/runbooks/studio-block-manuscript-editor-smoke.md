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
- import summary with source file name, word count, character count, block count,
  and imported timestamp
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
5. If a browser-local draft already exists, confirm the replacement prompt
   appears. Cancel once if needed to verify the existing draft is preserved,
   then import again and confirm.
6. Confirm editable content appears in the manuscript surface.
7. Confirm the import summary shows source file name, word count, character
   count, block count, and imported timestamp.
8. Confirm the page states imported text is Homer / Scott, new writing should be
   Charlie, and backups should be exported before major edits.
9. Confirm the active author is Charlie after import.
10. Confirm the source file name appears in the draft status.
11. Confirm the block inspector lists paragraph, heading, or list-item block
    IDs.
12. Confirm the block count is prominent and there is no missing block ID
    warning.
13. Click a block preview and confirm the editor focuses that block.
14. If imported text was not already marked, click `Mark all as Homer / Scott`
    and confirm active author returns to Charlie for new writing.
15. Select a span and click `Mark Charlie` in the selection actions area.
16. Select another span and click `Mark Homer / Scott`, then `Clear author`.
17. Add new Charlie text in the editor.
18. Use the active author selector or toolbar to mark the new text as Charlie.
19. Select meaningful text, choose a semantic tag, and click
    `Apply semantic highlight`.
20. Select the same text and use the compact selection action area to clear and
    reapply the selected semantic highlight.
21. Confirm author counts update.
22. Confirm semantic highlights appear in the inspector.
23. Toggle `Hide author colors`, then confirm author color styling disappears.
24. Toggle `Show author colors`, then confirm author color styling returns.
25. Toggle `Hide semantic colors`, then confirm semantic outline styling
    disappears.
26. Toggle `Show semantic colors`, then confirm semantic outline styling
    returns.
27. Click `Download full draft JSON`.
28. Confirm a timestamped `.json` backup downloads.
29. Click `Download editor JSON`.
30. Confirm a timestamped editor `.json` backup downloads.
31. Click `Download HTML`.
32. Confirm a timestamped `.html` backup downloads.
33. Click `Download plain text`.
34. Confirm a timestamped `.txt` backup downloads.
35. Click `Export editor JSON`.
36. Confirm exported JSON contains block IDs and inline marks.
37. Copy the exported editor JSON, paste it into `Import JSON`, and click
    `Import editor JSON`.
38. Confirm the replacement prompt appears if the current draft has content.
39. Confirm text, block IDs, author marks, and semantic marks return after
    import.
40. Click `Export full draft`.
41. Confirm the exported draft includes `schemaVersion`, title, source file
    name, import summary, editor JSON, active author, display toggles, and last
    updated time.
42. Click `Export HTML`.
43. Confirm HTML includes manuscript text and data attributes for marks.
44. Click `Export plain text`.
45. Confirm plain text contains the manuscript text without metadata.
46. Refresh the page.
47. Confirm the browser-local draft survives refresh.
48. Click `Clear local draft`.
49. Confirm the browser prompt.
50. Confirm only `high-ground-studio.manuscript-editor.v1` is removed from
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
