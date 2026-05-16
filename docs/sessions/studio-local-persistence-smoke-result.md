# Studio Local Persistence Smoke Result

Date: 2026-05-16

## Summary

This pass added a local-only smoke path for the Studio persistence slice.

The goal was to make the Prisma-backed Studio tagging loop runnable against a
disposable local database without risking writes to remote Neon or
production-like data.

## What Was Added

- `scripts/smoke-studio-persistence.mjs`
- root script `pnpm studio:smoke:persistence`
- `docs/runbooks/studio-local-persistence.md`
- local-dev and env-example notes pointing Studio persistence work at local DBs

## Smoke Script Behavior

The smoke script:

- reads `DATABASE_URL` from the environment or local `.env`
- refuses to run unless the database host is `localhost`, `127.0.0.1`, or `::1`
- ensures the deterministic Studio seed workspace/project/document/blocks/tags
  exist
- creates or reuses one `StudioTaggedSpan`
- creates or reuses the matching `StudioKnowledgeNode`
- prints a concise report with document, block, tag, selected text, span ID,
  and node ID

## Current Environment Result

The current `DATABASE_URL` did not look local. The smoke script was run and
refused as intended:

```text
Refusing to run Studio persistence smoke test against non-local database host.
```

No Studio seed rows, tagged spans, or knowledge nodes were created in this
environment.

## Local Developer Next Step

Use a disposable local database URL, then run:

```bash
pnpm db:generate
pnpm db:push
pnpm studio:smoke:persistence
pnpm studio
```

Do not run `pnpm db:push` or the smoke path against remote Neon unless that
target has been explicitly confirmed safe.
