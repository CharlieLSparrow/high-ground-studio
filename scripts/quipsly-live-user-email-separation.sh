#!/usr/bin/env bash
set -euo pipefail

project_id="${PROJECT_ID:-high-ground-odyssey}"
database_secret="${QUIPSLY_IDENTITY_SEPARATION_DATABASE_SECRET:-studio-database-url}"
instance="${QUIPSLY_CLOUD_SQL_INSTANCE:-high-ground-odyssey:us-central1:studio-postgres}"
proxy_port="${QUIPSLY_SMOKE_CLOUD_SQL_PROXY_PORT:-15463}"
proxy_bin="${QUIPSLY_CLOUD_SQL_PROXY_BIN:-$(command -v cloud-sql-proxy || true)}"
work_dir="$(mktemp -d /private/tmp/quipsly-identity-separation.XXXXXX)"
proxy_pid=""
cleanup() { if [[ -n "${proxy_pid}" ]]; then kill "${proxy_pid}" >/dev/null 2>&1 || true; fi; }
trap cleanup EXIT

database_url="$(gcloud secrets versions access latest --secret="${database_secret}" --project="${project_id}")"
if printf '%s' "${database_url}" | rg -q '/cloudsql/'; then
  [[ -n "${proxy_bin}" ]] || { echo "cloud-sql-proxy is required." >&2; exit 2; }
  "${proxy_bin}" --quota-project "${project_id}" --port "${proxy_port}" "${instance}" >"${work_dir}/proxy.log" 2>&1 &
  proxy_pid=$!
  sleep 2
  DATABASE_URL="${database_url}" FIREBASE_PROJECT_ID="${FIREBASE_PROJECT_ID:-quipsly-reef}" QUIPSLY_SMOKE_CLOUD_SQL_PROXY_PORT="${proxy_port}" \
    node scripts/quipsly-separate-user-email-alias.mjs "$@"
else
  DATABASE_URL="${database_url}" FIREBASE_PROJECT_ID="${FIREBASE_PROJECT_ID:-quipsly-reef}" \
    node scripts/quipsly-separate-user-email-alias.mjs "$@"
fi
