#!/usr/bin/env bash
set -euo pipefail

repo_root="$(git rev-parse --show-toplevel)"
project_id="${PROJECT_ID:-$(gcloud config get-value project 2>/dev/null || true)}"
region="${REGION:-us-central1}"
artifact_repository="${ARTIFACT_REPOSITORY:-high-ground-studio}"
image_name="${IMAGE_NAME:-quipsly-transcript-worker}"
job_name="${JOB_NAME:-quipsly-transcript-worker}"
source_ref="${SOURCE_REF:-HEAD}"
media_bucket="${QUIPSLY_MEDIA_BUCKET:-}"
deepgram_secret="${DEEPGRAM_SECRET:-quipsly-deepgram-api-key}"
service_account="${TRANSCRIPT_SERVICE_ACCOUNT:-quipsly-transcript-worker@${project_id}.iam.gserviceaccount.com}"

if [[ -z "${project_id}" || -z "${media_bucket}" ]]; then
  echo "PROJECT_ID and QUIPSLY_MEDIA_BUCKET are required." >&2
  exit 2
fi
if [[ ! "${project_id}" =~ ^[a-z][a-z0-9-]{4,62}$ ]] \
  || [[ ! "${media_bucket}" =~ ^[a-z0-9][a-z0-9._-]{1,220}[a-z0-9]$ ]] \
  || [[ ! "${job_name}" =~ ^[a-z][a-z0-9-]{0,62}$ ]] \
  || [[ ! "${deepgram_secret}" =~ ^[A-Za-z][A-Za-z0-9_-]{0,254}$ ]]; then
  echo "Project, bucket, job, or secret name is unsafe." >&2
  exit 2
fi

enabled_secret_version="$(
  gcloud secrets versions list "${deepgram_secret}" \
    --project="${project_id}" \
    --filter='state=ENABLED' \
    --sort-by='~createTime' \
    --limit=1 \
    --format='value(name)' 2>/dev/null || true
)"
if [[ -z "${enabled_secret_version}" ]]; then
  echo "Secret ${deepgram_secret} needs an enabled version before deployment." >&2
  exit 1
fi

source_sha="$(git -C "${repo_root}" rev-parse --verify "${source_ref}^{commit}")"
image_tag="${IMAGE_TAG:-source-${source_sha:0:16}}"
image_uri="${region}-docker.pkg.dev/${project_id}/${artifact_repository}/${image_name}:${image_tag}"
release_root="$(mktemp -d "${TMPDIR:-/tmp}/quipsly-transcript-release.XXXXXX")"
release_context="${release_root}/context"

cleanup() {
  if [[ -f "${release_context}/.quipsly-release-context" ]]; then
    rm -rf -- "${release_root}"
  else
    echo "Refusing to remove unmarked transcript release directory: ${release_root}" >&2
  fi
}
trap cleanup EXIT

release_context="$(
  bash "${repo_root}/scripts/release/materialize-release-context.sh" \
    quipsly-transcript-worker \
    "${source_sha}" \
    "${release_context}"
)"

pnpm --dir "${repo_root}" \
  --filter @high-ground/quipsly-media-processing typecheck
pnpm --dir "${repo_root}" --filter quipsly-transcript-worker build
pnpm --dir "${repo_root}" quipsly:transcript-worker:test

gcloud builds submit "${release_context}" \
  --project="${project_id}" \
  --config="${release_context}/cloudbuild.quipsly-transcript-worker.yaml" \
  --substitutions="_REGION=${region},_ARTIFACT_REPOSITORY=${artifact_repository},_IMAGE_NAME=${image_name},_IMAGE_TAG=${image_tag}"

image_digest="$(
  gcloud artifacts docker images describe "${image_uri}" \
    --project="${project_id}" \
    --format='value(image_summary.digest)'
)"
if [[ ! "${image_digest}" =~ ^sha256:[0-9a-f]{64}$ ]]; then
  echo "Could not read back transcript worker image digest for ${image_uri}." >&2
  exit 1
fi
immutable_image="${region}-docker.pkg.dev/${project_id}/${artifact_repository}/${image_name}@${image_digest}"

gcloud run jobs deploy "${job_name}" \
  --project="${project_id}" \
  --region="${region}" \
  --image="${immutable_image}" \
  --service-account="${service_account}" \
  --tasks=1 \
  --parallelism=1 \
  --task-timeout=6h \
  --max-retries=2 \
  --cpu=1 \
  --memory=1Gi \
  --set-env-vars="QUIPSLY_MEDIA_BUCKET=${media_bucket},QUIPSLY_WORKER_BUILD_ID=${source_sha},QUIPSLY_WORKER_IMAGE_DIGEST=${image_digest},QUIPSLY_TRANSCRIPT_WORKER_JOB_LIMIT=1,QUIPSLY_TRANSCRIPT_WORKER_LEASE_MS=21600000,QUIPSLY_TRANSCRIPT_SIGNED_URL_MS=21600000" \
  --set-secrets="DEEPGRAM_API_KEY=${deepgram_secret}:latest" \
  --quiet

job_json="$(
  gcloud run jobs describe "${job_name}" \
    --project="${project_id}" \
    --region="${region}" \
    --format=json
)"
JOB_JSON="${job_json}" \
EXPECTED_IMAGE="${immutable_image}" \
EXPECTED_SERVICE_ACCOUNT="${service_account}" \
EXPECTED_BUCKET="${media_bucket}" \
EXPECTED_BUILD_ID="${source_sha}" \
EXPECTED_SECRET="${deepgram_secret}" \
node <<'NODE'
const job = JSON.parse(process.env.JOB_JSON || "{}");
const template =
  job.template?.template
  || job.spec?.template?.spec?.template?.spec;
const container = template?.containers?.[0];
const env = Object.fromEntries(
  (container?.env || []).map((entry) => [entry.name, entry]),
);
const failures = [];
if (container?.image !== process.env.EXPECTED_IMAGE) {
  failures.push("immutable image");
}
if (
  template?.serviceAccount !== process.env.EXPECTED_SERVICE_ACCOUNT
  && template?.serviceAccountName
    !== process.env.EXPECTED_SERVICE_ACCOUNT
) {
  failures.push("service account");
}
if (env.QUIPSLY_MEDIA_BUCKET?.value !== process.env.EXPECTED_BUCKET) {
  failures.push("bucket");
}
if (env.QUIPSLY_WORKER_BUILD_ID?.value !== process.env.EXPECTED_BUILD_ID) {
  failures.push("build id");
}
if (env.QUIPSLY_TRANSCRIPT_WORKER_JOB_LIMIT?.value !== "1") {
  failures.push("job limit");
}
const secret =
  env.DEEPGRAM_API_KEY?.valueSource?.secretKeyRef?.secret
  || env.DEEPGRAM_API_KEY?.valueFrom?.secretKeyRef?.name;
if (
  secret !== process.env.EXPECTED_SECRET
  && !String(secret || "").endsWith(
    `/secrets/${process.env.EXPECTED_SECRET}`,
  )
) {
  failures.push("Deepgram secret reference");
}
if (typeof env.DEEPGRAM_API_KEY?.value === "string") {
  failures.push("plaintext Deepgram value");
}
if (failures.length) {
  throw new Error(
    `Transcript worker readback mismatch: ${failures.join(", ")}`,
  );
}
console.log(
  "PASS Transcript worker job readback matches its immutable release contract.",
);
NODE

echo "Deployed ${job_name} from committed source ${source_sha}."
echo "The job was not executed. Apply least-privilege access and run an isolated fixture first."
