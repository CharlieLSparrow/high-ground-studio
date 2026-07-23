#!/usr/bin/env bash
set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
script_repo_root="$(cd "${script_dir}/../.." && pwd)"

if [[ "${1:-}" == "--run-firebase" ]]; then
  cd "${script_repo_root}"
  exec "${QUIPSLY_LOCAL_PNPM_BIN:?Missing launcher pnpm path}" exec firebase emulators:start \
    --only auth \
    --project quipsly-reef \
    --config ops/firebase-auth-emulator.local.json
fi

if [[ "${1:-}" == "--run-nest" ]]; then
  cd "${script_repo_root}/apps/quipsly"
  exec /usr/bin/env \
    PORT=3012 \
    FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099 \
    NEXT_PUBLIC_QUIPSLY_FIREBASE_AUTH_EMULATOR_URL=http://127.0.0.1:9099 \
    QUIPSLY_OWNER_OVERRIDE=false \
    GCLOUD_PROJECT=quipsly-reef \
    GOOGLE_CLOUD_PROJECT=quipsly-reef \
    "${QUIPSLY_LOCAL_PNPM_BIN:?Missing launcher pnpm path}" dev
fi

repo_root="$(git rev-parse --show-toplevel 2>/dev/null || true)"
if [[ -z "${repo_root}" ]]; then
  echo "Run this command from inside the High Ground Studio repository." >&2
  exit 1
fi
cd "${repo_root}"

state_dir="${QUIPSLY_LOCAL_STATE_DIR:-${repo_root}/.tmp/quipsly-local}"
nest_url="${TARGET_URL:-http://127.0.0.1:3012}"
firebase_url="${QUIPSLY_LOCAL_FIREBASE_AUTH_URL:-http://127.0.0.1:9099}"
database_container="${QUIPSLY_LOCAL_DATABASE_CONTAINER:-high-ground-db}"
firebase_label="com.quipsly.local.firebase"
nest_label="com.quipsly.local.nest"
mkdir -p "${state_dir}"

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

port_listener_pid() {
  local port="$1"
  lsof -nP -iTCP:"${port}" -sTCP:LISTEN -t 2>/dev/null | head -1 || true
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

start_macos_job() {
  local name="$1"
  local label="$2"
  local mode="$3"
  local log_file="${state_dir}/${name}.log"
  local pnpm_bin launcher_path
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
      "PATH=${launcher_path}" \
      /bin/bash "${repo_root}/scripts/dev/quipsly-local-up.sh" "${mode}"
  printf "%s\n" "${label}" >"${state_dir}/${name}.label"
}

if ! docker info >/dev/null 2>&1; then
  if [[ "$(uname -s)" == "Darwin" ]] && command -v open >/dev/null 2>&1; then
    echo "Starting Docker Desktop..."
    open -a Docker
    for _ in $(seq 1 60); do
      docker info >/dev/null 2>&1 && break
      sleep 1
    done
  fi
fi

if ! docker info >/dev/null 2>&1; then
  echo "Docker is not ready. Start Docker Desktop, then run this command again." >&2
  exit 1
fi

echo "Starting or reusing local PostgreSQL..."
docker compose up -d postgres
if ! docker exec "${database_container}" pg_isready -U postgres -d high_ground_studio >/dev/null 2>&1; then
  echo "PostgreSQL container ${database_container} is not ready." >&2
  exit 1
fi
printf "PASS  %-24s container %s\n" "PostgreSQL" "${database_container}"

firebase_status="$(http_status "${firebase_url%/}/emulator/v1/projects/quipsly-reef/config")"
if [[ "${firebase_status}" == "200" ]]; then
  printf "REUSE %-24s %s\n" "Firebase Auth emulator" "${firebase_url}"
else
  firebase_listener="$(port_listener_pid 9099)"
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
  printf "REUSE %-24s %s\n" "Quipsly Nest" "${nest_url}"
else
  nest_listener="$(port_listener_pid 3012)"
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
        FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099 \
        NEXT_PUBLIC_QUIPSLY_FIREBASE_AUTH_EMULATOR_URL=http://127.0.0.1:9099 \
        QUIPSLY_OWNER_OVERRIDE=false \
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

echo
echo "Quipsly local lane is ready: ${nest_url}"
echo "Logs and owned-process state: ${state_dir}"
echo "Run: pnpm quipsly:local:doctor"
echo "Stop only launcher-owned app processes: pnpm quipsly:local:down"
