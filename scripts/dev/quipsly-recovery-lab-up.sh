#!/usr/bin/env bash
set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
repo_root="$(cd "${script_dir}/../.." && pwd -P)"
source "${script_dir}/quipsly-recovery-lab-state.sh"

state_dir="$(quipsly_recovery_lab_state_dir)"
media_state_dir="$(quipsly_recovery_lab_media_state_dir)"
media_root="${media_state_dir}/media"
capture_vault_root="${media_root}/capture-vault"
database_url="$(quipsly_recovery_lab_database_url)"
database_container="quipsly-portable-recovery-lab-db"
database_label="com.quipsly.recovery-lab"
firebase_label="com.quipsly.recovery-lab.firebase"
nest_label="com.quipsly.recovery-lab.nest"
livekit_label="com.quipsly.recovery-lab.livekit"
transcript_worker_label="com.quipsly.recovery-lab.transcript-worker"
media_worker_label="com.quipsly.recovery-lab.media-worker"
firebase_url="http://127.0.0.1:9199"
nest_url="http://127.0.0.1:3022"
livekit_url="ws://127.0.0.1:7890"
livekit_http_url="http://127.0.0.1:7890"
livekit_api_key="recoverykey"
livekit_api_secret="recoverysecret"
whisper_executable="${QUIPSLY_RECOVERY_LAB_WHISPER_EXECUTABLE:-/opt/homebrew/Caskroom/miniconda/base/bin/whisper}"
whisper_model="${QUIPSLY_RECOVERY_LAB_WHISPER_MODEL:-small}"
firebase_project="quipsly-recovery-lab"
pnpm_bin="${QUIPSLY_RECOVERY_LAB_PNPM_BIN:-$(command -v pnpm)}"

if [[ "${1:-}" == "--run-livekit" ]]; then
  livekit_bin="${QUIPSLY_RECOVERY_LAB_LIVEKIT_BIN:-$(command -v livekit-server 2>/dev/null || true)}"
  if [[ -z "${livekit_bin}" || ! -x "${livekit_bin}" ]]; then
    echo "Recovery lab requires the LiveKit server executable." >&2
    exit 1
  fi
  exec "${livekit_bin}" \
    --dev \
    --bind 127.0.0.1 \
    --node-ip 127.0.0.1 \
    --config-body $'port: 7890\nrtc:\n  tcp_port: 7891\n  udp_port: 7892\n  use_external_ip: false\n' \
    --keys "${livekit_api_key}: ${livekit_api_secret}"
fi

if [[ "${1:-}" == "--run-transcript-worker" ]]; then
  if [[ ! -x "${whisper_executable}" ]]; then
    echo "Recovery lab requires a local Whisper executable." >&2
    exit 1
  fi
  cd "${repo_root}"
  exec /usr/bin/env \
    DATABASE_URL="${database_url}" \
    QUIPSLY_LOCAL_MEDIA_UPLOAD_ROOT="${media_root}" \
    QUIPSLY_LOCAL_MEDIA_WORKSPACE_ROOT="${media_root}" \
    QUIPSLY_LOCAL_CAPTURE_VAULT_ROOT="${capture_vault_root}" \
    QUIPSLY_LOCAL_WHISPER_EXECUTABLE="${whisper_executable}" \
    QUIPSLY_LOCAL_WHISPER_MODEL="${whisper_model}" \
    QUIPSLY_LOCAL_WHISPER_DEVICE=cpu \
    QUIPSLY_LOCAL_WHISPER_LANGUAGE=en \
    QUIPSLY_LOCAL_TRANSCRIPT_WORKER_BUILD_ID="$(git rev-parse HEAD)" \
    TSX_TSCONFIG_PATH="${repo_root}/apps/quipsly/tsconfig.json" \
    node \
      --import tsx \
      --import "${repo_root}/scripts/register-ts-extension-loader.mjs" \
      "${repo_root}/scripts/dev/quipsly-local-transcript-worker.mjs"
