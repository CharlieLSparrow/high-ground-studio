#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PROJECT_ID="${PROJECT_ID:-high-ground-odyssey}"
DATABASE_SECRET="${QUIPSLY_REHEARSAL_DATABASE_SECRET:-studio-database-url}"
CLOUD_SQL_INSTANCE="${QUIPSLY_CLOUD_SQL_INSTANCE:-high-ground-odyssey:us-central1:studio-postgres}"
PROXY_PORT="${QUIPSLY_REHEARSAL_MEDIA_CLOUD_SQL_PROXY_PORT:-15459}"
OUTPUT_JSON="${QUIPSLY_REHEARSAL_MEDIA_OUTPUT_JSON:-/private/tmp/quipsly-capture-rehearsal/live-media-proof.json}"
FIXTURE_NAME="${QUIPSLY_REHEARSAL_FIXTURE_NAME:-Quipsly Capture Rehearsal System Check.m4a}"
APPLY="${QUIPSLY_REHEARSAL_MEDIA_APPLY:-0}"

if [[ "${APPLY}" != "0" && "${APPLY}" != "1" ]]; then
  echo "QUIPSLY_REHEARSAL_MEDIA_APPLY must be 0 or 1." >&2
  exit 2
fi

echo "Quipsly High Ground Odyssey media rehearsal proof"
echo "mode=$([[ "${APPLY}" == "1" ]] && echo apply || echo plan)"
echo "output_json=${OUTPUT_JSON}"
echo "The fixture is synthetic and represents no person, recording consent, or completed human listening."
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

proxy_log="$(mktemp -t quipsly-rehearsal-media-proxy.XXXXXX.log)"
media_tmp="$(mktemp -d /private/tmp/quipsly-rehearsal-media.XXXXXX)"
"${proxy_binary}" \
  --quota-project "${PROJECT_ID}" \
  --port "${PROXY_PORT}" \
  "${CLOUD_SQL_INSTANCE}" \
  >"${proxy_log}" 2>&1 &
proxy_pid=$!

cleanup_rehearsal_media() {
  kill "${proxy_pid}" >/dev/null 2>&1 || true
  rm -f -- "${proxy_log}" >/dev/null 2>&1 || true
  rm -rf -- "${media_tmp}" >/dev/null 2>&1 || true
}
trap cleanup_rehearsal_media EXIT

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
  "${ROOT_DIR}/scripts/quipsly-verify-hgo-rehearsal-media.mjs"
  --output
  "${OUTPUT_JSON}"
)
if [[ "${APPLY}" == "1" ]]; then
  aiff_path="${media_tmp}/fixture.aiff"
  media_path="${media_tmp}/${FIXTURE_NAME}"
  say \
    -o "${aiff_path}" \
    "Quipsly Capture production rehearsal. This is a synthetic system check, not a participant recording. The shared episode source, authenticated playback, and assembled audio timeline are ready for Charlie and Homer to review."
  ffmpeg \
    -hide_banner \
    -loglevel error \
    -y \
    -i "${aiff_path}" \
    -ar 48000 \
    -ac 1 \
    -c:a aac \
    -b:a 192k \
    "${media_path}"
  duration_seconds="$(
    ffprobe \
      -v error \
      -show_entries format=duration \
      -of default=noprint_wrappers=1:nokey=1 \
      "${media_path}"
  )"
  command_args+=(
    --apply
    --media
    "${media_path}"
    --fixture-name
    "${FIXTURE_NAME}"
    --duration-seconds
    "${duration_seconds}"
  )
fi

DATABASE_URL="${database_url}" \
QUIPSLY_SMOKE_CLOUD_SQL_PROXY_PORT="${PROXY_PORT}" \
"${command_args[@]}"
