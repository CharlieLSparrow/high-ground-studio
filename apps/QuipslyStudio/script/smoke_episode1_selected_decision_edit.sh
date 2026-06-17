#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
REPO_ROOT="$(cd "$ROOT_DIR/../.." && pwd)"
MEDIA_DIR="${EPISODE1_MEDIA_DIR:-/Volumes/My Passport/Episode 1}"
PACKET_PATH="${EPISODE1_PACKET_PATH:-$REPO_ROOT/content/quipsly/premiere-imports/episode-1.json}"
BASE_URL="${QUIPSLY_AGENT_URL:-http://127.0.0.1:8080}"
SMOKE_DIR="${TMPDIR:-/tmp}/quipslystudio-episode1-selected-decision-smoke"
COMMANDS_STATE="$SMOKE_DIR/commands.json"
BEFORE_STATE="$SMOKE_DIR/before.json"
SELECTED_STATE="$SMOKE_DIR/selected.json"
NUDGED_STATE="$SMOKE_DIR/nudged.json"
TRIMMED_STATE="$SMOKE_DIR/trimmed.json"
DELETED_STATE="$SMOKE_DIR/deleted.json"
RESTORED_STATE="$SMOKE_DIR/restored.json"
TARGET_ENV="$SMOKE_DIR/target.env"

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

python3 - "$BEFORE_STATE" > "$TARGET_ENV" <<'PY'
import json
import shlex
import sys
from pathlib import Path

state = json.loads(Path(sys.argv[1]).read_text())
for lane in state.get("lanes", []):
    if lane.get("sourceReadiness") != "Proxy ready":
        continue
    for tag in lane.get("tags", []):
        if tag.get("type") == "Active" and float(tag.get("duration", 0)) > 1.0:
            print(f"LANE_ID={shlex.quote(lane['id'])}")
            print(f"TAG_ID={shlex.quote(tag['id'])}")
            print(f"TAG_START={float(tag['startTime'])}")
            print(f"TAG_DURATION={float(tag['duration'])}")
            print(f"LANE_OFFSET={float(lane.get('sourceOffset', 0))}")
            print(f"LANE_NAME={shlex.quote(lane.get('name', ''))}")
            raise SystemExit(0)
raise SystemExit("No proxy-backed active decision with duration > 1s found")
PY
# shellcheck disable=SC1090
source "$TARGET_ENV"

get "/select_tag?lane_id=$(urlencode "$LANE_ID")&tag_id=$(urlencode "$TAG_ID")" >/dev/null
sleep 0.35
get "/state" > "$SELECTED_STATE"

get "/nudge_selected?delta=0.25" >/dev/null
sleep 0.5
get "/state" > "$NUDGED_STATE"

get "/trim_selected?start_delta=0.10&duration_delta=-0.10" >/dev/null
sleep 0.5
get "/state" > "$TRIMMED_STATE"

get "/delete_selected_tag" >/dev/null
sleep 0.5
get "/state" > "$DELETED_STATE"

load_episode1_baseline
cleanup_needed=0
sleep 0.5
get "/state" > "$RESTORED_STATE"

python3 - "$COMMANDS_STATE" "$BEFORE_STATE" "$SELECTED_STATE" "$NUDGED_STATE" "$TRIMMED_STATE" "$DELETED_STATE" "$RESTORED_STATE" "$TARGET_ENV" <<'PY'
import json
import sys
from pathlib import Path

commands = json.loads(Path(sys.argv[1]).read_text())
before = json.loads(Path(sys.argv[2]).read_text())
selected = json.loads(Path(sys.argv[3]).read_text())
nudged = json.loads(Path(sys.argv[4]).read_text())
trimmed = json.loads(Path(sys.argv[5]).read_text())
deleted = json.loads(Path(sys.argv[6]).read_text())
restored = json.loads(Path(sys.argv[7]).read_text())
target_text = Path(sys.argv[8]).read_text()

