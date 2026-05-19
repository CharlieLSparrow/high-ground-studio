# Studio Block Manuscript Editor MVP Plan

Date: 2026-05-19

## Decision

Build the first Manuscript Attribution Desk as a block-aware TipTap editor with
inline author and semantic marks, browser-local persistence, and `.docx`
import through HTML into editor JSON.

This comes directly after the first successful live Structure Mode deployment.
Cloud Run proved that Studio can run as a private deployed app and that a
browser-local MVP can be useful without remote database risk. The next product
move is not more deployment work. It is moving the book-writing workflow into
Studio while preserving the data shape that future persistence, provenance, and
agent workflows will need.

## Why Blocks And Highlights Are The Primary Workflow

The manuscript workflow is not just typing into a large editor. Homer/Scott's
existing book material arrives as a Word document, and Charlie's contribution
will be added around it. The primary work is:

- import source manuscript text
- preserve paragraph-like blocks
- identify who wrote which spans
- highlight semantic spans such as quote, story, insight, research, question,
  thesis, transition, and needs-review
- inspect the block trail later
- persist the same structure to a database later without changing the editor
  model

That makes text blocks and inline marks the center of the MVP. Blocks give the
future database durable units. Inline marks give the editor durable span-level
metadata without forcing every highlight into a separate side-card workflow.

## Why One Textarea Or One Blob Is Not Enough

A textarea can prove copy/paste quickly, but it collapses the manuscript into
one unstructured string. That is not enough for a book workflow because:

- paragraph identity is lost
- headings, lists, and block boundaries are implicit rather than explicit
- future database rows would need to rediscover blocks after the fact
- span offsets become fragile after edits
- author attribution and semantic tags become external annotations instead of
  document-native marks
- imported Word structure cannot be round-tripped into a useful editor JSON
  shape

The Structure Mode MVP could be browser-local because it was arranging cards
from pasted source. Manuscript editing is different. The manuscript itself is
the working object, so the MVP must preserve block and inline metadata from the
start.

## Why A TipTap/ProseMirror Model Is Appropriate

TipTap sits on ProseMirror, which already solves the hard editor problems this
workflow needs:

- a JSON document tree
- stable block nodes
- nested inline marks
- editable rich text
- undo/redo history
- commands for applying and clearing marks
- extension points for custom attribution and semantic metadata
- HTML import and export paths

Hand-rolling this on contenteditable or a textarea would only create a local
editor format that has to be replaced later. TipTap gives Studio a real
document model now while keeping the first pass narrow and reversible.

## Why Block IDs Matter

Every paragraph, heading, and list item should get a stable block ID. These IDs
are not UI decoration. They are future join keys for:

- source document blocks
- author-attributed spans
- semantic highlights
- knowledge nodes
- editor revision snapshots
- projection records
- agent context windows

If blocks do not have IDs in the editor JSON, the future database has to infer
identity from order or text content. That breaks as soon as the manuscript is
edited. A stable `blockId` attribute gives later persistence something durable
to attach to.

## Author Marks And Semantic Marks Must Stay Separate

Authorship and meaning are different dimensions.

Author attribution answers:

- who wrote this span
- which voice or contributor should own this wording
- where Charlie's additions differ from Homer/Scott's source

Semantic highlighting answers:

- what kind of material this span is
- how it should be used in structure, retrieval, projection, or review
- whether it needs research, review, transition work, or thesis clarification

Combining both into one mark would make later queries and editing awkward.
Clearing a semantic highlight should not erase authorship. Reassigning
authorship should not erase a `quote` or `needs-review` tag. The MVP therefore
uses separate `AuthorMark` and `SemanticHighlightMark` extensions that can
coexist on the same text.

## Docx Import Shape

The intended import pipeline is:

```text
.docx -> HTML -> TipTap editor JSON
```

The Word document is a transport format, not Studio's internal editor model.
Converting to HTML first is practical because TipTap can ingest HTML into its
ProseMirror document. After that, Studio owns the editor JSON, block IDs, author
marks, semantic marks, and future persistence shape.

This pass should not optimize around the older OneNote or Markdown book export
attempts. Those files remain future reference/archive material, not the source
of truth for this MVP. The safer workflow is to start from Scott/Homer's
original Word document, import it into a clean editable manuscript surface, mark
that imported content as Homer/Scott, then let Charlie add and mark his own
writing inside the same block-aware editor.

Mammoth or an equivalent converter is acceptable for the first `.docx` import
because the immediate goal is to preserve useful manuscript structure, not to
perfectly preserve every Word styling decision. The first import should favor
paragraphs, headings, lists, and clean text over pixel-perfect layout.

If import quality later becomes a blocker, the converter can be replaced while
keeping the downstream editor JSON and marks intact.

## Browser-Local Persistence Boundary

Browser-local persistence is acceptable for this MVP because Studio's first
live product posture is already browser-local for Structure Mode, and remote
database persistence is explicitly deferred.

The storage shape still needs to be future-compatible:

- schema version
- title
- source file name
- editor JSON
- active author
- display toggles
- last updated timestamp

That shape maps cleanly to future database tables for manuscript documents,
document blocks, author spans, semantic marks, and snapshots. The MVP should
not invent a local shape that has no database future.

## Deferred Work

This pass should not add:

- Yjs
- real-time collaboration
- remote database persistence
- Prisma schema changes
- importer workers
- `.docx` export
- canonical manuscript writes
- public projections

Those are real future needs, but adding them before the editor model is proven
would increase risk and make the first product slice harder to evaluate.

## Rewrite Risks And How This Pass Avoids Them

A future rewrite would be forced if the MVP:

- stored the manuscript as one unstructured blob
- treated highlights as detached UI cards with no editor-native marks
- mixed authorship and semantic metadata in one mark
- lost block identity on import or edit
- used a converter-specific JSON shape instead of editor JSON
- persisted local data in a format unrelated to future database records

This pass avoids that by choosing TipTap's ProseMirror JSON as the working
document model, assigning stable block IDs to block nodes, keeping author and
semantic marks separate, and storing a versioned browser-local draft envelope.

The goal is not a perfect book editor. The goal is the first usable Manuscript
Attribution Desk that proves the correct foundation before persistence,
collaboration, importer hardening, and public projection work begin.
