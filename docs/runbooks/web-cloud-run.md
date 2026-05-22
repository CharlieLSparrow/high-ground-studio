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
- `scripts/web-cloud-run-readiness.test.mjs`
  - tests health response shape, Dockerfile expectations, standalone config,
    Cloud Build config, and preflight read-only behavior
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
gcloud secrets create web-google-client-secret --replication-policy=automatic
gcloud secrets create web-owner-emails --replication-policy=automatic
gcloud secrets create web-team-scheduler-emails --replication-policy=automatic
gcloud secrets create web-coach-emails --replication-policy=automatic
```

Add secret versions through the console, or by piping from a secure local
source. Do not commit values to the repo.

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

## Deploy Command

Do not run this until the database target, secrets, service account, OAuth
callback URL, and rollback target are known.

```bash
gcloud run deploy web \
  --image=us-central1-docker.pkg.dev/PROJECT_ID/high-ground-studio/web:IMAGE_TAG \
  --region=us-central1 \
  --service-account=web-cloud-run@PROJECT_ID.iam.gserviceaccount.com \
  --allow-unauthenticated \
  --port=8080 \
  --set-env-vars=GOOGLE_CLIENT_ID=GOOGLE_CLIENT_ID,HGO_SITE_URL=https://WEB_SERVICE_URL \
  --set-secrets=DATABASE_URL=web-database-url:latest,AUTH_SECRET=web-auth-secret:latest,GOOGLE_CLIENT_SECRET=web-google-client-secret:latest,HGO_OWNER_EMAILS=web-owner-emails:latest,HGO_TEAM_SCHEDULER_EMAILS=web-team-scheduler-emails:latest,HGO_COACH_EMAILS=web-coach-emails:latest
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
