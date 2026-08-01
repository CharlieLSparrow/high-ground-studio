#!/usr/bin/env bash
set -euo pipefail
umask 077

PROJECT_ID="${PROJECT_ID:-high-ground-odyssey}"
DATABASE_SECRET="${QUIPSLY_CALENDAR_SMOKE_DATABASE_SECRET:-studio-database-url}"
CLOUD_SQL_INSTANCE="${QUIPSLY_CLOUD_SQL_INSTANCE:-high-ground-odyssey:us-central1:studio-postgres}"
BASE_URL="${QUIPSLY_COACHING_CALENDAR_BASE_URL:-https://nest.quipsly.com}"
PROXY_PID=""

cleanup() {
  if [[ -n "${PROXY_PID}" ]]; then
    kill "${PROXY_PID}" >/dev/null 2>&1 || true
    wait "${PROXY_PID}" >/dev/null 2>&1 || true
  fi
}
trap cleanup EXIT

database_url="$(
  gcloud secrets versions access latest \
    --secret="${DATABASE_SECRET}" \
    --project="${PROJECT_ID}"
)"

if printf '%s' "${database_url}" | rg -q '/cloudsql/'; then
  proxy_binary="${QUIPSLY_CLOUD_SQL_PROXY_BIN:-$(command -v cloud-sql-proxy || true)}"
  [[ -x "${proxy_binary}" ]] || {
    echo "cloud-sql-proxy is required because the database secret uses a Cloud SQL socket URL." >&2
    exit 2
  }
  proxy_port="$(python3 - <<'PY'
import socket
with socket.socket() as listener:
    listener.bind(("127.0.0.1", 0))
    print(listener.getsockname()[1])
PY
)"
  "${proxy_binary}" "${CLOUD_SQL_INSTANCE}" \
    --address 127.0.0.1 \
    --port "${proxy_port}" \
    --quota-project "${PROJECT_ID}" \
    >/tmp/quipsly-calendar-generated-auth-proxy.log 2>&1 &
  PROXY_PID=$!

  python3 - "${proxy_port}" "${PROXY_PID}" <<'PY'
import os
import socket
import sys
import time
port = int(sys.argv[1])
pid = int(sys.argv[2])
deadline = time.time() + 20
while time.time() < deadline:
    os.kill(pid, 0)
    try:
        with socket.create_connection(("127.0.0.1", port), timeout=1):
            raise SystemExit(0)
    except OSError:
        time.sleep(0.25)
raise SystemExit(1)
PY

  database_url="$(DATABASE_URL="${database_url}" PROXY_PORT="${proxy_port}" node - <<'NODE'
const url = new URL(process.env.DATABASE_URL);
url.hostname = "127.0.0.1";
url.port = process.env.PROXY_PORT;
url.searchParams.delete("host");
process.stdout.write(url.toString());
NODE
)"
fi

echo "Running read-only Google Calendar access verification against ${BASE_URL}."
echo "Credentials, database URL, tokens, cookies, and generated password are never printed."
DATABASE_URL="${database_url}" \
  QUIPSLY_COACHING_CALENDAR_BASE_URL="${BASE_URL}" \
  node scripts/quipsly-coaching-calendar-generated-auth-smoke.mjs --json
