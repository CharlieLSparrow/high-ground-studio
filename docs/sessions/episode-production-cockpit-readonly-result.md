# Episode Production Cockpit Read-Only Result

Date: 2026-05-07

## Branch

- `main`

## Files Inspected

- `AGENTS.md`
- `docs/README.md`
- `docs/architecture/episode-production-lifecycle.md`
- `docs/analysis/episode-view-everything-draft-implementation-plan.md`
- `docs/project-context/season-one-production-state.md`
- `docs/analysis/episodes-01-06-onenote-intake-audit.md`
- `docs/analysis/charlie-presentation-taxonomy.md`
- `docs/sessions/episodes-05-06-onenote-intake-reconciliation-result.md`
- `apps/web/content/books/learning-to-lead/episode-breakdowns/episode-05-values-toolkit.md`
- `apps/web/content/books/learning-to-lead/episode-breakdowns/episode-06-trust-through-consistency.md`
- `apps/web/content/books/learning-to-lead/episode-breakdowns/season-one-working-map.md`
- `apps/web/src/app/team/books/learning-to-lead/page.tsx`
- `apps/web/src/app/team/books/learning-to-lead/LivingManuscriptViewerClient.tsx`
- `apps/web/src/lib/server/living-manuscript.ts`

## Files Changed

- `apps/web/content/books/learning-to-lead/episode-production/season-one.yml`
- `apps/web/src/lib/server/episode-production.ts`
- `apps/web/src/app/team/books/learning-to-lead/page.tsx`
- `apps/web/src/app/team/books/learning-to-lead/LivingManuscriptViewerClient.tsx`
- `docs/project-context/season-one-production-state.md`
- `docs/project-context/weekly-ship-log.md`
- `docs/README.md`
- `docs/sessions/episode-production-cockpit-readonly-result.md`

## Production State File Created

Created `apps/web/content/books/learning-to-lead/episode-production/season-one.yml` as the first file-backed Season One production state layer.

It includes Episodes 1-6 with:

- episode number and title
- lifecycle status
- recording status
- public slug when known
- source confidence
- raw and structured intake references
- arrangement keys
- draft status
- draft selected items
- recording/show-note placeholders
- unresolved decisions
- warnings
- next action

Episode 5 is the first full fixture because it is recorded and classified. Episode 6 remains `Ready to Record` / pending post-recording review.

## Parser Behavior

Added `apps/web/src/lib/server/episode-production.ts`.

The parser:

- reads `episode-production/season-one.yml`
- normalizes lifecycle, draft, warning, decision, and reference fields
- returns typed production-state data for the viewer
- verifies referenced raw/structured intake files exist
- surfaces missing-file warnings without breaking the viewer
- does not parse raw `_inbox` content bodies
- does not mutate status or write state

## Viewer Behavior

The internal Learning to Lead page now loads production state server-side and passes it into the existing client viewer.

Episode View now shows:

- read-only `Everything` and `Draft` subviews
- a Season One episode selection sidebar
- lifecycle status, recording status, source confidence, unresolved decision counts, and warnings
- Everything View with intake references, unresolved decisions, warnings, notes, and the matched podcast arrangement snapshot
- Draft View with YAML-selected draft items, classifications, sources, and notes

Book View and Story View behavior remain unchanged.

## Validation Performed

- `pnpm --filter web exec tsc --noEmit`: passed
- `pnpm --filter web exec next build --webpack`: passed
- `git diff --check`: passed
- `git status --short --branch`: reviewed before staging; generated `apps/web/tsconfig.tsbuildinfo` was left unstaged

## Known Limitations

- The cockpit does not parse full structured intake Markdown bodies yet.
- Candidate counts are based on state-file selections and arrangement metadata, not full intake-section parsing.
- Episode 5 and Episode 6 still share the broad `values` podcast arrangement key.
- Episode 6 should be reviewed after recording before normalization.
- No editable lifecycle controls exist.
- No Draft-to-Live publishing flow exists.

## Intentionally Unchanged

- No living manuscript changes.
- No arrangement YAML changes.
- No publish files changed.
- No episode packet files changed.
- No raw `_inbox` files changed.
- No Prisma schema changes.
- No dependencies added.
- No editable status controls or public publishing behavior added.

## Recommended Next Book & Episodes Action

Review Episode 5 in the new cockpit with Homer/Charlie, then run the narrow Episode 5 living-manuscript normalization pass if the selected sequence is accepted.
