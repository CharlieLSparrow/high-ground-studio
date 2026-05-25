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
- `/projection-stage/import` - browser-first HGO staged projection and Content
  Studio packet review with explicit private team save
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
  - installs `openssl` and `ca-certificates` in build and runtime stages so
    Prisma can detect the expected SSL library in the slim Node image
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
  - builds the web image with Cloud Build by default
  - can build and push directly with Docker when
    `WEB_IMAGE_BUILD_STRATEGY=docker`, which is the GitHub Actions path used to
    avoid Cloud Build source-staging bucket friction
  - deploys the image to Cloud Run
  - refuses first-service creation unless `WEB_CLOUD_RUN_CREATE_SERVICE=1` is
    explicitly set
  - runs smoke checks for `/api/health`, `/`, and unauthenticated
    `/team/progress` sign-in redirect
  - applies the same Cloud Run disabled invoker-IAM-check setting used by
    Studio during first-service creation when org policy blocks public invoker
    IAM binding
- `scripts/web-domain-readiness.mjs`
  - read-only checker for the `app.highgroundodyssey.com` Cloud Run domain
    mapping, public DNS, certificate state, and runtime origin values
  - prints the exact DNS, Google OAuth callback, and Cloud Run env cutover
    steps without changing DNS, OAuth, Cloud Run, secrets, IAM, or databases
- `scripts/web-cloud-run-readiness.test.mjs`
  - tests health response shape, Dockerfile expectations, standalone config,
    Cloud Build config, deploy-helper wiring, domain-readiness wiring, and
    preflight read-only behavior
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

Check custom-domain readiness without changing cloud state:

```bash
pnpm web:domain:check
```

Check the active web database target without printing the `DATABASE_URL` secret:

```bash
pnpm web:db:target:report
```

This report reads Cloud Run, the mounted `web-cloudsql-database-url` secret, and the
configured Cloud SQL instance. It prints only derived target metadata such as
provider, host, database name, Cloud SQL databases, and Cloud SQL users. It does
not print the full URL, username, or password.

As of the 2026-05-24 Cloud SQL cutover, the live `web` service mounts
`DATABASE_URL` from `web-cloudsql-database-url`, which targets database `web`
on Cloud SQL instance `high-ground-odyssey:us-central1:studio-postgres`.
The old `web-database-url` secret remains useful as the legacy Neon source and
short-term rollback anchor, but new web runtime revisions should keep mounting
`web-cloudsql-database-url`.

Stage the separate Cloud SQL web target without changing the active runtime
secret:

```bash
pnpm web:cloudsql:prepare
```

By default this prepares:

| Resource | Name |
| --- | --- |
| Cloud SQL instance | `studio-postgres` |
| Cloud SQL database | `web` |
| Cloud SQL user | `web_app` |
| Staged Secret Manager secret | `web-cloudsql-database-url` |
| Runtime service account | `web-cloud-run@PROJECT_ID.iam.gserviceaccount.com` |

The command creates a generated password and Cloud SQL Unix-socket
`DATABASE_URL`, adds it as a version of `web-cloudsql-database-url`, grants the
web runtime service account access to that staged secret, and verifies or grants
`roles/cloudsql.client`. It does **not** update `web-database-url`, redeploy
web, copy data, or cut traffic over to Cloud SQL. Generated passwords and full
connection URLs are never printed.

Useful controls:

```bash
WEB_CLOUDSQL_PREPARE_DRY_RUN=1 pnpm web:cloudsql:prepare
FORCE_WEB_CLOUDSQL_PASSWORD=1 FORCE_WEB_CLOUDSQL_SECRET_VERSION=1 pnpm web:cloudsql:prepare
WEB_CLOUDSQL_GRANT_CLIENT=0 pnpm web:cloudsql:prepare
```

This was the staging path used for the 2026-05-24 cutover. If rebuilding from
scratch or repeating the move in another environment, apply the Prisma schema to
`web-cloudsql-database-url` through a one-off Cloud Run Job before any data
copy or runtime-secret swap.

To inspect the staged secret before it is mounted by the `web` service:

```bash
WEB_DATABASE_SECRET=web-cloudsql-database-url \
WEB_DB_TARGET_REPORT_REQUIRE_MOUNT=0 \
pnpm web:db:target:report
```

After the staged Cloud SQL schema is synced, copy data from the current web
database into the staged target with a one-off Cloud Run Job image built from:

```text
cloudbuild.postgres-copy.yaml
ops/postgres-copy.Dockerfile
ops/postgres-copy-entrypoint.sh
```

The copy job expects:

| Env var | Secret |
| --- | --- |
| `SOURCE_DATABASE_URL` | `web-database-url:latest` |
| `TARGET_DATABASE_URL` | `web-cloudsql-database-url:latest` |

