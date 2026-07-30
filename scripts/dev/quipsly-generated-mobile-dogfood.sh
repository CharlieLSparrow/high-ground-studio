#!/usr/bin/env bash
set -euo pipefail
umask 077

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
repo_root="$(cd "${script_dir}/../.." && pwd)"
mode="${1:-task-edit}"

project_id="${PROJECT_ID:-high-ground-odyssey}"
database_secret="${QUIPSLY_GENERATED_MOBILE_DATABASE_SECRET:-studio-database-url}"
firebase_config_origin="${QUIPSLY_GENERATED_MOBILE_FIREBASE_CONFIG_ORIGIN:-https://nest.quipsly.com}"
firebase_project_id="${FIREBASE_PROJECT_ID:-quipsly-reef}"
work_dir="$(mktemp -d "${TMPDIR:-/private/tmp}/quipsly-generated-mobile-dogfood.XXXXXX")"
proxy_pid=""
nest_pid=""

usage() {
  cat <<'USAGE'
Usage:
  scripts/dev/quipsly-generated-mobile-dogfood.sh task-edit
  scripts/dev/quipsly-generated-mobile-dogfood.sh goal-edit

Runs the current local Nest source with a disposable real Firebase identity and
canonical database records, then drives the compiled iPhone app in Simulator.
The generated-user harness owns cleanup and verifies no test identity or work
records remain. Secrets are held only in process environment or a mode-0700
temporary directory and are never printed.
USAGE
}

fail() {
  printf "FAIL %s\n" "$1" >&2
  exit 1
}

cleanup() {
  if [[ -n "${nest_pid}" ]]; then
    kill "${nest_pid}" >/dev/null 2>&1 || true
    wait "${nest_pid}" >/dev/null 2>&1 || true
    nest_pid=""
  fi
  if [[ -n "${proxy_pid}" ]]; then
    kill "${proxy_pid}" >/dev/null 2>&1 || true
    wait "${proxy_pid}" >/dev/null 2>&1 || true
    proxy_pid=""
  fi
  case "${work_dir}" in
    "${TMPDIR:-/private/tmp}"/quipsly-generated-mobile-dogfood.*)
      rm -rf -- "${work_dir}"
      ;;
    *)
      printf "WARN Refusing to remove unexpected dogfood work directory: %s\n" "${work_dir}" >&2
      ;;
  esac
}
trap cleanup EXIT

if [[ "${mode}" == "--help" || "${mode}" == "-h" ]]; then
  usage
  exit 0
fi
if [[ "${mode}" != "task-edit" && "${mode}" != "goal-edit" ]]; then
  usage >&2
  fail "Unsupported generated mobile dogfood mode: ${mode}"
fi

for command in gcloud curl node python3 cloud-sql-proxy; do
  command -v "${command}" >/dev/null 2>&1 || fail "Required command is unavailable: ${command}"
done
[[ -x "/Applications/Xcode.app/Contents/Developer/usr/bin/xcodebuild" ]] \
  || fail "Full Xcode is required for the operated iPhone Simulator journey."
[[ -f "${repo_root}/apps/quipsly/node_modules/next/dist/bin/next" ]] \
  || fail "Install the Quipsly workspace dependencies before running generated mobile dogfood."

free_port() {
  python3 <<'PY'
import socket
with socket.socket() as listener:
    listener.bind(("127.0.0.1", 0))
    print(listener.getsockname()[1])
PY
}

database_url="$(gcloud secrets versions access latest \
  --secret="${database_secret}" \
  --project="${project_id}")"
[[ -n "${database_url}" ]] || fail "The configured database secret was empty."

firebase_config_file="${work_dir}/firebase-client-config.json"
curl -fsS --max-time 20 \
  "${firebase_config_origin%/}/api/mac/firebase-client-config" \
  -o "${firebase_config_file}"

firebase_value() {
  node - "${firebase_config_file}" "$1" <<'NODE'
const fs = require("node:fs");
const body = JSON.parse(fs.readFileSync(process.argv[2], "utf8"));
const key = process.argv[3];
const value = String(body?.firebase?.[key] || "").trim();
if (!value || /[\r\n]/.test(value)) process.exit(1);
process.stdout.write(value);
NODE
}

firebase_api_key="$(firebase_value apiKey)" \
  || fail "Firebase client configuration is missing apiKey."
firebase_auth_domain="$(firebase_value authDomain)" \
  || fail "Firebase client configuration is missing authDomain."
firebase_storage_bucket="$(firebase_value storageBucket)" \
  || fail "Firebase client configuration is missing storageBucket."
firebase_messaging_sender_id="$(firebase_value messagingSenderId)" \
  || fail "Firebase client configuration is missing messagingSenderId."
firebase_app_id="$(firebase_value appId)" \
  || fail "Firebase client configuration is missing appId."

connection_name="$(
  DATABASE_URL="${database_url}" node <<'NODE'
