# Season One Production State

Last updated: 2026-05-07

## Purpose

This doc reconciles real Season One production status against what the repo currently represents.

It exists because book writing and podcast episode prep are the highest-priority lane. The content engine should follow the actual writing, prep, recording, and publishing state, not the other way around.

## Truth Boundary

- Human production truth wins for recording and OneNote prep status.
- Repo truth wins for what has been normalized into Markdown, the living manuscript, arrangements, and public website content.
- The OneNote app/workspace is not directly visible to Codex in this repo session. Checked-in `_inbox` exports are visible; any claim about OneNote beyond those files is human-provided production reality.
- Episode 4-6 prep may be ahead of the repo. Treat repo intake files as partial representations until they are reconciled against OneNote.
- Post-Episode-6 splits are low-confidence and should not be treated as final architecture.

## Latest OneNote Intake Status

The six expected raw OneNote episode files now exist under `apps/web/content/_inbox/` and are tracked by Git:

- `Episode 1 - Preface.md`
- `Episode 2 - Introduction.md`
- `Episode 3 - Chapter 0.md`
- `Episode 4.1 and 4.2 - Chapter 1.md`
- `Episode 5 - Chapter 2.md`
- `Episode 6 - Chapter 2 Continued.md`

Episode 5 and Episode 6 have now been classified into structured intake files under `apps/web/content/books/learning-to-lead/episode-breakdowns/`.

This does not mean the living manuscript has been normalized. It means the raw OneNote material has been separated into likely Homer baseline, Charlie material, research/field notes, clip candidates, production notes, and unresolved decisions.

## Status Types

- Recording status: whether the episode has been recorded or is planned for recording.
- Prep status: whether the episode has enough show-prep shape to support recording.
- OneNote status: whether real production notes may exist outside the repo.
- Repo intake status: whether a Markdown intake/breakdown file exists in the repo.
- Living manuscript status: whether the material has been normalized into `learning-to-lead.living.mdx`.
- Arrangement status: whether a book or podcast arrangement references the relevant blocks.
- Public publish status: whether public website episode/publish content reflects the episode.

## Episode Table

| Episode | Working title | Recording status | Prep status | OneNote status | Repo intake status | Living manuscript status | Arrangement status | Public publish status | Confidence | Next action |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | Write It Down | Recorded | Complete enough to publish | Raw OneNote file exists and is relatively clean | Represented by existing public/packet material and living-manuscript block | `homer-preface-write-it-down` exists | `book-v1.yml` and `podcast-season-1.yml` reference the block | Published in current public episode set per season map | High | Later boundary audit only; do not disturb while Episodes 5-6 need intake work. |
| 2 | Look for Lessons / It's a Metaphor | Recorded | Complete enough to publish | Raw OneNote file exists with checklist artifacts | Represented by existing public/packet material and living-manuscript block | `homer-introduction-look-for-lessons` exists | `book-v1.yml` and `podcast-season-1.yml` reference the block | Published in current public episode set per season map | Medium-high | Later reconcile public title history and remove checklist artifacts before normalization. |
| 3 | Know Where You Came From / Chub and Jack | Recorded | Complete enough to publish | Raw OneNote file exists with duplicate/alternate draft material | Represented by existing public/packet material and living-manuscript block | `homer-chapter-zero-in-the-beginning` exists | `book-v1.yml` and `podcast-season-1.yml` reference the block | Published in current public episode set per season map | Medium | Later resolve duplicate/alternate-draft handling before normalization. |
| 4 | The Early Days | Recorded | Prepped; Episode 4 work continued while the repo system was being built | Raw OneNote file exists and should be compared against incorporation | `episode-04-early-days.md` exists | Incorporated into Chapter One as split Homer blocks plus eight draft Charlie blocks | `podcast-season-1.yml` has an `early-life-lessons` candidate sequence; `book-v1.yml` includes the Homer Chapter One baseline only | Not verified as public-published in this pass | Medium-high | Review Episode 4 OneNote/recording against repo intake and living-manuscript blocks to catch missing cues. |
| 5 | The Values Toolkit | Recorded | Prepped enough to record; actual prep now represented in raw inbox file | Raw OneNote file exists and has been classified into structured intake | `episode-05-values-toolkit.md` updated as structured intake | Chapter Two Homer baseline blocks exist, but Episode 5 Charlie inline/research/clip material is not normalized | `podcast-season-1.yml` has a broad `values` candidate, not a final Episode 5 arrangement | Not public-published in repo truth verified here | Medium-high | If the classification is approved, run an Episode 5 living-manuscript normalization pass. |
| 6 | Trust Through Consistency | Planned for recording on 2026-05-08 | Prepped for recording | Raw OneNote file exists and has been classified into structured intake | `episode-06-trust-through-consistency.md` updated as structured intake | Not normalized into the living manuscript | No distinct Episode 6 arrangement is represented; current `values` candidate likely overlaps | Not public-published in repo truth verified here | Medium until recording review | Review after recording before final normalization, unless the current prep is confirmed stable. |

## Post-Episode-6 Warning

Any episode splits after Episode 6 should be treated as low-confidence placeholders. Do not optimize viewer code, manuscript structure, or arrangement strategy around those splits until the real production map is rebuilt from the actual book/episode plan.

## Next Action

Review the Episode 5 structured intake with Homer/Charlie, then run a narrow Episode 5 living-manuscript normalization pass if the classification is accepted. Keep Episode 6 classified but pending post-recording review.
