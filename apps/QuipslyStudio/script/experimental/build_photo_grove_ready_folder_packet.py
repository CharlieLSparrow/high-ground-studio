#!/usr/bin/env python3
"""Build a Photo Grove ready-folder packet from the latest card backup receipt.

When a huge card is still copying, this packet identifies complete backup
folders that are safe to review while keeping incomplete folders quarantined.
It never mutates originals or backup files.
"""

from __future__ import annotations

import csv
import html
import json
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


DEFAULT_PHOTO_ROOT = Path("/Volumes/My Passport/Quipsly Media Workspace/PhotoGrove")
LATEST_RECEIPT_POINTER = "latest-photo-grove-card-backup-receipt.json"
LATEST_OUTPUT_POINTER = "latest-photo-grove-ready-folder-packet.json"


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def utc_stamp() -> str:
    return datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S-%f")


def read_json(path: Path) -> dict[str, Any]:
    payload = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(payload, dict):
        raise ValueError(f"Expected JSON object at {path}")
    if payload.get("jsonPath"):
        target = Path(str(payload.get("jsonPath")))
        if target.exists() and target != path:
            target_payload = json.loads(target.read_text(encoding="utf-8"))
            if isinstance(target_payload, dict):
                return {**payload, **target_payload}
    return payload


def write_json(path: Path, payload: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, indent=2, sort_keys=True) + "\n", encoding="utf-8")


def receipt_from_pointer(photo_root: Path) -> dict[str, Any]:
    pointer_path = photo_root / LATEST_RECEIPT_POINTER
    if not pointer_path.exists():
        raise FileNotFoundError(f"Missing latest card backup receipt pointer: {pointer_path}")
    return read_json(pointer_path)


def source_kind_from_extension(extension: str) -> str:
    extension = extension.lower()
    if extension in {".cr3", ".cr2", ".dng", ".nef", ".arw"}:
        return "raw"
    if extension in {".mov", ".mp4", ".m4v"}:
        return "video"
    if extension in {".wav"}:
        return "audio"
    return "raster"


def rows_by_folder(receipt: dict[str, Any]) -> dict[str, list[dict[str, Any]]]:
    grouped: dict[str, list[dict[str, Any]]] = {}
    for row in receipt.get("rows") or []:
        if not isinstance(row, dict):
            continue
        relative_path = str(row.get("relativePath") or "")
        if not relative_path:
            continue
        parts = Path(relative_path).parts
        folder = str(Path(parts[0]) / parts[1]) if len(parts) >= 2 else parts[0]
        grouped.setdefault(folder, []).append(row)
    return grouped


def build_ready_rows(receipt: dict[str, Any]) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    destination_root = Path(str(receipt.get("destinationRoot") or ""))
    grouped_rows = rows_by_folder(receipt)
    ready: list[dict[str, Any]] = []
    quarantined: list[dict[str, Any]] = []
    for folder in receipt.get("folderSummaries") or []:
        if not isinstance(folder, dict):
            continue
        folder_name = str(folder.get("folder") or "")
        folder_rows = grouped_rows.get(folder_name, [])
        extension_counts: dict[str, int] = {}
        kind_counts: dict[str, int] = {}
        sample_media: list[str] = []
        for row in folder_rows:
            extension = str(row.get("extension") or "unknown")
            extension_counts[extension] = extension_counts.get(extension, 0) + 1
            kind = source_kind_from_extension(extension)
            kind_counts[kind] = kind_counts.get(kind, 0) + 1
            if len(sample_media) < 8 and row.get("status") == "matched":
                sample_media.append(str(destination_root / str(row.get("relativePath") or "")))
        item = {
            "folder": folder_name,
            "backupPath": str(destination_root / folder_name) if folder_name else "",
            "readyForReview": bool(folder.get("readyForReview")),
            "total": int(folder.get("total") or 0),
            "matched": int(folder.get("matched") or 0),
            "missingDestination": int(folder.get("missingDestination") or 0),
            "sizeMismatch": int(folder.get("sizeMismatch") or 0),
            "sourceBytes": int(folder.get("sourceBytes") or 0),
            "destinationBytes": int(folder.get("destinationBytes") or 0),
            "extensionCounts": dict(sorted(extension_counts.items())),
            "kindCounts": dict(sorted(kind_counts.items())),
            "sampleMedia": sample_media,
        }
        if item["readyForReview"]:
            ready.append(item)
        else:
            quarantined.append(item)
    return ready, quarantined


