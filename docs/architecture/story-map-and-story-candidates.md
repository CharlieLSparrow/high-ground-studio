# Story Map And Story Candidates

## Purpose

The Story Map gives Homer and Chuck an internal way to see the book broken into reviewable story planning cards before anyone edits the manuscript.

It exists because the book is the thing. Episode prep, Charlie support, clips, research, and public pages should orbit Homer's source text instead of replacing it.

## Book-First Principle

Homer wrote the book. The first question is not "what does the content engine want?" The first question is "what story is Homer telling here?"

The Story Map starts from Homer manuscript blocks, identifies possible Story Candidates inside those blocks, and helps decide which pieces should later become real manuscript units or episode sections.

## Definition: Story Candidate

A Story Candidate is a proposed story, lesson, scene, or source bin inside an existing Homer manuscript block.

It is useful for planning because:

- chapters are too large to move around quickly
- paragraphs are too small to carry a complete episode idea
- episodes need story-sized pieces with a beginning, role, and possible handoff

A Story Candidate is not canonical until promoted into a real `ManuscriptBlock`.

## What Each Layer Means

### Real `ManuscriptBlock`

Canonical living-manuscript unit in `learning-to-lead.living.mdx`.

This is source truth for book/story/episode views. Arrangement YAML may reference these IDs.

### Virtual / Story Candidate

Non-canonical planning card stored in the current file-backed planning layer.

Current path:

- `apps/web/content/books/learning-to-lead/episode-production/virtual-splits.yml`

These IDs are not real block IDs and must not be used in arrangement YAML.

### Episode Arrangement

Arrangement YAML points to real manuscript block IDs and controls read-only episode sequences.

Current path:

- `apps/web/content/books/learning-to-lead/arrangements/podcast-season-1.yml`

### Production State

Production state tracks lifecycle, draft selections, warnings, source references, and unresolved decisions.

Current path:

- `apps/web/content/books/learning-to-lead/episode-production/season-one.yml`

### Public Publish Truth

Public publish files and public episode pages are downstream. Story Candidates do not publish directly.

## Why Story Candidates Matter

Story Candidates help decide:

- where an episode should start
- where an episode should end
- which story beats belong together
- which fragments should be parked
- where Charlie support might fit
- whether a chapter is one episode or more than one
- what should become a real child `ManuscriptBlock`

They let Chuck and Homer discuss story shape before Codex touches canonical manuscript prose.

## Rules

- Story Candidates are planning-only until promoted into manuscript blocks.
- Do not publish from Story Candidates.
- Do not use Story Candidate IDs in arrangement YAML.
- Do not treat a Story Candidate summary as replacement prose.
- Homer/book text remains the backbone.
- Charlie support, research, clips, reactions, and discussion are layered after the Homer story unit is understood.
- If a Story Candidate is rough, sensitive, citation-dependent, or fragment-heavy, park it for human review.

## Current Story Map Behavior

The internal Learning to Lead viewer now includes a top-level `Story Map` view.

It shows:

- Story Candidates grouped by episode/chapter
- source block IDs
- source range summaries
- roles
- recommended placement
- split recommendations
- Charlie support opportunities
- notes
- planning-only labels
- Live Story Draft panels for database-backed draft writing
- copy helpers for story checklists, future story block stubs, and Homer review lists

It does not write files, split prose, change arrangements, or publish anything.

## Live Story Drafts Vs Story Assignment

Live Story Drafts are where words go.

They are saved writing in the app: draft prose, ordinary notes, Chuck support notes, and review status. They stay attached to a Story Candidate and Homer source block, but they do not move the story, split the source, or change the episode plan.

Story Assignment is where stories go.

A future assignment layer should capture boundary and placement decisions: which Story Candidate begins or ends a story, which episode it belongs in, what role it plays in that episode, and what support it needs. That layer is not implemented yet.

Episode arrangements are where approved real blocks line up for recording.

Arrangement YAML should continue to reference real `ManuscriptBlock` IDs, not Story Candidate IDs and not Story Draft database IDs.

## Recommended Next Action

Use Story Map for Episode 7 review with Homer, decide which Chapter Three candidates are real story units, then promote only the approved candidates in a later manuscript split pass.
