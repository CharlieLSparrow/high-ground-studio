#!/usr/bin/env python3
"""Record a human listen decision for an Audio Workbench candidate.

This command is intentionally stricter than editing manifest JSON by hand. It
can record approval for source-aware branch-gate review, publication approval,
failure, or a request for more proof windows. It never mutates source media and
never overwrites older decisions.

Important: a human listen approval does not directly unlock edit branches.
Branches need the separate source-aware branch gate to prove that Charlie,
Homer, and clip-source refined stems plus timing metadata are ready. The
combined mastered spine is a review/export convenience artifact, not the
editable branch truth.
"""
from __future__ import annotations

import argparse
import json
import re
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


DECISION_STATUSES = {
    "pending-human-listen",
    "needs-focused-proof",
    "failed-human-listen",
    "human-approved-for-branch-inheritance",
    "human-approved-for-publication",
}

APPROVAL_STATUSES = {
    "human-approved-for-branch-inheritance",
    "human-approved-for-publication",
}
REQUIRED_SOURCE_AWARE_STEM_ROLES = {"charlie", "homer", "clip-source"}


def read_json(path: Path) -> dict[str, Any]:
    return json.loads(path.read_text(encoding="utf-8"))


def write_json(path: Path, value: dict[str, Any]) -> None:
    path.write_text(json.dumps(value, indent=2, sort_keys=True), encoding="utf-8")


def resolve_baseline_dir(input_path: Path) -> Path:
    if (input_path / "manifest.json").exists():
        return input_path
    nested = input_path / "work" / "conformed-production-baseline"
    if (nested / "manifest.json").exists():
        return nested
    raise FileNotFoundError(
        "Could not find a conformed production baseline manifest at "
        f"{input_path}/manifest.json or {nested}/manifest.json"
    )


def version_from_baseline_id(baseline_id: str) -> str:
    match = re.search(r"(v\d+(?:-[A-Za-z0-9-]+)?)$", baseline_id)
    return match.group(1) if match else "unknown"


def path_exists(path_text: str | None) -> bool:
    return bool(path_text) and Path(path_text).exists()


def split_values(values: list[str]) -> list[str]:
    result: list[str] = []
    for value in values:
        for part in value.split(";"):
            cleaned = part.strip()
            if cleaned:
                result.append(cleaned)
    return result


def run_or_load_fast_readback(baseline_dir: Path, *, regenerate: bool) -> dict[str, Any]:
    """Return the fast readback report used as the approval safety preflight.

    Dry-runs intentionally read the existing report so they stay non-mutating.
    Real approval paths regenerate the report immediately before recording the
    decision so stale branch-render truth cannot sneak through the side door.
    """
    report_path = baseline_dir / "AUDIO_FAST_READBACK_CHECK.json"
    if regenerate:
        script = Path(__file__).resolve().parent / "audio_workbench_fast_readback_check.py"
        proc = subprocess.run(
            [sys.executable or "python3", str(script), "--baseline-dir", str(baseline_dir)],
            cwd=Path(__file__).resolve().parents[3],
            text=True,
            capture_output=True,
            check=False,
        )
        if proc.returncode != 0:
            raise ValueError(
                "Fast readback preflight failed before recording approval. "
                f"Exit {proc.returncode}. stderr: {proc.stderr[-1200:]}"
            )
    if not report_path.exists():
        manifest_path = baseline_dir / "manifest.json"
        registered_path: Path | None = None
        if manifest_path.exists():
            manifest = read_json(manifest_path)
            outputs = manifest.get("outputs") if isinstance(manifest.get("outputs"), dict) else {}
            value = outputs.get("latestAudioFastReadbackCheck")
            if isinstance(value, str):
                registered_path = Path(value)
            elif isinstance(value, dict):
                candidate = value.get("jsonPath") or value.get("path")
                if isinstance(candidate, str):
                    registered_path = Path(candidate)
        if registered_path and registered_path.exists():
            report_path = registered_path
        else:
            raise ValueError(f"Missing fast readback report required for approval: {report_path}")
    return read_json(report_path)


