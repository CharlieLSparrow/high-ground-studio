#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'EOF'
Usage:
  scripts/release/quipsly-schema-release.sh [options]

Options:
  --revision <git-ref>       Exact committed source to release (default: HEAD).
  --project <project-id>     Google Cloud project.
  --region <region>          Artifact Registry and Cloud Run region.
  --sql-instance <name>      Full project:region:instance connection name.
  --output <receipt.json>    Mode-0600 release receipt path.
  --apply                    Execute the guarded production release.
  --confirm-target <value>   Required with --apply; PROJECT/INSTANCE.
  --help                     Show this help.

Without --apply this command writes a plan receipt and performs no Google Cloud
mutation. The apply lane requires a clean checkout at the selected HEAD, proves
all migrations in a disposable database, pins one immutable schema-image
digest, creates and independently reads back a successful on-demand backup,
runs prisma migrate deploy, then requires migration status and zero schema diff.
It never runs db push or the legacy targeted sync bridge.
EOF
}

fail() {
  echo "FAIL $*" >&2
  exit 1
}

apply=0
source_ref="HEAD"
project_id="${PROJECT_ID:-high-ground-odyssey}"
region="${REGION:-us-central1}"
repository="${REPOSITORY:-high-ground-studio}"
image_name="${IMAGE_NAME:-quipsly-schema}"
service_account="${SERVICE_ACCOUNT:-studio-cloud-run@high-ground-odyssey.iam.gserviceaccount.com}"
sql_instance="${SQL_INSTANCE:-high-ground-odyssey:us-central1:studio-postgres}"
database_secret="${DATABASE_SECRET:-studio-database-url:latest}"
output_path=""
confirmed_target=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --apply)
      apply=1
      shift
      ;;
    --revision|--project|--region|--sql-instance|--output|--confirm-target)
      [[ $# -ge 2 ]] || { echo "$1 requires a value." >&2; exit 2; }
      case "$1" in
        --revision) source_ref="$2" ;;
        --project) project_id="$2" ;;
        --region) region="$2" ;;
        --sql-instance) sql_instance="$2" ;;
        --output) output_path="$2" ;;
        --confirm-target) confirmed_target="$2" ;;
      esac
      shift 2
      ;;
    --help)
      usage
      exit 0
      ;;
    *)
      echo "Unknown option: $1" >&2
      usage >&2
      exit 2
      ;;
  esac
done

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
repo_root="$(cd "${script_dir}/../.." && pwd)"
git -C "${repo_root}" rev-parse --show-toplevel >/dev/null
source_sha="$(git -C "${repo_root}" rev-parse --verify "${source_ref}^{commit}")"
head_sha="$(git -C "${repo_root}" rev-parse --verify HEAD)"
source_dirty=false
if [[ -n "$(git -C "${repo_root}" status --porcelain)" ]]; then
  source_dirty=true
fi

[[ "${project_id}" =~ ^[a-z][a-z0-9-]{4,28}[a-z0-9]$ ]] || fail "Unsafe project ID '${project_id}'."
[[ "${region}" =~ ^[a-z]+-[a-z]+[0-9]$ ]] || fail "Unsafe region '${region}'."
[[ "${repository}" =~ ^[a-z][a-z0-9._-]{0,126}$ ]] || fail "Unsafe artifact repository '${repository}'."
[[ "${image_name}" =~ ^[a-z][a-z0-9._-]{0,126}$ ]] || fail "Unsafe image name '${image_name}'."
[[ "${sql_instance}" =~ ^${project_id}:${region}:[a-z][a-z0-9-]{0,97}[a-z0-9]$ ]] \
  || fail "SQL instance must be the full ${project_id}:${region}:INSTANCE connection name."

sql_instance_name="${sql_instance##*:}"
target_confirmation="${project_id}/${sql_instance_name}"
sha12="${source_sha:0:12}"
image_tag="schema-${sha12}"
image_uri="${region}-docker.pkg.dev/${project_id}/${repository}/${image_name}:${image_tag}"
fixture_database="quipsly_fixture_${sha12}"
started_at="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
run_stamp="$(date -u +%Y%m%dT%H%M%SZ)"
backup_description="quipsly-before-${sha12}-${run_stamp}"

if [[ -z "${output_path}" ]]; then
  output_path="${TMPDIR:-/tmp}/quipsly-schema-release-${sha12}-${run_stamp}.json"
fi

work_root="$(mktemp -d "${TMPDIR:-/tmp}/quipsly-schema-release.XXXXXX")"
touch "${work_root}/.quipsly-schema-release"
steps_file="${work_root}/steps.tsv"
backup_receipt="${work_root}/backup-readback.json"
touch "${steps_file}"

