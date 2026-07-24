#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
NO_BUILD=false
OUTPUT_DIR="${QUIPSLY_RELEASE_PROOF_DIR:-$HOME/Movies/QuipslyExports/ReleaseProofs/episodes-1-3-full-release-smoke}"
PROOF_SECONDS="${QUIPSLY_RELEASE_PROOF_SECONDS:-5}"

usage() {
  cat <<'USAGE'
Smoke Episodes 1-3 full release prep.

Usage:
  script/smoke_episodes_1_3_full_release_prepare.sh [--no-build] [--output-dir /absolute/output] [--proof-seconds n]

This proves each rescue/native episode session can prepare the same release
surface from the same metadata edit model:
  - 16:9 episode master proof video,
  - 9:16 vertical proof video,
  - podcast audio proof master,
  - delivery packet,
  - publish ledger/checklist/manifest handoff files.

The proof duration is intentionally short by default so this remains a fast
readiness smoke. It writes outside /tmp by default because publish checklists
intentionally refuse to mark temporary artifacts as production handoff ready.
It does not claim the full public upload has happened.
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
    --proof-seconds)
      PROOF_SECONDS="${2:-}"
      if [[ -z "$PROOF_SECONDS" ]]; then
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
  "$ROOT_DIR/script/build_and_run.sh" --verify >/tmp/quipslystudio-episodes-1-3-full-release-build.log
fi

rm -rf "$OUTPUT_DIR"
mkdir -p "$OUTPUT_DIR"

python3 - "$ROOT_DIR" "$OUTPUT_DIR" "$PROOF_SECONDS" <<'PY'
import json
import os
import subprocess
import sys
import time

root_dir = sys.argv[1]
output_root = sys.argv[2]
proof_seconds = sys.argv[3]
agentctl = f"{root_dir}/script/agentctl.sh"

sessions = [
    ("episode-1-premiere-rescue", "episode-1"),
    ("episode-2-native-proof", "episode-2"),
    ("episode-3-premiere-rescue", "episode-3"),
]


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


def wait_for(predicate, timeout_seconds=180, interval_seconds=0.5):
    deadline = time.time() + timeout_seconds
    latest = {}
    while time.time() <= deadline:
        latest = get_json("state")
        if predicate(latest):
            return latest
        time.sleep(interval_seconds)
    return latest


def run_and_wait_processed(*args, timeout_seconds=20):
    before = get_json("state")
    target_serial = int(before.get("agentCommandSerial") or 0) + 1
    run_command(*args)
    return wait_for(
        lambda payload: int(payload.get("agentLastProcessedCommandSerial") or 0) >= target_serial,
        timeout_seconds=timeout_seconds,
    )


def expected_paths(output_dir, basename):
    packet_dir = os.path.join(output_dir, f"{basename}-publish-packet")
    return {
        "episode16x9": os.path.join(output_dir, f"{basename}-16x9.mp4"),
        "episode9x16": os.path.join(output_dir, f"{basename}-9x16.mp4"),
        "podcastAudio": os.path.join(output_dir, f"{basename}-podcast-audio.m4a"),
        "deliveryPacket": os.path.join(output_dir, f"{basename}-delivery-packet.json"),
        "publishLedger": os.path.join(packet_dir, f"{basename}-publish-ledger.json"),
        "publishChecklist": os.path.join(packet_dir, f"{basename}-publish-release-checklist.json"),
        "publishManifest": os.path.join(packet_dir, f"{basename}-publish-manifest.json"),
    }


def file_state(path):
    return {
        "path": path,
        "exists": os.path.exists(path),
        "sizeBytes": os.path.getsize(path) if os.path.exists(path) else 0,
    }


summaries = []
all_errors = []

