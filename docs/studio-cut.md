# Studio Cut

Date: 2026-05-21

## Purpose

Studio Cut is an internal-first multicam podcast editor for the Charlie/Homer
recording workflow. It is not a Premiere clone and does not destructively cut
media. The full synced source timeline stays intact; editing creates semantic
decision events over source time.

Current slice:

- `apps/studio-cut-web`: Vite + React + TypeScript editor shell
- `packages/studio-cut-schema`: shared TypeScript schema for decision events and
  derived program segments
- browser `localStorage`: always-on local/offline persistence
- optional Firebase web config: enables Firestore-ready cloud persistence without
  making Firebase mandatory for local dev
- Firebase Auth / Google sign-in gate when Firebase config and allowed emails
  are provided at build time

## Media Boundary

Full-resolution source media stays local:

- Charlie Canon R8 video
- Homer Insta360 exported 4K video with reframing padding
- Homer DJI Mic 3 clean audio
- Charlie Shure MV7i clean audio
- iPhone call recording as backup audio and sync reference

Do not commit secrets, credentials, full media, proxy media, personal
recordings, generated render outputs, or generated caches.

The web/cloud layer should store only lightweight project metadata, proxy
references/packages, semantic decision events, branches, comments, and later
collaboration state.

## Editing Model

A `DecisionEvent` records a semantic program state at a source timestamp. That
state applies from its timestamp until the next state decision or the episode
end.

Initial states:

- `Charlie`
- `Homer`
- `Both`
- `Charlie/Clip`
- `Homer/Clip`
- `Both/Clip`
- `Cut`

`Cut` means inactive/skipped in program playback. It does not delete or modify
source media.

The same semantic edit should eventually render differently for 16:9, 9:16,
audio-only, and other profiles. Presentation choices belong in render profiles
and FX passes, not in the core decision event.

## Scrub Vs Playback

Studio Cut separates source scrubbing from program playback:

- Source Scrub: the slider, time input, event jumps, and manual time controls
  always use canonical source time. They show the full source timeline,
  including `Cut` / inactive spans.
- Program Playback: the Play button uses the same source-time clock but
  simulates final program playback. When playback reaches a segment whose state
  is `Cut`, it jumps to the next non-`Cut` segment start. If there is no next
  active segment, playback stops.

This does not create destructive cuts or a new source timeline. Source time
remains canonical; playback skipping is only a preview behavior for inactive
ranges.

## Tagging Cockpit

The web editor supports keyboard-first Episode tagging after a manifest and
local proxy are loaded:

| Key | Action |
| --- | --- |
| `1` | Add `Charlie` decision |
| `2` | Add `Homer` decision |
| `3` | Add `Both` decision |
| `4` | Add `Charlie/Clip` decision |
| `5` | Add `Homer/Clip` decision |
| `6` | Add `Both/Clip` decision |
| `X` | Add `Cut` decision |
| `Space` | Play / Pause |
| `Left` / `Right` | Scrub source time by 1 second |
| `Shift+Left` / `Shift+Right` | Scrub source time by 10 seconds |

Shortcuts are ignored while typing in inputs or notes. The Current Segment panel
shows the state that applies at the current source time, its in/out range, and
whether Program Playback will include or skip that span. Decision export uses
the manifest id when present, for example `episode-004-decisions.json`.

## Episode Manifest

Studio Cut can import an Episode Manifest JSON file for the temporary
Premiere-synced bootstrap workflow. The manifest records:

- episode id, title, and source duration
- Homer, Charlie, optional Clip, and Program source labels
- source-monitor proxy URL or local placeholder path
- pane rectangles for Homer, Charlie, and optional Clip
- Premiere XML/EDL bootstrap notes

The web app uses the manifest duration as the source timeline length and
displays the source-monitor proxy metadata. It does not require full-res media.
A placeholder-only sample lives at:

```text
docs/studio-cut-episode-manifest.sample.json
```

Do not put real media paths, private podcast details, proxy package URLs, or
personal recordings in checked-in manifest files.

## Local Proxy Playback

Studio Cut can play a local source-monitor proxy video in the browser without
uploading it anywhere. Use `Load Local Proxy Video` in the Episode Manifest
panel and choose a local `.mp4`, `.mov`, or `.m4v` file from the operator's
machine.

Important boundaries:

