#!/usr/bin/env bash
set -euo pipefail

repo_root="$(git rev-parse --show-toplevel 2>/dev/null || true)"
if [[ -z "${repo_root}" ]]; then
  echo "Run this command from inside the High Ground Studio repository." >&2
  exit 1
fi
cd "${repo_root}"

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "${script_dir}/quipsly-local-state.sh"
state_dir="$(quipsly_local_state_dir)"

process_cwd() {
  quipsly_local_process_cwd "$1"
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

stop_owned_process() {
  local name="$1"
  local pid_file="${state_dir}/${name}.pid"
  local cwd_file="${state_dir}/${name}.cwd"

  if [[ ! -f "${pid_file}" || ! -f "${cwd_file}" ]]; then
    printf "SKIP  %-24s no launcher-owned process\n" "${name}"
    return
  fi

  local pid expected_cwd actual_cwd
  pid="$(tr -d '[:space:]' <"${pid_file}")"
  expected_cwd="$(sed -n '1p' "${cwd_file}")"

  if [[ ! "${pid}" =~ ^[0-9]+$ ]] || ! kill -0 "${pid}" 2>/dev/null; then
    printf "STALE %-24s PID %s is not running\n" "${name}" "${pid:-invalid}"
    rm -f "${pid_file}" "${cwd_file}"
    return
  fi

  actual_cwd="$(process_cwd "${pid}")"
  if [[ "${actual_cwd}" != "${expected_cwd}" ]]; then
    echo "REFUSE ${name}: PID ${pid} cwd is '${actual_cwd:-unknown}', expected '${expected_cwd}'." >&2
    echo "No process was stopped. Inspect the PID and remove stale state manually if appropriate." >&2
    return 1
  fi

  child_pids="$(descendants "${pid}")"
  if [[ -n "${child_pids}" ]]; then
    while IFS= read -r child; do
      [[ -n "${child}" ]] && kill -TERM "${child}" 2>/dev/null || true
    done <<<"${child_pids}"
  fi
  kill -TERM "${pid}" 2>/dev/null || true

  for _ in $(seq 1 30); do
    kill -0 "${pid}" 2>/dev/null || break
    sleep 0.2
  done

  if kill -0 "${pid}" 2>/dev/null; then
    echo "REFUSE ${name}: PID ${pid} did not exit after SIGTERM; leaving it running for manual inspection." >&2
    return 1
  fi

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

  local actual_label
  actual_label="$(tr -d '[:space:]' <"${label_file}")"
  if [[ "${actual_label}" != "${expected_label}" ]]; then
    echo "REFUSE ${name}: state names '${actual_label}', expected exact label '${expected_label}'." >&2
    return 1
  fi

  if launchctl print "gui/$(id -u)/${actual_label}" >/dev/null 2>&1; then
    launchctl remove "${actual_label}"
    printf "STOP  %-24s job %s\n" "${name}" "${actual_label}"
  else
    printf "STALE %-24s job %s is not running\n" "${name}" "${actual_label}"
  fi
  rm -f "${label_file}"
}

if [[ "$(uname -s)" == "Darwin" ]]; then
  stop_macos_job "nest" "com.quipsly.local.nest"
  stop_macos_job "transcript-worker" "com.quipsly.local.transcript-worker"
  stop_macos_job "media-worker" "com.quipsly.local.media-worker"
  stop_macos_job "firebase" "com.quipsly.local.firebase"
else
  stop_owned_process "nest"
  stop_owned_process "transcript-worker"
  stop_owned_process "media-worker"
  stop_owned_process "firebase"
fi

rm -f \
  "${state_dir}/repo-root" \
  "${state_dir}/source-revision" \
  "${state_dir}/transcript-worker.enabled"

echo
echo "PostgreSQL was intentionally left running to preserve local data."
echo "To stop it explicitly: docker compose --project-name high-ground-studio stop postgres"
