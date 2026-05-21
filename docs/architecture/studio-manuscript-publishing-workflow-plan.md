# Studio Manuscript Publishing Workflow Plan

Date: 2026-05-21

## Purpose

Studio Manuscript Desk is not trying to become a generic Google Docs clone.
Google Docs is good at shared document editing. Studio's job is different: make
a large, emotionally loaded manuscript easier to understand, record, review,
and eventually publish without losing the editorial context that makes the work
usable.

The Manuscript Desk should help Charlie and Homer see the whole book, keep
authorship and citation work visible, and export handoff material before any
public projection or canonical publishing system exists.

## Core Advantage

Studio's current advantage is the combination of:

- one long anxiety-lowering manuscript wall
- browser-local working copy safety
- authorship metadata for Charlie and Homer / Scott spans
- structure regions for book, episode, and section ranges
- quote and citation review metadata
- Recording / Reading mode for phone and tablet use
- manual server snapshots for deliberate cross-device checkpoints
- full draft JSON backups for local recovery
- future collaboration paths that can be designed deliberately instead of
  accidentally bolted onto snapshots

That combination is the product. The manuscript stays central, and the tool
surfaces editorial readiness around it.

## Publishing Workflow Phases

### 1. Imported Manuscript

The starting point is a full manuscript import or browser-local draft. The
draft remains in local browser storage until the user explicitly downloads a
backup or saves a manual server snapshot.

The key questions:

- Did the import preserve the blocks?
- Does the source file name and import summary look right?
- Has a full JSON backup been downloaded before serious work?

### 2. Authorship Cleanup

The desk uses inline author marks to distinguish Charlie additions, Homer /
Scott source material, and unassigned spans.

The key questions:

- Are large spans still unassigned?
- Are Charlie additions visible enough for review?
- Is Homer / Scott material easy to isolate for reading or recording?

These marks are editorial metadata. They are not legal authorship truth.

### 3. Structure Cleanup

Structure regions turn the wall into a map. Chapter / book regions help the
book take shape. Episode regions help recording and handoff. Section regions
help local editorial work.

The key questions:

- Are there Chapter / book regions?
- Are there Episode regions when recording handoff is needed?
- Are important blocks outside any structure region?
- Do region titles and notes give a human enough context?

### 4. Quote And Citation Review

Cited quotation marks and quote review metadata make source risk visible before
publishing or recording.

The key questions:

- Which quotations need sources?
- Which quotations need verification?
- Which quotations are marked do not use?
- Which quotations have no review metadata?
- Are rights notes and editor notes present where needed?

### 5. Recording Handoff

Recording handoff should give Homer a clean packet before the phone or tablet
is opened for Recording / Reading mode.

The packet should include:

- quick instructions
- episode outline
- chapter / book outline
- Homer / Scott material summary
- Charlie additions summary
- cited quotations to watch
- before-recording checklist
- after-recording notes placeholder

This is a human handoff packet, not a publishing command.

### 6. Publishing Packet Export

Publishing packet export gathers the current draft shape into a portable
Markdown packet for review outside the app.

It should include:

- title and generated timestamp
- source file name if available
- stats summary
- readiness warnings
- structure outline
- content grouped by Chapter / book regions when available
- fallback full block list when structure is missing
- quote review appendix summary

It is a working export, not canonical public truth.

### 7. Future Public Projection

Later, Studio may project selected, reviewed manuscript material into public
pages, member content, Quote Engine, QuipLore, or other publishing surfaces.

That future should be built from an explicit canonical publishing model, not by
quietly treating the current browser-local draft or manual snapshot table as
public content.

## Intentionally Not Built Yet

This plan does not build:

- canonical publishing database
- public pages
- public projection pipeline
- QuipLore integration
- Quote Engine integration
- Yjs collaboration
- simultaneous editing
- autosave
- server-side Markdown file generation
- writes to canonical manuscript/content paths

Those are separate product and architecture decisions.

## Near-Term Foundation

The first publishing foundation should stay app-local and reversible:

- pure readiness helpers
- pure Markdown export helpers
- `/manuscript` Publish mode
- browser downloads only
- no server writes from export actions
- synthetic test data only
- docs and smoke checks that reinforce the boundary

This makes Studio more useful immediately while keeping the future
collaboration and publishing architecture open.
