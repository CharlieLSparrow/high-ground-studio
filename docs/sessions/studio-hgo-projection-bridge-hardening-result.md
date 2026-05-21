# Studio HGO Projection Bridge Hardening Result

Date: 2026-05-21

## Summary

Hardened the browser-only Studio-to-HGO projection bridge before real manuscript
use.

The bridge still has the same shape:

- Studio `/manuscript` Publish mode generates and downloads HGO projection JSON.
- HGO `/projection-preview/import` validates pasted JSON and renders it with the
  shared projection renderer.
- No server writes, persistence, deployment, schema changes, or canonical
  content writes are involved.

## Safety Review

The helper does not export:

- raw `editorJson`
- `quoteReviews`
- `structureRegions`
- inline marks
- private editor notes
- browser-local draft state
- server snapshot metadata
- internal Studio target Episode region IDs

The helper can export staged-review projection fields:

- cited quotation text
- source titles and citation text in source-note summaries
- structure titles
- author span/word summaries
- block counts
- static bridge/citation/source-safety backstage notes
- synthetic source filenames only

This means real manuscript projection JSON is private/staged review material,
not public-safe output, until citation and public-safety review is complete.

## Hardening Changes

- Replaced public-safe wording in Studio bridge copy with projection draft /
  staged review draft language.
- Added Studio bridge warning copy:
  - Synthetic testing is safe.
  - Real manuscript projection drafts may include quoted text and structure
    titles.
  - Treat generated JSON as private/staged until citation and public-safety
    review is complete.
  - Do not paste real projection drafts into public places.
- Removed internal target Episode region IDs from the Studio projection source
  metadata.
- Added HGO validator warnings for Studio browser bridge origin, staged status,
  staged visibility, pull quote presence, unresolved citation state, live
  status, and public visibility.

## Validation

Required validation for this pass:

- `pnpm studio:manuscript:test`
- `pnpm --filter studio typecheck`
- `pnpm --filter web build`
- `git diff --check`

The web build may need the known outside-sandbox rerun if Turbopack hangs in the
sandbox.
