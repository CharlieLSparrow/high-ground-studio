#!/usr/bin/env python3
"""Build a human/Codex publication cockpit from a Quipsly release folder.

The cockpit is an operator handoff: it does not upload, schedule, publish, or
mutate source media. It gathers release verification, social queue, and upload
packet bundle truth into one readable checklist so a human can publish and then
capture receipts back into Quipsly.
"""
from __future__ import annotations

import argparse
import csv
import json
import re
from collections import Counter, defaultdict
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


def slugify(value: str) -> str:
    value = value.lower().replace("'", "")
    value = re.sub(r"[^a-z0-9]+", "-", value).strip("-")
    return value or "publication-cockpit"


def load_json(path: Path) -> dict[str, Any]:
    return json.loads(path.read_text())


def first_existing(candidates: list[Path]) -> Path | None:
    for candidate in candidates:
        if candidate.exists():
            return candidate
    return None


def find_one(release_folder: Path, patterns: list[str], label: str) -> Path:
    for pattern in patterns:
        matches = sorted(release_folder.glob(pattern))
        if matches:
            return matches[0]
    raise FileNotFoundError(f"No {label} found under {release_folder}")


def find_optional(release_folder: Path, patterns: list[str]) -> Path | None:
    for pattern in patterns:
        matches = sorted(release_folder.glob(pattern))
        if matches:
            return matches[0]
    return None


def fmt_bool(value: Any) -> str:
    return "yes" if bool(value) else "no"


def rel_or_abs(path: str | None, base: Path) -> str:
    if not path:
        return ""
    try:
        p = Path(path)
        return str(p.relative_to(base)) if p.is_absolute() else path
    except ValueError:
        return path


def read_text_if_present(path: str | None, max_chars: int = 1800) -> str:
    if not path:
        return ""
    p = Path(path)
    if not p.exists() or not p.is_file():
        return ""
    text = p.read_text(errors="replace").strip()
    if len(text) > max_chars:
        return text[:max_chars].rstrip() + "\n..."
    return text


def artifact_rows(verification: dict[str, Any], release_folder: Path) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    for artifact in verification.get("artifacts") or []:
        if not isinstance(artifact, dict):
            continue
        rows.append(
            {
                "id": artifact.get("id") or artifact.get("label") or "artifact",
                "label": artifact.get("label") or artifact.get("id") or "Artifact",
                "required": bool(artifact.get("required")),
                "ready": bool(artifact.get("ready")),
                "path": artifact.get("path") or "",
                "relativePath": rel_or_abs(artifact.get("path"), release_folder),
                "notes": artifact.get("notes") or artifact.get("error") or "",
            }
        )
    return rows


def social_clip_rows(queue: dict[str, Any], release_folder: Path) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    for clip in queue.get("clips") or []:
        if not isinstance(clip, dict):
            continue
        rows.append(
            {
                "rank": clip.get("rank") or 0,
                "title": clip.get("title") or "Untitled clip",
                "hook": clip.get("hook") or "",
                "reviewStatus": clip.get("reviewStatus") or "",
                "clipPath": clip.get("clipPath") or "",
                "relativeClipPath": rel_or_abs(clip.get("clipPath"), release_folder),
                "platformCopyPath": clip.get("platformCopyPath") or "",
                "relativePlatformCopyPath": rel_or_abs(clip.get("platformCopyPath"), release_folder),
                "platformCopyPreview": read_text_if_present(clip.get("platformCopyPath"), max_chars=1200),
            }
        )
    return sorted(rows, key=lambda row: (int(row["rank"] or 999), row["title"]))


