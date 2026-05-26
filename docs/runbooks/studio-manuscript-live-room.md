# Studio Manuscript Live Room Runbook

Date: 2026-05-25

## Purpose

`/manuscript/live` is the first production shared-writing surface for Charlie
and Homer.

It exists to support a real working session quickly without pretending the full
Manuscript Desk has become a rich Google-Docs-style editor.

## Route

```text
/manuscript/live
```

The route is protected by the normal private Studio access gate.

## What It Does

- creates a private live manuscript room
- can load the latest Manuscript Library snapshot into the room starting text
- can be launched from the current Manuscript Desk browser draft
- accepts pasted or blank starting text
- lets any authenticated Studio-access user join a room when they have the
  share URL
- opens in notebook mode by default, with editable sections and a raw-text
  fallback
- can seed a room with session, writing-pass, or coaching-session starter
  sections
- can add, move, and remove notebook sections while preserving the underlying
  shared text document
- can insert quick sections for notes, decisions, actions, questions, and
  source notes at the current notebook position
- can mark an existing notebook section as a note, decision, action, question,
  or source note without losing the section body
- can focus the selected notebook section as the main writing surface while
  keeping the outline available for navigation
- syncs text through Yjs updates stored in Cloud SQL
- polls room updates roughly once per second
- records active presence heartbeats, including which notebook section a focused
  editor is working in
- exposes a shareable room URL
- can copy the current text
- can copy a session recap extracted from decision, action, question, and source
  sections
- can save the current live text as a manual Manuscript Desk snapshot
  whose description includes a compact recap digest

## What It Does Not Do

- replace canonical manuscript files
- publish public episode pages
- autosave into the full Manuscript Desk browser draft
- preserve rich Manuscript Desk marks, quotes, structure regions, or review
  metadata inside the live editor
- use a WebSocket provider

The live room is still backed by one shared text document. Notebook mode splits
that text into editable sections separated by blank lines, which keeps the
collaboration protocol simple while making live sessions feel less like one
giant scratch textarea. Manual snapshots convert the current text into
paragraph blocks so the work can be checkpointed and moved into the existing
Manuscript Desk recovery flow.

## Data Model

The Studio database stores:

- `StudioManuscriptLiveRoom`
- `StudioManuscriptLiveRoomUpdate`
- `StudioManuscriptLivePresence`

`StudioManuscriptLiveRoom.ydocUpdate` is the current merged Yjs document state.
`StudioManuscriptLiveRoomUpdate` is the ordered update event stream used by
other open browsers to catch up. `StudioManuscriptLivePresence` is ephemeral
presence state and should not be treated as manuscript content.

Presence `mode` remains a plain string. Notebook focus currently reports
`editing section N`, which lets the UI show who is active inside each notebook
section without a schema change.

## Tonight Workflow

1. Open Studio.
2. Open `/manuscript/live`.
3. Either:
   - from Manuscript Desk, use `Start live room` in the server snapshot panel to
     seed the room from the current browser draft; or
   - in `/manuscript/live`, select an existing Manuscript Library item and load
     its latest snapshot; or
   - paste the current manuscript section into the starting text field.
4. Create or open the live room.
5. Copy the room link and send it to Homer.
6. Work in notebook mode by default. Use starter sections for a fresh room, then
   add, move, remove, or quick-insert decision/action/question/source sections
   as the session changes.
7. Use `Copy recap` for a clean handoff of decisions, actions, questions, and
   source notes.
8. Use `Save manual snapshot` when a meaningful checkpoint is reached.
9. Continue in the live room or move the checkpoint into Manuscript Desk review.

## Validation

Run:

```bash
pnpm db:generate
pnpm studio:manuscript:live-room:test
pnpm studio:cloudrun:test
pnpm --filter studio typecheck
pnpm --filter studio build
git diff --check
```

If the local Studio build hits the known Turbopack sandbox port-binding error,
rerun it outside the sandbox.

## Rollback

The database addition is additive. If the live route needs to be disabled
quickly, remove the nav link and deploy an older Studio revision. Existing live
room rows can remain in Cloud SQL; they are private Studio state and are not
public content.