for session_name, slug in sessions:
    output_dir = os.path.join(output_root, slug)
    os.makedirs(output_dir, exist_ok=True)
    basename = f"{slug}-release-proof"
    errors = []

    run_and_wait_processed("load-session", session_name, timeout_seconds=20)
    state = wait_for(
        lambda payload: payload.get("activeSessionName") == session_name
        and payload.get("productionReady") is True,
        timeout_seconds=90,
    )
    if state.get("activeSessionName") != session_name or state.get("productionReady") is not True:
        raise SystemExit(f"{session_name} did not become production ready: {state.get('productionReadinessDetail')}")

    run_and_wait_processed("full-release-prepare", output_dir, basename, proof_seconds, timeout_seconds=20)
    state = wait_for(
        lambda payload: (payload.get("fullRelease") or {}).get("status") in {"completed", "failed", "blocked"},
        timeout_seconds=240,
    )

    full_release = state.get("fullRelease") or {}
    export_state = state.get("exportState") or {}
    delivery_packet = state.get("deliveryPacket") or {}
    publish_ledger = state.get("publishLedger") or {}
    checklist = state.get("publishReleaseChecklist") or {}
    publish_packet = state.get("publishPacket") or {}
    paths = expected_paths(output_dir, basename)
    files = {key: file_state(path) for key, path in paths.items()}

    if full_release.get("status") != "completed":
        errors.append(f"Full release did not complete: {full_release}")
    if export_state.get("status") != "completed" or export_state.get("kind") != "release-prep":
        errors.append(f"Release export did not complete: {export_state}")
    if delivery_packet.get("status") != "generated":
        errors.append(f"Delivery packet was not generated: {delivery_packet}")
    if publish_packet.get("status") != "generated":
        errors.append(f"Publish packet was not generated: {publish_packet}")
    if int(publish_ledger.get("recordCount") or 0) <= 0:
        errors.append(f"Publish ledger has no records: {publish_ledger}")
    if int(checklist.get("recordCount") or 0) <= 0:
        errors.append(f"Release checklist has no records: {checklist}")
    if checklist.get("readinessLevel") not in {"ready-for-manual-upload", "partially-released", "released"}:
        errors.append(f"Unexpected release checklist readiness: {checklist.get('readinessLevel')}")

    for label, info in files.items():
        if not info["exists"]:
            errors.append(f"Missing {label}: {info['path']}")
        elif info["sizeBytes"] <= 1024:
            errors.append(f"{label} is too small: {info['sizeBytes']} bytes at {info['path']}")

    packet = {}
    if files["deliveryPacket"]["exists"]:
        with open(files["deliveryPacket"]["path"], "r", encoding="utf-8") as handle:
            packet = json.load(handle)
        if packet.get("readyForDirectPublishing") is not False:
            errors.append("Delivery packet must not claim direct publishing is complete.")
        artifacts = {artifact.get("laneId"): artifact for artifact in packet.get("artifacts", [])}
        for lane_id in ["episode-16x9-master", "episode-9x16-master", "podcast-audio-master", "social-short-clips"]:
            artifact = artifacts.get(lane_id, {})
            if artifact.get("status") != "exported":
                errors.append(f"{lane_id} should be exported: {artifact}")

    summaries.append({
        "session": session_name,
        "slug": slug,
        "status": "passed" if not errors else "failed",
        "outputDir": output_dir,
        "fullRelease": {
            "status": full_release.get("status"),
            "step": full_release.get("step"),
        },
        "exportState": {
            "status": export_state.get("status"),
            "kind": export_state.get("kind"),
            "error": export_state.get("error") or "",
        },
        "deliveryPacket": {
            "status": delivery_packet.get("status"),
            "outputPath": delivery_packet.get("outputPath"),
        },
        "publishLedgerRecordCount": publish_ledger.get("recordCount"),
        "releaseChecklist": {
            "recordCount": checklist.get("recordCount"),
            "artifactReadyCount": checklist.get("artifactReadyCount"),
            "readinessLevel": checklist.get("readinessLevel"),
        },
        "publishPacket": {
            "status": publish_packet.get("status"),
            "outputPath": publish_packet.get("outputPath"),
        },
        "files": files,
        "errors": errors,
    })
    all_errors.extend([f"{session_name}: {error}" for error in errors])

print(json.dumps({
    "status": "passed" if not all_errors else "failed",
    "outputRoot": output_root,
    "proofSeconds": proof_seconds,
    "sessions": summaries,
    "architectureInvariant": "Full release artifacts are generated from proxy-backed whole-lane edit decisions plus delivery/publish handoff metadata; direct platform publishing remains receipt-gated.",
    "errors": all_errors,
}, indent=2, sort_keys=True))

if all_errors:
    raise SystemExit(1)
PY
