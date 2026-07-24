# 2026-06-28 Photo Grove Intake Review Ledger Checkpoint

## What changed

Added a bridge from raw Photo Grove intake contact sheets into the existing Photo Grove review-decision machinery:

- `apps/QuipslyStudio/script/build_photo_grove_intake_review_ledger.py`

This turns an intake contact sheet into a versioned review ledger session with pending sidecar decisions. It does not create a competing culling model. It seeds the existing `photo_grove_review_decision.py` workflow with reviewable rows.

## Why this matters

The Photo Grove workflow now has a safer continuous ladder:

1. Intake manifest proves what files exist.
2. Intake contact sheet makes the card visually skimmable.
3. Intake review ledger creates pending, reversible sidecar decision rows.
4. Dry-run decisions preview metadata changes.
5. Live sidecar decisions can be written later after visual/source review.
6. Client proof/export remains a separate explicit step.

This keeps the Aftershoot-style culling workflow aligned with Quipsly's source-truth rule: original photos stay untouched; review intent lives as metadata.

## Safety contract

The new script:

- Does not move originals.
- Does not delete originals.
- Does not edit originals.
- Does not rate originals directly.
- Does not upload, publish, schedule, deliver, or create client proof outputs.
- Writes only Quipsly-owned review ledger artifacts in a versioned output folder.
- Writes its own latest pointer: `latest-photo-grove-intake-review-ledger.json`.
- Does not replace the global `latest-photo-grove-review.json` unless explicitly run with `--promote-latest`.

## Validation

Compiled:

```bash
python3 -m py_compile apps/QuipslyStudio/script/build_photo_grove_intake_review_ledger.py
```

Result: passed.

Generated a review ledger from the latest intake contact sheet:

```bash
apps/QuipslyStudio/script/build_photo_grove_intake_review_ledger.py --contact-sheet latest
```

Result: `photo-grove-intake-review-ledger-ready`.

Generated session:

```text
/Volumes/My Passport/Quipsly Media Workspace/PhotoGrove/IntakeReviewLedgers/20260628-141321-photo-intake-review-ledger
```

Open it:

```bash
open '/Volumes/My Passport/Quipsly Media Workspace/PhotoGrove/IntakeReviewLedgers/20260628-141321-photo-intake-review-ledger/index.html'
```

Counts:

- Total: 120
- Pending: 120
- Groups: 120
- Review: 0
- Keep: 0
- Favorite: 0
- Reject: 0
- Rated: 0
- Originals mutated: false
- Metadata changed: false
- External publishing: false
- Versions overwritten: false

## Dry-run proof

Ran the first generated dry-run decision:

```bash
python3 apps/QuipslyStudio/script/photo_grove_review_decision.py cbde33dfa8cd63bd review - intake-review reviewer 'Needs visual/source review before culling.' --session '/Volumes/My Passport/Quipsly Media Workspace/PhotoGrove/IntakeReviewLedgers/20260628-141321-photo-intake-review-ledger' --dry-run
```

Result:

- `ok: true`
- `dryRun: true`
- `wouldUpdateCount: 1`
- before status: `pending`
- after preview status: `review`
- `ledgerMutated: false`
- `originalsMutated: false`
- `clientDeliveryCreated: false`
- `externalPublishing: false`

No live culling decision was written because the photo had not been visually/source reviewed yet.

## Product meaning

This is the first reversible culling primitive for raw intake contact sheets. Reviewers can now move from "what is on this card?" to "what should be reviewed, kept, favorited, or rejected?" without putting source files at risk.

## Next best Photo Grove step

Build a simple cull workbench UI/packet over this intake review ledger:

- Show one candidate at a time.
- Show thumbnail, source path, reveal command, current status, and dry-run commands.
- Add explicit live sidecar buttons later, but keep them behind human confirmation.
- Add batch filters: pending, review, keep, favorite, reject.
- Add notes and reviewer fields.
- Keep client proof/export as a separate later packet, not an automatic consequence of `keep`.
