#!/usr/bin/env python3
"""Generate reusable Audio Workbench QC for a conformed audio baseline.

This script is deliberately evidence-first. It does not render or mutate media.
It profiles the existing baseline handoff artifacts and writes a versioned QC
packet that can guide the next targeted treatment pass.
"""
from __future__ import annotations

import argparse
import json
import re
import subprocess
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


MEDIA_KEYS = (
    "sourceAwareMix",
    "dialogueBed",
    "masterWav",
    "masterM4a",
)


def run_capture(cmd: list[str]) -> subprocess.CompletedProcess[str]:
    return subprocess.run(cmd, text=True, capture_output=True, check=False)


def read_json(path: Path) -> dict[str, Any]:
    return json.loads(path.read_text(encoding="utf-8"))


def write_json(path: Path, value: dict[str, Any]) -> None:
    path.write_text(json.dumps(value, indent=2, sort_keys=True), encoding="utf-8")


def resolve_baseline_dir(input_path: Path) -> Path:
    if (input_path / "manifest.json").exists():
        return input_path
    nested = input_path / "work" / "conformed-production-baseline"
    if (nested / "manifest.json").exists():
        return nested
    raise FileNotFoundError(
        "Could not find a conformed production baseline manifest at "
        f"{input_path}/manifest.json or {nested}/manifest.json"
    )


def version_from_baseline_id(baseline_id: str) -> str:
    match = re.search(r"(v\d+(?:-[A-Za-z0-9-]+)?)$", baseline_id)
    return match.group(1) if match else "unknown"


def ffprobe(path: Path) -> dict[str, Any]:
    proc = run_capture(
        [
            "ffprobe",
            "-v",
            "error",
            "-show_format",
            "-show_streams",
            "-of",
            "json",
            str(path),
        ]
    )
    if proc.returncode != 0:
        return {"error": proc.stderr.strip() or proc.stdout.strip()}
    return json.loads(proc.stdout)


def parse_float(pattern: str, text: str) -> float | None:
    match = re.search(pattern, text)
    if not match:
        return None
    try:
        return float(match.group(1))
    except ValueError:
        return None


def volumedetect(path: Path) -> dict[str, Any]:
    proc = run_capture(
        [
            "ffmpeg",
            "-hide_banner",
            "-nostats",
            "-i",
            str(path),
            "-af",
            "volumedetect",
            "-f",
            "null",
            "-",
        ]
    )
    stderr = proc.stderr
    return {
        "ok": proc.returncode == 0,
        "meanVolumeDb": parse_float(r"mean_volume:\s*(-?\d+(?:\.\d+)?) dB", stderr),
        "maxVolumeDb": parse_float(r"max_volume:\s*(-?\d+(?:\.\d+)?) dB", stderr),
        "histogram": {
            key: int(value)
            for key, value in re.findall(r"histogram_(\d+)db:\s*(\d+)", stderr)
        },
        "error": "" if proc.returncode == 0 else stderr.strip()[-2000:],
    }


def ebur128(path: Path) -> dict[str, Any]:
    proc = run_capture(
        [
            "ffmpeg",
            "-hide_banner",
            "-nostats",
            "-i",
            str(path),
            "-filter_complex",
            "ebur128=peak=true",
            "-f",
            "null",
            "-",
        ]
    )
    text = proc.stderr
    summaries = [match.start() for match in re.finditer(r"Summary:", text)]
    summary = text[summaries[-1] :] if summaries else text
    return {
        "ok": proc.returncode == 0,
        "integratedLufs": parse_float(r"I:\s*(-?\d+(?:\.\d+)?) LUFS", summary),
        "loudnessRangeLu": parse_float(r"LRA:\s*(-?\d+(?:\.\d+)?) LU", summary),
        "truePeakDbfs": parse_float(r"Peak:\s*(-?\d+(?:\.\d+)?) dBFS", summary),
        "error": "" if proc.returncode == 0 else text.strip()[-2000:],
    }


