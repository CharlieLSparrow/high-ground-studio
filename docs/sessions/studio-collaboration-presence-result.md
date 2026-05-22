# Studio Collaboration Presence Result

Date: 2026-05-22

## Scope

Added synthetic-only local presence and manuscript margin awareness to the
Studio collaboration lab.

This pass did not wire production `/manuscript` to collaboration, did not add a
provider server, did not persist presence, and did not change manual snapshot
behavior.

## What Changed

- Added `studio-collaboration-presence-v1` pure helpers for Charlie/Homer
  presence state.
- Presence tracks active block, optional active span, mode, last action, and
  stale-state summary.
- Presence safety flags state that it is synthetic, ephemeral, not document
  content, not localStorage, not a server write, and not a durable snapshot.
- `/manuscript/collaboration-lab` now shows presence chips and margin cues in
  the shared manuscript surface.
- The lab can mark Charlie or Homer active on a block or synthetic span without
  changing Yjs document content.
- Agentic smoke now reports presence summary fields and checks presence is
  excluded from snapshots, checkpoints, and Manuscript adapter payloads.

## Boundaries

Presence remains local React state only.

It is not:

- real manuscript content
- durable collaboration document state
- production Manuscript Desk behavior
- a production snapshot
- localStorage state
- server state
- a Yjs provider/server feature
- autosave

## Validation

Run before commit:

```bash
node --check scripts/studio-collaboration-lab.test.mjs
node --check scripts/studio-collaboration-checkpoint-bridge.test.mjs
node --check scripts/studio-collaboration-manuscript-adapter.test.mjs
node --check scripts/studio-collaboration-span-semantics.test.mjs
node --check scripts/studio-collaboration-presence.test.mjs
node --check scripts/agentic-studio-collab-lab-smoke.mjs
pnpm studio:collab:test
pnpm studio:collab:checkpoint:test
pnpm studio:collab:adapter:test
pnpm studio:collab:span:test
pnpm studio:collab:presence:test
pnpm studio:collab:agentic-smoke
pnpm studio:manuscript:test
pnpm --filter studio typecheck
pnpm --filter studio build
git diff --check
```

## Next Recommended Sprint

Add a synthetic comments/review-note layer anchored to spans while keeping the
long manuscript surface primary and keeping comments separate from durable
source text until the checkpoint and rollback model is explicit.
