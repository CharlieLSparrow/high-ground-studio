#!/usr/bin/env python3
"""Parse a plain Codex-facing Episode 4 listen decision and route it safely.

This is not a second approval system. It is a small adapter for the current
human path:

    "Approve v006 audio spine"
    "Needs proof around 57:10"
    "Fail, Charlie sounds gated at 34:22"

The adapter preflights the package with the fast readback/source-aware timing
truth, then delegates to audio_workbench_record_listen_decision.py. By default
it dry-runs. Real recording requires --record and --confirm-human-listened.
"""

from __future__ import annotations

import argparse
import json
import re
import subprocess
import sys
from pathlib import Path
from typing import Any


APPROVE_STATUS = "human-approved-for-branch-inheritance"
NEEDS_PROOF_STATUS = "needs-focused-proof"
FAIL_STATUS = "failed-human-listen"
POST_DECISION_REFRESH_SCRIPT = "audio_workbench_post_listen_refresh.py"


def repo_root() -> Path:
    return Path(__file__).resolve().parents[3]


def read_json(path: Path) -> dict[str, Any]:
    return json.loads(path.read_text(encoding="utf-8"))


def resolve_baseline_dir(input_path: Path) -> Path:
    expanded = input_path.expanduser().resolve()
    if (expanded / "manifest.json").exists():
        return expanded
    nested = expanded / "work" / "conformed-production-baseline"
    if (nested / "manifest.json").exists():
        return nested
    raise FileNotFoundError(f"Could not find manifest.json under {expanded}")


def int_value(value: Any) -> int:
    try:
        return int(value)
    except (TypeError, ValueError):
        return 0


def bool_value(value: Any) -> bool:
    return value is True or str(value).strip().lower() == "true"


def normalize_text(value: str) -> str:
    return re.sub(r"\s+", " ", value.strip().lower())


def parse_decision(utterance: str) -> tuple[str, str]:
    text = normalize_text(utterance)
    if not text:
        raise ValueError("A listen-decision utterance is required.")

    proof_hit = any(
        phrase in text
        for phrase in (
            "needs proof",
            "need proof",
            "needs-proof",
            "focused proof",
            "more proof",
            "not sure",
            "unsure",
            "uncertain",
        )
    )
    fail_hit = any(
        phrase in text
        for phrase in (
            "fail",
            "failed",
            "needs repair",
            "need repair",
            "repair",
            "wrong",
            "bad",
            "gated",
            "missing",
            "echo",
        )
    )
    approve_hit = any(
        phrase in text
        for phrase in (
            "approve",
            "approved",
            "passes",
            "pass v006",
            "sounds good",
            "good to inherit",
        )
    )

    if approve_hit and (proof_hit or fail_hit):
        raise ValueError("Ambiguous listen decision: approval text is mixed with proof/failure language.")
    if proof_hit and fail_hit:
        raise ValueError("Ambiguous listen decision: needs-proof and failure/repair language are both present.")
    if approve_hit:
        return APPROVE_STATUS, "approve"
    if proof_hit:
        return NEEDS_PROOF_STATUS, "needs-proof"
    if fail_hit:
        return FAIL_STATUS, "fail"
    raise ValueError(
        "Could not parse the listen decision. Use phrases like "
        "'Approve v006 audio spine', 'Needs proof at 57:10', or 'Fail, echo at 34:22'."
    )


def run_command(command: list[str], *, cwd: Path, capture: bool = True) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        command,
        cwd=str(cwd),
        text=True,
        stdout=subprocess.PIPE if capture else None,
        stderr=subprocess.PIPE if capture else None,
        check=True,
    )


