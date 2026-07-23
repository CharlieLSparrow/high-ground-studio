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

if [[ -z "${PROJECT_ID}" ]]; then
  echo "PROJECT_ID is required or gcloud must have a default project." >&2
  exit 2
fi

IMAGE_URI="${REGION}-docker.pkg.dev/${PROJECT_ID}/${ARTIFACT_REPOSITORY}/${IMAGE_NAME}:${IMAGE_TAG}"

echo "=========================================================="
echo "🛡️  Running Beta Manifest Scan..."
echo "=========================================================="
if ! node scripts/scan-beta-blockers.mjs; then
  echo ""
  echo "❌ ABORTING DEPLOY: Beta manifest scan failed. Please resolve blockers listed above." >&2
  exit 1
fi
echo "=========================================================="

if [[ "${SKIP_BUILD:-0}" == "1" || "${SKIP_CLOUD_BUILD:-0}" == "1" ]]; then
  echo "Using existing Quipsly image ${IMAGE_URI}"
else
  echo "Building Quipsly image ${IMAGE_URI}"
  gcloud builds submit \
    --config "${CLOUD_BUILD_CONFIG}" \
    --substitutions "_REGION=${REGION},_ARTIFACT_REPOSITORY=${ARTIFACT_REPOSITORY},_IMAGE_NAME=${IMAGE_NAME},_IMAGE_TAG=${IMAGE_TAG}" \
    .
fi

echo "Deploying no-traffic preview revision for ${SERVICE_NAME}"
gcloud run deploy "${SERVICE_NAME}" \
  --image="${IMAGE_URI}" \
  --region="${REGION}" \
  --no-traffic \
  --tag="${PREVIEW_TAG}" \
  --update-secrets="NEXTAUTH_SECRET=studio-nextauth-secret:latest,PATREON_WEBHOOK_SECRET=studio-patreon-webhook-secret:latest,PATREON_RECONCILE_SECRET=studio-patreon-reconcile-secret:latest" \
  --update-env-vars="QUIPSLY_IMAGE_TAG=${IMAGE_TAG},QUIPSLY_SOURCE_SHA=${SOURCE_SHA},QUIPSLY_RELEASE_CHANNEL=preview,QUIPSLY_DEPLOYED_BY=${DEPLOYED_BY},QUIPSLY_APP_HOST=nest.quipsly.com,QUIPSLY_MARKETING_HOST=quipsly.com,QUIPSLY_LEGACY_STUDIO_HOST=studio-hm2odnvjga-uc.a.run.app,NEXT_PUBLIC_STUDIO_COLLAB_URL=wss://studio-collab-hm2odnvjga-uc.a.run.app,STUDIO_COLLAB_URL=wss://studio-collab-hm2odnvjga-uc.a.run.app" \
  --quiet

echo "Preview revision deployed."
echo "Find preview URL with:"
echo "  gcloud run services describe ${SERVICE_NAME} --region ${REGION} --format='json(status.traffic)'"
echo "Then smoke it with:"
echo "  PREVIEW_URL=<preview-url> scripts/release/quipsly-smoke-preview.sh"
echo "  QUIPSLY_AUTH_SMOKE_BASE_URL=<preview-url> QUIPSLY_AUTH_SMOKE_EMAIL=<operator-email> QUIPSLY_AUTH_SMOKE_PASSWORD=<operator-password> node scripts/quipsly-firebase-auth-smoke.mjs"
