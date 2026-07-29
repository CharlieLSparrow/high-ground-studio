#!/usr/bin/env python3
"""Smoke-test the audio parameter sweep proof-plan generator."""

from __future__ import annotations

import argparse
import json
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


def make_artifact(path: Path, content: str = "evidence\n") -> str:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(content, encoding="utf-8")
    return str(path)


def build_fixture(root: Path) -> Path:
    baseline = root / "baseline"
    evidence = root / "evidence"
    baseline.mkdir(parents=True)
    parameter_ids = [
        "charlie-under-homer-duck-depth-db",
        "homer-under-charlie-duck-depth-db",
        "homer-primary-gain-db",
        "charlie-primary-gain-db",
        "speaker-activity-threshold-dbfs",
        "cleanup-crossfade-ms",
        "dxrevive-restoration-strength",
        "bus-compression-ratio",
        "limiter-ceiling-dbfs",
        "structural-gap-edit-policy",
    ]
    symptom_ids = [
        "homer-low-or-missing",
        "charlie-echo-under-homer",
        "homer-park-noise-under-charlie",
        "robotic-gating-or-clipped-reactions",
        "restoration-fake-or-shiny",
        "long-silence-or-structural-gap",
        "master-harsh-compressed-or-unbalanced",
    ]
    ledger_path = baseline / "fixture-parameter-ledger.json"
    repair_console_path = baseline / "fixture-repair-console.json"
    write_json(ledger_path, {"parameters": [{"id": item} for item in parameter_ids]})
    write_json(repair_console_path, {"symptoms": [{"id": item} for item in symptom_ids]})
    outputs = {
        "latestAudioWorkbenchParameterControlLedger": str(ledger_path),
        "latestAudioWorkbenchRepairTuningConsole": str(repair_console_path),
        "latestSpeakerCleanupProofPackHtml": make_artifact(evidence / "cleanup.html", "<html>cleanup</html>"),
        "latestSpeakerBleedGapProofAuditMarkdown": make_artifact(evidence / "bleed.md"),
        "latestSpeakerCleanupListenMapMarkdown": make_artifact(evidence / "listen-map.md"),
        "latestDxReviveProofCandidatePlannerMarkdown": make_artifact(evidence / "dx-plan.md"),
        "latestAudioMasterSourceBalanceAuditMarkdown": make_artifact(evidence / "source-balance.md"),
        "latestAudioSourceBalanceListenCompanionMarkdown": make_artifact(evidence / "source-companion.md"),
        "qualityReportMarkdown": make_artifact(evidence / "qc.md"),
        "latestAudioSpeakerActivityReviewBoardHtml": make_artifact(evidence / "activity.html", "<html>activity</html>"),
        "latestAudioMasterSmoothnessAuditMarkdown": make_artifact(evidence / "smoothness.md"),
        "latestAudioListenPriorityReviewReelMarkdown": make_artifact(evidence / "reel.md"),
        "latestDxReviveManualBouncePacketMarkdown": make_artifact(evidence / "dx-packet.md"),
        "latestDxReviveBounceValidationMarkdown": make_artifact(evidence / "dx-validation.md"),
        "latestAudioMasterVisualOverviewMarkdown": make_artifact(evidence / "overview.md"),
        "latestEditorMarkerPacketMarkdown": make_artifact(evidence / "markers.md"),
        "branchRenderPreflightMarkdown": make_artifact(evidence / "branch-preflight.md"),
    }
    write_json(baseline / "manifest.json", {
        "baselineId": "episode-4-conformed-production-baseline-sweep-smoke",
        "approvalStatus": "machine-candidate-needs-human-listen-proof",
        "packageReadyForHumanListen": True,
        "branchInheritanceReady": False,
        "branchRenderReady": False,
        "outputs": outputs,
    })
    return baseline


