# Nest external recording import — operated acceptance

Date: 2026-08-02

Worktree: `high-ground-studio-product`

Scope: local production-shaped acceptance; no cloud deployment

## Outcome

Nest now exposes an original-preserving recording import inside each Session’s **Recordings** workspace. This closes the immediate Canon R8, Shure MV7i, browser-recorder, and externally captured coaching-media gap without creating a second media or consent system.

The browser uses the canonical `quipsly-mobile-capture-resumable-v2` boundary:

1. Validate that the source is recognizable audio or video and within the canonical size boundary.
2. Incrementally compute SHA-256 in 8 MiB chunks, so a camera source is not loaded into browser memory as one multi-gigabyte buffer.
3. Reserve an actor-owned, room-bound upload using the actor’s current versioned consent receipt.
4. Upload the unchanged original to the private media vault.
5. Ask Nest to independently re-read and verify exact bytes, SHA-256, object identity, and storage generation.
6. Materialize the canonical `RecordingAsset` and immutable finalization receipt.
7. Keep processing and transcription held when START/STOP or complete all-party consent evidence is absent.

No step edits the local source, infers consent, creates a transcript, sends a message, publishes media, or upgrades a phone/browser assertion into server authority.

## UX contract

- The import is available where recording truth already lives, rather than in a detached upload utility.
- Recording start and stop times are explicit timeline metadata. They do not masquerade as phone START/STOP receipts.
- Audio and video permission remain distinct. A consent receipt that permits audio does not enable video import.
- The product separates byte integrity from processing policy. A `HELD` source can be independently byte-verified while remaining unavailable to transcription or sharing.
- The source ledger now uses the device-neutral label **Source → private vault → Nest evidence** because Canon, Shure, browser, and iPhone sources share the same verification projection.
- Errors tell the user to preserve the original; upload capability URLs are never persisted in browser storage.

## Operated evidence

A labeled synthetic 17.16-second coaching WAV was selected through the rendered browser UI and imported into `qa-retained-coaching-next-session-20260807` as the retained coach test account.

The first attempt failed closed before byte upload because the professional local launcher did not configure the development Capture vault. That lifecycle boundary was repaired in `scripts/dev/quipsly-local-up.sh`, covered by the local-lifecycle contract, and exercised by restarting Nest through the launcher while reusing PostgreSQL, Firebase Auth, and the media worker.

The second attempt produced:

- canonical RecordingAsset `cmsc8ee1j0001qyxlxdja8ho8`;
- status `HELD`;
- exact size `756742` bytes;
- SHA-256 `309adeddf1851bf9929718113c5bf058d4501c65f59187e14b39a8de792a90e0`;
- durable upload session `aba9da45-c487-488d-99ae-13ffbf27f7bc`;
- processing `HELD` and transcript `HELD`;
- independently verified local-vault generation and `exactBytesVerified=true`.

The original file, canonical RecordingAsset, immutable finalization receipt, and private-vault copy all matched the same SHA-256. The rendered ledger shows `1 verified`, `1 held`, START absent, and STOP absent. This is plumbing/integrity acceptance, not a genuine coaching-session acceptance and not permission to transcribe.

## Verification

- `pnpm --filter quipsly typecheck`
- 56 focused Jest tests across import hashing/validation, consent projection, source evidence, Session UI, and content readiness
- 8 local-lifecycle contract tests
- `bash -n scripts/dev/quipsly-local-up.sh`
- rendered browser operation through consent, file selection, upload, verification, and ledger readback
- direct PostgreSQL readback of RecordingAsset/finalization receipt
- independent filesystem SHA-256 readback of the preserved private-vault object

## Production release boundary

This change is intentionally not deployed in this slice. Before promotion:

1. Build the exact committed release context and run the full Quipsly release contract.
2. Read back the production GCS CORS policy for `https://nest.quipsly.com`; the repo policy already includes `PUT`, `POST`, `OPTIONS`, `Content-Length`, and `Content-Range`.
3. Exercise a 0%-traffic preview with an authenticated staff account and a disposable, clearly labeled source.
4. Verify the GCS object generation, SHA-256 receipt, canonical RecordingAsset, and held/released disposition before traffic promotion.
5. Exercise a large camera file in a controlled lane. Google Cloud recommends resumable uploads for large files and treats the resumable session URI as a bearer capability, so it must remain secret: [Cloud Storage resumable uploads](https://docs.cloud.google.com/storage/docs/performing-resumable-uploads).

## Deliberately remaining

- Complete all-party consent and applied capture boundaries are still required before processing release.
- A human/staff release remains required for preserved external media that lacks a canonical Capture START receipt.
- External media duration is not inferred from user-entered wall-clock timestamps. A media-probe worker should materialize actual duration before substantial-content readiness can be claimed.
- Chunk-level resumable recovery for interrupted multi-gigabyte browser uploads is a follow-up. The current contract safely recovers created/uploaded sessions and never stores the capability URI, but the browser currently sends the original in one resumable PUT.
- Genuine acceptance still requires real Canon/MV7i and coaching recordings, two-account privacy, playback, transcript correction, and human-reviewed notes/goals/tasks/follow-up.
