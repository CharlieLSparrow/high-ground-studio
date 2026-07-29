#!/usr/bin/env python3
"""Render Episode 4 producer takes from the simplified Sync.prproj alignment.

This is a local, non-mutating production helper. It treats Premiere as sync
evidence only, keeps source media whole, cuts with transparent sequence ranges,
and writes versioned exports plus manifests to the external review drive.
"""
from __future__ import annotations

import argparse
import csv
import json
import math
import os
import re
import shutil
import subprocess
from dataclasses import asdict, dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


TICKS_PER_SECOND = 254_016_000_000
DEFAULT_OUTPUT_ROOT = Path(
    "/Volumes/My Passport/Episode_and_Shorts_Test/Episode_4_Sync_Producer_Takes"
)
BASELINE_VERSION = "v005"
DEFAULT_RUN_NAME = f"20260709-episode4-conformed-audio-baseline-{BASELINE_VERSION}"
SYNC_PROJECT = Path("/Users/wall-e/Desktop/Podcast/4/Sync.prproj")
EXPORT_VERSION = "v008"
BALANCED_AUDIO_NAME = f"episode4-sync-layer-source-aware-mix-{BASELINE_VERSION}.wav"
AUDIO_SYNC_LAYER_DIR_NAME = "sync-layer-audio"
AUDIO_SYNC_LAYER_MODE = f"{BASELINE_VERSION}-asymmetric-clean-homer-preserving-mix"
CONFORMED_BASELINE_DIR_NAME = "conformed-production-baseline"
CONFORMED_BASELINE_ID = f"episode-4-conformed-production-baseline-{BASELINE_VERSION}"
CONFORMED_DIALOGUE_BED_NAME = f"episode4-conformed-dialogue-bed-{BASELINE_VERSION}.wav"
MASTER_AUDIO_SPINE_WAV_NAME = f"episode4-mastered-audio-spine-{BASELINE_VERSION}.wav"
MASTER_AUDIO_SPINE_M4A_NAME = f"episode4-mastered-audio-spine-{BASELINE_VERSION}.m4a"
SPEAKER_GAP_AUTOMATION_NAME = f"speaker-gap-automation-{BASELINE_VERSION}.json"
BASELINE_QUALITY_REPORT_NAME = f"quality-report-{BASELINE_VERSION}.json"
SOURCE_CONTRIBUTION_REPORT_NAME = f"source-contribution-report-{BASELINE_VERSION}.json"
SOURCE_CONTRIBUTION_CSV_NAME = f"source-contribution-windows-{BASELINE_VERSION}.csv"
AUDIO_STAGE_BOARD_NAME = f"audio-spine-stage-board-{BASELINE_VERSION}.json"
AUDIO_STAGE_BOARD_MARKDOWN_NAME = f"audio-spine-stage-board-{BASELINE_VERSION}.md"
BASELINE_PROOF_DIR_NAME = "proof-snippets"
BASELINE_QC_DIR_NAME = "audio-qc"
EPISODE_SEQUENCE_DURATION_SECONDS = 6799.943
MASTER_LOUDNESS_TARGET = {"integratedLufs": -16, "truePeakDb": -1.5, "lra": 11}
MEDIA_PROBE_SUFFIXES = {
    ".aif",
    ".aiff",
    ".flac",
    ".m4a",
    ".mov",
    ".mp3",
    ".mp4",
    ".wav",
}
TIMELINE_CONFORM_FILTER = (
    f"apad=whole_dur={EPISODE_SEQUENCE_DURATION_SECONDS:.3f},"
    f"atrim=0:{EPISODE_SEQUENCE_DURATION_SECONDS:.3f},"
    "asetpts=N/SR/TB"
)

SPEAKER_CONTRIBUTION_PROFILES: dict[str, dict[str, Any]] = {
    "charlie": {
        "purpose": "Keep Charlie speech, laughter, and useful reactions while reducing Homer call echo in Charlie's downspaces.",
        "filter": (
            "aresample=48000,highpass=f=70,lowpass=f=16500,"
            "afftdn=nf=-28,"
            "agate=threshold=0.010:ratio=10:attack=8:release=380:makeup=1,"
            "acompressor=threshold=-20dB:ratio=2:attack=15:release=180"
        ),
        "gapAction": "smooth gate plus strong sidechain ducking under Homer clean mic",
        "editableParameters": {
            "gateThreshold": 0.010,
            "gateRatio": 10,
            "attackMs": 8,
            "releaseMs": 380,
            "sidechainThreshold": 0.006,
            "sidechainRatio": 16,
        },
    },
    "homer": {
        "purpose": "Keep Homer speech, laughter, and useful reactions while reducing park/background noise in Homer downspaces.",
        "filter": (
            "aresample=48000,highpass=f=80,lowpass=f=16000,"
            "afftdn=nf=-22,"
            "agate=threshold=0.004:ratio=2.6:attack=10:release=720:makeup=1,"
            "acompressor=threshold=-23dB:ratio=1.8:attack=18:release=260"
        ),
        "gapAction": "gentle independent cleanup only; Homer clean mic must not be ducked by Charlie's echo-contaminated track",
        "editableParameters": {
            "gateThreshold": 0.004,
            "gateRatio": 2.6,
            "attackMs": 10,
            "releaseMs": 720,
            "sidechainThreshold": None,
            "sidechainRatio": None,
        },
    },
    "reference": {
        "purpose": "Keep the watched clip/reference bed controlled and below dialogue.",
        "filter": "aresample=48000,highpass=f=45,lowpass=f=18000,volume=0.85",
        "gapAction": "no speaker gate; reference audio is explicit source media",
        "editableParameters": {"volume": 0.85},
    },
}


@dataclass(frozen=True)
class Source:
    id: str
    label: str
    role: str
    path: str
    seq_start: float
    seq_end: float
    color_profile: str = "neutral"

    def available(self, sequence_time: float) -> bool:
        return self.seq_start <= sequence_time < self.seq_end and Path(self.path).exists()

    def source_time(self, sequence_time: float) -> float:
        return max(0.0, sequence_time - self.seq_start)


@dataclass(frozen=True)
class AudioSource:
    id: str
    label: str
    path: str
    seq_start: float
    volume: float
    role: str


@dataclass(frozen=True)
class EditRange:
    start: float
    end: float
    reason: str
    bias: str = "balanced"


@dataclass(frozen=True)
class Branch:
    id: str
    title: str
    editorial_approach: str
    intended_platform_use: str
    ranges: tuple[EditRange, ...]
    default_bias: str = "balanced"


@dataclass
class RenderChunk:
    index: int
    branch_id: str
    sequence_start: float
    sequence_end: float
    duration: float
    range_reason: str
    source_id: str
    source_label: str
    source_role: str
    source_path: str
    source_start: float
    cut_reason: str


VIDEO_SOURCES: tuple[Source, ...] = (
    Source(
        "charlie-3749",
        "Charlie camera A - IMG_3749.MOV",
        "charlie_camera",
        "/Users/wall-e/Desktop/Podcast/4/IMG_3749.MOV",
        0.000,
        1219.985,
        "charlie_warm",
    ),
    Source(
        "homer-a",
        "Homer camera A - HomerEp4a.MP4",
        "homer_camera",
        "/Users/wall-e/Desktop/Podcast/4/HomerEp4a.MP4",
        527.127,
        1830.629,
        "homer_clear",
    ),
    Source(
        "charlie-3750",
        "Charlie camera B - IMG_3750.mov",
        "charlie_camera",
        "/Users/wall-e/Desktop/Podcast/4/IMG_3750.mov",
        1906.772,
        3686.516,
        "charlie_warm",
    ),
    Source(
        "homer-b",
        "Homer camera B - HomerEp4.MP4",
        "homer_camera",
        "/Users/wall-e/Desktop/Podcast/4/HomerEp4.MP4",
        1965.530,
        6734.261,
        "homer_clear",
    ),
    Source(
        "reference-artshow",
        "Reference clip - ArtShow.mp4",
        "reference_clip",
        "/Users/wall-e/Desktop/Podcast/4/ArtShow.mp4",
        2676.240,
        2824.121,
        "reference",
    ),
    Source(
        "charlie-3750b",
        "Charlie camera C - IMG_3750b.mov",
        "charlie_camera",
        "/Users/wall-e/Desktop/Podcast/4/IMG_3750b.mov",
        3686.516,
        4185.815,
        "charlie_warm",
    ),
    Source(
        "charlie-3750c",
        "Charlie camera D - IMG_3750c.mov",
        "charlie_camera",
        "/Users/wall-e/Desktop/Podcast/4/IMG_3750c.mov",
        4185.815,
        4367.396,
        "charlie_warm",
    ),
    Source(
        "charlie-3750-3",
        "Charlie camera E - IMG_3750 3.mov",
        "charlie_camera",
        "/Users/wall-e/Desktop/Podcast/4/IMG_3750 3.mov",
        4606.535,
        5559.721,
        "charlie_warm",
    ),
    Source(
        "charlie-3751",
        "Charlie camera F - IMG_3751.MOV",
        "charlie_camera",
        "/Users/wall-e/Desktop/Podcast/4/IMG_3751.MOV",
        5874.802,
        6939.499,
        "charlie_neutral",
    ),
)

AUDIO_SOURCES: tuple[AudioSource, ...] = (
    AudioSource(
        "charlie-clean",
        "Charlie computer audio - Charlie Ep4.wav",
        "/Volumes/My Passport/Episode 4/Charlie Ep4.wav",
        9.243,
        0.42,
        "charlie_audio",
    ),
    AudioSource(
        "homer-dji-005",
        "Homer DJI mic part 1 - TX00_MIC005",
        "/Volumes/My Passport/Episode 4/TX00_MIC005_20260226_070456_orig.wav",
        81.148,
        1.35,
        "homer_audio",
    ),
    AudioSource(
        "homer-dji-006",
        "Homer DJI mic part 2 - TX00_MIC006",
        "/Volumes/My Passport/Episode 4/TX00_MIC006_20260226_073457_orig.wav",
        1881.279,
        1.35,
        "homer_audio",
    ),
    AudioSource(
        "homer-dji-007",
        "Homer DJI mic part 3 - TX00_MIC007",
        "/Volumes/My Passport/Episode 4/TX00_MIC007_20260226_080457_orig.wav",
        3681.411,
        1.35,
        "homer_audio",
    ),
    AudioSource(
        "homer-dji-008",
        "Homer DJI mic part 4 - TX00_MIC008",
        "/Volumes/My Passport/Episode 4/TX00_MIC008_20260226_083457_orig.wav",
        # Camera-scratch correlation proves MIC008 begins 3.47s later than the
        # legacy placement. This is a source boundary, not a global episode nudge.
        5481.543,
        1.35,
        "homer_audio",
    ),
    AudioSource(
        "artshow-audio",
        "Reference clip audio - ArtShow.mp4",
        "/Users/wall-e/Desktop/Podcast/4/ArtShow.mp4",
        2676.240,
        0.55,
        "reference_audio",
    ),
)

# These are transcript-cue windows that indicate clips we do not currently have
# as source media. We cut around them instead of leaving orphaned
# "let's watch this" language in the episode.
MISSING_CLIP_WINDOWS: tuple[tuple[float, float, str], ...] = (
    (1588.0, 1955.0, "Possible earlier watched/WALL-E clip cue; no matching media in Sync.prproj."),
    (2038.0, 2062.0, "Direct mention of right after watching the WALL-E clip; no matching media."),
    (4038.0, 4060.0, "Mentions using a clip to tie the section together; no matching media."),
    (5210.0, 5268.0, "Late 'let's hit the clip / watch this' cue; no matching media."),
)


