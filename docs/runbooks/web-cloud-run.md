# Web Cloud Run Readiness

Date: 2026-05-22

## Purpose

This runbook documents the first safe deployment path for `apps/web`, the
public and operations-facing High Ground Odyssey app that now includes the
internal WorldHub shell at `/team/worldhub`.

This path mirrors the Studio Cloud Run posture:

- prepare a container image in the monorepo
- build with Cloud Build only when explicitly approved
- deploy to Cloud Run only when the required project, secrets, service account,
  and database target are confirmed
- keep secrets out of the repo
- keep provider integrations disabled until later adapter work

Codex can prepare and verify the path. Operators own live Google Cloud
mutations.

## What This Deploys

Cloud Run service:

```text
web
```

App:

```text
apps/web
```

Useful smoke routes:

- `/api/health` - public, non-sensitive health response
- `/` - public High Ground Odyssey home
- `/coaching` - public coaching front door
- `/team/worldhub` - internal WorldHub shell behind existing team auth

Expected health response:

```json
{
  "ok": true,
  "service": "high-ground-studio",
  "app": "web"
}
```

## Checked-In Deployment Files

- `apps/web/Dockerfile`
  - builds the pnpm monorepo
  - runs `pnpm --filter web exec next build --webpack`
  - uses a non-secret build-time `DATABASE_URL` placeholder only so Prisma
    configuration can load during the Next page-data phase
  - uses Next standalone output
  - copies `apps/web/public` and checked-in `apps/web/content`
  - listens on Cloud Run's `PORT`, defaulting to `8080`
- `cloudbuild.web.yaml`
  - builds the web container image
  - tags it for Artifact Registry
  - does not deploy to Cloud Run
- `scripts/web-cloud-run-preflight.mjs`
  - read-only repository and local operator preflight
  - does not deploy, create resources, mutate IAM, mutate secrets, or touch
    databases
- `scripts/web-cloud-run-seed-secrets-from-env.mjs`
  - adds web Secret Manager versions from local env files without printing
    secret values
  - skips secrets that already have enabled versions unless
    `FORCE_WEB_SECRET_VERSION=1` is set
- `scripts/web-cloud-run-deploy.mjs`
  - builds the web image with Cloud Build
  - deploys the image to Cloud Run
  - refuses first-service creation unless `WEB_CLOUD_RUN_CREATE_SERVICE=1` is
    explicitly set
  - runs smoke checks for `/api/health`, `/`, and unauthenticated
    `/team/progress` sign-in redirect
  - applies the same Cloud Run disabled invoker-IAM-check setting used by
    Studio during first-service creation when org policy blocks public invoker
    IAM binding
- `scripts/web-cloud-run-readiness.test.mjs`
  - tests health response shape, Dockerfile expectations, standalone config,
    Cloud Build config, deploy-helper wiring, and preflight read-only behavior
- `.dockerignore`
  - keeps env files, dependencies, build artifacts, logs, and raw
    staging/inbox source material out of the Docker context

## Build Caveat

The default Turbopack production build has been unstable in recent local
verification for this branch, repeatedly hanging at:

```text
Creating an optimized production build ...
```

The documented passing path is:

```bash
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/high_ground_studio \
  pnpm --filter web exec next build --webpack
```

The Dockerfile uses the same webpack builder explicitly. Do not hide this
caveat. Revisit the default build separately before removing `--webpack`.

## Required APIs

Enable only after selecting the intended project and region:

```bash
gcloud services enable \
  artifactregistry.googleapis.com \
  cloudbuild.googleapis.com \
  run.googleapis.com \
  secretmanager.googleapis.com
```

If Cloud SQL will be used for the Prisma database, the Cloud SQL API and Cloud
Run Cloud SQL attachment path must be planned separately. Do not mutate a
remote production database from this runbook.

## Required Runtime Configuration

Required runtime values:

