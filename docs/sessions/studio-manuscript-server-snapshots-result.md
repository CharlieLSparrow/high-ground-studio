# Studio Manuscript Server Snapshots Result

Date: 2026-05-20

## Purpose

Add the first server-backed manuscript persistence foundation for `/manuscript`
so a full browser-local draft can later be saved on desktop and loaded on a
phone or tablet for Recording / Reading mode.

The manuscript remains the working surface. This is not real-time
collaboration, not autosave, and not a canonical manuscript database model.

## What Changed

- Added a proposed `StudioManuscriptSnapshot` Prisma model for full
  `ManuscriptDraft` JSON snapshots.
- Added server-side snapshot helpers under `apps/studio/src/lib/server`.
- Added API routes:
  - `GET /api/manuscript/snapshots`
  - `POST /api/manuscript/snapshots`
  - `GET /api/manuscript/snapshots/latest`
- Added draft validation on snapshot save/load through the existing
  `safeManuscriptDraft` shape.
- Added snapshot metadata summarization for:
  - title
  - source file
  - word count
  - character count
  - block count
  - structure count
  - cited quote count
  - quote review count
- Added Backup-mode controls in `/manuscript`:
  - optional snapshot note
  - save snapshot
  - load latest
  - refresh snapshot list
  - recent snapshot summaries
- Added a mobile Tools action to load the latest server snapshot without moving
  server snapshot controls above the manuscript.

## Product Behavior

Server snapshots are explicit.

Opening `/manuscript`, editing text, changing filters, entering Focus View, or
entering Recording / Reading mode does not automatically write a server
snapshot.

The current browser-local draft remains the active working copy under:

```text
high-ground-studio.manuscript-editor.v1
```

Loading the latest server snapshot replaces the current browser-local draft
only after the existing replacement confirmation path.

## Runtime Boundary

The code path requires a configured Studio database and an applied Prisma
schema before it can save or load snapshots.

This session did not:

- run `pnpm db:push`
- run migrations
- mutate any database
- change Cloud Run environment variables
- change Cloud Run secrets
- change IAM, DNS, OAuth clients, billing, or service accounts
- deploy

If the Studio runtime has no `DATABASE_URL` or the database has not been
updated with the snapshot table, the UI reports that server snapshots are not
available in that environment and browser-local backups still work.

## Collaboration Boundary

This is not concurrent editing.

Manual snapshots solve the immediate cross-device availability problem: Charlie
can save a server copy and Homer can load that latest saved copy on another
device.

True simultaneous editing still needs a separate collaboration architecture
decision covering shared editor state, room authorization, presence,
checkpoints, reconnects, and conflict semantics.

## Boundaries Preserved

- No `.env` changes.
- No database mutation or `db:push`.
- No Cloud Run mutation or deploy.
- No Secret Manager, IAM, DNS, OAuth, or billing changes.
- No canonical manuscript/content path changes.
- No Yjs or real-time collaboration package added.
- No real manuscript text added to tests or fixtures.

## Future Enablement Sequence

This pass does not enable live production snapshots unless the Studio runtime
has a configured database and the snapshot schema has been applied.

Future operator sequence:

1. Decide the database target for Studio snapshots.
2. Apply the `StudioManuscriptSnapshot` schema through the approved Prisma
   migration or schema-sync path for that database.
3. Configure `DATABASE_URL` through the approved Secret Manager and Cloud Run
   environment path.
4. Deploy the Studio image containing the snapshot routes.
5. Sign in with an authorized Studio account.
6. Smoke test with synthetic manuscript data:
   - create or import a synthetic draft
   - save a server snapshot from desktop
   - open `/manuscript` on a second browser/profile/phone
   - load the latest snapshot
   - confirm text, block IDs, structure regions, cited quotations, and quote
     review metadata match
7. Confirm browser-local backup downloads still work.
8. Decide whether autosave or true collaboration is the next persistence step.

Do not use a real canonical manuscript as the first persistence smoke. Use
synthetic data or an approved disposable test import first.
