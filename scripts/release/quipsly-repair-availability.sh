#!/usr/bin/env bash
set -euo pipefail

PROJECT_ID="${PROJECT_ID:-high-ground-odyssey}"
REGION="${REGION:-us-central1}"
SERVICE_NAME="${SERVICE_NAME:-studio}"
RECOVERY_TAG="${RECOVERY_TAG:-quipsly-recovery}"
MIN_INSTANCES="${MIN_INSTANCES:-0}"
MAX_INSTANCES="${MAX_INSTANCES:-2}"
APPLY_REPAIR="${QUIPSLY_APPLY_AVAILABILITY_REPAIR:-0}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

if [[ ! "${PROJECT_ID}" =~ ^[a-z][a-z0-9-]{4,62}$ ]] \
  || [[ ! "${REGION}" =~ ^[a-z][a-z0-9-]{2,62}$ ]] \
  || [[ ! "${SERVICE_NAME}" =~ ^[a-z][a-z0-9-]{1,62}$ ]] \
  || [[ ! "${RECOVERY_TAG}" =~ ^[a-z][a-z0-9-]{1,62}$ ]]; then
  echo "Project, region, service, or recovery tag is unsafe." >&2
  exit 2
fi
if [[ ! "${MIN_INSTANCES}" =~ ^[0-9]+$ ]] || [[ ! "${MAX_INSTANCES}" =~ ^[0-9]+$ ]] \
  || (( MIN_INSTANCES > MAX_INSTANCES )) || (( MAX_INSTANCES < 2 )) || (( MAX_INSTANCES > 10 )); then
  echo "Recovery scaling must satisfy 0 <= MIN_INSTANCES <= MAX_INSTANCES and MAX_INSTANCES must be 2 through 10." >&2
  exit 2
fi
if [[ "${APPLY_REPAIR}" != "0" && "${APPLY_REPAIR}" != "1" ]]; then
  echo "QUIPSLY_APPLY_AVAILABILITY_REPAIR must be 0 or 1." >&2
  exit 2
fi

service_state="$(mktemp)"
revision_state="$(mktemp)"
trap 'rm -f "${service_state}" "${revision_state}"' EXIT
gcloud run services describe "${SERVICE_NAME}" \
  --project="${PROJECT_ID}" \
  --region="${REGION}" \
  --format=json >"${service_state}"

IFS=$'\t' read -r old_revision old_max_instances <<<"$(node - "${service_state}" <<'NODE'
const fs = require("node:fs");
const service = JSON.parse(fs.readFileSync(process.argv[2], "utf8"));
const traffic = service.status?.traffic || [];
const live = traffic.find((entry) => Number(entry.percent || 0) === 100);
const annotations = service.spec?.template?.metadata?.annotations || {};
const max = annotations["autoscaling.knative.dev/maxScale"] || "0";
process.stdout.write([live?.revisionName || "", max].join("\t"));
NODE
)"
old_revision="${old_revision:-}"
old_max_instances="${old_max_instances:-0}"

if [[ ! "${old_revision}" =~ ^${SERVICE_NAME}-[a-z0-9-]+$ ]]; then
  echo "Could not identify the exact live revision; refusing availability repair." >&2
  exit 2
fi

gcloud run revisions describe "${old_revision}" \
  --project="${PROJECT_ID}" \
  --region="${REGION}" \
  --format=json >"${revision_state}"
immutable_image="$(node - "${revision_state}" <<'NODE'
const fs = require("node:fs");
const revision = JSON.parse(fs.readFileSync(process.argv[2], "utf8"));
process.stdout.write(revision.spec?.containers?.[0]?.image || "");
NODE
)"
if [[ ! "${immutable_image}" =~ @sha256:[0-9a-f]{64}$ ]]; then
  echo "The live revision does not expose an immutable image digest; refusing availability repair." >&2
  exit 2
fi

