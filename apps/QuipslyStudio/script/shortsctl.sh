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
  script/shortsctl.sh listen-review-board [--json|--html|--md] [/absolute/output/folder] [basename]
  script/shortsctl.sh listen-review-next [--md|--json|--open-evidence|--open-export|--open-contact-sheet|--cue|--preview]
  script/shortsctl.sh listen-review-proof [--md|--json]
  script/shortsctl.sh growth-quality-board [--json|--html|--md] [/absolute/output/folder] [basename]
  script/shortsctl.sh platform-package-board [--json|--html|--md] [/absolute/output/folder] [basename]
  script/shortsctl.sh improvement-plan [--json|--html|--md] [/absolute/output/folder] [basename]
  script/shortsctl.sh mission-control [--json|--html|--md] [/absolute/output/folder] [basename]
  script/shortsctl.sh episodes-readiness [--json|--html|--md] [/absolute/output/folder] [basename]

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
      --json|--html|--md|--next-json|--next-md)
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

run_listen_review_next() {
  local action tmp command label
  action="${1:---md}"
  tmp="$(mktemp "${TMPDIR:-/tmp}/quipslystudio-listen-review-next.XXXXXX")"

  case "$action" in
    --json|json)
      run_board "shorts_listen_review_board.py" "episodes-1-3-shorts-listen-review-board" --next-json
      rm -f "$tmp"
      return
      ;;
    --md|md|"")
      run_board "shorts_listen_review_board.py" "episodes-1-3-shorts-listen-review-board" --next-md
      rm -f "$tmp"
      return
      ;;
    --open-evidence|open-evidence)
      label="openEvidence"
      ;;
    --open-export|open-export)
      label="openExport"
      ;;
    --open-contact-sheet|open-contact-sheet)
      label="openContactSheet"
      ;;
    --cue|cue|--jump|jump)
      label="jumpToSource"
      ;;
    --preview|preview)
      label="previewInApp"
      ;;
    *)
      usage >&2
      rm -f "$tmp"
      return 2
      ;;
  esac

  run_board "shorts_listen_review_board.py" "episodes-1-3-shorts-listen-review-board" --next-json > "$tmp"
  command="$(python3 - "$tmp" "$label" <<'PY'
import json
import sys

path, label = sys.argv[1:3]
packet = json.load(open(path, encoding="utf-8"))
card = packet.get("nextReadyCard") or {}
commands = card.get("commands") or {}
print((commands.get(label) or "").strip())
PY
)"
  rm -f "$tmp"

  if [[ -z "$command" ]]; then
    printf 'No next listen-through command is available for %s.\n' "$label" >&2
    return 2
  fi

  case "$command" in
    open\ *|script/agentctl.sh\ load-session\ *|QUIPSLY_AGENT_TIMEOUT=60\ script/agentctl.sh\ load-session\ *) ;;
    *)
      printf 'Refusing unexpected next listen-through command:\n%s\n' "$command" >&2
      return 2
      ;;
  esac
  if [[ "$command" == *$'\n'* || "$command" == *';'* || "$command" == *'|'* || "$command" == *'`'* || "$command" == *'$('* ]]; then
    printf 'Refusing next listen-through command with unsupported shell syntax:\n%s\n' "$command" >&2
    return 2
  fi

  printf 'Running broad listen-through helper: %s\n' "$label"
  printf 'Command: %s\n' "$command"
  QUIPSLY_AGENT_TIMEOUT="${QUIPSLY_AGENT_TIMEOUT:-60}" bash -lc "$command"
  printf 'Done. This did not mark listen-through complete, approve, schedule, upload, or mutate source media.\n'
}

run_listen_review_proof() {
  local mode tmp_next tmp_state
  mode="${1:---md}"
  tmp_next="$(mktemp "${TMPDIR:-/tmp}/quipslystudio-listen-review-proof-next.XXXXXX")"
  tmp_state="$(mktemp "${TMPDIR:-/tmp}/quipslystudio-listen-review-proof-state.XXXXXX")"

  case "$mode" in
    --json|json|--md|md|"") ;;
    *)
      usage >&2
      rm -f "$tmp_next" "$tmp_state"
      return 2
      ;;
  esac

  run_board "shorts_listen_review_board.py" "episodes-1-3-shorts-listen-review-board" --next-json > "$tmp_next"
  get "/state" > "$tmp_state"

  python3 - "$tmp_next" "$tmp_state" "$mode" <<'PY'
import json
import sys

