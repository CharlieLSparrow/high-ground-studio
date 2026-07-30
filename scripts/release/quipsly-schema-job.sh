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
fixture_database="${FIXTURE_DATABASE:-quipsly_fixture_${source_sha:0:12}}"
preserve_fixture="${PRESERVE_FIXTURE_DATABASE:-0}"
reuse_fixture="${REUSE_FIXTURE_DATABASE:-0}"
IMAGE_TAG="${IMAGE_TAG:-schema-${source_sha:0:12}}"
IMAGE_URI="${REGION}-docker.pkg.dev/${PROJECT_ID}/${REPOSITORY}/${IMAGE_NAME}:${IMAGE_TAG}"

case "${MODE}" in
  status)
    job_command="pnpm prisma migrate status"
    ;;
  diff)
    job_command="pnpm prisma migrate diff --from-schema=prisma/schema.prisma --to-config-datasource"
    ;;
  baseline-audit)
    job_command="node scripts/quipsly-foundation-baseline-audit.mjs"
    ;;
  foundation-repair)
    job_command="pnpm prisma db execute --file ops/quipsly-foundation-baseline-repair.sql"
    ;;
  resolve-foundation)
    job_command="pnpm prisma migrate resolve --applied 20260607000000_baseline_existing_schema && pnpm prisma migrate resolve --applied 20260608000000_add_vector_embedding && pnpm prisma migrate resolve --applied 20260703000000_add_coaching_capture_core && pnpm prisma migrate resolve --applied 20260704000000_add_coaching_request_metadata"
    ;;
  migrate)
    job_command="pnpm prisma migrate deploy"
    ;;
  fixture)
    if [[ ! "${fixture_database}" =~ ^quipsly_fixture_[a-z0-9_]{8,40}$ ]]; then
      echo "Unsafe fixture database '${fixture_database}'." >&2
      exit 2
    fi
    if [[ "${preserve_fixture}" != "0" && "${preserve_fixture}" != "1" ]]; then
      echo "PRESERVE_FIXTURE_DATABASE must be 0 or 1." >&2
      exit 2
    fi
    if [[ "${reuse_fixture}" != "0" && "${reuse_fixture}" != "1" ]]; then
      echo "REUSE_FIXTURE_DATABASE must be 0 or 1." >&2
      exit 2
    fi
    job_command="node scripts/quipsly-schema-fixture.mjs"
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
    echo "Unknown MODE '${MODE}'. Expected status, diff, baseline-audit, foundation-repair, resolve-foundation, migrate, fixture, coaching-capture, production-core, nest-chat, or targeted." >&2
    exit 2
    ;;
esac

if [[ "${MODE}" == "resolve-foundation" && "${ALLOW_BASELINE_RESOLUTION:-0}" != "1" ]]; then
  echo "Refusing to resolve foundation migrations without ALLOW_BASELINE_RESOLUTION=1." >&2
  exit 2
fi

if [[ "${MODE}" == "foundation-repair" && "${ALLOW_FOUNDATION_REPAIR:-0}" != "1" ]]; then
  echo "Refusing to repair the foundation schema without ALLOW_FOUNDATION_REPAIR=1." >&2
  exit 2
fi

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

sql_instance_name="${SQL_INSTANCE##*:}"
if [[ ! "${sql_instance_name}" =~ ^[a-z][a-z0-9-]{0,97}[a-z0-9]$ ]]; then
  echo "Unsafe Cloud SQL instance name '${sql_instance_name}'." >&2
  exit 2
fi
if [[ "${MODE}" == "fixture" ]]; then
  if gcloud sql databases describe "${fixture_database}" \
    --project="${PROJECT_ID}" \
    --instance="${sql_instance_name}" >/dev/null 2>&1; then
    if [[ "${reuse_fixture}" != "1" ]]; then
      echo "Fixture database ${fixture_database} already exists; refusing to reuse it." >&2
      exit 1
    fi
  else
    gcloud sql databases create "${fixture_database}" \
      --project="${PROJECT_ID}" \
      --instance="${sql_instance_name}" \
      --charset=UTF8 \
      --collation=en_US.UTF8 \
      --quiet
  fi
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
  --set-env-vars="QUIPSLY_SCHEMA_SOURCE_SHA=${source_sha},QUIPSLY_SCHEMA_MODE=${MODE},QUIPSLY_SCHEMA_FIXTURE_DATABASE=${fixture_database}" \
  --command=bash \
  --args="-lc,${job_command}" \
  --tasks=1 \
  --max-retries=0 \
  --quiet

echo "Executing ${job_name}."
set +e
gcloud run jobs execute "${job_name}" \
  --project="${PROJECT_ID}" \
  --region="${REGION}" \
  --wait
execute_status=$?
set -e

if [[ "${execute_status}" -ne 0 ]]; then
  if [[ "${MODE}" == "fixture" ]]; then
    echo "Fixture database ${fixture_database} was preserved for failure analysis." >&2
  fi
  exit "${execute_status}"
fi

if [[ "${MODE}" == "fixture" && "${preserve_fixture}" != "1" ]]; then
  gcloud sql databases delete "${fixture_database}" \
    --project="${PROJECT_ID}" \
    --instance="${sql_instance_name}" \
    --quiet
  echo "Deleted verified fixture database ${fixture_database}."
fi
