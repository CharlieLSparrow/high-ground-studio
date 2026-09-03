#!/usr/bin/env bash
set -euo pipefail
umask 077

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/../.." && pwd)"

PROJECT_ID="${PROJECT_ID:-high-ground-odyssey}"
REGION="${REGION:-us-central1}"
SERVICE_NAME="${SERVICE_NAME:-studio}"
PREVIEW_TAG="${PREVIEW_TAG:-quipsly-preview}"
SOURCE_REF="${SOURCE_REF:-HEAD}"
DATABASE_SECRET="${QUIPSLY_GENERATED_REVIEWER_DATABASE_SECRET:-studio-database-url}"
DATABASE_SECRET_VERSION="${QUIPSLY_GENERATED_REVIEWER_DATABASE_SECRET_VERSION:-latest}"
FIREBASE_PROJECT_ID="${FIREBASE_PROJECT_ID:-quipsly-reef}"
DATABASE_TIMEOUT_MS="${QUIPSLY_GENERATED_REVIEWER_DATABASE_TIMEOUT_MS:-30000}"
MODE="${1:-smoke}"
BASE_URL="${QUIPSLY_GENERATED_REVIEWER_BASE_URL:-https://nest.quipsly.com}"
WORK_DIR="$(mktemp -d "${TMPDIR:-/private/tmp}/quipsly-generated-reviewer.XXXXXX")"
PROXY_PID=""
PROXY_PORT=""

usage() {
  cat <<'USAGE'
Usage:
  scripts/release/quipsly-generated-reviewer.sh smoke
  scripts/release/quipsly-generated-reviewer.sh promote-preview

Modes:
  smoke            Exercise production with a generated reviewer. Never moves traffic.
  promote-preview  Exercise and promote the exact no-traffic preview revision.

The command reads the database secret and public Firebase client configuration
without printing them, creates an authenticated Cloud SQL proxy only when the
database URL requires it, and relies on the generated-reviewer smoke to remove
its tightly named Firebase and database artifacts in a finally block.
USAGE
}

fail() {
  printf "FAIL %s\n" "$1" >&2
  exit 1
}

cleanup() {
  if [[ -n "${PROXY_PID}" ]]; then
    kill "${PROXY_PID}" >/dev/null 2>&1 || true
    wait "${PROXY_PID}" >/dev/null 2>&1 || true
    PROXY_PID=""
  fi

  case "${WORK_DIR}" in
    "${TMPDIR:-/private/tmp}"/quipsly-generated-reviewer.*)
      rm -rf -- "${WORK_DIR}"
      ;;
    *)
      printf "WARN Refusing to remove unexpected work directory: %s\n" "${WORK_DIR}" >&2
      ;;
  esac
}
trap cleanup EXIT

require_command() {
  command -v "$1" >/dev/null 2>&1 || fail "Required command is unavailable: $1"
}

resolve_cloud_sql_proxy() {
  if [[ -n "${QUIPSLY_CLOUD_SQL_PROXY_BIN:-}" && -x "${QUIPSLY_CLOUD_SQL_PROXY_BIN}" ]]; then
    printf "%s" "${QUIPSLY_CLOUD_SQL_PROXY_BIN}"
    return
  fi

  local proxy_binary
  proxy_binary="$(command -v cloud-sql-proxy || true)"
  if [[ -n "${proxy_binary}" ]]; then
    printf "%s" "${proxy_binary}"
    return
  fi

  local sdk_root
  sdk_root="$(gcloud info --format='value(installation.sdk_root)' 2>/dev/null || true)"
  if [[ -n "${sdk_root}" && -x "${sdk_root}/bin/cloud-sql-proxy" ]]; then
    printf "%s" "${sdk_root}/bin/cloud-sql-proxy"
    return
  fi

  return 1
}

