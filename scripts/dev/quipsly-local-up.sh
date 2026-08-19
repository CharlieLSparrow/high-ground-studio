#!/usr/bin/env bash
set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
script_repo_root="$(cd "${script_dir}/../.." && pwd)"
source "${script_dir}/quipsly-local-state.sh"

load_google_drive_local_secret() {
  local environment_name="$1"
  local secret_name="$2"
  local project_id="${QUIPSLY_LOCAL_GOOGLE_DRIVE_SECRET_PROJECT:-}"
  local gcloud_bin="${QUIPSLY_LOCAL_GCLOUD_BIN:-}"
  local secret_value

  [[ -n "${project_id}" ]] || return 0
  if [[ -n "${!environment_name:-}" ]]; then
    return 0
  fi
  if [[ -z "${gcloud_bin}" || ! -x "${gcloud_bin}" ]]; then
    echo "Google Drive local secrets are enabled, but the configured gcloud executable is unavailable." >&2
    return 1
  fi
  if ! secret_value="$(
    "${gcloud_bin}" secrets versions access latest \
      --secret="${secret_name}" \
      --project="${project_id}" \
      2>/dev/null
  )" || [[ -z "${secret_value}" ]]; then
    echo "Google Drive local secret ${secret_name}:latest is missing or inaccessible in ${project_id}." >&2
    return 1
  fi
  printf -v "${environment_name}" '%s' "${secret_value}"
  export "${environment_name}"
  secret_value=""
}

load_google_drive_local_secrets() {
  [[ -n "${QUIPSLY_LOCAL_GOOGLE_DRIVE_SECRET_PROJECT:-}" ]] || return 0
  load_google_drive_local_secret GOOGLE_DRIVE_OAUTH_CLIENT_ID quipsly-google-drive-oauth-client-id
  load_google_drive_local_secret GOOGLE_DRIVE_OAUTH_CLIENT_SECRET quipsly-google-drive-oauth-client-secret
  load_google_drive_local_secret GOOGLE_DRIVE_OAUTH_STATE_SECRET quipsly-google-drive-oauth-state-secret
  load_google_drive_local_secret GOOGLE_DRIVE_OAUTH_TOKEN_ENCRYPTION_KEY quipsly-google-drive-oauth-token-encryption-key
  load_google_drive_local_secret GOOGLE_DRIVE_PICKER_API_KEY quipsly-google-drive-picker-api-key
  load_google_drive_local_secret GOOGLE_DRIVE_PICKER_APP_ID quipsly-google-drive-picker-app-id
}

if [[ "${1:-}" == "--run-livekit" ]]; then
  livekit_bin="${QUIPSLY_LOCAL_LIVEKIT_BIN:?Missing local LiveKit server executable}"
  livekit_bind="${QUIPSLY_LOCAL_LIVEKIT_BIND:-127.0.0.1}"
  livekit_node_ip="${QUIPSLY_LOCAL_LIVEKIT_NODE_IP:-127.0.0.1}"
  livekit_api_key="${QUIPSLY_LOCAL_LIVEKIT_KEY:-devkey}"
  livekit_api_secret="${QUIPSLY_LOCAL_LIVEKIT_SECRET:-secret}"
  exec "${livekit_bin}" \
    --dev \
    --bind "${livekit_bind}" \
    --node-ip "${livekit_node_ip}" \
    --keys "${livekit_api_key}: ${livekit_api_secret}"
fi

if [[ "${1:-}" == "--run-firebase" ]]; then
  cd "${script_repo_root}"
  exec "${QUIPSLY_LOCAL_PNPM_BIN:?Missing launcher pnpm path}" exec firebase emulators:start \
    --only auth \
    --project quipsly-reef \
    --config ops/firebase-auth-emulator.local.json
fi

if [[ "${1:-}" == "--run-nest" ]]; then
  load_google_drive_local_secrets
  cd "${script_repo_root}/apps/quipsly"
  nest_environment=(
    PORT=3012
    "DATABASE_URL=${QUIPSLY_LOCAL_DATABASE_URL:-postgresql://postgres:postgres@127.0.0.1:5432/high_ground_studio}"
    FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099
    NEXT_PUBLIC_QUIPSLY_FIREBASE_AUTH_EMULATOR_URL=http://127.0.0.1:9099
    QUIPSLY_OWNER_OVERRIDE=false
    QUIPSLY_LOCAL_MEDIA_UPLOADS=true
    "QUIPSLY_LOCAL_MEDIA_UPLOAD_ROOT=${QUIPSLY_LOCAL_MEDIA_UPLOAD_ROOT:-}"
    "QUIPSLY_LOCAL_MEDIA_WORKSPACE_ROOT=${QUIPSLY_LOCAL_MEDIA_WORKSPACE_ROOT:-}"
    "QUIPSLY_LOCAL_MEDIA_LEGACY_ROOTS_JSON=${QUIPSLY_LOCAL_MEDIA_LEGACY_ROOTS_JSON:-[]}"
    "QUIPSLY_LOCAL_CAPTURE_VAULT_ROOT=${QUIPSLY_LOCAL_CAPTURE_VAULT_ROOT:-}"
    "QUIPSLY_LOCAL_CAPTURE_UPLOAD_ORIGIN=${QUIPSLY_LOCAL_CAPTURE_UPLOAD_ORIGIN:-http://127.0.0.1:3012}"
    "QUIPSLY_APP_HOST=${QUIPSLY_LOCAL_APP_HOST:-http://127.0.0.1:3012}"
    "LIVEKIT_URL=${QUIPSLY_LOCAL_LIVEKIT_URL:-ws://127.0.0.1:7880}"
    "LIVEKIT_API_KEY=${QUIPSLY_LOCAL_LIVEKIT_KEY:-devkey}"
    "LIVEKIT_API_SECRET=${QUIPSLY_LOCAL_LIVEKIT_SECRET:-secret}"
    "QUIPSLY_LOCAL_TRANSCRIPT_WORKER_AVAILABLE=${QUIPSLY_LOCAL_TRANSCRIPT_WORKER_AVAILABLE:-0}"
    "QUIPSLY_LOCAL_SPATIAL_VAULT_ROOT=${QUIPSLY_LOCAL_SPATIAL_VAULT_ROOT:-}"
    GCLOUD_PROJECT=quipsly-reef
    GOOGLE_CLOUD_PROJECT=quipsly-reef
  )
  if [[ -n "${QUIPSLY_LOCAL_ENV_FILE:-}" ]]; then
    exec /usr/bin/env \
      "${nest_environment[@]}" \
      "${QUIPSLY_LOCAL_NODE_BIN:?Missing launcher node path}" \
      "--env-file=${QUIPSLY_LOCAL_ENV_FILE}" \
      "${QUIPSLY_LOCAL_PNPM_BIN:?Missing launcher pnpm path}" \
      dev
  fi
  exec /usr/bin/env \
    "${nest_environment[@]}" \
    "${QUIPSLY_LOCAL_PNPM_BIN:?Missing launcher pnpm path}" \
    dev
