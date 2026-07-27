#!/usr/bin/env bash
set -euo pipefail

project_id="${PROJECT_ID:-$(gcloud config get-value project 2>/dev/null || true)}"
region="${REGION:-us-central1}"
job_name="${JOB_NAME:-quipsly-media-processor}"
media_bucket="${QUIPSLY_MEDIA_BUCKET:-}"
nest_service_name="${NEST_SERVICE_NAME:-studio}"
processor_service_account="${PROCESSOR_SERVICE_ACCOUNT:-quipsly-media-processor@${project_id}.iam.gserviceaccount.com}"
scheduler_service_account="${SCHEDULER_SERVICE_ACCOUNT:-quipsly-media-processor-scheduler@${project_id}.iam.gserviceaccount.com}"
nest_service_account="${NEST_INVOKER_SERVICE_ACCOUNT:-}"
scheduler_job_name="${SCHEDULER_JOB_NAME:-quipsly-media-processor-sweep}"
scheduler_region="${SCHEDULER_REGION:-${region}}"
scheduler_schedule="${SCHEDULER_SCHEDULE:-*/5 * * * *}"
apply="${APPLY:-0}"
phase="${PHASE:-all}"

if [[ -z "${project_id}" || -z "${media_bucket}" ]]; then
  echo "PROJECT_ID and QUIPSLY_MEDIA_BUCKET are required." >&2
  exit 2
fi
if [[ ! "${project_id}" =~ ^[a-z][a-z0-9-]{4,62}$ ]] \
  || [[ ! "${media_bucket}" =~ ^[a-z0-9][a-z0-9._-]{1,220}[a-z0-9]$ ]] \
  || [[ ! "${job_name}" =~ ^[a-z][a-z0-9-]{0,62}$ ]]; then
  echo "Project, bucket, or job name is unsafe." >&2
  exit 2
fi
if [[ "${phase}" != "prepare" && "${phase}" != "activate" && "${phase}" != "all" ]]; then
  echo "PHASE must be prepare, activate, or all." >&2
  exit 2
fi

if [[ -z "${nest_service_account}" ]]; then
  nest_service_account="$(
    gcloud run services describe "${nest_service_name}" \
      --project="${project_id}" \
      --region="${region}" \
      --format='value(spec.template.spec.serviceAccountName)'
  )"
fi
for account in \
  "${processor_service_account}" \
  "${scheduler_service_account}" \
  "${nest_service_account}"; do
  if [[ ! "${account}" =~ ^[a-z0-9][a-z0-9-]{4,28}@[a-z][a-z0-9-]{4,62}\.iam\.gserviceaccount\.com$ ]]; then
    echo "Invalid service-account email: ${account:-<missing>}" >&2
    exit 2
  fi
done

uniform_access="$(
  gcloud storage buckets describe "gs://${media_bucket}" \
    --format='value(iamConfiguration.uniformBucketLevelAccess.enabled)'
)"
if [[ "${uniform_access}" != "True" && "${uniform_access}" != "true" ]]; then
  echo "The media bucket must use uniform bucket-level access." >&2
  exit 1
fi

ensure_service_account() {
  local email="$1"
  local display_name="$2"
  if gcloud iam service-accounts describe "${email}" \
    --project="${project_id}" >/dev/null 2>&1; then
    return
  fi
  if [[ "${apply}" != "1" ]]; then
    echo "Missing service account: ${email}. Re-run with APPLY=1." >&2
    exit 1
  fi
  gcloud iam service-accounts create "${email%%@*}" \
    --project="${project_id}" \
    --display-name="${display_name}" \
    --quiet
}

ensure_managed_folder() {
  local folder="$1"
  if gcloud storage managed-folders describe \
    "gs://${media_bucket}/${folder}" >/dev/null 2>&1; then
    return
  fi
  if [[ "${apply}" != "1" ]]; then
    echo "Missing managed folder: gs://${media_bucket}/${folder}" >&2
    exit 1
  fi
  gcloud storage managed-folders create \
    "gs://${media_bucket}/${folder}" \
    --quiet
}

