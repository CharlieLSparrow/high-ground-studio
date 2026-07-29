#!/usr/bin/env python3
"""Build source-activity visibility for a Quipsly audio baseline.

This is an evidence tool, not an enhancer. It scans aligned and contribution
stems, writes window-level activity metrics, and highlights suspicious windows
for human/Codex proof listening. The intent is to make the Audio Workbench less
magic-box and more studio console: every big voice, bleed, gap, and retained
overlap should be inspectable before we render another expensive spine.
"""
from __future__ import annotations

import argparse
import csv
import json
import math
import statistics
import re
import subprocess
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


STEM_KEYS = (
    "charlieAligned",
    "charlieContribution",
    "homerDjiAligned",
    "homerContribution",
    "referenceAligned",
    "referenceContribution",
)

PAIRINGS = {
    "charlie": ("charlieAligned", "charlieContribution"),
    "homer": ("homerDjiAligned", "homerContribution"),
    "reference": ("referenceAligned", "referenceContribution"),
}


@dataclass(frozen=True)
class WindowMetric:
    index: int
    start: float
    end: float
    dbfs: float | None

    @property
    def energy(self) -> float:
        if self.dbfs is None:
            return 0.0
        return 10 ** (self.dbfs / 10.0)


def read_json(path: Path) -> dict[str, Any]:
    return json.loads(path.read_text(encoding="utf-8"))


def write_json(path: Path, value: dict[str, Any]) -> None:
    path.write_text(json.dumps(value, indent=2, sort_keys=True), encoding="utf-8")


def run_capture(cmd: list[str]) -> subprocess.CompletedProcess[str]:
    return subprocess.run(cmd, text=True, capture_output=True, check=False)


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


def manifest_output_path(outputs: dict[str, Any], key: str) -> Path | None:
    value = outputs.get(key)
    if isinstance(value, str):
        return Path(value)
    if isinstance(value, dict) and value.get("path"):
        return Path(value["path"])
    return None


def fmt_db(value: float | None) -> str:
    if value is None:
        return "-inf"
    return f"{value:.1f}"


def fmt_time(seconds: float) -> str:
    seconds_int = int(seconds)
    hours, remainder = divmod(seconds_int, 3600)
    minutes, secs = divmod(remainder, 60)
    if hours:
        return f"{hours:d}:{minutes:02d}:{secs:02d}"
    return f"{minutes:d}:{secs:02d}"


def parse_db(value: str) -> float | None:
    if value == "-inf":
        return None
    try:
        return float(value)
    except ValueError:
        return None


def ffprobe_audio_meta(path: Path) -> dict[str, Any]:
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
        return {"path": str(path), "error": proc.stderr.strip() or proc.stdout.strip()}
    probe = json.loads(proc.stdout)
    stream = next((item for item in probe.get("streams", []) if item.get("codec_type") == "audio"), {})
    duration = None
    try:
        duration = float(probe.get("format", {}).get("duration"))
    except (TypeError, ValueError):
        pass
    return {
        "path": str(path),
        "codec": stream.get("codec_name"),
        "channels": stream.get("channels"),
        "sampleRate": int(stream.get("sample_rate") or 0),
        "durationSeconds": round(duration, 3) if duration is not None else None,
        "sizeBytes": int(probe.get("format", {}).get("size") or 0),
    }


def scan_wav_windows(path: Path, *, window_seconds: float) -> tuple[list[WindowMetric], dict[str, Any]]:
    if not path.exists():
        raise FileNotFoundError(path)

    meta = ffprobe_audio_meta(path)
    sample_rate = int(meta.get("sampleRate") or 48000)
    frames_per_window = max(1, int(sample_rate * window_seconds))
    proc = run_capture(
        [
            "ffmpeg",
            "-hide_banner",
            "-nostats",
            "-i",
            str(path),
            "-af",
            (
                f"asetnsamples=n={frames_per_window}:p=1,"
                "astats=metadata=1:reset=1,"
                "ametadata=print:key=lavfi.astats.Overall.RMS_level"
            ),
            "-f",
            "null",
            "-",
        ]
    )
    if proc.returncode != 0:
        raise RuntimeError(proc.stderr[-4000:])

    windows: list[WindowMetric] = []
    pattern = re.compile(
        r"frame:\s*(\d+)\s+pts:\s*\d+\s+pts_time:([0-9.]+)\s*"
        r"\n\[.*?\]\s+lavfi\.astats\.Overall\.RMS_level=(-inf|-?\d+(?:\.\d+)?)"
    )
    for match in pattern.finditer(proc.stderr):
        index = int(match.group(1))
        start = float(match.group(2))
        duration = window_seconds
        if meta.get("durationSeconds") is not None:
            duration = min(duration, max(0.0, float(meta["durationSeconds"]) - start))
        if duration <= 0:
            continue
        windows.append(
            WindowMetric(
                index=index,
                start=round(start, 3),
                end=round(start + duration, 3),
                dbfs=parse_db(match.group(3)),
            )
        )

    meta["windowSeconds"] = window_seconds
    meta["windowCount"] = len(windows)
    return windows, meta


