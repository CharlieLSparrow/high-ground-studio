# Tagged Source Projection Architecture

Date: 2026-05-21

## Core Principle

The final output is not the source. It is a projection of tagged source
material.

This applies across Studio writing, local AI video editing, studying and
certification tools, Quote Engine, QuipLore, Quipsly media creation, and
HighGroundOdyssey.com publishing.

The durable product model is:

1. Preserve source material.
2. Make spans addressable.
3. Attach semantic and actionable tags.
4. Keep decision layers editable and branchable.
5. Render outputs as projections.
6. Keep rollback sacred.
7. Avoid destructive editing wherever possible.

## Why This Matters

High Ground work is not only content production. It is interpretation,
selection, sequencing, review, handoff, and projection.

A podcast episode page, study guide, video cut, quote card, lore entry, or
social clip should not become the place where the source truth lives. It should
be a rendered view of source material plus decisions.

That distinction keeps future work reversible. It lets Charlie and future tools
ask better questions:

- Which source span produced this output?
- Which tags justified this inclusion?
- Which decision layer selected this order?
- Which projection rendered this form?
- What would happen if we rolled back this decision?

## Shared Vocabulary

### Source Material

The preserved original or canonical input.

Examples:

- imported manuscript text
- interview transcript
- raw camera footage
- audio recordings
- textbook chapters
- certification objectives
- source documents
- citation records
- image/video assets
- approved Studio export packets

Source material should be kept as intact as practical. Cleanup may create a new
source version, but it should not erase the earlier source without an explicit
archive and rollback path.

### Source Unit

A stable container inside source material.

Examples:

- manuscript block
- paragraph
- chapter
- transcript segment
- video file
- audio file
- timecoded clip
- study objective
- quote source
- lore source record

Source units are useful because spans need anchors.

### Span

An addressable range inside a source unit.

Examples:

- character offsets in a manuscript block
- block ranges in Manuscript Desk
- transcript word ranges
- video timecode ranges
- audio timecode ranges
- page and paragraph references
- bounding boxes or frame ranges for visual material

Spans let the system say "this exact thing" without copying it into a final
output as the only durable record.

### Tag

Semantic and actionable metadata attached to a span or source unit.

Tags should mean something a renderer, reviewer, or workflow can use.

Examples:

- `author:charlie`
- `author:homer`
- `semantic:story`
- `semantic:insight`
- `quote:cited`
- `quote-review:needs-source`
- `quote-review:verified`
- `structure:episode`
- `structure:chapter`
- `video:camera-a-best`
- `video:bad-audio`
- `study:exam-objective`
- `study:weak-area`
- `projection:public-safe`
- `projection:staged`
- `rights:do-not-use`

Tags are not decoration. If a tag cannot affect search, review, generation,
projection, safety, or handoff, it may be a label rather than a system tag.

### Decision Layer

An editable layer that chooses how source and tags become an output.

Examples:

- episode structure region ordering
- publishing packet selection
- recording handoff sequence
- multicam edit decision list
- study plan
- flashcard deck selection
- Quote Engine collection
- QuipLore page outline
- HGO projection manifest
- Quipsly clip package

Decision layers should be branchable. A new cut, page, study path, or export
should not require destroying the old one.

### Projection

A rendered output produced from source material, spans, tags, and decision
layers.

Examples:

- HGO public episode page
- staged Homer preview page
- podcast video edit
- social clip
- quote card
- study guide
- flashcard set
- QuipLore entry
- publishing packet Markdown
- recording handoff packet

Projection output is useful and may be published, but it is not the source of
truth.

### Renderer

The code, tool, or workflow that turns a decision layer into a projection.

Examples:

- HGO projection page renderer
- Markdown export generator
- video timeline renderer
- transcript viewer
- study deck generator
- quote card generator
- QuipLore page builder

### Branch

A named alternate decision layer over the same source material.

Examples:

- "Homer recording pass"
- "public-safe page"
- "short social cut"
- "exam-week cram deck"
- "book-only chapter projection"
- "episode-only projection"

Branches are cheap if the source is preserved and decisions are layered.

### Rollback

The ability to return to a known prior source version, tag set, decision layer,
or projection manifest.

Rollback is sacred because these workflows involve real editorial judgment,
source risk, and human trust.

## Invariants

These should hold across systems.

### 1. Source Is Preserved

Original source should not be rewritten merely because a projection needs a
different shape.

