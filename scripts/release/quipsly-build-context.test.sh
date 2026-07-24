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
[[ -f "${context}/prisma/schema.prisma" ]]
[[ -f "${context}/quipsly-release-source.json" ]]
[[ ! -e "${context}/.git" ]]
[[ ! -e "${context}/apps/web/package.json" ]]
[[ ! -e "${context}/apps/web/src" ]]
[[ ! -e "${context}/apps/QuipslyStudio" ]]
[[ ! -e "${context}/apps/mobile-capture" ]]
[[ ! -e "${context}/node_modules" ]]

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
if (manifest.sourceSha !== process.argv[3]) {
  throw new Error(`Expected source ${process.argv[3]}, got ${manifest.sourceSha}`);
}
if (!/^[a-f0-9]{40}$/.test(manifest.inventorySha1)) {
  throw new Error("Release inventory digest is missing or invalid.");
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
