# Studio Cut Morning Handoff

Date: 2026-05-22

This is the morning operator brief for the current Studio Cut Episode 4 path.
It contains no private paths, media, credentials, or real episode data.

## What Works Now

- Deployed Studio Cut web editor: <https://high-ground-odyssey.web.app>
- Firebase Auth gate with exact-email and `@highgroundodyssey.com` domain
  allow rules.
- Experimental Firestore collaboration rooms with realtime decision events,
  tombstoned cloud removes, and presence.
- Primary shared-room workflow: Charlie can upload the Episode Manifest plus one
  lightweight source-monitor proxy package, then share a room link with Mako.
- Rescue Sync intake foundation: Charlie can model/upload raw Homer, Charlie,
  clean audio, multi-piece phone/reference audio, optional clip, and optional
  other files into `studioCutSyncJobs/{syncJobId}`. The actual sync worker is
  still scaffold only.
- Shared Room Diagnostics shows metadata/proxy/listener/Storage status for the
  active room.
- Firestore and Storage rules are wired into `firebase.json` and have an
  emulator test command, but rules deploy remains separate from Hosting.
- Episode Manifest import with Premiere bootstrap metadata.
- Browser-local source-monitor proxy playback for backup/local mode, plus
  Firebase Storage proxy loading for shared rooms.
- Proxy Program Preview layouts from manifest pane rectangles.
- Proxy Pane Calibration with adjusted manifest export.
- Keyboard tagging shortcuts, current segment summary, source scrub, and
  cut-skipping Program Playback.
- Undo/redo for local decision edits and timestamped checkpoint exports.
- Browser-local checkpoint library with restore, export, and delete actions.
- Episode Readiness and Decision Timeline panels for handoff confidence.
- Decision JSON import/export with manifest-aware filenames.
- Collaboration Mode can switch project/branch rooms; selected room is stored
  locally in the browser.
- Local render CLI with bootstrap creation, file validation, render planning,
  proxy preview rendering, rough aligned `youtube_16x9` rendering, and synthetic
  agent smoke verification.
- Local cloud sync worker stub that validates a sync job and emits a placeholder
  multi-piece reference rail report.
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

Rules deploy is separate and should happen only after the emulator rules test
passes:

```bash
pnpm studio-cut:rules-test
firebase deploy --project high-ground-odyssey --only firestore:rules,storage
```

## Episode 4 Commands

Rescue Sync direction, once rules/security and retention are ready for raw
uploads:

1. Open Studio Cut and confirm the `episode-004 / main` room.
2. In `Cloud Sync Intake`, select Homer video, Charlie video, Homer clean audio,
   Charlie clean audio, and every phone/reference piece.
3. Set phone/reference `orderIndex` values in the intended rail order.
4. Click `Create Sync Job / Upload Raw Assets`.
5. Wait for a future worker to create the shared room. This worker is not live
   yet, so use the prepared-package fallback below for real editing today.

Local worker stub:

```bash
python tools/studio-cut-cloud-sync/cloud_sync_worker.py \
  --sync-job-json tools/studio-cut-cloud-sync/examples/sync-job.placeholder.json \
  --out /tmp/studio-cut-rescue-sync-report.placeholder.json
```

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
4. Confirm the `episode-004 / main` room in Collaboration Mode.
5. Click `Create Shared Room`.
6. Copy the link, for example
   `https://high-ground-odyssey.web.app/?projectId=episode-004&branchId=main`.
7. Mako opens that link, signs in with an approved High Ground Odyssey Google
   account, and edits without importing JSON or loading local media.
8. Calibrate panes if crops are off, then export an adjusted manifest.
9. Tag decisions live.
10. Export checkpoints during risky passes.
11. Export final decisions to the bootstrap directory before rendering.

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
- Local checkpoint library entries are browser-local and capped to the newest
  12 snapshots.
- Pane calibration is metadata-only and localStorage-backed until an adjusted
  manifest is exported.
- The web Program Preview is a browser confidence preview, not final render
  truth.
- The rough aligned renderer assumes Premiere exported timeline-aligned media
  starting at sequence time `00:00:00`.
- The renderer does not parse Premiere XML/EDL yet.
- Firestore collaboration is experimental, and branch history is still shallow;
  do not trust sensitive collaboration data in Firestore/Storage until
  `pnpm studio-cut:rules-test` passes and rules are deployed.
- Shared rooms upload only source-monitor proxies. Full-resolution aligned
  media remains local for render.
- Rescue Sync raw uploads can be large and should not be used with sensitive
  footage until rules have passed emulator tests and lifecycle cleanup exists.
- Rescue Sync worker output is placeholder-only; it does not run waveform
  extraction, correlation, manifest generation, or proxy generation yet.
- The emulator rules test requires Java. If Java is missing locally, install a
  JRE/JDK before deploying rules.
- Multiplayer undo is not global. Undo/redo remains browser-local; exported
  checkpoints remain the durable rollback path.

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
- Firestore branch history UX and security-rule tests
- render plan references to branch/checkpoint ids
