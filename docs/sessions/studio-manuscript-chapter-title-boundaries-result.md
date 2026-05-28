# Studio Manuscript Chapter Title Boundaries Result

Date: 2026-05-26

## What Changed

Studio `/manuscript` can now mark a manuscript block as a chapter title. The
chapter title marker is the saved source of truth, and the chapter range is
derived from document order: each marked title owns itself and every following
block until the next marked title.

- Full draft JSON and browser-local saves now include `chapterTitleBlocks`.
- Older drafts and snapshots without `chapterTitleBlocks` still load with an
  empty marker list.
- The Structure panel has a chapter title map generated from current block
  order.
- The Block IDs list can mark or unmark a block as a chapter title.
- The editor surface highlights marked title blocks.
- Mobile tools can mark the current block as a chapter title, and the mobile
  chapter outline prefers the derived chapter map when title markers exist.

## Data Boundary

This does not change Prisma, server snapshot tables, public publishing paths, or
canonical manuscript content. Manual server snapshots continue to store the full
draft JSON payload; the new marker array rides inside that existing draft
envelope.

Explicit `chapter` structure regions still exist for overlapping production
ranges, episodes, exports, and any places that need manually named or reordered
regions. The chapter title map is a lighter manuscript-order projection.

## Validation

Run for this pass:

- `pnpm studio:manuscript:test`
- `pnpm --filter studio typecheck`
- `git diff --check`
