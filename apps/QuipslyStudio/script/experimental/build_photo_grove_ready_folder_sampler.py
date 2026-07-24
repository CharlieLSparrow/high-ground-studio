#!/usr/bin/env python3
"""Build a small Photo Grove review sampler from ready backup folders only.

This is the bridge between "backup truth" and "cull truth" while a large card
copy is still in progress. It samples complete folders from the latest
ready-folder packet, creates thumbnails into Photo Grove-managed output, and
keeps quarantined folders out of the review surface.
"""

from __future__ import annotations

import csv
import hashlib
import html
import json
import shutil
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


DEFAULT_PHOTO_ROOT = Path("/Volumes/My Passport/Quipsly Media Workspace/PhotoGrove")
LATEST_READY_POINTER = "latest-photo-grove-ready-folder-packet.json"
LATEST_OUTPUT_POINTER = "latest-photo-grove-ready-folder-sampler.json"
REVIEWABLE_EXTENSIONS = {".cr3", ".cr2", ".dng", ".nef", ".arw", ".jpg", ".jpeg", ".heic", ".png", ".tif", ".tiff"}


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def utc_stamp() -> str:
    return datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S-%f")


def read_json(path: Path) -> dict[str, Any]:
    payload = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(payload, dict):
        raise ValueError(f"Expected JSON object at {path}")
    if payload.get("jsonPath"):
        target = Path(str(payload["jsonPath"]))
        if target.exists() and target != path:
            target_payload = json.loads(target.read_text(encoding="utf-8"))
            if isinstance(target_payload, dict):
                return {**payload, **target_payload}
    return payload


def write_json(path: Path, payload: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, indent=2, sort_keys=True) + "\n", encoding="utf-8")


def latest_ready_packet(photo_root: Path) -> dict[str, Any]:
    pointer = photo_root / LATEST_READY_POINTER
    if not pointer.exists():
        raise FileNotFoundError(f"Missing ready-folder packet pointer: {pointer}")
    return read_json(pointer)


def stable_sample(paths: list[Path], limit: int) -> list[Path]:
    if len(paths) <= limit:
        return paths
    if limit <= 1:
        return [paths[0]]
    step = (len(paths) - 1) / float(limit - 1)
    indexes = sorted({round(i * step) for i in range(limit)})
    return [paths[index] for index in indexes[:limit]]


def sample_hash(path: Path) -> str:
    hasher = hashlib.sha256()
    with path.open("rb") as handle:
        hasher.update(handle.read(131072))
    return hasher.hexdigest()


def media_dimensions(path: Path) -> tuple[int, int, str]:
    sips = shutil.which("sips")
    if not sips:
        return 0, 0, "sips-missing"
    try:
        output = subprocess.check_output([sips, "-g", "pixelWidth", "-g", "pixelHeight", str(path)], text=True, stderr=subprocess.STDOUT, timeout=20)
    except Exception as exc:  # noqa: BLE001
        return 0, 0, f"sips-read-failed: {exc}"
    width = 0
    height = 0
    for line in output.splitlines():
        stripped = line.strip()
        if stripped.startswith("pixelWidth:"):
            width = int(stripped.split(":", 1)[1].strip() or 0)
        if stripped.startswith("pixelHeight:"):
            height = int(stripped.split(":", 1)[1].strip() or 0)
    return width, height, "ok" if width and height else "sips-no-dimensions"


def create_thumbnail(source: Path, thumbnail: Path) -> tuple[bool, str]:
    sips = shutil.which("sips")
    if not sips:
        return False, "sips-missing"
    thumbnail.parent.mkdir(parents=True, exist_ok=True)
    try:
        subprocess.check_output([sips, "-s", "format", "jpeg", "-Z", "900", str(source), "--out", str(thumbnail)], text=True, stderr=subprocess.STDOUT, timeout=45)
    except Exception as exc:  # noqa: BLE001
        return False, f"thumbnail-failed: {exc}"
    return thumbnail.exists(), "ok" if thumbnail.exists() else "thumbnail-missing-after-create"


def media_files_for_folder(folder_path: Path) -> list[Path]:
    if not folder_path.exists():
        return []
    return sorted(path for path in folder_path.iterdir() if path.is_file() and not path.name.startswith("._") and path.suffix.lower() in REVIEWABLE_EXTENSIONS)


