#!/usr/bin/env bash
set -euo pipefail

TARGET_URL="${1:-${PREVIEW_URL:-}}"
HOST_HEADER="${HOST_HEADER:-}"
RECEIPT_HEADER="x-quipsly-release-smoke-receipt"
EXPECTED_PUBLIC_HOSTS="${QUIPSLY_RELEASE_EXPECTED_HOSTS:-nest.quipsly.com,quipsly.com}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"

if [[ -z "${TARGET_URL}" ]]; then
  cat >&2 <<'USAGE'
Usage:
  PREVIEW_URL=https://preview-url.example.com scripts/release/quipsly-smoke-preview.sh
  scripts/release/quipsly-smoke-preview.sh https://preview-url.example.com

Optional:
  HOST_HEADER=nest.quipsly.com
  QUIPSLY_RELEASE_EXPECTED_HOSTS=nest.quipsly.com,quipsly.com

Required for the final promotion gate:
  QUIPSLY_RELEASE_SMOKE_SECRET=<same secret mounted in the Quipsly runtime>
  QUIPSLY_AUTH_SMOKE_EMAIL=<verified reviewer account>
  QUIPSLY_AUTH_SMOKE_PASSWORD=<reviewer password, supplied only through env>

This script performs HTTP smoke checks against a Quipsly preview and every
configured public host. It also proves the signed-out boundary and a real
signed-in Nest/writing/editor/recorder/research/publishing journey, including
one idempotent release-smoke production record in the reviewer account. It
signs a short-lived, revision-bound receipt only after all checks pass, then
presents that receipt to /api/beta-readiness. It does not mutate customer data
or print the password, signing secret, Firebase API key, session cookie, or
receipt.
USAGE
  exit 2
fi

if [[ -z "${QUIPSLY_RELEASE_SMOKE_SECRET:-}" ]]; then
  echo "QUIPSLY_RELEASE_SMOKE_SECRET is required for the final readiness gate." >&2
  exit 2
fi
if [[ -z "${QUIPSLY_AUTH_SMOKE_EMAIL:-}" || -z "${QUIPSLY_AUTH_SMOKE_PASSWORD:-}" ]]; then
  echo "QUIPSLY_AUTH_SMOKE_EMAIL and QUIPSLY_AUTH_SMOKE_PASSWORD are required for the signed-in readiness gate." >&2
  exit 2
fi