def upload_packet_rows(bundle: dict[str, Any], release_folder: Path, ledger: dict[str, Any] | None = None) -> list[dict[str, Any]]:
    ledger_records = (ledger or {}).get("records") or []
    ledger_by_id = {
        str(record.get("id") or ""): record
        for record in ledger_records
        if isinstance(record, dict) and record.get("id")
    }
    rows: list[dict[str, Any]] = []
    for packet in bundle.get("packets") or []:
        if not isinstance(packet, dict):
            continue
        receipt_id = str(packet.get("receiptId") or packet.get("id") or "")
        ledger_record = ledger_by_id.get(receipt_id, {})
        rows.append(
            {
                "index": packet.get("index") or 0,
                "receiptId": receipt_id,
                "platform": packet.get("platform") or "Unknown",
                "deliveryLaneId": packet.get("deliveryLaneId") or "",
                "format": packet.get("format") or "",
                "displayLabel": packet.get("displayLabel") or "",
                "artifactExists": bool(packet.get("artifactExists")),
                "receiptCaptured": bool(packet.get("receiptCaptured")),
                "artifactPath": packet.get("artifactPath") or "",
                "relativeArtifactPath": rel_or_abs(packet.get("artifactPath"), release_folder),
                "publishStatus": packet.get("publishStatus") or ledger_record.get("publishStatus") or "",
                "publicURL": packet.get("publicURL") or ledger_record.get("publicURL") or "",
                "providerReceiptId": packet.get("providerReceiptId") or ledger_record.get("providerReceiptId") or "",
                "notes": ledger_record.get("notes") or "",
                "packetPath": packet.get("packetPath") or "",
                "relativePacketPath": rel_or_abs(packet.get("packetPath"), release_folder),
                "receiptCaptureCommand": packet.get("receiptCaptureCommand") or "",
            }
        )
    return sorted(rows, key=lambda row: (str(row["platform"]), int(row["index"] or 0)))


def build_cockpit(release_folder: Path, basename: str) -> dict[str, Any]:
    verification_path = find_one(release_folder, ["release-verification.json"], "release verification")
    bundle_path = find_one(
        release_folder,
        ["*-upload-packet-bundle/*-upload-packet-bundle.json"],
        "upload packet bundle manifest",
    )
    queue_path = find_one(
        release_folder,
        ["*-social-publication-queue/*social-publication-queue.json"],
        "social publication queue",
    )
    ledger_path = find_optional(release_folder, ["*-publish-packet/*-publish-ledger.json", "*publish-ledger.json"])

    verification = load_json(verification_path)
    bundle = load_json(bundle_path)
    queue = load_json(queue_path)
    ledger = load_json(ledger_path) if ledger_path else {}

    upload_rows = upload_packet_rows(bundle, release_folder, ledger)
    social_rows = social_clip_rows(queue, release_folder)
    artifacts = artifact_rows(verification, release_folder)
    platform_counts = Counter(row["platform"] for row in upload_rows)
    receipt_counts = Counter(row["platform"] for row in upload_rows if row["receiptCaptured"])
    receipt_captured_count = sum(1 for row in upload_rows if row["receiptCaptured"])
    receipt_remaining_count = max(0, len(upload_rows) - receipt_captured_count)
    publication_phase = "publication-complete" if upload_rows and receipt_remaining_count == 0 else "ready-for-human-review"
    platform_groups: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for row in upload_rows:
        platform_groups[row["platform"]].append(row)

    return {
        "model": "quipsly-publication-cockpit",
        "version": "2026-06-17.publication-cockpit.v1",
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "basename": basename,
        "releaseFolder": str(release_folder),
        "sourcePolicy": "Rendered derivatives only. Do not touch or upload raw source media from the cockpit.",
        "closedLoopRule": "A post is not complete until the public or scheduled URL is captured back into the matching Quipsly receipt.",
        "sources": {
            "verification": str(verification_path),
            "uploadPacketBundle": str(bundle_path),
            "socialPublicationQueue": str(queue_path),
            "publishLedger": str(ledger_path) if ledger_path else "",
        },
        "status": publication_phase,
        "summary": {
            **(verification.get("summary") or {}),
            "platformCounts": dict(sorted(platform_counts.items())),
            "receiptCounts": dict(sorted(receipt_counts.items())),
            "topPickCount": sum(1 for row in social_rows if row["reviewStatus"] == "top-pick"),
            "socialClipCount": len(social_rows),
            "uploadPacketCount": len(upload_rows),
            "receiptCapturedCount": receipt_captured_count,
            "receiptRemainingCount": receipt_remaining_count,
            "publicationPhase": publication_phase,
            "publicationComplete": publication_phase == "publication-complete",
            "ledgerRecordCount": len(ledger.get("records") or []) if isinstance(ledger, dict) else 0,
        },
        "artifacts": artifacts,
        "socialClips": social_rows,
        "uploadPackets": upload_rows,
        "platformGroups": {platform: rows for platform, rows in sorted(platform_groups.items())},
        "nextActions": [
            "Review the 16:9 episode master once.",
            "Review the 9:16 full vertical master once.",
            "Review each top-pick short before posting.",
            "Upload or schedule platform packets manually until direct connectors are proven.",
            "Paste public or scheduled URLs back using each receiptCaptureCommand.",
            "Refresh handoff artifacts after applying receipts, then verify status publication-complete before archiving.",
        ],
    }