resolve_preview_url() {
  local service_json="${WORK_DIR}/service.json"
  gcloud run services describe "${SERVICE_NAME}" \
    --project="${PROJECT_ID}" \
    --region="${REGION}" \
    --format=json >"${service_json}"

  node - "${service_json}" "${PREVIEW_TAG}" <<'NODE'
const fs = require("node:fs");
const service = JSON.parse(fs.readFileSync(process.argv[2], "utf8"));
const tag = process.argv[3];
const preview = (service.status?.traffic || []).find((entry) => entry.tag === tag);
if (!preview?.revisionName || !preview?.url) {
  process.stderr.write(`Cloud Run tag ${tag} has no immutable revision and URL.\n`);
  process.exit(1);
}
if (Number(preview.percent || 0) !== 0) {
  process.stderr.write(`Cloud Run tag ${tag} has non-zero traffic.\n`);
  process.exit(1);
}
const url = new URL(preview.url);
if (url.protocol !== "https:") {
  process.stderr.write(`Cloud Run tag ${tag} does not use HTTPS.\n`);
  process.exit(1);
}
process.stderr.write(
  `Resolved no-traffic preview ${preview.revisionName} at ${url.origin}.\n`,
);
process.stdout.write(url.origin);
NODE
}

validate_base_url() {
  node - "$1" "${SERVICE_NAME}" <<'NODE'
const rawUrl = process.argv[2];
const serviceName = process.argv[3];
const url = new URL(rawUrl);
const hostname = url.hostname.toLowerCase();
const isLoopback = hostname === "localhost" || hostname === "127.0.0.1";
const isQuipsly = hostname === "quipsly.com" || hostname.endsWith(".quipsly.com");
const isConfiguredCloudRunService =
  hostname.endsWith(".run.app")
  && (
    hostname.startsWith(`${serviceName}-`)
    || hostname.includes(`---${serviceName}-`)
  );
const secureTransport = url.protocol === "https:" || (
  isLoopback && url.protocol === "http:"
);
const cleanOrigin =
  !url.username
  && !url.password
  && (url.pathname === "/" || url.pathname === "")
  && !url.search
  && !url.hash;
if (
  !secureTransport
  || !cleanOrigin
  || (!isLoopback && !isQuipsly && !isConfiguredCloudRunService)
) {
  process.stderr.write(
    "Reviewer target must be a clean HTTPS Quipsly/configured Cloud Run origin or HTTP loopback.\n",
  );
  process.exit(1);
}
process.stdout.write(url.origin);
NODE
}

read_firebase_api_key() {
  local config_file="${WORK_DIR}/firebase-client-config.json"
  curl -fsS --max-time 20 \
    "${BASE_URL%/}/api/mac/firebase-client-config" \
    -o "${config_file}"

  node - "${config_file}" <<'NODE'
const fs = require("node:fs");
const body = JSON.parse(fs.readFileSync(process.argv[2], "utf8"));
const apiKey = String(body?.firebase?.apiKey || "").trim();
if (!apiKey || /[\r\n]/.test(apiKey)) {
  process.stderr.write("Firebase client configuration did not contain a usable API key.\n");
  process.exit(1);
}
process.stdout.write(apiKey);
NODE
}

cloud_sql_connection_name() {
  DATABASE_URL="$1" node <<'NODE'
const url = new URL(process.env.DATABASE_URL || "");
const socketHost = url.searchParams.get("host") || "";
if (!socketHost.startsWith("/cloudsql/")) process.exit(0);
const connectionName = socketHost.slice("/cloudsql/".length).trim();
if (!/^[a-z0-9][a-z0-9-]*:[a-z0-9-]+:[a-z0-9][a-z0-9-]*$/i.test(connectionName)) {
  process.stderr.write("DATABASE_URL contains an invalid Cloud SQL socket host.\n");
  process.exit(1);
}
process.stdout.write(connectionName);
NODE
}

