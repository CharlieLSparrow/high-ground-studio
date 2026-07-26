#!/usr/bin/env bash
set -euo pipefail

repo_root="$(git rev-parse --show-toplevel)"
source_ref="${SOURCE_REF:-HEAD}"
test_root="$(mktemp -d "${TMPDIR:-/tmp}/quipsly-context-test.XXXXXX")"
context_dir="${test_root}/context"

cleanup() {
  if [[ -f "${context_dir}/.quipsly-release-context" ]]; then
    rm -rf -- "${test_root}"
  else
    echo "Refusing to remove unmarked release-context test directory: ${test_root}" >&2
  fi
}
trap cleanup EXIT

context="$("${repo_root}/scripts/release/quipsly-build-context.sh" "${source_ref}" "${context_dir}")"
expected_sha="$(git -C "${repo_root}" rev-parse "${source_ref}^{commit}")"

[[ "${context}" == "${context_dir}" ]]
[[ -f "${context}/apps/quipsly/Dockerfile" ]]
[[ -f "${context}/apps/quipsly/src/app/(app)/outputs/page.tsx" ]]
[[ -f "${context}/apps/quipsly/src/app/(app)/outputs/[outputId]/page.tsx" ]]
[[ -f "${context}/packages/quipsly-domain/package.json" ]]
[[ -f "${context}/packages/quipsly-capture-verification/package.json" ]]
[[ -f "${context}/prisma/schema.prisma" ]]
[[ -f "${context}/release/manifests/nest.json" ]]
[[ -f "${context}/quipsly-release-source.json" ]]
[[ -x "${context}/scripts/release/quipsly-normalize-context-metadata.sh" ]]
[[ ! -e "${context}/.git" ]]
[[ ! -e "${context}/apps/web/package.json" ]]
[[ ! -e "${context}/apps/web/src" ]]
[[ ! -e "${context}/apps/QuipslyStudio" ]]
[[ ! -e "${context}/apps/mobile-capture" ]]
[[ ! -e "${context}/node_modules" ]]

node - "${context}" "${repo_root}/release/manifests/nest.json" <<'NODE'
const fs = require("node:fs");
const path = require("node:path");

const context = process.argv[2];
const manifest = JSON.parse(fs.readFileSync(process.argv[3], "utf8"));
for (const requiredPath of manifest.releaseContext.requiredPaths) {
  if (!fs.existsSync(path.join(context, requiredPath))) {
    throw new Error(`Materialized context is missing manifest path: ${requiredPath}`);
  }
}
for (const optionalPath of manifest.releaseContext.optionalPaths) {
  const sourceHasPath = fs.existsSync(path.join(process.cwd(), optionalPath));
  const contextHasPath = fs.existsSync(path.join(context, optionalPath));
  if (sourceHasPath !== contextHasPath) {
    throw new Error(`Optional context path does not match source presence: ${optionalPath}`);
  }
}
NODE

normalize_line="$(
  grep -n -- 'id: normalize-quipsly-context-metadata' \
    "${repo_root}/cloudbuild.quipsly-web.yaml" \
    | cut -d: -f1
)"
build_line="$(
  grep -n -- 'id: build-quipsly-web-image' \
    "${repo_root}/cloudbuild.quipsly-web.yaml" \
    | cut -d: -f1
)"
if [[ -z "${normalize_line}" || -z "${build_line}" || "${normalize_line}" -ge "${build_line}" ]]; then
  echo "Cloud Build must normalize extracted source before Kaniko runs." >&2
  exit 1
fi

cloudbuild_config="${repo_root}/cloudbuild.quipsly-web.yaml"
if grep -Fq '${_IMAGE_NAME}:latest' "${cloudbuild_config}"; then
  echo "Preview-capable Cloud Build must not mutate the production latest alias." >&2
  exit 1
fi
grep -Fq \
  'gcr.io/cloud-builders/docker@sha256:680b2a8d18a794c165cf97a3f9476784d5d962e945d424cb40b3e086cde0c284' \
  "${cloudbuild_config}"
grep -Fq -- '--driver docker-container' "${cloudbuild_config}"
grep -Fq -- '--driver-opt image=moby/buildkit:v0.30.0' "${cloudbuild_config}"
grep -Fq -- '--cache-from "type=registry,ref=$${cache_image}"' \
  "${cloudbuild_config}"
