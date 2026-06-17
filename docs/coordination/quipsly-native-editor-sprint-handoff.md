# Quipsly Native Editor Sprint Handoff

Updated: 2026-06-15

## Canonical editor target

Use `apps/QuipslyStudio` / bundle `com.highground.QuipslyMac` as the native editor candidate. Treat older `apps/quipsly-mac` and `apps/quipsly-video` as reference unless a fresh proof beats this path.

## Product truth

The editor is a full synced-source-lane editor with edit decision overlays.

- Source lanes stay whole.
- Yellow `SHOW` and red `SKIP` decisions live on top of lanes.
- `Play Through` plays raw sequence time.
- `Play Edit` uses valid ranges and skips gaps without deleting source media.
- Premiere rescue packets bootstrap source lanes and decisions; they do not define the Quipsly architecture.

## What changed in this sprint

- Added `VideoLaneMetadata` to preserve source asset id, media kind, role, track ids, source paths, Premiere rescue status, and declared source existence.
- Extended `VideoLaneMetadata` with local vault paths and asset fingerprints so raw/proxy readiness survives save/load.
- Upgraded Premiere packet import to classify lanes as Charlie camera, Homer camera, unresolved camera, source clip, reference clip, and audio roles.
- Made Episode 2/3 generic Premiere assets visible as `Unresolved Camera V*` instead of lying with generic camera names.
- Updated live decision commands to use lane roles rather than fragile name search.
- Added visual source readiness language to monitor cards and timeline lane headers.
- Added fit-to-window scale that can actually show full episode timelines.
- Added clickable lane-role assignment in the selected lane panel.
- Added `LocalMediaVault` as the managed local source/proxy/session root.
- Updated `ProxyEngine` so proxies are deterministic and reusable under the vault instead of random app-support files.
- Added native editor session save/load through `NativeEditorSession` and `ProjectStore`.
- Added a visible media-readiness panel in the editor so the operator can see ready / held / missing / vaulted lane counts.
- Added a selected-lane `Vault media` action in the editor UI, not just the agent endpoint.
- Added app-local agent endpoint and helper command for role assignment:
  - `GET /lane_role?lane_id=<uuid-or-name>&role=<role>`
  - `script/agentctl.sh lane-role "Unresolved Camera V1 - video clip 235" homer_camera`
- Added app-local vault/session endpoints and helper commands:
  - `GET /vault_state`
  - `GET /vault_lane?lane_id=<uuid-or-name>`
  - `GET /relink_lane?lane_id=<uuid-or-name>&path=<absolute-path>`
  - `GET /save_session?name=<session-name>`
  - `GET /load_session?name=<session-name>`
  - `GET /sessions`
  - `script/agentctl.sh vault-state`
  - `script/agentctl.sh vault-lane "quipsly-vault-proof.mp4"`
  - `script/agentctl.sh relink-lane Charlie /absolute/path/to/source.mp4`
  - `script/agentctl.sh save-session episode-2-native-proof`
  - `script/agentctl.sh load-session episode-2-native-proof`
  - `script/agentctl.sh sessions`
- Added selected-lane relink controls in the editor UI:
  - `Relink file` opens a native file picker for the selected lane.
  - relink imports the chosen file into `LocalMediaVault.raw`.
  - video relink creates/reuses a deterministic proxy under `LocalMediaVault.proxy`.
  - relink preserves the lane id, lane name, lane role, sync offset, 360 flag, and all edit decisions.
  - the imported filename is stored as metadata (`sourceLabel`), not used to rename the editorial lane.
- Tightened monitor-wall semantics:
  - program monitor is the edit output.
  - source monitor cards now represent video source lanes only.
  - audio/context lanes are shown as supporting sync/export lanes, not fake video monitors.
  - clicking a source monitor selects the whole lane without selecting or mutating an edit decision.
  - source monitor cards label themselves as `whole lane` to reinforce that cuts are decision overlays.
  - app-local state now reports `monitorWallModel`, `sourceMonitorVideoCount`, `supportLaneCount`, `selectedLaneId`, and `selectedLaneName` so smoke tests can verify the monitor-wall model directly.
- Tightened timeline language:
  - base lane labels now say `SOURCE CONTEXT · inactive until SHOW`.
  - timeline help text explicitly says source lanes are reviewable whole lanes, inactive in `Play Edit` until a yellow `SHOW` decision.
  - this is a UI guardrail against accidentally rebuilding Premiere-style chopped clips.
- Added a native session strip inside the editor with:
  - active session name
  - manual `Save now`
  - manual `Load`
  - recent session menu
  - saved-state/autosave status
- Added active-session auto-restore on app launch when the named local session exists and no sequence is loaded.
- Added debounced autosave after edit mutations:
  - timeline decisions
  - lane-role assignment
  - decision nudge/delete
  - agent edits/decisions
  - media import/proxy updates
  - audio sync
  - keyframe changes
  - vaulting media
- Added a bulk `Vault reachable lanes` action to promote reachable local sources into the managed vault.
- Added editor navigation controls and shortcuts:
  - `Prev decision`
  - `Next decision`
  - `First media issue`
  - `[` / `]` for previous/next decision
  - `M` for first media issue
- Added an explicit agent-access layer so Quipsly can be operated by semantic state and commands instead of screen scraping:
  - `/state` now publishes `agentInterfaceModel`, `agentActionCatalog`, `agentCurrentSafeActions`, and `agentCurrentContext`.
  - New local commands:
    - `GET /select_lane?lane_id=<uuid-or-name>`
    - `GET /format?value=16:9|9:16`
    - `GET /source_window?lane_id=<uuid-or-name>&action=show|cut&duration=<seconds>`
  - New helper commands:
    - `script/agentctl.sh select-lane "Charlie Camera"`
    - `script/agentctl.sh format 9:16`
    - `script/agentctl.sh source-window "Charlie Camera" show 10`
  - Product rule: agent accessibility is not UI clicking. Agents should observe structured editor truth, choose a named safe action, execute it, then re-observe.
- Added a compact editor proof snapshot for humans and agents:
  - `/state` now includes `editorProofSnapshot`.
  - New local endpoint: `GET /editor_snapshot`.
  - New helper command: `script/agentctl.sh editor-snapshot`.
  - Snapshot answers: can edit now, can scrub synced sources, can Play Edit, proxy-first status, proof checklist, blockers, and next safe action.
  - This is intentionally smaller than `mediaRecoveryReport`; use the snapshot for quick readiness and the recovery report for lane-level diagnosis.

## Proof run

Build command passed:

```bash
./script/build_and_run.sh --verify
```

`--verify` now proves more than process liveness. It:

1. gracefully quits the previous app process when possible,
2. clears stale saved window state,
3. dismisses the macOS crash-recovery reopen dialog when it appears,
4. builds and launches the fresh app bundle,
5. checks the app-local agent health endpoint, and
6. waits until the editor reports real state with `projectTitle`.

This matters because a launched process with no usable editor window is not a valid proof.

Episode packet state proof passed for Episodes 1-3 through the app-local agent server.

Episode 2 role reassignment proof:

```json
{
  "projectTitle": "Episode 2 Native Edit",
  "laneCount": 9,
  "proofLane": [
    {
      "name": "Homer Camera - video clip 235",
      "role": "homer_camera",
      "ready": false,
      "active": 1,
      "cut": 0
    }
  ]
}
```

Screenshot proof path:

```text
/tmp/quipslystudio-real-editor-sprint.png
```

It shows dense full-lane timeline overlays and the reassigned Homer lane. It also shows macOS asking for Desktop-folder file access.

Native session persistence proof:

```json
{
  "projectTitle": "Episode 2 Native Edit",
  "laneCount": 9,
  "lastSessionPath": "/Users/wall-e/Library/Application Support/Quipsly/MediaVault/sessions/episode-2-native-proof.quipsly-session.json",
  "lastMediaAction": "Loaded native session episode-2-native-proof",
  "proofLane": [
    {
      "name": "Homer Camera - video clip 235",
      "role": "homer_camera",
      "active": 1,
      "cut": 0
    }
  ]
}
```

Vault/proxy proof with a generated tiny media asset:

```json
{
  "projectTitle": "New Project",
  "laneCount": 1,
  "lastMediaAction": "Loaded native session vault-proof",
  "proofLane": [
    {
      "name": "quipsly-vault-proof.mp4",
      "role": "camera",
      "ready": true,
      "readiness": "Proxy ready",
      "sourcePath": "/Users/wall-e/Library/Application Support/Quipsly/MediaVault/raw/56b5d57d3874580c/quipsly-vault-proof.mp4",
      "playbackPath": "/Users/wall-e/Library/Application Support/Quipsly/MediaVault/proxy/2b4bd5781d9ba154/quipsly-vault-proof_proxy.mp4",
      "vaultRawPath": "/Users/wall-e/Library/Application Support/Quipsly/MediaVault/raw/56b5d57d3874580c/quipsly-vault-proof.mp4",
      "vaultProxyPath": "/Users/wall-e/Library/Application Support/Quipsly/MediaVault/proxy/2b4bd5781d9ba154/quipsly-vault-proof_proxy.mp4",
      "assetFingerprint": "2b4bd5781d9ba154"
    }
  ]
}
```

Session autosave proof after relaunch:

```json
{
  "projectTitle": "Demo Project",
  "activeSessionName": "editor-sprint-proof",
  "autosaveStatus": "Autosaved: agent decision",
  "lastSavedAt": "2026-06-15T16:21:29Z",
  "lastSessionPath": "/Users/wall-e/Library/Application Support/Quipsly/MediaVault/sessions/editor-sprint-proof.quipsly-session.json",
  "lastMediaAction": "Autosaved: agent decision",
  "laneCount": 3,
  "validRangeCount": 4
}
```

Recent sessions proof:

```json
{
  "status": "ok",
  "newest": {
    "modifiedAt": "2026-06-15T16:21:29Z",
    "name": "editor-sprint-proof",
    "path": "/Users/wall-e/Library/Application Support/Quipsly/MediaVault/sessions/editor-sprint-proof.quipsly-session.json",
    "sizeBytes": "4646"
  }
}
```

Auto-restore proof after relaunch:

```json
{
  "projectTitle": "Demo Project",
  "activeSessionName": "editor-sprint-proof",
  "autosaveStatus": "Loaded",
  "lastSessionPath": "/Users/wall-e/Library/Application Support/Quipsly/MediaVault/sessions/editor-sprint-proof.quipsly-session.json",
  "lastMediaAction": "Loaded native session editor-sprint-proof",
  "laneCount": 3,
  "validRangeCount": 4
}
```

Relink-to-vault proof with a generated tiny video source:

```bash
./script/agentctl.sh demo
./script/agentctl.sh relink-lane Charlie /tmp/quipsly-relink-proof/relinked-source.mp4
./script/agentctl.sh state
```

Observed proof state:

```json
{
  "laneName": "Charlie",
  "activeCount": 3,
  "cutCount": 0,
  "tagCount": 3,
  "sourceReadiness": "Proxy ready",
  "playbackPath": "/Users/wall-e/Library/Application Support/Quipsly/MediaVault/proxy/9eb817001db1e1ce/relinked-source_proxy.mp4",
  "vaultRawPath": "/Users/wall-e/Library/Application Support/Quipsly/MediaVault/raw/d07070a3b389b9a7/relinked-source.mp4",
  "vaultProxyPath": "/Users/wall-e/Library/Application Support/Quipsly/MediaVault/proxy/9eb817001db1e1ce/relinked-source_proxy.mp4",
  "mediaKind": "video",
  "sourceLabel": "relinked-source.mp4",
  "autosaveStatus": "Autosaved: relinked media"
}
```

The important invariant: relink changes the media backing a lane; it does not rename the lane or destroy the edit-decision overlay.

## Current blockers and next targets

1. Desktop/iCloud/external paths can still be blocked by macOS until the operator grants access or the file is vaulted.
2. The vault is implemented and proven with a small media asset, and reachable-lane bulk vaulting now exists. Episode 1-3 real media still needs an operator pass because macOS/iCloud/external-drive reachability varies file by file.
3. Dense Episode 2/3 timelines now render truthfully and have basic decision/media-issue navigation. They still need better zoom-level rendering, lane grouping, and selection breadcrumbs.
4. Native session save/load, recent session listing, visible saved-state UI, and debounced autosave are implemented and proven.
5. The real app proof loop is now stateful enough to catch headless launches and crash-reopen dialogs.
6. Export should wait until real episode media readiness and project persistence are boring.

## Human operator workflow now available

1. Load a Premiere packet or native session.
2. Inspect the media-readiness panel.
3. Select a lane that is held/missing/unresolved.
4. Assign the lane role if needed.
5. Click `Vault media` once the original file is reachable.
6. Use `Vault reachable lanes` to promote every currently reachable lane.
7. Let autosave settle, or click `Save now`.
8. Use `Recent` to restore the latest native session after relaunch.

This promotes media into the managed local vault and preserves raw/proxy paths in the native session.

## Next best sprint

Build the source-monitor-wall and Episode 1-3 production readiness loop:

1. Keep all video source lanes visible as whole synced lanes, not chopped clips.
2. Make the source monitor wall obvious: one prominent program/edit monitor plus smaller source monitors for every video lane. The first pass is implemented; the next pass should improve sizing, pinning, and density for many lanes.
3. Run an Episode 1-3 real-media reachability pass and bulk vault everything currently reachable.
4. Use relink controls for lanes whose original source is missing or iCloud-only.
5. Improve dense timeline navigation: zoom presets, lane grouping, selection breadcrumbs, and visible decision list/review queue.
6. Improve the monitor wall for many lanes: pin primary lanes, collapse audio-only lanes, and keep source monitors readable.
7. Prove `Play Through` and `Play Edit` on one complete short section with vaulted media.
8. Only after real media is local/proxied, prove export on the same short section.

## 2026-06-15 Episode 1 live-media invariant update

Status: WIP, not yet final proof.

Product invariant: QuipslyStudio must not import Premiere-style chopped clips for Episode 1. The live-media path is full external source lanes plus lightweight local proxies plus non-destructive edit-decision overlays.

Current implementation direction:
- Episode 1 originals may live on `/Volumes/My Passport/Episode 1` or another external volume.
- Video relink stores the external original path as `sourceVideo.mediaURL` and declares a deterministic local proxy path as `sourceVideo.proxyURL` immediately.
- While that proxy file is pending, source/program playback should treat the lane as not playback-ready rather than falling back to the huge original file.
- Audio relink keeps the external audio file linked without copying raw audio into the app vault.
- The local vault is for generated proxies and saved native sessions, not for duplicating 18GB-26GB source videos by default.
- Active/cut tags remain overlay decisions on whole lanes; decision counts must not change during relink/proxy generation.

Live Episode 1 files known from the external drive:
- `/Volumes/My Passport/Episode 1/MVI_3999.MP4`
- `/Volumes/My Passport/Episode 1/NewHomerExport.MP4`
- `/Volumes/My Passport/Episode 1/First Pod Ever.wav`
- `/Volumes/My Passport/Episode 1/HomerAudio.wav`
- `/Volumes/My Passport/Episode 1/There is no try.mp4`

Do not bulk-relink both giant camera files until one lane has proven cleanly through proxy generation, source monitor readiness, Play Through, and Play Edit.

### Live proxy execution finding

Status: proven enough to change implementation direction.

When a lane is relinked through the local AgentServer by absolute path, the Mac app can store that path and keep the editor model responsive, but app-launched `ffmpeg` may fail to open external-drive files because the path was not granted through a native picker/security-scoped bookmark. The observed failure was `Interrupted system call` from ffmpeg while opening `/Volumes/My Passport/Episode 1/...`.

Decision:
- Keep the app model proxy-first.
- Do not fall back to raw playback for pending proxies.
- Generate proxies for agent/CLI supplied external paths through the local engine or the repo helper script, not through UI-owned app work.
- The helper `apps/QuipslyStudio/script/create_proxy_for_file.py` mirrors `LocalMediaVault.proxyURL(for:)` and writes the deterministic proxy the app already expects.

Proof so far:
- Tiny reference clip proxy generated successfully from `/Volumes/My Passport/Episode 1/There is no try.mp4` outside the app sandbox.
- Relinking the reference clip afterward showed `Proxy ready`, `vaultRawPath` empty, and unchanged decision counts.
- Charlie camera proxy generation has been started through the helper and writes to the expected proxy folder.

## 2026-06-15 Episode 1 live proxy proof

Episode 1 now has a verified live-media path in `apps/QuipslyStudio` using the external-drive originals without importing raw giant video files into the app vault.

Verified state:
- Session: `episode-1-premiere-rescue`
- Whole lanes: 5
- Source monitors: 3
- Support lanes: 2
- Edit decisions preserved: 236 active decisions, 118 cut decisions
- `Play Edit` valid ranges: 29
- Charlie video source: `/Volumes/My Passport/Episode 1/MVI_3999.MP4`
- Charlie video playback: `~/Library/Application Support/Quipsly/MediaVault/proxy/221d625bebe2e600/MVI_3999_proxy.mp4`
- Homer video source: `/Volumes/My Passport/Episode 1/NewHomerExport.MP4`
- Homer video playback: `~/Library/Application Support/Quipsly/MediaVault/proxy/5e11bd8209b8363e/NewHomerExport_proxy.mp4`
- Reference clip source: `/Volumes/My Passport/Episode 1/There is no try.mp4`
- Reference clip playback: `~/Library/Application Support/Quipsly/MediaVault/proxy/13e5ad9127ce5b01/There_is_no_try_proxy.mp4`
- Audio lanes are linked to external originals and marked audio-ready.
- `vaultRawPath` remains empty for all checked media.

Architectural guardrail added in this pass:
- Video lanes are not considered playback-ready merely because a raw source exists.
- Source monitor playback now requires a generated proxy for video lanes.
- Raw video fallback was removed from `PlaybackEngine.updateSourcePlayers` and readiness now reports `Proxy required` or `Proxy pending` until a proxy exists.

Validation commands that passed:
- `./script/build_and_run.sh --verify`
- `./script/relink_episode1_live_media.sh --all`
- `./script/agentctl.sh playback edit set`
- `./script/agentctl.sh playback edit play`, then pause
- `./script/agentctl.sh playback through set`

Do not regress this into Premiere-style chopped clips. The proof target is whole synced lanes plus metadata overlays, with proxy-first playback and originals preserved as external source truth.

## 2026-06-15 production-readiness gate added

The native editor now exposes a clearer production edit readiness gate in both the UI and `/state`.

New `/state` fields:
- `productionReady`
- `productionReadinessDetail`
- `videoProxyReadyCount`
- `videoBlockedCount`
- `audioReadyCount`
- `showDecisionCount`
- `skipDecisionCount`
- `rawVaultCount`

Verified Episode 1 proof after this change:
- `productionReady: true`
- `productionReadinessDetail: All 3 video lane(s) are proxy-backed, 2 audio/context lane(s) are reachable, and originals remain whole.`
- `videoProxyReadyCount: 3`
- `videoBlockedCount: 0`
- `audioReadyCount: 2`
- `showDecisionCount: 236`
- `skipDecisionCount: 118`
- `rawVaultCount: 0`
- `playbackMode: Play Edit`
- `validRangeCount: 29`
- `laneCount: 5`
- `sourceMonitorVideoCount: 3`

This is now the minimum safe gate before claiming an episode is ready for real local editing. It is intentionally descriptive, not judgmental: it tells the user whether the editor can safely work from proxies while preserving whole external originals and metadata edit decisions.

