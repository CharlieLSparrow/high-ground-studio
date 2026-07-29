#!/usr/bin/env python3
"""Run non-mutating machine audio checks over proof-window listen files.

This script analyzes the short proof snippets already produced for a candidate
baseline. It does not approve, render, enhance, or mutate audio. Its job is to
give reviewers and agents objective clues beside the human listen session:
duration agreement, broad level changes, silence ratio, clipping risk, and
missing-file state.
"""

from __future__ import annotations

import argparse
import json
import re
import shutil
import subprocess
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


SNIPPET_KEYS = [
    "rawAligned",
    "sourceAwareContributionMix",
    "conformedMasterSpine",
    "speakerSplitCharlieLeftHomerRight",
]


def load_json(path: Path) -> dict[str, Any]:
    return json.loads(path.read_text(encoding="utf-8"))


def write_json(path: Path, value: dict[str, Any]) -> None:
    path.write_text(json.dumps(value, indent=2, sort_keys=True) + "\n", encoding="utf-8")


def output_path(value: Any) -> str | None:
    if isinstance(value, str):
        return value
    if isinstance(value, dict):
        path = value.get("path")
        if isinstance(path, str):
            return path
    return None


def resolve_baseline_dir(input_path: Path) -> Path:
    if (input_path / "manifest.json").exists():
        return input_path
    nested = input_path / "work" / "conformed-production-baseline"
    if (nested / "manifest.json").exists():
        return nested
    raise FileNotFoundError(
        "Could not find manifest.json at "
        f"{input_path}/manifest.json or {nested}/manifest.json"
    )


def safe_slug(value: str) -> str:
    slug = "".join(ch.lower() if ch.isalnum() else "-" for ch in value)
    while "--" in slug:
        slug = slug.replace("--", "-")
    return slug.strip("-") or "audio-baseline"


def run_command(args: list[str]) -> tuple[int, str]:
    completed = subprocess.run(args, capture_output=True, text=True)
    return completed.returncode, (completed.stdout or "") + (completed.stderr or "")


def ffprobe_duration(path: Path, ffprobe: str) -> float | None:
    code, text = run_command(
        [
            ffprobe,
            "-v",
            "error",
            "-show_entries",
            "format=duration",
            "-of",
            "json",
            str(path),
        ]
    )
    if code != 0:
        return None
    try:
        data = json.loads(text)
        return round(float(data["format"]["duration"]), 3)
    except (KeyError, TypeError, ValueError, json.JSONDecodeError):
        return None


def parse_db_field(text: str, field: str) -> float | None:
    match = re.search(rf"{re.escape(field)}:\\s*(-?\\d+(?:\\.\\d+)?)\\s*dB", text)
    if not match:
        return None
    return round(float(match.group(1)), 2)


