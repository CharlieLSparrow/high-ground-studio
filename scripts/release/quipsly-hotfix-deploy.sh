#!/usr/bin/env bash
set -euo pipefail

REGION="${REGION:-us-central1}"
ARTIFACT_REPOSITORY="${ARTIFACT_REPOSITORY:-high-ground-studio}"
IMAGE_NAME="${IMAGE_NAME:-studio}"
SERVICE_NAME="${SERVICE_NAME:-studio}"
PROJECT_ID="${PROJECT_ID:-$(gcloud config get-value project 2>/dev/null || true)}"
IMAGE_TAG="${IMAGE_TAG:-hotfix-$(date +%Y%m%d-%H%M%S)}"
export PREVIEW_TAG="${PREVIEW_TAG:-quipsly-hotfix}"
SOURCE_SHA="${SOURCE_SHA:-manual-hotfix}"
DEPLOYED_BY="${DEPLOYED_BY:-$(whoami)}"
CLOUD_BUILD_CONFIG="${CLOUD_BUILD_CONFIG:-cloudbuild.quipsly-hotfix.yaml}"
LOCAL_TARGET_URL="${LOCAL_TARGET_URL:-http://127.0.0.1:3012}"
RUN_TYPECHECK="${RUN_TYPECHECK:-1}"
RUN_LOCAL_SMOKE="${RUN_LOCAL_SMOKE:-auto}"
RUN_LOCAL_BUILD="${RUN_LOCAL_BUILD:-0}"
SKIP_CLOUD_BUILD="${SKIP_CLOUD_BUILD:-0}"
PROMOTE="${PROMOTE:-0}"
LIVE_URL="${LIVE_URL:-https://nest.quipsly.com}"
EXTRA_UPDATE_ENV_VARS="${EXTRA_UPDATE_ENV_VARS:-}"

if [[ -z "${PROJECT_ID}" ]]; then
  echo "PROJECT_ID is required or gcloud must have a default project." >&2
  exit 2
fi

IMAGE_URI="${REGION}-docker.pkg.dev/${PROJECT_ID}/${ARTIFACT_REPOSITORY}/${IMAGE_NAME}:${IMAGE_TAG}"
IMAGE_REPOSITORY="${REGION}-docker.pkg.dev/${PROJECT_ID}/${ARTIFACT_REPOSITORY}/${IMAGE_NAME}"

echo "=========================================================="
echo "Quipsly targeted hotfix deploy"
echo "=========================================================="
echo "Service:       ${SERVICE_NAME}"
echo "Image:         ${IMAGE_URI}"
echo "Preview tag:   ${PREVIEW_TAG}"
echo "Promote live:  ${PROMOTE}"
if [[ -n "${EXTRA_UPDATE_ENV_VARS}" ]]; then
  echo "Extra env:     ${EXTRA_UPDATE_ENV_VARS}"
fi
echo ""
echo "This lane intentionally skips the beta manifest scan."
echo "Use scripts/release/quipsly-deploy-preview.sh for full beta releases."
echo "=========================================================="

if [[ "${RUN_TYPECHECK}" == "1" ]]; then
  echo "Running Quipsly typecheck"
  pnpm --filter quipsly exec tsc --noEmit --incremental false
fi

if [[ "${RUN_LOCAL_BUILD}" == "1" ]]; then
  echo "Running local Quipsly build"
  pnpm --filter quipsly build
fi

if [[ "${RUN_LOCAL_SMOKE}" == "1" ]]; then
  TARGET_URL="${LOCAL_TARGET_URL}" bash scripts/dev/quipsly-local-smoke.sh
elif [[ "${RUN_LOCAL_SMOKE}" == "auto" ]]; then
  if curl -fsS --max-time 5 "${LOCAL_TARGET_URL}/api/auth/signin?callbackUrl=%2Fprojects" >/dev/null 2>&1; then
    TARGET_URL="${LOCAL_TARGET_URL}" bash scripts/dev/quipsly-local-smoke.sh
  else
    echo "Local Quipsly server not reachable at ${LOCAL_TARGET_URL}; skipping local smoke."
    echo "Start it with: pnpm --filter quipsly exec next dev -p 3012"
  fi
