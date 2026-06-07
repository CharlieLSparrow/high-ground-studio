#!/usr/bin/env bash
set -euo pipefail

TARGET_URL="${1:-${PREVIEW_URL:-}}"
HOST_HEADER="${HOST_HEADER:-}"

if [[ -z "${TARGET_URL}" ]]; then
  cat >&2 <<'USAGE'
Usage:
  PREVIEW_URL=https://preview-url.example.com scripts/release/quipsly-smoke-preview.sh
  scripts/release/quipsly-smoke-preview.sh https://preview-url.example.com

Optional:
  HOST_HEADER=nest.quipsly.com

This script performs non-destructive HTTP smoke checks against a Quipsly preview
or live service. It does not mutate database state.
USAGE
  exit 2
fi

TARGET_URL="${TARGET_URL%/}"
TMP_DIR="$(mktemp -d)"
trap 'rm -rf "${TMP_DIR}"' EXIT

curl_args=(-fsS --max-time 20)
if [[ -n "${HOST_HEADER}" ]]; then
  curl_args+=(-H "Host: ${HOST_HEADER}")
fi

check_json_endpoint() {
  local path="$1"
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
}

check_html_route() {
  local path="$1"
  local out="${TMP_DIR}/$(echo "${path}" | tr '/?' '__').html"

  echo "Checking ${TARGET_URL}${path}"
  curl "${curl_args[@]}" "${TARGET_URL}${path}" -o "${out}"

  if ! grep -qi "Quipsly" "${out}"; then
    echo "Route ${path} did not appear to render the Quipsly app shell." >&2
    exit 1
  fi
}

check_json_endpoint "/api/health"
check_json_endpoint "/api/healthz"
check_json_endpoint "/api/beta-readiness"
check_json_endpoint "/api/output-catalog"
check_json_endpoint "/api/output-catalog/hgo-episode-page"
check_json_endpoint "/api/output-catalog/nest-kind/writing"
check_json_endpoint "/api/quipsly-art/briefs"
check_json_endpoint "/api/quipsly-art/library"
check_html_route "/projects"
check_html_route "/nests"
check_html_route "/outputs"
check_html_route "/outputs/hgo-episode-page"
check_html_route "/art-foundry"
check_html_route "/beta-readiness"
check_html_route "/create?project=quipsly-dev-lab"

echo "Quipsly preview smoke checks passed for ${TARGET_URL}"
