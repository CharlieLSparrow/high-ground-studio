# Studio First Slice

Date: 2026-05-14

## Purpose

This workflow defines the first real implementation slice after the
`apps/studio` shell. The Studio tagging prototype first proved the loop in
client state. The persistence slice now makes that same loop durable in
development code without widening into editor, search, or projection work.

The goal is not a beautiful editor. The goal is to prove the core Studio loop:

```text
document or source block -> selected span -> semantic tag -> knowledge node
-> relationships/provenance -> future structure/projection/agent use
```

The tagging system is the main interface for meaning. Treat it as architecture,
not decoration.

## Current Prototype Status

The original `apps/studio` prototype proved the loop in local React state:

- one seeded Studio document
- three stable source blocks
- visible block IDs
- excerpt presets plus editable start/end offsets
- semantic tag palette
- span validation through `packages/studio-domain`
- tag applications created in memory
- knowledge nodes extracted from tagged spans
- provenance displayed beside each node
- visible private, draft, not public, and projection-not-approved markers

The original prototype intentionally did not persist anything. Refreshing the
page cleared tag applications and nodes.

## Persistence Slice Status

As of the 2026-05-16 Studio persistence slice, the same loop now has a minimal
Prisma backing in development code:

- `StudioWorkspace`
- `StudioProject`
- `StudioDocument`
- `StudioDocumentBlock`
- `StudioTag`
- `StudioTaggedSpan`
- `StudioKnowledgeNode`

`apps/studio` now server-loads the seed Studio document, ordered blocks, tags,
tagged spans, and knowledge nodes from Prisma when the schema exists. Applying
a tag calls a server action that creates or reuses one tagged span for the same
block/tag/start/end range and creates or reuses the matching knowledge node.

Refresh should preserve persisted tag applications and nodes because the
workbench reloads them from the database instead of client memory.

The seed/bootstrap path is intentionally local-development-only. It creates the
same non-canonical fixture records only when `DATABASE_URL` points at a local
database and `NODE_ENV` is not `production`. When the configured database target
does not look local, the app can show the fixture fallback but disables Studio
writes.

## Auth Boundary Status

As of the 2026-05-16 Studio auth boundary pass, the workbench is private in
code:

- signed-out visitors see a Studio sign-in screen
- signed-in users without an approved role see an access-restricted screen
- approved Studio access currently means one of the existing `OWNER`,
  `TEAM_SCHEDULER`, or `COACH` roles
- the tag creation server action repeats the role check before writing
- created spans and nodes record the signed-in primary email in
  `createdByLabel`

This pass did not add new Studio roles or real `User` foreign-key ownership.
Those remain the next schema decision.

## Starting Boundary

Use the existing shell:

- `apps/studio`

Do not modify `apps/web` unless a shared package or root script needs a narrow
update.

Do not add public projections, Quiplore integration, real-time collaboration,
Cloud Run, Terraform, or agent orchestration in this slice.

## Recommended First Source

Use one real source:

- `apps/web/content/books/learning-to-lead/manuscript/learning-to-lead.living.mdx`

Why:

- it already has `ManuscriptBlock` metadata
- it has stable source block IDs
- it is real Studio material, not mock content
- it already points toward Story Drafts, quote refs, and semantic nodes

If importing that file creates too much parser work, create one seed document in
the database with two or three source blocks copied from a fixture. Keep the
fixture repo-local and clearly non-canonical.

## Proposed Data Shape

Design the schema before editing Prisma.

The next database-backed slice likely needs:

- `StudioWorkspace`
- `StudioProject`
- `StudioDocument`
- `StudioDocumentBlock`
- `StudioTag`
- `StudioTaggedSpan`
- `StudioKnowledgeNode`

Fields to preserve from the first pass:

- stable document ID
- stable block ID
- block order
- source path or source label
- source block external ID when imported from MDX
- span start/end offsets or another explicit span locator
- selected text snapshot
- tag ID and tag label
- node title/body/type
- provenance back to document, block, and span
- created/updated metadata
- review or approval status, even if simple

Do not add embeddings yet. Leave that for the semantic search pass.

Useful pure types and helpers already live in:

- `packages/studio-domain`

That package should stay free of Prisma, React, Next.js, and database access.
Use it as the shared vocabulary for the first schema pass.

## Next Implementation Steps

1. Add a Studio schema plan.
   - Start with a short docs note or session plan.
   - Name the exact Prisma models and indexes before migration.
   - Keep auth roles and data ownership explicit.

2. Add a tiny import/create path.
   - Either import selected `ManuscriptBlock` entries from
     `learning-to-lead.living.mdx`.
   - Or create one Studio document with a few seed blocks from a checked-in
     fixture.
   - Do not write back to manuscript files.

3. Render the document in `apps/studio`.
   - Show document title.
   - Show stable block IDs.
   - Show source/provenance labels.
   - Keep the UI plain and inspectable.

4. Identify one span.
   - First version can use explicit start/end offsets or a simple server action
     from a selected known phrase.
   - Do not build TipTap/Yjs yet.
   - A boring form is acceptable if it proves the data model.

5. Apply one semantic tag.
   - Tag should describe meaning, not color.
   - Example tags:
     - `leadership-principle`
     - `origin-story`
     - `quote-candidate`
     - `requires-citation`
     - `projection-candidate`

6. Persist the tagged span.
   - Store block reference.
   - Store span locator.
   - Store selected text snapshot.
   - Store tag reference.
   - Store creator metadata.
   - Preserve the current local prototype behavior as the acceptance baseline.

7. Extract a knowledge node.
   - Create one node from the tagged span.
   - Preserve provenance to document, block, and span.
   - Keep node type simple.
   - Do not build graph layout yet.

8. Show the node beside the document.
   - Side panel is enough.
   - Show tag label, node title, source block, selected text, and provenance.
   - Make it obvious what is draft/private and what is approved/public.

## Validation

Run the smallest meaningful checks:

```bash
pnpm --filter studio typecheck
pnpm --filter studio build
git diff --check
```

If Prisma changes are introduced:

```bash
pnpm exec prisma validate
pnpm db:generate
```

Only run `pnpm db:push` against a clearly safe local development database.
Do not mutate remote Neon data for a smoke test unless the environment is
confirmed disposable.

For the 2026-05-16 persistence slice, the configured database target did not
look local, so mutation smoke testing and `pnpm db:push` were skipped.

## Non-Goals

Do not build:

- rich text editor
- real-time collaboration
- revision history
- embeddings
- semantic search
- graph visualization
- projection publishing
- public route integration
- Quiplore sync
- agent execution
- cloud deployment

These come later. The first slice should make one semantic tag durable and
source-aware.

## Acceptance Criteria

The current prototype is successful because:

- `apps/studio` shows one real or seeded Studio document
- the document has stable block IDs
- one selected span can receive one semantic tag
- one knowledge node can be created from that tagged span
- the node panel shows provenance back to source document, block, and span
- no public publishing behavior changes
- no canonical manuscript files are modified

The persistence pass is successful when:

- the same loop is persisted in development data
- refresh does not lose tag applications or nodes
- provenance remains queryable from document, block, span, tag, and node records
- no public route reads from private Studio authoring tables

## Recommended Next Slice

Add the private Studio auth boundary before expanding editor behavior:

- decide which existing `User` roles can enter `apps/studio`
- replace `ownerLabel` / `createdByLabel` with real optional user ownership
- keep local seed data clearly separated from imported manuscript data
- only then consider a controlled import path for selected real source blocks
