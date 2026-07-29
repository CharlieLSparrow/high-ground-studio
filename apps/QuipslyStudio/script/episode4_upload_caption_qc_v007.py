#!/usr/bin/env python3
"""Caption and transcript QC for the Episode 4 v007 upload packet.

This intentionally validates the artifacts Charlie would upload, not the source
timeline or older review folders. It is a calm, narrow production check:

- main and tight long-form SRTs parse
- short captions parse
- cue times are monotonic and bounded by the matching rendered media
- transcript text files exist where expected
- results are written back into the upload packet as JSON and Markdown

It does not publish, upload, mutate source media, or modify rendered MP4/audio
files.
"""

from __future__ import annotations

import argparse
import json
import re
import subprocess
from dataclasses import asdict, dataclass, field
from pathlib import Path
from typing import Any


DEFAULT_READY_DIR = Path(
    "/Volumes/My Passport/Episode_and_Shorts_Test/"
    "Episode_4_Upload_Candidates/READY_TO_UPLOAD_EP4_20260712"
)

TIMESTAMP_RE = re.compile(
    r"(?P<start>\d{2}:\d{2}:\d{2},\d{3})\s+-->\s+"
    r"(?P<end>\d{2}:\d{2}:\d{2},\d{3})"
)


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


def timestamp_to_seconds(value: str) -> float:
    hours, minutes, rest = value.split(":")
    seconds, millis = rest.split(",")
    return (
        int(hours) * 3600
        + int(minutes) * 60
        + int(seconds)
        + int(millis) / 1000.0
    )


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
        index_line = lines[0].strip()
        time_line_index = 1
        try:
            cue_index = int(index_line)
        except ValueError:
            cue_index = len(cues) + 1
            time_line_index = 0
        if time_line_index >= len(lines):
            continue
        match = TIMESTAMP_RE.search(lines[time_line_index])
        if not match:
            continue
        cue_text = " ".join(lines[time_line_index + 1 :]).strip()
        cues.append(
            CaptionCue(
                index=cue_index,
                start=timestamp_to_seconds(match.group("start")),
                end=timestamp_to_seconds(match.group("end")),
                text=cue_text,
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

    if transcript_path is not None:
        if not transcript_path.exists() or transcript_path.stat().st_size <= 0:
            check.warnings.append("transcript text file missing or empty")

    cues = parse_srt(caption_path)
    check.cueCount = len(cues)
    if not cues:
        check.hardStops.append("caption file has no parseable cues")
        check.status = "failed"
        return check

    check.firstCueStartSeconds = cues[0].start
    check.lastCueEndSeconds = cues[-1].end
    check.maxCueDurationSeconds = max(c.end - c.start for c in cues)

    previous_start = -1.0
    previous_end = -1.0
    empty_text_count = 0
    backwards_count = 0
    overlap_count = 0

    for cue in cues:
        if cue.end <= cue.start:
            backwards_count += 1
        if cue.start < previous_start:
            backwards_count += 1
        if cue.start < previous_end - 0.100:
            overlap_count += 1
        if not cue.text:
            empty_text_count += 1
        previous_start = cue.start
        previous_end = max(previous_end, cue.end)

    if backwards_count:
        check.hardStops.append(f"{backwards_count} cue timing order/duration issue(s)")
    if empty_text_count:
        check.hardStops.append(f"{empty_text_count} empty caption cue(s)")
    if overlap_count:
        check.warnings.append(f"{overlap_count} overlapping cue(s)")

    if check.mediaDurationSeconds is not None and check.lastCueEndSeconds is not None:
        if check.lastCueEndSeconds > check.mediaDurationSeconds + 2.0:
            check.hardStops.append(
                "caption end exceeds media duration by more than 2 seconds"
            )
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


def load_short_caption_checks(ready_dir: Path) -> list[CaptionCheck]:
    manifest_path = (
        ready_dir
        / "episode-4-v007-social-shorts"
        / "episode-4-v007-social-shorts-manifest.json"
    )
    if not manifest_path.exists():
        return [
            CaptionCheck(
                id="shorts-manifest",
                mediaPath="",
                captionPath=str(manifest_path),
                hardStops=["shorts manifest missing"],
                status="failed",
            )
        ]
    manifest = json.loads(manifest_path.read_text())
    checks: list[CaptionCheck] = []
    for item in manifest.get("shorts", []):
        checks.append(
            check_caption(
                check_id=f"short-{item.get('index')}-{item.get('short', {}).get('id')}",
                media_path=Path(item["video"]),
                caption_path=Path(item["captions"]),
                transcript_path=Path(item.get("transcript"))
                if item.get("transcript")
                else None,
            )
        )
    return checks


def build_report(ready_dir: Path) -> dict[str, Any]:
    checks = [
        check_caption(
            check_id="main-59m26",
            media_path=ready_dir
            / "High-Ground-Odyssey-Episode-04-main-59m26-video-v007.mp4",
            caption_path=ready_dir
            / "High-Ground-Odyssey-Episode-04-main-59m26-transcript-v007.srt",
            transcript_path=ready_dir
            / "High-Ground-Odyssey-Episode-04-main-59m26-transcript-v007.txt",
        ),
        check_caption(
            check_id="tight-44m36",
            media_path=ready_dir
            / "High-Ground-Odyssey-Episode-04-tight-44m36-video-v007.mp4",
            caption_path=ready_dir
            / "High-Ground-Odyssey-Episode-04-tight-44m36-transcript-v007.srt",
            transcript_path=ready_dir
            / "High-Ground-Odyssey-Episode-04-tight-44m36-transcript-v007.txt",
        ),
    ]
    checks.extend(load_short_caption_checks(ready_dir))

    hard_stop_count = sum(len(c.hardStops) for c in checks)
    warning_count = sum(len(c.warnings) for c in checks)
    passed = hard_stop_count == 0
    return {
        "schema": "quipsly.episode4.caption-qc.v1",
        "readyDir": str(ready_dir),
        "status": "passed" if passed else "failed",
        "passed": passed,
        "checkCount": len(checks),
        "hardStopCount": hard_stop_count,
        "warningCount": warning_count,
        "truth": {
            "externalPublication": "not published by Codex",
            "sourceMedia": "original media was not mutated",
            "speakerLabels": "not included because diarization is not verified",
            "scope": "caption timing and file integrity only, not a human-certified transcript",
        },
        "checks": [asdict(c) for c in checks],
    }


def write_markdown(report: dict[str, Any], path: Path) -> None:
    lines = [
        "# Episode 4 v007 caption and transcript QC",
        "",
        f"Status: `{report['status']}`",
        f"Checks: `{report['checkCount']}`",
        f"Hard stops: `{report['hardStopCount']}`",
        f"Warnings: `{report['warningCount']}`",
        "",
        "Truth:",
        "- This validates caption timing and file integrity for the rendered upload packet.",
        "- It does not certify speaker diarization.",
        "- It does not publish, upload, or mutate original media.",
        "",
        "## Checks",
        "",
    ]
    for check in report["checks"]:
        lines.extend(
            [
                f"### {check['id']}",
                "",
                f"- Status: `{check['status']}`",
                f"- Cues: `{check['cueCount']}`",
                f"- Media duration: `{check['mediaDurationSeconds']}`",
                f"- First cue: `{check['firstCueStartSeconds']}`",
                f"- Last cue: `{check['lastCueEndSeconds']}`",
                f"- Max cue duration: `{check['maxCueDurationSeconds']}`",
                f"- Media: `{check['mediaPath']}`",
                f"- Captions: `{check['captionPath']}`",
            ]
        )
        if check.get("transcriptPath"):
            lines.append(f"- Transcript: `{check['transcriptPath']}`")
        if check["hardStops"]:
            lines.append("- Hard stops:")
            lines.extend(f"  - {item}" for item in check["hardStops"])
        if check["warnings"]:
            lines.append("- Warnings:")
            lines.extend(f"  - {item}" for item in check["warnings"])
        lines.append("")
    path.write_text("\n".join(lines))


def update_upload_qc(ready_dir: Path, report: dict[str, Any], json_path: Path, md_path: Path) -> None:
    qc_path = ready_dir / "episode-4-upload-qc-v007.json"
    if not qc_path.exists():
        return
    qc = json.loads(qc_path.read_text())
    qc["captionTranscriptQc"] = {
        "status": report["status"],
        "passed": report["passed"],
        "checkCount": report["checkCount"],
        "hardStopCount": report["hardStopCount"],
        "warningCount": report["warningCount"],
        "json": json_path.name,
        "markdown": md_path.name,
        "truth": report["truth"],
    }
    qc_path.write_text(json.dumps(qc, indent=2) + "\n")


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--ready-dir", type=Path, default=DEFAULT_READY_DIR)
    args = parser.parse_args()

    ready_dir = args.ready_dir
    report = build_report(ready_dir)
    json_path = ready_dir / "episode-4-caption-qc-v007.json"
    md_path = ready_dir / "EPISODE_4_CAPTION_QC_V007.md"
    json_path.write_text(json.dumps(report, indent=2) + "\n")
    write_markdown(report, md_path)
    update_upload_qc(ready_dir, report, json_path, md_path)

    print(json.dumps({
        "status": report["status"],
        "passed": report["passed"],
        "checkCount": report["checkCount"],
        "hardStopCount": report["hardStopCount"],
        "warningCount": report["warningCount"],
        "json": str(json_path),
        "markdown": str(md_path),
    }, indent=2))
    return 0 if report["passed"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
