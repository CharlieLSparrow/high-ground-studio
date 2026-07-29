#!/usr/bin/env python3
"""Smoke-test the Codex listen-decision real-record path in a sandbox.

The normal Codex intake smoke dry-runs plain-language decisions against the
real v006 baseline. This sibling smoke proves the actual ``--record`` path
without approving the real baseline:

1. Copy the real manifest into a sandbox.
2. Seed enough package evidence for approval preflights.
3. Run the same chat-facing adapter with:
   ``Approve v006 audio spine --record --confirm-human-listened``.
4. Verify that the adapter records only inside the sandbox and runs the
   canonical post-listen refresh.
5. Verify the real baseline approval/branch/render state is preserved.

This is the guardrail for the moment Charlie eventually says "approve" in chat:
one path, one source-aware post-listen refresh, no flat-master editing shortcut.
"""

from __future__ import annotations

import argparse
import html
import json
import shutil
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from audio_workbench_approval_path_smoke import (
    load_json,
    output_path,
    safe_slug,
    seed_sandbox_evidence,
    shell_quote,
    write_json,
    write_open_command,
)


APPROVED_STATUS = "human-approved-for-branch-inheritance"
PENDING_STATUS = "machine-candidate-needs-human-listen-proof"
POST_LISTEN_REFRESH_SCRIPT = "audio_workbench_post_listen_refresh.py"
SOURCE_AWARE_AUDIO_TRUTH = "source-aware-refined-stems"


def repo_root() -> Path:
    return Path(__file__).resolve().parents[3]


def resolve_baseline_dir(input_path: Path) -> Path:
    expanded = input_path.expanduser().resolve()
    if (expanded / "manifest.json").exists():
        return expanded
    nested = expanded / "work" / "conformed-production-baseline"
    if (nested / "manifest.json").exists():
        return nested
    raise FileNotFoundError(f"Could not find manifest.json under {expanded}")


def run_command(command: list[str], *, cwd: Path) -> dict[str, Any]:
    result = subprocess.run(command, cwd=cwd, text=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE, check=False)
    parsed: dict[str, Any] | None = None
    if result.stdout.strip():
        try:
            parsed = json.loads(result.stdout)
        except json.JSONDecodeError:
            parsed = None
    return {
        "command": command,
        "returncode": result.returncode,
        "ok": result.returncode == 0,
        "stdout": result.stdout[-8000:],
        "stderr": result.stderr[-8000:],
        "parsedStdout": parsed,
    }


def bool_value(value: Any) -> bool:
    return value is True or str(value).strip().lower() == "true"


def render_markdown(report: dict[str, Any]) -> str:
    lines = [
        f"# Codex Listen Decision Record Sandbox Smoke: {report['baselineId']}",
        "",
        f"- Generated: `{report['generatedAt']}`",
        f"- Status: `{report['status']}`",
        f"- Passed: `{str(report['passed']).lower()}`",
        f"- Real approval preserved: `{str(report['realApprovalPreserved']).lower()}`",
        f"- Sandbox approval status: `{report['sandboxApprovalStatus']}`",
        f"- Sandbox branch inheritance ready: `{str(report['sandboxBranchInheritanceReady']).lower()}`",
        f"- Sandbox branch render ready: `{str(report['sandboxBranchRenderReady']).lower()}`",
        f"- Sandbox branch audio truth: `{report['sandboxBranchRenderAudioTruth']}`",
        f"- Sandbox refresh status: `{report['sandboxPostListenRefreshStatus']}`",
        f"- Sandbox render commands exposed: `{str(report['sandboxRealBranchRenderCommandsExposed']).lower()}`",
        f"- Real render/upload/publication/original mutation: `{str(report['realSafetyChanged']).lower()}`",
        "",
        "This is a sandboxed rehearsal of the exact Codex chat adapter real-record path. It does not approve the real v006 baseline.",
        "",
        "## Adapter truth",
        "",
        f"- Parsed decision: `{report['adapterParsedDecision']}`",
        f"- Recorded: `{str(report['adapterRecorded']).lower()}`",
        f"- Refresh ran: `{str(report['adapterPostDecisionRefreshRan']).lower()}`",
        f"- Canonical refresh script: `{report['adapterPostDecisionRefreshCanonicalScript']}`",
        "",
        "## Sandbox",
        "",
        f"- Sandbox dir: `{report['sandboxDir']}`",
        f"- Sandbox manifest: `{report['sandboxManifest']}`",
        "",
        "## Checks",
        "",
        "| Check | Passed | Detail |",
        "|---|---:|---|",
    ]
    for check in report["checks"]:
        lines.append(f"| {check['name']} | `{str(check['passed']).lower()}` | {check['detail']} |")
    if report["errors"]:
        lines.extend(["", "## Errors", ""])
        lines.extend(f"- {error}" for error in report["errors"])
    lines.append("")
    return "\n".join(lines)