BRANCHES: tuple[Branch, ...] = (
    Branch(
        id="take-a-main-public",
        title="Episode 4 take A - warm main public cut",
        editorial_approach=(
            "The default publishing candidate: keeps the strongest spine, preserves warmth, "
            "cuts orphaned missing-clip references, and uses reaction inserts without turning "
            "the conversation into a chopped machine."
        ),
        intended_platform_use="Primary YouTube, Spotify video, Apple/Spotify podcast audio candidate.",
        default_bias="balanced",
        ranges=(
            EditRange(670, 1320, "Real intro, thesis, and brother/show context.", "homer"),
            EditRange(1505, 1588, "Creativity Inc bridge before missing clip cue.", "charlie"),
            EditRange(1955, 2550, "Flow, names, sounding-board, and coaching arc.", "balanced"),
            EditRange(2580, 2845, "Michael Scott/Pam art-show setup, clip, and reaction loop.", "reference"),
            EditRange(3295, 3650, "Leadership design and practical story lesson.", "balanced"),
            EditRange(4180, 4580, "Dichotomy of leadership through meetings.", "homer"),
            EditRange(5010, 5210, "Formation/time-wasting example without the missing late clip cue.", "homer"),
            EditRange(5710, 6120, "Camera assistant and report-design section.", "balanced"),
            EditRange(6250, 6470, "Pillow/light story and practical leadership lesson.", "homer"),
            EditRange(6712, 6728, "High Ground signoff.", "balanced"),
        ),
    ),
    Branch(
        id="take-b-teaching-forward",
        title="Episode 4 take B - teaching-forward cut",
        editorial_approach=(
            "A tighter lesson-forward version for viewers who want the useful leadership idea "
            "quickly. It keeps examples and payoff, but trims more wandering setup and preserves "
            "fewer relationship detours."
        ),
        intended_platform_use="Discovery-friendly YouTube cut, newsletter embed, coaching/training reference.",
        default_bias="homer",
        ranges=(
            EditRange(670, 965, "Open on identity and stakes.", "homer"),
            EditRange(1058, 1220, "Workflow/flow thesis with anxiety-boredom channel.", "charlie"),
            EditRange(1505, 1588, "Creativity Inc leadership bridge before missing clip cue.", "charlie"),
            EditRange(1955, 2038, "Flow challenge framing.", "charlie"),
            EditRange(2062, 2350, "Coaching/sounding-board lesson after missing WALL-E mention.", "balanced"),
            EditRange(2580, 2845, "Office art-show clip and reaction loop.", "reference"),
            EditRange(3295, 3465, "Leadership-design wrap.", "homer"),
            EditRange(4180, 4525, "Meetings and dichotomy of leadership.", "homer"),
            EditRange(5010, 5210, "Formation as a concrete leadership example.", "homer"),
            EditRange(5710, 5960, "Camera assistant/report design section.", "balanced"),
            EditRange(6250, 6410, "Pillow/light story core.", "homer"),
            EditRange(6712, 6728, "High Ground signoff.", "balanced"),
        ),
    ),
    Branch(
        id="take-c-warm-extended",
        title="Episode 4 take C - warm extended conversation",
        editorial_approach=(
            "The deeper relationship cut. It keeps more context, more breathing room, and more "
            "brotherly texture while still removing orphaned missing-clip instructions and the "
            "messiest setup."
        ),
        intended_platform_use="Patreon/archive/deep-listener candidate or alternate long podcast feed cut.",
        default_bias="balanced",
        ranges=(
            EditRange(670, 1320, "Full real intro and first thesis arc.", "homer"),
            EditRange(1505, 1588, "Creativity Inc bridge before missing clip cue.", "charlie"),
            EditRange(1955, 2038, "Flow challenge framing.", "charlie"),
            EditRange(2062, 2845, "Full middle arc through Office/Pam art-show loop.", "balanced"),
            EditRange(3295, 4038, "Leadership design plus broader work/time conversation.", "balanced"),
            EditRange(4060, 5210, "Meetings, dichotomy, and formation application sequence.", "homer"),
            EditRange(5268, 5330, "Post-missing-clip transition if it plays cleanly.", "balanced"),
            EditRange(5710, 6120, "Camera assistant/reports/work-design section.", "balanced"),
            EditRange(6250, 6728, "Late story through closing signoff.", "homer"),
        ),
    ),
)


def run(cmd: list[str], *, dry_run: bool = False) -> None:
    print("+", " ".join(cmd))
    if dry_run:
        return
    subprocess.run(cmd, check=True)


def warning_lines_from_stderr(stderr: str) -> list[str]:
    warning_markers = (
        "warning",
        "non-monotonous dts",
        "non-monotonic",
        "invalid",
        "clipping",
        "deprecated",
        "past duration",
        "failed",
        "error",
    )
    lines: list[str] = []
    for raw_line in stderr.splitlines():
        line = raw_line.strip()
        if not line:
            continue
        lowered = line.lower()
        if any(marker in lowered for marker in warning_markers):
            lines.append(line)
    return lines


def run_ffmpeg_diagnostic(
    cmd: list[str],
    *,
    label: str,
    dry_run: bool = False,
    allow_failure: bool = False,
) -> dict[str, Any]:
    print("+", " ".join(cmd))
    diagnostic: dict[str, Any] = {
        "label": label,
        "command": cmd,
        "dryRun": dry_run,
        "returnCode": 0,
        "failed": False,
        "warningCount": 0,
        "warnings": [],
        "stderrTail": [],
    }
    if dry_run:
        return diagnostic
    result = subprocess.run(cmd, check=False, capture_output=True, text=True)
    warnings = warning_lines_from_stderr(result.stderr)
    diagnostic["returnCode"] = result.returncode
    diagnostic["failed"] = result.returncode != 0
    diagnostic["warningCount"] = len(warnings)
    diagnostic["warnings"] = warnings[:80]
    diagnostic["stderrTail"] = result.stderr.splitlines()[-20:]
    if result.returncode != 0:
        failure_line = f"ffmpeg exited with status {result.returncode}"
        diagnostic["warnings"] = [failure_line, *diagnostic["warnings"]]
        diagnostic["warningCount"] = int(diagnostic["warningCount"]) + 1
    if warnings:
        print(f"! ffmpeg diagnostics for {label}: {len(warnings)} warning line(s)")
        for line in warnings[:8]:
            print("! ", line)
    if result.returncode != 0 and not allow_failure:
        raise subprocess.CalledProcessError(
            result.returncode,
            cmd,
            output=result.stdout,
            stderr=result.stderr,
        )
    return diagnostic


def ffprobe(path: Path) -> dict[str, Any]:
    result = subprocess.run(
        [
            "ffprobe",
            "-v",
            "error",
            "-print_format",
            "json",
            "-show_format",
            "-show_streams",
            str(path),
        ],
        check=True,
        capture_output=True,
        text=True,
    )
    data = json.loads(result.stdout)
    streams = data.get("streams", [])
    video = next((s for s in streams if s.get("codec_type") == "video"), {})
    audio = next((s for s in streams if s.get("codec_type") == "audio"), {})
    fmt = data.get("format", {})
    return {
        "path": str(path),
        "exists": path.exists(),
        "sizeBytes": path.stat().st_size if path.exists() else 0,
        "durationSeconds": float(fmt.get("duration", 0) or 0),
        "durationMinutes": round(float(fmt.get("duration", 0) or 0) / 60, 2),
        "width": video.get("width"),
        "height": video.get("height"),
        "videoCodec": video.get("codec_name"),
        "audioCodec": audio.get("codec_name"),
        "audioChannels": audio.get("channels"),
    }


def run_capture(cmd: list[str], *, dry_run: bool = False) -> subprocess.CompletedProcess[str] | None:
    print("+", " ".join(cmd))
    if dry_run:
        return None
    return subprocess.run(cmd, check=True, capture_output=True, text=True)


def parse_ffmpeg_metric(pattern: str, text: str) -> float | None:
    match = re.search(pattern, text)
    if not match:
        return None
    try:
        return float(match.group(1))
    except ValueError:
        return None


def conforming_filter(base_filter: str) -> str:
    return f"{base_filter},{TIMELINE_CONFORM_FILTER}" if base_filter else TIMELINE_CONFORM_FILTER


def audio_quality_report(path: Path, *, expected_duration: float | None, dry_run: bool) -> dict[str, Any]:
    probe = ffprobe(path) if path.exists() and not dry_run else {}
    report: dict[str, Any] = {
        "path": str(path),
        "probe": probe,
        "expectedDurationSeconds": expected_duration,
        "durationDeltaSeconds": None,
        "durationMatchesExpected": None,
        "volumedetect": {},
        "silenceGaps": {"count": 0, "sample": []},
        "warnings": [],
    }
    if not path.exists() or dry_run:
        report["warnings"].append("Quality report skipped because output does not exist yet.")
        return report

    duration = float(probe.get("durationSeconds", 0) or 0)
    if expected_duration is not None:
        delta = abs(duration - expected_duration)
        report["durationDeltaSeconds"] = round(delta, 3)
        report["durationMatchesExpected"] = delta < 0.75
        if delta >= 0.75:
            report["warnings"].append(f"Duration differs from expected timeline by {delta:.3f}s.")
    if probe.get("audioChannels") != 2:
        report["warnings"].append("Expected stereo output.")

    cmd = [
        "ffmpeg",
        "-hide_banner",
        "-nostats",
        "-i",
        str(path),
        "-af",
        "volumedetect,silencedetect=n=-45dB:d=1.2",
        "-f",
        "null",
        "-",
    ]
    result = run_capture(cmd, dry_run=dry_run)
    stderr = result.stderr if result else ""
    mean_volume = parse_ffmpeg_metric(r"mean_volume:\s*(-?\d+(?:\.\d+)?) dB", stderr)
    max_volume = parse_ffmpeg_metric(r"max_volume:\s*(-?\d+(?:\.\d+)?) dB", stderr)
    report["volumedetect"] = {
        "meanVolumeDb": mean_volume,
        "maxVolumeDb": max_volume,
    }
    if max_volume is not None and max_volume > -0.2:
        report["warnings"].append("Peak is very close to clipping; review limiter/master settings.")

    silence_starts = [float(item) for item in re.findall(r"silence_start:\s*([0-9.]+)", stderr)]
    silence_ends = [float(item) for item in re.findall(r"silence_end:\s*([0-9.]+)", stderr)]
    gaps = []
    for start, end in zip(silence_starts, silence_ends):
        gaps.append({"start": round(start, 3), "end": round(end, 3), "duration": round(end - start, 3)})
    report["silenceGaps"] = {"count": len(gaps), "sample": gaps[:80]}
    return report


def audio_window_metric(path: Path, *, start: float, duration: float, dry_run: bool) -> dict[str, Any]:
    metric: dict[str, Any] = {
        "path": str(path),
        "startSeconds": round(start, 3),
        "durationSeconds": round(duration, 3),
        "meanVolumeDb": None,
        "maxVolumeDb": None,
        "warnings": [],
    }
    if dry_run or not path.exists():
        metric["warnings"].append("Window metric skipped because file does not exist yet.")
        return metric
    result = run_capture(
        [
            "ffmpeg",
            "-hide_banner",
            "-nostats",
            "-ss",
            f"{start:.3f}",
            "-t",
            f"{duration:.3f}",
            "-i",
            str(path),
            "-af",
            "volumedetect",
            "-f",
            "null",
            "-",
        ],
        dry_run=dry_run,
    )
    stderr = result.stderr if result else ""
    metric["meanVolumeDb"] = parse_ffmpeg_metric(r"mean_volume:\s*(-?\d+(?:\.\d+)?) dB", stderr)
    metric["maxVolumeDb"] = parse_ffmpeg_metric(r"max_volume:\s*(-?\d+(?:\.\d+)?) dB", stderr)
    return metric


