# Studio Writing Desk Block Management Plan

Date: 2026-05-18

## Decision

Add block management before adding any rich editor stack.

The Writing Desk needs to create, order, and retire private draft blocks before
it needs marks, collaboration, custom document schemas, or editor JSON. If the
block lifecycle is not useful in plain text, a richer editor will only make the
wrong model harder to change.

## Why This Comes Before Rich Editing

Book drafting needs lightweight structure immediately:

- make a new block for a scene, section, question, or connective passage
- move that block as the chapter shape changes
- retire a block without deleting it
- keep stable IDs so later tagging, provenance, and revision systems can point
  at the same draft material

A textarea remains enough for this pass. The critical workflow is arranging
private draft units, not formatting text.

## Schema Support

The current schema already supports most of this safely:

- `StudioDocumentBlock.order` can represent draft order
- `StudioDocumentBlock.stableId` can keep stable block identity
- `StudioDocumentBlock.isPrivate` and `projectionStatus` keep draft material
  private and non-public
- the deterministic writing-desk document boundary prevents arbitrary document
  edits

The schema does not currently have an archive state for document blocks. Using
`projectionStatus` to hide archived draft blocks would confuse public projection
state with authoring lifecycle state, so this pass should add the smallest
explicit archive fields:

- `archivedAt DateTime?`
- `archivedByLabel String?`

This avoids introducing a broad status system while making archive behavior
honest.

## Ordering

Use `StudioDocumentBlock.order`.

Active blocks should display in ascending `order` where `archivedAt` is null.
Archived blocks can retain stable IDs and remain visible in a separate
read-only archive section.

Because the schema has a unique constraint on `(documentId, order)`, server
reordering should avoid direct swaps. The safe path is:

1. Load all blocks for the writing-desk document.
2. Build the intended active order.
3. Append archived blocks after active blocks.
4. Temporarily move affected rows to negative orders.
5. Write the final positive order sequence.

That keeps ordering deterministic without deleting rows or relying on
database-specific deferred constraints.

## Add

Adding a block should create a new private `StudioDocumentBlock` row in the
writing-desk document only.

The new block should:

- use a generated stable ID prefixed with `l2l-writing-draft-`
- be `private`
- use `projectionStatus = draft`
- start at the end of the active list
- carry the writing-desk source label

## Archive

Archive means "remove from the active writing surface without deleting the row."

For this pass, archive should:

- set `archivedAt`
- set `archivedByLabel`
- keep `isPrivate = true`
- keep `projectionStatus = draft`
- move the archived block after active blocks in order

Archived blocks should be read-only in the UI for now. Restore/unarchive can
come later.

## Safety Boundary

All writes must require:

- Studio auth
- local database write guard
- deterministic writing-desk document stable ID
- block membership in the writing-desk document
- writing-desk source label for existing blocks

The actions must not accept arbitrary document or block IDs from the client as
authority.

## Canonical Manuscript Safety

The writing desk must not write to:

- `apps/web/content/books/learning-to-lead/manuscript/learning-to-lead.living.mdx`
- `apps/web/content/publish`
- `apps/web/content/_staging`
- `apps/web/content/_inbox`

Block management writes only Studio database rows when the target database is a
confirmed local development host.

## Deferred

Do not add in this pass:

- TipTap or Yjs
- embeddings
- semantic search
- public projections
- manuscript import
- restore/unarchive
- revision history
- multi-user conflict resolution
- rich block types
- promotion to canonical manuscript truth