def volumedetect(path: Path, ffmpeg: str) -> dict[str, Any]:
    code, text = run_command(
        [
            ffmpeg,
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
    return {
        "ok": code == 0,
        "meanVolumeDb": parse_db_field(text, "mean_volume"),
        "maxVolumeDb": parse_db_field(text, "max_volume"),
    }


def silence_summary(path: Path, ffmpeg: str, duration: float | None) -> dict[str, Any]:
    code, text = run_command(
        [
            ffmpeg,
            "-hide_banner",
            "-nostats",
            "-i",
            str(path),
            "-af",
            "silencedetect=noise=-45dB:d=0.25",
            "-f",
            "null",
            "-",
        ]
    )
    durations = [float(value) for value in re.findall(r"silence_duration:\\s*(\\d+(?:\\.\\d+)?)", text)]
    total = round(sum(durations), 3)
    ratio = None
    if duration and duration > 0:
        ratio = round(min(total / duration, 1.0), 4)
    return {
        "ok": code == 0,
        "silenceDurationSeconds": total,
        "silenceEventCount": len(durations),
        "silenceRatio": ratio,
    }


def analyze_file(path_text: str | None, expected_duration: float | None, ffmpeg: str, ffprobe: str) -> dict[str, Any]:
    result: dict[str, Any] = {
        "path": path_text,
        "exists": False,
        "durationSeconds": None,
        "durationDeltaSeconds": None,
        "meanVolumeDb": None,
        "maxVolumeDb": None,
        "silenceDurationSeconds": None,
        "silenceRatio": None,
        "warnings": [],
    }
    if not path_text:
        result["warnings"].append("missing-path")
        return result
    path = Path(path_text)
    if not path.exists():
        result["warnings"].append("missing-file")
        return result

    result["exists"] = True
    duration = ffprobe_duration(path, ffprobe)
    result["durationSeconds"] = duration
    if expected_duration is not None and duration is not None:
        result["durationDeltaSeconds"] = round(duration - float(expected_duration), 3)
        if abs(result["durationDeltaSeconds"]) > 0.35:
            result["warnings"].append("duration-mismatch")

    volume = volumedetect(path, ffmpeg)
    result.update(volume)
    silence = silence_summary(path, ffmpeg, duration)
    result.update(silence)

    max_volume = result.get("maxVolumeDb")
    mean_volume = result.get("meanVolumeDb")
    silence_ratio = result.get("silenceRatio")
    if max_volume is not None and max_volume >= -0.5:
        result["warnings"].append("near-digital-peak")
    if mean_volume is not None and mean_volume < -38:
        result["warnings"].append("very-low-mean-level")
    if mean_volume is not None and mean_volume > -10:
        result["warnings"].append("very-hot-mean-level")
    if silence_ratio is not None and silence_ratio > 0.35:
        result["warnings"].append("high-silence-ratio")
    return result


def build_window_analysis(outputs: dict[str, Any], ffmpeg: str, ffprobe: str) -> list[dict[str, Any]]:
    windows: list[dict[str, Any]] = []
    for index, snippet in enumerate(outputs.get("proofSnippets") or [], start=1):
        if not isinstance(snippet, dict):
            continue
        expected_duration = snippet.get("durationSeconds")
        label = str(snippet.get("label") or f"proof-window-{index}")
        files = {
            key: analyze_file(output_path(snippet.get(key)), expected_duration, ffmpeg, ffprobe)
            for key in SNIPPET_KEYS
        }
        warnings: list[str] = []
        for key, metrics in files.items():
            for warning in metrics.get("warnings") or []:
                warnings.append(f"{key}:{warning}")
        source_mean = files.get("sourceAwareContributionMix", {}).get("meanVolumeDb")
        conformed_mean = files.get("conformedMasterSpine", {}).get("meanVolumeDb")
        conformed_vs_source_delta = None
        if source_mean is not None and conformed_mean is not None:
            conformed_vs_source_delta = round(float(conformed_mean) - float(source_mean), 2)
            if abs(conformed_vs_source_delta) > 8:
                warnings.append("conformed-vs-source-aware-large-level-shift")
        raw_mean = files.get("rawAligned", {}).get("meanVolumeDb")
        conformed_vs_raw_delta = None
        if raw_mean is not None and conformed_mean is not None:
            conformed_vs_raw_delta = round(float(conformed_mean) - float(raw_mean), 2)
        windows.append(
            {
                "listenOrder": index,
                "label": label,
                "sequenceStartSeconds": snippet.get("sequenceStartSeconds"),
                "expectedDurationSeconds": expected_duration,
                "files": files,
                "conformedVsSourceAwareMeanDeltaDb": conformed_vs_source_delta,
                "conformedVsRawMeanDeltaDb": conformed_vs_raw_delta,
                "warningCount": len(warnings),
                "warnings": warnings,
            }
        )
    return windows


def summarize(windows: list[dict[str, Any]]) -> dict[str, Any]:
    file_count = 0
    missing_file_count = 0
    warning_count = 0
    near_peak_count = 0
    duration_mismatch_count = 0
    for window in windows:
        warning_count += int(window.get("warningCount") or 0)
        for metrics in (window.get("files") or {}).values():
            file_count += 1
            if not metrics.get("exists"):
                missing_file_count += 1
            warnings = metrics.get("warnings") or []
            if "near-digital-peak" in warnings:
                near_peak_count += 1
            if "duration-mismatch" in warnings:
                duration_mismatch_count += 1
    return {
        "windowCount": len(windows),
        "analyzedFileSlots": file_count,
        "missingFileCount": missing_file_count,
        "warningCount": warning_count,
        "nearDigitalPeakCount": near_peak_count,
        "durationMismatchCount": duration_mismatch_count,
    }


def render_markdown(payload: dict[str, Any]) -> str:
    lines = [
        f"# Proof-window audio lab: {payload['baselineId']}",
        "",
        f"Generated: `{payload['generatedAt']}`",
        "",
        "This is machine-side audio evidence for the human listen gate. It does not approve, fail, render, or mutate media.",
        "",
        "## Summary",
        "",
        f"- Approval status: `{payload['approvalStatus']}`",
        f"- Original media mutated: `{str(payload['originalMediaMutated']).lower()}`",
        f"- Windows analyzed: `{payload['summary']['windowCount']}`",
        f"- File slots analyzed: `{payload['summary']['analyzedFileSlots']}`",
        f"- Missing files: `{payload['summary']['missingFileCount']}`",
        f"- Warning count: `{payload['summary']['warningCount']}`",
        f"- Near digital peak count: `{payload['summary']['nearDigitalPeakCount']}`",
        f"- Duration mismatch count: `{payload['summary']['durationMismatchCount']}`",
        "",
        "## Window overview",
        "",
        "| Window | Start | Conf vs source-aware mean | Conf vs raw mean | Warnings |",
        "|---|---:|---:|---:|---|",
    ]
    for window in payload["windows"]:
        warnings = ", ".join(window.get("warnings") or []) or "none"
        lines.append(
            f"| {window.get('label')} | {window.get('sequenceStartSeconds')} | {window.get('conformedVsSourceAwareMeanDeltaDb')} dB | {window.get('conformedVsRawMeanDeltaDb')} dB | {warnings} |"
        )

    for window in payload["windows"]:
        lines.extend(
            [
                "",
                f"## {window.get('label')}",
                "",
                "| File | Duration | Delta | Mean dB | Max dB | Silence ratio | Warnings | Path |",
                "|---|---:|---:|---:|---:|---:|---|---|",
            ]
        )
        for key in SNIPPET_KEYS:
            metrics = window["files"].get(key) or {}
            warnings = ", ".join(metrics.get("warnings") or []) or "none"
            lines.append(
                f"| {key} | {metrics.get('durationSeconds')} | {metrics.get('durationDeltaSeconds')} | {metrics.get('meanVolumeDb')} | {metrics.get('maxVolumeDb')} | {metrics.get('silenceRatio')} | {warnings} | `{metrics.get('path')}` |"
            )
    lines.extend(
        [
            "",
            "## How to use this",
            "",
            "- Treat warnings as listen priorities, not automatic failures.",
            "- Large conformed-vs-source-aware shifts are often mastering or repair clues; listen before repairing.",
            "- Near digital peak warnings should be investigated before final publication, even if the short proof window sounds acceptable.",
            "- Duration mismatch warnings can indicate stale snippet files or export drift.",
            "",
        ]
    )
    return "\n".join(lines)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--baseline-dir", required=True, type=Path)
    args = parser.parse_args()

    ffmpeg = shutil.which("ffmpeg")
    ffprobe = shutil.which("ffprobe")
    if not ffmpeg or not ffprobe:
        raise SystemExit("ffmpeg and ffprobe must be available on PATH")

    baseline_dir = resolve_baseline_dir(args.baseline_dir.expanduser()).resolve()
    manifest_path = baseline_dir / "manifest.json"
    manifest = load_json(manifest_path)
    outputs = manifest.setdefault("outputs", {})

    timestamp = datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S")
    baseline_id = str(manifest.get("baselineId") or "audio-baseline")
    slug = safe_slug(baseline_id.replace("episode-4-conformed-production-baseline-", ""))
    json_path = baseline_dir / f"audio-proof-window-audio-lab-{slug}-{timestamp}.json"
    md_path = baseline_dir / f"audio-proof-window-audio-lab-{slug}-{timestamp}.md"

    windows = build_window_analysis(outputs, ffmpeg, ffprobe)
    payload = {
        "schema": "quipsly.audio-workbench.proof-window-audio-lab.v1",
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "baselineDir": str(baseline_dir),
        "baselineId": baseline_id,
        "approvalStatus": manifest.get("approvalStatus"),
        "originalMediaMutated": False,
        "ffmpeg": ffmpeg,
        "ffprobe": ffprobe,
        "summary": summarize(windows),
        "windows": windows,
        "markdown": str(md_path),
        "json": str(json_path),
    }
    write_json(json_path, payload)
    md_path.write_text(render_markdown(payload) + "\n", encoding="utf-8")

    outputs["latestProofWindowAudioLab"] = str(json_path)
    outputs["latestProofWindowAudioLabMarkdown"] = str(md_path)
    history = outputs.setdefault("proofWindowAudioLabs", [])
    if str(json_path) not in history:
        history.append(str(json_path))
    manifest["proofWindowAudioLabCount"] = len(history)
    manifest["proofWindowAudioLabWarningCount"] = int(payload["summary"]["warningCount"])
    manifest["proofWindowAudioLabMissingFileCount"] = int(payload["summary"]["missingFileCount"])
    manifest_path.write_text(json.dumps(manifest, indent=2, sort_keys=True) + "\n", encoding="utf-8")

    print(f"Wrote {md_path}")
    print(f"Wrote {json_path}")
    print(f"Windows analyzed: {payload['summary']['windowCount']}")
    print(f"Warning count: {payload['summary']['warningCount']}")
    print(f"Missing file count: {payload['summary']['missingFileCount']}")
    print("Approval state changed: false")


if __name__ == "__main__":
    main()
