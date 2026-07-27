# Quipsly capture proxy worker

Status: implemented locally; cloud deployment and private-fixture acceptance
pending

Last reviewed: 2026-07-27

## Purpose

The capture proxy worker turns one released, exact-byte-verified video source
into a collaboration derivative that Episode Room can watch and Quipsly Studio
can place on a timeline. It never replaces, rewrites, or weakens the original
source.

The immutable original remains the editorial source of truth. The proxy is a
bounded H.264/AAC fast-start MP4 for shared playback, scrubbing, and initial
alignment.

## Ownership

| Boundary | Owner | Durable evidence |
| --- | --- | --- |
| Upload and consent release | Nest capture finalizer | upload session, source generation, size, SHA-256, consent disposition |
| Processing request | Nest DB outbox plus shared media-processing contract | committed workflow, immutable manifest binding, create-once queue receipt |
| Transcode | Cloud Run Job | claimed lease, FFmpeg technical probe, immutable output metadata |
| Registration | Nest reconciliation | proxy source, media asset, variant, attachment, completed workflow |
| Editorial use | Episode Room and Studio | canonical imported-media proxy projection; original remains source truth |

## State machine

1. Nest completes the serializable source/asset/episode finalization.
2. Only a `RELEASED` video with source, raw asset, recording asset, episode, and
   verified storage evidence may commit an `asset-proxy` workflow outbox.
3. After the serializable commit, Nest creates the manifest and queue with
   `ifGenerationMatch: 0`. If the process dies in that gap, the next bounded
   mobile-session or Episode Room reconciliation dispatches the complete
   workflow outbox without changing its source binding.
   Successful immediate execution requests are recorded and suppressed for two
   minutes so read traffic cannot create an unbounded job-execution fan-out;
   the five-minute scheduler remains the recovery backstop.
4. The worker loads the latest manifest and claims it with a generation
   compare-and-swap lease.
5. The worker re-reads the exact original generation, checks metadata, streams
   SHA-256 while materializing, and rejects any drift before transcoding.
6. FFmpeg produces a temporary derivative; `ffprobe` proves duration,
   dimensions, frame rate, codecs, pixel format, audio presence, and fast-start
   layout.
7. The worker uploads the deterministic target with
   `ifGenerationMatch: 0`. If a previous execution already wrote it, the worker
   verifies and adopts that immutable object's own metadata instead of
   overwriting it.
8. The worker writes a create-once result receipt, marks the manifest complete,
   and removes the exact queue generation.
9. Nest verifies the result receipt and current stored-object metadata, repeats
   source authorization, locks the Episode Production row, and registers the
   proxy in one serializable transaction.

`blocked` reconciliation work stays retryable and is included in later bounded
reads. Invalid manifests, result receipts, source binding, or stored proxy
evidence fail terminal. Originals remain usable and visible even when proxy
processing fails.

## Media profile

Profile: `collaboration-1080p-h264-aac-v1`

- preserve portrait or landscape orientation;
- scale the long edge to at most 1920 pixels without upscaling;
- H.264 High Profile, level 4.2;
- `yuv420p`;
- AAC at 48 kHz when the source has audio;
- MP4 `+faststart`;
- no edit, crop, denoise, loudness, sync, or source mutation claim.

This is a collaboration proxy, not the final export or camera master.

## Release boundary

The `quipsly-media-processor` release manifest owns a bounded context containing
only:

- the worker application and Dockerfile;
- the shared processing contract;
- root package/lock/workspace inputs;
- the pinned Cloud Build recipe;
- its release manifest and schema.

The deployment script accepts a Git reference, resolves one commit SHA,
materializes only that committed context, builds and pushes the container,
reads its digest, deploys the digest-qualified image, and reads back the job
template. It does not execute the job.

The runtime image uses Node 22 on Debian with distro FFmpeg and runs as the
non-root `worker` user. The job uses one task, one-way parallelism, two CPUs,
4 GiB memory, a six-hour timeout, two platform retries, a four-item sweep, and a
six-hour application lease.

## IAM boundary

The processor service account needs:

- `roles/storage.objectViewer` on `media-vault/recordings/`;
- `roles/storage.objectUser` on
  `media-vault/control/capture-proxy/`;
- `roles/storage.objectUser` on `media-vault/proxy/`.

The Nest runtime needs:

- `roles/storage.objectUser` on the capture-proxy control folder;
- `roles/storage.objectViewer` on the proxy folder;
- `roles/run.jobsExecutor` on the processor job, never
  `roles/run.jobsExecutorWithOverrides`.

The recovery scheduler receives the same no-override executor role and invokes
the job every five minutes. It protects the durable queue if the immediate Nest
invocation fails after commit.

## Local proof

Run:

```bash
pnpm --filter @high-ground/quipsly-media-processing typecheck
pnpm quipsly:media-processor:build
pnpm quipsly:media-processor:test
PATH="/opt/homebrew/bin:$PATH" pnpm quipsly:media-processor:acceptance
pnpm quipsly:contracts:test
```

The real FFmpeg acceptance generates a two-second portrait MOV and requires a
720x1280, 30 fps, H.264/AAC, `yuv420p`, fast-start result. Fault tests cover
authority drift, immutable result registration, crash recovery after output
upload, transient lease release, and terminal source-generation drift.

After committing, prove the exact release context:

```bash
bash scripts/release/quipsly-media-processor-context.test.sh
```

## Cloud qualification

Use explicit values; do not rely on ambient project selection:

```bash
PROJECT_ID=high-ground-odyssey \
QUIPSLY_MEDIA_BUCKET=<private-media-bucket> \
PHASE=prepare \
APPLY=1 \
bash scripts/release/quipsly-media-processor-access.sh

PROJECT_ID=high-ground-odyssey \
QUIPSLY_MEDIA_BUCKET=<private-media-bucket> \
SOURCE_REF=<committed-sha> \
bash scripts/release/quipsly-media-processor-deploy.sh

PROJECT_ID=high-ground-odyssey \
QUIPSLY_MEDIA_BUCKET=<private-media-bucket> \
EXPECTED_BUILD_ID=<committed-sha> \
pnpm quipsly:media-processor:cloud-fixture

PROJECT_ID=high-ground-odyssey \
QUIPSLY_MEDIA_BUCKET=<private-media-bucket> \
PHASE=activate \
APPLY=1 \
bash scripts/release/quipsly-media-processor-access.sh
```

The credentialed cloud fixture is deliberately below Nest: it generation-binds
a unique private two-second portrait video, manifest, and queue; executes the
deployed job twice; downloads the exact source and proxy generations; and
requires the second execution to be a create-once no-op. It preserves its
uniquely prefixed objects for independent inspection by default. Set
`CLEANUP=1` only when those exact fixture generations should be deleted after a
passing run.

After the worker fixture passes, create one synthetic released-video fixture
through Nest and prove the complete reconciliation path:

- original generation, size, and SHA-256 are unchanged;
- queue claim, lease, and completion generations are coherent;
- output custom metadata matches the result receipt and stored object;
- Episode Room changes from **Proxying** to **Ready**;
- Watch can add and play the derivative;
- Studio receives the proxy variant while retaining the original source;
- a second worker execution does not overwrite or duplicate any artifact;
- logs and job readback identify the exact committed source SHA and image
  digest.

Do not enable Nest's processor environment or describe this lane as
cloud-qualified until every item passes.
