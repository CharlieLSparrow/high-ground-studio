#!/usr/bin/env bash
set -euo pipefail

PROJECT_ID="${PROJECT_ID:-high-ground-odyssey}"
REGION="${REGION:-us-central1}"
REPOSITORY="${REPOSITORY:-high-ground-studio}"
IMAGE_NAME="${IMAGE_NAME:-prisma-migrate}"
IMAGE_TAG="${IMAGE_TAG:-coaching-capture-$(date +%Y%m%d%H%M%S)}"
JOB_NAME="${JOB_NAME:-quipsly-coaching-capture-schema-sync}"
SQL_INSTANCE="${SQL_INSTANCE:-high-ground-odyssey:us-central1:studio-postgres}"
DATABASE_SECRET="${DATABASE_SECRET:-studio-database-url:latest}"
SERVICE_ACCOUNT="${SERVICE_ACCOUNT:-studio-cloud-run@high-ground-odyssey.iam.gserviceaccount.com}"
SYNC_SCRIPT="${SYNC_SCRIPT:-scripts/quipsly-coaching-capture-schema-sync.mjs}"

image="${REGION}-docker.pkg.dev/${PROJECT_ID}/${REPOSITORY}/${IMAGE_NAME}:${IMAGE_TAG}"

printf 'Building coaching/capture schema sync image: %s\n' "${image}"
gcloud builds submit \
  --project="${PROJECT_ID}" \
  --config cloudbuild.prisma-migrate.yaml \
  --substitutions="_REGION=${REGION},_REPOSITORY=${REPOSITORY},_IMAGE_NAME=${IMAGE_NAME},_IMAGE_TAG=${IMAGE_TAG}" \
  .

printf 'Deploying Cloud Run Job %s with targeted schema sync only.\n' "${JOB_NAME}"
gcloud run jobs deploy "${JOB_NAME}" \
  --project="${PROJECT_ID}" \
  --region="${REGION}" \
  --image="${image}" \
  --service-account="${SERVICE_ACCOUNT}" \
  --set-cloudsql-instances="${SQL_INSTANCE}" \
  --set-secrets="DATABASE_URL=${DATABASE_SECRET}" \
  --command=node \
  --args="${SYNC_SCRIPT}"

printf 'Executing Cloud Run Job %s.\n' "${JOB_NAME}"
gcloud run jobs execute "${JOB_NAME}" \
  --project="${PROJECT_ID}" \
  --region="${REGION}" \
  --wait
