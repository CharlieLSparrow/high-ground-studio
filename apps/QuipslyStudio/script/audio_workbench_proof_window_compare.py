#!/usr/bin/env python3
"""Compare Audio Workbench listen-proof windows with machine measurements.

This is not a human-listen replacement. It is a flashlight. For each proof
window it compares raw aligned evidence, candidate source-aware mix, candidate
master, and speaker-split diagnostics so reviewers can quickly spot suspicious
level changes before deciding whether a candidate can become the branch audio
spine.
"""
from __future__ import annotations

import argparse
import json
import re
import subprocess
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


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


def output_suffix(baseline_id: str) -> str:
    marker = "episode-4-conformed-production-baseline-"
    return baseline_id.replace(marker, "") if baseline_id.startswith(marker) else baseline_id


def run_capture(cmd: list[str]) -> subprocess.CompletedProcess[str]:
    return subprocess.run(cmd, text=True, capture_output=True, check=False)


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
        return {"error": proc.stderr.strip() or proc.stdout.strip()}
    return json.loads(proc.stdout)


def audio_stream(probe: dict[str, Any]) -> dict[str, Any]:
    for stream in probe.get("streams", []):
        if stream.get("codec_type") == "audio":
            return stream
    return {}


def duration_seconds(probe: dict[str, Any]) -> float | None:
    try:
        return float(probe.get("format", {}).get("duration"))
    except (TypeError, ValueError):
        return None


