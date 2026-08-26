#!/usr/bin/env bash

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "${script_dir}/quipsly-local-state.sh"

quipsly_recovery_lab_state_dir() {
  printf "%s/recovery-lab\n" "$(quipsly_local_state_dir)"
}

quipsly_recovery_lab_database_url() {
  printf "%s\n" \
    "postgresql://postgres:quipsly_recovery_lab@127.0.0.1:55432/quipsly_portable_recovery_lab?schema=public"
}

quipsly_recovery_lab_media_state_dir() {
  local temporary_root="${TMPDIR:-/tmp}"
  printf "%s/quipsly/recovery-lab-media\n" "${temporary_root%/}"
}

quipsly_recovery_lab_http_status() {
  curl -sS --max-time 4 -o /dev/null -w "%{http_code}" "$1" 2>/dev/null || true
}
