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
- accepts pasted or blank starting text
- lets any authenticated Studio-access user join a room when they have the
  share URL
- syncs text through Yjs updates stored in Cloud SQL
- polls room updates roughly once per second
- records active presence heartbeats
- exposes a shareable room URL
- can copy the current text
- can save the current live text as a manual Manuscript Desk snapshot

## What It Does Not Do

- replace canonical manuscript files
- publish public episode pages
- autosave into the full Manuscript Desk browser draft
- preserve rich Manuscript Desk marks, quotes, structure regions, or review
  metadata inside the live editor
- use a WebSocket provider

The live room is a shared text surface. Manual snapshots convert the current
text into paragraph blocks so the work can be checkpointed and moved into the
existing Manuscript Desk recovery flow.

## Data Model

The Studio database stores:

- `StudioManuscriptLiveRoom`
- `StudioManuscriptLiveRoomUpdate`
- `StudioManuscriptLivePresence`

`StudioManuscriptLiveRoom.ydocUpdate` is the current merged Yjs document state.
`StudioManuscriptLiveRoomUpdate` is the ordered update event stream used by
other open browsers to catch up. `StudioManuscriptLivePresence` is ephemeral
presence state and should not be treated as manuscript content.

## Tonight Workflow

1. Open Studio.
2. Open `/manuscript/live`.
3. Create a room with a clear title.
4. Paste the current manuscript section into the starting text field, or start
   blank.
5. Copy the room link and send it to Homer.
6. Work in the shared text area.
7. Use `Save manual snapshot` when a meaningful checkpoint is reached.
8. Continue in the live room or move the checkpoint into Manuscript Desk review.

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
