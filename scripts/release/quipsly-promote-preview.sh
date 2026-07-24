#!/usr/bin/env bash
set -euo pipefail

REGION="${REGION:-us-central1}"
SERVICE_NAME="${SERVICE_NAME:-studio}"
PREVIEW_TAG="${PREVIEW_TAG:-quipsly-preview}"
PROJECT_ID="${PROJECT_ID:-$(gcloud config get-value project 2>/dev/null || true)}"
SOURCE_REF="${SOURCE_REF:-HEAD}"
RELEASE_SMOKE_SECRET_NAME="${RELEASE_SMOKE_SECRET_NAME:-quipsly-release-smoke-secret}"
RELEASE_SMOKE_SECRET_VERSION="${RELEASE_SMOKE_SECRET_VERSION:-latest}"

if [[ -z "${PROJECT_ID}" ]]; then
  echo "PROJECT_ID is required or gcloud must have a default project." >&2
  exit 2
fi
if [[ -z "${QUIPSLY_AUTH_SMOKE_EMAIL:-}" || -z "${QUIPSLY_AUTH_SMOKE_PASSWORD:-}" ]]; then
  echo "QUIPSLY_AUTH_SMOKE_EMAIL and QUIPSLY_AUTH_SMOKE_PASSWORD are required." >&2
  echo "Supply the verified reviewer credentials only through the environment." >&2
  exit 2
fi

repo_root="$(git rev-parse --show-toplevel)"
expected_source_sha="$(git -C "${repo_root}" rev-parse --verify "${SOURCE_REF}^{commit}")"
service_json="$(mktemp)"
trap 'rm -f "${service_json}"' EXIT

describe_service() {
  gcloud run services describe "${SERVICE_NAME}" \
    --project="${PROJECT_ID}" \
    --region="${REGION}" \
    --format=json >"${service_json}"
}

read_preview_identity() {
  node - "${service_json}" "${PREVIEW_TAG}" <<'NODE'
const fs = require("node:fs");
const service = JSON.parse(fs.readFileSync(process.argv[2], "utf8"));
const tag = process.argv[3];
const traffic = service.status?.traffic || [];
const preview = traffic.find((entry) => entry.tag === tag);
if (!preview?.revisionName || !preview?.url) {
  process.stderr.write(`Cloud Run tag ${tag} has no immutable revision and URL.\n`);
  process.exit(1);
}
process.stdout.write(`${preview.revisionName}\t${preview.url}\n`);
NODE
}

describe_service
previous_revision="$(
  node - "${service_json}" <<'NODE'
const fs = require("node:fs");
const service = JSON.parse(fs.readFileSync(process.argv[2], "utf8"));
const live = (service.status?.traffic || []).find(
  (entry) => Number(entry.percent || 0) === 100 && !entry.tag,
);
if (!live?.revisionName) process.exit(1);
process.stdout.write(live.revisionName);
NODE
)"
IFS=$'\t' read -r preview_revision preview_url <<< "$(read_preview_identity)"

revision_json="$(mktemp)"
trap 'rm -f "${service_json}" "${revision_json}"' EXIT
gcloud run revisions describe "${preview_revision}" \
  --project="${PROJECT_ID}" \
  --region="${REGION}" \
  --format=json >"${revision_json}"

read -r preview_source_sha preview_channel < <(
  node - "${revision_json}" <<'NODE'
const fs = require("node:fs");
const revision = JSON.parse(fs.readFileSync(process.argv[2], "utf8"));
const env = new Map(
  (revision.spec?.containers?.[0]?.env || []).map((entry) => [entry.name, entry.value]),
);
process.stdout.write(
  `${String(env.get("QUIPSLY_SOURCE_SHA") || "")} `
  + `${String(env.get("QUIPSLY_RELEASE_CHANNEL") || "")}\n`,
);
NODE
)

if [[ "${preview_source_sha}" != "${expected_source_sha}" ]]; then
  echo "Preview ${preview_revision} is source ${preview_source_sha:-<missing>}, not ${expected_source_sha}." >&2
  exit 1
fi
if [[ "${preview_channel}" != "preview" ]]; then
  echo "Preview ${preview_revision} has release channel ${preview_channel:-<missing>}." >&2
  exit 1
fi

SOURCE_REF="${expected_source_sha}" \
  QUIPSLY_PREFLIGHT_PURPOSE=preview \
  bash "${repo_root}/scripts/release/quipsly-release-preflight.sh"

echo "=========================================================="
echo "🛡️  Running Beta Manifest Scan before promotion..."
echo "=========================================================="
if ! node scripts/scan-beta-blockers.mjs; then
  echo ""
  echo "❌ ABORTING PROMOTION: Beta manifest scan failed. Please resolve blockers listed above." >&2
  exit 1
fi
echo "=========================================================="

release_smoke_secret="$(
  gcloud secrets versions access "${RELEASE_SMOKE_SECRET_VERSION}" \
    --secret="${RELEASE_SMOKE_SECRET_NAME}" \
    --project="${PROJECT_ID}"
)"
if [[ -z "${release_smoke_secret}" ]]; then
  echo "Release-smoke secret is empty." >&2
  exit 1
fi

QUIPSLY_RELEASE_SMOKE_SECRET="${release_smoke_secret}" \
  PREVIEW_URL="${preview_url}" \
  bash "${repo_root}/scripts/release/quipsly-smoke-preview.sh"
unset release_smoke_secret

# The tag is mutable. Resolve it again after smoke and refuse promotion if it
# moved while the candidate was being exercised.
describe_service
IFS=$'\t' read -r verified_revision verified_url <<< "$(read_preview_identity)"
if [[ "${verified_revision}" != "${preview_revision}" || "${verified_url}" != "${preview_url}" ]]; then
  echo "Preview tag moved during smoke; refusing promotion." >&2
  exit 1
fi

echo "Current traffic before promotion:"
"${repo_root}/scripts/release/quipsly-traffic.sh" || true

cat <<EOF

Promoting immutable revision '${preview_revision}' (source ${expected_source_sha})
to 100% traffic for service '${SERVICE_NAME}' in '${REGION}'.
EOF

gcloud run services update-traffic "${SERVICE_NAME}" \
  --project="${PROJECT_ID}" \
  --region="${REGION}" \
  --to-revisions="${preview_revision}=100" \
  --quiet

if PROJECT_ID="${PROJECT_ID}" \
  REGION="${REGION}" \
  SERVICE_NAME="${SERVICE_NAME}" \
  bash "${repo_root}/scripts/release/quipsly-production-status.sh"; then
  echo "Current traffic after promotion:"
  "${repo_root}/scripts/release/quipsly-traffic.sh"
else
  echo "Production readback failed; rolling traffic back to ${previous_revision}." >&2
  gcloud run services update-traffic "${SERVICE_NAME}" \
    --project="${PROJECT_ID}" \
    --region="${REGION}" \
    --to-revisions="${previous_revision}=100" \
    --quiet
  exit 1
fi
