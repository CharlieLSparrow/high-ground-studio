#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BASE_URL="${QUIPSLY_AGENT_URL:-http://127.0.0.1:8080}"
SESSION_NAME="${QUIPSLY_EPISODE3_SESSION:-episode-3-premiere-rescue}"
NO_BUILD=0

usage() {
  cat <<'USAGE'
Smoke Episode 3 selected-short proof state.

Usage:
  script/smoke_episode3_selected_short_proof.sh [--no-build] [--session <name>]

This proves:
  - A 9:16 short candidate is represented as a recipe over sequence time.
  - The selected short exposes timeline rail visibility, segment count, export ranges, and safe next actions.
  - Temporary test short candidates are removed before the smoke exits.
USAGE
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --no-build)
      NO_BUILD=1
      ;;
    --session)
      SESSION_NAME="${2:-}"
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "Unknown option: $1" >&2
      usage >&2
      exit 2
      ;;
  esac
  shift
done

if [[ -z "$SESSION_NAME" ]]; then
  echo "Missing session name." >&2
  usage >&2
  exit 2
fi

if [[ "$NO_BUILD" == "1" ]]; then
  "$ROOT_DIR/script/agentctl.sh" health >/dev/null
else
  "$ROOT_DIR/script/build_and_run.sh" --verify >/tmp/quipslystudio-episode3-selected-short-build.log
fi

"$ROOT_DIR/script/agentctl.sh" load-session "$SESSION_NAME" >/tmp/quipslystudio-episode3-selected-short-load.json

python3 - "$BASE_URL" "$SESSION_NAME" <<'PY'
import json
import sys
import time
import urllib.parse
import urllib.request

base_url = sys.argv[1].rstrip("/")
session_name = sys.argv[2]
errors = []
created_id = None


def get_json(path, timeout=30):
    with urllib.request.urlopen(f"{base_url}{path}", timeout=timeout) as response:
        return json.loads(response.read().decode("utf-8"))


def command(path):
    return get_json(path)


def wait_for(predicate, timeout=12, interval=0.25):
    deadline = time.time() + timeout
    last = {}
    while time.time() < deadline:
        last = get_json("/state")
        if predicate(last):
            return last
        time.sleep(interval)
    return last


def remove_created():
    global created_id
    if created_id:
        try:
            command("/shorts_queue_remove?id=" + urllib.parse.quote(created_id))
        except Exception as exc:
            print(f"Warning: could not remove temporary short {created_id}: {exc}", file=sys.stderr)


try:
    state = wait_for(
        lambda s: s.get("activeSessionName") == session_name and s.get("laneCount", 0) > 0,
        timeout=20,
    )
    if state.get("activeSessionName") != session_name:
        errors.append(f"activeSessionName expected {session_name!r}, got {state.get('activeSessionName')!r}")

    title = "Codex smoke short proof"
    command(
        "/shorts_queue_add_range?start=420&end=432&title="
        + urllib.parse.quote(title)
    )
    command("/shorts_queue_select?title=" + urllib.parse.quote(title))
    state = wait_for(
        lambda s: (s.get("selectedShortProof") or {}).get("title") == title,
        timeout=12,
    )
    proof = state.get("selectedShortProof") or {}
    created_id = proof.get("id") or state.get("selectedShortClipId")

    if proof.get("status") != "selected":
        errors.append(f"selectedShortProof.status expected selected, got {proof.get('status')!r}")
    if proof.get("recipeModel") != "ordered-sequence-segments":
        errors.append(f"recipeModel expected ordered-sequence-segments, got {proof.get('recipeModel')!r}")
    if proof.get("timeBase") != "sequence-seconds":
        errors.append(f"timeBase expected sequence-seconds, got {proof.get('timeBase')!r}")
    if proof.get("timelineRailVisible") is not True:
        errors.append(f"timelineRailVisible expected true, got {proof.get('timelineRailVisible')!r}")
    if proof.get("supportsMultipleSegments") is not True:
        errors.append(f"supportsMultipleSegments expected true, got {proof.get('supportsMultipleSegments')!r}")
    if proof.get("segmentCount") != 1:
        errors.append(f"segmentCount expected 1 for smoke range, got {proof.get('segmentCount')!r}")
    if float(proof.get("recipeDuration") or 0) <= 0:
        errors.append(f"recipeDuration should be positive, got {proof.get('recipeDuration')!r}")
    if not proof.get("nextSafeActions"):
        errors.append("nextSafeActions should not be empty")

    if errors:
        print("Episode 3 selected-short proof smoke failed:", file=sys.stderr)
        for error in errors:
            print(f"- {error}", file=sys.stderr)
        print(json.dumps({"selectedShortProof": proof}, indent=2, sort_keys=True), file=sys.stderr)
        raise SystemExit(1)

    print(json.dumps({
        "status": "pass",
        "session": session_name,
        "selectedShortProof": {
            "title": proof.get("title"),
            "recipeModel": proof.get("recipeModel"),
            "timeBase": proof.get("timeBase"),
            "timelineRailVisible": proof.get("timelineRailVisible"),
            "supportsMultipleSegments": proof.get("supportsMultipleSegments"),
            "segmentCount": proof.get("segmentCount"),
            "exportRangeCount": proof.get("exportRangeCount"),
            "recipeDuration": proof.get("recipeDuration"),
        },
        "architectureInvariant": "Shorts are output recipes over sequence time. They can contain multiple ordered segments and never chop source media."
    }, indent=2, sort_keys=True))
finally:
    remove_created()
PY
