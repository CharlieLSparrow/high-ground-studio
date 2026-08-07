# Episode program delivery authority — 2026-08-06

## Outcome

Quipsly now preserves a reviewed Episode program as a different authority from a mastered single microphone, then advances that exact program through a separately verified AAC encode, exact-byte proof-listen, and reversible podcast package selection.

## Contracts and ledgers

- `quipsly-episode-program-delivery-job-v1` binds the exact Episode, mix job, promotion receipt, program fingerprint, proposal hash, baseline hash, and promoted lossless candidate hash.
- `quipsly-episode-program-delivery-result-v1` records the encoder result, complete-decode measurement, exact source identity, and delivery artifact identity.
- `StudioEpisodeProgramDeliveryReviewReceipt` is a dedicated append-only ledger. It cannot be confused with single-asset mastering or delivery review.
- Podcast packet selection records `authorityKind: episode-program` and revalidates the active mix promotion plus exact program-delivery approval inside the selection transaction.

## Retained real-work exercise

The retained `Capture Sync Rendezvous Qa 20260805` Episode was used through the live local UI:

1. Selected `dji-backup-delayed.wav` as primary dialogue and the program clock.
2. Explicitly excluded five unavailable or alternate retained tracks.
3. Rendered a new transparent, bit-identical baseline/proposal pair.
4. Played both exact files at beginning, midpoint, and ending checkpoints and performed a same-clock A/B switch.
5. Stored a retained technical-QA review note that explicitly does not claim subjective audibility.
6. Promoted the exact reviewed program.
7. Encoded and reconciled a separate AAC artifact.
8. Played the exact registered AAC continuously across beginning, midpoint, and ending bins.
9. Stored an exact-byte retained technical-QA proof receipt and selected the program as the reversible Episode package candidate.

Observed media evidence:

- promoted program duration: approximately 18.395 seconds;
- encoded AAC duration: approximately 18.395 seconds;
- both players reached ready state 4 in the browser;
- Session output graph advanced from no program delivery to one proof-listened artifact and one selected package;
- metadata, public enclosure hosting, upload, and publication remained open.

## Boundaries preserved

- No retained source was modified.
- The lossless program and AAC artifact have separate identities.
- Playback telemetry is not represented as proof of subjective audibility.
- Package selection is reversible and did not upload or publish.
- The retained fixture receipts are explicitly scoped to technical workflow QA.

## UX defect corrected

The Session action labeled “Open exact mix review” previously routed to the video editor even though the governed multitrack review lives in the Audio workspace. It now routes to the exact Episode in `/audio`. The longer-term accepted direction is to embed that mode inside the unified Episode workspace; see `docs/architecture/quipsly-hybrid-episode-editor.md`.
