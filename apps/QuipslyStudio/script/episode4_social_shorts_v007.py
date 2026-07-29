#!/usr/bin/env python3
"""Render Episode 4 v007 social-short candidates from the validated main cut.

This is intentionally small and explicit. It does not mutate source media and it
does not claim publication. The input is the current ready-to-upload Episode 4
main render plus its transcript packet; the output is a versioned local shorts
packet with vertical MP4s, SRT captions, thumbnails, platform copy, and a
manifest.
"""

from __future__ import annotations

import argparse
import json
import math
import re
import subprocess
from dataclasses import asdict, dataclass
from datetime import UTC, datetime
from pathlib import Path
from typing import Any


DEFAULT_READY_DIR = Path(
    "/Volumes/My Passport/Episode_and_Shorts_Test/Episode_4_Upload_Candidates/READY_TO_UPLOAD_EP4_20260712"
)
DEFAULT_MAIN_VIDEO = DEFAULT_READY_DIR / "High-Ground-Odyssey-Episode-04-main-59m26-video-v007.mp4"
DEFAULT_TRANSCRIPT = DEFAULT_READY_DIR / "High-Ground-Odyssey-Episode-04-main-59m26-transcript-v007.json"
DEFAULT_OUTPUT_DIR = DEFAULT_READY_DIR / "episode-4-v007-social-shorts"


@dataclass(frozen=True)
class ShortCandidate:
    id: str
    title: str
    hook: str
    start: float
    end: float
    angle: str
    platforms: tuple[str, ...] = ("YouTube Shorts", "Instagram Reels", "Facebook Reels")

    @property
    def duration(self) -> float:
        return self.end - self.start


CANDIDATES: tuple[ShortCandidate, ...] = (
    ShortCandidate(
        id="01-work-hard-enjoy-it",
        title="Work hard and enjoy it",
        hook="What if hard work becomes easier when the environment lets people enjoy doing it well?",
        start=228.5,
        end=260.5,
        angle="Core chapter thesis: effort, joy, and being counted on.",
    ),
    ShortCandidate(
        id="02-work-can-be-human",
        title="Work can be human",
        hook="Serious work still needs humanity. Even dangerous organizations can make room for it.",
        start=260.4,
        end=312.3,
        angle="Humanity-at-work clip with the strongest emotional utility for coaching/leadership audiences.",
    ),
    ShortCandidate(
        id="03-tech-support-and-military-comms",
        title="Tech support and military comms",
        hook="The military and a tech support floor have more workflow overlap than you might expect.",
        start=369.5,
        end=408.7,
        angle="Charlie connects asynchronous communication, support leadership, and big-picture visibility.",
    ),
    ShortCandidate(
        id="04-leadership-is-design",
        title="Leadership is design",
        hook="Behavior changes more from incentives and systems than from speeches.",
        start=1968.5,
        end=2000.2,
        angle="Best crisp idea clip: incentives, behavior, and system design.",
    ),
    ShortCandidate(
        id="05-simple-solutions",
        title="Simple solutions count",
        hook="Sometimes the best answer comes from an unexpected person with a simple solution.",
        start=3388.1,
        end=3446.4,
        angle="Leadership humility and listening clip.",
    ),
    ShortCandidate(
        id="06-costa-rica-buffet",
        title="The Costa Rica buffet story",
        hook="A family buffet story turns into a lesson about seeing the whole system.",
        start=3466.8,
        end=3508.4,
        angle="Humor and character clip. Good relationship texture.",
    ),
)


def run(command: list[str], *, capture: bool = False) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        command,
        check=True,
        text=True,
        stdout=subprocess.PIPE if capture else None,
        stderr=subprocess.STDOUT if capture else None,
    )


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


def ffmpeg_drawtext_escape(value: str) -> str:
    return (
        value.replace("\\", "\\\\")
        .replace(":", "\\:")
        .replace("'", "\\'")
        .replace("%", "\\%")
        .replace("\n", " ")
    )


def segment_confidence(segment: dict[str, Any]) -> float | None:
    value = segment.get("avgConfidence")
    return float(value) if value is not None else None


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


