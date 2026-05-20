# ADR: Studio Manuscript Persistence And Cross-Device Access

Status: Proposed

Date: 2026-05-20

Implementation note: the first manual snapshot foundation has been added in
code, but the Prisma schema has not been applied to any database in this
session and the live Studio Cloud Run service has not been configured for
manuscript persistence.

## Context

The redesigned Studio Manuscript Desk at `/manuscript` now treats the
manuscript as the primary working surface:

- compact sticky command bar
- central long-wall manuscript surface
- one sticky mode sidebar with `Mark`, `Structure`, `Find`, `Quotes`, and
  `Backup`
- mobile manuscript-first behavior
- Recording / Reading mode
- author marks, semantic highlights, structure regions, quote review metadata,
  Focus View, and export tools

The current manuscript draft source is still browser-local:

```text
high-ground-studio.manuscript-editor.v1
```

The draft shape is a versioned `ManuscriptDraft` JSON envelope containing the
TipTap/ProseMirror editor JSON plus browser-local metadata such as
`structureRegions`, `quoteReviews`, active author, display toggles, import
summary, and timestamps. `safeManuscriptDraft` is the current compatibility
gate for imported or loaded full-draft JSON.

This was the right MVP path. It made full-book editing fast, reversible, and
safe while the Manuscript Desk was being shaped. A real phone test exposed the
next architectural requirement: the manuscript does not automatically appear
across devices because it lives only in the importing browser's localStorage.

That breaks the recording workflow:

- Charlie imports or edits the manuscript on desktop.
- Homer opens Studio on a phone or tablet for Recording / Reading mode.
- The phone has an empty browser-local draft.
- The manuscript is not available on the recording device.
- Recording / Reading mode cannot be useful to Homer without some
  server-backed manuscript availability.

This ADR does not by itself authorize database mutation, migrations, deploys,
Cloud Run configuration changes, or real-time collaboration. The first snapshot
foundation can exist in code while live production snapshots remain disabled
until the database schema and runtime configuration are enabled through an
approved operator path.

## Current Repo Facts

- `/manuscript` is gated by Studio auth via `getStudioAccessState`.
- Studio currently supports Google/NextAuth sessions, temporary allowlist mode,
  and Prisma-backed identity mode.
- In allowlist mode, the session identity can be represented by an email-derived
  id such as `studio-allowlist:<email>`, not necessarily a persisted `User`
  row.
- `apps/studio/src/app/api` currently contains auth and health routes only; no
  manuscript persistence API exists.
- `apps/studio/src/lib/server/studio-persistence-guard.ts` already encodes a
  safety pattern for local-only database writes.
- `prisma/schema.prisma` already contains generalized Studio authoring tables:
  `StudioWorkspace`, `StudioProject`, `StudioDocument`,
  `StudioDocumentBlock`, `StudioTaggedSpan`, and `StudioKnowledgeNode`.
- Those generalized tables are not the current `/manuscript` storage shape.
  The current full-book editor state is a TipTap JSON document plus draft-level
  metadata. Reusing block/span tables immediately would require a migration
  design, not a mechanical save operation.
- The Studio Cloud Run runbook still documents the live MVP as browser-local
  and warns not to add a remote `DATABASE_URL` casually.

## Decision Needed

The team needs to decide which problem is being solved first:

1. Cross-device manuscript availability for recording and review.
2. True simultaneous editing by multiple devices or multiple users.
3. A long-term canonical manuscript database model.

Those are related, but they are not the same decision.

Cross-device availability can be solved with server-backed snapshots while
keeping the browser-local draft as the active working copy.

True concurrent editing is a larger editor architecture choice. It likely means
shared document state, presence, room authorization, conflict semantics,
checkpoint persistence, and a collaboration provider such as Yjs. It should not
be hidden inside a simple JSON snapshot implementation.

## Options Considered

### Option A: Browser-Local Only Plus Manual JSON Transfer

Keep the current localStorage-only model and rely on manual full-draft JSON
download/import between devices.

Benefits:

- lowest implementation risk
- no database schema changes
- no Cloud Run database configuration
- no server-side manuscript data exposure
- current backup/export behavior remains sufficient for solo desktop work

Costs:

- unacceptable for Homer's recording workflow
- easy to load the wrong or stale JSON on a phone
- no shared "latest" version
- burdens the user with file transfer while trying to record
- does not support concurrent editing

Assessment: keep as a safety backup, but not enough for the next product need.

### Option B: Server-Backed Manual Snapshots

Add explicit server save/load for the full `ManuscriptDraft` JSON envelope.
Charlie saves a snapshot. Homer loads the latest snapshot on phone or tablet.
The browser-local draft remains the local working copy until the user
explicitly saves or loads a server snapshot.

Benefits:

- directly solves cross-device availability
- preserves the existing draft JSON shape and import/export compatibility
- avoids per-keystroke server writes
- avoids real-time collaboration complexity
- gives users clear control over when a server copy is created or loaded
- works well with `Backup` mode and Recording / Reading mode
- can reuse `safeManuscriptDraft` server-side before accepting stored data

Costs:

- does not show Charlie's live keystrokes on Homer's device
- users can still overwrite or load stale data if UI copy is unclear
- requires Prisma schema work later
- requires explicit Cloud Run database configuration later
- stores private manuscript content server-side, which raises access,
  retention, logging, and backup questions

Assessment: recommended first implementation slice if the immediate need is
"make the manuscript available on Homer's device."

### Option C: Server-Backed Autosaved Draft

Automatically save the full draft JSON to the server every N seconds, on editor
changes, on blur, or on a debounce.

Benefits:

- reduces reliance on remembering to click "Save snapshot"
- mobile can load a fresher server copy
- creates a visible "last saved to server" product affordance

Costs:

- higher overwrite risk
- more server writes
- harder to reason about when two devices are open
- still not real-time collaboration
- requires conflict detection before it is safe
- can produce false confidence that the remote copy is canonical

Assessment: useful after manual snapshots, but should wait for optimistic
concurrency, snapshot history, and clear conflict messaging.

### Option D: Canonical Manuscript Documents

Treat a server-backed manuscript document as the primary source of truth and
map editor content, block IDs, structure regions, quote reviews, and annotation
metadata into a normalized Studio model.

Benefits:

- better long-term foundation for review, publishing, projections, search, and
  Quote Engine or QuipLore pipelines
- server can query blocks, ranges, annotations, and review state directly
- aligns with the existing Studio direction around private source trails and
  public projection boundaries

Costs:

- much heavier than the immediate recording need
- requires a careful mapping from TipTap JSON to canonical blocks and marks
- introduces migration and backfill work
- risks breaking current full-draft JSON backup compatibility if rushed
- still does not automatically solve simultaneous editing

Assessment: likely future direction, but too much for the first cross-device
availability slice.

### Option E: Real-Time Collaborative Editing

Use a collaboration layer such as Yjs, likely through TipTap collaboration
extensions, so multiple devices or users can share the same manuscript session
at the same time.

Benefits:

- solves actual simultaneous editing and viewing
- supports presence, live cursors, and cross-device continuity
- can make Homer's phone reflect Charlie's current manuscript without manual
  snapshot reloads
- can later support multi-user editorial workflows

Costs:

- largest complexity jump
- requires a provider or sync server decision
- requires room authorization tied to Studio auth
- requires persistent checkpoints so collaborative state survives restarts
- requires conflict and offline semantics
- requires stronger testing around TipTap, Yjs documents, awareness state, and
  browser reconnects
- creates new operational concerns in Cloud Run
- not necessary if the immediate need is read-only recording access to the
  latest saved manuscript

Assessment: worth considering sooner if simultaneous co-editing is now a real
near-term requirement, but it should be a deliberate collaboration ADR and
prototype, not an incidental extension of snapshots.

## Recommendation

Use a phased path.

### Phase 1: Server-Backed Manual Snapshots

Implement manual server snapshots as the next persistence slice once this ADR
is accepted.

Recommended behavior:

- Store the full `ManuscriptDraft` JSON server-side.
- Scope snapshots to the signed-in Studio actor, initially by normalized
  `ownerEmail`.
- Keep browser-local localStorage as the active working copy.
- Add "Save server snapshot" in `Backup`.
- Add "Load latest server snapshot" in `Backup`.
- Add a compact mobile/Recording affordance to load the latest snapshot before
  recording.
- Require an explicit local backup download or confirmation before loading a
  server snapshot over a meaningful local draft.
- Keep full draft JSON browser download as the safety backup.
- Do not add autosave in the first implementation.
- Do not add Yjs or real-time collaboration in the first implementation.

This solves the proven phone/tablet availability problem without changing the
editor architecture.

### Phase 1B: Collaboration Spike If Simultaneous Editing Is Prioritized

If the product decision is now "Charlie and Homer should be able to edit or
review the same manuscript at the same time," start a separate collaboration
track before building autosave.

That track should answer:

- Which collaboration provider will be used?
- Does TipTap/Yjs become the live editor state for `/manuscript`?
- How are collaboration rooms named and authorized?
- How is the current `ManuscriptDraft` envelope snapshotted as a checkpoint?
- What happens when a user opens a stale browser-local draft while a live room
  exists?
- Is Homer recording read-only, comment-only, or edit-capable?
- What are the offline and reconnect semantics?

Manual snapshots can still be useful as checkpoints and backups in a
collaboration future, but they are not themselves a collaboration system.

### Phase 2: Snapshot History And Guarded Autosave

After manual save/load proves useful:

- add snapshot history
- add "last saved server snapshot" status
- add optimistic concurrency with a server revision, ETag, or `baseSnapshotId`
- add autosave only after overwrite handling is clear
- show stale local vs server state explicitly

### Phase 3: Canonical Studio Manuscript Documents

Move from whole-draft JSON snapshots to a canonical Studio manuscript model
only when product needs require queryable and durable server-side manuscript
structure.

Likely triggers:

- review queues across staff
- server-side quote/citation workflows
- public projection pipeline
- publishing workflow
- cross-document search
- fine-grained permissions
- durable block-level audit history

### Phase 4: Real-Time Collaboration

