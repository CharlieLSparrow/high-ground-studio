#!/usr/bin/env bash
set -euo pipefail

project_id="${PROJECT_ID:-$(gcloud config get-value project 2>/dev/null || true)}"
region="${REGION:-us-central1}"
job_name="${JOB_NAME:-quipsly-transcript-worker}"
media_bucket="${QUIPSLY_MEDIA_BUCKET:-}"
deepgram_secret="${DEEPGRAM_SECRET:-quipsly-deepgram-api-key}"
transcript_provider="${TRANSCRIPT_PROVIDER:-deepgram}"
nest_service_name="${NEST_SERVICE_NAME:-studio}"
worker_account="${TRANSCRIPT_SERVICE_ACCOUNT:-quipsly-transcript-worker@${project_id}.iam.gserviceaccount.com}"
scheduler_account="${SCHEDULER_SERVICE_ACCOUNT:-quipsly-transcript-scheduler@${project_id}.iam.gserviceaccount.com}"
nest_account="${NEST_INVOKER_SERVICE_ACCOUNT:-}"
scheduler_job_name="${SCHEDULER_JOB_NAME:-quipsly-transcript-recovery}"
scheduler_region="${SCHEDULER_REGION:-${region}}"
scheduler_schedule="${SCHEDULER_SCHEDULE:-*/5 * * * *}"
apply="${APPLY:-0}"
phase="${PHASE:-all}"

if [[ -z "${project_id}" || -z "${media_bucket}" ]]; then
  echo "PROJECT_ID and QUIPSLY_MEDIA_BUCKET are required." >&2
  exit 2
fi
if [[ "${transcript_provider}" != "deepgram" && "${transcript_provider}" != "google-speech-v2" ]]; then
  echo "TRANSCRIPT_PROVIDER must be deepgram or google-speech-v2." >&2
  exit 2
fi
if [[ "${phase}" != "prepare" \
  && "${phase}" != "activate" \
  && "${phase}" != "all" ]]; then
  echo "PHASE must be prepare, activate, or all." >&2
  exit 2
fi
if [[ -z "${nest_account}" ]]; then
  nest_account="$(
    gcloud run services describe "${nest_service_name}" \
      --project="${project_id}" \
      --region="${region}" \
      --format='value(spec.template.spec.serviceAccountName)'
  )"
fi
for account in "${worker_account}" "${scheduler_account}" "${nest_account}"; do
  if [[ ! "${account}" =~ ^[a-z0-9][a-z0-9-]{4,28}@[a-z][a-z0-9-]{4,62}\.iam\.gserviceaccount\.com$ ]]; then
    echo "Invalid service-account email: ${account:-<missing>}" >&2
    exit 2
  fi
done

uniform_access="$(
  gcloud storage buckets describe "gs://${media_bucket}" \
    --format='value(uniform_bucket_level_access)'
)"
if [[ -z "${uniform_access}" ]]; then
  uniform_access="$(
    gcloud storage buckets describe "gs://${media_bucket}" \
      --format='value(iamConfiguration.uniformBucketLevelAccess.enabled)'
  )"
fi
if [[ "${uniform_access}" != "True" \
  && "${uniform_access}" != "true" ]]; then
  echo "The media bucket must use uniform bucket-level access." >&2
  exit 1
fi

if [[ "${transcript_provider}" == "deepgram" ]]; then
  if ! gcloud secrets describe "${deepgram_secret}" \
    --project="${project_id}" >/dev/null 2>&1; then
    echo "Missing Secret Manager secret: ${deepgram_secret}" >&2
    echo "Create it and add an enabled version without placing the value in git or shell history." >&2
    exit 1
  fi
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

