# Quipsly Kernel Now / Next / Later

Date: 2026-06-02

This is the active execution plan for the Quipsly editor/kernel sprint.

## Now

Preserve the live workbench while starting the kernel.

Current live surfaces:

- `https://nest.quipsly.com/`
- `/create`
- `/editor`
- `/notebooks`
- `/files`
- `/study`
- hidden publisher mode via `?publisher=1`

Immediate implementation lane:

1. Create `packages/quipsly-document-kernel`.
2. Implement document, node, anchor, annotation, boundary, region, and projection
   types.
3. Implement operation functions for text insert/delete/split/merge and inline
   annotation application.
4. Add the Benjamin Franklin split-and-tag test case as the first proof.
5. Add projection output shaped like current `StudioDocumentBlock` and
   `StudioTaggedSpan` records.
6. Do not replace the live editor until the kernel proof is clear.

## Next

Bridge the kernel into the app.

1. Add a non-production `/kernel-lab` or local-only lab route that visualizes:
   - document nodes
   - boundaries
   - regions
   - inline annotations
   - projected blocks/spans
2. Import the current `/create` workbench state into a kernel document.
3. Export a kernel document back into the current materialized DB shape.
4. Add a TipTap adapter spike using old Manuscript Desk marks and block IDs.
5. Add a Slate/Plate adapter spike only if it directly tests Quipsly primitives,
   not generic rich text.
6. Decide the editor surface based on kernel manipulation quality, not library
   aesthetics.

## Later

Grow the kernel into the full Creative OS substrate.

- canonical DB storage for kernel document state
- event log or operation log
- workspace privacy model
- source corpus ingestion
- romance lab private workspace
- agent example sidebar
- media anchors and transcript anchors
- video timeline projections
- publisher packet generation
- quote entity verification and drift tracking
- collaborative editing through Yjs or equivalent transport

## Stop Conditions

Stop and ask before:

- deleting or moving older docs
- replacing `/create` wholesale
- changing production schema in a destructive way
- exposing private Romance Lab content to HGO/Homer workspaces
- publishing or exporting private source material
- letting agents silently mutate manuscript content
- treating ReactFlow or a visual graph as canonical source truth
- committing to Slate, TipTap, Lexical, or custom contenteditable as the
  canonical brain

## Success Criteria

The next serious editor slice succeeds when:

- pressing Enter creates durable document structure, not newline text inside one
  block
- quote tags survive node splits
- chapter and episode boundaries compute "until next boundary"
- story regions can be represented separately from chapter and episode
- materialized projections remain queryable
- agents can inspect context without reading pixels
- the live workbench stays usable

## Current Product Bet

Build the Quipsly kernel as the canonical brain.

Use editor libraries as adapters.

Keep the human surface simple.
