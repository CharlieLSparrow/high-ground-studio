#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BASE_URL="${QUIPSLY_AGENT_URL:-http://127.0.0.1:8080}"
NO_BUILD=0
TOLERANCE="${QUIPSLY_DECISION_CENTERING_TOLERANCE_SECONDS:-0.05}"

usage() {
  cat <<'USAGE'
Smoke Episode 1 selected-decision navigation and timeline centering contract.

Usage:
  script/smoke_episode1_decision_navigation_centering.sh [--no-build]

This proves that Prev/Next visual decision navigation moves one shared playhead,
selects a lane-level SHOW/SKIP metadata decision, and exposes the selected
decision as the timeline auto-centering target. It must not alter source lanes or
decision counts.
USAGE
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --no-build)
      NO_BUILD=1
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

if [[ "$NO_BUILD" != "1" ]]; then
  "$ROOT_DIR/script/build_and_run.sh" --verify >/tmp/quipslystudio-decision-centering-build.log
else
  "$ROOT_DIR/script/agentctl.sh" health >/dev/null
fi

"$ROOT_DIR/script/agentctl.sh" load-session episode-1-premiere-rescue >/tmp/quipslystudio-decision-centering-load.json

python3 - "$BASE_URL" "$TOLERANCE" <<'PY'
import json
import sys
import time
import urllib.request

base_url = sys.argv[1].rstrip("/")
tolerance = float(sys.argv[2])
errors = []
proof = []


def get_json(path, timeout=5):
    with urllib.request.urlopen(f"{base_url}{path}", timeout=timeout) as response:
        return json.loads(response.read().decode("utf-8"))


def command(path):
    return get_json(path)


def state():
    return get_json("/state")


def summary(s):
    return {
        "activeSessionName": s.get("activeSessionName"),
        "productionReady": s.get("productionReady"),
        "selectedLaneName": s.get("selectedLaneName"),
        "selectedTagId": s.get("selectedTagId"),
        "selectedTagType": s.get("selectedTagType"),
        "selectedVisualDecisionIndex": s.get("selectedVisualDecisionIndex"),
        "selectedVisualDecisionSequenceTime": s.get("selectedVisualDecisionSequenceTime"),
        "timelineAutoCenterOnSelection": s.get("timelineAutoCenterOnSelection"),
        "timelineSelectedDecisionCenterTargetSeconds": s.get("timelineSelectedDecisionCenterTargetSeconds"),
        "timelinePixelsPerSecond": s.get("timelinePixelsPerSecond"),
        "playhead": s.get("playhead"),
        "laneCount": s.get("laneCount"),
        "showDecisionCount": s.get("showDecisionCount"),
        "skipDecisionCount": s.get("skipDecisionCount"),
        "lastMediaAction": s.get("lastMediaAction"),
    }


def wait_for(label, predicate, timeout=10, interval=0.15):
    deadline = time.time() + timeout
    last = None
    while time.time() < deadline:
        last = state()
        if predicate(last):
            return last
        time.sleep(interval)
    errors.append(f"{label}: timed out. Last state: {summary(last or {})}")
    return last or {}


def close(a, b):
    return abs(float(a or 0) - float(b or 0)) <= tolerance


def stable_counts(s, baseline):
    for key in ["laneCount", "showDecisionCount", "skipDecisionCount", "sourceMonitorVideoCount", "sourcePlayerCount"]:
        if s.get(key) != baseline.get(key):
            return False
    return True


def selected_center_contract(s):
    selected_time = float(s.get("selectedVisualDecisionSequenceTime") or 0)
    center_time = float(s.get("timelineSelectedDecisionCenterTargetSeconds") or 0)
    return (
        s.get("selectedTagId")
        and s.get("timelineAutoCenterOnSelection") is True
        and s.get("timelineSelectedDecisionCenteringModel") == "scroll_view_reader_selected_decision_target"
        and close(s.get("playhead"), selected_time)
        and close(center_time, selected_time)
    )


loaded = wait_for(
    "load Episode 1",
    lambda s: s.get("activeSessionName") == "episode-1-premiere-rescue"
    and s.get("productionReady") is True
    and int(s.get("sourcePlayerCount") or 0) >= 3,
)

command("/timeline_zoom?mode=frame")
command("/select_decision?mode=first&scope=video")
first = wait_for(
    "select first video decision",
    lambda s: selected_center_contract(s)
    and float(s.get("timelinePixelsPerSecond") or 0) >= 239
    and int(s.get("selectedVisualDecisionIndex") or -1) >= 0,
)
proof.append({"step": "first", **summary(first)})

command("/select_decision?mode=next&scope=video")
next_decision = wait_for(
    "select next video decision",
    lambda s: selected_center_contract(s)
    and s.get("selectedTagId") != first.get("selectedTagId")
    and int(s.get("selectedVisualDecisionIndex") or -1) > int(first.get("selectedVisualDecisionIndex") or -1)
    and stable_counts(s, first),
)
proof.append({"step": "next", **summary(next_decision)})

command("/select_decision?mode=previous&scope=video")
previous = wait_for(
    "return to first video decision",
    lambda s: selected_center_contract(s)
    and s.get("selectedTagId") == first.get("selectedTagId")
    and int(s.get("selectedVisualDecisionIndex") or -1) == int(first.get("selectedVisualDecisionIndex") or -1)
    and stable_counts(s, first),
)
proof.append({"step": "previous", **summary(previous)})

result = {
    "status": "failed" if errors else "passed",
    "proof": proof,
    "errors": errors,
}

print(json.dumps(result, indent=2))
if errors:
    raise SystemExit(1)
PY
