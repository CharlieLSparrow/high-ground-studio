#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
STATE_PATH="${TMPDIR:-/tmp}/quipslystudio-episode1-decision-map-state.json"
OUTPUT_MODE="text"
REQUIRE_VISUAL=0
EVENT_LIMIT=20

usage() {
  cat <<'USAGE'
Report the current Episode 1 edit-decision map without mutating the session.

Usage:
  script/report_episode1_decision_map.sh [--json] [--require-visual] [--event-limit N]

What this proves/exposes:
  - Source lanes stay whole.
  - SHOW/SKIP choices are metadata overlays.
  - Current edit decisions can be inspected outside the UI.
  - The visual rough-cut state is safe before anyone tries export/waveform work.

Options:
  --json            Emit the full structured decision map.
  --require-visual  Exit non-zero unless visualRoughCutReady is true.
  --event-limit N   Number of chronological events to show in text mode. Default: 20.
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
    --event-limit)
      EVENT_LIMIT="${2:-}"
      if [[ -z "$EVENT_LIMIT" ]]; then
        echo "--event-limit requires a number" >&2
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

python3 - "$STATE_PATH" "$OUTPUT_MODE" "$REQUIRE_VISUAL" "$EVENT_LIMIT" <<'PY'
import json
import sys
from collections import defaultdict
from pathlib import Path

state_path = Path(sys.argv[1])
output_mode = sys.argv[2]
require_visual = sys.argv[3] == "1"
try:
    event_limit = int(sys.argv[4])
except Exception:
    raise SystemExit("--event-limit must be an integer")

state = json.loads(state_path.read_text())
lanes = state.get("lanes", [])

lane_summaries = []
events = []
for lane in lanes:
    tags = lane.get("tags", []) or []
    active = [tag for tag in tags if tag.get("type") == "Active"]
    cuts = [tag for tag in tags if tag.get("type") == "Cut"]
    show_duration = sum(float(tag.get("duration") or 0) for tag in active)
    skip_duration = sum(float(tag.get("duration") or 0) for tag in cuts)
    summary = {
        "laneId": lane.get("id", ""),
        "laneName": lane.get("name", ""),
        "mediaKind": lane.get("mediaKind", ""),
        "role": lane.get("role", ""),
        "durationSeconds": lane.get("duration", 0),
        "sourcePath": lane.get("sourcePath", ""),
        "playbackPath": lane.get("playbackPath", ""),
        "readiness": lane.get("sourceReadiness", ""),
        "sourceReadinessDetail": lane.get("sourceReadinessDetail", ""),
        "showDecisionCount": len(active),
        "skipDecisionCount": len(cuts),
        "showDurationSeconds": round(show_duration, 3),
        "skipDurationSeconds": round(skip_duration, 3),
        "hasWholeSourcePath": bool(lane.get("sourcePath")),
        "hasProxyPlaybackPath": bool(lane.get("playbackPath")),
        "decisions": [
            {
                "id": tag.get("id", ""),
                "type": tag.get("type", ""),
                "startTime": tag.get("startTime", 0),
                "duration": tag.get("duration", 0),
            }
            for tag in tags
        ],
    }
    lane_summaries.append(summary)
    for tag in tags:
        events.append({
            "startTime": tag.get("startTime", 0),
            "duration": tag.get("duration", 0),
            "type": tag.get("type", ""),
            "laneName": lane.get("name", ""),
            "role": lane.get("role", ""),
            "mediaKind": lane.get("mediaKind", ""),
        })

events.sort(key=lambda item: (float(item.get("startTime") or 0), item.get("laneName", ""), item.get("type", "")))

counts_by_type = defaultdict(int)
for event in events:
    counts_by_type[event.get("type", "")] += 1

visual_ready = state.get("visualRoughCutReady") is True
production_ready = state.get("productionReady") is True

errors = []
if not lanes:
    errors.append("No lanes loaded.")
if state.get("sourceMonitorVideoCount") != 3:
    errors.append(f"Expected 3 source video monitors for Episode 1, got {state.get('sourceMonitorVideoCount')!r}.")