fi

if [[ "${1:-}" == "--run-media-worker" ]]; then
  cd "${repo_root}"
  exec /usr/bin/env \
    DATABASE_URL="${database_url}" \
    QUIPSLY_LOCAL_MEDIA_UPLOAD_ROOT="${media_root}" \
    QUIPSLY_LOCAL_MEDIA_WORKSPACE_ROOT="${media_root}" \
    QUIPSLY_LOCAL_CAPTURE_VAULT_ROOT="${capture_vault_root}" \
    QUIPSLY_LOCAL_MEDIA_WORKER_BUILD_ID="$(git rev-parse HEAD)" \
    node \
      --experimental-transform-types \
      --import "${repo_root}/scripts/register-ts-extension-loader.mjs" \
      "${repo_root}/apps/quipsly-media-processor/src/local-episode-worker.ts"
fi

if [[ "${1:-}" == "--run-firebase" ]]; then
  cd "${repo_root}"
  exec "${pnpm_bin:?Missing launcher pnpm path}" \
    exec firebase emulators:start \
    --only auth \
    --project "${firebase_project}" \
    --config ops/firebase-auth-emulator.recovery-lab.json
fi

if [[ "${1:-}" == "--run-nest" ]]; then
  secret_file="${state_dir}/auth-secret"
  if [[ ! -r "${secret_file}" ]]; then
    echo "Recovery-lab auth secret is unavailable." >&2
    exit 1
  fi
  auth_secret="$(sed -n '1p' "${secret_file}")"
  cd "${repo_root}/apps/quipsly"
  exec /usr/bin/env \
    PORT=3022 \
    QUIPSLY_BUILD_DIST_DIR=.next-recovery-lab \
    DATABASE_URL="${database_url}" \
    AUTH_SECRET="${auth_secret}" \
    NEXTAUTH_SECRET="${auth_secret}" \
    AUTH_URL="${nest_url}" \
    NEXTAUTH_URL="${nest_url}" \
    AUTH_TRUST_HOST=true \
    QUIPSLY_SOURCE_SHA="$(git rev-parse HEAD)" \
    QUIPSLY_RELEASE_CHANNEL=recovery-lab \
    FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9199 \
    NEXT_PUBLIC_QUIPSLY_FIREBASE_AUTH_EMULATOR_URL="${firebase_url}" \
    FIREBASE_PROJECT_ID="${firebase_project}" \
    GCLOUD_PROJECT="${firebase_project}" \
    GOOGLE_CLOUD_PROJECT="${firebase_project}" \
    NEXT_PUBLIC_FIREBASE_API_KEY=recovery-lab-api-key \
    NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=quipsly-recovery-lab.firebaseapp.com \
    NEXT_PUBLIC_FIREBASE_PROJECT_ID="${firebase_project}" \
    NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=quipsly-recovery-lab.appspot.com \
    NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=123456789 \
    NEXT_PUBLIC_FIREBASE_APP_ID=1:123456789:web:recoverylab \
    QUIPSLY_LOCAL_MEDIA_UPLOADS=true \
    QUIPSLY_LOCAL_MEDIA_UPLOAD_ROOT="${media_root}" \
    QUIPSLY_LOCAL_MEDIA_WORKSPACE_ROOT="${media_root}" \
    QUIPSLY_LOCAL_CAPTURE_VAULT_ROOT="${capture_vault_root}" \
    QUIPSLY_LOCAL_CAPTURE_UPLOAD_ORIGIN="${nest_url}" \
    QUIPSLY_APP_HOST="${nest_url}" \
    LIVEKIT_URL="${livekit_url}" \
    LIVEKIT_API_KEY="${livekit_api_key}" \
    LIVEKIT_API_SECRET="${livekit_api_secret}" \
    QUIPSLY_LOCAL_TRANSCRIPT_WORKER_AVAILABLE=1 \
    QUIPSLY_SESSION_INVITATION_DELIVERY_MODE=local-receipt \
    QUIPSLY_OWNER_OVERRIDE=false \
    "${pnpm_bin:?Missing launcher pnpm path}" dev
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

