# Studio Collaboration Lab Result

Date: 2026-05-22

## Summary

Added the first local-only Studio simultaneous-editing foundation:

- `/manuscript/collaboration-lab`
- `apps/studio/src/app/manuscript/collaboration-lab/studio-collaboration-lab-model.ts`
- `pnpm studio:collab:test`
- `pnpm studio:collab:agentic-smoke`

The lab uses Yjs locally with synthetic manuscript-like blocks. It does not add
a provider, WebSocket server, database schema, production `/manuscript`
integration, autosave, localStorage state, or deployment.

## Important Finding

The tests caught a real CRDT issue: two independently-created Yjs docs with the
same JSON shape do not share the same CRDT history. Different-block edits and
tags can be lost during sync if clients are not seeded from the same baseline
update.

The model now creates paired clients from one shared Yjs baseline update. That
is the pattern future collaboration work should preserve.

## Tests

Added:

- `scripts/studio-collaboration-lab.test.mjs`

Coverage:

- two clients start from the same synthetic manuscript
- different block edits converge after sync
- tags from both clients survive
- exported snapshot imports into a third client
- concurrent same-block edits do not crash
- empty blocks are retained and reported
- missing block edits are rejected safely
- no real-content markers appear
- no server-write flags are set

## Agentic Smoke

Added:

- `scripts/agentic-studio-collab-lab-smoke.mjs`

Report:

- `artifacts/agentic-smoke/studio-collab-lab-report.json`

The smoke creates Charlie and Homer synthetic clients, applies synthetic edits
and tags, syncs them, exports a synthetic snapshot, imports it into a third
client, and writes a machine-readable convergence report.

## Safety Boundary

This sprint did not:

- use real manuscript text
- use real HGO content
- alter production `/manuscript` save/load behavior
- enable production simultaneous editing
- add autosave
- write localStorage collaboration state
- add server routes
- touch DB/schema or run `db:push`
- mutate Cloud SQL
- deploy
- change Cloud Run/DNS/OAuth/billing/secrets/IAM
- add a Yjs provider server
- add public publishing

Manual snapshots remain separate rollback anchors.
