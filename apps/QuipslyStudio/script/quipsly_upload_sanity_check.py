#!/usr/bin/env python3
"""Run a final Quipsly upload sanity check for a local episode packet.

This is the reusable version of the Episode 4 deadline preflight. It checks the
actual files a human will upload: video, podcast audio, captions, thumbnail,
copy/index docs, receipt helper, media shape, SRT timing, and optional loudnorm
proof. It does not upload, publish, schedule, mutate external accounts, or touch
original media.
"""

from __future__ import annotations

import argparse
import json
import re
import shutil
import subprocess
from dataclasses import asdict, dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

MEDIA_SUFFIXES = {".mp4", ".m4a", ".mp3", ".mov", ".m4v", ".wav", ".aac"}
SRT_TIME_RE = re.compile(
    r"(\d\d):(\d\d):(\d\d),(\d\d\d)\s+-->\s+"
    r"(\d\d):(\d\d):(\d\d),(\d\d\d)"
)
LOUDNORM_RE = re.compile(
    r'\{\s*"input_i"\s*:\s*"(?P<input_i>[^"]+)".*?'
    r'"input_tp"\s*:\s*"(?P<input_tp>[^"]+)".*?'
    r'"input_lra"\s*:\s*"(?P<input_lra>[^"]+)".*?'
    r'"output_i"\s*:\s*"(?P<output_i>[^"]+)".*?'
    r'"output_tp"\s*:\s*"(?P<output_tp>[^"]+)".*?'
    r'"output_lra"\s*:\s*"(?P<output_lra>[^"]+)"',
    re.S,
)


@dataclass
class FileCheck:
    label: str
    path: str
    exists: bool
    sizeBytes: int = 0
    sizeMB: float = 0.0
    required: bool = True


@dataclass
class UploadSanityReport:
    schema: str = "quipsly.upload-sanity-check.v1"
    createdAt: str = ""
    status: str = "not-run"
    episodeId: str = ""
    title: str = ""
    readyDir: str = ""
    producerRecommendation: str = ""
    hardStopCount: int = 0
    warningCount: int = 0
    hardStops: list[str] = field(default_factory=list)
    warnings: list[str] = field(default_factory=list)
    files: list[FileCheck] = field(default_factory=list)
    media: dict[str, Any] = field(default_factory=dict)
    captions: dict[str, Any] = field(default_factory=dict)
    thumbnail: dict[str, Any] = field(default_factory=dict)
    loudness: dict[str, Any] = field(default_factory=dict)
    truth: dict[str, bool] = field(default_factory=dict)


def load_config(path: Path | None) -> dict[str, Any]:
    if path is None:
        return {}
    try:
        data = json.loads(path.read_text())
    except json.JSONDecodeError as exc:
        raise SystemExit(f"Config JSON parse failed: {exc}") from exc
    if not isinstance(data, dict):
        raise SystemExit("Config root must be an object")
    return data


def cfg_value(args: argparse.Namespace, config: dict[str, Any], name: str, default: Any = None) -> Any:
    value = getattr(args, name, None)
    if value is not None:
        return value
    return config.get(name, default)


def resolve(ready_dir: Path, value: str | None) -> Path | None:
    if not value:
        return None
    path = Path(value)
    return path if path.is_absolute() else ready_dir / path


def rel_path(ready_dir: Path, path: Path | None) -> str:
    if path is None:
        return ""
    try:
        return str(path.relative_to(ready_dir))
    except ValueError:
        return str(path)


def run(cmd: list[str]) -> subprocess.CompletedProcess[str]:
    return subprocess.run(cmd, text=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE, check=False)


