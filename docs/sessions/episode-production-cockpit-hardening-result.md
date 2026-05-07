# Episode Production Cockpit Hardening Result

Date: 2026-05-07

## Branch

- `main`

## Files Inspected

- `docs/sessions/episode-production-cockpit-readonly-result.md`
- `docs/architecture/episode-production-lifecycle.md`
- `docs/analysis/episode-view-everything-draft-implementation-plan.md`
- `apps/web/src/lib/server/episode-production.ts`
- `apps/web/src/app/team/books/learning-to-lead/page.tsx`
- `apps/web/src/app/team/books/learning-to-lead/LivingManuscriptViewerClient.tsx`

## Files Changed

- `apps/web/src/lib/server/episode-production.ts`
- `apps/web/src/app/team/books/learning-to-lead/page.tsx`
- `apps/web/src/app/team/books/learning-to-lead/LivingManuscriptViewerClient.tsx`
- `docs/sessions/episode-production-cockpit-hardening-result.md`

## Source Path / Client Boundary

`SeasonOneEpisodeProductionState` no longer exposes `sourcePath`.

The server parser still uses an internal absolute path to read the controlled `season-one.yml` file, but the returned state now carries only the safe repo-relative `sourceLabel`:

- `content/books/learning-to-lead/episode-production/season-one.yml`

The Learning to Lead page also sanitizes existing manuscript and podcast-arrangement `sourcePath` values before passing data to the client component:

- manuscript source is replaced with `content/books/learning-to-lead/manuscript/learning-to-lead.living.mdx`
- podcast arrangement source is replaced with `content/books/learning-to-lead/arrangements/podcast-season-1.yml`

Searches over the parser, page, and viewer found no local home-directory path fragments crossing into the client-facing viewer files.

## Parser Smoke Check Results

The parser remains a narrow parser for the controlled `season-one.yml` structure, not a general YAML parser.

Added a small internal shape-warning helper that reports non-fatal warnings if:

- the file does not parse six Season One episodes
- duplicate episode keys appear
- Episode 5 is missing or does not parse five draft selected items
- Episode 6 is missing or does not parse five draft selected items

One-shot source/reference smoke check:

- episodes parsed: 6
- Episode 5 draft items: 5
- Episode 6 draft items: 5
- intake references found: 9 of 9
- parser warnings: 0
- missing references: none

## Old Episode View Assumption Audit

Removed the dead legacy `EpisodeReadingView`, `ReadingBlock`, and `CharlieAsideBlock` helper path.

Search results after cleanup:

- no `board` mode logic
- no `reading` mode logic beyond normal copy text such as "reading experience"
- no stale `Podcast Episode Groups` label
- no stale `Episode groups show arranged` copy
- `episodeViewMode` now checks only `everything` and `draft`

Book View and Story View rendering behavior were not changed.

## Validation Performed

- `pnpm --filter web exec tsc --noEmit`: passed during hardening
- `pnpm --filter web exec next build --webpack`: passed
- `git diff --check`: passed
- `git status --short --branch`: reviewed during hardening; generated `apps/web/tsconfig.tsbuildinfo` remains unstaged

## Known Limitations

- The cockpit still does not parse full structured intake Markdown bodies.
- The parser is intentionally narrow and only supports the controlled structure used by `season-one.yml`.
- Episode 5 and Episode 6 still share the broad `values` arrangement key.
- Episode 6 still needs post-recording review before normalization.

## Intentionally Unchanged

- No living manuscript changes.
- No arrangement YAML changes.
- No publish files changed.
- No episode packet files changed.
- No raw `_inbox` files changed.
- No Prisma schema changes.
- No dependencies added.
- No editable status controls.
- No Draft-to-Live publishing behavior.

## Recommended Next Book & Episodes Action

Review Episode 5 in the hardened cockpit with Homer/Charlie, then run the narrow Episode 5 living-manuscript normalization pass if the selected sequence is accepted.
