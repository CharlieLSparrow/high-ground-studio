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
