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
RUN_PRISMA_MIGRATE="${RUN_PRISMA_MIGRATE:-0}"

if [[ -z "${PROJECT_ID}" ]]; then
  echo "PROJECT_ID is required or gcloud must have a default project." >&2
  exit 2
fi

IMAGE_URI="${REGION}-docker.pkg.dev/${PROJECT_ID}/${REPOSITORY}/${IMAGE_NAME}:${IMAGE_TAG}"
SCHEMA_SYNC_COMMAND="node scripts/quipsly-nest-chat-schema-push.mjs && node scripts/quipsly-production-core-schema-sync.mjs"

if [[ "${RUN_PRISMA_MIGRATE}" == "1" ]]; then
  SCHEMA_SYNC_COMMAND="pnpm prisma migrate deploy && ${SCHEMA_SYNC_COMMAND}"
else
  echo "Skipping Prisma migrate deploy; RUN_PRISMA_MIGRATE=1 is required while this repo remains in targeted additive schema-sync bridge mode."
fi

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
  --args="-lc,${SCHEMA_SYNC_COMMAND}" \
  --tasks=1 \
  --max-retries=0 \
  --quiet

echo "Executing Cloud Run Job ${JOB_NAME}..."
job_output_file="$(mktemp)"
set +e
gcloud run jobs execute "${JOB_NAME}" --region="${REGION}" --wait 2>&1 | tee "${job_output_file}"
execute_status="${PIPESTATUS[0]}"
set -e

if [[ "${execute_status}" -ne 0 ]]; then
  echo "Cloud Run Job ${JOB_NAME} failed. Recent logs:" >&2
  gcloud logging read "resource.type=\"cloud_run_job\" AND resource.labels.job_name=\"${JOB_NAME}\"" \
    --project="${PROJECT_ID}" \
    --freshness=30m \
    --limit=120 \
    --format="value(timestamp,severity,textPayload,jsonPayload.message)" || true
  rm -f "${job_output_file}"
  exit "${execute_status}"
fi

rm -f "${job_output_file}"

echo "Database migrations and Quipsly additive schema syncs applied successfully."
