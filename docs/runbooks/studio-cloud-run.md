# Studio Cloud Run Readiness

Date: 2026-05-19

## Purpose

This runbook documents the first live private Studio deployment path for Google
Cloud Run.

Codex can deploy from an agent session when Chuck has explicitly approved the
deployment scope, the rollback path is known, and local validation has passed.
Treat live Google Cloud mutation as fast-approval work, not as a reason to avoid
shipping.

First successful deployment result:

- `docs/sessions/studio-cloud-run-first-deployment-result.md`

## Current Deployment Boundary

The first live MVP should run only the browser-local Structure Mode workflow as
the useful production target:

```text
/structure
```

Studio routes remain private:

- `/` - Tagging Desk
- `/write` - Writing Desk
- `/structure` - Structure Mode
- `/content-studio` - browser-local Content Management Studio command board
- `/manuscript` - Manuscript Desk

The health route is intentionally public and non-sensitive:

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

`/structure` is useful without database persistence because it stores its
draft in browser `localStorage` under:

```text
high-ground-studio.structure-mode.v1
```

`/content-studio` is a browser-local internal command surface. It stores the
current board in browser `localStorage`, exports JSON handoff packets, and does
not write server data, call providers, publish content, or expose private
manuscript material.

`/manuscript` is also live and useful through browser-local persistence under:

```text
high-ground-studio.manuscript-editor.v1
```

The Manuscript Desk also has manual server snapshots for cross-device
checkpoints when Cloud Run is configured with the Studio Cloud SQL
`DATABASE_URL` secret and Cloud SQL attachment. These snapshots remain explicit:
no autosave, no simultaneous editing, no Yjs collaboration, and no canonical
manuscript/content writes. The existing local-only persistence guard should
keep other development seed writes disabled in Cloud Run.

## Checked-In Deployment Files

- `apps/studio/Dockerfile`
  - builds the pnpm monorepo
  - runs `pnpm --filter studio build`
  - uses Next standalone output
  - listens on Cloud Run's `PORT`, defaulting to `8080`
- `cloudbuild.studio.yaml`
  - builds the Studio container image
  - tags it for Artifact Registry
  - does not deploy to Cloud Run
- `cloudbuild.studio.deploy.yaml`
  - builds the Studio container image
  - deploys the image to the existing Cloud Run service
  - intended for Cloud Build triggers after the Cloud Build service account has
    deploy permissions
- `scripts/studio-cloud-run-deploy.mjs`
  - local one-command build/deploy/smoke helper
  - requires a clean working tree unless `ALLOW_DIRTY_DEPLOY=1`
  - runs Studio typecheck and Cloud Run readiness tests unless
    `SKIP_LOCAL_CHECKS=1`
  - builds through Cloud Build by default, or builds and pushes directly with
    Docker when `STUDIO_IMAGE_BUILD_STRATEGY=docker`
  - deploys the image, smokes `/api/health` and `/content-studio`, and prints a
    rollback command
- `.dockerignore`
  - keeps local build artifacts, dependencies, logs, env files, and large
    staging/inbox content out of the Docker context

## Required Runtime Configuration

Use Google OAuth with the temporary Studio allowlist mode:

```text
STUDIO_AUTH_MODE=allowlist
STUDIO_ALLOWED_EMAILS=owner@example.com,collaborator@example.com
```

Required runtime values:

- `AUTH_SECRET`
- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`
- `STUDIO_AUTH_MODE`
- `STUDIO_ALLOWED_EMAILS`

Set after the service URL exists and before the auth smoke:

- `AUTH_URL`

Do not commit real values. Store sensitive values in Secret Manager.

## Manual Setup Checklist

Run these manually from a workstation after selecting the project and region.
The examples use placeholders.

Before mutating any Google Cloud resources, run the local read-only preflight:

```bash
pnpm studio:cloudrun:preflight
```

That script checks repository readiness, local tool availability, and read-only
`gcloud` account/project/region configuration. It does not deploy, run Cloud
Build, create resources, change IAM, change DNS, create secrets, or mutate any
database.

Run the local readiness tests when changing the allowlist auth path, health
route, or preflight script:

```bash
pnpm studio:cloudrun:test
```

```bash
gcloud config set project PROJECT_ID
gcloud config set run/region us-central1
```

Enable APIs:

```bash
gcloud services enable \
  artifactregistry.googleapis.com \
  cloudbuild.googleapis.com \
  run.googleapis.com \
  secretmanager.googleapis.com
