#!/usr/bin/env python3
"""Build a manual social publication queue from a QuipslyStudio release folder.

This is intentionally a handoff generator, not a publisher. It reads exported
9:16 short artifacts and the publish ledger, then writes a human/Codex-friendly
queue with copied MP4s, platform copy drafts, caption sidecars, thumbnails, CSV,
JSON, and an optional ZIP archive.

The model stays aligned with Quipsly's editor architecture:

- source media remains untouched;
- shorts are derivative artifacts over whole synced source lanes;
- manual upload is ready only after human review;
- direct platform publishing still requires authenticated connector receipts.
"""
from __future__ import annotations

import argparse
import csv
import json
import re
import shutil
import subprocess
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

PLATFORMS = ["YouTube Shorts", "Instagram", "Facebook", "LinkedIn"]
COMMON_HASHTAGS = ["#HighGroundOdyssey", "#TheWednesdayRule", "#Podcast", "#Storytelling"]
TITLE_HASHTAGS: dict[str, list[str]] = {
    "Farm Work Teaches Stewardship": ["#Mentorship", "#Leadership", "#WorkEthic"],
    "Learning Why, Not Just What": ["#Mentorship", "#Learning", "#Leadership"],
    "Mutual Mentorship": ["#Mentorship", "#Brotherhood", "#Leadership"],
    "Record From Anywhere": ["#Podcasting", "#CreativeWorkflow", "#RemoteWork"],
    "Parkinson's Awareness Goal": ["#ParkinsonsAwareness", "#PurposeDriven", "#Podcast"],
    "Don't Downplay Yourself": ["#Confidence", "#Encouragement", "#Leadership"],
    "Identity Changes Behavior": ["#Identity", "#Habits", "#BehaviorChange"],
    "Write Things Worth Reading": ["#Writing", "#Legacy", "#CreativeLife"],
    "Test Short - Wednesday Rule moment": ["#WednesdayRule", "#CreativeProcess"],
}
DEFAULT_PRIORITY: dict[str, int] = {
    "Learning Why, Not Just What": 1,
    "Identity Changes Behavior": 2,
    "Write Things Worth Reading": 3,
    "Don't Downplay Yourself": 4,
    "Farm Work Teaches Stewardship": 5,
    "Mutual Mentorship": 6,
    "Parkinson's Awareness Goal": 7,
    "Record From Anywhere": 8,
    "Test Short - Wednesday Rule moment": 9,
}


@dataclass(frozen=True)
class ShortRecord:
    artifact_path: Path
    title: str
    description: str
    metadata: dict[str, Any]
    platforms: list[str]
    receipt_ids: list[str]
    platform_receipt_ids: dict[str, str]


def slugify(value: str) -> str:
    value = value.lower().replace("'", "")
    value = re.sub(r"[^a-z0-9]+", "-", value).strip("-")
    return value or "clip"


def unique_preserving_order(values: list[str]) -> list[str]:
    seen: set[str] = set()
    result: list[str] = []
    for value in values:
        if value not in seen:
            result.append(value)
            seen.add(value)
    return result


def load_json(path: Path) -> dict[str, Any]:
    return json.loads(path.read_text())


def parse_metadata(raw: str | None) -> dict[str, Any]:
    if not raw:
        return {}
    try:
        value = json.loads(raw)
        return value if isinstance(value, dict) else {}
    except json.JSONDecodeError:
        return {}


def find_publish_ledger(release_folder: Path) -> Path:
    matches = sorted(release_folder.glob("*-publish-packet/*-publish-ledger.json"))
    if not matches:
        raise FileNotFoundError(f"No publish ledger found under {release_folder}")
    return matches[0]


