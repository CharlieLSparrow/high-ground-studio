#!/usr/bin/env python3
"""Cut a reviewable 9:16 social expansion pack from an episode master.

This command is intentionally derivative-only. It does not inspect or mutate
Quipsly source lanes, edit decisions, Premiere packets, or raw camera files.
Given a rendered 9:16 master and a candidate list, it cuts publish-review MP4s,
caption sidecars, thumbnails, platform copy, CSV/JSON indexes, and an optional
ZIP archive.

Use this for fast social harvesting after the episode/shorts pipeline has
already produced a safe vertical master.
"""
from __future__ import annotations

import argparse
import csv
import json
import re
import shutil
import subprocess
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


DEFAULT_PLATFORMS = ["YouTube Shorts", "Instagram Reels", "Facebook Reels"]
COMMON_HASHTAGS = ["#HighGroundOdyssey", "#TheWednesdayRule", "#Podcast"]


@dataclass(frozen=True)
class Candidate:
    rank: int
    start: float
    duration: float
    title: str
    hook: str
    transcript: str
    overlay: str = ""
    tags: list[str] = field(default_factory=list)
    platforms: list[str] = field(default_factory=lambda: list(DEFAULT_PLATFORMS))


def run(command: list[str], *, timeout: float | None = None) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        command,
        text=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        timeout=timeout,
        check=False,
    )


def require_tool(name: str) -> str:
    path = shutil.which(name)
    if not path:
        raise RuntimeError(f"{name} was not found on PATH.")
    return path


def slugify(value: str) -> str:
    value = value.lower().replace("'", "")
    value = re.sub(r"[^a-z0-9]+", "-", value).strip("-")
    return value or "clip"


def unique(values: list[str]) -> list[str]:
    seen: set[str] = set()
    result: list[str] = []
    for value in values:
        if value and value not in seen:
            seen.add(value)
            result.append(value)
    return result


def srt_time(seconds: float) -> str:
    milliseconds = int(round(seconds * 1000))
    hours, remainder = divmod(milliseconds, 3_600_000)
    minutes, remainder = divmod(remainder, 60_000)
    seconds_int, milliseconds = divmod(remainder, 1000)
    return f"{hours:02}:{minutes:02}:{seconds_int:02},{milliseconds:03}"


def load_candidates(path: Path, start_rank: int | None) -> list[Candidate]:
    raw = json.loads(path.read_text())
    if isinstance(raw, dict):
        rows = raw.get("candidates") or raw.get("clips") or raw
    else:
        rows = raw
    if not isinstance(rows, list):
        raise ValueError("Candidate JSON must be a list or an object with a candidates/clips list.")

    candidates: list[Candidate] = []
    for index, row in enumerate(rows, start=1):
        if not isinstance(row, dict):
            raise ValueError(f"Candidate {index} is not an object.")
        title = str(row.get("title") or "").strip()
        if not title:
            raise ValueError(f"Candidate {index} is missing title.")
        start = float(row.get("start", row.get("sourceSequenceStartSeconds", 0)))
        duration_value = row.get("duration")
        if duration_value is None and row.get("sourceSequenceEndSeconds") is not None:
            duration_value = float(row.get("sourceSequenceEndSeconds")) - start
        duration = float(duration_value or 0)
        if start < 0 or duration <= 0:
            raise ValueError(f"Candidate {index} has invalid start/duration.")
        rank_value = row.get("rank")
        rank = int(rank_value) if rank_value is not None else ((start_rank or 1) + len(candidates))
        hook = str(row.get("hook") or title).strip()
        transcript = str(row.get("transcript") or row.get("roughTranscript") or hook).strip()
        overlay = str(row.get("overlay") or row.get("suggestedOverlay") or "").strip()
        tags = [str(item) for item in row.get("tags", row.get("hashtags", [])) if str(item).strip()]
        platforms = [str(item) for item in row.get("platforms", DEFAULT_PLATFORMS) if str(item).strip()]
        candidates.append(
            Candidate(
                rank=rank,
                start=start,
                duration=duration,
                title=title,
                hook=hook,
                transcript=transcript,
                overlay=overlay,
                tags=tags,
                platforms=platforms or list(DEFAULT_PLATFORMS),
            )
        )
    candidates.sort(key=lambda item: (item.rank, item.start, item.title))
    return candidates