def load_stem_paths(baseline_dir: Path, manifest: dict[str, Any]) -> dict[str, Path]:
    outputs = manifest.get("outputs", {})
    automation_path = manifest_output_path(outputs, "speakerGapAutomation")
    if not automation_path:
        raise FileNotFoundError("Baseline manifest is missing outputs.speakerGapAutomation")
    automation = read_json(automation_path)
    stems = automation.get("stems", {})
    paths: dict[str, Path] = {}
    for key in STEM_KEYS:
        path_text = stems.get(key, {}).get("path")
        if path_text:
            paths[key] = Path(path_text)
    missing = [key for key in ("charlieAligned", "charlieContribution", "homerDjiAligned", "homerContribution") if key not in paths]
    if missing:
        raise FileNotFoundError(f"Speaker automation is missing required stem paths: {', '.join(missing)}")
    return paths


def linear_db_average(values: list[WindowMetric]) -> float | None:
    if not values:
        return None
    energy = sum(item.energy for item in values) / len(values)
    if energy <= 0:
        return None
    return 20 * math.log10(math.sqrt(energy) / 32768.0)


def summarize_stem(windows: list[WindowMetric], *, threshold_db: float) -> dict[str, Any]:
    active = [item for item in windows if item.dbfs is not None and item.dbfs >= threshold_db]
    db_values = [item.dbfs for item in active if item.dbfs is not None]
    return {
        "windowCount": len(windows),
        "activeWindowCount": len(active),
        "activeSeconds": round(sum(item.end - item.start for item in active), 3),
        "activePercent": round((len(active) / len(windows) * 100.0), 2) if windows else 0,
        "peakDbfs": round(max((item.dbfs for item in windows if item.dbfs is not None), default=-999.0), 2),
        "meanDbfs": round(linear_db_average(windows), 2) if linear_db_average(windows) is not None else None,
        "medianActiveDbfs": round(statistics.median(db_values), 2) if db_values else None,
        "thresholdDbfs": threshold_db,
    }


def retention_summary(
    aligned: list[WindowMetric],
    contribution: list[WindowMetric],
    *,
    active_threshold_db: float,
    loss_delta_db: float,
) -> dict[str, Any]:
    count = min(len(aligned), len(contribution))
    aligned_energy = sum(aligned[i].energy for i in range(count))
    contribution_energy = sum(contribution[i].energy for i in range(count))
    dropped = []
    for i in range(count):
        a = aligned[i]
        c = contribution[i]
        if a.dbfs is None or a.dbfs < active_threshold_db:
            continue
        if c.dbfs is None or c.dbfs < active_threshold_db or (a.dbfs - c.dbfs) >= loss_delta_db:
            dropped.append({"start": a.start, "end": a.end, "alignedDbfs": a.dbfs, "contributionDbfs": c.dbfs})
    ratio = contribution_energy / aligned_energy if aligned_energy > 0 else None
    return {
        "energyRetentionRatio": round(ratio, 4) if ratio is not None else None,
        "energyRetentionDb": round(10 * math.log10(ratio), 2) if ratio and ratio > 0 else None,
        "droppedActiveWindowCount": len(dropped),
        "topDroppedWindows": dropped[:20],
    }


