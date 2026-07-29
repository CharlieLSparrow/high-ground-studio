#!/usr/bin/env python3
"""Refresh the Episode 4 post-listen control plane safely.

This is the small, state-aware follow-up after a guarded human listen decision.
It does not record approval, render episode branches, upload files, publish, or
mutate original media. It only refreshes the source-aware branch gates and the
review/runway reports that decide what is safe next.

Why this exists: after a human listen decision, "run the branch gate, then the
preflight, then the executor, then the router" should be software, not folklore.
"""

from __future__ import annotations

import argparse
import html
import json
import os
import subprocess
import sys
import time
from dataclasses import asdict, dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


APPROVED_STATUSES = {
    "human-approved-for-branch-inheritance",
    "human-approved-for-publication",
    "approved-for-branch-inheritance",
}
FAILED_OR_REPAIR_STATUSES = {
    "failed-human-listen",
    "human-listen-failed",
    "rejected-human-listen",
    "needs-focused-proof",
}
REQUIRED_STEMS = {"charlie", "homer", "clip-source"}
SCRIPT_DIR = Path(__file__).resolve().parent


@dataclass
class StepResult:
    name: str
    command: list[str]
    exitCode: int
    startedAt: str
    finishedAt: str
    durationSeconds: float
    stdoutTail: str
    stderrTail: str

    @property
    def ok(self) -> bool:
        return self.exitCode == 0


@dataclass
class ReadbackCheck:
    name: str
    passed: bool
    expected: Any
    actual: Any
    detail: str
    severity: str = "hard-stop"


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


def repo_root() -> Path:
    return Path(__file__).resolve().parents[3]


def script_path(name: str) -> Path:
    path = SCRIPT_DIR / name
    if not path.exists():
        raise FileNotFoundError(f"Missing script: {path}")
    return path


def safe_slug(value: str) -> str:
    out = "".join(ch.lower() if ch.isalnum() else "-" for ch in str(value))
    while "--" in out:
        out = out.replace("--", "-")
    return out.strip("-") or "audio-baseline"


def shell_quote(value: str) -> str:
    return "'" + value.replace("'", "'\\''") + "'"


def iso_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def timestamp() -> str:
    return datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S")


def tail_text(value: str, limit: int = 2400) -> str:
    if len(value) <= limit:
        return value
    return value[-limit:]


def output_path(value: Any) -> str | None:
    if isinstance(value, str) and value:
        return value
    if isinstance(value, dict):
        for key in (
            "path",
            "jsonPath",
            "markdownPath",
            "htmlPath",
            "openCommand",
            "versionedPath",
            "versionedJsonPath",
            "versionedMarkdownPath",
            "versionedHtmlPath",
        ):
            subvalue = value.get(key)
            if isinstance(subvalue, str) and subvalue:
                return subvalue
    return None


def load_report(path: Path) -> dict[str, Any]:
    if not path.exists():
        return {}
    try:
        return read_json(path)
    except json.JSONDecodeError:
        return {}


def int_value(value: Any) -> int:
    try:
        return int(value)
    except (TypeError, ValueError):
        return 0


def bool_value(value: Any) -> bool:
    return bool(value)


def run_step(name: str, command: list[str], cwd: Path) -> StepResult:
    started = iso_now()
    start_time = time.monotonic()
    proc = subprocess.run(command, cwd=cwd, text=True, capture_output=True)
    finished = iso_now()
    return StepResult(
        name=name,
        command=command,
        exitCode=proc.returncode,
        startedAt=started,
        finishedAt=finished,
        durationSeconds=round(time.monotonic() - start_time, 3),
        stdoutTail=tail_text(proc.stdout),
        stderrTail=tail_text(proc.stderr),
    )


def build_steps(baseline_dir: Path) -> list[tuple[str, list[str]]]:
    py = sys.executable or "python3"
    base = str(baseline_dir)
    return [
        (
            "post-approval render rehearsal",
            [py, str(script_path("audio_workbench_post_approval_render_rehearsal.py")), "--baseline-dir", base],
        ),
        (
            "source-aware branch gate",
            [py, str(script_path("audio_workbench_branch_gate.py")), "--baseline-dir", base],
        ),
        (
            "branch render preflight",
            [py, str(script_path("audio_workbench_branch_render_preflight.py")), "--baseline-dir", base],
        ),
        (
            "approved branch render executor",
            [py, str(script_path("audio_workbench_approved_branch_render_executor.py")), "--baseline-dir", base],
        ),
        (
            "post-listen episode runway",
            [py, str(script_path("audio_workbench_post_listen_episode_runway.py")), "--baseline-dir", base],
        ),
        (
            "post-approval branch runway packet",
            [py, str(script_path("audio_workbench_post_approval_branch_runway_packet.py")), "--baseline-dir", base],
        ),
        (
            "post-listen outcome router",
            [py, str(script_path("audio_workbench_post_listen_outcome_router.py")), "--baseline-dir", base],
        ),
    ]


def add_check(
    checks: list[ReadbackCheck],
    name: str,
    expected: Any,
    actual: Any,
    detail: str,
    *,
    severity: str = "hard-stop",
) -> None:
    checks.append(
        ReadbackCheck(
            name=name,
            passed=expected == actual,
            expected=expected,
            actual=actual,
            detail=detail,
            severity=severity,
        )
    )


