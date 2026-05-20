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
- block-range structure regions for chapters, episodes, and sections
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
23. Select a multi-block range in the manuscript surface.
24. In the Structure layer controls, choose `Chapter`, enter a synthetic title,
    and click `Capture range`.
25. Click `Add structure`.
26. Confirm the structure region appears in the inspector.
27. Confirm the covered blocks show structure-region styling in the manuscript
    surface and matching structure chips in the block inspector.
28. Repeat with `Episode` across an overlapping synthetic block range.
29. Confirm the chapter and episode regions coexist without changing author or
    semantic marks.
30. Remove one structure region and confirm the other remains.
31. Toggle `Hide author colors`, then confirm author color styling disappears.
32. Toggle `Show author colors`, then confirm author color styling returns.
33. Toggle `Hide semantic colors`, then confirm semantic outline styling
    disappears.
34. Toggle `Show semantic colors`, then confirm semantic outline styling
    returns.
35. Click `Download full draft JSON`.
36. Confirm a timestamped `.json` backup downloads.
37. Click `Download editor JSON`.
38. Confirm a timestamped editor `.json` backup downloads.
39. Click `Download HTML`.
40. Confirm a timestamped `.html` backup downloads.
41. Click `Download plain text`.
42. Confirm a timestamped `.txt` backup downloads.
43. Click `Export editor JSON`.
44. Confirm exported JSON contains block IDs and inline marks but not structure
    regions.
45. Copy the exported editor JSON, paste it into `Import JSON`, and click
    `Import editor JSON`.
46. Confirm the replacement prompt appears if the current draft has content.
47. Confirm text, block IDs, author marks, and semantic marks return after
    import, and structure regions are reset because this is editor JSON only.
48. Recreate one synthetic structure region.
49. Click `Export full draft`.
50. Confirm the exported draft includes `schemaVersion`, title, source file
    name, import summary, `structureRegions`, editor JSON, active author,
    display toggles, and last updated time.
51. Copy the exported full draft JSON, paste it into `Import JSON`, and click
    `Import editor JSON`.
52. Confirm text, block IDs, inline marks, and structure regions return.
53. Click `Export HTML`.
54. Confirm HTML includes manuscript text and data attributes for marks.
55. Click `Export plain text`.
56. Confirm plain text contains the manuscript text without metadata.
57. Refresh the page.
58. Confirm the browser-local draft and structure regions survive refresh.
59. Click `Clear local draft`.
60. Confirm the browser prompt.
61. Confirm only `high-ground-studio.manuscript-editor.v1` is removed from
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

Look for block-range structure regions in full draft JSON:

```json
{
  "structureRegions": [
    {
      "kind": "chapter",
      "title": "Synthetic Chapter",
      "startBlockId": "block-paragraph-...",
      "endBlockId": "block-heading-..."
    }
  ]
}
```

Structure regions should not appear as inline marks inside text nodes. They are
draft-level block-range annotations.

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
- Structure regions are browser-local and block-range based.
- There is no drag-reorder or database-backed structure history yet.
