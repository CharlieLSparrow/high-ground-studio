# Studio Collaboration Annotation Event Log

Date: 2026-05-23

## Purpose

The collaboration lab now proves the next step after the annotation durability
decision: review-note operations can be represented as a synthetic event log and
replayed into materialized annotation state.

This is still not persistence. It is a pure/local contract that prepares the
future durable annotation layer without adding DB schema, server routes,
localStorage, autosave, provider infrastructure, or production Manuscript Desk
wiring.

## Contract

Pure model:

- `apps/studio/src/app/manuscript/collaboration-lab/studio-collaboration-annotation-event-log.ts`

Version:

- `studio-collaboration-annotation-event-log-v1`

Events:

- `review-note-created`
- `review-note-body-edited`
- `review-note-status-changed`

Replay output:

- `StudioCollaborationReviewNoteState`
- `studio-collaboration-annotation-state-v1` materialized current state

The replayed state is a materialized view for inspection. It does not mutate
source text, collaboration snapshots, collaboration checkpoints, Manuscript
adapter payloads, manual snapshots, or production `/manuscript`.

## Snapshot Boundary

The event-log helper can produce a safe reference shape:

- `studio-annotation-event-log-reference-v1`

That reference says:

- checkpoint metadata is not the primary annotation store
- manual snapshots should not embed the full event log by default
- future snapshots can reference an annotation state/version

This keeps manual snapshots as rollback anchors instead of turning them into
comment warehouses.

## Lab Surface

Route:

- `/manuscript/collaboration-lab`

The lab exposes an `Annotation event-log replay` section under the review-note
and durability decision controls. It can append synthetic create/edit/status
events and show replayed/materialized current annotation state in React state
only.

## Tests

Command:

```bash
pnpm studio:collab:annotation-log:test
```

Coverage:

- empty event log validation
- create event replay
- body edit replay
- addressed/archived status replay
- partial replay as rollback/version proof
- duplicate event rejection
- missing note reference failure
- forbidden marker rejection
- safe event-log reference
- event log exclusion from snapshots/checkpoints
- no server writes, localStorage, DB schema, or production manuscript editing

## Future Path

The next production-bound step should still be synthetic/pure:

1. add an annotation materialized-state lab fed by event replay
2. model room/manuscript/span identity for annotation streams
3. prove checkpoint references to annotation state versions
4. only then design DB/API persistence with access control and rollback review
