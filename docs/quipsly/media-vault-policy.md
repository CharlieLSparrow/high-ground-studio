# Quipsly media vault policy

Status: active operating policy, first pass.
Updated: 2026-07-08.

## Decision

Use `gs://high-ground-odyssey-media` as the primary cloud media vault for Quipsly production media unless a future access, region, retention, or billing reason explicitly justifies a separate bucket.

Do not create new buckets just because a workflow needs a new kind of media. Prefer a stable object prefix, app-owned metadata, and explicit lifecycle/permission policy.

Short version: buckets hold bytes; Quipsly records decide what those bytes mean. A proxy, podcast recording, exported short, coaching call, and review packet can live in the same bucket because they have different prefixes, metadata, access attachments, and lifecycle rules.

## Current bucket map

- `high-ground-odyssey-media`: primary Quipsly media vault. Use this for raw uploads, proxies, thumbnails, podcast/coaching recordings, exports, packets, and review artifacts.
- `high-ground-odyssey-quipsly-media`: currently empty/reserved. Do not build new workflows here without an explicit migration decision.
- `high-ground-raw-assets`: currently empty/reserved. Do not build new workflows here without an explicit migration decision.
- `high-ground-raw-footage`: older raw-footage/testing bucket. Treat as legacy/reference until deliberately migrated.
- `high-ground-odyssey_cloudbuild` and `run-sources-*`: build infrastructure, not product media.

2026-07-07 cloud reality check: `high-ground-odyssey-media` exists and already contains Episode 4 source media under `media-vault/raw/...`. The `media-vault/proxy`, `media-vault/thumb`, `media-vault/recordings/livekit`, `media-vault/recordings/mobile`, `media-vault/exports`, `media-vault/packets`, and `media-vault/review` prefixes are the intended homes; several may remain empty until their workflows produce artifacts. Do not create a separate proxy bucket just because the proxy prefix is empty.

2026-07-08 local-engine alignment: `apps/local-engine` now falls back to `high-ground-odyssey-media`, writes local proxy derivatives under `media-vault/proxy/...`, writes thumbnails under `media-vault/thumb/...`, and calls `/api/media-vault/proxies/register` after raw episode media registration when a Nest session token is available. If auth is missing, proxy registration is held visibly instead of being implied.

2026-07-08 capture/editor cleanup: the older one-shot mobile ingest route now uses `media-vault/recordings/mobile/...` instead of the pre-vault `recordings/source/...` prefix. Legacy helper scripts were also moved off hardcoded `high-ground-raw-footage` defaults so future agents do not rediscover the wrong bucket as if it were current architecture.

2026-07-08 env alignment: `QUIPSLY_MEDIA_BUCKET` should point at `high-ground-odyssey-media`. `LIVEKIT_EGRESS_GCS_BUCKET` should also point there unless we deliberately split provider egress for IAM, lifecycle, billing, residency, or compliance. The reserved `high-ground-odyssey-quipsly-media` bucket is not the default proxy or recording destination.

2026-07-08 local inventory reality check: a dry-run local inventory found a real derivative pile: 173 local proxy files plus a much larger export/review artifact set on the external drive. Do not bulk upload or delete these by filename. Treat them as held derivatives until each one maps to a raw `StudioMediaAsset`, `RecordingAsset`, or episode source and can be registered through the app-owned media vault path.

## Object path contract

Every product media object should live under `media-vault/` unless it is explicitly legacy.

Recommended prefixes:

- `media-vault/raw/<nestSlug>/<episodeSlug-or-sessionSlug>/<assetId>/<filename>`
- `media-vault/proxy/<nestSlug>/<episodeSlug-or-sessionSlug>/<assetId>/<filename>`
- `media-vault/thumb/<nestSlug>/<episodeSlug-or-sessionSlug>/<assetId>/<filename>`
- `media-vault/recordings/livekit/<callRoomId>/<timestamp>-room-composite.mp4`
- `media-vault/recordings/mobile/<callRoomId>/<participantOrDevice>/<segmentId>/<filename>`
- `media-vault/exports/<nestSlug>/<episodeSlug>/<version>/<format>/<filename>`
- `media-vault/packets/<nestSlug>/<episodeSlug-or-sessionSlug>/<packetId>/<filename>`
- `media-vault/review/<nestSlug>/<episodeSlug-or-sessionSlug>/<reviewId>/<filename>`

## Source-of-truth rules

