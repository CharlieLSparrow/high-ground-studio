#!/usr/bin/env python3
"""Smoke-test the audio parameter control ledger in a temp baseline."""

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


def make_artifact(path: Path, content: str = "evidence\n") -> str:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(content, encoding="utf-8")
    return str(path)


def build_fixture(root: Path) -> Path:
    baseline = root / "baseline"
    baseline.mkdir(parents=True)
    evidence = root / "evidence"
    outputs = {
        "latestSpeakerCleanupProofPackHtml": make_artifact(evidence / "cleanup.html", "<html>cleanup</html>"),
        "latestSpeakerBleedGapProofAuditMarkdown": make_artifact(evidence / "bleed.md"),
        "latestSpeakerCleanupListenMapMarkdown": make_artifact(evidence / "listen-map.md"),
        "latestAudioMasterSourceBalanceAuditMarkdown": make_artifact(evidence / "source-balance.md"),
        "latestAudioSourceBalanceListenCompanionMarkdown": make_artifact(evidence / "source-companion.md"),
        "qualityReportMarkdown": make_artifact(evidence / "qc.md"),
        "latestAudioSpeakerActivityReviewBoardHtml": make_artifact(evidence / "speaker-board.html", "<html>speaker</html>"),
        "latestAudioMasterSmoothnessAuditMarkdown": make_artifact(evidence / "smoothness.md"),
        "latestSpeakerCleanupProofPackAuditMarkdown": make_artifact(evidence / "cleanup-audit.md"),
        "latestDxReviveManualBouncePacketMarkdown": make_artifact(evidence / "dx-packet.md"),
        "latestDxReviveBounceValidationMarkdown": make_artifact(evidence / "dx-validation.md"),
        "latestDxReviveProofCandidatePlannerMarkdown": make_artifact(evidence / "dx-planner.md"),
        "latestAudioListenPrioritySnippetPackAuditMarkdown": make_artifact(evidence / "snippet-audit.md"),
        "latestAudioMasterVisualOverviewMarkdown": make_artifact(evidence / "visual.md"),
        "latestEditorMarkerPacketMarkdown": make_artifact(evidence / "markers.md"),
        "branchRenderPreflightMarkdown": make_artifact(evidence / "branch-preflight.md"),
    }
    write_json(baseline / "manifest.json", {
        "baselineId": "episode-4-conformed-production-baseline-parameter-smoke",
        "approvalStatus": "machine-candidate-needs-human-listen-proof",
        "packageReadyForHumanListen": True,
        "branchInheritanceReady": False,
        "branchRenderReady": False,
        "outputs": outputs,
    })
    return baseline


def run_fixture(script_path: Path) -> dict[str, Any]:
    with tempfile.TemporaryDirectory(prefix="quipsly-parameter-ledger-smoke-") as tmp:
        baseline = build_fixture(Path(tmp))
        before = read_json(baseline / "manifest.json")
        subprocess.run([sys.executable, str(script_path), "--baseline-dir", str(baseline)], check=True)
        after = read_json(baseline / "manifest.json")
        outputs = after.get("outputs") or {}
        ledger_path = output_path(outputs.get("latestAudioWorkbenchParameterControlLedger"))
        md_path = output_path(outputs.get("latestAudioWorkbenchParameterControlLedgerMarkdown"))
        html_path = output_path(outputs.get("latestAudioWorkbenchParameterControlLedgerHtml"))
        ledger = read_json(Path(ledger_path)) if ledger_path else {}
        parameter_ids = {item.get("id") for item in ledger.get("parameters", [])}
        required = {
            "charlie-under-homer-duck-depth-db",
            "homer-under-charlie-duck-depth-db",
            "homer-primary-gain-db",
            "speaker-activity-threshold-dbfs",
            "cleanup-crossfade-ms",
            "dxrevive-restoration-strength",
            "structural-gap-edit-policy",
        }
        checks = {
            "ledgerGenerated": bool(ledger_path) and Path(ledger_path).exists(),
            "markdownGenerated": bool(md_path) and Path(md_path).exists(),
            "htmlGenerated": bool(html_path) and Path(html_path).exists(),
            "requiredParametersPresent": required.issubset(parameter_ids),
            "parameterCountAtLeastTen": int(ledger.get("parameterCount") or 0) >= 10,
            "approvalPreserved": before.get("approvalStatus") == after.get("approvalStatus"),
            "branchInheritancePreserved": after.get("branchInheritanceReady") is False,
            "branchRenderPreserved": after.get("branchRenderReady") is False,
            "renderNotAttempted": after.get("audioWorkbenchParameterControlLedgerRenderAttempted") is False,
            "originalMediaNotMutated": after.get("audioWorkbenchParameterControlLedgerOriginalMediaMutated") is False,
        }
        return {
            "passed": all(checks.values()),
            "checks": checks,
            "parameterCount": ledger.get("parameterCount"),
            "missingRequiredParameters": sorted(required - parameter_ids),
        }