Next hardening target:
- Add a dedicated smoke script that runs build/run verify, relinks Episode 1 live media, and asserts the production-readiness fields above so regressions are caught without rereading huge state dumps.

## 2026-06-15 Episode 1 production smoke script

Added a one-command regression gate:

```bash
cd /Users/wall-e/Dev/high-ground-studio/apps/QuipslyStudio
./script/smoke_episode1_production_ready.sh
```

Fast inner-loop mode when the app is already running:

```bash
./script/smoke_episode1_production_ready.sh --no-build
```

The smoke script builds and launches QuipslyMac unless `--no-build` is passed, loads the Episode 1 Premiere rescue packet, relinks live external media from `/Volumes/My Passport/Episode 1`, sets `Play Edit`, pulls `/state`, and fails if the proxy-first whole-lane invariant regresses.

Assertions currently enforced:
- `productionReady == true`
- `videoProxyReadyCount == 3`
- `videoBlockedCount == 0`
- `audioReadyCount == 2`
- `showDecisionCount == 236`
- `skipDecisionCount == 118`
- `rawVaultCount == 0`
- `playbackMode == Play Edit`
- `validRangeCount == 29`
- `laneCount == 5`
- `sourceMonitorVideoCount == 3`
- every camera/reference lane is `Proxy ready`
- every camera/reference playback path points at the local proxy vault
- every audio lane is `Audio ready`
- every lane has empty `vaultRawPath`

This is now the default proof to run before and after timeline, playback, import, or monitor-wall changes.

## 2026-06-15 Timeline decision drawing repair

- Fixed `TimelineEditorView` so the actual decision-drawing layer is hit-testable again.
- Source lanes remain whole, proxy-backed context bars; dragging creates `VideoTag` decision overlays only.
- macOS gestures now distinguish explicit edit intent:
  - Option-drag creates a SHOW (`.active`) decision.
  - Command-Option-drag creates a SKIP (`.cut`) decision.
- Dragged decisions are clamped inside the source duration so bad negative-time or over-end tags are not introduced.
- Temporary drag previews now use the decision color, so SHOW and SKIP intent is visible while drawing.
- Validation: `./script/smoke_episode1_production_ready.sh` passed with Episode 1 live media on `/Volumes/My Passport/Episode 1`, 3 proxy-backed video lanes, 2 reachable audio/context lanes, 236 SHOW decisions, 118 SKIP decisions, and 0 raw-vault paths.


## 2026-06-15 Proxy-first readiness hardening

- Fixed video readiness checks so normal editor preview checks proxy paths before original paths.
- If a video proxy exists, the editor reports `Proxy ready` and does not touch the raw original path.
- If a proxy path is declared but not present, the editor reports `Proxy pending` without probing the original video path.
- Premiere rescue sources without proxies stay `Source held` until explicit relink/proxy/vault/export work. This keeps old Desktop/Premiere paths as provenance instead of surprise runtime permissions.
- Role assignment no longer runs an implicit `FileManager.fileExists` probe against the media source path.
- Validation: manual app launch reached the AgentServer on port 8080, and `./script/smoke_episode1_production_ready.sh --no-build` passed with production-ready Episode 1 state.
- Known UX note: an already-open macOS Desktop access sheet can remain on screen from earlier runs; the current proxy-ready smoke does not require accepting that access.


## 2026-06-15 Production layout and launcher hygiene pass

- Reworked `WorkspaceView.mainWorkspace` so the editor opens around the actual production workflow:
  - Monitor wall is first in the workbench.
  - Import/sync/live-switch/export actions live in one production action bar.
  - `Play Edit` / `Play Through` transport stays immediately above the timeline.
  - Session, selected-decision, and readiness diagnostics are still available, but moved into a collapsible details drawer.
- Preserved the core invariant: source lanes remain whole and synced; SHOW/SKIP are metadata decisions on top.
- Hardened `script/build_and_run.sh` for faster iteration:
  - Xcode build output now uses `-quiet`.
  - Launch and AgentServer wait failures now print explicit diagnostics instead of failing silently or producing useless noise.
- Validation:
  - `./script/build_and_run.sh run` built successfully and launched QuipslyMac.
  - AgentServer became healthy on port 8080.
  - `bash -n script/build_and_run.sh` passed.
  - `./script/smoke_episode1_production_ready.sh --no-build` passed with production-ready Episode 1 state: 3 proxy-backed video lanes, 2 audio/context lanes, 236 SHOW decisions, 118 SKIP decisions, and 0 raw-vault paths.
- Known local UX issue:
  - A macOS removable-volume access sheet can still appear because Episode 1 originals live on `/Volumes/My Passport/Episode 1`. The current preview/readiness smoke is proxy-safe, but allowing removable-volume access is useful for explicit relink/export operations.

Next strong target: make the monitor wall itself visually dominant and prove interactive editing, not just state validity: clear the permission sheet manually if needed, verify source cards and program output are visible above the fold, then test a real SHOW/SKIP decision edit through the app or AgentServer and confirm it persists without generating chopped media.

## 2026-06-15 Episode 1 metadata-only decision proof

Added `apps/QuipslyStudio/script/smoke_episode1_metadata_decision.sh` as an executable guardrail for the core editor invariant:

- Episode 1 imports as whole synced source lanes, not Premiere-style chopped clips.
- Video preview remains proxy-backed from the Quipsly media vault.
- Originals stay on the external drive or source location; `rawVaultCount` must stay `0` for this smoke.
- Edit operations add reversible decision metadata overlays (`active`/`cut`) over whole lanes.
- Adding a temporary `skip` decision changed only decision counts: `skipDecisionCount` moved from `118` to `123` across 5 lanes, while `laneCount`, `sourceMonitorVideoCount`, `videoProxyReadyCount`, and source/proxy signatures stayed unchanged.
- The script reloads the Episode 1 baseline packet afterward and verifies the original counts are restored.

Validation run:

```bash
cd /Users/wall-e/Dev/high-ground-studio/apps/QuipslyStudio
bash -n script/smoke_episode1_metadata_decision.sh
./script/smoke_episode1_metadata_decision.sh
./script/smoke_episode1_production_ready.sh --no-build
```

Result: both metadata-decision and production-readiness smokes passed against live Episode 1 media on `/Volumes/My Passport/Episode 1`.

Next production-editor target: make this same invariant visible and pleasant in the UI. The user should be able to see whole source lanes, active/show overlays, inactive/skip overlays, and proxy/source readiness without needing to trust JSON.

## 2026-06-15 Timeline lane truth UI pass

Updated `apps/QuipslyStudio/Sources/SharedUI/TimelineEditorView.swift` so each visible lane explains the core model directly in the editor:

- Lane labels now call out `Whole source lane` instead of implying sliced timeline clips.
- Proxy-backed lanes show a `PROXY` badge.
- Per-lane `SHOW` and `SKIP` counts are visible on the track surface.
- The lane footer says `base media is never cut` and `edits live as overlays` when there is enough visual width.

Validation run:

```bash
cd /Users/wall-e/Dev/high-ground-studio/apps/QuipslyStudio
./script/build_and_run.sh --verify
./script/smoke_episode1_metadata_decision.sh
./script/smoke_episode1_production_ready.sh --no-build
screencapture -x /tmp/quipslystudio-episode1-lane-truth.png
```

Result: build passed, both Episode 1 smokes passed, and the screenshot shows the updated timeline language on the real app window. Remaining UX blocker: macOS removable-volume permission still appears when live originals live on `/Volumes/My Passport/Episode 1`; this should become an explicit storage-access onboarding step rather than a surprise sheet.

## 2026-06-15 External media access and transport proof pass

Added a first-class external-originals access surface for the native editor:

- `apps/QuipslyStudio/Sources/SharedUI/ExternalMediaAccess.swift` stores and restores a macOS security-scoped bookmark for the external media folder where possible.
- `WorkspaceView` now shows a `Storage` chip in the production action bar and an `External originals access` panel in the details drawer.
- The panel states the product invariant plainly: originals stay external, proxies power playback.
- This is intentionally a permission/pointer layer, not a new media ownership model.

Launch stability fix:

- `ProjectStore.loadNativeSession(named:)` now mutates `@Published` project state inside `MainActor.run` after awaiting the local media vault. This fixed a launch crash caused by background-thread SwiftUI updates during session restore.

Added `apps/QuipslyStudio/script/smoke_episode1_transports.sh` to prove explicit transport behavior:

- `Play Edit` restores Episode 1 to the condensed program with `validRangeCount = 29`.
- `Play Through` switches to the full synced source timeline with `validRangeCount = 1`.
- Lane count, source-monitor count, proxy readiness, raw-vault count, and SHOW/SKIP decision counts remain unchanged across transport switches.
- The script restores `Play Edit` afterward.

Validation run:

```bash
cd /Users/wall-e/Dev/high-ground-studio/apps/QuipslyStudio
./script/build_and_run.sh --verify
./script/smoke_episode1_metadata_decision.sh
./script/smoke_episode1_production_ready.sh --no-build
bash -n script/smoke_episode1_transports.sh
./script/smoke_episode1_transports.sh
screencapture -x /tmp/quipslystudio-storage-access-pass.png
```

Result: build/launch passed, metadata-only decision smoke passed, production readiness smoke passed, and explicit transport smoke passed. Remaining known issue: macOS may still display its removable-volume permission sheet until the user clicks `Allow`; Quipsly now has a storage access surface, but system-controlled permission prompts may still require one user gesture.

## 2026-06-15 Episode 1 live-media/proxy truth UI pass

Goal: keep Episode 1 rescue work aligned with the Quipsly editor invariant: originals stay whole on external storage, proxy videos power playback, and timeline changes are metadata decisions only.

Implemented:
- Strengthened source monitor cards in `apps/QuipslyStudio/Sources/SharedUI/WorkspaceView.swift`.
- Added explicit source decision states: `LIVE IN PROGRAM`, `SKIPPED IN PLAY EDIT`, and `SOURCE ONLY`.
- Added a visible `PROXY` badge when a lane has a proxy URL.
- Changed source monitor footer language to `whole synced source lane` and `never clipped`.

Proof commands:
- `./script/build_and_run.sh --verify` passed.
- `./script/smoke_episode1_metadata_decision.sh` passed.
- `./script/smoke_episode1_transports.sh` passed when run sequentially.
- `./script/smoke_episode1_production_ready.sh --no-build` passed.

Important testing note:
- Do not run Episode 1 smoke scripts in parallel against the same running AgentServer. They mutate the same live app session and can race each other into false failures.

Current Episode 1 proof state:
- `laneCount`: 5
- `sourceMonitorVideoCount`: 3
- `videoProxyReadyCount`: 3
- `videoBlockedCount`: 0
- `audioReadyCount`: 2
- `showDecisionCount`: 236
- `skipDecisionCount`: 118
- `rawVaultCount`: 0
- `playbackMode`: Play Edit
- `validRangeCount`: 29

Observed local UI state:
- Screenshot captured at `/tmp/quipslystudio-episode1-proxy-whole-lane-ui.png`.
- macOS showed the removable-volume access prompt for `QuipslyMac`. The user may need to click `Allow` once so the app can read external originals while still using proxies for playback.

Product invariant reminder:
- Do not convert Premiere rescue data into chopped clips.
- Do not move raw originals into the vault for preview.
- Use full synced source lanes plus SHOW/SKIP metadata overlays.
- Use proxy-backed playback for video lanes.

## 2026-06-15 External folder lane matching pass

Goal: let Episode 1 live media copied to an external drive be matched back to the current rescue session without re-importing Premiere structure or creating chopped clips.

Implemented in `apps/QuipslyStudio/Sources/SharedUI/WorkspaceView.swift`:
- Added `Match Folder` beside the `Storage` control in the production action bar.
- Added `Match lanes` inside the external originals access panel.
- Added `EpisodeMediaFolderMatcher`, a bounded filename matcher for existing lanes only.
- Matching relinks existing source lanes to whole external originals and uses the existing proxy generation path for video.
- The matcher does not create new lanes, split media, infer edits, or mutate SHOW/SKIP decisions.

Validation:
- `./script/build_and_run.sh --verify` passed.
- `./script/smoke_episode1_metadata_decision.sh` passed.
- `./script/smoke_episode1_transports.sh` passed.
- `./script/smoke_episode1_production_ready.sh --no-build` passed.

Current proof state remained intact after the UI/workflow change:
- 5 whole source lanes.
- 3 video source monitors.
- 3 video lanes proxy-backed.
- 0 raw vault video paths.
- 236 SHOW decisions and 118 SKIP decisions.
- Play Edit uses 29 valid ranges; Play Through uses the full range.

Operator note:
- If `/Volumes/My Passport` is slow or empty from shell, use the in-app `Storage` control and allow macOS removable-volume access, then use `Match Folder` on the actual copied Episode 1 folder.

## 2026-06-15 Timeline decision coverage rail pass

Goal: make active/inactive editing state easier to read without changing the underlying model.

Implemented in `apps/QuipslyStudio/Sources/SharedUI/TimelineEditorView.swift`:
- Added a decision coverage rail at the bottom of each continuous source lane.
- Blue means the whole synced source lane exists.
- Yellow means SHOW decisions included in Play Edit.
- Red means SKIP decisions removed from Play Edit.
- The rail is visual only and does not mutate source media, split lanes, or create clips.

Validation after this UI pass:
- `./script/build_and_run.sh --verify` passed.
- `./script/smoke_episode1_metadata_decision.sh` passed.
- `./script/smoke_episode1_transports.sh` passed.
- `./script/smoke_episode1_production_ready.sh --no-build` passed.

Screenshot:
- `/tmp/quipslystudio-decision-coverage-rail.png`

## 2026-06-15 Live-switch invariant smoke

Goal: protect keyboard/live-switch editing semantics from drifting back into clipped media or destructive timeline mutation.

Added:
- `apps/QuipslyStudio/script/smoke_episode1_live_switch.sh`

What it proves:
- Loads Episode 1 whole-lane rescue baseline.
- Runs `/decision?action=charlie&start=61.5&duration=1.25`.
- Confirms the live switch adds SHOW decisions to Charlie lanes and SKIP decisions to non-Charlie lanes.
- Confirms lane count, source monitor count, proxy readiness, audio readiness, raw-vault count, and whole-lane source/proxy signatures stay unchanged.
- Restores the Episode 1 baseline afterward.

Latest result:
- Charlie live switch found 2 Charlie lanes and 3 non-Charlie lanes.
- SHOW decisions changed 236 -> 238.
- SKIP decisions changed 118 -> 121.
- Whole source/proxy signatures remained unchanged.
- `Episode 1 live switch smoke PASSED.`

## 2026-06-15 AgentServer match-folder route

Goal: make external-folder lane matching testable and automatable without driving the UI.

Added:
- `GET /match_folder?path=<absolute-folder-path>` in `apps/QuipslyStudio/Sources/SharedUI/AgentServer.swift`.
- `match_folder` command handling in `apps/QuipslyStudio/Sources/SharedUI/WorkspaceView.swift`.

Behavior:
- Runs the same bounded `EpisodeMediaFolderMatcher` used by the native `Match Folder` button.
- Relinks existing lanes only.
- Queues proxies through the existing video relink path.
- Does not create new lanes, clip media, or alter decision semantics.

Validation:
- `./script/build_and_run.sh --verify` passed.
- `/commands` now lists `GET /match_folder?path=<absolute-folder-path>`.
- `./script/smoke_episode1_live_switch.sh` passed.
- `./script/smoke_episode1_metadata_decision.sh` passed.
- `./script/smoke_episode1_transports.sh` passed.
- `./script/smoke_episode1_production_ready.sh --no-build` passed.

Known debt:
- `AgentServer.swift` now surfaces an existing Swift actor-isolation warning around `parseRequest`. It does not block this build, but it should be cleaned up before hardening the local control API further.

## 2026-06-15 Seek and program-state smoke

Goal: make timeline scrubbing and program-monitor state testable through the real running app.

Added:
- `GET /seek?time=<seconds>` in `apps/QuipslyStudio/Sources/SharedUI/AgentServer.swift`.
- `seek` command handling in `apps/QuipslyStudio/Sources/SharedUI/WorkspaceView.swift`.
- `currentProgramTitle` and `currentProgramDetail` in the local AgentServer `/state` payload.
- `apps/QuipslyStudio/script/smoke_episode1_seek_program_state.sh`.

What the smoke proves:
- `/commands` advertises `/seek?time=<seconds>`.
- Seeking to 0s, 61.5s, and 42.25s updates app playhead state.
- Program-state text is present after each seek.
- Play Through mode still maps to a single full valid range.
- Lane count, proxy readiness, raw-vault count, SHOW/SKIP counts, and source/proxy signatures do not change during scrubbing.

Latest result:
- `seekZero`: playhead 0, program `Showing Homer Camera - NewHomerExport.MP4`, mode `Play Edit`.
- `seekMid`: playhead 61.5, program shows Charlie/Homer/audio active set, mode `Play Edit`.
- `through`: playhead 42.25, mode `Play Through`, validRangeCount 1.
- `Episode 1 seek/program-state smoke PASSED.`

Validation bundle:
- `./script/build_and_run.sh --verify` passed.
- `./script/smoke_episode1_seek_program_state.sh` passed.
- `./script/smoke_episode1_live_switch.sh` passed.
- `./script/smoke_episode1_metadata_decision.sh` passed.
- `./script/smoke_episode1_transports.sh` passed.
- `./script/smoke_episode1_production_ready.sh --no-build` passed.

## 2026-06-15 Selected decision and source-player state observability

Goal: make selected decision/edit readiness visible to the local control surface so future trim, delete, nudge, and inspector work can be verified instead of guessed.

Added to `/state` in `apps/QuipslyStudio/Sources/SharedUI/WorkspaceView.swift`:
- `selectedTagId`
- `selectedTagType`
- `selectedTagStart`
- `selectedTagDuration`
- `selectedTagLaneName`
- `sourcePlayerCount`

Also added helper:
- `selectedTagContext(in:)`

Validation after state payload change:
- `./script/build_and_run.sh --verify` passed.
- `./script/smoke_episode1_seek_program_state.sh` passed.
- `./script/smoke_episode1_live_switch.sh` passed.
- `./script/smoke_episode1_metadata_decision.sh` passed.
- `./script/smoke_episode1_transports.sh` passed.
- `./script/smoke_episode1_production_ready.sh --no-build` passed.

Notes:
- The older macOS `onChange(of:perform:)` deprecation warnings still remain in `WorkspaceView.swift`; they do not block current editor behavior.
- The previous `AgentServer.parseRequest` actor warning was cleared by making the pure parser nonisolated.

## 2026-06-15 Selected decision edit API and live-media proof

Goal: prove that Episode 1 decisions can be selected, nudged, and trimmed as metadata overlays while the editor preserves whole synced source lanes and proxy-backed playback.

Added local AgentServer routes:
- `GET /select_tag?lane_id=<uuid-or-name>&tag_id=<uuid>`
- `GET /nudge_selected?delta=<seconds>`
- `GET /trim_selected?start_delta=<seconds>&duration_delta=<seconds>`
- `GET /delete_selected_tag`

Added:
- `apps/QuipslyStudio/script/smoke_episode1_selected_decision_edit.sh`