- `DATABASE_URL`
- `AUTH_SECRET`
- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`
- `AUTH_URL`
- `HGO_OWNER_EMAILS`
- `HGO_TEAM_SCHEDULER_EMAILS`
- `HGO_COACH_EMAILS`

Optional runtime values:

- `NEXTAUTH_SECRET` only as legacy fallback if `AUTH_SECRET` is unset
- `HGO_COACHING_DONATION_URL`
- `HGO_COMPANY_FAMILY_SUPPORT_URL`
- `RESEND_API_KEY`
- `HGO_EMAIL_FROM`
- `HGO_SITE_URL`
- `ENABLE_EPISODES_FUMADOCS`

Dormant / not required for the current coaching flow:

- Twilio values used by `apps/web/src/lib/server/sms.ts` if called later

Do not commit real values. Store sensitive values in Secret Manager.

## Manual Setup Checklist

Before mutating any Google Cloud resources, run the local read-only preflight:

```bash
pnpm web:cloudrun:preflight
```

Run the local readiness tests when changing the Dockerfile, health route,
Cloud Build config, preflight script, or runbook:

```bash
pnpm web:cloudrun:test
```

If the expected web secrets exist but do not have enabled versions yet, seed
them from local env files:

```bash
pnpm web:cloudrun:seed-secrets
```

The helper reads `.env` and `apps/web/.env.local` by default. It maps:

| Env value | Secret |
| --- | --- |
| `DATABASE_URL` | `web-database-url` |
| `AUTH_SECRET` | `web-auth-secret` |
| `GOOGLE_CLIENT_ID` | `web-google-client-id` |
| `GOOGLE_CLIENT_SECRET` | `web-google-client-secret` |
| `HGO_OWNER_EMAILS` | `web-owner-emails` |
| `HGO_TEAM_SCHEDULER_EMAILS` | `web-team-scheduler-emails` |
| `HGO_COACH_EMAILS` | `web-coach-emails` |

It does not print secret values. To intentionally add fresh versions even when
enabled versions already exist:

```bash
FORCE_WEB_SECRET_VERSION=1 pnpm web:cloudrun:seed-secrets
```

Set project and region manually:

```bash
gcloud config set project PROJECT_ID
gcloud config set run/region us-central1
```

Create or confirm an Artifact Registry Docker repository:

```bash
gcloud artifacts repositories create high-ground-studio \
  --repository-format=docker \
  --location=us-central1 \
  --description="High Ground Studio container images"
```

Create secrets without putting values in shell history:

```bash
gcloud secrets create web-database-url --replication-policy=automatic
gcloud secrets create web-auth-secret --replication-policy=automatic
gcloud secrets create web-google-client-id --replication-policy=automatic
gcloud secrets create web-google-client-secret --replication-policy=automatic
gcloud secrets create web-owner-emails --replication-policy=automatic
gcloud secrets create web-team-scheduler-emails --replication-policy=automatic
gcloud secrets create web-coach-emails --replication-policy=automatic
```

Add secret versions through the console, or by piping from a secure local
source. Do not commit values to the repo. `GOOGLE_CLIENT_ID` is not a password,
but Cloud Run deploy commands should still mount it from Secret Manager so
operators do not need to paste OAuth identifiers into shell history.

Create a dedicated Cloud Run service account:

```bash
gcloud iam service-accounts create web-cloud-run \
  --display-name="Web Cloud Run runtime"
```

Grant the runtime service account access only to the secrets it needs:

```bash
gcloud secrets add-iam-policy-binding web-database-url \
  --member="serviceAccount:web-cloud-run@PROJECT_ID.iam.gserviceaccount.com" \
  --role="roles/secretmanager.secretAccessor"

gcloud secrets add-iam-policy-binding web-auth-secret \
  --member="serviceAccount:web-cloud-run@PROJECT_ID.iam.gserviceaccount.com" \
  --role="roles/secretmanager.secretAccessor"

gcloud secrets add-iam-policy-binding web-google-client-id \
  --member="serviceAccount:web-cloud-run@PROJECT_ID.iam.gserviceaccount.com" \
  --role="roles/secretmanager.secretAccessor"

gcloud secrets add-iam-policy-binding web-google-client-secret \
  --member="serviceAccount:web-cloud-run@PROJECT_ID.iam.gserviceaccount.com" \
  --role="roles/secretmanager.secretAccessor"

gcloud secrets add-iam-policy-binding web-owner-emails \
  --member="serviceAccount:web-cloud-run@PROJECT_ID.iam.gserviceaccount.com" \
  --role="roles/secretmanager.secretAccessor"

gcloud secrets add-iam-policy-binding web-team-scheduler-emails \
  --member="serviceAccount:web-cloud-run@PROJECT_ID.iam.gserviceaccount.com" \
  --role="roles/secretmanager.secretAccessor"

gcloud secrets add-iam-policy-binding web-coach-emails \
  --member="serviceAccount:web-cloud-run@PROJECT_ID.iam.gserviceaccount.com" \
  --role="roles/secretmanager.secretAccessor"
