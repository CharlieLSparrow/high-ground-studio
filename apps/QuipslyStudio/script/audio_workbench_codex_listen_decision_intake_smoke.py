#!/usr/bin/env python3
"""Smoke-test Codex plain-language listen decision intake without approving audio.

This proves the path Charlie is likely to use in chat stays safe:

    Approve v006 audio spine
    Needs proof around 57:10
    Fail, echo at 34:22

The smoke never records a real decision. It dry-runs valid paths, verifies
ambiguous/unsafe paths fail, and checks the real baseline remains locked. The
important invariant is that approval language still proves source-aware branch
readiness: Charlie, Homer, and clip/source refined stems on one sequence clock.
The mastered spine is not allowed to become the editable branch truth.
"""

from __future__ import annotations

import argparse
import json
import subprocess
import sys
from datetime import datetime, timezone
from html import escape
from pathlib import Path
from typing import Any


APPROVE_STATUS = "human-approved-for-branch-inheritance"
NEEDS_PROOF_STATUS = "needs-focused-proof"
FAIL_STATUS = "failed-human-listen"
PENDING_STATUS = "machine-candidate-needs-human-listen-proof"
LOCKED_GATE = "locked-until-audio-spine-approved"
REQUIRED_ROLES = 3
POST_DECISION_REFRESH_SCRIPT = "audio_workbench_post_listen_refresh.py"

CORE_TRUTH_KEYS = [
    "approvalStatus",
    "packageReadyForHumanListen",
    "branchInheritanceReady",
    "branchRenderReady",
    "branchReadinessRefreshRequired",
    "branchReadinessRequiresSourceAwareGate",
    "branchRenderAudioTruth",
    "masteredSpineOnlyEditingAllowed",
    "finalEpisodeGateStatus",
    "shortsGateStatus",
    "renderAttempted",
    "branchRenderAttempted",
    "uploadAttempted",
    "publicationAttempted",
    "originalMediaMutated",
]


VALID_CASES = [
    {
        "name": "approve-plain-language-dry-run",
        "utterance": "Approve v006 audio spine",
        "parsedDecision": "approve",
        "decisionStatus": APPROVE_STATUS,
        "expectedRecorderPreflightStatus": "source-aware-approval-preflight-passed",
    },
    {
        "name": "needs-proof-plain-language-dry-run",
        "utterance": "Needs proof around 57:10 where the ASR risk was called out",
        "parsedDecision": "needs-proof",
        "decisionStatus": NEEDS_PROOF_STATUS,
        "expectedRecorderPreflightStatus": "not-required-for-non-approval-decision",
    },
    {
        "name": "fail-plain-language-dry-run",
        "utterance": "Fail, Charlie echo at 34:22 needs repair",
        "parsedDecision": "fail",
        "decisionStatus": FAIL_STATUS,
        "expectedRecorderPreflightStatus": "not-required-for-non-approval-decision",
    },
]

INVALID_CASES = [
    {
        "name": "ambiguous-approve-plus-proof-refused",
        "utterance": "Approve v006 audio spine but needs proof around 57:10",
        "extraArgs": [],
        "expectedErrorFragment": "Ambiguous listen decision",
    },
    {
        "name": "record-without-human-confirmation-refused",
        "utterance": "Approve v006 audio spine",
        "extraArgs": ["--record"],
        "expectedErrorFragment": "Real recording requires --confirm-human-listened",
    },
]


def repo_root() -> Path:
    return Path(__file__).resolve().parents[3]


def read_json(path: Path) -> dict[str, Any]:
    return json.loads(path.read_text(encoding="utf-8"))


def write_json(path: Path, payload: dict[str, Any]) -> None:
    path.write_text(json.dumps(payload, indent=2, sort_keys=True) + "\n", encoding="utf-8")


def bool_value(value: Any) -> bool:
    return value is True or str(value).strip().lower() == "true"


def int_value(value: Any) -> int:
    try:
        return int(value)
    except (TypeError, ValueError):
        return 0


def resolve_baseline_dir(input_path: Path) -> Path:
    expanded = input_path.expanduser().resolve()
    if (expanded / "manifest.json").exists():
        return expanded
    nested = expanded / "work" / "conformed-production-baseline"
    if (nested / "manifest.json").exists():
        return nested
    raise FileNotFoundError(f"Could not find manifest.json under {expanded}")


