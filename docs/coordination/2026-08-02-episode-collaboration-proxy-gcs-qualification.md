# Episode collaboration proxy GCS qualification — 2026-08-02

## Outcome

Quipsly's imported-episode collaboration proxy now has one production-shaped
GCS control lane through the existing private media-processor Cloud Run Job.
The implementation is committed and provider-qualified against the real
`high-ground-odyssey-media` bucket. It has not been deployed.

The exact implementation source is
`59506e8bcc066006745f818fd3b26c5d53b08ab0`. No Cloud Build, Cloud Run Job
execution, Nest deployment, production database write, or user-facing provider
mutation occurred during qualification.

## Architecture

- Imported episode media keeps its canonical `EpisodeCollaborationProxyJob`
  identity. It is not disguised as a native Capture recording and the cloud
  worker receives no database credentials.
- Nest projects the database workflow into a create-once GCS manifest and
  queue receipt below
  `media-vault/control/capture-proxy/episode-collaboration/`.
- The existing processor image drains both the native-Capture and imported-
  episode queues sequentially. Each lane retains its own domain contract while
  sharing one FFmpeg runtime, storage adapter, service identity, and release
  boundary.
- Cloud work claims a generation-conditional lease, materializes exactly one
  source generation, verifies SHA-256 and size, writes a deterministic
  create-once derivative, commits a result receipt, then advances the manifest
  and retires its queue.
- Nest independently re-reads the source and output generations, hashes the
  output, verifies GCS CRC32C and Quipsly object metadata, re-authorizes the
  exact source, and only then calls the common serializable canonical
  registration transaction.
- The local PostgreSQL worker now selects only jobs whose source provider is
  `local`; it cannot steal or terminally fail a GCS job.
- The processor retains object-viewer access for native recordings and adds
  object-viewer access to the exact `media-vault/raw/` managed folder used by
  imported episode sources. It still has no write permission to originals.
  Its existing object-user access remains confined to the proxy and control
  folders.

This follows Google's current guidance: writes and deletes are conditionally
idempotent when bound by generation preconditions, `ifGenerationMatch: 0`
creates only when no live object exists, and Cloud Run Jobs are invoked through
the v2 `jobs.run` boundary with a dedicated invoker identity:

- <https://docs.cloud.google.com/storage/docs/request-preconditions>
- <https://docs.cloud.google.com/storage/docs/retry-strategy>
- <https://docs.cloud.google.com/run/docs/execute/jobs>

## Real GCS operation

The explicit-consent fixture generated a two-second 1280x720 H.264/AAC source,
uploaded it once under `media-vault/raw/processor-fixtures/`, and ran the exact
committed processor locally against Google Cloud Storage.

Fixture job:
`episode-cloud-fixture-20260802193445-5ab8ded6a15f`

Source evidence:

- generation `1785699285772353`;
- 713,840 bytes;
- SHA-256
  `5c796a5fe265f465d18626a6e901216cd54b7cf9f724a7bfdfcc29ad4d69a49f`;
- content type `video/quicktime`; and
- unchanged after processing.

Output evidence:

- generation `1785699288127664`;
- 686,339 bytes;
- SHA-256
  `e8e5cac2ece19a8d7b2c9ee06bbbb02ee7140de1c6b6fe9a863fdce6688c2987`;
- CRC32C `R7GL6Q==`;
- H.264, AAC, yuv420p, 1280x720, 30 fps, 2.005 seconds; and
- fast-start true.

The first execution completed the generation-bound manifest and result. A
second queue replay returned `already-complete` without replacing the output,
result, or completed manifest. The fixture then removed every exact synthetic
object generation. An independent `gcloud storage ls --all-versions` check
found no residual source, control, result, or proxy object.

## Verification

- Shared media contract strict TypeScript: pass.
- Media processor strict TypeScript and production bundle: pass.
- Nest strict TypeScript: pass.
- Local plus cloud episode worker/recovery tests: 11/11.
- Capture plus episode control-plane tests: 10/10.
- Collaboration-proxy route authorization tests: 6/6.
- Complete Quipsly contract run: 238/238.
- gcloud user credentials, ADC, deploy-project access, Firebase project
  access, and Firebase Admin access: pass.
- Real GCS generation, SHA-256, CRC32C, technical media, fast-start,
  create-once replay, original preservation, and exact cleanup: pass.

## Exact remaining production boundary

The deployed `quipsly-media-processor` image predates this commit, and the
production Nest revision does not yet dispatch imported-episode jobs into this
control lane. Production readiness still requires:

1. materialize and inspect a release context from exact committed source;
2. build one immutable processor image and deploy the private zero-idle Job;
3. apply and read back the added read-only `media-vault/raw/` managed-folder
   grant while preserving every existing restriction;
4. run this GCS fixture through the deployed immutable image;
5. release the matching Nest source as a zero-traffic authenticated preview;
6. import a disposable episode clip through rendered Nest, build its proxy,
   reconcile canonical rows, play/pause it, prove outsider denial, and verify
   the original generation remains unchanged; and
7. only then promote the exact accepted Nest revision.

That release should be intentionally batched with other verified work to avoid
returning to the former high-frequency Cloud Build cost pattern.