def render_html(report: dict[str, Any]) -> str:
    status_class = "pass" if report["passed"] else "fail"
    checks = "\n".join(
        f"<tr><td>{html.escape(check['name'])}</td><td>{'pass' if check['passed'] else 'fail'}</td><td>{html.escape(str(check['detail']))}</td></tr>"
        for check in report["checks"]
    )
    return f"""<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>Codex Listen Decision Record Sandbox Smoke</title>
<style>
body {{ font-family: -apple-system, BlinkMacSystemFont, sans-serif; margin: 32px; background: #f7f2e8; color: #2f261d; }}
.card {{ background: #fffaf0; border: 1px solid #dfcda8; border-radius: 18px; padding: 20px; margin-bottom: 18px; box-shadow: 0 10px 30px rgba(47,38,29,.08); }}
.pass {{ color: #167a3a; }}
.fail {{ color: #aa2638; }}
table {{ width: 100%; border-collapse: collapse; background: #fffaf0; }}
th, td {{ border-bottom: 1px solid #eadfc9; padding: 9px; text-align: left; vertical-align: top; }}
code {{ background: #efe1c5; border-radius: 6px; padding: 2px 5px; }}
</style>
</head>
<body>
<section class="card"><p>Quipsly Studio · Episode 4 audio gate</p><h1>Codex listen decision record sandbox smoke</h1><p class="{status_class}">{html.escape(report['status'])}</p><p>This rehearses the real chat-facing approval path inside a sandbox.</p></section>
<section class="card"><h2>Truth</h2><ul>
<li>Real approval preserved: <code>{str(report['realApprovalPreserved']).lower()}</code></li>
<li>Sandbox approval: <code>{html.escape(str(report['sandboxApprovalStatus']))}</code></li>
<li>Sandbox branch render ready: <code>{str(report['sandboxBranchRenderReady']).lower()}</code></li>
<li>Audio truth: <code>{html.escape(str(report['sandboxBranchRenderAudioTruth']))}</code></li>
<li>Canonical refresh: <code>{html.escape(str(report['adapterPostDecisionRefreshCanonicalScript']))}</code></li>
</ul></section>
<section class="card"><h2>Checks</h2><table><thead><tr><th>Check</th><th>Result</th><th>Detail</th></tr></thead><tbody>{checks}</tbody></table></section>
</body>
</html>
"""


