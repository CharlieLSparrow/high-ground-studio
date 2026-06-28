# 2026-06-28 Photo Grove Intake Cull Workbench Checkpoint

## What changed

Added a static cull workbench over the pending Photo Grove intake review ledger:

- `apps/QuipslyStudio/script/build_photo_grove_intake_cull_workbench.py`
- `apps/QuipslyStudio/script/agentctl.sh` command: `photo-grove-intake-cull-workbench`

This workbench is the first calm "one reversible decision at a time" surface for intake photos. It shows selected ledger rows, thumbnails, source paths, current status, tags/flags, reveal-source commands, and dry-run review/keep/favorite/reject commands.

## Safety contract

The workbench:

- Does not execute cull decisions.
- Does not mutate the review ledger.
- Does not move, delete, edit, rename, rate, or overwrite originals.
- Does not create client proof files.
- Does not upload, publish, schedule, or create receipt truth.
- Uses the existing pending review ledger and existing `photo_grove_review_decision.py` dry-run/live command model.

## Validation

Compiled:

```bash
python3 -m py_compile apps/QuipslyStudio/script/build_photo_grove_intake_cull_workbench.py
```

Result: passed.

Generated workbench through the operator command:

```bash
apps/QuipslyStudio/script/agentctl.sh photo-grove-intake-cull-workbench latest 24
```

Result: `photo-grove-intake-cull-workbench-ready`.

## Generated packet

Open:

```bash
open '/Volumes/My Passport/Quipsly Media Workspace/PhotoGrove/IntakeReviewLedgers/20260628-141321-photo-intake-review-ledger/cull-workbenches/20260628-142601-photo-intake-cull-workbench/index.html'
```

Files:

- `/Volumes/My Passport/Quipsly Media Workspace/PhotoGrove/IntakeReviewLedgers/20260628-141321-photo-intake-review-ledger/cull-workbenches/20260628-142601-photo-intake-cull-workbench/index.html`
- `/Volumes/My Passport/Quipsly Media Workspace/PhotoGrove/IntakeReviewLedgers/20260628-141321-photo-intake-review-ledger/cull-workbenches/20260628-142601-photo-intake-cull-workbench/photo-grove-intake-cull-workbench.json`
- `/Volumes/My Passport/Quipsly Media Workspace/PhotoGrove/IntakeReviewLedgers/20260628-141321-photo-intake-review-ledger/cull-workbenches/20260628-142601-photo-intake-cull-workbench/photo-grove-intake-cull-workbench.csv`
- `/Volumes/My Passport/Quipsly Media Workspace/PhotoGrove/IntakeReviewLedgers/20260628-141321-photo-intake-review-ledger/cull-workbenches/20260628-142601-photo-intake-cull-workbench/START-HERE-photo-grove-intake-cull-workbench.md`

Latest pointer:

- `/Volumes/My Passport/Quipsly Media Workspace/PhotoGrove/latest-photo-grove-intake-cull-workbench.json`

## Run counts

- Rows shown: 24
- Total ledger rows: 120
- Dry-run commands exposed: 96
- Status counts: pending 120
- Ledger mutated: false
- Originals mutated: false
- Client delivery created: false
- External publishing: false
- Versions overwritten: false

## Product meaning

The Photo Grove proof lane now has a concrete Aftershoot-like spine:

1. Intake manifest: what exists.
2. Intake contact sheet: what it looks like.
3. Intake review ledger: pending reversible culling rows.
4. Intake cull workbench: visual decision surface with dry-runs.
5. Future live sidecar writes: only after explicit review/approval.
6. Client proof/export: later, separate, and never implied by culling status.

## Next best Photo Grove step

Build the live sidecar confirmation layer or an interactive native/web UI.

Recommended next slice:

- Add a deliberate live sidecar confirmation packet that requires reviewer + note.
- Rebuild status after a live sidecar decision.
- Keep every live write metadata-only and receipt-backed.
- Do not use `reject` to delete files. Ever.

## Follow-up: intake-specific dry-run alias

Added:

```bash
apps/QuipslyStudio/script/agentctl.sh photo-grove-intake-cull-decision-dry-run latest|ledger-folder|review-ledger.json PHOTO_ID keep|reject|review|favorite|pending [rating|-] [tag1,tag2] [actor] [note]
```

Files changed:

- `apps/QuipslyStudio/script/agentctl.sh`
- `apps/QuipslyStudio/script/build_photo_grove_intake_cull_workbench.py`

The intake cull workbench now regenerates current dry-run commands instead of trusting stale command strings embedded in older ledger rows.

Validation:

```bash
bash -n apps/QuipslyStudio/script/agentctl.sh
python3 -m py_compile apps/QuipslyStudio/script/build_photo_grove_intake_cull_workbench.py apps/QuipslyStudio/script/photo_grove_review_decision.py
apps/QuipslyStudio/script/agentctl.sh photo-grove-intake-cull-workbench latest 12
apps/QuipslyStudio/script/agentctl.sh photo-grove-intake-cull-decision-dry-run latest 854f0bcee41f73d6 review - needs-human-cull codex 'Alias smoke: preview review metadata only; do not mutate originals.'
```

Latest generated workbench:

- `/Volumes/My Passport/Quipsly Media Workspace/PhotoGrove/IntakeReviewLedgers/20260628-141321-photo-intake-review-ledger/cull-workbenches/20260628-151759-photo-intake-cull-workbench/index.html`
- `/Volumes/My Passport/Quipsly Media Workspace/PhotoGrove/IntakeReviewLedgers/20260628-141321-photo-intake-review-ledger/cull-workbenches/20260628-151759-photo-intake-cull-workbench/photo-grove-intake-cull-workbench.json`

Alias smoke result:

- `ok: true`
- `dryRun: true`
- `wouldUpdateCount: 1`
- `ledgerMutated: false`
- `originalsMutated: false`
- `clientDeliveryCreated: false`
- `externalPublishing: false`

Next best Photo Grove step remains the live sidecar confirmation layer. It should require reviewer + note and should write receipts while preserving originals.
