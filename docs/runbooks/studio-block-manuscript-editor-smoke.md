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
configured and the Prisma schema has been applied, `Backup` mode can create a
named manuscript record, save a full `ManuscriptDraft` JSON snapshot under that
manuscript, or load the latest snapshot for a selected manuscript. Existing
snapshots without a manuscript id remain loadable as legacy/orphan snapshots.
Opening `/manuscript`, editing, filtering, entering Focus View, or entering
Recording / Reading mode must not automatically write a server snapshot.

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
server snapshots write `StudioManuscriptSnapshot` rows only when explicitly
saved in a configured environment. The Manuscript Library can write
`StudioManuscript` metadata rows, but it does not write remote Studio document
blocks, public projections, `.docx` exports, manuscript MDX, or imported
archive files.

## Manual Server Snapshot Workflow

Use server snapshots only as deliberate checkpoints.

Current behavior:

- Browser-local draft is the active working copy.
- Named manuscripts are library parents for manual snapshots.
- Synthetic smoke manuscripts are marked separately from working manuscripts.
- Server snapshots are manual cross-device checkpoints.
- Server snapshots are not autosave.
- Server snapshots are not simultaneous editing.
- Server snapshots are not canonical manuscript truth.
- All currently saved server snapshots are `manual` snapshots.
- Existing snapshots without a manuscript id remain loadable as legacy/orphan
  snapshots.

### Desktop Save

Use this path when the desktop browser has the draft that should be available
on another device:

1. Open `/manuscript` on desktop and sign in with an authorized Studio account.
2. Confirm the Save and Share panel is visible without turning on Dev Mode.
3. Confirm `Server connected` reads connected.
4. Confirm the visible browser-local draft is the draft you intend to
   checkpoint.
5. Click `Save manuscript`.
6. Confirm the Save and Share status reports the latest saved time.
7. Confirm `Local changes since last server save` reads `No`.
8. Use `Copy phone link` when another device needs the saved checkpoint.
9. Turn on Dev Mode only for named manuscript selection, raw export/import,
   synthetic smoke testing, or publish/handoff packet generation.

### Phone Load

Use this path when a phone or second browser profile needs the saved checkpoint:

1. Open `/manuscript/live/latest` on the phone or second browser profile to
   load the newest saved server snapshot directly, or open `/manuscript` for
   manual selection.
2. Sign in with an authorized Studio account.
3. If using `/manuscript`, use the Save and Share `Load latest` action.
4. Turn on Dev Mode only if you need the older named-manuscript selector,
   selected snapshot picker, or raw export/import controls.
5. Accept the replacement prompt only if the current browser-local draft on
   that device can be replaced.
6. Confirm text, block IDs, structure regions, cited quotations, and quote
   review metadata are present.
7. Confirm no server snapshot is saved until `Save manuscript` is clicked.

### Real Manuscript First-Save Checklist

Do not make the first real manuscript save until a synthetic smoke has already
passed.

Before the first real manuscript server snapshot:

1. Confirm the Cloud Run health route is healthy.
2. Confirm `/manuscript` is signed in as the intended Studio account.
3. Confirm the local browser draft is the intended source.
4. Download a full browser-local draft JSON backup.
5. Create or select the intended named manuscript in `Manuscript library`.
6. Confirm it is not a synthetic manuscript record.
7. Use a snapshot note that identifies the source and operator.
8. Click `Save to manuscript` once.
9. Record the `Last saved snapshot id` and latest snapshot time in the working
   session note.
10. Load the same manuscript snapshot on a second browser profile or phone.
11. Confirm text and metadata survive the load.
12. Confirm no autosave or repeated background saves occur.

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

## Sticky Glass Shell Smoke Steps

Use these steps when changing the desktop or tablet Manuscript Desk shell.

1. Open `/manuscript` on a desktop-width browser.
2. Load or create a long synthetic manuscript draft.
3. Scroll deep into the manuscript and confirm the command bar stays visible as
   a thin translucent rail, not a tall opaque panel.