- the selected file is read only by the current browser tab
- the app uses an in-memory `URL.createObjectURL()` URL
- the file and object URL are not saved to localStorage
- the file and object URL are not written to Firestore decision events
- the file is not uploaded to Firebase Hosting, Cloud Storage, Firestore, or
  any other service
- the object URL is revoked when the video is replaced, cleared, or the app
  unloads

The source-time slider seeks the local proxy video. Program Playback uses the
same video but keeps the semantic preview behavior: when playback reaches a
`Cut` span, it seeks the video to the next non-`Cut` segment start. Manual
scrubbing, event jumps, and time edits still show the full source timeline,
including inactive spans.

The current player shows the source-monitor proxy as one composite video. It
uses the manifest's Homer, Charlie, and Clip pane rectangles as visible metadata
and as browser-only crop instructions for the Program Preview.

When a local proxy and manifest are loaded, the Program Preview switches from a
semantic text label to a `Proxy Program Preview`. The browser duplicates the
local object URL into muted cropped panes and composes the semantic state this
way:

| State | Browser proxy preview |
| --- | --- |
| `charlie` | Charlie pane full preview |
| `homer` | Homer pane full preview |
| `both` | Homer and Charlie side by side |
| `charlie_clip` | Charlie and Clip side by side |
| `homer_clip` | Homer and Clip side by side |
| `both_clip` | Homer/Charlie stacked left, Clip large right |
| `cut` | Inactive/skipped visual state |

The proxy file still stays local to the browser tab. The object URL is not
persisted to localStorage or Firestore, and no video is uploaded.

## Premiere Bootstrap Workflow

Use Premiere only to create the temporary synced source truth:

1. Sync the episode sources in Premiere.
2. Export a lightweight source-monitor proxy that shows the Homer, Charlie, and
   optional Clip panes.
3. Export XML/EDL from Premiere if available.
4. Create a Studio Cut Episode Manifest JSON with placeholder-safe source names,
   duration, proxy metadata, pane rectangles, and XML file name.
5. Import the manifest in Studio Cut.
6. Load the local source-monitor proxy video from the operator's machine.
7. Tag semantic decisions in Studio Cut against source time.
8. Export Studio Cut decision JSON.

Tonight's usable workflow is:

```text
Premiere sync -> proxy export -> manifest import -> local proxy load -> semantic tagging -> decision JSON export
```

Tonight's boundary: Premiere owns temporary source sync. Studio Cut owns the
semantic decision layer. The later local render engine should consume the
Premiere-derived sync reference plus Studio Cut decisions and render full-res
output locally.

## Preview Truths

- Source monitor proxies are for seeing and timing source material in the web
  editor. Local proxy playback is browser-only and ephemeral.
- The web Program Preview is an edit simulation from semantic state decisions.
  With a local source-monitor proxy loaded, it crops that proxy into a rough
  visual layout for operator confidence. It is not final render truth.
- The local render engine remains final truth for synced full-resolution output.

The local engine should later sync source media, generate proxy packages, pull
decision branches, and render final outputs locally.

## Local Render Handoff

The first local render handoff CLI lives at:

```text
tools/studio-cut-local/studio_cut_local.py
```

It is a local-only Python standard-library tool. It does not require Firebase,
Firestore, Cloud Storage, or credentials. It reads local JSON files, local proxy
video, and timeline-aligned local media exports. It does not upload media,
mutate source files, or write private episode data to the repo.

Tonight's handoff path:

```text
Premiere sync -> export source-monitor proxy -> import manifest -> load proxy locally -> tag decisions -> export decision JSON -> run local render CLI
```

Tonight's rough full-output path:

```text
Premiere sync -> export aligned Homer/Charlie/Clip/program-audio media -> export source-monitor proxy -> Studio Cut tags decisions -> export decision JSON -> render-youtube-16x9-aligned
```

The Episode 4 operator runbook for that path lives at:

```text
docs/studio-cut-episode-4-runbook.md
```

The CLI supports:

- `doctor`: checks Python, `ffmpeg`, and current-directory read/write access.
- `create-episode-bootstrap`: writes a placeholder Episode Manifest, local media
  map, and README for a real episode so operators do not hand-write JSON.
- `validate-episode-files`: checks a real-episode manifest and local media map,
  confirms the episode id matches, verifies local file existence, and uses
  `ffprobe` to compare media durations against the manifest before rendering.
- `plan-render`: validates the manifest and decision JSON, derives semantic
  segments, removes `Cut` spans, adds profile-specific layout intent, prints a
  human-readable plan, and can write a render-plan JSON file.
