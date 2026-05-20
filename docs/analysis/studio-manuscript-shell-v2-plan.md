# Studio Manuscript Shell V2 Plan

Date: 2026-05-20

## Purpose

Redesign the `/manuscript` page shell so the transcript/manuscript is the
first-class citizen on desktop, tablet, and mobile.

## Manuscript Is King

The product is not a menu cockpit. The core experience is the long-wall
manuscript with tools attached to it. Charlie and Homer / Scott should always
know where the words are, what mode they are in, and how to return to the full
manuscript.

## Why The Old Shell Was Too Heavy

The earlier desktop shell had a large header, a draft status panel, an optional
recording control panel, a left import/toolbar column, the manuscript, and a
right inspector. That made the manuscript compete with controls and made the
page feel like a set of admin panels around a document.

## New Shell

The v2 shell should use:

- One sticky top command bar for status and primary exits.
- One central manuscript surface.
- One sticky mode-switching sidebar for tools.

The command bar should be compact. It should show current mode, recording
state, active author, focus status, cited quotation count, last save, and a
quick backup action without becoming a second toolbar.

The sidebar should expose modes by recognition:

- Mark.
- Structure.
- Find.
- Quotes.
- Backup.

## Device Support

Desktop and tablet get the sticky command bar plus a sticky sidebar. The
manuscript remains the large central scroll surface.

Phone widths keep the manuscript-first repair: the first viewport is the
manuscript, with compact bottom tools and no dense panels above the text.

## Recording Use

Recording / Reading mode should still make the manuscript read-only and keep
the script visually calm. Recording controls and outlines live in the sidebar
or mobile drawer, not above the manuscript.

## Progressive Disclosure

Primary state and exits stay visible in the command bar. Advanced actions move
behind sidebar modes:

- Marking actions in `Mark`.
- Structure range and outline actions in `Structure`.
- Filters and Focus View in `Find`.
- Quote review in `Quotes`.
- Import/export and browser-local warnings in `Backup`.

## Status, Exits, And Backup

The command bar should keep exits visible:

- Exit Recording / Reading mode.
- Exit Focus View / return to full manuscript.
- Quick backup download.

Browser-local storage warnings remain clear, but they should not sit above the
manuscript as the first desktop or mobile experience.

## Deferred

- Keyboard shortcuts.
- Command palette.
- Saved layouts.
- Clip/comment markers.
- Collaborative editing.
