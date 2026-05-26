# Studio Cut Insta360 Migration Current Status

Updated: 2026-05-26

This is a handoff note for the live Insta360-to-GCS migration experiment.

## Current State

- Branch: `codex/studio-cut-001-web-shell`
- Firebase Hosting: `https://high-ground-odyssey.web.app`
- Download buffer: `/private/tmp/studio-cut/episode-004/insta360-downloads`
- Operator folder: `/private/tmp/studio-cut/episode-004/insta360-operator`
- GCS prefix: `gs://high-ground-odyssey-media/media-vault/raw/episode-004/homer-insta360/`
- Local drain watcher is running and ready.
- Operator dashboard is running and ready.
- Current local buffer count: `0`
- Current cloud object count for the target prefix: `0`
- Current ledger status: no completed uploads yet.

## What Works

- `pnpm studio-cut:verify` passes.
- The drain watcher can monitor the local buffer, upload settled files, verify GCS object size, and delete only local copies after upload verification.
- The operator dashboard shows local buffer status, cloud prefix status, ledger status, Accessibility status, and next actions.
- macOS Accessibility permission is now enabled for the Insta360 operator path.
- `Cloud Files` and `Export` are visible and targetable through Accessibility.
- A shallow UI snapshot succeeds with the hardened defaults:

```bash
pnpm studio-cut:insta360-operator -- ui-snapshot \
  --out /private/tmp/studio-cut/episode-004/insta360-operator/insta360-ui-snapshot-default.json
```

## Current Blocker

Insta360 Studio is open and `Cloud Files` is targetable, but the current accessible tree does not expose a visible `Download` or `Start Export` control. The cloud file rows also were not exposed in the latest shallow snapshot.

This likely means one of these is still needed:

- Charlie selects one or more cloud files in the Insta360 Studio UI.
- The cloud view needs another navigation/filter step before files are exposed.
- The current app view uses custom-rendered file tiles that require visual inspection rather than Accessibility tree inspection.

## Live Commands

Keep or restart the drain watcher:

```bash
pnpm studio-cut:media-vault -- drain-folder \
  --source-dir /private/tmp/studio-cut/episode-004/insta360-downloads \
  --project-id episode-004 \
  --collection-id homer-insta360 \
  --watch \
  --execute \
  --delete-local-after-upload
```

Open the combined operator dashboard:

```bash
pnpm studio-cut:insta360-operator -- operator-dashboard \
  --project-id episode-004 \
  --collection-id homer-insta360 \
  --download-dir /private/tmp/studio-cut/episode-004/insta360-downloads \
  --operator-dir /private/tmp/studio-cut/episode-004/insta360-operator \
  --include-cloud \
  --watch \
  --open \
  --continue-on-error \
  --allow-blocked
```

Inspect the current UI tree:

```bash
pnpm studio-cut:insta360-operator -- ui-snapshot \
  --max-depth 3 \
  --timeout-seconds 10 \
  --out /private/tmp/studio-cut/episode-004/insta360-operator/insta360-ui-snapshot.json
```

Dry-run target matching:

```bash
pnpm studio-cut:insta360-operator -- click-control --label "Cloud Files"
pnpm studio-cut:insta360-operator -- click-control --label "Export"
pnpm studio-cut:insta360-operator -- download-selected
```

Export a bucket-side inventory:

```bash
pnpm studio-cut:media-vault -- cloud-prefix-inventory \
  --project-id episode-004 \
  --collection-id homer-insta360 \
  --out /private/tmp/studio-cut/episode-004/insta360-operator/cloud-prefix-inventory.json \
  --csv-out /private/tmp/studio-cut/episode-004/insta360-operator/cloud-prefix-inventory.csv
```

## Safety Notes

- Do not commit real media, proxy files, credentials, generated receipts, or generated inventories.
- Do not delete anything from Insta360 Cloud automatically.
- Remote Insta360 deletion remains manual after the ledger and cloud inventory prove the upload.
- Keep the local download buffer outside iCloud-managed folders.

## Next Step

With the drain watcher and dashboard open, select a small batch of cloud files in Insta360 Studio. If a `Download` control appears, run:

```bash
pnpm studio-cut:insta360-operator -- download-selected
```

Only add `--execute` after the dry run matches the expected visible control.
