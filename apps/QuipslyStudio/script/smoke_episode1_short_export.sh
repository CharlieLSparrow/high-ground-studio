#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
NO_BUILD=false
OUTPUT_DIR="${TMPDIR:-/tmp}/quipslystudio-short-export-smoke"

usage() {
  cat <<'USAGE'
Smoke Episode 1 selected short export.

Usage:
  script/smoke_episode1_short_export.sh [--no-build] [--output-dir /absolute/output]

This proves shorts are derivative output recipes over the episode spine:
  - load Episode 1
  - select the first video SHOW decision
  - queue a temporary 9:16 short packet
  - cue and adjust the selected short range
  - play-preview the selected range and verify it stops at the out point
  - export the selected short as an MP4 with burned-in overlay/caption metadata
  - verify export status and non-empty output file
  - remove the temporary packet again
USAGE
}

while [[ "$#" -gt 0 ]]; do
  case "$1" in
    --no-build)
      NO_BUILD=true
      shift
      ;;
    --output-dir)
      OUTPUT_DIR="${2:-}"
      if [[ -z "$OUTPUT_DIR" ]]; then
        usage >&2
        exit 2
      fi
      shift 2
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
  "$ROOT_DIR/script/build_and_run.sh" --verify >/tmp/quipslystudio-short-export-build.log
fi

mkdir -p "$OUTPUT_DIR"

python3 - "$ROOT_DIR" "$OUTPUT_DIR" <<'PY'
import json
import os
import subprocess
import sys
import time

root_dir = sys.argv[1]
output_dir = sys.argv[2]
agentctl = f"{root_dir}/script/agentctl.sh"
basename = "smoke-selected-short"
expected_output = os.path.join(output_dir, f"{basename}-9x16-short.mp4")

try:
    os.remove(expected_output)
except FileNotFoundError:
    pass

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

def wait_for(predicate, timeout_seconds=20, interval_seconds=0.25):
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

errors = []
created_short_id = ""

run_and_wait_processed("load-session", "episode-1-premiere-rescue", timeout_seconds=14)
state = wait_for(
    lambda payload: payload.get("activeSessionName") == "episode-1-premiere-rescue"
    and payload.get("productionReady") is True,
    timeout_seconds=14,
)
if state.get("activeSessionName") != "episode-1-premiere-rescue":
    raise SystemExit("Episode 1 session did not load before short-export smoke.")
if state.get("productionReady") is not True:
    raise SystemExit("Episode 1 session is not proxy-production-ready before short-export smoke.")

state = run_and_wait_processed("select-decision", "first_video", timeout_seconds=8)
for _ in range(12):
    if (
        state.get("selectedTagType") == "Active"
        and state.get("selectedTagId")
        and float(state.get("playhead") or 0) > 1.0
    ):
        break
    state = run_and_wait_processed("select-decision", "next_video", timeout_seconds=8)
if state.get("selectedTagType") != "Active" or not state.get("selectedTagId"):
    raise SystemExit("No selected Active video decision after scanning visual decisions.")
if float(state.get("playhead") or 0) <= 1.0:
    raise SystemExit("Could not find a non-zero Active video decision for short range adjustment proof.")

run_and_wait_processed("shorts-add-selected", "Smoke export short", timeout_seconds=8)
run_and_wait_processed("shorts-update-selected", "hook", "Smoke export hook", timeout_seconds=8)
run_and_wait_processed("shorts-update-selected", "overlay", "Smoke export overlay", timeout_seconds=8)
run_and_wait_processed("shorts-update-selected", "caption", "Smoke export caption", timeout_seconds=8)
state = wait_for(
    lambda payload: (payload.get("selectedShortClip") or {}).get("title") == "Smoke export short",
    timeout_seconds=8,
)
selected_short = state.get("selectedShortClip") or {}
created_short_id = selected_short.get("id") or ""
if not created_short_id:
    errors.append("Selected smoke short packet was not exposed in /state.")

initial_start = float(selected_short.get("sequenceStartTime") or selected_short.get("startTime") or 0)
initial_duration = float(selected_short.get("duration") or 0)
run_and_wait_processed("shorts-preview-selected", "false", timeout_seconds=8)
preview_state = get_json("state")
if preview_state.get("playbackFormat") not in {"9:16", "vertical9x16"}:
    errors.append("Short preview did not switch playback format to 9:16.")
