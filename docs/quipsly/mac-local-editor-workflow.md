# Quipsly Mac Local Editor Workflow

> 2026-06-14 status note: this document describes the older `apps/quipsly-mac` hybrid Nest/local-engine workflow. It is still useful for auth, local-engine, GCS object paths, and Premiere rescue history, but it is not the current canonical direction for the standalone native video editor. For the current `apps/quipsly-video` direction, read `docs/coordination/native-video-editor-control-room.md` first.

Status: current working model as of 2026-06-07.

This document describes the intended split between the Nest web app, the native Mac app, the local engine, and the web editor while we build the real Episode Editor workflow.

## Prime directive

Quipsly uses one production truth with multiple working surfaces.

The Mac app is allowed to handle local files, heavy media work, and calm operator workflow. It should not become a second source of truth for projects, collaborators, production metadata, or final timelines. When local work becomes durable, it is registered back into Nest.

The rule is not "everything must be cloud-first." The rule is: local work can be powerful, but durable project meaning belongs to Nest.

## Ownership split

### Nest owns collaboration and project truth

Nest is the system of record for:

- Users, invites, access grants, and roles.
- Nests/projects and their membership.
- Episode production records.
- Imported media metadata once an asset is registered.
- Spine audio selection and episode production JSON.
- Timeline JSON once saved by the editor.
- Sync diagnostics packets sent from Mac or web.
- Publishing state and downstream website/output relationships.

Nest should answer: who can see this, what project/episode does this belong to, what assets are known, what timeline is current, and what is publishable?

### Mac owns local files, import comfort, and sync-prep

The native Mac app is the local production cockpit for:

- Choosing files and folders from disk.
- Keeping an import queue with clear status.
- Capturing local-only operator context before upload.
- Assigning episode roles like spine audio, camera video, reference clip, b-roll, or YouTube/source clip.
- Sending files to the local engine for probe/proxy/upload.
- Showing retry, reveal in Finder, copy diagnostics, and open-in-editor actions.
- Capturing recording sync clues such as device label, recorded start/end, clock notes, segment order, and take order.
- Providing sync-prep panels before the web editor has full native NLE controls.
- Reviewing translated Premiere drafts as source monitors plus a program edit, so the operator can inspect all media while still playing the active cut that skips deactivated gaps.
- Embedding Nest routes in a WKWebView so the user can stay in one desktop app while still using the web editor.

The Mac app should answer: what files are on this machine, what state are they in, what should happen next, and how do I get them safely into the episode?

### Local edit review model

Premiere rescue and local sync work use a two-monitor mental model:

- Source monitors show each recovered/missing camera, audio, reference, or b-roll source independently.
- The program monitor shows the translated edit as Quipsly understands it.
- "Play source material" means inspect everything available from a source, even if the old edit did not use it.
- "Play active edit" means skip deactivated clips and recovered inactive source ranges without deleting them.

This is intentionally different from destructive cut-only workflows. Deactivated does not mean forgotten. It means "known, preserved, and currently skipped."

### Mac session handoff owns native API authentication

The Mac app has one primary Nest sign-in path:

- Normal browser authentication through Nest.
- One-time native handoff through `quipslymac://auth/session`.
- Exchange into a revocable Mac device session.
- Embedded editor access through the short-lived `/api/mac/web-session` cookie bridge.

The app opens `/api/mac/session-handoff?native=1&callbackScheme=quipslymac` in the system browser. Nest handles Google/Patreon sign-in in the browser, then shows a handoff page that attempts to open the Mac app with a custom-scheme callback:

```text
quipslymac://auth/session#code=<one-time-code>&expiresAt=<iso-date>
```

The handoff code is short-lived and one-use. The Mac app exchanges it through:

```text
/api/mac/session-exchange
```

The exchange returns short-lived access credentials and refresh credentials for a revocable native device session. Native API calls attach the current access token as:

```text
Authorization: Bearer <token>
```

Current check endpoint:

```text
/api/mac/session-check
```

Current embedded-editor bridge:

```text
/api/mac/web-session
```

The Mac app posts its access token to `/api/mac/web-session`, receives a one-use web login URL, loads that URL in WKWebView, and Nest sets an HTTP-only `quipsly_mac_web_session` cookie before redirecting to the editor route.

The token is an access bridge, not a new account system. Nest still owns users, roles, invites, and project access.

Development storage note:

- Local unsigned development builds store Mac device-session credentials in `~/Library/Application Support/QuipslyMac/nest-session-vault.json` with user-only permissions.
- This avoids macOS Keychain prompts caused by changing ad-hoc code-sign identities during rapid local development.
- Non-debug builds use the same profile-vault API backed by macOS Keychain, assuming the bundle identifier, signing identity, and access group are stable.

