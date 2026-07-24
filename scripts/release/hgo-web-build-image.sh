#!/usr/bin/env bash
set -euo pipefail

SOURCE_REF="${1:-${WEB_SOURCE_REF:-HEAD}}"
PROJECT_ID="${WEB_CLOUD_RUN_PROJECT:-${GCLOUD_PROJECT:-}}"
REGION="${WEB_CLOUD_RUN_REGION:-us-central1}"
ARTIFACT_REPOSITORY="${WEB_ARTIFACT_REPOSITORY:-high-ground-studio}"
IMAGE_NAME="${WEB_IMAGE_NAME:-web}"

repo_root="$(git rev-parse --show-toplevel)"
source_sha="$(git -C "${repo_root}" rev-parse --verify "${SOURCE_REF}^{commit}")"
image_tag="${WEB_IMAGE_TAG:-${source_sha}}"
release_context="$(
  bash "${repo_root}/scripts/release/materialize-release-context.sh" \
    hgo-web \
    "${source_sha}"
)"

cleanup() {
  if (
    [[ -n "${release_context:-}" ]]
    && [[ "${release_context}" != "/" ]]
    && [[ -f "${release_context}/.quipsly-release-context" ]]
    && [[ -f "${release_context}/hgo-web-release-source.json" ]]
  ); then
    rm -rf -- "${release_context}"
  else
    echo "Refusing to remove unmarked HGO web release context: ${release_context:-<missing>}" >&2
  fi
}
trap cleanup EXIT

if [[ -z "${PROJECT_ID}" ]]; then
  PROJECT_ID="$(gcloud config get-value project 2>/dev/null || true)"
fi
if [[ -z "${PROJECT_ID}" || "${PROJECT_ID}" == "(unset)" ]]; then
  echo "WEB_CLOUD_RUN_PROJECT, GCLOUD_PROJECT, or the gcloud project is required." >&2
  exit 2
fi

gcloud builds submit \
  --project "${PROJECT_ID}" \
  --config "${release_context}/cloudbuild.web.yaml" \
  --substitutions "_REGION=${REGION},_ARTIFACT_REPOSITORY=${ARTIFACT_REPOSITORY},_IMAGE_NAME=${IMAGE_NAME},_IMAGE_TAG=${image_tag},_SOURCE_SHA=${source_sha}" \
  "${release_context}"

echo "PASS HGO web image built and read back from exact source ${source_sha}."
