# Native Editor Agent Surface Map

Last updated: 2026-06-18

This file describes the semantic UI handles that should let Codex or another Quipsly agent operate the native editor without guessing from pixels.

## Operating rule

Agents should use the same product model as humans:

- One shared episode spine.
- Whole synced source lanes.
- SHOW/SKIP edit decisions as metadata.
- 16:9 episode, 9:16 shorts, and podcast audio as separate output families.
- Receipts and state over vibes.

The agent loop is:

1. Observe editor state.
2. Identify selected source, selected decision, playhead, playback mode, output format, and readiness.
3. Perform one safe semantic action.
4. Re-observe before making another claim.

## Core surface identifiers

These identifiers should remain stable or be migrated intentionally:

- `quipsly.editor.masthead`: current session title, active output format, media readiness, and now-playing summary.
- `quipsly.editor.sessionMission`: high-level production mission strip.
- `quipsly.editor.monitorWall`: Program Output plus synced source context.
- `quipsly.editor.transport`: Playhead and playback controls.
- `quipsly.editor.timeline`: Episode spine map.
- `quipsly.editor.releaseMap`: output readiness across episode, shorts, podcast, and publishing receipts.
- `quipsly.editor.productionDock`: import, sync, focus, build, and publish actions.
- `quipsly.sourceWall`: all synced source cards.
- `quipsly.ship.cockpit`: release cockpit inside the Ship workbench, summarizing output families, target counts, receipt counts, status, and next action.
- `quipsly.ship.platformProofChecklist`: platform-by-platform proof checklist inside Ship. Use it to see exactly which destination still needs an artifact, copy review, upload/schedule handoff, or receipt proof.
- `quipsly.ship.platformProof.copyJSON`: copies the structured release cockpit JSON for Codex, automation, or another publishing helper without mutating publication state.
- `quipsly.ship.platformProof.copyChecklist`: copies a portable proof checklist for humans, Codex, or another publishing helper without mutating publication state.
- `quipsly.ship.platformProof.copyMissing`: copies missing platform receipt instructions and capture commands without mutating publication state.
- `quipsly.ship.platformProof.refreshLedger`: refreshes platform publish records from current exported artifacts without uploading or publishing.

## Transport handles

Primary transport controls:

- `quipsly.transport.back5`
- `quipsly.transport.playEdit`
- `quipsly.transport.playThrough`
- `quipsly.transport.forward5`
- `quipsly.transport.outputFormat`

Transport status pills:

- `quipsly.transport.status.spine`
- `quipsly.transport.status.program`
- `quipsly.transport.status.space`
- `quipsly.transport.status.t`
- `quipsly.transport.status.1-6`
- `quipsly.transport.status.k`

Output route handles:

- `quipsly.transport.outputRoutes`
- `quipsly.transport.outputRoute.16x9episode`
- `quipsly.transport.outputRoute.9x16shorts`
- `quipsly.transport.outputRoute.podcastaudio`

## Source Grove handles

Each source card should expose:

- `quipsly.sourceWall.card.<laneId>`
- `quipsly.sourceWall.intent.<laneId>`
- `quipsly.sourceWall.showNext10.<laneId>`
- `quipsly.sourceWall.skipNext10.<laneId>`
- `quipsly.sourceWall.attachProxy.<laneId>`
- `quipsly.sourceWall.relink.<laneId>`

Agents should prefer source-grove actions when writing quick SHOW/SKIP spans because those actions preserve the whole-lane model.

Source Grove card copy may change as the design gets calmer, but card identifiers and source intent identifiers should remain stable. Treat each card as a whole synced source, not a clip object.

## Episode Trail Map handles

Timeline root and guidance:

- `quipsly.timeline.root`
- `quipsly.timeline.noSelectionGuide`

Precision editing controls:

- `quipsly.timeline.precision.prev`
- `quipsly.timeline.precision.next`
- `quipsly.timeline.precision.minus1s`
- `quipsly.timeline.precision.commaminus0point1`
- `quipsly.timeline.precision.pointplus0point1`
- `quipsly.timeline.precision.plus1s`
- `quipsly.timeline.precision.qstartminus0point1`
- `quipsly.timeline.precision.wstartplus0point1`
- `quipsly.timeline.precision.oendminus0point1`
- `quipsly.timeline.precision.pendplus0point1`
- `quipsly.timeline.precision.deleteMetadata`

