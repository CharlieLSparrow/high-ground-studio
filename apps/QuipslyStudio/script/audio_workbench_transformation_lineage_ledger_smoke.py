#!/usr/bin/env python3
"""Smoke-test the audio transformation lineage ledger.

This is a safety harness for the provenance map that tells us what changed the
sound, which artifacts prove it, and which stage owns the next repair. It uses
synthetic baselines for behavior checks and only registers a smoke report on the
real baseline. It must not approve audio, unlock branch inheritance, render
branches, upload, publish, or mutate original media.
"""

from __future__ import annotations

import argparse
import json
import os
import shutil
import subprocess
import sys
import tempfile
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


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


def safe_slug(value: str) -> str:
    out = "".join(ch.lower() if ch.isalnum() else "-" for ch in str(value))
    while "--" in out:
        out = out.replace("--", "-")
    return out.strip("-") or "audio-baseline"


def shell_quote(value: str) -> str:
    return "'" + value.replace("'", "'\\''") + "'"


def output_path(value: Any) -> str | None:
    if isinstance(value, str) and value:
        return value
    if isinstance(value, dict):
        for key in ("path", "jsonPath", "markdownPath", "htmlPath", "openCommand", "wavPath", "m4aPath", "playlistPath"):
            subvalue = value.get(key)
            if isinstance(subvalue, str) and subvalue:
                return subvalue
    return None


def run_lineage(repo_root: Path, baseline_dir: Path) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        [
            sys.executable,
            "apps/QuipslyStudio/script/audio_workbench_transformation_lineage_ledger.py",
            "--baseline-dir",
            str(baseline_dir),
        ],
        cwd=repo_root,
        text=True,
        capture_output=True,
        check=False,
    )


def touch_artifact(path: Path, *, body: str = "synthetic smoke artifact\n") -> str:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(body, encoding="utf-8")
    return str(path)


def write_audio_placeholder(path: Path) -> str:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(b"RIFFsynthetic-audio-smoke")
    return str(path)


def write_report(path: Path, payload: dict[str, Any]) -> str:
    write_json(path, payload)
    return str(path)


def synthetic_outputs(base: Path, *, complete: bool) -> dict[str, Any]:
    artifacts = base / "artifacts"
    outputs: dict[str, Any] = {
        "sourceActivityMarkdown": touch_artifact(artifacts / "source-activity.md"),
        "latestAudioProductionDoctrineHtml": touch_artifact(artifacts / "audio-production-doctrine.html"),
        "latestEditorHandoffPacketMarkdown": touch_artifact(artifacts / "editor-handoff.md"),
        "latestEditorMarkerPacketMarkdown": touch_artifact(artifacts / "editor-markers.md"),
        "latestAudioSpeakerActivityReviewBoardHtml": touch_artifact(artifacts / "speaker-activity-board.html"),
        "latestSpeakerBleedGapProofAuditMarkdown": touch_artifact(artifacts / "speaker-bleed-gap-proof.md"),
        "latestAudioSpeakerContributionLedgerHtml": touch_artifact(artifacts / "speaker-contribution-ledger.html"),
        "latestSpeakerCleanupProofPackHtml": touch_artifact(artifacts / "speaker-cleanup-proof-pack.html"),
        "latestSpeakerCleanupProofPackAuditMarkdown": touch_artifact(artifacts / "speaker-cleanup-proof-pack-audit.md"),
        "latestSpeakerCleanupDecisionMatrixHtml": touch_artifact(artifacts / "speaker-cleanup-decision-matrix.html"),
        "latestSpeakerCleanupDecisionMatrix": write_report(
            artifacts / "speaker-cleanup-decision-matrix.json",
            {"decisionStatus": "ready-for-human-listen", "windowCount": 15, "proofSnippetCount": 90, "missingSnippetCount": 0},
        ),
        "latestDxReviveManualBouncePacketMarkdown": touch_artifact(artifacts / "dxrevive-bounce-packet.md"),
        "latestDxReviveReturnWorkbenchHtml": touch_artifact(artifacts / "dxrevive-return-workbench.html"),
        "latestDxReviveReturnWorkbench": write_report(
            artifacts / "dxrevive-return-workbench.json",
            {"status": "waiting-for-bounces", "expectedCount": 3, "validatedCount": 0, "missingCount": 3},
        ),
        "latestDxReviveBounceValidationMarkdown": touch_artifact(artifacts / "dxrevive-bounce-validation.md"),
        "latestDxReviveProofCandidatePlannerMarkdown": touch_artifact(artifacts / "dxrevive-proof-candidate-planner.md"),
        "masterWav": write_audio_placeholder(artifacts / "master.wav"),
        "masterM4a": write_audio_placeholder(artifacts / "master.m4a"),
        "qualityReportMarkdown": touch_artifact(artifacts / "quality-report.md"),
        "latestAudioPlatformLoudnessAuditHtml": touch_artifact(artifacts / "platform-loudness.html"),
        "latestAudioPlatformLoudnessAudit": write_report(
            artifacts / "platform-loudness.json",
            {"summary": {"podcastProfilesMachineReady": True, "hardGateAttentionCount": 0, "advisoryAttentionCount": 2}},
        ),
        "latestAudioBroadcastPolishScorecardHtml": touch_artifact(artifacts / "broadcast-polish.html"),
        "latestAudioProducerCommandCenterHtml": touch_artifact(artifacts / "producer-command-center.html"),
        "latestAudioFinalListenFastPassHtml": touch_artifact(artifacts / "final-listen-fast-pass.html"),
        "latestAudioPostReviewActionQueueMarkdown": touch_artifact(artifacts / "post-review-action-queue.md"),
        "latestAudioUnresolvedRequirementReviewHtml": touch_artifact(artifacts / "unresolved-requirement-review.html"),
        "latestBranchInheritanceGateMarkdown": touch_artifact(artifacts / "branch-inheritance-gate.md"),
        "latestApprovedBranchRenderExecutorMarkdown": touch_artifact(artifacts / "approved-branch-render-executor.md"),
        "latestBranchRenderProofMarkdown": touch_artifact(artifacts / "branch-render-proof.md"),
        "latestAudioGoalCompletionAudit": write_report(
            artifacts / "goal-audit.json",
            {"statusCounts": {"proved": 11, "partial": 4, "locked": 2, "missing": 0}},
        ),
        "latestAudioProducerGradeAudit": write_report(
            artifacts / "producer-grade-audit.json",
            {"overallScore": 82, "score": 82},
        ),
    }
    if not complete:
        missing_path = Path(outputs["latestSpeakerCleanupProofPackHtml"])
        missing_path.unlink(missing_ok=True)
    return outputs


