#!/usr/bin/env python3
"""Build a handoff-ready social publication packet from a Quipsly social queue."""
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


PLATFORMS = ["YouTube Shorts", "Instagram", "Facebook", "LinkedIn"]
PLATFORM_RECEIPT_FIELDS = {
    "YouTube Shorts": "youtubeShortsReceiptId",
    "Instagram": "instagramReceiptId",
    "Facebook": "facebookReceiptId",
    "LinkedIn": "linkedinReceiptId",
}


def load_json(path: Path) -> dict[str, Any]:
    payload = json.loads(path.read_text())
    if not isinstance(payload, dict):
        raise ValueError(f"{path} must contain a JSON object.")
    if not isinstance(payload.get("clips"), list):
        raise ValueError(f"{path} must contain a clips list.")
    return payload


def slugify(value: str) -> str:
    value = value.lower().replace("'", "")
    value = re.sub(r"[^a-z0-9]+", "-", value).strip("-")
    return value[:80] or "clip"


def safe_float(value: Any) -> float:
    try:
        return float(value or 0)
    except (TypeError, ValueError):
        return 0


def copy_if_present(source: Any, destination: Path) -> str:
    raw_source = str(source or "").strip()
    if not raw_source or raw_source == ".":
        return ""
    source_path = Path(raw_source)
    if not source_path.exists() or not source_path.is_file():
        return ""
    destination.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(source_path, destination)
    return str(destination)


def thumbnail_from_clip(clip_path: Path, destination: Path) -> str:
    ffmpeg = shutil.which("ffmpeg")
    if not ffmpeg or not clip_path.exists():
        return ""
    destination.parent.mkdir(parents=True, exist_ok=True)
    result = subprocess.run(
        [
            ffmpeg,
            "-hide_banner",
            "-loglevel",
            "error",
            "-y",
            "-ss",
            "1",
            "-i",
            str(clip_path),
            "-frames:v",
            "1",
            str(destination),
        ],
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
        check=False,
    )
    return str(destination) if result.returncode == 0 and destination.exists() else ""


def write_contact_sheet(thumbnail_paths: list[str], output_path: Path) -> str:
    ffmpeg = shutil.which("ffmpeg")
    if not ffmpeg or not thumbnail_paths:
        return ""
    list_path = output_path.with_suffix(".ffconcat.txt")
    quoted_paths = [path.replace("'", "'\\''") for path in thumbnail_paths]
    list_path.write_text(
        "\n".join(f"file '{path}'" for path in quoted_paths) + "\n",
        encoding="utf-8",
    )
    result = subprocess.run(
        [
            ffmpeg,
            "-hide_banner",
            "-loglevel",
            "error",
            "-y",
            "-f",
            "concat",
            "-safe",
            "0",
            "-i",
            str(list_path),
            "-vf",
            "scale=180:320:force_original_aspect_ratio=decrease,"
            "pad=180:320:(ow-iw)/2:(oh-ih)/2:color=0x111111,"
            "tile=8x4:padding=12:margin=18",
            "-frames:v",
            "1",
            str(output_path),
        ],
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
        check=False,
    )
    return str(output_path) if result.returncode == 0 and output_path.exists() else ""


def default_copy(title: str, hook: str) -> str:
    return (
        f"# {title}\n\n"
        f"{hook}\n\n"
        "Suggested platforms: YouTube Shorts, Instagram Reels, Facebook Reels, LinkedIn.\n\n"
        "#HighGroundOdyssey #TheWednesdayRule #Leadership #Writing #Podcast\n"
    )


def quote_for_shell(value: str) -> str:
    return "'" + value.replace("'", "'\\''") + "'"


def receipt_capture_command(rank: int, platform: str, receipt_id: str) -> str:
    if not receipt_id:
        return "No durable receipt id yet. Post only with an explicit manual note, or promote/regenerate receipts first."
    return (
        "script/agentctl.sh social-master-queue-receipt "
        f"{rank} "
        f"{quote_for_shell(platform)} "
        "published "
        "<public-url> "
        "<provider-id> "
        f"{quote_for_shell('manual receipt')}"
    )


