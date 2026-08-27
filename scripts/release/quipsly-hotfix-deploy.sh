#!/usr/bin/env bash
set -euo pipefail

export CLOUDSDK_CORE_DISABLE_PROMPTS="${CLOUDSDK_CORE_DISABLE_PROMPTS:-1}"

REGION="${REGION:-us-central1}"
ARTIFACT_REPOSITORY="${ARTIFACT_REPOSITORY:-high-ground-studio}"
IMAGE_NAME="${IMAGE_NAME:-studio}"
SERVICE_NAME="${SERVICE_NAME:-studio}"
MIN_INSTANCES="${MIN_INSTANCES:-0}"
MAX_INSTANCES="${MAX_INSTANCES:-2}"
PROJECT_ID="${PROJECT_ID:-$(gcloud config get-value project 2>/dev/null || true)}"
IMAGE_TAG="${IMAGE_TAG:-hotfix-$(date +%Y%m%d-%H%M%S)}"
export PREVIEW_TAG="${PREVIEW_TAG:-quipsly-hotfix}"
SOURCE_SHA="${SOURCE_SHA:-manual-hotfix}"
DEPLOYED_BY="${DEPLOYED_BY:-$(whoami)}"
CLOUD_BUILD_CONFIG="${CLOUD_BUILD_CONFIG:-cloudbuild.quipsly-hotfix.yaml}"
LOCAL_TARGET_URL="${LOCAL_TARGET_URL:-http://127.0.0.1:3012}"
PNPM="${PNPM:-corepack pnpm}"
RUN_TYPECHECK="${RUN_TYPECHECK:-1}"
RUN_LOCAL_SMOKE="${RUN_LOCAL_SMOKE:-auto}"
RUN_AUTH_SMOKE="${RUN_AUTH_SMOKE:-auto}"
RUN_LOCAL_BUILD="${RUN_LOCAL_BUILD:-0}"
QUIPSLY_DOCKER_IGNORE_TYPE_ERRORS="${QUIPSLY_DOCKER_IGNORE_TYPE_ERRORS:-0}"
RUN_GENERATED_INVITE_SMOKE="${RUN_GENERATED_INVITE_SMOKE:-0}"
GENERATED_INVITE_SMOKE_DATABASE_SECRET="${GENERATED_INVITE_SMOKE_DATABASE_SECRET:-studio-database-url}"
GENERATED_INVITE_SMOKE_AUTH_SECRET="${GENERATED_INVITE_SMOKE_AUTH_SECRET:-studio-auth-secret}"
GENERATED_INVITE_SMOKE_DB_TIMEOUT_MS="${GENERATED_INVITE_SMOKE_DB_TIMEOUT_MS:-30000}"
RUN_GENERATED_SELF_SERVE_SMOKE="${RUN_GENERATED_SELF_SERVE_SMOKE:-0}"
GENERATED_SELF_SERVE_SMOKE_DATABASE_SECRET="${GENERATED_SELF_SERVE_SMOKE_DATABASE_SECRET:-studio-database-url}"
GENERATED_SELF_SERVE_SMOKE_DB_TIMEOUT_MS="${GENERATED_SELF_SERVE_SMOKE_DB_TIMEOUT_MS:-30000}"
RUN_GENERATED_ADMIN_SMOKE="${RUN_GENERATED_ADMIN_SMOKE:-0}"
GENERATED_ADMIN_SMOKE_DATABASE_SECRET="${GENERATED_ADMIN_SMOKE_DATABASE_SECRET:-studio-database-url}"
GENERATED_ADMIN_SMOKE_DB_TIMEOUT_MS="${GENERATED_ADMIN_SMOKE_DB_TIMEOUT_MS:-30000}"
RUN_OPERATOR_READINESS="${RUN_OPERATOR_READINESS:-1}"
SKIP_CLOUD_BUILD="${SKIP_CLOUD_BUILD:-0}"
PROMOTE="${PROMOTE:-0}"
LIVE_URL="${LIVE_URL:-https://nest.quipsly.com}"
EXTRA_UPDATE_ENV_VARS="${EXTRA_UPDATE_ENV_VARS:-}"
EXTRA_UPDATE_SECRETS="${EXTRA_UPDATE_SECRETS:-}"
QUIPSLY_ADMIN_EMAILS="${QUIPSLY_ADMIN_EMAILS:-}"
QUIPSLY_ADMIN_BREAK_GLASS_ENABLED="${QUIPSLY_ADMIN_BREAK_GLASS_ENABLED:-false}"

