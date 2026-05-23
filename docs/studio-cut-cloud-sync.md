# Studio Cut Cloud Sync Intake

Date: 2026-05-22

This is the first cloud raw-asset intake foundation for Studio Cut, now shaped
around Episode 4 Rescue Sync. It is a local worker plus cloud contract, not a
paid production worker.

## Product Direction

The primary future workflow is proxy-first:

1. Charlie uploads disparate episode assets into Studio Cut.
2. The sync worker extracts lightweight audio/proxy derivatives.
3. The worker syncs those derivatives and writes a durable Sync Map.
4. The worker generates the lightweight browser editing package.
5. Charlie publishes the generated package from Studio Cut web into a shared
   room.
6. Mako opens a shared room link and edits live on canonical episode timeline
   time.
7. Charlie later renders original assets locally from Sync Map + semantic
   decisions.

JSON import/export and manual shared-room package upload remain backup/fallback
paths. Full-resolution final render media remains local.

## Firestore Job Shape

Raw intake jobs live at:

```text
studioCutSyncJobs/{syncJobId}
```

The job document shape is:

```json
{
  "syncJobId": "episode-004-20260522T120000z-abc12345",
  "projectId": "episode-004",
  "branchId": "main",
  "title": "Episode 004",
  "createdBy": "operator@example.com",
  "createdAt": "2026-05-22T12:00:00.000Z",
  "updatedAt": "2026-05-22T12:10:00.000Z",
  "status": "uploaded",
  "expectedInputs": {
    "homerVideo": true,
    "charlieVideo": true,
    "homerAudio": true,
    "charlieAudio": true,
    "phoneReferenceAudio": true,
    "clipVideo": true
  },
  "uploadedInputs": [
    {
      "inputId": "phone-reference-00",
      "role": "phoneReferenceAudio",
      "fileName": "phone-part-01.m4a",
      "storagePath": "studioCutSyncJobs/.../uploads/phoneReferenceAudio/phone-reference-00-phone-part-01.m4a",
      "contentType": "audio/mp4",
      "sizeBytes": 1024,
      "durationMs": 5000,
      "uploadedAt": "2026-05-22T12:05:00.000Z",
      "orderIndex": 0
    }
  ],
  "outputs": {
    "manifestStoragePath": "studioCutSyncJobs/.../outputs/episode-manifest.json",
    "sourceMonitorProxyStoragePath": "studioCutSyncJobs/.../outputs/source-monitor-proxy.mp4",
    "syncReportStoragePath": "studioCutSyncJobs/.../outputs/sync-report.json",
    "syncMapStoragePath": "studioCutSyncJobs/.../outputs/sync-map.json",
    "sharedRoomUrl": "https://high-ground-odyssey.web.app/?projectId=episode-004&branchId=main"
  }
}
```

`status` is one of:

```text
draft | uploading | uploaded | queued | processing | ready | failed
```

Required inputs:

- Homer video
- Charlie video
- Homer clean audio
- Charlie clean audio
- phone/reference audio

Optional input:

- clip/screen video
- other supplemental file

`phoneReferenceAudio` is multi-piece by design. Multiple uploaded inputs can
share the same role as long as each has a unique `inputId`. `orderIndex`
controls the intended order of phone/reference pieces in the reference rail.

## Storage Paths

Uploads go under:

```text
studioCutSyncJobs/{syncJobId}/uploads/{role}/{fileName}
```

Worker outputs are expected at:

```text
studioCutSyncJobs/{syncJobId}/outputs/source-monitor-proxy.mp4
studioCutSyncJobs/{syncJobId}/outputs/episode-manifest.json
studioCutSyncJobs/{syncJobId}/outputs/sync-report.json
studioCutSyncJobs/{syncJobId}/outputs/sync-map.json
```

Do not store local filesystem paths, browser object URLs, service account
credentials, full-resolution render outputs, or generated private episode JSON
in Firestore.

## Worker Contract

The future Cloud Run worker should:

1. Read `studioCutSyncJobs/{syncJobId}`.
2. Download uploaded assets to worker scratch space.
3. Extract audio waveforms with FFmpeg.
4. Sort `phoneReferenceAudio` pieces by `orderIndex`, then file name.
5. Build a continuous reference rail.
6. Cross-correlate Homer/Charlie sources against that rail.
7. Estimate offsets and drift confidence per input.
8. Write `sync-map.json`, mapping canonical episode timeline time to each
   original asset's local time.
