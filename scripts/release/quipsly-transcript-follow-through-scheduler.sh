#!/usr/bin/env bash
set -euo pipefail

PROJECT_ID="${PROJECT_ID:-high-ground-odyssey}"
REGION="${REGION:-us-central1}"
SERVICE_NAME="${SERVICE_NAME:-studio}"
SCHEDULER_REGION="${SCHEDULER_REGION:-us-central1}"
SCHEDULER_JOB="${SCHEDULER_JOB:-quipsly-transcript-follow-through}"
SCHEDULE="${SCHEDULE:-*/2 * * * *}"
HELD_RELEASE_SCHEDULER_JOB="${HELD_RELEASE_SCHEDULER_JOB:-quipsly-capture-held-release}"
HELD_RELEASE_SCHEDULE="${HELD_RELEASE_SCHEDULE:-*/5 * * * *}"
SCHEDULER_SERVICE_ACCOUNT="${SCHEDULER_SERVICE_ACCOUNT:-quipsly-transcript-follow-through@${PROJECT_ID}.iam.gserviceaccount.com}"

if [[ ! "${PROJECT_ID}" =~ ^[a-z][a-z0-9-]{4,62}$ ]] \
  || [[ ! "${REGION}" =~ ^[a-z][a-z0-9-]{0,62}$ ]] \
  || [[ ! "${SCHEDULER_REGION}" =~ ^[a-z][a-z0-9-]{0,62}$ ]] \
  || [[ ! "${SERVICE_NAME}" =~ ^[a-z][a-z0-9-]{0,62}$ ]] \
  || [[ ! "${SCHEDULER_JOB}" =~ ^[a-z][a-z0-9-]{0,62}$ ]] \
  || [[ ! "${HELD_RELEASE_SCHEDULER_JOB}" =~ ^[a-z][a-z0-9-]{0,62}$ ]] \
  || [[ ! "${SCHEDULER_SERVICE_ACCOUNT}" =~ ^[a-z0-9][a-z0-9-]{4,28}@[a-z][a-z0-9-]{4,62}\.iam\.gserviceaccount\.com$ ]]; then
  echo "Transcript follow-through scheduler project, region, service, job, or identity is unsafe." >&2
  exit 2
fi

service_json="$(
  gcloud run services describe "${SERVICE_NAME}" \
    --project="${PROJECT_ID}" \
    --region="${REGION}" \
    --format=json
)"
read -r service_url live_revision < <(
  SERVICE_JSON="${service_json}" node <<'NODE'
const service = JSON.parse(process.env.SERVICE_JSON || "{}");
const live = (service.status?.traffic || []).filter(
  (entry) => Number(entry.percent || 0) === 100 && entry.revisionName,
);
if (live.length !== 1) {
  throw new Error("Transcript follow-through activation requires exactly one live revision.");
}
process.stdout.write(`${String(service.status?.url || "")} ${live[0].revisionName}\n`);
NODE
)
if [[ ! "${service_url}" =~ ^https://[a-z0-9-]+-[a-z0-9]+\.[a-z0-9-]+\.run\.app$ ]]; then
  echo "Could not resolve the immutable Cloud Run service audience." >&2
  exit 2
fi
if [[ ! "${live_revision}" =~ ^[a-z][a-z0-9-]{0,62}$ ]]; then
  echo "Could not resolve the immutable live Cloud Run revision." >&2
  exit 2
fi
target_uri="${service_url}/api/cron/capture-transcript-follow-through"
held_release_target_uri="${service_url}/api/cron/capture-held-release"
service_account_id="${SCHEDULER_SERVICE_ACCOUNT%%@*}"

live_revision_json="$(
  gcloud run revisions describe "${live_revision}" \
    --project="${PROJECT_ID}" \
    --region="${REGION}" \
    --format=json
)"
REVISION_JSON="${live_revision_json}" \
EXPECTED_AUDIENCE="${service_url}" \
EXPECTED_SERVICE_ACCOUNT="${SCHEDULER_SERVICE_ACCOUNT}" \
node <<'NODE'
const revision = JSON.parse(process.env.REVISION_JSON || "{}");
const env = Object.fromEntries(
  (revision.spec?.containers?.[0]?.env || []).map((entry) => [entry.name, entry.value]),
);
const failures = [];
if (env.CAPTURE_TRANSCRIPT_FOLLOW_THROUGH_AUDIENCE !== process.env.EXPECTED_AUDIENCE) {
  failures.push("live revision audience");
}
if (env.CAPTURE_TRANSCRIPT_FOLLOW_THROUGH_SERVICE_ACCOUNT !== process.env.EXPECTED_SERVICE_ACCOUNT) {
  failures.push("live revision service account");
}
if (failures.length) {
  throw new Error(`Transcript follow-through live revision mismatch: ${failures.join(", ")}`);
}
NODE

gcloud services enable cloudscheduler.googleapis.com \
  --project="${PROJECT_ID}" \
  --quiet

if ! gcloud iam service-accounts describe "${SCHEDULER_SERVICE_ACCOUNT}" \
  --project="${PROJECT_ID}" >/dev/null 2>&1; then
  gcloud iam service-accounts create "${service_account_id}" \
    --project="${PROJECT_ID}" \
    --display-name="Quipsly transcript follow-through scheduler" \
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

# Legacy preserved sources can require a full SHA-256 stream when their receipts
# predate GCS CRC32C retention. Keep that storage-heavy fallback in its own
# one-source request so it cannot consume the fast transcript deadline.
held_release_scheduler_args=(
  --project="${PROJECT_ID}"
  --location="${SCHEDULER_REGION}"
  --schedule="${HELD_RELEASE_SCHEDULE}"
  --time-zone="Etc/UTC"
  --uri="${held_release_target_uri}"
  --http-method=POST
  --oidc-service-account-email="${SCHEDULER_SERVICE_ACCOUNT}"
  --oidc-token-audience="${service_url}"
  --attempt-deadline=15m
  --max-retry-attempts=2
  --min-backoff=1m
  --max-backoff=10m
  --quiet
)
if gcloud scheduler jobs describe "${HELD_RELEASE_SCHEDULER_JOB}" \
  --project="${PROJECT_ID}" \
  --location="${SCHEDULER_REGION}" >/dev/null 2>&1; then
  gcloud scheduler jobs update http "${HELD_RELEASE_SCHEDULER_JOB}" "${held_release_scheduler_args[@]}"
else
  gcloud scheduler jobs create http "${HELD_RELEASE_SCHEDULER_JOB}" "${held_release_scheduler_args[@]}"
fi

# Updating a paused Cloud Scheduler job does not reliably resume it. A paused
# maintenance loop looks correctly configured but leaves completed transcripts
# waiting until somebody opens Sessions, so activation must restore liveness.
scheduler_state="$(
  gcloud scheduler jobs describe "${SCHEDULER_JOB}" \
    --project="${PROJECT_ID}" \
    --location="${SCHEDULER_REGION}" \
    --format='value(state)'
)"
if [[ "${scheduler_state}" == "PAUSED" ]]; then
  gcloud scheduler jobs resume "${SCHEDULER_JOB}" \
    --project="${PROJECT_ID}" \
    --location="${SCHEDULER_REGION}" \
    --quiet