fi

if [[ "${1:-}" == "--run-media-worker" ]]; then
  load_google_drive_local_secrets
  cd "${script_repo_root}"
  worker_environment=(
    "DATABASE_URL=${QUIPSLY_LOCAL_DATABASE_URL:-postgresql://postgres:postgres@127.0.0.1:5432/high_ground_studio}"
    "QUIPSLY_LOCAL_MEDIA_UPLOAD_ROOT=${QUIPSLY_LOCAL_MEDIA_UPLOAD_ROOT:-}"
    "QUIPSLY_LOCAL_MEDIA_WORKSPACE_ROOT=${QUIPSLY_LOCAL_MEDIA_WORKSPACE_ROOT:-}"
    "QUIPSLY_LOCAL_MEDIA_WORKER_BUILD_ID=${QUIPSLY_LOCAL_MEDIA_WORKER_BUILD_ID:-local-development}"
    "QUIPSLY_LOCAL_SPATIAL_VAULT_ROOT=${QUIPSLY_LOCAL_SPATIAL_VAULT_ROOT:-}"
  )
  worker_command=(
    "${QUIPSLY_LOCAL_NODE_BIN:?Missing launcher node path}"
    --experimental-transform-types
    --import "${script_repo_root}/scripts/register-ts-extension-loader.mjs"
    "${script_repo_root}/apps/quipsly-media-processor/src/local-episode-worker.ts"
  )
  if [[ -n "${QUIPSLY_LOCAL_ENV_FILE:-}" ]]; then
    worker_command=(
      "${QUIPSLY_LOCAL_NODE_BIN:?Missing launcher node path}"
      "--env-file=${QUIPSLY_LOCAL_ENV_FILE}"
      --experimental-transform-types
      --import "${script_repo_root}/scripts/register-ts-extension-loader.mjs"
      "${script_repo_root}/apps/quipsly-media-processor/src/local-episode-worker.ts"
    )
  fi
  exec /usr/bin/env "${worker_environment[@]}" "${worker_command[@]}"
fi

if [[ "${1:-}" == "--run-transcript-worker" ]]; then
  cd "${script_repo_root}"
  exec /usr/bin/env \
    "DATABASE_URL=${QUIPSLY_LOCAL_DATABASE_URL:-postgresql://postgres:postgres@127.0.0.1:5432/high_ground_studio}" \
    "QUIPSLY_LOCAL_MEDIA_UPLOAD_ROOT=${QUIPSLY_LOCAL_MEDIA_UPLOAD_ROOT:-}" \
    "QUIPSLY_LOCAL_MEDIA_WORKSPACE_ROOT=${QUIPSLY_LOCAL_MEDIA_WORKSPACE_ROOT:-}" \
    "QUIPSLY_LOCAL_CAPTURE_VAULT_ROOT=${QUIPSLY_LOCAL_CAPTURE_VAULT_ROOT:-}" \
    "QUIPSLY_LOCAL_WHISPER_EXECUTABLE=${QUIPSLY_LOCAL_WHISPER_EXECUTABLE:?Missing local Whisper executable}" \
    "QUIPSLY_LOCAL_WHISPER_MODEL=${QUIPSLY_LOCAL_WHISPER_MODEL:-large-v3-turbo}" \
    "QUIPSLY_LOCAL_WHISPER_DEVICE=${QUIPSLY_LOCAL_WHISPER_DEVICE:-cpu}" \
    "QUIPSLY_LOCAL_WHISPER_LANGUAGE=${QUIPSLY_LOCAL_WHISPER_LANGUAGE:-en}" \
    "QUIPSLY_LOCAL_TRANSCRIPT_WORKER_BUILD_ID=${QUIPSLY_LOCAL_TRANSCRIPT_WORKER_BUILD_ID:-local-development}" \
    "${QUIPSLY_LOCAL_NODE_BIN:?Missing launcher node path}" \
    "${script_repo_root}/scripts/dev/quipsly-local-transcript-worker.mjs"
fi

replace_existing=0
if [[ "${1:-}" == "--replace" ]]; then
  replace_existing=1
  shift
fi
if [[ "$#" -gt 0 ]]; then
  echo "Usage: $0 [--replace]" >&2
  exit 64
fi

repo_root="$(git rev-parse --show-toplevel 2>/dev/null || true)"
if [[ -z "${repo_root}" ]]; then
  echo "Run this command from inside the High Ground Studio repository." >&2
  exit 1
fi
repo_root="$(cd "${repo_root}" && pwd -P)"
cd "${repo_root}"

