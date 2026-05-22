# Studio Cut

Date: 2026-05-22

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
- shared episode rooms: Firestore room metadata, realtime decision events,
  presence, and Firebase Storage source-monitor proxy packages

## Media Boundary

Full-resolution source media stays local:

- Charlie Canon R8 video
- Homer Insta360 exported 4K video with reframing padding
- Homer DJI Mic 3 clean audio
- Charlie Shure MV7i clean audio
- iPhone call recording as backup audio and sync reference

Do not commit secrets, credentials, full media, proxy media, personal
recordings, generated render outputs, local env files, or generated caches.

The web/cloud layer may store only lightweight project metadata,
source-monitor proxy packages, semantic decision events, branches, comments, and
collaboration state. It must not store local filesystem paths, object URLs, or
full-resolution media.

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
| `Cmd/Ctrl+Z` | Undo last local decision edit |
| `Cmd/Ctrl+Shift+Z` | Redo last undone local decision edit |
| `Cmd/Ctrl+Y` | Redo last undone local decision edit |
| `Backspace` / `Delete` | Remove the active decision, or latest decision if no active event applies |

Shortcuts are ignored while typing in inputs or notes. The Current Segment panel
shows the state that applies at the current source time, its in/out range, and
whether Program Playback will include or skip that span. Decision export uses
the manifest id when present, for example `episode-004-decisions.json`.

Decision edits are reversible in the browser. Undo/redo covers adding,
removing, clearing, and importing decisions. The undo stack is bounded and
stored in localStorage with the current browser working set so a refresh does
not immediately erase local edit history. This is still a local safety layer,
not collaborative branching or a Firestore rollback system.

`Export Checkpoint` writes the same decision-layer JSON payload as normal export
with a timestamped filename such as
`episode-004-checkpoint-2026-05-21-1730.json`. Checkpoints contain semantic
decision events only; they do not include media, proxy files, object URLs, or
source paths.

`Save Local Checkpoint` stores the current decision list in this browser's
localStorage so a messy pass can be restored without finding a downloaded file.
The local checkpoint library is capped to the newest 12 snapshots. Each
checkpoint can be restored into the current working set, exported as the same
decision JSON shape, or deleted. Restoring a local checkpoint is itself
undoable. This is still browser-local safety, not cloud branch history.

The Episode Readiness panel gives a fast operator check before handoff:

- manifest loaded
- local proxy loaded
- decision count
- `Cut` count
- current export filename preview

It warns when there are no decisions, when the first decision starts after
`0:00`, and when a Clip state is used but the imported manifest has no Clip
pane. These are confidence checks only; they do not change source media or
decision semantics.

The Decision Timeline is a source-duration-aware strip built from derived
segments. Colored blocks show the active semantic state, `Cut` blocks are
visually distinct, the current segment is highlighted, and clicking a block
jumps to that segment's source in-point. The strip is still source-time based;
it does not create destructive cuts or a separate program timeline.

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

Studio Cut can play a local source-monitor proxy video in the browser. Use
`Load Local Proxy Video` in the Episode Manifest panel and choose a local
`.mp4`, `.mov`, or `.m4v` file from the operator's machine.

Local/backup mode boundaries:

- the selected file is read only by the current browser tab
- the app uses an in-memory `URL.createObjectURL()` URL
- the file and object URL are not saved to localStorage
- the file and object URL are not written to Firestore decision events
- the object URL is revoked when the video is replaced, cleared, or the app
  unloads

Creating a shared room is a separate explicit action. In cloud mode,
`Create Shared Room` uploads only the lightweight source-monitor proxy to
Firebase Storage and writes room metadata to Firestore. It does not upload
full-resolution Canon/Insta360/DJI/Shure media, local filesystem paths, object
URLs, or generated renders.

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

When loaded locally, the proxy file stays local to the browser tab. In shared
rooms, approved editors load the lightweight proxy from Firebase Storage; the
object URL is still not persisted to localStorage or Firestore.

If the source-monitor proxy export does not match the manifest pane rectangles,
use `Proxy Pane Calibration` in the editor:

- edit Homer, Charlie, and optional Clip `x`, `y`, `width`, and `height`
  normalized values
- values are clamped to the `0` to `1` proxy coordinate space
- changes apply immediately to the browser Program Preview
- the imported manifest file is not mutated
- adjusted pane rectangles are stored in this browser's localStorage
- `Reset Panes` restores the last imported manifest rectangles
- `Export Adjusted Manifest` downloads a decision-safe manifest file such as
  `episode-004-adjusted-manifest.json`

