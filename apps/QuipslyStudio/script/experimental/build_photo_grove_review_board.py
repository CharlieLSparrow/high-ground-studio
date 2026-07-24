#!/usr/bin/env python3
"""Build a safe Photo Grove culling/review board from an external photo folder.

This is the first Quipsly "Aftershoot-like" proof lane. It intentionally keeps
the actual photos immutable: originals are only read, while thumbnails,
metadata, sidecars, review ledgers, and export packets are written into a
Quipsly-managed output folder.

The script is conservative about analysis. Without a dedicated vision model or
image-quality dependency installed, it does not pretend to know what is sharp or
beautiful. It surfaces duplicates and problem candidates, creates a clear human
review queue, and leaves room for better classifiers later.
"""

from __future__ import annotations

import argparse
import csv
import hashlib
import html
import json
import math
import os
import re
import shutil
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

DEFAULT_SOURCE = Path("/Volumes/My Passport/Bender_Card_Backup/DCIM")
DEFAULT_OUTPUT_ROOT = Path("/Volumes/My Passport/Quipsly Media Workspace/PhotoGrove")
IMAGE_EXTENSIONS = {
    ".jpg",
    ".jpeg",
    ".heic",
    ".png",
    ".tif",
    ".tiff",
    ".dng",
    ".cr2",
    ".cr3",
    ".nef",
    ".arw",
}
RAW_EXTENSIONS = {".dng", ".cr2", ".cr3", ".nef", ".arw"}


def iso_now() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def slugify(value: str) -> str:
    slug = re.sub(r"[^a-zA-Z0-9]+", "-", value.strip()).strip("-").lower()
    return slug or "photo-grove-session"


def human_bytes(value: int) -> str:
    size = float(value)
    units = ["B", "KB", "MB", "GB", "TB"]
    index = 0
    while size >= 1024 and index < len(units) - 1:
        size /= 1024
        index += 1
    if index == 0:
        return f"{int(size)} {units[index]}"
    return f"{size:.1f} {units[index]}"


def shell_quote(value: str) -> str:
    return "'" + value.replace("'", "'\\''") + "'"


def run_command(args: list[str], timeout: int = 20) -> tuple[int, str, str]:
    try:
        completed = subprocess.run(
            args,
            check=False,
            capture_output=True,
            text=True,
            timeout=timeout,
        )
        return completed.returncode, completed.stdout, completed.stderr
    except Exception as exc:
        return 99, "", str(exc)


def emit_progress(session_dir: Path, stage: str, current: int, total: int, message: str) -> None:
    event = {
        "at": iso_now(),
        "stage": stage,
        "current": current,
        "total": total,
        "message": message,
    }
    try:
        with (session_dir / "progress-events.jsonl").open("a", encoding="utf-8") as handle:
            handle.write(json.dumps(event, sort_keys=True) + "\n")
    except Exception:
        pass
    print(f"[Photo Grove] {stage} {current}/{total}: {message}", file=sys.stderr, flush=True)


def read_sample_hash(path: Path) -> str:
    """Hash small source samples for duplicate candidates without full-file churn."""
    digest = hashlib.sha256()
    try:
        size = path.stat().st_size
        with path.open("rb") as handle:
            digest.update(handle.read(128 * 1024))
            if size > 256 * 1024:
                handle.seek(max(0, size - 128 * 1024))
                digest.update(handle.read(128 * 1024))
        return digest.hexdigest()
    except Exception:
        return ""


def photo_id_for(path: Path) -> str:
    try:
        stat = path.stat()
        source = f"{path.resolve()}|{stat.st_size}|{stat.st_mtime_ns}"
    except Exception:
        source = str(path.resolve())
    return hashlib.sha1(source.encode("utf-8")).hexdigest()[:16]


def filename_sequence_number(path: Path) -> int | None:
    matches = re.findall(r"(\d+)", path.stem)
    if not matches:
        return None
    try:
        return int(matches[-1])
    except ValueError:
        return None


def parse_iso_seconds(value: str) -> float | None:
    if not value:
        return None
    try:
        return datetime.fromisoformat(value.replace("Z", "+00:00")).timestamp()
    except Exception:
        return None


def discover_photos(source: Path, limit: int) -> list[Path]:
    photos: list[Path] = []
    for root, dirs, files in os.walk(source):
        dirs[:] = [d for d in dirs if d not in {".Spotlight-V100", ".Trashes", ".fseventsd"}]
        for filename in sorted(files):
            path = Path(root) / filename
            if path.suffix.lower() in IMAGE_EXTENSIONS:
                photos.append(path)
                if limit > 0 and len(photos) >= limit:
                    return photos
    return photos


def parse_sips_metadata(path: Path) -> dict[str, Any]:
    code, stdout, stderr = run_command(["sips", "-g", "pixelWidth", "-g", "pixelHeight", "-g", "format", str(path)], timeout=15)
    metadata: dict[str, Any] = {
        "pixelWidth": None,
        "pixelHeight": None,
        "format": "",
        "sipsReadable": code == 0,
        "sipsError": stderr.strip() if code != 0 else "",
    }
    if code != 0:
        return metadata
    for line in stdout.splitlines():
        text = line.strip()
        if ":" not in text:
            continue
        key, value = [part.strip() for part in text.split(":", 1)]
        if key in {"pixelWidth", "pixelHeight"}:
            try:
                metadata[key] = int(value)
            except ValueError:
                metadata[key] = None
        elif key == "format":
            metadata[key] = value
    return metadata


def parse_spotlight_metadata(path: Path) -> dict[str, Any]:
    names = [
        "kMDItemContentCreationDate",
        "kMDItemAcquisitionMake",
        "kMDItemAcquisitionModel",
        "kMDItemFNumber",
        "kMDItemExposureTimeSeconds",
        "kMDItemISOSpeed",
        "kMDItemFocalLength",
    ]
    args = ["mdls", "-raw"]
    for name in names:
        args.extend(["-name", name])
    args.append(str(path))
    code, stdout, _stderr = run_command(args, timeout=12)
    if code != 0:
        return {}
    values: dict[str, Any] = {}
    current_key = ""
    for line in stdout.splitlines():
        if " = " in line:
            key, value = line.split(" = ", 1)
            current_key = key.strip()
            values[current_key] = value.strip()
        elif current_key:
            values[current_key] = f"{values[current_key]} {line.strip()}".strip()
    return {key: value for key, value in values.items() if value not in {"(null)", "null", ""}}


def cache_json_path(cache_dir: Path, key: str) -> Path:
    cache_dir.mkdir(parents=True, exist_ok=True)
    return cache_dir / f"{key}.json"


def read_photo_fact_cache(cache_dir: Path, photo_id: str) -> dict[str, Any] | None:
    path = cache_json_path(cache_dir, photo_id)
    if not path.exists():
        return None
    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
        return payload if isinstance(payload, dict) else None
    except Exception:
        return None


