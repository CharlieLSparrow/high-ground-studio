#!/usr/bin/env python3
"""Generic Quipsly caption QC and upload-safe SRT generator.

Input is a small JSON config that names source media/caption pairs and, when
available, a shorts manifest. The script creates derived upload-safe SRT files,
validates them, and writes JSON/Markdown evidence.

It does not overwrite source captions, mutate rendered media, upload, publish,
or change external accounts.
"""

from __future__ import annotations

import argparse
import json
import math
import re
import subprocess
from dataclasses import asdict, dataclass, field
from pathlib import Path
from typing import Any


TIMESTAMP_RE = re.compile(
    r"(?P<start>\d{2}:\d{2}:\d{2},\d{3})\s+-->\s+"
    r"(?P<end>\d{2}:\d{2}:\d{2},\d{3})"
)
MAX_CUE_SECONDS = 12.0
MIN_CUE_SECONDS = 0.75
GAP_SECONDS = 0.050


@dataclass
class CaptionCue:
    index: int
    start: float
    end: float
    text: str


@dataclass
class CaptionCheck:
    id: str
    mediaPath: str
    captionPath: str
    transcriptPath: str | None = None
    mediaDurationSeconds: float | None = None
    cueCount: int = 0
    firstCueStartSeconds: float | None = None
    lastCueEndSeconds: float | None = None
    maxCueDurationSeconds: float | None = None
    hardStops: list[str] = field(default_factory=list)
    warnings: list[str] = field(default_factory=list)
    status: str = "not-run"


def resolve_path(base: Path, value: str | None) -> Path | None:
    if not value:
        return None
    path = Path(value)
    return path if path.is_absolute() else base / path


def timestamp_to_seconds(value: str) -> float:
    hours, minutes, rest = value.split(":")
    seconds, millis = rest.split(",")
    return int(hours) * 3600 + int(minutes) * 60 + int(seconds) + int(millis) / 1000.0


def seconds_to_srt(seconds: float) -> str:
    millis_total = max(0, int(round(seconds * 1000)))
    hours = millis_total // 3_600_000
    millis_total %= 3_600_000
    minutes = millis_total // 60_000
    millis_total %= 60_000
    secs = millis_total // 1000
    millis = millis_total % 1000
    return f"{hours:02d}:{minutes:02d}:{secs:02d},{millis:03d}"


def ffprobe_duration(path: Path) -> float | None:
    if not path.exists():
        return None
    result = subprocess.run(
        [
            "ffprobe",
            "-v",
            "error",
            "-show_entries",
            "format=duration",
            "-of",
            "default=noprint_wrappers=1:nokey=1",
            str(path),
        ],
        text=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        check=False,
    )
    if result.returncode != 0:
        return None
    try:
        return float(result.stdout.strip())
    except ValueError:
        return None


def parse_srt(path: Path) -> list[CaptionCue]:
    text = path.read_text(errors="replace")
    blocks = re.split(r"\n\s*\n", text.strip())
    cues: list[CaptionCue] = []
    for block in blocks:
        lines = [line.strip("\ufeff") for line in block.splitlines() if line.strip()]
        if len(lines) < 2:
            continue
        time_line_index = 1
        try:
            cue_index = int(lines[0].strip())
        except ValueError:
            cue_index = len(cues) + 1
            time_line_index = 0
        if time_line_index >= len(lines):
            continue
        match = TIMESTAMP_RE.search(lines[time_line_index])
        if not match:
            continue
        cues.append(
            CaptionCue(
                index=cue_index,
                start=timestamp_to_seconds(match.group("start")),
                end=timestamp_to_seconds(match.group("end")),
                text=" ".join(lines[time_line_index + 1 :]).strip(),
            )
        )
    return cues


