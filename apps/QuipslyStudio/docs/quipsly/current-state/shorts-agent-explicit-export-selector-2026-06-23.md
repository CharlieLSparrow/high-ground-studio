# Shorts agent explicit export selector - 2026-06-23

## Scope

`script/agentctl.sh shorts-export-selected` now supports explicit short selectors:

```sh
script/agentctl.sh shorts-export-selected /absolute/output/folder basename id SHORT_CLIP_ID
script/agentctl.sh shorts-export-selected /absolute/output/folder basename title "Short title"
script/agentctl.sh shorts-export-selected /absolute/output/folder basename index 13
```

This removes the race where an agent would run `shorts-select ... && shorts-export-selected ...` and the export could still use the previous cached selection before SwiftUI caught up.

## Validation

Syntax checks:

```sh
bash -n script/agentctl.sh
git diff --check -- script/agentctl.sh
```

Both exited 0.

Runtime proof:

```sh
script/agentctl.sh shorts-export-selected /Users/wall-e/Desktop/QuipslyShortsProof/persistence-smoke-20260623 persistence-smoke-cli-index-short13 index 13
```

Command receipt targeted the correct short:

```json
{
  "selectedShortId": "8F4A6296-A542-49B5-A6AC-7D6A712474AA",
  "selectedShortTitle": "Episode 1 Word-Timed Proof Short",
  "status": "direct_proxy_worker_started"
}
```

State proof after export:

```json
{
  "id": "8F4A6296-A542-49B5-A6AC-7D6A712474AA",
  "title": "Episode 1 Word-Timed Proof Short",
  "status": "exported",
  "exists": true,
  "path": "/Users/wall-e/Desktop/QuipslyShortsProof/persistence-smoke-20260623/persistence-smoke-cli-index-short13-9x16-short.mp4"
}
```

## Product effect

Agents can now export an exact short recipe without depending on visual selection timing. This supports the human/agent editing loop and keeps source media untouched.
