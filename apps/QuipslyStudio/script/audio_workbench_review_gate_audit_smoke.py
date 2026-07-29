#!/usr/bin/env python3
"""Smoke-test the audio review gate auditor without approving anything.

The smoke copies only manifest.json into temporary baseline folders, mutates the
copies into safe and unsafe review-gate states, runs the real gate-audit script,
and verifies that the auditor passes the safe state and rejects unsafe states.

It then registers this smoke report on the real manifest. It does not approve
audio, fail audio, render branches, upload files, or mutate original media.
"""

from __future__ import annotations

import argparse
import json
import shutil
import subprocess
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


def repo_root() -> Path:
    return Path(__file__).resolve().parents[3]


def safe_slug(value: str) -> str:
    out = "".join(ch.lower() if ch.isalnum() else "-" for ch in value)
    while "--" in out:
        out = out.replace("--", "-")
    return out.strip("-") or "audio-baseline"


def output_path(value: Any) -> str | None:
    if isinstance(value, str):
        return value
    if isinstance(value, dict):
        path = value.get("path")
        if isinstance(path, str):
            return path
    return None


def mutate_manifest(temp_manifest_path: Path, scenario_name: str) -> None:
    manifest = read_json(temp_manifest_path)
    outputs = manifest.setdefault("outputs", {})

    if scenario_name == "missing-master-wav":
        outputs["masterWav"] = str(temp_manifest_path.parent / "missing-master.wav")

    if scenario_name == "unsafe-branch-inheritance":
        manifest["approvalStatus"] = "machine-candidate-needs-human-listen-proof"
        manifest["branchInheritanceReady"] = True

    if scenario_name == "unsafe-branch-render":
        manifest["approvalStatus"] = "machine-candidate-needs-human-listen-proof"
        manifest["branchRenderReady"] = True

    if scenario_name == "missing-status-board-smoke":
        outputs["latestAudioReviewStatusBoardSmokeMarkdown"] = str(
            temp_manifest_path.parent / "missing-status-board-smoke.md"
        )

    write_json(temp_manifest_path, manifest)


def run_gate_audit(temp_baseline: Path) -> tuple[subprocess.CompletedProcess[str], dict[str, Any] | None, str | None]:
    result = subprocess.run(
        [
            "python3",
            "apps/QuipslyStudio/script/audio_workbench_review_gate_audit.py",
            "--baseline-dir",
            str(temp_baseline),
        ],
        cwd=repo_root(),
        text=True,
        capture_output=True,
    )
    reports = sorted(temp_baseline.glob("audio-review-gate-audit-*.json"), key=lambda path: path.stat().st_mtime)
    if not reports:
        return result, None, None
    report_path = reports[-1]
    return result, read_json(report_path), str(report_path)


def evaluate_scenario(
    *,
    name: str,
    expected_passed: bool,
    result: subprocess.CompletedProcess[str],
    report: dict[str, Any] | None,
    report_path: str | None,
) -> dict[str, Any]:
    actual_passed = bool(report.get("passed")) if report else False
    error_count = int(report.get("errorCount") or 0) if report else 0
    checks = {
        "reportProduced": report is not None,
        "expectedPassState": actual_passed is expected_passed,
    }
    if expected_passed:
        checks["errorCountOk"] = error_count == 0
    else:
        checks["errorCountOk"] = error_count > 0
    return {
        "name": name,
        "expectedPassed": expected_passed,
        "actualPassed": actual_passed,
        "errorCount": error_count,
        "warningCount": int(report.get("warningCount") or 0) if report else 0,
        "returncode": result.returncode,
        "reportPath": report_path,
        "stdout": result.stdout.strip(),
        "stderr": result.stderr.strip(),
        "checks": checks,
        "passed": all(checks.values()),
    }