def probe_media(ffprobe: str, path: Path) -> dict[str, Any]:
    result = run(
        [
            ffprobe,
            "-v",
            "error",
            "-show_entries",
            "format=duration,size",
            "-show_entries",
            "stream=codec_type,width,height,codec_name",
            "-of",
            "json",
            str(path),
        ],
        timeout=30,
    )
    if result.returncode != 0:
        return {"error": (result.stderr or result.stdout).strip()}
    try:
        return json.loads(result.stdout)
    except json.JSONDecodeError as error:
        return {"error": f"Could not parse ffprobe JSON: {error}"}


def video_dimensions(probe: dict[str, Any]) -> tuple[int | None, int | None]:
    for stream in probe.get("streams") or []:
        if stream.get("codec_type") == "video":
            return stream.get("width"), stream.get("height")
    return None, None


def platform_caption(candidate: Candidate, platform: str, episode_label: str) -> str:
    tags = " ".join(unique(COMMON_HASHTAGS + candidate.tags))
    if platform == "YouTube Shorts":
        return f"{candidate.hook}\n\nFrom {episode_label}.\n\n{tags} #Shorts"
    if platform == "Instagram Reels":
        return f"{candidate.hook}\n\nA moment from {episode_label}.\n\n{tags} #Reels"
    if platform == "Facebook Reels":
        return f"{candidate.hook}\n\nFrom {episode_label}. What does this bring up for you?\n\n{tags}"
    if platform == "LinkedIn":
        return (
            f"{candidate.hook}\n\nA short reflection from {episode_label}. "
            "Useful for anyone thinking about leadership, story, identity, and creative work.\n\n"
            f"{tags}"
        )
    return f"{candidate.hook}\n\n{tags}"


def cut_clip(ffmpeg: str, source_master: Path, candidate: Candidate, destination: Path) -> None:
    # Clean derivative cut. No burned-in text here; platform safe zones and caption
    # styles should be chosen deliberately by the editor/publisher.
    command = [
        ffmpeg,
        "-y",
        "-hide_banner",
        "-nostdin",
        "-loglevel",
        "error",
        "-ss",
        f"{candidate.start:.6f}",
        "-t",
        f"{candidate.duration:.6f}",
        "-i",
        str(source_master),
        "-map",
        "0:v:0",
        "-map",
        "0:a:0",
        "-vf",
        "scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,setsar=1",
        "-c:v",
        "libx264",
        "-preset",
        "veryfast",
        "-crf",
        "23",
        "-c:a",
        "aac",
        "-b:a",
        "160k",
        "-movflags",
        "+faststart",
        str(destination),
    ]
    result = run(command, timeout=max(90, candidate.duration * 6))
    if result.returncode != 0:
        raise RuntimeError(f"ffmpeg failed for {candidate.title}: {(result.stderr or result.stdout).strip()}")


def write_thumbnail(ffmpeg: str, clip_path: Path, thumbnail_path: Path) -> bool:
    result = run(
        [
            ffmpeg,
            "-y",
            "-v",
            "error",
            "-ss",
            "2",
            "-i",
            str(clip_path),
            "-frames:v",
            "1",
            "-q:v",
            "2",
            str(thumbnail_path),
        ],
        timeout=30,
    )
    return result.returncode == 0 and thumbnail_path.exists()


def write_contact_sheet(ffmpeg: str, thumbnails_dir: Path, output_path: Path) -> bool:
    if not list(thumbnails_dir.glob("*.jpg")):
        return False
    result = run(
        [
            ffmpeg,
            "-y",
            "-v",
            "error",
            "-pattern_type",
            "glob",
            "-i",
            str(thumbnails_dir / "*.jpg"),
            "-vf",
            "scale=270:480:force_original_aspect_ratio=decrease,"
            "pad=270:480:(ow-iw)/2:(oh-ih)/2,tile=3x3:padding=14:margin=18",
            "-frames:v",
            "1",
            str(output_path),
        ],
        timeout=60,
    )
    return result.returncode == 0 and output_path.exists()