def output_path(value: Any) -> str | None:
    if isinstance(value, str) and value:
        return value
    if isinstance(value, dict):
        for key in ("path", "jsonPath", "markdownPath", "htmlPath", "openCommand"):
            candidate = value.get(key)
            if isinstance(candidate, str) and candidate:
                return candidate
    return None


def truth_snapshot(manifest: dict[str, Any]) -> dict[str, Any]:
    return {key: manifest.get(key) for key in CORE_TRUTH_KEYS if key in manifest}


def safe_slug(value: str) -> str:
    slug = "".join(ch.lower() if ch.isalnum() else "-" for ch in value)
    while "--" in slug:
        slug = slug.replace("--", "-")
    return slug.strip("-") or "audio-baseline"


def run_intake(baseline_dir: Path, utterance: str, extra_args: list[str] | None = None) -> subprocess.CompletedProcess[str]:
    command = [
        sys.executable,
        "apps/QuipslyStudio/script/audio_workbench_codex_listen_decision_intake.py",
        "--baseline-dir",
        str(baseline_dir),
        "--reviewer",
        "codex-listen-intake-smoke",
        "--utterance",
        utterance,
    ]
    command.extend(extra_args or [])
    return subprocess.run(
        command,
        cwd=repo_root(),
        text=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        check=False,
    )


def add_check(checks: list[dict[str, Any]], name: str, passed: bool, detail: str, **extra: Any) -> None:
    checks.append({"name": name, "passed": bool(passed), "detail": detail, **extra})


def parse_outer_json(result: subprocess.CompletedProcess[str]) -> dict[str, Any]:
    return json.loads(result.stdout)


def parse_record_stdout(report: dict[str, Any]) -> dict[str, Any]:
    raw = report.get("recordCommandStdout")
    if not isinstance(raw, str) or not raw.strip():
        return {}
    return json.loads(raw)


