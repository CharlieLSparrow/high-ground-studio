#!/usr/bin/env bash
set -euo pipefail

PROJECT_ID="${PROJECT_ID:-high-ground-odyssey}"
REGION="${REGION:-us-central1}"
SERVICE_NAME="${SERVICE_NAME:-studio}"
CLOUD_SQL_INSTANCE="${CLOUD_SQL_INSTANCE:-studio-postgres}"
PRODUCTION_DOMAIN="${PRODUCTION_DOMAIN:-nest.quipsly.com}"
PRODUCTION_BASE_URL="${PRODUCTION_BASE_URL:-https://${PRODUCTION_DOMAIN}}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"

failures=0

pass() {
  printf "PASS %s\n" "$1"
}

warn() {
  printf "WARN %s\n" "$1" >&2
}

fail() {
  printf "FAIL %s\n" "$1" >&2
  failures=$((failures + 1))
}

http_status() {
  curl -sS --max-time 20 -o /dev/null -w "%{http_code}" "$1" 2>/dev/null || true
}

expect_http() {
  local route="$1"
  local accepted_codes="$2"
  local code
  code="$(http_status "${PRODUCTION_BASE_URL%/}${route}")"
  if [[ " ${accepted_codes} " == *" ${code} "* ]]; then
    pass "${route} returned accepted HTTP ${code}."
  else
    fail "${route} returned HTTP ${code:-000}, expected one of ${accepted_codes}; production is not release-ready."
  fi
}

expect_canonical_public_route() {
  local route="$1"
  local expected_url="$2"
  local marker="$3"
  local out
  local effective_url
  out="$(mktemp)"
  effective_url="$(
    curl -fsSL \
      --proto '=https' \
      --proto-redir '=https' \
      --max-redirs 4 \
      --max-time 20 \
      -o "${out}" \
      -w '%{url_effective}' \
      "${PRODUCTION_BASE_URL%/}${route}" 2>/dev/null || true
  )"

  if [[ "${effective_url}" != "${expected_url}" ]]; then
    fail "${route} resolved to ${effective_url:-unreachable}, expected ${expected_url}."
    rm -f "${out}"
    return
  fi
  if ! grep -Fqi -- "${marker}" "${out}"; then
    fail "${route} reached its canonical URL but did not render the required public marker."
    rm -f "${out}"
    return
  fi

  rm -f "${out}"
  pass "${route} resolves to ${expected_url} and renders its public content."
}

check_mobile_contract() {
  local report
  local summary
  report="$(mktemp)"
  if node "${REPO_ROOT}/scripts/quipsly-mobile-capture-contract-smoke.mjs" \
    "--base-url=${PRODUCTION_BASE_URL%/}" \
    --json >"${report}"; then
    summary="$(node -e '
      const fs = require("node:fs");
      const report = JSON.parse(fs.readFileSync(process.argv[1], "utf8"));
      if (report?.ok !== true || Number(report?.statusCounts?.fail || 0) !== 0) {
        process.exit(1);
      }
      process.stdout.write(String(report?.statusCounts?.pass || 0));
    ' "${report}" 2>/dev/null || true)"
    if [[ -n "${summary}" ]]; then
      pass "Production mobile Capture contract passed ${summary} checks."
    else
      fail "Production mobile Capture contract returned an invalid success report."
    fi
  else
    summary="$(node -e '
      const fs = require("node:fs");
      const report = JSON.parse(fs.readFileSync(process.argv[1], "utf8"));
      process.stdout.write(
        `${Number(report?.statusCounts?.pass || 0)} pass, `
        + `${Number(report?.statusCounts?.fail || 0)} fail`,
      );
    ' "${report}" 2>/dev/null || true)"
    fail "Production mobile Capture contract failed (${summary:-unreadable report})."
  fi
  rm -f "${report}"
}