def collect_short_records(release_folder: Path, ledger_path: Path) -> list[ShortRecord]:
    ledger = load_json(ledger_path)
    grouped: dict[Path, dict[str, Any]] = {}
    for record in ledger.get("records", []):
        artifact_path = Path(str(record.get("artifactPath") or ""))
        if not artifact_path.is_absolute():
            continue
        if release_folder not in artifact_path.parents:
            continue
        if not artifact_path.name.endswith("-9x16-short.mp4"):
            continue
        metadata = parse_metadata(record.get("metadataJson"))
        entry = grouped.setdefault(
            artifact_path,
            {
                "title": record.get("title") or metadata.get("title") or artifact_path.stem,
                "description": record.get("description") or metadata.get("description") or "",
                "metadata": metadata,
                "platforms": set(),
                "receiptIds": set(),
                "platformReceiptIds": {},
            },
        )
        platform = record.get("platform")
        if platform:
            entry["platforms"].add(platform)
        receipt_id = record.get("id")
        if receipt_id:
            entry["receiptIds"].add(str(receipt_id))
            if platform:
                entry["platformReceiptIds"][str(platform)] = str(receipt_id)
        if not entry["metadata"] and metadata:
            entry["metadata"] = metadata
    records = [
        ShortRecord(
            artifact_path=path,
            title=str(entry["title"]),
            description=str(entry["description"]),
            metadata=entry["metadata"],
            platforms=sorted(entry["platforms"] or PLATFORMS),
            receipt_ids=sorted(entry["receiptIds"]),
            platform_receipt_ids=dict(sorted(entry["platformReceiptIds"].items())),
        )
        for path, entry in grouped.items()
        if path.exists()
    ]
    records.sort(key=lambda item: (float(item.metadata.get("sequenceStartTime") or 999999), item.title))
    return records


def ffprobe_duration(path: Path) -> float | None:
    from quipsly_media_tools import resolve_media_tool

    ffprobe = resolve_media_tool("ffprobe", required=False)
    if not ffprobe:
        return None
    try:
        completed = subprocess.run(
            [
                ffprobe,
                "-v",
                "error",
                "-show_entries",
                "format=duration",
                "-of",
                "default=noprint_wrappers=1:nokey=1",
                str(path),
            ],
            capture_output=True,
            check=True,
            text=True,
        )
        return float(completed.stdout.strip())
    except Exception:  # noqa: BLE001 - queue generation should keep going calmly.
        return None


def write_thumbnail(source: Path, destination: Path, duration: float | None) -> bool:
    from quipsly_media_tools import resolve_media_tool

    ffmpeg = resolve_media_tool("ffmpeg", required=False)
    if not ffmpeg:
        return False
    midpoint = max(0.5, min((duration or 2) / 2, 3.0))
    try:
        subprocess.run(
            [
                ffmpeg,
                "-y",
                "-v",
                "error",
                "-ss",
                str(midpoint),
                "-i",
                str(source),
                "-frames:v",
                "1",
                "-q:v",
                "2",
                str(destination),
            ],
            check=True,
        )
        return destination.exists()
    except Exception:  # noqa: BLE001 - thumbnail is useful, not queue-blocking.
        return False


def write_contact_sheet(thumbnails_dir: Path, output_path: Path) -> bool:
    from quipsly_media_tools import resolve_media_tool

    ffmpeg = resolve_media_tool("ffmpeg", required=False)
    if not ffmpeg:
        return False
    thumbnails = sorted(thumbnails_dir.glob("*.jpg"))
    if not thumbnails:
        return False
    pattern = str(thumbnails_dir / "*.jpg")
    try:
        subprocess.run(
            [
                ffmpeg,
                "-y",
                "-v",
                "error",
                "-pattern_type",
                "glob",
                "-i",
                pattern,
                "-vf",
                "scale=270:480:force_original_aspect_ratio=decrease,"
                "pad=270:480:(ow-iw)/2:(oh-ih)/2,tile=3x3:padding=14:margin=18",
                "-frames:v",
                "1",
                str(output_path),
            ],
            check=True,
        )
        return output_path.exists()
    except Exception:  # noqa: BLE001 - contact sheet is useful, not queue-blocking.
        return False


def seconds_to_srt(value: float) -> str:
    milliseconds = int(round(value * 1000))
    hours, remainder = divmod(milliseconds, 3_600_000)
    minutes, remainder = divmod(remainder, 60_000)
    seconds, milliseconds = divmod(remainder, 1000)
    return f"{hours:02}:{minutes:02}:{seconds:02},{milliseconds:03}"


