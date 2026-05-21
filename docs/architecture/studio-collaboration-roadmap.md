# Studio Collaboration Roadmap

Date: 2026-05-21

## Purpose

Simultaneous editing will probably matter for Studio. Charlie and Homer will
eventually benefit from seeing the same manuscript state at the same time,
especially during review, recording preparation, and editorial handoff.

That does not mean collaboration should be smuggled into the current snapshot
API. Manual snapshots solve cross-device checkpointing. Collaboration is a
different architecture with different failure modes.

## Why Simultaneous Editing Is Valuable

Real collaboration can eventually support:

- Charlie preparing text while Homer reviews on another device
- read-only recording rooms
- guided review sessions
- live quote or structure triage
- presence and cursor awareness
- fewer stale-copy mistakes
- less manual export/import work

The value is real, but only if users can trust what is live, what is saved, and
what happens when devices disconnect.

## Why Snapshots Come First

Manual snapshots are the right first step because they are explicit and
recoverable:

- the browser-local draft remains the active working copy
- server snapshots are deliberate checkpoints
- another device can load the saved checkpoint
- no per-keystroke overwrite loop exists
- no room protocol has to be designed yet
- full draft JSON backups still work

Snapshots also create a useful durability pattern for a later collaboration
system. A future live room will still need checkpoints.

## Collaboration Phases

### 1. Manual Snapshots

Current phase.

Manual snapshots let a signed-in device save a full `ManuscriptDraft` JSON
checkpoint and another signed-in device load it. This is not live editing and
not autosave.

### 2. Snapshot History And Stale Warnings

Before autosave, Studio should show clearer version awareness:

- last saved snapshot
- latest available server snapshot
- whether local state has changed since save or load
- whether the server has a newer checkpoint than this browser last saw
- safe replacement prompts

This phase teaches the UI how to talk about stale state.

### 3. Guarded Autosave

Autosave should wait until stale/conflict semantics exist.

Minimum requirements:

- base snapshot or revision awareness
- conflict warning when the server has moved
- visible server-save status
- clear recovery path
- ability to keep manual checkpoints

Autosave without these guardrails can create false confidence and overwrite
useful local work.

### 4. Collaboration Spike

Build an isolated prototype before changing the live Manuscript Desk.

The spike should answer:

- whether TipTap/Yjs becomes the live editor state
- how `ManuscriptDraft` snapshots are derived from live state
- how author marks, semantic highlights, quote reviews, and structure regions
  survive collaborative editing
- how undo/redo behaves with local and remote changes
- how read-only users join
- how reconnects and offline edits behave

### 5. Live Yjs / Hocuspocus Service

If the spike is viable, introduce a separate collaboration runtime rather than
burying live rooms inside the snapshot API.

Suggested service boundary:

- current Studio app: auth, pages, snapshots, publishing exports, durable UI
- future `studio-collab` service: live rooms, WebSocket handling, awareness,
  room lifecycle, checkpoint hooks

Hocuspocus or a similar provider can be considered here, but the service
boundary matters more than the brand of provider.

### 6. Read-Only And Recording Roles

Homer's phone or tablet should not necessarily have the same permissions as
Charlie's editing desktop.

Future roles to design:

- editor
- reviewer
- read-only recorder
- observer

Recording mode may eventually become a room role, not only a UI toggle.

## Cloud Run And Service Boundary Notes

Cloud Run can serve WebSocket traffic, but live collaboration changes the
operational profile:

- long-lived connections
- reconnect behavior
- instance scaling
- room stickiness or provider storage
- checkpoint cadence
- deployment interruptions
- auth refresh

Those concerns are acceptable only when handled directly.

## Risks

- conflict semantics are unclear
- local undo/redo can become surprising
- room auth can leak private manuscript access if it is too loose
- reconnects can duplicate or drop expected changes
- awareness state can be confused with saved document state
- persistence checkpoints can lag live room state
- stale browser-local drafts can overwrite newer room state
- Cloud Run scaling and WebSocket behavior need explicit testing

## What Not To Do

- Do not hide collaboration inside a snapshot API.
- Do not call manual snapshots collaboration.
- Do not add autosave without stale/conflict semantics.
- Do not treat a Yjs room as durable manuscript truth without checkpoints.
- Do not make Recording / Reading mode secretly edit-capable.
- Do not skip room authorization because Studio auth already exists.
- Do not add collaboration in the same pass as publishing exports.

## Near-Term Guidance

Keep the current sprint focused on publishing and handoff:

- readiness reports
- Markdown exports
- Homer-friendly handoff packets
- manual snapshot awareness

That work prepares people and metadata for collaboration later without
requiring the collaboration system to exist now.
