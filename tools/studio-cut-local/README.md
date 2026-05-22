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

## Inputs

- Episode Manifest JSON from the Premiere bootstrap workflow.
- Studio Cut decision JSON exported from the web app.
- Optional local source-monitor proxy video for proxy preview rendering.
- Optional local media map JSON for aligned full-output rendering.

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
