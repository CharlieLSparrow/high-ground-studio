# Mako Episode 1 review brief

You are not being asked to operate a review bureaucracy. Watch the work, adjust or note what feels wrong, and let Quipsly keep the receipts underneath.

**North star:** Mako edits. Quipsly remembers. Codex learns. Tower proves.

## Current pass

- Segment: `segment-005` 1:00:00 - 1:14:04
- Action: Open the selected review handoff, watch/listen to the current segment, and record draft notes before touching the official ledger.
- Command: `script/agentctl.sh episode1-selected-review-handoff --html`

## Honest state underneath

- Official pending: `15`
- Official reviewed: `0`
- Draft entries: `0`
- Draft checks: `0` / `8`

## Editor outcome

- Status: `no-editor-outcome-yet`
- Recommendation: Do an editor pass first. Watch, listen, crop-check, then leave a plain-English outcome note.
- Mako notes: `0`
- Structured notes: `0`

## Editing pass steps

### Watch the selected segment in Program Output.

Treat this like an edit review. Does the episode feel watchable, coherent, and not weirdly paced?

### Check the 9:16 cut for face placement and caption safety.

If the crop puts words or faces in awkward places, leave a note instead of fighting the ledger.

### Listen for comfort, clipping, obvious level problems, or distracting noise.

Audio can pass even if it is imperfect; the question is whether a real viewer/listener will bounce.

### Drop notes where the tool slows you down.

Quipsly is learning the workflow too. If the editor makes review harder, that is a product bug.

### End with one outcome: looks good, needs edit, or blocked.

The system will translate that into official review state later. The human job is judgment.

## Suggested outcomes

- `Looks good`: The segment feels publishable from this pass.
- `Needs edit`: The content is usable but needs cut, crop, audio, caption, or pacing changes.
- `Blocked`: Something prevents fair review, such as missing media, wrong export, broken audio, or unusable playback.

## Mako editor notes captured so far

No Mako editor notes recorded yet.

## Safe commands

### openThisBrief

```bash
script/agentctl.sh episode1-mako-review-brief --html
```

### openFastBoard

```bash
script/agentctl.sh episode1-current-next --html
```

### openGuidedSession

```bash
script/agentctl.sh episode1-selected-review-session --html
```

### openWorksheet

```bash
script/agentctl.sh episode1-selected-review-worksheet --html
```

### addQuickNote

```bash
script/agentctl.sh episode1-mako-review-note note tool general "What I noticed while editing/reviewing."
```

### addCropNeedsEdit

```bash
script/agentctl.sh episode1-mako-review-note needs-edit crop 01:02:30 "Crop/framing note."
```

### addAudioNeedsEdit

```bash
script/agentctl.sh episode1-mako-review-note needs-edit audio 01:02:30 "Audio comfort note."
```

### addLooksGood

```bash
script/agentctl.sh episode1-mako-review-note looks-good overall segment-005 "Looks good from editor review."
```

### addBlocked

```bash
script/agentctl.sh episode1-mako-review-note blocked media segment-005 "Blocked because..."
```