if state.get("videoProxyReadyCount") != 3:
    errors.append(f"Expected 3 video proxies ready, got {state.get('videoProxyReadyCount')!r}.")
if int(counts_by_type.get("Active", 0)) != int(state.get("showDecisionCount") or 0):
    errors.append("State showDecisionCount does not match lane Active tag count.")
if int(counts_by_type.get("Cut", 0)) != int(state.get("skipDecisionCount") or 0):
    errors.append("State skipDecisionCount does not match lane Cut tag count.")

report = {
    "projectTitle": state.get("projectTitle", ""),
    "sequenceTitle": state.get("sequenceTitle", ""),
    "architectureInvariant": "Whole source lanes plus SHOW/SKIP metadata overlays; no chopped clip import.",
    "visualRoughCutReady": visual_ready,
    "visualRoughCutDetail": state.get("visualRoughCutDetail", ""),
    "productionReady": production_ready,
    "productionReadinessDetail": state.get("productionReadinessDetail", ""),
    "playbackMode": state.get("playbackMode", ""),
    "counts": {
        "laneCount": state.get("laneCount", 0),
        "sourceMonitorVideoCount": state.get("sourceMonitorVideoCount", 0),
        "sourcePlayerCount": state.get("sourcePlayerCount", 0),
        "videoProxyReadyCount": state.get("videoProxyReadyCount", 0),
        "audioReadyCount": state.get("audioReadyCount", 0),
        "audioBlockedCount": state.get("audioBlockedCount", 0),
        "showDecisionCount": state.get("showDecisionCount", 0),
        "skipDecisionCount": state.get("skipDecisionCount", 0),
        "validRangeCount": state.get("validRangeCount", 0),
        "eventCount": len(events),
    },
    "decisionCountsByType": dict(sorted(counts_by_type.items())),
    "laneSummaries": lane_summaries,
    "events": events,
    "errors": errors,
    "safeForVisualDecisionEditing": visual_ready and not errors,
    "nextProductionBlocker": "Attach/generate full-length audio proxies." if not production_ready else "None reported.",
    "doNotDo": [
        "Do not create short media clips for each edit decision.",
        "Do not treat this decision map as destructive cuts.",
        "Do not use Premiere's clip fragmentation as the Quipsly model.",
    ],
}

if output_mode == "json":
    print(json.dumps(report, indent=2))
else:
    print("Episode 1 edit-decision map")
    print()
    print(f"Project: {report['projectTitle']}")
    print(f"Sequence: {report['sequenceTitle']}")
    print(f"Invariant: {report['architectureInvariant']}")
    print()
    print("Readiness:")
    print(f"  visualRoughCutReady: {visual_ready}")
    print(f"  productionReady: {production_ready}")
    print(f"  blocker: {report['nextProductionBlocker']}")
    print()
    print("Counts:")
    for key, value in report["counts"].items():
        print(f"  {key}: {value}")
    print()
    print("Lanes:")
    for lane in lane_summaries:
        print(f"  - {lane['laneName']}")
        print(f"    kind/role: {lane['mediaKind'] or 'unknown'} / {lane['role'] or 'unknown'}")
        print(f"    readiness: {lane['readiness']}")
        print(f"    decisions: SHOW {lane['showDecisionCount']} ({lane['showDurationSeconds']}s), SKIP {lane['skipDecisionCount']} ({lane['skipDurationSeconds']}s)")
    print()
    print(f"First {min(event_limit, len(events))} chronological decision event(s):")
    for event in events[:event_limit]:
        print(f"  - {float(event.get('startTime') or 0):8.3f}s  {event.get('type',''):6}  {float(event.get('duration') or 0):7.3f}s  {event.get('laneName','')}")
    if errors:
        print()
        print("Decision map warnings:")
        for error in errors:
            print(f"  - {error}")
    print()
    print("Do not do:")
    for item in report["doNotDo"]:
        print(f"  - {item}")

if require_visual and not report["safeForVisualDecisionEditing"]:
    raise SystemExit(1)
PY