def validate_valid_case(case: dict[str, Any], result: subprocess.CompletedProcess[str], checks: list[dict[str, Any]]) -> dict[str, Any]:
    add_check(checks, f"{case['name']} exits zero", result.returncode == 0, f"returncode={result.returncode}")
    if result.returncode != 0:
        return {"case": case, "returncode": result.returncode, "stdout": result.stdout[-4000:], "stderr": result.stderr[-4000:]}

    report = parse_outer_json(result)
    record_stdout = parse_record_stdout(report)
    prefix = case["name"]

    add_check(checks, f"{prefix} parsed decision", report.get("parsedDecision") == case["parsedDecision"], str(report.get("parsedDecision")))
    add_check(checks, f"{prefix} decision status", report.get("decisionStatus") == case["decisionStatus"], str(report.get("decisionStatus")))
    add_check(checks, f"{prefix} stays dry-run", report.get("recorded") is False and report.get("recordCommandDryRun") is True, f"recorded={report.get('recorded')} dryRun={report.get('recordCommandDryRun')}")
    add_check(checks, f"{prefix} fast preflight passed", report.get("preflightPassed") is True, str(report.get("preflightStatus")))
    add_check(checks, f"{prefix} fast preflight hard stops zero", int_value(report.get("preflightHardStopCount")) == 0, str(report.get("preflightHardStopCount")))
    add_check(checks, f"{prefix} final gate locked", report.get("finalEpisodeGateStatus") == LOCKED_GATE, str(report.get("finalEpisodeGateStatus")))
    add_check(checks, f"{prefix} shorts gate locked", report.get("shortsGateStatus") == LOCKED_GATE, str(report.get("shortsGateStatus")))
    add_check(checks, f"{prefix} source-aware timing ready", bool_value(report.get("sourceAwareTimingContractReady")), str(report.get("sourceAwareTimingContractReady")))
    add_check(checks, f"{prefix} source-aware role count", int_value(report.get("sourceAwareTimingContractReadyRoleCount")) >= REQUIRED_ROLES, str(report.get("sourceAwareTimingContractReadyRoleCount")))
    add_check(checks, f"{prefix} source-aware hard stops zero", int_value(report.get("sourceAwareTimingContractHardStopCount")) == 0, str(report.get("sourceAwareTimingContractHardStopCount")))
    add_check(checks, f"{prefix} sandbox render contract ready", report.get("postApprovalApprovedSandboxExecutorSourceAwareRenderContractReady") is True, str(report.get("postApprovalApprovedSandboxExecutorSourceAwareRenderContractReady")))
    add_check(checks, f"{prefix} sandbox inherits source-aware truth", report.get("postApprovalApprovedSandboxExecutorInheritsSourceAwareAudioTruth") is True, str(report.get("postApprovalApprovedSandboxExecutorInheritsSourceAwareAudioTruth")))
    add_check(checks, f"{prefix} flat-master editing disabled", report.get("postApprovalApprovedSandboxExecutorMasteredSpineOnlyEditingAllowed") is False, str(report.get("postApprovalApprovedSandboxExecutorMasteredSpineOnlyEditingAllowed")))
    add_check(checks, f"{prefix} post-listen refresh waiting", report.get("postListenRefreshStatus") == "post-listen-refresh-waiting-for-human-listen", str(report.get("postListenRefreshStatus")))
    add_check(checks, f"{prefix} post-listen refresh step failures zero", int_value(report.get("postListenRefreshStepFailureCount")) == 0, str(report.get("postListenRefreshStepFailureCount")))
    add_check(checks, f"{prefix} post-listen refresh hard stops zero", int_value(report.get("postListenRefreshHardStopCount")) == 0, str(report.get("postListenRefreshHardStopCount")))
    add_check(checks, f"{prefix} post-listen audio truth source-aware", report.get("postListenRefreshBranchRenderAudioTruth") == "source-aware-refined-stems", str(report.get("postListenRefreshBranchRenderAudioTruth")))
    add_check(checks, f"{prefix} post-listen flat-master editing disabled", report.get("postListenRefreshMasteredSpineOnlyEditingAllowed") is False, str(report.get("postListenRefreshMasteredSpineOnlyEditingAllowed")))
    add_check(checks, f"{prefix} post-listen preflight plan ready", report.get("postListenRefreshBranchPreflightBranchAudioPlanStatus") == "ready-source-aware-refined-stem-plan", str(report.get("postListenRefreshBranchPreflightBranchAudioPlanStatus")))
    add_check(checks, f"{prefix} post-listen preflight refined stems", int_value(report.get("postListenRefreshBranchPreflightBranchAudioPlanSelectedRefinedStemCount")) >= REQUIRED_ROLES, str(report.get("postListenRefreshBranchPreflightBranchAudioPlanSelectedRefinedStemCount")))
    add_check(checks, f"{prefix} post-listen preflight missing roles zero", not report.get("postListenRefreshBranchPreflightBranchAudioPlanMissingRoleIds"), str(report.get("postListenRefreshBranchPreflightBranchAudioPlanMissingRoleIds")))
    add_check(checks, f"{prefix} post-listen preflight missing paths zero", int_value(report.get("postListenRefreshBranchPreflightBranchAudioPlanMissingStemPathCount")) == 0, str(report.get("postListenRefreshBranchPreflightBranchAudioPlanMissingStemPathCount")))
    add_check(checks, f"{prefix} post-listen preflight stem paths proved", report.get("postListenRefreshBranchPreflightSourceAwareBranchRenderStemPathsProved") is True, str(report.get("postListenRefreshBranchPreflightSourceAwareBranchRenderStemPathsProved")))
    add_check(checks, f"{prefix} post-listen executor plan ready", report.get("postListenRefreshBranchExecutorBranchAudioPlanStatus") == "ready-source-aware-refined-stem-plan", str(report.get("postListenRefreshBranchExecutorBranchAudioPlanStatus")))
    add_check(checks, f"{prefix} post-listen executor refined stems", int_value(report.get("postListenRefreshBranchExecutorBranchAudioPlanSelectedRefinedStemCount")) >= REQUIRED_ROLES, str(report.get("postListenRefreshBranchExecutorBranchAudioPlanSelectedRefinedStemCount")))
    add_check(checks, f"{prefix} post-listen executor missing roles zero", not report.get("postListenRefreshBranchExecutorBranchAudioPlanMissingRoleIds"), str(report.get("postListenRefreshBranchExecutorBranchAudioPlanMissingRoleIds")))
    add_check(checks, f"{prefix} post-listen executor missing paths zero", int_value(report.get("postListenRefreshBranchExecutorBranchAudioPlanMissingStemPathCount")) == 0, str(report.get("postListenRefreshBranchExecutorBranchAudioPlanMissingStemPathCount")))
    add_check(checks, f"{prefix} post-listen executor will use refined stems", report.get("postListenRefreshBranchExecutorSourceAwareBranchRenderWillUseRefinedStems") is True, str(report.get("postListenRefreshBranchExecutorSourceAwareBranchRenderWillUseRefinedStems")))
    add_check(checks, f"{prefix} post-listen executor stem paths proved", report.get("postListenRefreshBranchExecutorSourceAwareBranchRenderStemPathsProved") is True, str(report.get("postListenRefreshBranchExecutorSourceAwareBranchRenderStemPathsProved")))
    add_check(checks, f"{prefix} safety flags clean", not any(bool_value(report.get(key)) for key in ("renderAttempted", "uploadAttempted", "publicationAttempted", "originalMediaMutated")), "render/upload/publication/original-media flags false")
    add_check(checks, f"{prefix} canonical post-decision refresh script", report.get("postDecisionRefreshCanonicalScript") == POST_DECISION_REFRESH_SCRIPT, str(report.get("postDecisionRefreshCanonicalScript")))
    add_check(checks, f"{prefix} canonical post-decision refresh advertised", report.get("postDecisionRefreshUsesCanonicalControlPlane") is True, str(report.get("postDecisionRefreshUsesCanonicalControlPlane")))
    add_check(checks, f"{prefix} dry-run does not refresh", report.get("postDecisionRefreshRan") is False, str(report.get("postDecisionRefreshRan")))

    add_check(checks, f"{prefix} recorder stdout parsed", bool(record_stdout), "recordCommandStdout JSON parsed")
    add_check(checks, f"{prefix} recorder dry-run", record_stdout.get("dryRun") is True, str(record_stdout.get("dryRun")))
    add_check(checks, f"{prefix} recorder status", record_stdout.get("decisionStatus") == case["decisionStatus"], str(record_stdout.get("decisionStatus")))
    add_check(checks, f"{prefix} recorder preflight status", record_stdout.get("sourceAwareApprovalPreflightStatus") == case["expectedRecorderPreflightStatus"], str(record_stdout.get("sourceAwareApprovalPreflightStatus")))
    add_check(checks, f"{prefix} recorder preflight passed", record_stdout.get("sourceAwareApprovalPreflightPassed") is True, str(record_stdout.get("sourceAwareApprovalPreflightPassed")))

    return {"case": case, "returncode": result.returncode, "report": report, "recordCommandStdout": record_stdout}


