# Studio Local Persistence

Date: 2026-05-16

## Purpose

This runbook explains how to run the Studio persistence slice against a
disposable local Postgres database.

Use it to verify this private Studio loop locally:

```text
document block -> selected span -> semantic tag -> StudioTaggedSpan
-> StudioKnowledgeNode -> refresh-safe provenance panel
```

## Why Local Only

The Studio persistence slice writes private authoring records:

- seed workspace/project/document/block/tag rows
- tagged span rows
- knowledge node rows

Do not run the smoke path or `pnpm db:push` against remote Neon or
production-like data casually. This is still a development fixture and not a
reviewed production seed workflow.

The app and smoke script both refuse Studio writes unless `DATABASE_URL` points
at one of:

- `localhost`
- `127.0.0.1`
- `::1`

## Example Local Database URL

Use a disposable local database. Example:

```bash
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/high_ground_studio"
```

You can put that in local `.env`. Do not commit `.env`.

## Apply Schema Safely

From the repo root, after confirming `DATABASE_URL` points at local Postgres:

```bash
pnpm db:generate
pnpm db:push
```

`pnpm db:push` is acceptable here only because the target is a confirmed local
development database.

## Run The Smoke Test

From repo root:

```bash
pnpm studio:smoke:persistence
```

The script will:

- refuse non-local database hosts before opening Prisma
- ensure the Studio seed workspace/project/document/blocks/tags exist
- create or reuse one `StudioTaggedSpan`
- create or reuse the matching `StudioKnowledgeNode`
- print the document stable ID, block stable ID, tag label, selected text,
  tagged span ID, and knowledge node ID

Expected successful shape:

```text
Studio persistence smoke test passed.
document stable ID: studio-doc-learning-to-lead-seed
block stable ID: l2l-seed-001
tag label: leadership-principle
selected text: name what is happening
tagged span ID: ...
knowledge node ID: ...
```

## Run Studio

In another terminal:

```bash
pnpm studio
```

Open the local Studio app and apply a semantic tag. Refresh the page. The
tagged span and knowledge node should remain visible because the workbench
reloads them from Prisma.

## Reset Local Seed Data

Only do this against a confirmed local database.

To remove the deterministic Studio seed workspace and its cascading project,
document, block, tag, span, and node rows:

```bash
psql "$DATABASE_URL" <<'SQL'
delete from "StudioWorkspace" where slug = 'high-ground-private';
SQL
```

Then recreate the seed and smoke records:

```bash
pnpm studio:smoke:persistence
```

## What Not To Do

- Do not point `DATABASE_URL` at remote Neon for this smoke path.
- Do not run `pnpm db:push` against production-like data without explicit
  confirmation.
- Do not treat the seed data as canonical Learning to Lead manuscript content.
- Do not import the whole manuscript in this slice.
- Do not add TipTap, Yjs, embeddings, semantic search, public projections, or
  deployment wiring to this local smoke path.
