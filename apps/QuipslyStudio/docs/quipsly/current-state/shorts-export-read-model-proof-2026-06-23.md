# Shorts export read-model proof - 2026-06-23

## Scope

This pass makes the Shorts read model resolve export state from artifact truth, not only from the older recipe field.

`lastExportedShortPath(for:)` now falls back to the durable selected-short export request + manifest pointer when a short has no `Exported 9:16 short:` publish-note line. Shorts payloads now use `resolvedShortExportStatus(for:)`, so a verified existing export file appears as `exported` in agent and UI-facing payloads.

## Why it matters

A recipe can be older than an export receipt. If the file exists and the manifest proves which short produced it, the user should not see contradictory state like:

- `exportStatus: not-exported`
- `lastExportExists: true`

That contradiction creates systems anxiety. The read model now prefers verified artifact evidence.

## Validation run

Command:

```sh
./script/build_and_run.sh --verify
```

Result: exited 0.

Agent export used explicit short id to avoid queued-selection timing:

```http
GET /shorts_export_selected?directory=/Users/wall-e/Desktop/QuipslyShortsProof/persistence-smoke-20260623&basename=persistence-smoke-episode1-short13&id=8F4A6296-A542-49B5-A6AC-7D6A712474AA
```

Fresh app state after relaunch for Short 13:

```json
{
  "sequenceTitle": "Episode 1 Premiere Rescue",
  "short13QueuePayload": {
    "title": "Episode 1 Word-Timed Proof Short",
    "exportStatus": "exported",
    "lastExportedPath": "/Users/wall-e/Desktop/QuipslyShortsProof/persistence-smoke-20260623/persistence-smoke-episode1-short13-9x16-short.mp4",
    "lastExportExists": true,
    "reviewEvidenceStatus": "exported_derivative_ready",
    "nextSafeAction": "Review the exported derivative and mark keep, refine, or reject."
  }
}
```

## Agent ergonomics note

Chaining `script/agentctl.sh shorts-select index 13 && script/agentctl.sh shorts-export-selected ...` exported the previous selection because live selection had not caught up. The HTTP endpoint supports explicit `id`; the CLI should add explicit selected-short export arguments in a future pass.
