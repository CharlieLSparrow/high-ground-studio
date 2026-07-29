#!/usr/bin/env python3
"""Audit speaker-aware bleed/noise management for a conformed audio baseline.

This script does not listen, approve, render, or mutate media. It reads the
baseline manifest, speaker-gap automation, source-activity evidence, and
source-contribution proof metrics to produce a machine audit that explains what
the cleanup layer is doing and where a human should listen carefully.
"""

from __future__ import annotations

import argparse
import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


def load_json(path: Path) -> dict[str, Any]:
    return json.loads(path.read_text())


def write_json(path: Path, payload: dict[str, Any]) -> None:
    path.write_text(json.dumps(payload, indent=2) + "\n")


def output_path(value: Any) -> str | None:
    if isinstance(value, str):
        return value
    if isinstance(value, dict):
        path = value.get("path")
        if isinstance(path, str):
            return path
    return None


def db(value: Any) -> float | None:
    if value is None:
        return None
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def delta_db(aligned: dict[str, Any], contribution: dict[str, Any], key: str) -> float | None:
    aligned_db = db(aligned.get(key))
    contribution_db = db(contribution.get(key))
    if aligned_db is None or contribution_db is None:
        return None
    return round(contribution_db - aligned_db, 2)


def classify_reduction(mean_delta: float | None, max_delta: float | None, speaker: str) -> tuple[str, str]:
    if mean_delta is None:
        return "missing-metric", "No contribution-vs-aligned mean delta was available."
    if mean_delta <= -8:
        return "strong-suppression", f"{speaker} contribution is much quieter than aligned evidence; listen for over-gating."
    if mean_delta <= -3:
        return "moderate-suppression", f"{speaker} non-primary material appears reduced while retaining some bed/reaction room."
    if mean_delta <= 1.5:
        return "light-or-neutral", f"{speaker} contribution level is close to aligned evidence; likely preserving speech/reactions."
    return "amplified", f"{speaker} contribution is louder than aligned evidence; check for noise/bleed amplification."


def safe_slug(value: str) -> str:
    out = "".join(ch.lower() if ch.isalnum() else "-" for ch in value)
    while "--" in out:
        out = out.replace("--", "-")
    return out.strip("-") or "audio-baseline"


def build_window_rows(source_contribution: dict[str, Any]) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    for item in source_contribution.get("proofWindowMetrics") or []:
        metrics = item.get("metrics") if isinstance(item.get("metrics"), dict) else {}
        charlie_aligned = metrics.get("charlieAligned") or {}
        charlie_contribution = metrics.get("charlieContribution") or {}
        homer_aligned = metrics.get("homerDjiAligned") or {}
        homer_contribution = metrics.get("homerContribution") or {}
        charlie_mean_delta = delta_db(charlie_aligned, charlie_contribution, "meanVolumeDb")
        charlie_max_delta = delta_db(charlie_aligned, charlie_contribution, "maxVolumeDb")
        homer_mean_delta = delta_db(homer_aligned, homer_contribution, "meanVolumeDb")
        homer_max_delta = delta_db(homer_aligned, homer_contribution, "maxVolumeDb")
        charlie_class, charlie_note = classify_reduction(charlie_mean_delta, charlie_max_delta, "Charlie")
        homer_class, homer_note = classify_reduction(homer_mean_delta, homer_max_delta, "Homer")
        warnings: list[str] = []
        if charlie_class == "strong-suppression":
            warnings.append("charlie-overgate-listen-check")
        if homer_class == "strong-suppression":
            warnings.append("homer-overgate-listen-check")
        if homer_class == "amplified":
            warnings.append("homer-noise-amplification-check")
        if charlie_class == "amplified":
            warnings.append("charlie-bleed-amplification-check")
        rows.append(
            {
                "label": item.get("label"),
                "sequenceStartSeconds": item.get("sequenceStartSeconds"),
                "durationSeconds": item.get("durationSeconds"),
                "charlieMeanReductionDb": charlie_mean_delta,
                "charlieMaxReductionDb": charlie_max_delta,
                "charlieClassification": charlie_class,
                "charlieNote": charlie_note,
                "homerMeanReductionDb": homer_mean_delta,
                "homerMaxReductionDb": homer_max_delta,
                "homerClassification": homer_class,
                "homerNote": homer_note,
                "warnings": warnings,
            }
        )
    return rows


def summarize_rows(rows: list[dict[str, Any]]) -> dict[str, Any]:
    warning_count = sum(len(row.get("warnings") or []) for row in rows)
    charlie_classes: dict[str, int] = {}
    homer_classes: dict[str, int] = {}
    for row in rows:
        charlie_classes[str(row.get("charlieClassification"))] = charlie_classes.get(str(row.get("charlieClassification")), 0) + 1
        homer_classes[str(row.get("homerClassification"))] = homer_classes.get(str(row.get("homerClassification")), 0) + 1
    return {
        "proofWindowCount": len(rows),
        "warningCount": warning_count,
        "charlieClassifications": charlie_classes,
        "homerClassifications": homer_classes,
    }