cd "${repo_root}"
umask 077
mkdir -p "${state_dir}"
docker_timeout_seconds="$(quipsly_local_docker_timeout_seconds)"
docker_start_timeout_seconds="$(quipsly_local_docker_start_timeout_seconds)"

dirty_source="$(git status --porcelain=v1 --untracked-files=all)"
if [[ -n "${dirty_source}" && "${QUIPSLY_RECOVERY_LAB_ALLOW_DIRTY:-0}" != "1" ]]; then
  echo "Recovery rehearsal requires a clean committed source revision." >&2
  echo "Commit the intended slice, or set QUIPSLY_RECOVERY_LAB_ALLOW_DIRTY=1 for development only." >&2
  exit 1
fi

current_revision="$(git rev-parse HEAD)"
recorded_revision="$(sed -n '1p' "${state_dir}/source-revision" 2>/dev/null || true)"
source_revision_changed=0
if [[ -n "${recorded_revision}" && "${recorded_revision}" != "${current_revision}" ]]; then
  source_revision_changed=1
fi

if [[ "${replace_existing}" == "1" ]]; then
  bash "${script_dir}/quipsly-recovery-lab-down.sh"
  # `recorded_revision` was sampled before the owned reset so we could decide
  # whether an ordinary start needs to rotate revision-bound workers. A full
  # replacement deliberately deletes that ownership ledger. Do not carry its
  # stale in-memory change flag past the reset and then demand a file that the
  # reset correctly removed.
  recorded_revision=""
  source_revision_changed=0
fi

if ! quipsly_local_docker_ready "${docker_timeout_seconds}"; then
  echo "Docker is not ready or its CLI did not answer within ${docker_timeout_seconds}s." >&2
  echo "Start Docker Desktop, wait for the engine to report ready, then run this command again." >&2
  exit 1
fi
printf "PASS  %-24s CLI answered within %ss\n" "Docker engine" "${docker_timeout_seconds}"

container_exists="$(
  quipsly_local_run_docker \
    "${docker_timeout_seconds}" \
    ps -a --filter "name=^${database_container}$" --format '{{.Names}}'
)"
if [[ -n "${container_exists}" ]]; then
  actual_label="$(
    quipsly_local_run_docker \
      "${docker_timeout_seconds}" \
      inspect --format "{{ index .Config.Labels \"${database_label}\" }}" "${database_container}"
  )"
  if [[ "${actual_label}" != "true" ]]; then
    echo "Container ${database_container} is not owned by the Quipsly recovery lab." >&2
    exit 1
  fi
  if ! quipsly_local_run_docker \
    "${docker_timeout_seconds}" \
    exec "${database_container}" \
    pg_isready -U postgres -d quipsly_portable_recovery_lab >/dev/null 2>&1; then
    echo "Owned recovery database container exists but is not ready. Use --replace." >&2
    exit 1
  fi
  printf "REUSE %-24s container %s\n" "Disposable PostgreSQL" "${database_container}"
