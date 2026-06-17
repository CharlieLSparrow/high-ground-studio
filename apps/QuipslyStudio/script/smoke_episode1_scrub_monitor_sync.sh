#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BASE_URL="${QUIPSLY_AGENT_URL:-http://127.0.0.1:8080}"
NO_BUILD=0
TOLERANCE="${QUIPSLY_SCRUB_SYNC_TOLERANCE_SECONDS:-0.55}"

usage() {
  cat <<'USAGE'
Smoke Episode 1 timeline scrub and monitor-wall synchronization.

Usage:
  script/smoke_episode1_scrub_monitor_sync.sh [--no-build]

This proves the MVP scrub contract:
  - Episode 1 is loaded as whole synced source lanes.
  - Timeline scrub commands move the shared sequence playhead.
  - Every live source monitor player lands near its expected source time.
  - The proof uses proxies only; originals remain untouched.
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
  "$ROOT_DIR/script/build_and_run.sh" --verify >/tmp/quipslystudio-scrub-sync-build.log
else
  "$ROOT_DIR/script/agentctl.sh" health >/dev/null
fi

"$ROOT_DIR/script/agentctl.sh" load-session episode-1-premiere-rescue >/tmp/quipslystudio-scrub-sync-load.json

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


def state():
    return get_json("/state")


def command(path):
    return get_json(path)


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
        "playhead": s.get("playhead"),
        "sourcePlayerCount": s.get("sourcePlayerCount"),
        "lastMediaAction": s.get("lastMediaAction"),
    }


def live_lanes(s):
    return [
        lane for lane in s.get("lanes", [])
        if lane.get("mediaKind") == "video" and lane.get("sourceMonitorPlayerReady") is True
    ]


def optional_float(value, fallback):
    if value is None:
        return fallback
    return float(value)


initial = wait_for(
    "load Episode 1",
    lambda s: s.get("activeSessionName") == "episode-1-premiere-rescue"
    and s.get("productionReady") is True
    and int(s.get("sourcePlayerCount") or 0) >= 3,
)

if initial.get("sourceMonitorVideoCount") != 3:
    errors.append(f"Episode 1 sourceMonitorVideoCount expected 3, got {initial.get('sourceMonitorVideoCount')!r}")
if len(live_lanes(initial)) < 3:
    errors.append(f"Expected at least 3 live video source players, got {len(live_lanes(initial))}")

duration = float(initial.get("sequenceDuration") or 0)
scrub_times = [0.0, 20.0, min(120.0, max(0.0, duration - 1.0)), min(max(duration * 0.35, 30.0), max(0.0, duration - 1.0))]

for target in scrub_times:
    command(f"/scrub?time={target}")

    def synced(s, target=target):
        if abs(float(s.get("playhead") or 0) - target) > 0.08:
            return False
        lanes = live_lanes(s)
        if len(lanes) < 3:
            return False
        return all(optional_float(lane.get("sourcePlayerDeltaSeconds"), 999) <= tolerance for lane in lanes)

    s = wait_for(f"scrub sync at {target:.2f}s", synced, timeout=8, interval=0.2)
    lanes = live_lanes(s)
    deltas = [
        {
            "lane": lane.get("name"),
            "expected": round(float(lane.get("expectedSourcePlayerTimeSeconds") or 0), 3),
            "actual": round(float(lane.get("sourcePlayerTimeSeconds") or 0), 3),
            "delta": round(float(lane.get("sourcePlayerDeltaSeconds") or 0), 3),
        }
        for lane in lanes
    ]
    proof.append({
        "sequenceTime": round(target, 3),
        "playhead": round(float(s.get("playhead") or 0), 3),
        "maxDelta": round(max((item["delta"] for item in deltas), default=0), 3),
        "lanes": deltas,
    })

command(f"/seek?time={scrub_times[-1]}")
final = wait_for("final exact seek after scrub", lambda s: abs(float(s.get("playhead") or 0) - scrub_times[-1]) < 0.08)

result = {
    "status": "failed" if errors else "passed",
    "toleranceSeconds": tolerance,
    "activeSessionName": final.get("activeSessionName"),
    "productionReady": final.get("productionReady"),
    "sourceMonitorVideoCount": final.get("sourceMonitorVideoCount"),
    "sourcePlayerCount": final.get("sourcePlayerCount"),
    "proof": proof,
    "errors": errors,
}
print(json.dumps(result, indent=2))
if errors:
    raise SystemExit(1)
PY