if abs(float(preview_state.get("playhead") or 0) - initial_start) > 0.35:
    errors.append("Short preview did not cue the shared playhead to the selected short in point.")

run_and_wait_processed("shorts-range-selected", "start", "delta", "-0.1", timeout_seconds=8)
run_and_wait_processed("shorts-range-selected", "end", "delta", "0.1", timeout_seconds=8)
state = wait_for(
    lambda payload: (payload.get("selectedShortClip") or {}).get("id") == created_short_id,
    timeout_seconds=8,
)
selected_short = state.get("selectedShortClip") or {}
adjusted_start = float(selected_short.get("sequenceStartTime") or selected_short.get("startTime") or 0)
adjusted_duration = float(selected_short.get("duration") or 0)
if adjusted_start > initial_start - 0.05:
    errors.append("Selected short in point did not move earlier after range adjustment.")
if adjusted_duration < initial_duration + 0.15:
    errors.append("Selected short duration did not grow after in/out adjustment.")

expected_preview_end = adjusted_start + adjusted_duration
run_and_wait_processed("shorts-preview-selected", "play", timeout_seconds=8)
preview_done = wait_for(
    lambda payload: payload.get("isPlaying") is False
    and payload.get("shortPreviewStopAt") in (None, "")
    and abs(float(payload.get("playhead") or 0) - expected_preview_end) <= 0.45,
    timeout_seconds=max(10, min(30, adjusted_duration + 8)),
    interval_seconds=0.25,
)
if preview_done.get("isPlaying") is not False:
    errors.append("Selected short preview did not stop playback.")
if preview_done.get("shortPreviewStopAt") not in (None, ""):
    errors.append("Selected short preview stop guard was not cleared after stopping.")
if abs(float(preview_done.get("playhead") or 0) - expected_preview_end) > 0.45:
    errors.append("Selected short preview did not stop near the selected out point.")

run_and_wait_processed("shorts-export-selected", output_dir, basename, timeout_seconds=10)
export_state = {}
for _ in range(180):
    state = get_json("state")
    export_state = state.get("exportState") or {}
    if export_state.get("status") in {"completed", "failed", "blocked"}:
        break
    time.sleep(1)

if export_state.get("status") != "completed":
    errors.append(f"Export did not complete. exportState={export_state}")
if expected_output not in (export_state.get("outputPaths") or []):
    errors.append("Export state did not include the expected short output path.")
if not os.path.exists(expected_output):
    errors.append(f"Expected output file missing: {expected_output}")
elif os.path.getsize(expected_output) <= 0:
    errors.append(f"Expected output file is empty: {expected_output}")

state = get_json("state")
selected_short = state.get("selectedShortClip") or {}
if selected_short.get("exportStatus") != "exported":
    errors.append(f"Selected short exportStatus was not exported: {selected_short.get('exportStatus')}")
if expected_output not in selected_short.get("publishNotes", ""):
    errors.append("Selected short publishNotes did not include the output path.")
publish_notes = selected_short.get("publishNotes", "")
if "Text burn-in: overlay, caption" not in publish_notes:
    errors.append("Selected short publishNotes did not prove overlay/caption burn-in.")

removed = False
if created_short_id:
    try:
        get_json("shorts-remove", created_short_id)
        for _ in range(24):
            queue = get_json("shorts-queue")
            if not any(clip.get("id") == created_short_id for clip in queue.get("clips") or []):
                removed = True
                break
            time.sleep(0.25)
    except SystemExit:
        raise
    except Exception as exc:
        errors.append(f"Failed to remove temporary smoke short: {exc}")

proof = {
    "status": "failed" if errors else "passed",
    "output": expected_output,
    "outputExists": os.path.exists(expected_output),
    "outputBytes": os.path.getsize(expected_output) if os.path.exists(expected_output) else 0,
    "exportState": export_state,
    "temporaryShortRemoved": removed,
    "errors": errors,
}
print(json.dumps(proof, indent=2, sort_keys=True))
if errors:
    raise SystemExit(1)
PY
