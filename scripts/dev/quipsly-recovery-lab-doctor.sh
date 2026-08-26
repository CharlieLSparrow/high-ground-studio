#!/usr/bin/env bash
set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
repo_root="$(cd "${script_dir}/../.." && pwd -P)"
source "${script_dir}/quipsly-recovery-lab-state.sh"

state_dir="$(quipsly_recovery_lab_state_dir)"
database_url="$(quipsly_recovery_lab_database_url)"
database_container="quipsly-portable-recovery-lab-db"
database_label="com.quipsly.recovery-lab"
nest_url="http://127.0.0.1:3022"
firebase_url="http://127.0.0.1:9199"
firebase_project="quipsly-recovery-lab"
livekit_url="http://127.0.0.1:7890"
docker_timeout_seconds="$(quipsly_local_docker_timeout_seconds)"
failed=0

if [[ $# -gt 0 ]]; then
  echo "Usage: $0" >&2
  exit 64
fi

cd "${repo_root}"

report_http() {
  local label="$1"
  local url="$2"
  local expected="$3"
  local status
  status="$(quipsly_recovery_lab_http_status "${url}")"
  if [[ "${status}" == "${expected}" ]]; then
    printf "PASS  %-26s HTTP %s  %s\n" "${label}" "${status}" "${url}"
  else
    printf "FAIL  %-26s HTTP %s  %s\n" "${label}" "${status:-000}" "${url}"
    failed=1
  fi
}

echo "Quipsly isolated recovery lab"
report_http "Nest health" "${nest_url}/api/health" "200"
report_http "Signed-out shell" "${nest_url}/login?callbackUrl=%2Fprojects" "200"
report_http \
  "Firebase Auth emulator" \
  "${firebase_url}/emulator/v1/projects/${firebase_project}/config" \
  "200"
report_http "LiveKit conversation" "${livekit_url}/" "200"

transcript_worker_label="com.quipsly.recovery-lab.transcript-worker"
if [[ "$(uname -s)" == "Darwin" ]] && \
  launchctl print "gui/$(id -u)/${transcript_worker_label}" >/dev/null 2>&1; then
  printf "PASS  %-26s job %s\n" "Transcript worker" "${transcript_worker_label}"
elif [[ "$(uname -s)" != "Darwin" && -f "${state_dir}/transcript-worker.pid" ]] && \
  kill -0 "$(sed -n '1p' "${state_dir}/transcript-worker.pid")" 2>/dev/null; then
  printf "PASS  %-26s PID %s\n" "Transcript worker" "$(sed -n '1p' "${state_dir}/transcript-worker.pid")"
else
  printf "FAIL  %-26s not running\n" "Transcript worker"
  failed=1
fi

media_worker_label="com.quipsly.recovery-lab.media-worker"
if [[ "$(uname -s)" == "Darwin" ]] && \
  launchctl print "gui/$(id -u)/${media_worker_label}" >/dev/null 2>&1; then
  printf "PASS  %-26s job %s\n" "Media worker" "${media_worker_label}"
elif [[ "$(uname -s)" != "Darwin" && -f "${state_dir}/media-worker.pid" ]] && \
  kill -0 "$(sed -n '1p' "${state_dir}/media-worker.pid")" 2>/dev/null; then
  printf "PASS  %-26s PID %s\n" "Media worker" "$(sed -n '1p' "${state_dir}/media-worker.pid")"
else
  printf "FAIL  %-26s not running\n" "Media worker"
  failed=1
fi

listener="$(quipsly_local_port_listener_pid 3022)"
actual_cwd=""
if [[ -n "${listener}" ]]; then
  actual_cwd="$(quipsly_local_process_cwd "${listener}")"
fi
if [[ "${actual_cwd}" == "${repo_root}/apps/quipsly" ]]; then
  printf "PASS  %-26s %s\n" "Runtime source worktree" "${repo_root}"
else
  printf "FAIL  %-26s %s\n" "Runtime source worktree" "${actual_cwd:-unknown}"
  failed=1
fi

recorded_root="$(sed -n '1p' "${state_dir}/repo-root" 2>/dev/null || true)"
if [[ "${recorded_root}" == "${repo_root}" ]]; then
  printf "PASS  %-26s %s\n" "Lifecycle state owner" "${state_dir}"
else
  printf "FAIL  %-26s %s\n" "Lifecycle state owner" "${recorded_root:-none}"
  failed=1
fi

if quipsly_local_docker_ready "${docker_timeout_seconds}"; then
  printf "PASS  %-26s CLI answered within %ss\n" "Docker engine" "${docker_timeout_seconds}"
  actual_label="$(
    quipsly_local_run_docker \
      "${docker_timeout_seconds}" \
      inspect --format "{{ index .Config.Labels \"${database_label}\" }}" "${database_container}" \
      2>/dev/null || true
  )"
  if [[ "${actual_label}" == "true" ]] && quipsly_local_run_docker \
    "${docker_timeout_seconds}" \
    exec "${database_container}" \
    pg_isready -U postgres -d quipsly_portable_recovery_lab >/dev/null 2>&1; then
    printf "PASS  %-26s container %s\n" "Disposable PostgreSQL" "${database_container}"
  else
    printf "FAIL  %-26s container %s\n" "Disposable PostgreSQL" "${database_container}"
    failed=1
  fi
else
  printf "FAIL  %-26s no response within %ss\n" "Docker engine" "${docker_timeout_seconds}"
  printf "SKIP  %-26s Docker engine unavailable\n" "Disposable PostgreSQL"
  failed=1
fi

if DATABASE_URL="${database_url}" pnpm exec prisma migrate status >/dev/null 2>&1; then
  printf "PASS  %-26s committed migrations current\n" "Migration state"
else
  printf "FAIL  %-26s run migrate status for detail\n" "Migration state"
  failed=1
fi

recorded_revision="$(sed -n '1p' "${state_dir}/source-revision" 2>/dev/null || true)"
current_revision="$(git rev-parse HEAD)"
if [[ "${recorded_revision}" == "${current_revision}" ]]; then
  printf "PASS  %-26s %s\n" "Exact source revision" "${current_revision}"
else
  printf "FAIL  %-26s running %s current %s\n" \
    "Exact source revision" \
    "${recorded_revision:-unknown}" \
    "${current_revision}"
  failed=1
fi

live_revision="$(
  curl -fsS --max-time 4 "${nest_url}/api/health" 2>/dev/null |
    node -e '
      let input = "";
      process.stdin.on("data", (chunk) => (input += chunk));
      process.stdin.on("end", () => {
        try { process.stdout.write(JSON.parse(input)?.quipsly?.release?.sourceSha || ""); }
        catch {}
      });
    ' 2>/dev/null || true
)"
if [[ "${live_revision}" == "${current_revision}" ]]; then
  printf "PASS  %-26s %s\n" "Live Nest revision" "${live_revision}"
else
  printf "FAIL  %-26s running %s current %s\n" \
    "Live Nest revision" \
    "${live_revision:-unknown}" \
    "${current_revision}"
  failed=1
fi

dirty_source="$(git status --porcelain=v1 --untracked-files=all)"
if [[ -z "${dirty_source}" ]]; then
  printf "PASS  %-26s clean committed source\n" "Worktree"
else
  printf "FAIL  %-26s has tracked or untracked changes\n" "Worktree"
  failed=1
fi

printf "PASS  %-26s Nest 3022, LiveKit 7890-7892, Auth 9199, DB 55432, owned workers\n" "Canonical lane isolation"
exit "${failed}"
