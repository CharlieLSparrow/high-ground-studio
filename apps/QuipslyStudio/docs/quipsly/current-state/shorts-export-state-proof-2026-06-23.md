# Shorts export state proof - 2026-06-23

## Scope

QuipslyStudio selected-short export now proves the app path, the proxy export worker, and the agent read model agree on one completed Episode 1 short export.

## Verified path

- App launch/build: `./script/build_and_run.sh --verify`
- Session: `Episode 1 Premiere Rescue`
- Agent server: `http://127.0.0.1:8080/state`
- Selected short: `Test Short - Wednesday Rule moment`
- Export command: `/shorts_export_selected`
- Output folder: `/Users/wall-e/Desktop/QuipslyShortsProof`

## Proof artifact

- MP4: `/Users/wall-e/Desktop/QuipslyShortsProof/codex-smoke-episode1-selected-20260623-015046-9x16-short.mp4`
- Manifest: `/Users/wall-e/Desktop/QuipslyShortsProof/codex-smoke-episode1-selected-20260623-015046-short-export-manifest.json`
- MP4 size: `982720` bytes
- Manifest status: `completed`
- Manifest source policy: `proxy-only; original media untouched`

## Agent state proof

After export, `/state` reported:

```json
{
  "sequenceTitle": "Episode 1 Premiere Rescue",
  "shortClipQueueCount": 13,
  "selectedShortClipId": "FC28A75E-451B-4D74-9636-2E842805F106",
  "selectedTitle": "Test Short - Wednesday Rule moment",
  "exportStatus": "completed",
  "exportOutputPaths": [
    "/Users/wall-e/Desktop/QuipslyShortsProof/codex-smoke-episode1-selected-20260623-015046-9x16-short.mp4"
  ],
  "selectedExportStatus": "exported",
  "selectedLastExportedPath": "/Users/wall-e/Desktop/QuipslyShortsProof/codex-smoke-episode1-selected-20260623-015046-9x16-short.mp4",
  "selectedLastExportExists": true
}
```

## Why this matters

Before this fix, the Python worker could produce a real short, but the editor control surface still reported stale export state. That made the workflow unsafe for humans and agents because a successful export looked like an idle or old export.

The current fix reconciles the worker manifest into the agent-facing read model so `exportStatus`, `exportOutputPaths`, `selectedShortProof`, and `selectedShortClip` all reflect the real completed artifact.

## Current limitation

This proves one selected Episode 1 proxy short export. The broader goal still requires more shorts quality work, clearer refinement UX, and repeated proof across Episodes 1-3 as their media sessions become ready.
