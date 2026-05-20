# Studio Manuscript Structure Layer MVP Plan

Date: 2026-05-19

## Decision

Add chapter, episode, and section structure tagging inside `/manuscript`, not as
a detached outline tool.

The Manuscript Desk is already the surface where the real full-book draft lives:
TipTap/ProseMirror JSON, `.docx` import through Mammoth, stable `blockId`
attributes on paragraph/heading/list-item blocks, author attribution, semantic
highlights, browser-local persistence, backup exports, and block inspection.
The first real import was approximately 30k words, 162k characters, and 325
blocks, which proved the full-book surface is viable enough to organize in
place.

## Why Structure Editing Belongs Inside Manuscript Desk

Structure decisions are editorial decisions made while reading the manuscript.
The user needs to see the full draft, not a disconnected outline projection, in
order to decide where a chapter begins, where an episode arc should stop, and
whether a section boundary actually follows the prose.

Keeping the work inside Manuscript Desk means the editor remains the primary
object. Structure annotations sit beside the text and block inspector, and the
same local draft export can carry text, authorship, semantic marks, import
metadata, and book organization without inventing a second source of truth.

## Whole-Manuscript View Requirement

The current imported manuscript is short enough for full-book editing in the
browser. A structure MVP should therefore preserve the full manuscript view and
let the user tag ranges from that view.

A detached outline would force the user to make structural calls from summaries
or copied snippets. That is the wrong first surface because chapter and episode
boundaries depend on the surrounding paragraphs, heading rhythm, story
transitions, and actual draft order.

## Block-Range Structure Annotations

Chapters and episodes span many paragraphs, headings, and list items. They
should be stored as block-range annotations:

```ts
type ManuscriptStructureRegion = {
  id: string;
  kind: "chapter" | "episode" | "section";
  title: string;
  startBlockId: string;
  endBlockId: string;
  order: number;
  colorKey: string;
  notes: string;
  createdAt: string;
  updatedAt: string;
};
```

This uses the existing `blockId` layer as the durable anchor. Text edits inside
a region can change words, punctuation, and inline marks without invalidating
the region. Future persistence can map the same start and end block IDs to
database rows.

## Why Not Inline Marks

Inline marks are appropriate for span-level meaning and authorship. They are
not appropriate for chapters or episodes because:

- A chapter or episode often includes many block nodes.
- A boundary belongs between blocks as much as inside text.
- Selecting large cross-block ranges as inline text marks would create fragile
  mark fragmentation during normal editing.
- Clearing or editing text styling should not erase book organization.
- Future database persistence needs document/block relationships, not nested
  character-level marks, for structural regions.

The MVP can still render structure visually in the editor, but the saved data is
not an inline mark and does not live inside text nodes.

## Difference From Semantic Highlighting

Semantic highlighting answers what a span is: quote, story, insight, research,
question, thesis, transition, or needs-review. It can apply to a few words or a
few sentences and is stored as an inline `SemanticHighlightMark`.

Structure answers where a book or production unit lives: chapter, episode, or
section. It applies to a range of blocks and is stored outside the editor text
tree as a region attached to durable block IDs.

Both layers can overlap. A chapter can contain many stories, quotes, and
questions. An episode can cross part of a chapter or sit inside one chapter.
Neither layer should clear or rewrite the other.

## Chapter And Episode Independence

Chapters and episodes are independent organizational layers. They can overlap
because they serve different publication and production needs:

- A chapter is a book structure unit.
- An episode is an audio or serialized production unit.
- A section is a smaller local grouping that can support either layer.

The MVP should not enforce exclusive nesting or require one layer to derive from
the other. If later editorial rules become stable, validation can be added
without changing the saved region shape.

## Future Persistence Mapping

The browser-local draft now has enough shape to map cleanly to a future database
without changing the editor workflow:

- manuscript document row
- manuscript block rows keyed by `blockId`
- structure region rows with `kind`, `title`, `startBlockId`, `endBlockId`,
  `order`, `colorKey`, and `notes`
- optional revision/snapshot rows recording which editor JSON version the
  region belongs to

This keeps the future database model aligned with the current full-book editor
instead of forcing a later migration from a detached outline format.

## Deferred

- Database-backed structure persistence.
- Prisma schema changes.
- Yjs or multi-user collaboration.
- Drag-reordering structure regions.
- Automatic chapter/episode inference.
- Validation for nested or conflicting region ranges.
- Public projections or canonical manuscript writes.
- `.docx` export with structure metadata.
- Promotion of structure annotations into any public book or episode source.
