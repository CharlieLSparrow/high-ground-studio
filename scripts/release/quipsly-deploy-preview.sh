#!/usr/bin/env bash
set -euo pipefail

REGION="${REGION:-us-central1}"
ARTIFACT_REPOSITORY="${ARTIFACT_REPOSITORY:-high-ground-studio}"
IMAGE_NAME="${IMAGE_NAME:-studio}"
SERVICE_NAME="${SERVICE_NAME:-studio}"
PROJECT_ID="${PROJECT_ID:-$(gcloud config get-value project 2>/dev/null || true)}"
MIN_INSTANCES="${MIN_INSTANCES:-0}"
MAX_INSTANCES="${MAX_INSTANCES:-2}"
REQUESTED_IMAGE_TAG="${IMAGE_TAG:-}"
REUSE_EXISTING_IMAGE="${REUSE_EXISTING_IMAGE:-1}"
CLOUD_BUILD_MACHINE_TYPE="${CLOUD_BUILD_MACHINE_TYPE:-e2-highcpu-32}"
MIN_CLOUD_BUILD_INTERVAL_HOURS="${MIN_CLOUD_BUILD_INTERVAL_HOURS:-72}"
ALLOW_EARLY_CLOUD_BUILD="${ALLOW_EARLY_CLOUD_BUILD:-0}"
PREVIEW_TAG="${PREVIEW_TAG:-quipsly-preview}"
SOURCE_SHA="${SOURCE_SHA:-manual-preview}"
DEPLOYED_BY="${DEPLOYED_BY:-$(whoami)}"
CLOUD_BUILD_CONFIG="${CLOUD_BUILD_CONFIG:-cloudbuild.quipsly-web.yaml}"
SOURCE_REF="${SOURCE_REF:-HEAD}"
RELEASE_SMOKE_SECRET_NAME="${RELEASE_SMOKE_SECRET_NAME:-quipsly-release-smoke-secret}"
RELEASE_SMOKE_SECRET_VERSION="${RELEASE_SMOKE_SECRET_VERSION:-latest}"
IMAGE_PROXY_TOKEN_SECRET_NAME="${IMAGE_PROXY_TOKEN_SECRET_NAME:-reefball-image-proxy-token}"
IMAGE_PROXY_TOKEN_SECRET_VERSION="${IMAGE_PROXY_TOKEN_SECRET_VERSION:-latest}"
ENABLE_GOOGLE_CALENDAR_OAUTH="${ENABLE_GOOGLE_CALENDAR_OAUTH:-0}"
ENABLE_GOOGLE_DRIVE_OAUTH="${ENABLE_GOOGLE_DRIVE_OAUTH:-0}"
ENABLE_TRANSCRIPT_WORKER="${ENABLE_TRANSCRIPT_WORKER:-0}"
ENABLE_ACCOUNT_DELETION_WORKER="${ENABLE_ACCOUNT_DELETION_WORKER:-0}"
ENABLE_SESSION_INVITATION_EMAIL="${ENABLE_SESSION_INVITATION_EMAIL:-0}"
ENABLE_LIVEKIT_PROVIDER="${ENABLE_LIVEKIT_PROVIDER:-1}"
CONFIGURE_LIVEKIT_EGRESS="${CONFIGURE_LIVEKIT_EGRESS:-1}"
ENABLE_LIVEKIT_EGRESS="${ENABLE_LIVEKIT_EGRESS:-0}"
LIVEKIT_URL_SECRET_NAME="${LIVEKIT_URL_SECRET_NAME:-quipsly-livekit-url}"
LIVEKIT_API_KEY_SECRET_NAME="${LIVEKIT_API_KEY_SECRET_NAME:-quipsly-livekit-api-key}"
LIVEKIT_API_SECRET_SECRET_NAME="${LIVEKIT_API_SECRET_SECRET_NAME:-quipsly-livekit-api-secret}"
LIVEKIT_EGRESS_CREDENTIALS_SECRET_NAME="${LIVEKIT_EGRESS_CREDENTIALS_SECRET_NAME:-quipsly-livekit-egress-gcp-credentials-json}"
LIVEKIT_EGRESS_BUCKET_SECRET_NAME="${LIVEKIT_EGRESS_BUCKET_SECRET_NAME:-quipsly-livekit-egress-gcs-bucket}"
ACCOUNT_DELETION_WORKER_SERVICE="${ACCOUNT_DELETION_WORKER_SERVICE:-quipsly-account-deletion-worker}"
ACCOUNT_DELETION_WORKER_SERVICE_ACCOUNT="${ACCOUNT_DELETION_WORKER_SERVICE_ACCOUNT:-quipsly-account-deletion-worker@${PROJECT_ID}.iam.gserviceaccount.com}"
ACCOUNT_DELETION_WORKER_SECRET_NAME="${ACCOUNT_DELETION_WORKER_SECRET_NAME:-quipsly-account-deletion-worker-shared-secret}"
ACCOUNT_DELETION_WORKER_BUCKET="${ACCOUNT_DELETION_WORKER_BUCKET:-high-ground-odyssey-media}"
TRANSCRIPT_WORKER_PROJECT_ID="${TRANSCRIPT_WORKER_PROJECT_ID:-${PROJECT_ID}}"
TRANSCRIPT_WORKER_REGION="${TRANSCRIPT_WORKER_REGION:-${REGION}}"
TRANSCRIPT_WORKER_JOB="${TRANSCRIPT_WORKER_JOB:-quipsly-transcript-worker}"
TRANSCRIPT_WORKER_SERVICE_ACCOUNT="${TRANSCRIPT_WORKER_SERVICE_ACCOUNT:-quipsly-transcript-worker@${TRANSCRIPT_WORKER_PROJECT_ID}.iam.gserviceaccount.com}"
TRANSCRIPT_WORKER_MEDIA_BUCKET="${TRANSCRIPT_WORKER_MEDIA_BUCKET:-high-ground-odyssey-media}"
TRANSCRIPT_WORKER_SECRET_NAME="${TRANSCRIPT_WORKER_SECRET_NAME:-quipsly-deepgram-api-key}"
GOOGLE_CALENDAR_OAUTH_CLIENT_ID_SECRET_NAME="${GOOGLE_CALENDAR_OAUTH_CLIENT_ID_SECRET_NAME:-quipsly-google-calendar-oauth-client-id}"
GOOGLE_CALENDAR_OAUTH_CLIENT_SECRET_SECRET_NAME="${GOOGLE_CALENDAR_OAUTH_CLIENT_SECRET_SECRET_NAME:-quipsly-google-calendar-oauth-client-secret}"
GOOGLE_CALENDAR_OAUTH_STATE_SECRET_NAME="${GOOGLE_CALENDAR_OAUTH_STATE_SECRET_NAME:-quipsly-google-calendar-oauth-state-secret}"
GOOGLE_CALENDAR_OAUTH_TOKEN_ENCRYPTION_KEY_SECRET_NAME="${GOOGLE_CALENDAR_OAUTH_TOKEN_ENCRYPTION_KEY_SECRET_NAME:-quipsly-google-calendar-oauth-token-encryption-key}"
GOOGLE_CALENDAR_PUSH_WORKER_SERVICE_ACCOUNT="${GOOGLE_CALENDAR_PUSH_WORKER_SERVICE_ACCOUNT:-quipsly-calendar-push@${PROJECT_ID}.iam.gserviceaccount.com}"
GOOGLE_DRIVE_OAUTH_CLIENT_ID_SECRET_NAME="${GOOGLE_DRIVE_OAUTH_CLIENT_ID_SECRET_NAME:-quipsly-google-drive-oauth-client-id}"
GOOGLE_DRIVE_OAUTH_CLIENT_SECRET_SECRET_NAME="${GOOGLE_DRIVE_OAUTH_CLIENT_SECRET_SECRET_NAME:-quipsly-google-drive-oauth-client-secret}"
GOOGLE_DRIVE_OAUTH_STATE_SECRET_NAME="${GOOGLE_DRIVE_OAUTH_STATE_SECRET_NAME:-quipsly-google-drive-oauth-state-secret}"
GOOGLE_DRIVE_OAUTH_TOKEN_ENCRYPTION_KEY_SECRET_NAME="${GOOGLE_DRIVE_OAUTH_TOKEN_ENCRYPTION_KEY_SECRET_NAME:-quipsly-google-drive-oauth-token-encryption-key}"
GOOGLE_DRIVE_PICKER_API_KEY_SECRET_NAME="${GOOGLE_DRIVE_PICKER_API_KEY_SECRET_NAME:-quipsly-google-drive-picker-api-key}"
GOOGLE_DRIVE_PICKER_APP_ID_SECRET_NAME="${GOOGLE_DRIVE_PICKER_APP_ID_SECRET_NAME:-quipsly-google-drive-picker-app-id}"
SESSION_INVITATION_RESEND_API_KEY_SECRET_NAME="${SESSION_INVITATION_RESEND_API_KEY_SECRET_NAME:-quipsly-session-invitation-resend-api-key}"
SESSION_INVITATION_EMAIL_FROM="${SESSION_INVITATION_EMAIL_FROM:-invites@notify.quipsly.com}"

