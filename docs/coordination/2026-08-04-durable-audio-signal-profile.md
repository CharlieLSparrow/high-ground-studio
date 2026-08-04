# Durable audio signal profile

Date: 2026-08-04
Worktree: `/Users/wall-e/Dev/high-ground-studio-product`
Priority: audio transparency, transcription evidence, sync, and automated editing

## Outcome

Imported audio and video sources can now receive a durable, immutable-source-bound signal profile. Guided Sync automatically requests the profile for the selected spine and target, then uses the completed waveform receipt instead of depending exclusively on iPhone Capture metadata.

The same evidence substrate can now be reused by:

- waveform and level visualization;
- source-sync and drift review;
- transcription boundary and dropout QA;
- mastering diagnostics and matched listening;
- automated edit proposals that need source signal evidence.

## Authority and safety boundary

The `audio-signal-profile` job is stored in `StudioAssetProcessingJob` and binds:

- asset ID;
- provider and exact locator;
- generation;
- SHA-256;
- byte length;
- content type;
- analyzer algorithm and bounded-window policy.

The local media worker independently resolves the source inside the authorized media root, hashes it before analysis, fully decodes the first audio stream through FFmpeg, hashes it again afterward, and emits at most 1,200 RMS/sample-peak windows. A server reconciliation step re-inspects the immutable source before completing registration.

No edit, normalization, denoise, EQ, cut, or derivative is produced. Signal observations remain evidence that requires listening and human interpretation.

## Explicit failure truth

The lane fails visibly for:

- missing or empty source bytes;
- no decodable audio track;
- source path outside the authorized root;
- source hash, size, or generation drift;
- partial or failed FFmpeg decode;
- non-finite decoded samples;
- unordered, empty, or unbounded waveform receipts;
- malformed or incomplete worker receipts;
- unqualified cloud-provider execution.

Guided Sync shows request and receipt status for both sources. A request-level failure is projected into the UI instead of leaving the card indefinitely on “checking.”

## Retained real operation

The operation used the retained High Ground Odyssey Episode 4 source `quipsly-audio-mastery-dogfood.wav`:

- exact byte length: 1,728,102;
- SHA-256: `6aeaaacd1ceeab3923b119297a0efd0a17c95e1fe0ec4a9de60a5795b8d3ac0e`;
- complete decoded duration: 12 seconds;
- decoded sample rate: 48,000 Hz;
- decoded channels: 1;
- bounded waveform windows: 120;
- signal status: `signal-present`;
- source hash and byte length unchanged after decode.

After restarting the durable local lane from the current worktree, a second retained job was left for the launchd media worker. The worker claimed and completed it without an operation-owned worker invocation. The final completed ledger row is `audio_signal_retained_09d68a8e62694fcf9db257af4bea9ef2`.

## Verification

- shared media-processing strict TypeScript: pass;
- media processor strict TypeScript and production build: pass;
- web strict TypeScript: pass;
- signal contract/worker tests: 2 pass;
- server privacy and fail-closed tests: 2 pass;
- Next.js production build: pass with an 8 GB Node heap, 167 routes;
- local doctor: Nest, PostgreSQL, Firebase Auth emulator, transcript worker, and media worker healthy;
- in-app browser visual acceptance: parked because the browser safety policy blocked localhost control; no alternate browser-control route was used.

## Next production step

The contract is provider-aware but this release intentionally qualifies local media only. The next infrastructure slice should add GCS source execution to the deployed media processor using the same job/result contract and exact generation/hash checks, then prove it with a 0%-traffic Cloud Run preview before production promotion.
