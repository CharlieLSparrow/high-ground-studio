# Deploy Captain Handoff - Quipsly Beta Readiness

## Current release intent

Prepare and deploy the latest Quipsly/Nest beta pass only after Codex/user approval.

This pass includes:

- Nest route/product language additions (`/nests`, `/nests/[slug]`).
- Beta support page and app-shell support links.
- Recording/editor handoff summaries.
- Publishing destination status rail and destination helper usage.
- Research Library source-aware status labels.
- `/api/beta-readiness` endpoint.
- Expanded `scripts/release/quipsly-smoke-preview.sh` checks.

## Pre-deploy checks

Run only when instructed by the user or Codex release lead:

```bash
pnpm --filter quipsly build
```

If this fails, report exact file/line errors. Do not broad-rewrite unrelated lanes.

## Preview/live smoke

After deploy or preview URL is available:

```bash
PREVIEW_URL=https://<preview-or-live-url> HOST_HEADER=nest.quipsly.com scripts/release/quipsly-smoke-preview.sh
```

Then inspect beta readiness details:

```bash
curl -fsS https://nest.quipsly.com/api/beta-readiness | jq
```

`ok: true` means the endpoint works. `ready: true` means the configured environment is beta-ready by current checks. If `readinessStatus` is `needs-config`, report the specific check IDs before deciding whether to promote.

## Host routing smoke

Confirm:

- `https://quipsly.com/` shows marketing/home.
- `https://quipsly.com/support` shows support/Patreon beta page.
- `https://nest.quipsly.com/` lands in the app workbench/sign-in gate, not marketing.
- `https://nest.quipsly.com/projects` and `/nests` render the Nest hub or app gate.
- Marketing article paths stay on `quipsly.com`, not `nest.quipsly.com`.

## Rollback principle

Promote traffic only after smoke succeeds. If post-promote smoke fails, use the release train rollback script rather than patching live by hand.

## 2026-07-07 coaching public-loop deploy note

Current live public-loop revisions:

- Nest/Quipsly service `studio`: `studio-00355-joz` at 100% traffic.
- HighGroundOdyssey service `web`: `web-00147-vix` at 100% traffic.

Use these post-promote smokes for this lane:

```bash
node scripts/hgo-quipsly-public-route-matrix.mjs --json
node scripts/hgo-quipsly-public-integration-smoke.mjs --json
node scripts/hgo-quipsly-public-loop-status.mjs --json --warn-only
node scripts/quipsly-coaching-payment-contract-smoke.mjs --static-only --json
```

Known deploy wrinkle: `cloudbuild.web.yaml` can push the HGO image successfully, then Cloud Build may still fail with `failed to find one or more images after execution of build steps`. If the image digest/tag is present, deploy that pushed image to `web-preview` with `gcloud run deploy --no-traffic --tag=web-preview`, smoke previews, then promote only after preview proof passes.

Preview-smoke wrinkle: `quipsly.com/coaching` is a custom-domain proxy rewrite to `/public/coaching`. Tagged Cloud Run preview hosts do not have the `quipsly.com` host, so preview smoke should use the preview base URL plus `--quipsly-coaching-path=/public/coaching`; live smoke should keep the default `/coaching` path.
