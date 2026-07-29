#!/usr/bin/env python3
"""Generate upload-safe Episode 4 v007 captions.

The first caption QC pass validates the existing transcript/caption artifacts.
This script creates derived SRT files that are safer for platform upload:

- no intentional source SRT overwrite
- cue overlaps trimmed
- very long cues split into smaller readable cues
- output validated with the same QC helper

The transcript words stay the same. Only cue boundaries are made platform-safe.
"""

from __future__ import annotations

import argparse
import json
import math
from dataclasses import asdict
from pathlib import Path

from episode4_upload_caption_qc_v007 import (
    CaptionCue,
    DEFAULT_READY_DIR,
    check_caption,
)


MAX_CUE_SECONDS = 12.0
MIN_CUE_SECONDS = 0.75
GAP_SECONDS = 0.050


def seconds_to_srt(seconds: float) -> str:
    millis_total = max(0, int(round(seconds * 1000)))
    hours = millis_total // 3_600_000
    millis_total %= 3_600_000
    minutes = millis_total // 60_000
    millis_total %= 60_000
    secs = millis_total // 1000
    millis = millis_total % 1000
    return f"{hours:02d}:{minutes:02d}:{secs:02d},{millis:03d}"


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
            end = start + MIN_CUE_SECONDS
        bounded.append(CaptionCue(index=len(bounded) + 1, start=start, end=end, text=cue.text))
        previous_end = end

    expanded: list[CaptionCue] = []
    for cue in bounded:
        duration = cue.end - cue.start
        parts = max(1, math.ceil(duration / MAX_CUE_SECONDS))
        text_chunks = split_text(cue.text, parts)
        parts = len(text_chunks)
        if parts <= 1:
            expanded.append(
                CaptionCue(
                    index=len(expanded) + 1,
                    start=cue.start,
                    end=cue.end,
                    text=cue.text,
                )
            )
            continue
        part_duration = duration / parts
        for part_index, text in enumerate(text_chunks):
            start = cue.start + part_duration * part_index
            end = cue.start + part_duration * (part_index + 1)
            if part_index + 1 < parts:
                end -= GAP_SECONDS
            expanded.append(
                CaptionCue(
                    index=len(expanded) + 1,
                    start=start,
                    end=end,
                    text=text,
                )
            )
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
        no_overlap.append(
            CaptionCue(
                index=len(no_overlap) + 1,
                start=start,
                end=end,
                text=cue.text,
            )
        )
        previous_end = end
    return no_overlap


def write_srt(cues: list[CaptionCue], path: Path) -> None:
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
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text("\n".join(lines).strip() + "\n")


