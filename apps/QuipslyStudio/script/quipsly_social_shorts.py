#!/usr/bin/env python3
"""Generic Quipsly social-short renderer.

This turns a validated long-form render plus transcript JSON into a local
shorts packet:

- vertical 1080x1920 MP4s
- ASR-derived SRT captions and JSON transcript slices
- platform-copy drafts
- thumbnails
- overlay PNGs
- manifest with ffprobe and decode-check evidence

It is intentionally local-only. It does not upload, publish, schedule, mutate
external accounts, or touch original/source media.
"""

from __future__ import annotations

import argparse
import json
import re
import subprocess
from dataclasses import asdict, dataclass
from datetime import UTC, datetime
from pathlib import Path
from typing import Any


@dataclass(frozen=True)
class ShortCandidate:
    id: str
    title: str
    hook: str
    start: float
    end: float
    angle: str = ""
    platforms: tuple[str, ...] = ("YouTube Shorts", "Instagram Reels", "Facebook Reels")

    @property
    def duration(self) -> float:
        return self.end - self.start


def run(command: list[str], *, capture: bool = False) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        command,
        check=True,
        text=True,
        stdout=subprocess.PIPE if capture else None,
        stderr=subprocess.STDOUT if capture else None,
    )


def resolve_path(base: Path, value: str) -> Path:
    path = Path(value)
    return path if path.is_absolute() else base / path


def slugify(value: str) -> str:
    value = value.lower()
    value = re.sub(r"[^a-z0-9]+", "-", value)
    return value.strip("-")


