# Deploy Captain runbook

Last updated: 2026-06-07

Status: active operating pattern

## Mission

Deploy Captain owns release mechanics so Codex can keep building product during long waits.

This lane should run builds, schema syncs, Cloud Run deploys, and smoke checks. It should not make product changes unless specifically assigned.

## Current production surfaces

- Quipsly Nest app service: `studio`
- Region: `us-central1`
- Primary app URL: `https://nest.quipsly.com`
- Cloud Run fallback URL: `https://studio-hm2odnvjga-uc.a.run.app`
- Artifact repository: `us-central1-docker.pkg.dev/high-ground-odyssey/high-ground-studio`
- Runtime Cloud SQL instance: `high-ground-odyssey:us-central1:studio-postgres`
- Runtime service account: `studio-cloud-run@high-ground-odyssey.iam.gserviceaccount.com`

## Runtime lane split

Deploy Captain is responsible for the Nest Web release lane only unless explicitly assigned otherwise.

- Nest Web: `apps/quipsly`, Cloud Run service `studio`, built inside Linux Cloud Build.
- Quipsly Mac: `apps/quipsly-mac`, native SwiftPM/macOS app, never part of the web Cloud Build context.
- Local Engine: `apps/local-engine`, local Node/WebSocket media worker, never part of the web Cloud Build context.
- Static app assets: currently bundled from `apps/quipsly/public`; do not exclude them from production web deploys until they have moved to object storage/CDN.

See `docs/quipsly/runtime-lanes-and-deploy.md` for the product/runtime boundary.

## Hard rules

- Never print secret values.
- Do not use `prisma db push --accept-data-loss` without explicit Codex/user approval.
- If broad Prisma db-push reports unrelated enum or unique-constraint drift, stop and ask for a narrow migration/sync plan.
- Product code changes belong to feature lanes. Deploy Captain reports failures with exact command, build id, error, and proposed fix.
- Cloud Build deploy steps currently may fail if the Cloud Build compute service account lacks Cloud Run permissions. Local authenticated `gcloud run deploy` is acceptable until IAM is fixed.
- Treat `gcloud run services update --set-secrets` as a full secret environment rewrite. Include every required mounted secret, not only the new one being added.
- Preserve existing Cloud Run env vars, secrets, Cloud SQL bindings, service account, and custom-domain assumptions when deploying a new image. Do not "simplify" a deploy command by dropping runtime config.
- Prefer preview/no-traffic deploy plus smoke before promotion unless Codex/user explicitly asks for a direct live rollout.

## 2026-06-07 pain update

Tonight's release failures were mostly release-mechanics failures, not product failures. Carry these lessons forward:

1. Preserve secrets on Cloud Run deploy.
   - `--set-secrets` replaces the secret env mapping with exactly what is passed.
   - If adding one secret such as `GEMINI_API_KEY`, include all required secrets in the command.
   - Use `gcloud run services describe studio --region=us-central1 --format=yaml` to inspect current env/secrets before changing them.
   - Never print secret values. It is safe to print secret names such as `studio-gemini-api-key`.

2. Do not use broad Prisma push as the default beta fix.
   - Broad `prisma db push` can collide with unrelated enum drift, unique constraints, or partially deployed additive work.
   - Broad push is acceptable only when Codex/user explicitly approves it and the diff is understood.
   - If the app needs one missing table/column, use the targeted schema sync pattern below.

3. Use targeted schema sync for live drift.
   - Add SQL or a narrow Node script that only creates/patches the specific additive shape needed.
   - Run it as a Cloud Run Job using the live service account, Cloud SQL binding, and `DATABASE_URL` secret.
   - Prefer `CREATE TABLE IF NOT EXISTS`, `CREATE INDEX IF NOT EXISTS`, and `ALTER TABLE ... ADD COLUMN IF NOT EXISTS`.
   - After execution, smoke the exact live route that failed. Do not assume the schema job fixed the app.

4. Google OAuth redirect must match the live app host.
   - For Nest auth, Google OAuth must include the `nest.quipsly.com` callback URL used by the app.
   - Keep `AUTH_URL=https://nest.quipsly.com` and `AUTH_TRUST_HOST=true` aligned with the deployed host.
   - If login loops, callback mismatch errors, or redirect-to-marketing behavior appears, inspect OAuth redirect configuration before debugging manuscript/editor code.

5. Chrome smoke is required for auth/session-sensitive routes.
   - CLI curl is enough for static routes and health endpoints.
   - Use Chrome for signed-in flows, admin tools, invite flows, and routes that depend on browser cookies.
   - Minimum Chrome smoke after a Nest deploy:
     - Open `https://nest.quipsly.com/projects`.
     - Confirm the app shell appears, not the marketing site.
     - Open `https://nest.quipsly.com/admin/users`.
     - Confirm only one top nav is visible.
     - Invite a safe test email to a known Nest and confirm no foreign-key error.
     - Open the assigned Nest/project and confirm it is visible after refresh.

