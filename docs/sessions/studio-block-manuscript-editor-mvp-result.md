# Studio Block Manuscript Editor MVP Result

Date: 2026-05-19

## Summary

This pass added the first block-aware Manuscript Attribution Desk MVP:

```text
/manuscript
```

The route is private behind the same Studio access gate as Tagging Desk,
Writing Desk, and Structure Mode.

The product target is the safer book workflow:

```text
Scott/Homer .docx -> clean editable manuscript -> Homer/Scott attribution -> Charlie edits and attribution -> semantic highlights
```

Older OneNote and Markdown export attempts remain future reference/archive
material. They are not the source of truth for this MVP.

## What Works

- `/manuscript` opens for approved Studio users.
- The page uses a TipTap/ProseMirror editor surface.
- `.docx` files can be imported through Mammoth as HTML and loaded into the
  editor.
- Imported `.docx` content is marked Homer / Scott by default after import.
- A one-click `Mark all as Homer / Scott` fallback exists.
- Charlie can add or edit text in the editor.
- Selected text can be marked as Charlie.
- Selected text can be marked as Homer / Scott.
- Author marks can be cleared without clearing semantic marks.
- Semantic highlights can be applied separately from author marks.
- Semantic highlights can be cleared without clearing author marks.
- Bold, italic, undo, and redo are available through StarterKit.
- Author color styling can be hidden or shown.
- Semantic highlight styling can be hidden or shown.
- The side panel lists block IDs with text previews.
- The side panel shows author-mark counts.
- The side panel lists semantic highlights when present.
- Editor JSON, full draft JSON, HTML, and plain text can be exported.
- Editor JSON or the full draft JSON can be imported.
- The browser-local draft survives refresh.
- A clear action removes only the Manuscript Desk localStorage key.

## Editor Model

The MVP uses TipTap on ProseMirror JSON instead of a textarea or one
unstructured blob.

That choice matters because the future Studio database needs durable document
blocks and inline span metadata. The editor JSON now carries:

- paragraph/heading/list-item block nodes
- stable `blockId` attributes on block nodes
- separate inline `authorMark` marks
- separate inline `semanticHighlightMark` marks

This is the foundation for later database-backed documents, span records,
knowledge nodes, projection records, and AI context windows.

## Block IDs

Block IDs are attached to:

- paragraph
- heading
- list item

The editor uses TipTap's `UniqueID` extension with `blockId` as the node
attribute. A pure helper also ensures missing block IDs are added when draft or
imported JSON is parsed/exported.

The first goal is not perfect block management. The important MVP result is
that exported editor JSON contains durable block identifiers future Studio
persistence can use.

## Marks

### AuthorMark

Attributes:

- `authorId`
- `authorLabel`

Known authors:

- `homer` - Homer / Scott
- `charlie` - Charlie
- `unassigned` - Unassigned

The mark renders as a span with author data attributes and author-specific
styling.

### SemanticHighlightMark

Attributes:

- `highlightId`
- `tagType`
- `label`
- `colorKey`
- `note`
- `createdAt`

Known semantic tags:

- quote
- story
- insight
- research
- question
- needs-review
- thesis
- transition

Semantic highlights render as spans with semantic data attributes and
tag-specific styling.

Authorship and semantic meaning are intentionally separate marks so one can be
changed without erasing the other.

## Persistence

The MVP persists only to browser localStorage:

```text
high-ground-studio.manuscript-editor.v1
```

The stored draft includes:

- schema version
- title
- source file name
- editor JSON
- active author
- display toggles
- last updated timestamp

No remote database persistence was added in this pass.

## Export And Backup

Available exports:

- editor JSON
- full browser-local draft JSON
- HTML
- plain text

`.docx` export is intentionally not implemented in this pass.

## Tests Added

New command:

```bash
pnpm studio:manuscript:test
```

The tests cover:

- storage key stability
- author definitions
- semantic highlight definitions
- valid draft parsing
- invalid draft rejection
- editor JSON shape validation
- word and character counting
- author span summaries
- block ID helper behavior
- semantic highlight extraction

## What Remains Deferred

- remote database persistence
- Prisma schema changes
- Yjs or real-time collaboration
- `.docx` export
- importer workers
- AI/ML features
- embeddings
- public projections
- canonical Learning to Lead manuscript writes
- optimization around old OneNote/Markdown exports

## Safety

This pass did not run Cloud Build, deploy, mutate GCP resources, change IAM,
change DNS, change Secret Manager, change billing, run `db:push`, mutate a
database, change Prisma schema, or modify canonical manuscript/content files.

The dependency install did run the repo's existing Prisma client generation
postinstall, but it did not push schema changes or mutate database state.
