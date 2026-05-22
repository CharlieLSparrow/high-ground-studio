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

## Inputs

- Episode Manifest JSON from the Premiere bootstrap workflow.
- Studio Cut decision JSON exported from the web app.
- Optional local source-monitor proxy video for proxy preview rendering.

Do not put real media paths, generated previews, private episode notes, or
personal recordings in this directory.
