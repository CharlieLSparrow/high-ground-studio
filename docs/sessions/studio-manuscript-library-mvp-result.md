# Studio Manuscript Library MVP Result

Date: 2026-05-21

## Summary

Added the first Studio Manuscript Library MVP so `/manuscript` can work with
named manuscripts instead of only a flat account-wide snapshot stack.

## What Changed

- Added a private `StudioManuscript` Prisma model.
- Added optional `StudioManuscriptSnapshot.manuscriptId`.
- Added `StudioManuscriptKind` with `WORKING` and `SYNTHETIC`.
- Added `/api/manuscript/library` for listing and creating named manuscript
  records.
- Updated snapshot list/latest/save flows so they can scope to a selected
  manuscript while leaving legacy/orphan snapshots loadable.
- Added a `Backup` mode Manuscript Library panel for:
  - selecting a named manuscript
  - creating a manuscript from the current browser-local draft metadata
  - seeing recent manuscripts
  - saving snapshots under a selected manuscript
  - loading the latest selected-manuscript snapshot

## Boundaries Preserved

- Browser-local draft remains the active working copy.
- Snapshot saves are still manual.
- Creating a named manuscript stores metadata only, not raw editor JSON.
- Existing snapshots without a manuscript id remain valid legacy/orphan
  snapshots.
- No autosave.
- No Yjs or collaboration.
- No public publishing.
- No HGO real content.
- No canonical manuscript or content-file writes.
- No deploy.

## Schema Note

This is an additive Prisma schema change. It was not applied to any database in
this session. The target database must be updated through the approved operator
path before the live runtime can use the new library tables.

## Validation Result

Passed locally:

```bash
pnpm db:generate
pnpm exec prisma validate
pnpm studio:manuscript:test
pnpm --filter studio typecheck
pnpm --filter studio build
pnpm --filter web build
git diff --check
```

Notes:

- Studio and web production builds passed outside the sandbox.
- A sandboxed Studio build hit the known Turbopack/PostCSS port-binding
  restriction.
- A sandboxed web build stalled in Turbopack compile and was stopped before the
  successful outside-sandbox rerun.
- No `db:push`, migration, deploy, Cloud Run update, Cloud SQL mutation, DNS,
  OAuth, billing, or secret change was run.
