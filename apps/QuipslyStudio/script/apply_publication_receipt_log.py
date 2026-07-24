#!/usr/bin/env python3
"""Apply a publication receipt log CSV back to a Quipsly publish ledger.

Default mode is a dry run. Use --write to update the ledger in place. When
writing, the script creates a timestamped backup beside the ledger and writes a
machine-readable apply report into the release folder.
"""
from __future__ import annotations

import argparse
import csv
import json
import shutil
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


def load_json(path: Path) -> dict[str, Any]:
    return json.loads(path.read_text())


def find_one(base: Path, patterns: list[str], label: str) -> Path:
    for pattern in patterns:
        matches = sorted(base.glob(pattern))
        if matches:
            return matches[0]
    raise FileNotFoundError(f"No {label} found under {base}")


def clean(value: Any) -> str:
    return str(value or "").strip()


def parse_metadata(value: str) -> dict[str, Any]:
    value = value.strip()
    if not value:
        return {}
    try:
        parsed = json.loads(value)
        return parsed if isinstance(parsed, dict) else {"value": parsed}
    except json.JSONDecodeError:
        return {"rawText": value}


def receipt_payload(row: dict[str, str], applied_at: str) -> dict[str, Any]:
    metadata = parse_metadata(clean(row.get("metadata_json")))
    payload: dict[str, Any] = {
        "model": "quipsly-publication-receipt",
        "version": "2026-06-17.publication-receipt-log.v1",
        "appliedAt": applied_at,
        "status": clean(row.get("new_status")) or "published",
        "platform": clean(row.get("platform")),
        "publicURL": clean(row.get("public_url")),
        "providerReceiptId": clean(row.get("provider_receipt_id")),
        "notes": clean(row.get("notes")),
        "source": "publication-receipt-log.csv",
    }
    if metadata:
        payload["metadata"] = metadata
    return payload


def infer_basename(release_folder: Path, ledger_path: Path) -> str:
    bundle_manifests = sorted(release_folder.glob("*-upload-packet-bundle/*-upload-packet-bundle.json"))
    if bundle_manifests:
        stem = bundle_manifests[0].stem
        if stem.endswith("-upload-packet-bundle"):
            return stem[: -len("-upload-packet-bundle")]
        return stem
    stem = ledger_path.stem
    if stem.endswith("-publish-ledger"):
        return stem[: -len("-publish-ledger")]
    return stem


def run_json_command(command: list[str]) -> dict[str, Any]:
    completed = subprocess.run(command, check=False, text=True, capture_output=True)
    payload: dict[str, Any] = {
        "command": command,
        "returnCode": completed.returncode,
        "stdout": completed.stdout.strip(),
        "stderr": completed.stderr.strip(),
    }
    try:
        parsed = json.loads(completed.stdout)
        if isinstance(parsed, dict):
            payload["json"] = parsed
    except json.JSONDecodeError:
        pass
    if completed.returncode != 0:
        raise RuntimeError(json.dumps(payload, indent=2, sort_keys=True))
    return payload


def refresh_handoff_artifacts(release_folder: Path, basename: str) -> list[dict[str, Any]]:
    script_dir = Path(__file__).resolve().parent
    verification_path = release_folder / "release-verification.json"
    commands = [
        [
            sys.executable,
            str(script_dir / "build_publish_upload_packet_bundle.py"),
            str(release_folder),
            "--output",
            str(release_folder),
            "--basename",
            basename,
        ],
        [
            sys.executable,
            str(script_dir / "build_publication_cockpit.py"),
            str(release_folder),
            "--basename",
            basename,
        ],
        [
            sys.executable,
            str(script_dir / "verify_release_folder.py"),
            str(release_folder),
            "--write",
            str(verification_path),
        ],
    ]
    return [run_json_command(command) for command in commands]


