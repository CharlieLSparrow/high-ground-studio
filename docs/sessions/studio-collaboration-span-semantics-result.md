# Studio Collaboration Span Semantics Result

Date: 2026-05-22

## Summary

Added synthetic span-level collaboration semantics and updated the collaboration
lab toward a manuscript-first surface.

New pure helper:

- `apps/studio/src/app/manuscript/collaboration-lab/studio-collaboration-span-model.ts`

New test command:

- `pnpm studio:collab:span:test`

## Span Model

Synthetic spans are stored in a root-level Yjs span map, separate from block
text and legacy block-level tags.

Each span carries:

- `spanId`
- `blockId`
- `startOffset`
- `endOffset`
- `label`
- `actor`
- `createdAt`
- `tagType: insight`
- `note`

The helpers clamp out-of-range offsets to synthetic block text, reject
zero-length spans, and summarize spans by block. DOM selection is not used in
the pure model.

## Snapshot And Checkpoint Bridge

Collaboration snapshots and `studio-collaboration-checkpoint-v1` now carry an
optional `spans` array. Existing snapshots/checkpoints without spans still
validate and import.

The bridge proves spans survive:

```text
Yjs client -> snapshot -> checkpoint -> imported Yjs client
```

## Manuscript Adapter

The Manuscript adapter now maps synthetic spans into addressable
`semanticHighlightMark` ranges in `ManuscriptDraft.editorJson`.

Policy for this pass:

- spans are sorted by `startOffset`, `endOffset`, then `spanId`
- non-overlapping spans become semantic marks
- overlapping later spans are ignored
- ignored span ids are listed in adapter metadata and warnings
- block-level tags remain paragraph metadata and are not enough for the final
  workflow

Tests prove span-marked text rejoins to the original block text.

## UI

Updated `/manuscript/collaboration-lab` with a shared manuscript surface near
the top:

- one long synthetic manuscript stream
- inline span overlays
- span synced/different indicator
- copy stating that this is the direction and the two-client panels are
  scaffolding

Added synthetic span controls:

- block selector
- actor selector
- start/end offsets
- label
- apply span tag
- span summary

No localStorage, server route, snapshot API, or production Manuscript Desk
wiring was added.

## Agentic Smoke

Extended `pnpm studio:collab:agentic-smoke` with:

- synthetic span creation
- sync to Homer
- checkpoint export
- adapter payload creation
- semantic mark verification

The report now includes:

- `spanRoundtrip`
- `spanCount`
- `semanticMarkCount`
- `manuscriptFirstSurface`
- `noServerWrites`
- `noProductionManuscriptEditing`
- `noLocalStorage`

## Safety Boundary

This pass did not:

- use real manuscript text
- use real HGO content
- alter production `/manuscript` save/load behavior
- enable real simultaneous editing
- write server routes
- call snapshot APIs
- save to localStorage
- add autosave
- add a Yjs provider server
- touch DB/schema or run `db:push`
- mutate Cloud SQL
- deploy
- change Cloud Run, DNS, OAuth, billing, secrets, or IAM
- remove or mutate manual snapshots
- add public publishing
