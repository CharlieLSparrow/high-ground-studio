#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
NO_BUILD=false

usage() {
  cat <<'USAGE'
Smoke Episode 1 program layout rules.

Usage:
  script/smoke_episode1_program_layout.sh [--no-build]

This proves simultaneous SHOW decisions are exposed as layout truth:
  - load Episode 1
  - scan existing video decisions without mutating the edit
  - find a playhead where multiple visual lanes are active
  - verify 16:9 reports side_by_side
  - verify 9:16 reports stacked_vertical
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
  "$ROOT_DIR/script/build_and_run.sh" --verify >/tmp/quipslystudio-program-layout-build.log
fi

python3 - "$ROOT_DIR" <<'PY'
import json
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

errors = []

run_and_wait_processed("load-session", "episode-1-premiere-rescue", timeout_seconds=14)
state = wait_for(
    lambda payload: payload.get("activeSessionName") == "episode-1-premiere-rescue"
    and payload.get("productionReady") is True,
    timeout_seconds=14,
)
if state.get("activeSessionName") != "episode-1-premiere-rescue":
    raise SystemExit("Episode 1 session did not load before program layout smoke.")

found = None
for index in range(80):
    mode = "first_video" if index == 0 else "next_video"
    state = run_and_wait_processed("select-decision", mode, timeout_seconds=8)
    layout = state.get("programLayout") or {}
    if int(layout.get("activeVisualLaneCount") or 0) >= 2:
        found = state
        break

if not found:
    errors.append("No existing simultaneous SHOW decision was found in Episode 1 for layout proof.")
else:
    run_and_wait_processed("format", "16:9", timeout_seconds=8)
    wide = wait_for(
        lambda payload: (payload.get("programLayout") or {}).get("format") == "16:9",
        timeout_seconds=8,
    )
    wide_layout = wide.get("programLayout") or {}
    if wide_layout.get("layoutMode") != "side_by_side":
        errors.append(f"16:9 simultaneous SHOW layout was not side_by_side: {wide_layout}")
    if wide_layout.get("bothSpeaker16x9Default") != "side_by_side_equal_crop":
        errors.append("16:9 default both-speaker layout label missing.")

    run_and_wait_processed("format", "9:16", timeout_seconds=8)
    vertical = wait_for(
        lambda payload: (payload.get("programLayout") or {}).get("format") == "9:16",
        timeout_seconds=8,
    )
    vertical_layout = vertical.get("programLayout") or {}
    if vertical_layout.get("layoutMode") != "stacked_vertical":
        errors.append(f"9:16 simultaneous SHOW layout was not stacked_vertical: {vertical_layout}")
    if vertical_layout.get("bothSpeaker9x16Default") != "stacked_equal_crop":
        errors.append("9:16 default both-speaker layout label missing.")
    if "whole source lanes" not in vertical_layout.get("truth", ""):
        errors.append("Program layout truth did not preserve whole-source-lane invariant.")

proof = {
    "status": "failed" if errors else "passed",
    "foundSimultaneousShow": found is not None,
    "sequenceTime": found.get("playhead") if found else None,
    "errors": errors,
}
print(json.dumps(proof, indent=2, sort_keys=True))
if errors:
    raise SystemExit(1)
PY
