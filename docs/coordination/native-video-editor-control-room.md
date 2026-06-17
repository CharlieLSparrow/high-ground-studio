# Native Video Editor Control Room

Date: 2026-06-14
Owner: Codex / Product Owner lane
Status: Canonical product direction, implementation survivor still needs explicit choice

> 2026-06-14 context-survival note:
> Read `docs/coordination/quipsly-gospel-wip-register.md` before editing the native video editor.
> This file contains important product invariants. Its older statement that `apps/quipsly-video` is the active implementation root conflicts with recent `apps/QuipslyStudio` recovery work.
> Do not casually declare either app canonical until the active survivor is intentionally chosen and this file is updated.

## Read this first

The current native video editor implementation root is not fully settled.

Known candidates:

```text
apps/quipsly-video
apps/QuipslyStudio
apps/quipsly-mac
```

Preliminary inventory:

- `apps/quipsly-video` is a smaller standalone Swift macOS/iOS editor lane with `Packages/QuipslyVideoCore` and direct `Sources/QuipslyVideoMac` views.
- `apps/QuipslyStudio` is a recovery fork with overlapping core files plus `SharedUI`, `AgentServer`, `AudioSyncer`, and `ExportEngine`.
- `apps/quipsly-mac` is the older full desktop shell with Nest auth, local-engine, Premiere rescue panels, and valuable reference work, but likely too heavy to be the clean editor core.

The next native implementation pass must pick a survivor or explicitly merge one direction into the other.

Do not confuse it with:

- `apps/quipsly-mac`: older Quipsly desktop shell with Nest auth, Premiere rescue panels, local-engine integration, and accumulated product experiments.
- `apps/quipsly`: Nest web application and older web `/editor`.
- `apps/local-engine`: local media processing worker for probe/proxy/upload workflows.
- `apps/video-hub`: older/adjacent video experiment.
- `apps/mobile-capture`: older HighGroundCapture/mobile capture work.
- `apps/quipsly-video-desktop-trash`: discarded desktop experiment.
- `apps/QuipslyVideo`: currently not the active editor source.

The working product target is an independent native editor that can become Mac/iPad/iPhone native without carrying the old web-shell/editor baggage.

The root path must be chosen by proof, not by sentiment.

## What happened

The product started in the web/Nest editor and the larger Quipsly Mac shell. That work produced useful concepts, but the implementation drifted toward a heavy, Premiere-shaped model:

- too many clipped timeline fragments;
- too much compatibility with old `timelineClips`;
- too much UI layered around the wrong shape;
- too much confidence from build success instead of real editing proof.

The correction was to break the editor out into a smaller native Swift app.

That breakout then had its own confusion:

- Some agents rebuilt a 360/INSV workflow before the normal podcast editor worked.
- The editor was hidden until media imported, so import bugs looked like the editor was missing.
- "Sidebar" got misread as a timeline lane-label column.
- Source and program viewers were treated as the same player at different aspect ratios.
- "Play mode" became a sticky mode picker instead of explicit `Play Edit` and `Play Through` actions.
- Proxy generation existed but wrote temporary UUID files, not durable Quipsly workspace proxies.
- Agent reports repeatedly claimed success from build launch, screenshots, or internal state without proving the visible workflow.

This document is the reset point.

## Product invariant

Quipsly is not a Premiere clone.

Quipsly preserves whole source media and stores edit logic over it.

The native editor must be built around these invariants:

- Source media stays whole and untouched.
- A source lane represents a full synced source over episode time.
- Edit decisions decide what the program output shows.
- Active, inactive, skipped, focus, crop, zoom, opacity, audio gain, shorts, and platform choices are decision/output metadata.
- A gap that is skipped in `Play Edit` is still present and inspectable in `Play Through`.
- The user should never have to hide a top camera track just to see what another camera shows at the same moment.
- Proxies are the normal editing media; huge originals are not the normal monitor-wall playback path.

## "Sidebar" is banned vocabulary

The requested feature is not a sidebar.

Call it the:

```text
Synced Source Monitor Wall
```

The monitor wall is:

- one visible monitor tile per synced video source lane;
- locked to the same master playhead;
- offset-aware per lane;
- proxy-first;
- visible while scrubbing;
- visible alongside the program output.

The monitor wall is not:

- a left timeline lane-label column;
- an inspector;
- a media bin;
- a list of clips;
- one source monitor plus one program monitor;
- a hidden view that appears only after import succeeds.

## Required default layout

The editor should open into an editor even with no media imported.

The default layout should include:

- a prominent program output monitor;
- a Synced Source Monitor Wall;
- explicit transport buttons;
- a full-lane timeline shell;
- import/status surface;
- calm placeholder states.

The editor must not appear only after `playbackEngine.player != nil`.

## Program output vs source monitors

Program output shows the current edit result.

Source monitors show the available source views at the current playhead.

These are different surfaces.

Current code in `DualViewers.swift` uses one shared `AVPlayer` for "16:9 Source" and "9:16 Reframed Output." That is not the finished product model. It is only a placeholder.

## Explicit transports

Do not hide playback semantics behind a sticky mode picker.

The MVP transport should have explicit actions:

- `Play Through`: plays the full synced source timeline, including inactive/skipped/deactivated material.
- `Play Edit`: plays the program edit and skips ranges marked as skipped/deactivated for the output.

If `Play Edit` cannot be implemented safely yet, the button should be disabled with a plain explanation. Do not fake it.

## MVP edit decision buttons

The early prototype had useful product language. Preserve it.

Initial decision buttons can be:

- `Charlie`
- `Homer`
- `Both`
- `SkipOver`
- `Charlie + Clip`
- `Homer + Clip`

These buttons create or modify edit-decision ranges. They do not cut source files.

