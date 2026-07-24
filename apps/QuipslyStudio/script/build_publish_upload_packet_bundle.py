#!/usr/bin/env python3
"""Build a whole-release publish upload packet bundle from a Quipsly publish ledger.

This is the offline companion to the native app's upload-bundle generator. It
does not upload, schedule, publish, or mutate source media. It packages the
publish ledger into one JSON packet per platform record plus an index, manifest,
README, and optional ZIP archive.
"""
from __future__ import annotations

import argparse
import csv
import json
import shutil
from datetime import datetime, timezone
from pathlib import Path
from typing import Any
import re


def slugify(value: str) -> str:
    value = value.lower().replace("'", "")
    value = re.sub(r"[^a-z0-9]+", "-", value).strip("-")
    return value or "packet"


def load_json(path: Path) -> dict[str, Any]:
    return json.loads(path.read_text())


def parse_json_text(value: str | None) -> dict[str, Any]:
    if not value:
        return {}
    try:
        parsed = json.loads(value)
        return parsed if isinstance(parsed, dict) else {"value": parsed}
    except json.JSONDecodeError:
        return {"rawText": value}


def find_publish_ledger(release_folder: Path) -> Path:
    candidates = sorted(release_folder.glob("*-publish-packet/*-publish-ledger.json"))
    if not candidates:
        candidates = sorted(release_folder.glob("*publish-ledger.json"))
    if not candidates:
        raise FileNotFoundError(f"No publish ledger found under {release_folder}")
    return candidates[0]


def display_label(record: dict[str, Any]) -> str:
    return (
        record.get("displayLabel")
        or record.get("title")
        or f"{record.get('platform', 'Unknown')} {record.get('deliveryLaneId', '')}"
    )


def lane_label(record: dict[str, Any]) -> str:
    return record.get("laneDisplayLabel") or record.get("deliveryLaneId") or "artifact"


def receipt_command(record: dict[str, Any]) -> str:
    receipt_id = record.get("id") or "<receipt-id>"
    return f'script/agentctl.sh publish-receipt-update {receipt_id} published <public-url> <provider-id> "manual receipt"'


def packet_payload(record: dict[str, Any]) -> dict[str, Any]:
    artifact_path = str(record.get("artifactPath") or "")
    return {
        "model": "quipsly-publish-upload-packet",
        "version": "2026-06-17.offline-publish-upload-packet.v1",
        "receiptId": record.get("id") or "",
        "displayLabel": display_label(record),
        "platform": record.get("platform") or "",
        "deliveryLaneId": record.get("deliveryLaneId") or "",
        "destinationId": record.get("destinationId") or "",
        "destinationGuidance": record.get("destinationGuidance") or {},
        "title": record.get("title") or "",
        "description": record.get("description") or "",
        "artifactPath": artifact_path,
        "artifactType": record.get("artifactType") or "",
        "artifactStatus": record.get("artifactStatus") or "",
        "artifactExists": bool(artifact_path and Path(artifact_path).exists()),
        "format": record.get("format") or "",
        "metadataStatus": record.get("metadataStatus") or "",
        "metadata": parse_json_text(record.get("metadataJson")),
        "uploadJobKind": record.get("uploadJobKind") or "",
        "uploadJobStatus": record.get("uploadJobStatus") or "",
        "uploadJob": parse_json_text(record.get("uploadJobJson")),
        "publishStatus": record.get("publishStatus") or "",
        "publicURL": record.get("publicURL") or "",
        "providerReceiptId": record.get("providerReceiptId") or "",
        "receiptCaptured": bool(record.get("publicURL") or record.get("providerReceiptId")),
        "sourcePolicy": "This packet references rendered derivative artifacts only; source media remains untouched.",
        "manualUploadChecklist": [
            "Confirm artifactExists is true.",
            "Open artifactPath and watch/listen once before upload.",
            "Use title and description as platform copy drafts.",
            "Upload or schedule manually until direct platform connectors are proven.",
            "Capture the public or scheduled URL back onto this receipt.",
        ],
        "agentReceiptCommand": receipt_command(record),
    }


def csv_escape(value: Any) -> str:
    text = str(value or "")
    return '"' + text.replace('"', '""') + '"'


