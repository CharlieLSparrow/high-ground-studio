#!/usr/bin/env bash
set -euo pipefail

# Quipsly web deploy:
# - stages a web-runtime-only Cloud Build context
# - includes all files required by the Next standalone build, including public assets
# - excludes native Mac, local-engine, generated builds, local media, docs, reports, and scratch
# - builds inside Linux Cloud Build, then deploys only the new image to the existing Cloud Run service
#
# This script is intentionally not called "fast" because correctness comes first.
# Speed comes from removing unrelated local/native/media artifacts, not from silently dropping assets.

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
REGION="${REGION:-us-central1}"
ARTIFACT_REPOSITORY="${ARTIFACT_REPOSITORY:-high-ground-studio}"
IMAGE_NAME="${IMAGE_NAME:-studio}"
SERVICE_NAME="${SERVICE_NAME:-studio}"
PROJECT_ID="${PROJECT_ID:-$(gcloud config get-value project 2>/dev/null || true)}"
TAG="${1:-${IMAGE_TAG:-quipsly-web-$(date +%Y%m%d-%H%M%S)}}"
CTX="${CTX:-${TMPDIR:-/tmp}/quipsly-web-context-${TAG}}"
CLOUDBUILD_CONFIG="${CLOUDBUILD_CONFIG:-cloudbuild.quipsly-web.yaml}"
LOCAL_VALIDATE="${LOCAL_VALIDATE:-0}"
STAGE_ONLY="${STAGE_ONLY:-0}"

if [[ -z "${PROJECT_ID}" ]]; then
  echo "PROJECT_ID is required or gcloud must have a default project." >&2
  exit 2
fi

cd "$ROOT_DIR"

if [[ "${LOCAL_VALIDATE}" == "1" ]]; then
  echo "Running local Quipsly validation before remote build."
  pnpm --filter quipsly exec tsc --noEmit --incremental false
  pnpm --filter quipsly build
else
  echo "Skipping local validation. Cloud Build will perform the Linux production build."
  echo "Set LOCAL_VALIDATE=1 to run local typecheck/build first."
fi

rm -rf "$CTX"
mkdir -p "$CTX"

copy_file() {
  local src="$1"
  local dest="$CTX/$1"
  if [[ ! -f "$src" ]]; then
    echo "Required deploy file missing: $src" >&2
    exit 2
  fi
  mkdir -p "$(dirname "$dest")"
  cp "$src" "$dest"
}

copy_tree() {
  local src="$1"
  local dest="$CTX/$1"
  if [[ ! -d "$src" ]]; then
    echo "Required deploy directory missing: $src" >&2
    exit 2
  fi
  mkdir -p "$(dirname "$dest")"
  rsync -a --delete \
    --exclude "node_modules" \
    --exclude ".next" \
    --exclude ".turbo" \
    --exclude ".cache" \
    --exclude "dist" \
    --exclude "build" \
    --exclude "coverage" \
    --exclude "tsconfig.tsbuildinfo" \
    --exclude ".DS_Store" \
    "$src/" "$dest/"
}

copy_file package.json
copy_file pnpm-lock.yaml
copy_file pnpm-workspace.yaml
copy_file prisma.config.ts
copy_tree prisma
copy_tree content

mkdir -p "$CTX/scripts"
copy_file scripts/sync-prisma-pnpm-clients.mjs

mkdir -p "$CTX/apps/web" "$CTX/apps/motion-lab"
copy_file apps/web/package.json
copy_file apps/motion-lab/package.json
if [[ -d apps/web/content/publish/hgo-episodes ]]; then
  mkdir -p "$CTX/apps/web/content/publish"
  copy_tree apps/web/content/publish/hgo-episodes
fi

mkdir -p "$CTX/packages"
for package_dir in \
  packages/content-studio-domain \
  packages/quipsly-domain \
  packages/quipsly-document-kernel \
  packages/worldhub-domain \
  packages/studio-domain \
  packages/motion-engine
do
  copy_tree "$package_dir"
done

mkdir -p "$CTX/apps/quipsly"
rsync -a --delete \
  --exclude ".env" \
  --exclude ".env.*" \
  --exclude ".next" \
  --exclude "node_modules" \
  --exclude "tsconfig.tsbuildinfo" \
  --exclude ".turbo" \
  --exclude ".cache" \
  --exclude ".DS_Store" \
  "$ROOT_DIR/apps/quipsly/" "$CTX/apps/quipsly/"

echo "Quipsly web deploy context: $CTX"
du -sh "$CTX"

if [[ "${STAGE_ONLY}" == "1" ]]; then
  echo "STAGE_ONLY=1 set; context staged but no Cloud Build or deploy was started."
  exit 0
fi

IMAGE="${REGION}-docker.pkg.dev/${PROJECT_ID}/${ARTIFACT_REPOSITORY}/${IMAGE_NAME}:${TAG}"

set +e
gcloud builds submit "$CTX" \
  --config "$ROOT_DIR/$CLOUDBUILD_CONFIG" \
  --substitutions "_REGION=${REGION},_ARTIFACT_REPOSITORY=${ARTIFACT_REPOSITORY},_IMAGE_NAME=${IMAGE_NAME},_IMAGE_TAG=${TAG}"
BUILD_STATUS=$?
set -e

if [[ "$BUILD_STATUS" != "0" ]]; then
  echo "Cloud Build returned $BUILD_STATUS. Checking whether Kaniko still pushed $IMAGE..."
  if ! gcloud artifacts docker images describe "$IMAGE" >/dev/null 2>&1; then
    echo "Image was not found after Cloud Build failure: $IMAGE" >&2
    exit "$BUILD_STATUS"
  fi
  echo "Image exists despite Cloud Build failure; continuing with deploy."
fi

echo "Deploying image to Cloud Run service ${SERVICE_NAME} without rewriting env/secrets."
gcloud run deploy "$SERVICE_NAME" \
  --region "$REGION" \
  --image "$IMAGE" \
  --quiet

echo "Deployed $IMAGE"
