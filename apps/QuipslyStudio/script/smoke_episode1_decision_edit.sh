#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
REPO_ROOT="$(cd "$ROOT_DIR/../.." && pwd)"
MEDIA_DIR="${EPISODE1_MEDIA_DIR:-/Volumes/My Passport/Episode 1}"
PACKET_PATH="${EPISODE1_PACKET_PATH:-$REPO_ROOT/content/quipsly/premiere-imports/episode-1.json}"
STATE_PATH="${TMPDIR:-/tmp}/quipslystudio-episode1-decision-edit.json"
BASE_URL="${QUIPSLY_AGENT_URL:-http://127.0.0.1:8080}"

usage() {
  cat <<'USAGE'
Smoke Episode 1 non-destructive decision editing.

Usage:
  script/smoke_episode1_decision_edit.sh [--no-build]

What this proves:
  - Episode 1 loads as whole synced lanes, not chopped clips.
  - A temporary SHOW decision can be added to a proxy-backed source lane.
  - The temporary decision can be selected, nudged, trimmed, and deleted.
  - Decision counts return to the original values after cleanup.
  - Source lane/proxy paths remain unchanged throughout the edit.

This intentionally does not require audio proxies. Production readiness still
belongs to script/smoke_episode1_production_ready.sh.
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
  "$ROOT_DIR/script/build_and_run.sh" --verify >/tmp/quipslystudio-smoke-decision-edit-build.log
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

def wait_for(predicate, timeout=8):
    deadline = time.time() + timeout
    last = {}
    while time.time() < deadline:
        last = get_state()
        if predicate(last):
            return last
        time.sleep(0.25)
    return last

def q(value):
    return urllib.parse.quote(str(value))

errors = []
created_tag = None
target_lane_id = None

try:
    state = wait_for(lambda s: s.get("visualRoughCutReady") is True and s.get("sourcePlayerCount") == 3)
    if state.get("visualRoughCutReady") is not True:
        errors.append(f"visualRoughCutReady: expected true, got {state.get('visualRoughCutReady')!r}")
    if state.get("sourcePlayerCount") != 3:
        errors.append(f"sourcePlayerCount: expected 3, got {state.get('sourcePlayerCount')!r}")

    lanes = state.get("lanes", [])
    target_lane = next((lane for lane in lanes if lane.get("name", "").startswith("Charlie Camera")), None)
    if not target_lane:
        errors.append("Could not find Charlie Camera lane")
        raise RuntimeError("missing target lane")

    target_lane_id = target_lane["id"]
    original_lane_count = state.get("laneCount")
    original_show_count = state.get("showDecisionCount")
    original_skip_count = state.get("skipDecisionCount")
    original_valid_range_count = state.get("validRangeCount")
    original_source_path = target_lane.get("sourcePath", "")
    original_playback_path = target_lane.get("playbackPath", "")
    original_active_count = target_lane.get("activeCount")
    original_cut_count = target_lane.get("cutCount")

    temp_start = 123.456
    temp_duration = 0.789
    request(f"/edit?lane_id={q(target_lane_id)}&action=active&v1={q(temp_start)}&v2={q(temp_duration)}")

    state = wait_for(lambda s: s.get("showDecisionCount") == original_show_count + 1)
    if state.get("showDecisionCount") != original_show_count + 1:
        errors.append(f"after add showDecisionCount: expected {original_show_count + 1}, got {state.get('showDecisionCount')!r}")

    target_lane = next((lane for lane in state.get("lanes", []) if lane.get("id") == target_lane_id), None)
    if not target_lane:
        errors.append("Target lane disappeared after add")
        raise RuntimeError("target lane disappeared")

    if target_lane.get("activeCount") != original_active_count + 1:
        errors.append(f"after add activeCount: expected {original_active_count + 1}, got {target_lane.get('activeCount')!r}")

    created_tag = next(
        (
            tag for tag in target_lane.get("tags", [])
            if str(tag.get("type", "")).lower() == "active"
            and abs(float(tag.get("startTime", -999)) - temp_start) < 0.001
            and abs(float(tag.get("duration", -999)) - temp_duration) < 0.001
        ),
        None,
    )
    if not created_tag:
        errors.append("Could not find temporary SHOW decision after add")
        raise RuntimeError("temporary tag missing")

    request(f"/select_tag?lane_id={q(target_lane_id)}&tag_id={q(created_tag['id'])}")
    state = wait_for(lambda s: s.get("selectedTagId") == created_tag["id"])
    if state.get("selectedTagId") != created_tag["id"]:
        errors.append(f"selectedTagId: expected {created_tag['id']!r}, got {state.get('selectedTagId')!r}")

    request("/nudge_selected?delta=0.1")
    state = wait_for(lambda s: abs(float(s.get("selectedTagStart", -999)) - (temp_start + 0.1)) < 0.001)
    if abs(float(state.get("selectedTagStart", -999)) - (temp_start + 0.1)) >= 0.001:
        errors.append(f"selectedTagStart after nudge: expected {temp_start + 0.1:.3f}, got {state.get('selectedTagStart')!r}")

    request("/trim_selected?start_delta=0&duration_delta=0.2")
    state = wait_for(lambda s: abs(float(s.get("selectedTagDuration", -999)) - (temp_duration + 0.2)) < 0.001)
    if abs(float(state.get("selectedTagDuration", -999)) - (temp_duration + 0.2)) >= 0.001:
        errors.append(f"selectedTagDuration after trim: expected {temp_duration + 0.2:.3f}, got {state.get('selectedTagDuration')!r}")

    request("/delete_selected_tag")
    created_tag = None
    state = wait_for(lambda s: s.get("showDecisionCount") == original_show_count)
    if state.get("showDecisionCount") != original_show_count:
        errors.append(f"after delete showDecisionCount: expected {original_show_count}, got {state.get('showDecisionCount')!r}")
    if state.get("skipDecisionCount") != original_skip_count:
        errors.append(f"skipDecisionCount changed: expected {original_skip_count}, got {state.get('skipDecisionCount')!r}")
    if state.get("laneCount") != original_lane_count:
        errors.append(f"laneCount changed: expected {original_lane_count}, got {state.get('laneCount')!r}")
    if state.get("validRangeCount") != original_valid_range_count:
        errors.append(f"validRangeCount changed after cleanup: expected {original_valid_range_count}, got {state.get('validRangeCount')!r}")

    target_lane = next((lane for lane in state.get("lanes", []) if lane.get("id") == target_lane_id), None)
    if target_lane:
        if target_lane.get("sourcePath", "") != original_source_path:
            errors.append("sourcePath changed during decision edit")
        if target_lane.get("playbackPath", "") != original_playback_path:
            errors.append("playbackPath changed during decision edit")
        if target_lane.get("activeCount") != original_active_count:
            errors.append(f"activeCount after cleanup: expected {original_active_count}, got {target_lane.get('activeCount')!r}")
        if target_lane.get("cutCount") != original_cut_count:
            errors.append(f"cutCount after cleanup: expected {original_cut_count}, got {target_lane.get('cutCount')!r}")
    else:
        errors.append("Target lane missing after cleanup")

finally:
    if created_tag and target_lane_id:
        try:
            request(f"/select_tag?lane_id={q(target_lane_id)}&tag_id={q(created_tag['id'])}")
            time.sleep(0.2)
            request("/delete_selected_tag")
            time.sleep(0.5)
        except Exception as cleanup_error:
            errors.append(f"cleanup failed: {cleanup_error}")

state = get_state()
summary = {
    "decisionEditReady": not errors,
    "visualRoughCutReady": state.get("visualRoughCutReady"),
    "productionReady": state.get("productionReady"),
    "laneCount": state.get("laneCount"),
    "videoProxyReadyCount": state.get("videoProxyReadyCount"),
    "audioReadyCount": state.get("audioReadyCount"),
    "audioBlockedCount": state.get("audioBlockedCount"),
    "showDecisionCount": state.get("showDecisionCount"),
    "skipDecisionCount": state.get("skipDecisionCount"),
    "validRangeCount": state.get("validRangeCount"),
    "lastMediaAction": state.get("lastMediaAction"),
}
state_path.write_text(json.dumps(state, indent=2, sort_keys=True))
print(json.dumps(summary, indent=2))

if errors:
    print("\nEpisode 1 decision edit smoke FAILED:", file=sys.stderr)
    for error in errors:
        print(f"- {error}", file=sys.stderr)
    sys.exit(1)

print("\nEpisode 1 decision edit smoke PASSED.")
PY