- `render-proxy-preview`: uses the same active segment plan and `ffmpeg` to
  trim/concatenate the local source-monitor proxy into a rough review MP4 that
  skips `Cut` spans.
- `explain-profile`: prints the semantic state mapping for a render profile.
- `render-youtube-16x9-aligned`: uses timeline-aligned local media files that
  all begin at sequence time `00:00:00`, applies the `youtube_16x9` semantic
  layout plan, skips `Cut` spans, and writes a rough 16:9 MP4.
- `agent-smoke-test`: generates synthetic media and structured files, runs the
  planning/render path, and validates the output without private media or
  browser interaction.

Current `youtube_16x9` planning maps semantic states this way:

| State | 16:9 layout intent |
| --- | --- |
| `charlie` | Charlie full frame |
| `homer` | Homer full frame |
| `both` | Side-by-side hosts |
| `charlie_clip` | Charlie plus clip |
| `homer_clip` | Homer plus clip |
| `both_clip` | Both hosts plus clip |
| `cut` | Skipped |

The render plan stores each active segment's program state, source in/out,
duration, layout behavior, source choices, audio policy, and notes for the
future full-resolution renderer. `proxy_preview` still trims the whole
source-monitor proxy for active spans and does not crop individual panes.

The rough aligned renderer uses simple, robust 16:9 rectangles:

- `charlie`: Charlie full frame
- `homer`: Homer full frame
- `both`: Homer and Charlie side by side
- `charlie_clip`: Charlie and Clip side by side
- `homer_clip`: Homer and Clip side by side
- `both_clip`: Homer/Charlie stacked on the left, Clip large on the right
- `cut`: skipped

This renderer intentionally does not parse Premiere XML/EDL yet. Premiere owns
timeline alignment for now by exporting local media files that share sequence
start and duration.

Create Episode 4 bootstrap files:

```bash
python tools/studio-cut-local/studio_cut_local.py create-episode-bootstrap \
  --episode-id episode-004 \
  --title "Episode 004" \
  --duration-ms 600000 \
  --out-dir tools/studio-cut-local/output/episode-004-bootstrap
```

Use the real source duration in `--duration-ms` when it is known. The generated
directory contains:

- `episode-004-episode-manifest.json`
- `episode-004-local-media.json`
- `README.md` with the next local commands

The manifest includes placeholder-safe source names, a local source-monitor
proxy placeholder, Homer/Charlie/Clip pane rectangles, and
`syncBootstrap.source = premiere`. The local media map uses obvious placeholders:

```text
REPLACE_WITH_HOMER_ALIGNED_PATH
REPLACE_WITH_CHARLIE_ALIGNED_PATH
REPLACE_WITH_CLIP_ALIGNED_PATH
REPLACE_WITH_PROGRAM_AUDIO_PATH
```

Fill those paths locally after Premiere exports timeline-aligned media. Keep
generated real-episode bootstrap directories under `tools/studio-cut-local/output/`
or `/tmp`; `tools/studio-cut-local/output/` and local media map filename patterns
are ignored by git.

Validate the filled manifest and media map before rendering:

```bash
pnpm studio-cut:local:verify-episode -- \
  --manifest tools/studio-cut-local/output/episode-004-bootstrap/episode-004-episode-manifest.json \
  --media-map tools/studio-cut-local/output/episode-004-bootstrap/episode-004-local-media.json
```

Dry-run first:

```bash
python tools/studio-cut-local/studio_cut_local.py plan-render \
  --manifest path/to/episode-manifest.json \
  --decisions path/to/studio-cut-decisions.json \
  --profile youtube_16x9 \
  --out /tmp/studio-cut-render-plan.json
```

Explain profile behavior:

```bash
python tools/studio-cut-local/studio_cut_local.py explain-profile \
  --profile youtube_16x9
```

Proxy preview second:

```bash
python tools/studio-cut-local/studio_cut_local.py render-proxy-preview \
  --manifest path/to/episode-manifest.json \
  --decisions path/to/studio-cut-decisions.json \
  --proxy path/to/source-monitor-proxy.mp4 \
  --out /tmp/studio-cut-preview.mp4
```

Rough aligned 16:9 render:

```bash
python tools/studio-cut-local/studio_cut_local.py render-youtube-16x9-aligned \
  --manifest path/to/episode-manifest.json \
  --decisions path/to/studio-cut-decisions.json \
  --media-map path/to/episode-004-local-media.json \
  --out /tmp/studio-cut-youtube-16x9.mp4
```

