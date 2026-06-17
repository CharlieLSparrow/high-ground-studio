#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
STATE_PATH="${TMPDIR:-/tmp}/quipslystudio-episode1-output-plan-state.json"
OUTPUT_MODE="text"
REQUIRE_VISUAL=0
SEGMENT_LIMIT=30

usage() {
  cat <<'USAGE'
Build an Episode 1 output plan from the live QuipslyStudio decision state.

Usage:
  script/build_episode1_output_plan.sh [--json] [--require-visual] [--segment-limit N]

This does not render media and does not mutate the session. It converts whole
source lanes + SHOW/SKIP metadata overlays into a renderer/export contract:

  - Play Edit valid ranges, with skipped gaps removed.
  - Program-time segments split at camera/clip decision boundaries.
  - Source lane candidates for each output segment.
  - Production blockers that keep this from final export.

Options:
  --json             Emit structured JSON.
  --require-visual   Exit non-zero unless visual rough-cut readiness is true.
  --segment-limit N  Number of segments to show in text mode. Default: 30.
USAGE
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --json)
      OUTPUT_MODE="json"
      ;;
    --require-visual)
      REQUIRE_VISUAL=1
      ;;
    --segment-limit)
      SEGMENT_LIMIT="${2:-}"
      if [[ -z "$SEGMENT_LIMIT" ]]; then
        echo "--segment-limit requires a number" >&2
        exit 2
      fi
      shift
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

"$ROOT_DIR/script/agentctl.sh" state > "$STATE_PATH"

python3 - "$STATE_PATH" "$OUTPUT_MODE" "$REQUIRE_VISUAL" "$SEGMENT_LIMIT" <<'PY'
import json
import sys
from pathlib import Path

state = json.loads(Path(sys.argv[1]).read_text())
output_mode = sys.argv[2]
require_visual = sys.argv[3] == "1"
try:
    segment_limit = int(sys.argv[4])
except Exception:
    raise SystemExit("--segment-limit must be an integer")

EPSILON = 1e-6
VIDEO_ROLES = {"charlie_camera", "homer_camera", "reference_clip", "camera", "source_clip"}
SUPPORT_MEDIA_KINDS = {"audio"}


def as_float(value, fallback=0.0):
    try:
        return float(value)
    except Exception:
        return fallback


def merge_ranges(ranges):
    clean = []
    for start, end in ranges:
        start = as_float(start)
        end = as_float(end)
        if start + EPSILON < end:
            clean.append((start, end))
    if not clean:
        return []
    clean.sort(key=lambda item: item[0])
    merged = []
    for start, end in clean:
        if merged and merged[-1][1] + EPSILON >= start:
            merged[-1] = (merged[-1][0], max(merged[-1][1], end))
        else:
            merged.append((start, end))
    return merged


def subtract_ranges(ranges, cuts):
    remaining = list(ranges)
    for cut_start, cut_end in cuts:
        next_remaining = []
        for start, end in remaining:
            if cut_end <= start + EPSILON or cut_start >= end - EPSILON:
                next_remaining.append((start, end))
                continue
            left_end = min(cut_start, end)
            if start + EPSILON < left_end:
                next_remaining.append((start, left_end))
            right_start = max(cut_end, start)
            if right_start + EPSILON < end:
                next_remaining.append((right_start, end))
        remaining = next_remaining
        if not remaining:
            break
    return remaining


def overlaps(a_start, a_end, b_start, b_end):
    return a_start < b_end - EPSILON and b_start < a_end - EPSILON


def contained_boundary(boundary, valid_ranges):
    return any(start + EPSILON < boundary < end - EPSILON for start, end in valid_ranges)


def program_time(sequence_time, valid_ranges):
    p_time = 0.0
    for start, end in valid_ranges:
        if sequence_time < start:
            break
        if sequence_time <= end:
            p_time += sequence_time - start
            break
        p_time += end - start
    return p_time


lanes = state.get("lanes", [])
active_ranges = []
cut_ranges = []
normalized_lanes = []