if [[ -z "${PROJECT_ID}" ]]; then
  echo "PROJECT_ID is required or gcloud must have a default project." >&2
  exit 2
fi
if [[ "${QUIPSLY_ADMIN_BREAK_GLASS_ENABLED}" != "true" && "${QUIPSLY_ADMIN_BREAK_GLASS_ENABLED}" != "false" ]]; then
  echo "QUIPSLY_ADMIN_BREAK_GLASS_ENABLED must be true or false." >&2
  exit 2
fi
if [[ "${QUIPSLY_ADMIN_BREAK_GLASS_ENABLED}" == "true" && -z "${QUIPSLY_ADMIN_EMAILS}" ]]; then
  echo "Emergency admin recovery requires an exact QUIPSLY_ADMIN_EMAILS list." >&2
  exit 2
fi

if [[ ! "${MIN_INSTANCES}" =~ ^[0-9]+$ ]] || [[ ! "${MAX_INSTANCES}" =~ ^[0-9]+$ ]] \
  || (( MIN_INSTANCES > MAX_INSTANCES )) || (( MAX_INSTANCES < 2 )) || (( MAX_INSTANCES > 10 )); then
  echo "MIN_INSTANCES and MAX_INSTANCES must be integers with 0 <= MIN_INSTANCES <= MAX_INSTANCES, and MAX_INSTANCES from 2 through 10." >&2
  exit 2
fi

reject_owner_override_for_cloud_run() {
  if [[ "${QUIPSLY_OWNER_OVERRIDE:-}" == "true" ]]; then
    echo "Refusing Cloud Run hotfix deploy with QUIPSLY_OWNER_OVERRIDE=true in the operator environment." >&2
    echo "Owner override is a localhost-only development wrench, not production auth proof." >&2
    exit 1
  fi

  if [[ "${EXTRA_UPDATE_ENV_VARS}" == *"QUIPSLY_OWNER_OVERRIDE=true"* ]]; then
    echo "Refusing Cloud Run hotfix deploy because EXTRA_UPDATE_ENV_VARS would set QUIPSLY_OWNER_OVERRIDE=true." >&2
    echo "Remove that env var and use Firebase/Postgres-backed auth instead." >&2
    exit 1
  fi
}

verify_operator_readiness() {
  if [[ "${RUN_OPERATOR_READINESS}" != "1" ]]; then
    echo "Operator readiness gate disabled by RUN_OPERATOR_READINESS=${RUN_OPERATOR_READINESS}."
    return
  fi

  if [[ ! -f "scripts/quipsly-auth-readiness.mjs" ]]; then
    echo "Missing scripts/quipsly-auth-readiness.mjs; refusing to start auth hotfix deploy without the shared readiness gate." >&2
    exit 1
  fi

  echo "Running operator-only auth readiness gate"
  if ! PROJECT_ID="${PROJECT_ID}" node scripts/quipsly-auth-readiness.mjs --operator-only; then
    echo "" >&2
    echo "Operator readiness failed before expensive deploy work." >&2
    echo "Fix the reported layer, then rerun this hotfix lane." >&2
    exit 1
  fi
}

IMAGE_URI="${REGION}-docker.pkg.dev/${PROJECT_ID}/${ARTIFACT_REPOSITORY}/${IMAGE_NAME}:${IMAGE_TAG}"
IMAGE_REPOSITORY="${REGION}-docker.pkg.dev/${PROJECT_ID}/${ARTIFACT_REPOSITORY}/${IMAGE_NAME}"

