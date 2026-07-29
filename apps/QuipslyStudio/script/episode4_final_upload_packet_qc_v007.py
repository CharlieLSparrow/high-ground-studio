#!/usr/bin/env python3
"""Final local upload packet QC for Episode 4 v007.

This is the "can Charlie upload tonight without spelunking?" verifier.

It checks only the ready-to-upload packet:
- recommended YouTube video
- recommended podcast audio
- upload-safe captions
- upload metadata/readme/handoff
- social shorts manifest and rendered clips
- QC truth that no external publication was performed by Codex

It also writes a START_HERE upload note and a Desktop launcher. It does not
upload, publish, schedule, mutate external accounts, or touch original media.
"""

from __future__ import annotations

import argparse
import json
import os
import stat
import subprocess
from dataclasses import asdict, dataclass, field
from pathlib import Path
from typing import Any


DEFAULT_READY_DIR = Path(
    "/Volumes/My Passport/Episode_and_Shorts_Test/"
    "Episode_4_Upload_Candidates/READY_TO_UPLOAD_EP4_20260712"
)
DEFAULT_DESKTOP_LAUNCHER = Path("/Users/wall-e/Desktop/EPISODE_4_UPLOAD_NOW.command")


@dataclass
class PacketCheck:
    id: str
    status: str
    detail: str
    path: str | None = None


@dataclass
class PacketReport:
    schema: str = "quipsly.episode4.final-upload-packet-qc.v1"
    status: str = "not-run"
    readyDir: str = ""
    checkCount: int = 0
    hardStopCount: int = 0
    warningCount: int = 0
    recommendedUpload: dict[str, str] = field(default_factory=dict)
    truth: dict[str, Any] = field(default_factory=dict)
    checks: list[PacketCheck] = field(default_factory=list)


def ffprobe_summary(path: Path) -> dict[str, Any]:
    result = subprocess.run(
        [
            "ffprobe",
            "-v",
            "error",
            "-show_entries",
            "format=duration,size,bit_rate",
            "-show_streams",
            "-of",
            "json",
            str(path),
        ],
        text=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        check=False,
    )
    if result.returncode != 0:
        return {"error": result.stderr.strip() or "ffprobe failed"}
    try:
        return json.loads(result.stdout)
    except json.JSONDecodeError as exc:
        return {"error": f"ffprobe JSON parse failed: {exc}"}


def add_file_check(checks: list[PacketCheck], check_id: str, path: Path) -> None:
    if path.exists() and path.stat().st_size > 0:
        checks.append(
            PacketCheck(
                id=check_id,
                status="passed",
                detail=f"exists, {path.stat().st_size} bytes",
                path=str(path),
            )
        )
    else:
        checks.append(
            PacketCheck(
                id=check_id,
                status="failed",
                detail="missing or empty",
                path=str(path),
            )
        )


def add_condition_check(
    checks: list[PacketCheck],
    check_id: str,
    passed: bool,
    detail: str,
    path: Path | None = None,
    *,
    warning: bool = False,
) -> None:
    if passed:
        status = "passed"
    elif warning:
        status = "warning"
    else:
        status = "failed"
    checks.append(
        PacketCheck(
            id=check_id,
            status=status,
            detail=detail,
            path=str(path) if path else None,
        )
    )


