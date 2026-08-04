# Measured transcript error contributors — 2026-08-04

## Outcome

Session transcript review now explains where its playback-reviewed word error
rate came from. The evidence model retains a bounded list of the eight reviewed
segments with the largest measured WER, including exact source range, review
kind, word edit count, reference-word count, and segment rate. Aggregate WER
still uses every reviewed segment; the bounded list is a diagnostic navigator,
not a replacement metric and never a projection of provider confidence.

The rendered desk shows those contributors largest-first and can seek their
exact protected source timestamps. Confirmed-as-is segments remain visible at
0% WER, which makes the denominator and review coverage understandable instead
of showing only failures.

## Playback authority repair

The retained operation exposed a stale-media defect while testing the new UI.
Historical playback-reviewed QA packets still had valid database receipts and
protected playback URLs, but their temporary private-vault WAV had been removed.
The old UI enabled correction and derivative-work controls whenever a URL was
present, even if the browser could not decode any bytes.

Review authority now follows the media element:

- controls begin held while protected metadata loads;
- `loadedmetadata` or `canplay` establishes current playback readiness;
- a media error clears listening progress and disables playback, correction,
  speaker attribution, notes, tasks, goals, drafts, and contributor navigation;
- historical review receipts and measured metrics stay visible;
- the UI explicitly asks for restoration or re-import of the original instead
  of treating a stale URL as evidence.

## Operated evidence

`pnpm quipsly:retained:measured-transcript-ui` signed the retained coach into
the newest accessible playback-reviewed coaching packet and found three
measured contributor segments. The historical source returned no decodable
metadata because its temporary WAV no longer exists. The journey proved:

- contributor metrics render from existing review receipts;
- the missing source leaves contributor playback disabled;
- no new accuracy claim or derivative work can be created;
- no horizontal overflow or browser exception occurred;
- no credential, screenshot, mutation, or external side effect was produced.

The missing source is intentionally not recreated from a different synthetic
file. Restoring bytes under the old identity without the exact original hash
would corrupt the evidence boundary.

## Verification

- transcript evidence and correction desk focused tests pass;
- strict Quipsly TypeScript passes;
- rendered retained measured-transcript operation passes;
- static operation safety contract passes.