fi

if [[ "${SKIP_CLOUD_BUILD}" == "1" ]]; then
  echo "Using existing image ${IMAGE_URI}"
else
  echo "Building hotfix image with ${CLOUD_BUILD_CONFIG}"
  gcloud builds submit \
    --config "${CLOUD_BUILD_CONFIG}" \
    --substitutions "_REGION=${REGION},_ARTIFACT_REPOSITORY=${ARTIFACT_REPOSITORY},_IMAGE_NAME=${IMAGE_NAME},_IMAGE_TAG=${IMAGE_TAG}" \
    .
fi

echo "Verifying image tag exists in Artifact Registry"
if ! gcloud artifacts docker tags list "${IMAGE_REPOSITORY}" \
  --filter="tag~${IMAGE_TAG}$" \
  --format="value(tag)" | grep -q "${IMAGE_TAG}$"; then
  echo "Could not verify image tag ${IMAGE_TAG} in ${IMAGE_REPOSITORY}." >&2
  echo "If Cloud Build just reported a transient image-verification issue, inspect Artifact Registry before retrying." >&2
  exit 1
fi

echo "Deploying no-traffic hotfix revision"
UPDATE_ENV_VARS="QUIPSLY_IMAGE_TAG=${IMAGE_TAG},QUIPSLY_SOURCE_SHA=${SOURCE_SHA},QUIPSLY_RELEASE_CHANNEL=hotfix,QUIPSLY_DEPLOYED_BY=${DEPLOYED_BY},QUIPSLY_APP_HOST=nest.quipsly.com,QUIPSLY_MARKETING_HOST=quipsly.com,QUIPSLY_LEGACY_STUDIO_HOST=studio-hm2odnvjga-uc.a.run.app"
if [[ -n "${EXTRA_UPDATE_ENV_VARS}" ]]; then
  UPDATE_ENV_VARS="${UPDATE_ENV_VARS},${EXTRA_UPDATE_ENV_VARS}"
fi

gcloud run deploy "${SERVICE_NAME}" \
  --image="${IMAGE_URI}" \
  --region="${REGION}" \
  --no-traffic \
  --tag="${PREVIEW_TAG}" \
  --update-env-vars="${UPDATE_ENV_VARS}" \
  --quiet

PREVIEW_URL="$(gcloud run services describe "${SERVICE_NAME}" \
  --region "${REGION}" \
  --format=json | node -e '
    const fs = require("fs");
    const service = JSON.parse(fs.readFileSync(0, "utf8"));
    const tag = process.env.PREVIEW_TAG;
    const traffic = service.status?.traffic || [];
    const match = traffic.find((entry) => entry.tag === tag);
    if (!match?.url) process.exit(1);
    console.log(match.url);
  ')"

echo "Preview URL: ${PREVIEW_URL}"
TARGET_URL="${PREVIEW_URL}" bash scripts/dev/quipsly-local-smoke.sh

if [[ "${PROMOTE}" == "1" ]]; then
  echo "Promoting ${PREVIEW_TAG} to 100% live traffic"
  gcloud run services update-traffic "${SERVICE_NAME}" \
    --region="${REGION}" \
    --to-tags="${PREVIEW_TAG}=100" \
    --quiet

  echo "Running live smoke against ${LIVE_URL}"
  TARGET_URL="${LIVE_URL}" bash scripts/dev/quipsly-local-smoke.sh
else
  echo "Hotfix preview is ready but not promoted."
  echo "Promote after review with:"
  echo "  PROMOTE=1 SKIP_CLOUD_BUILD=1 IMAGE_TAG=${IMAGE_TAG} PREVIEW_TAG=${PREVIEW_TAG} EXTRA_UPDATE_ENV_VARS='${EXTRA_UPDATE_ENV_VARS}' bash scripts/release/quipsly-hotfix-deploy.sh"
fi
