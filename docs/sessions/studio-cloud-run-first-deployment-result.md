# Studio Cloud Run First Deployment Result

Date: 2026-05-19

## Summary

The first operator-led Studio deployment to Google Cloud Run succeeded.

This note records the deployment outcome and the fixes discovered during the
live operator session. It does not contain real secret values, OAuth client
values, project numbers, service URLs, or private source text.

Codex did not run deploys or mutate Google Cloud resources during this
documentation pass.

## Deployment Scope

Deployed service:

```text
studio
```

Runtime target:

```text
Google Cloud Run
```

Primary route proven:

```text
/structure
```

Health route proven:

```text
/api/health
```

The first live deployment remains the browser-local Structure Mode MVP. It does
not depend on a remote `DATABASE_URL`, remote Studio persistence, importers,
public projections, commerce, or AI/ML services.

## What Was Fixed Or Created

### Billing

Billing was fixed for the selected Google Cloud project. This unblocked API
enablement, Cloud Build, Artifact Registry, Secret Manager, and Cloud Run work.

### APIs

The required APIs were enabled in the selected project:

- Cloud Build
- Artifact Registry
- Cloud Run
- Secret Manager

### Artifact Registry

An Artifact Registry Docker repository was created for Studio container images.

The checked-in Cloud Build config still uses the expected default repository
name:

```text
high-ground-studio
```

### Secrets

Secret Manager secrets were created for the first live Studio runtime values.
Actual values are intentionally not recorded in the repo.

Required runtime values for this deployment family remain:

- `AUTH_SECRET`
- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`
- `STUDIO_AUTH_MODE`
- `STUDIO_ALLOWED_EMAILS`
- `AUTH_URL`

Sensitive values should stay in Secret Manager. Plain configuration can remain
normal Cloud Run environment configuration when appropriate.

### Runtime Service Account

A dedicated Cloud Run runtime service account was created for the Studio
service.

The service account should retain only the permissions it needs for this first
MVP, primarily access to the secrets attached to the Cloud Run service.

### Cloud Build IAM

Cloud Build IAM was fixed during the operator session so the build could run
against the selected project and produce the Studio image.

Keep this distinction clear:

- Cloud Build needs permission to run the build.
- The build principal also needs permission to write the resulting image to
  Artifact Registry.

### pnpm Docker Fix

The earlier image build failure was caused by Cloud Build/Corepack selecting a
newer pnpm version than the local workspace uses.

The repo fix is already checked in:

- root `package.json` pins `packageManager` to `pnpm@10.30.3`
- `apps/studio/Dockerfile` prepares and activates `pnpm@10.30.3`
- `pnpm-workspace.yaml` keeps the narrow build-script approval list for Prisma,
  esbuild, and sharp packages

After this fix, the Docker build path could install dependencies consistently.

### Artifact Registry Writer

The image push was blocked until the build principal had Artifact Registry
write access.

The operator fixed this by granting the build principal writer access to the
Artifact Registry image destination. Future operators should check this before
changing Docker, pnpm, or dependency configuration.

### Cloud Run Deployment

Cloud Run deployed the Studio image from Artifact Registry.

The deployed service uses:

- the Studio container image built from the repo
- the dedicated Studio runtime service account
- port `8080`
- Google OAuth
- temporary Studio allowlist auth
- no remote database dependency for the `/structure` MVP

## Invoker Policy Result

The selected organization policy blocked adding an `allUsers` binding for Cloud
Run invocation.

The operator resolved this by disabling the Cloud Run Invoker IAM check for the
Studio service instead of forcing an `allUsers` IAM policy binding.

That means the service can receive browser traffic, while Studio access is still
controlled at the application layer by Google OAuth plus
`STUDIO_AUTH_MODE=allowlist`.

Do not treat the disabled invoker check as general public access permission for
private Studio data. It is only acceptable here because the first live Studio
surface remains protected by app-level OAuth and allowlist checks, and because
`/structure` stores its working draft in the user's browser.

## Auth And OAuth Fix

Sign-in did not settle until the Cloud Run runtime auth configuration matched
the deployed service URL and the correct Google OAuth client.

The successful configuration fixed:

- `AUTH_URL` set to the Cloud Run service origin
- `GOOGLE_CLIENT_ID` set to the intended OAuth client ID
- `GOOGLE_CLIENT_SECRET` set to the matching OAuth client secret
- Google OAuth authorized redirect URI set to the Cloud Run callback URL:

```text
https://<cloud-run-service-url>/api/auth/callback/google
```

The repo should not store the real client ID, client secret, service URL, or
secret values.

## Verification Result

### Health Check

The deployed health route succeeded:

```text
/api/health
```

Expected non-sensitive shape:

```json
{
  "ok": true,
  "service": "high-ground-studio",
  "app": "studio"
}
```

### Sign-In

An allowlisted Google account successfully signed in and reached:

```text
/structure
```

This proves the Cloud Run service, OAuth callback, `AUTH_URL`, OAuth
client/secret pair, and temporary Studio allowlist mode worked together.

### Structure Mode Smoke

Structure Mode passed the first live smoke at the core workflow level:

- `/structure` loaded after sign-in
- browser-local Structure Mode was usable
- the workflow remained scoped to the localStorage MVP
- the route did not require remote Studio database persistence

The important first-live success is that an allowlisted operator could enter
Structure Mode on Cloud Run and use the browser-local workflow. Broader
Structure Mode regression coverage remains in:

```text
docs/runbooks/studio-structure-mode-smoke.md
```

## Remaining Risks

- The Cloud Run invoker behavior depends on an org-policy-compatible exception:
  disabled invoker IAM check plus app-level OAuth/allowlist protection.
- The first live auth mode is temporary. `STUDIO_AUTH_MODE=allowlist` is not the
  durable role/ownership model for Studio.
- Structure Mode is still browser-local. Drafts do not sync across browsers or
  devices and can be lost if browser storage is cleared.
- Tagging Desk and Writing Desk database-backed behavior should still be
  treated as local-development oriented until a remote database boundary is
  explicitly designed and approved.
- There is no infrastructure-as-code record of the Google Cloud resources yet.
  IAM, secrets, Artifact Registry, Cloud Build, and Cloud Run state currently
  live in Google Cloud, not in Terraform or another declarative layer.
- Secret rotation, log review, uptime checks, and alerting are not documented as
  complete.
- The Cloud Run generated URL is sufficient for the first success, but custom
  domain and OAuth callback updates remain separate future work.
- Non-allowlisted account denial should be rechecked after any OAuth,
  `AUTH_URL`, allowlist, or Cloud Run invoker change.

## Next Steps

1. Preserve this deployment as the first known-good Cloud Run baseline.
2. Capture the exact non-secret Google Cloud resource names in a private
   operator note if they are needed for handoff.
3. Add log-based checks or a lightweight uptime check for `/api/health`.
4. Verify non-allowlisted sign-in denial after any auth or invoker setting
   change.
5. Decide whether to keep using the generated Cloud Run URL or move to a custom
   domain.
6. If a custom domain is added, update `AUTH_URL` and the Google OAuth callback
   URI together.
7. Design the remote database boundary before enabling database-backed Studio
   writes in Cloud Run.
8. Consider infrastructure-as-code only after the first manual resource shape is
   stable enough to preserve.
