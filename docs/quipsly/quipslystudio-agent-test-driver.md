# QuipslyStudio Agent Test Driver

Status: active production-editor infrastructure
Last updated: 2026-06-18
Canonical app: `/Users/wall-e/Dev/high-ground-studio/apps/QuipslyStudio`

## Why this exists

QuipslyStudio is being built for two editors at once:

- a human editor who needs a calm, fast, visual, keyboard-friendly creative tool
- an agent editor, including Codex, that needs direct, inspectable control without guessing from pixels

The Agent Test Driver is the bridge. It is not a secret bypass around the user experience. It is a formal control plane that exposes the same editorial concepts the UI exposes: observe, scrub, zoom, select decisions, switch output format, inspect source monitors, create metadata decisions, queue shorts, export, and prepare publication packets.

This lets Codex edit with the tool instead of only editing the tool.

## Product doctrine

- Whole synced source lanes stay intact.
- SHOW, SKIP, source windows, short recipes, crop/reframe settings, transcripts, and publish receipts are metadata over the source spine.
- Premiere imports can provide source clues, but Quipsly program decisions are explicit Quipsly decisions.
- Overlapping source lanes do not mean `Both` unless the editor explicitly creates a two-up/stacked layout decision.
- Agent actions should leave receipts: before state, command, after state, and human-readable summary.
- Agent controls should be useful to humans too: keyboard shortcuts, accessibility actions, command palette actions, and test-driver actions should share the same editor command model where practical.

## Current proof commands

From `apps/QuipslyStudio`:

```bash
./script/build_and_run.sh --verify
./script/studioctl.sh prove-program-scroll
./script/studioctl.sh prove-timeline-drag
./script/studioctl.sh prove-agent-test-driver
```

Current proof status on 2026-06-18:

- `prove-program-scroll`: passed earlier in this run. Physical scroll over Program Output moved the shared playhead while source sync stayed passing.
- `prove-timeline-drag`: passed. Physical drag over the Episode Spine ruler scrub surface moved playhead from `0.0s` to `37.9s` while source sync stayed passing.
- `prove-agent-test-driver`: passed. Codex/agent commands loaded Episode 1, changed timeline zoom to `80 px/sec`, scrubbed near `42s`, selected a real video decision, opened the shorts workbench, switched to `9:16`, and verified shared source sync stayed passing.

## What the Agent Test Driver should become

The mature driver should support four loops.

### 1. Observe

Return a structured snapshot of what a human editor can see and what an agent needs to act safely:

- active session and episode
- source lanes and proxy readiness
- current playhead and output format
- Program Output truth
- selected lane/decision/short/transcript segment
- source monitor wall state
- delivery/export/publishing readiness
- safe next actions

### 2. Act

Expose semantic editing commands, not fragile screen coordinates:

- scrub/seek/play/pause/play edit/play through
- zoom timeline, fit whole episode, fine tune
- select next/previous/at-playhead decision
- switch selected decision to Charlie, Homer, Both, Skip, Charlie+Clip, Homer+Clip
- add/trim/nudge/delete SHOW/SKIP metadata decisions
- create/update short recipes, including multi-segment shorts
- adjust crop/reframe baseline or keyframes
- export proof clips, 16:9 masters, 9:16 shorts, and audio masters
- generate publication packets and receipt checklists

### 3. Re-observe

Every meaningful action should re-read state and compare expected vs actual:

- did the playhead move?
- did selected decision change?
- did decision counts change when expected?
- did source sync remain passing?
- did export state or publication readiness update?
- did the command affect metadata only, not source media?

### 4. Explain

The driver should produce human-readable receipts:

- what Codex saw
- what Codex changed
- why it was safe
- what still needs human review
- what can be undone or refined

## Near-term build targets

1. Make `prove-agent-test-driver` save before/after proof packets, not only print a summary.
2. Add an in-app Agent Driver panel that shows recent agent actions and the exact state diffs they caused.
3. Make every keyboard shortcut and button route through named editor commands where possible.
4. Add an editorial-run mode: Codex can intentionally create an original Quipsly edit for Episode 1, with logged decisions and review checkpoints.
5. Add an agent-accessibility map for the current UI: named regions, hitboxes, semantic actions, and fallback commands.
6. Use this layer for dogfooding: when Codex struggles to edit, improve the editor or driver until the struggle is removed.

## Why this matters for ML later

If we want Quipsly to learn how Mako, Charlie, Homer, or Codex edits, we need action data that is structured and inspectable. The Agent Test Driver creates that shape naturally:

- observe state
- choose action
- apply metadata change
- compare output
- human accepts, adjusts, or rejects

That is an editing annotation system, not just a UI automation trick.

## 2026-06-18 receipt upgrade

`prove-agent-test-driver` now saves a durable proof packet, not only a terminal summary.

Default command:

```bash
./script/studioctl.sh prove-agent-test-driver episode-1-codex-original-edit
```

Default receipt folder:

```text
apps/QuipslyStudio/.quipsly/agent-observations/
```

Each proof run writes:

- `*-before.json`: observed editor state before agent actions.
- `*-after.json`: observed editor state after agent actions.
- `*-commands.json`: semantic commands executed and their output paths.
- `*-summary.json`: compact human-readable pass/fail receipt.

This is the product pattern going forward: agent actions should leave inspectable receipts. If Codex edits, exports, reviews shorts, or prepares publication packets, it should be able to show what it saw, what it changed, why it was safe, and what still needs human review.
