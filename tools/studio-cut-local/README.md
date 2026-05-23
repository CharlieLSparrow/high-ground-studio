# Studio Cut Local

Local render handoff tools for Studio Cut.

This CLI is intentionally local-only:

- no Firebase or cloud access
- no source media upload
- no mutation of source media
- no checked-in private episode data
- Python standard library only

## Commands

Run from the repo root.

```bash
python tools/studio-cut-local/studio_cut_local.py doctor
```

Create placeholder bootstrap files for a real episode:

```bash
python tools/studio-cut-local/studio_cut_local.py create-episode-bootstrap \
  --episode-id episode-004 \
  --title "Episode 004" \
  --duration-ms 600000 \
  --out-dir tools/studio-cut-local/output/episode-004-bootstrap
```

This writes:

- `episode-004-episode-manifest.json`
- `episode-004-local-media.json`
- `README.md`

Use `--include-clip false` if the episode has no shared Clip track. Generated
real-episode bootstrap directories should stay under `tools/studio-cut-local/output/`
or `/tmp`; that output path is ignored by git.

Create a one-folder Rescue Sync session for real episode work:

```bash
python tools/studio-cut-local/studio_cut_local.py rescue-sync-session \
  --episode-id episode-004 \
  --title "Episode 004" \
  --episode-dir ~/Movies/StudioCut/episode-004
```

The command creates this local workspace:

```text
~/Movies/StudioCut/episode-004/
  inbox/
  generated/
  edit/checkpoints/
  renders/
```

Drop files into `inbox/` with predictable names:

- `homer-video.mov`
- `charlie-video.mov`
- `homer-audio.wav`
- `charlie-audio.wav`
- `phone-reference-01.m4a`
- `phone-reference-02.m4a`
- `clip-video.mp4` when present

Then rerun the same command. When required files are present it writes
`generated/sync-job.json`, `generated/local-media-map.json`, and runs the local
Rescue Sync worker to produce:

- `generated/sync-report.json`
- `generated/sync-map.json`
- `generated/episode-manifest.json`
- `generated/source-monitor-proxy.mp4`
- `generated/aligned-proxies/`

Use `--skip-worker` to only scaffold and inspect the workspace. The workspace
should live outside the repo for real episodes. Generated JSON may contain local
paths; source media, proxies, reports, decisions, and renders must not be
committed.

Inspect the workspace at any time:

```bash
python tools/studio-cut-local/studio_cut_local.py rescue-sync-status \
  --episode-dir ~/Movies/StudioCut/episode-004
```

The status report shows:

- required inbox files found/missing
- generated sync job, local media map, Sync Map, manifest, proxy, and report
- source-monitor proxy duration/resolution when `ffprobe` is available
- decision count and rough render readiness when exported decisions are present
- the exact next command the operator or assistant should run

After publishing a generated package in the web app, check `Shared Room
Diagnostics` and `Sync Review`. `Sync Review` should show the attached Sync Map
job id, canonical duration, reference pieces, offset count, confidence, and
warning count. If it reports a missing or failed Sync Map, republish or fix
Storage/rules before treating the room as ready for real collaboration.

Validate a generated Rescue Sync package before publishing:

```bash
python tools/studio-cut-local/studio_cut_local.py validate-generated-package \
  --manifest ~/Movies/StudioCut/episode-004/generated/episode-manifest.json \
  --proxy ~/Movies/StudioCut/episode-004/generated/source-monitor-proxy.mp4 \
  --sync-map ~/Movies/StudioCut/episode-004/generated/sync-map.json \
  --sync-report ~/Movies/StudioCut/episode-004/generated/sync-report.json
```

This checks JSON shape, manifest/Sync Map compatibility, proxy duration and
resolution, sync report job id, local-path leakage, and prints the exact
publish checklist plus expected `Sync Review` confirmation. The same command is
available through pnpm:

```bash
pnpm studio-cut:local:validate-package -- \
  --manifest ~/Movies/StudioCut/episode-004/generated/episode-manifest.json \
  --proxy ~/Movies/StudioCut/episode-004/generated/source-monitor-proxy.mp4 \
  --sync-map ~/Movies/StudioCut/episode-004/generated/sync-map.json \
  --sync-report ~/Movies/StudioCut/episode-004/generated/sync-report.json
```