def validate_source_aware_approval_preflight(
    baseline_dir: Path,
    *,
    status: str,
    regenerate_fast_readback: bool,
) -> dict[str, Any]:
    """Refuse approval unless future branch rendering stays source-aware.

    Human approval is about how the v006 spine sounds. It is necessary, but not
    enough, for branch work. Before we record that approval, this preflight
    proves the future executor still inherits Charlie/Homer/clip-source refined
    stems, source-aware timing, and a non-master-only render contract.
    """
    if status not in APPROVAL_STATUSES:
        return {
            "status": "not-required-for-non-approval-decision",
            "required": False,
            "passed": True,
            "errors": [],
        }

    report = run_or_load_fast_readback(baseline_dir, regenerate=regenerate_fast_readback)
    roles = {str(role) for role in (report.get("postApprovalApprovedSandboxExecutorSourceAwareAudioRoleIds") or [])}
    missing_roles = sorted(REQUIRED_SOURCE_AWARE_STEM_ROLES - roles)

    errors: list[str] = []
    if report.get("passed") is not True:
        errors.append("fast readback did not pass")
    if int(report.get("hardStopCount") or 0) != 0:
        errors.append(f"fast readback has hard stops: {report.get('hardStopCount')}")
    if report.get("finalEpisodeGateStatus") != "locked-until-audio-spine-approved":
        errors.append(f"final episode gate is {report.get('finalEpisodeGateStatus')}")
    if report.get("shortsGateStatus") != "locked-until-audio-spine-approved":
        errors.append(f"shorts gate is {report.get('shortsGateStatus')}")
    if int(report.get("sourceAwareStemResolvedCount") or 0) < len(REQUIRED_SOURCE_AWARE_STEM_ROLES):
        errors.append("source-aware stem manifest does not resolve all required roles")
    if report.get("sourceAwareTimingContractReady") is not True:
        errors.append("source-aware timing contract is not ready")
    if int(report.get("sourceAwareTimingContractReadyRoleCount") or 0) < len(REQUIRED_SOURCE_AWARE_STEM_ROLES):
        errors.append("source-aware timing contract has too few ready roles")
    if int(report.get("sourceAwareTimingContractFullLengthStemCount") or 0) < len(REQUIRED_SOURCE_AWARE_STEM_ROLES):
        errors.append("source-aware timing contract has too few full-length stems")
    if int(report.get("sourceAwareTimingContractHardStopCount") or 0) != 0:
        errors.append("source-aware timing contract has hard stops")
    if report.get("postApprovalRenderRehearsalInheritsSourceAwareAudioTruth") is not True:
        errors.append("post-approval rehearsal does not inherit source-aware audio truth")
    if report.get("postApprovalRenderRehearsalSourceAwareAudioContractStatus") != "ready-source-aware-editable":
        errors.append(
            "post-approval source-aware contract is "
            f"{report.get('postApprovalRenderRehearsalSourceAwareAudioContractStatus')}"
        )
    if report.get("postApprovalRenderRehearsalMasteredSpineOnlyEditingAllowed") is not False:
        errors.append("post-approval rehearsal allows mastered-spine-only editing")
    if report.get("postApprovalApprovedSandboxPassed") is not True:
        errors.append("approved sandbox rehearsal did not pass")
    if report.get("postApprovalApprovedSandboxExecutorSourceAwareRenderContractReady") is not True:
        errors.append("approved sandbox executor source-aware render contract is not ready")
    if report.get("postApprovalApprovedSandboxExecutorInheritsSourceAwareAudioTruth") is not True:
        errors.append("approved sandbox executor does not inherit source-aware audio truth")
    if report.get("postApprovalApprovedSandboxExecutorSourceAwareAudioContractStatus") != "ready-source-aware-editable":
        errors.append(
            "approved sandbox executor source-aware status is "
            f"{report.get('postApprovalApprovedSandboxExecutorSourceAwareAudioContractStatus')}"
        )
    if missing_roles:
        errors.append("approved sandbox executor missing source-aware roles: " + ", ".join(missing_roles))
    if report.get("postApprovalApprovedSandboxExecutorMasteredSpineOnlyEditingAllowed") is not False:
        errors.append("approved sandbox executor allows mastered-spine-only editing")
    if report.get("branchRenderPreflightBranchRenderAudioTruth") != "source-aware-refined-stems":
        errors.append(f"branch preflight audio truth is {report.get('branchRenderPreflightBranchRenderAudioTruth')}")
    if report.get("branchRenderPreflightMasteredSpineOnlyEditingAllowed") is not False:
        errors.append("branch preflight allows mastered-spine-only editing")
    if report.get("postListenRefreshStatus") != "post-listen-refresh-waiting-for-human-listen":
        errors.append(f"post-listen refresh status is {report.get('postListenRefreshStatus')}")
    if int(report.get("postListenRefreshStepFailureCount") or 0) != 0:
        errors.append(f"post-listen refresh has step failures: {report.get('postListenRefreshStepFailureCount')}")
    if int(report.get("postListenRefreshHardStopCount") or 0) != 0:
        errors.append(f"post-listen refresh has hard stops: {report.get('postListenRefreshHardStopCount')}")
    if report.get("postListenRefreshBranchRenderAudioTruth") != "source-aware-refined-stems":
        errors.append(f"post-listen refresh audio truth is {report.get('postListenRefreshBranchRenderAudioTruth')}")
    if report.get("postListenRefreshMasteredSpineOnlyEditingAllowed") is not False:
        errors.append("post-listen refresh allows mastered-spine-only editing")
    if report.get("postListenRefreshBranchPreflightBranchAudioPlanStatus") != "ready-source-aware-refined-stem-plan":
        errors.append(
            "post-listen refresh branch preflight plan is "
            f"{report.get('postListenRefreshBranchPreflightBranchAudioPlanStatus')}"
        )
    if int(report.get("postListenRefreshBranchPreflightBranchAudioPlanSelectedRefinedStemCount") or 0) < len(REQUIRED_SOURCE_AWARE_STEM_ROLES):
        errors.append("post-listen refresh branch preflight has too few refined stems")
    post_listen_preflight_missing_roles = sorted(
        str(role) for role in (report.get("postListenRefreshBranchPreflightBranchAudioPlanMissingRoleIds") or [])
    )
    if post_listen_preflight_missing_roles:
        errors.append(
            "post-listen refresh branch preflight missing roles: "
            + ", ".join(post_listen_preflight_missing_roles)
        )
    if int(report.get("postListenRefreshBranchPreflightBranchAudioPlanMissingStemPathCount") or 0) != 0:
        errors.append("post-listen refresh branch preflight has missing refined stem paths")
    if report.get("postListenRefreshBranchPreflightSourceAwareBranchRenderStemPathsProved") is not True:
        errors.append("post-listen refresh branch preflight did not prove refined stem paths")
    if report.get("postListenRefreshBranchExecutorBranchAudioPlanStatus") != "ready-source-aware-refined-stem-plan":
        errors.append(
            "post-listen refresh branch executor plan is "
            f"{report.get('postListenRefreshBranchExecutorBranchAudioPlanStatus')}"
        )
    if int(report.get("postListenRefreshBranchExecutorBranchAudioPlanSelectedRefinedStemCount") or 0) < len(REQUIRED_SOURCE_AWARE_STEM_ROLES):
        errors.append("post-listen refresh branch executor has too few refined stems")
    post_listen_executor_missing_roles = sorted(
        str(role) for role in (report.get("postListenRefreshBranchExecutorBranchAudioPlanMissingRoleIds") or [])
    )
    if post_listen_executor_missing_roles:
        errors.append(
            "post-listen refresh branch executor missing roles: "
            + ", ".join(post_listen_executor_missing_roles)
        )
    if int(report.get("postListenRefreshBranchExecutorBranchAudioPlanMissingStemPathCount") or 0) != 0:
        errors.append("post-listen refresh branch executor has missing refined stem paths")
    if report.get("postListenRefreshBranchExecutorSourceAwareBranchRenderWillUseRefinedStems") is not True:
        errors.append("post-listen refresh branch executor will not use refined stems")
    if report.get("postListenRefreshBranchExecutorSourceAwareBranchRenderStemPathsProved") is not True:
        errors.append("post-listen refresh branch executor did not prove refined stem paths")
    if report.get("renderAttempted") or report.get("uploadAttempted") or report.get("publicationAttempted"):
        errors.append("fast readback safety flags show render/upload/publication activity")
    if report.get("originalMediaMutated"):
        errors.append("fast readback safety flags show original media mutation")

    preflight = {
        "status": "source-aware-approval-preflight-passed" if not errors else "source-aware-approval-preflight-failed",
        "required": True,
        "passed": not errors,
        "fastReadbackStatus": report.get("status"),
        "fastReadbackCheckCount": report.get("checkCount"),
        "fastReadbackHardStopCount": report.get("hardStopCount"),
        "sourceAwareStemResolvedCount": report.get("sourceAwareStemResolvedCount"),
        "sourceAwareTimingContractStatus": report.get("sourceAwareTimingContractStatus"),
        "sourceAwareTimingContractReady": report.get("sourceAwareTimingContractReady"),
        "postApprovalSourceAwareContractStatus": report.get("postApprovalRenderRehearsalSourceAwareAudioContractStatus"),
        "approvedSandboxExecutorStatus": report.get("postApprovalApprovedSandboxExecutorStatus"),
        "approvedSandboxExecutorSourceAwareContractStatus": report.get(
            "postApprovalApprovedSandboxExecutorSourceAwareAudioContractStatus"
        ),
        "approvedSandboxExecutorSourceAwareRoleIds": sorted(roles),
        "approvedSandboxExecutorMissingRoleIds": missing_roles,
        "branchRenderAudioTruth": report.get("branchRenderPreflightBranchRenderAudioTruth"),
        "postListenRefreshStatus": report.get("postListenRefreshStatus"),
        "postListenRefreshBranchRenderAudioTruth": report.get("postListenRefreshBranchRenderAudioTruth"),
        "postListenRefreshBranchPreflightBranchAudioPlanStatus": report.get(
            "postListenRefreshBranchPreflightBranchAudioPlanStatus"
        ),
        "postListenRefreshBranchPreflightBranchAudioPlanSelectedRefinedStemCount": report.get(
            "postListenRefreshBranchPreflightBranchAudioPlanSelectedRefinedStemCount"
        ),
        "postListenRefreshBranchPreflightBranchAudioPlanMissingRoleIds": post_listen_preflight_missing_roles,
        "postListenRefreshBranchPreflightBranchAudioPlanMissingStemPathCount": report.get(
            "postListenRefreshBranchPreflightBranchAudioPlanMissingStemPathCount"
        ),
        "postListenRefreshBranchExecutorBranchAudioPlanStatus": report.get(
            "postListenRefreshBranchExecutorBranchAudioPlanStatus"
        ),
        "postListenRefreshBranchExecutorBranchAudioPlanSelectedRefinedStemCount": report.get(
            "postListenRefreshBranchExecutorBranchAudioPlanSelectedRefinedStemCount"
        ),
        "postListenRefreshBranchExecutorBranchAudioPlanMissingRoleIds": post_listen_executor_missing_roles,
        "postListenRefreshBranchExecutorBranchAudioPlanMissingStemPathCount": report.get(
            "postListenRefreshBranchExecutorBranchAudioPlanMissingStemPathCount"
        ),
        "postListenRefreshBranchExecutorSourceAwareBranchRenderWillUseRefinedStems": report.get(
            "postListenRefreshBranchExecutorSourceAwareBranchRenderWillUseRefinedStems"
        ),
        "postListenRefreshBranchExecutorSourceAwareBranchRenderStemPathsProved": report.get(
            "postListenRefreshBranchExecutorSourceAwareBranchRenderStemPathsProved"
        ),
        "masteredSpineOnlyEditingAllowed": bool(report.get("branchRenderPreflightMasteredSpineOnlyEditingAllowed")),
        "regeneratedFastReadback": regenerate_fast_readback,
        "errors": errors,
    }
    if errors:
        raise ValueError(
            "Refusing to record human approval because source-aware approval preflight failed:\n- "
            + "\n- ".join(errors)
        )
    return preflight


