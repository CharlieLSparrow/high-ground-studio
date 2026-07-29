#!/usr/bin/env python3
"""Measure separate treatment stems against an existing activity clock.

Unlike the legacy baseline analyzer, this does not require or bless a combined
master. Raw aligned activity labels select the windows; each refined stem is
then measured independently on that shared clock.
"""

from __future__ import annotations

import argparse
import csv
import json
import math
import subprocess
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, BinaryIO

import numpy as np


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def dbfs(value: float) -> float:
    return 20.0 * math.log10(max(value, 10 ** (-96.0 / 20.0)))


def percentile(values: list[float], amount: float) -> float | None:
    if not values:
        return None
    return float(np.percentile(np.asarray(values), amount))


def read_exactly(stream: BinaryIO, byte_count: int) -> bytes:
    """Read one metric window without treating a short pipe read as EOF."""
    chunks: list[bytes] = []
    remaining = byte_count
    while remaining > 0:
        chunk = stream.read(remaining)
        if not chunk:
            break
        chunks.append(chunk)
        remaining -= len(chunk)
    return b"".join(chunks)


def stream_windows(path: Path, window_seconds: float) -> list[dict[str, float]]:
    sample_rate = 16000
    samples_per_window = int(round(sample_rate * window_seconds))
    bytes_per_window = samples_per_window * 4
    process = subprocess.Popen(
        [
            "ffmpeg",
            "-v",
            "error",
            "-nostdin",
            "-i",
            str(path),
            "-ac",
            "1",
            "-ar",
            str(sample_rate),
            "-f",
            "f32le",
            "-",
        ],
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
    )
    assert process.stdout is not None
    windows: list[dict[str, float]] = []
    while True:
        data = read_exactly(process.stdout, bytes_per_window)
        if not data:
            break
        samples = np.frombuffer(data, dtype="<f4")
        if samples.size == 0:
            break
        rms = float(np.sqrt(np.mean(np.square(samples, dtype=np.float64))))
        peak = float(np.max(np.abs(samples)))
        windows.append({"rmsDbfs": dbfs(rms), "peakDbfs": dbfs(peak)})
    stderr = process.stderr.read().decode("utf-8", errors="replace") if process.stderr else ""
    return_code = process.wait()
    if return_code != 0:
        raise RuntimeError(f"ffmpeg metric stream failed for {path}: {stderr[-1200:]}")
    return windows


def optional_float(value: str | None) -> float | None:
    if value is None or not value.strip():
        return None
    return float(value)


def activity_rows(path: Path) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    with path.open(newline="", encoding="utf-8") as handle:
        for row in csv.DictReader(handle):
            rows.append(
                {
                    "start": float(row["start"]),
                    "end": float(row["end"]),
                    "charlieAlignedDbfs": optional_float(row.get("charlieAlignedDbfs")),
                    "homerAlignedDbfs": optional_float(row.get("homerAlignedDbfs")),
                    "referenceAlignedDbfs": optional_float(row.get("referenceAlignedDbfs")),
                }
            )
    return rows


def activity_rows_from_aligned_sources(
    paths: dict[str, Path],
    window_seconds: float,
) -> tuple[list[dict[str, Any]], dict[str, dict[str, Any]]]:
    measurements = {
        name: stream_windows(path, window_seconds) for name, path in paths.items()
    }
    counts = {name: len(windows) for name, windows in measurements.items()}
    minimum_count = min(counts.values())
    maximum_count = max(counts.values())
    if maximum_count - minimum_count > 1:
        details = ", ".join(f"{name}={count}" for name, count in counts.items())
        raise RuntimeError("Aligned sources do not share one window clock: " + details)

    rows: list[dict[str, Any]] = []
    for index in range(minimum_count):
        start = index * window_seconds
        rows.append(
            {
                "start": start,
                "end": start + window_seconds,
                "charlieAlignedDbfs": measurements["charlie"][index]["rmsDbfs"],
                "homerAlignedDbfs": measurements["homer"][index]["rmsDbfs"],
                "referenceAlignedDbfs": measurements["reference"][index]["rmsDbfs"],
            }
        )

    coverage = {
        name: {
            "measuredWindowCount": count,
            "sharedWindowCount": minimum_count,
            "difference": count - minimum_count,
            "complete": count - minimum_count <= 1,
        }
        for name, count in counts.items()
    }
    return rows, coverage


def write_activity_csv(rows: list[dict[str, Any]], path: Path) -> None:
    fields = [
        "start",
        "end",
        "charlieAlignedDbfs",
        "homerAlignedDbfs",
        "referenceAlignedDbfs",
    ]
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=fields)
        writer.writeheader()
        writer.writerows({field: row.get(field) for field in fields} for row in rows)


