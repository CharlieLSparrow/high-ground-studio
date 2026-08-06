#!/usr/bin/env bash
set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
repo_root="$(cd "${script_dir}/../.." && pwd)"
source "${script_dir}/quipsly-local-state.sh"

state_dir="$(quipsly_local_state_dir)"
fixture_env_file="${QUIPSLY_LOCAL_ENV_FILE:-}"
if [[ -z "${fixture_env_file}" && -f "${repo_root}/apps/quipsly/.env.local" ]]; then
  fixture_env_file="${repo_root}/apps/quipsly/.env.local"
fi
if [[ -z "${fixture_env_file}" && -f "${state_dir}/nest-env-path" ]]; then
  fixture_env_file="$(sed -n '1p' "${state_dir}/nest-env-path")"
fi
if [[ -z "${fixture_env_file}" || ! -r "${fixture_env_file}" ]]; then
  echo "The retained Capture-take fixture requires the same readable local environment file as Nest." >&2
  echo "Start the local lane first with: pnpm quipsly:local:up" >&2
  exit 1
fi

cd "${repo_root}"
exec env QUIPSLY_RETAINED_CAPTURE_TAKE_FIXTURE=1 node \
  "--env-file=${fixture_env_file}" \
  --experimental-transform-types \
  --import ./scripts/register-ts-extension-loader.mjs \
  scripts/quipsly-retained-capture-take-materialization-fixture.mjs
