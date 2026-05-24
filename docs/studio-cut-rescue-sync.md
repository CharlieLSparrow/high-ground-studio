# Studio Cut Rescue Sync

Date: 2026-05-22

Rescue Sync is the Studio Cut path for messy episode intake. Episode 4 exposed
the immediate need: the phone/reference recording can arrive in multiple
pieces, which makes manual Premiere sync painful. Studio Cut now models those
pieces explicitly so a future sync worker can build a reference rail and prepare
the shared editing room.

## Product Rule

Charlie uploads messy assets. Studio Cut builds order from chaos. Mako opens a
shared room link and edits. Mako does not import JSON, load local media, or run
sync rituals.

## Multi-Piece Reference

`phoneReferenceAudio` supports multiple uploaded inputs. Each uploaded input has:

- `inputId`
- `role`
- `fileName`
- `storagePath`
- `contentType`
- `sizeBytes`
- optional `durationMs`
- `uploadedAt`
- optional `orderIndex`
- optional `notes`

The web UI lets Charlie add multiple phone/reference files and assign
`orderIndex` values. Worker v0 sorts reference pieces by `orderIndex`, then
file name, then `inputId` before creating the reference rail.

## Reference Rail

The reference rail is a continuous timeline assembled from the phone/reference
pieces:

```json
{
  "syncJobId": "episode-004-rescue-sync",
  "referenceRole": "phoneReferenceAudio",
  "segments": [
    {
      "inputId": "phone-reference-00",
      "fileName": "phone-part-01.m4a",
      "railStartMs": 0,
      "sourceStartMs": 0,
      "durationMs": 5000,
      "confidence": 0.1,
      "warnings": []
    }
  ],
  "totalDurationMs": 5000,
  "warnings": []
}
```

In metadata-only mode, Worker v0 concatenates durations from sync job metadata.
In local-media mode, it inspects files with `ffprobe`, prefers inspected
durations, extracts normalized WAVs, and assembles
`workdir/audio/reference-rail.wav` from the ordered phone/reference pieces.

## Sync Report

The Rescue Sync report contains:

- `syncJobId`
- `generatedAt`
- `status`
- `referenceRail`
- `trackOffsets`
- `globalWarnings`

`trackOffsets` lists Homer video, Charlie video, clean audio tracks, clip video,
and other non-reference inputs. When local extracted audio and a reference rail
WAV are available, Worker v0 selects multiple anchor windows from longer tracks
and correlates each anchor against the reference rail. It writes
`estimatedOffsetMs`, confidence, `anchorCount`, `anchorAgreementMs`, approximate
`driftPpm`, and optional `anchorSummaries`. Positive offsets mean the input
starts after the reference rail starts. Negative offsets mean it appears to have
started before the rail.

## Sync Map

The Sync Map is the new durable output that turns sync estimates into a render
contract. It maps canonical episode timeline time to original asset-local time:

```text
original asset -> extracted audio/proxy -> waveform sync -> Sync Map -> synced proxy room -> semantic decisions -> original render
```

Each Sync Map includes:

- `canonicalTimeline.durationMs`, `timebase`, and `referenceRole`
- one asset mapping per uploaded input
- path-safe Storage metadata such as `originalStoragePath`
- `timelineStartMs`, `assetStartMs`, `durationMs`, `estimatedOffsetMs`,
  optional `driftPpm`, confidence, and warnings
- the multi-piece `referenceRail`

It must not include local filesystem paths. Proxies and extracted WAV files are
derivable. The Sync Map and semantic decisions are durable.

For now, the worker can write a Sync Map with:

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

For real episodes, prefer the one-folder session helper instead of hand-writing
the sync job and local media map:

```bash
python tools/studio-cut-local/studio_cut_local.py rescue-sync-session \
  --episode-id episode-004 \
  --title "Episode 004" \
  --episode-dir ~/Movies/StudioCut/episode-004
```

Put files in `~/Movies/StudioCut/episode-004/inbox/` using predictable names:
`homer-video.mov`, `charlie-video.mov`, `homer-audio.wav`,
`charlie-audio.wav`, `phone-reference-01.m4a`, `phone-reference-02.m4a`, and
optional `clip-video.mp4`. The helper writes `generated/sync-job.json` and
`generated/local-media-map.json`, then runs the worker automatically when the
required files are present.

Inspect the same folder with:

```bash
python tools/studio-cut-local/studio_cut_local.py rescue-sync-status \
  --episode-dir ~/Movies/StudioCut/episode-004
```