else
  quipsly_local_run_docker "${docker_start_timeout_seconds}" run -d --rm \
    --name "${database_container}" \
    --label "${database_label}=true" \
    -e POSTGRES_USER=postgres \
    -e POSTGRES_PASSWORD=quipsly_recovery_lab \
    -e POSTGRES_DB=quipsly_portable_recovery_lab \
    -p 127.0.0.1:55432:5432 \
    pgvector/pgvector:pg15 >/dev/null

  readiness_streak=0
  for _ in $(seq 1 120); do
    if quipsly_local_run_docker \
      "${docker_timeout_seconds}" \
      exec "${database_container}" \
      psql -U postgres -d quipsly_portable_recovery_lab -Atc "select 1" \
      >/dev/null 2>&1; then
      readiness_streak="$((readiness_streak + 1))"
      if [[ "${readiness_streak}" -ge 2 ]]; then
        break
      fi
    else
      readiness_streak=0
    fi
    sleep 0.5
  done
  if [[ "${readiness_streak}" -lt 2 ]]; then
    quipsly_local_run_docker \
      "${docker_timeout_seconds}" \
      logs --tail 80 "${database_container}" >&2 || true
    exit 1
  fi
  printf "PASS  %-24s container %s\n" "Disposable PostgreSQL" "${database_container}"
fi

echo "Applying committed migrations to the disposable database..."
DATABASE_URL="${database_url}" pnpm exec prisma migrate deploy
DATABASE_URL="${database_url}" pnpm exec prisma migrate status
pnpm exec prisma generate

if [[ ! -s "${state_dir}/auth-secret" ]]; then
  openssl rand -base64 48 | tr -d '\n' >"${state_dir}/auth-secret"
  printf "\n" >>"${state_dir}/auth-secret"
  chmod 0600 "${state_dir}/auth-secret"
fi

wait_for_http() {
  local label="$1"
  local url="$2"
  local expected="$3"
  local log_file="$4"
  local status
  for _ in $(seq 1 90); do
    status="$(quipsly_recovery_lab_http_status "${url}")"
    if [[ "${status}" == "${expected}" ]]; then
      printf "PASS  %-24s HTTP %s  %s\n" "${label}" "${status}" "${url}"
      return 0
    fi
    sleep 1
  done
  printf "FAIL  %-24s expected HTTP %s  %s\n" "${label}" "${expected}" "${url}" >&2
  tail -60 "${log_file}" >&2 2>/dev/null || true
  return 1
}

launchctl_job_exists() {
  launchctl print "gui/$(id -u)/$1" >/dev/null 2>&1
}

record_process() {
  local name="$1"
  local pid="$2"
  local cwd="$3"
  printf "%s\n" "${pid}" >"${state_dir}/${name}.pid"
  printf "%s\n" "${cwd}" >"${state_dir}/${name}.cwd"
}

start_macos_job() {
  local name="$1"
  local label="$2"
  local mode="$3"
  local log_file="${state_dir}/${name}.log"
  local pnpm_bin launcher_path
  pnpm_bin="$(command -v pnpm)"
  launcher_path="$(dirname "${pnpm_bin}"):/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin"

  : >"${log_file}"
  launchctl submit \
    -l "${label}" \
    -o "${log_file}" \
    -e "${log_file}" \
    -- /usr/bin/env \
      "QUIPSLY_RECOVERY_LAB_PNPM_BIN=${pnpm_bin}" \
      "PATH=${launcher_path}" \
      /bin/bash "${repo_root}/scripts/dev/quipsly-recovery-lab-up.sh" "${mode}"
  printf "%s\n" "${label}" >"${state_dir}/${name}.label"
}

descendants() {
  local parent="$1"
  local child
  while IFS= read -r child; do
    [[ -n "${child}" ]] || continue
    descendants "${child}"
    printf "%s\n" "${child}"
  done < <(pgrep -P "${parent}" 2>/dev/null || true)
}

restart_owned_macos_job() {
  local name="$1"
  local expected_label="$2"
  local label_file="${state_dir}/${name}.label"
  [[ -f "${label_file}" ]] || return 0
  local actual_label
  actual_label="$(tr -d '[:space:]' <"${label_file}")"
  if [[ "${actual_label}" != "${expected_label}" ]]; then
    echo "REFUSE ${name}: state names '${actual_label}', expected '${expected_label}'." >&2
    exit 1
  fi
  if launchctl_job_exists "${actual_label}"; then
    launchctl remove "${actual_label}"
    for _ in $(seq 1 100); do
      if ! launchctl_job_exists "${actual_label}"; then
        break
      fi
      sleep 0.1
    done
    if launchctl_job_exists "${actual_label}"; then
      echo "Recovery ${name} job did not stop after its source revision changed." >&2
      exit 1
    fi
    printf "RESTART %-22s source revision changed\n" "${name}"
  fi
  rm -f "${label_file}"
}

