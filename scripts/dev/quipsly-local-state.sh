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

# Fingerprint the exact tracked, modified, and untracked source closure used by
# a long-running local service. A healthy port and the right cwd do not prove
# that a process has reloaded the current Prisma client or application source.
quipsly_local_git_source_revision() {
  local repo_root="$1"
  shift

  (
    cd "${repo_root}"
    {
      # Hash the working-tree source closure itself, not the repository's
      # global HEAD. Otherwise an unrelated docs-only commit restarts every
      # durable local service even though none of its executable inputs moved.
      while IFS= read -r -d '' tracked_file; do
        printf 'tracked\0%s\0' "${tracked_file}"
        if [[ -e "${tracked_file}" || -L "${tracked_file}" ]]; then
          if [[ -x "${tracked_file}" ]]; then
            printf 'executable\0'
          else
            printf 'non-executable\0'
          fi
          git hash-object -- "${tracked_file}"
        else
          printf 'missing\0'
        fi
      done < <(git ls-files -z -- "$@")

      while IFS= read -r -d '' untracked_file; do
        printf 'untracked\0%s\0' "${untracked_file}"
        if [[ -x "${untracked_file}" ]]; then
          printf 'executable\0'
        else
          printf 'non-executable\0'
        fi
        git hash-object -- "${untracked_file}"
      done < <(git ls-files -z --others --exclude-standard -- "$@")
    } | git hash-object --stdin
  )
}

# Bind a service's non-secret runtime inputs to its source fingerprint. Values
# are streamed into Git's hash function and are never written to the object
# database or lifecycle state. Callers must pass only stable name=value pairs
# and must not pass resolved secret values.
quipsly_local_runtime_revision() {
  local repo_root="$1"
  shift

  {
    printf 'quipsly-local-runtime-v1\0'
    while [[ "$#" -gt 0 ]]; do
      printf '%s\0' "$1"
      shift
    done
  } | git -C "${repo_root}" hash-object --stdin
}

quipsly_local_nest_source_revision() {
  local repo_root="$1"
  local local_env_file="${2:-}"
  local source_revision
  local nest_source_paths=(
    apps/quipsly
    packages/content-studio-domain
    packages/quipsly-capture-verification
    packages/quipsly-document-kernel
    packages/quipsly-domain
    packages/quipsly-media-processing
    packages/studio-domain
    prisma/schema.prisma
    prisma/migrations
    package.json
    pnpm-lock.yaml
    pnpm-workspace.yaml
    prisma.config.ts
    scripts/dev/quipsly-local-up.sh
    scripts/dev/quipsly-local-nest-launcher.mjs
    scripts/dev/quipsly-local-state.sh
  )

  source_revision="$(
    quipsly_local_git_source_revision "${repo_root}" "${nest_source_paths[@]}"
  )"

  # launchd reads the environment file only when the job starts. Bind its
  # content and resolved path into the runtime fingerprint without recording
  # any secret values in lifecycle state or logs.
  if [[ -n "${local_env_file}" ]]; then
    {
      printf '%s\n' "${source_revision}"
      printf '%s\n' "${local_env_file}"
      if [[ -r "${local_env_file}" ]]; then
        git -C "${repo_root}" hash-object "${local_env_file}"
      else
        printf '%s\n' "unreadable"
      fi
    } | git -C "${repo_root}" hash-object --stdin
    return
  fi

  printf '%s\n' "${source_revision}"
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

quipsly_local_minimum_free_kib() {
  local minimum_free_gib="${QUIPSLY_LOCAL_MIN_FREE_GIB:-12}"
  if ! [[ "${minimum_free_gib}" =~ ^[0-9]+$ ]] \
    || [[ "${minimum_free_gib}" -lt 1 ]] \
    || [[ "${minimum_free_gib}" -gt 1024 ]]; then
    echo "QUIPSLY_LOCAL_MIN_FREE_GIB must be an integer from 1 through 1024." >&2
    return 64
  fi
  printf '%s\n' "$((minimum_free_gib * 1024 * 1024))"
}

quipsly_local_available_kib() {
  local target_path="$1"
  local available_kib
  available_kib="$(LC_ALL=C df -Pk "${target_path}" | awk 'NR == 2 { print $4; exit }')" || return
  if ! [[ "${available_kib}" =~ ^[0-9]+$ ]]; then
    echo "Could not determine available disk space for ${target_path}." >&2
    return 1
  fi
  printf '%s\n' "${available_kib}"
}

quipsly_local_format_kib_as_gib() {
  awk -v kib="$1" 'BEGIN { printf "%.1f", kib / 1024 / 1024 }'
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