Adjusted manifests contain metadata only. They must not include real private
paths, media, credentials, or proxy files.

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

Current primary shared-room workflow:

```text
Premiere sync -> proxy export -> create shared room -> Mako opens room link -> live semantic tagging -> local render
```

JSON export/import remains available as backup and recovery, not the primary
collaboration path.

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

The concise morning operator handoff lives at:

```text
docs/studio-cut-morning-handoff.md
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

After decisions are exported, rerun validation with decision readiness:

```bash
pnpm studio-cut:local:verify-episode -- \
  --manifest tools/studio-cut-local/output/episode-004-bootstrap/episode-004-episode-manifest.json \
  --media-map tools/studio-cut-local/output/episode-004-bootstrap/episode-004-local-media.json \
  --decisions tools/studio-cut-local/output/episode-004-bootstrap/episode-004-decisions.json
```

With `--decisions`, the report adds decision count, `Cut` count, active
duration, expected output duration, first-decision-at-zero status, Clip-state
warnings, and the exact rough `render-youtube-16x9-aligned` command when ready.

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

It runs Python syntax compilation, auth/collaboration/shared-room helper tests,
`agent-smoke-test --json`, Studio Cut typecheck, browser smoke, and Studio Cut
build in order. It fails fast on the first nonzero command and prints a short
smoke-test summary including golden assertion status, assertion count, output
duration, and output resolution when available.

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
pnpm studio-cut:rules-config-test
pnpm studio-cut:rules-test
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
Firebase config and allowed email or domain rules; if those are missing, the
editor is hidden instead of becoming a public editor.

Current non-secret local context vars:

```text
VITE_STUDIO_CUT_PROJECT_ID
VITE_STUDIO_CUT_BRANCH_ID
VITE_STUDIO_CUT_CREATED_BY
VITE_STUDIO_CUT_ALLOWED_EMAILS
VITE_STUDIO_CUT_ALLOWED_EMAIL_DOMAINS
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
- Signed-in email must either appear in `VITE_STUDIO_CUT_ALLOWED_EMAILS` or use
  a domain listed in `VITE_STUDIO_CUT_ALLOWED_EMAIL_DOMAINS`.
- Non-allowed users see a clear not-authorized message and do not see the
  editor.

`VITE_STUDIO_CUT_ALLOWED_EMAILS` is comma-separated:

```text
VITE_STUDIO_CUT_ALLOWED_EMAILS="person@example.com,another@example.com"
```

`VITE_STUDIO_CUT_ALLOWED_EMAIL_DOMAINS` is also comma-separated. Domains are
normalized to lowercase and may include or omit the leading `@`:

```text
VITE_STUDIO_CUT_ALLOWED_EMAIL_DOMAINS="highgroundodyssey.com"
```

Access passes if either the exact email or domain rule matches. Keep exact
email entries for outside-domain collaborators or temporary overrides.

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

