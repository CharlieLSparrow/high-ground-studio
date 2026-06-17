#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BASE_URL="${QUIPSLY_AGENT_URL:-http://127.0.0.1:8080}"
NO_BUILD=0
TOLERANCE="${QUIPSLY_SELECTED_DECISION_TOLERANCE_SECONDS:-0.025}"

usage() {
  cat <<'USAGE'
Smoke Episode 1 selected decision precision editing.

Usage:
  script/smoke_episode1_selected_decision_precision.sh [--no-build]

This proves that selected SHOW/SKIP micro-edits are metadata-only operations:
nudge, trim start, trim end, and restore. Whole source lane counts and decision
counts must stay stable.
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
  "$ROOT_DIR/script/build_and_run.sh" --verify >/tmp/quipslystudio-selected-decision-build.log
else
  "$ROOT_DIR/script/agentctl.sh" health >/dev/null
fi

"$ROOT_DIR/script/agentctl.sh" load-session episode-1-premiere-rescue >/tmp/quipslystudio-selected-decision-load.json

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


def summary(s):
    return {
        "activeSessionName": s.get("activeSessionName"),
        "productionReady": s.get("productionReady"),
        "selectedLaneName": s.get("selectedLaneName"),
        "selectedTagId": s.get("selectedTagId"),
        "selectedTagStart": s.get("selectedTagStart"),
        "selectedTagDuration": s.get("selectedTagDuration"),
        "showDecisionCount": s.get("showDecisionCount"),
        "skipDecisionCount": s.get("skipDecisionCount"),
        "laneCount": s.get("laneCount"),
        "lastMediaAction": s.get("lastMediaAction"),
    }


def close(actual, expected):
    return abs(float(actual or 0) - expected) <= tolerance


def selected_numbers(s):
    return float(s.get("selectedTagStart") or 0), float(s.get("selectedTagDuration") or 0)


def stable_counts(s, baseline):
    keys = ["laneCount", "showDecisionCount", "skipDecisionCount", "sourceMonitorVideoCount", "sourcePlayerCount"]
    return all(s.get(key) == baseline.get(key) for key in keys)


loaded = wait_for(
    "load Episode 1",
    lambda s: s.get("activeSessionName") == "episode-1-premiere-rescue"
    and s.get("productionReady") is True
    and int(s.get("sourcePlayerCount") or 0) >= 3,
)

command("/timeline_zoom?mode=frame")
command("/select_decision?mode=first&scope=video")
baseline = wait_for(
    "select first video decision",
    lambda s: s.get("selectedTagId") and s.get("selectedTagType") in ["Active", "Cut"] and float(s.get("timelinePixelsPerSecond") or 0) >= 239,
)

base_start, base_duration = selected_numbers(baseline)
if base_duration <= 0.5:
    errors.append(f"Selected baseline duration too small for precision smoke: {base_duration}")

command("/nudge_selected?delta=0.1")
nudged = wait_for(
    "nudge selected decision",
    lambda s: s.get("selectedTagId") == baseline.get("selectedTagId")
    and close(s.get("selectedTagStart"), base_start + 0.1)
    and close(s.get("selectedTagDuration"), base_duration)
    and stable_counts(s, baseline),
)
proof.append({"step": "nudge +0.1", **summary(nudged)})

command("/trim_selected?start_delta=0.1&duration_delta=-0.1")
trimmed_start = wait_for(
    "trim selected start later",
    lambda s: s.get("selectedTagId") == baseline.get("selectedTagId")
    and close(s.get("selectedTagStart"), base_start + 0.2)
    and close(s.get("selectedTagDuration"), base_duration - 0.1)
    and stable_counts(s, baseline),
)
proof.append({"step": "start +0.1 end locked", **summary(trimmed_start)})

command("/trim_selected?start_delta=0&duration_delta=0.1")
trimmed_end = wait_for(
    "trim selected end later",
    lambda s: s.get("selectedTagId") == baseline.get("selectedTagId")
    and close(s.get("selectedTagStart"), base_start + 0.2)
    and close(s.get("selectedTagDuration"), base_duration)
    and stable_counts(s, baseline),
)
proof.append({"step": "end +0.1", **summary(trimmed_end)})

command("/nudge_selected?delta=-0.2")
restored = wait_for(
    "restore selected decision",
    lambda s: s.get("selectedTagId") == baseline.get("selectedTagId")
    and close(s.get("selectedTagStart"), base_start)
    and close(s.get("selectedTagDuration"), base_duration)
    and stable_counts(s, baseline),
)
proof.append({"step": "restore", **summary(restored)})

result = {
    "status": "failed" if errors else "passed",
    "baseline": summary(baseline),
    "proof": proof,
    "errors": errors,
}

print(json.dumps(result, indent=2))
if errors:
    raise SystemExit(1)
PY
