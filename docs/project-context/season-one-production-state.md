# Season One Production State

Last updated: 2026-05-07

## Purpose

This doc reconciles real Season One production status against what the repo currently represents.

It exists because book writing and podcast episode prep are the highest-priority lane. The content engine should follow the actual writing, prep, recording, and publishing state, not the other way around.

## Truth Boundary

- Human production truth wins for recording and OneNote prep status.
- Repo truth wins for what has been normalized into Markdown, the living manuscript, arrangements, and public website content.
- OneNote is not directly visible to Codex in this repo session, so any OneNote statement here is based on human-provided production reality.
- Episode 4-6 prep may be ahead of the repo. Treat repo intake files as partial representations until they are reconciled against OneNote.
- Post-Episode-6 splits are low-confidence and should not be treated as final architecture.

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
| 1 | Write It Down | Recorded | Complete enough to publish | Not audited in this pass | Represented by existing public/packet material and living-manuscript block | `homer-preface-write-it-down` exists | `book-v1.yml` and `podcast-season-1.yml` reference the block | Published in current public episode set per season map | High | Later boundary audit only; do not disturb while Episodes 5-6 need intake work. |
| 2 | Look for Lessons / It's a Metaphor | Recorded | Complete enough to publish | Not audited in this pass | Represented by existing public/packet material and living-manuscript block | `homer-introduction-look-for-lessons` exists | `book-v1.yml` and `podcast-season-1.yml` reference the block | Published in current public episode set per season map | High | Later reconcile public title history against long-term arrangement intent. |
| 3 | Know Where You Came From / Chub and Jack | Recorded | Complete enough to publish | Not audited in this pass | Represented by existing public/packet material and living-manuscript block | `homer-chapter-zero-in-the-beginning` exists | `book-v1.yml` and `podcast-season-1.yml` reference the block | Published in current public episode set per season map | High | Later map packet/public sections to final living-manuscript arrangement intent. |
| 4 | The Early Days | Recorded | Prepped; Episode 4 work continued while the repo system was being built | OneNote may contain refinements not fully represented in repo | `episode-04-early-days.md` exists | Incorporated into Chapter One as split Homer blocks plus eight draft Charlie blocks | `podcast-season-1.yml` has an `early-life-lessons` candidate sequence; `book-v1.yml` includes the Homer Chapter One baseline only | Not verified as public-published in this pass | Medium-high | Review Episode 4 OneNote/recording against repo intake and living-manuscript blocks to catch missing cues. |
| 5 | The Values Toolkit | Recorded | Prepped enough to record; actual prep may be ahead of repo | OneNote may be ahead of repo intake | `episode-05-values-toolkit.md` exists | Chapter Two Homer baseline blocks exist, but Episode 5 Charlie inline/research/clip material is not normalized | `podcast-season-1.yml` has a broad `values` candidate, not a final Episode 5 arrangement | Not public-published in repo truth verified here | Medium | Reconcile OneNote against the repo intake, then normalize Episode 5 into reusable manuscript and podcast-prep blocks. |
| 6 | Trust Through Consistency | Planned for recording on 2026-05-08 | Prepped for recording | OneNote is likely the freshest prep source | `episode-06-trust-through-consistency.md` exists | Not normalized into the living manuscript | No distinct Episode 6 arrangement is represented; current `values` candidate likely overlaps | Not public-published in repo truth verified here | Medium-low until recording and OneNote sync | After recording, compare OneNote to repo intake and decide whether Episode 6 is a clean second values/trust episode or a rebuilt cross-chapter trust episode. |

## Post-Episode-6 Warning

Any episode splits after Episode 6 should be treated as low-confidence placeholders. Do not optimize viewer code, manuscript structure, or arrangement strategy around those splits until the real production map is rebuilt from the actual book/episode plan.

## Next Action

Run an Episode 5-6 OneNote reconciliation pass. Start with Episode 5 because it is already recorded, compare OneNote prep against `episode-05-values-toolkit.md`, then decide which material belongs in the clean book manuscript, podcast prep, Charlie sidebars, clip candidates, or production notes.
