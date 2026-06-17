#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
NO_BUILD=false

usage() {
  cat <<'USAGE'
Smoke Episode 1 short clip queue.

Usage:
  script/smoke_episode1_short_clip_queue.sh [--no-build]

This proves shorts are metadata over the episode timeline:
  - load Episode 1
  - select the first video SHOW decision
  - queue it as a 9:16 short candidate
  - observe it through /shorts_queue and /delivery_readiness
  - remove the candidate again
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
  "$ROOT_DIR/script/build_and_run.sh" --verify >/tmp/quipslystudio-short-queue-build.log
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

def wait_for(predicate, timeout_seconds=10, interval_seconds=0.25):
    deadline = time.time() + timeout_seconds
    latest = {}
    while time.time() <= deadline:
        latest = get_json("state")
        if predicate(latest):
            return latest
        time.sleep(interval_seconds)
    return latest

def run_and_wait_processed(*args, timeout_seconds=10):
    before = get_json("state")
    target_serial = int(before.get("agentCommandSerial") or 0) + 1
    run_command(*args)
    return wait_for(
        lambda payload: int(payload.get("agentLastProcessedCommandSerial") or 0) >= target_serial,
        timeout_seconds=timeout_seconds,
    )

run_and_wait_processed("load-session", "episode-1-premiere-rescue", timeout_seconds=12)
state = wait_for(
    lambda payload: payload.get("activeSessionName") == "episode-1-premiere-rescue"
    and payload.get("productionReady") is True,
    timeout_seconds=12,
)
if state.get("activeSessionName") != "episode-1-premiere-rescue":
    raise SystemExit("Episode 1 session did not load before short-queue smoke.")

run_and_wait_processed("select-decision", "first_video", timeout_seconds=8)
state = wait_for(
    lambda payload: payload.get("selectedTagType") == "Active"
    and payload.get("selectedTagId"),
    timeout_seconds=8,
)
if state.get("selectedTagType") != "Active" or not state.get("selectedTagId"):
    raise SystemExit("No selected Active video decision after select-decision first_video.")

run_and_wait_processed("shorts-add-selected", "Smoke short candidate", timeout_seconds=8)
run_and_wait_processed("left-workbench", "shorts", timeout_seconds=8)
run_and_wait_processed("shorts-update-selected", "hook", "Smoke hook", timeout_seconds=8)
run_and_wait_processed("shorts-update-selected", "caption", "Smoke caption draft", timeout_seconds=8)
run_and_wait_processed("shorts-update-selected", "overlay", "Smoke overlay", timeout_seconds=8)
run_and_wait_processed("shorts-update-selected", "review_status", "ready", timeout_seconds=8)
queue = {}
for _ in range(20):
    queue = get_json("shorts-queue")
    if queue.get("count", 0) >= 1:
        break
    time.sleep(0.25)

errors = []
clips = queue.get("clips") or []
if queue.get("model") != "short-clip-queue":
    errors.append("Short queue model missing.")
if "not chopped media" not in queue.get("truth", ""):
    errors.append("Short queue does not state the non-chopped-media truth.")
matching = [clip for clip in clips if clip.get("title") == "Smoke short candidate"]
if not matching:
    errors.append("Queued smoke short candidate was not found.")
else:
    clip = matching[0]
    if clip.get("hookText") != "Smoke hook":
        errors.append("Short hook metadata did not persist.")
    if clip.get("captionDraft") != "Smoke caption draft":
        errors.append("Short caption metadata did not persist.")
    if clip.get("primaryOverlayText") != "Smoke overlay":
        errors.append("Short overlay metadata did not persist.")
    if clip.get("reviewStatus") != "ready":
        errors.append("Short review status did not persist.")
    if len(clip.get("destinationPresets") or []) < 4:
        errors.append("Short destination presets were not materialized.")

delivery = get_json("delivery-readiness")
counts = delivery.get("counts") or {}
if counts.get("shortClipQueue", 0) < 1:
    errors.append("Delivery readiness did not see the short clip queue count.")

workbench_state = wait_for(
    lambda payload: payload.get("leftWorkbenchMode") == "shorts"
    and payload.get("leftWorkbenchOpen") is True
    and payload.get("selectedShortClipId"),
    timeout_seconds=6,
)
if workbench_state.get("leftWorkbenchMode") != "shorts" or workbench_state.get("leftWorkbenchOpen") is not True:
    errors.append("Shorts workbench did not open through the semantic command.")
if not workbench_state.get("selectedShortClipId"):
    errors.append("Selected short clip id was not exposed in /state.")
selected_short = workbench_state.get("selectedShortClip") or {}
if selected_short.get("hookText") != "Smoke hook":
    errors.append("Selected short clip payload did not expose hook metadata.")
if selected_short.get("reviewStatus") != "ready":
    errors.append("Selected short clip payload did not expose review status.")

removed = False
if matching:
    clip_id = matching[0]["id"]
    get_json("shorts-remove", clip_id)
    for _ in range(20):
        after = get_json("shorts-queue")
        if not any(clip.get("id") == clip_id for clip in after.get("clips") or []):
            removed = True
            break
        time.sleep(0.25)
    if not removed:
        errors.append("Queued smoke short candidate was not removed.")

proof = {
    "status": "failed" if errors else "passed",
    "queuedCountBeforeRemove": queue.get("count", 0),
    "deliveryShortClipQueueCount": counts.get("shortClipQueue", 0),
    "removed": removed,
    "errors": errors,
}
print(json.dumps(proof, indent=2, sort_keys=True))
if errors:
    raise SystemExit(1)
PY