fi

held_release_scheduler_state="$(
  gcloud scheduler jobs describe "${HELD_RELEASE_SCHEDULER_JOB}" \
    --project="${PROJECT_ID}" \
    --location="${SCHEDULER_REGION}" \
    --format='value(state)'
)"
if [[ "${held_release_scheduler_state}" == "PAUSED" ]]; then
  gcloud scheduler jobs resume "${HELD_RELEASE_SCHEDULER_JOB}" \
    --project="${PROJECT_ID}" \
    --location="${SCHEDULER_REGION}" \
    --quiet
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
if (job.state !== "ENABLED") failures.push("enabled state");
if (job.attemptDeadline !== "60s") failures.push("60-second attempt deadline");
if (JSON.stringify(job).includes("CAPTURE_TRANSCRIPT_FOLLOW_THROUGH_SECRET")) failures.push("embedded secret");
if (failures.length) {
  process.stderr.write(`Transcript follow-through scheduler readback failed: ${failures.join(", ")}\n`);
  process.exit(1);
}
process.stdout.write(JSON.stringify({
  ok: true,
  name: job.name,
  uri: job.httpTarget.uri,
  schedule: job.schedule,
  attemptDeadline: job.attemptDeadline,
  oidcServiceAccount: oidc.serviceAccountEmail,
  oidcAudience: oidc.audience,
}, null, 2) + "\n");
NODE

held_release_job_json="$(
  gcloud scheduler jobs describe "${HELD_RELEASE_SCHEDULER_JOB}" \
    --project="${PROJECT_ID}" \
    --location="${SCHEDULER_REGION}" \
    --format=json
)"
JOB_JSON="${held_release_job_json}" \
EXPECTED_URI="${held_release_target_uri}" \
EXPECTED_AUDIENCE="${service_url}" \
EXPECTED_SERVICE_ACCOUNT="${SCHEDULER_SERVICE_ACCOUNT}" \
EXPECTED_SCHEDULE="${HELD_RELEASE_SCHEDULE}" \
node <<'NODE'
const job = JSON.parse(process.env.JOB_JSON || "{}");
const oidc = job.httpTarget?.oidcToken || {};
const failures = [];
if (job.httpTarget?.uri !== process.env.EXPECTED_URI) failures.push("target URI");
if (job.httpTarget?.httpMethod !== "POST") failures.push("HTTP method");
if (oidc.audience !== process.env.EXPECTED_AUDIENCE) failures.push("OIDC audience");
if (oidc.serviceAccountEmail !== process.env.EXPECTED_SERVICE_ACCOUNT) failures.push("OIDC service account");
if (job.schedule !== process.env.EXPECTED_SCHEDULE) failures.push("schedule");
if (job.state !== "ENABLED") failures.push("enabled state");
if (job.attemptDeadline !== "900s") failures.push("15-minute attempt deadline");
if (JSON.stringify(job).includes("CAPTURE_TRANSCRIPT_FOLLOW_THROUGH_SECRET")) failures.push("embedded secret");
if (failures.length) {
  process.stderr.write(`Capture held-release scheduler readback failed: ${failures.join(", ")}\n`);
  process.exit(1);
}
process.stdout.write(JSON.stringify({
  ok: true,
  name: job.name,
  uri: job.httpTarget.uri,
  schedule: job.schedule,
  attemptDeadline: job.attemptDeadline,
  oidcServiceAccount: oidc.serviceAccountEmail,
  oidcAudience: oidc.audience,
}, null, 2) + "\n");
NODE
