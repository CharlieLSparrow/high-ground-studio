#!/usr/bin/env python3
"""Build a read-only Photo Grove intake manifest.

This script does not move, edit, delete, rate, or rewrite source photos. It scans a
photo folder/card, records safe file metadata, groups likely RAW/JPEG companions,
and writes review artifacts outside the source tree.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
import sys
from collections import Counter, defaultdict
from dataclasses import asdict, dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Iterable

IMAGE_EXTENSIONS = {
    ".jpg", ".jpeg", ".png", ".heic", ".heif", ".tif", ".tiff",
    ".cr2", ".cr3", ".nef", ".arw", ".dng", ".raf", ".orf", ".rw2"
}
RAW_EXTENSIONS = {".cr2", ".cr3", ".nef", ".arw", ".dng", ".raf", ".orf", ".rw2"}
PREVIEW_EXTENSIONS = {".jpg", ".jpeg", ".heic", ".heif", ".png", ".tif", ".tiff"}
DEFAULT_OUTPUT_ROOTS = [
    Path("/Volumes/My Passport/Quipsly Media Workspace/PhotoGrove/IntakeManifests"),
    Path("/tmp/quipsly-photo-grove-intake"),
]


@dataclass
class PhotoEntry:
    id: str
    path: str
    relativePath: str
    fileName: str
    stem: str
    extension: str
    folder: str
    kind: str
    sizeBytes: int
    modifiedAt: str
    signature: str
    companionKey: str
    warnings: list[str]


def iso_from_timestamp(timestamp: float) -> str:
    return datetime.fromtimestamp(timestamp, timezone.utc).isoformat()


def safe_output_root() -> Path:
    for root in DEFAULT_OUTPUT_ROOTS:
        try:
            root.mkdir(parents=True, exist_ok=True)
            return root
        except OSError:
            continue
    raise RuntimeError("No writable Photo Grove intake output root available.")


def iter_photo_files(source: Path, max_files: int | None = None) -> Iterable[Path]:
    yielded = 0
    for root, dirs, files in os.walk(source):
        dirs[:] = [name for name in dirs if not name.startswith(".")]
        for name in sorted(files):
            if name.startswith("._"):
                continue
            path = Path(root) / name
            if path.suffix.lower() not in IMAGE_EXTENSIONS:
                continue
            yield path
            yielded += 1
            if max_files is not None and yielded >= max_files:
                return


def partial_signature(path: Path, stat: os.stat_result) -> str:
    hasher = hashlib.sha256()
    hasher.update(path.name.encode("utf-8", errors="replace"))
    hasher.update(str(stat.st_size).encode())
    hasher.update(str(int(stat.st_mtime)).encode())

    # Read only a tiny prefix/suffix window. Enough for stable diagnostics, not a
    # full-content hash and not a culling decision.
    try:
        with path.open("rb") as handle:
            prefix = handle.read(65536)
            hasher.update(prefix)
            if stat.st_size > 131072:
                handle.seek(max(0, stat.st_size - 65536))
                hasher.update(handle.read(65536))
    except OSError as error:
        hasher.update(f"read-error:{error}".encode())

    return hasher.hexdigest()[:24]


def metadata_signature(path: Path, stat: os.stat_result) -> str:
    hasher = hashlib.sha256()
    hasher.update(path.name.encode("utf-8", errors="replace"))
    hasher.update(str(stat.st_size).encode())
    hasher.update(str(int(stat.st_mtime)).encode())
    return hasher.hexdigest()[:24]


def classify_kind(extension: str) -> str:
    if extension in RAW_EXTENSIONS:
        return "raw"
    if extension in PREVIEW_EXTENSIONS:
        return "preview"
    return "image"


def build_entry(source: Path, path: Path, signature_mode: str) -> PhotoEntry | None:
    try:
        stat = path.stat()
    except OSError:
        return None

    extension = path.suffix.lower()
    warnings: list[str] = []
    if stat.st_size <= 0:
        warnings.append("zero-size")
    if path.name.startswith("._"):
        warnings.append("appledouble-sidecar")

    relative = path.relative_to(source)
    kind = classify_kind(extension)
    companion_key = str(relative.with_suffix("")).lower()
    signature = partial_signature(path, stat) if signature_mode == "partial" else metadata_signature(path, stat)
    entry_id = hashlib.sha1(f"{relative}:{stat.st_size}:{int(stat.st_mtime)}".encode()).hexdigest()[:16]

    return PhotoEntry(
        id=entry_id,
        path=str(path),
        relativePath=str(relative),
        fileName=path.name,
        stem=path.stem,
        extension=extension,
        folder=str(relative.parent),
        kind=kind,
        sizeBytes=stat.st_size,
        modifiedAt=iso_from_timestamp(stat.st_mtime),
        signature=signature,
        companionKey=companion_key,
        warnings=warnings,
    )


def write_json(path: Path, payload: object) -> None:
    path.write_text(json.dumps(payload, indent=2, sort_keys=True) + "\n", encoding="utf-8")


def main() -> int:
    parser = argparse.ArgumentParser(description="Build a read-only Photo Grove intake manifest.")
    parser.add_argument("--source", default="/Volumes/Bender/DCIM", help="Photo/card source folder to scan.")
    parser.add_argument("--output-root", default=None, help="Where to write Photo Grove manifest artifacts.")
    parser.add_argument("--max-files", type=int, default=None, help="Optional cap for quick smoke runs.")
    parser.add_argument("--signature-mode", choices=["metadata", "partial"], default="metadata", help="metadata is fast; partial reads tiny file windows for stronger diagnostics.")
    parser.add_argument("--progress-every", type=int, default=1000, help="Print progress to stderr every N indexed files. Set 0 to disable.")
    args = parser.parse_args()

    source = Path(args.source).expanduser().resolve()
    if not source.exists() or not source.is_dir():
        raise SystemExit(f"Source folder is not available: {source}")

    output_root = Path(args.output_root).expanduser() if args.output_root else safe_output_root()
    run_id = datetime.now().strftime("%Y%m%d-%H%M%S")
    output_dir = output_root / run_id
    output_dir.mkdir(parents=True, exist_ok=False)

    entries: list[PhotoEntry] = []
    skipped = Counter()
    for path in iter_photo_files(source, args.max_files):
        entry = build_entry(source, path, args.signature_mode)
        if entry is None:
            skipped["stat-error"] += 1
            continue
        entries.append(entry)
        if args.progress_every > 0 and len(entries) % args.progress_every == 0:
            print(f"indexed {len(entries)} files...", file=sys.stderr)

    by_extension = Counter(entry.extension for entry in entries)
    by_kind = Counter(entry.kind for entry in entries)
    by_folder = Counter(entry.folder for entry in entries)
    by_companion = defaultdict(list)
    by_signature = defaultdict(list)
    for entry in entries:
        by_companion[entry.companionKey].append(entry)
        by_signature[entry.signature].append(entry)

    companion_groups = []
    for key, group in by_companion.items():
        kinds = sorted(set(item.kind for item in group))
        extensions = sorted(set(item.extension for item in group))
        if len(group) <= 1:
            continue
        companion_groups.append({
            "companionKey": key,
            "count": len(group),
            "kinds": kinds,
            "extensions": extensions,
            "files": [item.relativePath for item in sorted(group, key=lambda item: item.extension)],
        })

    duplicate_signature_groups = []
    for signature, group in by_signature.items():
        if len(group) <= 1:
            continue
        duplicate_signature_groups.append({
            "signature": signature,
            "count": len(group),
            "files": [item.relativePath for item in group],
        })

    entries_jsonl = output_dir / "photo-grove-intake-manifest.jsonl"
    with entries_jsonl.open("w", encoding="utf-8") as handle:
        for entry in entries:
            handle.write(json.dumps(asdict(entry), sort_keys=True) + "\n")

    summary = {
        "status": "photo-grove-intake-manifest-ready",
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "source": str(source),
        "outputDir": str(output_dir),
        "entryCount": len(entries),
        "skipped": dict(skipped),
        "byExtension": dict(sorted(by_extension.items())),
        "byKind": dict(sorted(by_kind.items())),
        "topFolders": by_folder.most_common(20),
        "companionGroupCount": len(companion_groups),
        "duplicateSignatureGroupCount": len(duplicate_signature_groups),
        "signatureMode": args.signature_mode,
        "outputs": {
            "manifestJsonl": str(entries_jsonl),
            "summaryJson": str(output_dir / "photo-grove-intake-summary.json"),
            "reviewMarkdown": str(output_dir / "photo-grove-intake-review.md"),
        },
        "safety": {
            "mutatedOriginals": False,
            "movedOriginals": False,
            "deletedOriginals": False,
            "fullContentHash": False,
            "partialSignatureOnly": args.signature_mode == "partial",
            "metadataSignatureOnly": args.signature_mode == "metadata",
        },
    }
    write_json(output_dir / "photo-grove-intake-summary.json", summary)
    write_json(output_dir / "photo-grove-companion-groups.json", companion_groups[:5000])
    write_json(output_dir / "photo-grove-duplicate-signatures.json", duplicate_signature_groups[:5000])

    review_lines = [
        "# Photo Grove Intake Review",
        "",
        f"Generated: {summary['generatedAt']}",
        f"Source: `{source}`",
        f"Output: `{output_dir}`",
        "",
        "## Safety",
        "",
        "- Originals were not moved, deleted, edited, rated, or rewritten.",
        f"- Signature mode: `{args.signature_mode}`.",
        "- Metadata mode is fast and safe for first-pass intake; partial mode is available for stronger duplicate diagnostics.",
        "- This is an intake/review packet, not a cull decision.",
        "",
        "## Counts",
        "",
        f"- Files indexed: {len(entries)}",
        f"- RAW files: {by_kind.get('raw', 0)}",
        f"- Preview/image files: {by_kind.get('preview', 0) + by_kind.get('image', 0)}",
        f"- RAW/JPEG or related companion groups: {len(companion_groups)}",
        f"- Duplicate signature groups: {len(duplicate_signature_groups)}",
        "",
        "## Extensions",
        "",
    ]
    for extension, count in sorted(by_extension.items()):
        review_lines.append(f"- `{extension}`: {count}")

    review_lines.extend([
        "",
        "## Top folders",
        "",
    ])
    for folder, count in by_folder.most_common(20):
        review_lines.append(f"- `{folder}`: {count}")

    review_lines.extend([
        "",
        "## Next safe Photo Grove steps",
        "",
        "1. Build thumbnail/contact-sheet generation into a Quipsly-managed cache folder.",
        "2. Add non-destructive ratings sidecar: keep, reject, maybe, client-pick, duplicate-review.",
        "3. Add blur/exposure/duplicate heuristics as suggestions only, never automatic deletion.",
        "4. Add review packet UI that reads the manifest and sidecars without touching originals.",
    ])
    (output_dir / "photo-grove-intake-review.md").write_text("\n".join(review_lines) + "\n", encoding="utf-8")

    print(json.dumps({
        "status": summary["status"],
        "entryCount": summary["entryCount"],
        "outputDir": summary["outputDir"],
        "manifestJsonl": summary["outputs"]["manifestJsonl"],
        "summaryJson": summary["outputs"]["summaryJson"],
        "reviewMarkdown": summary["outputs"]["reviewMarkdown"],
    }, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
