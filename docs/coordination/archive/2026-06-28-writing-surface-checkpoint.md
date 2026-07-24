# Writing Surface Checkpoint - 2026-06-28

## Status

The `/create` Nest writing surface has a validated OneNote-floor navigation slice, but the source files involved are mixed with preexisting dirty work. Do not commit these files wholesale without patch-level review.

Validation passed after the latest changes:

```bash
./node_modules/.bin/tsc -p apps/quipsly/tsconfig.json --noEmit
```

The current focused diff was also captured for review/recovery:

```text
docs/coordination/patches/2026-06-28-writing-surface-current-diff.patch
```

## Validated product behavior

The current `/create` notebook rail now supports:

- Three notebook modes: Pages, Structure, Tools.
- Page Shelf filters: All, Writing, Notes, Sources.
- Per-Nest local memory for selected notebook mode.
- Per-Nest local memory for selected Page Shelf.
- Per-Nest recent pages list.
- `Cmd/Ctrl+K` focuses notebook search and opens Pages mode.
- `Alt+A`, `Alt+W`, `Alt+N`, `Alt+S` switch Page Shelf filters.
- `Alt+P` creates a writing page and switches to Writing.
- `Alt+Q` creates a quick note and switches to Notes.
- `Alt+R` creates a fixed study source and switches to Sources.
- Active page rename from the notebook rail.
- Rename updates document metadata only; it does not rewrite body/source/manuscript text.
- Rename refreshes server state and shows inline errors.
- A small `OneNote floor` orientation card now keeps the daily writing expectation visible inside `/create`.
- The orientation card shows current page role, safe next action, and whole-page vs focused-section scope.

## Files touched by this slice

- `apps/quipsly/src/app/(app)/create/ViewFilter.tsx`
- `apps/quipsly/src/app/(app)/nests/[slug]/actions.ts`
- `docs/quipsly/writing-surface-history-and-consolidation-plan.md`

## Commit warning

`apps/quipsly/src/app/(app)/nests/[slug]/actions.ts` has a larger diff than just `renameDocumentAction`. It includes other Nest/HGO source-import work. Do not use `git add .` or stage the full file unless that broader work is intentionally part of the commit.

Recommended commit strategy:

1. Use patch-level staging for only the notebook rail and rename action changes.
2. Keep HGO source-import and draft-shell changes in a separate commit if they are ready.
3. Keep generated reports/current-state artifacts out of source commits unless explicitly intended.
4. Use `docs/coordination/patches/2026-06-28-writing-surface-current-diff.patch` as a review aid, not as proof that the whole diff is clean to commit.

## Product rationale

This slice moves `/create` toward the minimum OneNote-equivalent floor: fast capture, fast retrieval, clear page type, recent context, visible current page, and safe rename. Advanced Quipsly intelligence should remain secondary until this floor feels trustworthy.
