# Quipsly Native Editor Scope Audit

Updated: 2026-06-15

## Current canonical target

`apps/QuipslyStudio` is the active native editor target.

Use these older/native-adjacent app trees only as references unless a later proof explicitly replaces this decision:

- `apps/quipsly-mac`: older SwiftPM native cockpit / local tooling reference.
- `apps/quipsly-video`: independent Swift editor experiment/reference.

Do not claim work is implemented in the production editor unless it is present and proven in `apps/QuipslyStudio`.

## Product architecture that is gospel for this phase

- Whole synced source lanes are the editing truth.
- SHOW/SKIP/camera decisions are metadata overlays.
- Source media must not become Premiere-style chopped clips.
- Proxy playback is required for video lanes.
- Raw originals may stay external; they are not copied into the app vault by default.
- `Play Through` preserves full sequence time.
- `Play Edit` skips inactive/cut gaps.
- The right-side synced-source rail is MVP, not polish.
- A source monitor card represents a whole synced source lane, not an edited clip.
- Audio/support lanes are not fake video source monitors.

## What was corrected in this pass

1. `WaveformGenerator` was crashing Episode 2 by trying to allocate/analyze too much waveform data from large media.
2. Waveform analysis is now bounded and refusal-safe.
3. `WaveformView` now refuses raw video waveform reads unless a proxy exists and shows calm labels such as `proxy needed`, `source missing`, or `source offline`.
4. Desktop `WorkspaceView` now mounts `RightSidebarView` on the right side.
5. The main monitor wall no longer duplicates the horizontal source grid on regular-width layouts.
6. `RightSidebarView` now separates video source lanes from audio/sync support lanes.
7. Native session load now reads a session packet and publishes project/session state together instead of exposing mismatched label/data states.
8. Manual save and autosave now block named episode-session writes when the session name episode number does not match the current project/sequence episode number.
9. `episode-1-premiere-rescue.quipsly-session.json` was restored after it was found overwritten with Episode 2 content.
10. `smoke_native_session_interactive_editor.sh` now distinguishes strict production-ready proof from safe blocked-readiness proof.

## Current proof state

Episode 1 production-ready interactive proof passes:

```bash
cd /Users/wall-e/Dev/high-ground-studio/apps/QuipslyStudio
./script/smoke_native_session_interactive_editor.sh \
  --session episode-1-premiere-rescue \
  --no-build \
  --require-production \
  --min-source-monitors 3
```

Observed proof:

- `projectTitle`: `Episode 1 Native Edit`
- `productionReady`: `true`
- `sourceMonitorVideoCount`: `3`
- `sourcePlayerCount`: `3`
- `videoProxyReadyCount`: `3`
- `audioReadyCount`: `2`
- `showDecisionCount`: `236`
- `skipDecisionCount`: `118`
- `validRangeCount`: `29`
- `Play Through` stayed inside an inactive gap.
- `Play Edit` skipped that inactive gap.

Episode 2 safe blocked-readiness proof passes:

```bash
cd /Users/wall-e/Dev/high-ground-studio/apps/QuipslyStudio
./script/smoke_native_session_interactive_editor.sh \
  --session episode-2-native-proof \
  --no-build \
  --allow-blocked-readiness \
  --min-source-monitors 1
```

Observed proof:

- `projectTitle`: `Episode 2 Native Edit`
- `productionReady`: `false`
- `productionReadinessDetail`: `7 video lane(s) need generated proxies before editor playback. Do not fall back to raw originals.`
- `sourceMonitorVideoCount`: `7`
- `sourcePlayerCount`: `0`
- `videoBlockedCount`: `7`
- `audioBlockedCount`: `2`
- `showDecisionCount`: `1719`
- `skipDecisionCount`: `191`
- `validRangeCount`: `56`
- App no longer crashes while loading this session.

## MVP gaps still real

- Episode 2 and Episode 3 need proxy-generation/relink readiness work before real playback-backed editing.
- The right rail exists now, but it still needs better density, pinning, selected-lane highlighting, and keyboard focus behavior.
- The main program/edit area should stay the visual star; source cards should support fast camera decisions without stealing the layout.
- Export proof is strongest for Episode 1; repeat the proxy/export loop for Episodes 2-4 after media readiness is solved.
- Do not treat safe-load blocked sessions as production-ready sessions.

## Agent warning

If a future agent says “the sidebar is done” because `RightSidebarView.swift` exists, that is insufficient. The proof is: launch `apps/QuipslyStudio`, load a session, and visually/agent-state verify a persistent right-side synced-source rail beside the main editor.

## 2026-06-15 protected-folder permission fix

The macOS Desktop permission prompt reappeared because Episode 2 raw originals were linked under `/Users/wall-e/Desktop/Podcast/2`, and the editor still treated local debug filesystem access as permission to probe/load those protected raw paths.

Corrected rules:

- Protected original paths include `/Volumes`, `~/Desktop`, `~/Documents`, `~/Downloads`, and iCloud Mobile Documents.
- Protected raw originals are metadata links until a user grants that folder or a proxy exists.
- The program monitor must not fall back to raw video when a proxy is missing.
- Source cards for unproxied protected media must show HELD/proxy-required placeholders instead of loading `AVPlayer` or `AVAsset` from the raw file.
- Debug-build direct filesystem access is not permission to violate proxy-first playback.

Validation:

```bash
./script/smoke_native_session_interactive_editor.sh --session episode-2-native-proof --no-build --allow-blocked-readiness --min-source-monitors 1
./script/smoke_native_session_interactive_editor.sh --session episode-1-premiere-rescue --no-build --require-production --min-source-monitors 3
```

Visual proof screenshots:

- `/tmp/quipslystudio-permission-fix-proof.png` showed Episode 1 proxy-backed source cards and no permission prompt.
- `/tmp/quipslystudio-episode2-no-permission-proof.png` showed Episode 2 proxy-required placeholders and no Desktop permission prompt.
