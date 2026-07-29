#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PROJECT_ID="${PROJECT_ID:-high-ground-odyssey}"
DATABASE_SECRET="${QUIPSLY_REHEARSAL_DATABASE_SECRET:-studio-database-url}"
CLOUD_SQL_INSTANCE="${QUIPSLY_CLOUD_SQL_INSTANCE:-high-ground-odyssey:us-central1:studio-postgres}"
PROXY_PORT="${QUIPSLY_REHEARSAL_CLOUD_SQL_PROXY_PORT:-15458}"
OUTPUT_JSON="${QUIPSLY_REHEARSAL_OUTPUT_JSON:-/private/tmp/quipsly-capture-rehearsal/live-rehearsal.json}"
APPLY="${QUIPSLY_REHEARSAL_APPLY:-0}"

if [[ "${APPLY}" != "0" && "${APPLY}" != "1" ]]; then
  echo "QUIPSLY_REHEARSAL_APPLY must be 0 or 1." >&2
  exit 2
fi

echo "Quipsly High Ground Odyssey TestFlight rehearsal preparation"
echo "mode=$([[ "${APPLY}" == "1" ]] && echo apply || echo plan)"
echo "output_json=${OUTPUT_JSON}"
echo "Secrets, database credentials, Firebase tokens, and passwords are never printed."

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

proxy_log="$(mktemp -t quipsly-rehearsal-proxy.XXXXXX.log)"
"${proxy_binary}" \
  --quota-project "${PROJECT_ID}" \
  --port "${PROXY_PORT}" \
  "${CLOUD_SQL_INSTANCE}" \
  >"${proxy_log}" 2>&1 &
proxy_pid=$!

cleanup_rehearsal() {
  kill "${proxy_pid}" >/dev/null 2>&1 || true
  rm -f "${proxy_log}" >/dev/null 2>&1 || true
}
trap cleanup_rehearsal EXIT

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
command_args=(
  node
  "${ROOT_DIR}/scripts/quipsly-prepare-hgo-testflight-rehearsal.mjs"
  --output
  "${OUTPUT_JSON}"
)
if [[ "${APPLY}" == "1" ]]; then
  command_args+=(--apply)
fi

DATABASE_URL="${database_url}" \
QUIPSLY_SMOKE_CLOUD_SQL_PROXY_PORT="${PROXY_PORT}" \
"${command_args[@]}"
