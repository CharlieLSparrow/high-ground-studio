# Studio Manuscript Filter Lens Result

Date: 2026-05-20

## Purpose

Add Manuscript Filter/Lens Mode inside the existing full-book Manuscript Desk at:

```text
/manuscript
```

The long one-page manuscript remains the primary working surface. This pass adds
view filters and side-panel result lists around that surface instead of splitting
the manuscript into separate pages.

## What Changed

- Added pure block-detail helpers for manuscript filtering:
  - block text and preview extraction
  - author IDs present in each block
  - semantic tag types present in each block
  - structure regions covering each block
- Added filter criteria for:
  - text query
  - author
  - semantic tag
  - structure region
  - structure kind
  - block type
  - only unstructured blocks
  - only blocks with semantic highlights
  - only blocks with no author mark
- Added a right-side panel mode switch:
  - `Structure`
  - `Filters`
  - `Export`
- Filters mode shows:
  - filter controls
  - active filter chips
  - matching block count and total block count
  - clear filters action
  - filtered result list with Jump actions
- Matching blocks can be highlighted in the full manuscript surface.
- The alternate visual mode dims nonmatching blocks while keeping the full
  manuscript visible.
- Added filtered block Markdown export and browser download.

## Data Shape

The localStorage key remains unchanged:

```text
high-ground-studio.manuscript-editor.v1
```

Filter state is view state only. It is not stored in the manuscript draft and
does not change the source TipTap/ProseMirror JSON or `structureRegions`.

## Filtered Markdown Export

The filtered Markdown export includes:

- active filters summary
- matching block count and total block count
- one entry per matching block
- block preview
- block type
- block ID
- structure labels when present

The export is browser-generated only. It does not write server files or repo
files.

## Validation Performed

Completed before commit:

- `pnpm studio:cloudrun:test`
- `pnpm studio:structure:test`
- `pnpm studio:manuscript:test`
- `pnpm --filter @high-ground/studio-domain typecheck`
- `pnpm --filter studio typecheck`
- `pnpm --filter studio build`
- `git diff --check`

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

- Persisting saved filter presets.
- Hiding nonmatching blocks.
- Database-backed search or cross-device filter state.
- AI-assisted chunk discovery.
- Public projections or canonical manuscript updates.
