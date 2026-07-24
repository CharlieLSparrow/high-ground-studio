#!/usr/bin/env python3
"""Build a non-mutating Photo Grove source integrity packet.

This packet answers the boring but production-critical questions:
- Which source photos are in the latest Photo Grove review manifest?
- Do the original files still exist where the manifest says they live?
- Do the generated thumbnails still exist?
- Are there obvious duplicate sample-hash groups?

It never writes beside source media and never mutates originals.
"""

from __future__ import annotations

import csv
import html
import json
import sys
from collections import Counter, defaultdict
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


DEFAULT_PHOTO_ROOT = Path("/Volumes/My Passport/Quipsly Media Workspace/PhotoGrove")
LATEST_REVIEW_POINTER = "latest-photo-grove-review.json"
LATEST_OUTPUT_POINTER = "latest-photo-grove-source-integrity.json"


@dataclass(frozen=True)
class IntegrityRow:
    index: int
    filename: str
    source_path: str
    source_exists: bool
    thumbnail_path: str
    thumbnail_exists: bool
    extension: str
    kind: str
    bytes_value: int
    sample_hash: str
    review_status: str
    problem_flags: str
    modified_at: str


def utc_stamp() -> str:
    return datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S-%f")


def read_json(path: Path) -> dict[str, Any]:
    return json.loads(path.read_text(encoding="utf-8"))


def write_json(path: Path, payload: dict[str, Any]) -> None:
    path.write_text(json.dumps(payload, indent=2, sort_keys=True), encoding="utf-8")


def as_int(value: Any) -> int:
    try:
        return int(value or 0)
    except (TypeError, ValueError):
        return 0


def manifest_path_from_pointer(photo_root: Path) -> Path:
    pointer_path = photo_root / LATEST_REVIEW_POINTER
    if not pointer_path.exists():
        raise FileNotFoundError(f"Missing Photo Grove review pointer: {pointer_path}")
    pointer = read_json(pointer_path)
    manifest = pointer.get("manifestPath")
    if not manifest:
        raise ValueError(f"Photo Grove review pointer does not include manifestPath: {pointer_path}")
    manifest_path = Path(manifest)
    if not manifest_path.exists():
        raise FileNotFoundError(f"Photo Grove manifest does not exist: {manifest_path}")
    return manifest_path


def row_from_item(index: int, item: dict[str, Any]) -> IntegrityRow:
    source_path = str(item.get("sourcePath") or "")
    thumbnail_path = str(item.get("thumbnailPath") or "")
    source = Path(source_path) if source_path else None
    thumbnail = Path(thumbnail_path) if thumbnail_path else None
    review = item.get("review") or {}
    analysis = item.get("analysis") or {}
    metadata = item.get("metadata") or {}
    stat_mtime = ""
    source_exists = bool(source and source.exists())
    if source_exists and source:
        try:
            stat_mtime = datetime.fromtimestamp(source.stat().st_mtime, tz=timezone.utc).isoformat()
        except OSError:
            stat_mtime = ""
    problem_flags = analysis.get("problemFlags") or []
    if not isinstance(problem_flags, list):
        problem_flags = [str(problem_flags)]
    return IntegrityRow(
        index=index,
        filename=str(item.get("filename") or (source.name if source else f"photo-{index:04d}")),
        source_path=source_path,
        source_exists=source_exists,
        thumbnail_path=thumbnail_path,
        thumbnail_exists=bool(thumbnail and thumbnail.exists()),
        extension=str(item.get("extension") or (source.suffix.lower() if source else "")),
        kind=str(item.get("kind") or metadata.get("format") or "unknown"),
        bytes_value=as_int(item.get("bytes")),
        sample_hash=str(item.get("sampleHash") or ""),
        review_status=str(review.get("status") or "unknown"),
        problem_flags=", ".join(problem_flags),
        modified_at=stat_mtime,
    )


def build_counts(rows: list[IntegrityRow], manifest: dict[str, Any]) -> dict[str, Any]:
    hash_groups: dict[str, list[IntegrityRow]] = defaultdict(list)
    for row in rows:
        if row.sample_hash:
            hash_groups[row.sample_hash].append(row)
    duplicate_groups = {sample_hash: grouped for sample_hash, grouped in hash_groups.items() if len(grouped) > 1}
    source_roots = sorted({source_root_label(row.source_path) for row in rows if row.source_path})
    extension_counts = Counter(row.extension or "unknown" for row in rows)
    kind_counts = Counter(row.kind or "unknown" for row in rows)
    status_counts = Counter(row.review_status or "unknown" for row in rows)
    return {
        "total": len(rows),
        "sourceExists": sum(1 for row in rows if row.source_exists),
        "sourceMissing": sum(1 for row in rows if not row.source_exists),
        "thumbnailExists": sum(1 for row in rows if row.thumbnail_exists),
        "thumbnailMissing": sum(1 for row in rows if not row.thumbnail_exists),
        "sampleHashPresent": sum(1 for row in rows if row.sample_hash),
        "uniqueSampleHashes": len(hash_groups),
        "duplicateHashGroups": len(duplicate_groups),
        "duplicateHashItems": sum(len(grouped) for grouped in duplicate_groups.values()),
        "totalBytes": sum(row.bytes_value for row in rows),
        "extensionCounts": dict(sorted(extension_counts.items())),
        "kindCounts": dict(sorted(kind_counts.items())),
        "reviewStatusCounts": dict(sorted(status_counts.items())),
        "sourceRoots": source_roots or [str(manifest.get("sourceRoot") or "unknown")],
        "originalsMutated": False,
        "metadataChanged": False,
        "externalPublishing": False,
        "clientDeliveryCreated": False,
    }