start_cloud_sql_proxy() {
  local connection_name="$1"
  local proxy_binary
  proxy_binary="$(resolve_cloud_sql_proxy)" \
    || fail "cloud-sql-proxy is required because ${DATABASE_SECRET} uses a Cloud SQL socket URL."

  PROXY_PORT="$(
    python3 <<'PY'
import socket
with socket.socket() as listener:
    listener.bind(("127.0.0.1", 0))
    print(listener.getsockname()[1])
PY
  )"

  "${proxy_binary}" "${connection_name}" \
    --address 127.0.0.1 \
    --port "${PROXY_PORT}" \
    --quota-project "${PROJECT_ID}" \
    >"${WORK_DIR}/cloud-sql-proxy.log" 2>&1 &
  PROXY_PID=$!

  if ! python3 - "${PROXY_PORT}" "${PROXY_PID}" <<'PY'
import os
import socket
import sys
import time

port = int(sys.argv[1])
pid = int(sys.argv[2])
deadline = time.time() + 20
while time.time() < deadline:
    try:
        os.kill(pid, 0)
    except OSError:
        sys.exit(2)
    try:
        with socket.create_connection(("127.0.0.1", port), timeout=1):
            sys.exit(0)
    except OSError:
        time.sleep(0.25)
sys.exit(1)
PY
  then
    cat "${WORK_DIR}/cloud-sql-proxy.log" >&2 || true
    fail "Cloud SQL proxy did not become ready."
  fi
}

case "${MODE}" in
  -h|--help)
    usage
    exit 0
    ;;
  smoke|promote-preview)
    ;;
  *)
    usage >&2
    fail "Mode must be smoke or promote-preview."
    ;;
esac

require_command node
if [[ "${MODE}" == "smoke" ]]; then
  BASE_URL="$(validate_base_url "${BASE_URL}")" \
    || fail "Generated reviewer target is outside the trusted runtime boundary."
fi

for command_name in gcloud curl python3; do
  require_command "${command_name}"
done

cd "${ROOT_DIR}"

if [[ "${MODE}" == "promote-preview" ]]; then
  BASE_URL="$(resolve_preview_url)"
  BASE_URL="$(validate_base_url "${BASE_URL}")" \
    || fail "Generated reviewer target is outside the trusted runtime boundary."
  printf "Mode: immutable preview smoke and promotion.\n"
else
  printf "Mode: generated production reviewer smoke; traffic mutation is disabled.\n"
fi

database_url="$(
  gcloud secrets versions access "${DATABASE_SECRET_VERSION}" \
    --secret="${DATABASE_SECRET}" \
    --project="${PROJECT_ID}"
)" || fail "Could not read database secret ${DATABASE_SECRET}."
[[ -n "${database_url}" ]] || fail "Database secret ${DATABASE_SECRET} is empty."

firebase_api_key="$(read_firebase_api_key)" \
  || fail "Could not read the public Firebase client configuration from ${BASE_URL}."

connection_name="$(cloud_sql_connection_name "${database_url}")"
if [[ -n "${connection_name}" ]]; then
  start_cloud_sql_proxy "${connection_name}"
fi

printf "Running the generated reviewer against %s.\n" "${BASE_URL}"
printf "Secrets, generated credentials, Firebase tokens, cookies, and database URLs are never printed.\n"

export PROJECT_ID REGION SERVICE_NAME PREVIEW_TAG SOURCE_REF
export DATABASE_URL="${database_url}"
export NEXT_PUBLIC_FIREBASE_API_KEY="${firebase_api_key}"
export QUIPSLY_AUTH_SMOKE_FIREBASE_API_KEY="${firebase_api_key}"
export FIREBASE_PROJECT_ID
export PRISMA_PG_CONNECTION_TIMEOUT_MS="${DATABASE_TIMEOUT_MS}"
export QUIPSLY_SMOKE_CLOUD_SQL_PROXY_PORT="${PROXY_PORT}"
export QUIPSLY_ADMIN_SMOKE_BASE_URL="${BASE_URL}"
export QUIPSLY_AUTH_SMOKE_REQUIRE_SESSION_WORKSPACE=1
if [[ "${MODE}" == "promote-preview" ]]; then
  node scripts/quipsly-generated-admin-user-smoke.mjs --promote-preview
else
  node scripts/quipsly-generated-admin-user-smoke.mjs
fi

printf "PASS Generated reviewer %s completed with bounded cleanup.\n" "${MODE}"
