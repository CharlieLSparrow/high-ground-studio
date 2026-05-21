# Studio Block Manuscript Editor Smoke Checklist

Date: 2026-05-20

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

The primary working copy is still one browser-local draft in localStorage:

```text
high-ground-studio.manuscript-editor.v1
```

The draft includes:

- schema version
- title
- imported source file name
- import summary with source file name, word count, character count, block count,
  and imported timestamp
- block-range structure regions for chapter/book regions, episodes, and sections
- browser-local cited quotation review metadata keyed by semantic highlight ID
- TipTap/ProseMirror editor JSON
- active author
- author and semantic color toggles
- last updated timestamp

Server snapshots are optional and explicit. When a Studio database is
configured and the Prisma schema has been applied, `Backup` mode can save or
load a full `ManuscriptDraft` JSON snapshot. Opening `/manuscript`, editing,
filtering, entering Focus View, or entering Recording / Reading mode must not
automatically write a server snapshot.

Filter/lens controls are view state only. They do not change the browser-local
draft source data, the localStorage schema, or saved server snapshots unless an
explicit snapshot action is clicked.

Focus View hiding is also view state only. It should hide nonmatching blocks in
the manuscript surface without deleting, rewriting, splitting, or removing them
from the editor JSON.

Quote Focus is a narrower Focus View for cited quotation review. It can filter
by browser-local quote review status and show zero, one, or two surrounding
context blocks, but it must not mutate hidden manuscript blocks.

Recording / Reading mode is also view state only. It makes the editor read-only
and emphasizes outline/navigation controls without changing manuscript JSON,
structure regions, author marks, semantic marks, quote reviews, or the
localStorage schema.

The full manuscript editor is not a canonical database document yet. Optional
server snapshots write only `StudioManuscriptSnapshot` rows when explicitly
saved in a configured environment. The Manuscript Desk does not write remote
Studio document blocks, public projections, `.docx` exports, manuscript MDX, or
imported archive files.

## Manual Server Snapshot Workflow

Use server snapshots only as deliberate checkpoints.

Current behavior:

- Browser-local draft is the active working copy.
- Server snapshots are manual cross-device checkpoints.
- Server snapshots are not autosave.
- Server snapshots are not simultaneous editing.
- Server snapshots are not canonical manuscript truth.
- All currently saved server snapshots are `manual` snapshots.

### Desktop Save

Use this path when the desktop browser has the draft that should be available
on another device:

1. Open `/manuscript` on desktop and sign in with an authorized Studio account.
2. Switch to `Backup`.
3. Confirm `Server connected` reads connected.
4. Confirm the visible browser-local draft is the draft you intend to
   checkpoint.
5. Add a short snapshot note, for example `synthetic phone load smoke`.
6. Click `Save snapshot`.
7. Confirm `Last saved snapshot id` updates.
8. Confirm `Latest snapshot time` updates.
9. Confirm `Local changes since last server save` reads `No`.
10. Export a browser-local full draft JSON backup before moving to real
    manuscript material.

### Phone Load

Use this path when a phone or second browser profile needs the saved checkpoint:

1. Open `/manuscript` on the phone or second browser profile.
2. Sign in with the same authorized Studio account.
3. Switch to `Backup`, or use the mobile tools `Load latest snapshot` action.
4. Click `Refresh` if the snapshot list is stale.
5. Use `Load latest` for the newest checkpoint, or choose a snapshot and click
   `Load selected snapshot`.
6. Accept the replacement prompt only if the current browser-local draft on
   that device can be replaced.
7. Confirm text, block IDs, structure regions, cited quotations, and quote
   review metadata are present.
8. Confirm no server snapshot is saved until `Save snapshot` is clicked.

### Real Manuscript First-Save Checklist

Do not make the first real manuscript save until a synthetic smoke has already
passed.

Before the first real manuscript server snapshot:

1. Confirm the Cloud Run health route is healthy.
2. Confirm `/manuscript` is signed in as the intended Studio account.
3. Confirm the local browser draft is the intended source.
4. Download a full browser-local draft JSON backup.
5. Use a snapshot note that identifies the source and operator.
6. Click `Save snapshot` once.
7. Record the `Last saved snapshot id` and latest snapshot time in the working
   session note.
8. Load the same snapshot on a second browser profile or phone.
9. Confirm text and metadata survive the load.
10. Confirm no autosave or repeated background saves occur.

## Footnote Help Smoke Steps

