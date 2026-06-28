#!/usr/bin/env python3
"""Build a non-mutating Photo Grove memory-card backup receipt.

This command compares a camera card/source tree with its external-drive backup
tree and writes a human-readable receipt. It is intentionally copy-aware but
not copy-performing: rsync or Finder can move bytes, this proves what currently
landed and what still needs attention.
"""

from __future__ import annotations

import csv
import html
import json
import os
import subprocess
import sys
from collections import Counter
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Iterable


DEFAULT_SOURCE = Path("/Volumes/Bender")
DEFAULT_DESTINATION = Path("/Volumes/My Passport/Bender_Card_Backup")
DEFAULT_PHOTO_ROOT = Path("/Volumes/My Passport/Quipsly Media Workspace/PhotoGrove")
LATEST_POINTER = "latest-photo-grove-card-backup-receipt.json"

SYSTEM_DIRS = {".Spotlight-V100", ".Trashes", ".fseventsd", "System Volume Information"}
MEDIA_EXTENSIONS = {
    ".cr3",
    ".cr2",
    ".dng",
    ".nef",
    ".arw",
    ".jpg",
    ".jpeg",
    ".heic",
    ".png",
    ".tif",
    ".tiff",
    ".mov",
    ".mp4",
    ".m4v",
    ".wav",
}
RAW_EXTENSIONS = {".cr3", ".cr2", ".dng", ".nef", ".arw"}
VIDEO_EXTENSIONS = {".mov", ".mp4", ".m4v"}
AUDIO_EXTENSIONS = {".wav"}


@dataclass(frozen=True)
class MediaFile:
    relative_path: str
    extension: str
    bytes_value: int
    modified_at: str


@dataclass(frozen=True)
class ReceiptRow:
    relative_path: str
    extension: str
    source_bytes: int
    destination_bytes: int
    source_modified_at: str
    destination_modified_at: str
    status: str


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def utc_stamp() -> str:
    return datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S-%f")


def media_kind(extension: str) -> str:
    if extension in RAW_EXTENSIONS:
        return "raw"
    if extension in VIDEO_EXTENSIONS:
        return "video"
    if extension in AUDIO_EXTENSIONS:
        return "audio"
    return "raster"


def scan_media(root: Path) -> dict[str, MediaFile]:
    found: dict[str, MediaFile] = {}
    if not root.exists():
        return found
    for current, dirnames, filenames in os.walk(root):
        dirnames[:] = [name for name in dirnames if name not in SYSTEM_DIRS]
        current_path = Path(current)
        for filename in filenames:
            if filename.startswith("._"):
                continue
            path = current_path / filename
            extension = path.suffix.lower()
            if extension not in MEDIA_EXTENSIONS:
                continue
            try:
                stat = path.stat()
            except OSError:
                continue
            relative_path = path.relative_to(root).as_posix()
            found[relative_path] = MediaFile(
                relative_path=relative_path,
                extension=extension,
                bytes_value=int(stat.st_size),
                modified_at=datetime.fromtimestamp(stat.st_mtime, tz=timezone.utc).isoformat(),
            )
    return found


def active_backup_processes(source: Path, destination: Path) -> list[str]:
    try:
        output = subprocess.check_output(["ps", "-axo", "pid=,command="], text=True)
    except Exception:
        return []
    rows: list[str] = []
    source_text = str(source)
    destination_text = str(destination)
    for line in output.splitlines():
        if "rsync" in line and (source_text in line or destination_text in line):
            rows.append(" ".join(line.split()))
    return rows


def build_rows(source_files: dict[str, MediaFile], destination_files: dict[str, MediaFile]) -> list[ReceiptRow]:
    all_paths = sorted(set(source_files) | set(destination_files))
    rows: list[ReceiptRow] = []
    for relative_path in all_paths:
        source = source_files.get(relative_path)
        destination = destination_files.get(relative_path)
        if source and destination:
            status = "matched" if source.bytes_value == destination.bytes_value else "size-mismatch"
        elif source and not destination:
            status = "missing-destination"
        elif destination and not source:
            status = "extra-destination"
        else:
            status = "unknown"
        rows.append(
            ReceiptRow(
                relative_path=relative_path,
                extension=(source or destination).extension if (source or destination) else "",
                source_bytes=source.bytes_value if source else 0,
                destination_bytes=destination.bytes_value if destination else 0,
                source_modified_at=source.modified_at if source else "",
                destination_modified_at=destination.modified_at if destination else "",
                status=status,
            )
        )
    return rows


