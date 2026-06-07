#!/usr/bin/env bash
set -euo pipefail

REGION="${REGION:-us-central1}"
REPOSITORY="${REPOSITORY:-high-ground-studio}"
IMAGE_NAME="${IMAGE_NAME:-prisma-migrate}"
PROJECT_ID="${PROJECT_ID:-$(gcloud config get-value project 2>/dev/null || true)}"
IMAGE_TAG="${IMAGE_TAG:-schema-$(date +%Y%m%d-%H%M%S)}"
SERVICE_ACCOUNT="${SERVICE_ACCOUNT:-studio-cloud-run@high-ground-odyssey.iam.gserviceaccount.com}"
SQL_INSTANCE="${SQL_INSTANCE:-high-ground-odyssey:us-central1:studio-postgres}"
JOB_NAME="${JOB_NAME:-quipsly-schema-sync}"

if [[ -z "${PROJECT_ID}" ]]; then
  echo "PROJECT_ID is required or gcloud must have a default project." >&2
  exit 2
fi

IMAGE_URI="${REGION}-docker.pkg.dev/${PROJECT_ID}/${REPOSITORY}/${IMAGE_NAME}:${IMAGE_TAG}"

if [[ "${SKIP_BUILD:-0}" == "1" || "${SKIP_CLOUD_BUILD:-0}" == "1" ]]; then
  echo "Using existing Prisma Migration image ${IMAGE_URI}"
else
  echo "Building Prisma Migration image ${IMAGE_URI}"
  gcloud builds submit \
    --config cloudbuild.prisma-migrate.yaml \
    --substitutions "_REGION=${REGION},_REPOSITORY=${REPOSITORY},_IMAGE_NAME=${IMAGE_NAME},_IMAGE_TAG=${IMAGE_TAG}" \
    .
fi

echo "Deploying Cloud Run Job ${JOB_NAME} for migrations..."
gcloud run jobs deploy "${JOB_NAME}" \
  --image="${IMAGE_URI}" \
  --region="${REGION}" \
  --service-account="${SERVICE_ACCOUNT}" \
  --set-cloudsql-instances="${SQL_INSTANCE}" \
  --set-secrets="DATABASE_URL=studio-database-url:latest" \
  --command="bash" \
  --args="-lc,pnpm prisma migrate deploy && node scripts/quipsly-nest-chat-schema-push.mjs && node scripts/quipsly-production-core-schema-sync.mjs" \
  --tasks=1 \
  --max-retries=0 \
  --quiet

echo "Executing Cloud Run Job ${JOB_NAME}..."
gcloud run jobs execute "${JOB_NAME}" --region="${REGION}" --wait

echo "Database migrations and Quipsly additive schema syncs applied successfully."
