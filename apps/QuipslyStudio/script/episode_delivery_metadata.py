#!/usr/bin/env python3
"""Build captions, chapters, and platform copy from a rendered branch clock."""

from __future__ import annotations

import argparse
import json
import re
from dataclasses import dataclass
from pathlib import Path
from typing import Any


@dataclass(frozen=True)
class TimedWord:
    start: float
    end: float
    text: str


@dataclass(frozen=True)
class CaptionCue:
    start: float
    end: float
    text: str


EPISODE_4_CHAPTERS = [
    "Type Two Fun and the Work Worth Doing",
    "First Grade: Kindness and Accountability",
    "The Office and Specific Praise",
    "Why Kindness Is Leadership Design",
    "Start With Why, Commander's Intent, and Better Meetings",
    "Formations, Readiness, and Respect for Time",
    "Farm Bikes, Sibling Stories, and Resilience",
    "The Cabin Game and the Costa Rica Buffet",
    "Closing: See You on the High Ground",
]


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--manifest", required=True, type=Path)
    parser.add_argument("--delivery-manifest", type=Path)
    parser.add_argument(
        "--program-transcript",
        type=Path,
        help="Optional ASR JSON transcribed from the final rendered program clock.",
    )
    parser.add_argument(
        "--chapter-map",
        type=Path,
        help=(
            "Optional semantic chapter JSON. Each chapter declares a title and "
            "startRangeIndex so technical edit ranges do not become fake chapters."
        ),
    )
    parser.add_argument("--output-dir", required=True, type=Path)
    return parser.parse_args()


def load_json(path: Path) -> dict[str, Any]:
    return json.loads(path.read_text())


def clean_caption(words: list[TimedWord]) -> str:
    text = " ".join(word.text.strip() for word in words if word.text.strip())
    text = re.sub(r"\s+([,.;:!?])", r"\1", text)
    return re.sub(r"\s+", " ", text).strip()


def normalized_word_token(text: str) -> str:
    return re.sub(r"[^a-z0-9']+", "", text.lower())


def deduplicate_overlapping_words(words: list[TimedWord]) -> list[TimedWord]:
    """Remove duplicate ASR words emitted by overlapping source segments.

    Genuine conversational repetition remains because its timestamps advance.
    Only the same token at effectively the same source time is discarded.
    """
    deduplicated: list[TimedWord] = []
    for word in words:
        token = normalized_word_token(word.text)
        duplicate = any(
            token
            and token == normalized_word_token(previous.text)
            and abs(word.start - previous.start) <= 0.12
            and abs(word.end - previous.end) <= 0.12
            for previous in deduplicated[-8:]
        )
        if not duplicate:
            deduplicated.append(word)
    return deduplicated


def map_words(transcript: dict[str, Any], ranges: list[dict[str, Any]]) -> list[TimedWord]:
    mapped: list[TimedWord] = []
    output_cursor = 0.0
    for source_range in ranges:
        source_start = float(source_range["start"])
        source_end = float(source_range["end"])
        for segment in transcript.get("segments", []):
            for word in segment.get("words") or []:
                word_start = float(word.get("start") or 0)
                word_end = float(word.get("end") or word_start)
                if word_end <= source_start or word_start >= source_end:
                    continue
                mapped.append(
                    TimedWord(
                        start=output_cursor + max(source_start, word_start) - source_start,
                        end=output_cursor + min(source_end, word_end) - source_start,
                        text=str(word.get("word") or "").strip(),
                    )
                )
        output_cursor += source_end - source_start
    return deduplicate_overlapping_words(sorted(mapped, key=lambda word: (word.start, word.end)))


def program_words(transcript: dict[str, Any]) -> list[TimedWord]:
    words: list[TimedWord] = []
    for segment in transcript.get("segments", []):
        for word in segment.get("words") or []:
            start = float(word.get("start") or 0)
            end = float(word.get("end") or start)
            text = str(word.get("word") or "").strip()
            if text:
                words.append(TimedWord(start=start, end=max(start, end), text=text))
    return deduplicate_overlapping_words(sorted(words, key=lambda word: (word.start, word.end)))


def transcript_text(transcript: dict[str, Any]) -> str:
    segments = [str(segment.get("text") or "").strip() for segment in transcript.get("segments", [])]
    return re.sub(r"\s+", " ", " ".join(segment for segment in segments if segment)).strip()


