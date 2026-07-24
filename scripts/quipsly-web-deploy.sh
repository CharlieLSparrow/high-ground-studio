#!/usr/bin/env bash
set -euo pipefail

# Quipsly web deploy:
# - stages a web-runtime-only Cloud Build context
# - includes all files required by the Next standalone build, including public assets
# - excludes native Mac, local-engine, generated builds, local media, docs, reports, and scratch
# - builds inside Linux Cloud Build, then deploys only the new image to the existing Cloud Run service
# - can optionally run the broader HGO/Quipsly/Nest public integration smoke after preview/live deploy
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
NO_TRAFFIC="${NO_TRAFFIC:-0}"
PREVIEW_TAG="${PREVIEW_TAG:-quipsly-web-preview}"
RUN_PREVIEW_SMOKE="${RUN_PREVIEW_SMOKE:-1}"
RUN_PUBLIC_INTEGRATION_SMOKE="${RUN_PUBLIC_INTEGRATION_SMOKE:-1}"
PUBLIC_INTEGRATION_STRICT="${PUBLIC_INTEGRATION_STRICT:-0}"
REMOTE_IGNORE_TYPE_ERRORS="${REMOTE_IGNORE_TYPE_ERRORS:-${QUIPSLY_DOCKER_IGNORE_TYPE_ERRORS:-0}}"
CLOUD_BUILD_NODE_OPTIONS="${CLOUD_BUILD_NODE_OPTIONS:-${NODE_OPTIONS:---max-old-space-size=8192}}"
QUIPSLY_BUILD_ID="${QUIPSLY_BUILD_ID:-${TAG}}"

if [[ -z "${PROJECT_ID}" ]]; then
  echo "PROJECT_ID is required or gcloud must have a default project." >&2
  exit 2
fi

cd "$ROOT_DIR"

if [[ "${LOCAL_VALIDATE}" == "1" ]]; then
  echo "Running local Quipsly validation before remote build."
  if [[ -x "apps/quipsly/node_modules/.bin/tsc" && -x "apps/quipsly/node_modules/.bin/next" ]]; then
    echo "Using existing apps/quipsly local toolchain to avoid unrelated workspace install drift."
    apps/quipsly/node_modules/.bin/tsc --noEmit --project apps/quipsly/tsconfig.json --incremental false
    (
      cd apps/quipsly
      NODE_OPTIONS="${NODE_OPTIONS:---max-old-space-size=4096}" ./node_modules/.bin/next build
    )
  else
    echo "apps/quipsly local toolchain missing; falling back to pnpm filter validation."
    pnpm --filter quipsly exec tsc --noEmit --incremental false
    pnpm --filter quipsly build
  fi
else
  if [[ "${REMOTE_IGNORE_TYPE_ERRORS}" == "1" ]]; then
    echo "REMOTE_IGNORE_TYPE_ERRORS=1 requires LOCAL_VALIDATE=1 so TypeScript is still proved before Docker packaging." >&2
    exit 1
  fi
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
copy_file scripts/prisma-generate-workspace-clients.mjs
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
if [[ "${NO_TRAFFIC}" == "1" ]]; then
  echo "NO_TRAFFIC=1 set; deploy will create a tagged preview revision (${PREVIEW_TAG}) and will not move live traffic."
fi
if [[ "${RUN_PUBLIC_INTEGRATION_SMOKE}" == "1" ]]; then
  echo "Public integration smoke: enabled ($([[ "${PUBLIC_INTEGRATION_STRICT}" == "1" ]] && echo "strict" || echo "warn-only"))"
fi

if [[ "${STAGE_ONLY}" == "1" ]]; then
  echo "STAGE_ONLY=1 set; context staged but no Cloud Build or deploy was started."
  exit 0
fi

IMAGE="${REGION}-docker.pkg.dev/${PROJECT_ID}/${ARTIFACT_REPOSITORY}/${IMAGE_NAME}:${TAG}"

run_public_integration_smoke() {
  local nest_url="$1"
  if [[ "${RUN_PUBLIC_INTEGRATION_SMOKE}" != "1" ]]; then
    return
  fi
  if [[ ! -f "${ROOT_DIR}/scripts/hgo-quipsly-public-integration-smoke.mjs" ]]; then
    echo "Public integration smoke script is missing: scripts/hgo-quipsly-public-integration-smoke.mjs" >&2
    exit 1
  fi

  local smoke_args=("--json" "--nest-base-url=${nest_url}")
  if [[ "${PUBLIC_INTEGRATION_STRICT}" != "1" ]]; then
    smoke_args+=("--warn-only")
  fi

  echo "Running HGO/Quipsly/Nest public integration smoke with Nest base ${nest_url}."
  node "${ROOT_DIR}/scripts/hgo-quipsly-public-integration-smoke.mjs" "${smoke_args[@]}"
}

