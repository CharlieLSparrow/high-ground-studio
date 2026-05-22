# Studio Cut Episode 4 Runbook

Date: 2026-05-22

This is the primary real-use path for Episode 4:

```text
Premiere exports aligned media and source-monitor proxy -> create bootstrap files -> Charlie creates shared room -> Mako opens room link -> both tag live -> Charlie exports decisions/checkpoint -> render rough 16:9 output locally
```

Studio Cut decisions stay semantic. Local media stays on Charlie's machine. Do
not commit real media, proxy files, private paths, rendered outputs, credentials,
or generated real-episode JSON.

## 1. Premiere Export Checklist

In Premiere, create the synced source truth for Episode 4. Every aligned export
must start at sequence time `00:00:00` and share the same sequence duration.

Export these local files:

```text
episode-004_homer_aligned.mp4
episode-004_charlie_aligned.mp4
episode-004_clip_aligned.mp4
episode-004_program-audio_aligned.wav
episode-004_source-monitor-proxy.mp4
episode-004_premiere-export.xml
```

Notes:

- `episode-004_clip_aligned.mp4` is optional if the episode has no shared clip
  track, but tonight's template includes it by default.
- `episode-004_program-audio_aligned.wav` should be the synced clean program
  audio mix. If it is missing, the rough aligned renderer can produce silent
  audio, but that is only useful for visual checks.
- `episode-004_source-monitor-proxy.mp4` is the lightweight composite video for
  browser review. Charlie uploads this proxy once when creating the shared room;
  do not upload full-resolution aligned media.
- `episode-004_premiere-export.xml` is optional for tonight because the renderer
  does not parse XML yet, but keeping it next to the exports preserves the sync
  reference for later work.

## 2. Calculate `durationMs`

Prefer measuring the exported source-monitor proxy or program audio after export:

```bash
ffprobe -v error -show_entries format=duration \
  -of default=noprint_wrappers=1:nokey=1 \
  /path/to/episode-004_source-monitor-proxy.mp4
```

Multiply the seconds by `1000` and round to the nearest integer. Example:

```text
600.000000 seconds -> 600000 durationMs
```

If Premiere shows the exact sequence duration another way, use the same source
duration in milliseconds. The validator below will warn if exported media
durations drift from the manifest by more than `1500` ms.

## 3. Create Bootstrap Files

From the repo root:

```bash
python tools/studio-cut-local/studio_cut_local.py create-episode-bootstrap \
  --episode-id episode-004 \
  --title "Episode 004" \
  --duration-ms REPLACE_WITH_DURATION_MS \
  --out-dir tools/studio-cut-local/output/episode-004-bootstrap
```

Generated files:

```text
tools/studio-cut-local/output/episode-004-bootstrap/episode-004-episode-manifest.json
tools/studio-cut-local/output/episode-004-bootstrap/episode-004-local-media.json
tools/studio-cut-local/output/episode-004-bootstrap/README.md
```

`tools/studio-cut-local/output/` is ignored by git. Keep real Episode 4 files
there or under `/tmp`.

## 4. Fill `episode-004-local-media.json`

Open:

```text
tools/studio-cut-local/output/episode-004-bootstrap/episode-004-local-media.json
```

Replace the placeholders with local export paths:

```json
{
  "schemaVersion": 1,
  "episodeId": "episode-004",
  "timelineAligned": true,
  "video": {
    "homer": "/path/to/episode-004_homer_aligned.mp4",
    "charlie": "/path/to/episode-004_charlie_aligned.mp4",
    "clip": "/path/to/episode-004_clip_aligned.mp4"
  },
  "audio": {
    "program": "/path/to/episode-004_program-audio_aligned.wav"
  }
}
```

If there is no Clip track, either create the bootstrap with `--include-clip false`
or remove the `clip` path from the media map before rendering. Decisions that
use `Charlie/Clip`, `Homer/Clip`, or `Both/Clip` require a Clip video path.

Validate before rendering:

```bash
pnpm studio-cut:local:verify-episode -- \
  --manifest tools/studio-cut-local/output/episode-004-bootstrap/episode-004-episode-manifest.json \
  --media-map tools/studio-cut-local/output/episode-004-bootstrap/episode-004-local-media.json
```