def srt_time(seconds: float) -> str:
    seconds = max(0.0, float(seconds))
    hour = int(seconds // 3600)
    minute = int((seconds % 3600) // 60)
    second = int(seconds % 60)
    millis = int(round((seconds - int(seconds)) * 1000))
    if millis == 1000:
        millis = 0
        second += 1
    if second == 60:
        second = 0
        minute += 1
    if minute == 60:
        minute = 0
        hour += 1
    return f"{hour:02d}:{minute:02d}:{second:02d},{millis:03d}"


def segment_confidence(segment: dict[str, Any]) -> float | None:
    value = segment.get("avgConfidence")
    return float(value) if value is not None else None


def candidate_from_json(item: dict[str, Any]) -> ShortCandidate:
    return ShortCandidate(
        id=str(item["id"]),
        title=str(item["title"]),
        hook=str(item.get("hook") or item["title"]),
        start=float(item["start"]),
        end=float(item["end"]),
        angle=str(item.get("angle", "")),
        platforms=tuple(item.get("platforms") or ("YouTube Shorts", "Instagram Reels", "Facebook Reels")),
    )


def short_payload(short: ShortCandidate) -> dict[str, Any]:
    payload = asdict(short)
    payload["platforms"] = list(short.platforms)
    payload["duration"] = round(short.duration, 3)
    return payload


def transcript_for(short: ShortCandidate, transcript: dict[str, Any]) -> list[dict[str, Any]]:
    out: list[dict[str, Any]] = []
    for segment in transcript.get("segments", []):
        start = float(segment.get("start", 0.0))
        end = float(segment.get("end", start))
        if end <= short.start or start >= short.end:
            continue
        local_start = max(start, short.start) - short.start
        local_end = min(end, short.end) - short.start
        text = re.sub(r"\s+", " ", str(segment.get("text", "")).strip())
        if not text:
            continue
        out.append(
            {
                "start": round(local_start, 3),
                "end": round(max(local_end, local_start + 0.3), 3),
                "sourceStart": round(max(start, short.start), 3),
                "sourceEnd": round(min(end, short.end), 3),
                "text": text,
                "avgConfidence": segment_confidence(segment),
                "reviewStatus": segment.get("reviewStatus", "asr-draft-needs-review"),
                "speakerStatus": segment.get("speakerStatus", "placeholder-needs-review"),
            }
        )
    return out


def write_srt(path: Path, segments: list[dict[str, Any]]) -> None:
    lines: list[str] = []
    for index, segment in enumerate(segments, start=1):
        lines.append(str(index))
        lines.append(f"{srt_time(segment['start'])} --> {srt_time(segment['end'])}")
        lines.append(str(segment["text"]))
        lines.append("")
    path.write_text("\n".join(lines), encoding="utf-8")


def write_platform_copy(path: Path, short: ShortCandidate, *, episode_title: str, hashtags: str) -> None:
    path.write_text(
        "\n".join(
            [
                f"# {short.title}",
                "",
                "## Caption",
                short.hook,
                "",
                short.angle or "A focused vertical cut from the episode.",
                "",
                hashtags,
                "",
                "## Suggested platform note",
                "Use as a vertical social clip for YouTube Shorts, Instagram Reels, and Facebook Reels.",
                "",
                "## Source",
                episode_title,
                "",
                "## Truth",
                "Generated from a local Quipsly render. This packet is local-ready only; it has not been uploaded or scheduled.",
            ]
        ),
        encoding="utf-8",
    )


def ensure_overlay_renderer(output_dir: Path) -> Path:
    script_path = output_dir / "render_short_overlay.swift"
    if script_path.exists():
        return script_path
    script_path.write_text(
        r'''
import AppKit
import Foundation

let args = CommandLine.arguments
guard args.count >= 6 else {
    fputs("usage: render_short_overlay.swift <output.png> <title> <hook> <brandTitle> <brandSubtitle>\n", stderr)
    exit(2)
}

let output = args[1]
let title = args[2]
let hook = args[3]
let brandTitle = args[4]
let brandSubtitle = args[5]
let size = NSSize(width: 1080, height: 1920)
let image = NSImage(size: size)

func rectFromTop(x: CGFloat, y: CGFloat, width: CGFloat, height: CGFloat) -> NSRect {
    NSRect(x: x, y: size.height - y - height, width: width, height: height)
}

func drawText(_ text: String, in rect: NSRect, size fontSize: CGFloat, weight: NSFont.Weight, color: NSColor, alignment: NSTextAlignment = .left) {
    let style = NSMutableParagraphStyle()
    style.alignment = alignment
    style.lineBreakMode = .byWordWrapping
    style.lineSpacing = 4
    let attrs: [NSAttributedString.Key: Any] = [
        .font: NSFont.systemFont(ofSize: fontSize, weight: weight),
        .foregroundColor: color,
        .paragraphStyle: style
    ]
    (text as NSString).draw(in: rect, withAttributes: attrs)
}

image.lockFocus()
NSColor.clear.setFill()
NSRect(origin: .zero, size: size).fill()

NSColor.black.withAlphaComponent(0.46).setFill()
NSBezierPath(roundedRect: rectFromTop(x: 36, y: 40, width: 1008, height: 252), xRadius: 34, yRadius: 34).fill()
drawText(title.uppercased(), in: rectFromTop(x: 72, y: 70, width: 936, height: 66), size: 48, weight: .heavy, color: .white)
drawText(hook, in: rectFromTop(x: 72, y: 140, width: 936, height: 110), size: 31, weight: .semibold, color: NSColor.white.withAlphaComponent(0.94))

NSColor.black.withAlphaComponent(0.38).setFill()
NSBezierPath(roundedRect: rectFromTop(x: 36, y: 1704, width: 1008, height: 160), xRadius: 30, yRadius: 30).fill()
drawText(brandTitle, in: rectFromTop(x: 72, y: 1740, width: 936, height: 54), size: 38, weight: .bold, color: .white)
drawText(brandSubtitle, in: rectFromTop(x: 72, y: 1792, width: 936, height: 42), size: 27, weight: .medium, color: NSColor.white.withAlphaComponent(0.86))

image.unlockFocus()

guard let tiff = image.tiffRepresentation,
      let rep = NSBitmapImageRep(data: tiff),
      let png = rep.representation(using: .png, properties: [:]) else {
    fputs("failed to render overlay png\n", stderr)
    exit(1)
}
try png.write(to: URL(fileURLWithPath: output))
'''.lstrip(),
        encoding="utf-8",
    )
    return script_path


def render_overlay(
    renderer: Path,
    output_png: Path,
    short: ShortCandidate,
    *,
    brand_title: str,
    brand_subtitle: str,
) -> None:
    run(["swift", str(renderer), str(output_png), short.title, short.hook, brand_title, brand_subtitle])


def render_short(input_video: Path, overlay_png: Path, output_video: Path, short: ShortCandidate) -> None:
    vf = (
        "[0:v]split=2[bgsrc][fgsrc];"
        "[bgsrc]scale=1080:1920:force_original_aspect_ratio=increase,"
        "crop=1080:1920,gblur=sigma=24,eq=brightness=-0.10:saturation=1.08[bg];"
        "[fgsrc]scale=1080:-2,format=yuv420p[fg];"
        "[bg][fg]overlay=(W-w)/2:330[base];"
        "[1:v]scale=1080:1920[overlay];"
        "[base][overlay]overlay=0:0:format=auto,"
        "setsar=1,format=yuv420p[outv]"
    )
    run(
        [
            "ffmpeg",
            "-hide_banner",
            "-y",
            "-ss",
            f"{short.start:.3f}",
            "-t",
            f"{short.duration:.3f}",
            "-i",
            str(input_video),
            "-loop",
            "1",
            "-i",
            str(overlay_png),
            "-filter_complex",
            vf,
            "-map",
            "[outv]",
            "-map",
            "0:a:0",
            "-c:v",
            "h264_videotoolbox",
            "-b:v",
            "5500k",
            "-maxrate",
            "8000k",
            "-bufsize",
            "12000k",
            "-c:a",
            "aac",
            "-b:a",
            "192k",
            "-movflags",
            "+faststart",
            "-shortest",
            str(output_video),
        ]
    )


def render_thumbnail(video_path: Path, thumbnail_path: Path) -> None:
    run(
        [
            "ffmpeg",
            "-hide_banner",
            "-y",
            "-ss",
            "1.0",
            "-i",
            str(video_path),
            "-frames:v",
            "1",
            "-update",
            "1",
            "-q:v",
            "2",
            str(thumbnail_path),
        ]
    )


def ffprobe(path: Path) -> dict[str, Any]:
    result = run(
        ["ffprobe", "-v", "error", "-show_format", "-show_streams", "-print_format", "json", str(path)],
        capture=True,
    )
    return json.loads(result.stdout)


def decode_check(video_path: Path, log_path: Path) -> str:
    result = subprocess.run(
        ["ffmpeg", "-v", "error", "-i", str(video_path), "-map", "0:v:0", "-map", "0:a:0", "-f", "null", "-"],
        text=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
    )
    log_path.write_text(result.stdout or "", encoding="utf-8")
    return "passed-no-ffmpeg-error-output" if result.returncode == 0 and not result.stdout else "failed-see-log"


def write_readme(path: Path, manifest: dict[str, Any], episode_title: str) -> None:
    path.write_text(
        "\n".join(
            [
                f"# {episode_title} social shorts packet",
                "",
                "These are local-ready social-short candidates derived from a validated Quipsly render.",
                "",
                "## Truth",
                "- Original media was not mutated.",
                "- Nothing was uploaded, scheduled, or published.",
                "- Captions are ASR-derived drafts with speaker labels omitted.",
                "- Videos use a vertical blurred-background layout so faces are not cropped away.",
                "",
                "## Shorts",
                *[
                    f"{item['index']}. `{Path(item['video']).name}` - {item['short']['title']} ({item['short']['duration']:.1f}s) - {item['decodeStatus']}"
                    for item in manifest["shorts"]
                ],
                "",
                "## Next safest action",
                "Spot-check each clip, then pick the best 2-3 for first posting. Use each matching caption and platform-copy file.",
            ]
        ),
        encoding="utf-8",
    )


def update_upload_qc(config: dict[str, Any], ready_dir: Path, manifest: dict[str, Any], manifest_path: Path, readme_path: Path) -> None:
    upload_qc_json = config.get("uploadQcJson")
    if not upload_qc_json:
        return
    qc_path = resolve_path(ready_dir, upload_qc_json)
    if not qc_path.exists():
        return
    qc = json.loads(qc_path.read_text())
    key = config.get("uploadQcKey", "genericSocialShorts")
    qc[key] = {
        "status": manifest["status"],
        "folder": manifest["outputDir"],
        "manifest": str(manifest_path),
        "readme": str(readme_path),
        "shortCount": len(manifest["shorts"]),
        "allDecodeChecksPassed": all(
            item.get("decodeStatus") == "passed-no-ffmpeg-error-output"
            for item in manifest["shorts"]
        ),
        "truth": manifest["truth"],
        "items": [
            {
                "index": item["index"],
                "id": item["short"]["id"],
                "title": item["short"]["title"],
                "durationSeconds": item["short"]["duration"],
                "video": Path(item["video"]).name,
                "decodeStatus": item["decodeStatus"],
            }
            for item in manifest["shorts"]
        ],
    }
    qc[config.get("uploadQcSummaryKey", "genericSocialShortsSummary")] = (
        f"{len(manifest['shorts'])} generic social shorts, "
        f"all decode checks passed={qc[key]['allDecodeChecksPassed']}"
    )
    qc_path.write_text(json.dumps(qc, indent=2) + "\n")


def main() -> int:
    parser = argparse.ArgumentParser(description="Render config-driven Quipsly social shorts.")
    parser.add_argument("--config", type=Path, required=True)
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    config = json.loads(args.config.read_text())
    config_base = args.config.parent
    ready_dir = resolve_path(config_base, config.get("readyDir", "."))
    input_video = resolve_path(ready_dir, config["inputVideo"])
    transcript_path = resolve_path(ready_dir, config["inputTranscript"])
    output_dir = resolve_path(ready_dir, config["outputDir"])
    episode_title = config.get("episodeTitle", config.get("episodeId", "Quipsly episode"))
    brand_title = config.get("brandTitle", "Quipsly")
    brand_subtitle = config.get("brandSubtitle", "Source-backed creative production")
    hashtags = config.get("hashtags", "#Quipsly #Podcast #Shorts")
    output_suffix = config.get("outputSuffix", "9x16")

    if not input_video.exists():
        raise SystemExit(f"Missing input video: {input_video}")
    if not transcript_path.exists():
        raise SystemExit(f"Missing transcript: {transcript_path}")

    output_dir.mkdir(parents=True, exist_ok=True)
    clips_dir = output_dir / "clips"
    captions_dir = output_dir / "captions"
    copy_dir = output_dir / "platform-copy"
    thumbnails_dir = output_dir / "thumbnails"
    overlays_dir = output_dir / "overlays"
    for directory in (clips_dir, captions_dir, copy_dir, thumbnails_dir, overlays_dir):
        directory.mkdir(parents=True, exist_ok=True)
    overlay_renderer = ensure_overlay_renderer(overlays_dir)

    transcript = json.loads(transcript_path.read_text(encoding="utf-8"))
    candidates = [candidate_from_json(item) for item in config.get("candidates", [])]
    if not candidates:
        raise SystemExit("No short candidates configured")

    manifest: dict[str, Any] = {
        "schema": "quipsly.social-shorts.v1",
        "episodeId": config.get("episodeId"),
        "episodeTitle": episode_title,
        "createdAtUtc": datetime.now(UTC).isoformat(timespec="seconds"),
        "inputVideo": str(input_video),
        "inputTranscript": str(transcript_path),
        "outputDir": str(output_dir),
        "status": "dry-run" if args.dry_run else "rendered",
        "truth": {
            "externalPublication": "not-published",
            "sourceMediaMutated": False,
            "speakerLabelsIncluded": False,
            "scope": "local social-short candidates",
        },
        "shorts": [],
    }

    for index, short in enumerate(candidates, start=1):
        slug = slugify(short.title)
        stem = f"{index:02d}-{short.id}-{slug}"
        video_path = clips_dir / f"{stem}-{output_suffix}.mp4"
        srt_path = captions_dir / f"{stem}.srt"
        transcript_slice_path = captions_dir / f"{stem}.json"
        copy_path = copy_dir / f"{stem}-copy.md"
        thumb_path = thumbnails_dir / f"{stem}.jpg"
        overlay_path = overlays_dir / f"{stem}-overlay.png"
        decode_log = clips_dir / f"{stem}-decode-check.txt"

        short_segments = transcript_for(short, transcript)
        write_srt(srt_path, short_segments)
        transcript_slice_path.write_text(
            json.dumps(
                {
                    "schema": "quipsly.short-transcript.v1",
                    "short": short_payload(short),
                    "segments": short_segments,
                    "confidence": {
                        "segmentCount": len(short_segments),
                        "lowConfidenceLt070": sum(
                            1
                            for segment in short_segments
                            if segment.get("avgConfidence") is not None
                            and float(segment["avgConfidence"]) < 0.70
                        ),
                    },
                },
                indent=2,
            ),
            encoding="utf-8",
        )
        write_platform_copy(copy_path, short, episode_title=episode_title, hashtags=hashtags)

        probe: dict[str, Any] | None = None
        decode_status = "not-run-dry-run"
        if not args.dry_run:
            render_overlay(
                overlay_renderer,
                overlay_path,
                short,
                brand_title=brand_title,
                brand_subtitle=brand_subtitle,
            )
            render_short(input_video, overlay_path, video_path, short)
            render_thumbnail(video_path, thumb_path)
            probe = ffprobe(video_path)
            decode_status = decode_check(video_path, decode_log)

        manifest["shorts"].append(
            {
                "index": index,
                "short": short_payload(short),
                "video": str(video_path),
                "captions": str(srt_path),
                "transcript": str(transcript_slice_path),
                "platformCopy": str(copy_path),
                "thumbnail": str(thumb_path),
                "overlay": str(overlay_path),
                "decodeCheck": str(decode_log),
                "decodeStatus": decode_status,
                "probe": probe,
            }
        )

    all_decode_checks_passed = (
        all(item.get("decodeStatus") == "passed-no-ffmpeg-error-output" for item in manifest["shorts"])
        if not args.dry_run
        else None
    )
    manifest["shortCount"] = len(manifest["shorts"])
    manifest["allDecodeChecksPassed"] = all_decode_checks_passed

    manifest_path = output_dir / config.get("manifestName", "social-shorts-manifest.json")
    readme_path = output_dir / config.get("readmeName", "START_HERE_SOCIAL_SHORTS.md")
    manifest_path.write_text(json.dumps(manifest, indent=2), encoding="utf-8")
    write_readme(readme_path, manifest, episode_title)
    update_upload_qc(config, ready_dir, manifest, manifest_path, readme_path)

    print(
        json.dumps(
            {
                "status": manifest["status"],
                "manifest": str(manifest_path),
                "readme": str(readme_path),
                "shortCount": len(candidates),
                "allDecodeChecksPassed": all_decode_checks_passed,
            },
            indent=2,
        )
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