4. Confirm the command bar still shows the manuscript title, active author,
   current mode, cited quote count, saved time, and any active Focus View or
   Recording / Reading state.
5. Confirm the Recording / Reading toggle, Full manuscript button when Focus
   View is active, and Backup button remain available.
6. Confirm the mode sidebar stays visible while the manuscript scrolls.
7. Scroll long sidebar content in `Structure`, `Quotes`, and `Backup`; confirm
   the sidebar scrolls internally and its top content does not disappear behind
   the command bar.
8. Use a block preview, `Jump to start`, `Jump to end`, and quote navigation;
   confirm the focused block does not land hidden underneath the sticky command
   bar.
9. Open help footnotes near the command bar and near the top and bottom of the
   sidebar; confirm the help panels appear above the sticky shell and are not
   clipped by sidebar scrolling.
10. Narrow the browser to phone width and confirm the manuscript remains the
    first meaningful visible content, the desktop shell is hidden, and the
    mobile bottom tools remain the control path.
11. Confirm these shell interactions do not change manuscript text, author
    marks, semantic marks, structure regions, cited quotations, quote review
    metadata, filters, or server snapshot state.

## Real Manuscript Entry Checklist

Use synthetic manuscript text only until this checklist is complete.

1. Open `/manuscript`.
2. Switch to `Publish`.
3. In `Real manuscript readiness`, click `Load synthetic smoke draft`.
4. Confirm the synthetic draft appears with fake-only text, headings, author
   marks, semantic tags, cited quotations, quote reviews, and structure
   regions.
5. In `Backup`, save a synthetic server snapshot with a clear synthetic-only
   note.
6. Open a phone or second browser profile.
7. Load the latest synthetic snapshot.
8. Confirm the synthetic text, author marks, structure regions, cited
   quotations, and quote review metadata survive the trip.
9. Return to `Publish` and generate the publishing packet.
10. Generate the recording handoff.
11. Generate the quote appendix.
12. Download a full draft JSON backup.
13. Check the readiness confirmations for synthetic server snapshot save,
    phone / second-browser load, and full draft JSON backup.
14. Confirm the gate says `Ready to import real manuscript`.
15. Only then import the real manuscript.
16. Immediately download a full draft JSON backup after real import.
17. Save the first real server snapshot with a clear note.
18. Confirm no autosave, collaboration, canonical content write, or public
    publishing action happened during the smoke.

## Collaboration Lab Boundary Smoke

Use this when changes touch the local collaboration lab. This route is not the
production Manuscript Desk and must stay synthetic-only.

1. Open `/manuscript/collaboration-lab`.
2. Confirm the page says local collaboration lab, synthetic data only, no
   server writes, no autosave, and no production manuscript editing.
3. Confirm the shared manuscript surface appears before the Charlie and Homer
   client panels.
4. Add a synthetic span and run two-way sync.
5. Set Charlie active on a synthetic block.
6. Set Homer reviewing a synthetic span.
7. Confirm margin presence cues appear around the shared manuscript surface.
8. Add a synthetic review note to the span.
9. Mark the review note addressed, then archive it.
10. Confirm review notes appear as annotations around the manuscript, not as
    edits to source text.
11. Export a synthetic snapshot and confirm presence and review-note body text
    are not serialized.
12. Create a synthetic checkpoint and confirm presence and review notes are not
    serialized.
13. Create the synthetic Manuscript adapter payload and confirm presence and
    review-note body text are not serialized.
14. Confirm no server snapshot is saved, no localStorage collaboration state is
    written, and production `/manuscript` save/load behavior is untouched.

## Publishing / Handoff Smoke Steps

Use synthetic manuscript text only for this smoke.

1. Open `/manuscript`.
2. Create or load a synthetic draft with at least five blocks.
3. Mark at least one span as Charlie and one span as Homer / Scott.
4. Leave one small synthetic span unassigned so the readiness report can show
   the author warning path.
