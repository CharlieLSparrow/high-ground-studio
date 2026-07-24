# Native Editor UX Debt Ledger

Last updated: 2026-06-18

This ledger tracks UX debt that blocks QuipslyStudio from becoming the daily production editor for High Ground Odyssey episodes, shorts, podcast audio, and publish proof.

## Product invariant

Quipsly is not a chopped-clip editor. It is a whole-source, decision-layer, output-recipe editor.

Every UX fix should preserve this invariant:

- Whole source lanes stay intact.
- SHOW/SKIP decisions decide what Play Edit does.
- Short recipes pull ordered ranges from the same episode trail.
- 16:9, 9:16, and podcast outputs are output families, not separate disconnected projects.
- Receipts prove publication; rendering alone is not publishing.

## Highest-priority UX debt

### 1. Shared playhead trust

Problem:
The editor only feels real when Program Output, Source Grove, and Episode Trail Map move together from every interaction path.

Needed proof:

- Scrub timeline and all viewers follow.
- Two-finger scroll over Program Output moves the same shared playhead.
- Source Grove cards never drift into private time.
- Play Edit skips gaps without desync.
- Play Through follows full source time without desync.

Priority: critical MVP.

### 2. Pinch zoom and precision editing

Problem:
The trail map can show the episode, but fine edits are still too hard if dense SHOW/SKIP markers collapse into visual noise.

Needed proof:

- Pinch zoom changes timeline scale smoothly.
- Fit/overview mode shows calm coverage.
- Precision mode reveals usable handles and selected-decision labels.
- Selected SHOW/SKIP decisions can be nudged, trimmed, and deleted without hunting.

Priority: critical MVP.

### 3. Source Grove clarity

Problem:
The right side can look like a pile of media cards instead of the reason Quipsly exists: every source visible while deciding what the edit shows.

Needed proof:

- Each card clearly says whether it is live, proxy-safe, missing, protected, or out of range.
- The current playhead source time is visible.
- SHOW 10s and SKIP 10s are obvious and safe.
- Clicking a card selects a whole source lane, not a clip.
- Missing/protected media stays visible as recovery work, not failure shame.

Priority: critical MVP.

### 4. Selected-decision workbench

Problem:
The editor needs a calm place to explain the selected SHOW/SKIP decision and offer safe next actions.

Needed proof:

- Selected decision panel answers: what, source, time range, output behavior, shortcut, safe actions.
- Human controls and Codex command handles map to the same operation.
- Copy/export diagnostic JSON is available for the selected decision.

Priority: high MVP.

### 5. Shorts recipe comprehension

Problem:
Shorts must not feel like separate little timelines detached from the episode. They are recipes from the episode trail.

Needed proof:

- Each short clearly shows one segment vs multiple ordered segments.
- Segment ranges are visible on the trail map.
- 9:16 framing state is visible per recipe/segment.
- Export state and publish receipt state remain separate.
- Platform-specific copy/captions/overlays have room without hiding the recipe.

Priority: high MVP.

### 6. Publish cockpit truth

Problem:
Publishing UI can easily become a fake confidence generator if it compresses render/upload/schedule/proof into one state.

Needed proof:

- Episode 16:9 master, 9:16 shorts, and podcast audio each have their own readiness.
- YouTube, Patreon, Instagram, Facebook, LinkedIn, Spotify, and Apple Podcasts rows show exact next action.
- Receipt capture is visible and cannot be confused with rendering.
- Copy JSON/checklist/missing proof actions are safe and obvious.

Priority: high MVP.

### 7. Nature-y professional visual system

Problem:
The app is better, but still risks feeling like a dense developer console instead of a warm professional editor.

Needed proof:

- First glance feels calm, warm, and intentional.
- The monitor is the visual star.
- Timeline density is handled with zoom/detail, not neon overload.
- Left and right sidebars feel like useful shelves, not junk drawers.
- Text fits without shrinking into dust.

Priority: important, but should not override playback/scrub truth.

## Codex-specific UX debt

Codex needs first-class editing affordances, not screen-scraping luck.

Needed proof:

- Stable observe payload includes playhead, selected source, selected decision, playback mode, output format, proxy status, short recipe state, export state, receipt state.
- Safe commands exist for SHOW/SKIP ranges, selected decision nudge/trim/delete, source selection, short recipe selection, export packet preparation, and receipt checklist copying.
- After every command, Codex can re-observe and prove the result.

Priority: same as human editing. Agent accessibility is product accessibility.

## Next implementation recommendation

The next code pass should focus on `Shared playhead trust` and `Pinch zoom and precision editing` before more aesthetic polish.

A beautiful editor that cannot scrub precisely is a painting of a hammer. Lovely, but rude.

## Implementation note - 2026-06-18 shared playhead hardening

The playback engine now owns bounded sequence time for `play`, `seek`, and `scrub`. UI surfaces should call the engine instead of applying their own private clamping rules.

Current interaction contract exposed to agent state:

- `timelineGestureModel`: drag playhead scrubs the shared spine; pinch timeline zooms precision.
- `programScrollModel`: two-finger scroll over Program Output scrubs the same shared spine.
- `sourceSyncProof.sequenceDuration`: the authoritative episode duration for current sync proof.
- `sourceSyncProof.boundedPlayhead`: the playhead value after engine-level sequence-time bounding.

Next proof needed:

- Build and launch the app.
- Scrub Program Output with two-finger scroll and confirm `/state.playhead` changes.
- Drag the Episode Trail Map playhead and confirm Program Output plus Source Grove follow.
- Pinch the trail map and confirm `/state.timelinePixelsPerSecond` changes without losing selected decision context.

## Implementation note - 2026-06-18 selected decision clarity

The Episode Trail Map now has a selected-decision summary strip above precision controls.

The strip should make one thing immediately clear: the editor is changing metadata over a whole source lane, not cutting source media.

It must show:

- SHOW vs SKIP decision type.
- Whole source lane name.
- Sequence start and end time.
- Decision duration.
- Output behavior in Play Edit.
- `metadata only` as an explicit safety cue.

Next proof needed:

- Select a SHOW decision and verify the summary says Play Edit may show this lane.
- Select a SKIP decision and verify the summary says Play Edit jumps a blank gap.
- Verify the precision buttons still work underneath the summary.
- Verify Codex can still identify the selected decision through `selectedTagId`, `selectedTagType`, `selectedTagStart`, and `selectedTagDuration` in `/state`.

## Implementation note - 2026-06-18 short recipe comprehension

The Episode Trail Map now exposes `quipsly.timeline.selectedShortRecipeSummary` when a short recipe is selected.

The summary should show:

- selected short recipe title,
- whether the recipe is one continuous pull-out or multiple ordered moments,
- segment count,
- total recipe duration,
- ordered segment pills with start, end, and duration,
- clear language that source media remains intact.

Next proof needed:

- Select a one-segment short recipe and confirm the copy says one continuous pull-out.
- Select a multi-segment short recipe and confirm the copy says multiple ordered moments.
- Confirm segment pills match the moss rails on the Episode Trail Map.
- Confirm Codex can use `selectedShortClip` and `selectedShortProof` state with this visual summary rather than inferring recipe structure from pixels.
