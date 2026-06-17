#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
NO_BUILD=false
OUTPUT_DIR="${TMPDIR:-/tmp}/quipslystudio-youtube-worker-smoke"
WORKER_PATH="$ROOT_DIR/script/publish_workers/youtube_upload_worker.py"

usage() {
  cat <<'USAGE'
Smoke Episode 1 YouTube worker dry-run.

Usage:
  script/smoke_episode1_youtube_worker_dry_run.sh [--no-build] [--output-dir /absolute/output]

This proves the app can invoke the bundled YouTube dry-run worker against a
real publish record without creating a fake provider receipt or public URL.
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
  "$ROOT_DIR/script/build_and_run.sh" --verify >/tmp/quipslystudio-youtube-worker-build.log
fi

chmod +x "$WORKER_PATH"
rm -rf "$OUTPUT_DIR"
mkdir -p "$OUTPUT_DIR"

python3 - "$ROOT_DIR" "$OUTPUT_DIR" "$WORKER_PATH" <<'PY'
import json
import subprocess
import sys
import time

root_dir = sys.argv[1]
output_dir = sys.argv[2]
worker_path = sys.argv[3]
agentctl = f"{root_dir}/script/agentctl.sh"
basename = "smoke-youtube-worker"

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
    raise SystemExit("Episode 1 did not become production ready before YouTube worker smoke.")

run_and_wait_processed("full-release-prepare", output_dir, basename, "5", timeout_seconds=14)
state = wait_for(
    lambda payload: (payload.get("fullRelease") or {}).get("status") == "completed",
    timeout_seconds=150,
)

run_and_wait_processed(
    "publish-connector-worker-dry-run",
    "YouTube Shorts",
    "social-short-clips",
    worker_path,
    timeout_seconds=14,
)
state = wait_for(
    lambda payload: (payload.get("publishConnectorWorker") or {}).get("status") in {"dry-run-passed", "failed", "blocked"},
    timeout_seconds=30,
)

worker = state.get("publishConnectorWorker") or {}
ledger = state.get("publishLedger") or {}
records = ledger.get("records") or []
shorts = next((record for record in records if record.get("platform") == "YouTube Shorts"), {})

if worker.get("status") != "dry-run-passed":
    errors.append(f"Worker dry run did not pass: {worker}")
if worker.get("platform") != "YouTube Shorts":
    errors.append(f"Worker platform mismatch: {worker}")
if not worker.get("payloadPath"):
    errors.append(f"Worker payload path missing: {worker}")
if "dry-run-passed" not in (worker.get("resultJson") or ""):
    errors.append(f"Worker result JSON missing dry-run-passed: {worker}")
if shorts.get("uploadJobStatus") != "dry-run-passed":
    errors.append(f"YouTube Shorts upload job status was not updated to dry-run-passed: {shorts}")
if shorts.get("publishStatus") in {"uploaded", "scheduled", "published"}:
    errors.append(f"Dry run must not mark publishStatus as uploaded/scheduled/published: {shorts}")
if shorts.get("providerReceiptId") or shorts.get("publicURL") or shorts.get("receiptJson"):
    errors.append(f"Dry run must not create provider receipt/public URL/receipt JSON: {shorts}")
if "networkCallsMade" not in shorts.get("uploadJobJson", ""):
    errors.append(f"Worker result was not stored in uploadJobJson: {shorts}")

if errors:
    raise SystemExit("\n".join(errors))

print(json.dumps({
    "status": "passed",
    "workerStatus": worker.get("status"),
    "platform": worker.get("platform"),
    "uploadJobStatus": shorts.get("uploadJobStatus"),
    "publishStatus": shorts.get("publishStatus"),
    "payloadPath": worker.get("payloadPath"),
}, indent=2, sort_keys=True))
PY
