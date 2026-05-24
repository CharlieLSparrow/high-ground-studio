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

## Preview And Apply In The Web Cockpit

The Studio Cut web editor can import the same operation JSON through
`Import Agent Ops` in the Decision Events toolbar.

The browser does not apply the operations immediately. It opens an `Agent
Operation Preview` panel that shows:

- operation count
- add/remove count
- active decision count after apply
- tombstone count after apply
- human-readable operation summaries
- validation warnings and blocking errors

Use `Apply Agent Ops` only after the preview is sane. In cloud shared-room mode,
the applied operations upsert/tombstone decision events through the same
Firestore persistence path as normal edits. In local-only mode they stay in
localStorage. Either way, the source media and proxy files are untouched.

## Export Agent Context

Use `Export Agent Context` from the Decision Events toolbar when Codex or
another agent needs to inspect the current room without scraping the UI.

The exported JSON includes:

- project and branch room ids
- episode manifest metadata when loaded
- current source time and current state
- source-monitor proxy status without object URLs or local paths
- persistence mode and shared-room attachment status
- Sync Map/sync report summaries when available
- active and tombstoned decision events
- derived semantic segments
- readiness warnings
- the supported agent operation contract

This is the preferred web-to-agent handoff for live editing discussions. It is
still a decision-layer snapshot only: no media, proxy bytes, local filesystem
paths, or browser object URLs are exported.

## Agent Workflow

For a real editing pass:

1. Export Agent Context from the web cockpit, or run `agent-review-edit` from a
   decision JSON export.
2. Discuss the proposed operations with the human when the intent is ambiguous.
3. Write an operation JSON file.
4. Run `apply-decision-ops --dry-run`.
5. Apply the operations through `Import Agent Ops` in the browser or to a new
   decision file with `apply-decision-ops`.
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
- The web cockpit can preview/apply operation JSON, but agents still need a
  structured input such as transcript, source notes, or operator instructions
  before they can make high-quality creative choices.

## Next Agent-Friendly Steps

- Add transcript/speaker import so agents can propose edits from words, not only
  timestamps.
- Add review reports for awkward camera holds, long silence, repeated Cut spans,
  and missing Clip context.
- Add an episode workspace index that lists generated session files for local
  agents without exposing private absolute paths.