Machine-readable status:

```bash
python tools/studio-cut-local/studio_cut_local.py rescue-sync-status \
  --episode-dir ~/Movies/StudioCut/episode-004 \
  --json
```

Validate a generated manifest and local media map before rendering:

```bash
python tools/studio-cut-local/studio_cut_local.py validate-episode-files \
  --manifest tools/studio-cut-local/output/episode-004-bootstrap/episode-004-episode-manifest.json \
  --media-map tools/studio-cut-local/output/episode-004-bootstrap/episode-004-local-media.json
```

The same command is available through pnpm with argument forwarding:

```bash
pnpm studio-cut:local:verify-episode -- \
  --manifest tools/studio-cut-local/output/episode-004-bootstrap/episode-004-episode-manifest.json \
  --media-map tools/studio-cut-local/output/episode-004-bootstrap/episode-004-local-media.json
```

`validate-episode-files` checks manifest/media-map parsing, episode id match,
referenced local file existence, `ffmpeg`/`ffprobe` availability, and inspected
media durations against the manifest duration with a default `1500` ms
tolerance. Duration drift is a warning so operators can decide whether encoder
rounding is acceptable before rendering.

After Studio Cut decisions are exported, include `--decisions` to check render
readiness and print the exact rough 16:9 render command:

```bash
python tools/studio-cut-local/studio_cut_local.py validate-episode-files \
  --manifest tools/studio-cut-local/output/episode-004-bootstrap/episode-004-episode-manifest.json \
  --media-map tools/studio-cut-local/output/episode-004-bootstrap/episode-004-local-media.json \
  --decisions tools/studio-cut-local/output/episode-004-bootstrap/episode-004-decisions.json
```

The readiness report prints `Status: READY` or `Status: BLOCKED`, exact missing
paths, decision count, `Cut` count, active duration, expected output duration,
and warnings for no decision at `0:00` or Clip states without `video.clip`.

Create a dry-run render plan from placeholder examples:

```bash
python tools/studio-cut-local/studio_cut_local.py plan-render \
  --manifest tools/studio-cut-local/examples/episode-manifest.placeholder.json \
  --decisions tools/studio-cut-local/examples/studio-cut-decisions.placeholder.json \
  --profile youtube_16x9
```

Write a render plan JSON locally:

```bash
python tools/studio-cut-local/studio_cut_local.py plan-render \
  --manifest path/to/episode-manifest.json \
  --decisions path/to/studio-cut-decisions.json \
  --profile youtube_16x9 \
  --out /tmp/studio-cut-render-plan.json
```

Explain a render profile without loading episode files:

```bash
python tools/studio-cut-local/studio_cut_local.py explain-profile \
  --profile youtube_16x9
```

Render a rough proxy preview that skips `Cut` spans:

```bash
python tools/studio-cut-local/studio_cut_local.py render-proxy-preview \
  --manifest path/to/episode-manifest.json \
  --decisions path/to/studio-cut-decisions.json \
  --proxy path/to/source-monitor-proxy.mp4 \
  --out /tmp/studio-cut-preview.mp4
```

`render-proxy-preview` requires `ffmpeg` on `PATH`. It trims active spans from
the local source-monitor proxy and concatenates them into a rough review file.
It does not crop Homer, Charlie, or Clip panes yet.

Dry-run a rough 16:9 render from timeline-aligned local media:

```bash
python tools/studio-cut-local/studio_cut_local.py render-youtube-16x9-aligned \
  --manifest tools/studio-cut-local/examples/episode-manifest.placeholder.json \
  --decisions tools/studio-cut-local/examples/studio-cut-decisions.placeholder.json \
  --media-map tools/studio-cut-local/examples/local-media.placeholder.json \
  --out /tmp/studio-cut-placeholder-output.mp4 \
  --dry-run
```

Run the same command without `--dry-run` against real local media paths:

