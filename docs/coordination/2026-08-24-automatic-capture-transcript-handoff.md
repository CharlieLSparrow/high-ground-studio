# Automatic Capture transcript handoff

Date: 2026-08-24

## Product outcome

A consented, exact-byte verified participant recording no longer waits for a
coach or operator to press **Run transcription**. Canonical upload finalization
creates or reuses the room-bound `TranscriptJob` and now immediately starts its
durable worker outbox. **Run transcription** remains the conventional retry and
version-repair action; it is not the happy-path handoff.

The automation does not weaken authority:

- recording processing and transcription must both be `RELEASED`;
- the canonical job must be `QUEUED`, `RUNNING`, or already `COMPLETED`;
- the current all-party transcription gate is evaluated before the provider
  request and again before transcript text is projected;
- a provider/outbox outage never rolls back or hides the verified recording;
  the canonical job remains the durable retry handle; and
- replay is idempotent because the transcript manifest and queue receipt retain
  their immutable job/source bindings.

## Interrupted-container path

An abruptly interrupted browser source remains the immutable
`RecordingAsset`. Quipsly does not send that questionable container to a
provider while repair is pending. Once the dedicated repair worker proves a
derivative, transcription starts automatically from that derivative while the
job remains bound to the original RecordingAsset, room, participant, and
consent lineage.

The derivative is accepted only from `media-vault/repair/` and must match:

- the stored repair output bucket, object, generation, size, type, and SHA-256;
- the original RecordingAsset bucket, object, generation, size, and SHA-256;
- worker metadata for output SHA, original SHA, original generation, and
  `originalRemainsSourceTruth`; and
- the transcript manifest and canonical job source generation/SHA during
  reconciliation.

Arbitrary media-vault derivatives, partial repairs, or conflicting lineage fail
closed. Transcript timing is produced from the repaired byte stream, while the
original source remains unchanged and available for evidence review.

## Evidence and limits

- 33 focused finalization, autoqueue, outbox, privacy, repair-source,
  reconciliation, and manual-retry tests pass.
- Strict Quipsly TypeScript and the shared media-processing package typecheck
  pass.
- Tests prove held consent does not enqueue, interrupted sources wait for
  verified repair, repaired derivatives reconcile against original lineage,
  and manual Run remains compatible.
- This is local deterministic evidence. A live flight must still observe a real
  released recording moving from finalization to worker execution and source-
  timed transcript readback without pressing Run.

