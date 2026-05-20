# Studio Manuscript Structure Label Editing Result

Date: 2026-05-19

## Purpose

Polish the browser-local Manuscript Desk structure layer after live testing
showed that chapter-like regions need editable book-specific labels.

The working route remains:

```text
/manuscript
```

This pass keeps structure editing inside the full manuscript surface. It does
not add database persistence, Yjs/collaboration, AI, Prisma schema changes,
Cloud Run configuration changes, or canonical manuscript writes.

## What Changed

- Structure regions can now be edited after creation.
- Each structure region in the inspector has:
  - `Edit`
  - `Save`
  - `Cancel`
  - `Remove`
- Editable fields are:
  - title
  - region kind/layer
  - notes
  - book label preset for book regions
- The broad region kinds remain:
  - chapter/book region
  - episode
  - section
- Book-region presets now include:
  - Preface
  - Introduction
  - Chapter 0
  - Chapter
  - Interlude
  - Appendix
  - Custom
- Default labels support quick creation of:
  - `Preface`
  - `Introduction`
  - `Chapter 0`
  - `Chapter One`
  - `Episode 1`
- Region cards and block chips keep the user-facing title prominent.

## Data Shape

The localStorage key remains unchanged:

```text
high-ground-studio.manuscript-editor.v1
```

The existing `structureRegions` draft field remains the source of structure
truth. This pass adds only the optional backward-compatible field:

```ts
labelPreset?: string
```

Older regions without `labelPreset` still parse. Invalid presets are normalized
away rather than rejecting the full browser-local draft.

## Validation Performed

Completed before commit:

- `pnpm studio:cloudrun:test`
- `pnpm studio:structure:test`
- `pnpm studio:manuscript:test`
- `pnpm --filter @high-ground/studio-domain typecheck`
- `pnpm --filter studio typecheck`
- `git diff --check`
- `pnpm --filter studio build`

The first `pnpm --filter studio build` attempt hit the known local sandbox
Turbopack/PostCSS helper limitation (`binding to a port`). The same command
passed when rerun outside the sandbox for validation. No app code was changed to
work around the sandbox behavior.

## Boundaries Preserved

- No `.env` changes.
- No `prisma/schema.prisma` changes.
- No database mutation or `db:push`.
- No Cloud Run environment, secret, IAM, DNS, OAuth, or service-account changes.
- No canonical manuscript/content path changes.
- No real manuscript text added to tests or fixtures.

## Deferred

- Database-backed structure persistence.
- Drag-reordering regions.
- Validation for nested or conflicting book/episode/section ranges.
- Public projections or canonical manuscript updates.
- AI-assisted structure suggestions.