const url = new URL(process.env.DATABASE_URL);
const socketHost = url.searchParams.get("host") || "";
if (!socketHost.startsWith("/cloudsql/")) process.exit(0);
const name = socketHost.slice("/cloudsql/".length);
if (!/^[a-z0-9][a-z0-9-]*:[a-z0-9-]+:[a-z0-9][a-z0-9-]*$/i.test(name)) {
  process.stderr.write("Invalid Cloud SQL connection name.\n");
  process.exit(1);
}
process.stdout.write(name);
NODE
)"

runtime_database_url="${database_url}"
if [[ -n "${connection_name}" ]]; then
  proxy_port="$(free_port)"
  cloud-sql-proxy "${connection_name}" \
    --address 127.0.0.1 \
    --port "${proxy_port}" \
    --quota-project "${project_id}" \
    >"${work_dir}/cloud-sql-proxy.log" 2>&1 &
  proxy_pid=$!

  if ! python3 - "${proxy_port}" "${proxy_pid}" <<'PY'
import os
import socket
import sys
import time
port = int(sys.argv[1])
pid = int(sys.argv[2])
for _ in range(100):
    try:
        os.kill(pid, 0)
    except OSError:
        sys.exit(1)
    try:
        with socket.create_connection(("127.0.0.1", port), timeout=0.2):
            sys.exit(0)
    except OSError:
        time.sleep(0.1)
sys.exit(1)
PY
  then
    tail -40 "${work_dir}/cloud-sql-proxy.log" >&2 || true
    fail "Cloud SQL proxy did not become ready."
  fi

  runtime_database_url="$(
    DATABASE_URL="${database_url}" PROXY_PORT="${proxy_port}" node <<'NODE'
const url = new URL(process.env.DATABASE_URL);
url.hostname = "127.0.0.1";
url.port = process.env.PROXY_PORT;
url.searchParams.delete("host");
process.stdout.write(url.toString());
NODE
  )"
fi

nest_port="$(free_port)"
nest_origin="http://127.0.0.1:${nest_port}"
auth_secret="$(node -e 'process.stdout.write(require("node:crypto").randomBytes(48).toString("base64url"))')"

(
  cd "${repo_root}/apps/quipsly"
  exec /usr/bin/env \
    PORT="${nest_port}" \
    DATABASE_URL="${runtime_database_url}" \
    AUTH_SECRET="${auth_secret}" \
    NEXT_PUBLIC_FIREBASE_API_KEY="${firebase_api_key}" \
    NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN="${firebase_auth_domain}" \
    NEXT_PUBLIC_FIREBASE_PROJECT_ID="${firebase_project_id}" \
    NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET="${firebase_storage_bucket}" \
    NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID="${firebase_messaging_sender_id}" \
    NEXT_PUBLIC_FIREBASE_APP_ID="${firebase_app_id}" \
    FIREBASE_PROJECT_ID="${firebase_project_id}" \
    GCLOUD_PROJECT="${firebase_project_id}" \
    GOOGLE_CLOUD_PROJECT="${firebase_project_id}" \
    QUIPSLY_OWNER_OVERRIDE=false \
    QUIPSLY_LOCAL_MEDIA_UPLOADS=true \
    node node_modules/next/dist/bin/next dev \
      --hostname 127.0.0.1 \
      --port "${nest_port}"
) >"${work_dir}/nest.log" 2>&1 &
nest_pid=$!

ready=0
for _ in $(seq 1 120); do
  status="$(curl -sS --max-time 2 -o /dev/null -w '%{http_code}' "${nest_origin}/api/health" 2>/dev/null || true)"
  if [[ "${status}" == "200" ]]; then
    ready=1
    break
  fi
  if ! kill -0 "${nest_pid}" >/dev/null 2>&1; then
    break
  fi
  sleep 1
done
if [[ "${ready}" != "1" ]]; then
  tail -80 "${work_dir}/nest.log" >&2 || true
  fail "Local Nest did not become healthy."
fi

printf "PASS Local Nest current-source health: %s\n" "${nest_origin}"
printf "PASS Disposable Firebase/database lane is ready; beginning operated iPhone %s journey.\n" "${mode}"

(
  cd "${repo_root}"
  DATABASE_URL="${runtime_database_url}" \
  NEXT_PUBLIC_FIREBASE_API_KEY="${firebase_api_key}" \
  NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN="${firebase_auth_domain}" \
  NEXT_PUBLIC_FIREBASE_PROJECT_ID="${firebase_project_id}" \
  NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET="${firebase_storage_bucket}" \
  NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID="${firebase_messaging_sender_id}" \
  NEXT_PUBLIC_FIREBASE_APP_ID="${firebase_app_id}" \
  FIREBASE_PROJECT_ID="${firebase_project_id}" \
  GCLOUD_PROJECT="${firebase_project_id}" \
  GOOGLE_CLOUD_PROJECT="${firebase_project_id}" \
  DEVELOPER_DIR="/Applications/Xcode.app/Contents/Developer" \
  node scripts/quipsly-mobile-capture-generated-auth-smoke.mjs \
    --base-url="${nest_origin}" \
    --workflow="${mode}" \
    --run-runtime-ui-smoke=1 \
    --runtime-ui-mode="${mode}"
)

printf "PASS Operated iPhone %s completed against current local Nest source.\n" "${mode}"
