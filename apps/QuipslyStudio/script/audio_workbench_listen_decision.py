#!/usr/bin/env python3
"""Create a human listen-decision template for a Quipsly audio candidate.

This script does not approve audio. It creates a timestamped review artifact
that lets Charlie, Mako, Homer, or Codex record the actual human listen proof
needed before a machine-clean candidate becomes an inherited production spine.
"""
from __future__ import annotations

import argparse
import json
import re
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


def version_from_baseline_id(baseline_id: str) -> str:
    match = re.search(r"(v\d+(?:-[A-Za-z0-9-]+)?)$", baseline_id)
    return match.group(1) if match else "unknown"


def path_exists(path_text: str | None) -> bool:
    return bool(path_text) and Path(path_text).exists()


def build_decision_template(
    baseline_dir: Path,
    *,
    reviewer: str,
    notes: str,
) -> tuple[dict[str, Any], str]:
    manifest_path = baseline_dir / "manifest.json"
    manifest = read_json(manifest_path)
    outputs = manifest.get("outputs", {})
    review_packet_path = outputs.get("listenReviewPacket")
    review_packet = read_json(Path(review_packet_path)) if path_exists(review_packet_path) else {}
    listen_proof = review_packet.get("listenProof") or {
        "bundle": outputs.get("listenProofBundle"),
        "manifest": outputs.get("listenProofBundleManifest"),
    }
    baseline_id = manifest.get("baselineId", "unknown-baseline")
    generated_at = datetime.now(timezone.utc).isoformat()
    version = version_from_baseline_id(baseline_id)
    safe_version = version.replace("/", "-")
    timestamp = datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S")
    json_path = baseline_dir / f"audio-listen-decision-{safe_version}-{timestamp}.json"
    md_path = baseline_dir / f"audio-listen-decision-{safe_version}-{timestamp}.md"

    checklist = review_packet.get("reviewerChecklist", [])
    windows = []
    for window in review_packet.get("reviewWindows", []):
        windows.append(
            {
                "label": window.get("label"),
                "sequenceStartSeconds": window.get("sequenceStartSeconds"),
                "durationSeconds": window.get("durationSeconds"),
                "decision": "pending",
                "notes": "",
            }
        )

    decision = {
        "schema": "quipsly.audio-workbench.listen-decision.v1",
        "generatedAt": generated_at,
        "baselineDir": str(baseline_dir),
        "baselineId": baseline_id,
        "approvalStatusAtCreation": manifest.get("approvalStatus"),
        "reviewer": reviewer,
        "decisionStatus": "pending-human-listen",
        "publicationApproved": False,
        "notes": notes,
        "handoffWav": (outputs.get("masterWav") or {}).get("path"),
        "listeningM4a": (outputs.get("masterM4a") or {}).get("path"),
        "listenProof": listen_proof,
        "reviewPacket": review_packet_path,
        "reviewPacketMarkdown": outputs.get("listenReviewPacketMarkdown"),
        "audioReviewCockpitHtml": outputs.get("audioReviewCockpitHtml"),
        "qualityReportMarkdown": outputs.get("qualityReportMarkdown"),
        "proofWindowComparisonMarkdown": outputs.get("proofWindowComparisonMarkdown"),
        "proofWindowListenWorkorderMarkdown": outputs.get("proofWindowListenWorkorderMarkdown"),
        "sourceActivityMarkdown": outputs.get("sourceActivityMarkdown"),
        "checklist": [{"text": item, "status": "pending", "notes": ""} for item in checklist],
        "reviewWindows": windows,
        "issueLog": [
            {
                "sequenceTime": "",
                "symptom": "",
                "severity": "minor|major|blocking",
                "likelyStage": "",
                "requestedNextCandidate": "",
                "notes": "",
            }
        ],
        "promotionRule": (
            "Only change decisionStatus to human-approved-for-branch-inheritance after a real listen pass. "
            "Publication approval stays separate from branch-inheritance approval."
        ),
        "failureRule": (
            "If a review item fails, keep this candidate intact and render a new v007 or timestamped candidate. "
            "Do not overwrite v006."
        ),
        "outputs": {
            "json": str(json_path),
            "markdown": str(md_path),
        },
    }
    return decision, render_markdown(decision)


