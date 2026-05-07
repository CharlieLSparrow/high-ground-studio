# Book & Episodes Chapter One Split Result

Date: 2026-05-07

## Branch

- `main`

## Files Inspected

- `AGENTS.md`
- `docs/README.md`
- `docs/architecture/living-manuscript-conventions.md`
- `docs/analysis/learning-to-lead-living-manuscript-audit.md`
- `docs/plans/kanban-operating-model.md`
- `docs/project-context/weekly-ship-log.md`
- `docs/sessions/chapter-one-episode-four-incorporation-result.md`
- `docs/sessions/chapter-two-values-split-result.md`
- `apps/web/content/books/learning-to-lead/manuscript/learning-to-lead.living.mdx`
- `apps/web/content/books/learning-to-lead/arrangements/book-v1.yml`
- `apps/web/content/books/learning-to-lead/arrangements/podcast-season-1.yml`
- `apps/web/content/books/learning-to-lead/arrangements/public-site.yml`

## Files Changed

- `docs/project-context/weekly-ship-log.md`
- `docs/sessions/book-episodes-chapter-one-split-result.md`

## Block Split Target

- Requested/default target: `homer-chapter-one-early-days`
- Actual current state: already split before this pass
- Result: no new manuscript split was performed

The actual living manuscript no longer contains `homer-chapter-one-early-days` as a `ManuscriptBlock` ID. It also no longer contains `homer-chapter-two-values-get-some` as a `ManuscriptBlock` ID. Current file state wins over the older audit recommendation.

## Existing Chapter One Child Blocks

- `homer-early-days-preschool-memories`: preschool running-in-circles memory and work-hard/enjoy-it lesson
- `homer-early-days-first-grade-name-calling`: first-grade name-calling and belittling lesson
- `homer-early-days-second-grade-quiet-time`: quiet-time incentive story
- `homer-early-days-third-grade-busy-work`: busy-work and time/purpose lesson
- `homer-early-days-seventh-grade-keyboarding`: keyboarding, shortcuts, and missing the task purpose
- `homer-early-days-farm-years`: farm work, games, joy, and Mary Poppins sugar memory hook

## Arrangement References Updated

- None in this pass.

Current arrangements already reference the Chapter One child blocks:
- `apps/web/content/books/learning-to-lead/arrangements/book-v1.yml`
- `apps/web/content/books/learning-to-lead/arrangements/podcast-season-1.yml`

No arrangement currently references the old parent `homer-chapter-one-early-days`.

## Validation Performed

- `git status --short --branch`
- `git branch --show-current`
- `git pull origin main`
- `git log --oneline -n 8`
- confirmed `homer-chapter-one-early-days` is not present as a current `ManuscriptBlock` ID
- confirmed `homer-chapter-two-values-get-some` is not present as a current `ManuscriptBlock` ID
- confirmed all current `ManuscriptBlock` IDs are unique
- confirmed arrangement references resolve to current living-manuscript block IDs
- confirmed the current Chapter One Homer child block bodies exactly match the original `homer-chapter-one-early-days` parent body from the pre-split git revision
- `git diff --check`
- `git status --short --branch`

## Source-Preservation Caveats

- No new source text was moved in this pass.
- No Homer/Scott prose was rewritten.
- No Charlie prose was added.
- Source preservation for the prior Chapter One split was revalidated from git history by comparing the old parent body to the current concatenated Homer child block bodies.

## Known Limitations

- This pass did not produce a new manuscript split because the target block had already been split.
- The older audit still mentions Chapter One and Chapter Two as split candidates, but both parent IDs are already retired in the current living manuscript.
- This pass did not inspect every possible future coarse block; it only followed the requested Chapter One/Chapter Two decision path and verified the current state.

## Intentionally Unchanged

- No product code was changed.
- No Prisma schema changes were made.
- No dependencies were added.
- No public website routes were created or modified.
- No `apps/web/content/publish` files were touched.
- No `apps/web/content/episodes` files were touched.
- No living manuscript or arrangement files were changed.
- Existing untracked image files and generated build info were not staged.

## Recommended Next Book & Episodes Action

- Incorporate Episode 5 intake into the living manuscript using the Episode 4 pattern: preserve Homer baseline blocks, add Charlie material only as separate draft blocks when sourced from intake, and update the podcast arrangement without duplicating source prose.