def caption_cues(words: list[TimedWord]) -> list[CaptionCue]:
    cues: list[CaptionCue] = []
    current: list[TimedWord] = []

    def flush() -> None:
        nonlocal current
        if current:
            cues.append(CaptionCue(current[0].start, max(current[-1].end, current[0].start + 0.4), clean_caption(current)))
            current = []

    for word in words:
        if not current:
            current = [word]
            continue
        candidate = current + [word]
        gap = word.start - current[-1].end
        duration = word.end - current[0].start
        candidate_text = clean_caption(candidate)
        if gap > 0.9 or duration > 5.2 or len(candidate_text) > 82:
            flush()
            current = [word]
            continue
        current.append(word)
        if re.search(r"[.!?][\"']?$", word.text) and duration >= 1.2:
            flush()
    flush()

    normalized: list[CaptionCue] = []
    for cue in (candidate for candidate in cues if candidate.text):
        start = max(cue.start, normalized[-1].end if normalized else 0.0)
        if cue.end - start < 0.2 and normalized:
            previous_words = set(re.findall(r"[a-z0-9']+", normalized[-1].text.lower()))
            current_words = set(re.findall(r"[a-z0-9']+", cue.text.lower()))
            if current_words and current_words.issubset(previous_words):
                continue
        normalized.append(CaptionCue(start, max(cue.end, start + 0.4), cue.text))
    return normalized


def timestamp(seconds: float, decimal: str = ".") -> str:
    milliseconds = max(0, round(seconds * 1000))
    hours, remainder = divmod(milliseconds, 3_600_000)
    minutes, remainder = divmod(remainder, 60_000)
    secs, millis = divmod(remainder, 1000)
    return f"{hours:02d}:{minutes:02d}:{secs:02d}{decimal}{millis:03d}"


def chapter_timestamp(seconds: float) -> str:
    total = max(0, int(seconds))
    hours, remainder = divmod(total, 3600)
    minutes, secs = divmod(remainder, 60)
    return f"{hours}:{minutes:02d}:{secs:02d}" if hours else f"{minutes:02d}:{secs:02d}"


def semantic_chapters(
    ranges: list[dict[str, Any]],
    chapter_map_path: Path | None,
) -> tuple[list[dict[str, Any]], dict[str, Any]]:
    range_starts: list[float] = []
    cursor = 0.0
    for source_range in ranges:
        range_starts.append(cursor)
        cursor += float(source_range["end"]) - float(source_range["start"])

    if chapter_map_path:
        chapter_map = load_json(chapter_map_path)
        specs = chapter_map.get("chapters")
        if not isinstance(specs, list) or not specs:
            raise SystemExit(f"Chapter map has no chapters: {chapter_map_path}")
    else:
        specs = [
            {
                "title": EPISODE_4_CHAPTERS[index]
                if index < len(EPISODE_4_CHAPTERS)
                else f"Chapter {index + 1}",
                "startRangeIndex": index,
            }
            for index in range(len(ranges))
        ]

    normalized: list[dict[str, Any]] = []
    previous_start = -1
    for index, spec in enumerate(specs):
        if not isinstance(spec, dict):
            raise SystemExit(f"Chapter {index + 1} must be an object")
        title = str(spec.get("title") or "").strip()
        start_index = spec.get("startRangeIndex")
        if not title:
            raise SystemExit(f"Chapter {index + 1} has no title")
        if not isinstance(start_index, int) or not 0 <= start_index < len(ranges):
            raise SystemExit(f"Chapter {index + 1} has invalid startRangeIndex: {start_index}")
        if start_index <= previous_start:
            raise SystemExit("Chapter startRangeIndex values must be strictly increasing")
        normalized.append({"title": title, "startRangeIndex": start_index})
        previous_start = start_index

    if normalized[0]["startRangeIndex"] != 0:
        raise SystemExit("The first semantic chapter must start at range 0")

    chapters: list[dict[str, Any]] = []
    for index, spec in enumerate(normalized):
        start_index = spec["startRangeIndex"]
        end_index = (
            normalized[index + 1]["startRangeIndex"]
            if index + 1 < len(normalized)
            else len(ranges)
        )
        source_ranges = list(range(start_index, end_index))
        chapters.append(
            {
                "startSeconds": round(range_starts[start_index], 3),
                "timestamp": chapter_timestamp(range_starts[start_index]),
                "title": spec["title"],
                "sourceRangeIndices": source_ranges,
                "sourceReasons": [ranges[range_index].get("reason") for range_index in source_ranges],
            }
        )

    provenance = {
        "mode": "explicit-semantic-map" if chapter_map_path else "one-chapter-per-range-fallback",
        "path": str(chapter_map_path) if chapter_map_path else None,
        "rangeCount": len(ranges),
        "chapterCount": len(chapters),
    }
    return chapters, provenance


