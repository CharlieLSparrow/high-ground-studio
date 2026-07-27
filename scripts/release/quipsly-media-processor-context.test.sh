#!/usr/bin/env bash
set -euo pipefail

repo_root="$(git rev-parse --show-toplevel)"
source_ref="${SOURCE_REF:-HEAD}"
test_root="$(mktemp -d "${TMPDIR:-/tmp}/quipsly-processor-context.XXXXXX")"
context_dir="${test_root}/context"

cleanup() {
  if [[ -f "${context_dir}/.quipsly-release-context" ]]; then
    rm -rf -- "${test_root}"
  else
    echo "Refusing to remove unmarked processor context: ${test_root}" >&2
  fi
}
trap cleanup EXIT

context="$(
  bash "${repo_root}/scripts/release/materialize-release-context.sh" \
    quipsly-media-processor \
    "${source_ref}" \
    "${context_dir}"
)"
expected_sha="$(git -C "${repo_root}" rev-parse "${source_ref}^{commit}")"

[[ "${context}" == "${context_dir}" ]]
[[ -f "${context}/apps/quipsly-media-processor/Dockerfile" ]]
[[ -f "${context}/packages/quipsly-media-processing/src/index.ts" ]]
[[ -f "${context}/cloudbuild.quipsly-media-processor.yaml" ]]
[[ -f "${context}/release/manifests/schema.json" ]]
[[ -f "${context}/quipsly-media-processor-source.json" ]]
[[ ! -e "${context}/apps/quipsly" ]]
[[ ! -e "${context}/prisma" ]]
[[ ! -e "${context}/node_modules" ]]

node - "${context}" "${expected_sha}" <<'NODE'
const fs = require("node:fs");
const path = require("node:path");
const context = process.argv[2];
const expectedSha = process.argv[3];
const manifest = JSON.parse(
  fs.readFileSync(path.join(context, "release/manifests/quipsly-media-processor.json"), "utf8"),
);
for (const required of manifest.releaseContext.requiredPaths) {
  if (!fs.existsSync(path.join(context, required))) {
    throw new Error(`Processor release context is missing ${required}`);
  }
}
const receipt = JSON.parse(
  fs.readFileSync(path.join(context, manifest.artifact.provenanceReceipt), "utf8"),
);
if (receipt.sourceSha !== expectedSha) throw new Error("Processor source SHA drift.");
NODE

if [[ "${BUILD_CONTAINER:-0}" == "1" ]]; then
  image="quipsly-media-processor-context:${expected_sha:0:12}"
  docker build \
    --file "${context}/apps/quipsly-media-processor/Dockerfile" \
    --tag "${image}" \
    "${context}"
  docker run --rm "${image}" node --version
  docker image rm "${image}" >/dev/null
fi

echo "PASS Quipsly media processor context is committed, bounded, and source-labeled."