def ffprobe_summary(path: Path) -> dict[str, Any]:
    if path.suffix.lower() not in MEDIA_SUFFIXES:
        return {}
    ffprobe = shutil.which("ffprobe") or "/opt/homebrew/bin/ffprobe"
    if not Path(ffprobe).exists() and shutil.which("ffprobe") is None:
        return {"warning": "ffprobe not found"}
    result = run([
        ffprobe,
        "-v",
        "error",
        "-show_entries",
        "format=duration,size,bit_rate:stream=index,codec_type,codec_name,width,height,sample_rate,channels,channel_layout",
        "-of",
        "json",
        str(path),
    ])
    if result.returncode != 0:
        return {"error": result.stderr.strip() or result.stdout.strip() or "ffprobe failed"}
    try:
        return json.loads(result.stdout)
    except json.JSONDecodeError as exc:
        return {"error": f"ffprobe JSON parse failed: {exc}"}


def seconds_from_probe(probe: dict[str, Any]) -> float | None:
    try:
        return float(probe.get("format", {}).get("duration"))
    except (TypeError, ValueError):
        return None


def parse_srt(path: Path, episode_duration: float | None, tolerance: float) -> dict[str, Any]:
    if not path.exists():
        return {"status": "missing", "cueCount": 0, "badTimeRanges": 0, "withinEpisodeDuration": False}
    text = path.read_text(errors="replace")
    cues = SRT_TIME_RE.findall(text)
    bad_ranges = 0
    last_end = 0.0
    first_start: float | None = None
    for cue in cues:
        sh, sm, ss, sms, eh, em, es, ems = map(int, cue)
        start = sh * 3600 + sm * 60 + ss + sms / 1000
        end = eh * 3600 + em * 60 + es + ems / 1000
        if first_start is None:
            first_start = start
        if end < start:
            bad_ranges += 1
        last_end = max(last_end, end)
    within = episode_duration is None or last_end <= episode_duration + tolerance
    return {
        "status": "parsed" if cues else "no-cues",
        "cueCount": len(cues),
        "badTimeRanges": bad_ranges,
        "firstCueStartSeconds": round(first_start or 0.0, 3),
        "lastCueEndSeconds": round(last_end, 3),
        "episodeDurationSeconds": round(episode_duration, 3) if episode_duration else None,
        "withinEpisodeDuration": within,
    }


def image_dimensions(path: Path) -> dict[str, Any]:
    if not path.exists():
        return {"status": "missing"}
    sips = shutil.which("sips")
    if not sips:
        return {"status": "not-checked", "warning": "sips not found"}
    result = run([sips, "-g", "pixelWidth", "-g", "pixelHeight", str(path)])
    if result.returncode != 0:
        return {"status": "failed", "error": result.stderr.strip() or result.stdout.strip()}
    out = result.stdout + result.stderr
    width = re.search(r"pixelWidth:\s*(\d+)", out)
    height = re.search(r"pixelHeight:\s*(\d+)", out)
    return {
        "status": "checked",
        "width": int(width.group(1)) if width else None,
        "height": int(height.group(1)) if height else None,
    }


def parse_loudnorm(path: Path) -> dict[str, Any]:
    if not path.exists():
        return {"status": "missing", "error": "loudnorm proof missing"}
    text = path.read_text(errors="replace")
    match = LOUDNORM_RE.search(text)
    if not match:
        return {"status": "parse-failed", "error": "could not find loudnorm JSON block"}
    values: dict[str, Any] = {"status": "parsed"}
    for key, value in match.groupdict().items():
        try:
            values[key] = float(value)
        except ValueError:
            values[key] = value
    return values


def parse_loudnorm_args(values: list[str]) -> dict[str, str]:
    parsed: dict[str, str] = {}
    for value in values:
        if "=" not in value:
            raise SystemExit(f"Expected label=path for --loudnorm-proof, got {value!r}")
        label, path = value.split("=", 1)
        label = label.strip()
        path = path.strip()
        if not label or not path:
            raise SystemExit(f"Expected label=path for --loudnorm-proof, got {value!r}")
        parsed[label] = path
    return parsed


