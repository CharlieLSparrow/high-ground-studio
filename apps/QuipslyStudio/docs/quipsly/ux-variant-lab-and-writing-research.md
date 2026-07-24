# Quipsly UX Variant Lab and Writing Tool Research

Date: 2026-06-28

## Product decision

We should test multiple Quipsly UX/UI approaches at the same time, but not by forking the product.

The right shape is:

- One domain model.
- One command/action layer.
- One fixture set for repeated proof tasks.
- Multiple presentation shells that can be switched at runtime.

This gives us the benefit of parallel design without creating multiple incompatible editors.

## Research signals

- NN/g recommends parallel design because starting with only one direction can trap teams in the wrong part of the design space. Multiple alternatives should then converge into a stronger unified direction.
- Material Design frames design tokens as reusable style decisions shared by design tools and code. Quipsly needs this so "nature-y Quipsly" is a system, not a paint job.
- Apple HIG patterns support sidebars for top-level collections, split views for navigation plus content, panels/inspectors for contextual controls, and segmented controls for view switching.
- Storybook's model of component development in isolation is useful for Quipsly's web surfaces. The native SwiftUI equivalent should be preview fixtures plus seeded scenario files.
- Notes competitors show a durable pattern: fast capture first, flexible tags second, linked/backlinked knowledge third, and filtered/smart views fourth.

## UI variants to test first

### 1. Forest Desk

Purpose: writing, thinking, and low-anxiety creative flow.

Feel: organic, warm, nature-y, calmer than Notion or a code editor.

Layout:

- Left: Nest outline and active writing spaces.
- Center: manuscript or note body.
- Right: collapsible Quipsly helper with source chips, related notes, draft ideas, and next gentle action.
- Bottom or popover: quick capture and tag tray.

Best for:

- Book writing.
- Articles.
- Personal notes.
- Reducing systems anxiety.

Risk:

- Could hide too much structure if we make it too serene.

### 2. Research Desk

Purpose: source-heavy reading, tagging, evidence, and idea extraction.

Feel: librarian workbench, not command center.

Layout:

- Left: source/document/library navigator.
- Center: source or manuscript.
- Right: notes, highlights, tags, backlinks, output intents.
- Optional lower rail: selected evidence, citations, and "turn this into" actions.

Best for:

- Study documents.
- Research packets.
- Book/source analysis.
- Marine biology/photo research notes.

Risk:

- Can become visually dense and anxiety-inducing if everything is visible by default.

### 3. Story Card Wall

Purpose: turn raw notes into publishable outputs.

Feel: index cards on a table, with visible paths to article/post/video/book/podcast.

Layout:

- Board columns by output intent or story stage.
- Cards are ideas, anecdotes, quotes, examples, clips, source claims, draft sections.
- Detail pane opens selected card without leaving the board.

Best for:

- Social content planning.
- Turning podcast moments into shorts/articles.
- Story collection.
- Coaching exercises.

Risk:

- It must remain connected to real documents, not become a second truth.

## How to keep variants maintainable

Quipsly should introduce a variant lab boundary:

```text
QuipslyWritingCore
  Document / Block / Note / Annotation / Tag / Source / OutputIntent / DraftPacket

QuipslyWritingCommands
  captureIdea()
  applyTag()
  createDraft()
  linkSource()
  makeOutputIntent()
  promoteBlockToArticle()
  createResearchPacket()

QuipslyWritingViews
  ForestDeskView
  ResearchDeskView
  StoryCardWallView
```

Rules:

- Views may choose different layouts.
- Views may not invent separate truth.
- All changes go through commands.
- All variants must run the same proof tasks.
- A variant can be ugly or experimental, but the data it writes must be production-safe.

## Proof tasks for every writing UI

Every UI variant must prove these tasks:

1. Capture a raw idea in under 10 seconds.
2. Tag the idea as article, post, video, podcast, book, or research.
3. Link the idea to a source or existing note.
4. Find related notes without needing exact memory.
5. Create a draft packet without replacing the canonical manuscript.
6. Promote a block/card into an output plan.
7. Undo or inspect what changed.
8. Export a human-readable recovery packet.

## Tagging and output-intent model

Do not rely on freeform hashtags alone. Quipsly needs tags plus structured output intent.

Recommended initial primitives:

- `topic`
- `person`
- `place`
- `source`
- `claim`
- `evidence`
- `quote`
- `story`
- `example`
- `question`
- `metaphor`
- `clip-cue`
- `article-candidate`
- `post-candidate`
- `video-candidate`
- `short-candidate`
- `podcast-candidate`
- `book-candidate`
- `course-candidate`
- `needs-source`
- `needs-human-voice`
- `draft-ready`
- `publish-ready`

The important distinction:

- Tags describe what something is.
- Output intents describe what it could become.
- Draft packets describe an attempted output without becoming canonical truth.

## Writing document truth model

For living books/articles, the safest shape is:

- Canonical living document: the current authoring truth.
- Draft packet: an experiment, alternate pass, rewrite, outline, article extraction, or social adaptation.
- Note/source layer: raw input, highlights, annotations, and evidence.
- Change ledger: what Quipsly or a human did, inspectable and reversible.

This avoids the old failure mode where "one document" became so sacred that notes, drafts, and experiments had nowhere honest to live.

## Near-term build recommendation

Build this order:

1. Add a lightweight variant switcher in the writing/Nest surface.
2. Implement Forest Desk and Research Desk over the same loaded document state.
3. Add output-intent tags to the existing tag tray.
4. Add a Story Seeds board that reads the same blocks/notes and filters by output intent.
5. Add proof fixtures and an agent-accessible command surface.
6. Only then make it beautiful.

## Photo Grove tie-in

Photo Grove should follow the same pattern:

- One source/photo truth.
- Multiple review views.
- All decisions written as metadata/sidecar/ledger.
- No original mutation.

The source integrity packet added on 2026-06-28 is part of that shared philosophy: before culling or exporting, prove what exists and what is safe.

## References

- NN/g: https://www.nngroup.com/articles/parallel-and-iterative-design/
- Stanford HCI/AAA Lab: https://aaalab.stanford.edu/assets/papers/2010/Parallel_Prototyping_leads_to_better_design_results.pdf
- Material Design 3 tokens: https://m3.material.io/foundations/design-tokens
- Apple HIG: https://developer.apple.com/design/human-interface-guidelines
- Apple HIG panels: https://developer.apple.com/design/human-interface-guidelines/panels
- Storybook docs: https://storybook.js.org/docs
- Obsidian tags: https://obsidian.md/help/tags
- Obsidian Canvas: https://obsidian.md/help/plugins/canvas
- Notion database views and filters: https://www.notion.com/help/views-filters-and-sorts
- Notion database properties: https://www.notion.com/help/database-properties
- Bear FAQ: https://bear.app/faq/
- Apple Notes tags and Smart Folders: https://support.apple.com/en-us/102288
