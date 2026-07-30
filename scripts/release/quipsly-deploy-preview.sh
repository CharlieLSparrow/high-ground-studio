#!/usr/bin/env bash
set -euo pipefail

REGION="${REGION:-us-central1}"
ARTIFACT_REPOSITORY="${ARTIFACT_REPOSITORY:-high-ground-studio}"
IMAGE_NAME="${IMAGE_NAME:-studio}"
SERVICE_NAME="${SERVICE_NAME:-studio}"
PROJECT_ID="${PROJECT_ID:-$(gcloud config get-value project 2>/dev/null || true)}"
IMAGE_TAG="${IMAGE_TAG:-preview-$(date +%Y%m%d-%H%M%S)}"
PREVIEW_TAG="${PREVIEW_TAG:-quipsly-preview}"
SOURCE_SHA="${SOURCE_SHA:-manual-preview}"
DEPLOYED_BY="${DEPLOYED_BY:-$(whoami)}"
CLOUD_BUILD_CONFIG="${CLOUD_BUILD_CONFIG:-cloudbuild.quipsly-web.yaml}"
SOURCE_REF="${SOURCE_REF:-HEAD}"
RELEASE_SMOKE_SECRET_NAME="${RELEASE_SMOKE_SECRET_NAME:-quipsly-release-smoke-secret}"
RELEASE_SMOKE_SECRET_VERSION="${RELEASE_SMOKE_SECRET_VERSION:-latest}"
IMAGE_PROXY_TOKEN_SECRET_NAME="${IMAGE_PROXY_TOKEN_SECRET_NAME:-reefball-image-proxy-token}"
IMAGE_PROXY_TOKEN_SECRET_VERSION="${IMAGE_PROXY_TOKEN_SECRET_VERSION:-latest}"

if [[ -z "${PROJECT_ID}" ]]; then
  echo "PROJECT_ID is required or gcloud must have a default project." >&2
  exit 2
fi

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
IMAGE_URI="${REGION}-docker.pkg.dev/${PROJECT_ID}/${ARTIFACT_REPOSITORY}/${IMAGE_NAME}:${IMAGE_TAG}"

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

if [[ "${SKIP_BUILD:-0}" == "1" || "${SKIP_CLOUD_BUILD:-0}" == "1" ]]; then
  echo "Using existing Quipsly image ${IMAGE_URI}"
else
  echo "Building Quipsly image ${IMAGE_URI} from committed source ${SOURCE_SHA}"
  gcloud builds submit \
    --config "${release_context}/${CLOUD_BUILD_CONFIG}" \
    --substitutions "_REGION=${REGION},_ARTIFACT_REPOSITORY=${ARTIFACT_REPOSITORY},_IMAGE_NAME=${IMAGE_NAME},_IMAGE_TAG=${IMAGE_TAG},_QUIPSLY_BUILD_ID=${SOURCE_SHA}" \
    "${release_context}"
fi

echo "Deploying no-traffic preview revision for ${SERVICE_NAME}"
gcloud run deploy "${SERVICE_NAME}" \
  --image="${IMAGE_URI}" \
  --region="${REGION}" \
  --no-traffic \
  --tag="${PREVIEW_TAG}" \
  --remove-secrets="NEXTAUTH_SECRET,PATREON_WEBHOOK_SECRET,PATREON_RECONCILE_SECRET" \
  --update-secrets="QUIPSLY_RELEASE_SMOKE_SECRET=${RELEASE_SMOKE_SECRET_NAME}:${RELEASE_SMOKE_SECRET_VERSION},REEFBALL_IMAGE_PROXY_TOKEN_SECRET=${IMAGE_PROXY_TOKEN_SECRET_NAME}:${IMAGE_PROXY_TOKEN_SECRET_VERSION}" \
  --update-env-vars="FIREBASE_CUSTOM_TOKEN_SERVICE_ACCOUNT=firebase-adminsdk-fbsvc@quipsly-reef.iam.gserviceaccount.com,QUIPSLY_IMAGE_TAG=${IMAGE_TAG},QUIPSLY_SOURCE_SHA=${SOURCE_SHA},QUIPSLY_RELEASE_CHANNEL=preview,QUIPSLY_DEPLOYED_BY=${DEPLOYED_BY},QUIPSLY_APP_HOST=nest.quipsly.com,QUIPSLY_MARKETING_HOST=quipsly.com,QUIPSLY_LEGACY_STUDIO_HOST=studio-hm2odnvjga-uc.a.run.app,NEXT_PUBLIC_STUDIO_COLLAB_URL=wss://studio-collab-hm2odnvjga-uc.a.run.app,STUDIO_COLLAB_URL=wss://studio-collab-hm2odnvjga-uc.a.run.app" \
  --quiet

echo "Preview revision deployed."
echo "Find preview URL with:"
echo "  gcloud run services describe ${SERVICE_NAME} --region ${REGION} --format='json(status.traffic)'"
echo "Then smoke it with:"
echo "  QUIPSLY_RELEASE_SMOKE_SECRET=\"\$(gcloud secrets versions access ${RELEASE_SMOKE_SECRET_VERSION} --secret=${RELEASE_SMOKE_SECRET_NAME} --project=${PROJECT_ID})\" \\"
echo "    QUIPSLY_AUTH_SMOKE_EMAIL=<reviewer-email> QUIPSLY_AUTH_SMOKE_PASSWORD=<secure-env-value> \\"
echo "    PREVIEW_URL=<preview-url> scripts/release/quipsly-smoke-preview.sh"