def run_fast_preflight(repo: Path, baseline_dir: Path) -> dict[str, Any]:
    run_command(
        [
            sys.executable,
            "apps/QuipslyStudio/script/audio_workbench_fast_readback_check.py",
            "--baseline-dir",
            str(baseline_dir),
        ],
        cwd=repo,
    )
    report = read_json(baseline_dir / "AUDIO_FAST_READBACK_CHECK.json")
    errors: list[str] = []
    if not bool_value(report.get("passed")):
        errors.append("fast readback did not pass")
    if int_value(report.get("hardStopCount")) != 0:
        errors.append(f"fast readback hard stops: {report.get('hardStopCount')}")
    if report.get("approvalStatus") != "machine-candidate-needs-human-listen-proof":
        errors.append(f"approval status is not waiting for human listen: {report.get('approvalStatus')}")
    if report.get("finalEpisodeGateStatus") != "locked-until-audio-spine-approved":
        errors.append(f"final episode gate is not locked: {report.get('finalEpisodeGateStatus')}")
    if report.get("shortsGateStatus") != "locked-until-audio-spine-approved":
        errors.append(f"shorts gate is not locked: {report.get('shortsGateStatus')}")
    if not bool_value(report.get("sourceAwareTimingContractReady")):
        errors.append("source-aware timing contract is not ready")
    if int_value(report.get("sourceAwareTimingContractHardStopCount")) != 0:
        errors.append("source-aware timing contract has hard stops")
    if report.get("postApprovalApprovedSandboxExecutorSourceAwareRenderContractReady") is not True:
        errors.append("approved sandbox executor source-aware render contract is not ready")
    if report.get("postApprovalApprovedSandboxExecutorInheritsSourceAwareAudioTruth") is not True:
        errors.append("approved sandbox executor does not inherit source-aware audio truth")
    if report.get("postApprovalApprovedSandboxExecutorMasteredSpineOnlyEditingAllowed") is not False:
        errors.append("approved sandbox executor allows mastered-spine-only editing")
    if report.get("postListenRefreshStatus") != "post-listen-refresh-waiting-for-human-listen":
        errors.append(f"post-listen refresh status is {report.get('postListenRefreshStatus')}")
    if int_value(report.get("postListenRefreshStepFailureCount")) != 0:
        errors.append(f"post-listen refresh step failures: {report.get('postListenRefreshStepFailureCount')}")
    if int_value(report.get("postListenRefreshHardStopCount")) != 0:
        errors.append(f"post-listen refresh hard stops: {report.get('postListenRefreshHardStopCount')}")
    if report.get("postListenRefreshBranchRenderAudioTruth") != "source-aware-refined-stems":
        errors.append(f"post-listen refresh audio truth is {report.get('postListenRefreshBranchRenderAudioTruth')}")
    if report.get("postListenRefreshMasteredSpineOnlyEditingAllowed") is not False:
        errors.append("post-listen refresh allows mastered-spine-only editing")
    if report.get("postListenRefreshBranchPreflightBranchAudioPlanStatus") != "ready-source-aware-refined-stem-plan":
        errors.append(
            "post-listen branch preflight plan is "
            f"{report.get('postListenRefreshBranchPreflightBranchAudioPlanStatus')}"
        )
    if int_value(report.get("postListenRefreshBranchPreflightBranchAudioPlanSelectedRefinedStemCount")) < 3:
        errors.append("post-listen branch preflight has too few refined stems")
    if report.get("postListenRefreshBranchPreflightBranchAudioPlanMissingRoleIds"):
        errors.append(
            "post-listen branch preflight has missing roles: "
            + ", ".join(str(role) for role in report.get("postListenRefreshBranchPreflightBranchAudioPlanMissingRoleIds"))
        )
    if int_value(report.get("postListenRefreshBranchPreflightBranchAudioPlanMissingStemPathCount")) != 0:
        errors.append("post-listen branch preflight has missing refined stem paths")
    if report.get("postListenRefreshBranchPreflightSourceAwareBranchRenderStemPathsProved") is not True:
        errors.append("post-listen branch preflight did not prove refined stem paths")
    if report.get("postListenRefreshBranchExecutorBranchAudioPlanStatus") != "ready-source-aware-refined-stem-plan":
        errors.append(
            "post-listen branch executor plan is "
            f"{report.get('postListenRefreshBranchExecutorBranchAudioPlanStatus')}"
        )
    if int_value(report.get("postListenRefreshBranchExecutorBranchAudioPlanSelectedRefinedStemCount")) < 3:
        errors.append("post-listen branch executor has too few refined stems")
    if report.get("postListenRefreshBranchExecutorBranchAudioPlanMissingRoleIds"):
        errors.append(
            "post-listen branch executor has missing roles: "
            + ", ".join(str(role) for role in report.get("postListenRefreshBranchExecutorBranchAudioPlanMissingRoleIds"))
        )
    if int_value(report.get("postListenRefreshBranchExecutorBranchAudioPlanMissingStemPathCount")) != 0:
        errors.append("post-listen branch executor has missing refined stem paths")
    if report.get("postListenRefreshBranchExecutorSourceAwareBranchRenderWillUseRefinedStems") is not True:
        errors.append("post-listen branch executor will not use refined stems")
    if report.get("postListenRefreshBranchExecutorSourceAwareBranchRenderStemPathsProved") is not True:
        errors.append("post-listen branch executor did not prove refined stem paths")
    if (
        report.get("renderAttempted")
        or report.get("uploadAttempted")
        or report.get("publicationAttempted")
        or report.get("originalMediaMutated")
    ):
        errors.append("safety flags changed during preflight")
    if errors:
        raise RuntimeError("Refusing listen decision intake: " + "; ".join(errors))
    return report


