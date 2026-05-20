# Studio Manuscript Mobile Recording Result

Date: 2026-05-20

## Purpose

Add a mobile-friendly responsive pass and Recording / Reading companion mode to
the existing full-book Manuscript Desk at:

```text
/manuscript
```

The long-wall manuscript remains the source of truth. Recording mode is only a
responsive viewing and navigation layer around the same editor JSON, block IDs,
author marks, semantic marks, quote reviews, and structure regions.

## What Changed

- Reordered the narrow-screen layout so the manuscript surface appears before
  dense import/edit controls.
- Kept side-panel controls touch-friendly with wrapping buttons and compact
  mode tabs.
- Replaced the long status metadata line with compact chips for active author,
  saved time, structure count, and source file.
- Added a browser-local `Recording / Reading mode` toggle.
- Recording mode makes the TipTap editor read-only with `editor.setEditable`.
- Recording mode hides the advanced import/edit toolbar and export panel.
- Selection editing controls are replaced by clear read-only copy while
  Recording mode is active.
- Added recording quick views:
  - `Read Homer / Scott parts`
  - `Episode outline`
  - `Chapter / book outline`
  - `Cited quotations`
  - `Full manuscript`
- Added a compact recording outline panel with structure kind filtering,
  structure titles, block counts, and jump-to-start / jump-to-end controls.
- Added mobile and recording-mode CSS for more comfortable manuscript reading.
- Tuned Recording mode toward a clean continuous script view:
  - Homer / Scott prose reads as primary text.
  - Charlie-marked spans remain visibly blue.
  - Structure regions show compact red-toned labels above covered blocks.
  - Cited quotations keep distinct quotation styling.

## Data Shape

The localStorage key remains unchanged:

```text
high-ground-studio.manuscript-editor.v1
```

Recording mode state is not stored in the manuscript draft. Changing modes does
not mutate the editor JSON, structure regions, author marks, semantic marks,
quote review metadata, or exports.

## Read-Only Behavior

Recording mode uses TipTap's editability toggle so the manuscript surface is
view-only while active. Exiting Recording mode restores editability and returns
the editing controls.

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

- Clip markers.
- Recording comments.
- Take markers.
- Audio sync.
- Multi-user collaboration.
- Saved recording presets.