def validate_invalid_case(case: dict[str, Any], result: subprocess.CompletedProcess[str], checks: list[dict[str, Any]]) -> dict[str, Any]:
    combined = f"{result.stdout}\n{result.stderr}"
    add_check(checks, f"{case['name']} exits nonzero", result.returncode != 0, f"returncode={result.returncode}")
    add_check(checks, f"{case['name']} has expected error", case["expectedErrorFragment"] in combined, case["expectedErrorFragment"])
    return {
        "case": case,
        "returncode": result.returncode,
        "stdout": result.stdout[-4000:],
        "stderr": result.stderr[-4000:],
    }


def render_markdown(report: dict[str, Any]) -> str:
    lines = [
        f"# Codex Listen Decision Intake Smoke: {report['baselineId']}",
        "",
        f"- Generated: `{report['generatedAt']}`",
        f"- Status: `{report['status']}`",
        f"- Passed: `{str(report['passed']).lower()}`",
        f"- Check count: `{report['checkCount']}`",
        f"- Failure count: `{report['failureCount']}`",
        f"- Approval state changed: `{str(report['approvalStateChanged']).lower()}`",
        f"- Branch state changed: `{str(report['branchStateChanged']).lower()}`",
        f"- Render attempted: `{str(report['renderAttempted']).lower()}`",
        f"- Upload attempted: `{str(report['uploadAttempted']).lower()}`",
        f"- Publication attempted: `{str(report['publicationAttempted']).lower()}`",
        f"- Original media mutated: `{str(report['originalMediaMutated']).lower()}`",
        "",
        "This smoke proves the plain-language Codex intake is only an adapter. It does not approve v006, unlock branches, render, upload, publish, or mutate original media.",
        "",
        "## Source-aware invariant",
        "",
        "Approval language must still route through the source-aware approval preflight. The future edit branch must inherit Charlie, Homer, and clip/source refined stems on one sequence clock, and the post-listen branch preflight/executor must both report a ready refined-stem plan. Mastered-spine-only editing must stay disabled.",
        "",
        "## Core truth after smoke",
        "",
    ]
    for key, value in report["afterTruth"].items():
        lines.append(f"- `{key}`: `{value}`")
    lines.extend(["", "## Checks", "", "| Check | Passed | Detail |", "|---|---:|---|"])
    for check in report["checks"]:
        lines.append(f"| {check['name']} | `{str(check['passed']).lower()}` | {check['detail']} |")
    lines.append("")
    return "\n".join(lines)


