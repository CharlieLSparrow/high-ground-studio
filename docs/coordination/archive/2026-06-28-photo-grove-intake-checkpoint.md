# Photo Grove Intake Checkpoint - 2026-06-28

## Status

A read-only Photo Grove intake manifest was built for the mounted photo card at:

```text
/Volumes/Bender/DCIM
```

The script does not move, delete, rate, edit, or rewrite originals. It writes sidecar review artifacts outside the source tree.

## Script

```text
apps/QuipslyStudio/script/build_photo_grove_intake_manifest.py
```

Validation:

```bash
python3 -m py_compile apps/QuipslyStudio/script/build_photo_grove_intake_manifest.py
```

Run used:

```bash
apps/QuipslyStudio/script/build_photo_grove_intake_manifest.py --source '/Volumes/Bender/DCIM' --signature-mode metadata --progress-every 5000
```

## Output packet

```text
/Volumes/My Passport/Quipsly Media Workspace/PhotoGrove/IntakeManifests/20260628-074701
```

Files:

```text
/Volumes/My Passport/Quipsly Media Workspace/PhotoGrove/IntakeManifests/20260628-074701/photo-grove-intake-manifest.jsonl
/Volumes/My Passport/Quipsly Media Workspace/PhotoGrove/IntakeManifests/20260628-074701/photo-grove-intake-summary.json
/Volumes/My Passport/Quipsly Media Workspace/PhotoGrove/IntakeManifests/20260628-074701/photo-grove-intake-review.md
/Volumes/My Passport/Quipsly Media Workspace/PhotoGrove/IntakeManifests/20260628-074701/photo-grove-companion-groups.json
/Volumes/My Passport/Quipsly Media Workspace/PhotoGrove/IntakeManifests/20260628-074701/photo-grove-duplicate-signatures.json
```

## Counts

- Files indexed: 21,931
- RAW files: 18,928 `.CR3`
- Preview files: 3,003 `.JPG`
- RAW/JPEG companion groups: 2,992
- Duplicate metadata-signature groups: 0

Top folders:

- `107CANON`: 7,709
- `103CANON`: 5,993
- `100CANON`: 2,081
- `105CANON`: 2,080
- `106CANON`: 1,721

## Product finding

The first version used partial signatures by default and was too slow on a large removable card. The script now defaults to `--signature-mode metadata` for fast first-pass intake, with `--signature-mode partial` available for deeper duplicate diagnostics.

This matches the Photo Grove product rule: first make the card feel safely visible, then do deeper analysis in opt-in passes.

## Next safe Photo Grove steps

1. Generate thumbnails/contact sheets into a Quipsly-managed cache, never beside originals.
2. Add a ratings sidecar: keep, reject, maybe, client-pick, duplicate-review.
3. Add blur/exposure/duplicate heuristics as suggestions only.
4. Add a simple review UI or HTML contact sheet that reads this manifest.
5. Add copy/backup verification as a separate action, not part of read-only intake.