def render_markdown(report: dict[str, Any]) -> str:
    lines = [
        f"# Audio Workbench Parameter Control Ledger Smoke: {report['baselineId']}",
        "",
        f"Generated: `{report['generatedAt']}`",
        "",
        f"- Passed: `{str(report['passed']).lower()}`",
        f"- Fixture parameter count: `{report['fixtureResult'].get('parameterCount')}`",
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
    script_path = Path(__file__).with_name("audio_workbench_parameter_control_ledger.py")
    fixture_result = run_fixture(script_path)
    out_dir = baseline_dir / f"audio-workbench-parameter-control-ledger-smoke-{slug}-{generated_at}"
    out_dir.mkdir(parents=True, exist_ok=True)
    report = {
        "schema": "quipsly.audio-workbench.parameter-control-ledger-smoke.v1",
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
    json_path = out_dir / "parameter-control-ledger-smoke.json"
    md_path = out_dir / f"audio-workbench-parameter-control-ledger-smoke-{slug}-{generated_at}.md"
    write_json(json_path, report)
    md_path.write_text(render_markdown(report), encoding="utf-8")

    manifest = read_json(manifest_path)
    outputs = manifest.setdefault("outputs", {})
    outputs["latestAudioWorkbenchParameterControlLedgerSmoke"] = str(json_path)
    outputs["latestAudioWorkbenchParameterControlLedgerSmokeMarkdown"] = str(md_path)
    history = outputs.setdefault("audioWorkbenchParameterControlLedgerSmokeHistory", [])
    if isinstance(history, list):
        history.append(str(json_path))
    manifest["audioWorkbenchParameterControlLedgerSmokeCount"] = int(manifest.get("audioWorkbenchParameterControlLedgerSmokeCount") or 0) + 1
    manifest["audioWorkbenchParameterControlLedgerSmokePassed"] = report["passed"]
    manifest["audioWorkbenchParameterControlLedgerSmokeApprovalStateChanged"] = False
    manifest["audioWorkbenchParameterControlLedgerSmokeBranchStateChanged"] = False
    manifest["audioWorkbenchParameterControlLedgerSmokeRenderAttempted"] = False
    manifest["audioWorkbenchParameterControlLedgerSmokeOriginalMediaMutated"] = False
    if before["approvalStatus"] != manifest.get("approvalStatus"):
        raise SystemExit("Smoke would change approval status; refusing to write manifest.")
    if before["branchInheritanceReady"] != manifest.get("branchInheritanceReady"):
        raise SystemExit("Smoke would change branch inheritance status; refusing to write manifest.")
    if before["branchRenderReady"] != manifest.get("branchRenderReady"):
        raise SystemExit("Smoke would change branch render status; refusing to write manifest.")
    write_json(manifest_path, manifest)

    print(f"Parameter control ledger smoke: {md_path}")
    print(f"Passed: {str(report['passed']).lower()}")
    print("Approval state changed: false")
    print("Branch state changed: false")
    print("Render attempted: false")
    print("Original media mutated: false")
    if not report["passed"]:
        raise SystemExit(1)


if __name__ == "__main__":
    main()
