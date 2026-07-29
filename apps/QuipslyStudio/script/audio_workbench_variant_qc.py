#!/usr/bin/env python3
"""QC and listening-board generator for Audio Workbench profile variants.

The profile-variant renderer creates proof clips. This script makes those clips
reviewable: it checks media integrity, loudness, peaks, silence, writes a
machine-readable QC packet, writes a human markdown board, and creates an M3U
playlist ordered for listen proof.
"""
from __future__ import annotations

import argparse
import json
import re
import statistics
import subprocess
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


LISTEN_ORDER = (
    "currentSourceAwareMix",
    "currentMaster",
    "conservative-human",
    "homer-preserving-clean",
    "aggressive-rescue",
)


def run_capture(cmd: list[str]) -> subprocess.CompletedProcess[str]:
    return subprocess.run(cmd, text=True, capture_output=True, check=False)


def read_json(path: Path) -> dict[str, Any]:
    return json.loads(path.read_text(encoding="utf-8"))


def write_json(path: Path, value: dict[str, Any]) -> None:
    path.write_text(json.dumps(value, indent=2, sort_keys=True), encoding="utf-8")


def parse_float(pattern: str, text: str) -> float | None:
    match = re.search(pattern, text)
    if not match:
        return None
    try:
        return float(match.group(1))
    except ValueError:
        return None


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
        return {"ok": False, "error": proc.stderr.strip() or proc.stdout.strip()}
    data = json.loads(proc.stdout)
    stream = next((item for item in data.get("streams", []) if item.get("codec_type") == "audio"), {})
    try:
        duration = float(data.get("format", {}).get("duration"))
    except (TypeError, ValueError):
        duration = None
    return {
        "ok": True,
        "durationSeconds": duration,
        "codec": stream.get("codec_name"),
        "sampleRate": int(stream.get("sample_rate") or 0),
        "channels": int(stream.get("channels") or 0),
        "sizeBytes": int(data.get("format", {}).get("size") or 0),
    }


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
    text = proc.stderr
    return {
        "ok": proc.returncode == 0,
        "meanVolumeDb": parse_float(r"mean_volume:\s*(-?\d+(?:\.\d+)?) dB", text),
        "maxVolumeDb": parse_float(r"max_volume:\s*(-?\d+(?:\.\d+)?) dB", text),
        "error": "" if proc.returncode == 0 else text.strip()[-1600:],
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
        "error": "" if proc.returncode == 0 else text.strip()[-1600:],
    }


def silencedetect(path: Path, *, noise_db: int = -48, min_duration: float = 0.75) -> dict[str, Any]:
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
    durations = [float(value) for value in re.findall(r"silence_duration:\s*([0-9.]+)", text)]
    return {
        "ok": proc.returncode == 0,
        "noiseDb": noise_db,
        "minDurationSeconds": min_duration,
        "count": len(durations),
        "totalSilenceSeconds": round(sum(durations), 3),
        "longestSilenceSeconds": round(max(durations, default=0.0), 3),
        "error": "" if proc.returncode == 0 else text.strip()[-1600:],
    }


def item_warnings(
    *,
    path: Path,
    expected_duration: float,
    probe: dict[str, Any],
    volume: dict[str, Any],
    loudness: dict[str, Any],
    silence: dict[str, Any],
) -> list[str]:
    warnings: list[str] = []
    if not path.exists():
        return ["file missing"]
    if not probe.get("ok"):
        return [f"ffprobe failed: {probe.get('error')}"]
    duration = probe.get("durationSeconds")
    if duration is None:
        warnings.append("duration missing")
    elif abs(duration - expected_duration) > 0.35:
        warnings.append(f"duration delta {duration - expected_duration:.3f}s")
    if probe.get("sampleRate") != 48000:
        warnings.append(f"sample rate {probe.get('sampleRate')}, expected 48000")
    if probe.get("channels") not in (1, 2):
        warnings.append(f"unexpected channel count {probe.get('channels')}")
    max_volume = volume.get("maxVolumeDb")
    if max_volume is not None and max_volume > -0.3:
        warnings.append(f"peak headroom tight at {max_volume:.1f} dB")
    true_peak = loudness.get("truePeakDbfs")
    if true_peak is not None and true_peak > -0.8:
        warnings.append(f"true peak high at {true_peak:.1f} dBFS")
    integrated = loudness.get("integratedLufs")
    if integrated is not None and not (-19.5 <= integrated <= -13.0):
        warnings.append(f"proof loudness unusual at {integrated:.1f} LUFS")
    if silence.get("longestSilenceSeconds", 0) > max(2.0, expected_duration * 0.4):
        warnings.append(f"long silence {silence.get('longestSilenceSeconds')}s")
    return warnings


