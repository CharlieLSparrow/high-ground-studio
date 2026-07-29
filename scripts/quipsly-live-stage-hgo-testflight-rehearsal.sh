#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PROJECT_ID="${PROJECT_ID:-high-ground-odyssey}"
DATABASE_SECRET="${QUIPSLY_REHEARSAL_DATABASE_SECRET:-studio-database-url}"
CLOUD_SQL_INSTANCE="${QUIPSLY_CLOUD_SQL_INSTANCE:-high-ground-odyssey:us-central1:studio-postgres}"
PROXY_PORT="${QUIPSLY_REHEARSAL_STAGE_CLOUD_SQL_PROXY_PORT:-15461}"
OUTPUT_JSON="${QUIPSLY_REHEARSAL_STAGE_OUTPUT_JSON:-/private/tmp/quipsly-capture-rehearsal/live-stage.json}"

echo "Quipsly High Ground Odyssey TestFlight rehearsal staging"
echo "output_json=${OUTPUT_JSON}"
echo "Apply mode privately imports only the explicitly supplied manuscript and clips."
echo "It does not start playback, join a provider, start a recording, or change participant consent."
echo "Secrets, database credentials, Firebase tokens, session cookies, and passwords are never printed."

database_url="$(gcloud secrets versions access latest \
  --secret="${DATABASE_SECRET}" \
  --project="${PROJECT_ID}")"

proxy_binary="${QUIPSLY_CLOUD_SQL_PROXY_BIN:-}"
if [[ -z "${proxy_binary}" ]]; then
  proxy_binary="$(command -v cloud-sql-proxy || true)"
fi
if [[ -z "${proxy_binary}" ]]; then
  echo "cloud-sql-proxy is required." >&2
  exit 2
fi

proxy_log="$(mktemp -t quipsly-rehearsal-stage-proxy.XXXXXX.log)"
"${proxy_binary}" \
  --quota-project "${PROJECT_ID}" \
  --port "${PROXY_PORT}" \
  "${CLOUD_SQL_INSTANCE}" \
  >"${proxy_log}" 2>&1 &
proxy_pid=$!

cleanup_rehearsal_stage() {
  kill "${proxy_pid}" >/dev/null 2>&1 || true
  rm -f -- "${proxy_log}" >/dev/null 2>&1 || true
}
trap cleanup_rehearsal_stage EXIT

for attempt_no in 1 2 3 4 5 6 7 8; do
  if nc -z 127.0.0.1 "${PROXY_PORT}" >/dev/null 2>&1; then
    break
  fi
  if ! kill -0 "${proxy_pid}" >/dev/null 2>&1; then
    echo "Cloud SQL proxy exited before becoming ready." >&2
    exit 2
  fi
  sleep 1
done

mkdir -p "$(dirname "${OUTPUT_JSON}")"
DATABASE_URL="${database_url}" \
QUIPSLY_SMOKE_CLOUD_SQL_PROXY_PORT="${PROXY_PORT}" \
node "${ROOT_DIR}/scripts/quipsly-stage-hgo-testflight-rehearsal.mjs" \
  --output "${OUTPUT_JSON}" \
  "$@"