cleanup() {
  if [[ -f "${work_root}/.quipsly-schema-release" ]]; then
    rm -rf -- "${work_root}"
  else
    echo "WARN Refusing to remove unmarked schema-release work directory ${work_root}." >&2
  fi
}

record_step() {
  local name="$1"
  local status="$2"
  local detail="$3"
  printf '%s\t%s\t%s\t%s\n' \
    "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "${name}" "${status}" "${detail}" >>"${steps_file}"
}

outcome="FAILED"
image_digest=""
immutable_image=""

write_receipt() {
  local command_status="$1"
  local final_outcome="${outcome}"
  if [[ "${command_status}" -ne 0 && "${final_outcome}" == "PASSED" ]]; then
    final_outcome="FAILED"
  fi
  node - \
    "${output_path}" "${final_outcome}" "${apply}" "${started_at}" \
    "${project_id}" "${region}" "${sql_instance_name}" "${source_sha}" \
    "${head_sha}" "${source_dirty}" "${image_uri}" "${image_digest}" \
    "${immutable_image}" "${fixture_database}" "${backup_description}" \
    "${steps_file}" "${backup_receipt}" <<'NODE'
const fs = require("node:fs");
const path = require("node:path");

const [
  outputPath, outcome, apply, startedAt, project, region, instance, sourceSha,
  headSha, sourceDirty, imageTag, imageDigest, immutableImage, fixtureDatabase,
  backupDescription, stepsPath, backupPath,
] = process.argv.slice(2);

const steps = fs.readFileSync(stepsPath, "utf8")
  .trim()
  .split("\n")
  .filter(Boolean)
  .map((line) => {
    const [at, name, status, detail] = line.split("\t");
    return { at, name, status, detail };
  });

let backup = {
  description: backupDescription,
  id: null,
  status: null,
  type: null,
  readbackPassed: false,
};
if (fs.existsSync(backupPath)) {
  const value = JSON.parse(fs.readFileSync(backupPath, "utf8"));
  backup = {
    description: value.description,
    id: value.id,
    status: value.status,
    type: value.type,
    startTime: value.startTime,
    endTime: value.endTime,
    readbackPassed: value.passed === true,
  };
}

const receipt = {
  schema: "quipsly-production-schema-release-v1",
  generatedAt: new Date().toISOString(),
  startedAt,
  mode: apply === "1" ? "APPLY" : "PLAN",
  outcome,
  target: { project, region, instance },
  source: {
    sha: sourceSha,
    headSha,
    dirtyAtStart: sourceDirty === "true",
    exactCleanHeadRequired: true,
  },
  schemaImage: {
    tag: imageTag,
    digest: imageDigest || null,
    immutableReference: immutableImage || null,
  },
  fixture: {
    database: fixtureDatabase,
    required: true,
    retainedAfterSuccess: false,
  },
  backup,
  migration: {
    command: "prisma migrate deploy",
    postDeployStatusRequired: true,
    postDeployZeroDiffRequired: true,
    legacyDbPushUsed: false,
    legacyTargetedSyncUsed: false,
  },
  steps,
};

const absolute = path.resolve(outputPath);
fs.mkdirSync(path.dirname(absolute), { recursive: true });
const temporary = `${absolute}.tmp-${process.pid}`;
fs.writeFileSync(temporary, `${JSON.stringify(receipt, null, 2)}\n`, {
  mode: 0o600,
  flag: "wx",
});
fs.chmodSync(temporary, 0o600);
fs.renameSync(temporary, absolute);
fs.chmodSync(absolute, 0o600);
NODE
}

finish() {
  local status=$?
  set +e
  write_receipt "${status}"
  local receipt_status=$?
  cleanup
  if [[ "${receipt_status}" -ne 0 ]]; then
    echo "WARN Could not write schema release receipt ${output_path}." >&2
  else
    echo "Schema release receipt: ${output_path}"
  fi
  exit "${status}"
}
trap finish EXIT

record_step "target-validation" "PASSED" "Validated explicit project, region, and SQL instance."

if [[ "${apply}" != "1" ]]; then
  record_step "fixture-migration-proof" "PLANNED" "Build exact schema source and prove the full chain in a disposable database."
  record_step "immutable-image-readback" "PLANNED" "Resolve and reuse one Artifact Registry digest."
  record_step "on-demand-backup" "PLANNED" "Create and independently read back a successful production backup."
  record_step "production-migrate-deploy" "PLANNED" "Apply only committed Prisma migrations."
  record_step "production-status" "PLANNED" "Require Prisma migration ledger to be current."
  record_step "production-zero-diff" "PLANNED" "Require no difference between production and committed schema."
  outcome="PLANNED"
  echo "PLAN ${source_sha} -> ${target_confirmation}"
  echo "Re-run with --apply --confirm-target ${target_confirmation} after reviewing ${output_path}."
  exit 0
fi

