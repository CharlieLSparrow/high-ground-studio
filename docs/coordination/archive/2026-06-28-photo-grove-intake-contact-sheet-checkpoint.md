# 2026-06-28 Photo Grove Intake Contact Sheet Checkpoint

## What changed

Added a raw-intake visual review surface for Photo Grove:

- `apps/QuipslyStudio/script/build_photo_grove_intake_contact_sheet.py`

This complements the existing focused review-batch contact sheet. The new script starts earlier in the workflow: it reads a `photo-grove-intake-manifest.jsonl` file and creates a bounded thumbnail/contact-sheet packet so a human can confirm what is on a card/session before any culling, rating, copying, delivery, cloud work, or client proofing.

## Safety contract

The script:

- Does not move originals.
- Does not delete originals.
- Does not edit originals.
- Does not rate originals.
- Does not write culling metadata.
- Does not upload, publish, schedule, deliver, or create client proof outputs.
- Writes versioned review artifacts into the Quipsly-managed Photo Grove workspace.
- Uses `sips` to create thumbnail copies in the output packet.

## Validation run

Compiled:

```bash
python3 -m py_compile apps/QuipslyStudio/script/build_photo_grove_intake_contact_sheet.py
```

Result: passed.

Generated a bounded contact sheet from the latest Bender card intake manifest:

```bash
apps/QuipslyStudio/script/build_photo_grove_intake_contact_sheet.py \
  --manifest '/Volumes/My Passport/Quipsly Media Workspace/PhotoGrove/IntakeManifests/20260628-074701/photo-grove-intake-manifest.jsonl' \
  --max-items 120 \
  --kinds preview
```

Result: `photo-grove-intake-contact-sheet-ready`.

## Generated packet

Session directory:

```text
/Volumes/My Passport/Quipsly Media Workspace/PhotoGrove/IntakeContactSheets/20260628-140350-photo-intake-contact-sheet
```

Open review sheet:

```bash
open '/Volumes/My Passport/Quipsly Media Workspace/PhotoGrove/IntakeContactSheets/20260628-140350-photo-intake-contact-sheet/index.html'
```

Outputs:

- `/Volumes/My Passport/Quipsly Media Workspace/PhotoGrove/IntakeContactSheets/20260628-140350-photo-intake-contact-sheet/index.html`
- `/Volumes/My Passport/Quipsly Media Workspace/PhotoGrove/IntakeContactSheets/20260628-140350-photo-intake-contact-sheet/photo-grove-intake-contact-sheet.json`
- `/Volumes/My Passport/Quipsly Media Workspace/PhotoGrove/IntakeContactSheets/20260628-140350-photo-intake-contact-sheet/photo-grove-intake-contact-sheet.csv`
- `/Volumes/My Passport/Quipsly Media Workspace/PhotoGrove/IntakeContactSheets/20260628-140350-photo-intake-contact-sheet/START-HERE-photo-grove-intake-contact-sheet.md`

Latest pointer:

- `/Volumes/My Passport/Quipsly Media Workspace/PhotoGrove/latest-photo-grove-intake-contact-sheet.json`

## Run counts

- Contact sheet rows: 120
- Thumbnails ready: 120
- Thumbnail failures: 0
- Source missing: 0
- Manifest errors: 0
- Originals mutated: false
- Metadata changed: false
- External publishing: false
- Versions overwritten: false

Selection note: the script selected 120 preview images. It saw 2,319 manifest rows before finding the bounded preview set because the manifest is RAW-heavy.

## Product meaning

This gives Photo Grove a calm first visual proof after intake:

1. Intake manifest proves what exists.
2. Intake contact sheet shows what it looks like.
3. Future culling/rating writes sidecars only.
4. Client proof/export remains a later explicit step.

This is the same Quipsly architecture principle as the video editor: source media remains whole and untouched; decisions live as transparent metadata and review artifacts.

## Next best Photo Grove step

Build the sidecar-only decision layer for this contact sheet:

- `keep`
- `reject`
- `maybe`
- `client-pick`
- `duplicate-review`
- reviewer name
- notes
- decision timestamp
- source contact sheet packet id

Do not delete, move, or overwrite source images. Culling decisions should be inspectable and reversible.