def source_root_label(source_path: str) -> str:
    path = Path(source_path)
    parts = path.parts
    if len(parts) >= 3 and parts[1] == "Volumes":
        return str(Path(parts[0]) / parts[1] / parts[2])
    if len(parts) >= 2:
        return str(Path(parts[0]) / parts[1])
    return str(path.parent)


def write_csv(path: Path, rows: list[IntegrityRow]) -> None:
    with path.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.DictWriter(
            handle,
            fieldnames=[
                "index",
                "filename",
                "sourcePath",
                "sourceExists",
                "thumbnailPath",
                "thumbnailExists",
                "extension",
                "kind",
                "bytes",
                "sampleHash",
                "reviewStatus",
                "problemFlags",
                "modifiedAt",
            ],
        )
        writer.writeheader()
        for row in rows:
            writer.writerow(
                {
                    "index": row.index,
                    "filename": row.filename,
                    "sourcePath": row.source_path,
                    "sourceExists": row.source_exists,
                    "thumbnailPath": row.thumbnail_path,
                    "thumbnailExists": row.thumbnail_exists,
                    "extension": row.extension,
                    "kind": row.kind,
                    "bytes": row.bytes_value,
                    "sampleHash": row.sample_hash,
                    "reviewStatus": row.review_status,
                    "problemFlags": row.problem_flags,
                    "modifiedAt": row.modified_at,
                }
            )


def write_markdown(path: Path, payload: dict[str, Any]) -> None:
    counts = payload["counts"]
    lines = [
        "# Photo Grove Source Integrity",
        "",
        "This packet checks the latest Photo Grove review manifest without mutating originals.",
        "",
        "## Current truth",
        "",
        f"- Source photos in manifest: {counts['total']}",
        f"- Sources present: {counts['sourceExists']}",
        f"- Sources missing: {counts['sourceMissing']}",
        f"- Thumbnails present: {counts['thumbnailExists']}",
        f"- Thumbnails missing: {counts['thumbnailMissing']}",
        f"- Duplicate sample-hash groups: {counts['duplicateHashGroups']}",
        f"- Originals mutated by this packet: {counts['originalsMutated']}",
        f"- External publishing performed: {counts['externalPublishing']}",
        "",
        "## Open first",
        "",
        f"- JSON packet: `{payload['jsonPath']}`",
        f"- CSV rows: `{payload['csvPath']}`",
        f"- HTML summary: `{payload['htmlPath']}`",
        "",
        "## How to use this",
        "",
        "Use this before culling or exporting to make sure Photo Grove still sees the same source truth. Missing sources mean the drive or folder changed; duplicate sample hashes are review prompts, not automatic deletion instructions.",
    ]
    path.write_text("\n".join(lines) + "\n", encoding="utf-8")


