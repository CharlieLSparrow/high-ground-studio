#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
REPO_ROOT="$(cd "$ROOT_DIR/../.." && pwd)"
MEDIA_DIR="${EPISODE1_MEDIA_DIR:-/Volumes/My Passport/Episode 1}"
PACKET_PATH="${EPISODE1_PACKET_PATH:-$REPO_ROOT/content/quipsly/premiere-imports/episode-1.json}"
STATE_PATH="${TMPDIR:-/tmp}/quipslystudio-episode1-visual-rough-cut.json"
BASE_URL="${QUIPSLY_AGENT_URL:-http://127.0.0.1:8080}"

usage() {
  cat <<'USAGE'
Smoke Episode 1 visual rough-cut workflow.

Usage:
  script/smoke_episode1_visual_rough_cut.sh [--no-build]

What this proves:
  - The native app is running and controllable through the local agent server.
  - Episode 1 loads as whole synced lanes, not chopped clips.
  - Video/reference lanes are proxy-backed.
  - Audio may remain blocked, but visual rough-cut review is explicitly usable.
  - Play Edit and Play Through can be selected.
  - Seeking into a real SHOW decision updates the program summary.
  - Source monitor players are present for the three video/reference lanes.

This is not the final production smoke. Final production still requires audio
proxies, waveform/sync review, and export readiness.

Environment overrides:
  EPISODE1_MEDIA_DIR=/Volumes/My Passport/Episode 1
  EPISODE1_PACKET_PATH=/absolute/path/to/episode-1.json
  QUIPSLY_AGENT_URL=http://127.0.0.1:8080
USAGE
}

require_file() {
  local path="$1"
  if [[ ! -f "$path" ]]; then
    echo "Missing required file: $path" >&2
    exit 1
  fi
}

urlencode() {
  python3 -c 'import sys, urllib.parse; print(urllib.parse.quote(sys.argv[1], safe=""))' "$1"
}

get() {
  curl --fail --silent --show-error "$BASE_URL$1"
  printf '\n'
}

if [[ "${1:-}" == "-h" || "${1:-}" == "--help" ]]; then
  usage
  exit 0
fi

if [[ "${1:-}" != "--no-build" ]]; then
  "$ROOT_DIR/script/build_and_run.sh" --verify >/tmp/quipslystudio-smoke-visual-rough-cut-build.log
else
  get "/health" >/dev/null
fi

require_file "$PACKET_PATH"

get "/premiere_packet?path=$(urlencode "$PACKET_PATH")" >/dev/null
get "/relink_lane?lane_id=$(urlencode "Charlie Camera - MVI_3999.MP4")&path=$(urlencode "$MEDIA_DIR/MVI_3999.MP4")&queue_proxy=0" >/dev/null
get "/relink_lane?lane_id=$(urlencode "Homer Camera - NewHomerExport.MP4")&path=$(urlencode "$MEDIA_DIR/NewHomerExport.MP4")&queue_proxy=0" >/dev/null
get "/relink_lane?lane_id=$(urlencode "Reference Clip - There is no try.mp4")&path=$(urlencode "$MEDIA_DIR/There is no try.mp4")&queue_proxy=0" >/dev/null
get "/relink_lane?lane_id=$(urlencode "Charlie Audio - First Pod Ever.wav")&path=$(urlencode "$MEDIA_DIR/First Pod Ever.wav")&queue_proxy=0" >/dev/null
get "/relink_lane?lane_id=$(urlencode "Homer Audio - HomerAudio.wav")&path=$(urlencode "$MEDIA_DIR/HomerAudio.wav")&queue_proxy=0" >/dev/null
get "/playback?mode=edit&action=set" >/dev/null

python3 - "$BASE_URL" "$STATE_PATH" <<'PY'
import json
from pathlib import Path
import sys
import time
import urllib.parse
import urllib.request

base_url = sys.argv[1]
state_path = Path(sys.argv[2])

def request(path):
    with urllib.request.urlopen(f"{base_url}{path}", timeout=5) as response:
        return json.loads(response.read().decode("utf-8"))

def get_state():
    return request("/state")

deadline = time.time() + 15
state = {}
while time.time() < deadline:
    state = get_state()
    if state.get("visualRoughCutReady") is True and state.get("sourcePlayerCount") == 3:
        break
    time.sleep(0.5)

errors = []

def expect(label, actual, expected):
    if actual != expected:
        errors.append(f"{label}: expected {expected!r}, got {actual!r}")

def expect_true(label, actual):
    if actual is not True:
        errors.append(f"{label}: expected true, got {actual!r}")

def expect_play_edit_ranges(label, actual):
    if not isinstance(actual, int) or actual <= 1:
        errors.append(f"{label}: expected multiple Play Edit ranges, got {actual!r}")