echo "=========================================================="
echo "Quipsly targeted hotfix deploy"
echo "=========================================================="
echo "Service:       ${SERVICE_NAME}"
echo "Image:         ${IMAGE_URI}"
echo "Preview tag:   ${PREVIEW_TAG}"
echo "Promote live:  ${PROMOTE}"
echo "Docker TS:     $([[ "${QUIPSLY_DOCKER_IGNORE_TYPE_ERRORS}" == "1" ]] && echo "skip Next duplicate type gate" || echo "run Next type gate")"
echo "Operator gate: $([[ "${RUN_OPERATOR_READINESS}" == "1" ]] && echo "enabled" || echo "disabled")"
if [[ -n "${EXTRA_UPDATE_ENV_VARS}" ]]; then
  echo "Extra env:     ${EXTRA_UPDATE_ENV_VARS}"
fi
if [[ -n "${EXTRA_UPDATE_SECRETS}" ]]; then
  echo "Extra secrets: explicit operator bindings configured"
fi
if [[ "${QUIPSLY_ADMIN_BREAK_GLASS_ENABLED}" == "true" ]]; then
  echo "Admin recovery: ACTIVE for an explicit operator list"
else
  echo "Admin recovery: disabled; database roles are authoritative"
fi
echo ""
echo "This lane intentionally skips the beta manifest scan."
echo "Use scripts/release/quipsly-deploy-preview.sh for full beta releases."
echo "=========================================================="

reject_owner_override_for_cloud_run
verify_operator_readiness

if [[ "${RUN_TYPECHECK}" == "1" ]]; then
  echo "Running Quipsly typecheck"
  ${PNPM} --filter quipsly exec tsc --noEmit --incremental false
fi

if [[ "${RUN_LOCAL_BUILD}" == "1" ]]; then
  echo "Running local Quipsly build"
  ${PNPM} --filter quipsly build
fi

run_auth_smoke_if_configured() {
  local target_url="$1"
  if [[ "${RUN_AUTH_SMOKE}" == "0" ]]; then
    return
  fi
  if [[ -n "${QUIPSLY_AUTH_SMOKE_EMAIL:-}" && -n "${QUIPSLY_AUTH_SMOKE_PASSWORD:-}" ]]; then
    echo "Running Firebase auth smoke against ${target_url}"
    QUIPSLY_AUTH_SMOKE_BASE_URL="${target_url}" node scripts/quipsly-firebase-auth-smoke.mjs
  elif [[ "${RUN_AUTH_SMOKE}" == "1" ]]; then
    echo "RUN_AUTH_SMOKE=1 requires QUIPSLY_AUTH_SMOKE_EMAIL and QUIPSLY_AUTH_SMOKE_PASSWORD." >&2
    exit 1
  else
    echo "Auth smoke credentials not configured; running route-only smoke."
  fi
}

