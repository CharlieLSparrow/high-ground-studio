# Content Studio Project Persistence Result

Date: 2026-05-25

## Slice

Content Studio now has a first durable project persistence layer for podcast,
book, and episode-page work without replacing the browser-local board.

The new private Prisma model is `StudioContentProject`. It stores one durable
row per signed-in Studio owner and local project id, including:

- title
- workflow kind
- status
- active stage
- description and notes
- client-updated timestamp
- full project JSON
- derived project handoff JSON
- derived production packet JSON

The private Studio API route is:

```text
/api/content-studio/projects
```

It requires the existing Studio access gate and a configured `DATABASE_URL`.
`GET` lists durable projects or loads one by `id`. `POST` and `PATCH` upsert
the selected project by owner email plus local project id.

The `/content-studio` UI keeps the existing browser-local board and manual
workspace checkpoints. It now also has a durable-project panel that can save
the selected project, refresh the database-backed project list, and open a
saved project back into the current board.

## Boundaries

This slice does not autosave, publish public pages, mutate canonical manuscript
truth, call provider APIs, run production database mutations, or deploy.

Workspace snapshots remain manual recovery anchors. Durable projects are
individual cross-device working records and future handoff anchors.

## Validation

Expected local validation:

```bash
pnpm db:generate
pnpm content-studio:packet:test
pnpm studio:cloudrun:test
pnpm --filter studio typecheck
```

Apply the schema to a safe target separately before using the route in a live
environment. Do not run `pnpm db:push` or migrations against production without
an explicit database rollout step.

## Rollout

1. Generate the Prisma client from the updated schema.
2. Apply the schema through the existing reviewed Studio database sync path.
3. Deploy Studio.
4. Sign in to `/content-studio`.
5. Save a synthetic podcast/book/episode-page project.
6. Refresh the durable project list from a second browser/device and open it.

## Rollback

Disable the UI/API by reverting the Content Studio project route, server helper,
client panel, and `StudioContentProject` model before applying any further
schema changes. Existing browser-local boards and workspace snapshots continue
to work independently.
