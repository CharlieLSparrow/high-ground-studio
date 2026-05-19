# Studio Manuscript First-Use Hardening Result

Date: 2026-05-19

## Purpose

Harden the browser-local Manuscript Desk at `/manuscript` for the first real
Scott/Homer Word document work session after the block-aware MVP landed.

This pass keeps the product direction explicit: Scott/Homer's original `.docx`
is the source of truth for the first editing workflow. Older OneNote and
Markdown export attempts remain archive/reference material, not import targets
for this MVP.

## What Changed

- `.docx` import now asks for confirmation before replacing an existing
  meaningful browser-local draft.
- Imported `.docx` content is marked Homer / Scott by default.
- After `.docx` import and after `Mark all as Homer / Scott`, the active author
  becomes Charlie so new writing is less likely to inherit Homer / Scott.
- Import summary metadata is stored with the browser-local draft:
  - source file name
  - word count
  - character count
  - block count
  - imported timestamp
- The status area states that imported text is Homer / Scott, new writing should
  be Charlie, and backups should be exported before major edits.
- Full browser download buttons were added for:
  - full draft JSON
  - editor JSON
  - HTML
  - plain text
- Download filenames are generated from a safe title slug, backup type, and
  timestamp.
- Existing export textareas remain available for inspect/copy workflows.
- JSON import now asks for confirmation before replacing an existing meaningful
  browser-local draft.
- Clear local draft continues to require browser confirmation.
- A compact selection actions strip was added near the editor for:
  - Mark Charlie
  - Mark Homer / Scott
  - Clear author
  - Apply selected semantic highlight
  - Clear semantic highlight
- The block inspector now shows a prominent block count.
- The block inspector warns if any visible block lacks a `blockId`.
- Block previews can be clicked to focus the matching editor block.

## Validation Performed

Completed before commit:

- `pnpm studio:cloudrun:test`
- `pnpm studio:structure:test`
- `pnpm studio:manuscript:test`
- `pnpm --filter @high-ground/studio-domain typecheck`
- `pnpm --filter studio typecheck`
- `git diff --check`
- `pnpm --filter studio build`

The first `pnpm --filter studio build` attempt hit the known local sandbox
Turbopack/PostCSS helper limitation (`binding to a port`). The same command
passed when rerun outside the sandbox for validation. No app code was changed to
work around the sandbox behavior.

## Deployment

Planned after validation, commit, and push:

- build a Studio image with `pnpm studio:cloudbuild:image:sha`
- update the existing Cloud Run `studio` service in `us-central1` to the new
  image

No IAM, DNS, Secret Manager, billing, OAuth, database, schema, environment, or
canonical manuscript changes are part of this pass.

## Deferred

- Database-backed manuscript persistence.
- Revision history and cross-browser sync.
- Yjs or real-time collaboration.
- `.docx` export.
- AI-assisted block analysis, research extraction, or public projection.
- Import optimization for old OneNote or Markdown exports.
- Floating bubble toolbar; the first-use pass uses a compact fixed selection
  action strip instead.
