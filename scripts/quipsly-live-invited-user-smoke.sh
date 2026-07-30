#!/usr/bin/env bash
set -euo pipefail
umask 077

PROJECT_ID="${PROJECT_ID:-high-ground-odyssey}"
DATABASE_SECRET="${QUIPSLY_INVITE_SMOKE_DATABASE_SECRET:-studio-database-url}"
AUTH_SECRET_NAME="${QUIPSLY_INVITE_SMOKE_AUTH_SECRET:-studio-auth-secret}"
CLOUD_SQL_INSTANCE="${QUIPSLY_CLOUD_SQL_INSTANCE:-high-ground-odyssey:us-central1:studio-postgres}"
PROXY_PORT="${QUIPSLY_SMOKE_CLOUD_SQL_PROXY_PORT:-15444}"
BASE_URL="${QUIPSLY_AUTH_SMOKE_BASE_URL:-https://nest.quipsly.com}"
PROJECT_SLUG="${QUIPSLY_INVITE_SMOKE_PROJECT_SLUG:-marine-biology-research}"
WORK_DIR="$(mktemp -d "${TMPDIR:-/private/tmp}/quipsly-invited-user-smoke.XXXXXX")"
FIREBASE_CONFIG_FILE="${WORK_DIR}/firebase-client-config.json"
AUTH_SECRET_FILE="${WORK_DIR}/auth-secret"
PROXY_LOG="${WORK_DIR}/cloud-sql-proxy.log"
PROXY_PID=""

cleanup_smoke() {
  if [[ -n "${PROXY_PID}" ]]; then
    kill "${PROXY_PID}" >/dev/null 2>&1 || true
    wait "${PROXY_PID}" >/dev/null 2>&1 || true
    PROXY_PID=""
  fi

  case "${WORK_DIR}" in
    "${TMPDIR:-/private/tmp}"/quipsly-invited-user-smoke.*)
      rm -rf -- "${WORK_DIR}"
      ;;
    *)
      echo "Refusing to remove unexpected smoke work directory: ${WORK_DIR}" >&2
      ;;
  esac
}
trap cleanup_smoke EXIT

BASE_URL="$(
  node - "${BASE_URL}" <<'NODE'
const raw = process.argv[2];
const url = new URL(raw);
const host = url.hostname.toLowerCase();
const loopback = host === "localhost" || host === "127.0.0.1";
const quipsly = host === "quipsly.com" || host.endsWith(".quipsly.com");
const secure = url.protocol === "https:" || (loopback && url.protocol === "http:");
if (
  !secure
  || (!loopback && !quipsly)
  || url.username
  || url.password
  || url.pathname !== "/"
  || url.search
  || url.hash
  || (!loopback && url.port)
) {
  process.stderr.write(
    "Invite smoke target must be a clean HTTPS Quipsly origin or HTTP loopback.\n",
  );
  process.exit(1);
}
process.stdout.write(url.origin);
NODE
)"

echo "Running Quipsly live invited-user smoke against ${BASE_URL}"
echo "Target Nest: ${PROJECT_SLUG}"
echo "Secrets are read into process environment only; database URLs, passwords, tokens, and cookies are not printed."

curl -fsS --max-time 20 \
  "${BASE_URL%/}/api/mac/firebase-client-config" \
  -o "${FIREBASE_CONFIG_FILE}"
FIREBASE_API_KEY="$(
  node - "${FIREBASE_CONFIG_FILE}" <<'NODE'
const fs = require("node:fs");
const config = JSON.parse(fs.readFileSync(process.argv[2], "utf8"));
const apiKey = String(config?.firebase?.apiKey || "").trim();
if (!apiKey || /[\r\n]/.test(apiKey)) {
  process.stderr.write(
    "Firebase client configuration did not contain a usable API key.\n",
  );
  process.exit(1);
}
process.stdout.write(apiKey);
NODE
)"
DB_URL="$(gcloud secrets versions access latest --secret="${DATABASE_SECRET}" --project="${PROJECT_ID}")"
gcloud secrets versions access latest --secret="${AUTH_SECRET_NAME}" --project="${PROJECT_ID}" >"${AUTH_SECRET_FILE}"

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
    >"${PROXY_LOG}" 2>&1 &
  PROXY_PID=$!
  for attempt_no in 1 2 3 4 5 6 7 8 9 10; do
    if nc -z 127.0.0.1 "${PROXY_PORT}" >/dev/null 2>&1; then
      break
    fi
    if ! kill -0 "${PROXY_PID}" >/dev/null 2>&1; then
      sed -n '1,160p' "${PROXY_LOG}" >&2
      echo "Cloud SQL proxy exited before becoming ready." >&2
      exit 2
    fi
    sleep 0.5
  done
  if ! nc -z 127.0.0.1 "${PROXY_PORT}" >/dev/null 2>&1; then
    sed -n '1,160p' "${PROXY_LOG}" >&2
    echo "Cloud SQL proxy did not become ready." >&2
    exit 2
  fi

  DATABASE_URL="${DB_URL}" \
    AUTH_SECRET="" \
    NEXTAUTH_SECRET="" \
    AUTH_SECRET_FILE="${AUTH_SECRET_FILE}" \
    NEXT_PUBLIC_FIREBASE_API_KEY="${FIREBASE_API_KEY}" \
    QUIPSLY_AUTH_SMOKE_FIREBASE_API_KEY="${FIREBASE_API_KEY}" \
    QUIPSLY_SMOKE_CLOUD_SQL_PROXY_PORT="${PROXY_PORT}" \
    QUIPSLY_AUTH_SMOKE_BASE_URL="${BASE_URL}" \
    QUIPSLY_INVITE_SMOKE_PROJECT_SLUG="${PROJECT_SLUG}" \
    node scripts/quipsly-generated-invited-user-smoke.mjs
else
  DATABASE_URL="${DB_URL}" \
    AUTH_SECRET="" \
    NEXTAUTH_SECRET="" \
    AUTH_SECRET_FILE="${AUTH_SECRET_FILE}" \
    NEXT_PUBLIC_FIREBASE_API_KEY="${FIREBASE_API_KEY}" \
    QUIPSLY_AUTH_SMOKE_FIREBASE_API_KEY="${FIREBASE_API_KEY}" \
    QUIPSLY_AUTH_SMOKE_BASE_URL="${BASE_URL}" \
    QUIPSLY_INVITE_SMOKE_PROJECT_SLUG="${PROJECT_SLUG}" \
    node scripts/quipsly-generated-invited-user-smoke.mjs
fi