What the smoke proves:
- Loads the Episode 1 Premiere rescue baseline.
- Relinks the five expected live media files from `/Volumes/My Passport/Episode 1`.
- Selects an existing proxy-backed SHOW decision.
- Nudges that decision by `+0.25s`.
- Trims that decision by `+0.10s` start and `-0.10s` duration.
- Confirms lane count, source monitor count, proxy readiness, raw-vault count, SHOW count, SKIP count, and whole-lane source/proxy signatures stay unchanged during the edit.
- Reloads the Episode 1 baseline and verifies the temporary decision mutation is gone.
- Compares restored source identity using stable lane/source/proxy fields, not regenerated UUIDs.

Latest selected-decision target:
- Lane: `Charlie Camera - MVI_3999.MP4`
- Original decision start: `562.937375`
- Original decision duration: `8.133125`
- Nudged decision start: `563.187375`
- Trimmed decision start: `563.287375`
- Trimmed decision duration: `8.033125`

Validation bundle passed against the live external Episode 1 files:

```bash
cd /Users/wall-e/Dev/high-ground-studio/apps/QuipslyStudio
./script/build_and_run.sh --verify
./script/smoke_episode1_selected_decision_edit.sh
./script/smoke_episode1_seek_program_state.sh
./script/smoke_episode1_live_switch.sh
./script/smoke_episode1_metadata_decision.sh
./script/smoke_episode1_transports.sh
./script/smoke_episode1_production_ready.sh --no-build
```

Final proof state:
- Whole lanes: `5`
- Video source monitors: `3`
- Proxy-backed video lanes: `3`
- Raw vault paths: `0`
- SHOW decisions: `236`
- SKIP decisions: `118`
- `Play Edit` valid ranges: `29`
- `Play Through` valid ranges: `1`
- Production readiness: `true`

Important invariant:
- The live Episode 1 media on the external drive is source truth.
- The editor previews through deterministic proxy files.
- Decision edits mutate `VideoTag` overlays only.
- Do not convert restored Premiere decisions into clipped source media.

## 2026-06-15 Selected decision inspector UI pass

Goal: make selected edit decisions visible and editable in the real editor UI, not only through AgentServer JSON.

Implemented in `apps/QuipslyStudio/Sources/SharedUI/WorkspaceView.swift`:
- Added an always-visible selected-decision quick strip below the program summary when a decision is selected.
- The quick strip shows decision type, lane name, start, end, and duration.
- Quick actions now include small nudge buttons, trim in/out, jump to decision start, and clear selection.
- Expanded the Details drawer selected-decision panel with:
  - lane start
  - lane end
  - duration
  - sequence time
  - large nudge controls for `-10s`, `-1s`, `-0.1s`, `+0.1s`, `+1s`, `+10s`
  - boundary controls for start/end adjustments
  - explicit clear and delete controls
- Selection, nudge, trim, clear, and delete now update `lastMediaAction` and AgentServer state immediately instead of waiting for autosave/timer refresh.

Validation:

```bash
cd /Users/wall-e/Dev/high-ground-studio/apps/QuipslyStudio
bash -n script/smoke_episode1_selected_decision_edit.sh
./script/build_and_run.sh --verify
./script/smoke_episode1_selected_decision_edit.sh
./script/smoke_episode1_seek_program_state.sh
./script/smoke_episode1_live_switch.sh
./script/smoke_episode1_metadata_decision.sh
./script/smoke_episode1_transports.sh
./script/smoke_episode1_production_ready.sh --no-build
```

Smoke evidence:
+- Selected a proxy-backed SHOW decision on `Charlie Camera - MVI_3999.MP4`.
+- Nudged it from `562.937375s` to `563.187375s`.
+- Trimmed it to start at `563.287375s` with duration `8.033125s`.
+- Deleted the selected decision in the temporary session: SHOW count changed `236 -> 235`; SKIP stayed `118`.
+- Reloaded the baseline and restored `236` SHOW decisions and `118` SKIP decisions.
+- Whole source lane count stayed `5`.
+- Proxy-backed video lane count stayed `3`.
+- Raw vault path count stayed `0`.

Visual proof:
+- `/tmp/quipslystudio-selected-decision-ui.png`
+- The screenshot shows the real app with the selected-decision quick strip visible above the live-switch controls.

Known UX issue:
+- macOS can still show the removable-volume access prompt for `/Volumes/My Passport`; that is a storage-access onboarding problem, not permission to fall back to raw-video preview or chopped clips.

Next production-editor target:
+- Make monitor cards larger and more dominant above the timeline.
+- Add direct click targets for previous/next decision and selected-decision boundary handles that feel obvious at Episode 1 density.
+- Add a visible “source lane vs program output” teaching strip so first-time users immediately understand that edits are overlays on whole lanes.
+EOF

## 2026-06-15 Monitor wall dominance pass

Goal: make the editor open around the actual multi-cam cockpit: a prominent Program Output plus a horizontal wall of whole synced source monitors. This is a UI hierarchy pass only; the source/edit architecture remains whole lanes plus SHOW/SKIP metadata overlays.

Implemented in `apps/QuipslyStudio/Sources/SharedUI/WorkspaceView.swift`:
- Reworked `monitorWall` so Program Output is the primary visual surface.
- Added an explicit monitor truth strip:
  - `PROGRAM`: what the edit shows
  - `SOURCES`: whole synced lanes
  - `PROXIES`: safe preview media
  - `SHOW/SKIP`: metadata overlays
- Moved current program state and selected-decision quick actions next to the Program Output area.
- Changed source monitors from a cramped side grid into a larger horizontal source wall.
- Enlarged source cards and kept each card labeled as a whole synced source lane with proxy/readiness and SHOW/SKIP state.
- Added `/state` layout fields:
  - `monitorWallLayout: program_star_with_horizontal_source_wall`
  - `sourceMonitorLayout: horizontal_whole_lane_cards`

Validation:

```bash
cd /Users/wall-e/Dev/high-ground-studio/apps/QuipslyStudio
./script/build_and_run.sh --verify
./script/smoke_episode1_selected_decision_edit.sh
./script/smoke_episode1_seek_program_state.sh
./script/smoke_episode1_live_switch.sh
./script/smoke_episode1_metadata_decision.sh
./script/smoke_episode1_transports.sh
./script/smoke_episode1_production_ready.sh --no-build
./script/build_and_run.sh --verify
./script/smoke_episode1_production_ready.sh --no-build
```

State proof after the pass:

```json
{
  "monitorWallModel": "program_output_plus_whole_source_lanes",
  "monitorWallLayout": "program_star_with_horizontal_source_wall",
  "sourceMonitorLayout": "horizontal_whole_lane_cards",
  "sourceMonitorVideoCount": 3,
  "productionReady": true
}
```

Visual proof:
- `/tmp/quipslystudio-monitor-wall-dominant.png`
- `/tmp/quipslystudio-monitor-wall-dominant-wide.png`

Known UX issue:
- The real app window still had a macOS removable-volume permission prompt over the monitor wall during screenshot capture. Do not click this automatically without the user. The smoke suite proves proxy-safe playback/edit state without needing to accept the prompt, but explicit external-original operations still need a user-granted storage-access flow.
- The app/window can preserve scroll position after relaunch, so the next UX pass should add a simple “Focus monitors” control or restore-to-top behavior when loading an episode.

Next target:
- Add a first-class Monitor Focus command/button that scrolls or lays out the editor so Program Output and source wall are always immediately visible after loading an episode.
- Continue improving dense-timeline boundary handles and previous/next decision review.

## 2026-06-15 Monitor focus control pass

Goal: make the native editor reliably return to the Program Output and whole-source monitor wall after loading an episode, running automation, or drifting down into timeline/detail controls.

Implemented in `apps/QuipslyStudio/Sources/SharedUI/WorkspaceView.swift`:
- Wrapped the workspace in `ScrollViewReader` + vertical `ScrollView`.
- Added stable workspace scroll targets for:
  - `workspace-monitors`
  - `workspace-timeline`
- Added a visible `Focus Monitors` button in the production action bar.
- Added `requestMonitorFocus(reason:)`, which:
  - closes the production details drawer,
  - records a user-facing action message,
  - scrolls back to the monitor wall.
- Automatically requests monitor focus after active sequence changes and on launch when a sequence is already loaded.
- Added `/focus_monitors` to the local AgentServer.
- Added `/state` proof field:
  - `monitorFocusBehavior: focus_monitors_scrolls_to_program_and_source_wall`

Implemented in `apps/QuipslyStudio/Sources/SharedUI/AgentServer.swift`:
- `GET /focus_monitors`
- `/commands` advertises `GET /focus_monitors`.

Validation:

```bash
cd /Users/wall-e/Dev/high-ground-studio/apps/QuipslyStudio
./script/build_and_run.sh --verify
./script/smoke_episode1_production_ready.sh --no-build
python3 - <<'PY'
import json, urllib.request, time
base='http://127.0.0.1:8080'
commands=json.load(urllib.request.urlopen(base+'/commands'))
assert 'GET /focus_monitors' in '\n'.join(commands.get('commands', []))
json.load(urllib.request.urlopen(base+'/focus_monitors'))
time.sleep(0.5)
state=json.load(urllib.request.urlopen(base+'/state'))
assert state['monitorWallModel'] == 'program_output_plus_whole_source_lanes'
assert state['monitorWallLayout'] == 'program_star_with_horizontal_source_wall'
assert state['sourceMonitorLayout'] == 'horizontal_whole_lane_cards'
assert state['monitorFocusBehavior'] == 'focus_monitors_scrolls_to_program_and_source_wall'
assert state['lastMediaAction'] == 'Focused monitor wall from local control'
assert state['productionReady'] is True
PY
```

State proof:

```json
{
  "monitorWallModel": "program_output_plus_whole_source_lanes",
  "monitorWallLayout": "program_star_with_horizontal_source_wall",
  "sourceMonitorLayout": "horizontal_whole_lane_cards",
  "monitorFocusBehavior": "focus_monitors_scrolls_to_program_and_source_wall",
  "lastMediaAction": "Focused monitor wall from local control",
  "productionReady": true,
  "sourceMonitorVideoCount": 3
}
```

Visual proof:
- `/tmp/quipslystudio-focus-monitors.png`

Result:
- The focused view shows Program Output prominently and all three Episode 1 source cards visible below it.
- The source cards preserve the correct truth language: proxy-backed, whole synced source lane, never clipped, SHOW/SKIP state.

Known issue:
- macOS removable-volume permission prompt still appears over the program monitor until the user allows or denies it. This should become a dedicated storage-access onboarding step, but it is not a reason to fall back to raw playback or duplicate raw sources into the vault.

Next target:
- Add a dedicated storage-access readiness/onboarding panel so external-drive permission is requested intentionally before live editing, not as a surprise system sheet.
- Add previous/next selected-decision review controls directly near the monitor wall so the user can inspect decisions without diving into the timeline.

## 2026-06-15 storage access / proxy policy pass

Goal: keep Episode 1 editable from live external-drive media without drifting back into Premiere-style chopped clips or touching raw originals during normal preview.

What changed:

- Routine source readiness no longer probes `/Volumes/...` original paths unless external folder access is active and the path is inside the granted root.
- `SourceReadiness` now distinguishes preview readiness from original-storage access:
  - video can be `Proxy ready` and still need storage access later,
  - audio can be linked by declared external path without forcing a read,
  - lane-level agent state now includes `needsStorageAccess`.
- App state now reports:
  - `storageAccessNeededCount`,
  - `externalMediaRootPath`,
  - `externalMediaAccessActive`.
- Added a calm storage-access banner: proxy editing is safe first; grant external folder access only when export/waveform/original-file operations are needed.
- `AVCompositionBuilder.buildPlayerItem(...)` now takes `allowExternalOriginalMedia`; preview rebuilds pass `externalMediaAccess.hasActiveAccess` and will not fall back to raw `/Volumes/...` originals.
- `ExportEngine.export(...)` carries the same explicit original-media policy.
- The export button now blocks with a clear message when originals are external and storage access has not been granted.
- Timeline waveform rendering now prefers proxy media and refuses to analyze ungranted external originals.
- Agent/local relink no longer calls `FileManager.fileExists` on ungranted `/Volumes/...` paths. It preserves the external original path as metadata and relies on existing proxies for preview.

Validation:

```bash
./script/build_and_run.sh --verify
./script/smoke_episode1_production_ready.sh --no-build
```

Observed Episode 1 proof:

```json
{
  "productionReady": true,
  "videoProxyReadyCount": 3,
  "videoBlockedCount": 0,
  "audioReadyCount": 2,
  "showDecisionCount": 236,
  "skipDecisionCount": 118,
  "rawVaultCount": 0,
  "validRangeCount": 29,
  "laneCount": 5,
  "sourceMonitorVideoCount": 3,
  "storageAccessNeededCount": 5,
  "externalMediaAccessActive": false
}
```

Visual proof paths:

```text
/tmp/quipslystudio-storage-onboarding.png
/tmp/quipslystudio-storage-policy-clean-restart.png
/tmp/quipslystudio-isolate-empty-launch.png
/tmp/quipslystudio-after-kill-no-app.png
```

Important finding:

A macOS removable-volume permission dialog remained visible even after `pkill -9 QuipslyMac`; screenshot `/tmp/quipslystudio-after-kill-no-app.png` shows the prompt with no QuipslyMac process. That means at least the currently visible dialog is stale system UI, not proof of an active app file read. Codex could not dismiss it because AppleScript/System Events lacks assistive access on this machine. The human operator can safely choose `Don’t Allow`; that grants nothing. After dismissal, rerun the clean restart smoke to confirm the fixed app does not recreate it.

Remaining risks / next pass:

- `WaveformGenerator` has a Swift 6 sendability warning around captured waveform arrays. Clean this before Swift 6 mode.
- `AVCompositionBuilder` still has some unused local variables and actor-isolation warnings. Clean these separately from product behavior.
- `vaultReachableLanes()` is a user-triggered path that still checks source file existence; before making it prominent, make it use the same external-access policy.
- Export is now gated when external originals need access; the next production pass should provide a clear export-readiness checklist and a one-click `Grant external folder access` path.

## 2026-06-15 Episode 1 whole-lane/proxy hardening pass

Intent: keep Episode 1 pointed at the real Quipsly editor model, not Premiere's chopped-clip model.

What changed:
- `WorkspaceView.vaultReachableLanes()` no longer probes ungranted `/Volumes/...` original media paths. It now asks for external storage access before vaulting originals and leaves proxy editing safe.
- `TimelineEditorView` now has an explicit truth legend: whole synced lanes, Play Edit SHOW decisions, skipped gaps, and proxy-first originals-untouched policy.
- Base source lanes now render with a blue inactive-context hatch and stronger lane labels so the timeline reads as continuous source media with decision overlays, not fragmented clips.
- Dense decision badges now say `continuous lane` and report SHOW/SKIP counts to reinforce the data model.

Validated:
- `./script/build_and_run.sh --verify` passed.
- `./script/smoke_episode1_production_ready.sh --no-build` passed.
- Agent state after smoke:
  - `productionReady: true`
  - `videoProxyReadyCount: 3`
  - `videoBlockedCount: 0`
  - `audioReadyCount: 2`
  - `showDecisionCount: 236`
  - `skipDecisionCount: 118`
  - `rawVaultCount: 0`
  - `validRangeCount: 29`
  - `laneCount: 5`
  - `sourceMonitorVideoCount: 3`
  - `storageAccessNeededCount: 5`
  - `externalMediaAccessActive: false`

Current product invariant:
- Whole synced source lanes are truth.
- SHOW/SKIP/camera-selection decisions are metadata overlays.
- Proxies are the preview/editing path.
- External originals are only touched for explicit original-file operations such as export/relink/vault/waveform after storage access is granted.

Next high-value target:
- Make the UI proof visual, not just state-based: open the app with the external media prompt dismissed, confirm the monitor wall and timeline show 3 source monitors + continuous lanes + yellow/red decision overlays, then tighten any remaining layout/readability issues.

## 2026-06-15 Episode 1 audio proxy tightening

Intent: make production readiness require local preview media for audio as well as video.

What changed:
- `LocalMediaVault.proxyURL(for:)` now returns `.m4a` proxy paths for audio sources and `.mp4` proxy paths for video sources.
- `ProxyEngine.generateProxy(for:)` now supports audio proxy generation via ffmpeg AAC/M4A output.
- `WorkspaceView.sourceReadiness(for:)` now treats audio as ready only when a local audio proxy exists. External WAV linkage alone is `Audio proxy needed` or `Audio proxy pending`, not production-ready.
- Vault/relink/import paths now prepare proxy URLs for audio too, instead of setting audio proxy to `nil`.
- Episode 1 smoke now expects audio playback paths to point at the local proxy vault and prints concise audio blocker summaries on timeout.

Validation:
- `./script/build_and_run.sh --verify` passed after the code change.
- The stricter Episode 1 smoke correctly failed because `/Volumes/My Passport/Episode 1/*.wav` content reads return `Interrupted system call`.
- `stat` can see the WAV metadata, but `ffprobe`, `ffmpeg`, Python file reads, and shallow `find` against the folder hit `Interrupted system call` or hang.

Current state:
- Video preview is clean: 3 proxy-backed source lanes, 0 video blockers.
- Audio preview is not yet clean: 2 audio lanes are `Audio proxy pending` with planned M4A vault paths.
- Production readiness now reports false until those audio proxies exist.

Next operator action:
- Fix the external-drive read issue or grant the relevant process access, then rerun `./script/smoke_episode1_production_ready.sh --no-build` so Quipsly can generate the two M4A audio proxies.
- Do not weaken the readiness rule back to `Audio ready` from linked WAV paths; that would hide the real editing blocker.

## 2026-06-15 proxy blocker workflow pass

Intent: make local proxy readiness a production editor workflow, not an ambiguous global error.

What changed:
- Added transient lane-level proxy failure state in `WorkspaceView`.
- `sourceReadiness(for:)` now reports `Audio proxy blocked` / `Proxy blocked` when a proxy job cannot proceed.
- `/state` now exposes `sourceReadinessDetail`, `proxyError`, and `proxyBlockedCount`.
- Added `/retry_proxies` to the local agent server.
- Added a production-details proxy issue panel listing each blocked lane with its planned local proxy path, clear explanation, select action, Grant/Restore folder access, and Retry pending proxies.
- Proxy retry now refuses calmly when external storage access is not active instead of trying to read `/Volumes/...` and producing low-level ffmpeg errors.

Validated:
- `./script/build_and_run.sh --verify` passed.
- `curl http://127.0.0.1:8080/retry_proxies` returns `retry_proxies_commanded`.
- `/state` after retry reports:
  - `videoProxyReadyCount: 3`
  - `audioReadyCount: 0`
  - `proxyBlockedCount: 2`
  - `productionReady: false`
  - `productionReadinessDetail: 2 proxy job(s) are blocked. Grant external storage access or relink readable originals, then retry pending proxies.`

Current operator path:
1. Open Quipsly Mac / QuipslyStudio.
2. Open production details.
3. Grant the external Episode 1 folder access.
4. Click Retry pending proxies.
5. Rerun `./script/smoke_episode1_production_ready.sh --no-build`.

Do not weaken the rule:
- External WAV linkage is not production-ready audio.
- Audio must have local M4A proxy playback before Episode 1 is considered ready to edit.

## 2026-06-15 Episode 1 live-media preflight update

New scripts added under `apps/QuipslyStudio/script`:

```bash
./script/smoke_episode1_editor_architecture.sh --no-build
./script/preflight_episode1_media.sh
```

The architecture smoke is intentionally separate from production media readiness. It proves the product model without pretending blocked local media is solved:

- Episode 1 is represented as whole synced source lanes, not chopped Premiere clips.
- `SHOW` and `SKIP` are edit-decision overlays.
- `Play Edit` has 29 valid ranges and skips inactive gaps.
- The monitor wall reports 3 video source monitors.
- Current proof values: 236 `SHOW` decisions, 118 `SKIP` decisions, 3 video proxies ready, 0 audio proxies ready.

The live-media preflight now gives bounded diagnostics for `/Volumes/My Passport/Episode 1` and separates two states that must not be confused:

- `proxy_ready_source_slow`: the raw original is slow/unreadable right now, but local proxy playback is ready.
- `proxy_generation_blocked`: the editor still needs to read the source once to create the proxy.

Current Episode 1 result:

- 3 video lanes are `proxy_ready_source_slow`; they are safe for proxy-backed preview/editing.
- 2 audio lanes are `proxy_generation_blocked`; `First Pod Ever.wav` and `HomerAudio.wav` time out while reading first bytes from the external drive, so audio proxy generation cannot finish yet.
- No expected Episode 1 source files are missing.

Do not respond to the audio blocker by importing clipped Premiere segments or by falling back to giant raw originals for preview. The correct next operator action is to make the two WAV files readable from local storage or a healthy external volume, then rerun:

```bash
cd /Users/wall-e/Dev/high-ground-studio/apps/QuipslyStudio
./script/preflight_episode1_media.sh
./script/smoke_episode1_production_ready.sh --no-build
```

If the WAVs still time out, copy only those audio originals to a known-good local/external media staging folder, relink the two audio lanes, and regenerate their `.m4a` proxies. Keep video lanes proxy-backed; do not rebuild the timeline as chopped clips.

Strict production smoke confirmation:

```bash
./script/smoke_episode1_production_ready.sh --no-build
```

Result: failed intentionally after waiting for audio proxies. Last state reported both audio lanes as `Audio proxy blocked` with `needsStorageAccess: true`. This is the correct behavior until the app is granted access to readable WAV originals or those WAVs are copied/relinked from a stable local/external path.

## 2026-06-15 follow-up: audio proxy blocker made first-class

Small production-editor hardening pass:

- `script/agentctl.sh` now exposes the correct whole-source recovery commands:
  - `./script/agentctl.sh match-folder "/Volumes/My Passport/Episode 1"`
  - `./script/agentctl.sh retry-proxies`
- `script/preflight_episode1_media.sh` now prints `nextActions` and keeps these states separate:
  - `proxy_ready_source_slow`: proxy preview is safe, raw original is slow/unreadable right now.
  - `proxy_generation_blocked`: a source still needs to be read once to create the local proxy.
- The native editor readiness bar now shows `audio blocked` separately and reports: `2 audio/context lane(s) need local audio proxies before production editing, waveform work, or sync review.`

Validation after this pass:

```bash
bash -n script/agentctl.sh
bash -n script/preflight_episode1_media.sh
./script/build_and_run.sh --verify
./script/preflight_episode1_media.sh
./script/smoke_episode1_editor_architecture.sh --no-build
./script/agentctl.sh commands
```

Current state remains intentionally not production-ready:

- Architecture smoke passes.
- Episode 1 still has 236 `SHOW` decisions, 118 `SKIP` decisions, 29 `Play Edit` ranges, and 3 source monitors.
- 3 video lanes are proxy-backed and safe for preview.
- 2 audio lanes still need local `.m4a` proxies.

Do not solve this by chopping source media or previewing giant raw originals. The next correct unblock is storage/readability: grant/restore Episode 1 folder access in the app or relink the audio lanes to readable copies of `First Pod Ever.wav` and `HomerAudio.wav`, then run `match-folder` and `retry-proxies`.

Additional UI cleanup in the same pass:

- Proxy issue rows now include a direct `Relink...` button.
- This opens the existing whole-source relink file picker for that lane, selects the lane, and queues proxy generation through the same non-destructive path.
- This is intended especially for the two Episode 1 audio lanes: relink to readable full WAV originals, not chopped clips.

Post-build validation:

```bash
./script/build_and_run.sh --verify
./script/smoke_episode1_editor_architecture.sh --no-build
./script/preflight_episode1_media.sh
```

Result: build passes, architecture smoke passes, preflight still reports 3 proxy-ready video lanes and 2 audio proxy-generation blockers. That means the app is stronger and clearer, but the production editor is not yet fully ready until the audio proxies exist.

## 2026-06-15 follow-up: staged audio recovery path

Added a non-destructive helper for the current Episode 1 blocker:

```bash
./script/stage_episode1_audio_for_proxy.sh
./script/stage_episode1_audio_for_proxy.sh --copy --relink --retry
```

Default mode is a dry run. It probes only the two expected Episode 1 WAV originals:

- `First Pod Ever.wav`
- `HomerAudio.wav`

It stages whole audio originals only. It does not create chopped clips, does not touch `SHOW`/`SKIP` decisions, and does not preview from raw WAVs. After `--copy --relink --retry`, Quipsly should relink the existing whole audio lanes from the staging folder and generate `.m4a` proxies.

The preflight and strict production smoke now support separate audio staging:

```bash
EPISODE1_AUDIO_DIR="$HOME/Movies/Quipsly/Staging/Episode 1 Audio" ./script/preflight_episode1_media.sh
EPISODE1_AUDIO_DIR="$HOME/Movies/Quipsly/Staging/Episode 1 Audio" ./script/smoke_episode1_production_ready.sh --no-build
```

Current validation:

```bash
bash -n script/stage_episode1_audio_for_proxy.sh
bash -n script/preflight_episode1_media.sh
bash -n script/smoke_episode1_production_ready.sh
./script/stage_episode1_audio_for_proxy.sh
./script/smoke_episode1_editor_architecture.sh --no-build
./script/build_and_run.sh --verify
```

Current result:

- Native build/launch verify passes.
- Episode 1 architecture smoke passes.
- Video proxy preview remains safe: 3 video/reference lanes are proxy-backed.
- Audio staging dry run is blocked because both external WAV reads return `Interrupted system call`.

This is now a source-readability problem, not an editor architecture problem. The next operator unblock is to make the two WAVs readable from any stable folder, then run the staging helper with `EPISODE1_MEDIA_DIR=<that-folder>` and `--copy --relink --retry`.

## 2026-06-15 follow-up: visual rough cut readiness is separate from production readiness

Added a truthful rough-cut state to the native editor:

- UI now shows a `Visual rough cut is usable` panel when video proxies and SHOW decisions are ready.
- `/state` now exposes:
  - `visualRoughCutReady`
  - `visualRoughCutDetail`
  - `audioBlockedCount`
- The architecture smoke now requires `visualRoughCutReady: true` for Episode 1.

This is intentionally not the same as `productionReady`.

Current Episode 1 proof:

```json
{
  "visualRoughCutReady": true,
  "productionReady": false,
  "videoProxyReadyCount": 3,
  "audioReadyCount": 0,
  "audioBlockedCount": 2,
  "showDecisionCount": 236,
  "skipDecisionCount": 118,
  "validRangeCount": 29,
  "sourceMonitorVideoCount": 3
}
```

Interpretation:

- The editor can review and switch the edit visually from proxy-backed video lanes.
- Production editing, waveform work, sync review, and export still wait on the two audio `.m4a` proxies.
- Do not weaken the production gate to make the status green. Keep both truths visible.

## 2026-06-15 follow-up: visual rough-cut workflow smoke

Added a focused rough-cut workflow gate:

```bash
./script/smoke_episode1_visual_rough_cut.sh --no-build
```

This smoke proves more than a readiness flag. It drives the running app through the local agent server and verifies:

- Episode 1 loads as whole source lanes.
- Three video/reference source players exist for the monitor wall.
- Video/reference lanes are proxy-backed.
- `Play Edit` is selected with 29 valid ranges.
- A real `SHOW` decision can be selected.
- Seeking into a real `SHOW` decision produces a visible program summary.
- `Play Through` can be selected and collapses valid ranges to 1.
- Switching back to `Play Edit` restores 29 valid ranges.
- `visualRoughCutReady` remains true while `productionReady` remains false.

Current proof summary:

```json
{
  "visualRoughCutReady": true,
  "productionReady": false,
  "playbackMode": "Play Edit",
  "sourcePlayerCount": 3,
  "sourceMonitorVideoCount": 3,
  "videoProxyReadyCount": 3,
  "audioReadyCount": 0,
  "audioBlockedCount": 2,
  "showDecisionCount": 236,
  "skipDecisionCount": 118,
  "validRangeCount": 29
}
```

Validation order matters. Do not run app rebuild concurrently with smokes that call the local agent server. Correct sequence:

```bash
./script/build_and_run.sh --verify
./script/smoke_episode1_editor_architecture.sh --no-build
./script/smoke_episode1_visual_rough_cut.sh --no-build
./script/preflight_episode1_media.sh
```

The final preflight still exits nonzero until the two audio WAVs are readable and `.m4a` proxies exist. That is expected; visual rough-cut readiness is now proven separately from production readiness.

## 2026-06-15 follow-up: non-destructive decision-edit smoke

Added a focused decision-edit gate:

```bash
./script/smoke_episode1_decision_edit.sh --no-build
```

This smoke proves the editor can perform actual edit-decision work without converting sources into clipped media:

- Loads Episode 1 as whole lanes.
- Adds one temporary `SHOW` decision to the Charlie Camera lane.
- Selects that temporary decision.
- Nudges it by `+0.1s`.
- Trims its duration by `+0.2s`.
- Deletes it.
- Verifies lane count, source path, proxy playback path, `SHOW` count, `SKIP` count, and valid-range count return to baseline.

Current proof summary:

```json
{
  "decisionEditReady": true,
  "visualRoughCutReady": true,
  "productionReady": false,
  "laneCount": 5,
  "videoProxyReadyCount": 3,
  "audioReadyCount": 0,
  "audioBlockedCount": 2,
  "showDecisionCount": 236,
  "skipDecisionCount": 118,
  "validRangeCount": 29
}
```

Current sequential validation ladder:

```bash
./script/build_and_run.sh --verify
./script/smoke_episode1_editor_architecture.sh --no-build
./script/smoke_episode1_visual_rough_cut.sh --no-build
./script/smoke_episode1_decision_edit.sh --no-build
./script/preflight_episode1_media.sh
```

The first four pass. The final preflight intentionally exits nonzero while the two audio WAVs remain unreadable and audio proxies are missing.

## 2026-06-15 follow-up: live decision behavior matrix

Tightened the local agent/live-decision path so it matches the editor's source-lane model instead of relying on legacy mutable command fields.

Important implementation details:

- `/decision` now enters the queued local agent command path in `AgentServer.swift`.
- Agent decisions are interpreted as sequence-time requests and converted to lane-local `VideoTag` ranges before adding overlays.
- Decision action names are normalized so `charlie+clip`, `charlie clip`, `charlie_clip`, and `charlie-clip` map to the same product behavior.
- When a behavior creates both `SHOW` and `SKIP` overlays, the selected decision prefers a `SHOW` tag so the inspector lands on the edit the human most likely wants to adjust.
- The production gate remains honest: these are visual/editor behavior proofs, not audio/export readiness.

Added a behavior-matrix smoke:

```bash
./script/smoke_episode1_decision_behavior_matrix.sh --no-build
```

This proves all agreed MVP behavior buttons against Episode 1:

- `charlie`
- `homer`
- `both`
- `skip`
- `charlie+clip`
- `homer+clip`

Current proof summary:

```json
{
  "decisionBehaviorMatrixReady": true,
  "visualRoughCutReady": true,
  "productionReady": false,
  "sequenceStart": 61.5,
  "sequenceDuration": 1.25,
  "restored": {
    "showDecisionCount": 236,
    "skipDecisionCount": 118,
    "laneCount": 5,
    "sourceMonitorVideoCount": 3
  }
}
```

Current green validation ladder:

```bash
./script/build_and_run.sh --verify
./script/smoke_episode1_editor_architecture.sh --no-build
./script/smoke_episode1_visual_rough_cut.sh --no-build
./script/smoke_episode1_decision_edit.sh --no-build
./script/smoke_episode1_live_switch.sh
./script/smoke_episode1_decision_behavior_matrix.sh --no-build
```

Current truthful blocker remains unchanged:

```bash
./script/preflight_episode1_media.sh
```

The preflight exits `2` because both Episode 1 WAV sources exist but cannot be read quickly enough from `/Volumes/My Passport/Episode 1` to generate `.m4a` audio proxies. Video/reference proxies are already ready and must remain the preview path. Do not switch preview back to giant raw originals.

## 2026-06-15 follow-up: attach recovered proxy without changing source truth

Added a production recovery path for the current Episode 1 audio blocker:

```bash
./script/agentctl.sh attach-proxy "Charlie Audio - First Pod Ever.wav" /path/to/First_Pod_Ever_proxy.m4a
./script/agentctl.sh attach-proxy "Homer Audio - HomerAudio.wav" /path/to/HomerAudio_proxy.m4a
```

This command copies the supplied proxy into Quipsly's deterministic local proxy vault and updates only the lane proxy metadata. It does not change the original `source.mediaURL`, does not create chopped clips, and does not make raw originals the preview path.

Added a focused smoke:

```bash
./script/smoke_episode1_attach_proxy.sh --no-build
```

Current proof summary from the smoke:

```json
{
  "attachProxyReady": true,
  "alreadyHadRealProxy": false,
  "targetLane": "Charlie Audio - First Pod Ever.wav",
  "before": {
    "sourceReadiness": "Audio proxy pending",
    "audioReadyCount": 0,
    "audioBlockedCount": 2,
    "productionReady": false
  },
  "after": {
    "sourceReadiness": "Audio proxy ready",
    "audioReadyCount": 1,
    "audioBlockedCount": 1,
    "productionReady": false
  },
  "restored": {
    "sourceReadiness": "Audio proxy pending",
    "audioReadyCount": 0,
    "audioBlockedCount": 2,
    "productionReady": false
  }
}
```

Why this matters:

- If the external WAV originals remain unreadable, we can still recover by creating or receiving `.m4a` audio proxies from another readable copy/path.
- The proxy can be attached safely without rewriting Episode 1's original source identity.
- Production readiness still requires both audio lanes to have real local proxies; the smoke only proves the recovery mechanism and then removes its generated test proxy.

Current validation sequence including the new recovery proof:

```bash
./script/build_and_run.sh --verify
./script/smoke_episode1_attach_proxy.sh --no-build
./script/smoke_episode1_editor_architecture.sh --no-build
./script/smoke_episode1_visual_rough_cut.sh --no-build
./script/smoke_episode1_decision_edit.sh --no-build
./script/smoke_episode1_live_switch.sh
./script/smoke_episode1_decision_behavior_matrix.sh --no-build
./script/preflight_episode1_media.sh
```

Expected final state today:

- All editor/recovery smokes pass.
- `preflight_episode1_media.sh` exits `2` until both real audio proxies exist.
- The preflight now names both safe recovery options: stage readable WAV copies or attach recovered `.m4a` proxies.

## 2026-06-15 follow-up: proxy duration sanity and visible attach-proxy UI

Strengthened proxy readiness so a proxy file merely existing is not enough to make a lane production-ready.

New invariant:

- If a lane has an expected duration greater than 10 seconds, the proxy duration must be verifiable and close to the whole lane duration.
- Too-short proxies are blocked with a plain-English readiness message.
- This prevents a one-second placeholder `.m4a` from making a 5,000-second Episode 1 audio lane look production-ready.

Added human-facing recovery:

- The proxy issue panel now includes `Attach proxy...` beside blocked lanes.
- `Relink...` is for choosing a readable whole original/source.
- `Attach proxy...` is for choosing a local lightweight proxy while preserving the original source identity.

Updated attach-proxy smoke behavior:

```bash
./script/smoke_episode1_attach_proxy.sh --no-build
```

It now proves both sides:

- A too-short proxy is rejected.
- A duration-matching proxy can be attached.
- Original `sourcePath` remains unchanged.
- The proxy is copied into the deterministic Quipsly proxy vault.
- The generated smoke proxy is removed afterward and the Episode 1 baseline is restored.

Current proof summary:

```json
{
  "attachProxyReady": true,
  "targetLane": "Charlie Audio - First Pod Ever.wav",
  "expectedDuration": 5013.725333,
  "shortProxyRejected": true,
  "after": {
    "sourceReadiness": "Audio proxy ready",
    "audioReadyCount": 1,
    "audioBlockedCount": 1,
    "productionReady": false
  },
  "restored": {
    "sourceReadiness": "Audio proxy pending",
    "audioReadyCount": 0,
    "audioBlockedCount": 2,
    "productionReady": false
  }
}
```

Current full validation result:

```bash
./script/smoke_episode1_metadata_decision.sh
./script/smoke_episode1_attach_proxy.sh --no-build
./script/smoke_episode1_editor_architecture.sh --no-build
./script/smoke_episode1_visual_rough_cut.sh --no-build
./script/smoke_episode1_decision_edit.sh --no-build
./script/smoke_episode1_live_switch.sh
./script/smoke_episode1_decision_behavior_matrix.sh --no-build
./script/preflight_episode1_media.sh
```

Result:

- All smokes pass.
- `preflight_episode1_media.sh` still exits `2` because the two Episode 1 WAV originals exist but cannot be read from `/Volumes/My Passport/Episode 1` quickly/reliably enough to create real proxies.
- This is the correct production blocker. The editor must not mark Episode 1 production-ready until both full-length audio proxies are attached or generated.

Known follow-up:

- `WorkspaceView.proxyValidationIssue` currently uses synchronous `AVURLAsset.duration`, which builds with a macOS deprecation warning. It is acceptable for this recovery pass, but the grown-up version should move proxy probing into an async cached media-probe service so readiness checks do not perform repeated asset reads inside SwiftUI rendering.

## 2026-06-15 follow-up: async audio-proxy duration validation

Moved audio proxy duration sanity out of the synchronous SwiftUI readiness path.

What changed:

- Audio proxy readiness now uses a cached async validation state keyed by proxy path.
- `Audio proxy validating` is a temporary non-ready state while duration is being checked.
- A too-short proxy remains `Audio proxy blocked`.
- A full-duration proxy becomes `Audio proxy ready` after async validation.
- Attaching/replacing a proxy invalidates the cached validation for that proxy path, so a formerly bad proxy cannot poison a later good proxy.
- The previous AVFoundation synchronous `asset.duration` deprecation warning is gone; only existing macOS `onChange` warnings remain.

Current proof:

```bash
./script/build_and_run.sh --verify
./script/smoke_episode1_attach_proxy.sh --no-build
```

Result:

```json
{
  "attachProxyReady": true,
  "expectedDuration": 5013.725333,
  "shortProxyRejected": true,
  "after": {
    "sourceReadiness": "Audio proxy ready",
    "audioReadyCount": 1,
    "audioBlockedCount": 1,
    "productionReady": false
  },
  "restored": {
    "sourceReadiness": "Audio proxy pending",
    "audioReadyCount": 0,
    "audioBlockedCount": 2,
    "productionReady": false
  }
}
```

Full ladder rerun after the change:

```bash
./script/smoke_episode1_metadata_decision.sh
./script/smoke_episode1_attach_proxy.sh --no-build
./script/smoke_episode1_visual_rough_cut.sh --no-build
./script/smoke_episode1_decision_edit.sh --no-build
./script/smoke_episode1_live_switch.sh
./script/smoke_episode1_decision_behavior_matrix.sh --no-build
./script/preflight_episode1_media.sh
```

Result:

