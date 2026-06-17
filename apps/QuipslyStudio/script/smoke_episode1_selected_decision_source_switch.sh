#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BASE_URL="${QUIPSLY_AGENT_URL:-http://127.0.0.1:8080}"
NO_BUILD=0

usage() {
  cat <<'USAGE'
Smoke Episode 1 selected-decision source switching.

Usage:
  script/smoke_episode1_selected_decision_source_switch.sh [--no-build]

This proves a real editor workflow:
  - Select an existing visual SHOW/SKIP decision.
  - Switch that selected span to Homer.
  - Verify Program Output state follows Homer at that playhead.
  - Switch it back to Charlie.
  - Verify Program Output state follows Charlie.

The operation must preserve whole source lanes, source monitor count, and proxy
readiness. It changes metadata decisions only.
USAGE
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --no-build) NO_BUILD=1 ;;
    -h|--help) usage; exit 0 ;;
    *) echo "Unknown option: $1" >&2; usage >&2; exit 2 ;;
  esac
  shift
done

if [[ "$NO_BUILD" != "1" ]]; then
  "$ROOT_DIR/script/build_and_run.sh" --verify >/tmp/quipslystudio-source-switch-build.log
else
  "$ROOT_DIR/script/agentctl.sh" health >/dev/null
fi

"$ROOT_DIR/script/agentctl.sh" load-session episode-1-premiere-rescue >/tmp/quipslystudio-source-switch-load.json

python3 - "$BASE_URL" <<'PY'
import json
import sys
import time
import urllib.request

base_url = sys.argv[1].rstrip("/")
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
        "playhead": s.get("playhead"),
        "currentProgramTitle": s.get("currentProgramTitle"),
        "selectedLaneName": s.get("selectedLaneName"),
        "selectedTagType": s.get("selectedTagType"),
        "selectedVisualDecisionSequenceTime": s.get("selectedVisualDecisionSequenceTime"),
        "sourceMonitorVideoCount": s.get("sourceMonitorVideoCount"),
        "sourcePlayerCount": s.get("sourcePlayerCount"),
        "videoProxyReadyCount": s.get("videoProxyReadyCount"),
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

def stable_lane_truth(s, baseline):
    for key in ["laneCount", "sourceMonitorVideoCount", "sourcePlayerCount", "videoProxyReadyCount", "rawVaultCount"]:
        if s.get(key) != baseline.get(key):
            return False
    return True

def title_contains_only(s, include, exclude):
    title = str(s.get("currentProgramTitle") or "")
    return include in title and exclude not in title

loaded = wait_for(
    "load Episode 1",
    lambda s: s.get("activeSessionName") == "episode-1-premiere-rescue"
    and s.get("productionReady") is True
    and int(s.get("sourcePlayerCount") or 0) >= 3,
)

command("/timeline_zoom?mode=frame")
command("/select_decision?mode=next&scope=video")
selected = wait_for(
    "select a visual decision",
    lambda s: s.get("selectedTagId")
    and s.get("selectedTagType") in ["Active", "Cut"]
    and float(s.get("timelinePixelsPerSecond") or 0) >= 239,
)
proof.append({"step": "selected", **summary(selected)})

command("/switch_selected_decision?action=homer")
homer = wait_for(
    "switch selected span to Homer",
    lambda s: stable_lane_truth(s, selected)
    and title_contains_only(s, "Homer", "Charlie")
    and s.get("selectedTagType") == "Active",
)
proof.append({"step": "homer", **summary(homer)})

command("/switch_selected_decision?action=charlie")
charlie = wait_for(
    "switch selected span back to Charlie",
    lambda s: stable_lane_truth(s, selected)
    and title_contains_only(s, "Charlie", "Homer")
    and s.get("selectedTagType") == "Active",
)
proof.append({"step": "charlie", **summary(charlie)})

result = {"status": "failed" if errors else "passed", "proof": proof, "errors": errors}
print(json.dumps(result, indent=2))
if errors:
    raise SystemExit(1)
PY