run_generated_invite_smoke_if_requested() {
  local target_url="$1"
  if [[ "${RUN_GENERATED_INVITE_SMOKE}" != "1" ]]; then
    return
  fi

  echo "Running generated @dev.test invited-user smoke against ${target_url}"
  if [[ "${target_url}" == http://localhost:* || "${target_url}" == http://127.0.0.1:* ]]; then
    QUIPSLY_AUTH_SMOKE_BASE_URL="${target_url}" node scripts/quipsly-generated-invited-user-smoke.mjs
    return
  fi

  local remote_database_url
  local remote_auth_secret_file
  remote_auth_secret_file="$(mktemp -t quipsly-auth-secret.XXXXXX)"
  chmod 600 "${remote_auth_secret_file}"
  if ! remote_database_url="$(gcloud secrets versions access latest --secret="${GENERATED_INVITE_SMOKE_DATABASE_SECRET}" --project="${PROJECT_ID}" 2>/tmp/quipsly-db-secret.err)"; then
    echo "Could not read generated invite smoke database secret ${GENERATED_INVITE_SMOKE_DATABASE_SECRET}." >&2
    cat /tmp/quipsly-db-secret.err >&2 || true
    rm -f "${remote_auth_secret_file}"
    return 1
  fi
  rm -f /tmp/quipsly-db-secret.err

  if ! gcloud secrets versions access latest --secret="${GENERATED_INVITE_SMOKE_AUTH_SECRET}" --project="${PROJECT_ID}" >"${remote_auth_secret_file}" 2>/tmp/quipsly-auth-secret.err; then
    echo "Could not read generated invite smoke auth secret ${GENERATED_INVITE_SMOKE_AUTH_SECRET}." >&2
    cat /tmp/quipsly-auth-secret.err >&2 || true
    rm -f "${remote_auth_secret_file}"
    return 1
  fi
  rm -f /tmp/quipsly-auth-secret.err

  local cloud_sql_connection_name
  cloud_sql_connection_name="$(DATABASE_URL="${remote_database_url}" node - <<'NODE'
const url = new URL(process.env.DATABASE_URL || "");
const socketHost = url.searchParams.get("host") || "";
if (!socketHost.startsWith("/cloudsql/")) process.exit(0);
process.stdout.write(socketHost.replace(/^\/cloudsql\//, ""));
NODE
)"

  if [[ -z "${cloud_sql_connection_name}" ]]; then
    DATABASE_URL="${remote_database_url}" \
      AUTH_SECRET="" \
      NEXTAUTH_SECRET="" \
      AUTH_SECRET_FILE="${remote_auth_secret_file}" \
      PRISMA_PG_CONNECTION_TIMEOUT_MS="${GENERATED_INVITE_SMOKE_DB_TIMEOUT_MS}" \
      QUIPSLY_AUTH_SMOKE_BASE_URL="${target_url}" \
      node scripts/quipsly-generated-invited-user-smoke.mjs
    local direct_status=$?
    rm -f "${remote_auth_secret_file}"
    return "${direct_status}"
  fi

  if ! command -v cloud-sql-proxy >/dev/null 2>&1; then
    echo "cloud-sql-proxy is required for remote generated invite smoke because ${GENERATED_INVITE_SMOKE_DATABASE_SECRET} uses a Cloud SQL socket URL." >&2
    rm -f "${remote_auth_secret_file}"
    return 1
  fi

  local proxy_port
  proxy_port="$(python3 - <<'PY'
import socket
s = socket.socket()
s.bind(("127.0.0.1", 0))
print(s.getsockname()[1])
s.close()
PY
)"
  local proxy_log
  proxy_log="$(mktemp -t quipsly-cloud-sql-proxy.XXXXXX.log)"
  cloud-sql-proxy "${cloud_sql_connection_name}" \
    --address 127.0.0.1 \
    --port "${proxy_port}" \
    --quota-project "${PROJECT_ID}" \
    >"${proxy_log}" 2>&1 &
  local proxy_pid=$!

  if ! python3 - "${proxy_port}" <<'PY'
import socket
import sys
import time
port = int(sys.argv[1])
deadline = time.time() + 20
while time.time() < deadline:
    try:
        with socket.create_connection(("127.0.0.1", port), timeout=1):
            sys.exit(0)
    except OSError:
        time.sleep(0.25)
sys.exit(1)
PY
  then
    echo "Cloud SQL proxy did not become ready for generated invite smoke." >&2
    cat "${proxy_log}" >&2 || true
    kill "${proxy_pid}" >/dev/null 2>&1 || true
    wait "${proxy_pid}" >/dev/null 2>&1 || true
    rm -f "${proxy_log}"
    rm -f "${remote_auth_secret_file}"
    return 1
  fi

  set +e
  DATABASE_URL="${remote_database_url}" \
    AUTH_SECRET="" \
    NEXTAUTH_SECRET="" \
    AUTH_SECRET_FILE="${remote_auth_secret_file}" \
    PRISMA_PG_CONNECTION_TIMEOUT_MS="${GENERATED_INVITE_SMOKE_DB_TIMEOUT_MS}" \
    QUIPSLY_AUTH_SMOKE_BASE_URL="${target_url}" \
    QUIPSLY_SMOKE_CLOUD_SQL_PROXY_PORT="${proxy_port}" \
    node scripts/quipsly-generated-invited-user-smoke.mjs
  local smoke_status=$?
  set -e

  kill "${proxy_pid}" >/dev/null 2>&1 || true
  wait "${proxy_pid}" >/dev/null 2>&1 || true
  rm -f "${proxy_log}"
  rm -f "${remote_auth_secret_file}"

  return "${smoke_status}"
}

run_generated_self_serve_smoke_if_requested() {
  local target_url="$1"
  if [[ "${RUN_GENERATED_SELF_SERVE_SMOKE}" != "1" ]]; then
    return
  fi

  echo "Running generated @dev.test self-serve signup smoke against ${target_url}"
  if [[ "${target_url}" == http://localhost:* || "${target_url}" == http://127.0.0.1:* ]]; then
    QUIPSLY_SELF_SERVE_SMOKE_BASE_URL="${target_url}" node scripts/quipsly-generated-self-serve-account-smoke.mjs
    return
  fi

  local remote_database_url
  if ! remote_database_url="$(gcloud secrets versions access latest --secret="${GENERATED_SELF_SERVE_SMOKE_DATABASE_SECRET}" --project="${PROJECT_ID}" 2>/tmp/quipsly-self-serve-db-secret.err)"; then
    echo "Could not read generated self-serve smoke database secret ${GENERATED_SELF_SERVE_SMOKE_DATABASE_SECRET}." >&2
    cat /tmp/quipsly-self-serve-db-secret.err >&2 || true
    return 1
  fi
  rm -f /tmp/quipsly-self-serve-db-secret.err

  local cloud_sql_connection_name
  cloud_sql_connection_name="$(DATABASE_URL="${remote_database_url}" node - <<'NODE'
const url = new URL(process.env.DATABASE_URL || "");
const socketHost = url.searchParams.get("host") || "";
if (!socketHost.startsWith("/cloudsql/")) process.exit(0);
process.stdout.write(socketHost.replace(/^\/cloudsql\//, ""));
NODE
)"

  if [[ -z "${cloud_sql_connection_name}" ]]; then
    DATABASE_URL="${remote_database_url}" \
      PRISMA_PG_CONNECTION_TIMEOUT_MS="${GENERATED_SELF_SERVE_SMOKE_DB_TIMEOUT_MS}" \
      QUIPSLY_SELF_SERVE_SMOKE_BASE_URL="${target_url}" \
      node scripts/quipsly-generated-self-serve-account-smoke.mjs
    return "$?"
  fi

  if ! command -v cloud-sql-proxy >/dev/null 2>&1; then
    echo "cloud-sql-proxy is required for remote generated self-serve smoke because ${GENERATED_SELF_SERVE_SMOKE_DATABASE_SECRET} uses a Cloud SQL socket URL." >&2
    return 1
  fi

  local proxy_port
  proxy_port="$(python3 - <<'PY'
import socket
s = socket.socket()
s.bind(("127.0.0.1", 0))
print(s.getsockname()[1])
s.close()
PY
)"
  local proxy_log
  proxy_log="$(mktemp -t quipsly-self-serve-cloud-sql-proxy.XXXXXX.log)"
  cloud-sql-proxy "${cloud_sql_connection_name}" \
    --address 127.0.0.1 \
    --port "${proxy_port}" \
    --quota-project "${PROJECT_ID}" \
    >"${proxy_log}" 2>&1 &
  local proxy_pid=$!

  if ! python3 - "${proxy_port}" <<'PY'
import socket
import sys
import time
port = int(sys.argv[1])
deadline = time.time() + 20
while time.time() < deadline:
    try:
        with socket.create_connection(("127.0.0.1", port), timeout=1):
            sys.exit(0)
    except OSError:
        time.sleep(0.25)
sys.exit(1)
PY
  then
    echo "Cloud SQL proxy did not become ready for generated self-serve smoke." >&2
    cat "${proxy_log}" >&2 || true
    kill "${proxy_pid}" >/dev/null 2>&1 || true
    wait "${proxy_pid}" >/dev/null 2>&1 || true
    rm -f "${proxy_log}"
    return 1
  fi

  set +e
  DATABASE_URL="${remote_database_url}" \
    PRISMA_PG_CONNECTION_TIMEOUT_MS="${GENERATED_SELF_SERVE_SMOKE_DB_TIMEOUT_MS}" \
    QUIPSLY_SELF_SERVE_SMOKE_BASE_URL="${target_url}" \
    QUIPSLY_SMOKE_CLOUD_SQL_PROXY_PORT="${proxy_port}" \
    node scripts/quipsly-generated-self-serve-account-smoke.mjs
  local smoke_status=$?
  set -e

  kill "${proxy_pid}" >/dev/null 2>&1 || true
  wait "${proxy_pid}" >/dev/null 2>&1 || true
  rm -f "${proxy_log}"

  return "${smoke_status}"
}

run_generated_admin_smoke_if_requested() {
  local target_url="$1"
  if [[ "${RUN_GENERATED_ADMIN_SMOKE}" != "1" ]]; then
    return
  fi

  echo "Running generated @dev.test admin smoke against ${target_url}"
  if [[ "${target_url}" == http://localhost:* || "${target_url}" == http://127.0.0.1:* ]]; then
    QUIPSLY_ADMIN_SMOKE_BASE_URL="${target_url}" node scripts/quipsly-generated-admin-user-smoke.mjs
    return
  fi

  local remote_database_url
  if ! remote_database_url="$(gcloud secrets versions access latest --secret="${GENERATED_ADMIN_SMOKE_DATABASE_SECRET}" --project="${PROJECT_ID}" 2>/tmp/quipsly-admin-db-secret.err)"; then
    echo "Could not read generated admin smoke database secret ${GENERATED_ADMIN_SMOKE_DATABASE_SECRET}." >&2
    cat /tmp/quipsly-admin-db-secret.err >&2 || true
    return 1
  fi
  rm -f /tmp/quipsly-admin-db-secret.err

  local cloud_sql_connection_name
  cloud_sql_connection_name="$(DATABASE_URL="${remote_database_url}" node - <<'NODE'
const url = new URL(process.env.DATABASE_URL || "");
const socketHost = url.searchParams.get("host") || "";
if (!socketHost.startsWith("/cloudsql/")) process.exit(0);
process.stdout.write(socketHost.replace(/^\/cloudsql\//, ""));
NODE
)"

  if [[ -z "${cloud_sql_connection_name}" ]]; then
    DATABASE_URL="${remote_database_url}" \
      PRISMA_PG_CONNECTION_TIMEOUT_MS="${GENERATED_ADMIN_SMOKE_DB_TIMEOUT_MS}" \
      QUIPSLY_ADMIN_SMOKE_BASE_URL="${target_url}" \
      node scripts/quipsly-generated-admin-user-smoke.mjs
    return "$?"
  fi

  if ! command -v cloud-sql-proxy >/dev/null 2>&1; then
    echo "cloud-sql-proxy is required for remote generated admin smoke because ${GENERATED_ADMIN_SMOKE_DATABASE_SECRET} uses a Cloud SQL socket URL." >&2
    return 1
  fi

  local proxy_port
  proxy_port="$(python3 - <<'PY'
import socket
s = socket.socket()
s.bind(("127.0.0.1", 0))
print(s.getsockname()[1])
s.close()
PY
)"
  local proxy_log
  proxy_log="$(mktemp -t quipsly-admin-cloud-sql-proxy.XXXXXX.log)"
  cloud-sql-proxy "${cloud_sql_connection_name}" \
    --address 127.0.0.1 \
    --port "${proxy_port}" \
    --quota-project "${PROJECT_ID}" \
    >"${proxy_log}" 2>&1 &
  local proxy_pid=$!

  if ! python3 - "${proxy_port}" <<'PY'
import socket
import sys
import time
port = int(sys.argv[1])
deadline = time.time() + 20
while time.time() < deadline:
    try:
        with socket.create_connection(("127.0.0.1", port), timeout=1):
            sys.exit(0)
    except OSError:
        time.sleep(0.25)
sys.exit(1)
PY
  then
    echo "Cloud SQL proxy did not become ready for generated admin smoke." >&2
    cat "${proxy_log}" >&2 || true
    kill "${proxy_pid}" >/dev/null 2>&1 || true
    wait "${proxy_pid}" >/dev/null 2>&1 || true
    rm -f "${proxy_log}"
    return 1
  fi

  set +e
  DATABASE_URL="${remote_database_url}" \
    PRISMA_PG_CONNECTION_TIMEOUT_MS="${GENERATED_ADMIN_SMOKE_DB_TIMEOUT_MS}" \
    QUIPSLY_ADMIN_SMOKE_BASE_URL="${target_url}" \
    QUIPSLY_SMOKE_CLOUD_SQL_PROXY_PORT="${proxy_port}" \
    node scripts/quipsly-generated-admin-user-smoke.mjs
  local smoke_status=$?
  set -e

  kill "${proxy_pid}" >/dev/null 2>&1 || true
  wait "${proxy_pid}" >/dev/null 2>&1 || true
  rm -f "${proxy_log}"

  return "${smoke_status}"
}

if [[ "${RUN_LOCAL_SMOKE}" == "1" ]]; then
  TARGET_URL="${LOCAL_TARGET_URL}" bash scripts/dev/quipsly-local-smoke.sh
  run_auth_smoke_if_configured "${LOCAL_TARGET_URL}"
  run_generated_invite_smoke_if_requested "${LOCAL_TARGET_URL}"
  run_generated_self_serve_smoke_if_requested "${LOCAL_TARGET_URL}"
  run_generated_admin_smoke_if_requested "${LOCAL_TARGET_URL}"
elif [[ "${RUN_LOCAL_SMOKE}" == "auto" ]]; then
  if curl -fsS --max-time 5 "${LOCAL_TARGET_URL}/login?callbackUrl=%2Fprojects" >/dev/null 2>&1; then
    TARGET_URL="${LOCAL_TARGET_URL}" bash scripts/dev/quipsly-local-smoke.sh
    run_auth_smoke_if_configured "${LOCAL_TARGET_URL}"
    run_generated_invite_smoke_if_requested "${LOCAL_TARGET_URL}"
    run_generated_self_serve_smoke_if_requested "${LOCAL_TARGET_URL}"
    run_generated_admin_smoke_if_requested "${LOCAL_TARGET_URL}"
  else
    echo "Local Quipsly server not reachable at ${LOCAL_TARGET_URL}; skipping local smoke."
    echo "Start it with: PORT=3012 pnpm --filter quipsly dev"
  fi
fi

if [[ "${SKIP_CLOUD_BUILD}" == "1" ]]; then
  echo "Using existing image ${IMAGE_URI}"
else
  echo "Building hotfix image with ${CLOUD_BUILD_CONFIG}"
  gcloud builds submit \
    --quiet \
    --config "${CLOUD_BUILD_CONFIG}" \
    --substitutions "_REGION=${REGION},_ARTIFACT_REPOSITORY=${ARTIFACT_REPOSITORY},_IMAGE_NAME=${IMAGE_NAME},_IMAGE_TAG=${IMAGE_TAG},_QUIPSLY_DOCKER_IGNORE_TYPE_ERRORS=${QUIPSLY_DOCKER_IGNORE_TYPE_ERRORS}" \
    .
fi

echo "Verifying image tag exists in Artifact Registry"
if ! gcloud artifacts docker tags list "${IMAGE_REPOSITORY}" \
  --filter="tag~${IMAGE_TAG}$" \
  --format="value(tag)" | grep -q "${IMAGE_TAG}$"; then
  echo "Could not verify image tag ${IMAGE_TAG} in ${IMAGE_REPOSITORY}." >&2
  echo "If Cloud Build just reported a transient image-verification issue, inspect Artifact Registry before retrying." >&2
  exit 1
fi

echo "Deploying no-traffic hotfix revision"
UPDATE_ENV_VARS="QUIPSLY_IMAGE_TAG=${IMAGE_TAG},QUIPSLY_SOURCE_SHA=${SOURCE_SHA},QUIPSLY_RELEASE_CHANNEL=hotfix,QUIPSLY_DEPLOYED_BY=${DEPLOYED_BY},QUIPSLY_APP_HOST=nest.quipsly.com,QUIPSLY_MARKETING_HOST=quipsly.com,QUIPSLY_LEGACY_STUDIO_HOST=studio-hm2odnvjga-uc.a.run.app"
UPDATE_ENV_VARS="${UPDATE_ENV_VARS},QUIPSLY_ADMIN_BREAK_GLASS_ENABLED=${QUIPSLY_ADMIN_BREAK_GLASS_ENABLED}"
if [[ "${QUIPSLY_ADMIN_BREAK_GLASS_ENABLED}" == "true" ]]; then
  UPDATE_ENV_VARS="${UPDATE_ENV_VARS},QUIPSLY_ADMIN_EMAILS=${QUIPSLY_ADMIN_EMAILS}"
fi
if [[ -n "${EXTRA_UPDATE_ENV_VARS}" ]]; then
  UPDATE_ENV_VARS="${UPDATE_ENV_VARS},${EXTRA_UPDATE_ENV_VARS}"
fi

deploy_args=(
  "${SERVICE_NAME}"
  "--image=${IMAGE_URI}"
  "--region=${REGION}"
  "--min-instances=${MIN_INSTANCES}"
  "--max-instances=${MAX_INSTANCES}"
  "--no-traffic"
  "--tag=${PREVIEW_TAG}"
  "--update-env-vars=${UPDATE_ENV_VARS}"
  "--quiet"
)

if [[ -n "${EXTRA_UPDATE_SECRETS}" ]]; then
  deploy_args+=("--update-secrets=${EXTRA_UPDATE_SECRETS}")
fi

gcloud run deploy "${deploy_args[@]}"

PREVIEW_URL="$(gcloud run services describe "${SERVICE_NAME}" \
  --region "${REGION}" \
  --format=json | node -e '
    const fs = require("fs");
    const service = JSON.parse(fs.readFileSync(0, "utf8"));
    const tag = process.env.PREVIEW_TAG;
    const traffic = service.status?.traffic || [];
    const match = traffic.find((entry) => entry.tag === tag);
    if (!match?.url) process.exit(1);
    console.log(match.url);
  ')"

echo "Preview URL: ${PREVIEW_URL}"
TARGET_URL="${PREVIEW_URL}" bash scripts/dev/quipsly-local-smoke.sh
run_auth_smoke_if_configured "${PREVIEW_URL}"
run_generated_invite_smoke_if_requested "${PREVIEW_URL}"
run_generated_self_serve_smoke_if_requested "${PREVIEW_URL}"
run_generated_admin_smoke_if_requested "${PREVIEW_URL}"

if [[ "${PROMOTE}" == "1" ]]; then
  echo "Promoting ${PREVIEW_TAG} to 100% live traffic"
  gcloud run services update-traffic "${SERVICE_NAME}" \
    --region="${REGION}" \
    --to-tags="${PREVIEW_TAG}=100" \
    --quiet

  echo "Running live smoke against ${LIVE_URL}"
  TARGET_URL="${LIVE_URL}" bash scripts/dev/quipsly-local-smoke.sh
  run_auth_smoke_if_configured "${LIVE_URL}"
  run_generated_invite_smoke_if_requested "${LIVE_URL}"
  run_generated_self_serve_smoke_if_requested "${LIVE_URL}"
  run_generated_admin_smoke_if_requested "${LIVE_URL}"
else
  echo "Hotfix preview is ready but not promoted."
  echo "Promote after review with:"
  if [[ "${QUIPSLY_ADMIN_BREAK_GLASS_ENABLED}" == "true" ]]; then
    echo "  PROMOTE=1 SKIP_CLOUD_BUILD=1 IMAGE_TAG=${IMAGE_TAG} PREVIEW_TAG=${PREVIEW_TAG} QUIPSLY_ADMIN_BREAK_GLASS_ENABLED=true QUIPSLY_ADMIN_EMAILS='<same operator list>' EXTRA_UPDATE_ENV_VARS='${EXTRA_UPDATE_ENV_VARS}' bash scripts/release/quipsly-hotfix-deploy.sh"
  else
    echo "  PROMOTE=1 SKIP_CLOUD_BUILD=1 IMAGE_TAG=${IMAGE_TAG} PREVIEW_TAG=${PREVIEW_TAG} EXTRA_UPDATE_ENV_VARS='${EXTRA_UPDATE_ENV_VARS}' bash scripts/release/quipsly-hotfix-deploy.sh"
  fi
fi
