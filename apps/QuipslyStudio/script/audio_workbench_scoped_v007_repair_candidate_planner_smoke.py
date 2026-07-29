#!/usr/bin/env python3
"""Smoke-test the scoped v007 repair candidate planner safely.

The real baseline currently has no returned repair/proof notes. This smoke uses
temporary manifests to prove the planner also handles future returned notes:
missing queue, no notes, repair notes, focused-proof notes, and mixed notes.
It writes one smoke report to the real baseline and updates manifest readback
fields, but it does not approve audio, unlock branches, render media, upload,
publish, or mutate original/source media.
"""

from __future__ import annotations

import argparse
import html
import json
import os
import shutil
import subprocess
import sys
import tempfile
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

SCRIPT_PATH = Path(__file__).with_name("audio_workbench_scoped_v007_repair_candidate_planner.py")


def read_json(path: Path) -> dict[str, Any]:
    return json.loads(path.read_text(encoding="utf-8"))


def write_json(path: Path, payload: dict[str, Any]) -> None:
    path.write_text(json.dumps(payload, indent=2, sort_keys=True) + "\n", encoding="utf-8")


def resolve_baseline_dir(input_path: Path) -> Path:
    expanded = input_path.expanduser()
    if (expanded / "manifest.json").exists():
        return expanded.resolve()
    nested = expanded / "work" / "conformed-production-baseline"
    if (nested / "manifest.json").exists():
        return nested.resolve()
    raise FileNotFoundError(f"Could not find manifest.json under {input_path}")


def safe_slug(value: str) -> str:
    out = "".join(ch.lower() if ch.isalnum() else "-" for ch in str(value))
    while "--" in out:
        out = out.replace("--", "-")
    return out.strip("-") or "audio-baseline"


def shell_quote(value: str) -> str:
    return "'" + value.replace("'", "'\\''") + "'"


def e(value: Any) -> str:
    return html.escape(str(value))


def output_path(value: Any) -> str | None:
    if isinstance(value, str) and value:
        return value
    if isinstance(value, dict):
        for key in ("path", "jsonPath", "markdownPath", "htmlPath", "openCommand"):
            subvalue = value.get(key)
            if isinstance(subvalue, str) and subvalue:
                return subvalue
    return None


def base_manifest(real_manifest: dict[str, Any], temp_baseline: Path) -> dict[str, Any]:
    return {
        "baselineId": real_manifest.get("baselineId") or "smoke-baseline",
        "approvalStatus": real_manifest.get("approvalStatus") or "machine-candidate-needs-human-listen-proof",
        "packageReadyForHumanListen": bool(real_manifest.get("packageReadyForHumanListen")),
        "branchInheritanceReady": bool(real_manifest.get("branchInheritanceReady")),
        "branchRenderReady": bool(real_manifest.get("branchRenderReady")),
        "outputs": {},
        "smokeTempBaseline": str(temp_baseline),
    }


def write_queue(temp_baseline: Path, name: str, payload: dict[str, Any]) -> str:
    path = temp_baseline / f"{name}-queue.json"
    write_json(path, payload)
    return str(path)


def run_planner(temp_baseline: Path) -> tuple[int, str, str, dict[str, Any]]:
    proc = subprocess.run(
        [sys.executable or "python3", str(SCRIPT_PATH), "--baseline-dir", str(temp_baseline)],
        text=True,
        capture_output=True,
    )
    report_path = temp_baseline / "AUDIO_SCOPED_V007_REPAIR_CANDIDATE_PLAN.json"
    report = read_json(report_path) if report_path.exists() else {}
    return proc.returncode, proc.stdout[-2000:], proc.stderr[-2000:], report


def expected_check(report: dict[str, Any], expected: dict[str, Any]) -> list[str]:
    failures = []
    for key, value in expected.items():
        if report.get(key) != value:
            failures.append(f"{key}: expected {value!r}, actual {report.get(key)!r}")
    return failures