def classify_windows(
    metrics: dict[str, list[WindowMetric]],
    *,
    active_threshold_db: float,
    dead_air_threshold_db: float,
    loss_delta_db: float,
) -> tuple[list[dict[str, Any]], dict[str, Any]]:
    required = ["charlieAligned", "charlieContribution", "homerDjiAligned", "homerContribution"]
    count = min(len(metrics[key]) for key in required)
    rows: list[dict[str, Any]] = []
    flag_counts: dict[str, int] = {}

    for i in range(count):
        ca = metrics["charlieAligned"][i]
        cc = metrics["charlieContribution"][i]
        ha = metrics["homerDjiAligned"][i]
        hc = metrics["homerContribution"][i]
        ra = metrics.get("referenceAligned", [None] * count)[i] if metrics.get("referenceAligned") else None
        rc = metrics.get("referenceContribution", [None] * count)[i] if metrics.get("referenceContribution") else None

        c_aligned_active = ca.dbfs is not None and ca.dbfs >= active_threshold_db
        c_contrib_active = cc.dbfs is not None and cc.dbfs >= active_threshold_db
        h_aligned_active = ha.dbfs is not None and ha.dbfs >= active_threshold_db
        h_contrib_active = hc.dbfs is not None and hc.dbfs >= active_threshold_db
        ref_active = bool(rc and rc.dbfs is not None and rc.dbfs >= active_threshold_db)

        flags: list[str] = []
        if c_aligned_active and (not c_contrib_active or (cc.dbfs is not None and ca.dbfs is not None and ca.dbfs - cc.dbfs >= loss_delta_db)):
            flags.append("charlie_loss_or_overgate_risk")
        if h_aligned_active and (not h_contrib_active or (hc.dbfs is not None and ha.dbfs is not None and ha.dbfs - hc.dbfs >= loss_delta_db)):
            flags.append("homer_loss_or_overgate_risk")
        if h_contrib_active and ca.dbfs is not None and cc.dbfs is not None and ca.dbfs >= active_threshold_db and cc.dbfs >= active_threshold_db:
            if hc.dbfs is not None and cc.dbfs >= hc.dbfs - 8:
                flags.append("charlie_echo_bleed_may_remain_under_homer")
        if c_contrib_active and ha.dbfs is not None and hc.dbfs is not None and ha.dbfs >= active_threshold_db and hc.dbfs >= active_threshold_db:
            if cc.dbfs is not None and hc.dbfs >= cc.dbfs - 8:
                flags.append("homer_noise_bleed_may_remain_under_charlie")
        if c_contrib_active and h_contrib_active:
            flags.append("overlap_preserved")
        if ref_active:
            flags.append("reference_active")
        if (
            (cc.dbfs is None or cc.dbfs < dead_air_threshold_db)
            and (hc.dbfs is None or hc.dbfs < dead_air_threshold_db)
            and not ref_active
        ):
            flags.append("dead_air_or_between_sources")

        for flag in flags:
            flag_counts[flag] = flag_counts.get(flag, 0) + 1

        if flags:
            rows.append(
                {
                    "index": i,
                    "start": ca.start,
                    "end": ca.end,
                    "timecode": fmt_time(ca.start),
                    "charlieAlignedDbfs": ca.dbfs,
                    "charlieContributionDbfs": cc.dbfs,
                    "homerAlignedDbfs": ha.dbfs,
                    "homerContributionDbfs": hc.dbfs,
                    "referenceAlignedDbfs": getattr(ra, "dbfs", None),
                    "referenceContributionDbfs": getattr(rc, "dbfs", None),
                    "flags": flags,
                    "priority": risk_priority(flags),
                }
            )

    summary = {
        "windowCount": count,
        "flagCounts": dict(sorted(flag_counts.items())),
        "highPriorityCount": sum(1 for row in rows if row["priority"] >= 3),
    }
    return rows, summary


def risk_priority(flags: list[str]) -> int:
    priority = 0
    if any("loss_or_overgate" in flag for flag in flags):
        priority = max(priority, 4)
    if any("bleed_may_remain" in flag for flag in flags):
        priority = max(priority, 3)
    if "dead_air_or_between_sources" in flags:
        priority = max(priority, 2)
    if "overlap_preserved" in flags:
        priority = max(priority, 1)
    return priority


def select_review_windows(rows: list[dict[str, Any]], *, limit: int) -> list[dict[str, Any]]:
    risk_rows = [row for row in rows if row["priority"] >= 3]
    risk_rows.sort(key=lambda row: (-row["priority"], row["start"]))
    return risk_rows[:limit]


