# Studio Cloud Run Preflight Result

Date: 2026-05-19

## Summary

This pass added a safe local operator preflight for the eventual manual Studio
Cloud Run deployment session.

New command:

```bash
pnpm studio:cloudrun:preflight
```

The script is read-only. It does not deploy, run Cloud Build, create Google
Cloud resources, change IAM, change DNS, create or mutate secrets, or touch any
database.

## What The Script Checks

Repository readiness:

- `apps/studio/Dockerfile`
- `cloudbuild.studio.yaml`
- `.dockerignore`
- `apps/studio/src/app/api/health/route.ts`
- `.env.example` entries for `STUDIO_AUTH_MODE` and `STUDIO_ALLOWED_EMAILS`
- `docs/runbooks/studio-cloud-run.md`
- `docs/architecture/platform-service-boundaries.md`

Tool readiness:

- `gcloud`
- `docker`
- `pnpm`

Read-only Google Cloud CLI state, when `gcloud` is installed:

- active account
- active project
- configured Cloud Run region

Missing tools or unset `gcloud` config are warnings, not hard failures. Missing
repository readiness files are blocked items.

## Runbook Update

`docs/runbooks/studio-cloud-run.md` now tells the operator to run:

```bash
pnpm studio:cloudrun:preflight
```

before mutating any Google Cloud resources.

## Validation

Completed validation:

```bash
pnpm studio:cloudrun:preflight
pnpm exec prisma validate
pnpm --filter @high-ground/studio-domain typecheck
pnpm --filter studio typecheck
pnpm --filter studio build
git diff --check
```

The first sandboxed `pnpm --filter studio build` attempt hit the known
Turbopack/PostCSS process and local-port restriction. The same command passed
when rerun outside the sandbox.

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
