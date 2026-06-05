# Quipsly Editor Spine Lessons Learned

Date: 2026-06-04

Purpose: pass current editor-spine lessons to Codex, Antigravity, and future Quipsly agents before they touch `/create`.

## Product truth

The manuscript is the spine.

Chapter and Episode are structure tags on heading blocks. The document outline is derived from those tagged blocks in document order. Do not create one-off `episode-4` style tags for normal manuscript navigation.

## What worked

- The one living document model is still the right model.
- Backspace at the start of a block and Enter-to-split are intuitive enough to keep improving.
- Tag pills that remove themselves are the fastest cleanup path.
- Outline focus should come from real tagged heading blocks, not manually-created episode lenses.
- Video/editor production state should connect through project slug, episode boundary, and media IDs, not by stuffing video state into manuscript tags.

## What went wrong

- The UI drifted into old episode-lens controls after the product model changed.
- Broad tag menus made the main writing surface feel like a database admin panel.
- Bulk cleanup was too magical for a real manuscript cleanup pass.
- Duplicate block-level tag chips and range-span chips made tags look scarier than they were.
- Reordering sections locally without a persistence story is dangerous and should not be an author-facing control yet.

## Current author-facing rule

In `/create`, expose Chapter and Episode as the primary structure controls.

Richer tags such as quote, show note, voice, clip cue, published episode, and media can still exist for specialized views and cards, but they should not crowd the default manuscript spine controls.

## Cleanup rule

Prefer small reversible cleanup actions:

- click a tag pill to remove that tag
- Clear tags on a single block
- Merge up
- Delete block with undo
- Format one heading at a time

Avoid broad automated cleanup unless it has preview, explicit approval, and an undo ledger.

## Agent rules

- Do not mutate real manuscript content without explicit user approval.
- If you add structure, do it by tagging heading blocks Chapter or Episode.
- If you add media/video behavior, connect it through project, episode boundary, and production room state.
- If you propose a bulk operation, make it preview-first and reversible.
- Keep the default writer flow calm; advanced tooling belongs behind a lens, panel, or assistant approval flow.