if [[ -z "${PROJECT_ID}" ]]; then
  echo "PROJECT_ID is required or gcloud must have a default project." >&2
  exit 2
fi

if [[ ! "${MIN_INSTANCES}" =~ ^[0-9]+$ ]] || [[ ! "${MAX_INSTANCES}" =~ ^[0-9]+$ ]] \
  || (( MIN_INSTANCES > MAX_INSTANCES )) || (( MAX_INSTANCES < 2 )) || (( MAX_INSTANCES > 10 )); then
  echo "MIN_INSTANCES and MAX_INSTANCES must be integers with 0 <= MIN_INSTANCES <= MAX_INSTANCES, and MAX_INSTANCES from 2 through 10." >&2
  exit 2
fi

if [[ "${REUSE_EXISTING_IMAGE}" != "0" && "${REUSE_EXISTING_IMAGE}" != "1" ]]; then
  echo "REUSE_EXISTING_IMAGE must be 0 or 1." >&2
  exit 2
fi

if [[ ! "${MIN_CLOUD_BUILD_INTERVAL_HOURS}" =~ ^[0-9]+$ ]] || (( MIN_CLOUD_BUILD_INTERVAL_HOURS > 168 )); then
  echo "MIN_CLOUD_BUILD_INTERVAL_HOURS must be an integer from 0 through 168." >&2
  exit 2
fi

if [[ "${ALLOW_EARLY_CLOUD_BUILD}" != "0" && "${ALLOW_EARLY_CLOUD_BUILD}" != "1" ]]; then
  echo "ALLOW_EARLY_CLOUD_BUILD must be 0 or 1." >&2
  exit 2
fi

if [[ "${ENABLE_GOOGLE_CALENDAR_OAUTH}" != "0" && "${ENABLE_GOOGLE_CALENDAR_OAUTH}" != "1" ]]; then
  echo "ENABLE_GOOGLE_CALENDAR_OAUTH must be 0 or 1." >&2
  exit 2
fi

if [[ "${ENABLE_GOOGLE_DRIVE_OAUTH}" != "0" && "${ENABLE_GOOGLE_DRIVE_OAUTH}" != "1" ]]; then
  echo "ENABLE_GOOGLE_DRIVE_OAUTH must be 0 or 1." >&2
  exit 2
fi

if [[ "${ENABLE_TRANSCRIPT_WORKER}" != "0" && "${ENABLE_TRANSCRIPT_WORKER}" != "1" ]]; then
  echo "ENABLE_TRANSCRIPT_WORKER must be 0 or 1." >&2
  exit 2
fi

if [[ "${ENABLE_ACCOUNT_DELETION_WORKER}" != "0" && "${ENABLE_ACCOUNT_DELETION_WORKER}" != "1" ]]; then
  echo "ENABLE_ACCOUNT_DELETION_WORKER must be 0 or 1." >&2
  exit 2
fi

if [[ "${ENABLE_SESSION_INVITATION_EMAIL}" != "0" && "${ENABLE_SESSION_INVITATION_EMAIL}" != "1" ]]; then
  echo "ENABLE_SESSION_INVITATION_EMAIL must be 0 or 1." >&2
  exit 2
fi

for binary_name in ENABLE_LIVEKIT_PROVIDER CONFIGURE_LIVEKIT_EGRESS ENABLE_LIVEKIT_EGRESS; do
  binary_value="${!binary_name}"
  if [[ "${binary_value}" != "0" && "${binary_value}" != "1" ]]; then
    echo "${binary_name} must be 0 or 1." >&2
    exit 2
  fi
