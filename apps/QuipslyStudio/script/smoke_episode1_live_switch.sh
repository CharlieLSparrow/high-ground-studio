#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
REPO_ROOT="$(cd "$ROOT_DIR/../.." && pwd)"
MEDIA_DIR="${EPISODE1_MEDIA_DIR:-/Volumes/My Passport/Episode 1}"
PACKET_PATH="${EPISODE1_PACKET_PATH:-$REPO_ROOT/content/quipsly/premiere-imports/episode-1.json}"
BASE_URL="${QUIPSLY_AGENT_URL:-http://127.0.0.1:8080}"
SMOKE_DIR="${TMPDIR:-/tmp}/quipslystudio-episode1-live-switch-smoke"
BEFORE_STATE="$SMOKE_DIR/before.json"
AFTER_STATE="$SMOKE_DIR/after.json"
RESTORED_STATE="$SMOKE_DIR/restored.json"
TEMP_START="61.5"
TEMP_DURATION="1.25"

urlencode() {
  python3 -c 'import sys, urllib.parse; print(urllib.parse.quote(sys.argv[1], safe=""))' "$1"
}

get() {
  curl --fail --silent --show-error "$BASE_URL$1"
  printf '\n'
}

require_file() {
  local path="$1"
  if [[ ! -f "$path" ]]; then
    echo "Missing required file: $path" >&2
    exit 1
  fi
}

load_episode1_baseline() {
  get "/premiere_packet?path=$(urlencode "$PACKET_PATH")" >/dev/null
  get "/relink_lane?lane_id=$(urlencode "Charlie Camera - MVI_3999.MP4")&path=$(urlencode "$MEDIA_DIR/MVI_3999.MP4")&queue_proxy=0" >/dev/null
  get "/relink_lane?lane_id=$(urlencode "Homer Camera - NewHomerExport.MP4")&path=$(urlencode "$MEDIA_DIR/NewHomerExport.MP4")&queue_proxy=0" >/dev/null
  get "/relink_lane?lane_id=$(urlencode "Charlie Audio - First Pod Ever.wav")&path=$(urlencode "$MEDIA_DIR/First Pod Ever.wav")&queue_proxy=0" >/dev/null
  get "/relink_lane?lane_id=$(urlencode "Homer Audio - HomerAudio.wav")&path=$(urlencode "$MEDIA_DIR/HomerAudio.wav")&queue_proxy=0" >/dev/null
  get "/relink_lane?lane_id=$(urlencode "Reference Clip - There is no try.mp4")&path=$(urlencode "$MEDIA_DIR/There is no try.mp4")&queue_proxy=0" >/dev/null
  get "/playback?mode=edit&action=set" >/dev/null
}

cleanup_needed=0
cleanup() {
  if [[ "$cleanup_needed" == "1" ]]; then
    load_episode1_baseline >/dev/null 2>&1 || true
  fi
}
trap cleanup EXIT

mkdir -p "$SMOKE_DIR"
require_file "$PACKET_PATH"
require_file "$MEDIA_DIR/MVI_3999.MP4"
require_file "$MEDIA_DIR/NewHomerExport.MP4"
require_file "$MEDIA_DIR/First Pod Ever.wav"
require_file "$MEDIA_DIR/HomerAudio.wav"
require_file "$MEDIA_DIR/There is no try.mp4"

get "/health" >/dev/null
load_episode1_baseline
sleep 0.5
get "/state" > "$BEFORE_STATE"

cleanup_needed=1
get "/decision?action=charlie&start=$(urlencode "$TEMP_START")&duration=$(urlencode "$TEMP_DURATION")" >/dev/null
sleep 0.5
get "/state" > "$AFTER_STATE"

python3 - "$BEFORE_STATE" "$AFTER_STATE" "$TEMP_START" "$TEMP_DURATION" <<'PY'
import json
import sys
from pathlib import Path

before = json.loads(Path(sys.argv[1]).read_text())
after = json.loads(Path(sys.argv[2]).read_text())
sequence_start = float(sys.argv[3])
sequence_duration = float(sys.argv[4])
sequence_end = sequence_start + sequence_duration
errors = []

def check(label, actual, expected):
    if actual != expected:
        errors.append(f"{label}: expected {expected!r}, got {actual!r}")

def lane_signature(state):
    return [
        {
            "id": lane.get("id", ""),
            "name": lane.get("name", ""),
            "duration": lane.get("duration", 0),
            "sourcePath": lane.get("sourcePath", ""),
            "playbackPath": lane.get("playbackPath", ""),
            "mediaKind": lane.get("mediaKind", ""),
            "role": lane.get("role", ""),
            "trackIds": lane.get("trackIds", []),
        }
        for lane in state.get("lanes", [])
    ]

def is_charlie_lane(lane):
    blob = " ".join([
        lane.get("name", ""),
        lane.get("role", ""),
        lane.get("sourceLabel", ""),
        lane.get("sourcePath", ""),
    ]).lower()
    return "charlie" in blob or "first pod" in blob or "mvi_" in blob

