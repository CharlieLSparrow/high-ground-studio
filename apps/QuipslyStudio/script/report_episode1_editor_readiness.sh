#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
STATE_PATH="${TMPDIR:-/tmp}/quipslystudio-episode1-readiness-state.json"
PREFLIGHT_PATH="${TMPDIR:-/tmp}/quipslystudio-episode1-readiness-preflight.json"
PREFLIGHT_ERR="${TMPDIR:-/tmp}/quipslystudio-episode1-readiness-preflight.err"
OUTPUT_MODE="text"
REQUIRE_PRODUCTION=0
DEEP_PREFLIGHT=0

usage() {
  cat <<'USAGE'
Report Episode 1 editor readiness without mutating the session.

Usage:
  script/report_episode1_editor_readiness.sh [--json] [--require-production]

What this reports:
  - Whether visual rough-cut editing is safe from local video proxies.
  - Whether final production editing/export is ready.
  - Which lanes are blocked and exactly what recovery action is next.

Options:
  --json                Emit structured JSON instead of human text.
  --require-production  Exit non-zero unless productionReady is true.
  --deep-preflight      Use the full preflight read timeout instead of the fast dashboard timeout.

Environment overrides are inherited from agentctl/preflight:
  QUIPSLY_AGENT_URL=http://127.0.0.1:8080
  EPISODE1_MEDIA_DIR=/Volumes/My Passport/Episode 1
  EPISODE1_AUDIO_DIR=/readable/audio/folder
USAGE
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --json)
      OUTPUT_MODE="json"
      ;;
    --require-production)
      REQUIRE_PRODUCTION=1
      ;;
    --deep-preflight)
      DEEP_PREFLIGHT=1
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

set +e
if [[ "$DEEP_PREFLIGHT" == "1" ]]; then
  "$ROOT_DIR/script/preflight_episode1_media.sh" > "$PREFLIGHT_PATH" 2> "$PREFLIGHT_ERR"
else
  EPISODE1_READ_TIMEOUT_SECONDS="${EPISODE1_READINESS_TIMEOUT_SECONDS:-1}" "$ROOT_DIR/script/preflight_episode1_media.sh" > "$PREFLIGHT_PATH" 2> "$PREFLIGHT_ERR"
fi
preflight_rc=$?
set -e

python3 - "$STATE_PATH" "$PREFLIGHT_PATH" "$PREFLIGHT_ERR" "$preflight_rc" "$OUTPUT_MODE" "$REQUIRE_PRODUCTION" <<'PY'
import json
import pathlib
import sys

state_path = pathlib.Path(sys.argv[1])
preflight_path = pathlib.Path(sys.argv[2])
preflight_err_path = pathlib.Path(sys.argv[3])
preflight_rc = int(sys.argv[4])
output_mode = sys.argv[5]
require_production = sys.argv[6] == "1"

state = json.loads(state_path.read_text())
try:
    preflight = json.loads(preflight_path.read_text())
except Exception as error:
    preflight = {
        "parseError": f"{type(error).__name__}: {error}",
        "stderr": preflight_err_path.read_text() if preflight_err_path.exists() else "",
        "results": [],
        "nextActions": ["Preflight output could not be parsed. Rerun script/preflight_episode1_media.sh directly."],
    }

lanes = state.get("lanes", [])
blocked_lanes = []
ready_lanes = []
for lane in lanes:
    name = lane.get("name", "")
    readiness = lane.get("sourceReadiness", "")
    item = {
        "name": name,
        "kind": lane.get("mediaKind", ""),
        "role": lane.get("role", ""),
        "readiness": readiness,
        "detail": lane.get("sourceReadinessDetail", ""),
        "playbackPath": lane.get("playbackPath", ""),
        "sourcePath": lane.get("sourcePath", ""),
    }
    if "ready" in readiness.lower():
        ready_lanes.append(item)
    else:
        blocked_lanes.append(item)

blocked_files = []
if preflight.get("parseError"):
    blocked_files.append({
        "label": "Episode 1 preflight",
        "kind": "diagnostic",
        "path": str(preflight_path),
        "exists": preflight_path.exists(),
        "readableWithinTimeout": False,
        "readError": preflight.get("parseError", ""),
        "matchingLaneReadiness": "Preflight failed",
        "expectedProxyPath": "",
        "verdict": "preflight_failed",
    })