Later, these can become keyboard shortcuts, brush tools, AI suggestions, visual FX presets, or timeline decision palettes.

## Current code reality as of 2026-06-14

The current native app has useful bones but is not production-ready:

- `CoreModels.swift` has `VideoProject`, `MediaSequence`, `VideoLane`, `SourceVideo`, and generic `VideoTag`.
- `VideoLane` plus `SourceVideo` is closer to the correct full-source-lane model than the old clipped-fragment model.
- `VideoTag` is too generic to be permanent editing truth.
- `PlaybackMode` still exists as `Play Edit` / `Play All`, but UI should move to explicit transport actions.
- `WorkspaceView.swift` still contains a hardcoded Episode 1 WAV auto-import path.
- `WorkspaceView.swift` still hides `DualViewers` when there is no player.
- `TimelineEditorView.swift` has a left lane-label strip, not the Synced Source Monitor Wall.
- `DualViewers.swift` uses the same player for source and output.
- `ProxyEngine.swift` creates temp UUID proxy files.
- `AgentServer` on port `8080` is useful for automation, but it is not yet a trustworthy proof harness.
- UI tests exist but have already drifted from visible product behavior.

## Model direction

Do not deepen generic `VideoTag` as the permanent edit model.

Use it only as compatibility scaffolding while moving toward explicit concepts:

- `MediaSource`: original media, durable identity, local URL, proxy URL, thumbnail URL, kind, duration, import status.
- `SourceLane`: source mapped into episode time with sync offset and availability.
- `EditDecision`: output choice over a time range.
- `ProgramOutput`: named output such as `program-16x9` or `shorts-9x16`.
- `OutputTransform`: pan, tilt, zoom, crop, opacity, gain, and keyframes per output/decision.
- `ProxyAsset`: deterministic local proxy/preview derivative.

Keep source, sync, decision, and output concepts separate.

## Proxy rule

Monitor wall playback is proxy-first.

If a source has no proxy:

- show a placeholder/status tile;
- allow metadata inspection;
- allow proxy generation;
- do not silently load a huge original into a grid of AVPlayers.

Proxy paths should become deterministic and durable in a Quipsly-managed media workspace, not `FileManager.default.temporaryDirectory` UUID files.

## Premiere rescue role

Premiere projects are bootstrap evidence, not the model.

The current rescue packets are:

```text
content/quipsly/premiere-imports/episode-1.json
content/quipsly/premiere-imports/episode-2.json
content/quipsly/premiere-imports/episode-3.json
```

These packets already contain `quipslyEditGraph` with sources, sync maps, outputs, and edit decisions.

Use them to seed the native model. Do not recreate Premiere's clip-fragment model as editor truth.

## Known packet counts as of 2026-06-14

```text
episode-1.json: sources=5, syncMaps=5, outputs=2, editDecisions=354
episode-2.json: sources=9, syncMaps=9, outputs=2, editDecisions=1910
episode-3.json: sources=7, syncMaps=7, outputs=2, editDecisions=1013
```

These counts are not success by themselves. They only prove that usable bootstrap data exists.

## What to build next

Build in vertical slices.

### Slice 1: visible editor shell

- editor opens with program output placeholder;
- monitor wall placeholder;
- full-lane timeline shell;
- import/status area;
- explicit `Play Edit` and `Play Through` controls;
- no hardcoded auto-import.

### Slice 2: WAV import proof

- import one WAV;
- show one full-length audio lane;
- long-duration lane does not explode layout;
- app state reports lane count, name, duration, kind;
- scrub updates playhead.

### Slice 3: MP4/proxy proof

- import one MP4;
- create one full-length video lane;
- show one source monitor tile;
- generate/provide proxy status;
- use proxy when available;
- scrub source monitor and program output to the same playhead.

### Slice 4: two-camera placeholder edit

Use generated placeholder media if real files are slow or unavailable.

Prove:

- two synced video source lanes;
- source monitor tile for each;
- program output switches between them;
- `Charlie`, `Homer`, `Both`, and `SkipOver` decisions exist;
- `Play Through` plays full timeline;
- `Play Edit` skips `SkipOver`.

### Slice 5: Episode 1 packet import

- load `episode-1.json`;
- create sources and decisions from `quipslyEditGraph`;
- show full source lanes;
- show active/inactive/skipped decision overlays;
- keep Premiere-derived decisions reviewable.

Do not start export until these slices are proven.

## Proof standard

Build success is not proof.

Screenshots are not proof.

A claim is not proof.

Minimum useful proof includes:

- app launched through the intended app path;
- visible editor shell;
- imported lane count from app state;
- visible monitor count;
- visible timeline lane count;
- playhead seek result;
- `Play Through` behavior;
- `Play Edit` behavior or explicit disabled blocker;
- notes on whether proxy or original media was used.

## What to avoid this week

Avoid:

- 360/INSV-first work before ordinary WAV/MP4 editing works;
- export-first work before playback/edit decisions work;
- broad "massive" UI rewrites without a proof target;
- compatibility layers that preserve wrong architecture;
- treating the lane-label column as the source monitor wall;
- loading giant originals in every source monitor;
- claiming "done" from build success.

## Fast path to publishing episodes this week

The fastest correct path is:

1. Make the native editor visibly open into the correct layout.
2. Prove WAV and MP4 imports with placeholder/small media.
3. Prove two-camera switching with decision buttons.
4. Prove `Play Through` and `Play Edit`.
5. Load Episode 1 Premiere packet into the native model.
6. Use Episode 1 as the first end-to-end re-edit proof.
7. Repeat for Episodes 2 and 3.
8. Only then harden export/publish.

This is faster than chasing export now because it prevents fossilizing another wrong model.