restart_owned_process() {
  local name="$1"
  local expected_cwd="$2"
  local pid_file="${state_dir}/${name}.pid"
  local cwd_file="${state_dir}/${name}.cwd"
  [[ -f "${pid_file}" && -f "${cwd_file}" ]] || return 0
  local pid recorded_cwd actual_cwd child_pids
  pid="$(tr -d '[:space:]' <"${pid_file}")"
  recorded_cwd="$(sed -n '1p' "${cwd_file}")"
  actual_cwd="$(quipsly_local_process_cwd "${pid}")"
  if [[ "${recorded_cwd}" != "${expected_cwd}" || "${actual_cwd}" != "${expected_cwd}" ]]; then
    echo "REFUSE ${name}: running cwd is '${actual_cwd:-unknown}', expected '${expected_cwd}'." >&2
    exit 1
  fi
  child_pids="$(descendants "${pid}")"
  if [[ -n "${child_pids}" ]]; then
    while IFS= read -r child; do
      [[ -n "${child}" ]] && kill -TERM "${child}" 2>/dev/null || true
    done <<<"${child_pids}"
  fi
  kill -TERM "${pid}" 2>/dev/null || true
  rm -f "${pid_file}" "${cwd_file}"
  printf "RESTART %-22s source revision changed\n" "${name}"
}

if [[ "${source_revision_changed}" == "1" ]]; then
  recorded_root="$(sed -n '1p' "${state_dir}/repo-root" 2>/dev/null || true)"
  if [[ "${recorded_root}" != "${repo_root}" ]]; then
    echo "Recovery source revision changed, but its recorded worktree owner is '${recorded_root:-unknown}'." >&2
    exit 1
  fi
  if [[ "$(uname -s)" == "Darwin" ]]; then
    restart_owned_macos_job "nest" "${nest_label}"
    restart_owned_macos_job "transcript-worker" "${transcript_worker_label}"
    restart_owned_macos_job "media-worker" "${media_worker_label}"
  else
    restart_owned_process "nest" "${repo_root}/apps/quipsly"
    restart_owned_process "transcript-worker" "${repo_root}"
    restart_owned_process "media-worker" "${repo_root}"
  fi
fi

mkdir -p \
  "${media_root}" \
  "${capture_vault_root}"

livekit_status="$(quipsly_recovery_lab_http_status "${livekit_http_url}/")"
if [[ "${livekit_status}" == "200" ]]; then
  recorded_root="$(sed -n '1p' "${state_dir}/repo-root" 2>/dev/null || true)"
  if [[ "${recorded_root}" != "${repo_root}" ]]; then
    echo "Port 7890 has a recovery LiveKit service not owned by this worktree. Use --replace only after inspection." >&2
    exit 1
  fi
  printf "REUSE %-24s %s\n" "LiveKit conversation" "${livekit_http_url}"
elif [[ -n "$(quipsly_local_port_listener_pid 7890)" ]]; then
  echo "Port 7890 is occupied by a process that is not this recovery lab." >&2
  exit 1
else
  if [[ "$(uname -s)" == "Darwin" ]]; then
    if launchctl_job_exists "${livekit_label}"; then
      echo "Recovery LiveKit job exists without a healthy endpoint. Use --replace." >&2
      exit 1
    fi
    start_macos_job "livekit" "${livekit_label}" "--run-livekit"
  else
    (
      cd "${repo_root}"
      nohup /bin/bash "${repo_root}/scripts/dev/quipsly-recovery-lab-up.sh" --run-livekit \
        >"${state_dir}/livekit.log" 2>&1 &
      record_process "livekit" "$!" "${repo_root}"
    )
  fi
  wait_for_http \
    "LiveKit conversation" \
    "${livekit_http_url}/" \
    "200" \
    "${state_dir}/livekit.log"