def create_waveform_image(input_path: Path, output_path: Path, *, dry_run: bool) -> Path:
    if output_path.exists():
        return output_path
    output_path.parent.mkdir(parents=True, exist_ok=True)
    cmd = [
        "ffmpeg",
        "-hide_banner",
        "-y",
        "-i",
        str(input_path),
        "-filter_complex",
        "showwavespic=s=2400x320:split_channels=0:colors=0x83c5be",
        "-frames:v",
        "1",
        "-update",
        "1",
        str(output_path),
    ]
    run(cmd, dry_run=dry_run)
    return output_path


def create_speaker_split_proof(
    baseline_dir: Path,
    stems: dict[str, Path],
    *,
    start: float,
    duration: float,
    dry_run: bool,
) -> Path:
    proof_path = baseline_dir / BASELINE_PROOF_DIR_NAME / f"speaker-split-charlie-left-homer-right-{int(start)}s.m4a"
    if proof_path.exists():
        return proof_path
    proof_path.parent.mkdir(parents=True, exist_ok=True)
    cmd = [
        "ffmpeg",
        "-hide_banner",
        "-y",
        "-ss",
        f"{start:.3f}",
        "-i",
        str(stems["charlieContribution"]),
        "-ss",
        f"{start:.3f}",
        "-i",
        str(stems["homerContribution"]),
        "-t",
        f"{duration:.3f}",
        "-filter_complex",
        (
            "[0:a]pan=mono|c0=0.5*c0+0.5*c1[charlie];"
            "[1:a]pan=mono|c0=0.5*c0+0.5*c1[homer];"
            "[charlie][homer]amerge=inputs=2,"
            "acompressor=threshold=-18dB:ratio=2:attack=15:release=180[outa]"
        ),
        "-map",
        "[outa]",
        "-c:a",
        "aac",
        "-b:a",
        "192k",
        str(proof_path),
    ]
    run(cmd, dry_run=dry_run)
    return proof_path


def create_source_contribution_report(
    baseline_dir: Path,
    source_aware_mix: Path,
    stems: dict[str, Path],
    master_wav: Path,
    proof_windows: list[tuple[float, float, str]],
    *,
    dry_run: bool,
) -> dict[str, Any]:
    qc_dir = baseline_dir / BASELINE_QC_DIR_NAME
    qc_dir.mkdir(parents=True, exist_ok=True)
    files = {
        "charlieAligned": stems["charlieAligned"],
        "homerDjiAligned": stems["homerDjiAligned"],
        "charlieContribution": stems["charlieContribution"],
        "homerContribution": stems["homerContribution"],
        "sourceAwareMix": source_aware_mix,
        "masterSpine": master_wav,
    }
    file_reports: dict[str, Any] = {}
    waveform_paths: dict[str, str] = {}
    for name, path in files.items():
        file_reports[name] = audio_quality_report(
            path,
            expected_duration=EPISODE_SEQUENCE_DURATION_SECONDS,
            dry_run=dry_run,
        )
        waveform_path = qc_dir / f"{name}-waveform-{BASELINE_VERSION}.png"
        create_waveform_image(path, waveform_path, dry_run=dry_run)
        waveform_paths[name] = str(waveform_path)

    proof_metrics: list[dict[str, Any]] = []
    warnings: list[str] = []
    for start, duration, label in proof_windows:
        metrics = {
            name: audio_window_metric(path, start=start, duration=duration, dry_run=dry_run)
            for name, path in files.items()
        }
        def mean(name: str) -> float | None:
            value = metrics[name].get("meanVolumeDb")
            return float(value) if value is not None else None

        charlie_aligned = mean("charlieAligned")
        homer_aligned = mean("homerDjiAligned")
        charlie_contribution = mean("charlieContribution")
        homer_contribution = mean("homerContribution")
        master = mean("masterSpine")
        window_warnings: list[str] = []
        if homer_aligned is not None and homer_contribution is not None:
            if homer_aligned > -52 and homer_contribution < homer_aligned - 12:
                window_warnings.append(
                    "Homer aligned audio appears active, but Homer contribution is more than 12 dB lower; review for over-gating."
                )
        if charlie_aligned is not None and charlie_contribution is not None:
            if charlie_aligned > -52 and charlie_contribution < charlie_aligned - 12:
                window_warnings.append(
                    "Charlie aligned audio appears active, but Charlie contribution is more than 12 dB lower; review for over-gating."
                )
        if master is not None and max(
            charlie_aligned if charlie_aligned is not None else -120,
            homer_aligned if homer_aligned is not None else -120,
        ) > -45 and master < -45:
            window_warnings.append(
                "A speaker stem is active but the mastered spine is quiet; review mix routing."
            )
        warnings.extend([f"{label}: {warning}" for warning in window_warnings])
        proof_metrics.append(
            {
                "label": label,
                "sequenceStartSeconds": start,
                "durationSeconds": duration,
                "metrics": metrics,
                "warnings": window_warnings,
            }
        )

    csv_path = baseline_dir / SOURCE_CONTRIBUTION_CSV_NAME
    with csv_path.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.writer(handle)
        writer.writerow(["label", "startSeconds", "file", "meanVolumeDb", "maxVolumeDb", "warnings"])
        for window in proof_metrics:
            for name, metric in window["metrics"].items():
                writer.writerow(
                    [
                        window["label"],
                        window["sequenceStartSeconds"],
                        name,
                        metric.get("meanVolumeDb"),
                        metric.get("maxVolumeDb"),
                        "; ".join(metric.get("warnings", [])),
                    ]
                )

    report = {
        "schema": "quipsly.episode4.audio-source-contribution-qc.v1",
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "baselineId": CONFORMED_BASELINE_ID,
        "purpose": (
            "Prove each production source is present and appropriately treated before a mastered "
            "spine is trusted for edit branches or Premiere handoff."
        ),
        "truth": {
            "originalMediaMutated": False,
            "checksDerivedArtifactsOnly": True,
            "homerCleanMicProtected": True,
            "charlieEchoTrackCannotDuckHomer": True,
        },
        "files": {name: str(path) for name, path in files.items()},
        "waveforms": waveform_paths,
        "fileReports": file_reports,
        "proofWindowMetrics": proof_metrics,
        "warnings": warnings,
        "csvPath": str(csv_path),
        "nextSafestAction": (
            "Use the normal stereo mastered WAV for Premiere and Quipsly edits. "
            "Use speaker-split proofs only when diagnosing whether Charlie/Homer contribution stems are present."
        ),
    }
    report_path = baseline_dir / SOURCE_CONTRIBUTION_REPORT_NAME
    markdown_path = baseline_dir / SOURCE_CONTRIBUTION_REPORT_NAME.replace(".json", ".md")
    markdown_lines = [
        "# Episode 4 audio source contribution QC",
        "",
        f"- Baseline: `{CONFORMED_BASELINE_ID}`",
        f"- Report: `{report_path}`",
        f"- CSV: `{csv_path}`",
        "- Truth: originals untouched; this inspects aligned stems, contribution stems, mix, and master.",
        "- Rule: Homer clean mic is protected; Charlie's echo-contaminated track does not duck Homer.",
        "- Handoff: the mastered WAV is normal stereo. Speaker-split files are QC diagnostics only.",
        "",
        "## Waveforms",
        "",
        *[f"- `{name}`: `{path}`" for name, path in waveform_paths.items()],
        "",
        "## Proof windows",
        "",
        "| Window | Charlie aligned | Homer aligned | Charlie contribution | Homer contribution | Master | Warnings |",
        "|---|---:|---:|---:|---:|---:|---|",
    ]
    for window in proof_metrics:
        def fmt(name: str) -> str:
            value = window["metrics"][name].get("meanVolumeDb")
            return "n/a" if value is None else f"{value:.1f} dB"

        markdown_lines.append(
            "| "
            + " | ".join(
                [
                    f"{window['label']} @ {window['sequenceStartSeconds']:.0f}s",
                    fmt("charlieAligned"),
                    fmt("homerDjiAligned"),
                    fmt("charlieContribution"),
                    fmt("homerContribution"),
                    fmt("masterSpine"),
                    "; ".join(window["warnings"]) or "none",
                ]
            )
            + " |"
        )
    markdown_lines.extend(["", "## Warnings", ""])
    markdown_lines.extend([f"- {warning}" for warning in warnings] or ["- none"])
    markdown_path.write_text("\n".join(markdown_lines) + "\n", encoding="utf-8")
    report["markdownPath"] = str(markdown_path)
    report_path.write_text(json.dumps(report, indent=2, sort_keys=True), encoding="utf-8")
    return report