```

## Build Image

After manual cloud setup is complete, build and push the image with Cloud Build:

```bash
pnpm web:cloudbuild:image:sha
```

To override the default region or image tag:

```bash
pnpm web:cloudbuild:image -- --substitutions=_REGION=us-central1,_IMAGE_TAG=$(git rev-parse --short HEAD)
```

Equivalent direct command:

```bash
gcloud builds submit \
  --config cloudbuild.web.yaml \
  --substitutions=_REGION=us-central1,_IMAGE_TAG=$(git rev-parse --short HEAD) \
  .
```

This builds and pushes an image. It does not deploy the image.

## Deploy Helper

After the `web` Cloud Run service exists, deploy a new image with:

```bash
pnpm web:cloudrun:deploy
```

The helper:

1. Requires a clean working tree unless `ALLOW_DIRTY_DEPLOY=1` is set.
2. Runs `pnpm web:cloudrun:test`.
3. Runs the explicit webpack production build with a local build-time
   `DATABASE_URL`.
4. Runs Cloud Build using `cloudbuild.web.yaml`.
5. Deploys the image to the existing `web` Cloud Run service.
6. Smoke checks `/api/health`, `/`, and `/team/progress`.
7. Prints a rollback command when a previous ready revision exists.

Override knobs:

```bash
WEB_CLOUD_RUN_PROJECT=high-ground-odyssey
WEB_CLOUD_RUN_REGION=us-central1
WEB_CLOUD_RUN_SERVICE=web
WEB_ARTIFACT_REPOSITORY=high-ground-studio
WEB_IMAGE_NAME=web
WEB_IMAGE_TAG=$(git rev-parse --short HEAD)
WEB_LOCAL_DATABASE_URL=postgresql://postgres:postgres@localhost:5432/high_ground_studio
pnpm web:cloudrun:deploy
```

## GitHub Actions CI/CD

`main` now has a GitHub Actions workflow for low-friction Cloud Run deploys:

```text
.github/workflows/deploy-cloud-run.yml
```

The workflow uses Google Workload Identity Federation, not a checked-in service
account key. It impersonates:

```text
github-actions-deployer@high-ground-odyssey.iam.gserviceaccount.com
```

Google Cloud identity resources:

```text
pool: github-actions
provider: github
provider resource:
projects/659427658635/locations/global/workloadIdentityPools/github-actions/providers/github
```

The provider is restricted to:

```text
CharlieLSparrow/high-ground-studio
```

On pushes to `main`, the workflow deploys `web` only when changed files touch
`apps/web`, shared packages, Prisma, workspace dependency files, the web Cloud
Build config, web Cloud Run scripts, or `.dockerignore`.

Manual dispatch is available from GitHub Actions with target choices:

```text
all
web
studio
auto
```

Manual `all` deploys both `web` and `studio` in parallel. The web job runs
`pnpm web:cloudrun:deploy`, so it keeps the same local checks, Cloud Build
image build, Cloud Run deploy, smoke checks, and rollback output as the
operator helper.

## First Service Deploy

The first deploy creates the `web` service and attaches the required runtime
configuration. Only run this after the runtime service account, Secret Manager
versions, Cloud SQL attachment, and OAuth callback plan are understood.

```bash
WEB_CLOUD_RUN_CREATE_SERVICE=1 pnpm web:cloudrun:deploy
```

By default the helper uses:

- service: `web`
- service account: `web-cloud-run@PROJECT_ID.iam.gserviceaccount.com`
- Cloud SQL instance: `PROJECT_ID:us-central1:studio-postgres`
- secret bindings from the web Secret Manager names listed above
- `AUTH_TRUST_HOST=true`
- `HGO_SITE_URL=https://highgroundodyssey.com` on first deploy, unless
  `WEB_HGO_SITE_URL` is set

If `WEB_AUTH_URL` is not set during first deploy, the helper updates `AUTH_URL`
and `HGO_SITE_URL` to the generated Cloud Run service URL after the service is
created. A later custom-domain pass should update both values to the final
public origin after DNS and OAuth callback wiring are confirmed.

The helper also runs:

```bash
gcloud run services update web \
  --region=us-central1 \
  --no-invoker-iam-check
```

This mirrors the current Studio Cloud Run posture. Public web routes still need
unauthenticated HTTP access, while `/team/*` remains protected by app-level
Google OAuth plus role authorization.