ensure_folder_binding() {
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
  POLICY_JSON="${policy}" \
  EXPECTED_MEMBER="${member}" \
  EXPECTED_ROLE="${role}" \
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

assert_policy_has_no_mutating_role() {
  local policy_json="$1"
  local scope="$2"
  shift 2
  POLICY_JSON="${policy_json}" \
  POLICY_SCOPE="${scope}" \
  POLICY_MEMBERS="$(printf '%s\n' "$@")" \
  node <<'NODE'
const policy = JSON.parse(process.env.POLICY_JSON || "{}");
const members = new Set(
  (process.env.POLICY_MEMBERS || "").split("\n").filter(Boolean),
);
const mutatingRoles = new Set([
  "roles/editor",
  "roles/owner",
  "roles/storage.admin",
  "roles/storage.folderAdmin",
  "roles/storage.objectAdmin",
  "roles/storage.objectUser",
  "roles/storage.legacyBucketOwner",
  "roles/storage.legacyObjectOwner",
]);
const unsafe = (policy.bindings || []).flatMap((binding) =>
  mutatingRoles.has(binding.role)
    ? (binding.members || [])
      .filter((member) => members.has(member))
      .map((member) => `${binding.role} for ${member}`)
    : [],
);
if (unsafe.length) {
  throw new Error(
    `Unsafe inherited transcript mutation at ${process.env.POLICY_SCOPE}: `
      + unsafe.join(", "),
  );
}
NODE
}

ensure_service_account \
  "${worker_account}" \
  "Quipsly transcript worker"
ensure_service_account \
  "${scheduler_account}" \
  "Quipsly transcript recovery scheduler"

recordings_folder="media-vault/recordings/"
manifests_folder="media-vault/control/transcript/manifests/"
queue_folder="media-vault/control/transcript/queue/"
results_folder="media-vault/control/transcript/results/"
provider_responses_folder="media-vault/control/transcript/provider-responses/"
dead_letter_folder="media-vault/control/transcript/dead-letter/"

# Child managed-folder grants are additive. Refuse to claim append-only
# evidence if either runtime identity already inherits mutation authority from
# the project, bucket, or a transcript ancestor.
runtime_members=(
  "serviceAccount:${worker_account}"
  "serviceAccount:${nest_account}"
)
project_policy="$(
  gcloud projects get-iam-policy "${project_id}" --format=json
)"
assert_policy_has_no_mutating_role \
  "${project_policy}" \
  "project ${project_id}" \
  "${runtime_members[@]}"
bucket_policy="$(
  gcloud storage buckets get-iam-policy "gs://${media_bucket}" --format=json
)"
assert_policy_has_no_mutating_role \
  "${bucket_policy}" \
  "bucket gs://${media_bucket}" \
  "${runtime_members[@]}"
for ancestor in \
  "media-vault/" \
  "media-vault/control/" \
  "media-vault/control/transcript/"; do
  if gcloud storage managed-folders describe \
    "gs://${media_bucket}/${ancestor}" >/dev/null 2>&1; then
    ancestor_policy="$(
      gcloud storage managed-folders get-iam-policy \
        "gs://${media_bucket}/${ancestor}" \
        --format=json
    )"
    assert_policy_has_no_mutating_role \
      "${ancestor_policy}" \
      "managed folder gs://${media_bucket}/${ancestor}" \
      "${runtime_members[@]}"
  fi
done

ensure_managed_folder "${recordings_folder}"
for folder in \
  "${manifests_folder}" \
  "${queue_folder}" \
  "${results_folder}" \
  "${provider_responses_folder}" \
  "${dead_letter_folder}"; do
  ensure_managed_folder "${folder}"
done
ensure_folder_binding \
  "${recordings_folder}" \
  "serviceAccount:${worker_account}" \
  "roles/storage.objectViewer"

# Mutable coordination state is isolated from append-only evidence. The worker
# may claim/update manifests and retire queue entries, but it cannot overwrite
# or delete an existing provider response or normalized result.
ensure_folder_binding \
  "${manifests_folder}" \
  "serviceAccount:${worker_account}" \
  "roles/storage.objectUser"
ensure_folder_binding \
  "${queue_folder}" \
  "serviceAccount:${worker_account}" \
  "roles/storage.objectUser"
for folder in \
  "${results_folder}" \
  "${provider_responses_folder}" \
  "${dead_letter_folder}"; do
  ensure_folder_binding \
    "${folder}" \
    "serviceAccount:${worker_account}" \
    "roles/storage.objectCreator"
  ensure_folder_binding \
    "${folder}" \
    "serviceAccount:${worker_account}" \
    "roles/storage.objectViewer"
done

# Nest creates the immutable request receipts and reads completion evidence. It
# does not receive delete or update authority anywhere in the transcript tree.
for folder in "${manifests_folder}" "${queue_folder}"; do
  ensure_folder_binding \
    "${folder}" \
    "serviceAccount:${nest_account}" \
    "roles/storage.objectCreator"
  ensure_folder_binding \
    "${folder}" \
    "serviceAccount:${nest_account}" \
    "roles/storage.objectViewer"
done
ensure_folder_binding \
  "${results_folder}" \
  "serviceAccount:${nest_account}" \
  "roles/storage.objectViewer"
