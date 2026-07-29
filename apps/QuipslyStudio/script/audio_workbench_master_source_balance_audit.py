#!/usr/bin/env python3
"""Audit whether the mastered spine preserves source contribution activity.

This is a non-mutating evidence tool. It scans the mastered WAV and the
source-aware contribution stems window by window, then highlights places where
Charlie/Homer/reference activity appears in the conformed stems but the final
stereo master is suspiciously quiet, or where the master is loud without a
registered contribution. It does not approve audio, fail audio, render
branches, upload files, or mutate source media.
"""

from __future__ import annotations

import argparse
import json
import math
import statistics
import wave
from array import array
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


NOISE_FLOOR_DBFS = -96.0


@dataclass(frozen=True)
class WindowLevel:
    index: int
    start_sec: float
    end_sec: float
    rms_dbfs: float


def read_json(path: Path) -> dict[str, Any]:
    return json.loads(path.read_text(encoding="utf-8"))


def write_json(path: Path, payload: dict[str, Any]) -> None:
    path.write_text(json.dumps(payload, indent=2, sort_keys=True) + "\n", encoding="utf-8")


def resolve_baseline_dir(input_path: Path) -> Path:
    if (input_path / "manifest.json").exists():
        return input_path.expanduser().resolve()
    nested = input_path / "work" / "conformed-production-baseline"
    if (nested / "manifest.json").exists():
        return nested.expanduser().resolve()
    raise FileNotFoundError(
        "Could not find manifest.json at "
        f"{input_path}/manifest.json or {nested}/manifest.json"
    )


def output_path(value: Any) -> str | None:
    if isinstance(value, str):
        return value
    if isinstance(value, dict):
        path = value.get("path")
        if isinstance(path, str):
            return path
    return None


def safe_slug(value: str) -> str:
    out = "".join(ch.lower() if ch.isalnum() else "-" for ch in value)
    while "--" in out:
        out = out.replace("--", "-")
    return out.strip("-") or "audio-baseline"


def format_time(seconds: float) -> str:
    seconds = max(0.0, seconds)
    total = int(seconds)
    h = total // 3600
    m = (total % 3600) // 60
    s = total % 60
    return f"{h:02d}:{m:02d}:{s:02d}"


def dbfs_from_pcm16(raw: bytes) -> float:
    if not raw:
        return NOISE_FLOOR_DBFS
    samples = array("h")
    samples.frombytes(raw)
    if not samples:
        return NOISE_FLOOR_DBFS
    square_sum = 0.0
    for sample in samples:
        square_sum += float(sample) * float(sample)
    rms = math.sqrt(square_sum / len(samples))
    if rms <= 0.0:
        return NOISE_FLOOR_DBFS
    return max(NOISE_FLOOR_DBFS, 20.0 * math.log10(rms / 32768.0))


def compute_levels(path: Path, window_sec: float) -> tuple[dict[str, Any], list[WindowLevel]]:
    with wave.open(str(path), "rb") as wav:
        channels = wav.getnchannels()
        sample_width = wav.getsampwidth()
        frame_rate = wav.getframerate()
        frame_count = wav.getnframes()
        if sample_width != 2:
            raise RuntimeError(f"Expected 16-bit PCM WAV, got sample width {sample_width}: {path}")
        frames_per_window = max(1, int(frame_rate * window_sec))
        levels: list[WindowLevel] = []
        index = 0
        while True:
            raw = wav.readframes(frames_per_window)
            if not raw:
                break
            frame_len = len(raw) / (sample_width * channels)
            start = index * window_sec
            end = start + (frame_len / frame_rate)
            levels.append(
                WindowLevel(
                    index=index,
                    start_sec=start,
                    end_sec=end,
                    rms_dbfs=dbfs_from_pcm16(raw),
                )
            )
            index += 1
    return (
        {
            "path": str(path),
            "channels": channels,
            "sampleWidthBytes": sample_width,
            "sampleRate": frame_rate,
            "frameCount": frame_count,
            "durationSeconds": frame_count / frame_rate if frame_rate else 0.0,
            "windowSeconds": window_sec,
            "windowCount": len(levels),
        },
        levels,
    )


