# Native Editor Visual Proof Checklist

Last updated: 2026-06-18

Use this after the nature/zen redesign pass. The goal is not just to prove Swift compiles; the goal is to prove a human editor and Codex can understand and operate the real app window.

## Launch proof

Run only when validation is explicitly requested:

```bash
cd /Users/wall-e/Dev/high-ground-studio/apps/QuipslyStudio
./script/build_and_run.sh --verify
```

Then inspect the real app window, not just terminal output.

## First-screen proof

The first screen should answer these questions within five seconds:

- What episode/session am I editing?
- What is the Program Output showing?
- Where are my whole synced sources?
- Where is the Episode Trail Map?
- What mode am I in: Play Edit or Play Through?
- Is media proxy-safe, missing, protected, or held?
- What is the next safe action?

## Visual layout checks

Check these surfaces in the visible Mac app:

- Masthead: warm, compact, not stealing vertical space.
- Monitor Wall / Program Output: visually dominant enough to feel like the star.
- Source Grove: right-side cards readable; no clipped words in buttons or badges.
- Workbench: left sidebar labels fit, selected tab is obvious, helper text does not crush controls.
- Episode Trail Map: SHOW, SKIP, source lanes, playhead, and selected decision are understandable without neon chaos.
- Transport: `Play Edit [Space]` and `Play Through [T]` are visible and not duplicated.
- Shorts: a short recipe clearly shows whether it has one segment or multiple ordered segments.
- Ship: release cockpit and platform proof checklist fit without looking like a server console.

## Behavioral smoke checks

Use Episode 1 as the canonical proof lane unless explicitly testing another episode.

- Scrub the Episode Trail Map; Program Output and Source Grove should follow the same playhead.
- Two-finger scroll over Program Output should move the shared playhead, not a private player state.
- Pinch or zoom controls should make edit decisions easier to inspect, not just enlarge chaos.
- Click a SHOW/SKIP decision; selected detail should explain what it affects.
- Click a source card; it should inspect the whole source lane, not imply a chopped clip.
- Press Space; Play Edit should skip gaps.
- Press T or the Play Through control; Play Through should follow source time.
- Use a source-card SHOW/SKIP action; it should create metadata over the lane, not cut source media.

## Codex accessibility proof

Agent surfaces should remain available after visual cleanup:

- `quipsly.editor.masthead`
- `quipsly.editor.monitorWall`
- `quipsly.editor.transport`
- `quipsly.editor.timeline`
- `quipsly.sourceWall` legacy handle for the human-facing Source Grove
- `quipsly.ship.cockpit`
- `quipsly.ship.platformProofChecklist`

If a control is visually renamed, preserve or intentionally migrate its semantic identifier in the same patch.

## Failure language

If something fails, report it in product terms:

- `compile failure`: Swift cannot build.
- `layout failure`: UI clips, hides, or visually overwhelms key information.
- `semantic failure`: labels imply clips/cuts/destructive behavior instead of whole lanes/decisions.
- `sync failure`: playhead, Program Output, Source Grove, and timeline drift apart.
- `agent failure`: Codex cannot observe or trigger the same action a human can.

Do not call the redesign done until the real app passes both visual and behavioral proof.

## Added proof target - shared spine gestures

After the 2026-06-18 shared playhead hardening pass, verify these specific state fields in the agent `/state` output:

- `timelineGestureModel`
- `programScrollModel`
- `timelinePixelsPerSecond`
- `timelineFitToWindow`
- `sourceSyncProof.sequenceDuration`
- `sourceSyncProof.boundedPlayhead`
- `sourceSyncProof.samples[].sourcePlayerDeltaSeconds`

A visual pass is not enough. The app must prove that the Program Output, Source Grove, timeline, and agent state are all describing the same playhead.
