# Studio Structure Mode MVP Plan

Date: 2026-05-19

## Decision

Build Structure Mode now as a paste-and-highlight MVP.

This comes before more Writing Desk block management because the fastest useful
Studio workflow is human meaning capture:

```text
paste text -> highlight meaningful span -> assign type -> make card -> arrange
```

The MVP is not an importer. It is a fast human meaning-capture tool.

## Why Paste And Highlight Is Acceptable

Copy/paste is enough for the first usable Structure Mode because it removes the
wrong hard problems:

- no parser decisions
- no manuscript import boundary
- no file writes
- no database migration
- no source licensing workflow
- no editor framework
- no ingestion worker

The real product question is whether highlighted meaning cards help shape a
book chapter, talk, podcast, essay, or research memo. Browser-local paste and
highlight can answer that immediately.

## Difference From Source Tags

The Tagging Desk applies semantic tags to known Studio document blocks and can
create knowledge nodes with provenance.

Structure Mode is looser and faster. It starts with pasted working text, lets a
human capture spans as highlight cards, and arranges those cards into lanes.
Its first job is shaping meaning, not creating durable knowledge records.

## Difference From Writing Blocks

The Writing Desk creates private draft blocks for authored text.

Structure Mode creates highlight cards from source or working material. Cards
can later inspire writing blocks, but they are not manuscript truth and they are
not draft prose containers.

## Highlight Card

A highlight card is one selected span plus context:

- stable browser-local ID
- selected text
- start offset
- end offset
- semantic type
- optional note
- source title
- source type
- created timestamp
- assigned lane

It is small enough to move, compare, park, and reuse while a structure emerges.

## Structure Lane

A structure lane is an arrangement bucket. The MVP lanes are:

- Opening
- Story
- Principle
- Evidence
- Application
- Closing
- Parking Lot

These lanes are intentionally generic. They work across chapters, talks,
podcasts, essays, and research synthesis without pretending to be the final
schema for every format.

## Formats Supported By The Workflow

Structure Mode supports:

- books and book chapters by turning source spans into chapter beats
- talks by capturing hooks, callbacks, TED/public-talk beats, and closing
  images
- podcasts by arranging stories, evidence, questions, and applications
- essays by separating thesis, insight, research, example, and transition
- research by collecting useful spans before synthesis

The same highlighted card can later become a quote candidate, story lead,
principle, episode beat, or parking-lot item.

## Not Included Yet

Do not include in this MVP:

- importers
- TipTap/Yjs
- drag-and-drop dependencies
- embeddings
- database-backed structures
- public projections
- manuscript promotion
- canonical file writes
- multi-user sync
- source rights workflow
- durable provenance model

## Persistence For MVP

Use browser `localStorage` with key:

```text
high-ground-studio.structure-mode.v1
```

The UI must state plainly:

- MVP browser draft
- saved locally in this browser
- not yet synced to Studio database

Export/import JSON gives the user a backup path before database persistence
exists.

## Future Database Path

The durable version should promote the same concepts, not replace the workflow:

- pasted source or imported source document
- highlight/span rows with offsets and source snapshots
- semantic type/tag vocabulary
- structure container
- lane records
- ordered card placements
- provenance from source to card to output

That database-backed path should come after the user confirms the paste,
highlight, and lane workflow is useful.
