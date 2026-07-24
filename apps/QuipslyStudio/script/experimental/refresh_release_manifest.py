#!/usr/bin/env python3
"""Refresh Quipsly Studio release manifest file truth from disk.

This is intentionally non-rendering and non-destructive to media. It exists for
the common production race where a large export finishes after the manifest was
written, leaving `bytes: 0` or stale ready/missing counts even though the files
are valid on disk.
"""

from __future__ import annotations

import argparse
import json
import shutil
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


def iso_now() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def load_json(path: Path) -> dict[str, Any]:
    with path.open("r", encoding="utf-8") as handle:
        payload = json.load(handle)
    if not isinstance(payload, dict):
        raise ValueError(f"{path} does not contain a JSON object")
    return payload


def write_json(path: Path, payload: dict[str, Any]) -> None:
    path.write_text(json.dumps(payload, indent=2, sort_keys=True) + "\n", encoding="utf-8")


def refresh_output_files(payload: dict[str, Any]) -> dict[str, int | bool]:
    output_files = payload.get("outputFiles")
    if not isinstance(output_files, list):
        output_files = []
        payload["outputFiles"] = output_files

    ready_count = 0
    missing_count = 0
    zero_count = 0

    for item in output_files:
        if not isinstance(item, dict):
            missing_count += 1
            continue

        path_value = item.get("path")
        path = Path(path_value) if isinstance(path_value, str) and path_value else None
        exists = bool(path and path.exists())
        bytes_value = path.stat().st_size if exists else 0
        item["exists"] = exists
        item["bytes"] = bytes_value
        if exists and bytes_value > 0:
            ready_count += 1
        else:
            missing_count += 1
            if exists:
                zero_count += 1

    planned_count = payload.get("plannedArtifactCount")
    if not isinstance(planned_count, int) or planned_count < len(output_files):
        planned_count = len(output_files)

    payload["outputFileCount"] = len(output_files)
    payload["plannedArtifactCount"] = planned_count
    payload["readyArtifactCount"] = ready_count
    payload["missingArtifactCount"] = max(0, planned_count - ready_count)
    payload["allKnownFilesExist"] = missing_count == 0

    return {
        "planned": planned_count,
        "ready": ready_count,
        "missing": max(0, planned_count - ready_count),
        "allKnownFilesExist": missing_count == 0,
        "zeroByteFiles": zero_count,
    }


def refresh_smoke_truth(payload: dict[str, Any]) -> dict[str, bool | str]:
    artifacts = payload.get("artifacts")
    if not isinstance(artifacts, dict):
        return {"afterSmokeChecked": False, "afterSmokeOk": False, "afterSmokePath": ""}

    after_path_value = artifacts.get("afterDeliveryArtifactSmoke")
    if not isinstance(after_path_value, str) or not after_path_value:
        return {"afterSmokeChecked": False, "afterSmokeOk": False, "afterSmokePath": ""}

    after_path = Path(after_path_value)
    if not after_path.exists():
        return {"afterSmokeChecked": True, "afterSmokeOk": False, "afterSmokePath": str(after_path)}

    try:
        after_payload = load_json(after_path)
    except Exception:
        return {"afterSmokeChecked": True, "afterSmokeOk": False, "afterSmokePath": str(after_path)}

    ok = bool(after_payload.get("ok"))
    payload["deliveryArtifactSmokeOkAfter"] = ok
    return {"afterSmokeChecked": True, "afterSmokeOk": ok, "afterSmokePath": str(after_path)}


def refresh_export_status(payload: dict[str, Any], file_summary: dict[str, int | bool]) -> dict[str, str | bool]:
    """Promote stale failed/stalled manifests when all planned artifacts now exist.

    This does not pretend the original export command succeeded. It records that
    artifact truth has been reconciled after a worker failure, which is the
    state the smoke checker already expects as `completed-artifacts-ready`.
    """

    current = str(payload.get("exportStatus") or "")
    all_ready = (
        file_summary.get("planned", 0) == file_summary.get("ready", -1)
        and file_summary.get("missing", 1) == 0
        and file_summary.get("allKnownFilesExist") is True
        and file_summary.get("planned", 0) > 0
    )
    promotable = current in {"failed", "stalled-timeout", "stalled", "timeout", ""}

    if not all_ready or not promotable:
        return {
            "statusPromoted": False,
            "beforeExportStatus": current,
            "afterExportStatus": current,
        }

    payload["exportStatusBeforeRefresh"] = current
    payload["exportStatus"] = "completed-artifacts-ready"
    payload["exportStatusDetail"] = (
        "All planned local artifacts exist and are non-empty after manifest refresh. "
        "Original export status preserved in exportStatusBeforeRefresh."
    )
    return {
        "statusPromoted": True,
        "beforeExportStatus": current,
        "afterExportStatus": "completed-artifacts-ready",
    }