echo "Quipsly production recovery gate"
echo "Project: ${PROJECT_ID}"
echo "Service: ${SERVICE_NAME} (${REGION})"
echo "Public origin: ${PRODUCTION_BASE_URL}"
echo

if ! gcloud auth print-access-token >/dev/null 2>&1; then
  fail "gcloud cannot mint an access token. Run gcloud auth login --update-adc --brief."
else
  pass "gcloud user authentication is usable."
fi

billing_report="$(
  gcloud billing projects describe "${PROJECT_ID}" \
    --format='value(billingEnabled,billingAccountName)' 2>/dev/null || true
)"
billing_enabled="$(printf "%s" "${billing_report}" | awk '{print $1}')"
billing_account_resource="$(printf "%s" "${billing_report}" | awk '{print $2}')"
billing_account_id="${billing_account_resource##*/}"

if [[ "${billing_enabled}" == "True" || "${billing_enabled}" == "true" ]]; then
  pass "Project billing is enabled."
else
  fail "Project billing is not enabled."
fi

if [[ -n "${billing_account_id}" ]]; then
  billing_account_open="$(
    gcloud billing accounts describe "${billing_account_id}" \
      --format='value(open)' 2>/dev/null || true
  )"
  if [[ "${billing_account_open}" == "True" || "${billing_account_open}" == "true" ]]; then
    pass "Attached billing account is open."
  else
    fail "Attached billing account is missing, closed, or inaccessible."
  fi
else
  fail "Project has no readable billing account attachment."
fi

sql_state="$(
  gcloud sql instances describe "${CLOUD_SQL_INSTANCE}" \
    --project="${PROJECT_ID}" \
    --format='value(state)' 2>/dev/null || true
)"
if [[ "${sql_state}" == "RUNNABLE" ]]; then
  pass "Cloud SQL ${CLOUD_SQL_INSTANCE} is RUNNABLE."
else
  fail "Cloud SQL ${CLOUD_SQL_INSTANCE} is ${sql_state:-unreadable}, expected RUNNABLE."
fi

service_json="$(mktemp)"
domain_json="$(mktemp)"
trap 'rm -f "${service_json}" "${domain_json}"' EXIT

if gcloud run services describe "${SERVICE_NAME}" \
  --project="${PROJECT_ID}" \
  --region="${REGION}" \
  --format=json >"${service_json}" 2>/dev/null; then
  service_gate="$(
    node - "${service_json}" <<'NODE'
const fs = require("fs");
const service = JSON.parse(fs.readFileSync(process.argv[2], "utf8"));
const status = service.status || {};
const annotations = service.spec?.template?.metadata?.annotations || {};
const ready = (status.conditions || []).find((condition) => condition.type === "Ready");
const traffic = status.traffic || [];
const live = traffic.find((entry) => Number(entry.percent || 0) === 100);
const result = {
  ready: ready?.status === "True",
  latestReady: status.latestReadyRevisionName || "",
  latestCreated: status.latestCreatedRevisionName || "",
  liveRevision: live?.revisionName || "",
  minInstances: Number(annotations["autoscaling.knative.dev/minScale"] || 0),
  maxInstances: Number(annotations["autoscaling.knative.dev/maxScale"] || 0),
};
process.stdout.write(JSON.stringify(result));
NODE
  )"
  service_ready="$(node -e 'const x=JSON.parse(process.argv[1]); process.stdout.write(String(x.ready))' "${service_gate}")"
  latest_ready="$(node -e 'const x=JSON.parse(process.argv[1]); process.stdout.write(x.latestReady)' "${service_gate}")"
  latest_created="$(node -e 'const x=JSON.parse(process.argv[1]); process.stdout.write(x.latestCreated)' "${service_gate}")"
  live_revision="$(node -e 'const x=JSON.parse(process.argv[1]); process.stdout.write(x.liveRevision)' "${service_gate}")"
  min_instances="$(node -e 'const x=JSON.parse(process.argv[1]); process.stdout.write(String(x.minInstances))' "${service_gate}")"
  max_instances="$(node -e 'const x=JSON.parse(process.argv[1]); process.stdout.write(String(x.maxInstances))' "${service_gate}")"

  if [[ "${service_ready}" == "true" ]]; then
    pass "Cloud Run Ready condition is true."
  else
    fail "Cloud Run Ready condition is not true."
  fi
  if [[ -n "${latest_ready}" && "${latest_ready}" == "${latest_created}" ]]; then
    pass "Latest created revision ${latest_created} is ready."
  else
    fail "Latest created revision ${latest_created:-unknown} is not the latest ready revision ${latest_ready:-unknown}."
  fi
  if [[ -n "${live_revision}" ]]; then
    pass "Production traffic is pinned 100% to ${live_revision}."
  else
    fail "No Cloud Run revision has 100% production traffic."
  fi
  if [[ "${max_instances}" =~ ^[0-9]+$ ]] && (( max_instances >= 2 )); then
    pass "Cloud Run may scale from ${min_instances} idle instance(s) to ${max_instances}, so one unavailable instance does not exhaust the service."
  else
    fail "Cloud Run maximum instances is ${max_instances:-unreadable}; production requires at least 2 so one unavailable instance cannot cause global HTTP 429 responses."
  fi