def build_report(ready_dir: Path) -> PacketReport:
    checks: list[PacketCheck] = []
    recommended = {
        "youtubeVideo": "High-Ground-Odyssey-Episode-04-main-59m26-video-v007.mp4",
        "podcastAudioM4A": "High-Ground-Odyssey-Episode-04-main-59m26-podcast-audio-v007.m4a",
        "podcastAudioMP3Fallback": "High-Ground-Odyssey-Episode-04-main-59m26-podcast-audio-v007.mp3",
        "youtubeCaptions": "captions-upload-safe-v007/High-Ground-Odyssey-Episode-04-main-59m26-transcript-upload-safe-v007.srt",
        "metadata": "UPLOAD_METADATA_EP04.md",
        "socialShortsStartHere": "episode-4-v007-social-shorts/START_HERE_EPISODE_4_V007_SHORTS.md",
    }

    required_files = {
        "youtube-video": recommended["youtubeVideo"],
        "podcast-audio-m4a": recommended["podcastAudioM4A"],
        "podcast-audio-mp3-fallback": recommended["podcastAudioMP3Fallback"],
        "youtube-captions-upload-safe": recommended["youtubeCaptions"],
        "metadata": recommended["metadata"],
        "upload-readme": "UPLOAD_README.md",
        "producer-handoff": "PRODUCER_HANDOFF_EP04_V007.md",
        "upload-qc-json": "episode-4-upload-qc-v007.json",
        "caption-qc-json": "episode-4-caption-upload-safe-qc-v007.json",
        "caption-qc-md": "EPISODE_4_UPLOAD_SAFE_CAPTIONS_V007.md",
        "shorts-start-here": recommended["socialShortsStartHere"],
        "shorts-manifest": "episode-4-v007-social-shorts/episode-4-v007-social-shorts-manifest.json",
    }
    for check_id, rel in required_files.items():
        add_file_check(checks, check_id, ready_dir / rel)

    video_probe = ffprobe_summary(ready_dir / recommended["youtubeVideo"])
    if "error" in video_probe:
        add_condition_check(checks, "youtube-video-ffprobe", False, video_probe["error"], ready_dir / recommended["youtubeVideo"])
    else:
        streams = video_probe.get("streams", [])
        v = next((s for s in streams if s.get("codec_type") == "video"), {})
        a = next((s for s in streams if s.get("codec_type") == "audio"), {})
        add_condition_check(
            checks,
            "youtube-video-contract",
            v.get("codec_name") == "h264"
            and v.get("width") == 1920
            and v.get("height") == 1080
            and a.get("codec_name") == "aac"
            and str(a.get("sample_rate")) == "48000",
            f"video={v.get('codec_name')} {v.get('width')}x{v.get('height')} audio={a.get('codec_name')} {a.get('sample_rate')}Hz duration={video_probe.get('format', {}).get('duration')}",
            ready_dir / recommended["youtubeVideo"],
        )

    audio_probe = ffprobe_summary(ready_dir / recommended["podcastAudioM4A"])
    if "error" in audio_probe:
        add_condition_check(checks, "podcast-audio-ffprobe", False, audio_probe["error"], ready_dir / recommended["podcastAudioM4A"])
    else:
        a = next((s for s in audio_probe.get("streams", []) if s.get("codec_type") == "audio"), {})
        add_condition_check(
            checks,
            "podcast-audio-contract",
            a.get("codec_name") == "aac"
            and str(a.get("sample_rate")) == "48000"
            and int(a.get("channels") or 0) >= 1,
            f"audio={a.get('codec_name')} {a.get('sample_rate')}Hz channels={a.get('channels')} duration={audio_probe.get('format', {}).get('duration')}",
            ready_dir / recommended["podcastAudioM4A"],
        )

    qc_path = ready_dir / "episode-4-upload-qc-v007.json"
    qc: dict[str, Any] = {}
    if qc_path.exists():
        qc = json.loads(qc_path.read_text())
        add_condition_check(
            checks,
            "qc-recommends-main",
            str(qc.get("producerRecommendation", "")).startswith("Upload main-59m26"),
            str(qc.get("producerRecommendation", "")),
            qc_path,
        )
        add_condition_check(
            checks,
            "qc-upload-safe-captions",
            qc.get("uploadSafeCaptions", {}).get("passed") is True
            and qc.get("uploadSafeCaptions", {}).get("hardStopCount") == 0
            and qc.get("uploadSafeCaptions", {}).get("warningCount") == 0,
            json.dumps(qc.get("uploadSafeCaptions", {}), sort_keys=True),
            qc_path,
        )
        add_condition_check(
            checks,
            "qc-social-shorts",
            qc.get("socialShorts", {}).get("allDecodeChecksPassed") is True
            and qc.get("socialShorts", {}).get("shortCount") == 6,
            json.dumps(qc.get("socialShorts", {}), sort_keys=True)[:800],
            qc_path,
        )
        add_condition_check(
            checks,
            "qc-no-external-publication",
            "not published" in json.dumps(qc).lower(),
            "QC truth indicates no external publication by Codex",
            qc_path,
        )

    shorts_manifest_path = ready_dir / "episode-4-v007-social-shorts" / "episode-4-v007-social-shorts-manifest.json"
    if shorts_manifest_path.exists():
        manifest = json.loads(shorts_manifest_path.read_text())
        short_checks = []
        for item in manifest.get("shorts", []):
            clip = Path(item["video"])
            probe_streams = item.get("probe", {}).get("streams", [])
            v = next((s for s in probe_streams if s.get("codec_type") == "video"), {})
            a = next((s for s in probe_streams if s.get("codec_type") == "audio"), {})
            short_checks.append(
                clip.exists()
                and clip.stat().st_size > 0
                and v.get("width") == 1080
                and v.get("height") == 1920
                and v.get("sample_aspect_ratio") == "1:1"
                and v.get("display_aspect_ratio") == "9:16"
                and v.get("codec_name") == "h264"
                and a.get("codec_name") == "aac"
                and item.get("decodeStatus") == "passed-no-ffmpeg-error-output"
            )
        add_condition_check(
            checks,
            "shorts-manifest-contract",
            len(short_checks) == 6 and all(short_checks),
            f"shorts={len(short_checks)} allPassed={all(short_checks) if short_checks else False}",
            shorts_manifest_path,
        )

    readme_text = (ready_dir / "UPLOAD_README.md").read_text(errors="replace") if (ready_dir / "UPLOAD_README.md").exists() else ""
    handoff_text = (ready_dir / "PRODUCER_HANDOFF_EP04_V007.md").read_text(errors="replace") if (ready_dir / "PRODUCER_HANDOFF_EP04_V007.md").exists() else ""
    add_condition_check(
        checks,
        "docs-point-to-recommended-files",
        all(value in readme_text + handoff_text for value in recommended.values()),
        "README/handoff contain every recommended upload artifact path",
    )

    hard_stops = sum(1 for check in checks if check.status == "failed")
    warnings = sum(1 for check in checks if check.status == "warning")
    report = PacketReport(
        status="passed" if hard_stops == 0 else "failed",
        readyDir=str(ready_dir),
        checkCount=len(checks),
        hardStopCount=hard_stops,
        warningCount=warnings,
        recommendedUpload=recommended,
        truth={
            "externalPublication": "not published, uploaded, scheduled, or sent by Codex",
            "sourceMedia": "original media not mutated by this packet check",
            "scope": "local upload packet readiness only",
            "producerRecommendation": "upload main 59m26 for YouTube, Spotify, and Apple; keep tight 44m36 as backup",
        },
        checks=checks,
    )
    return report