Adopt real-time collaboration only if actual simultaneous editing or live
multi-device review becomes a core workflow.

If adopted, treat Yjs or equivalent shared state as the editor architecture,
with snapshots/checkpoints as durability and recovery, not as the live editing
protocol.

## Proposed Minimal Data Model

Do not edit Prisma in this architecture pass. The next implementation could
start with a small snapshot table shaped like this:

```prisma
model StudioManuscriptSnapshot {
  id              String   @id @default(cuid())
  ownerEmail      String
  title           String
  description     String?
  schemaVersion   Int
  sourceFileName  String?
  draftJson       Json
  contentHash     String?
  clientUpdatedAt DateTime?
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt

  @@index([ownerEmail, updatedAt])
}
```

Rationale:

- `ownerEmail` works in both allowlist mode and database-backed identity mode.
- `draftJson` preserves the current `ManuscriptDraft` envelope without lossy
  transformation.
- `schemaVersion` allows server-side compatibility checks before load.
- `sourceFileName` and `title` make lists readable without parsing JSON.
- `contentHash` can support duplicate detection and cautious conflict messages.
- `clientUpdatedAt` preserves the browser-side draft timestamp separately from
  database timestamps.

Possible later fields:

- `createdByUserId`
- `workspaceId`
- `projectId`
- `baseSnapshotId`
- `snapshotKind`
- `archivedAt`
- `restoredFromSnapshotId`

Those should wait until the ownership and canonical document decisions are
clear.

## API Or Server Action Shape

Do not implement in this pass. A later implementation should choose between
Next server actions and API routes.

Whichever shape is chosen should:

- require `getStudioAccessState()`
- require `canAccessStudio`
- normalize the owner email from the session
- validate incoming JSON with the current manuscript draft validator
- reject unknown draft schema versions
- avoid logging manuscript text
- return timestamps and snapshot ids
- keep destructive replacement behind explicit confirmation in the client

Possible operations:

- list snapshots for the signed-in actor
- save current draft as a snapshot
- load latest snapshot
- load one snapshot by id
- optionally delete or archive a snapshot later

## Consequences

Choosing manual server snapshots first means:

- Homer can open Studio on phone or tablet and load the latest saved manuscript.
- Charlie keeps the fast browser-local editing surface.
- The team keeps the full draft JSON download safety path.
- The first database-backed implementation remains small and reversible.
- The UI must be honest that snapshots are not live collaboration.
- Cloud Run needs a deliberate database/env/secrets update before this can ship.

Choosing collaboration first means:

- the team should not build a simple autosave loop and call it concurrent
  editing
- the implementation must handle live shared state, authorization, persistence,
  reconnects, and conflict semantics
- manual snapshots still make sense as backup/checkpoint infrastructure
- the scope should be planned as a separate product/architecture slice

## Migration Path

1. Keep existing browser-local drafts and backup downloads unchanged.
2. Add the snapshot schema only after explicit approval to change Prisma.
3. Add server-side save/load operations with Studio auth and draft validation.
4. Add `Backup` mode controls:
   - save server snapshot
   - load latest server snapshot
   - list recent snapshots
5. Add a mobile Recording / Reading prompt:
   - load latest server snapshot
   - show server snapshot timestamp
6. Require confirmation before replacing a meaningful local draft from a server
   snapshot.
7. Add smoke tests with synthetic manuscript data only.
8. Add Cloud Run database runtime configuration only after explicit approval for
   env/secrets changes.
9. After usage proves the workflow, add history, concurrency checks, and then
   guarded autosave if still needed.
10. If simultaneous editing is prioritized, write a separate collaboration ADR
    and prototype Yjs or equivalent in isolation before merging it into the
    live manuscript workflow.

## Risks

- Private manuscript content becomes server data once snapshots exist.
- Server snapshots need clear auth and owner scoping.
- Runtime database configuration for Studio Cloud Run is not currently part of
  the browser-local live MVP boundary.
- Allowlist mode can identify users by email-derived session identity rather
  than a durable persisted `User` id.
- Manual snapshots can still be stale if users do not save before recording.
- Autosave can overwrite useful local work unless optimistic concurrency exists.
- Full JSON snapshots are simple, but less queryable than normalized
  manuscript documents.
- Normalizing too early could break export/import compatibility or lose
  TipTap/mark fidelity.
- Real-time collaboration can become an operations and testing project, not a
  small persistence patch.

## Deferred Decisions

- Whether the first persistence implementation uses server actions or API
  routes.
- Exact Prisma model and relation names.
- Whether snapshots belong only to `ownerEmail` or to a future
  workspace/project/document hierarchy.
- Whether live Studio should move from allowlist-only mode to database identity
  mode before manuscript persistence.
- Cloud Run `DATABASE_URL` configuration, Secret Manager wiring, and runtime
  database target.
- Snapshot retention and deletion policy.
- Optimistic concurrency mechanism.
- Autosave cadence.
- Canonical manuscript document model.
- Collaboration provider, if any.
- Yjs room persistence and checkpoint format, if collaboration is chosen.
- Permissions for read-only recording access vs edit access.
- Public projection, Quote Engine, and QuipLore ingestion paths.
