# Quipsly Premiere Rescue Workflow

Last updated: 2026-06-07

## Purpose

Quipsly can use old Premiere projects as a rescue source without becoming Premiere.

The goal is not to perfectly recreate every Premiere behavior. The goal is to translate old edits into Quipsly language:

- Source media stays inspectable.
- Active edit clips are reviewable.
- Premiere-cut sections become preserved edit decisions.
- Restore experiments are local until a human deliberately saves.
- Promotion creates a backup before replacing the active Nest timeline.

## Core model

### Source monitors

Each media file from a Premiere packet should remain separately visible as a source.

This supports the workflow the user wants: scrub source material, inspect camera/audio files, and decide which parts should appear in the final edit without losing awareness of everything else.

### Program edit

The active translated edit is the program timeline.

This is what `Play Edit` should represent: the current cut, with inactive/deactivated ranges skipped.

### Preserved edit decisions

Premiere sections that were removed, disabled, or inferred as skipped are preserved as `deactivatedSourceRanges`.

These are not trash. They are edit decisions:

- Restore this.
- Shorten this.
- Extend this.
- Leave this skipped.
- Revisit after missing media is relinked.

## Current implemented flow

### 1. Stage Premiere packet in Quipsly Mac

Use the Mac app `Import to Episode` flow to stage a Premiere packet for a project and episode.

The Mac app converts the packet into a `PremiereDraftEditPacket` with:

- `timelineClips`
- `assetMatches`
- `deactivatedSourceRanges`
- `suggestedSpine`
- warnings and match status

### 2. Review in Mac Premiere Draft Edit

The Mac `Premiere Draft Edit` surface now shows:

- translated timeline overview
- source monitors
- missing media recovery
- preserved edit decisions
- edit decision report export

This screen is for understanding and staging. It should remain local-first and non-destructive.

### 3. Review staged draft in Nest editor

The Nest `/editor` route reads `productionJson.premiereDraftEdits`.

Each staged draft card now shows:

- asset match sample
- preserved edit decisions
- skipped source duration
- matched preserved range count
- cue controls
- copy/export report
- promotion controls

### 4. Cue preserved decisions

`Cue range` or `Cue source` does not mutate the timeline.

It selects the nearest matching source clip and moves the playhead so the editor can inspect context.

If the source media is not active/relinked, Quipsly says so plainly instead of pretending playback is possible.

### 5. Preview restore locally

`Preview restore` creates a temporary local timeline clip at the end of the current timeline.

Current convention:

- video restore preview track: `V9`
- audio restore preview track: `A9`
- clip id prefix: `premiere-restore-preview-`
- clip name prefix: `Restore preview -`

This is a scratchpad action. It does not call an API and does not change saved production data by itself.

### 6. Manage restore previews

When restore previews exist, the editor shows `Local restore previews are active`.

Available controls:

- `Jump`: cue one preview clip.
- `Remove`: remove one preview clip.
- `Clear restore previews`: remove all preview clips.
- `Save with previews`: deliberately persist the current timeline with those previews included.

The confirmation must stay clear: saving with previews intentionally saves the current timeline.

## Safety rules

- Never silently delete old Premiere source information.
- Never silently promote a draft over the active Nest timeline.
- Never make hidden timeline edits from a preserved decision.
- Always distinguish temporary local preview from saved production state.
- Keep missing media visible and recoverable.
- Backup before promotion or restore.

## Files to inspect first

- `apps/quipsly-mac/Sources/QuipslyMac/Views/PremiereDraftEditView.swift`
- `apps/quipsly-mac/Sources/QuipslyMac/Models/PremiereImportPacketModels.swift`
- `apps/quipsly/src/app/(app)/editor/page.tsx`
- `apps/quipsly/src/app/api/episode-production/import-media/route.ts`
- `apps/quipsly/src/app/(app)/editor/useTimelineState.ts`

## Next product steps

### Boundary tools

Turn restored preview clips into real adjustable boundaries.

The right next interaction is likely:

- preview restore
- drag or type in/out boundaries
- compare active cut vs restored candidate
- keep candidate
- remove candidate

### Source monitor playback

Add a stronger source/program split:

- source viewer for the selected media file
- program viewer for active edit
- play all source material
- play only active edit

### Promotion language

Promotion should always say:

- what will change
- what backup will be created
- whether preview restore clips are included
- how to undo or restore backup

### Agent use

Agents should use preserved decisions as candidates, not commands.

Good agent suggestions:

- "These 5 cut ranges are long enough to review."
- "This skipped section overlaps a strong quote."
- "This range is missing media, recover before reviewing."

Bad agent behavior:

- restoring ranges automatically
- deleting ranges because they look boring
- promoting a draft without an explicit human confirmation

