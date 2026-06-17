#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
REPO_ROOT="$(cd "$ROOT_DIR/../.." && pwd)"
MEDIA_DIR="${EPISODE1_MEDIA_DIR:-/Volumes/My Passport/Episode 1}"
PACKET_PATH="${EPISODE1_PACKET_PATH:-$REPO_ROOT/content/quipsly/premiere-imports/episode-1.json}"
BASE_URL="${QUIPSLY_AGENT_URL:-http://127.0.0.1:8080}"
SMOKE_DIR="${TMPDIR:-/tmp}/quipslystudio-episode1-seek-smoke"
COMMANDS_STATE="$SMOKE_DIR/commands.json"
BEFORE_STATE="$SMOKE_DIR/before.json"
SEEK_ZERO_STATE="$SMOKE_DIR/seek-zero.json"
SEEK_MID_STATE="$SMOKE_DIR/seek-mid.json"
THROUGH_STATE="$SMOKE_DIR/through.json"
RESTORED_STATE="$SMOKE_DIR/restored.json"

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
  get "/seek?time=0" >/dev/null
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
get "/commands" > "$COMMANDS_STATE"
load_episode1_baseline
cleanup_needed=1
sleep 0.5
get "/state" > "$BEFORE_STATE"

get "/seek?time=0" >/dev/null
sleep 0.35
get "/state" > "$SEEK_ZERO_STATE"

get "/seek?time=61.5" >/dev/null
sleep 0.35
get "/state" > "$SEEK_MID_STATE"

get "/playback?mode=through&action=set" >/dev/null
sleep 0.35
get "/seek?time=42.25" >/dev/null
sleep 0.35
get "/state" > "$THROUGH_STATE"

get "/playback?mode=edit&action=set" >/dev/null
sleep 0.35
get "/seek?time=0" >/dev/null
sleep 0.35
get "/state" > "$RESTORED_STATE"
cleanup_needed=0

python3 - "$COMMANDS_STATE" "$BEFORE_STATE" "$SEEK_ZERO_STATE" "$SEEK_MID_STATE" "$THROUGH_STATE" "$RESTORED_STATE" <<'PY'
import json
import sys
from pathlib import Path

commands = json.loads(Path(sys.argv[1]).read_text())
before = json.loads(Path(sys.argv[2]).read_text())
seek_zero = json.loads(Path(sys.argv[3]).read_text())
seek_mid = json.loads(Path(sys.argv[4]).read_text())
through = json.loads(Path(sys.argv[5]).read_text())
restored = json.loads(Path(sys.argv[6]).read_text())
errors = []

commands_blob = "\n".join(commands.get("commands", []))
if "/seek?time=<seconds>" not in commands_blob:
    errors.append("/commands does not advertise /seek?time=<seconds>")

def near(label, actual, expected, tolerance=0.35):
    if actual is None or abs(float(actual) - expected) > tolerance:
        errors.append(f"{label}: expected near {expected}, got {actual!r}")

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

baseline_signature = lane_signature(before)
for label, state in [
    ("seek_zero", seek_zero),
    ("seek_mid", seek_mid),
    ("through", through),
    ("restored", restored),
]:
    check(f"{label} productionReady", state.get("productionReady"), True)
    check(f"{label} laneCount", state.get("laneCount"), before.get("laneCount"))
    check(f"{label} sourceMonitorVideoCount", state.get("sourceMonitorVideoCount"), before.get("sourceMonitorVideoCount"))
    check(f"{label} videoProxyReadyCount", state.get("videoProxyReadyCount"), before.get("videoProxyReadyCount"))
    check(f"{label} rawVaultCount", state.get("rawVaultCount"), before.get("rawVaultCount"))
    check(f"{label} showDecisionCount", state.get("showDecisionCount"), before.get("showDecisionCount"))
    check(f"{label} skipDecisionCount", state.get("skipDecisionCount"), before.get("skipDecisionCount"))
    check(f"{label} whole-lane source/proxy signature", lane_signature(state), baseline_signature)
    if not state.get("currentProgramTitle"):
        errors.append(f"{label}: currentProgramTitle is missing")
    if not state.get("currentProgramDetail"):
        errors.append(f"{label}: currentProgramDetail is missing")

near("seek_zero playhead", seek_zero.get("playhead"), 0)
near("seek_mid playhead", seek_mid.get("playhead"), 61.5)
near("through playhead", through.get("playhead"), 42.25)
near("restored playhead", restored.get("playhead"), 0)
check("through playbackMode", through.get("playbackMode"), "Play Through")
check("through validRangeCount", through.get("validRangeCount"), 1)
check("restored playbackMode", restored.get("playbackMode"), "Play Edit")

summary = {
    "commandsAdvertiseSeek": "/seek?time=<seconds>" in commands_blob,
    "seekZero": {
        "playhead": seek_zero.get("playhead"),
        "program": seek_zero.get("currentProgramTitle"),
        "mode": seek_zero.get("playbackMode"),
    },
    "seekMid": {
        "playhead": seek_mid.get("playhead"),
        "program": seek_mid.get("currentProgramTitle"),
        "mode": seek_mid.get("playbackMode"),
    },
    "through": {
        "playhead": through.get("playhead"),
        "program": through.get("currentProgramTitle"),
        "mode": through.get("playbackMode"),
        "validRangeCount": through.get("validRangeCount"),
    },
    "invariants": {
        "laneCount": before.get("laneCount"),
        "videoProxyReadyCount": before.get("videoProxyReadyCount"),
        "rawVaultCount": before.get("rawVaultCount"),
        "showDecisionCount": before.get("showDecisionCount"),
        "skipDecisionCount": before.get("skipDecisionCount"),
    }
}
print(json.dumps(summary, indent=2))

if errors:
    print("\nEpisode 1 seek/program-state smoke FAILED:", file=sys.stderr)
    for error in errors:
        print(f"- {error}", file=sys.stderr)
    sys.exit(1)

print("\nEpisode 1 seek/program-state smoke PASSED.")
PY
