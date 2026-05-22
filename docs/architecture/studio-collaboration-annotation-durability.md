# Studio Collaboration Annotation Durability

Date: 2026-05-22

## Purpose

Studio review notes are currently synthetic, local-only annotations anchored to
spans in `/manuscript/collaboration-lab`. They are React-state-only and are not
stored in Yjs snapshots, collaboration checkpoints, Manuscript adapter payloads,
localStorage, server routes, Prisma, or production manual snapshots.

Before review notes become durable collaboration data, Studio needs a clear
storage decision. Annotations are context attached to spans; they must not
mutate source text, replace the manuscript surface, or turn manual snapshots
into comment warehouses.

## Options Compared

### Annotation Event Log

Annotation operations are appended as durable events: create note, edit note,
mark addressed, archive, restore, and similar operations.

Strengths:

- preserves source text
- supports audit trail
- fits real-time collaboration operations
- supports rollback to an annotation version
- keeps manual snapshots from carrying full comment history

Tradeoff:

- needs replay, compaction, and materialized views before production use

### Checkpoint Metadata

Review notes are embedded directly into collaboration checkpoints or manual
snapshot metadata.

Strengths:

- simple to export with a checkpoint
- easy to prototype

Risks:

- bloats rollback artifacts
- couples comments to whichever checkpoint happened to include them
- weak audit trail unless another event log exists
- makes manual snapshots feel like comment stores instead of rollback anchors

This should not be the primary durable annotation store.

### Separate Annotation Store

Current annotation state is stored separately from source text and manual
snapshots, keyed by manuscript/session/span identity.

Strengths:

- preserves source text
- keeps manual snapshots focused on rollback
- supports query, moderation, current-state UI, and export
- can reference checkpoint or annotation-state versions

Tradeoff:

- needs access control, identity, lifecycle, and a companion operation log for
  full audit history

## Recommendation

Use both:

- `annotation-event-log` for durable collaboration operations and audit trail
- `separate-annotation-store` for materialized current annotation state

Avoid `checkpoint-metadata` as the primary store. Checkpoints and manual
snapshots may reference an annotation state/version later, but they should not
embed all comments by default.

This preserves the product invariant:

```text
source text -> addressable span -> annotation context
```

Manual snapshots remain sacred rollback anchors.

## Current Implementation

Pure comparison helper:

- `apps/studio/src/app/manuscript/collaboration-lab/studio-collaboration-annotation-durability.ts`

Validation:

- `pnpm studio:collab:annotation:test`
- `pnpm studio:collab:agentic-smoke`

The helper creates and validates a synthetic decision record only. It adds no
DB schema, server route, localStorage, production collaboration behavior,
snapshot API calls, autosave, provider server, or deployment.

## Future Production Gates

Before durable review notes can ship, Studio still needs:

- authenticated collaboration rooms
- span identity that survives real edits
- access-controlled annotation operations
- audit log retention and compaction policy
- moderation/recovery flow
- explicit checkpoint-to-manual-snapshot references
- rollback tests proving annotation state does not corrupt source text
- operator approval for any schema/API/persistence work