set +e
gcloud builds submit "$CTX" \
  --project "$PROJECT_ID" \
  --config "$ROOT_DIR/$CLOUDBUILD_CONFIG" \
  --substitutions "_REGION=${REGION},_ARTIFACT_REPOSITORY=${ARTIFACT_REPOSITORY},_IMAGE_NAME=${IMAGE_NAME},_IMAGE_TAG=${TAG},_QUIPSLY_DOCKER_IGNORE_TYPE_ERRORS=${REMOTE_IGNORE_TYPE_ERRORS},_QUIPSLY_BUILD_ID=${QUIPSLY_BUILD_ID},_NODE_OPTIONS=${CLOUD_BUILD_NODE_OPTIONS}"
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
deploy_args=(
  "$SERVICE_NAME"
  --project "$PROJECT_ID"
  --region "$REGION"
  --image "$IMAGE"
  --quiet
)

if [[ "${NO_TRAFFIC}" == "1" ]]; then
  deploy_args+=(--no-traffic --tag "$PREVIEW_TAG")
fi

gcloud run deploy "${deploy_args[@]}"

if [[ "${NO_TRAFFIC}" == "1" ]]; then
  echo "Preview revision deployed without live traffic."

  PREVIEW_URL="$(PREVIEW_TAG="${PREVIEW_TAG}" gcloud run services describe "${SERVICE_NAME}" \
    --project "${PROJECT_ID}" \
    --region "${REGION}" \
    --format='json(status.traffic)' \
    | node -e '
      let input = "";
      process.stdin.on("data", (chunk) => input += chunk);
      process.stdin.on("end", () => {
        const tag = process.env.PREVIEW_TAG;
        const payload = JSON.parse(input || "{}");
        const traffic = payload?.status?.traffic || payload?.traffic || [];
        const tagged = Array.isArray(traffic) ? traffic.find((item) => item?.tag === tag && item?.url) : null;
        if (tagged?.url) console.log(tagged.url);
      });
    ')"

  if [[ -n "${PREVIEW_URL}" ]]; then
    echo "Preview URL: ${PREVIEW_URL}"
  else
    echo "Could not resolve tagged preview URL for ${PREVIEW_TAG}." >&2
    echo "Inspect traffic with:" >&2
    echo "  gcloud run services describe ${SERVICE_NAME} --project ${PROJECT_ID} --region ${REGION} --format='json(status.traffic)'" >&2
    if [[ "${RUN_PREVIEW_SMOKE}" == "1" ]]; then
      echo "RUN_PREVIEW_SMOKE=1 requires a tagged preview URL." >&2
      exit 1
    fi
  fi

  if [[ "${RUN_PREVIEW_SMOKE}" == "1" ]]; then
    if [[ ! -f "${ROOT_DIR}/scripts/quipsly-coaching-public-handoff-smoke.mjs" ]]; then
      echo "Preview smoke script is missing: scripts/quipsly-coaching-public-handoff-smoke.mjs" >&2
      exit 1
    fi
    echo "Running public coaching handoff smoke against preview."
    node "${ROOT_DIR}/scripts/quipsly-coaching-public-handoff-smoke.mjs" --base-url="${PREVIEW_URL}" --json
    echo "Preview public coaching handoff smoke passed."
    run_public_integration_smoke "${PREVIEW_URL}"
  else
    echo "RUN_PREVIEW_SMOKE=0 set; preview route smoke skipped."
    run_public_integration_smoke "${PREVIEW_URL}"
  fi

  echo "Promote only after preview smokes pass. To promote:"
  echo "  gcloud run services update-traffic ${SERVICE_NAME} --project ${PROJECT_ID} --region ${REGION} --to-tags ${PREVIEW_TAG}=100 --quiet"
  echo "Deployed $IMAGE"
  exit 0
fi

LATEST_CREATED_REVISION="$(gcloud run services describe "$SERVICE_NAME" \
  --project "$PROJECT_ID" \
  --region "$REGION" \
  --format='value(status.latestCreatedRevisionName)' 2>/dev/null || true)"

if [[ -n "$LATEST_CREATED_REVISION" ]]; then
  echo "Routing 100% service traffic to latest created revision ${LATEST_CREATED_REVISION}."
  gcloud run services update-traffic "$SERVICE_NAME" \
    --project "$PROJECT_ID" \
    --region "$REGION" \
    --to-revisions "${LATEST_CREATED_REVISION}=100" \
    --quiet
fi

run_public_integration_smoke "https://nest.quipsly.com"

echo "Deployed $IMAGE"