state_dir="$(quipsly_local_state_dir)"
nest_url="${TARGET_URL:-http://127.0.0.1:3012}"
firebase_url="${QUIPSLY_LOCAL_FIREBASE_AUTH_URL:-http://127.0.0.1:9099}"
database_container="${QUIPSLY_LOCAL_DATABASE_CONTAINER:-high-ground-db}"
compose_project="${QUIPSLY_LOCAL_COMPOSE_PROJECT:-high-ground-studio}"
local_database_url="${QUIPSLY_LOCAL_DATABASE_URL:-postgresql://postgres:postgres@127.0.0.1:5432/high_ground_studio}"
local_media_root="${QUIPSLY_LOCAL_MEDIA_UPLOAD_ROOT:-$(node -p 'require("node:path").join(require("node:os").tmpdir(), "quipsly-media-ingest")')}"
local_media_workspace_config="${QUIPSLY_LOCAL_MEDIA_WORKSPACE_CONFIG:-$(node -p 'require("node:path").join(require("node:os").homedir(), "Library", "Application Support", "Quipsly", "local-media-workspace.json")')}"
local_active_media_workspace_root="${QUIPSLY_LOCAL_MEDIA_WORKSPACE_ROOT:-}"
local_media_legacy_roots_json="${QUIPSLY_LOCAL_MEDIA_LEGACY_ROOTS_JSON:-}"
resolved_spatial_vault_root=""
if [[ -z "${local_active_media_workspace_root}" ]]; then
  local_active_media_workspace_root="$(node scripts/dev/quipsly-local-media-workspace.mjs resolve --config "${local_media_workspace_config}" --field workerMediaRoot)"
  resolved_spatial_vault_root="$(node scripts/dev/quipsly-local-media-workspace.mjs resolve --config "${local_media_workspace_config}" --field spatialVaultRoot)"
  if [[ -z "${local_media_legacy_roots_json}" ]]; then
    local_media_legacy_roots_json="$(node scripts/dev/quipsly-local-media-workspace.mjs resolve --config "${local_media_workspace_config}" --field legacyReadRootsJson)"
  fi
fi
mkdir -p "${local_media_root}"
local_worker_media_root="${local_active_media_workspace_root:-${local_media_root}}"
local_media_legacy_roots_json="${local_media_legacy_roots_json:-[]}"
node -e 'const value=JSON.parse(process.argv[1]); if (!Array.isArray(value) || value.length > 8 || value.some((item) => typeof item !== "string" || !require("node:path").isAbsolute(item))) process.exit(1)' "${local_media_legacy_roots_json}" || {
  echo "QUIPSLY_LOCAL_MEDIA_LEGACY_ROOTS_JSON must contain at most eight absolute paths." >&2
  exit 64
}
if [[ ! -d "${local_worker_media_root}" || ! -w "${local_worker_media_root}" ]]; then
  echo "The active Quipsly media workspace is unavailable or not writable: ${local_worker_media_root}" >&2
  echo "Reconnect its volume instead of falling back to the system disk." >&2
  exit 1
fi
local_capture_vault_root="${QUIPSLY_LOCAL_CAPTURE_VAULT_ROOT:-${local_media_root}/capture-vault}"
local_capture_upload_origin="${QUIPSLY_LOCAL_CAPTURE_UPLOAD_ORIGIN:-${nest_url}}"
local_app_host="${QUIPSLY_LOCAL_APP_HOST:-${nest_url}}"
local_spatial_vault_root="${QUIPSLY_LOCAL_SPATIAL_VAULT_ROOT:-${resolved_spatial_vault_root}}"
docker_timeout_seconds="$(quipsly_local_docker_timeout_seconds)"
docker_start_timeout_seconds="$(quipsly_local_docker_start_timeout_seconds)"
firebase_label="com.quipsly.local.firebase"
nest_label="com.quipsly.local.nest"
media_worker_label="com.quipsly.local.media-worker"
transcript_worker_label="com.quipsly.local.transcript-worker"
livekit_label="com.quipsly.local.livekit"
local_whisper_executable="${QUIPSLY_LOCAL_WHISPER_EXECUTABLE:-}"
if [[ -z "${local_whisper_executable}" ]]; then
  local_whisper_executable="$(command -v whisper 2>/dev/null || true)"
fi
if [[ -z "${local_whisper_executable}" && -x "/opt/homebrew/Caskroom/miniconda/base/bin/whisper" ]]; then
  local_whisper_executable="/opt/homebrew/Caskroom/miniconda/base/bin/whisper"
fi
local_whisper_model="${QUIPSLY_LOCAL_WHISPER_MODEL:-large-v3-turbo}"
local_whisper_device="${QUIPSLY_LOCAL_WHISPER_DEVICE:-cpu}"
local_whisper_language="${QUIPSLY_LOCAL_WHISPER_LANGUAGE:-en}"
local_transcript_worker_available=0
if [[ -n "${local_whisper_executable}" && -x "${local_whisper_executable}" ]]; then
  local_transcript_worker_available=1
fi
local_livekit_url="${QUIPSLY_LOCAL_LIVEKIT_URL:-ws://127.0.0.1:7880}"
local_livekit_http_url="${QUIPSLY_LOCAL_LIVEKIT_HTTP_URL:-http://127.0.0.1:7880}"
local_livekit_bind="${QUIPSLY_LOCAL_LIVEKIT_BIND:-127.0.0.1}"
local_livekit_node_ip="${QUIPSLY_LOCAL_LIVEKIT_NODE_IP:-127.0.0.1}"
local_livekit_key="${QUIPSLY_LOCAL_LIVEKIT_KEY:-devkey}"
local_livekit_secret="${QUIPSLY_LOCAL_LIVEKIT_SECRET:-secret}"
local_livekit_bin="${QUIPSLY_LOCAL_LIVEKIT_BIN:-$(command -v livekit-server 2>/dev/null || true)}"
if [[ -z "${local_livekit_bin}" || ! -x "${local_livekit_bin}" ]]; then
  echo "Local coaching requires the LiveKit server executable." >&2
  echo "Install livekit-server or set QUIPSLY_LOCAL_LIVEKIT_BIN to an executable path." >&2
  exit 1
fi
local_livekit_version="$(${local_livekit_bin} --version 2>/dev/null | head -1)"
local_livekit_secret_revision="$(printf '%s' "${local_livekit_secret}" | shasum -a 256 | awk '{print $1}')"
worker_source_paths=(
  apps/quipsly-media-processor
  packages/quipsly-media-processing
  scripts/dev/quipsly-local-up.sh
  scripts/dev/quipsly-local-state.sh
  scripts/dev/quipsly-local-transcript-worker.mjs
  scripts/register-ts-extension-loader.mjs
)
local_worker_source_revision="$(
  quipsly_local_git_source_revision "${repo_root}" "${worker_source_paths[@]}"
)"
local_transcript_worker_build_id="${QUIPSLY_LOCAL_TRANSCRIPT_WORKER_BUILD_ID:-${local_worker_source_revision}}"
configured_google_drive_secret_project=""
if [[ -f "${state_dir}/google-drive-secret-project" ]]; then
  configured_google_drive_secret_project="$(sed -n '1p' "${state_dir}/google-drive-secret-project")"
