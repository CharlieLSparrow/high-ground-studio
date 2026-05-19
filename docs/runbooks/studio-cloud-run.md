# Studio Cloud Run Readiness

Date: 2026-05-19

## Purpose

This runbook documents the first live private Studio deployment path for Google
Cloud Run.

Do not treat this as permission to deploy from an agent session. The current
pass prepares code, image build config, and operator steps only.

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

Only `/structure` is useful without database persistence because it stores its
draft in browser `localStorage` under:

```text
high-ground-studio.structure-mode.v1
```

Do not configure a remote `DATABASE_URL` for this first live MVP. The existing
local-only persistence guard should keep database writes disabled in Cloud Run.

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

Recommended after the service URL exists:

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

After the first service URL exists:

1. Add `https://<service-url>/api/auth/callback/google` to the Google OAuth
   client.
2. Set `AUTH_URL=https://<service-url>` if callback URL inference is not enough
   in the deployed service.
3. Re-deploy or update the Cloud Run service with that environment value if
   needed.

## Verification Checklist

After an explicitly approved deployment:

- open the Cloud Run service URL
- verify `/api/health` returns `{ "ok": true, "service": "high-ground-studio", "app": "studio" }`
- sign in with an allowlisted Google account
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
- Do not add `DATABASE_URL` to the first live Studio service.
- Do not deploy public projections.
- Do not import manuscript files.
- Do not add TipTap, Yjs, embeddings, Vertex AI calls, or importers in this
  deployment-readiness slice.
- Do not commit real secrets.
- Do not change DNS until the Cloud Run URL is verified.
