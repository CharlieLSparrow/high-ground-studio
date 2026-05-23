# Studio Collaboration Materialized Annotation State

Date: 2026-05-23

## Purpose

The annotation event log models operations. The materialized annotation state
models the current review-note view derived from those operations.

This split is intentional:

```text
event log -> replay -> materialized annotation state -> UI/query/export
```

The state is still synthetic and local-only. It is a pure contract for future
current-state annotation behavior, not persistence.

## Contract

Pure model:

- `apps/studio/src/app/manuscript/collaboration-lab/studio-collaboration-annotation-state.ts`

Version:

- `studio-collaboration-annotation-state-v1`

The materialized state includes:

- source event-log metadata
- replayed review notes
- indexes by span, block, and status
- summary counts
- safety flags proving no persistence/server/localStorage/schema behavior
- a future snapshot-safe reference shape

## Snapshot Boundary

Materialized annotation state can create:

- `studio-annotation-state-reference-v1`

That reference carries counts and an annotation state version, while explicitly
saying manual snapshots do not embed annotations.

Future manual snapshots may reference annotation state/version when an approved
persistence model exists. They should not become durable comment payloads by
default.

## Lab Surface

Route:

- `/manuscript/collaboration-lab`

The annotation event-log replay panel now also shows the materialized annotation
state reference. This keeps the manuscript surface primary while making the
future current-state layer inspectable.

## Tests

Command:

```bash
pnpm studio:collab:annotation-state:test
```

Coverage:

- materialize from valid event log
- index by span, block, and status
- detached summaries for callers
- safe reference generation
- compare materialized state against source event log
- stale materialized state detection
- source text remains unchanged
- snapshots/checkpoints do not include materialized annotation bodies
- forbidden marker rejection
- unsafe safety flag rejection
- invalid source event log rejection

## Future Path

The next safe collaboration step is room identity and annotation stream
identity:

- manuscript id
- collaboration room id
- span identity
- participant roles
- annotation stream id
- checkpoint-to-annotation-state reference policy

No DB/API/provider work should begin until those contracts are explicit and
tested.