- All smokes pass.
- `preflight_episode1_media.sh` exits `2` with the same truthful production blocker: the two Episode 1 WAV originals exist but cannot be read from `/Volumes/My Passport/Episode 1` quickly/reliably enough to generate real audio proxies.

Important next production target:

- Get real full-duration audio proxies for both audio lanes from readable sources.
- Then run `./script/smoke_episode1_production_ready.sh` with `EPISODE1_AUDIO_DIR` if staged WAV copies are available, or use `agentctl attach-proxy` for recovered `.m4a` proxies.

## 2026-06-15 follow-up: Episode 1 live media manifest and command-queue hardening

Added a proxy-first Episode 1 live-media path for the external-drive copy at `/Volumes/My Passport/Episode 1`.

New/updated tooling:

```bash
./script/prepare_episode1_live_proxies.sh
./script/prepare_episode1_live_proxies.sh --generate --load-editor
./script/create_proxy_for_file.py /absolute/source --dry-run --json
```

Key invariants preserved:

- Episode 1 source lanes stay whole.
- Deterministic proxy paths live under `~/Library/Application Support/Quipsly/MediaVault/proxy`.
- Video preview uses proxies; it must not fall back to giant raw originals.
- Audio production readiness requires full-duration `.m4a` proxies.
- SHOW/SKIP edits remain metadata overlays; no chopped clip timeline is introduced.

Current live media state:

- Video/reference proxies are present and ready for visual rough-cut:
  - `MVI_3999_proxy.mp4`
  - `NewHomerExport_proxy.mp4`
  - `There_is_no_try_proxy.mp4`
- Real audio proxies are still missing:
  - `First_Pod_Ever_proxy.m4a`
  - `HomerAudio_proxy.m4a`
- The WAV source records exist on the external drive, but byte reads and `ffprobe` fail with `Interrupted system call`.
- This means visual editing is safe, but final production, waveform work, sync review, and export remain blocked until real audio proxies are generated or attached.

Also hardened the local AgentServer control path:

- Former single-slot mutating commands now use the queued command model.
- This prevents rapid smoke/import scripts from overwriting commands before SwiftUI applies them.
- The production-gate smoke now proves both queued attach-proxy commands can apply in one run.

Validation run:

```bash
./script/build_and_run.sh --verify
./script/prepare_episode1_live_proxies.sh --load-editor
./script/smoke_episode1_editor_architecture.sh --no-build
./script/smoke_episode1_visual_rough_cut.sh --no-build
./script/smoke_episode1_decision_behavior_matrix.sh --no-build
./script/smoke_episode1_production_gate.sh --no-build
./script/preflight_episode1_media.sh
```

Result:

- Build/launch: pass.
- Live manifest load: pass.
- Architecture smoke: pass.
- Visual rough-cut smoke: pass.
- Decision behavior matrix: pass.
- Production-gate mechanics with generated full-duration silent proxies: pass.
- Real preflight: expected exit `2`, because both real Episode 1 WAVs are currently unreadable for proxy generation.

Next best target:

- Recover or stage readable Episode 1 audio originals, or attach real full-duration `.m4a` audio proxies.
- Then rerun `./script/smoke_episode1_production_ready.sh --no-build`.

## 2026-06-15 follow-up: truthful missing-audio-proxy state and bounded recovery command

Updated the Episode 1 audio recovery path to make the current blocker calmer and more truthful.

Language change:

- Missing deterministic `.m4a` files are now reported as `Audio proxy missing`, not `Audio proxy pending`.
- `pending` was misleading because no background job is necessarily running; the correct operator action is to generate or attach a full-length audio proxy.

New recovery command:

```bash
./script/recover_episode1_audio_proxies.sh
./script/recover_episode1_audio_proxies.sh --generate --timeout 10
./script/recover_episode1_audio_proxies.sh --generate --attach
```

What it does:

- Checks only the exact Episode 1 whole audio source manifest.
- Computes deterministic proxy vault paths for both audio lanes.
- Optionally attempts `.m4a` proxy generation with a bounded ffmpeg timeout.
- Optionally attaches existing/generated proxies to the running editor.
- Returns structured JSON, not vague terminal noise.
- Never creates chopped clips or mutates SHOW/SKIP decisions.

Current validation:

```bash
./script/build_and_run.sh --verify
./script/prepare_episode1_live_proxies.sh --load-editor
./script/smoke_episode1_editor_architecture.sh --no-build
./script/smoke_episode1_visual_rough_cut.sh --no-build
./script/smoke_episode1_decision_behavior_matrix.sh --no-build
./script/smoke_episode1_production_gate.sh --no-build
./script/preflight_episode1_media.sh
./script/recover_episode1_audio_proxies.sh --generate --timeout 10
```

Result:

- Build/launch: pass.
- Episode 1 whole-lane live manifest load: pass.
- Architecture smoke: pass.
- Visual rough-cut smoke: pass.
- Decision behavior matrix: pass.
- Production-gate mechanics with generated full-duration silent proxies: pass.
- Real media preflight: expected exit `2`, because real audio proxies are still missing.
- Audio recovery attempt: expected exit `2`; both WAV sources exist but ffmpeg cannot open either and reports `Interrupted system call`.

Current real state:

- `visualRoughCutReady=true`
- `productionReady=false`
- `videoProxyReadyCount=3`
- `audioReadyCount=0`
- `audioBlockedCount=2`
- `showDecisionCount=236`
- `skipDecisionCount=118`
- Audio lanes show `Audio proxy missing` with deterministic vault targets:
  - `~/Library/Application Support/Quipsly/MediaVault/proxy/a7b95193d5e246b3/First_Pod_Ever_proxy.m4a`
  - `~/Library/Application Support/Quipsly/MediaVault/proxy/800de309e1ac12a7/HomerAudio_proxy.m4a`

Next real production step:

- Provide readable audio originals from another source, or recover/export full-duration `.m4a` proxies and attach them with:

```bash
./script/agentctl.sh attach-proxy "Charlie Audio - First Pod Ever.wav" /path/to/First_Pod_Ever_proxy.m4a
./script/agentctl.sh attach-proxy "Homer Audio - HomerAudio.wav" /path/to/HomerAudio_proxy.m4a
./script/smoke_episode1_production_ready.sh --no-build
```

## 2026-06-15 live Episode 1 external-media check

Charlie copied the Episode 1 media to:

```text
/Volumes/My Passport/Episode 1
```

Exact whole-source manifest confirmed present:

- `MVI_3999.MP4` - 18G
- `NewHomerExport.MP4` - 24G
- `There is no try.mp4` - 14M
- `First Pod Ever.wav` - 1.8G
- `HomerAudio.wav` - 5.8G

Architecture rule reaffirmed:

- Do not import Premiere-style chopped clips.
- Do not preview giant raw originals.
- Keep whole synced source lanes.
- Use local proxies for playback.
- Treat SHOW/SKIP/camera choices as metadata overlays.

Current proxy/editor result:

```bash
./script/prepare_episode1_live_proxies.sh --load-editor
```

Result:

- `visualRoughCutReady=true`
- `productionReady=false`
- `laneCount=5`
- `sourceMonitorVideoCount=3`
- `videoProxyReadyCount=3`
- `audioReadyCount=0`
- `audioBlockedCount=2`
- `showDecisionCount=236`
- `skipDecisionCount=118`
- `validRangeCount=29`

Validation result:

```text
arch=0 visual=0 matrix=0 gate=0 preflight=2
```

Meaning:

- Editor architecture smoke passed.
- Visual rough-cut smoke passed.
- Decision behavior matrix passed.
- Production-gate mechanics passed.
- Real preflight intentionally fails until full-length audio proxies exist.

Important blocker:

The copied raw files on `/Volumes/My Passport/Episode 1` currently fail byte reads from this process. `ffprobe`, `file`, `xattr`, `head`, and Python open/read all fail or hang with `Interrupted system call` / timeout. This affects the WAVs and even MP4 metadata probing. The existing local video proxies are usable, but generating new proxies from these copied originals is blocked until the files become byte-readable.

Confirmed plain staging preflight:

```bash
./script/stage_episode1_audio_for_proxy.sh
```

Result:

- `First Pod Ever.wav`: exists, correct size, not readable; `head: Interrupted system call`
- `HomerAudio.wav`: exists, correct size, not readable; `head: Interrupted system call`

Do next:

1. Keep editing visually from existing video proxies if needed.
2. Recover readable full-length audio sources or export/readable full-length `.m4a` proxies from another app/location.
3. Attach real audio proxies without altering source lanes:

```bash
./script/agentctl.sh attach-proxy "Charlie Audio - First Pod Ever.wav" /path/to/First_Pod_Ever_proxy.m4a
./script/agentctl.sh attach-proxy "Homer Audio - HomerAudio.wav" /path/to/HomerAudio_proxy.m4a
./script/smoke_episode1_production_ready.sh --no-build
```

Do not respond to this blocker by changing the editor back to chopped clips, raw playback, or Premiere-derived clip timelines.

## 2026-06-15 proxy helper hardening

`script/create_proxy_for_file.py` now performs a bounded first-byte source-read probe before invoking ffmpeg. This prevents the proxy pipeline from hanging or producing vague ffmpeg-only errors when a copied external source exists but cannot actually be opened.

New behavior:

- Existing proxies still short-circuit successfully; a ready proxy can keep visual editing alive even when the raw original is temporarily unreadable.
- Missing proxies now require the original to be byte-readable before ffmpeg starts.
- If the source read fails or times out, JSON output includes:
  - `sourceExists=true`
  - `sourceReadable=false`
  - `probeTimeoutSeconds`
  - a user-facing error that keeps the whole lane linked but asks for readable source recovery or a full-length proxy attach.

The copied Episode 1 external files still fail the read probe with `Interrupted system call`; this confirms the next production step is media recovery/reattach, not editor architecture change.

Guardrail smoke added:

```bash
./script/smoke_proxy_unreadable_source_fastfail.sh
```

This creates a deliberately unreadable local media file and proves the proxy helper exits quickly with structured `sourceReadable=false` JSON. Keep this smoke green so future work does not regress into hanging proxy jobs or vague ffmpeg failures when external media exists but cannot be opened.

## 2026-06-15 operator readiness report

Added:

```bash
./script/report_episode1_editor_readiness.sh
./script/report_episode1_editor_readiness.sh --json
./script/report_episode1_editor_readiness.sh --require-production
```

Purpose:

- Non-mutating operator report.
- Combines live app state with Episode 1 media preflight.
- Separates visual rough-cut readiness from production/export readiness.
- Lists safe actions, blocked files/lanes, next actions, and explicit things not to do.

Current expected status:

```text
visual_ready_production_blocked
```

That status is correct while video proxies are ready and both full-length audio proxies are missing.

Validation after proxy fast-fail hardening:

```bash
./script/smoke_proxy_unreadable_source_fastfail.sh
python3 -m py_compile script/create_proxy_for_file.py script/recover_episode1_audio_proxies.py
./script/smoke_episode1_editor_architecture.sh --no-build
QUIPSLY_SOURCE_PROBE_TIMEOUT_SECONDS=3 ./script/recover_episode1_audio_proxies.sh --generate --attach --timeout 10
```

Observed result:

- Unreadable-source fast-fail smoke passed with return code `74` and `sourceReadable=false`.
- Episode 1 editor architecture smoke still passed.
- Real Episode 1 audio recovery now fails fast in about 6 seconds instead of surfacing a vague ffmpeg-only failure:
  - `First Pod Ever.wav`: `sourceExists=true`, `sourceReadable=false`, proxy missing.
  - `HomerAudio.wav`: `sourceExists=true`, `sourceReadable=false`, proxy missing.

This is the desired production failure mode until the copied WAV files become byte-readable or full-length `.m4a` proxies are attached.

Readiness report validation:

```bash
./script/report_episode1_editor_readiness.sh
./script/report_episode1_editor_readiness.sh --json
./script/report_episode1_editor_readiness.sh --require-production
```

Observed current output summary:

```text
Episode 1 is safe for visual rough-cut editing; production is blocked.
videoProxyReadyCount: 3
 audioReadyCount: 0
 audioBlockedCount: 2
 showDecisionCount: 236
 skipDecisionCount: 118
 validRangeCount: 29
```

`--json` validates `status=visual_ready_production_blocked`.

`--require-production` correctly exits non-zero while the two full-length audio proxies are unavailable.

## 2026-06-15 Episode 1 decision-map report

Added:

```bash
./script/report_episode1_decision_map.sh
./script/report_episode1_decision_map.sh --json --require-visual
```

Purpose:

- Non-mutating edit-decision inspection.
- Exports the current edit as whole source lanes plus SHOW/SKIP metadata overlays.
- Gives future playback/export/AI/collaboration tooling a clean decision-map artifact outside the UI.
- Reasserts that Quipsly decisions are not destructive cuts and must not become short media clips.

Validated current Episode 1 state:

```text
visualRoughCutReady: true
productionReady: false
laneCount: 5
sourceMonitorVideoCount: 3
sourcePlayerCount: 3
videoProxyReadyCount: 3
audioReadyCount: 0
audioBlockedCount: 2
showDecisionCount: 236
skipDecisionCount: 118
validRangeCount: 29
eventCount: 354
```

Lane decision summary:

```text
Charlie Camera - MVI_3999.MP4: SHOW 60, SKIP 30
Homer Camera - NewHomerExport.MP4: SHOW 60, SKIP 29
Reference Clip - There is no try.mp4: SHOW 2, SKIP 0
Charlie Audio - First Pod Ever.wav: SHOW 58, SKIP 30
Homer Audio - HomerAudio.wav: SHOW 56, SKIP 29
```

This report is now the safest handoff point for editor/export work: build export/playback features against this decision map, not against Premiere clip fragmentation.

## 2026-06-15 Episode 1 Play Edit output-plan contract

Added:

```bash
./script/build_episode1_output_plan.sh
./script/build_episode1_output_plan.sh --json --require-visual
```

Purpose:

- Non-mutating renderer/export contract.
- Converts live whole-source lanes plus SHOW/SKIP metadata overlays into Play Edit output segments.
- Computes valid ranges using the same conceptual algorithm as `PlaybackEngine.computeValidRanges`: merge active ranges, merge cut ranges, subtract cuts from active, then map sequence time into program time.
- Splits output segments at camera/clip decision boundaries so renderer/export code can see which video candidates and support/audio candidates apply to each surviving slice.

Validated current Episode 1 output plan:

```text
visualRoughCutReady: true
productionReady: false
laneCount: 5
sourceMonitorVideoCount: 3
videoProxyReadyCount: 3
audioReadyCount: 0
audioBlockedCount: 2
showDecisionCount: 236
skipDecisionCount: 118
validRangeCount: 29
outputSegmentCount: 59
programDurationSeconds: 4566.770528
```

Current first output segment proves the intended model:

- Program time starts at `0.0s` while source lanes read from their synced source offsets.
- `Charlie Camera - MVI_3999.MP4` and `Homer Camera - NewHomerExport.MP4` are whole-lane proxy-backed video candidates.
- `Charlie Audio - First Pod Ever.wav` and `HomerAudio.wav` remain support candidates but are blocked for final export until full-length audio proxies exist.

Next export target:

- Build a renderer/exporter against `build_episode1_output_plan.sh --json` rather than against Premiere fragments.
- First acceptable renderer milestone: silent visual proxy export from the output plan.
- Production renderer milestone: audio-proxy-backed 16:9 and 9:16 export once real full-length audio proxies are attached.

Do not turn output segments into physical source clips. They are renderer instructions derived from metadata.

## 2026-06-15 silent visual proxy renderer proof

Added:

```bash
./script/render_episode1_visual_proxy_export.sh
./script/render_episode1_visual_proxy_export.py
```

Purpose:

- First renderer milestone from the Episode 1 output-plan contract.
- Consumes `build_episode1_output_plan.sh --json --require-visual`.
- Renders only from proxy `playbackPath` files.
- Does not touch raw external originals.
- Does not mutate source lanes or edit decisions.
- Uses temporary ffmpeg chunks only as disposable render intermediates, not editorial source clips.

Validation proof:

```bash
./script/render_episode1_visual_proxy_export.sh \
  --max-duration 12 \
  --output /tmp/quipsly-episode1-visual-proxy-proof.mp4 \
  --json
```

Observed proof summary:

```text
output: /private/tmp/quipsly-episode1-visual-proxy-proof.mp4
renderedSegmentCount: 2
renderedDurationSeconds: 12.0
audioIncluded: false
usesProxyPlaybackOnly: true
video: h264 1280x720
```

Post-render readiness check stayed unchanged:

```text
status: visual_ready_production_blocked
visualRoughCutReady: true
productionReady: false
```

Meaning:

- Quipsly can now turn the metadata edit into a real silent visual proxy MP4.
- This is not final production export because the two full-length audio proxies are still missing.
- Next production step is audio-proxy attachment/recovery, then audio-backed 16:9 and 9:16 export from the same output-plan contract.

## 2026-06-15 dual-format visual proxy export smoke

Added:

```bash
./script/smoke_episode1_visual_proxy_exports.sh
```

Purpose:

- Proves the renderer can produce both horizontal and vertical proxy outputs from the same Episode 1 output-plan metadata.
- Validates that render outputs use proxy playback paths only.
- Validates that render outputs are intentionally silent until real full-length audio proxies exist.
- Reinforces the non-destructive rule: output chunks are render intermediates, not source clips or editorial truth.

Validation result:

```text
Episode 1 visual proxy export smoke PASSED.
```

Observed outputs:

```text
16:9 proof: 1280x720, 8.0s, audioIncluded=false, usesProxyPlaybackOnly=true
9:16 proof: 720x1280, 8.0s, audioIncluded=false, usesProxyPlaybackOnly=true
```

Meaning:

- The editor can now generate silent visual proof exports for both YouTube-style and Shorts/Reels-style formats from the same metadata edit.
- Final production export remains blocked until audio proxy readiness is solved.

## 2026-06-15 audio-proxy export mechanics smoke

Updated:

```bash
./script/render_episode1_visual_proxy_export.sh
```

New renderer options:

```bash
--include-audio
--require-audio
```

Added:

```bash
./script/smoke_episode1_audio_proxy_export_mechanics.sh
```

Purpose:

- Proves the renderer can include audio once full-length audio proxies are attached.
- Uses generated silent full-length audio proxies as test fixtures.
- Does not claim real Episode 1 audio is recovered.
- Restores the editor to the real current blocked state after the proof.

Validation result:

```text
Episode 1 audio-proxy export mechanics smoke PASSED.
```

Observed proof summary:

```text
before: productionReady=false, audioReadyCount=0, audioBlockedCount=2
afterAttach: productionReady=true, audioReadyCount=2, audioBlockedCount=0
renderedOutput: episode1-audio-proxy-export-proof.mp4
renderedDurationSeconds: 8.0
renderedSegmentCount: 1
audioIncluded: true
usesProxyPlaybackOnly: true
probe: h264 video + aac audio
restored: productionReady=false, audioReadyCount=0, audioBlockedCount=2
```

Meaning:

- Audio-backed export mechanics now exist and are proven with synthetic proxies.
- Final production export still requires real full-length audio proxies generated from the real podcast WAVs or attached from another readable export.

## 2026-06-15 production package exporter mechanics

Added:

```bash
./script/export_episode1_production_package.sh
./script/export_episode1_production_package.py
./script/smoke_episode1_production_package_mechanics.sh
```

Package exporter behavior:

- Exports both `16:9` and `9:16` outputs from the same output-plan metadata.
- Requires production audio readiness by default.
- Blocks with structured JSON when real audio proxies are missing.
- Supports `--allow-visual-only` for explicit silent visual proof packages.
- Keeps source lanes and SHOW/SKIP decisions unchanged.

