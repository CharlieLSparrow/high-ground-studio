#!/usr/bin/env bash
set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
repo_root="$(cd "${script_dir}/../.." && pwd)"
source "${script_dir}/quipsly-local-state.sh"

state_dir="$(quipsly_local_state_dir)"
alignment_env_file="${QUIPSLY_LOCAL_ENV_FILE:-}"
if [[ -z "${alignment_env_file}" && -f "${repo_root}/apps/quipsly/.env.local" ]]; then
  alignment_env_file="${repo_root}/apps/quipsly/.env.local"
fi
if [[ -z "${alignment_env_file}" && -f "${state_dir}/nest-env-path" ]]; then
  alignment_env_file="$(sed -n '1p' "${state_dir}/nest-env-path")"
fi
if [[ -z "${alignment_env_file}" || ! -r "${alignment_env_file}" ]]; then
  echo "The alignment dogfood requires the same readable local environment file as Nest." >&2
  echo "Start the local lane first with: pnpm quipsly:local:up" >&2
  exit 1
fi

alignment_base_url="${QUIPSLY_ALIGNMENT_SMOKE_BASE_URL:-http://127.0.0.1:3012}"
health_status="$(
  curl -sS --max-time 4 \
    -o /dev/null \
    -w "%{http_code}" \
    "${alignment_base_url%/}/api/health" \
    2>/dev/null \
    || true
)"
if [[ "${health_status}" != "200" ]]; then
  echo "Local Nest is not healthy at ${alignment_base_url}." >&2
  echo "Start the local lane first with: pnpm quipsly:local:up" >&2
  exit 1
fi

cd "${repo_root}"
exec node \
  "--env-file=${alignment_env_file}" \
  scripts/quipsly-episode-alignment-revision-smoke.mjs
