#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
REPO_ROOT="$(cd "$ROOT_DIR/../.." && pwd)"
MEDIA_DIR="${EPISODE1_MEDIA_DIR:-/Volumes/My Passport/Episode 1}"
PACKET_PATH="${EPISODE1_PACKET_PATH:-$REPO_ROOT/content/quipsly/premiere-imports/episode-1.json}"
BASE_URL="${QUIPSLY_AGENT_URL:-http://127.0.0.1:8080}"
TEMP_START="${EPISODE1_DECISION_MATRIX_START:-61.5}"
TEMP_DURATION="${EPISODE1_DECISION_MATRIX_DURATION:-1.25}"

usage() {
  cat <<'USAGE'
Smoke Episode 1 live decision behavior matrix.

Usage:
  script/smoke_episode1_decision_behavior_matrix.sh [--no-build]

What this proves:
  - The native app is running and controllable through the local agent server.
  - Episode 1 loads as whole source lanes, not chopped clips.
  - Decision buttons/actions create metadata overlays only.
  - Charlie, Homer, Both, Skip, Charlie+Clip, and Homer+Clip behaviors add the
    expected SHOW/SKIP overlays for the lanes that overlap the requested span.
  - Source paths, proxy playback paths, lane count, and proxy readiness do not
    change while exercising those behaviors.
  - The baseline is restored after each behavior.

This is a visual/edit-decision smoke. Production readiness may remain false while
audio proxies are blocked.
USAGE
}

require_file() {
  local path="$1"
  if [[ ! -f "$path" ]]; then
    echo "Missing required file: $path" >&2
    exit 1
  fi
}

if [[ "${1:-}" == "-h" || "${1:-}" == "--help" ]]; then
  usage
  exit 0
fi

if [[ "${1:-}" != "--no-build" ]]; then
  "$ROOT_DIR/script/build_and_run.sh" --verify >/tmp/quipslystudio-smoke-decision-matrix-build.log
else
  curl --fail --silent --show-error "$BASE_URL/health" >/dev/null
fi

require_file "$PACKET_PATH"
require_file "$MEDIA_DIR/MVI_3999.MP4"
require_file "$MEDIA_DIR/NewHomerExport.MP4"
require_file "$MEDIA_DIR/First Pod Ever.wav"
require_file "$MEDIA_DIR/HomerAudio.wav"
require_file "$MEDIA_DIR/There is no try.mp4"

python3 - "$BASE_URL" "$PACKET_PATH" "$MEDIA_DIR" "$TEMP_START" "$TEMP_DURATION" <<'PY'
import json
import sys
import time
import urllib.parse
import urllib.request

base_url = sys.argv[1]
packet_path = sys.argv[2]
media_dir = sys.argv[3]
sequence_start = float(sys.argv[4])
sequence_duration = float(sys.argv[5])
sequence_end = sequence_start + sequence_duration

actions = [
    "charlie",
    "homer",
    "both",
    "skip",
    "charlie+clip",
    "homer+clip",
]

lane_paths = {
    "Charlie Camera - MVI_3999.MP4": f"{media_dir}/MVI_3999.MP4",
    "Homer Camera - NewHomerExport.MP4": f"{media_dir}/NewHomerExport.MP4",
    "Charlie Audio - First Pod Ever.wav": f"{media_dir}/First Pod Ever.wav",
    "Homer Audio - HomerAudio.wav": f"{media_dir}/HomerAudio.wav",
    "Reference Clip - There is no try.mp4": f"{media_dir}/There is no try.mp4",
}

def quote(value):
    return urllib.parse.quote(str(value), safe="")

def request(path):
    with urllib.request.urlopen(f"{base_url}{path}", timeout=8) as response:
        body = response.read().decode("utf-8")
    return json.loads(body) if body else {}

def load_baseline():
    request(f"/premiere_packet?path={quote(packet_path)}")
    for lane_name, lane_path in lane_paths.items():
        request(f"/relink_lane?lane_id={quote(lane_name)}&path={quote(lane_path)}&queue_proxy=0")
    request("/playback?mode=edit&action=set")
    time.sleep(0.4)
    return request("/state")

def lane_signature(state):
    return [
        {
            "name": lane.get("name", ""),
            "duration": lane.get("duration", 0),
            "sourceOffset": lane.get("sourceOffset", 0),
            "sourcePath": lane.get("sourcePath", ""),
            "playbackPath": lane.get("playbackPath", ""),
            "mediaKind": lane.get("mediaKind", ""),
            "role": lane.get("role", ""),
            "trackIds": lane.get("trackIds", []),
        }
        for lane in state.get("lanes", [])
    ]

def lane_matches(lane, category):
    role = str(lane.get("role", "") or "").lower()
    name = str(lane.get("name", "") or "").lower()

    if category == "charlie":
        return "charlie" in role or (not role and "charlie" in name)
    if category == "homer":
        return "homer" in role or (not role and "homer" in name)
    if category == "clip":
        return role in {"reference_clip", "source_clip"} or (not role and "clip" in name)
    return category in role or category in name

