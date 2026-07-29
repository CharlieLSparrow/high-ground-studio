#!/usr/bin/env bash
set -euo pipefail

PROJECT_ID="${PROJECT_ID:-high-ground-odyssey}"
DATABASE_SECRET="${QUIPSLY_IDENTITY_RECONCILE_DATABASE_SECRET:-studio-database-url}"
CLOUD_SQL_INSTANCE="${QUIPSLY_CLOUD_SQL_INSTANCE:-high-ground-odyssey:us-central1:studio-postgres}"
PROXY_PORT="${QUIPSLY_SMOKE_CLOUD_SQL_PROXY_PORT:-15459}"

echo "Reconciling one existing Firebase email alias against the canonical Quipsly identity ledger."
echo "The command is dry-run-only unless --apply is explicitly included."
echo "Database URLs, access tokens, Firebase UIDs, passwords, and credential material are not printed."

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
    >/tmp/quipsly-firebase-email-alias-reconcile-proxy.log 2>&1 &
  PROXY_PID=$!
  trap cleanup_proxy EXIT
  sleep 2

  DATABASE_URL="${DB_URL}" \
    FIREBASE_PROJECT_ID="${FIREBASE_PROJECT_ID:-quipsly-reef}" \
    QUIPSLY_SMOKE_CLOUD_SQL_PROXY_PORT="${PROXY_PORT}" \
    node scripts/quipsly-reconcile-firebase-email-alias.mjs "$@"
else
  DATABASE_URL="${DB_URL}" \
    FIREBASE_PROJECT_ID="${FIREBASE_PROJECT_ID:-quipsly-reef}" \
    node scripts/quipsly-reconcile-firebase-email-alias.mjs "$@"
fi