- Originals are immutable source evidence. Do not edit, trim, normalize, overwrite, or delete originals from the editor path.
- Proxies are replaceable derivatives. They can be regenerated from source evidence and should point back to their raw asset.
- Exports are versioned products. Never overwrite an old export; create `v001`, `v002`, etc.
- Podcast/coaching recordings are source assets once verified. They should attach to a `CallRoom` first, then to the relevant Nest/project/episode as whole source media for editing.
- Nest/project attachment is metadata. Buckets are storage; Nests decide who can see and use assets.
- External platform publication receipts are evidence records, not media source truth.

## Podcast/editor recording flow

1. A live room, iPhone capture, or fallback import creates recording evidence.
2. That evidence belongs to a `CallRoom` first, because consent, participants, transcript recovery, and provider receipts are call truth.
3. Once storage is verified, a human or agent can promote the recording into reusable Quipsly media.
4. Promotion creates an editor/media reference and Nest attachment without moving or mutating the original object.
5. If the promoted asset is video, Quipsly should create/register a proxy before collaborative editing treats it as playback-ready.
6. The episode editor should use the promoted source/proxy as whole synced source media. Edit decisions remain metadata, not destructive clips.

This is the seam that keeps podcast recordings from becoming a mystery pile of files. The editor should never need to guess whether a blob is a podcast spine, participant track, room composite, reference clip, or b-roll; that role belongs in Quipsly metadata.

The companion operating note is `docs/quipsly/capture-recording-to-podcast-editor-flow.md`. If a future implementation makes the editor infer roles from bucket names, filenames, or folder guesses, it is drifting away from the Quipsly architecture.

## Model mapping

- `RecordingAsset` owns call-room recording evidence: bucket, object path, consent, upload/verification, transcript jobs.
- `StudioMediaAsset` owns reusable editor/media-library assets: raw/proxy/global/project attachment, duration, resolution, thumbnails, variants, processing jobs.
- A verified `RecordingAsset` should be promotable/attachable into `StudioMediaAsset` or an equivalent episode-source association without copying the blob unless a new derivative is needed.

## Local editor policy

- Quipsly Studio should use local originals from explicitly granted folders or local vault paths.
- Local proxies live in the local `LocalMediaVault` and can be uploaded to `media-vault/proxy/...` for collaboration.
- Local session JSON should store stable asset IDs plus local/cache paths, not assume a specific user's absolute original path is portable.
- If a collaborator lacks local originals, the editor should use cloud proxy or request a safe download/sync action.

## Local proxy and export inventory workflow

Use `scripts/quipsly-local-media-vault-inventory.mjs` before any bulk proxy/upload cleanup.

The command inventories local proxy derivatives from `~/Library/Application Support/Quipsly/MediaVault/proxy` and review/export artifacts from `/Volumes/My Passport/Episode_and_Shorts_Test`. It is dry-run only. It writes no cloud objects, deletes nothing, mutates no originals, and marks loose proxy files as `held-unattached` until an app-owned record proves what each derivative belongs to.

Recommended use:

```bash
node scripts/quipsly-local-media-vault-inventory.mjs --json
node scripts/quipsly-local-media-vault-inventory.mjs --proxies-only --summary-only --json
node scripts/quipsly-local-media-vault-inventory.mjs --proxies-only --project high-ground-odyssey-manuscript --episode episode-4 --limit 25 --write
node scripts/quipsly-local-media-vault-inventory.mjs --project high-ground-odyssey-manuscript --episode episode-4 --write
```

Only after the manifest maps a proxy to a raw `StudioMediaAsset`, `RecordingAsset`, or episode source should an agent upload/register that proxy. This prevents cloud storage from becoming a larger version of the local mystery pile.

Use `--proxies-only` when the immediate question is video-editor proxy migration. Use `--summary-only` when humans need a calm dashboard instead of a many-thousand-file manifest. Use `--limit` only for inspection samples; a limited manifest is not proof that every local file is mapped.

## Provider policy

- LiveKit egress writes to `media-vault/recordings/livekit/...`.
- LiveKit egress readiness should use the shared media-vault bucket env list, including `QUIPSLY_MEDIA_BUCKET`. Do not make Capture readiness depend only on old LiveKit-specific bucket names.
- LiveKit egress start is additionally gated by `LIVEKIT_EGRESS_ENABLED=true` so configured provider credentials do not automatically imply permission to start external server recording.
- Mobile Capture uploads should write to `media-vault/recordings/mobile/...`.
- Browser/direct uploads should default to `media-vault/raw/...` unless the caller chooses an allowed media-vault derivative prefix.

