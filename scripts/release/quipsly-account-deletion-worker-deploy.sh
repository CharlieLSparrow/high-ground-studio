#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'USAGE'
Usage:
  scripts/release/quipsly-account-deletion-worker-deploy.sh [options]

Options:
  --source <commit-ish>       Exact committed Nest image source (default: HEAD).
  --output <receipt.json>     Mode-0600 readiness receipt.
  --apply                     Configure IAM and deploy the private worker.
  --confirm-target <value>    Required with --apply; PROJECT/SERVICE.
  --help                      Show this help.

Without --apply this is the read-only worker readiness audit. Apply requires a
clean exact HEAD, an existing qualified source image, an enabled database
secret, and exact target confirmation. Completion email is mounted when both
provider and verified-sender secrets exist, but it never gates deletion. Apply may create the
dedicated service account and a random shared secret, grants only the worker's
provider roles plus Nest's private invoker/shared-secret access, deploys a
concurrency-1 private Cloud Run service, and performs no account deletion.
USAGE
}

fail() {
  echo "FAIL $*" >&2
  exit 1
}

apply=0
source_ref="HEAD"
output_path=""
confirmed_target=""
project_id="${PROJECT_ID:-high-ground-odyssey}"
firebase_project_id="${FIREBASE_PROJECT_ID:-quipsly-reef}"
region="${REGION:-us-central1}"
service="${ACCOUNT_DELETION_WORKER_SERVICE:-quipsly-account-deletion-worker}"
worker_service_account="${ACCOUNT_DELETION_WORKER_SERVICE_ACCOUNT:-quipsly-account-deletion-worker@${project_id}.iam.gserviceaccount.com}"
nest_service_account="${NEST_SERVICE_ACCOUNT:-studio-cloud-run@${project_id}.iam.gserviceaccount.com}"
bucket="${QUIPSLY_ACCOUNT_DELETION_GCS_BUCKETS:-high-ground-odyssey-media}"
database_secret="${ACCOUNT_DELETION_DATABASE_SECRET:-studio-database-url}"
resend_secret="${ACCOUNT_DELETION_RESEND_SECRET:-quipsly-resend-api-key}"
sender_secret="${ACCOUNT_DELETION_SENDER_SECRET:-quipsly-email-from}"
shared_secret="${ACCOUNT_DELETION_WORKER_SECRET_NAME:-quipsly-account-deletion-worker-shared-secret}"
sql_instance="${SQL_INSTANCE:-high-ground-odyssey:us-central1:studio-postgres}"
image_repository="${ACCOUNT_DELETION_IMAGE_REPOSITORY:-${region}-docker.pkg.dev/${project_id}/high-ground-studio/studio}"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --source|--output|--confirm-target)
      [[ $# -ge 2 ]] || { echo "$1 requires a value." >&2; exit 2; }
      case "$1" in
        --source) source_ref="$2" ;;
        --output) output_path="$2" ;;
        --confirm-target) confirmed_target="$2" ;;
      esac
      shift 2
      ;;
    --apply)
      apply=1
      shift
      ;;
    --help|-h)
      usage
      exit 0
      ;;
    *)
      usage >&2
      echo "Unknown option: $1" >&2
      exit 2
      ;;
  esac
done

repo_root="$(git rev-parse --show-toplevel)"
source_sha="$(git -C "${repo_root}" rev-parse --verify "${source_ref}^{commit}")"
target_confirmation="${project_id}/${service}"
if [[ -z "${output_path}" ]]; then
  output_path="${TMPDIR:-/tmp}/quipsly-account-deletion-worker-${source_sha:0:12}.json"
fi

readiness_args=(
  --source "${source_sha}"
  --project "${project_id}"
  --firebase-project "${firebase_project_id}"
  --region "${region}"
  --service "${service}"
  --bucket "${bucket}"
  --worker-service-account "${worker_service_account}"
  --nest-service-account "${nest_service_account}"
  --database-secret "${database_secret}"
  --resend-secret "${resend_secret}"
  --sender-secret "${sender_secret}"
  --shared-secret "${shared_secret}"
  --image-repository "${image_repository}"
  --output "${output_path}"
)