5. Create one Chapter / book region and one Episode region.
6. Mark one synthetic cited quotation.
7. Add quote review metadata for that quotation.
8. If desired, save one manual server snapshot with a synthetic-only note.
9. Switch to `Publish`.
10. Confirm the readiness summary shows words, blocks, structure counts,
    quote counts, and structure coverage.
11. Confirm snapshot caution text behaves sensibly:
    - unchecked server state says it has not been checked
    - local changes since last server save recommends saving a snapshot before
      handoff
    - a known clean server checkpoint does not imply autosave or collaboration
12. Generate the publishing packet Markdown and confirm it includes title,
    generated timestamp, stats, structure outline, manuscript content, quote
    appendix summary, and warnings.
13. Download the publishing packet Markdown.
14. Generate and download the recording handoff Markdown.
15. Confirm the recording handoff includes quick instructions, Episode outline,
    Chapter / book outline, author material summary, cited quotations to watch,
    before-recording checklist, and after-recording notes placeholder.
16. Generate and download the quote appendix Markdown.
17. Confirm the quote appendix includes quoted text, attributedTo, sourceTitle,
    locator, citationText, reviewStatus, rightsNote, editorNote, block ID, and
    structure labels.
18. Generate and download the author contribution Markdown.
19. Confirm the author contribution export includes Charlie, Homer / Scott, and
    Unassigned summaries plus the reminder that this is editorial metadata, not
    legal authorship truth.
20. Confirm none of the Publish exports create server snapshots, write database
    rows, change manuscript text, change quote metadata, change structure
    regions, or write canonical manuscript/content files.
21. Narrow the browser to phone width and confirm the manuscript remains first,
    Publish controls remain inside the mobile Tools path, and no large
    publishing panel appears above the manuscript.

## Studio To HGO Projection Bridge Smoke Steps

Use synthetic manuscript text only for this smoke.

1. Open Studio `/manuscript`.
2. Switch to `Publish`.
3. Load the synthetic smoke draft.
4. In `HGO projection bridge`, select an Episode region if more than one is
   available.
5. Confirm the bridge warning says synthetic testing is safe, real manuscript
   projection drafts may include quoted text and structure titles, generated
   JSON should be treated as private/staged until citation and public-safety
   review is complete, and real projection drafts should not be pasted into
   public places.
6. Generate HGO episode projection JSON.
7. Confirm the textarea contains projection JSON, not full draft JSON.
8. Confirm the projection JSON omits `editorJson`, `quoteReviews`,
   `structureRegions`, inline marks, and internal Studio structure IDs.
9. Download HGO episode projection JSON.
10. Open HGO `/projection-preview/import`.
11. Paste the projection JSON.
12. Confirm the visual episode page renders with the shared HGO projection
    renderer.
13. Confirm unresolved citation states, pull quote presence, and staged review
    status are visible as warnings.
14. Confirm no server snapshot is saved and no localStorage persistence is
    created by the import page.
15. Confirm no real manuscript text or real HGO content is used.

## Agentic Helper Smoke

Run this before or after manual synthetic smoke when changing the Studio
manuscript, manuscript-library, HGO projection, or HGO import-preview workflow:

```bash
pnpm studio:hgo:agentic-smoke
```

The command uses synthetic data only and writes:

```text
artifacts/agentic-smoke/studio-hgo-smoke-report.json
```

This is currently an API/helper-level smoke. It does not automate Google OAuth,
open a browser, write a server snapshot, publish content, or mutate cloud
resources. It verifies synthetic draft creation, manuscript-library payload
shape, manual snapshot payload shape, HGO projection JSON generation, omission
of raw draft internals, HGO validation warnings, and machine-readable reporting.

Use `docs/runbooks/agentic-studio-hgo-smoke.md` for report interpretation and
future browser-auth notes.

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
configured and the `StudioManuscript` / `StudioManuscriptSnapshot` schema has
been applied. Do not run `db:push`, migrations, or Cloud Run env/secret changes
as part of this smoke checklist unless that work has been separately approved.

