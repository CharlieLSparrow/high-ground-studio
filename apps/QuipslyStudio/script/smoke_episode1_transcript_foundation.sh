#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
NO_BUILD=false

usage() {
  cat <<'USAGE'
Smoke Episode 1 transcript foundation.

Usage:
  script/smoke_episode1_transcript_foundation.sh [--no-build]

This proves captions can derive from a timed transcript spine:
  - load Episode 1
  - seed a demo transcript only if no transcript exists
  - select the first transcript segment
  - select the first video SHOW decision and queue a temporary short
  - apply transcript text to the selected short caption
  - verify /state exposes transcript and selected-short caption truth
  - remove the temporary short and clear only the demo transcript created by this smoke
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
  "$ROOT_DIR/script/build_and_run.sh" --verify >/tmp/quipslystudio-transcript-foundation-build.log
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
created_short_id = ""
seeded_demo = False

run_and_wait_processed("load-session", "episode-1-premiere-rescue", timeout_seconds=14)
state = wait_for(
    lambda payload: payload.get("activeSessionName") == "episode-1-premiere-rescue"
    and payload.get("productionReady") is True,
    timeout_seconds=14,
)
if state.get("activeSessionName") != "episode-1-premiere-rescue":
    raise SystemExit("Episode 1 session did not load before transcript smoke.")

if int(state.get("transcriptSegmentCount") or 0) == 0:
    seeded_demo = True
    run_and_wait_processed("transcript-seed-demo", timeout_seconds=8)

state = wait_for(
    lambda payload: int(payload.get("transcriptSegmentCount") or 0) > 0,
    timeout_seconds=8,
)
if int(state.get("transcriptSegmentCount") or 0) <= 0:
    errors.append("Transcript segment count stayed at zero.")
if (state.get("transcript") or {}).get("model") != "transcript-spine":
    errors.append("Transcript payload did not expose the transcript-spine model.")

run_and_wait_processed("left-workbench", "transcript", timeout_seconds=8)
state = run_and_wait_processed("transcript-select", "first", timeout_seconds=8)
selected_segment = state.get("selectedTranscriptSegment") or {}
if not selected_segment.get("id"):
    errors.append("No selected transcript segment after transcript-select first.")
if "timed episode metadata" not in (state.get("transcript") or {}).get("truth", ""):
    errors.append("Transcript payload did not state the timed metadata truth.")
if state.get("leftWorkbenchMode") != "transcript" or state.get("leftWorkbenchOpen") is not True:
    errors.append("Transcript workbench did not open through semantic command.")

run_and_wait_processed("select-decision", "first_video", timeout_seconds=8)
state = wait_for(
    lambda payload: payload.get("selectedTagType") == "Active"
    and payload.get("selectedTagId"),
    timeout_seconds=8,
)
if state.get("selectedTagType") != "Active" or not state.get("selectedTagId"):
    errors.append("No selected Active video decision after select-decision first_video.")

run_and_wait_processed("shorts-add-selected", "Transcript smoke short", timeout_seconds=8)
state = wait_for(
    lambda payload: (payload.get("selectedShortClip") or {}).get("title") == "Transcript smoke short",
    timeout_seconds=8,
)
created_short_id = (state.get("selectedShortClip") or {}).get("id") or ""
if not created_short_id:
    errors.append("Temporary transcript smoke short was not selected.")

run_and_wait_processed("transcript-apply-to-short", "caption", timeout_seconds=8)
state = wait_for(
    lambda payload: (payload.get("selectedShortClip") or {}).get("captionDraft")
    == (payload.get("selectedTranscriptSegment") or {}).get("text"),
    timeout_seconds=8,
)
selected_short = state.get("selectedShortClip") or {}
selected_segment = state.get("selectedTranscriptSegment") or {}
if selected_short.get("captionDraft") != selected_segment.get("text"):
    errors.append("Selected short caption did not match selected transcript text.")
if "Transcript caption applied" not in selected_short.get("notes", ""):
    errors.append("Selected short notes did not record transcript caption provenance.")

removed = False
if created_short_id:
    get_json("shorts-remove", created_short_id)
    for _ in range(24):
        queue = get_json("shorts-queue")
        if not any(clip.get("id") == created_short_id for clip in queue.get("clips") or []):
            removed = True
            break
        time.sleep(0.25)
    if not removed:
        errors.append("Temporary transcript smoke short was not removed.")

if seeded_demo:
    run_and_wait_processed("transcript-clear", timeout_seconds=8)
    state = wait_for(
        lambda payload: int(payload.get("transcriptSegmentCount") or 0) == 0,
        timeout_seconds=8,
    )
    if int(state.get("transcriptSegmentCount") or 0) != 0:
        errors.append("Demo transcript created by smoke was not cleared.")

proof = {
    "status": "failed" if errors else "passed",
    "seededDemoTranscript": seeded_demo,
    "temporaryShortRemoved": removed,
    "selectedTranscriptTextApplied": not errors,
    "errors": errors,
}
print(json.dumps(proof, indent=2, sort_keys=True))
if errors:
    raise SystemExit(1)
PY
