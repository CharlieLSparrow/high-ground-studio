# Studio Persistence Slice Result

Date: 2026-05-16

## Summary

This pass made the Studio tagging prototype durable in development code without
adding editor complexity.

The persisted loop is now:

```text
Studio document block -> selected span -> semantic tag -> StudioTaggedSpan
-> StudioKnowledgeNode -> provenance panel
```

The implementation stays inside the private Studio boundary. It does not add
TipTap, Yjs, embeddings, semantic search, public projections, Quiplore sync, or
deployment changes.

## What Is Persistent Now

Prisma now has private Studio authoring tables for:

- `StudioWorkspace`
- `StudioProject`
- `StudioDocument`
- `StudioDocumentBlock`
- `StudioTag`
- `StudioTaggedSpan`
- `StudioKnowledgeNode`

`StudioTaggedSpan` preserves:

- document and block references
- stable document and block snapshots
- start and end offsets
- selected text snapshot
- tag reference
- source label/path/external ID snapshots
- private projection status
- created label and timestamps

`StudioKnowledgeNode` preserves:

- source tagged span
- project, document, block, and tag references
- tag label/category snapshot
- source text
- title/body/node type
- projection and review status
- document/block/span provenance snapshots

## App Behavior

`apps/studio` now server-loads workbench data from Prisma when the Studio schema
exists:

- seed document
- ordered seed blocks
- semantic tags
- tagged spans
- knowledge nodes

The client workbench still uses the same plain block/span/tag UI. Applying a
tag calls a server action that creates or reuses one tagged span for the same
block, tag, start offset, and end offset, then creates or reuses the matching
knowledge node.

After the action, the Studio route revalidates and refreshes, so persisted tag
applications and nodes remain visible after page refresh.

## Seed Data

Seed data is development-only and non-canonical:

- one private workspace
- one Learning to Lead seed project
- one seed document
- three seed blocks copied from the prototype fixture
- four semantic tags

The seed helper only writes when `DATABASE_URL` points at a local database and
`NODE_ENV` is not `production`. If the database target does not look local, the
page falls back to the fixture and disables Studio writes.

This pass did not import or modify
`apps/web/content/books/learning-to-lead/manuscript/learning-to-lead.living.mdx`.

## Auth Boundary Update

The first private Studio auth boundary landed after this persistence slice.
`apps/studio` now requires Google sign-in plus an approved existing team role
before rendering the workbench or creating tag applications.

Real `User` foreign-key ownership remains deferred. Created spans and nodes now
carry the signed-in primary email in `createdByLabel` as an accountable
placeholder until the dedicated Studio ownership model is added.

## What Is Still Mocked Or Deferred

- real `User` ownership relations
- full manuscript import
- rich text editing
- revision history
- collaborative editing
- semantic search and embeddings
- graph edges and graph layout
- public projections
- deployment wiring

For now, `ownerLabel` and `createdByLabel` preserve human-readable development
provenance until the Studio auth slice exists.

## Validation

Completed:

```bash
pnpm exec prisma validate
pnpm db:generate
pnpm --filter @high-ground/studio-domain typecheck
pnpm --filter studio typecheck
pnpm --filter studio build
git diff --check
```

## Database Mutation Status

No database mutation smoke test was run.

The configured `DATABASE_URL` host did not look local, so this pass did not run
`pnpm db:push` and did not create seed rows. That is intentional. Apply the
schema only against a confirmed safe local development database, or explicitly
confirm the target before using remote data.

## Next Recommended Slice

Add the private Studio auth boundary before making the editor more ambitious:

- decide which existing roles can access `apps/studio`
- add real optional user ownership/creator relations
- keep seed data separate from canonical manuscript import
- then add a controlled import path for selected real source blocks
