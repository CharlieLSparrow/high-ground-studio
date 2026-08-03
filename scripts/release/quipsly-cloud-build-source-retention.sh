#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
project_id="${GOOGLE_CLOUD_PROJECT:-high-ground-odyssey}"
bucket_name="${CLOUD_BUILD_SOURCE_BUCKET:-high-ground-odyssey_cloudbuild}"
bucket="gs://${bucket_name}"
policy_file="${repo_root}/scripts/release/high-ground-odyssey-cloud-build-source-lifecycle.json"
activate=0

if [[ "${1:-}" == "--" ]]; then
  shift
fi

usage() {
  cat <<'EOF'
Usage: bash scripts/release/quipsly-cloud-build-source-retention.sh [--activate-after-audit]

Without a flag, audits the dedicated Cloud Build upload bucket and prints the
bounded seven-day lifecycle plan without changing Google Cloud.

Activation additionally requires:
  CONFIRM_CLOUD_BUILD_SOURCE_EXPIRY=high-ground-odyssey-cloudbuild-source-7d

The policy expires only reconstructable objects under source/ after seven days.
It does not touch build logs, Artifact Registry images, application media,
database backups, or any other bucket.
EOF
}

case "${1:-}" in
  "") ;;
  --activate-after-audit) activate=1 ;;
  -h|--help) usage; exit 0 ;;
  *) usage >&2; exit 2 ;;
esac

node - "${policy_file}" <<'NODE'
const fs = require("node:fs");
const policy = JSON.parse(fs.readFileSync(process.argv[2], "utf8"));
const rules = policy?.rule;
if (!Array.isArray(rules) || rules.length !== 1) {
  throw new Error("Expected exactly one Cloud Build source lifecycle rule.");
}
const rule = rules[0];
if (
  rule?.action?.type !== "Delete"
  || rule?.condition?.age !== 7
  || JSON.stringify(rule.condition.matchesPrefix) !== JSON.stringify(["source/"])
  || Object.keys(rule.condition).some((key) => !["age", "matchesPrefix"].includes(key))
) {
  throw new Error("Lifecycle must remain limited to source/ objects older than seven days.");
}
NODE

account="$(gcloud config get-value account 2>/dev/null)"
configured_project="$(gcloud config get-value project 2>/dev/null)"
if [[ -z "${account}" || "${account}" == "(unset)" ]]; then
  echo "No active gcloud account." >&2
  exit 1
fi
if [[ "${configured_project}" != "${project_id}" ]]; then
  echo "Refusing lifecycle change: gcloud project is ${configured_project}, expected ${project_id}." >&2
  exit 1
fi

resolved_bucket="$(gcloud storage buckets describe "${bucket}" --format='value(name)')"
if [[ "${resolved_bucket}" != "${bucket_name}" ]]; then
  echo "Refusing lifecycle change: resolved ${resolved_bucket}, expected ${bucket_name}." >&2
  exit 1
fi

inventory="$(mktemp)"
trap 'rm -f "${inventory}"' EXIT
gcloud storage ls --long --recursive "${bucket}/**" > "${inventory}"

node - "${inventory}" "${bucket}" <<'NODE'
const fs = require("node:fs");
const inventory = fs.readFileSync(process.argv[2], "utf8").split("\n");
const bucket = process.argv[3];
let count = 0;
let bytes = 0;
let eligibleCount = 0;
let eligibleBytes = 0;
const cutoff = Date.now() - 7 * 24 * 60 * 60 * 1000;
for (const line of inventory) {
  const match = line.match(/^\s*(\d+)\s+(\d{4}-\d\d-\d\dT\S+)\s+(gs:\/\/\S+)$/);
  if (!match) continue;
  if (!match[3].startsWith(`${bucket}/source/`)) {
    throw new Error(`Unexpected object outside ${bucket}/source/: ${match[3]}`);
  }
  const size = Number(match[1]);
  count += 1;
  bytes += size;
  if (Date.parse(match[2]) < cutoff) {
    eligibleCount += 1;
    eligibleBytes += size;
  }
}
if (count === 0) throw new Error("Cloud Build source bucket inventory was empty or unreadable.");
console.log(`Account: ${process.env.USER || "operator"}`);
console.log(`Bucket: ${bucket}`);
console.log(`Boundary: ${count} reconstructable source/ archives; no other object prefixes`);
console.log(`Current size: ${(bytes / 1e9).toFixed(2)} GB`);
console.log(`Currently older than seven days: ${eligibleCount} archives / ${(eligibleBytes / 1e9).toFixed(2)} GB`);
NODE

echo "Policy: expire only ${bucket}/source/ objects after seven days"
if [[ "${activate}" != "1" ]]; then
  echo "No lifecycle change performed."
  exit 0
fi

if [[ "${CONFIRM_CLOUD_BUILD_SOURCE_EXPIRY:-}" != "high-ground-odyssey-cloudbuild-source-7d" ]]; then
  echo "Refusing activation without CONFIRM_CLOUD_BUILD_SOURCE_EXPIRY=high-ground-odyssey-cloudbuild-source-7d." >&2
  exit 2
fi

gcloud storage buckets update "${bucket}" --lifecycle-file="${policy_file}"
readback="$(gcloud storage buckets describe "${bucket}" --format='json(lifecycle_config)')"
node - "${readback}" <<'NODE'
const state = JSON.parse(process.argv[2]);
const rules = state?.lifecycle_config?.rule;
const rule = Array.isArray(rules) ? rules[0] : null;
if (
  rules?.length !== 1
  || rule?.action?.type !== "Delete"
  || rule?.condition?.age !== 7
  || JSON.stringify(rule.condition.matchesPrefix) !== JSON.stringify(["source/"])
) {
  throw new Error("Live lifecycle readback did not match the bounded source/ seven-day policy.");
}
console.log("PASS Live Cloud Build source lifecycle matches the checked-in policy.");
NODE
