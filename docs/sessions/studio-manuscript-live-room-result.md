# Studio Manuscript Live Room Result

Date: 2026-05-25

## Summary

Added the first production shared-editing surface for the private Studio
manuscript workflow.

The new route is:

```text
/manuscript/live
```

It creates authenticated live manuscript rooms backed by Cloud SQL-stored Yjs
updates. Charlie and Homer can open the same room URL, edit one shared text
surface, see active presence, copy the current text, and save the current room
as a manual Manuscript Desk snapshot.

## Implementation

- Added Prisma models:
  - `StudioManuscriptLiveRoom`
  - `StudioManuscriptLiveRoomUpdate`
  - `StudioManuscriptLivePresence`
- Added authenticated Studio API routes:
  - `GET/POST /api/manuscript/live-rooms`
  - `GET /api/manuscript/live-rooms/[roomId]`
  - `GET/POST /api/manuscript/live-rooms/[roomId]/updates`
  - `GET/POST /api/manuscript/live-rooms/[roomId]/presence`
- Added `/manuscript/live` UI with:
  - room creation
  - recent room list
  - shareable room URL
  - Yjs-backed textarea editing
  - update polling
  - presence heartbeat
  - copy text
  - manual snapshot checkpoint
- Added pure live-room model tests.
- Added `Live Room` to Studio navigation.

## Boundary

This is a text-room collaboration surface. It does not replace the full
Manuscript Desk editor and does not preserve rich author marks, quote review
metadata, structure regions, or publishing readiness metadata while editing.

Manual snapshots convert the live text into paragraph blocks so the session can
be checkpointed into the existing Manuscript Desk recovery path.

No public content is written and no episode page is published.

## Validation

Passed:

```bash
pnpm db:generate
pnpm studio:manuscript:live-room:test
pnpm studio:cloudrun:test
pnpm --filter studio typecheck
pnpm --filter studio build
git diff --check
```

The first local Studio build attempt hit the known Turbopack sandbox
port-binding error. Rerunning the same build outside the sandbox passed.

## Deployment Notes

The schema change is additive and requires a Prisma `db push` before the live
route can create rooms in production.

Deploy Studio after the schema is synced.