def platform_caption(title: str, hook: str, platform: str, caption_episode_label: str) -> str:
    tags = " ".join(unique_preserving_order(COMMON_HASHTAGS + TITLE_HASHTAGS.get(title, [])))
    if platform == "YouTube Shorts":
        return f"{hook}\n\nFrom {caption_episode_label}.\n\n{tags} #Shorts"
    if platform == "Instagram":
        return f"{hook}\n\nA moment from {caption_episode_label}.\n\n{tags} #Reels"
    if platform == "Facebook":
        return (
            f"{hook}\n\n"
            f"From {caption_episode_label}. "
            f"What does this bring up for you?\n\n{tags}"
        )
    if platform == "LinkedIn":
        return (
            f"{hook}\n\n"
            f"A short reflection from {caption_episode_label}. "
            "Useful for anyone thinking about mentorship, purpose, identity, and the work of becoming.\n\n"
            f"{tags}"
        )
    return f"{hook}\n\n{tags}"


def review_status(priority: int) -> str:
    if priority <= 4:
        return "top-pick"
    if priority <= 8:
        return "good-candidate"
    return "test-only-review-last"


def write_queue(
    release_folder: Path,
    output_folder: Path,
    make_zip: bool,
    episode_title: str,
    caption_episode_label: str,
) -> dict[str, Any]:
    ledger_path = find_publish_ledger(release_folder)
    records = collect_short_records(release_folder, ledger_path)
    if not records:
        raise RuntimeError(f"No exported 9:16 short records found in {ledger_path}")

    clips_dir = output_folder / "clips"
    captions_dir = output_folder / "captions"
    thumbnails_dir = output_folder / "thumbnails"
    platform_dir = output_folder / "platform-copy"
    for folder in (clips_dir, captions_dir, thumbnails_dir, platform_dir):
        folder.mkdir(parents=True, exist_ok=True)

    manifest: dict[str, Any] = {
        "model": "quipsly-social-publication-queue",
        "version": "2026-06-17.social-publication-queue.v1",
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "episode": episode_title,
        "sourceReleaseFolder": str(release_folder),
        "sourcePublishLedger": str(ledger_path),
        "queueFolder": str(output_folder),
        "publishingTruth": "Manual-upload-ready queue. Nothing here has been uploaded or scheduled by this script.",
        "sourcePolicy": "Uses rendered 9:16 derivative shorts only. Original source media is untouched.",
        "platforms": PLATFORMS,
        "manualUploadStatus": "ready-for-human-review-and-upload",
        "clips": [],
    }
    rows: list[dict[str, str]] = []

    for index, record in enumerate(records, start=1):
        metadata = record.metadata
        priority = DEFAULT_PRIORITY.get(record.title, index)
        slug = slugify(record.title)
        destination = clips_dir / f"{index:02d}-{slug}-9x16.mp4"
        shutil.copy2(record.artifact_path, destination)
        duration = ffprobe_duration(destination) or float(metadata.get("duration") or 0)
        hook = str(metadata.get("hookText") or record.title)
        rough_transcript = str(metadata.get("captionDraft") or record.description or "").replace("Rough transcript:", "").strip()
        source_start = metadata.get("sequenceStartTime")
        source_end = metadata.get("sequenceEndTime")
        platform_copy = {
            platform: platform_caption(record.title, hook, platform, caption_episode_label)
            for platform in PLATFORMS
        }
        srt_path = captions_dir / f"{index:02d}-{slug}.srt"
        srt_path.write_text(f"1\n00:00:00,000 --> {seconds_to_srt(max(duration, 1))}\n{rough_transcript or hook}\n")
        copy_path = platform_dir / f"{index:02d}-{slug}-copy.md"
        copy_path.write_text(
            "\n\n".join(
                [
                    f"# {record.title}",
                    f"Priority: {priority} ({review_status(priority)})",
                    f"Hook: {hook}",
                    f"Rough transcript: {rough_transcript or 'Needs transcript review.'}",
                    *[
                        "\n".join(
                            [
                                f"## {platform}",
                                platform_copy[platform],
                                "",
                                f"Receipt id: `{record.platform_receipt_ids.get(platform, 'missing')}`",
                                f"Receipt command: `script/agentctl.sh publish-receipt-update {record.platform_receipt_ids.get(platform, '<receipt-id>')} published <public-url> <provider-id> \"manual receipt\"`",
                            ]
                        )
                        for platform in PLATFORMS
                    ],
                ]
            )
            + "\n"
        )
        thumbnail_path = thumbnails_dir / f"{index:02d}-{slug}.jpg"
        thumbnail_ready = write_thumbnail(destination, thumbnail_path, duration)
        hashtags = unique_preserving_order(COMMON_HASHTAGS + TITLE_HASHTAGS.get(record.title, []))
        clip = {
            "rank": priority,
            "queueIndex": index,
            "reviewStatus": review_status(priority),
            "title": record.title,
            "hook": hook,
            "roughTranscript": rough_transcript,
            "duration": duration,
            "sourceSequenceStartSeconds": source_start,
            "sourceSequenceEndSeconds": source_end,
            "sourceShortClipId": metadata.get("shortClipId") or slug,
            "sourcePublishReceiptIds": record.receipt_ids,
            "platformReceiptIds": record.platform_receipt_ids,
            "clipPath": str(destination),
            "captionSrtPath": str(srt_path),
            "thumbnailPath": str(thumbnail_path) if thumbnail_ready else "",
            "platformCopyPath": str(copy_path),
            "platformCopy": platform_copy,
            "hashtags": hashtags,
            "manualReviewChecklist": [
                "Watch the exported short end to end.",
                "Confirm burned-in text/captions do not cover faces or platform UI safe zones.",
                "Confirm title/caption tone before posting.",
                "Upload manually until direct platform integrations are wired.",
                "Record published URL/receipt back into Quipsly after posting.",
            ],
            "receiptCaptureNote": "Capture the final platform URL back into Quipsly for the matching platform/lane receipt after upload.",
        }
        manifest["clips"].append(clip)
        rows.append(
            {
                "rank": str(priority),
                "queue_index": str(index),
                "status": review_status(priority),
                "title": record.title,
                "duration_seconds": f"{duration:.3f}",
                "source_start_seconds": f"{source_start:.3f}" if isinstance(source_start, (int, float)) else "",
                "source_end_seconds": f"{source_end:.3f}" if isinstance(source_end, (int, float)) else "",
                "clip_path": str(destination),
                "thumbnail_path": str(thumbnail_path) if thumbnail_ready else "",
                "caption_srt_path": str(srt_path),
                "receipt_capture_note": clip["receiptCaptureNote"],
                "youtube_shorts_receipt_id": record.platform_receipt_ids.get("YouTube Shorts", ""),
                "instagram_receipt_id": record.platform_receipt_ids.get("Instagram", ""),
                "facebook_receipt_id": record.platform_receipt_ids.get("Facebook", ""),
                "linkedin_receipt_id": record.platform_receipt_ids.get("LinkedIn", ""),
                "youtube_shorts_caption": platform_copy["YouTube Shorts"],
                "instagram_caption": platform_copy["Instagram"],
                "facebook_caption": platform_copy["Facebook"],
                "linkedin_caption": platform_copy["LinkedIn"],
            }
        )

    manifest["clips"].sort(key=lambda item: int(item["rank"]))
    csv_path = output_folder / "episode1-social-publication-queue.csv"
    with csv_path.open("w", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=list(rows[0].keys()))
        writer.writeheader()
        writer.writerows(sorted(rows, key=lambda row: int(row["rank"])))

    contact_sheet = output_folder / "episode1-social-publication-contact-sheet.jpg"
    manifest["contactSheetPath"] = str(contact_sheet) if write_contact_sheet(thumbnails_dir, contact_sheet) else ""
    archive_path = output_folder.with_suffix(".zip")
    manifest["archivePath"] = str(archive_path)
    manifest["archiveStatus"] = "not-requested"

    readme = output_folder / "README.md"
    write_readme(readme, manifest)
    manifest_path = output_folder / "episode1-social-publication-queue.json"
    manifest_path.write_text(json.dumps(manifest, indent=2) + "\n")

    if make_zip:
        if archive_path.exists():
            archive_path.unlink()
        shutil.make_archive(str(output_folder), "zip", root_dir=output_folder.parent, base_dir=output_folder.name)
        manifest["archiveStatus"] = "ready" if archive_path.exists() else "failed"
        manifest_path.write_text(json.dumps(manifest, indent=2) + "\n")

    return {
        "queueFolder": str(output_folder),
        "manifestPath": str(manifest_path),
        "csvPath": str(csv_path),
        "contactSheetPath": manifest.get("contactSheetPath", ""),
        "archivePath": str(archive_path) if archive_path.exists() else "",
        "clipCount": len(manifest["clips"]),
        "topPicks": [clip["title"] for clip in manifest["clips"] if clip["reviewStatus"] == "top-pick"],
        "status": "ready-for-human-review-and-upload",
    }


