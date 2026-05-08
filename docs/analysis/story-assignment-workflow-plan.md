# Story Assignment Workflow Plan

## Purpose

This plan designs the next workflow after Live Story Drafts: deciding where stories begin, where they end, and which episode they belong in.

Do not implement a new Prisma model in this pass.

## Current Boundary

Story Candidate boundaries currently live in:

```text
apps/web/content/books/learning-to-lead/episode-production/virtual-splits.yml
```

Real episode membership for real blocks lives in:

```text
apps/web/content/books/learning-to-lead/arrangements/podcast-season-1.yml
```

Live Story Drafts are writing state. They save words, notes, support ideas, and review status in the database. They do not move stories between episodes, split manuscript prose, update arrangements, or change public pages.

The app needs a future Story Assignment decision layer so moving story units stays distinct from writing draft prose.

## Product Model

The book remains the source. Story Candidates are planning cards. Live Story Drafts are where words go. Story Assignment decisions are where placement judgment goes.

That separation matters because Homer and Chuck need to answer two different questions:

- What should this story say?
- Where should this story live?

Live Story Drafts answer the first question. Story Assignment should answer the second.

## Future Concept

A future `StoryAssignmentDecision` or equivalent model could persist review decisions before they are promoted back into files.

Proposed fields:

- `storyCandidateId`
- `sourceBlockId`
- `currentEpisodeKey`
- `proposedEpisodeKey`
- `boundaryDecision`
- `episodeRole`
- `supportNeed`
- `reviewNote`
- `reviewerUserId`
- `reviewedAt`
- `status`

## Boundary Decision Values

`proposed`

The reviewer thinks this candidate should move or become a formal assignment, but it has not been approved.

`approved`

The story placement decision is ready to be promoted into the planning/canonical layer.

`needs-split`

The source block or Story Candidate is too large and needs a future manuscript split before it can be cleanly assigned.

`merge-with-previous`

This candidate should travel with the prior candidate instead of standing alone.

`merge-with-next`

This candidate should travel with the next candidate instead of standing alone.

`park`

Keep the candidate available, but do not place it in the current episode plan.

`reject`

Do not use this candidate for the current book/episode workflow.

## Episode Role Values

`opener`

The story starts the episode or sets the frame.

`middle`

The story belongs in the main body.

`closer`

The story lands the episode.

`handoff`

The story bridges into the next beat or next episode.

`source-bin`

The material is source context, not yet a finished story unit.

`undecided`

The role is not clear yet.

## Support Need Values

`none`

No extra support layer is needed right now.

`charlie-reflection`

Chuck should add a reflective response or personal bridge.

`research-bridge`

The story needs context, source review, or a factual bridge.

`clip-reference`

The story may need a pop-culture clip, media reference, or rights-aware cue.

`discussion`

The story should become a conversation beat in the podcast.

`source-review`

The source text, memory, or provenance needs review before placement is trusted.

## Later Promotion Path

When assignment decisions are approved, a controlled pass can promote them into the file-backed planning and production layers.

Approved boundary decisions could update:

- `virtual-splits.yml` when a Story Candidate boundary changes but remains planning-only
- future real `ManuscriptBlock` splits when the canonical manuscript needs smaller source units
- `podcast-season-1.yml` when approved real blocks line up for recording

Promotion should stay explicit. The app should not silently rewrite these files from ordinary draft saves.

## Suggested Workflow

1. Review Story Candidates in Story Map.
2. Write or update Live Story Drafts only where words need to be developed.
3. Capture assignment decisions separately when the question is placement, boundary, episode role, or support need.
4. Approve assignment decisions with reviewer metadata.
5. Run a later Codex/manual promotion pass that updates planning files, real manuscript blocks, or arrangement YAML as appropriate.
6. Validate canonical safety after every promotion pass.

## Phase 1 Boundary

This pass should not change Prisma for Story Assignment.

Live Story Draft hardening can improve writing safety, UI clarity, and documentation. It should not create assignment persistence, move episode membership, split manuscript prose, or change production arrangements.