[[ "${confirmed_target}" == "${target_confirmation}" ]] \
  || fail "--apply requires --confirm-target ${target_confirmation}."
[[ "${source_sha}" == "${head_sha}" ]] \
  || fail "Apply requires --revision to resolve to the current HEAD ${head_sha}."
[[ "${source_dirty}" == "false" ]] \
  || fail "Apply requires a clean checkout so the orchestrator and selected source are identical."
record_step "clean-source-boundary" "PASSED" "Selected source is the clean current HEAD."

gcloud auth print-access-token >/dev/null
gcloud auth application-default print-access-token >/dev/null
gcloud projects describe "${project_id}" --project="${project_id}" --format='value(projectId)' >/dev/null
gcloud sql instances describe "${sql_instance_name}" \
  --project="${project_id}" --format='value(connectionName)' \
  | grep -Fx "${sql_instance}" >/dev/null
record_step "google-cloud-authorization" "PASSED" "Credentials can access the exact Cloud SQL target."

MODE=fixture \
PROJECT_ID="${project_id}" \
REGION="${region}" \
REPOSITORY="${repository}" \
IMAGE_NAME="${image_name}" \
SERVICE_ACCOUNT="${service_account}" \
SQL_INSTANCE="${sql_instance}" \
DATABASE_SECRET="${database_secret}" \
SOURCE_REF="${source_sha}" \
IMAGE_TAG="${image_tag}" \
FIXTURE_DATABASE="${fixture_database}" \
PRESERVE_FIXTURE_DATABASE=0 \
  bash "${repo_root}/scripts/release/quipsly-schema-job.sh"
record_step "fixture-migration-proof" "PASSED" "Full migration chain and zero diff passed in a disposable database."

image_digest="$(
  gcloud artifacts docker images describe "${image_uri}" \
    --project="${project_id}" \
    --format='value(image_summary.digest)'
)"
[[ "${image_digest}" =~ ^sha256:[0-9a-f]{64}$ ]] \
  || fail "Could not read a valid immutable digest for ${image_uri}."
immutable_image="${region}-docker.pkg.dev/${project_id}/${repository}/${image_name}@${image_digest}"
record_step "immutable-image-readback" "PASSED" "Pinned the exact schema image digest for every production check."

gcloud sql backups create \
  --project="${project_id}" \
  --instance="${sql_instance_name}" \
  --description="${backup_description}" \
  --quiet

backup_list="${work_root}/backup-list.json"
gcloud sql backups list \
  --project="${project_id}" \
  --instance="${sql_instance_name}" \
  --filter="description=${backup_description}" \
  --limit=10 \
  --format=json >"${backup_list}"

node "${repo_root}/scripts/release/quipsly-cloud-sql-backup-readback.mjs" \
  --input "${backup_list}" \
  --expected-project "${project_id}" \
  --expected-instance "${sql_instance_name}" \
  --expected-description "${backup_description}" \
  --output "${backup_receipt}" >/dev/null
backup_id="$(node -p "require(process.argv[1]).id" "${backup_receipt}")"

backup_describe="${work_root}/backup-describe.json"
gcloud sql backups describe "${backup_id}" \
  --project="${project_id}" \
  --instance="${sql_instance_name}" \
  --format=json >"${backup_describe}"
node "${repo_root}/scripts/release/quipsly-cloud-sql-backup-readback.mjs" \
  --input "${backup_describe}" \
  --expected-project "${project_id}" \
  --expected-instance "${sql_instance_name}" \
  --expected-description "${backup_description}" \
  --expected-id "${backup_id}" \
  --output "${backup_receipt}" >/dev/null
record_step "on-demand-backup" "PASSED" "Successful on-demand backup independently read back by exact ID."

run_schema_job() {
  local mode="$1"
  MODE="${mode}" \
  PROJECT_ID="${project_id}" \
  REGION="${region}" \
  REPOSITORY="${repository}" \
  IMAGE_NAME="${image_name}" \
  SERVICE_ACCOUNT="${service_account}" \
  SQL_INSTANCE="${sql_instance}" \
  DATABASE_SECRET="${database_secret}" \
  SOURCE_REF="${source_sha}" \
  IMAGE_TAG="${image_tag}" \
  IMAGE_REFERENCE="${immutable_image}" \
  SKIP_BUILD=1 \
    bash "${repo_root}/scripts/release/quipsly-schema-job.sh"
}

run_schema_job migrate
record_step "production-migrate-deploy" "PASSED" "Committed Prisma migrations applied from the pinned image."
run_schema_job status
record_step "production-status" "PASSED" "Production migration ledger is current."
run_schema_job diff
record_step "production-zero-diff" "PASSED" "Production and committed Prisma schemas have zero diff."

outcome="PASSED"
echo "PASS Production schema release ${source_sha} completed for ${target_confirmation}."