def median(values: list[float]) -> float | None:
    return statistics.median(values) if values else None


def percentile(values: list[float], p: float) -> float | None:
    if not values:
        return None
    ordered = sorted(values)
    index = min(len(ordered) - 1, max(0, int(round((len(ordered) - 1) * p))))
    return ordered[index]


def db(value: float | None) -> str:
    return "" if value is None else f"{value:.2f} dBFS"


def load_stem_paths(manifest: dict[str, Any]) -> dict[str, dict[str, Path]]:
    automation_path = output_path((manifest.get("outputs") or {}).get("speakerGapAutomation"))
    if not automation_path:
        raise FileNotFoundError("Manifest is missing outputs.speakerGapAutomation")
    automation = read_json(Path(automation_path))
    stems = automation.get("stems") or {}
    spec = {
        "contribution": {
            "charlie": "charlieContribution",
            "homer": "homerContribution",
            "reference": "referenceContribution",
        },
        "aligned": {
            "charlie": "charlieAligned",
            "homer": "homerDjiAligned",
            "reference": "referenceAligned",
        },
    }
    groups: dict[str, dict[str, Path]] = {"contribution": {}, "aligned": {}}
    for group, speaker_keys in spec.items():
        for speaker, key in speaker_keys.items():
            path = stems.get(key, {}).get("path")
            if path:
                groups[group][speaker] = Path(path)
    missing_contribution = [speaker for speaker in ("charlie", "homer") if speaker not in groups["contribution"]]
    missing_aligned = [speaker for speaker in ("charlie", "homer") if speaker not in groups["aligned"]]
    missing = [f"contribution:{speaker}" for speaker in missing_contribution] + [
        f"aligned:{speaker}" for speaker in missing_aligned
    ]
    if missing:
        raise FileNotFoundError(f"Speaker automation is missing required stem paths: {', '.join(missing)}")
    return groups


def summarize_speaker(
    speaker: str,
    source: list[WindowLevel],
    master: list[WindowLevel],
    *,
    active_threshold_db: float,
    master_audible_threshold_db: float,
) -> dict[str, Any]:
    count = min(len(source), len(master))
    active_indexes = [i for i in range(count) if source[i].rms_dbfs >= active_threshold_db]
    audible_indexes = [i for i in active_indexes if master[i].rms_dbfs >= master_audible_threshold_db]
    quiet_indexes = [i for i in active_indexes if master[i].rms_dbfs < master_audible_threshold_db]
    source_values = [source[i].rms_dbfs for i in active_indexes]
    master_values = [master[i].rms_dbfs for i in active_indexes]
    return {
        "speaker": speaker,
        "windowCountCompared": count,
        "activeWindowCount": len(active_indexes),
        "activeSeconds": round(sum(source[i].end_sec - source[i].start_sec for i in active_indexes), 3),
        "masterAudibleWhenActiveWindowCount": len(audible_indexes),
        "masterQuietWhenActiveWindowCount": len(quiet_indexes),
        "masterAudibleWhenActivePercent": round((len(audible_indexes) / len(active_indexes) * 100.0), 2) if active_indexes else 100.0,
        "sourceMedianActiveDbfs": median(source_values),
        "sourceP90ActiveDbfs": percentile(source_values, 0.90),
        "masterMedianDuringSpeakerActiveDbfs": median(master_values),
        "masterP10DuringSpeakerActiveDbfs": percentile(master_values, 0.10),
        "activeThresholdDbfs": active_threshold_db,
        "masterAudibleThresholdDbfs": master_audible_threshold_db,
    }