The old paste-a-code field remains only as an advanced recovery path. It is not considered signed in until `/api/mac/session-exchange` creates a device session and `/api/mac/session-check` accepts the resulting access token.

### Local engine owns media processing

The local engine is the machine-room worker for:

- WebSocket command handling from the Mac app.
- `ffprobe` / `ffmpeg` media probing.
- Proxy generation.
- Thumbnail generation.
- GCS upload.
- Nest import registration calls.
- Error classification for local media and upload failures.

The local engine should answer: can this file be read, what is inside it, can we make a useful proxy/thumb, can we upload it, and did Nest accept the registration?

It should not silently pretend success. Held or failed with a calm, useful error is better than fake green.

### Web editor owns the current timeline UI

The web editor is still the primary production editing surface for now:

- Media pool display.
- Timeline UI.
- Selected clip controls.
- Sync wizard.
- Sync checklist.
- Media health display.
- Manual clip placement.
- Timeline save/reload behavior.
- Publishing handoff UI.

The web editor should answer: what is currently in this episode, how is it arranged, what is synced, what is safe to test, and what should be saved?

### Cloud storage owns durable media objects

GCS owns raw/proxy/thumb storage. The current intended object path policy is:

```text
media-vault/raw/<projectSlug>/<episodeSlug>/<assetId>/<filename>
media-vault/proxy/<projectSlug>/<episodeSlug>/<assetId>/<filename>
media-vault/thumbnail/<projectSlug>/<episodeSlug>/<assetId>/<filename>
```

Bucket selection should come from configuration/env. Current local-engine precedence is intended to be:

```text
QUIPSLY_MEDIA_BUCKET
GCS_BUCKET_NAME
NEXT_PUBLIC_GCS_BUCKET
high-ground-raw-footage
```

## Current local commands

Run these from the repo root unless noted otherwise.

### Start the local engine

```bash
cd /Users/wall-e/Dev/high-ground-studio
pnpm --filter local-engine dev
```

Expected log shape:

```text
Unified Local Engine started on ws://localhost:4000
```

### Build and launch the Mac app

```bash
cd /Users/wall-e/Dev/high-ground-studio/apps/quipsly-mac
./script/build_and_run.sh --verify
```

For a normal launch after validation:

```bash
cd /Users/wall-e/Dev/high-ground-studio/apps/quipsly-mac
./script/build_and_run.sh
```

### Open the live Episode 4 web editor

```text
https://nest.quipsly.com/editor?project=high-ground-odyssey-manuscript&episode=episode-4
```

### Create a tiny safe local smoke fixture

This creates a two-second MP4 that is safe for import/proxy/upload smoke checks.

```bash
cd /Users/wall-e/Dev/high-ground-studio
mkdir -p /Users/wall-e/Dev/high-ground-studio/.tmp/smoke-media
FFMPEG_PATH=$(pnpm --filter local-engine exec node -e "process.stdout.write(require('@ffmpeg-installer/ffmpeg').path)")
"$FFMPEG_PATH" -y \
  -f lavfi -i testsrc=size=320x180:rate=24 \
  -f lavfi -i sine=frequency=440:duration=2 \
  -t 2 \
  -c:v libx264 \
  -pix_fmt yuv420p \
  -c:a aac \
  /Users/wall-e/Dev/high-ground-studio/.tmp/smoke-media/quipsly-episode-4-local-smoke.mp4
```

## Current data flow

1. The user opens the native Mac app.
2. The Mac app stores settings for Nest base URL, local engine URL, default project slug, default episode slug, and Home Nest slug.
3. The user chooses files or folders in the Mac import panel.
4. The user assigns each import a role.
5. The Mac app captures optional sync clues.
6. The Mac app sends work to the local engine over WebSocket.
7. The local engine probes the file.
8. The local engine generates a proxy and thumbnail in a Quipsly-managed cache location.
9. The local engine uploads raw/proxy/thumb objects to GCS.
10. The local engine registers the asset with Nest through the episode import endpoint.
11. Nest stores the imported media metadata in the episode production record.
12. The web editor hydrates the imported media from Nest.
13. The user uses the web editor to review, sync, place, save, and publish.

## Current WebSocket command shape

The Mac app and local engine use commands in this family:

```text
QUEUE_EPISODE_IMPORT
PROBE_MEDIA_FILE
GENERATE_EPISODE_PROXY
UPLOAD_REGISTER_EPISODE_MEDIA
RUN_KNOWN_PREMIERE_IMPORTS
```

The registration payload carries the important routing fields:

```json
{
  "projectSlug": "high-ground-odyssey-manuscript",
  "episodeSlug": "episode-4",
  "role": "camera-video",
  "nestBaseURL": "https://nest.quipsly.com"
}
```

When the Mac app has a saved handoff token, it adds `nestSessionToken` only to the transient `UPLOAD_REGISTER_EPISODE_MEDIA` command. The local engine uses that token to authenticate Nest registration and spine updates, then strips it before broadcasting job state back to the Mac UI.