def scenario_queue(*, repair: int = 0, proof: int = 0, pass_context: int = 0) -> dict[str, Any]:
    repair_actions = [
        {
            "sourceLabel": "Audio Defect Atlas notes",
            "sourceRole": "stage-aware defect-atlas pass/proof/repair notes",
            "sourceManifestKey": "latestAudioDefectAtlasNotesInbox",
            "actionType": "needs-repair",
            "decision": "needs-repair",
            "label": f"Echo bleed repair window {index + 1}",
            "timecode": "00:34:22.000",
            "sequenceStartSeconds": 2062.0 + index,
            "durationSeconds": 12.0,
            "reviewerNotes": "Distracting echo under Homer; test a speaker-cleanup proof-window candidate.",
            "firstMove": "Open the speaker cleanup repair/tuning path for this exact window.",
        }
        for index in range(repair)
    ]
    proof_actions = [
        {
            "sourceLabel": "Source-balance triage notes",
            "sourceRole": "source balance proof",
            "sourceManifestKey": "latestAudioSourceBalanceTriage",
            "actionType": "needs-proof",
            "decision": "needs-proof",
            "label": f"Source-balance uncertainty {index + 1}",
            "timecode": "01:09:40.000",
            "sequenceStartSeconds": 4180.0 + index,
            "durationSeconds": 10.0,
            "reviewerNotes": "Unclear whether the master retained enough Homer energy here.",
            "firstMove": "Create focused A/B proof snippets before any repair promotion.",
        }
        for index in range(proof)
    ]
    pass_actions = [
        {
            "sourceLabel": "Mission Reel notes",
            "sourceRole": "pass context",
            "sourceManifestKey": "latestAudioHumanListenMissionReelNotesInbox",
            "actionType": "pass-context",
            "decision": "pass",
            "label": f"Passed context {index + 1}",
            "timecode": "01:35:10.000",
            "reviewerNotes": "Sounds fine in context.",
        }
        for index in range(pass_context)
    ]
    return {
        "schema": "quipsly.audio-workbench.post-review-action-queue.v1",
        "status": "ready-for-review-actions",
        "sourceCount": 13,
        "sourceWithNotesCandidateCount": 1 if (repair or proof or pass_context) else 0,
        "repairActionCount": repair,
        "focusedProofActionCount": proof,
        "passContextCount": pass_context,
        "repairActions": repair_actions,
        "focusedProofActions": proof_actions,
        "passContextActions": pass_actions,
        "approvalStateChanged": False,
        "branchStateChanged": False,
        "renderAttempted": False,
        "originalMediaMutated": False,
    }


def build_scenarios(real_manifest: dict[str, Any], temp_root: Path) -> list[dict[str, Any]]:
    scenarios = []
    configs = [
        ("missing-queue", None, {"status": "needs-post-review-action-queue", "plannedItemCount": 0}),
        ("no-notes", scenario_queue(), {"status": "waiting-for-human-review-actions", "plannedItemCount": 0, "repairActionCount": 0, "focusedProofActionCount": 0}),
        ("repair-note", scenario_queue(repair=1), {"status": "ready-for-scoped-v007-repair-planning", "plannedItemCount": 1, "repairActionCount": 1, "focusedProofActionCount": 0}),
        ("focused-proof-note", scenario_queue(proof=1), {"status": "ready-for-scoped-v007-repair-planning", "plannedItemCount": 1, "repairActionCount": 0, "focusedProofActionCount": 1}),
        ("mixed-notes", scenario_queue(repair=1, proof=1, pass_context=1), {"status": "ready-for-scoped-v007-repair-planning", "plannedItemCount": 2, "repairActionCount": 1, "focusedProofActionCount": 1, "passContextCount": 1}),
    ]
    for name, queue, expected in configs:
        temp_baseline = temp_root / name
        temp_baseline.mkdir(parents=True, exist_ok=True)
        manifest = base_manifest(real_manifest, temp_baseline)
        if queue is not None:
            queue_path = write_queue(temp_baseline, name, queue)
            manifest["outputs"]["latestAudioPostReviewActionQueue"] = queue_path
            manifest["outputs"]["latestAudioPostReviewActionQueueMarkdown"] = str(temp_baseline / f"{name}-queue.md")
            Path(manifest["outputs"]["latestAudioPostReviewActionQueueMarkdown"]).write_text("# queue\n", encoding="utf-8")
        write_json(temp_baseline / "manifest.json", manifest)
        exit_code, stdout_tail, stderr_tail, report = run_planner(temp_baseline)
        failures = []
        if exit_code != 0:
            failures.append(f"planner exited {exit_code}")
        failures.extend(expected_check(report, expected))
        for safety_key in ("approvalStateChanged", "branchStateChanged", "renderAttempted", "branchRenderAttempted", "uploadAttempted", "publicationAttempted", "originalMediaMutated"):
            if bool(report.get(safety_key)) is not False:
                failures.append(f"{safety_key} was not false")
        scenarios.append(
            {
                "name": name,
                "passed": not failures,
                "expected": expected,
                "actual": {key: report.get(key) for key in expected},
                "failureMessages": failures,
                "stdoutTail": stdout_tail,
                "stderrTail": stderr_tail,
                "reportStatus": report.get("status"),
                "plannedItemCount": report.get("plannedItemCount"),
                "repairActionCount": report.get("repairActionCount"),
                "focusedProofActionCount": report.get("focusedProofActionCount"),
                "passContextCount": report.get("passContextCount"),
                "stageSummary": report.get("stageSummary") or [],
                "approvalStateChanged": bool(report.get("approvalStateChanged")),
                "branchStateChanged": bool(report.get("branchStateChanged")),
                "renderAttempted": bool(report.get("renderAttempted")),
                "originalMediaMutated": bool(report.get("originalMediaMutated")),
            }
        )
    return scenarios


