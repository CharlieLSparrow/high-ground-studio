#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
NO_BUILD=false
OUTPUT_DIR="${TMPDIR:-/tmp}/quipslystudio-publish-connectors-smoke"

usage() {
  cat <<'USAGE'
Smoke Episode 1 publish connector readiness.

Usage:
  script/smoke_episode1_publish_connectors.sh [--no-build] [--output-dir /absolute/output]

This proves Quipsly can distinguish manual publish readiness from direct API
upload readiness for each platform without claiming fake uploads work.
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
  "$ROOT_DIR/script/build_and_run.sh" --verify >/tmp/quipslystudio-publish-connectors-build.log
fi

rm -rf "$OUTPUT_DIR"
mkdir -p "$OUTPUT_DIR"

python3 - "$ROOT_DIR" "$OUTPUT_DIR" <<'PY'
import json
import subprocess
import sys
import time

root_dir = sys.argv[1]
output_dir = sys.argv[2]
agentctl = f"{root_dir}/script/agentctl.sh"
basename = "smoke-connectors"

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
required_platforms = {
    "YouTube",
    "Patreon",
    "YouTube Shorts",
    "Instagram",
    "Facebook",
    "LinkedIn",
    "Spotify",
    "Apple Podcasts",
}

run_and_wait_processed("load-session", "episode-1-premiere-rescue", timeout_seconds=14)
state = wait_for(
    lambda payload: payload.get("activeSessionName") == "episode-1-premiere-rescue"
    and payload.get("productionReady") is True,
    timeout_seconds=20,
)
if state.get("activeSessionName") != "episode-1-premiere-rescue" or state.get("productionReady") is not True:
    raise SystemExit("Episode 1 did not become production ready before publish connector smoke.")

run_and_wait_processed("full-release-prepare", output_dir, basename, "5", timeout_seconds=14)
state = wait_for(
    lambda payload: (payload.get("fullRelease") or {}).get("status") == "completed",
    timeout_seconds=150,
)
readiness = get_json("publish-connector-readiness")
rows = readiness.get("rows") or []
platforms = {row.get("platform") for row in rows}

if readiness.get("recordCount") != 8:
    errors.append(f"Expected 8 connector rows, got {readiness.get('recordCount')}: {readiness}")
if platforms != required_platforms:
    errors.append(f"Unexpected connector platforms: {sorted(platforms)}")
if readiness.get("manualReadyCount") != 8:
    errors.append(f"Expected all rows manual ready, got {readiness.get('manualReadyCount')}")
if readiness.get("artifactReadyCount") != 8:
    errors.append(f"Expected all artifacts ready, got {readiness.get('artifactReadyCount')}")
if readiness.get("copyReadyCount") != 8:
    errors.append(f"Expected all copy ready, got {readiness.get('copyReadyCount')}")
if readiness.get("directReadyCount") != 0:
    errors.append(f"Expected no direct upload connector ready yet, got {readiness.get('directReadyCount')}")
if readiness.get("directPublishingReady") is not False:
    errors.append("Direct publishing must remain false until real upload connectors and receipt proof exist.")
if readiness.get("manualPublishingReady") is not True:
    errors.append("Manual publishing should be ready after full release prep.")

bad_rows = [
    row for row in rows
    if row.get("connectorStatus") != "manual-ready-api-missing"
    or row.get("safeAgentAction") != "prepare-manual-handoff-or-build-connector"
    or not row.get("requiredIntegration")
    or row.get("directUploadReady") is not False
]
if bad_rows:
    errors.append(f"Unexpected connector row states: {bad_rows[:2]}")
if not readiness.get("nextActions"):
    errors.append("Expected connector readiness to include next actions.")

if errors:
    raise SystemExit("\n".join(errors))

print(json.dumps({
    "status": "passed",
    "recordCount": readiness.get("recordCount"),
    "manualReadyCount": readiness.get("manualReadyCount"),
    "directReadyCount": readiness.get("directReadyCount"),
    "platforms": sorted(platforms),
}, indent=2, sort_keys=True))
PY
