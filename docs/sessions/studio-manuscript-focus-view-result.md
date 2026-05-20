# Studio Manuscript Focus View Result

Date: 2026-05-20

## Purpose

Add Focus View filtering inside the existing full-book Manuscript Desk at:

```text
/manuscript
```

The manuscript remains the source of truth. Focus View is only a visual lens
over the long-wall editor.

## What Changed

- Added a third filter visual mode:
  - `hide-nonmatches`
- Kept the existing visual modes:
  - `highlight-matches`
  - `dim-nonmatches`
- Added a `manuscript-filter-hide` DOM class for nonmatching block nodes when
  filters are active and Focus View is selected.
- Updated `Show only cited quotations` to set the semantic filter to
  `cited-quotation` and switch the visual mode to `hide-nonmatches`.
- The existing filter result list, Jump actions, cited quotation list, and
  Markdown exports continue to use the same filtered block data.

## Data Shape

The localStorage key remains unchanged:

```text
high-ground-studio.manuscript-editor.v1
```

Focus View state is not stored in the manuscript draft. Hidden blocks remain in
the TipTap/ProseMirror editor JSON, full draft JSON, HTML export, and plain text
export.

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

- Persisting saved Focus View presets.
- Keyboard shortcuts for toggling Focus View.
- Database-backed query presets.
- Quote Engine or QuipLore integration.