else
  fail "Cloud Run service ${SERVICE_NAME} could not be described."
fi

if gcloud beta run domain-mappings describe \
  --domain="${PRODUCTION_DOMAIN}" \
  --project="${PROJECT_ID}" \
  --region="${REGION}" \
  --format=json >"${domain_json}" 2>/dev/null; then
  if node - "${domain_json}" <<'NODE'
const fs = require("fs");
const mapping = JSON.parse(fs.readFileSync(process.argv[2], "utf8"));
const conditions = new Map(
  (mapping.status?.conditions || []).map((condition) => [condition.type, condition.status]),
);
const required = ["Ready", "CertificateProvisioned", "DomainRoutable"];
process.exit(required.every((name) => conditions.get(name) === "True") ? 0 : 1);
NODE
  then
    pass "Domain mapping, certificate, and routing are ready."
  else
    fail "Domain mapping is not fully ready."
  fi
else
  fail "Domain mapping ${PRODUCTION_DOMAIN} could not be described."
fi

expect_http "/" "200 301 302 303 307 308"
expect_http "/api/health" "200"
expect_http "/api/healthz" "200"
expect_http "/login?callbackUrl=%2Fprojects" "200"
expect_canonical_public_route \
  "/support" \
  "https://quipsly.com/support" \
  "charlie@highgroundodyssey.com"
expect_canonical_public_route \
  "/privacy" \
  "https://quipsly.com/privacy" \
  "Quipsly Privacy"
expect_canonical_public_route \
  "/privacy/account-deletion" \
  "https://quipsly.com/privacy/account-deletion" \
  "Delete your account without a scavenger hunt."
check_mobile_contract

recent_billing_errors="$(
  gcloud logging read \
    "resource.type=\"cloud_run_revision\" AND resource.labels.service_name=\"${SERVICE_NAME}\" AND textPayload:\"billing is disabled\"" \
    --project="${PROJECT_ID}" \
    --freshness=20m \
    --limit=20 \
    --format='value(timestamp)' 2>/dev/null | wc -l | tr -d ' '
)"
if [[ "${recent_billing_errors}" == "0" ]]; then
  pass "No billing-disabled Cloud Run errors were logged in the last 20 minutes."
else
  warn "${recent_billing_errors} billing-disabled Cloud Run error(s) remain in the last 20 minutes."
fi

if [[ "${failures}" -gt 0 ]]; then
  printf "\nProduction recovery gate failed with %s blocker(s). Do not deploy or promote.\n" "${failures}" >&2
  exit 1
fi

printf "\nProduction recovery gate passed. Current infrastructure and public routes agree.\n"