def build_decision(
    baseline_dir: Path,
    *,
    status: str,
    reviewer: str,
    notes: str,
    passed_windows: list[str],
    failed_windows: list[str],
    issues: list[str],
    confirm_human_listened: bool,
) -> dict[str, Any]:
    manifest = read_json(baseline_dir / "manifest.json")
    outputs = manifest.get("outputs", {})
    review_packet_path = outputs.get("listenReviewPacket")
    review_packet = read_json(Path(review_packet_path)) if path_exists(review_packet_path) else {}
    template_path = outputs.get("latestListenDecisionTemplate")
    template = read_json(Path(template_path)) if path_exists(template_path) else {}

    if status not in DECISION_STATUSES:
        raise ValueError(f"Unsupported listen decision status: {status}")
    if status in APPROVAL_STATUSES and not confirm_human_listened:
        raise ValueError("Approval requires --confirm-human-listened")
    if status == "human-approved-for-publication" and not notes.strip():
        raise ValueError("Publication approval requires --notes explaining the approval basis")
    if status in ("failed-human-listen", "needs-focused-proof") and not (issues or notes.strip()):
        raise ValueError("Failure or focused-proof decisions require --issue or --notes")

    baseline_id = manifest.get("baselineId", "unknown-baseline")
    generated_at = datetime.now(timezone.utc).isoformat()
    proof = review_packet.get("listenProof") or template.get("listenProof") or {
        "bundle": outputs.get("listenProofBundle"),
        "manifest": outputs.get("listenProofBundleManifest"),
    }
    windows = []
    known_windows = {
        str(window.get("label")): window
        for window in (review_packet.get("reviewWindows") or template.get("reviewWindows") or [])
        if window.get("label")
    }
    for label, window in known_windows.items():
        if label in failed_windows:
            decision = "failed"
        elif label in passed_windows or status in APPROVAL_STATUSES:
            decision = "passed"
        else:
            decision = "not-reviewed"
        windows.append(
            {
                "label": label,
                "sequenceStartSeconds": window.get("sequenceStartSeconds"),
                "durationSeconds": window.get("durationSeconds"),
                "decision": decision,
            }
        )

    issue_log = []
    for issue in issues:
        issue_log.append(
            {
                "sequenceTime": "",
                "symptom": issue,
                "severity": "needs-review",
                "likelyStage": "",
                "requestedNextCandidate": "v007-or-timestamped-candidate",
                "notes": "",
            }
        )

    publication_approved = status == "human-approved-for-publication"
    return {
        "schema": "quipsly.audio-workbench.listen-decision.v1",
        "generatedAt": generated_at,
        "baselineDir": str(baseline_dir),
        "baselineId": baseline_id,
        "reviewer": reviewer,
        "decisionStatus": status,
        "confirmHumanListened": confirm_human_listened,
        "publicationApproved": publication_approved,
        "notes": notes,
        "handoffWav": (outputs.get("masterWav") or {}).get("path"),
        "listeningM4a": (outputs.get("masterM4a") or {}).get("path"),
        "listenProof": proof,
        "reviewPacket": review_packet_path,
        "reviewPacketMarkdown": outputs.get("listenReviewPacketMarkdown"),
        "audioReviewCockpitHtml": outputs.get("audioReviewCockpitHtml"),
        "qualityReportMarkdown": outputs.get("qualityReportMarkdown"),
        "proofWindowComparisonMarkdown": outputs.get("proofWindowComparisonMarkdown"),
        "proofWindowListenWorkorderMarkdown": outputs.get("proofWindowListenWorkorderMarkdown"),
        "sourceActivityMarkdown": outputs.get("sourceActivityMarkdown"),
        "sourceContributionMarkdown": outputs.get("sourceContributionMarkdown"),
        "stageBoardMarkdown": outputs.get("audioSpineStageBoardMarkdown"),
        "checklist": [
            {
                "text": item,
                "status": "passed" if status in APPROVAL_STATUSES else "not-reviewed",
                "notes": "",
            }
            for item in review_packet.get("reviewerChecklist", [])
        ],
        "reviewWindows": windows,
        "issueLog": issue_log,
        "promotionRule": (
            "Human approval allows the source-aware branch gate to run. Branch "
            "inheritance is allowed only after that gate proves refined Charlie, "
            "Homer, and clip-source stems plus timing metadata are ready."
        ),
        "branchRenderAudioTruth": "source-aware-refined-stems",
        "masteredSpineUse": "review-export-premiere-final-podcast-convenience-not-editable-branch-truth",
        "masteredSpineOnlyEditingAllowed": False,
        "sourceAwareBranchGateRequired": True,
        "failureRule": (
            "If this decision is failed-human-listen or needs-focused-proof, keep this candidate intact "
            "and render a new v007 or timestamped candidate."
        ),
    }