fi

if [[ ! -x "${whisper_executable}" ]]; then
  echo "Recovery coaching flight requires Whisper at ${whisper_executable}." >&2
  exit 1
fi
if [[ "$(uname -s)" == "Darwin" ]]; then
  if launchctl_job_exists "${transcript_worker_label}"; then
    printf "REUSE %-24s job %s\n" "Transcript worker" "${transcript_worker_label}"
  else
    start_macos_job \
      "transcript-worker" \
      "${transcript_worker_label}" \
      "--run-transcript-worker"
    sleep 1
    if ! launchctl_job_exists "${transcript_worker_label}"; then
      echo "Recovery transcript worker did not remain running." >&2
      tail -60 "${state_dir}/transcript-worker.log" >&2 2>/dev/null || true
      exit 1
    fi
    printf "PASS  %-24s local Whisper model %s\n" "Transcript worker" "${whisper_model}"
  fi
else
  if [[ -f "${state_dir}/transcript-worker.pid" ]] && \
    kill -0 "$(sed -n '1p' "${state_dir}/transcript-worker.pid")" 2>/dev/null; then
    printf "REUSE %-24s PID %s\n" "Transcript worker" "$(sed -n '1p' "${state_dir}/transcript-worker.pid")"
  else
    (
      cd "${repo_root}"
      nohup /bin/bash "${repo_root}/scripts/dev/quipsly-recovery-lab-up.sh" --run-transcript-worker \
        >"${state_dir}/transcript-worker.log" 2>&1 &
      record_process "transcript-worker" "$!" "${repo_root}"
    )
    sleep 1
    if ! kill -0 "$(sed -n '1p' "${state_dir}/transcript-worker.pid")" 2>/dev/null; then
      echo "Recovery transcript worker did not remain running." >&2
      tail -60 "${state_dir}/transcript-worker.log" >&2 2>/dev/null || true
      exit 1
    fi
  fi
fi

if [[ "$(uname -s)" == "Darwin" ]]; then
  if launchctl_job_exists "${media_worker_label}"; then
    printf "REUSE %-24s job %s\n" "Media worker" "${media_worker_label}"
  else
    start_macos_job "media-worker" "${media_worker_label}" "--run-media-worker"
    sleep 1
    if ! launchctl_job_exists "${media_worker_label}"; then
      echo "Recovery media worker did not remain running." >&2
      tail -60 "${state_dir}/media-worker.log" >&2 2>/dev/null || true
      exit 1
    fi
    printf "PASS  %-24s isolated media processor\n" "Media worker"
  fi
else
  if [[ -f "${state_dir}/media-worker.pid" ]] && \
    kill -0 "$(sed -n '1p' "${state_dir}/media-worker.pid")" 2>/dev/null; then
    printf "REUSE %-24s PID %s\n" "Media worker" "$(sed -n '1p' "${state_dir}/media-worker.pid")"
  else
    (
      cd "${repo_root}"
      nohup /bin/bash "${repo_root}/scripts/dev/quipsly-recovery-lab-up.sh" --run-media-worker \
        >"${state_dir}/media-worker.log" 2>&1 &
      record_process "media-worker" "$!" "${repo_root}"
    )
    sleep 1
    if ! kill -0 "$(sed -n '1p' "${state_dir}/media-worker.pid")" 2>/dev/null; then
      echo "Recovery media worker did not remain running." >&2
      tail -60 "${state_dir}/media-worker.log" >&2 2>/dev/null || true
      exit 1
    fi
  fi
fi