expect_true("visualRoughCutReady", state.get("visualRoughCutReady"))
expect("videoProxyReadyCount", state.get("videoProxyReadyCount"), 3)
expect("videoBlockedCount", state.get("videoBlockedCount"), 0)
expect("sourceMonitorVideoCount", state.get("sourceMonitorVideoCount"), 3)
expect("sourcePlayerCount", state.get("sourcePlayerCount"), 3)
expect("playbackMode", state.get("playbackMode"), "Play Edit")
initial_valid_range_count = state.get("validRangeCount")
expect_play_edit_ranges("validRangeCount", initial_valid_range_count)
expect("showDecisionCount", state.get("showDecisionCount"), 236)
expect("skipDecisionCount", state.get("skipDecisionCount"), 118)

lanes = state.get("lanes", [])
video_lanes = [
    lane for lane in lanes
    if "Camera" in lane.get("name", "") or "Reference Clip" in lane.get("name", "")
]
audio_lanes = [lane for lane in lanes if "Audio" in lane.get("name", "")]

if len(video_lanes) != 3:
    errors.append(f"video lane count: expected 3, got {len(video_lanes)}")
if len(audio_lanes) != 2:
    errors.append(f"audio lane count: expected 2, got {len(audio_lanes)}")

for lane in video_lanes:
    name = lane.get("name", "")
    if lane.get("sourceReadiness") != "Proxy ready":
        errors.append(f"{name}: expected Proxy ready, got {lane.get('sourceReadiness')!r}")
    playback = lane.get("playbackPath", "")
    if "/Library/Application Support/Quipsly/MediaVault/proxy/" not in playback:
        errors.append(f"{name}: expected proxy playback path, got {playback!r}")

first_show = None
for lane in video_lanes:
    for tag in lane.get("tags", []):
        if str(tag.get("type", "")).lower() == "active":
            first_show = (lane, tag)
            break
    if first_show:
        break

if not first_show:
    errors.append("No SHOW decision found on a video lane")
else:
    lane, tag = first_show
    seek_time = float(lane.get("sourceOffset", 0)) + float(tag["startTime"]) + min(0.25, max(0.0, float(tag["duration"]) / 2))
    request(f"/seek?time={urllib.parse.quote(str(seek_time))}")
    time.sleep(0.5)
    state = get_state()
    if not str(state.get("currentProgramTitle", "")).startswith("Showing "):
        errors.append(f"seek into SHOW: expected currentProgramTitle to start with Showing, got {state.get('currentProgramTitle')!r}")
    selected_lane = urllib.parse.quote(str(lane["id"]))
    selected_tag = urllib.parse.quote(str(tag["id"]))
    request(f"/select_tag?lane_id={selected_lane}&tag_id={selected_tag}")
    time.sleep(0.5)
    state = get_state()
    expect("selectedTagId", state.get("selectedTagId"), tag["id"])
    expect("selectedLaneId", state.get("selectedLaneId"), lane["id"])

request("/playback?mode=through&action=set")
time.sleep(0.5)
state = get_state()
expect("playbackMode after through", state.get("playbackMode"), "Play Through")
expect("validRangeCount after through", state.get("validRangeCount"), 1)

request("/playback?mode=edit&action=set")
time.sleep(0.5)
state = get_state()
expect("playbackMode after edit", state.get("playbackMode"), "Play Edit")
expect("validRangeCount after edit", state.get("validRangeCount"), initial_valid_range_count)
expect_true("visualRoughCutReady after mode switching", state.get("visualRoughCutReady"))

summary = {
    "visualRoughCutReady": state.get("visualRoughCutReady"),
    "visualRoughCutDetail": state.get("visualRoughCutDetail"),
    "productionReady": state.get("productionReady"),
    "productionReadinessDetail": state.get("productionReadinessDetail"),
    "playbackMode": state.get("playbackMode"),
    "sourcePlayerCount": state.get("sourcePlayerCount"),
    "sourceMonitorVideoCount": state.get("sourceMonitorVideoCount"),
    "videoProxyReadyCount": state.get("videoProxyReadyCount"),
    "audioReadyCount": state.get("audioReadyCount"),
    "audioBlockedCount": state.get("audioBlockedCount"),
    "showDecisionCount": state.get("showDecisionCount"),
    "skipDecisionCount": state.get("skipDecisionCount"),
    "validRangeCount": state.get("validRangeCount"),
    "selectedLaneName": state.get("selectedLaneName"),
    "selectedTagType": state.get("selectedTagType"),
    "currentProgramTitle": state.get("currentProgramTitle"),
}

state_path.write_text(json.dumps(state, indent=2, sort_keys=True))
print(json.dumps(summary, indent=2))

if errors:
    print("\nEpisode 1 visual rough-cut smoke FAILED:", file=sys.stderr)
    for error in errors:
        print(f"- {error}", file=sys.stderr)
    sys.exit(1)

print("\nEpisode 1 visual rough-cut smoke PASSED.")
PY
