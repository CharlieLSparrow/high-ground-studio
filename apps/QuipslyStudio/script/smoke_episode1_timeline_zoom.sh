#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BASE_URL="${QUIPSLY_AGENT_URL:-http://127.0.0.1:8080}"
NO_BUILD=0
PLAYHEAD_TOLERANCE="${QUIPSLY_TIMELINE_ZOOM_PLAYHEAD_TOLERANCE_SECONDS:-0.15}"
SOURCE_TOLERANCE="${QUIPSLY_SCRUB_SYNC_TOLERANCE_SECONDS:-0.55}"

usage() {
  cat <<'USAGE'
Smoke Episode 1 timeline zoom controls.

Usage:
  script/smoke_episode1_timeline_zoom.sh [--no-build]

This proves timeline zoom is a view/navigation affordance over the same whole
source decision timeline. Fit, cut, frame, set, in, and out must not desync the
playhead or source monitor wall.
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
  "$ROOT_DIR/script/build_and_run.sh" --verify >/tmp/quipslystudio-timeline-zoom-build.log
else
  "$ROOT_DIR/script/agentctl.sh" health >/dev/null
fi

"$ROOT_DIR/script/agentctl.sh" load-session episode-1-premiere-rescue >/tmp/quipslystudio-timeline-zoom-load.json

python3 - "$BASE_URL" "$PLAYHEAD_TOLERANCE" "$SOURCE_TOLERANCE" <<'PY'
import json
import sys
import time
import urllib.parse
import urllib.request

base_url = sys.argv[1].rstrip("/")
playhead_tolerance = float(sys.argv[2])
source_tolerance = float(sys.argv[3])
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
    errors.append(f"{label}: timed out. Last state: {summarize(last or {})}")
    return last or {}


def summarize(s):
    return {
        "activeSessionName": s.get("activeSessionName"),
        "productionReady": s.get("productionReady"),
        "playhead": s.get("playhead"),
        "timelinePixelsPerSecond": s.get("timelinePixelsPerSecond"),
        "timelineFitToWindow": s.get("timelineFitToWindow"),
        "lastMediaAction": s.get("lastMediaAction"),
    }


def live_video_lanes(s):
    return [
        lane for lane in s.get("lanes", [])
        if lane.get("mediaKind") == "video" and lane.get("sourceMonitorPlayerReady") is True
    ]


def source_delta(lane):
    value = lane.get("sourcePlayerDeltaSeconds")
    return 999 if value is None else float(value)


def source_players_synced(s):
    lanes = live_video_lanes(s)
    if len(lanes) < 3:
        return False
    return all(source_delta(lane) <= source_tolerance for lane in lanes)


def zoom(mode, scale=None):
    query = f"mode={urllib.parse.quote(str(mode))}"
    if scale is not None:
        query += f"&scale={urllib.parse.quote(str(scale))}"
    return command(f"/timeline_zoom?{query}")


loaded = wait_for(
    "load Episode 1",
    lambda s: s.get("activeSessionName") == "episode-1-premiere-rescue"
    and s.get("productionReady") is True
    and int(s.get("sourcePlayerCount") or 0) >= 3,
)

if loaded.get("sourceMonitorVideoCount") != 3:
    errors.append(f"sourceMonitorVideoCount expected 3, got {loaded.get('sourceMonitorVideoCount')!r}")

target_playhead = 42.0
command(f"/scrub?time={target_playhead}")
baseline = wait_for(
    "baseline scrub before zoom",
    lambda s: abs(float(s.get("playhead") or 0) - target_playhead) <= playhead_tolerance and source_players_synced(s),
)

checks = [
    ("fit", None, lambda s: s.get("timelineFitToWindow") is True),
    ("cut", None, lambda s: s.get("timelineFitToWindow") is False and abs(float(s.get("timelinePixelsPerSecond") or 0) - 80.0) < 0.01),
    ("frame", None, lambda s: s.get("timelineFitToWindow") is False and abs(float(s.get("timelinePixelsPerSecond") or 0) - 240.0) < 0.01),
    ("set", 33.3, lambda s: s.get("timelineFitToWindow") is False and abs(float(s.get("timelinePixelsPerSecond") or 0) - 33.3) < 0.01),
    ("in", None, lambda s: s.get("timelineFitToWindow") is False and abs(float(s.get("timelinePixelsPerSecond") or 0) - 49.95) < 0.02),
    ("out", None, lambda s: s.get("timelineFitToWindow") is False and abs(float(s.get("timelinePixelsPerSecond") or 0) - 33.3) < 0.02),
]

for mode, scale, predicate in checks:
    zoom(mode, scale)
    s = wait_for(
        f"timeline zoom {mode}",
        lambda st, predicate=predicate: predicate(st)
        and abs(float(st.get("playhead") or 0) - target_playhead) <= playhead_tolerance
        and source_players_synced(st),
    )
    proof.append({
        "mode": mode,
        "requestedScale": scale,
        "timelinePixelsPerSecond": s.get("timelinePixelsPerSecond"),
        "timelineFitToWindow": s.get("timelineFitToWindow"),
        "playhead": s.get("playhead"),
        "lastMediaAction": s.get("lastMediaAction"),
        "maxSourcePlayerDelta": max((source_delta(lane) for lane in live_video_lanes(s)), default=0),
    })

final = state()
result = {
    "status": "failed" if errors else "passed",
    "activeSessionName": final.get("activeSessionName"),
    "productionReady": final.get("productionReady"),
    "baseline": summarize(baseline),
    "proof": proof,
    "errors": errors,
}

print(json.dumps(result, indent=2))
if errors:
    raise SystemExit(1)
PY