def create_audio_spine_stage_board(
    baseline_dir: Path,
    source_aware_mix: Path,
    stems: dict[str, Path],
    dialogue_bed: Path,
    master_wav: Path,
    master_m4a: Path,
    automation_path: Path,
    quality_report: dict[str, Any],
    source_contribution_report: dict[str, Any],
    proof_snippets: list[dict[str, Any]],
) -> dict[str, Any]:
    """Write a human/Codex-visible map of the Episode 4 audio spine pipeline."""

    def artifact(path: Path, role: str, *, handoff: bool = False, diagnostic_only: bool = False) -> dict[str, Any]:
        probe_media = path.suffix.lower() in MEDIA_PROBE_SUFFIXES
        return {
            "path": str(path),
            "role": role,
            "exists": path.exists(),
            "handoff": handoff,
            "diagnosticOnly": diagnostic_only,
            "probe": ffprobe(path) if path.exists() and probe_media else {},
            "probeSkipped": path.exists() and not probe_media,
        }

    stages = [
        {
            "id": "raw-source-layer",
            "name": "Raw source layer",
            "question": "Do the original Charlie, Homer, and reference sources exist without being mutated?",
            "rule": "Original media remains untouched; only derived aligned stems are processed.",
            "artifacts": [asdict(source) for source in AUDIO_SOURCES],
        },
        {
            "id": "sync-layer",
            "name": "Sync layer",
            "question": "Do aligned stems preserve the Episode 4 sequence timeline before cleanup?",
            "rule": "Sync fixes timing. It does not decide the edit and does not destructively alter sources.",
            "artifacts": [
                artifact(stems["charlieAligned"], "Charlie aligned production stem"),
                artifact(stems["homerDjiAligned"], "Homer DJI aligned production stem"),
                artifact(stems["referenceAligned"], "Reference clip aligned stem"),
            ],
        },
        {
            "id": "speaker-activity-layer",
            "name": "Speaker activity and bleed management",
            "question": "Did automation keep real speech, laughter, and reactions while ducking non-contributing noise?",
            "rule": "Automation is metadata-backed and reversible; no source lengths are changed.",
            "artifacts": [
                artifact(stems["charlieContribution"], "Charlie contribution-gated derived stem"),
                artifact(stems["homerContribution"], "Homer contribution-gated derived stem"),
                artifact(automation_path, "speaker gap automation metadata"),
            ],
        },
        {
            "id": "source-aware-mix",
            "name": "Source-aware mix",
            "question": "Are Charlie, Homer, and reference audio present before final mastering?",
            "rule": "This is the main routing checkpoint when somebody disappears from the final spine.",
            "artifacts": [artifact(source_aware_mix, "pre-master source-aware contribution mix")],
        },
        {
            "id": "conformed-dialogue-bed",
            "name": "Conformed dialogue bed",
            "question": "Did EQ/compression preserve duration and avoid pre-master clipping?",
            "rule": "v005 reduces pre-filter gain before EQ so filter stages do not clip internally.",
            "artifacts": [artifact(dialogue_bed, "conformed full-length dialogue bed")],
        },
        {
            "id": "mastered-spine",
            "name": "Mastered stereo spine",
            "question": "Is the handoff file a normal stereo WAV that Charlie can drop into Premiere?",
            "rule": "This is the handoff artifact. Speaker-split files are QC only, not deliverables.",
            "artifacts": [
                artifact(master_wav, "normal stereo WAV handoff for Premiere and Quipsly", handoff=True),
                artifact(master_m4a, "compressed listening/delivery copy"),
            ],
        },
        {
            "id": "proof-and-reports",
            "name": "Proof snippets and QC reports",
            "question": "Can a human or Codex locate the stage that caused an audible problem?",
            "rule": "Proofs compare raw aligned, source-aware, final master, and diagnostic speaker split windows.",
            "artifacts": [
                artifact(baseline_dir / BASELINE_QUALITY_REPORT_NAME, "final spine quality report"),
                artifact(baseline_dir / SOURCE_CONTRIBUTION_REPORT_NAME, "source contribution QC report"),
                *[
                    {
                        "path": item["speakerSplitCharlieLeftHomerRight"],
                        "role": f"diagnostic speaker split proof for {item['label']}",
                        "exists": Path(item["speakerSplitCharlieLeftHomerRight"]).exists(),
                        "handoff": False,
                        "diagnosticOnly": True,
                    }
                    for item in proof_snippets
                ],
            ],
        },
    ]
    board = {
        "schema": "quipsly.episode-audio-spine-stage-board.v1",
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "baselineId": CONFORMED_BASELINE_ID,
        "episode": "high-ground-odyssey-episode-4",
        "premiereHandoff": str(master_wav),
        "handoffRule": "Use the normal stereo mastered WAV for Premiere and Quipsly. Speaker-split proof files are diagnostics only.",
        "qualitySummary": {
            "durationMatchesExpected": quality_report.get("durationMatchesExpected"),
            "durationDeltaSeconds": quality_report.get("durationDeltaSeconds"),
            "warnings": [
                *quality_report.get("warnings", []),
                *source_contribution_report.get("warnings", []),
            ],
            "meanVolumeDb": quality_report.get("volumedetect", {}).get("meanVolumeDb"),
            "maxVolumeDb": quality_report.get("volumedetect", {}).get("maxVolumeDb"),
            "sourceContributionWarningCount": len(source_contribution_report.get("warnings", [])),
        },
        "stages": stages,
        "nextSafestAction": "Listen to the mastered stereo WAV in Premiere, then inspect this board if a voice, echo, or clipping issue appears.",
    }
    board_path = baseline_dir / AUDIO_STAGE_BOARD_NAME
    markdown_path = baseline_dir / AUDIO_STAGE_BOARD_MARKDOWN_NAME
    lines = [
        "# Episode 4 audio spine stage board",
        "",
        f"- Baseline: `{CONFORMED_BASELINE_ID}`",
        f"- Premiere/Quipsly handoff: `{master_wav}`",
        "- Handoff rule: use the normal stereo mastered WAV. Speaker-split proofs are diagnostics only.",
        "",
        "## Stage receipts",
        "",
    ]
    for stage in stages:
        lines.extend(
            [
                f"### {stage['name']}",
                "",
                f"- Question: {stage['question']}",
                f"- Rule: {stage['rule']}",
                "",
            ]
        )
        for item in stage["artifacts"]:
            if "path" not in item:
                if "label" in item:
                    lines.append(f"- `{item['label']}`")
                continue
            suffix = []
            if item.get("handoff"):
                suffix.append("handoff")
            if item.get("diagnosticOnly"):
                suffix.append("diagnostic only")
            suffix_text = f" ({', '.join(suffix)})" if suffix else ""
            lines.append(f"- `{item['role']}`: `{item['path']}`{suffix_text}")
        lines.append("")
    markdown_path.write_text("\n".join(lines), encoding="utf-8")
    board["markdownPath"] = str(markdown_path)
    board["path"] = str(board_path)
    board_path.write_text(json.dumps(board, indent=2, sort_keys=True), encoding="utf-8")
    return board


def create_speaker_contribution_stem(
    sync_layer_dir: Path,
    input_path: Path,
    output_name: str,
    profile_name: str,
    *,
    dry_run: bool,
) -> Path:
    output_path = sync_layer_dir / output_name
    if output_path.exists():
        return output_path
    profile = SPEAKER_CONTRIBUTION_PROFILES[profile_name]
    cmd = [
        "ffmpeg",
        "-hide_banner",
        "-y",
        "-i",
        str(input_path),
        "-af",
        conforming_filter(profile["filter"]),
        "-ar",
        "48000",
        "-ac",
        "2",
        str(output_path),
    ]
    run(cmd, dry_run=dry_run)
    return output_path


def create_raw_aligned_proof(
    baseline_dir: Path,
    stems: dict[str, Path],
    *,
    start: float,
    duration: float,
    dry_run: bool,
) -> Path:
    proof_path = baseline_dir / BASELINE_PROOF_DIR_NAME / f"raw-aligned-proof-{int(start)}s.m4a"
    if proof_path.exists():
        return proof_path
    proof_path.parent.mkdir(parents=True, exist_ok=True)
    cmd = [
        "ffmpeg",
        "-hide_banner",
        "-y",
        "-ss",
        f"{start:.3f}",
        "-i",
        str(stems["charlieAligned"]),
        "-ss",
        f"{start:.3f}",
        "-i",
        str(stems["homerDjiAligned"]),
        "-ss",
        f"{start:.3f}",
        "-i",
        str(stems["referenceAligned"]),
        "-t",
        f"{duration:.3f}",
        "-filter_complex",
        "[0:a][1:a][2:a]amix=inputs=3:duration=first:dropout_transition=0,"
        "acompressor=threshold=-18dB:ratio=2:attack=15:release=180[outa]",
        "-map",
        "[outa]",
        "-c:a",
        "aac",
        "-b:a",
        "192k",
        str(proof_path),
    ]
    run(cmd, dry_run=dry_run)
    return proof_path


def create_audio_proof_snippet(
    input_path: Path,
    output_path: Path,
    *,
    start: float,
    duration: float,
    dry_run: bool,
) -> Path:
    if output_path.exists():
        return output_path
    output_path.parent.mkdir(parents=True, exist_ok=True)
    cmd = [
        "ffmpeg",
        "-hide_banner",
        "-y",
        "-ss",
        f"{start:.3f}",
        "-i",
        str(input_path),
        "-t",
        f"{duration:.3f}",
        "-c:a",
        "aac",
        "-b:a",
        "192k",
        str(output_path),
    ]
    run(cmd, dry_run=dry_run)
    return output_path


def write_speaker_gap_automation(
    baseline_dir: Path,
    stems: dict[str, Path],
    *,
    dry_run: bool,
) -> Path:
    automation_path = baseline_dir / SPEAKER_GAP_AUTOMATION_NAME
    automation = {
        "schema": "quipsly.episode4.speaker-gap-automation.v1",
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "baselineId": CONFORMED_BASELINE_ID,
        "expectedTimelineDurationSeconds": EPISODE_SEQUENCE_DURATION_SECONDS,
        "mode": "derived-stem-contribution-gating-plus-asymmetric-homer-preserving-ducking",
        "originalMediaMutated": False,
        "timelinePreserved": True,
        "purpose": (
            "Keep speech, laughter, and useful reactions while reducing non-contributing "
            "phone-call echo, mic bleed, park noise, background voices, handling noise, and silence."
        ),
        "profiles": SPEAKER_CONTRIBUTION_PROFILES,
        "stems": {
            name: {
                "path": str(path),
                "probe": ffprobe(path) if path.exists() and not dry_run else {},
            }
            for name, path in stems.items()
        },
        "mixAutomation": {
            "charlieUnderHomer": {
                "method": "sidechaincompress",
                "key": "homerContribution",
                "threshold": 0.006,
                "ratio": 16,
                "attackMs": 6,
                "releaseMs": 300,
                "intent": "Remove distracting Homer echo from Charlie Ep4.wav whenever Homer clean mic is contributing.",
            },
            "homerProtection": {
                "method": "independent gentle gate plus denoise only",
                "key": None,
                "intent": (
                    "Do not duck Homer with Charlie Ep4.wav because Charlie's track contains Homer phone-call echo. "
                    "Homer's clean DJI track remains a primary production source."
                ),
            },
        },
        "automationSummary": {
            "scope": "branch-independent conformed production baseline",
            "appliesTo": "derived aligned stems only",
            "preservesSync": True,
            "inheritsIntoEditBranches": True,
            "primaryProblems": [
                "Charlie track carrying Homer phone-call echo during Charlie downspaces",
                "Homer DJI tracks carrying park/background noise during Homer downspaces",
                "mic bleed and non-contributing handling/background noise",
            ],
            "protectedSignals": [
                "speech",
                "laughter",
                "useful reactions",
                "natural overlap/double-talk",
            ],
        },
        "adjustmentNotes": [
            "Raise gate thresholds if echo/noise remains in downspaces.",
            "Lower gate thresholds or lengthen release if laughter/reactions feel clipped.",
            "Reduce sidechain ratios if overlap sounds unnaturally hollow.",
            "If Homer sounds missing, inspect the source-contribution report before changing any edit branch.",
            "This is metadata-driven treatment on derived stems; originals remain evidence.",
            ],
    }
    automation_path.write_text(json.dumps(automation, indent=2, sort_keys=True), encoding="utf-8")
    return automation_path


def video_filter(source: Source) -> str:
    base = "scale=1920:1080:force_original_aspect_ratio=increase,crop=1920:1080,setsar=1"
    if source.color_profile == "charlie_warm":
        return f"{base},eq=contrast=1.07:saturation=1.05:brightness=0.012"
    if source.color_profile == "charlie_neutral":
        return f"{base},eq=contrast=1.04:saturation=1.03:brightness=0.006"
    if source.color_profile == "homer_clear":
        return f"{base},eq=contrast=1.04:saturation=1.04:brightness=0.004"
    return base


def create_aligned_audio_stem(
    sync_layer_dir: Path,
    stem_name: str,
    sources: list[AudioSource],
    *,
    dry_run: bool,
) -> Path:
    stem_path = sync_layer_dir / f"{stem_name}.wav"
    if stem_path.exists():
        return stem_path
    if not sources:
        raise RuntimeError(f"No audio sources found for stem: {stem_name}")

    cmd = ["ffmpeg", "-hide_banner", "-y"]
    for source in sources:
        cmd.extend(["-i", source.path])

    filter_parts: list[str] = []
    mix_inputs: list[str] = []
    for index, source in enumerate(sources):
        delay_ms = max(0, int(round(source.seq_start * 1000)))
        filter_parts.append(
            f"[{index}:a]aresample=48000,volume={source.volume},adelay={delay_ms}:all=1[a{index}]"
        )
        mix_inputs.append(f"[a{index}]")

    if len(mix_inputs) == 1:
        filter_parts.append(f"{mix_inputs[0]}anull,{TIMELINE_CONFORM_FILTER}[outa]")
    else:
        filter_parts.append(
            "".join(mix_inputs)
            + f"amix=inputs={len(mix_inputs)}:duration=longest:dropout_transition=0,{TIMELINE_CONFORM_FILTER}[outa]"
        )

    cmd.extend(
        [
            "-filter_complex",
            ";".join(filter_parts),
            "-map",
            "[outa]",
            "-ar",
            "48000",
            "-ac",
            "2",
            str(stem_path),
        ]
    )
    run(cmd, dry_run=dry_run)
    return stem_path


