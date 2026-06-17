#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
REPO_ROOT="$(cd "$ROOT_DIR/../.." && pwd)"
MEDIA_DIR="${EPISODE1_MEDIA_DIR:-/Volumes/My Passport/Episode 1}"
AUDIO_DIR="${EPISODE1_AUDIO_DIR:-$MEDIA_DIR}"
PACKET_PATH="${EPISODE1_PACKET_PATH:-$REPO_ROOT/content/quipsly/premiere-imports/episode-1.json}"
STATE_PATH="${TMPDIR:-/tmp}/quipslystudio-episode1-production-ready.json"
BASE_URL="${QUIPSLY_AGENT_URL:-http://127.0.0.1:8080}"

usage() {
  cat <<'USAGE'
Smoke Episode 1 production readiness.

Usage:
  script/smoke_episode1_production_ready.sh [--no-build]

What this proves:
  - QuipslyMac builds, launches, and exposes the local agent server.
  - Episode 1 loads as whole synced lanes, not chopped timeline clips.
  - External originals remain on the external drive.
  - Video playback is proxy-backed.
  - Audio playback is proxy-backed.
  - Play Edit still has skipped-gap valid ranges.
  - Active/cut decision counts are preserved.

Environment overrides:
  EPISODE1_MEDIA_DIR=/Volumes/My Passport/Episode 1
  EPISODE1_AUDIO_DIR=/Users/wall-e/Movies/Quipsly/Staging/Episode 1 Audio
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
  "$ROOT_DIR/script/build_and_run.sh" --verify >/tmp/quipslystudio-smoke-build.log
else
  get "/health" >/dev/null
fi

require_file "$PACKET_PATH"
require_file "$MEDIA_DIR/MVI_3999.MP4"
require_file "$MEDIA_DIR/NewHomerExport.MP4"
require_file "$AUDIO_DIR/First Pod Ever.wav"
require_file "$AUDIO_DIR/HomerAudio.wav"
require_file "$MEDIA_DIR/There is no try.mp4"

get "/premiere_packet?path=$(urlencode "$PACKET_PATH")" >/dev/null
get "/relink_lane?lane_id=$(urlencode "Charlie Camera - MVI_3999.MP4")&path=$(urlencode "$MEDIA_DIR/MVI_3999.MP4")&queue_proxy=0" >/dev/null
get "/relink_lane?lane_id=$(urlencode "Homer Camera - NewHomerExport.MP4")&path=$(urlencode "$MEDIA_DIR/NewHomerExport.MP4")&queue_proxy=0" >/dev/null
get "/relink_lane?lane_id=$(urlencode "Charlie Audio - First Pod Ever.wav")&path=$(urlencode "$AUDIO_DIR/First Pod Ever.wav")&queue_proxy=1" >/dev/null
get "/relink_lane?lane_id=$(urlencode "Homer Audio - HomerAudio.wav")&path=$(urlencode "$AUDIO_DIR/HomerAudio.wav")&queue_proxy=1" >/dev/null
get "/relink_lane?lane_id=$(urlencode "Reference Clip - There is no try.mp4")&path=$(urlencode "$MEDIA_DIR/There is no try.mp4")&queue_proxy=0" >/dev/null
get "/playback?mode=edit&action=set" >/dev/null

python3 - "$BASE_URL" <<'PY'
import json
import sys
import time
import urllib.request

base_url = sys.argv[1]
deadline = time.time() + 45
last_state = {}
while time.time() < deadline:
    try:
        with urllib.request.urlopen(f"{base_url}/state", timeout=3) as response:
            last_state = json.loads(response.read().decode("utf-8"))
        if last_state.get("audioReadyCount") == 2:
            break
    except Exception:
        pass
    time.sleep(1)
else:
    summary = {
        "audioReadyCount": last_state.get("audioReadyCount"),
        "productionReady": last_state.get("productionReady"),
        "productionReadinessDetail": last_state.get("productionReadinessDetail"),
        "lastMediaAction": last_state.get("lastMediaAction"),
        "audioLanes": [
            {
                "name": lane.get("name"),
                "sourceReadiness": lane.get("sourceReadiness"),
                "sourceReadinessDetail": lane.get("sourceReadinessDetail"),
                "proxyError": lane.get("proxyError"),
                "playbackPath": lane.get("playbackPath"),
                "vaultProxyPath": lane.get("vaultProxyPath"),
                "needsStorageAccess": lane.get("needsStorageAccess"),
            }
            for lane in last_state.get("lanes", [])
            if "Audio" in lane.get("name", "")
        ],
    }
    print("Timed out waiting for audio proxies. Last state summary:", json.dumps(summary, indent=2), file=sys.stderr)
    sys.exit(1)
PY
get "/state" > "$STATE_PATH"

python3 - "$STATE_PATH" <<'PY'
import json
import sys
from pathlib import Path

path = Path(sys.argv[1])
state = json.loads(path.read_text())
lanes = state.get("lanes", [])

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

expect_true("productionReady", state.get("productionReady"))
expect("videoProxyReadyCount", state.get("videoProxyReadyCount"), 3)
expect("videoBlockedCount", state.get("videoBlockedCount"), 0)
expect("audioReadyCount", state.get("audioReadyCount"), 2)
expect("showDecisionCount", state.get("showDecisionCount"), 236)
expect("skipDecisionCount", state.get("skipDecisionCount"), 118)
expect("rawVaultCount", state.get("rawVaultCount"), 0)
expect("playbackMode", state.get("playbackMode"), "Play Edit")
expect_play_edit_ranges("validRangeCount", state.get("validRangeCount"))
expect("laneCount", state.get("laneCount"), 5)
expect("sourceMonitorVideoCount", state.get("sourceMonitorVideoCount"), 3)

for lane in lanes:
    name = lane.get("name", "")
    readiness = lane.get("sourceReadiness", "")
    raw_vault = lane.get("vaultRawPath", "")
    if raw_vault:
        errors.append(f"{name}: vaultRawPath must stay empty, got {raw_vault!r}")
    if "Camera" in name or "Reference Clip" in name:
        if readiness != "Proxy ready":
            errors.append(f"{name}: video/reference lane must be Proxy ready, got {readiness!r}")
        playback = lane.get("playbackPath", "")
        if "/Library/Application Support/Quipsly/MediaVault/proxy/" not in playback:
            errors.append(f"{name}: playbackPath must point at proxy vault, got {playback!r}")
    if "Audio" in name:
        if readiness != "Audio proxy ready":
            errors.append(f"{name}: audio lane must be Audio proxy ready, got {readiness!r}")
        playback = lane.get("playbackPath", "")
        if "/Library/Application Support/Quipsly/MediaVault/proxy/" not in playback:
            errors.append(f"{name}: audio playbackPath must point at proxy vault, got {playback!r}")

summary = {
    "productionReady": state.get("productionReady"),
    "productionReadinessDetail": state.get("productionReadinessDetail"),
    "videoProxyReadyCount": state.get("videoProxyReadyCount"),
    "videoBlockedCount": state.get("videoBlockedCount"),
    "audioReadyCount": state.get("audioReadyCount"),
    "showDecisionCount": state.get("showDecisionCount"),
    "skipDecisionCount": state.get("skipDecisionCount"),
    "rawVaultCount": state.get("rawVaultCount"),
    "playbackMode": state.get("playbackMode"),
    "validRangeCount": state.get("validRangeCount"),
    "laneCount": state.get("laneCount"),
    "sourceMonitorVideoCount": state.get("sourceMonitorVideoCount"),
}

print(json.dumps(summary, indent=2))

if errors:
    print("\nEpisode 1 production smoke FAILED:", file=sys.stderr)
    for error in errors:
        print(f"- {error}", file=sys.stderr)
    sys.exit(1)

print("\nEpisode 1 production smoke PASSED.")
PY
