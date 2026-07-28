#!/usr/bin/env bash
set -euo pipefail

project_id="${PROJECT_ID:-$(gcloud config get-value project 2>/dev/null || true)}"
region="${REGION:-us-central1}"
service_name="${NEST_SERVICE_NAME:-studio}"
media_bucket="${QUIPSLY_MEDIA_BUCKET:-high-ground-odyssey-media}"
apply="${APPLY:-0}"

if [[ "${apply}" != "0" && "${apply}" != "1" ]]; then
  echo "APPLY must be 0 or 1." >&2
  exit 2
fi
if [[ ! "${project_id}" =~ ^[a-z][a-z0-9-]{4,62}$ ]] \
  || [[ ! "${media_bucket}" =~ ^[a-z0-9][a-z0-9._-]{1,220}[a-z0-9]$ ]] \
  || [[ ! "${service_name}" =~ ^[a-z][a-z0-9-]{0,62}$ ]]; then
  echo "Project, media bucket, or Nest service name is unsafe." >&2
  exit 2
fi

nest_service_account="$(
  gcloud run services describe "${service_name}" \
    --project="${project_id}" \
    --region="${region}" \
    --format='value(spec.template.spec.serviceAccountName)'
)"
if [[ ! "${nest_service_account}" =~ ^[a-z0-9][a-z0-9-]{4,28}@[a-z][a-z0-9-]{4,62}\.iam\.gserviceaccount\.com$ ]]; then
  echo "Nest runtime service account is missing or invalid: ${nest_service_account:-<missing>}" >&2
  exit 1
fi

uniform_access="$(
  gcloud storage buckets describe "gs://${media_bucket}" \
    --project="${project_id}" \
    --format='value(uniform_bucket_level_access)'
)"
if [[ -z "${uniform_access}" ]]; then
  # Compatibility with older gcloud storage describe schemas.
  uniform_access="$(
    gcloud storage buckets describe "gs://${media_bucket}" \
      --project="${project_id}" \
      --format='value(iamConfiguration.uniformBucketLevelAccess.enabled)'
  )"
fi
if [[ "${uniform_access}" != "True" && "${uniform_access}" != "true" ]]; then
  echo "The Quipsly media vault must use uniform bucket-level access." >&2
  exit 1
fi

ensure_managed_folder() {
  local folder="$1"
  if gcloud storage managed-folders describe \
    "gs://${media_bucket}/${folder}" \
    --project="${project_id}" >/dev/null 2>&1; then
    return
  fi
  if [[ "${apply}" != "1" ]]; then
    echo "Missing managed folder: gs://${media_bucket}/${folder}" >&2
    exit 1
  fi
  gcloud storage managed-folders create \
    "gs://${media_bucket}/${folder}" \
    --project="${project_id}" \
    --quiet
}

ensure_binding() {
  local folder="$1"
  local role="$2"
  local member="serviceAccount:${nest_service_account}"
  if [[ "${apply}" == "1" ]]; then
    gcloud storage managed-folders add-iam-policy-binding \
      "gs://${media_bucket}/${folder}" \
      --project="${project_id}" \
      --member="${member}" \
      --role="${role}" \
      --quiet >/dev/null
  fi

  local policy
  policy="$(
    gcloud storage managed-folders get-iam-policy \
      "gs://${media_bucket}/${folder}" \
      --project="${project_id}" \
      --format=json
  )"
  POLICY_JSON="${policy}" EXPECTED_MEMBER="${member}" EXPECTED_ROLE="${role}" \
  node <<'NODE'
const policy = JSON.parse(process.env.POLICY_JSON || "{}");
const matched = (policy.bindings || []).some(
  (binding) =>
    binding.role === process.env.EXPECTED_ROLE
    && (binding.members || []).includes(process.env.EXPECTED_MEMBER),
);
if (!matched) {
  throw new Error(
    `Missing ${process.env.EXPECTED_ROLE} for ${process.env.EXPECTED_MEMBER}.`,
  );
}
NODE
}

recordings_folder="media-vault/recordings/"
manifest_folder="media-vault/control/mobile-capture-resumable/"
verification_queue_folder="media-vault/control/mobile-capture-verification-queue/"

for folder in \
  "${recordings_folder}" \
  "${manifest_folder}" \
  "${verification_queue_folder}"; do
  ensure_managed_folder "${folder}"
done

# Recording objects are immutable: Nest may create and verify them, but this
# contract deliberately grants no overwrite or delete permission.
ensure_binding "${recordings_folder}" "roles/storage.objectCreator"
ensure_binding "${recordings_folder}" "roles/storage.objectViewer"

# Control manifests are generation-preconditioned state machines and therefore
# need scoped update access. Long-video queue receipts use the same constraint.
ensure_binding "${manifest_folder}" "roles/storage.objectUser"
ensure_binding "${verification_queue_folder}" "roles/storage.objectUser"

echo "PASS Nest mobile-capture media IAM matches the managed-folder contract."