def create_synthetic_baseline(parent: Path, *, complete: bool) -> Path:
    baseline_dir = parent / ("complete" if complete else "missing-evidence")
    baseline_dir.mkdir(parents=True, exist_ok=True)
    manifest = {
        "baselineId": f"synthetic-lineage-{'complete' if complete else 'missing'}",
        "approvalStatus": "machine-candidate-needs-human-listen-proof",
        "packageReadyForHumanListen": True,
        "branchInheritanceReady": False,
        "branchRenderReady": False,
        "outputs": synthetic_outputs(baseline_dir, complete=complete),
    }
    write_json(baseline_dir / "manifest.json", manifest)
    return baseline_dir


def scenario_complete(repo_root: Path, temp_root: Path) -> dict[str, Any]:
    baseline_dir = create_synthetic_baseline(temp_root, complete=True)
    before = read_json(baseline_dir / "manifest.json")
    result = run_lineage(repo_root, baseline_dir)
    after = read_json(baseline_dir / "manifest.json")
    ledger = read_json(baseline_dir / "AUDIO_TRANSFORMATION_LINEAGE_LEDGER.json") if (baseline_dir / "AUDIO_TRANSFORMATION_LINEAGE_LEDGER.json").exists() else {}
    checks = {
        "returnCodeZero": result.returncode == 0,
        "schema": ledger.get("schema") == "quipsly.audioTransformationLineageLedger.v1",
        "status": ledger.get("lineageStatus") == "ready-for-review-locked-before-branch-render",
        "stageCount": ledger.get("stageCount") == 8,
        "noMissingEvidence": ledger.get("missingEvidenceCount") == 0,
        "branchLocked": "branch-inheritance" in (ledger.get("lockedStages") or []),
        "expectedPartialStages": {"source-aware-cleanup", "restoration", "review-repair"}.issubset(set(ledger.get("partialOrWaitingStages") or [])),
        "stableMarkdownExists": (baseline_dir / "AUDIO_TRANSFORMATION_LINEAGE_LEDGER.md").exists(),
        "stableHtmlExists": (baseline_dir / "AUDIO_TRANSFORMATION_LINEAGE_LEDGER.html").exists(),
        "stableOpenExecutable": os.access(baseline_dir / "OPEN_AUDIO_TRANSFORMATION_LINEAGE_LEDGER.command", os.X_OK),
        "approvalPreserved": before.get("approvalStatus") == after.get("approvalStatus") == "machine-candidate-needs-human-listen-proof",
        "branchPreserved": before.get("branchInheritanceReady") is False and after.get("branchInheritanceReady") is False and after.get("branchRenderReady") is False,
        "sourceMutationFlagFalse": ledger.get("originalMediaMutated") is False,
        "noRenderUploadPublish": ledger.get("renderAttempted") is False and ledger.get("uploadAttempted") is False and ledger.get("publicationAttempted") is False,
    }
    return {
        "name": "complete synthetic lineage ledger",
        "passed": all(checks.values()),
        "checks": checks,
        "stdout": result.stdout[-2000:],
        "stderr": result.stderr[-2000:],
        "ledgerSummary": {
            "stageCount": ledger.get("stageCount"),
            "missingEvidenceCount": ledger.get("missingEvidenceCount"),
            "lockedStages": ledger.get("lockedStages"),
            "partialOrWaitingStages": ledger.get("partialOrWaitingStages"),
        },
    }


