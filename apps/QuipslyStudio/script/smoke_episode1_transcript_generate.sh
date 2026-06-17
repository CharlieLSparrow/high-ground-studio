#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
NO_BUILD=false
FIXTURE_DIR="${TMPDIR:-/tmp}/quipslystudio-transcript-generate-smoke"

usage() {
  cat <<'USAGE'
Smoke Episode 1 transcript generation command bridge.

Usage:
  script/smoke_episode1_transcript_generate.sh [--no-build]

This proves the editor can run a local transcription provider bridge:
  - load Episode 1
  - select a visible source lane
  - run a fixture local transcriber command that prints SRT to stdout
  - parse generated transcript segments into MediaSequence.transcriptSegments
  - verify /state exposes transcript job completion and segment truth
  - clear smoke transcript and job records
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

mkdir -p "$FIXTURE_DIR"
FIXTURE_COMMAND="$FIXTURE_DIR/fake-transcriber.sh"
cat > "$FIXTURE_COMMAND" <<'SCRIPT'
#!/usr/bin/env bash
set -euo pipefail
_media_path="${1:-}"
cat <<'SRT'
1
00:00:00,000 --> 00:00:01,500
Charlie: Generated transcript line one from local command.

2
00:00:01,500 --> 00:00:03,000
Homer: Generated transcript line two is reviewable metadata.

3
00:00:03,000 --> 00:00:04,500
Charlie: Generated transcript line three can feed shorts and captions.
SRT
SCRIPT
chmod +x "$FIXTURE_COMMAND"

if [[ "$NO_BUILD" == false ]]; then
  "$ROOT_DIR/script/build_and_run.sh" --verify >/tmp/quipslystudio-transcript-generate-build.log
fi

python3 - "$ROOT_DIR" "$FIXTURE_COMMAND" <<'PY'
import json
import subprocess
import sys
import time

root_dir = sys.argv[1]
fixture_command = sys.argv[2]
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

def wait_for(predicate, timeout_seconds=14, interval_seconds=0.25):
    deadline = time.time() + timeout_seconds
    latest = {}
    while time.time() <= deadline:
        latest = get_json("state")
        if predicate(latest):
            return latest
        time.sleep(interval_seconds)
    return latest

def run_and_wait_processed(*args, timeout_seconds=14):
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
    raise SystemExit("Episode 1 session did not load before transcript generation smoke.")

state = run_and_wait_processed("select-decision", "first_video", timeout_seconds=8)
active_lanes = (state.get("programLayout") or {}).get("activeVisualLanes") or []
if not active_lanes:
    raise SystemExit("No active visual lane found for transcript generation smoke.")
lane_id = active_lanes[0].get("id") or active_lanes[0].get("name")
if not lane_id:
    raise SystemExit("Active lane did not expose id or name for transcript generation smoke.")

run_and_wait_processed("transcript-clear", timeout_seconds=8)
run_and_wait_processed("transcript-clear-jobs", timeout_seconds=8)
run_and_wait_processed("transcript-generate", lane_id, fixture_command, timeout_seconds=8)
state = wait_for(
    lambda payload: int(payload.get("transcriptSegmentCount") or 0) == 3
    and ((payload.get("transcript") or {}).get("latestJob") or {}).get("status") == "completed",
    timeout_seconds=14,
)

transcript = state.get("transcript") or {}
latest = transcript.get("latestJob") or {}
segments = transcript.get("segments") or []
if int(state.get("transcriptSegmentCount") or 0) != 3:
    errors.append(f"Expected 3 generated transcript segments, saw {state.get('transcriptSegmentCount')}.")
if latest.get("status") != "completed":
    errors.append(f"Latest transcript job was not completed: {latest}")
if latest.get("provider") != "local-command":
    errors.append(f"Latest transcript job provider was not local-command: {latest}")
if not segments or segments[0].get("text") != "Generated transcript line one from local command.":
    errors.append(f"Generated transcript text did not parse cleanly: {segments[:1]}")
if state.get("leftWorkbenchMode") != "transcript" or state.get("leftWorkbenchOpen") is not True:
    errors.append("Transcript generation did not open the transcript workbench.")

run_and_wait_processed("transcript-clear", timeout_seconds=8)
run_and_wait_processed("transcript-clear-jobs", timeout_seconds=8)
state = wait_for(
    lambda payload: int(payload.get("transcriptSegmentCount") or 0) == 0
    and int((payload.get("transcript") or {}).get("jobCount") or 0) == 0,
    timeout_seconds=8,
)
if int(state.get("transcriptSegmentCount") or 0) != 0:
    errors.append("Smoke transcript was not cleared.")
if int((state.get("transcript") or {}).get("jobCount") or 0) != 0:
    errors.append("Smoke transcript jobs were not cleared.")

proof = {
    "status": "failed" if errors else "passed",
    "laneId": lane_id,
    "provider": latest.get("provider"),
    "segmentCount": latest.get("segmentCount"),
    "errors": errors,
}
print(json.dumps(proof, indent=2, sort_keys=True))
if errors:
    raise SystemExit(1)
PY
