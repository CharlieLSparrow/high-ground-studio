# Studio Writing Desk Plan

Date: 2026-05-18

## Decision

The first Studio writing desk should be a plain text, textarea-based draft
surface backed by existing Studio document and block persistence.

Do not add TipTap, Yjs, embeddings, public projections, manuscript imports, or
revision history in this pass.

## Why Plain Text First

The urgent book-workflow need is not rich editing infrastructure. It is a
private, durable place where book draft material can begin living inside Studio
without touching canonical manuscript files.

A textarea gives the first slice the right pressure:

- stable draft document and block IDs
- obvious private draft state
- ordinary save behavior
- low editor surface area
- no collaboration protocol decisions
- no migration of the manuscript into a new truth source

That is enough to start writing in Studio and to test whether the current
document/block model can carry draft work.

## Difference From Source Tagging

The existing Studio workbench is a source-tagging surface. It starts with a
source block, selects a span, applies a semantic tag, and produces a knowledge
node with provenance.

The writing desk is different:

- it is for generating new draft text, not extracting meaning from a source
- its blocks are draft working blocks, not source evidence blocks
- textarea edits update draft block body/title, not tagged spans or knowledge
  nodes
- provenance is document/block identity and private draft state for now, not a
  selected-span trail

Both surfaces can use `StudioDocument` and `StudioDocumentBlock`, but they
should not pretend to be the same workflow.

## Persistence Shape

Reuse the existing models for v0:

- `StudioWorkspace`
- `StudioProject`
- `StudioDocument`
- `StudioDocumentBlock`

Create a deterministic document:

- stable ID: `studio-doc-learning-to-lead-writing-desk-draft`
- source label: `Studio writing desk draft fixture - private draft material`
- projection status: `draft`
- private flag: `true`

Create deterministic draft blocks with stable IDs such as
`l2l-writing-draft-001`. These are separate from the source seed blocks used by
the tagging workbench.

This avoids a schema change while still keeping draft material clearly marked.
The current schema does not have `createdByLabel` or `updatedByLabel` fields on
`StudioDocument` or `StudioDocumentBlock`; those labels only exist on tagged
spans and knowledge nodes. The writing desk can show block `createdAt` and
`updatedAt`, but actor label persistence for document/block updates remains a
deferred schema decision.

## Local-Only Write Rule

The writing desk should only create or update draft records when
`DATABASE_URL` points at a local development host:

- `localhost`
- `127.0.0.1`
- `::1`

When the database is missing, remote, or not ready, the route should render a
read-only fixture. That preserves the private UI path without risking remote
Neon mutation.

## Canonical Manuscript Safety

The writing desk must never write to:

- `apps/web/content/books/learning-to-lead/manuscript/learning-to-lead.living.mdx`
- `apps/web/content/publish`
- `apps/web/content/_staging`
- `apps/web/content/_inbox`

For now, Studio draft blocks are database rows only in local development. They
are not canonical manuscript truth and are not public projections.

## What This Supports Now

This gives the book workflow a first private Studio desk:

- open `/write`
- see the draft document and stable draft block IDs
- edit title/body for one or more blocks
- save block changes through a server action
- refresh and keep changes when using local Studio persistence
- use read-only fixture mode when persistence is not safe

That is enough to start moving book drafting behavior into Studio without
waiting for final editor architecture.

## What Not To Do Yet

Do not add:

- TipTap/Yjs
- embeddings
- semantic search
- public projections
- manuscript import
- file writes back to canonical MDX
- revision history
- multi-user conflict handling
- promotion/publishing workflow

## Future Editor Path

TipTap/Yjs can replace or wrap this later because the v0 boundary is document
and block identity, not textarea-specific storage.

Future rich editor work can keep the same draft document stable ID, either by:

- mapping editor JSON to the existing block rows, or
- introducing a richer editor document model with a migration path from these
  draft blocks.

The important thing now is that Studio owns the private draft surface and that
the public manuscript remains untouched until an explicit projection or
promotion workflow exists.
