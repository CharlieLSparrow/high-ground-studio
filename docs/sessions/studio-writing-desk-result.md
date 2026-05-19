# Studio Writing Desk Result

Date: 2026-05-18

## Summary

This pass added the first private Studio writing desk for the book workflow.

The new route is:

```text
/write
```

It uses the same Studio auth gate as the main workbench. Signed-out visitors see
the Studio sign-in screen. Signed-in users without an approved Studio role see
the restricted-access screen.

## What The Writing Desk Does Now

The writing desk renders a practical draft surface:

- one private Learning to Lead writing-desk draft document
- three initial stable draft block IDs
- private draft block add/move/archive controls
- editable block title fields
- editable block body textareas
- per-block save actions
- saved status and updated timestamps
- link back to the tagging desk

This is intentionally plain text. It starts the book-writing workflow inside
Studio without adding TipTap, Yjs, revision history, embeddings, or projection
automation.

## What Persists

When `DATABASE_URL` points at local Postgres and `NODE_ENV` is not production,
the route creates or reuses a deterministic draft document:

```text
studio-doc-learning-to-lead-writing-desk-draft
```

The first draft block IDs are:

```text
l2l-writing-draft-001
l2l-writing-draft-002
l2l-writing-draft-003
```

Saves update `StudioDocumentBlock.title`, `StudioDocumentBlock.body`, and the
block `updatedAt` timestamp. The parent `StudioDocument` remains private and in
`draft` projection status.

The later block-management pass added `StudioDocumentBlock.archivedAt` and
`archivedByLabel` so archived Writing Desk blocks leave the active writing
surface without being deleted.

The current schema does not have `createdByLabel` or `updatedByLabel` fields on
`StudioDocument` or `StudioDocumentBlock`. Those labels currently exist only on
tagged spans and knowledge nodes, so actor-label persistence for writing-desk
block edits remains deferred.

## Fixture And Local-Only Status

If `DATABASE_URL` is missing, points at a non-local host, or Prisma cannot reach
the local schema, the route renders a read-only fixture. It does not try to read
or write remote Neon.

The write guard allows draft creation and saves only for local database hosts:

- `localhost`
- `127.0.0.1`
- `::1`

## Canonical File Safety

This pass did not import the whole manuscript and did not write canonical
manuscript files.

These surfaces were intentionally untouched:

- `apps/web/content/books/learning-to-lead/manuscript/learning-to-lead.living.mdx`
- `apps/web/content/publish`
- `apps/web/content/_staging`
- `apps/web/content/_inbox`

The writing desk stores private draft rows only when local Studio persistence is
enabled.

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

The first `pnpm --filter studio build` attempt hit a sandbox-only Turbopack
failure while PostCSS tried to create an internal process/port binding. The
same command passed when rerun outside the sandbox.

## Docker And Smoke Status

Docker daemon status was checked during preflight. The Docker client was
installed, but the daemon was not reachable, so the local Compose-backed smoke
path was not run.

No `db:push` was run. No remote database mutation was performed.
