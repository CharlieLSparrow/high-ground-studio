#!/usr/bin/env bash
set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
script_repo_root="$(cd "${script_dir}/../.." && pwd)"
source "${script_dir}/quipsly-local-state.sh"

if [[ "${1:-}" == "--run-firebase" ]]; then
  cd "${script_repo_root}"
  exec "${QUIPSLY_LOCAL_PNPM_BIN:?Missing launcher pnpm path}" exec firebase emulators:start \
    --only auth \
    --project quipsly-reef \
    --config ops/firebase-auth-emulator.local.json
fi

if [[ "${1:-}" == "--run-nest" ]]; then
  cd "${script_repo_root}/apps/quipsly"
  nest_environment=(
    PORT=3012
    "DATABASE_URL=${QUIPSLY_LOCAL_DATABASE_URL:-postgresql://postgres:postgres@127.0.0.1:5432/high_ground_studio}"
    FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099
    NEXT_PUBLIC_QUIPSLY_FIREBASE_AUTH_EMULATOR_URL=http://127.0.0.1:9099
    QUIPSLY_OWNER_OVERRIDE=false
    QUIPSLY_LOCAL_MEDIA_UPLOADS=true
    "QUIPSLY_LOCAL_MEDIA_UPLOAD_ROOT=${QUIPSLY_LOCAL_MEDIA_UPLOAD_ROOT:-}"
    "QUIPSLY_LOCAL_CAPTURE_VAULT_ROOT=${QUIPSLY_LOCAL_CAPTURE_VAULT_ROOT:-}"
    "QUIPSLY_LOCAL_CAPTURE_UPLOAD_ORIGIN=${QUIPSLY_LOCAL_CAPTURE_UPLOAD_ORIGIN:-http://127.0.0.1:3012}"
    "QUIPSLY_LOCAL_TRANSCRIPT_WORKER_AVAILABLE=${QUIPSLY_LOCAL_TRANSCRIPT_WORKER_AVAILABLE:-0}"
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
  cd "${script_repo_root}"
  worker_environment=(
    "DATABASE_URL=${QUIPSLY_LOCAL_DATABASE_URL:-postgresql://postgres:postgres@127.0.0.1:5432/high_ground_studio}"
    "QUIPSLY_LOCAL_MEDIA_UPLOAD_ROOT=${QUIPSLY_LOCAL_MEDIA_UPLOAD_ROOT:-}"
    "QUIPSLY_LOCAL_MEDIA_WORKER_BUILD_ID=${QUIPSLY_LOCAL_MEDIA_WORKER_BUILD_ID:-local-development}"
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
local_capture_vault_root="${QUIPSLY_LOCAL_CAPTURE_VAULT_ROOT:-${local_media_root}/capture-vault}"
local_capture_upload_origin="${QUIPSLY_LOCAL_CAPTURE_UPLOAD_ORIGIN:-${nest_url}}"
docker_timeout_seconds="$(quipsly_local_docker_timeout_seconds)"
docker_start_timeout_seconds="$(quipsly_local_docker_start_timeout_seconds)"
firebase_label="com.quipsly.local.firebase"
nest_label="com.quipsly.local.nest"
media_worker_label="com.quipsly.local.media-worker"
transcript_worker_label="com.quipsly.local.transcript-worker"
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
local_transcript_worker_build_id="${QUIPSLY_LOCAL_TRANSCRIPT_WORKER_BUILD_ID:-$(git rev-parse HEAD)}"
if [[ -n "$(git status --porcelain=v1 --untracked-files=all -- scripts/dev/quipsly-local-transcript-worker.mjs)" ]]; then
  local_transcript_worker_build_id="${local_transcript_worker_build_id}-dirty"
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
  for label in "${nest_label}" "${firebase_label}" "${media_worker_label}" "${transcript_worker_label}"; do
    if launchctl_job_exists "${label}"; then
      launchctl remove "${label}"
      printf "STOP  %-24s job %s\n" "Existing local service" "${label}"
    fi
  done
  wait_for_port_release 3012 "${nest_label}"
  wait_for_port_release 9099 "${firebase_label}"
  rm -f \
    "${state_dir}/nest.label" \
    "${state_dir}/firebase.label" \
    "${state_dir}/media-worker.label" \
    "${state_dir}/transcript-worker.label" \
    "${state_dir}/transcript-worker.enabled" \
    "${state_dir}/repo-root" \
    "${state_dir}/source-revision"
}

start_macos_job() {
  local name="$1"
  local label="$2"
  local mode="$3"
  local log_file="${state_dir}/${name}.log"
  local node_bin pnpm_bin launcher_path
  node_bin="$(command -v node)"
  pnpm_bin="$(command -v pnpm)"
  launcher_path="$(dirname "${pnpm_bin}"):/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin"

  if launchctl_job_exists "${label}"; then
    launchctl remove "${label}"
  fi

  : >"${log_file}"
  launchctl submit \
    -l "${label}" \
    -o "${log_file}" \
    -e "${log_file}" \
    -- /usr/bin/env \
      "QUIPSLY_LOCAL_PNPM_BIN=${pnpm_bin}" \
      "QUIPSLY_LOCAL_NODE_BIN=${node_bin}" \
      "QUIPSLY_LOCAL_ENV_FILE=${local_env_file}" \
      "QUIPSLY_LOCAL_DATABASE_URL=${local_database_url}" \
      "QUIPSLY_LOCAL_MEDIA_UPLOAD_ROOT=${local_media_root}" \
      "QUIPSLY_LOCAL_CAPTURE_VAULT_ROOT=${local_capture_vault_root}" \
      "QUIPSLY_LOCAL_CAPTURE_UPLOAD_ORIGIN=${local_capture_upload_origin}" \
      "QUIPSLY_LOCAL_WHISPER_EXECUTABLE=${local_whisper_executable}" \
      "QUIPSLY_LOCAL_WHISPER_MODEL=${local_whisper_model}" \
      "QUIPSLY_LOCAL_WHISPER_DEVICE=${local_whisper_device}" \
      "QUIPSLY_LOCAL_WHISPER_LANGUAGE=${local_whisper_language}" \
      "QUIPSLY_LOCAL_TRANSCRIPT_WORKER_AVAILABLE=${local_transcript_worker_available}" \
      "QUIPSLY_LOCAL_TRANSCRIPT_WORKER_BUILD_ID=${local_transcript_worker_build_id}" \
      "PATH=${launcher_path}" \
      /bin/bash "${repo_root}/scripts/dev/quipsly-local-up.sh" "${mode}"
  printf "%s\n" "${label}" >"${state_dir}/${name}.label"
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

rm -f \
  "${state_dir}/transcript-worker.pid" \
  "${state_dir}/transcript-worker.cwd" \
  "${state_dir}/transcript-worker.enabled"
if [[ -n "${local_whisper_executable}" && -x "${local_whisper_executable}" ]]; then
  printf "%s\n" "${local_whisper_executable}" >"${state_dir}/transcript-worker.enabled"
  if [[ "$(uname -s)" == "Darwin" ]]; then
    if launchctl_job_exists "${transcript_worker_label}"; then
      printf "REUSE %-24s job %s\n" "Transcript worker" "${transcript_worker_label}"
    else
      start_macos_job "transcript-worker" "${transcript_worker_label}" "--run-transcript-worker"
      sleep 1
    fi
    if ! launchctl print "gui/$(id -u)/${transcript_worker_label}" 2>/dev/null | rg -q "state = running"; then
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
  if launchctl_job_exists "${media_worker_label}"; then
    printf "REUSE %-24s job %s\n" "Episode media worker" "${media_worker_label}"
  else
    start_macos_job "media-worker" "${media_worker_label}" "--run-media-worker"
    sleep 1
  fi
  if ! launchctl print "gui/$(id -u)/${media_worker_label}" 2>/dev/null | rg -q "state = running"; then
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
  printf "REUSE %-24s %s  source %s\n" "Quipsly Nest" "${nest_url}" "${nest_cwd}"
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
git rev-parse HEAD >"${state_dir}/source-revision"
if [[ -n "${local_env_file}" ]]; then
  printf "%s\n" "${local_env_file}" >"${state_dir}/nest-env-path"
fi

echo
echo "Quipsly local lane is ready: ${nest_url}"
echo "Runtime source worktree: ${repo_root}"
echo "Logs and owned-process state: ${state_dir}"
echo "Run: pnpm quipsly:local:doctor"
echo "Stop only launcher-owned app processes: pnpm quipsly:local:down"