for lane_index, lane in enumerate(lanes):
    source_offset = as_float(lane.get("sourceOffset", 0))
    lane_events = []
    for tag in lane.get("tags", []) or []:
        tag_type = tag.get("type", "")
        start = as_float(tag.get("startTime", 0)) + source_offset
        end = start + as_float(tag.get("duration", 0))
        if start + EPSILON >= end:
            continue
        event = {
            "id": tag.get("id", ""),
            "type": tag_type,
            "sequenceStart": round(start, 6),
            "sequenceEnd": round(end, 6),
            "duration": round(end - start, 6),
        }
        lane_events.append(event)
        if tag_type == "Active":
            active_ranges.append((start, end))
        elif tag_type == "Cut":
            cut_ranges.append((start, end))
    normalized_lanes.append({
        "laneIndex": lane_index,
        "laneId": lane.get("id", ""),
        "laneName": lane.get("name", ""),
        "mediaKind": lane.get("mediaKind", ""),
        "role": lane.get("role", ""),
        "readiness": lane.get("sourceReadiness", ""),
        "sourceOffset": source_offset,
        "sourcePath": lane.get("sourcePath", ""),
        "playbackPath": lane.get("playbackPath", ""),
        "events": lane_events,
    })

valid_ranges = subtract_ranges(merge_ranges(active_ranges), merge_ranges(cut_ranges))

boundaries = set()
for start, end in valid_ranges:
    boundaries.add(round(start, 6))
    boundaries.add(round(end, 6))
for lane in normalized_lanes:
    for event in lane["events"]:
        boundary_start = event["sequenceStart"]
        boundary_end = event["sequenceEnd"]
        if contained_boundary(boundary_start, valid_ranges):
            boundaries.add(round(boundary_start, 6))
        if contained_boundary(boundary_end, valid_ranges):
            boundaries.add(round(boundary_end, 6))

sorted_boundaries = sorted(boundaries)
segments = []
for index in range(max(0, len(sorted_boundaries) - 1)):
    start = sorted_boundaries[index]
    end = sorted_boundaries[index + 1]
    if start + EPSILON >= end:
        continue
    if not any(valid_start - EPSILON <= start and end <= valid_end + EPSILON for valid_start, valid_end in valid_ranges):
        continue

    visible = []
    support = []
    for lane in normalized_lanes:
        active_events = [event for event in lane["events"] if event["type"] == "Active" and overlaps(start, end, event["sequenceStart"], event["sequenceEnd"])]
        if not active_events:
            continue
        candidate = {
            "laneIndex": lane["laneIndex"],
            "laneId": lane["laneId"],
            "laneName": lane["laneName"],
            "mediaKind": lane["mediaKind"],
            "role": lane["role"],
            "readiness": lane["readiness"],
            "sourceOffset": round(lane["sourceOffset"], 6),
            "sourceIn": round(start - lane["sourceOffset"], 6),
            "sourceOut": round(end - lane["sourceOffset"], 6),
            "playbackPath": lane["playbackPath"],
            "sourcePath": lane["sourcePath"],
            "activeDecisionIds": [event["id"] for event in active_events],
        }
        if lane["mediaKind"].lower() in SUPPORT_MEDIA_KINDS or "audio" in lane["role"].lower():
            support.append(candidate)
        else:
            visible.append(candidate)

    program_start = program_time(start, valid_ranges)
    segment = {
        "index": len(segments),
        "sequenceStart": round(start, 6),
        "sequenceEnd": round(end, 6),
        "programStart": round(program_start, 6),
        "programEnd": round(program_start + (end - start), 6),
        "duration": round(end - start, 6),
        "visibleVideoCandidates": visible,
        "supportCandidates": support,
        "primaryVideoLane": visible[0]["laneName"] if visible else "",
    }
    segments.append(segment)

program_duration = sum(end - start for start, end in valid_ranges)
video_segments_without_visible = [segment for segment in segments if not segment["visibleVideoCandidates"]]
blocked_lanes = [lane for lane in normalized_lanes if "ready" not in lane["readiness"].lower()]

