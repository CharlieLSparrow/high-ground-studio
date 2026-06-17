#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
NO_BUILD=false
OUTPUT_DIR="${TMPDIR:-/tmp}/quipslystudio-release-prepare-smoke"

usage() {
  cat <<'USAGE'
Smoke Episode 1 release prepare flow.

Usage:
  script/smoke_episode1_release_prepare.sh [--no-build] [--output-dir /absolute/output]

This proves the app can prepare one local release folder containing 16:9 video,
9:16 video, selected short video when queued, podcast audio, and a delivery
packet that still refuses to claim direct platform publishing is done.
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
  "$ROOT_DIR/script/build_and_run.sh" --verify >/tmp/quipslystudio-release-prepare-build.log
fi

rm -rf "$OUTPUT_DIR"
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
basename = "smoke-release"
expected = {
    "wide": os.path.join(output_dir, f"{basename}-16x9.mp4"),
    "vertical": os.path.join(output_dir, f"{basename}-9x16.mp4"),
    "audio": os.path.join(output_dir, f"{basename}-podcast-audio.m4a"),
    "packet": os.path.join(output_dir, f"{basename}-delivery-packet.json"),
}

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

def wait_for(predicate, timeout_seconds=80, interval_seconds=0.5):
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
    timeout_seconds=20,
)
if state.get("activeSessionName") != "episode-1-premiere-rescue" or state.get("productionReady") is not True:
    raise SystemExit("Episode 1 did not become production ready before release prepare smoke.")

run_and_wait_processed("release-prepare", output_dir, basename, "5", timeout_seconds=14)
state = wait_for(
    lambda payload: (payload.get("exportState") or {}).get("status") in {"completed", "failed", "blocked"}
    and (payload.get("deliveryPacket") or {}).get("status") in {"generated", "failed", "blocked"},
    timeout_seconds=120,
)
export_state = state.get("exportState") or {}
packet_state = state.get("deliveryPacket") or {}
if export_state.get("status") != "completed":
    errors.append(f"Release prepare export did not complete: {export_state}")
if export_state.get("kind") != "release-prep":
    errors.append(f"Release prepare export kind mismatch: {export_state.get('kind')!r}")
if packet_state.get("status") != "generated":
    errors.append(f"Delivery packet was not generated: {packet_state}")

for label, path in expected.items():
    if not os.path.exists(path):
        errors.append(f"Missing expected {label} artifact: {path}")
    elif os.path.getsize(path) <= 1024:
        errors.append(f"Expected {label} artifact is too small: {os.path.getsize(path)} bytes")

short_outputs = [
    os.path.join(output_dir, name)
    for name in os.listdir(output_dir)
    if name.endswith("-9x16-short.mp4")
]
if not short_outputs:
    errors.append("No selected short output was created.")
else:
    for path in short_outputs:
        if os.path.getsize(path) <= 1024:
            errors.append(f"Short output is too small: {path}")

packet = {}
if os.path.exists(expected["packet"]):
    packet = json.load(open(expected["packet"]))
    if packet.get("readyForDirectPublishing") is not False:
        errors.append("Release packet must not claim direct publishing is ready.")
    artifacts = {artifact.get("laneId"): artifact for artifact in packet.get("artifacts", [])}
    for lane_id in ["episode-16x9-master", "episode-9x16-master", "podcast-audio-master", "social-short-clips"]:
        artifact = artifacts.get(lane_id, {})
        if artifact.get("status") != "exported":
            errors.append(f"{lane_id} should be exported after release prepare: {artifact}")
    destinations = packet.get("destinations") or []
    if not any(item.get("platform") == "YouTube" and item.get("publishStatus") == "artifact-ready-integration-needed" for item in destinations):
        errors.append("YouTube should be artifact-ready/integration-needed after release prepare.")
    if not any(item.get("platform") == "Patreon" and item.get("publishStatus") == "artifact-ready-integration-needed" for item in destinations):
        errors.append("Patreon should be artifact-ready/integration-needed after release prepare.")
    if not any(item.get("platform") == "Spotify" and item.get("publishStatus") == "artifact-ready-integration-needed" for item in destinations):
        errors.append("Spotify should be artifact-ready/integration-needed after release prepare.")

proof = {
    "status": "failed" if errors else "passed",
    "outputDir": output_dir,
    "expected": expected,
    "shortOutputs": short_outputs,
    "exportState": export_state,
    "packetState": packet_state,
    "artifactStatuses": {
        artifact.get("laneId"): artifact.get("status")
        for artifact in packet.get("artifacts", [])
    },
    "errors": errors,
}
print(json.dumps(proof, indent=2, sort_keys=True))
if errors:
    raise SystemExit(1)
PY
