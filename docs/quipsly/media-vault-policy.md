# Quipsly media vault policy

Status: active operating policy
Owner: Quipsly product and media infrastructure
Last reviewed: 2026-07-27

## Decision

Use `gs://high-ground-odyssey-media` as Quipsly's primary product media
vault unless an approved IAM, residency, compliance, lifecycle, or billing
decision requires a separate bucket.

Do not create a separate proxy-only bucket by default.

Buckets store bytes. Quipsly/Nest records own identity, access, attachment,
review state, retention state, and publishing evidence. A recording, proxy,
thumbnail, export, or review packet may share one bucket because its prefix and
app-owned record make the role explicit.

## Authority and source of truth

| Concern | Canonical owner |
| --- | --- |
| Immutable recording/capture evidence | `RecordingAsset` plus upload/finalization receipts |
| Reusable raw or derivative media | `StudioMediaAsset` and `StudioAssetVariant` |
| Nest/project access | `StudioAssetAttachment` and project grants |
| Episode role, sync, and editor meaning | `StudioEpisodeProduction.productionJson` |
| Transcript state | versioned transcript jobs and segments |
| Publication state | Tower/publishing receipts |
| Raw and derivative bytes | object generation in the configured private bucket |

Storage paths are never authorization. A valid object URI without an
authorized app record does not grant access or prove episode meaning.
Buckets are storage; Nests decide who can see and use assets.

## Current bucket map

- `high-ground-odyssey-media`: primary Quipsly media vault.
- `high-ground-odyssey-quipsly-media`: reserved; do not use without an
  explicit migration decision.
- `high-ground-raw-assets`: reserved; do not use without an explicit migration
  decision.
- `high-ground-raw-footage`: legacy/reference storage pending a reviewed
  inventory and migration.
- `high-ground-odyssey_cloudbuild` and `run-sources-*`: build infrastructure,
  not product media.

`QUIPSLY_MEDIA_BUCKET` should point at `high-ground-odyssey-media`.
`LIVEKIT_EGRESS_GCS_BUCKET` should point there too unless the approved
architecture deliberately separates provider egress.

## Object namespace contract

New product media belongs below `media-vault/`:

- `media-vault/raw/<nestSlug>/<episodeOrSession>/<assetId>/<filename>`
- `media-vault/proxy/<nestSlug>/<episodeOrSession>/<assetId>/<filename>`
- `media-vault/thumb/<nestSlug>/<episodeOrSession>/<assetId>/<filename>`
- `media-vault/recordings/livekit/<callRoomId>/<recordingId>/<filename>`
- `media-vault/recordings/mobile/<callRoomId>/<participantOrDevice>/<segmentId>/<filename>`
- `media-vault/exports/<nestSlug>/<episodeSlug>/<version>/<format>/<filename>`
- `media-vault/packets/<nestSlug>/<episodeOrSession>/<packetId>/<filename>`
- `media-vault/review/<nestSlug>/<episodeOrSession>/<reviewId>/<filename>`

Meaning and access: app-owned records, not bucket names.

Object names must use stable, server-authorized identities. A caller-supplied
display name may contribute only to a sanitized final filename; it may not
choose another actor, Nest, room, asset, or object generation.

## Non-negotiable invariants

1. Originals are immutable source evidence. Editor, transcript, proxy, and
   publishing paths must never overwrite, normalize, trim, or silently delete
   them.
2. Every successful write is create-only or generation-preconditioned.
3. A source becomes verified only after exact generation, byte count, media
   type, checksum, and app-owned identity agree.
4. Proxies and thumbnails are replaceable derivatives with an immutable raw
   parent.
5. Exports are versioned products; do not overwrite an earlier export.
6. Provider receipts are evidence, not playable source media.
7. Access is actor- and Nest-scoped before any byte URL, signed capability, or
   metadata is returned.
8. Failed, interrupted, held-consent, or ambiguous-retention sources remain
   preserved and visibly quarantined.
9. Cleanup is a separate reviewed workflow. Successful upload alone never
   authorizes local-original or cloud-original deletion.
10. Logs, diagnostics, manifests, and review packets must not expose signed
    URLs, bearer tokens, provider secrets, or private source bytes.

## Recording-to-editor flow

Podcast/coaching recordings are source assets once verified.

1. A Quipsly room, iPhone, Mac, or approved fallback import creates recording
   evidence bound to a `CallRoom` or capture session.
2. Consent, participant, owner, START/STOP, and immutable upload evidence
   remain attached to that recording identity.
3. Canonical finalization verifies the exact object generation and creates or
   reconciles the `RecordingAsset`.
4. A reviewed promotion creates or reuses the corresponding
   `StudioMediaAsset`; it does not copy or mutate the source merely to attach
   editor meaning.
5. The episode attachment records role, capture group, proxy readiness, and
   sync state in `StudioEpisodeProduction`.
6. Video becomes collaborative-playback ready only after a registered proxy
   receipt points back to the immutable raw parent.
7. Human-reviewed alignment remains reversible metadata over whole sources.

The editor should never need to guess whether a blob is a podcast spine,
participant camera, room composite, reference clip, or b-roll. Quipsly records
must state that role.