```bash
python tools/studio-cut-local/studio_cut_local.py render-youtube-16x9-aligned \
  --manifest path/to/episode-manifest.json \
  --decisions path/to/studio-cut-decisions.json \
  --media-map path/to/episode-004-local-media.json \
  --out /tmp/studio-cut-youtube-16x9.mp4
```

Render from a Rescue Sync `Sync Map` plus original local assets:

```bash
python tools/studio-cut-local/studio_cut_local.py render-from-sync-map \
  --sync-map path/to/sync-map.json \
  --decisions path/to/studio-cut-decisions.json \
  --media-map path/to/sync-map-local-media.json \
  --out /tmp/studio-cut-sync-map-youtube-16x9.mp4 \
  --dry-run
```

The Sync Map media map can point at local originals by input id:

```json
{
  "schemaVersion": 1,
  "episodeId": "episode-004",
  "timelineAligned": false,
  "inputs": {
    "episode-004-homer-video": "/path/to/homer-original-or-proxy.mp4",
    "episode-004-charlie-video": "/path/to/charlie-original-or-proxy.mp4",
    "episode-004-clip-video": "/path/to/clip-original-or-proxy.mp4"
  },
  "audio": {
    "program": "/path/to/program-audio-canonical-aligned.wav"
  }
}
```

`render-from-sync-map` interprets Studio Cut decision `sourceTimeMs` values as
canonical episode timeline time, translates each active span through the Sync
Map into asset-local time, applies the rough `youtube_16x9` layouts, and skips
`Cut` spans. It does not mutate source files. If a mapped asset is not visible
for part of a requested span, the first renderer pads that role with black
inside the segment. `audio.program`, when supplied, is currently expected to be
canonical-timeline aligned; otherwise the renderer writes silent audio.

Run the agentic end-to-end smoke test:

```bash
python tools/studio-cut-local/studio_cut_local.py agent-smoke-test
```

Machine-readable report:

```bash
python tools/studio-cut-local/studio_cut_local.py agent-smoke-test --json
```

Keep generated synthetic files for inspection:

```bash
python tools/studio-cut-local/studio_cut_local.py agent-smoke-test \
  --keep-workdir \
  --workdir tools/studio-cut-local/output/agent-smoke
```

Run the full CI-friendly Studio Cut verification command from the repo root:

```bash
pnpm studio-cut:verify
```

This command compiles the local Python CLI, runs `agent-smoke-test --json`,
runs Studio Cut typecheck, runs the Playwright browser smoke, and builds the
Studio Cut web app.

The same command runs in GitHub Actions from
`.github/workflows/studio-cut-verify.yml` on relevant Studio Cut pushes and pull
requests. The workflow verifies only; it does not deploy and does not require
Firebase secrets.

The browser smoke can also run directly:

```bash
pnpm studio-cut:web-smoke
```

It launches the Studio Cut Vite dev server without Firebase env vars and checks
that the browser editor can create semantic decisions, derive segments, expose
program playback controls, and preserve localStorage state after reload. If the
Playwright browser is missing locally, run `pnpm exec playwright install chromium`
once.

On failure, it writes inspection artifacts to:

```text
tools/studio-cut-local/output/web-smoke-artifacts
```

Each failed run gets a timestamped directory with screenshot, page HTML,
browser console/page errors, dev-server log, failure summary, and a Playwright
trace when available. Override the location with
`STUDIO_CUT_WEB_SMOKE_ARTIFACT_DIR=/path/to/artifacts`. The default path is
ignored by git.

In GitHub Actions, failed verifier runs upload that directory as the artifact:

```text
studio-cut-web-smoke-artifacts
```

Download it from the failed Actions run summary before debugging browser smoke
failures.

## Render Profiles

`plan-render` now attaches profile-aware layout intent to each active segment:

- program state
- source time in/out
- duration
- intended layout behavior
- future full-resolution render notes

Current `youtube_16x9` mapping:

| State | 16:9 behavior |
| --- | --- |
| `charlie` | Charlie full frame |
| `homer` | Homer full frame |
| `both` | Side-by-side hosts |
| `charlie_clip` | Charlie plus clip |
| `homer_clip` | Homer plus clip |
| `both_clip` | Both hosts plus clip |
| `cut` | Skipped |

