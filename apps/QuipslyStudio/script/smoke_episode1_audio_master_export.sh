#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
NO_BUILD=false
OUTPUT_DIR="${TMPDIR:-/tmp}/quipslystudio-audio-master-smoke"

usage() {
  cat <<'USAGE'
Smoke Episode 1 podcast audio master export.

Usage:
  script/smoke_episode1_audio_master_export.sh [--no-build] [--output-dir /absolute/output]

This proves podcast audio is a derivative output recipe over the episode spine:
  - load Episode 1
  - verify audio proxy readiness
  - export an M4A podcast-audio proof from audio-only lanes
  - verify export state and non-empty output file
  - verify stream shape with ffprobe when available
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
  "$ROOT_DIR/script/build_and_run.sh" --verify >/tmp/quipslystudio-audio-master-build.log
fi

mkdir -p "$OUTPUT_DIR"

python3 - "$ROOT_DIR" "$OUTPUT_DIR" <<'PY'
import json
import os
import shutil
import subprocess
import sys
import time

root_dir = sys.argv[1]
output_dir = sys.argv[2]
agentctl = f"{root_dir}/script/agentctl.sh"
basename = "smoke-podcast-audio"
expected_output = os.path.join(output_dir, f"{basename}-podcast-audio.m4a")

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

def wait_for(predicate, timeout_seconds=40, interval_seconds=0.5):
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
    and int(payload.get("audioReadyCount") or 0) > 0
    and int(payload.get("audioBlockedCount") or 0) == 0,
    timeout_seconds=14,
)
if state.get("activeSessionName") != "episode-1-premiere-rescue":
    raise SystemExit("Episode 1 session did not load before audio-master smoke.")
if int(state.get("audioReadyCount") or 0) <= 0 or int(state.get("audioBlockedCount") or 0) != 0:
    raise SystemExit(f"Episode 1 audio proxies are not ready. audioReady={state.get('audioReadyCount')} audioBlocked={state.get('audioBlockedCount')}")

delivery = state.get("deliveryReadiness") or {}
podcast_lane = next((lane for lane in delivery.get("lanes", []) if lane.get("id") == "podcast-audio-master"), {})
if podcast_lane.get("ready") is not True:
    errors.append(f"Podcast audio lane is not marked ready: {podcast_lane}")

run_and_wait_processed("audio-master-export", output_dir, basename, "8", timeout_seconds=10)
state = wait_for(
    lambda payload: (payload.get("exportState") or {}).get("status") in {"completed", "failed", "blocked"},
    timeout_seconds=80,
)
export_state = state.get("exportState") or {}
if export_state.get("status") != "completed":
    errors.append(f"Audio export did not complete. exportState={export_state}")
if export_state.get("kind") != "agent-audio-master":
    errors.append(f"Audio export kind mismatch: {export_state.get('kind')!r}")
if expected_output not in (export_state.get("outputPaths") or []):
    errors.append("Export state did not include the expected audio output path.")
if not os.path.exists(expected_output):
    errors.append(f"Expected audio output missing: {expected_output}")
elif os.path.getsize(expected_output) <= 1024:
    errors.append(f"Expected audio output is too small: {os.path.getsize(expected_output)} bytes")

stream_probe = {"tool": "ffprobe", "available": False, "audioStreams": None, "videoStreams": None}
ffprobe = shutil.which("ffprobe")
if ffprobe and os.path.exists(expected_output):
    stream_probe["available"] = True
    result = subprocess.run(
        [
            ffprobe,
            "-v", "error",
            "-show_entries", "stream=codec_type",
            "-of", "json",
            expected_output,
        ],
        text=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        check=False,
    )
    if result.returncode != 0:
        errors.append("ffprobe failed: " + result.stderr.strip())
    else:
        probe_json = json.loads(result.stdout or "{}")
        streams = probe_json.get("streams") or []
        audio_count = sum(1 for stream in streams if stream.get("codec_type") == "audio")
        video_count = sum(1 for stream in streams if stream.get("codec_type") == "video")
        stream_probe["audioStreams"] = audio_count
        stream_probe["videoStreams"] = video_count
        if audio_count < 1:
            errors.append("Audio master output has no audio stream.")
        if video_count != 0:
            errors.append("Audio master output should not contain video streams.")

proof = {
    "status": "failed" if errors else "passed",
    "outputPath": expected_output,
    "outputBytes": os.path.getsize(expected_output) if os.path.exists(expected_output) else 0,
    "exportState": export_state,
    "podcastLane": podcast_lane,
    "streamProbe": stream_probe,
    "errors": errors,
}
print(json.dumps(proof, indent=2, sort_keys=True))
if errors:
    raise SystemExit(1)
PY
