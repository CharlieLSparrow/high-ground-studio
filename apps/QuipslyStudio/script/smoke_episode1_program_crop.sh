#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
NO_BUILD=false

usage() {
  cat <<'USAGE'
Smoke Episode 1 program crop metadata.

Usage:
  script/smoke_episode1_program_crop.sh [--no-build]

This proves framing is editable without touching source media:
  - load Episode 1
  - find an existing visible video SHOW moment
  - switch to 9:16
  - set selected-lane baseline crop metadata
  - apply a human/Codex fast framing baseline preset
  - write a crop keyframe at the shared playhead
  - apply a human/Codex fast framing keyframe preset
  - nudge the crop keyframe with a delta command
  - verify /state echoes crop and keyframe truth
  - reset baseline crop and clear smoke keyframes
USAGE
}

for arg in "$@"; do
  case "$arg" in
    --no-build)
      NO_BUILD=true
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      usage >&2
      exit 2
      ;;
  esac
done

if [[ "$NO_BUILD" == false ]]; then
  "$ROOT_DIR/script/build_and_run.sh" --verify >/tmp/quipslystudio-program-crop-build.log
fi

python3 - "$ROOT_DIR" <<'PY'
import json
import math
import subprocess
import sys
import time

root_dir = sys.argv[1]
agentctl = f"{root_dir}/script/agentctl.sh"

def get_json(*args):
    result = subprocess.run([agentctl, *args], text=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE, check=False)
    if result.returncode != 0:
        raise SystemExit(result.stdout + result.stderr)
    return json.loads(result.stdout)

def run_command(*args):
    result = subprocess.run([agentctl, *args], text=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE, check=False)
    if result.returncode != 0:
        raise SystemExit(result.stdout + result.stderr)
    return result.stdout

def wait_for(predicate, timeout_seconds=12, interval_seconds=0.25):
    deadline = time.time() + timeout_seconds
    latest = {}
    while time.time() <= deadline:
        latest = get_json("state")
        if predicate(latest):
            return latest
        time.sleep(interval_seconds)
    return latest

def run_and_wait_processed(*args, timeout_seconds=12):
    before = get_json("state")
    target_serial = int(before.get("agentCommandSerial") or 0) + 1
    run_command(*args)
    return wait_for(
        lambda payload: int(payload.get("agentLastProcessedCommandSerial") or 0) >= target_serial,
        timeout_seconds=timeout_seconds,
    )

def close_enough(actual, expected, tolerance=0.015):
    try:
        return abs(float(actual) - expected) <= tolerance
    except Exception:
        return False

errors = []

run_and_wait_processed("load-session", "episode-1-premiere-rescue", timeout_seconds=14)
state = wait_for(
    lambda payload: payload.get("activeSessionName") == "episode-1-premiere-rescue"
    and payload.get("productionReady") is True,
    timeout_seconds=14,
)
if state.get("activeSessionName") != "episode-1-premiere-rescue":
    raise SystemExit("Episode 1 session did not load before program crop smoke.")

visible = None
for index in range(80):
    mode = "first_video" if index == 0 else "next_video"
    state = run_and_wait_processed("select-decision", mode, timeout_seconds=8)
    active_lanes = (state.get("programLayout") or {}).get("activeVisualLanes") or []
    if active_lanes:
        visible = state
        break

if not visible:
    raise SystemExit("No visible video SHOW decision found for program crop smoke.")

run_and_wait_processed("format", "9:16", timeout_seconds=8)
state = wait_for(lambda payload: (payload.get("programLayout") or {}).get("format") == "9:16", timeout_seconds=8)
active_lanes = (state.get("programLayout") or {}).get("activeVisualLanes") or []
if not active_lanes:
    raise SystemExit("No active visual lane in 9:16 layout for program crop smoke.")

lane = active_lanes[0]
lane_id = lane.get("id") or lane.get("name")
sequence_time = float(state.get("playhead") or 0)
if not lane_id:
    raise SystemExit("Active visual lane did not expose an id or name.")

# Start clean for this proof lane/format.
run_and_wait_processed("program-crop-clear-keyframes", lane_id, "9:16", timeout_seconds=8)
run_and_wait_processed("program-crop", lane_id, "9:16", "0.18", "-0.12", "1.35", timeout_seconds=8)
state = wait_for(
    lambda payload: close_enough(((payload.get("selectedProgramCrop") or {}).get("panX")), 0.18)
    and close_enough(((payload.get("selectedProgramCrop") or {}).get("panY")), -0.12)
    and close_enough(((payload.get("selectedProgramCrop") or {}).get("zoom")), 1.35),
    timeout_seconds=8,
)
selected_crop = state.get("selectedProgramCrop") or {}
if not close_enough(selected_crop.get("panX"), 0.18):
    errors.append(f"Selected crop panX did not update: {selected_crop}")
if not close_enough(selected_crop.get("panY"), -0.12):
    errors.append(f"Selected crop panY did not update: {selected_crop}")