def add_condition(
    checks: list[ReadbackCheck],
    name: str,
    passed: bool,
    expected: Any,
    actual: Any,
    detail: str,
    *,
    severity: str = "hard-stop",
) -> None:
    checks.append(
        ReadbackCheck(
            name=name,
            passed=passed,
            expected=expected,
            actual=actual,
            detail=detail,
            severity=severity,
        )
    )


def add_file_check(checks: list[ReadbackCheck], name: str, path: str | None, detail: str) -> None:
    file_exists = bool(path and Path(path).exists() and (not Path(path).is_file() or Path(path).stat().st_size > 0))
    add_condition(checks, name, file_exists, "present non-empty file", path or "missing", detail)


def build_readback_checks(
    manifest_before: dict[str, Any],
    manifest_after: dict[str, Any],
    reports: dict[str, dict[str, Any]],
) -> list[ReadbackCheck]:
    checks: list[ReadbackCheck] = []
    outputs = manifest_after.get("outputs") if isinstance(manifest_after.get("outputs"), dict) else {}
    approval_status = str(manifest_after.get("approvalStatus") or "")
    approved = approval_status in APPROVED_STATUSES
    failed = approval_status in FAILED_OR_REPAIR_STATUSES
    router = reports.get("router") or {}
    router_route = router.get("route") if isinstance(router.get("route"), dict) else {}
    branch_preflight = reports.get("branchPreflight") or {}
    branch_executor = reports.get("branchExecutor") or {}
    post_approval = reports.get("postApproval") or {}
    post_runway = reports.get("postRunway") or {}

    observed_roles = set(str(role) for role in (branch_executor.get("sourceAwareAudioRoleIds") or []))
    if not observed_roles:
        observed_roles = set(str(role) for role in (post_approval.get("sourceAwareAudioRoleIds") or []))

    add_check(checks, "approval-state-preserved-by-refresh", manifest_before.get("approvalStatus"), manifest_after.get("approvalStatus"), "refresh must not record or change the human decision")
    add_check(checks, "branch-audio-truth", "source-aware-refined-stems", manifest_after.get("branchRenderAudioTruth"), "branches must inherit Charlie/Homer/clip-source refined stems")
    add_check(checks, "mastered-spine-only-forbidden", False, bool_value(manifest_after.get("masteredSpineOnlyEditingAllowed")), "flat mastered WAV is not editable branch truth")
    add_condition(checks, "source-aware-role-coverage", REQUIRED_STEMS.issubset(observed_roles), sorted(REQUIRED_STEMS), sorted(observed_roles), "source-aware branch path must see Charlie, Homer, and clip/source stems")
    add_check(checks, "branch-gate-source-aware-contract", "ready-source-aware-branch-inheritance", manifest_after.get("branchInheritanceGateSourceAwareBranchContractStatus"), "branch gate source-aware contract")
    add_check(checks, "branch-gate-source-aware-ready", True, bool_value(manifest_after.get("branchInheritanceGateSourceAwareBranchContractReady")), "branch gate proves source-aware branch inheritance substrate")
    add_check(checks, "branch-gate-timing-hard-stops", 0, int_value(manifest_after.get("branchInheritanceGateSourceAwareTimingContractHardStopCount")), "source-aware timing must not have hard stops")
    add_check(checks, "post-approval-source-aware-status", "ready-source-aware-editable", manifest_after.get("branchInheritanceGatePostApprovalSourceAwareAudioContractStatus"), "conversation flow edits need editable source-aware stems")
    add_check(checks, "post-approval-master-only-forbidden", False, bool_value(manifest_after.get("branchInheritanceGatePostApprovalMasteredSpineOnlyEditingAllowed")), "post-approval branch path must reject flat-master-only editing")
    add_check(checks, "branch-preflight-audio-truth", "source-aware-refined-stems", branch_preflight.get("branchRenderAudioTruth"), "branch preflight audio truth")
    add_check(checks, "branch-preflight-mastered-only-output", False, bool_value(branch_preflight.get("branchAudioRenderedFromMasteredSpineOnly")), "branch preflight must not plan flattened-master branch audio")
    add_check(checks, "branch-preflight-source-aware-ready", True, bool_value(branch_preflight.get("sourceAwareAudioTruthReady")), "branch preflight sees source-aware stem/timing readiness")
    add_check(checks, "branch-preflight-branch-audio-plan-status", "ready-source-aware-refined-stem-plan", branch_preflight.get("branchAudioPlanStatus"), "branch preflight must have a ready source-aware refined-stem audio plan")
    add_condition(checks, "branch-preflight-branch-audio-plan-stem-count", int_value(branch_preflight.get("branchAudioPlanSelectedRefinedStemCount")) >= 3, ">=3 refined stems", branch_preflight.get("branchAudioPlanSelectedRefinedStemCount"), "branch preflight must select Charlie/Homer/clip-source refined stems")
    add_check(checks, "branch-preflight-branch-audio-plan-missing-roles", [], sorted(str(role) for role in (branch_preflight.get("branchAudioPlanMissingRoleIds") or [])), "branch preflight must not be missing source-aware audio roles")
    add_check(checks, "branch-preflight-branch-audio-plan-missing-paths", 0, int_value(branch_preflight.get("branchAudioPlanMissingStemPathCount")), "branch preflight must not be missing refined stem paths")
    add_check(checks, "branch-preflight-will-use-refined-stems", True, bool_value(branch_preflight.get("sourceAwareBranchRenderWillUseRefinedStems")), "branch preflight must promise to use refined stems after approval")
    add_check(checks, "branch-preflight-stem-paths-proved", True, bool_value(branch_preflight.get("sourceAwareBranchRenderStemPathsProved")), "branch preflight must prove refined stem paths exist")
    add_check(checks, "branch-executor-audio-truth", "source-aware-refined-stems", branch_executor.get("branchRenderAudioTruth"), "approved branch executor audio truth")
    add_check(checks, "branch-executor-master-only-forbidden", False, bool_value(branch_executor.get("masteredSpineOnlyEditingAllowed")), "executor must reject flat-master-only editing")
    add_check(checks, "branch-executor-branch-audio-plan-status", "ready-source-aware-refined-stem-plan", branch_executor.get("branchAudioPlanStatus"), "approved executor must have a ready source-aware refined-stem audio plan")
    add_condition(checks, "branch-executor-branch-audio-plan-stem-count", int_value(branch_executor.get("branchAudioPlanSelectedRefinedStemCount")) >= 3, ">=3 refined stems", branch_executor.get("branchAudioPlanSelectedRefinedStemCount"), "approved executor must select Charlie/Homer/clip-source refined stems")
    add_check(checks, "branch-executor-branch-audio-plan-missing-roles", [], sorted(str(role) for role in (branch_executor.get("branchAudioPlanMissingRoleIds") or [])), "approved executor must not be missing source-aware audio roles")
    add_check(checks, "branch-executor-branch-audio-plan-missing-paths", 0, int_value(branch_executor.get("branchAudioPlanMissingStemPathCount")), "approved executor must not be missing refined stem paths")
    add_check(checks, "branch-executor-will-use-refined-stems", True, bool_value(branch_executor.get("sourceAwareBranchRenderWillUseRefinedStems")), "approved executor must use refined stems for branch audio after approval")
    add_check(checks, "branch-executor-stem-paths-proved", True, bool_value(branch_executor.get("sourceAwareBranchRenderStemPathsProved")), "approved executor must prove refined stem paths exist")
    add_check(checks, "post-listen-router-audio-truth", "source-aware-refined-stems", router_route.get("branchRenderAudioTruth"), "post-listen router audio truth")
    add_check(checks, "post-listen-router-master-only-forbidden", False, bool_value(router_route.get("masteredSpineOnlyEditingAllowed")), "router must reject flat-master-only editing")
    add_check(checks, "post-runway-final-episode-gate-known", True, bool(post_runway.get("finalEpisodeGate") or manifest_after.get("audioPostListenEpisodeRunwayFinalEpisodeGateStatus")), "post-listen runway should report final episode gate")

    if not approved and not failed:
        add_check(checks, "pending-approval-status", "machine-candidate-needs-human-listen-proof", approval_status, "real v006 should still be waiting for Charlie's listen unless he records a decision")
        add_check(checks, "pending-branch-inheritance-locked", False, bool_value(manifest_after.get("branchInheritanceReady")), "branch inheritance remains locked before human listen approval")
        add_check(checks, "pending-branch-render-locked", False, bool_value(manifest_after.get("branchRenderReady")), "branch rendering remains locked before human listen approval")
        add_check(checks, "pending-render-commands-hidden", False, bool_value(branch_executor.get("commandsExposed")), "executor must hide render commands before approval")
        add_check(checks, "pending-router-waits", "waiting-for-human-listen", router_route.get("routeStatus"), "router should still point to human listen")
    elif approved:
        add_check(checks, "approved-branch-inheritance-ready", True, bool_value(manifest_after.get("branchInheritanceReady")), "approval should let the source-aware branch gate unlock inheritance if source proof remains ready", severity="warning")
        add_condition(checks, "approved-router-route-actionable", router_route.get("routeStatus") in {"approved-ready-for-branch-render", "approved-refresh-branch-preflight", "approved-refresh-source-aware-branch-gate", "approved-source-aware-gate-blocked"}, True, router_route.get("routeStatus"), "approved route should name the next gate instead of returning to human listen")
    elif failed:
        add_check(checks, "failed-router-routes-repair", "repair-needed-after-human-listen", router_route.get("routeStatus"), "failed/needs-proof listen should route toward scoped v007 proof or repair")
        add_check(checks, "failed-branch-render-locked", False, bool_value(manifest_after.get("branchRenderReady")), "failed audio cannot unlock branch rendering")

    for key in (
        "approvedBranchRenderExecutorRenderAttempted",
        "approvedBranchRenderExecutorUploadAttempted",
        "approvedBranchRenderExecutorPublicationAttempted",
        "approvedBranchRenderExecutorOriginalMediaMutated",
        "audioPostListenEpisodeRunwayRenderAttempted",
        "audioPostListenEpisodeRunwayUploadAttempted",
        "audioPostListenEpisodeRunwayPublicationAttempted",
        "audioPostListenEpisodeRunwayOriginalMediaMutated",
        "audioPostApprovalRenderRehearsalRenderAttempted",
        "audioPostApprovalRenderRehearsalBranchRenderAttempted",
        "audioPostApprovalRenderRehearsalUploadAttempted",
        "audioPostApprovalRenderRehearsalPublicationAttempted",
        "audioPostApprovalRenderRehearsalOriginalMediaMutated",
        "branchRenderPreflightRenderExecuted",
        "branchRenderPreflightOriginalMediaMutated",
        "audioPostListenOutcomeRouterRenderAttempted",
        "audioPostListenOutcomeRouterOriginalMediaMutated",
    ):
        add_check(checks, f"safety-{key}", False, bool_value(manifest_after.get(key)), "post-listen refresh must stay non-rendering/non-publishing")

    for key, name in (
        ("latestAudioPostApprovalRenderRehearsalHtml", "post-approval rehearsal html"),
        ("branchRenderPreflightHtml", "branch preflight html"),
        ("latestApprovedBranchRenderExecutorMarkdown", "approved executor markdown"),
        ("latestAudioPostListenEpisodeRunwayHtml", "post-listen runway html"),
        ("latestAudioPostApprovalBranchRunwayPacketHtml", "post-approval branch runway html"),
        ("latestAudioPostListenOutcomeRouterHtml", "post-listen router html"),
    ):
        add_file_check(checks, f"artifact-{key}", output_path(outputs.get(key)), name)

    return checks


