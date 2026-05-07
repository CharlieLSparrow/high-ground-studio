# Episodes 05-06 OneNote Intake Reconciliation Result

Date: 2026-05-07

## Branch

- `main`

## Files Inspected

- `AGENTS.md`
- `docs/README.md`
- `docs/project-context/season-one-production-state.md`
- `docs/project-context/weekly-ship-log.md`
- `docs/analysis/charlie-presentation-taxonomy.md`
- `docs/architecture/living-manuscript-conventions.md`
- `docs/sessions/season-one-production-state-reconciliation-result.md`
- `docs/sessions/chapter-one-episode-four-incorporation-result.md`
- `docs/sessions/episodes-04-06-breakdown-intake-result.md`
- `apps/web/content/_inbox/Episode 1 - Preface.md`
- `apps/web/content/_inbox/Episode 2 - Introduction.md`
- `apps/web/content/_inbox/Episode 3 - Chapter 0.md`
- `apps/web/content/_inbox/Episode 4.1 and 4.2 - Chapter 1.md`
- `apps/web/content/_inbox/Episode 5 - Chapter 2.md`
- `apps/web/content/_inbox/Episode 6 - Chapter 2 Continued.md`
- `apps/web/content/books/learning-to-lead/episode-breakdowns/`
- `apps/web/content/books/learning-to-lead/episode-breakdowns/season-one-working-map.md`

## Files Changed

- `docs/analysis/episodes-01-06-onenote-intake-audit.md`
- `apps/web/content/books/learning-to-lead/episode-breakdowns/episode-05-values-toolkit.md`
- `apps/web/content/books/learning-to-lead/episode-breakdowns/episode-06-trust-through-consistency.md`
- `docs/project-context/season-one-production-state.md`
- `apps/web/content/books/learning-to-lead/episode-breakdowns/season-one-working-map.md`
- `docs/project-context/weekly-ship-log.md`
- `docs/README.md`
- `docs/sessions/episodes-05-06-onenote-intake-reconciliation-result.md`

## Raw Inbox Files Found

All six expected files were found and were already tracked by Git:

- `apps/web/content/_inbox/Episode 1 - Preface.md`
- `apps/web/content/_inbox/Episode 2 - Introduction.md`
- `apps/web/content/_inbox/Episode 3 - Chapter 0.md`
- `apps/web/content/_inbox/Episode 4.1 and 4.2 - Chapter 1.md`
- `apps/web/content/_inbox/Episode 5 - Chapter 2.md`
- `apps/web/content/_inbox/Episode 6 - Chapter 2 Continued.md`

## Episode 5 Changes

- Replaced the earlier summary-style Episode 5 breakdown with a structured intake classification.
- Preserved the latest raw OneNote source as staging truth by pointing to `_inbox/Episode 5 - Chapter 2.md`.
- Classified Tip/Winnemucca, trust/dependability, milk down the drain, forgive/fire, Roy Firing, team development, diversity, and trailing radio/dead-cow fragments.
- Kept `Samwise Clip`, `Nate Clip`, and `Roy Firing` as clip candidates, not clean book prose.
- Marked Episode 5 as recorded and the highest-priority future living-manuscript normalization candidate.

## Episode 6 Changes

- Replaced the earlier summary-style Episode 6 breakdown with a structured intake classification.
- Preserved the latest raw OneNote source as staging truth by pointing to `_inbox/Episode 6 - Chapter 2 Continued.md`.
- Classified Rocky/Miracle on Ice, Mount Fuji, trust research, Joe vs the Volcano, grudges, flashlight/listening, canal-company time, early work/autonomy, trust rupture closure, McFarland USA, Toyota/andon, and habit-formation draft material.
- Kept Rocky, Joe vs the Volcano, Joe Quitting, McFarland USA, and other pop-culture references as clip/reaction/production candidates.
- Marked Episode 6 as prepped / pending recording and recommended post-recording review before normalization.

## Classification Categories Used

- Homer baseline candidate
- Charlie inline candidate
- Charlie sidebar/reflection candidate
- research bridge / field note candidate
- clip candidate
- production note
- unresolved / needs human decision

## What Remained Unchanged

- No product code was modified.
- Prisma schema was not modified.
- No dependencies were added.
- The living manuscript was not modified.
- Arrangement YAML was not modified.
- `apps/web/content/publish` was not modified.
- `apps/web/content/episodes` was not modified.
- Raw OneNote files were not edited.
- No untracked images or generated build files were staged.

## Validation Performed

- `git diff --check`
- `git status --short --branch`

## Known Limitations

- This pass classified raw OneNote/export material; it did not verify citations, rights, or quote wording.
- Episode 6 should still be reviewed after recording because the raw file includes duplicate drafts, table fragments, and unresolved questions.
- Episode 3 likely contains duplicate/alternate draft material and still needs a separate review before normalization.
- Episode 4 should be compared against existing living-manuscript incorporation before any further changes.

## Recommended Next Book & Episodes Action

Review the Episode 5 structured intake with Homer/Charlie, then run a narrow Episode 5 living-manuscript normalization pass if the classification is accepted.
