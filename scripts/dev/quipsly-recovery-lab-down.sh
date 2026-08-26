#!/usr/bin/env bash
set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
repo_root="$(cd "${script_dir}/../.." && pwd -P)"
source "${script_dir}/quipsly-recovery-lab-state.sh"

state_dir="$(quipsly_recovery_lab_state_dir)"
database_container="quipsly-portable-recovery-lab-db"
database_label="com.quipsly.recovery-lab"
docker_timeout_seconds="$(quipsly_local_docker_timeout_seconds)"
docker_start_timeout_seconds="$(quipsly_local_docker_start_timeout_seconds)"
nest_label="com.quipsly.recovery-lab.nest"
firebase_label="com.quipsly.recovery-lab.firebase"
livekit_label="com.quipsly.recovery-lab.livekit"

if [[ $# -gt 0 ]]; then
  echo "Usage: $0" >&2
  exit 64
fi

if ! quipsly_local_docker_ready "${docker_timeout_seconds}"; then
  echo "Docker is not ready or its CLI did not answer within ${docker_timeout_seconds}s." >&2
  echo "No recovery-lab processes, state, or containers were changed." >&2
  exit 1
fi

descendants() {
  local parent="$1"
  local child
  while IFS= read -r child; do
    [[ -n "${child}" ]] || continue
    descendants "${child}"
    printf "%s\n" "${child}"
  done < <(pgrep -P "${parent}" 2>/dev/null || true)
}

stop_owned_process() {
  local name="$1"
  local pid_file="${state_dir}/${name}.pid"
  local cwd_file="${state_dir}/${name}.cwd"
  if [[ ! -f "${pid_file}" || ! -f "${cwd_file}" ]]; then
    printf "SKIP  %-24s no launcher-owned process\n" "${name}"
    return
  fi

  local pid expected_cwd actual_cwd child_pids
  pid="$(tr -d '[:space:]' <"${pid_file}")"
  expected_cwd="$(sed -n '1p' "${cwd_file}")"
  if [[ ! "${pid}" =~ ^[0-9]+$ ]] || ! kill -0 "${pid}" 2>/dev/null; then
    printf "STALE %-24s PID is not running\n" "${name}"
    rm -f "${pid_file}" "${cwd_file}"
    return
  fi
  actual_cwd="$(quipsly_local_process_cwd "${pid}")"
  if [[ "${actual_cwd}" != "${expected_cwd}" ]]; then
    echo "REFUSE ${name}: PID ${pid} cwd is '${actual_cwd:-unknown}', expected '${expected_cwd}'." >&2
    return 1
  fi

  child_pids="$(descendants "${pid}")"
  if [[ -n "${child_pids}" ]]; then
    while IFS= read -r child; do
      [[ -n "${child}" ]] && kill -TERM "${child}" 2>/dev/null || true
    done <<<"${child_pids}"
  fi
  kill -TERM "${pid}" 2>/dev/null || true
  rm -f "${pid_file}" "${cwd_file}"
  printf "STOP  %-24s PID %s\n" "${name}" "${pid}"
}

stop_macos_job() {
  local name="$1"
  local expected_label="$2"
  local label_file="${state_dir}/${name}.label"
  if [[ ! -f "${label_file}" ]]; then
    printf "SKIP  %-24s no launcher-owned job\n" "${name}"
    return
  fi
  actual_label="$(tr -d '[:space:]' <"${label_file}")"
  if [[ "${actual_label}" != "${expected_label}" ]]; then
    echo "REFUSE ${name}: state names '${actual_label}', expected '${expected_label}'." >&2
    return 1
  fi
  if launchctl print "gui/$(id -u)/${actual_label}" >/dev/null 2>&1; then
    launchctl remove "${actual_label}"
    printf "STOP  %-24s job %s\n" "${name}" "${actual_label}"
  else
    printf "STALE %-24s job is not running\n" "${name}"
  fi
  rm -f "${label_file}"
}

if [[ "$(uname -s)" == "Darwin" ]]; then
  stop_macos_job "nest" "${nest_label}"
  stop_macos_job "firebase" "${firebase_label}"
  stop_macos_job "livekit" "${livekit_label}"
else
  stop_owned_process "nest"
  stop_owned_process "firebase"
  stop_owned_process "livekit"
fi

if quipsly_local_run_docker \
  "${docker_timeout_seconds}" \
  inspect "${database_container}" >/dev/null 2>&1; then
  actual_database_label="$(
    quipsly_local_run_docker \
      "${docker_timeout_seconds}" \
      inspect --format "{{ index .Config.Labels \"${database_label}\" }}" "${database_container}"
  )"
  if [[ "${actual_database_label}" != "true" ]]; then
    echo "REFUSE database: ${database_container} lacks the exact recovery-lab ownership label." >&2
    exit 1
  fi
  quipsly_local_run_docker \
    "${docker_start_timeout_seconds}" \
    stop "${database_container}" >/dev/null
  printf "DELETE %-24s disposable container %s\n" "Recovery database" "${database_container}"
else
  printf "SKIP  %-24s container is not present\n" "Recovery database"
fi

rm -f \
  "${state_dir}/auth-secret" \
  "${state_dir}/repo-root" \
  "${state_dir}/source-revision"

retained_media_suffix="$(date -u +%Y%m%dT%H%M%SZ)-$$"
if [[ -d "${state_dir}/media" ]]; then
  mv "${state_dir}/media" "${state_dir}/media-retained-${retained_media_suffix}"
fi
if [[ -d "${state_dir}/media-workspace" ]]; then
  mv "${state_dir}/media-workspace" "${state_dir}/media-workspace-retained-${retained_media_suffix}"
fi
if [[ -d "${state_dir}/capture-vault" ]]; then
  mv "${state_dir}/capture-vault" "${state_dir}/capture-vault-retained-${retained_media_suffix}"
fi

echo
echo "The isolated recovery database and its synthetic accounts/work were permanently deleted."
echo "Any synthetic media bytes were retained under the recovery-lab state directory for inspection."
echo "The canonical Quipsly database and local lane were not stopped or changed."
