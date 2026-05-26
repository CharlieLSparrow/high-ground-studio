# Studio Manuscript Mobile Writing Result

Date: 2026-05-26

## What Changed

The private Studio `/manuscript` desk now has a stronger mobile writing path.

- Mobile editor view shows manuscript stats without needing the desktop sidebar.
- Mobile writing controls can mark selected text as Charlie, Homer / Scott, or
  unassigned.
- Mobile writing controls can choose a semantic tag, add a semantic note, apply
  or clear semantic marks, and mark cited quotations.
- Mobile tools include a semantic palette, selected-tag focus, all-semantic
  focus, quote focus, and direct return to the manuscript surface.
- Focus View can now be entered for any semantic tag from the mobile flow.
- Mobile CSS improves manuscript readability, caret visibility, bottom safe-area
  padding, long-word wrapping, filter visibility, and inline semantic mark
  legibility.

## Data Boundary

No manuscript schema, Prisma schema, snapshot format, server route, or canonical
content path changed. The existing TipTap document JSON, durable block IDs,
author marks, semantic highlight marks, manual snapshot behavior, and
browser-local draft envelope remain the source of truth.

## Validation

Run for this pass:

- `pnpm --filter studio typecheck`
- `pnpm studio:manuscript:test`
- `pnpm --filter studio build`
- `git diff --check`

Build note:

- The sandbox build still hits the known Turbopack/PostCSS helper port-bind
  restriction. The outside-sandbox build passed after the dependency graph was
  repaired.
- The repair was to pin the new QuipLore apps and the root `react-datepicker`
  peer graph to the same Next/React versions already used by Studio/Web:
  `next@16.1.6`, `react@19.2.4`, and `react-dom@19.2.4`. That collapsed pnpm
  back to one generated `@prisma/client` instance.
