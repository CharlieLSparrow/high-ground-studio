#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BASE_URL="${QUIPSLY_AGENT_URL:-http://127.0.0.1:8080}"
SESSION_NAME="${QUIPSLY_EPISODE1_SESSION:-episode-1-premiere-rescue}"
OUTPUT_DIR="${QUIPSLY_SHORT_EXPORT_SMOKE_DIR:-/tmp/quipslystudio-short-export-smoke}"
NO_BUILD=0

usage() {
  cat <<'USAGE'
Smoke Episode 1 selected-short 9:16 export.

Usage:
  script/smoke_episode1_short_export.sh [--no-build] [--session <name>] [--output <directory>]

This proves:
  - A production-ready Episode 1 session can create a temporary 9:16 short recipe from an existing SHOW decision.
  - The selected short can be exported to a derivative MP4.
  - The exported file exists and is non-empty.
  - Source media remains whole; the temporary short recipe is removed after the smoke.
USAGE
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --no-build)
      NO_BUILD=1
      ;;
    --session)
      SESSION_NAME="${2:-}"
      shift
      ;;
    --output)
      OUTPUT_DIR="${2:-}"
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

if [[ -z "$SESSION_NAME" || -z "$OUTPUT_DIR" ]]; then
  echo "Missing session or output directory." >&2
  usage >&2
  exit 2
fi

mkdir -p "$OUTPUT_DIR"

if [[ "$NO_BUILD" == "1" ]]; then
  "$ROOT_DIR/script/agentctl.sh" health >/dev/null
else
  "$ROOT_DIR/script/build_and_run.sh" --verify >/tmp/quipslystudio-episode1-short-export-build.log
fi

"$ROOT_DIR/script/agentctl.sh" load-session "$SESSION_NAME" >/tmp/quipslystudio-episode1-short-export-load.json

python3 - "$BASE_URL" "$SESSION_NAME" "$OUTPUT_DIR" <<'PY'
import json
import os
import sys
import time
import urllib.parse
import urllib.request

base_url = sys.argv[1].rstrip("/")
session_name = sys.argv[2]
output_dir = sys.argv[3]
errors = []
created_id = None


def get_json(path, timeout=30):
    with urllib.request.urlopen(f"{base_url}{path}", timeout=timeout) as response:
        return json.loads(response.read().decode("utf-8"))


def command(path, timeout=30):
    return get_json(path, timeout=timeout)


def wait_for(predicate, timeout=20, interval=0.25):
    deadline = time.time() + timeout
    last = {}
    while time.time() < deadline:
        last = get_json("/state")
        if predicate(last):
            return last
        time.sleep(interval)
    return last


def remove_created():
    global created_id
    if created_id:
        try:
            command("/shorts_queue_remove?id=" + urllib.parse.quote(created_id))
        except Exception as exc:
            print(f"Warning: could not remove temporary short {created_id}: {exc}", file=sys.stderr)


def choose_show_range(state):
    lanes = state.get("lanes") or []
    candidates = []
    for lane in lanes:
        if lane.get("mediaKind") == "audio" or "audio" in (lane.get("role") or "").lower():
            continue
        if not lane.get("sourceMonitorPlayerReady") and not lane.get("sourceReady"):
            continue
        readiness = f"{lane.get('sourceReadiness') or ''} {lane.get('sourceReadinessDetail') or ''}".lower()
        if "proxy ready" not in readiness and lane.get("sourceReady") is not True:
            continue
        role = (lane.get("role") or "").lower()
        name = lane.get("name") or ""
        lane_priority = 0 if "camera" in role else 1
        offset = float(lane.get("sourceOffset") or 0)
        for tag in lane.get("tags") or []:
            if str(tag.get("type") or "").lower() != "active":
                continue
            duration = float(tag.get("duration") or 0)
            if duration < 2.5:
                continue
            # Timeline decisions store lane-local time. Short recipes use
            # sequence time, matching PlaybackEngine.computeValidRanges().
            start = offset + float(tag.get("startTime") or 0) + 0.25
            if start < 0:
                continue
            export_duration = min(3.0, max(1.0, duration - 0.5))
            candidates.append((lane_priority, start, start + export_duration, name, tag.get("id")))
    candidates.sort(key=lambda item: (item[0], item[1]))
    if not candidates:
        return None
    _, start, end, lane_name, tag_id = candidates[0]
    return start, end, lane_name, tag_id


def wait_for_export(timeout=180):
    deadline = time.time() + timeout
    last = {}
    while time.time() < deadline:
        last = get_json("/state", timeout=30)
        export_state = last.get("exportState") or {}
        status = export_state.get("status") or last.get("exportStatus")
        if status in ("completed", "failed", "blocked", "stalled"):
            return last
        time.sleep(1)
    return last