def write_html(path: Path, payload: dict[str, Any], rows: list[IntegrityRow]) -> None:
    counts = payload["counts"]
    missing = [row for row in rows if not row.source_exists][:25]
    duplicate_hashes: dict[str, list[IntegrityRow]] = defaultdict(list)
    for row in rows:
        if row.sample_hash:
            duplicate_hashes[row.sample_hash].append(row)
    duplicate_groups = [(key, group) for key, group in duplicate_hashes.items() if len(group) > 1][:25]
    missing_rows = "\n".join(
        f"<tr><td>{html.escape(row.filename)}</td><td><code>{html.escape(row.source_path)}</code></td></tr>"
        for row in missing
    ) or "<tr><td colspan='2'>No missing source files found.</td></tr>"
    duplicate_rows = "\n".join(
        "<tr><td><code>{}</code></td><td>{}</td></tr>".format(
            html.escape(sample_hash[:16]),
            html.escape(", ".join(row.filename for row in group[:6])),
        )
        for sample_hash, group in duplicate_groups
    ) or "<tr><td colspan='2'>No duplicate sample-hash groups found.</td></tr>"
    path.write_text(
        f"""<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>Photo Grove Source Integrity</title>
  <style>
    body {{ margin: 0; font-family: -apple-system, BlinkMacSystemFont, "Avenir Next", sans-serif; background: #f5efe4; color: #233125; }}
    main {{ max-width: 1080px; margin: 0 auto; padding: 40px 24px; }}
    .hero {{ background: #fffaf0; border: 1px solid #d9c8a8; border-radius: 28px; padding: 28px; box-shadow: 0 20px 50px rgba(55, 40, 20, .10); }}
    h1 {{ margin: 0 0 10px; font-family: Georgia, serif; font-size: 42px; }}
    .grid {{ display: grid; grid-template-columns: repeat(auto-fit, minmax(190px, 1fr)); gap: 14px; margin: 24px 0; }}
    .card {{ background: rgba(35, 49, 37, .08); border-radius: 18px; padding: 16px; }}
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
    <h1>Source Integrity Packet</h1>
    <p>Originals stay untouched. This packet proves what Photo Grove can currently see.</p>
    <div class="grid">
      <div class="card"><div class="metric">{counts['total']}</div><div class="label">manifest photos</div></div>
      <div class="card"><div class="metric">{counts['sourceExists']}</div><div class="label">sources present</div></div>
      <div class="card"><div class="metric">{counts['sourceMissing']}</div><div class="label">sources missing</div></div>
      <div class="card"><div class="metric">{counts['duplicateHashGroups']}</div><div class="label">duplicate groups</div></div>
      <div class="card"><div class="metric">{counts['thumbnailExists']}</div><div class="label">thumbnails present</div></div>
    </div>
    <p><strong>Manifest:</strong> <code>{html.escape(payload['manifestPath'])}</code></p>
    <p><strong>CSV:</strong> <code>{html.escape(payload['csvPath'])}</code></p>
  </section>

  <h2>Missing sources</h2>
  <table><thead><tr><th>File</th><th>Expected path</th></tr></thead><tbody>{missing_rows}</tbody></table>

  <h2>Duplicate sample-hash prompts</h2>
  <table><thead><tr><th>Hash</th><th>Files</th></tr></thead><tbody>{duplicate_rows}</tbody></table>
</main>
</body>
</html>
""",
        encoding="utf-8",
    )


def build(photo_root: Path) -> dict[str, Any]:
    manifest_path = manifest_path_from_pointer(photo_root)
    manifest = read_json(manifest_path)
    items = manifest.get("items") or []
    if not isinstance(items, list):
        raise ValueError(f"Photo Grove manifest items must be a list: {manifest_path}")
    rows = [row_from_item(index + 1, item) for index, item in enumerate(items)]
    stamp = utc_stamp()
    output_dir = photo_root / "SourceIntegrity" / f"{stamp}-photo-grove-source-integrity"
    output_dir.mkdir(parents=True, exist_ok=True)
    json_path = output_dir / "photo-grove-source-integrity.json"
    csv_path = output_dir / "source-integrity.csv"
    html_path = output_dir / "index.html"
    markdown_path = output_dir / "START-HERE-photo-grove-source-integrity.md"
    payload: dict[str, Any] = {
        "schema": "quipsly.photoGrove.sourceIntegrity.v1",
        "status": "photo-grove-source-integrity-ready",
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "photoRoot": str(photo_root),
        "manifestPath": str(manifest_path),
        "outputDir": str(output_dir),
        "jsonPath": str(json_path),
        "csvPath": str(csv_path),
        "htmlPath": str(html_path),
        "markdownPath": str(markdown_path),
        "counts": build_counts(rows, manifest),
        "safety": {
            "mutatesOriginals": False,
            "writesBesideSources": False,
            "changesMetadata": False,
            "publishesExternally": False,
        },
        "rows": [
            {
                "index": row.index,
                "filename": row.filename,
                "sourcePath": row.source_path,
                "sourceExists": row.source_exists,
                "thumbnailPath": row.thumbnail_path,
                "thumbnailExists": row.thumbnail_exists,
                "extension": row.extension,
                "kind": row.kind,
                "bytes": row.bytes_value,
                "sampleHash": row.sample_hash,
                "reviewStatus": row.review_status,
                "problemFlags": row.problem_flags,
                "modifiedAt": row.modified_at,
            }
            for row in rows
        ],
    }
    write_csv(csv_path, rows)
    write_markdown(markdown_path, payload)
    write_html(html_path, payload, rows)
    write_json(json_path, payload)
    pointer_path = photo_root / LATEST_OUTPUT_POINTER
    write_json(
        pointer_path,
        {
            "schema": "quipsly.photoGrove.sourceIntegrityPointer.v1",
            "status": payload["status"],
            "generatedAt": payload["generatedAt"],
            "jsonPath": str(json_path),
            "htmlPath": str(html_path),
            "markdownPath": str(markdown_path),
            "csvPath": str(csv_path),
            "manifestPath": str(manifest_path),
            "counts": payload["counts"],
        },
    )
    return payload


def main() -> int:
    photo_root = Path(sys.argv[1]) if len(sys.argv) > 1 else DEFAULT_PHOTO_ROOT
    try:
        payload = build(photo_root)
    except Exception as exc:  # noqa: BLE001 - CLI must surface calm operator error.
        print(json.dumps({"status": "photo-grove-source-integrity-failed", "error": str(exc)}, indent=2))
        return 1
    print(json.dumps({k: payload[k] for k in ["status", "jsonPath", "htmlPath", "markdownPath", "csvPath", "counts"]}, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
