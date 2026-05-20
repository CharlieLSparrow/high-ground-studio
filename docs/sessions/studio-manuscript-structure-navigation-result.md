# Studio Manuscript Structure Navigation Result

Date: 2026-05-19

## Purpose

Polish Manuscript Desk structure navigation and export while keeping Charlie in
the full manuscript working surface at:

```text
/manuscript
```

This pass keeps structure work browser-local and block-range based. It does not
add database persistence, Yjs/collaboration, AI, Prisma schema changes, Cloud
Run configuration changes, or canonical manuscript writes.

## What Changed

- Block inspector rows now expose precise structure boundary controls:
  - `Set start`
  - `Set end`
  - `Jump`
- The Structure layer panel shows a pending range summary with:
  - start preview
  - end preview
  - block count when both endpoints are valid
  - `Clear pending range`
- `Add structure` uses the pending start/end range when present, then falls back
  to the current manuscript selection when no pending range is set.
- Structure region cards now include:
  - `Jump to start`
  - `Jump to end`
  - `Move up`
  - `Move down`
  - existing `Edit`, `Save`, `Cancel`, and `Remove`
- Move up/down is intentionally limited to the same structure kind/layer.
- Structure outline Markdown can now be exported to a textarea or downloaded as
  a browser-generated `.md` backup.
- `Suggest book regions from headings` scans local block summaries for
  Preface, Introduction, Chapter 0 / Chapter Zero, and Chapter headings. It
  creates Chapter / book ranges only and does not guess episodes.

## Structure Outline Export

The outline export is generated from the existing browser-local
`structureRegions` plus current block summaries. It includes:

- grouped Chapter / book, Episodes, and Sections headings
- region title
- region kind
- block count
- start preview
- end preview
- notes when present

The export does not write server files or repo files.

## Heading Suggestions

Heading suggestions are intentionally conservative:

- clear presets map to Preface, Introduction, Chapter 0, and Chapter
- each suggested book region runs from its heading block through the block
  before the next detected book heading
- existing Chapter / book regions require browser confirmation before
  replacement
- Episode and Section regions are kept and are not guessed automatically

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

- Database-backed structure persistence.
- Drag-and-drop structure ordering.
- Automatic episode inference.
- AI-assisted structure detection.
- Public projections or canonical manuscript updates.