def scenario_missing_evidence(repo_root: Path, temp_root: Path) -> dict[str, Any]:
    baseline_dir = create_synthetic_baseline(temp_root, complete=False)
    before = read_json(baseline_dir / "manifest.json")
    result = run_lineage(repo_root, baseline_dir)
    after = read_json(baseline_dir / "manifest.json")
    ledger = read_json(baseline_dir / "AUDIO_TRANSFORMATION_LINEAGE_LEDGER.json") if (baseline_dir / "AUDIO_TRANSFORMATION_LINEAGE_LEDGER.json").exists() else {}
    checks = {
        "returnCodeZero": result.returncode == 0,
        "detectsMissingEvidence": int(ledger.get("missingEvidenceCount") or 0) > 0,
        "cleanupStageNotFullyProved": any(
            stage.get("id") == "source-aware-cleanup" and int(stage.get("missingEvidenceCount") or 0) > 0
            for stage in ledger.get("stages") or []
        ),
        "approvalPreserved": before.get("approvalStatus") == after.get("approvalStatus") == "machine-candidate-needs-human-listen-proof",
        "branchPreserved": before.get("branchInheritanceReady") is False and after.get("branchInheritanceReady") is False and after.get("branchRenderReady") is False,
        "noRenderUploadPublish": ledger.get("renderAttempted") is False and ledger.get("uploadAttempted") is False and ledger.get("publicationAttempted") is False,
    }
    return {
        "name": "missing evidence remains visible",
        "passed": all(checks.values()),
        "checks": checks,
        "stdout": result.stdout[-2000:],
        "stderr": result.stderr[-2000:],
        "ledgerSummary": {
            "stageCount": ledger.get("stageCount"),
            "missingEvidenceCount": ledger.get("missingEvidenceCount"),
            "lockedStages": ledger.get("lockedStages"),
            "partialOrWaitingStages": ledger.get("partialOrWaitingStages"),
        },
    }


def render_markdown(report: dict[str, Any]) -> str:
    lines = [
        f"# Audio Transformation Lineage Ledger Smoke: {report['baselineId']}",
        "",
        f"Generated: `{report['generatedAt']}`",
        "",
        "This smoke proves the lineage ledger can describe complete evidence and missing evidence without approving audio, unlocking branches, rendering branches, uploading, publishing, or mutating source media.",
        "",
        "## Result",
        "",
        f"- Passed: `{str(report['passed']).lower()}`",
        f"- Scenario count: `{report['scenarioCount']}`",
        f"- Failed scenarios: `{report['failedScenarioCount']}`",
        f"- Real approval preserved: `{str(report['realApprovalPreserved']).lower()}`",
        f"- Real branch state preserved: `{str(report['realBranchStatePreserved']).lower()}`",
        f"- Original media mutated: `{str(report['originalMediaMutated']).lower()}`",
        "",
        "## Scenarios",
        "",
    ]
    for scenario in report["scenarios"]:
        lines.extend(
            [
                f"### {scenario['name']}",
                "",
                f"- Passed: `{str(scenario['passed']).lower()}`",
                f"- Ledger summary: `{scenario.get('ledgerSummary')}`",
                "",
                "| Check | Passed |",
                "|---|---:|",
            ]
        )
        for key, value in scenario["checks"].items():
            lines.append(f"| {key} | `{str(bool(value)).lower()}` |")
        lines.append("")
    return "\n".join(lines) + "\n"


def write_open_command(path: Path, md_path: Path) -> None:
    path.write_text(
        "#!/bin/zsh\nset -euo pipefail\nopen " + shell_quote(str(md_path)) + "\n",
        encoding="utf-8",
    )
    path.chmod(0o755)