def run_fixture(script_path: Path) -> dict[str, Any]:
    with tempfile.TemporaryDirectory(prefix="quipsly-parameter-sweep-smoke-") as tmp:
        baseline = build_fixture(Path(tmp))
        before = read_json(baseline / "manifest.json")
        subprocess.run([sys.executable, str(script_path), "--baseline-dir", str(baseline)], check=True)
        after = read_json(baseline / "manifest.json")
        outputs = after.get("outputs") or {}
        plan_path = output_path(outputs.get("latestAudioWorkbenchParameterSweepProofPlan"))
        md_path = output_path(outputs.get("latestAudioWorkbenchParameterSweepProofPlanMarkdown"))
        html_path = output_path(outputs.get("latestAudioWorkbenchParameterSweepProofPlanHtml"))
        report = read_json(Path(plan_path)) if plan_path else {}
        plan_ids = {item.get("id") for item in report.get("plans", [])}
        required = {
            "charlie-echo-under-homer-sweep",
            "homer-park-noise-under-charlie-sweep",
            "homer-presence-balance-sweep",
            "natural-gating-sweep",
            "dxrevive-stem-restoration-sweep",
            "structural-gap-branch-policy-plan",
        }
        checks = {
            "planGenerated": bool(plan_path) and Path(plan_path).exists(),
            "markdownGenerated": bool(md_path) and Path(md_path).exists(),
            "htmlGenerated": bool(html_path) and Path(html_path).exists(),
            "requiredPlansPresent": required.issubset(plan_ids),
            "planCountSix": report.get("planCount") == 6,
            "variantCountEighteen": report.get("variantCount") == 18,
            "noMissingParameters": report.get("missingParameterIds") == [],
            "noMissingSymptoms": report.get("missingSymptomIds") == [],
            "approvalPreserved": before.get("approvalStatus") == after.get("approvalStatus"),
            "branchInheritancePreserved": after.get("branchInheritanceReady") is False,
            "branchRenderPreserved": after.get("branchRenderReady") is False,
            "renderNotAttempted": after.get("audioWorkbenchParameterSweepProofPlanRenderAttempted") is False,
            "originalMediaNotMutated": after.get("audioWorkbenchParameterSweepProofPlanOriginalMediaMutated") is False,
        }
        return {"passed": all(checks.values()), "checks": checks, "planCount": report.get("planCount"), "variantCount": report.get("variantCount"), "missingRequiredPlans": sorted(required - plan_ids)}


def render_markdown(report: dict[str, Any]) -> str:
    lines = [
        f"# Audio Workbench Parameter Sweep Proof Plan Smoke: {report['baselineId']}",
        "",
        f"Generated: `{report['generatedAt']}`",
        "",
        f"- Passed: `{str(report['passed']).lower()}`",
        f"- Fixture plan count: `{report['fixtureResult'].get('planCount')}`",
        f"- Fixture variant count: `{report['fixtureResult'].get('variantCount')}`",
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
    if report["fixtureResult"].get("missingRequiredPlans"):
        lines.append("")
        lines.append("Missing plans: " + ", ".join(report["fixtureResult"]["missingRequiredPlans"]))
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
    script_path = Path(__file__).with_name("audio_workbench_parameter_sweep_proof_plan.py")
    fixture_result = run_fixture(script_path)
    out_dir = baseline_dir / f"audio-workbench-parameter-sweep-proof-plan-smoke-{slug}-{generated_at}"
    out_dir.mkdir(parents=True, exist_ok=True)
    report = {
        "schema": "quipsly.audio-workbench.parameter-sweep-proof-plan-smoke.v1",
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
    json_path = out_dir / "parameter-sweep-proof-plan-smoke.json"
    md_path = out_dir / f"audio-workbench-parameter-sweep-proof-plan-smoke-{slug}-{generated_at}.md"
    write_json(json_path, report)
    md_path.write_text(render_markdown(report), encoding="utf-8")
    manifest = read_json(manifest_path)
    outputs = manifest.setdefault("outputs", {})
    outputs["latestAudioWorkbenchParameterSweepProofPlanSmoke"] = str(json_path)
    outputs["latestAudioWorkbenchParameterSweepProofPlanSmokeMarkdown"] = str(md_path)
    history = outputs.setdefault("audioWorkbenchParameterSweepProofPlanSmokeHistory", [])
    if isinstance(history, list):
        history.append(str(json_path))
    manifest["audioWorkbenchParameterSweepProofPlanSmokeCount"] = int(manifest.get("audioWorkbenchParameterSweepProofPlanSmokeCount") or 0) + 1
    manifest["audioWorkbenchParameterSweepProofPlanSmokePassed"] = report["passed"]
    manifest["audioWorkbenchParameterSweepProofPlanSmokeApprovalStateChanged"] = False
    manifest["audioWorkbenchParameterSweepProofPlanSmokeBranchStateChanged"] = False
    manifest["audioWorkbenchParameterSweepProofPlanSmokeRenderAttempted"] = False
    manifest["audioWorkbenchParameterSweepProofPlanSmokeOriginalMediaMutated"] = False
    if before["approvalStatus"] != manifest.get("approvalStatus"):
        raise SystemExit("Smoke would change approval status; refusing to write manifest.")
    if before["branchInheritanceReady"] != manifest.get("branchInheritanceReady"):
        raise SystemExit("Smoke would change branch inheritance status; refusing to write manifest.")
    if before["branchRenderReady"] != manifest.get("branchRenderReady"):
        raise SystemExit("Smoke would change branch render status; refusing to write manifest.")
    write_json(manifest_path, manifest)
    print(f"Parameter sweep proof-plan smoke: {md_path}")
    print(f"Passed: {str(report['passed']).lower()}")
    print("Approval state changed: false")
    print("Branch state changed: false")
    print("Render attempted: false")
    print("Original media mutated: false")
    if not report["passed"]:
        raise SystemExit(1)


if __name__ == "__main__":
    main()