def counter_by(rows: Iterable[ReceiptRow], attr: str) -> dict[str, int]:
    return dict(sorted(Counter(getattr(row, attr) or "unknown" for row in rows).items()))


def folder_label(relative_path: str) -> str:
    parts = Path(relative_path).parts
    if len(parts) >= 2:
        return str(Path(parts[0]) / parts[1])
    if len(parts) == 1:
        return parts[0]
    return "unknown"


def build_folder_summaries(rows: list[ReceiptRow]) -> list[dict[str, object]]:
    grouped: dict[str, list[ReceiptRow]] = {}
    for row in rows:
        grouped.setdefault(folder_label(row.relative_path), []).append(row)
    summaries: list[dict[str, object]] = []
    for folder, folder_rows in sorted(grouped.items()):
        status_counts = Counter(row.status for row in folder_rows)
        summaries.append(
            {
                "folder": folder,
                "total": len(folder_rows),
                "matched": status_counts.get("matched", 0),
                "missingDestination": status_counts.get("missing-destination", 0),
                "sizeMismatch": status_counts.get("size-mismatch", 0),
                "extraDestination": status_counts.get("extra-destination", 0),
                "sourceBytes": sum(row.source_bytes for row in folder_rows),
                "destinationBytes": sum(row.destination_bytes for row in folder_rows),
                "readyForReview": status_counts.get("missing-destination", 0) == 0
                and status_counts.get("size-mismatch", 0) == 0,
            }
        )
    return summaries


def build_counts(rows: list[ReceiptRow], active_processes: list[str]) -> dict[str, object]:
    status_counts = counter_by(rows, "status")
    extension_counts = counter_by(rows, "extension")
    kind_counts = dict(sorted(Counter(media_kind(row.extension) for row in rows).items()))
    folder_summaries = build_folder_summaries(rows)
    incomplete_folders = [folder for folder in folder_summaries if not bool(folder["readyForReview"])]
    return {
        "totalRows": len(rows),
        "matched": status_counts.get("matched", 0),
        "missingDestination": status_counts.get("missing-destination", 0),
        "sizeMismatch": status_counts.get("size-mismatch", 0),
        "extraDestination": status_counts.get("extra-destination", 0),
        "sourceBytes": sum(row.source_bytes for row in rows),
        "destinationBytes": sum(row.destination_bytes for row in rows),
        "statusCounts": status_counts,
        "extensionCounts": extension_counts,
        "kindCounts": kind_counts,
        "folderCount": len(folder_summaries),
        "readyFolderCount": sum(1 for folder in folder_summaries if bool(folder["readyForReview"])),
        "incompleteFolderCount": len(incomplete_folders),
        "topMissingFolders": [
            {
                "folder": folder["folder"],
                "missingDestination": folder["missingDestination"],
                "sizeMismatch": folder["sizeMismatch"],
                "matched": folder["matched"],
                "total": folder["total"],
            }
            for folder in sorted(
                incomplete_folders,
                key=lambda item: (int(item["missingDestination"]), int(item["sizeMismatch"])),
                reverse=True,
            )[:12]
        ],
        "activeBackupProcesses": len(active_processes),
        "backupComplete": status_counts.get("missing-destination", 0) == 0 and status_counts.get("size-mismatch", 0) == 0,
        "originalsMutated": False,
        "metadataChanged": False,
        "externalPublishing": False,
    }


def write_json(path: Path, payload: dict[str, object]) -> None:
    path.write_text(json.dumps(payload, indent=2, sort_keys=True), encoding="utf-8")


def write_csv(path: Path, rows: list[ReceiptRow]) -> None:
    with path.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.DictWriter(
            handle,
            fieldnames=[
                "relativePath",
                "extension",
                "status",
                "sourceBytes",
                "destinationBytes",
                "sourceModifiedAt",
                "destinationModifiedAt",
            ],
        )
        writer.writeheader()
        for row in rows:
            writer.writerow(
                {
                    "relativePath": row.relative_path,
                    "extension": row.extension,
                    "status": row.status,
                    "sourceBytes": row.source_bytes,
                    "destinationBytes": row.destination_bytes,
                    "sourceModifiedAt": row.source_modified_at,
                    "destinationModifiedAt": row.destination_modified_at,
                }
            )


