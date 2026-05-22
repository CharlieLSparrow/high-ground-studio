# Studio Cut Cloud Sync Intake

Date: 2026-05-22

This is the first cloud raw-asset intake foundation for Studio Cut, now shaped
around Episode 4 Rescue Sync. It is a contract and UI scaffold, not a paid
production worker.

## Product Direction

The primary future workflow is:

1. Charlie uploads disparate episode assets into Studio Cut.
2. A cloud sync/prep worker generates the lightweight browser editing package.
3. Mako opens a shared room link and edits live.
4. Charlie later renders locally from semantic decisions and local aligned
   media.

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
8. Generate timeline-aligned low-res intermediates.
9. Compose the browser source-monitor proxy.
10. Write `episode-manifest.json` and `sync-report.json`.
11. Write shared room metadata at
   `studioCutProjects/{projectId}/branches/{branchId}/room/meta`.
12. Set job status to `ready`, or `failed` with `errorMessage`.

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
  --out /tmp/studio-cut-cloud-sync-report.json
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
and approximate `driftPpm`. Proxy generation, manifest generation, and Firestore
room metadata writes remain future work.

Run the synthetic local-media canary:

```bash
pnpm studio-cut:cloud-sync-smoke
```

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
  Drift is approximate, and FFT/refined correlation is still needed before this
  becomes a reliable production sync engine.
- See `docs/studio-cut-rescue-sync.md` for the Episode 4 multi-piece reference
  model.
- Storage rules are scaffolded for raw intake paths, but rules deploy remains a
  separate operator step after emulator tests pass.
- Lifecycle cleanup is still needed before sensitive/private footage is trusted
  in cloud intake buckets.
