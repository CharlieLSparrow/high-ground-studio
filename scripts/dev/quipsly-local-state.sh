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
