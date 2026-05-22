# Studio Cut Cloud Sync Worker Stub

This directory holds the first worker contract for raw-asset cloud intake and
Episode 4 Rescue Sync. It is not a production sync worker yet.

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

Run the local stub without cloud credentials:

```bash
python tools/studio-cut-cloud-sync/cloud_sync_worker.py \
  --sync-job-json tools/studio-cut-cloud-sync/examples/sync-job.placeholder.json \
  --out /tmp/studio-cut-cloud-sync-report.placeholder.json
```

The stub validates the JSON shape, prints planned FFmpeg/sync steps, and can
write a placeholder sync report with a reference rail. It sorts
`phoneReferenceAudio` inputs by `orderIndex`, then file name. It does not
process real media and does not start paid cloud resources.

Keep real episode assets, generated proxies, private paths, and credentials out
of git.
