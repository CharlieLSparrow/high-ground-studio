# Studio Writing Desk Block Management Result

Date: 2026-05-18

## Summary

This pass made the Studio Writing Desk more useful for real book drafting by
adding private draft block management.

The route remains:

```text
/write
```

The implementation stayed inside the private Studio boundary. It did not add
TipTap, Yjs, embeddings, semantic search, public projections, deployment
changes, or manuscript file writes.

## What Exists Now

The Writing Desk now supports:

- adding a private draft block
- editing active draft block title/body
- moving active draft blocks up or down
- archiving an active draft block
- hiding archived blocks from the active writing surface
- showing archived blocks in a read-only collapsed section

All write actions repeat the same guard stack:

- signed-in Studio user
- approved Studio role
- local-only database write guard
- deterministic writing-desk document boundary
- writing-desk block membership check

## What Persists

When local Studio persistence is enabled, block management writes
`StudioDocumentBlock` rows for the deterministic writing-desk document:

```text
studio-doc-learning-to-lead-writing-desk-draft
```

New blocks are private draft rows with stable IDs prefixed by:

```text
l2l-writing-draft-
```

Ordering uses `StudioDocumentBlock.order`. Server-side reordering writes a safe
two-step order sequence so the `(documentId, order)` unique constraint is not
tripped during swaps.

## Schema Change

This pass added the smallest archive state needed on `StudioDocumentBlock`:

```prisma
archivedAt      DateTime?
archivedByLabel String?
```

It also added an index for active/archive filtering by document and order.

Archive means the block remains private draft data but leaves the active
writing surface. It is not deletion, publication, or manuscript promotion.

## Local DB And Smoke Status

No `db:push` was run.

Docker was checked during preflight. The Docker client is installed, but the
daemon was not reachable, so the local Compose-backed smoke/bootstrap path was
not run.

Use `pnpm db:push` only against a confirmed local development database before
testing these fields in a browser.

## Canonical File Safety

This pass did not write canonical manuscript files or public content.

These surfaces remain untouched by the Writing Desk:

- `apps/web/content/books/learning-to-lead/manuscript/learning-to-lead.living.mdx`
- `apps/web/content/publish`
- `apps/web/content/_staging`
- `apps/web/content/_inbox`

## Validation

Completed validation for this pass:

```bash
pnpm exec prisma validate
pnpm db:generate
pnpm --filter @high-ground/studio-domain typecheck
pnpm --filter studio typecheck
pnpm --filter studio build
git diff --check
```

## Deferred

- restore/unarchive
- delete
- duplicate block
- richer block types
- revision history
- collaboration
- promotion into canonical manuscript truth
- public projection workflow