If any identifier changes, update this file in the same patch as the UI change.

## Release readiness handles

Release map:

- `quipsly.releaseMap.productionPath`
- `quipsly.releaseMap.outputFamilies`
- `quipsly.releaseMap.truthLadder`
- `quipsly.releaseMap.truth.edit`
- `quipsly.releaseMap.truth.build`
- `quipsly.releaseMap.truth.upload`
- `quipsly.releaseMap.truth.schedule`
- `quipsly.releaseMap.truth.prove`
- `quipsly.releaseMap.nextSafeAction`
- `quipsly.releaseMap.openShipWorkbench`
- `quipsly.releaseMap.focusTrailMap`
- `quipsly.releaseMap.episode-16x9-master`
- `quipsly.releaseMap.social-short-clips`
- `quipsly.releaseMap.podcast-audio-master`
- `quipsly.releaseMap.channel-publishing`

Readiness legend:

- `quipsly.releaseMap.readinessLegend`
- `quipsly.releaseMap.readiness.draft`
- `quipsly.releaseMap.readiness.review`
- `quipsly.releaseMap.readiness.export`
- `quipsly.releaseMap.readiness.published`
- `quipsly.releaseMap.readiness.attention`

Typed publish receipt counts:

- `quipsly.releaseMap.publishReadinessCounts`
- `quipsly.releaseMap.publishReadinessCount.draft`
- `quipsly.releaseMap.publishReadinessCount.readyToReview`
- `quipsly.releaseMap.publishReadinessCount.readyToExport`
- `quipsly.releaseMap.publishReadinessCount.exported`
- `quipsly.releaseMap.publishReadinessCount.published`
- `quipsly.releaseMap.publishReadinessCount.needsAttention`

Agents should report which output family is blocked or ready instead of saying the episode is simply done or not done. The truth ladder exists to prevent a common agent mistake: treating local render, platform upload, scheduled release, and published receipt as the same thing.

Agents should prefer `nextSafeAction` before inventing their own release order. It is the ordered human/agent recommendation for the current session state. `openShipWorkbench` moves the operator to output, upload, and receipt work; `focusTrailMap` moves attention back to the SHOW/SKIP source decisions that create the release artifact.

## Core publish readiness model

Agent-visible UI should gradually converge on the typed core model in `QuipslyVideoCore`:

- `PublishOutputFamily`
- `PublishReadinessState`
- `PublishDeliverableReadiness`
- `PublishReceiptRecord.deliverableReadiness(...)`
- `MediaSequence.publishDeliverableReadiness(...)`
- `MediaSequence.publishReadinessCounts(...)`

Preferred agent summary shape:

```json
{
  "sequenceTitle": "Episode 1",
  "outputs": [
    {
      "family": "episode16x9",
      "destination": "YouTube",
      "status": "readyToExport",
      "artifactPath": "/path/to/master.mp4",
      "publicURL": "",
      "nextAction": "Export or hand off the artifact, then capture receipt details."
    }
  ]
}
```

Do not collapse `exported`, `readyToExport`, and `published` into one bucket. Those are different production truths.

The agent-visible `deliveryReadiness.shipCockpit` summary mirrors the Ship workbench. It should be the first stop when deciding whether to render, upload, schedule, or capture receipts:

- `families[].targetCount`: how many platform/destination records exist.
- `families[].receiptCount`: how many of those records have proof.
- `families[].status`: human-facing family status.
- `families[].nextAction`: safest next action for that output family.
- `proof.status`: `no-ledger`, `needs-receipts`, or `proved`.
- `platformProofChecklist[]`: concrete per-platform proof rows for YouTube, Patreon, social platforms, Spotify, and Apple Podcast targets.

Agents must treat `shipCockpit.proof.proofRule` as binding product doctrine for publication claims.

When `platformProofChecklist[].status` is:

- `needs-artifact`: do not publish; export or regenerate the deliverable.
- `needs-copy`: review title, description, caption, or metadata before posting.
- `ready-to-post`: a human/API may upload or schedule, then must capture real proof.
- `proved`: preserve the receipt and do not overwrite proof casually.

