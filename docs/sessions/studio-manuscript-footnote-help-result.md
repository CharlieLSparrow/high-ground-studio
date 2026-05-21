# Studio Manuscript Footnote Help Result

Date: 2026-05-21

## Purpose

Add friendly, footnote-style help to `/manuscript` for powerful concepts that
are easy to misunderstand.

This pass is UI and copy only. It does not change manuscript persistence,
server snapshot semantics, database schema, Prisma models, Cloud SQL, Cloud Run
configuration, autosave, collaboration, Yjs, or canonical manuscript/content
paths.

## What Changed

- Added a reusable `ManuscriptHelpTip` disclosure component.
- Added a manuscript help note registry with practical footnote-style copy for:
  - browser-local draft
  - full draft JSON backup
  - server snapshot
  - save snapshot
  - load latest snapshot
  - load selected snapshot
  - local changes since last server save
  - Recording / Reading mode
  - Focus View
  - author marks
  - semantic / meaning tags
  - cited quotation
  - quote review metadata
  - structure region
  - Chapter / book region
  - Episode region
  - Backup mode
  - Mark mode
  - Find mode
  - Quotes mode
- Added help buttons near the dense controls where mistakes are most likely:
  - sidebar mode selector
  - Recording / Reading mode
  - Focus View controls
  - Mark mode author and semantic controls
  - cited quotation controls
  - structure creation controls
  - Find / Quotes filters and quote review controls
  - Backup mode browser-local and server snapshot controls
  - mobile Recording mode and latest snapshot loading

## Product Behavior

Help notes are explicit click/tap disclosures. They are not hover-only, and they
can be reached from the keyboard.

The copy reinforces the current persistence model:

- the browser-local draft is the active working copy
- server snapshots are manual cross-device checkpoints
- server snapshots are not autosave
- server snapshots are not simultaneous editing
- Focus View hides blocks visually only
- marks, tags, quote review metadata, and structure regions are editorial
  metadata, not canonical manuscript truth

## Smoke Guidance

The manual smoke checklist now includes a footnote help section:

- open `/manuscript`
- open several help notes
- verify keyboard/focus behavior
- verify mobile/touch behavior
- confirm help interaction does not mutate manuscript data
- confirm help explains manual server snapshots clearly

## Boundaries Preserved

- No database schema changes.
- No Prisma model changes.
- No Cloud SQL changes.
- No Cloud Run config changes.
- No Secret Manager, IAM, DNS, OAuth, or billing changes.
- No autosave.
- No Yjs or collaboration.
- No canonical manuscript/content path changes.