def collect_items(packet: dict[str, Any]) -> list[dict[str, Any]]:
    items: list[dict[str, Any]] = []
    for window in packet.get("windows", []):
        label = window["label"]
        start = float(window["start"])
        expected_duration = float(window["duration"])
        for key, item in window.get("excerpts", {}).items():
            items.append(
                {
                    "windowLabel": label,
                    "windowStart": start,
                    "expectedDurationSeconds": expected_duration,
                    "group": "current",
                    "key": key,
                    "path": item.get("path"),
                }
            )
        for key, item in window.get("variants", {}).items():
            items.append(
                {
                    "windowLabel": label,
                    "windowStart": start,
                    "expectedDurationSeconds": expected_duration,
                    "group": "variant",
                    "key": key,
                    "path": item.get("path"),
                }
            )
    return items


def profile_summary(items: list[dict[str, Any]]) -> dict[str, Any]:
    grouped: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for item in items:
        grouped[item["key"]].append(item)
    summary: dict[str, Any] = {}
    for key, values in grouped.items():
        integrated = [item["loudness"].get("integratedLufs") for item in values if item["loudness"].get("integratedLufs") is not None]
        true_peaks = [item["loudness"].get("truePeakDbfs") for item in values if item["loudness"].get("truePeakDbfs") is not None]
        max_volumes = [item["volume"].get("maxVolumeDb") for item in values if item["volume"].get("maxVolumeDb") is not None]
        longest_silences = [item["silence"].get("longestSilenceSeconds") for item in values if item["silence"].get("longestSilenceSeconds") is not None]
        warnings = [warning for item in values for warning in item.get("warnings", [])]
        summary[key] = {
            "clipCount": len(values),
            "warningCount": len(warnings),
            "warnings": warnings[:20],
            "medianIntegratedLufs": round(statistics.median(integrated), 2) if integrated else None,
            "maxTruePeakDbfs": round(max(true_peaks), 2) if true_peaks else None,
            "maxVolumeDb": round(max(max_volumes), 2) if max_volumes else None,
            "medianLongestSilenceSeconds": round(statistics.median(longest_silences), 3) if longest_silences else None,
        }
    return summary


def choose_machine_recommendation(summary: dict[str, Any], packet: dict[str, Any]) -> dict[str, Any]:
    variants = ["homer-preserving-clean", "conservative-human", "aggressive-rescue"]
    preferred = min(
        variants,
        key=lambda key: (
            summary.get(key, {}).get("warningCount", 999),
            variants.index(key),
        ),
    )
    return {
        "preferredListenCandidate": preferred,
        "reason": (
            "The source-activity map flagged Homer retention risk, so the first listen candidate should preserve Homer "
            "unless human ears prove it lets too much park/noise through. Machine QC only ranks structural viability."
        ),
        "doNotAutoPromote": True,
        "nextAction": "Listen to current master vs preferred candidate across the packet before rendering v006.",
    }


def write_playlist(items: list[dict[str, Any]], path: Path) -> None:
    by_window: dict[str, dict[str, dict[str, Any]]] = defaultdict(dict)
    for item in items:
        by_window[item["windowLabel"]][item["key"]] = item
    lines = ["#EXTM3U"]
    for window_label, keyed in by_window.items():
        lines.append(f"# {window_label}")
        for key in LISTEN_ORDER:
            item = keyed.get(key)
            if item and item.get("path"):
                lines.append(f"#EXTINF:-1,{window_label} - {key}")
                lines.append(item["path"])
    path.write_text("\n".join(lines) + "\n", encoding="utf-8")


