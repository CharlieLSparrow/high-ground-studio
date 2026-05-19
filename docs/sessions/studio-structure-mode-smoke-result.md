# Studio Structure Mode Smoke Result

Date: 2026-05-19

## Summary

This pass added a manual smoke checklist and concise in-app source-editing
guidance for the browser-local Structure Mode MVP before live private deploy
work resumes.

## Runbook Added

Added:

```text
docs/runbooks/studio-structure-mode-smoke.md
```

The runbook covers manual checks for:

- opening `/structure`
- loading the starter sample
- clearing the draft
- pasting custom text
- creating highlight cards from textarea selection
- editing semantic type and lane
- moving cards within and between lanes
- duplicating and deleting cards
- hiding and showing the pasted source panel
- JSON export/import
- Markdown outline export/copy
- refresh persistence
- verifying the Structure Mode localStorage key is the only key cleared

## UI Guidance Added

The pasted source panel now includes a short source-editing note:

- cards keep selected text snapshots
- source rewrites do not rewrite existing cards
- offsets may point at old source positions after a rewrite
- operators should export JSON before large source rewrites

## Behavior Unchanged

This pass did not intentionally change:

- localStorage key: `high-ground-studio.structure-mode.v1`
- JSON draft shape
- lane IDs
- semantic type IDs
- source type IDs
- card creation behavior
- reset behavior
- starter sample behavior
- Markdown outline shape

## What Remains Browser-Local

Structure Mode still persists only to browser localStorage. It is not synced to
the Studio database.

JSON export/import and Markdown outline export remain the backup and handoff
paths until database-backed Structure Mode persistence exists.

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

Completed validation for this pass:

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