def render_html(report: dict[str, Any]) -> str:
    check_cards = "\n".join(
        f"<tr><td>{escape(check['name'])}</td><td>{'pass' if check['passed'] else 'fail'}</td><td>{escape(str(check['detail']))}</td></tr>"
        for check in report["checks"]
    )
    truth_cards = "\n".join(
        f"<li><code>{escape(key)}</code>: <strong>{escape(str(value))}</strong></li>"
        for key, value in report["afterTruth"].items()
    )
    status_class = "pass" if report["passed"] else "fail"
    return f"""<!doctype html>
<html lang=\"en\">
<head>
<meta charset=\"utf-8\" />
<title>Codex Listen Decision Intake Smoke</title>
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
<section class=\"card\"><p>Quipsly Studio · Episode 4 audio gate</p><h1>Codex listen decision intake smoke</h1><p class=\"{status_class}\">{escape(report['status'])}</p><p>This is not approval. It proves plain chat-style decisions still route through the guarded source-aware path.</p></section>
<section class=\"card\"><h2>Current truth</h2><ul>{truth_cards}</ul></section>
<section class=\"card\"><h2>Checks</h2><table><thead><tr><th>Check</th><th>Result</th><th>Detail</th></tr></thead><tbody>{check_cards}</tbody></table></section>
</body>
</html>
"""


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--baseline-dir", required=True, type=Path)
    args = parser.parse_args()

    baseline_dir = resolve_baseline_dir(args.baseline_dir)
    manifest_path = baseline_dir / "manifest.json"
    before_manifest = read_json(manifest_path)
    before_truth = truth_snapshot(before_manifest)
    baseline_id = str(before_manifest.get("baselineId") or "unknown-baseline")
    generated_at_iso = datetime.now(timezone.utc).isoformat()
    generated_at_slug = datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S")
    slug = safe_slug(baseline_id)
    checks: list[dict[str, Any]] = []
    valid_results: list[dict[str, Any]] = []
    invalid_results: list[dict[str, Any]] = []

    for case in VALID_CASES:
        result = run_intake(baseline_dir, case["utterance"])
        valid_results.append(validate_valid_case(case, result, checks))

    for case in INVALID_CASES:
        result = run_intake(baseline_dir, case["utterance"], case.get("extraArgs") or [])
        invalid_results.append(validate_invalid_case(case, result, checks))

    after_manifest = read_json(manifest_path)
    after_truth = truth_snapshot(after_manifest)
    approval_state_changed = before_manifest.get("approvalStatus") != after_manifest.get("approvalStatus")
    branch_state_changed = (
        before_manifest.get("branchInheritanceReady") != after_manifest.get("branchInheritanceReady")
        or before_manifest.get("branchRenderReady") != after_manifest.get("branchRenderReady")
    )
    render_attempted = bool_value(after_manifest.get("renderAttempted")) or bool_value(after_manifest.get("branchRenderAttempted"))
    upload_attempted = bool_value(after_manifest.get("uploadAttempted"))
    publication_attempted = bool_value(after_manifest.get("publicationAttempted"))
    original_media_mutated = bool_value(after_manifest.get("originalMediaMutated"))

    add_check(checks, "real approval state preserved", not approval_state_changed, f"before={before_manifest.get('approvalStatus')} after={after_manifest.get('approvalStatus')}")
    add_check(checks, "real branch state preserved", not branch_state_changed, f"before inheritance/render={before_manifest.get('branchInheritanceReady')}/{before_manifest.get('branchRenderReady')} after={after_manifest.get('branchInheritanceReady')}/{after_manifest.get('branchRenderReady')}")
    add_check(checks, "real approval still waiting for human listen", after_manifest.get("approvalStatus") == PENDING_STATUS, str(after_manifest.get("approvalStatus")))
    add_check(checks, "real branch inheritance locked", after_manifest.get("branchInheritanceReady") is False, str(after_manifest.get("branchInheritanceReady")))
    add_check(checks, "real branch render locked", after_manifest.get("branchRenderReady") is False, str(after_manifest.get("branchRenderReady")))
    add_check(checks, "real branch audio truth source-aware", after_manifest.get("branchRenderAudioTruth") == "source-aware-refined-stems", str(after_manifest.get("branchRenderAudioTruth")))
    add_check(checks, "real mastered-spine-only editing disabled", after_manifest.get("masteredSpineOnlyEditingAllowed") is False, str(after_manifest.get("masteredSpineOnlyEditingAllowed")))
    add_check(checks, "real safety flags clean", not any([render_attempted, upload_attempted, publication_attempted, original_media_mutated]), "render/upload/publication/original-media flags false")

    failed_checks = [check for check in checks if not check["passed"]]
    report = {
        "schema": "quipsly.audio-workbench.codex-listen-decision-intake-smoke.v1",
        "generatedAt": generated_at_iso,
        "baselineDir": str(baseline_dir),
        "baselineId": baseline_id,
        "status": "codex-listen-decision-intake-smoke-passed" if not failed_checks else "codex-listen-decision-intake-smoke-failed",
        "passed": not failed_checks,
        "checkCount": len(checks),
        "failureCount": len(failed_checks),
        "approvalStateChanged": approval_state_changed,
        "branchStateChanged": branch_state_changed,
        "renderAttempted": render_attempted,
        "uploadAttempted": upload_attempted,
        "publicationAttempted": publication_attempted,
        "originalMediaMutated": original_media_mutated,
        "beforeTruth": before_truth,
        "afterTruth": after_truth,
        "validResults": valid_results,
        "invalidResults": invalid_results,
        "checks": checks,
    }

    json_path = baseline_dir / "AUDIO_CODEX_LISTEN_DECISION_INTAKE_SMOKE.json"
    md_path = baseline_dir / "AUDIO_CODEX_LISTEN_DECISION_INTAKE_SMOKE.md"
    html_path = baseline_dir / "AUDIO_CODEX_LISTEN_DECISION_INTAKE_SMOKE.html"
    versioned_dir = baseline_dir / f"codex-listen-decision-intake-smoke-{slug}-{generated_at_slug}"
    versioned_dir.mkdir(parents=True, exist_ok=True)
    versioned_json = versioned_dir / "codex-listen-decision-intake-smoke.json"
    versioned_md = versioned_dir / "codex-listen-decision-intake-smoke.md"
    versioned_html = versioned_dir / "codex-listen-decision-intake-smoke.html"

    write_json(json_path, report)
    md_path.write_text(render_markdown(report), encoding="utf-8")
    html_path.write_text(render_html(report), encoding="utf-8")
    write_json(versioned_json, report)
    versioned_md.write_text(render_markdown(report), encoding="utf-8")
    versioned_html.write_text(render_html(report), encoding="utf-8")

    manifest = read_json(manifest_path)
    outputs = manifest.setdefault("outputs", {})
    outputs["latestAudioCodexListenDecisionIntakeSmoke"] = str(json_path)
    outputs["latestAudioCodexListenDecisionIntakeSmokeMarkdown"] = str(md_path)
    outputs["latestAudioCodexListenDecisionIntakeSmokeHtml"] = str(html_path)
    outputs["latestAudioCodexListenDecisionIntakeSmokeVersioned"] = str(versioned_json)
    manifest["audioCodexListenDecisionIntakeSmokeLatestStatus"] = report["status"]
    manifest["audioCodexListenDecisionIntakeSmokePassed"] = report["passed"]
    manifest["audioCodexListenDecisionIntakeSmokeCheckCount"] = report["checkCount"]
    manifest["audioCodexListenDecisionIntakeSmokeFailureCount"] = report["failureCount"]
    manifest["audioCodexListenDecisionIntakeSmokeApprovalStateChanged"] = approval_state_changed
    manifest["audioCodexListenDecisionIntakeSmokeBranchStateChanged"] = branch_state_changed
    manifest["audioCodexListenDecisionIntakeSmokeRenderAttempted"] = render_attempted
    manifest["audioCodexListenDecisionIntakeSmokeUploadAttempted"] = upload_attempted
    manifest["audioCodexListenDecisionIntakeSmokePublicationAttempted"] = publication_attempted
    manifest["audioCodexListenDecisionIntakeSmokeOriginalMediaMutated"] = original_media_mutated
    write_json(manifest_path, manifest)

    print(json.dumps(report, indent=2, sort_keys=True))
    if failed_checks:
        raise SystemExit(1)


if __name__ == "__main__":
    main()
