# Podcast audio delivery-artifact checkpoint

Date: 2026-08-05

Quipsly now has the stage immediately after audio-master promotion: a
deterministic AAC-LC/M4A delivery artifact, independently inspected and
remeasured after lossy encoding, followed by a separate playback-bound human
review ledger.

The product does not collapse the lifecycle into a generic export button:

`immutable source -> verified WAV preview -> human review -> promotion -> AAC artifact -> encoded-byte review -> future output packet -> future upload -> future publication`

Implemented surfaces and contracts:

- shared `quipsly-audio-delivery-job-v1` and result contracts;
- deterministic candidate-SHA-bound `.m4a` target;
- recoverable local worker with atomic partial output and exact lease checks;
- AAC-LC, 48 kHz stereo, nominal 128 kb/s, fast-start, full-decode, duration,
  SHA-256, and post-encode BS.1770 verification;
- private Nest queue/reconcile and review routes;
- append-only `StudioAudioDeliveryReviewReceipt` migration;
- Episode editor artifact controls and actual encoded-byte player;
- beginning/midpoint/ending playback coverage gate;
- Episode inventory projection that distinguishes encoded, proof-listened,
  packet-eligible, uploaded, and published states; and
- local-schema deployment only. No production migration or traffic change.

The real retained Episode 8 browser was refreshed under its explicit editor
grant. The delivery region rendered and correctly held the encode action with
the message that the exact mastered preview must first be promoted. No fake
human approval or promotion was manufactured to force the happy path.

The positive media path is covered by a real FFmpeg operation over generated
QA audio, including source-hash preservation and recovery of an existing
artifact. Focused service, route, inventory, UI, contract, and worker tests
pass. Physical-iPhone capture and genuine High Ground Odyssey listening remain
open acceptance gates.

Verification readback:

- six focused Jest suites: 24 tests passed;
- audio mastery/treatment/delivery engine: 15 tests passed, including the real
  FFmpeg AAC encode and recovery operation;
- complete Quipsly regression: 317 suites and 1,643 tests passed; 40 suites and
  123 opt-in database/operation tests remained intentionally skipped;
- Quipsly, media processor, and shared media-contract TypeScript: passed;
- Prisma format, validation, generation, local migration deployment, and
  migration status: passed with 67 migrations current;
- shared media package, local media-worker bundle, and optimized Nest build:
  passed with 175 static pages and both delivery routes in the manifest; and
- scoped diff check: passed.