The report should say `Status: READY`. Duration warnings mean a file does not
match the manifest closely enough; review the export before rendering.

## 5. Create The Shared Room

Open the deployed editor:

```text
https://high-ground-odyssey.web.app
```

Steps:

1. Sign in with an allowed Google account.
2. Import `episode-004-episode-manifest.json`.
3. Click `Load Local Proxy Video`.
4. Select `episode-004_source-monitor-proxy.mp4` from the local export folder.
5. Confirm `projectId=episode-004` and `branchId=main` in Collaboration Mode,
   or switch the room before uploading.
6. Click `Create Shared Room`.
7. Check `Shared Room Diagnostics`. It should show room metadata loaded, shared
   proxy loaded, connected listeners, and no Storage errors.
8. Copy the generated room link. It should look like:

```text
https://high-ground-odyssey.web.app/?projectId=episode-004&branchId=main
```

9. Send the link to Mako.

The shared package writes manifest metadata to Firestore and uploads only the
lightweight source-monitor proxy to Firebase Storage. It does not upload
full-resolution aligned media, local filesystem paths, object URLs, credentials,
or generated renders.

Before trusting private collaboration data in the shared room, confirm that
Firestore and Storage rules have been emulator-tested and deployed. JSON
checkpoints remain the recovery path.

## 6. Edit Together In Studio Cut

Charlie can keep editing in the same tab. Mako should:

1. Open the shared room link.
2. Sign in with an approved `@highgroundodyssey.com` Google account.
3. Wait for the manifest, shared proxy, decisions, and presence to load.
4. Check Shared Room Diagnostics for loaded metadata/proxy and connected
   listeners.
5. Scrub, play, and tag decisions in the shared room.

Neither Mako nor Charlie need JSON import/export for the primary collaboration
flow. JSON export/checkpoint is still the recovery path before rendering.

Operator checks while editing:

1. Use Source Scrub to inspect the full source timeline, including `Cut` spans.
2. Confirm the Program Preview says `Proxy Program Preview`; it should crop the
   local source-monitor proxy into the current semantic layout.
3. Check the Episode Readiness panel. It should show the manifest and proxy
   loaded, decision and `Cut` counts, and the expected export filename.
4. If the preview crops are wrong, open `Proxy Pane Calibration`, adjust
   normalized pane rectangles, then use `Export Adjusted Manifest` and keep that
   adjusted manifest with the local Episode 4 bootstrap files.
5. Use Program Playback to simulate output playback with `Cut` spans skipped.
6. Tag semantic state decisions.
7. Watch the Decision Timeline. Colored source-time blocks should match the
   derived segments; click a block to jump to its in-point.
8. Use `Save Local Checkpoint` during a messy pass if you want an in-browser
   restore point.
9. Use `Export Checkpoint` before any risky cleanup/import pass or before
   leaving the machine.
10. Export final decision JSON before rendering.
11. Save or move the downloaded decision file to:

```text
tools/studio-cut-local/output/episode-004-bootstrap/episode-004-decisions.json
```

In local backup mode, the browser reads the proxy file with an object URL. In
shared-room mode, approved editors load the lightweight proxy from Firebase
Storage. Full-resolution aligned media still stays local for rendering.

Keyboard shortcuts for tagging:

```text
1 Charlie
2 Homer
3 Both
4 Charlie/Clip
5 Homer/Clip
6 Both/Clip
X Cut
Space Play/Pause
Left/Right scrub 1s
Shift+Left/Shift+Right scrub 10s
Cmd/Ctrl+Z undo
Cmd/Ctrl+Shift+Z redo
Cmd/Ctrl+Y redo
Backspace/Delete remove active or latest decision
```

The Current Segment panel should match what Charlie expects before each tag.
When the imported manifest id is `episode-004`, the export download name should
default to `episode-004-decisions.json`.

Undo/redo covers local decision edits: add, remove, clear, and import. The
history stack is browser-local and bounded. It is meant to make a fast tagging
pass less fragile, not to replace exported checkpoints.