def render_markdown(decision: dict[str, Any]) -> str:
    proof = decision.get("listenProof", {})
    lines = [
        "# Audio Workbench recorded listen decision",
        "",
        f"- Baseline: `{decision.get('baselineId')}`",
        f"- Created: `{decision.get('generatedAt')}`",
        f"- Reviewer: `{decision.get('reviewer')}`",
        f"- Decision status: `{decision.get('decisionStatus')}`",
        f"- Human listened confirmation: `{decision.get('confirmHumanListened')}`",
        f"- Publication approved: `{decision.get('publicationApproved')}`",
        "",
        "## Evidence opened",
        "",
        f"- Listen-proof HTML: `{proof.get('html')}`",
        f"- Listen-proof playlist: `{proof.get('playlist')}`",
        f"- Full WAV handoff: `{decision.get('handoffWav')}`",
        f"- Full M4A listening copy: `{decision.get('listeningM4a')}`",
        f"- Audio review cockpit: `{decision.get('audioReviewCockpitHtml')}`",
        f"- Review packet: `{decision.get('reviewPacketMarkdown')}`",
        f"- Quality report: `{decision.get('qualityReportMarkdown')}`",
        f"- Proof-window listen workorder: `{decision.get('proofWindowListenWorkorderMarkdown')}`",
        f"- Proof-window comparison: `{decision.get('proofWindowComparisonMarkdown')}`",
        f"- Source activity: `{decision.get('sourceActivityMarkdown')}`",
        "",
        "## Notes",
        "",
        decision.get("notes") or "_No notes recorded._",
        "",
        "## Review windows",
        "",
        "| Window | Sequence start | Decision |",
        "|---|---:|---|",
    ]
    for window in decision.get("reviewWindows", []):
        lines.append(
            f"| {window.get('label')} | {window.get('sequenceStartSeconds')} | {window.get('decision')} |"
        )
    lines.extend(["", "## Issues", ""])
    issues = decision.get("issueLog", [])
    if not issues:
        lines.append("- none")
    for issue in issues:
        lines.append(f"- {issue.get('symptom')} ({issue.get('requestedNextCandidate')})")
    lines.extend(["", "## Promotion rule", "", decision.get("promotionRule", ""), ""])
    preflight = decision.get("sourceAwareApprovalPreflight")
    if isinstance(preflight, dict) and preflight:
        lines.extend(
            [
                "## Source-aware approval preflight",
                "",
                f"- Status: `{preflight.get('status')}`",
                f"- Passed: `{str(preflight.get('passed')).lower()}`",
                f"- Required: `{str(preflight.get('required')).lower()}`",
                f"- Fast readback: `{preflight.get('fastReadbackStatus')}`",
                f"- Fast readback checks: `{preflight.get('fastReadbackCheckCount')}`",
                f"- Source-aware timing: `{preflight.get('sourceAwareTimingContractStatus')}`",
                f"- Approved sandbox executor: `{preflight.get('approvedSandboxExecutorStatus')}`",
                f"- Executor source-aware contract: `{preflight.get('approvedSandboxExecutorSourceAwareContractStatus')}`",
                f"- Executor roles: `{', '.join(preflight.get('approvedSandboxExecutorSourceAwareRoleIds') or [])}`",
                f"- Branch render audio truth: `{preflight.get('branchRenderAudioTruth')}`",
                f"- Post-listen refresh: `{preflight.get('postListenRefreshStatus')}`",
                f"- Post-listen audio truth: `{preflight.get('postListenRefreshBranchRenderAudioTruth')}`",
                f"- Post-listen preflight plan: `{preflight.get('postListenRefreshBranchPreflightBranchAudioPlanStatus')}` / stems `{preflight.get('postListenRefreshBranchPreflightBranchAudioPlanSelectedRefinedStemCount')}`",
                f"- Post-listen executor plan: `{preflight.get('postListenRefreshBranchExecutorBranchAudioPlanStatus')}` / stems `{preflight.get('postListenRefreshBranchExecutorBranchAudioPlanSelectedRefinedStemCount')}`",
                f"- Post-listen executor will use refined stems: `{str(preflight.get('postListenRefreshBranchExecutorSourceAwareBranchRenderWillUseRefinedStems')).lower()}`",
                f"- Post-listen executor stem paths proved: `{str(preflight.get('postListenRefreshBranchExecutorSourceAwareBranchRenderStemPathsProved')).lower()}`",
                f"- Mastered-spine-only editing allowed: `{str(preflight.get('masteredSpineOnlyEditingAllowed')).lower()}`",
                f"- Regenerated fast readback: `{str(preflight.get('regeneratedFastReadback')).lower()}`",
                "",
            ]
        )
        errors = preflight.get("errors") if isinstance(preflight.get("errors"), list) else []
        lines.extend(["### Preflight errors", ""])
        lines.extend([f"- {error}" for error in errors] or ["- none"])
        lines.append("")
    return "\n".join(lines)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--baseline-dir", required=True, type=Path)
    parser.add_argument("--status", required=True, choices=sorted(DECISION_STATUSES))
    parser.add_argument("--reviewer", required=True)
    parser.add_argument("--notes", default="")
    parser.add_argument("--passed-window", action="append", default=[])
    parser.add_argument("--failed-window", action="append", default=[])
    parser.add_argument("--issue", action="append", default=[])
    parser.add_argument("--confirm-human-listened", action="store_true")
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    baseline_dir = resolve_baseline_dir(args.baseline_dir)
    decision = build_decision(
        baseline_dir,
        status=args.status,
        reviewer=args.reviewer,
        notes=args.notes,
        passed_windows=split_values(args.passed_window),
        failed_windows=split_values(args.failed_window),
        issues=split_values(args.issue),
        confirm_human_listened=args.confirm_human_listened,
    )
    approval_preflight = validate_source_aware_approval_preflight(
        baseline_dir,
        status=decision["decisionStatus"],
        regenerate_fast_readback=not args.dry_run,
    )
    decision["sourceAwareApprovalPreflight"] = approval_preflight
    baseline_id = decision.get("baselineId", "unknown")
    version = version_from_baseline_id(baseline_id)
    timestamp = datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S")
    json_path = baseline_dir / f"audio-listen-decision-recorded-{version}-{timestamp}.json"
    md_path = baseline_dir / f"audio-listen-decision-recorded-{version}-{timestamp}.md"

    planned = {
        "json": str(json_path),
        "markdown": str(md_path),
        "decisionStatus": decision["decisionStatus"],
        "publicationApproved": decision["publicationApproved"],
        "dryRun": args.dry_run,
        "sourceAwareApprovalPreflightStatus": approval_preflight["status"],
        "sourceAwareApprovalPreflightPassed": approval_preflight["passed"],
    }
    if args.dry_run:
        print(json.dumps(planned, indent=2))
        return

    write_json(json_path, decision)
    md_path.write_text(render_markdown(decision), encoding="utf-8")

    manifest_path = baseline_dir / "manifest.json"
    manifest = read_json(manifest_path)
    outputs = manifest.setdefault("outputs", {})
    outputs["latestListenDecision"] = str(json_path)
    outputs["latestListenDecisionMarkdown"] = str(md_path)
    if decision["decisionStatus"] in APPROVAL_STATUSES:
        manifest["approvalStatus"] = decision["decisionStatus"]
    elif decision["decisionStatus"] in ("failed-human-listen", "needs-focused-proof"):
        manifest["approvalStatus"] = decision["decisionStatus"]
    # Approval is necessary but not sufficient. Keep branch readiness locked
    # until audio_workbench_branch_gate.py proves the source-aware stem/timing
    # contract and audio_workbench_branch_render_preflight.py proves render
    # readiness. This prevents a flattened mastered-WAV-only branch path from
    # sneaking in after a valid human listen decision.
    manifest["branchInheritanceReady"] = False
    manifest["branchRenderReady"] = False
    manifest["branchReadinessRefreshRequired"] = decision["decisionStatus"] in APPROVAL_STATUSES
    manifest["branchReadinessRequiresSourceAwareGate"] = True
    manifest["branchReadinessLastListenDecisionStatus"] = decision["decisionStatus"]
    manifest["branchRenderAudioTruth"] = "source-aware-refined-stems"
    manifest["masteredSpineUse"] = "review-export-premiere-final-podcast-convenience-not-editable-branch-truth"
    manifest["masteredSpineOnlyEditingAllowed"] = False
    manifest["branchReadinessNextAction"] = (
        "Run audio_workbench_post_listen_refresh.py so the source-aware branch "
        "gate, branch render preflight, approved executor, runway, and router "
        "refresh in order. Do not render from the mastered spine alone."
    )
    write_json(manifest_path, manifest)

    print(json.dumps(planned, indent=2))


if __name__ == "__main__":
    main()