def write_pack(
    source_master: Path,
    candidate_path: Path,
    output_folder: Path,
    episode_title: str,
    episode_label: str,
    make_zip: bool,
) -> dict[str, Any]:
    ffmpeg = require_tool("ffmpeg")
    ffprobe = require_tool("ffprobe")
    if not source_master.exists():
        raise FileNotFoundError(f"Source 9:16 master does not exist: {source_master}")

    source_probe = probe_media(ffprobe, source_master)
    source_width, source_height = video_dimensions(source_probe)
    if source_width is None or source_height is None:
        raise RuntimeError(f"Source master has no video stream: {source_master}")

    candidates = load_candidates(candidate_path, start_rank=None)
    clips_dir = output_folder / "clips"
    captions_dir = output_folder / "captions"
    thumbnails_dir = output_folder / "thumbnails"
    platform_dir = output_folder / "platform-copy"
    for folder in (clips_dir, captions_dir, thumbnails_dir, platform_dir):
        folder.mkdir(parents=True, exist_ok=True)

    manifest: dict[str, Any] = {
        "model": "quipsly-social-expansion-pack",
        "version": "2026-06-17.social-expansion-pack.v1",
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "episode": episode_title,
        "sourceMaster": str(source_master),
        "sourceCandidateJson": str(candidate_path),
        "sourceProbe": source_probe,
        "sourcePolicy": (
            "Derivative 9:16 candidates cut from an already-rendered master. "
            "Original source media and Quipsly edit decisions are not modified."
        ),
        "reviewTruth": "Ready for human review/upload; quote-check scout transcripts before posting.",
        "clips": [],
    }
    rows: list[dict[str, str]] = []

    for candidate in candidates:
        slug = slugify(candidate.title)
        clip_path = clips_dir / f"{candidate.rank:02d}-{slug}-9x16.mp4"
        thumbnail_path = thumbnails_dir / f"{candidate.rank:02d}-{slug}.jpg"
        srt_path = captions_dir / f"{candidate.rank:02d}-{slug}.srt"
        copy_path = platform_dir / f"{candidate.rank:02d}-{slug}-copy.md"

        cut_clip(ffmpeg, source_master, candidate, clip_path)
        thumbnail_ready = write_thumbnail(ffmpeg, clip_path, thumbnail_path)
        clip_probe = probe_media(ffprobe, clip_path)

        srt_path.write_text(
            f"1\n00:00:00,000 --> {srt_time(candidate.duration)}\n{candidate.transcript}\n"
        )
        platform_copy = {
            platform: platform_caption(candidate, platform, episode_label)
            for platform in candidate.platforms
        }
        copy_path.write_text(
            "\n\n".join(
                [
                    f"# {candidate.title}",
                    "Status: expansion candidate - human quote check recommended",
                    f"Hook: {candidate.hook}",
                    f"Suggested on-video text: {candidate.overlay or candidate.title}",
                    f"Source time: {candidate.start:.2f}s to {candidate.start + candidate.duration:.2f}s",
                    f"Rough transcript: {candidate.transcript}",
                    *[f"## {platform}\n{caption}" for platform, caption in platform_copy.items()],
                ]
            )
            + "\n"
        )

        clip = {
            "rank": candidate.rank,
            "title": candidate.title,
            "hook": candidate.hook,
            "suggestedOverlay": candidate.overlay,
            "roughTranscript": candidate.transcript,
            "sourceSequenceStartSeconds": candidate.start,
            "sourceSequenceEndSeconds": candidate.start + candidate.duration,
            "duration": candidate.duration,
            "clipPath": str(clip_path),
            "thumbnailPath": str(thumbnail_path) if thumbnail_ready else "",
            "captionSrtPath": str(srt_path),
            "platformCopyPath": str(copy_path),
            "platformCopy": platform_copy,
            "hashtags": unique(COMMON_HASHTAGS + candidate.tags),
            "probe": clip_probe,
            "manualReviewChecklist": [
                "Watch the exported short end to end.",
                "Quote-check the transcript/caption before posting.",
                "Confirm platform safe zones before adding burned-in captions.",
                "Upload manually until direct platform publishing is wired.",
                "Record the published URL back into Quipsly after posting.",
            ],
        }
        manifest["clips"].append(clip)
        rows.append(
            {
                "rank": str(candidate.rank),
                "title": candidate.title,
                "duration_seconds": f"{candidate.duration:.3f}",
                "source_start_seconds": f"{candidate.start:.3f}",
                "source_end_seconds": f"{candidate.start + candidate.duration:.3f}",
                "clip_path": str(clip_path),
                "thumbnail_path": str(thumbnail_path) if thumbnail_ready else "",
                "caption_srt_path": str(srt_path),
                "platform_copy_path": str(copy_path),
                "hook": candidate.hook,
            }
        )

    manifest_path = output_folder / "social-expansion-pack.json"
    manifest_path.write_text(json.dumps(manifest, indent=2) + "\n")
    csv_path = output_folder / "social-expansion-pack.csv"
    with csv_path.open("w", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=list(rows[0].keys()))
        writer.writeheader()
        writer.writerows(rows)

    readme_path = output_folder / "README.md"
    readme_path.write_text(
        "\n".join(
            [
                f"# {episode_title} Social Expansion Pack",
                "",
                "Additional 9:16 social candidates cut from the rendered vertical master.",
                "Original source media and Quipsly edit decisions were not touched.",
                "",
                "## Posting order",
                *[
                    f"{row['rank']}. {row['title']} ({row['duration_seconds']}s) - `{Path(row['clip_path']).name}`"
                    for row in rows
                ],
                "",
                "## Human check",
                "Watch each candidate before posting. Captions/transcripts are scout text and should be quote-checked.",
            ]
        )
        + "\n"
    )

    contact_sheet_path = output_folder / "social-expansion-contact-sheet.jpg"
    contact_sheet_ready = write_contact_sheet(ffmpeg, thumbnails_dir, contact_sheet_path)
    archive_path = ""
    if make_zip:
        archive_path = shutil.make_archive(str(output_folder), "zip", root_dir=output_folder.parent, base_dir=output_folder.name)

    return {
        "status": "ready-for-human-review",
        "clipCount": len(manifest["clips"]),
        "outputFolder": str(output_folder),
        "manifestPath": str(manifest_path),
        "csvPath": str(csv_path),
        "readmePath": str(readme_path),
        "contactSheetPath": str(contact_sheet_path) if contact_sheet_ready else "",
        "archivePath": archive_path,
        "sourcePolicy": manifest["sourcePolicy"],
        "reviewTruth": manifest["reviewTruth"],
    }


def main() -> int:
    parser = argparse.ArgumentParser(description="Build a derivative 9:16 social expansion pack.")
    parser.add_argument("--source-master", required=True, type=Path, help="Rendered 9:16 episode master MP4.")
    parser.add_argument("--candidates", required=True, type=Path, help="JSON list of social candidate ranges.")
    parser.add_argument("--output", required=True, type=Path, help="Output folder for clips/copy/indexes.")
    parser.add_argument("--episode-title", default="Episode 1 - The Wednesday Rule")
    parser.add_argument("--episode-label", default="High Ground Odyssey Episode 1: The Wednesday Rule")
    parser.add_argument("--zip", action="store_true", help="Create a ZIP archive beside the output folder.")
    args = parser.parse_args()

    try:
        result = write_pack(
            args.source_master.expanduser().resolve(),
            args.candidates.expanduser().resolve(),
            args.output.expanduser().resolve(),
            args.episode_title,
            args.episode_label,
            args.zip,
        )
    except Exception as error:  # noqa: BLE001 - operator command should report calm JSON.
        print(json.dumps({"status": "error", "error": str(error)}, indent=2))
        return 1
    print(json.dumps(result, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