```

Create an Artifact Registry Docker repository:

```bash
gcloud artifacts repositories create high-ground-studio \
  --repository-format=docker \
  --location=us-central1 \
  --description="High Ground Studio container images"
```

Create secrets without putting values in shell history:

```bash
gcloud secrets create studio-auth-secret --replication-policy=automatic
gcloud secrets create studio-google-client-secret --replication-policy=automatic
gcloud secrets create studio-allowed-emails --replication-policy=automatic
```

Add secret versions through the console, or by piping from a secure local
source. Do not commit values to the repo.

Create a dedicated Cloud Run service account:

```bash
gcloud iam service-accounts create studio-cloud-run \
  --display-name="Studio Cloud Run runtime"
```

Grant the runtime service account access to only the secrets it needs:

```bash
gcloud secrets add-iam-policy-binding studio-auth-secret \
  --member="serviceAccount:studio-cloud-run@PROJECT_ID.iam.gserviceaccount.com" \
  --role="roles/secretmanager.secretAccessor"

gcloud secrets add-iam-policy-binding studio-google-client-secret \
  --member="serviceAccount:studio-cloud-run@PROJECT_ID.iam.gserviceaccount.com" \
  --role="roles/secretmanager.secretAccessor"

gcloud secrets add-iam-policy-binding studio-allowed-emails \
  --member="serviceAccount:studio-cloud-run@PROJECT_ID.iam.gserviceaccount.com" \
  --role="roles/secretmanager.secretAccessor"
```

## Build Image

After the manual cloud setup is complete, build and push the image with Cloud
Build:

```bash
pnpm studio:cloudbuild:image:sha
```

The Docker build path is pinned to `pnpm@10.30.3` through the root
`packageManager` field and `apps/studio/Dockerfile`. The workspace build-script
approval list is intentionally narrow in `pnpm-workspace.yaml`:

```yaml
onlyBuiltDependencies:
  - '@prisma/engines'
  - esbuild
  - prisma
  - sharp
```

If Cloud Build reports `ERR_PNPM_IGNORED_BUILDS`, first verify the build is
using the pushed commit with the pnpm pin and this approval list before
changing dependencies or approving additional packages.

To override the default region or image tag, use:

```bash
pnpm studio:cloudbuild:image -- --substitutions=_REGION=us-central1,_IMAGE_TAG=$(git rev-parse --short HEAD)
```

Equivalent direct command:

```bash
gcloud builds submit \
  --config cloudbuild.studio.yaml \
  --substitutions=_REGION=us-central1,_IMAGE_TAG=$(git rev-parse --short HEAD) \
  .
```

This builds and pushes an image. It does not deploy the image.

## One-Command Deploy

For the current fast-shipping posture, use the deploy helper from a clean
branch after the desired commit is pushed:

```bash
pnpm studio:cloudrun:deploy
```

Defaults:

- project: active `gcloud config get-value project`
- region: active `gcloud config get-value run/region`, falling back to
  `us-central1`
- service: `studio`
- image tag: current short git SHA
- image repository: `high-ground-studio`

Useful overrides:

```bash
STUDIO_CLOUD_RUN_PROJECT=high-ground-odyssey \
STUDIO_CLOUD_RUN_REGION=us-central1 \
STUDIO_CLOUD_RUN_SERVICE=studio \
pnpm studio:cloudrun:deploy
```

The helper updates only the Cloud Run image for the existing service. It relies
on the existing service configuration for auth, secrets, service account, and
invoker posture.

Rollback command shape:

```bash
gcloud run services update-traffic studio \
  --project=high-ground-odyssey \
  --region=us-central1 \
  --to-revisions=PREVIOUS_REVISION=100