try:
    state = wait_for(
        lambda s: s.get("activeSessionName") == session_name and s.get("productionReady") is True,
        timeout=30,
    )
    if state.get("activeSessionName") != session_name:
        errors.append(f"activeSessionName expected {session_name!r}, got {state.get('activeSessionName')!r}")
    if state.get("productionReady") is not True:
        errors.append(f"Episode 1 should be production-ready for short export, got {state.get('productionReady')!r}: {state.get('productionReadinessDetail')}")

    chosen = choose_show_range(state)
    if not chosen:
        errors.append("Could not find a playable SHOW decision to use as an export source.")

    if errors:
        print("Episode 1 selected-short export smoke failed before export:", file=sys.stderr)
        for error in errors:
            print(f"- {error}", file=sys.stderr)
        print(json.dumps({
            "state": {
                "activeSessionName": state.get("activeSessionName"),
                "productionReady": state.get("productionReady"),
                "productionReadinessDetail": state.get("productionReadinessDetail"),
                "laneCount": state.get("laneCount"),
                "videoProxyReadyCount": state.get("videoProxyReadyCount"),
                "audioReadyCount": state.get("audioReadyCount"),
                "showDecisionCount": state.get("showDecisionCount"),
                "skipDecisionCount": state.get("skipDecisionCount"),
            }
        }, indent=2, sort_keys=True), file=sys.stderr)
        raise SystemExit(1)

    start, end, lane_name, tag_id = chosen
    title = "Codex smoke exported short"
    basename = "codex-smoke-episode1-short"
    command(
        "/shorts_queue_add_range?start="
        + urllib.parse.quote(f"{start:.3f}")
        + "&end="
        + urllib.parse.quote(f"{end:.3f}")
        + "&title="
        + urllib.parse.quote(title)
    )
    state = wait_for(
        lambda s: (s.get("selectedShortProof") or {}).get("title") == title,
        timeout=12,
    )
    proof = state.get("selectedShortProof") or {}
    created_id = proof.get("id") or state.get("selectedShortClipId")

    if proof.get("recipeDuration", 0) <= 0:
        errors.append(f"Temporary selected short has no renderable duration: {proof}")

    command(
        "/shorts_export_selected?directory="
        + urllib.parse.quote(output_dir)
        + "&basename="
        + urllib.parse.quote(basename),
        timeout=30,
    )
    state = wait_for_export()
    export_state = state.get("exportState") or {}
    status = export_state.get("status") or state.get("exportStatus")
    if status != "completed":
        errors.append(f"Short export should complete, got {status!r}: {export_state}")

    output_paths = export_state.get("outputPaths") or state.get("exportOutputPaths") or []
    if not output_paths:
        single = export_state.get("outputPath")
        if single:
            output_paths = [single]
    existing_outputs = [
        path for path in output_paths
        if isinstance(path, str) and os.path.exists(path) and os.path.getsize(path) > 0
    ]
    if not existing_outputs:
        expected_path = os.path.join(output_dir, basename + "-9x16-short.mp4")
        if os.path.exists(expected_path) and os.path.getsize(expected_path) > 0:
            existing_outputs = [expected_path]
    if not existing_outputs:
        errors.append(f"No non-empty MP4 output found. outputPaths={output_paths!r}")

    if errors:
        print("Episode 1 selected-short export smoke failed:", file=sys.stderr)
        for error in errors:
            print(f"- {error}", file=sys.stderr)
        print(json.dumps({
            "chosenRange": {
                "start": start,
                "end": end,
                "laneName": lane_name,
                "tagId": tag_id,
            },
            "selectedShortProof": proof,
            "exportState": export_state,
            "outputPaths": output_paths,
        }, indent=2, sort_keys=True), file=sys.stderr)
        raise SystemExit(1)

    print(json.dumps({
        "status": "pass",
        "session": session_name,
        "selectedShortProof": {
            "title": proof.get("title"),
            "recipeModel": proof.get("recipeModel"),
            "timeBase": proof.get("timeBase"),
            "timelineRailVisible": proof.get("timelineRailVisible"),
            "recipeDuration": proof.get("recipeDuration"),
        },
        "chosenShowRange": {
            "start": round(start, 3),
            "end": round(end, 3),
            "laneName": lane_name,
            "tagId": tag_id,
        },
        "outputPaths": existing_outputs,
        "architectureInvariant": "9:16 shorts export as derivative files from metadata recipes over whole proxy-backed source lanes."
    }, indent=2, sort_keys=True))
finally:
    remove_created()
PY
