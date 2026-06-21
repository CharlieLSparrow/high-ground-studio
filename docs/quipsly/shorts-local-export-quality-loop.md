# Shorts local export quality loop

This loop is for making real shorts, not maintaining a ceremonial approval process.

## The promise

Quipsly Studio should make it easy to do the practical work:

- Pick the next useful short candidate.
- Export it locally as an actual 9:16 file.
- Watch it.
- Listen to it.
- Fix crop, captions, pacing, and hook.
- Keep, refine, or reject it based on the real exported file.
- Hand good files to Tower for platform-specific publishing later.

## Command surface

The local export board is the fast operator view:

```bash
script/shortsctl.sh local-export-board --html
```

It writes:

- `docs/quipsly/current-state/episode-1-shorts-local-export-board.json`
- `docs/quipsly/current-state/episode-1-shorts-local-export-board.html`
- `docs/quipsly/current-state/episode-1-shorts-local-export-board.md`

Useful next commands:

```bash
script/shortsctl.sh local-export-board --html
script/shortsctl.sh growth-quality-board --html
script/shortsctl.sh platform-package-board --html
script/shortsctl.sh improvement-plan --html
script/agentctl.sh shorts-export-selected /absolute/output/folder optional-basename
script/agentctl.sh shorts-contact-sheet /absolute/exported-short.mp4
script/agentctl.sh shorts-audio-sanity /absolute/exported-short.mp4 expected-duration-seconds
script/agentctl.sh shorts-listen-through "Listened locally; note result here."
script/agentctl.sh shorts-review SHORT_CLIP_ID keep "Kept after local export review."
script/agentctl.sh shorts-review SHORT_CLIP_ID refine "Needs one concrete improvement after local review."
```

## What counts as progress

Progress is not "a short exists in a queue."

Progress is:

- A local exported file exists.
- The exported file can be visually inspected.
- Audio has been listened to or sanity-checked.
- Text overlays and captions do not cover faces or ruin readability.
- A concrete decision exists: keep, refine, or reject.

## What this does not do

The local export board does not approve, publish, schedule, upload, or capture provider receipts.

That split is intentional. Studio makes the file good. Tower proves what happened after publication.