## Manual Deploy Command

Do not run this until the database target, secrets, service account, OAuth
callback URL, and rollback target are known.

```bash
gcloud run deploy web \
  --image=us-central1-docker.pkg.dev/PROJECT_ID/high-ground-studio/web:IMAGE_TAG \
  --region=us-central1 \
  --service-account=web-cloud-run@PROJECT_ID.iam.gserviceaccount.com \
  --allow-unauthenticated \
  --port=8080 \
  --set-env-vars=HGO_SITE_URL=https://WEB_SERVICE_URL \
  --set-secrets=DATABASE_URL=web-database-url:latest,AUTH_SECRET=web-auth-secret:latest,GOOGLE_CLIENT_ID=web-google-client-id:latest,GOOGLE_CLIENT_SECRET=web-google-client-secret:latest,HGO_OWNER_EMAILS=web-owner-emails:latest,HGO_TEAM_SCHEDULER_EMAILS=web-team-scheduler-emails:latest,HGO_COACH_EMAILS=web-coach-emails:latest
```

`--allow-unauthenticated` allows public routes and NextAuth sign-in routes to be
reached. Internal `/team/*` routes remain protected by Google OAuth plus app
roles.

After the first service URL exists:

1. Add `https://WEB_SERVICE_URL/api/auth/callback/google` to the Google OAuth
   client.
2. Set `AUTH_URL=https://WEB_SERVICE_URL` on the Cloud Run service.
3. Re-deploy or update the Cloud Run service with that environment value if
   needed.

## Post-Deploy Smoke Test

Run from a normal browser or shell:

```bash
curl -i https://WEB_SERVICE_URL/api/health
curl -I https://WEB_SERVICE_URL/
curl -I https://WEB_SERVICE_URL/coaching
curl -i https://WEB_SERVICE_URL/team/worldhub
```

Expected:

- `/api/health` returns `200` and the web health JSON
- `/` returns a public page
- `/coaching` returns a public page
- `/team/worldhub` redirects unauthenticated users to sign-in
- after sign-in with an authorized team account, `/team/worldhub` renders the
  internal WorldHub prototype shell
- Cloud Run logs show no startup, auth-secret, OAuth callback, or Prisma
  connection errors

Do not use real payment, Patreon, POD, or provider credentials for this smoke.

## Custom Domain Staging

Use a subdomain before moving the root public site.

Current staging target:

```text
app.highgroundodyssey.com
```

Create a mapping:

```bash
gcloud beta run domain-mappings create \
  --service=web \
  --domain=app.highgroundodyssey.com \
  --region=us-central1
```

Cloud Run currently requests:

```text
app CNAME ghs.googlehosted.com.
```

After DNS is added and the certificate is ready, update the runtime origin:

```bash
gcloud run services update web \
  --project=high-ground-odyssey \
  --region=us-central1 \
  --update-env-vars=AUTH_URL=https://app.highgroundodyssey.com,HGO_SITE_URL=https://app.highgroundodyssey.com,AUTH_TRUST_HOST=true
```

Then add the OAuth callback:

```text
https://app.highgroundodyssey.com/api/auth/callback/google
```

Do not move root `highgroundodyssey.com` until the current public-site owner,
DNS zone, and rollback path are confirmed.

## Rollback

List revisions:

```bash
gcloud run revisions list \
  --service=web \
  --region=us-central1
```

Route all traffic back to a known-good revision:

```bash
gcloud run services update-traffic web \
  --region=us-central1 \
  --to-revisions=REVISION_NAME=100
```

If the image should be rebuilt from a previous commit:

```bash
git checkout KNOWN_GOOD_SHA
pnpm web:cloudbuild:image -- --substitutions=_REGION=us-central1,_IMAGE_TAG=KNOWN_GOOD_SHA
```

## What Not To Do

- Do not commit real secrets.
- Do not run `pnpm db:push` against remote data.
- Do not mutate a production database without a migration and rollback plan.
- Do not wire Stripe Checkout, Patreon, POD, Shopify, Printful, Printify,
  Gelato, Fourthwall, or payment provider behavior.
- Do not store or handle payment card data.
- Do not expose `apps/web/content/_inbox` or `apps/web/content/_staging` in the
  container image.
- Do not move private Studio manuscript/source data into `apps/web`.
- Do not change Studio Cloud Run behavior from this runbook.
