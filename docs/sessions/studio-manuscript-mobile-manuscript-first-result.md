# Studio Manuscript Mobile Manuscript-First Result

Date: 2026-05-20

## Purpose

Repair the mobile `/manuscript` experience after a real phone test showed that
menus and controls still appeared before the manuscript.

The long-wall manuscript remains the source of truth. This pass changes only
responsive layout and browser-local view controls.

## What Changed

- Hid the full desktop header and draft status panels on phone widths.
- Hid the large Recording / Reading mode control and outline panel on phone
  widths.
- Kept the manuscript surface as the first visible mobile content.
- Hid the manuscript title/chips and selection action strip on phone widths so
  the editor content appears immediately.
- Added a compact fixed mobile bottom bar with:
  - manuscript title
  - recording/focus status
  - `Read` / `Exit`
  - `Tools`
- Added a collapsed mobile tools drawer with:
  - `Recording mode`
  - `Read Homer / Scott parts`
  - `Episode outline`
  - `Chapter / book outline`
  - `Cited quotations`
  - `Full manuscript`
  - author color and semantic color toggles
  - outline jump controls
  - `Back to manuscript`

## Behavior

Opening `/manuscript` on a phone now shows the manuscript first, with controls
available from the bottom bar. Opening and closing mobile tools is view state
only. It does not mutate manuscript JSON, structure regions, author marks,
semantic marks, quote review metadata, exports, or localStorage schema.

Recording / Reading mode still uses TipTap editability to make the manuscript
view-only while active.

## Boundaries Preserved

- No `.env` changes.
- No `prisma/schema.prisma` changes.
- No database mutation or `db:push`.
- No Cloud Run environment, secret, IAM, DNS, OAuth, or service-account changes.
- No canonical manuscript/content path changes.
- No real manuscript text added to tests or fixtures.

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