fi
local_google_drive_secret_project="${QUIPSLY_LOCAL_GOOGLE_DRIVE_SECRET_PROJECT:-${configured_google_drive_secret_project}}"
local_gcloud_bin="${QUIPSLY_LOCAL_GCLOUD_BIN:-$(command -v gcloud 2>/dev/null || true)}"
if [[ -n "${local_google_drive_secret_project}" ]]; then
  if [[ ! "${local_google_drive_secret_project}" =~ ^[a-z][a-z0-9-]{4,62}$ ]]; then
    echo "QUIPSLY_LOCAL_GOOGLE_DRIVE_SECRET_PROJECT is not a safe Google Cloud project id." >&2
    exit 64
  fi
  if [[ -z "${local_gcloud_bin}" || ! -x "${local_gcloud_bin}" ]]; then
    echo "Google Drive local secrets require an executable gcloud path." >&2
    exit 1
  fi
fi
umask 077
mkdir -p "${state_dir}"

local_env_file="${QUIPSLY_LOCAL_ENV_FILE:-}"
if [[ -z "${local_env_file}" && -f "${repo_root}/apps/quipsly/.env.local" ]]; then
  local_env_file="${repo_root}/apps/quipsly/.env.local"
fi
if [[ -z "${local_env_file}" && -f "${state_dir}/nest-env-path" ]]; then
  local_env_file="$(sed -n '1p' "${state_dir}/nest-env-path")"
fi
if [[ -n "${local_env_file}" ]]; then
  if [[ ! -r "${local_env_file}" ]]; then
    echo "Nest local environment file is not readable: ${local_env_file}" >&2
    exit 1
  fi
  local_env_file="$(cd "$(dirname "${local_env_file}")" && pwd -P)/$(basename "${local_env_file}")"
elif [[ "$(uname -s)" == "Darwin" ]]; then
  echo "Nest requires a local environment file in the launchd lane." >&2
  echo "Create apps/quipsly/.env.local or set QUIPSLY_LOCAL_ENV_FILE to an external file." >&2
  exit 1
fi
local_nest_source_revision="$(
  quipsly_local_nest_source_revision "${repo_root}" "${local_env_file}"
)"
local_env_revision="none"
if [[ -n "${local_env_file}" ]]; then
  local_env_revision="$(git -C "${repo_root}" hash-object "${local_env_file}")"
fi
local_node_bin="$(command -v node)"
local_pnpm_bin="$(command -v pnpm)"
local_nest_runtime_revision="$(
  quipsly_local_runtime_revision "${repo_root}" \
    "source=${local_nest_source_revision}" \
    "node=${local_node_bin}" \
    "pnpm=${local_pnpm_bin}" \
    "env-path=${local_env_file}" \
    "env-revision=${local_env_revision}" \
    "database=${local_database_url}" \
    "media-root=${local_media_root}" \
    "worker-media-root=${local_worker_media_root}" \
    "legacy-media-roots=${local_media_legacy_roots_json}" \
    "capture-vault=${local_capture_vault_root}" \
    "capture-origin=${local_capture_upload_origin}" \
    "app-host=${local_app_host}" \
    "spatial-vault=${local_spatial_vault_root}" \
    "transcript-worker=${local_transcript_worker_available}" \
    "livekit-url=${local_livekit_url}" \
    "livekit-key=${local_livekit_key}" \
    "livekit-secret-revision=${local_livekit_secret_revision}" \
    "drive-secret-project=${local_google_drive_secret_project}" \
    "gcloud=${local_gcloud_bin}"
)"
local_livekit_runtime_revision="$(
  quipsly_local_runtime_revision "${repo_root}" \
    "binary=${local_livekit_bin}" \
    "version=${local_livekit_version}" \
    "url=${local_livekit_url}" \
    "bind=${local_livekit_bind}" \
    "node-ip=${local_livekit_node_ip}" \
    "key=${local_livekit_key}" \
    "secret-revision=${local_livekit_secret_revision}"
)"
local_media_worker_runtime_revision="$(
  quipsly_local_runtime_revision "${repo_root}" \
    "source=${local_worker_source_revision}" \
    "node=${local_node_bin}" \
    "env-path=${local_env_file}" \
    "env-revision=${local_env_revision}" \
    "database=${local_database_url}" \
    "media-root=${local_worker_media_root}" \
    "spatial-vault=${local_spatial_vault_root}" \
    "drive-secret-project=${local_google_drive_secret_project}" \
    "gcloud=${local_gcloud_bin}"
)"
local_transcript_worker_runtime_revision="$(
  quipsly_local_runtime_revision "${repo_root}" \
    "source=${local_worker_source_revision}" \
    "node=${local_node_bin}" \
    "database=${local_database_url}" \
    "media-root=${local_worker_media_root}" \
    "capture-vault=${local_capture_vault_root}" \
    "whisper=${local_whisper_executable}" \
    "whisper-model=${local_whisper_model}" \
    "whisper-device=${local_whisper_device}" \
    "whisper-language=${local_whisper_language}" \
    "build=${local_transcript_worker_build_id}"
)"

http_status() {
  curl -sS --max-time 3 -o /dev/null -w "%{http_code}" "$1" 2>/dev/null || true
}

wait_for_http() {
  local label="$1"
  local url="$2"
  local expected="$3"
  local log_file="$4"
  local attempt status

  for attempt in $(seq 1 60); do
    status="$(http_status "${url}")"
    if [[ "${status}" == "${expected}" ]]; then
      printf "PASS  %-24s HTTP %s  %s\n" "${label}" "${status}" "${url}"
      return 0
    fi
    sleep 1
  done

  printf "FAIL  %-24s did not reach HTTP %s  %s\n" "${label}" "${expected}" "${url}" >&2
  if [[ -f "${log_file}" ]]; then
    echo "Last log lines from ${log_file}:" >&2
    tail -40 "${log_file}" >&2 || true
  fi
  return 1
}

record_process() {
  local name="$1"
  local pid="$2"
  local expected_cwd="$3"
  printf "%s\n" "${pid}" >"${state_dir}/${name}.pid"
  printf "%s\n" "${expected_cwd}" >"${state_dir}/${name}.cwd"
}

