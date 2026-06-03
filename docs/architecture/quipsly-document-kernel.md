# Quipsly Document Kernel Architecture

Date: 2026-06-02

This document defines the intended canonical model for Quipsly documents. It is
the architecture spine for the next editor work.

## Decision

Quipsly should own a document kernel.

TipTap, ProseMirror, Slate, Plate, Lexical, textareas, ReactFlow, and the video
editor can all be useful surfaces. None of them should be the long-term source
of truth.

The kernel should be implemented as a pure TypeScript package before deeper UI
rewrites:

```text
packages/quipsly-document-kernel/
  src/
    document.ts
    anchors.ts
    operations.ts
    projections.ts
    validation.ts
    migrations.ts
```

## Kernel Primitives

### `QuipslyDocument`

The canonical creative document.

Contains ordered nodes and document-level metadata.

### `DocumentNode`

A block-level unit in the document.

Examples:

- paragraph
- heading
- quote block
- note
- transcript segment
- media reference

Each node needs a durable `id`.

### `BoundaryMarker`

A structural start marker.

Used for things that mean "from here until the next marker of the same kind."

Examples:

- chapter
- episode

Boundary markers should not be ordinary text highlights.

### `Region`

A contiguous structural range.

Used for stories, sections, arcs, or scene groups that have a start and end.

### `InlineAnnotation`

A selected-text or selected-media annotation.

Examples:

- quote
- clip
- research
- question
- needs-review
- source-needed
- social-candidate

Inline annotations can overlap.

### `EntityReference`

A link from document material to durable entities.

Examples:

- verified quote
- source book
- source passage
- character
- location
- media asset
- market comp

### `Projection`

A derived view over the canonical document.

Examples:

- materialized `StudioDocumentBlock`
- materialized `StudioTaggedSpan`
- Episode 8 view
- Quote Database
- podcast show notes
- video clip candidates
- publisher packet

## Anchor Model

The kernel must support more than text offsets.

```ts
type Anchor =
  | TextAnchor
  | NodeAnchor
  | BoundaryAnchor
  | RegionAnchor
  | MediaTimeAnchor
  | TimelineAnchor;
```

### `TextAnchor`

For selected text inside a document node.

Should carry:

- `nodeId`
- `startOffset`
- `endOffset`
- `exact`
- `prefix`
- `suffix`
- optional collaborative relative positions later

### `MediaTimeAnchor`

For audio/video source ranges.

Should carry:

- `assetId`
- `startTimeMs`
- `endTimeMs`

### `TimelineAnchor`

For edited timeline ranges.

Should carry:

- `timelineId`
- `trackId`
- `startFrame`
- `endFrame`

## Operations

The operation model is the product.

Every editor, agent, importer, and publisher should eventually use explicit
operations instead of ad hoc mutation.

Initial operations:

```ts
insertText(nodeId, offset, text)
deleteText(nodeId, startOffset, endOffset)
splitNode(nodeId, offset)
mergeNodes(leftNodeId, rightNodeId)
moveNode(nodeId, afterNodeId)
addBoundary(kind, nodeId, metadata)
removeBoundary(boundaryId)
addRegion(kind, startNodeId, endNodeId, metadata)
applyInlineAnnotation(anchor, tag)
removeAnnotation(annotationId)
linkEntity(anchor, entityId, metadata)
```

Operations should return:

```ts
{
  document,
  projection,
  events
}
```

## Required First Proof

The first kernel proof must cover the Benjamin Franklin case:

1. Start with a document containing a paragraph that includes a quote.
2. Split the node before the quote.
3. Apply a quote annotation to the quote text.
4. Split or edit surrounding text again.
5. Preserve the quote annotation on the intended text.
6. Materialize updated blocks and spans for the current database layer.

If the kernel cannot do this clearly, it is not ready to drive the editor.

## Structural Taxonomy

Not every tag is the same species.

### Boundary markers

Use for:

- chapter
- episode

Meaning:

- starts here
- continues until next matching boundary

### Regions

Use for:

- story
- section
- scene
- narrative arc

Meaning:

- contiguous range
- may be nested or adjacent

### Inline annotations

Use for:

- quote candidate
- clip candidate
- research
- question
- needs-review
- show notes
- source-needed

Meaning:

- selected range of text or media
- can overlap other annotations

### Durable entities

Use for:

- verified quote
- source passage
- character
- location
- media asset
- market comp

Meaning:

- can be linked from text/media
- may remain stable even when source text changes

## Editor Adapter Strategy

Do not decide the entire future by picking one editor surface.

Build the kernel first, then compare adapters:

- current textarea workbench as temporary persistence surface
- TipTap/ProseMirror adapter for rich editing and existing Manuscript Desk reuse
- Slate/Plate spike for maximum custom workbench flexibility
- custom React surface for Quipsly-native UX experiments

The adapter that wins is the one that best manipulates the kernel without
turning the kernel into its private implementation detail.

## Agent Visibility

Agents should read kernel state, not rendered UI.

Expose agent-safe context:

```ts
getCurrentContext(cursor)
getActiveChapter(cursor)
getActiveEpisode(cursor)
getActiveStories(cursor)
getNearbyAnnotations(cursor)
getLinkedEntities(cursor)
getProjection(viewDefinition)
```

Agents should propose operations and show receipts, not silently rewrite the
manuscript.

## Database Relationship

The database should store:

- canonical kernel document snapshots or events
- materialized projections for fast query
- annotation records
- boundary records
- region records
- entity records
- agent operation logs

Current `StudioDocumentBlock` and `StudioTaggedSpan` records can remain as
materialized projections while the kernel is introduced.

## Migration Principle

Do not destroy tonight's usable workbench.

Introduce the kernel beside the current route, prove operations, then wire the
editor into the kernel in slices.