if [[ "${TARGET_URL}" != https://* ]]; then
  echo "Release preview smoke requires an https:// target URL." >&2
  exit 2
fi
if [[ -n "${HOST_HEADER}" && ! "${HOST_HEADER}" =~ ^[A-Za-z0-9.-]+$ ]]; then
  echo "HOST_HEADER must be a plain hostname." >&2
  exit 2
fi

TARGET_URL="${TARGET_URL%/}"
TMP_DIR="$(mktemp -d)"
trap 'rm -rf "${TMP_DIR}"' EXIT

if [[ "${TARGET_URL}" == https://*.run.app && -n "${HOST_HEADER}" ]]; then
  echo "Ignoring HOST_HEADER for Cloud Run tagged URL smoke: ${TARGET_URL}" >&2
  HOST_HEADER=""
fi

curl_args=(-fsS --max-time 20)
status_curl_args=(-sS --max-time 20)
passed_route_ids=()
if [[ -n "${HOST_HEADER}" ]]; then
  curl_args+=(-H "Host: ${HOST_HEADER}")
  status_curl_args+=(-H "Host: ${HOST_HEADER}")
fi

check_json_endpoint() {
  local path="$1"
  local route_id="$2"
  local out="${TMP_DIR}/$(echo "${path}" | tr '/?' '__').json"

  echo "Checking ${TARGET_URL}${path}"
  curl "${curl_args[@]}" "${TARGET_URL}${path}" -o "${out}"

  node -e '
    const fs = require("fs");
    const file = process.argv[1];
    const body = JSON.parse(fs.readFileSync(file, "utf8"));
    if (!body || body.ok !== true) {
      console.error("Health endpoint did not return ok:true", body);
      process.exit(1);
    }
  ' "${out}"
  passed_route_ids+=("${route_id}")
}

check_html_route() {
  local path="$1"
  local route_id="$2"
  local required_marker="$3"
  local out="${TMP_DIR}/$(echo "${path}" | tr '/?' '__').html"

  echo "Checking ${TARGET_URL}${path}"
  curl "${curl_args[@]}" "${TARGET_URL}${path}" -o "${out}"

  if ! grep -Fqi -- "${required_marker}" "${out}"; then
    echo "Route ${path} did not render its required surface marker." >&2
    exit 1
  fi
  passed_route_ids+=("${route_id}")
}

check_signed_out_boundary() {
  local path="$1"
  local route_id="$2"
  check_html_route "${path}" "${route_id}" "Your private creative workspace lives here."
}

check_status_endpoint() {
  local path="$1"
  local expected_status="$2"
  local route_id="$3"
  local out="${TMP_DIR}/$(echo "${path}" | tr '/?' '__').txt"
  local status

  echo "Checking ${TARGET_URL}${path} expects HTTP ${expected_status}"
  status="$(curl "${status_curl_args[@]}" "${TARGET_URL}${path}" -o "${out}" -w "%{http_code}")"

  if [[ "${status}" != "${expected_status}" ]]; then
    echo "Route ${path} returned HTTP ${status}, expected ${expected_status}." >&2
    cat "${out}" >&2 || true
    exit 1
  fi
  passed_route_ids+=("${route_id}")
}

check_public_host() {
  local host="$1"
  local out="${TMP_DIR}/public-host-${host}.json"

  echo "Checking configured public host https://${host}/api/healthz"
  curl -fsS --max-time 20 "https://${host}/api/healthz" -o "${out}"
  node -e '
    const fs = require("fs");
    const body = JSON.parse(fs.readFileSync(process.argv[1], "utf8"));
    if (!body || body.ok !== true) {
      console.error("Configured public host health did not return ok:true");
      process.exit(1);
    }
  ' "${out}"
  passed_route_ids+=("public-host:${host}")
}

check_json_endpoint "/api/health" "health.compatibility"
check_json_endpoint "/api/healthz" "health.release"
check_json_endpoint "/api/production-core/readiness" "schema.production-core"
check_status_endpoint "/api/mac/session-check" "401" "auth.session-boundary"
check_json_endpoint "/api/mac/firebase-client-config" "auth.firebase-client-config"
check_json_endpoint "/api/output-catalog" "outputs.catalog"
check_json_endpoint "/api/output-catalog/hgo-episode-page" "outputs.episode-definition"
check_json_endpoint "/api/output-catalog/nest-kind/writing" "outputs.writing-definition"
check_json_endpoint "/api/quipsly-art/briefs" "art.briefs"
check_json_endpoint "/api/quipsly-art/library" "art.library"
check_signed_out_boundary "/projects" "auth-boundary.projects"
check_signed_out_boundary "/nests" "auth-boundary.nests"
check_html_route "/outputs" "outputs.page" "One source. Many native outputs."
check_html_route "/outputs/hgo-episode-page" "outputs.episode-page" "High Ground Odyssey episode page"
check_html_route "/art-foundry" "art.foundry" "Quipsly Art Foundry"
check_html_route "/beta-readiness" "beta.dashboard" "Is Quipsly beta-shaped yet?"
check_signed_out_boundary "/create?project=quipsly-dev-lab" "auth-boundary.writing"
check_signed_out_boundary "/editor?project=quipsly-dev-lab&episode=smoke" "auth-boundary.editor"
check_signed_out_boundary "/recorder?project=quipsly-dev-lab&episode=smoke" "auth-boundary.recorder"
check_signed_out_boundary "/research" "auth-boundary.research"
check_signed_out_boundary "/publishing" "auth-boundary.publishing"

echo "Checking the authenticated Nest and production-workspace journey"
firebase_config_file="${TMP_DIR}/_api_mac_firebase-client-config.json"
candidate_firebase_api_key="$(
  node -e '
    const fs = require("fs");
    const body = JSON.parse(fs.readFileSync(process.argv[1], "utf8"));
    const apiKey = String(body?.firebase?.apiKey || "").trim();
    if (!apiKey || /[\r\n]/.test(apiKey)) process.exit(1);
    process.stdout.write(apiKey);
  ' "${firebase_config_file}"
)" || {
  echo "Preview Firebase client config did not expose a usable public API key." >&2
  exit 1
}
QUIPSLY_AUTH_SMOKE_BASE_URL="${TARGET_URL}" \
  QUIPSLY_AUTH_SMOKE_FIREBASE_API_KEY="${QUIPSLY_AUTH_SMOKE_FIREBASE_API_KEY:-${candidate_firebase_api_key}}" \
  QUIPSLY_AUTH_SMOKE_EXPECT_ADMIN="${QUIPSLY_RELEASE_SMOKE_EXPECT_ADMIN:-0}" \
  QUIPSLY_AUTH_SMOKE_REQUIRE_SESSION_WORKSPACE=1 \
  node "${REPO_ROOT}/scripts/quipsly-firebase-auth-smoke.mjs"
unset candidate_firebase_api_key
passed_route_ids+=(
  "auth.signed-in-journey"
  "nest.projects"
  "nest.index"
  "writing.create"
  "editor.timeline"
  "recording.capture"
  "sessions.workspace"
  "research.library"
  "publishing.runway"
)

release_health_file="${TMP_DIR}/_api_healthz.json"
runtime_metadata="$(node -e '
  const fs = require("fs");
  const body = JSON.parse(fs.readFileSync(process.argv[1], "utf8"));
  const revision = String(body?.runtime?.revisionName || "").trim();
  const hosts = [body?.hosts?.app, body?.hosts?.marketing]
    .map((value) => String(value || "").trim().toLowerCase())
    .filter(Boolean);
  const uniqueHosts = [...new Set(hosts)].sort();
  if (!revision || uniqueHosts.length === 0) process.exit(1);
  process.stdout.write(`${revision}\t${uniqueHosts.join(",")}`);
' "${release_health_file}")" || {
  echo "Preview health did not expose a revision and configured public host set." >&2
  exit 1
}

IFS=$'\t' read -r serving_revision configured_hosts_csv <<< "${runtime_metadata}"
IFS=',' read -r -a configured_hosts <<< "${configured_hosts_csv}"
if [[ -z "${serving_revision}" || "${#configured_hosts[@]}" -eq 0 ]]; then
  echo "Preview health returned incomplete receipt-binding metadata." >&2
  exit 1
fi

expected_hosts_csv="$(node -e '
  const hosts = String(process.argv[1] || "")
    .split(",")
    .map((host) => host.trim().toLowerCase())
    .filter(Boolean);
  const valid = (host) => host.length <= 253
    && !host.includes("..")
    && host.split(".").every((label) => label.length <= 63 && /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(label));
  const uniqueHosts = [...new Set(hosts)].sort();
  if (uniqueHosts.length === 0 || uniqueHosts.length > 8 || !uniqueHosts.every(valid)) process.exit(1);
  process.stdout.write(uniqueHosts.join(","));
' "${EXPECTED_PUBLIC_HOSTS}")" || {
  echo "QUIPSLY_RELEASE_EXPECTED_HOSTS is invalid." >&2
  exit 2
}
if [[ "${configured_hosts_csv}" != "${expected_hosts_csv}" ]]; then
  echo "Preview configured hosts do not exactly match QUIPSLY_RELEASE_EXPECTED_HOSTS." >&2
  exit 1