done
if [[ "${ENABLE_LIVEKIT_EGRESS}" == "1" && ( "${ENABLE_LIVEKIT_PROVIDER}" != "1" || "${CONFIGURE_LIVEKIT_EGRESS}" != "1" ) ]]; then
  echo "ENABLE_LIVEKIT_EGRESS=1 requires ENABLE_LIVEKIT_PROVIDER=1 and CONFIGURE_LIVEKIT_EGRESS=1." >&2
  exit 2
fi

if [[ "${ENABLE_ACCOUNT_DELETION_WORKER}" == "1" && ! "${ACCOUNT_DELETION_WORKER_BUCKET}" =~ ^[a-z0-9][a-z0-9._-]{1,220}[a-z0-9]$ ]]; then
  echo "ACCOUNT_DELETION_WORKER_BUCKET is unsafe." >&2
  exit 2
fi

if [[ "${ENABLE_TRANSCRIPT_WORKER}" == "1" ]] && {
  [[ ! "${TRANSCRIPT_WORKER_PROJECT_ID}" =~ ^[a-z][a-z0-9-]{4,62}$ ]] \
    || [[ ! "${TRANSCRIPT_WORKER_REGION}" =~ ^[a-z][a-z0-9-]{0,62}$ ]] \
    || [[ ! "${TRANSCRIPT_WORKER_JOB}" =~ ^[a-z][a-z0-9-]{0,62}$ ]] \
    || [[ ! "${TRANSCRIPT_WORKER_SERVICE_ACCOUNT}" =~ ^[a-z0-9][a-z0-9-]{4,28}@[a-z][a-z0-9-]{4,62}\.iam\.gserviceaccount\.com$ ]] \
    || [[ ! "${TRANSCRIPT_WORKER_MEDIA_BUCKET}" =~ ^[a-z0-9][a-z0-9._-]{1,220}[a-z0-9]$ ]] \
    || [[ ! "${TRANSCRIPT_WORKER_SECRET_NAME}" =~ ^[A-Za-z][A-Za-z0-9_-]{0,254}$ ]];
}; then
  echo "Transcript worker project, region, job, identity, bucket, or secret name is unsafe." >&2
  exit 2
fi

case "${CLOUD_BUILD_MACHINE_TYPE}" in
  e2-medium|e2-highcpu-8|e2-highcpu-32|n1-highcpu-8|n1-highcpu-32) ;;
  *)
    echo "CLOUD_BUILD_MACHINE_TYPE is not supported by the default Cloud Build pool." >&2
    exit 2
    ;;
esac

if ! gcloud secrets versions describe "${RELEASE_SMOKE_SECRET_VERSION}" \
  --secret="${RELEASE_SMOKE_SECRET_NAME}" \
  --project="${PROJECT_ID}" \
  --format="value(state)" | grep -qx "ENABLED"; then
  echo "Release-smoke secret ${RELEASE_SMOKE_SECRET_NAME}:${RELEASE_SMOKE_SECRET_VERSION} is missing or disabled." >&2
  echo "Create an enabled Secret Manager version before deploying a promotable preview." >&2
  exit 2
fi

if ! gcloud secrets versions access "${RELEASE_SMOKE_SECRET_VERSION}" \
  --secret="${RELEASE_SMOKE_SECRET_NAME}" \
  --project="${PROJECT_ID}" | node -e '
    let value = "";
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", (chunk) => { value += chunk; });
    process.stdin.on("end", () => {
      const bytes = Buffer.byteLength(value, "utf8");
      const valid = bytes >= 32
        && bytes <= 4096
        && value.trim() === value
        && !/[\u0000-\u001f\u007f]/.test(value);
      process.exit(valid ? 0 : 1);
    });
  '; then
  echo "Release-smoke secret ${RELEASE_SMOKE_SECRET_NAME}:${RELEASE_SMOKE_SECRET_VERSION} is not a valid 32-4096 byte signing key." >&2
  echo "Use a value with no leading/trailing whitespace or control characters. The value was not printed." >&2
  exit 2
fi
echo "Release-smoke signing key passed private byte validation."

google_calendar_oauth_secrets=""
google_calendar_push_env_vars=""
google_drive_oauth_secrets=""
session_invitation_email_secret=""
session_invitation_email_env_vars=""

require_enabled_secret() {
  local secret_name="$1"
  if ! gcloud secrets versions describe latest \
    --secret="${secret_name}" \
    --project="${PROJECT_ID}" \
    --format='value(state)' | grep -qx 'ENABLED'; then
    echo "Required release secret ${secret_name}:latest is missing or disabled." >&2
    exit 2
  fi
}

validate_private_secret() {
  local secret_name="$1"
  local validation_kind="$2"
  if ! gcloud secrets versions access latest \
    --secret="${secret_name}" \
    --project="${PROJECT_ID}" \
    | VALIDATION_KIND="${validation_kind}" node -e '
      let value = "";
      process.stdin.setEncoding("utf8");
      process.stdin.on("data", (chunk) => { value += chunk; });
      process.stdin.on("end", () => {
        const kind = process.env.VALIDATION_KIND;
        const normalized = kind === "gcp-credentials" ? value.trim() : value;
        const clean = kind === "gcp-credentials"
          ? Boolean(normalized) && !/[\u0000\u007f]/.test(normalized)
          : value.trim() === value && !/[\u0000-\u001f\u007f]/.test(value);
        let valid = clean;
        if (kind === "url") {
          try {
            const url = new URL(value);
            valid &&= ["wss:", "ws:", "https:", "http:"].includes(url.protocol) && Boolean(url.hostname);
          } catch { valid = false; }
        } else if (kind === "api-key") {
          valid &&= value.length >= 8 && value.length <= 512;
        } else if (kind === "api-secret" || kind === "oauth-client-secret") {
          valid &&= value.length >= 16 && value.length <= 4096;
        } else if (kind === "oauth-client-id") {
          valid &&= /^[0-9]+-[a-z0-9_-]+\.apps\.googleusercontent\.com$/.test(value);
        } else if (kind === "state-secret") {
          valid &&= Buffer.byteLength(value, "utf8") >= 32 && Buffer.byteLength(value, "utf8") <= 4096;
        } else if (kind === "encryption-key") {
          try { valid &&= Buffer.from(value, "base64url").length === 32; }
          catch { valid = false; }
        } else if (kind === "decimal-id") {
          valid &&= /^[0-9]{6,32}$/.test(value);
        } else if (kind === "bucket") {
          valid &&= /^[a-z0-9][a-z0-9._-]{1,220}[a-z0-9]$/.test(value);
        } else if (kind === "gcp-credentials") {
          try {
            const parsed = JSON.parse(normalized);
            valid &&= parsed?.type === "service_account"
              && typeof parsed?.client_email === "string"
              && typeof parsed?.private_key === "string"
              && parsed.private_key.includes("BEGIN PRIVATE KEY");
          } catch { valid = false; }
        } else {
          valid = false;
        }
        process.exit(valid ? 0 : 1);
      });
    '; then
    echo "Required release secret ${secret_name}:latest failed private ${validation_kind} validation. Its value was not printed." >&2
    exit 2
  fi
}