`proxy_preview` remains intentionally simple. It trims and concatenates the
whole source-monitor proxy for every active non-`Cut` span, without pane
cropping. Use `youtube_16x9` planning to inspect future full-res layout intent.

`render-youtube-16x9-aligned` uses that `youtube_16x9` plan and renders rough
rectangles from local media files that already start at sequence time
`00:00:00` and share the same timeline duration:

- `charlie`: Charlie full frame
- `homer`: Homer full frame
- `both`: Homer and Charlie side by side
- `charlie_clip`: Charlie and Clip side by side
- `homer_clip`: Homer and Clip side by side
- `both_clip`: Homer/Charlie stacked left, Clip large right
- `cut`: skipped

This command still avoids Premiere XML/EDL parsing. Premiere owns alignment for
now by exporting timeline-aligned local files.

`render-from-sync-map` is the first original-asset handoff renderer. It takes a
Rescue Sync `Sync Map`, Studio Cut decision JSON, and a local media map keyed by
Sync Map `inputId`. It renders the same rough `youtube_16x9` layouts by
translating canonical episode timeline spans into asset-local time. That means
the browser can edit against a synced proxy room while local rendering can start
from the original or higher-quality local assets. The command is still v0:
program audio must already be canonical-timeline aligned if supplied, and final
full-res quality/crop polish remains future work.

## Agent Smoke Test

`agent-smoke-test` is the workflow canary for Codex and future agents. It uses
synthetic media only and proves the Studio Cut path can be driven by files and
commands, without browser clicking or private media:

```text
synthetic media -> manifest -> decisions -> plan-render -> render-youtube-16x9-aligned -> render-from-sync-map -> output validation
```

The generated decisions exercise:

- `both`
- `charlie`
- `cut`
- `homer`
- `charlie_clip`
- `both_clip`

The validation checks that a render plan is written, the output MP4 exists, the
rendered output is shorter than the source because the `Cut` span was skipped,
and the output resolution is `1920x1080` when `ffprobe` is available. It runs
`validate-episode-files` against the generated synthetic manifest/media map so
future agents also cover the real-episode readiness check. It also checks
embedded golden assertions for the semantic render plan:

- source duration is `12000` ms
- `Cut` duration is `2000` ms
- active duration is `10000` ms
- active states are `both`, `charlie`, `homer`, `charlie_clip`, `both_clip`
- no active segment is `cut`
- each active segment has profile planning and expected `youtube_16x9` layout
  behavior

Run this before and after renderer changes. Use `--skip-render` when `ffmpeg` is
not available and you only need to validate structured file generation and
planning. The JSON report includes `goldenAssertionsPassed`,
`goldenAssertionCount`, and `goldenAssertionFailures` so future agents can fail
fast on semantic drift.

For renderer or editor changes, future agents should run the combined command
before deploy:

```bash
pnpm studio-cut:verify
```

Use `pnpm studio-cut:web-smoke` when the change only needs browser cockpit
coverage. Use the full verifier before deploying.

## Inputs

- Episode Manifest JSON from the Premiere bootstrap workflow.
- Studio Cut decision JSON exported from the web app.
- Optional local source-monitor proxy video for proxy preview rendering.
- Optional local media map JSON for aligned full-output rendering.

For Episode 4 real-use steps, use:

```text
docs/studio-cut-episode-4-runbook.md
```

For real episodes, start with `create-episode-bootstrap` to avoid hand-writing
the manifest and local media map. Fill in the generated media map with local
timeline-aligned media paths before rendering:

- `REPLACE_WITH_HOMER_ALIGNED_PATH`
- `REPLACE_WITH_CHARLIE_ALIGNED_PATH`
- `REPLACE_WITH_CLIP_ALIGNED_PATH`
- `REPLACE_WITH_PROGRAM_AUDIO_PATH`

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

`audio.program` is optional. If it is missing, the aligned renderer creates
silent audio and prints a warning. Relative paths are resolved from the media
map file's directory.

Do not put real media paths, generated previews, private episode notes, or
personal recordings in this directory.
