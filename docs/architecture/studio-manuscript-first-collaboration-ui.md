# Studio Manuscript-First Collaboration UI

Date: 2026-05-22

## Principle

The long manuscript is the primary surface.

Collaboration should happen over the manuscript, not beside it as a dashboard
of disconnected cards. Blocks and spans are implementation structure. Charlie
and Homer should still feel like they are working on one continuous manuscript.

## Product Direction

The final collaboration UI should preserve the full-book, one-page,
anxiety-lowering workflow:

- one long manuscript stream
- visible semantic span overlays
- margin presence and activity indicators
- comments, quotes, tags, and source details in side panels
- filters that collapse or reveal context without destroying the full
  manuscript
- checkpoints as explicit actions

Sidebars should be inspectors and controls, not the main mental model.

## Presence And Margins

Presence belongs around the manuscript. It should show who is reading, editing,
tagging, or reviewing without becoming manuscript content.

For production, presence should live in margins, overlays, cursors, and
side-panel awareness. It should not be written into the durable manuscript
document, manual snapshots, checkpoints, or projection source data. A future
provider may broadcast presence state, but that provider state must remain
ephemeral unless an explicit audit/event feature is designed later.

## Spans

Semantic spans are overlays on source text. They are the collaboration bridge
for future quotes, citations, comments, author notes, review states, and HGO
projection tags.

For the current local lab, spans are synthetic text-offset ranges over synthetic
block text. That is intentionally smaller than the future production model, but
it proves the important direction:

```text
source text -> addressable span -> semantic mark -> projection/checkpoint
```

## Current Lab Shape

The current `/manuscript/collaboration-lab` still has two-client panels for
Charlie and Homer. Those panels are scaffolding for CRDT testing, not the final
collaboration shape.

The lab now also includes a shared manuscript surface near the top. That surface
renders the synthetic document as one continuous manuscript stream, displays
synthetic span overlays inline, and shows local-only margin presence cues for
Charlie and Homer.

## Production Constraints

Before this direction reaches production `/manuscript`, Studio still needs:

- authenticated collaboration rooms
- provider-backed presence/awareness state
- access-controlled provider/server architecture
- span identity that survives real editing
- comments and review state
- explicit checkpoint-to-manual-snapshot actions
- rollback/recovery tests

Manual snapshots remain sacred. Collaboration state must not silently replace
manual checkpoints or autosave over work.

## Non-Goals

This UI principle does not add:

- production simultaneous editing
- real manuscript text
- real HGO content
- server routes
- localStorage collaboration state
- autosave
- Yjs provider/server
- DB/schema changes
- deployment
- public publishing