livekit_secret_mounts=""
livekit_egress_enabled_value="false"
if [[ "${ENABLE_LIVEKIT_PROVIDER}" == "1" ]]; then
  require_enabled_secret "${LIVEKIT_URL_SECRET_NAME}"
  require_enabled_secret "${LIVEKIT_API_KEY_SECRET_NAME}"
  require_enabled_secret "${LIVEKIT_API_SECRET_SECRET_NAME}"
  validate_private_secret "${LIVEKIT_URL_SECRET_NAME}" "url"
  validate_private_secret "${LIVEKIT_API_KEY_SECRET_NAME}" "api-key"
  validate_private_secret "${LIVEKIT_API_SECRET_SECRET_NAME}" "api-secret"
  livekit_secret_mounts=",LIVEKIT_URL=${LIVEKIT_URL_SECRET_NAME}:latest,LIVEKIT_API_KEY=${LIVEKIT_API_KEY_SECRET_NAME}:latest,LIVEKIT_API_SECRET=${LIVEKIT_API_SECRET_SECRET_NAME}:latest"
  echo "LiveKit conversation-provider secrets passed enabled-version and private shape validation."
fi
if [[ "${CONFIGURE_LIVEKIT_EGRESS}" == "1" ]]; then
  require_enabled_secret "${LIVEKIT_EGRESS_CREDENTIALS_SECRET_NAME}"
  require_enabled_secret "${LIVEKIT_EGRESS_BUCKET_SECRET_NAME}"
  validate_private_secret "${LIVEKIT_EGRESS_CREDENTIALS_SECRET_NAME}" "gcp-credentials"
  validate_private_secret "${LIVEKIT_EGRESS_BUCKET_SECRET_NAME}" "bucket"
  livekit_secret_mounts="${livekit_secret_mounts},LIVEKIT_EGRESS_GCP_CREDENTIALS_JSON=${LIVEKIT_EGRESS_CREDENTIALS_SECRET_NAME}:latest,LIVEKIT_EGRESS_GCS_BUCKET=${LIVEKIT_EGRESS_BUCKET_SECRET_NAME}:latest"
  echo "LiveKit egress destination secrets passed enabled-version and private shape validation."
fi
if [[ "${ENABLE_LIVEKIT_EGRESS}" == "1" ]]; then
  livekit_egress_enabled_value="true"
fi

if [[ "${ENABLE_SESSION_INVITATION_EMAIL}" == "1" ]]; then
  if [[ ! "${SESSION_INVITATION_EMAIL_FROM}" =~ ^[^[:space:]@,=]+@[^[:space:]@,=]+\.[^[:space:]@,=]+$ ]]; then
    echo "SESSION_INVITATION_EMAIL_FROM must be one plain email address safe for Cloud Run environment configuration." >&2
    exit 2
  fi
  require_enabled_secret "${SESSION_INVITATION_RESEND_API_KEY_SECRET_NAME}"
  validate_private_secret "${SESSION_INVITATION_RESEND_API_KEY_SECRET_NAME}" "api-key"
  session_invitation_email_secret=",QUIPSLY_SESSION_INVITATION_RESEND_API_KEY=${SESSION_INVITATION_RESEND_API_KEY_SECRET_NAME}:latest"
  session_invitation_email_env_vars=",QUIPSLY_SESSION_INVITATION_EMAIL_FROM=${SESSION_INVITATION_EMAIL_FROM}"
  echo "Session invitation email secret passed enabled-version and private shape validation."