Use these steps when changing Manuscript Desk help copy or help UI.

1. Open `/manuscript`.
2. Sign in with an authorized Studio account if prompted.
3. Open several `?` help notes in the sidebar, including `Backup`,
   `Server snapshots`, `Browser-local source`, `Local changes since last server
   save`, `Create structure`, `Cited quotations`, and `Quote review`.
4. Confirm each help note opens by mouse click.
5. Use keyboard focus to tab to a help button, press Enter or Space, and confirm
   the help note opens.
6. Press Escape while a help button has focus and confirm the note closes.
7. Use the note's `Close footnote` button and confirm focusable controls still
   work afterward.
8. On a phone or narrow viewport, open mobile `Tools` and confirm the Recording
   mode and Load latest snapshot help buttons work by touch.
9. Confirm opening and closing help notes does not change manuscript text,
   author marks, semantic marks, structure regions, cited quotations, quote
   review metadata, filters, or server snapshot state.
10. Confirm the server snapshot help copy says snapshots are manual checkpoints,
    not autosave and not collaboration.
11. Confirm the Focus View help says hidden blocks are visually hidden only and
    not deleted from the draft.
12. Confirm the help panels stay small enough for dense sidebars and do not
    cover the main manuscript surface on desktop.

## Manual Smoke Script

1. Open `/manuscript`.
2. Sign in with an authorized Studio account if prompted.
3. Confirm the desktop page opens with the manuscript as the central working
   surface, one sticky command bar above it, and one sticky mode-switching
   sidebar beside it.
4. Confirm the command bar shows manuscript title, active author, current mode,
   cited quotation count, saved state, and a backup action without becoming a
   large header.
5. Scroll the manuscript and confirm the command bar and sidebar remain visible
   without obscuring focused manuscript blocks.
6. In the sidebar, switch through `Mark`, `Structure`, `Find`, `Quotes`, and
   `Backup`.
7. Confirm switching modes does not change manuscript text, author marks,
   semantic marks, structure regions, quote reviews, or Focus View state unless
   a specific action button is clicked.
8. In `Backup`, confirm the page says the draft is saved locally in this
   browser, that server snapshots are manual cross-device checkpoints, and that
   the server status shows connection state, latest snapshot time, last saved
   snapshot ID, and local changes since the last server save.
9. Upload a `.docx` containing Scott/Homer manuscript text.
10. If a browser-local draft already exists, confirm the replacement prompt
   appears. Cancel once if needed to verify the existing draft is preserved,
   then import again and confirm.
11. Confirm editable content appears in the manuscript surface.
12. Confirm the import summary shows source file name, word count, character
   count, block count, and imported timestamp.
13. Confirm the page states imported text is Homer / Scott, new writing should be
   Charlie, and backups should be exported before major edits.
14. Confirm the active author is Charlie after import.
15. Confirm the source file name appears in the draft status.
16. Confirm the block inspector lists paragraph, heading, or list-item block
    IDs.
17. Confirm the block count is prominent and there is no missing block ID
    warning.
18. Click a block preview and confirm the editor focuses that block.
19. If imported text was not already marked, click `Mark all as Homer / Scott`
    and confirm active author returns to Charlie for new writing.
20. Select a span and click `Mark Charlie` in the `Mark` sidebar mode.
21. Select another span and click `Mark Homer / Scott`, then `Clear author`.
22. Add new Charlie text in the editor.
23. Use the active author selector or toolbar to mark the new text as Charlie.
24. Select meaningful text, choose a semantic tag, and click
    `Apply semantic highlight`.
25. Select the same text and use the `Mark` mode action area to clear and
    reapply the selected semantic highlight.
26. Confirm author counts update.
27. Confirm semantic highlights appear in the sidebar.
28. Select a multi-block range in the manuscript surface.
29. In `Structure`, choose `Chapter / book`, set `Book label
    preset` to `Preface`, leave the title as `Preface`, and click
    `Capture range`.
30. In the block inspector, click `Set start` on the first block for the
    Preface range.
31. Click `Set end` on a later block for the Preface range.
32. Confirm the pending range summary shows start preview, end preview, block
    count, and `Clear pending range`.
33. Click `Add structure` and confirm the pending range is used instead of the
    current text selection.
34. Confirm the `Preface` structure region appears in the sidebar with the
    title prominent.
30. Confirm the covered blocks show structure-region styling in the manuscript
    surface and matching structure chips in the block inspector.
