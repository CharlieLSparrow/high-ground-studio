# Studio Cut Rescue Sync

Date: 2026-05-22

Rescue Sync is the Studio Cut path for messy episode intake. Episode 4 exposed
the immediate need: the phone/reference recording can arrive in multiple
pieces, which makes manual Premiere sync painful. Studio Cut now models those
pieces explicitly so a future sync worker can build a reference rail and prepare
the shared editing room.

## Product Rule

Charlie uploads messy assets. Studio Cut builds order from chaos. Mako opens a
shared room link and edits. Mako does not import JSON, load local media, or run
sync rituals.

## Multi-Piece Reference

`phoneReferenceAudio` supports multiple uploaded inputs. Each uploaded input has:

- `inputId`
- `role`
- `fileName`
- `storagePath`
- `contentType`
- `sizeBytes`
- optional `durationMs`
- `uploadedAt`
- optional `orderIndex`
- optional `notes`

The web UI lets Charlie add multiple phone/reference files and assign
`orderIndex` values. The future worker sorts reference pieces by
`orderIndex`, then file name, before creating the reference rail.

## Reference Rail

The reference rail is a continuous placeholder timeline assembled from the
phone/reference pieces:

```json
{
  "syncJobId": "episode-004-rescue-sync",
  "referenceRole": "phoneReferenceAudio",
  "segments": [
    {
      "inputId": "phone-reference-00",
      "fileName": "phone-part-01.m4a",
      "railStartMs": 0,
      "sourceStartMs": 0,
      "durationMs": 5000,
      "confidence": 0.1,
      "warnings": []
    }
  ],
  "totalDurationMs": 5000,
  "warnings": []
}
```

For this pass, the worker stub concatenates durations from metadata only. It
does not inspect waveform content yet.

## Sync Report

The Rescue Sync report contains:

- `syncJobId`
- `generatedAt`
- `status`
- `referenceRail`
- `trackOffsets`
- `globalWarnings`

`trackOffsets` will later hold the estimated sync offset and drift for Homer
video, Charlie video, clean audio tracks, clip video, and other inputs against
the reference rail.

## Current Implementation

Implemented now:

- schema/types for multi-input sync jobs
- validators for sync jobs, reference rails, and sync reports
- web intake UI with multiple phone/reference files and order controls
- Firebase Storage path helpers with sanitized per-input file paths
- Firestore sync job document scaffolding at `studioCutSyncJobs/{syncJobId}`
- local worker stub that validates a job and emits a placeholder reference rail
- helper tests included in `pnpm studio-cut:verify`

Scaffold only:

- actual waveform extraction
- cross-correlation
- offset/drift estimation
- source-monitor proxy generation
- manifest generation
- shared room metadata creation from worker output
- Cloud Run deployment
- retention/lifecycle cleanup

## Local Stub

Run without cloud credentials:

```bash
python tools/studio-cut-cloud-sync/cloud_sync_worker.py \
  --sync-job-json tools/studio-cut-cloud-sync/examples/sync-job.placeholder.json \
  --out /tmp/studio-cut-rescue-sync-report.placeholder.json
```

This writes a placeholder sync report and prints the planned FFmpeg/sync steps.

Do not upload sensitive/private footage until Firestore and Storage rules have
passed emulator tests, rules have been intentionally deployed, and retention
cleanup is defined.
