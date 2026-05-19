# Studio Cloud Run Readiness Gap Closure Result

Date: 2026-05-19

## Summary

This pass closed the two Cloud Run readiness gaps left after
`app: prepare studio cloud run`:

- added a non-sensitive Studio health route
- added a platform/service boundary document for future commerce,
  subscriptions, multi-site public surfaces, public projections, and AI/ML
  services

It also added a SHA-tagged Cloud Build convenience script for the operator-led
image build path.

## Health Route

New route:

```text
/api/health
```

Expected response:

```json
{
  "ok": true,
  "service": "high-ground-studio",
  "app": "studio"
}
```

The response is intentionally non-sensitive and does not expose version,
environment, secrets, database status, user state, or provider configuration.

## Platform Boundary

New document:

```text
docs/architecture/platform-service-boundaries.md
```

It records the current service split:

- `apps/studio` as the private creative operating system
- `apps/web` as the public and operations-facing app

It also names future boundaries without implementing them:

- commerce and subscriptions
- public projection service
- multi-site public surfaces
- AI and ML services

The doc keeps the first Cloud Run target narrow: deploy only the `studio`
service first, prove health/OAuth/allowlist/`/structure`, and keep commerce,
subscriptions, multi-site public work, and AI/ML services out of the first live
deployment.

## Cloud Build Ergonomics

Added:

```bash
pnpm studio:cloudbuild:image:sha
```

That command tags the image with the current short git SHA using the checked-in
Cloud Build config. It is still an operator command and was not run in this
pass.

The existing override path remains documented:

```bash
pnpm studio:cloudbuild:image -- --substitutions=_REGION=us-central1,_IMAGE_TAG=$(git rev-parse --short HEAD)
```

## What Did Not Happen

- No deploy.
- No Cloud Build submission.
- No Artifact Registry push.
- No Secret Manager changes.
- No DNS changes.
- No IAM changes in a live Google Cloud project.
- No `db:push`.
- No database mutation.
- No real secrets.
- No Terraform.
- No major dependencies.

## Validation

Completed validation:

```bash
pnpm exec prisma validate
pnpm --filter @high-ground/studio-domain typecheck
pnpm --filter studio typecheck
pnpm --filter studio build
git diff --check
```

The first sandboxed `pnpm --filter studio build` attempt hit the known
Turbopack/PostCSS process and local-port restriction. The same command passed
when rerun outside the sandbox.
