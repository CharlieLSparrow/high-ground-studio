#!/usr/bin/env bash
set -euo pipefail

repo_root="$(git rev-parse --show-toplevel)"
source_ref="${SOURCE_REF:-HEAD}"
requested_release="${1:-all}"

case "${requested_release}" in
  all)
    release_ids=(nest hgo-web)
    ;;
  nest|hgo-web)
    release_ids=("${requested_release}")
    ;;
  *)
    echo "Expected release id nest, hgo-web, or all." >&2
    exit 2
    ;;
esac

test_root="$(mktemp -d "${TMPDIR:-/tmp}/release-context-test.XXXXXX")"
cleanup() {
  for context_dir in "${test_root}"/*; do
    [[ -e "${context_dir}" ]] || continue
    if [[ -f "${context_dir}/.quipsly-release-context" ]]; then
      continue
    fi
    if [[ -d "${context_dir}" ]] \
      && [[ -z "$(find "${context_dir}" -mindepth 1 -maxdepth 1 -print -quit)" ]]; then
      continue
    fi
    if [[ ! -f "${context_dir}/.quipsly-release-context" ]]; then
      echo "Refusing to remove unmarked release test directory: ${context_dir}" >&2
      return
    fi
  done
  rm -rf -- "${test_root}"
}
trap cleanup EXIT

expected_sha="$(git -C "${repo_root}" rev-parse "${source_ref}^{commit}")"
for release_id in "${release_ids[@]}"; do
  context_dir="${test_root}/${release_id}"
  context="$(
    bash "${repo_root}/scripts/release/materialize-release-context.sh" \
      "${release_id}" \
      "${source_ref}" \
      "${context_dir}"
  )"
  [[ "${context}" == "${context_dir}" ]]
  [[ -f "${context}/.quipsly-release-context" ]]
  [[ ! -e "${context}/.git" ]]
  [[ ! -e "${context}/node_modules" ]]

  node - \
    "${context}" \
    "${repo_root}/release/manifests/${release_id}.json" \
    "${expected_sha}" <<'NODE'
const fs = require("node:fs");
const path = require("node:path");

const context = process.argv[2];
const manifest = JSON.parse(fs.readFileSync(process.argv[3], "utf8"));
const expectedSha = process.argv[4];
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
const receiptPath = path.join(context, manifest.artifact.provenanceReceipt);
const receipt = JSON.parse(fs.readFileSync(receiptPath, "utf8"));
if (receipt.releaseId !== manifest.id) {
  throw new Error(`Expected receipt for ${manifest.id}, got ${receipt.releaseId}`);
}
if (receipt.sourceSha !== expectedSha) {
  throw new Error(`Expected source ${expectedSha}, got ${receipt.sourceSha}`);
}
if (receipt.releaseManifest !== `release/manifests/${manifest.id}.json`) {
  throw new Error(`Unexpected release contract: ${receipt.releaseManifest}`);
}
if (!/^[a-f0-9]{40}$/.test(receipt.inventorySha1)) {
  throw new Error("Release inventory digest is missing or invalid.");
}
if (receipt.normalizedMtimeUtc !== "2000-01-01T00:00:00Z") {
  throw new Error(`Unexpected normalized release mtime: ${receipt.normalizedMtimeUtc}`);
}
NODE

  case "${release_id}" in
    nest)
      [[ -f "${context}/apps/quipsly/Dockerfile" ]]
      [[ ! -e "${context}/apps/web/package.json" ]]
      [[ ! -e "${context}/apps/QuipslyStudio" ]]
      [[ ! -e "${context}/apps/mobile-capture" ]]
      ;;
    hgo-web)
      [[ -f "${context}/apps/web/Dockerfile" ]]
      [[ -f "${context}/apps/quipsly/package.json" ]]
      [[ ! -e "${context}/apps/quipsly/src" ]]
      [[ ! -e "${context}/apps/QuipslyStudio" ]]
      [[ ! -e "${context}/apps/mobile-capture" ]]
      if [[ "${BUILD_WEB_CONTEXT:-0}" == "1" ]]; then
        (
          cd "${context}"
          pnpm install --frozen-lockfile
          pnpm web:release-context:test
          DATABASE_URL="${WEB_LOCAL_DATABASE_URL:-postgresql://postgres:postgres@localhost:5432/high_ground_studio}" \
            pnpm --filter web exec next build --webpack
        )
        echo "PASS HGO web exact context installs, tests, and production-builds."
      fi
      ;;
  esac

  echo "PASS ${release_id} context matches its committed release manifest."
done
