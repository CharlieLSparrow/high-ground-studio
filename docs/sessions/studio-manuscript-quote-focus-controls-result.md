# Studio Manuscript Quote Focus Controls Result

Date: 2026-05-20

## Purpose

Add Quote Review Focus Controls inside the existing full-book Manuscript Desk
at:

```text
/manuscript
```

The manuscript remains the source of truth. Quote Focus is only a visual and
review lens over the long-wall editor.

## What Changed

- Added quote review status filtering for cited quotations:
  - `needs-source`
  - `needs-verification`
  - `verified`
  - `do-not-use`
  - `no-review-metadata`
- Extended block filtering so Focus View can narrow to blocks containing cited
  quotations with a chosen review status.
- Added quick actions in the Filters panel:
  - `Quote Focus`
  - `Needs Source Focus`
  - `Needs Verification Focus`
  - `Exit Focus View`
- Added quote-to-quote navigation in the cited quotations section:
  - previous quote
  - jump current
  - next quote
  - current quote count
- Added a compact quote review progress summary for total cited quotations and
  review status counts.
- Added context halo support for Focus View:
  - `0 blocks`
  - `1 block`
  - `2 blocks`
- Added `manuscript-filter-context` styling for visible context blocks.

## Data Shape

The localStorage key remains unchanged:

```text
high-ground-studio.manuscript-editor.v1
```

Quote Focus state is not stored in the manuscript draft. Hidden blocks and
context blocks remain in the TipTap/ProseMirror editor JSON and full draft JSON.

The only new model fields are derived in-memory summaries for current
quotations, such as whether a cited quotation has explicit review metadata.

## Export Behavior

The cited quotation Markdown export uses the current visible quote list. When a
quote review status filter is active, the export includes only matching cited
quotations. Context halo blocks do not count as matches and are not added to
quote exports.

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

- Saved Focus View presets.
- Keyboard shortcuts for quote navigation.
- Database-backed quote review queues.
- AI-assisted quote detection or source lookup.
- Web citation lookup or verification.
- Quote Engine or QuipLore integration.
