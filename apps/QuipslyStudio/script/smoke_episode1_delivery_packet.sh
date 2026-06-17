#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
NO_BUILD=false
OUTPUT_DIR="${TMPDIR:-/tmp}/quipslystudio-delivery-packet-smoke"

usage() {
  cat <<'USAGE'
Smoke Episode 1 delivery packet generation.

Usage:
  script/smoke_episode1_delivery_packet.sh [--no-build] [--output-dir /absolute/output]

This proves the editor can turn current export truth into an inspectable
delivery packet without claiming direct platform publishing is ready.
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
  "$ROOT_DIR/script/build_and_run.sh" --verify >/tmp/quipslystudio-delivery-packet-build.log
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
basename = "smoke-delivery-packet"
expected_packet = os.path.join(output_dir, f"{basename}-delivery-packet.json")
expected_audio = os.path.join(output_dir, "smoke-delivery-audio-podcast-audio.m4a")

for path in [expected_packet, expected_audio]:
    try:
        os.remove(path)
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
    and payload.get("productionReady") is True,
    timeout_seconds=20,
)
if state.get("activeSessionName") != "episode-1-premiere-rescue" or state.get("productionReady") is not True:
    raise SystemExit("Episode 1 did not become production ready before delivery packet smoke.")

run_and_wait_processed("audio-master-export", output_dir, "smoke-delivery-audio", "5", timeout_seconds=10)
state = wait_for(
    lambda payload: (payload.get("exportState") or {}).get("status") in {"completed", "failed", "blocked"},
    timeout_seconds=80,
)
export_state = state.get("exportState") or {}
if export_state.get("status") != "completed":
    errors.append(f"Audio export did not complete before packet generation: {export_state}")
if expected_audio not in (export_state.get("outputPaths") or []):
    errors.append("Expected audio proof path was not in export state.")

run_and_wait_processed("delivery-packet-generate", output_dir, basename, timeout_seconds=14)
state = wait_for(
    lambda payload: (payload.get("deliveryPacket") or {}).get("status") == "generated",
    timeout_seconds=20,
)
packet_state = state.get("deliveryPacket") or {}
if packet_state.get("outputPath") != expected_packet:
    errors.append(f"Delivery packet output path mismatch: {packet_state}")
if not os.path.exists(expected_packet):
    errors.append(f"Delivery packet file missing: {expected_packet}")

packet = {}
if os.path.exists(expected_packet):
    packet = json.load(open(expected_packet))
    if packet.get("model") != "quipsly-episode-delivery-packet":
        errors.append("Packet model mismatch.")
    if packet.get("readyForDirectPublishing") is not False:
        errors.append("Packet must not claim direct publishing is ready.")
    if "proxy-first" not in packet.get("sourcePolicy", ""):
        errors.append("Packet is missing proxy-first source policy.")
    artifacts = {artifact.get("laneId"): artifact for artifact in packet.get("artifacts", [])}
    podcast = artifacts.get("podcast-audio-master", {})
    if podcast.get("status") != "exported" or podcast.get("outputPath") != expected_audio:
        errors.append(f"Podcast artifact should be exported and point at the audio proof: {podcast}")
    episode16 = artifacts.get("episode-16x9-master", {})
    if episode16.get("status") not in {"export-needed", "blocked"}:
        errors.append(f"16:9 episode artifact should not be falsely exported: {episode16}")
    destinations = packet.get("destinations") or []
    if not any(item.get("platform") == "Spotify" and item.get("publishStatus") == "artifact-ready-integration-needed" for item in destinations):
        errors.append("Spotify destination should be artifact-ready but integration-needed after audio export.")
    if not any(item.get("platform") == "YouTube" and item.get("publishStatus") in {"needs-export", "blocked"} for item in destinations):
        errors.append("YouTube destination should still need a video export, not claim publishing readiness.")

proof = {
    "status": "failed" if errors else "passed",
    "packetPath": expected_packet,
    "audioPath": expected_audio,
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