ensure_binding() {
  local folder="$1"
  local member="$2"
  local role="$3"
  if [[ "${apply}" == "1" ]]; then
    gcloud storage managed-folders add-iam-policy-binding \
      "gs://${media_bucket}/${folder}" \
      --member="${member}" \
      --role="${role}" \
      --quiet >/dev/null
  fi
  local policy
  policy="$(
    gcloud storage managed-folders get-iam-policy \
      "gs://${media_bucket}/${folder}" \
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

ensure_service_account \
  "${processor_service_account}" \
  "Quipsly capture proxy processor"
ensure_service_account \
  "${scheduler_service_account}" \
  "Quipsly capture proxy scheduler"

recordings_folder="media-vault/recordings/"
control_folder="media-vault/control/capture-proxy/"
proxy_folder="media-vault/proxy/"
for folder in \
  "${recordings_folder}" \
  "${control_folder}" \
  "${proxy_folder}"; do
  ensure_managed_folder "${folder}"
done

ensure_binding \
  "${recordings_folder}" \
  "serviceAccount:${processor_service_account}" \
  "roles/storage.objectViewer"
ensure_binding \
  "${control_folder}" \
  "serviceAccount:${processor_service_account}" \
  "roles/storage.objectUser"
ensure_binding \
  "${proxy_folder}" \
  "serviceAccount:${processor_service_account}" \
  "roles/storage.objectUser"
ensure_binding \
  "${control_folder}" \
  "serviceAccount:${nest_service_account}" \
  "roles/storage.objectUser"
ensure_binding \
  "${proxy_folder}" \
  "serviceAccount:${nest_service_account}" \
  "roles/storage.objectViewer"

if [[ "${apply}" == "1" && ( "${phase}" == "activate" || "${phase}" == "all" ) ]]; then
  for invoker in "${nest_service_account}" "${scheduler_service_account}"; do
    gcloud run jobs add-iam-policy-binding "${job_name}" \
      --project="${project_id}" \
      --region="${region}" \
      --member="serviceAccount:${invoker}" \
      --role="roles/run.jobsExecutor" \
      --quiet >/dev/null
  done
  gcloud services enable cloudscheduler.googleapis.com \
    --project="${project_id}" \
    --quiet
  scheduler_uri="https://run.googleapis.com/v2/projects/${project_id}/locations/${region}/jobs/${job_name}:run"
  scheduler_args=(
    "${scheduler_job_name}"
    "--project=${project_id}"
    "--location=${scheduler_region}"
    "--schedule=${scheduler_schedule}"
    "--time-zone=Etc/UTC"
    "--uri=${scheduler_uri}"
    "--http-method=POST"
    "--message-body={}"
    "--headers=Content-Type=application/json"
    "--oauth-service-account-email=${scheduler_service_account}"
    "--oauth-token-scope=https://www.googleapis.com/auth/cloud-platform"
    "--attempt-deadline=60s"
    "--max-retry-attempts=3"
    "--min-backoff=30s"
    "--max-backoff=10m"
    "--max-doublings=3"
    "--quiet"
  )
  if gcloud scheduler jobs describe "${scheduler_job_name}" \
    --project="${project_id}" \
    --location="${scheduler_region}" >/dev/null 2>&1; then
    gcloud scheduler jobs update http "${scheduler_args[@]}"
  else
    gcloud scheduler jobs create http "${scheduler_args[@]}"
  fi
fi

if [[ "${phase}" == "prepare" ]]; then
  echo "PASS Processor service accounts and storage access match the least-privilege contract."
  exit 0
fi

job_policy="$(
  gcloud run jobs get-iam-policy "${job_name}" \
    --project="${project_id}" \
    --region="${region}" \
    --format=json
)"
POLICY_JSON="${job_policy}" \
NEST_MEMBER="serviceAccount:${nest_service_account}" \
SCHEDULER_MEMBER="serviceAccount:${scheduler_service_account}" \
node <<'NODE'
const policy = JSON.parse(process.env.POLICY_JSON || "{}");
for (const member of [process.env.NEST_MEMBER, process.env.SCHEDULER_MEMBER]) {
  const executor = (policy.bindings || []).some(
    (binding) =>
      binding.role === "roles/run.jobsExecutor"
      && (binding.members || []).includes(member),
  );
  const override = (policy.bindings || []).some(
    (binding) =>
      binding.role === "roles/run.jobsExecutorWithOverrides"
      && (binding.members || []).includes(member),
  );
  if (!executor || override) {
    throw new Error(`Unsafe or missing job execution role for ${member}.`);
  }
}
NODE

scheduler_json="$(
  gcloud scheduler jobs describe "${scheduler_job_name}" \
    --project="${project_id}" \
    --location="${scheduler_region}" \
    --format=json
)"
SCHEDULER_JSON="${scheduler_json}" \
EXPECTED_URI="https://run.googleapis.com/v2/projects/${project_id}/locations/${region}/jobs/${job_name}:run" \
EXPECTED_ACCOUNT="${scheduler_service_account}" \
EXPECTED_SCHEDULE="${scheduler_schedule}" \
node <<'NODE'
const scheduler = JSON.parse(process.env.SCHEDULER_JSON || "{}");
const target = scheduler.httpTarget || {};
const body = target.body
  ? Buffer.from(target.body, "base64").toString("utf8")
  : "";
const failures = [];
if (target.uri !== process.env.EXPECTED_URI) failures.push("URI");
if (target.oauthToken?.serviceAccountEmail !== process.env.EXPECTED_ACCOUNT) {
  failures.push("service account");
}
if (scheduler.schedule !== process.env.EXPECTED_SCHEDULE) failures.push("schedule");
if (body !== "{}") failures.push("body");
if (failures.length) {
  throw new Error(`Processor scheduler readback mismatch: ${failures.join(", ")}`);
}
NODE

echo "PASS Processor storage, invoker, and recovery-sweep access match the least-privilege contract."