def markdown_table(headers: list[str], rows: list[list[Any]]) -> list[str]:
    lines = ["| " + " | ".join(headers) + " |", "| " + " | ".join("---" for _ in headers) + " |"]
    for row in rows:
        cleaned = [str(cell).replace("\n", "<br>").replace("|", "\\|") for cell in row]
        lines.append("| " + " | ".join(cleaned) + " |")
    return lines


def write_markdown(cockpit: dict[str, Any], output_path: Path) -> None:
    summary = cockpit["summary"]
    artifacts = cockpit["artifacts"]
    social_clips = cockpit["socialClips"]
    platform_groups = cockpit["platformGroups"]

    lines: list[str] = [
        "# Episode Publication Cockpit",
        "",
        f"Generated: `{cockpit['generatedAt']}`",
        "",
        f"Release folder: `{cockpit['releaseFolder']}`",
        "",
        f"Status: **{cockpit['status']}**",
        "",
        "## North star",
        "",
        "Use this cockpit to publish the rendered Episode 1 assets without touching source media.",
        "",
        f"- Source policy: {cockpit['sourcePolicy']}",
        f"- Closed-loop rule: {cockpit['closedLoopRule']}",
        "",
        "## Release readiness",
        "",
        f"- Required artifacts ready: {summary.get('requiredReadyCount', 0)} / {summary.get('requiredArtifactCount', 0)}",
        f"- Media artifacts ready: {summary.get('mediaReadyCount', 0)}",
        f"- Social shorts ready: {summary.get('socialShortReadyCount', 0)} / {summary.get('socialShortCount', 0)}",
        f"- Upload packets ready: {summary.get('uploadPacketArtifactReadyCount', 0)} / {summary.get('uploadPacketCount', 0)}",
        f"- Receipts captured: {summary.get('uploadPacketReceiptCapturedCount', 0)} / {summary.get('uploadPacketCount', 0)}",
        f"- Receipts remaining: {summary.get('receiptRemainingCount', summary.get('uploadPacketReceiptRemainingCount', 0))}",
        f"- Publication phase: **{summary.get('publicationPhase', cockpit.get('status', 'unknown'))}**",
        f"- Receipt log: `{Path(cockpit.get('receiptLogPath') or 'publication-receipt-log.csv').name}`",
        "",
        "## Core release artifacts",
        "",
    ]

    core_rows = []
    for artifact in artifacts:
        if artifact["required"] or artifact["ready"]:
            core_rows.append(
                [
                    artifact["label"],
                    "required" if artifact["required"] else "optional",
                    "ready" if artifact["ready"] else "missing",
                    f"`{artifact['relativePath']}`",
                ]
            )
    lines.extend(markdown_table(["Artifact", "Need", "State", "Path"], core_rows))
    lines.extend(["", "## Best 9:16 short candidates", ""])

    short_rows = []
    for clip in social_clips:
        short_rows.append(
            [
                clip["rank"],
                clip["title"],
                clip["reviewStatus"],
                clip["hook"],
                f"`{clip['relativeClipPath']}`",
                f"`{clip['relativePlatformCopyPath']}`",
            ]
        )
    lines.extend(markdown_table(["Rank", "Title", "Status", "Hook", "Clip", "Copy"], short_rows))

    top_picks = [clip for clip in social_clips if clip["reviewStatus"] == "top-pick"] or social_clips[:4]
    lines.extend(["", "## Suggested first posting burst", ""])
    for clip in top_picks[:4]:
        lines.extend(
            [
                f"### {clip['rank']}. {clip['title']}",
                "",
                f"- Hook: {clip['hook']}",
                f"- Clip: `{clip['relativeClipPath']}`",
                f"- Copy draft: `{clip['relativePlatformCopyPath']}`",
                "",
            ]
        )

    lines.extend(["## Platform upload checklist", ""])
    for platform, rows in platform_groups.items():
        captured = sum(1 for row in rows if row["receiptCaptured"])
        lines.extend(
            [
                f"### {platform}",
                "",
                f"- Packets: {len(rows)}",
                f"- Receipts captured: {captured} / {len(rows)}",
                "- Paste final URLs into `publication-receipt-log.csv`, then reconcile the sheet back into the publish ledger.",
                "",
            ]
        )
        upload_rows_md = []
        for row in rows:
            upload_rows_md.append(
                [
                    row["index"],
                    row["displayLabel"],
                    row["format"],
                    "ready" if row["artifactExists"] else "missing",
                    "captured" if row["receiptCaptured"] else "needed",
                    f"`{row['relativeArtifactPath']}`",
                ]
            )
        lines.extend(markdown_table(["#", "Item", "Format", "Artifact", "Receipt", "File"], upload_rows_md))
        lines.extend(["", "Receipt commands:", ""])
        for row in rows:
            if row["receiptCaptured"]:
                continue
            lines.extend(["```bash", row["receiptCaptureCommand"], "```", ""])

    lines.extend(["## Operator next actions", ""])
    for index, action in enumerate(cockpit["nextActions"], start=1):
        lines.append(f"{index}. {action}")
    lines.extend(
        [
            "",
            "## Source manifests",
            "",
            f"- Verification: `{cockpit['sources']['verification']}`",
            f"- Upload packet bundle: `{cockpit['sources']['uploadPacketBundle']}`",
            f"- Social publication queue: `{cockpit['sources']['socialPublicationQueue']}`",
            f"- Publish ledger: `{cockpit['sources']['publishLedger']}`",
            "",
        ]
    )
    output_path.write_text("\n".join(lines) + "\n")