def build_markdown(payload: dict[str, Any]) -> str:
    lines = [
        f"# Bleed Management Audit: {payload['baselineId']}",
        "",
        f"Generated: `{payload['generatedAt']}`",
        "",
        "This is machine evidence for the speaker-aware cleanup layer. It is not human approval.",
        "",
        "## Current truth",
        "",
        f"- Approval status: `{payload['approvalStatus']}`",
        f"- Original media mutated: `{str(payload['originalMediaMutated']).lower()}`",
        f"- Timeline preserved by automation: `{str(payload['timelinePreserved']).lower()}`",
        f"- Expected timeline duration: `{payload['expectedTimelineDurationSeconds']}` seconds",
        f"- Master duration from manifest probe: `{payload['masterDurationSeconds']}` seconds",
        f"- Proof windows audited: `{payload['summary']['proofWindowCount']}`",
        f"- Machine listen-priority warnings: `{payload['summary']['warningCount']}`",
        "",
        "## Interpretation",
        "",
        "- Negative reduction values mean the contribution stem is quieter than the aligned source stem in that proof window.",
        "- Light or neutral reduction can be correct when the person is actively speaking or reacting.",
        "- Strong suppression can be correct in downspaces, but it needs listening checks so we do not make the conversation sound chopped.",
        "- This audit proves inspectability and sync-preserving intent; only human listening can approve the baseline for branch inheritance.",
        "",
        "## Proof-window rows",
        "",
        "| Window | Start | Charlie mean delta | Charlie class | Homer mean delta | Homer class | Warnings |",
        "|---|---:|---:|---|---:|---|---|",
    ]
    for row in payload["proofWindows"]:
        warnings = ", ".join(row.get("warnings") or []) or "none"
        lines.append(
            f"| {row.get('label')} | {row.get('sequenceStartSeconds')} | {row.get('charlieMeanReductionDb')} dB | {row.get('charlieClassification')} | {row.get('homerMeanReductionDb')} dB | {row.get('homerClassification')} | {warnings} |"
        )
    lines.extend(
        [
            "",
            "## Next safest action",
            "",
            payload["nextSafestAction"],
            "",
        ]
    )
    return "\n".join(lines)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--baseline-dir", required=True, type=Path)
    args = parser.parse_args()

    baseline_dir = args.baseline_dir.expanduser().resolve()
    manifest_path = baseline_dir / "manifest.json"
    if not manifest_path.exists():
        raise SystemExit(f"Missing manifest: {manifest_path}")
    manifest = load_json(manifest_path)
    outputs = manifest.setdefault("outputs", {})

    automation_path = output_path(outputs.get("speakerGapAutomation"))
    activity_path = output_path(outputs.get("sourceActivity"))
    contribution_path = output_path(outputs.get("sourceContributionReport"))
    missing = [
        label
        for label, path in [
            ("speakerGapAutomation", automation_path),
            ("sourceActivity", activity_path),
            ("sourceContributionReport", contribution_path),
        ]
        if not path or not Path(path).exists()
    ]
    if missing:
        raise SystemExit(f"Missing required evidence: {', '.join(missing)}")

    automation = load_json(Path(automation_path or ""))
    activity = load_json(Path(activity_path or ""))
    contribution = load_json(Path(contribution_path or ""))
    rows = build_window_rows(contribution)
    summary = summarize_rows(rows)
    generated_at = datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S")
    slug = safe_slug(str(manifest.get("baselineId") or "audio-baseline").replace("episode-4-conformed-production-baseline-", ""))
    output_json = baseline_dir / f"audio-bleed-management-audit-{slug}-{generated_at}.json"
    output_md = baseline_dir / f"audio-bleed-management-audit-{slug}-{generated_at}.md"
    master_probe = ((outputs.get("masterWav") or {}).get("probe") if isinstance(outputs.get("masterWav"), dict) else {}) or {}

    payload = {
        "schema": "quipsly.audio-workbench.bleed-management-audit.v1",
        "generatedAt": generated_at,
        "baselineDir": str(baseline_dir),
        "baselineId": manifest.get("baselineId"),
        "approvalStatus": manifest.get("approvalStatus"),
        "originalMediaMutated": bool(automation.get("originalMediaMutated")),
        "timelinePreserved": bool(automation.get("timelinePreserved")),
        "expectedTimelineDurationSeconds": automation.get("expectedTimelineDurationSeconds"),
        "masterDurationSeconds": master_probe.get("duration"),
        "automationMode": automation.get("mode"),
        "automationSummary": automation.get("automationSummary"),
        "sourceActivitySummary": {
            "classificationSummary": activity.get("classificationSummary"),
            "retentionSummary": activity.get("retentionSummary"),
        },
        "summary": summary,
        "proofWindows": rows,
        "nextSafestAction": "Open the human listen-session HTML and use this audit to focus on proof windows where suppression could sound over-gated or amplified. Do not unlock branch inheritance until human listen proof passes.",
    }

    write_json(output_json, payload)
    output_md.write_text(build_markdown(payload))

    outputs["latestBleedManagementAudit"] = str(output_json)
    outputs["latestBleedManagementAuditMarkdown"] = str(output_md)
    manifest["bleedManagementAuditCount"] = int(manifest.get("bleedManagementAuditCount") or 0) + 1
    manifest["bleedManagementAuditWarningCount"] = int(summary["warningCount"])
    manifest["bleedManagementAuditTimelinePreserved"] = bool(payload["timelinePreserved"])
    manifest["bleedManagementAuditOriginalMediaMutated"] = bool(payload["originalMediaMutated"])
    write_json(manifest_path, manifest)

    print(f"Wrote {output_md}")
    print(f"Wrote {output_json}")
    print(f"Proof windows: {summary['proofWindowCount']}")
    print(f"Warnings: {summary['warningCount']}")


if __name__ == "__main__":
    main()