def determine_status(manifest_after: dict[str, Any], router: dict[str, Any], checks: list[ReadbackCheck], step_failures: int) -> tuple[str, str]:
    approval_status = str(manifest_after.get("approvalStatus") or "")
    route = router.get("route") if isinstance(router.get("route"), dict) else {}
    hard_failures = [check for check in checks if not check.passed and check.severity == "hard-stop"]

    if step_failures or hard_failures:
        return ("post-listen-refresh-needs-attention", "Inspect the failed refresh step or hard-stop readback before recording or rendering anything else.")
    if approval_status in FAILED_OR_REPAIR_STATUSES:
        return ("post-listen-refresh-repair-path-ready", "Use the human-listen issue notes to create a scoped v007 proof or repair candidate without overwriting v006.")
    if approval_status in APPROVED_STATUSES and bool(manifest_after.get("branchRenderReady")) and bool(route.get("sourceAwareBranchGateReady")):
        return ("post-listen-refresh-approved-branch-render-ready", "Approved audio has refreshed through source-aware branch gate and preflight. Use the guarded executor before rendering local candidates.")
    if approval_status in APPROVED_STATUSES:
        return ("post-listen-refresh-approved-still-gated", "Approval is recorded, but one or more source-aware/preflight gates still need attention before branch rendering.")
    return ("post-listen-refresh-waiting-for-human-listen", "Charlie still needs to listen to v006 and record pass, fail, or needs-proof through the guarded decision path.")


