# Studio HGO Projection Bridge Result

Date: 2026-05-21

## Summary

Added the first browser-only Studio-to-HGO projection bridge.

Existing local commits were pushed to `origin/main` before bridge work began.
After `git fetch origin main`, `HEAD...origin/main` reported `0 0`.

The bridge keeps the source/projection boundary explicit:

- Studio `/manuscript` remains the private source and tagging cockpit.
- HGO remains the projection renderer and staged review surface.
- Studio exports public-safe HGO projection JSON from browser-local synthetic or
  tagged manuscript metadata.
- HGO imports pasted JSON at `/projection-preview/import`, validates it, and
  renders with the existing projection renderer.

## What Changed

- Added a pure Studio helper to create an HGO episode projection from manuscript
  metadata without exporting raw full draft JSON.
- Added Publish-mode controls for generating and downloading HGO projection
  JSON.
- Added an HGO projection validation helper.
- Added `/projection-preview/import` for client-side pasted JSON preview.
- Updated architecture, inventory, current-state, and smoke checklist docs.

## Safety Boundary

This pass did not use real manuscript text or real HGO content.

It did not touch:

- Prisma schema
- database push/migration
- Cloud SQL
- Cloud Run
- DNS
- OAuth
- billing
- secrets
- Yjs/collaboration
- autosave
- deployment
- canonical manuscript/content files

## Validation

Passed:

- `pnpm studio:manuscript:test`
- `pnpm --filter studio typecheck`
- `pnpm --filter web build`

Notes:

- The first sandboxed `pnpm --filter web build` run hung in the known Turbopack
  phase and was terminated.
- The exact same build rerun outside the sandbox passed and listed
  `/projection-preview/import`.

Remaining final check for the commit pass:

- `git diff --check`

## Manual Smoke

1. Open Studio `/manuscript`.
2. Load the synthetic smoke draft.
3. Open Publish mode.
4. Generate HGO episode projection JSON.
5. Download HGO episode projection JSON.
6. Open HGO `/projection-preview/import`.
7. Paste JSON.
8. Confirm the visual episode page renders.
9. Confirm unresolved citation states are visible.
10. Confirm no server writes happen.
11. Confirm no real content is used.