errors = []
if state.get("visualRoughCutReady") is not True:
    errors.append("visualRoughCutReady is not true")
if not valid_ranges:
    errors.append("Play Edit has no valid ranges")
if not segments:
    errors.append("No output segments were built")
if video_segments_without_visible:
    errors.append(f"{len(video_segments_without_visible)} output segment(s) have no visible video candidate")
if int(state.get("sourceMonitorVideoCount") or 0) < 1:
    errors.append("No source video monitors are available")

report = {
    "projectTitle": state.get("projectTitle", ""),
    "sequenceTitle": state.get("sequenceTitle", ""),
    "architectureInvariant": "Output plan is derived from whole source lanes plus SHOW/SKIP metadata overlays; it is not a chopped media timeline.",
    "visualRoughCutReady": state.get("visualRoughCutReady") is True,
    "productionReady": state.get("productionReady") is True,
    "productionReadinessDetail": state.get("productionReadinessDetail", ""),
    "playbackMode": "Play Edit",
    "counts": {
        "laneCount": state.get("laneCount", 0),
        "sourceMonitorVideoCount": state.get("sourceMonitorVideoCount", 0),
        "videoProxyReadyCount": state.get("videoProxyReadyCount", 0),
        "audioReadyCount": state.get("audioReadyCount", 0),
        "audioBlockedCount": state.get("audioBlockedCount", 0),
        "showDecisionCount": state.get("showDecisionCount", 0),
        "skipDecisionCount": state.get("skipDecisionCount", 0),
        "validRangeCount": len(valid_ranges),
        "outputSegmentCount": len(segments),
        "programDurationSeconds": round(program_duration, 6),
    },
    "validRanges": [
        {"sequenceStart": round(start, 6), "sequenceEnd": round(end, 6), "duration": round(end - start, 6), "programStart": round(program_time(start, valid_ranges), 6)}
        for start, end in valid_ranges
    ],
    "segments": segments,
    "blockedLanes": blocked_lanes,
    "errors": errors,
    "safeForVisualOutputPlan": not errors,
    "finalExportBlockedReason": "None reported." if state.get("productionReady") is True else state.get("productionReadinessDetail", "Production readiness is false."),
    "doNotDo": [
        "Do not turn output segments into physical source clips.",
        "Do not render from raw external originals when proxy playback is available.",
        "Do not ignore audio proxy readiness for final production export.",
    ],
}

if output_mode == "json":
    print(json.dumps(report, indent=2))
else:
    print("Episode 1 Play Edit output plan")
    print()
    print(f"Project: {report['projectTitle']}")
    print(f"Sequence: {report['sequenceTitle']}")
    print(f"Invariant: {report['architectureInvariant']}")
    print()
    print("Counts:")
    for key, value in report["counts"].items():
        print(f"  {key}: {value}")
    print()
    print(f"Final export blocker: {report['finalExportBlockedReason']}")
    print()
    print(f"First {min(segment_limit, len(segments))} output segment(s):")
    for segment in segments[:segment_limit]:
        visible = ", ".join(candidate["laneName"] for candidate in segment["visibleVideoCandidates"]) or "NO VISIBLE VIDEO"
        support = ", ".join(candidate["laneName"] for candidate in segment["supportCandidates"]) or "no support candidates"
        print(f"  - P {segment['programStart']:8.3f}-{segment['programEnd']:8.3f}s | S {segment['sequenceStart']:8.3f}-{segment['sequenceEnd']:8.3f}s | {segment['duration']:7.3f}s")
        print(f"    video: {visible}")
        print(f"    support: {support}")
    if errors:
        print()
        print("Output plan warnings:")
        for error in errors:
            print(f"  - {error}")
    print()
    print("Do not do:")
    for item in report["doNotDo"]:
        print(f"  - {item}")

if require_visual and not report["safeForVisualOutputPlan"]:
    raise SystemExit(1)
PY