def render_markdown(report: dict[str, Any]) -> str:
    lines = [
        f"# Post-listen refresh: {report['baselineId']}",
        "",
        f"Generated: `{report['generatedAt']}`",
        "",
        "This refresh recomputes the post-listen source-aware branch gates. It does not approve audio, render media, upload, publish, or mutate original sources.",
        "",
        "## Verdict",
        "",
        f"- Status: `{report['status']}`",
        f"- Approval status: `{report['approvalStatus']}`",
        f"- Route status: `{report['routeStatus']}`",
        f"- Step failures: `{report['stepFailureCount']}`",
        f"- Hard-stop readback failures: `{report['hardStopCount']}`",
        f"- Warnings: `{report['warningCount']}`",
        f"- Branch inheritance ready: `{str(report['branchInheritanceReady']).lower()}`",
        f"- Branch render ready: `{str(report['branchRenderReady']).lower()}`",
        f"- Branch render audio truth: `{report['branchRenderAudioTruth']}`",
        f"- Mastered-spine-only editing allowed: `{str(report['masteredSpineOnlyEditingAllowed']).lower()}`",
        f"- Render attempted: `{str(report['renderAttempted']).lower()}`",
        f"- Upload attempted: `{str(report['uploadAttempted']).lower()}`",
        f"- Publication attempted: `{str(report['publicationAttempted']).lower()}`",
        f"- Original media mutated: `{str(report['originalMediaMutated']).lower()}`",
        "",
        "## Next safest action",
        "",
        report["nextSafestAction"],
        "",
        "## Steps",
        "",
        "| Step | Exit | Seconds |",
        "|---|---:|---:|",
    ]
    for step in report["steps"]:
        lines.append(f"| {step['name']} | {step['exitCode']} | {step['durationSeconds']} |")
    lines.extend(["", "## Readback checks", "", "| Check | Status | Expected | Actual | Detail |", "|---|---|---|---|---|"])
    for check in report["checks"]:
        status = "pass" if check["passed"] else check["severity"]
        lines.append(f"| {check['name']} | {status} | `{check['expected']}` | `{check['actual']}` | {check['detail']} |")
    if report["failedChecks"]:
        lines.extend(["", "## Failed checks", ""])
        lines.extend(f"- `{item['name']}`: expected `{item['expected']}`, got `{item['actual']}`" for item in report["failedChecks"])
    lines.extend(["", "## Suggested validation", "", "```bash", *report["suggestedValidationCommands"], "```", ""])
    return "\n".join(lines)