Validation result:

```text
./script/export_episode1_production_package.sh --proof-duration 4 --json
# exits 2 with status=blocked while audio proxies are missing

./script/smoke_episode1_production_package_mechanics.sh --no-build
# PASSED
```

Observed mechanics proof:

```text
blockedBeforeAudio: true
afterAttach: productionReady=true, audioReadyCount=2, audioBlockedCount=0
packageStatus: exported
audioIncluded: true
16:9: 1280x720, hasAudio=true
9:16: 720x1280, hasAudio=true
restored: productionReady=false, audioReadyCount=0, audioBlockedCount=2
```

Meaning:

- Production package mechanics are now implemented and proven with generated full-length silent audio proxies.
- The exporter correctly refuses to claim production package readiness without audio proxies.
- The remaining blocker for a real production editor is recovering/generating/attaching real full-length Episode 1 audio proxies.

## Episode 1 live-media recovery update - 2026-06-15

- External drive path confirmed: `/Volumes/My Passport/Episode 1`.
- The expected whole source files are present and sized correctly: `MVI_3999.MP4`, `NewHomerExport.MP4`, `There is no try.mp4`, `First Pod Ever.wav`, and `HomerAudio.wav`.
- Architecture guardrail remains intact: Episode 1 uses whole synced source lanes plus SHOW/SKIP/camera metadata overlays. Do not create Premiere-style chopped clips.
- Video proxies are already ready for visual review/export. Raw camera originals must not be used for preview when proxies exist.
- Audio remains production-blocked: both WAV sources exist but first-byte reads time out or return `Interrupted system call`; expected real `.m4a` proxies are still missing.
- `script/find_episode1_audio_candidates.py` was tightened so default candidate audit checks exact known paths only. Spotlight and folder traversal are opt-in because broad searches can stall on iCloud/media/external volumes.
- `script/recover_episode1_audio_proxies.sh --generate --attach` correctly refuses to attach or generate fake readiness when WAV sources are unreadable.
- Next safe action: recover/export real full-length audio proxies from a readable source, then vet with `./script/find_episode1_audio_candidates.sh --candidate /path/to/First_Pod_Ever_proxy.m4a --candidate /path/to/HomerAudio_proxy.m4a --json`; attach only when both lanes report `attachable_real_candidate`.

### Silent fixture rejection verified

The candidate audit was run against the known proxy-looking `.m4a` files in the MediaVault. Both were full-length but silent (`maxVolumeDb: -91.0`) and were rejected with `silent_fixture_rejected`. Do not attach these as real Episode 1 audio. They are acceptable only for mechanical smoke tests that explicitly restore blocked state afterward.

## Episode 1 production-ready proxy milestone - 2026-06-15

- Both copied Episode 1 WAV sources on `/Volumes/My Passport/Episode 1` eventually opened with a longer bounded first-byte probe. Short dashboard probes still time out, but the sources are not dead.
- `script/recover_episode1_audio_proxies.py` now accepts `--probe-timeout` and defaults to a 45s Episode 1 source probe so huge external WAVs can be recovered without weakening fast dashboard status checks.
- Real audio proxies were generated and attached:
  - Charlie audio proxy: `/Users/wall-e/Library/Application Support/Quipsly/MediaVault/proxy/a7b95193d5e246b3/First_Pod_Ever_proxy.m4a` (`101008148` bytes)
  - Homer audio proxy: `/Users/wall-e/Library/Application Support/Quipsly/MediaVault/proxy/800de309e1ac12a7/HomerAudio_proxy.m4a` (`77130604` bytes)
- `script/report_episode1_editor_readiness.sh --json` now reports `status: production_ready`, `audioReadyCount: 2`, `audioBlockedCount: 0`, `showDecisionCount: 236`, `skipDecisionCount: 118`, and `validRangeCount: 29`.
- `script/export_episode1_production_package.sh --proof-duration 4 --json` exported both proof outputs with audio:
  - `/Users/wall-e/Movies/Quipsly/Exports/Episode 1/episode-1-quipsly-export-16x9.mp4`
  - `/Users/wall-e/Movies/Quipsly/Exports/Episode 1/episode-1-quipsly-export-9x16.mp4`
- The export proof preserved the core invariant: whole source lanes plus SHOW/SKIP metadata overlays, proxy playback only, no Premiere-style chopped source clips. Temporary segment files are render intermediates only.
- Status/report tooling hardening done in this pass:
  - `script/preflight_episode1_media.sh` accepts `EPISODE1_READ_TIMEOUT_SECONDS` and skips raw source reads when an existing lane is already proxy-ready.
  - `script/report_episode1_editor_readiness.sh` defaults to fast dashboard preflight and supports `--deep-preflight` when a longer diagnostic pass is desired.
  - `script/find_episode1_audio_candidates.py` no longer decodes binary first-byte probe stdout as text, and exact candidate paths remain the preferred recovery path.

## External media access hardening - 2026-06-15

- Current local debug app is ad hoc signed and not sandboxed; inspected entitlements show only `com.apple.security.get-task-allow`. The repeated access friction was app-state/copy logic, not a missing local entitlement.
- `ExternalMediaAccess.restoreAccess()` now falls back to a remembered readable path when no security-scoped bookmark is available or when bookmark restoration fails in the local build.
- `ExternalMediaAccess.hasReadableAccess(to:)` now lets `WorkspaceView.sourceReadiness(for:)` avoid asking for folder access when the original source path is already readable.
- Result: Episode 1 app state now reports `storageAccessNeededCount: 0`, `productionReady: true`, and `productionReadinessDetail: All 3 video lane(s) and 2 audio/context lane(s) are proxy-backed for preview, and originals remain whole.`
- Important boundary: sandboxed/distributed builds should still use user-approved folder selection and security-scoped bookmarks. Local readable paths are a development/operator convenience, not a reason to remove the bookmark system.
- Validation: `./script/build_and_run.sh --verify`, raw `agentctl state`, and `./script/smoke_episode1_production_ready.sh` passed after this change.

## Episode 1 interactive editor proof - 2026-06-15

Added:

```bash
./script/smoke_episode1_interactive_editor.sh
```

Agent control surface expanded:

```bash
./script/agentctl.sh seek <seconds>
./script/agentctl.sh select-tag <lane-id-or-name> <tag-id>
./script/agentctl.sh nudge-selected <seconds>
./script/agentctl.sh trim-selected <start-delta> <duration-delta>
./script/agentctl.sh delete-selected-tag
./script/agentctl.sh focus-monitors
```

What the interactive smoke proves against the running native app:

- Episode 1 is loaded as whole synced source lanes, not Premiere-style chopped clips.
- The monitor wall model is `program_output_plus_whole_source_lanes`.
- The source wall has three source monitor players.
- `Play Through` uses the full sequence timeline (`validRangeCount: 1`).
- `Play Edit` uses active-minus-skip edit ranges (`validRangeCount: 29`).
- Seek/scrub updates app playhead state.
- `Play Through` stays inside a known inactive gap.
- `Play Edit` skips that same inactive gap.
- Existing edit decisions can be selected, nudged, and restored as metadata.
- Monitor-wall focus command is wired.

Validation result:

```text
./script/smoke_episode1_interactive_editor.sh
# PASSED
```

Observed proof summary:

```json
{
  "productionReady": true,
  "monitorWallModel": "program_output_plus_whole_source_lanes",
  "sourceMonitorVideoCount": 3,
  "sourcePlayerCount": 3,
  "playbackMode": "Play Edit",
  "validRangeCount": 29,
  "showDecisionCount": 236,
  "skipDecisionCount": 118,
  "selectedTagLaneName": "Charlie Camera - MVI_3999.MP4",
  "lastMediaAction": "Focused monitor wall from local control",
  "proofNotes": [
    "Play Through stayed inside inactive gap at 14.62s.",
    "Play Edit skipped inactive gap to 20.08s."
  ]
}
```

Meaning:

- The core Quipsly editor paradigm is now runtime-proven for Episode 1: source lanes remain whole, SHOW/SKIP decisions are metadata, `Play Through` preserves timeline truth, and `Play Edit` collapses gaps for review.
- This still does not finish the whole production-editor goal. Next proof should cover visible UI selection/scrub ergonomics, 16:9/9:16 preview switching, export readiness from the same session after interactive edits, and repeating the same loop for Episodes 2-4.

## 2026-06-15 sidebar/access/session corruption cleanup

- Fixed the Episode 2 crash path in `WaveformGenerator`: waveform analysis is now bounded and `WaveformView` refuses raw video analysis unless a proxy exists.
- Desktop `WorkspaceView` now mounts the synced-source rail on the right side through `RightSidebarView`.
- Regular-width monitor-wall layout no longer duplicates the horizontal source grid in the main program area; compact layouts still keep source monitors in the main workflow.
- `RightSidebarView` now treats video lanes as source monitors and audio lanes as support lanes instead of pretending every lane is a video source.
- Fixed a session-state race by reading native sessions before publishing project/session state together.
- Added a save/autosave guard so named sessions like `episode-1-premiere-rescue` cannot be overwritten by a project whose title/sequence indicates a different episode.
- Repaired the corrupted `episode-1-premiere-rescue` local session after it was found to contain Episode 2 content.
- Added `--allow-blocked-readiness` to `smoke_native_session_interactive_editor.sh` so blocked-but-safe sessions can be tested honestly without weakening production-ready proof.

Validation passed:

```bash
./script/build_and_run.sh --verify
./script/smoke_episode1_production_ready.sh --no-build
./script/smoke_native_session_interactive_editor.sh --session episode-1-premiere-rescue --no-build --require-production --min-source-monitors 3
./script/smoke_native_session_interactive_editor.sh --session episode-2-native-proof --no-build --allow-blocked-readiness --min-source-monitors 1
```

Current truth:

- Episode 1 is production-ready for interactive native editor proof: 3 video source monitors, 3 source players, 2 ready audio lanes, 236 SHOW, 118 SKIP, 29 valid edit ranges.
- Episode 2 loads safely without crashing but is not production-ready: 7 video lanes need proxies and 2 audio lanes are blocked. This is the correct honest state until media readiness work is done.
- See `docs/coordination/quipsly-native-editor-scope-audit.md` before continuing native editor work.

## 2026-06-15 protected-folder permission fix

The remaining permission prompt was caused by raw Episode 2 media paths under `~/Desktop/Podcast/2`. The editor had only treated `/Volumes` as protected, so Desktop media could still be probed or loaded by readiness/composition code.

Fixes:

- `ExternalMediaAccess.isProtectedUserMediaPath` now classifies `/Volumes`, Desktop, Documents, Downloads, and iCloud Mobile Documents as protected original locations.
- `ExternalMediaAccess.hasReadableAccess(to:)` no longer probes protected paths unless they are inside an explicitly granted root.
- `WorkspaceView.isExternalOriginalPath` now uses the protected-path classifier.
- `AVCompositionBuilder` no longer falls back to raw video when no proxy exists. Raw audio fallback remains gated by protected-path access.

Validation after the fix:

```bash
./script/smoke_native_session_interactive_editor.sh --session episode-2-native-proof --no-build --allow-blocked-readiness --min-source-monitors 1
./script/smoke_native_session_interactive_editor.sh --session episode-1-premiere-rescue --no-build --require-production --min-source-monitors 3
```

Both passed. Episode 2 now loads as proxy-required/HELD without a Desktop permission prompt, and Episode 1 remains production-ready from proxies.

## 2026-06-15 Episode 2 proxy-prep progress

Added:

```bash
./script/prepare_session_proxies.py
```

What it does:

- Reads a native `.quipsly-session.json` packet from MediaVault.
- Uses exact saved whole-lane source paths only; it does not scan broad folders or invent missing Premiere media.
- Generates deterministic proxies through `script/create_proxy_for_file.py` into `~/Library/Application Support/Quipsly/MediaVault/proxy/...`.
- Optionally loads the intended session into the running QuipslyMac app before attaching proxies.
- Waits for `/state` to prove the intended session is active before attaching.
- Waits for each lane proxy to become visible in app state before saving.
- Saves the session only after successful app-state attachment attempts.

Command used:

```bash
cd /Users/wall-e/Dev/high-ground-studio/apps/QuipslyStudio
./script/prepare_session_proxies.py \
  --session episode-2-native-proof \
  --short-first \
  --attach \
  --load-first \
  --save-session episode-2-native-proof
```

Current Episode 2 truth after the run:

- `sourceMonitorVideoCount`: `7`
- `sourcePlayerCount`: `3`
- `videoProxyReadyCount`: `3`
- `videoBlockedCount`: `4`
- `audioReadyCount`: `2`
- `audioBlockedCount`: `0`
- `showDecisionCount`: `1719`
- `skipDecisionCount`: `191`
- `validRangeCount`: `56`

Newly proxy-backed lanes:

- `Source Clip V2,A3 - Title Sequence.mp4`
- `Source Clip V3,A3 - Be a Goldfish.mp4`
- `Source Clip V3,A3 - Darmok.mp4`
- `Charlie Audio - CharlieFCEnhance.wav`
- `Homer Audio - Homer Audio FinalCut Revamp.wav`

Remaining Episode 2 blockers:

- `Charlie Camera - CharlieVid1.MP4` exists at `/Users/wall-e/Desktop/Podcast/2/CharlieVid1.MP4`, but first-byte reads time out. Finder/stat reports a 15GB file while Spotlight reports `kMDItemFSSize = 0`, which suggests cloud/offline/sparse/local-file weirdness. Do not fall back to raw playback; recover/download/move this original or attach a full-length proxy.
- `Homer Camera - video clip 235` is still a Premiere missing-media placeholder.
- `Unresolved Camera V2 - temp_video_352730263597350912.MP4` is still a Premiere missing-media placeholder.
- `Unresolved Camera V2 - video clip 211` is still a Premiere missing-media placeholder.

Validation after proxy prep:

```bash
./script/smoke_native_session_interactive_editor.sh \
  --session episode-2-native-proof \
  --no-build \
  --allow-blocked-readiness \
  --min-source-monitors 4

./script/smoke_native_session_interactive_editor.sh \
  --session episode-1-premiere-rescue \
  --no-build \
  --require-production \
  --min-source-monitors 3
```

Both passed. Episode 2 remains honestly not production-ready, but it is more playback-backed than before and still proves Play Through / Play Edit gap behavior. Episode 1 remains production-ready.

UX fix in the same pass:

- Successful load/save/autosave now clears stale `showErrorAlert` / `errorMessage` state so an old save-block modal does not sit over a newly loaded good session.

Visual proof:

- `/tmp/quipsly-episode2-proxy-progress-clean.png` shows Episode 2 loaded with no Desktop permission prompt, no stale error modal, `3 PROXY`, and `4` remaining video readiness blockers.

## 2026-06-15 Episode 2 temp-video relink/proxy progress

After the first proxy-prep pass, a targeted source check found that `temp_video_352730263597350912.MP4` actually exists and is byte-readable at:

```text
/Users/wall-e/Desktop/Podcast/2/temp_video_352730263597350912.MP4
```

It was relinked into the existing whole source lane:

```bash
./script/agentctl.sh relink-lane \
  BCE0A0A1-C6BB-45EB-999A-3753D6ABFA3D \
  /Users/wall-e/Desktop/Podcast/2/temp_video_352730263597350912.MP4
```

Then `prepare_session_proxies.py` generated and attached its deterministic proxy:

```text
~/Library/Application Support/Quipsly/MediaVault/proxy/3cfd945ec576d3e5/temp_video_352730263597350912_proxy.mp4
```

Current Episode 2 proof after this relink/proxy pass:

- `sourceMonitorVideoCount`: `7`
- `sourcePlayerCount`: `4`
- `videoProxyReadyCount`: `4`
- `videoBlockedCount`: `3`
- `audioReadyCount`: `2`
- `audioBlockedCount`: `0`
- `showDecisionCount`: `1719`
- `skipDecisionCount`: `191`
- `validRangeCount`: `56`

Validation:

```bash
./script/smoke_native_session_interactive_editor.sh \
  --session episode-2-native-proof \
  --no-build \
  --allow-blocked-readiness \
  --min-source-monitors 4
```

Passed. Episode 2 still is not production-ready, but it now has four playback-backed video source monitors and both audio lanes ready.

Remaining Episode 2 blockers now:

- `Charlie Camera - CharlieVid1.MP4`: source path exists but behaves like a ghost/cloud/offline file; `du` reports `0B`, first-byte reads time out, and Spotlight reports `kMDItemFSSize = 0` despite stat showing a 15GB apparent size. Recover/download/move this source or attach a full-length proxy.
- `Homer Camera - video clip 235`: still a Premiere missing-media placeholder.
- `Unresolved Camera V2 - video clip 211`: still a Premiere missing-media placeholder.

Visual proof:

- `/tmp/quipsly-episode2-four-proxies.png`

## 2026-06-15 - Protected-original permission boundary and recovery UX

- Tightened `ExternalMediaAccess` so remembered Desktop/Documents/Downloads/Volumes paths do not become playable/probeable originals at launch. A remembered protected folder is metadata until the user explicitly restores/grants folder access.
- Kept proxy editing as the safe default: source monitors, program playback, waveforms, and readiness must use MediaVault proxies unless an explicit protected-original folder grant exists.
- Updated the Episode 2 recovery banner so the primary action is `First issue`, with `Grant originals access` demoted to a secondary action. This prevents the editor from training users to click macOS permission prompts before understanding the actual media blocker.
- Reordered the production details drawer so media readiness and recovery issues appear before session/status details.
- Validation run:
  - `./script/build_and_run.sh --verify` passed with only existing macOS 14 `onChange` deprecation warnings.
  - `./script/smoke_native_session_interactive_editor.sh --session episode-2-native-proof --no-build --allow-blocked-readiness --min-source-monitors 4` passed: 7 source monitors, 4 video proxy players, 3 video blockers, 2 audio lanes ready, Play Through vs Play Edit gap behavior intact.
  - `./script/smoke_native_session_interactive_editor.sh --session episode-1-premiere-rescue --no-build --require-production --min-source-monitors 3` passed: production ready, 3 video proxies, 2 audio/context lanes ready, Play Through vs Play Edit gap behavior intact.
- Current proof screenshot: `/tmp/quipsly-episode2-action-priority.png`.
- Remaining Episode 2 blockers are real media/proxy blockers, not permission UI bugs: `CharlieVid1.MP4` appears as a ghost/offline Desktop file, and two short unresolved camera placeholders still need relink or full-length proxies.

## 2026-06-15 - Proxy export proof from native app

- Fixed the native export gate in `WorkspaceView`: production-ready proxy sessions no longer require explicit protected-original folder access just because original paths are remembered outside the vault.
- Added app-local agent command `GET /export_proxy_package?directory=<absolute-output-folder>&basename=<name>&proof_seconds=<seconds>` and wrapper `./script/agentctl.sh export-proxy-package <dir> <basename> <seconds>`.
- `ExportEngine` now creates output directories, removes existing proof outputs, and supports bounded proof exports via `durationLimitSeconds`.
- Updated readiness copy so proxy-ready lanes say originals access is only for relink/regeneration/raw-source work, not proxy export.
- Native proof run after rebuild:
  - `./script/build_and_run.sh --verify` passed with existing macOS 14 `onChange` deprecation warnings only.
  - Loaded `episode-1-premiere-rescue`, then ran `./script/agentctl.sh export-proxy-package /tmp/quipsly-native-export-proof-2 episode1-native-proof-2 3`.
  - App state reported `productionReady: true`, `storageAccessNeededCount: 5`, `videoProxyReadyCount: 3`, `audioReadyCount: 2`, and `lastMediaAction: Export proof completed...`.
  - Output files:
    - `/tmp/quipsly-native-export-proof-2/episode1-native-proof-2-16x9.mp4`: H.264 1920x1080 + AAC, 3.0s.
    - `/tmp/quipsly-native-export-proof-2/episode1-native-proof-2-9x16.mp4`: H.264 1080x1920 + AAC, 3.0s.