def check_caption(
    *,
    check_id: str,
    media_path: Path,
    caption_path: Path,
    transcript_path: Path | None = None,
) -> CaptionCheck:
    check = CaptionCheck(
        id=check_id,
        mediaPath=str(media_path),
        captionPath=str(caption_path),
        transcriptPath=str(transcript_path) if transcript_path else None,
    )
    if not media_path.exists() or media_path.stat().st_size <= 0:
        check.hardStops.append("media file missing or empty")
    else:
        check.mediaDurationSeconds = ffprobe_duration(media_path)
        if check.mediaDurationSeconds is None:
            check.hardStops.append("could not read media duration with ffprobe")

    if not caption_path.exists() or caption_path.stat().st_size <= 0:
        check.hardStops.append("caption file missing or empty")
        check.status = "failed"
        return check

    if transcript_path is not None and (
        not transcript_path.exists() or transcript_path.stat().st_size <= 0
    ):
        check.warnings.append("transcript file missing or empty")

    cues = parse_srt(caption_path)
    check.cueCount = len(cues)
    if not cues:
        check.hardStops.append("caption file has no parseable cues")
        check.status = "failed"
        return check

    check.firstCueStartSeconds = cues[0].start
    check.lastCueEndSeconds = cues[-1].end
    check.maxCueDurationSeconds = max(cue.end - cue.start for cue in cues)

    previous_start = -1.0
    previous_end = -1.0
    empty_text_count = 0
    bad_order_count = 0
    overlap_count = 0
    for cue in cues:
        if cue.end <= cue.start:
            bad_order_count += 1
        if cue.start < previous_start:
            bad_order_count += 1
        if cue.start < previous_end - 0.100:
            overlap_count += 1
        if not cue.text:
            empty_text_count += 1
        previous_start = cue.start
        previous_end = max(previous_end, cue.end)

    if bad_order_count:
        check.hardStops.append(f"{bad_order_count} cue timing order/duration issue(s)")
    if empty_text_count:
        check.hardStops.append(f"{empty_text_count} empty caption cue(s)")
    if overlap_count:
        check.warnings.append(f"{overlap_count} overlapping cue(s)")
    if check.mediaDurationSeconds is not None and check.lastCueEndSeconds is not None:
        if check.lastCueEndSeconds > check.mediaDurationSeconds + 2.0:
            check.hardStops.append("caption end exceeds media duration by more than 2 seconds")
        gap_to_end = check.mediaDurationSeconds - check.lastCueEndSeconds
        if gap_to_end > 120:
            check.warnings.append(
                f"last cue ends {gap_to_end:.1f}s before media end; may be intentional"
            )
    if check.firstCueStartSeconds is not None and check.firstCueStartSeconds > 60:
        check.warnings.append(
            f"first cue starts at {check.firstCueStartSeconds:.1f}s; intro may be uncaptions"
        )
    if check.maxCueDurationSeconds is not None and check.maxCueDurationSeconds > 20:
        check.warnings.append(
            f"longest cue is {check.maxCueDurationSeconds:.1f}s; platform may split it"
        )

    check.status = "passed" if not check.hardStops else "failed"
    return check


def split_text(text: str, parts: int) -> list[str]:
    words = text.split()
    if parts <= 1 or len(words) <= 3:
        return [text]
    chunk_size = max(1, math.ceil(len(words) / parts))
    chunks = [
        " ".join(words[i : i + chunk_size]).strip()
        for i in range(0, len(words), chunk_size)
    ]
    return [chunk for chunk in chunks if chunk]


def normalize_cues(cues: list[CaptionCue], media_duration: float | None) -> list[CaptionCue]:
    sorted_cues = sorted(cues, key=lambda cue: (cue.start, cue.end, cue.index))
    bounded: list[CaptionCue] = []
    previous_end = 0.0

    for index, cue in enumerate(sorted_cues):
        start = max(0.0, cue.start)
        if bounded and start < previous_end + GAP_SECONDS:
            start = previous_end + GAP_SECONDS
        end = max(start + MIN_CUE_SECONDS, cue.end)
        if index + 1 < len(sorted_cues):
            next_start = max(0.0, sorted_cues[index + 1].start)
            if end > next_start - GAP_SECONDS and next_start > start + MIN_CUE_SECONDS:
                end = next_start - GAP_SECONDS
        if media_duration is not None:
            end = min(end, media_duration)
        if end <= start:
            continue
        bounded.append(CaptionCue(index=len(bounded) + 1, start=start, end=end, text=cue.text))
        previous_end = end

    expanded: list[CaptionCue] = []
    for cue in bounded:
        duration = cue.end - cue.start
        chunks = split_text(cue.text, max(1, math.ceil(duration / MAX_CUE_SECONDS)))
        if len(chunks) <= 1:
            expanded.append(CaptionCue(len(expanded) + 1, cue.start, cue.end, cue.text))
            continue
        part_duration = duration / len(chunks)
        for chunk_index, chunk in enumerate(chunks):
            start = cue.start + part_duration * chunk_index
            end = cue.start + part_duration * (chunk_index + 1)
            if chunk_index + 1 < len(chunks):
                end -= GAP_SECONDS
            expanded.append(CaptionCue(len(expanded) + 1, start, end, chunk))

    no_overlap: list[CaptionCue] = []
    previous_end = 0.0
    for cue in expanded:
        start = cue.start
        if no_overlap and start < previous_end + GAP_SECONDS:
            start = previous_end + GAP_SECONDS
        end = max(start + MIN_CUE_SECONDS, cue.end)
        if media_duration is not None:
            end = min(end, media_duration)
        if end <= start:
            continue
        no_overlap.append(CaptionCue(len(no_overlap) + 1, start, end, cue.text))
        previous_end = end
    return no_overlap