def refresh_manifest(path: Path, *, backup: bool) -> dict[str, Any]:
    payload = load_json(path)
    before = {
        "readyArtifactCount": payload.get("readyArtifactCount"),
        "missingArtifactCount": payload.get("missingArtifactCount"),
        "allKnownFilesExist": payload.get("allKnownFilesExist"),
        "deliveryArtifactSmokeOkAfter": payload.get("deliveryArtifactSmokeOkAfter"),
    }

    if backup:
        backup_path = path.with_suffix(path.suffix + f".before-refresh-{datetime.now().strftime('%Y%m%d%H%M%S')}")
        shutil.copy2(path, backup_path)
    else:
        backup_path = None

    file_summary = refresh_output_files(payload)
    smoke_summary = refresh_smoke_truth(payload)
    status_summary = refresh_export_status(payload, file_summary)
    payload["refreshedAt"] = iso_now()
    payload["refreshSource"] = "refresh_release_manifest.py"
    payload["status"] = payload.get("status") or payload.get("exportStatus") or "release-export-manifest-ready"
    payload["humanAsk"] = payload.get("humanAsk") or "Open the local release export folder and review the 16:9 master, 9:16 master, podcast audio, shorts, and packet files before any external publishing."
    payload["agentSafeParallelWork"] = payload.get("agentSafeParallelWork") or "Codex may validate file existence, summarize durations, prepare review notes, improve metadata packets, and draft receipt slots. Do not publish, upload, schedule, send, mutate accounts, overwrite originals, or create external receipt truth."
    payload["nextSafestAction"] = payload.get("nextSafestAction") or "Run release-export-smoke on this folder, then inspect the artifacts and record local review decisions before any real platform posting."
    payload["refreshSummary"] = {
        "before": before,
        "after": file_summary,
        **smoke_summary,
        **status_summary,
    }
    write_json(path, payload)

    return {
        "path": str(path),
        "backupPath": str(backup_path) if backup_path else "",
        "before": before,
        "after": file_summary,
        "smoke": smoke_summary,
    }


def maybe_refresh_latest(manifest_path: Path, result: dict[str, Any], *, backup: bool) -> dict[str, Any] | None:
    latest_path = manifest_path.parent / "latest-release-export-manifest.json"
    if not latest_path.exists() or latest_path == manifest_path:
        return None

    latest_payload = load_json(latest_path)
    manifest_payload = load_json(manifest_path)
    same_export = (
        latest_payload.get("basename") == manifest_payload.get("basename")
        and latest_payload.get("outputDir") == manifest_payload.get("outputDir")
    )
    if not same_export:
        return {
            "path": str(latest_path),
            "skipped": True,
            "reason": "latest manifest points at a different export basename or outputDir",
        }

    if backup:
        backup_path = latest_path.with_suffix(latest_path.suffix + f".before-refresh-{datetime.now().strftime('%Y%m%d%H%M%S')}")
        shutil.copy2(latest_path, backup_path)
    else:
        backup_path = None

    write_json(latest_path, manifest_payload)
    return {
        "path": str(latest_path),
        "backupPath": str(backup_path) if backup_path else "",
        "copiedFrom": str(manifest_path),
        "after": result["after"],
    }


def main() -> int:
    parser = argparse.ArgumentParser(description="Refresh Quipsly Studio release manifest counts from disk.")
    parser.add_argument("manifest", type=Path, help="Path to *release-export-manifest.json")
    parser.add_argument("--no-backup", action="store_true", help="Do not create .before-refresh backup files.")
    parser.add_argument("--update-latest", action="store_true", help="Also refresh latest-release-export-manifest.json when it points at the same export.")
    args = parser.parse_args()

    manifest_path = args.manifest.expanduser().resolve()
    if not manifest_path.exists():
        raise SystemExit(f"Manifest not found: {manifest_path}")

    result = refresh_manifest(manifest_path, backup=not args.no_backup)
    latest_result = maybe_refresh_latest(manifest_path, result, backup=not args.no_backup) if args.update_latest else None
    print(json.dumps({"ok": True, "manifest": result, "latest": latest_result}, indent=2, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
