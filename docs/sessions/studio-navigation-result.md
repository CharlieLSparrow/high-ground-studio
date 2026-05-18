# Studio Navigation Result

Date: 2026-05-18

## Summary

This pass added a small shared navigation layer for `apps/studio` now that the
private Studio has two active desks:

- `/` - Tagging Desk
- `/write` - Writing Desk

The implementation kept `/` as the tagging desk. It did not introduce a new
home/dashboard route or move tagging to `/tag`.

## What Changed

- Added a shared `StudioNav` component.
- Added route-aware links for Tagging Desk and Writing Desk.
- Added disabled future lanes for Structures, Projections, and Sources.
- Used the nav in both the tagging desk and writing desk headers.
- Added one-line orientation panels:
  - Tagging Desk: find meaning in source material.
  - Writing Desk: create private draft material.

## What Did Not Change

- No Prisma schema changes.
- No database writes or `db:push`.
- No TipTap or Yjs.
- No embeddings or semantic search.
- No public projections.
- No deployment changes.

## Route Status

Current active Studio routes:

```text
/
/write
```

Both routes continue to use the private Studio auth boundary.

## Validation

Completed validation for this pass:

```bash
pnpm --filter studio typecheck
pnpm --filter studio build
git diff --check
```
