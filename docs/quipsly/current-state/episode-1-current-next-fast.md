# Episode 1 current-next fast board

This fast board reads cached Quipsly truth artifacts only. It does not refresh evidence, mutate review ledgers, approve media, canonize writing, publish, upload, schedule, or capture receipts.

**UX principle:** Mako edits. Quipsly remembers. Codex learns. Tower proves.

## Recommended next action

- Lens: `Studio`
- Status: `selected-segment-needs-real-review`
- Action: Open the selected review handoff, watch/listen to the current segment, and record draft notes before touching the official ledger.
- Why: The official ledger is still pending and the durable draft review packet is incomplete.
- Command: `script/agentctl.sh episode1-selected-review-handoff --html`

## Selected review state

- Segment: `segment-005` 1:00:00 - 1:14:04
- Official pending: `15`
- Official reviewed: `0`
- Official issues: `0`
- Draft entries: `0`
- Draft checks: `0` / `8`
- Draft answers: `0` / `5`
- Draft ready for official ledger consideration: `False`

## Mako editor outcome

- Status: `no-editor-outcome-yet`
- Recommendation: Open the Mako review brief and capture an editor-shaped note after actual review.
- Notes: `0`

## Lane actions

- `Nest` / `live-nest-ingest-verified-needs-human-review`: Inspect the Nest queue and either approve live ingest or revise the v2 candidate before canon claims.
  `script/agentctl.sh episode1-writing-nest-queue --json`
- `Studio` / `tail-candidate-selected-needs-watch-listen-review`: Open the selected review handoff, then use it to enter the guided session, record durable draft responses, and only then consider the official review ledger command.
  `script/agentctl.sh episode1-selected-review-handoff --html`
- `Tower` / `review-ready-not-publication-ready`: Review destination-specific copy
  `script/agentctl.sh episode1-publication-action-queue --json`
- `Agent` / `command-surfaces-growing-needs-runtime-proof`: Use this generated brief as the first coordination checkpoint; prove runtime behavior only when validation is intentionally run.
  `script/agentctl.sh episode1-vertical-slice-brief --json`

## Freshness

- `verticalSliceBrief`: `loaded` · `13h 54m` · `/Users/wall-e/Dev/high-ground-studio/docs/quipsly/current-state/episode-1-vertical-slice-brief.json`
- `selectedReviewHandoff`: `loaded` · `13h 28m` · `/Users/wall-e/Dev/high-ground-studio/docs/quipsly/studio-proof/episode-1-selected-review-handoff.json`
- `selectedReviewDraft`: `loaded` · `13h 28m` · `/Users/wall-e/Dev/high-ground-studio/docs/quipsly/studio-proof/episode-1-selected-review-session-draft.json`
- `selectedReviewProgress`: `loaded` · `13h 54m` · `/Users/wall-e/Dev/high-ground-studio/docs/quipsly/studio-proof/episode-1-selected-watch-review-progress.json`

## Safe commands

### openFastBoard

```bash
script/agentctl.sh episode1-current-next --html
```

### readFastJson

```bash
script/agentctl.sh episode1-current-next --json
```

### openMakoReviewBrief

```bash
script/agentctl.sh episode1-mako-review-brief --html
```

### addMakoEditorNote

```bash
script/agentctl.sh episode1-mako-review-note needs-edit crop 01:02:30 "Crop/framing note."
```

### openHandoff

```bash
script/agentctl.sh episode1-selected-review-handoff --html
```

### openGuidedSession

```bash
script/agentctl.sh episode1-selected-review-session --html
```

### openWorksheet

```bash
script/agentctl.sh episode1-selected-review-worksheet --html
```

### openDraftResponses

```bash
script/agentctl.sh episode1-selected-review-session-draft --html
```

### refreshFullEvidence

```bash
script/agentctl.sh episode1-vertical-slice-refresh && script/agentctl.sh episode1-current-next --html
```

### officialLedgerCommandAfterActualReview

```bash
script/agentctl.sh episode1-selected-watch-review-mark all:segment-005 reviewed "Reviewer Name" "Actually watched/listened to 1:00:00 - 1:14:04 across selected artifacts; quality flags reviewed."
```

## Blocked claims

- Do not call Episode 1 artifact-ready until selected watch/listen review is complete.
- Do not claim artifact-ready until all required review items are reviewed and final watch/listen decision is recorded.
- Do not claim artifact-ready until watch/listen review is completed against the selected artifact set.
- Do not claim canon approval until the review ledger records it.
- Do not claim live Nest ingestion until a live receipt proves it.
- Do not claim publication readiness until Studio review, destination copy, writing/canon state, selected shorts, queue state, and receipt targets are reviewed.
- Do not claim publication-ready until Tower destination copy, schedule, and receipt targets are reviewed.
- Do not claim publication-ready until artifact review is completed.
- Do not claim publication-ready until destination copy, writing/canon state, selected shorts, schedule/queue state, and receipt targets are reviewed.
- Do not claim published until external URLs or provider ids are captured as receipts.
- Do not claim published until external URLs or provider ids are captured.
- Do not claim published until external receipt proof exists.
- Do not claim published until external receipts exist.
- Do not hide that the current candidate is agent-authored.
- Do not rely on chat memory when a packet or command can expose current state.
- Do not split Nest, Studio, and Tower into disconnected silos.
- Do not treat candidate generation, machine sanity, contact sheets, or this handoff packet as approval.
- Do not treat command discoverability as runtime proof.
- Do not treat draft responses as official review ledger mutations.
- Full-length Episode 1 artifacts have metadata proof, but real watch/listen review is still needed.
