#!/usr/bin/env bash
set -euo pipefail

MODE="${MODE:-status}"
PROJECT_ID="${PROJECT_ID:-high-ground-odyssey}"
REGION="${REGION:-us-central1}"
REPOSITORY="${REPOSITORY:-high-ground-studio}"
IMAGE_NAME="${IMAGE_NAME:-quipsly-schema}"
SERVICE_ACCOUNT="${SERVICE_ACCOUNT:-studio-cloud-run@high-ground-odyssey.iam.gserviceaccount.com}"
SQL_INSTANCE="${SQL_INSTANCE:-high-ground-odyssey:us-central1:studio-postgres}"
DATABASE_SECRET="${DATABASE_SECRET:-studio-database-url:latest}"
SOURCE_REF="${SOURCE_REF:-HEAD}"

repo_root="$(git rev-parse --show-toplevel)"
source_sha="$(git -C "${repo_root}" rev-parse --verify "${SOURCE_REF}^{commit}")"
IMAGE_TAG="${IMAGE_TAG:-schema-${source_sha:0:12}}"
IMAGE_URI="${REGION}-docker.pkg.dev/${PROJECT_ID}/${REPOSITORY}/${IMAGE_NAME}:${IMAGE_TAG}"

case "${MODE}" in
  status)
    job_command="pnpm prisma migrate status"
    ;;
  migrate)
    job_command="pnpm prisma migrate deploy"
    ;;
  coaching-capture)
    job_command="node scripts/quipsly-coaching-capture-schema-sync.mjs"
    ;;
  production-core)
    job_command="node scripts/quipsly-production-core-schema-sync.mjs"
    ;;
  nest-chat)
    job_command="node scripts/quipsly-nest-chat-schema-push.mjs"
    ;;
  targeted)
    job_command="node scripts/quipsly-nest-chat-schema-push.mjs && node scripts/quipsly-production-core-schema-sync.mjs && node scripts/quipsly-coaching-capture-schema-sync.mjs"
    ;;
  *)
    echo "Unknown MODE '${MODE}'. Expected status, migrate, coaching-capture, production-core, nest-chat, or targeted." >&2
    exit 2
    ;;
esac

if [[ "${SKIP_BUILD:-0}" != "1" ]]; then
  schema_root="$(mktemp -d "${TMPDIR:-/tmp}/quipsly-schema-job.XXXXXX")"
  schema_context="${schema_root}/context"

  cleanup() {
    if [[ -f "${schema_context}/.quipsly-schema-context" ]]; then
      rm -rf -- "${schema_root}"
    else
      echo "Refusing to remove unmarked schema job directory: ${schema_root}" >&2
    fi
  }
  trap cleanup EXIT

  schema_context="$(
    bash "${repo_root}/scripts/release/quipsly-schema-context.sh" \
      "${source_sha}" \
      "${schema_context}"
  )"

  echo "Building ${IMAGE_URI} from committed schema source ${source_sha}."
  gcloud builds submit \
    --project="${PROJECT_ID}" \
    --config="${schema_context}/cloudbuild.quipsly-schema.yaml" \
    --substitutions="_REGION=${REGION},_REPOSITORY=${REPOSITORY},_IMAGE_NAME=${IMAGE_NAME},_IMAGE_TAG=${IMAGE_TAG}" \
    "${schema_context}"
else
  echo "Using existing schema image ${IMAGE_URI}."
fi

job_suffix="${MODE//[^a-zA-Z0-9-]/-}"
job_name="quipsly-schema-${job_suffix}"

echo "Deploying ${job_name} in ${MODE} mode from ${source_sha}."
gcloud run jobs deploy "${job_name}" \
  --project="${PROJECT_ID}" \
  --region="${REGION}" \
  --image="${IMAGE_URI}" \
  --service-account="${SERVICE_ACCOUNT}" \
  --set-cloudsql-instances="${SQL_INSTANCE}" \
  --set-secrets="DATABASE_URL=${DATABASE_SECRET}" \
  --set-env-vars="QUIPSLY_SCHEMA_SOURCE_SHA=${source_sha},QUIPSLY_SCHEMA_MODE=${MODE}" \
  --command=bash \
  --args="-lc,${job_command}" \
  --tasks=1 \
  --max-retries=0 \
  --quiet

echo "Executing ${job_name}."
gcloud run jobs execute "${job_name}" \
  --project="${PROJECT_ID}" \
  --region="${REGION}" \
  --wait