def write_photo_fact_cache(cache_dir: Path, photo_id: str, payload: dict[str, Any]) -> None:
    path = cache_json_path(cache_dir, photo_id)
    path.write_text(json.dumps(payload, indent=2, sort_keys=True) + "\n", encoding="utf-8")


def make_thumbnail(
    path: Path,
    photo_id: str,
    thumbs_dir: Path,
    disabled: bool,
    thumbnail_cache_dir: Path | None = None,
) -> tuple[str, str, bool]:
    if disabled:
        return "", "thumbnail generation disabled", False
    thumbs_dir.mkdir(parents=True, exist_ok=True)
    thumb_path = thumbs_dir / f"{photo_id}.jpg"
    if thumb_path.exists() and thumb_path.stat().st_size > 0:
        return str(thumb_path), "", True
    cache_path = thumbnail_cache_dir / f"{photo_id}.jpg" if thumbnail_cache_dir else None
    if cache_path and cache_path.exists() and cache_path.stat().st_size > 0:
        shutil.copy2(cache_path, thumb_path)
        return str(thumb_path), "", True
    code, _stdout, stderr = run_command(
        ["sips", "-s", "format", "jpeg", "-Z", "640", str(path), "--out", str(thumb_path)],
        timeout=30,
    )
    if code == 0 and thumb_path.exists() and thumb_path.stat().st_size > 0:
        if cache_path:
            cache_path.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(thumb_path, cache_path)
        return str(thumb_path), "", False
    if thumb_path.exists():
        thumb_path.unlink(missing_ok=True)
    return "", (stderr.strip() or "thumbnail unavailable"), False


def initial_flags(item: dict[str, Any]) -> list[str]:
    flags: list[str] = []
    if item["bytes"] <= 0:
        flags.append("empty-file")
    if not item["metadata"].get("pixelWidth") or not item["metadata"].get("pixelHeight"):
        flags.append("needs-preview")
    if item["kind"] == "raw":
        flags.append("raw-review")
    if not item.get("thumbnailPath"):
        flags.append("no-thumbnail")
    if item["extension"] in {".png"} and "screenshot" in item["filename"].lower():
        flags.append("screenshot")
    return flags


def parse_metadata_stdout(stdout: str) -> dict[str, float]:
    values: dict[str, float] = {}
    for line in stdout.splitlines():
        if not line.startswith("lavfi.signalstats.") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        try:
            values[key.rsplit(".", 1)[-1]] = float(value)
        except ValueError:
            continue
    return values


def parse_blur_mean(stderr: str) -> float | None:
    match = re.search(r"blur mean:\s*([^\s]+)", stderr)
    if not match:
        return None
    try:
        value = float(match.group(1))
    except ValueError:
        return None
    if not math.isfinite(value):
        return None
    return value


