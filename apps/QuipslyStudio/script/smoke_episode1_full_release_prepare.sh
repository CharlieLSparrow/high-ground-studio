#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
NO_BUILD=false
OUTPUT_DIR="${TMPDIR:-/tmp}/quipslystudio-full-release-smoke"

usage() {
  cat <<'USAGE'
Smoke Episode 1 full release prep.

Usage:
  script/smoke_episode1_full_release_prepare.sh [--no-build] [--output-dir /absolute/output]

This proves one command can prepare proxy-backed release exports, delivery
packet, publish ledger, release checklist, and publish packet handoff files.
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
  "$ROOT_DIR/script/build_and_run.sh" --verify >/tmp/quipslystudio-full-release-build.log
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
basename = "smoke-full-release"

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

def wait_for(predicate, timeout_seconds=120, interval_seconds=0.5):
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
    raise SystemExit("Episode 1 did not become production ready before full release smoke.")

run_and_wait_processed("full-release-prepare", output_dir, basename, "5", timeout_seconds=14)
state = wait_for(
    lambda payload: (payload.get("fullRelease") or {}).get("status") in {"completed", "failed", "blocked"},
    timeout_seconds=150,
)

full_release = state.get("fullRelease") or {}
export_state = state.get("exportState") or {}
delivery_packet = state.get("deliveryPacket") or {}
publish_ledger = state.get("publishLedger") or {}
checklist = state.get("publishReleaseChecklist") or {}
publish_packet = state.get("publishPacket") or {}

if full_release.get("status") != "completed":
    errors.append(f"Full release did not complete: {full_release}")
if export_state.get("status") != "completed" or export_state.get("kind") != "release-prep":
    errors.append(f"Release export did not complete: {export_state}")
if delivery_packet.get("status") != "generated":
    errors.append(f"Delivery packet was not generated: {delivery_packet}")
if int(publish_ledger.get("recordCount") or 0) != 8:
    errors.append(f"Expected publish ledger recordCount 8, got {publish_ledger.get('recordCount')}")
if checklist.get("recordCount") != 8:
    errors.append(f"Expected release checklist recordCount 8, got {checklist.get('recordCount')}")
if checklist.get("artifactReadyCount") != 8:
    errors.append(f"Expected release checklist artifactReadyCount 8, got {checklist.get('artifactReadyCount')}")
if checklist.get("readinessLevel") not in {"ready-for-manual-upload", "partially-released", "released"}:
    errors.append(f"Unexpected release checklist readiness: {checklist.get('readinessLevel')}")
if publish_packet.get("status") != "generated":
    errors.append(f"Publish packet was not generated: {publish_packet}")

expected_paths = [
    os.path.join(output_dir, f"{basename}-16x9.mp4"),
    os.path.join(output_dir, f"{basename}-9x16.mp4"),
    os.path.join(output_dir, f"{basename}-podcast-audio.m4a"),
    os.path.join(output_dir, f"{basename}-delivery-packet.json"),
    os.path.join(output_dir, f"{basename}-publish-packet", f"{basename}-publish-ledger.json"),
    os.path.join(output_dir, f"{basename}-publish-packet", f"{basename}-publish-release-checklist.json"),
    os.path.join(output_dir, f"{basename}-publish-packet", f"{basename}-publish-manifest.json"),
]
missing = [path for path in expected_paths if not os.path.exists(path)]
if missing:
    errors.append(f"Missing expected release files: {missing}")

direct_full_release = get_json("full-release")
if direct_full_release.get("status") != "completed":
    errors.append(f"Direct full-release endpoint did not report completed: {direct_full_release}")

if errors:
    raise SystemExit("\n".join(errors))

print(json.dumps({
    "status": "passed",
    "outputDir": output_dir,
    "recordCount": publish_ledger.get("recordCount"),
    "releaseChecklistReadiness": checklist.get("readinessLevel"),
    "publishPacketPath": publish_packet.get("outputPath"),
    "fullReleaseStep": full_release.get("step"),
}, indent=2, sort_keys=True))
PY
