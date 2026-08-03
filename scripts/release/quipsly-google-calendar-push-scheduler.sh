#!/usr/bin/env bash
set -euo pipefail

PROJECT_ID="${PROJECT_ID:-high-ground-odyssey}"
REGION="${REGION:-us-central1}"
SERVICE_NAME="${SERVICE_NAME:-studio}"
SCHEDULER_REGION="${SCHEDULER_REGION:-us-central1}"
SCHEDULER_JOB="${SCHEDULER_JOB:-quipsly-google-calendar-push}"
SCHEDULE="${SCHEDULE:-*/15 * * * *}"
SCHEDULER_SERVICE_ACCOUNT="${SCHEDULER_SERVICE_ACCOUNT:-quipsly-calendar-push@${PROJECT_ID}.iam.gserviceaccount.com}"

if [[ ! "${PROJECT_ID}" =~ ^[a-z][a-z0-9-]{4,62}$ ]] \
  || [[ ! "${REGION}" =~ ^[a-z][a-z0-9-]{0,62}$ ]] \
  || [[ ! "${SCHEDULER_REGION}" =~ ^[a-z][a-z0-9-]{0,62}$ ]] \
  || [[ ! "${SERVICE_NAME}" =~ ^[a-z][a-z0-9-]{0,62}$ ]] \
  || [[ ! "${SCHEDULER_JOB}" =~ ^[a-z][a-z0-9-]{0,62}$ ]] \
  || [[ ! "${SCHEDULER_SERVICE_ACCOUNT}" =~ ^[a-z0-9][a-z0-9-]{4,28}@[a-z][a-z0-9-]{4,62}\.iam\.gserviceaccount\.com$ ]]; then
  echo "Google Calendar scheduler project, region, service, job, or identity is unsafe." >&2
  exit 2
fi

service_url="$(
  gcloud run services describe "${SERVICE_NAME}" \
    --project="${PROJECT_ID}" \
    --region="${REGION}" \
    --format='value(status.url)'
)"
if [[ ! "${service_url}" =~ ^https://[a-z0-9-]+-[a-z0-9]+\.[a-z0-9-]+\.run\.app$ ]]; then
  echo "Could not resolve the immutable Cloud Run service audience." >&2
  exit 2
fi
target_uri="${service_url}/api/cron/google-calendar-push"
service_account_id="${SCHEDULER_SERVICE_ACCOUNT%%@*}"

gcloud services enable cloudscheduler.googleapis.com \
  --project="${PROJECT_ID}" \
  --quiet

if ! gcloud iam service-accounts describe "${SCHEDULER_SERVICE_ACCOUNT}" \
  --project="${PROJECT_ID}" >/dev/null 2>&1; then
  gcloud iam service-accounts create "${service_account_id}" \
    --project="${PROJECT_ID}" \
    --display-name="Quipsly Google Calendar push scheduler" \
    --quiet
fi

gcloud run services add-iam-policy-binding "${SERVICE_NAME}" \
  --project="${PROJECT_ID}" \
  --region="${REGION}" \
  --member="serviceAccount:${SCHEDULER_SERVICE_ACCOUNT}" \
  --role="roles/run.invoker" \
  --quiet >/dev/null

scheduler_args=(
  --project="${PROJECT_ID}"
  --location="${SCHEDULER_REGION}"
  --schedule="${SCHEDULE}"
  --time-zone="Etc/UTC"
  --uri="${target_uri}"
  --http-method=POST
  --oidc-service-account-email="${SCHEDULER_SERVICE_ACCOUNT}"
  --oidc-token-audience="${service_url}"
  --attempt-deadline=60s
  --max-retry-attempts=3
  --min-backoff=30s
  --max-backoff=5m
  --quiet
)
if gcloud scheduler jobs describe "${SCHEDULER_JOB}" \
  --project="${PROJECT_ID}" \
  --location="${SCHEDULER_REGION}" >/dev/null 2>&1; then
  gcloud scheduler jobs update http "${SCHEDULER_JOB}" "${scheduler_args[@]}"
else
  gcloud scheduler jobs create http "${SCHEDULER_JOB}" "${scheduler_args[@]}"
fi

job_json="$(
  gcloud scheduler jobs describe "${SCHEDULER_JOB}" \
    --project="${PROJECT_ID}" \
    --location="${SCHEDULER_REGION}" \
    --format=json
)"
JOB_JSON="${job_json}" \
EXPECTED_URI="${target_uri}" \
EXPECTED_AUDIENCE="${service_url}" \
EXPECTED_SERVICE_ACCOUNT="${SCHEDULER_SERVICE_ACCOUNT}" \
EXPECTED_SCHEDULE="${SCHEDULE}" \
node <<'NODE'
const job = JSON.parse(process.env.JOB_JSON || "{}");
const oidc = job.httpTarget?.oidcToken || {};
const failures = [];
if (job.httpTarget?.uri !== process.env.EXPECTED_URI) failures.push("target URI");
if (job.httpTarget?.httpMethod !== "POST") failures.push("HTTP method");
if (oidc.audience !== process.env.EXPECTED_AUDIENCE) failures.push("OIDC audience");
if (oidc.serviceAccountEmail !== process.env.EXPECTED_SERVICE_ACCOUNT) failures.push("OIDC service account");
if (job.schedule !== process.env.EXPECTED_SCHEDULE) failures.push("schedule");
if (JSON.stringify(job).includes("GOOGLE_CALENDAR_PUSH_WORKER_SECRET")) failures.push("embedded secret");
if (failures.length) {
  process.stderr.write(`Google Calendar scheduler readback failed: ${failures.join(", ")}\n`);
  process.exit(1);
}
process.stdout.write(JSON.stringify({
  ok: true,
  name: job.name,
  uri: job.httpTarget.uri,
  schedule: job.schedule,
  oidcServiceAccount: oidc.serviceAccountEmail,
  oidcAudience: oidc.audience,
}, null, 2) + "\n");
NODE
