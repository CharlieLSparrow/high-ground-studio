#!/usr/bin/env bash
set -euo pipefail

TARGET_URL="${TARGET_URL:-http://127.0.0.1:3012}"
HOST_HEADER="${HOST_HEADER:-}"
STRICT_DB="${STRICT_DB:-0}"

TARGET_URL="${TARGET_URL%/}"
TMP_DIR="$(mktemp -d)"
trap 'rm -rf "${TMP_DIR}"' EXIT

curl_args=(-fsS --max-time 20)
status_curl_args=(-sS --max-time 20)
if [[ -n "${HOST_HEADER}" ]]; then
  curl_args+=(-H "Host: ${HOST_HEADER}")
  status_curl_args+=(-H "Host: ${HOST_HEADER}")
fi

safe_name() {
  printf "%s" "$1" | tr '/?&=%:' '_______'
}

check_contains() {
  local route="$1"
  local needle="$2"
  local out="${TMP_DIR}/$(safe_name "${route}").html"

  echo "Checking ${TARGET_URL}${route} contains: ${needle}"
  curl "${curl_args[@]}" "${TARGET_URL}${route}" -o "${out}"

  if ! grep -Fq "${needle}" "${out}"; then
    echo "Expected to find '${needle}' in ${route}, but it was not present." >&2
    exit 1
  fi
}

check_json_ok() {
  local route="$1"
  local out="${TMP_DIR}/$(safe_name "${route}").json"

  echo "Checking ${TARGET_URL}${route} returns ok:true"
  curl "${curl_args[@]}" "${TARGET_URL}${route}" -o "${out}"

  node -e '
    const fs = require("fs");
    const file = process.argv[1];
    const body = JSON.parse(fs.readFileSync(file, "utf8"));
    if (!body || body.ok !== true) {
      console.error("Expected ok:true JSON response, got:", body);
      process.exit(1);
    }
  ' "${out}"
}

check_status() {
  local route="$1"
  local expected_status="$2"
  local out="${TMP_DIR}/$(safe_name "${route}").txt"
  local actual_status

  echo "Checking ${TARGET_URL}${route} expects HTTP ${expected_status}"
  actual_status="$(curl "${status_curl_args[@]}" "${TARGET_URL}${route}" -o "${out}" -w "%{http_code}")"

  if [[ "${actual_status}" != "${expected_status}" ]]; then
    echo "Route ${route} returned HTTP ${actual_status}, expected ${expected_status}." >&2
    cat "${out}" >&2 || true
    exit 1
  fi
}

check_contains "/api/auth/signin?callbackUrl=%2Fprojects" "Sign in with email code"
check_contains "/api/auth/signin?callbackUrl=%2Fprojects&inviteToken=qinv_testtoken" "invite-token-form"
check_json_ok "/api/health"
check_json_ok "/api/healthz"
check_status "/api/mac/session-check" "401"

if [[ "${STRICT_DB}" == "1" ]]; then
  echo "Checking DB-backed email-code request path"
  status="$(curl "${status_curl_args[@]}" \
    -X POST \
    -H "Content-Type: application/json" \
    --data '{"email":"charlie@highgroundodyssey.com","callbackUrl":"/projects"}' \
    "${TARGET_URL}/api/auth/email-code/request" \
    -o "${TMP_DIR}/email-code.json" \
    -w "%{http_code}")"

  if [[ "${status}" != "200" ]]; then
    echo "Email-code request returned HTTP ${status}, expected 200." >&2
    cat "${TMP_DIR}/email-code.json" >&2 || true
    exit 1
  fi
fi

echo "Quipsly route smoke passed for ${TARGET_URL}"
