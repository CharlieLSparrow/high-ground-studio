#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
NO_BUILD=false
OUTPUT_DIR="${TMPDIR:-/tmp}/quipslystudio-social-worker-smoke"
WORKER_PATH="$ROOT_DIR/script/publish_workers/social_upload_worker.py"

usage() {
  cat <<'USAGE'
Smoke Episode 1 social worker dry-run.

Usage:
  script/smoke_episode1_social_worker_dry_run.sh [--no-build] [--output-dir /absolute/output]

This proves the app can invoke the bundled social dry-run worker against
Instagram, Facebook, and LinkedIn records without creating fake provider
receipts or public URLs.
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
  "$ROOT_DIR/script/build_and_run.sh" --verify >/tmp/quipslystudio-social-worker-build.log
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
basename = "smoke-social-worker"
platforms = ["Instagram", "Facebook", "LinkedIn"]

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
proof = []

run_and_wait_processed("load-session", "episode-1-premiere-rescue", timeout_seconds=14)
state = wait_for(
    lambda payload: payload.get("activeSessionName") == "episode-1-premiere-rescue"
    and payload.get("productionReady") is True,
    timeout_seconds=20,
)
if state.get("activeSessionName") != "episode-1-premiere-rescue" or state.get("productionReady") is not True:
    raise SystemExit("Episode 1 did not become production ready before social worker smoke.")

run_and_wait_processed("full-release-prepare", output_dir, basename, "5", timeout_seconds=14)
state = wait_for(
    lambda payload: (payload.get("fullRelease") or {}).get("status") == "completed",
    timeout_seconds=150,
)

for platform in platforms:
    run_and_wait_processed(
        "publish-connector-worker-dry-run",
        platform,
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
    record = next((item for item in records if item.get("platform") == platform and item.get("deliveryLaneId") == "social-short-clips"), {})

    if worker.get("status") != "dry-run-passed":
        errors.append(f"{platform}: worker dry run did not pass: {worker}")
    if worker.get("platform") != platform:
        errors.append(f"{platform}: worker platform mismatch: {worker}")
    if not worker.get("payloadPath"):
        errors.append(f"{platform}: worker payload path missing: {worker}")
    if "wouldAttachShortVideo" not in (worker.get("resultJson") or ""):
        errors.append(f"{platform}: worker result JSON missing social dry-run intent: {worker}")
    if record.get("uploadJobStatus") != "dry-run-passed":
        errors.append(f"{platform}: upload job status was not updated to dry-run-passed: {record}")
    if record.get("publishStatus") in {"uploaded", "scheduled", "published"}:
        errors.append(f"{platform}: dry run must not mark publishStatus as uploaded/scheduled/published: {record}")
    if record.get("providerReceiptId") or record.get("publicURL") or record.get("receiptJson"):
        errors.append(f"{platform}: dry run must not create provider receipt/public URL/receipt JSON: {record}")
    if "wouldAttachShortVideo" not in record.get("uploadJobJson", ""):
        errors.append(f"{platform}: worker result was not stored in uploadJobJson: {record}")
    proof.append({
        "platform": platform,
        "workerStatus": worker.get("status"),
        "uploadJobStatus": record.get("uploadJobStatus"),
        "publishStatus": record.get("publishStatus"),
        "payloadPath": worker.get("payloadPath"),
    })

if errors:
    raise SystemExit("\n".join(errors))

print(json.dumps({
    "status": "passed",
    "deliveryLaneId": "social-short-clips",
    "platforms": proof,
}, indent=2, sort_keys=True))
PY