## Proxy processing

- Workers claim durable queue records and verify exact source bucket, object,
  generation, identity, and checksum before reading bytes.
- Workers run without root, write a new immutable derivative, verify the final
  media, and register a result receipt before retiring the queue item.
- Retries reuse the same source identity and recover an already-created valid
  output rather than creating duplicates.
- Source-generation or authority drift is terminal and dead-lettered.
- Transient transport or worker failure releases the lease while preserving the
  queue.
- A proxy must be H.264/AAC, browser-decodable, fast-start, and technically
  probed before `proxy-ready` is visible.

## Local editor and device policy

- Quipsly Studio reads originals only from explicitly granted folders or local
  vault paths.
- Local source manifests store stable asset IDs and source evidence, not a
  collaborator's absolute path as portable truth.
- Local proxies live in the local `LocalMediaVault` and may be uploaded only
  after their raw parent and episode attachment are known.
- Quipsly Capture preserves local originals through upload, verification, and
  explicit retention review. Temporary chunks may be retired after canonical
  finalization, but source recordings may not be silently pruned.
- A collaborator without the original receives an authorized cloud proxy or a
  deliberate download/sync action.

## Inventory before migration

Use `scripts/quipsly-local-media-vault-inventory.mjs` before bulk upload,
registration, or cleanup:

```bash
node scripts/quipsly-local-media-vault-inventory.mjs --json
node scripts/quipsly-local-media-vault-inventory.mjs --proxies-only --summary-only --json
node scripts/quipsly-local-media-vault-inventory.mjs \
  --proxies-only \
  --project high-ground-odyssey-manuscript \
  --episode episode-4 \
  --limit 25 \
  --write
```

The inventory is dry-run first. Loose derivatives remain `held-unattached`
until an app-owned record proves their raw parent and intended attachment.
Filename resemblance is not proof.

## Readiness and operator surfaces

- `/api/media-vault/readiness` exposes the side-effect-free media-vault contract
  without provider secrets.
- `/api/media-vault/inventory` exposes raw, derivative, variant, job, and
  attachment truth for an authorized scope.
- `/api/media-vault/episode-inventory` exposes the side-effect-free episode media truth
  and safe next actions without moving bytes or mutating originals.
- `/api/media-vault/proxies/register` registers an already-created derivative
  against its immutable raw asset.
- `/api/mobile/capture/recordings/promote` promotes verified recording evidence
  into reusable media and episode meaning without copying the source.
- `QUIPSLY_ALLOW_MOCK_UPLOADS=true` is development-only scaffolding. Production
  must fail loudly when durable signed upload creation is unavailable.

## Retention and deletion

Quipsly does not yet apply automatic lifecycle deletion to original recordings.
That conservative default is intentional.

- Raw originals: preserve until the approved retention matrix, actor request,
  sharing/consent obligations, legal/payment evidence, verified replicas, and
  recovery window all permit deletion.
- Local originals: delete only through the owner-scoped, path-confined,
  explicitly confirmed flow with a durable tombstone.
- Proxies and thumbnails: regenerable, but delete only when no active
  attachment, export, review, or offline requirement depends on them.
- Temporary upload chunks: retire only after canonical source finalization or
  an explicit abandoned-upload policy.
- Versioned exports and review packets: follow their product record; never infer
  retention from age or filename alone.
- Account deletion: inventory first, fail closed on shared or ambiguous
  records, then execute the approved anonymization/deletion plan with recovery
  and completion receipts.

Any future bucket lifecycle rule needs product, privacy, and recovery review
before activation. A lifecycle configuration is an external mutation and must
be read back after deployment.

## Safe live verification

Use `scripts/verify-cloud-bucket.sh` as the safe live check for this policy.
Default mode is intentionally read-only:

```bash
bash scripts/verify-cloud-bucket.sh
```

It does not create buckets, change CORS, write marker objects, move objects, delete objects, or register app records.

Mutations require explicit intent:

```bash
# Create only when the approved primary bucket is genuinely absent.
PROJECT_ID=high-ground-odyssey LOCATION=US \
  bash scripts/verify-cloud-bucket.sh --create

# Apply reviewed browser upload/playback CORS.
QUIPSLY_CORS_ORIGINS="https://nest.quipsly.com,https://quipsly.com,http://localhost:3012,http://127.0.0.1:3012" \
  bash scripts/verify-cloud-bucket.sh --apply-cors
```

The CORS policy must retain `x-goog-if-generation-match` so a signed create-only
upload cannot overwrite an existing object.

## Audit and migration order

1. Resolve the app-owned source, recording, attachment, and episode record.
2. Inspect the side-effect-free inventory.
3. Generate a dry-run old URI → intended URI → owning record manifest.
4. Review authorization, generation, checksums, destination, and rollback.
5. Copy bytes create-only.
6. Verify the destination independently.
7. Update app-owned references transactionally or through the supported
   reconciliation seam.
8. Read back the user-facing editor/Nest state.
9. Preserve the old object until a separate human-approved cleanup pass.

If evidence is incomplete, stop at inventory. The goal is trustworthy,
portable media—not cosmetically tidy buckets.