def intersects_requested_span(lane):
    offset = float(lane.get("sourceOffset", 0) or 0)
    duration = float(lane.get("duration", 0) or 0)
    local_start = max(0.0, sequence_start - offset)
    local_end = min(duration, sequence_end - offset)
    return (local_end - local_start) >= 0.05

charlie_count = sum(1 for lane in before.get("lanes", []) if is_charlie_lane(lane) and intersects_requested_span(lane))
lane_count = before.get("laneCount", 0)
non_charlie_count = sum(1 for lane in before.get("lanes", []) if not is_charlie_lane(lane) and intersects_requested_span(lane))

check("productionReady changed by live switch", after.get("productionReady"), before.get("productionReady"))
check("visualRoughCutReady after live switch", after.get("visualRoughCutReady"), True)
check("laneCount", after.get("laneCount"), lane_count)
check("sourceMonitorVideoCount", after.get("sourceMonitorVideoCount"), before.get("sourceMonitorVideoCount"))
check("videoProxyReadyCount", after.get("videoProxyReadyCount"), before.get("videoProxyReadyCount"))
check("videoBlockedCount", after.get("videoBlockedCount"), before.get("videoBlockedCount"))
check("audioReadyCount", after.get("audioReadyCount"), before.get("audioReadyCount"))
check("rawVaultCount", after.get("rawVaultCount"), before.get("rawVaultCount"))
check("whole-lane source/proxy signature", lane_signature(after), lane_signature(before))
check("showDecisionCount", after.get("showDecisionCount"), before.get("showDecisionCount", 0) + charlie_count)
check("skipDecisionCount", after.get("skipDecisionCount"), before.get("skipDecisionCount", 0) + non_charlie_count)
if not after.get("selectedTagId"):
    errors.append("selectedTagId: expected the new live-switch decision to be selected")
if not after.get("selectedLaneId"):
    errors.append("selectedLaneId: expected the new live-switch lane to be selected")
check("selectedTagType", after.get("selectedTagType"), "Active")

summary = {
    "liveSwitch": "charlie",
    "charlieLaneCount": charlie_count,
    "nonCharlieLaneCount": non_charlie_count,
    "before": {
        "showDecisionCount": before.get("showDecisionCount"),
        "skipDecisionCount": before.get("skipDecisionCount"),
        "laneCount": lane_count,
        "videoProxyReadyCount": before.get("videoProxyReadyCount"),
        "rawVaultCount": before.get("rawVaultCount"),
    },
    "after": {
        "visualRoughCutReady": after.get("visualRoughCutReady"),
        "productionReady": after.get("productionReady"),
        "showDecisionCount": after.get("showDecisionCount"),
        "skipDecisionCount": after.get("skipDecisionCount"),
        "laneCount": after.get("laneCount"),
        "videoProxyReadyCount": after.get("videoProxyReadyCount"),
        "rawVaultCount": after.get("rawVaultCount"),
        "selectedLaneName": after.get("selectedLaneName"),
        "selectedTagType": after.get("selectedTagType"),
    },
}
print(json.dumps(summary, indent=2))

if errors:
    print("\nEpisode 1 live switch smoke FAILED:", file=sys.stderr)
    for error in errors:
        print(f"- {error}", file=sys.stderr)
    sys.exit(1)

print("\nLive switch changed only SHOW/SKIP overlays; whole source lanes and proxy playback stayed intact.")
PY

load_episode1_baseline
cleanup_needed=0
sleep 0.5
get "/state" > "$RESTORED_STATE"

python3 - "$BEFORE_STATE" "$RESTORED_STATE" <<'PY'
import json
import sys
from pathlib import Path

before = json.loads(Path(sys.argv[1]).read_text())
restored = json.loads(Path(sys.argv[2]).read_text())
errors = []
for key in [
    "laneCount",
    "sourceMonitorVideoCount",
    "videoProxyReadyCount",
    "videoBlockedCount",
    "audioReadyCount",
    "showDecisionCount",
    "skipDecisionCount",
    "rawVaultCount",
    "validRangeCount",
]:
    if restored.get(key) != before.get(key):
        errors.append(f"{key}: expected restored {before.get(key)!r}, got {restored.get(key)!r}")

print(json.dumps({
    "restored": {
        "productionReady": restored.get("productionReady"),
        "showDecisionCount": restored.get("showDecisionCount"),
        "skipDecisionCount": restored.get("skipDecisionCount"),
        "laneCount": restored.get("laneCount"),
        "sourceMonitorVideoCount": restored.get("sourceMonitorVideoCount"),
    }
}, indent=2))

if errors:
    print("\nEpisode 1 live switch baseline restore FAILED:", file=sys.stderr)
    for error in errors:
        print(f"- {error}", file=sys.stderr)
    sys.exit(1)

print("\nEpisode 1 live switch smoke PASSED.")
PY
