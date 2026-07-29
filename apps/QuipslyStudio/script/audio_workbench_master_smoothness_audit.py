#!/usr/bin/env python3
"""Audit mastered audio spine smoothness and suspicious gating behavior.

This reads the mastered WAV in windows, computes a simple RMS envelope, and
flags abrupt level changes, long low-level spans, and the loudest/quietest
regions for human review. It is evidence only: it does not approve audio, fail
audio, render branches, upload files, or mutate original media.
"""

from __future__ import annotations

import argparse
import json
import math
import wave
from array import array
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


SILENCE_DBFS = -50.0
NOISE_FLOOR_DBFS = -90.0


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
    if samples.itemsize != 2:
        raise RuntimeError("Expected 16-bit samples.")
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
            raise RuntimeError(f"Expected 16-bit PCM WAV, got sample width {sample_width}.")
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
    metadata = {
        "path": str(path),
        "channels": channels,
        "sampleWidthBytes": sample_width,
        "sampleRate": frame_rate,
        "frameCount": frame_count,
        "durationSeconds": frame_count / frame_rate if frame_rate else 0.0,
        "windowSeconds": window_sec,
        "windowCount": len(levels),
    }
    return metadata, levels


def transition_rows(levels: list[WindowLevel], limit: int) -> list[dict[str, Any]]:
    transitions: list[dict[str, Any]] = []
    for previous, current in zip(levels, levels[1:]):
        delta = current.rms_dbfs - previous.rms_dbfs
        transitions.append(
            {
                "timeSec": current.start_sec,
                "time": format_time(current.start_sec),
                "fromDbfs": previous.rms_dbfs,
                "toDbfs": current.rms_dbfs,
                "deltaDb": delta,
                "absDeltaDb": abs(delta),
                "classification": classify_transition(previous.rms_dbfs, current.rms_dbfs, delta),
            }
        )
    return sorted(transitions, key=lambda row: row["absDeltaDb"], reverse=True)[:limit]


def classify_transition(previous_db: float, current_db: float, delta: float) -> str:
    lower = min(previous_db, current_db)
    higher = max(previous_db, current_db)
    if lower <= SILENCE_DBFS and higher >= -32.0 and abs(delta) >= 24.0:
        return "hard-silence-edge-listen-check"
    if abs(delta) >= 18.0 and higher >= -35.0:
        return "large-level-jump-listen-check"
    if abs(delta) >= 12.0 and higher >= -28.0:
        return "moderate-level-jump"
    return "normal-envelope-change"


def silence_spans(levels: list[WindowLevel], minimum_duration: float) -> list[dict[str, Any]]:
    spans: list[dict[str, Any]] = []
    active_start: float | None = None
    active_end: float | None = None
    for level in levels:
        if level.rms_dbfs <= SILENCE_DBFS:
            if active_start is None:
                active_start = level.start_sec
            active_end = level.end_sec
        elif active_start is not None and active_end is not None:
            duration = active_end - active_start
            if duration >= minimum_duration:
                spans.append(
                    {
                        "startSec": active_start,
                        "endSec": active_end,
                        "durationSec": duration,
                        "start": format_time(active_start),
                        "end": format_time(active_end),
                    }
                )
            active_start = None
            active_end = None
    if active_start is not None and active_end is not None:
        duration = active_end - active_start
        if duration >= minimum_duration:
            spans.append(
                {
                    "startSec": active_start,
                    "endSec": active_end,
                    "durationSec": duration,
                    "start": format_time(active_start),
                    "end": format_time(active_end),
                }
            )
    return sorted(spans, key=lambda row: row["durationSec"], reverse=True)


def percentile(values: list[float], p: float) -> float:
    if not values:
        return 0.0
    ordered = sorted(values)
    index = min(len(ordered) - 1, max(0, int(round((len(ordered) - 1) * p))))
    return ordered[index]


def level_summary(levels: list[WindowLevel]) -> dict[str, Any]:
    values = [item.rms_dbfs for item in levels]
    return {
        "minDbfs": min(values) if values else None,
        "maxDbfs": max(values) if values else None,
        "meanDbfs": sum(values) / len(values) if values else None,
        "p10Dbfs": percentile(values, 0.10),
        "p50Dbfs": percentile(values, 0.50),
        "p90Dbfs": percentile(values, 0.90),
        "silentWindowCount": sum(1 for value in values if value <= SILENCE_DBFS),
        "activeWindowCount": sum(1 for value in values if value > SILENCE_DBFS),
    }