target = {}
for line in target_text.splitlines():
    if "=" not in line:
        continue
    key, value = line.split("=", 1)
    target[key] = value.strip("'")

lane_id = target["LANE_ID"]
tag_id = target["TAG_ID"]
tag_start = float(target["TAG_START"])
tag_duration = float(target["TAG_DURATION"])
lane_offset = float(target["LANE_OFFSET"])
lane_name = target.get("LANE_NAME", "")
errors = []
commands_blob = "\n".join(commands.get("commands", []))
for route in [
    "/select_tag?lane_id=<uuid-or-name>&tag_id=<uuid>",
    "/nudge_selected?delta=<seconds>",
    "/trim_selected?start_delta=<seconds>&duration_delta=<seconds>",
    "/delete_selected_tag",
]:
    if route not in commands_blob:
        errors.append(f"/commands does not advertise {route}")

def check(label, actual, expected):
    if actual != expected:
        errors.append(f"{label}: expected {expected!r}, got {actual!r}")

def near(label, actual, expected, tolerance=0.08):
    if actual is None or abs(float(actual) - expected) > tolerance:
        errors.append(f"{label}: expected near {expected}, got {actual!r}")

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

def stable_lane_signature(state):
    return [
        {
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

def tag_lookup(state):
    for lane in state.get("lanes", []):
        if lane.get("id") != lane_id:
            continue
        for tag in lane.get("tags", []):
            if tag.get("id") == tag_id:
                return tag
    return None

def stable_tag_lookup(state):
    for lane in state.get("lanes", []):
        if lane.get("name") != lane_name:
            continue
        for tag in lane.get("tags", []):
            if tag.get("type") != "Active":
                continue
            if abs(float(tag.get("startTime", -999)) - tag_start) < 0.08:
                return tag
    return None

baseline_signature = lane_signature(before)
stable_baseline_signature = stable_lane_signature(before)
for label, state in [
    ("selected", selected),
    ("nudged", nudged),
    ("trimmed", trimmed),
]:
    check(f"{label} productionReady", state.get("productionReady"), True)
    check(f"{label} laneCount", state.get("laneCount"), before.get("laneCount"))
    check(f"{label} sourceMonitorVideoCount", state.get("sourceMonitorVideoCount"), before.get("sourceMonitorVideoCount"))
    check(f"{label} videoProxyReadyCount", state.get("videoProxyReadyCount"), before.get("videoProxyReadyCount"))
    check(f"{label} rawVaultCount", state.get("rawVaultCount"), before.get("rawVaultCount"))
    check(f"{label} showDecisionCount", state.get("showDecisionCount"), before.get("showDecisionCount"))
    check(f"{label} skipDecisionCount", state.get("skipDecisionCount"), before.get("skipDecisionCount"))
    check(f"{label} whole-lane source/proxy signature", lane_signature(state), baseline_signature)

check("restored productionReady", restored.get("productionReady"), True)
check("restored laneCount", restored.get("laneCount"), before.get("laneCount"))
check("restored sourceMonitorVideoCount", restored.get("sourceMonitorVideoCount"), before.get("sourceMonitorVideoCount"))
check("restored videoProxyReadyCount", restored.get("videoProxyReadyCount"), before.get("videoProxyReadyCount"))
check("restored rawVaultCount", restored.get("rawVaultCount"), before.get("rawVaultCount"))
check("restored showDecisionCount", restored.get("showDecisionCount"), before.get("showDecisionCount"))
check("restored skipDecisionCount", restored.get("skipDecisionCount"), before.get("skipDecisionCount"))
check("restored stable whole-lane source/proxy signature", stable_lane_signature(restored), stable_baseline_signature)

check("deleted productionReady", deleted.get("productionReady"), True)
check("deleted laneCount", deleted.get("laneCount"), before.get("laneCount"))
check("deleted sourceMonitorVideoCount", deleted.get("sourceMonitorVideoCount"), before.get("sourceMonitorVideoCount"))
check("deleted videoProxyReadyCount", deleted.get("videoProxyReadyCount"), before.get("videoProxyReadyCount"))
check("deleted rawVaultCount", deleted.get("rawVaultCount"), before.get("rawVaultCount"))
check("deleted stable whole-lane source/proxy signature", stable_lane_signature(deleted), stable_baseline_signature)
check("deleted selectedTagId", deleted.get("selectedTagId"), "")
check("deleted selectedTagType", deleted.get("selectedTagType"), "")
check("deleted showDecisionCount", deleted.get("showDecisionCount"), before.get("showDecisionCount") - 1)
check("deleted skipDecisionCount", deleted.get("skipDecisionCount"), before.get("skipDecisionCount"))

for label, state in [("selected", selected), ("nudged", nudged), ("trimmed", trimmed)]:
    check(f"{label} selectedTagId", state.get("selectedTagId"), tag_id)
    check(f"{label} selectedLaneId", state.get("selectedLaneId"), lane_id)
    check(f"{label} selectedTagType", state.get("selectedTagType"), "Active")
    if not state.get("selectedTagLaneName"):
        errors.append(f"{label}: selectedTagLaneName missing")

near("selected selectedTagStart", selected.get("selectedTagStart"), tag_start)
near("selected selectedTagDuration", selected.get("selectedTagDuration"), tag_duration)
near("selected playhead", selected.get("playhead"), lane_offset + tag_start, tolerance=0.35)
near("nudged selectedTagStart", nudged.get("selectedTagStart"), tag_start + 0.25)
near("nudged selectedTagDuration", nudged.get("selectedTagDuration"), tag_duration)
near("trimmed selectedTagStart", trimmed.get("selectedTagStart"), tag_start + 0.35)
near("trimmed selectedTagDuration", trimmed.get("selectedTagDuration"), tag_duration - 0.10)

nudged_tag = tag_lookup(nudged)
trimmed_tag = tag_lookup(trimmed)
if nudged_tag is None:
    errors.append("nudged state no longer contains target tag")
else:
    near("nudged tag start in lane tags", nudged_tag.get("startTime"), tag_start + 0.25)
if trimmed_tag is None:
    errors.append("trimmed state no longer contains target tag")
else:
    near("trimmed tag start in lane tags", trimmed_tag.get("startTime"), tag_start + 0.35)
    near("trimmed tag duration in lane tags", trimmed_tag.get("duration"), tag_duration - 0.10)

# Baseline reload should remove the temporary nudge/trim changes.
restored_tag = stable_tag_lookup(restored)
if restored_tag is None:
    errors.append("restored state no longer contains target tag by stable lane/time")
else:
    near("restored tag start", restored_tag.get("startTime"), tag_start)
    near("restored tag duration", restored_tag.get("duration"), tag_duration)

summary = {
    "target": {
        "lane": lane_name,
        "laneId": lane_id,
        "tagId": tag_id,
        "start": tag_start,
        "duration": tag_duration,
    },
    "selected": {
        "selectedTagStart": selected.get("selectedTagStart"),
        "selectedTagDuration": selected.get("selectedTagDuration"),
        "playhead": selected.get("playhead"),
    },
    "nudged": {
        "selectedTagStart": nudged.get("selectedTagStart"),
        "selectedTagDuration": nudged.get("selectedTagDuration"),
    },
    "trimmed": {
        "selectedTagStart": trimmed.get("selectedTagStart"),
        "selectedTagDuration": trimmed.get("selectedTagDuration"),
    },
    "deleted": {
        "selectedTagId": deleted.get("selectedTagId"),
        "showDecisionCount": deleted.get("showDecisionCount"),
        "skipDecisionCount": deleted.get("skipDecisionCount"),
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
    print("\nEpisode 1 selected decision edit smoke FAILED:", file=sys.stderr)
    for error in errors:
        print(f"- {error}", file=sys.stderr)
    sys.exit(1)

print("\nEpisode 1 selected decision edit smoke PASSED.")
PY