fi
if [[ "${ENABLE_GOOGLE_CALENDAR_OAUTH}" == "1" ]]; then
  if [[ ! "${GOOGLE_CALENDAR_PUSH_WORKER_SERVICE_ACCOUNT}" =~ ^[a-z0-9][a-z0-9-]{4,28}@[a-z][a-z0-9-]{4,62}\.iam\.gserviceaccount\.com$ ]]; then
    echo "Google Calendar push worker service account is unsafe." >&2
    exit 2
  fi
  for secret_name in \
    "${GOOGLE_CALENDAR_OAUTH_CLIENT_ID_SECRET_NAME}" \
    "${GOOGLE_CALENDAR_OAUTH_CLIENT_SECRET_SECRET_NAME}" \
    "${GOOGLE_CALENDAR_OAUTH_STATE_SECRET_NAME}" \
    "${GOOGLE_CALENDAR_OAUTH_TOKEN_ENCRYPTION_KEY_SECRET_NAME}"; do
    if ! gcloud secrets versions describe latest \
      --secret="${secret_name}" \
      --project="${PROJECT_ID}" \
      --format="value(state)" | grep -qx "ENABLED"; then
      echo "Google Calendar OAuth secret ${secret_name}:latest is missing or disabled." >&2
      exit 2
    fi
  done
  google_calendar_oauth_secrets=",GOOGLE_CALENDAR_OAUTH_CLIENT_ID=${GOOGLE_CALENDAR_OAUTH_CLIENT_ID_SECRET_NAME}:latest,GOOGLE_CALENDAR_OAUTH_CLIENT_SECRET=${GOOGLE_CALENDAR_OAUTH_CLIENT_SECRET_SECRET_NAME}:latest,GOOGLE_CALENDAR_OAUTH_STATE_SECRET=${GOOGLE_CALENDAR_OAUTH_STATE_SECRET_NAME}:latest,GOOGLE_CALENDAR_OAUTH_TOKEN_ENCRYPTION_KEY=${GOOGLE_CALENDAR_OAUTH_TOKEN_ENCRYPTION_KEY_SECRET_NAME}:latest"
  google_calendar_push_audience="$(
    gcloud run services describe "${SERVICE_NAME}" \
      --project="${PROJECT_ID}" \
      --region="${REGION}" \
      --format='value(status.url)'
  )"
  if [[ ! "${google_calendar_push_audience}" =~ ^https://[a-z0-9-]+-[a-z0-9]+\.[a-z0-9-]+\.run\.app$ ]]; then
    echo "Could not resolve a safe Cloud Run audience for Google Calendar push maintenance." >&2
    exit 2
  fi
  google_calendar_push_env_vars=",GOOGLE_CALENDAR_PUSH_WORKER_SERVICE_ACCOUNT=${GOOGLE_CALENDAR_PUSH_WORKER_SERVICE_ACCOUNT},GOOGLE_CALENDAR_PUSH_WORKER_AUDIENCE=${google_calendar_push_audience}"
  echo "Google Calendar OAuth secrets passed enabled-version validation."
fi

if [[ "${ENABLE_GOOGLE_DRIVE_OAUTH}" == "1" ]]; then
  for secret_name in \
    "${GOOGLE_DRIVE_OAUTH_CLIENT_ID_SECRET_NAME}" \
    "${GOOGLE_DRIVE_OAUTH_CLIENT_SECRET_SECRET_NAME}" \
    "${GOOGLE_DRIVE_OAUTH_STATE_SECRET_NAME}" \
    "${GOOGLE_DRIVE_OAUTH_TOKEN_ENCRYPTION_KEY_SECRET_NAME}" \
    "${GOOGLE_DRIVE_PICKER_API_KEY_SECRET_NAME}" \
    "${GOOGLE_DRIVE_PICKER_APP_ID_SECRET_NAME}"; do
    require_enabled_secret "${secret_name}"
  done
  validate_private_secret "${GOOGLE_DRIVE_OAUTH_CLIENT_ID_SECRET_NAME}" "oauth-client-id"
  validate_private_secret "${GOOGLE_DRIVE_OAUTH_CLIENT_SECRET_SECRET_NAME}" "oauth-client-secret"
  validate_private_secret "${GOOGLE_DRIVE_OAUTH_STATE_SECRET_NAME}" "state-secret"
  validate_private_secret "${GOOGLE_DRIVE_OAUTH_TOKEN_ENCRYPTION_KEY_SECRET_NAME}" "encryption-key"
  validate_private_secret "${GOOGLE_DRIVE_PICKER_API_KEY_SECRET_NAME}" "api-key"
  validate_private_secret "${GOOGLE_DRIVE_PICKER_APP_ID_SECRET_NAME}" "decimal-id"
  google_drive_oauth_secrets=",GOOGLE_DRIVE_OAUTH_CLIENT_ID=${GOOGLE_DRIVE_OAUTH_CLIENT_ID_SECRET_NAME}:latest,GOOGLE_DRIVE_OAUTH_CLIENT_SECRET=${GOOGLE_DRIVE_OAUTH_CLIENT_SECRET_SECRET_NAME}:latest,GOOGLE_DRIVE_OAUTH_STATE_SECRET=${GOOGLE_DRIVE_OAUTH_STATE_SECRET_NAME}:latest,GOOGLE_DRIVE_OAUTH_TOKEN_ENCRYPTION_KEY=${GOOGLE_DRIVE_OAUTH_TOKEN_ENCRYPTION_KEY_SECRET_NAME}:latest,GOOGLE_DRIVE_PICKER_API_KEY=${GOOGLE_DRIVE_PICKER_API_KEY_SECRET_NAME}:latest,GOOGLE_DRIVE_PICKER_APP_ID=${GOOGLE_DRIVE_PICKER_APP_ID_SECRET_NAME}:latest"
  echo "Google Drive OAuth and Picker secrets passed enabled-version and private shape validation."
fi

transcript_worker_env_vars=""
if [[ "${ENABLE_TRANSCRIPT_WORKER}" == "1" ]]; then
  if ! gcloud secrets versions describe latest \
    --secret="${TRANSCRIPT_WORKER_SECRET_NAME}" \
    --project="${TRANSCRIPT_WORKER_PROJECT_ID}" \
    --format='value(state)' | grep -qx 'ENABLED'; then
    echo "Transcript provider secret ${TRANSCRIPT_WORKER_SECRET_NAME}:latest is missing or disabled." >&2
    exit 2
  fi

  nest_service_account="$(
    gcloud run services describe "${SERVICE_NAME}" \
      --project="${PROJECT_ID}" \
      --region="${REGION}" \
      --format='value(spec.template.spec.serviceAccountName)'
  )"
  transcript_job_json="$(
    gcloud run jobs describe "${TRANSCRIPT_WORKER_JOB}" \
      --project="${TRANSCRIPT_WORKER_PROJECT_ID}" \
      --region="${TRANSCRIPT_WORKER_REGION}" \
      --format=json
  )"
  JOB_JSON="${transcript_job_json}" \
  EXPECTED_WORKER_ACCOUNT="${TRANSCRIPT_WORKER_SERVICE_ACCOUNT}" \
  EXPECTED_MEDIA_BUCKET="${TRANSCRIPT_WORKER_MEDIA_BUCKET}" \
  EXPECTED_SECRET="${TRANSCRIPT_WORKER_SECRET_NAME}" \
  node <<'NODE'
const job = JSON.parse(process.env.JOB_JSON || "{}");
const template = job.template?.template || job.spec?.template?.spec?.template?.spec;
const container = template?.containers?.[0];
const env = Object.fromEntries((container?.env || []).map((entry) => [entry.name, entry]));
const failures = [];
if (!/@sha256:[0-9a-f]{64}$/.test(container?.image || "")) failures.push("immutable worker image");
if (
  template?.serviceAccount !== process.env.EXPECTED_WORKER_ACCOUNT
  && template?.serviceAccountName !== process.env.EXPECTED_WORKER_ACCOUNT
) failures.push("worker service account");
if (env.QUIPSLY_MEDIA_BUCKET?.value !== process.env.EXPECTED_MEDIA_BUCKET) failures.push("media bucket");
if (!/^[0-9a-f]{40}$/.test(env.QUIPSLY_WORKER_BUILD_ID?.value || "")) failures.push("committed build identity");
const secret = env.DEEPGRAM_API_KEY?.valueSource?.secretKeyRef?.secret
  || env.DEEPGRAM_API_KEY?.valueFrom?.secretKeyRef?.name;
