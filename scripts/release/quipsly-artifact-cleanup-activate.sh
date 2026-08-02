#!/usr/bin/env bash
set -euo pipefail

repo_root="$(git rev-parse --show-toplevel)"
project_id="${PROJECT_ID:-high-ground-odyssey}"
location="${REGION:-us-central1}"
repository="${ARTIFACT_REPOSITORY:-high-ground-studio}"
policy_file="${ARTIFACT_CLEANUP_POLICY_FILE:-${repo_root}/ops/artifact-registry/high-ground-studio-cleanup-policy.json}"
confirmation="${CONFIRM_ARTIFACT_DELETION:-}"
activate=0

usage() {
  cat <<'EOF'
Usage: scripts/release/quipsly-artifact-cleanup-activate.sh [--activate-after-audit]

Without a flag, validates the checked-in policy, audits live Cloud Run image
protection, and prints the activation boundary without changing Google Cloud.

Activation additionally requires:
  CONFIRM_ARTIFACT_DELETION=high-ground-studio-45d-keep10

The active policy deletes repository versions only after they are 45 days old
and always keeps the newest 10 versions of every package. Google applies the
policy asynchronously. This command never deletes a named image directly.
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --) ;;
    --activate-after-audit) activate=1 ;;
    --help|-h) usage; exit 0 ;;
    *) echo "Unknown argument: $1" >&2; usage >&2; exit 2 ;;
  esac
  shift
done

[[ -f "${policy_file}" ]] || {
  echo "Cleanup policy file is missing: ${policy_file}" >&2
  exit 2
}

node - "${policy_file}" <<'NODE'
const fs = require("node:fs");
const policies = JSON.parse(fs.readFileSync(process.argv[2], "utf8"));
const remove = policies.find((policy) => policy.name === "delete-any-after-45-days");
const keep = policies.find((policy) => policy.name === "keep-recent-10-per-package");
if (!Array.isArray(policies) || policies.length !== 2) {
  throw new Error("Expected exactly one delete policy and one keep policy.");
}
if (
  remove?.action?.type !== "Delete"
  || remove?.condition?.tagState !== "any"
  || remove?.condition?.olderThan !== "45d"
  || remove.condition.tagPrefixes
  || remove.condition.packageNamePrefixes
) {
  throw new Error("Delete policy must remain limited to versions older than 45 days.");
}
if (
  keep?.action?.type !== "Keep"
  || keep?.mostRecentVersions?.keepCount !== 10
  || keep.mostRecentVersions.packageNamePrefixes
) {
  throw new Error("Keep policy must preserve the ten newest versions of every package.");
}
process.stdout.write("PASS Checked-in retention policy is structurally valid.\n");
NODE

audit_json="$(
  PROJECT_ID="${project_id}" \
  REGION="${location}" \
  ARTIFACT_REPOSITORY="${repository}" \
    node "${repo_root}/scripts/release/quipsly-cloud-cost-audit.mjs"
)"

printf '%s' "${audit_json}" | node -e '
let input = "";
process.stdin.on("data", (chunk) => { input += chunk; });
process.stdin.on("end", () => {
  const audit = JSON.parse(input);
  const artifacts = audit.artifacts ?? {};
  const cloudRun = audit.cloudRun ?? {};
  if (audit.boundaries?.readOnly !== true || audit.boundaries?.artifactDeletionPerformed !== false) {
    throw new Error("Live cost audit did not preserve its read-only boundary.");
  }
  if (!Number.isInteger(artifacts.trafficServingProtectedVersionCount)) {
    throw new Error("Live audit did not resolve traffic-serving protected versions.");
  }
  if (artifacts.trafficServingProtectedVersionCount !== cloudRun.trafficServingDigestCount) {
    throw new Error(
      `Only ${artifacts.trafficServingProtectedVersionCount} of ${cloudRun.trafficServingDigestCount} traffic-serving digests are protected.`,
    );
  }
  if (artifacts.trafficServingProtectedVersionCount < 1) {
    throw new Error("No traffic-serving Cloud Run image was resolved; refusing activation.");
  }
  if (
    artifacts.trafficServingRetentionProtectedVersionCount
    !== cloudRun.trafficServingDigestCount
  ) {
    throw new Error(
      `Only ${artifacts.trafficServingRetentionProtectedVersionCount} of ${cloudRun.trafficServingDigestCount} traffic-serving digests survive the checked-in retention policy.`,
    );
  }
  process.stdout.write(
    `PASS Live audit proves all ${artifacts.trafficServingProtectedVersionCount} traffic-serving image digests survive retention.\n`,
  );
  process.stdout.write(
    `Candidate inventory: ${artifacts.retentionCandidateVersionCount} versions, ${artifacts.retentionCandidateKnownSizeBytes} summed known bytes.\n`,
  );
});
'

echo "Repository: ${project_id}/${location}/${repository}"
echo "Policy: delete versions older than 45 days; keep newest 10 per package"
echo "Boundary: background cleanup only; current traffic digests were resolved and protected"

if [[ "${activate}" != "1" ]]; then
  echo "PLAN ONLY No Google Cloud setting changed."
  echo "To activate, pass --activate-after-audit with the documented confirmation value."
  exit 0
fi

if [[ "${confirmation}" != "high-ground-studio-45d-keep10" ]]; then
  echo "Refusing active cleanup without CONFIRM_ARTIFACT_DELETION=high-ground-studio-45d-keep10." >&2
  exit 2
fi

gcloud artifacts repositories set-cleanup-policies "${repository}" \
  "--project=${project_id}" \
  "--location=${location}" \
  "--policy=${policy_file}" \
  --no-dry-run

readback_json="$(gcloud artifacts repositories describe "${repository}" \
  "--project=${project_id}" \
  "--location=${location}" \
  --format=json)"

printf '%s' "${readback_json}" | node -e '
let input = "";
process.stdin.on("data", (chunk) => { input += chunk; });
process.stdin.on("end", () => {
  const repository = JSON.parse(input);
  // The Artifact Registry API omits this proto3 boolean when it is false.
  if (repository.cleanupPolicyDryRun === true) {
    throw new Error("Artifact Registry still reports cleanupPolicyDryRun=true.");
  }
  process.stdout.write("PASS Provider readback confirms cleanup dry-run is disabled.\n");
});
'

gcloud artifacts repositories list-cleanup-policies "${repository}" \
  "--project=${project_id}" \
  "--location=${location}" \
  --format=json

echo "PASS Artifact Registry cleanup is active."
echo "Google applies cleanup asynchronously; storage totals can take approximately one day to change."