def intersects_requested_span(lane):
    offset = float(lane.get("sourceOffset", 0) or 0)
    duration = float(lane.get("duration", 0) or 0)
    local_start = max(0.0, sequence_start - offset)
    local_end = min(duration, sequence_end - offset)
    return (local_end - local_start) >= 0.05

def expected_delta(action, lanes):
    normalized = action.lower()
    active = 0
    cut = 0

    for lane in lanes:
        if not intersects_requested_span(lane):
            continue

        if normalized == "charlie":
            should_active = lane_matches(lane, "charlie")
            should_cut = not should_active
        elif normalized == "homer":
            should_active = lane_matches(lane, "homer")
            should_cut = not should_active
        elif normalized == "both":
            should_active = lane_matches(lane, "charlie") or lane_matches(lane, "homer")
            should_cut = False
        elif normalized in {"skip", "skipover"}:
            should_active = False
            should_cut = True
        elif normalized in {"charlieclip", "charlie+clip"}:
            should_active = lane_matches(lane, "charlie") or lane_matches(lane, "clip")
            should_cut = not should_active
        elif normalized in {"homerclip", "homer+clip"}:
            should_active = lane_matches(lane, "homer") or lane_matches(lane, "clip")
            should_cut = not should_active
        else:
            should_active = False
            should_cut = False

        if should_active:
            active += 1
        elif should_cut:
            cut += 1

    return active, cut

def expect(errors, label, actual, expected):
    if actual != expected:
        errors.append(f"{label}: expected {expected!r}, got {actual!r}")

results = []
errors = []
baseline = load_baseline()
baseline_signature = lane_signature(baseline)

for action in actions:
    before = load_baseline()
    active_delta, cut_delta = expected_delta(action, before.get("lanes", []))
    request(f"/decision?action={quote(action)}&start={quote(sequence_start)}&duration={quote(sequence_duration)}")
    time.sleep(0.5)
    after = request("/state")

    action_errors = []
    expect(action_errors, f"{action} visualRoughCutReady", after.get("visualRoughCutReady"), True)
    expect(action_errors, f"{action} productionReady changed", after.get("productionReady"), before.get("productionReady"))
    expect(action_errors, f"{action} laneCount", after.get("laneCount"), before.get("laneCount"))
    expect(action_errors, f"{action} sourceMonitorVideoCount", after.get("sourceMonitorVideoCount"), before.get("sourceMonitorVideoCount"))
    expect(action_errors, f"{action} videoProxyReadyCount", after.get("videoProxyReadyCount"), before.get("videoProxyReadyCount"))
    expect(action_errors, f"{action} source/proxy signature", lane_signature(after), lane_signature(before))
    expect(action_errors, f"{action} showDecisionCount", after.get("showDecisionCount"), before.get("showDecisionCount", 0) + active_delta)
    expect(action_errors, f"{action} skipDecisionCount", after.get("skipDecisionCount"), before.get("skipDecisionCount", 0) + cut_delta)

    expected_selected_type = "Cut" if active_delta == 0 and cut_delta > 0 else "Active"
    if active_delta > 0 or cut_delta > 0:
        expect(action_errors, f"{action} selectedTagType", after.get("selectedTagType"), expected_selected_type)
        if not after.get("selectedTagId"):
            action_errors.append(f"{action} selectedTagId: expected a selected decision")

    results.append({
        "action": action,
        "expectedShowDelta": active_delta,
        "expectedSkipDelta": cut_delta,
        "actualShowDelta": after.get("showDecisionCount", 0) - before.get("showDecisionCount", 0),
        "actualSkipDelta": after.get("skipDecisionCount", 0) - before.get("skipDecisionCount", 0),
        "selectedLaneName": after.get("selectedLaneName"),
        "selectedTagType": after.get("selectedTagType"),
        "errors": action_errors,
    })
    errors.extend(action_errors)

restored = load_baseline()
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
    expect(errors, f"restored {key}", restored.get(key), baseline.get(key))
expect(errors, "restored source/proxy signature", lane_signature(restored), baseline_signature)

summary = {
    "decisionBehaviorMatrixReady": not errors,
    "visualRoughCutReady": restored.get("visualRoughCutReady"),
    "productionReady": restored.get("productionReady"),
    "sequenceStart": sequence_start,
    "sequenceDuration": sequence_duration,
    "results": results,
    "restored": {
        "showDecisionCount": restored.get("showDecisionCount"),
        "skipDecisionCount": restored.get("skipDecisionCount"),
        "laneCount": restored.get("laneCount"),
        "sourceMonitorVideoCount": restored.get("sourceMonitorVideoCount"),
    },
}
print(json.dumps(summary, indent=2))

if errors:
    print("\nEpisode 1 decision behavior matrix FAILED:", file=sys.stderr)
    for error in errors:
        print(f"- {error}", file=sys.stderr)
    sys.exit(1)

print("\nEpisode 1 decision behavior matrix PASSED.")
PY