Do not include `nestSessionToken` in diagnostic JSON, screenshots, reports, logs, or persisted import records.

### Premiere packet refresh command

The Mac app can ask the local engine to regenerate the known Episode 1-3 Premiere packets through:

```text
RUN_KNOWN_PREMIERE_IMPORTS
```

Example payload:

```json
{
  "projectSlug": "high-ground-odyssey-manuscript",
  "only": "episode-2"
}
```

The local engine runs:

```bash
node scripts/quipsly/import-known-premiere-projects.mjs --project high-ground-odyssey-manuscript --only episode-2
```

and returns structured summaries with media count, missing count, active clip count, inactive-source candidate count, and top spine candidate. This is intentionally local-engine-owned instead of Mac-owned so the Mac app does not need to know how Node/Premiere parsing works.

The full production payload should preserve sync clues when available:

```json
{
  "recordingSync": {
    "recordedStartAt": "2026-06-07T12:00:00.000Z",
    "recordedEndAt": "2026-06-07T12:03:30.000Z",
    "deviceLabel": "Charlie's iPhone",
    "sourceDeviceClockNotes": "Phone clock looked correct",
    "segmentOrder": 1,
    "takeOrder": 1
  }
}
```

## Nest production fields currently involved

The current implementation uses these episode-production concepts:

- `productionJson.importedMedia`
- `productionJson.importedMedia[].metadata.recordingSync`
- `productionJson.importedMedia[].metadata.localImport`
- `productionJson.importedMedia[].sync.recordingSync`
- `productionJson.spineAudioAssetId`
- `productionJson.audioTakeStack`
- `productionJson.timelineClips`
- `productionJson.syncDiagnosticsPackets`
- `timelineJson.timelineClips`

Timeline tracks should use string track IDs:

```text
V1, V2, V3... for visual media
A1, A2, A3... for audio media
```

Avoid rebuilding assumptions around a single magic `V1` or `A1` lane.

## Spine audio rule

Spine audio is first-class episode metadata, not just a clip name.

The Mac app may mark an imported audio file as the spine. The local engine/Nest registration path should then set or request:

```text
productionJson.spineAudioAssetId
```

If the request fails, the file can still be registered, but the UI must make the spine-selection failure obvious and recoverable.

## Timeline attach rule

Adding imported media to the timeline must be non-destructive.

Safe actions:

- Add at playhead.
- Add after last clip.
- Reuse an existing imported asset clip when the same asset is already attached.
- Use `A*` tracks for audio and `V*` tracks for video.

Unsafe actions unless explicitly confirmed:

- Replace existing timeline state.
- Delete existing manual clips.
- Move clips destructively.
- Treat generated audio-take stack clips as the same thing as manually edited timeline clips without explaining the distinction.

## Current smoke evidence

Recent local workflow smoke covered:

- Mac app built and launched after Swift fixes.
- Local engine started at `ws://localhost:4000`.
- A generated two-second MP4 fixture was probed successfully.
- Proxy and thumbnail generation completed.
- Raw/proxy/thumb were uploaded to GCS under the `media-vault/...` path policy.
- The media asset was registered to live Episode 4.
- The live Nest editor showed `quipsly-episode-4-local-smoke` in the media pool for:

```text
https://nest.quipsly.com/editor?project=high-ground-odyssey-manuscript&episode=episode-4
```

Observed registered asset ID:

```text
cmq3yl0yv000201s6er63i8qf
```

This proved the path can work end-to-end, but it did not yet prove every UI click in the native Mac file picker flow.

## Known risks and sharp edges

### Stale local-engine JavaScript drift

This is the biggest current technical risk in the Mac/local-engine lane.

The local engine should be launched with:

```bash
pnpm --filter local-engine dev
```

Older sprint artifacts left adjacent compiled `src/*.js` files that could be resolved before their newer `.ts` sources for extensionless imports. During smoke, proxy output still appeared beside the source file instead of in the intended Quipsly cache folder, which strongly suggested stale JS was used for part of the runtime.

Current cleanup direction:

- Stale checked-in/generated `apps/local-engine/src/*.js` files should stay out of `src`.
- `pnpm --filter local-engine dev` uses `ts-node --prefer-ts-exts`.
- `pnpm --filter local-engine build` emits compiled output to `apps/local-engine/dist`.
- Add a startup log that prints which proxy/cache policy is active.

Until this is fixed, trust live behavior more than source inspection for local-engine media paths.

### Native UI smoke is not fully automated yet

Computer Use was able to inspect the Mac app state, but click automation became unreliable after the first snapshot. The recent smoke used the same WebSocket command path the Mac app uses rather than driving the full native file picker UI.

Still needed:

- A true click-through import using the Mac panel.
- A file picker test with a real selected local file.
- A visual check that the import queue moves through each status cleanly.

### Local Prisma is not the live truth surface

Local Prisma checks can fail if `.env` points at a local or unavailable DB. For this workflow, live Nest/Cloud Run is the practical truth surface unless the developer intentionally points local env at the target database.

Do not interpret local `ECONNREFUSED` Prisma failures as proof that live registration failed.

### The episode production route is write-oriented

A direct `GET /api/episode-production?...` returned `405` during smoke. Current verification relies on the live web editor hydrating state, not a simple read endpoint.

A future debug/read endpoint may be worth adding, but should not become a public broad data leak.

### Auth is user-controlled

The Mac app should not inspect cookies.

If Nest rejects API calls because auth is missing or expired, the app should show clear actions:

- Open Nest login.
- Open embedded editor login.
- Retry after sign-in.

### Bucket and permission failures must stay explicit

The local engine should classify errors like:

- Missing file.
- Selected folder instead of file.
- Unsupported codec.
- `ffmpeg` missing.
- Upload auth missing.
- Bucket permission denied.
- Network offline.
- Nest auth required.

Do not reintroduce silent mock success in production paths.

### Smoke assets can accumulate

Episode 4 may collect test assets until we build cleanup/archive controls. That is acceptable during active construction, but the editor should eventually make it easy to hold, hide, archive, or delete test imports without touching real manuscript content.

### Add-at-playhead needs a real playhead bridge

The Mac workflow can offer add-at-playhead, but if the Mac app does not know the web editor playhead yet, it may fall back to `0` or another default. The next stronger version should let the web editor expose current playhead to the Mac shell or require explicit placement.

### Large media is not stress-tested

The current smoke fixture is tiny. Real Insta360, iPhone, camera, and long-form episode media will stress:

- Probe speed.
- Proxy duration.
- Disk cache use.
- Upload duration.
- Retry/resume semantics.
- Battery and sleep behavior.
- GCS permissions and signed/private URL strategy.

## Immediate next fix queue

1. Resolve stale JS/TS drift in `apps/local-engine`.
2. Rerun Episode 4 smoke through the actual Mac import UI.
3. Add a local-engine run script so nobody has to remember the exact `ts-node` incantation.
4. Add explicit debug/read support for episode production state, guarded by access checks.
5. Add cleanup/hold/archive controls for smoke assets.
6. Add a Mac/web playhead bridge or make placement explicitly user-selected.
7. Add larger-file smoke with a realistic but safe media sample.
8. Document required environment variables for bucket and Nest endpoint behavior.

## Operating principles

- Local files are precious. Do not delete them after upload unless we have an explicit, checksum-backed, user-approved offload workflow.
- Nest owns project meaning.
- The Mac app owns local comfort.
- The web editor owns current timeline interaction.
- The local engine owns heavy media work.
- GCS owns durable objects.
- Every failure should tell the user what happened and what to do next.
- A file in `held` state is better than a fake success.
- Non-destructive beats clever.
- The user should never need timeline expertise just to import and sync episode media.

## Native Nest sign-in model

Quipsly Mac should use the native-app browser handoff pattern, not embedded WebView OAuth.

Current rule:

- The embedded web editor can display Nest pages after auth.
- OAuth/sign-in starts in the normal browser/security context.
- Nest serves an "Open Quipsly Mac" handoff page that attempts `quipslymac://auth/session#code=...`.
- The app exchanges that one-time code through `/api/mac/session-exchange`.
- The app stores the resulting device session in the local profile vault and verifies it through `/api/mac/session-check`.
- Native API calls attach the current short-lived access token as `Authorization: Bearer <token>`.
- Embedded editor routes call `/api/mac/web-session` to convert the native access token into a short-lived HTTP-only web session cookie.

Break-glass recovery:

- `/api/mac/session-handoff` can still render a copy/paste recovery code drawer for debugging.
- Saving a pasted recovery code must not be treated as signed-in until `/api/mac/session-exchange` and `/api/mac/session-check` both succeed.

The app bundle must register the `quipslymac` URL scheme. The durable launcher is `apps/quipsly-mac/script/build_and_run.sh`; `apps/quipsly-mac/scripts/build_and_run.sh` delegates to it so both entrypoints produce a bundle with the same callback registration.

## Episode 1-3 Premiere rescue status - 2026-06-09

Current local rescue truth for `high-ground-odyssey-manuscript`:

- `episode-1` is locally source-clean and cache-clean. `NewHomerExport.MP4` is linked from the HighGroundDrive Google Drive path and cached through a symlink rather than copied, because the source is a 24 GB cloud file.
- `episode-2` has one unresolved active source group: `V1 video clip 235`. `V2 video clip 211` was relinked to `Title Sequence.mp4` by same-track source/timeline continuity evidence and backed up before mutation.
- `episode-3` has one unresolved active source group: `V1 video clip 598`. `video clip 1878` is linked/cached; the remaining opening V1 placeholder needs human confirmation or better Premiere metadata recovery.
- All three episodes preserve inactive/deactivated Premiere ranges as known skipped decisions. They are not deleted.