When Firestore is configured, the adapter subscribes to shared event documents
by event id. It does not destructively overwrite a whole branch and cloud
removes use tombstone updates instead of hard deletes.

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
clientId
operation
note
removedAt
removedBy
```

In local-only mode, remove and clear still affect only the current browser
working set. In cloud mode, remove and clear mark active shared events with
`removedAt`, `removedBy`, and `operation=remove`. Tombstoned decisions are
ignored by derived segments and Program Playback, but remain explainable shared
history.

## Realtime Collaboration

Studio Cut now has an experimental simultaneous editing room model. The
Collaboration Mode panel shows:

- Local-only or Cloud-connected state
- selected `projectId`
- selected `branchId`
- signed-in user / configured local editor
- short session id
- collaborator presence when Firestore is connected

The editor defaults to the build-time project and branch ids, but the panel can
switch the browser to another project/branch room. The selected room is stored
in localStorage. In cloud mode, switching rooms subscribes to:

```text
studioCutProjects/{projectId}/branches/{branchId}/decisionEvents
studioCutProjects/{projectId}/branches/{branchId}/presence
```

Decision events stream from Firestore in near real time and merge by id into
the browser working set. Duplicate event ids are deduped. Adding a decision or
importing decision JSON upserts event documents. Removing a decision updates a
tombstone instead of deleting the document.

Undo/redo remains a browser-local safety layer and should not be treated as
global collaborative undo. Exported checkpoints and local checkpoints remain
the recovery path for messy passes.

Presence documents are best-effort:

```text
studioCutProjects/{projectId}/branches/{branchId}/presence/{sessionId}
```

They include session id, user email/configured editor, current source time,
optional current state, and `updatedAt`. Stale presence is marked visually. The
first collaboration version does not rely on perfect disconnect cleanup.

Shared room metadata lives at:

```text
studioCutProjects/{projectId}/branches/{branchId}/room/meta
```

That document stores the room title, Episode Manifest, source-monitor proxy
Storage path, proxy file name/content type/size, creator, timestamps, and
optional notes. It must not store local filesystem paths, object URLs,
full-resolution media, credentials, recordings, or generated renders.

Source-monitor proxy packages are stored at:

```text
studioCutProjects/{projectId}/branches/{branchId}/source-monitor-proxy/{fileName}
```

The uploaded file is the lightweight composite proxy only. It is not the Canon
R8, Insta360, DJI, Shure, or aligned full-resolution render source.

## Raw Asset Cloud Sync Intake

The next primary direction starts before a prepared manifest/proxy exists:

```text
Charlie uploads disparate assets -> cloud sync worker prepares manifest/proxy/shared room -> Mako opens room link
```

The web editor now includes a `Cloud Sync Intake` panel. In cloud mode, Charlie
can select required raw assets:

- Homer video
- Charlie video
- Homer clean audio
- Charlie clean audio
- phone/reference audio

Clip/screen video is optional. The upload is explicit; the app does not
auto-upload selected files. Local dev mode keeps this disabled because Firebase
config is absent.

Episode 4 needs Rescue Sync because the phone/reference recording can arrive in
multiple pieces. The intake model now supports multiple `phoneReferenceAudio`
inputs. Each piece gets an `inputId`, optional `durationMs`, and an
`orderIndex`. Worker v0 sorts those pieces into a reference rail and can inspect
explicitly mapped local files to prefer real durations. In local-media mode, it
also assembles `workdir/audio/reference-rail.wav` and estimates non-reference
track offsets with anchor-based waveform correlation.

The sync architecture is proxy-first:

```text
original asset -> extracted audio/proxy -> waveform sync -> Sync Map -> synced proxy room -> semantic edit tags -> original render
```

The Sync Map is the durable bridge between browser editing and original render.
It maps canonical episode timeline time to each original asset's local time. It
stores ids, path-safe Storage paths, `timelineStartMs`, `assetStartMs`,
duration, estimated offsets, confidence, drift guidance, the reference rail, and
warnings. It must not store local filesystem paths, browser object URLs, or
private machine paths.

Proxies and extracted audio are disposable/derivable. Sync Maps and semantic
decision events are durable. Existing Studio Cut UI and JSON still use
`sourceTimeMs` in some places; architecturally that should now be read as
canonical episode timeline time until the naming is migrated.

Raw intake job metadata lives at:

```text
studioCutSyncJobs/{syncJobId}
```

Raw uploads are stored at:

```text
studioCutSyncJobs/{syncJobId}/uploads/{role}/{fileName}
```

Expected worker outputs are:

```text
studioCutSyncJobs/{syncJobId}/outputs/source-monitor-proxy.mp4
studioCutSyncJobs/{syncJobId}/outputs/episode-manifest.json
studioCutSyncJobs/{syncJobId}/outputs/sync-report.json
studioCutSyncJobs/{syncJobId}/outputs/sync-map.json
```

The current app can create/upload a sync job and mark it queued. The local
worker can inspect files, extract mono 48 kHz WAV audio, and emit a duration
based reference rail report plus `estimatedOffsetMs` values without cloud
credentials. It can also generate a local browser editing package from the Sync
Map:

```bash
python tools/studio-cut-cloud-sync/cloud_sync_worker.py \
  --sync-job-json /path/to/sync-job.json \
  --local-media-map /path/to/local-media-map.json \
  --workdir /tmp/studio-cut-cloud-sync-work \
  --out /tmp/studio-cut-cloud-sync-report.json \
  --out-sync-map /tmp/studio-cut-sync-map.json \
  --out-proxy-dir /tmp/studio-cut-proxies \
  --out-source-monitor-proxy /tmp/studio-cut-source-monitor-proxy.mp4 \
  --out-manifest /tmp/studio-cut-episode-manifest.json