if [[ "${apply}" != "1" ]]; then
  exec node "${repo_root}/scripts/release/quipsly-account-deletion-worker-readiness.mjs" \
    "${readiness_args[@]}"
fi

[[ "${confirmed_target}" == "${target_confirmation}" ]] \
  || fail "--apply requires --confirm-target ${target_confirmation}."
[[ "${source_sha}" == "$(git -C "${repo_root}" rev-parse HEAD)" ]] \
  || fail "Apply requires --source to resolve to the current HEAD."
[[ -z "$(git -C "${repo_root}" status --porcelain)" ]] \
  || fail "Apply requires a clean checkout."
[[ "${project_id}" =~ ^[a-z][a-z0-9-]{4,28}[a-z0-9]$ ]] \
  || fail "Unsafe project ID."
[[ "${bucket}" =~ ^[a-z0-9][a-z0-9._-]{1,220}[a-z0-9]$ ]] \
  || fail "Unsafe deletion bucket."
[[ "${sql_instance}" == "${project_id}:${region}:"* ]] \
  || fail "Cloud SQL instance must belong to ${project_id}/${region}."

image_uri="${image_repository}:source-${source_sha}"
image_digest="$(
  gcloud artifacts docker images describe "${image_uri}" \
    --project="${project_id}" \
    --format='value(image_summary.digest)'
)"
[[ "${image_digest}" =~ ^sha256:[0-9a-f]{64}$ ]] \
  || fail "Qualified exact-source image is unavailable: ${image_uri}."
immutable_image="${image_repository}@${image_digest}"

if ! gcloud secrets versions describe latest \
  --secret="${database_secret}" \
  --project="${project_id}" \
  --format='value(state)' | grep -qx 'ENABLED'; then
  fail "Required secret ${database_secret}:latest is missing or disabled."
fi

completion_email_secret_mounts=""
completion_email_secrets=()
resend_state="$(gcloud secrets versions describe latest --secret="${resend_secret}" --project="${project_id}" --format='value(state)' 2>/dev/null || true)"
sender_state="$(gcloud secrets versions describe latest --secret="${sender_secret}" --project="${project_id}" --format='value(state)' 2>/dev/null || true)"
if [[ "${resend_state}" == "ENABLED" && "${sender_state}" == "ENABLED" ]]; then
  completion_email_secrets=("${resend_secret}" "${sender_secret}")
  completion_email_secret_mounts=",QUIPSLY_ACCOUNT_DELETION_RESEND_API_KEY=${resend_secret}:latest,QUIPSLY_ACCOUNT_DELETION_EMAIL_FROM=${sender_secret}:latest"
  echo "Account-deletion completion email will be enabled."
elif [[ -n "${resend_state}" || -n "${sender_state}" ]]; then
  fail "Completion email is partially configured. Enable both ${resend_secret} and ${sender_secret}, or leave both absent."
else
  echo "Account-deletion completion email is not configured; deletion remains enabled and receipts record that state."
fi

if ! gcloud secrets describe "${shared_secret}" \
  --project="${project_id}" --format='value(name)' >/dev/null 2>&1; then
  gcloud secrets create "${shared_secret}" \
    --project="${project_id}" \
    --replication-policy=automatic \
    --quiet
fi
if ! gcloud secrets versions describe latest \
  --secret="${shared_secret}" \
  --project="${project_id}" \
  --format='value(state)' 2>/dev/null | grep -qx 'ENABLED'; then
  openssl rand -base64 48 | tr -d '\n' | gcloud secrets versions add "${shared_secret}" \
    --project="${project_id}" \
    --data-file=- \
    --quiet >/dev/null
  echo "Created a random account-deletion worker shared-secret version without printing it."
