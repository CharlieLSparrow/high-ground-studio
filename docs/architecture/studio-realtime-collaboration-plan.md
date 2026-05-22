# Studio Realtime Collaboration Plan

Date: 2026-05-22

## Why This Matters

Charlie and Homer need a path toward trusting the same manuscript state at the
same time. That is emotionally important and operationally important: the
manuscript is becoming a shared working surface for writing, review, recording,
and eventual projection handoff.

The current system should not be rushed into hidden collaboration. Manual
snapshots are valuable because they are explicit rollback anchors. Real
simultaneous editing needs its own architecture, tests, access model, and
recovery path.

## Current Source-Of-Truth Model

Studio `/manuscript` currently has three separate concepts:

- browser-local active draft
- manual server snapshots
- manuscript library records that group snapshots by named manuscript

The browser-local draft is the active working copy. Manual snapshots are
explicit cross-device checkpoints. The manuscript library is a named project
container. None of these are live collaboration, autosave, or canonical public
content.

## Target Model

The target collaboration model should add these concepts deliberately:

- collaboration session
- CRDT document
- presence and awareness state
- authenticated room identity
- manual snapshot checkpoint from the collaboration document
- server checkpoints as rollback anchors

Manual snapshots remain sacred. A live room can become a working surface, but it
must be checkpointed into explicit snapshots before the team treats it as a
durable rollback point.

## Proposed Stack

The first implementation direction is:

- Yjs or an equivalent CRDT for shared document state
- a manuscript-shaped CRDT schema for blocks, semantic tags, and metadata
- future WebSocket/Hocuspocus-style provider or equivalent for remote sync
- future auth-scoped collaboration rooms
- future awareness model for presence, cursor, mode, and read-only roles

This sprint adds only local Yjs model code and a browser session lab. It does
not add a provider, WebSocket service, room API, database schema, or production
Manuscript Desk integration.

## Critical Invariants

- Source material is preserved.
- Spans remain addressable.
- Tags remain semantic and actionable.
- Collaboration state can be checkpointed into explicit snapshots.
- Rollback remains sacred.
- Production manual snapshot flow must survive.
- Browser-local active draft behavior must not change until collaboration has
  its own recovery model.

## Current Local Lab

Route:

- `/manuscript/collaboration-lab`

Pure model:

- `apps/studio/src/app/manuscript/collaboration-lab/studio-collaboration-lab-model.ts`

Commands:

- `pnpm studio:collab:test`
- `pnpm studio:collab:checkpoint:test`
- `pnpm studio:collab:adapter:test`
- `pnpm studio:collab:agentic-smoke`

The lab creates two synthetic clients from one shared Yjs baseline update. That
detail matters: independently-created JSON-equivalent Yjs docs do not share the
same CRDT history and can lose concurrent changes during sync. The lab tests
prove the safer baseline seeding pattern before production code depends on it.

## Local Checkpoint Bridge

The collaboration lab also has a local-only checkpoint bridge:

- `apps/studio/src/app/manuscript/collaboration-lab/studio-collaboration-checkpoint-bridge.ts`

Checkpoint version:

- `studio-collaboration-checkpoint-v1`

The bridge proves a Yjs lab client can export a manuscript-shaped checkpoint
with blocks, text, tags, safety flags, and safe Yjs metadata, then import that
checkpoint back into a new synthetic Yjs client.

The checkpoint is not a production manual server snapshot. It does not call the
snapshot API, write localStorage, write a server route, autosave, or mutate the
real Manuscript Desk. It is a bridge contract for a future workflow where a
live collaboration document can deliberately checkpoint into manual snapshots
after access control and rollback rules exist.

Checkpoint safety flags are explicit:

- `syntheticDataOnly: true`
- `serverWrites: false`
- `localStorage: false`
- `productionManuscriptEditing: false`
- `autosave: false`
- `productionSnapshot: false`

## Synthetic Manuscript Adapter Bridge

The collaboration lab now has a synthetic-only adapter bridge:

- `apps/studio/src/app/manuscript/collaboration-lab/studio-collaboration-manuscript-adapter.ts`

Adapter version:

- `studio-collaboration-manuscript-adapter-v1`

The adapter proves a local collaboration checkpoint can become a Manuscript
Desk-compatible synthetic draft subset, validate as a `ManuscriptDraft`, and
roundtrip back into a collaboration checkpoint/client without losing synthetic
blocks, text, tags, empty blocks, or safety flags.

The adapted subset is intentionally narrow:

- title
- ordered paragraph blocks
- block ids
- text
- synthetic author marks
- synthetic collaboration tag metadata
- empty structure regions
- empty quote reviews
- no source file metadata
- no production snapshot metadata

It is not a production Manuscript Desk import. It does not call snapshot APIs,
write localStorage, write server state, autosave, or mutate manual snapshots.
Future production wiring still needs a deliberate checkpoint-to-manual-snapshot
action with access control and rollback rules.

## Non-Goals For This Sprint

- no production simultaneous editing
- no remote server provider
- no DB schema
- no autosave
- no deploy
- no production `/manuscript` save/load change
- no real manuscript text
- no localStorage collaboration state
- no production manual snapshot mutation
- no production Manuscript Desk adapter import
- no public publishing

## Rough 20-Sprint Path

1. Local CRDT lab.
2. Manuscript-shaped CRDT schema.
3. Snapshot export/import from CRDT.
4. Presence/awareness model.
5. Browser two-client lab.
6. Authenticated local WebSocket spike.
7. Room identity model.
8. Manual snapshot checkpoint from collaboration doc.
9. Recovery/rollback tests.
10. Invite/read-only observer mode.
11. Homer-safe staged preview.
12. Conflict UX.
13. Collaboration smoke harness.
14. Private beta route.
15. Cloud Run/WebSocket feasibility.
16. Auth/permissions hardening.
17. Manuscript library integration.
18. Synthetic remote smoke.
19. Real private manuscript trial.
20. Production readiness review.

## Risks To Keep Visible

- JSON-equivalent documents are not necessarily CRDT-equivalent documents.
- Awareness state can be mistaken for saved document state.
- A live room can create false confidence if checkpoints are unclear.
- Autosave can overwrite useful work before conflict semantics exist.
- Room authorization mistakes can expose private manuscript material.
- Cloud Run/WebSocket behavior needs explicit testing before deployment.
- Production manual snapshots must not become an accidental collaboration API.
