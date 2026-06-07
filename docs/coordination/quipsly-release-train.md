# Quipsly Release Train

This is the working release discipline for Quipsly/Nest while the Cloud Run service is still named `studio`.

## Current service reality

- Public app host: `nest.quipsly.com`
- Marketing host: `quipsly.com`
- Legacy/direct Cloud Run host: `studio-hm2odnvjga-uc.a.run.app`
- Cloud Run service name: `studio`
- Dockerfile: `apps/quipsly/Dockerfile`
- Build config: `cloudbuild.studio.yaml`

The service name can be renamed later. For beta, stability matters more than a cosmetic service rename.

## Release shape

1. Build the Quipsly image.
2. Deploy a no-traffic tagged preview revision.
3. Smoke `/api/health`, `/api/healthz`, and `/create`.
4. Promote traffic only after the preview behaves.
5. Preserve rollback by keeping the previous revision traffic target visible.

## Scripts

Preview deploy:

```bash
scripts/release/quipsly-deploy-preview.sh
```

Preview smoke:

```bash
PREVIEW_URL=https://example-preview-url scripts/release/quipsly-smoke-preview.sh
```

Smoke with a host header:

```bash
PREVIEW_URL=https://example-preview-url HOST_HEADER=nest.quipsly.com scripts/release/quipsly-smoke-preview.sh
```

Inspect current traffic:

```bash
scripts/release/quipsly-traffic.sh
```

Promote the preview tag after smoke passes:

```bash
scripts/release/quipsly-promote-preview.sh
```

Rollback to a known revision:

```bash
ROLLBACK_REVISION=studio-00042-abc scripts/release/quipsly-rollback.sh
```

## Health endpoints

- `/api/health` is backward-compatible for old probes.
- `/api/healthz` is the richer release-captain endpoint.

`/api/healthz` intentionally reports only safe booleans and release metadata. It must never print secret values.

## Deploy Captain rules

- Do not deploy directly to live traffic unless Codex/user explicitly says to skip preview.
- Do not run database pushes in the same mental step as app promotion.
- If `/api/healthz` reports missing required runtime config, stop and report.
- If `nest.quipsly.com` serves marketing/article routes instead of the app shell, stop and report host routing drift.
- If preview smoke fails, do not promote and do not retry blindly.
