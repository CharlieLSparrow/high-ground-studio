# Quipsly canonical transcript pipeline

Status: implementation, committed-source release, and least-privilege storage
preparation are complete. Provider activation and production promotion remain
operator-gated by an enabled provider key and the real acceptance sequence.

## Product contract

A verified Capture recording has one immutable media identity. Transcription
may create a new version, but it may not rewrite a version that already has
provider segments or word anchors.

The same canonical transcript version is used by:

- Capture and Nest for status, playback, correction, notes, tasks, and goals;
- QuipslyStudio for word-timed editing and media decisions;
- future publishing and search projections.

Human corrections are review overlays. They do not modify provider words,
provider timings, the raw provider receipt, or source media.

Provider selection is governed by the separate
[private transcript provider evaluation contract](./transcript-provider-evaluation.md).
Deepgram, OpenAI diarized transcription, and Apple on-device transcription are
compared on the same human-approved windows. Quipsly does not compare their
confidence values or collapse accuracy, speaker behavior, timing, correction
effort, latency, cost, policy, and failures into one universal score.

## Runtime architecture

1. Nest rechecks the room and recording consent gate.
2. Nest verifies the exact GCS object generation, size, SHA-256 metadata, media
   type, room, and recording asset identity.
3. Nest creates immutable manifest and queue objects under
   `media-vault/control/transcript/` using create-only generation
   preconditions.
4. Nest requests the dedicated `quipsly-transcript-worker` Cloud Run Job.
   A recovery scheduler also sweeps the same durable queue.
5. The worker claims a generation-guarded lease, re-verifies the source, and
   sends Deepgram a short-lived, generation-bound signed URL. Recording bytes
   are never buffered in Nest or the worker.
6. The raw provider response is stored create-once before normalized results.
   A crash after the provider call therefore reuses that receipt instead of
   issuing another billable request.
7. Nest validates the completed manifest and result, then rechecks consent
   immediately before and again inside the serializable append-only database
   projection.
8. Nest exposes reviewed text plus immutable provider word anchors through an
   authenticated, no-store canonical handoff.
9. QuipslyStudio imports the exact transcript job identity, saves a native
   checkpoint, and reads it back. A different existing transcript is never
   silently overwritten.

## Failure and privacy behavior

| Condition | Behavior |
| --- | --- |
| Source generation, size, or SHA drift | Terminal failure; source remains preserved |
| Transient provider or GCS error | Lease is released; Cloud Run retry or scheduler resumes |
| Crash after provider response | Stored raw response is reused |
| Existing segment or word evidence | New transcript version required |
| Consent revoked before projection | Worker receipt remains private; zero transcript text rows are created |
| Consent revoked after projection | Provider rows remain immutable but the job becomes held and every transcript/packet projection is quarantined |
| Consent explicitly restored | The same provider rows are released after a fresh all-party check; no provider call or row rewrite occurs |
| Worker not configured | Durable outbox remains queued; Nest reports configuration required |
| Superseded handoff URL | HTTP 409; Studio cannot import stale identity |

Provider API keys live only in Secret Manager. The worker receives access to
the Deepgram secret and read-only recording objects. Its mutable access is
limited to manifest leases and queue retirement. Raw provider responses,
normalized results, and dead letters are append-only at the IAM boundary:
the worker has creator plus viewer access, but no overwrite or delete
permission. Nest can create and view manifests and queue receipts, view
results, and execute the job without environment overrides. It receives no
delete/update access to transcript objects, and the worker receives no
database credentials. The access preflight also refuses deployment if either
runtime identity inherits a predefined mutating Storage role from the project,
bucket, a transcript ancestor, or an append-only evidence folder.

## UX behavior

Nest reports `queued`, `running`, `held`, `failed`, or `completed` truthfully.
The correction desk polls a running job without stealing focus. Completed
segments disclose precise word timing; every word can seek the protected
recording to its exact provider timestamp.

QuipslyStudio’s Episode Room source list offers **Import timed transcript**
only for a completed canonical handoff. Import reports segment and word counts
after durable native-session readback.

## Deterministic local proof

```bash
pnpm --filter @high-ground/quipsly-media-processing typecheck
pnpm quipsly:transcript:evaluate:test
pnpm quipsly:transcript-worker:build
pnpm quipsly:transcript-worker:test
pnpm --filter quipsly typecheck

QUIPSLY_LOCAL_DB_SMOKE=1 \
QUIPSLY_LOCAL_DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:5432/high_ground_studio \
pnpm --filter quipsly exec jest --runInBand --runTestsByPath \
  src/lib/server/capture-transcript-privacy.integration.test.ts

cd apps/QuipslyStudio/Sources/QuipslyVideoCore
swift test

cd ../../..
xcodebuild \
  -project QuipslyStudio.xcodeproj \
  -scheme QuipslyMac \
  -configuration Debug \
  -destination 'platform=macOS' \
  CODE_SIGNING_ALLOWED=NO \
  build
```

After the release files are committed:

```bash
bash scripts/release/quipsly-transcript-worker-context.test.sh
```

Before any production migration, exercise the entire committed migration
history twice in a unique isolated PostgreSQL database and verify the transcript
columns, cascading foreign keys, and stable provider-word index:

```bash
MODE=fixture \
SOURCE_REF=COMMITTED_SHA \
PRESERVE_FIXTURE_DATABASE=0 \
bash scripts/release/quipsly-schema-job.sh
```

## Cloud preparation and promotion

The access command is read-only by default. `APPLY=1` creates the dedicated
identities/folders and applies only the declared bindings.

```bash
PROJECT_ID=high-ground-odyssey \
QUIPSLY_MEDIA_BUCKET=YOUR_PRIVATE_MEDIA_BUCKET \
PHASE=prepare \
APPLY=1 \
bash scripts/release/quipsly-transcript-worker-access.sh
```

An enabled Secret Manager version named `quipsly-deepgram-api-key` must exist.
Do not pass or print the key in a command line.

Deploy only a committed SHA:

```bash
PROJECT_ID=high-ground-odyssey \
QUIPSLY_MEDIA_BUCKET=YOUR_PRIVATE_MEDIA_BUCKET \
SOURCE_REF=COMMITTED_SHA \
bash scripts/release/quipsly-transcript-worker-deploy.sh
```

The default image identity is `source-<full-commit-sha>`. The deploy reads
Artifact Registry before Cloud Build and reuses an existing verified digest
for that exact source. An explicit `IMAGE_TAG` must equal the same canonical
source tag, and `REUSE_EXISTING_IMAGE=0` cannot overwrite it. A distinct worker
release identity therefore requires a new commit rather than a misleading tag.

Then activate invoker and recovery permissions:

```bash
PROJECT_ID=high-ground-odyssey \
QUIPSLY_MEDIA_BUCKET=YOUR_PRIVATE_MEDIA_BUCKET \
PHASE=activate \
APPLY=1 \
bash scripts/release/quipsly-transcript-worker-access.sh
```

Run the provider-backed acceptance with a short, authorized, non-sensitive
speech sample. The fixture removes source metadata, converts the sample to a
bounded mono 48 kHz PCM source, uploads it create-once, and never prints
transcript text or the provider request ID. It proves exact source binding,
raw provider receipt durability, normalized timing anchors, committed
build/image identity, queue retirement, and a completed-job replay that does
not replace the source, manifest, provider receipt, or result.

```bash
PROJECT_ID=high-ground-odyssey \
QUIPSLY_MEDIA_BUCKET=high-ground-odyssey-media \
EXPECTED_BUILD_ID=COMMITTED_SHA \
FIXTURE_AUDIO_PATH=/absolute/path/to/authorized-short-speech.wav \
FIXTURE_CONSENT_ACKNOWLEDGED=1 \
pnpm quipsly:transcript-worker:cloud-fixture
```

The evidence is preserved by default. Add `CLEANUP=1` only for a disposable
run; cleanup resolves each exact object generation and deletes only that
generation. The operator must never use confidential production audio as a
fixture.

Nest must be deployed with:

- `QUIPSLY_TRANSCRIPT_WORKER_ENABLED=1`
- `QUIPSLY_TRANSCRIPT_WORKER_PROJECT_ID=high-ground-odyssey`
- `QUIPSLY_TRANSCRIPT_WORKER_REGION=us-central1`
- `QUIPSLY_TRANSCRIPT_WORKER_JOB=quipsly-transcript-worker`

Do not edit those variables directly on the live service. After the worker Job
and activation IAM read back successfully, create a zero-traffic Nest preview
through the canonical release path:

```bash
ENABLE_TRANSCRIPT_WORKER=1 \
PROJECT_ID=high-ground-odyssey \
SOURCE_REF=COMMITTED_SHA \
bash scripts/release/quipsly-deploy-preview.sh
```

This flag fails before build/deploy unless the provider secret has an enabled
version, the worker Job uses an immutable image digest and dedicated service
account, its committed build identity is present, and the Nest runtime has
`roles/run.jobsExecutor` without environment-override authority. The resulting
Nest revision still receives zero traffic until authenticated smoke and normal
promotion.

## Current activation boundary — 2026-08-01

- Google user credentials and ADC can mint tokens and Firebase Admin access is
  healthy after setting ADC quota project `quipsly-reef`.
- `high-ground-odyssey-media` storage preparation and provider-secret IAM pass
  the read-only least-privilege audit.
- Secret resource `quipsly-deepgram-api-key` exists, but it has **zero enabled
  versions**. The key value is not present in the repository, local environment,
  or discovered local key files.
- Cloud Run Job `quipsly-transcript-worker` does not yet exist. Activation IAM
  therefore correctly remains absent and the Nest preview activation gate
  stops at the missing secret version before any build or deployment.

The remaining human-owned setup action is to create or retrieve the authorized
Deepgram API key and add it as a new enabled Secret Manager version named
`quipsly-deepgram-api-key`. Do not paste the key into chat, git, a command-line
argument, or shell history. Once the version exists, rerun the deploy, activate,
fixture, consent-revocation, preview, and promotion sequence above.

Promotion still requires executing this isolated GCS fixture, database
migration, consent-revocation proof, exact image/job/IAM readback, and one real
authorized recording-to-Studio workflow.
