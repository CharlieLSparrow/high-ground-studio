#!/usr/bin/env python3
"""Map collapsed final-program SRT cues back onto a source sequence clock.

The render manifest owns the keep ranges. The source session owns the whole
timeline. This tool bridges those clocks without altering either source media
or the delivery captions.
"""

from __future__ import annotations

import argparse
import json
import re
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path


TIMING_RE = re.compile(
    r"^(?P<start>\d{2}:\d{2}:\d{2}[,.]\d{3})\s+-->\s+"
    r"(?P<end>\d{2}:\d{2}:\d{2}[,.]\d{3})(?P<settings>.*)$"
)


@dataclass(frozen=True)
class KeepRange:
    program_start: float
    program_end: float
    sequence_start: float
    sequence_end: float
    reason: str


@dataclass(frozen=True)
class Cue:
    start: float
    end: float
    settings: str
    text: tuple[str, ...]


def parse_timestamp(value: str) -> float:
    hours, minutes, tail = value.replace(",", ".").split(":")
    seconds = float(tail)
    return int(hours) * 3600 + int(minutes) * 60 + seconds


def format_timestamp(seconds: float) -> str:
    milliseconds = max(0, round(seconds * 1000))
    hours, remainder = divmod(milliseconds, 3_600_000)
    minutes, remainder = divmod(remainder, 60_000)
    whole_seconds, milliseconds = divmod(remainder, 1_000)
    return f"{hours:02d}:{minutes:02d}:{whole_seconds:02d},{milliseconds:03d}"


def parse_srt(path: Path) -> list[Cue]:
    blocks = re.split(r"\n\s*\n", path.read_text(encoding="utf-8-sig").strip())
    cues: list[Cue] = []
    for block in blocks:
        lines = [line.rstrip() for line in block.splitlines()]
        timing_index = next(
            (index for index, line in enumerate(lines) if TIMING_RE.match(line)),
            None,
        )
        if timing_index is None:
            continue
        match = TIMING_RE.match(lines[timing_index])
        assert match is not None
        start = parse_timestamp(match.group("start"))
        end = parse_timestamp(match.group("end"))
        if end <= start:
            raise ValueError(f"Invalid cue duration in block: {block!r}")
        text = tuple(line for line in lines[timing_index + 1 :] if line.strip())
        if not text:
            raise ValueError(f"Caption cue has no text: {block!r}")
        cues.append(Cue(start, end, match.group("settings"), text))
    if not cues:
        raise ValueError(f"No SRT cues found in {path}")
    return cues


def load_ranges(path: Path) -> list[KeepRange]:
    payload = json.loads(path.read_text(encoding="utf-8"))
    raw_ranges = payload.get("ranges")
    if not isinstance(raw_ranges, list) or not raw_ranges:
        raise ValueError("Render manifest has no keep ranges")

    ranges: list[KeepRange] = []
    program_cursor = 0.0
    previous_sequence_end = -1.0
    for raw in raw_ranges:
        sequence_start = float(raw["start"])
        sequence_end = float(raw["end"])
        if sequence_end <= sequence_start:
            raise ValueError(f"Invalid keep range: {raw}")
        if sequence_start < previous_sequence_end:
            raise ValueError("Keep ranges must be ordered and non-overlapping")
        duration = sequence_end - sequence_start
        ranges.append(
            KeepRange(
                program_start=program_cursor,
                program_end=program_cursor + duration,
                sequence_start=sequence_start,
                sequence_end=sequence_end,
                reason=str(raw.get("reason", "")),
            )
        )
        program_cursor += duration
        previous_sequence_end = sequence_end
    return ranges


def containing_range(ranges: list[KeepRange], cue: Cue) -> KeepRange:
    midpoint = (cue.start + cue.end) / 2
    for keep_range in ranges:
        if keep_range.program_start <= midpoint <= keep_range.program_end + 0.001:
            return keep_range
    raise ValueError(
        f"Cue at program {cue.start:.3f}-{cue.end:.3f}s is outside the "
        "manifest keep-range clock"
    )


def map_cue(cue: Cue, keep_range: KeepRange) -> tuple[Cue, bool]:
    clamped_start = max(cue.start, keep_range.program_start)
    clamped_end = min(cue.end, keep_range.program_end)
    if clamped_end <= clamped_start:
        raise ValueError(
            f"Cue {cue.start:.3f}-{cue.end:.3f}s does not overlap its mapped range"
        )
    sequence_start = keep_range.sequence_start + (
        clamped_start - keep_range.program_start
    )
    sequence_end = keep_range.sequence_start + (
        clamped_end - keep_range.program_start
    )
    was_clamped = clamped_start != cue.start or clamped_end != cue.end
    return Cue(sequence_start, sequence_end, cue.settings, cue.text), was_clamped


def write_srt(path: Path, cues: list[Cue]) -> None:
    blocks = []
    for index, cue in enumerate(cues, start=1):
        timing = (
            f"{format_timestamp(cue.start)} --> {format_timestamp(cue.end)}"
            f"{cue.settings}"
        )
        blocks.append("\n".join((str(index), timing, *cue.text)))
    path.write_text("\n\n".join(blocks) + "\n", encoding="utf-8")


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--manifest", type=Path, required=True)
    parser.add_argument("--input-srt", type=Path, required=True)
    parser.add_argument("--output-srt", type=Path, required=True)
    parser.add_argument("--receipt", type=Path, required=True)
    args = parser.parse_args()

    for input_path in (args.manifest, args.input_srt):
        if not input_path.is_file():
            raise FileNotFoundError(input_path)
    for output_path in (args.output_srt, args.receipt):
        if output_path.exists():
            raise FileExistsError(
                f"Refusing to overwrite versioned output: {output_path}"
            )
        output_path.parent.mkdir(parents=True, exist_ok=True)

    ranges = load_ranges(args.manifest)
    program_cues = parse_srt(args.input_srt)
    sequence_cues: list[Cue] = []
    clamped_count = 0
    for cue in program_cues:
        mapped, clamped = map_cue(cue, containing_range(ranges, cue))
        sequence_cues.append(mapped)
        clamped_count += int(clamped)

    if any(
        right.start < left.start
        for left, right in zip(sequence_cues, sequence_cues[1:])
    ):
        raise ValueError("Mapped cues are not monotonic on the sequence clock")

    write_srt(args.output_srt, sequence_cues)
    receipt = {
        "schemaVersion": "quipsly.sequence-clock-caption-map.v1",
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "manifestPath": str(args.manifest),
        "inputProgramClockSrt": str(args.input_srt),
        "outputSequenceClockSrt": str(args.output_srt),
        "sourcePolicy": (
            "Read-only clock mapping. Original media, source session, render "
            "manifest, and delivery captions are unchanged."
        ),
        "keepRangeCount": len(ranges),
        "programDurationSeconds": ranges[-1].program_end,
        "sequenceFirstCueSeconds": sequence_cues[0].start,
        "sequenceLastCueSeconds": sequence_cues[-1].end,
        "cueCount": len(sequence_cues),
        "boundaryClampedCueCount": clamped_count,
        "mappingPolicy": (
            "Each cue maps through the keep range containing its midpoint; "
            "boundary-crossing cues are clamped and counted for review."
        ),
    }
    args.receipt.write_text(json.dumps(receipt, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(receipt, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