The report is intentionally operator-friendly: it shows missing inputs,
generated package files, sync report confidence hints, source-monitor proxy
inspection, decision count, render readiness, and the exact next command.

The web UI and current decision schema still say `sourceTimeMs` in several
places. Architecturally, that value should be treated as canonical episode
timeline time, not an individual asset's file time.

The first local original-asset renderer now consumes this contract:

```bash
python tools/studio-cut-local/studio_cut_local.py render-from-sync-map \
  --sync-map /tmp/studio-cut-sync-map.json \
  --decisions /path/to/studio-cut-decisions.json \
  --media-map /path/to/sync-map-local-media.json \
  --out /tmp/studio-cut-sync-map-youtube-16x9.mp4
```

The local media map points at original or higher-quality local files by Sync Map
`inputId`. It should stay untracked because it can contain private machine
paths. The renderer translates each active semantic decision span from
canonical episode time into asset-local time, pads missing role coverage with
black, skips `Cut`, and writes a rough 16:9 output. If `audio.program` is not
provided, it can now mix mapped `homerAudio` and `charlieAudio` Sync Map assets
from the same local media map. Final quality, drift-aware rendering, and profile
polish remain future work.

For a standard one-folder session, prefer the wrapper after decisions are
exported into `edit/<episode-id>-decisions.json`:

```bash
python tools/studio-cut-local/studio_cut_local.py render-rescue-sync-session \
  --episode-dir ~/Movies/StudioCut/episode-004 \
  --dry-run
```

Remove `--dry-run` to write the rough output into the session `renders/`
directory. If `--episode-id` is omitted, the wrapper reads the generated
manifest, Sync Map, or sync job before falling back to the folder name.

The web editor's `Local Render Handoff` panel mirrors this flow while tagging:
it shows the expected decision filename, whether a Sync Map is attached, and the
same dry-run command. That panel is intentionally operator-facing so Charlie can
move from shared-room editing to local render without hunting through docs.
The `Episode Command Center` panel sits above it and shows the broader state of
the episode: generated package, shared room, browser edit, decision handoff, and
local render.

## Generated Proxy Package

Worker v0 can now turn Sync Map offsets into a local browser editing package:

- aligned low-res proxy clips for Homer, Charlie, and Clip video roles
- black padding where an asset starts after canonical time 0
- black/slate panes where Clip or program preview material is not available
- a 2x2 source-monitor proxy MP4
- a draft Episode Manifest with pane rectangles for that 2x2 proxy

The source-monitor proxy layout is:

- Homer top-left
- Charlie top-right
- Clip bottom-left
- Program placeholder bottom-right

The generated proxy and manifest are disposable/derivable artifacts. The Sync
Map and semantic decisions remain the durable outputs. Studio Cut web now has a
`Publish Rescue Sync Package` panel that uploads the generated proxy, manifest,
Sync Map, and optional sync report into the selected shared room. The worker
still does not write Firestore room metadata directly; Charlie publishes the
generated package from the browser after reviewing the outputs.

When a future cloud worker produces the same generated package into the sync
job output paths, Charlie does not need to download and reselect those files.
The `Cloud Sync Intake` panel watches the active sync job. If it reaches
`ready`, `Publish Worker Outputs` validates the generated manifest, Sync Map,
and sync report directly from Storage, then writes shared room metadata pointing
at the worker-generated source-monitor proxy. That is the direct raw-upload to
shared-room bridge while the worker remains separate from the web app.

Publishing flow:

1. Run the local Rescue Sync worker with `--out-sync-map`,
   `--out-source-monitor-proxy`, and `--out-manifest`.
2. Open Studio Cut and sign in with an approved High Ground account.
3. Switch Collaboration Mode to the intended `projectId` and `branchId`.
4. Select the generated Episode Manifest, source-monitor proxy MP4, Sync Map
   JSON, and optional sync report JSON in `Publish Rescue Sync Package`.
5. Confirm the package preflight shows the generated files, Manifest/Sync Map,
   room target, proxy upload, and optional sync report checks as ready or
   intentionally optional. If the active room does not match the package, use
   `Use Package Room` to switch from the selected manifest and Sync Map.
6. Click `Publish Generated Package`.
7. Send the shared room link to Mako.

Mako opens the link, signs in, and edits against the shared proxy room. Mako
does not import JSON, load local media, or touch sync files in the primary path.

