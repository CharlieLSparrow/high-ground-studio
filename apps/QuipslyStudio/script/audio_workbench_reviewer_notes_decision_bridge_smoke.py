#!/usr/bin/env python3
"""Smoke-test the reviewer-notes-to-listen-decision bridge.

This proves the browser-notes workflow can safely reach the existing guarded
listen-decision recorder without mutating the real approval state.

The smoke creates synthetic imported-notes packets from the current listen
decision matrix, runs only dry-runs through
audio_workbench_record_listen_decision_from_notes.py, and registers the smoke
report on the real manifest.
"""

from __future__ import annotations

import argparse
import json
import subprocess
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


def read_json(path: Path) -> dict[str, Any]:
    return json.loads(path.read_text(encoding="utf-8"))


def write_json(path: Path, value: dict[str, Any]) -> None:
    path.write_text(json.dumps(value, indent=2, sort_keys=True) + "\n", encoding="utf-8")


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


def output_path(value: Any) -> str | None:
    if isinstance(value, str):
        return value
    if isinstance(value, dict):
        path = value.get("path")
        if isinstance(path, str):
            return path
    return None


def path_from_output(outputs: dict[str, Any], key: str) -> Path | None:
    path = output_path(outputs.get(key))
    return Path(path) if path else None


def repo_root() -> Path:
    return Path(__file__).resolve().parents[3]


def run_step(name: str, args: list[str], cwd: Path) -> dict[str, Any]:
    result = subprocess.run(args, cwd=cwd, text=True, capture_output=True)
    parsed: Any = None
    if result.stdout.strip():
        try:
            parsed = json.loads(result.stdout)
        except json.JSONDecodeError:
            parsed = None
    return {
        "name": name,
        "args": args,
        "returncode": result.returncode,
        "stdout": result.stdout.strip(),
        "stderr": result.stderr.strip(),
        "parsedStdout": parsed,
        "ok": result.returncode == 0,
    }


def synthetic_packet(
    *,
    baseline_dir: Path,
    manifest: dict[str, Any],
    matrix: dict[str, Any],
    packet_path: Path,
    decision: str,
    suggested_status: str,
) -> dict[str, Any]:
    windows = []
    pass_count = fail_count = more_proof_count = undecided_count = 0
    for window in matrix.get("reviewWindows") or []:
        label = str(window.get("label") or "")
        if decision == "pass":
            pass_count += 1
        elif decision == "fail":
            fail_count += 1
        elif decision == "more-proof":
            more_proof_count += 1
        else:
            undecided_count += 1
        windows.append(
            {
                "label": label,
                "sequenceStartSeconds": window.get("sequenceStartSeconds"),
                "durationSeconds": window.get("durationSeconds"),
                "criticalListen": bool(window.get("criticalListen")),
                "decision": decision,
                "notes": f"Synthetic {decision} note for bridge smoke. Not human review.",
            }
        )
    return {
        "schema": "quipsly.audio-workbench.reviewer-notes-packet.v1",
        "mode": "imported-notes",
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "baselineDir": str(baseline_dir),
        "baselineId": manifest.get("baselineId"),
        "approvalStatus": manifest.get("approvalStatus"),
        "reviewer": "Reviewer notes bridge smoke",
        "sourceNotesJson": str(packet_path),
        "wholeEpisodeNotes": f"Synthetic {decision} packet for bridge smoke. Not human review.",
        "windows": windows,
        "summary": {
            "windowCount": len(windows),
            "passCount": pass_count,
            "failCount": fail_count,
            "moreProofCount": more_proof_count,
            "undecidedCount": undecided_count,
        },
        "suggestedDecisionStatus": suggested_status,
        "commands": {},
        "approvalStateChanged": False,
        "originalMediaMutated": False,
    }


def synthetic_marker_packet(
    *,
    manifest: dict[str, Any],
    marker_packet: dict[str, Any],
    decision: str,
    suggested_status: str,
) -> dict[str, Any]:
    markers = []
    for marker in marker_packet.get("markers") or []:
        markers.append(
            {
                "markerId": marker.get("markerId"),
                "category": marker.get("category"),
                "timecodeIn": marker.get("timecodeIn"),
                "sequenceStartSeconds": marker.get("sequenceStartSeconds"),
                "decision": decision,
                "notes": f"Synthetic {decision} marker note for bridge smoke. Not human review.",
            }
        )
    return {
        "schema": "quipsly.audio-workbench.marker-review-notes.v1",
        "exportedAt": datetime.now(timezone.utc).isoformat(),
        "baselineId": manifest.get("baselineId"),
        "approvalStatusAtExport": manifest.get("approvalStatus"),
        "humanListenStillRequiredAtExport": True,
        "overallNotes": f"Synthetic marker {decision} packet for bridge smoke. Not human review.",
        "markers": markers,
        "suggestedDecision": suggested_status,
        "note": "Synthetic marker packet for bridge smoke only.",
    }


