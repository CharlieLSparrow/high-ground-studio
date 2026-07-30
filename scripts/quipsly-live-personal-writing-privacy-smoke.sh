#!/usr/bin/env bash
set -euo pipefail
umask 077

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
project_id="${PROJECT_ID:-high-ground-odyssey}"
database_secret="${QUIPSLY_PERSONAL_WRITING_PRIVACY_DATABASE_SECRET:-studio-database-url}"
cloud_sql_instance="${QUIPSLY_CLOUD_SQL_INSTANCE:-high-ground-odyssey:us-central1:studio-postgres}"
proxy_port="${QUIPSLY_SMOKE_CLOUD_SQL_PROXY_PORT:-15461}"
base_url="${QUIPSLY_PERSONAL_WRITING_PRIVACY_BASE_URL:-https://quipsly-preview---studio-hm2odnvjga-uc.a.run.app}"
expected_source_sha="${QUIPSLY_PERSONAL_WRITING_PRIVACY_EXPECTED_SOURCE_SHA:-}"
output_path="${QUIPSLY_PERSONAL_WRITING_PRIVACY_OUTPUT:-/private/tmp/quipsly-personal-writing-privacy-preview-current.json}"
work_dir="$(mktemp -d "${TMPDIR:-/private/tmp}/quipsly-writing-privacy.XXXXXX")"
proxy_pid=""

cleanup() {
  local exit_status=$?
  if [[ -n "${proxy_pid}" ]]; then
    kill "${proxy_pid}" >/dev/null 2>&1 || true
    wait "${proxy_pid}" >/dev/null 2>&1 || true
  fi
  case "${work_dir}" in
    "${TMPDIR:-/private/tmp}"/quipsly-writing-privacy.*)
      rm -rf -- "${work_dir}"
      ;;
  esac
  return "${exit_status}"
}
trap cleanup EXIT

for command in gcloud cloud-sql-proxy nc node; do
  command -v "${command}" >/dev/null 2>&1 || {
    printf "FAIL Required command is unavailable: %s\n" "${command}" >&2
    exit 2
  }
done

if [[ ! "${expected_source_sha}" =~ ^[0-9a-f]{40}$ ]]; then
  printf "FAIL QUIPSLY_PERSONAL_WRITING_PRIVACY_EXPECTED_SOURCE_SHA must name the exact 40-character preview source SHA.\n" >&2
  exit 2
fi

database_url="$(gcloud secrets versions access latest \
  --secret="${database_secret}" \
  --project="${project_id}")"
[[ -n "${database_url}" ]] || {
  printf "FAIL Database secret is empty.\n" >&2
  exit 2
}

cloud-sql-proxy \
  --quota-project "${project_id}" \
  --address 127.0.0.1 \
  --port "${proxy_port}" \
  "${cloud_sql_instance}" \
  >"${work_dir}/cloud-sql-proxy.log" 2>&1 &
proxy_pid=$!

ready=0
for _ in {1..60}; do
  if ! kill -0 "${proxy_pid}" >/dev/null 2>&1; then
    break
  fi
  if nc -z 127.0.0.1 "${proxy_port}" >/dev/null 2>&1; then
    ready=1
    break
  fi
  sleep 0.2
done
if [[ "${ready}" != "1" ]]; then
  tail -40 "${work_dir}/cloud-sql-proxy.log" >&2 || true
  printf "FAIL Cloud SQL proxy did not become ready.\n" >&2
  exit 2
fi

printf "Running exact-preview two-account personal-writing privacy proof.\n"
printf "Disposable identities and canonical fixtures are removed and independently rechecked.\n"

cd "${repo_root}"
DATABASE_URL="${database_url}" \
QUIPSLY_SMOKE_CLOUD_SQL_PROXY_PORT="${proxy_port}" \
FIREBASE_PROJECT_ID="${FIREBASE_PROJECT_ID:-quipsly-reef}" \
node scripts/quipsly-generated-personal-writing-privacy-smoke.mjs \
  --base-url "${base_url}" \
  --expected-source-sha "${expected_source_sha}" \
  --output "${output_path}"