def register_outputs(manifest_path: Path, report: dict[str, Any], json_path: Path, md_path: Path, command_path: Path) -> None:
    manifest = read_json(manifest_path)
    outputs = manifest.setdefault("outputs", {})
    outputs["latestAudioTransformationLineageLedgerSmoke"] = str(json_path)
    outputs["latestAudioTransformationLineageLedgerSmokeMarkdown"] = str(md_path)
    outputs["latestAudioTransformationLineageLedgerSmokeOpenCommand"] = str(command_path)
    history = outputs.setdefault("audioTransformationLineageLedgerSmokes", [])
    if str(json_path) not in history:
        history.append(str(json_path))
    manifest["audioTransformationLineageLedgerSmokeCount"] = len(history)
    manifest["audioTransformationLineageLedgerSmokePassed"] = bool(report["passed"])
    manifest["audioTransformationLineageLedgerSmokeScenarioCount"] = int(report["scenarioCount"])
    manifest["audioTransformationLineageLedgerSmokeFailedScenarioCount"] = int(report["failedScenarioCount"])
    manifest["audioTransformationLineageLedgerSmokeOriginalMediaMutated"] = False
    write_json(manifest_path, manifest)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--baseline-dir", type=Path, required=True)
    args = parser.parse_args()

    repo_root = Path.cwd()
    baseline_dir = resolve_baseline_dir(args.baseline_dir)
    manifest_path = baseline_dir / "manifest.json"
    before = read_json(manifest_path)
    before_approval = before.get("approvalStatus")
    before_branch_inheritance = before.get("branchInheritanceReady")
    before_branch_render = before.get("branchRenderReady")
    generated_at = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    timestamp = datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S")
    baseline_id = str(before.get("baselineId") or "audio-baseline")
    slug = safe_slug(baseline_id)

    temp_root = Path(tempfile.mkdtemp(prefix="quipsly-lineage-smoke-"))
    try:
        scenarios = [
            scenario_complete(repo_root, temp_root),
            scenario_missing_evidence(repo_root, temp_root),
        ]
    finally:
        shutil.rmtree(temp_root, ignore_errors=True)

    after = read_json(manifest_path)
    real_approval_preserved = after.get("approvalStatus") == before_approval
    real_branch_state_preserved = (
        after.get("branchInheritanceReady") == before_branch_inheritance
        and after.get("branchRenderReady") == before_branch_render
    )
    failed = [scenario for scenario in scenarios if not scenario["passed"]]
    report = {
        "schema": "quipsly.audioTransformationLineageLedgerSmoke.v1",
        "generatedAt": generated_at,
        "baselineId": baseline_id,
        "baselineDir": str(baseline_dir),
        "passed": not failed and real_approval_preserved and real_branch_state_preserved,
        "scenarioCount": len(scenarios),
        "failedScenarioCount": len(failed),
        "scenarios": scenarios,
        "realApprovalPreserved": real_approval_preserved,
        "realBranchStatePreserved": real_branch_state_preserved,
        "renderAttempted": False,
        "uploadAttempted": False,
        "publicationAttempted": False,
        "originalMediaMutated": False,
    }

    out_dir = baseline_dir / f"audio-transformation-lineage-ledger-smoke-{slug}-{timestamp}"
    out_dir.mkdir(parents=True, exist_ok=True)
    json_path = out_dir / "audio-transformation-lineage-ledger-smoke.json"
    md_path = out_dir / "audio-transformation-lineage-ledger-smoke.md"
    open_path = out_dir / "open-audio-transformation-lineage-ledger-smoke.command"
    stable_json = baseline_dir / "AUDIO_TRANSFORMATION_LINEAGE_LEDGER_SMOKE.json"
    stable_md = baseline_dir / "AUDIO_TRANSFORMATION_LINEAGE_LEDGER_SMOKE.md"
    stable_open = baseline_dir / "OPEN_AUDIO_TRANSFORMATION_LINEAGE_LEDGER_SMOKE.command"
    write_json(json_path, report)
    md_path.write_text(render_markdown(report), encoding="utf-8")
    write_open_command(open_path, md_path)
    write_json(stable_json, report)
    stable_md.write_text(render_markdown(report), encoding="utf-8")
    write_open_command(stable_open, stable_md)
    register_outputs(manifest_path, report, stable_json, stable_md, stable_open)

    print(json.dumps({
        "baselineId": baseline_id,
        "passed": report["passed"],
        "scenarioCount": report["scenarioCount"],
        "failedScenarioCount": report["failedScenarioCount"],
        "realApprovalPreserved": real_approval_preserved,
        "realBranchStatePreserved": real_branch_state_preserved,
        "markdown": str(stable_md),
    }, indent=2, sort_keys=True))
    return 0 if report["passed"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