If a cleaned transcript, normalized manuscript, or proxy media file is needed,
it should be represented as a derived source version with lineage back to the
original.

### 2. Spans Are Addressable

Every meaningful decision should be traceable to a span or source unit.

Bad:

- "This quote came from somewhere in the transcript."

Better:

- "This quote came from transcript segment 14, words 86-112, source version
  `interview-clean-v2`."

### 3. Tags Are Semantic And Actionable

Tags should drive behavior:

- filtering
- review
- rendering
- export
- safety gates
- study prioritization
- edit selection
- rights/citation warnings

### 4. Decision Layers Are Editable And Branchable

Changing the output should usually change a decision layer, not the source.

The system should support multiple reasonable decisions over the same source:

- long episode and short episode
- public page and staged page
- book chapter and audio segment
- study deck and quick review sheet
- full video edit and social clip

### 5. Outputs Are Projections

A projection may be the thing the public sees. It is not where editorial truth
lives.

If a public page, video cut, or study guide is wrong, the correction should flow
back to tags, source versions, or decision layers as needed.

### 6. Rollback Is Sacred

Every serious workflow needs a way back:

- previous source version
- previous tag set
- previous decision layer
- previous projection manifest
- previous rendered output when needed for audit

Rollback should be designed before automation becomes aggressive.

### 7. Destructive Editing Is The Exception

Destructive edits are sometimes necessary, but they should be deliberate.

Default posture:

- mark, tag, branch, project
- do not overwrite, flatten, or erase

## Domain Applications

## Manuscript Desk

Studio Manuscript Desk already follows this architecture.

Source material:

- imported manuscript
- browser-local manuscript draft
- server snapshot JSON

Addressable spans:

- manuscript blocks
- inline author mark ranges
- semantic highlight ranges
- cited quotation ranges
- structure region block ranges

Tags:

- Charlie author marks
- Homer / Scott author marks
- semantic tags
- cited quotation marks
- quote review statuses
- chapter, episode, and section regions

Decision layers:

- structure cleanup
- quote review choices
- recording handoff organization
- publishing packet export choices
- future public projection manifest

Projections:

- publishing packet Markdown
- recording handoff Markdown
- quote appendix
- author contribution export
- future HGO page projection

Architecture consequence:

Manuscript Desk should not become a generic rich-text editor whose saved HTML is
the truth. Its advantage is the tagged source model layered over the long
manuscript.

## Local Multicam Podcast Video Editor

The local video editor should not become a Premiere clone.

Premiere is optimized around a timeline as the working object. The High Ground
video editor should be optimized around tagged source material and projection
decisions.

Source material:

- raw camera files
- raw audio files
- generated proxies
- transcripts
- timecode alignment records
- scene or segment notes

Addressable spans:

- timecode ranges
- speaker turns
- transcript word ranges
- camera angle ranges
- audio problem ranges
- visual moment ranges

Tags:

- best camera angle
- bad framing
- audio issue
- strong quote
- laugh
- pause
- cutaway candidate
- source/citation risk
- social clip candidate
- chapter marker

Decision layers:

- full episode cut
- Homer review cut
- Charlie notes cut
- short social edit
- quote-card video edit
- sponsor-free cut
- rough assembly

Projections:

- rendered episode video
- review screener
- shorts/reels clips
- audiogram
- transcript-backed edit notes
- HGO video embed package

Why not a Premiere clone:

- The point is not to recreate every timeline operation.
- The point is to let AI and human editors tag source spans, compare branches,
  and render repeatable cuts.
- A timeline can exist as one projection of decisions, but it should not be the
  only place the edit truth lives.

## Study And Certification Tools

Study tools should preserve the learning source and project multiple study
views.

Source material:

- official exam objective lists
- textbooks
- notes
- class slides
- practice questions
- transcripts from lectures
- user mistake history

Addressable spans:

- objective IDs
- paragraphs
- question stems
- answer rationales
- timestamped lecture sections
- user answer attempts

Tags:

- mastered
- weak area
- review soon
- high-confidence
- guessed
- exam objective
- prerequisite
- recurring mistake
- practical lab required

Decision layers:

- daily study plan
- cram path
- spaced repetition schedule
- certification readiness report
- weak-area drill set
- flashcard deck

Projections:

- study guide
- quiz
- flashcards
- review dashboard
- readiness checklist
- lab checklist

Architecture consequence:

A study deck is not the source. It is a projection from tagged source material,
exam objectives, and learner state.

## Quote Engine

Quote Engine should treat quotations as source-backed spans, not free-floating
snippets.

