# Quipsly Mac source hydration + proxy queue

Quipsly Mac separates three jobs that used to get blurred together:

1. Source hydration: confirm the original media is actually local, not just a cloud-backed placeholder or symlink.
2. Proxy generation: make a lightweight editor proxy for everyday playback.
3. Session relinking: point local episode playback at the proxy only after the proxy exists.

The original source remains the export/source-of-truth path. The proxy is the edit/playback path.

## Current workflow

1. Open Quipsly Mac.
2. Go to Media Engine.
3. Use Scan current episode or Scan Episodes 1-3.
4. For each source group:
   - Source local means proxy generation is allowed.
   - Needs download means reveal the file in Finder and make it available offline first.
   - Partially local means the file has started materializing but is not safe to proxy yet.
   - Missing source means the path no longer resolves on this Mac.
   - Proxy ready means the local episode can use the proxy for playback.
5. Use Generate next ready proxy only when the queue shows a local-ready video source.

## Hydration and vaulting

Cloud-backed originals should be handled deliberately:

1. Use Reveal first download or a row Source button.
2. In Finder, make the file available offline.
3. Rescan the queue.
4. When the source becomes Source local, optionally use Vault to copy the original into the external Quipsly workspace.
5. Generate the proxy.

Vaulting is explicit because originals can be huge. Quipsly should not silently copy a 20-80 GB file just because the editor opened a timeline.

## Safety rules

- Never run multiple proxy jobs against the same workspace at once.
- Use a workspace lock before ffmpeg starts.
- Write ffmpeg output to a per-process partial file.
- Do not mutate the local episode session until ffmpeg exits cleanly and the final proxy exists.
- Back up the local episode session before relinking playback paths.
- Do not copy huge originals automatically as part of first-pass proxy generation. Source vaulting is a separate workflow.
- Vaulting is user-triggered. It copies the original into `source-originals` and backs up the local episode session before relinking source paths.

## Storage shape

Default external workspace:

```text
/Volumes/My Passport/Quipsly Media Workspace
```

Proxy cache:

```text
media-cache/proxies/<projectSlug>/<episodeSlug>/<sourceAssetId>/<source>.proxy.mp4
```

Future source vault:

```text
source-originals/<projectSlug>/<episodeSlug>/<sourceAssetId>/<original filename>
```

## Why this exists

Cloud storage paths can return true for file existence while still being unsafe for ffmpeg. A Google Drive or iCloud placeholder can have a logical file size but zero local blocks. The queue makes that visible before Quipsly starts a long media job.
