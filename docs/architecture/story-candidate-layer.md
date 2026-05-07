# Story Candidate Layer

## Purpose

The Story Candidate layer is a non-canonical planning layer between Homer's large manuscript chapters and the episode arrangements Chuck tests in the Episode Playground.

The need is practical:

- Chapters are too large for fast episode arranging.
- Paragraphs are too small and brittle for meaningful story planning.
- Story Candidates are the natural movable unit for shaping episodes before canonical manuscript edits.

This layer helps the team ask, "What story unit are we actually moving?" before splitting `ManuscriptBlock` prose or changing arrangement YAML.

## Definition

A Story Candidate is a proposed story or lesson unit inside an existing Homer manuscript block.

It may be:

- a scene
- a leadership lesson
- a story beat
- a rough source bin that needs human review
- a possible bridge between two future episode sections

A Story Candidate is not yet a real `ManuscriptBlock`. It is planning state only.

## Relationship To Existing Layers

### Homer Manuscript Blocks

Homer's manuscript blocks remain canonical source text. Story Candidates point back to those blocks by `sourceBlockId`.

The book text remains the backbone. Story Candidates do not replace it.

### Charlie Support Layers

Charlie material should be layered after Homer story units are understood. A Story Candidate may note where Charlie reflection, research, humor, or context might belong, but it does not promote that support into manuscript truth.

### Podcast Episodes

Episodes are built by arranging real manuscript blocks and, later, promoted story units. Story Candidates help plan the split before the episode gets committed.

### Playground

Playground can show Story Candidates as planning cards alongside real block-based Candidate Pool and Playground Sequence cards.

Important boundary: Story Candidates cannot be inserted into arrangement YAML as if they were real block IDs.

### Future Manuscript Splitting

When a Story Candidate is approved, a later manuscript split pass may promote it into one or more real `ManuscriptBlock` entries.

Promotion should preserve Homer source wording and keep Charlie support separate unless explicitly approved.

## Lifecycle

- `proposed`: A possible story unit has been identified.
- `reviewed`: Homer/Chuck/Charlie have looked at it in context.
- `approved for split`: The team agrees it should become a canonical child block.
- `promoted to ManuscriptBlock`: The story unit now exists in `learning-to-lead.living.mdx`.
- `arranged into episode`: A real arrangement references the promoted block ID.
- `parked`: The unit is useful context but should not be split or arranged yet.

The current file-backed planning state uses statuses like `story-candidate-plan` and `story-candidate-scout`. Those are lightweight operating labels, not a full workflow engine.

## Rules

- Story Candidates are not canonical until promoted into `ManuscriptBlock` entries.
- Do not publish from Story Candidates.
- Do not use Story Candidate IDs in arrangement YAML.
- Arrange real blocks in Playground; use Story Candidates to plan splits.
- Keep Story Candidate summaries short. Do not copy large manuscript prose into planning files.
- Preserve Homer source wording when a Story Candidate is later promoted.
- Keep Charlie support, research, clips, and production notes separate from Homer baseline prose.
- If a Story Candidate contains rough fragments, mark it for human review instead of treating it as ready.
- The book is the thing. Story Candidates exist to make the book easier to shape into episodes.

## Current Implementation

The current implementation keeps the original `virtual-splits.yml` file name and parser names to avoid unnecessary churn, but the product language is Story Candidate.

Current path:

- `apps/web/content/books/learning-to-lead/episode-production/virtual-splits.yml`

Current UI:

- Episode Playground shows Story Candidate planning cards when an episode has entries in the file.
- Real Candidate Pool and Playground Sequence cards still use canonical `ManuscriptBlock` IDs.
- Copy helpers create checklists and future story block stubs only. They do not write files.

## Recommended Next Action

Use Episode 7 as the first reviewed Story Candidate set, decide which candidates should be promoted, then run a narrow manuscript split pass only for the approved story units.