def speaker_summary(
    name: str,
    labels: list[dict[str, Any]],
    measurements: list[dict[str, float]],
    raw_key: str,
    active_threshold: float,
    window_seconds: float,
) -> dict[str, Any]:
    count = min(len(labels), len(measurements))
    active = [
        measurements[index]["rmsDbfs"]
        for index in range(count)
        if labels[index][raw_key] is not None and labels[index][raw_key] >= active_threshold
    ]
    inactive = [
        measurements[index]["rmsDbfs"]
        for index in range(count)
        if labels[index][raw_key] is None or labels[index][raw_key] < active_threshold
    ]
    return {
        "speaker": name,
        "windowCount": count,
        "activeWindowCount": len(active),
        "activeSeconds": len(active) * window_seconds,
        "activeMedianDbfs": percentile(active, 50),
        "activeP10Dbfs": percentile(active, 10),
        "activeP90Dbfs": percentile(active, 90),
        "inactiveMedianDbfs": percentile(inactive, 50),
        "inactiveP90Dbfs": percentile(inactive, 90),
        "retainedAboveMinus50Percent": (
            100.0 * sum(1 for value in active if value >= -50.0) / len(active) if active else 0.0
        ),
    }


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--activity-csv", type=Path)
    parser.add_argument("--charlie-aligned", type=Path)
    parser.add_argument("--homer-aligned", type=Path)
    parser.add_argument("--reference-aligned", type=Path)
    parser.add_argument("--activity-output", type=Path)
    parser.add_argument("--charlie", type=Path, required=True)
    parser.add_argument("--homer", type=Path, required=True)
    parser.add_argument("--reference", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--window-seconds", type=float, default=2.0)
    parser.add_argument("--active-threshold-dbfs", type=float, default=-42.0)
    args = parser.parse_args()

    aligned_args = {
        "charlie": args.charlie_aligned,
        "homer": args.homer_aligned,
        "reference": args.reference_aligned,
    }
    if args.activity_csv:
        labels = activity_rows(args.activity_csv)
        activity_source: dict[str, Any] = {
            "mode": "existing-csv",
            "path": str(args.activity_csv.resolve()),
        }
    elif all(aligned_args.values()):
        aligned_paths = {name: path.resolve() for name, path in aligned_args.items() if path}
        labels, aligned_coverage = activity_rows_from_aligned_sources(
            aligned_paths,
            args.window_seconds,
        )
        if args.activity_output:
            write_activity_csv(labels, args.activity_output)
        activity_source = {
            "mode": "exact-window-aligned-sources",
            "paths": {name: str(path) for name, path in aligned_paths.items()},
            "windowCoverage": aligned_coverage,
            "csv": str(args.activity_output.resolve()) if args.activity_output else None,
        }
    else:
        parser.error(
            "provide --activity-csv or all of --charlie-aligned, --homer-aligned, "
            "and --reference-aligned"
        )
    paths = {
        "charlie": args.charlie.resolve(),
        "homer": args.homer.resolve(),
        "reference": args.reference.resolve(),
    }
    measurements = {
        name: stream_windows(path, args.window_seconds) for name, path in paths.items()
    }
    coverage = {
        name: {
            "labelWindowCount": len(labels),
            "measuredWindowCount": len(windows),
            "difference": len(windows) - len(labels),
            "complete": abs(len(windows) - len(labels)) <= 1,
        }
        for name, windows in measurements.items()
    }
    incomplete = [name for name, item in coverage.items() if not item["complete"]]
    if incomplete:
        details = ", ".join(
            f"{name}: labels={coverage[name]['labelWindowCount']} "
            f"measured={coverage[name]['measuredWindowCount']}"
            for name in incomplete
        )
        raise RuntimeError(
            "Activity labels and measured audio do not share the requested window clock: "
            + details
        )
    summaries = [
        speaker_summary(
            "charlie",
            labels,
            measurements["charlie"],
            "charlieAlignedDbfs",
            args.active_threshold_dbfs,
            args.window_seconds,
        ),
        speaker_summary(
            "homer",
            labels,
            measurements["homer"],
            "homerAlignedDbfs",
            args.active_threshold_dbfs,
            args.window_seconds,
        ),
        speaker_summary(
            "reference",
            labels,
            measurements["reference"],
            "referenceAlignedDbfs",
            args.active_threshold_dbfs,
            args.window_seconds,
        ),
    ]
    by_speaker = {item["speaker"]: item for item in summaries}
    charlie_median = by_speaker["charlie"]["activeMedianDbfs"]
    homer_median = by_speaker["homer"]["activeMedianDbfs"]
    median_delta = (
        homer_median - charlie_median
        if charlie_median is not None and homer_median is not None
        else None
    )
    report = {
        "schema": "quipsly.source-aware-active-window-metrics.v1",
        "generatedAt": utc_now(),
        "activityLabels": activity_source,
        "windowSeconds": args.window_seconds,
        "activeThresholdDbfs": args.active_threshold_dbfs,
        "windowCoverage": coverage,
        "stems": {name: str(path) for name, path in paths.items()},
        "speakerSummaries": summaries,
        "balance": {
            "homerMinusCharlieActiveMedianDb": median_delta,
            "withinTwoDb": median_delta is not None and abs(median_delta) <= 2.0,
        },
        "truth": (
            "Activity labels come from aligned raw sources. Measurements come from the "
            "separate refined stems. No combined master is required or treated as canonical."
        ),
    }
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"speakerSummaries": summaries, "balance": report["balance"]}, indent=2))
    print(f"REPORT={args.output}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