def silencedetect(path: Path, *, noise_db: int = -45, min_duration: float = 1.25) -> dict[str, Any]:
    proc = run_capture(
        [
            "ffmpeg",
            "-hide_banner",
            "-nostats",
            "-i",
            str(path),
            "-af",
            f"silencedetect=noise={noise_db}dB:d={min_duration}",
            "-f",
            "null",
            "-",
        ]
    )
    text = proc.stderr
    starts = [float(value) for value in re.findall(r"silence_start:\s*([0-9.]+)", text)]
    ends = [
        (float(end), float(duration))
        for end, duration in re.findall(r"silence_end:\s*([0-9.]+)\s*\|\s*silence_duration:\s*([0-9.]+)", text)
    ]
    windows = []
    for index, start in enumerate(starts):
        end = ends[index][0] if index < len(ends) else None
        duration = ends[index][1] if index < len(ends) else None
        windows.append({"start": start, "end": end, "duration": duration})
    sorted_windows = sorted(windows, key=lambda item: item["duration"] or 0, reverse=True)
    longest_window = sorted_windows[0] if sorted_windows else None
    longest = (longest_window or {}).get("duration") or 0
    total = sum(item["duration"] or 0 for item in windows)
    return {
        "ok": proc.returncode == 0,
        "noiseDb": noise_db,
        "minDurationSeconds": min_duration,
        "count": len(windows),
        "totalSilenceSeconds": round(total, 3),
        "longestSilenceSeconds": round(longest, 3),
        "longestWindow": longest_window,
        "topWindows": sorted_windows[:10],
        "sampleWindows": windows[:20],
        "error": "" if proc.returncode == 0 else text.strip()[-2000:],
    }


def duration_seconds(probe: dict[str, Any]) -> float | None:
    try:
        return float(probe.get("format", {}).get("duration"))
    except (TypeError, ValueError):
        return None


def audio_stream(probe: dict[str, Any]) -> dict[str, Any]:
    for stream in probe.get("streams", []):
        if stream.get("codec_type") == "audio":
            return stream
    return {}


def quality_flags(
    *,
    key: str,
    probe: dict[str, Any],
    volume: dict[str, Any],
    loudness: dict[str, Any] | None,
    silence: dict[str, Any] | None,
    expected_duration: float | None,
) -> list[str]:
    flags: list[str] = []
    stream = audio_stream(probe)
    if not stream:
        flags.append("no audio stream detected")
        return flags
    if str(stream.get("sample_rate")) != "48000":
        flags.append(f"sample rate is {stream.get('sample_rate')}, expected 48000")
    if int(stream.get("channels") or 0) < 1:
        flags.append("channel count is missing or zero")
    duration = duration_seconds(probe)
    if expected_duration and duration is not None and abs(duration - expected_duration) > 0.25:
        flags.append(f"duration delta is {duration - expected_duration:.3f}s")
    max_volume = volume.get("maxVolumeDb")
    if max_volume is not None and max_volume > -0.5:
        flags.append(f"peak headroom is tight at {max_volume:.1f} dB")
    if key == "masterWav" and loudness:
        integrated = loudness.get("integratedLufs")
        true_peak = loudness.get("truePeakDbfs")
        if integrated is not None and not (-17.5 <= integrated <= -14.5):
            flags.append(f"integrated loudness {integrated:.1f} LUFS is outside podcast target band")
        if true_peak is not None and true_peak > -1.0:
            flags.append(f"true peak {true_peak:.1f} dBFS is above conservative delivery target")
    return flags


