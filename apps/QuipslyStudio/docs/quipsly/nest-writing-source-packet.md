# Nest writing source packet

Last updated: 2026-06-24

The Nest writing source packet maps manuscript, episode, research, and article
source material into a read-only provenance surface. It is a practical bridge
between source capture and writing work.

## Command

```bash
./script/agentctl.sh nest-writing-source-packet "/Users/wall-e/Dev/high-ground-studio/apps/web/content/_inbox" 180
```

Workbench command:

```bash
./script/agentctl.sh nest-writing-workbench "/Users/wall-e/Dev/high-ground-studio/apps/web/content/_inbox" 220
```

Draft packet command:

```bash
./script/agentctl.sh nest-writing-draft-packet first
```

Smoke command:

```bash
./script/agentctl.sh nest-writing-source-smoke "/Users/wall-e/Dev/high-ground-studio/apps/web/content/_inbox" 24
```

Latest observed output:

```text
/Volumes/My Passport/Quipsly Media Workspace/NestWriting/20260624-102201-inbox/index.html
```

Latest writing workbench:

```text
/Volumes/My Passport/Quipsly Media Workspace/NestWriting/20260624-102201-inbox/writing-workbench/index.html
```

Latest draft packet:

```text
/Volumes/My Passport/Quipsly Media Workspace/NestWriting/DraftPackets/20260624-103427-episode-page-episode-1-preface/index.html
```

Latest counts:

- 220 source documents in the current packet.
- 537,541 words.
- 160 ready-for-review sources.
- 60 short notes.
- 0 source-read errors.
- 7 workstreams.
- 48 draft-queue items.
- 24 safe action cards.

Current workstreams:

- `article-draft`
- `book-manuscript`
- `capture-note`
- `podcast-episode-planning`
- `published-episode-text`
- `research-packet`
- `source-library`

First draft-queue examples:

- Episode 1 - Preface.
- Podcast Year 1 / 1 - March 25 - Pilot.
- Episode 2 - Introduction.
- Podcast Year 1 / 2 - April 1 - It's a Metaphor!
- Episode 3 - Chapter 0.

First draft packet proof:

- Task: `episode-page-episode-1-preface`.
- Title: Episode 1 - Preface.
- Source count: 1.
- Markdown handoff: `/Volumes/My Passport/Quipsly Media Workspace/NestWriting/DraftPackets/20260624-103427-episode-page-episode-1-preface/START-HERE-draft-packet.md`.
- Tower handoff: `/Volumes/My Passport/Quipsly Media Workspace/NestWriting/DraftPackets/20260624-103427-episode-page-episode-1-preface/tower-handoff.json`.
- Platform packets: `/Volumes/My Passport/Quipsly Media Workspace/NestWriting/DraftPackets/20260624-103427-episode-page-episode-1-preface/platform-packets.json`.
- Statuses remain draft-only / not-published / not-posted / not-uploaded / not-scheduled.

## Product rules

- Source files are read-only.
- Drafts, outlines, tags, and article starts should retain visible provenance.
- AI can draft and rewrite, but should make source trail and assumptions visible.
- Human approval is required before publication or source mutation.
- Draft previews are not canonical manuscript replacements.

## Next best improvements

- Make this workbench editable in a native Nest writing surface.
- Add explicit chapter/episode boundary controls over the packet.
- Add compare/merge tools for multiple manuscript truths.
- Add article/podcast/show-note drafting from packet provenance.
- Add human review states and receipt-like proof for writing decisions.

## 2026-06-24 - OS board Nest writing action cards

The Quipsly OS board now surfaces Nest writing/research action cards directly.

Latest OS board:

- HTML: `/Volumes/My Passport/Quipsly Media Workspace/QuipslyOS/20260624-113157-quipsly-os/index.html`
- JSON: `/Volumes/My Passport/Quipsly Media Workspace/QuipslyOS/20260624-113157-quipsly-os/quipsly-os-board.json`

Current Nest writing state shown on the board:

- 220 indexed source documents.
- 537,541 words indexed.
- 160 source documents ready for review.
- 48 draft-queue items.
- 24 workbench action cards.
- 1 latest source-backed draft packet.
- 1 writing publication runway packet.
- 0 source file mutations.
- 0 canonical manuscript replacements.
- 0 external publishing actions.

Writing action-card behavior:

- `Open writing/research workbench`: opens the current source-backed workbench and draft queue.
- `Review latest source-backed draft packet`: points to the latest draft preview and source trail.
- `Review writing publication runway`: shows platform draft rows and receipt slots without claiming publication.
- `Create/review draft packet`: exposes safe local draft-packet commands for workbench tasks.

Safety boundary:

Nest writing cards are local review and draft-preview guidance. They do not mutate manuscript/source files, replace canonical text, publish externally, schedule posts, or create receipt truth.

## 2026-06-24 15:25 MDT - Writing session cockpit

Added a focused writing session cockpit that turns the latest source-backed workbench into a small set of next writing sessions.

Latest generated packet:
- HTML: `/Volumes/My Passport/Quipsly Media Workspace/NestWriting/WritingSessionCockpit/20260624-152527-writing-session-cockpit/index.html`
- JSON: `/Volumes/My Passport/Quipsly Media Workspace/NestWriting/WritingSessionCockpit/20260624-152527-writing-session-cockpit/nest-writing-session-cockpit.json`
- Markdown: `/Volumes/My Passport/Quipsly Media Workspace/NestWriting/WritingSessionCockpit/20260624-152527-writing-session-cockpit/START-HERE-writing-session-cockpit.md`
- CSV: `/Volumes/My Passport/Quipsly Media Workspace/NestWriting/WritingSessionCockpit/20260624-152527-writing-session-cockpit/writing-session-queue.csv`

Command:

```bash
./script/agentctl.sh nest-writing-session-cockpit 16
```

Current truth: 16 selected writing sessions from 48 available draft-queue items, 7 workstreams, 0 source mutations, and 0 external publishing. Each row keeps source trails and safe draft-packet commands visible.

