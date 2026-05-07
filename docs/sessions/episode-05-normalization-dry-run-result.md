# Episode 5 Normalization Dry Run Result

Date: 2026-05-07

## Branch

- `main`

## Files Inspected

- `docs/analysis/episode-05-review-packet.md`
- `apps/web/content/books/learning-to-lead/episode-production/season-one.yml`
- `apps/web/content/books/learning-to-lead/episode-breakdowns/episode-05-values-toolkit.md`
- `docs/analysis/charlie-presentation-taxonomy.md`
- `docs/architecture/living-manuscript-conventions.md`
- `docs/sessions/episodes-05-06-onenote-intake-reconciliation-result.md`
- `apps/web/content/books/learning-to-lead/manuscript/learning-to-lead.living.mdx`
- `apps/web/content/books/learning-to-lead/arrangements/podcast-season-1.yml`
- `docs/project-context/weekly-ship-log.md`

## Files Changed

- `docs/analysis/episode-05-normalization-dry-run.md`
- `docs/project-context/weekly-ship-log.md`
- `docs/sessions/episode-05-normalization-dry-run-result.md`

## Dry-Run Summary

Created `docs/analysis/episode-05-normalization-dry-run.md` as a proposed normalization spec only.

The dry run confirms:

- Episode 5-related Homer blocks already exist in the living manuscript.
- Current Charlie blocks only cover Episode 4 / Early Days, not Episode 5 values/trust material.
- The current `values` podcast arrangement is broad and overlaps Episode 6.
- Episode 5 should likely get a separate future `values-toolkit` arrangement key after approved blocks exist.

The spec proposes exact candidate IDs, metadata, pairings, placement guidance, citation/rights status, and an approval checklist for:

- Charlie Tip and Winnemucca reactions.
- Charlie trust/dependability support.
- Optional neurodivergence/follow-through reflection.
- Watson/IBM and Dichotomy/Jocko research bridges.
- Charlie forgive/fire and Roy/coaching-before-removal reflections.
- Samwise, Nate, and Roy clip candidates.
- Team development/diversity production notes.
- Parked radio/dead-cow fragment.

## What Remained Unchanged

- No product code was modified.
- The living manuscript was not modified.
- Arrangement YAML was not modified.
- Publish files were not modified.
- Episode packet files were not modified.
- Raw `_inbox` files were not modified.
- Prisma schema was not modified.
- No dependencies were added.
- No editable controls or Draft-to-Live behavior were added.
- Generated `apps/web/tsconfig.tsbuildinfo` remained unstaged.

## Validation Performed

- `git diff --check`: passed
- `git status --short --branch`: reviewed before staging; generated `apps/web/tsconfig.tsbuildinfo` remained unstaged

## Known Limitations

- This dry run is not human approval.
- Proposed body content is summarized, not written as final prose.
- Citation, quote, and rights verification were not performed.
- Episode 6 remains pending post-recording review, so the Episode 5/6 boundary is still provisional.
- The current manuscript schema does not support first-class `audience` or `presentation` fields; those are documented as recommendations only.

## Recommended Next Book & Episodes Action

Review the dry run with Homer/Charlie and mark each proposed block as approve, park, revise, or reject before editing `learning-to-lead.living.mdx`.