def build_qc(baseline_dir: Path, *, full: bool) -> dict[str, Any]:
    manifest_path = baseline_dir / "manifest.json"
    manifest = read_json(manifest_path)
    outputs = manifest.get("outputs", {})
    baseline_id = manifest.get("baselineId", "unknown")
    expected_duration = manifest.get("expectedTimelineDurationSeconds")

    artifacts: dict[str, Any] = {}
    warnings: list[str] = []
    advisories: list[str] = []
    for key in MEDIA_KEYS:
        path_text = outputs.get(key, {}).get("path")
        if not path_text:
            artifacts[key] = {"exists": False, "warnings": ["missing from manifest"]}
            warnings.append(f"{key}: missing from manifest")
            continue
        path = Path(path_text)
        if not path.exists():
            artifacts[key] = {"path": str(path), "exists": False, "warnings": ["file missing"]}
            warnings.append(f"{key}: file missing")
            continue
        probe = ffprobe(path)
        volume = volumedetect(path)
        loudness = ebur128(path) if key in ("masterWav", "masterM4a") else None
        silence = silencedetect(path) if full and key in ("masterWav", "sourceAwareMix") else None
        item_warnings = quality_flags(
            key=key,
            probe=probe,
            volume=volume,
            loudness=loudness,
            silence=silence,
            expected_duration=expected_duration,
        )
        item_advisories: list[str] = []
        if key == "masterWav" and silence and silence.get("longestSilenceSeconds", 0) > 8:
            window = silence.get("longestWindow") or {}
            item_advisories.append(
                "long silence detected on the full synchronized spine: "
                f"{silence['longestSilenceSeconds']}s around {window.get('start')}s. "
                "This may be acceptable sync-layer truth, but final edit branches should review or skip it."
            )
        warnings.extend([f"{key}: {warning}" for warning in item_warnings])
        advisories.extend([f"{key}: {advisory}" for advisory in item_advisories])
        stream = audio_stream(probe)
        artifacts[key] = {
            "path": str(path),
            "exists": True,
            "probe": {
                "durationSeconds": duration_seconds(probe),
                "codec": stream.get("codec_name"),
                "sampleRate": stream.get("sample_rate"),
                "channels": stream.get("channels"),
                "channelLayout": stream.get("channel_layout"),
                "bitsPerSample": stream.get("bits_per_sample"),
                "sizeBytes": probe.get("format", {}).get("size"),
            },
            "volume": volume,
            "loudness": loudness,
            "silence": silence,
            "warnings": item_warnings,
            "advisories": item_advisories,
        }

    source_report_path = outputs.get("sourceContributionReport")
    source_report = read_json(Path(source_report_path)) if source_report_path and Path(source_report_path).exists() else {}
    packet = {
        "schema": "quipsly.audio-workbench.baseline-qc.v1",
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "baselineDir": str(baseline_dir),
        "baselineId": baseline_id,
        "expectedTimelineDurationSeconds": expected_duration,
        "fullAnalysis": full,
        "approvalStatus": manifest.get("approvalStatus"),
        "artifacts": artifacts,
        "sourceContributionWarnings": source_report.get("warnings", []),
        "warnings": warnings,
        "advisories": advisories,
        "machineVerdict": {
            "readyForHumanListenProof": not warnings and not source_report.get("warnings", []),
            "publicationApproved": False,
            "reason": (
                "Machine QC can prove file integrity, loudness boundaries, and obvious level problems; "
                "human listen proof is still required before publication."
            ),
        },
        "nextSafestAction": (
            "If warnings are empty, listen-proof the current master and proof windows. "
            "If a warning appears, adjust only the corresponding stage and render a new baseline version."
        ),
    }
    return packet


