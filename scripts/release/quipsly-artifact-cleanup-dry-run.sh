#!/usr/bin/env bash
set -euo pipefail

repo_root="$(git rev-parse --show-toplevel)"
project_id="${PROJECT_ID:-high-ground-odyssey}"
location="${REGION:-us-central1}"
repository="${ARTIFACT_REPOSITORY:-high-ground-studio}"
policy_file="${ARTIFACT_CLEANUP_POLICY_FILE:-${repo_root}/ops/artifact-registry/high-ground-studio-cleanup-policy.json}"
apply_dry_run=0

usage() {
  cat <<'EOF'
Usage: scripts/release/quipsly-artifact-cleanup-dry-run.sh [--apply-dry-run]

Without a flag, validates the conservative policy and prints the exact command.
--apply-dry-run updates Artifact Registry policy configuration with deletion
disabled. This script has no active-deletion mode by design.
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --) ;;
    --apply-dry-run) apply_dry_run=1 ;;
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
if (!Array.isArray(policies) || policies.length !== 2) {
  throw new Error("Expected exactly one conservative delete policy and one keep policy.");
}
const remove = policies.find((policy) => policy.name === "delete-any-after-3-days");
const keep = policies.find((policy) => policy.name === "keep-recent-10-per-package");
if (
  remove?.action?.type !== "Delete"
  || remove?.condition?.tagState !== "any"
  || remove?.condition?.olderThan !== "3d"
  || remove.condition.tagPrefixes
  || remove.condition.packageNamePrefixes
) {
  throw new Error("Delete policy must remain limited to versions older than 3 days.");
}
if (keep?.action?.type !== "Keep" || keep?.mostRecentVersions?.keepCount !== 10) {
  throw new Error("Keep policy must preserve at least the ten newest versions of every package.");
}
process.stdout.write("PASS Cleanup policy is conservative and structurally valid.\n");
NODE

echo "Repository: ${project_id}/${location}/${repository}"
echo "Policy: ${policy_file}"
echo "Boundary: dry-run only; no image or tag can be deleted by this command."

command=(
  gcloud artifacts repositories set-cleanup-policies "${repository}"
  "--project=${project_id}"
  "--location=${location}"
  "--policy=${policy_file}"
  --dry-run
)

if [[ "${apply_dry_run}" != "1" ]]; then
  printf 'Plan only. To configure the non-deleting evaluator:\n  '
  printf '%q ' "${command[@]}"
  printf '\n'
  exit 0
fi

gcloud artifacts repositories describe "${repository}" \
  "--project=${project_id}" \
  "--location=${location}" \
  --format='value(name,format,mode)'

"${command[@]}"

gcloud artifacts repositories list-cleanup-policies "${repository}" \
  "--project=${project_id}" \
  "--location=${location}" \
  --format=json

echo "PASS Artifact cleanup policy is configured in dry-run mode."
echo "No artifact was deleted. Wait at least one day, inspect validateOnly audit logs, and obtain explicit approval before any active-deletion configuration."