def write_audio_sync_layer_manifest(
    sync_layer_dir: Path,
    balanced_audio_path: Path,
    stems: dict[str, Path],
    *,
    dry_run: bool,
) -> None:
    manifest = {
        "schema": "quipsly.episode4.audio-sync-layer.v1",
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "mode": AUDIO_SYNC_LAYER_MODE,
        "truth": {
            "syncProjectUsedAsEvidence": str(SYNC_PROJECT),
            "branchIndependent": True,
            "originalMediaMutated": False,
            "purpose": (
                "Create one cleaned synchronized audio bed before story/edit branches. "
                "Charlie bleed is ducked when Homer's clean DJI mic is carrying speech."
            ),
        },
        "stems": {
            name: {
                "path": str(path),
                "probe": ffprobe(path) if path.exists() and not dry_run else {},
            }
            for name, path in stems.items()
        },
        "balancedMix": {
            "path": str(balanced_audio_path),
            "probe": ffprobe(balanced_audio_path) if balanced_audio_path.exists() and not dry_run else {},
        },
        "settings": {
            "speakerContributionGating": {
                "method": "ffmpeg afftdn + agate on duplicated aligned stems",
                "profiles": SPEAKER_CONTRIBUTION_PROFILES,
                "note": (
                    "This reduces non-contributing gaps on derived stems while preserving "
                    "timeline length and keeping originals untouched."
                ),
            },
            "asymmetricBleedSuppression": {
                "method": "ffmpeg sidechaincompress",
                "charlieKeyedByHomer": {
                    "sidechainKey": "homer-dji-contribution-gated",
                    "threshold": 0.006,
                    "ratio": 16,
                    "attackMs": 6,
                    "releaseMs": 300,
                },
                "note": (
                    "This is not destructive timeline cutting. Only Charlie's echo-contaminated "
                    "track is ducked under Homer. Homer is cleaned independently so Charlie's "
                    "phone-call echo cannot erase Homer's clean mic."
                ),
            },
            "mixBus": {
                "compressor": "threshold=-18dB ratio=2.5 attack=20 release=250",
                "loudness": "loudnorm I=-16 TP=-1.5 LRA=11",
            },
        },
        "sources": [asdict(source) for source in AUDIO_SOURCES],
    }
    (sync_layer_dir / "manifest.json").write_text(
        json.dumps(manifest, indent=2, sort_keys=True),
        encoding="utf-8",
    )
    (sync_layer_dir / "README.md").write_text(
        "\n".join(
            [
                "# Episode 4 audio sync layer",
                "",
                "This folder is intentionally branch-independent. It belongs to the synced episode spine, not any individual producer take.",
                "",
                f"- Mode: `{AUDIO_SYNC_LAYER_MODE}`",
                f"- Balanced mix: `{balanced_audio_path}`",
                "- Charlie and Homer aligned stems are duplicated into contribution-gated stems before mixing.",
                "- Charlie is strongly ducked under Homer contribution to reduce phone-call echo in Charlie's gaps.",
                "- Homer is not ducked by Charlie's track because Charlie's track contains Homer echo.",
                "- Originals are not mutated. Stems and mix are derived working artifacts.",
                "- Future producer takes should reuse this mix unless the sync layer itself changes.",
                "",
            ]
        ),
        encoding="utf-8",
    )


def create_balanced_audio(work_dir: Path, *, dry_run: bool) -> Path:
    audio_path = work_dir / BALANCED_AUDIO_NAME
    if audio_path.exists():
        return audio_path

    work_dir.mkdir(parents=True, exist_ok=True)
    sync_layer_dir = work_dir / AUDIO_SYNC_LAYER_DIR_NAME
    sync_layer_dir.mkdir(parents=True, exist_ok=True)
    present_sources = [source for source in AUDIO_SOURCES if Path(source.path).exists()]
    if not present_sources:
        raise RuntimeError("No audio sources found for Episode 4.")

    charlie_stem = create_aligned_audio_stem(
        sync_layer_dir,
        "charlie-aligned",
        [source for source in present_sources if source.role == "charlie_audio"],
        dry_run=dry_run,
    )
    homer_stem = create_aligned_audio_stem(
        sync_layer_dir,
        "homer-dji-aligned",
        [source for source in present_sources if source.role == "homer_audio"],
        dry_run=dry_run,
    )
    reference_stem = create_aligned_audio_stem(
        sync_layer_dir,
        "reference-aligned",
        [source for source in present_sources if source.role == "reference_audio"],
        dry_run=dry_run,
    )
    charlie_contribution = create_speaker_contribution_stem(
        sync_layer_dir,
        charlie_stem,
        "charlie-contribution-gated.wav",
        "charlie",
        dry_run=dry_run,
    )
    homer_contribution = create_speaker_contribution_stem(
        sync_layer_dir,
        homer_stem,
        "homer-dji-contribution-gated.wav",
        "homer",
        dry_run=dry_run,
    )
    reference_contribution = create_speaker_contribution_stem(
        sync_layer_dir,
        reference_stem,
        "reference-contribution-controlled.wav",
        "reference",
        dry_run=dry_run,
    )

    cmd = [
        "ffmpeg",
        "-hide_banner",
        "-y",
        "-i",
        str(charlie_contribution),
        "-i",
        str(homer_contribution),
        "-i",
        str(reference_contribution),
        "-filter_complex",
        (
            "[0:a][1:a]"
            "sidechaincompress=threshold=0.006:ratio=16:attack=6:release=300:makeup=1"
            "[charlie_ducked];"
            "[charlie_ducked]volume=0.92[charlie_clean];"
            "[1:a]volume=1.45[homer_clean];"
            "[2:a]volume=0.65[reference_clean];"
            "[charlie_clean][homer_clean][reference_clean]"
            "amix=inputs=3:duration=longest:dropout_transition=0,"
            "acompressor=threshold=-18dB:ratio=2.5:attack=20:release=250,"
            "loudnorm=I=-16:TP=-1.5:LRA=11[outa]"
        ),
        "-map",
        "[outa]",
        "-ar",
        "48000",
        "-ac",
        "2",
        str(audio_path),
    ]
    run(cmd, dry_run=dry_run)
    stems = {
        "charlieAligned": charlie_stem,
        "homerDjiAligned": homer_stem,
        "referenceAligned": reference_stem,
        "charlieContribution": charlie_contribution,
        "homerContribution": homer_contribution,
        "referenceContribution": reference_contribution,
    }
    write_audio_sync_layer_manifest(
        sync_layer_dir,
        audio_path,
        stems,
        dry_run=dry_run,
    )
    return audio_path