31. Click `Jump to start` on the Preface structure card and confirm the editor
    focuses the first block in that range.
32. Click `Jump to end` on the Preface structure card and confirm the editor
    focuses the last block in that range.
33. Repeat with `Chapter / book` and `Introduction`.
34. Repeat with `Chapter / book` and `Chapter 0`.
35. Repeat with `Chapter / book`, `Chapter`, and confirm the default title is
    suitable for `Chapter One`.
36. Repeat with `Episode` across an overlapping synthetic block range and
    confirm the default title is suitable for `Episode 1`.
37. Confirm the book regions and episode regions coexist without changing author
    or semantic marks.
38. Click `Edit` on one structure region.
39. Change the title and notes, then click `Save`.
40. Confirm the edited title and notes appear in the inspector and block-region
    chips.
41. Click `Edit` again, change a field, click `Cancel`, and confirm the
    previous saved label remains.
42. Use `Move up` or `Move down` on two regions in the same layer and confirm
    only that layer's order changes.
43. Remove one structure region and confirm the others remain.
44. Click `Suggest book regions from headings`.
45. If existing Chapter / book regions exist, confirm the replacement prompt;
    verify suggested regions are created from Preface, Introduction, Chapter 0,
    and Chapter headings only.
46. Click `Export structure outline Markdown`.
47. Confirm the outline textarea contains `# Manuscript Structure`, grouped
    Chapter / book, Episodes, and Sections entries, block counts, start/end
    previews, and notes where present.
48. Click `Download structure outline Markdown`.
49. Confirm a timestamped `.md` outline downloads.
50. Toggle `Hide author colors`, then confirm author color styling disappears.
51. Toggle `Show author colors`, then confirm author color styling returns.
52. Toggle `Hide semantic colors`, then confirm semantic outline styling
    disappears.
53. Toggle `Show semantic colors`, then confirm semantic outline styling
    returns.
54. Click `Download full draft JSON`.
55. Confirm a timestamped `.json` backup downloads.
56. Click `Download editor JSON`.
57. Confirm a timestamped editor `.json` backup downloads.
58. Click `Download HTML`.
59. Confirm a timestamped `.html` backup downloads.
60. Click `Download plain text`.
61. Confirm a timestamped `.txt` backup downloads.
62. Click `Export editor JSON`.
63. Confirm exported JSON contains block IDs and inline marks but not structure
    regions.
64. Copy the exported editor JSON, paste it into `Import JSON`, and click
    `Import editor JSON`.
65. Confirm the replacement prompt appears if the current draft has content.
66. Confirm text, block IDs, author marks, and semantic marks return after
    import, and structure regions are reset because this is editor JSON only.
67. Recreate one synthetic structure region and edit its title or notes.
68. Click `Export full draft`.
69. Confirm the exported draft includes `schemaVersion`, title, source file
    name, import summary, `structureRegions` with title and optional
    `labelPreset`, editor JSON, active author, display toggles, and last
    updated time.
70. Confirm the full draft JSON preserves the created structure regions and
    edited structure labels.
71. Copy the exported full draft JSON, paste it into `Import JSON`, and click
    `Import editor JSON`.
72. Confirm text, block IDs, inline marks, edited title, edited notes, and
    structure regions return.
73. Click `Export HTML`.
74. Confirm HTML includes manuscript text and data attributes for marks.
75. Click `Export plain text`.
76. Confirm plain text contains the manuscript text without metadata.
77. Refresh the page.
78. Confirm the browser-local draft and edited structure labels survive refresh.
79. Click `Clear local draft`.
80. Confirm the browser prompt.
81. Confirm only `high-ground-studio.manuscript-editor.v1` is removed from
    localStorage.

## Filter Lens Smoke Steps

1. Open `/manuscript`.
2. Confirm the full manuscript surface remains visible.
3. In the sticky sidebar, switch to `Find`.
4. Search by text and confirm matching blocks are listed in the filter results.
5. Filter by `Charlie` and confirm Charlie-marked blocks appear.
6. Filter by `Homer / Scott` and confirm Homer / Scott-marked blocks appear.
7. Filter by a semantic tag and confirm blocks with that semantic highlight
   appear.
8. Filter by a structure region and confirm covered blocks appear.
9. Click `Jump` on a filtered block and confirm the editor focuses that block.
10. With filters active, confirm matching blocks are emphasized in the full
    manuscript surface.
11. Switch visual mode to `Dim nonmatches` and confirm nonmatching blocks dim
    while the full manuscript remains visible.