def refresh_post_decision_gates(repo: Path, baseline_dir: Path) -> list[dict[str, str]]:
    command = [
        sys.executable,
        f"apps/QuipslyStudio/script/{POST_DECISION_REFRESH_SCRIPT}",
        "--baseline-dir",
        str(baseline_dir),
    ]
    completed = run_command(command, cwd=repo)
    return [
        {
            "script": POST_DECISION_REFRESH_SCRIPT,
            "canonicalControlPlane": "true",
            "stdout": completed.stdout.strip(),
        }
    ]


def build_record_command(
    baseline_dir: Path,
    *,
    status: str,
    reviewer: str,
    notes: str,
    issues: list[str],
    confirm_human_listened: bool,
    record: bool,
) -> list[str]:
    command = [
        sys.executable,
        "apps/QuipslyStudio/script/audio_workbench_record_listen_decision.py",
        "--baseline-dir",
        str(baseline_dir),
        "--status",
        status,
        "--reviewer",
        reviewer,
        "--notes",
        notes,
    ]
    for issue in issues:
        command.extend(["--issue", issue])
    if confirm_human_listened:
        command.append("--confirm-human-listened")
    if not record:
        command.append("--dry-run")
    return command


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--baseline-dir", required=True, type=Path)
    parser.add_argument("--utterance", default="", help="Plain human message, for example 'Approve v006 audio spine'.")
    parser.add_argument("--reviewer", default="Charlie")
    parser.add_argument("--notes", default="")
    parser.add_argument("--issue", action="append", default=[])
    parser.add_argument("--confirm-human-listened", action="store_true")
    parser.add_argument("--record", action="store_true", help="Actually record the decision. Without this flag the adapter dry-runs.")
    parser.add_argument("--skip-refresh", action="store_true", help="Do not refresh post-decision gates after a real record.")
    args = parser.parse_args()

    repo = repo_root()
    baseline_dir = resolve_baseline_dir(args.baseline_dir)
    utterance = args.utterance.strip() or sys.stdin.read().strip()
    status, parsed_kind = parse_decision(utterance)
    notes = args.notes.strip() or utterance
    issues = [issue.strip() for issue in args.issue if issue.strip()]
    if status in {NEEDS_PROOF_STATUS, FAIL_STATUS} and not issues:
        issues.append(utterance)
    if args.record and not args.confirm_human_listened:
        raise ValueError("Real recording requires --confirm-human-listened.")

    preflight = run_fast_preflight(repo, baseline_dir)
    record_command_confirm_human_listened = bool(
        args.confirm_human_listened
        or (not args.record and status == APPROVE_STATUS)
    )
    record_command = build_record_command(
        baseline_dir,
        status=status,
        reviewer=args.reviewer,
        notes=notes,
        issues=issues,
        confirm_human_listened=record_command_confirm_human_listened,
        record=args.record,
    )
    record_result = run_command(record_command, cwd=repo)
    refresh_results: list[dict[str, str]] = []
    if args.record and not args.skip_refresh:
        refresh_results = refresh_post_decision_gates(repo, baseline_dir)

    print(
        json.dumps(
            {
                "schema": "quipsly.audio-workbench.codex-listen-decision-intake.v1",
                "baselineDir": str(baseline_dir),
                "utterance": utterance,
                "parsedDecision": parsed_kind,
                "decisionStatus": status,
                "reviewer": args.reviewer,
                "recorded": bool(args.record),
                "confirmHumanListened": bool(args.confirm_human_listened),
                "recordCommandConfirmHumanListened": record_command_confirm_human_listened,
                "dryRunApprovalRehearsalConfirmHumanListened": bool(
                    not args.record and status == APPROVE_STATUS and record_command_confirm_human_listened
                ),
                "preflightStatus": preflight.get("status"),
                "preflightPassed": bool_value(preflight.get("passed")),
                "preflightHardStopCount": int_value(preflight.get("hardStopCount")),
                "finalEpisodeGateStatus": preflight.get("finalEpisodeGateStatus"),
                "shortsGateStatus": preflight.get("shortsGateStatus"),
                "sourceAwareTimingContractReady": bool_value(preflight.get("sourceAwareTimingContractReady")),
                "sourceAwareTimingContractReadyRoleCount": int_value(preflight.get("sourceAwareTimingContractReadyRoleCount")),
                "sourceAwareTimingContractHardStopCount": int_value(preflight.get("sourceAwareTimingContractHardStopCount")),
                "postApprovalApprovedSandboxExecutorSourceAwareRenderContractReady": bool_value(
                    preflight.get("postApprovalApprovedSandboxExecutorSourceAwareRenderContractReady")
                ),
                "postApprovalApprovedSandboxExecutorInheritsSourceAwareAudioTruth": bool_value(
                    preflight.get("postApprovalApprovedSandboxExecutorInheritsSourceAwareAudioTruth")
                ),
                "postApprovalApprovedSandboxExecutorMasteredSpineOnlyEditingAllowed": bool_value(
                    preflight.get("postApprovalApprovedSandboxExecutorMasteredSpineOnlyEditingAllowed")
                ),
                "postListenRefreshStatus": preflight.get("postListenRefreshStatus"),
                "postListenRefreshStepFailureCount": int_value(preflight.get("postListenRefreshStepFailureCount")),
                "postListenRefreshHardStopCount": int_value(preflight.get("postListenRefreshHardStopCount")),
                "postListenRefreshBranchRenderAudioTruth": preflight.get("postListenRefreshBranchRenderAudioTruth"),
                "postListenRefreshMasteredSpineOnlyEditingAllowed": bool_value(
                    preflight.get("postListenRefreshMasteredSpineOnlyEditingAllowed")
                ),
                "postListenRefreshBranchPreflightBranchAudioPlanStatus": preflight.get(
                    "postListenRefreshBranchPreflightBranchAudioPlanStatus"
                ),
                "postListenRefreshBranchPreflightBranchAudioPlanSelectedRefinedStemCount": int_value(
                    preflight.get("postListenRefreshBranchPreflightBranchAudioPlanSelectedRefinedStemCount")
                ),
                "postListenRefreshBranchPreflightBranchAudioPlanMissingRoleIds": preflight.get(
                    "postListenRefreshBranchPreflightBranchAudioPlanMissingRoleIds"
                )
                or [],
                "postListenRefreshBranchPreflightBranchAudioPlanMissingStemPathCount": int_value(
                    preflight.get("postListenRefreshBranchPreflightBranchAudioPlanMissingStemPathCount")
                ),
                "postListenRefreshBranchPreflightSourceAwareBranchRenderStemPathsProved": bool_value(
                    preflight.get("postListenRefreshBranchPreflightSourceAwareBranchRenderStemPathsProved")
                ),
                "postListenRefreshBranchExecutorBranchAudioPlanStatus": preflight.get(
                    "postListenRefreshBranchExecutorBranchAudioPlanStatus"
                ),
                "postListenRefreshBranchExecutorBranchAudioPlanSelectedRefinedStemCount": int_value(
                    preflight.get("postListenRefreshBranchExecutorBranchAudioPlanSelectedRefinedStemCount")
                ),
                "postListenRefreshBranchExecutorBranchAudioPlanMissingRoleIds": preflight.get(
                    "postListenRefreshBranchExecutorBranchAudioPlanMissingRoleIds"
                )
                or [],
                "postListenRefreshBranchExecutorBranchAudioPlanMissingStemPathCount": int_value(
                    preflight.get("postListenRefreshBranchExecutorBranchAudioPlanMissingStemPathCount")
                ),
                "postListenRefreshBranchExecutorSourceAwareBranchRenderWillUseRefinedStems": bool_value(
                    preflight.get("postListenRefreshBranchExecutorSourceAwareBranchRenderWillUseRefinedStems")
                ),
                "postListenRefreshBranchExecutorSourceAwareBranchRenderStemPathsProved": bool_value(
                    preflight.get("postListenRefreshBranchExecutorSourceAwareBranchRenderStemPathsProved")
                ),
                "renderAttempted": bool_value(preflight.get("renderAttempted")),
                "uploadAttempted": bool_value(preflight.get("uploadAttempted")),
                "publicationAttempted": bool_value(preflight.get("publicationAttempted")),
                "originalMediaMutated": bool_value(preflight.get("originalMediaMutated")),
                "recordCommandDryRun": not bool(args.record),
                "recordCommandStdout": record_result.stdout.strip(),
                "postDecisionRefreshCanonicalScript": POST_DECISION_REFRESH_SCRIPT,
                "postDecisionRefreshUsesCanonicalControlPlane": True,
                "postDecisionRefreshRan": bool(refresh_results),
                "postDecisionRefreshResults": refresh_results,
            },
            indent=2,
            sort_keys=True,
        )
    )


if __name__ == "__main__":
    main()