launchctl_job_exists() {
  launchctl print "gui/$(id -u)/$1" >/dev/null 2>&1
}

wait_for_macos_job_running() {
  local label="$1"
  local attempt
  for attempt in $(seq 1 40); do
    if launchctl print "gui/$(id -u)/${label}" 2>/dev/null | rg -q "state = running"; then
      return 0
    fi
    sleep 0.25
  done
  return 1
}

wait_for_macos_job_absent() {
  local label="$1"
  local attempt
  for attempt in $(seq 1 40); do
    if ! launchctl_job_exists "${label}"; then
      return 0
    fi
    sleep 0.25
  done
  return 1
}

wait_for_port_release() {
  local port="$1"
  local label="$2"
  for _ in $(seq 1 50); do
    if [[ -z "$(quipsly_local_port_listener_pid "${port}")" ]]; then
      return 0
    fi
    sleep 0.2
  done
  echo "Port ${port} did not become free after stopping ${label}." >&2
  return 1
}

replace_macos_jobs() {
  local label
  for label in "${nest_label}" "${firebase_label}" "${media_worker_label}" "${transcript_worker_label}" "${livekit_label}"; do
    if launchctl_job_exists "${label}"; then
      launchctl remove "${label}"
      printf "STOP  %-24s job %s\n" "Existing local service" "${label}"
    fi
  done
  wait_for_port_release 3012 "${nest_label}"
  wait_for_port_release 9099 "${firebase_label}"
  wait_for_port_release 7880 "${livekit_label}"
  rm -f \
    "${state_dir}/nest.label" \
    "${state_dir}/firebase.label" \
    "${state_dir}/media-worker.label" \
    "${state_dir}/transcript-worker.label" \
    "${state_dir}/livekit.label" \
    "${state_dir}/transcript-worker.enabled" \
    "${state_dir}/media-worker.source-revision" \
    "${state_dir}/transcript-worker.source-revision" \
    "${state_dir}/nest.runtime-revision" \
    "${state_dir}/media-worker.runtime-revision" \
    "${state_dir}/transcript-worker.runtime-revision" \
    "${state_dir}/livekit.runtime-revision" \
    "${state_dir}/repo-root" \
    "${state_dir}/source-revision"
}

start_macos_job() {
  local name="$1"
  local label="$2"
  local mode="$3"
  local log_file="${state_dir}/${name}.log"
  local launcher_path runtime_revision
  launcher_path="$(dirname "${local_pnpm_bin}"):/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin"

  if launchctl_job_exists "${label}"; then
    launchctl remove "${label}"
    if ! wait_for_macos_job_absent "${label}"; then
      echo "launchd did not finish removing ${label}; refusing to race its replacement." >&2
      return 1
    fi
    if [[ "${name}" == "nest" ]]; then
      wait_for_port_release 3012 "${label}"
    elif [[ "${name}" == "livekit" ]]; then
      wait_for_port_release 7880 "${label}"
    fi
  fi

  : >"${log_file}"
  launchctl submit \
    -l "${label}" \
    -o "${log_file}" \
    -e "${log_file}" \
    -- /usr/bin/env \
      "QUIPSLY_LOCAL_PNPM_BIN=${local_pnpm_bin}" \
      "QUIPSLY_LOCAL_NODE_BIN=${local_node_bin}" \
      "QUIPSLY_LOCAL_ENV_FILE=${local_env_file}" \
      "QUIPSLY_LOCAL_DATABASE_URL=${local_database_url}" \
      "QUIPSLY_LOCAL_MEDIA_UPLOAD_ROOT=${local_media_root}" \
      "QUIPSLY_LOCAL_MEDIA_WORKSPACE_ROOT=${local_active_media_workspace_root}" \
      "QUIPSLY_LOCAL_MEDIA_LEGACY_ROOTS_JSON=${local_media_legacy_roots_json}" \
      "QUIPSLY_LOCAL_CAPTURE_VAULT_ROOT=${local_capture_vault_root}" \
      "QUIPSLY_LOCAL_CAPTURE_UPLOAD_ORIGIN=${local_capture_upload_origin}" \
      "QUIPSLY_LOCAL_APP_HOST=${local_app_host}" \
      "QUIPSLY_LOCAL_SPATIAL_VAULT_ROOT=${local_spatial_vault_root}" \
      "QUIPSLY_LOCAL_WHISPER_EXECUTABLE=${local_whisper_executable}" \
      "QUIPSLY_LOCAL_WHISPER_MODEL=${local_whisper_model}" \
      "QUIPSLY_LOCAL_WHISPER_DEVICE=${local_whisper_device}" \
      "QUIPSLY_LOCAL_WHISPER_LANGUAGE=${local_whisper_language}" \
      "QUIPSLY_LOCAL_TRANSCRIPT_WORKER_AVAILABLE=${local_transcript_worker_available}" \
      "QUIPSLY_LOCAL_TRANSCRIPT_WORKER_BUILD_ID=${local_transcript_worker_build_id}" \
      "QUIPSLY_LOCAL_MEDIA_WORKER_BUILD_ID=${local_worker_source_revision}" \
      "QUIPSLY_LOCAL_LIVEKIT_BIN=${local_livekit_bin}" \
      "QUIPSLY_LOCAL_LIVEKIT_URL=${local_livekit_url}" \
      "QUIPSLY_LOCAL_LIVEKIT_HTTP_URL=${local_livekit_http_url}" \
      "QUIPSLY_LOCAL_LIVEKIT_BIND=${local_livekit_bind}" \
      "QUIPSLY_LOCAL_LIVEKIT_NODE_IP=${local_livekit_node_ip}" \
      "QUIPSLY_LOCAL_LIVEKIT_KEY=${local_livekit_key}" \
      "QUIPSLY_LOCAL_LIVEKIT_SECRET=${local_livekit_secret}" \
      "QUIPSLY_LOCAL_GOOGLE_DRIVE_SECRET_PROJECT=${local_google_drive_secret_project}" \
      "QUIPSLY_LOCAL_GCLOUD_BIN=${local_gcloud_bin}" \
      "PATH=${launcher_path}" \
      /bin/bash "${repo_root}/scripts/dev/quipsly-local-up.sh" "${mode}"
  printf "%s\n" "${label}" >"${state_dir}/${name}.label"
  if [[ "${name}" == "media-worker" || "${name}" == "transcript-worker" ]]; then
    printf "%s\n" "${local_worker_source_revision}" >"${state_dir}/${name}.source-revision"
  fi
  case "${name}" in
    nest)
      runtime_revision="${local_nest_runtime_revision}"
      ;;
    media-worker)
      runtime_revision="${local_media_worker_runtime_revision}"
      ;;
    transcript-worker)
      runtime_revision="${local_transcript_worker_runtime_revision}"
      ;;
    livekit)
      runtime_revision="${local_livekit_runtime_revision}"
      ;;
    *)
      runtime_revision=""
      ;;
  esac
  if [[ -n "${runtime_revision}" ]]; then
    printf "%s\n" "${runtime_revision}" >"${state_dir}/${name}.runtime-revision"
  fi
}