if (
  secret !== process.env.EXPECTED_SECRET
  && !String(secret || "").endsWith(`/secrets/${process.env.EXPECTED_SECRET}`)
) failures.push("provider secret reference");
if (typeof env.DEEPGRAM_API_KEY?.value === "string") failures.push("plaintext provider secret");
if (failures.length) throw new Error(`Transcript worker activation readback mismatch: ${failures.join(", ")}`);
NODE

  transcript_job_policy="$(
    gcloud run jobs get-iam-policy "${TRANSCRIPT_WORKER_JOB}" \
      --project="${TRANSCRIPT_WORKER_PROJECT_ID}" \
      --region="${TRANSCRIPT_WORKER_REGION}" \
      --format=json
  )"
  POLICY_JSON="${transcript_job_policy}" \
  NEST_MEMBER="serviceAccount:${nest_service_account}" \
  node <<'NODE'
const policy = JSON.parse(process.env.POLICY_JSON || "{}");
const member = process.env.NEST_MEMBER;
const hasRole = (role) => (policy.bindings || []).some(
  (binding) => binding.role === role && (binding.members || []).includes(member),
);
if (!hasRole("roles/run.jobsExecutor") || hasRole("roles/run.jobsExecutorWithOverrides")) {
  throw new Error("Nest lacks the exact transcript jobsExecutor boundary or has unsafe override authority.");
}
NODE

  transcript_worker_env_vars=",QUIPSLY_TRANSCRIPT_WORKER_ENABLED=1,QUIPSLY_TRANSCRIPT_WORKER_PROJECT_ID=${TRANSCRIPT_WORKER_PROJECT_ID},QUIPSLY_TRANSCRIPT_WORKER_REGION=${TRANSCRIPT_WORKER_REGION},QUIPSLY_TRANSCRIPT_WORKER_JOB=${TRANSCRIPT_WORKER_JOB}"
  echo "Transcript worker passed immutable job, provider-secret, and Nest executor readback."
fi

account_deletion_worker_secret=""
account_deletion_worker_env_vars=",QUIPSLY_ACCOUNT_DELETION_WORKER_ENABLED=false,QUIPSLY_ACCOUNT_DELETION_EXECUTOR_ENABLED=false"
if [[ "${ENABLE_ACCOUNT_DELETION_WORKER}" == "1" ]]; then
  if ! gcloud secrets versions describe latest \
    --secret="${ACCOUNT_DELETION_WORKER_SECRET_NAME}" \
    --project="${PROJECT_ID}" \
    --format='value(state)' | grep -qx 'ENABLED'; then
    echo "Account deletion worker shared secret ${ACCOUNT_DELETION_WORKER_SECRET_NAME}:latest is missing or disabled." >&2
    exit 2
  fi

  nest_service_account="$(
    gcloud run services describe "${SERVICE_NAME}" \
      --project="${PROJECT_ID}" \
      --region="${REGION}" \
      --format='value(spec.template.spec.serviceAccountName)'
  )"
  deletion_worker_json="$(
    gcloud run services describe "${ACCOUNT_DELETION_WORKER_SERVICE}" \
      --project="${PROJECT_ID}" \
      --region="${REGION}" \
      --format=json
  )"
  deletion_worker_policy="$(
    gcloud run services get-iam-policy "${ACCOUNT_DELETION_WORKER_SERVICE}" \
      --project="${PROJECT_ID}" \
      --region="${REGION}" \
      --format=json
  )"
  deletion_worker_secret_policy="$(
    gcloud secrets get-iam-policy "${ACCOUNT_DELETION_WORKER_SECRET_NAME}" \
      --project="${PROJECT_ID}" \
      --format=json
  )"
  account_deletion_source_sha="$(git rev-parse --verify "${SOURCE_REF}^{commit}")"
  WORKER_JSON="${deletion_worker_json}" \
  WORKER_POLICY="${deletion_worker_policy}" \
  WORKER_SECRET_POLICY="${deletion_worker_secret_policy}" \
  EXPECTED_WORKER_ACCOUNT="${ACCOUNT_DELETION_WORKER_SERVICE_ACCOUNT}" \
  EXPECTED_NEST_MEMBER="serviceAccount:${nest_service_account}" \
  EXPECTED_WORKER_SECRET="${ACCOUNT_DELETION_WORKER_SECRET_NAME}" \
  EXPECTED_WORKER_BUCKET="${ACCOUNT_DELETION_WORKER_BUCKET}" \
  EXPECTED_SOURCE_SHA="${account_deletion_source_sha}" \
  node <<'NODE'
const service = JSON.parse(process.env.WORKER_JSON || "{}");
const policy = JSON.parse(process.env.WORKER_POLICY || "{}");
const secretPolicy = JSON.parse(process.env.WORKER_SECRET_POLICY || "{}");
const spec = service.spec?.template?.spec || {};
const annotations = service.spec?.template?.metadata?.annotations || {};
const container = spec.containers?.[0] || {};
const env = Object.fromEntries((container.env || []).map((entry) => [entry.name, entry]));
const secretName = (entry) => entry?.valueFrom?.secretKeyRef?.name
  || entry?.valueSource?.secretKeyRef?.secret
  || "";
const failures = [];
if (spec.serviceAccountName !== process.env.EXPECTED_WORKER_ACCOUNT) failures.push("dedicated worker identity");
if (Number(spec.containerConcurrency) !== 1) failures.push("concurrency 1");
if (Number(annotations["autoscaling.knative.dev/maxScale"]) !== 1) failures.push("maximum 1 instance");
if (Number(spec.timeoutSeconds) < 900) failures.push("900-second timeout");
if (env.QUIPSLY_ACCOUNT_DELETION_WORKER_MODE?.value !== "true") failures.push("worker mode");
if (env.QUIPSLY_ACCOUNT_DELETION_EXECUTOR_ENABLED?.value !== "true") failures.push("executor gate");
if (env.QUIPSLY_ACCOUNT_DELETION_GCS_BUCKETS?.value !== process.env.EXPECTED_WORKER_BUCKET) failures.push("exact storage allowlist");
if (env.QUIPSLY_SOURCE_SHA?.value !== process.env.EXPECTED_SOURCE_SHA) failures.push("exact source identity");
if (secretName(env.QUIPSLY_ACCOUNT_DELETION_WORKER_SHARED_SECRET) !== process.env.EXPECTED_WORKER_SECRET) failures.push("shared-secret binding");
const bindings = policy.bindings || [];
const allUsers = bindings.some((binding) => (binding.members || []).includes("allUsers"));
if (allUsers) failures.push("private IAM boundary");
const invoker = bindings.some((binding) =>
  ["roles/run.invoker", "roles/run.admin"].includes(binding.role)
  && (binding.members || []).includes(process.env.EXPECTED_NEST_MEMBER));