def receipt_capture_commands(row: dict[str, Any]) -> dict[str, str]:
    rank = int(row["rank"])
    return {
        platform: receipt_capture_command(rank, platform, str(row.get(field) or ""))
        for platform, field in PLATFORM_RECEIPT_FIELDS.items()
    }


def primary_next_step(row: dict[str, Any]) -> str:
    if not row.get("clipPath"):
        return "Fix missing clip artifact before posting."
    if not row.get("platformCopyPath"):
        return "Add platform copy before posting."
    if any(str(row.get(field) or "") for field in PLATFORM_RECEIPT_FIELDS.values()):
        return "Watch once, post or schedule manually, then capture the platform URL with the receipt command."
    return "Watch once and decide whether to promote this candidate into durable publish receipts before posting."


def normalize_clip(clip: dict[str, Any], fallback_rank: int) -> dict[str, Any]:
    rank = int(clip.get("rank") or clip.get("queueIndex") or fallback_rank)
    title = str(clip.get("title") or Path(str(clip.get("clipPath") or "clip")).stem)
    platform_receipts = clip.get("platformReceiptIds") if isinstance(clip.get("platformReceiptIds"), dict) else {}
    return {
        "rank": rank,
        "title": title,
        "slug": slugify(title),
        "reviewStatus": str(clip.get("reviewStatus") or "ready-for-human-review"),
        "durationSeconds": safe_float(clip.get("duration") or clip.get("durationSeconds")),
        "hook": str(clip.get("hook") or title),
        "roughTranscript": str(clip.get("roughTranscript") or ""),
        "sourceSequenceStartSeconds": clip.get("sourceSequenceStartSeconds"),
        "sourceSequenceEndSeconds": clip.get("sourceSequenceEndSeconds"),
        "clipPath": str(clip.get("clipPath") or ""),
        "thumbnailPath": str(clip.get("thumbnailPath") or ""),
        "captionSrtPath": str(clip.get("captionSrtPath") or ""),
        "platformCopyPath": str(clip.get("platformCopyPath") or ""),
        "platforms": clip.get("platforms") if isinstance(clip.get("platforms"), list) else PLATFORMS,
        "humanCheck": str(clip.get("humanCheck") or "Watch once before posting."),
        "youtubeShortsReceiptId": str(platform_receipts.get("YouTube Shorts") or clip.get("youtubeShortsReceiptId") or ""),
        "instagramReceiptId": str(platform_receipts.get("Instagram") or clip.get("instagramReceiptId") or ""),
        "facebookReceiptId": str(platform_receipts.get("Facebook") or clip.get("facebookReceiptId") or ""),
        "linkedinReceiptId": str(platform_receipts.get("LinkedIn") or clip.get("linkedinReceiptId") or ""),
    }


def packet_rows(queue: dict[str, Any], output_folder: Path) -> tuple[list[dict[str, Any]], list[str]]:
    rows: list[dict[str, Any]] = []
    missing: list[str] = []
    for index, raw_clip in enumerate(queue["clips"], start=1):
        if not isinstance(raw_clip, dict):
            continue
        clip = normalize_clip(raw_clip, index)
        prefix = f"{clip['rank']:02d}-{clip['slug']}"
        clip_source = Path(clip["clipPath"])
        clip_destination = output_folder / "clips" / f"{prefix}-9x16.mp4"
        copied_clip = copy_if_present(clip_source, clip_destination)
        if not copied_clip:
            missing.append(str(clip_source))
            continue

        thumbnail_destination = output_folder / "thumbnails" / f"{prefix}.jpg"
        copied_thumbnail = copy_if_present(clip["thumbnailPath"], thumbnail_destination)
        if not copied_thumbnail:
            copied_thumbnail = thumbnail_from_clip(Path(copied_clip), thumbnail_destination)

        caption_destination = output_folder / "captions" / f"{prefix}.srt"
        copied_caption = copy_if_present(clip["captionSrtPath"], caption_destination)

        copy_destination = output_folder / "platform-copy" / f"{prefix}-copy.md"
        copied_copy = copy_if_present(clip["platformCopyPath"], copy_destination)
        if not copied_copy:
            copy_destination.parent.mkdir(parents=True, exist_ok=True)
            copy_destination.write_text(default_copy(clip["title"], clip["hook"]), encoding="utf-8")
            copied_copy = str(copy_destination)

        rows.append(
            {
                **clip,
                "clipPath": copied_clip,
                "thumbnailPath": copied_thumbnail,
                "captionSrtPath": copied_caption,
                "platformCopyPath": copied_copy,
                "platforms": ", ".join(clip["platforms"]),
            }
        )
    rows.sort(key=lambda row: int(row["rank"]))
    for row in rows:
        commands = receipt_capture_commands(row)
        row["readyToPost"] = bool(row.get("clipPath") and row.get("platformCopyPath"))
        row["operatorNextStep"] = primary_next_step(row)
        row["receiptCaptureCommands"] = commands
        row["youtubeShortsReceiptCaptureCommand"] = commands["YouTube Shorts"]
        row["instagramReceiptCaptureCommand"] = commands["Instagram"]
        row["facebookReceiptCaptureCommand"] = commands["Facebook"]
        row["linkedinReceiptCaptureCommand"] = commands["LinkedIn"]
    return rows, missing