- Regression run after export work:
  - `./script/smoke_native_session_interactive_editor.sh --session episode-2-native-proof --no-build --allow-blocked-readiness --min-source-monitors 4` passed: 7 source monitors, 4 source players, 3 video blockers, 2 audio lanes ready, Play Through vs Play Edit behavior intact.
- Product invariant: proxy export is allowed when `mediaReadinessSummary().isProductionReady` is true, even if originals need explicit folder access for future relink/regeneration/raw-source workflows.

## 2026-06-15 - Native production editor matrix smoke

- Added `apps/QuipslyStudio/script/smoke_native_production_editor_matrix.sh` as the repeatable proof command for the current native editor truth.
- Matrix checks:
  1. Episode 1 loads as production-ready and passes monitor/playback proof.
  2. Episode 1 exports bounded proxy-backed 16:9 and 9:16 MP4s and validates them with `ffprobe`.
  3. Episode 2 loads as honestly blocked, with source monitors and Play Edit/Play Through behavior intact, and reports exact video blockers.
- Latest command:
  - `./script/smoke_native_production_editor_matrix.sh --no-build --proof-seconds 2`
- Latest result: passed.
- Episode 1 proof:
  - `productionReady: true`
  - 3 video proxies ready, 2 audio/context lanes ready.
  - 16:9 export: H.264 1920x1080 + AAC, 2.0s.
  - 9:16 export: H.264 1080x1920 + AAC, 2.0s.
- Episode 2 truth:
  - `productionReady: false`
  - 7 source monitors, 4 source players, 4 video proxies ready, 3 video blockers, 2 audio lanes ready.
  - Current blockers:
    - `Charlie Camera - CharlieVid1.MP4`: source held at `/Users/wall-e/Desktop/Podcast/2/CharlieVid1.MP4`; needs readable whole source or full-length proxy.
    - `Homer Camera - video clip 235`: missing Premiere placeholder; needs relink or representative proxy.
    - `Unresolved Camera V2 - video clip 211`: missing Premiere placeholder; needs relink or representative proxy.
- Use this matrix before and after editor architecture changes. It prevents regressions where the app appears usable but loses Play Edit/Play Through/export truth.

## 2026-06-15 - Matrix blocker classification

- Updated `apps/QuipslyStudio/script/smoke_native_production_editor_matrix.sh` so the summary includes `episode2Blockers` with local file status and next action.
- Latest command:
  - `./script/smoke_native_production_editor_matrix.sh --no-build --proof-seconds 1`
- Latest result: passed.
- Episode 2 blocker classification now reports:
  - `Charlie Camera - CharlieVid1.MP4`: `offline-placeholder`; `stat`/session metadata knows about a 15,006,014,500 byte file, but allocated bytes are 0. Next action is to download/replace the cloud/offline placeholder before proxy generation.
  - `Homer Camera - video clip 235`: `missing-placeholder`; relink to the whole original source or attach a full-length representative proxy.
  - `Unresolved Camera V2 - video clip 211`: `missing-placeholder`; relink to the whole original source or attach a full-length representative proxy.
- Important distinction: this is not an editor architecture failure. The editor correctly refuses to preview raw/offline/missing sources and keeps Episode 2 out of production-ready state until real source/proxy recovery happens.

## 2026-06-15 permission-boundary patch

- Passive editor UI must not probe protected originals under Desktop/Documents/Downloads/iCloud/Volumes.
- Added no-prompt file probes through ExternalMediaAccess and routed readiness/sidebar/waveform/relink proxy checks through that boundary.
- Episode 2 CharlieVid1 now reports Original protected plus offline-placeholder diagnostics instead of triggering raw Desktop access from passive render.
- Production matrix passed after patch: Episode 1 proxy-backed edit/export proof green; Episode 2 honestly blocked on 3 video lanes.

## 2026-06-15 source rail recovery pass

- Right-side Source Monitor Wall cards are now selectable and show protected/missing/live/proxy status directly.
- Blocked source cards expose safe Attach proxy and Relink actions in place, so recovery happens where the editor is already looking.
- The global originals-access CTA now says Grant/Restore originals later to keep proxy-first editing as the obvious path.
- Production matrix passed after the pass: Episode 1 remains proxy-edit/export proven; Episode 2 remains honestly blocked with protected/relink recovery states.

## 2026-06-15 attached video proxy safety

- Attached video proxies now validate that they contain video and are long enough for the whole source lane.
- This protects the core editor invariant: proxies represent whole synced lanes, not clipped substitutes.
- Existing proxy-backed Episode 1 remains production-ready in the matrix; Episode 2 remains truthfully blocked until real full-lane proxies or relinks are supplied.

## 2026-06-15 Episode 2 short-proxy rejection smoke

- Added script/smoke_episode2_reject_short_video_proxy.sh.
- The script attaches a deliberately 1s fake video proxy to Episode 2 CharlieVid1, expects Proxy blocked, then restores the original session JSON.
- Proof result: rejected as too short for the 4218.8s whole source lane. This protects the whole-lane proxy invariant and prevents clipped files from masquerading as production-ready proxies.
- Production matrix passed afterward, confirming Episode 1 remains export-ready and Episode 2 returns to the honest protected/missing state.

## 2026-06-15 stricter production matrix

- Tightened script/smoke_native_production_editor_matrix.sh so stale short/clipped proxy validation failures cannot pass as normal Episode 2 production blockers.
- Verified full loop: adversarial short-proxy smoke passes, restores the session, then stricter production matrix passes with Episode 2 back to Original protected/missing blocker states.

## 2026-06-15 Episode 2 live recovery report

- Added script/report_native_episode_recovery.sh.
- The report combines current app state, optional Premiere packet metadata, and safe filesystem allocation metadata.
- Episode 2 report path: apps/QuipslyStudio/reports/episode-2-native-proof-recovery-report.json.
- Current blocker truth: CharlieVid1.MP4 is a 15,006,014,500-byte logical file with 0 allocated bytes, so the old packet health is stale. The lane needs a downloaded/replaced original or full-length proxy.
- Remaining video blockers: Homer Camera - video clip 235 and Unresolved Camera V2 - video clip 211 are Premiere missing placeholders and need relink/full-length proxy attachment.

## 2026-06-15 passive proxy probe fix and in-app recovery report

- Fixed another passive protected-path access bug in `apps/QuipslyStudio/Sources/SharedUI/WorkspaceView.swift`:
  - `sourceReadiness(for:)` no longer calls raw `FileManager.default.fileExists` on `source.proxyURL`.
  - Proxy existence now goes through `ExternalMediaAccess.fileExistsWithoutPrompt(at:)`.
  - If a stale proxy path points into Desktop/Documents/Downloads/iCloud/Volumes without explicit grant, the app reports `Proxy protected` instead of probing the file and waking macOS privacy prompts.
- Added an in-app `Copy recovery report` action to the media recovery board.
- Added `mediaRecoveryReport` to the app-local `/state` payload and `./script/agentctl.sh recovery-report` for agent/operator handoffs.
- The recovery report includes blocked lane names, readiness, recovery category, next action, source/proxy probe policy, decision counts, and the core invariant: whole synced source lanes plus metadata decisions, not chopped source clips.
- Validation:
  - `./script/build_and_run.sh --verify` passed with existing macOS 14 `onChange` deprecation warnings only.
  - `./script/smoke_episode2_reject_short_video_proxy.sh --no-build` passed, proving clipped 1s proxies still cannot satisfy the 4218.8s CharlieVid1 whole lane.
  - `./script/agentctl.sh load-session episode-2-native-proof && ./script/agentctl.sh recovery-report` returned the 3 known blockers and marked CharlieVid1 as `not_probed_protected_original`.
  - `./script/smoke_native_production_editor_matrix.sh --no-build --proof-seconds 1` passed: Episode 1 remains proxy-edit/export ready; Episode 2 remains honestly blocked on CharlieVid1, video clip 235, and video clip 211.
- Visual proof after relaunch showed no Desktop permission prompt while rendering Episode 2; source cards show `PROTECTED`, `MISSING`, and `LIVE` states in the right Source Monitor Wall.

Next production-editor target:

- Use the recovery report to drive Episode 2/3 recovery without opening protected originals passively.
- Build the next editing affordance on top of the proven model: source monitor selection plus keyboard live-switch/ripple adjustment should remain whole-lane metadata edits, and every proof should keep Play Through vs Play Edit behavior green.

## 2026-06-15 recovery report matrix contract

- Strengthened `apps/QuipslyStudio/script/smoke_native_production_editor_matrix.sh` so Episode 2 must expose a `mediaRecoveryReport` through `./script/agentctl.sh recovery-report`.
- The matrix now asserts:
  - recovery report status is `ok`;
  - Episode 2 remains honestly not production-ready;
  - at least 3 blocked lanes are present;
  - the report includes the rule `Passive UI and reports must not probe protected originals.`;
  - `Charlie Camera - CharlieVid1.MP4` is classified with `sourceProbePolicy: not_probed_protected_original`.
- Latest validation: `./script/smoke_native_production_editor_matrix.sh --no-build --proof-seconds 1` passed with Episode 1 edit/export proof and Episode 2 recovery-report contract green.

## 2026-06-15 Episode 3 native rescue session and matrix coverage

- Promoted Episode 3 into the native editor session vault from `content/quipsly/premiere-imports/episode-3.json`.
- Saved native session: `episode-3-premiere-rescue` at `~/Library/Application Support/Quipsly/MediaVault/sessions/episode-3-premiere-rescue.quipsly-session.json`.
- Current Episode 3 truth:
  - 7 lanes total.
  - 6 video/source monitor lanes.
  - 791 SHOW decisions and 222 SKIP decisions preserved as metadata overlays.
  - 0 video proxies ready, 6 video blockers, 1 audio blocker.
  - The session is correctly not production-ready until proxies/relinks are resolved.
- Strengthened `apps/QuipslyStudio/script/smoke_native_production_editor_matrix.sh` so the required proof target now covers Episodes 1, 2, and 3:
  - Episode 1: production-ready plus 16:9/9:16 proxy export proof.
  - Episode 2: honestly blocked, recovery-report contract green, known blockers classified.
  - Episode 3: honestly blocked, source monitors and SHOW/SKIP decisions preserved, blockers classified.
- The matrix summary now includes `episode3Blockers` with local file status.
- Latest validation:
  - `./script/build_and_run.sh --verify` passed with existing macOS 14 `onChange` warnings only.
  - `./script/smoke_native_production_editor_matrix.sh --no-build --proof-seconds 1` passed.
- Episode 3 blocker truth from latest matrix:
  - `Charlie Camera - CharliePod3.MP4`: local file exists and is allocated; generate/attach a full-length proxy.
  - `Source Clip V3,A3 - I am your father.mp4`: local file exists and is allocated; generate/attach a full-length proxy.
  - `Unresolved Camera V1 - video clip 598`: missing Premiere placeholder; relink or attach full-length proxy.
  - `Unresolved Camera V1 - video clip 1878`: missing Premiere placeholder; relink or attach full-length proxy.
  - `Reference Clip - Percy.mp4`: `/Volumes/eve/Pod/3/Percy.mp4` missing locally; recover/relink or attach proxy.
  - `Reference Clip - temp_video_355297236743094272.MP4`: `/Volumes/eve/Pod/3/temp_video_355297236743094272.MP4` missing locally; recover/relink or attach proxy.

Next production-editor target:

- Build a safe proxy-generation/recovery workflow for Episode 3 local reachable files first, without broad protected-folder prompts. Then relink/attach missing placeholders. Keep the source monitor wall and Play Edit/Play Through matrix green after each recovery step.

## 2026-06-15 permission-boundary hardening

The editor hit another macOS privacy prompt while rendering an episode session with Desktop-backed Premiere source paths. Treat this as a production privacy boundary bug, not as a user-permission annoyance.

Changes made in `apps/QuipslyStudio`:

- Passive readiness checks now use `ExternalMediaAccess.fileExistsWithoutPrompt(...)` instead of raw `FileManager.default.fileExists(...)` for originals and planned proxies.
- Path-based agent imports are now reference-only for protected originals unless the path is explicitly safe to probe. They can create held lanes but must not probe duration or launch proxy generation from Desktop/Documents/Downloads/iCloud/Volumes.
- User-initiated file imports/drop remain allowed to probe the selected file, because the user just performed an explicit import action.
- `Queue reachable proxies` now skips protected originals without probing and only queues files the privacy wrapper says are safe.
- Proxy-first invariant remains unchanged: source monitor playback uses vault proxies, not raw originals.

Validation:

- `./script/build_and_run.sh --verify` passed with only existing macOS 14 `onChange` deprecation warnings.
- `./script/smoke_native_production_editor_matrix.sh --no-build --proof-seconds 1` passed.
- Episode 1 remains production-ready and exported 1s 16:9 plus 9:16 proof files.
- Episode 2 remains honestly blocked, but CharlieVid1 is now reported as `Original protected` with probe policy `not_probed_protected_original` instead of prompting during passive UI work.
- Episode 3 remains honestly blocked except for the one attached proxy lane; protected/missing blockers are explicit.

Next rule for agents: if a UI/report/status path touches originals, it is wrong unless it routes through a no-prompt access wrapper. Only explicit import, relink, match-folder, attach-proxy, or generate-proxy actions may touch protected source folders.

## 2026-06-15 safe proxy recovery runner

Added `apps/QuipslyStudio/script/recover_native_session_proxies.sh` as the operator-facing path for native session proxy recovery.

Why this exists:

- The app must stay responsive and must not unexpectedly touch protected source folders during passive UI work.
- Heavy ffmpeg work belongs in an explicit local/operator recovery path, not hidden inside ordinary editor rendering.
- The default path must be inspectable before it mutates session state.

Behavior:

- Default mode is dry-run only.
- `--execute` is required to generate/attach proxies and save the session.
- Existing deterministic proxies are skipped by default.
- Safe default cap is `--max-source-gb 5`; giant originals like Episode 3 `CharliePod3.MP4` require `--allow-large-source` or an explicit larger cap.
- Missing Premiere placeholders and offline `/Volumes/...` paths are reported, not silently replaced.
- The app recovery board now copies either a dry-run command or a safe execute command instead of the old unbounded proxy pass.

Validated:

- `python3 -m py_compile script/prepare_session_proxies.py script/create_proxy_for_file.py`
- `./script/recover_native_session_proxies.sh --session episode-3-premiere-rescue`
- Dry-run reported no failures, reused the existing `I am your father` proxy, skipped missing sources, skipped missing `/Volumes/eve` sources, skipped missing Desktop audio, and skipped the 49GB Charlie source under the 5GB cap.
- `./script/build_and_run.sh --verify`

Next agent rule: never replace this with an implicit in-app background proxy storm. If we build in-app proxy queues later, they must use the same dry-run/report/explicit-execute semantics and caps.

## 2026-06-15 Episode 3 bounded proxy recovery

Recovered additional Episode 3 source truth and safe proxies.

Found exact local assets:

- `/Users/wall-e/Desktop/Podcast/3/Percy.mp4`
- `/Users/wall-e/Desktop/Podcast/3/temp_video_355297236743094272.MP4`
- `/Users/wall-e/Desktop/Podcast/3/Untitled_1 #02.wav`

Actions taken:

- Relinked `Reference Clip - Percy.mp4` to the whole local Percy source.
- Relinked `Reference Clip - temp_video_355297236743094272.MP4` to the whole local temp-video source.
- Relinked `Audio A2 - Untitled_1 #02.wav` to the whole local WAV source.
- Saved `episode-3-premiere-rescue`.
- Ran `./script/recover_native_session_proxies.sh --session episode-3-premiere-rescue --max-source-gb 1 --execute`.

Generated and attached:

- Percy video proxy: `~/Library/Application Support/Quipsly/MediaVault/proxy/c14d1e9ac79b6b46/Percy_proxy.mp4` (`17,152,405` bytes)
- Episode 3 audio proxy: `~/Library/Application Support/Quipsly/MediaVault/proxy/1b63383a13f9f102/Untitled_1_-02_proxy.m4a` (`77,209,898` bytes)

Skipped intentionally:

- `CharliePod3.MP4` at about 49GB under the 1GB cap.
- `temp_video_355297236743094272.MP4` at about 34GB under the 1GB cap.
- Two unresolved Premiere placeholders: `video clip 598`, `video clip 1878`.

Post-recovery proof:

- `./script/smoke_native_session_interactive_editor.sh --session episode-3-premiere-rescue --no-build --allow-blocked-readiness --min-source-monitors 6` passed.
- Episode 3 now reports: `sourceMonitorVideoCount=6`, `sourcePlayerCount=2`, `videoProxyReadyCount=2`, `videoBlockedCount=4`, `audioReadyCount=1`, `audioBlockedCount=0`, `showDecisionCount=791`, `skipDecisionCount=222`.
- Visual screenshot: `/tmp/quipslystudio-episode3-after-safe-proxies.png` shows Percy as `LIVE` in the Source Monitor Wall.

Remaining Episode 3 work:

- Decide whether to intentionally generate the 49GB Charlie source proxy and the 34GB temp-video proxy, likely one at a time with `--allow-large-source` or larger explicit caps.
- Recover/relink the two unresolved Premiere placeholders if the originals can be identified.
- Keep the same architecture: whole synced source lanes plus metadata overlays. Do not turn these lanes into chopped clip assets.

## 2026-06-15 - Protected-folder prompt hardening

- Fixed a passive permission leak in `ExternalMediaAccess.fileExistsWithoutPrompt`: passive UI/readiness paths now refuse to probe Desktop, Documents, Downloads, iCloud, or `/Volumes` originals even when a folder grant is remembered.
- Kept explicit user actions as the only place originals may be accessed: import, relink, match folder, and proxy generation can still ask the user for access.
- Forced Program/source playback rebuilds to remain proxy-first by passing `allowExternalOriginalMedia: false`; playback should not use raw protected originals just because a folder was previously granted.
- Verified with `./script/build_and_run.sh --verify` and `./script/smoke_native_session_interactive_editor.sh --session episode-3-premiere-rescue --no-build --allow-blocked-readiness --min-source-monitors 6`.
- Visible screenshot proof saved at `/tmp/quipsly-permission-fix-check.png`: no Desktop permission prompt; source monitor wall shows protected originals honestly and proxy-ready lanes as live.

## 2026-06-15 - Right-side synced source wall strengthened

- Upgraded `RightSidebarView` from a passive media list into a synced source-monitor wall.
- Each right-side source card now shows the current sequence/source time mapping and the current decision state: `SHOW`, `SKIP`, `STANDBY`, or `OUT OF RANGE`.
- Added live sidebar summary counts for live proxies, blocked sources, sources showing at the playhead, and skip regions at the playhead.
- Preserved the architecture invariant: cards represent whole synced source lanes; SHOW/SKIP are metadata overlays, not chopped clips.
- Verified with `./script/build_and_run.sh --verify` and `./script/smoke_native_session_interactive_editor.sh --session episode-3-premiere-rescue --no-build --allow-blocked-readiness --min-source-monitors 6`.
- Visible screenshot proof saved at `/tmp/quipsly-sidebar-sync-state.png`.