def render_markdown(report: dict[str, Any]) -> str:
    lines = [
        f"# Audio Review Gate Audit Smoke: {report['baselineId']}",
        "",
        f"Generated: `{report['generatedAt']}`",
        "",
        "This smoke tested the gate auditor in temporary baseline folders. It did not approve audio, fail audio, render branches, upload files, or mutate original media.",
        "",
        "## Summary",
        "",
        f"- Passed: `{str(report['passed']).lower()}`",
        f"- Real approval state preserved: `{str(report['realApprovalStatePreserved']).lower()}`",
        f"- Real branch state preserved: `{str(report['realBranchStatePreserved']).lower()}`",
        f"- Real render state preserved: `{str(report['realRenderStatePreserved']).lower()}`",
        f"- Original media mutated: `{str(report['originalMediaMutated']).lower()}`",
        "",
        "## Scenarios",
        "",
        "| Scenario | Expected passed | Actual passed | Errors | Warnings | Smoke passed |",
        "|---|---:|---:|---:|---:|---:|",
    ]
    for scenario in report["scenarios"]:
        lines.append(
            f"| {scenario['name']} | `{str(scenario['expectedPassed']).lower()}` | "
            f"`{str(scenario['actualPassed']).lower()}` | `{scenario['errorCount']}` | "
            f"`{scenario['warningCount']}` | `{str(scenario['passed']).lower()}` |"
        )
    lines.extend(
        [
            "",
            "## Guardrail",
            "",
            "A passing smoke means the gate auditor proves both sides: it accepts the current locked review package and rejects unsafe or incomplete review states. It is still not human approval. Branch rendering remains locked until a real human listen decision is recorded through the guarded command path.",
            "",
        ]
    )
    return "\n".join(lines)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--baseline-dir", required=True, type=Path)
    args = parser.parse_args()

    baseline_dir = resolve_baseline_dir(args.baseline_dir)
    manifest_path = baseline_dir / "manifest.json"
    manifest_before = read_json(manifest_path)
    outputs_before = manifest_before.get("outputs") or {}
    baseline_id = str(manifest_before.get("baselineId") or "audio-baseline")
    slug = safe_slug(baseline_id.replace("episode-4-conformed-production-baseline-", ""))
    generated_at = datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S")
    generated_iso = datetime.now(timezone.utc).isoformat()

    before_gates = {
        "approvalStatus": manifest_before.get("approvalStatus"),
        "branchInheritanceReady": bool(manifest_before.get("branchInheritanceReady")),
        "branchRenderReady": bool(manifest_before.get("branchRenderReady")),
    }

    scenarios: list[dict[str, Any]] = []
    scenario_specs = [
        ("happy-pending-locked", True),
        ("missing-master-wav", False),
        ("unsafe-branch-inheritance", False),
        ("unsafe-branch-render", False),
        ("missing-status-board-smoke", False),
    ]

    with tempfile.TemporaryDirectory(prefix="quipsly-gate-audit-smoke-") as tmp:
        tmp_root = Path(tmp)
        for name, expected_passed in scenario_specs:
            temp_baseline = tmp_root / f"{name}-baseline"
            temp_baseline.mkdir()
            temp_manifest_path = temp_baseline / "manifest.json"
            shutil.copy2(manifest_path, temp_manifest_path)
            mutate_manifest(temp_manifest_path, name)
            result, report, report_path = run_gate_audit(temp_baseline)
            scenarios.append(
                evaluate_scenario(
                    name=name,
                    expected_passed=expected_passed,
                    result=result,
                    report=report,
                    report_path=report_path,
                )
            )

    manifest_after_scenarios = read_json(manifest_path)
    after_gates = {
        "approvalStatus": manifest_after_scenarios.get("approvalStatus"),
        "branchInheritanceReady": bool(manifest_after_scenarios.get("branchInheritanceReady")),
        "branchRenderReady": bool(manifest_after_scenarios.get("branchRenderReady")),
    }

    report = {
        "schema": "quipsly.audio-workbench.review-gate-audit-smoke.v1",
        "baselineId": baseline_id,
        "baselineDir": str(baseline_dir),
        "generatedAt": generated_iso,
        "scenarios": scenarios,
        "passed": all(scenario["passed"] for scenario in scenarios),
        "realApprovalStatePreserved": before_gates["approvalStatus"] == after_gates["approvalStatus"],
        "realBranchStatePreserved": (
            before_gates["branchInheritanceReady"] == after_gates["branchInheritanceReady"]
            and before_gates["branchRenderReady"] == after_gates["branchRenderReady"]
        ),
        "realRenderStatePreserved": bool(manifest_after_scenarios.get("branchRenderReady"))
        == before_gates["branchRenderReady"],
        "approvalStateChanged": before_gates["approvalStatus"] != after_gates["approvalStatus"],
        "branchStateChanged": (
            before_gates["branchInheritanceReady"] != after_gates["branchInheritanceReady"]
            or before_gates["branchRenderReady"] != after_gates["branchRenderReady"]
        ),
        "renderAttempted": False,
        "originalMediaMutated": False,
        "beforeGates": before_gates,
        "afterGates": after_gates,
        "testedArtifacts": {
            "masterWav": output_path(outputs_before.get("masterWav")),
            "statusBoardSmokeMarkdown": output_path(outputs_before.get("latestAudioReviewStatusBoardSmokeMarkdown")),
            "latestGateAuditMarkdown": output_path(outputs_before.get("latestAudioReviewGateAuditMarkdown")),
        },
    }
    report["passed"] = bool(
        report["passed"]
        and report["realApprovalStatePreserved"]
        and report["realBranchStatePreserved"]
        and report["realRenderStatePreserved"]
        and not report["approvalStateChanged"]
        and not report["branchStateChanged"]
        and not report["renderAttempted"]
        and not report["originalMediaMutated"]
    )

    json_path = baseline_dir / f"audio-review-gate-audit-smoke-{slug}-{generated_at}.json"
    markdown_path = baseline_dir / f"audio-review-gate-audit-smoke-{slug}-{generated_at}.md"
    write_json(json_path, report)
    markdown_path.write_text(render_markdown(report), encoding="utf-8")

    manifest = read_json(manifest_path)
    outputs = manifest.setdefault("outputs", {})
    outputs["latestAudioReviewGateAuditSmoke"] = str(json_path)
    outputs["latestAudioReviewGateAuditSmokeMarkdown"] = str(markdown_path)
    smokes = outputs.setdefault("audioReviewGateAuditSmokes", [])
    smokes.append(
        {
            "path": str(json_path),
            "markdownPath": str(markdown_path),
            "generatedAt": generated_iso,
            "passed": report["passed"],
            "scenarioCount": len(scenarios),
        }
    )
    manifest["audioReviewGateAuditSmokeCount"] = len(smokes)
    manifest["updatedAt"] = generated_iso
    write_json(manifest_path, manifest)

    print(str(markdown_path))
    if not report["passed"]:
        raise SystemExit(1)


if __name__ == "__main__":
    main()