def build_rows(
    master: list[WindowLevel],
    sources: dict[str, list[WindowLevel]],
    aligned_sources: dict[str, list[WindowLevel]],
    *,
    active_threshold_db: float,
    master_audible_threshold_db: float,
    loud_without_source_threshold_db: float,
    master_gap_delta_db: float,
    limit: int,
) -> tuple[list[dict[str, Any]], dict[str, int]]:
    count = min([len(master), *(len(items) for items in sources.values()), *(len(items) for items in aligned_sources.values())])
    flagged: list[dict[str, Any]] = []
    flag_counts: dict[str, int] = {}
    for i in range(count):
        m = master[i]
        source_levels = {speaker: sources[speaker][i].rms_dbfs for speaker in sources}
        aligned_levels = {speaker: aligned_sources[speaker][i].rms_dbfs for speaker in aligned_sources}
        active = {speaker: level >= active_threshold_db for speaker, level in source_levels.items()}
        aligned_active = {speaker: level >= active_threshold_db for speaker, level in aligned_levels.items()}
        flags: list[str] = []
        severity = 0

        for speaker in ("charlie", "homer", "reference"):
            if speaker not in source_levels:
                continue
            if active.get(speaker) and m.rms_dbfs < master_audible_threshold_db:
                flags.append(f"{speaker}_contribution_not_audible_in_master")
                severity = max(severity, 5 if speaker in {"charlie", "homer"} else 3)
            if active.get(speaker) and source_levels[speaker] - m.rms_dbfs >= master_gap_delta_db:
                flags.append(f"{speaker}_source_much_louder_than_master")
                severity = max(severity, 4 if speaker in {"charlie", "homer"} else 2)

        if not any(active.values()) and m.rms_dbfs >= loud_without_source_threshold_db:
            if any(aligned_active.values()):
                flags.append("master_loud_with_aligned_source_but_no_contribution")
                severity = max(severity, 3)
            else:
                flags.append("master_loud_without_registered_source")
                severity = max(severity, 4)
        if active.get("charlie") and active.get("homer"):
            flags.append("charlie_homer_overlap_present")
            severity = max(severity, 1)

        for flag in flags:
            flag_counts[flag] = flag_counts.get(flag, 0) + 1

        if flags:
            flagged.append(
                {
                    "index": i,
                    "startSec": round(m.start_sec, 3),
                    "endSec": round(m.end_sec, 3),
                    "time": format_time(m.start_sec),
                    "severity": severity,
                    "masterDbfs": m.rms_dbfs,
                    "charlieContributionDbfs": source_levels.get("charlie"),
                    "homerContributionDbfs": source_levels.get("homer"),
                    "referenceContributionDbfs": source_levels.get("reference"),
                    "charlieAlignedDbfs": aligned_levels.get("charlie"),
                    "homerAlignedDbfs": aligned_levels.get("homer"),
                    "referenceAlignedDbfs": aligned_levels.get("reference"),
                    "flags": flags,
                }
            )

    focused = select_representative_focus_rows(flagged, limit=limit)
    return focused, dict(sorted(flag_counts.items()))