def render_markdown(report: dict[str, Any]) -> str:
    lines = [
        f"# Scoped v007 Repair Candidate Planner Smoke: {report['baselineId']}",
        "",
        f"Generated: `{report['generatedAt']}`",
        "",
        "This smoke uses temporary manifests to prove the scoped v007 planner handles missing queues, no-note queues, repair notes, proof notes, and mixed notes without touching the real audio baseline.",
        "",
        f"- Passed: `{str(report['passed']).lower()}`",
        f"- Scenarios: `{report['scenarioCount']}`",
        f"- Failures: `{report['failureCount']}`",
        f"- Real approval state preserved: `{str(report['realApprovalStatePreserved']).lower()}`",
        f"- Real branch state preserved: `{str(report['realBranchStatePreserved']).lower()}`",
        "",
        "| Scenario | Passed | Status | Plans | Repairs | Proofs | Failures |",
        "|---|---|---|---:|---:|---:|---|",
    ]
    for scenario in report.get("scenarios") or []:
        failures = "; ".join(scenario.get("failureMessages") or []) or ""
        lines.append(
            f"| `{scenario['name']}` | `{str(scenario['passed']).lower()}` | `{scenario.get('reportStatus')}` | `{scenario.get('plannedItemCount')}` | `{scenario.get('repairActionCount')}` | `{scenario.get('focusedProofActionCount')}` | {failures} |"
        )
    lines.extend(
        [
            "",
            "## Safety",
            "",
            f"- Approval state changed: `{str(report['approvalStateChanged']).lower()}`",
            f"- Branch state changed: `{str(report['branchStateChanged']).lower()}`",
            f"- Render attempted: `{str(report['renderAttempted']).lower()}`",
            f"- Branch render attempted: `{str(report['branchRenderAttempted']).lower()}`",
            f"- Upload attempted: `{str(report['uploadAttempted']).lower()}`",
            f"- Publication attempted: `{str(report['publicationAttempted']).lower()}`",
            f"- Original media mutated: `{str(report['originalMediaMutated']).lower()}`",
        ]
    )
    return "\n".join(lines) + "\n"


def render_html(report: dict[str, Any]) -> str:
    rows = []
    for scenario in report.get("scenarios") or []:
        failures = "; ".join(scenario.get("failureMessages") or []) or ""
        rows.append(
            "<tr>"
            f"<td>{e(scenario['name'])}</td>"
            f"<td>{str(scenario['passed']).lower()}</td>"
            f"<td>{e(scenario.get('reportStatus'))}</td>"
            f"<td>{scenario.get('plannedItemCount')}</td>"
            f"<td>{scenario.get('repairActionCount')}</td>"
            f"<td>{scenario.get('focusedProofActionCount')}</td>"
            f"<td>{e(failures)}</td>"
            "</tr>"
        )
    return f"""<!doctype html>
<html><head><meta charset="utf-8"><title>Scoped v007 Planner Smoke</title>
<style>
:root {{ color-scheme: dark; --bg:#101713; --panel:#1b251e; --ink:#f7ecd7; --muted:#b9ad95; --gold:#e7c84a; --moss:#79d28c; --clay:#d47754; --line:rgba(247,236,215,.14); }}
body {{ margin:0; font:15px/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif; color:var(--ink); background:radial-gradient(circle at top left,#2c442d,var(--bg) 52%); }}
main {{ width:min(1180px,calc(100vw - 48px)); margin:34px auto 70px; }}
.hero,.panel {{ border:1px solid var(--line); border-radius:28px; background:linear-gradient(180deg,rgba(255,255,255,.05),rgba(0,0,0,.14)),var(--panel); box-shadow:0 22px 70px rgba(0,0,0,.32); padding:26px; }}
.eyebrow {{ color:var(--gold); text-transform:uppercase; letter-spacing:.18em; font-size:12px; font-weight:900; }}
h1 {{ font-size:clamp(36px,6vw,72px); margin:8px 0 12px; line-height:.92; }}
p {{ color:var(--muted); }}
.pills {{ display:flex; flex-wrap:wrap; gap:10px; margin-top:18px; }}
.pill {{ border:1px solid var(--line); border-radius:999px; padding:10px 14px; background:rgba(0,0,0,.22); color:var(--muted); }}
.pill strong {{ color:var(--ink); }}
section {{ margin-top:22px; }}
table {{ width:100%; border-collapse:collapse; }}
th,td {{ border-bottom:1px solid var(--line); text-align:left; vertical-align:top; padding:12px; }}
th {{ color:var(--gold); text-transform:uppercase; letter-spacing:.08em; font-size:12px; }}
</style></head><body><main>
<section class="hero"><div class="eyebrow">Quipsly Audio Workbench</div><h1>Scoped v007 Planner Smoke</h1><p>Temporary-input proof that future repair/proof notes route safely.</p><div class="pills"><div class="pill"><strong>Passed</strong> {str(report['passed']).lower()}</div><div class="pill"><strong>Scenarios</strong> {report['scenarioCount']}</div><div class="pill"><strong>Failures</strong> {report['failureCount']}</div><div class="pill"><strong>Approval preserved</strong> {str(report['realApprovalStatePreserved']).lower()}</div></div></section>
<section class="panel"><table><thead><tr><th>Scenario</th><th>Passed</th><th>Status</th><th>Plans</th><th>Repairs</th><th>Proofs</th><th>Failures</th></tr></thead><tbody>{''.join(rows)}</tbody></table></section>
</main></body></html>
"""


