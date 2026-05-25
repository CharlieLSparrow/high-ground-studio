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

If a timed transcript is available, include it:

```bash
python tools/studio-cut-local/studio_cut_local.py agent-review-edit \
  --manifest path/to/episode-manifest.json \
  --decisions path/to/studio-cut-decisions.json \
  --transcript path/to/episode-transcript.json \
  --out path/to/agent-edit-review.json \
  --out-ops path/to/agent-suggested-ops.json
```

The report includes:

- active and tombstoned decision counts
- derived segment counts
- active and Cut duration
- state duration totals
- optional transcript coverage, speaker durations, clip-reference counts, and
  filler marker counts
- warnings such as no initial decision or Clip states without Clip pane metadata
- agent review tasks with suggested operation shapes when safe
- the exact supported operation contract

Agents should read this report before editing and cite the specific warnings or
tasks they intend to address in their response or handoff note.

Transcript JSON uses canonical episode/source time:

```json
{
  "schemaVersion": 1,
  "episodeId": "episode-004",
  "segments": [
    {
      "id": "transcript-001",
      "startSourceTimeMs": 0,
      "endSourceTimeMs": 12000,
      "speaker": "Charlie",
      "speakerRole": "charlie",
      "text": "Let's look at the clip on screen."
    }
  ]
}
```

With a transcript, `agent-review-edit` can flag speaker/state mismatches, likely
clip-reference moments, transcript gaps, and filler clusters. When `--out-ops`
is provided, safe suggestions are also written as operation JSON. Clip and
speaker-focus suggestions are point decisions. Transcript gaps and filler
clusters can become bounded `setRangeState` suggestions with confidence,
`approvalRequired`, and a plain-language reason. They still only suggest
semantic operations; a human or agent must review before applying.

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
      "note": "Initial state after review.",
      "confidence": 0.8,
      "approvalRequired": true,
      "reason": "Opening state is missing."
    },
    {
      "op": "setRangeState",
      "startSourceTimeMs": 120000,
      "endSourceTimeMs": 126000,
      "state": "cut",
      "restoreState": "both",
      "note": "Transcript gap; verify before cutting inactive/silent span.",
      "confidence": 0.45,
      "approvalRequired": true,
      "reason": "Transcript gap may indicate silence, missing transcript, or sync drift."
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

The input decision file is never mutated. `setRangeState` creates a decision at
the range start and, when possible, a restore decision at the range end. Remove
operations tombstone decisions with `removedAt`, `removedBy`, and
`operation=remove`, so the edit remains auditable and reversible.

## Preview And Apply In The Web Cockpit

The Studio Cut web editor can import the same operation JSON through
`Import Agent Ops` in the Decision Events toolbar.

The browser does not apply the operations immediately. It opens an `Agent
Operation Preview` panel that shows:

- operation count
- add/range/remove count
- approval-required count
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
- imported timed transcript segments and transcript-review diagnostics when
  available
- active and tombstoned decision events
- derived semantic segments
- readiness warnings
- the supported agent operation contract

This is the preferred web-to-agent handoff for live editing discussions. It is
still a decision-layer snapshot only: no media, proxy bytes, local filesystem
paths, or browser object URLs are exported.

## Browser Transcript Review

Use `Import Transcript JSON` in the Episode Manifest area when a timed
transcript is available. The browser validates the same transcript shape used by
the CLI, stores it only in local browser storage, and shows a compact
`Transcript Review` panel with coverage, word count, clip-reference count,
filler count, warnings, and agent-review tasks.

Those diagnostics are included in `Export Agent Context`, so Codex can review a
live room with manifest, decisions, transcript, and current derived segments in
one media-safe JSON file. The transcript import does not upload media, local
paths, object URLs, or source-monitor proxy bytes.

`Export Suggested Ops` writes an agent operation JSON draft from transcript
review tasks that have safe semantic suggestions, such as likely clip-reference
or speaker-focus corrections. It does not apply anything. Re-import that file
with `Import Agent Ops` to preview the proposed mutations before accepting them.

## Agent Workflow

For a real editing pass:

1. Import a timed transcript in the web cockpit if one exists.
2. Export Agent Context from the web cockpit, or run `agent-review-edit` from a
   decision JSON export.
3. Discuss the proposed operations with the human when the intent is ambiguous.
4. Write an operation JSON file, or use `Export Suggested Ops` as a draft from
   browser transcript review.
5. Run `apply-decision-ops --dry-run`.
6. Apply the operations through `Import Agent Ops` in the browser or to a new
   decision file with `apply-decision-ops`.
7. Run `plan-render` or `render-rescue-sync-session --dry-run`.
8. Keep the previous decision JSON or checkpoint as rollback.

This lets an agent do real editing work while keeping every mutation visible as
plain JSON and every result verifiable by command.

## Local Workspace Index

For local Rescue Sync sessions, agents can inspect the episode folder through a
sanitized index instead of reading private absolute paths from chat:

```bash
python tools/studio-cut-local/studio_cut_local.py agent-workspace-index \
  --episode-dir path/to/episode-workspace \
  --out path/to/episode-workspace/generated/agent-workspace-index.json
```

The index lists inbox roles, generated package files, likely decision export
locations, readiness flags, share URL, and command templates. Paths are relative
to `<episode-workspace>` and local filesystem roots are intentionally omitted.
Use it when handing a local Episode 4 workspace to Codex or another agent.

## One-Command Agent Edit Session

After a local Rescue Sync workspace has a generated manifest and an exported
decision JSON, run:

```bash
python tools/studio-cut-local/studio_cut_local.py agent-edit-session \
  --episode-dir path/to/episode-workspace
```

The command finds the standard workspace files, writes a fresh sanitized
`generated/agent-workspace-index.json`, runs `agent-review-edit`, writes
`generated/agent-edit-review.json`, writes
`generated/agent-suggested-ops.json`, and produces a concise
`generated/agent-edit-session.md` rationale for a human or agent to inspect.

If a transcript exists at `edit/<episode-id>-transcript.json`,
`edit/episode-transcript.json`, `edit/transcript.json`, or the matching
`generated/` names, the session includes transcript-aware review automatically.
Use `--transcript path/to/transcript.json` to override discovery.

Add `--write-preview-decisions` to write
`edit/<episode-id>-agent-preview-decisions.json`. That file applies suggested
operations to a copy of the current decision export; it does not mutate the
original. Treat it as a preview/checkpoint until a human accepts it or imports
the operation JSON in the browser cockpit.

## Current Limits

- Agents still need human judgment for content taste, rhythm, and clip choice.
- Operation support is intentionally small: add point decisions, set bounded
  ranges to a state with optional restore, and tombstone decisions.
- Transcript-aware review is heuristic. It can flag speaker/state mismatches,
  clip references, gaps, and filler clusters, but it does not yet understand
  story quality or comedic timing.
- The web cockpit can preview/apply operation JSON, but agents still need
  source notes or operator instructions before they can make high-quality
  creative choices.

## Next Agent-Friendly Steps

- Add stronger review reports for awkward camera holds, long silence, repeated
  Cut spans, and missing Clip context.
- Teach the one-command agent edit session to include Sync Map render QA and
  transcript/proxy screenshots when those artifacts exist.