def create_conformed_production_baseline(
    work_dir: Path,
    source_aware_mix: Path,
    *,
    dry_run: bool,
) -> dict[str, Any]:
    baseline_dir = work_dir / CONFORMED_BASELINE_DIR_NAME
    baseline_dir.mkdir(parents=True, exist_ok=True)
    sync_layer_dir = work_dir / AUDIO_SYNC_LAYER_DIR_NAME
    stems = {
        "charlieAligned": sync_layer_dir / "charlie-aligned.wav",
        "homerDjiAligned": sync_layer_dir / "homer-dji-aligned.wav",
        "referenceAligned": sync_layer_dir / "reference-aligned.wav",
        "charlieContribution": sync_layer_dir / "charlie-contribution-gated.wav",
        "homerContribution": sync_layer_dir / "homer-dji-contribution-gated.wav",
        "referenceContribution": sync_layer_dir / "reference-contribution-controlled.wav",
    }
    dialogue_bed = baseline_dir / CONFORMED_DIALOGUE_BED_NAME
    master_wav = baseline_dir / MASTER_AUDIO_SPINE_WAV_NAME
    master_m4a = baseline_dir / MASTER_AUDIO_SPINE_M4A_NAME

    if not dialogue_bed.exists():
        cmd = [
            "ffmpeg",
            "-hide_banner",
            "-y",
            "-i",
            str(source_aware_mix),
            "-af",
            conforming_filter(
                "aresample=48000,volume=0.82,highpass=f=65,lowpass=f=16500,"
                "acompressor=threshold=-19dB:ratio=2.2:attack=18:release=220"
            ),
            "-ar",
            "48000",
            "-ac",
            "2",
            str(dialogue_bed),
        ]
        run(cmd, dry_run=dry_run)

    if not master_wav.exists():
        cmd = [
            "ffmpeg",
            "-hide_banner",
            "-y",
            "-i",
            str(dialogue_bed),
            "-af",
            conforming_filter(
                "volume=0.94,highpass=f=65,lowpass=f=16500,"
                "acompressor=threshold=-18dB:ratio=2.4:attack=18:release=240,"
                "alimiter=limit=0.84,"
                f"loudnorm=I={MASTER_LOUDNESS_TARGET['integratedLufs']}:"
                f"TP={MASTER_LOUDNESS_TARGET['truePeakDb']}:"
                f"LRA={MASTER_LOUDNESS_TARGET['lra']}"
            ),
            "-ar",
            "48000",
            "-ac",
            "2",
            str(master_wav),
        ]
        run(cmd, dry_run=dry_run)

    if not master_m4a.exists():
        cmd = [
            "ffmpeg",
            "-hide_banner",
            "-y",
            "-i",
            str(master_wav),
            "-c:a",
            "aac",
            "-b:a",
            "192k",
            str(master_m4a),
        ]
        run(cmd, dry_run=dry_run)

    automation_path = write_speaker_gap_automation(baseline_dir, stems, dry_run=dry_run)
    proof_dir = baseline_dir / BASELINE_PROOF_DIR_NAME
    proof_windows = [
        (2062.0, 35.0, "post-wall-e-missing-clip-echo-check"),
        (4180.0, 35.0, "meetings-section-park-noise-check"),
        (5710.0, 35.0, "camera-assistant-section-overlap-check"),
    ]
    proof_snippets: list[dict[str, Any]] = []
    for start, duration, label in proof_windows:
        raw_proof = create_raw_aligned_proof(
            baseline_dir,
            stems,
            start=start,
            duration=duration,
            dry_run=dry_run,
        )
        sync_proof = create_audio_proof_snippet(
            source_aware_mix,
            proof_dir / f"source-aware-contribution-mix-{int(start)}s.m4a",
            start=start,
            duration=duration,
            dry_run=dry_run,
        )
        baseline_proof = create_audio_proof_snippet(
            master_wav,
            proof_dir / f"conformed-master-spine-{int(start)}s.m4a",
            start=start,
            duration=duration,
            dry_run=dry_run,
        )
        speaker_split_proof = create_speaker_split_proof(
            baseline_dir,
            stems,
            start=start,
            duration=duration,
            dry_run=dry_run,
        )
        proof_snippets.append(
            {
                "label": label,
                "sequenceStartSeconds": start,
                "durationSeconds": duration,
                "rawAligned": str(raw_proof),
                "sourceAwareContributionMix": str(sync_proof),
                "conformedMasterSpine": str(baseline_proof),
                "speakerSplitCharlieLeftHomerRight": str(speaker_split_proof),
            }
        )

    quality_report_path = baseline_dir / BASELINE_QUALITY_REPORT_NAME
    quality_report = audio_quality_report(
        master_wav,
        expected_duration=EPISODE_SEQUENCE_DURATION_SECONDS,
        dry_run=dry_run,
    )
    quality_report_path.write_text(
        json.dumps(quality_report, indent=2, sort_keys=True),
        encoding="utf-8",
    )
    source_contribution_report = create_source_contribution_report(
        baseline_dir,
        source_aware_mix,
        stems,
        master_wav,
        proof_windows,
        dry_run=dry_run,
    )
    stage_board = create_audio_spine_stage_board(
        baseline_dir,
        source_aware_mix,
        stems,
        dialogue_bed,
        master_wav,
        master_m4a,
        automation_path,
        quality_report,
        source_contribution_report,
        proof_snippets,
    )
    manifest = {
        "schema": "quipsly.episode-audio-production-baseline.v1",
        "baselineId": CONFORMED_BASELINE_ID,
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "episode": "high-ground-odyssey-episode-4",
        "syncProject": str(SYNC_PROJECT),
        "branchIndependent": True,
        "approvalStatus": "machine-generated-needs-listen-proof",
        "originalMediaMutated": False,
        "timelinePreserved": True,
        "timelineConformance": {
            "expectedDurationSeconds": EPISODE_SEQUENCE_DURATION_SECONDS,
            "filter": TIMELINE_CONFORM_FILTER,
            "scope": (
                "All generated aligned, contribution, mix, dialogue-bed, and mastered stems are derived "
                "timeline artifacts that should preserve exact Episode 4 sequence duration."
            ),
        },
        "expectedTimelineDurationSeconds": EPISODE_SEQUENCE_DURATION_SECONDS,
        "rawSources": [asdict(source) for source in AUDIO_SOURCES],
        "sourceInclusion": {
            "production": [
                "Charlie computer recording",
                "Homer DJI microphone parts",
                "ArtShow reference clip audio during its synced source window",
            ],
            "excludedOrEvidenceOnly": [
                "Camera scratch audio is not used as the production bed unless explicitly added later.",
                "Duplicate/bleed carried inside a speaker's non-contributing gaps is suppressed through derived-stem automation.",
            ],
        },
        "syncLayer": {
            "mode": AUDIO_SYNC_LAYER_MODE,
            "manifestPath": str(sync_layer_dir / "manifest.json"),
            "sourceAwareMix": str(source_aware_mix),
            "stems": {name: str(path) for name, path in stems.items()},
        },
        "criticalCleanup": {
            "speakerAwareGapManagement": True,
            "metadataPath": str(automation_path),
            "charlieRequirement": "Charlie Ep4.wav should not carry distracting Homer echo during Charlie non-speaking gaps.",
            "homerRequirement": "Homer DJI stems should reduce park/background noise during Homer non-speaking gaps.",
            "method": "contribution gates on duplicate aligned stems plus asymmetric Charlie-under-Homer ducking in the sync-layer mix",
            "naturalnessProtection": "smooth attack/release, compression, no source length changes, no hard timeline cuts",
        },
        "dxRevive": {
            "automaticApplied": False,
            "status": "installed-as-au-vst3-plugin-not-cli",
            "fallback": "manual/offline bounce hooks should use aligned derived stems and duration validation before replacement",
        },
        "processingChain": [
            "align raw production audio to episode sequence time",
            "derive contribution-gated speaker stems",
            "duck Charlie's echo-contaminated track under Homer clean mic while preserving Homer as a primary source",
            "mix Charlie/Homer/reference into source-aware dialogue bed",
            "master full-length WAV spine to podcast/video target",
            "create compressed M4A delivery copy",
            "write proof snippets, waveform QC, source-contribution report, and quality report",
        ],
        "outputs": {
            "sourceAwareMix": {"path": str(source_aware_mix), "probe": ffprobe(source_aware_mix) if source_aware_mix.exists() and not dry_run else {}},
            "dialogueBed": {"path": str(dialogue_bed), "probe": ffprobe(dialogue_bed) if dialogue_bed.exists() and not dry_run else {}},
            "masterWav": {"path": str(master_wav), "probe": ffprobe(master_wav) if master_wav.exists() and not dry_run else {}},
            "masterM4a": {"path": str(master_m4a), "probe": ffprobe(master_m4a) if master_m4a.exists() and not dry_run else {}},
            "speakerGapAutomation": str(automation_path),
            "qualityReport": str(quality_report_path),
            "sourceContributionReport": str(baseline_dir / SOURCE_CONTRIBUTION_REPORT_NAME),
            "sourceContributionMarkdown": source_contribution_report.get("markdownPath"),
            "sourceContributionCsv": source_contribution_report.get("csvPath"),
            "audioSpineStageBoard": stage_board.get("path"),
            "audioSpineStageBoardMarkdown": stage_board.get("markdownPath"),
            "waveforms": source_contribution_report.get("waveforms", {}),
            "proofSnippets": proof_snippets,
        },
        "qualitySummary": {
            "durationMatchesExpected": quality_report.get("durationMatchesExpected"),
            "durationDeltaSeconds": quality_report.get("durationDeltaSeconds"),
            "warnings": [
                *quality_report.get("warnings", []),
                *source_contribution_report.get("warnings", []),
            ],
            "meanVolumeDb": quality_report.get("volumedetect", {}).get("meanVolumeDb"),
            "maxVolumeDb": quality_report.get("volumedetect", {}).get("maxVolumeDb"),
            "sourceContributionWarningCount": len(source_contribution_report.get("warnings", [])),
        },
        "nextSafestAction": "Listen-proof raw vs source-aware vs conformed snippets, then render producer-take branches from the mastered spine.",
    }
    manifest_path = baseline_dir / "manifest.json"
    manifest_path.write_text(json.dumps(manifest, indent=2, sort_keys=True), encoding="utf-8")
    (baseline_dir / "README.md").write_text(
        "\n".join(
            [
                "# Episode 4 conformed production baseline",
                "",
                "This is the branch-independent audio truth for Episode 4 edits.",
                "",
                f"- Baseline id: `{CONFORMED_BASELINE_ID}`",
                f"- Master WAV spine: `{master_wav}`",
                f"- Compressed delivery copy: `{master_m4a}`",
                f"- Speaker-gap automation: `{automation_path}`",
                f"- Quality report: `{quality_report_path}`",
                f"- Source contribution QC: `{baseline_dir / SOURCE_CONTRIBUTION_REPORT_NAME}`",
                f"- Audio spine stage board: `{stage_board.get('markdownPath')}`",
                "- Originals are not mutated.",
                "- Timeline duration is preserved.",
                "- Edit branches should inherit this baseline instead of repeating cleanup.",
                "- Premiere/Quipsly handoff is the normal stereo mastered WAV, not the speaker-split QC proof.",
                "",
                "## Proof snippets",
                "",
                *[
                    f"- `{item['label']}`: raw `{item['rawAligned']}`, source-aware `{item['sourceAwareContributionMix']}`, conformed `{item['conformedMasterSpine']}`, QC speaker split `{item['speakerSplitCharlieLeftHomerRight']}`"
                    for item in proof_snippets
                ],
                "",
            ]
        ),
        encoding="utf-8",
    )
    return manifest


def subtract_missing_windows(ranges: tuple[EditRange, ...]) -> list[EditRange]:
    working = list(ranges)
    for missing_start, missing_end, reason in MISSING_CLIP_WINDOWS:
        next_ranges: list[EditRange] = []
        for edit_range in working:
            if missing_end <= edit_range.start or missing_start >= edit_range.end:
                next_ranges.append(edit_range)
                continue
            if edit_range.start < missing_start:
                next_ranges.append(
                    EditRange(edit_range.start, missing_start, edit_range.reason, edit_range.bias)
                )
            if missing_end < edit_range.end:
                next_ranges.append(
                    EditRange(
                        missing_end,
                        edit_range.end,
                        f"{edit_range.reason} Resumes after avoided missing-clip cue: {reason}",
                        edit_range.bias,
                    )
                )
        working = next_ranges
    return [r for r in working if r.end - r.start >= 1.0]


def source_boundaries() -> list[float]:
    boundaries: set[float] = set()
    for source in VIDEO_SOURCES:
        boundaries.add(source.seq_start)
        boundaries.add(source.seq_end)
    for start, end, _ in MISSING_CLIP_WINDOWS:
        boundaries.add(start)
        boundaries.add(end)
    return sorted(boundaries)


def split_range(edit_range: EditRange, max_chunk_seconds: float = 26.0) -> list[tuple[float, float]]:
    points = [edit_range.start, edit_range.end]
    for boundary in source_boundaries():
        if edit_range.start < boundary < edit_range.end:
            points.append(boundary)
    points = sorted(set(round(p, 3) for p in points))
    pieces: list[tuple[float, float]] = []
    for start, end in zip(points, points[1:]):
        cursor = start
        while cursor < end - 0.001:
            chunk_end = min(end, cursor + max_chunk_seconds)
            pieces.append((cursor, chunk_end))
            cursor = chunk_end
    return pieces


def available_sources(sequence_time: float, role: str | None = None) -> list[Source]:
    sources = [source for source in VIDEO_SOURCES if source.available(sequence_time)]
    if role:
        sources = [source for source in sources if source.role == role]
    return sources


def choose_source(sequence_time: float, bias: str, chunk_index: int) -> tuple[Source | None, str]:
    refs = available_sources(sequence_time, "reference_clip")
    if refs:
        return refs[0], "reference clip is active at this sequence time"

    charlie = available_sources(sequence_time, "charlie_camera")
    homer = available_sources(sequence_time, "homer_camera")
    if bias == "reference":
        if refs:
            return refs[0], "reference-biased range"
        bias = "balanced"

    def first_or_none(items: list[Source]) -> Source | None:
        return items[0] if items else None

    if bias == "charlie":
        primary, reaction = first_or_none(charlie), first_or_none(homer)
    elif bias == "homer":
        primary, reaction = first_or_none(homer), first_or_none(charlie)
    else:
        primary, reaction = (first_or_none(charlie), first_or_none(homer))
        if chunk_index % 2 == 1:
            primary, reaction = reaction, primary

    # Every fourth available two-camera chunk becomes a reaction insert.
    if reaction and chunk_index % 4 == 3:
        return reaction, f"reaction insert against {bias} primary"
    if primary:
        return primary, f"{bias} primary"
    if reaction:
        return reaction, "fallback to available reaction/source angle"
    return None, "no source camera active; render intentional blank/gap"


def build_chunks(branch: Branch) -> list[RenderChunk]:
    chunks: list[RenderChunk] = []
    chunk_index = 0
    for edit_range in subtract_missing_windows(branch.ranges):
        for start, end in split_range(edit_range):
            duration = end - start
            if duration <= 0.1:
                continue
            source, cut_reason = choose_source((start + end) / 2, edit_range.bias or branch.default_bias, chunk_index)
            if source:
                source_id = source.id
                source_label = source.label
                source_role = source.role
                source_path = source.path
                source_start = source.source_time(start)
            else:
                source_id = "blank-gap"
                source_label = "Intentional blank gap"
                source_role = "gap"
                source_path = ""
                source_start = 0.0
            chunks.append(
                RenderChunk(
                    index=len(chunks),
                    branch_id=branch.id,
                    sequence_start=start,
                    sequence_end=end,
                    duration=duration,
                    range_reason=edit_range.reason,
                    source_id=source_id,
                    source_label=source_label,
                    source_role=source_role,
                    source_path=source_path,
                    source_start=source_start,
                    cut_reason=cut_reason,
                )
            )
            chunk_index += 1
    return chunks