Use `--dry-run` first to print the segment commands without writing output.
Use `--keep-temp` only when debugging generated segment files.

Local media map shape:

```json
{
  "schemaVersion": 1,
  "episodeId": "episode-004",
  "timelineAligned": true,
  "video": {
    "homer": "/absolute/or/local/path/episode-004_homer_aligned.mp4",
    "charlie": "/absolute/or/local/path/episode-004_charlie_aligned.mp4",
    "clip": "/absolute/or/local/path/episode-004_clip_aligned.mp4"
  },
  "audio": {
    "program": "/absolute/or/local/path/episode-004_program-audio_aligned.wav"
  }
}
```

`audio.program` is optional. If it is absent, the aligned renderer creates
silent audio and prints a warning. Relative paths are resolved from the media map
file's directory.

Do not commit generated render plans, preview renders, full-res media, proxy
media, real local media maps, private paths, or private episode manifests.

## Agent Workflow Canary

`agent-smoke-test` is the agent-friendly end-to-end workflow canary. It proves
that Studio Cut can be driven through structured files and commands:

```text
synthetic media -> manifest -> decisions -> plan-render -> render-youtube-16x9-aligned -> output validation
```

It uses only generated synthetic local media. No private podcast media, local
paths, Firebase data, browser clicking, or human-only steps are required.

Stable commands:

```bash
python tools/studio-cut-local/studio_cut_local.py agent-smoke-test
python tools/studio-cut-local/studio_cut_local.py agent-smoke-test --json
python tools/studio-cut-local/studio_cut_local.py agent-smoke-test \
  --keep-workdir \
  --workdir tools/studio-cut-local/output/agent-smoke
```

The synthetic decisions exercise `both`, `charlie`, `cut`, `homer`,
`charlie_clip`, and `both_clip`. The validation checks that the render plan
exists, the output MP4 exists, the output is shorter than the source because the
`Cut` span was skipped, and the rendered video is `1920x1080` when `ffprobe` is
available. It also runs `validate-episode-files` against the generated
synthetic manifest/media map so the real-episode readiness command stays covered
without private media.

The smoke test is also a structural canary for agentic workflow compatibility.
It verifies embedded golden expectations for the render plan:

- source duration is `12000` ms
- `Cut` duration is `2000` ms
- active duration is `10000` ms
- active segment states are `both`, `charlie`, `homer`, `charlie_clip`, and
  `both_clip`
- no active segment has state `cut`
- every active segment has profile planning and the expected `youtube_16x9`
  layout behavior

Future agents should run this before and after local renderer changes. Use
`--skip-render` only when `ffmpeg` is unavailable and the change is limited to
structured planning. The `--json` report includes `goldenAssertionsPassed`,
`goldenAssertionCount`, and `goldenAssertionFailures`.

The CLI smoke canary tests the local render spine. The browser cockpit smoke
test drives the Studio Cut web editor with Playwright in local dev mode:

```bash
pnpm studio-cut:web-smoke
```

It launches the Vite dev server without Firebase env vars, verifies the local
dev editor is visible, creates `Both` and `Cut` decisions, checks derived
segments, checks playback controls, and reloads to prove localStorage
persistence. If a local machine has the Playwright package but no browser
installed yet, run `pnpm exec playwright install chromium` once.

On failure, the web smoke writes artifacts to:

```text
tools/studio-cut-local/output/web-smoke-artifacts
```

Each failed run gets a timestamped folder with `screenshot.png`, `page.html`,
`browser-errors.json`, `dev-server.log`, `failure.txt`, and a Playwright
`trace.zip` when tracing reaches the browser context. Override the location with
`STUDIO_CUT_WEB_SMOKE_ARTIFACT_DIR=/path/to/artifacts` when needed. The default
artifact directory is under ignored local output and should not be committed.

For CI-friendly pre-deploy verification, use the one-command runner:

```bash
pnpm studio-cut:verify
```

It runs Python syntax compilation, `agent-smoke-test --json`, Studio Cut
typecheck, browser smoke, and Studio Cut build in order. It fails fast on the
first nonzero command and prints a short smoke-test summary including golden
assertion status, assertion count, output duration, and output resolution when
available.

GitHub Actions runs the same verifier from:

```text
.github/workflows/studio-cut-verify.yml
```