```

Generated proxy package behavior:

- aligned low-res proxy clips for video roles
- black padding before/after clips so they span canonical episode time
- a 2x2 source-monitor proxy: Homer top-left, Charlie top-right, Clip
  bottom-left, Program placeholder bottom-right
- a draft Episode Manifest whose pane rectangles match that layout
- no local original media paths in the Sync Map or Manifest

Run the synthetic local worker canary:

```bash
pnpm studio-cut:cloud-sync-smoke
```

The actual Cloud Run sync worker remains scaffold only. FFT/refined drift
analysis, production-grade labels/proxy quality, and room metadata writes are
not implemented yet. Sync Map, proxy package, and manifest generation are
local-worker outputs now. The worker contract is documented at:

```text
docs/studio-cut-cloud-sync.md
tools/studio-cut-cloud-sync/README.md
docs/studio-cut-rescue-sync.md
```

This path is the new product direction, but it is not safe for sensitive/private
footage until Firestore/Storage rules have passed emulator tests, rules have
been intentionally deployed, and lifecycle cleanup is defined.

## Primary Shared-Room Workflow

The current prepared-package collaboration path is no longer JSON handoff:

1. Charlie exports the source-monitor proxy from Premiere.
2. Charlie opens Studio Cut, imports or loads the Episode Manifest, and loads
   the local source-monitor proxy.
3. Charlie confirms the `projectId` and `branchId`, then uses
   `Create Shared Room`.
4. Studio Cut uploads the lightweight proxy to Firebase Storage and writes the
   manifest/room metadata to Firestore.
5. Charlie copies the room link, for example:

```text
https://high-ground-odyssey.web.app/?projectId=episode-004&branchId=main
```

6. Mako opens the link, signs in with an approved High Ground Odyssey Google
   account, and the browser loads the manifest, shared proxy, realtime
   decisions, and presence for that room.
7. Charlie and Mako tag semantic decisions live in the same room.
8. Charlie later renders locally from Studio Cut decisions and local
   timeline-aligned media.

Mako does not need to import JSON, export JSON, or select local media in the
primary flow. JSON import/export and local proxy loading remain backup and
recovery paths.

The Shared Room Diagnostics panel gives operators a compact room health check:

- room metadata loaded yes/no
- shared proxy loaded yes/no
- decision listener status
- presence listener status
- Storage upload/load status and errors

Firestore rules are documented as a draft at:

```text
docs/studio-cut-firestore-rules.md
```

Do not put private collaboration data into Firestore or Storage until rules
tests pass and the rules are intentionally deployed.

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

`Export Checkpoint` uses this same payload shape with a checkpoint filename.
Use it before risky tagging passes or before clearing/importing a different
decision set. Checkpoint files are lightweight decision snapshots only.

## Cloud Shape

Desired deployment shape:

- Firebase Hosting for the static Studio Cut web editor
- Firestore for decision events, room metadata, presence, and later branches
  and comments, plus `studioCutSyncJobs/{syncJobId}` intake jobs
- Cloud Storage for lightweight source-monitor proxy packages, raw intake
  uploads, and worker-generated manifest/proxy/report outputs
- Cloud Run later for Python APIs and local-engine coordination services

Checked-in scaffold:

- `firebase.json` serves `apps/studio-cut-web/dist` as a single-page app
- `.firebaserc` binds the default Firebase project alias to
  `high-ground-odyssey`
- `firebase.json` references `firestore.rules` and `storage.rules` for emulator
  tests and explicit rules deploys

Live Firebase Hosting URL:

```text
https://high-ground-odyssey.web.app
```

Deploy command that worked:

```bash
pnpm studio-cut:build
firebase deploy --project high-ground-odyssey --only hosting
```

Rules deploy is deliberately separate from Hosting:

```bash
pnpm studio-cut:rules-test
firebase deploy --project high-ground-odyssey --only firestore:rules,storage
```

The emulator-backed rules test requires Java. If Java is unavailable locally,
do not deploy rules; install Java and rerun the test first.

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
VITE_STUDIO_CUT_ALLOWED_EMAIL_DOMAINS=highgroundodyssey.com
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
- Do not enter real local media paths, credentials, personal recordings, or
  full-resolution media. Do not trust private collaboration data in
  Firestore/Storage until `pnpm studio-cut:rules-test` passes and rules are
  deployed. Shared rooms should contain only the lightweight source-monitor
  proxy and manifest metadata.

Near-term internal-only task:

- Run the emulator rules tests on a machine with Java.
- Deploy Firestore and Storage rules with the explicit rules deploy command.
- Only then trust live Firestore/Storage for real collaboration or private
  podcast data.

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