def add_file(report: UploadSanityReport, ready_dir: Path, label: str, value: str | None, required: bool = True) -> Path | None:
    path = resolve(ready_dir, value)
    if path is None:
        if required:
            report.hardStops.append(f"missing configured path for {label}")
        return None
    exists = path.is_file() and path.stat().st_size > 0
    size = path.stat().st_size if exists else 0
    report.files.append(
        FileCheck(
            label=label,
            path=rel_path(ready_dir, path),
            exists=exists,
            sizeBytes=size,
            sizeMB=round(size / 1024 / 1024, 2),
            required=required,
        )
    )
    if required and not exists:
        report.hardStops.append(f"required file missing or empty: {label} -> {rel_path(ready_dir, path)}")
    return path


def write_markdown(path: Path, report: UploadSanityReport) -> None:
    lines: list[str] = [
        f"# {report.title} upload sanity check",
        "",
        f"Created: `{report.createdAt}`",
        "",
        f"Status: `{report.status}`",
        "",
        f"Hard stops: `{report.hardStopCount}`",
        f"Warnings: `{report.warningCount}`",
        "",
        "## Producer recommendation",
        "",
        report.producerRecommendation,
        "",
        "## Required file check",
        "",
        "| Item | Exists | Size MB | Required | Path |",
        "| --- | --- | ---: | --- | --- |",
    ]
    for item in report.files:
        lines.append(f"| `{item.label}` | `{item.exists}` | `{item.sizeMB}` | `{item.required}` | `{item.path}` |")
    lines.extend(["", "## Audio delivery proof", ""])
    if report.loudness:
        for label, values in report.loudness.items():
            if values.get("status") != "parsed":
                lines.append(f"- `{label}`: `{values.get('status')}` {values.get('error', '')}".rstrip())
            else:
                lines.append(
                    f"- `{label}`: integrated `{values.get('input_i'):.2f} LUFS`, "
                    f"true peak `{values.get('input_tp'):.2f} dBTP`, LRA `{values.get('input_lra'):.2f} LU`"
                )
    else:
        lines.append("- No loudnorm proof supplied.")
    lines.extend([
        "",
        "## Caption proof",
        "",
        f"- Status: `{report.captions.get('status', 'not-checked')}`",
        f"- Cues: `{report.captions.get('cueCount', 0)}`",
        f"- Bad time ranges: `{report.captions.get('badTimeRanges', 0)}`",
        f"- Last cue end: `{report.captions.get('lastCueEndSeconds')}` seconds",
        f"- Within episode duration: `{report.captions.get('withinEpisodeDuration')}`",
        "",
        "## Thumbnail proof",
        "",
        f"- Status: `{report.thumbnail.get('status', 'not-checked')}`",
        f"- Dimensions: `{report.thumbnail.get('width')}x{report.thumbnail.get('height')}`",
        "",
        "## Hard stops",
        "",
    ])
    lines.extend([f"- {item}" for item in report.hardStops] or ["- None"])
    lines.extend(["", "## Warnings", ""])
    lines.extend([f"- {item}" for item in report.warnings] or ["- None"])
    lines.extend([
        "",
        "## Truth",
        "",
        "- Codex did not upload, publish, schedule, or send anything externally.",
        "- Original media was not mutated.",
        "- This proves local upload readiness only.",
        "- Publication becomes true only after platform URLs or receipt IDs exist.",
    ])
    path.write_text("\n".join(lines) + "\n", encoding="utf-8")


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--config", type=Path)
    parser.add_argument("--ready-dir", type=Path)
    parser.add_argument("--episode-id")
    parser.add_argument("--title")
    parser.add_argument("--recommendation")
    parser.add_argument("--youtube-video")
    parser.add_argument("--podcast-audio")
    parser.add_argument("--podcast-fallback")
    parser.add_argument("--captions")
    parser.add_argument("--thumbnail")
    parser.add_argument("--platform-copy")
    parser.add_argument("--publisher-index")
    parser.add_argument("--producer-lock")
    parser.add_argument("--desktop-producer-lock")
    parser.add_argument("--receipt-helper")
    parser.add_argument("--loudnorm-proof", action="append", default=[])
    parser.add_argument("--target-lufs", type=float)
    parser.add_argument("--lufs-tolerance", type=float)
    parser.add_argument("--true-peak-max", type=float)
    parser.add_argument("--caption-duration-tolerance", type=float)
    parser.add_argument("--thumbnail-width", type=int)
    parser.add_argument("--thumbnail-height", type=int)
    parser.add_argument("--output-stem")
    parser.add_argument("--json", action="store_true")
    args = parser.parse_args()

    config = load_config(args.config)
    ready_dir = cfg_value(args, config, "ready_dir") or cfg_value(args, config, "readyDir")
    if ready_dir is None:
        raise SystemExit("--ready-dir is required")
    ready_dir = Path(ready_dir)
    ready_dir.mkdir(parents=True, exist_ok=True)

    target_lufs = float(cfg_value(args, config, "target_lufs", -16.0))
    lufs_tolerance = float(cfg_value(args, config, "lufs_tolerance", 1.5))
    true_peak_max = float(cfg_value(args, config, "true_peak_max", -1.0))
    caption_tolerance = float(cfg_value(args, config, "caption_duration_tolerance", 2.0))
    thumbnail_width = int(cfg_value(args, config, "thumbnail_width", 1280))
    thumbnail_height = int(cfg_value(args, config, "thumbnail_height", 720))
    output_stem = cfg_value(args, config, "output_stem", "UPLOAD_SANITY_CHECK")

    report = UploadSanityReport(
        createdAt=datetime.now(timezone.utc).isoformat(),
        episodeId=cfg_value(args, config, "episode_id", cfg_value(args, config, "episodeId", "")),
        title=cfg_value(args, config, "title", "Quipsly episode"),
        readyDir=str(ready_dir),
        producerRecommendation=cfg_value(args, config, "recommendation", "Review upload packet before publishing."),
        truth={
            "uploadedExternally": False,
            "publishedExternally": False,
            "scheduledExternally": False,
            "externalAccountsMutated": False,
            "originalMediaMutated": False,
        },
    )

    paths = {
        "youtube_video": add_file(report, ready_dir, "youtube_video", cfg_value(args, config, "youtube_video", cfg_value(args, config, "youtubeVideo"))),
        "podcast_audio": add_file(report, ready_dir, "podcast_audio", cfg_value(args, config, "podcast_audio", cfg_value(args, config, "podcastAudio"))),
        "podcast_fallback": add_file(report, ready_dir, "podcast_fallback", cfg_value(args, config, "podcast_fallback", cfg_value(args, config, "podcastFallback")), required=False),
        "captions": add_file(report, ready_dir, "captions", cfg_value(args, config, "captions")),
        "thumbnail": add_file(report, ready_dir, "thumbnail", cfg_value(args, config, "thumbnail")),
        "platform_copy": add_file(report, ready_dir, "platform_copy", cfg_value(args, config, "platform_copy", cfg_value(args, config, "platformCopy"))),
        "publisher_index": add_file(report, ready_dir, "publisher_index", cfg_value(args, config, "publisher_index", cfg_value(args, config, "publisherIndex"))),
        "producer_lock": add_file(report, ready_dir, "producer_lock", cfg_value(args, config, "producer_lock", cfg_value(args, config, "producerLock"))),
        "desktop_producer_lock": add_file(report, ready_dir, "desktop_producer_lock", cfg_value(args, config, "desktop_producer_lock", cfg_value(args, config, "desktopProducerLock"))),
        "receipt_helper": add_file(report, ready_dir, "receipt_helper", cfg_value(args, config, "receipt_helper", cfg_value(args, config, "receiptHelper"))),
    }

    for key in ("youtube_video", "podcast_audio", "podcast_fallback"):
        path = paths[key]
        if path is not None and path.exists():
            report.media[key] = ffprobe_summary(path)
            if "error" in report.media[key]:
                report.hardStops.append(f"ffprobe failed for {key}: {report.media[key]['error']}")

    video_duration = seconds_from_probe(report.media.get("youtube_video", {}))
    audio_duration = seconds_from_probe(report.media.get("podcast_audio", {}))
    if video_duration and audio_duration and abs(video_duration - audio_duration) > 2.0:
        report.hardStops.append(f"video/audio duration spread too large: {video_duration:.3f}s vs {audio_duration:.3f}s")

    report.captions = parse_srt(paths["captions"], video_duration, caption_tolerance) if paths["captions"] else {}
    if report.captions.get("cueCount", 0) <= 0:
        report.hardStops.append("caption file has no SRT cues")
    if report.captions.get("badTimeRanges", 0) > 0:
        report.hardStops.append(f"caption file has {report.captions['badTimeRanges']} bad time ranges")
    if report.captions and not report.captions.get("withinEpisodeDuration", False):
        report.hardStops.append("caption timing extends past episode duration tolerance")

    report.thumbnail = image_dimensions(paths["thumbnail"]) if paths["thumbnail"] else {}
    if report.thumbnail.get("status") == "checked":
        if report.thumbnail.get("width") != thumbnail_width or report.thumbnail.get("height") != thumbnail_height:
            report.warnings.append(
                f"thumbnail dimensions expected {thumbnail_width}x{thumbnail_height}, got "
                f"{report.thumbnail.get('width')}x{report.thumbnail.get('height')}"
            )
    elif report.thumbnail:
        report.warnings.append(f"thumbnail dimensions not fully checked: {report.thumbnail}")

    loudnorm_values = parse_loudnorm_args(args.loudnorm_proof or [])
    for key, value in config.get("loudnormProofs", {}).items() if isinstance(config.get("loudnormProofs"), dict) else []:
        loudnorm_values.setdefault(str(key), str(value))
    for label, value in loudnorm_values.items():
        path = resolve(ready_dir, value)
        parsed = parse_loudnorm(path) if path else {"status": "missing", "error": "empty loudnorm path"}
        report.loudness[label] = parsed
        if parsed.get("status") != "parsed":
            report.warnings.append(f"loudnorm proof for {label} not parsed: {parsed.get('error', parsed.get('status'))}")
            continue
        input_i = parsed.get("input_i")
        input_tp = parsed.get("input_tp")
        if isinstance(input_i, (int, float)) and abs(input_i - target_lufs) > lufs_tolerance:
            report.warnings.append(f"{label} integrated loudness {input_i:.2f} LUFS outside target {target_lufs} +/- {lufs_tolerance}")
        if isinstance(input_tp, (int, float)) and input_tp > true_peak_max:
            report.hardStops.append(f"{label} true peak {input_tp:.2f} dBTP exceeds max {true_peak_max:.2f}")

    report.hardStopCount = len(report.hardStops)
    report.warningCount = len(report.warnings)
    report.status = "ready-to-upload" if report.hardStopCount == 0 else "blocked"

    md_path = ready_dir / f"{output_stem}.md"
    json_path = ready_dir / f"{output_stem}.json"
    write_markdown(md_path, report)
    json_path.write_text(json.dumps(asdict(report), indent=2), encoding="utf-8")

    if args.json:
        print(json.dumps({"status": report.status, "hardStopCount": report.hardStopCount, "warningCount": report.warningCount, "markdown": str(md_path), "json": str(json_path)}, indent=2))
    else:
        print(f"{report.status}: hardStops={report.hardStopCount} warnings={report.warningCount}")
        print(md_path)
    return 0 if report.hardStopCount == 0 else 1


if __name__ == "__main__":
    raise SystemExit(main())