Safe checklist actions:

- Use `copyJSON` when a tool, agent, or future automation needs exact structured release state.
- Use `copyChecklist` when the operator needs a complete portable status handoff for every platform target.
- Use `copyMissing` when the operator needs the exact missing proof list or receipt-capture commands.
- Use `refreshLedger` only after exports or handoff packets have changed. It should not be treated as upload, schedule, or publish proof.

Semantic clipboard endpoints mirror the visible Ship checklist actions:

- `GET /publication_copy_release_cockpit_json`
- `GET /publication_copy_platform_proof_checklist`
- `GET /publication_copy_missing_receipts`

All three are clipboard-only handoffs. They are safe for Codex to run because they do not upload, schedule, publish, or mutate receipt proof.

## Live decision handles

Live choicesing buttons:

- `quipsly.liveSwitch.charlie`
- `quipsly.liveSwitch.homer`
- `quipsly.liveSwitch.both`
- `quipsly.liveSwitch.skip`
- `quipsly.liveSwitch.charlieClip`
- `quipsly.liveSwitch.homerClip`

Shortcut labels:

- `quipsly.shortcut.playEdit`
- `quipsly.shortcut.jkl`
- `quipsly.shortcut.decisions`
- `quipsly.shortcut.showDrag`
- `quipsly.shortcut.skipDrag`

## Safety language for agents

Use these words precisely:

- `Whole source lane`: the underlying synced source is intact.
- `SHOW`: Play Edit may display this source during this span.
- `SKIP`: Play Edit jumps over this span.
- `Short recipe`: a 9:16 pull-out range from the episode spine.
- `Proxy-safe`: preview/edit media is available without touching protected originals.
- `Receipt`: evidence that an artifact was exported or published.

Do not call a source "cut" when only metadata changed. Do not call a publish lane complete unless a file or receipt proves it.

## Redesign accessibility notes

- Calmer UI does not mean less semantic state.
- If a visual element moves from a banner into a panel, keep the same accessibility identifier when practical.
- The redesigned workbench should still expose Frame, Shorts, Script, and Ship as explicit controls.
- The redesigned timeline should still make selected SHOW/SKIP decisions directly targetable for nudge, trim, and delete actions.

## Source Grove naming note - 2026-06-18

The human-facing label is moving from Source Wall to Source Grove to reinforce the product model: sources are whole, synced, alive, and available for review. Existing semantic identifiers such as `quipsly.sourceWall` remain valid until intentionally migrated because agent stability matters more than cosmetic vocabulary.

Agents should say "source grove" or "whole source lane" in user-facing summaries, but may continue to use `sourceWall` handles in code and accessibility identifiers.

## Full clearing redesign agent rule - 2026-06-18

A calmer interface must not reduce agent capability. If a control moves, the matching semantic state or endpoint must remain discoverable. If a visual card becomes quieter, the agent payload should still expose the exact edit state: playhead, playback mode, output format, selected source, selected decision, SHOW/SKIP ranges, proxy readiness, short recipe state, export state, and publication proof state.

## Selected decision summary - 2026-06-18

The timeline exposes a selected-decision summary at `quipsly.timeline.selectedDecisionSummary`.

Agent rule:

- Use this surface and `/state.selectedTag*` fields to confirm what a human selected before nudging, trimming, deleting, or using it as a short recipe source.
- If no selected decision exists, guide the user or agent to select a SHOW/SKIP decision first.
- Never call the selected item a chopped source clip. It is a metadata decision over a whole source lane.

## Selected short recipe summary - 2026-06-18

The timeline exposes selected short recipe context at `quipsly.timeline.selectedShortRecipeSummary`.

Agent rule:

- Treat a short as a recipe from the episode trail, not a separate chopped clip.
- Use ordered segment ranges when preparing exports, captions, platform copy, or receipt handoffs.
- If a recipe has multiple segments, preserve order and report that explicitly.
- Use `/state.selectedShortClip`, `/state.selectedShortProof`, and `/state.shortClipQueue` as semantic truth; use the visual summary as human-facing confirmation.
