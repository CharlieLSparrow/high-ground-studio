#!/usr/bin/env bash
set -euo pipefail

repo_root="$(git rev-parse --show-toplevel)"
output_file="$(mktemp)"
trap 'rm -f "${output_file}"' EXIT

set +e
PROJECT_ID=quipsly-schema-safety-test \
  ALLOW_PRISMA_ACCEPT_DATA_LOSS=0 \
  bash "${repo_root}/scripts/release/quipsly-schema-sync.sh" \
  >"${output_file}" 2>&1
status=$?
set -e

if [[ "${status}" -ne 2 ]]; then
  cat "${output_file}" >&2
  echo "Expected the unapproved schema bridge to exit 2; received ${status}." >&2
  exit 1
fi

grep -Fq "Refusing to run the legacy schema bridge." "${output_file}"
grep -Fq "ALLOW_PRISMA_ACCEPT_DATA_LOSS=1" "${output_file}"

if grep -Fq "Building Prisma Migration image" "${output_file}"; then
  cat "${output_file}" >&2
  echo "The refusal gate ran after external build work started." >&2
  exit 1
fi

echo "PASS legacy schema bridge refuses to start without explicit approval."
