#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BASE_URL="${QUIPSLY_AGENT_URL:-http://127.0.0.1:8080}"
SMOKE_DIR="${TMPDIR:-/tmp}/quipslystudio-episode1-transport-smoke"
EDIT_STATE="$SMOKE_DIR/edit.json"
THROUGH_STATE="$SMOKE_DIR/through.json"
RESTORED_STATE="$SMOKE_DIR/restored-edit.json"

usage() {
  cat <<'USAGE'
Smoke Episode 1 explicit transports.

Usage:
  script/smoke_episode1_transports.sh

What this proves:
  - Play Edit uses the condensed decision program and skips inactive gaps.
  - Play Through uses one full synced source timeline range.
  - Switching transports does not change lanes, proxies, or decision metadata.
  - The editor is restored to Play Edit afterward.
USAGE
}

get() {
  curl --fail --silent --show-error "$BASE_URL$1"
  printf '\n'
}

if [[ "${1:-}" == "-h" || "${1:-}" == "--help" ]]; then
  usage
  exit 0
fi

mkdir -p "$SMOKE_DIR"

get "/health" >/dev/null
"$ROOT_DIR/script/smoke_episode1_production_ready.sh" --no-build >/dev/null
get "/state" > "$EDIT_STATE"

get "/playback?mode=through&action=set" >/dev/null
sleep 0.3
get "/state" > "$THROUGH_STATE"

get "/playback?mode=edit&action=set" >/dev/null
sleep 0.3
get "/state" > "$RESTORED_STATE"

python3 - "$EDIT_STATE" "$THROUGH_STATE" "$RESTORED_STATE" <<'PY'
import json
import sys
from pathlib import Path

edit = json.loads(Path(sys.argv[1]).read_text())
through = json.loads(Path(sys.argv[2]).read_text())
restored = json.loads(Path(sys.argv[3]).read_text())
errors = []

stable_keys = [
    "laneCount",
    "sourceMonitorVideoCount",
    "videoProxyReadyCount",
    "videoBlockedCount",
    "audioReadyCount",
    "showDecisionCount",
    "skipDecisionCount",
    "rawVaultCount",
]

def check(label, actual, expected):
    if actual != expected:
        errors.append(f"{label}: expected {expected!r}, got {actual!r}")

check("initial playbackMode", edit.get("playbackMode"), "Play Edit")
if not isinstance(edit.get("validRangeCount"), int) or edit["validRangeCount"] <= 1:
    errors.append(f"Play Edit validRangeCount should show skipped-gap segments, got {edit.get('validRangeCount')!r}")

check("through playbackMode", through.get("playbackMode"), "Play Through")
check("through validRangeCount", through.get("validRangeCount"), 1)

check("restored playbackMode", restored.get("playbackMode"), "Play Edit")
check("restored validRangeCount", restored.get("validRangeCount"), edit.get("validRangeCount"))

for key in stable_keys:
    check(f"through stable {key}", through.get(key), edit.get(key))
    check(f"restored stable {key}", restored.get(key), edit.get(key))

summary = {
    "playEdit": {
        "playbackMode": edit.get("playbackMode"),
        "validRangeCount": edit.get("validRangeCount"),
        "laneCount": edit.get("laneCount"),
        "showDecisionCount": edit.get("showDecisionCount"),
        "skipDecisionCount": edit.get("skipDecisionCount"),
    },
    "playThrough": {
        "playbackMode": through.get("playbackMode"),
        "validRangeCount": through.get("validRangeCount"),
        "laneCount": through.get("laneCount"),
        "showDecisionCount": through.get("showDecisionCount"),
        "skipDecisionCount": through.get("skipDecisionCount"),
    },
    "restored": {
        "playbackMode": restored.get("playbackMode"),
        "validRangeCount": restored.get("validRangeCount"),
    }
}

print(json.dumps(summary, indent=2))

if errors:
    print("\nEpisode 1 transport smoke FAILED:", file=sys.stderr)
    for error in errors:
        print(f"- {error}", file=sys.stderr)
    sys.exit(1)

print("\nEpisode 1 transport smoke PASSED.")
PY