fi

worker_account_name="${worker_service_account%%@*}"
if ! gcloud iam service-accounts describe "${worker_service_account}" \
  --project="${project_id}" --format='value(email)' >/dev/null 2>&1; then
  gcloud iam service-accounts create "${worker_account_name}" \
    --project="${project_id}" \
    --display-name="Quipsly account deletion worker" \
    --quiet
fi

gcloud projects add-iam-policy-binding "${project_id}" \
  --member="serviceAccount:${worker_service_account}" \
  --role=roles/cloudsql.client \
  --condition=None \
  --quiet >/dev/null
gcloud projects add-iam-policy-binding "${firebase_project_id}" \
  --member="serviceAccount:${worker_service_account}" \
  --role=roles/firebaseauth.admin \
  --condition=None \
  --quiet >/dev/null
gcloud storage buckets add-iam-policy-binding "gs://${bucket}" \
  --member="serviceAccount:${worker_service_account}" \
  --role=roles/storage.objectUser \
  --quiet >/dev/null

for secret_name in "${database_secret}" "${shared_secret}" "${completion_email_secrets[@]}"; do
  gcloud secrets add-iam-policy-binding "${secret_name}" \
    --project="${project_id}" \
    --member="serviceAccount:${worker_service_account}" \
    --role=roles/secretmanager.secretAccessor \
    --condition=None \
    --quiet >/dev/null
done
gcloud secrets add-iam-policy-binding "${shared_secret}" \
  --project="${project_id}" \
  --member="serviceAccount:${nest_service_account}" \
  --role=roles/secretmanager.secretAccessor \
  --condition=None \
  --quiet >/dev/null

gcloud run deploy "${service}" \
  --project="${project_id}" \
  --region="${region}" \
  --image="${immutable_image}" \
  --service-account="${worker_service_account}" \
  --set-cloudsql-instances="${sql_instance}" \
  --set-secrets="DATABASE_URL=${database_secret}:latest,QUIPSLY_ACCOUNT_DELETION_WORKER_SHARED_SECRET=${shared_secret}:latest${completion_email_secret_mounts}" \
  --set-env-vars="QUIPSLY_ACCOUNT_DELETION_WORKER_MODE=true,QUIPSLY_ACCOUNT_DELETION_EXECUTOR_ENABLED=true,QUIPSLY_ACCOUNT_DELETION_GCS_BUCKETS=${bucket},FIREBASE_PROJECT_ID=${firebase_project_id},QUIPSLY_SOURCE_SHA=${source_sha},QUIPSLY_ACCOUNT_DELETION_WORKER_MIN_INSTANCES=0" \
  --concurrency=1 \
  --min=0 \
  --max=1 \
  --timeout=900 \
  --ingress=all \
  --no-allow-unauthenticated \
  --quiet

gcloud run services add-iam-policy-binding "${service}" \
  --project="${project_id}" \
  --region="${region}" \
  --member="serviceAccount:${nest_service_account}" \
  --role=roles/run.invoker \
  --condition=None \
  --quiet >/dev/null

set +e
node "${repo_root}/scripts/release/quipsly-account-deletion-worker-readiness.mjs" \
  "${readiness_args[@]}" >/dev/null
readiness_status=$?
set -e
[[ "${readiness_status}" -eq 2 ]] \
  || fail "Post-deploy worker readiness did not return the expected manual-gate exit 2."
MACHINE_CHECKS="$(jq -r '.machineChecksPassed' "${output_path}")"
[[ "${MACHINE_CHECKS}" == "true" ]] \
  || fail "Post-deploy worker machine checks are not all green; inspect ${output_path}."

echo "PASS Dedicated private account deletion worker is machine-ready at ${source_sha}."
echo "BLOCKED No account was deleted. Production schema and disposable-account proof remain explicit separate gates."
echo "Receipt: ${output_path}"
