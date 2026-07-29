#!/usr/bin/env bash
set -euo pipefail

discover_target_url() {
  local candidate
  for candidate in \
    "http://127.0.0.1:3025" \
    "http://localhost:3025" \
    "http://127.0.0.1:3012" \
    "http://localhost:3012" \
    "http://127.0.0.1:3000" \
    "http://localhost:3000"
  do
    local health_status login_status projects_status
    health_status="$(curl -sS --max-time 3 -o /dev/null -w "%{http_code}" "${candidate}/api/health" 2>/dev/null || true)"
    login_status="$(curl -sS --max-time 3 -o /dev/null -w "%{http_code}" "${candidate}/login?callbackUrl=%2Fprojects" 2>/dev/null || true)"
    projects_status="$(curl -sS --max-time 3 -o /dev/null -w "%{http_code}" "${candidate}/projects" 2>/dev/null || true)"

    if [[ "${health_status}" == "200" && "${login_status}" == "200" && "${projects_status}" != "404" && "${projects_status}" != "000" ]]; then
      printf "%s" "${candidate}"
      return 0
    fi
  done

  # Keep the historical local default as a clear last resort so failure output
  # still points at the expected Quipsly dev service.
  printf "%s" "http://127.0.0.1:3012"
}

TARGET_URL="${TARGET_URL:-$(discover_target_url)}"
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

check_contains_any() {
  local route="$1"
  shift
  local out="${TMP_DIR}/$(safe_name "${route}").html"

  echo "Checking ${TARGET_URL}${route} contains one of: $*"
  curl "${curl_args[@]}" "${TARGET_URL}${route}" -o "${out}"

  local needle
  for needle in "$@"; do
    if grep -Fq "${needle}" "${out}"; then
      return 0
    fi
  done

  echo "Expected to find one of '$*' in ${route}, but none were present." >&2
  exit 1
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

check_firebase_admin_preflight_shape() {
  local route="/api/auth/firebase-admin-preflight"
  local out="${TMP_DIR}/$(safe_name "${route}").json"
  local actual_status

  echo "Checking ${TARGET_URL}${route} returns structured Firebase Admin preflight JSON"
  actual_status="$(curl "${status_curl_args[@]}" "${TARGET_URL}${route}" -o "${out}" -w "%{http_code}")"

  if [[ "${actual_status}" != "200" && "${actual_status}" != "503" ]]; then
    echo "Route ${route} returned HTTP ${actual_status}, expected 200 or 503." >&2
    cat "${out}" >&2 || true
    exit 1
  fi

  node -e '
    const fs = require("fs");
    const file = process.argv[1];
    const status = process.argv[2];
    const body = JSON.parse(fs.readFileSync(file, "utf8"));
    if (status === "200" && body.ok !== true) {
      console.error("Expected ok:true for 200 Firebase Admin preflight, got:", body);
      process.exit(1);
    }
    if (status === "503" && body.error !== "Firebase Admin credential unavailable") {
      console.error("Expected sanitized Firebase Admin credential error for 503, got:", body);
      process.exit(1);
    }
  ' "${out}" "${actual_status}"
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

check_redirect_location() {
  local route="$1"
  local expected_location="$2"
  local headers="${TMP_DIR}/$(safe_name "${route}").headers"
  local actual_location

  echo "Checking ${TARGET_URL}${route} redirects to: ${expected_location}"
  curl "${status_curl_args[@]}" -I "${TARGET_URL}${route}" -o "${headers}" >/dev/null
  actual_location="$(awk 'BEGIN{IGNORECASE=1} /^location:/ {sub(/^[Ll]ocation:[[:space:]]*/, ""); sub(/\r$/, ""); print; exit}' "${headers}")"

  if [[ "${actual_location}" != "${expected_location}" ]]; then
    echo "Route ${route} redirected to '${actual_location}', expected '${expected_location}'." >&2
    cat "${headers}" >&2 || true
    exit 1
  fi
}

check_contains "/login?callbackUrl=%2Fprojects" "Continue with Google"
check_contains "/login?callbackUrl=%2Fprojects" "Create account"
check_contains "/login?callbackUrl=%2Fprojects" "Forgot password?"
check_contains "/login?callbackUrl=%2Fprojects&inviteToken=qinv_testtoken" "Sign in with the email that received this invite"
check_contains "/login?callbackUrl=%2Fprojects&inviteToken=qinv_testtoken" "The link grants nothing until Firebase verifies that address"
check_contains "/login?callbackUrl=%2Fprojects&inviteToken=qinv_testtoken" "Sign in with the invited email"
check_contains "/projects" "Nests hold the work. Documents hold the text."
check_contains "/projects" "Create a Nest"
check_contains_any "/coaching" "Book, bill, record, transcribe, and follow up" "Quipsly Nest" "Sign in to Nest" "Your private creative workspace lives here"
check_contains_any "/coaching/sessions" "Prepare, capture, transcribe, and follow through" "Your coaching session" "Quipsly Nest" "Sign in to Nest" "Your private creative workspace lives here"
check_contains_any "/account/switch" "Quipsly Nest" "Sign in to Nest" "Your private creative workspace lives here"
check_contains_any "/admin/users" "Quipsly Nest" "Sign in to Nest" "Your private creative workspace lives here"
check_json_ok "/api/health"
check_json_ok "/api/healthz"
check_firebase_admin_preflight_shape
check_status "/api/auth/session" "401"
check_redirect_location "/api/auth/signin" "${TARGET_URL}/login?callbackUrl=%2Fprojects"
check_redirect_location "/api/auth/callback/google" "${TARGET_URL}/login?callbackUrl=%2Fprojects"

echo "Checking structured public auth boundary"
QUIPSLY_PUBLIC_AUTH_SMOKE_BASE_URL="${TARGET_URL}" node scripts/quipsly-public-auth-boundary-smoke.mjs

if [[ "${STRICT_DB}" == "1" ]]; then
  if [[ -z "${QUIPSLY_AUTH_SMOKE_EMAIL:-}" || -z "${QUIPSLY_AUTH_SMOKE_PASSWORD:-}" ]]; then
    echo "STRICT_DB=1 requires QUIPSLY_AUTH_SMOKE_EMAIL and QUIPSLY_AUTH_SMOKE_PASSWORD." >&2
    exit 1
  fi

  echo "Checking Firebase-backed Quipsly session path"
  QUIPSLY_AUTH_SMOKE_BASE_URL="${TARGET_URL}" node scripts/quipsly-firebase-auth-smoke.mjs
fi

echo "Quipsly route smoke passed for ${TARGET_URL}"