for folder in \
  "${results_folder}" \
  "${provider_responses_folder}" \
  "${dead_letter_folder}"; do
  append_only_policy="$(
    gcloud storage managed-folders get-iam-policy \
      "gs://${media_bucket}/${folder}" \
      --format=json
  )"
  assert_policy_has_no_mutating_role \
    "${append_only_policy}" \
    "append-only managed folder gs://${media_bucket}/${folder}" \
    "${runtime_members[@]}"
done

if [[ "${apply}" == "1" && "${transcript_provider}" == "deepgram" ]]; then
  gcloud secrets add-iam-policy-binding "${deepgram_secret}" \
    --project="${project_id}" \
    --member="serviceAccount:${worker_account}" \
    --role="roles/secretmanager.secretAccessor" \
    --quiet >/dev/null
fi
if [[ "${transcript_provider}" == "deepgram" ]]; then
  secret_policy="$(
    gcloud secrets get-iam-policy "${deepgram_secret}" \
      --project="${project_id}" \
      --format=json
  )"
  POLICY_JSON="${secret_policy}" \
  EXPECTED_MEMBER="serviceAccount:${worker_account}" \
  node <<'NODE'
const policy = JSON.parse(process.env.POLICY_JSON || "{}");
const accessor = (policy.bindings || []).some(
  (binding) =>
    binding.role === "roles/secretmanager.secretAccessor"
    && (binding.members || []).includes(process.env.EXPECTED_MEMBER),
);
if (!accessor) throw new Error("Transcript worker cannot access the provider secret.");
NODE
else
  if [[ "${apply}" == "1" ]]; then
    gcloud projects add-iam-policy-binding "${project_id}" \
      --member="serviceAccount:${worker_account}" \
      --role="roles/speech.client" \
      --condition=None \
      --quiet >/dev/null
  fi
  project_speech_policy="$(
    gcloud projects get-iam-policy "${project_id}" --format=json
  )"
  POLICY_JSON="${project_speech_policy}" \
  EXPECTED_MEMBER="serviceAccount:${worker_account}" \
  node <<'NODE'
const policy = JSON.parse(process.env.POLICY_JSON || "{}");
const allowed = (policy.bindings || []).some(
  (binding) => binding.role === "roles/speech.client"
    && (binding.members || []).includes(process.env.EXPECTED_MEMBER),
);
if (!allowed) throw new Error("Transcript worker cannot call Speech-to-Text.");
NODE
fi

if [[ "${apply}" == "1" \
  && ( "${phase}" == "activate" || "${phase}" == "all" ) ]]; then
  for invoker in "${nest_account}" "${scheduler_account}"; do
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
    "--oauth-service-account-email=${scheduler_account}"
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
  echo "PASS Transcript worker storage and provider access match the least-privilege contract."
  exit 0
fi

job_policy="$(
  gcloud run jobs get-iam-policy "${job_name}" \
    --project="${project_id}" \
    --region="${region}" \
    --format=json
)"
POLICY_JSON="${job_policy}" \
NEST_MEMBER="serviceAccount:${nest_account}" \
SCHEDULER_MEMBER="serviceAccount:${scheduler_account}" \
node <<'NODE'
const policy = JSON.parse(process.env.POLICY_JSON || "{}");
for (const member of [
  process.env.NEST_MEMBER,
  process.env.SCHEDULER_MEMBER,
]) {
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
EXPECTED_ACCOUNT="${scheduler_account}" \
EXPECTED_SCHEDULE="${scheduler_schedule}" \
node <<'NODE'
const scheduler = JSON.parse(process.env.SCHEDULER_JSON || "{}");
const target = scheduler.httpTarget || {};
const body = target.body
  ? Buffer.from(target.body, "base64").toString("utf8")
  : "";
const failures = [];
if (target.uri !== process.env.EXPECTED_URI) failures.push("URI");
if (
  target.oauthToken?.serviceAccountEmail
  !== process.env.EXPECTED_ACCOUNT
) {
  failures.push("service account");
}
if (scheduler.schedule !== process.env.EXPECTED_SCHEDULE) {
  failures.push("schedule");
}
if (body !== "{}") failures.push("body");
if (failures.length) {
  throw new Error(
    `Transcript scheduler readback mismatch: ${failures.join(", ")}`,
  );
}
NODE

echo "PASS Transcript storage, provider, invoker, and recovery access match the least-privilege contract."