def add_check(checks: list[dict[str, Any]], name: str, passed: bool, detail: str) -> None:
    checks.append({"name": name, "passed": bool(passed), "detail": detail})


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--baseline-dir", required=True, type=Path)
    args = parser.parse_args()

    baseline_dir = resolve_baseline_dir(args.baseline_dir)
    manifest_path = baseline_dir / "manifest.json"
    real_before_text = manifest_path.read_text(encoding="utf-8")
    real_before = json.loads(real_before_text)
    baseline_id = str(real_before.get("baselineId") or "audio-baseline")
    generated_at_iso = datetime.now(timezone.utc).isoformat()
    generated_at_slug = datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S")
    slug = safe_slug(baseline_id)
    sandbox_root = baseline_dir / f"codex-listen-decision-record-sandbox-smoke-{slug}-{generated_at_slug}"
    sandbox_dir = sandbox_root / "sandbox-baseline"
    sandbox_dir.mkdir(parents=True, exist_ok=False)
    shutil.copy2(manifest_path, sandbox_dir / "manifest.json")
    sandbox_evidence = seed_sandbox_evidence(baseline_dir, sandbox_dir)

    adapter = repo_root() / "apps" / "QuipslyStudio" / "script" / "audio_workbench_codex_listen_decision_intake.py"
    result = run_command(
        [
            sys.executable,
            str(adapter),
            "--baseline-dir",
            str(sandbox_dir),
            "--reviewer",
            "codex-record-sandbox-smoke",
            "--utterance",
            "Approve v006 audio spine",
            "--record",
            "--confirm-human-listened",
        ],
        cwd=repo_root(),
    )

    real_after = load_json(manifest_path)
    sandbox_manifest = load_json(sandbox_dir / "manifest.json")
    sandbox_outputs = sandbox_manifest.get("outputs") if isinstance(sandbox_manifest.get("outputs"), dict) else {}
    adapter_report = result["parsedStdout"] if isinstance(result.get("parsedStdout"), dict) else {}
    refresh_results = adapter_report.get("postDecisionRefreshResults") if isinstance(adapter_report.get("postDecisionRefreshResults"), list) else []
    post_listen_refresh_path = output_path(sandbox_outputs.get("latestAudioPostListenRefreshStableJson")) or output_path(
        sandbox_outputs.get("latestAudioPostListenRefresh")
    )
    post_listen_refresh = load_json(Path(post_listen_refresh_path)) if post_listen_refresh_path and Path(post_listen_refresh_path).exists() else {}
    executor_path = output_path(sandbox_outputs.get("latestApprovedBranchRenderExecutor"))
    executor = load_json(Path(executor_path)) if executor_path and Path(executor_path).exists() else {}

    real_approval_preserved = (
        real_after.get("approvalStatus") == real_before.get("approvalStatus") == PENDING_STATUS
        and bool_value(real_after.get("branchInheritanceReady")) == bool_value(real_before.get("branchInheritanceReady")) == False
        and bool_value(real_after.get("branchRenderReady")) == bool_value(real_before.get("branchRenderReady")) == False
    )
    real_safety_changed = any(
        bool_value(real_after.get(key))
        for key in ("renderAttempted", "branchRenderAttempted", "uploadAttempted", "publicationAttempted", "originalMediaMutated")
    )
    sandbox_approval_status = sandbox_manifest.get("approvalStatus")
    sandbox_branch_inheritance_ready = bool_value(sandbox_manifest.get("branchInheritanceReady"))
    sandbox_branch_render_ready = bool_value(sandbox_manifest.get("branchRenderReady"))
    sandbox_branch_audio_truth = sandbox_manifest.get("branchRenderAudioTruth")
    sandbox_master_only_forbidden = bool_value(sandbox_manifest.get("masteredSpineOnlyEditingAllowed")) is False
    sandbox_refresh_status = post_listen_refresh.get("status")
    sandbox_refresh_route_status = post_listen_refresh.get("routeStatus")
    sandbox_refresh_step_failures = int(post_listen_refresh.get("stepFailureCount") or 0)
    sandbox_refresh_hard_stops = int(post_listen_refresh.get("hardStopCount") or 0)
    sandbox_commands_exposed = bool_value(executor.get("commandsExposed")) or bool_value(post_listen_refresh.get("realBranchRenderCommandsExposed"))
    sandbox_executor_refined_stems = bool_value(executor.get("sourceAwareBranchRenderWillUseRefinedStems"))
    sandbox_executor_master_only_prevented = bool_value(executor.get("masteredSpineOnlyBranchRenderPrevented"))

    checks: list[dict[str, Any]] = []
    add_check(checks, "adapter exits zero", result["ok"], f"returncode={result['returncode']}")
    add_check(checks, "adapter parsed JSON stdout", bool(adapter_report), "parsed stdout JSON")
    add_check(checks, "adapter parsed approval", adapter_report.get("parsedDecision") == "approve", str(adapter_report.get("parsedDecision")))
    add_check(checks, "adapter recorded real sandbox decision", adapter_report.get("recorded") is True, str(adapter_report.get("recorded")))
    add_check(checks, "adapter required human confirmation", adapter_report.get("confirmHumanListened") is True, str(adapter_report.get("confirmHumanListened")))
    add_check(checks, "adapter ran post-decision refresh", adapter_report.get("postDecisionRefreshRan") is True, str(adapter_report.get("postDecisionRefreshRan")))
    add_check(checks, "adapter uses canonical refresh", adapter_report.get("postDecisionRefreshCanonicalScript") == POST_LISTEN_REFRESH_SCRIPT, str(adapter_report.get("postDecisionRefreshCanonicalScript")))
    add_check(checks, "refresh result includes canonical script", any(item.get("script") == POST_LISTEN_REFRESH_SCRIPT for item in refresh_results if isinstance(item, dict)), str(refresh_results[:1]))
    add_check(checks, "real approval preserved", real_approval_preserved, f"before={real_before.get('approvalStatus')} after={real_after.get('approvalStatus')}")
    add_check(checks, "real safety unchanged", not real_safety_changed, "real render/upload/publication/original flags false")
    add_check(checks, "sandbox approval recorded", sandbox_approval_status == APPROVED_STATUS, str(sandbox_approval_status))
    add_check(checks, "sandbox branch inheritance ready", sandbox_branch_inheritance_ready, str(sandbox_branch_inheritance_ready))
    add_check(checks, "sandbox branch render ready", sandbox_branch_render_ready, str(sandbox_branch_render_ready))
    add_check(checks, "sandbox source-aware audio truth", sandbox_branch_audio_truth == SOURCE_AWARE_AUDIO_TRUTH, str(sandbox_branch_audio_truth))
    add_check(checks, "sandbox mastered-spine-only forbidden", sandbox_master_only_forbidden, str(sandbox_manifest.get("masteredSpineOnlyEditingAllowed")))
    add_check(checks, "sandbox post-listen refresh passed", sandbox_refresh_status == "post-listen-refresh-approved-branch-render-ready", str(sandbox_refresh_status))
    add_check(checks, "sandbox refresh route ready", sandbox_refresh_route_status == "approved-ready-for-branch-render", str(sandbox_refresh_route_status))
    add_check(checks, "sandbox refresh step failures zero", sandbox_refresh_step_failures == 0, str(sandbox_refresh_step_failures))
    add_check(checks, "sandbox refresh hard stops zero", sandbox_refresh_hard_stops == 0, str(sandbox_refresh_hard_stops))
    add_check(checks, "sandbox executor exposes render commands", sandbox_commands_exposed, str(sandbox_commands_exposed))
    add_check(checks, "sandbox executor uses refined stems", sandbox_executor_refined_stems, str(sandbox_executor_refined_stems))
    add_check(checks, "sandbox executor prevents master-only branch render", sandbox_executor_master_only_prevented, str(sandbox_executor_master_only_prevented))
    add_check(checks, "sandbox evidence complete", not sandbox_evidence["missing"], f"missing={len(sandbox_evidence['missing'])}")

    failed = [check for check in checks if not check["passed"]]
    errors = [f"{check['name']}: {check['detail']}" for check in failed]
    report = {
        "schema": "quipsly.audio-workbench.codex-listen-decision-record-sandbox-smoke.v1",
        "generatedAt": generated_at_iso,
        "baselineDir": str(baseline_dir),
        "baselineId": baseline_id,
        "status": "codex-listen-decision-record-sandbox-smoke-passed" if not failed else "codex-listen-decision-record-sandbox-smoke-failed",
        "passed": not failed,
        "checkCount": len(checks),
        "failureCount": len(failed),
        "sandboxDir": str(sandbox_dir),
        "sandboxManifest": str(sandbox_dir / "manifest.json"),
        "sandboxEvidenceSeededCount": len(sandbox_evidence["seeded"]),
        "sandboxEvidenceMissingCount": len(sandbox_evidence["missing"]),
        "sandboxEvidenceMissing": sandbox_evidence["missing"],
        "adapterParsedDecision": adapter_report.get("parsedDecision"),
        "adapterRecorded": bool_value(adapter_report.get("recorded")),
        "adapterPostDecisionRefreshRan": bool_value(adapter_report.get("postDecisionRefreshRan")),
        "adapterPostDecisionRefreshCanonicalScript": adapter_report.get("postDecisionRefreshCanonicalScript"),
        "adapterPostDecisionRefreshUsesCanonicalControlPlane": bool_value(adapter_report.get("postDecisionRefreshUsesCanonicalControlPlane")),
        "realApprovalPreserved": real_approval_preserved,
        "realApprovalStatusBefore": real_before.get("approvalStatus"),
        "realApprovalStatusAfterSmoke": real_after.get("approvalStatus"),
        "realBranchInheritanceReadyAfterSmoke": bool_value(real_after.get("branchInheritanceReady")),
        "realBranchRenderReadyAfterSmoke": bool_value(real_after.get("branchRenderReady")),
        "realSafetyChanged": real_safety_changed,
        "realRenderAttempted": bool_value(real_after.get("renderAttempted")) or bool_value(real_after.get("branchRenderAttempted")),
        "realUploadAttempted": bool_value(real_after.get("uploadAttempted")),
        "realPublicationAttempted": bool_value(real_after.get("publicationAttempted")),
        "realOriginalMediaMutated": bool_value(real_after.get("originalMediaMutated")),
        "sandboxApprovalStatus": sandbox_approval_status,
        "sandboxBranchInheritanceReady": sandbox_branch_inheritance_ready,
        "sandboxBranchRenderReady": sandbox_branch_render_ready,
        "sandboxBranchRenderAudioTruth": sandbox_branch_audio_truth,
        "sandboxMasteredSpineOnlyEditingAllowed": bool_value(sandbox_manifest.get("masteredSpineOnlyEditingAllowed")),
        "sandboxPostListenRefreshPath": post_listen_refresh_path,
        "sandboxPostListenRefreshStatus": sandbox_refresh_status,
        "sandboxPostListenRefreshRouteStatus": sandbox_refresh_route_status,
        "sandboxPostListenRefreshStepFailureCount": sandbox_refresh_step_failures,
        "sandboxPostListenRefreshHardStopCount": sandbox_refresh_hard_stops,
        "sandboxRealBranchRenderCommandsExposed": sandbox_commands_exposed,
        "sandboxExecutorSourceAwareRenderContractReady": bool_value(executor.get("sourceAwareRenderContractReady")),
        "sandboxExecutorWillUseRefinedStems": sandbox_executor_refined_stems,
        "sandboxExecutorMasterOnlyPrevented": sandbox_executor_master_only_prevented,
        "sandboxExecutorStatus": executor.get("status"),
        "checks": checks,
        "errors": errors,
    }

    json_path = baseline_dir / "CODEX_LISTEN_DECISION_RECORD_SANDBOX_SMOKE.json"
    md_path = baseline_dir / "CODEX_LISTEN_DECISION_RECORD_SANDBOX_SMOKE.md"
    html_path = baseline_dir / "CODEX_LISTEN_DECISION_RECORD_SANDBOX_SMOKE.html"
    versioned_json = sandbox_root / "codex-listen-decision-record-sandbox-smoke.json"
    versioned_md = sandbox_root / "codex-listen-decision-record-sandbox-smoke.md"
    versioned_html = sandbox_root / "codex-listen-decision-record-sandbox-smoke.html"
    stable_open = baseline_dir / "OPEN_CODEX_LISTEN_DECISION_RECORD_SANDBOX_SMOKE.command"
    write_json(json_path, report)
    md_path.write_text(render_markdown(report), encoding="utf-8")
    html_path.write_text(render_html(report), encoding="utf-8")
    write_json(versioned_json, report)
    versioned_md.write_text(render_markdown(report), encoding="utf-8")
    versioned_html.write_text(render_html(report), encoding="utf-8")
    write_open_command(stable_open, html_path)

    real_manifest = load_json(manifest_path)
    outputs = real_manifest.setdefault("outputs", {})
    outputs["latestAudioCodexListenDecisionRecordSandboxSmoke"] = str(json_path)
    outputs["latestAudioCodexListenDecisionRecordSandboxSmokeMarkdown"] = str(md_path)
    outputs["latestAudioCodexListenDecisionRecordSandboxSmokeHtml"] = str(html_path)
    outputs["latestAudioCodexListenDecisionRecordSandboxSmokeOpenCommand"] = str(stable_open)
    outputs["latestAudioCodexListenDecisionRecordSandboxSmokeVersioned"] = str(versioned_json)
    history = outputs.setdefault("audioCodexListenDecisionRecordSandboxSmokes", [])
    if str(versioned_json) not in history:
        history.append(str(versioned_json))
    real_manifest["audioCodexListenDecisionRecordSandboxSmokeLatestStatus"] = report["status"]
    real_manifest["audioCodexListenDecisionRecordSandboxSmokePassed"] = report["passed"]
    real_manifest["audioCodexListenDecisionRecordSandboxSmokeCheckCount"] = report["checkCount"]
    real_manifest["audioCodexListenDecisionRecordSandboxSmokeFailureCount"] = report["failureCount"]
    real_manifest["audioCodexListenDecisionRecordSandboxSmokeRealApprovalPreserved"] = real_approval_preserved
    real_manifest["audioCodexListenDecisionRecordSandboxSmokeRealSafetyChanged"] = real_safety_changed
    real_manifest["audioCodexListenDecisionRecordSandboxSmokeAdapterPostDecisionRefreshRan"] = report["adapterPostDecisionRefreshRan"]
    real_manifest["audioCodexListenDecisionRecordSandboxSmokeAdapterPostDecisionRefreshCanonicalScript"] = report["adapterPostDecisionRefreshCanonicalScript"]
    real_manifest["audioCodexListenDecisionRecordSandboxSmokeSandboxBranchInheritanceReady"] = sandbox_branch_inheritance_ready
    real_manifest["audioCodexListenDecisionRecordSandboxSmokeSandboxBranchRenderReady"] = sandbox_branch_render_ready
    real_manifest["audioCodexListenDecisionRecordSandboxSmokeSandboxBranchRenderAudioTruth"] = sandbox_branch_audio_truth
    real_manifest["audioCodexListenDecisionRecordSandboxSmokeSandboxRealBranchRenderCommandsExposed"] = sandbox_commands_exposed
    real_manifest["audioCodexListenDecisionRecordSandboxSmokeSandboxExecutorWillUseRefinedStems"] = sandbox_executor_refined_stems
    real_manifest["audioCodexListenDecisionRecordSandboxSmokeSandboxExecutorMasterOnlyPrevented"] = sandbox_executor_master_only_prevented
    real_manifest["audioCodexListenDecisionRecordSandboxSmokeRealRenderAttempted"] = report["realRenderAttempted"]
    real_manifest["audioCodexListenDecisionRecordSandboxSmokeRealUploadAttempted"] = report["realUploadAttempted"]
    real_manifest["audioCodexListenDecisionRecordSandboxSmokeRealPublicationAttempted"] = report["realPublicationAttempted"]
    real_manifest["audioCodexListenDecisionRecordSandboxSmokeRealOriginalMediaMutated"] = report["realOriginalMediaMutated"]
    write_json(manifest_path, real_manifest)

    print(json.dumps(report, indent=2, sort_keys=True))
    if failed:
        raise SystemExit(1)


if __name__ == "__main__":
    main()