def render_chunk(
    chunk: RenderChunk,
    chunk_path: Path,
    production_audio: Path,
    *,
    dry_run: bool,
) -> dict[str, Any]:
    if chunk_path.exists():
        try:
            existing_probe = ffprobe(chunk_path)
            existing_duration = float(existing_probe.get("durationSeconds") or 0)
            if existing_duration >= max(0.25, chunk.duration * 0.85):
                return {
                    "label": f"chunk-{chunk.index:04d}",
                    "path": str(chunk_path),
                    "status": "skipped-existing",
                    "warningCount": 0,
                    "warnings": [],
                    "probe": existing_probe,
                }
        except Exception:
            existing_probe = {"error": "existing chunk could not be probed"}
        if not dry_run:
            chunk_path.unlink(missing_ok=True)
    chunk_path.parent.mkdir(parents=True, exist_ok=True)
    if chunk.source_role == "gap":
        cmd = [
            "ffmpeg",
            "-hide_banner",
            "-y",
            "-f",
            "lavfi",
            "-i",
            "color=c=0x111512:s=1920x1080:r=30",
            "-ss",
            f"{chunk.sequence_start:.3f}",
            "-i",
            str(production_audio),
            "-t",
            f"{chunk.duration:.3f}",
            "-map",
            "0:v:0",
            "-map",
            "1:a:0",
        ]
    else:
        source = next((item for item in VIDEO_SOURCES if item.id == chunk.source_id), None)
        if source is None:
            raise RuntimeError(f"Unknown source for chunk {chunk.index}: {chunk.source_id}")
        cmd = [
            "ffmpeg",
            "-hide_banner",
            "-y",
            "-ss",
            f"{chunk.source_start:.3f}",
            "-i",
            chunk.source_path,
            "-ss",
            f"{chunk.sequence_start:.3f}",
            "-i",
            str(production_audio),
            "-t",
            f"{chunk.duration:.3f}",
            "-map",
            "0:v:0",
            "-map",
            "1:a:0",
            "-vf",
            video_filter(source),
        ]
    cmd.extend(
        [
            "-af",
            "aresample=48000",
            "-c:v",
            "libx264",
            "-preset",
            "veryfast",
            "-crf",
            "22",
            "-pix_fmt",
            "yuv420p",
            "-r",
            "30",
            "-c:a",
            "aac",
            "-b:a",
            "160k",
            "-movflags",
            "+faststart",
            str(chunk_path),
        ]
    )
    diagnostic = run_ffmpeg_diagnostic(
        cmd,
        label=f"chunk-{chunk.index:04d}",
        dry_run=dry_run,
        allow_failure=chunk.source_role != "gap",
    )
    if diagnostic.get("failed") and chunk.source_role != "gap":
        if not dry_run:
            chunk_path.unlink(missing_ok=True)
        fallback_cmd = [
            "ffmpeg",
            "-hide_banner",
            "-y",
            "-f",
            "lavfi",
            "-i",
            "color=c=0x111512:s=1920x1080:r=30",
            "-ss",
            f"{chunk.sequence_start:.3f}",
            "-i",
            str(production_audio),
            "-t",
            f"{chunk.duration:.3f}",
            "-map",
            "0:v:0",
            "-map",
            "1:a:0",
            "-af",
            "aresample=48000",
            "-c:v",
            "libx264",
            "-preset",
            "veryfast",
            "-crf",
            "22",
            "-pix_fmt",
            "yuv420p",
            "-r",
            "30",
            "-c:a",
            "aac",
            "-b:a",
            "160k",
            "-movflags",
            "+faststart",
            str(chunk_path),
        ]
        fallback_diagnostic = run_ffmpeg_diagnostic(
            fallback_cmd,
            label=f"chunk-{chunk.index:04d}-fallback-gap",
            dry_run=dry_run,
        )
        fallback_warning = (
            f"Source chunk render failed for {chunk.source_label} "
            f"({chunk.source_id}) at sequence {chunk.sequence_start:.3f}-{chunk.sequence_end:.3f}; "
            "rendered timeline-preserving blank video with conformed baseline audio."
        )
        fallback_diagnostic["fallbackFor"] = diagnostic
        fallback_diagnostic["status"] = "rendered-fallback-gap" if not dry_run else "dry-run"
        fallback_diagnostic["warningCount"] = int(fallback_diagnostic.get("warningCount", 0) or 0) + 1
        fallback_diagnostic["warnings"] = [
            fallback_warning,
            *(fallback_diagnostic.get("warnings") or []),
        ]
        fallback_diagnostic["path"] = str(chunk_path)
        return fallback_diagnostic
    diagnostic["path"] = str(chunk_path)
    diagnostic["status"] = "rendered" if not dry_run else "dry-run"
    return diagnostic


def concat_chunks(
    chunk_paths: list[Path],
    output_path: Path,
    *,
    dry_run: bool,
    normalize_audio_timestamps: bool = False,
    contains_video: bool = True,
) -> dict[str, Any]:
    list_path = output_path.with_suffix(".concat.txt")
    list_path.write_text(
        "\n".join(f"file '{str(path).replace(chr(39), chr(39) + chr(92) + chr(39) + chr(39))}'" for path in chunk_paths)
        + "\n",
        encoding="utf-8",
    )
    cmd = [
        "ffmpeg",
        "-hide_banner",
        "-y",
        "-f",
        "concat",
        "-safe",
        "0",
        "-i",
        str(list_path),
    ]
    if normalize_audio_timestamps:
        if contains_video:
            cmd.extend(["-c:v", "copy", "-c:a", "aac", "-b:a", "160k", "-movflags", "+faststart"])
        else:
            cmd.extend(["-vn", "-c:a", "aac", "-b:a", "160k"])
    else:
        cmd.extend(["-c", "copy"])
    cmd.append(str(output_path))
    diagnostic = run_ffmpeg_diagnostic(cmd, label=f"concat-{output_path.name}", dry_run=dry_run)
    diagnostic["path"] = str(output_path)
    diagnostic["concatListPath"] = str(list_path)
    diagnostic["normalizeAudioTimestamps"] = normalize_audio_timestamps
    diagnostic["status"] = "rendered" if not dry_run else "dry-run"
    return diagnostic


def export_podcast_audio(
    chunks: list[RenderChunk],
    production_audio: Path,
    output_path: Path,
    work_dir: Path,
    *,
    dry_run: bool,
) -> dict[str, Any]:
    audio_chunks: list[Path] = []
    chunk_diagnostics: list[dict[str, Any]] = []
    for chunk in chunks:
        path = work_dir / "audio-chunks" / f"{chunk.index:04d}.m4a"
        audio_chunks.append(path)
        if path.exists():
            chunk_diagnostics.append(
                {
                    "label": f"podcast-audio-chunk-{chunk.index:04d}",
                    "path": str(path),
                    "status": "skipped-existing",
                    "warningCount": 0,
                    "warnings": [],
                }
            )
            continue
        path.parent.mkdir(parents=True, exist_ok=True)
        cmd = [
            "ffmpeg",
            "-hide_banner",
            "-y",
            "-ss",
            f"{chunk.sequence_start:.3f}",
            "-i",
            str(production_audio),
            "-t",
            f"{chunk.duration:.3f}",
            "-vn",
            "-c:a",
            "aac",
            "-b:a",
            "160k",
            str(path),
        ]
        diagnostic = run_ffmpeg_diagnostic(
            cmd,
            label=f"podcast-audio-chunk-{chunk.index:04d}",
            dry_run=dry_run,
        )
        diagnostic["path"] = str(path)
        diagnostic["status"] = "rendered" if not dry_run else "dry-run"
        chunk_diagnostics.append(diagnostic)
    concat_diagnostic = concat_chunks(
        audio_chunks,
        output_path,
        dry_run=dry_run,
        normalize_audio_timestamps=True,
        contains_video=False,
    )
    return {
        "chunks": chunk_diagnostics,
        "concat": concat_diagnostic,
    }


def render_branch(
    branch: Branch,
    run_dir: Path,
    production_audio: Path,
    *,
    baseline_manifest: dict[str, Any] | None,
    dry_run: bool,
) -> dict[str, Any]:
    branch_dir = run_dir / branch.id
    work_dir = branch_dir / "work"
    branch_dir.mkdir(parents=True, exist_ok=True)
    chunks = build_chunks(branch)
    chunk_paths: list[Path] = []
    render_diagnostics: list[dict[str, Any]] = []
    for chunk in chunks:
        chunk_path = work_dir / "chunks" / f"{chunk.index:04d}-{chunk.source_id}.mp4"
        render_diagnostics.append(render_chunk(chunk, chunk_path, production_audio, dry_run=dry_run))
        chunk_paths.append(chunk_path)

    video_path = branch_dir / f"episode-4-{branch.id}-16x9-{EXPORT_VERSION}.mp4"
    podcast_path = branch_dir / f"episode-4-{branch.id}-podcast-audio-{EXPORT_VERSION}.m4a"
    video_concat_diagnostic = concat_chunks(
        chunk_paths,
        video_path,
        dry_run=dry_run,
        normalize_audio_timestamps=True,
        contains_video=True,
    )
    podcast_diagnostics = export_podcast_audio(chunks, production_audio, podcast_path, work_dir, dry_run=dry_run)
    all_diagnostics = [
        *render_diagnostics,
        video_concat_diagnostic,
        *podcast_diagnostics.get("chunks", []),
        podcast_diagnostics.get("concat", {}),
    ]
    warning_diagnostics = [
        diagnostic
        for diagnostic in all_diagnostics
        if diagnostic and int(diagnostic.get("warningCount", 0) or 0) > 0
    ]
    render_warning_lines = [
        line
        for diagnostic in warning_diagnostics
        for line in diagnostic.get("warnings", [])
    ]

    manifest = {
        "schema": "quipsly.episode4.sync-producer-take.v3",
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "exportVersion": EXPORT_VERSION,
        "branch": {
            "id": branch.id,
            "title": branch.title,
            "editorialApproach": branch.editorial_approach,
            "intendedPlatformUse": branch.intended_platform_use,
            "durationTarget": "optimal-for-approach",
        },
        "truth": {
            "syncProjectUsedAsEvidence": str(SYNC_PROJECT),
            "premiereProjectUsedAsSyncEvidenceOnly": True,
            "originalMediaMutated": False,
            "exportsRendered": not dry_run,
            "externalPublicationReceipt": None,
            "missingClipWindowsAvoided": [window_reason(w) for w in MISSING_CLIP_WINDOWS],
            "sourceModel": "Whole sources stay intact; rendered chunks are export implementation details, not canonical chopped media.",
            "audioModel": "A branch-independent conformed production baseline/mastered audio spine is rendered once, then reused by all producer takes.",
        },
        "ranges": [asdict(r) for r in subtract_missing_windows(branch.ranges)],
        "sourceMap": [asdict(source) for source in VIDEO_SOURCES],
        "audioMap": [asdict(source) for source in AUDIO_SOURCES],
        "conformedProductionBaseline": {
            "baselineId": baseline_manifest.get("baselineId") if baseline_manifest else CONFORMED_BASELINE_ID,
            "masterAudioPath": str(production_audio),
            "manifestPath": str(production_audio.parent / "manifest.json"),
            "qualityReportPath": str(production_audio.parent / BASELINE_QUALITY_REPORT_NAME),
            "speakerGapAutomationPath": str(production_audio.parent / SPEAKER_GAP_AUTOMATION_NAME),
            "inheritsSpeakerAwareGapManagement": True,
            "qualitySummary": baseline_manifest.get("qualitySummary", {}) if baseline_manifest else {},
        },
        "chunks": [asdict(chunk) for chunk in chunks],
        "outputs": {
            "video": {"path": str(video_path), "probe": ffprobe(video_path) if video_path.exists() else {}},
            "podcastAudio": {"path": str(podcast_path), "probe": ffprobe(podcast_path) if podcast_path.exists() else {}},
        },
        "renderDiagnostics": {
            "schema": "quipsly.render-diagnostics.v1",
            "warningCount": len(render_warning_lines),
            "warningStepCount": len(warning_diagnostics),
            "warningLines": render_warning_lines[:120],
            "steps": all_diagnostics,
        },
        "warnings": [
            "Transcript speaker labels are draft-only; reaction-shot placement uses producer heuristics.",
            "Missing watched/reference clip cues were cut around because Sync.prproj only contains ArtShow.mp4 as reference media.",
            "Charlie camera color correction is mild baseline correction, not a full color grade.",
            "Charlie/Homer echo and park-noise suppression comes from the conformed baseline, not manual per-branch audio cutting.",
            *(
                [
                    f"Render diagnostics captured {len(render_warning_lines)} ffmpeg warning line(s); review renderDiagnostics before platform-ready release."
                ]
                if render_warning_lines
                else []
            ),
        ],
        "nextSafestAction": "Proof-watch for exact sync, reaction timing, and Charlie color before public upload.",
    }
    (branch_dir / "manifest.json").write_text(json.dumps(manifest, indent=2, sort_keys=True), encoding="utf-8")
    (branch_dir / "README.md").write_text(branch_readme(manifest), encoding="utf-8")
    return manifest


