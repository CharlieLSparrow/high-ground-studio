# Studio Collaboration Review Notes Result

Date: 2026-05-22

## Scope

Added synthetic-only span-anchored review notes to the local Studio
collaboration lab.

This pass did not wire production `/manuscript` to collaboration, did not add a
server provider, did not persist notes, and did not change manual snapshot
behavior.

## What Changed

- Added `studio-collaboration-review-notes-v1` pure helpers.
- Review notes attach to synthetic spans and retain the span id and block id.
- Notes can be authored by Charlie or Homer.
- Notes support `open`, `addressed`, and `archived` status.
- `/manuscript/collaboration-lab` can add a local note, mark it addressed, and
  archive it.
- The shared manuscript surface shows note counts in the manuscript margin and
  span chips.
- Agentic smoke now creates span-anchored notes, checks status summaries, and
  proves notes do not mutate source text.

## Model Decision

Review notes are React-state-only for this sprint.

They are excluded from:

- Yjs collaboration snapshots
- collaboration checkpoints
- Manuscript adapter payloads
- localStorage
- server routes
- production manual snapshots

This keeps the lab safe while preserving the future option to make review notes
durable annotation events, checkpoint metadata, or records in a separate
annotation store.

## Boundary

Presence and review notes are intentionally separate:

- presence is ephemeral awareness
- review notes are local annotations
- source text remains separate from both

Review notes are not source text and do not change block text.

## Validation

Run before commit:

```bash
node --check scripts/studio-collaboration-lab.test.mjs
node --check scripts/studio-collaboration-checkpoint-bridge.test.mjs
node --check scripts/studio-collaboration-manuscript-adapter.test.mjs
node --check scripts/studio-collaboration-span-semantics.test.mjs
node --check scripts/studio-collaboration-presence.test.mjs
node --check scripts/studio-collaboration-review-notes.test.mjs
node --check scripts/agentic-studio-collab-lab-smoke.mjs
pnpm studio:collab:test
pnpm studio:collab:checkpoint:test
pnpm studio:collab:adapter:test
pnpm studio:collab:span:test
pnpm studio:collab:presence:test
pnpm studio:collab:review:test
pnpm studio:collab:agentic-smoke
pnpm studio:manuscript:test
pnpm --filter studio typecheck
pnpm --filter studio build
git diff --check
```

## Next Recommended Sprint

Add a synthetic annotation export decision record that compares three future
durability options: annotation event log, checkpoint metadata, and separate
annotation store. Keep production `/manuscript` untouched until that decision is
explicit.