def write_platform_copy(path: Path, short: ShortCandidate) -> None:
    hashtags = "#HighGroundOdyssey #Leadership #Coaching #WorkplaceCulture #Podcast"
    path.write_text(
        "\n".join(
            [
                f"# {short.title}",
                "",
                "## Caption",
                short.hook,
                "",
                "Leadership is easier to practice when the idea is specific enough to remember.",
                "",
                hashtags,
                "",
                "## Suggested platform note",
                "Use as a vertical social clip for YouTube Shorts, Instagram Reels, and Facebook Reels.",
                "",
                "## Truth",
                "Generated from the Episode 4 v007 main render. This packet is local-ready only; it has not been uploaded or scheduled.",
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
guard args.count >= 4 else {
    fputs("usage: render_short_overlay.swift <output.png> <title> <hook>\n", stderr)
    exit(2)
}

let output = args[1]
let title = args[2]
let hook = args[3]
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
drawText("High Ground Odyssey", in: rectFromTop(x: 72, y: 1740, width: 936, height: 54), size: 38, weight: .bold, color: .white)
drawText("Leadership stories for the high ground", in: rectFromTop(x: 72, y: 1792, width: 936, height: 42), size: 27, weight: .medium, color: NSColor.white.withAlphaComponent(0.86))

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


def render_overlay(renderer: Path, output_png: Path, short: ShortCandidate) -> None:
    run(["swift", str(renderer), str(output_png), short.title, short.hook])


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


def short_payload(short: ShortCandidate) -> dict[str, Any]:
    payload = asdict(short)
    payload["duration"] = round(short.duration, 3)
    return payload


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--input-video", type=Path, default=DEFAULT_MAIN_VIDEO)
    parser.add_argument("--transcript", type=Path, default=DEFAULT_TRANSCRIPT)
    parser.add_argument("--output-dir", type=Path, default=DEFAULT_OUTPUT_DIR)
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args(argv)

    if not args.input_video.exists():
        raise SystemExit(f"Missing input video: {args.input_video}")
    if not args.transcript.exists():
        raise SystemExit(f"Missing transcript: {args.transcript}")

    args.output_dir.mkdir(parents=True, exist_ok=True)
    clips_dir = args.output_dir / "clips"
    captions_dir = args.output_dir / "captions"
    copy_dir = args.output_dir / "platform-copy"
    thumbnails_dir = args.output_dir / "thumbnails"
    for directory in (clips_dir, captions_dir, copy_dir, thumbnails_dir):
        directory.mkdir(parents=True, exist_ok=True)
    overlays_dir = args.output_dir / "overlays"
    overlays_dir.mkdir(parents=True, exist_ok=True)
    overlay_renderer = ensure_overlay_renderer(overlays_dir)

    transcript = json.loads(args.transcript.read_text(encoding="utf-8"))
    manifest: dict[str, Any] = {
        "schema": "quipsly.episode4.social-shorts.v007",
        "createdAtUtc": datetime.now(UTC).isoformat(timespec="seconds"),
        "inputVideo": str(args.input_video),
        "inputTranscript": str(args.transcript),
        "outputDir": str(args.output_dir),
        "status": "dry-run" if args.dry_run else "rendered",
        "truth": {
            "externalPublication": "not-published",
            "sourceMediaMutated": False,
            "derivedFromValidatedEpisode4V007MainCut": True,
            "speakerLabelsIncluded": False,
        },
        "shorts": [],
    }

    for index, short in enumerate(CANDIDATES, start=1):
        slug = slugify(short.title)
        stem = f"{index:02d}-{short.id}-{slug}"
        video_path = clips_dir / f"{stem}-9x16-v007.mp4"
        srt_path = captions_dir / f"{stem}.srt"
        transcript_path = captions_dir / f"{stem}.json"
        copy_path = copy_dir / f"{stem}-copy.md"
        thumb_path = thumbnails_dir / f"{stem}.jpg"
        overlay_path = overlays_dir / f"{stem}-overlay.png"
        decode_log = clips_dir / f"{stem}-decode-check.txt"

        short_segments = transcript_for(short, transcript)
        write_srt(srt_path, short_segments)
        transcript_path.write_text(
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
        write_platform_copy(copy_path, short)

        probe: dict[str, Any] | None = None
        decode_status = "not-run-dry-run"
        if not args.dry_run:
            render_overlay(overlay_renderer, overlay_path, short)
            render_short(args.input_video, overlay_path, video_path, short)
            render_thumbnail(video_path, thumb_path)
            probe = ffprobe(video_path)
            decode_status = decode_check(video_path, decode_log)

        manifest["shorts"].append(
            {
                "index": index,
                "short": short_payload(short),
                "video": str(video_path),
                "captions": str(srt_path),
                "transcript": str(transcript_path),
                "platformCopy": str(copy_path),
                "thumbnail": str(thumb_path),
                "overlay": str(overlay_path),
                "decodeCheck": str(decode_log),
                "decodeStatus": decode_status,
                "probe": probe,
            }
        )

    manifest_path = args.output_dir / "episode-4-v007-social-shorts-manifest.json"
    manifest_path.write_text(json.dumps(manifest, indent=2), encoding="utf-8")
    readme = args.output_dir / "START_HERE_EPISODE_4_V007_SHORTS.md"
    readme.write_text(
        "\n".join(
            [
                "# Episode 4 v007 social shorts packet",
                "",
                "These are local-ready social-short candidates derived from the validated Episode 4 v007 main cut.",
                "",
                "## Truth",
                "- Original media was not mutated.",
                "- Nothing was uploaded, scheduled, or published.",
                "- Captions are ASR-derived drafts with speaker labels omitted.",
                "- The videos use a vertical blurred-background layout so faces are not cropped away.",
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
    print(json.dumps({"manifest": str(manifest_path), "readme": str(readme), "shortCount": len(CANDIDATES)}, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