def render_html(report: dict[str, Any]) -> str:
    step_rows = "\n".join(f"<tr><td>{html.escape(step['name'])}</td><td>{step['exitCode']}</td><td>{step['durationSeconds']}</td></tr>" for step in report["steps"])
    check_rows = "\n".join(f"<tr class=\"{'ok' if check['passed'] else 'bad'}\"><td>{html.escape(check['name'])}</td><td>{'pass' if check['passed'] else html.escape(check['severity'])}</td><td>{html.escape(str(check['actual']))}</td><td>{html.escape(check['detail'])}</td></tr>" for check in report["checks"])
    validation = "\n".join(html.escape(command) for command in report["suggestedValidationCommands"])
    return f"""<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Episode 4 Post-Listen Refresh</title>
  <style>
    :root {{ --ink: #33271d; --muted: #796b59; --paper: #fff8ea; --panel: #fffdf7; --line: #e5d4aa; --moss: #3f6f4f; --gold: #c7922b; --clay: #a84333; }}
    body {{ margin: 0; font-family: ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; background: radial-gradient(circle at top left, rgba(199, 146, 43, .22), transparent 32rem), radial-gradient(circle at bottom right, rgba(63, 111, 79, .18), transparent 28rem), var(--paper); color: var(--ink); line-height: 1.5; }}
    main {{ max-width: 1120px; margin: 0 auto; padding: 42px 22px 80px; }}
    .hero, section {{ border: 1px solid var(--line); border-radius: 28px; background: rgba(255, 253, 247, .9); box-shadow: 0 18px 45px rgba(63, 43, 18, .12); padding: 28px; margin-bottom: 20px; }}
    .kicker {{ color: var(--gold); letter-spacing: .22em; text-transform: uppercase; font-weight: 900; font-size: 12px; }}
    h1 {{ margin: 8px 0 10px; font-family: Georgia, "Times New Roman", serif; font-size: clamp(36px, 6vw, 64px); line-height: .98; }}
    h2 {{ margin: 0 0 12px; font-family: Georgia, "Times New Roman", serif; }}
    .grid {{ display: grid; grid-template-columns: repeat(auto-fit, minmax(190px, 1fr)); gap: 12px; margin-top: 18px; }}
    .metric {{ border: 1px solid var(--line); border-radius: 17px; padding: 14px; background: #fffaf1; }}
    .metric strong {{ display:block; color: var(--muted); text-transform: uppercase; letter-spacing: .1em; font-size: 11px; }}
    .metric span {{ display:block; margin-top: 5px; font-weight: 850; }}
    table {{ width: 100%; border-collapse: collapse; font-size: 14px; }} th, td {{ text-align: left; border-bottom: 1px solid var(--line); padding: 10px 8px; vertical-align: top; }}
    tr.ok td:first-child::before {{ content: "pass "; color: var(--moss); font-weight: 900; }} tr.bad td:first-child::before {{ content: "check "; color: var(--clay); font-weight: 900; }}
    pre {{ white-space: pre-wrap; padding: 16px; border-radius: 16px; background: #241d17; color: #fff3d5; }}
  </style>
</head>
<body>
  <main>
    <div class="hero">
      <div class="kicker">Quipsly Audio Workbench</div>
      <h1>Post-listen refresh</h1>
      <p>This page recomputes the source-aware branch gates after the v006 listen decision. It is safe to run before approval; it will simply keep the branch runway locked.</p>
      <div class="grid">
        <div class="metric"><strong>Status</strong><span>{html.escape(report['status'])}</span></div>
        <div class="metric"><strong>Approval</strong><span>{html.escape(report['approvalStatus'])}</span></div>
        <div class="metric"><strong>Route</strong><span>{html.escape(report['routeStatus'])}</span></div>
        <div class="metric"><strong>Hard stops</strong><span>{report['hardStopCount']}</span></div>
        <div class="metric"><strong>Branch inheritance</strong><span>{str(report['branchInheritanceReady']).lower()}</span></div>
        <div class="metric"><strong>Branch render</strong><span>{str(report['branchRenderReady']).lower()}</span></div>
        <div class="metric"><strong>Audio truth</strong><span>{html.escape(report['branchRenderAudioTruth'])}</span></div>
        <div class="metric"><strong>Render attempted</strong><span>{str(report['renderAttempted']).lower()}</span></div>
      </div>
      <p><strong>Next safest action:</strong> {html.escape(report['nextSafestAction'])}</p>
    </div>
    <section><h2>Refresh steps</h2><table><tbody>{step_rows}</tbody></table></section>
    <section><h2>Readback checks</h2><table><tbody>{check_rows}</tbody></table></section>
    <section><h2>Suggested validation</h2><pre>{validation}</pre></section>
  </main>
</body>
</html>
"""