Useful commands from repo root:

```bash
# Refresh manifests and print the real render-readiness matrix.
QUIPSLY_MAC_SKIP_BUILD=1 apps/quipsly-mac/script/render_readiness_matrix.sh --refresh high-ground-odyssey-manuscript episode-1 episode-2 episode-3

# Refresh manifests and write the missing-source report with Spotlight/CloudStorage search.
QUIPSLY_MAC_SKIP_BUILD=1 QUIPSLY_MISSING_SOURCE_SEARCH=1 apps/quipsly-mac/script/missing_source_report.sh --refresh high-ground-odyssey-manuscript episode-1 episode-2 episode-3

# Dry-run safe source relinks from the latest report.
apps/quipsly-mac/script/apply_missing_source_matches.sh

# Apply only unambiguous filename or continuity matches from the latest report, writing a session backup first.
apps/quipsly-mac/script/apply_missing_source_matches.sh --apply

# Link playback cache paths without copying giant sources when symlinks are safer.
apps/quipsly-mac/script/cache_playback_sources.sh --apply high-ground-odyssey-manuscript episode-1

# Generate renderer-facing program plans from render-prep manifests.
apps/quipsly-mac/script/smoke_render_program_plan.sh high-ground-odyssey-manuscript episode-1 episode-2 episode-3
```

Current render-plan bridge:

- `apps/quipsly-mac/script/render_manifest_program_plan.mjs` writes `~/Library/Application Support/QuipslyMac/render-plans/<projectSlug>/<episodeSlug>/program-plan.json`.
- The plan chooses the topmost active `V*` clip at each edit interval for the program picture.
- The plan preserves active `A*` clips for the future mixer/render layer.
- Inactive clips stay in the render-prep manifest and are intentionally skipped by the program plan.
- A plan is `ok: true` when Play Edit export has no program-level blockers and has video segments. Source-review blockers may still exist when missing lower-track media is fully hidden by higher playable `V*` media.

Validation last run:

- `episode-1`: `ready-for-renderer`, `0 / 0` missing source, `0 / 0` cache needed, 115 preserved inactive cuts, program plan `ok: true`.
- `episode-2`: `needs-media-review`, one missing source group `V1 video clip 235`, zero cache blockers, program plan is `ok: true`; this remains a source-review blocker only because the missing lower-track source is hidden by playable higher-track program media.
- `episode-3`: `needs-media-review`, one missing source group `V1 video clip 598`, zero cache blockers, program plan is `ok: true`; this remains a source-review blocker only because the missing lower-track source is hidden by playable higher-track program media.

## Program export vs source review - 2026-06-09

The Mac Episode Editor now separates two kinds of missing media:

- **Program export gaps**: the missing source would be the topmost visible `V*` program clip at some Play Edit interval, or an active `A*` source needed by export. These block Play Edit export and should be fixed before rendering.
- **Source review gaps**: the missing source is still preserved in the full rescued Premiere decision graph, but is hidden by higher playable program media or otherwise not needed for the current Play Edit output. These should stay visible for cleanup, but they should not scare the editor or block proof renders.

This distinction matters because Quipsly preserves the full edit, including deactivated cuts and lower-track source history. The editor should not pretend hidden Premiere leftovers are missing export media.

Current UI contract:

- `Render prep looks clean` means no active source gaps and no playback-cache blockers.
- `Program export ready; source review incomplete` means Play Edit export has no program blockers, but preserved source-review groups still need human cleanup or confirmation.
- `Needs program source before export` means the currently approved Play Edit output depends on missing source media.

Renderer-facing commands:

```bash
# Build renderer-facing program plans for Episodes 1-3.
apps/quipsly-mac/script/smoke_render_program_plan.sh high-ground-odyssey-manuscript episode-1 episode-2 episode-3

# Produce a bounded proof render from a safe Episode 2 section.
apps/quipsly-mac/script/smoke_render_program_proof.sh high-ground-odyssey-manuscript episode-2 53.56 3

# Direct proof renderer usage, capped to 120 seconds for safety.
node apps/quipsly-mac/script/render_program_proof.mjs high-ground-odyssey-manuscript episode-2 --start 53.56 --duration 3
```

Known large-media caveat:

- Some opening episode media points to very large cloud-backed files. The proof renderer now fails quickly and calmly when `ffprobe` cannot read those sources inside the timeout. That is a real local-file/cloud-hydration issue, not a timeline data loss issue.

## Native proof render affordance - 2026-06-09

The Episode Editor toolbar now includes:

- `Prep render`: writes the non-destructive render-prep manifest.
- `Proof render`: renders a short bounded MP4 proof from the current Play Edit playhead using the renderer-facing program plan.
- `Reveal proof`: opens the most recent proof MP4 in Finder after a render succeeds.

The proof button is intentionally small-scope:

- It is for quick confidence checks while editing.
- It does not publish anything.
- It is not the final full-resolution export pipeline.
- It is disabled when Play Edit export has program-level source blockers.
- It remains enabled when only source-review gaps exist, because those preserved lower-track gaps do not affect the current Play Edit picture.

Validated visible Mac snapshot markers:

- `renderProofSchema: local-proof-render-current-playhead-v1`
- `renderProofButtonId: episode-editor-proof-render-button`
- `renderProofRevealButtonId: episode-editor-reveal-proof-render-button`

### Proof render safe-window behavior

The native proof button uses the current playhead when the current program clip is local-friendly. If the playhead is parked on a giant symlinked/cloud-backed source, the app falls forward to the first topmost playable `V*` program decision whose resolved media target is under 1 GB.

Current proof-start policy marker:

- `prefer-current-playhead-else-first-small-program-media-v1`

This prevented Episode 2 from trying to proof-render the huge opening source at `0:00`; the app selected `19.12s`, and the bounded proof render succeeded from that window.

## Motion-aware proof render - 2026-06-09

Program plans now carry clip `motion` metadata into video segments. Adjacent segments are only merged when their motion metadata matches, so a zoom/pan decision cannot accidentally leak across a neighboring cut.

The proof renderer currently applies the first motion keyframe as a static transform:

- `scale` becomes a zoom from the already-fit frame.
- `x` / `y` shift the crop window after zoom.
- `opacity` is preserved in metadata but not yet mixed into final compositing.

This is not full animated keyframing yet. It is a deliberate first renderer contract so local proof exports can show basic zoom/pan decisions instead of treating motion metadata as decorative JSON.

Validation performed:

- Generated Episode 1-3 program plans after adding motion passthrough.
- Rendered Episode 2 safe proof at `19.12s + 8s` successfully.
- Temporarily injected a synthetic Episode 2 motion keyframe into the generated plan, rendered a 1s proof, confirmed `motionFragments: 1`, then restored the plan.

## Guarded full-draft export mode - 2026-06-09

`render_program_proof.mjs` now supports a guarded full-draft export path:

```bash
# Refuses safely unless explicitly confirmed when duration exceeds 120 seconds.
node apps/quipsly-mac/script/render_program_proof.mjs high-ground-odyssey-manuscript episode-2 --full

# Intentional full draft export, after the editor has verified media readiness.
node apps/quipsly-mac/script/render_program_proof.mjs high-ground-odyssey-manuscript episode-2 --full --confirm-long-render
```

Rules:

- Short proof windows remain the default editing confidence tool.
- Full renders over 120 seconds require `--confirm-long-render`.
- Full mode uses the program plan duration and writes `*-draft-export-*.mp4` unless `--output` is provided.
- This is still a local draft export path, not the publishing workflow.

Validation performed:

- Episode 2 short proof still renders after adding full mode.
- Episode 2 `--full` without confirmation fails before rendering with the expected guard message.

### UI file checks must stay lightweight

The Mac UI must not resolve cloud-backed symlink targets while building SwiftUI views. A resolved target check can block window creation before the editor appears.

Current rule:

- UI proof-start selection treats symlinked media as not proof-friendly without resolving the target.
- Renderer scripts may inspect/ffprobe real paths because they run outside the UI render path and can fail calmly.
- If a proof-render safety check ever needs deeper file inspection, move it to a background task or renderer preflight, not a SwiftUI body helper.

The Episode Editor also exposes a safe `Copy full export` action. It copies the explicit guarded command instead of launching a long render from the toolbar.

### Native proof duration default

The native toolbar `Proof render` action now renders a 3-second local proof clip by default. Longer checks should use the renderer script directly or the future export panel.

Reason: Episode 1 proved that even a technically valid safe window can be slow when media is cloud-backed or codec-heavy. The native button should feel like a confidence tap, not a surprise render job.

## Native full draft export workflow - 2026-06-09

The Episode Editor now has a real native long-render path, not just a Terminal handoff:

- `Proof render`: renders a 3-second confidence MP4 from a safe local-friendly program window.
- `Draft export...`: opens an explicit confirmation dialog, then runs the guarded full local draft export asynchronously.
- `Reveal draft`: opens the latest completed full draft export in Finder.
- `Copy full export`: remains as a fallback/operator command for terminal-driven export.

The full draft export is still local-first and non-publishing:

- It uses the current Play Edit program plan.
- It requires user confirmation in the app.
- It uses the renderer guard path (`--full --confirm-long-render`).
- It is disabled when Play Edit has program-level source blockers.
- Source-review-only gaps do not disable export, because they do not affect the current topmost Play Edit program output.

Smoke markers added:

- `renderDraftExportSchema: confirmed-local-full-draft-export-v1`
- `renderDraftExportButtonId: episode-editor-draft-export-button`
- `renderDraftExportRevealButtonId: episode-editor-reveal-draft-export-button`

Validated visible state:

- Episodes 1, 2, and 3 all load in the Mac editor.
- Episodes 1, 2, and 3 all show the native draft export button enabled.
- Episodes 2 and 3 retain source-review-only gap visibility without blocking export.

### Local export guide in Episode Editor

The Episode Editor workbench now shows a three-step local export guide under render readiness:

1. `Proof render` creates a short confidence MP4 from the safe playhead window.
2. `Draft export...` creates the full Play Edit output only after explicit confirmation.
3. Publishing remains a later promotion step from saved local draft truth.

This guide is intentionally redundant with the toolbar buttons. The point is to keep the real editing workflow calm: first prove a tiny clip, then export the full local draft, then promote/publish from an artifact the human can inspect. Inactive Premiere cuts remain preserved edit decisions, not deleted media.

The app smoke snapshot asserts `localExportGuideSchema: proof-then-draft-local-export-guide-v1` so future UI cleanups do not accidentally hide the export path again.

### Episode 1-3 rescue board

The Episode Editor now shows an `Episode 1-3 rescue board` above the active local workbench. It is a batch readiness surface for the immediate re-edit/publish push:

- Each card opens one recovered Premiere episode draft.
- Each card shows whether the local session is loaded.
- Loaded cards show clip count, skipped/inactive count, and program duration.
- Export readiness is based on active Play Edit source availability, not source-review-only gaps.

The board is deliberately not a new data model. It reads the same saved local episode sessions and keeps the user oriented while Episodes 1, 2, and 3 move from Premiere rescue toward Quipsly-native draft exports.

The rescue board includes `Copy readiness`, which copies a short Markdown report for Episodes 1-3. Use it for handoff, daily planning, or agent coordination before full exports. It intentionally reports local readiness only: whether the recovered edit session is loaded, whether Play Edit export is blocked, source-review-only notes, clip counts, skipped cuts, and program duration.

### Full-export dry-run stream probing

Full draft exports and full dry runs use `streamProbeMode: path-only-full-render` by default. This is intentional. Episodes 1-3 include very large source files surfaced through Quipsly playback-cache symlinks, and strict stream probing can hang for tens of seconds on 18-22GB media before a render even starts.

Current rule:

- Proof renders inspect streams with `ffprobe` because they consume a small concrete window.
- Real renders inspect streams before consuming media.
- Full draft exports trust the Quipsly program plan for video/audio stream shape and let `ffmpeg` report the real render result. Dry runs verify source paths, program-plan assembly, fragment counts, and command shape without probing every huge source.
- Set `QUIPSLY_RENDER_FULL_PROBE_STREAMS=1` if strict stream probing is needed for a diagnostic full-export pass.

This avoids pre-render hangs on huge symlinked media while preserving proof-render stream checks and real `ffmpeg` result reports.

### Draft export runner

Use `apps/quipsly-mac/script/render_draft_export.sh` for observable full-draft exports from the local program plan.

Examples:

```bash
apps/quipsly-mac/script/render_draft_export.sh high-ground-odyssey-manuscript episode-2 --dry-run
apps/quipsly-mac/script/render_draft_export.sh high-ground-odyssey-manuscript episode-2 --background
QUIPSLY_DRAFT_EXPORT_WIDTH=426 QUIPSLY_DRAFT_EXPORT_HEIGHT=240 QUIPSLY_DRAFT_EXPORT_FPS=12 apps/quipsly-mac/script/render_draft_export.sh high-ground-odyssey-manuscript episode-2 --background
```

The runner writes logs under `~/Library/Application Support/QuipslyMac/render-logs/<project>/<episode>/`. This keeps long exports observable and avoids foreground terminal lockup while the Mac editor continues evolving.

### Chunked draft export status

The full-draft export path now has a chunked renderer: `render_program_chunked_export.mjs` renders short Play Edit windows and concatenates the resulting MP4 chunks. This avoids the macOS argument-limit problem caused by trying to launch one ffmpeg process with hundreds of input fragments.

Current proven state:

- Episode 2 low-resolution chunk 0 renders and concatenates successfully.
- `setsar=1` is required on every rendered video fragment so ffmpeg concat accepts mixed source aspect metadata.
- Chunked child renders use `QUIPSLY_RENDER_SKIP_STREAM_PROBES=1` to avoid ffprobe hangs on huge/cloud-backed media.
- Full Episode 2 low-resolution export progresses through chunks 0-2, then currently stalls around chunk 3 on a large source seek. The chunked exporter now supports `--chunk-timeout-ms` so future runs report that as a precise timed-out chunk instead of hanging indefinitely.

