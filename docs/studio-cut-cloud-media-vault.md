# Studio Cut Cloud Media Vault

Studio Cut needs one predictable cloud home for podcast video, travel video,
photos, source-monitor proxies, Sync Maps, and future publishing artifacts.

This is intentionally separate from the browser editor's local proxy playback:

```text
original camera/photo assets -> Google Cloud Storage media vault
vault asset manifest -> proxy/sync workers -> source-monitor proxy + Sync Map
Studio Cut shared room -> semantic decisions -> local/original render
```

## Safety Boundary

Do not commit:

- service accounts
- `.env` files
- third-party usernames/passwords
- local media manifests for real episodes
- upload plans with local filesystem paths
- original media, proxies, generated renders, or private episode data

If a third-party service password is pasted into chat or a terminal by mistake,
rotate it. Automation should use operator-owned OAuth/session export, official
API credentials, or a local manual download folder. Studio Cut should not store
consumer cloud passwords.

## Proposed Google Cloud Shape

Project:

```text
high-ground-odyssey
```

Primary bucket:

```text
gs://high-ground-odyssey-media
```

Create it only after confirming the active project/account:

```bash
gcloud config get-value project
gcloud auth list
gcloud storage buckets create gs://high-ground-odyssey-media \
  --project high-ground-odyssey \
  --location US \
  --uniform-bucket-level-access
```

Suggested object layout:

```text
media-vault/raw/{projectId}/{collectionId}/originals/{mediaKind}/{captureSource}/{sha12}-{safeFileName}
media-vault/derived/{projectId}/{collectionId}/proxies/{artifactName}
media-vault/metadata/{projectId}/{collectionId}/manifests/{manifestName}.json
media-vault/metadata/{projectId}/{collectionId}/sync-maps/{syncMapName}.json
media-vault/metadata/{projectId}/{collectionId}/reports/{reportName}.json
```

Examples:

```text
media-vault/raw/episode-004/homer-insta360/originals/video/insta360/...
media-vault/raw/travel-utah-001/homer-insta360/originals/photo/insta360/...
media-vault/derived/episode-004/homer-insta360/proxies/source-monitor-proxy.mp4
```

## Local Operator Tool

The media vault helper indexes local folders and writes reviewable upload plans.
It does not upload by default. Upload only happens when `upload-manifest
--execute` is used under the operator's Google Cloud CLI session.

```bash
pnpm studio-cut:media-vault:doctor
pnpm studio-cut:media-vault:smoke
```

### Insta360 Studio Intake

Use this when the Insta360 Studio app, browser download, or SD-card copy has
already placed files somewhere on the Mac. The helper scans common local
Insta360 folders, stages matching `.insv`, `.insp`, `.360`, `.mp4`, `.mov`, and
photo exports into one predictable folder, creates a manifest, and writes an
upload script.

```bash
pnpm studio-cut:media-vault -- discover-insta360
```

Create the local package:

```bash
pnpm studio-cut:media-vault -- create-insta360-package \
  --project-id episode-004 \
  --collection-id homer-insta360 \
  --out-dir ~/Movies/StudioCut/episode-004/media-vault-package
```

If the files are in a known export folder, pass it explicitly:

```bash
pnpm studio-cut:media-vault -- create-insta360-package \
  --project-id episode-004 \
  --collection-id homer-insta360 \
  --scan-dir ~/Movies/Insta360 \
  --scan-dir ~/Downloads/Insta360 \
  --out-dir ~/Movies/StudioCut/episode-004/media-vault-package
```

Dry-run the upload:

```bash
pnpm studio-cut:media-vault -- upload-manifest \
  --manifest ~/Movies/StudioCut/episode-004/media-vault-package/media-vault-manifest.json \
  --source-dir ~/Movies/StudioCut/episode-004/media-vault-package/inbox
```

Upload to the bucket:

```bash
pnpm studio-cut:media-vault -- upload-manifest \
  --manifest ~/Movies/StudioCut/episode-004/media-vault-package/media-vault-manifest.json \
  --source-dir ~/Movies/StudioCut/episode-004/media-vault-package/inbox \
  --execute
```

`create-insta360-package` stages with symlinks by default to avoid duplicating
large files. The upload command resolves symlinks before calling `gcloud
storage cp`. Use `--mode copy` only when the operator wants a physical duplicate
inside the package folder.

