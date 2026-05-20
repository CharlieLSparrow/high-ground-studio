# Studio Manuscript Cited Quotation Marking Result

Date: 2026-05-20

## Purpose

Add cited quotation marking inside the existing full-book Manuscript Desk at:

```text
/manuscript
```

The manuscript remains the primary working surface. Cited quotations are another
semantic annotation and filter/export lens on the same long manuscript page.

## What Changed

- Added semantic highlight definitions for:
  - `cited-quotation`
  - `quote-candidate`
- Added cited-quotation styling that is visually stronger than the generic
  semantic `quote` style while preserving the underlying text and inline marks.
- Added toolbar and selection actions to mark selected text as a cited
  quotation.
- Reused semantic mark notes as the citation/source note for the MVP.
- Added cited-quotation extraction to block details so filter lenses can find
  blocks containing cited quotations.
- Added a cited quotations list in the Filters side panel with:
  - quote preview
  - block preview and block ID
  - citation/source note
  - covering structure labels
  - Jump action
- Added cited quotations Markdown export and browser download.

## Data Shape

Cited quotations remain inline `semanticHighlightMark` spans in the existing
TipTap/ProseMirror editor JSON.

The localStorage key remains unchanged:

```text
high-ground-studio.manuscript-editor.v1
```

No database schema, persistence layer, or canonical manuscript file was changed.

## Export Behavior

The cited quotations Markdown export includes:

- total cited quotation count
- quote text
- semantic type label
- block ID
- block preview
- structure labels when present
- citation/source note when present

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

- Citation lookup or web verification.
- AI-assisted quote detection.
- Quote Engine / QuipLore ingestion.
- Database-backed quote review workflow.
- Automatically distinguishing dialogue from cited quotations.