After publish, the web app shows `Sync Review` for the room. It reads the
attached Sync Map and optional sync report from Storage, validates them, and
summarizes canonical duration, asset roles, reference rail pieces, estimated
offset count, lowest confidence, and warning count. It also lists the ordered
reference pieces, per-track offset estimates, anchor/agreement details when
available, and the first sync warnings. This gives Charlie a visible
confirmation that the shared proxy room is backed by generated sync metadata,
not just a loose MP4. The panel never shows local filesystem paths.

Before using real footage, generate a synthetic package and publish it through
the live UI:

```bash
pnpm studio-cut:rescue-sync-package
```

The command writes synthetic files and a local README under
`tools/studio-cut-local/output/rescue-sync-publish-package/`. Use those files in
`Publish Rescue Sync Package` to validate the room metadata, Storage upload,
Sync Map attachment, and shared proxy load path without private media. It also
includes optional demo decision and timed transcript JSON files so Charlie can
seed the synthetic room and exercise tagging, Transcript Review, and Agent
Context without real episode material.

For a cleaner demo path:

```bash
pnpm studio-cut:demo-package
```

This writes the same package shape under
`tools/studio-cut-local/output/demo-shared-room-package/`.

Before publishing a real generated package, validate the artifact set:

```bash
python tools/studio-cut-local/studio_cut_local.py validate-generated-package \
  --manifest ~/Movies/StudioCut/episode-004/generated/episode-manifest.json \
  --proxy ~/Movies/StudioCut/episode-004/generated/source-monitor-proxy.mp4 \
  --sync-map ~/Movies/StudioCut/episode-004/generated/sync-map.json \
  --sync-report ~/Movies/StudioCut/episode-004/generated/sync-report.json
```

It should print `Status: READY`, the publish checklist, and the expected `Sync
Review` confirmation for the shared room.

## Current Implementation

Implemented now:

- schema/types for multi-input sync jobs
- validators for sync jobs, reference rails, and sync reports
- web intake UI with multiple phone/reference files and order controls
- Firebase Storage path helpers with sanitized per-input file paths
- Firestore sync job document scaffolding at `studioCutSyncJobs/{syncJobId}`
- local Worker v0 that validates a job, inspects local media when mapped,
  extracts mono 48 kHz WAV files, builds `reference-rail.wav`, and estimates
  offsets with anchor-based waveform correlation v0
- Sync Map schema, validation, manifest drafting helper, worker output, and
  synthetic smoke assertions
- aligned low-res proxy generation, 2x2 source-monitor proxy composition, and
  draft Episode Manifest output
- browser publishing of generated worker packages into shared rooms
- local `render-from-sync-map` handoff from Sync Map + decisions to rough 16:9
  output using local original/proxy assets
- helper tests included in `pnpm studio-cut:verify`

Scaffold only:

- production-grade drift estimation
- FFT/refined long-form correlation
- production-grade proxy quality and labels
- direct Firestore room metadata creation from the worker
- Cloud Run deployment
- retention/lifecycle cleanup

## Local Worker

Run metadata-only mode without cloud credentials:

```bash
python tools/studio-cut-cloud-sync/cloud_sync_worker.py \
  --sync-job-json tools/studio-cut-cloud-sync/examples/sync-job.placeholder.json \
  --out /tmp/studio-cut-rescue-sync-report.placeholder.json
```

Run local-media mode with a local media map and work directory:

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

The local media map shape is:

```json
{
  "inputs": {
    "phone-reference-00": "./media/phone-part-01.m4a",
    "phone-reference-01": "./media/phone-part-02.m4a"
  }
}
```

Relative paths resolve from the local media map file location. The worker does
not upload anything and does not mutate source files.

Synthetic canary:

```bash
pnpm studio-cut:cloud-sync-smoke
```

This creates temporary synthetic files, runs the worker, verifies short and
long-form phone/reference rail scenarios, checks extracted WAV outputs, asserts
known +1000ms/+2000ms and +7000ms/+15000ms offset estimates, and verifies
multiple anchors for long tracks. It also asserts Sync Map asset timeline starts
and checks that no local temp paths appear in the Sync Map or Manifest JSON. It
verifies that the generated source-monitor proxy exists, is 640x360, and
matches the canonical duration within tolerance.

Do not upload sensitive/private footage until Firestore and Storage rules have
passed emulator tests, rules have been intentionally deployed, and retention
cleanup is defined.
