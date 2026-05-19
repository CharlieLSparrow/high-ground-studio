# Studio Cloud Run Deployment Plan

Date: 2026-05-19

## Decision

Prepare `apps/studio` for a first private live MVP on Google Cloud Run, but do
not deploy in this pass.

Cloud Run is the right first live target because Studio is currently a
request/response Next.js app with no background worker requirement, no public
projection traffic, and no live database dependency for the first Structure
Mode MVP. Cloud Run lets the team practice containerized deployment,
environment configuration, service identity, logs, revisions, and rollback
without owning servers or Kubernetes yet.

## Build Path

Use:

```text
Cloud Build -> Artifact Registry -> Cloud Run
```

Do not rely on a magical source deploy for this pnpm monorepo.

The repo is a workspace with:

- root `package.json`
- `pnpm-lock.yaml`
- `pnpm-workspace.yaml`
- `apps/studio`
- `packages/studio-domain`
- shared Prisma schema at `prisma/schema.prisma`

That shape is easier to build predictably from a checked-in Dockerfile than
from an inferred source build. A Dockerfile makes the install, Prisma generate,
Next standalone build, runtime port, and monorepo tracing explicit. Cloud Build
then becomes the repeatable build runner, and Artifact Registry becomes the
versioned image store that Cloud Run deploys from.

## Why The First Deployed MVP Can Avoid The Database

The first live target should be `/structure`.

Structure Mode already persists its working draft in browser `localStorage`
under:

```text
high-ground-studio.structure-mode.v1
```

That means a useful first private deployment can support:

- Google sign-in
- email allowlist access
- pasted source text
- highlight cards
- semantic type assignment
- structure lanes
- JSON export/import backup

without connecting Cloud Run to Neon, Cloud SQL, or any production-like
database. The Tagging Desk and Writing Desk can still render, but their durable
writes remain guarded and disabled unless the target is local development
Postgres.

## Temporary Live MVP Auth Mode

The first live deployment should use:

```text
STUDIO_AUTH_MODE=allowlist
STUDIO_ALLOWED_EMAILS=comma,separated,emails
```

This keeps Google OAuth as the identity proof but skips Prisma-backed user
provisioning. A verified Google account must match the allowlist before a
session receives temporary Studio access claims.

This is intentionally temporary. The durable auth model should return to
database-backed Studio users, explicit roles, and eventually Studio-specific
ownership relations once the live database boundary is ready.

## Secrets And Configuration Needed

Required for the first live MVP:

- `AUTH_SECRET`
- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`
- `STUDIO_AUTH_MODE=allowlist`
- `STUDIO_ALLOWED_EMAILS`

Recommended once the Cloud Run service URL exists:

- `AUTH_URL=https://<cloud-run-service-url>`

Do not commit real values. Put sensitive values in Secret Manager and attach
them to Cloud Run as secrets. Plain config such as `STUDIO_AUTH_MODE` can be a
normal environment variable.

Do not provide `DATABASE_URL` for the first live MVP unless a later pass has
explicitly approved the remote database boundary.

## Manual Google Cloud Steps That Remain

Manual setup still needs to happen outside this pass:

1. Choose or create the Google Cloud project.
2. Choose a region, likely `us-central1` for the first pass unless latency or
   data-location needs argue otherwise.
3. Enable required APIs:
   - Cloud Build
   - Artifact Registry
   - Cloud Run
   - Secret Manager
4. Create an Artifact Registry Docker repository.
5. Create or choose a least-privilege Cloud Run service account.
6. Store `AUTH_SECRET`, `GOOGLE_CLIENT_SECRET`, and optionally
   `STUDIO_ALLOWED_EMAILS` in Secret Manager.
7. Configure Google OAuth consent/client settings.
8. Add the Cloud Run callback URI to the Google OAuth client:
   `https://<service-url>/api/auth/callback/google`.
9. Submit the Cloud Build image build.
10. Deploy the image to Cloud Run.
11. Verify sign-in and `/structure`.

This pass does not execute any of those cloud mutations.

## What Not To Deploy Yet

Do not deploy yet:

- database-backed Studio writes against remote Neon
- `db:push` against remote data
- public projections
- importers
- TipTap/Yjs
- embeddings
- Vertex AI calls
- custom DNS
- Terraform-managed production infrastructure
- background ingestion or projection workers

## Certification Practice Alignment

This path is useful Cloud Developer practice because it touches real
cloud-native application work:

- containerizing a Next.js app
- using Cloud Build config
- pushing images to Artifact Registry
- deploying immutable images to Cloud Run
- configuring environment variables and secrets
- thinking about service identity and least privilege
- validating a private serverless web app
- observing revisions, logs, and rollbacks

It also sets up later Machine Learning Engineer practice without pretending
that this pass is an ML pass. Future Studio work can add:

- Vertex AI Gemini calls for source-aware drafting
- embedding generation for private Studio spans/nodes
- Vector Search or another vector store for semantic retrieval
- eval datasets for quote/story/node retrieval quality
- MLOps-style pipelines for ingestion, embedding, and index refresh

Those should come after the private app is deployable, observable, and secure.

## Primary References

- Cloud Run container runtime contract:
  <https://cloud.google.com/run/docs/container-contract>
- Cloud Run build sources to containers:
  <https://cloud.google.com/run/docs/building/containers>
- Cloud Build config files:
  <https://cloud.google.com/build/docs/configuring-builds/create-basic-configuration>
- Artifact Registry Docker images:
  <https://cloud.google.com/artifact-registry/docs/docker>
- Google Cloud Professional Cloud Developer:
  <https://cloud.google.com/learn/certification/cloud-developer>
- Vertex AI generative AI:
  <https://docs.cloud.google.com/vertex-ai/generative-ai/docs>
- Vertex AI Vector Search:
  <https://cloud.google.com/vertex-ai/docs/vector-search/overview>
- Google Cloud Professional Machine Learning Engineer guide:
  <https://cloud.google.com/learn/certification/guides/machine-learning-engineer>
