# Studio Manuscript Mobile Recording Companion Plan

Date: 2026-05-20

## Purpose

Add a mobile-friendly responsive pass and Recording / Reading companion mode to
the existing `/manuscript` surface so Homer / Scott can use the manuscript while
recording without fighting a desktop-heavy editing interface.

## Why This Comes Before Clips And Comments

Recording support starts with reading, navigation, and reduced accidental edit
risk. Clip markers, recording comments, take markers, and audio sync all depend
on a calm reading surface that already works on phones and tablets. Building the
view layer first keeps the next recording workflow from being anchored to a
desktop-only editor layout.

## Source Of Truth

The long-wall manuscript remains the source of truth. Recording mode is a
responsive viewing and navigation layer around the same TipTap/ProseMirror JSON,
block IDs, author marks, semantic marks, and structure regions. It does not
split the manuscript into separate source pages and does not introduce new
persistence.

## Reducing Accidental Editing

Homer's recording use case is different from Charlie's editing use case:

- Charlie needs import, marking, structure creation, quote review, and export
  controls close to the manuscript.
- Homer needs the words, outline, current focus, and fast jumps to chapters,
  episodes, his own authored parts, and cited quotations.

Recording / Reading mode should therefore make the editor read-only when active
and visually reduce advanced editing and export controls. The interface should
clearly show how to exit recording mode before editing.

## Responsive Layout Goals

- On narrow screens, show the manuscript before dense editing panels.
- Keep a compact sticky mode/status bar available for recording controls.
- Let side-panel modes behave like touch-friendly tabs.
- Keep buttons tappable and wrapping cleanly.
- Avoid horizontal overflow in panels, chips, block IDs, and exports.
- Keep export/import controls below the manuscript and navigation surfaces on
  mobile.

## Accessibility And Readability Goals

- Use comfortable reading line height and font size in Recording mode.
- Preserve contrast for author, semantic, structure, and focus styling.
- Preserve the proven one-scroll script affordance from the old workflow:
  main manuscript stays visually primary, Charlie-added material is easy to
  spot, structure markers stand apart, and quoted/source material remains
  distinguishable without leaving the continuous document.
- Avoid tiny status text walls on phone widths.
- Keep jump buttons reachable by touch.
- Make read-only state explicit with visible copy:
  `Recording mode is view-only. Exit recording mode to edit.`

## Deferred

- Clip markers.
- Recording comments.
- Take markers.
- Audio sync.
- Multi-user collaboration.
- Saved recording presets.
