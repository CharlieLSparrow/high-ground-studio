# Studio Manuscript Cited Quotation Review Result

Date: 2026-05-20

## Purpose

Add browser-local cited quotation metadata and review workflow inside the
existing full-book Manuscript Desk at:

```text
/manuscript
```

The manuscript remains the working surface. Cited quotations are still marked in
the manuscript and reviewed from the side panel.

## What Changed

- Added draft-level cited quotation review metadata keyed by semantic highlight
  ID.
- Added structured quote review fields:
  - attributed to
  - source title
  - source type
  - locator
  - citation text
  - review status
  - rights note
  - editor note
- Added review status values:
  - `needs-source`
  - `needs-verification`
  - `verified`
  - `do-not-use`
- Added source type values:
  - `book`
  - `article`
  - `speech`
  - `interview`
  - `scripture`
  - `unknown`
  - `other`
- Added inline review editing on cited quotation cards in the Filters side
  panel.
- Added review metadata to the cited quotations Markdown export.

## Data Shape

The localStorage key remains unchanged:

```text
high-ground-studio.manuscript-editor.v1
```

The draft schema version remains `1`. Older browser-local drafts and older full
draft JSON exports that do not include `quoteReviews` parse with an empty review
map.

Cited quotation marks remain inline `semanticHighlightMark` spans in the
TipTap/ProseMirror editor JSON. Structured review data is stored at the draft
level as:

```json
{
  "quoteReviews": {
    "semantic-highlight-id": {
      "highlightId": "semantic-highlight-id",
      "reviewStatus": "needs-source",
      "sourceType": "unknown"
    }
  }
}
```

## Export Behavior

The cited quotations Markdown export now includes:

- quote text
- block ID
- block preview
- structure labels when present
- original semantic source note when present
- review status
- attribution
- source title and source type
- locator
- citation text
- rights note
- editor note

The export is browser-generated only. It does not write server files or repo
files.

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

- Database-backed quote review workflow.
- Quote Engine or QuipLore integration.
- AI-assisted quote detection or source lookup.
- Web citation lookup or source verification.
- Cross-device collaboration.
