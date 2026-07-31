#!/usr/bin/env bash
set -euo pipefail

repo_root="$(git rev-parse --show-toplevel)"
output_file="$(mktemp)"
trap 'rm -f "${output_file}"' EXIT

grep -Fq 'pnpm prisma migrate diff --from-config-datasource --to-schema=prisma/schema.prisma --exit-code' \
  "${repo_root}/scripts/release/quipsly-schema-job.sh" || {
  echo "Schema diff mode must fail when production differs from the committed schema." >&2
  exit 1
}

grep -Fq -- '--image="${IMAGE_REFERENCE}"' \
  "${repo_root}/scripts/release/quipsly-schema-job.sh" || {
  echo "Schema jobs must support an immutable digest image reference." >&2
  exit 1
}

grep -Fq 'job_name="quipsly-schema-${job_suffix}-${source_sha:0:12}"' \
  "${repo_root}/scripts/release/quipsly-schema-job.sh" || {
  echo "Schema jobs must be source-scoped so concurrent releases cannot replace one another." >&2
  exit 1
}

set +e
MODE=unknown-schema-mode \
  PROJECT_ID=quipsly-schema-job-test \
  bash "${repo_root}/scripts/release/quipsly-schema-job.sh" \
  >"${output_file}" 2>&1
status=$?
set -e

if [[ "${status}" -ne 2 ]]; then
  cat "${output_file}" >&2
  echo "Expected an unknown schema mode to exit 2; received ${status}." >&2
  exit 1
fi

grep -Fq "Unknown MODE 'unknown-schema-mode'." "${output_file}"

if grep -Eq "gcloud builds submit|gcloud run jobs" "${output_file}"; then
  cat "${output_file}" >&2
  echo "Schema job started external work before validating its mode." >&2
  exit 1
fi

set +e
MODE=resolve-foundation \
  PROJECT_ID=quipsly-schema-job-test \
  ALLOW_BASELINE_RESOLUTION=0 \
  bash "${repo_root}/scripts/release/quipsly-schema-job.sh" \
  >"${output_file}" 2>&1
status=$?
set -e

if [[ "${status}" -ne 2 ]]; then
  cat "${output_file}" >&2
  echo "Expected an unapproved foundation resolution to exit 2; received ${status}." >&2
  exit 1
fi

grep -Fq "Refusing to resolve foundation migrations" "${output_file}"

set +e
MODE=foundation-repair \
  PROJECT_ID=quipsly-schema-job-test \
  ALLOW_FOUNDATION_REPAIR=0 \
  bash "${repo_root}/scripts/release/quipsly-schema-job.sh" \
  >"${output_file}" 2>&1
status=$?
set -e

if [[ "${status}" -ne 2 ]]; then
  cat "${output_file}" >&2
  echo "Expected an unapproved foundation repair to exit 2; received ${status}." >&2
  exit 1
fi

grep -Fq "Refusing to repair the foundation schema" "${output_file}"

set +e
MODE=fixture \
  FIXTURE_DATABASE=public \
  PROJECT_ID=quipsly-schema-job-test \
  bash "${repo_root}/scripts/release/quipsly-schema-job.sh" \
  >"${output_file}" 2>&1
status=$?
set -e

if [[ "${status}" -ne 2 ]]; then
  cat "${output_file}" >&2
  echo "Expected an unsafe fixture database to exit 2; received ${status}." >&2
  exit 1
fi

grep -Fq "Unsafe fixture database 'public'." "${output_file}"

if grep -Eq "gcloud builds submit|gcloud run jobs" "${output_file}"; then
  cat "${output_file}" >&2
  echo "Fixture job started external work before validating its database." >&2
  exit 1
fi

echo "PASS schema job rejects unsafe modes and fixture targets before external work."
