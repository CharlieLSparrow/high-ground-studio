# Studio Cut Morning Handoff

Date: 2026-05-22

This is the morning operator brief for the current Studio Cut Episode 4 path.
It contains no private paths, media, credentials, or real episode data.

Related durable docs:

- `docs/studio-cut-product-mission.md`
- `docs/studio-cut-agent-coordination.md`

## What Works Now

- Deployed Studio Cut web editor: <https://high-ground-odyssey.web.app>
- Firebase Auth gate with exact-email and `@highgroundodyssey.com` domain
  allow rules.
- Experimental Firestore collaboration rooms with realtime decision events,
  tombstoned cloud removes, and presence.
- Primary shared-room workflow: Charlie can upload the Episode Manifest plus one
  lightweight source-monitor proxy package, then share a room link with Mako.
- Rescue Sync intake foundation: Charlie can model/upload raw Homer, Charlie,
  clean audio, multi-piece phone/reference audio, optional clip, and optional
  other files into `studioCutSyncJobs/{syncJobId}`. Worker v0 can inspect local
  media, extract normalized audio, and build a duration-based reference rail,
  but it is not deployed as a cloud worker.
- Shared Room Diagnostics shows metadata/proxy/listener/Storage status for the
  active room.
- Firestore and Storage rules are wired into `firebase.json`; emulator-backed
  rules tests are part of `pnpm studio-cut:verify`. Rules deploy remains a
  separate explicit command from Hosting.
- Firestore rules are deployed live. Storage rules are tested but blocked until
  Firebase Storage is initialized in the Firebase console for
  `high-ground-odyssey`.
- Episode Manifest import with Premiere bootstrap metadata.
- Browser-local source-monitor proxy playback for backup/local mode, plus
  Firebase Storage proxy loading for shared rooms.
- Proxy Program Preview layouts from manifest pane rectangles.
- Proxy Pane Calibration with adjusted manifest export.
- Keyboard tagging shortcuts, current segment summary, source scrub, and
  cut-skipping Program Playback.
- Undo/redo for local decision edits and timestamped checkpoint exports.
- Browser-local checkpoint library with restore, export, and delete actions.
- Episode Readiness and Decision Timeline panels for handoff confidence.
- Decision JSON import/export with manifest-aware filenames.
- Collaboration Mode can switch project/branch rooms; selected room is stored
  locally in the browser.
- Local render CLI with bootstrap creation, file validation, render planning,
  proxy preview rendering, rough aligned `youtube_16x9` rendering, and synthetic
  agent smoke verification.
- Local cloud sync Worker v0 that validates a sync job, optionally maps inputs
  to local files, inspects media with `ffprobe`, extracts mono 48 kHz WAV files
  with `ffmpeg`, assembles `reference-rail.wav`, and estimates offsets with
  anchor-based waveform correlation v0.
- One-command verifier: `pnpm studio-cut:verify`, including Firebase emulator
  rules tests.
- Agentic decision editing commands:
  `agent-review-edit` for machine-readable edit diagnostics and
  `apply-decision-ops` for transparent add/tombstone operations that write a new
  decision file without mutating the input export. `agent-review-edit` now
  accepts optional timed transcript JSON so agents can flag speaker/state
  mismatches, clip-reference moments, transcript gaps, and filler clusters.
- The web cockpit can import agent operation JSON with `Import Agent Ops`,
  preview add/tombstone changes, and apply accepted operations into the current
  local or shared room.
- `Export Agent Context` writes a media-safe room snapshot for Codex: manifest,
  current source time, proxy status, persistence/shared-room status, decisions,
  derived segments, warnings, transcript review when loaded, and the operation
  contract. It omits media bytes, local paths, and browser object URLs.
- The web cockpit can import timed transcript JSON in the Episode Manifest
  area. The browser-side `Transcript Review` panel surfaces coverage, likely
  clip references, filler clusters, transcript gaps, and speaker/state mismatch
  tasks so an agent can inspect them through `Export Agent Context`. It can
  also export suggested agent operation JSON drafts that must still be previewed
  through `Import Agent Ops` before applying.
- `Sync Review` now expands Rescue Sync metadata into ordered reference pieces,
  per-track offsets, anchor/agreement details, confidence, and warnings, so a
  generated package can be checked before publishing or tagging.
- GitHub Actions verification workflow. CI verifies only and does not deploy.