if [[ "${replace_existing}" == "1" ]]; then
  if [[ "$(uname -s)" != "Darwin" ]]; then
    echo "--replace is currently supported only for the macOS launchd lane." >&2
    exit 64
  fi
  replace_macos_jobs
fi

if ! quipsly_local_docker_ready "${docker_timeout_seconds}"; then
  if [[ "$(uname -s)" == "Darwin" ]] && command -v open >/dev/null 2>&1; then
    echo "Starting Docker Desktop..."
    open -a Docker
    for _ in $(seq 1 60); do
      quipsly_local_docker_ready 2 && break
      sleep 1
    done
  fi
fi

if ! quipsly_local_docker_ready "${docker_timeout_seconds}"; then
  echo "Docker is not ready or its CLI did not answer within ${docker_timeout_seconds}s." >&2
  echo "Open Docker Desktop, wait for the engine to report ready, then run this command again." >&2
  exit 1
fi
printf "PASS  %-24s CLI answered within %ss\n" "Docker engine" "${docker_timeout_seconds}"

echo "Starting or reusing local PostgreSQL..."
if ! quipsly_local_run_docker \
  "${docker_start_timeout_seconds}" \
  compose --project-name "${compose_project}" up -d postgres; then
  echo "PostgreSQL startup did not complete within ${docker_start_timeout_seconds}s." >&2
  exit 1
fi
if ! quipsly_local_run_docker \
  "${docker_timeout_seconds}" \
  exec "${database_container}" \
  pg_isready -U postgres -d high_ground_studio >/dev/null 2>&1; then
  echo "PostgreSQL container ${database_container} is not ready." >&2
  exit 1
fi
printf "PASS  %-24s container %s\n" "PostgreSQL" "${database_container}"

echo "Generating the Prisma client from the current worktree schema..."
DATABASE_URL="${local_database_url}" pnpm db:generate
printf "PASS  %-24s current worktree schema\n" "Prisma client"

echo "Applying committed local database migrations..."
DATABASE_URL="${local_database_url}" pnpm exec prisma migrate deploy
printf "PASS  %-24s committed schema current\n" "PostgreSQL migrations"

livekit_status="$(http_status "${local_livekit_http_url%/}/")"
recorded_livekit_runtime_revision="$(sed -n '1p' "${state_dir}/livekit.runtime-revision" 2>/dev/null || true)"
if [[ "${livekit_status}" == "200" ]]; then
  if [[ "$(uname -s)" == "Darwin" ]] \
    && launchctl_job_exists "${livekit_label}" \
    && [[ "$(sed -n '1p' "${state_dir}/livekit.label" 2>/dev/null || true)" == "${livekit_label}" ]]; then
    if [[ "${recorded_livekit_runtime_revision}" == "${local_livekit_runtime_revision}" ]]; then
      printf "REUSE %-24s %s\n" "LiveKit conversation" "${local_livekit_url}"
    else
      printf "RELOAD %-23s runtime %s -> %s\n" \
        "LiveKit conversation" \
        "${recorded_livekit_runtime_revision:-unknown}" \
        "${local_livekit_runtime_revision}"
      start_macos_job "livekit" "${livekit_label}" "--run-livekit"
    fi
  else
    livekit_listener="$(quipsly_local_port_listener_pid 7880)"
    echo "Port 7880 is serving LiveKit from PID ${livekit_listener:-unknown}, but it is not an exact launcher-owned job." >&2
    echo "Stop that process or run this launcher with --replace after removing the foreign listener." >&2
    exit 1
  fi
else
  livekit_listener="$(quipsly_local_port_listener_pid 7880)"
  if [[ -n "${livekit_listener}" ]]; then
    echo "Port 7880 is occupied by PID ${livekit_listener}, but it is not a healthy LiveKit server." >&2
    exit 1
  fi
  rm -f "${state_dir}/livekit.pid" "${state_dir}/livekit.cwd"
  if [[ "$(uname -s)" == "Darwin" ]]; then
    start_macos_job "livekit" "${livekit_label}" "--run-livekit"
  else
    (
      cd "${repo_root}"
      nohup env \
        QUIPSLY_LOCAL_LIVEKIT_BIN="${local_livekit_bin}" \
        QUIPSLY_LOCAL_LIVEKIT_BIND="${local_livekit_bind}" \
        QUIPSLY_LOCAL_LIVEKIT_NODE_IP="${local_livekit_node_ip}" \
        QUIPSLY_LOCAL_LIVEKIT_KEY="${local_livekit_key}" \
        QUIPSLY_LOCAL_LIVEKIT_SECRET="${local_livekit_secret}" \
        bash "${repo_root}/scripts/dev/quipsly-local-up.sh" --run-livekit \
        >"${state_dir}/livekit.log" 2>&1 &
      record_process "livekit" "$!" "${repo_root}"
    )
  fi
fi
wait_for_http "LiveKit conversation" "${local_livekit_http_url%/}/" "200" "${state_dir}/livekit.log"
printf "%s\n" "${local_livekit_runtime_revision}" >"${state_dir}/livekit.runtime-revision"

rm -f \
  "${state_dir}/transcript-worker.pid" \
  "${state_dir}/transcript-worker.cwd" \
  "${state_dir}/transcript-worker.enabled"
