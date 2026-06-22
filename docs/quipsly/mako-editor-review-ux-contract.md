# Mako editor review UX contract

Status: active product guidance
Scope: Quipsly Studio Episode 1 vertical slice, then generalized review/collaboration flows
Last updated: 2026-06-20

## North star

Mako edits. Quipsly remembers. Codex learns. Tower proves.

The review system must feel like editing to Mako. It should not feel like a separate compliance workflow, a checklist trap, or a database chore.

## The product promise

Mako should be able to:

- Watch the edit.
- Scrub the source wall and program output.
- Adjust a cut, crop, caption, audio issue, or short segment.
- Leave a plain-English note when something feels off.
- Pick a simple outcome: looks good, needs edit, blocked, or note.

Quipsly should quietly:

- Store the note as structured draft review data.
- Preserve who said it, what it targeted, and when.
- Keep official review state separate from editor notes.
- Surface the next safe action.
- Feed Codex/product learning without forcing Mako to think like a database.

## Human-facing language

Use editor language:

- Looks good
- Needs edit
- Blocked
- Note
- Crop/framing
- Cut/pacing
- Audio comfort
- Caption safety
- Media/source problem
- Tool friction

Avoid ledger language in the main review surface:

- Official mutation
- Receipt gate
- Canonical state
- Artifact approval
- Compliance checklist
- Required evidence row

Those concepts are useful underneath, but they should not be the front door for creative review.

## State model

Mako notes are editorial signal, not official approval.

Draft review note target shape:

```text
mako:<outcome>:<category>:<target>
```

Examples:

```text
mako:needs-edit:crop:01:02:30
mako:blocked:media:segment-005
mako:looks-good:overall:segment-005
mako:note:tool:timeline-zoom
```

Supported outcomes:

- `looks-good`
- `needs-edit`
- `blocked`
- `note`

Supported categories:

- `overall`
- `cut`
- `crop`
- `audio`
- `caption`
- `pace`
- `media`
- `tool`
- `other`

## Outcome summary rules

The editor outcome summary is guidance, not official truth.

- No notes means `no-editor-outcome-yet`.
- Any blocked note means `blocked`.
- Any needs-edit note means `needs-edit`, unless blocked exists.
- Any looks-good note means `looks-good`, unless blocked or needs-edit exists.
- Notes without a clear outcome mean `notes-only`.

Official review state should only change after actual watch/listen review and an explicit official ledger action.

## Native Studio UI target

The native app should eventually expose this as a simple review strip or sidebar panel:

- A text field labeled `Leave an editor note`.
- Four outcome buttons: `Looks good`, `Needs edit`, `Blocked`, `Note`.
- Category chips: `Cut`, `Crop`, `Audio`, `Caption`, `Media`, `Tool`.
- Auto-filled target from playhead time, selected decision, selected short, or selected lane.
- A visible list of notes for the current segment.
- A calm status line: `3 editor notes captured. Official review still pending.`

The native surface should not ask Mako to copy shell commands.

## Agent/Codex contract

Codex can use these notes to:

- Identify concrete Studio fixes.
- Improve crop, pacing, audio, caption, and source-wall UX.
- Build a second-pass edit plan.
- Draft a Tower readiness summary.
- Detect recurring friction in the editor.

Codex must not treat these notes as:

- Publication approval.
- A receipt.
- A completed official review.
- Canonical final quality proof.

## Current command bridge

Temporary CLI bridge while the native UI grows:

```bash
script/agentctl.sh episode1-mako-review-note [--dry-run] looks-good|needs-edit|blocked|note overall|cut|crop|audio|caption|pace|media|tool|other target "note text"
```

Example:

```bash
script/agentctl.sh episode1-mako-review-note needs-edit crop 01:02:30 "Face is too low in the vertical crop."
```

Current review surfaces:

```bash
script/agentctl.sh episode1-mako-review-brief --html
script/agentctl.sh episode1-current-next --html
```

## Validation gate

The latest executable changes should be validated before more script behavior is stacked on top:

```bash
python3 -m py_compile apps/QuipslyStudio/script/episode1_mako_review_brief.py apps/QuipslyStudio/script/episode1_current_next_fast.py
bash -n apps/QuipslyStudio/script/agentctl.sh
script/agentctl.sh episode1-mako-review-note --dry-run needs-edit crop 01:02:30 "Face is too low in the vertical crop."
script/agentctl.sh episode1-mako-review-brief --json
script/agentctl.sh episode1-current-next --json
```

Do not claim this validation has passed until it has actually been run.

## Lesson

Review complexity is acceptable only when it makes the creative work feel safer and calmer. If the reviewer has to understand the ledger to do a review, the UX has failed.
