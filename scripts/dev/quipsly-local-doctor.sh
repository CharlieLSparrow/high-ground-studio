#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'EOF'
Usage: scripts/dev/quipsly-local-doctor.sh

Inspect the local Quipsly development lane:
  - Nest health and signed-out shell
  - Firebase Auth emulator
  - PostgreSQL container
  - retired authorization bypasses
  - current Git worktree scope

Environment overrides:
  TARGET_URL                         Nest base URL
  QUIPSLY_LOCAL_FIREBASE_AUTH_URL    Firebase Auth emulator URL
  QUIPSLY_LOCAL_DATABASE_CONTAINER   PostgreSQL container name
  QUIPSLY_LOCAL_DOCKER_TIMEOUT_SECONDS
                                     Docker CLI timeout (default: 8)

Options:
  -h, --help                         Show this help without probing services
EOF
}

if [[ $# -gt 0 ]]; then
  case "$1" in
    -h|--help)
      usage
      exit 0
      ;;
    *)
      printf "Unknown option: %s\n\n" "$1" >&2
      usage >&2
      exit 64
      ;;
  esac
fi

repo_root="$(git rev-parse --show-toplevel 2>/dev/null || true)"
if [[ -z "${repo_root}" ]]; then
  echo "Run this command from inside the High Ground Studio repository." >&2
  exit 1
fi
repo_root="$(cd "${repo_root}" && pwd -P)"
cd "${repo_root}"

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "${script_dir}/quipsly-local-state.sh"
state_dir="$(quipsly_local_state_dir)"
nest_url="${TARGET_URL:-http://127.0.0.1:3012}"
firebase_url="${QUIPSLY_LOCAL_FIREBASE_AUTH_URL:-http://127.0.0.1:9099}"
database_container="${QUIPSLY_LOCAL_DATABASE_CONTAINER:-high-ground-db}"
docker_timeout_seconds="$(quipsly_local_docker_timeout_seconds)"
failed=0

http_status() {
  local url="$1"
  curl -sS --max-time 4 -o /dev/null -w "%{http_code}" "${url}" 2>/dev/null || true
}

report_http() {
  local label="$1"
  local url="$2"
  local expected="$3"
  local status
  status="$(http_status "${url}")"
  if [[ "${status}" == "${expected}" ]]; then
    printf "PASS  %-24s HTTP %s  %s\n" "${label}" "${status}" "${url}"
  else
    printf "FAIL  %-24s HTTP %s  %s\n" "${label}" "${status:-000}" "${url}"
    failed=1
  fi
}

count_scope() {
  git status --porcelain=v1 --untracked-files=all -- "$@" | wc -l | tr -d ' '
}

status_output="$(git status --porcelain=v1 --untracked-files=all)"
tracked_changes="$(printf "%s\n" "${status_output}" | awk 'substr($0,1,2) != "??" && length($0) > 0 { count += 1 } END { print count + 0 }')"
untracked_changes="$(printf "%s\n" "${status_output}" | awk 'substr($0,1,2) == "??" { count += 1 } END { print count + 0 }')"

echo "Quipsly local services"
report_http "Nest health" "${nest_url%/}/api/health" "200"
report_http "Nest signed-out shell" "${nest_url%/}/login?callbackUrl=%2Fprojects" "200"

nest_listener="$(quipsly_local_port_listener_pid 3012)"
nest_cwd=""
if [[ -n "${nest_listener}" ]]; then
  nest_cwd="$(quipsly_local_process_cwd "${nest_listener}")"
fi
expected_nest_cwd="${repo_root}/apps/quipsly"
if [[ "${nest_cwd}" == "${expected_nest_cwd}" ]]; then
  printf "PASS  %-24s %s\n" "Runtime source worktree" "${repo_root}"
else
  printf "FAIL  %-24s running from %s\n" \
    "Runtime source worktree" \
    "${nest_cwd:-unknown}"
  failed=1
fi

recorded_repo_root=""
if [[ -f "${state_dir}/repo-root" ]]; then
  recorded_repo_root="$(sed -n '1p' "${state_dir}/repo-root")"
fi
if [[ "${recorded_repo_root}" == "${repo_root}" ]]; then
  printf "PASS  %-24s %s\n" "Lifecycle state owner" "${state_dir}"
else
  printf "FAIL  %-24s recorded %s\n" \
    "Lifecycle state owner" \
    "${recorded_repo_root:-none}"
  failed=1
fi

if curl -sS --max-time 4 \
  "${firebase_url%/}/emulator/v1/projects/quipsly-reef/config" \
  >/dev/null 2>&1; then
  printf "PASS  %-24s %s\n" "Firebase Auth emulator" "${firebase_url}"
else
  printf "FAIL  %-24s %s\n" "Firebase Auth emulator" "${firebase_url}"
  failed=1
fi

if quipsly_local_docker_ready "${docker_timeout_seconds}"; then
  printf "PASS  %-24s CLI answered within %ss\n" "Docker engine" "${docker_timeout_seconds}"
  if quipsly_local_run_docker \
    "${docker_timeout_seconds}" \
    exec "${database_container}" \
    pg_isready -U postgres -d high_ground_studio >/dev/null 2>&1; then
    printf "PASS  %-24s container %s\n" "PostgreSQL" "${database_container}"
  else
    printf "FAIL  %-24s container %s\n" "PostgreSQL" "${database_container}"
    failed=1
  fi
else
  printf "FAIL  %-24s no response within %ss\n" "Docker engine" "${docker_timeout_seconds}"
  printf "SKIP  %-24s Docker engine unavailable\n" "PostgreSQL"
  failed=1
fi

if rg -n "QUIPSLY_OWNER_OVERRIDE" apps/quipsly/src --glob '!**/*.test.*' >/dev/null 2>&1; then
  printf "FAIL  %-24s runtime reference remains\n" "Retired owner override"
  failed=1
else
  printf "PASS  %-24s no runtime authorization bypass\n" "Retired owner override"
fi

echo
echo "Git development lane"
printf "Branch: %s\n" "$(git branch --show-current)"
printf "HEAD:   %s\n" "$(git rev-parse --short HEAD)"
printf "Tracked changes:   %s\n" "${tracked_changes}"
printf "Untracked paths:   %s\n" "${untracked_changes}"
printf "Nest web paths:    %s\n" "$(count_scope apps/quipsly)"
printf "iPhone paths:      %s\n" "$(count_scope apps/mobile-capture)"
printf "Native Studio:     %s\n" "$(count_scope apps/QuipslyStudio)"
printf "HGO web paths:     %s\n" "$(count_scope apps/web)"
printf "Scripts:           %s\n" "$(count_scope scripts)"
printf "Docs:              %s\n" "$(count_scope docs)"

preservation_refs="$(git for-each-ref \
  --format='%(refname:short) -> %(objectname:short)' \
  'refs/heads/codex/preserved-*' | tail -5)"
if [[ -n "${preservation_refs}" ]]; then
  echo "Tracked-WIP preservation refs:"
  printf "%s\n" "${preservation_refs}"
else
  echo "Tracked-WIP preservation refs: none"
fi

if [[ "${tracked_changes}" != "0" || "${untracked_changes}" != "0" ]]; then
  echo
  echo "Keep commits narrow: stage explicit paths and inspect git diff --cached."
  echo "Do not use broad git add, reset, clean, or checkout commands in this worktree."
fi

exit "${failed}"