12. Switch visual mode to `Hide nonmatches` and confirm nonmatching blocks are
    hidden from the manuscript surface while the matching blocks remain visible.
13. Click `Export editor JSON` and confirm hidden blocks are still present in
    the editor JSON.
14. Toggle `Only unstructured blocks`, `Only blocks with semantic highlights`,
    and `Only blocks with no author mark` and confirm each narrows results.
15. Click `Clear filters` and confirm hidden blocks return and manuscript
    filter styling is removed.
16. Click `Export filtered Markdown` and confirm the textarea includes active
    filters, matching block count, block previews, block types, block IDs, and
    structure labels.
17. Click `Download filtered Markdown` and confirm a timestamped `.md` file
    downloads from the browser.

## Cited Quotation Smoke Steps

1. Open `/manuscript`.
2. Confirm the full manuscript surface remains visible.
3. Select a synthetic external quotation or epigraph-like line, not story
   dialogue.
4. Add a `Citation / source note`.
5. Click `Mark cited quotation`.
6. Confirm the selected text receives cited-quotation styling without losing
   its original text, author mark, or structure-region styling.
7. Select the same text and click `Clear cited quotation / semantic`.
8. Reapply `Mark cited quotation`.
9. Switch the sticky sidebar to `Find` or `Quotes`.
10. Click `Show only cited quotations` or set `Semantic tag` to
    `Cited quotation`.
11. Confirm the visual mode changes to `Hide nonmatches`.
12. Confirm only manuscript blocks containing cited quotations remain visible in
    the manuscript surface.
13. Confirm the filter results show blocks containing cited quotations.
14. Confirm the `Cited quotations` list shows quote preview, block context,
    source note, structure chips when present, and a `Jump` button.
15. Click `Jump` and confirm the editor focuses the source block.
16. Click `Review` on the cited quotation.
17. Set `Review status` to `Needs verification`.
18. Fill `Attributed to`, `Source type`, `Source title`, `Locator`,
    `Citation text`, `Rights note`, and `Editor note` with synthetic values.
19. Click `Save review` and confirm the status/source chips update.
20. Refresh the page and confirm the cited quotation review metadata persists
    in the browser-local draft.
21. Click `Review`, then `Remove review metadata`, and confirm the quote remains
    marked while structured review fields reset.
22. Refill and save the review metadata.
23. Click `Clear filters` and confirm the full manuscript wall returns.
24. Click `Export quote Markdown` and confirm the textarea includes quote text,
    block ID, source note, structure labels, review status, attribution, source
    title, locator, citation text, rights note, and editor note when present.
25. Click `Download quote Markdown` and confirm a timestamped `.md` file
    downloads from the browser.

## Quote Focus Controls Smoke Steps

1. Open `/manuscript`.
2. Confirm the full manuscript surface remains visible.
3. Mark several synthetic cited quotations.
4. In the `Cited quotations` list, save different review statuses:
   `Needs source`, `Needs verification`, `Verified`, and `Do not use`.
5. Click `Quote Focus`.
6. Confirm the semantic filter is `Cited quotation`, visual mode is
   `Hide nonmatches`, and only quote-containing blocks are visible.
7. Click `Needs Source Focus`.
8. Confirm only needs-source quote blocks are visible and listed.
9. Click `Needs Verification Focus`.
10. Confirm only needs-verification quote blocks are visible and listed.
11. Use `Previous quote`, `Jump current`, and `Next quote` and confirm the
    editor moves quote-to-quote within the current filtered quote list.
12. Set `Context around matches` to `1 block`.
13. Confirm neighboring blocks remain visible with subtler context styling and
    do not appear as true matching blocks in the filter counts or exports.
14. Set `Quote review status` to `Verified` and confirm the quote list and
    quote Markdown export respect that status filter.
15. Select `No review metadata` if older quote marks exist without saved
    review metadata and confirm only those quotes are listed.
16. Click `Export quote Markdown` and confirm the export uses the current quote
    review status filter when one is active.
17. Click `Exit Focus View`.
18. Confirm all filters clear, visual mode returns to `Highlight matches`, and
    the full manuscript wall returns.
19. Click `Export editor JSON` and confirm hidden blocks are still present in
    the editor JSON.

## Mobile Recording / Reading Smoke Steps

1. Open `/manuscript` on desktop.
2. Narrow the browser width or use a mobile simulator.
3. Confirm the first phone viewport is the manuscript surface, not the full
   desktop header, draft status panel, import toolbar, inspector, export panel,
   or recording outline.