For a one-command path after the bucket and `gcloud` auth are ready:

```bash
pnpm studio-cut:media-vault -- create-insta360-package \
  --project-id episode-004 \
  --collection-id homer-insta360 \
  --out-dir ~/Movies/StudioCut/episode-004/media-vault-package \
  --execute-upload
```

This still does not log in to Insta360 Cloud and does not store any third-party
credentials. It only works with local files that already exist on the machine.

### Low-Storage Migration Loop

When local disk space is tight, do not download a whole Insta360 cloud library
before uploading. Use a small local download folder as a buffer:

```text
Insta360 app/Studio/browser download -> local buffer folder -> GCS verified object -> local file deleted -> manual remote delete queue
```

Dry-run the buffer folder:

```bash
pnpm studio-cut:media-vault -- drain-folder \
  --source-dir ~/Movies/StudioCut/episode-004/insta360-downloads \
  --project-id episode-004 \
  --collection-id homer-insta360
```

Run the continuous drain:

```bash
pnpm studio-cut:media-vault -- drain-folder \
  --source-dir ~/Movies/StudioCut/episode-004/insta360-downloads \
  --project-id episode-004 \
  --collection-id homer-insta360 \
  --watch \
  --execute \
  --delete-local-after-upload
```

`drain-folder` only processes files that have settled, so partially downloading
files are skipped until their modification time is older than the configured
settle window. For each processed file it records:

- local relative path
- destination `gs://...` object
- file size
- SHA-256
- media kind
- capture source
- GCS generation/checksum metadata when available

The ledger is written beside the buffer folder by default:

```text
~/Movies/StudioCut/episode-004/insta360-downloads/.studio-cut-media-vault-ledger.jsonl
```

Only local files are deleted, and only after upload plus GCS size verification.
Remote Insta360 Cloud deletion should remain manual until we have an official
API or a fully auditable automation path. The official Insta360 deletion path is
inside the app cloud album, and deleted Insta360+ Cloud Storage files are
recoverable from Recently Deleted for a limited time.

### Generic Folder Intake

Create a manifest:

```bash
pnpm studio-cut:media-vault -- create-manifest \
  --source-dir ~/Movies/StudioCut/episode-004/inbox \
  --project-id episode-004 \
  --collection-id homer-insta360 \
  --out /tmp/episode-004-media-vault.json
```

Plan upload commands:

```bash
pnpm studio-cut:media-vault -- plan-upload \
  --manifest /tmp/episode-004-media-vault.json \
  --source-dir ~/Movies/StudioCut/episode-004/inbox \
  --out /tmp/episode-004-media-vault-upload.sh
```

Review the generated script, then run it from the operator machine if the paths
and bucket are correct:

```bash
bash /tmp/episode-004-media-vault-upload.sh
```

The manifest stores relative paths only. It should still be treated as local
operator metadata for real episodes because file names and collection names can
be private.

## Insta360 Workflow

Short-term:

1. Export/download Insta360 Cloud files using the official app or browser flow.
2. Run `discover-insta360` or pass the export folder with `--scan-dir`.
3. Run `create-insta360-package`.
4. Dry-run `upload-manifest`.
5. Upload to `gs://high-ground-odyssey-media` with `upload-manifest --execute`.
6. Run the proxy/sync worker against the vault manifest.

If discovery misses the app folder, put `.insv`, `.insp`, `.mp4`, `.mov`,
photos, and sidecars in a local intake folder outside the repo, for example:

   ```text
   ~/Movies/StudioCut/episode-004/inbox/
   ```

Future:

- add a connector/importer if Insta360 exposes a safe API or export token flow
- preserve original `.insv`/`.insp` assets in the vault
- generate flattened edit proxies plus optional equirectangular/360 previews
- keep camera-original media immutable and render from Sync Map plus decisions

## 360 Editing Direction

Studio Cut should treat 360 media as source assets with a reframing layer:

```text
360 original -> lightweight equirectangular/proxy -> reframe keyframes -> semantic edit states -> render profile
```

Near-term browser editing should use proxies:

- source-monitor proxy for watchable editing
- optional equirectangular preview for 360 review
- future reframe decisions keyed by canonical episode/travel timeline time

The important durable records are:

- cloud media asset manifest
- Sync Map
- semantic decision events
- future reframe/keyframe decisions

Generated proxies are disposable and can be rebuilt from originals.