def write_csv(path: Path, ready: list[dict[str, Any]], quarantined: list[dict[str, Any]]) -> None:
    with path.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.DictWriter(
            handle,
            fieldnames=[
                "folder",
                "backupPath",
                "state",
                "total",
                "matched",
                "missingDestination",
                "sizeMismatch",
                "destinationBytes",
                "kindCounts",
            ],
        )
        writer.writeheader()
        for state, items in [("ready", ready), ("quarantined", quarantined)]:
            for item in items:
                writer.writerow(
                    {
                        "folder": item["folder"],
                        "backupPath": item["backupPath"],
                        "state": state,
                        "total": item["total"],
                        "matched": item["matched"],
                        "missingDestination": item["missingDestination"],
                        "sizeMismatch": item["sizeMismatch"],
                        "destinationBytes": item["destinationBytes"],
                        "kindCounts": json.dumps(item["kindCounts"], sort_keys=True),
                    }
                )


def write_markdown(path: Path, payload: dict[str, Any]) -> None:
    counts = payload["counts"]
    lines = [
        "# Photo Grove Ready Folder Packet",
        "",
        "This packet identifies completed backup folders that can be reviewed while a large card copy is still running.",
        "",
        "## Current truth",
        "",
        f"- Ready folders: {counts['readyFolders']}",
        f"- Quarantined folders: {counts['quarantinedFolders']}",
        f"- Ready media rows: {counts['readyMediaRows']}",
        f"- Quarantined missing files: {counts['quarantinedMissingDestination']}",
        f"- Originals mutated: {counts['originalsMutated']}",
        f"- External publishing: {counts['externalPublishing']}",
        "",
        "## Safe to review now",
    ]
    for item in payload.get("readyFolders") or []:
        lines.append(f"- `{item['folder']}`: {item['matched']} matched file(s), path `{item['backupPath']}`")
    lines.extend(["", "## Quarantined until backup completes"])
    for item in payload.get("quarantinedFolders") or []:
        lines.append(
            f"- `{item['folder']}`: {item['missingDestination']} missing destination file(s), {item['matched']} matched"
        )
    lines.extend(
        [
            "",
            "## Next actions",
            "",
            "- Review only ready folders until the card backup receipt shows zero missing destination files.",
            "- Re-run `./script/agentctl.sh photo-grove-card-backup-receipt` after rsync exits.",
            "- Re-run this packet after the receipt updates.",
        ]
    )
    path.write_text("\n".join(lines) + "\n", encoding="utf-8")


def folder_cards(items: list[dict[str, Any]], state: str) -> str:
    if not items:
        return "<p>None.</p>"
    cards: list[str] = []
    for item in items:
        samples = "".join(f"<li><code>{html.escape(sample)}</code></li>" for sample in item.get("sampleMedia", [])[:4])
        cards.append(
            f"""
<article class="card {html.escape(state)}">
  <p class="eyebrow">{html.escape(state)}</p>
  <h3>{html.escape(item['folder'])}</h3>
  <p><strong>{item['matched']}</strong> matched / <strong>{item['total']}</strong> total. Missing: <strong>{item['missingDestination']}</strong>. Mismatch: <strong>{item['sizeMismatch']}</strong>.</p>
  <p><code>{html.escape(item['backupPath'])}</code></p>
  <details><summary>Sample media</summary><ul>{samples}</ul></details>
</article>
"""
        )
    return "\n".join(cards)