def write_receipt_log(cockpit: dict[str, Any], output_path: Path) -> None:
    headers = [
        "receipt_id",
        "platform",
        "display_label",
        "delivery_lane_id",
        "format",
        "artifact_path",
        "artifact_exists",
        "current_publish_status",
        "current_public_url",
        "current_provider_receipt_id",
        "new_status",
        "public_url",
        "provider_receipt_id",
        "notes",
        "metadata_json",
        "receipt_capture_command",
    ]
    with output_path.open("w", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=headers)
        writer.writeheader()
        for row in cockpit.get("uploadPackets") or []:
            if not isinstance(row, dict):
                continue
            current_url = row.get("publicURL") or ""
            current_provider = row.get("providerReceiptId") or ""
            current_status = row.get("publishStatus") or ""
            writer.writerow(
                {
                    "receipt_id": row.get("receiptId") or "",
                    "platform": row.get("platform") or "",
                    "display_label": row.get("displayLabel") or "",
                    "delivery_lane_id": row.get("deliveryLaneId") or "",
                    "format": row.get("format") or "",
                    "artifact_path": row.get("artifactPath") or "",
                    "artifact_exists": row.get("artifactExists") is True,
                    "current_publish_status": current_status,
                    "current_public_url": current_url,
                    "current_provider_receipt_id": current_provider,
                    "new_status": current_status if current_url or current_provider else "published",
                    "public_url": current_url,
                    "provider_receipt_id": current_provider,
                    "notes": row.get("notes") or "",
                    "metadata_json": "",
                    "receipt_capture_command": row.get("receiptCaptureCommand") or "",
                }
            )


def main() -> None:
    parser = argparse.ArgumentParser(description="Build a Quipsly publication cockpit from a release folder.")
    parser.add_argument("release_folder", type=Path)
    parser.add_argument("--basename", default="")
    parser.add_argument("--output", type=Path, default=None)
    args = parser.parse_args()

    release_folder = args.release_folder.expanduser().resolve()
    if not release_folder.exists():
        raise FileNotFoundError(f"Release folder does not exist: {release_folder}")
    basename = slugify(args.basename or release_folder.name)
    cockpit = build_cockpit(release_folder, basename)

    json_path = args.output or release_folder / "publication-cockpit.json"
    md_path = json_path.with_name("PUBLICATION-COCKPIT.md")
    receipt_log_path = json_path.with_name("publication-receipt-log.csv")
    cockpit["receiptLogPath"] = str(receipt_log_path)
    json_path.write_text(json.dumps(cockpit, indent=2, sort_keys=True) + "\n")
    write_markdown(cockpit, md_path)
    write_receipt_log(cockpit, receipt_log_path)

    summary = cockpit["summary"]
    print(json.dumps({
        "status": cockpit["status"],
        "json": str(json_path),
        "markdown": str(md_path),
        "receiptLog": str(receipt_log_path),
        "socialClipCount": summary.get("socialClipCount", 0),
        "topPickCount": summary.get("topPickCount", 0),
        "uploadPacketCount": summary.get("uploadPacketCount", 0),
        "receiptCapturedCount": summary.get("uploadPacketReceiptCapturedCount", 0),
    }, indent=2, sort_keys=True))


if __name__ == "__main__":
    main()