def write_csv(rows: list[dict[str, Any]], path: Path) -> None:
    fieldnames = [
        "start",
        "end",
        "timecode",
        "priority",
        "charlieAlignedDbfs",
        "charlieContributionDbfs",
        "homerAlignedDbfs",
        "homerContributionDbfs",
        "referenceAlignedDbfs",
        "referenceContributionDbfs",
        "flags",
    ]
    with path.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=fieldnames)
        writer.writeheader()
        for row in rows:
            writer.writerow(
                {
                    **{key: row.get(key) for key in fieldnames if key != "flags"},
                    "flags": ";".join(row.get("flags", [])),
                }
            )


def build_markdown(report: dict[str, Any]) -> str:
    lines = [
        "# Audio Workbench source activity map",
        "",
        f"- Baseline: `{report['baselineId']}`",
        f"- Generated: `{report['generatedAt']}`",
        f"- Window size: `{report['windowSeconds']}` seconds",
        f"- Active threshold: `{report['thresholds']['activeDbfs']}` dBFS",
        f"- CSV: `{report['outputs']['csv']}`",
        "",
        "## Why this exists",
        "",
        "This packet makes the audio chain inspectable before another base spine is rendered. It compares aligned stems against contribution-gated stems so we can see whether Quipsly kept speech/reactions, suppressed bleed, and preserved sync without turning the mix into a black box.",
        "",
        "## Stem summary",
        "",
        "| Stem | Active % | Active time | Peak | Mean | Median active |",
        "|---|---:|---:|---:|---:|---:|",
    ]
    for key, summary in report["stemSummary"].items():
        lines.append(
            f"| `{key}` | {summary['activePercent']}% | {summary['activeSeconds']}s | "
            f"{summary['peakDbfs']} | {summary['meanDbfs']} | {summary['medianActiveDbfs']} |"
        )

    lines.extend(["", "## Retention summary", "", "| Speaker | Energy retained | Retention dB | Dropped active windows |", "|---|---:|---:|---:|"])
    for speaker, summary in report["retentionSummary"].items():
        lines.append(
            f"| {speaker} | {summary.get('energyRetentionRatio')} | {summary.get('energyRetentionDb')} | "
            f"{summary.get('droppedActiveWindowCount')} |"
        )

    lines.extend(["", "## Flag counts", ""])
    for flag, count in report["classificationSummary"]["flagCounts"].items():
        lines.append(f"- `{flag}`: {count}")

    lines.extend(["", "## Highest-priority listen checks", ""])
    if not report["reviewWindows"]:
        lines.append("- No high-priority source activity windows were detected by this pass.")
    for row in report["reviewWindows"]:
        lines.append(
            f"- `{row['timecode']}` ({row['start']}-{row['end']}s), priority `{row['priority']}`: "
            f"{', '.join(row['flags'])}"
        )
        lines.append(
            "  - Charlie aligned/contrib: "
            f"{fmt_db(row['charlieAlignedDbfs'])}/{fmt_db(row['charlieContributionDbfs'])} dBFS; "
            "Homer aligned/contrib: "
            f"{fmt_db(row['homerAlignedDbfs'])}/{fmt_db(row['homerContributionDbfs'])} dBFS"
        )

    lines.extend(
        [
            "",
            "## Interpretation rules",
            "",
            "- `loss_or_overgate_risk` does not mean the audio is wrong. It means a source was active before contribution treatment and much quieter after treatment, so this is worth proof listening.",
            "- `bleed_may_remain` means both stems still show energy while another speaker is dominant. It may be natural overlap, laughter, or useful room tone; listen before changing thresholds.",
            "- `dead_air_or_between_sources` is acceptable in the full synchronized spine. Final edit branches should usually skip or cover these windows.",
            "- This report should guide v006/v007 treatment changes, not replace ears.",
            "",
            "## Next safest engineering move",
            "",
            "Use this map to choose 5-10 proof windows, then render profile variants only for those windows before committing to a full new base spine.",
            "",
        ]
    )
    return "\n".join(lines)