def write_html(path: Path, payload: dict[str, Any]) -> None:
    counts = payload["counts"]
    path.write_text(
        f"""<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>Photo Grove Ready Folder Packet</title>
  <style>
    body {{ margin: 0; font-family: -apple-system, BlinkMacSystemFont, "Avenir Next", sans-serif; background: #f3efe4; color: #243128; }}
    main {{ max-width: 1160px; margin: 0 auto; padding: 40px 24px; }}
    .hero {{ background: #fffaf0; border: 1px solid #d9c8a8; border-radius: 28px; padding: 28px; box-shadow: 0 20px 50px rgba(55, 40, 20, .10); }}
    h1 {{ margin: 0 0 10px; font-family: Georgia, serif; font-size: 42px; }}
    .grid {{ display: grid; grid-template-columns: repeat(auto-fit, minmax(190px, 1fr)); gap: 14px; margin: 24px 0; }}
    .metric {{ font-size: 30px; font-weight: 800; }}
    .label, .eyebrow {{ color: #65705f; font-size: 12px; text-transform: uppercase; letter-spacing: .12em; }}
    .card {{ background: #fffaf0; border: 1px solid #d9c8a8; border-radius: 20px; padding: 18px; margin: 14px 0; }}
    .ready {{ border-color: #93c5a2; }}
    .quarantined {{ border-color: #e0a069; }}
    code {{ font-size: 12px; overflow-wrap: anywhere; }}
  </style>
</head>
<body>
<main>
  <section class="hero">
    <p class="label">Photo Grove</p>
    <h1>Ready Folder Packet</h1>
    <p>Use complete folders now. Keep incomplete folders quarantined until the backup receipt proves they landed.</p>
    <div class="grid">
      <div><div class="metric">{counts['readyFolders']}</div><div class="label">ready folders</div></div>
      <div><div class="metric">{counts['quarantinedFolders']}</div><div class="label">quarantined folders</div></div>
      <div><div class="metric">{counts['readyMediaRows']}</div><div class="label">ready media rows</div></div>
      <div><div class="metric">{counts['quarantinedMissingDestination']}</div><div class="label">missing in quarantine</div></div>
    </div>
  </section>
  <h2>Safe to review now</h2>
  {folder_cards(payload.get('readyFolders') or [], 'ready')}
  <h2>Quarantined until backup completes</h2>
  {folder_cards(payload.get('quarantinedFolders') or [], 'quarantined')}
</main>
</body>
</html>
""",
        encoding="utf-8",
    )


def build(photo_root: Path) -> dict[str, Any]:
    receipt = receipt_from_pointer(photo_root)
    ready, quarantined = build_ready_rows(receipt)
    stamp = utc_stamp()
    out_dir = photo_root / "ReadyFolderPackets" / f"{stamp}-ready-folder-packet"
    out_dir.mkdir(parents=True, exist_ok=True)
    payload = {
        "schema": "quipsly.photoGrove.readyFolderPacket.v1",
        "status": "photo-grove-ready-folder-packet-ready",
        "generatedAt": utc_now(),
        "photoRoot": str(photo_root),
        "sourceReceiptJsonPath": str(receipt.get("jsonPath") or ""),
        "outputDir": str(out_dir),
        "jsonPath": str(out_dir / "photo-grove-ready-folder-packet.json"),
        "htmlPath": str(out_dir / "index.html"),
        "markdownPath": str(out_dir / "START-HERE-ready-folder-packet.md"),
        "csvPath": str(out_dir / "ready-folder-packet.csv"),
        "counts": {
            "readyFolders": len(ready),
            "quarantinedFolders": len(quarantined),
            "readyMediaRows": sum(int(item["matched"]) for item in ready),
            "quarantinedMissingDestination": sum(int(item["missingDestination"]) for item in quarantined),
            "originalsMutated": False,
            "metadataChanged": False,
            "externalPublishing": False,
        },
        "readyFolders": ready,
        "quarantinedFolders": quarantined,
        "safety": {
            "mutatesOriginals": False,
            "writesBesideSources": False,
            "changesMetadata": False,
            "publishesExternally": False,
        },
    }
    write_csv(Path(payload["csvPath"]), ready, quarantined)
    write_markdown(Path(payload["markdownPath"]), payload)
    write_html(Path(payload["htmlPath"]), payload)
    write_json(Path(payload["jsonPath"]), payload)
    write_json(
        photo_root / LATEST_OUTPUT_POINTER,
        {
            "schema": "quipsly.photoGrove.readyFolderPacketPointer.v1",
            "status": payload["status"],
            "generatedAt": payload["generatedAt"],
            "jsonPath": payload["jsonPath"],
            "htmlPath": payload["htmlPath"],
            "markdownPath": payload["markdownPath"],
            "csvPath": payload["csvPath"],
            "counts": payload["counts"],
        },
    )
    return payload


def main() -> int:
    photo_root = Path(sys.argv[1]) if len(sys.argv) > 1 else DEFAULT_PHOTO_ROOT
    try:
        payload = build(photo_root)
    except Exception as exc:  # noqa: BLE001
        print(json.dumps({"status": "photo-grove-ready-folder-packet-failed", "error": str(exc)}, indent=2))
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