Local checkpoints are also browser-local and capped to the newest 12 snapshots.
Use them for quick restore during the session. Use exported checkpoints for
durable rollback outside the current browser.

Checkpoint exports are decision-layer snapshots only. With manifest id
`episode-004`, checkpoint filenames look like:

```text
episode-004-checkpoint-2026-05-21-1730.json
```

They do not include media, proxy files, object URLs, credentials, or full source
paths.

Pane calibration exports are manifest metadata only. With manifest id
`episode-004`, the adjusted manifest download is:

```text
episode-004-adjusted-manifest.json
```

Use that adjusted manifest in later sessions if it makes the browser Program
Preview crop correctly.

Browser proxy layouts:

- `Charlie`: Charlie pane full preview
- `Homer`: Homer pane full preview
- `Both`: Homer and Charlie side by side
- `Charlie/Clip`: Charlie and Clip side by side
- `Homer/Clip`: Homer and Clip side by side
- `Both/Clip`: Homer/Charlie stacked left, Clip large right
- `Cut`: inactive/skipped visual state

This is a browser-only confidence preview from the local source-monitor proxy.
The local render CLI remains final truth for rough 16:9 output.

## 7. Dry-Run Render

First rerun validation with decisions:

```bash
pnpm studio-cut:local:verify-episode -- \
  --manifest tools/studio-cut-local/output/episode-004-bootstrap/episode-004-episode-manifest.json \
  --media-map tools/studio-cut-local/output/episode-004-bootstrap/episode-004-local-media.json \
  --decisions tools/studio-cut-local/output/episode-004-bootstrap/episode-004-decisions.json
```

The report should say `Status: READY`, include decision and active-duration
metrics, and print the exact render command. If it says `Status: BLOCKED`, fix
the listed missing paths or JSON issues before rendering.

Run this first:

```bash
python tools/studio-cut-local/studio_cut_local.py render-youtube-16x9-aligned \
  --manifest tools/studio-cut-local/output/episode-004-bootstrap/episode-004-episode-manifest.json \
  --decisions tools/studio-cut-local/output/episode-004-bootstrap/episode-004-decisions.json \
  --media-map tools/studio-cut-local/output/episode-004-bootstrap/episode-004-local-media.json \
  --out tools/studio-cut-local/output/episode-004-bootstrap/episode-004-youtube-16x9.mp4 \
  --dry-run
```

The dry run prints the active segment plan and ffmpeg commands. It does not
write a render.

## 8. Real Rough 16:9 Render

When the dry run looks right:

```bash
python tools/studio-cut-local/studio_cut_local.py render-youtube-16x9-aligned \
  --manifest tools/studio-cut-local/output/episode-004-bootstrap/episode-004-episode-manifest.json \
  --decisions tools/studio-cut-local/output/episode-004-bootstrap/episode-004-decisions.json \
  --media-map tools/studio-cut-local/output/episode-004-bootstrap/episode-004-local-media.json \
  --out tools/studio-cut-local/output/episode-004-bootstrap/episode-004-youtube-16x9.mp4
```

This renders simple 16:9 layouts from timeline-aligned local media and skips
`Cut` spans. It does not mutate source files.

## Troubleshooting

- `Status: BLOCKED` in validation: fix the listed missing files, JSON parse
  errors, or episode id mismatch before rendering.
- Duration warnings: confirm every Premiere export starts at sequence time
  `00:00:00` and uses the same sequence end. Small encoder rounding is expected;
  large drift is not.
- `ffmpeg not found`: install ffmpeg and ensure `ffmpeg` and `ffprobe` are on
  `PATH`.
- No Clip media: avoid clip states in Studio Cut, or recreate the bootstrap with
  `--include-clip false`.
- Browser sign-in fails: confirm the Firebase Google provider is enabled and
  the account is listed in `VITE_STUDIO_CUT_ALLOWED_EMAILS` for the deployed
  build.
- Local proxy does not persist after refresh: expected. Re-select the proxy file;
  the browser never uploads or stores it.
- Render looks compositionally rough: expected for tonight. The aligned renderer
  uses simple rectangles and semantic states; full-res polish belongs in later
  render profile work.
