# Quipsly media vault consolidation work order

Status: active, non-destructive.
Updated: 2026-07-08.

## Why this exists

Quipsly has reached the point where Capture, Studio, Nest, Tower, local proxies, podcast recordings, and external-drive exports all touch the same media ecosystem. The failure mode is obvious: agents or humans see a pile of files, invent a folder or bucket meaning, and the editor starts guessing.

This work order prevents that.

## Current decision

Use one primary product media bucket by default:

- `gs://high-ground-odyssey-media`

Use explicit prefixes:

- `media-vault/raw/...`
- `media-vault/proxy/...`
- `media-vault/thumb/...`
- `media-vault/recordings/livekit/...`
- `media-vault/recordings/mobile/...`
- `media-vault/exports/...`
- `media-vault/packets/...`
- `media-vault/review/...`

Do not create a proxy-only bucket unless IAM, lifecycle, billing, residency, or compliance requirements make that split worth the extra operational complexity.

## Evidence from local dry run

Command used:

```bash
node scripts/quipsly-local-media-vault-inventory.mjs --json
```

For operator work, prefer smaller scoped checks before writing a full manifest:

```bash
node scripts/quipsly-local-media-vault-inventory.mjs --proxies-only --summary-only --json
node scripts/quipsly-local-media-vault-inventory.mjs --proxies-only --project high-ground-odyssey-manuscript --episode episode-4 --limit 25 --write
```

These modes keep the proxy migration conversation focused without burying the team in export/review packet files.

Observed summary:

- 28,692 files inspected.
- 97.78 GiB of local proxy/export/review artifacts.
- 173 local proxy files.
- 28,519 export or review artifact files.

This was a dry run. It moved nothing, uploaded nothing, deleted nothing, and did not mutate originals.

## Operating rules

- Buckets store bytes.
- `RecordingAsset` owns call-room recording evidence.
- `StudioMediaAsset` owns reusable editor/media-library assets.
- `StudioAssetAttachment` attaches media to Nests.
- `StudioEpisodeProduction.productionJson.importedMedia` owns episode-editor meaning: role, sync, proxy readiness, and whole-source availability.
- `StudioAssetVariant` and proxy `StudioMediaAsset` records own derivatives.
- Publication receipts belong in Tower/publishing records, not storage paths.

## Proxy migration ladder

1. Inventory local proxies.
2. Map each proxy to a raw `StudioMediaAsset`, verified `RecordingAsset`, or episode source.
3. Upload the proxy to `media-vault/proxy/...` only after the source parent is known.
4. Register it through `/api/media-vault/proxies/register`.
5. Let the editor inventory read the app record, not the bucket folder.
6. Leave local files alone until a separate human-approved cleanup pass.

Do not treat a local proxy filename, old cache folder, or export packet path as enough evidence to upload. The minimum useful proof is the source parent plus the intended Nest/episode attachment.

## Podcast recording attachment ladder

1. Capture or LiveKit creates recording evidence attached to a `CallRoom`.
2. The recording becomes a verified `RecordingAsset`.
3. Transcript jobs attach to the `RecordingAsset`.
4. Promotion creates or reuses `StudioMediaAsset` without copying or mutating the source object.
5. If `episodeSlug` is known, promotion attaches whole-source media to `StudioEpisodeProduction.productionJson.importedMedia`.
6. Video recordings require proxy generation/registration before collaborative editing treats them as proxy-ready.
7. Audio recordings can become spine or reference audio without video proxy requirements.

## Next implementation target

Build one editor-facing media inventory surface that shows, for the current Nest and episode:

- raw/source asset
- proxy status
- thumbnail status
- waveform/transcript status
- recording evidence link
- episode role
- sync status
- safe next action

The editor should not make a user or agent guess from filenames, buckets, or old import folders.

## Safe bucket verifier

Use `scripts/verify-cloud-bucket.sh` before any live media-vault work. It is dry-run by default and exists to answer a narrow question: is the configured bucket aligned with the Quipsly media-vault policy?

It should not be used as a migration script. It does not move loose proxies, attach recordings, create `StudioMediaAsset` records, or decide episode roles.

Allowed default check:

```bash
bash scripts/verify-cloud-bucket.sh
```

Intentional mutations require explicit flags:

- `--create` creates the configured bucket only if it is missing.
- `--apply-cors` applies browser upload/playback CORS.
- `--allow-non-primary` allows a non-primary bucket only after documenting why the split is intentional.

This prevents the old anti-pattern: "the editor needs proxies, therefore create another bucket." The correct first move is almost always: use `gs://high-ground-odyssey-media/media-vault/proxy/...`, register the proxy against its immutable raw asset, and let Quipsly metadata own the meaning.
