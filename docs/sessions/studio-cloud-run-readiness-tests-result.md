# Studio Cloud Run Readiness Tests Result

Date: 2026-05-19

## Summary

This pass added lightweight local tests for the Studio Cloud Run readiness
seams most likely to regress:

- temporary allowlist auth helpers
- non-sensitive health response
- read-only preflight script behavior

No test framework dependency was added. The repo did not have an existing test
framework, so this pass uses Node's built-in `node:test` and `assert`.

## What Changed

New pure helper modules:

- `apps/studio/src/lib/studio-auth-mode-core.mjs`
- `apps/studio/src/lib/studio-health.mjs`

The existing server-facing files now wrap those helpers:

- `apps/studio/src/lib/server/studio-auth-mode.ts`
- `apps/studio/src/app/api/health/route.ts`

New test file:

```text
scripts/studio-cloud-run-readiness.test.mjs
```

New command:

```bash
pnpm studio:cloudrun:test
```

## Guardrails Covered

Allowlist auth helper coverage:

- trims and lowercases emails
- parses comma-separated allowlist values
- activates allowlist mode only for exact `allowlist`
- matches allowed emails after normalization
- rejects non-allowed emails
- creates temporary Studio identity for allowed emails
- gives that identity the temporary `OWNER` role
- confirms the temporary role is part of the Studio access role set

Health response coverage:

- exact JSON body:
  - `ok: true`
  - `service: "high-ground-studio"`
  - `app: "studio"`
- `Cache-Control: no-store`

Preflight coverage:

- the script exits successfully when repository readiness files exist
- output states it is read-only and not a deployment
- output states it does not run Cloud Build or deploy Cloud Run
- output reports repository readiness checks passed

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
- No major dependencies.

## Validation

Completed validation:

```bash
pnpm studio:cloudrun:test
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