def markdown(report: dict[str, Any]) -> str:
    lines = [
        f"# Reviewer Notes Decision Bridge Smoke: {report['baselineId']}",
        "",
        f"Generated: `{report['generatedAt']}`",
        "",
        "This smoke uses synthetic reviewer-notes packets. It does not approve the real baseline, fail it, render branches, upload anything, or mutate source media.",
        "",
        "## Verdict",
        "",
        f"- Smoke passed: `{str(report['smokePassed']).lower()}`",
        f"- Real approval state preserved: `{str(report['realApprovalStatePreserved']).lower()}`",
        f"- Needs-proof dry-run OK: `{str(report['needsProofDryRunOk']).lower()}`",
        f"- Pass without confirmation blocked: `{str(report['passWithoutConfirmationBlocked']).lower()}`",
        f"- Pass with confirmation dry-run OK: `{str(report['passWithConfirmationDryRunOk']).lower()}`",
        f"- Pass source-aware approval preflight OK: `{str(report['passWithConfirmationSourceAwarePreflightOk']).lower()}`",
        f"- Wrong-baseline packet blocked: `{str(report['wrongBaselinePacketBlocked']).lower()}`",
        f"- Marker needs-repair dry-run OK: `{str(report['markerNeedsRepairDryRunOk']).lower()}`",
        f"- Marker approval without confirmation blocked: `{str(report['markerApprovalWithoutConfirmationBlocked']).lower()}`",
        f"- Marker approval with confirmation dry-run OK: `{str(report['markerApprovalWithConfirmationDryRunOk']).lower()}`",
        f"- Marker source-aware approval preflight OK: `{str(report['markerApprovalWithConfirmationSourceAwarePreflightOk']).lower()}`",
        f"- Marker wrong-baseline packet blocked: `{str(report['markerWrongBaselinePacketBlocked']).lower()}`",
        "",
        "## Packets",
        "",
        f"- Needs-proof packet: `{report['needsProofPacket']}`",
        f"- Pass packet: `{report['passPacket']}`",
        f"- Wrong-baseline packet: `{report['wrongBaselinePacket']}`",
        f"- Marker needs-repair packet: `{report['markerNeedsRepairPacket']}`",
        f"- Marker pass packet: `{report['markerPassPacket']}`",
        f"- Marker wrong-baseline packet: `{report['markerWrongBaselinePacket']}`",
        "",
        "## Steps",
        "",
        "| Step | Expected | OK | Return code |",
        "|---|---|---:|---:|",
    ]
    for step in report["steps"]:
        lines.append(
            f"| {step['name']} | {step['expected']} | `{str(step['okMatchesExpectation']).lower()}` | `{step['returncode']}` |"
        )
    if report["errors"]:
        lines.extend(["", "## Errors", ""])
        lines.extend(f"- {error}" for error in report["errors"])
    lines.extend(
        [
            "",
            "## Why this matters",
            "",
            "The browser reviewer console can export notes. Those notes can become a manifest-backed packet. This smoke proves that packet can reach the guarded listen-decision recorder while still requiring explicit human-listen confirmation for approval.",
            "",
        ]
    )
    return "\n".join(lines)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--baseline-dir", required=True, type=Path)
    args = parser.parse_args()

    baseline_dir = resolve_baseline_dir(args.baseline_dir.expanduser()).resolve()
    manifest_path = baseline_dir / "manifest.json"
    manifest_before = read_json(manifest_path)
    outputs = manifest_before.get("outputs") or {}
    matrix_path = path_from_output(outputs, "latestListenDecisionMatrix")
    if not matrix_path or not matrix_path.exists():
        raise SystemExit("Missing latestListenDecisionMatrix. Run audio_workbench_listen_decision_matrix.py first.")
    matrix = read_json(matrix_path)
    marker_packet_path = path_from_output(outputs, "latestEditorMarkerPacket")
    if not marker_packet_path or not marker_packet_path.exists():
        raise SystemExit("Missing latestEditorMarkerPacket. Run audio_workbench_editor_marker_export.py first.")
    marker_packet = read_json(marker_packet_path)

    generated_at = datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S")
    baseline_id = str(manifest_before.get("baselineId") or "audio-baseline")
    slug = safe_slug(baseline_id.replace("episode-4-conformed-production-baseline-", ""))
    smoke_dir = baseline_dir / f"reviewer-notes-decision-bridge-smoke-{slug}-{generated_at}"
    smoke_dir.mkdir(parents=False, exist_ok=False)

    needs_packet_path = smoke_dir / "synthetic-needs-focused-proof-packet.json"
    pass_packet_path = smoke_dir / "synthetic-pass-packet.json"
    wrong_packet_path = smoke_dir / "synthetic-wrong-baseline-packet.json"
    marker_needs_packet_path = smoke_dir / "synthetic-marker-needs-repair-packet.json"
    marker_pass_packet_path = smoke_dir / "synthetic-marker-pass-packet.json"
    marker_wrong_packet_path = smoke_dir / "synthetic-marker-wrong-baseline-packet.json"
    write_json(
        needs_packet_path,
        synthetic_packet(
            baseline_dir=baseline_dir,
            manifest=manifest_before,
            matrix=matrix,
            packet_path=needs_packet_path,
            decision="more-proof",
            suggested_status="needs-focused-proof",
        ),
    )
    write_json(
        pass_packet_path,
        synthetic_packet(
            baseline_dir=baseline_dir,
            manifest=manifest_before,
            matrix=matrix,
            packet_path=pass_packet_path,
            decision="pass",
            suggested_status="human-approved-for-branch-inheritance",
        ),
    )
    wrong_packet = synthetic_packet(
        baseline_dir=baseline_dir,
        manifest=manifest_before,
        matrix=matrix,
        packet_path=wrong_packet_path,
        decision="more-proof",
        suggested_status="needs-focused-proof",
    )
    wrong_packet["baselineId"] = "wrong-baseline-for-safety-smoke"
    write_json(wrong_packet_path, wrong_packet)
    write_json(
        marker_needs_packet_path,
        synthetic_marker_packet(
            manifest=manifest_before,
            marker_packet=marker_packet,
            decision="needs-repair",
            suggested_status="failed-human-listen",
        ),
    )
    write_json(
        marker_pass_packet_path,
        synthetic_marker_packet(
            manifest=manifest_before,
            marker_packet=marker_packet,
            decision="pass",
            suggested_status="pending-human-listen",
        ),
    )
    marker_wrong_packet = synthetic_marker_packet(
        manifest=manifest_before,
        marker_packet=marker_packet,
        decision="needs-repair",
        suggested_status="failed-human-listen",
    )
    marker_wrong_packet["baselineId"] = "wrong-baseline-for-marker-safety-smoke"
    write_json(marker_wrong_packet_path, marker_wrong_packet)

    root = repo_root()
    bridge = root / "apps" / "QuipslyStudio" / "script" / "audio_workbench_record_listen_decision_from_notes.py"
    steps = [
        {
            **run_step(
                "needs-proof dry-run",
                [
                    "python3",
                    str(bridge),
                    "--baseline-dir",
                    str(baseline_dir),
                    "--notes-packet",
                    str(needs_packet_path),
                    "--reviewer",
                    "Reviewer notes bridge smoke",
                    "--dry-run",
                ],
                root,
            ),
            "expected": "success",
        },
        {
            **run_step(
                "pass without confirmation is blocked",
                [
                    "python3",
                    str(bridge),
                    "--baseline-dir",
                    str(baseline_dir),
                    "--notes-packet",
                    str(pass_packet_path),
                    "--reviewer",
                    "Reviewer notes bridge smoke",
                    "--dry-run",
                ],
                root,
            ),
            "expected": "failure",
        },
        {
            **run_step(
                "pass with confirmation dry-run",
                [
                    "python3",
                    str(bridge),
                    "--baseline-dir",
                    str(baseline_dir),
                    "--notes-packet",
                    str(pass_packet_path),
                    "--reviewer",
                    "Reviewer notes bridge smoke",
                    "--confirm-human-listened",
                    "--dry-run",
                ],
                root,
            ),
            "expected": "success",
        },
        {
            **run_step(
                "wrong-baseline packet is blocked",
                [
                    "python3",
                    str(bridge),
                    "--baseline-dir",
                    str(baseline_dir),
                    "--notes-packet",
                    str(wrong_packet_path),
                    "--reviewer",
                    "Reviewer notes bridge smoke",
                    "--dry-run",
                ],
                root,
            ),
            "expected": "failure",
        },
        {
            **run_step(
                "marker needs-repair dry-run",
                [
                    "python3",
                    str(bridge),
                    "--baseline-dir",
                    str(baseline_dir),
                    "--notes-packet",
                    str(marker_needs_packet_path),
                    "--reviewer",
                    "Reviewer notes bridge smoke",
                    "--dry-run",
                ],
                root,
            ),
            "expected": "success",
        },
        {
            **run_step(
                "marker approval without confirmation is blocked",
                [
                    "python3",
                    str(bridge),
                    "--baseline-dir",
                    str(baseline_dir),
                    "--notes-packet",
                    str(marker_pass_packet_path),
                    "--reviewer",
                    "Reviewer notes bridge smoke",
                    "--status",
                    "human-approved-for-branch-inheritance",
                    "--dry-run",
                ],
                root,
            ),
            "expected": "failure",
        },
        {
            **run_step(
                "marker approval with confirmation dry-run",
                [
                    "python3",
                    str(bridge),
                    "--baseline-dir",
                    str(baseline_dir),
                    "--notes-packet",
                    str(marker_pass_packet_path),
                    "--reviewer",
                    "Reviewer notes bridge smoke",
                    "--status",
                    "human-approved-for-branch-inheritance",
                    "--confirm-human-listened",
                    "--dry-run",
                ],
                root,
            ),
            "expected": "success",
        },
        {
            **run_step(
                "marker wrong-baseline packet is blocked",
                [
                    "python3",
                    str(bridge),
                    "--baseline-dir",
                    str(baseline_dir),
                    "--notes-packet",
                    str(marker_wrong_packet_path),
                    "--reviewer",
                    "Reviewer notes bridge smoke",
                    "--dry-run",
                ],
                root,
            ),
            "expected": "failure",
        },
    ]
    for step in steps:
        step["okMatchesExpectation"] = (step["ok"] and step["expected"] == "success") or (
            not step["ok"] and step["expected"] == "failure"
        )

    manifest_after_steps = read_json(manifest_path)
    real_state_preserved = (
        manifest_after_steps.get("approvalStatus") == manifest_before.get("approvalStatus")
        and manifest_after_steps.get("branchInheritanceReady") == manifest_before.get("branchInheritanceReady")
        and manifest_after_steps.get("branchRenderReady") == manifest_before.get("branchRenderReady")
    )
    needs_ok = bool(steps[0]["okMatchesExpectation"])
    no_confirm_blocked = bool(steps[1]["okMatchesExpectation"]) and "Approval requires --confirm-human-listened" in (
        steps[1].get("stderr") or ""
    )
    confirm_ok = bool(steps[2]["okMatchesExpectation"])
    wrong_blocked = bool(steps[3]["okMatchesExpectation"]) and "baselineId does not match" in (steps[3].get("stderr") or "")
    marker_needs_ok = bool(steps[4]["okMatchesExpectation"])
    marker_no_confirm_blocked = bool(steps[5]["okMatchesExpectation"]) and "Approval requires --confirm-human-listened" in (
        steps[5].get("stderr") or ""
    )
    marker_confirm_ok = bool(steps[6]["okMatchesExpectation"])
    marker_wrong_blocked = bool(steps[7]["okMatchesExpectation"]) and "baselineId does not match" in (
        steps[7].get("stderr") or ""
    )
    pass_preflight = steps[2].get("parsedStdout") if isinstance(steps[2].get("parsedStdout"), dict) else {}
    marker_pass_preflight = steps[6].get("parsedStdout") if isinstance(steps[6].get("parsedStdout"), dict) else {}
    pass_source_aware_preflight_ok = bool(
        pass_preflight.get("sourceAwareApprovalPreflightStatus") == "source-aware-approval-preflight-passed"
        and pass_preflight.get("sourceAwareApprovalPreflightPassed") is True
    )
    marker_source_aware_preflight_ok = bool(
        marker_pass_preflight.get("sourceAwareApprovalPreflightStatus") == "source-aware-approval-preflight-passed"
        and marker_pass_preflight.get("sourceAwareApprovalPreflightPassed") is True
    )

    errors: list[str] = []
    if not real_state_preserved:
        errors.append("Real manifest approval/branch state changed during dry-run smoke")
    if not needs_ok:
        errors.append("Needs-focused-proof dry-run did not succeed")
    if not no_confirm_blocked:
        errors.append("All-pass packet was not blocked without --confirm-human-listened")
    if not confirm_ok:
        errors.append("All-pass packet with --confirm-human-listened did not dry-run successfully")
    if confirm_ok and not pass_source_aware_preflight_ok:
        errors.append("All-pass packet approval dry-run did not prove source-aware approval preflight")
    if not wrong_blocked:
        errors.append("Wrong-baseline packet was not blocked")
    if not marker_needs_ok:
        errors.append("Marker needs-repair dry-run did not succeed")
    if not marker_no_confirm_blocked:
        errors.append("Marker all-pass packet was not blocked without --confirm-human-listened")
    if not marker_confirm_ok:
        errors.append("Marker all-pass packet with --confirm-human-listened did not dry-run successfully")
    if marker_confirm_ok and not marker_source_aware_preflight_ok:
        errors.append("Marker all-pass packet approval dry-run did not prove source-aware approval preflight")
    if not marker_wrong_blocked:
        errors.append("Marker wrong-baseline packet was not blocked")

    report = {
        "schema": "quipsly.audio-workbench.reviewer-notes-decision-bridge-smoke.v1",
        "generatedAt": generated_at,
        "baselineDir": str(baseline_dir),
        "baselineId": baseline_id,
        "needsProofPacket": str(needs_packet_path),
        "passPacket": str(pass_packet_path),
        "wrongBaselinePacket": str(wrong_packet_path),
        "markerNeedsRepairPacket": str(marker_needs_packet_path),
        "markerPassPacket": str(marker_pass_packet_path),
        "markerWrongBaselinePacket": str(marker_wrong_packet_path),
        "realApprovalStatePreserved": real_state_preserved,
        "realApprovalStatusBefore": manifest_before.get("approvalStatus"),
        "realApprovalStatusAfterSmoke": manifest_after_steps.get("approvalStatus"),
        "needsProofDryRunOk": needs_ok,
        "passWithoutConfirmationBlocked": no_confirm_blocked,
        "passWithConfirmationDryRunOk": confirm_ok,
        "passWithConfirmationSourceAwarePreflightOk": pass_source_aware_preflight_ok,
        "wrongBaselinePacketBlocked": wrong_blocked,
        "markerNeedsRepairDryRunOk": marker_needs_ok,
        "markerApprovalWithoutConfirmationBlocked": marker_no_confirm_blocked,
        "markerApprovalWithConfirmationDryRunOk": marker_confirm_ok,
        "markerApprovalWithConfirmationSourceAwarePreflightOk": marker_source_aware_preflight_ok,
        "markerWrongBaselinePacketBlocked": marker_wrong_blocked,
        "smokePassed": not errors,
        "steps": steps,
        "errors": errors,
    }
    output_json = baseline_dir / f"audio-reviewer-notes-decision-bridge-smoke-{slug}-{generated_at}.json"
    output_md = baseline_dir / f"audio-reviewer-notes-decision-bridge-smoke-{slug}-{generated_at}.md"
    write_json(output_json, report)
    output_md.write_text(markdown(report) + "\n", encoding="utf-8")

    manifest = read_json(manifest_path)
    outputs = manifest.setdefault("outputs", {})
    outputs["latestReviewerNotesDecisionBridgeSmoke"] = str(output_json)
    outputs["latestReviewerNotesDecisionBridgeSmokeMarkdown"] = str(output_md)
    history = outputs.setdefault("reviewerNotesDecisionBridgeSmokes", [])
    if str(output_json) not in history:
        history.append(str(output_json))
    manifest["latestReviewerNotesDecisionBridgeSmokeGeneratedAt"] = generated_at
    manifest["reviewerNotesDecisionBridgeSmokeCount"] = len(history)
    manifest["reviewerNotesDecisionBridgeSmokePassed"] = not errors
    manifest["reviewerNotesDecisionBridgeSmokeRealApprovalStatePreserved"] = real_state_preserved
    write_json(manifest_path, manifest)

    print(f"Wrote {output_md}")
    print(f"Wrote {output_json}")
    print(f"Smoke passed: {not errors}")
    print(f"Real approval state preserved: {real_state_preserved}")


if __name__ == "__main__":
    main()
