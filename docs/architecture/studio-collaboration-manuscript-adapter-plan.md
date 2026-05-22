# Studio Collaboration Manuscript Adapter Plan

Date: 2026-05-22

## Purpose

The collaboration lab needs a bridge from CRDT-shaped collaboration checkpoints
toward the Manuscript Desk draft model before any production save/load wiring is
attempted.

This pass adds a synthetic-only adapter:

```text
studio-collaboration-checkpoint-v1
-> studio-collaboration-manuscript-adapter-v1
-> synthetic ManuscriptDraft subset
-> collaboration checkpoint/client
```

It proves that synthetic blocks, text, tags, empty blocks, and safety metadata
can survive the boundary between the local Yjs lab and the Manuscript Desk draft
shape.

## Current Manuscript Desk Shape

The production Manuscript Desk draft envelope is `ManuscriptDraft`:

- `schemaVersion`
- `title`
- `sourceFileName`
- `importSummary`
- `structureRegions`
- `quoteReviews`
- `editorJson`
- `activeAuthorId`
- `showAuthorColors`
- `showSemanticColors`
- `lastUpdatedAt`

Manual server snapshots store a full `ManuscriptDraft` JSON payload only when an
operator explicitly saves a snapshot. That flow remains untouched.

## Adapted Subset

The adapter creates a valid synthetic `ManuscriptDraft` subset containing:

- title
- ordered paragraph blocks
- durable block ids
- block text
- synthetic author marks from collaboration actor names
- synthetic collaboration tag metadata on paragraph attrs
- a first synthetic semantic mark when a block has tags
- empty `structureRegions`
- empty `quoteReviews`
- `sourceFileName: null`
- `importSummary: null`

The adapter payload also carries the original synthetic collaboration blocks and
tags because collaboration tags are block-level lab metadata, not yet a full
production span model.

## Explicit Gaps

This is not a full production import format. It deliberately omits:

- real source file metadata
- import summary from a `.docx`
- structure regions
- quote reviews
- cited quotations
- production snapshot metadata
- server-side ownership metadata

Those gaps must be closed deliberately before production collaboration can write
to the Manuscript Desk.

## Safety

Every adapter payload carries explicit safety flags:

- `syntheticDataOnly: true`
- `serverWrites: false`
- `localStorage: false`
- `productionManuscriptEditing: false`
- `autosave: false`
- `productionSnapshot: false`
- `productionImport: false`

Validation rejects unsafe safety flags, known real-content markers, and obvious
secret/auth/browser-storage markers.

## Future Path

Before production wiring, the next collaboration steps should be:

1. Expand the adapter toward a manuscript-shaped CRDT schema with addressable
   spans.
2. Decide how block-level collaboration tags become Manuscript Desk semantic
   marks or structure metadata.
3. Add synthetic browser smoke for the adapter UI.
4. Add an explicit manual checkpoint action that can produce a real
   `ManuscriptDraft` only after access control and rollback rules exist.
5. Keep manual server snapshots as deliberate rollback anchors, not autosave.

Do not wire this adapter into production `/manuscript` save/load until those
steps are complete.