def main() -> None:
    args = parse_args()
    if args.output_dir.exists():
        raise SystemExit(f"Refusing to overwrite {args.output_dir}")
    manifest = load_json(args.manifest)
    transcript_path = args.program_transcript or Path(manifest["transcript"]["path"])
    transcript = load_json(transcript_path)
    ranges = manifest.get("ranges", [])
    transcript_clock = "final-program" if args.program_transcript else "source-sequence-remapped"
    words = program_words(transcript) if args.program_transcript else map_words(transcript, ranges)
    cues = caption_cues(words)

    args.output_dir.mkdir(parents=True)
    srt_lines: list[str] = []
    for index, cue in enumerate(cues, start=1):
        srt_lines.extend([str(index), f"{timestamp(cue.start, ',')} --> {timestamp(cue.end, ',')}", cue.text, ""])
    (args.output_dir / "episode-4-captions.srt").write_text("\n".join(srt_lines))

    vtt_lines = ["WEBVTT", ""]
    for cue in cues:
        vtt_lines.extend([f"{timestamp(cue.start)} --> {timestamp(cue.end)}", cue.text, ""])
    (args.output_dir / "episode-4-captions.vtt").write_text("\n".join(vtt_lines))
    # Delivery transcript truth must follow the final program clock.  The
    # source transcript may contain material removed by the branch ranges, so
    # exporting its raw segment text would silently resurrect cut content.
    (args.output_dir / "episode-4-transcript.txt").write_text(clean_caption(words) + "\n")

    chapters, chapter_provenance = semantic_chapters(ranges, args.chapter_map)
    cursor = sum(float(source_range["end"]) - float(source_range["start"]) for source_range in ranges)

    primary_title = "How Great Leaders Make Work Matter | High Ground Odyssey Episode 4"
    summary = (
        "Why do some teams endure hard things with energy while others resent easy work? Homer and Charlie connect "
        "type-two fun, first-grade accountability, Michael Scott, Self-Determination Theory, Start With Why, "
        "commander's intent, meetings, military formations, farm bikes, family stories, and a Costa Rica buffet to "
        "one practical leadership idea: people do extraordinary things when the work matters."
    )
    chapter_text = "\n".join(f"{chapter['timestamp']} {chapter['title']}" for chapter in chapters)
    description = (
        f"{summary}\n\nCHAPTERS\n{chapter_text}\n\n"
        "Read and follow the High Ground Odyssey at https://highgroundodyssey.com\n\n"
        "#Leadership #Coaching #WorkCulture #HighGroundOdyssey"
    )
    delivery = load_json(args.delivery_manifest) if args.delivery_manifest else None
    packet = {
        "schema": "quipsly.episode-platform-packet.v3",
        "episode": "episode-4",
        "branch": manifest.get("branch"),
        "durationSeconds": round(cursor, 3),
        "title": primary_title,
        "alternateTitles": [
            "Make the Work Matter: Kindness, Purpose, and Better Leadership",
            "Why Great Leaders Design Meaningful Work | High Ground Odyssey Ep. 4",
        ],
        "summary": summary,
        "description": description,
        "chapters": chapters,
        "chapterProvenance": chapter_provenance,
        "captionCueCount": len(cues),
        "captionFiles": {
            "srt": str(args.output_dir / "episode-4-captions.srt"),
            "vtt": str(args.output_dir / "episode-4-captions.vtt"),
        },
        "transcript": {
            "path": str(transcript_path),
            "clock": transcript_clock,
            "text": str(args.output_dir / "episode-4-transcript.txt"),
            "wordCount": len(words),
            "source": "final rendered program ASR" if args.program_transcript else "source transcript remapped through branch ranges",
        },
        "thumbnailBrief": {
            "headline": "MAKE WORK MATTER",
            "supportingText": "Kindness. Purpose. Leadership.",
            "visual": "Charlie and Homer in a warm split portrait with high-contrast natural gold and forest-green framing.",
        },
        "deliveryAssets": delivery,
        "publicationReceipt": None,
    }
    (args.output_dir / "episode-4-platform-packet.json").write_text(json.dumps(packet, indent=2) + "\n")
    (args.output_dir / "episode-4-youtube-description.txt").write_text(description + "\n")
    print(json.dumps({"status": "ready", "outputDir": str(args.output_dir), "captionCues": len(cues), "chapters": len(chapters)}, indent=2))


if __name__ == "__main__":
    main()