def write_readme(path: Path, manifest: dict[str, Any]) -> None:
    lines = [
        "# Episode 1 Social Publication Queue",
        "",
        "Generated from the Episode 1 release candidate using rendered 9:16 derivative shorts only.",
        "Original source media was not touched.",
        "",
        "## What is ready",
        f"- {len(manifest['clips'])} vertical shorts copied into `clips/`.",
        "- Platform copy drafts are in `platform-copy/`.",
        "- Single-cue caption sidecars are in `captions/` for review/upload support.",
        "- Thumbnail stills are in `thumbnails/`.",
        "- Machine-readable queue: `episode1-social-publication-queue.json`.",
        "- Spreadsheet-friendly queue: `episode1-social-publication-queue.csv`.",
        "",
        "## Recommended posting order",
    ]
    for clip in manifest["clips"]:
        duration = float(clip.get("duration") or 0)
        lines.extend(
            [
                f"{clip['rank']}. {clip['title']} ({duration:.1f}s) - {clip['reviewStatus']}",
                f"   - Hook: {clip['hook']}",
                f"   - File: `{Path(clip['clipPath']).name}`",
                f"   - Receipt: {clip['receiptCaptureNote']}",
            ]
        )
    lines.extend(
        [
            "",
            "## Human review rule",
            "These are publication-ready candidates, not auto-published posts. Watch each one once before upload, confirm safe zones/captions, then record the public URL back into Quipsly.",
            "",
            "## Platform note",
            "YouTube Shorts, Instagram Reels, Facebook Reels, and LinkedIn all use the same rendered 9:16 MP4 candidates here. Copy is tailored per platform in the markdown files.",
        ]
    )
    path.write_text("\n".join(lines) + "\n")


