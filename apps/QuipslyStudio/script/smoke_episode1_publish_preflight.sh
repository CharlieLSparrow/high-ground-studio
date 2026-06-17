#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
NO_BUILD=false
OUTPUT_DIR="${TMPDIR:-/tmp}/quipslystudio-publish-preflight-smoke"

usage() {
  cat <<'USAGE'
Smoke Episode 1 publish connector preflight.

Usage:
  script/smoke_episode1_publish_preflight.sh [--no-build] [--output-dir /absolute/output]

This proves Quipsly exposes upload-worker gates without claiming direct upload
is ready when auth and executable workers are missing.
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
  "$ROOT_DIR/script/build_and_run.sh" --verify >/tmp/quipslystudio-publish-preflight-build.log
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
basename = "smoke-preflight"

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
    raise SystemExit("Episode 1 did not become production ready before publish preflight smoke.")

run_and_wait_processed("full-release-prepare", output_dir, basename, "5", timeout_seconds=14)
state = wait_for(
    lambda payload: (payload.get("fullRelease") or {}).get("status") == "completed",
    timeout_seconds=150,
)
preflight = get_json("publish-connector-preflight")
rows = preflight.get("rows") or []
youtube = next((row for row in rows if row.get("platform") == "YouTube"), None)
shorts = next((row for row in rows if row.get("platform") == "YouTube Shorts"), None)

if preflight.get("recordCount") != 8:
    errors.append(f"Expected 8 preflight rows, got {preflight.get('recordCount')}: {preflight}")
if preflight.get("safeToUploadAutomatically") is not False:
    errors.append("Preflight must not report automatic upload safe without configured auth and workers.")
if preflight.get("readyCount") != 0:
    errors.append(f"Expected no upload-worker-ready rows in default smoke env, got {preflight.get('readyCount')}")
if not youtube:
    errors.append("Missing YouTube preflight row.")
else:
    if youtube.get("artifactReady") is not True:
        errors.append(f"YouTube artifact should be ready after full release: {youtube}")
    if youtube.get("copyReady") is not True:
        errors.append(f"YouTube copy should be ready after ledger generation: {youtube}")
    if youtube.get("authConfigured") is not False:
        errors.append(f"YouTube auth should not be configured in smoke env: {youtube}")
    if youtube.get("workerExecutableReady") is not False:
        errors.append(f"YouTube worker should not be executable in smoke env: {youtube}")
    if "QUIPSLY_YOUTUBE_REFRESH_TOKEN" not in (youtube.get("authEnvKeys") or []):
        errors.append(f"YouTube auth env names missing expected refresh token key: {youtube}")
    if youtube.get("workerEnvKey") != "QUIPSLY_YOUTUBE_UPLOAD_WORKER":
        errors.append(f"YouTube worker env key mismatch: {youtube}")
    if youtube.get("status") not in {"auth-missing", "worker-missing", "receipt-captured"}:
        errors.append(f"YouTube should be blocked by missing auth/worker, got: {youtube}")
    if youtube.get("safeToUploadAutomatically") is not False:
        errors.append(f"YouTube must not be safe to auto-upload yet: {youtube}")
if not shorts:
    errors.append("Missing YouTube Shorts preflight row.")
elif shorts.get("workerEnvKey") != "QUIPSLY_YOUTUBE_UPLOAD_WORKER":
    errors.append(f"YouTube Shorts should reuse the YouTube upload worker: {shorts}")

if errors:
    raise SystemExit("\n".join(errors))

print(json.dumps({
    "status": "passed",
    "recordCount": preflight.get("recordCount"),
    "readyCount": preflight.get("readyCount"),
    "safeToUploadAutomatically": preflight.get("safeToUploadAutomatically"),
    "youtubeStatus": youtube.get("status"),
    "youtubeWorkerEnvKey": youtube.get("workerEnvKey"),
}, indent=2, sort_keys=True))
PY
