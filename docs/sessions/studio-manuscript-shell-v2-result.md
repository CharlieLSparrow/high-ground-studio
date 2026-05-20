# Studio Manuscript Shell V2 Result

Date: 2026-05-20

## Purpose

Rework `/manuscript` so the manuscript/transcript is the primary desktop
surface, with tools attached through one command bar and one sidebar.

## What Changed

- Replaced the large desktop header/status stack with one compact sticky top
  command bar.
- Removed the separate desktop left import/toolbar column.
- Replaced the old three-column cockpit with:
  - central manuscript surface
  - one sticky mode-switching sidebar
- Added sidebar modes:
  - `Mark`
  - `Structure`
  - `Find`
  - `Quotes`
  - `Backup`
- Moved author marking, semantic marking, cited-quotation marking, and basic
  text commands into `Mark`.
- Moved structure creation, pending range controls, structure outline cards,
  block IDs, and semantic highlight inspection into `Structure`.
- Kept filter lenses, Focus View, Quote Focus, context halo, filtered block
  list, quote navigation, and quote review controls available through `Find`
  and `Quotes`.
- Moved `.docx` import, browser-local source warning, full draft backup,
  editor JSON import/export, HTML/plain text export, Markdown exports, and
  `Clear local draft` into `Backup`.
- Added scroll-margin on manuscript blocks so sticky bars do not cover focused
  content after jumps.

## Sticky Behavior

The command bar is sticky on desktop/tablet and shows:

- manuscript title
- active author
- sidebar mode
- cited quotation count
- Focus View match count when active
- Recording / Reading state
- last saved
- Recording toggle
- Full manuscript exit when Focus View is active
- quick backup download

The sidebar is sticky on desktop/tablet and scrolls internally when its active
mode has long content.

## Mobile Preservation

The mobile manuscript-first path remains intact:

- phone widths still hide the desktop command bar and sidebar
- the manuscript remains the first visible content
- compact bottom tools remain the mobile control affordance
- recording quick views stay inside collapsed mobile tools

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