def write_markdown(report: PacketReport, path: Path) -> None:
    rec = report.recommendedUpload
    lines = [
        "# Episode 4 final upload packet QC v007",
        "",
        f"Status: `{report.status}`",
        f"Hard stops: `{report.hardStopCount}`",
        f"Warnings: `{report.warningCount}`",
        "",
        "## Upload these tonight",
        "",
        f"- YouTube video: `{rec['youtubeVideo']}`",
        f"- Spotify/Apple audio: `{rec['podcastAudioM4A']}`",
        f"- Podcast fallback MP3: `{rec['podcastAudioMP3Fallback']}`",
        f"- YouTube captions: `{rec['youtubeCaptions']}`",
        f"- Upload copy: `{rec['metadata']}`",
        "",
        "## Social shorts",
        "",
        f"Start here: `{rec['socialShortsStartHere']}`",
        "",
        "## Truth",
        "",
        f"- {report.truth['externalPublication']}.",
        f"- {report.truth['sourceMedia']}.",
        f"- Scope: {report.truth['scope']}.",
        "",
        "## Checks",
        "",
    ]
    for check in report.checks:
        lines.append(f"- `{check.status}` {check.id}: {check.detail}")
    path.write_text("\n".join(lines) + "\n")


def write_start_here(report: PacketReport, path: Path) -> None:
    rec = report.recommendedUpload
    lines = [
        "# START HERE - Upload High Ground Odyssey Episode 4",
        "",
        "Producer recommendation: upload the main 59:26 v007 cut.",
        "",
        "## 1. YouTube",
        "",
        f"Upload: `{rec['youtubeVideo']}`",
        f"Captions: `{rec['youtubeCaptions']}`",
        "Copy/title/description/tags: `UPLOAD_METADATA_EP04.md`",
        "",
        "## 2. Spotify / Apple Podcasts",
        "",
        f"Preferred audio: `{rec['podcastAudioM4A']}`",
        f"Fallback audio if a platform complains: `{rec['podcastAudioMP3Fallback']}`",
        "Use the same title/description basis from `UPLOAD_METADATA_EP04.md`.",
        "",
        "## 3. Shorts",
        "",
        f"Open: `{rec['socialShortsStartHere']}`",
        "",
        "## 4. Evidence",
        "",
        "Read `EPISODE_4_FINAL_UPLOAD_PACKET_QC_V007.md` if you need the proof trail.",
        "",
        "## Safety truth",
        "",
        "- Codex did not upload, publish, schedule, send, or change external accounts.",
        "- Original media was not mutated.",
        "- This folder is a local release packet.",
    ]
    path.write_text("\n".join(lines) + "\n")