4. Confirm the compact bottom bar shows manuscript mode/status and a `Tools`
   button without pushing the manuscript down.
5. Confirm buttons wrap cleanly and remain tappable.
6. Enable `Recording / Reading mode`.
7. Confirm the first visible thing remains the manuscript or the compact bottom
   bar plus manuscript.
8. Try typing in the manuscript surface and confirm editing is disabled.
9. Confirm advanced import/edit/export controls are below the manuscript or
   collapsed away from the primary mobile reading path.
10. Confirm the script view remains one continuous scroll with main manuscript
    text visually primary, Charlie-marked spans visually distinct, structure
    labels visible, and cited quotations still distinguishable.
11. Open `Tools`.
12. Use `Read Homer / Scott parts`.
13. Confirm the author filter is Homer / Scott, visual mode is Hide nonmatches,
    matching count appears, and only Homer / Scott blocks remain visible.
14. Use `Back to manuscript` and confirm the tools drawer closes without
    clearing the focus.
15. Open `Tools` again and use `Episode outline`.
16. Confirm episode structure regions appear with block counts and Jump start /
    Jump end controls inside the mobile tools drawer or below the manuscript,
    not above the first manuscript viewport.
17. Use `Chapter / book outline`.
18. Confirm chapter/book structure regions appear with block counts and Jump
    start / Jump end controls.
19. Use `Cited quotations`.
20. Confirm cited-quotation blocks are visible and nonmatching blocks are
    hidden.
21. Use `Full manuscript`.
22. Confirm filters clear and the full long-wall manuscript returns while
    Recording / Reading mode remains active.
23. Confirm opening and closing mobile tools does not mutate manuscript data.
24. Exit Recording / Reading mode.
25. Confirm editing controls return below the manuscript path and the
    manuscript surface is editable again.
26. Export editor JSON or full draft JSON and confirm changing modes did not
    remove hidden blocks or mutate manuscript data.

## Server Snapshot Smoke Steps

Run these only in an environment where the Studio database is intentionally
configured and the `StudioManuscriptSnapshot` schema has been applied. Do not
run `db:push`, migrations, or Cloud Run env/secret changes as part of this
smoke checklist unless that work has been separately approved.

1. Open `/manuscript`.
2. Import or create a synthetic manuscript draft.
3. Switch the sticky sidebar to `Backup`.
4. Confirm the server snapshot panel is visible below the browser-local source
   controls, not before the manuscript.
5. Add a short synthetic snapshot note.
6. Click `Save snapshot`.
7. Confirm the UI reports that a server manuscript snapshot was saved.
8. Confirm the recent snapshot list shows title, saved time, word count, block
   count, structure count, and cited quote count.
9. Open `/manuscript` in another browser profile, phone, tablet, or simulator
   signed in as the same Studio actor.
10. Switch to `Backup` and click `Load latest`.
11. Confirm the replacement prompt appears if the second device has a meaningful
    browser-local draft.
12. Confirm the loaded manuscript text, block IDs, structure regions, cited
    quotations, and quote review metadata match the saved snapshot.
13. Confirm the second device now has its own browser-local copy after loading.
14. On a phone/narrow viewport, open `Tools` and confirm `Load latest
    snapshot` is available inside the collapsed tools drawer, not above the
    first manuscript viewport.
15. Confirm no autosave occurs unless `Save snapshot` is clicked again.

If the database is not configured, the server snapshot panel should report that
server snapshots are unavailable while the browser-local backup/download path
continues to work.

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
    "tagType": "cited-quotation",
    "label": "Cited quotation",
    "note": "Synthetic citation/source note"
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
      "labelPreset": "preface",
      "title": "Preface",
      "startBlockId": "block-paragraph-...",
      "endBlockId": "block-heading-..."
    }
  ]
}
```

Structure regions should not appear as inline marks inside text nodes. They are
draft-level block-range annotations.

Look for browser-local cited quotation review metadata in full draft JSON:

```json
{
  "quoteReviews": {
    "semantic-highlight-id": {
      "reviewStatus": "needs-verification",
      "sourceType": "book",
      "attributedTo": "Synthetic attribution",
      "sourceTitle": "Synthetic source",
      "locator": "p. 12"
    }
  }
}
```

Cited quotation review metadata should not appear inside the inline mark itself.
It is draft-level metadata keyed by the semantic highlight ID.

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