if (!invoker) failures.push("Nest invoker grant");
const secretAccessor = (secretPolicy.bindings || []).some((binding) =>
  ["roles/secretmanager.secretAccessor", "roles/owner"].includes(binding.role)
  && (binding.members || []).includes(process.env.EXPECTED_NEST_MEMBER));
if (!secretAccessor) failures.push("Nest shared-secret access");
const workerUrl = service.status?.url;
if (!/^https:\/\/[a-z0-9-]+-[a-z0-9]+\.[a-z0-9-]+\.run\.app$/.test(workerUrl || "")) failures.push("stable HTTPS worker URL");
if (failures.length) throw new Error(`Account deletion worker activation mismatch: ${failures.join(", ")}`);
process.stdout.write(`${workerUrl}\n`);
NODE
  account_deletion_worker_url="$(
    WORKER_JSON="${deletion_worker_json}" node -e 'const service=JSON.parse(process.env.WORKER_JSON); process.stdout.write(service.status.url)'
  )"
  account_deletion_worker_secret=",QUIPSLY_ACCOUNT_DELETION_WORKER_SHARED_SECRET=${ACCOUNT_DELETION_WORKER_SECRET_NAME}:latest"
  account_deletion_worker_env_vars=",QUIPSLY_ACCOUNT_DELETION_WORKER_ENABLED=true,QUIPSLY_ACCOUNT_DELETION_WORKER_URL=${account_deletion_worker_url},QUIPSLY_ACCOUNT_DELETION_EXECUTOR_ENABLED=false"
  echo "Account deletion worker passed private-service, dedicated-identity, gate, allowlist, and Nest-invoker readback."
fi

if ! gcloud secrets versions describe "${IMAGE_PROXY_TOKEN_SECRET_VERSION}" \
  --secret="${IMAGE_PROXY_TOKEN_SECRET_NAME}" \
  --project="${PROJECT_ID}" \
  --format="value(state)" | grep -qx "ENABLED"; then
  echo "Image-proxy token secret ${IMAGE_PROXY_TOKEN_SECRET_NAME}:${IMAGE_PROXY_TOKEN_SECRET_VERSION} is missing or disabled." >&2
  exit 2
fi

repo_root="$(git rev-parse --show-toplevel)"
resolved_source_sha="$(git -C "${repo_root}" rev-parse --verify "${SOURCE_REF}^{commit}")"
release_root="$(mktemp -d "${TMPDIR:-/tmp}/quipsly-preview-release.XXXXXX")"
release_context="${release_root}/context"

cleanup() {
  if [[ -f "${release_context}/.quipsly-release-context" ]]; then
    rm -rf -- "${release_root}"
  else
    echo "Refusing to remove unmarked release directory: ${release_root}" >&2
  fi
}
trap cleanup EXIT

release_context="$("${repo_root}/scripts/release/quipsly-build-context.sh" "${resolved_source_sha}" "${release_context}")"
SOURCE_SHA="${resolved_source_sha}"
canonical_image_tag="source-${SOURCE_SHA}"
if [[ -n "${REQUESTED_IMAGE_TAG}" && "${REQUESTED_IMAGE_TAG}" != "${canonical_image_tag}" ]]; then
  echo "IMAGE_TAG must equal ${canonical_image_tag} for committed source ${SOURCE_SHA}." >&2
  echo "Create a new commit for a distinct Nest release identity." >&2
  exit 2
fi
# One committed release identity maps to one immutable registry tag. This
# makes retries, repeated preview qualification, and later promotion reuse
# the already-verified image instead of buying another timestamped build.
IMAGE_TAG="${canonical_image_tag}"
IMAGE_URI="${REGION}-docker.pkg.dev/${PROJECT_ID}/${ARTIFACT_REPOSITORY}/${IMAGE_NAME}:${IMAGE_TAG}"
image_readback_error="${release_root}/artifact-image-readback.stderr"

read_image_digest() {
  local digest=""
  : > "${image_readback_error}"
  if digest="$(gcloud artifacts docker images describe "${IMAGE_URI}" \
    --project="${PROJECT_ID}" \
    --format='value(image_summary.digest)' 2>"${image_readback_error}")"; then
    if [[ "${digest}" =~ ^sha256:[0-9a-f]{64}$ ]]; then
      printf '%s\n' "${digest}"
      return 0
    fi
    echo "Artifact Registry returned an invalid digest for ${IMAGE_URI}." >&2
    return 2
  fi
  if grep -Eqi 'NOT_FOUND|not found|does not exist|was not found' "${image_readback_error}"; then
    return 1
  fi
  echo "Artifact Registry readback failed before release cost decisions." >&2
  sed -n '1,12p' "${image_readback_error}" >&2
  return 2
}

echo "=========================================================="
echo "🛡️  Running Beta Manifest Scan..."
echo "=========================================================="
if ! (cd "${release_context}" && node scripts/scan-beta-blockers.mjs); then
  echo ""
  echo "❌ ABORTING DEPLOY: Beta manifest scan failed. Please resolve blockers listed above." >&2
  exit 1
fi
echo "=========================================================="

RELEASE_CONTEXT_DIR="${release_context}" \
  SOURCE_REF="${resolved_source_sha}" \
  QUIPSLY_PREFLIGHT_PURPOSE=preview \
  bash "${repo_root}/scripts/release/quipsly-release-preflight.sh"

existing_image_digest=""
image_readback_status=1
if existing_image_digest="$(read_image_digest)"; then
  image_readback_status=0
else
  image_readback_status=$?
fi

if [[ "${SKIP_BUILD:-0}" == "1" || "${SKIP_CLOUD_BUILD:-0}" == "1" ]]; then
  if [[ "${image_readback_status}" != "0" ]]; then
    echo "The requested existing image is unavailable: ${IMAGE_URI}" >&2
    exit 2
  fi
  echo "Using explicitly selected existing Quipsly image ${IMAGE_URI} (${existing_image_digest})"
elif [[ "${image_readback_status}" == "0" ]]; then
  if [[ "${REUSE_EXISTING_IMAGE}" == "1" ]]; then
    echo "Reusing exact-source Quipsly image ${IMAGE_URI} (${existing_image_digest})"
    echo "Cloud Build skipped: this committed source already has a verified image."
  else
    echo "Refusing to replace an existing immutable Quipsly image tag." >&2
    echo "Create a new commit for a distinct Nest release identity." >&2
    exit 2
  fi