def write_open_command(path: Path, target: Path) -> None:
    path.write_text("#!/bin/zsh\nopen " + shell_quote(str(target)) + "\n", encoding="utf-8")
    os.chmod(path, 0o755)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--baseline-dir", required=True, type=Path)
    args = parser.parse_args()

    baseline_dir = resolve_baseline_dir(args.baseline_dir)
    manifest_path = baseline_dir / "manifest.json"
    manifest_before = read_json(manifest_path)
    root = repo_root()
    generated_at = timestamp()
    baseline_id = str(manifest_before.get("baselineId") or baseline_dir.name)
    slug = safe_slug(baseline_id.replace("episode-4-conformed-production-baseline-", ""))

    steps = [run_step(name, command, root) for name, command in build_steps(baseline_dir)]
    manifest_after = read_json(manifest_path)
    outputs = manifest_after.setdefault("outputs", {})
    reports = {
        "postApproval": load_report(baseline_dir / "EPISODE_4_POST_APPROVAL_RENDER_REHEARSAL.json"),
        "branchGate": load_report(baseline_dir / "BRANCH_INHERITANCE_GATE.json"),
        "branchPreflight": load_report(baseline_dir / "BRANCH_RENDER_PREFLIGHT.json"),
        "branchExecutor": load_report(Path(output_path(outputs.get("latestApprovedBranchRenderExecutor")) or "")),
        "postRunway": load_report(Path(output_path(outputs.get("latestAudioPostListenEpisodeRunway")) or "")),
        "branchRunway": load_report(Path(output_path(outputs.get("latestAudioPostApprovalBranchRunwayPacket")) or "")),
        "router": load_report(baseline_dir / "POST_LISTEN_OUTCOME_ROUTER.json"),
    }
    checks = build_readback_checks(manifest_before, manifest_after, reports)
    step_failures = [step for step in steps if not step.ok]
    hard_stops = [check for check in checks if not check.passed and check.severity == "hard-stop"]
    warnings = [check for check in checks if not check.passed and check.severity != "hard-stop"]
    router = reports.get("router") or {}
    router_route = router.get("route") if isinstance(router.get("route"), dict) else {}
    branch_preflight = reports.get("branchPreflight") or {}
    branch_executor = reports.get("branchExecutor") or {}
    status, next_action = determine_status(manifest_after, router, checks, len(step_failures))

    validation_commands = [
        f"python3 apps/QuipslyStudio/script/audio_workbench_post_listen_refresh.py --baseline-dir {shell_quote(str(baseline_dir))}",
        f"python3 apps/QuipslyStudio/script/audio_workbench_fast_readback_check.py --baseline-dir {shell_quote(str(baseline_dir))}",
        f"python3 apps/QuipslyStudio/script/audio_workbench_manifest_readback_consistency_smoke.py --baseline-dir {shell_quote(str(baseline_dir))}",
    ]
    report = {
        "schema": "quipsly.audio-workbench.post-listen-refresh.v1",
        "generatedAt": generated_at,
        "baselineDir": str(baseline_dir),
        "baselineId": baseline_id,
        "status": status,
        "nextSafestAction": next_action,
        "approvalStatus": str(manifest_after.get("approvalStatus") or ""),
        "routeStatus": str(router_route.get("routeStatus") or ""),
        "stepCount": len(steps),
        "stepFailureCount": len(step_failures),
        "checkCount": len(checks),
        "hardStopCount": len(hard_stops),
        "warningCount": len(warnings),
        "branchInheritanceReady": bool(manifest_after.get("branchInheritanceReady")),
        "branchRenderReady": bool(manifest_after.get("branchRenderReady")),
        "branchRenderAudioTruth": str(manifest_after.get("branchRenderAudioTruth") or ""),
        "masteredSpineOnlyEditingAllowed": bool(manifest_after.get("masteredSpineOnlyEditingAllowed")),
        "sourceAwareStemReadyCount": int_value(manifest_after.get("branchInheritanceGateSourceAwareStemReadyCount")),
        "sourceAwareStemResolvedCount": int_value(manifest_after.get("branchInheritanceGateSourceAwareStemResolvedCount")),
        "sourceAwareTimingReady": bool(manifest_after.get("branchInheritanceGateSourceAwareTimingContractReady")),
        "sourceAwareTimingHardStopCount": int_value(manifest_after.get("branchInheritanceGateSourceAwareTimingContractHardStopCount")),
        "branchPreflightBranchAudioPlanStatus": branch_preflight.get("branchAudioPlanStatus"),
        "branchPreflightBranchAudioPlanSelectedRefinedStemCount": int_value(branch_preflight.get("branchAudioPlanSelectedRefinedStemCount")),
        "branchPreflightBranchAudioPlanSelectedRefinedStems": branch_preflight.get("branchAudioPlanSelectedRefinedStems") or [],
        "branchPreflightBranchAudioPlanMissingRoleIds": branch_preflight.get("branchAudioPlanMissingRoleIds") or [],
        "branchPreflightBranchAudioPlanMissingStemPathCount": int_value(branch_preflight.get("branchAudioPlanMissingStemPathCount")),
        "branchPreflightSourceAwareBranchRenderWillUseRefinedStems": bool_value(branch_preflight.get("sourceAwareBranchRenderWillUseRefinedStems")),
        "branchPreflightSourceAwareBranchRenderStemPathsProved": bool_value(branch_preflight.get("sourceAwareBranchRenderStemPathsProved")),
        "branchExecutorBranchAudioPlanStatus": branch_executor.get("branchAudioPlanStatus"),
        "branchExecutorBranchAudioPlanSelectedRefinedStemCount": int_value(branch_executor.get("branchAudioPlanSelectedRefinedStemCount")),
        "branchExecutorBranchAudioPlanSelectedRefinedStems": branch_executor.get("branchAudioPlanSelectedRefinedStems") or [],
        "branchExecutorBranchAudioPlanMissingRoleIds": branch_executor.get("branchAudioPlanMissingRoleIds") or [],
        "branchExecutorBranchAudioPlanMissingStemPathCount": int_value(branch_executor.get("branchAudioPlanMissingStemPathCount")),
        "branchExecutorSourceAwareBranchRenderWillUseRefinedStems": bool_value(branch_executor.get("sourceAwareBranchRenderWillUseRefinedStems")),
        "branchExecutorSourceAwareBranchRenderStemPathsProved": bool_value(branch_executor.get("sourceAwareBranchRenderStemPathsProved")),
        "branchExecutorSourceAwareBranchRenderExpectedMixOutputName": branch_executor.get("sourceAwareBranchRenderExpectedMixOutputName"),
        "approvalStateChanged": manifest_before.get("approvalStatus") != manifest_after.get("approvalStatus"),
        "branchStateChanged": bool(manifest_before.get("branchInheritanceReady")) != bool(manifest_after.get("branchInheritanceReady")) or bool(manifest_before.get("branchRenderReady")) != bool(manifest_after.get("branchRenderReady")),
        "renderAttempted": False,
        "uploadAttempted": False,
        "publicationAttempted": False,
        "originalMediaMutated": False,
        "realBranchRenderCommandsExposed": bool(router.get("realBranchRenderCommandsExposed")),
        "steps": [asdict(step) for step in steps],
        "checks": [asdict(check) for check in checks],
        "failedChecks": [asdict(check) for check in checks if not check.passed],
        "suggestedValidationCommands": validation_commands,
    }

    output_json = baseline_dir / f"audio-post-listen-refresh-{slug}-{generated_at}.json"
    output_md = baseline_dir / f"audio-post-listen-refresh-{slug}-{generated_at}.md"
    output_html = baseline_dir / f"audio-post-listen-refresh-{slug}-{generated_at}.html"
    stable_json = baseline_dir / "POST_LISTEN_REFRESH.json"
    stable_md = baseline_dir / "POST_LISTEN_REFRESH.md"
    stable_html = baseline_dir / "POST_LISTEN_REFRESH.html"
    stable_open = baseline_dir / "OPEN_POST_LISTEN_REFRESH.command"

    write_json(output_json, report)
    output_md.write_text(render_markdown(report) + "\n", encoding="utf-8")
    output_html.write_text(render_html(report), encoding="utf-8")
    write_json(stable_json, report)
    stable_md.write_text(render_markdown(report) + "\n", encoding="utf-8")
    stable_html.write_text(render_html(report), encoding="utf-8")
    write_open_command(stable_open, stable_html)

    manifest_final = read_json(manifest_path)
    outputs = manifest_final.setdefault("outputs", {})
    outputs["latestAudioPostListenRefresh"] = str(output_json)
    outputs["latestAudioPostListenRefreshMarkdown"] = str(output_md)
    outputs["latestAudioPostListenRefreshHtml"] = str(output_html)
    outputs["latestAudioPostListenRefreshStableJson"] = str(stable_json)
    outputs["latestAudioPostListenRefreshStableMarkdown"] = str(stable_md)
    outputs["latestAudioPostListenRefreshStableHtml"] = str(stable_html)
    outputs["latestAudioPostListenRefreshOpenCommand"] = str(stable_open)
    history = outputs.setdefault("audioPostListenRefreshes", [])
    if str(output_json) not in history:
        history.append(str(output_json))
    manifest_final["audioPostListenRefreshLatestStatus"] = status
    manifest_final["audioPostListenRefreshGeneratedAt"] = generated_at
    manifest_final["audioPostListenRefreshCount"] = len(history)
    manifest_final["audioPostListenRefreshStepCount"] = len(steps)
    manifest_final["audioPostListenRefreshStepFailureCount"] = len(step_failures)
    manifest_final["audioPostListenRefreshCheckCount"] = len(checks)
    manifest_final["audioPostListenRefreshHardStopCount"] = len(hard_stops)
    manifest_final["audioPostListenRefreshWarningCount"] = len(warnings)
    manifest_final["audioPostListenRefreshApprovalStatus"] = report["approvalStatus"]
    manifest_final["audioPostListenRefreshRouteStatus"] = report["routeStatus"]
    manifest_final["audioPostListenRefreshBranchInheritanceReady"] = report["branchInheritanceReady"]
    manifest_final["audioPostListenRefreshBranchRenderReady"] = report["branchRenderReady"]
    manifest_final["audioPostListenRefreshBranchRenderAudioTruth"] = report["branchRenderAudioTruth"]
    manifest_final["audioPostListenRefreshMasteredSpineOnlyEditingAllowed"] = report["masteredSpineOnlyEditingAllowed"]
    manifest_final["audioPostListenRefreshSourceAwareStemReadyCount"] = report["sourceAwareStemReadyCount"]
    manifest_final["audioPostListenRefreshSourceAwareStemResolvedCount"] = report["sourceAwareStemResolvedCount"]
    manifest_final["audioPostListenRefreshSourceAwareTimingReady"] = report["sourceAwareTimingReady"]
    manifest_final["audioPostListenRefreshSourceAwareTimingHardStopCount"] = report["sourceAwareTimingHardStopCount"]
    manifest_final["audioPostListenRefreshBranchPreflightBranchAudioPlanStatus"] = report["branchPreflightBranchAudioPlanStatus"]
    manifest_final["audioPostListenRefreshBranchPreflightBranchAudioPlanSelectedRefinedStemCount"] = report["branchPreflightBranchAudioPlanSelectedRefinedStemCount"]
    manifest_final["audioPostListenRefreshBranchPreflightBranchAudioPlanSelectedRefinedStems"] = report["branchPreflightBranchAudioPlanSelectedRefinedStems"]
    manifest_final["audioPostListenRefreshBranchPreflightBranchAudioPlanMissingRoleIds"] = report["branchPreflightBranchAudioPlanMissingRoleIds"]
    manifest_final["audioPostListenRefreshBranchPreflightBranchAudioPlanMissingStemPathCount"] = report["branchPreflightBranchAudioPlanMissingStemPathCount"]
    manifest_final["audioPostListenRefreshBranchPreflightSourceAwareBranchRenderWillUseRefinedStems"] = report["branchPreflightSourceAwareBranchRenderWillUseRefinedStems"]
    manifest_final["audioPostListenRefreshBranchPreflightSourceAwareBranchRenderStemPathsProved"] = report["branchPreflightSourceAwareBranchRenderStemPathsProved"]
    manifest_final["audioPostListenRefreshBranchExecutorBranchAudioPlanStatus"] = report["branchExecutorBranchAudioPlanStatus"]
    manifest_final["audioPostListenRefreshBranchExecutorBranchAudioPlanSelectedRefinedStemCount"] = report["branchExecutorBranchAudioPlanSelectedRefinedStemCount"]
    manifest_final["audioPostListenRefreshBranchExecutorBranchAudioPlanSelectedRefinedStems"] = report["branchExecutorBranchAudioPlanSelectedRefinedStems"]
    manifest_final["audioPostListenRefreshBranchExecutorBranchAudioPlanMissingRoleIds"] = report["branchExecutorBranchAudioPlanMissingRoleIds"]
    manifest_final["audioPostListenRefreshBranchExecutorBranchAudioPlanMissingStemPathCount"] = report["branchExecutorBranchAudioPlanMissingStemPathCount"]
    manifest_final["audioPostListenRefreshBranchExecutorSourceAwareBranchRenderWillUseRefinedStems"] = report["branchExecutorSourceAwareBranchRenderWillUseRefinedStems"]
    manifest_final["audioPostListenRefreshBranchExecutorSourceAwareBranchRenderStemPathsProved"] = report["branchExecutorSourceAwareBranchRenderStemPathsProved"]
    manifest_final["audioPostListenRefreshBranchExecutorSourceAwareBranchRenderExpectedMixOutputName"] = report["branchExecutorSourceAwareBranchRenderExpectedMixOutputName"]
    manifest_final["audioPostListenRefreshApprovalStateChanged"] = report["approvalStateChanged"]
    manifest_final["audioPostListenRefreshBranchStateChanged"] = report["branchStateChanged"]
    manifest_final["audioPostListenRefreshRenderAttempted"] = False
    manifest_final["audioPostListenRefreshUploadAttempted"] = False
    manifest_final["audioPostListenRefreshPublicationAttempted"] = False
    manifest_final["audioPostListenRefreshOriginalMediaMutated"] = False
    manifest_final["audioPostListenRefreshRealBranchRenderCommandsExposed"] = report["realBranchRenderCommandsExposed"]
    manifest_final["audioPostListenRefreshOpenCommandPresent"] = stable_open.exists()
    manifest_final["audioPostListenRefreshHtmlPresent"] = output_html.exists() and stable_html.exists()
    manifest_final["audioPostListenRefreshNextSafestAction"] = next_action
    write_json(manifest_path, manifest_final)

    print(f"Wrote {output_md}")
    print(f"Wrote {output_json}")
    print(f"Wrote {output_html}")
    print(f"Wrote {stable_open}")
    print(f"Status: {status}")
    print(f"Steps: {len(steps)}; failures: {len(step_failures)}")
    print(f"Checks: {len(checks)}; hard stops: {len(hard_stops)}; warnings: {len(warnings)}")
    print(f"Render attempted: {report['renderAttempted']}")


if __name__ == "__main__":
    main()