## Current implementation hooks

- `apps/quipsly/src/lib/server/media-vault.ts` is the shared path policy for bucket env selection, allowed direct-upload directories, LiveKit recording object names, mobile recording object names, proxy paths, and readiness copy.
- `/api/upload/presigned` uses the shared direct-upload allowlist and can safely mint URLs for `media-vault/raw`, `media-vault/proxy`, `media-vault/thumb`, mobile recordings, exports, packets, and review artifacts.
- `/api/media-vault/readiness` exposes the side-effect-free media-vault contract directly for the native app, local engine, humans, and deploy smoke checks.
- `/api/media-vault/episode-inventory` exposes the side-effect-free episode media truth: imported whole-source media, recording evidence, proxy readiness, transcript readiness, and safe next actions for one Nest episode.
- LiveKit provider egress writes room-composite recordings under `media-vault/recordings/livekit/...`.
- LiveKit provider egress readiness is centralized in `apps/quipsly/src/lib/server/coaching-livekit-egress.ts` so `/api/mobile/capture/readiness`, `/api/coaching/runway`, and the egress helper report one bucket/operator-gate truth.
- Mobile Capture chunk ingest writes assembled source recordings under `media-vault/recordings/mobile/...`.
- `/api/mobile/capture/recordings/promote` promotes a verified `RecordingAsset` into reusable Quipsly media without copying or mutating the source object. The promotion creates a `StudioVideoSource`, `StudioMediaAsset`, Nest attachment, workflow job, and an inspectable `RecordingAsset.localManifestJson.promotion` trail.
- When `episodeSlug` is known, recording promotion also attaches the asset into `StudioEpisodeProduction.productionJson.importedMedia` as whole-source episode media with role, sync, storage, and proxy-readiness metadata.
- `/api/mobile/capture/readiness` exposes non-secret media-vault readiness so deploys and humans can see whether the app is using the intended vault contract.
- `/api/mobile/capture/sessions` and `/api/mobile/capture/review-digest` expose recording promotion status and the next safe promotion action.
- `/api/media-vault/inventory` is the read-only media inventory for a Nest or raw asset: raw source, proxy assets, variants, workflow jobs, attachments, and safe next actions.
- `/api/media-vault/proxies/register` registers an already-created proxy derivative against its immutable raw `StudioMediaAsset`. It does not copy or mutate the original media.
- `scripts/quipsly-local-media-vault-inventory.mjs` inventories local proxy/export files and produces a dry-run manifest for safe future cloud-vault movement.
- Legacy `/api/ingest/mobile` one-shot uploads and `/api/ingest/mobile/chunk` uploads both write source recordings into `media-vault/recordings/mobile/...`; `recordings/source/...` is historical only.
- Mock upload URLs are local-only scaffolding behind `QUIPSLY_ALLOW_MOCK_UPLOADS=true` outside production. Production paths must fail loudly if signed URL generation fails.

## Open follow-ups

1. Replace direct local-engine GCS uploads with `/api/upload/presigned` when the Mac app/Nest auth path is ready to carry the full upload flow.
2. Add an editor-facing proxy inventory panel: raw asset, proxy asset/variant, thumbnail, waveform, transcript, and current processing status in one inspector.
3. Make the episode-production source-role UI first class: spine audio candidate, room mix audio, room composite video, participant camera, reference clip, and b-roll.
4. Add lifecycle policies after real usage is clearer: raw originals retained, proxies regenerable, exports versioned, temporary packets expirable.
5. Backfill existing legacy objects only after a dry-run manifest proves the move is safe.

## Current bucket consolidation note

A read-only project inventory on 2026-07-08 showed multiple media-adjacent buckets, including `high-ground-odyssey-media`, `high-ground-odyssey-quipsly-media`, `high-ground-raw-assets`, and legacy `high-ground-raw-footage`.

Do not create a separate proxy-only bucket by default. Proxies are derivative evidence and should live under `media-vault/proxy/...` in the primary Quipsly media-vault bucket unless a future IAM, lifecycle, billing, residency, or compliance boundary makes a separate bucket worth the operational cost.

For the editor and Capture workflows, the durable rule is:

- Raw/source bytes: `media-vault/raw/...` or `media-vault/recordings/...`.
- Proxy bytes: `media-vault/proxy/...`.
- Thumbnail/still bytes: `media-vault/thumb/...`.
- Export/review packets: `media-vault/exports/...`, `media-vault/review/...`, or `media-vault/packets/...`.
- Meaning and access: app-owned records, not bucket names.

This keeps the bucket structure intentionally boring while letting Nest, Quipsly Studio, Capture, and Tower present much richer product organization.

## Audit and migration rule

When an agent finds loose proxy files, podcast recordings, mobile recordings, or old raw assets outside this policy, it should not improvise a new bucket or silently move objects.

Use this order instead:

1. Inspect the app-owned record first: `RecordingAsset`, `StudioMediaAsset`, `StudioAssetAttachment`, `StudioEpisodeProduction`, or the relevant CallRoom metadata.
2. Use `/api/media-vault/inventory` for read-only truth when an asset or Nest exists.
3. If cloud objects need consolidation, create a dry-run manifest that maps old object URI -> intended `media-vault/...` URI -> app record that will reference it.
4. Only move/copy cloud bytes after the dry-run manifest proves the app record and destination are correct.
5. After copying, update app-owned records to the new URI and leave an audit note. Do not delete the old object until a human-approved retention/cleanup pass.

This deliberately slows down destructive cleanup and speeds up product work. The goal is not perfect bucket tidiness; the goal is that the editor, Capture, Nest, and Tower never have to guess what a recording or proxy file means.

## Near-term consolidation work order

1. Keep `high-ground-odyssey-media` as the primary media vault and use `media-vault/proxy/...` for video editor proxies.
2. Keep local proxies in `~/Library/Application Support/Quipsly/MediaVault/proxy` until an app-owned record proves their raw/source parent.
3. Generate a dry-run manifest with `scripts/quipsly-local-media-vault-inventory.mjs`.
   - Use `--proxies-only --summary-only --json` for the fast operator check.
   - Use `--proxies-only --limit 25 --write` for a small review packet.
   - Do not create a full export/review artifact manifest unless the Tower/release packet workflow needs it.
4. For each mapped proxy, upload to `media-vault/proxy/<nestSlug>/<episodeSlug-or-sessionSlug>/<assetId>/<filename>` through a signed upload or controlled server path.
5. Register the proxy using `/api/media-vault/proxies/register` so the raw asset, proxy asset, variants, workflow jobs, and Nest attachment all agree.
6. For podcast/coaching recordings, promote verified `RecordingAsset` records first. Promotion attaches the recording to `StudioMediaAsset` and `StudioEpisodeProduction.productionJson.importedMedia`; the editor should never infer podcast role from a GCS path alone.
7. Once the editor inventory panel shows raw source, proxy, thumbnail, waveform, transcript, and episode role together, then consider cloud cleanup or lifecycle rules.

## Live bucket verification

Use `scripts/verify-cloud-bucket.sh` as the safe live check for this policy.

Default mode is intentionally read-only:

```bash
bash scripts/verify-cloud-bucket.sh
```

The script verifies gcloud auth, the configured bucket, the primary policy bucket, LiveKit bucket alignment, and the expected `media-vault/...` prefix contract. It does not create buckets, change CORS, write marker objects, move objects, delete objects, or register app records in default mode.

Only use mutation flags when that exact operation is intentional:

```bash
# Create the primary media-vault bucket if it is genuinely missing.
PROJECT_ID=high-ground-odyssey LOCATION=US bash scripts/verify-cloud-bucket.sh --create

# Apply browser upload/playback CORS after reviewing the allowed origins.
QUIPSLY_CORS_ORIGINS="https://nest.quipsly.com,https://quipsly.com,http://localhost:3012,http://127.0.0.1:3012" \
  bash scripts/verify-cloud-bucket.sh --apply-cors
```

The reviewed policy includes `x-goog-if-generation-match` so browser PUTs can
use the signed create-only (`generation = 0`) precondition. Do not remove that
header: without it, an unexpired upload capability could overwrite a registered
proxy at the same object path.

If the script reports that `QUIPSLY_MEDIA_BUCKET` and `LIVEKIT_EGRESS_GCS_BUCKET` differ, do not treat that as automatically broken. Treat it as an explicit architecture decision that needs a reason. The default recommendation remains one boring bucket with clear prefixes and rich Quipsly records.

If gcloud reauthentication blocks the script, run:

```bash
gcloud auth login --update-adc --brief
bash scripts/release/quipsly-gcloud-auth-check.sh
```

Then rerun the bucket verifier.
