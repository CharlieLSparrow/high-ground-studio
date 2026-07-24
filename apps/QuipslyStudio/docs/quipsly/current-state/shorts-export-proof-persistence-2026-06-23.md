# Shorts export proof persistence - 2026-06-23

## Scope

This pass hardens selected-short export evidence so it survives app relaunch. The direct agent export path now persists the last selected-short export request pointer in both:

- `UserDefaults` under `quipsly.agent.lastDirectProxyShortExportRequestPath`
- Quipsly MediaVault pointer file: `~/Library/Application Support/Quipsly/MediaVault/exports/export-requests/last-selected-short-export-request-path.txt`

The export proof itself still comes from the app-owned proxy export request and manifest. The pointer only lets the freshly launched app find that proof again.

## Product invariant

Original media remains untouched. This persistence stores proof metadata and request/manifest pointers only.

## Validation run

Command:

```sh
./script/build_and_run.sh --verify
```

Result: exited 0 before and after the selected-short export smoke.

Agent workflow:

```sh
script/agentctl.sh shorts-select index 1
script/agentctl.sh shorts-export-selected /Users/wall-e/Desktop/QuipslyShortsProof/persistence-smoke-20260623 persistence-smoke-episode1-short1
./script/build_and_run.sh --verify
```

Fresh app state after relaunch:

```json
{
  "sequenceTitle": "Episode 1 Premiere Rescue",
  "shortClipQueueCount": 13,
  "lastShortExportSessionName": "episode-1-codex-real-edit-v1-youtube-wordtimed",
  "lastShortExportProof": {
    "id": "FC28A75E-451B-4D74-9636-2E842805F106",
    "title": "Test Short - Wednesday Rule moment",
    "exportStatus": "exported",
    "lastExportedPath": "/Users/wall-e/Desktop/QuipslyShortsProof/persistence-smoke-20260623/persistence-smoke-episode1-short1-9x16-short.mp4",
    "lastExportExists": true,
    "lastExportManifestPath": "/Users/wall-e/Desktop/QuipslyShortsProof/persistence-smoke-20260623/persistence-smoke-episode1-short1-short-export-manifest.json",
    "lastExportCompletedAt": "2026-06-23T09:55:13.927037Z"
  },
  "exportState": {
    "status": "completed",
    "isExporting": false
  }
}
```

Pointer file proof:

```text
/Users/wall-e/Library/Application Support/Quipsly/MediaVault/exports/export-requests/79EE4F30-6363-471F-9F54-5D75F895A25A/selected-short-export-request.json
```

## Remaining useful target

Bring the same receipt-style clarity into the human Shorts panel: show durable export proof and platform packaging in the card/detail UI without requiring the agent JSON view.
