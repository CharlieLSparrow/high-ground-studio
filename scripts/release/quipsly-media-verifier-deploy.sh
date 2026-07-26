#!/usr/bin/env bash
set -euo pipefail

repo_root="$(git rev-parse --show-toplevel)"
project_id="${PROJECT_ID:-$(gcloud config get-value project 2>/dev/null || true)}"
region="${REGION:-us-central1}"
artifact_repository="${ARTIFACT_REPOSITORY:-high-ground-studio}"
image_name="${IMAGE_NAME:-quipsly-media-verifier}"
job_name="${JOB_NAME:-quipsly-media-verifier}"
source_ref="${SOURCE_REF:-HEAD}"
media_bucket="${QUIPSLY_MEDIA_BUCKET:-}"
service_account="${VERIFIER_SERVICE_ACCOUNT:-quipsly-media-verifier@${project_id}.iam.gserviceaccount.com}"

if [[ -z "${project_id}" || -z "${media_bucket}" ]]; then
  echo "PROJECT_ID and QUIPSLY_MEDIA_BUCKET are required." >&2
  exit 2
fi

source_sha="$(git -C "${repo_root}" rev-parse --verify "${source_ref}^{commit}")"
image_tag="${IMAGE_TAG:-source-${source_sha:0:16}}"
image_uri="${region}-docker.pkg.dev/${project_id}/${artifact_repository}/${image_name}:${image_tag}"
release_root="$(mktemp -d "${TMPDIR:-/tmp}/quipsly-verifier-release.XXXXXX")"
release_context="${release_root}/context"

cleanup() {
  if [[ -f "${release_context}/.quipsly-release-context" ]]; then
    rm -rf -- "${release_root}"
  else
    echo "Refusing to remove unmarked verifier release directory: ${release_root}" >&2
  fi
}
trap cleanup EXIT

release_context="$(
  bash "${repo_root}/scripts/release/materialize-release-context.sh" \
    quipsly-media-verifier \
    "${source_sha}" \
    "${release_context}"
)"

pnpm --dir "${repo_root}" --filter @high-ground/quipsly-capture-verification typecheck
pnpm --dir "${repo_root}" --filter quipsly-media-verifier build
node --experimental-strip-types \
  --import "${repo_root}/scripts/register-ts-extension-loader.mjs" \
  --test "${repo_root}/scripts/quipsly-long-source-verification-worker.test.mjs"

gcloud builds submit "${release_context}" \
  --project="${project_id}" \
  --config="${release_context}/cloudbuild.quipsly-media-verifier.yaml" \
  --substitutions="_REGION=${region},_ARTIFACT_REPOSITORY=${artifact_repository},_IMAGE_NAME=${image_name},_IMAGE_TAG=${image_tag}"

image_digest="$(
  gcloud artifacts docker images describe "${image_uri}" \
    --project="${project_id}" \
    --format='value(image_summary.digest)'
)"
if [[ ! "${image_digest}" =~ ^sha256:[0-9a-f]{64}$ ]]; then
  echo "Could not read back verifier image digest for ${image_uri}." >&2
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
  --task-timeout=24h \
  --max-retries=2 \
  --cpu=2 \
  --memory=1Gi \
  --set-env-vars="QUIPSLY_MEDIA_BUCKET=${media_bucket},QUIPSLY_WORKER_BUILD_ID=${source_sha},QUIPSLY_WORKER_IMAGE_DIGEST=${image_digest},QUIPSLY_VERIFIER_RECEIPT_LIMIT=8,QUIPSLY_VERIFIER_LEASE_MS=86400000" \
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
node <<'NODE'
const job = JSON.parse(process.env.JOB_JSON || "{}");
const template = job.template?.template || job.spec?.template?.spec?.template?.spec;
const container = template?.containers?.[0];
const env = Object.fromEntries(
  (container?.env || []).map((entry) => [entry.name, entry.value]),
);
const failures = [];
if (container?.image !== process.env.EXPECTED_IMAGE) failures.push("immutable image");
if (template?.serviceAccount !== process.env.EXPECTED_SERVICE_ACCOUNT
  && template?.serviceAccountName !== process.env.EXPECTED_SERVICE_ACCOUNT) {
  failures.push("service account");
}
if (env.QUIPSLY_MEDIA_BUCKET !== process.env.EXPECTED_BUCKET) failures.push("bucket");
if (env.QUIPSLY_WORKER_BUILD_ID !== process.env.EXPECTED_BUILD_ID) failures.push("build id");
if (env.QUIPSLY_VERIFIER_RECEIPT_LIMIT !== "8") failures.push("receipt limit");
if (failures.length) throw new Error(`Verifier readback mismatch: ${failures.join(", ")}`);
console.log("PASS Verifier job readback matches its immutable release contract.");
NODE

echo "Deployed ${job_name} from committed source ${source_sha}."
echo "The job was not executed. Enable Nest invocation only after IAM and a synthetic fixture pass."