if not close_enough(selected_crop.get("zoom"), 1.35):
    errors.append(f"Selected crop zoom did not update: {selected_crop}")

run_and_wait_processed("program-crop-preset", lane_id, "9:16", "tighter", "baseline", timeout_seconds=8)
state = wait_for(
    lambda payload: close_enough(((payload.get("selectedProgramCrop") or {}).get("panX")), 0.18)
    and close_enough(((payload.get("selectedProgramCrop") or {}).get("panY")), -0.12)
    and close_enough(((payload.get("selectedProgramCrop") or {}).get("zoom")), 1.53),
    timeout_seconds=8,
)
selected_crop = state.get("selectedProgramCrop") or {}
if not close_enough(selected_crop.get("zoom"), 1.53):
    errors.append(f"Program crop baseline preset did not tighten zoom: {selected_crop}")

run_and_wait_processed("program-crop-keyframe", lane_id, "9:16", f"{sequence_time:.3f}", "0.24", "-0.18", "1.50", timeout_seconds=8)
state = wait_for(
    lambda payload: int((payload.get("selectedProgramCrop") or {}).get("keyframeCount") or 0) >= 1,
    timeout_seconds=8,
)
selected_crop = state.get("selectedProgramCrop") or {}
if int(selected_crop.get("keyframeCount") or 0) < 1:
    errors.append(f"Program crop keyframe count did not update: {selected_crop}")

run_and_wait_processed("program-crop-preset", lane_id, "9:16", "right", "keyframe", f"{sequence_time:.3f}", timeout_seconds=8)
state = wait_for(
    lambda payload: any(
        close_enough(keyframe.get("time"), sequence_time, tolerance=0.11)
        and close_enough(keyframe.get("panX"), 0.22)
        and close_enough(keyframe.get("panY"), -0.18)
        and close_enough(keyframe.get("zoom"), 1.50)
        for keyframe in ((payload.get("selectedProgramCrop") or {}).get("keyframes") or [])
    ),
    timeout_seconds=8,
)
selected_crop = state.get("selectedProgramCrop") or {}
keyframes = selected_crop.get("keyframes") or []
if not any(
    close_enough(keyframe.get("time"), sequence_time, tolerance=0.11)
    and close_enough(keyframe.get("panX"), 0.22)
    and close_enough(keyframe.get("panY"), -0.18)
    and close_enough(keyframe.get("zoom"), 1.50)
    for keyframe in keyframes
):
    errors.append(f"Program crop keyframe preset did not write expected keyframe: {selected_crop}")

run_and_wait_processed("program-crop-keyframe-delta", lane_id, "9:16", f"{sequence_time:.3f}", "-0.03", "0.02", "0.08", timeout_seconds=8)
state = wait_for(
    lambda payload: any(
        close_enough(keyframe.get("time"), sequence_time, tolerance=0.11)
        and close_enough(keyframe.get("panX"), 0.19)
        and close_enough(keyframe.get("panY"), -0.16)
        and close_enough(keyframe.get("zoom"), 1.58)
        for keyframe in ((payload.get("selectedProgramCrop") or {}).get("keyframes") or [])
    ),
    timeout_seconds=8,
)
selected_crop = state.get("selectedProgramCrop") or {}
keyframes = selected_crop.get("keyframes") or []
if not any(
    close_enough(keyframe.get("time"), sequence_time, tolerance=0.11)
    and close_enough(keyframe.get("panX"), 0.19)
    and close_enough(keyframe.get("panY"), -0.16)
    and close_enough(keyframe.get("zoom"), 1.58)
    for keyframe in keyframes
):
    errors.append(f"Program crop keyframe delta did not update expected keyframe: {selected_crop}")

# Clean up baseline/keyframes left by this smoke.
run_and_wait_processed("program-crop", lane_id, "9:16", "0", "0", "1", timeout_seconds=8)
run_and_wait_processed("program-crop-clear-keyframes", lane_id, "9:16", timeout_seconds=8)
state = wait_for(
    lambda payload: close_enough(((payload.get("selectedProgramCrop") or {}).get("panX")), 0)
    and int((payload.get("selectedProgramCrop") or {}).get("keyframeCount") or 0) == 0,
    timeout_seconds=8,
)
selected_crop = state.get("selectedProgramCrop") or {}
if not close_enough(selected_crop.get("panX"), 0) or not close_enough(selected_crop.get("panY"), 0) or not close_enough(selected_crop.get("zoom"), 1):
    errors.append(f"Program crop baseline was not reset: {selected_crop}")
if int(selected_crop.get("keyframeCount") or 0) != 0:
    errors.append(f"Program crop keyframes were not cleared: {selected_crop}")

proof = {
    "status": "failed" if errors else "passed",
    "laneId": lane_id,
    "sequenceTime": sequence_time,
    "cropModel": "baseline-plus-keyframes-over-whole-source-lanes",
    "errors": errors,
}
print(json.dumps(proof, indent=2, sort_keys=True))
if errors:
    raise SystemExit(1)
PY
