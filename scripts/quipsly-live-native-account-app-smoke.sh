#!/usr/bin/env bash
set -euo pipefail

PROJECT_ID="${PROJECT_ID:-high-ground-odyssey}"
DATABASE_SECRET="${QUIPSLY_NATIVE_APP_SMOKE_DATABASE_SECRET:-studio-database-url}"
CLOUD_SQL_INSTANCE="${QUIPSLY_CLOUD_SQL_INSTANCE:-high-ground-odyssey:us-central1:studio-postgres}"
PROXY_PORT="${QUIPSLY_SMOKE_CLOUD_SQL_PROXY_PORT:-15446}"
BASE_URL="${QUIPSLY_NATIVE_SMOKE_BASE_URL:-https://nest.quipsly.com}"

echo "Running Quipsly live native account app smoke against ${BASE_URL}"
echo "Requires QuipslyStudio AgentServer at ${QUIPSLY_AGENT_URL:-http://127.0.0.1:8080}."
echo "Secrets are read into process environment only; database URLs, passwords, tokens, and cookies are not printed."

DB_URL="$(gcloud secrets versions access latest --secret="${DATABASE_SECRET}" --project="${PROJECT_ID}")"

cleanup_proxy() {
  if [[ -n "${PROXY_PID:-}" ]]; then
    kill "${PROXY_PID}" >/dev/null 2>&1 || true
  fi
}

if printf '%s' "${DB_URL}" | rg -q '/cloudsql/'; then
  PROXY_BIN="${QUIPSLY_CLOUD_SQL_PROXY_BIN:-/tmp/cloud-sql-proxy-quipsly}"
  if [[ ! -x "${PROXY_BIN}" ]]; then
    if command -v cloud-sql-proxy >/dev/null 2>&1; then
      PROXY_BIN="$(command -v cloud-sql-proxy)"
    else
      echo "cloud-sql-proxy is required because DATABASE_URL uses a Cloud SQL socket host." >&2
      exit 2
    fi
  fi

  "${PROXY_BIN}" \
    --quota-project "${PROJECT_ID}" \
    --port "${PROXY_PORT}" \
    "${CLOUD_SQL_INSTANCE}" \
    >/tmp/quipsly-native-account-app-smoke-proxy.log 2>&1 &
  PROXY_PID=$!
  trap cleanup_proxy EXIT
  sleep 3

  DATABASE_URL="${DB_URL}" \
    QUIPSLY_SMOKE_CLOUD_SQL_PROXY_PORT="${PROXY_PORT}" \
    QUIPSLY_NATIVE_SMOKE_BASE_URL="${BASE_URL}" \
    node scripts/quipsly-generated-native-account-app-smoke.mjs
else
  DATABASE_URL="${DB_URL}" \
    QUIPSLY_NATIVE_SMOKE_BASE_URL="${BASE_URL}" \
    node scripts/quipsly-generated-native-account-app-smoke.mjs
fi