def load_source_checks(ready_dir: Path) -> list[dict[str, Path | str]]:
    shorts_manifest = (
        ready_dir
        / "episode-4-v007-social-shorts"
        / "episode-4-v007-social-shorts-manifest.json"
    )
    sources: list[dict[str, Path | str]] = [
        {
            "id": "main-59m26",
            "media": ready_dir / "High-Ground-Odyssey-Episode-04-main-59m26-video-v007.mp4",
            "srt": ready_dir / "High-Ground-Odyssey-Episode-04-main-59m26-transcript-v007.srt",
            "output": "High-Ground-Odyssey-Episode-04-main-59m26-transcript-upload-safe-v007.srt",
        },
        {
            "id": "tight-44m36",
            "media": ready_dir / "High-Ground-Odyssey-Episode-04-tight-44m36-video-v007.mp4",
            "srt": ready_dir / "High-Ground-Odyssey-Episode-04-tight-44m36-transcript-v007.srt",
            "output": "High-Ground-Odyssey-Episode-04-tight-44m36-transcript-upload-safe-v007.srt",
        },
    ]
    if shorts_manifest.exists():
        manifest = json.loads(shorts_manifest.read_text())
        for item in manifest.get("shorts", []):
            source_srt = Path(item["captions"])
            sources.append(
                {
                    "id": f"short-{item['index']}-{item['short']['id']}",
                    "media": Path(item["video"]),
                    "srt": source_srt,
                    "output": f"{source_srt.stem}-upload-safe-v007.srt",
                }
            )
    return sources


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--ready-dir", type=Path, default=DEFAULT_READY_DIR)
    args = parser.parse_args()

    ready_dir = args.ready_dir
    output_dir = ready_dir / "captions-upload-safe-v007"
    results = []

    for source in load_source_checks(ready_dir):
        check = check_caption(
            check_id=str(source["id"]),
            media_path=Path(source["media"]),
            caption_path=Path(source["srt"]),
        )
        from episode4_upload_caption_qc_v007 import parse_srt

        cues = parse_srt(Path(source["srt"]))
        normalized = normalize_cues(cues, check.mediaDurationSeconds)
        output_path = output_dir / str(source["output"])
        write_srt(normalized, output_path)
        safe_check = check_caption(
            check_id=f"{source['id']}-upload-safe",
            media_path=Path(source["media"]),
            caption_path=output_path,
        )
        results.append(
            {
                "id": source["id"],
                "sourceCaption": str(source["srt"]),
                "uploadSafeCaption": str(output_path),
                "sourceCueCount": check.cueCount,
                "uploadSafeCueCount": safe_check.cueCount,
                "sourceWarnings": check.warnings,
                "sourceHardStops": check.hardStops,
                "uploadSafeStatus": safe_check.status,
                "uploadSafeWarnings": safe_check.warnings,
                "uploadSafeHardStops": safe_check.hardStops,
                "uploadSafeCheck": asdict(safe_check),
            }
        )

    hard_stop_count = sum(len(item["uploadSafeHardStops"]) for item in results)
    warning_count = sum(len(item["uploadSafeWarnings"]) for item in results)
    report = {
        "schema": "quipsly.episode4.caption-upload-safe.v1",
        "status": "passed" if hard_stop_count == 0 else "failed",
        "passed": hard_stop_count == 0,
        "readyDir": str(ready_dir),
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
    json_path = ready_dir / "episode-4-caption-upload-safe-qc-v007.json"
    md_path = ready_dir / "EPISODE_4_UPLOAD_SAFE_CAPTIONS_V007.md"
    json_path.write_text(json.dumps(report, indent=2) + "\n")

    lines = [
        "# Episode 4 v007 upload-safe captions",
        "",
        f"Status: `{report['status']}`",
        f"Output folder: `{output_dir}`",
        f"Checks: `{report['checkCount']}`",
        f"Hard stops: `{report['hardStopCount']}`",
        f"Warnings: `{report['warningCount']}`",
        "",
        "Use these derived SRT files for platform upload when possible. The original caption files are preserved as source evidence.",
        "",
    ]
    for item in results:
        lines.extend(
            [
                f"## {item['id']}",
                "",
                f"- Upload-safe SRT: `{item['uploadSafeCaption']}`",
                f"- Source cues: `{item['sourceCueCount']}`",
                f"- Upload-safe cues: `{item['uploadSafeCueCount']}`",
                f"- Upload-safe status: `{item['uploadSafeStatus']}`",
            ]
        )
        if item["sourceWarnings"]:
            lines.append(f"- Source warnings repaired or routed: `{len(item['sourceWarnings'])}`")
        if item["uploadSafeWarnings"]:
            lines.append("- Upload-safe warnings:")
            lines.extend(f"  - {warning}" for warning in item["uploadSafeWarnings"])
        if item["uploadSafeHardStops"]:
            lines.append("- Upload-safe hard stops:")
            lines.extend(f"  - {stop}" for stop in item["uploadSafeHardStops"])
        lines.append("")
    md_path.write_text("\n".join(lines))

    upload_qc_path = ready_dir / "episode-4-upload-qc-v007.json"
    if upload_qc_path.exists():
        qc = json.loads(upload_qc_path.read_text())
        qc["uploadSafeCaptions"] = {
            "status": report["status"],
            "passed": report["passed"],
            "folder": str(output_dir),
            "json": json_path.name,
            "markdown": md_path.name,
            "checkCount": report["checkCount"],
            "hardStopCount": report["hardStopCount"],
            "warningCount": report["warningCount"],
            "truth": report["truth"],
            "recommendedMainCaption": "captions-upload-safe-v007/High-Ground-Odyssey-Episode-04-main-59m26-transcript-upload-safe-v007.srt",
            "recommendedTightCaption": "captions-upload-safe-v007/High-Ground-Odyssey-Episode-04-tight-44m36-transcript-upload-safe-v007.srt",
        }
        upload_qc_path.write_text(json.dumps(qc, indent=2) + "\n")

    print(
        json.dumps(
            {
                "status": report["status"],
                "passed": report["passed"],
                "checkCount": report["checkCount"],
                "hardStopCount": report["hardStopCount"],
                "warningCount": report["warningCount"],
                "outputDir": str(output_dir),
                "json": str(json_path),
                "markdown": str(md_path),
            },
            indent=2,
        )
    )
    return 0 if report["passed"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
