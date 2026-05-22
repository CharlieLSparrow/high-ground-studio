# Studio Manuscript Library Plan

Date: 2026-05-21

## Current State

Studio `/manuscript` has explicit manual server snapshots backed by
`StudioManuscriptSnapshot`.

That is useful for cross-device work:

- save a snapshot from the browser-local draft
- refresh the snapshot list
- load the latest snapshot
- select and load an older snapshot

But the current mental model is still a flat stack of checkpoints scoped to the
signed-in Studio account. It does not give Charlie a first-class list of named
manuscripts or projects.

## Need

Charlie needs a workbench that can answer:

- which manuscript am I working on?
- which snapshots belong to that manuscript?
- is this a synthetic smoke/test draft or real working material?
- can I load the latest checkpoint for this manuscript without hunting through
  every account snapshot?

Snapshots alone are not enough because a snapshot is an event, not the thing
being worked on. A library needs a durable parent record for the manuscript,
with snapshots underneath it.

## MVP Model

The recommended MVP is:

- `StudioManuscript`
- `StudioManuscriptSnapshot.manuscriptId` as an optional relation

`StudioManuscript` owns the human-facing library identity:

- owner email
- title
- optional description
- optional source file name
- manuscript kind: `WORKING` or `SYNTHETIC`
- latest snapshot timestamp
- archive timestamp for later non-destructive cleanup

Snapshots remain manual full-draft checkpoints. They are not autosave,
collaboration, canonical public content, or live HGO publishing artifacts.

## Backward Compatibility

Existing snapshots do not have a manuscript parent. They remain valid
legacy/orphan snapshots:

- snapshot list routes can still list all account snapshots
- latest snapshot loading still works without a manuscript id
- selected snapshot loading still works by snapshot id
- new manuscript-scoped list/latest calls filter by `manuscriptId`

The UI should make the distinction clear:

- selecting a manuscript saves/loads snapshots under that manuscript
- no selected manuscript falls back to the legacy account-wide stack
- old snapshots remain loadable until a later deliberate migration or cleanup
  pass

No destructive migration is part of the MVP.

## Browser-Local Boundary

The browser-local draft remains the active working copy:

```text
high-ground-studio.manuscript-editor.v1
```

Creating a manuscript record stores only library metadata, not the full draft.
Saving a snapshot remains the explicit action that stores the full
`ManuscriptDraft` JSON on the server.

## Deferred

- autosave
- Yjs or simultaneous collaboration
- canonical public publishing
- live HGO promotion
- deletion or destructive cleanup
- automatic backfill of orphan snapshots
- fine-grained manuscript sharing or ownership transfer

## Operator Notes

This model is additive, but it is still a Prisma schema change. The repo does
not currently keep checked-in Prisma migration history, so applying this to a
target database requires the existing approved `db:push` operator path for that
environment.

This architecture note does not authorize:

- deployment
- Cloud SQL mutation
- Cloud Run configuration changes
- DNS, OAuth, billing, or secret changes
- importing or publishing real manuscript text