1. Open `/manuscript`.
2. Import or create a synthetic manuscript draft.
3. Switch the sticky sidebar to `Backup`.
4. Confirm the Manuscript Library panel is visible below the browser-local
   source controls and above server snapshots.
5. Create a named manuscript from the current synthetic draft.
6. Confirm the manuscript is labeled `Synthetic`.
7. Add a short synthetic snapshot note.
8. Click `Save to manuscript`.
9. Confirm the UI reports that a named manuscript snapshot was saved.
10. Confirm the recent snapshot list shows title, saved time, word count, block
   count, structure count, and cited quote count.
11. Open `/manuscript` in another browser profile, phone, tablet, or simulator
   signed in as the same Studio actor.
12. Switch to `Backup`, refresh the library, select the named manuscript, and
    click `Load latest manuscript`.
13. Confirm the replacement prompt appears if the second device has a meaningful
    browser-local draft.
14. Confirm the loaded manuscript text, block IDs, structure regions, cited
    quotations, and quote review metadata match the saved snapshot.
15. Confirm the second device now has its own browser-local copy after loading.
16. On a phone/narrow viewport, open `Tools` and confirm `Load latest
    snapshot` is available inside the collapsed tools drawer, not above the
    first manuscript viewport.
17. Confirm old snapshots without a selected manuscript remain loadable from
    the legacy/all snapshot path.
18. Confirm no autosave occurs unless a manual save button is clicked again.

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

- Classic `/manuscript` desk drafts are browser-local until saved or handed off.
- Classic `/manuscript` desk drafts do not sync across browsers or devices
  without a manual save/load or live-room handoff.
- Clearing browser storage can remove the draft.
- `.docx` import favors clean text structure over exact Word layout.
- `.docx` export is not implemented.
- There is no database-backed revision history.
- The production-ish co-editing path is `/manuscript/collab/latest`: one
  token-gated shared Yjs room backed by the `studio-collab` service. It is not
  a general room list or full revision-history system yet.
- The separate local-only synthetic lab still exists at
  `/manuscript/collaboration-lab` for CRDT and annotation modeling.
- Collaboration lab span semantics are synthetic text-offset spans only. They
  prove the future semantic-mark direction but are not production comments,
  real source spans, or Manuscript Desk save/load wiring.
- There are no import workers, embeddings, AI features, or public projections.
- Structure regions are browser-local and block-range based.
- There is no drag-reorder or database-backed structure history yet.

## Optional Collaboration Lab Smoke

This is separate from the production Manuscript Desk smoke.

1. Open `/manuscript/collaboration-lab`.
2. Edit a synthetic Charlie block.
3. Edit a different synthetic Homer block.
4. Add one synthetic tag from Charlie.
5. Add one synthetic tag from Homer.
6. Click `Two-way sync`.
7. Confirm the convergence summary says the clients match.
8. Confirm the shared manuscript surface is one continuous synthetic stream,
   not the final product reduced to disconnected cards.
9. Apply a synthetic span tag from the span controls.
10. Confirm the shared manuscript surface shows an inline span overlay.
11. Click `Two-way sync`.
12. Click `Export synthetic snapshot`.
13. Confirm exported JSON appears and includes spans.
14. Click `Create synthetic checkpoint`.
15. Confirm checkpoint JSON appears.
16. Click `Import checkpoint back into new synthetic client`.
17. Confirm imported-client summary appears.
18. Click `Create synthetic Manuscript adapter payload from checkpoint`.
19. Confirm adapter JSON appears and says production import is `no`.
20. Click `Validate adapter payload`.
21. Click `Convert adapter back to collaboration client`.
22. Confirm adapter roundtrip summary appears.
23. Confirm the page still says no server writes, no production manuscript
    editing, no autosave, and no localStorage.

Do not use real manuscript text in the collaboration lab.