echo "Quipsly availability repair"
echo "Project: ${PROJECT_ID}"
echo "Service: ${SERVICE_NAME} (${REGION})"
echo "Live revision: ${old_revision}"
echo "Current maximum instances: ${old_max_instances}"
echo "Proposed scaling: ${MIN_INSTANCES} idle, ${MAX_INSTANCES} maximum"
echo "Candidate uses the exact live image digest; environment, secrets, SQL attachment, IAM, resources, and concurrency remain inherited."

if [[ "${APPLY_REPAIR}" != "1" ]]; then
  echo "PLAN ONLY: set QUIPSLY_APPLY_AVAILABILITY_REPAIR=1 to create, smoke, and promote the guarded recovery revision."
  exit 0
fi

echo "Creating a no-traffic recovery revision."
gcloud run deploy "${SERVICE_NAME}" \
  --project="${PROJECT_ID}" \
  --region="${REGION}" \
  --image="${immutable_image}" \
  --min-instances="${MIN_INSTANCES}" \
  --max-instances="${MAX_INSTANCES}" \
  --no-traffic \
  --tag="${RECOVERY_TAG}" \
  --quiet

candidate_state="$(mktemp)"
trap 'rm -f "${service_state}" "${revision_state}" "${candidate_state}"' EXIT
gcloud run services describe "${SERVICE_NAME}" \
  --project="${PROJECT_ID}" \
  --region="${REGION}" \
  --format=json >"${candidate_state}"

IFS=$'\t' read -r new_revision preview_url <<<"$(RECOVERY_TAG="${RECOVERY_TAG}" node - "${candidate_state}" <<'NODE'
const fs = require("node:fs");
const service = JSON.parse(fs.readFileSync(process.argv[2], "utf8"));
const match = (service.status?.traffic || []).find((entry) => entry.tag === process.env.RECOVERY_TAG);
process.stdout.write([match?.revisionName || "", match?.url || ""].join("\t"));
NODE
)"
new_revision="${new_revision:-}"
preview_url="${preview_url:-}"
if [[ ! "${new_revision}" =~ ^${SERVICE_NAME}-[a-z0-9-]+$ ]] || [[ "${preview_url}" != https://*.run.app ]]; then
  echo "Recovery revision or tagged URL could not be identified; production traffic was not changed." >&2
  exit 1
fi

for endpoint in /api/health /api/healthz; do
  body="$(mktemp)"
  if ! curl -fsS --max-time 30 "${preview_url}${endpoint}" -o "${body}" \
    || ! node -e 'const fs=require("node:fs"); const x=JSON.parse(fs.readFileSync(process.argv[1],"utf8")); process.exit(x?.ok === true ? 0 : 1)' "${body}"; then
    rm -f "${body}"
    echo "Recovery candidate failed ${endpoint}; production traffic was not changed." >&2
    exit 1
  fi
  rm -f "${body}"
done

echo "Promoting healthy recovery revision ${new_revision}."
gcloud run services update-traffic "${SERVICE_NAME}" \
  --project="${PROJECT_ID}" \
  --region="${REGION}" \
  --to-revisions="${new_revision}=100" \
  --update-tags="quipsly-preview=${new_revision},${RECOVERY_TAG}=${new_revision}" \
  --quiet

if ! PROJECT_ID="${PROJECT_ID}" REGION="${REGION}" SERVICE_NAME="${SERVICE_NAME}" \
  bash "${SCRIPT_DIR}/quipsly-production-status.sh"; then
  echo "Production verification failed; restoring ${old_revision}." >&2
  gcloud run services update-traffic "${SERVICE_NAME}" \
    --project="${PROJECT_ID}" \
    --region="${REGION}" \
    --to-revisions="${old_revision}=100" \
    --update-tags="quipsly-preview=${old_revision},${RECOVERY_TAG}=${new_revision}" \
    --quiet
  exit 1
fi

echo "Quipsly availability repair completed and production verification passed."
