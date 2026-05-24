# Studio Cut Agentic Editing

Studio Cut should be friendly to the current Codex CLI, not dependent on a
future specialized model. The tool should expose enough structured state and
safe commands that an agent can inspect, propose, apply, verify, and roll back
semantic edits with human-readable evidence.

## Principle

Agents edit the decision layer, not source media.

The agent-facing contract stays narrow:

```text
Episode Manifest + Decision JSON + optional Sync Map
-> agent review report
-> transparent operation JSON
-> new Decision JSON
-> render/verify
```

Full-resolution media stays local. Source-monitor proxies are derived or
uploaded only through the explicit shared-room/package flows. `Cut` remains an
inactive/skipped semantic state, not deletion.

## Review A Decision Pass

Run:

```bash
python tools/studio-cut-local/studio_cut_local.py agent-review-edit \
  --manifest path/to/episode-manifest.json \
  --decisions path/to/studio-cut-decisions.json \
  --out path/to/agent-edit-review.json
```

The report includes:

- active and tombstoned decision counts
- derived segment counts
- active and Cut duration
- state duration totals
- warnings such as no initial decision or Clip states without Clip pane metadata
- agent review tasks with suggested operation shapes when safe
- the exact supported operation contract

Agents should read this report before editing and cite the specific warnings or
tasks they intend to address in their response or handoff note.

## Apply Agent Decision Operations

Create an operation file:

```json
{
  "schemaVersion": 1,
  "operations": [
    {
      "op": "addDecision",
      "sourceTimeMs": 0,
      "state": "both",
      "note": "Initial state after review."
    },
    {
      "op": "removeDecision",
      "id": "decision-id-to-tombstone",
      "reason": "Operator asked to restore this span."
    }
  ]
}
```

Dry-run first:

```bash
python tools/studio-cut-local/studio_cut_local.py apply-decision-ops \
  --manifest path/to/episode-manifest.json \
  --decisions path/to/studio-cut-decisions.json \
  --ops path/to/agent-ops.json \
  --out path/to/studio-cut-decisions.agent-edited.json \
  --created-by codex-agent \
  --dry-run
```

Then write a new decision file:

```bash
python tools/studio-cut-local/studio_cut_local.py apply-decision-ops \
  --manifest path/to/episode-manifest.json \
  --decisions path/to/studio-cut-decisions.json \
  --ops path/to/agent-ops.json \
  --out path/to/studio-cut-decisions.agent-edited.json \
  --created-by codex-agent
```

The input decision file is never mutated. Remove operations tombstone decisions
with `removedAt`, `removedBy`, and `operation=remove`, so the edit remains
auditable and reversible.

## Agent Workflow

For a real editing pass:

1. Run `agent-review-edit`.
2. Discuss the proposed operations with the human when the intent is ambiguous.
3. Write an operation JSON file.
4. Run `apply-decision-ops --dry-run`.
5. Apply the operations to a new decision file.
6. Run `plan-render` or `render-rescue-sync-session --dry-run`.
7. Keep the previous decision JSON or checkpoint as rollback.

This lets an agent do real editing work while keeping every mutation visible as
plain JSON and every result verifiable by command.

## Current Limits

- Agents still need human judgment for content taste, rhythm, and clip choice.
- Operation support is intentionally small: add decisions and tombstone
  decisions.
- There is not yet automatic transcript-aware editing or silence/filler-word
  detection.
- Cloud shared-room agent operations are not automated yet; use exported
  checkpoint JSON as the durable handoff for now.

## Next Agent-Friendly Steps

- Add transcript/speaker import so agents can propose edits from words, not only
  timestamps.
- Add review reports for awkward camera holds, long silence, repeated Cut spans,
  and missing Clip context.
- Add web import for operation JSON so human operators can preview/apply agent
  edits inside Studio Cut.
- Add an assistant-visible episode workspace manifest that lists every local
  generated file without exposing private absolute paths.
