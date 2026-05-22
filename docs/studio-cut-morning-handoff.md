# Studio Cut Morning Handoff

Date: 2026-05-22

This is the morning operator brief for the current Studio Cut Episode 4 path.
It contains no private paths, media, credentials, or real episode data.

## What Works Now

- Deployed Studio Cut web editor: <https://high-ground-odyssey.web.app>
- Firebase Auth gate with allowed-email build config.
- Episode Manifest import with Premiere bootstrap metadata.
- Browser-local source-monitor proxy playback. The proxy file is not uploaded,
  persisted, or written into decision JSON.
- Proxy Program Preview layouts from manifest pane rectangles.
- Proxy Pane Calibration with adjusted manifest export.
- Keyboard tagging shortcuts, current segment summary, source scrub, and
  cut-skipping Program Playback.
- Undo/redo for local decision edits and timestamped checkpoint exports.
- Episode Readiness and Decision Timeline panels for handoff confidence.
- Decision JSON import/export with manifest-aware filenames.
- Local render CLI with bootstrap creation, file validation, render planning,
  proxy preview rendering, rough aligned `youtube_16x9` rendering, and synthetic
  agent smoke verification.
- One-command verifier: `pnpm studio-cut:verify`.
- GitHub Actions verification workflow. CI verifies only and does not deploy.

## Branch And Verification

From repo root:

```bash
git branch --show-current
git status --short --branch --untracked-files=all
pnpm studio-cut:verify
```

Expected branch:

```text
codex/studio-cut-001-web-shell
```

Deploy is operator-local for now:

```bash
firebase deploy --project high-ground-odyssey --only hosting
```

## Episode 4 Commands

Create bootstrap files after calculating the real duration in milliseconds:

```bash
python tools/studio-cut-local/studio_cut_local.py create-episode-bootstrap \
  --episode-id episode-004 \
  --title "Episode 004" \
  --duration-ms REPLACE_WITH_DURATION_MS \
  --out-dir tools/studio-cut-local/output/episode-004-bootstrap
```

Validate manifest and local media map after filling paths:

```bash
pnpm studio-cut:local:verify-episode -- \
  --manifest tools/studio-cut-local/output/episode-004-bootstrap/episode-004-episode-manifest.json \
  --media-map tools/studio-cut-local/output/episode-004-bootstrap/episode-004-local-media.json
```

Open Studio Cut:

```text
https://high-ground-odyssey.web.app
```

In the browser:

1. Sign in with an allowed Google account.
2. Import the Episode Manifest.
3. Load the local source-monitor proxy.
4. Calibrate panes if crops are off, then export an adjusted manifest.
5. Tag decisions.
6. Export checkpoints during risky passes.
7. Export final decisions to the bootstrap directory.

Validate render readiness after exporting decisions:

```bash
pnpm studio-cut:local:verify-episode -- \
  --manifest tools/studio-cut-local/output/episode-004-bootstrap/episode-004-episode-manifest.json \
  --media-map tools/studio-cut-local/output/episode-004-bootstrap/episode-004-local-media.json \
  --decisions tools/studio-cut-local/output/episode-004-bootstrap/episode-004-decisions.json
```

Dry-run rough render:

```bash
python tools/studio-cut-local/studio_cut_local.py render-youtube-16x9-aligned \
  --manifest tools/studio-cut-local/output/episode-004-bootstrap/episode-004-episode-manifest.json \
  --decisions tools/studio-cut-local/output/episode-004-bootstrap/episode-004-decisions.json \
  --media-map tools/studio-cut-local/output/episode-004-bootstrap/episode-004-local-media.json \
  --out tools/studio-cut-local/output/episode-004-bootstrap/episode-004-youtube-16x9.mp4 \
  --dry-run
```

Real rough render:

```bash
python tools/studio-cut-local/studio_cut_local.py render-youtube-16x9-aligned \
  --manifest tools/studio-cut-local/output/episode-004-bootstrap/episode-004-episode-manifest.json \
  --decisions tools/studio-cut-local/output/episode-004-bootstrap/episode-004-decisions.json \
  --media-map tools/studio-cut-local/output/episode-004-bootstrap/episode-004-local-media.json \
  --out tools/studio-cut-local/output/episode-004-bootstrap/episode-004-youtube-16x9.mp4
```

## Known Limitations

- Undo/redo is local/browser-only and bounded. Exported checkpoints are the
  durable rollback path.
- Pane calibration is metadata-only and localStorage-backed until an adjusted
  manifest is exported.
- The web Program Preview is a browser confidence preview, not final render
  truth.
- The rough aligned renderer assumes Premiere exported timeline-aligned media
  starting at sequence time `00:00:00`.
- The renderer does not parse Premiere XML/EDL yet.
- Firestore collaboration and branch history are not live; do not put private
  collaboration data into Firestore until rules and branch semantics are built.

## Rollback Pattern

For the newest Studio Cut commits from a sprint, revert in reverse order, then
verify, deploy, and push:

```bash
git revert <newest-studio-cut-commit>
git revert <previous-studio-cut-commit>
pnpm studio-cut:verify
firebase deploy --project high-ground-odyssey --only hosting
git push
```

Use the exact commit SHAs from the final Codex report for this sprint.

## Recommended Next Sprint

Build true branch/checkpoint management for the decision layer:

- named branches/checkpoints in JSON and localStorage
- duplicate branch from current decisions
- restore checkpoint into working set with undo history
- Firestore-ready branch paths and security-rule documentation
- render plan references to branch/checkpoint ids