grep -Fq -- \
  '--cache-to "type=registry,ref=$${cache_image},mode=max,compression=zstd,oci-mediatypes=true,image-manifest=true"' \
  "${cloudbuild_config}"
grep -Fq -- '--tag "$${image}"' "${cloudbuild_config}"
grep -Fq -- '--push' "${cloudbuild_config}"

# Simulate Cloud Build source extraction changing metadata, then prove the
# guarded normalizer restores a stable tree before Kaniko receives it.
touch "${context}/package.json" "${context}/pnpm-lock.yaml"
bash "${repo_root}/scripts/release/quipsly-normalize-context-metadata.sh" \
  "${context}"

python3 - "${context}" <<'PY'
import os
import sys

expected_mtime = 946684800
unexpected = []
for root, directories, files in os.walk(sys.argv[1]):
    for name in [*directories, *files]:
        path = os.path.join(root, name)
        actual = int(os.lstat(path).st_mtime)
        if actual != expected_mtime:
            unexpected.append((path, actual))

root_mtime = int(os.lstat(sys.argv[1]).st_mtime)
if root_mtime != expected_mtime:
    unexpected.append((sys.argv[1], root_mtime))

if unexpected:
    preview = "\n".join(f"{path}: {mtime}" for path, mtime in unexpected[:20])
    raise SystemExit(
        "Release context contains non-deterministic mtimes "
        f"(expected {expected_mtime}):\n{preview}"
    )
PY

ignore_probe="${test_root}/gcloud-ignore-probe"
mkdir -p \
  "${ignore_probe}/apps/quipsly/src/app/(app)/outputs/[outputId]" \
  "${ignore_probe}/outputs"
cp "${context}/.gcloudignore" "${ignore_probe}/.gitignore"
touch \
  "${ignore_probe}/apps/quipsly/src/app/(app)/outputs/page.tsx" \
  "${ignore_probe}/apps/quipsly/src/app/(app)/outputs/[outputId]/page.tsx" \
  "${ignore_probe}/outputs/generated.txt"
git -C "${ignore_probe}" init --quiet

if git -C "${ignore_probe}" check-ignore --quiet --no-index \
  "apps/quipsly/src/app/(app)/outputs/page.tsx" ||
  git -C "${ignore_probe}" check-ignore --quiet --no-index \
    "apps/quipsly/src/app/(app)/outputs/[outputId]/page.tsx"; then
  echo "Cloud upload ignore rules remove a required Quipsly route." >&2
  exit 1
fi
git -C "${ignore_probe}" check-ignore --quiet --no-index "outputs/generated.txt"

if command -v gcloud >/dev/null 2>&1; then
  upload_files="$(cd "${context}" && gcloud meta list-files-for-upload .)"
  grep -Fqx "apps/quipsly/src/app/(app)/outputs/page.tsx" <<<"${upload_files}"
  grep -Fqx "apps/quipsly/src/app/(app)/outputs/[outputId]/page.tsx" <<<"${upload_files}"
fi

node - "${context}/quipsly-release-source.json" "${expected_sha}" <<'NODE'
const fs = require("node:fs");

const manifest = JSON.parse(fs.readFileSync(process.argv[2], "utf8"));
if (manifest.schemaVersion !== 1) {
  throw new Error(`Unexpected release manifest version: ${manifest.schemaVersion}`);
}
if (manifest.releaseManifest !== "release/manifests/nest.json") {
  throw new Error(`Unexpected release contract: ${manifest.releaseManifest}`);
}
if (manifest.sourceSha !== process.argv[3]) {
  throw new Error(`Expected source ${process.argv[3]}, got ${manifest.sourceSha}`);
}
if (!/^[a-f0-9]{40}$/.test(manifest.inventorySha1)) {
  throw new Error("Release inventory digest is missing or invalid.");
}
if (manifest.normalizedMtimeUtc !== "2000-01-01T00:00:00Z") {
  throw new Error(
    `Unexpected normalized release mtime: ${manifest.normalizedMtimeUtc}`,
  );
}
NODE

if [[ "${BUILD_CONTAINER:-0}" == "1" ]]; then
  image_tag="quipsly-release-context-smoke:${expected_sha:0:12}"
  docker build \
    --file "${context}/apps/quipsly/Dockerfile" \
    --tag "${image_tag}" \
    "${context}"
  echo "PASS Built ${image_tag} from the bounded release context."
fi

echo "PASS Quipsly release context is committed, bounded, and source-labeled."
