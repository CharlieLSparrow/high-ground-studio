# Studio Cut Cloud Sync Worker v0

This directory holds the first worker contract for raw-asset cloud intake and
Episode 4 Rescue Sync. It runs locally without cloud credentials and is not a
production Cloud Run worker yet. Worker v0 includes local anchor-based waveform
correlation for longer files and can now generate a local browser editing
package. Cloud deployment and production-grade drift handling are still future
work.

The proxy-first intended flow is:

1. Charlie creates a Studio Cut sync job in the web app.
2. The web app uploads selected original assets to Firebase Storage under
   `studioCutSyncJobs/{syncJobId}/uploads/{role}/{fileName}`.
3. The worker extracts lightweight audio/proxy derivatives from those originals.
4. The worker builds a multi-piece `phoneReferenceAudio` reference rail and
   estimates offsets for Homer/Charlie/clip assets.
5. The worker writes a durable Sync Map that maps canonical episode timeline
   time to each original asset's local time.
6. Local package generation can now write:
   - `studioCutSyncJobs/{syncJobId}/outputs/source-monitor-proxy.mp4`
   - `studioCutSyncJobs/{syncJobId}/outputs/episode-manifest.json`
   - `studioCutSyncJobs/{syncJobId}/outputs/sync-report.json`
   - `studioCutSyncJobs/{syncJobId}/outputs/sync-map.json`
7. Charlie publishes those generated files from Studio Cut web with
   `Publish Rescue Sync Package`, which writes shared room metadata so Mako can
   open the room link and edit without local media or JSON import/export.

Sync Maps and semantic decisions are durable. Proxies and extracted audio are
derivable implementation artifacts. Final local render will use the Sync Map to
translate canonical episode timeline decisions back into original asset-local
time.

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
  --out /tmp/studio-cut-cloud-sync-report.json \
  --out-sync-map /tmp/studio-cut-sync-map.json \
  --out-proxy-dir /tmp/studio-cut-proxies \
  --out-source-monitor-proxy /tmp/studio-cut-source-monitor-proxy.mp4 \
  --out-manifest /tmp/studio-cut-episode-manifest.json
```

For real operator work, prefer generating those inputs with the local one-folder
session helper:

```bash
python tools/studio-cut-local/studio_cut_local.py rescue-sync-session \
  --episode-id episode-004 \
  --title "Episode 004" \
  --episode-dir ~/Movies/StudioCut/episode-004
```

That command scans `inbox/`, writes `generated/sync-job.json` and
`generated/local-media-map.json`, then calls this worker when required files are
present. Use the direct worker command when debugging or when another system has
already produced the job/map files.

Use the companion status command when assisting an operator:

```bash
python tools/studio-cut-local/studio_cut_local.py rescue-sync-status \
  --episode-dir ~/Movies/StudioCut/episode-004
```

It summarizes missing inputs, generated worker outputs, sync confidence hints,
proxy inspection, decisions, render readiness, and the next command to run.

The worker writes `estimatedOffsetMs`, confidence, `anchorCount`,
`anchorAgreementMs`, approximate `driftPpm`, and optional `anchorSummaries` for
correlated tracks. Positive offsets mean the input starts after the reference
rail starts. Negative offsets mean the input appears to have started before the
rail starts.

When `--out-sync-map` is provided, the worker writes a Sync Map with:

- `canonicalTimeline.durationMs` from the reference rail
- one asset mapping per uploaded input
- `timelineStartMs` from the estimated offset or reference rail segment
- `assetStartMs`, `durationMs`, `estimatedOffsetMs`, `driftPpm`, confidence,
  and warnings
- no local filesystem paths

When proxy output flags are provided, the worker also:

- creates aligned low-res proxy clips for Homer, Charlie, and Clip video roles
- pads assets with black video so each proxy spans the canonical timeline
- composes a 2x2 source-monitor proxy:
  - Homer top-left
  - Charlie top-right
  - Clip bottom-left, or black if missing
  - Program placeholder bottom-right
- writes an Episode Manifest whose panes match that 2x2 layout

The generated manifest references the generated source-monitor proxy file name
only. It does not include local original media paths.

The worker still does not upload generated proxies, write Firestore room
metadata, or start paid cloud resources. Drift is approximate and based on
anchor agreement; FFT refinement is still future work.

## Synthetic Smoke

Run the deterministic synthetic smoke test:

```bash
pnpm studio-cut:cloud-sync-smoke
```

The smoke creates synthetic media in a temporary directory, runs local-media
mode, asserts short and long phone/reference rail scenarios, verifies extracted
WAV files, checks known +1000ms/+2000ms and +7000ms/+15000ms offsets, checks
long-form anchor counts, verifies Sync Map asset timeline starts, confirms no
temporary local paths leak into Sync Map JSON, generates a 640x360 2x2
source-monitor proxy, validates the generated manifest pane rectangles, and
removes the temporary files unless
`STUDIO_CUT_CLOUD_SYNC_SMOKE_KEEP_WORKDIR=1` is set.

## Publish The Generated Package

After a real local worker run, Charlie publishes the generated package from the
Studio Cut web app:

1. Open `https://high-ground-odyssey.web.app` and sign in.
2. Switch Collaboration Mode to the generated manifest `projectId` and intended
   branch.
3. In `Publish Rescue Sync Package`, select:
   - the generated Episode Manifest JSON
   - the generated source-monitor proxy MP4
   - the generated Sync Map JSON
   - the generated sync report JSON if available
4. Click `Publish Generated Package`.
5. Send the room link to Mako.

The web app uploads only derived artifacts. It stores the proxy in the shared
room proxy path and the manifest/Sync Map/report under
`studioCutSyncJobs/{syncJobId}/outputs/{fileName}`. It does not upload original
full-resolution assets or local filesystem paths.

Once the room loads, `Sync Review` reads the attached Sync Map and optional sync
report from Storage and summarizes the sync job, canonical duration, asset
roles, reference pieces, offset count, confidence, and warnings. Use that panel
as the browser-side confirmation that a shared room was published from Rescue
Sync outputs rather than a loose proxy-only package.

Generate a safe package for testing that UI path:

```bash
pnpm studio-cut:rescue-sync-package
```

The command writes synthetic-only files under the ignored directory:

```text
tools/studio-cut-local/output/rescue-sync-publish-package/
```

Open the generated `README.md` in that directory for the exact live-app publish
test. The package includes a manifest, source-monitor proxy MP4, Sync Map, sync
report, sync job JSON, package summary, optional demo decision JSON, and
optional timed transcript JSON. None of those files should be committed.

For an operator-friendly output path, use:

```bash
pnpm studio-cut:demo-package
```

That writes the same synthetic package shape under
`tools/studio-cut-local/output/demo-shared-room-package/`.

Keep real episode assets, generated proxies, private paths, and credentials out
of git.