def write_open_command(path: Path, html_path: Path, markdown_path: Path) -> None:
    path.write_text(
        "#!/bin/zsh\n"
        "set -euo pipefail\n"
        f"open {shell_quote(str(html_path))}\n"
        f"open {shell_quote(str(markdown_path))}\n",
        encoding="utf-8",
    )
    os.chmod(path, 0o755)


def update_manifest(manifest_path: Path, report: dict[str, Any]) -> None:
    manifest = read_json(manifest_path)
    outputs = manifest.setdefault("outputs", {})
    entry = {
        "path": report["jsonPath"],
        "jsonPath": report["jsonPath"],
        "markdownPath": report["markdownPath"],
        "htmlPath": report["htmlPath"],
        "openCommand": report["openCommand"],
        "generatedAt": report["generatedAt"],
        "schema": report["schema"],
        "passed": report["passed"],
        "scenarioCount": report["scenarioCount"],
        "failureCount": report["failureCount"],
        "approvalStateChanged": False,
        "branchStateChanged": False,
        "renderAttempted": False,
        "branchRenderAttempted": False,
        "uploadAttempted": False,
        "publicationAttempted": False,
        "originalMediaMutated": False,
    }
    outputs["latestAudioScopedV007RepairCandidatePlanSmoke"] = entry
    outputs["latestAudioScopedV007RepairCandidatePlanSmokeMarkdown"] = report["markdownPath"]
    outputs["latestAudioScopedV007RepairCandidatePlanSmokeHtml"] = report["htmlPath"]
    outputs["latestAudioScopedV007RepairCandidatePlanSmokeOpenCommand"] = report["openCommand"]
    outputs.setdefault("audioScopedV007RepairCandidatePlanSmokes", []).append(entry)
    manifest["audioScopedV007RepairCandidatePlanSmokeCount"] = len(outputs["audioScopedV007RepairCandidatePlanSmokes"])
    manifest["audioScopedV007RepairCandidatePlanSmokePassed"] = report["passed"]
    manifest["audioScopedV007RepairCandidatePlanSmokeScenarioCount"] = report["scenarioCount"]
    manifest["audioScopedV007RepairCandidatePlanSmokeFailureCount"] = report["failureCount"]
    manifest["audioScopedV007RepairCandidatePlanSmokeRealApprovalStatePreserved"] = report["realApprovalStatePreserved"]
    manifest["audioScopedV007RepairCandidatePlanSmokeRealBranchStatePreserved"] = report["realBranchStatePreserved"]
    manifest["audioScopedV007RepairCandidatePlanSmokeApprovalStateChanged"] = False
    manifest["audioScopedV007RepairCandidatePlanSmokeBranchStateChanged"] = False
    manifest["audioScopedV007RepairCandidatePlanSmokeRenderAttempted"] = False
    manifest["audioScopedV007RepairCandidatePlanSmokeBranchRenderAttempted"] = False
    manifest["audioScopedV007RepairCandidatePlanSmokeUploadAttempted"] = False
    manifest["audioScopedV007RepairCandidatePlanSmokePublicationAttempted"] = False
    manifest["audioScopedV007RepairCandidatePlanSmokeOriginalMediaMutated"] = False
    write_json(manifest_path, manifest)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--baseline-dir", required=True, type=Path)
    args = parser.parse_args()

    baseline_dir = resolve_baseline_dir(args.baseline_dir)
    manifest_path = baseline_dir / "manifest.json"
    real_manifest_before = read_json(manifest_path)
    baseline_id = str(real_manifest_before.get("baselineId") or "audio-baseline")
    slug = safe_slug(baseline_id.replace("episode-4-conformed-production-baseline-", ""))
    generated_at = datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S")
    generated_iso = datetime.now(timezone.utc).isoformat()

    with tempfile.TemporaryDirectory(prefix="quipsly-scoped-v007-planner-smoke-") as tmp:
        temp_root = Path(tmp)
        scenarios = build_scenarios(real_manifest_before, temp_root)
        temp_root_kept = baseline_dir / f"audio-scoped-v007-repair-candidate-plan-smoke-inputs-{slug}-{generated_at}"
        if temp_root_kept.exists():
            shutil.rmtree(temp_root_kept)
        shutil.copytree(temp_root, temp_root_kept)

    failures = [failure for scenario in scenarios for failure in scenario.get("failureMessages") or []]
    real_manifest_after = read_json(manifest_path)
    real_approval_preserved = real_manifest_after.get("approvalStatus") == real_manifest_before.get("approvalStatus")
    real_branch_preserved = (
        real_manifest_after.get("branchInheritanceReady") == real_manifest_before.get("branchInheritanceReady")
        and real_manifest_after.get("branchRenderReady") == real_manifest_before.get("branchRenderReady")
    )
    passed = not failures and real_approval_preserved and real_branch_preserved

    stable_json = baseline_dir / "AUDIO_SCOPED_V007_REPAIR_CANDIDATE_PLAN_SMOKE.json"
    stable_md = baseline_dir / "AUDIO_SCOPED_V007_REPAIR_CANDIDATE_PLAN_SMOKE.md"
    stable_html = baseline_dir / "AUDIO_SCOPED_V007_REPAIR_CANDIDATE_PLAN_SMOKE.html"
    stable_open = baseline_dir / "OPEN_AUDIO_SCOPED_V007_REPAIR_CANDIDATE_PLAN_SMOKE.command"
    versioned_json = baseline_dir / f"audio-scoped-v007-repair-candidate-plan-smoke-{slug}-{generated_at}.json"
    versioned_md = baseline_dir / f"audio-scoped-v007-repair-candidate-plan-smoke-{slug}-{generated_at}.md"
    versioned_html = baseline_dir / f"audio-scoped-v007-repair-candidate-plan-smoke-{slug}-{generated_at}.html"

    report = {
        "schema": "quipsly.audio-workbench.scoped-v007-repair-candidate-planner-smoke.v1",
        "generatedAt": generated_at,
        "generatedIso": generated_iso,
        "baselineDir": str(baseline_dir),
        "baselineId": baseline_id,
        "passed": passed,
        "scenarioCount": len(scenarios),
        "failureCount": len(failures) + (0 if real_approval_preserved else 1) + (0 if real_branch_preserved else 1),
        "failureMessages": failures,
        "scenarios": scenarios,
        "tempInputArchiveDir": str(temp_root_kept),
        "realApprovalStatePreserved": real_approval_preserved,
        "realBranchStatePreserved": real_branch_preserved,
        "approvalStateChanged": False,
        "branchStateChanged": False,
        "renderAttempted": False,
        "branchRenderAttempted": False,
        "uploadAttempted": False,
        "publicationAttempted": False,
        "originalMediaMutated": False,
        "jsonPath": str(stable_json),
        "markdownPath": str(stable_md),
        "htmlPath": str(stable_html),
        "openCommand": str(stable_open),
    }

    markdown = render_markdown(report)
    html_doc = render_html(report)
    write_json(stable_json, report)
    write_json(versioned_json, report)
    stable_md.write_text(markdown, encoding="utf-8")
    versioned_md.write_text(markdown, encoding="utf-8")
    stable_html.write_text(html_doc, encoding="utf-8")
    versioned_html.write_text(html_doc, encoding="utf-8")
    write_open_command(stable_open, stable_html, stable_md)
    update_manifest(manifest_path, report)

    print(json.dumps({"passed": passed, "scenarioCount": len(scenarios), "failureCount": report["failureCount"], "markdown": str(stable_md)}, indent=2))


if __name__ == "__main__":
    main()
