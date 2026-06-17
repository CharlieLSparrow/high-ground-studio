#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BASE_URL="${QUIPSLY_AGENT_URL:-http://127.0.0.1:8080}"
NO_BUILD=0
TOLERANCE="${QUIPSLY_PROGRAM_SCROLL_TOLERANCE_SECONDS:-0.15}"
SOURCE_TOLERANCE="${QUIPSLY_SCRUB_SYNC_TOLERANCE_SECONDS:-0.55}"

usage() {
  cat <<'USAGE'
Smoke Episode 1 Program Output scroll path.

Usage:
  script/smoke_episode1_program_scroll.sh [--no-build]

This proves the editor contract that Program Output scrolling is not a private
player gesture. It moves the same sequence playhead used by the timeline,
source monitor wall, keyboard shortcuts, and agent controls.
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
  "$ROOT_DIR/script/build_and_run.sh" --verify >/tmp/quipslystudio-program-scroll-build.log
else
  "$ROOT_DIR/script/agentctl.sh" health >/dev/null
fi

"$ROOT_DIR/script/agentctl.sh" load-session episode-1-premiere-rescue >/tmp/quipslystudio-program-scroll-load.json

python3 - "$BASE_URL" "$TOLERANCE" "$SOURCE_TOLERANCE" <<'PY'
import json
import subprocess
import sys
import time
import urllib.request

base_url = sys.argv[1].rstrip("/")
playhead_tolerance = float(sys.argv[2])
source_tolerance = float(sys.argv[3])
errors = []


def get_json(path, timeout=12):
    with urllib.request.urlopen(f"{base_url}{path}", timeout=timeout) as response:
        return json.loads(response.read().decode("utf-8"))


def state():
    return get_json("/state")


def command(path):
    output = subprocess.check_output(
        ["curl", "--fail", "--silent", "--show-error", f"{base_url}{path}"],
        text=True,
        timeout=15,
    )
    return json.loads(output)


def wait_for(label, predicate, timeout=10, interval=0.15):
    deadline = time.time() + timeout
    last = None
    while time.time() < deadline:
        last = state()
        if predicate(last):
            return last
        time.sleep(interval)
    errors.append(f"{label}: timed out. Last state: {summarize(last or {})}")
    return last or {}


def summarize(s):
    return {
        "activeSessionName": s.get("activeSessionName"),
        "productionReady": s.get("productionReady"),
        "playhead": s.get("playhead"),
        "sourcePlayerCount": s.get("sourcePlayerCount"),
        "lastMediaAction": s.get("lastMediaAction"),
        "programTitle": s.get("currentProgramTitle"),
    }


def live_video_lanes(s):
    return [
        lane for lane in s.get("lanes", [])
        if lane.get("mediaKind") == "video" and lane.get("sourceMonitorPlayerReady") is True
    ]


def source_players_synced(s):
    lanes = live_video_lanes(s)
    if len(lanes) < 3:
        return False
    def delta_seconds(lane):
        value = lane.get("sourcePlayerDeltaSeconds")
        return 999 if value is None else float(value)
    return all(delta_seconds(lane) <= source_tolerance for lane in lanes)


loaded = wait_for(
    "load Episode 1",
    lambda s: s.get("activeSessionName") == "episode-1-premiere-rescue"
    and s.get("productionReady") is True
    and int(s.get("sourcePlayerCount") or 0) >= 3,
)

if loaded.get("sourceMonitorVideoCount") != 3:
    errors.append(f"sourceMonitorVideoCount expected 3, got {loaded.get('sourceMonitorVideoCount')!r}")

start = 10.0
delta = 7.5
expected = start + delta

command(f"/scrub?time={start}")
before = wait_for(
    "baseline scrub",
    lambda s: abs(float(s.get("playhead") or 0) - start) <= playhead_tolerance and source_players_synced(s),
)

command(f"/program_scroll?delta={delta}")
after = wait_for(
    "program scroll shared playhead",
    lambda s: abs(float(s.get("playhead") or 0) - expected) <= playhead_tolerance
    and "Scrubbed program monitor" in str(s.get("lastMediaAction") or "")
    and source_players_synced(s),
)

negative_delta = -3.25
negative_expected = expected + negative_delta
command(f"/program_scroll?delta={negative_delta}")
final = wait_for(
    "program scroll reverse shared playhead",
    lambda s: abs(float(s.get("playhead") or 0) - negative_expected) <= playhead_tolerance
    and "Scrubbed program monitor" in str(s.get("lastMediaAction") or "")
    and source_players_synced(s),
)

result = {
    "status": "failed" if errors else "passed",
    "activeSessionName": final.get("activeSessionName"),
    "productionReady": final.get("productionReady"),
    "sourceMonitorVideoCount": final.get("sourceMonitorVideoCount"),
    "programTitle": final.get("currentProgramTitle"),
    "proof": {
        "beforePlayhead": before.get("playhead"),
        "forwardExpected": expected,
        "forwardActual": after.get("playhead"),
        "reverseExpected": negative_expected,
        "reverseActual": final.get("playhead"),
        "lastMediaAction": final.get("lastMediaAction"),
        "maxSourcePlayerDelta": max(
            (float(lane.get("sourcePlayerDeltaSeconds") or 0) for lane in live_video_lanes(final)),
            default=0,
        ),
    },
    "errors": errors,
}

print(json.dumps(result, indent=2))
if errors:
    raise SystemExit(1)
PY
