#!/usr/bin/env python3
"""Create an inspectable story and boundary audit for an Episode 4 branch.

The report maps the source transcript onto the branch clock, infers likely
speakers from canonical activity envelopes, and exposes both sides of every
edit boundary. It never mutates a session or source file.
"""

from __future__ import annotations

import argparse
import json
from dataclasses import dataclass
from pathlib import Path
from typing import Any


ACTIVITY_ROOT = Path("/Volumes/My Passport/Quipsly Media Vault/audio/episode-4")
ACTIVITY_DIRS = {
    "Charlie": ACTIVITY_ROOT / "v016-charlie-contribution-envelope-silero",
    "Homer": ACTIVITY_ROOT / "v016-homer-contribution-envelope-silero",
    "Clip": ACTIVITY_ROOT / "v016-reference-contribution-envelope-silero",
}


@dataclass(frozen=True)
class Interval:
    start: float
    end: float


def timestamp(seconds: float) -> str:
    seconds = max(0.0, seconds)
    hours = int(seconds // 3600)
    minutes = int((seconds % 3600) // 60)
    remainder = seconds % 60
    return f"{hours:02d}:{minutes:02d}:{remainder:05.2f}" if hours else f"{minutes:02d}:{remainder:05.2f}"


def load_json(path: Path) -> dict[str, Any]:
    return json.loads(path.read_text())


def load_intervals(directory: Path) -> list[Interval]:
    payload = load_json(directory / "speech-segments.json")
    return [Interval(float(item["start"]), float(item["end"])) for item in payload.get("segments", [])]


def overlap(start: float, end: float, intervals: list[Interval]) -> float:
    return sum(
        max(0.0, min(end, item.end) - max(start, item.start))
        for item in intervals
        if item.end > start and item.start < end
    )


def infer_speaker(start: float, end: float, activity: dict[str, list[Interval]]) -> tuple[str, dict[str, float]]:
    scores = {name: overlap(start, end, intervals) for name, intervals in activity.items()}
    ordered = sorted(scores.items(), key=lambda item: item[1], reverse=True)
    if not ordered or ordered[0][1] <= 0:
        return "Unknown", scores
    if len(ordered) > 1 and ordered[1][1] >= ordered[0][1] * 0.72:
        return "Overlap", scores
    return ordered[0][0], scores


def clean_text(segment: dict[str, Any]) -> str:
    return " ".join(str(segment.get("text") or "").split())


def boundary_clips_spoken_word(segment: dict[str, Any], boundary: float) -> bool:
    """Return true only when a cut lands inside a timed spoken word.

    Whisper segments can contain several sentences and long pauses. Treating
    every cut inside a segment as clipped speech creates false alarms at clean
    sentence boundaries, so word timing is the authoritative audit surface.
    """
    for word in segment.get("words") or []:
        word_start = float(word.get("start") or 0)
        word_end = float(word.get("end") or word_start)
        if word_start + 0.02 < boundary < word_end - 0.02:
            return True
    return False


def nearby(segments: list[dict[str, Any]], at: float, before: bool, count: int = 3) -> list[str]:
    if before:
        matches = [item for item in segments if float(item.get("end") or 0) <= at]
        return [clean_text(item) for item in matches[-count:]]
    matches = [item for item in segments if float(item.get("start") or 0) >= at]
    return [clean_text(item) for item in matches[:count]]


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--manifest", required=True, type=Path)
    parser.add_argument("--output-dir", required=True, type=Path)
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    if args.output_dir.exists():
        raise SystemExit(f"Refusing to overwrite {args.output_dir}")

    manifest = load_json(args.manifest)
    transcript_path = Path(manifest["transcript"]["path"])
    segments = load_json(transcript_path).get("segments", [])
    ranges = manifest.get("ranges", [])
    activity = {name: load_intervals(path) for name, path in ACTIVITY_DIRS.items()}

    output_segments: list[dict[str, Any]] = []
    range_reports: list[dict[str, Any]] = []
    output_cursor = 0.0
    for range_index, source_range in enumerate(ranges, start=1):
        source_start = float(source_range["start"])
        source_end = float(source_range["end"])
        output_start = output_cursor
        mapped: list[dict[str, Any]] = []
        for segment in segments:
            segment_start = float(segment.get("start") or 0)
            segment_end = float(segment.get("end") or segment_start)
            if segment_end <= source_start or segment_start >= source_end:
                continue
            clipped_start = max(segment_start, source_start)
            clipped_end = min(segment_end, source_end)
            speaker, scores = infer_speaker(clipped_start, clipped_end, activity)
            row = {
                "rangeIndex": range_index,
                "sourceStart": clipped_start,
                "sourceEnd": clipped_end,
                "outputStart": output_start + clipped_start - source_start,
                "outputEnd": output_start + clipped_end - source_start,
                "speaker": speaker,
                "activitySeconds": {key: round(value, 3) for key, value in scores.items()},
                "text": clean_text(segment),
                "segmentId": segment.get("segmentId"),
                "clippedAtStart": (
                    clipped_start > segment_start
                    and boundary_clips_spoken_word(segment, clipped_start)
                ),
                "clippedAtEnd": (
                    clipped_end < segment_end
                    and boundary_clips_spoken_word(segment, clipped_end)
                ),
            }
            mapped.append(row)
            output_segments.append(row)
        output_cursor += source_end - source_start
        range_reports.append(
            {
                "rangeIndex": range_index,
                "reason": source_range.get("reason"),
                "sourceStart": source_start,
                "sourceEnd": source_end,
                "outputStart": output_start,
                "outputEnd": output_cursor,
                "durationSeconds": source_end - source_start,
                "mappedSegmentCount": len(mapped),
                "startClipsTranscript": bool(mapped and mapped[0]["clippedAtStart"]),
                "endClipsTranscript": bool(mapped and mapped[-1]["clippedAtEnd"]),
            }
        )

    boundaries = []
    for previous, current in zip(ranges, ranges[1:]):
        previous_end = float(previous["end"])
        current_start = float(current["start"])
        boundaries.append(
            {
                "previousSourceEnd": previous_end,
                "nextSourceStart": current_start,
                "omittedSeconds": current_start - previous_end,
                "before": nearby(segments, previous_end, True),
                "after": nearby(segments, current_start, False),
            }
        )

    args.output_dir.mkdir(parents=True)
    payload = {
        "schema": "quipsly.episode4.producer-story-audit.v1",
        "manifest": str(args.manifest),
        "transcript": str(transcript_path),
        "outputDurationSeconds": output_cursor,
        "rangeReports": range_reports,
        "boundaries": boundaries,
        "segments": output_segments,
    }
    (args.output_dir / "episode-4-producer-story-audit.json").write_text(json.dumps(payload, indent=2) + "\n")

    lines = [
        "# Episode 4 producer story audit",
        "",
        f"- Output duration: `{timestamp(output_cursor)}`",
        f"- Source ranges: `{len(ranges)}`",
        f"- Mapped transcript segments: `{len(output_segments)}`",
        "- Originals/session mutated: `no`",
        "",
    ]
    for report in range_reports:
        lines.extend(
            [
                f"## Range {report['rangeIndex']}: {timestamp(report['outputStart'])}-{timestamp(report['outputEnd'])} output",
                "",
                f"Source `{timestamp(report['sourceStart'])}-{timestamp(report['sourceEnd'])}`. {report['reason']}",
                f"Boundary clipping: start `{report['startClipsTranscript']}`, end `{report['endClipsTranscript']}`.",
                "",
            ]
        )
        for item in output_segments:
            if item["rangeIndex"] == report["rangeIndex"]:
                lines.append(
                    f"- `{timestamp(item['outputStart'])}` / source `{timestamp(item['sourceStart'])}` "
                    f"**{item['speaker']}**: {item['text']}"
                )
        lines.append("")

    lines.extend(["# Cut-boundary context", ""])
    for index, boundary in enumerate(boundaries, start=1):
        lines.extend(
            [
                f"## Cut {index}: source {timestamp(boundary['previousSourceEnd'])} -> {timestamp(boundary['nextSourceStart'])}",
                "",
                f"Omitted: `{timestamp(boundary['omittedSeconds'])}`",
                "",
                "Before:",
                *[f"- {text}" for text in boundary["before"]],
                "",
                "After:",
                *[f"- {text}" for text in boundary["after"]],
                "",
            ]
        )
    (args.output_dir / "episode-4-producer-story-audit.md").write_text("\n".join(lines) + "\n")
    print(json.dumps({"output": str(args.output_dir), "duration": output_cursor, "segments": len(output_segments)}, indent=2))


if __name__ == "__main__":
    main()
