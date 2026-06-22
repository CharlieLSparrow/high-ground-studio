#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

discover_base_url() {
  if [[ -n "${QUIPSLY_AGENT_URL:-}" ]]; then
    printf '%s\n' "$QUIPSLY_AGENT_URL"
    return
  fi

  python3 - <<'PY'
import json
import urllib.request

for port in (8080, 8765, 8766):
    base = f"http://127.0.0.1:{port}"
    for path in ("/health", "/state"):
        try:
            with urllib.request.urlopen(base + path, timeout=0.35) as response:
                body = response.read().decode("utf-8", errors="replace")
            if path == "/state":
                json.loads(body)
            print(base)
            raise SystemExit(0)
        except Exception:
            continue

print("http://127.0.0.1:8080")
PY
}

BASE_URL="$(discover_base_url)"

usage() {
  cat <<'USAGE'
QuipslyStudio shorts control

Usage:
  script/shortsctl.sh health
  script/shortsctl.sh local-export-board [--json|--html|--md] [/absolute/output/folder] [basename]
  script/shortsctl.sh growth-quality-board [--json|--html|--md] [/absolute/output/folder] [basename]
  script/shortsctl.sh platform-package-board [--json|--html|--md] [/absolute/output/folder] [basename]
  script/shortsctl.sh improvement-plan [--json|--html|--md] [/absolute/output/folder] [basename]

This wrapper is intentionally small so shorts-quality tooling can be committed
and reused without depending on the broad agentctl command surface.
USAGE
}

get() {
  local path="$1"
  python3 - "$BASE_URL" "$path" <<'PY'
import sys
import urllib.request

base, path = sys.argv[1:3]
url = base + path
with urllib.request.urlopen(url, timeout=20) as response:
    sys.stdout.write(response.read().decode("utf-8", errors="replace"))
PY
}

run_board() {
  local script_name default_basename default_output_dir mode output_dir basename tmp_queue tmp_state
  script_name="${1:-}"
  default_basename="${2:-}"
  shift 2

  default_output_dir="$(cd "$ROOT_DIR/../.." && pwd)/docs/quipsly/current-state"
  mode="--md"
  output_dir="$default_output_dir"
  basename="$default_basename"

  while [[ $# -gt 0 ]]; do
    case "${1:-}" in
      --json|--html|--md)
        mode="${1:-}"
        ;;
      -h|--help)
        usage
        return 0
        ;;
      *)
        if [[ "$output_dir" == "$default_output_dir" ]]; then
          output_dir="${1:-}"
        elif [[ "$basename" == "$default_basename" ]]; then
          basename="${1:-}"
        else
          usage >&2
          return 2
        fi
        ;;
    esac
    shift
  done

  tmp_queue="$(mktemp "${TMPDIR:-/tmp}/quipslystudio-shortsctl-queue.XXXXXX")"
  tmp_state="$(mktemp "${TMPDIR:-/tmp}/quipslystudio-shortsctl-state.XXXXXX")"
  get "/shorts_queue" > "$tmp_queue"
  get "/state" > "$tmp_state"
  python3 "$ROOT_DIR/script/$script_name" "$tmp_queue" "$tmp_state" "$output_dir" "$basename" "$mode"
  local status=$?
  rm -f "$tmp_queue" "$tmp_state"
  if [[ "$status" == "0" && "$mode" == "--html" ]]; then
    /usr/bin/open "$output_dir/$basename.html" >/dev/null 2>&1 || true
  fi
  return "$status"
}

cmd="${1:-}"
case "$cmd" in
  health)
    get "/health"
    ;;
  local-export-board)
    shift
    run_board "shorts_local_export_board.py" "episode-1-shorts-local-export-board" "$@"
    ;;
  growth-quality-board)
    shift
    run_board "shorts_growth_quality_board.py" "episode-1-shorts-growth-quality-board" "$@"
    ;;
  platform-package-board)
    shift
    run_board "shorts_platform_package_board.py" "episode-1-shorts-platform-package-board" "$@"
    ;;
  improvement-plan)
    shift
    run_board "shorts_improvement_plan.py" "episode-1-shorts-improvement-plan" "$@"
    ;;
  -h|--help|help|"")
    usage
    ;;
  *)
    usage >&2
    exit 2
    ;;
esac