if [[ -n "${local_whisper_executable}" && -x "${local_whisper_executable}" ]]; then
  printf "%s\n" "${local_whisper_executable}" >"${state_dir}/transcript-worker.enabled"
  if [[ "$(uname -s)" == "Darwin" ]]; then
    recorded_transcript_runtime_revision="$(sed -n '1p' "${state_dir}/transcript-worker.runtime-revision" 2>/dev/null || true)"
    if launchctl_job_exists "${transcript_worker_label}" && [[ "${recorded_transcript_runtime_revision}" == "${local_transcript_worker_runtime_revision}" ]]; then
      printf "REUSE %-24s job %s\n" "Transcript worker" "${transcript_worker_label}"
    else
      if launchctl_job_exists "${transcript_worker_label}"; then
        printf "RELOAD %-23s runtime %s -> %s\n" "Transcript worker" "${recorded_transcript_runtime_revision:-unknown}" "${local_transcript_worker_runtime_revision}"
      fi
      start_macos_job "transcript-worker" "${transcript_worker_label}" "--run-transcript-worker"
    fi
    if ! wait_for_macos_job_running "${transcript_worker_label}"; then
      echo "Transcript worker did not remain running." >&2
      tail -40 "${state_dir}/transcript-worker.log" >&2 || true
      exit 1
    fi
    printf "PASS  %-24s durable local Whisper processor\n" "Transcript worker"
  else
    (
      cd "${repo_root}"
      nohup env \
        DATABASE_URL="${local_database_url}" \
        QUIPSLY_LOCAL_MEDIA_UPLOAD_ROOT="${local_media_root}" \
        QUIPSLY_LOCAL_MEDIA_WORKSPACE_ROOT="${local_active_media_workspace_root}" \
        QUIPSLY_LOCAL_CAPTURE_VAULT_ROOT="${local_capture_vault_root}" \
        QUIPSLY_LOCAL_WHISPER_EXECUTABLE="${local_whisper_executable}" \
        QUIPSLY_LOCAL_WHISPER_MODEL="${local_whisper_model}" \
        QUIPSLY_LOCAL_WHISPER_DEVICE="${local_whisper_device}" \
        QUIPSLY_LOCAL_WHISPER_LANGUAGE="${local_whisper_language}" \
        QUIPSLY_LOCAL_TRANSCRIPT_WORKER_BUILD_ID="${local_transcript_worker_build_id}" \
        node "${repo_root}/scripts/dev/quipsly-local-transcript-worker.mjs" \
        >"${state_dir}/transcript-worker.log" 2>&1 &
      record_process "transcript-worker" "$!" "${repo_root}"
    )
    sleep 1
    transcript_worker_pid="$(sed -n '1p' "${state_dir}/transcript-worker.pid")"
    if ! kill -0 "${transcript_worker_pid}" 2>/dev/null; then
      echo "Transcript worker did not remain running." >&2
      tail -40 "${state_dir}/transcript-worker.log" >&2 || true
      exit 1
    fi
    printf "PASS  %-24s PID %s\n" "Transcript worker" "${transcript_worker_pid}"
  fi
else
  if [[ "$(uname -s)" == "Darwin" ]] && launchctl_job_exists "${transcript_worker_label}"; then
    launchctl remove "${transcript_worker_label}"
  fi
  rm -f "${state_dir}/transcript-worker.label"
  printf "SKIP  %-24s install Whisper or set QUIPSLY_LOCAL_WHISPER_EXECUTABLE\n" "Transcript worker"
fi

rm -f "${state_dir}/media-worker.pid" "${state_dir}/media-worker.cwd"
if [[ "$(uname -s)" == "Darwin" ]]; then
  recorded_media_runtime_revision="$(sed -n '1p' "${state_dir}/media-worker.runtime-revision" 2>/dev/null || true)"
  if launchctl_job_exists "${media_worker_label}" && [[ "${recorded_media_runtime_revision}" == "${local_media_worker_runtime_revision}" ]]; then
    printf "REUSE %-24s job %s\n" "Episode media worker" "${media_worker_label}"
  else
    if launchctl_job_exists "${media_worker_label}"; then
      printf "RELOAD %-23s runtime %s -> %s\n" "Episode media worker" "${recorded_media_runtime_revision:-unknown}" "${local_media_worker_runtime_revision}"
    fi
    start_macos_job "media-worker" "${media_worker_label}" "--run-media-worker"
  fi
  if ! wait_for_macos_job_running "${media_worker_label}"; then
    echo "Episode media worker did not remain running." >&2
    tail -40 "${state_dir}/media-worker.log" >&2 || true
    exit 1
  fi
  printf "PASS  %-24s durable local processor\n" "Episode media worker"
else
  (
    cd "${repo_root}"
    nohup env \
      DATABASE_URL="${local_database_url}" \
      QUIPSLY_LOCAL_MEDIA_UPLOAD_ROOT="${local_media_root}" \
      QUIPSLY_LOCAL_MEDIA_WORKSPACE_ROOT="${local_active_media_workspace_root}" \
      node --experimental-transform-types \
        --import "${repo_root}/scripts/register-ts-extension-loader.mjs" \
        "${repo_root}/apps/quipsly-media-processor/src/local-episode-worker.ts" \
        >"${state_dir}/media-worker.log" 2>&1 &
    record_process "media-worker" "$!" "${repo_root}"
  )
  sleep 1
  worker_pid="$(sed -n '1p' "${state_dir}/media-worker.pid")"
  if ! kill -0 "${worker_pid}" 2>/dev/null; then
    echo "Episode media worker did not remain running." >&2
    tail -40 "${state_dir}/media-worker.log" >&2 || true
    exit 1
  fi
  printf "PASS  %-24s PID %s\n" "Episode media worker" "${worker_pid}"
fi

firebase_status="$(http_status "${firebase_url%/}/emulator/v1/projects/quipsly-reef/config")"
if [[ "${firebase_status}" == "200" ]]; then
  printf "REUSE %-24s %s\n" "Firebase Auth emulator" "${firebase_url}"
