# Studio Cut Media Vault

Local operator helper for preparing High Ground Odyssey video/photo/audio assets
for Google Cloud Storage.

The helper does not log in, store passwords, or upload by default. It builds a
safe manifest from a local folder, then writes explicit `gcloud storage cp`
commands that an operator can review and run.

## Commands

```bash
pnpm studio-cut:media-vault:doctor
pnpm studio-cut:media-vault:smoke
```

Discover likely local Insta360 Studio/export media:

```bash
pnpm studio-cut:media-vault -- discover-insta360
```

Create a complete local Insta360 package:

```bash
pnpm studio-cut:media-vault -- create-insta360-package \
  --project-id episode-004 \
  --collection-id homer-insta360 \
  --out-dir ~/Movies/StudioCut/episode-004/media-vault-package
```

If Insta360 Studio exports live somewhere else, point the helper at that folder:

```bash
pnpm studio-cut:media-vault -- create-insta360-package \
  --project-id episode-004 \
  --collection-id homer-insta360 \
  --scan-dir ~/Movies/Insta360 \
  --scan-dir ~/Downloads/Insta360 \
  --out-dir ~/Movies/StudioCut/episode-004/media-vault-package
```

Dry-run upload:

```bash
pnpm studio-cut:media-vault -- upload-manifest \
  --manifest ~/Movies/StudioCut/episode-004/media-vault-package/media-vault-manifest.json \
  --source-dir ~/Movies/StudioCut/episode-004/media-vault-package/inbox
```

Execute upload with the operator's Google Cloud CLI session:

```bash
pnpm studio-cut:media-vault -- upload-manifest \
  --manifest ~/Movies/StudioCut/episode-004/media-vault-package/media-vault-manifest.json \
  --source-dir ~/Movies/StudioCut/episode-004/media-vault-package/inbox \
  --execute
```

## Low-Storage Drain Mode

Use this when the Insta360 app can only download a few files locally at a time.
Point the app/export process at a local download folder, then run:

```bash
pnpm studio-cut:media-vault -- drain-folder \
  --source-dir ~/Movies/StudioCut/episode-004/insta360-downloads \
  --project-id episode-004 \
  --collection-id homer-insta360
```

That dry-runs the upload plan for settled files. To continuously upload,
verify, and clear local copies:

```bash
pnpm studio-cut:media-vault -- drain-folder \
  --source-dir ~/Movies/StudioCut/episode-004/insta360-downloads \
  --project-id episode-004 \
  --collection-id homer-insta360 \
  --watch \
  --execute \
  --delete-local-after-upload
```

The command writes a local ledger at
`~/Movies/StudioCut/episode-004/insta360-downloads/.studio-cut-media-vault-ledger.jsonl`.
Only local files are deleted, and only after `gcloud storage cp` succeeds and
the GCS object size matches the local file size. Remote Insta360 Cloud deletion
is still a manual app step unless a supported API becomes available.

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

Validate:

```bash
pnpm studio-cut:media-vault -- validate-manifest \
  --manifest /tmp/episode-004-media-vault.json
```

## Privacy Rules

- Do not commit generated manifests for real episodes.
- Do not commit upload plans containing local paths.
- Do not paste or store third-party service passwords in this repo.
- Use Google Cloud CLI auth from the operator's machine.
- Full-resolution originals can live in the vault, but Studio Cut editing should
  still use generated proxies and Sync Maps.
- `create-insta360-package` uses symlinks by default so the staging folder does
  not duplicate huge camera files. `upload-manifest --execute` resolves symlinks
  before calling `gcloud storage cp`.