## 2026-06-15 - Episode 1 scrub and precision timeline zoom

- Timeline zoom is now an MVP editing control, not just an overview affordance: the timeline supports trackpad pinch zoom, a Precision zoom button, and a higher 320 px/sec ceiling for fine cut work.
- Dense decision rendering now yields to editable SHOW/SKIP overlays at precision zoom so Premiere rescue decisions remain visible as an overview but become adjustable when the editor zooms in.
- Episode 1 scrub proof passed through `script/smoke_episode1_scrub_monitor_sync.sh --no-build`: 3 source monitors, proxy-ready, max source-player delta 0.002s at tested sequence times.
- Keep this invariant: scrubbing the main sequence timeline must update Program Output and every source monitor from the same sequence-time playhead, using each source lane's sync offset.

## 2026-06-15 - Human and agent precision-edit accessibility

- Timeline zoom state moved up to `WorkspaceView` so it is shared by human controls and the local agent API instead of being trapped inside a gesture-only SwiftUI view.
- Added semantic agent commands: `GET /focus_timeline` and `GET /timeline_zoom?mode=fit|precision|in|out|set&scale=<pixels-per-second>`, plus `agentctl focus-timeline` and `agentctl timeline-zoom` wrappers.
- Agent state now echoes `agentAccessibilityModel=semantic_commands_with_state_echo`, `timelinePixelsPerSecond`, `timelineFitToWindow`, `timelineFocusBehavior`, and `timelineZoomCommands`.
- UI pass: inspector defaults to a narrow rail to give timeline/source monitors more room; SHOW and SKIP decisions both have edge handles; selected decisions show exact start/end/duration; SHOW/SKIP overlay opacity was reduced so decisions read as metadata over whole source lanes rather than chopped media.
- Validation passed: `script/build_and_run.sh --verify`, `script/smoke_episode1_selected_decision_edit.sh`, `script/smoke_episode1_scrub_monitor_sync.sh --no-build`, and `script/agentctl.sh timeline-zoom precision` with state echo.
- Product invariant: every serious human editing affordance should have an agent-readable state field and an agent-callable semantic command. Do not make agents drive this editor by guessing screen coordinates when a semantic command can exist.

## 2026-06-16 - Pinned monitor cockpit and scrollable timeline workbench

- `WorkspaceView` now treats the Monitor Wall as a pinned cockpit above the scrollable timeline workbench. The Program Output and Source Monitor Wall stay visible while the editor scrolls and zooms through the decision timeline.
- The left inspector defaults to a narrow rail, keeping framing controls available without taking permanent timeline width. The explicit inspector is still one click away.
- Added a human `Timeline` focus control and kept agent parity through `focus_timeline` and `timeline_zoom` commands.
- Validation passed after the layout change: `script/build_and_run.sh --verify`, `script/smoke_episode1_selected_decision_edit.sh`, `script/smoke_episode1_scrub_monitor_sync.sh --no-build`, `script/smoke_native_session_interactive_editor.sh --session episode-1-premiere-rescue --no-build --min-source-monitors 3`, and agent state echo for `timelinePixelsPerSecond=160`.
- Current UX direction: monitor cockpit is the visual anchor, timeline is the editable metadata workbench, sidebars are supporting context. Do not regress to a single long scroll where timeline work hides the edit output.

## 2026-06-16 - Agent accessibility contract promoted

- Added `GET /agent_manual` to the app-local AgentServer and `script/agentctl.sh agent-manual`.
- `/health` and `/state` now expose the agent manual URL so agents can discover the contract before acting.
- `/state` now includes `agentOperatingProtocol` and `agentTrainingDataContract`.
- The editor toolbar now has an `Agent` control, and the details drawer shows the Agent Operator Loop near the top: Observe, Choose, Execute, Prove.
- Product rule: agent accessibility must be designed with the same care as human accessibility. If a human gets a serious editing affordance, agents need the matching state echo and semantic command.
- Training-data rule: capture before-state, semantic action, response, after-state, and proof snapshot. Do not train agents to screen-scrape or click by coordinates when the app has structured editor truth.

## 2026-06-16 - Timeline-local selected decision precision strip

- Added a selected-decision precision strip directly inside `TimelineEditorView`, above the decision timeline.
- The strip exposes exact selected decision start/end/duration and one-click controls for:
  - nudge earlier/later by 1s or 0.1s;
  - trim start/end by 0.1s;
  - delete the selected metadata decision.
- Added semantic selection support for agents/operators:
  - `GET /select_decision?mode=first|at_playhead|next|previous|first_video|next_video|previous_video&scope=all|video|support&lane_id=<optional-uuid-or-name>`
  - `script/agentctl.sh select-decision first`
  - `script/agentctl.sh select-decision first_video`
  - `script/agentctl.sh select-decision at_playhead video`
  - `script/agentctl.sh select-decision at_playhead "Charlie Camera"`
- `/state` now advertises `select-edit-decision` / `select-decision-at-playhead` safe actions so an agent can discover an editable target without brittle UUID guessing.
- Visual proof captured at `/tmp/quipsly-selected-decision-precision-strip.png`: Episode 1 shows the precision strip above the timeline while the monitor wall and source wall stay visible.
- Product rule reinforced: precision controls edit metadata only. Whole source lanes and original media remain untouched; `Play Through` keeps the raw synced source context visible.

## 2026-06-16 - Visual decision selection scope

- Extended `select_decision` with visual/support scoping so production camera editing does not accidentally select giant support-lane audio decisions.
- New selector forms:
  - `script/agentctl.sh select-decision first_video`
  - `script/agentctl.sh select-decision next_video`
  - `script/agentctl.sh select-decision previous_video`
  - `script/agentctl.sh select-decision at_playhead video`
  - `GET /select_decision?mode=at_playhead&scope=video`
- Backward-compatible all-lane modes remain available for diagnostics and support-lane work.
- Product rule: default proof and training paths for visual editing should prefer `scope=video`; support/audio lane decisions are still first-class, but they should be selected intentionally.

## 2026-06-16 - Agent capability parity map

- Promoted agent accessibility from "command list" to "human workflow parity map."
- Added app-local endpoint:
  - `GET /agent_capabilities`
  - `script/agentctl.sh agent-capabilities`
- `/state` now includes `agentCapabilityParity`, with each serious editor workflow mapped to:
  - human workflow;
  - fields agents can observe;
  - semantic commands agents can use;
  - proof endpoints;
  - readiness/parity status;
  - why the workflow matters as future training data.
- Current parity map covers monitor-wall scrub, Play Edit/Play Through, visual decision editing, source-window live switching, timeline precision navigation, output format/reframe preview, and media readiness recovery.
- UI now exposes a compact "Human <-> agent parity checks" section in the Agent access layer so operators can audit whether agent affordances match human affordances.
- Product rule: agent accessibility is part of done. When a human-facing editor feature becomes important, add the matching observation fields, semantic commands, proof fields, and training-data label before calling it mature.

## 2026-06-16 - Grouped visual decision review

- Changed visual decision review to navigate edit boundaries, not every per-lane overlay tag.
- Human shortcuts:
  - `[` selects the previous visual decision boundary.
  - `]` selects the next visual decision boundary.
- Timeline selected-decision strip now includes `Prev visual` and `Next visual`.
- The selected decision panel and quick strip also expose previous/next visual review controls.
- `/state` now echoes:
  - `visualDecisionCount`
  - `selectedVisualDecisionIndex`
  - `selectedVisualDecisionSequenceTime`
- Agent commands stay aligned:
  - `GET /select_decision?mode=previous_video`
  - `GET /select_decision?mode=next_video`
- Product rule: review navigation moves through camera/source edit boundaries. Precision editing still targets the selected lane-level SHOW/SKIP metadata tag. This keeps review fast without hiding the actual underlying metadata model.
- Validation passed:
  - `./script/build_and_run.sh --verify`
  - visual review proof showed Episode 1 as 90 grouped visual boundaries, not 181 individual visual tags.
  - `./script/smoke_episode1_selected_decision_edit.sh`
  - `./script/smoke_episode1_scrub_monitor_sync.sh --no-build`

## 2026-06-16 - Visual review-stop rail

- Added a visible review-stop layer to the Decision Timeline.
- Timeline stats now include `review stops`, and the legend explains cyan review stops as grouped edit boundaries.
- The rail is generated from the same `decisionBoundaryMarkers(scope: "video")` logic that drives keyboard and agent navigation. Do not fork that concept in the timeline UI.
- `/state` now labels the model as `visualDecisionBoundaryModel=grouped_visual_edit_boundaries`.
- Agent capability parity for visual decision editing now observes `visualDecisionBoundaryModel` and describes the distinction:
  - grouped review stops are navigation targets;
  - lane-level SHOW/SKIP tags are precise metadata edit targets.
- Visual proof captured at `/tmp/quipsly-visual-review-boundary-rail-focused.png`.
- Validation passed:
  - `./script/build_and_run.sh --verify`
  - `./script/agentctl.sh state` confirmed `visualDecisionCount=90`
  - `./script/agentctl.sh agent-capabilities` confirmed the visual workflow observes `visualDecisionBoundaryModel`
  - `./script/smoke_episode1_selected_decision_edit.sh`
  - `./script/smoke_episode1_scrub_monitor_sync.sh --no-build`

## 2026-06-16 - Clickable visual review stops

- Made the cyan review-stop rail interactive.
- Clicking a review stop now selects the representative visual SHOW/SKIP metadata tag, seeks the program/source monitors to that grouped boundary, and updates agent state.
- Ownership rule:
  - `WorkspaceView` owns grouped visual-boundary selection because it knows support/audio lane rules and can update `lastMediaAction` plus agent state.
  - `TimelineEditorView` renders the rail and forwards the selected `TimelineReviewBoundary`; it does not redefine visual-boundary semantics.
- Agent parity remains through:
  - `GET /select_decision?mode=previous_video`
  - `GET /select_decision?mode=next_video`
  - `/state` fields `visualDecisionBoundaryModel`, `visualDecisionCount`, `selectedVisualDecisionIndex`, and `selectedVisualDecisionSequenceTime`
- Validation passed:
  - `./script/build_and_run.sh --verify`
  - semantic proof selected grouped visual boundary index 2 of 90
  - `./script/smoke_episode1_selected_decision_edit.sh`
  - `./script/smoke_episode1_scrub_monitor_sync.sh --no-build`

## 2026-06-16 - Source Monitor Wall agent parity

- Moved source-specific review navigation into the visible right-side Source Monitor Wall, not only the internal Workspace source-card surface.
- Each synced source card can now show its lane-specific source-stop count and exposes `Prev` / `Next` controls for that lane's SHOW/SKIP metadata boundaries.
- The controls call the same source-boundary model used by agent routes:
  - `GET /select_decision?mode=previous_video&lane_id=<lane>`
  - `GET /select_decision?mode=next_video&lane_id=<lane>`
- `/state` and `/agent_capabilities` already echo the corresponding fields and safe actions, including `selectedSourceReviewStopCount`.
- Product rule: if we expect future models to learn how an editor edits, the source monitor wall must be both human-accessible and agent-accessible. Do not create a separate hidden agent workflow when the visible editor state can expose the same action safely.
- Visual proof captured at `/tmp/quipsly-right-source-stops.png`.
- Validation passed:
  - `./script/build_and_run.sh --verify`
  - `./script/build_and_run.sh`
  - `./script/smoke_episode1_selected_decision_edit.sh`
  - `./script/agentctl.sh editor-snapshot` reported `production_ready`, proxy-first, 3/3 source players, 236 SHOW, 118 SKIP, and selected Homer source lane.

## 2026-06-16 - Agent observe/act/re-observe correction

- Clarified the proof loop for agent actions: command endpoints such as `/select_lane` and `/select_decision` return command acknowledgements, not the final editor state.
- Correct agent loop:
  - observe `/state`;
  - execute semantic command;
  - wait briefly if needed;
  - re-observe `/state` or `/editor_snapshot` for the authoritative result.
- Avoid validation scripts that assume `/state` nests lanes under `sequence.lanes`; the current contract exposes lanes as top-level `lanes`.
- Proof after selecting Homer and running lane-specific `next_video`:
  - selected lane: `Homer Camera - NewHomerExport.MP4`
  - selected source stops: `89`
  - selected visual boundary: `2 / 90`
  - safe actions: `previous-selected-source-stop`, `next-selected-source-stop`

## 2026-06-16 - Agent CLI observe-after wrapper

- Added `script/agentctl.sh observe-after <command> [args...]` as the preferred CLI loop for actions that return command acknowledgements.
- Behavior:
  - runs the requested `agentctl` command;
  - writes the command acknowledgement to stderr;
  - waits briefly using `QUIPSLY_AGENT_OBSERVE_DELAY` (default `0.35` seconds);
  - returns authoritative `/state` on stdout.
- Alias: `script/agentctl.sh do <command> [args...]`.
- Updated the app-local `/agent_manual` payload with the acknowledgement rule:
  - `*_commanded` means accepted, not applied;
  - agents must re-observe `/state` or `/editor_snapshot` before claiming a state change worked.
- Proof:
  - `./script/agentctl.sh observe-after select-decision next_video <Homer lane id>` returned `/state` with `selectedLaneName=Homer Camera - NewHomerExport.MP4`, `selectedSourceReviewStopCount=89`, `selectedVisualDecisionIndex=2`, `visualDecisionCount=90`, and source-stop safe actions.
- Validation passed:
  - `./script/build_and_run.sh --verify`
  - `./script/smoke_episode1_selected_decision_edit.sh`
  - `./script/smoke_episode1_scrub_monitor_sync.sh --no-build`

## 2026-06-16 - Structured export state and session-switch correctness

- Added structured export state to `/state`:
  - `exportStatus`
  - `exportOutputPaths`
  - `exportState.status`
  - `exportState.kind`
  - `exportState.formats`
  - `exportState.outputPaths`
  - `exportState.error`
  - `exportState.startedAt`
  - `exportState.completedAt`
  - `exportState.proofSeconds`
  - `exportState.progress`
  - `exportState.isExporting`
  - `exportState.sourcePolicy`
- Added `script/agentctl.sh wait-export [timeout-seconds]` so agents can poll structured export state instead of parsing `lastMediaAction` prose.
- Updated `script/smoke_native_production_editor_matrix.sh` to assert structured export completion and both output paths.
- Strengthened `script/smoke_native_session_interactive_editor.sh` to fail if `activeSessionName` drifts by the end of an interaction.
- Fixed stale session-name drift by canceling pending autosaves before explicit session/project loads:
  - native session load;
  - demo load;
  - Premiere packet load.
- Root cause: autosave captured the previous session name and could complete after a later session load, producing Episode 3 content with an Episode 2 session label.
- Validation passed:
  - `./script/build_and_run.sh --verify`
  - bounded structured export proof produced real 1920x1080 and 1080x1920 MP4s.
  - `./script/smoke_native_production_editor_matrix.sh --no-build --proof-seconds 1`
- Current matrix truth:
  - Episode 1 is production-ready and exports 16:9 plus 9:16 proxy-backed MP4s with audio.
  - Episode 2 is honestly blocked on 3 video proxy/relink issues.
  - Episode 3 is honestly blocked on 4 video proxy/relink issues.

## 2026-06-16 - Human-visible export readiness

- Added export readiness/status to the native editor UI instead of leaving export truth only in `/state` and smoke scripts.
- New visible surfaces:
  - action bar export chip (`EXPORT READY`, `EXPORT BLOCKED`, `EXPORTING`, `EXPORTED`, `EXPORT FAILED`);
  - compact export progress/status panel while an export is active or recently completed;
  - production details export panel with output paths plus macOS actions to reveal outputs and copy paths.
- Export status is now session-scoped:
  - loading a native session clears prior export status;
  - loading a demo clears prior export status;
  - loading a Premiere packet clears prior export status.
- `/state.exportState.progress` is normalized:
  - `idle` and `blocked` report `0`;
  - `completed` reports `1`;
  - `running` reports live engine progress.
- Product rule: stale success is worse than visible failure. Do not show prior-session export paths as if they belong to the currently loaded edit.
- Proof:
  - Episode 1 loaded with `productionReady=true`, `exportState.status=idle`, `exportState.progress=0`, and visible green `EXPORT READY` chip.
  - Episode 1 bounded export still produced 16:9 and 9:16 MP4s through the structured export path.
  - Episode 3 load after export resets `exportState.status=idle`, `progress=0`, and clears output paths.
  - UI proof captured at `/tmp/quipsly-export-ready-label-proof.png`.
- Validation passed:
  - `./script/build_and_run.sh --verify`
  - focused session/export/session-switch proof
  - `./script/smoke_native_production_editor_matrix.sh --no-build --proof-seconds 1`

## 2026-06-16 - Program monitor scroll stays tied to sequence playhead

- Fixed a playback UX gotcha where two-finger scrolling over the main Program Output could be handled by the embedded player instead of the Quipsly sequence playhead.
- Added a tiny macOS `AVPlayerView` bridge (`ScrollScrubPlayerView`) that intercepts scroll-wheel events and routes them through `PlaybackEngine.scrub(to:)`.
- Product invariant:
  - there is one sequence playhead;
  - timeline scrubs, program monitor scrolls, source monitor sync, keyboard seeks, and agent `/scrub` commands all update through that same playhead path;
  - source monitors stay synced to whole lanes while Program Output shows edit truth.
- Added `T` as the visible Play Through shortcut:
  - `Space` = Play Edit / skip inactive gaps;
  - `T` = Play Through / raw synced sequence review;
  - `J` / `L` = jump back/forward 5s;
  - `K` = pause.
- Validation passed:
  - `./script/build_and_run.sh --verify`
  - `./script/smoke_episode1_scrub_monitor_sync.sh --no-build`
  - `./script/agentctl.sh observe-after playback through set` reported `playbackMode=Play Through`.

## 2026-06-16 UI redesign pass

- Reframed the native editor around a Quipsly Studio cockpit model: masthead status strip, monitor wall, command deck, transport, decision timeline, inspector tool bay, and source wall.
- Preserved the product invariant: source lanes are whole synced media lanes; SHOW/SKIP decisions are metadata overlays; proxies remain the preview/export path; originals stay protected.
- Split `RightSidebarView` into named source-wall subviews after SwiftUI type-checking failed on the monolithic body. This is the correct maintenance direction, not a cosmetic workaround.
- Split `TimelineEditorView` root into named timeline sections after the redesign pushed the body beyond SwiftUI type-check limits. Future timeline UI work should continue decomposing around product concepts: header, zoom controls, lane sidebar, ruler, tracks, playhead, precision strip.
- Re-skinned `InspectorSidebarView` as a framing/format tool bay with explicit non-destructive metadata language.
- Validation: `./script/build_and_run.sh --verify` passed. `./script/smoke_episode1_scrub_monitor_sync.sh --no-build` passed with 3 source monitors synchronized within 0.002s. `./script/agentctl.sh observe-after playback through set` confirmed Episode 1 is production ready, proxy-backed, and uses Play Through state after command.
- Visual proof captured at `apps/QuipslyStudio/tmp/quipsly-ui-pass-app.png`.

Next UI hardening target: make the decision timeline visible earlier in the vertical hierarchy or add a dedicated timeline focus workspace mode, because the monitor/source cockpit now looks much stronger but the timeline still requires scrolling in a shorter window.
