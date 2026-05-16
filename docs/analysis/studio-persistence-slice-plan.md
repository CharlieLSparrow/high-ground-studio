# Studio Persistence Slice Plan

Date: 2026-05-16

## Purpose

Persist the current `apps/studio` tagging prototype with the smallest safe
Prisma slice. The durable loop is:

```text
Studio document block -> selected span -> semantic tag -> tagged span record
-> knowledge node -> provenance back to source
```

This is private Studio authoring state. It is not a public projection layer.

## Proposed Prisma Models

### `StudioWorkspace`

The top-level private Studio container.

Fields should include a stable `slug`, display `name`, optional `description`,
`ownerLabel`, `isPrivate`, and timestamps.

Why it exists:
- keeps Studio authoring data out of existing public/coaching/product tables
- gives future projects a shared private parent without adding tenancy or billing

### `StudioProject`

A work area inside a workspace, such as the development `learning-to-lead`
project.

Fields should include `workspaceId`, `slug`, `name`, optional `description`,
optional `sourceLabel`, `isPrivate`, and timestamps.

Why it exists:
- scopes documents, tags, and knowledge nodes
- lets tags be project-specific without creating global semantic vocabulary too early

### `StudioDocument`

A private source or draft document that can be broken into stable blocks.

Fields should include `projectId`, `stableId`, `title`, optional `sourceLabel`,
optional `sourcePath`, `projectionStatus`, `isPrivate`, and timestamps.

Why it exists:
- gives the workbench a durable document identity independent of route state
- preserves source labels without turning canonical manuscript files into database truth

### `StudioDocumentBlock`

An ordered, stable block inside a Studio document.

Fields should include `documentId`, `stableId`, `order`, optional `title`,
`body`, optional `sourceLabel`, optional `sourcePath`, optional `externalId`,
`projectionStatus`, `isPrivate`, and timestamps.

Why it exists:
- selected spans need stable block anchors
- block order must survive refresh and query consistently by document
- source metadata can stay attached to a block even when copied from a fixture

### `StudioTag`

A first-class semantic object users apply to spans.

Fields should include `projectId`, `slug`, `label`, optional `description`,
`category`, `nodeType`, `isPrivate`, `isActive`, and timestamps.

Why it exists:
- tags are the unit of meaning, not UI color
- knowledge nodes need a durable tag reference and a snapshot of tag label/type

### `StudioTaggedSpan`

A durable application of one tag to one selected text span.

Fields should include `documentId`, `blockId`, `tagId`, `startOffset`,
`endOffset`, `selectedText`, `projectionStatus`, `isPrivate`,
`createdByLabel`, timestamps, and provenance snapshots:

- `documentStableId`
- `documentTitleSnapshot`
- `blockStableId`
- `blockTitleSnapshot`
- `sourceLabel`
- `sourcePath`
- `sourceExternalId`

Why it exists:
- preserves exactly what text was selected at the time of tagging
- keeps the span queryable by document, block, tag, offset, and status
- lets refresh reload tag applications instead of rebuilding them from client state

### `StudioKnowledgeNode`

A draft private node extracted from a tagged span.

Fields should include `projectId`, `documentId`, `blockId`, `taggedSpanId`,
`tagId`, `tagLabel`, `tagCategory`, `nodeType`, `sourceText`, `title`, `body`,
`projectionStatus`, `reviewStatus`, `isPrivate`, `createdByLabel`, timestamps,
and provenance snapshots:

- `documentStableId`
- `documentTitleSnapshot`
- `blockStableId`
- `blockTitleSnapshot`
- `spanStartOffset`
- `spanEndOffset`
- `sourceLabel`
- `sourcePath`

Why it exists:
- makes the prototype's extracted node durable
- preserves provenance even if tag labels or block titles later change
- gives later review/projection workflows a private queue without exposing public data

## Refresh Behavior

The Studio page should load the seed document, blocks, tags, tagged spans, and
knowledge nodes from Prisma. Applying a tag should create or reuse one
`StudioTaggedSpan` for the same block/tag/start/end range and then create or
reuse its `StudioKnowledgeNode`.

After a server action runs, the Studio route should revalidate and refresh. The
reloaded database rows should repopulate the tag application strip and knowledge
panel, so refresh no longer clears the work.

## Seed Strategy

Use deterministic development seed records copied from the current prototype:

- one workspace
- one project
- one non-canonical Learning to Lead seed document
- three seed blocks
- four semantic tags

The seed text remains a clearly marked fixture. It does not write to canonical
manuscript files and does not import the whole Learning to Lead manuscript.

The lazy bootstrap path should only create missing seed records against a local
development database. If `DATABASE_URL` is absent or does not look local, the
helper should skip mutation and expose a read-only fallback instead of touching
remote Neon by accident.

## User Ownership

This first slice should defer real `User` relations.

Reason:
- `apps/studio` does not yet have a private auth boundary
- the persistence goal is document/tag/span/node durability, not staff identity
- adding nullable user relations now would imply permission semantics that do
  not exist yet

Use labels such as `ownerLabel` and `createdByLabel` for seed/dev provenance.
Add real user ownership in the authentication slice.

## Useful Indexes

Add indexes for:

- projects by workspace
- documents by project and status
- blocks by document/order
- tags by project/category
- tagged spans by document/block
- tagged spans by tag
- tagged spans by status
- nodes by project/status
- nodes by tag
- nodes by document/block

Use a uniqueness guard on one tagged span per `blockId`, `tagId`,
`startOffset`, and `endOffset` in this first slice.

## Intentionally Not Included

This slice does not add:

- TipTap
- Yjs
- embeddings
- semantic search
- public projections
- Quiplore sync
- real-time collaboration
- revision history
- canonical manuscript import
- publication approval workflow
- auth or role-gated Studio ownership
- cloud deployment

The schema should make those later slices possible without pretending they
already exist.