Source material:

- books
- transcripts
- interviews
- articles
- approved notes
- Studio manuscript spans

Addressable spans:

- exact quote text range
- source locator
- surrounding context
- citation record

Tags:

- theme
- speaker
- source type
- rights status
- verified
- needs source
- needs verification
- do not use
- public-safe

Decision layers:

- quote collections
- quote card selections
- episode quote appendix
- theme pages
- social post batch

Projections:

- quote cards
- quote appendix
- theme collections
- social posts
- HGO pull quote blocks

Architecture consequence:

Quote Engine should not let attractive quote cards become the only durable
record. The card is a projection. The source span and review state are the
truth.

## QuipLore

QuipLore should treat lore as structured interpretation over source, not as a
wiki where the final page silently becomes truth.

Source material:

- stories
- transcripts
- Studio manuscript regions
- quotes
- source notes
- historical references
- character/person/entity records

Addressable spans:

- story passages
- source paragraphs
- quote ranges
- transcript segments
- episode beat ranges

Tags:

- person
- place
- event
- theme
- claim
- source-backed
- disputed
- needs review
- public-safe
- internal-only

Decision layers:

- lore page outline
- entity relationship map
- public page selection
- internal research map
- series timeline

Projections:

- lore entry
- relationship graph
- timeline
- source appendix
- HGO companion page

Architecture consequence:

QuipLore should make provenance visible. It should not become an untraceable
summary layer that loses the difference between source, interpretation, and
public projection.

## Quipsly Media Creation

Quipsly media creation should generate assets from tagged source and explicit
creative decisions.

Source material:

- approved quotes
- audio clips
- video clips
- still images
- brand assets
- episode projections
- lore entries

Addressable spans:

- quote ranges
- audio timecodes
- video timecodes
- image regions
- page sections

Tags:

- short-form candidate
- safe for public
- needs citation
- emotional tone
- visual mood
- platform target
- rights-approved
- do-not-use

Decision layers:

- social campaign
- clip package
- visual style pass
- thumbnail set
- caption variants
- platform-specific crop choices

Projections:

- vertical video
- quote image
- carousel
- thumbnail
- caption set
- post package

Architecture consequence:

Generated media should remain connected to its source and review state. A
beautiful asset is still unsafe if it lost its citation or rights lineage.

## HighGroundOdyssey Public Projection Pages

HGO pages should be projections from Studio, not source editing surfaces.

Source material:

- Studio manuscript draft
- Studio structure regions
- quote review metadata
- recording handoff exports
- publishing packet exports
- future approved projection manifests

Addressable spans:

- manuscript block ranges
- chapter/episode regions
- cited quotation ranges
- author-marked spans
- semantic highlights

Tags:

- book-only
- episode-only
- book-and-episode
- public-safe
- staged
- live
- archived
- verified source
- needs review

Decision layers:

- HGO projection manifest
- staged Homer preview
- public episode page
- book/series map
- related chapter projection
- quote/source appendix projection

Projections:

- visual-heavy episode page
- staged work-in-progress page
- public book/series map
- pull quote section
- cited/source notes section
- related book chapter block

Why HGO adapts to Studio:

Studio owns the source workflow and metadata. HGO should render approved views
of that work. If HGO forces Studio to behave like the old page model, the
system loses the manuscript wall, structure regions, author marks, quote
review, and handoff context that make Studio valuable.

Old HGO episode pages are replaceable because they are projections, not sacred
source truth.

## Examples

### Example 1: A Manuscript Quote Becomes A Public Pull Quote

Source:

- manuscript block `block-143`

Span:

- character range containing the quotation

Tags:

- `quote:cited`
- `quote-review:verified`
- `semantic:insight`
- `projection:public-safe`

Decision layer:

- episode projection manifest selects the quote for the hero section

Projection:

- HGO pull quote card with citation/source note

Rollback:

- remove quote from projection manifest without deleting the manuscript span or
  quote review record

### Example 2: A Podcast Moment Becomes Three Outputs

Source:

- camera A, camera B, audio, and transcript for a recording session

Span:

- timecode `00:18:42-00:20:05`

Tags:

- `speaker:homer`
- `semantic:story`
- `video:camera-b-best`
- `audio:clean`
- `clip:social-candidate`

Decision layers:

- full episode cut includes the full span
- short social cut trims to the strongest 22 seconds
- HGO episode page uses a pull quote from the transcript

Projections:

- full video episode
- vertical social clip
- episode page quote card

Rollback:

- revise or remove the social cut without changing the raw camera/audio source

### Example 3: Study Material Becomes A Readiness Plan

Source:

- certification objective list and notes

Span:

- objective `3.2` plus three related note paragraphs

Tags:

- `study:weak-area`
- `study:review-soon`
- `study:lab-required`

Decision layer:

- exam-week readiness plan

Projection:

- daily study checklist and flashcard deck

Rollback:

- restore the prior study plan if the new schedule is too aggressive

## Anti-Patterns

### Final Output As Source

Bad:

- treat a rendered web page, video file, or quote card as the only truth

Why it fails:

- source context is lost
- quote review is lost
- rollback becomes manual
- future projections require rework

### Destructive Timeline Editing As The Only Record

Bad:

- cut raw media directly or keep all editorial decisions only inside a timeline
  file

Why it fails:

- hard to branch
- hard to generate alternate cuts
- hard for AI tools to reason over source spans
- difficult to trace why a moment was selected

### Tags As Decoration

Bad:

- add labels that never affect search, review, rendering, or safety

Why it fails:

- the system looks organized but cannot act

### Hidden AI Rewrite

Bad:

- let AI rewrite source material without preserving original source and
  decision lineage

Why it fails:

- provenance breaks
- review becomes harder
- trust collapses when output cannot be traced

### Flattened Export Loop

Bad:

- export Markdown/HTML/video, then re-import that final output as the new source

Why it fails:

- tags and spans become stale or disappear
- branch history is lost
- rollbacks are unclear

### HGO Dictates Studio

Bad:

- force Studio to produce the old HGO episode shape because the old page route
  already exists

Why it fails:

- the public page model becomes the ceiling for the private editorial system
- Studio's richer metadata gets flattened too early

### Video Editor Becomes A Premiere Clone

Bad:

- recreate a generic nonlinear editor and make the timeline the only meaningful
  state

Why it fails:

- High Ground loses its advantage: tagged source, semantic search, AI-assisted
  source understanding, branchable decision layers, and repeatable projections

## Future Architecture Implications

### 1. Build Source Registries

Each domain needs a way to register source material and source versions.

Minimum useful fields:

- source ID
- source type
- version
- created/imported time
- checksum or content hash when practical
- lineage to parent source when derived

### 2. Standardize Span Addresses Per Medium

Text, audio, video, image, and structured study material need different address
forms, but the concept should be shared.

Examples:

- text: block ID plus character offsets
- transcript: segment ID plus word offsets
- audio/video: file ID plus timecode range
- image: asset ID plus bounding box
- study objective: objective ID plus source reference

### 3. Keep Tag Schemas Explicit

Tags need definitions, allowed values, and workflow meaning.

Future systems should distinguish:

- semantic tags
- review/status tags
- rights/safety tags
- projection tags
- workflow tags
- audience/visibility tags

### 4. Separate Decision Layers From Source

Projection manifests, edit decision lists, study plans, and page outlines should
be stored separately from source material.

This supports:

- branching
- comparison
- review
- rollback
- multiple outputs from one source

### 5. Treat Renderers As Replaceable

A renderer is allowed to change.

The source, tags, and decision layers should outlive:

- a page component
- a video renderer
- a card template
- a study deck format
- a social platform size

### 6. Add Public-Safety Gates

Before anything becomes public, projection systems should be able to ask:

- Are all selected source spans public-safe?
- Are quotes verified?
- Are rights/citation statuses acceptable?
- Are internal notes filtered out?
- Is the projection status live, staged, synthetic, or archived?

### 7. Preserve Human Review

Automation can propose tags and projections. It should not silently replace
human editorial decisions where trust, attribution, or public release is
involved.

## Design Rules For New Work

When adding a feature, ask:

1. What is the source material?
2. How is the relevant span addressed?
3. What semantic or actionable tags are needed?
4. What decision layer selects or transforms it?
5. What projection is rendered?
6. How do we roll back the decision?
7. What should not be destroyed?

If those answers are unclear, the architecture is probably drifting toward a
flat output editor.

## Summary

Tagged Source Projection Architecture is the shared pattern:

- preserve source
- address spans
- tag meaningfully
- branch decisions
- project outputs
- protect rollback
- avoid destructive editing

This is the architecture that lets Studio, HGO, local video editing, study
tools, Quote Engine, QuipLore, and Quipsly remain connected without forcing
them into one giant app or one generic editor.
