#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
REPO_ROOT="$(cd "$ROOT_DIR/../.." && pwd)"
MEDIA_DIR="${EPISODE1_MEDIA_DIR:-/Volumes/My Passport/Episode 1}"
PACKET_PATH="${EPISODE1_PACKET_PATH:-$REPO_ROOT/content/quipsly/premiere-imports/episode-1.json}"
STATE_PATH="${TMPDIR:-/tmp}/quipslystudio-episode1-editor-architecture.json"
BASE_URL="${QUIPSLY_AGENT_URL:-http://127.0.0.1:8080}"

usage() {
  cat <<'USAGE'
Smoke Episode 1 editor architecture.

Usage:
  script/smoke_episode1_editor_architecture.sh [--no-build]

What this proves:
  - The app builds/launches and exposes the local agent server.
  - Episode 1 loads as whole synced lanes, not chopped timeline clips.
  - Video/reference lanes are proxy-backed for monitor-wall playback.
  - SHOW/SKIP decision counts are preserved from the rescue packet.
  - Play Edit has skipped-gap valid ranges.
  - Audio may remain proxy-blocked or pending; that belongs to the stricter
    production smoke, not this architecture smoke.

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
  "$ROOT_DIR/script/build_and_run.sh" --verify >/tmp/quipslystudio-smoke-architecture-build.log
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

sleep 1
get "/state" > "$STATE_PATH"

python3 - "$STATE_PATH" <<'PY'
import json
import sys
from pathlib import Path

state = json.loads(Path(sys.argv[1]).read_text())
lanes = state.get("lanes", [])
errors = []

def expect(label, actual, expected):
    if actual != expected:
        errors.append(f"{label}: expected {expected!r}, got {actual!r}")

def expect_nonzero(label, actual):
    if not isinstance(actual, int) or actual <= 0:
        errors.append(f"{label}: expected positive integer, got {actual!r}")

def expect_play_edit_ranges(label, actual):
    if not isinstance(actual, int) or actual <= 1:
        errors.append(f"{label}: expected multiple Play Edit ranges, got {actual!r}")

expect("monitorWallModel", state.get("monitorWallModel"), "program_output_plus_whole_source_lanes")
expect("sourceMonitorLayout", state.get("sourceMonitorLayout"), "horizontal_whole_lane_cards")
expect("laneCount", state.get("laneCount"), 5)
expect("sourceMonitorVideoCount", state.get("sourceMonitorVideoCount"), 3)
expect("videoProxyReadyCount", state.get("videoProxyReadyCount"), 3)
expect("videoBlockedCount", state.get("videoBlockedCount"), 0)
expect("visualRoughCutReady", state.get("visualRoughCutReady"), True)
expect("showDecisionCount", state.get("showDecisionCount"), 236)
expect("skipDecisionCount", state.get("skipDecisionCount"), 118)
expect("rawVaultCount", state.get("rawVaultCount"), 0)
expect("playbackMode", state.get("playbackMode"), "Play Edit")
expect_play_edit_ranges("validRangeCount", state.get("validRangeCount"))
expect_nonzero("sequenceDuration", int(state.get("sequenceDuration") or 0))

video_lanes = [lane for lane in lanes if "Camera" in lane.get("name", "") or "Reference Clip" in lane.get("name", "")]
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
    if lane.get("vaultRawPath"):
        errors.append(f"{name}: vaultRawPath should stay empty, got {lane.get('vaultRawPath')!r}")

audio_ready_labels = {
    "Audio proxy ready",
    "Audio proxy-safe",
    "Audio proxy missing",
    "Audio proxy pending",
    "Audio proxy blocked",
    "Audio proxy needed",
}

for lane in audio_lanes:
    name = lane.get("name", "")
    readiness = lane.get("sourceReadiness", "")
    if readiness not in audio_ready_labels:
        errors.append(f"{name}: unexpected audio readiness {readiness!r}")

summary = {
    "architectureReady": not errors,
    "productionReady": state.get("productionReady"),
    "productionReadinessDetail": state.get("productionReadinessDetail"),
    "visualRoughCutReady": state.get("visualRoughCutReady"),
    "visualRoughCutDetail": state.get("visualRoughCutDetail"),
    "videoProxyReadyCount": state.get("videoProxyReadyCount"),
    "audioReadyCount": state.get("audioReadyCount"),
    "audioBlockedCount": state.get("audioBlockedCount"),
    "proxyBlockedCount": state.get("proxyBlockedCount"),
    "showDecisionCount": state.get("showDecisionCount"),
    "skipDecisionCount": state.get("skipDecisionCount"),
    "validRangeCount": state.get("validRangeCount"),
    "sourceMonitorVideoCount": state.get("sourceMonitorVideoCount"),
}
print(json.dumps(summary, indent=2))

if errors:
    print("\nEpisode 1 editor architecture smoke FAILED:", file=sys.stderr)
    for error in errors:
        print(f"- {error}", file=sys.stderr)
    sys.exit(1)

print("\nEpisode 1 editor architecture smoke PASSED.")
PY
