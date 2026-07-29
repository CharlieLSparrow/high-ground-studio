#!/usr/bin/env python3
"""Smoke-test the audio repair/tuning console without changing approval truth."""

from __future__ import annotations

import argparse
import json
import os
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
    raise FileNotFoundError(f"Could not find baseline manifest under {input_path}")


def output_path(value: Any) -> str | None:
    if isinstance(value, str) and value:
        return value
    if isinstance(value, dict):
        path = value.get("path")
        if isinstance(path, str) and path:
            return path
    return None


def safe_slug(value: str) -> str:
    out = "".join(ch.lower() if ch.isalnum() else "-" for ch in str(value))
    while "--" in out:
        out = out.replace("--", "-")
    return out.strip("-") or "audio-baseline"


def make_artifact(path: Path, content: str = "smoke evidence\n") -> str:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(content, encoding="utf-8")
    return str(path)


def build_fixture(root: Path) -> Path:
    baseline = root / "baseline"
    baseline.mkdir(parents=True)
    evidence = root / "evidence"
    outputs = {
        "latestAudioMasterSourceBalanceAuditMarkdown": make_artifact(evidence / "source-balance.md"),
        "latestAudioSourceBalanceListenCompanionMarkdown": make_artifact(evidence / "source-companion.md"),
        "latestAudioSourceBalanceRepairWorkorderMarkdown": make_artifact(evidence / "source-repair.md"),
        "latestSpeakerCleanupProofPackHtml": make_artifact(evidence / "cleanup.html", "<html>cleanup</html>"),
        "latestSpeakerBleedGapProofAuditMarkdown": make_artifact(evidence / "bleed-gap.md"),
        "latestSpeakerCleanupListenMapMarkdown": make_artifact(evidence / "listen-map.md"),
        "latestBleedRepairWorkorderMarkdown": make_artifact(evidence / "bleed-repair.md"),
        "latestDxReviveManualBouncePacketMarkdown": make_artifact(evidence / "dx-packet.md"),
        "latestDxReviveProofCandidatePlannerMarkdown": make_artifact(evidence / "dx-planner.md"),
        "latestAudioSpeakerActivityReviewBoardHtml": make_artifact(evidence / "speaker-board.html", "<html>speaker</html>"),
        "latestAudioMasterSmoothnessAuditMarkdown": make_artifact(evidence / "smoothness.md"),
        "latestAudioListenPriorityReviewReelMarkdown": make_artifact(evidence / "reel.md"),
        "latestDxReviveBounceValidationMarkdown": make_artifact(evidence / "dx-validation.md"),
        "latestDxReviveProofCandidatePlannerSmokeMarkdown": make_artifact(evidence / "dx-smoke.md"),
        "latestAudioMasterVisualOverviewMarkdown": make_artifact(evidence / "overview.md"),
        "latestEditorMarkerPacketMarkdown": make_artifact(evidence / "markers.md"),
        "branchRenderPreflightMarkdown": make_artifact(evidence / "branch-preflight.md"),
        "qualityReportMarkdown": make_artifact(evidence / "qc.md"),
        "latestAudioListenPrioritySnippetPackAuditMarkdown": make_artifact(evidence / "snippet-audit.md"),
        "sourceActivityMarkdown": make_artifact(evidence / "source-activity.md"),
        "latestEditorHandoffPacketMarkdown": make_artifact(evidence / "handoff.md"),
        "latestAudioSpineListenSanityCheckMarkdown": make_artifact(evidence / "sanity.md"),
        "latestBranchInheritanceGateMarkdown": make_artifact(evidence / "branch-gate.md"),
        "latestApprovedBranchRenderExecutorMarkdown": make_artifact(evidence / "branch-executor.md"),
        "latestAudioReviewGateAuditMarkdown": make_artifact(evidence / "gate-audit.md"),
    }
    manifest = {
        "baselineId": "episode-4-conformed-production-baseline-smoke",
        "approvalStatus": "machine-candidate-needs-human-listen-proof",
        "packageReadyForHumanListen": True,
        "branchInheritanceReady": False,
        "branchRenderReady": False,
        "outputs": outputs,
    }
    write_json(baseline / "manifest.json", manifest)
    return baseline


def run_fixture(script_path: Path) -> dict[str, Any]:
    with tempfile.TemporaryDirectory(prefix="quipsly-repair-console-smoke-") as tmp:
        baseline = build_fixture(Path(tmp))
        before = read_json(baseline / "manifest.json")
        subprocess.run([sys.executable, str(script_path), "--baseline-dir", str(baseline)], check=True)
        after = read_json(baseline / "manifest.json")
        outputs = after.get("outputs") or {}
        console_path = output_path(outputs.get("latestAudioWorkbenchRepairTuningConsole"))
        markdown_path = output_path(outputs.get("latestAudioWorkbenchRepairTuningConsoleMarkdown"))
        html_path = output_path(outputs.get("latestAudioWorkbenchRepairTuningConsoleHtml"))
        console = read_json(Path(console_path)) if console_path else {}
        symptom_ids = {item.get("id") for item in console.get("symptoms", [])}
        required = {
            "homer-low-or-missing",
            "charlie-echo-under-homer",
            "homer-park-noise-under-charlie",
            "robotic-gating-or-clipped-reactions",
            "restoration-fake-or-shiny",
            "long-silence-or-structural-gap",
            "wrong-source-or-bad-sync",
            "branch-render-before-approval",
        }
        checks = {
            "consoleGenerated": bool(console_path) and Path(console_path).exists(),
            "markdownGenerated": bool(markdown_path) and Path(markdown_path).exists(),
            "htmlGenerated": bool(html_path) and Path(html_path).exists(),
            "requiredSymptomsPresent": required.issubset(symptom_ids),
            "approvalPreserved": before.get("approvalStatus") == after.get("approvalStatus"),
            "branchInheritancePreserved": after.get("branchInheritanceReady") is False,
            "branchRenderPreserved": after.get("branchRenderReady") is False,
            "renderNotAttempted": after.get("audioWorkbenchRepairTuningConsoleRenderAttempted") is False,
            "originalMediaNotMutated": after.get("audioWorkbenchRepairTuningConsoleOriginalMediaMutated") is False,
        }
        return {
            "checks": checks,
            "passed": all(checks.values()),
            "symptomCount": console.get("symptomCount"),
            "missingRequiredSymptoms": sorted(required - symptom_ids),
        }


