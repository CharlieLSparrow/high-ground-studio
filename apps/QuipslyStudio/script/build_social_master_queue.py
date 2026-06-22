#!/usr/bin/env python3
"""Merge release and expansion social queues into one operator dashboard."""
from __future__ import annotations

import argparse
import csv
import json
import re
import shutil
import subprocess
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


def load_json(path: Path) -> dict[str, Any]:
    payload = json.loads(path.read_text())
    if not isinstance(payload, dict):
        raise ValueError(f"{path} must contain a JSON object.")
    return payload


def clip_duration(clip: dict[str, Any]) -> float:
    try:
        return float(clip.get("duration") or 0)
    except (TypeError, ValueError):
        return 0


def normalize_clip(path: Path, payload: dict[str, Any], clip: dict[str, Any], fallback_rank: int) -> dict[str, Any]:
    model = str(payload.get("model") or "")
    if model == "quipsly-social-publication-queue":
        source_pack = "release-candidate"
        status = str(clip.get("reviewStatus") or "ready-for-human-review")
        platforms = payload.get("platforms") or ["YouTube Shorts", "Instagram", "Facebook", "LinkedIn"]
        human_check = "Watch once; release queue copy and receipt ids are already prepared."
    elif model == "quipsly-social-expansion-pack":
        source_pack = "social-expansion"
        status = str(clip.get("reviewStatus") or "expansion-candidate-human-quote-check")
        platforms = list((clip.get("platformCopy") or {}).keys()) or payload.get("platforms") or []
        human_check = "Watch and quote-check scout transcript before posting."
    else:
        source_pack = model or path.stem
        status = str(clip.get("reviewStatus") or "needs-human-review")
        platforms = payload.get("platforms") or list((clip.get("platformCopy") or {}).keys())
        human_check = "Watch and verify metadata before posting."

    rank = int(clip.get("rank") or clip.get("queueIndex") or fallback_rank)
    return {
        "rank": rank,
        "queueIndex": clip.get("queueIndex"),
        "sourcePack": source_pack,
        "sourceManifest": str(path),
        "reviewStatus": status,
        "title": clip.get("title") or Path(str(clip.get("clipPath") or "clip")).stem,
        "hook": clip.get("hook") or clip.get("title") or "",
        "roughTranscript": clip.get("roughTranscript") or "",
        "duration": clip_duration(clip),
        "sourceSequenceStartSeconds": clip.get("sourceSequenceStartSeconds"),
        "sourceSequenceEndSeconds": clip.get("sourceSequenceEndSeconds"),
        "sourceShortClipId": clip.get("sourceShortClipId") or "",
        "sourcePublishReceiptIds": clip.get("sourcePublishReceiptIds") or [],
        "platformReceiptIds": clip.get("platformReceiptIds") or {},
        "clipPath": clip.get("clipPath") or "",
        "thumbnailPath": clip.get("thumbnailPath") or "",
        "captionSrtPath": clip.get("captionSrtPath") or "",
        "platformCopyPath": clip.get("platformCopyPath") or "",
        "platforms": platforms,
        "humanCheck": human_check,
    }


def collect_clips(paths: list[Path]) -> list[dict[str, Any]]:
    clips: list[dict[str, Any]] = []
    fallback_rank = 1
    for path in paths:
        payload = load_json(path)
        raw_clips = payload.get("clips")
        if not isinstance(raw_clips, list):
            raise ValueError(f"{path} does not have a clips list.")
        for clip in raw_clips:
            if not isinstance(clip, dict):
                continue
            clips.append(normalize_clip(path, payload, clip, fallback_rank))
            fallback_rank += 1
    clips.sort(key=lambda item: (int(item["rank"]), str(item["title"])))
    return clips


def slugify(value: str) -> str:
    value = value.lower().replace("'", "")
    value = re.sub(r"[^a-z0-9]+", "-", value).strip("-")
    return value or "clip"


def write_contact_sheet(clips: list[dict[str, Any]], output_folder: Path) -> str:
    ffmpeg = shutil.which("ffmpeg")
    if not ffmpeg:
        return ""
    thumbnail_folder = output_folder / "master-thumbnails"
    thumbnail_folder.mkdir(exist_ok=True)
    for old_thumbnail in thumbnail_folder.glob("*.jpg"):
        old_thumbnail.unlink()
    copied_count = 0
    for clip in clips:
        source_path = Path(str(clip.get("thumbnailPath") or ""))
        if not source_path.exists():
            continue
        rank = int(clip.get("rank") or copied_count + 1)
        destination = thumbnail_folder / f"{rank:02d}-{slugify(str(clip.get('title') or 'clip'))[:48]}.jpg"
        shutil.copy2(source_path, destination)
        copied_count += 1
    if copied_count == 0:
        return ""
    contact_sheet_path = output_folder / "episode1-social-master-contact-sheet.jpg"
    result = subprocess.run(
        [
            ffmpeg,
            "-y",
            "-v",
            "error",
            "-pattern_type",
            "glob",
            "-i",
            str(thumbnail_folder / "*.jpg"),
            "-vf",
            "scale=216:384:force_original_aspect_ratio=decrease,"
            "pad=216:384:(ow-iw)/2:(oh-ih)/2,tile=4x8:padding=12:margin=16",
            "-frames:v",
            "1",
            str(contact_sheet_path),
        ],
        text=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        check=False,
    )
    if result.returncode != 0 or not contact_sheet_path.exists():
        return ""
    return str(contact_sheet_path)