def window_reason(window: tuple[float, float, str]) -> dict[str, Any]:
    return {"start": window[0], "end": window[1], "reason": window[2]}


def branch_readme(manifest: dict[str, Any]) -> str:
    branch = manifest["branch"]
    outputs = manifest["outputs"]
    video_probe = outputs["video"].get("probe", {})
    audio_probe = outputs["podcastAudio"].get("probe", {})
    return "\n".join(
        [
            f"# {branch['title']}",
            "",
            f"- Approach: {branch['editorialApproach']}",
            f"- Intended use: {branch['intendedPlatformUse']}",
            f"- Video: `{outputs['video']['path']}`",
            f"- Podcast audio: `{outputs['podcastAudio']['path']}`",
            f"- Video duration: {video_probe.get('durationMinutes', 'unknown')} min",
            f"- Audio duration: {audio_probe.get('durationMinutes', 'unknown')} min",
            "- Truth: local export only; not human-approved, uploaded, scheduled, published, or receipt-backed.",
            "",
            "## Warnings",
            "",
            *[f"- {warning}" for warning in manifest["warnings"]],
            "",
            "## Next safest action",
            "",
            manifest["nextSafestAction"],
            "",
        ]
    )


def write_boards(run_dir: Path, manifests: list[dict[str, Any]], baseline_manifest: dict[str, Any]) -> None:
    summary = {
        "schema": "quipsly.episode4.sync-producer-run.v3",
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "runDir": str(run_dir),
        "status": "local-export-ready-needs-proof-watch",
        "syncProject": str(SYNC_PROJECT),
        "conformedProductionBaseline": {
            "baselineId": baseline_manifest.get("baselineId"),
            "masterAudioPath": baseline_manifest.get("outputs", {}).get("masterWav", {}).get("path"),
            "masterDeliveryPath": baseline_manifest.get("outputs", {}).get("masterM4a", {}).get("path"),
            "manifestPath": str(Path(baseline_manifest.get("outputs", {}).get("masterWav", {}).get("path", "")).parent / "manifest.json"),
            "speakerGapAutomationPath": baseline_manifest.get("outputs", {}).get("speakerGapAutomation"),
            "branchIndependent": True,
            "qualitySummary": baseline_manifest.get("qualitySummary", {}),
        },
        "branches": [
            {
                "id": manifest["branch"]["id"],
                "title": manifest["branch"]["title"],
                "videoPath": manifest["outputs"]["video"]["path"],
                "podcastAudioPath": manifest["outputs"]["podcastAudio"]["path"],
                "videoProbe": manifest["outputs"]["video"].get("probe", {}),
                "audioProbe": manifest["outputs"]["podcastAudio"].get("probe", {}),
                "approach": manifest["branch"]["editorialApproach"],
                "intendedPlatformUse": manifest["branch"]["intendedPlatformUse"],
                "nextSafestAction": manifest["nextSafestAction"],
            }
            for manifest in manifests
        ],
        "missingClipEvidence": [window_reason(w) for w in MISSING_CLIP_WINDOWS],
        "truth": {
            "externalPublicationReceipt": None,
            "humanApproval": False,
            "originalMediaMutated": False,
            "versionsOverwritten": False,
        },
    }
    (run_dir / "run-summary.json").write_text(json.dumps(summary, indent=2, sort_keys=True), encoding="utf-8")
    lines = [
        f"# Episode 4 Sync producer takes {EXPORT_VERSION}",
        "",
        f"- Run: `{run_dir}`",
        f"- Sync evidence: `{SYNC_PROJECT}`",
        "- Truth: local export readiness only. No upload, schedule, publication, approval, or receipt is claimed.",
        "- Missing watched/source clip cues were routed around unless the existing `ArtShow.mp4` reference was active.",
        f"- Audio: `{CONFORMED_BASELINE_ID}` mastered spine reused by every take.",
        "",
        "## Takes",
        "",
        "| Take | Runtime | Video | Podcast audio | Best use |",
        "|---|---:|---|---|---|",
    ]
    for branch in summary["branches"]:
        duration = branch["videoProbe"].get("durationMinutes", "unknown")
        lines.append(
            "| "
            + " | ".join(
                [
                    f"`{branch['id']}`",
                    f"{duration} min",
                    f"`{branch['videoPath']}`",
                    f"`{branch['podcastAudioPath']}`",
                    branch["intendedPlatformUse"],
                ]
            )
            + " |"
        )
    lines.extend(
        [
            "",
            "## Missing clip cue windows noticed",
            "",
        ]
    )
    for cue in summary["missingClipEvidence"]:
        lines.append(f"- `{cue['start']:.2f}s -> {cue['end']:.2f}s`: {cue['reason']}")
    lines.extend(
        [
            "",
            "## Review recommendation",
            "",
            "Start with `take-a-main-public`. If it feels too compressed, compare `take-c-warm-extended`. If it feels too long, compare `take-b-teaching-forward`.",
            "",
        ]
    )
    (run_dir / "producer-takes-board.md").write_text("\n".join(lines), encoding="utf-8")


def write_audio_only_board(run_dir: Path, source_aware_mix: Path, baseline_manifest: dict[str, Any]) -> None:
    master_wav_path = Path(baseline_manifest["outputs"]["masterWav"]["path"])
    master_m4a_path = Path(baseline_manifest["outputs"]["masterM4a"]["path"])
    sync_layer_dir = source_aware_mix.parent / AUDIO_SYNC_LAYER_DIR_NAME
    summary = {
        "schema": "quipsly.episode4.audio-only-run.v2",
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "runDir": str(run_dir),
        "status": "conformed-production-baseline-ready-needs-listen-proof",
        "syncProject": str(SYNC_PROJECT),
        "audioSyncLayer": {
            "mode": AUDIO_SYNC_LAYER_MODE,
            "balancedAudioPath": str(source_aware_mix),
            "manifestPath": str(sync_layer_dir / "manifest.json"),
            "branchIndependent": True,
            "probe": ffprobe(source_aware_mix) if source_aware_mix.exists() else {},
        },
        "conformedProductionBaseline": {
            "baselineId": baseline_manifest["baselineId"],
            "manifestPath": str(master_wav_path.parent / "manifest.json"),
            "masterWavPath": str(master_wav_path),
            "masterM4aPath": str(master_m4a_path),
            "qualityReportPath": baseline_manifest["outputs"]["qualityReport"],
            "speakerGapAutomationPath": baseline_manifest["outputs"]["speakerGapAutomation"],
            "proofSnippets": baseline_manifest["outputs"]["proofSnippets"],
            "qualitySummary": baseline_manifest.get("qualitySummary", {}),
        },
        "truth": {
            "externalPublicationReceipt": None,
            "humanApproval": False,
            "originalMediaMutated": False,
            "videoBranchesRendered": False,
        },
        "nextSafestAction": "Listen-proof raw/source-aware/conformed proof snippets, then render full producer takes from the mastered spine.",
    }
    (run_dir / "audio-only-run-summary.json").write_text(
        json.dumps(summary, indent=2, sort_keys=True),
        encoding="utf-8",
    )
    (run_dir / "audio-sync-layer-board.md").write_text(
        "\n".join(
            [
                "# Episode 4 conformed audio baseline",
                "",
                f"- Run: `{run_dir}`",
                f"- Sync evidence: `{SYNC_PROJECT}`",
                f"- Sync-layer mode: `{AUDIO_SYNC_LAYER_MODE}`",
                f"- Source-aware mix: `{source_aware_mix}`",
                f"- Conformed baseline: `{baseline_manifest['baselineId']}`",
                f"- Master WAV spine: `{master_wav_path}`",
                f"- Master M4A delivery: `{master_m4a_path}`",
                f"- Manifest: `{sync_layer_dir / 'manifest.json'}`",
                f"- Baseline manifest: `{master_wav_path.parent / 'manifest.json'}`",
                "- Truth: local conformed-baseline readiness only. No video branches, upload, schedule, publication, approval, or receipt is claimed.",
                "",
                "## Next safest action",
                "",
                summary["nextSafestAction"],
                "",
            ]
        ),
        encoding="utf-8",
    )


def choose_run_dir(output_root: Path, run_name: str, *, reuse_existing: bool = False) -> Path:
    output_root.mkdir(parents=True, exist_ok=True)
    candidate = output_root / run_name
    if reuse_existing:
        candidate.mkdir(parents=True, exist_ok=True)
        return candidate
    if not candidate.exists():
        return candidate
    suffix = datetime.now().strftime("%Y%m%d-%H%M%S")
    return output_root / f"{run_name}-{suffix}"


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output-root", default=str(DEFAULT_OUTPUT_ROOT))
    parser.add_argument("--run-name", default=DEFAULT_RUN_NAME)
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument(
        "--reuse-run-dir",
        action="store_true",
        help="Reuse an existing run directory and existing sync-layer audio artifacts.",
    )
    parser.add_argument(
        "--audio-only",
        action="store_true",
        help="Build and document only the branch-independent conformed production baseline.",
    )
    parser.add_argument("--branches", nargs="*", default=[branch.id for branch in BRANCHES])
    args = parser.parse_args()

    if not SYNC_PROJECT.exists():
        raise SystemExit(f"Missing Sync project: {SYNC_PROJECT}")
    missing = [source.path for source in VIDEO_SOURCES if not Path(source.path).exists()]
    missing += [source.path for source in AUDIO_SOURCES if not Path(source.path).exists()]
    if missing:
        raise SystemExit("Missing required media:\n" + "\n".join(missing))

    run_dir = choose_run_dir(Path(args.output_root), args.run_name, reuse_existing=args.reuse_run_dir)
    work_dir = run_dir / "work"
    run_dir.mkdir(parents=True, exist_ok=True)
    source_aware_mix = create_balanced_audio(work_dir, dry_run=args.dry_run)
    baseline_manifest = create_conformed_production_baseline(
        work_dir,
        source_aware_mix,
        dry_run=args.dry_run,
    )
    master_audio_spine = Path(baseline_manifest["outputs"]["masterWav"]["path"])
    if args.audio_only:
        write_audio_only_board(run_dir, source_aware_mix, baseline_manifest)
        print(f"Wrote Episode 4 conformed production baseline to {run_dir}")
        return 0
    selected = [branch for branch in BRANCHES if branch.id in set(args.branches)]
    manifests = [
        render_branch(
            branch,
            run_dir,
            master_audio_spine,
            baseline_manifest=baseline_manifest,
            dry_run=args.dry_run,
        )
        for branch in selected
    ]
    write_boards(run_dir, manifests, baseline_manifest)
    print(f"Wrote Episode 4 Sync producer takes to {run_dir}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
