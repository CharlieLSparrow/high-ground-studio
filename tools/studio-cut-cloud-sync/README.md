# Studio Cut Cloud Sync Worker v0

This directory holds the first worker contract for raw-asset cloud intake and
Episode 4 Rescue Sync. It runs locally without cloud credentials and is not a
production Cloud Run worker yet. Worker v0 includes local anchor-based waveform
correlation for longer files; Cloud deployment and production-grade drift
handling are still future work.

The intended flow is:

1. Charlie creates a Studio Cut sync job in the web app.
2. The web app uploads selected raw assets to Firebase Storage under
   `studioCutSyncJobs/{syncJobId}/uploads/{role}/{fileName}`.
3. A future Cloud Run worker reads `studioCutSyncJobs/{syncJobId}` from
   Firestore, downloads the uploaded inputs, builds a multi-piece
   `phoneReferenceAudio` reference rail, syncs Homer/Charlie sources against
   that rail, and writes:
   - `studioCutSyncJobs/{syncJobId}/outputs/source-monitor-proxy.mp4`
   - `studioCutSyncJobs/{syncJobId}/outputs/episode-manifest.json`
   - `studioCutSyncJobs/{syncJobId}/outputs/sync-report.json`
4. The worker writes shared room metadata so Mako can open the room link and
   edit without local media or JSON import/export.

## Metadata-Only Mode

Run the worker against placeholder sync job metadata without cloud credentials
or local media files:

```bash
python tools/studio-cut-cloud-sync/cloud_sync_worker.py \
  --sync-job-json tools/studio-cut-cloud-sync/examples/sync-job.placeholder.json \
  --out /tmp/studio-cut-cloud-sync-report.placeholder.json
```

Metadata-only mode validates the JSON shape, prints planned FFmpeg/sync steps,
and writes a sync report with a duration-based reference rail. It sorts
`phoneReferenceAudio` inputs by `orderIndex`, then file name, then `inputId`.

## Local-Media Mode

Worker v0 can also inspect local files and extract normalized audio. It accepts
a local media map:

```json
{
  "inputs": {
    "phone-reference-00": "./media/phone-part-01.m4a",
    "homer-video": "/absolute/path/to/homer-video.mp4"
  }
}
```

Relative paths resolve from the media map file location. The worker uses:

- `ffprobe` to inspect duration, audio/video streams, and sample rate
- `ffmpeg` to extract mono 48 kHz WAV files into `workdir/audio/{inputId}.wav`
- inspected durations for the multi-piece phone/reference rail when available
- `workdir/audio/reference-rail.wav` assembled from extracted phone pieces
- anchor-window waveform-envelope correlation for non-reference extracted audio

Example:

```bash
python tools/studio-cut-cloud-sync/cloud_sync_worker.py \
  --sync-job-json /path/to/sync-job.json \
  --local-media-map /path/to/local-media-map.json \
  --workdir /tmp/studio-cut-cloud-sync-work \
  --out /tmp/studio-cut-cloud-sync-report.json
```

The worker writes `estimatedOffsetMs`, confidence, `anchorCount`,
`anchorAgreementMs`, approximate `driftPpm`, and optional `anchorSummaries` for
correlated tracks. Positive offsets mean the input starts after the reference
rail starts. Negative offsets mean the input appears to have started before the
rail starts.

The worker still does not generate proxies, write manifests, write Firestore
room metadata, or start paid cloud resources. Drift is approximate and based on
anchor agreement; FFT refinement is still future work.

## Synthetic Smoke

Run the deterministic synthetic smoke test:

```bash
pnpm studio-cut:cloud-sync-smoke
```

The smoke creates synthetic media in a temporary directory, runs local-media
mode, asserts short and long phone/reference rail scenarios, verifies extracted
WAV files, checks known +1000ms/+2000ms and +7000ms/+15000ms offsets, checks
long-form anchor counts, and removes the temporary files unless
`STUDIO_CUT_CLOUD_SYNC_SMOKE_KEEP_WORKDIR=1` is set.

Keep real episode assets, generated proxies, private paths, and credentials out
of git.
