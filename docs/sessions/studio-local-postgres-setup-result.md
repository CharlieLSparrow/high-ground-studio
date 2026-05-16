# Studio Local Postgres Setup Result

Date: 2026-05-16

## Summary

This pass added a disposable local Postgres setup for the Studio persistence
smoke path.

The goal was to make the existing local-only smoke script easy to run
successfully without relying on a developer's `.env` when that file points at
remote Neon.

## What Was Added

- `compose.studio.yml`
- `pnpm studio:db:up`
- `pnpm studio:db:down`
- `pnpm studio:db:reset`
- `pnpm studio:local:bootstrap`
- `pnpm studio:local`

## Local Database Shape

The compose file defines one local Postgres service:

- service: `studio-postgres`
- database: `high_ground_studio`
- user: `postgres`
- password: `postgres`
- port: `5432`
- volume: `high-ground-studio-local_high_ground_studio_pgdata`

The scripts pass this local URL inline:

```bash
postgresql://postgres:postgres@localhost:5432/high_ground_studio
```

That keeps the Studio local bootstrap path separate from any repo `.env` that
may point at remote Neon.

## Validation Result

`docker compose -f compose.studio.yml config` passed.

The current non-local `.env` refusal path was checked again:

```bash
pnpm studio:smoke:persistence
```

It refused before any database write:

```text
Refusing to run Studio persistence smoke test against non-local database host.
```

The full local bootstrap was attempted:

```bash
pnpm studio:local:bootstrap
```

The first sandboxed attempt could not access the Docker socket. The escalated
attempt reached Docker but the Docker daemon was not running:

```text
Cannot connect to the Docker daemon
```

Because the daemon was not running, the local database was not started and the
successful database-backed smoke path could not be completed in this
environment.

Code validation passed:

```bash
pnpm exec prisma validate
pnpm db:generate
pnpm --filter @high-ground/studio-domain typecheck
pnpm --filter studio typecheck
pnpm --filter studio build
git diff --check
```

## Next Local Step

Start Docker Desktop or another Docker daemon, then run:

```bash
pnpm studio:local:bootstrap
pnpm studio:local
```

The bootstrap command will start the local database, run Prisma generate, apply
the schema to the local database, and run the Studio persistence smoke test.