def build(photo_root: Path, per_folder: int) -> dict[str, Any]:
    ready_packet = latest_ready_packet(photo_root)
    stamp = utc_stamp()
    out_dir = photo_root / "ReadyFolderSamplers" / f"{stamp}-ready-folder-sampler"
    thumb_dir = out_dir / "thumbs"
    out_dir.mkdir(parents=True, exist_ok=True)
    rows: list[dict[str, Any]] = []
    folder_summaries: list[dict[str, Any]] = []
    for folder in ready_packet.get("readyFolders") or []:
        if not isinstance(folder, dict):
            continue
        folder_name = str(folder.get("folder") or "")
        backup_path = Path(str(folder.get("backupPath") or ""))
        files = media_files_for_folder(backup_path)
        sampled = stable_sample(files, per_folder)
        folder_summaries.append(
            {
                "folder": folder_name,
                "backupPath": str(backup_path),
                "reviewableFiles": len(files),
                "sampledFiles": len(sampled),
            }
        )
        for index, source in enumerate(sampled, start=1):
            thumb_name = f"{folder_name.replace('/', '-')}-{index:03d}-{source.stem}.jpg"
            thumbnail = thumb_dir / thumb_name
            thumb_ok, thumb_status = create_thumbnail(source, thumbnail)
            width, height, dimension_status = media_dimensions(source)
            rows.append(
                {
                    "id": f"{folder_name.replace('/', '-')}-{index:03d}",
                    "folder": folder_name,
                    "filename": source.name,
                    "sourcePath": str(source),
                    "extension": source.suffix.lower(),
                    "bytes": source.stat().st_size,
                    "sampleHash": sample_hash(source),
                    "pixelWidth": width,
                    "pixelHeight": height,
                    "dimensionStatus": dimension_status,
                    "thumbnailPath": str(thumbnail) if thumb_ok else "",
                    "thumbnailStatus": thumb_status,
                    "reviewStatus": "candidate",
                    "suggestedDecision": "review",
                    "safety": "read-only-sample",
                }
            )
    quarantined = ready_packet.get("quarantinedFolders") or []
    payload = {
        "schema": "quipsly.photoGrove.readyFolderSampler.v1",
        "status": "photo-grove-ready-folder-sampler-ready",
        "generatedAt": utc_now(),
        "photoRoot": str(photo_root),
        "sourceReadyPacketJsonPath": str(ready_packet.get("jsonPath") or ""),
        "outputDir": str(out_dir),
        "jsonPath": str(out_dir / "photo-grove-ready-folder-sampler.json"),
        "htmlPath": str(out_dir / "index.html"),
        "markdownPath": str(out_dir / "START-HERE-ready-folder-sampler.md"),
        "csvPath": str(out_dir / "ready-folder-sampler.csv"),
        "counts": {
            "readyFolders": len(folder_summaries),
            "quarantinedFolders": len(quarantined),
            "reviewableFilesInReadyFolders": sum(int(folder["reviewableFiles"]) for folder in folder_summaries),
            "sampledFiles": len(rows),
            "thumbnailsPresent": sum(1 for row in rows if row["thumbnailPath"]),
            "thumbnailFailures": sum(1 for row in rows if not row["thumbnailPath"]),
            "originalsMutated": False,
            "metadataChanged": False,
            "externalPublishing": False,
        },
        "folderSummaries": folder_summaries,
        "quarantinedFolders": quarantined,
        "rows": rows,
        "safety": {
            "mutatesOriginals": False,
            "writesBesideSources": False,
            "changesMetadata": False,
            "publishesExternally": False,
            "usesReadyFoldersOnly": True,
        },
    }
    write_csv(Path(payload["csvPath"]), rows)
    write_markdown(Path(payload["markdownPath"]), payload)
    write_html(Path(payload["htmlPath"]), payload)
    write_json(Path(payload["jsonPath"]), payload)
    write_json(
        photo_root / LATEST_OUTPUT_POINTER,
        {
            "schema": "quipsly.photoGrove.readyFolderSamplerPointer.v1",
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


def write_csv(path: Path, rows: list[dict[str, Any]]) -> None:
    with path.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.DictWriter(
            handle,
            fieldnames=[
                "id",
                "folder",
                "filename",
                "sourcePath",
                "extension",
                "bytes",
                "sampleHash",
                "pixelWidth",
                "pixelHeight",
                "thumbnailPath",
                "thumbnailStatus",
                "reviewStatus",
                "suggestedDecision",
            ],
        )
        writer.writeheader()
        for row in rows:
            writer.writerow({key: row.get(key, "") for key in writer.fieldnames or []})


def write_markdown(path: Path, payload: dict[str, Any]) -> None:
    counts = payload["counts"]
    lines = [
        "# Photo Grove Ready Folder Sampler",
        "",
        "This sampler uses only folders proven complete by the ready-folder packet.",
        "",
        "## Current truth",
        "",
        f"- Ready folders sampled: {counts['readyFolders']}",
        f"- Quarantined folders excluded: {counts['quarantinedFolders']}",
        f"- Reviewable files in ready folders: {counts['reviewableFilesInReadyFolders']}",
        f"- Sampled files: {counts['sampledFiles']}",
        f"- Thumbnails present: {counts['thumbnailsPresent']}",
        f"- Thumbnail failures: {counts['thumbnailFailures']}",
        f"- Originals mutated: {counts['originalsMutated']}",
        "",
        "## Folder samples",
    ]
    for folder in payload.get("folderSummaries") or []:
        lines.append(f"- `{folder['folder']}`: {folder['sampledFiles']} sampled / {folder['reviewableFiles']} reviewable")
    lines.extend(["", "## Quarantined"])
    for folder in payload.get("quarantinedFolders") or []:
        if isinstance(folder, dict):
            lines.append(f"- `{folder.get('folder')}`: {folder.get('missingDestination')} missing destination file(s)")
    path.write_text("\n".join(lines) + "\n", encoding="utf-8")


def write_html(path: Path, payload: dict[str, Any]) -> None:
    counts = payload["counts"]
    cards = []
    for row in payload.get("rows") or []:
        thumb = str(row.get("thumbnailPath") or "")
        image = f'<img src="file://{html.escape(thumb)}" alt="">' if thumb else '<div class="missing">No thumbnail</div>'
        cards.append(
            f"""
<article class="photo-card">
  {image}
  <div class="body">
    <p class="eyebrow">{html.escape(str(row.get('folder') or ''))}</p>
    <h3>{html.escape(str(row.get('filename') or ''))}</h3>
    <p>{row.get('pixelWidth', 0)} x {row.get('pixelHeight', 0)} · {html.escape(str(row.get('extension') or ''))}</p>
    <p><code>{html.escape(str(row.get('sourcePath') or ''))}</code></p>
    <p class="pill">Suggested: review</p>
  </div>
</article>
"""
        )
    quarantine = "".join(
        f"<li><code>{html.escape(str(folder.get('folder')))}</code>: {folder.get('missingDestination')} missing</li>"
        for folder in payload.get("quarantinedFolders") or []
        if isinstance(folder, dict)
    ) or "<li>None</li>"
    path.write_text(
        f"""<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>Photo Grove Ready Folder Sampler</title>
  <style>
    body {{ margin: 0; font-family: -apple-system, BlinkMacSystemFont, "Avenir Next", sans-serif; background: #f1eadc; color: #233125; }}
    main {{ max-width: 1240px; margin: 0 auto; padding: 40px 24px; }}
    .hero {{ background: #fffaf0; border: 1px solid #d9c8a8; border-radius: 28px; padding: 28px; box-shadow: 0 20px 50px rgba(55, 40, 20, .10); }}
    h1 {{ margin: 0 0 10px; font-family: Georgia, serif; font-size: 42px; }}
    .grid {{ display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 14px; margin: 24px 0; }}
    .metric {{ font-size: 30px; font-weight: 800; }}
    .label, .eyebrow {{ color: #65705f; font-size: 12px; text-transform: uppercase; letter-spacing: .12em; }}
    .photos {{ display: grid; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); gap: 16px; margin-top: 24px; }}
    .photo-card {{ background: #fffaf0; border: 1px solid #d9c8a8; border-radius: 20px; overflow: hidden; box-shadow: 0 12px 30px rgba(55, 40, 20, .08); }}
    .photo-card img, .missing {{ width: 100%; height: 210px; object-fit: cover; display: block; background: #d8c8a9; }}
    .body {{ padding: 14px; }}
    .pill {{ display: inline-block; padding: 4px 10px; border-radius: 999px; background: #d7ead2; color: #244f2c; font-weight: 700; }}
    code {{ font-size: 11px; overflow-wrap: anywhere; }}
  </style>
</head>
<body>
<main>
  <section class="hero">
    <p class="label">Photo Grove</p>
    <h1>Ready Folder Sampler</h1>
    <p>A small review surface from completed backup folders only. Quarantined folders stay out of the cull flow.</p>
    <div class="grid">
      <div><div class="metric">{counts['readyFolders']}</div><div class="label">ready folders</div></div>
      <div><div class="metric">{counts['sampledFiles']}</div><div class="label">sampled files</div></div>
      <div><div class="metric">{counts['thumbnailsPresent']}</div><div class="label">thumbnails</div></div>
      <div><div class="metric">{counts['quarantinedFolders']}</div><div class="label">quarantined</div></div>
    </div>
    <p>Quarantined folders: <ul>{quarantine}</ul></p>
  </section>
  <section class="photos">
    {''.join(cards)}
  </section>
</main>
</body>
</html>
""",
        encoding="utf-8",
    )


def main() -> int:
    photo_root = Path(sys.argv[1]) if len(sys.argv) > 1 else DEFAULT_PHOTO_ROOT
    per_folder = int(sys.argv[2]) if len(sys.argv) > 2 else 12
    try:
        payload = build(photo_root, per_folder)
    except Exception as exc:  # noqa: BLE001
        print(json.dumps({"status": "photo-grove-ready-folder-sampler-failed", "error": str(exc)}, indent=2))
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
