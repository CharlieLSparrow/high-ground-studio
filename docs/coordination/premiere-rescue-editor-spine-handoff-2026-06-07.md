# Premiere Rescue + Editor Spine Handoff

Date: 2026-06-07

## Current product state

Quipsly now has a clearer Premiere rescue path across the Mac app and Nest editor.

The working model is:

- Mac app stages and explains Premiere draft packets.
- Nest editor displays staged drafts and preserved edit decisions.
- Preserved Premiere cuts are treated as reviewable decisions, not deleted trash.
- Restore previews are local scratchpad clips until a human intentionally saves.
- Promotion and restore flows must keep backup-first behavior.

## What shipped in this pass

### Mac import and sync readiness

- Episode Import now shows an import-readiness panel.
- Import refuses confusing half-jobs when target episode is blank or the local engine is offline.
- Episode Sync now shows session/timeline/asset readiness.
- Episode Sync can bulk-download missing assets.
- Bulk downloads show running state and progress narration.

### Mac Premiere Draft Edit

- Premiere draft review now includes preserved edit decisions.
- Preserved decisions show skipped source ranges, match status, duration, and reason/confidence.
- The Mac screen can export a human-readable edit decision report.

### Nest editor Premiere rescue

- Staged Premiere drafts now carry `deactivatedSourceRanges` through normalization.
- Draft cards show preserved edit decisions directly in `/editor`.
- Users can copy preserved decisions as a plain-text report.
- Users can cue a preserved range/source without timeline mutation.
- Users can create local restore preview clips.
- Users can jump/remove individual restore previews.
- Users can clear all restore previews.
- Users can explicitly save the current timeline with restore previews after confirmation.

## Safety invariants

- Source truth must remain visible.
- Preserved decisions are candidates, not commands.
- Cueing does not mutate.
- Preview restore clips are local until explicitly saved.
- Saving with previews must remain a deliberate confirmed action.
- Promotion must keep backup-before-replace semantics.
- Missing media should stay visible and recoverable.

## Current known limitations

- Restore previews are appended to the end of the timeline on review tracks `V9` / `A9`.
- Restore previews are not yet inserted back into the original edit gap.
- There is not yet a true source monitor/program monitor split in the web editor.
- Boundary editing is still manual after a preview clip exists.
- The current preserved-decision UI is inside a large editor page and should eventually be componentized.

## Next best coding moves

1. Add a real source/program review mode in the Nest editor.
2. Add source monitor playback for selected media or preserved decision source.
3. Let restore previews choose insertion point: end of timeline, current playhead, or original nearest edit boundary.
4. Add boundary controls on restore preview clips: trim start/end, nudge source in/out, keep/remove.
5. Add a visible "temporary preview clip" badge on timeline clips generated from preserved decisions.
6. Add a promotion confirmation that explicitly mentions whether restore-preview clips are included.
7. Run a real Episode 1-3 Premiere packet smoke after deployment.

## Files most relevant to this lane

- `apps/quipsly-mac/Sources/QuipslyMac/Views/EpisodeImportPanelView.swift`
- `apps/quipsly-mac/Sources/QuipslyMac/Views/EpisodeCollaborationView.swift`
- `apps/quipsly-mac/Sources/QuipslyMac/Views/PremiereDraftEditView.swift`
- `apps/quipsly-mac/Sources/QuipslyMac/Models/PremiereImportPacketModels.swift`
- `apps/quipsly/src/app/(app)/editor/page.tsx`
- `apps/quipsly/src/app/(app)/editor/useTimelineState.ts`
- `apps/quipsly/src/app/api/episode-production/import-media/route.ts`
- `docs/quipsly/premiere-rescue-workflow.md`

## Validation already performed during this sprint

- Multiple `swift build` passes for `apps/quipsly-mac`.
- Multiple `pnpm --filter quipsly typecheck` passes after Nest editor changes.

## Validation still needed before broad deploy confidence

- `pnpm --filter quipsly build`
- Mac app launch smoke around:
  - Episode Import readiness
  - Episode Sync readiness
  - bulk missing-asset download UI
  - Premiere Draft Edit preserved-decision display
- Browser smoke around:
  - `/editor?project=high-ground-odyssey-manuscript&episode=episode-1`
  - staged Premiere draft card
  - copy preserved decisions
  - cue source/range
  - preview restore
  - jump/remove/clear restore previews
  - save with previews

