# Studio Structure Mode Maintainability Result

Date: 2026-05-19

## Summary

This pass lightly extracted Structure Mode model logic so the browser-local MVP
can keep receiving polish without making the client component harder to reason
about.

The route remains:

```text
/structure
```

## What Was Extracted

Added:

```text
apps/studio/src/app/structure/structure-mode-model.ts
```

That module now owns pure Structure Mode vocabulary and helpers:

- localStorage key
- source type options
- semantic type options
- structure lane options
- quick semantic type and lane lists
- default source, selection, semantic type, and lane values
- starter sample data
- source/type/lane guards and label helpers
- browser draft parser
- Markdown outline generator
- starter sample card generator

The client still owns browser APIs and interaction state:

- `window.localStorage`
- `window.confirm`
- `navigator.clipboard`
- textarea selection refs
- React state and event handlers

## Behavior Preserved

This was intended as a maintainability-only pass. These did not intentionally
change:

- localStorage key: `high-ground-studio.structure-mode.v1`
- JSON draft shape
- lane IDs
- semantic type IDs
- source type IDs
- Markdown outline shape
- clear/reset behavior
- show/hide pasted source behavior
- starter sample behavior

## Tests Added

Added:

```text
scripts/studio-structure-mode.test.mjs
```

Added root script:

```bash
pnpm studio:structure:test
```

The tests cover:

- valid browser-local draft parsing
- invalid draft rejection
- Markdown outline grouping by lane
- starter sample card offset integrity

## What Remains Browser-Local

Structure Mode still persists only to browser localStorage. No Prisma-backed
Structure Mode persistence exists yet.

JSON export/import and Markdown outline export remain the current backup and
handoff paths.

## What Remains Deferred

- database-backed structures
- durable pasted source records
- durable highlight/span rows
- ordered lane placement rows
- importers
- TipTap/Yjs editor work
- embeddings
- public projections

## Validation

Completed validation:

```bash
pnpm studio:structure:test
pnpm studio:cloudrun:test
pnpm --filter @high-ground/studio-domain typecheck
pnpm --filter studio typecheck
pnpm --filter studio build
git diff --check
```

The first sandboxed `pnpm --filter studio build` attempt hit the known
Turbopack/PostCSS process and local-port restriction. The same command passed
when rerun outside the sandbox.

## Safety

This pass did not deploy, run Cloud Build, create GCP resources, change IAM,
change DNS, create or mutate secrets, mutate databases, change Prisma schema,
or rewrite canonical manuscript files.
