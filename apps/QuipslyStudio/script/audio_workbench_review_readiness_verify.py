#!/usr/bin/env python3
"""Verify that an audio baseline is ready for human listen review.

This does not approve audio. It checks whether the review package is coherent:
all expected artifacts exist, visual proof windows rendered, handoff links are
valid, and branch inheritance remains locked until a human listen decision.
"""

from __future__ import annotations

import argparse
import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


REQUIRED_OUTPUTS = [
    ("masterWav", "Handoff WAV"),
    ("masterM4a", "Listening M4A"),
    ("listenReviewPacketMarkdown", "Listen review packet"),
    ("audioReviewCockpitHtml", "Audio review cockpit"),
    ("latestEditorHandoffPacketMarkdown", "Editor handoff packet"),
    ("latestEditorMarkerPacketMarkdown", "Editor marker packet"),
    ("latestEditorMarkerPacketCsv", "Editor marker CSV"),
    ("latestEditorMarkerPacketPlaylist", "Editor marker playlist"),
    ("latestEditorMarkerReviewConsoleHtml", "Marker review console"),
    ("latestEditorMarkerReviewConsoleNotesTemplate", "Marker review notes template"),
    ("latestMarkerReviewCommandPacket", "Marker review command packet JSON"),
    ("latestMarkerReviewCommandPacketMarkdown", "Marker review command packet"),
    ("proofWindowComparisonMarkdown", "Proof-window comparison"),
    ("proofWindowListenWorkorderMarkdown", "Proof-window listen workorder"),
    ("latestVisualProofWindowsMarkdown", "Visual proof-window QC report"),
    ("latestVisualProofWindowsHtml", "Visual proof-window QC HTML"),
    ("latestProofWindowAudioLabMarkdown", "Proof-window audio lab"),
    ("latestReviewerNotesDecisionBridgeSmokeMarkdown", "Reviewer notes decision bridge smoke"),
    ("latestPostListenOutcomeRouterSmokeMarkdown", "Post-listen outcome router smoke"),
    ("latestBleedRepairExecutorSmokeMarkdown", "Bleed repair executor smoke"),
    ("latestReviewHandoffIndexMarkdown", "Review handoff index"),
    ("latestListenDecisionTemplateMarkdown", "Listen decision template"),
    ("latestBranchInheritanceGateMarkdown", "Branch-inheritance gate"),
    ("branchRenderPreflightMarkdown", "Branch-render preflight"),
]


def output_path(value: Any) -> str | None:
    if value is None:
        return None
    if isinstance(value, str):
        return value
    if isinstance(value, dict):
        path = value.get("path")
        if isinstance(path, str):
            return path
    return None


def load_json(path: Path) -> dict[str, Any]:
    return json.loads(path.read_text())


def check_path(key: str, label: str, value: Any) -> dict[str, Any]:
    path = output_path(value)
    exists = bool(path) and Path(path).exists()
    return {
        "key": key,
        "label": label,
        "path": path,
        "exists": exists,
        "size": Path(path).stat().st_size if exists else None,
    }


def safe_slug(value: str) -> str:
    out = "".join(ch.lower() if ch.isalnum() else "-" for ch in value)
    while "--" in out:
        out = out.replace("--", "-")
    return out.strip("-") or "audio-baseline"