def write_markdown(report: dict[str, Any], path: Path) -> None:
    lines = [
        "# Audio Workbench profile variant QC",
        "",
        f"- Variant packet: `{report['variantPacket']}`",
        f"- Generated: `{report['generatedAt']}`",
        f"- Playlist: `{report['outputs']['playlist']}`",
        f"- Preferred listen candidate: `{report['machineRecommendation']['preferredListenCandidate']}`",
        f"- Auto-promote: `{not report['machineRecommendation']['doNotAutoPromote']}`",
        "",
        "## Profile summary",
        "",
        "| Profile | Clips | Warnings | Median LUFS | Max true peak | Longest-silence median |",
        "|---|---:|---:|---:|---:|---:|",
    ]
    for key, summary in report["profileSummary"].items():
        lines.append(
            f"| `{key}` | {summary['clipCount']} | {summary['warningCount']} | "
            f"{summary['medianIntegratedLufs']} | {summary['maxTruePeakDbfs']} | {summary['medianLongestSilenceSeconds']} |"
        )

    lines.extend(
        [
            "",
            "## Listen protocol",
            "",
            "For each window, listen in this order:",
            "",
            "1. current source-aware mix",
            "2. current mastered spine",
            "3. conservative-human",
            "4. homer-preserving-clean",
            "5. aggressive-rescue",
            "",
            "Choose the profile that keeps Homer present, reduces Charlie phone-call echo, keeps laughter/reactions alive, and avoids fake shiny restoration artifacts.",
            "",
            "## Machine recommendation",
            "",
            report["machineRecommendation"]["reason"],
            "",
            f"Next action: {report['machineRecommendation']['nextAction']}",
            "",
            "## Warnings",
            "",
        ]
    )
    all_warnings = [item for item in report["items"] if item.get("warnings")]
    if not all_warnings:
        lines.append("- No structural warnings detected.")
    for item in all_warnings[:40]:
        lines.append(f"- `{item['windowLabel']}` / `{item['key']}`: {'; '.join(item['warnings'])}")

    lines.extend(["", "## Review windows", ""])
    for item in report["items"]:
        if item["key"] not in LISTEN_ORDER:
            continue
        lines.append(
            f"- `{item['windowLabel']}` / `{item['key']}`: "
            f"LUFS `{item['loudness'].get('integratedLufs')}`, peak `{item['loudness'].get('truePeakDbfs')}`, "
            f"path `{item['path']}`"
        )
    lines.append("")
    path.write_text("\n".join(lines), encoding="utf-8")


def build_qc(packet_path: Path) -> dict[str, Any]:
    packet = read_json(packet_path)
    output_dir = Path(packet["outputDir"])
    items = []
    for item in collect_items(packet):
        path = Path(item["path"]) if item.get("path") else Path("")
        probe = ffprobe(path) if path.exists() else {"ok": False, "error": "file missing"}
        volume = volumedetect(path) if path.exists() else {"ok": False}
        loudness = ebur128(path) if path.exists() else {"ok": False}
        silence = silencedetect(path) if path.exists() else {"ok": False}
        warnings = item_warnings(
            path=path,
            expected_duration=item["expectedDurationSeconds"],
            probe=probe,
            volume=volume,
            loudness=loudness,
            silence=silence,
        )
        items.append(
            {
                **item,
                "probe": probe,
                "volume": volume,
                "loudness": loudness,
                "silence": silence,
                "warnings": warnings,
            }
        )

    summary = profile_summary(items)
    playlist_path = output_dir / "audio-workbench-profile-variant-listen-proof.m3u"
    json_path = output_dir / "audio-workbench-profile-variant-qc.json"
    md_path = output_dir / "audio-workbench-profile-variant-qc.md"
    write_playlist(items, playlist_path)
    report = {
        "schema": "quipsly.audio-workbench.profile-variant-qc.v1",
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "variantPacket": str(packet_path),
        "outputDir": str(output_dir),
        "profileSummary": summary,
        "machineRecommendation": choose_machine_recommendation(summary, packet),
        "items": items,
        "outputs": {
            "json": str(json_path),
            "markdown": str(md_path),
            "playlist": str(playlist_path),
        },
    }
    write_json(json_path, report)
    write_markdown(report, md_path)
    return report


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--variant-packet", required=True, type=Path)
    args = parser.parse_args()
    report = build_qc(args.variant_packet)
    print(json.dumps(report["outputs"], indent=2))


if __name__ == "__main__":
    main()