for item in preflight.get("results", []):
    verdict = item.get("verdict", "")
    if verdict not in {"readable", "proxy_ready_source_slow"}:
        blocked_files.append({
            "label": item.get("label", ""),
            "kind": item.get("kind", ""),
            "path": item.get("path", ""),
            "exists": item.get("exists"),
            "readableWithinTimeout": item.get("readableWithinTimeout"),
            "readError": item.get("readError", ""),
            "matchingLaneReadiness": item.get("matchingLaneReadiness", ""),
            "expectedProxyPath": item.get("matchingLanePlaybackPath", ""),
            "verdict": verdict,
        })

visual_ready = state.get("visualRoughCutReady") is True
production_ready = state.get("productionReady") is True
if production_ready:
    status = "production_ready"
elif visual_ready:
    status = "visual_ready_production_blocked"
else:
    status = "not_ready"

safe_now = []
if visual_ready:
    safe_now.extend([
        "Review Episode 1 visually from local video proxies.",
        "Use Play Edit to skip inactive gaps without deleting source media.",
        "Use Play Through to inspect the full synced source timeline.",
        "Adjust SHOW/SKIP/camera decisions as metadata overlays.",
    ])
if production_ready:
    safe_now.append("Proceed to waveform, sync-review, and production/export validation.")

do_not_do = [
    "Do not import Premiere-style chopped clips.",
    "Do not switch preview playback to giant raw originals.",
    "Do not treat existing-but-unreadable sources as production-ready.",
]

next_actions = list(preflight.get("nextActions", []))
if status == "visual_ready_production_blocked" and not next_actions:
    next_actions.append("Attach or generate full-length audio proxies, then rerun production readiness smoke.")

report = {
    "status": status,
    "projectTitle": state.get("projectTitle", ""),
    "sequenceTitle": state.get("sequenceTitle", ""),
    "visualRoughCutReady": visual_ready,
    "visualRoughCutDetail": state.get("visualRoughCutDetail", ""),
    "productionReady": production_ready,
    "productionReadinessDetail": state.get("productionReadinessDetail", ""),
    "preflightReturnCode": preflight_rc,
    "counts": {
        "laneCount": state.get("laneCount", 0),
        "sourceMonitorVideoCount": state.get("sourceMonitorVideoCount", 0),
        "videoProxyReadyCount": state.get("videoProxyReadyCount", 0),
        "audioReadyCount": state.get("audioReadyCount", 0),
        "audioBlockedCount": state.get("audioBlockedCount", 0),
        "showDecisionCount": state.get("showDecisionCount", 0),
        "skipDecisionCount": state.get("skipDecisionCount", 0),
        "validRangeCount": state.get("validRangeCount", 0),
    },
    "safeNow": safe_now,
    "blockedLanes": blocked_lanes,
    "blockedFiles": blocked_files,
    "nextActions": next_actions,
    "doNotDo": do_not_do,
}

if output_mode == "json":
    print(json.dumps(report, indent=2))
else:
    title = {
        "production_ready": "Episode 1 is production-ready.",
        "visual_ready_production_blocked": "Episode 1 is safe for visual rough-cut editing; production is blocked.",
        "not_ready": "Episode 1 is not ready yet.",
    }[status]
    print(title)
    print()
    print(f"Project: {report['projectTitle']}")
    print(f"Sequence: {report['sequenceTitle']}")
    print()
    print("Counts:")
    for key, value in report["counts"].items():
        print(f"  {key}: {value}")
    print()
    print("Safe now:")
    if safe_now:
        for item in safe_now:
            print(f"  - {item}")
    else:
        print("  - Nothing yet. Load/relink media first.")
    print()
    print("Blocking production:")
    if blocked_files:
        for item in blocked_files:
            print(f"  - {item['label']}: {item['verdict']} ({item['readError'] or item['matchingLaneReadiness']})")
            if item.get("expectedProxyPath"):
                print(f"    expected proxy: {item['expectedProxyPath']}")
    elif blocked_lanes:
        for item in blocked_lanes:
            print(f"  - {item['name']}: {item['readiness']} ({item['detail']})")
    else:
        print("  - No blocking lanes reported.")
    print()
    print("Next actions:")
    for action in next_actions:
        print(f"  - {action}")
    print()
    print("Do not do:")
    for item in do_not_do:
        print(f"  - {item}")

if require_production and not production_ready:
    raise SystemExit(1)

raise SystemExit(0)
PY
