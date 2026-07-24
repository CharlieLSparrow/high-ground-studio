#!/usr/bin/env bash
set -euo pipefail

PROJECT_ID="${PROJECT_ID:-high-ground-odyssey}"
DATABASE_SECRET="${QUIPSLY_INVITE_SMOKE_DATABASE_SECRET:-studio-database-url}"
AUTH_SECRET_NAME="${QUIPSLY_INVITE_SMOKE_AUTH_SECRET:-studio-auth-secret}"
CLOUD_SQL_INSTANCE="${QUIPSLY_CLOUD_SQL_INSTANCE:-high-ground-odyssey:us-central1:studio-postgres}"
PROXY_PORT="${QUIPSLY_SMOKE_CLOUD_SQL_PROXY_PORT:-15444}"
BASE_URL="${QUIPSLY_AUTH_SMOKE_BASE_URL:-https://nest.quipsly.com}"
PROJECT_SLUG="${QUIPSLY_INVITE_SMOKE_PROJECT_SLUG:-marine-biology-research}"

echo "Running Quipsly live invited-user smoke against ${BASE_URL}"
echo "Target Nest: ${PROJECT_SLUG}"
echo "Secrets are read into process environment only; database URLs, passwords, tokens, and cookies are not printed."

DB_URL="$(gcloud secrets versions access latest --secret="${DATABASE_SECRET}" --project="${PROJECT_ID}")"
AUTH_SECRET_FILE="$(mktemp -t quipsly-invite-auth-secret.XXXXXX)"
chmod 0600 "${AUTH_SECRET_FILE}"
gcloud secrets versions access latest --secret="${AUTH_SECRET_NAME}" --project="${PROJECT_ID}" >"${AUTH_SECRET_FILE}"

cleanup_proxy() {
  if [[ -n "${PROXY_PID:-}" ]]; then
    kill "${PROXY_PID}" >/dev/null 2>&1 || true
  fi
  if [[ -n "${AUTH_SECRET_FILE:-}" ]]; then
    rm -f "${AUTH_SECRET_FILE}" >/dev/null 2>&1 || true
  fi
}
trap cleanup_proxy EXIT

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
    >/tmp/quipsly-invited-user-smoke-proxy.log 2>&1 &
  PROXY_PID=$!
  sleep 3

  DATABASE_URL="${DB_URL}" \
    AUTH_SECRET="" \
    NEXTAUTH_SECRET="" \
    AUTH_SECRET_FILE="${AUTH_SECRET_FILE}" \
    QUIPSLY_SMOKE_CLOUD_SQL_PROXY_PORT="${PROXY_PORT}" \
    QUIPSLY_AUTH_SMOKE_BASE_URL="${BASE_URL}" \
    QUIPSLY_INVITE_SMOKE_PROJECT_SLUG="${PROJECT_SLUG}" \
    node scripts/quipsly-generated-invited-user-smoke.mjs
else
  DATABASE_URL="${DB_URL}" \
    AUTH_SECRET="" \
    NEXTAUTH_SECRET="" \
    AUTH_SECRET_FILE="${AUTH_SECRET_FILE}" \
    QUIPSLY_AUTH_SMOKE_BASE_URL="${BASE_URL}" \
    QUIPSLY_INVITE_SMOKE_PROJECT_SLUG="${PROJECT_SLUG}" \
    node scripts/quipsly-generated-invited-user-smoke.mjs
fi
