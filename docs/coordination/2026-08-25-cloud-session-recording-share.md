# Cloud Session recording share

Date: 2026-08-25

## Decision

The coaching recording editor may render its private proof copy in the existing
Quipsly media Cloud Run Job. Production no longer depends on a particular Mac
or a local filesystem vault to trim, text-edit, proof-listen, and deliberately
release a Session recording.

The local renderer remains a development adapter. Both adapters consume the
same versioned edit and result contracts; cloud authority is stricter because
every input must be a released `RecordingAsset` with an exact GCS object,
generation, byte count, SHA-256, content type, finalization receipt, participant
identity, and Session program offset.

## Durable flow

1. The coach chooses exact participant sources, a trim window, and optional
   source-timed transcript exclusions.
2. `SessionOutput` and its `StudioWorkflowJob` commit in one transaction before
   any worker request.
3. A create-once private manifest and queue receipt bind the immutable job.
4. The worker claims a generation-checked lease, verifies storage metadata,
   downloads and hashes every selected source, renders AAC-LC at 48 kHz, probes
   duration/format, and decodes the complete output.
5. The output is uploaded create-once under
   `media-vault/derived/session-recording-share/`, then downloaded again from
   its exact generation and re-hashed before a result is committed.
6. Nest independently parses the result, registers a derived `SERVER_MIX`, and
   keeps it private. Release still requires coverage of the current preview's
   beginning, middle, ending, and every edit join.

Transient worker failures release the lease for retry. Invalid manifests,
source drift, output collisions, and technical failures are terminal and
dead-lettered. A lost HTTP response reuses the same Session output, job, and
cloud outbox rather than creating another render.

## Media truth and access

- Participant masters are never modified, replaced, or deleted.
- Transcript exclusions remain reversible edit decisions bound to provider
  text and timing fingerprints.
- The result remains coach-private until an explicit reviewed release; revoke
  remains separate and does not delete bytes.
- Playback now pins the registered GCS generation as well as byte count and
  SHA-256, preventing a later object version from inheriting old review
  authority.
- The renderer streams output hashing instead of reading an eight-hour export
  into process memory.

## Automated evidence and remaining flight evidence

- Shared cloud contract, local and cloud worker, renderer, private outbox,
  generation-pinned object reader, existing recording-share service/UI tests,
  and strict TypeScript pass locally.
- Cloud worker execution with two real participant masters, exact output
  readback, authenticated proof listening, deliberate release, recipient
  playback/download, revocation, and cost observation remain release-train
  evidence. They are not inferred from compilation or synthetic bytes.