def volumedetect(path: Path, *, channel: str | None = None) -> dict[str, Any]:
    cmd = ["ffmpeg", "-hide_banner", "-nostats", "-i", str(path)]
    if channel == "left":
        cmd.extend(["-af", "pan=mono|c0=c0,volumedetect"])
    elif channel == "right":
        cmd.extend(["-af", "pan=mono|c0=c1,volumedetect"])
    else:
        cmd.extend(["-af", "volumedetect"])
    cmd.extend(["-f", "null", "-"])
    proc = run_capture(cmd)
    stderr = proc.stderr
    return {
        "ok": proc.returncode == 0,
        "meanVolumeDb": parse_float(r"mean_volume:\s*(-?\d+(?:\.\d+)?) dB", stderr),
        "maxVolumeDb": parse_float(r"max_volume:\s*(-?\d+(?:\.\d+)?) dB", stderr),
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


def classify_item(item: dict[str, Any]) -> str:
    note = (item.get("sourceNote") or "").lower()
    title = (item.get("title") or "").lower()
    if "raw" in note or "raw aligned" in title or "parent evidence" in title:
        return "raw"
    if "source-aware" in note or "source-aware" in title:
        return "sourceAware"
    if "master" in note or "mastered" in title:
        return "mastered"
    if "speaker split" in note or "speaker split" in title or item.get("role") == "diagnostic":
        return "speakerSplit"
    return item.get("role") or "unknown"


def measure_item(item: dict[str, Any]) -> dict[str, Any]:
    path = Path(item["bundlePath"])
    if not path.exists():
        return {"path": str(path), "exists": False, "error": "bundle item missing"}
    probe = ffprobe(path)
    stream = audio_stream(probe)
    volume = volumedetect(path)
    loudness = ebur128(path)
    channel_balance = None
    if int(stream.get("channels") or 0) >= 2 and classify_item(item) == "speakerSplit":
        left = volumedetect(path, channel="left")
        right = volumedetect(path, channel="right")
        left_mean = left.get("meanVolumeDb")
        right_mean = right.get("meanVolumeDb")
        channel_balance = {
            "leftMeanVolumeDb": left_mean,
            "rightMeanVolumeDb": right_mean,
            "leftRightMeanDeltaDb": round(left_mean - right_mean, 2)
            if isinstance(left_mean, (int, float)) and isinstance(right_mean, (int, float))
            else None,
        }
    return {
        "path": str(path),
        "exists": True,
        "kind": classify_item(item),
        "title": item.get("title"),
        "role": item.get("role"),
        "windowLabel": item.get("windowLabel"),
        "sequenceStartSeconds": item.get("sequenceStartSeconds"),
        "durationSeconds": duration_seconds(probe),
        "codec": stream.get("codec_name"),
        "sampleRate": stream.get("sample_rate"),
        "channels": stream.get("channels"),
        "volume": volume,
        "loudness": loudness,
        "channelBalance": channel_balance,
    }


def delta(a: float | None, b: float | None) -> float | None:
    if isinstance(a, (int, float)) and isinstance(b, (int, float)):
        return round(a - b, 2)
    return None


def window_summary(measurements: list[dict[str, Any]]) -> dict[str, Any]:
    by_kind = {item["kind"]: item for item in measurements if item.get("exists")}
    raw = by_kind.get("raw")
    source = by_kind.get("sourceAware")
    mastered = by_kind.get("mastered")
    split = by_kind.get("speakerSplit")
    warnings: list[str] = []

    raw_mean = ((raw or {}).get("volume") or {}).get("meanVolumeDb")
    source_mean = ((source or {}).get("volume") or {}).get("meanVolumeDb")
    master_mean = ((mastered or {}).get("volume") or {}).get("meanVolumeDb")
    source_vs_raw = delta(source_mean, raw_mean)
    master_vs_source = delta(master_mean, source_mean)

    if source_vs_raw is not None and source_vs_raw < -9:
        warnings.append("source-aware mix is much quieter than raw evidence; verify no speaker disappeared")
    if source_vs_raw is not None and source_vs_raw > 6:
        warnings.append("source-aware mix is much louder than raw evidence; verify noise/bleed was not amplified")
    if master_vs_source is not None and abs(master_vs_source) > 6:
        warnings.append("master level changed sharply from source-aware mix; verify mastering did not over-correct")
    if mastered:
        true_peak = ((mastered.get("loudness") or {}).get("truePeakDbfs"))
        if isinstance(true_peak, (int, float)) and true_peak > -1.0:
            warnings.append(f"mastered proof true peak is hot at {true_peak} dBFS")
    if split:
        balance = (split.get("channelBalance") or {}).get("leftRightMeanDeltaDb")
        if isinstance(balance, (int, float)) and abs(balance) > 18:
            warnings.append("speaker split diagnostic is heavily one-sided; verify the quieter speaker is expected")

    return {
        "hasRaw": bool(raw),
        "hasSourceAware": bool(source),
        "hasMastered": bool(mastered),
        "hasSpeakerSplit": bool(split),
        "sourceAwareVsRawMeanDeltaDb": source_vs_raw,
        "masteredVsSourceAwareMeanDeltaDb": master_vs_source,
        "speakerSplitLeftRightMeanDeltaDb": (split.get("channelBalance") or {}).get("leftRightMeanDeltaDb")
        if split
        else None,
        "warnings": warnings,
    }


def build_report(baseline_dir: Path) -> dict[str, Any]:
    manifest_path = baseline_dir / "manifest.json"
    manifest = read_json(manifest_path)
    outputs = manifest.get("outputs", {})
    bundle_manifest_path = outputs.get("listenProofBundleManifest")
    if not bundle_manifest_path:
        raise FileNotFoundError("Baseline manifest missing outputs.listenProofBundleManifest")
    bundle = read_json(Path(bundle_manifest_path))

    grouped: dict[str, list[dict[str, Any]]] = defaultdict(list)
    full_items: list[dict[str, Any]] = []
    for item in bundle.get("items", []):
        if item.get("windowLabel"):
            grouped[item["windowLabel"]].append(item)
        else:
            full_items.append(item)

    windows = []
    all_warnings: list[str] = []
    for label, items in sorted(grouped.items(), key=lambda pair: min(i.get("sequenceStartSeconds") or 0 for i in pair[1])):
        measured = [measure_item(item) for item in items]
        summary = window_summary(measured)
        for warning in summary["warnings"]:
            all_warnings.append(f"{label}: {warning}")
        windows.append(
            {
                "label": label,
                "sequenceStartSeconds": min(item.get("sequenceStartSeconds") or 0 for item in items),
                "itemCount": len(items),
                "summary": summary,
                "items": measured,
            }
        )

    full_measurements = [measure_item(item) for item in full_items]
    baseline_id = manifest.get("baselineId", "unknown-baseline")
    suffix = output_suffix(baseline_id)
    json_path = baseline_dir / f"audio-proof-window-comparison-{suffix}.json"
    md_path = baseline_dir / f"audio-proof-window-comparison-{suffix}.md"
    report = {
        "schema": "quipsly.audio-workbench.proof-window-comparison.v1",
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "baselineDir": str(baseline_dir),
        "baselineId": baseline_id,
        "listenProofBundleManifest": bundle_manifest_path,
        "fullItems": full_measurements,
        "windows": windows,
        "warningCount": len(all_warnings),
        "warnings": all_warnings,
        "interpretation": [
            "This report is numerical triage, not human approval.",
            "Large raw/source/master deltas are listen-priority clues, not automatic failures.",
            "Speaker-split channel deltas help catch missing-source regressions.",
        ],
        "outputs": {
            "json": str(json_path),
            "markdown": str(md_path),
        },
    }
    write_json(json_path, report)
    md_path.write_text(render_markdown(report), encoding="utf-8")
    manifest_outputs = manifest.setdefault("outputs", {})
    manifest_outputs["proofWindowComparison"] = str(json_path)
    manifest_outputs["proofWindowComparisonMarkdown"] = str(md_path)
    write_json(manifest_path, manifest)
    return report


def render_markdown(report: dict[str, Any]) -> str:
    lines = [
        "# Audio Workbench proof-window comparison",
        "",
        f"- Baseline: `{report.get('baselineId')}`",
        f"- Generated: `{report.get('generatedAt')}`",
        f"- Listen bundle manifest: `{report.get('listenProofBundleManifest')}`",
        f"- Warning count: `{report.get('warningCount')}`",
        "",
        "## Full handoff items",
        "",
        "| Item | Duration | Mean dB | Max dB | LUFS | True peak |",
        "|---|---:|---:|---:|---:|---:|",
    ]
    for item in report.get("fullItems", []):
        lines.append(
            "| "
            + " | ".join(
                [
                    item.get("title") or item.get("kind") or "unknown",
                    str(item.get("durationSeconds")),
                    str((item.get("volume") or {}).get("meanVolumeDb")),
                    str((item.get("volume") or {}).get("maxVolumeDb")),
                    str((item.get("loudness") or {}).get("integratedLufs")),
                    str((item.get("loudness") or {}).get("truePeakDbfs")),
                ]
            )
            + " |"
        )

    lines.extend(
        [
            "",
            "## Proof windows",
            "",
            "| Window | Start | Source-aware vs raw mean | Mastered vs source-aware mean | Split L/R delta | Warnings |",
            "|---|---:|---:|---:|---:|---|",
        ]
    )
    for window in report.get("windows", []):
        summary = window.get("summary", {})
        lines.append(
            "| "
            + " | ".join(
                [
                    window.get("label", ""),
                    str(window.get("sequenceStartSeconds")),
                    str(summary.get("sourceAwareVsRawMeanDeltaDb")),
                    str(summary.get("masteredVsSourceAwareMeanDeltaDb")),
                    str(summary.get("speakerSplitLeftRightMeanDeltaDb")),
                    "; ".join(summary.get("warnings", [])) or "none",
                ]
            )
            + " |"
        )

    lines.extend(["", "## Item details", ""])
    for window in report.get("windows", []):
        lines.extend(["", f"### {window.get('label')} @ {window.get('sequenceStartSeconds')}s", ""])
        lines.extend(
            [
                "| Kind | Duration | Mean dB | Max dB | LUFS | True peak |",
                "|---|---:|---:|---:|---:|---:|",
            ]
        )
        for item in window.get("items", []):
            lines.append(
                "| "
                + " | ".join(
                    [
                        item.get("kind") or "unknown",
                        str(item.get("durationSeconds")),
                        str((item.get("volume") or {}).get("meanVolumeDb")),
                        str((item.get("volume") or {}).get("maxVolumeDb")),
                        str((item.get("loudness") or {}).get("integratedLufs")),
                        str((item.get("loudness") or {}).get("truePeakDbfs")),
                    ]
                )
                + " |"
            )

    lines.extend(["", "## Warnings", ""])
    lines.extend([f"- {warning}" for warning in report.get("warnings", [])] or ["- none"])
    lines.extend(["", "## Interpretation", ""])
    lines.extend([f"- {item}" for item in report.get("interpretation", [])])
    lines.append("")
    return "\n".join(lines)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--baseline-dir", required=True, type=Path)
    args = parser.parse_args()

    baseline_dir = resolve_baseline_dir(args.baseline_dir)
    report = build_report(baseline_dir)
    print(json.dumps(report["outputs"], indent=2))


if __name__ == "__main__":
    main()