def write_srt(cues: list[CaptionCue], path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    lines: list[str] = []
    for index, cue in enumerate(cues, 1):
        lines.extend(
            [
                str(index),
                f"{seconds_to_srt(cue.start)} --> {seconds_to_srt(cue.end)}",
                cue.text,
                "",
            ]
        )
    path.write_text("\n".join(lines).strip() + "\n")


def load_items(config: dict[str, Any], ready_dir: Path) -> list[dict[str, Any]]:
    items = list(config.get("items", []))
    shorts_manifest_path = resolve_path(ready_dir, config.get("shortsManifest"))
    if shorts_manifest_path and shorts_manifest_path.exists():
        manifest = json.loads(shorts_manifest_path.read_text())
        for item in manifest.get("shorts", []):
            source_caption = Path(item["captions"])
            items.append(
                {
                    "id": f"short-{item['index']}-{item['short']['id']}",
                    "media": item["video"],
                    "caption": item["captions"],
                    "transcript": item.get("transcript"),
                    "output": f"{source_caption.stem}-upload-safe.srt",
                }
            )
    return items


def run(config_path: Path) -> dict[str, Any]:
    config = json.loads(config_path.read_text())
    ready_dir = resolve_path(config_path.parent, config.get("readyDir")) or config_path.parent
    output_dir = resolve_path(ready_dir, config.get("outputDir")) or ready_dir / "captions-upload-safe"
    output_dir.mkdir(parents=True, exist_ok=True)

    results = []
    for item in load_items(config, ready_dir):
        media = resolve_path(ready_dir, item["media"])
        caption = resolve_path(ready_dir, item["caption"])
        transcript = resolve_path(ready_dir, item.get("transcript"))
        if media is None or caption is None:
            raise ValueError(f"caption item {item.get('id')} missing media or caption")
        source_check = check_caption(
            check_id=str(item["id"]),
            media_path=media,
            caption_path=caption,
            transcript_path=transcript,
        )
        output_name = item.get("output") or f"{caption.stem}-upload-safe.srt"
        output_path = output_dir / output_name
        normalized = normalize_cues(parse_srt(caption), source_check.mediaDurationSeconds)
        write_srt(normalized, output_path)
        upload_safe_check = check_caption(
            check_id=f"{item['id']}-upload-safe",
            media_path=media,
            caption_path=output_path,
        )
        results.append(
            {
                "id": item["id"],
                "sourceCaption": str(caption),
                "uploadSafeCaption": str(output_path),
                "sourceCueCount": source_check.cueCount,
                "uploadSafeCueCount": upload_safe_check.cueCount,
                "sourceWarnings": source_check.warnings,
                "sourceHardStops": source_check.hardStops,
                "uploadSafeStatus": upload_safe_check.status,
                "uploadSafeWarnings": upload_safe_check.warnings,
                "uploadSafeHardStops": upload_safe_check.hardStops,
                "uploadSafeCheck": asdict(upload_safe_check),
            }
        )

    hard_stop_count = sum(len(item["uploadSafeHardStops"]) for item in results)
    warning_count = sum(len(item["uploadSafeWarnings"]) for item in results)
    report = {
        "schema": "quipsly.caption-upload-safe.v1",
        "episodeId": config.get("episodeId"),
        "status": "passed" if hard_stop_count == 0 else "failed",
        "passed": hard_stop_count == 0,
        "readyDir": str(ready_dir),
        "config": str(config_path),
        "outputDir": str(output_dir),
        "checkCount": len(results),
        "hardStopCount": hard_stop_count,
        "warningCount": warning_count,
        "truth": {
            "sourceCaptionsOverwritten": False,
            "renderedMediaMutated": False,
            "externalPublication": "not published by Codex",
            "scope": "derived platform-safe SRT timing only",
        },
        "items": results,
    }

    json_path = resolve_path(ready_dir, config.get("outputJson")) or ready_dir / "caption-upload-safe-qc.json"
    markdown_path = resolve_path(ready_dir, config.get("outputMarkdown")) or ready_dir / "CAPTION_UPLOAD_SAFE_QC.md"
    json_path.write_text(json.dumps(report, indent=2) + "\n")
    write_markdown(report, markdown_path)
    update_upload_qc(config, ready_dir, report, json_path, markdown_path)
    return {
        "status": report["status"],
        "passed": report["passed"],
        "checkCount": report["checkCount"],
        "hardStopCount": report["hardStopCount"],
        "warningCount": report["warningCount"],
        "outputDir": str(output_dir),
        "json": str(json_path),
        "markdown": str(markdown_path),
    }


def write_markdown(report: dict[str, Any], path: Path) -> None:
    lines = [
        "# Quipsly upload-safe captions",
        "",
        f"Episode: `{report.get('episodeId')}`",
        f"Status: `{report['status']}`",
        f"Output folder: `{report['outputDir']}`",
        f"Checks: `{report['checkCount']}`",
        f"Hard stops: `{report['hardStopCount']}`",
        f"Warnings: `{report['warningCount']}`",
        "",
        "These are derived SRT files for platform upload. Source captions are preserved.",
        "",
    ]
    for item in report["items"]:
        lines.extend(
            [
                f"## {item['id']}",
                "",
                f"- Upload-safe SRT: `{item['uploadSafeCaption']}`",
                f"- Source cues: `{item['sourceCueCount']}`",
                f"- Upload-safe cues: `{item['uploadSafeCueCount']}`",
                f"- Status: `{item['uploadSafeStatus']}`",
            ]
        )
        if item["sourceWarnings"]:
            lines.append(f"- Source warnings routed/repaired: `{len(item['sourceWarnings'])}`")
        if item["uploadSafeWarnings"]:
            lines.append("- Upload-safe warnings:")
            lines.extend(f"  - {warning}" for warning in item["uploadSafeWarnings"])
        if item["uploadSafeHardStops"]:
            lines.append("- Upload-safe hard stops:")
            lines.extend(f"  - {stop}" for stop in item["uploadSafeHardStops"])
        lines.append("")
    path.write_text("\n".join(lines))


def update_upload_qc(
    config: dict[str, Any],
    ready_dir: Path,
    report: dict[str, Any],
    json_path: Path,
    markdown_path: Path,
) -> None:
    upload_qc_path = resolve_path(ready_dir, config.get("uploadQcJson"))
    if not upload_qc_path or not upload_qc_path.exists():
        return
    qc = json.loads(upload_qc_path.read_text())
    key = config.get("uploadQcKey", "genericUploadSafeCaptions")
    qc[key] = {
        "status": report["status"],
        "passed": report["passed"],
        "folder": report["outputDir"],
        "json": json_path.name,
        "markdown": markdown_path.name,
        "checkCount": report["checkCount"],
        "hardStopCount": report["hardStopCount"],
        "warningCount": report["warningCount"],
        "truth": report["truth"],
        "items": [
            {
                "id": item["id"],
                "uploadSafeCaption": item["uploadSafeCaption"],
                "status": item["uploadSafeStatus"],
            }
            for item in report["items"]
        ],
    }
    qc[config.get("uploadQcSummaryKey", "genericUploadSafeCaptionsSummary")] = (
        f"{report['checkCount']} upload-safe caption checks, "
        f"{report['hardStopCount']} hard stops, {report['warningCount']} warnings"
    )
    upload_qc_path.write_text(json.dumps(qc, indent=2) + "\n")


def main() -> int:
    parser = argparse.ArgumentParser(description="Create and validate upload-safe SRT captions.")
    parser.add_argument("--config", type=Path, required=True)
    args = parser.parse_args()
    result = run(args.config)
    print(json.dumps(result, indent=2))
    return 0 if result["passed"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