firebase_status="$(quipsly_recovery_lab_http_status "${firebase_url}/emulator/v1/projects/${firebase_project}/config")"
if [[ "${firebase_status}" == "200" ]]; then
  recorded_root="$(sed -n '1p' "${state_dir}/repo-root" 2>/dev/null || true)"
  if [[ "${recorded_root}" != "${repo_root}" ]]; then
    echo "Port 9199 has a recovery emulator not owned by this worktree. Use --replace only after inspection." >&2
    exit 1
  fi
  printf "REUSE %-24s %s\n" "Firebase Auth emulator" "${firebase_url}"
elif [[ -n "$(quipsly_local_port_listener_pid 9199)" ]]; then
  echo "Port 9199 is occupied by a process that is not this recovery lab." >&2
  exit 1
else
  if [[ "$(uname -s)" == "Darwin" ]]; then
    if launchctl_job_exists "${firebase_label}"; then
      echo "Recovery Firebase job exists without a healthy endpoint. Use --replace." >&2
      exit 1
    fi
    start_macos_job "firebase" "${firebase_label}" "--run-firebase"
  else
    (
      cd "${repo_root}"
      nohup /bin/bash "${repo_root}/scripts/dev/quipsly-recovery-lab-up.sh" --run-firebase \
        >"${state_dir}/firebase.log" 2>&1 &
      record_process "firebase" "$!" "${repo_root}"
    )
  fi
  wait_for_http \
    "Firebase Auth emulator" \
    "${firebase_url}/emulator/v1/projects/${firebase_project}/config" \
    "200" \
    "${state_dir}/firebase.log"
fi

nest_status="$(quipsly_recovery_lab_http_status "${nest_url}/api/health")"
if [[ "${nest_status}" == "200" ]]; then
  listener="$(quipsly_local_port_listener_pid 3022)"
  actual_cwd="$(quipsly_local_process_cwd "${listener}")"
  if [[ "${actual_cwd}" != "${repo_root}/apps/quipsly" ]]; then
    echo "A healthy service on port 3022 is running from '${actual_cwd:-unknown}'." >&2
    exit 1
  fi
  printf "REUSE %-24s %s\n" "Recovery Nest" "${nest_url}"
elif [[ -n "$(quipsly_local_port_listener_pid 3022)" ]]; then
  echo "Port 3022 is occupied by a process that is not a healthy recovery Nest." >&2
  exit 1
else
  if [[ "$(uname -s)" == "Darwin" ]]; then
    if launchctl_job_exists "${nest_label}"; then
      echo "Recovery Nest job exists without a healthy endpoint. Use --replace." >&2
      exit 1
    fi
    start_macos_job "nest" "${nest_label}" "--run-nest"
  else
    (
      cd "${repo_root}/apps/quipsly"
      nohup /bin/bash "${repo_root}/scripts/dev/quipsly-recovery-lab-up.sh" --run-nest \
        >"${state_dir}/nest.log" 2>&1 &
      record_process "nest" "$!" "${repo_root}/apps/quipsly"
    )
  fi
  wait_for_http "Recovery Nest" "${nest_url}/api/health" "200" "${state_dir}/nest.log"
fi

wait_for_http \
  "Signed-out shell" \
  "${nest_url}/login?callbackUrl=%2Fprojects" \
  "200" \
  "${state_dir}/nest.log"

printf "%s\n" "${repo_root}" >"${state_dir}/repo-root"
printf "%s\n" "${current_revision}" >"${state_dir}/source-revision"
printf "%s\n" "git-head" >"${state_dir}/source-revision-kind"

echo
echo "Quipsly recovery lab is ready: ${nest_url}"
echo "It uses separate Nest, LiveKit, auth, media, processing workers, and disposable database state."
echo "Run: pnpm quipsly:recovery-lab:doctor"
echo "Stop and permanently delete the lab database: pnpm quipsly:recovery-lab:down"
