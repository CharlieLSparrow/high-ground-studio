# Quipsly Mac Local Editor Workflow

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

- Native browser authentication through `ASWebAuthenticationSession`.

The app opens `/api/mac/session-handoff?native=1&callbackScheme=quipslymac` in the system browser authentication session. Nest handles Google/Patreon sign-in in the browser, then returns to the app with a custom-scheme callback:

```text
quipslymac://auth/session#token=<short-lived-token>&expiresAt=<iso-date>
```

The handoff token is short-lived and signed by the same server secret used for app auth. Native API calls attach it as:

```text
Authorization: Bearer <token>
```

Current check endpoint:

```text
/api/mac/session-check
```

The token is an access bridge, not a new account system. Nest still owns users, roles, invites, and project access.

The old paste-a-token field remains only as an advanced recovery path. It is not considered signed in until `/api/mac/session-check` accepts the token.

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

Quipsly Mac should use the native-app OAuth pattern, not embedded WebView login.

Current rule:

- The embedded web editor can display Nest pages after auth.
- OAuth/sign-in starts through `ASWebAuthenticationSession`, which opens the system browser/security context.
- Nest redirects back to the app with `quipslymac://auth/session#token=...`.
- The app stores the short-lived signed token in its normal settings store and verifies it through `/api/mac/session-check`.
- Native API calls attach that verified token as `Authorization: Bearer <token>`.

Break-glass recovery:

- `/api/mac/session-handoff` can still render a copy/paste token page for debugging.
- Saving a pasted recovery token must not be treated as signed-in until `/api/mac/session-check` verifies it.

The app bundle must register the `quipslymac` URL scheme. The durable launcher is `apps/quipsly-mac/script/build_and_run.sh`; `apps/quipsly-mac/scripts/build_and_run.sh` delegates to it so both entrypoints produce a bundle with the same callback registration.
