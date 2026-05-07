# Live Story Draft Workflow

## Purpose

This workflow explains how live Story Drafts should feel to Homer and Chuck.

The short version:

Homer can write in the app. Chuck can add support notes. The work is saved safely. It is not canonical manuscript truth until everyone decides to promote it.

## The Plain-English Model

The book remains the backbone.

Story Candidates are the planning cards that say, "this part of Homer's book might become a story-sized unit."

Story Drafts are the live saved writing attached to those cards.

A draft can be useful, messy, promising, or parked. It is not automatically part of the book, the podcast arrangement, or a public page.

## How It Should Work

1. Homer opens the internal Story Map.
2. He picks a Story Candidate.
3. He writes or revises a draft in the app.
4. The app saves the draft to the database.
5. Chuck can read it, add support notes, and mark what kind of review it needs.
6. When the draft is ready, the team approves it for promotion.
7. A separate manuscript pass turns the approved draft into a real `ManuscriptBlock`.

## Current App Behavior

The internal Learning to Lead Story Map can now show and save Live Story Drafts.

Current behavior:

- each Story Candidate card shows saved draft count and latest draft status
- the latest draft can be edited directly from Story Map
- an authorized user can also save the current form as a new draft
- saved drafts live in the database
- drafts are attached to Story Candidate IDs and source Homer block IDs
- copy-only promotion packets can be generated from saved drafts

Allowed editors in Phase 1:

- `OWNER`
- `TEAM_SCHEDULER`
- `COACH`

If Homer needs app writing access without broader team-console powers, the next access-control pass should decide whether to add a narrower contributor/editor role.

## What Homer Needs To Know

Writing in the app should be safe.

The draft is saved live, but it does not rewrite the manuscript file by itself. That means Homer can work without worrying that a rough sentence has accidentally become published or canonical.

## What Chuck Needs To Know

Chuck can use the draft as a support surface.

Good uses:

- add reflection notes
- identify where research might help
- mark a clip or reference idea as parked
- flag what needs Homer review
- prepare a future promotion packet

Bad uses:

- treat the draft as public copy
- publish from it directly
- paste citation-dependent claims into clean prose without review
- use draft IDs in arrangement YAML

## Draft Statuses

### Rough

Still being written.

### Needs Homer Review

Homer should check voice, memory, story truth, or comfort level.

### Needs Chuck Review

Chuck should shape the support layer, structure, or placement.

### Approved For Promotion

The draft can become source material for a future canonical manuscript edit.

### Promoted

The draft has already become a real manuscript block.

### Parked

Keep it saved, but do not use it right now.

## What Does Not Happen Automatically

- The living manuscript does not change.
- Episode arrangements do not change.
- Production YAML does not change.
- Public episode pages do not change.
- Drafts do not become live public pages.
- Research and clip notes do not become verified claims.

## OneNote's New Role

OneNote can remain a backup, capture space, or reference source.

But the primary writing home should become the app once Story Drafts exist. That keeps current writing, review status, and source context in one place instead of scattering the production truth across exported notes and memory.

## Promotion Rule

A draft becomes canonical only through a separate promotion pass.

That pass should:

- create or update real `ManuscriptBlock` entries
- preserve source provenance
- validate block IDs
- validate arrangement references
- create a session note
- commit the manuscript change intentionally

## Recommended First Habit

For each Story Candidate, write one small useful draft first.

Do not try to perfect the whole chapter in the first pass. The system is meant to make story-sized movement visible and safe.