def write_master_queue(paths: list[Path], output_folder: Path, episode_title: str) -> dict[str, Any]:
    output_folder.mkdir(parents=True, exist_ok=True)
    clips = collect_clips(paths)
    manifest = {
        "model": "quipsly-social-master-queue",
        "version": "2026-06-17.social-master-queue.v1",
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "episode": episode_title,
        "totalClipCount": len(clips),
        "sourceManifests": [str(path) for path in paths],
        "sourcePolicy": "All rows point at derivative social artifacts; original media and edit decisions are not modified.",
        "postingTruth": "Ready for human review/upload. Nothing here was uploaded or scheduled automatically.",
        "clips": clips,
    }
    manifest["contactSheetPath"] = write_contact_sheet(clips, output_folder)

    json_path = output_folder / "social-master-queue.json"
    json_path.write_text(json.dumps(manifest, indent=2) + "\n")

    csv_path = output_folder / "social-master-queue.csv"
    fieldnames = [
        "rank",
        "queueIndex",
        "sourcePack",
        "reviewStatus",
        "title",
        "duration",
        "sourceSequenceStartSeconds",
        "sourceSequenceEndSeconds",
        "clipPath",
        "thumbnailPath",
        "captionSrtPath",
        "platformCopyPath",
        "youtubeShortsReceiptId",
        "instagramReceiptId",
        "facebookReceiptId",
        "linkedinReceiptId",
        "hook",
        "humanCheck",
    ]
    with csv_path.open("w", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=fieldnames)
        writer.writeheader()
        for clip in clips:
            receipt_ids = clip.get("platformReceiptIds") or {}
            row = {field: clip.get(field, "") for field in fieldnames}
            row["youtubeShortsReceiptId"] = receipt_ids.get("YouTube Shorts", "")
            row["instagramReceiptId"] = receipt_ids.get("Instagram", "")
            row["facebookReceiptId"] = receipt_ids.get("Facebook", "")
            row["linkedinReceiptId"] = receipt_ids.get("LinkedIn", "")
            writer.writerow(row)

    markdown_path = output_folder / "SOCIAL-MASTER-QUEUE.md"
    lines = [
        f"# {episode_title} Social Master Queue",
        "",
        "One review queue for release-candidate shorts and any expansion packs.",
        "",
        "## Counts",
        f"- Total clips: {len(clips)}",
    ]
    by_pack: dict[str, int] = {}
    for clip in clips:
        by_pack[str(clip["sourcePack"])] = by_pack.get(str(clip["sourcePack"]), 0) + 1
    lines.extend(f"- {name}: {count}" for name, count in sorted(by_pack.items()))
    lines.extend(["", "## Recommended posting order", ""])
    for clip in clips:
        duration = float(clip.get("duration") or 0)
        lines.extend(
            [
                f"{clip['rank']}. {clip['title']} ({duration:.1f}s) - {clip['reviewStatus']}",
                f"   - Source pack: {clip['sourcePack']}",
                f"   - Hook: {clip['hook']}",
                f"   - File: `{Path(str(clip['clipPath'])).name}`",
                f"   - Copy: `{clip['platformCopyPath']}`",
                f"   - Receipts: {len(clip.get('platformReceiptIds') or {})} platform receipt id(s)",
                f"   - Check: {clip['humanCheck']}",
            ]
        )
    markdown_path.write_text("\n".join(lines) + "\n")

    return {
        "status": "ready-for-human-review",
        "clipCount": len(clips),
        "outputFolder": str(output_folder),
        "markdownPath": str(markdown_path),
        "jsonPath": str(json_path),
        "csvPath": str(csv_path),
        "sourceManifestCount": len(paths),
    }


def main() -> int:
    parser = argparse.ArgumentParser(description="Build one social master queue from social queue manifests.")
    parser.add_argument("--episode-title", default="Episode 1 - The Wednesday Rule")
    parser.add_argument("--output", required=True, type=Path)
    parser.add_argument("manifests", nargs="+", type=Path)
    args = parser.parse_args()

    try:
        result = write_master_queue(
            [path.expanduser().resolve() for path in args.manifests],
            args.output.expanduser().resolve(),
            args.episode_title,
        )
    except Exception as error:  # noqa: BLE001 - operator command should report calm JSON.
        print(json.dumps({"status": "error", "error": str(error)}, indent=2))
        return 1
    print(json.dumps(result, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
