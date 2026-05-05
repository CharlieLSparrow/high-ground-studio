# Chapter One Episode Four Incorporation Result

Date: 2026-05-05

## Parent Block Split

- split parent block: `homer-chapter-one-early-days`

## New Homer Block IDs

- `homer-early-days-preschool-memories`
- `homer-early-days-first-grade-name-calling`
- `homer-early-days-second-grade-quiet-time`
- `homer-early-days-third-grade-busy-work`
- `homer-early-days-seventh-grade-keyboarding`
- `homer-early-days-farm-years`

## New Charlie Block IDs

- `charlie-early-days-effort-and-joy-sidebar`
- `charlie-early-days-psychological-safety-sidebar`
- `charlie-early-days-incentives-sidebar`
- `charlie-early-days-autonomy-and-purpose-sidebar`
- `charlie-early-days-start-with-why-sidebar`
- `charlie-early-days-meaning-and-endurance-sidebar`
- `charlie-early-days-listening-culture-sidebar`
- `charlie-early-days-warmth-and-attention-close`

## Homer Source Preservation

- Homer source text from the original `homer-chapter-one-early-days` block was preserved exactly across the new Homer child blocks.
- This pass changed structure and metadata only on the Homer side.
- The separator line before the Farm Years material was preserved inside `homer-early-days-farm-years`.

## Intake Material Incorporated

From `apps/web/content/books/learning-to-lead/episode-breakdowns/episode-04-early-days.md`:

- Charlie sidebar draft material for:
  - effort and joy
  - psychological safety
  - incentives
  - autonomy and purpose
  - start with why / commander’s intent
  - meaning and endurance
  - listening culture
  - awkwardness, warmth, and attention close
- Episode 4 editorial sequencing signal for how Chapter One currently behaves as a podcast episode rather than only a coarse book chapter.

## What Was Intentionally Not Incorporated

- no Homer prose was replaced by the Episode 4 intake wording
- no Charlie prose was merged into Homer baseline blocks
- the Episode 4 intake file itself was not rewritten
- no Episode 5 or Episode 6 intake material was touched
- no public publish files were modified
- no episode packet files were modified
- no arrangement generation logic was added

## Pillow Incident Cross-Arrangement Note

- The Pillow Incident Homer source still lives in `homer-values-simple-solutions` under Chapter Two values material.
- This pass did not duplicate that Homer prose into Chapter One.
- The Episode 4 podcast arrangement now references `homer-values-simple-solutions` directly instead.
- `charlie-early-days-listening-culture-sidebar` was added as Episode 4 draft material and explicitly notes that its Homer counterpart still lives in Chapter Two.

## Arrangement Files Updated

- `apps/web/content/books/learning-to-lead/arrangements/book-v1.yml`
  - replaced the coarse Chapter One parent block with the new Homer child sequence
  - kept Charlie blocks out because `book-v1.yml` is still the baseline-oriented book arrangement
- `apps/web/content/books/learning-to-lead/arrangements/podcast-season-1.yml`
  - updated the Episode 4 candidate entry to use the new Homer child sequence
  - inserted the Charlie Episode 4 sidebars in order
  - referenced `homer-values-simple-solutions` for the Pillow Incident rather than copying source prose
- `apps/web/content/books/learning-to-lead/arrangements/public-site.yml`
  - unchanged because it did not reference the old Chapter One parent block

## Validation Performed

- confirmed `homer-chapter-one-early-days` no longer appears as a `ManuscriptBlock` id
- confirmed all new block IDs are unique
- confirmed arrangement references point to existing block IDs
- confirmed the concatenated new Homer child block bodies exactly match the original Chapter One parent body from the previous manuscript revision
- confirmed the living manuscript parser still works
- ran `pnpm --filter web build`
- confirmed no publish files or episode packet files were modified

## Known Limitations

- Charlie Episode 4 blocks are draft intake incorporations, not citation-verified final prose
- the Episode 4 podcast arrangement still uses the existing internal key `early-life-lessons` while the working title now reflects `The Early Days`
- the Pillow Incident remains structurally cross-chapter in source terms and may warrant a later arrangement or block-boundary review
- `book-v1.yml` remains baseline-oriented and does not yet reflect a full co-authored Charlie-integrated book structure

## Recommended Next Action

Choose one of these two clean follow-ups:

1. split `homer-values-simple-solutions` and the surrounding Chapter Two values material so the Pillow Incident can be arranged more precisely across Episodes 4-6
2. incorporate Episode 5 intake into the living manuscript using the same pattern: preserve Homer baseline, add Charlie blocks separately, and update podcast arrangement without duplicating source prose
