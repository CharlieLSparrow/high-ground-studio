# Studio Structure Mode Reset Focus Result

Date: 2026-05-19

## Summary

This pass closed the remaining daily-use Structure Mode polish gaps without
moving beyond the browser-local MVP boundary.

The route remains:

```text
/structure
```

The only persistent client storage key remains:

```text
high-ground-studio.structure-mode.v1
```

## Clear And Reset Behavior

Structure Mode now includes a `Clear draft` control. It requires browser
confirmation and removes only the Structure Mode localStorage key:

```text
high-ground-studio.structure-mode.v1
```

The clear action resets:

- source title
- source type
- pasted source text
- current selection
- selected semantic type
- highlight note
- default lane
- highlight cards
- JSON export text
- outline Markdown export text
- import JSON text
- status message

It does not clear other browser storage and does not touch database rows or
files.

## Source Panel Focus

The pasted source panel can now be hidden or shown. When it is hidden:

- the structure board gets a wider layout
- a compact source title/type/character-count summary stays visible
- highlight creation is disabled
- the UI tells the operator to show the pasted source panel before creating new
  highlights

This keeps Structure Mode usable when the operator is arranging cards and no
longer needs the pasted source textarea on screen.

## Starter Sample

A small starter sample can be loaded from the Structure Mode status panel. If
the current browser draft already has source text or cards, the sample requires
confirmation before replacing that draft.

The sample is short and local-only. It exists to make the interaction model
easy to test without importing source material.

## What Remains Browser-Local

The MVP still stores only source text and highlight-card structure in browser
localStorage. It is not synced to the Studio database.

JSON export/import and Markdown outline export remain the backup and handoff
paths until database-backed Structure Mode persistence exists.

## What Was Intentionally Not Changed

- No Cloud Run deployment.
- No Cloud Build submission.
- No GCP resource, IAM, DNS, or secret changes.
- No Prisma schema changes.
- No database mutations.
- No TipTap or Yjs.
- No embeddings.
- No public projections.
- No importers.
- No canonical manuscript file writes.

## Validation

Completed validation for this pass:

```bash
pnpm studio:cloudrun:test
pnpm exec prisma validate
pnpm --filter @high-ground/studio-domain typecheck
pnpm --filter studio typecheck
pnpm --filter studio build
git diff --check
```

The first sandboxed `pnpm --filter studio build` attempt hit the known
Turbopack/PostCSS process and local-port restriction. The same command passed
when rerun outside the sandbox.