def write_csv(path: Path, rows: list[dict[str, Any]]) -> None:
    if not rows:
        path.write_text("", encoding="utf-8")
        return
    with path.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=list(rows[0].keys()))
        writer.writeheader()
        writer.writerows(rows)


def write_readme(path: Path, episode: str, rows: list[dict[str, Any]], top_count: int) -> None:
    lines = [
        "# Social Clips Ready for Publication",
        "",
        f"Episode: **{episode}**",
        "",
        "## Posting truth",
        "",
        "- These are derivative 9:16 social clips, not raw originals.",
        "- Nothing has been uploaded or scheduled automatically.",
        "- Review once before posting; then capture platform receipts back into Quipsly.",
        "",
        "## Fast upload order",
        "",
        "| Rank | Clip | Duration | Why it works | File |",
        "|---:|---|---:|---|---|",
    ]
    for row in rows:
        hook = str(row["hook"]).replace("|", "-")[:140]
        lines.append(f"| {row['rank']} | {row['title']} | {row['durationSeconds']:.3f}s | {hook} | `{Path(row['clipPath']).name}` |")
    lines.extend(["", f"## Recommended first {min(top_count, len(rows))}", ""])
    for row in rows[:top_count]:
        lines.append(f"{row['rank']}. **{row['title']}** - {row['hook']}")
    lines.extend(["", "## Receipt capture after posting", ""])
    lines.append("After posting or scheduling a short, paste the public/scheduled URL into the matching receipt command. If a row says it has no durable receipt id yet, treat it as a scout candidate until it is promoted into the publish ledger.")
    lines.append("")
    for row in rows[:top_count]:
        lines.append(f"### {row['rank']}. {row['title']}")
        lines.append("")
        lines.append(f"Next step: {row['operatorNextStep']}")
        lines.append("")
        lines.append("```bash")
        lines.append(str(row["youtubeShortsReceiptCaptureCommand"]))
        lines.append(str(row["instagramReceiptCaptureCommand"]))
        lines.append(str(row["facebookReceiptCaptureCommand"]))
        lines.append(str(row["linkedinReceiptCaptureCommand"]))
        lines.append("```")
        lines.append("")
    lines.extend(
        [
            "",
            "## Folder map",
            "",
            "- `clips/` - upload-ready 9:16 MP4s.",
            "- `thumbnails/` - review thumbnails.",
            "- `captions/` - SRT caption sidecars where available.",
            "- `platform-copy/` - title/caption/copy notes for posting.",
        ]
    )
    path.write_text("\n".join(lines) + "\n", encoding="utf-8")


def copy_top_batch(rows: list[dict[str, Any]], output_folder: Path, top_count: int, basename: str) -> None:
    top_folder = output_folder / f"top-{top_count}-first-posting-batch"
    for subfolder in ["clips", "thumbnails", "captions", "platform-copy"]:
        (top_folder / subfolder).mkdir(parents=True, exist_ok=True)
    top_rows = rows[:top_count]
    for row in top_rows:
        for key, subfolder in [
            ("clipPath", "clips"),
            ("thumbnailPath", "thumbnails"),
            ("captionSrtPath", "captions"),
            ("platformCopyPath", "platform-copy"),
        ]:
            source = Path(str(row.get(key) or ""))
            if source.exists() and source.is_file():
                shutil.copy2(source, top_folder / subfolder / source.name)
    write_csv(top_folder / f"{basename}-top-{top_count}.csv", top_rows)
    write_readme(top_folder / f"README-TOP-{top_count}-FIRST-POSTING-BATCH.md", "Top posting batch", top_rows, top_count)


