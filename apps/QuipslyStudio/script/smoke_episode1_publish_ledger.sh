#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
NO_BUILD=false
OUTPUT_DIR="${TMPDIR:-/tmp}/quipslystudio-publish-ledger-smoke"

usage() {
  cat <<'USAGE'
Smoke Episode 1 publish ledger.

Usage:
  script/smoke_episode1_publish_ledger.sh [--no-build] [--output-dir /absolute/output]

This proves release artifacts can become platform-specific publish records, and
that a receipt update survives ledger regeneration.
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
  "$ROOT_DIR/script/build_and_run.sh" --verify >/tmp/quipslystudio-publish-ledger-build.log
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
basename = "smoke-ledger"

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

def wait_for(predicate, timeout_seconds=90, interval_seconds=0.5):
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
    raise SystemExit("Episode 1 did not become production ready before publish ledger smoke.")

run_and_wait_processed("release-prepare", output_dir, basename, "5", timeout_seconds=14)
state = wait_for(
    lambda payload: (payload.get("exportState") or {}).get("status") == "completed"
    and (payload.get("deliveryPacket") or {}).get("status") == "generated",
    timeout_seconds=120,
)
if (state.get("exportState") or {}).get("kind") != "release-prep":
    errors.append("Release prepare did not complete before ledger generation.")

run_and_wait_processed("publish-ledger-generate", timeout_seconds=14)
state = wait_for(
    lambda payload: int((payload.get("publishLedger") or {}).get("recordCount") or 0) >= 8,
    timeout_seconds=20,
)
ledger = state.get("publishLedger") or {}
records = ledger.get("records") or []
platforms = {record.get("platform") for record in records}
required_platforms = {"YouTube", "Patreon", "YouTube Shorts", "Instagram", "Facebook", "LinkedIn", "Spotify", "Apple Podcasts"}
terminal_statuses = {"uploaded", "scheduled", "published"}
acceptable_platform_statuses = {"ready-to-upload", *terminal_statuses}
missing = sorted(required_platforms - platforms)
if missing:
    errors.append(f"Missing publish platforms: {missing}")
required_records = [record for record in records if record.get("platform") in required_platforms]
upload_or_receipt_count = sum(1 for record in required_records if record.get("publishStatus") in acceptable_platform_statuses)
if upload_or_receipt_count != 8:
    errors.append(f"Expected 8 uploadable-or-receipted records, got {upload_or_receipt_count}")
bad_records = [
    record
    for record in required_records
    if record.get("publishStatus") not in acceptable_platform_statuses
]
if bad_records:
    errors.append(f"Expected all generated platform records to be uploadable or already receipted: {bad_records[:2]}")
missing_metadata = [
    record
    for record in required_records
    if (
        not record.get("metadataJson")
        or not record.get("uploadJobKind")
        or not record.get("uploadJobStatus")
        or not record.get("uploadJobJson")
    )
]
if missing_metadata:
    errors.append(f"Expected all records to have metadata and upload job stubs: {missing_metadata[:2]}")
not_ready_metadata = [
    record
    for record in required_records
    if record.get("publishStatus") == "ready-to-upload"
    and record.get("uploadJobStatus") != "integration-needed"
]
if not_ready_metadata:
    errors.append(f"Expected ready records to have integration-needed upload jobs: {not_ready_metadata[:2]}")

checklist = get_json("publish-release-checklist")
if checklist.get("recordCount") != 8:
    errors.append(f"Expected release checklist recordCount 8, got {checklist.get('recordCount')}: {checklist}")
if checklist.get("artifactReadyCount") != 8:
    errors.append(f"Expected release checklist artifactReadyCount 8, got {checklist.get('artifactReadyCount')}")
if checklist.get("copyReadyCount") != 8:
    errors.append(f"Expected release checklist copyReadyCount 8, got {checklist.get('copyReadyCount')}")
if checklist.get("readinessLevel") not in {"ready-for-manual-upload", "partially-released", "released"}:
    errors.append(f"Unexpected release checklist readiness level: {checklist.get('readinessLevel')}")
if not checklist.get("nextActions"):
    errors.append("Expected release checklist to include ranked nextActions.")
if len(checklist.get("records") or []) != 8:
    errors.append(f"Expected release checklist to include 8 records, got {len(checklist.get('records') or [])}")

youtube = next((record for record in records if record.get("platform") == "YouTube"), None)
if not youtube:
    errors.append("No YouTube record to update.")
else:
    custom_metadata = '{"title":"Smoke Custom YouTube Title","description":"Custom metadata should survive."}'
    run_and_wait_processed(
        "publish-receipt-update",
        youtube["id"],
        "published",
        "https://example.com/quipsly-smoke-youtube",
        "smoke-youtube-provider-id",
        "Smoke published receipt",
        custom_metadata,
        "attempted",
        timeout_seconds=14,
    )
    state = wait_for(
        lambda payload: any(
            record.get("id") == youtube["id"] and record.get("publishStatus") == "published"
            for record in (payload.get("publishLedger") or {}).get("records", [])
        ),
        timeout_seconds=20,
    )
    updated = next((record for record in (state.get("publishLedger") or {}).get("records", []) if record.get("id") == youtube["id"]), {})
    if updated.get("publicURL") != "https://example.com/quipsly-smoke-youtube":
        errors.append(f"YouTube public URL was not saved: {updated}")
    if "Smoke Custom YouTube Title" not in updated.get("metadataJson", ""):
        errors.append(f"YouTube metadata update was not saved: {updated}")
    if updated.get("uploadJobStatus") != "attempted":
        errors.append(f"YouTube upload job status was not saved: {updated}")
    run_and_wait_processed("publish-ledger-generate", timeout_seconds=14)
    state = wait_for(
        lambda payload: any(
            record.get("id") == youtube["id"] and record.get("publishStatus") == "published"
            for record in (payload.get("publishLedger") or {}).get("records", [])
        ),
        timeout_seconds=20,
    )
    preserved = next((record for record in (state.get("publishLedger") or {}).get("records", []) if record.get("id") == youtube["id"]), {})
    if preserved.get("publishStatus") != "published":
        errors.append(f"Published receipt was not preserved after regeneration: {preserved}")
    if "Smoke Custom YouTube Title" not in preserved.get("metadataJson", ""):
        errors.append(f"Published receipt metadata was not preserved after regeneration: {preserved}")

run_and_wait_processed(
    "publish-receipt-update-platform",
    "LinkedIn",
    "social-short-clips",
    "scheduled",
    "https://example.com/quipsly-smoke-linkedin",
    "smoke-linkedin-provider-id",
    "Smoke scheduled LinkedIn receipt",
    "Smoke LinkedIn Release Title",
    "Smoke LinkedIn description synchronized into metadata JSON.",
    timeout_seconds=14,
)
state = wait_for(
    lambda payload: any(
        record.get("platform") == "LinkedIn"
        and record.get("deliveryLaneId") == "social-short-clips"
        and record.get("publishStatus") == "scheduled"
        for record in (payload.get("publishLedger") or {}).get("records", [])
    ),
    timeout_seconds=20,
)
linkedin = next((
    record
    for record in (state.get("publishLedger") or {}).get("records", [])
    if record.get("platform") == "LinkedIn" and record.get("deliveryLaneId") == "social-short-clips"
), {})
if linkedin.get("publishStatus") != "scheduled":
    errors.append(f"LinkedIn by-platform receipt status was not saved: {linkedin}")
if linkedin.get("publicURL") != "https://example.com/quipsly-smoke-linkedin":
    errors.append(f"LinkedIn by-platform public URL was not saved: {linkedin}")
if linkedin.get("providerReceiptId") != "smoke-linkedin-provider-id":
    errors.append(f"LinkedIn by-platform provider id was not saved: {linkedin}")
if linkedin.get("title") != "Smoke LinkedIn Release Title":
    errors.append(f"LinkedIn by-platform title was not saved: {linkedin}")
if linkedin.get("description") != "Smoke LinkedIn description synchronized into metadata JSON.":
    errors.append(f"LinkedIn by-platform description was not saved: {linkedin}")
if "Smoke LinkedIn Release Title" not in linkedin.get("metadataJson", ""):
    errors.append(f"LinkedIn title was not synchronized into metadata JSON: {linkedin}")
if "Smoke LinkedIn description synchronized into metadata JSON." not in linkedin.get("metadataJson", ""):
    errors.append(f"LinkedIn description was not synchronized into metadata JSON: {linkedin}")

checklist = get_json("publish-release-checklist")
if checklist.get("receiptCapturedCount", 0) < 2:
    errors.append(f"Expected release checklist to count YouTube and LinkedIn receipts, got {checklist.get('receiptCapturedCount')}: {checklist}")
if checklist.get("readinessLevel") != "partially-released":
    errors.append(f"Expected release checklist readiness partially-released after receipts, got {checklist.get('readinessLevel')}")

run_and_wait_processed("publish-packet-generate", output_dir, basename, timeout_seconds=14)
state = wait_for(
    lambda payload: (payload.get("publishPacket") or {}).get("status") == "generated",
    timeout_seconds=20,
)
packet = state.get("publishPacket") or {}
packet_path = packet.get("outputPath") or ""
if not packet_path or not os.path.isdir(packet_path):
    errors.append(f"Publish packet folder was not created: {packet}")
else:
    expected_files = [
        f"{basename}-publish-ledger.json",
        f"{basename}-publish-release-checklist.json",
        f"{basename}-publish-manifest.json",
    ]
    missing_files = [name for name in expected_files if not os.path.exists(os.path.join(packet_path, name))]
    if missing_files:
        errors.append(f"Publish packet missing expected root files: {missing_files}")
    checklist_path = os.path.join(packet_path, f"{basename}-publish-release-checklist.json")
    if os.path.exists(checklist_path):
        with open(checklist_path) as f:
            packet_checklist = json.load(f)
        if packet_checklist.get("recordCount") != 8:
            errors.append(f"Publish packet checklist recordCount wrong: {packet_checklist}")
        if packet_checklist.get("readinessLevel") != "partially-released":
            errors.append(f"Publish packet checklist readiness wrong: {packet_checklist.get('readinessLevel')}")
    metadata_files = [name for name in os.listdir(packet_path) if name.endswith("-metadata.json")]
    job_files = [name for name in os.listdir(packet_path) if name.endswith("-upload-job.json")]
    checklist_files = [name for name in os.listdir(packet_path) if name.endswith("-checklist.md")]
    if len(metadata_files) < 8:
        errors.append(f"Expected at least 8 metadata files in publish packet, got {len(metadata_files)}")
    if len(job_files) < 8:
        errors.append(f"Expected at least 8 upload job files in publish packet, got {len(job_files)}")
    if len(checklist_files) < 8:
        errors.append(f"Expected at least 8 checklist files in publish packet, got {len(checklist_files)}")
    linkedin_metadata_path = next((os.path.join(packet_path, name) for name in metadata_files if "LinkedIn".lower() in name.lower()), None)
    if not linkedin_metadata_path:
        errors.append("No LinkedIn metadata file found in publish packet.")
    else:
        with open(linkedin_metadata_path) as f:
            linkedin_metadata_text = f.read()
        if "Smoke LinkedIn Release Title" not in linkedin_metadata_text:
            errors.append("LinkedIn publish packet metadata did not include synchronized title.")

proof = {
    "status": "failed" if errors else "passed",
    "outputDir": output_dir,
    "publishPacketPath": (state.get("publishPacket") or {}).get("outputPath"),
    "recordCount": (state.get("publishLedger") or {}).get("recordCount"),
    "releaseChecklistReadiness": checklist.get("readinessLevel"),
    "releaseChecklistReceiptCount": checklist.get("receiptCapturedCount"),
    "readyToUploadCount": (state.get("publishLedger") or {}).get("readyToUploadCount"),
    "publishedCount": (state.get("publishLedger") or {}).get("publishedCount"),
    "platforms": sorted(platforms),
    "errors": errors,
}
print(json.dumps(proof, indent=2, sort_keys=True))
if errors:
    raise SystemExit(1)
PY
