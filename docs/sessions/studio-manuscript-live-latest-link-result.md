# Studio Manuscript Latest Link Result

Date: 2026-05-26

## Result

Added a private stable manuscript route:

- `/manuscript/live/latest`

The route is Studio-auth-gated and loads the newest saved
`StudioManuscriptSnapshot` row when an authorized Studio user opens it. It is
intended for the phone handoff flow after the desktop browser has explicitly
saved a manual server snapshot.

## What Changed

- Added `GET /api/manuscript/live/latest`.
- Added `/manuscript/live/[slug]` with `latest` as the only supported slug.
- Added a `Copy phone link` action in the Manuscript Desk `Backup` snapshot
  panel.
- Added client auto-load behavior for `/manuscript/live/latest`.
- Recorded the route in current-state docs and the manuscript smoke runbook.

## Boundaries

- No Prisma schema change.
- No automatic server save.
- No public manuscript publishing.
- No canonical manuscript truth mutation.
- The route points to the latest saved server snapshot, so desktop still needs
  to click `Save to manuscript` before the phone should expect new content.

## Validation Target

Use the usual Studio deploy validation path:

- `pnpm studio:cloudrun:test`
- `pnpm studio:manuscript:test`
- `pnpm --filter studio typecheck`
- `pnpm --filter studio build`
- Live smoke: open `/manuscript/live/latest` as an authorized Studio user.