def write_markdown(path: Path, payload: dict[str, object]) -> None:
    counts = payload["counts"]  # type: ignore[index]
    lines = [
        "# Photo Grove Card Backup Receipt",
        "",
        "This receipt compares a mounted source card/tree to the external-drive backup.",
        "",
        "## Current backup truth",
        "",
        f"- Source: `{payload['sourceRoot']}`",
        f"- Destination: `{payload['destinationRoot']}`",
        f"- Matched media files: {counts['matched']}",
        f"- Missing from destination: {counts['missingDestination']}",
        f"- Size mismatches: {counts['sizeMismatch']}",
        f"- Extra destination media files: {counts['extraDestination']}",
        f"- Ready folders: {counts['readyFolderCount']} / {counts['folderCount']}",
        f"- Incomplete folders: {counts['incompleteFolderCount']}",
        f"- Active backup processes detected: {counts['activeBackupProcesses']}",
        f"- Backup complete by receipt check: {counts['backupComplete']}",
        "",
        "## Open first",
        "",
        f"- JSON: `{payload['jsonPath']}`",
        f"- CSV: `{payload['csvPath']}`",
        f"- HTML: `{payload['htmlPath']}`",
        "",
        "## Safety",
        "",
        "- This receipt does not copy, delete, publish, or mutate originals.",
        "- Missing rows usually mean the incremental copy is still running or the destination drive changed.",
    ]
    path.write_text("\n".join(lines) + "\n", encoding="utf-8")


def table_rows(rows: list[ReceiptRow], status: str, limit: int = 40) -> str:
    selected = [row for row in rows if row.status == status][:limit]
    if not selected:
        return "<tr><td colspan='4'>None.</td></tr>"
    return "\n".join(
        f"<tr><td><code>{html.escape(row.relative_path)}</code></td><td>{html.escape(row.extension)}</td><td>{row.source_bytes}</td><td>{row.destination_bytes}</td></tr>"
        for row in selected
    )


def write_html(path: Path, payload: dict[str, object], rows: list[ReceiptRow]) -> None:
    counts = payload["counts"]  # type: ignore[index]
    top_missing = counts.get("topMissingFolders") if isinstance(counts, dict) else []
    folder_rows = "\n".join(
        "<tr><td><code>{}</code></td><td>{}</td><td>{}</td><td>{}</td><td>{}</td></tr>".format(
            html.escape(str(folder.get("folder", ""))),
            folder.get("matched", 0),
            folder.get("missingDestination", 0),
            folder.get("sizeMismatch", 0),
            folder.get("total", 0),
        )
        for folder in (top_missing if isinstance(top_missing, list) else [])
    ) or "<tr><td colspan='5'>No incomplete folders found.</td></tr>"
    path.write_text(
        f"""<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>Photo Grove Card Backup Receipt</title>
  <style>
    body {{ margin: 0; font-family: -apple-system, BlinkMacSystemFont, "Avenir Next", sans-serif; background: #f3efe4; color: #243128; }}
    main {{ max-width: 1160px; margin: 0 auto; padding: 40px 24px; }}
    .hero {{ background: #fffaf0; border: 1px solid #d9c8a8; border-radius: 28px; padding: 28px; box-shadow: 0 20px 50px rgba(55, 40, 20, .10); }}
    h1 {{ margin: 0 0 10px; font-family: Georgia, serif; font-size: 42px; }}
    .grid {{ display: grid; grid-template-columns: repeat(auto-fit, minmax(170px, 1fr)); gap: 14px; margin: 24px 0; }}
    .card {{ background: rgba(36, 49, 40, .08); border-radius: 18px; padding: 16px; }}
    .metric {{ font-size: 30px; font-weight: 800; }}
    .label {{ color: #65705f; font-size: 12px; text-transform: uppercase; letter-spacing: .12em; }}
    table {{ width: 100%; border-collapse: collapse; background: #fffaf0; border-radius: 18px; overflow: hidden; margin-top: 12px; }}
    th, td {{ border-bottom: 1px solid #e5d8bf; padding: 10px; text-align: left; vertical-align: top; }}
    code {{ font-size: 12px; overflow-wrap: anywhere; }}
  </style>
</head>
<body>
<main>
  <section class="hero">
    <p class="label">Photo Grove</p>
    <h1>Card Backup Receipt</h1>
    <p>Copy truth before culling truth. This receipt proves what currently landed on the external drive.</p>
    <div class="grid">
      <div class="card"><div class="metric">{counts['matched']}</div><div class="label">matched</div></div>
      <div class="card"><div class="metric">{counts['missingDestination']}</div><div class="label">missing destination</div></div>
      <div class="card"><div class="metric">{counts['sizeMismatch']}</div><div class="label">size mismatch</div></div>
      <div class="card"><div class="metric">{counts['readyFolderCount']}/{counts['folderCount']}</div><div class="label">ready folders</div></div>
      <div class="card"><div class="metric">{counts['activeBackupProcesses']}</div><div class="label">active copy processes</div></div>
    </div>
    <p><strong>Source:</strong> <code>{html.escape(str(payload['sourceRoot']))}</code></p>
    <p><strong>Destination:</strong> <code>{html.escape(str(payload['destinationRoot']))}</code></p>
  </section>

  <h2>Missing from destination</h2>
  <table><thead><tr><th>Relative path</th><th>Ext</th><th>Source bytes</th><th>Destination bytes</th></tr></thead><tbody>{table_rows(rows, 'missing-destination')}</tbody></table>

  <h2>Size mismatches</h2>
  <table><thead><tr><th>Relative path</th><th>Ext</th><th>Source bytes</th><th>Destination bytes</th></tr></thead><tbody>{table_rows(rows, 'size-mismatch')}</tbody></table>

  <h2>Incomplete folders</h2>
  <table><thead><tr><th>Folder</th><th>Matched</th><th>Missing</th><th>Mismatch</th><th>Total</th></tr></thead><tbody>{folder_rows}</tbody></table>
</main>
</body>
</html>
""",
        encoding="utf-8",
    )