def write_desktop_launcher(ready_dir: Path, launcher_path: Path) -> None:
    script = f"""#!/bin/zsh
set -euo pipefail
READY_DIR={json.dumps(str(ready_dir))}
open "$READY_DIR"
open "$READY_DIR/START_HERE_UPLOAD_EPISODE_4_NOW.md"
open "$READY_DIR/UPLOAD_METADATA_EP04.md"
open "$READY_DIR/EPISODE_4_FINAL_UPLOAD_PACKET_QC_V007.md"
open "$READY_DIR/episode-4-v007-social-shorts/START_HERE_EPISODE_4_V007_SHORTS.md"
"""
    launcher_path.write_text(script)
    mode = launcher_path.stat().st_mode
    launcher_path.chmod(mode | stat.S_IXUSR | stat.S_IXGRP | stat.S_IXOTH)


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--ready-dir", type=Path, default=DEFAULT_READY_DIR)
    parser.add_argument("--desktop-launcher", type=Path, default=DEFAULT_DESKTOP_LAUNCHER)
    args = parser.parse_args()

    report = build_report(args.ready_dir)
    json_path = args.ready_dir / "episode-4-final-upload-packet-qc-v007.json"
    md_path = args.ready_dir / "EPISODE_4_FINAL_UPLOAD_PACKET_QC_V007.md"
    start_here_path = args.ready_dir / "START_HERE_UPLOAD_EPISODE_4_NOW.md"

    json_path.write_text(json.dumps(asdict(report), indent=2) + "\n")
    write_markdown(report, md_path)
    write_start_here(report, start_here_path)
    write_desktop_launcher(args.ready_dir, args.desktop_launcher)

    print(
        json.dumps(
            {
                "status": report.status,
                "hardStopCount": report.hardStopCount,
                "warningCount": report.warningCount,
                "json": str(json_path),
                "markdown": str(md_path),
                "startHere": str(start_here_path),
                "desktopLauncher": str(args.desktop_launcher),
            },
            indent=2,
        )
    )
    return 0 if report.status == "passed" else 1


if __name__ == "__main__":
    raise SystemExit(main())