def render_markdown(report: dict[str, Any]) -> str:
    lines = [
        f"# Audio Workbench Repair/Tuning Console Smoke: {report['baselineId']}",
        "",
        f"Generated: `{report['generatedAt']}`",
        "",
        f"- Passed: `{str(report['passed']).lower()}`",
        f"- Fixture symptom count: `{report['fixtureResult'].get('symptomCount')}`",
        f"- Approval state changed: `{str(report['approvalStateChanged']).lower()}`",
        f"- Branch state changed: `{str(report['branchStateChanged']).lower()}`",
        f"- Render attempted: `{str(report['renderAttempted']).lower()}`",
        f"- Original media mutated: `{str(report['originalMediaMutated']).lower()}`",
        "",
        "## Checks",
        "",
        "| Check | Passed |",
        "|---|---:|",
    ]
    for key, value in report["fixtureResult"].get("checks", {}).items():
        lines.append(f"| `{key}` | `{str(value).lower()}` |")
    if report["fixtureResult"].get("missingRequiredSymptoms"):
        lines.extend(["", "## Missing required symptoms", ""])
        lines.extend(f"- `{item}`" for item in report["fixtureResult"]["missingRequiredSymptoms"])
    lines.append("")
    return "\n".join(lines)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--baseline-dir", required=True, type=Path)
    args = parser.parse_args()

    baseline_dir = resolve_baseline_dir(args.baseline_dir)
    manifest_path = baseline_dir / "manifest.json"
    manifest = read_json(manifest_path)
    before = {
        "approvalStatus": manifest.get("approvalStatus"),
        "branchInheritanceReady": manifest.get("branchInheritanceReady"),
        "branchRenderReady": manifest.get("branchRenderReady"),
    }
    baseline_id = str(manifest.get("baselineId") or "audio-baseline")
    slug = safe_slug(baseline_id.replace("episode-4-conformed-production-baseline-", ""))
    generated_at = datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S")
    script_path = Path(__file__).with_name("audio_workbench_repair_tuning_console.py")
    fixture_result = run_fixture(script_path)

    out_dir = baseline_dir / f"audio-workbench-repair-tuning-console-smoke-{slug}-{generated_at}"
    out_dir.mkdir(parents=True, exist_ok=True)
    report = {
        "schema": "quipsly.audio-workbench.repair-tuning-console-smoke.v1",
        "generatedAt": generated_at,
        "baselineDir": str(baseline_dir),
        "baselineId": baseline_id,
        "passed": bool(fixture_result.get("passed")),
        "fixtureResult": fixture_result,
        "approvalStateChanged": False,
        "branchStateChanged": False,
        "renderAttempted": False,
        "originalMediaMutated": False,
    }
    json_path = out_dir / "repair-tuning-console-smoke.json"
    md_path = out_dir / f"audio-workbench-repair-tuning-console-smoke-{slug}-{generated_at}.md"
    write_json(json_path, report)
    md_path.write_text(render_markdown(report), encoding="utf-8")

    manifest = read_json(manifest_path)
    outputs = manifest.setdefault("outputs", {})
    outputs["latestAudioWorkbenchRepairTuningConsoleSmoke"] = str(json_path)
    outputs["latestAudioWorkbenchRepairTuningConsoleSmokeMarkdown"] = str(md_path)
    history = outputs.setdefault("audioWorkbenchRepairTuningConsoleSmokeHistory", [])
    if isinstance(history, list):
        history.append(str(json_path))
    manifest["audioWorkbenchRepairTuningConsoleSmokeCount"] = int(manifest.get("audioWorkbenchRepairTuningConsoleSmokeCount") or 0) + 1
    manifest["audioWorkbenchRepairTuningConsoleSmokePassed"] = report["passed"]
    manifest["audioWorkbenchRepairTuningConsoleSmokeApprovalStateChanged"] = False
    manifest["audioWorkbenchRepairTuningConsoleSmokeBranchStateChanged"] = False
    manifest["audioWorkbenchRepairTuningConsoleSmokeRenderAttempted"] = False
    manifest["audioWorkbenchRepairTuningConsoleSmokeOriginalMediaMutated"] = False
    if before["approvalStatus"] != manifest.get("approvalStatus"):
        raise SystemExit("Smoke would change approval status; refusing to write manifest.")
    if before["branchInheritanceReady"] != manifest.get("branchInheritanceReady"):
        raise SystemExit("Smoke would change branch inheritance status; refusing to write manifest.")
    if before["branchRenderReady"] != manifest.get("branchRenderReady"):
        raise SystemExit("Smoke would change branch render status; refusing to write manifest.")
    write_json(manifest_path, manifest)

    print(f"Repair/tuning console smoke: {md_path}")
    print(f"Passed: {str(report['passed']).lower()}")
    print("Approval state changed: false")
    print("Branch state changed: false")
    print("Render attempted: false")
    print("Original media mutated: false")
    if not report["passed"]:
        raise SystemExit(1)


if __name__ == "__main__":
    main()
