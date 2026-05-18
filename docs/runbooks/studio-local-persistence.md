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

The same local persistence guard also protects the first Studio writing desk at
`/write`. That route creates and updates a deterministic private draft document
only when `DATABASE_URL` points at local Postgres. If the target is missing,
remote, or unavailable, `/write` renders a read-only fixture instead.

## Why Local Only

The Studio persistence slice writes private authoring records:

- seed workspace/project/document/block/tag rows
- tagged span rows
- knowledge node rows
- writing desk draft document/block rows

Do not run the smoke path or `pnpm db:push` against remote Neon or
production-like data casually. This is still a development fixture and not a
reviewed production seed workflow.

The app and smoke script both refuse Studio writes unless `DATABASE_URL` points
at one of:

- `localhost`
- `127.0.0.1`
- `::1`

## Prerequisites

- Docker Desktop or another Docker daemon running locally
- pnpm installed
- no other local Postgres service using port `5432`, unless you adjust the
  compose port and local `DATABASE_URL` together
- Google OAuth credentials configured for local NextAuth sign-in when using the
  browser Studio app
- the signed-in account listed in one of `HGO_OWNER_EMAILS`,
  `HGO_TEAM_SCHEDULER_EMAILS`, or `HGO_COACH_EMAILS`

## Example Local Database URL

Use a disposable local database. Example:

```bash
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/high_ground_studio"
```

You can put that in local `.env`. Do not commit `.env`.

The repo also has a local-only Docker Compose file:

- `compose.studio.yml`

It starts one Postgres service:

- database: `high_ground_studio`
- user: `postgres`
- password: `postgres`
- host port: `5432`
- volume: `high-ground-studio-local_high_ground_studio_pgdata`

If port `5432` is already in use on your machine, stop the other local
Postgres service or adjust the compose port and local `DATABASE_URL` together.

## One-Command Bootstrap

For the normal local smoke-test path:

```bash
pnpm studio:local:bootstrap
```

This runs:

```bash
pnpm studio:db:up
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/high_ground_studio pnpm db:generate
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/high_ground_studio pnpm db:push
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/high_ground_studio pnpm studio:smoke:persistence
```

The script passes the local `DATABASE_URL` inline, so it does not matter if
your repo `.env` points at remote Neon. The smoke script still refuses any
non-local database host.

Then start Studio against the same local database:

```bash
pnpm studio:local
```

The browser workbench is private. Sign in with Google using an account included
in the local role env lists. The smoke script remains a local database check and
does not exercise browser auth.

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

If your `.env` does not point at local Postgres, pass the local URL inline:

```bash
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/high_ground_studio pnpm studio:smoke:persistence
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
pnpm studio:local
```

Open the local Studio app and apply a semantic tag. Refresh the page. The
tagged span and knowledge node should remain visible because the workbench
reloads them from Prisma.

Use the shared Studio navigation to move between the active desks:

- `/` - Tagging Desk
- `/write` - Writing Desk

Open `/write` to use the writing desk. Edits save to the local deterministic
draft document:

```text
studio-doc-learning-to-lead-writing-desk-draft
```

The first draft block IDs are:

```text
l2l-writing-draft-001
l2l-writing-draft-002
l2l-writing-draft-003
```

These are private draft rows. They are not canonical manuscript files and are
not approved public projections.

If the page shows the access screen instead of the workbench, confirm:

- `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` are set for local NextAuth
- `AUTH_SECRET` or `NEXTAUTH_SECRET` is set
- the signed-in email appears in one of the Studio-approved role env lists
- the Google OAuth redirect URI matches the local Studio dev server port

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

To reset the whole local Compose database volume:

```bash
pnpm studio:db:reset
pnpm studio:local:bootstrap
```

`studio:db:reset` removes only the local Compose volume declared in
`compose.studio.yml`. Do not use it for any non-local database workflow.

To stop the local container without deleting data:

```bash
pnpm studio:db:down
```

## What Not To Do

- Do not point `DATABASE_URL` at remote Neon for this smoke path.
- Do not run `pnpm db:push` against production-like data without explicit
  confirmation.
- Do not treat the seed data as canonical Learning to Lead manuscript content.
- Do not treat writing desk draft rows as canonical manuscript content.
- Do not import the whole manuscript in this slice.
- Do not add TipTap, Yjs, embeddings, semantic search, public projections, or
  deployment wiring to this local smoke path.
- Do not bypass the Studio role gate by exposing the workbench as a public
  route.