else
  firebase_listener="$(quipsly_local_port_listener_pid 9099)"
  if [[ -n "${firebase_listener}" ]]; then
    echo "Port 9099 is occupied by PID ${firebase_listener}, but it is not the Quipsly Firebase Auth emulator." >&2
    exit 1
  fi

  rm -f "${state_dir}/firebase.pid" "${state_dir}/firebase.cwd"
  if [[ "$(uname -s)" == "Darwin" ]]; then
    start_macos_job "firebase" "${firebase_label}" "--run-firebase"
  else
    (
      cd "${repo_root}"
      nohup pnpm exec firebase emulators:start \
        --only auth \
        --project quipsly-reef \
        --config ops/firebase-auth-emulator.local.json \
        >"${state_dir}/firebase.log" 2>&1 &
      record_process "firebase" "$!" "${repo_root}"
    )
  fi
  wait_for_http \
    "Firebase Auth emulator" \
    "${firebase_url%/}/emulator/v1/projects/quipsly-reef/config" \
    "200" \
    "${state_dir}/firebase.log"
fi

nest_status="$(http_status "${nest_url%/}/api/health")"
login_status="$(http_status "${nest_url%/}/login?callbackUrl=%2Fprojects")"
if [[ "${nest_status}" == "200" && "${login_status}" == "200" ]]; then
  nest_listener="$(quipsly_local_port_listener_pid 3012)"
  nest_cwd=""
  if [[ -n "${nest_listener}" ]]; then
    nest_cwd="$(quipsly_local_process_cwd "${nest_listener}")"
  fi
  expected_nest_cwd="${repo_root}/apps/quipsly"
  if [[ "${nest_cwd}" != "${expected_nest_cwd}" ]]; then
    echo "A healthy Nest is running from '${nest_cwd:-unknown}', not '${expected_nest_cwd}'." >&2
    echo "Run '$0 --replace' to replace the exact Quipsly launchd jobs with this worktree." >&2
    exit 1
  fi
  recorded_nest_source_revision="$(sed -n '1p' "${state_dir}/source-revision" 2>/dev/null || true)"
  recorded_nest_runtime_revision="$(sed -n '1p' "${state_dir}/nest.runtime-revision" 2>/dev/null || true)"
  if [[ "${recorded_nest_runtime_revision}" == "${local_nest_runtime_revision}" ]]; then
    printf "REUSE %-24s %s  source %s\n" "Quipsly Nest" "${nest_url}" "${nest_cwd}"
  elif [[ "$(uname -s)" == "Darwin" ]] \
    && launchctl_job_exists "${nest_label}" \
    && [[ "$(sed -n '1p' "${state_dir}/nest.label" 2>/dev/null || true)" == "${nest_label}" ]]; then
    printf "RELOAD %-23s runtime %s -> %s\n" \
      "Quipsly Nest" \
      "${recorded_nest_runtime_revision:-unknown}" \
      "${local_nest_runtime_revision}"
    start_macos_job "nest" "${nest_label}" "--run-nest"
    wait_for_http "Nest health" "${nest_url%/}/api/health" "200" "${state_dir}/nest.log"
    wait_for_http \
      "Nest signed-out shell" \
      "${nest_url%/}/login?callbackUrl=%2Fprojects" \
      "200" \
      "${state_dir}/nest.log"
  else
    echo "A healthy Nest is serving stale source and is not an exact launcher-owned macOS job." >&2
    echo "Run 'pnpm quipsly:local:down' and then rerun this command to reload it safely." >&2
    exit 1
  fi
else
  nest_listener="$(quipsly_local_port_listener_pid 3012)"
  if [[ -n "${nest_listener}" ]]; then
    echo "Port 3012 is occupied by PID ${nest_listener}, but it is not a healthy Quipsly Nest." >&2
    exit 1
  fi

  rm -f "${state_dir}/nest.pid" "${state_dir}/nest.cwd"
  if [[ "$(uname -s)" == "Darwin" ]]; then
    start_macos_job "nest" "${nest_label}" "--run-nest"
  else
    (
      cd "${repo_root}/apps/quipsly"
      nohup env \
        PORT=3012 \
        DATABASE_URL="${local_database_url}" \
        FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099 \
        NEXT_PUBLIC_QUIPSLY_FIREBASE_AUTH_EMULATOR_URL=http://127.0.0.1:9099 \
        QUIPSLY_OWNER_OVERRIDE=false \
        QUIPSLY_LOCAL_MEDIA_UPLOADS=true \
        QUIPSLY_LOCAL_MEDIA_UPLOAD_ROOT="${local_media_root}" \
        QUIPSLY_LOCAL_MEDIA_WORKSPACE_ROOT="${local_active_media_workspace_root}" \
        QUIPSLY_LOCAL_MEDIA_LEGACY_ROOTS_JSON="${local_media_legacy_roots_json}" \
        QUIPSLY_LOCAL_CAPTURE_VAULT_ROOT="${local_capture_vault_root}" \
        QUIPSLY_LOCAL_CAPTURE_UPLOAD_ORIGIN="${local_capture_upload_origin}" \
        QUIPSLY_LOCAL_TRANSCRIPT_WORKER_AVAILABLE="${local_transcript_worker_available}" \
        GCLOUD_PROJECT=quipsly-reef \
        GOOGLE_CLOUD_PROJECT=quipsly-reef \
        pnpm dev \
        >"${state_dir}/nest.log" 2>&1 &
      record_process "nest" "$!" "${repo_root}/apps/quipsly"
    )
  fi
  wait_for_http "Nest health" "${nest_url%/}/api/health" "200" "${state_dir}/nest.log"
  wait_for_http \
    "Nest signed-out shell" \
    "${nest_url%/}/login?callbackUrl=%2Fprojects" \
    "200" \
    "${state_dir}/nest.log"
fi
wait_for_http \
  "Nest projects shell" \
  "${nest_url%/}/projects" \
  "200" \
  "${state_dir}/nest.log"

printf "%s\n" "${repo_root}" >"${state_dir}/repo-root"
printf "%s\n" "${local_nest_source_revision}" >"${state_dir}/source-revision"
printf "%s\n" "${local_nest_runtime_revision}" >"${state_dir}/nest.runtime-revision"
if [[ -n "${local_env_file}" ]]; then
  printf "%s\n" "${local_env_file}" >"${state_dir}/nest-env-path"
fi

echo
echo "Quipsly local lane is ready: ${nest_url}"
echo "Runtime source worktree: ${repo_root}"
echo "Logs and owned-process state: ${state_dir}"
echo "Run: pnpm quipsly:local:doctor"
echo "Stop only launcher-owned app processes: pnpm quipsly:local:down"