def render_markdown(decision: dict[str, Any]) -> str:
    proof = decision.get("listenProof", {})
    lines = [
        "# Audio Workbench human listen decision",
        "",
        f"- Baseline: `{decision.get('baselineId')}`",
        f"- Created: `{decision.get('generatedAt')}`",
        f"- Reviewer: `{decision.get('reviewer')}`",
        f"- Decision status: `{decision.get('decisionStatus')}`",
        f"- Publication approved: `{decision.get('publicationApproved')}`",
        "",
        "## What to open",
        "",
        f"- Listen-proof HTML: `{proof.get('html')}`",
        f"- Listen-proof playlist: `{proof.get('playlist')}`",
        f"- Listen-proof bundle: `{proof.get('bundle')}`",
        f"- Audio review cockpit: `{decision.get('audioReviewCockpitHtml')}`",
        f"- Review packet: `{decision.get('reviewPacketMarkdown')}`",
        f"- Proof-window listen workorder: `{decision.get('proofWindowListenWorkorderMarkdown')}`",
        f"- Proof-window comparison: `{decision.get('proofWindowComparisonMarkdown')}`",
        f"- Full WAV handoff: `{decision.get('handoffWav')}`",
        f"- Full M4A listening copy: `{decision.get('listeningM4a')}`",
        "",
        "## Decision",
        "",
        "- [ ] Pass for branch inheritance",
        "- [ ] Fail and request a new v007 or timestamped candidate",
        "- [ ] Needs another focused proof window before deciding",
        "",
        "Decision notes:",
        "",
        "> ",
        "",
        "## Required checks",
        "",
    ]
    checklist = decision.get("checklist", [])
    if not checklist:
        lines.append("- [ ] No checklist found in review packet. Rebuild the review packet before approval.")
    for item in checklist:
        lines.append(f"- [ ] {item.get('text')}")

    lines.extend(["", "## Proof windows", ""])
    for window in decision.get("reviewWindows", []):
        lines.extend(
            [
                f"### {window.get('label')} @ {window.get('sequenceStartSeconds')}s",
                "",
                "- [ ] Pass",
                "- [ ] Problem found",
                "- Notes:",
                "",
                "> ",
                "",
            ]
        )

    lines.extend(
        [
            "## Issue log",
            "",
            "| Sequence time | Symptom | Severity | Likely stage | Requested next candidate | Notes |",
            "|---|---|---|---|---|---|",
            "|  |  | minor/major/blocking |  |  |  |",
            "",
            "## Promotion rule",
            "",
            decision.get("promotionRule", ""),
            "",
            "## Failure rule",
            "",
            decision.get("failureRule", ""),
            "",
        ]
    )
    return "\n".join(lines)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--baseline-dir", required=True, type=Path)
    parser.add_argument("--reviewer", default="Charlie or Mako")
    parser.add_argument("--notes", default="")
    args = parser.parse_args()

    baseline_dir = resolve_baseline_dir(args.baseline_dir)
    decision, markdown = build_decision_template(
        baseline_dir,
        reviewer=args.reviewer,
        notes=args.notes,
    )
    outputs = decision["outputs"]
    json_path = Path(outputs["json"])
    md_path = Path(outputs["markdown"])
    write_json(json_path, decision)
    md_path.write_text(markdown, encoding="utf-8")

    manifest_path = baseline_dir / "manifest.json"
    manifest = read_json(manifest_path)
    manifest_outputs = manifest.setdefault("outputs", {})
    manifest_outputs["latestListenDecisionTemplate"] = str(json_path)
    manifest_outputs["latestListenDecisionTemplateMarkdown"] = str(md_path)
    manifest["approvalStatus"] = manifest.get("approvalStatus") or "machine-candidate-needs-human-listen-proof"
    write_json(manifest_path, manifest)

    print(json.dumps(outputs, indent=2))


if __name__ == "__main__":
    main()