next_path, state_path, mode = sys.argv[1:4]
next_packet = json.load(open(next_path, encoding="utf-8"))
state = json.load(open(state_path, encoding="utf-8"))
card = next_packet.get("nextReadyCard") or {}
selected = state.get("selectedShortClip") if isinstance(state.get("selectedShortClip"), dict) else {}
selected_title = selected.get("title") or ""
selected_id = state.get("selectedShortClipId") or selected.get("id") or ""
next_id = card.get("id") or card.get("clipId") or ""
next_title = card.get("title") or ""
proof = {
    "packetType": "quipsly-shorts-listen-review-proof",
    "version": "2026-06-23.listen-review-proof.v1",
    "shortsWorkbenchReady": state.get("leftWorkbenchMode") == "shorts" and state.get("leftWorkbenchOpen") is True,
    "leftWorkbenchMode": state.get("leftWorkbenchMode"),
    "leftWorkbenchOpen": state.get("leftWorkbenchOpen"),
    "activeSessionName": state.get("activeSessionName"),
    "shortQueueCount": len(((state.get("shortClipQueue") or {}).get("clips") or [])),
    "selectedShortClipId": selected_id,
    "selectedShortTitle": selected_title,
    "nextReadyShortId": next_id,
    "nextReadyTitle": next_title,
    "nextReadyEpisode": card.get("episodeKey") or card.get("episodeLabel") or "",
    "nextReadyRange": card.get("sourceRangeLabel") or "",
    "nextReadyDurationSeconds": card.get("durationSeconds"),
    "selectedMatchesNextReady": bool(selected_id and next_id and selected_id == next_id),
    "counts": next_packet.get("counts") or {},
    "nextAction": (
        "If shortsWorkbenchReady is false, run `script/shortsctl.sh listen-review-next --cue`. "
        "If selectedMatchesNextReady is false, run `script/shortsctl.sh listen-review-next --cue`. "
        "Then listen/watch the export evidence and mark keep/refine/reject outside this proof command."
    ),
    "truth": (
        "This command only proves current app state plus the next ready listen-through target. "
        "It does not mark review complete, approve publication, export media, or mutate originals."
    ),
}

if mode in ("--json", "json"):
    print(json.dumps(proof, indent=2, sort_keys=True))
else:
    status = "READY" if proof["shortsWorkbenchReady"] else "NEEDS CUE"
    match = "matches" if proof["selectedMatchesNextReady"] else "does not match"
    print("# Shorts Listen-Through Proof")
    print()
    print(proof["truth"])
    print()
    print(f"- Workbench: `{proof['leftWorkbenchMode']}` open `{proof['leftWorkbenchOpen']}` -> **{status}**")
    print(f"- Session: `{proof['activeSessionName']}`")
    print(f"- Queue count: `{proof['shortQueueCount']}`")
    print(f"- Selected: `{proof['selectedShortTitle'] or 'none'}` `{proof['selectedShortClipId']}`")
    print(f"- Next ready: `{proof['nextReadyTitle'] or 'none'}` `{proof['nextReadyShortId']}`")
    print(f"- Next ready episode/range: `{proof['nextReadyEpisode']}` `{proof['nextReadyRange']}`")
    print(f"- Selected vs next: `{match}`")
    print()
    print("Counts:")
    for key, value in proof["counts"].items():
        print(f"- `{key}`: {value}")
    print()
    print("Next action:")
    print(proof["nextAction"])
PY
  local status=$?
  rm -f "$tmp_next" "$tmp_state"
  return "$status"
}

cmd="${1:-}"
case "$cmd" in
  health)
    get "/health"
    ;;
  local-export-board)
    shift
    run_board "shorts_local_export_board.py" "episodes-1-3-shorts-local-export-board" "$@"
    ;;
  listen-review-board)
    shift
    run_board "shorts_listen_review_board.py" "episodes-1-3-shorts-listen-review-board" "$@"
    ;;
  listen-review-next)
    shift
    run_listen_review_next "${1:---md}"
    ;;
  listen-review-proof)
    shift
    run_listen_review_proof "${1:---md}"
    ;;
  growth-quality-board)
    shift
    run_board "shorts_growth_quality_board.py" "episodes-1-3-shorts-growth-quality-board" "$@"
    ;;
  platform-package-board)
    shift
    run_board "shorts_platform_package_board.py" "episodes-1-3-shorts-platform-package-board" "$@"
    ;;
  improvement-plan)
    shift
    run_board "shorts_improvement_plan.py" "episodes-1-3-shorts-improvement-plan" "$@"
    ;;
  mission-control)
    shift
    run_board "shorts_mission_control.py" "episodes-1-3-shorts-mission-control" "$@"
    ;;
  episodes-readiness|readiness)
    shift
    python3 "$ROOT_DIR/script/episodes_shorts_readiness.py" "$@"
    ;;
  -h|--help|help|"")
    usage
    ;;
  *)
    usage >&2
    exit 2
    ;;
esac