def select_representative_focus_rows(rows: list[dict[str, Any]], *, limit: int) -> list[dict[str, Any]]:
    """Choose high-risk rows without letting the first dense warning cluster win.

    A long podcast can generate hundreds of similar machine warnings. Sorting by
    severity then time makes the queue look precise while only covering the
    first few minutes. This picks representative rows by flag family first, then
    by timeline bucket, then fills remaining slots with the strongest unseen
    warnings. The result is review coverage, not just severity theater.
    """
    if not rows or limit <= 0:
        return []
    selected: list[dict[str, Any]] = []
    seen: set[int] = set()

    def add_row(row: dict[str, Any]) -> bool:
        index = int(row["index"])
        if index in seen:
            return False
        selected.append(row)
        seen.add(index)
        return len(selected) >= limit

    rows_by_flag: dict[str, list[dict[str, Any]]] = {}
    for row in rows:
        for flag in row.get("flags") or []:
            rows_by_flag.setdefault(str(flag), []).append(row)

    for flag in sorted(rows_by_flag):
        flag_rows = sorted(rows_by_flag[flag], key=lambda row: (-int(row["severity"]), float(row["startSec"])))
        if flag_rows and add_row(flag_rows[0]):
            return sorted(selected, key=lambda row: row["startSec"])

    duration = max(float(row.get("endSec") or row.get("startSec") or 0.0) for row in rows)
    bucket_count = min(limit, max(1, int(duration // 300) + 1))
    bucket_seconds = max(60.0, duration / bucket_count) if bucket_count else 300.0
    buckets: dict[int, list[dict[str, Any]]] = {}
    for row in rows:
        bucket = int(float(row.get("startSec") or 0.0) // bucket_seconds)
        buckets.setdefault(bucket, []).append(row)

    for bucket in sorted(buckets):
        best = sorted(buckets[bucket], key=lambda row: (-int(row["severity"]), float(row["startSec"])))[0]
        if add_row(best):
            return sorted(selected, key=lambda row: row["startSec"])

    for row in sorted(rows, key=lambda item: (-int(item["severity"]), float(item["startSec"]))):
        if add_row(row):
            break
    return sorted(selected, key=lambda row: row["startSec"])


def render_markdown(report: dict[str, Any]) -> str:
    lines = [
        f"# Audio Master/Source Balance Audit: {report['baselineId']}",
        "",
        f"Generated: `{report['generatedAt']}`",
        "",
        "This audit compares the final mastered stereo spine against the source-aware contribution stems. It is evidence only. It does not approve v006, fail v006, render branches, upload files, or mutate media.",
        "",
        "## Current truth",
        "",
        f"- Approval status: `{report['approvalStatus']}`",
        f"- Package ready for human listen: `{str(report['packageReadyForHumanListen']).lower()}`",
        f"- Branch inheritance ready: `{str(report['branchInheritanceReady']).lower()}`",
        f"- Branch render ready: `{str(report['branchRenderReady']).lower()}`",
        f"- Master WAV: `{report['masterWav']}`",
        f"- Window seconds: `{report['windowSeconds']}`",
        f"- Compared windows: `{report['comparedWindowCount']}`",
        "",
        "## Speaker preservation summary",
        "",
        "| Speaker | Active time | Active windows | Master audible when active | Source median | Master median during active |",
        "|---|---:|---:|---:|---:|---:|",
    ]
    for item in report["speakerSummaries"]:
        lines.append(
            "| {speaker} | `{activeSeconds:.1f}s` | `{activeWindowCount}` | `{masterAudibleWhenActivePercent:.2f}%` | `{source}` | `{master}` |".format(
                speaker=item["speaker"],
                activeSeconds=item["activeSeconds"],
                activeWindowCount=item["activeWindowCount"],
                masterAudibleWhenActivePercent=item["masterAudibleWhenActivePercent"],
                source=db(item.get("sourceMedianActiveDbfs")),
                master=db(item.get("masterMedianDuringSpeakerActiveDbfs")),
            )
        )

    lines.extend(["", "## Flag counts", ""])
    if report["flagCounts"]:
        for flag, count in report["flagCounts"].items():
            lines.append(f"- `{flag}`: `{count}`")
    else:
        lines.append("- No balance flags generated.")

    lines.extend(
        [
            "",
            "## Highest-priority source/master checks",
            "",
            "| Time | Severity | Master | Charlie contrib | Homer contrib | Reference contrib | Flags |",
            "|---:|---:|---:|---:|---:|---:|---|",
        ]
    )
    for row in report["focusRows"]:
        lines.append(
            f"| `{row['time']}` | `{row['severity']}` | `{db(row.get('masterDbfs'))}` | "
            f"`{db(row.get('charlieContributionDbfs'))}` | `{db(row.get('homerContributionDbfs'))}` | "
            f"`{db(row.get('referenceContributionDbfs'))}` | `{', '.join(row.get('flags') or [])}` |"
        )

    lines.extend(
        [
            "",
            "## Interpretation",
            "",
            "- `*_contribution_not_audible_in_master` is the strongest machine warning: a contribution stem appears active while the final master is below the audible threshold.",
            "- `*_source_much_louder_than_master` is a softer warning: the contribution stem is much louder than the master in the same window. It may be harmless after mastering, but it is worth checking if clustered.",
            "- `master_loud_with_aligned_source_but_no_contribution` means the final master has energy where aligned source exists but the contribution-gated stem is quiet. This is often threshold/model friction, but clusters can reveal retained bleed or overly conservative contribution masks.",
            "- `master_loud_without_registered_source` means the final master has energy where neither contribution nor aligned source crossed the active threshold. This can be room tone, music/reference material, or a masking bug.",
            "- `charlie_homer_overlap_present` is usually good evidence that natural overlap exists. It is listed for listen context, not as a failure.",
            "- This audit makes the final stereo handoff more transparent. Human listening still decides whether v006 can feed branches.",
            "",
            "## Guardrails",
            "",
            f"- Approval state changed: `{str(report['approvalStateChanged']).lower()}`",
            f"- Branch state changed: `{str(report['branchStateChanged']).lower()}`",
            f"- Render attempted: `{str(report['renderAttempted']).lower()}`",
            f"- Original media mutated: `{str(report['originalMediaMutated']).lower()}`",
            "",
        ]
    )
    return "\n".join(lines)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--baseline-dir", required=True, type=Path)
    parser.add_argument("--window-sec", type=float, default=2.0)
    parser.add_argument("--active-threshold-db", type=float, default=-42.0)
    parser.add_argument("--master-audible-threshold-db", type=float, default=-50.0)
    parser.add_argument("--loud-without-source-threshold-db", type=float, default=-42.0)
    parser.add_argument("--master-gap-delta-db", type=float, default=22.0)
    parser.add_argument("--focus-limit", type=int, default=40)
    args = parser.parse_args()

    baseline_dir = resolve_baseline_dir(args.baseline_dir)
    manifest_path = baseline_dir / "manifest.json"
    manifest_before = read_json(manifest_path)
    outputs_before = manifest_before.get("outputs") or {}
    baseline_id = str(manifest_before.get("baselineId") or "audio-baseline")
    slug = safe_slug(baseline_id.replace("episode-4-conformed-production-baseline-", ""))
    generated_at = datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S")
    generated_iso = datetime.now(timezone.utc).isoformat()

    master_path_text = output_path(outputs_before.get("masterWav"))
    if not master_path_text:
        raise SystemExit("No masterWav registered in manifest outputs.")
    master_path = Path(master_path_text)
    if not master_path.exists():
        raise SystemExit(f"Master WAV is missing: {master_path}")

    stem_paths = load_stem_paths(manifest_before)
    master_meta, master_levels = compute_levels(master_path, args.window_sec)
    source_levels: dict[str, list[WindowLevel]] = {}
    aligned_levels: dict[str, list[WindowLevel]] = {}
    source_meta: dict[str, Any] = {}
    aligned_meta: dict[str, Any] = {}
    for speaker, path in stem_paths["contribution"].items():
        if not path.exists():
            raise SystemExit(f"Contribution stem is missing for {speaker}: {path}")
        meta, levels = compute_levels(path, args.window_sec)
        source_meta[speaker] = meta
        source_levels[speaker] = levels
    for speaker, path in stem_paths["aligned"].items():
        if not path.exists():
            raise SystemExit(f"Aligned stem is missing for {speaker}: {path}")
        meta, levels = compute_levels(path, args.window_sec)
        aligned_meta[speaker] = meta
        aligned_levels[speaker] = levels

    compared = min([len(master_levels), *(len(items) for items in source_levels.values()), *(len(items) for items in aligned_levels.values())])
    speaker_summaries = [
        summarize_speaker(
            speaker,
            levels,
            master_levels,
            active_threshold_db=args.active_threshold_db,
            master_audible_threshold_db=args.master_audible_threshold_db,
        )
        for speaker, levels in source_levels.items()
    ]
    focus_rows, flag_counts = build_rows(
        master_levels,
        source_levels,
        aligned_levels,
        active_threshold_db=args.active_threshold_db,
        master_audible_threshold_db=args.master_audible_threshold_db,
        loud_without_source_threshold_db=args.loud_without_source_threshold_db,
        master_gap_delta_db=args.master_gap_delta_db,
        limit=max(1, args.focus_limit),
    )

    report = {
        "schema": "quipsly.audio-workbench.master-source-balance-audit.v1",
        "baselineId": baseline_id,
        "baselineDir": str(baseline_dir),
        "generatedAt": generated_iso,
        "approvalStatus": manifest_before.get("approvalStatus"),
        "packageReadyForHumanListen": bool(manifest_before.get("packageReadyForHumanListen")),
        "branchInheritanceReady": bool(manifest_before.get("branchInheritanceReady")),
        "branchRenderReady": bool(manifest_before.get("branchRenderReady")),
        "masterWav": str(master_path),
        "windowSeconds": args.window_sec,
        "thresholds": {
            "activeDbfs": args.active_threshold_db,
            "masterAudibleDbfs": args.master_audible_threshold_db,
            "loudWithoutSourceDbfs": args.loud_without_source_threshold_db,
            "masterGapDeltaDb": args.master_gap_delta_db,
        },
        "comparedWindowCount": compared,
        "masterMeta": master_meta,
        "sourceMeta": {
            "contribution": source_meta,
            "aligned": aligned_meta,
        },
        "speakerSummaries": speaker_summaries,
        "flagCounts": flag_counts,
        "focusRows": focus_rows,
        "machineWarningCount": sum(count for flag, count in flag_counts.items() if flag != "charlie_homer_overlap_present"),
        "approvalStateChanged": False,
        "branchStateChanged": False,
        "renderAttempted": False,
        "originalMediaMutated": False,
    }

    json_path = baseline_dir / f"audio-master-source-balance-audit-{slug}-{generated_at}.json"
    markdown_path = baseline_dir / f"audio-master-source-balance-audit-{slug}-{generated_at}.md"
    write_json(json_path, report)
    markdown_path.write_text(render_markdown(report), encoding="utf-8")

    manifest = read_json(manifest_path)
    outputs = manifest.setdefault("outputs", {})
    outputs["latestAudioMasterSourceBalanceAudit"] = str(json_path)
    outputs["latestAudioMasterSourceBalanceAuditMarkdown"] = str(markdown_path)
    audits = outputs.setdefault("audioMasterSourceBalanceAudits", [])
    audits.append(
        {
            "path": str(json_path),
            "markdownPath": str(markdown_path),
            "generatedAt": generated_iso,
            "machineWarningCount": report["machineWarningCount"],
            "comparedWindowCount": compared,
            "windowSeconds": args.window_sec,
            "flagCounts": flag_counts,
        }
    )
    manifest["audioMasterSourceBalanceAuditCount"] = len(audits)
    manifest["audioMasterSourceBalanceLatestWarningCount"] = report["machineWarningCount"]
    manifest["updatedAt"] = generated_iso
    write_json(manifest_path, manifest)

    print(
        json.dumps(
            {
                "baselineId": baseline_id,
                "markdown": str(markdown_path),
                "json": str(json_path),
                "machineWarningCount": report["machineWarningCount"],
                "focusRowCount": len(focus_rows),
                "flagCounts": flag_counts,
                "approvalStateChanged": False,
                "branchStateChanged": False,
                "renderAttempted": False,
                "originalMediaMutated": False,
            },
            indent=2,
            sort_keys=True,
        )
    )


if __name__ == "__main__":
    main()