def write_bundle(ledger_path: Path, output_folder: Path, basename: str, make_zip: bool) -> dict[str, Any]:
    ledger = load_json(ledger_path)
    records = ledger.get("records") or []
    if not isinstance(records, list) or not records:
        raise RuntimeError(f"No records found in publish ledger: {ledger_path}")

    safe_base = slugify(basename or ledger_path.stem.replace("-publish-ledger", ""))
    bundle_folder = output_folder / f"{safe_base}-upload-packet-bundle"
    packets_folder = bundle_folder / "upload-packets"
    packets_folder.mkdir(parents=True, exist_ok=True)

    packet_rows: list[dict[str, Any]] = []
    sorted_records = sorted(records, key=lambda r: (str(r.get("platform") or ""), str(r.get("deliveryLaneId") or ""), display_label(r)))
    for index, record in enumerate(sorted_records, start=1):
        packet = packet_payload(record)
        filename = f"{index:02d}-{slugify(packet['platform'])}-{slugify(lane_label(record))}.json"
        packet_path = packets_folder / filename
        packet_path.write_text(json.dumps(packet, indent=2, sort_keys=True) + "\n")
        packet_rows.append(
            {
                "index": index,
                "receiptId": packet["receiptId"],
                "platform": packet["platform"],
                "deliveryLaneId": packet["deliveryLaneId"],
                "format": packet["format"],
                "displayLabel": packet["displayLabel"],
                "artifactPath": packet["artifactPath"],
                "artifactExists": packet["artifactExists"],
                "publishStatus": packet["publishStatus"],
                "receiptCaptured": packet["receiptCaptured"],
                "packetPath": str(packet_path),
                "receiptCaptureCommand": packet["agentReceiptCommand"],
            }
        )

    manifest = {
        "model": "quipsly-publish-upload-packet-bundle",
        "version": "2026-06-17.offline-publish-upload-packet-bundle.v1",
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "sourcePublishLedger": str(ledger_path),
        "bundleFolder": str(bundle_folder),
        "recordCount": len(packet_rows),
        "artifactReadyCount": sum(1 for row in packet_rows if row["artifactExists"]),
        "receiptCapturedCount": sum(1 for row in packet_rows if row["receiptCaptured"]),
        "sourcePolicy": "Upload packets reference rendered derivative artifacts and platform copy; source media remains untouched.",
        "operatorRule": "Upload or schedule each rendered artifact, then capture the platform URL back through receiptCaptureCommand.",
        "packets": packet_rows,
    }

    manifest_path = bundle_folder / f"{safe_base}-upload-packet-bundle.json"
    manifest_path.write_text(json.dumps(manifest, indent=2, sort_keys=True) + "\n")

    headers = [
        "index",
        "receipt_id",
        "platform",
        "delivery_lane_id",
        "format",
        "display_label",
        "artifact_exists",
        "publish_status",
        "receipt_captured",
        "artifact_path",
        "packet_path",
        "receipt_capture_command",
    ]
    csv_path = bundle_folder / f"{safe_base}-upload-packet-index.csv"
    with csv_path.open("w", newline="") as handle:
        writer = csv.writer(handle)
        writer.writerow(headers)
        for row in packet_rows:
            writer.writerow(
                [
                    row["index"],
                    row["receiptId"],
                    row["platform"],
                    row["deliveryLaneId"],
                    row["format"],
                    row["displayLabel"],
                    row["artifactExists"],
                    row["publishStatus"],
                    row["receiptCaptured"],
                    row["artifactPath"],
                    row["packetPath"],
                    row["receiptCaptureCommand"],
                ]
            )

    readme_path = bundle_folder / "README.md"
    readme_lines = [
        "# Publish Upload Packet Bundle",
        "",
        "This folder is a whole-release upload handoff. It does not upload, schedule, publish, or mutate source media.",
        "",
        f"- Records: {len(packet_rows)}",
        f"- Artifact paths present: {manifest['artifactReadyCount']}",
        f"- Receipts already captured: {manifest['receiptCapturedCount']}",
        "",
        "## Files",
        f"- `{manifest_path.name}`: machine-readable manifest",
        f"- `{csv_path.name}`: spreadsheet-friendly upload index",
        "- `upload-packets/*.json`: one packet per platform record",
        "",
        "## Closed-loop rule",
        "A platform post is not complete when the file exists. It is complete when its public or scheduled URL is captured back into Quipsly using the receipt command.",
        "",
        "## Upload order",
    ]
    for row in packet_rows:
        readme_lines.extend(
            [
                f"{row['index']}. {row['platform']} - {row['displayLabel']}",
                f"   - Packet: `upload-packets/{Path(row['packetPath']).name}`",
                f"   - Receipt command: `{row['receiptCaptureCommand']}`",
            ]
        )
    readme_path.write_text("\n".join(readme_lines) + "\n")

    archive_path = bundle_folder.with_suffix(".zip")
    if make_zip:
        if archive_path.exists():
            archive_path.unlink()
        shutil.make_archive(str(bundle_folder), "zip", root_dir=bundle_folder.parent, base_dir=bundle_folder.name)

    return {
        "status": "ready-for-human-or-codex-upload-handoff",
        "bundleFolder": str(bundle_folder),
        "manifestPath": str(manifest_path),
        "csvPath": str(csv_path),
        "archivePath": str(archive_path) if archive_path.exists() else "",
        "recordCount": len(packet_rows),
        "artifactReadyCount": manifest["artifactReadyCount"],
        "receiptCapturedCount": manifest["receiptCapturedCount"],
    }


def main() -> int:
    parser = argparse.ArgumentParser(description="Build upload packet bundle from a Quipsly publish ledger or release folder.")
    parser.add_argument("source", type=Path, help="Release folder or publish-ledger JSON")
    parser.add_argument("--output", type=Path, help="Output parent folder")
    parser.add_argument("--basename", default="", help="Bundle basename")
    parser.add_argument("--zip", action="store_true", help="Create ZIP archive beside the bundle folder")
    args = parser.parse_args()

    source = args.source.expanduser().resolve()
    if not source.exists():
        print(json.dumps({"status": "error", "error": f"Source not found: {source}"}, indent=2))
        return 2
    ledger_path = find_publish_ledger(source) if source.is_dir() else source
    output_folder = (args.output or ledger_path.parent).expanduser().resolve()
    output_folder.mkdir(parents=True, exist_ok=True)

    try:
        result = write_bundle(ledger_path, output_folder, args.basename or ledger_path.stem.replace("-publish-ledger", ""), args.zip)
    except Exception as exc:  # noqa: BLE001 - handoff tools should return calm diagnostics.
        print(json.dumps({"status": "error", "error": str(exc)}, indent=2))
        return 1
    print(json.dumps(result, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