6. Cloud Build context bloat is a release blocker.
   - Before `.gcloudignore` cleanup, `gcloud meta list-files-for-upload .` estimated `5700` files / `566.4 MiB`.
   - The biggest accidental upload was `apps/quipsly-mac/.build` at about `450.5 MiB`.
   - After ignoring local build products and non-deploy workspaces, upload estimate is `942` files / `113.5 MiB`.
   - If deploys become slow again, measure context size before blaming Cloud Build itself.

## Standard app image build

Preferred path: use the Quipsly web deploy script. It stages a complete web-only context and deploys the new image without rewriting Cloud Run env/secrets.

```bash
TAG="quipsly-live-$(date +%Y%m%d-%H%M%S)"
IMAGE_TAG="$TAG" scripts/quipsly-web-deploy.sh
```

For build-only/manual image workflows, use the Quipsly-named image-only Cloud Build config:

```bash
TAG="quipsly-live-$(date +%Y%m%d-%H%M%S)"
gcloud builds submit \
  --config cloudbuild.quipsly-web.yaml \
  --substitutions _IMAGE_TAG="$TAG",_NEXT_PUBLIC_STUDIO_COLLAB_URL=wss://studio-collab-hm2odnvjga-uc.a.run.app,_STUDIO_COLLAB_URL=wss://studio-collab-hm2odnvjga-uc.a.run.app .
```

Expected output:

- Cloud Build status `SUCCESS`
- Image exists at `us-central1-docker.pkg.dev/high-ground-odyssey/high-ground-studio/studio:$TAG`
- Build route list includes the feature route being shipped when applicable.

## Standard local authenticated deploy

```bash
IMAGE="us-central1-docker.pkg.dev/high-ground-odyssey/high-ground-studio/studio:$TAG"
gcloud run deploy studio \
  --image="$IMAGE" \
  --region=us-central1 \
  --add-cloudsql-instances=high-ground-odyssey:us-central1:studio-postgres \
  --update-env-vars=NEXT_PUBLIC_STUDIO_COLLAB_URL=wss://studio-collab-hm2odnvjga-uc.a.run.app,STUDIO_COLLAB_URL=wss://studio-collab-hm2odnvjga-uc.a.run.app \
  --quiet
```

Expected output:

- New `studio-*` revision deployed.
- 100 percent traffic routed to the new revision.

## Required studio runtime secrets

When updating secret mounts, include the full set:

```bash
--set-secrets=AUTH_SECRET=studio-auth-secret:latest,GOOGLE_CLIENT_SECRET=studio-google-client-secret:latest,STUDIO_ALLOWED_EMAILS=studio-allowed-emails:latest,DATABASE_URL=studio-database-url:latest,GEMINI_API_KEY=studio-gemini-api-key:latest,PATREON_CLIENT_ID=studio-patreon-client-id:latest,PATREON_CLIENT_SECRET=studio-patreon-client-secret:latest
```

Runtime env should also include:

```bash
AUTH_URL=https://nest.quipsly.com
AUTH_TRUST_HOST=true
STUDIO_AUTH_MODE=allowlist
GOOGLE_CLIENT_ID=659427658635-h633re67ab05kmgnpkcnq5rdhhb4umqn.apps.googleusercontent.com
NEXT_PUBLIC_STUDIO_COLLAB_URL=wss://studio-collab-hm2odnvjga-uc.a.run.app
STUDIO_COLLAB_URL=wss://studio-collab-hm2odnvjga-uc.a.run.app
```

## Narrow schema sync pattern

Use this when one additive feature needs tables and broad Prisma db-push is unsafe due unrelated drift.

1. Add a narrow script under `scripts/`.
2. Copy it into `ops/prisma-migrate.Dockerfile`.
3. Build a schema image:

```bash
TAG="quipsly-schema-$(date +%Y%m%d-%H%M%S)"
gcloud builds submit \
  --config cloudbuild.prisma-migrate.yaml \
  --substitutions _IMAGE_TAG="$TAG" .
```

4. Deploy and execute a Cloud Run Job:

```bash
IMAGE="us-central1-docker.pkg.dev/high-ground-odyssey/high-ground-studio/prisma-migrate:$TAG"
gcloud run jobs deploy quipsly-schema-sync \
  --image="$IMAGE" \
  --region=us-central1 \
  --service-account=studio-cloud-run@high-ground-odyssey.iam.gserviceaccount.com \
  --set-cloudsql-instances=high-ground-odyssey:us-central1:studio-postgres \
  --set-secrets=DATABASE_URL=studio-database-url:latest \
  --command=node \
  --args=scripts/<script-name>.mjs \
  --tasks=1 \
  --max-retries=0 \
  --quiet

gcloud run jobs execute quipsly-schema-sync --region=us-central1 --wait
```

After a schema job:

```bash
gcloud run jobs executions list --job=quipsly-schema-sync --region=us-central1 --limit=3
gcloud logging read 'resource.type="cloud_run_job" AND resource.labels.job_name="quipsly-schema-sync"' --limit=50 --format='value(textPayload)'
```