def render_markdown(report: dict[str, Any]) -> str:
    lines = [
        f"# Audio Master Smoothness Audit: {report['baselineId']}",
        "",
        f"Generated: `{report['generatedAt']}`",
        "",
        "This audit scans the mastered WAV for abrupt envelope changes and long low-level spans. It is machine evidence only: it does not approve audio, fail audio, render branches, upload files, or mutate source media.",
        "",
        "## Summary",
        "",
        f"- Passed: `{str(report['passed']).lower()}`",
        f"- Approval status: `{report['approvalStatus']}`",
        f"- Branch inheritance ready: `{str(report['branchInheritanceReady']).lower()}`",
        f"- Branch render ready: `{str(report['branchRenderReady']).lower()}`",
        f"- WAV: `{report['wavPath']}`",
        f"- Window seconds: `{report['audio']['windowSeconds']}`",
        f"- Window count: `{report['audio']['windowCount']}`",
        f"- Hard silence edge checks: `{report['classificationCounts'].get('hard-silence-edge-listen-check', 0)}`",
        f"- Large level jump checks: `{report['classificationCounts'].get('large-level-jump-listen-check', 0)}`",
        f"- Silence spans >= {report['minimumSilenceSeconds']}s: `{len(report['longSilenceSpans'])}`",
        "",
        "## Level summary",
        "",
        "| Metric | dBFS / count |",
        "|---|---:|",
    ]
    for key, value in report["levelSummary"].items():
        rendered = f"{value:.2f}" if isinstance(value, float) else str(value)
        lines.append(f"| {key} | `{rendered}` |")

    lines.extend(
        [
            "",
            "## Largest envelope changes",
            "",
            "| Time | From | To | Delta | Classification |",
            "|---:|---:|---:|---:|---|",
        ]
    )
    for item in report["largestTransitions"]:
        lines.append(
            f"| `{item['time']}` | `{item['fromDbfs']:.2f}` | `{item['toDbfs']:.2f}` | "
            f"`{item['deltaDb']:.2f}` | `{item['classification']}` |"
        )

    lines.extend(
        [
            "",
            "## Longest low-level spans",
            "",
            "| Start | End | Duration |",
            "|---:|---:|---:|",
        ]
    )
    for item in report["longSilenceSpans"][:20]:
        lines.append(f"| `{item['start']}` | `{item['end']}` | `{item['durationSec']:.2f}s` |")
    lines.extend(
        [
            "",
            "## Interpretation",
            "",
            "These are listen-priority markers, not automatic failures. Large transitions can be natural speech starts, intentional gaps, or edits. Use this report to decide where human listening should focus before v006 is allowed to feed episode branches.",
            "",
        ]
    )
    return "\n".join(lines)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--baseline-dir", required=True, type=Path)
    parser.add_argument("--window-sec", type=float, default=0.25)
    parser.add_argument("--transition-limit", type=int, default=40)
    parser.add_argument("--minimum-silence-sec", type=float, default=2.0)
    args = parser.parse_args()

    baseline_dir = resolve_baseline_dir(args.baseline_dir)
    manifest_path = baseline_dir / "manifest.json"
    manifest_before = read_json(manifest_path)
    outputs_before = manifest_before.get("outputs") or {}
    baseline_id = str(manifest_before.get("baselineId") or "audio-baseline")
    slug = safe_slug(baseline_id.replace("episode-4-conformed-production-baseline-", ""))
    generated_at = datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S")
    generated_iso = datetime.now(timezone.utc).isoformat()

    wav_path = output_path(outputs_before.get("masterWav"))
    if not wav_path:
        raise SystemExit("No masterWav registered in manifest outputs.")
    wav = Path(wav_path)
    if not wav.exists():
        raise SystemExit(f"Master WAV is missing: {wav}")

    audio_meta, levels = compute_levels(wav, args.window_sec)
    all_transitions = transition_rows(levels, max(1, len(levels)))
    largest = all_transitions[: args.transition_limit]
    classification_counts: dict[str, int] = {}
    for item in all_transitions:
        classification = str(item["classification"])
        classification_counts[classification] = classification_counts.get(classification, 0) + 1
    silences = silence_spans(levels, args.minimum_silence_sec)

    report = {
        "schema": "quipsly.audio-workbench.master-smoothness-audit.v1",
        "baselineId": baseline_id,
        "baselineDir": str(baseline_dir),
        "generatedAt": generated_iso,
        "approvalStatus": manifest_before.get("approvalStatus"),
        "branchInheritanceReady": bool(manifest_before.get("branchInheritanceReady")),
        "branchRenderReady": bool(manifest_before.get("branchRenderReady")),
        "packageReadyForHumanListen": bool(manifest_before.get("packageReadyForHumanListen")),
        "wavPath": str(wav),
        "audio": audio_meta,
        "levelSummary": level_summary(levels),
        "transitionCount": len(all_transitions),
        "largestTransitions": largest,
        "classificationCounts": classification_counts,
        "minimumSilenceSeconds": args.minimum_silence_sec,
        "longSilenceSpanCount": len(silences),
        "longSilenceSpans": silences[:100],
        "approvalStateChanged": False,
        "branchStateChanged": False,
        "renderAttempted": False,
        "originalMediaMutated": False,
    }
    report["passed"] = bool(
        audio_meta.get("windowCount", 0) > 0
        and not report["approvalStateChanged"]
        and not report["branchStateChanged"]
        and not report["renderAttempted"]
        and not report["originalMediaMutated"]
    )
    report["status"] = "smoothness-audit-ready" if report["passed"] else "smoothness-audit-failed"
    report["hardStopCount"] = 0 if report["passed"] else 1
    report["listenCheckCount"] = (
        len(largest)
        + min(20, len(silences))
        + classification_counts.get("hard-silence-edge-listen-check", 0)
        + classification_counts.get("large-level-jump-listen-check", 0)
    )
    report["reviewRiskCount"] = len(largest) + min(20, len(silences))
    report["machineReadyForHumanListen"] = bool(report["passed"])
    report["humanListenRequired"] = True
    report["publicationReady"] = False

    json_path = baseline_dir / f"audio-master-smoothness-audit-{slug}-{generated_at}.json"
    markdown_path = baseline_dir / f"audio-master-smoothness-audit-{slug}-{generated_at}.md"
    write_json(json_path, report)
    markdown_path.write_text(render_markdown(report), encoding="utf-8")

    manifest = read_json(manifest_path)
    outputs = manifest.setdefault("outputs", {})
    outputs["latestAudioMasterSmoothnessAudit"] = str(json_path)
    outputs["latestAudioMasterSmoothnessAuditMarkdown"] = str(markdown_path)
    audits = outputs.setdefault("audioMasterSmoothnessAudits", [])
    audits.append(
        {
            "path": str(json_path),
            "markdownPath": str(markdown_path),
            "generatedAt": generated_iso,
            "passed": report["passed"],
            "windowSeconds": args.window_sec,
            "windowCount": audio_meta["windowCount"],
            "longSilenceSpanCount": len(silences),
            "hardSilenceEdgeListenChecks": classification_counts.get("hard-silence-edge-listen-check", 0),
            "largeLevelJumpListenChecks": classification_counts.get("large-level-jump-listen-check", 0),
        }
    )
    manifest["audioMasterSmoothnessAuditCount"] = len(audits)
    manifest["audioMasterSmoothnessAuditLatestStatus"] = report["status"]
    manifest["audioMasterSmoothnessAuditPassed"] = bool(report["passed"])
    manifest["audioMasterSmoothnessAuditHardStopCount"] = int(report["hardStopCount"])
    manifest["audioMasterSmoothnessAuditReviewRiskCount"] = int(report["reviewRiskCount"])
    manifest["audioMasterSmoothnessAuditListenCheckCount"] = int(report["listenCheckCount"])
    manifest["audioMasterSmoothnessAuditWindowSeconds"] = float(args.window_sec)
    manifest["audioMasterSmoothnessAuditWindowCount"] = int(audio_meta["windowCount"])
    manifest["audioMasterSmoothnessAuditTransitionCount"] = int(len(all_transitions))
    manifest["audioMasterSmoothnessAuditLongSilenceSpanCount"] = int(len(silences))
    manifest["audioMasterSmoothnessAuditHardSilenceEdgeListenCheckCount"] = int(classification_counts.get("hard-silence-edge-listen-check", 0))
    manifest["audioMasterSmoothnessAuditLargeLevelJumpListenCheckCount"] = int(classification_counts.get("large-level-jump-listen-check", 0))
    manifest["audioMasterSmoothnessAuditModerateLevelJumpCount"] = int(classification_counts.get("moderate-level-jump", 0))
    manifest["audioMasterSmoothnessAuditMachineReadyForHumanListen"] = bool(report["machineReadyForHumanListen"])
    manifest["audioMasterSmoothnessAuditHumanListenRequired"] = True
    manifest["audioMasterSmoothnessAuditPublicationReady"] = False
    manifest["audioMasterSmoothnessAuditApprovalStateChanged"] = False
    manifest["audioMasterSmoothnessAuditBranchStateChanged"] = False
    manifest["audioMasterSmoothnessAuditRenderAttempted"] = False
    manifest["audioMasterSmoothnessAuditOriginalMediaMutated"] = False
    manifest["updatedAt"] = generated_iso
    write_json(manifest_path, manifest)

    print(str(markdown_path))
    if not report["passed"]:
        raise SystemExit(1)


if __name__ == "__main__":
    main()