def analyze_thumbnail_quality(
    thumbnail_path: str,
    cache_dir: Path | None = None,
    cache_key: str = "",
    quality_mode: str = "cached",
) -> dict[str, Any]:
    if quality_mode == "off":
        return {
            "qualityStatus": "skipped",
            "qualityFlags": ["quality-analysis-skipped"],
            "qualityNote": "Thumbnail quality analysis was intentionally skipped for this run.",
            "tool": "ffmpeg-thumbnail-analysis",
            "toolAvailable": bool(shutil.which("ffmpeg")),
            "cacheHit": False,
        }
    if not thumbnail_path:
        return {
            "qualityStatus": "not-scored",
            "qualityFlags": ["no-thumbnail-analysis"],
            "qualityNote": "No thumbnail was available for local quality hints.",
            "tool": "ffmpeg-thumbnail-analysis",
            "toolAvailable": bool(shutil.which("ffmpeg")),
        }
    if not shutil.which("ffmpeg"):
        return {
            "qualityStatus": "not-scored",
            "qualityFlags": ["quality-tool-unavailable"],
            "qualityNote": "`ffmpeg` is unavailable, so Photo Grove cannot create local thumbnail quality hints yet.",
            "tool": "ffmpeg-thumbnail-analysis",
            "toolAvailable": False,
        }
    cache_path = None
    if cache_dir and cache_key:
        cache_dir.mkdir(parents=True, exist_ok=True)
        cache_path = cache_dir / f"{cache_key}.json"
        if quality_mode == "cached" and cache_path.exists():
            try:
                cached = json.loads(cache_path.read_text(encoding="utf-8"))
                if isinstance(cached, dict):
                    cached["cacheHit"] = True
                    return cached
            except Exception:
                pass

    signal_code, signal_stdout, signal_stderr = run_command(
        [
            "ffmpeg",
            "-hide_banner",
            "-nostats",
            "-i",
            thumbnail_path,
            "-vf",
            "signalstats,metadata=print:file=-",
            "-frames:v",
            "1",
            "-f",
            "null",
            "-",
        ],
        timeout=20,
    )
    blur_code, _blur_stdout, blur_stderr = run_command(
        [
            "ffmpeg",
            "-hide_banner",
            "-nostats",
            "-i",
            thumbnail_path,
            "-vf",
            "blurdetect",
            "-frames:v",
            "1",
            "-f",
            "null",
            "-",
        ],
        timeout=20,
    )
    metrics = parse_metadata_stdout(signal_stdout)
    blur_mean = parse_blur_mean(blur_stderr)
    flags: list[str] = []
    notes: list[str] = []

    yavg = metrics.get("YAVG")
    ymin = metrics.get("YMIN")
    ymax = metrics.get("YMAX")
    ylow = metrics.get("YLOW")
    yhigh = metrics.get("YHIGH")
    satavg = metrics.get("SATAVG")

    if signal_code != 0:
        flags.append("quality-signalstats-failed")
        notes.append((signal_stderr.strip() or "Signalstats failed.")[:240])
    if blur_code != 0:
        flags.append("quality-blurdetect-failed")
    if yavg is not None:
        if yavg >= 252 and ymin is not None and ymin >= 248:
            flags.extend(["preview-all-white", "thumbnail-analysis-suspect"])
            notes.append("Thumbnail appears nearly all white; inspect the RAW/source before judging exposure.")
        elif yavg <= 8 and ymax is not None and ymax <= 80:
            flags.extend(["preview-very-dark", "exposure-review-candidate"])
            notes.append("Thumbnail appears very dark; inspect before keeping/rejecting.")
        elif yavg <= 32:
            flags.append("exposure-review-candidate")
            notes.append("Thumbnail average luminance is low.")
        elif yavg >= 235:
            flags.append("highlight-review-candidate")
            notes.append("Thumbnail average luminance is high.")
    if yavg is not None and yhigh is not None and yavg >= 180 and yhigh >= 252:
        flags.append("highlight-clipping-preview")
    if yavg is not None and ylow is not None and yavg <= 80 and ylow <= 3:
        flags.append("shadow-clipping-preview")
    if satavg is not None and satavg <= 1 and yavg is not None and yavg in {0, 255}:
        flags.append("blank-preview-candidate")

    result = {
        "qualityStatus": "review-hints-ready" if metrics or blur_mean is not None else "not-scored",
        "qualityFlags": sorted(set(flags)),
        "qualityNote": " ".join(notes) or "Thumbnail quality hints are available. Treat them as review routing, not a keep/reject decision.",
        "tool": "ffmpeg-thumbnail-analysis",
        "toolAvailable": True,
        "cacheHit": False,
        "signalstatsReturnCode": signal_code,
        "blurdetectReturnCode": blur_code,
        "metrics": {
            "YMIN": ymin,
            "YLOW": ylow,
            "YAVG": yavg,
            "YHIGH": yhigh,
            "YMAX": ymax,
            "SATAVG": satavg,
            "blurMean": blur_mean,
        },
    }
    if cache_path:
        cache_path.write_text(json.dumps(result, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    return result


def mark_quality_outliers(items: list[dict[str, Any]]) -> None:
    blur_values = sorted(
        float(item["analysis"].get("qualityHints", {}).get("metrics", {}).get("blurMean"))
        for item in items
        if isinstance(item.get("analysis"), dict)
        and item["analysis"].get("qualityHints", {}).get("metrics", {}).get("blurMean") is not None
    )
    if len(blur_values) < 5:
        return
    threshold_index = max(0, min(len(blur_values) - 1, int(len(blur_values) * 0.85)))
    threshold = blur_values[threshold_index]
    for item in items:
        hints = item["analysis"].get("qualityHints") or {}
        blur_mean = hints.get("metrics", {}).get("blurMean") if isinstance(hints.get("metrics"), dict) else None
        if blur_mean is None or blur_mean < threshold:
            continue
        flags = item["analysis"].setdefault("problemFlags", [])
        if "sharpness-review-candidate" not in flags:
            flags.append("sharpness-review-candidate")
        quality_flags = hints.setdefault("qualityFlags", [])
        if "relative-high-blurdetect-score" not in quality_flags:
            quality_flags.append("relative-high-blurdetect-score")
        item["analysis"]["sharpnessStatus"] = "review-candidate"
        item["analysis"]["sharpnessNote"] = (
            "This thumbnail is in the higher blurdetect range for this session. "
            "Use as a comparison hint only; do not auto-reject."
        )


def relative_uri(path: str | Path, base: Path) -> str:
    if not path:
        return ""
    try:
        return Path(path).resolve().relative_to(base.resolve()).as_posix()
    except Exception:
        return Path(path).resolve().as_uri()


def build_photo_items(
    source: Path,
    photos: list[Path],
    session_dir: Path,
    no_thumbnails: bool,
    quality_mode: str,
) -> list[dict[str, Any]]:
    thumbs_dir = session_dir / "thumbnails"
    quality_cache_dir = session_dir.parent / "analysis-cache" / "thumbnail-quality-v2"
    thumbnail_cache_dir = session_dir.parent / "analysis-cache" / "thumbnails-v1"
    metadata_cache_dir = session_dir.parent / "analysis-cache" / "photo-facts-v1"
    items: list[dict[str, Any]] = []
    total = len(photos)
    emit_progress(session_dir, "index", 0, total, f"starting read-only scan with quality_mode={quality_mode}")
    for index, path in enumerate(photos, start=1):
        stat = path.stat()
        photo_id = photo_id_for(path)
        cached_facts = read_photo_fact_cache(metadata_cache_dir, photo_id)
        if cached_facts:
            metadata = cached_facts.get("metadata") if isinstance(cached_facts.get("metadata"), dict) else {}
            spotlight = cached_facts.get("spotlight") if isinstance(cached_facts.get("spotlight"), dict) else {}
            sample_hash = str(cached_facts.get("sampleHash") or "")
            sequence_number = cached_facts.get("sequenceNumber")
            metadata_cache_hit = True
        else:
            metadata = parse_sips_metadata(path)
            spotlight = parse_spotlight_metadata(path)
            sample_hash = read_sample_hash(path)
            sequence_number = filename_sequence_number(path)
            metadata_cache_hit = False
            write_photo_fact_cache(metadata_cache_dir, photo_id, {
                "schema": "quipsly.photo-grove.photo-facts-cache.v1",
                "generatedAt": iso_now(),
                "sourcePath": str(path),
                "metadata": metadata,
                "spotlight": spotlight,
                "sampleHash": sample_hash,
                "sequenceNumber": sequence_number,
                "truth": "Cached derived metadata only. Original photo was not modified.",
            })
        thumbnail_path, thumbnail_warning, thumbnail_cache_hit = make_thumbnail(path, photo_id, thumbs_dir, no_thumbnails, thumbnail_cache_dir)
        try:
            relative_path = path.resolve().relative_to(source.resolve()).as_posix()
        except Exception:
            relative_path = path.name
        item = {
            "index": index,
            "id": photo_id,
            "filename": path.name,
            "sourcePath": str(path),
            "relativePath": relative_path,
            "extension": path.suffix.lower(),
            "kind": "raw" if path.suffix.lower() in RAW_EXTENSIONS else "raster",
            "bytes": stat.st_size,
            "bytesLabel": human_bytes(stat.st_size),
            "modifiedAt": datetime.fromtimestamp(stat.st_mtime, timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z"),
            "sampleHash": sample_hash,
            "sequenceNumber": sequence_number,
            "metadata": metadata,
            "spotlight": spotlight,
            "thumbnailPath": thumbnail_path,
            "thumbnailRelativePath": relative_uri(thumbnail_path, session_dir) if thumbnail_path else "",
            "thumbnailWarning": thumbnail_warning,
            "review": {
                "status": "pending",
                "rating": None,
                "tags": [],
                "note": "",
            },
            "analysis": {
                "sharpnessStatus": "not-scored",
                "sharpnessNote": "Sharpness is a review hint only. Use local thumbnail metrics for routing, not automatic rejection.",
                "duplicateStatus": "not-grouped",
                "problemFlags": [],
                "cache": {
                    "photoFactsCacheHit": metadata_cache_hit,
                    "thumbnailCacheHit": thumbnail_cache_hit,
                },
                "qualityHints": analyze_thumbnail_quality(thumbnail_path, quality_cache_dir, photo_id, quality_mode),
            },
        }
        item["analysis"]["problemFlags"] = initial_flags(item)
        for flag in item["analysis"].get("qualityHints", {}).get("qualityFlags", []):
            if flag not in item["analysis"]["problemFlags"]:
                item["analysis"]["problemFlags"].append(flag)
        items.append(item)
        if index == 1 or index % 10 == 0 or index == total:
            cache_state = "cache-hit" if item["analysis"].get("qualityHints", {}).get("cacheHit") else "analyzed"
            if quality_mode == "off":
                cache_state = "quality-skipped"
            fact_state = "facts-hit" if metadata_cache_hit else "facts-read"
            thumb_state = "thumb-hit" if thumbnail_cache_hit else "thumb-made"
            emit_progress(session_dir, "index", index, total, f"{path.name} ({fact_state}, {thumb_state}, {cache_state})")
    mark_quality_outliers(items)
    emit_progress(session_dir, "analysis", total, total, "quality hints and review outliers prepared")
    mark_duplicate_candidates(items)
    mark_review_groups(items)
    emit_progress(session_dir, "groups", total, total, "duplicate candidates and sequence review groups prepared")
    return items


def mark_duplicate_candidates(items: list[dict[str, Any]]) -> None:
    groups: dict[str, list[dict[str, Any]]] = {}
    for item in items:
        key = f"{item.get('bytes')}:{item.get('sampleHash')}"
        if item.get("sampleHash"):
            groups.setdefault(key, []).append(item)
    group_index = 0
    for group_items in groups.values():
        if len(group_items) < 2:
            continue
        group_index += 1
        group_id = f"exact-candidate-{group_index:03d}"
        for item in group_items:
            item["analysis"]["duplicateStatus"] = "exact-sample-match"
            item["analysis"]["duplicateGroupId"] = group_id
            item["analysis"]["problemFlags"].append("duplicate-candidate")


def review_group_key(item: dict[str, Any]) -> str:
    source_path = Path(str(item.get("sourcePath") or ""))
    camera = item.get("spotlight", {}).get("kMDItemAcquisitionModel") or source_path.parent.name
    return f"{source_path.parent.as_posix()}|{camera}|{item.get('extension')}"


def mark_review_groups(items: list[dict[str, Any]]) -> None:
    """Group nearby frames into comparison rails without deciding quality."""
    buckets: dict[str, list[dict[str, Any]]] = {}
    for item in items:
        buckets.setdefault(review_group_key(item), []).append(item)

    group_index = 0
    for bucket_items in buckets.values():
        ordered = sorted(
            bucket_items,
            key=lambda item: (
                parse_iso_seconds(str(item.get("modifiedAt") or "")) or 0,
                item.get("sequenceNumber") if item.get("sequenceNumber") is not None else 10**12,
                item.get("filename") or "",
            ),
        )
        current: list[dict[str, Any]] = []
        previous: dict[str, Any] | None = None
        for item in ordered:
            should_continue = False
            if previous:
                previous_time = parse_iso_seconds(str(previous.get("modifiedAt") or ""))
                current_time = parse_iso_seconds(str(item.get("modifiedAt") or ""))
                previous_seq = previous.get("sequenceNumber")
                current_seq = item.get("sequenceNumber")
                time_gap = (current_time - previous_time) if previous_time is not None and current_time is not None else None
                seq_gap = (current_seq - previous_seq) if isinstance(previous_seq, int) and isinstance(current_seq, int) else None
                should_continue = bool(
                    (time_gap is not None and 0 <= time_gap <= 180)
                    or (seq_gap is not None and 0 <= seq_gap <= 3)
                )
            if current and (not should_continue or len(current) >= 12):
                group_index = apply_review_group(current, group_index)
                current = []
            current.append(item)
            previous = item
        if current:
            group_index = apply_review_group(current, group_index)


def apply_review_group(group_items: list[dict[str, Any]], group_index: int) -> int:
    if len(group_items) < 2:
        item = group_items[0]
        item["analysis"]["reviewGroupStatus"] = "single"
        item["analysis"]["reviewGroupId"] = ""
        item["analysis"]["reviewGroupSize"] = 1
        item["analysis"]["reviewGroupPosition"] = 1
        return group_index
    group_index += 1
    group_id = f"sequence-{group_index:03d}"
    for position, item in enumerate(group_items, start=1):
        item["analysis"]["reviewGroupStatus"] = "sequence-group"
        item["analysis"]["reviewGroupId"] = group_id
        item["analysis"]["reviewGroupSize"] = len(group_items)
        item["analysis"]["reviewGroupPosition"] = position
        item["analysis"]["reviewGroupReason"] = "Nearby capture time or filename sequence. Review together; do not auto-reject."
        if "sequence-review" not in item["analysis"]["problemFlags"]:
            item["analysis"]["problemFlags"].append("sequence-review")
    return group_index


def summarize_review_groups(items: list[dict[str, Any]]) -> list[dict[str, Any]]:
    groups: dict[str, list[dict[str, Any]]] = {}
    for item in items:
        group_id = item["analysis"].get("reviewGroupId")
        if group_id:
            groups.setdefault(group_id, []).append(item)
    summaries: list[dict[str, Any]] = []
    for group_id, group_items in sorted(groups.items()):
        ordered = sorted(group_items, key=lambda item: item["analysis"].get("reviewGroupPosition") or 0)
        summaries.append({
            "id": group_id,
            "size": len(ordered),
            "firstFilename": ordered[0]["filename"],
            "lastFilename": ordered[-1]["filename"],
            "firstModifiedAt": ordered[0]["modifiedAt"],
            "lastModifiedAt": ordered[-1]["modifiedAt"],
            "samplePhotoIds": [item["id"] for item in ordered[:12]],
            "truth": "Review grouping only. This is not a quality judgment and originals are untouched.",
        })
    return summaries


def write_sidecars(session_dir: Path, items: list[dict[str, Any]]) -> None:
    sidecar_dir = session_dir / "sidecars"
    sidecar_dir.mkdir(parents=True, exist_ok=True)
    for item in items:
        path = sidecar_dir / f"{item['id']}.json"
        path.write_text(json.dumps(item, indent=2, sort_keys=True) + "\n", encoding="utf-8")


def write_review_groups(session_dir: Path, items: list[dict[str, Any]]) -> list[dict[str, Any]]:
    groups = summarize_review_groups(items)
    (session_dir / "review-groups.json").write_text(json.dumps({
        "schema": "quipsly.photo-grove.review-groups.v1",
        "generatedAt": iso_now(),
        "truth": "Groups help compare related frames. They are not rejection or keep decisions.",
        "groups": groups,
        "originalsMutated": False,
    }, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    lines = [
        "# Photo Grove review groups",
        "",
        "Groups are comparison aids only. They do not mutate originals or decide quality.",
        "",
        "| Group | Size | First | Last | Capture window |",
        "| --- | ---: | --- | --- | --- |",
    ]
    for group in groups:
        lines.append(
            f"| `{group['id']}` | {group['size']} | `{group['firstFilename']}` | `{group['lastFilename']}` | {group['firstModifiedAt']} -> {group['lastModifiedAt']} |"
        )
    (session_dir / "review-groups.md").write_text("\n".join(lines) + "\n", encoding="utf-8")
    return groups


def write_quality_hints(session_dir: Path, items: list[dict[str, Any]]) -> dict[str, Any]:
    candidates = []
    counts: dict[str, int] = {
        "total": len(items),
        "qualityHinted": 0,
        "sharpnessReviewCandidates": 0,
        "exposureReviewCandidates": 0,
        "blankOrSuspectPreviews": 0,
        "highlightReviewCandidates": 0,
        "shadowReviewCandidates": 0,
    }
    priority_flags = {
        "sharpness-review-candidate",
        "exposure-review-candidate",
        "preview-all-white",
        "preview-very-dark",
        "thumbnail-analysis-suspect",
        "highlight-review-candidate",
        "highlight-clipping-preview",
        "shadow-clipping-preview",
        "blank-preview-candidate",
    }
    for item in items:
        hints = item.get("analysis", {}).get("qualityHints") if isinstance(item.get("analysis"), dict) else {}
        quality_flags = hints.get("qualityFlags") if isinstance(hints, dict) else []
        flags = item.get("analysis", {}).get("problemFlags") if isinstance(item.get("analysis"), dict) else []
        flag_set = set(flags or []) | set(quality_flags or [])
        if hints and hints.get("qualityStatus") == "review-hints-ready":
            counts["qualityHinted"] += 1
        if "sharpness-review-candidate" in flag_set:
            counts["sharpnessReviewCandidates"] += 1
        if "exposure-review-candidate" in flag_set:
            counts["exposureReviewCandidates"] += 1
        if {"preview-all-white", "preview-very-dark", "thumbnail-analysis-suspect", "blank-preview-candidate"} & flag_set:
            counts["blankOrSuspectPreviews"] += 1
        if {"highlight-review-candidate", "highlight-clipping-preview"} & flag_set:
            counts["highlightReviewCandidates"] += 1
        if "shadow-clipping-preview" in flag_set:
            counts["shadowReviewCandidates"] += 1
        if priority_flags & flag_set:
            candidates.append({
                "id": item.get("id"),
                "filename": item.get("filename"),
                "sourcePath": item.get("sourcePath"),
                "thumbnailPath": item.get("thumbnailPath"),
                "flags": sorted(priority_flags & flag_set),
                "reviewGroupId": item.get("analysis", {}).get("reviewGroupId"),
                "reviewGroupPosition": item.get("analysis", {}).get("reviewGroupPosition"),
                "qualityHints": hints,
                "truth": "Quality hints are routing aids only. Do not reject or keep from metrics alone.",
            })
    packet = {
        "schema": "quipsly.photo-grove.quality-hints.v1",
        "generatedAt": iso_now(),
        "sessionDir": str(session_dir),
        "truth": "Local thumbnail quality hints only. Originals are not changed, and no keep/reject decision is automated.",
        "counts": counts,
        "candidates": candidates,
        "originalsMutated": False,
    }
    (session_dir / "quality-hints.json").write_text(json.dumps(packet, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    lines = [
        "# Photo Grove quality hints",
        "",
        f"Generated: {packet['generatedAt']}",
        "",
        "These are review-routing hints from generated thumbnails. They are not keep/reject decisions.",
        "",
        "## Counts",
        "",
    ]
    for key, value in counts.items():
        lines.append(f"- {key}: `{value}`")
    lines.extend([
        "",
        "## Candidates",
        "",
        "| File | Flags | Review group |",
        "| --- | --- | --- |",
    ])
    for candidate in candidates[:120]:
        lines.append(
            f"| `{candidate.get('filename')}` | {', '.join(candidate.get('flags') or [])} | `{candidate.get('reviewGroupId') or ''}` |"
        )
    (session_dir / "quality-hints.md").write_text("\n".join(lines) + "\n", encoding="utf-8")
    return packet


def write_review_ledgers(session_dir: Path, items: list[dict[str, Any]]) -> dict[str, Any]:
    ledger = {
        "schema": "quipsly.photo-grove.review-ledger.v1",
        "generatedAt": iso_now(),
        "truth": "Review state is local Quipsly metadata only. Originals are untouched.",
        "counts": summarize_items(items),
        "decisions": [
            {
                "id": item["id"],
                "filename": item["filename"],
                "sourcePath": item["sourcePath"],
                "status": "pending",
                "rating": None,
                "tags": [],
                "note": "",
                "safeActions": ["keep", "reject", "rate", "tag", "export-client-proof"],
                "flags": item["analysis"]["problemFlags"],
                "reviewGroupId": item["analysis"].get("reviewGroupId") or "",
                "reviewGroupPosition": item["analysis"].get("reviewGroupPosition") or None,
                "reviewGroupSize": item["analysis"].get("reviewGroupSize") or None,
            }
            for item in items
        ],
    }
    (session_dir / "review-ledger.json").write_text(json.dumps(ledger, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    lines = [
        "# Photo Grove review ledger",
        "",
        f"Generated: {ledger['generatedAt']}",
        "",
        "Originals are untouched. Update review decisions in the JSON ledger or future Photo Grove UI.",
        "",
        "| File | Status | Rating | Flags |",
        "| --- | --- | --- | --- |",
    ]
    for decision in ledger["decisions"]:
        flags = ", ".join(decision["flags"]) if decision["flags"] else "none"
        lines.append(f"| `{decision['filename']}` | pending | - | {flags} |")
    (session_dir / "review-ledger.md").write_text("\n".join(lines) + "\n", encoding="utf-8")
    return ledger


def write_export_packets(session_dir: Path, items: list[dict[str, Any]]) -> None:
    packet_dir = session_dir / "export-packets"
    packet_dir.mkdir(parents=True, exist_ok=True)
    csv_path = packet_dir / "photo-grove-review-candidates.csv"
    with csv_path.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(
            handle,
            fieldnames=[
                "id",
                "filename",
                "sourcePath",
                "status",
                "rating",
                "kind",
                "bytes",
                "pixelWidth",
                "pixelHeight",
                "duplicateStatus",
                "reviewGroupId",
                "reviewGroupPosition",
                "reviewGroupSize",
                "qualityStatus",
                "qualityFlags",
                "yavg",
                "blurMean",
                "flags",
            ],
        )
        writer.writeheader()
        for item in items:
            writer.writerow({
                "id": item["id"],
                "filename": item["filename"],
                "sourcePath": item["sourcePath"],
                "status": "pending",
                "rating": "",
                "kind": item["kind"],
                "bytes": item["bytes"],
                "pixelWidth": item["metadata"].get("pixelWidth") or "",
                "pixelHeight": item["metadata"].get("pixelHeight") or "",
                "duplicateStatus": item["analysis"].get("duplicateStatus") or "",
                "reviewGroupId": item["analysis"].get("reviewGroupId") or "",
                "reviewGroupPosition": item["analysis"].get("reviewGroupPosition") or "",
                "reviewGroupSize": item["analysis"].get("reviewGroupSize") or "",
                "qualityStatus": item["analysis"].get("qualityHints", {}).get("qualityStatus") or "",
                "qualityFlags": ";".join(item["analysis"].get("qualityHints", {}).get("qualityFlags") or []),
                "yavg": item["analysis"].get("qualityHints", {}).get("metrics", {}).get("YAVG") or "",
                "blurMean": item["analysis"].get("qualityHints", {}).get("metrics", {}).get("blurMean") or "",
                "flags": ";".join(item["analysis"].get("problemFlags") or []),
            })
    (packet_dir / "START-HERE-client-review-packet.md").write_text(
        "\n".join([
            "# Photo Grove client/review packet",
            "",
            "This packet is a safe staging area for culling and client review.",
            "",
            "- Originals remain in the source folder.",
            "- Review choices live in `review-ledger.json` and this packet CSV.",
            "- `keep`, `reject`, and ratings are metadata decisions until an explicit export step exists.",
        "- Duplicate/problem flags are review helpers, not automatic rejection.",
        "- Quality hints are thumbnail-based routing aids, not keep/reject decisions.",
        "- `review-groups.json` clusters nearby frames so humans and agents can compare bursts together.",
        "- `quality-hints.json` lists likely exposure/preview/sharpness review candidates.",
        "",
        f"Candidate CSV: `{csv_path}`",
        ])
        + "\n",
        encoding="utf-8",
    )


def refresh_export_prep(session_dir: Path) -> str:
    try:
        import photo_grove_export_packet

        packet = photo_grove_export_packet.build_export_packet(session_dir)
        return str(packet.get("markdownPath") or "")
    except Exception as exc:
        warning_path = session_dir / "export-packets" / "export-prep-warning.txt"
        warning_path.parent.mkdir(parents=True, exist_ok=True)
        warning_path.write_text(
            f"Photo Grove export-prep refresh failed: {exc}\n",
            encoding="utf-8",
        )
        return ""


def summarize_items(items: list[dict[str, Any]]) -> dict[str, Any]:
    duplicate_count = sum(1 for item in items if "duplicate-candidate" in item["analysis"].get("problemFlags", []))
    problem_count = sum(1 for item in items if item["analysis"].get("problemFlags"))
    raw_count = sum(1 for item in items if item["kind"] == "raw")
    thumbnail_count = sum(1 for item in items if item.get("thumbnailPath"))
    review_group_ids = {item["analysis"].get("reviewGroupId") for item in items if item["analysis"].get("reviewGroupId")}
    grouped_count = sum(1 for item in items if item["analysis"].get("reviewGroupId"))
    sharpness_count = sum(1 for item in items if "sharpness-review-candidate" in item["analysis"].get("problemFlags", []))
    exposure_count = sum(1 for item in items if "exposure-review-candidate" in item["analysis"].get("problemFlags", []))
    suspect_preview_count = sum(
        1
        for item in items
        if {"preview-all-white", "preview-very-dark", "thumbnail-analysis-suspect", "blank-preview-candidate"}
        & set(item["analysis"].get("problemFlags", []))
    )
    quality_hinted_count = sum(
        1
        for item in items
        if item["analysis"].get("qualityHints", {}).get("qualityStatus") == "review-hints-ready"
    )
    quality_cache_hits = sum(1 for item in items if item["analysis"].get("qualityHints", {}).get("cacheHit"))
    quality_skipped = sum(1 for item in items if item["analysis"].get("qualityHints", {}).get("qualityStatus") == "skipped")
    photo_fact_cache_hits = sum(1 for item in items if item["analysis"].get("cache", {}).get("photoFactsCacheHit"))
    thumbnail_cache_hits = sum(1 for item in items if item["analysis"].get("cache", {}).get("thumbnailCacheHit"))
    return {
        "total": len(items),
        "raw": raw_count,
        "raster": len(items) - raw_count,
        "withThumbnails": thumbnail_count,
        "qualityHinted": quality_hinted_count,
        "qualityCacheHits": quality_cache_hits,
        "qualityCacheMisses": max(0, quality_hinted_count - quality_cache_hits),
        "qualitySkipped": quality_skipped,
        "photoFactCacheHits": photo_fact_cache_hits,
        "photoFactCacheMisses": max(0, len(items) - photo_fact_cache_hits),
        "thumbnailCacheHits": thumbnail_cache_hits,
        "thumbnailCacheMisses": max(0, thumbnail_count - thumbnail_cache_hits),
        "sharpnessReviewCandidates": sharpness_count,
        "exposureReviewCandidates": exposure_count,
        "suspectPreviewCandidates": suspect_preview_count,
        "duplicateCandidates": duplicate_count,
        "reviewGroups": len(review_group_ids),
        "groupedPhotos": grouped_count,
        "problemOrReviewFlags": problem_count,
        "pendingReview": len(items),
        "originalsMutated": False,
    }


def write_manifest(session_dir: Path, source: Path, output_root: Path, items: list[dict[str, Any]]) -> dict[str, Any]:
    review_groups = summarize_review_groups(items)
    manifest = {
        "schema": "quipsly.photo-grove.session.v1",
        "generatedAt": iso_now(),
        "sourceRoot": str(source),
        "outputRoot": str(output_root),
        "sessionDir": str(session_dir),
        "progressEventsPath": str(session_dir / "progress-events.jsonl"),
        "truth": "External-drive photo culling proof. Originals are read-only; review decisions are sidecar metadata.",
        "safety": {
            "originalsMutated": False,
            "externalPublishing": False,
            "previousVersionsOverwritten": False,
            "writesStayInsideSessionDir": True,
        },
        "counts": summarize_items(items),
        "qualityHintsPath": str(session_dir / "quality-hints.json") if (session_dir / "quality-hints.json").exists() else "",
        "reviewGroups": review_groups,
        "items": items,
    }
    (session_dir / "manifest.json").write_text(json.dumps(manifest, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    return manifest


def write_html(session_dir: Path, manifest: dict[str, Any]) -> None:
    counts = manifest["counts"]
    group_cards = []
    for group in manifest.get("reviewGroups") or []:
        group_cards.append(
            f"<article class='group-card'><b>{html.escape(group['id'])}</b><span>{group['size']} frames</span><small>{html.escape(group['firstFilename'])} -> {html.escape(group['lastFilename'])}</small></article>"
        )
    cards = []
    for item in manifest["items"]:
        flags = item["analysis"].get("problemFlags") or []
        flag_html = "".join(f"<span class='flag'>{html.escape(flag)}</span>" for flag in flags) or "<span class='ok'>clean</span>"
        group_label = item["analysis"].get("reviewGroupId") or "single"
        quality = item["analysis"].get("qualityHints") or {}
        metrics = quality.get("metrics") if isinstance(quality.get("metrics"), dict) else {}
        quality_line = ""
        if metrics:
            yavg = metrics.get("YAVG")
            blur_mean = metrics.get("blurMean")
            metric_parts = []
            if yavg is not None:
                metric_parts.append(f"YAVG {round(float(yavg), 1)}")
            if blur_mean is not None:
                metric_parts.append(f"blur {round(float(blur_mean), 2)}")
            quality_line = " · ".join(metric_parts)
        thumb = item.get("thumbnailRelativePath")
        if thumb:
            preview = f"<img src='{html.escape(thumb)}' alt='Photo thumbnail'>"
        else:
            preview = "<div class='no-thumb'>Preview pending</div>"
        width = item["metadata"].get("pixelWidth") or "?"
        height = item["metadata"].get("pixelHeight") or "?"
        cards.append(
            f"""
            <article class="card">
              <div class="preview">{preview}</div>
              <div class="body">
                <h3>{html.escape(item['filename'])}</h3>
                <p class="muted">{html.escape(item['relativePath'])}</p>
                <p><b>{html.escape(item['kind'])}</b> · {html.escape(item['bytesLabel'])} · {width} x {height}</p>
                <p class="muted">Review group: <b>{html.escape(str(group_label))}</b></p>
                <p class="muted">Quality hints: {html.escape(quality_line or quality.get('qualityStatus') or 'not scored')}</p>
                <div class="flags">{flag_html}</div>
                <div class="actions">
                  <span>Keep</span><span>Reject</span><span>Rate</span><span>Tag</span>
                </div>
              </div>
            </article>
            """
        )
    html_text = f"""<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Photo Grove Review Board</title>
  <style>
    :root {{
      color-scheme: dark;
      --bg: #101814;
      --panel: #17231d;
      --panel-2: #213126;
      --ink: #f5f0df;
      --muted: #bdb396;
      --moss: #89b66d;
      --gold: #e4c35f;
      --clay: #be7254;
      --line: rgba(245, 240, 223, 0.16);
    }}
    * {{ box-sizing: border-box; }}
    body {{
      margin: 0;
      font-family: Avenir Next, Helvetica Neue, sans-serif;
      background: radial-gradient(circle at top left, #263b2d, var(--bg) 42%);
      color: var(--ink);
    }}
    header {{
      padding: 32px clamp(20px, 4vw, 56px);
      border-bottom: 1px solid var(--line);
      background: linear-gradient(135deg, rgba(137,182,109,.12), rgba(228,195,95,.08));
    }}
    .eyebrow {{ color: var(--gold); letter-spacing: .22em; text-transform: uppercase; font-weight: 800; font-size: 12px; }}
    h1 {{ margin: 10px 0 8px; font-size: clamp(32px, 5vw, 58px); line-height: .95; }}
    .summary {{ display: flex; gap: 12px; flex-wrap: wrap; margin-top: 18px; }}
    .pill {{ border: 1px solid var(--line); border-radius: 999px; padding: 9px 13px; background: rgba(0,0,0,.18); }}
    main {{ padding: 24px clamp(16px, 3vw, 40px) 56px; }}
    .notice {{ background: rgba(228,195,95,.11); border: 1px solid rgba(228,195,95,.28); border-radius: 18px; padding: 16px; margin-bottom: 20px; color: var(--muted); }}
    .groups {{ border:1px solid var(--line); border-radius:22px; padding:18px; margin-bottom:20px; background:rgba(0,0,0,.16); }}
    .group-grid {{ display:grid; grid-template-columns:repeat(auto-fill,minmax(210px,1fr)); gap:10px; }}
    .group-card {{ border:1px solid var(--line); border-radius:16px; padding:12px; background:rgba(137,182,109,.09); }}
    .group-card b, .group-card span, .group-card small {{ display:block; }}
    .group-card span {{ color:var(--gold); font-weight:900; margin-top:4px; }}
    .group-card small {{ color:var(--muted); overflow-wrap:anywhere; margin-top:4px; }}
    .grid {{ display: grid; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); gap: 16px; }}
    .card {{ overflow: hidden; border: 1px solid var(--line); border-radius: 20px; background: linear-gradient(180deg, var(--panel), var(--panel-2)); box-shadow: 0 14px 40px rgba(0,0,0,.22); }}
    .preview {{ height: 210px; display: grid; place-items: center; background: #0a0e0c; }}
    .preview img {{ width: 100%; height: 100%; object-fit: cover; display: block; }}
    .no-thumb {{ color: var(--muted); border: 1px dashed var(--line); border-radius: 14px; padding: 16px; }}
    .body {{ padding: 14px; }}
    h3 {{ margin: 0 0 6px; font-size: 16px; line-height: 1.2; }}
    p {{ margin: 7px 0; }}
    .muted {{ color: var(--muted); font-size: 12px; overflow-wrap: anywhere; }}
    .flags {{ display: flex; flex-wrap: wrap; gap: 6px; margin-top: 10px; }}
    .flag, .ok {{ font-size: 11px; padding: 5px 8px; border-radius: 999px; font-weight: 800; }}
    .flag {{ background: rgba(190,114,84,.18); color: #ffbd98; border: 1px solid rgba(190,114,84,.38); }}
    .ok {{ background: rgba(137,182,109,.16); color: #bff09e; border: 1px solid rgba(137,182,109,.32); }}
    .actions {{ display: flex; gap: 8px; flex-wrap: wrap; margin-top: 12px; }}
    .actions span {{ font-size: 12px; font-weight: 800; color: var(--ink); background: rgba(245,240,223,.09); border: 1px solid var(--line); border-radius: 10px; padding: 7px 9px; }}
  </style>
</head>
<body>
  <header>
    <div class="eyebrow">Quipsly Photo Grove</div>
    <h1>Cull without touching the originals.</h1>
    <p>Every card is source metadata plus review sidecar intent. Green means ready to review; clay flags mean “look here,” not “throw it away.”</p>
    <div class="summary">
      <span class="pill">{counts['total']} photos</span>
      <span class="pill">{counts['raw']} RAW</span>
      <span class="pill">{counts['withThumbnails']} thumbnails</span>
      <span class="pill">{counts.get('photoFactCacheHits', 0)} fact cache hits</span>
      <span class="pill">{counts.get('thumbnailCacheHits', 0)} thumb cache hits</span>
      <span class="pill">{counts.get('qualityHinted', 0)} quality hinted</span>
      <span class="pill">{counts.get('qualityCacheHits', 0)} cache hits</span>
      <span class="pill">{counts.get('sharpnessReviewCandidates', 0)} sharpness review</span>
      <span class="pill">{counts.get('exposureReviewCandidates', 0)} exposure review</span>
      <span class="pill">{counts['duplicateCandidates']} duplicate candidates</span>
      <span class="pill">{counts['reviewGroups']} review groups</span>
      <span class="pill">{counts['problemOrReviewFlags']} review flags</span>
    </div>
  </header>
  <main>
    <div class="notice">Source: <code>{html.escape(manifest['sourceRoot'])}</code><br>Session: <code>{html.escape(manifest['sessionDir'])}</code></div>
    <section class="groups">
      <h2>Review groups</h2>
      <p>Sequence groups are comparison rails: pick the strongest frame from a burst, tag the rest, and keep source files untouched.</p>
      <div class="group-grid">{''.join(group_cards) or '<p>No grouped sequences found in this scan.</p>'}</div>
    </section>
    <section class="grid">
      {''.join(cards)}
    </section>
  </main>
</body>
</html>
"""
    (session_dir / "index.html").write_text(html_text, encoding="utf-8")


def prepare_session_dir(source: Path, output_root: Path) -> Path:
    stamp = datetime.now().strftime("%Y%m%d-%H%M%S")
    session_name = f"{stamp}-{slugify(source.name)}"
    session_dir = output_root / session_name
    counter = 2
    while session_dir.exists():
        session_dir = output_root / f"{session_name}-{counter}"
        counter += 1
    session_dir.mkdir(parents=True, exist_ok=False)
    return session_dir


def update_latest_pointer(output_root: Path, session_dir: Path, manifest: dict[str, Any]) -> None:
    output_root.mkdir(parents=True, exist_ok=True)
    counts = manifest.get("counts") if isinstance(manifest.get("counts"), dict) else {}
    review_count = counts.get("review") or counts.get("flagged") or 0
    pending_count = counts.get("pending") or 0
    status = "photo-grove-review-board-ready"
    if review_count:
        status = "photo-grove-review-board-review-routed"
    elif pending_count:
        status = "photo-grove-review-board-pending-cull"
    html_path = str(session_dir / "index.html")
    manifest_path = str(session_dir / "manifest.json")
    ledger_path = str(session_dir / "review-ledger.json")
    pointer = {
        "schema": "quipsly.photo-grove.latest-pointer.v1",
        "updatedAt": iso_now(),
        "status": status,
        "latestSessionDir": str(session_dir),
        "manifestPath": manifest_path,
        "htmlPath": html_path,
        "reviewLedgerPath": ledger_path,
        "counts": counts,
        "humanAsk": "Open the Photo Grove review board, compare routed review groups visually, and record only deliberate sidecar decisions. Originals stay untouched.",
        "agentSafeParallelWork": "Codex can prepare contact sheets, cull suggestions, dry-run decision previews, proof packets, and review summaries without executing cull decisions or mutating originals.",
        "nextSafestAction": "Open the latest Photo Grove review board, start with routed review groups, and use dry-run commands before any metadata-sidecar decision.",
        "firstSafeAction": {
            "label": "Open Photo Grove review board",
            "command": f"open {shell_quote(html_path)}",
            "path": html_path,
            "safety": "Opens local photo review evidence only. No originals, metadata decisions, client delivery, uploads, publication, schedules, or receipts are changed.",
        },
        "truth": "Pointer only. Versioned session folders are preserved.",
    }
    (output_root / "latest-photo-grove-review.json").write_text(json.dumps(pointer, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    (output_root / "START-HERE-photo-grove.md").write_text(
        "\n".join([
            "# Photo Grove",
            "",
            "Latest local review board:",
            "",
            f"- Status: `{status}`",
            f"- HTML: `{session_dir / 'index.html'}`",
            f"- Manifest: `{session_dir / 'manifest.json'}`",
            f"- Review ledger: `{session_dir / 'review-ledger.json'}`",
            f"- Next safest action: {pointer['nextSafestAction']}",
            "",
            "Original photo files are not mutated. New scans create new session folders.",
        ])
        + "\n",
        encoding="utf-8",
    )


def main() -> int:
    parser = argparse.ArgumentParser(description="Build a Quipsly Photo Grove culling/review board.")
    parser.add_argument("source", nargs="?", default=str(DEFAULT_SOURCE), help="Photo source folder to scan read-only.")
    parser.add_argument("--output-root", default=str(DEFAULT_OUTPUT_ROOT), help="Quipsly-owned output root for review artifacts.")
    parser.add_argument("--limit", type=int, default=160, help="Maximum photos to index. Use 0 for no limit.")
    parser.add_argument("--no-thumbnails", action="store_true", help="Skip thumbnail generation.")
    parser.add_argument(
        "--quality-mode",
        choices=["cached", "full", "off"],
        default="cached",
        help="Thumbnail quality analysis mode: cached fills/reuses cache, full recomputes, off indexes without quality scoring.",
    )
    args = parser.parse_args()

    source = Path(args.source).expanduser()
    output_root = Path(args.output_root).expanduser()
    if not source.exists() or not source.is_dir():
        raise SystemExit(f"Source folder does not exist or is not a directory: {source}")
    if not shutil.which("sips"):
        raise SystemExit("macOS `sips` is required for this first Photo Grove proof lane.")

    session_dir = prepare_session_dir(source, output_root)
    photos = discover_photos(source, args.limit)
    items = build_photo_items(source, photos, session_dir, args.no_thumbnails, args.quality_mode)
    emit_progress(session_dir, "write", 0, len(items), "writing sidecars, ledgers, packets, and board")
    write_sidecars(session_dir, items)
    write_review_groups(session_dir, items)
    quality_packet = write_quality_hints(session_dir, items)
    write_review_ledgers(session_dir, items)
    write_export_packets(session_dir, items)
    manifest = write_manifest(session_dir, source, output_root, items)
    write_html(session_dir, manifest)
    export_prep_path = refresh_export_prep(session_dir)
    update_latest_pointer(output_root, session_dir, manifest)
    emit_progress(session_dir, "complete", len(items), len(items), "Photo Grove board complete")

    result = {
        "ok": True,
        "sourceRoot": str(source),
        "sessionDir": str(session_dir),
        "manifestPath": str(session_dir / "manifest.json"),
        "htmlPath": str(session_dir / "index.html"),
        "reviewLedgerPath": str(session_dir / "review-ledger.json"),
        "clientReviewPacketPath": str(session_dir / "export-packets" / "START-HERE-client-review-packet.md"),
        "exportPrepPath": export_prep_path,
        "qualityHintsPath": str(session_dir / "quality-hints.json"),
        "qualityHintCounts": quality_packet.get("counts") or {},
        "progressEventsPath": str(session_dir / "progress-events.jsonl"),
        "counts": manifest["counts"],
        "originalsMutated": False,
    }
    print(json.dumps(result, indent=2, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