Expected:

- Job execution succeeds.
- Logs do not print secrets.
- The previously failing live route no longer reports missing table/column errors.

## Quipsly production-core schema sync

The production-core pass added first-class tables for Nest invites, asset attachments, source units, document operations, production rooms, timeline versions, output packets, publish attempts, published artifacts, workflow jobs, and native Mac auth/session handoff. A green readiness response is therefore also the preflight check for `/api/mac/session-exchange`, `/api/mac/session-refresh`, and `/api/mac/session-check`.

Do not deploy app code that depends on these tables until the live database passes:

```bash
curl -sS https://nest.quipsly.com/api/production-core/readiness
```

Expected ready response:

```json
{
  "ok": true,
  "status": "ready"
}
```

If the response says `needs-schema-sync`, run the targeted schema job:

```bash
TAG="quipsly-production-core-schema-$(date +%Y%m%d-%H%M%S)"
gcloud builds submit \
  --config cloudbuild.prisma-migrate.yaml \
  --substitutions _IMAGE_TAG="$TAG" .

IMAGE="us-central1-docker.pkg.dev/high-ground-odyssey/high-ground-studio/prisma-migrate:$TAG"
gcloud run jobs deploy quipsly-production-core-schema-sync \
  --image="$IMAGE" \
  --region=us-central1 \
  --service-account=studio-cloud-run@high-ground-odyssey.iam.gserviceaccount.com \
  --set-cloudsql-instances=high-ground-odyssey:us-central1:studio-postgres \
  --set-secrets=DATABASE_URL=studio-database-url:latest \
  --command=node \
  --args=scripts/quipsly-production-core-schema-sync.mjs \
  --tasks=1 \
  --max-retries=0 \
  --quiet

gcloud run jobs execute quipsly-production-core-schema-sync --region=us-central1 --wait
```

Then verify:

```bash
curl -sS https://nest.quipsly.com/api/production-core/readiness
```

The schema script applies only `ops/quipsly-production-core-additive.sql`. It does not run broad `prisma db push`, does not drop tables, and does not print secret values.

## Smoke checklist

Run these after deploy:

```bash
PREVIEW_URL=<preview-or-live-url> HOST_HEADER=nest.quipsly.com bash scripts/release/quipsly-smoke-preview.sh
curl -I -L -s -o /dev/null -w '%{url_effective} %{http_code}\n' https://nest.quipsly.com
curl -I -L -s -o /dev/null -w '%{url_effective} %{http_code}\n' https://quipsly.com/quipsly-app-icon.png
curl -I -L -s -o /dev/null -w '%{url_effective} %{http_code}\n' https://studio-hm2odnvjga-uc.a.run.app/projects
```

Expected:

- `https://nest.quipsly.com/projects 200`
- Quipsly static assets return `200`
- Studio fallback `/projects` returns a non-500 status.
- `quipsly-smoke-preview.sh` passes `/api/production-core/readiness` and confirms `/api/mac/session-check` returns an expected unauthenticated `401`, not a `500`.

Then run a Chrome smoke for anything auth, admin, invite, editor, or chat related. Curl cannot prove those flows.

## Context-size check

Run this before starting a release if upload time feels suspicious:

```bash
tmp=/tmp/quipsly-gcloud-upload.txt
gcloud meta list-files-for-upload . > "$tmp"
python3 - "$tmp" <<'PY'
import os, sys
count = 0
total = 0
for raw in open(sys.argv[1]):
    p = raw.strip()
    if p and os.path.isfile(p):
        count += 1
        total += os.path.getsize(p)
print(f"files={count}")
print(f"mib={total/1024/1024:.1f}")
PY
```

If it is much higher than roughly `115 MiB`, inspect large included folders before deploying:

```bash
python3 - "$tmp" <<'PY'
import os, sys, collections
sizes = collections.Counter()
for raw in open(sys.argv[1]):
    p = raw.strip()
    if p and os.path.isfile(p):
        sizes[p.split(os.sep, 1)[0]] += os.path.getsize(p)
for name, size in sizes.most_common(20):
    print(f"{size/1024/1024:8.1f} MiB  {name}")
PY
```

## Pipeline improvement backlog

- Keep full-repo Cloud Build context near the current `113.5 MiB` measured upload estimate; investigate if it grows materially.
- Prefer `scripts/quipsly-web-deploy.sh` for Nest Web releases so Mac/local-engine artifacts cannot enter the release context.
- Do not use assetless/partial public deploy contexts. If public assets make deploys too slow, move them to GCS/CDN first.
- Fix Cloud Build service account IAM for Cloud Run deploy or remove the broken deploy step from `cloudbuild.studio.deploy.yaml`.
- Split schema jobs into smaller docker contexts so additive DB syncs do not pay the full app build tax.
- Add a release report template under `docs/coordination/antigravity-reports/AG-Deploy-Captain.md`.
