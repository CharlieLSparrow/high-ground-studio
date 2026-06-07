# Quipsly Production Core Schema Sync

Date: 2026-06-07

This document covers the targeted database sync for the production-core models introduced in `production-core-implementation-pass-1.md`.

## Why this exists

Quipsly is moving from route-local prototype JSON into first-class production concepts:

- Nest invites
- asset attachments
- asset variants
- asset processing jobs
- source units
- document operations
- production rooms
- timeline versions
- output packets
- publish attempts
- published artifacts
- workflow jobs

The repo still does not operate as a committed Prisma-migrations-first project. Broad `prisma db push` has repeatedly been too risky for live work because it can collide with unrelated drift. The safer current path is a targeted additive SQL sync.

## Files

- SQL patch: `ops/quipsly-production-core-additive.sql`
- Runner: `scripts/quipsly-production-core-schema-sync.mjs`
- Schema job image: `ops/prisma-migrate.Dockerfile`
- Runtime readiness endpoint: `/api/production-core/readiness`

## Apply pattern

Build the schema image:

```bash
TAG="quipsly-production-core-schema-$(date +%Y%m%d-%H%M%S)"
gcloud builds submit \
  --config cloudbuild.prisma-migrate.yaml \
  --substitutions _IMAGE_TAG="$TAG" .
```

Deploy and execute the job:

```bash
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

## Verify

After deploying the app revision that contains the readiness endpoint:

```bash
curl -sS https://nest.quipsly.com/api/production-core/readiness
```

Expected:

```json
{
  "ok": true,
  "status": "ready"
}
```

If it reports `needs-schema-sync`, run the schema job before using features that touch the new models.

## Product impact

Once synced, Quipsly can safely build on these production truths:

- Inviting an email to a Nest is represented as both access and an invite ledger.
- Media files can be attached to one or more Nests without pretending the Nest is a bucket.
- Document edits and tag changes can be audited and eventually rolled back.
- Episode/video work can move from `StudioEpisodeProduction` JSON toward durable production rooms and timeline versions.
- Publishing can move toward output packets and per-destination artifacts.
- Long-running media/AI/publishing work can land in workflow jobs instead of vanishing into UI state.