def write_markdown(packet: dict[str, Any], path: Path) -> None:
    lines = [
        "# Audio Workbench baseline QC",
        "",
        f"- Baseline: `{packet.get('baselineId')}`",
        f"- Status: `{packet.get('approvalStatus')}`",
        f"- Expected timeline duration: `{packet.get('expectedTimelineDurationSeconds')}` seconds",
        f"- Full analysis: `{packet.get('fullAnalysis')}`",
        f"- Ready for human listen proof: `{packet.get('machineVerdict', {}).get('readyForHumanListenProof')}`",
        "",
        "## Artifact checks",
        "",
        "| Artifact | Duration | Codec | Sample rate | Channels | Mean dB | Max dB | LUFS | True peak | Warnings | Advisories |",
        "|---|---:|---|---:|---:|---:|---:|---:|---:|---|---|",
    ]
    for key, item in packet.get("artifacts", {}).items():
        probe = item.get("probe", {})
        volume = item.get("volume", {})
        loudness = item.get("loudness") or {}
        lines.append(
            "| "
            + " | ".join(
                [
                    key,
                    str(probe.get("durationSeconds")),
                    str(probe.get("codec")),
                    str(probe.get("sampleRate")),
                    str(probe.get("channels")),
                    str(volume.get("meanVolumeDb")),
                    str(volume.get("maxVolumeDb")),
                    str(loudness.get("integratedLufs")),
                    str(loudness.get("truePeakDbfs")),
                    "; ".join(item.get("warnings", [])) or "none",
                    "; ".join(item.get("advisories", [])) or "none",
                ]
            )
            + " |"
        )
    lines.extend(["", "## Silence checks", ""])
    for key, item in packet.get("artifacts", {}).items():
        silence = item.get("silence")
        if not silence:
            continue
        lines.extend(
            [
                f"### {key}",
                "",
                f"- Threshold: `{silence.get('noiseDb')}` dB for `{silence.get('minDurationSeconds')}` seconds",
                f"- Count: `{silence.get('count')}`",
                f"- Total silence: `{silence.get('totalSilenceSeconds')}` seconds",
                f"- Longest silence: `{silence.get('longestSilenceSeconds')}` seconds",
                f"- Longest window: `{silence.get('longestWindow')}`",
                "",
            ]
        )
    lines.extend(
        [
            "## Warnings",
            "",
            *([f"- {warning}" for warning in packet.get("warnings", [])] or ["- none"]),
            "",
            "## Advisories",
            "",
            *([f"- {advisory}" for advisory in packet.get("advisories", [])] or ["- none"]),
            "",
            "## Next safest action",
            "",
            packet.get("nextSafestAction", ""),
            "",
        ]
    )
    path.write_text("\n".join(lines), encoding="utf-8")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--baseline-dir", required=True, type=Path)
    parser.add_argument("--full", action="store_true", help="Run slower full-file silence checks.")
    args = parser.parse_args()

    baseline_dir = resolve_baseline_dir(args.baseline_dir)
    packet = build_qc(baseline_dir, full=args.full)
    version = version_from_baseline_id(packet.get("baselineId", "unknown"))
    json_path = baseline_dir / f"audio-workbench-qc-{version}.json"
    markdown_path = baseline_dir / f"audio-workbench-qc-{version}.md"
    write_json(json_path, packet)
    write_markdown(packet, markdown_path)
    manifest_path = baseline_dir / "manifest.json"
    manifest = read_json(manifest_path)
    master = packet.get("artifacts", {}).get("masterWav", {})
    master_probe = master.get("probe", {})
    master_volume = master.get("volume", {})
    duration = master_probe.get("durationSeconds")
    expected = packet.get("expectedTimelineDurationSeconds")
    duration_delta = None
    if isinstance(duration, (int, float)) and isinstance(expected, (int, float)):
        duration_delta = round(duration - expected, 3)
    manifest.setdefault("outputs", {})["qualityReport"] = str(json_path)
    manifest.setdefault("outputs", {})["qualityReportMarkdown"] = str(markdown_path)
    manifest["qualitySummary"] = {
        "generatedAt": packet.get("generatedAt"),
        "durationMatchesExpected": abs(duration_delta) <= 0.25 if duration_delta is not None else False,
        "durationDeltaSeconds": duration_delta,
        "meanVolumeDb": master_volume.get("meanVolumeDb"),
        "maxVolumeDb": master_volume.get("maxVolumeDb"),
        "integratedLufs": (master.get("loudness") or {}).get("integratedLufs"),
        "truePeakDbfs": (master.get("loudness") or {}).get("truePeakDbfs"),
        "sourceContributionWarningCount": len(packet.get("sourceContributionWarnings", [])),
        "warnings": packet.get("warnings", []),
        "advisories": packet.get("advisories", []),
        "readyForHumanListenProof": packet.get("machineVerdict", {}).get("readyForHumanListenProof"),
        "publicationApproved": False,
    }
    write_json(manifest_path, manifest)
    print(json.dumps({"json": str(json_path), "markdown": str(markdown_path)}, indent=2))


if __name__ == "__main__":
    main()
