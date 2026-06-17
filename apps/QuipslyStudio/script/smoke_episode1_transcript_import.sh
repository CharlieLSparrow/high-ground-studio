#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
NO_BUILD=false
FIXTURE_DIR="${TMPDIR:-/tmp}/quipslystudio-transcript-import-smoke"

usage() {
  cat <<'USAGE'
Smoke Episode 1 transcript import.

Usage:
  script/smoke_episode1_transcript_import.sh [--no-build]

This proves real transcript sidecars can become sequence metadata:
  - create a small SRT fixture
  - load Episode 1
  - import the SRT into MediaSequence.transcriptSegments
  - select a transcript segment and apply it to a temporary short caption
  - remove the temporary short and clear the smoke transcript
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
  "$ROOT_DIR/script/build_and_run.sh" --verify >/tmp/quipslystudio-transcript-import-build.log
fi

mkdir -p "$FIXTURE_DIR"
FIXTURE_PATH="$FIXTURE_DIR/episode-1-smoke-transcript.srt"
cat > "$FIXTURE_PATH" <<'SRT'
1
00:00:02,000 --> 00:00:05,500
Charlie: Imported transcript line one should become timed metadata.

2
00:00:06,000 --> 00:00:08,250
Homer: Imported transcript line two should remain inspectable.

3
00:00:09,000 --> 00:00:12,000
Charlie: This line can feed captions without detached paste boxes.
SRT

python3 - "$ROOT_DIR" "$FIXTURE_PATH" <<'PY'
import json
import subprocess
import sys
import time

root_dir = sys.argv[1]
fixture_path = sys.argv[2]
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

run_and_wait_processed("load-session", "episode-1-premiere-rescue", timeout_seconds=14)
state = wait_for(
    lambda payload: payload.get("activeSessionName") == "episode-1-premiere-rescue"
    and payload.get("productionReady") is True,
    timeout_seconds=14,
)
if state.get("activeSessionName") != "episode-1-premiere-rescue":
    raise SystemExit("Episode 1 session did not load before transcript import smoke.")

run_and_wait_processed("transcript-import", fixture_path, "srt", timeout_seconds=8)
state = wait_for(
    lambda payload: int(payload.get("transcriptSegmentCount") or 0) == 3,
    timeout_seconds=8,
)
if int(state.get("transcriptSegmentCount") or 0) != 3:
    errors.append(f"Expected 3 imported transcript segments, saw {state.get('transcriptSegmentCount')}.")
if state.get("leftWorkbenchMode") != "transcript":
    errors.append("Transcript import did not open the transcript workbench.")
selected_segment = state.get("selectedTranscriptSegment") or {}
if selected_segment.get("speaker") != "Charlie":
    errors.append("Imported speaker was not parsed from SRT text.")
if selected_segment.get("text") != "Imported transcript line one should become timed metadata.":
    errors.append("Imported transcript text was not parsed cleanly.")
if abs(float(state.get("playhead") or 0) - 2.0) > 0.35:
    errors.append("Transcript import did not cue the shared playhead to first segment.")

run_and_wait_processed("transcript-select", "next", timeout_seconds=8)
state = wait_for(
    lambda payload: (payload.get("selectedTranscriptSegment") or {}).get("speaker") == "Homer",
    timeout_seconds=8,
)
selected_segment = state.get("selectedTranscriptSegment") or {}
if selected_segment.get("text") != "Imported transcript line two should remain inspectable.":
    errors.append("Transcript next selection did not expose the expected imported segment.")

run_and_wait_processed("select-decision", "first_video", timeout_seconds=8)
run_and_wait_processed("shorts-add-selected", "Transcript import smoke short", timeout_seconds=8)
state = wait_for(
    lambda payload: (payload.get("selectedShortClip") or {}).get("title") == "Transcript import smoke short",
    timeout_seconds=8,
)
created_short_id = (state.get("selectedShortClip") or {}).get("id") or ""
if not created_short_id:
    errors.append("Temporary transcript import smoke short was not selected.")

run_and_wait_processed("transcript-apply-to-short", "caption", timeout_seconds=8)
state = wait_for(
    lambda payload: (payload.get("selectedShortClip") or {}).get("captionDraft")
    == "Imported transcript line two should remain inspectable.",
    timeout_seconds=8,
)
selected_short = state.get("selectedShortClip") or {}
if selected_short.get("captionDraft") != "Imported transcript line two should remain inspectable.":
    errors.append("Imported transcript segment did not apply to selected short caption.")

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
        errors.append("Temporary transcript import smoke short was not removed.")

run_and_wait_processed("transcript-clear", timeout_seconds=8)
state = wait_for(
    lambda payload: int(payload.get("transcriptSegmentCount") or 0) == 0,
    timeout_seconds=8,
)
if int(state.get("transcriptSegmentCount") or 0) != 0:
    errors.append("Smoke transcript was not cleared.")

proof = {
    "status": "failed" if errors else "passed",
    "fixturePath": fixture_path,
    "importedSegments": 3,
    "temporaryShortRemoved": removed,
    "errors": errors,
}
print(json.dumps(proof, indent=2, sort_keys=True))
if errors:
    raise SystemExit(1)
PY