9. Generate timeline-aligned low-res intermediates.
10. Compose the browser source-monitor proxy.
11. Write `episode-manifest.json` and `sync-report.json`.
12. Write shared room metadata at
   `studioCutProjects/{projectId}/branches/{branchId}/room/meta`.
13. Set job status to `ready`, or `failed` with `errorMessage`.

The current local Worker v0 validates job JSON and prints this plan:

```bash
python tools/studio-cut-cloud-sync/cloud_sync_worker.py \
  --sync-job-json tools/studio-cut-cloud-sync/examples/sync-job.placeholder.json \
  --out /tmp/studio-cut-cloud-sync-report.placeholder.json
```

Worker v0 also supports local-media mode without cloud credentials:

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

The local media map uses input ids:

```json
{
  "inputs": {
    "phone-reference-00": "./media/phone-part-01.m4a",
    "homer-video": "./media/homer-video.mp4"
  }
}
```

In local-media mode, Worker v0 uses `ffprobe` to inspect duration and
audio/video streams, then extracts mono 48 kHz WAV files with `ffmpeg` into
`workdir/audio/{inputId}.wav`. It builds the phone/reference rail from inspected
durations when available, assembles `workdir/audio/reference-rail.wav`, and
correlates extracted non-reference audio against that rail. For longer tracks it
selects multiple anchor windows, scans those anchors against the rail, then
summarizes `estimatedOffsetMs`, confidence, `anchorCount`, `anchorAgreementMs`,
and approximate `driftPpm`.

When proxy output flags are present, Worker v0 uses the Sync Map mappings to
generate aligned low-res video proxies. If an asset starts after canonical time
0, the proxy is padded with black video. If a role is missing from the source
monitor, the worker fills that pane with black. It then composes a browser
source-monitor proxy as a 2x2 MP4:

- Homer top-left
- Charlie top-right
- Clip bottom-left
- Program placeholder bottom-right

The generated Episode Manifest uses normalized pane rectangles matching that
2x2 layout and points `sourceMonitorProxy.localPlaceholderPath` at the generated
proxy file name. It does not include local original media paths.

Firestore room metadata writes remain future work.

## Sync Map Shape

The Sync Map is the durable bridge between the lightweight synced proxy room and
the original assets. It is safe to serialize to JSON/Firestore metadata because
it links assets by ids and Storage paths, not local filesystem paths:

```json
{
  "syncMapId": "episode-004-rescue-sync-sync-map-v1",
  "syncJobId": "episode-004-rescue-sync",
  "projectId": "episode-004",
  "branchId": "main",
  "createdAt": "2026-05-22T12:30:00.000Z",
  "updatedAt": "2026-05-22T12:30:00.000Z",
  "canonicalTimeline": {
    "durationMs": 12000,
    "timebase": "milliseconds",
    "referenceRole": "phoneReferenceAudio"
  },
  "assets": [
    {
      "assetId": "homer-video",
      "inputId": "homer-video",
      "role": "homerVideo",
      "fileName": "homer.mp4",
      "originalStoragePath": "studioCutSyncJobs/.../uploads/homerVideo/homer.mp4",
      "timelineStartMs": 7000,
      "assetStartMs": 0,
      "durationMs": 60000,
      "estimatedOffsetMs": 7000,
      "driftPpm": 0,
      "confidence": 0.82,
      "warnings": []
    }
  ],
  "referenceRail": {
    "syncJobId": "episode-004-rescue-sync",
    "referenceRole": "phoneReferenceAudio",
    "segments": [],
    "totalDurationMs": 12000,
    "warnings": []
  },
  "globalWarnings": []
}
```

Semantic edit decisions should refer to canonical episode timeline time. The
rough render path can then use `timelineStartMs`, `assetStartMs`, drift, and
confidence to translate a canonical edit span into asset-local media ranges for
original render. Existing web UI and schema still use `sourceTimeMs` in places;
for Studio Cut architecture, read that as canonical episode timeline time until
the naming is migrated.

The first local renderer for that bridge is:

```bash
python tools/studio-cut-local/studio_cut_local.py render-from-sync-map \
  --sync-map path/to/sync-map.json \
  --decisions path/to/studio-cut-decisions.json \
  --media-map path/to/sync-map-local-media.json \
  --out /tmp/studio-cut-sync-map-youtube-16x9.mp4
```

The `--media-map` file remains local and points Sync Map `inputId` values at
original or higher-quality local media. It should not be committed. The command
applies the rough `youtube_16x9` layouts, skips `Cut`, and pads partial asset
coverage with black in v0.

The worker can also draft an Episode Manifest from Sync Map metadata. That
bridge is active in the local worker: it sets duration from
`canonicalTimeline.durationMs`, derives source labels from asset roles, and
points at the generated source-monitor proxy file name.

## Publishing Generated Packages

The local worker writes files; Studio Cut web publishes them into a shared room.
After generating the source-monitor proxy, Episode Manifest, Sync Map, and sync
report, Charlie opens the deployed editor and uses `Publish Rescue Sync Package`.

The publish step uploads:

- the source-monitor proxy MP4 to
  `studioCutProjects/{projectId}/branches/{branchId}/source-monitor-proxy/{fileName}`
- the generated manifest JSON, Sync Map JSON, and optional sync report JSON to
  `studioCutSyncJobs/{syncJobId}/outputs/{fileName}`

Then Studio Cut writes `studioCutProjects/{projectId}/branches/{branchId}/room/meta`
with `packageKind: rescue_sync_generated`, the manifest, proxy metadata, Sync
Map storage path, sync report storage path if present, and package timestamp.
Original full-resolution files are not uploaded by this publish flow.

Mako opens the room URL, signs in, and edits the shared proxy room. JSON
import/export remains backup and recovery.

To generate a safe synthetic package for testing the live publish UI:

```bash
pnpm studio-cut:rescue-sync-package
```

That writes an ignored package under:

```text
tools/studio-cut-local/output/rescue-sync-publish-package/
```

Use those generated files in `Publish Rescue Sync Package` to test Firebase
room publishing without private footage or real episode metadata.

Run the synthetic local-media canary:

```bash
pnpm studio-cut:cloud-sync-smoke
```

The smoke creates synthetic media in a temporary directory, runs local-media
mode, asserts short and long phone/reference rail scenarios, verifies extracted
WAV files, checks known +1000ms/+2000ms and +7000ms/+15000ms offsets, checks
long-form anchor counts, asserts Sync Map timeline starts and confidence, and
confirms no local temp paths appear in Sync Map JSON or Manifest JSON. It also
verifies the generated source-monitor proxy exists, is 640x360, and is close to
the canonical reference rail duration.

## Sync Report Shape

Reports use:

```json
{
  "syncJobId": "episode-004-rescue-sync-placeholder",
  "generatedAt": "2026-05-22T12:30:00.000Z",
  "status": "ready",
  "referenceRail": {
    "syncJobId": "episode-004-rescue-sync-placeholder",
    "referenceRole": "phoneReferenceAudio",
    "segments": [],
    "totalDurationMs": 0,
    "warnings": []
  },
  "trackOffsets": [],
  "globalWarnings": []
}
```

Examples live under:

```text
tools/studio-cut-cloud-sync/examples/
```

## Safety And Cost Notes

- The web app does not auto-upload; Charlie must explicitly click upload.
- Local dev mode blocks raw upload because Firebase config is missing.
- The checked-in worker does not start Cloud Run or create paid resources.
- Worker v0 can process explicitly mapped local files, but examples and tests
  use only synthetic or placeholder media.
- Worker v0 estimates offsets with local anchor-based waveform correlation.
- Worker v0 can generate aligned low-res proxy clips, a 2x2 source-monitor
  proxy, and a draft Episode Manifest locally.
  Drift is approximate, and FFT/refined correlation is still needed before this
  becomes a reliable production sync engine.
- See `docs/studio-cut-rescue-sync.md` for the Episode 4 multi-piece reference
  model.
- Storage rules are scaffolded for raw intake paths, but rules deploy remains a
  separate operator step after emulator tests pass.
- Lifecycle cleanup is still needed before sensitive/private footage is trusted
  in cloud intake buckets.
