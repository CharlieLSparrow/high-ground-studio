# Session camera audio audition

Date: 2026-08-25

## Decision

A camera-only Session recording gets a compact, audio-only review derivative
when a person first asks to play its transcript or audition a text-based edit.
Quipsly Capture must not download a multi-gigabyte 4K master merely to hear a
sentence, but it must also never substitute unrelated audio or weaken the
exact-source playback boundary.

This derivative is navigation evidence, not a new source. The immutable
`RecordingAsset` remains source truth. Transcript timestamps remain on the
source clock and are used unchanged against the derivative, whose duration is
verified after a complete decode.

## Durable boundary

`SessionAudioAuditionJob` is a Session-owned job rather than a Studio or
Episode job. One deterministic job identity binds:

- Session and RecordingAsset;
- finalization upload session;
- source bucket, object, generation, byte count, SHA-256, and content type; and
- `transcript-audition-aac-lc-128k-v1`.

The database row commits before the create-once GCS outbox. The private media
worker receives only a generation-bound manifest, materializes and hashes the
exact source, extracts the first audio stream to 48 kHz AAC-LC, decodes the
complete output, and writes a new immutable object under
`media-vault/proxy/session-audition/`. The result records its own generation,
byte count, SHA-256, CRC32C, duration, codec, sample rate, channel count,
bitrate, worker execution, build, and attempt. Originals are never overwritten.

The Nest control plane independently parses the worker result and re-resolves
the current protected source before registering it. A changed room, source,
finalization, generation, size, digest, type, target, or worker receipt holds
playback instead of guessing.

## Access and playback

The explicit Play action queues the derivative; polling does not silently
create work. Both control and media routes authenticate before loading private
state and apply ordinary Session access. The media route pins the exact output
generation, supports byte ranges and HEAD, and never redirects to GCS.

Capture downloads only the completed AAC derivative, verifies its complete
byte count and SHA-256, and stores it in the existing account-bound,
file-protected, backup-excluded Session cache. The derivative cache key is
separate from the full-source cache. Account changes stop playback. The app
continues to key listening evidence to the original RecordingAsset and exact
source-clock passage.

Audio-only masters continue through the original protected source path. The
ordinary **Watch** action remains a deliberate full-video preparation; the
compact derivative is used only for transcript and text-edit audition.

## Cost and recovery

- Encoding is on demand and idempotent per immutable source/profile.
- One small AAC object is retained per exact camera source rather than one per
  transcript passage.
- A transient worker failure releases its lease for retry. Invalid control
  evidence is quarantined; terminal media failures are dead-lettered and shown
  as held/failed.
- The same Cloud Run Job, private bucket, create-once storage adapter, and
  execution debounce used by other media lanes are reused.

## Evidence and limits

- Shared contract and private worker TypeScript pass.
- The focused contract/worker suite proves immutable-source binding, separate
  output identity, full worker receipt parsing, and original preservation.
- Eleven focused service/API tests prove Session authorization-before-work,
  deterministic database-first queueing, source-duration drift refusal,
  explicit queue versus polling, private generation-bound streaming, ranges,
  HEAD, and stored object drift refusal.
- Prisma validation and generation, strict Quipsly TypeScript, the full Capture
  release-source gate, and a dual-architecture iOS Simulator preflight pass.

Automated evidence does not prove a real 4K source contains usable audio, a
live Cloud Run execution, authenticated iPhone download, audible timestamp
alignment, cache behavior under device pressure, or physical-device playback.
Those observations remain in the deferred validation ledger.