Useful diagnostic command:

```bash
apps/quipsly-mac/script/render_program_chunked_export.mjs high-ground-odyssey-manuscript episode-2 --width 426 --height 240 --fps 12 --chunk-seconds 60 --max-chunks 1
```

Useful full low-resolution attempt:

```bash
apps/quipsly-mac/script/render_program_chunked_export.mjs high-ground-odyssey-manuscript episode-2 --width 426 --height 240 --fps 12 --chunk-seconds 60 --chunk-timeout-ms 180000
```

Next likely hardening target: identify slow/stuck chunks, pre-cache or proxy the source ranges they need, and let the Mac app show chunk export progress/problem chunks instead of hiding this in terminal logs.

### Source readiness and cloud-placeholder media

Program export readiness now has two layers:

1. The render plan can be structurally valid: clips, active ranges, tracks, and source paths all line up.
2. Each source file must also have local bytes available. A path can exist and report a large logical file size while still having `0B` allocated locally because it is a cloud placeholder or sparse file.

Use this command before full Episode 1-3 exports:

```bash
node apps/quipsly-mac/script/render_program_source_readiness.mjs high-ground-odyssey-manuscript episode-1 episode-2 episode-3
```

For one episode, and to ask macOS/iCloud to materialize missing local bytes:

```bash
node apps/quipsly-mac/script/render_program_source_readiness.mjs high-ground-odyssey-manuscript episode-2 --download
```

The report is saved under:

```text
~/Library/Application Support/QuipslyMac/render-readiness/<projectSlug>/source-readiness-*.json
```

Current renderer behavior is intentionally fail-fast: if a required source has almost no local allocated bytes, `render_program_proof.mjs` exits with a plain download-needed error before spawning a long ffmpeg render. This prevents scary silent hangs and preserves the non-destructive Premiere rescue semantics.

Chunked exports can now retry or diagnose exact chunks:

```bash
node apps/quipsly-mac/script/render_program_chunked_export.mjs high-ground-odyssey-manuscript episode-2 --only-chunk 3 --chunk-timeout-ms 30000
node apps/quipsly-mac/script/render_program_chunked_export.mjs high-ground-odyssey-manuscript episode-2 --start-chunk 3 --max-chunks 2
```

Each chunk report includes `chunkSourceSummaries` with track IDs, source ranges, symlink targets, logical size, allocated size, and `localReadiness`.


### Durable macOS media access

Quipsly Mac should not keep asking for the same folder over and over. The production pattern is:

1. Use `Local Files` as the user's media access vault.
2. Grant durable roots such as `/Users/wall-e/Desktop/Podcast`, `/Users/wall-e/Library/CloudStorage`, external drives under `/Volumes`, camera dumps, or research photo folders.
3. Store those grants as security-scoped bookmarks in `~/Library/Application Support/QuipslyMac/media-access-roots.json`.
4. Restore those bookmarks on launch before import, relink, proxy, source-readiness, or render workflows run.
5. Keep feature-specific file pickers as fallbacks, not the default way the app remembers where media lives.

Whole-system access is different. Quipsly Mac cannot grant itself permanent full-disk access. For broad rescue work, the user must add the app in `System Settings > Privacy & Security > Full Disk Access`. For that grant to remain stable across real releases, the app should be signed with a durable signing identity. The local SwiftPM build script supports that through:

```bash
QUIPSLY_MAC_CODESIGN_IDENTITY="Developer ID Application: Your Name (TEAMID)" apps/quipsly-mac/script/build_and_run.sh --verify
```

If no signing identity is configured, the script uses ad-hoc signing so local development remains fast, but macOS privacy grants may be less stable across rebuilds. That is acceptable for development and not acceptable as the final beta distribution story.

`fileproviderctl evaluate` is useful for diagnosing online-only files. If a blocker shows `provider: macos-file-provider`, `isDownloaded: false`, and `isKeepDownloaded: false`, Quipsly has permission to see the item but the provider has not downloaded the bytes. In Finder, reveal the resolved path and choose `Download Now` or `Make Available Offline`, then rerun the source-readiness audit. Do not keep retrying ffmpeg while the item still reports `0B` allocated.

The source materialization watcher wraps the audit command for long downloads:

```bash
node apps/quipsly-mac/script/render_program_source_watch.mjs high-ground-odyssey-manuscript episode-1 episode-2 episode-3 --request --interval-seconds 30 --max-wait-seconds 1800
```

Use `--request` once to reveal/request blockers, then let the watcher print whether each File Provider item is `not requested`, `requested`, `downloading`, or fully local. The Episode Editor exposes this as `Copy watch` in the Source bytes audit row.