def build_markdown(report: dict[str, Any]) -> str:
    lines = [
        f"# Audio Review Readiness Verification: {report['baselineId']}",
        "",
        f"Generated: `{report['generatedAt']}`",
        "",
        "This verifies package coherence only. It does not approve the audio.",
        "",
        "## Verdict",
        "",
        f"- Package ready for human listen: `{str(report['packageReadyForHumanListen']).lower()}`",
        f"- Human listen still required: `{str(report['humanListenStillRequired']).lower()}`",
        f"- Branch inheritance safely locked: `{str(report['branchInheritanceSafelyLocked']).lower()}`",
        f"- Publication approved: `{str(report['publicationApproved']).lower()}`",
        f"- Blocking errors: `{len(report['errors'])}`",
        f"- Warnings: `{len(report['warnings'])}`",
        "",
    ]
    if report["errors"]:
        lines.extend(["## Errors", ""])
        lines.extend(f"- {error}" for error in report["errors"])
        lines.append("")
    if report["warnings"]:
        lines.extend(["## Warnings", ""])
        lines.extend(f"- {warning}" for warning in report["warnings"])
        lines.append("")
    lines.extend(
        [
            "## Required artifacts",
            "",
            "| Artifact | Manifest key | Status | Path |",
            "|---|---:|---:|---|",
        ]
    )
    for artifact in report["requiredArtifacts"]:
        status = "present" if artifact["exists"] else "missing"
        lines.append(f"| {artifact['label']} | `{artifact['key']}` | {status} | `{artifact['path'] or ''}` |")
    lines.extend(
        [
            "",
            "## Review evidence counts",
            "",
            f"- Proof snippets: `{report['proofSnippetCount']}`",
            f"- Visual proof windows: `{report['visualProofWindowCount']}`",
            f"- Failed waveform renders: `{report['visualProofFailedWaveformCount']}`",
        f"- Review handoff missing linked artifacts: `{report['latestReviewHandoffMissingArtifactCount']}`",
        f"- Marker review command packet count: `{report['markerReviewCommandPacketCount']}`",
        f"- Marker command suggested decision: `{report['markerReviewCommandSuggestedDecisionStatus'] or 'unknown'}`",
        f"- Marker command critical undecided count: `{report['markerReviewCommandCriticalUndecidedCount']}`",
        f"- Branch render proof count: `{report['branchRenderProofCount']}`",
        "",
        "## Next safest action",
            "",
            report["nextSafestAction"],
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

    generated_at = datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S")
    baseline_id = str(manifest.get("baselineId") or "audio-baseline")
    slug = safe_slug(baseline_id.replace("episode-4-conformed-production-baseline-", ""))

    errors: list[str] = []
    warnings: list[str] = []

    required_artifacts = [check_path(key, label, outputs.get(key)) for key, label in REQUIRED_OUTPUTS]
    for artifact in required_artifacts:
        if not artifact["exists"]:
            errors.append(f"Missing required artifact: {artifact['label']} ({artifact['key']})")

    proof_snippets = outputs.get("proofSnippets") or []
    proof_snippet_count = len(proof_snippets) if isinstance(proof_snippets, list) else 0
    if proof_snippet_count < 1:
        errors.append("No proof snippets are registered in outputs.proofSnippets")

    visual_json_path = output_path(outputs.get("latestVisualProofWindows"))
    visual_window_count = int(manifest.get("visualProofWindowCount") or 0)
    visual_failed_count = int(manifest.get("visualProofFailedWaveformCount") or 0)
    if visual_json_path and Path(visual_json_path).exists():
        visual_report = load_json(Path(visual_json_path))
        visual_window_count = int(visual_report.get("windowCount") or visual_window_count)
        visual_failed_count = int(visual_report.get("failedWaveformCount") or visual_failed_count)
    else:
        errors.append("Latest visual proof-window JSON is missing")
    if visual_window_count < proof_snippet_count:
        warnings.append("Visual proof-window count is lower than proof snippet count")
    if visual_failed_count:
        errors.append(f"Visual proof-window QC has {visual_failed_count} failed waveform render(s)")

    handoff_json_path = output_path(outputs.get("latestReviewHandoffIndex"))
    handoff_missing_count = None
    if handoff_json_path and Path(handoff_json_path).exists():
        handoff = load_json(Path(handoff_json_path))
        handoff_missing_count = int(handoff.get("missingArtifactCount") or 0)
        if handoff_missing_count:
            errors.append(f"Latest review handoff index reports {handoff_missing_count} missing artifact(s)")
    else:
        errors.append("Latest review handoff index JSON is missing")

    marker_command_packet_count = int(manifest.get("markerReviewCommandPacketCount") or 0)
    marker_command_suggested_status = None
    marker_command_critical_undecided = 0
    marker_command_packet_path = output_path(outputs.get("latestMarkerReviewCommandPacket"))
    if marker_command_packet_path and Path(marker_command_packet_path).exists():
        marker_command_packet = load_json(Path(marker_command_packet_path))
        marker_command_suggested_status = (
            marker_command_packet.get("notesAnalysis", {}).get("suggestedDecisionStatus")
        )
        marker_command_critical_undecided = int(
            marker_command_packet.get("notesAnalysis", {})
            .get("counts", {})
            .get("criticalUndecidedCount")
            or 0
        )
        if marker_command_packet.get("schema") != "quipsly.audio-workbench.marker-review-command-packet.v1":
            errors.append("Latest marker review command packet has unexpected schema")
        if marker_command_packet.get("approvalStateChanged"):
            errors.append("Marker review command packet changed approval state")
        if marker_command_packet.get("branchStateChanged"):
            errors.append("Marker review command packet changed branch state")
        if marker_command_packet.get("renderAttempted"):
            errors.append("Marker review command packet attempted a render")
        if marker_command_packet.get("originalMediaMutated"):
            errors.append("Marker review command packet reports original media mutation")
        if marker_command_packet.get("baselineId") != baseline_id:
            errors.append("Marker review command packet baselineId does not match manifest")
    else:
        errors.append("Latest marker review command packet JSON is missing")
    if marker_command_packet_count < 1:
        errors.append("No marker review command packet has been registered")

    listen_template_path = output_path(outputs.get("latestListenDecisionTemplate"))
    decision_status = None
    publication_approved = False
    if listen_template_path and Path(listen_template_path).exists():
        listen_template = load_json(Path(listen_template_path))
        decision_status = listen_template.get("decisionStatus") or listen_template.get("status")
        publication_approved = bool(listen_template.get("publicationApproved"))
    else:
        errors.append("Latest listen decision template JSON is missing")

    approval_status = manifest.get("approvalStatus")
    branch_inheritance_ready = bool(manifest.get("branchInheritanceReady"))
    branch_render_ready = bool(manifest.get("branchRenderReady"))
    branch_render_proof_count = int(manifest.get("branchRenderProofCount") or 0)

    if approval_status != "machine-candidate-needs-human-listen-proof":
        warnings.append(f"Unexpected approvalStatus for pending review: {approval_status!r}")
    if decision_status and decision_status != "pending-human-listen":
        warnings.append(f"Listen decision template is not pending-human-listen: {decision_status!r}")
    if publication_approved:
        errors.append("Publication approval is true before human listen proof")
    if branch_inheritance_ready:
        errors.append("Branch inheritance is ready before human listen proof")
    if branch_render_ready:
        errors.append("Branch render is ready before human listen proof")

    package_ready = not errors
    human_listen_still_required = approval_status == "machine-candidate-needs-human-listen-proof" and not branch_inheritance_ready
    branch_inheritance_safely_locked = not branch_inheritance_ready and not branch_render_ready

    report = {
        "schema": "quipsly.audio-workbench.review-readiness-verification.v1",
        "generatedAt": generated_at,
        "baselineDir": str(baseline_dir),
        "baselineId": baseline_id,
        "approvalStatus": approval_status,
        "decisionStatus": decision_status,
        "publicationApproved": publication_approved,
        "branchInheritanceReady": branch_inheritance_ready,
        "branchRenderReady": branch_render_ready,
        "branchRenderProofCount": branch_render_proof_count,
        "branchInheritanceSafelyLocked": branch_inheritance_safely_locked,
        "humanListenStillRequired": human_listen_still_required,
        "packageReadyForHumanListen": package_ready,
        "requiredArtifacts": required_artifacts,
        "proofSnippetCount": proof_snippet_count,
        "visualProofWindowCount": visual_window_count,
        "visualProofFailedWaveformCount": visual_failed_count,
        "latestReviewHandoffMissingArtifactCount": handoff_missing_count,
        "markerReviewCommandPacketCount": marker_command_packet_count,
        "markerReviewCommandSuggestedDecisionStatus": marker_command_suggested_status,
        "markerReviewCommandCriticalUndecidedCount": marker_command_critical_undecided,
        "errors": errors,
        "warnings": warnings,
        "nextSafestAction": (
            "Open the latest review handoff index/cockpit and complete human listen proof. "
            "If it passes, record human-approved-for-branch-inheritance; if it fails, render v007/timestamped repair."
            if package_ready
            else "Repair missing or inconsistent review artifacts before asking for human listen proof."
        ),
    }

    output_json = baseline_dir / f"audio-review-readiness-verification-{slug}-{generated_at}.json"
    output_md = baseline_dir / f"audio-review-readiness-verification-{slug}-{generated_at}.md"
    output_json.write_text(json.dumps(report, indent=2) + "\n")
    output_md.write_text(build_markdown(report) + "\n")

    outputs["latestReviewReadinessVerification"] = str(output_json)
    outputs["latestReviewReadinessVerificationMarkdown"] = str(output_md)
    history = outputs.setdefault("reviewReadinessVerifications", [])
    if str(output_json) not in history:
        history.append(str(output_json))
    manifest["latestReviewReadinessVerificationGeneratedAt"] = generated_at
    manifest["reviewReadinessVerificationCount"] = len(history)
    manifest["packageReadyForHumanListen"] = package_ready
    manifest_path.write_text(json.dumps(manifest, indent=2) + "\n")

    print(f"Wrote {output_md}")
    print(f"Wrote {output_json}")
    print(f"Package ready for human listen: {package_ready}")
    print(f"Errors: {len(errors)}")
    print(f"Warnings: {len(warnings)}")


if __name__ == "__main__":
    main()
