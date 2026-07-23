#!/usr/bin/env bash
set -euo pipefail

repo_root="$(git rev-parse --show-toplevel)"
source_ref="${SOURCE_REF:-HEAD}"
source_sha="$(git rev-parse "${source_ref}^{commit}")"
test_root="$(mktemp -d "${TMPDIR:-/tmp}/quipsly-schema-context-test.XXXXXX")"
context_dir="${test_root}/context"

cleanup() {
  if [[ -f "${context_dir}/.quipsly-schema-context" ]]; then
    rm -rf -- "${test_root}"
  else
    echo "Refusing to remove unmarked schema context test directory: ${test_root}" >&2
  fi
}
trap cleanup EXIT

materialized="$(
  CONTEXT_MAX_MIB=30 \
    bash "${repo_root}/scripts/release/quipsly-schema-context.sh" \
    "${source_sha}" \
    "${context_dir}"
)"

[[ "${materialized}" == "${context_dir}" ]]
[[ -f "${context_dir}/quipsly-schema-source.json" ]]
[[ -f "${context_dir}/ops/quipsly-schema.Dockerfile" ]]
[[ -f "${context_dir}/scripts/quipsly-coaching-capture-schema-sync.mjs" ]]
[[ -f "${context_dir}/ops/quipsly-foundation-baseline-repair.sql" ]]

node - "${context_dir}/quipsly-schema-source.json" "${source_sha}" <<'NODE'
const fs = require("node:fs");
const [file, expectedSha] = process.argv.slice(2);
const receipt = JSON.parse(fs.readFileSync(file, "utf8"));
if (receipt.schemaVersion !== 1 || receipt.sourceSha !== expectedSha) {
  console.error("Schema source receipt does not match the requested commit.");
  process.exit(1);
}
NODE

for forbidden in \
  apps/quipsly/src \
  apps/web/src \
  apps/mobile-capture \
  apps/QuipslyStudio \
  node_modules
do
  if [[ -e "${context_dir}/${forbidden}" ]]; then
    echo "Schema context contains forbidden path: ${forbidden}" >&2
    exit 1
  fi
done

echo "PASS committed schema context is minimal and source-labeled."