## Branch And Verification

From repo root:

```bash
git branch --show-current
git status --short --branch --untracked-files=all
pnpm studio-cut:verify
```

Expected branch:

```text
codex/studio-cut-001-web-shell
```

Deploy is operator-local for now:

```bash
firebase deploy --project high-ground-odyssey --only hosting
```

Rules deploy is separate from Hosting and should happen after the full verifier
passes:

```bash
pnpm studio-cut:verify
firebase deploy --project high-ground-odyssey --only firestore:rules,storage
```

## Episode 4 Commands

Rescue Sync direction:

For real local work, start with the one-folder workspace. This keeps large media
outside the repo and gives agents a predictable place to help:

```bash
python tools/studio-cut-local/studio_cut_local.py rescue-sync-session \
  --episode-id episode-004 \
  --title "Episode 004" \
  --episode-dir ~/Movies/StudioCut/episode-004
```

Put assets in `~/Movies/StudioCut/episode-004/inbox/` as
`homer-video.mov`, `charlie-video.mov`, `homer-audio.wav`,
`charlie-audio.wav`, `phone-reference-01.m4a`, `phone-reference-02.m4a`, and
optional `clip-video.mp4`. Rerun the same command. When required files are
present, it runs the local worker and writes generated package files under
`generated/`.

Status/readiness check:

```bash
python tools/studio-cut-local/studio_cut_local.py rescue-sync-status \
  --episode-dir ~/Movies/StudioCut/episode-004
```

This is the preferred handoff command for agents. It reports missing inbox
files, generated package files, Sync Map/report summary, proxy inspection,
decision/render readiness, and the exact next action.

Cloud raw uploads remain future-facing until rules/security and retention are
ready:

1. Open Studio Cut and confirm the `episode-004 / main` room.
2. In `Cloud Sync Intake`, select Homer video, Charlie video, Homer clean audio,
   Charlie clean audio, and every phone/reference piece.
3. Set phone/reference `orderIndex` values in the intended rail order.
4. Click `Create Sync Job / Upload Raw Assets`.
5. When a future deployed worker marks the job `ready`, click `Publish Worker
   Outputs` to create the shared room from the generated Storage outputs. The
   worker is still local-first for real use today, so publish the generated
   package from local files after reviewing it.

Local worker metadata-only run:

```bash
python tools/studio-cut-cloud-sync/cloud_sync_worker.py \
  --sync-job-json tools/studio-cut-cloud-sync/examples/sync-job.placeholder.json \
  --out /tmp/studio-cut-rescue-sync-report.placeholder.json
```

Synthetic Worker v0 canary:

```bash
pnpm studio-cut:cloud-sync-smoke
```

The canary asserts short and long synthetic rooms, ordered phone/reference rail
pieces, known +1000ms/+2000ms and +7000ms/+15000ms offsets, and multiple anchor
estimates for long tracks.

Local-media Worker v0 shape:

```bash
python tools/studio-cut-cloud-sync/cloud_sync_worker.py \
  --sync-job-json /path/to/sync-job.json \
  --local-media-map /path/to/local-media-map.json \
  --workdir /tmp/studio-cut-rescue-sync-work \
  --out /tmp/studio-cut-rescue-sync-report.json \
  --out-sync-map /tmp/studio-cut-sync-map.json \
  --out-proxy-dir /tmp/studio-cut-proxies \
  --out-source-monitor-proxy /tmp/studio-cut-source-monitor-proxy.mp4 \
  --out-manifest /tmp/studio-cut-episode-manifest.json
```

The `--out-sync-map` file is the durable bridge for the next render pipeline:
canonical episode timeline time to original asset-local time. It should include
Storage-path metadata and sync confidence, but no local filesystem paths. The
web editor still labels some values as `sourceTimeMs`; treat those as canonical
episode timeline time for Studio Cut architecture.

The proxy package flags now generate aligned low-res proxies, a 2x2
source-monitor proxy, and a draft manifest for browser editing. These are
derived artifacts. The worker still does not write shared-room metadata itself,
but the Studio Cut web app now has `Publish Rescue Sync Package` to publish the
generated proxy, manifest, Sync Map, and optional sync report into a shared
room.

If those generated artifacts came from a future cloud worker instead of the
local session folder, use `Cloud Sync Intake` -> `Publish Worker Outputs`. That
button reads the generated manifest, Sync Map, and sync report from the job
output Storage paths and writes shared room metadata pointing at the generated
source-monitor proxy. Charlie should still review `Sync Review` before sending
the room link.