```

## GitHub Actions CI/CD

`main` now has a GitHub Actions workflow for Cloud Run deploys:

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

On pushes to `main`, the workflow deploys `studio` only when changed files
touch `apps/studio`, shared packages, Prisma, workspace dependency files, the
Studio Cloud Build configs, Studio Cloud Run scripts, or `.dockerignore`.

Manual dispatch is available from GitHub Actions with target choices:

```text
all
web
studio
auto
```

Manual `all` deploys both `studio` and `web` in parallel. The Studio job runs
`pnpm studio:cloudrun:deploy`, so it keeps the same typecheck, readiness test,
Cloud Build image build, Cloud Run deploy, smoke checks, and rollback output as
the operator helper.

## Cloud Build Trigger Path

`cloudbuild.studio.deploy.yaml` is the checked-in config for a push-to-deploy
trigger later. Before enabling an automatic trigger, grant the Cloud Build
service account only the permissions it needs to deploy the existing Studio
service and use the runtime service account.

Recommended trigger posture:

- trigger on pushes to `main` after merge validation
- build and deploy with `_IMAGE_TAG=$SHORT_SHA`
- keep secrets in Cloud Run/Secret Manager, not in trigger config
- require rollback notes in the progress thread for risky releases

Do not create a trigger that deploys unreviewed feature branches to the main
live Studio service unless Chuck explicitly asks for that workflow.

## First Deploy Command

Do not run this from an agent session in the readiness pass.

When deployment is explicitly approved, use a command shaped like this:

```bash
gcloud run deploy studio \
  --image=us-central1-docker.pkg.dev/PROJECT_ID/high-ground-studio/studio:IMAGE_TAG \
  --region=us-central1 \
  --service-account=studio-cloud-run@PROJECT_ID.iam.gserviceaccount.com \
  --allow-unauthenticated \
  --port=8080 \
  --set-env-vars=STUDIO_AUTH_MODE=allowlist,GOOGLE_CLIENT_ID=GOOGLE_CLIENT_ID \
  --set-secrets=AUTH_SECRET=studio-auth-secret:latest,GOOGLE_CLIENT_SECRET=studio-google-client-secret:latest,STUDIO_ALLOWED_EMAILS=studio-allowed-emails:latest
```

`--allow-unauthenticated` allows browsers to reach the NextAuth sign-in route.
Studio itself remains protected by Google OAuth plus the Studio allowlist.

Org-policy note from the first successful deployment:

- the selected organization policy blocked adding an `allUsers`
  `roles/run.invoker` binding
- the operator used Cloud Run's disabled invoker-IAM-check setting instead of
  forcing an `allUsers` IAM binding
- keep Google OAuth plus `STUDIO_AUTH_MODE=allowlist` intact when using that
  path
- record the exception in the deployment notes so future operators do not
  mistake the missing `allUsers` binding for a failed deploy

If this path is used again, verify both sides:

- `/api/health` is reachable from a normal browser
- a non-allowlisted Google account cannot enter Studio

After the first service URL exists:

1. Add `https://<service-url>/api/auth/callback/google` to the Google OAuth
   client.
2. Set `AUTH_URL=https://<service-url>` on the Cloud Run service.
3. Re-deploy or update the Cloud Run service with that environment value if
   needed.

## Future Manuscript Snapshot Enablement

The checked-in `/manuscript` snapshot code does not make live production
snapshots active by itself. Without a configured `DATABASE_URL`, the snapshot
routes return a clear `503` and browser-local manuscript backups remain the
portable path.

Enable server snapshots only through an explicit persistence release:

1. Choose the Studio database target.
2. Apply the `StudioManuscriptSnapshot` schema through the approved Prisma
   migration or schema-sync path for that target.
3. Store the database connection string through the approved Secret Manager
   path. Do not commit it.
4. Update the `studio` Cloud Run service to provide `DATABASE_URL` from the
   approved secret/env configuration.
5. Deploy the Studio image containing the snapshot routes.
6. Smoke test with synthetic manuscript data:
   - save a server snapshot from desktop
   - load the latest snapshot on a second browser/profile/phone
   - confirm text, block IDs, structure regions, cited quotations, and quote
     review metadata match
7. Confirm full draft JSON browser downloads still work before using real
   manuscript material.

Do not combine this enablement with IAM, DNS, OAuth, billing, service-account,
Yjs, or public projection changes.

## Verification Checklist

After an explicitly approved deployment:

- open the Cloud Run service URL
- verify `/api/health` returns `{ "ok": true, "service": "high-ground-studio", "app": "studio" }`
- verify `/content-studio` returns the Studio sign-in/access shell when not
  authenticated
- sign in with an allowlisted Google account
- verify `/content-studio` opens
- verify `/structure` opens
- paste text
- select a span in the textarea
- create a highlight card
- assign a semantic type
- move the card between lanes
- export JSON
- reload and confirm the browser-local draft remains
- verify a non-allowlisted account cannot enter Studio
- check Cloud Run logs for auth or startup errors

## What Not To Do

- Do not run `pnpm db:push` against remote data.
- Do not add `DATABASE_URL` to the live Studio service unless an approved
  persistence release requires it.
- Do not deploy public projections.
- Do not import manuscript files.
- Do not add Yjs, embeddings, Vertex AI calls, or new importers in this
  deployment-readiness slice.
- Do not commit real secrets.
- Do not change DNS until the Cloud Run URL is verified.
