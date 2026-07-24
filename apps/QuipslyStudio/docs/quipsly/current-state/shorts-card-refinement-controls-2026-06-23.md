# Shorts card refinement controls proof - 2026-06-23

## Scope

This pass makes the Shorts panel more directly usable as a creative workbench instead of a static list. Each short card now exposes the next useful actions in-place:

- Cue the short at its source moment.
- Preview the selected short.
- Export the selected short through the existing proxy-first selected-short path.
- Mark the short Keep, Refine, or Reject.
- Nudge In and Out points by 1.0s or 0.1s without leaving the card.

## Product invariant

Whole synced sources remain intact. These controls operate on short recipes, review state, and export commands. They do not mutate original media.

## Validation run

Command:

```sh
./script/build_and_run.sh --verify
```

Result: exited 0 on June 23, 2026.

Additional checks:

```sh
git diff --check -- Sources/SharedUI/WorkspaceView.swift
```

Result: exited 0.

Agent state after launch:

```json
{
  "agentServer": "ok",
  "sequenceTitle": "Episode 1 Premiere Rescue",
  "shortClipQueueCount": 13,
  "clipCount": 13,
  "selectedShortClipId": "",
  "lastShortExportProof": null,
  "lastShortExportSessionName": null
}
```

## Honest remaining gap

The running app can launch and expose the short queue. The live state did not report a current `lastShortExportProof` immediately after relaunch, so export-proof persistence remains a separate hardening target. Prior local export proof files still exist on Desktop, but this note only claims what this pass validated.

## Next useful target

Make the Shorts panel's selected-short detail and card language more publication-focused: clearer platform packaging, visible framing requirements, and safer export-state persistence after relaunch.