fi

for configured_host in "${configured_hosts[@]}"; do
  check_public_host "${configured_host}"
done

receipt_args=(--revision "${serving_revision}")
for configured_host in "${configured_hosts[@]}"; do
  receipt_args+=(--host "${configured_host}")
done
for route_id in "${passed_route_ids[@]}"; do
  receipt_args+=(--route "${route_id}")
done

# Write the receipt to the private temp directory without printing it. The
# generator reads the secret only from its environment; neither secret nor
# token is passed on the command line.
receipt_token_file="${TMP_DIR}/release-smoke-receipt.token"
node --experimental-strip-types \
  "${REPO_ROOT}/scripts/release/quipsly-create-smoke-receipt.mjs" \
  "${receipt_args[@]}" \
  --out "${receipt_token_file}"
receipt_token="$(<"${receipt_token_file}")"
rm -f "${receipt_token_file}"
if [[ -z "${receipt_token}" ]]; then
  echo "Release-smoke receipt generation returned an empty token." >&2
  exit 1
fi

receipt_curl_config="${TMP_DIR}/receipt-curl.config"
umask 077
printf 'header = "%s: %s"\n' "${RECEIPT_HEADER}" "${receipt_token}" > "${receipt_curl_config}"
readiness_out="${TMP_DIR}/beta-readiness-final.json"
readiness_status="$(curl "${status_curl_args[@]}" \
  --config "${receipt_curl_config}" \
  "${TARGET_URL}/api/beta-readiness" \
  -o "${readiness_out}" \
  -w "%{http_code}")"
rm -f "${receipt_curl_config}"
unset receipt_token

if [[ "${readiness_status}" != "200" ]]; then
  echo "Final signed beta-readiness gate returned HTTP ${readiness_status}, expected 200." >&2
  cat "${readiness_out}" >&2 || true
  exit 1
fi

node -e '
  const fs = require("fs");
  const body = JSON.parse(fs.readFileSync(process.argv[1], "utf8"));
  if (
    body?.ok !== true
    || body?.ready !== true
    || body?.verificationScope !== "quipsly-preview-promotion-v1"
    || body?.readinessStatus !== "runtime-verified"
    || body?.evidence?.runtimeVerification?.accepted !== true
    || body?.evidence?.runtimeVerification?.receiptCode !== "RELEASE_SMOKE_RECEIPT_VALID"
    || body?.evidence?.claims?.signedInEndToEndJourneyExercised !== true
    || body?.evidence?.claims?.liveProviderCompletionExercised !== false
  ) {
    console.error("Final signed beta-readiness response did not satisfy every promotion gate.");
    process.exit(1);
  }
' "${readiness_out}"

echo "Quipsly preview, configured-host, and signed readiness checks passed for ${TARGET_URL}"
