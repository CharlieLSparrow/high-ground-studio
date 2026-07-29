#!/usr/bin/env python3
"""Create a safe repair workorder from the latest bleed-management audit.

This script does not render, approve, or mutate source media. It turns machine
warnings into scoped, reversible v007 repair guidance that can be used only if
human listening confirms the warning is a real problem.
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


def safe_slug(value: str) -> str:
    out = "".join(ch.lower() if ch.isalnum() else "-" for ch in value)
    while "--" in out:
        out = out.replace("--", "-")
    return out.strip("-") or "audio-baseline"


def repair_for_warning(row: dict[str, Any], warning: str) -> dict[str, Any]:
    if warning == "charlie-overgate-listen-check":
        return {
            "warning": warning,
            "windowLabel": row.get("label"),
            "sequenceStartSeconds": row.get("sequenceStartSeconds"),
            "durationSeconds": row.get("durationSeconds"),
            "symptomToConfirm": "Charlie reactions or overlap may sound over-gated, chopped, emotionally dead, or unnaturally absent.",
            "listenAgainst": [
                "raw aligned proof window",
                "source-aware contribution mix",
                "conformed master spine",
                "speaker-split Charlie-left/Homer-right diagnostic",
            ],
            "safeRepairIfConfirmed": [
                "Create a v007/timestamped proof-window candidate only; do not overwrite v006.",
                "Relax Charlie contribution gating in this treatment profile: lower agate threshold, reduce ratio, and/or lengthen release.",
                "Preserve timeline length and source offsets exactly.",
                "Compare the same proof window before any full-length render.",
                "Promote to full v007 only if the proof restores natural reactions without reintroducing distracting Homer echo.",
            ],
            "doNotDo": [
                "Do not compensate by changing edit branch timing.",
                "Do not boost the whole Charlie stem globally before checking echo return.",
                "Do not mutate source files.",
                "Do not unlock branch inheritance from this workorder alone.",
            ],
        }
    if warning == "homer-overgate-listen-check":
        return {
            "warning": warning,
            "windowLabel": row.get("label"),
            "sequenceStartSeconds": row.get("sequenceStartSeconds"),
            "durationSeconds": row.get("durationSeconds"),
            "symptomToConfirm": "Homer speech, laughter, or reactions may be too suppressed.",
            "listenAgainst": [
                "raw aligned proof window",
                "source-aware contribution mix",
                "conformed master spine",
                "speaker-split Charlie-left/Homer-right diagnostic",
            ],
            "safeRepairIfConfirmed": [
                "Create a v007/timestamped proof-window candidate only; do not overwrite v006.",
                "Relax Homer protection/contribution gating before touching master loudness.",
                "Preserve park-noise reduction in non-speaking gaps where possible.",
                "Compare proof windows before any full-length render.",
            ],
            "doNotDo": [
                "Do not flatten Homer with broad denoise if it damages intelligibility.",
                "Do not mutate source files.",
                "Do not unlock branch inheritance from this workorder alone.",
            ],
        }
    return {
        "warning": warning,
        "windowLabel": row.get("label"),
        "sequenceStartSeconds": row.get("sequenceStartSeconds"),
        "durationSeconds": row.get("durationSeconds"),
        "symptomToConfirm": "Machine warning needs human listen confirmation.",
        "listenAgainst": ["raw aligned proof window", "conformed master spine"],
        "safeRepairIfConfirmed": [
            "Create a timestamped proof-window candidate only.",
            "Tune the smallest treatment stage that explains the warning.",
            "Preserve source timing and original media.",
        ],
        "doNotDo": ["Do not unlock branch inheritance from this workorder alone."],
    }


def build_markdown(payload: dict[str, Any]) -> str:
    lines = [
        f"# Bleed Repair Workorder: {payload['baselineId']}",
        "",
        f"Generated: `{payload['generatedAt']}`",
        "",
        "This is a conditional repair plan. It does not mean v006 failed. It exists so a human listen failure has a scoped v007 path instead of a panic retune.",
        "",
        "## Current truth",
        "",
        f"- Approval status: `{payload['approvalStatus']}`",
        f"- Source audit: `{payload['bleedManagementAuditMarkdown']}`",
        f"- Warning count: `{payload['warningCount']}`",
        f"- Repair action count: `{len(payload['repairActions'])}`",
        f"- Branch inheritance remains locked: `{str(not payload['branchInheritanceReady']).lower()}`",
        "",
    ]
    if not payload["repairActions"]:
        lines.extend(
            [
                "## No machine repair actions",
                "",
                "The bleed audit produced no repair actions. Human listening is still required before branch inheritance.",
                "",
            ]
        )
    for index, action in enumerate(payload["repairActions"], start=1):
        lines.extend(
            [
                f"## Repair action {index}: `{action['warning']}`",
                "",
                f"- Window: `{action.get('windowLabel')}`",
                f"- Start: `{action.get('sequenceStartSeconds')}` seconds",
                f"- Duration: `{action.get('durationSeconds')}` seconds",
                f"- Symptom to confirm: {action.get('symptomToConfirm')}",
                "",
                "Listen against:",
                "",
                *[f"- {item}" for item in action.get("listenAgainst") or []],
                "",
                "Safe repair if confirmed:",
                "",
                *[f"- {item}" for item in action.get("safeRepairIfConfirmed") or []],
                "",
                "Do not:",
                "",
                *[f"- {item}" for item in action.get("doNotDo") or []],
                "",
            ]
        )
    lines.extend(
        [
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
    audit_path = output_path(outputs.get("latestBleedManagementAudit"))
    audit_md = output_path(outputs.get("latestBleedManagementAuditMarkdown"))
    if not audit_path or not Path(audit_path).exists():
        raise SystemExit("Missing latestBleedManagementAudit in manifest outputs")

    audit = load_json(Path(audit_path))
    repair_actions: list[dict[str, Any]] = []
    for row in audit.get("proofWindows") or []:
        for warning in row.get("warnings") or []:
            repair_actions.append(repair_for_warning(row, str(warning)))

    generated_at = datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S")
    slug = safe_slug(str(manifest.get("baselineId") or "audio-baseline").replace("episode-4-conformed-production-baseline-", ""))
    output_json = baseline_dir / f"audio-bleed-repair-workorder-{slug}-{generated_at}.json"
    output_md = baseline_dir / f"audio-bleed-repair-workorder-{slug}-{generated_at}.md"
    payload = {
        "schema": "quipsly.audio-workbench.bleed-repair-workorder.v1",
        "generatedAt": generated_at,
        "baselineDir": str(baseline_dir),
        "baselineId": manifest.get("baselineId"),
        "approvalStatus": manifest.get("approvalStatus"),
        "branchInheritanceReady": bool(manifest.get("branchInheritanceReady")),
        "bleedManagementAudit": audit_path,
        "bleedManagementAuditMarkdown": audit_md,
        "warningCount": int((audit.get("summary") or {}).get("warningCount") or 0),
        "repairActions": repair_actions,
        "nextSafestAction": "Use the human listen-session HTML. If the warning is inaudible or acceptable, record approval after listening. If it is real, record failed-human-listen and render a timestamped v007 proof-window candidate using the scoped repair action.",
    }
    write_json(output_json, payload)
    output_md.write_text(build_markdown(payload))

    outputs["latestBleedRepairWorkorder"] = str(output_json)
    outputs["latestBleedRepairWorkorderMarkdown"] = str(output_md)
    manifest["bleedRepairWorkorderCount"] = int(manifest.get("bleedRepairWorkorderCount") or 0) + 1
    manifest["bleedRepairWorkorderActionCount"] = len(repair_actions)
    write_json(manifest_path, manifest)

    print(f"Wrote {output_md}")
    print(f"Wrote {output_json}")
    print(f"Repair actions: {len(repair_actions)}")


if __name__ == "__main__":
    main()
