# Studio Tagging Prototype Result

Date: 2026-05-16

## Summary

This pass turned the private Studio shell into an interactive, client-side
tagging workbench.

The prototype proves the center loop:

```text
document/source block -> selected span -> semantic tag -> knowledge node -> provenance panel
```

The implementation is intentionally reversible. It adds no Prisma models,
performs no database writes, calls no external APIs, and does not introduce
TipTap, Yjs, Cloud Run, Terraform, or agent orchestration.

## What Works

- `apps/studio` renders one seeded Studio document.
- The document has three stable source blocks with visible block IDs.
- A user can choose a block.
- A user can choose a preset excerpt or edit start/end offsets directly.
- Span offsets are validated by `packages/studio-domain`.
- A semantic tag palette is available.
- Applying a tag creates a local `StudioTagApplication`.
- Applying a tag also creates a local `KnowledgeNode`.
- The knowledge panel shows node text, tag label, document identity, block ID,
  span offsets, selected text, created timestamp, and projection status.
- The page keeps private/draft/not-public/projection-not-approved status visible.
- Future lanes for Structures, Projections, and Agents are visible but not wired.

## What Is Mocked

- The document is a non-canonical seed fixture in the Studio app.
- Tags are hardcoded in the client component.
- Created timestamps are local browser timestamps.
- Created IDs are local sequential IDs.
- User identity is represented as `local prototype`.
- The knowledge graph is a flat list, not a persisted or queryable graph.

## What Is Intentionally Not Persistent

Refreshing the page clears:

- tag applications
- span snapshots
- knowledge nodes
- selected UI state

This is correct for the prototype pass. The next pass should persist this same
shape rather than widen the feature surface.

## Follow-Up Persistence Slice

The 2026-05-16 Studio persistence slice supersedes the prototype's client-only
state for development use.

Current status after that follow-up:

- the same seed document/block/tag loop has Prisma models
- `apps/studio` server-loads seed document data, tags, tagged spans, and nodes
- applying a tag persists a `StudioTaggedSpan`
- the server action creates or reuses the matching `StudioKnowledgeNode`
- refresh should preserve persisted tag applications and nodes once the schema
  is applied to a safe local development database

The seed remains non-canonical fixture data. It does not import or modify the
Learning to Lead manuscript.

## What Should Become Database-Backed Next

The next schema slice should make these concepts durable:

- Studio workspace/project ownership
- Studio document metadata
- stable document blocks
- semantic tag definitions
- tagged span applications
- selected text snapshots
- extracted knowledge nodes
- provenance references
- projection/review status

Private Studio authoring tables should stay separate from public publishing
tables. Public apps should later consume approved projections, not private
source records.

## Likely Next Schema Slice

Start with these Prisma model candidates:

- `StudioWorkspace`
- `StudioProject`
- `StudioDocument`
- `StudioDocumentBlock`
- `StudioTag`
- `StudioTaggedSpan`
- `StudioKnowledgeNode`

Useful indexes:

- document blocks by `documentId, order`
- tagged spans by `documentId, blockId`
- tagged spans by `tagId`
- knowledge nodes by `projectId`
- knowledge nodes by projection/review status

Keep embeddings, semantic search, graph layout, collaboration, and projection
publishing out of the first persistence pass.

## Package Boundary Created

`packages/studio-domain` now owns pure Studio vocabulary and helpers. It should
remain free of Prisma, React, Next.js, database access, and external API calls.

That package is the right place for:

- core Studio types
- span validation
- span snapshot helpers
- tag application helpers
- knowledge node extraction helpers
- provenance label helpers

It is not the right place for UI state, server actions, Prisma clients, auth, or
workflow-specific page behavior.