elif [[ "${image_readback_status}" == "2" ]]; then
  exit 2
else
  if [[ "${ALLOW_EARLY_CLOUD_BUILD}" == "0" && "${MIN_CLOUD_BUILD_INTERVAL_HOURS}" != "0" ]]; then
    recent_builds_json="$(
      gcloud builds list \
        --project="${PROJECT_ID}" \
        --sort-by="~createTime" \
        --limit=500 \
        --format='json(createTime,status,substitutions)'
    )"
    latest_successful_build_time="$(
      printf '%s' "${recent_builds_json}" \
        | node "${repo_root}/scripts/release/quipsly-latest-successful-build.mjs" "${IMAGE_NAME}"
    )"
    if [[ -n "${latest_successful_build_time}" ]]; then
      cadence_result="$(
        LATEST_SUCCESSFUL_BUILD_TIME="${latest_successful_build_time}" \
        MIN_CLOUD_BUILD_INTERVAL_HOURS="${MIN_CLOUD_BUILD_INTERVAL_HOURS}" \
        node <<'NODE'
const latest = Date.parse(process.env.LATEST_SUCCESSFUL_BUILD_TIME || "");
const minimumHours = Number(process.env.MIN_CLOUD_BUILD_INTERVAL_HOURS || "0");
if (!Number.isFinite(latest) || !Number.isInteger(minimumHours)) process.exit(2);
const remainingMs = latest + minimumHours * 60 * 60 * 1000 - Date.now();
process.stdout.write(String(Math.max(0, Math.ceil(remainingMs / 60000))));
NODE
      )"
      if (( cadence_result > 0 )); then
        echo "Cloud Build cadence gate: the last successful ${IMAGE_NAME} build was ${latest_successful_build_time}." >&2
        echo "Wait about ${cadence_result} minutes so product work ships as a coherent release train." >&2
        echo "For an urgent production repair only, rerun with ALLOW_EARLY_CLOUD_BUILD=1." >&2
        exit 2
      fi
    fi
  fi
  echo "Building Quipsly image ${IMAGE_URI} from committed source ${SOURCE_SHA}"
  echo "Cloud Build worker: ${CLOUD_BUILD_MACHINE_TYPE}"
  gcloud builds submit \
    --config "${release_context}/${CLOUD_BUILD_CONFIG}" \
    --machine-type "${CLOUD_BUILD_MACHINE_TYPE}" \
    --substitutions "_REGION=${REGION},_ARTIFACT_REPOSITORY=${ARTIFACT_REPOSITORY},_IMAGE_NAME=${IMAGE_NAME},_IMAGE_TAG=${IMAGE_TAG},_QUIPSLY_BUILD_ID=${SOURCE_SHA}" \
    "${release_context}"
fi

verified_image_digest=""
for attempt in 1 2 3 4 5 6; do
  if verified_image_digest="$(read_image_digest)"; then
    break
  fi
  image_status=$?
  if [[ "${image_status}" == "2" ]]; then
    exit 2
  fi
  sleep "$((attempt * 2))"
done
if [[ ! "${verified_image_digest}" =~ ^sha256:[0-9a-f]{64}$ ]]; then
  echo "Could not verify the release image after the build/reuse decision: ${IMAGE_URI}" >&2
  exit 2
fi
echo "Release image digest: ${verified_image_digest}"

echo "Deploying no-traffic preview revision for ${SERVICE_NAME}"
gcloud run deploy "${SERVICE_NAME}" \
  --image="${IMAGE_URI}" \
  --region="${REGION}" \
  --min-instances="${MIN_INSTANCES}" \
  --max-instances="${MAX_INSTANCES}" \
  --no-traffic \
  --tag="${PREVIEW_TAG}" \
  --remove-secrets="NEXTAUTH_SECRET,PATREON_WEBHOOK_SECRET,PATREON_RECONCILE_SECRET" \
  --update-secrets="QUIPSLY_RELEASE_SMOKE_SECRET=${RELEASE_SMOKE_SECRET_NAME}:${RELEASE_SMOKE_SECRET_VERSION},REEFBALL_IMAGE_PROXY_TOKEN_SECRET=${IMAGE_PROXY_TOKEN_SECRET_NAME}:${IMAGE_PROXY_TOKEN_SECRET_VERSION}${livekit_secret_mounts}${google_calendar_oauth_secrets}${google_drive_oauth_secrets}${account_deletion_worker_secret}${session_invitation_email_secret}" \
  --update-env-vars="FIREBASE_CUSTOM_TOKEN_SERVICE_ACCOUNT=firebase-adminsdk-fbsvc@quipsly-reef.iam.gserviceaccount.com,QUIPSLY_IMAGE_TAG=${IMAGE_TAG},QUIPSLY_SOURCE_SHA=${SOURCE_SHA},QUIPSLY_RELEASE_CHANNEL=preview,QUIPSLY_DEPLOYED_BY=${DEPLOYED_BY},QUIPSLY_APP_HOST=nest.quipsly.com,QUIPSLY_MARKETING_HOST=quipsly.com,QUIPSLY_LEGACY_STUDIO_HOST=studio-hm2odnvjga-uc.a.run.app,NEXT_PUBLIC_STUDIO_COLLAB_URL=wss://studio-collab-hm2odnvjga-uc.a.run.app,STUDIO_COLLAB_URL=wss://studio-collab-hm2odnvjga-uc.a.run.app,LIVEKIT_EGRESS_ENABLED=${livekit_egress_enabled_value}${google_calendar_push_env_vars}${transcript_worker_env_vars}${account_deletion_worker_env_vars}${session_invitation_email_env_vars}" \
  --quiet

echo "Preview revision deployed."
echo "Find preview URL with:"
echo "  gcloud run services describe ${SERVICE_NAME} --region ${REGION} --format='json(status.traffic)'"
echo "Then smoke it with:"
echo "  QUIPSLY_RELEASE_SMOKE_SECRET=\"\$(gcloud secrets versions access ${RELEASE_SMOKE_SECRET_VERSION} --secret=${RELEASE_SMOKE_SECRET_NAME} --project=${PROJECT_ID})\" \\"
echo "    QUIPSLY_AUTH_SMOKE_EMAIL=<reviewer-email> QUIPSLY_AUTH_SMOKE_PASSWORD=<secure-env-value> \\"
echo "    PREVIEW_URL=<preview-url> scripts/release/quipsly-smoke-preview.sh"
