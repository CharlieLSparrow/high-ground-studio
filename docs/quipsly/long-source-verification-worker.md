# Quipsly long-source verification worker

Status: accepted production design; implementation next
Last reviewed: 2026-07-26

## Decision

Video above the current 2 GiB synchronous-finalization ceiling uses a dedicated
Cloud Run Job. The iPhone still uploads directly to one private GCS object with
an immutable generation precondition. Nest never proxies media bytes.

The worker receives no user token, project slug, filename, signed upload URL, or
database credential. It discovers durable verification requests in a private
GCS queue prefix, loads the canonical upload manifest, claims work with a GCS
generation precondition, streams exactly the recorded object generation through
SHA-256, and commits byte-verification evidence back to the manifest.

The authenticated Nest finalize route remains the only component that can turn
verified bytes into Quipsly source, asset, episode, transcript, or processing
records. A worker proves bytes; it does not grant product authority.

## Why a job

Interactive Cloud Run requests and Cloud Tasks are the wrong lifetime boundary
for multi-hour source verification. Cloud Run Jobs support API execution,
retries, and task timeouts up to seven days. A generic execution also avoids
granting the Nest service permission to run arbitrary job overrides.

- [Create Cloud Run Jobs](https://cloud.google.com/run/docs/create-jobs)
- [Execute Cloud Run Jobs](https://cloud.google.com/run/docs/execute/jobs)
- [Cloud Storage data validation](https://cloud.google.com/storage/docs/data-validation)

## Durable state machine

```text
uploading
  -> verification-queued
  -> verifying
  -> bytes-verified
  -> verified

verification-queued | verifying
  -> failed-retryable
  -> verification-queued

verification-queued | verifying | bytes-verified
  -> failed-terminal
```

`verified` continues to mean both exact cloud bytes and normalized Quipsly
database evidence. `bytes-verified` is deliberately not a playback, processing,
transcription, or local-deletion authorization.

Legacy v2 manifests continue to decode. New worker fields are optional on read
and required only after a manifest enters the long-source lane:

- verification mode: `synchronous | job`;
- queue receipt object and immutable generation;
- claimed worker execution, claim time, expiry, and attempt;
- exact object generation being verified;
- expected and streamed byte counts;
- expected and computed SHA-256;
- GCS CRC32C and MD5 metadata where present;
- worker image/source identity;
- verified or failed time and structured failure code.

## Queue and invocation

Nest writes one create-only queue receipt:

```text
media-vault/control/mobile-capture-verification-queue/<uploadSessionId>.json
```

The receipt contains only the upload-session ID, manifest path, manifest
generation, enqueue time, and contract version. It contains no signed URL,
credential, email, title, or mutable authorization claim.

Nest then calls `jobs.run` without overrides. Invocation failure does not lose
work: the queue object is durable, and a scheduled execution sweeps the same
prefix. Concurrent executions may discover the same receipt, but only one can
claim the manifest generation. Duplicate hashing after an expired lease is
allowed; duplicate authority or divergent finalization is not.

The worker processes a bounded number of receipts per execution and exits.
Poison receipts move to a private dead-letter prefix only after a durable
terminal failure is written to the manifest. Queue deletion occurs after the
manifest write and is recoverably idempotent.

## Verification algorithm

1. Validate the queue filename and JSON before constructing any storage path.
2. Load the manifest by exact generation and verify its contract kind, upload
   session, actor/project binding fields, expected bytes/hash, object path, and
   long-source state.
3. Read immutable object metadata and require the declared bucket, name,
   generation, size, type, and custom binding metadata.
4. Claim the manifest with `ifGenerationMatch`.
5. Open a generation-pinned GCS stream with CRC32C transport validation.
6. Update SHA-256 and streamed byte count incrementally with bounded memory.
7. Require stream completion, exact byte count, exact SHA-256, and unchanged
   generation/metadata.
8. Commit `bytes-verified` evidence with another manifest-generation
   precondition.
9. Remove the queue receipt only after the durable result exists.

The worker never downloads to local disk, rewrites the source, creates a proxy,
or treats client metadata alone as verification.

## Nest finalization

The authenticated finalize endpoint:

- returns `202 verification-queued` while a job receipt is pending;
- returns `202 verifying` while a current claim exists;
- after `bytes-verified`, rechecks actor ownership, room/project binding,
  immutable Start receipt, consent version, processing disposition, and exact
  worker evidence;
- transactionally creates/reuses normalized source, media, recording,
  attachment, transcript, quota, and finalization receipts;
- commits `verified` by manifest generation;
- returns the existing canonical server-verification envelope.

The iPhone polls with bounded jitter and keeps the original. Account changes
cannot poll or mutate another owner's job. Local deletion stays disabled until
the canonical `verified` response is durably stored by the app.

## IAM and secrets

Use a dedicated `quipsly-media-verifier` service account.

It receives only:

- read access to source objects under the mobile-recording prefix;
- read/create/update/delete access to the resumable-manifest and verification
  queue/dead-letter prefixes;
- log writer and metrics writer.

It receives no Cloud SQL access, Secret Manager access, job administration,
service invocation, Firebase administration, or broad bucket administration.
Use IAM Conditions on `resource.name` where Cloud Storage role granularity
would otherwise exceed these prefixes.

The Nest runtime identity receives `run.jobs.run` for this one job, not job
update or override permission. Deployment identities remain separate.

## Runtime and deployment

Build a small dedicated Node image from a committed SHA. It contains only the
worker entrypoint, storage client, hash/state contracts, CA certificates, and
source/build identity. It runs as a non-root user with a read-only root
filesystem and no listening port.

Initial production settings:

- one task per execution;
- parallelism 1 until quota/load evidence supports more;
- 24-hour task timeout;
- two retries with exponential platform backoff;
- bounded receipts per execution;
- CPU always allocated for the task lifetime;
- structured logs containing session ID, object generation, byte counts,
  attempt, timings, and safe failure codes but no user content or capabilities.

Release order:

1. land backward-compatible manifest normalization and tests;
2. land the shared byte-verification state reducer;
3. build worker image from the exact release SHA;
4. deploy job with zero production queue receipts;
5. apply/read back IAM;
6. run synthetic small, >2 GiB sparse/test, corrupt-hash, wrong-generation,
   duplicate-execution, killed-worker, and expired-lease cases;
7. enable creation for staff-owned test sources only;
8. verify exact GCS manifest and database receipts;
9. enable iPhone long-source upload;
10. expose camera UX only after the physical-device matrix passes.

## Required acceptance

- No application server request streams long media.
- A killed worker leaves a replayable queue/manifest and no false success.
- Two workers cannot commit conflicting evidence.
- Hash, byte, generation, metadata, actor, project, room, consent, or Start
  drift fails closed while preserving the source.
- A byte-verified source cannot play, transcribe, attach, or authorize local
  deletion before authenticated Nest finalization.
- A finalized retry returns the original normalized receipt.
- The exact worker image digest and source SHA are present in evidence.
- Metrics and alerts cover queue age, claim age, retry count, hash throughput,
  terminal failures, and bytes awaiting finalization.
- TestFlight acceptance includes a real long 4K iPhone source uploaded through
  background/foreground transitions, job verification, Nest readback, editor
  proxy/alignment, and protected local-original retention.
