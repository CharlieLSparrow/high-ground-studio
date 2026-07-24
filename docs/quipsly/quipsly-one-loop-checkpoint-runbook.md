# Quipsly One-Loop Checkpoint Runbook

Purpose: create one calm operator checkpoint for the active Episode 1 vertical slice across Nest, Studio, and Tower.

This checkpoint is not the whole product. It is the current proof ladder for one connected loop:

- Nest: writing/capture/context next action.
- Studio: editing/export next action.
- Tower: publishing/receipt next action.

## Default command

Run from the QuipslyStudio app folder after the native app is running and Episode 1 is loaded:

```bash
script/agentctl.sh vertical-slice-next-checkpoint /Users/wall-e/Movies/QuipslyExports/Episode1Tower episode1-one-loop-next
```

## Focused validation gate

Use this when the goal is to prove the checkpoint command path itself:

```bash
script/agentctl.sh vertical-slice-next-validation-gate /Users/wall-e/Movies/QuipslyExports/Episode1Tower episode1-one-loop-next
```

The validation gate checks:

- `agentctl.sh` shell syntax.
- one-loop checkpoint generation and smoke.
- one-loop checkpoint Markdown readback.

It writes:

```text
episode1-one-loop-next-validation-shell-syntax.txt
episode1-one-loop-next-validation-checkpoint-run.json
episode1-one-loop-next-validation-checkpoint-readback.md
episode1-one-loop-next-validation-gate.json
episode1-one-loop-next-validation-gate.md
latest-one-loop-next-validation-gate.json
START-HERE-ONE-LOOP-VALIDATION-GATE.md
```

It still does not prove live editor playback, exports, actual publication, external receipt authenticity, or manuscript canon.

Aliases:

```bash
script/agentctl.sh one-loop-next-checkpoint /Users/wall-e/Movies/QuipslyExports/Episode1Tower episode1-one-loop-next
script/agentctl.sh nest-studio-tower-next-checkpoint /Users/wall-e/Movies/QuipslyExports/Episode1Tower episode1-one-loop-next
```

## What it does

The checkpoint runs two smaller operations:

1. `vertical-slice-next-save`
2. `vertical-slice-next-smoke`

It saves current live app state into a portable handoff, then smoke-checks the saved handoff for the minimum structure and truth boundaries we need.

## Files it should create

Expected in `/Users/wall-e/Movies/QuipslyExports/Episode1Tower`:

```text
episode1-one-loop-next-state.json
episode1-one-loop-next-episode-spine.json
episode1-one-loop-next-publication-next-receipt.json
episode1-one-loop-next-one-loop-next.json
episode1-one-loop-next-one-loop-next.md
episode1-one-loop-next-checkpoint-save.json
episode1-one-loop-next-checkpoint-smoke.json
episode1-one-loop-next-checkpoint.json
episode1-one-loop-next-checkpoint.md
latest-one-loop-next.json
latest-one-loop-next-checkpoint.json
START-HERE-ONE-LOOP-NEXT.md
START-HERE-ONE-LOOP-CHECKPOINT.md
```

## Start here files

Use these first:

- `START-HERE-ONE-LOOP-CHECKPOINT.md`: human-readable checkpoint status, next actions, files, failed checks, and proof boundary.
- `latest-one-loop-next-checkpoint.json`: machine-readable checkpoint status.
- `START-HERE-ONE-LOOP-NEXT.md`: human-readable Nest, Studio, and Tower next action card.
- `latest-one-loop-next.json`: machine-readable Nest, Studio, and Tower next action card.

## What the checkpoint proves

The checkpoint proves only that the saved one-loop handoff artifact is structurally honest:

- It has the expected one-loop packet type.
- It includes a Nest next action.
- It includes a Studio next action.
- It includes a Tower next action.
- It links to the expected saved files.
- It includes the publication-proof boundary.
- It keeps the creative-partner policy visible.

## What it does not prove

Do not claim any of these from this checkpoint alone:

- Live editor playback works.
- Source monitors are synced.
- Exports are correct.
- A 16:9 episode is publishable.
- 9:16 shorts are publishable.
- Podcast audio is publishable.
- YouTube, Patreon, social, podcast hosting, or any platform has been posted.
- External receipt URLs are authentic.
- Manuscript text is canonical or human-reviewed.

The checkpoint is a map, not the territory. Useful map. Still a map.

## If it passes

Next operator move:

1. Open `START-HERE-ONE-LOOP-CHECKPOINT.md`.
2. Follow the listed Nest, Studio, and Tower next actions.
3. If the Tower action names a receipt row, post or schedule externally, then capture the receipt on the exact row.

## If it fails

Do not delete the failed artifacts.

1. Open `START-HERE-ONE-LOOP-CHECKPOINT.md`.
2. Read the failed checks.
3. Open `episode1-one-loop-next-checkpoint-smoke.json` for exact machine-readable failures.
4. Fix the generator or live app state.
5. Re-run the checkpoint.

The command is designed to preserve a failure report before exiting nonzero.

## Quick orientation without saving

Use this when you only need to read the current card:

```bash
script/agentctl.sh vertical-slice-next-markdown
```

## Durable handoff without checkpoint

Use this when you only need to save the handoff:

```bash
script/agentctl.sh vertical-slice-next-save /Users/wall-e/Movies/QuipslyExports/Episode1Tower episode1-one-loop-next
```

## Artifact smoke only

Use this after a handoff already exists:

```bash
script/agentctl.sh vertical-slice-next-smoke /Users/wall-e/Movies/QuipslyExports/Episode1Tower
```

## Product rule

Quipsly should reduce systems anxiety by making state visible and next actions small.

This checkpoint exists to prevent three bad outcomes:

- Local preparation being mistaken for publication.
- Agent-written work being hidden or treated as shameful instead of provenance-visible.
- Nest, Studio, and Tower drifting into separate silos.