def build_report(
    baseline_dir: Path,
    *,
    window_seconds: float,
    active_threshold_db: float,
    dead_air_threshold_db: float,
    loss_delta_db: float,
    review_limit: int,
    include_reference: bool,
) -> dict[str, Any]:
    manifest = read_json(baseline_dir / "manifest.json")
    baseline_id = manifest.get("baselineId", "unknown-baseline")
    stem_paths = load_stem_paths(baseline_dir, manifest)
    selected_keys = list(STEM_KEYS if include_reference else STEM_KEYS[:4])

    metrics: dict[str, list[WindowMetric]] = {}
    stem_meta: dict[str, Any] = {}
    for key in selected_keys:
        if key not in stem_paths:
            continue
        windows, meta = scan_wav_windows(stem_paths[key], window_seconds=window_seconds)
        metrics[key] = windows
        stem_meta[key] = meta

    rows, classification_summary = classify_windows(
        metrics,
        active_threshold_db=active_threshold_db,
        dead_air_threshold_db=dead_air_threshold_db,
        loss_delta_db=loss_delta_db,
    )

    stem_summary = {
        key: summarize_stem(windows, threshold_db=active_threshold_db)
        for key, windows in metrics.items()
    }
    retention = {}
    for speaker, (aligned_key, contribution_key) in PAIRINGS.items():
        if aligned_key in metrics and contribution_key in metrics:
            retention[speaker] = retention_summary(
                metrics[aligned_key],
                metrics[contribution_key],
                active_threshold_db=active_threshold_db,
                loss_delta_db=loss_delta_db,
            )

    suffix = output_suffix(baseline_id)
    csv_path = baseline_dir / f"audio-workbench-source-activity-{suffix}.csv"
    json_path = baseline_dir / f"audio-workbench-source-activity-{suffix}.json"
    md_path = baseline_dir / f"audio-workbench-source-activity-{suffix}.md"
    write_csv(rows, csv_path)

    report = {
        "schema": "quipsly.audio-workbench.source-activity.v1",
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "baselineId": baseline_id,
        "baselineDir": str(baseline_dir),
        "windowSeconds": window_seconds,
        "thresholds": {
            "activeDbfs": active_threshold_db,
            "deadAirDbfs": dead_air_threshold_db,
            "lossDeltaDb": loss_delta_db,
        },
        "stemMeta": stem_meta,
        "stemSummary": stem_summary,
        "retentionSummary": retention,
        "classificationSummary": classification_summary,
        "reviewWindows": select_review_windows(rows, limit=review_limit),
        "outputs": {
            "csv": str(csv_path),
            "json": str(json_path),
            "markdown": str(md_path),
        },
        "notes": [
            "This is a machine activity map, not a publication approval.",
            "Use it to choose proof-listen windows before rendering a new full spine.",
            "Speaker split diagnostics are for inspection; the production handoff remains a normal stereo WAV/M4A.",
        ],
    }
    write_json(json_path, report)
    md_path.write_text(build_markdown(report), encoding="utf-8")
    manifest_outputs = manifest.setdefault("outputs", {})
    manifest_outputs["sourceActivity"] = str(json_path)
    manifest_outputs["sourceActivityMarkdown"] = str(md_path)
    manifest_outputs["sourceActivityCsv"] = str(csv_path)
    write_json(baseline_dir / "manifest.json", manifest)
    return report


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--baseline-dir", required=True, type=Path)
    parser.add_argument("--window-seconds", type=float, default=2.0)
    parser.add_argument("--active-threshold-db", type=float, default=-42.0)
    parser.add_argument("--dead-air-threshold-db", type=float, default=-50.0)
    parser.add_argument("--loss-delta-db", type=float, default=18.0)
    parser.add_argument("--review-limit", type=int, default=30)
    parser.add_argument("--include-reference", action="store_true")
    args = parser.parse_args()

    baseline_dir = resolve_baseline_dir(args.baseline_dir)
    report = build_report(
        baseline_dir,
        window_seconds=args.window_seconds,
        active_threshold_db=args.active_threshold_db,
        dead_air_threshold_db=args.dead_air_threshold_db,
        loss_delta_db=args.loss_delta_db,
        review_limit=args.review_limit,
        include_reference=args.include_reference,
    )
    print(json.dumps(report["outputs"], indent=2))


if __name__ == "__main__":
    main()
