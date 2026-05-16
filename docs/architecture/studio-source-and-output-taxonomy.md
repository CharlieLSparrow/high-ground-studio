# Studio Source And Output Taxonomy

Date: 2026-05-16

## Purpose

High Ground Studio is not only a book or podcast tool. It is a private
research, writing, tagging, structuring, and projection system for many forms of
source material and many forms of future work.

This taxonomy names the first broad categories without turning them into
database schema too early.

## Source Types

A source type is the format or origin of material brought into Studio for
study, tagging, extraction, writing support, or future projection.

Studio should eventually support these source types:

- books
- book chapters
- articles
- essays
- academic papers
- research studies
- podcast transcripts
- TED talks
- public talks
- speeches
- interviews
- standup specials
- sketches
- songs
- lyrics
- video transcripts
- original notes
- original drafts
- quote collections

Source type answers: "What kind of thing did this material come from?"

It should not answer what the material means, how it is structured, or where it
will be published.

## Output Types

An output type is the format Studio helps a human or agent write, revise,
prepare, rehearse, or project.

Studio should eventually help produce these output types:

- books
- book chapters
- podcast episodes
- show notes
- Quiplore quote entries
- articles
- essays
- newsletters
- TED-style talks
- public talks
- workshops
- lessons
- speeches
- songs
- sketches
- standup bits
- research memos
- dissertation sections
- agent-assisted drafts

Output type answers: "What are we trying to make?"

It should not imply that the output is public, approved, finished, or safe to
publish. Those are projection and review questions.

## Why Some Formats Are Both

Some formats are both source and output types because Studio must support two
different workflows:

1. Study existing examples.
2. Make our own version of that format.

Examples:

- a book can be a source for analysis and an output Studio helps write
- a podcast transcript can be source material and a podcast episode can be an
  output
- a song can be analyzed as source and later written as output
- a public talk can be studied as source and later prepared as output

The same label appearing in both lists does not mean the database should merge
those concepts. It means the Studio vocabulary must keep direction clear.

## TED Talks And Public Talks

TED talks and public talks are now explicit Studio targets.

As source types, they are talks we ingest, watch, transcribe, highlight, tag,
and analyze. Studio should let us study how the talk works:

- opening hook
- personal story
- problem frame
- research support
- visual demonstration
- turning point
- repeated phrase
- audience laugh or release
- emotional beat
- call to action
- closing image

As output types, they are talks Studio helps us write, structure, rehearse, and
eventually project:

- TED-style talk
- keynote
- conference talk
- workshop talk
- classroom talk
- memorial or tribute talk
- pitch talk
- public storytelling talk

The same talk-shaped material may move through several Studio states: source
notes, tagged spans, knowledge nodes, structures, drafts, rehearsal packets, and
approved projections.

## Example TED/Public-Talk Research Tags

These are semantic tags or tag-like labels that could be applied to spans in an
existing talk:

- `opening-hook`
- `personal-origin-story`
- `problem-frame`
- `stakes-raise`
- `research-citation`
- `data-made-human`
- `audience-identification`
- `humor-release`
- `visual-metaphor`
- `demo-moment`
- `turning-point`
- `repeatable-line`
- `moral-claim`
- `call-to-action`
- `closing-image`
- `applause-line`
- `needs-fact-check`
- `requires-rights-review`

These are tags because they describe meaning, function, or review state inside
the source. They are not source types.

## Example TED/Public-Talk Writing Structures

These are structures Studio may eventually help outline, compare, and draft:

- hook -> problem -> story -> insight -> action
- story -> pattern -> principle -> practice
- mystery -> reveal -> implication -> invitation
- personal failure -> lesson -> audience transfer
- data point -> human example -> practical rule
- recurring phrase with three returns
- three-act talk
- five-beat talk
- demonstration-led talk
- rehearsal packet
- slide-by-slide talk outline

These are structures because they describe arrangement. They are not tags,
sources, nodes, or projections.

## Taxonomy Boundaries

### Source Type

Source type is the input format or origin.

Examples:

- `book`
- `podcast_transcript`
- `ted_talk`
- `public_talk`
- `academic_paper`

### Tag Type

Tag type is a semantic label applied to a document, block, span, node, or
review state.

Examples:

- `opening-hook`
- `requires-citation`
- `leadership-principle`
- `story-candidate`

### Structure Type

Structure type is an arrangement pattern or container shape.

Examples:

- `chapter_outline`
- `podcast_episode_outline`
- `ted_style_talk_outline`
- `lesson_plan`
- `song_structure`

### Projection Type

Projection type is the target form of approved or reviewable output.

Examples:

- `book_chapter`
- `podcast_episode`
- `quiplore_quote_entry`
- `public_talk`
- `newsletter`

Projection type should remain separate from source type because a private source
can feed multiple outputs, and one output can draw from many sources.

### Node Type

Node type is the kind of extracted knowledge item.

Examples:

- `principle`
- `story`
- `quote`
- `question`
- `projection_candidate`
- `source_note`

Node type is smaller and more semantic than source or output type. A quote node
can come from a TED talk, book, interview, or original note.

## What Not To Model Too Early

Do not add database schema yet for every taxonomy label.

Do not model too early:

- per-platform TED metadata
- YouTube/TED API ingestion
- speaker/person graphs
- copyright/licensing workflows beyond simple source notes
- transcript alignment with video timecodes
- slide timing
- rehearsal scoring
- talk performance analytics
- public projection publishing
- search embeddings
- semantic similarity
- graph visualization
- one table per source format
- one enum that tries to permanently freeze every possible format

The next durable model should remain flexible: source and output labels can
start as plain vocabulary in the domain package and docs. Promote them to schema
only when importer, editor, review, or projection behavior requires stable
database constraints.