That workflow triggers on pushes and pull requests that touch Studio Cut web,
schema, local renderer, verifier, package lock/config, this doc, or the workflow
file. It installs dependencies, Python, `ffmpeg`, and Playwright Chromium, then
runs `pnpm studio-cut:verify`. It does not use secrets and does not deploy to
Firebase Hosting; deployment remains a separate local/operator step for now.

If the verifier fails in GitHub Actions, the workflow uploads the web smoke
artifact directory as:

```text
studio-cut-web-smoke-artifacts
```

Open the failed Actions run, download that artifact from the run summary, and
inspect `failure.txt`, `screenshot.png`, `page.html`, `browser-errors.json`,
`dev-server.log`, and `trace.zip` when present.

## Local Commands

Run from the repo root:

```bash
pnpm studio-cut
pnpm studio-cut:agent-smoke
pnpm studio-cut:verify
pnpm studio-cut:web-smoke
pnpm studio-cut:typecheck
pnpm studio-cut:build
pnpm studio-cut:local:doctor
pnpm studio-cut:local:verify-episode -- --manifest path/to/manifest.json --media-map path/to/local-media.json
```

The editor always persists decisions in browser storage under:

```text
high-ground-studio.studio-cut.decisions.v1
```

Use `apps/studio-cut-web/.env.example` as the local env template. In the Vite
dev server, if Firebase env vars are absent or blank, the app shows local dev
mode and continues to work with localStorage only. Production builds should use
Firebase config and an allowed email list; if those are missing, the editor is
hidden instead of becoming a public editor.

Current non-secret local context vars:

```text
VITE_STUDIO_CUT_PROJECT_ID
VITE_STUDIO_CUT_BRANCH_ID
VITE_STUDIO_CUT_CREATED_BY
VITE_STUDIO_CUT_ALLOWED_EMAILS
```

Required production Firebase web config vars:

```text
VITE_FIREBASE_API_KEY
VITE_FIREBASE_AUTH_DOMAIN
VITE_FIREBASE_PROJECT_ID
VITE_FIREBASE_APP_ID
```

Optional Firebase web config vars:

```text
VITE_FIREBASE_STORAGE_BUCKET
```

Firebase web config is not a service account and should not be confused with
server credentials. Do not commit service-account JSON, private keys, media,
proxy packages, or real recordings.

Current Firebase Web App:

```text
Display name: studio-cut-web
App ID: 1:659427658635:web:6a29892c9e4fba8dcebd8e
Project: high-ground-odyssey
```

Do not create another Firebase Web App for Studio Cut unless the existing app
has been intentionally deleted.

## Auth Gate

Studio Cut now has a first internal-only auth boundary:

- Vite dev with missing Firebase env vars: local dev mode, auth disabled, editor
  remains usable for prototype work.
- Production build with missing Firebase env vars: editor hidden with an auth
  configuration message.
- Firebase config present: Google sign-in is required.
- Signed-in email must appear in `VITE_STUDIO_CUT_ALLOWED_EMAILS`.
- Non-allowed users see a clear not-authorized message and do not see the
  editor.

`VITE_STUDIO_CUT_ALLOWED_EMAILS` is comma-separated:

```text
VITE_STUDIO_CUT_ALLOWED_EMAILS="person@example.com,another@example.com"
```

This app-level gate is not a substitute for Firestore security rules. Do not
put private podcast data, proxy package references, or real collaboration data
into Firestore until rules are scoped to approved internal users and explicit
project/branch permissions.

Firebase Auth provider setup is still an operator step in the Firebase Console:

1. Open Firebase Console for `high-ground-odyssey`.
2. Go to Authentication -> Sign-in method.
3. Enable Google as a provider.
4. Confirm the authorized domain includes `high-ground-odyssey.web.app`.

Without the Google provider enabled, the deployed app can render the auth gate
but Google sign-in will fail.

## Persistence Boundary

The web app now separates persistence from `App.tsx`:

- local browser store: `localStorage`
- cloud-ready store: Firestore adapter behind Firebase env vars
- runtime schema checks: `packages/studio-cut-schema`

When Firestore is configured, the adapter reads and upserts event documents by
event id. It does not destructively overwrite a whole branch and it does not
delete cloud events from the first shell.

Firestore decision path:

```text
studioCutProjects/{projectId}/branches/{branchId}/decisionEvents/{eventId}
```

The document body uses the shared `DecisionEvent` shape:

```text
id
projectId
branchId
sourceTimeMs
state
createdBy
createdAt
note
```