def apply_receipts(
    release_folder: Path,
    receipt_log: Path,
    ledger_path: Path,
    write: bool,
    refresh_handoff: bool,
    basename: str,
) -> dict[str, Any]:
    ledger = load_json(ledger_path)
    records = ledger.get("records") or []
    if not isinstance(records, list):
        raise RuntimeError(f"Publish ledger has no records list: {ledger_path}")

    records_by_id = {
        str(record.get("id") or ""): record
        for record in records
        if isinstance(record, dict) and record.get("id")
    }
    rows = list(csv.DictReader(receipt_log.open(newline="")))
    applied_at = datetime.now(timezone.utc).isoformat()
    updates: list[dict[str, Any]] = []
    skipped: list[dict[str, Any]] = []
    missing: list[dict[str, Any]] = []

    for index, row in enumerate(rows, start=2):
        receipt_id = clean(row.get("receipt_id"))
        public_url = clean(row.get("public_url"))
        provider_id = clean(row.get("provider_receipt_id"))
        new_status = clean(row.get("new_status")) or "published"
        if not receipt_id:
            skipped.append({"row": index, "reason": "missing receipt_id"})
            continue
        if not public_url and not provider_id:
            skipped.append({"row": index, "receiptId": receipt_id, "reason": "no public_url or provider_receipt_id"})
            continue
        record = records_by_id.get(receipt_id)
        if record is None:
            missing.append({"row": index, "receiptId": receipt_id, "reason": "receipt id not found in ledger"})
            continue

        before = {
            "publishStatus": record.get("publishStatus") or "",
            "publicURL": record.get("publicURL") or "",
            "providerReceiptId": record.get("providerReceiptId") or "",
        }
        after = {
            "publishStatus": new_status,
            "publicURL": public_url or before["publicURL"],
            "providerReceiptId": provider_id or before["providerReceiptId"],
        }
        updates.append(
            {
                "row": index,
                "receiptId": receipt_id,
                "platform": record.get("platform") or clean(row.get("platform")),
                "displayLabel": record.get("displayLabel") or clean(row.get("display_label")),
                "before": before,
                "after": after,
            }
        )
        if write:
            record["publishStatus"] = after["publishStatus"]
            record["publicURL"] = after["publicURL"]
            record["providerReceiptId"] = after["providerReceiptId"]
            record["receiptJson"] = json.dumps(receipt_payload(row, applied_at), sort_keys=True)
            if clean(row.get("notes")):
                record["notes"] = clean(row.get("notes"))
            record["updatedAt"] = applied_at

    report = {
        "model": "quipsly-publication-receipt-log-apply-report",
        "version": "2026-06-17.publication-receipt-log-apply.v1",
        "generatedAt": applied_at,
        "mode": "write" if write else "dry-run",
        "releaseFolder": str(release_folder),
        "receiptLog": str(receipt_log),
        "publishLedger": str(ledger_path),
        "rowCount": len(rows),
        "updateCount": len(updates),
        "skippedCount": len(skipped),
        "missingCount": len(missing),
        "updates": updates,
        "skipped": skipped,
        "missing": missing,
        "refreshHandoffRequested": refresh_handoff,
        "sourcePolicy": "Receipt apply updates publish ledger receipt fields only; it does not touch media artifacts or platform state. Optional refresh rebuilds handoff projections from the updated ledger.",
    }

    if write:
        backup_path = ledger_path.with_suffix(ledger_path.suffix + f".backup-{applied_at.replace(':', '').replace('+', 'Z')}")
        shutil.copy2(ledger_path, backup_path)
        ledger_path.write_text(json.dumps(ledger, indent=2, sort_keys=True) + "\n")
        report["backupPath"] = str(backup_path)
        if refresh_handoff:
            report["refreshResults"] = refresh_handoff_artifacts(release_folder, basename)
        report_path = release_folder / "publication-receipt-apply-report.json"
        report_path.write_text(json.dumps(report, indent=2, sort_keys=True) + "\n")
        report["reportPath"] = str(report_path)

    return report


def main() -> int:
    parser = argparse.ArgumentParser(description="Apply publication receipt log rows back to a publish ledger.")
    parser.add_argument("release_folder", type=Path)
    parser.add_argument("--receipt-log", type=Path, default=None)
    parser.add_argument("--ledger", type=Path, default=None)
    parser.add_argument("--write", action="store_true", help="Update the publish ledger in place. Default is dry-run.")
    parser.add_argument("--refresh-handoff", action="store_true", help="After --write, rebuild upload bundle, publication cockpit, and release verification.")
    parser.add_argument("--basename", default="", help="Basename for refreshed handoff artifacts. Defaults to existing upload bundle/ledger basename.")
    args = parser.parse_args()

    try:
        release_folder = args.release_folder.expanduser().resolve()
        if not release_folder.exists() or not release_folder.is_dir():
            raise FileNotFoundError(f"Release folder does not exist: {release_folder}")
        receipt_log = (args.receipt_log or release_folder / "publication-receipt-log.csv").expanduser().resolve()
        ledger_path = (args.ledger or find_one(release_folder, ["*-publish-packet/*-publish-ledger.json", "*publish-ledger.json"], "publish ledger")).expanduser().resolve()
        if not receipt_log.exists():
            raise FileNotFoundError(f"Receipt log does not exist: {receipt_log}")
        if not ledger_path.exists():
            raise FileNotFoundError(f"Publish ledger does not exist: {ledger_path}")
        if args.refresh_handoff and not args.write:
            raise RuntimeError("--refresh-handoff requires --write so refreshed artifacts are based on an updated ledger.")

        basename = args.basename.strip() or infer_basename(release_folder, ledger_path)
        report = apply_receipts(release_folder, receipt_log, ledger_path, args.write, args.refresh_handoff, basename)
        print(json.dumps(report, indent=2, sort_keys=True))
        return 0 if report["missingCount"] == 0 else 1
    except Exception as exc:  # noqa: BLE001 - operator tool should return calm JSON diagnostics.
        print(json.dumps({"status": "error", "error": str(exc)}, indent=2, sort_keys=True))
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
