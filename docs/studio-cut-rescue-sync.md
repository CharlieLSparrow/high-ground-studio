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

The web UI and current decision schema still say `sourceTimeMs` in several
places. Architecturally, that value should be treated as canonical episode
timeline time, not an individual asset's file time.

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

Publishing flow:

1. Run the local Rescue Sync worker with `--out-sync-map`,
   `--out-source-monitor-proxy`, and `--out-manifest`.
2. Open Studio Cut and sign in with an approved High Ground account.
3. Switch Collaboration Mode to the intended `projectId` and `branchId`.
4. Select the generated Episode Manifest, source-monitor proxy MP4, Sync Map
   JSON, and optional sync report JSON in `Publish Rescue Sync Package`.
5. Click `Publish Generated Package`.
6. Send the shared room link to Mako.

Mako opens the link, signs in, and edits against the shared proxy room. Mako
does not import JSON, load local media, or touch sync files in the primary path.

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