def build(source: Path, destination: Path, photo_root: Path) -> dict[str, object]:
    source_files = scan_media(source)
    destination_files = scan_media(destination)
    rows = build_rows(source_files, destination_files)
    active_processes = active_backup_processes(source, destination)
    stamp = utc_stamp()
    output_dir = photo_root / "CardBackupReceipts" / f"{stamp}-card-backup-receipt"
    output_dir.mkdir(parents=True, exist_ok=True)
    payload: dict[str, object] = {
        "schema": "quipsly.photoGrove.cardBackupReceipt.v1",
        "status": "photo-grove-card-backup-receipt-ready",
        "generatedAt": utc_now(),
        "sourceRoot": str(source),
        "destinationRoot": str(destination),
        "outputDir": str(output_dir),
        "jsonPath": str(output_dir / "photo-grove-card-backup-receipt.json"),
        "csvPath": str(output_dir / "card-backup-receipt.csv"),
        "htmlPath": str(output_dir / "index.html"),
        "markdownPath": str(output_dir / "START-HERE-card-backup-receipt.md"),
        "counts": build_counts(rows, active_processes),
        "activeBackupProcesses": active_processes,
        "folderSummaries": build_folder_summaries(rows),
        "safety": {
            "mutatesOriginals": False,
            "writesBesideSources": False,
            "changesMetadata": False,
            "publishesExternally": False,
        },
        "rows": [
            {
                "relativePath": row.relative_path,
                "extension": row.extension,
                "status": row.status,
                "sourceBytes": row.source_bytes,
                "destinationBytes": row.destination_bytes,
                "sourceModifiedAt": row.source_modified_at,
                "destinationModifiedAt": row.destination_modified_at,
            }
            for row in rows
        ],
    }
    write_csv(Path(str(payload["csvPath"])), rows)
    write_html(Path(str(payload["htmlPath"])), payload, rows)
    write_markdown(Path(str(payload["markdownPath"])), payload)
    write_json(Path(str(payload["jsonPath"])), payload)
    write_json(
        photo_root / LATEST_POINTER,
        {
            "schema": "quipsly.photoGrove.cardBackupReceiptPointer.v1",
            "status": payload["status"],
            "generatedAt": payload["generatedAt"],
            "jsonPath": payload["jsonPath"],
            "csvPath": payload["csvPath"],
            "htmlPath": payload["htmlPath"],
            "markdownPath": payload["markdownPath"],
            "sourceRoot": payload["sourceRoot"],
            "destinationRoot": payload["destinationRoot"],
            "counts": payload["counts"],
        },
    )
    return payload


def main() -> int:
    source = Path(sys.argv[1]) if len(sys.argv) > 1 else DEFAULT_SOURCE
    destination = Path(sys.argv[2]) if len(sys.argv) > 2 else DEFAULT_DESTINATION
    photo_root = Path(sys.argv[3]) if len(sys.argv) > 3 else DEFAULT_PHOTO_ROOT
    try:
        payload = build(source, destination, photo_root)
    except Exception as exc:  # noqa: BLE001
        print(json.dumps({"status": "photo-grove-card-backup-receipt-failed", "error": str(exc)}, indent=2))
        return 1
    print(
        json.dumps(
            {
                "status": payload["status"],
                "jsonPath": payload["jsonPath"],
                "htmlPath": payload["htmlPath"],
                "markdownPath": payload["markdownPath"],
                "csvPath": payload["csvPath"],
                "counts": payload["counts"],
            },
            indent=2,
        )
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