The entrypoint uses PostgreSQL 17 client tools, strips trailing line breaks from
injected Secret Manager env vars, runs a plain `pg_dump --schema=public
--data-only`, removes the Postgres 17-only `SET transaction_timeout` line for
the current Cloud SQL Postgres 16 target, and pipes the result through `psql` with
`ON_ERROR_STOP=1`. It refuses to restore into a non-empty target unless
`POSTGRES_COPY_ALLOW_NONEMPTY_TARGET=1` is explicitly set, and prints only table
row counts. It does not print database URLs or row data.

The successful 2026-05-24 copy job was:

```text
job: web-neon-to-cloudsql-copy-f14c4c7
execution: web-neon-to-cloudsql-copy-f14c4c7-w27bk
image: us-central1-docker.pkg.dev/high-ground-odyssey/high-ground-studio/postgres-copy:f14c4c7
source-before rows: 20
target-before rows: 0
target-after rows: 20
```

The live cutover used a no-traffic smoke revision before routing traffic:

```text
previous live revision: web-00031-4r2
Cloud SQL revision: web-00033-den
tagged smoke URL: https://cloudsql-smoke---web-hm2odnvjga-uc.a.run.app
live URL: https://web-hm2odnvjga-uc.a.run.app
```

Smoke checks passed for `/api/health`, `/`, `/projection-stage/import`, and
unauthenticated `/team/progress` redirect before and after live routing.

The cutover record/story update was then deployed as:

```text
commit: 41dc418
Cloud Build: bd6547a6-43e6-4677-9b95-7094c9380441
deployed revision: web-00034-n4p
image: us-central1-docker.pkg.dev/high-ground-odyssey/high-ground-studio/web:41dc418
```

The pinned-traffic deploy-helper fix was then deployed as:

```text
commit: d4ebbfe
Cloud Build: fbad7319-00f8-4a87-8dfc-671916ac2d4d
current live revision: web-00036-rl9
image: us-central1-docker.pkg.dev/high-ground-odyssey/high-ground-studio/web:d4ebbfe
```

Immediate rollback to the previous Cloud SQL-backed revision:

```bash
gcloud run services update-traffic web \
  --project=high-ground-odyssey \
  --region=us-central1 \
  --to-revisions=web-00034-n4p=100
```

Deeper rollback while the Neon source remains valid:

```bash
gcloud run services update-traffic web \
  --project=high-ground-odyssey \
  --region=us-central1 \
  --to-revisions=web-00031-4r2=100
```

If the expected web secrets exist but do not have enabled versions yet, seed
them from local env files:

```bash
pnpm web:cloudrun:seed-secrets
```

The helper reads `.env` and `apps/web/.env.local` by default. It maps:

| Env value | Secret |
| --- | --- |
| `DATABASE_URL` | `web-cloudsql-database-url` |
| `AUTH_SECRET` | `web-auth-secret` |
| `GOOGLE_CLIENT_ID` | `web-google-client-id` |
| `GOOGLE_CLIENT_SECRET` | `web-google-client-secret` |
| `HGO_OWNER_EMAILS` | `web-owner-emails` |
| `HGO_TEAM_SCHEDULER_EMAILS` | `web-team-scheduler-emails` |
| `HGO_COACH_EMAILS` | `web-coach-emails` |

The deploy helper also mounts optional WorldHub provider secrets when matching
Secret Manager secrets already exist and have an enabled version. This lets
billing, supporter, calendar, email, and merch integrations turn on without
hand-editing Cloud Run configuration:

| Env value | Optional secret |
| --- | --- |
| `STRIPE_SECRET_KEY` | `web-stripe-secret-key` |
| `STRIPE_WEBHOOK_SECRET` | `web-stripe-webhook-secret` |
| `STRIPE_PUBLISHABLE_KEY` | `web-stripe-publishable-key` |
| `STRIPE_COACHING_PRICE_ID` | `web-stripe-coaching-price-id` |
| `STRIPE_SUPPORTER_PRICE_ID` | `web-stripe-supporter-price-id` |
| `STRIPE_SUCCESS_URL` | `web-stripe-success-url` |
| `STRIPE_CANCEL_URL` | `web-stripe-cancel-url` |
| `PATREON_CLIENT_ID` | `web-patreon-client-id` |
| `PATREON_CLIENT_SECRET` | `web-patreon-client-secret` |
| `PATREON_WEBHOOK_SECRET` | `web-patreon-webhook-secret` |
| `PATREON_CAMPAIGN_ID` | `web-patreon-campaign-id` |
| `PATREON_CREATOR_ACCESS_TOKEN` | `web-patreon-creator-access-token` |
| `GOOGLE_CALENDAR_ID` | `web-google-calendar-id` |
| `GOOGLE_CALENDAR_SERVICE_ACCOUNT_JSON` | `web-google-calendar-service-account-json` |
| `GOOGLE_CALENDAR_REFRESH_TOKEN` | `web-google-calendar-refresh-token` |
| `GOOGLE_CALENDAR_IMPERSONATION_EMAIL` | `web-google-calendar-impersonation-email` |
| `GOOGLE_CALENDAR_SYNC_CLIENT_ID` | `web-google-calendar-sync-client-id` |
| `GOOGLE_CALENDAR_SYNC_CLIENT_SECRET` | `web-google-calendar-sync-client-secret` |
| `GOOGLE_CALENDAR_SEND_UPDATES` | `web-google-calendar-send-updates` |
| `HGO_MERCH_PROVIDER` | `web-hgo-merch-provider` |
| `SHOPIFY_ADMIN_ACCESS_TOKEN` | `web-shopify-admin-access-token` |
| `SHOPIFY_STORE_DOMAIN` | `web-shopify-store-domain` |
| `FOURTHWALL_API_KEY` | `web-fourthwall-api-key` |
| `FOURTHWALL_SHOP_URL` | `web-fourthwall-shop-url` |
| `PRINTFUL_API_KEY` | `web-printful-api-key` |
| `PRINTFUL_STORE_ID` | `web-printful-store-id` |
| `PRINTIFY_API_KEY` | `web-printify-api-key` |
| `PRINTIFY_SHOP_ID` | `web-printify-shop-id` |
| `GELATO_API_KEY` | `web-gelato-api-key` |
| `GELATO_STORE_ID` | `web-gelato-store-id` |
| `RESEND_API_KEY` | `web-resend-api-key` |
| `HGO_EMAIL_FROM` | `web-hgo-email-from` |
| `RESEND_WEBHOOK_SECRET` | `web-resend-webhook-secret` |

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
6. Routes 100% traffic to the deployed revision if the service was previously
   pinned to an older revision.
7. Smoke checks `/api/health`, `/`, `/projection-stage/import`, and
   `/team/progress`.
8. Prints a rollback command when a previous ready revision exists.

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
  --set-secrets=DATABASE_URL=web-cloudsql-database-url:latest,AUTH_SECRET=web-auth-secret:latest,GOOGLE_CLIENT_ID=web-google-client-id:latest,GOOGLE_CLIENT_SECRET=web-google-client-secret:latest,HGO_OWNER_EMAILS=web-owner-emails:latest,HGO_TEAM_SCHEDULER_EMAILS=web-team-scheduler-emails:latest,HGO_COACH_EMAILS=web-coach-emails:latest
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

## Custom Domain

The web app now uses a subdomain before moving the root public site.

Current production app origin:

```text
app.highgroundodyssey.com
```

Read-only status check:

```bash
pnpm web:domain:check
```

Current state as of the 2026-05-24 app-domain cutover:

- `app.highgroundodyssey.com` is mapped to Cloud Run service `web`.
- Public DNS has `app.highgroundodyssey.com CNAME ghs.googlehosted.com.`
- Cloud Run managed certificate is provisioned.
- Cloud Run runtime env uses:
  - `AUTH_URL=https://app.highgroundodyssey.com`
  - `HGO_SITE_URL=https://app.highgroundodyssey.com`
  - `AUTH_TRUST_HOST=true`
- The Google OAuth client has this authorized redirect URI:

  ```text
  https://app.highgroundodyssey.com/api/auth/callback/google
  ```

The Cloud Run generated URL remains useful for operations and fallback, but it
is no longer the canonical web origin.

If rebuilding the mapping from scratch, create it with:

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

Public DNS and registrar findings from 2026-05-24:

- `highgroundodyssey.com` is registered through Squarespace Domains.
- Authoritative nameservers are `ns-cloud-a1` through `ns-cloud-a4`.
- root `highgroundodyssey.com` has an A record to `216.198.79.1`.
- `www.highgroundodyssey.com` is a CNAME to a Vercel DNS target.
- `app.highgroundodyssey.com` points to `ghs.googlehosted.com.`
- Cloud DNS API is now enabled in `high-ground-odyssey` and
  `gen-lang-client-0819080752`, but no managed zone for
  `highgroundodyssey.com` is visible in either project.
- Cloud Domains API is now enabled in `high-ground-odyssey`, but no domain
  registration is visible there.
- Enabling Cloud DNS API in `high-ground-schedule` was blocked because that
  project has no billing account attached.
- The authoritative DNS zone likely needs to be updated in Squarespace
  Domains, legacy Google Domains, or another Google Cloud project/account that
  owns the zone.

If the app-domain env ever needs to be restored, update the runtime origin:

```bash
gcloud run services update web \
  --project=high-ground-odyssey \
  --region=us-central1 \
  --update-env-vars=AUTH_URL=https://app.highgroundodyssey.com,HGO_SITE_URL=https://app.highgroundodyssey.com,AUTH_TRUST_HOST=true
```

If traffic is pinned and the env update creates a new revision without moving
traffic, route to the new app-domain revision explicitly:

```bash
gcloud run services update-traffic web \
  --project=high-ground-odyssey \
  --region=us-central1 \
  --to-revisions=<new-revision>=100
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
