# Photo Grove agentctl script resolver checkpoint - 2026-06-28

## Why this pass happened

Photo Grove had useful local culling/review artifacts, but the advertised `agentctl` command surface had drifted from the file layout. Commands such as `photo-grove-start-here` attempted to call top-level scripts like:

```bash
apps/QuipslyStudio/script/build_photo_grove_start_here.py
```

The current implementations live under:

```bash
apps/QuipslyStudio/script/experimental/
```

That made the command surface feel broken even though the underlying tooling existed.

## What changed

- Added `script_path` resolver to `apps/QuipslyStudio/script/agentctl.sh`.
- `script_path` checks:
  1. `apps/QuipslyStudio/script/<script-name>`
  2. `apps/QuipslyStudio/script/experimental/<script-name>`
- Updated Photo Grove script calls in `agentctl` to use the resolver.

This preserves a stable operator API while scripts are still being promoted out of experimental.

## Current generated Photo Grove doors

- Start Here: `/Volumes/My Passport/Quipsly Media Workspace/PhotoGrove/StartHere/20260628-162501-130629-photo-grove-start-here/index.html`
- Next Cull Batch: `/Volumes/My Passport/Quipsly Media Workspace/PhotoGrove/NextCullBatches/20260628-162501-325814-photo-grove-next-cull-batch/index.html`
- Cull Theater: `/Volumes/My Passport/Quipsly Media Workspace/PhotoGrove/CullTheaters/20260628-162502-153563-photo-grove-cull-theater/index.html`

## Current local truth

- Start Here status: `photo-grove-start-here-backup-in-progress`
- Next Cull Batch status: `photo-grove-next-cull-batch-ready`
- Cull Theater status: `photo-grove-cull-theater-ready`
- Next Cull Batch rows: 12
- Cull Theater rows: 36
- Cull Theater dry-run commands: 180
- Originals mutated: false
- Metadata changed: false
- External publishing: false

## Validation

```bash
bash -n apps/QuipslyStudio/script/agentctl.sh
python3 -m py_compile \
  apps/QuipslyStudio/script/experimental/build_photo_grove_start_here.py \
  apps/QuipslyStudio/script/experimental/build_photo_grove_next_cull_batch.py \
  apps/QuipslyStudio/script/experimental/build_photo_grove_cull_theater.py \
  apps/QuipslyStudio/script/experimental/build_photo_grove_live_intake_status.py \
  apps/QuipslyStudio/script/experimental/build_photo_grove_intake_cull_workbench.py
apps/QuipslyStudio/script/agentctl.sh photo-grove-start-here '/Volumes/My Passport/Quipsly Media Workspace/PhotoGrove'
apps/QuipslyStudio/script/agentctl.sh photo-grove-next-cull-batch '/Volumes/My Passport/Quipsly Media Workspace/PhotoGrove' --limit 12
apps/QuipslyStudio/script/agentctl.sh photo-grove-cull-theater '/Volumes/My Passport/Quipsly Media Workspace/PhotoGrove' 36
```

Result: all passed and generated fresh local-only artifacts.

## Product rule reinforced

Stable operator commands matter. If the command surface says `photo-grove-start-here`, it should work even while implementation files are being reorganized behind the scenes.

The Photo Grove workflow remains local-first and proof-first:

1. Copy/backup truth.
2. Manifest/thumbnails/integrity.
3. Cull/review surfaces.
4. Dry-run decisions.
5. Explicitly approved metadata sidecars only.
6. No original mutation.

