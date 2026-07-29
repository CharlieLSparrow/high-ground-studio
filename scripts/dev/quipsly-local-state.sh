#!/usr/bin/env bash

# Shared lifecycle state for machine-wide Quipsly development services.
#
# The macOS launchd labels and TCP ports are user-global, so their ownership
# metadata must not live inside one Git worktree. Callers may still isolate a
# test run with QUIPSLY_LOCAL_STATE_DIR.

quipsly_local_state_dir() {
  if [[ -n "${QUIPSLY_LOCAL_STATE_DIR:-}" ]]; then
    printf "%s\n" "${QUIPSLY_LOCAL_STATE_DIR}"
    return
  fi

  if [[ "$(uname -s)" == "Darwin" ]]; then
    local cache_root
    cache_root="$(getconf DARWIN_USER_CACHE_DIR 2>/dev/null || true)"
    if [[ -n "${cache_root}" ]]; then
      printf "%s/quipsly/local\n" "${cache_root%/}"
      return
    fi
  fi

  local runtime_root="${XDG_RUNTIME_DIR:-/tmp}"
  printf "%s/quipsly-local-%s\n" "${runtime_root%/}" "$(id -u)"
}

quipsly_local_port_listener_pid() {
  local port="$1"
  lsof -nP -iTCP:"${port}" -sTCP:LISTEN -t 2>/dev/null | head -1 || true
}

quipsly_local_process_cwd() {
  local pid="$1"
  lsof -a -p "${pid}" -d cwd -Fn 2>/dev/null |
    sed -n 's/^n//p' |
    head -1
}

quipsly_local_positive_integer() {
  local value="$1"
  local label="$2"

  if [[ ! "${value}" =~ ^[1-9][0-9]*$ ]]; then
    printf "%s must be a positive integer, received '%s'.\n" "${label}" "${value}" >&2
    return 64
  fi

  printf "%s\n" "${value}"
}

# macOS does not ship GNU timeout. Keep external control-plane probes bounded
# so a wedged Docker Desktop CLI cannot hold the local lifecycle indefinitely.
# This only terminates the child command started here; it never kills or
# restarts Docker Desktop itself.
quipsly_local_run_bounded() {
  local timeout_seconds
  timeout_seconds="$(
    quipsly_local_positive_integer \
      "${1:-}" \
      "Command timeout"
  )" || return
  shift

  if [[ "$#" -eq 0 ]]; then
    echo "Bounded command requires an executable." >&2
    return 64
  fi

  "$@" &
  local command_pid="$!"
  local elapsed_ticks=0
  local timeout_ticks="$((timeout_seconds * 10))"
  local exit_status=0

  while kill -0 "${command_pid}" 2>/dev/null; do
    if [[ "${elapsed_ticks}" -ge "${timeout_ticks}" ]]; then
      kill -TERM "${command_pid}" 2>/dev/null || true
      for _ in $(seq 1 10); do
        if ! kill -0 "${command_pid}" 2>/dev/null; then
          break
        fi
        sleep 0.1
      done
      if kill -0 "${command_pid}" 2>/dev/null; then
        kill -KILL "${command_pid}" 2>/dev/null || true
      fi
      wait "${command_pid}" 2>/dev/null || true
      return 124
    fi
    sleep 0.1
    elapsed_ticks="$((elapsed_ticks + 1))"
  done

  wait "${command_pid}" || exit_status="$?"
  return "${exit_status}"
}

quipsly_local_docker_timeout_seconds() {
  quipsly_local_positive_integer \
    "${QUIPSLY_LOCAL_DOCKER_TIMEOUT_SECONDS:-8}" \
    "QUIPSLY_LOCAL_DOCKER_TIMEOUT_SECONDS"
}

quipsly_local_docker_start_timeout_seconds() {
  quipsly_local_positive_integer \
    "${QUIPSLY_LOCAL_DOCKER_START_TIMEOUT_SECONDS:-120}" \
    "QUIPSLY_LOCAL_DOCKER_START_TIMEOUT_SECONDS"
}

quipsly_local_run_docker() {
  local timeout_seconds="${1:-}"
  shift
  quipsly_local_run_bounded "${timeout_seconds}" docker "$@"
}

quipsly_local_docker_ready() {
  local timeout_seconds="${1:-}"
  if [[ -z "${timeout_seconds}" ]]; then
    timeout_seconds="$(quipsly_local_docker_timeout_seconds)" || return
  fi
  quipsly_local_run_docker "${timeout_seconds}" info >/dev/null 2>&1
}