Local removal and `Clear Local` only change the current browser working set.
They are not cloud delete operations.

## JSON Handoff

The editor supports `Export JSON` and `Import JSON` for decision handoff before
live collaboration exists.

Export shape:

```json
{
  "schemaVersion": 1,
  "exportedAt": "2026-05-21T00:00:00.000Z",
  "projectId": "studio-cut-local-project",
  "branchId": "local-main",
  "decisionEvents": []
}
```

Import accepts either that object shape or a raw `DecisionEvent[]`. Events are
validated against the shared schema. Valid imported events are normalized onto
the active project and branch so the current Firestore path stays coherent.

## Cloud Shape

Desired deployment shape:

- Firebase Hosting for the static Studio Cut web editor
- Firestore for decision events now, and later for branches, comments, and
  project metadata
- Cloud Storage later for lightweight proxy packages only
- Cloud Run later for Python APIs and local-engine coordination services

Checked-in scaffold:

- `firebase.json` serves `apps/studio-cut-web/dist` as a single-page app
- `.firebaserc` binds the default Firebase project alias to
  `high-ground-odyssey`

Live Firebase Hosting URL:

```text
https://high-ground-odyssey.web.app
```

Deploy command that worked:

```bash
pnpm studio-cut:build
firebase deploy --project high-ground-odyssey --only hosting
```

Production env workflow:

1. Confirm the Firebase Web App exists:

```bash
firebase apps:list --project high-ground-odyssey
```

Expected existing Web App:

```text
studio-cut-web
1:659427658635:web:6a29892c9e4fba8dcebd8e
```

2. Only if the app is missing and the CLI confirms the project is
   `high-ground-odyssey`, create it:

```bash
firebase apps:create WEB studio-cut-web --project high-ground-odyssey
```

3. Fetch the SDK config for the existing app:

```bash
firebase apps:sdkconfig WEB 1:659427658635:web:6a29892c9e4fba8dcebd8e --project high-ground-odyssey
```

4. Create `apps/studio-cut-web/.env.production.local` from that output:

```bash
VITE_STUDIO_CUT_PROJECT_ID=studio-cut-local-project
VITE_STUDIO_CUT_BRANCH_ID=local-main
VITE_STUDIO_CUT_CREATED_BY=local-web-editor
VITE_STUDIO_CUT_ALLOWED_EMAILS=charlie@highgroundodyssey.com
VITE_FIREBASE_API_KEY=...
VITE_FIREBASE_AUTH_DOMAIN=high-ground-odyssey.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=high-ground-odyssey
VITE_FIREBASE_APP_ID=1:659427658635:web:6a29892c9e4fba8dcebd8e
VITE_FIREBASE_STORAGE_BUCKET=high-ground-odyssey.firebasestorage.app
```

`apps/studio-cut-web/.env.production.local` is ignored by git. Do not commit
real Firebase config values, service-account files, private keys, media,
proxies, or private podcast data.

5. Build and deploy:

```bash
pnpm studio-cut:build
firebase deploy --project high-ground-odyssey --only hosting
```

Current safety state:

- The deployed shell has an app-level Google sign-in/allowed-email gate when
  Firebase config is supplied at build time.
- If production Firebase env vars are missing, the editor is hidden instead of
  falling back to public local mode.
- Do not enter real media paths, private podcast details, proxy package
  references, credentials, personal recordings, or production collaboration data
  until Firestore rules are in place.

Near-term internal-only task:

- Add Firestore security rules scoped to approved internal users and explicit
  project/branch permissions.
- Only then use live Firestore for real collaboration or private podcast data.

Manual Firebase Hosting path after future build-verified changes:

```bash
pnpm studio-cut:build
firebase deploy --project high-ground-odyssey --only hosting
```

Rollback command for the latest Studio Cut deployment slice:

```bash
git revert HEAD
pnpm studio-cut:build
firebase deploy --project high-ground-odyssey --only hosting
```

Do not create paid resources, enable new Firebase products, or bind unexpected
projects without clear operator confirmation.

If the operator wants a dedicated non-default Hosting site, create the site and
target mapping first, then update `firebase.json` to use that target:

```bash
firebase hosting:sites:create SITE_ID --project PROJECT_ID
firebase target:apply hosting studio-cut SITE_ID --project PROJECT_ID
```

Then change the hosting config to include:

```json
{
  "target": "studio-cut"
}
```