To publish the generated package:

1. Open `https://high-ground-odyssey.web.app` and sign in.
2. Switch Collaboration Mode to the generated manifest `projectId` and target
   branch.
3. Use `Publish Rescue Sync Package`.
4. Select the generated manifest JSON, source-monitor proxy MP4, Sync Map JSON,
   and optional sync report JSON.
5. Confirm the package preflight marks the required checks ready: generated
   files, Manifest/Sync Map compatibility, room target, and proxy upload.
6. Click `Publish Generated Package`.
7. Send the room link to Mako.

Mako opens the room link and edits live. Mako does not import JSON, load local
media, or touch sync files in the primary path.

After publish, check `Sync Review` in the editor. It should show the attached
Sync Map job id, canonical duration, asset roles, reference pieces, offset
count, lowest confidence, and warning count. If it says the Sync Map is missing
or failed to load, treat the room as a proxy-only rehearsal until the package is
republished or Storage rules are fixed.

Before publishing real generated files, run:

```bash
python tools/studio-cut-local/studio_cut_local.py validate-generated-package \
  --manifest ~/Movies/StudioCut/episode-004/generated/episode-manifest.json \
  --proxy ~/Movies/StudioCut/episode-004/generated/source-monitor-proxy.mp4 \
  --sync-map ~/Movies/StudioCut/episode-004/generated/sync-map.json \
  --sync-report ~/Movies/StudioCut/episode-004/generated/sync-report.json
```

Use the printed publish checklist rather than manually hunting for files.

Safe live-app publish rehearsal:

```bash
pnpm studio-cut:rescue-sync-package
```

This creates a synthetic-only package at
`tools/studio-cut-local/output/rescue-sync-publish-package/` with a README. Use
that package in the deployed app before putting real Episode 4 artifacts through
the same flow.

For a cleaner demo folder, run:

```bash
pnpm studio-cut:demo-package
```

The demo package includes synthetic manifest/proxy/Sync Map/report plus optional
decision and transcript seed JSON. Publish the package, then import the seed
decisions/transcript to show the full room-edit-agent-review loop without real
media.

Create bootstrap files after calculating the real duration in milliseconds:

```bash
python tools/studio-cut-local/studio_cut_local.py create-episode-bootstrap \
  --episode-id episode-004 \
  --title "Episode 004" \
  --duration-ms REPLACE_WITH_DURATION_MS \
  --out-dir tools/studio-cut-local/output/episode-004-bootstrap
```

Validate manifest and local media map after filling paths:

```bash
pnpm studio-cut:local:verify-episode -- \
  --manifest tools/studio-cut-local/output/episode-004-bootstrap/episode-004-episode-manifest.json \
  --media-map tools/studio-cut-local/output/episode-004-bootstrap/episode-004-local-media.json
```

Open Studio Cut:

```text
https://high-ground-odyssey.web.app
```

In the browser:

1. Sign in with an allowed Google account.
2. Import the Episode Manifest.
3. Load the local source-monitor proxy.
4. Confirm the `episode-004 / main` room in Collaboration Mode.
5. Click `Create Shared Room`.
6. Copy the link, for example
   `https://high-ground-odyssey.web.app/?projectId=episode-004&branchId=main`.
7. Mako opens that link, signs in with an approved High Ground Odyssey Google
   account, and edits without importing JSON or loading local media.
8. Calibrate panes if crops are off, then export an adjusted manifest.
9. Tag decisions live.
10. Export checkpoints during risky passes.
11. Export final decisions to the bootstrap directory before rendering.

Validate render readiness after exporting decisions:

```bash
pnpm studio-cut:local:verify-episode -- \
  --manifest tools/studio-cut-local/output/episode-004-bootstrap/episode-004-episode-manifest.json \
  --media-map tools/studio-cut-local/output/episode-004-bootstrap/episode-004-local-media.json \
  --decisions tools/studio-cut-local/output/episode-004-bootstrap/episode-004-decisions.json
```

Dry-run rough render:

```bash
python tools/studio-cut-local/studio_cut_local.py render-youtube-16x9-aligned \
  --manifest tools/studio-cut-local/output/episode-004-bootstrap/episode-004-episode-manifest.json \
  --decisions tools/studio-cut-local/output/episode-004-bootstrap/episode-004-decisions.json \
  --media-map tools/studio-cut-local/output/episode-004-bootstrap/episode-004-local-media.json \
  --out tools/studio-cut-local/output/episode-004-bootstrap/episode-004-youtube-16x9.mp4 \
  --dry-run
```

Real rough render:

```bash
python tools/studio-cut-local/studio_cut_local.py render-youtube-16x9-aligned \
  --manifest tools/studio-cut-local/output/episode-004-bootstrap/episode-004-episode-manifest.json \
  --decisions tools/studio-cut-local/output/episode-004-bootstrap/episode-004-decisions.json \
  --media-map tools/studio-cut-local/output/episode-004-bootstrap/episode-004-local-media.json \
  --out tools/studio-cut-local/output/episode-004-bootstrap/episode-004-youtube-16x9.mp4
```

Sync Map rough render after Rescue Sync:

```bash
python tools/studio-cut-local/studio_cut_local.py render-rescue-sync-session \
  --episode-dir ~/Movies/StudioCut/episode-004 \
  --dry-run
```

The web `Local Render Handoff` panel shows the same wrapper command while
editing. It also shows the decision JSON name to save under `edit/`, whether a
Sync Map is available, and the suggested session folder.
The web `Episode Command Center` panel summarizes the full operator chain:
generated package, shared room, browser edit, decision handoff, and local render.

The wrapper expects generated files under `generated/`, decisions under `edit/`,
and writes rough output under `renders/`. The Sync Map local media map should
stay ignored and should point Sync Map `inputId` values at Charlie's local
original or higher-quality proxy assets.
If the map does not include `audio.program`, `render-from-sync-map` will mix
mapped `homerAudio` and `charlieAudio` clean-audio assets when the Sync Map
contains those input roles. Otherwise it renders silent audio and prints a
warning.

## Known Limitations

- Undo/redo is local/browser-only and bounded. Exported checkpoints are the
  durable rollback path.
- Local checkpoint library entries are browser-local and capped to the newest
  12 snapshots.
- Pane calibration is metadata-only and localStorage-backed until an adjusted
  manifest is exported.
- The web Program Preview is a browser confidence preview, not final render
  truth.
- The rough aligned renderer assumes Premiere exported timeline-aligned media
  starting at sequence time `00:00:00`.
- The renderer does not parse Premiere XML/EDL yet.
- Firestore collaboration is experimental, and branch history is still shallow.
  Rules are test-gated, but collaborative branch/rollback UX is still young.
- Shared rooms upload only source-monitor proxies. Full-resolution aligned
  media remains local for render.
- Rescue Sync raw uploads can be large and should not be used heavily until
  lifecycle cleanup exists.
- Rescue Sync Worker extracts audio, builds the reference rail, estimates
  offsets with anchor-based waveform correlation, writes a Sync Map, generates
  low-res aligned proxies, composes a source-monitor proxy, and drafts a
  manifest. It still does not write shared-room metadata directly.
- The first Sync Map renderer can render rough 16:9 output from local assets,
  but final quality, drift-aware trim correction, and render-profile polish are
  still ahead.
- The local rules-test wrapper can use Homebrew OpenJDK. CI installs Temurin
  Java before running the verifier.
- Multiplayer undo is not global. Undo/redo remains browser-local; exported
  checkpoints remain the durable rollback path.
- Agentic editing is file-first for now. Agents can review/apply decision
  operation JSON locally, but the web cockpit does not yet preview operation
  files before import.

## Rollback Pattern

For the newest Studio Cut commits from a sprint, revert in reverse order, then
verify, deploy, and push:

```bash
git revert <newest-studio-cut-commit>
git revert <previous-studio-cut-commit>
pnpm studio-cut:verify
firebase deploy --project high-ground-odyssey --only hosting
git push
```

Use the exact commit SHAs from the final Codex report for this sprint.

## Recommended Next Sprint

Improve Sync Map render quality:

- refine correlation with FFT/chunked analysis and better drift estimation
- use Sync Map drift guidance during local original render
- add render-profile output presets beyond rough `youtube_16x9`
- generate production-grade source-monitor labels/proxy quality

Improve agentic editing:

- let agents propose silence/filler/awkward-hold cuts with confidence and
  explicit human approval points
- add a local episode workspace index so agents can discover generated session
  files without private absolute paths