def default_output_folder(release_folder: Path) -> Path:
    return release_folder / "episode1-the-wednesday-rule-social-publication-queue"


def main() -> int:
    parser = argparse.ArgumentParser(description="Build a social publication queue from a QuipslyStudio release folder.")
    parser.add_argument("release_folder", type=Path, help="Release candidate folder containing short MP4s and publish packet")
    parser.add_argument("--output", type=Path, help="Output queue folder")
    parser.add_argument("--zip", action="store_true", help="Create a ZIP archive beside the queue folder")
    parser.add_argument("--episode-title", default="Episode 1 - The Wednesday Rule", help="Episode title for the queue manifest")
    parser.add_argument(
        "--caption-episode-label",
        default="High Ground Odyssey Episode 1: The Wednesday Rule",
        help="Human-facing episode label used in platform caption drafts",
    )
    args = parser.parse_args()

    release_folder = args.release_folder.expanduser().resolve()
    if not release_folder.exists() or not release_folder.is_dir():
        print(json.dumps({"status": "error", "error": f"Release folder not found: {release_folder}"}, indent=2))
        return 2
    output_folder = (args.output or default_output_folder(release_folder)).expanduser().resolve()
    output_folder.mkdir(parents=True, exist_ok=True)

    try:
        result = write_queue(
            release_folder,
            output_folder,
            args.zip,
            args.episode_title,
            args.caption_episode_label,
        )
    except Exception as exc:  # noqa: BLE001 - CLI should report calm diagnostics.
        print(json.dumps({"status": "error", "error": str(exc)}, indent=2))
        return 1
    print(json.dumps(result, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
