# Studio Cloud Run Readiness Result

Date: 2026-05-19

## Summary

This pass prepared `apps/studio` for a first private Google Cloud Run MVP
without deploying.

The target workflow remains:

```text
/structure
```

Structure Mode is useful for the first live pass because it saves the working
draft in browser `localStorage` under:

```text
high-ground-studio.structure-mode.v1
```

No remote database is required for that route.

## What Changed

- Added temporary allowlist auth mode:
  - `STUDIO_AUTH_MODE=allowlist`
  - `STUDIO_ALLOWED_EMAILS=comma,separated,emails`
- Kept Google OAuth and verified email checks as the identity proof.
- Skipped Prisma user provisioning only when allowlist mode is active.
- Added Next standalone output for Studio.
- Added a Studio Dockerfile for Cloud Run.
- Added `.dockerignore` to keep local artifacts, secrets, and large content
  prep directories out of the Docker context.
- Added `cloudbuild.studio.yaml` to build and push a Studio image to Artifact
  Registry.
- Added `pnpm studio:cloudbuild:image` as the manual image-build entrypoint.
- Added a Cloud Run deployment plan and runbook.
- Updated local env docs and the Studio boundary docs.

## What Did Not Happen

- No Cloud Run deployment.
- No Cloud Build submission.
- No Artifact Registry image push.
- No Secret Manager changes.
- No DNS changes.
- No IAM changes in a live Google Cloud project.
- No `db:push`.
- No remote database mutation.
- No committed secrets.
- No Terraform.

## Runtime Configuration For First MVP

Required:

- `AUTH_SECRET`
- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`
- `STUDIO_AUTH_MODE=allowlist`
- `STUDIO_ALLOWED_EMAILS`

Recommended after the Cloud Run service URL exists:

- `AUTH_URL=https://<cloud-run-service-url>`

Do not set `DATABASE_URL` for the first live MVP unless a later pass explicitly
approves the remote database boundary.

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

The successful build produced the expected standalone server file:

```text
apps/studio/.next/standalone/apps/studio/server.js
```

The Docker image itself was not built because this pass did not require Docker
daemon access or any cloud mutation.

## Next Recommended Slice

The next pass should be an operator-led dry run:

1. choose the Google Cloud project and region
2. create Artifact Registry repository
3. create Secret Manager secrets
4. create the least-privilege Cloud Run runtime service account
5. submit the image build
6. deploy to Cloud Run only after explicit approval
7. verify Google OAuth and `/structure`

After the deployed browser-local MVP is stable, the next infrastructure layer is
remote database design, not product polish.