def zip_folder(folder: Path) -> str:
    archive_base = folder.with_suffix("")
    archive_path = shutil.make_archive(str(archive_base), "zip", root_dir=folder.parent, base_dir=folder.name)
    return archive_path


def prepare_output_folder(output_folder: Path, basename: str, top_count: int) -> None:
    output_folder.mkdir(parents=True, exist_ok=True)
    for managed_subfolder in [
        "clips",
        "thumbnails",
        "captions",
        "platform-copy",
        f"top-{top_count}-first-posting-batch",
    ]:
        path = output_folder / managed_subfolder
        if path.exists():
            shutil.rmtree(path)
    for managed_file in [
        output_folder / f"{basename}.json",
        output_folder / f"{basename}.csv",
        output_folder / f"README-{basename}.md",
        output_folder / f"{basename}-contact-sheet.jpg",
        output_folder / f"{basename}-contact-sheet.ffconcat.txt",
    ]:
        if managed_file.exists():
            managed_file.unlink()


def build_packet(queue_path: Path, output_folder: Path, basename: str, top_count: int, make_zip: bool) -> dict[str, Any]:
    queue = load_json(queue_path)
    prepare_output_folder(output_folder, basename, top_count)
    rows, missing = packet_rows(queue, output_folder)
    contact_sheet = write_contact_sheet(
        [str(row["thumbnailPath"]) for row in rows if row.get("thumbnailPath")],
        output_folder / f"{basename}-contact-sheet.jpg",
    )
    manifest = {
        "model": "quipsly-social-ready-publication-packet",
        "version": "2026-06-17.social-ready-publication-packet.v1",
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "episode": queue.get("episode") or queue.get("episodeTitle") or "Untitled episode",
        "sourceQueue": str(queue_path),
        "postingTruth": "Ready for human review/upload. Nothing was uploaded or scheduled automatically.",
        "clipCount": len(rows),
        "missingClipCount": len(missing),
        "missingClips": missing,
        "contactSheetPath": contact_sheet,
        "topBatchPath": str(output_folder / f"top-{top_count}-first-posting-batch"),
        "operatorWorkflow": [
            "Open the contact sheet and pick a clip.",
            "Watch the derivative MP4 once.",
            "Open the platform-copy file and adjust wording if needed.",
            "Upload or schedule manually to the target platform.",
            "Run the matching receiptCaptureCommand with the platform URL/provider id.",
        ],
        "clips": rows,
    }
    (output_folder / f"{basename}.json").write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
    write_csv(output_folder / f"{basename}.csv", rows)
    write_readme(output_folder / f"README-{basename}.md", str(manifest["episode"]), rows, top_count)
    copy_top_batch(rows, output_folder, top_count, basename)
    if make_zip:
        manifest["zipPath"] = zip_folder(output_folder)
        (output_folder / f"{basename}.json").write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
    return manifest


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("queue", type=Path, help="Path to social-master-queue.json or another queue JSON with a clips list.")
    parser.add_argument("--output", required=True, type=Path, help="Output folder for the ready-to-publish packet.")
    parser.add_argument("--basename", default="social-clips-ready", help="Base filename for JSON/CSV/README outputs.")
    parser.add_argument("--top-count", default=12, type=int, help="Number of clips to copy into the first-posting batch.")
    parser.add_argument("--zip", action="store_true", help="Also write a zip archive beside the output folder.")
    args = parser.parse_args()
    manifest = build_packet(args.queue, args.output, args.basename, max(1, args.top_count), args.zip)
    print(json.dumps({"output": str(args.output), "clipCount": manifest["clipCount"], "missingClipCount": manifest["missingClipCount"], "zipPath": manifest.get("zipPath", "")}, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
