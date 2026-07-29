#!/usr/bin/env python3
"""Smoke-test Episode audio manifest readback fields against latest reports.

The manifest is the control-plane API for humans and agents. This smoke proves
that the promoted top-level readback fields still agree with the reports they
summarize. It does not approve audio, unlock branches, render media, upload,
publish, or mutate original media.
"""

from __future__ import annotations

import argparse
import html
import json
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


@dataclass
class Check:
    name: str
    passed: bool
    expected: Any
    actual: Any
    detail: str


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


def load_output_report(outputs: dict[str, Any], key: str) -> tuple[dict[str, Any], str | None]:
    path = output_path(outputs.get(key))
    if not path:
        return {}, None
    report_path = Path(path)
    if not report_path.exists() or report_path.suffix.lower() != ".json":
        return {}, path
    try:
        return read_json(report_path), path
    except json.JSONDecodeError:
        return {}, path


def safe_slug(value: str) -> str:
    out = "".join(ch.lower() if ch.isalnum() else "-" for ch in str(value))
    while "--" in out:
        out = out.replace("--", "-")
    return out.strip("-") or "audio-baseline"


def shell_quote(value: str) -> str:
    return "'" + value.replace("'", "'\\''") + "'"


def int_value(value: Any) -> int:
    try:
        return int(value)
    except (TypeError, ValueError):
        return 0


def bool_value(value: Any) -> bool:
    return bool(value)


def list_count(report: dict[str, Any], count_key: str, list_key: str) -> int:
    value = report.get(count_key)
    if value not in (None, ""):
        return int_value(value)
    rows = report.get(list_key)
    if isinstance(rows, list):
        return len(rows)
    return 0


def pick(report: dict[str, Any], *keys: str, fallback: Any = None) -> Any:
    for key in keys:
        value = report.get(key)
        if value not in (None, ""):
            return value
    return fallback


def add_check(checks: list[Check], name: str, expected: Any, actual: Any, detail: str = "") -> None:
    checks.append(Check(name=name, passed=expected == actual, expected=expected, actual=actual, detail=detail))


def add_presence_check(checks: list[Check], name: str, report: dict[str, Any], path: str | None) -> None:
    checks.append(
        Check(
            name=name,
            passed=bool(report),
            expected="present JSON report",
            actual=path or "missing",
            detail="latest output report can be loaded",
        )
    )


def add_output_file_check(checks: list[Check], outputs: dict[str, Any], key: str, name: str) -> None:
    path = output_path(outputs.get(key))
    exists = bool(path and Path(path).exists())
    checks.append(
        Check(
            name=name,
            passed=exists,
            expected="present file",
            actual=path or "missing",
            detail=key,
        )
    )


def add_false_safety_check(
    checks: list[Check],
    name: str,
    report: dict[str, Any],
    report_key: str,
    manifest: dict[str, Any],
    manifest_key: str,
    detail: str,
) -> None:
    add_check(checks, f"{name}-report", False, bool_value(report.get(report_key)), detail)
    add_check(checks, f"{name}-manifest", False, bool_value(manifest.get(manifest_key)), detail)


def build_report(manifest: dict[str, Any], baseline_dir: Path, generated_at: str) -> dict[str, Any]:
    outputs = manifest.get("outputs") or {}
    checks: list[Check] = []

    command_center, command_center_path = load_output_report(outputs, "latestAudioProducerCommandCenter")
    add_presence_check(checks, "producer-command-center-report-present", command_center, command_center_path)
    if command_center:
        command_status = pick(command_center, "commandCenterStatus", "status")
        add_check(checks, "command-center-status", command_status, manifest.get("audioCommandCenterLatestStatus"), command_center_path or "")
        add_check(checks, "command-center-primary-count", int_value(command_center.get("primaryArtifactCount")), int_value(manifest.get("audioCommandCenterPrimaryArtifactCount")), command_center_path or "")
        add_check(checks, "command-center-review-card-count", int_value(command_center.get("reviewCardCount")), int_value(manifest.get("audioCommandCenterReviewCardCount")), command_center_path or "")
        add_check(checks, "command-center-missing-primary-count", int_value(command_center.get("missingPrimaryArtifactCount")), int_value(manifest.get("audioCommandCenterMissingPrimaryArtifactCount")), command_center_path or "")

    listen_decision_command_center, listen_decision_command_center_path = load_output_report(outputs, "latestAudioListenDecisionCommandCenter")
    fast_readback, fast_readback_path = load_output_report(outputs, "latestAudioFastReadbackCheck")
    add_presence_check(checks, "fast-readback-check-report-present", fast_readback, fast_readback_path)
    add_output_file_check(checks, outputs, "latestAudioFastReadbackCheckMarkdown", "fast-readback-check-markdown-present")
    add_output_file_check(checks, outputs, "latestAudioFastReadbackCheckHtml", "fast-readback-check-html-present")
    add_output_file_check(checks, outputs, "latestAudioFastReadbackCheckOpenCommand", "fast-readback-check-open-command-present")
    if fast_readback:
        add_check(checks, "fast-readback-check-status", fast_readback.get("status"), manifest.get("audioFastReadbackCheckLatestStatus"), fast_readback_path or "")
        add_check(checks, "fast-readback-check-passed", bool_value(fast_readback.get("passed")), bool_value(manifest.get("audioFastReadbackCheckPassed")), fast_readback_path or "")
        add_check(checks, "fast-readback-check-count", int_value(fast_readback.get("checkCount")), int_value(manifest.get("audioFastReadbackCheckCheckCount")), fast_readback_path or "")
        add_check(checks, "fast-readback-check-hard-stops", int_value(fast_readback.get("hardStopCount")), int_value(manifest.get("audioFastReadbackCheckHardStopCount")), fast_readback_path or "")
        add_check(checks, "fast-readback-check-warnings", int_value(fast_readback.get("warningCount")), int_value(manifest.get("audioFastReadbackCheckWarningCount")), fast_readback_path or "")
        add_check(checks, "fast-readback-check-approval-status", fast_readback.get("approvalStatus"), manifest.get("audioFastReadbackCheckApprovalStatus"), fast_readback_path or "")
        add_check(checks, "fast-readback-check-package-ready", bool_value(fast_readback.get("packageReadyForHumanListen")), bool_value(manifest.get("audioFastReadbackCheckPackageReadyForHumanListen")), fast_readback_path or "")
        add_check(checks, "fast-readback-check-branch-inheritance", bool_value(fast_readback.get("branchInheritanceReady")), bool_value(manifest.get("audioFastReadbackCheckBranchInheritanceReady")), fast_readback_path or "")
        add_check(checks, "fast-readback-check-branch-render", bool_value(fast_readback.get("branchRenderReady")), bool_value(manifest.get("audioFastReadbackCheckBranchRenderReady")), fast_readback_path or "")
        add_check(checks, "fast-readback-check-final-episode-gate", fast_readback.get("finalEpisodeGateStatus"), manifest.get("audioFastReadbackCheckFinalEpisodeGateStatus"), fast_readback_path or "")
        add_check(checks, "fast-readback-check-shorts-gate", fast_readback.get("shortsGateStatus"), manifest.get("audioFastReadbackCheckShortsGateStatus"), fast_readback_path or "")
        add_check(checks, "fast-readback-check-source-stems", int_value(fast_readback.get("sourceAwareStemResolvedCount")), int_value(manifest.get("audioFastReadbackCheckSourceAwareStemResolvedCount")), fast_readback_path or "")
        add_check(checks, "fast-readback-check-source-aware-timing-status", fast_readback.get("sourceAwareTimingContractStatus"), manifest.get("audioFastReadbackCheckSourceAwareTimingContractStatus"), fast_readback_path or "")
        add_check(checks, "fast-readback-check-source-aware-timing-ready", bool_value(fast_readback.get("sourceAwareTimingContractReady")), bool_value(manifest.get("audioFastReadbackCheckSourceAwareTimingContractReady")), fast_readback_path or "")
        add_check(checks, "fast-readback-check-source-aware-timing-roles", int_value(fast_readback.get("sourceAwareTimingContractReadyRoleCount")), int_value(manifest.get("audioFastReadbackCheckSourceAwareTimingContractReadyRoleCount")), fast_readback_path or "")
        add_check(checks, "fast-readback-check-source-aware-timing-full-length-stems", int_value(fast_readback.get("sourceAwareTimingContractFullLengthStemCount")), int_value(manifest.get("audioFastReadbackCheckSourceAwareTimingContractFullLengthStemCount")), fast_readback_path or "")
        add_check(checks, "fast-readback-check-source-aware-timing-hard-stops", int_value(fast_readback.get("sourceAwareTimingContractHardStopCount")), int_value(manifest.get("audioFastReadbackCheckSourceAwareTimingContractHardStopCount")), fast_readback_path or "")
        add_check(checks, "fast-readback-check-source-aware-timing-max-delta", fast_readback.get("sourceAwareTimingContractMaxDurationDeltaToMasterSeconds"), manifest.get("audioFastReadbackCheckSourceAwareTimingContractMaxDurationDeltaToMasterSeconds"), fast_readback_path or "")
        add_check(checks, "fast-readback-check-segment-windows", int_value(fast_readback.get("segmentLoudnessReviewWindowCount")), int_value(manifest.get("audioFastReadbackCheckSegmentReviewWindowCount")), fast_readback_path or "")
        add_check(checks, "fast-readback-check-post-approval-status", fast_readback.get("postApprovalRenderRehearsalStatus"), manifest.get("audioFastReadbackCheckPostApprovalRenderRehearsalStatus"), fast_readback_path or "")
        add_check(checks, "fast-readback-check-post-approval-branches", int_value(fast_readback.get("postApprovalRenderRehearsalBranchCount")), int_value(manifest.get("audioFastReadbackCheckPostApprovalRenderRehearsalBranchCount")), fast_readback_path or "")
        add_check(checks, "fast-readback-check-post-approval-missing-inputs", int_value(fast_readback.get("postApprovalRenderRehearsalMissingInputCount")), int_value(manifest.get("audioFastReadbackCheckPostApprovalRenderRehearsalMissingInputCount")), fast_readback_path or "")
        add_check(checks, "fast-readback-check-post-approval-hard-stops", int_value(fast_readback.get("postApprovalRenderRehearsalHardStopCount")), int_value(manifest.get("audioFastReadbackCheckPostApprovalRenderRehearsalHardStopCount")), fast_readback_path or "")
        add_check(checks, "fast-readback-check-post-approval-source-aware-inherited", bool_value(fast_readback.get("postApprovalRenderRehearsalInheritsSourceAwareAudioTruth")), bool_value(manifest.get("audioFastReadbackCheckPostApprovalInheritsSourceAwareAudioTruth")), fast_readback_path or "")
        add_check(checks, "fast-readback-check-post-approval-source-aware-status", fast_readback.get("postApprovalRenderRehearsalSourceAwareAudioContractStatus"), manifest.get("audioFastReadbackCheckPostApprovalSourceAwareAudioContractStatus"), fast_readback_path or "")
        add_check(checks, "fast-readback-check-post-approval-source-aware-roles", sorted(str(role) for role in (fast_readback.get("postApprovalRenderRehearsalSourceAwareAudioRoleIds") or [])), sorted(str(role) for role in (manifest.get("audioFastReadbackCheckPostApprovalSourceAwareAudioRoleIds") or [])), fast_readback_path or "")
        add_check(checks, "fast-readback-check-post-approval-mastered-spine-only-forbidden", bool_value(fast_readback.get("postApprovalRenderRehearsalMasteredSpineOnlyEditingAllowed")), bool_value(manifest.get("audioFastReadbackCheckPostApprovalMasteredSpineOnlyEditingAllowed")), fast_readback_path or "")
        add_check(checks, "fast-readback-check-post-approval-sandbox-passed", bool_value(fast_readback.get("postApprovalApprovedSandboxPassed")), bool_value(manifest.get("audioFastReadbackCheckPostApprovalApprovedSandboxPassed")), fast_readback_path or "")
        add_check(checks, "fast-readback-check-post-approval-sandbox-branches", int_value(fast_readback.get("postApprovalApprovedSandboxBranchCount")), int_value(manifest.get("audioFastReadbackCheckPostApprovalApprovedSandboxBranchCount")), fast_readback_path or "")
        add_check(checks, "fast-readback-check-post-approval-sandbox-executor", fast_readback.get("postApprovalApprovedSandboxExecutorStatus"), manifest.get("audioFastReadbackCheckPostApprovalApprovedSandboxExecutorStatus"), fast_readback_path or "")
        add_check(checks, "fast-readback-check-post-approval-sandbox-executor-source-aware-ready", bool_value(fast_readback.get("postApprovalApprovedSandboxExecutorSourceAwareRenderContractReady")), bool_value(manifest.get("audioFastReadbackCheckPostApprovalApprovedSandboxExecutorSourceAwareRenderContractReady")), fast_readback_path or "")
        add_check(checks, "fast-readback-check-post-approval-sandbox-executor-source-aware-inherited", bool_value(fast_readback.get("postApprovalApprovedSandboxExecutorInheritsSourceAwareAudioTruth")), bool_value(manifest.get("audioFastReadbackCheckPostApprovalApprovedSandboxExecutorInheritsSourceAwareAudioTruth")), fast_readback_path or "")
        add_check(checks, "fast-readback-check-post-approval-sandbox-executor-source-aware-status", fast_readback.get("postApprovalApprovedSandboxExecutorSourceAwareAudioContractStatus"), manifest.get("audioFastReadbackCheckPostApprovalApprovedSandboxExecutorSourceAwareAudioContractStatus"), fast_readback_path or "")
        add_check(checks, "fast-readback-check-post-approval-sandbox-executor-source-aware-roles", sorted(str(role) for role in (fast_readback.get("postApprovalApprovedSandboxExecutorSourceAwareAudioRoleIds") or [])), sorted(str(role) for role in (manifest.get("audioFastReadbackCheckPostApprovalApprovedSandboxExecutorSourceAwareAudioRoleIds") or [])), fast_readback_path or "")
        add_check(checks, "fast-readback-check-post-approval-sandbox-executor-mastered-spine-only-forbidden", bool_value(fast_readback.get("postApprovalApprovedSandboxExecutorMasteredSpineOnlyEditingAllowed")), bool_value(manifest.get("audioFastReadbackCheckPostApprovalApprovedSandboxExecutorMasteredSpineOnlyEditingAllowed")), fast_readback_path or "")
        add_check(checks, "fast-readback-check-branch-render-preflight-status", fast_readback.get("branchRenderPreflightStatus"), manifest.get("audioFastReadbackCheckBranchRenderPreflightStatus"), fast_readback_path or "")
        add_check(checks, "fast-readback-check-branch-render-preflight-can-render", bool_value(fast_readback.get("branchRenderPreflightCanRenderBranches")), bool_value(manifest.get("audioFastReadbackCheckBranchRenderPreflightCanRenderBranches")), fast_readback_path or "")
        add_check(checks, "fast-readback-check-branch-render-preflight-source-aware-ready", bool_value(fast_readback.get("branchRenderPreflightSourceAwareAudioTruthReady")), bool_value(manifest.get("audioFastReadbackCheckBranchRenderPreflightSourceAwareAudioTruthReady")), fast_readback_path or "")
        add_check(checks, "fast-readback-check-branch-render-preflight-audio-truth", fast_readback.get("branchRenderPreflightBranchRenderAudioTruth"), manifest.get("audioFastReadbackCheckBranchRenderPreflightBranchRenderAudioTruth"), fast_readback_path or "")
        add_check(checks, "fast-readback-check-branch-render-preflight-branch-audio-plan-status", fast_readback.get("branchRenderPreflightBranchAudioPlanStatus"), manifest.get("audioFastReadbackCheckBranchRenderPreflightBranchAudioPlanStatus"), fast_readback_path or "")
        add_check(checks, "fast-readback-check-branch-render-preflight-branch-audio-plan-stems", int_value(fast_readback.get("branchRenderPreflightBranchAudioPlanSelectedRefinedStemCount")), int_value(manifest.get("audioFastReadbackCheckBranchRenderPreflightBranchAudioPlanSelectedRefinedStemCount")), fast_readback_path or "")
        add_check(checks, "fast-readback-check-branch-render-preflight-branch-audio-plan-missing-roles", sorted(str(role) for role in (fast_readback.get("branchRenderPreflightBranchAudioPlanMissingRoleIds") or [])), sorted(str(role) for role in (manifest.get("audioFastReadbackCheckBranchRenderPreflightBranchAudioPlanMissingRoleIds") or [])), fast_readback_path or "")
        add_check(checks, "fast-readback-check-branch-render-preflight-branch-audio-plan-missing-paths", int_value(fast_readback.get("branchRenderPreflightBranchAudioPlanMissingStemPathCount")), int_value(manifest.get("audioFastReadbackCheckBranchRenderPreflightBranchAudioPlanMissingStemPathCount")), fast_readback_path or "")
        add_check(checks, "fast-readback-check-branch-render-preflight-will-use-refined-stems", bool_value(fast_readback.get("branchRenderPreflightSourceAwareBranchRenderWillUseRefinedStems")), bool_value(manifest.get("audioFastReadbackCheckBranchRenderPreflightSourceAwareBranchRenderWillUseRefinedStems")), fast_readback_path or "")
        add_check(checks, "fast-readback-check-branch-render-preflight-stem-paths-proved", bool_value(fast_readback.get("branchRenderPreflightSourceAwareBranchRenderStemPathsProved")), bool_value(manifest.get("audioFastReadbackCheckBranchRenderPreflightSourceAwareBranchRenderStemPathsProved")), fast_readback_path or "")
        add_check(checks, "fast-readback-check-branch-render-preflight-master-only-forbidden", bool_value(fast_readback.get("branchRenderPreflightMasteredSpineOnlyEditingAllowed")), bool_value(manifest.get("audioFastReadbackCheckBranchRenderPreflightMasteredSpineOnlyEditingAllowed")), fast_readback_path or "")
        add_check(checks, "fast-readback-check-branch-render-preflight-commands-hidden", bool_value(fast_readback.get("branchRenderPreflightRealBranchRenderCommandsExposed")), bool_value(manifest.get("audioFastReadbackCheckBranchRenderPreflightRealBranchRenderCommandsExposed")), fast_readback_path or "")
        add_check(checks, "fast-readback-check-post-listen-refresh-status", fast_readback.get("postListenRefreshStatus"), manifest.get("audioFastReadbackCheckPostListenRefreshStatus"), fast_readback_path or "")
        add_check(checks, "fast-readback-check-post-listen-refresh-steps", int_value(fast_readback.get("postListenRefreshStepCount")), int_value(manifest.get("audioFastReadbackCheckPostListenRefreshStepCount")), fast_readback_path or "")
        add_check(checks, "fast-readback-check-post-listen-refresh-step-failures", int_value(fast_readback.get("postListenRefreshStepFailureCount")), int_value(manifest.get("audioFastReadbackCheckPostListenRefreshStepFailureCount")), fast_readback_path or "")
        add_check(checks, "fast-readback-check-post-listen-refresh-hard-stops", int_value(fast_readback.get("postListenRefreshHardStopCount")), int_value(manifest.get("audioFastReadbackCheckPostListenRefreshHardStopCount")), fast_readback_path or "")
        add_check(checks, "fast-readback-check-post-listen-refresh-audio-truth", fast_readback.get("postListenRefreshBranchRenderAudioTruth"), manifest.get("audioFastReadbackCheckPostListenRefreshBranchRenderAudioTruth"), fast_readback_path or "")
        add_check(checks, "fast-readback-check-post-listen-refresh-master-only-forbidden", bool_value(fast_readback.get("postListenRefreshMasteredSpineOnlyEditingAllowed")), bool_value(manifest.get("audioFastReadbackCheckPostListenRefreshMasteredSpineOnlyEditingAllowed")), fast_readback_path or "")
        add_check(checks, "fast-readback-check-post-listen-refresh-preflight-plan-status", fast_readback.get("postListenRefreshBranchPreflightBranchAudioPlanStatus"), manifest.get("audioFastReadbackCheckPostListenRefreshBranchPreflightBranchAudioPlanStatus"), fast_readback_path or "")
        add_check(checks, "fast-readback-check-post-listen-refresh-preflight-plan-stems", int_value(fast_readback.get("postListenRefreshBranchPreflightBranchAudioPlanSelectedRefinedStemCount")), int_value(manifest.get("audioFastReadbackCheckPostListenRefreshBranchPreflightBranchAudioPlanSelectedRefinedStemCount")), fast_readback_path or "")
        add_check(checks, "fast-readback-check-post-listen-refresh-preflight-missing-roles", sorted(str(role) for role in (fast_readback.get("postListenRefreshBranchPreflightBranchAudioPlanMissingRoleIds") or [])), sorted(str(role) for role in (manifest.get("audioFastReadbackCheckPostListenRefreshBranchPreflightBranchAudioPlanMissingRoleIds") or [])), fast_readback_path or "")
        add_check(checks, "fast-readback-check-post-listen-refresh-preflight-missing-paths", int_value(fast_readback.get("postListenRefreshBranchPreflightBranchAudioPlanMissingStemPathCount")), int_value(manifest.get("audioFastReadbackCheckPostListenRefreshBranchPreflightBranchAudioPlanMissingStemPathCount")), fast_readback_path or "")
        add_check(checks, "fast-readback-check-post-listen-refresh-preflight-stem-paths-proved", bool_value(fast_readback.get("postListenRefreshBranchPreflightSourceAwareBranchRenderStemPathsProved")), bool_value(manifest.get("audioFastReadbackCheckPostListenRefreshBranchPreflightSourceAwareBranchRenderStemPathsProved")), fast_readback_path or "")
        add_check(checks, "fast-readback-check-post-listen-refresh-executor-plan-status", fast_readback.get("postListenRefreshBranchExecutorBranchAudioPlanStatus"), manifest.get("audioFastReadbackCheckPostListenRefreshBranchExecutorBranchAudioPlanStatus"), fast_readback_path or "")
        add_check(checks, "fast-readback-check-post-listen-refresh-executor-plan-stems", int_value(fast_readback.get("postListenRefreshBranchExecutorBranchAudioPlanSelectedRefinedStemCount")), int_value(manifest.get("audioFastReadbackCheckPostListenRefreshBranchExecutorBranchAudioPlanSelectedRefinedStemCount")), fast_readback_path or "")
        add_check(checks, "fast-readback-check-post-listen-refresh-executor-missing-roles", sorted(str(role) for role in (fast_readback.get("postListenRefreshBranchExecutorBranchAudioPlanMissingRoleIds") or [])), sorted(str(role) for role in (manifest.get("audioFastReadbackCheckPostListenRefreshBranchExecutorBranchAudioPlanMissingRoleIds") or [])), fast_readback_path or "")
        add_check(checks, "fast-readback-check-post-listen-refresh-executor-missing-paths", int_value(fast_readback.get("postListenRefreshBranchExecutorBranchAudioPlanMissingStemPathCount")), int_value(manifest.get("audioFastReadbackCheckPostListenRefreshBranchExecutorBranchAudioPlanMissingStemPathCount")), fast_readback_path or "")
        add_check(checks, "fast-readback-check-post-listen-refresh-executor-refined-stems", bool_value(fast_readback.get("postListenRefreshBranchExecutorSourceAwareBranchRenderWillUseRefinedStems")), bool_value(manifest.get("audioFastReadbackCheckPostListenRefreshBranchExecutorSourceAwareBranchRenderWillUseRefinedStems")), fast_readback_path or "")
        add_check(checks, "fast-readback-check-post-listen-refresh-executor-stem-paths-proved", bool_value(fast_readback.get("postListenRefreshBranchExecutorSourceAwareBranchRenderStemPathsProved")), bool_value(manifest.get("audioFastReadbackCheckPostListenRefreshBranchExecutorSourceAwareBranchRenderStemPathsProved")), fast_readback_path or "")
        add_false_safety_check(checks, "fast-readback-check-approval-state-changed", fast_readback, "approvalStateChanged", manifest, "audioFastReadbackCheckApprovalStateChanged", fast_readback_path or "")
        add_false_safety_check(checks, "fast-readback-check-branch-state-changed", fast_readback, "branchStateChanged", manifest, "audioFastReadbackCheckBranchStateChanged", fast_readback_path or "")
        add_false_safety_check(checks, "fast-readback-check-render-attempted", fast_readback, "renderAttempted", manifest, "audioFastReadbackCheckRenderAttempted", fast_readback_path or "")
        add_false_safety_check(checks, "fast-readback-check-upload-attempted", fast_readback, "uploadAttempted", manifest, "audioFastReadbackCheckUploadAttempted", fast_readback_path or "")
        add_false_safety_check(checks, "fast-readback-check-publication-attempted", fast_readback, "publicationAttempted", manifest, "audioFastReadbackCheckPublicationAttempted", fast_readback_path or "")
        add_false_safety_check(checks, "fast-readback-check-original-media-mutated", fast_readback, "originalMediaMutated", manifest, "audioFastReadbackCheckOriginalMediaMutated", fast_readback_path or "")

    add_presence_check(checks, "listen-decision-command-center-report-present", listen_decision_command_center, listen_decision_command_center_path)
    add_output_file_check(checks, outputs, "latestAudioListenDecisionCommandCenterMarkdown", "listen-decision-command-center-markdown-present")
    add_output_file_check(checks, outputs, "latestAudioListenDecisionCommandCenterHtml", "listen-decision-command-center-html-present")
    add_output_file_check(checks, outputs, "latestAudioListenDecisionCommandCenterOpenCommand", "listen-decision-command-center-open-command-present")
    if listen_decision_command_center:
        add_check(checks, "listen-decision-command-center-status", listen_decision_command_center.get("status"), manifest.get("audioListenDecisionCommandCenterLatestStatus"), listen_decision_command_center_path or "")
        add_check(checks, "listen-decision-command-center-required-artifacts", int_value(listen_decision_command_center.get("requiredArtifactCount")), int_value(manifest.get("audioListenDecisionCommandCenterRequiredArtifactCount")), listen_decision_command_center_path or "")
        add_check(checks, "listen-decision-command-center-missing-artifacts", int_value(listen_decision_command_center.get("missingRequiredArtifactCount")), int_value(manifest.get("audioListenDecisionCommandCenterMissingRequiredArtifactCount")), listen_decision_command_center_path or "")
        add_check(checks, "listen-decision-command-center-approval-status", listen_decision_command_center.get("approvalStatus"), manifest.get("audioListenDecisionCommandCenterApprovalStatus"), listen_decision_command_center_path or "")
        add_check(checks, "listen-decision-command-center-package-ready", bool_value(listen_decision_command_center.get("packageReadyForHumanListen")), bool_value(manifest.get("audioListenDecisionCommandCenterPackageReadyForHumanListen")), listen_decision_command_center_path or "")
        add_check(checks, "listen-decision-command-center-branch-inheritance", bool_value(listen_decision_command_center.get("branchInheritanceReady")), bool_value(manifest.get("audioListenDecisionCommandCenterBranchInheritanceReady")), listen_decision_command_center_path or "")
        add_check(checks, "listen-decision-command-center-branch-render", bool_value(listen_decision_command_center.get("branchRenderReady")), bool_value(manifest.get("audioListenDecisionCommandCenterBranchRenderReady")), listen_decision_command_center_path or "")
        add_check(checks, "listen-decision-command-center-audio-truth", listen_decision_command_center.get("branchRenderAudioTruth"), manifest.get("audioListenDecisionCommandCenterBranchRenderAudioTruth"), listen_decision_command_center_path or "")
        add_check(checks, "listen-decision-command-center-master-only-forbidden", bool_value(listen_decision_command_center.get("masteredSpineOnlyEditingAllowed")), bool_value(manifest.get("audioListenDecisionCommandCenterMasteredSpineOnlyEditingAllowed")), listen_decision_command_center_path or "")
        add_check(checks, "listen-decision-command-center-listen-file", listen_decision_command_center.get("recommendedListenFile"), manifest.get("audioListenDecisionCommandCenterRecommendedListenFile"), listen_decision_command_center_path or "")
        add_check(checks, "listen-decision-command-center-listen-file-exists", bool_value(listen_decision_command_center.get("recommendedListenFileExists")), bool_value(manifest.get("audioListenDecisionCommandCenterRecommendedListenFileExists")), listen_decision_command_center_path or "")
        add_check(checks, "listen-decision-command-center-record-command", listen_decision_command_center.get("recordDecisionCommand"), manifest.get("audioListenDecisionCommandCenterRecordDecisionCommand"), listen_decision_command_center_path or "")
        add_check(checks, "listen-decision-command-center-fast-readback-status", listen_decision_command_center.get("fastReadbackStatus"), manifest.get("audioListenDecisionCommandCenterFastReadbackStatus"), listen_decision_command_center_path or "")
        add_check(checks, "listen-decision-command-center-fast-readback-passed", bool_value(listen_decision_command_center.get("fastReadbackPassed")), bool_value(manifest.get("audioListenDecisionCommandCenterFastReadbackPassed")), listen_decision_command_center_path or "")
        add_check(checks, "listen-decision-command-center-fast-readback-hard-stops", int_value(listen_decision_command_center.get("fastReadbackHardStopCount")), int_value(manifest.get("audioListenDecisionCommandCenterFastReadbackHardStopCount")), listen_decision_command_center_path or "")
        add_check(checks, "listen-decision-command-center-source-aware-ready", bool_value(listen_decision_command_center.get("sourceAwareReady")), bool_value(manifest.get("audioListenDecisionCommandCenterSourceAwareReady")), listen_decision_command_center_path or "")
        add_check(checks, "listen-decision-command-center-source-aware-timing-status", listen_decision_command_center.get("sourceAwareTimingContractStatus"), manifest.get("audioListenDecisionCommandCenterSourceAwareTimingContractStatus"), listen_decision_command_center_path or "")
        add_check(checks, "listen-decision-command-center-source-aware-timing-ready", bool_value(listen_decision_command_center.get("sourceAwareTimingContractReady")), bool_value(manifest.get("audioListenDecisionCommandCenterSourceAwareTimingContractReady")), listen_decision_command_center_path or "")
        add_check(checks, "listen-decision-command-center-source-aware-timing-roles", int_value(listen_decision_command_center.get("sourceAwareTimingContractReadyRoleCount")), int_value(manifest.get("audioListenDecisionCommandCenterSourceAwareTimingContractReadyRoleCount")), listen_decision_command_center_path or "")
        add_check(checks, "listen-decision-command-center-stem-count", int_value(listen_decision_command_center.get("sourceAwareStemResolvedCount")), int_value(manifest.get("audioListenDecisionCommandCenterSourceAwareStemResolvedCount")), listen_decision_command_center_path or "")
        add_check(checks, "listen-decision-command-center-post-approval-status", listen_decision_command_center.get("postApprovalRenderRehearsalStatus"), manifest.get("audioListenDecisionCommandCenterPostApprovalRenderRehearsalStatus"), listen_decision_command_center_path or "")
        add_check(checks, "listen-decision-command-center-post-approval-branches", int_value(listen_decision_command_center.get("postApprovalRenderRehearsalBranchCount")), int_value(manifest.get("audioListenDecisionCommandCenterPostApprovalRenderRehearsalBranchCount")), listen_decision_command_center_path or "")
        add_check(checks, "listen-decision-command-center-post-approval-missing-inputs", int_value(listen_decision_command_center.get("postApprovalRenderRehearsalMissingInputCount")), int_value(manifest.get("audioListenDecisionCommandCenterPostApprovalRenderRehearsalMissingInputCount")), listen_decision_command_center_path or "")
        add_check(checks, "listen-decision-command-center-post-approval-source-aware-inherited", bool_value(listen_decision_command_center.get("postApprovalApprovedSandboxExecutorInheritsSourceAwareAudioTruth")), bool_value(manifest.get("audioListenDecisionCommandCenterPostApprovalApprovedSandboxExecutorInheritsSourceAwareAudioTruth")), listen_decision_command_center_path or "")
        add_check(checks, "listen-decision-command-center-post-approval-master-only-forbidden", bool_value(listen_decision_command_center.get("postApprovalApprovedSandboxExecutorMasteredSpineOnlyEditingAllowed")), bool_value(manifest.get("audioListenDecisionCommandCenterPostApprovalApprovedSandboxExecutorMasteredSpineOnlyEditingAllowed")), listen_decision_command_center_path or "")
        add_check(checks, "listen-decision-command-center-codex-record-smoke-passed", bool_value(listen_decision_command_center.get("codexRecordSandboxSmokePassed")), bool_value(manifest.get("audioListenDecisionCommandCenterCodexRecordSandboxSmokePassed")), listen_decision_command_center_path or "")
        add_check(checks, "listen-decision-command-center-codex-record-smoke-checks", int_value(listen_decision_command_center.get("codexRecordSandboxSmokeCheckCount")), int_value(manifest.get("audioListenDecisionCommandCenterCodexRecordSandboxSmokeCheckCount")), listen_decision_command_center_path or "")
        add_check(checks, "listen-decision-command-center-codex-record-smoke-failures", int_value(listen_decision_command_center.get("codexRecordSandboxSmokeFailureCount")), int_value(manifest.get("audioListenDecisionCommandCenterCodexRecordSandboxSmokeFailureCount")), listen_decision_command_center_path or "")
        add_check(checks, "listen-decision-command-center-codex-record-smoke-real-approval", bool_value(listen_decision_command_center.get("codexRecordSandboxSmokeRealApprovalPreserved")), bool_value(manifest.get("audioListenDecisionCommandCenterCodexRecordSandboxSmokeRealApprovalPreserved")), listen_decision_command_center_path or "")
        add_check(checks, "listen-decision-command-center-codex-record-smoke-audio-truth", listen_decision_command_center.get("codexRecordSandboxSmokeSandboxBranchRenderAudioTruth"), manifest.get("audioListenDecisionCommandCenterCodexRecordSandboxSmokeSandboxBranchRenderAudioTruth"), listen_decision_command_center_path or "")
        add_check(checks, "listen-decision-command-center-codex-record-smoke-refined-stems", bool_value(listen_decision_command_center.get("codexRecordSandboxSmokeSandboxExecutorWillUseRefinedStems")), bool_value(manifest.get("audioListenDecisionCommandCenterCodexRecordSandboxSmokeSandboxExecutorWillUseRefinedStems")), listen_decision_command_center_path or "")
        add_check(checks, "listen-decision-command-center-codex-record-smoke-master-only-prevented", bool_value(listen_decision_command_center.get("codexRecordSandboxSmokeSandboxExecutorMasterOnlyPrevented")), bool_value(manifest.get("audioListenDecisionCommandCenterCodexRecordSandboxSmokeSandboxExecutorMasterOnlyPrevented")), listen_decision_command_center_path or "")
        add_check(checks, "listen-decision-command-center-danger-room-ready", bool_value(listen_decision_command_center.get("dangerRoomReady")), bool_value(manifest.get("audioListenDecisionCommandCenterDangerRoomReady")), listen_decision_command_center_path or "")
        add_false_safety_check(checks, "listen-decision-command-center-approval-state-changed", listen_decision_command_center, "approvalStateChanged", manifest, "audioListenDecisionCommandCenterApprovalStateChanged", listen_decision_command_center_path or "")
        add_false_safety_check(checks, "listen-decision-command-center-branch-state-changed", listen_decision_command_center, "branchStateChanged", manifest, "audioListenDecisionCommandCenterBranchStateChanged", listen_decision_command_center_path or "")
        add_false_safety_check(checks, "listen-decision-command-center-render-attempted", listen_decision_command_center, "renderAttempted", manifest, "audioListenDecisionCommandCenterRenderAttempted", listen_decision_command_center_path or "")
        add_false_safety_check(checks, "listen-decision-command-center-branch-render-attempted", listen_decision_command_center, "branchRenderAttempted", manifest, "audioListenDecisionCommandCenterBranchRenderAttempted", listen_decision_command_center_path or "")
        add_false_safety_check(checks, "listen-decision-command-center-upload-attempted", listen_decision_command_center, "uploadAttempted", manifest, "audioListenDecisionCommandCenterUploadAttempted", listen_decision_command_center_path or "")
        add_false_safety_check(checks, "listen-decision-command-center-publication-attempted", listen_decision_command_center, "publicationAttempted", manifest, "audioListenDecisionCommandCenterPublicationAttempted", listen_decision_command_center_path or "")
        add_false_safety_check(checks, "listen-decision-command-center-original-media-mutated", listen_decision_command_center, "originalMediaMutated", manifest, "audioListenDecisionCommandCenterOriginalMediaMutated", listen_decision_command_center_path or "")

    human_approval_preflight, human_approval_preflight_path = load_output_report(
        outputs, "latestAudioHumanApprovalPreflight"
    )
    add_presence_check(checks, "human-approval-preflight-report-present", human_approval_preflight, human_approval_preflight_path)
    add_output_file_check(checks, outputs, "latestAudioHumanApprovalPreflightMarkdown", "human-approval-preflight-markdown-present")
    add_output_file_check(checks, outputs, "latestAudioHumanApprovalPreflightHtml", "human-approval-preflight-html-present")
    add_output_file_check(checks, outputs, "latestAudioHumanApprovalPreflightOpenCommand", "human-approval-preflight-open-command-present")
    if human_approval_preflight:
        preflight_summary = (
            human_approval_preflight.get("summary")
            if isinstance(human_approval_preflight.get("summary"), dict)
            else {}
        )
        preflight_guardrails = (
            human_approval_preflight.get("guardrails")
            if isinstance(human_approval_preflight.get("guardrails"), dict)
            else {}
        )
        add_check(checks, "human-approval-preflight-status", human_approval_preflight.get("preflightStatus"), manifest.get("audioHumanApprovalPreflightLatestStatus"), human_approval_preflight_path or "")
        add_check(checks, "human-approval-preflight-ready-for-human-decision", bool_value(human_approval_preflight.get("readyForHumanDecision")), bool_value(manifest.get("audioHumanApprovalPreflightReadyForHumanDecision")), human_approval_preflight_path or "")
        add_check(checks, "human-approval-preflight-approval-status", human_approval_preflight.get("approvalStatus"), manifest.get("audioHumanApprovalPreflightApprovalStatus"), human_approval_preflight_path or "")
        add_check(checks, "human-approval-preflight-package-ready", bool_value(human_approval_preflight.get("packageReadyForHumanListen")), bool_value(manifest.get("audioHumanApprovalPreflightPackageReadyForHumanListen")), human_approval_preflight_path or "")
        add_check(checks, "human-approval-preflight-branch-inheritance", bool_value(human_approval_preflight.get("branchInheritanceReady")), bool_value(manifest.get("audioHumanApprovalPreflightBranchInheritanceReady")), human_approval_preflight_path or "")
        add_check(checks, "human-approval-preflight-branch-render", bool_value(human_approval_preflight.get("branchRenderReady")), bool_value(manifest.get("audioHumanApprovalPreflightBranchRenderReady")), human_approval_preflight_path or "")
        add_check(checks, "human-approval-preflight-blockers", int_value(preflight_summary.get("blockerCount")), int_value(manifest.get("audioHumanApprovalPreflightBlockerCount")), human_approval_preflight_path or "")
        add_check(checks, "human-approval-preflight-fast-readback-status", preflight_summary.get("fastReadbackStatus"), manifest.get("audioHumanApprovalPreflightFastReadbackStatus"), human_approval_preflight_path or "")
        add_check(checks, "human-approval-preflight-fast-readback-passed", bool_value(preflight_summary.get("fastReadbackPassed")), bool_value(manifest.get("audioHumanApprovalPreflightFastReadbackPassed")), human_approval_preflight_path or "")
        add_check(checks, "human-approval-preflight-fast-readback-hard-stops", int_value(preflight_summary.get("fastReadbackHardStopCount")), int_value(manifest.get("audioHumanApprovalPreflightFastReadbackHardStopCount")), human_approval_preflight_path or "")
        add_check(checks, "human-approval-preflight-source-aware-timing-ready", bool_value(preflight_summary.get("sourceAwareTimingContractReady")), bool_value(manifest.get("audioHumanApprovalPreflightSourceAwareTimingContractReady")), human_approval_preflight_path or "")
        add_check(checks, "human-approval-preflight-source-aware-timing-roles", int_value(preflight_summary.get("sourceAwareTimingContractReadyRoleCount")), int_value(manifest.get("audioHumanApprovalPreflightSourceAwareTimingContractReadyRoleCount")), human_approval_preflight_path or "")
        add_check(checks, "human-approval-preflight-approved-sandbox-source-aware-ready", bool_value(preflight_summary.get("approvedSandboxSourceAwareRenderContractReady")), bool_value(manifest.get("audioHumanApprovalPreflightApprovedSandboxSourceAwareRenderContractReady")), human_approval_preflight_path or "")
        add_check(checks, "human-approval-preflight-approved-sandbox-source-aware-inherited", bool_value(preflight_summary.get("approvedSandboxInheritsSourceAwareAudioTruth")), bool_value(manifest.get("audioHumanApprovalPreflightApprovedSandboxInheritsSourceAwareAudioTruth")), human_approval_preflight_path or "")
        add_check(checks, "human-approval-preflight-master-only-forbidden", bool_value(preflight_summary.get("masteredSpineOnlyEditingAllowed")), bool_value(manifest.get("audioHumanApprovalPreflightMasteredSpineOnlyEditingAllowed")), human_approval_preflight_path or "")
        add_check(checks, "human-approval-preflight-approval-state-changed", False, bool_value(preflight_guardrails.get("approvalStateChanged")), human_approval_preflight_path or "")
        add_check(checks, "human-approval-preflight-approval-state-changed-manifest", False, bool_value(manifest.get("audioHumanApprovalPreflightApprovalStateChanged")), human_approval_preflight_path or "")
        add_check(checks, "human-approval-preflight-branch-state-changed", False, bool_value(preflight_guardrails.get("branchStateChanged")), human_approval_preflight_path or "")
        add_check(checks, "human-approval-preflight-branch-state-changed-manifest", False, bool_value(manifest.get("audioHumanApprovalPreflightBranchStateChanged")), human_approval_preflight_path or "")
        add_check(checks, "human-approval-preflight-branch-render-attempted", False, bool_value(preflight_guardrails.get("branchRenderAttempted")), human_approval_preflight_path or "")
        add_check(checks, "human-approval-preflight-branch-render-attempted-manifest", False, bool_value(manifest.get("audioHumanApprovalPreflightBranchRenderAttempted")), human_approval_preflight_path or "")
        add_check(checks, "human-approval-preflight-original-media-mutated", False, bool_value(preflight_guardrails.get("originalMediaMutated")), human_approval_preflight_path or "")
        add_check(checks, "human-approval-preflight-original-media-mutated-manifest", False, bool_value(manifest.get("audioHumanApprovalPreflightOriginalMediaMutated")), human_approval_preflight_path or "")
        add_check(checks, "human-approval-preflight-public-upload-or-publish", False, bool_value(preflight_guardrails.get("publicUploadOrPublishAttempted")), human_approval_preflight_path or "")
        add_check(checks, "human-approval-preflight-public-upload-or-publish-manifest", False, bool_value(manifest.get("audioHumanApprovalPreflightPublicUploadOrPublishAttempted")), human_approval_preflight_path or "")

    branch_preflight, branch_preflight_path = load_output_report(outputs, "branchRenderPreflight")
    add_presence_check(checks, "branch-render-preflight-report-present", branch_preflight, branch_preflight_path)
    add_output_file_check(checks, outputs, "branchRenderPreflightMarkdown", "branch-render-preflight-markdown-present")
    add_output_file_check(checks, outputs, "branchRenderPreflightHtml", "branch-render-preflight-html-present")
    add_output_file_check(checks, outputs, "branchRenderPreflightOpenCommand", "branch-render-preflight-open-command-present")
    if branch_preflight:
        truth = branch_preflight.get("truth") if isinstance(branch_preflight.get("truth"), dict) else {}
        add_check(checks, "branch-render-preflight-status", branch_preflight.get("status"), manifest.get("branchRenderPreflightStatus"), branch_preflight_path or "")
        add_check(checks, "branch-render-preflight-can-render", bool_value(branch_preflight.get("canRenderBranches")), bool_value(manifest.get("branchRenderReady")), branch_preflight_path or "")
        add_check(checks, "branch-render-preflight-blockers", branch_preflight.get("blockers") or [], manifest.get("branchRenderBlockedReason") or [], branch_preflight_path or "")
        add_check(checks, "branch-render-preflight-source-aware-required", bool_value(branch_preflight.get("sourceAwareAudioTruthRequired")), bool_value(manifest.get("branchRenderPreflightRequiresSourceAwareAudioTruth")), branch_preflight_path or "")
        add_check(checks, "branch-render-preflight-source-aware-inherited", bool_value(branch_preflight.get("inheritsSourceAwareAudioTruth")), bool_value(manifest.get("branchRenderPreflightInheritsSourceAwareAudioTruth")), branch_preflight_path or "")
        add_check(checks, "branch-render-preflight-source-aware-ready", bool_value(branch_preflight.get("sourceAwareAudioTruthReady")), bool_value(manifest.get("branchRenderPreflightSourceAwareAudioTruthReady")), branch_preflight_path or "")
        add_check(checks, "branch-render-preflight-source-aware-status", branch_preflight.get("sourceAwareAudioContractStatus"), manifest.get("branchRenderPreflightSourceAwareAudioContractStatus"), branch_preflight_path or "")
        add_check(checks, "branch-render-preflight-source-aware-roles", sorted(str(role) for role in (branch_preflight.get("sourceAwareAudioRoleIds") or [])), sorted(str(role) for role in (manifest.get("branchRenderPreflightSourceAwareAudioRoleIds") or [])), branch_preflight_path or "")
        add_check(checks, "branch-render-preflight-source-aware-stems", int_value(branch_preflight.get("sourceAwareAudioReadyStemCount")), int_value(manifest.get("branchRenderPreflightSourceAwareAudioReadyStemCount")), branch_preflight_path or "")
        add_check(checks, "branch-render-preflight-branch-audio-plan-status", branch_preflight.get("branchAudioPlanStatus"), manifest.get("branchRenderPreflightBranchAudioPlanStatus"), branch_preflight_path or "")
        add_check(checks, "branch-render-preflight-branch-audio-plan-stem-count", int_value(branch_preflight.get("branchAudioPlanSelectedRefinedStemCount")), int_value(manifest.get("branchRenderPreflightBranchAudioPlanSelectedRefinedStemCount")), branch_preflight_path or "")
        add_check(checks, "branch-render-preflight-branch-audio-plan-missing-roles", sorted(str(role) for role in (branch_preflight.get("branchAudioPlanMissingRoleIds") or [])), sorted(str(role) for role in (manifest.get("branchRenderPreflightBranchAudioPlanMissingRoleIds") or [])), branch_preflight_path or "")
        add_check(checks, "branch-render-preflight-branch-audio-plan-missing-paths", int_value(branch_preflight.get("branchAudioPlanMissingStemPathCount")), int_value(manifest.get("branchRenderPreflightBranchAudioPlanMissingStemPathCount")), branch_preflight_path or "")
        add_check(checks, "branch-render-preflight-audio-truth", branch_preflight.get("branchRenderAudioTruth"), manifest.get("branchRenderPreflightBranchRenderAudioTruth"), branch_preflight_path or "")
        add_check(checks, "branch-render-preflight-will-use-refined-stems", bool_value(branch_preflight.get("sourceAwareBranchRenderWillUseRefinedStems")), bool_value(manifest.get("branchRenderPreflightSourceAwareBranchRenderWillUseRefinedStems")), branch_preflight_path or "")
        add_check(checks, "branch-render-preflight-stem-paths-proved", bool_value(branch_preflight.get("sourceAwareBranchRenderStemPathsProved")), bool_value(manifest.get("branchRenderPreflightSourceAwareBranchRenderStemPathsProved")), branch_preflight_path or "")
        add_check(checks, "branch-render-preflight-mix-output-name", branch_preflight.get("sourceAwareBranchRenderExpectedMixOutputName"), manifest.get("branchRenderPreflightSourceAwareBranchRenderExpectedMixOutputName"), branch_preflight_path or "")
        add_check(checks, "branch-render-preflight-requires-ready-branch-audio-plan", "ready-source-aware-refined-stem-plan", branch_preflight.get("branchAudioPlanStatus"), branch_preflight_path or "")
        add_check(checks, "branch-render-preflight-requires-three-refined-stems", True, int_value(branch_preflight.get("branchAudioPlanSelectedRefinedStemCount")) >= 3, branch_preflight_path or "")
        add_check(checks, "branch-render-preflight-requires-no-missing-roles", [], sorted(str(role) for role in (branch_preflight.get("branchAudioPlanMissingRoleIds") or [])), branch_preflight_path or "")
        add_check(checks, "branch-render-preflight-requires-no-missing-stem-paths", 0, int_value(branch_preflight.get("branchAudioPlanMissingStemPathCount")), branch_preflight_path or "")
        add_check(checks, "branch-render-preflight-requires-stem-path-proof", True, bool_value(branch_preflight.get("sourceAwareBranchRenderStemPathsProved")), branch_preflight_path or "")
        add_check(checks, "branch-render-preflight-mastered-only-output", bool_value(branch_preflight.get("branchAudioRenderedFromMasteredSpineOnly")), bool_value(manifest.get("branchRenderPreflightBranchAudioRenderedFromMasteredSpineOnly")), branch_preflight_path or "")
        add_check(checks, "branch-render-preflight-master-only-forbidden", bool_value(branch_preflight.get("masteredSpineOnlyEditingAllowed")), bool_value(manifest.get("branchRenderPreflightMasteredSpineOnlyEditingAllowed")), branch_preflight_path or "")
        add_check(checks, "branch-render-preflight-real-commands-exposed", bool_value(branch_preflight.get("realBranchRenderCommandsExposed")), bool_value(manifest.get("branchRenderPreflightRealBranchRenderCommandsExposed")), branch_preflight_path or "")
        add_check(checks, "branch-render-preflight-truth-real-commands-exposed", bool_value(truth.get("realBranchRenderCommandsExposed")), bool_value(manifest.get("branchRenderPreflightRealBranchRenderCommandsExposed")), branch_preflight_path or "")
        add_check(checks, "branch-render-preflight-mastered-spine-use", branch_preflight.get("masteredSpineUse"), manifest.get("branchRenderPreflightMasteredSpineUse"), branch_preflight_path or "")
        add_check(checks, "branch-render-preflight-truth-render-executed", False, bool_value(truth.get("renderExecuted")), branch_preflight_path or "")
        add_check(checks, "branch-render-preflight-truth-original-media-mutated", False, bool_value(truth.get("originalMediaMutated")), branch_preflight_path or "")

    source_timing, source_timing_path = load_output_report(outputs, "latestAudioSourceAwareTimingContract")
    add_presence_check(checks, "source-aware-timing-contract-report-present", source_timing, source_timing_path)
    add_output_file_check(checks, outputs, "latestAudioSourceAwareTimingContractMarkdown", "source-aware-timing-contract-markdown-present")
    add_output_file_check(checks, outputs, "latestAudioSourceAwareTimingContractHtml", "source-aware-timing-contract-html-present")
    add_output_file_check(checks, outputs, "latestAudioSourceAwareTimingContractOpenCommand", "source-aware-timing-contract-open-command-present")
    if source_timing:
        add_check(checks, "source-aware-timing-contract-status", source_timing.get("status"), manifest.get("audioSourceAwareTimingContractLatestStatus"), source_timing_path or "")
        add_check(checks, "source-aware-timing-contract-ready", bool_value(source_timing.get("sourceAwareTimingReady")), bool_value(manifest.get("audioSourceAwareTimingContractReady")), source_timing_path or "")
        add_check(checks, "source-aware-timing-contract-required-roles", int_value(source_timing.get("requiredRoleCount")), int_value(manifest.get("audioSourceAwareTimingContractRequiredRoleCount")), source_timing_path or "")
        add_check(checks, "source-aware-timing-contract-ready-roles", int_value(source_timing.get("readyRoleCount")), int_value(manifest.get("audioSourceAwareTimingContractReadyRoleCount")), source_timing_path or "")
        add_check(checks, "source-aware-timing-contract-full-length-stems", int_value(source_timing.get("fullLengthStemCount")), int_value(manifest.get("audioSourceAwareTimingContractFullLengthStemCount")), source_timing_path or "")
        add_check(checks, "source-aware-timing-contract-roles", sorted(str(role) for role in (source_timing.get("roleIds") or [])), sorted(str(role) for role in (manifest.get("audioSourceAwareTimingContractRoleIds") or [])), source_timing_path or "")
        add_check(checks, "source-aware-timing-contract-missing-roles", sorted(str(role) for role in (source_timing.get("missingRoleIds") or [])), sorted(str(role) for role in (manifest.get("audioSourceAwareTimingContractMissingRoleIds") or [])), source_timing_path or "")
        add_check(checks, "source-aware-timing-contract-tolerance", source_timing.get("durationToleranceSeconds"), manifest.get("audioSourceAwareTimingContractDurationToleranceSeconds"), source_timing_path or "")
        add_check(checks, "source-aware-timing-contract-max-delta", source_timing.get("maxDurationDeltaToMasterSeconds"), manifest.get("audioSourceAwareTimingContractMaxDurationDeltaToMasterSeconds"), source_timing_path or "")
        add_check(checks, "source-aware-timing-contract-capabilities", int_value(source_timing.get("branchTimingCapabilityCount")), int_value(manifest.get("audioSourceAwareTimingContractBranchTimingCapabilityCount")), source_timing_path or "")
        add_check(checks, "source-aware-timing-contract-hard-stops", int_value(source_timing.get("hardStopCount")), int_value(manifest.get("audioSourceAwareTimingContractHardStopCount")), source_timing_path or "")
        add_check(checks, "source-aware-timing-contract-post-approval-status", source_timing.get("postApprovalRenderRehearsalStatus"), manifest.get("audioSourceAwareTimingContractPostApprovalStatus"), source_timing_path or "")
        add_check(checks, "source-aware-timing-contract-post-approval-inherits", bool_value(source_timing.get("postApprovalInheritsSourceAwareAudioTruth")), bool_value(manifest.get("audioSourceAwareTimingContractPostApprovalInheritsSourceAwareAudioTruth")), source_timing_path or "")
        add_check(checks, "source-aware-timing-contract-post-approval-source-status", source_timing.get("postApprovalSourceAwareAudioContractStatus"), manifest.get("audioSourceAwareTimingContractPostApprovalSourceAwareAudioContractStatus"), source_timing_path or "")
        add_check(checks, "source-aware-timing-contract-master-only-forbidden", bool_value(source_timing.get("postApprovalMasteredSpineOnlyEditingAllowed")), bool_value(manifest.get("audioSourceAwareTimingContractPostApprovalMasteredSpineOnlyEditingAllowed")), source_timing_path or "")
        add_false_safety_check(checks, "source-aware-timing-contract-approval-state-changed", source_timing, "approvalStateChanged", manifest, "audioSourceAwareTimingContractApprovalStateChanged", source_timing_path or "")
        add_false_safety_check(checks, "source-aware-timing-contract-branch-state-changed", source_timing, "branchStateChanged", manifest, "audioSourceAwareTimingContractBranchStateChanged", source_timing_path or "")
        add_false_safety_check(checks, "source-aware-timing-contract-render-attempted", source_timing, "renderAttempted", manifest, "audioSourceAwareTimingContractRenderAttempted", source_timing_path or "")
        add_false_safety_check(checks, "source-aware-timing-contract-branch-render-attempted", source_timing, "branchRenderAttempted", manifest, "audioSourceAwareTimingContractBranchRenderAttempted", source_timing_path or "")
        add_false_safety_check(checks, "source-aware-timing-contract-upload-attempted", source_timing, "uploadAttempted", manifest, "audioSourceAwareTimingContractUploadAttempted", source_timing_path or "")
        add_false_safety_check(checks, "source-aware-timing-contract-publication-attempted", source_timing, "publicationAttempted", manifest, "audioSourceAwareTimingContractPublicationAttempted", source_timing_path or "")
        add_false_safety_check(checks, "source-aware-timing-contract-original-media-mutated", source_timing, "originalMediaMutated", manifest, "audioSourceAwareTimingContractOriginalMediaMutated", source_timing_path or "")

    human_session, human_session_path = load_output_report(outputs, "latestHumanListenSession")
    add_presence_check(checks, "human-listen-session-report-present", human_session, human_session_path)
    if human_session:
        missing_links = list_count(human_session, "missingLinkCount", "missingLinks")
        link_count = list_count(human_session, "linkCount", "links")
        session_status = "ready" if missing_links == 0 else "needs-attention"
        add_check(checks, "human-listen-session-status", session_status, manifest.get("humanListenSessionLatestStatus"), human_session_path or "")
        add_check(checks, "human-listen-session-link-count", link_count, int_value(manifest.get("humanListenSessionLinkCount")), human_session_path or "")
        add_check(checks, "human-listen-session-missing-count", missing_links, int_value(manifest.get("humanListenSessionMissingLinkCount")), human_session_path or "")

    handoff, handoff_path = load_output_report(outputs, "latestReviewHandoffIndex")
    add_presence_check(checks, "review-handoff-index-report-present", handoff, handoff_path)
    if handoff:
        handoff_status = "complete" if int_value(handoff.get("missingArtifactCount")) == 0 else "needs-attention"
        add_check(checks, "review-handoff-index-status", handoff_status, manifest.get("reviewHandoffIndexLatestStatus"), handoff_path or "")
        add_check(checks, "review-handoff-index-artifact-count", int_value(handoff.get("artifactCount")), int_value(manifest.get("reviewHandoffIndexArtifactCount")), handoff_path or "")
        add_check(checks, "review-handoff-index-missing-count", int_value(handoff.get("missingArtifactCount")), int_value(manifest.get("reviewHandoffIndexMissingArtifactCount")), handoff_path or "")

    unresolved, unresolved_path = load_output_report(outputs, "latestAudioUnresolvedRequirementReview")
    add_presence_check(checks, "unresolved-review-report-present", unresolved, unresolved_path)
    if unresolved:
        add_check(checks, "unresolved-review-status", unresolved.get("reviewStatus") or unresolved.get("status"), manifest.get("audioUnresolvedRequirementReviewLatestStatus"), unresolved_path or "")
        add_check(checks, "unresolved-review-total", int_value(unresolved.get("unresolvedRequirementCount")), int_value(manifest.get("audioUnresolvedRequirementReviewUnresolvedCount")), unresolved_path or "")
        add_check(checks, "unresolved-review-partial", int_value(unresolved.get("partialRequirementCount")), int_value(manifest.get("audioUnresolvedRequirementReviewPartialCount")), unresolved_path or "")
        add_check(checks, "unresolved-review-locked", int_value(unresolved.get("lockedRequirementCount")), int_value(manifest.get("audioUnresolvedRequirementReviewLockedCount")), unresolved_path or "")
        add_check(checks, "unresolved-review-missing-artifacts", int_value(unresolved.get("missingArtifactCount")), int_value(manifest.get("audioUnresolvedRequirementReviewMissingArtifactCount")), unresolved_path or "")

    runway, runway_path = load_output_report(outputs, "latestAudioRunwayState")
    add_presence_check(checks, "runway-state-report-present", runway, runway_path)
    if runway:
        add_check(checks, "runway-state-status", runway.get("status"), manifest.get("audioRunwayStateLatestStatus"), runway_path or "")
        add_check(checks, "runway-state-current-gate", runway.get("currentGate"), manifest.get("audioRunwayStateCurrentGate"), runway_path or "")
        add_check(checks, "runway-state-blocking-condition", runway.get("blockingCondition"), manifest.get("audioRunwayStateBlockingCondition"), runway_path or "")
        add_check(checks, "runway-state-review-gate", bool_value(runway.get("reviewGatePassed")), bool_value(manifest.get("audioRunwayStateReviewGatePassed")), runway_path or "")
        add_check(checks, "runway-state-human-decision", bool_value(runway.get("readyForHumanDecision")), bool_value(manifest.get("audioRunwayStateReadyForHumanDecision")), runway_path or "")
        add_check(checks, "runway-state-missing-required", int_value(runway.get("missingRequiredArtifactCount")), int_value(manifest.get("audioRunwayStateMissingRequiredArtifactCount")), runway_path or "")
        add_check(checks, "runway-state-unresolved-total", int_value(runway.get("unresolvedRequirementCount")), int_value(manifest.get("audioRunwayStateUnresolvedRequirementCount")), runway_path or "")
        add_check(checks, "runway-state-partial", int_value(runway.get("partialRequirementCount")), int_value(manifest.get("audioRunwayStatePartialRequirementCount")), runway_path or "")
        add_check(checks, "runway-state-locked", int_value(runway.get("lockedRequirementCount")), int_value(manifest.get("audioRunwayStateLockedRequirementCount")), runway_path or "")
        add_check(checks, "runway-state-unresolved-missing", int_value(runway.get("unresolvedMissingArtifactCount")), int_value(manifest.get("audioRunwayStateUnresolvedMissingArtifactCount")), runway_path or "")
        add_check(checks, "runway-state-handoff-missing", int_value(runway.get("handoffMissingLinkedArtifactCount")), int_value(manifest.get("audioRunwayStateHandoffMissingLinkedArtifactCount")), runway_path or "")
        render_runway = runway.get("renderRunway") if isinstance(runway.get("renderRunway"), dict) else {}
        add_check(checks, "runway-state-post-listen-runway-status", render_runway.get("postListenRunwayStatus"), manifest.get("audioRunwayStatePostListenRunwayStatus"), runway_path or "")
        add_check(checks, "runway-state-post-approval-rehearsal-status", render_runway.get("postApprovalRehearsalStatus"), manifest.get("audioRunwayStatePostApprovalRehearsalStatus"), runway_path or "")
        add_check(checks, "runway-state-post-approval-branches", int_value(render_runway.get("postApprovalBranchCount")), int_value(manifest.get("audioRunwayStatePostApprovalBranchCount")), runway_path or "")
        add_check(checks, "runway-state-post-approval-missing-inputs", int_value(render_runway.get("postApprovalMissingInputCount")), int_value(manifest.get("audioRunwayStatePostApprovalMissingInputCount")), runway_path or "")
        add_check(checks, "runway-state-approved-executor-status", render_runway.get("approvedBranchExecutorStatus"), manifest.get("audioRunwayStateApprovedBranchExecutorStatus"), runway_path or "")
        add_check(checks, "runway-state-approved-executor-can-execute", bool_value(render_runway.get("approvedBranchExecutorCanExecute")), bool_value(manifest.get("audioRunwayStateApprovedBranchExecutorCanExecute")), runway_path or "")
        add_check(checks, "runway-state-approved-executor-commands-exposed", bool_value(render_runway.get("approvedBranchExecutorCommandsExposed")), bool_value(manifest.get("audioRunwayStateApprovedBranchExecutorCommandsExposed")), runway_path or "")

    review_gate, review_gate_path = load_output_report(outputs, "latestAudioReviewGateAudit")
    add_presence_check(checks, "review-gate-report-present", review_gate, review_gate_path)
    if review_gate:
        add_check(checks, "review-gate-status", review_gate.get("status"), manifest.get("audioReviewGateAuditLatestStatus"), review_gate_path or "")
        add_check(checks, "review-gate-passed", bool_value(review_gate.get("passed")), bool_value(manifest.get("audioReviewGateAuditLatestPassed")), review_gate_path or "")
        add_check(checks, "review-gate-errors", int_value(review_gate.get("errorCount")), int_value(manifest.get("audioReviewGateAuditLatestErrorCount")), review_gate_path or "")
        add_check(checks, "review-gate-warnings", int_value(review_gate.get("warningCount")), int_value(manifest.get("audioReviewGateAuditLatestWarningCount")), review_gate_path or "")

    platform_loudness, platform_loudness_path = load_output_report(outputs, "latestAudioPlatformLoudnessAudit")
    add_presence_check(checks, "platform-loudness-audit-report-present", platform_loudness, platform_loudness_path)
    add_output_file_check(checks, outputs, "latestAudioPlatformLoudnessAuditMarkdown", "platform-loudness-audit-markdown-present")
    add_output_file_check(checks, outputs, "latestAudioPlatformLoudnessAuditHtml", "platform-loudness-audit-html-present")
    add_output_file_check(checks, outputs, "latestAudioPlatformLoudnessAuditOpenCommand", "platform-loudness-audit-open-command-present")
    if platform_loudness:
        platform_summary = platform_loudness.get("summary") if isinstance(platform_loudness.get("summary"), dict) else {}
        downstream_truth = platform_loudness.get("downstreamTruth") if isinstance(platform_loudness.get("downstreamTruth"), dict) else {}
        add_check(checks, "platform-loudness-hard-gates", int_value(platform_summary.get("hardGateAttentionCount")), int_value(manifest.get("audioPlatformLoudnessHardGateAttentionCount")), platform_loudness_path or "")
        add_check(checks, "platform-loudness-advisory-attention", int_value(platform_summary.get("advisoryAttentionCount")), int_value(manifest.get("audioPlatformLoudnessAdvisoryAttentionCount")), platform_loudness_path or "")
        add_check(checks, "platform-loudness-podcast-ready", bool_value(platform_summary.get("podcastProfilesMachineReady")), bool_value(manifest.get("audioPlatformLoudnessPodcastProfilesMachineReady")), platform_loudness_path or "")
        add_check(checks, "platform-loudness-final-episode-gate", downstream_truth.get("finalEpisodeGate"), manifest.get("audioPlatformLoudnessDownstreamFinalEpisodeGate"), platform_loudness_path or "")
        add_check(checks, "platform-loudness-shorts-gate", downstream_truth.get("shortsGate"), manifest.get("audioPlatformLoudnessDownstreamShortsGate"), platform_loudness_path or "")
        add_false_safety_check(checks, "platform-loudness-approval-state-changed", platform_loudness, "approvalStateChanged", manifest, "audioPlatformLoudnessApprovalStateChanged", platform_loudness_path or "")
        add_false_safety_check(checks, "platform-loudness-branch-state-changed", platform_loudness, "branchStateChanged", manifest, "audioPlatformLoudnessBranchStateChanged", platform_loudness_path or "")
        add_false_safety_check(checks, "platform-loudness-render-attempted", platform_loudness, "renderAttempted", manifest, "audioPlatformLoudnessRenderAttempted", platform_loudness_path or "")
        add_false_safety_check(checks, "platform-loudness-branch-render-attempted", platform_loudness, "branchRenderAttempted", manifest, "audioPlatformLoudnessBranchRenderAttempted", platform_loudness_path or "")
        add_false_safety_check(checks, "platform-loudness-upload-attempted", platform_loudness, "uploadAttempted", manifest, "audioPlatformLoudnessUploadAttempted", platform_loudness_path or "")
        add_false_safety_check(checks, "platform-loudness-publication-attempted", platform_loudness, "publicationAttempted", manifest, "audioPlatformLoudnessPublicationAttempted", platform_loudness_path or "")
        add_false_safety_check(checks, "platform-loudness-original-media-mutated", platform_loudness, "originalMediaMutated", manifest, "audioPlatformLoudnessOriginalMediaMutated", platform_loudness_path or "")

    post_review_queue, post_review_queue_path = load_output_report(outputs, "latestAudioPostReviewActionQueue")
    add_presence_check(checks, "post-review-action-queue-report-present", post_review_queue, post_review_queue_path)
    add_output_file_check(checks, outputs, "latestAudioPostReviewActionQueueMarkdown", "post-review-action-queue-markdown-present")
    if post_review_queue:
        add_check(checks, "post-review-action-queue-status", post_review_queue.get("status"), manifest.get("audioPostReviewActionQueueLatestStatus"), post_review_queue_path or "")
        add_check(checks, "post-review-action-queue-source-count", int_value(post_review_queue.get("sourceCount")), int_value(manifest.get("audioPostReviewActionQueueLatestSourceCount")), post_review_queue_path or "")
        add_check(checks, "post-review-action-queue-defect-atlas-source", bool_value(post_review_queue.get("defectAtlasNotesSourceRegistered")), bool_value(manifest.get("audioPostReviewActionQueueLatestDefectAtlasNotesSourceRegistered")), post_review_queue_path or "")
        add_check(checks, "post-review-action-queue-source-with-notes", int_value(post_review_queue.get("sourceWithNotesCandidateCount")), int_value(manifest.get("audioPostReviewActionQueueLatestSourceWithNotesCandidateCount")), post_review_queue_path or "")
        add_check(checks, "post-review-action-queue-repair-actions", int_value(post_review_queue.get("repairActionCount")), int_value(manifest.get("audioPostReviewActionQueueLatestRepairActionCount")), post_review_queue_path or "")
        add_check(checks, "post-review-action-queue-proof-actions", int_value(post_review_queue.get("focusedProofActionCount")), int_value(manifest.get("audioPostReviewActionQueueLatestFocusedProofActionCount")), post_review_queue_path or "")
        add_check(checks, "post-review-action-queue-pass-context", int_value(post_review_queue.get("passContextCount")), int_value(manifest.get("audioPostReviewActionQueueLatestPassContextCount")), post_review_queue_path or "")
        add_false_safety_check(checks, "post-review-action-queue-approval-state-changed", post_review_queue, "approvalStateChanged", manifest, "audioPostReviewActionQueueLatestApprovalStateChanged", post_review_queue_path or "")
        add_false_safety_check(checks, "post-review-action-queue-branch-state-changed", post_review_queue, "branchStateChanged", manifest, "audioPostReviewActionQueueLatestBranchStateChanged", post_review_queue_path or "")
        add_false_safety_check(checks, "post-review-action-queue-render-attempted", post_review_queue, "renderAttempted", manifest, "audioPostReviewActionQueueLatestRenderAttempted", post_review_queue_path or "")
        add_false_safety_check(checks, "post-review-action-queue-original-media-mutated", post_review_queue, "originalMediaMutated", manifest, "audioPostReviewActionQueueLatestOriginalMediaMutated", post_review_queue_path or "")

    technical_audition_pack, technical_audition_pack_path = load_output_report(outputs, "latestAudioTechnicalAuditionSnippetPack")
    add_presence_check(checks, "technical-audition-snippet-pack-report-present", technical_audition_pack, technical_audition_pack_path)
    add_output_file_check(checks, outputs, "latestAudioTechnicalAuditionSnippetPackMarkdown", "technical-audition-snippet-pack-markdown-present")
    add_output_file_check(checks, outputs, "latestAudioTechnicalAuditionSnippetPackHtml", "technical-audition-snippet-pack-html-present")
    add_output_file_check(checks, outputs, "latestAudioTechnicalAuditionSnippetPackOpenCommand", "technical-audition-snippet-pack-open-command-present")
    add_output_file_check(checks, outputs, "latestAudioTechnicalAuditionSnippetPackNotesTemplate", "technical-audition-snippet-pack-notes-template-present")
    if technical_audition_pack:
        add_check(checks, "technical-audition-snippet-pack-status", technical_audition_pack.get("status"), manifest.get("audioTechnicalAuditionSnippetPackLatestStatus"), technical_audition_pack_path or "")
        add_check(checks, "technical-audition-snippet-pack-snippet-count", int_value(technical_audition_pack.get("snippetCount")), int_value(manifest.get("audioTechnicalAuditionSnippetPackSnippetCount")), technical_audition_pack_path or "")
        add_check(checks, "technical-audition-snippet-pack-item-count", int_value(technical_audition_pack.get("itemCount")), int_value(manifest.get("audioTechnicalAuditionSnippetPackItemCount")), technical_audition_pack_path or "")
        add_check(checks, "technical-audition-snippet-pack-window-count", int_value(technical_audition_pack.get("windowCount")), int_value(manifest.get("audioTechnicalAuditionSnippetPackWindowCount")), technical_audition_pack_path or "")
        add_check(checks, "technical-audition-snippet-pack-variant-count", int_value(technical_audition_pack.get("variantCount")), int_value(manifest.get("audioTechnicalAuditionSnippetPackVariantCount")), technical_audition_pack_path or "")
        add_check(checks, "technical-audition-snippet-pack-rendered-items", int_value(technical_audition_pack.get("renderedItemCount")), int_value(manifest.get("audioTechnicalAuditionSnippetPackRenderedItemCount")), technical_audition_pack_path or "")
        add_check(checks, "technical-audition-snippet-pack-missing-snippets", int_value(technical_audition_pack.get("missingSnippetCount")), int_value(manifest.get("audioTechnicalAuditionSnippetPackMissingSnippetCount")), technical_audition_pack_path or "")
        add_check(checks, "technical-audition-snippet-pack-render-failures", int_value(technical_audition_pack.get("renderFailureCount")), int_value(manifest.get("audioTechnicalAuditionSnippetPackRenderFailureCount")), technical_audition_pack_path or "")
        add_check(checks, "technical-audition-snippet-pack-derived-review-rendered", bool_value(technical_audition_pack.get("derivedReviewMediaRendered")), bool_value(manifest.get("audioTechnicalAuditionSnippetPackDerivedReviewMediaRendered")), technical_audition_pack_path or "")
        add_check(checks, "technical-audition-snippet-pack-derived-review-attempted", bool_value(technical_audition_pack.get("derivedReviewRenderAttempted")), bool_value(manifest.get("audioTechnicalAuditionSnippetPackDerivedReviewRenderAttempted")), technical_audition_pack_path or "")
        safety = technical_audition_pack.get("safety") if isinstance(technical_audition_pack.get("safety"), dict) else technical_audition_pack
        add_false_safety_check(checks, "technical-audition-snippet-pack-approval-state-changed", safety, "approvalStateChanged", manifest, "audioTechnicalAuditionSnippetPackApprovalStateChanged", technical_audition_pack_path or "")
        add_false_safety_check(checks, "technical-audition-snippet-pack-branch-state-changed", safety, "branchStateChanged", manifest, "audioTechnicalAuditionSnippetPackBranchStateChanged", technical_audition_pack_path or "")
        add_false_safety_check(checks, "technical-audition-snippet-pack-render-attempted", safety, "renderAttempted", manifest, "audioTechnicalAuditionSnippetPackRenderAttempted", technical_audition_pack_path or "")
        add_false_safety_check(checks, "technical-audition-snippet-pack-branch-render-attempted", safety, "branchRenderAttempted", manifest, "audioTechnicalAuditionSnippetPackBranchRenderAttempted", technical_audition_pack_path or "")
        add_false_safety_check(checks, "technical-audition-snippet-pack-upload-attempted", safety, "uploadAttempted", manifest, "audioTechnicalAuditionSnippetPackUploadAttempted", technical_audition_pack_path or "")
        add_false_safety_check(checks, "technical-audition-snippet-pack-publication-attempted", safety, "publicationAttempted", manifest, "audioTechnicalAuditionSnippetPackPublicationAttempted", technical_audition_pack_path or "")
        add_false_safety_check(checks, "technical-audition-snippet-pack-original-media-mutated", safety, "originalMediaMutated", manifest, "audioTechnicalAuditionSnippetPackOriginalMediaMutated", technical_audition_pack_path or "")

    scoped_v007_plan, scoped_v007_plan_path = load_output_report(outputs, "latestAudioScopedV007RepairCandidatePlan")
    add_presence_check(checks, "scoped-v007-repair-candidate-plan-report-present", scoped_v007_plan, scoped_v007_plan_path)
    add_output_file_check(checks, outputs, "latestAudioScopedV007RepairCandidatePlanMarkdown", "scoped-v007-repair-candidate-plan-markdown-present")
    add_output_file_check(checks, outputs, "latestAudioScopedV007RepairCandidatePlanHtml", "scoped-v007-repair-candidate-plan-html-present")
    add_output_file_check(checks, outputs, "latestAudioScopedV007RepairCandidatePlanOpenCommand", "scoped-v007-repair-candidate-plan-open-command-present")
    if scoped_v007_plan:
        add_check(checks, "scoped-v007-repair-candidate-plan-status", scoped_v007_plan.get("status"), manifest.get("audioScopedV007RepairCandidatePlanLatestStatus"), scoped_v007_plan_path or "")
        add_check(checks, "scoped-v007-repair-candidate-plan-queue-status", scoped_v007_plan.get("queueStatus"), manifest.get("audioScopedV007RepairCandidatePlanQueueStatus"), scoped_v007_plan_path or "")
        add_check(checks, "scoped-v007-repair-candidate-plan-repairs", int_value(scoped_v007_plan.get("repairActionCount")), int_value(manifest.get("audioScopedV007RepairCandidatePlanRepairActionCount")), scoped_v007_plan_path or "")
        add_check(checks, "scoped-v007-repair-candidate-plan-proofs", int_value(scoped_v007_plan.get("focusedProofActionCount")), int_value(manifest.get("audioScopedV007RepairCandidatePlanFocusedProofActionCount")), scoped_v007_plan_path or "")
        add_check(checks, "scoped-v007-repair-candidate-plan-pass-context", int_value(scoped_v007_plan.get("passContextCount")), int_value(manifest.get("audioScopedV007RepairCandidatePlanPassContextCount")), scoped_v007_plan_path or "")
        add_check(checks, "scoped-v007-repair-candidate-plan-plans", int_value(scoped_v007_plan.get("plannedItemCount")), int_value(manifest.get("audioScopedV007RepairCandidatePlanPlannedItemCount")), scoped_v007_plan_path or "")
        add_check(checks, "scoped-v007-repair-candidate-plan-source-with-notes", int_value(scoped_v007_plan.get("sourceWithNotesCandidateCount")), int_value(manifest.get("audioScopedV007RepairCandidatePlanSourceWithNotesCandidateCount")), scoped_v007_plan_path or "")
        add_false_safety_check(checks, "scoped-v007-repair-candidate-plan-approval-state-changed", scoped_v007_plan, "approvalStateChanged", manifest, "audioScopedV007RepairCandidatePlanApprovalStateChanged", scoped_v007_plan_path or "")
        add_false_safety_check(checks, "scoped-v007-repair-candidate-plan-branch-state-changed", scoped_v007_plan, "branchStateChanged", manifest, "audioScopedV007RepairCandidatePlanBranchStateChanged", scoped_v007_plan_path or "")
        add_false_safety_check(checks, "scoped-v007-repair-candidate-plan-render-attempted", scoped_v007_plan, "renderAttempted", manifest, "audioScopedV007RepairCandidatePlanRenderAttempted", scoped_v007_plan_path or "")
        add_false_safety_check(checks, "scoped-v007-repair-candidate-plan-branch-render-attempted", scoped_v007_plan, "branchRenderAttempted", manifest, "audioScopedV007RepairCandidatePlanBranchRenderAttempted", scoped_v007_plan_path or "")
        add_false_safety_check(checks, "scoped-v007-repair-candidate-plan-upload-attempted", scoped_v007_plan, "uploadAttempted", manifest, "audioScopedV007RepairCandidatePlanUploadAttempted", scoped_v007_plan_path or "")
        add_false_safety_check(checks, "scoped-v007-repair-candidate-plan-publication-attempted", scoped_v007_plan, "publicationAttempted", manifest, "audioScopedV007RepairCandidatePlanPublicationAttempted", scoped_v007_plan_path or "")
        add_false_safety_check(checks, "scoped-v007-repair-candidate-plan-original-media-mutated", scoped_v007_plan, "originalMediaMutated", manifest, "audioScopedV007RepairCandidatePlanOriginalMediaMutated", scoped_v007_plan_path or "")

    scoped_v007_smoke, scoped_v007_smoke_path = load_output_report(outputs, "latestAudioScopedV007RepairCandidatePlanSmoke")
    add_presence_check(checks, "scoped-v007-repair-candidate-plan-smoke-report-present", scoped_v007_smoke, scoped_v007_smoke_path)
    add_output_file_check(checks, outputs, "latestAudioScopedV007RepairCandidatePlanSmokeMarkdown", "scoped-v007-repair-candidate-plan-smoke-markdown-present")
    add_output_file_check(checks, outputs, "latestAudioScopedV007RepairCandidatePlanSmokeHtml", "scoped-v007-repair-candidate-plan-smoke-html-present")
    add_output_file_check(checks, outputs, "latestAudioScopedV007RepairCandidatePlanSmokeOpenCommand", "scoped-v007-repair-candidate-plan-smoke-open-command-present")
    if scoped_v007_smoke:
        add_check(checks, "scoped-v007-repair-candidate-plan-smoke-passed", bool_value(scoped_v007_smoke.get("passed")), bool_value(manifest.get("audioScopedV007RepairCandidatePlanSmokePassed")), scoped_v007_smoke_path or "")
        add_check(checks, "scoped-v007-repair-candidate-plan-smoke-scenarios", int_value(scoped_v007_smoke.get("scenarioCount")), int_value(manifest.get("audioScopedV007RepairCandidatePlanSmokeScenarioCount")), scoped_v007_smoke_path or "")
        add_check(checks, "scoped-v007-repair-candidate-plan-smoke-failures", int_value(scoped_v007_smoke.get("failureCount")), int_value(manifest.get("audioScopedV007RepairCandidatePlanSmokeFailureCount")), scoped_v007_smoke_path or "")
        add_check(checks, "scoped-v007-repair-candidate-plan-smoke-real-approval-preserved", bool_value(scoped_v007_smoke.get("realApprovalStatePreserved")), bool_value(manifest.get("audioScopedV007RepairCandidatePlanSmokeRealApprovalStatePreserved")), scoped_v007_smoke_path or "")
        add_check(checks, "scoped-v007-repair-candidate-plan-smoke-real-branch-preserved", bool_value(scoped_v007_smoke.get("realBranchStatePreserved")), bool_value(manifest.get("audioScopedV007RepairCandidatePlanSmokeRealBranchStatePreserved")), scoped_v007_smoke_path or "")
        add_false_safety_check(checks, "scoped-v007-repair-candidate-plan-smoke-approval-state-changed", scoped_v007_smoke, "approvalStateChanged", manifest, "audioScopedV007RepairCandidatePlanSmokeApprovalStateChanged", scoped_v007_smoke_path or "")
        add_false_safety_check(checks, "scoped-v007-repair-candidate-plan-smoke-branch-state-changed", scoped_v007_smoke, "branchStateChanged", manifest, "audioScopedV007RepairCandidatePlanSmokeBranchStateChanged", scoped_v007_smoke_path or "")
        add_false_safety_check(checks, "scoped-v007-repair-candidate-plan-smoke-render-attempted", scoped_v007_smoke, "renderAttempted", manifest, "audioScopedV007RepairCandidatePlanSmokeRenderAttempted", scoped_v007_smoke_path or "")
        add_false_safety_check(checks, "scoped-v007-repair-candidate-plan-smoke-branch-render-attempted", scoped_v007_smoke, "branchRenderAttempted", manifest, "audioScopedV007RepairCandidatePlanSmokeBranchRenderAttempted", scoped_v007_smoke_path or "")
        add_false_safety_check(checks, "scoped-v007-repair-candidate-plan-smoke-upload-attempted", scoped_v007_smoke, "uploadAttempted", manifest, "audioScopedV007RepairCandidatePlanSmokeUploadAttempted", scoped_v007_smoke_path or "")
        add_false_safety_check(checks, "scoped-v007-repair-candidate-plan-smoke-publication-attempted", scoped_v007_smoke, "publicationAttempted", manifest, "audioScopedV007RepairCandidatePlanSmokePublicationAttempted", scoped_v007_smoke_path or "")
        add_false_safety_check(checks, "scoped-v007-repair-candidate-plan-smoke-original-media-mutated", scoped_v007_smoke, "originalMediaMutated", manifest, "audioScopedV007RepairCandidatePlanSmokeOriginalMediaMutated", scoped_v007_smoke_path or "")

    source_balance_triage, source_balance_triage_path = load_output_report(outputs, "latestAudioSourceBalanceTriage")
    add_presence_check(checks, "source-balance-triage-report-present", source_balance_triage, source_balance_triage_path)
    add_output_file_check(checks, outputs, "latestAudioSourceBalanceTriageMarkdown", "source-balance-triage-markdown-present")
    add_output_file_check(checks, outputs, "latestAudioSourceBalanceTriageHtml", "source-balance-triage-html-present")
    add_output_file_check(checks, outputs, "latestAudioSourceBalanceTriageOpenCommand", "source-balance-triage-open-command-present")
    if source_balance_triage:
        add_check(checks, "source-balance-triage-status", source_balance_triage.get("status"), manifest.get("audioSourceBalanceTriageLatestStatus"), source_balance_triage_path or "")
        add_check(checks, "source-balance-triage-warning-count", int_value(source_balance_triage.get("machineWarningCount")), int_value(manifest.get("audioSourceBalanceTriageMachineWarningCount")), source_balance_triage_path or "")
        add_check(checks, "source-balance-triage-window-count", int_value(source_balance_triage.get("triageWindowCount")), int_value(manifest.get("audioSourceBalanceTriageTriageWindowCount")), source_balance_triage_path or "")
        add_check(checks, "source-balance-triage-queue-items", int_value(source_balance_triage.get("queueBalanceItemCount")), int_value(manifest.get("audioSourceBalanceTriageQueueBalanceItemCount")), source_balance_triage_path or "")
        add_check(checks, "source-balance-triage-missing-evidence", int_value(source_balance_triage.get("missingEvidenceCount")), int_value(manifest.get("audioSourceBalanceTriageMissingEvidenceCount")), source_balance_triage_path or "")
        add_check(checks, "source-balance-triage-speaker-survival", bool_value(source_balance_triage.get("allSpeakersSurviveInMaster")), bool_value(manifest.get("audioSourceBalanceTriageAllSpeakersSurviveInMaster")), source_balance_triage_path or "")
        add_false_safety_check(checks, "source-balance-triage-approval-state-changed", source_balance_triage, "approvalStateChanged", manifest, "audioSourceBalanceTriageApprovalStateChanged", source_balance_triage_path or "")
        add_false_safety_check(checks, "source-balance-triage-branch-state-changed", source_balance_triage, "branchStateChanged", manifest, "audioSourceBalanceTriageBranchStateChanged", source_balance_triage_path or "")
        add_false_safety_check(checks, "source-balance-triage-render-attempted", source_balance_triage, "renderAttempted", manifest, "audioSourceBalanceTriageRenderAttempted", source_balance_triage_path or "")
        add_false_safety_check(checks, "source-balance-triage-upload-attempted", source_balance_triage, "uploadAttempted", manifest, "audioSourceBalanceTriageUploadAttempted", source_balance_triage_path or "")
        add_false_safety_check(checks, "source-balance-triage-publication-attempted", source_balance_triage, "publicationAttempted", manifest, "audioSourceBalanceTriagePublicationAttempted", source_balance_triage_path or "")
        add_false_safety_check(checks, "source-balance-triage-original-media-mutated", source_balance_triage, "originalMediaMutated", manifest, "audioSourceBalanceTriageOriginalMediaMutated", source_balance_triage_path or "")

    defect_atlas, defect_atlas_path = load_output_report(outputs, "latestAudioDefectAtlas")
    sound_director, sound_director_path = load_output_report(outputs, "latestAudioSoundDirectorScorecard")
    add_presence_check(checks, "sound-director-scorecard-report-present", sound_director, sound_director_path)
    add_output_file_check(checks, outputs, "latestAudioSoundDirectorScorecardMarkdown", "sound-director-scorecard-markdown-present")
    add_output_file_check(checks, outputs, "latestAudioSoundDirectorScorecardHtml", "sound-director-scorecard-html-present")
    add_output_file_check(checks, outputs, "latestAudioSoundDirectorScorecardOpenCommand", "sound-director-scorecard-open-command-present")
    if sound_director:
        add_check(checks, "sound-director-scorecard-status", sound_director.get("status"), manifest.get("audioSoundDirectorScorecardLatestStatus"), sound_director_path or "")
        add_check(checks, "sound-director-scorecard-score", sound_director.get("machineConfidenceScore"), manifest.get("audioSoundDirectorScorecardMachineConfidenceScore"), sound_director_path or "")
        add_check(checks, "sound-director-scorecard-categories", int_value(sound_director.get("categoryCount")), int_value(manifest.get("audioSoundDirectorScorecardCategoryCount")), sound_director_path or "")
        add_check(checks, "sound-director-scorecard-hard-stops", int_value(sound_director.get("hardStopCount")), int_value(manifest.get("audioSoundDirectorScorecardHardStopCount")), sound_director_path or "")
        add_check(checks, "sound-director-scorecard-risks", int_value(sound_director.get("reviewRiskCount")), int_value(manifest.get("audioSoundDirectorScorecardReviewRiskCount")), sound_director_path or "")
        add_check(checks, "sound-director-scorecard-missing-evidence", int_value(sound_director.get("missingEvidenceCount")), int_value(manifest.get("audioSoundDirectorScorecardMissingEvidenceCount")), sound_director_path or "")
        add_check(checks, "sound-director-scorecard-repairs", int_value(sound_director.get("repairActionCount")), int_value(manifest.get("audioSoundDirectorScorecardRepairActionCount")), sound_director_path or "")
        add_check(checks, "sound-director-scorecard-focused-proofs", int_value(sound_director.get("focusedProofActionCount")), int_value(manifest.get("audioSoundDirectorScorecardFocusedProofActionCount")), sound_director_path or "")
        add_check(checks, "sound-director-scorecard-human-listen-required", bool_value(sound_director.get("humanListenRequired")), bool_value(manifest.get("audioSoundDirectorScorecardHumanListenRequired")), sound_director_path or "")
        add_false_safety_check(checks, "sound-director-scorecard-approval-state-changed", sound_director, "approvalStateChanged", manifest, "audioSoundDirectorScorecardApprovalStateChanged", sound_director_path or "")
        add_false_safety_check(checks, "sound-director-scorecard-branch-state-changed", sound_director, "branchStateChanged", manifest, "audioSoundDirectorScorecardBranchStateChanged", sound_director_path or "")
        add_false_safety_check(checks, "sound-director-scorecard-render-attempted", sound_director, "renderAttempted", manifest, "audioSoundDirectorScorecardRenderAttempted", sound_director_path or "")
        add_false_safety_check(checks, "sound-director-scorecard-upload-attempted", sound_director, "uploadAttempted", manifest, "audioSoundDirectorScorecardUploadAttempted", sound_director_path or "")
        add_false_safety_check(checks, "sound-director-scorecard-publication-attempted", sound_director, "publicationAttempted", manifest, "audioSoundDirectorScorecardPublicationAttempted", sound_director_path or "")
        add_false_safety_check(checks, "sound-director-scorecard-original-media-mutated", sound_director, "originalMediaMutated", manifest, "audioSoundDirectorScorecardOriginalMediaMutated", sound_director_path or "")

    add_presence_check(checks, "audio-defect-atlas-report-present", defect_atlas, defect_atlas_path)
    add_output_file_check(checks, outputs, "latestAudioDefectAtlasMarkdown", "audio-defect-atlas-markdown-present")
    add_output_file_check(checks, outputs, "latestAudioDefectAtlasHtml", "audio-defect-atlas-html-present")
    add_output_file_check(checks, outputs, "latestAudioDefectAtlasOpenCommand", "audio-defect-atlas-open-command-present")
    if defect_atlas:
        summary = defect_atlas.get("summary") if isinstance(defect_atlas.get("summary"), dict) else {}
        add_check(checks, "audio-defect-atlas-status", defect_atlas.get("status"), manifest.get("audioDefectAtlasLatestStatus"), defect_atlas_path or "")
        add_check(checks, "audio-defect-atlas-items", int_value(summary.get("itemCount")), int_value(manifest.get("audioDefectAtlasItemCount")), defect_atlas_path or "")
        add_check(checks, "audio-defect-atlas-timed", int_value(summary.get("timedItemCount")), int_value(manifest.get("audioDefectAtlasTimedItemCount")), defect_atlas_path or "")
        add_check(checks, "audio-defect-atlas-stages", int_value(summary.get("stageCount")), int_value(manifest.get("audioDefectAtlasStageCount")), defect_atlas_path or "")
        add_check(checks, "audio-defect-atlas-high-severity", int_value(summary.get("highSeverityCount")), int_value(manifest.get("audioDefectAtlasHighSeverityCount")), defect_atlas_path or "")
        add_check(checks, "audio-defect-atlas-missing-evidence", int_value(summary.get("missingEvidenceCount")), int_value(manifest.get("audioDefectAtlasMissingEvidenceCount")), defect_atlas_path or "")
        add_false_safety_check(checks, "audio-defect-atlas-approval-state-changed", defect_atlas, "approvalStateChanged", manifest, "audioDefectAtlasApprovalStateChanged", defect_atlas_path or "")
        add_false_safety_check(checks, "audio-defect-atlas-branch-state-changed", defect_atlas, "branchStateChanged", manifest, "audioDefectAtlasBranchStateChanged", defect_atlas_path or "")
        add_false_safety_check(checks, "audio-defect-atlas-render-attempted", defect_atlas, "renderAttempted", manifest, "audioDefectAtlasRenderAttempted", defect_atlas_path or "")
        add_false_safety_check(checks, "audio-defect-atlas-upload-attempted", defect_atlas, "uploadAttempted", manifest, "audioDefectAtlasUploadAttempted", defect_atlas_path or "")
        add_false_safety_check(checks, "audio-defect-atlas-publication-attempted", defect_atlas, "publicationAttempted", manifest, "audioDefectAtlasPublicationAttempted", defect_atlas_path or "")
        add_false_safety_check(checks, "audio-defect-atlas-original-media-mutated", defect_atlas, "originalMediaMutated", manifest, "audioDefectAtlasOriginalMediaMutated", defect_atlas_path or "")

    defect_notes, defect_notes_path = load_output_report(outputs, "latestAudioDefectAtlasNotesInbox")
    add_presence_check(checks, "audio-defect-atlas-notes-inbox-report-present", defect_notes, defect_notes_path)
    add_output_file_check(checks, outputs, "latestAudioDefectAtlasNotesInboxMarkdown", "audio-defect-atlas-notes-inbox-markdown-present")
    add_output_file_check(checks, outputs, "latestAudioDefectAtlasNotesInboxHtml", "audio-defect-atlas-notes-inbox-html-present")
    add_output_file_check(checks, outputs, "latestAudioDefectAtlasNotesInboxOpenCommand", "audio-defect-atlas-notes-inbox-open-command-present")
    add_output_file_check(checks, outputs, "latestAudioDefectAtlasNotesTemplate", "audio-defect-atlas-notes-template-present")
    add_output_file_check(checks, outputs, "latestAudioDefectAtlasNotesTemplateMarkdown", "audio-defect-atlas-notes-template-markdown-present")
    if defect_notes:
        add_check(checks, "audio-defect-atlas-notes-inbox-status", defect_notes.get("status"), manifest.get("audioDefectAtlasNotesInboxLatestStatus"), defect_notes_path or "")
        add_check(checks, "audio-defect-atlas-notes-inbox-candidates", int_value(defect_notes.get("matchingCandidateCount")), int_value(manifest.get("audioDefectAtlasNotesInboxMatchingCandidateCount")), defect_notes_path or "")
        add_check(checks, "audio-defect-atlas-notes-inbox-repairs", int_value(defect_notes.get("repairActionCount")), int_value(manifest.get("audioDefectAtlasNotesInboxRepairActionCount")), defect_notes_path or "")
        add_check(checks, "audio-defect-atlas-notes-inbox-proofs", int_value(defect_notes.get("focusedProofActionCount")), int_value(manifest.get("audioDefectAtlasNotesInboxFocusedProofActionCount")), defect_notes_path or "")
        add_check(checks, "audio-defect-atlas-notes-inbox-pass-context", int_value(defect_notes.get("passContextCount")), int_value(manifest.get("audioDefectAtlasNotesInboxPassContextCount")), defect_notes_path or "")
        add_check(checks, "audio-defect-atlas-notes-inbox-unknown-items", int_value(defect_notes.get("unknownItemCount")), int_value(manifest.get("audioDefectAtlasNotesInboxUnknownItemCount")), defect_notes_path or "")
        add_false_safety_check(checks, "audio-defect-atlas-notes-inbox-approval-state-changed", defect_notes, "approvalStateChanged", manifest, "audioDefectAtlasNotesInboxApprovalStateChanged", defect_notes_path or "")
        add_false_safety_check(checks, "audio-defect-atlas-notes-inbox-branch-state-changed", defect_notes, "branchStateChanged", manifest, "audioDefectAtlasNotesInboxBranchStateChanged", defect_notes_path or "")
        add_false_safety_check(checks, "audio-defect-atlas-notes-inbox-render-attempted", defect_notes, "renderAttempted", manifest, "audioDefectAtlasNotesInboxRenderAttempted", defect_notes_path or "")
        add_false_safety_check(checks, "audio-defect-atlas-notes-inbox-upload-attempted", defect_notes, "uploadAttempted", manifest, "audioDefectAtlasNotesInboxUploadAttempted", defect_notes_path or "")
        add_false_safety_check(checks, "audio-defect-atlas-notes-inbox-publication-attempted", defect_notes, "publicationAttempted", manifest, "audioDefectAtlasNotesInboxPublicationAttempted", defect_notes_path or "")
        add_false_safety_check(checks, "audio-defect-atlas-notes-inbox-original-media-mutated", defect_notes, "originalMediaMutated", manifest, "audioDefectAtlasNotesInboxOriginalMediaMutated", defect_notes_path or "")

    defect_notes_smoke, defect_notes_smoke_path = load_output_report(outputs, "latestAudioDefectAtlasNotesInboxSmoke")
    add_presence_check(checks, "audio-defect-atlas-notes-inbox-smoke-report-present", defect_notes_smoke, defect_notes_smoke_path)
    add_output_file_check(checks, outputs, "latestAudioDefectAtlasNotesInboxSmokeMarkdown", "audio-defect-atlas-notes-inbox-smoke-markdown-present")
    if defect_notes_smoke:
        add_check(checks, "audio-defect-atlas-notes-inbox-smoke-passed", bool_value(defect_notes_smoke.get("passed")), bool_value(manifest.get("audioDefectAtlasNotesInboxSmokePassed")), defect_notes_smoke_path or "")
        add_check(checks, "audio-defect-atlas-notes-inbox-smoke-scenarios", int_value(defect_notes_smoke.get("scenarioCount")), int_value(manifest.get("audioDefectAtlasNotesInboxSmokeScenarioCount")), defect_notes_smoke_path or "")
        add_check(checks, "audio-defect-atlas-notes-inbox-smoke-failures", int_value(defect_notes_smoke.get("failureCount")), int_value(manifest.get("audioDefectAtlasNotesInboxSmokeFailureCount")), defect_notes_smoke_path or "")
        add_false_safety_check(checks, "audio-defect-atlas-notes-inbox-smoke-approval-state-changed", defect_notes_smoke, "approvalStateChanged", manifest, "audioDefectAtlasNotesInboxSmokeApprovalStateChanged", defect_notes_smoke_path or "")
        add_false_safety_check(checks, "audio-defect-atlas-notes-inbox-smoke-branch-state-changed", defect_notes_smoke, "branchStateChanged", manifest, "audioDefectAtlasNotesInboxSmokeBranchStateChanged", defect_notes_smoke_path or "")
        add_false_safety_check(checks, "audio-defect-atlas-notes-inbox-smoke-render-attempted", defect_notes_smoke, "renderAttempted", manifest, "audioDefectAtlasNotesInboxSmokeRenderAttempted", defect_notes_smoke_path or "")
        add_false_safety_check(checks, "audio-defect-atlas-notes-inbox-smoke-upload-attempted", defect_notes_smoke, "uploadAttempted", manifest, "audioDefectAtlasNotesInboxSmokeUploadAttempted", defect_notes_smoke_path or "")
        add_false_safety_check(checks, "audio-defect-atlas-notes-inbox-smoke-publication-attempted", defect_notes_smoke, "publicationAttempted", manifest, "audioDefectAtlasNotesInboxSmokePublicationAttempted", defect_notes_smoke_path or "")
        add_false_safety_check(checks, "audio-defect-atlas-notes-inbox-smoke-original-media-mutated", defect_notes_smoke, "originalMediaMutated", manifest, "audioDefectAtlasNotesInboxSmokeOriginalMediaMutated", defect_notes_smoke_path or "")

    final_listen_mission, final_listen_mission_path = load_output_report(outputs, "latestAudioFinalListenMissionPacket")
    add_presence_check(checks, "final-listen-mission-packet-report-present", final_listen_mission, final_listen_mission_path)
    add_output_file_check(checks, outputs, "latestAudioFinalListenMissionPacketMarkdown", "final-listen-mission-packet-markdown-present")
    add_output_file_check(checks, outputs, "latestAudioFinalListenMissionPacketHtml", "final-listen-mission-packet-html-present")
    add_output_file_check(checks, outputs, "latestAudioFinalListenMissionPacketOpenCommand", "final-listen-mission-packet-open-command-present")
    if final_listen_mission:
        add_check(checks, "final-listen-mission-packet-status", final_listen_mission.get("status"), manifest.get("audioFinalListenMissionPacketLatestStatus"), final_listen_mission_path or "")
        add_check(checks, "final-listen-mission-packet-steps", int_value(final_listen_mission.get("missionStepCount")), int_value(manifest.get("audioFinalListenMissionPacketMissionStepCount")), final_listen_mission_path or "")
        add_check(checks, "final-listen-mission-packet-required-steps", int_value(final_listen_mission.get("requiredStepCount")), int_value(manifest.get("audioFinalListenMissionPacketRequiredStepCount")), final_listen_mission_path or "")
        add_check(checks, "final-listen-mission-packet-missing-required", int_value(final_listen_mission.get("missingRequiredArtifactCount")), int_value(manifest.get("audioFinalListenMissionPacketMissingRequiredArtifactCount")), final_listen_mission_path or "")
        add_check(checks, "final-listen-mission-packet-stem-manifest-included", bool_value(final_listen_mission.get("sourceAwareStemManifestIncluded")), bool_value(manifest.get("audioFinalListenMissionPacketSourceAwareStemManifestIncluded")), final_listen_mission_path or "")
        add_check(checks, "final-listen-mission-packet-stem-resolved", int_value(final_listen_mission.get("sourceAwareStemResolvedCount")), int_value(manifest.get("audioFinalListenMissionPacketSourceAwareStemResolvedCount")), final_listen_mission_path or "")
        add_check(checks, "final-listen-mission-packet-source-aware-timing-included", bool_value(final_listen_mission.get("sourceAwareTimingContractIncluded")), bool_value(manifest.get("audioFinalListenMissionPacketSourceAwareTimingContractIncluded")), final_listen_mission_path or "")
        add_check(checks, "final-listen-mission-packet-source-aware-timing-status", final_listen_mission.get("sourceAwareTimingContractStatus") or "", manifest.get("audioFinalListenMissionPacketSourceAwareTimingContractStatus") or "", final_listen_mission_path or "")
        add_check(checks, "final-listen-mission-packet-source-aware-timing-ready", bool_value(final_listen_mission.get("sourceAwareTimingContractReady")), bool_value(manifest.get("audioFinalListenMissionPacketSourceAwareTimingContractReady")), final_listen_mission_path or "")
        add_check(checks, "final-listen-mission-packet-source-aware-timing-ready-roles", int_value(final_listen_mission.get("sourceAwareTimingContractReadyRoleCount")), int_value(manifest.get("audioFinalListenMissionPacketSourceAwareTimingContractReadyRoleCount")), final_listen_mission_path or "")
        add_check(checks, "final-listen-mission-packet-source-aware-timing-hard-stops", int_value(final_listen_mission.get("sourceAwareTimingContractHardStopCount")), int_value(manifest.get("audioFinalListenMissionPacketSourceAwareTimingContractHardStopCount")), final_listen_mission_path or "")
        add_check(checks, "final-listen-mission-packet-source-aware-timing-max-delta", final_listen_mission.get("sourceAwareTimingContractMaxDurationDeltaToMasterSeconds"), manifest.get("audioFinalListenMissionPacketSourceAwareTimingContractMaxDurationDeltaToMasterSeconds"), final_listen_mission_path or "")
        add_check(checks, "final-listen-mission-packet-segment-map-included", bool_value(final_listen_mission.get("segmentLoudnessMapIncluded")), bool_value(manifest.get("audioFinalListenMissionPacketSegmentLoudnessMapIncluded")), final_listen_mission_path or "")
        add_check(checks, "final-listen-mission-packet-segment-map-outliers", int_value(final_listen_mission.get("segmentLoudnessMapOutlierCount")), int_value(manifest.get("audioFinalListenMissionPacketSegmentLoudnessMapOutlierCount")), final_listen_mission_path or "")
        add_false_safety_check(checks, "final-listen-mission-packet-approval-state-changed", final_listen_mission, "approvalStateChanged", manifest, "audioFinalListenMissionPacketApprovalStateChanged", final_listen_mission_path or "")
        add_false_safety_check(checks, "final-listen-mission-packet-branch-state-changed", final_listen_mission, "branchStateChanged", manifest, "audioFinalListenMissionPacketBranchStateChanged", final_listen_mission_path or "")
        add_false_safety_check(checks, "final-listen-mission-packet-render-attempted", final_listen_mission, "renderAttempted", manifest, "audioFinalListenMissionPacketRenderAttempted", final_listen_mission_path or "")
        add_false_safety_check(checks, "final-listen-mission-packet-branch-render-attempted", final_listen_mission, "branchRenderAttempted", manifest, "audioFinalListenMissionPacketBranchRenderAttempted", final_listen_mission_path or "")
        add_false_safety_check(checks, "final-listen-mission-packet-upload-attempted", final_listen_mission, "uploadAttempted", manifest, "audioFinalListenMissionPacketUploadAttempted", final_listen_mission_path or "")
        add_false_safety_check(checks, "final-listen-mission-packet-publication-attempted", final_listen_mission, "publicationAttempted", manifest, "audioFinalListenMissionPacketPublicationAttempted", final_listen_mission_path or "")
        add_false_safety_check(checks, "final-listen-mission-packet-original-media-mutated", final_listen_mission, "originalMediaMutated", manifest, "audioFinalListenMissionPacketOriginalMediaMutated", final_listen_mission_path or "")

    speaker_cleanup_listen_reel, speaker_cleanup_listen_reel_path = load_output_report(outputs, "latestSpeakerCleanupListenReel")
    speaker_cleanup_acceptance, speaker_cleanup_acceptance_path = load_output_report(outputs, "latestSpeakerCleanupAcceptanceBoard")
    add_presence_check(checks, "speaker-cleanup-acceptance-board-report-present", speaker_cleanup_acceptance, speaker_cleanup_acceptance_path)
    add_output_file_check(checks, outputs, "latestSpeakerCleanupAcceptanceBoardMarkdown", "speaker-cleanup-acceptance-board-markdown-present")
    add_output_file_check(checks, outputs, "latestSpeakerCleanupAcceptanceBoardHtml", "speaker-cleanup-acceptance-board-html-present")
    add_output_file_check(checks, outputs, "latestSpeakerCleanupAcceptanceBoardOpenCommand", "speaker-cleanup-acceptance-board-open-command-present")
    if speaker_cleanup_acceptance:
        add_check(checks, "speaker-cleanup-acceptance-status", speaker_cleanup_acceptance.get("status"), manifest.get("speakerCleanupAcceptanceBoardLatestStatus"), speaker_cleanup_acceptance_path or "")
        add_check(checks, "speaker-cleanup-acceptance-machine-checks", int_value(speaker_cleanup_acceptance.get("machineCheckCount")), int_value(manifest.get("speakerCleanupAcceptanceBoardMachineCheckCount")), speaker_cleanup_acceptance_path or "")
        add_check(checks, "speaker-cleanup-acceptance-machine-passed", int_value(speaker_cleanup_acceptance.get("machineCheckPassedCount")), int_value(manifest.get("speakerCleanupAcceptanceBoardMachineCheckPassedCount")), speaker_cleanup_acceptance_path or "")
        add_check(checks, "speaker-cleanup-acceptance-machine-needs-attention", int_value(speaker_cleanup_acceptance.get("machineCheckNeedsAttentionCount")), int_value(manifest.get("speakerCleanupAcceptanceBoardMachineCheckNeedsAttentionCount")), speaker_cleanup_acceptance_path or "")
        add_check(checks, "speaker-cleanup-acceptance-missing-artifacts", int_value(speaker_cleanup_acceptance.get("missingArtifactCount")), int_value(manifest.get("speakerCleanupAcceptanceBoardMissingArtifactCount")), speaker_cleanup_acceptance_path or "")
        add_check(checks, "speaker-cleanup-acceptance-missing-snippets", int_value(speaker_cleanup_acceptance.get("missingSnippetCount")), int_value(manifest.get("speakerCleanupAcceptanceBoardMissingSnippetCount")), speaker_cleanup_acceptance_path or "")
        add_check(checks, "speaker-cleanup-acceptance-focus-windows", int_value(speaker_cleanup_acceptance.get("focusWindowCount")), int_value(manifest.get("speakerCleanupAcceptanceBoardFocusWindowCount")), speaker_cleanup_acceptance_path or "")
        add_check(checks, "speaker-cleanup-acceptance-must-listen", int_value(speaker_cleanup_acceptance.get("mustListenCount")), int_value(manifest.get("speakerCleanupAcceptanceBoardMustListenCount")), speaker_cleanup_acceptance_path or "")
        add_check(checks, "speaker-cleanup-acceptance-human-listen-required", True, bool_value(manifest.get("speakerCleanupAcceptanceBoardHumanListenRequired")), speaker_cleanup_acceptance_path or "")
        add_false_safety_check(checks, "speaker-cleanup-acceptance-approval-state-changed", speaker_cleanup_acceptance, "approvalStateChanged", manifest, "speakerCleanupAcceptanceBoardApprovalStateChanged", speaker_cleanup_acceptance_path or "")
        add_false_safety_check(checks, "speaker-cleanup-acceptance-branch-state-changed", speaker_cleanup_acceptance, "branchStateChanged", manifest, "speakerCleanupAcceptanceBoardBranchStateChanged", speaker_cleanup_acceptance_path or "")
        add_false_safety_check(checks, "speaker-cleanup-acceptance-render-attempted", speaker_cleanup_acceptance, "renderAttempted", manifest, "speakerCleanupAcceptanceBoardRenderAttempted", speaker_cleanup_acceptance_path or "")
        add_false_safety_check(checks, "speaker-cleanup-acceptance-original-media-mutated", speaker_cleanup_acceptance, "originalMediaMutated", manifest, "speakerCleanupAcceptanceBoardOriginalMediaMutated", speaker_cleanup_acceptance_path or "")

    add_presence_check(checks, "speaker-cleanup-listen-reel-report-present", speaker_cleanup_listen_reel, speaker_cleanup_listen_reel_path)
    add_output_file_check(checks, outputs, "latestSpeakerCleanupListenReelMarkdown", "speaker-cleanup-listen-reel-markdown-present")
    add_output_file_check(checks, outputs, "latestSpeakerCleanupListenReelHtml", "speaker-cleanup-listen-reel-html-present")
    add_output_file_check(checks, outputs, "latestSpeakerCleanupListenReelM4a", "speaker-cleanup-listen-reel-m4a-present")
    add_output_file_check(checks, outputs, "latestSpeakerCleanupListenReelM3u", "speaker-cleanup-listen-reel-m3u-present")
    add_output_file_check(checks, outputs, "latestSpeakerCleanupListenReelChapterCsv", "speaker-cleanup-listen-reel-chapters-present")
    add_output_file_check(checks, outputs, "latestSpeakerCleanupListenReelOpenCommand", "speaker-cleanup-listen-reel-open-command-present")
    if speaker_cleanup_listen_reel:
        add_check(checks, "speaker-cleanup-listen-reel-status", speaker_cleanup_listen_reel.get("status"), manifest.get("speakerCleanupListenReelLatestStatus"), speaker_cleanup_listen_reel_path or "")
        add_check(checks, "speaker-cleanup-listen-reel-items", int_value(speaker_cleanup_listen_reel.get("itemCount")), int_value(manifest.get("speakerCleanupListenReelItemCount")), speaker_cleanup_listen_reel_path or "")
        add_check(checks, "speaker-cleanup-listen-reel-rendered", int_value(speaker_cleanup_listen_reel.get("renderedItemCount")), int_value(manifest.get("speakerCleanupListenReelRenderedItemCount")), speaker_cleanup_listen_reel_path or "")
        add_check(checks, "speaker-cleanup-listen-reel-missing", int_value(speaker_cleanup_listen_reel.get("missingSnippetCount")), int_value(manifest.get("speakerCleanupListenReelMissingSnippetCount")), speaker_cleanup_listen_reel_path or "")
        add_check(checks, "speaker-cleanup-listen-reel-must-listen", int_value(speaker_cleanup_listen_reel.get("mustListenCount")), int_value(manifest.get("speakerCleanupListenReelMustListenCount")), speaker_cleanup_listen_reel_path or "")
        add_check(checks, "speaker-cleanup-listen-reel-branch-render-attempted", False, bool_value(speaker_cleanup_listen_reel.get("branchRenderAttempted")), speaker_cleanup_listen_reel_path or "")
        add_check(checks, "speaker-cleanup-listen-reel-manifest-branch-render-attempted", False, bool_value(manifest.get("speakerCleanupListenReelBranchRenderAttempted")), speaker_cleanup_listen_reel_path or "")
        add_false_safety_check(checks, "speaker-cleanup-listen-reel-approval-state-changed", speaker_cleanup_listen_reel, "approvalStateChanged", manifest, "speakerCleanupListenReelApprovalStateChanged", speaker_cleanup_listen_reel_path or "")
        add_false_safety_check(checks, "speaker-cleanup-listen-reel-branch-state-changed", speaker_cleanup_listen_reel, "branchStateChanged", manifest, "speakerCleanupListenReelBranchStateChanged", speaker_cleanup_listen_reel_path or "")
        add_false_safety_check(checks, "speaker-cleanup-listen-reel-render-attempted", speaker_cleanup_listen_reel, "renderAttempted", manifest, "speakerCleanupListenReelRenderAttempted", speaker_cleanup_listen_reel_path or "")
        add_false_safety_check(checks, "speaker-cleanup-listen-reel-upload-attempted", speaker_cleanup_listen_reel, "uploadAttempted", manifest, "speakerCleanupListenReelUploadAttempted", speaker_cleanup_listen_reel_path or "")
        add_false_safety_check(checks, "speaker-cleanup-listen-reel-publication-attempted", speaker_cleanup_listen_reel, "publicationAttempted", manifest, "speakerCleanupListenReelPublicationAttempted", speaker_cleanup_listen_reel_path or "")
        add_false_safety_check(checks, "speaker-cleanup-listen-reel-original-media-mutated", speaker_cleanup_listen_reel, "originalMediaMutated", manifest, "speakerCleanupListenReelOriginalMediaMutated", speaker_cleanup_listen_reel_path or "")

    goal_audit, goal_audit_path = load_output_report(outputs, "latestAudioGoalCompletionAudit")
    add_presence_check(checks, "goal-audit-report-present", goal_audit, goal_audit_path)
    if goal_audit:
        add_check(checks, "goal-audit-proved", int_value(goal_audit.get("provedCount")), int_value(manifest.get("audioGoalCompletionAuditProvedCount")), goal_audit_path or "")
        add_check(checks, "goal-audit-partial", int_value(goal_audit.get("partialCount")), int_value(manifest.get("audioGoalCompletionAuditPartialCount")), goal_audit_path or "")
        add_check(checks, "goal-audit-locked", int_value(goal_audit.get("lockedCount")), int_value(manifest.get("audioGoalCompletionAuditLockedCount")), goal_audit_path or "")
        add_check(checks, "goal-audit-missing", int_value(goal_audit.get("missingCount")), int_value(manifest.get("audioGoalCompletionAuditMissingCount")), goal_audit_path or "")

    transformation_smoke, transformation_smoke_path = load_output_report(outputs, "latestAudioTransformationLineageLedgerSmoke")
    add_presence_check(checks, "transformation-lineage-smoke-report-present", transformation_smoke, transformation_smoke_path)
    if transformation_smoke:
        add_check(checks, "transformation-lineage-smoke-passed", True, bool_value(transformation_smoke.get("passed")), transformation_smoke_path or "")
        if manifest.get("audioTransformationLineageLedgerSmokePassed") is not None:
            add_check(checks, "transformation-lineage-manifest-passed", bool_value(transformation_smoke.get("passed")), bool_value(manifest.get("audioTransformationLineageLedgerSmokePassed")), transformation_smoke_path or "")

    sound_room, sound_room_path = load_output_report(outputs, "latestAudioStudioSoundControlRoom")
    add_presence_check(checks, "studio-sound-control-room-report-present", sound_room, sound_room_path)
    add_output_file_check(checks, outputs, "latestAudioStudioSoundControlRoomMarkdown", "studio-sound-control-room-markdown-present")
    add_output_file_check(checks, outputs, "latestAudioStudioSoundControlRoomHtml", "studio-sound-control-room-html-present")
    add_output_file_check(checks, outputs, "latestAudioStudioSoundNotesTemplate", "studio-sound-notes-template-present")
    add_output_file_check(checks, outputs, "latestAudioStudioSoundControlRoomOpenCommand", "studio-sound-control-room-open-command-present")
    if sound_room:
        add_check(checks, "studio-sound-control-room-status", sound_room.get("status"), manifest.get("audioStudioSoundControlRoomLatestStatus"), sound_room_path or "")
        add_check(checks, "studio-sound-control-room-window-count", int_value(sound_room.get("windowCount")), int_value(manifest.get("audioStudioSoundControlRoomWindowCount")), sound_room_path or "")
        add_check(checks, "studio-sound-control-room-snippet-render-ok", int_value(sound_room.get("snippetRenderOkCount")), int_value(manifest.get("audioStudioSoundControlRoomSnippetRenderOkCount")), sound_room_path or "")
        add_check(checks, "studio-sound-control-room-spectrogram-render-ok", int_value(sound_room.get("spectrogramRenderOkCount")), int_value(manifest.get("audioStudioSoundControlRoomSpectrogramRenderOkCount")), sound_room_path or "")
        add_check(checks, "studio-sound-control-room-render-failures", int_value(sound_room.get("renderFailureCount")), int_value(manifest.get("audioStudioSoundControlRoomRenderFailureCount")), sound_room_path or "")
        add_check(checks, "studio-sound-control-room-risk-windows", int_value(sound_room.get("riskWindowCount")), int_value(manifest.get("audioStudioSoundControlRoomRiskWindowCount")), sound_room_path or "")
        add_false_safety_check(checks, "studio-sound-control-room-approval-state-changed", sound_room, "approvalStateChanged", manifest, "audioStudioSoundControlRoomApprovalStateChanged", sound_room_path or "")
        add_false_safety_check(checks, "studio-sound-control-room-branch-state-changed", sound_room, "branchStateChanged", manifest, "audioStudioSoundControlRoomBranchStateChanged", sound_room_path or "")
        add_false_safety_check(checks, "studio-sound-control-room-branch-render-attempted", sound_room, "branchRenderAttempted", manifest, "audioStudioSoundControlRoomBranchRenderAttempted", sound_room_path or "")
        add_false_safety_check(checks, "studio-sound-control-room-upload-attempted", sound_room, "uploadAttempted", manifest, "audioStudioSoundControlRoomUploadAttempted", sound_room_path or "")
        add_false_safety_check(checks, "studio-sound-control-room-publication-attempted", sound_room, "publicationAttempted", manifest, "audioStudioSoundControlRoomPublicationAttempted", sound_room_path or "")
        add_false_safety_check(checks, "studio-sound-control-room-original-media-mutated", sound_room, "originalMediaMutated", manifest, "audioStudioSoundControlRoomOriginalMediaMutated", sound_room_path or "")

    sound_notes, sound_notes_path = load_output_report(outputs, "latestAudioStudioSoundNotesInbox")
    add_presence_check(checks, "studio-sound-notes-inbox-report-present", sound_notes, sound_notes_path)
    add_output_file_check(checks, outputs, "latestAudioStudioSoundNotesInboxMarkdown", "studio-sound-notes-inbox-markdown-present")
    add_output_file_check(checks, outputs, "latestAudioStudioSoundNotesInboxOpenCommand", "studio-sound-notes-inbox-open-command-present")
    if sound_notes:
        add_check(checks, "studio-sound-notes-inbox-status", sound_notes.get("status"), manifest.get("audioStudioSoundNotesInboxLatestStatus"), sound_notes_path or "")
        add_check(checks, "studio-sound-notes-inbox-candidates", int_value(sound_notes.get("matchingCandidateCount")), int_value(manifest.get("audioStudioSoundNotesInboxMatchingCandidateCount")), sound_notes_path or "")
        add_check(checks, "studio-sound-notes-inbox-repairs", int_value(sound_notes.get("repairActionCount")), int_value(manifest.get("audioStudioSoundNotesInboxRepairActionCount")), sound_notes_path or "")
        add_check(checks, "studio-sound-notes-inbox-proofs", int_value(sound_notes.get("focusedProofActionCount")), int_value(manifest.get("audioStudioSoundNotesInboxFocusedProofActionCount")), sound_notes_path or "")
        add_check(checks, "studio-sound-notes-inbox-pass-context", int_value(sound_notes.get("passContextCount")), int_value(manifest.get("audioStudioSoundNotesInboxPassContextCount")), sound_notes_path or "")
        add_false_safety_check(checks, "studio-sound-notes-inbox-approval-state-changed", sound_notes, "approvalStateChanged", manifest, "audioStudioSoundNotesInboxApprovalStateChanged", sound_notes_path or "")
        add_false_safety_check(checks, "studio-sound-notes-inbox-branch-state-changed", sound_notes, "branchStateChanged", manifest, "audioStudioSoundNotesInboxBranchStateChanged", sound_notes_path or "")
        add_false_safety_check(checks, "studio-sound-notes-inbox-render-attempted", sound_notes, "renderAttempted", manifest, "audioStudioSoundNotesInboxRenderAttempted", sound_notes_path or "")
        add_false_safety_check(checks, "studio-sound-notes-inbox-upload-attempted", sound_notes, "uploadAttempted", manifest, "audioStudioSoundNotesInboxUploadAttempted", sound_notes_path or "")
        add_false_safety_check(checks, "studio-sound-notes-inbox-publication-attempted", sound_notes, "publicationAttempted", manifest, "audioStudioSoundNotesInboxPublicationAttempted", sound_notes_path or "")
        add_false_safety_check(checks, "studio-sound-notes-inbox-original-media-mutated", sound_notes, "originalMediaMutated", manifest, "audioStudioSoundNotesInboxOriginalMediaMutated", sound_notes_path or "")

    sound_notes_smoke, sound_notes_smoke_path = load_output_report(outputs, "latestAudioStudioSoundNotesInboxSmoke")
    add_presence_check(checks, "studio-sound-notes-inbox-smoke-report-present", sound_notes_smoke, sound_notes_smoke_path)
    add_output_file_check(checks, outputs, "latestAudioStudioSoundNotesInboxSmokeMarkdown", "studio-sound-notes-inbox-smoke-markdown-present")
    if sound_notes_smoke:
        add_check(checks, "studio-sound-notes-inbox-smoke-passed", bool_value(sound_notes_smoke.get("passed")), bool_value(manifest.get("audioStudioSoundNotesInboxSmokePassed")), sound_notes_smoke_path or "")
        add_check(checks, "studio-sound-notes-inbox-smoke-scenarios", int_value(sound_notes_smoke.get("scenarioCount")), int_value(manifest.get("audioStudioSoundNotesInboxSmokeScenarioCount")), sound_notes_smoke_path or "")
        add_check(checks, "studio-sound-notes-inbox-smoke-failures", int_value(sound_notes_smoke.get("failureCount")), int_value(manifest.get("audioStudioSoundNotesInboxSmokeFailureCount")), sound_notes_smoke_path or "")
        add_false_safety_check(checks, "studio-sound-notes-inbox-smoke-approval-state-changed", sound_notes_smoke, "approvalStateChanged", manifest, "audioStudioSoundNotesInboxSmokeApprovalStateChanged", sound_notes_smoke_path or "")
        add_false_safety_check(checks, "studio-sound-notes-inbox-smoke-branch-state-changed", sound_notes_smoke, "branchStateChanged", manifest, "audioStudioSoundNotesInboxSmokeBranchStateChanged", sound_notes_smoke_path or "")
        add_false_safety_check(checks, "studio-sound-notes-inbox-smoke-branch-render-attempted", sound_notes_smoke, "branchRenderAttempted", manifest, "audioStudioSoundNotesInboxSmokeBranchRenderAttempted", sound_notes_smoke_path or "")
        add_false_safety_check(checks, "studio-sound-notes-inbox-smoke-render-attempted", sound_notes_smoke, "renderAttempted", manifest, "audioStudioSoundNotesInboxSmokeRenderAttempted", sound_notes_smoke_path or "")
        add_false_safety_check(checks, "studio-sound-notes-inbox-smoke-upload-attempted", sound_notes_smoke, "uploadAttempted", manifest, "audioStudioSoundNotesInboxSmokeUploadAttempted", sound_notes_smoke_path or "")
        add_false_safety_check(checks, "studio-sound-notes-inbox-smoke-publication-attempted", sound_notes_smoke, "publicationAttempted", manifest, "audioStudioSoundNotesInboxSmokePublicationAttempted", sound_notes_smoke_path or "")
        add_false_safety_check(checks, "studio-sound-notes-inbox-smoke-original-media-mutated", sound_notes_smoke, "originalMediaMutated", manifest, "audioStudioSoundNotesInboxSmokeOriginalMediaMutated", sound_notes_smoke_path or "")

    sound_planner, sound_planner_path = load_output_report(outputs, "latestAudioStudioSoundRepairPlanner")
    add_presence_check(checks, "studio-sound-repair-planner-report-present", sound_planner, sound_planner_path)
    add_output_file_check(checks, outputs, "latestAudioStudioSoundRepairPlannerMarkdown", "studio-sound-repair-planner-markdown-present")
    add_output_file_check(checks, outputs, "latestAudioStudioSoundRepairPlannerHtml", "studio-sound-repair-planner-html-present")
    add_output_file_check(checks, outputs, "latestAudioStudioSoundRepairPlannerOpenCommand", "studio-sound-repair-planner-open-command-present")
    if sound_planner:
        add_check(checks, "studio-sound-repair-planner-status", sound_planner.get("status"), manifest.get("audioStudioSoundRepairPlannerLatestStatus"), sound_planner_path or "")
        add_check(checks, "studio-sound-repair-planner-action-count", int_value(sound_planner.get("actionCount")), int_value(manifest.get("audioStudioSoundRepairPlannerActionCount")), sound_planner_path or "")
        add_check(checks, "studio-sound-repair-planner-proof-window-actions", int_value(sound_planner.get("proofWindowActionCount")), int_value(manifest.get("audioStudioSoundRepairPlannerProofWindowActionCount")), sound_planner_path or "")
        add_check(checks, "studio-sound-repair-planner-edit-boundary-actions", int_value(sound_planner.get("editBoundaryActionCount")), int_value(manifest.get("audioStudioSoundRepairPlannerEditBoundaryActionCount")), sound_planner_path or "")
        add_false_safety_check(checks, "studio-sound-repair-planner-approval-state-changed", sound_planner, "approvalStateChanged", manifest, "audioStudioSoundRepairPlannerApprovalStateChanged", sound_planner_path or "")
        add_false_safety_check(checks, "studio-sound-repair-planner-branch-state-changed", sound_planner, "branchStateChanged", manifest, "audioStudioSoundRepairPlannerBranchStateChanged", sound_planner_path or "")
        add_false_safety_check(checks, "studio-sound-repair-planner-branch-render-attempted", sound_planner, "branchRenderAttempted", manifest, "audioStudioSoundRepairPlannerBranchRenderAttempted", sound_planner_path or "")
        add_false_safety_check(checks, "studio-sound-repair-planner-render-attempted", sound_planner, "renderAttempted", manifest, "audioStudioSoundRepairPlannerRenderAttempted", sound_planner_path or "")
        add_false_safety_check(checks, "studio-sound-repair-planner-upload-attempted", sound_planner, "uploadAttempted", manifest, "audioStudioSoundRepairPlannerUploadAttempted", sound_planner_path or "")
        add_false_safety_check(checks, "studio-sound-repair-planner-publication-attempted", sound_planner, "publicationAttempted", manifest, "audioStudioSoundRepairPlannerPublicationAttempted", sound_planner_path or "")
        add_false_safety_check(checks, "studio-sound-repair-planner-original-media-mutated", sound_planner, "originalMediaMutated", manifest, "audioStudioSoundRepairPlannerOriginalMediaMutated", sound_planner_path or "")

    sound_planner_smoke, sound_planner_smoke_path = load_output_report(outputs, "latestAudioStudioSoundRepairPlannerSmoke")
    add_presence_check(checks, "studio-sound-repair-planner-smoke-report-present", sound_planner_smoke, sound_planner_smoke_path)
    add_output_file_check(checks, outputs, "latestAudioStudioSoundRepairPlannerSmokeMarkdown", "studio-sound-repair-planner-smoke-markdown-present")
    if sound_planner_smoke:
        add_check(checks, "studio-sound-repair-planner-smoke-passed", bool_value(sound_planner_smoke.get("passed")), bool_value(manifest.get("audioStudioSoundRepairPlannerSmokePassed")), sound_planner_smoke_path or "")
        add_check(checks, "studio-sound-repair-planner-smoke-scenarios", int_value(sound_planner_smoke.get("scenarioCount")), int_value(manifest.get("audioStudioSoundRepairPlannerSmokeScenarioCount")), sound_planner_smoke_path or "")
        add_check(checks, "studio-sound-repair-planner-smoke-failures", int_value(sound_planner_smoke.get("failureCount")), int_value(manifest.get("audioStudioSoundRepairPlannerSmokeFailureCount")), sound_planner_smoke_path or "")
        add_false_safety_check(checks, "studio-sound-repair-planner-smoke-approval-state-changed", sound_planner_smoke, "approvalStateChanged", manifest, "audioStudioSoundRepairPlannerSmokeApprovalStateChanged", sound_planner_smoke_path or "")
        add_false_safety_check(checks, "studio-sound-repair-planner-smoke-branch-state-changed", sound_planner_smoke, "branchStateChanged", manifest, "audioStudioSoundRepairPlannerSmokeBranchStateChanged", sound_planner_smoke_path or "")
        add_false_safety_check(checks, "studio-sound-repair-planner-smoke-branch-render-attempted", sound_planner_smoke, "branchRenderAttempted", manifest, "audioStudioSoundRepairPlannerSmokeBranchRenderAttempted", sound_planner_smoke_path or "")
        add_false_safety_check(checks, "studio-sound-repair-planner-smoke-render-attempted", sound_planner_smoke, "renderAttempted", manifest, "audioStudioSoundRepairPlannerSmokeRenderAttempted", sound_planner_smoke_path or "")
        add_false_safety_check(checks, "studio-sound-repair-planner-smoke-upload-attempted", sound_planner_smoke, "uploadAttempted", manifest, "audioStudioSoundRepairPlannerSmokeUploadAttempted", sound_planner_smoke_path or "")
        add_false_safety_check(checks, "studio-sound-repair-planner-smoke-publication-attempted", sound_planner_smoke, "publicationAttempted", manifest, "audioStudioSoundRepairPlannerSmokePublicationAttempted", sound_planner_smoke_path or "")
        add_false_safety_check(checks, "studio-sound-repair-planner-smoke-original-media-mutated", sound_planner_smoke, "originalMediaMutated", manifest, "audioStudioSoundRepairPlannerSmokeOriginalMediaMutated", sound_planner_smoke_path or "")

    listen_mission, listen_mission_path = load_output_report(outputs, "latestAudioHumanListenMissionBoard")
    add_presence_check(checks, "human-listen-mission-board-report-present", listen_mission, listen_mission_path)
    add_output_file_check(checks, outputs, "latestAudioHumanListenMissionBoardMarkdown", "human-listen-mission-board-markdown-present")
    add_output_file_check(checks, outputs, "latestAudioHumanListenMissionBoardHtml", "human-listen-mission-board-html-present")
    add_output_file_check(checks, outputs, "latestAudioHumanListenMissionBoardOpenCommand", "human-listen-mission-board-open-command-present")
    if listen_mission:
        add_check(checks, "human-listen-mission-board-status", listen_mission.get("status"), manifest.get("audioHumanListenMissionBoardLatestStatus"), listen_mission_path or "")
        add_check(checks, "human-listen-mission-board-steps", int_value(listen_mission.get("missionStepCount")), int_value(manifest.get("audioHumanListenMissionBoardMissionStepCount")), listen_mission_path or "")
        add_check(checks, "human-listen-mission-board-required-artifacts", int_value(listen_mission.get("requiredArtifactCount")), int_value(manifest.get("audioHumanListenMissionBoardRequiredArtifactCount")), listen_mission_path or "")
        add_check(checks, "human-listen-mission-board-missing-artifacts", int_value(listen_mission.get("missingArtifactCount")), int_value(manifest.get("audioHumanListenMissionBoardMissingArtifactCount")), listen_mission_path or "")
        add_check(checks, "human-listen-mission-board-focus-windows", int_value(listen_mission.get("focusWindowCount")), int_value(manifest.get("audioHumanListenMissionBoardFocusWindowCount")), listen_mission_path or "")
        add_check(checks, "human-listen-mission-board-repair-actions", int_value(listen_mission.get("repairActionCount")), int_value(manifest.get("audioHumanListenMissionBoardRepairActionCount")), listen_mission_path or "")
        add_false_safety_check(checks, "human-listen-mission-board-approval-state-changed", listen_mission, "approvalStateChanged", manifest, "audioHumanListenMissionBoardApprovalStateChanged", listen_mission_path or "")
        add_false_safety_check(checks, "human-listen-mission-board-branch-state-changed", listen_mission, "branchStateChanged", manifest, "audioHumanListenMissionBoardBranchStateChanged", listen_mission_path or "")
        add_false_safety_check(checks, "human-listen-mission-board-render-attempted", listen_mission, "renderAttempted", manifest, "audioHumanListenMissionBoardRenderAttempted", listen_mission_path or "")
        add_false_safety_check(checks, "human-listen-mission-board-upload-attempted", listen_mission, "uploadAttempted", manifest, "audioHumanListenMissionBoardUploadAttempted", listen_mission_path or "")
        add_false_safety_check(checks, "human-listen-mission-board-publication-attempted", listen_mission, "publicationAttempted", manifest, "audioHumanListenMissionBoardPublicationAttempted", listen_mission_path or "")
        add_false_safety_check(checks, "human-listen-mission-board-original-media-mutated", listen_mission, "originalMediaMutated", manifest, "audioHumanListenMissionBoardOriginalMediaMutated", listen_mission_path or "")

    listen_reel, listen_reel_path = load_output_report(outputs, "latestAudioHumanListenMissionReel")
    add_presence_check(checks, "human-listen-mission-reel-report-present", listen_reel, listen_reel_path)
    add_output_file_check(checks, outputs, "latestAudioHumanListenMissionReelMarkdown", "human-listen-mission-reel-markdown-present")
    add_output_file_check(checks, outputs, "latestAudioHumanListenMissionReelHtml", "human-listen-mission-reel-html-present")
    add_output_file_check(checks, outputs, "latestAudioHumanListenMissionReelM4a", "human-listen-mission-reel-m4a-present")
    add_output_file_check(checks, outputs, "latestAudioHumanListenMissionReelChapterCsv", "human-listen-mission-reel-chapters-present")
    add_output_file_check(checks, outputs, "latestAudioHumanListenMissionReelOpenCommand", "human-listen-mission-reel-open-command-present")
    add_output_file_check(checks, outputs, "latestAudioHumanListenMissionReelNotesTemplate", "human-listen-mission-reel-notes-template-present")
    add_output_file_check(checks, outputs, "latestAudioHumanListenMissionReelNotesTemplateMarkdown", "human-listen-mission-reel-notes-template-markdown-present")
    if listen_reel:
        add_check(checks, "human-listen-mission-reel-status", listen_reel.get("status"), manifest.get("audioHumanListenMissionReelLatestStatus"), listen_reel_path or "")
        add_check(checks, "human-listen-mission-reel-items", int_value(listen_reel.get("itemCount")), int_value(manifest.get("audioHumanListenMissionReelItemCount")), listen_reel_path or "")
        add_check(checks, "human-listen-mission-reel-rendered-items", int_value(listen_reel.get("renderedItemCount")), int_value(manifest.get("audioHumanListenMissionReelRenderedItemCount")), listen_reel_path or "")
        add_check(checks, "human-listen-mission-reel-missing-snippets", int_value(listen_reel.get("missingSnippetCount")), int_value(manifest.get("audioHumanListenMissionReelMissingSnippetCount")), listen_reel_path or "")
        add_check(checks, "human-listen-mission-reel-branch-render-attempted", False, bool_value(listen_reel.get("branchRenderAttempted")), listen_reel_path or "")
        add_check(checks, "human-listen-mission-reel-manifest-branch-render-attempted", False, bool_value(manifest.get("audioHumanListenMissionReelBranchRenderAttempted")), listen_reel_path or "")
        add_false_safety_check(checks, "human-listen-mission-reel-approval-state-changed", listen_reel, "approvalStateChanged", manifest, "audioHumanListenMissionReelApprovalStateChanged", listen_reel_path or "")
        add_false_safety_check(checks, "human-listen-mission-reel-branch-state-changed", listen_reel, "branchStateChanged", manifest, "audioHumanListenMissionReelBranchStateChanged", listen_reel_path or "")
        add_false_safety_check(checks, "human-listen-mission-reel-upload-attempted", listen_reel, "uploadAttempted", manifest, "audioHumanListenMissionReelUploadAttempted", listen_reel_path or "")
        add_false_safety_check(checks, "human-listen-mission-reel-publication-attempted", listen_reel, "publicationAttempted", manifest, "audioHumanListenMissionReelPublicationAttempted", listen_reel_path or "")
        add_false_safety_check(checks, "human-listen-mission-reel-original-media-mutated", listen_reel, "originalMediaMutated", manifest, "audioHumanListenMissionReelOriginalMediaMutated", listen_reel_path or "")

    decision_front_door, decision_front_door_path = load_output_report(outputs, "latestHumanListenDecisionFrontDoor")
    add_presence_check(checks, "human-listen-decision-front-door-report-present", decision_front_door, decision_front_door_path)
    add_output_file_check(checks, outputs, "latestHumanListenDecisionFrontDoorMarkdown", "human-listen-decision-front-door-markdown-present")
    add_output_file_check(checks, outputs, "latestHumanListenDecisionFrontDoorHtml", "human-listen-decision-front-door-html-present")
    add_output_file_check(checks, outputs, "latestHumanListenDecisionFrontDoorOpenCommand", "human-listen-decision-front-door-open-command-present")
    add_output_file_check(checks, outputs, "latestHumanListenDecisionRecordCommand", "human-listen-decision-record-command-present")
    if decision_front_door:
        runway = decision_front_door.get("reviewRunway") if isinstance(decision_front_door.get("reviewRunway"), dict) else {}
        add_check(checks, "human-listen-decision-front-door-status", decision_front_door.get("status"), manifest.get("humanListenDecisionFrontDoorStatus"), decision_front_door_path or "")
        add_check(checks, "audio-human-listen-decision-front-door-status", decision_front_door.get("status"), manifest.get("audioHumanListenDecisionFrontDoorLatestStatus"), decision_front_door_path or "")
        add_check(checks, "human-listen-decision-record-command-path", decision_front_door.get("recordDecisionCommand"), manifest.get("humanListenDecisionRecordCommandPath"), decision_front_door_path or "")
        add_check(checks, "human-listen-decision-record-command-present", bool_value(manifest.get("humanListenDecisionRecordCommandPresent")), True, decision_front_door_path or "")
        add_check(checks, "audio-human-listen-decision-record-command-path", decision_front_door.get("recordDecisionCommand"), manifest.get("audioHumanListenDecisionRecordCommandPath"), decision_front_door_path or "")
        add_check(checks, "audio-human-listen-decision-record-command-present", bool_value(manifest.get("audioHumanListenDecisionRecordCommandPresent")), True, decision_front_door_path or "")
        add_check(checks, "human-listen-decision-front-door-missing-required", int_value(decision_front_door.get("missingRequiredArtifactCount")), int_value(manifest.get("humanListenDecisionFrontDoorMissingRequiredArtifactCount")), decision_front_door_path or "")
        add_check(checks, "audio-human-listen-decision-front-door-missing-required", int_value(decision_front_door.get("missingRequiredArtifactCount")), int_value(manifest.get("audioHumanListenDecisionFrontDoorMissingRequiredArtifactCount")), decision_front_door_path or "")
        add_check(checks, "human-listen-decision-front-door-mission-focus", int_value(runway.get("missionFocusWindowCount")), int_value(manifest.get("humanListenDecisionFrontDoorMissionFocusWindowCount")), decision_front_door_path or "")
        add_check(checks, "human-listen-decision-front-door-reel-items", int_value(runway.get("missionReelItemCount")), int_value(manifest.get("humanListenDecisionFrontDoorMissionReelItemCount")), decision_front_door_path or "")
        add_check(checks, "human-listen-decision-front-door-source-balance-windows", int_value(runway.get("sourceBalanceTriageWindowCount")), int_value(manifest.get("humanListenDecisionFrontDoorSourceBalanceTriageWindowCount")), decision_front_door_path or "")
        add_check(checks, "human-listen-decision-front-door-speaker-cleanup-listen", int_value(runway.get("speakerCleanupMustListenCount")), int_value(manifest.get("humanListenDecisionFrontDoorSpeakerCleanupMustListenCount")), decision_front_door_path or "")
        add_check(checks, "human-listen-decision-front-door-speaker-cleanup-reel-items", int_value(runway.get("speakerCleanupListenReelItemCount")), int_value(manifest.get("humanListenDecisionFrontDoorSpeakerCleanupListenReelItemCount")), decision_front_door_path or "")
        add_check(checks, "human-listen-decision-front-door-speaker-cleanup-reel-missing", int_value(runway.get("speakerCleanupListenReelMissingSnippetCount")), int_value(manifest.get("humanListenDecisionFrontDoorSpeakerCleanupListenReelMissingSnippetCount")), decision_front_door_path or "")
        add_check(checks, "human-listen-decision-front-door-speakers-survive", bool_value(runway.get("allSpeakersSurviveInMaster")), bool_value(manifest.get("humanListenDecisionFrontDoorAllSpeakersSurviveInMaster")), decision_front_door_path or "")
        add_check(checks, "human-listen-decision-front-door-defect-atlas-items", int_value(runway.get("defectAtlasItemCount")), int_value(manifest.get("humanListenDecisionFrontDoorDefectAtlasItemCount")), decision_front_door_path or "")
        add_check(checks, "human-listen-decision-front-door-defect-atlas-missing", int_value(runway.get("defectAtlasMissingEvidenceCount")), int_value(manifest.get("humanListenDecisionFrontDoorDefectAtlasMissingEvidenceCount")), decision_front_door_path or "")
        add_check(checks, "human-listen-decision-front-door-scoped-v007-plan-status", runway.get("scopedV007PlanStatus"), manifest.get("humanListenDecisionFrontDoorScopedV007PlanStatus"), decision_front_door_path or "")
        add_check(checks, "human-listen-decision-front-door-scoped-v007-plan-queue-status", runway.get("scopedV007PlanQueueStatus"), manifest.get("humanListenDecisionFrontDoorScopedV007PlanQueueStatus"), decision_front_door_path or "")
        add_check(checks, "human-listen-decision-front-door-scoped-v007-plan-sources", int_value(runway.get("scopedV007PlanSourceWithNotesCandidateCount")), int_value(manifest.get("humanListenDecisionFrontDoorScopedV007PlanSourceWithNotesCandidateCount")), decision_front_door_path or "")
        add_check(checks, "human-listen-decision-front-door-scoped-v007-plan-repairs", int_value(runway.get("scopedV007PlanRepairActionCount")), int_value(manifest.get("humanListenDecisionFrontDoorScopedV007PlanRepairActionCount")), decision_front_door_path or "")
        add_check(checks, "human-listen-decision-front-door-scoped-v007-plan-proofs", int_value(runway.get("scopedV007PlanFocusedProofActionCount")), int_value(manifest.get("humanListenDecisionFrontDoorScopedV007PlanFocusedProofActionCount")), decision_front_door_path or "")
        add_check(checks, "human-listen-decision-front-door-scoped-v007-plan-pass-context", int_value(runway.get("scopedV007PlanPassContextCount")), int_value(manifest.get("humanListenDecisionFrontDoorScopedV007PlanPassContextCount")), decision_front_door_path or "")
        add_check(checks, "human-listen-decision-front-door-scoped-v007-plan-plans", int_value(runway.get("scopedV007PlanPlannedItemCount")), int_value(manifest.get("humanListenDecisionFrontDoorScopedV007PlanPlannedItemCount")), decision_front_door_path or "")
        add_check(checks, "human-listen-decision-front-door-scoped-v007-plan-smoke-passed", bool_value(runway.get("scopedV007PlanSmokePassed")), bool_value(manifest.get("humanListenDecisionFrontDoorScopedV007PlanSmokePassed")), decision_front_door_path or "")
        add_check(checks, "human-listen-decision-front-door-scoped-v007-plan-smoke-scenarios", int_value(runway.get("scopedV007PlanSmokeScenarioCount")), int_value(manifest.get("humanListenDecisionFrontDoorScopedV007PlanSmokeScenarioCount")), decision_front_door_path or "")
        add_check(checks, "human-listen-decision-front-door-scoped-v007-plan-smoke-failures", int_value(runway.get("scopedV007PlanSmokeFailureCount")), int_value(manifest.get("humanListenDecisionFrontDoorScopedV007PlanSmokeFailureCount")), decision_front_door_path or "")
        add_false_safety_check(checks, "human-listen-decision-front-door-approval-state-changed", decision_front_door, "approvalStateChanged", manifest, "humanListenDecisionFrontDoorApprovalStateChanged", decision_front_door_path or "")
        add_false_safety_check(checks, "human-listen-decision-front-door-branch-state-changed", decision_front_door, "branchStateChanged", manifest, "humanListenDecisionFrontDoorBranchStateChanged", decision_front_door_path or "")
        add_false_safety_check(checks, "human-listen-decision-front-door-render-attempted", decision_front_door, "renderAttempted", manifest, "humanListenDecisionFrontDoorRenderAttempted", decision_front_door_path or "")
        add_false_safety_check(checks, "human-listen-decision-front-door-upload-attempted", decision_front_door, "uploadAttempted", manifest, "humanListenDecisionFrontDoorUploadAttempted", decision_front_door_path or "")
        add_false_safety_check(checks, "human-listen-decision-front-door-publication-attempted", decision_front_door, "publicationAttempted", manifest, "humanListenDecisionFrontDoorPublicationAttempted", decision_front_door_path or "")
        add_false_safety_check(checks, "human-listen-decision-front-door-original-media-mutated", decision_front_door, "originalMediaMutated", manifest, "humanListenDecisionFrontDoorOriginalMediaMutated", decision_front_door_path or "")
        add_false_safety_check(checks, "audio-human-listen-decision-front-door-approval-state-changed", decision_front_door, "approvalStateChanged", manifest, "audioHumanListenDecisionFrontDoorApprovalStateChanged", decision_front_door_path or "")
        add_false_safety_check(checks, "audio-human-listen-decision-front-door-branch-state-changed", decision_front_door, "branchStateChanged", manifest, "audioHumanListenDecisionFrontDoorBranchStateChanged", decision_front_door_path or "")
        add_false_safety_check(checks, "audio-human-listen-decision-front-door-render-attempted", decision_front_door, "renderAttempted", manifest, "audioHumanListenDecisionFrontDoorRenderAttempted", decision_front_door_path or "")
        add_false_safety_check(checks, "audio-human-listen-decision-front-door-upload-attempted", decision_front_door, "uploadAttempted", manifest, "audioHumanListenDecisionFrontDoorUploadAttempted", decision_front_door_path or "")
        add_false_safety_check(checks, "audio-human-listen-decision-front-door-publication-attempted", decision_front_door, "publicationAttempted", manifest, "audioHumanListenDecisionFrontDoorPublicationAttempted", decision_front_door_path or "")
        add_false_safety_check(checks, "audio-human-listen-decision-front-door-original-media-mutated", decision_front_door, "originalMediaMutated", manifest, "audioHumanListenDecisionFrontDoorOriginalMediaMutated", decision_front_door_path or "")

    decision_front_door_smoke, decision_front_door_smoke_path = load_output_report(outputs, "latestHumanListenDecisionFrontDoorSmoke")
    add_presence_check(checks, "human-listen-decision-front-door-smoke-report-present", decision_front_door_smoke, decision_front_door_smoke_path)
    add_output_file_check(checks, outputs, "latestHumanListenDecisionFrontDoorSmokeMarkdown", "human-listen-decision-front-door-smoke-markdown-present")
    if decision_front_door_smoke:
        add_check(checks, "human-listen-decision-front-door-smoke-status", decision_front_door_smoke.get("status"), manifest.get("humanListenDecisionFrontDoorSmokeStatus"), decision_front_door_smoke_path or "")
        add_check(checks, "human-listen-decision-front-door-smoke-passed", bool_value(decision_front_door_smoke.get("passed")), bool_value(manifest.get("humanListenDecisionFrontDoorSmokePassed")), decision_front_door_smoke_path or "")
        add_false_safety_check(checks, "human-listen-decision-front-door-smoke-approval-state-changed", decision_front_door_smoke, "approvalStateChanged", manifest, "humanListenDecisionFrontDoorSmokeApprovalStateChanged", decision_front_door_smoke_path or "")
        add_false_safety_check(checks, "human-listen-decision-front-door-smoke-branch-state-changed", decision_front_door_smoke, "branchStateChanged", manifest, "humanListenDecisionFrontDoorSmokeBranchStateChanged", decision_front_door_smoke_path or "")
        add_false_safety_check(checks, "human-listen-decision-front-door-smoke-render-attempted", decision_front_door_smoke, "renderAttempted", manifest, "humanListenDecisionFrontDoorSmokeRenderAttempted", decision_front_door_smoke_path or "")
        add_false_safety_check(checks, "human-listen-decision-front-door-smoke-upload-attempted", decision_front_door_smoke, "uploadAttempted", manifest, "humanListenDecisionFrontDoorSmokeUploadAttempted", decision_front_door_smoke_path or "")
        add_false_safety_check(checks, "human-listen-decision-front-door-smoke-publication-attempted", decision_front_door_smoke, "publicationAttempted", manifest, "humanListenDecisionFrontDoorSmokePublicationAttempted", decision_front_door_smoke_path or "")
        add_false_safety_check(checks, "human-listen-decision-front-door-smoke-original-media-mutated", decision_front_door_smoke, "originalMediaMutated", manifest, "humanListenDecisionFrontDoorSmokeOriginalMediaMutated", decision_front_door_smoke_path or "")

    codex_intake_smoke, codex_intake_smoke_path = load_output_report(outputs, "latestAudioCodexListenDecisionIntakeSmoke")
    add_presence_check(checks, "codex-listen-decision-intake-smoke-report-present", codex_intake_smoke, codex_intake_smoke_path)
    add_output_file_check(checks, outputs, "latestAudioCodexListenDecisionIntakeSmokeMarkdown", "codex-listen-decision-intake-smoke-markdown-present")
    add_output_file_check(checks, outputs, "latestAudioCodexListenDecisionIntakeSmokeHtml", "codex-listen-decision-intake-smoke-html-present")
    if codex_intake_smoke:
        after_truth = codex_intake_smoke.get("afterTruth") if isinstance(codex_intake_smoke.get("afterTruth"), dict) else {}
        add_check(checks, "codex-listen-decision-intake-smoke-status", codex_intake_smoke.get("status"), manifest.get("audioCodexListenDecisionIntakeSmokeLatestStatus"), codex_intake_smoke_path or "")
        add_check(checks, "codex-listen-decision-intake-smoke-passed", bool_value(codex_intake_smoke.get("passed")), bool_value(manifest.get("audioCodexListenDecisionIntakeSmokePassed")), codex_intake_smoke_path or "")
        add_check(checks, "codex-listen-decision-intake-smoke-check-count", int_value(codex_intake_smoke.get("checkCount")), int_value(manifest.get("audioCodexListenDecisionIntakeSmokeCheckCount")), codex_intake_smoke_path or "")
        add_check(checks, "codex-listen-decision-intake-smoke-failure-count", int_value(codex_intake_smoke.get("failureCount")), int_value(manifest.get("audioCodexListenDecisionIntakeSmokeFailureCount")), codex_intake_smoke_path or "")
        add_check(checks, "codex-listen-decision-intake-smoke-real-approval-status", after_truth.get("approvalStatus"), manifest.get("approvalStatus"), codex_intake_smoke_path or "")
        add_check(checks, "codex-listen-decision-intake-smoke-real-branch-inheritance", bool_value(after_truth.get("branchInheritanceReady")), bool_value(manifest.get("branchInheritanceReady")), codex_intake_smoke_path or "")
        add_check(checks, "codex-listen-decision-intake-smoke-real-branch-render", bool_value(after_truth.get("branchRenderReady")), bool_value(manifest.get("branchRenderReady")), codex_intake_smoke_path or "")
        add_check(checks, "codex-listen-decision-intake-smoke-real-audio-truth", after_truth.get("branchRenderAudioTruth"), manifest.get("branchRenderAudioTruth"), codex_intake_smoke_path or "")
        add_check(checks, "codex-listen-decision-intake-smoke-mastered-spine-only-disabled", bool_value(after_truth.get("masteredSpineOnlyEditingAllowed")), bool_value(manifest.get("masteredSpineOnlyEditingAllowed")), codex_intake_smoke_path or "")
        add_false_safety_check(checks, "codex-listen-decision-intake-smoke-approval-state-changed", codex_intake_smoke, "approvalStateChanged", manifest, "audioCodexListenDecisionIntakeSmokeApprovalStateChanged", codex_intake_smoke_path or "")
        add_false_safety_check(checks, "codex-listen-decision-intake-smoke-branch-state-changed", codex_intake_smoke, "branchStateChanged", manifest, "audioCodexListenDecisionIntakeSmokeBranchStateChanged", codex_intake_smoke_path or "")
        add_false_safety_check(checks, "codex-listen-decision-intake-smoke-render-attempted", codex_intake_smoke, "renderAttempted", manifest, "audioCodexListenDecisionIntakeSmokeRenderAttempted", codex_intake_smoke_path or "")
        add_false_safety_check(checks, "codex-listen-decision-intake-smoke-upload-attempted", codex_intake_smoke, "uploadAttempted", manifest, "audioCodexListenDecisionIntakeSmokeUploadAttempted", codex_intake_smoke_path or "")
        add_false_safety_check(checks, "codex-listen-decision-intake-smoke-publication-attempted", codex_intake_smoke, "publicationAttempted", manifest, "audioCodexListenDecisionIntakeSmokePublicationAttempted", codex_intake_smoke_path or "")
        add_false_safety_check(checks, "codex-listen-decision-intake-smoke-original-media-mutated", codex_intake_smoke, "originalMediaMutated", manifest, "audioCodexListenDecisionIntakeSmokeOriginalMediaMutated", codex_intake_smoke_path or "")

    codex_record_smoke, codex_record_smoke_path = load_output_report(outputs, "latestAudioCodexListenDecisionRecordSandboxSmoke")
    add_presence_check(checks, "codex-listen-decision-record-sandbox-smoke-report-present", codex_record_smoke, codex_record_smoke_path)
    add_output_file_check(checks, outputs, "latestAudioCodexListenDecisionRecordSandboxSmokeMarkdown", "codex-listen-decision-record-sandbox-smoke-markdown-present")
    add_output_file_check(checks, outputs, "latestAudioCodexListenDecisionRecordSandboxSmokeHtml", "codex-listen-decision-record-sandbox-smoke-html-present")
    if codex_record_smoke:
        add_check(checks, "codex-listen-decision-record-sandbox-smoke-status", codex_record_smoke.get("status"), manifest.get("audioCodexListenDecisionRecordSandboxSmokeLatestStatus"), codex_record_smoke_path or "")
        add_check(checks, "codex-listen-decision-record-sandbox-smoke-passed", bool_value(codex_record_smoke.get("passed")), bool_value(manifest.get("audioCodexListenDecisionRecordSandboxSmokePassed")), codex_record_smoke_path or "")
        add_check(checks, "codex-listen-decision-record-sandbox-smoke-check-count", int_value(codex_record_smoke.get("checkCount")), int_value(manifest.get("audioCodexListenDecisionRecordSandboxSmokeCheckCount")), codex_record_smoke_path or "")
        add_check(checks, "codex-listen-decision-record-sandbox-smoke-failure-count", int_value(codex_record_smoke.get("failureCount")), int_value(manifest.get("audioCodexListenDecisionRecordSandboxSmokeFailureCount")), codex_record_smoke_path or "")
        add_check(checks, "codex-listen-decision-record-sandbox-smoke-real-approval-preserved", bool_value(codex_record_smoke.get("realApprovalPreserved")), bool_value(manifest.get("audioCodexListenDecisionRecordSandboxSmokeRealApprovalPreserved")), codex_record_smoke_path or "")
        add_check(checks, "codex-listen-decision-record-sandbox-smoke-real-safety-changed", bool_value(codex_record_smoke.get("realSafetyChanged")), bool_value(manifest.get("audioCodexListenDecisionRecordSandboxSmokeRealSafetyChanged")), codex_record_smoke_path or "")
        add_check(checks, "codex-listen-decision-record-sandbox-smoke-refresh-ran", bool_value(codex_record_smoke.get("adapterPostDecisionRefreshRan")), bool_value(manifest.get("audioCodexListenDecisionRecordSandboxSmokeAdapterPostDecisionRefreshRan")), codex_record_smoke_path or "")
        add_check(checks, "codex-listen-decision-record-sandbox-smoke-refresh-script", codex_record_smoke.get("adapterPostDecisionRefreshCanonicalScript"), manifest.get("audioCodexListenDecisionRecordSandboxSmokeAdapterPostDecisionRefreshCanonicalScript"), codex_record_smoke_path or "")
        add_check(checks, "codex-listen-decision-record-sandbox-smoke-sandbox-branch-inheritance", bool_value(codex_record_smoke.get("sandboxBranchInheritanceReady")), bool_value(manifest.get("audioCodexListenDecisionRecordSandboxSmokeSandboxBranchInheritanceReady")), codex_record_smoke_path or "")
        add_check(checks, "codex-listen-decision-record-sandbox-smoke-sandbox-branch-render", bool_value(codex_record_smoke.get("sandboxBranchRenderReady")), bool_value(manifest.get("audioCodexListenDecisionRecordSandboxSmokeSandboxBranchRenderReady")), codex_record_smoke_path or "")
        add_check(checks, "codex-listen-decision-record-sandbox-smoke-sandbox-audio-truth", codex_record_smoke.get("sandboxBranchRenderAudioTruth"), manifest.get("audioCodexListenDecisionRecordSandboxSmokeSandboxBranchRenderAudioTruth"), codex_record_smoke_path or "")
        add_check(checks, "codex-listen-decision-record-sandbox-smoke-sandbox-commands", bool_value(codex_record_smoke.get("sandboxRealBranchRenderCommandsExposed")), bool_value(manifest.get("audioCodexListenDecisionRecordSandboxSmokeSandboxRealBranchRenderCommandsExposed")), codex_record_smoke_path or "")
        add_check(checks, "codex-listen-decision-record-sandbox-smoke-sandbox-refined-stems", bool_value(codex_record_smoke.get("sandboxExecutorWillUseRefinedStems")), bool_value(manifest.get("audioCodexListenDecisionRecordSandboxSmokeSandboxExecutorWillUseRefinedStems")), codex_record_smoke_path or "")
        add_check(checks, "codex-listen-decision-record-sandbox-smoke-sandbox-master-only-prevented", bool_value(codex_record_smoke.get("sandboxExecutorMasterOnlyPrevented")), bool_value(manifest.get("audioCodexListenDecisionRecordSandboxSmokeSandboxExecutorMasterOnlyPrevented")), codex_record_smoke_path or "")
        add_false_safety_check(checks, "codex-listen-decision-record-sandbox-smoke-real-render-attempted", codex_record_smoke, "realRenderAttempted", manifest, "audioCodexListenDecisionRecordSandboxSmokeRealRenderAttempted", codex_record_smoke_path or "")
        add_false_safety_check(checks, "codex-listen-decision-record-sandbox-smoke-real-upload-attempted", codex_record_smoke, "realUploadAttempted", manifest, "audioCodexListenDecisionRecordSandboxSmokeRealUploadAttempted", codex_record_smoke_path or "")
        add_false_safety_check(checks, "codex-listen-decision-record-sandbox-smoke-real-publication-attempted", codex_record_smoke, "realPublicationAttempted", manifest, "audioCodexListenDecisionRecordSandboxSmokeRealPublicationAttempted", codex_record_smoke_path or "")
        add_false_safety_check(checks, "codex-listen-decision-record-sandbox-smoke-real-original-media-mutated", codex_record_smoke, "realOriginalMediaMutated", manifest, "audioCodexListenDecisionRecordSandboxSmokeRealOriginalMediaMutated", codex_record_smoke_path or "")

    listen_reel_notes, listen_reel_notes_path = load_output_report(outputs, "latestAudioHumanListenMissionReelNotesInbox")
    add_presence_check(checks, "human-listen-mission-reel-notes-inbox-report-present", listen_reel_notes, listen_reel_notes_path)
    add_output_file_check(checks, outputs, "latestAudioHumanListenMissionReelNotesInboxMarkdown", "human-listen-mission-reel-notes-inbox-markdown-present")
    add_output_file_check(checks, outputs, "latestAudioHumanListenMissionReelNotesInboxOpenCommand", "human-listen-mission-reel-notes-inbox-open-command-present")
    if listen_reel_notes:
        add_check(checks, "human-listen-mission-reel-notes-inbox-status", listen_reel_notes.get("status"), manifest.get("audioHumanListenMissionReelNotesInboxLatestStatus"), listen_reel_notes_path or "")
        add_check(checks, "human-listen-mission-reel-notes-inbox-candidates", int_value(listen_reel_notes.get("matchingCandidateCount")), int_value(manifest.get("audioHumanListenMissionReelNotesInboxMatchingCandidateCount")), listen_reel_notes_path or "")
        add_check(checks, "human-listen-mission-reel-notes-inbox-repair-actions", int_value(listen_reel_notes.get("repairActionCount")), int_value(manifest.get("audioHumanListenMissionReelNotesInboxRepairActionCount")), listen_reel_notes_path or "")
        add_check(checks, "human-listen-mission-reel-notes-inbox-proof-actions", int_value(listen_reel_notes.get("focusedProofActionCount")), int_value(manifest.get("audioHumanListenMissionReelNotesInboxFocusedProofActionCount")), listen_reel_notes_path or "")
        add_check(checks, "human-listen-mission-reel-notes-inbox-pass-context", int_value(listen_reel_notes.get("passContextCount")), int_value(manifest.get("audioHumanListenMissionReelNotesInboxPassContextCount")), listen_reel_notes_path or "")
        add_false_safety_check(checks, "human-listen-mission-reel-notes-inbox-approval-state-changed", listen_reel_notes, "approvalStateChanged", manifest, "audioHumanListenMissionReelNotesInboxApprovalStateChanged", listen_reel_notes_path or "")
        add_false_safety_check(checks, "human-listen-mission-reel-notes-inbox-branch-state-changed", listen_reel_notes, "branchStateChanged", manifest, "audioHumanListenMissionReelNotesInboxBranchStateChanged", listen_reel_notes_path or "")
        add_false_safety_check(checks, "human-listen-mission-reel-notes-inbox-render-attempted", listen_reel_notes, "renderAttempted", manifest, "audioHumanListenMissionReelNotesInboxRenderAttempted", listen_reel_notes_path or "")
        add_false_safety_check(checks, "human-listen-mission-reel-notes-inbox-upload-attempted", listen_reel_notes, "uploadAttempted", manifest, "audioHumanListenMissionReelNotesInboxUploadAttempted", listen_reel_notes_path or "")
        add_false_safety_check(checks, "human-listen-mission-reel-notes-inbox-publication-attempted", listen_reel_notes, "publicationAttempted", manifest, "audioHumanListenMissionReelNotesInboxPublicationAttempted", listen_reel_notes_path or "")
        add_false_safety_check(checks, "human-listen-mission-reel-notes-inbox-original-media-mutated", listen_reel_notes, "originalMediaMutated", manifest, "audioHumanListenMissionReelNotesInboxOriginalMediaMutated", listen_reel_notes_path or "")

    listen_reel_notes_smoke, listen_reel_notes_smoke_path = load_output_report(outputs, "latestAudioHumanListenMissionReelNotesInboxSmoke")
    add_presence_check(checks, "human-listen-mission-reel-notes-inbox-smoke-report-present", listen_reel_notes_smoke, listen_reel_notes_smoke_path)
    add_output_file_check(checks, outputs, "latestAudioHumanListenMissionReelNotesInboxSmokeMarkdown", "human-listen-mission-reel-notes-inbox-smoke-markdown-present")
    if listen_reel_notes_smoke:
        add_check(checks, "human-listen-mission-reel-notes-inbox-smoke-passed", True, bool_value(listen_reel_notes_smoke.get("passed")), listen_reel_notes_smoke_path or "")
        add_check(checks, "human-listen-mission-reel-notes-inbox-smoke-scenarios", int_value(listen_reel_notes_smoke.get("scenarioCount")), int_value(manifest.get("audioHumanListenMissionReelNotesInboxSmokeScenarioCount")), listen_reel_notes_smoke_path or "")
        add_check(checks, "human-listen-mission-reel-notes-inbox-smoke-failures", int_value(listen_reel_notes_smoke.get("failureCount")), int_value(manifest.get("audioHumanListenMissionReelNotesInboxSmokeFailureCount")), listen_reel_notes_smoke_path or "")
        add_false_safety_check(checks, "human-listen-mission-reel-notes-inbox-smoke-approval-state-changed", listen_reel_notes_smoke, "approvalStateChanged", manifest, "audioHumanListenMissionReelNotesInboxSmokeApprovalStateChanged", listen_reel_notes_smoke_path or "")
        add_false_safety_check(checks, "human-listen-mission-reel-notes-inbox-smoke-branch-state-changed", listen_reel_notes_smoke, "branchStateChanged", manifest, "audioHumanListenMissionReelNotesInboxSmokeBranchStateChanged", listen_reel_notes_smoke_path or "")
        add_false_safety_check(checks, "human-listen-mission-reel-notes-inbox-smoke-render-attempted", listen_reel_notes_smoke, "renderAttempted", manifest, "audioHumanListenMissionReelNotesInboxSmokeRenderAttempted", listen_reel_notes_smoke_path or "")
        add_false_safety_check(checks, "human-listen-mission-reel-notes-inbox-smoke-upload-attempted", listen_reel_notes_smoke, "uploadAttempted", manifest, "audioHumanListenMissionReelNotesInboxSmokeUploadAttempted", listen_reel_notes_smoke_path or "")
        add_false_safety_check(checks, "human-listen-mission-reel-notes-inbox-smoke-publication-attempted", listen_reel_notes_smoke, "publicationAttempted", manifest, "audioHumanListenMissionReelNotesInboxSmokePublicationAttempted", listen_reel_notes_smoke_path or "")
        add_false_safety_check(checks, "human-listen-mission-reel-notes-inbox-smoke-original-media-mutated", listen_reel_notes_smoke, "originalMediaMutated", manifest, "audioHumanListenMissionReelNotesInboxSmokeOriginalMediaMutated", listen_reel_notes_smoke_path or "")

    morning_readiness, morning_readiness_path = load_output_report(outputs, "latestAudioMorningPublicationReadinessPacket")
    quality_methods, quality_methods_path = load_output_report(outputs, "latestAudioQualityMethodsMatrix")
    quality_escalation, quality_escalation_path = load_output_report(outputs, "latestAudioQualityEscalationPlan")
    blind_listen_sampler, blind_listen_sampler_path = load_output_report(outputs, "latestAudioBlindListenSampler")
    blind_listen_notes, blind_listen_notes_path = load_output_report(outputs, "latestAudioBlindListenNotesInbox")
    blind_listen_notes_smoke, blind_listen_notes_smoke_path = load_output_report(outputs, "latestAudioBlindListenNotesInboxSmoke")
    spine_listen_sanity, spine_listen_sanity_path = load_output_report(outputs, "latestAudioSpineListenSanityCheck")
    asr_evidence_adapter, asr_evidence_adapter_path = load_output_report(outputs, "latestAudioAsrEvidenceAdapter")
    transcript_source_agreement, transcript_source_agreement_path = load_output_report(outputs, "latestAudioTranscriptSourceAgreementAudit")
    spine_quality_gate, spine_quality_gate_path = load_output_report(outputs, "latestAudioSpineQualityGate")
    machine_listen_sentinel, machine_listen_sentinel_path = load_output_report(outputs, "latestAudioMachineListenSentinel")
    master_smoothness, master_smoothness_path = load_output_report(outputs, "latestAudioMasterSmoothnessAudit")
    spectral_fatigue, spectral_fatigue_path = load_output_report(outputs, "latestAudioSpectralFatigueAudit")
    translation_survival, translation_survival_path = load_output_report(outputs, "latestAudioTranslationSurvivalAudit")
    morning_launcher, morning_launcher_path = load_output_report(outputs, "latestAudioMorningAudioReviewLauncher")
    post_listen_runway, post_listen_runway_path = load_output_report(outputs, "latestAudioPostListenEpisodeRunway")
    post_listen_router, post_listen_router_path = load_output_report(outputs, "latestAudioPostListenOutcomeRouter")
    if not post_listen_router:
        post_listen_router, post_listen_router_path = load_output_report(outputs, "latestPostListenOutcomeRouter")
    post_listen_router_smoke, post_listen_router_smoke_path = load_output_report(outputs, "latestAudioPostListenOutcomeRouterSmoke")
    if not post_listen_router_smoke:
        post_listen_router_smoke, post_listen_router_smoke_path = load_output_report(outputs, "latestPostListenOutcomeRouterSmoke")
    approved_branch_executor, approved_branch_executor_path = load_output_report(outputs, "latestApprovedBranchRenderExecutor")
    post_approval_rehearsal, post_approval_rehearsal_path = load_output_report(outputs, "latestAudioPostApprovalRenderRehearsal")
    post_approval_runway_packet, post_approval_runway_packet_path = load_output_report(outputs, "latestAudioPostApprovalBranchRunwayPacket")
    post_failure_rehearsal, post_failure_rehearsal_path = load_output_report(outputs, "latestAudioPostFailureRepairRehearsal")
    episode_rollout_board, episode_rollout_board_path = load_output_report(outputs, "latestAudioEpisodeRolloutReadinessBoard")
    episode_media_inventory, episode_media_inventory_path = load_output_report(outputs, "latestAudioEpisodeMediaInventoryPreflight")
    add_presence_check(checks, "morning-publication-readiness-report-present", morning_readiness, morning_readiness_path)
    add_output_file_check(checks, outputs, "latestAudioMorningPublicationReadinessPacketMarkdown", "morning-publication-readiness-markdown-present")
    add_output_file_check(checks, outputs, "latestAudioMorningPublicationReadinessPacketHtml", "morning-publication-readiness-html-present")
    add_output_file_check(checks, outputs, "latestAudioMorningPublicationReadinessPacketOpenCommand", "morning-publication-readiness-open-command-present")
    add_output_file_check(checks, outputs, "latestAudioQualityMethodsMatrixMarkdown", "quality-methods-matrix-markdown-present")
    add_output_file_check(checks, outputs, "latestAudioQualityMethodsMatrixHtml", "quality-methods-matrix-html-present")
    add_output_file_check(checks, outputs, "latestAudioQualityMethodsMatrixOpenCommand", "quality-methods-matrix-open-command-present")
    add_presence_check(checks, "quality-escalation-plan-report-present", quality_escalation, quality_escalation_path)
    add_output_file_check(checks, outputs, "latestAudioQualityEscalationPlanMarkdown", "quality-escalation-plan-markdown-present")
    add_output_file_check(checks, outputs, "latestAudioQualityEscalationPlanHtml", "quality-escalation-plan-html-present")
    add_output_file_check(checks, outputs, "latestAudioQualityEscalationPlanOpenCommand", "quality-escalation-plan-open-command-present")
    add_presence_check(checks, "blind-listen-sampler-report-present", blind_listen_sampler, blind_listen_sampler_path)
    add_output_file_check(checks, outputs, "latestAudioBlindListenSamplerMarkdown", "blind-listen-sampler-markdown-present")
    add_output_file_check(checks, outputs, "latestAudioBlindListenSamplerHtml", "blind-listen-sampler-html-present")
    add_output_file_check(checks, outputs, "latestAudioBlindListenSamplerOpenCommand", "blind-listen-sampler-open-command-present")
    add_presence_check(checks, "blind-listen-notes-inbox-report-present", blind_listen_notes, blind_listen_notes_path)
    add_output_file_check(checks, outputs, "latestAudioBlindListenNotesInboxMarkdown", "blind-listen-notes-inbox-markdown-present")
    add_output_file_check(checks, outputs, "latestAudioBlindListenNotesInboxHtml", "blind-listen-notes-inbox-html-present")
    add_output_file_check(checks, outputs, "latestAudioBlindListenNotesInboxOpenCommand", "blind-listen-notes-inbox-open-command-present")
    add_presence_check(checks, "blind-listen-notes-inbox-smoke-report-present", blind_listen_notes_smoke, blind_listen_notes_smoke_path)
    add_output_file_check(checks, outputs, "latestAudioBlindListenNotesInboxSmokeMarkdown", "blind-listen-notes-inbox-smoke-markdown-present")
    add_presence_check(checks, "audio-spine-listen-sanity-report-present", spine_listen_sanity, spine_listen_sanity_path)
    add_output_file_check(checks, outputs, "latestAudioSpineListenSanityCheckMarkdown", "audio-spine-listen-sanity-markdown-present")
    add_output_file_check(checks, outputs, "latestAudioSpineListenSanityCheckOpenCommand", "audio-spine-listen-sanity-open-command-present")
    add_presence_check(checks, "asr-evidence-adapter-report-present", asr_evidence_adapter, asr_evidence_adapter_path)
    add_output_file_check(checks, outputs, "latestAudioAsrEvidenceAdapterMarkdown", "asr-evidence-adapter-markdown-present")
    add_output_file_check(checks, outputs, "latestAudioAsrEvidenceAdapterHtml", "asr-evidence-adapter-html-present")
    add_output_file_check(checks, outputs, "latestAudioAsrEvidenceAdapterOpenCommand", "asr-evidence-adapter-open-command-present")
    add_output_file_check(checks, outputs, "latestAudioAsrEvidenceAdapterRunCommand", "asr-evidence-adapter-run-command-present")
    add_presence_check(checks, "transcript-source-agreement-report-present", transcript_source_agreement, transcript_source_agreement_path)
    add_output_file_check(checks, outputs, "latestAudioTranscriptSourceAgreementAuditMarkdown", "transcript-source-agreement-markdown-present")
    add_output_file_check(checks, outputs, "latestAudioTranscriptSourceAgreementAuditHtml", "transcript-source-agreement-html-present")
    add_output_file_check(checks, outputs, "latestAudioTranscriptSourceAgreementAuditOpenCommand", "transcript-source-agreement-open-command-present")
    add_output_file_check(checks, outputs, "latestAudioSpineQualityGateMarkdown", "audio-spine-quality-gate-markdown-present")
    add_output_file_check(checks, outputs, "latestAudioSpineQualityGateHtml", "audio-spine-quality-gate-html-present")
    add_output_file_check(checks, outputs, "latestAudioSpineQualityGateOpenCommand", "audio-spine-quality-gate-open-command-present")
    add_output_file_check(checks, outputs, "latestAudioMachineListenSentinelMarkdown", "machine-listen-sentinel-markdown-present")
    add_output_file_check(checks, outputs, "latestAudioMachineListenSentinelHtml", "machine-listen-sentinel-html-present")
    add_output_file_check(checks, outputs, "latestAudioMachineListenSentinelOpenCommand", "machine-listen-sentinel-open-command-present")
    add_presence_check(checks, "master-smoothness-audit-report-present", master_smoothness, master_smoothness_path)
    add_output_file_check(checks, outputs, "latestAudioMasterSmoothnessAuditMarkdown", "master-smoothness-audit-markdown-present")
    add_presence_check(checks, "spectral-fatigue-audit-report-present", spectral_fatigue, spectral_fatigue_path)
    add_output_file_check(checks, outputs, "latestAudioSpectralFatigueAuditMarkdown", "spectral-fatigue-audit-markdown-present")
    add_output_file_check(checks, outputs, "latestAudioSpectralFatigueAuditHtml", "spectral-fatigue-audit-html-present")
    add_output_file_check(checks, outputs, "latestAudioSpectralFatigueAuditOpenCommand", "spectral-fatigue-audit-open-command-present")
    add_presence_check(checks, "translation-survival-audit-report-present", translation_survival, translation_survival_path)
    add_output_file_check(checks, outputs, "latestAudioTranslationSurvivalAuditMarkdown", "translation-survival-audit-markdown-present")
    add_output_file_check(checks, outputs, "latestAudioTranslationSurvivalAuditHtml", "translation-survival-audit-html-present")
    add_output_file_check(checks, outputs, "latestAudioTranslationSurvivalAuditOpenCommand", "translation-survival-audit-open-command-present")
    add_output_file_check(checks, outputs, "latestAudioMorningAudioReviewLauncherMarkdown", "morning-audio-review-launcher-markdown-present")
    add_output_file_check(checks, outputs, "latestAudioMorningAudioReviewLauncherHtml", "morning-audio-review-launcher-html-present")
    add_output_file_check(checks, outputs, "latestAudioMorningAudioReviewLauncherOpenCommand", "morning-audio-review-launcher-open-command-present")
    add_output_file_check(checks, outputs, "latestAudioPostListenEpisodeRunwayMarkdown", "post-listen-episode-runway-markdown-present")
    add_output_file_check(checks, outputs, "latestAudioPostListenEpisodeRunwayHtml", "post-listen-episode-runway-html-present")
    add_output_file_check(checks, outputs, "latestAudioPostListenEpisodeRunwayOpenCommand", "post-listen-episode-runway-open-command-present")
    add_presence_check(checks, "post-listen-outcome-router-report-present", post_listen_router, post_listen_router_path)
    add_output_file_check(checks, outputs, "latestAudioPostListenOutcomeRouterMarkdown", "post-listen-outcome-router-markdown-present")
    add_presence_check(checks, "post-listen-outcome-router-smoke-report-present", post_listen_router_smoke, post_listen_router_smoke_path)
    add_output_file_check(checks, outputs, "latestAudioPostListenOutcomeRouterSmokeMarkdown", "post-listen-outcome-router-smoke-markdown-present")
    add_presence_check(checks, "approved-branch-render-executor-report-present", approved_branch_executor, approved_branch_executor_path)
    add_output_file_check(checks, outputs, "latestApprovedBranchRenderExecutorMarkdown", "approved-branch-render-executor-markdown-present")
    add_output_file_check(checks, outputs, "latestApprovedBranchRenderExecutorOpenCommand", "approved-branch-render-executor-open-command-present")
    add_output_file_check(checks, outputs, "latestApprovedBranchRenderCommand", "approved-branch-render-command-present")
    add_presence_check(checks, "post-approval-render-rehearsal-report-present", post_approval_rehearsal, post_approval_rehearsal_path)
    add_output_file_check(checks, outputs, "latestAudioPostApprovalRenderRehearsalMarkdown", "post-approval-render-rehearsal-markdown-present")
    add_output_file_check(checks, outputs, "latestAudioPostApprovalRenderRehearsalHtml", "post-approval-render-rehearsal-html-present")
    add_output_file_check(checks, outputs, "latestAudioPostApprovalRenderRehearsalOpenCommand", "post-approval-render-rehearsal-open-command-present")
    add_presence_check(checks, "post-approval-branch-runway-packet-report-present", post_approval_runway_packet, post_approval_runway_packet_path)
    add_output_file_check(checks, outputs, "latestAudioPostApprovalBranchRunwayPacketMarkdown", "post-approval-branch-runway-packet-markdown-present")
    add_output_file_check(checks, outputs, "latestAudioPostApprovalBranchRunwayPacketHtml", "post-approval-branch-runway-packet-html-present")
    add_output_file_check(checks, outputs, "latestAudioPostApprovalBranchRunwayPacketOpenCommand", "post-approval-branch-runway-packet-open-command-present")
    add_presence_check(checks, "post-failure-repair-rehearsal-report-present", post_failure_rehearsal, post_failure_rehearsal_path)
    add_output_file_check(checks, outputs, "latestAudioPostFailureRepairRehearsalMarkdown", "post-failure-repair-rehearsal-markdown-present")
    add_output_file_check(checks, outputs, "latestAudioPostFailureRepairRehearsalHtml", "post-failure-repair-rehearsal-html-present")
    add_output_file_check(checks, outputs, "latestAudioPostFailureRepairRehearsalOpenCommand", "post-failure-repair-rehearsal-open-command-present")
    add_output_file_check(checks, outputs, "latestAudioEpisodeMediaInventoryPreflightMarkdown", "episode-media-inventory-markdown-present")
    add_output_file_check(checks, outputs, "latestAudioEpisodeMediaInventoryPreflightHtml", "episode-media-inventory-html-present")
    add_output_file_check(checks, outputs, "latestAudioEpisodeMediaInventoryPreflightOpenCommand", "episode-media-inventory-open-command-present")
    if morning_readiness:
        add_check(checks, "morning-publication-readiness-status", morning_readiness.get("status"), manifest.get("audioMorningPublicationReadinessLatestStatus"), morning_readiness_path or "")
        add_check(checks, "morning-publication-readiness-ready", bool_value(morning_readiness.get("readyForMorningReview")), bool_value(manifest.get("audioMorningPublicationReadinessReadyForMorningReview")), morning_readiness_path or "")
        add_check(checks, "morning-publication-readiness-audio-review-ready", bool_value(morning_readiness.get("machineReadyForAudioReview")), bool_value(manifest.get("audioMorningPublicationReadinessMachineReadyForAudioReview")), morning_readiness_path or "")
        add_check(checks, "morning-publication-readiness-premiere-use", bool_value(morning_readiness.get("machineReadyForManualPremiereUse")), bool_value(manifest.get("audioMorningPublicationReadinessMachineReadyForManualPremiereUse")), morning_readiness_path or "")
        add_check(checks, "morning-publication-readiness-human-listen", bool_value(morning_readiness.get("humanListenRequired")), bool_value(manifest.get("audioMorningPublicationReadinessHumanListenRequired")), morning_readiness_path or "")
        add_check(checks, "morning-publication-readiness-hard-stops", int_value(morning_readiness.get("hardStopCount")), int_value(manifest.get("audioMorningPublicationReadinessHardStopCount")), morning_readiness_path or "")
        add_check(checks, "morning-publication-readiness-risks", int_value(morning_readiness.get("reviewRiskCount")), int_value(manifest.get("audioMorningPublicationReadinessReviewRiskCount")), morning_readiness_path or "")
        add_check(checks, "morning-publication-readiness-platforms", int_value(morning_readiness.get("platformCount")), int_value(manifest.get("audioMorningPublicationReadinessPlatformCount")), morning_readiness_path or "")
        add_check(checks, "morning-publication-readiness-recommended-audio", morning_readiness.get("recommendedAudioFile"), manifest.get("audioMorningPublicationReadinessRecommendedAudioFile"), morning_readiness_path or "")
        add_check(checks, "morning-publication-readiness-recommended-listen", morning_readiness.get("recommendedListeningFile"), manifest.get("audioMorningPublicationReadinessRecommendedListeningFile"), morning_readiness_path or "")
        add_false_safety_check(checks, "morning-publication-readiness-approval-state-changed", morning_readiness, "approvalStateChanged", manifest, "audioMorningPublicationReadinessApprovalStateChanged", morning_readiness_path or "")
        add_false_safety_check(checks, "morning-publication-readiness-branch-state-changed", morning_readiness, "branchStateChanged", manifest, "audioMorningPublicationReadinessBranchStateChanged", morning_readiness_path or "")
        add_false_safety_check(checks, "morning-publication-readiness-render-attempted", morning_readiness, "renderAttempted", manifest, "audioMorningPublicationReadinessRenderAttempted", morning_readiness_path or "")
        add_false_safety_check(checks, "morning-publication-readiness-upload-attempted", morning_readiness, "uploadAttempted", manifest, "audioMorningPublicationReadinessUploadAttempted", morning_readiness_path or "")
        add_false_safety_check(checks, "morning-publication-readiness-publication-attempted", morning_readiness, "publicationAttempted", manifest, "audioMorningPublicationReadinessPublicationAttempted", morning_readiness_path or "")
        add_false_safety_check(checks, "morning-publication-readiness-original-media-mutated", morning_readiness, "originalMediaMutated", manifest, "audioMorningPublicationReadinessOriginalMediaMutated", morning_readiness_path or "")
    if quality_methods:
        add_check(checks, "quality-methods-matrix-status", quality_methods.get("status"), manifest.get("audioQualityMethodsMatrixLatestStatus"), quality_methods_path or "")
        add_check(checks, "quality-methods-matrix-hard-stops", int_value(quality_methods.get("hardStopCount")), int_value(manifest.get("audioQualityMethodsMatrixHardStopCount")), quality_methods_path or "")
        add_check(checks, "quality-methods-matrix-risks", int_value(quality_methods.get("reviewRiskCount")), int_value(manifest.get("audioQualityMethodsMatrixReviewRiskCount")), quality_methods_path or "")
        add_check(checks, "quality-methods-matrix-methods", int_value(quality_methods.get("methodCount")), int_value(manifest.get("audioQualityMethodsMatrixMethodCount")), quality_methods_path or "")
        add_check(checks, "quality-methods-matrix-implemented", int_value(quality_methods.get("implementedMethodCount")), int_value(manifest.get("audioQualityMethodsMatrixImplementedMethodCount")), quality_methods_path or "")
        add_check(checks, "quality-methods-matrix-recommended-next", int_value(quality_methods.get("recommendedNextMethodCount")), int_value(manifest.get("audioQualityMethodsMatrixRecommendedNextMethodCount")), quality_methods_path or "")
        add_check(checks, "quality-methods-matrix-quality-layers", int_value(quality_methods.get("qualityLayerCount")), int_value(manifest.get("audioQualityMethodsMatrixQualityLayerCount")), quality_methods_path or "")
        add_check(checks, "quality-methods-matrix-decision-protocol-steps", int_value(quality_methods.get("qualityDecisionProtocolStepCount")), int_value(manifest.get("audioQualityMethodsMatrixQualityDecisionProtocolStepCount")), quality_methods_path or "")
        add_check(checks, "quality-methods-matrix-research-references", int_value(quality_methods.get("researchReferenceCount")), int_value(manifest.get("audioQualityMethodsMatrixResearchReferenceCount")), quality_methods_path or "")
        add_check(checks, "quality-methods-matrix-quality-target", quality_methods.get("qualityTargetInThisGoal"), manifest.get("audioQualityMethodsMatrixQualityTargetInThisGoal"), quality_methods_path or "")
        add_check(checks, "quality-methods-matrix-not-yet-same-as", quality_methods.get("notYetTheSameAs"), manifest.get("audioQualityMethodsMatrixNotYetTheSameAs"), quality_methods_path or "")
        add_check(checks, "quality-methods-matrix-current-gate-answer", quality_methods.get("currentGateAnswer"), manifest.get("audioQualityMethodsMatrixCurrentGateAnswer"), quality_methods_path or "")
        safety = quality_methods.get("safety") if isinstance(quality_methods.get("safety"), dict) else {}
        add_false_safety_check(checks, "quality-methods-matrix-approval-state-changed", safety, "approvalStateChanged", manifest, "audioQualityMethodsMatrixApprovalStateChanged", quality_methods_path or "")
        add_false_safety_check(checks, "quality-methods-matrix-branch-state-changed", safety, "branchStateChanged", manifest, "audioQualityMethodsMatrixBranchStateChanged", quality_methods_path or "")
        add_false_safety_check(checks, "quality-methods-matrix-render-attempted", safety, "renderAttempted", manifest, "audioQualityMethodsMatrixRenderAttempted", quality_methods_path or "")
        add_false_safety_check(checks, "quality-methods-matrix-upload-attempted", safety, "uploadAttempted", manifest, "audioQualityMethodsMatrixUploadAttempted", quality_methods_path or "")
        add_false_safety_check(checks, "quality-methods-matrix-publication-attempted", safety, "publicationAttempted", manifest, "audioQualityMethodsMatrixPublicationAttempted", quality_methods_path or "")
        add_false_safety_check(checks, "quality-methods-matrix-original-media-mutated", safety, "originalMediaMutated", manifest, "audioQualityMethodsMatrixOriginalMediaMutated", quality_methods_path or "")
    if quality_escalation:
        truth = quality_escalation.get("editorAudioTruth") if isinstance(quality_escalation.get("editorAudioTruth"), dict) else {}
        stems = truth.get("requiredStems") if isinstance(truth.get("requiredStems"), list) else []
        add_check(checks, "quality-escalation-plan-status", quality_escalation.get("status"), manifest.get("audioQualityEscalationPlanLatestStatus"), quality_escalation_path or "")
        add_check(checks, "quality-escalation-plan-hard-stops", int_value(quality_escalation.get("machineHardStopCount")), int_value(manifest.get("audioQualityEscalationPlanMachineHardStopCount")), quality_escalation_path or "")
        add_check(checks, "quality-escalation-plan-asr-risks", int_value(quality_escalation.get("asrReviewRiskCount")), int_value(manifest.get("audioQualityEscalationPlanAsrReviewRiskCount")), quality_escalation_path or "")
        add_check(checks, "quality-escalation-plan-next-methods", len(quality_escalation.get("nextMethods") if isinstance(quality_escalation.get("nextMethods"), list) else []), int_value(manifest.get("audioQualityEscalationPlanNextMethodCount")), quality_escalation_path or "")
        add_check(checks, "quality-escalation-plan-safe-now-methods", len(quality_escalation.get("safeNowMethods") if isinstance(quality_escalation.get("safeNowMethods"), list) else []), int_value(manifest.get("audioQualityEscalationPlanSafeNowMethodCount")), quality_escalation_path or "")
        add_check(checks, "quality-escalation-plan-required-stems", len(stems), int_value(manifest.get("audioQualityEscalationPlanRequiredStemCount")), quality_escalation_path or "")
        add_check(checks, "quality-escalation-plan-editor-rule", truth.get("rule"), manifest.get("audioQualityEscalationPlanEditorAudioTruthRule"), quality_escalation_path or "")
        add_check(checks, "quality-escalation-plan-post-approval-ready", bool_value(quality_escalation.get("postApprovalRunwayReadyWhenHumanApproved")), bool_value(manifest.get("audioQualityEscalationPlanPostApprovalRunwayReadyWhenHumanApproved")), quality_escalation_path or "")
        add_false_safety_check(checks, "quality-escalation-plan-approval-state-changed", quality_escalation, "approvalStateChanged", manifest, "audioQualityEscalationPlanApprovalStateChanged", quality_escalation_path or "")
        add_false_safety_check(checks, "quality-escalation-plan-branch-state-changed", quality_escalation, "branchStateChanged", manifest, "audioQualityEscalationPlanBranchStateChanged", quality_escalation_path or "")
        add_false_safety_check(checks, "quality-escalation-plan-render-attempted", quality_escalation, "renderAttempted", manifest, "audioQualityEscalationPlanRenderAttempted", quality_escalation_path or "")
        add_false_safety_check(checks, "quality-escalation-plan-branch-render-attempted", quality_escalation, "branchRenderAttempted", manifest, "audioQualityEscalationPlanBranchRenderAttempted", quality_escalation_path or "")
        add_false_safety_check(checks, "quality-escalation-plan-upload-attempted", quality_escalation, "uploadAttempted", manifest, "audioQualityEscalationPlanUploadAttempted", quality_escalation_path or "")
        add_false_safety_check(checks, "quality-escalation-plan-publication-attempted", quality_escalation, "publicationAttempted", manifest, "audioQualityEscalationPlanPublicationAttempted", quality_escalation_path or "")
        add_false_safety_check(checks, "quality-escalation-plan-original-media-mutated", quality_escalation, "originalMediaMutated", manifest, "audioQualityEscalationPlanOriginalMediaMutated", quality_escalation_path or "")
    if blind_listen_sampler:
        add_check(checks, "blind-listen-sampler-status", blind_listen_sampler.get("status"), manifest.get("audioBlindListenSamplerLatestStatus"), blind_listen_sampler_path or "")
        add_check(checks, "blind-listen-sampler-samples", int_value(blind_listen_sampler.get("sampleCount")), int_value(manifest.get("audioBlindListenSamplerSampleCount")), blind_listen_sampler_path or "")
        add_check(checks, "blind-listen-sampler-reveals", int_value(blind_listen_sampler.get("hiddenRevealCount")), int_value(manifest.get("audioBlindListenSamplerHiddenRevealCount")), blind_listen_sampler_path or "")
        add_check(checks, "blind-listen-sampler-stage-strata", int_value(blind_listen_sampler.get("stageStratumCount")), int_value(manifest.get("audioBlindListenSamplerStageStratumCount")), blind_listen_sampler_path or "")
        add_check(checks, "blind-listen-sampler-severity-strata", int_value(blind_listen_sampler.get("severityStratumCount")), int_value(manifest.get("audioBlindListenSamplerSeverityStratumCount")), blind_listen_sampler_path or "")
        add_check(checks, "blind-listen-sampler-master-audio", blind_listen_sampler.get("masterAudioPath"), manifest.get("audioBlindListenSamplerMasterAudioPath"), blind_listen_sampler_path or "")
        add_false_safety_check(checks, "blind-listen-sampler-approval-state-changed", blind_listen_sampler, "approvalStateChanged", manifest, "audioBlindListenSamplerApprovalStateChanged", blind_listen_sampler_path or "")
        add_false_safety_check(checks, "blind-listen-sampler-branch-state-changed", blind_listen_sampler, "branchStateChanged", manifest, "audioBlindListenSamplerBranchStateChanged", blind_listen_sampler_path or "")
        add_false_safety_check(checks, "blind-listen-sampler-render-attempted", blind_listen_sampler, "renderAttempted", manifest, "audioBlindListenSamplerRenderAttempted", blind_listen_sampler_path or "")
        add_false_safety_check(checks, "blind-listen-sampler-upload-attempted", blind_listen_sampler, "uploadAttempted", manifest, "audioBlindListenSamplerUploadAttempted", blind_listen_sampler_path or "")
        add_false_safety_check(checks, "blind-listen-sampler-publication-attempted", blind_listen_sampler, "publicationAttempted", manifest, "audioBlindListenSamplerPublicationAttempted", blind_listen_sampler_path or "")
        add_false_safety_check(checks, "blind-listen-sampler-original-media-mutated", blind_listen_sampler, "originalMediaMutated", manifest, "audioBlindListenSamplerOriginalMediaMutated", blind_listen_sampler_path or "")
    if blind_listen_notes:
        add_check(checks, "blind-listen-notes-inbox-status", blind_listen_notes.get("status"), manifest.get("audioBlindListenNotesInboxLatestStatus"), blind_listen_notes_path or "")
        add_check(checks, "blind-listen-notes-inbox-candidates", int_value(blind_listen_notes.get("matchingCandidateCount")), int_value(manifest.get("audioBlindListenNotesInboxMatchingCandidateCount")), blind_listen_notes_path or "")
        add_check(checks, "blind-listen-notes-inbox-repair", int_value(blind_listen_notes.get("repairActionCount")), int_value(manifest.get("audioBlindListenNotesInboxRepairActionCount")), blind_listen_notes_path or "")
        add_check(checks, "blind-listen-notes-inbox-proof", int_value(blind_listen_notes.get("focusedProofActionCount")), int_value(manifest.get("audioBlindListenNotesInboxFocusedProofActionCount")), blind_listen_notes_path or "")
        add_check(checks, "blind-listen-notes-inbox-pass", int_value(blind_listen_notes.get("passContextCount")), int_value(manifest.get("audioBlindListenNotesInboxPassContextCount")), blind_listen_notes_path or "")
        add_check(checks, "blind-listen-notes-inbox-pending", int_value(blind_listen_notes.get("pendingActionCount")), int_value(manifest.get("audioBlindListenNotesInboxPendingActionCount")), blind_listen_notes_path or "")
        add_check(checks, "blind-listen-notes-inbox-unknown", int_value(blind_listen_notes.get("unknownBlindIdCount")), int_value(manifest.get("audioBlindListenNotesInboxUnknownBlindIdCount")), blind_listen_notes_path or "")
        add_check(checks, "blind-listen-notes-inbox-low-ratings", int_value(blind_listen_notes.get("lowRatingCount")), int_value(manifest.get("audioBlindListenNotesInboxLowRatingCount")), blind_listen_notes_path or "")
        add_false_safety_check(checks, "blind-listen-notes-inbox-approval-state-changed", blind_listen_notes, "approvalStateChanged", manifest, "audioBlindListenNotesInboxApprovalStateChanged", blind_listen_notes_path or "")
        add_false_safety_check(checks, "blind-listen-notes-inbox-branch-state-changed", blind_listen_notes, "branchStateChanged", manifest, "audioBlindListenNotesInboxBranchStateChanged", blind_listen_notes_path or "")
        add_false_safety_check(checks, "blind-listen-notes-inbox-render-attempted", blind_listen_notes, "renderAttempted", manifest, "audioBlindListenNotesInboxRenderAttempted", blind_listen_notes_path or "")
        add_false_safety_check(checks, "blind-listen-notes-inbox-upload-attempted", blind_listen_notes, "uploadAttempted", manifest, "audioBlindListenNotesInboxUploadAttempted", blind_listen_notes_path or "")
        add_false_safety_check(checks, "blind-listen-notes-inbox-publication-attempted", blind_listen_notes, "publicationAttempted", manifest, "audioBlindListenNotesInboxPublicationAttempted", blind_listen_notes_path or "")
        add_false_safety_check(checks, "blind-listen-notes-inbox-original-media-mutated", blind_listen_notes, "originalMediaMutated", manifest, "audioBlindListenNotesInboxOriginalMediaMutated", blind_listen_notes_path or "")
    if blind_listen_notes_smoke:
        add_check(checks, "blind-listen-notes-inbox-smoke-passed", bool_value(blind_listen_notes_smoke.get("passed")), bool_value(manifest.get("audioBlindListenNotesInboxSmokePassed")), blind_listen_notes_smoke_path or "")
        add_check(checks, "blind-listen-notes-inbox-smoke-scenarios", int_value(blind_listen_notes_smoke.get("scenarioCount")), int_value(manifest.get("audioBlindListenNotesInboxSmokeScenarioCount")), blind_listen_notes_smoke_path or "")
        add_check(checks, "blind-listen-notes-inbox-smoke-failures", int_value(blind_listen_notes_smoke.get("failureCount")), int_value(manifest.get("audioBlindListenNotesInboxSmokeFailureCount")), blind_listen_notes_smoke_path or "")
        add_false_safety_check(checks, "blind-listen-notes-inbox-smoke-approval-state-changed", blind_listen_notes_smoke, "approvalStateChanged", manifest, "audioBlindListenNotesInboxSmokeApprovalStateChanged", blind_listen_notes_smoke_path or "")
        add_false_safety_check(checks, "blind-listen-notes-inbox-smoke-branch-state-changed", blind_listen_notes_smoke, "branchStateChanged", manifest, "audioBlindListenNotesInboxSmokeBranchStateChanged", blind_listen_notes_smoke_path or "")
        add_false_safety_check(checks, "blind-listen-notes-inbox-smoke-render-attempted", blind_listen_notes_smoke, "renderAttempted", manifest, "audioBlindListenNotesInboxSmokeRenderAttempted", blind_listen_notes_smoke_path or "")
        add_false_safety_check(checks, "blind-listen-notes-inbox-smoke-upload-attempted", blind_listen_notes_smoke, "uploadAttempted", manifest, "audioBlindListenNotesInboxSmokeUploadAttempted", blind_listen_notes_smoke_path or "")
        add_false_safety_check(checks, "blind-listen-notes-inbox-smoke-publication-attempted", blind_listen_notes_smoke, "publicationAttempted", manifest, "audioBlindListenNotesInboxSmokePublicationAttempted", blind_listen_notes_smoke_path or "")
        add_false_safety_check(checks, "blind-listen-notes-inbox-smoke-original-media-mutated", blind_listen_notes_smoke, "originalMediaMutated", manifest, "audioBlindListenNotesInboxSmokeOriginalMediaMutated", blind_listen_notes_smoke_path or "")
    if spine_listen_sanity:
        add_check(checks, "audio-spine-listen-sanity-status", spine_listen_sanity.get("status"), manifest.get("audioSpineListenSanityCheckStatus"), spine_listen_sanity_path or "")
        add_check(checks, "audio-spine-listen-sanity-passed", bool_value(spine_listen_sanity.get("passed")), bool_value(manifest.get("audioSpineListenSanityCheckPassed")), spine_listen_sanity_path or "")
        add_check(checks, "audio-spine-listen-sanity-speakers", len(spine_listen_sanity.get("speakerChecks") if isinstance(spine_listen_sanity.get("speakerChecks"), list) else []), int_value(manifest.get("audioSpineListenSanityCheckSpeakerCheckCount")), spine_listen_sanity_path or "")
        add_check(checks, "audio-spine-listen-sanity-evidence-checks", len(spine_listen_sanity.get("evidenceChecks") if isinstance(spine_listen_sanity.get("evidenceChecks"), list) else []), int_value(manifest.get("audioSpineListenSanityCheckEvidenceCheckCount")), spine_listen_sanity_path or "")
        add_check(checks, "audio-spine-listen-sanity-source-balance-focus", int_value(spine_listen_sanity.get("sourceBalanceFocusRowCount")), int_value(manifest.get("audioSpineListenSanityCheckSourceBalanceFocusRowCount")), spine_listen_sanity_path or "")
        add_check(checks, "audio-spine-listen-sanity-speaker-activity-focus", int_value(spine_listen_sanity.get("speakerActivityFocusWindowCount")), int_value(manifest.get("audioSpineListenSanityCheckSpeakerActivityFocusWindowCount")), spine_listen_sanity_path or "")
        add_check(checks, "audio-spine-listen-sanity-bleed-gap-focus", int_value(spine_listen_sanity.get("speakerBleedGapFocusWindowCount")), int_value(manifest.get("audioSpineListenSanityCheckSpeakerBleedGapFocusWindowCount")), spine_listen_sanity_path or "")
        add_check(checks, "audio-spine-listen-sanity-listen-priority-queue", int_value(spine_listen_sanity.get("listenPriorityQueueCount")), int_value(manifest.get("audioSpineListenSanityCheckListenPriorityQueueCount")), spine_listen_sanity_path or "")
        add_check(checks, "audio-spine-listen-sanity-human-listen-required", bool_value(spine_listen_sanity.get("humanListenStillRequired")), bool_value(manifest.get("audioSpineListenSanityCheckHumanListenStillRequired")), spine_listen_sanity_path or "")
        add_check(checks, "audio-spine-listen-sanity-package-ready", bool_value(spine_listen_sanity.get("packageReadyForHumanListen")), bool_value(manifest.get("audioSpineListenSanityCheckPackageReadyForHumanListen")), spine_listen_sanity_path or "")
        add_false_safety_check(checks, "audio-spine-listen-sanity-approval-state-changed", spine_listen_sanity, "approvalStateChanged", manifest, "audioSpineListenSanityCheckApprovalStateChanged", spine_listen_sanity_path or "")
        add_false_safety_check(checks, "audio-spine-listen-sanity-branch-state-changed", spine_listen_sanity, "branchStateChanged", manifest, "audioSpineListenSanityCheckBranchStateChanged", spine_listen_sanity_path or "")
        add_false_safety_check(checks, "audio-spine-listen-sanity-render-attempted", spine_listen_sanity, "renderAttempted", manifest, "audioSpineListenSanityCheckRenderAttempted", spine_listen_sanity_path or "")
        add_false_safety_check(checks, "audio-spine-listen-sanity-branch-render-attempted", spine_listen_sanity, "branchRenderAttempted", manifest, "audioSpineListenSanityCheckBranchRenderAttempted", spine_listen_sanity_path or "")
        add_false_safety_check(checks, "audio-spine-listen-sanity-upload-attempted", spine_listen_sanity, "uploadAttempted", manifest, "audioSpineListenSanityCheckUploadAttempted", spine_listen_sanity_path or "")
        add_false_safety_check(checks, "audio-spine-listen-sanity-publication-attempted", spine_listen_sanity, "publicationAttempted", manifest, "audioSpineListenSanityCheckPublicationAttempted", spine_listen_sanity_path or "")
        add_false_safety_check(checks, "audio-spine-listen-sanity-original-media-mutated", spine_listen_sanity, "originalMediaMutated", manifest, "audioSpineListenSanityCheckOriginalMediaMutated", spine_listen_sanity_path or "")
    if asr_evidence_adapter:
        add_check(checks, "asr-evidence-adapter-status", asr_evidence_adapter.get("status"), manifest.get("audioAsrEvidenceAdapterLatestStatus"), asr_evidence_adapter_path or "")
        add_check(checks, "asr-evidence-adapter-whisper-available", bool_value(asr_evidence_adapter.get("whisperAvailable")), bool_value(manifest.get("audioAsrEvidenceAdapterWhisperAvailable")), asr_evidence_adapter_path or "")
        add_check(checks, "asr-evidence-adapter-asr-attempted", bool_value(asr_evidence_adapter.get("asrAttempted")), bool_value(manifest.get("audioAsrEvidenceAdapterAsrAttempted")), asr_evidence_adapter_path or "")
        add_check(checks, "asr-evidence-adapter-reused-existing", int_value(asr_evidence_adapter.get("reusedExistingTranscriptCount")), int_value(manifest.get("audioAsrEvidenceAdapterReusedExistingTranscriptCount")), asr_evidence_adapter_path or "")
        add_check(checks, "asr-evidence-adapter-targets", int_value(asr_evidence_adapter.get("targetCount")), int_value(manifest.get("audioAsrEvidenceAdapterTargetCount")), asr_evidence_adapter_path or "")
        add_check(checks, "asr-evidence-adapter-transcripts", int_value(asr_evidence_adapter.get("transcriptGeneratedCount")), int_value(manifest.get("audioAsrEvidenceAdapterTranscriptGeneratedCount")), asr_evidence_adapter_path or "")
        add_check(checks, "asr-evidence-adapter-failures", int_value(asr_evidence_adapter.get("transcriptFailureCount")), int_value(manifest.get("audioAsrEvidenceAdapterTranscriptFailureCount")), asr_evidence_adapter_path or "")
        add_check(checks, "asr-evidence-adapter-human-listen-required", bool_value(asr_evidence_adapter.get("humanListenStillRequired")), bool_value(manifest.get("audioAsrEvidenceAdapterHumanListenStillRequired")), asr_evidence_adapter_path or "")
        add_false_safety_check(checks, "asr-evidence-adapter-approval-state-changed", asr_evidence_adapter, "approvalStateChanged", manifest, "audioAsrEvidenceAdapterApprovalStateChanged", asr_evidence_adapter_path or "")
        add_false_safety_check(checks, "asr-evidence-adapter-branch-state-changed", asr_evidence_adapter, "branchStateChanged", manifest, "audioAsrEvidenceAdapterBranchStateChanged", asr_evidence_adapter_path or "")
        add_false_safety_check(checks, "asr-evidence-adapter-render-attempted", asr_evidence_adapter, "renderAttempted", manifest, "audioAsrEvidenceAdapterRenderAttempted", asr_evidence_adapter_path or "")
        add_false_safety_check(checks, "asr-evidence-adapter-branch-render-attempted", asr_evidence_adapter, "branchRenderAttempted", manifest, "audioAsrEvidenceAdapterBranchRenderAttempted", asr_evidence_adapter_path or "")
        add_false_safety_check(checks, "asr-evidence-adapter-upload-attempted", asr_evidence_adapter, "uploadAttempted", manifest, "audioAsrEvidenceAdapterUploadAttempted", asr_evidence_adapter_path or "")
        add_false_safety_check(checks, "asr-evidence-adapter-publication-attempted", asr_evidence_adapter, "publicationAttempted", manifest, "audioAsrEvidenceAdapterPublicationAttempted", asr_evidence_adapter_path or "")
        add_false_safety_check(checks, "asr-evidence-adapter-original-media-mutated", asr_evidence_adapter, "originalMediaMutated", manifest, "audioAsrEvidenceAdapterOriginalMediaMutated", asr_evidence_adapter_path or "")
    asr_source_master_comparison, asr_source_master_comparison_path = load_output_report(outputs, "latestAudioAsrSourceMasterComparison")
    add_presence_check(checks, "asr-source-master-comparison-report-present", asr_source_master_comparison, asr_source_master_comparison_path)
    add_output_file_check(checks, outputs, "latestAudioAsrSourceMasterComparisonMarkdown", "asr-source-master-comparison-markdown-present")
    add_output_file_check(checks, outputs, "latestAudioAsrSourceMasterComparisonHtml", "asr-source-master-comparison-html-present")
    add_output_file_check(checks, outputs, "latestAudioAsrSourceMasterComparisonOpenCommand", "asr-source-master-comparison-open-command-present")
    if asr_source_master_comparison:
        add_check(checks, "asr-source-master-comparison-status", asr_source_master_comparison.get("status"), manifest.get("audioAsrSourceMasterComparisonLatestStatus"), asr_source_master_comparison_path or "")
        add_check(checks, "asr-source-master-comparison-transcripts", int_value(asr_source_master_comparison.get("asrTranscriptCount")), int_value(manifest.get("audioAsrSourceMasterComparisonTranscriptCount")), asr_source_master_comparison_path or "")
        add_check(checks, "asr-source-master-comparison-windows", int_value(asr_source_master_comparison.get("windowComparisonCount")), int_value(manifest.get("audioAsrSourceMasterComparisonWindowCount")), asr_source_master_comparison_path or "")
        add_check(checks, "asr-source-master-comparison-pairs", int_value(asr_source_master_comparison.get("pairComparisonCount")), int_value(manifest.get("audioAsrSourceMasterComparisonPairCount")), asr_source_master_comparison_path or "")
        add_check(checks, "asr-source-master-comparison-hard-stops", int_value(asr_source_master_comparison.get("hardStopCount")), int_value(manifest.get("audioAsrSourceMasterComparisonHardStopCount")), asr_source_master_comparison_path or "")
        add_check(checks, "asr-source-master-comparison-review-risks", int_value(asr_source_master_comparison.get("reviewRiskCount")), int_value(manifest.get("audioAsrSourceMasterComparisonReviewRiskCount")), asr_source_master_comparison_path or "")
        add_check(checks, "asr-source-master-comparison-human-listen-required", bool_value(asr_source_master_comparison.get("humanListenStillRequired")), bool_value(manifest.get("audioAsrSourceMasterComparisonHumanListenStillRequired")), asr_source_master_comparison_path or "")
        add_false_safety_check(checks, "asr-source-master-comparison-approval-state-changed", asr_source_master_comparison, "approvalStateChanged", manifest, "audioAsrSourceMasterComparisonApprovalStateChanged", asr_source_master_comparison_path or "")
        add_false_safety_check(checks, "asr-source-master-comparison-branch-state-changed", asr_source_master_comparison, "branchStateChanged", manifest, "audioAsrSourceMasterComparisonBranchStateChanged", asr_source_master_comparison_path or "")
        add_false_safety_check(checks, "asr-source-master-comparison-render-attempted", asr_source_master_comparison, "renderAttempted", manifest, "audioAsrSourceMasterComparisonRenderAttempted", asr_source_master_comparison_path or "")
        add_false_safety_check(checks, "asr-source-master-comparison-branch-render-attempted", asr_source_master_comparison, "branchRenderAttempted", manifest, "audioAsrSourceMasterComparisonBranchRenderAttempted", asr_source_master_comparison_path or "")
        add_false_safety_check(checks, "asr-source-master-comparison-upload-attempted", asr_source_master_comparison, "uploadAttempted", manifest, "audioAsrSourceMasterComparisonUploadAttempted", asr_source_master_comparison_path or "")
        add_false_safety_check(checks, "asr-source-master-comparison-publication-attempted", asr_source_master_comparison, "publicationAttempted", manifest, "audioAsrSourceMasterComparisonPublicationAttempted", asr_source_master_comparison_path or "")
        add_false_safety_check(checks, "asr-source-master-comparison-original-media-mutated", asr_source_master_comparison, "originalMediaMutated", manifest, "audioAsrSourceMasterComparisonOriginalMediaMutated", asr_source_master_comparison_path or "")
    asr_review_focus, asr_review_focus_path = load_output_report(outputs, "latestAudioAsrReviewFocusPacket")
    add_presence_check(checks, "asr-review-focus-packet-report-present", asr_review_focus, asr_review_focus_path)
    add_output_file_check(checks, outputs, "latestAudioAsrReviewFocusPacketMarkdown", "asr-review-focus-packet-markdown-present")
    add_output_file_check(checks, outputs, "latestAudioAsrReviewFocusPacketHtml", "asr-review-focus-packet-html-present")
    add_output_file_check(checks, outputs, "latestAudioAsrReviewFocusPacketOpenCommand", "asr-review-focus-packet-open-command-present")
    if asr_review_focus:
        add_check(checks, "asr-review-focus-packet-status", asr_review_focus.get("status"), manifest.get("audioAsrReviewFocusPacketLatestStatus"), asr_review_focus_path or "")
        add_check(checks, "asr-review-focus-packet-focus-windows", int_value(asr_review_focus.get("focusWindowCount")), int_value(manifest.get("audioAsrReviewFocusPacketFocusWindowCount")), asr_review_focus_path or "")
        add_check(checks, "asr-review-focus-packet-hard-stops", int_value(asr_review_focus.get("hardStopCount")), int_value(manifest.get("audioAsrReviewFocusPacketHardStopCount")), asr_review_focus_path or "")
        add_check(checks, "asr-review-focus-packet-review-risks", int_value(asr_review_focus.get("reviewRiskCount")), int_value(manifest.get("audioAsrReviewFocusPacketReviewRiskCount")), asr_review_focus_path or "")
        add_check(checks, "asr-review-focus-packet-human-listen-required", bool_value(asr_review_focus.get("humanListenStillRequired")), bool_value(manifest.get("audioAsrReviewFocusPacketHumanListenStillRequired")), asr_review_focus_path or "")
        add_false_safety_check(checks, "asr-review-focus-packet-approval-state-changed", asr_review_focus, "approvalStateChanged", manifest, "audioAsrReviewFocusPacketApprovalStateChanged", asr_review_focus_path or "")
        add_false_safety_check(checks, "asr-review-focus-packet-branch-state-changed", asr_review_focus, "branchStateChanged", manifest, "audioAsrReviewFocusPacketBranchStateChanged", asr_review_focus_path or "")
        add_false_safety_check(checks, "asr-review-focus-packet-render-attempted", asr_review_focus, "renderAttempted", manifest, "audioAsrReviewFocusPacketRenderAttempted", asr_review_focus_path or "")
        add_false_safety_check(checks, "asr-review-focus-packet-branch-render-attempted", asr_review_focus, "branchRenderAttempted", manifest, "audioAsrReviewFocusPacketBranchRenderAttempted", asr_review_focus_path or "")
        add_false_safety_check(checks, "asr-review-focus-packet-upload-attempted", asr_review_focus, "uploadAttempted", manifest, "audioAsrReviewFocusPacketUploadAttempted", asr_review_focus_path or "")
        add_false_safety_check(checks, "asr-review-focus-packet-publication-attempted", asr_review_focus, "publicationAttempted", manifest, "audioAsrReviewFocusPacketPublicationAttempted", asr_review_focus_path or "")
        add_false_safety_check(checks, "asr-review-focus-packet-original-media-mutated", asr_review_focus, "originalMediaMutated", manifest, "audioAsrReviewFocusPacketOriginalMediaMutated", asr_review_focus_path or "")
    if transcript_source_agreement:
        add_check(checks, "transcript-source-agreement-status", transcript_source_agreement.get("status"), manifest.get("audioTranscriptSourceAgreementLatestStatus"), transcript_source_agreement_path or "")
        add_check(checks, "transcript-source-agreement-energy-proxy", bool_value(transcript_source_agreement.get("energyProxyAgreementPassed")), bool_value(manifest.get("audioTranscriptSourceAgreementEnergyProxyPassed")), transcript_source_agreement_path or "")
        add_check(checks, "transcript-source-agreement-semantic-implemented", bool_value(transcript_source_agreement.get("semanticTranscriptAgreementImplemented")), bool_value(manifest.get("audioTranscriptSourceAgreementSemanticImplemented")), transcript_source_agreement_path or "")
        add_check(checks, "transcript-source-agreement-transcript-files", int_value(transcript_source_agreement.get("semanticTranscriptEvidenceFileCount")), int_value(manifest.get("audioTranscriptSourceAgreementTranscriptFileCount")), transcript_source_agreement_path or "")
        add_check(checks, "transcript-source-agreement-asr-adapter-present", bool_value(transcript_source_agreement.get("asrEvidenceAdapterPresent")), bool_value(manifest.get("audioTranscriptSourceAgreementAsrAdapterPresent")), transcript_source_agreement_path or "")
        add_check(checks, "transcript-source-agreement-asr-transcripts", int_value(transcript_source_agreement.get("asrTranscriptGeneratedCount")), int_value(manifest.get("audioTranscriptSourceAgreementAsrTranscriptGeneratedCount")), transcript_source_agreement_path or "")
        add_check(checks, "transcript-source-agreement-asr-comparison-present", bool_value(transcript_source_agreement.get("asrSourceMasterComparisonPresent")), bool_value(manifest.get("audioTranscriptSourceAgreementAsrSourceMasterComparisonPresent")), transcript_source_agreement_path or "")
        add_check(checks, "transcript-source-agreement-asr-comparison-hard-stops", int_value(transcript_source_agreement.get("asrSourceMasterComparisonHardStopCount")), int_value(manifest.get("audioTranscriptSourceAgreementAsrSourceMasterComparisonHardStopCount")), transcript_source_agreement_path or "")
        add_check(checks, "transcript-source-agreement-asr-comparison-review-risks", int_value(transcript_source_agreement.get("asrSourceMasterComparisonReviewRiskCount")), int_value(manifest.get("audioTranscriptSourceAgreementAsrSourceMasterComparisonReviewRiskCount")), transcript_source_agreement_path or "")
        add_check(checks, "transcript-source-agreement-hard-stops", int_value(transcript_source_agreement.get("hardStopCount")), int_value(manifest.get("audioTranscriptSourceAgreementHardStopCount")), transcript_source_agreement_path or "")
        add_check(checks, "transcript-source-agreement-review-risks", int_value(transcript_source_agreement.get("reviewRiskCount")), int_value(manifest.get("audioTranscriptSourceAgreementReviewRiskCount")), transcript_source_agreement_path or "")
        add_check(checks, "transcript-source-agreement-source-activity", bool_value(transcript_source_agreement.get("sourceActivityPresent")), bool_value(manifest.get("audioTranscriptSourceAgreementSourceActivityPresent")), transcript_source_agreement_path or "")
        add_check(checks, "transcript-source-agreement-speaker-activity", bool_value(transcript_source_agreement.get("speakerActivityBoardPresent")), bool_value(manifest.get("audioTranscriptSourceAgreementSpeakerActivityPresent")), transcript_source_agreement_path or "")
        add_check(checks, "transcript-source-agreement-source-balance", bool_value(transcript_source_agreement.get("sourceBalanceTriagePresent")), bool_value(manifest.get("audioTranscriptSourceAgreementSourceBalancePresent")), transcript_source_agreement_path or "")
        add_check(checks, "transcript-source-agreement-spine-sanity", bool_value(transcript_source_agreement.get("spineListenSanityPresent")), bool_value(manifest.get("audioTranscriptSourceAgreementSpineSanityPresent")), transcript_source_agreement_path or "")
        add_check(checks, "transcript-source-agreement-speaker-survival", bool_value(transcript_source_agreement.get("speakerSurvivalPassed")), bool_value(manifest.get("audioTranscriptSourceAgreementSpeakerSurvivalPassed")), transcript_source_agreement_path or "")
        add_check(checks, "transcript-source-agreement-speaker-focus-windows", int_value(transcript_source_agreement.get("speakerActivityFocusWindowCount")), int_value(manifest.get("audioTranscriptSourceAgreementSpeakerActivityFocusWindowCount")), transcript_source_agreement_path or "")
        add_check(checks, "transcript-source-agreement-source-balance-windows", int_value(transcript_source_agreement.get("sourceBalanceTriageWindowCount")), int_value(manifest.get("audioTranscriptSourceAgreementSourceBalanceTriageWindowCount")), transcript_source_agreement_path or "")
        add_check(checks, "transcript-source-agreement-listen-priority", int_value(transcript_source_agreement.get("listenPriorityQueueCount")), int_value(manifest.get("audioTranscriptSourceAgreementListenPriorityQueueCount")), transcript_source_agreement_path or "")
        add_check(checks, "transcript-source-agreement-human-listen-required", bool_value(transcript_source_agreement.get("humanListenStillRequired")), bool_value(manifest.get("audioTranscriptSourceAgreementHumanListenStillRequired")), transcript_source_agreement_path or "")
        add_false_safety_check(checks, "transcript-source-agreement-approval-state-changed", transcript_source_agreement, "approvalStateChanged", manifest, "audioTranscriptSourceAgreementApprovalStateChanged", transcript_source_agreement_path or "")
        add_false_safety_check(checks, "transcript-source-agreement-branch-state-changed", transcript_source_agreement, "branchStateChanged", manifest, "audioTranscriptSourceAgreementBranchStateChanged", transcript_source_agreement_path or "")
        add_false_safety_check(checks, "transcript-source-agreement-render-attempted", transcript_source_agreement, "renderAttempted", manifest, "audioTranscriptSourceAgreementRenderAttempted", transcript_source_agreement_path or "")
        add_false_safety_check(checks, "transcript-source-agreement-branch-render-attempted", transcript_source_agreement, "branchRenderAttempted", manifest, "audioTranscriptSourceAgreementBranchRenderAttempted", transcript_source_agreement_path or "")
        add_false_safety_check(checks, "transcript-source-agreement-upload-attempted", transcript_source_agreement, "uploadAttempted", manifest, "audioTranscriptSourceAgreementUploadAttempted", transcript_source_agreement_path or "")
        add_false_safety_check(checks, "transcript-source-agreement-publication-attempted", transcript_source_agreement, "publicationAttempted", manifest, "audioTranscriptSourceAgreementPublicationAttempted", transcript_source_agreement_path or "")
        add_false_safety_check(checks, "transcript-source-agreement-original-media-mutated", transcript_source_agreement, "originalMediaMutated", manifest, "audioTranscriptSourceAgreementOriginalMediaMutated", transcript_source_agreement_path or "")
    add_output_file_check(checks, outputs, "latestAudioPostListenOutcomeRouterMarkdown", "post-listen-outcome-router-markdown-present")
    add_output_file_check(checks, outputs, "latestAudioPostListenOutcomeRouterHtml", "post-listen-outcome-router-html-present")
    add_output_file_check(checks, outputs, "latestAudioPostListenOutcomeRouterStableHtml", "post-listen-outcome-router-stable-html-present")
    add_output_file_check(checks, outputs, "latestAudioPostListenOutcomeRouterOpenCommand", "post-listen-outcome-router-open-command-present")
    if post_listen_router:
        route = post_listen_router.get("route") if isinstance(post_listen_router.get("route"), dict) else {}
        add_check(checks, "post-listen-outcome-router-status", route.get("routeStatus"), manifest.get("audioPostListenOutcomeRouterLatestStatus"), post_listen_router_path or "")
        add_check(checks, "post-listen-outcome-router-approval-status", route.get("approvalStatus"), manifest.get("audioPostListenOutcomeRouterApprovalStatus"), post_listen_router_path or "")
        add_check(checks, "post-listen-outcome-router-package-ready", bool_value(route.get("packageReadyForHumanListen")), bool_value(manifest.get("audioPostListenOutcomeRouterPackageReadyForHumanListen")), post_listen_router_path or "")
        add_check(checks, "post-listen-outcome-router-branch-inheritance", bool_value(route.get("branchInheritanceReady")), bool_value(manifest.get("audioPostListenOutcomeRouterBranchInheritanceReady")), post_listen_router_path or "")
        add_check(checks, "post-listen-outcome-router-branch-render", bool_value(route.get("branchRenderReady")), bool_value(manifest.get("audioPostListenOutcomeRouterBranchRenderReady")), post_listen_router_path or "")
        add_check(checks, "post-listen-outcome-router-approval-preserved", True, bool_value(manifest.get("audioPostListenOutcomeRouterApprovalStatePreserved")), post_listen_router_path or "")
        add_check(checks, "post-listen-outcome-router-render-attempted", False, bool_value(manifest.get("audioPostListenOutcomeRouterRenderAttempted")), post_listen_router_path or "")
        add_check(checks, "post-listen-outcome-router-original-media-mutated", False, bool_value(manifest.get("audioPostListenOutcomeRouterOriginalMediaMutated")), post_listen_router_path or "")
        add_check(checks, "post-listen-outcome-router-branch-commands-exposed", bool_value(post_listen_router.get("realBranchRenderCommandsExposed")), bool_value(manifest.get("audioPostListenOutcomeRouterRealBranchRenderCommandsExposed")), post_listen_router_path or "")
        add_check(checks, "post-listen-outcome-router-html-registered", True, bool_value(manifest.get("audioPostListenOutcomeRouterHtmlPresent")), post_listen_router_path or "")
        add_check(checks, "post-listen-outcome-router-open-command-registered", True, bool_value(manifest.get("audioPostListenOutcomeRouterOpenCommandPresent")), post_listen_router_path or "")
    if post_listen_router_smoke:
        add_check(checks, "post-listen-outcome-router-smoke-passed", True, bool_value(post_listen_router_smoke.get("passed")), post_listen_router_smoke_path or "")
        add_check(checks, "post-listen-outcome-router-smoke-real-approval-preserved", True, bool_value(post_listen_router_smoke.get("realApprovalStatePreserved")), post_listen_router_smoke_path or "")
    post_listen_refresh, post_listen_refresh_path = load_output_report(outputs, "latestAudioPostListenRefresh")
    add_output_file_check(checks, outputs, "latestAudioPostListenRefreshMarkdown", "post-listen-refresh-markdown-present")
    add_output_file_check(checks, outputs, "latestAudioPostListenRefreshHtml", "post-listen-refresh-html-present")
    add_output_file_check(checks, outputs, "latestAudioPostListenRefreshStableHtml", "post-listen-refresh-stable-html-present")
    add_output_file_check(checks, outputs, "latestAudioPostListenRefreshOpenCommand", "post-listen-refresh-open-command-present")
    if post_listen_refresh:
        add_check(checks, "post-listen-refresh-status", post_listen_refresh.get("status"), manifest.get("audioPostListenRefreshLatestStatus"), post_listen_refresh_path or "")
        add_check(checks, "post-listen-refresh-approval-status", post_listen_refresh.get("approvalStatus"), manifest.get("audioPostListenRefreshApprovalStatus"), post_listen_refresh_path or "")
        add_check(checks, "post-listen-refresh-route-status", post_listen_refresh.get("routeStatus"), manifest.get("audioPostListenRefreshRouteStatus"), post_listen_refresh_path or "")
        add_check(checks, "post-listen-refresh-step-count", int_value(post_listen_refresh.get("stepCount")), int_value(manifest.get("audioPostListenRefreshStepCount")), post_listen_refresh_path or "")
        add_check(checks, "post-listen-refresh-step-failures", int_value(post_listen_refresh.get("stepFailureCount")), int_value(manifest.get("audioPostListenRefreshStepFailureCount")), post_listen_refresh_path or "")
        add_check(checks, "post-listen-refresh-hard-stops", int_value(post_listen_refresh.get("hardStopCount")), int_value(manifest.get("audioPostListenRefreshHardStopCount")), post_listen_refresh_path or "")
        add_check(checks, "post-listen-refresh-audio-truth", post_listen_refresh.get("branchRenderAudioTruth"), manifest.get("audioPostListenRefreshBranchRenderAudioTruth"), post_listen_refresh_path or "")
        add_check(checks, "post-listen-refresh-master-only-forbidden", bool_value(post_listen_refresh.get("masteredSpineOnlyEditingAllowed")), bool_value(manifest.get("audioPostListenRefreshMasteredSpineOnlyEditingAllowed")), post_listen_refresh_path or "")
        add_check(checks, "post-listen-refresh-branch-preflight-plan-status", post_listen_refresh.get("branchPreflightBranchAudioPlanStatus"), manifest.get("audioPostListenRefreshBranchPreflightBranchAudioPlanStatus"), post_listen_refresh_path or "")
        add_check(checks, "post-listen-refresh-branch-preflight-plan-stem-count", int_value(post_listen_refresh.get("branchPreflightBranchAudioPlanSelectedRefinedStemCount")), int_value(manifest.get("audioPostListenRefreshBranchPreflightBranchAudioPlanSelectedRefinedStemCount")), post_listen_refresh_path or "")
        add_check(checks, "post-listen-refresh-branch-preflight-plan-missing-roles", sorted(str(role) for role in (post_listen_refresh.get("branchPreflightBranchAudioPlanMissingRoleIds") or [])), sorted(str(role) for role in (manifest.get("audioPostListenRefreshBranchPreflightBranchAudioPlanMissingRoleIds") or [])), post_listen_refresh_path or "")
        add_check(checks, "post-listen-refresh-branch-preflight-plan-missing-paths", int_value(post_listen_refresh.get("branchPreflightBranchAudioPlanMissingStemPathCount")), int_value(manifest.get("audioPostListenRefreshBranchPreflightBranchAudioPlanMissingStemPathCount")), post_listen_refresh_path or "")
        add_check(checks, "post-listen-refresh-branch-preflight-will-use-refined-stems", bool_value(post_listen_refresh.get("branchPreflightSourceAwareBranchRenderWillUseRefinedStems")), bool_value(manifest.get("audioPostListenRefreshBranchPreflightSourceAwareBranchRenderWillUseRefinedStems")), post_listen_refresh_path or "")
        add_check(checks, "post-listen-refresh-branch-preflight-stem-paths-proved", bool_value(post_listen_refresh.get("branchPreflightSourceAwareBranchRenderStemPathsProved")), bool_value(manifest.get("audioPostListenRefreshBranchPreflightSourceAwareBranchRenderStemPathsProved")), post_listen_refresh_path or "")
        add_check(checks, "post-listen-refresh-branch-executor-plan-status", post_listen_refresh.get("branchExecutorBranchAudioPlanStatus"), manifest.get("audioPostListenRefreshBranchExecutorBranchAudioPlanStatus"), post_listen_refresh_path or "")
        add_check(checks, "post-listen-refresh-branch-executor-plan-stem-count", int_value(post_listen_refresh.get("branchExecutorBranchAudioPlanSelectedRefinedStemCount")), int_value(manifest.get("audioPostListenRefreshBranchExecutorBranchAudioPlanSelectedRefinedStemCount")), post_listen_refresh_path or "")
        add_check(checks, "post-listen-refresh-branch-executor-plan-missing-roles", sorted(str(role) for role in (post_listen_refresh.get("branchExecutorBranchAudioPlanMissingRoleIds") or [])), sorted(str(role) for role in (manifest.get("audioPostListenRefreshBranchExecutorBranchAudioPlanMissingRoleIds") or [])), post_listen_refresh_path or "")
        add_check(checks, "post-listen-refresh-branch-executor-plan-missing-paths", int_value(post_listen_refresh.get("branchExecutorBranchAudioPlanMissingStemPathCount")), int_value(manifest.get("audioPostListenRefreshBranchExecutorBranchAudioPlanMissingStemPathCount")), post_listen_refresh_path or "")
        add_check(checks, "post-listen-refresh-branch-executor-will-use-refined-stems", bool_value(post_listen_refresh.get("branchExecutorSourceAwareBranchRenderWillUseRefinedStems")), bool_value(manifest.get("audioPostListenRefreshBranchExecutorSourceAwareBranchRenderWillUseRefinedStems")), post_listen_refresh_path or "")
        add_check(checks, "post-listen-refresh-branch-executor-stem-paths-proved", bool_value(post_listen_refresh.get("branchExecutorSourceAwareBranchRenderStemPathsProved")), bool_value(manifest.get("audioPostListenRefreshBranchExecutorSourceAwareBranchRenderStemPathsProved")), post_listen_refresh_path or "")
        add_check(checks, "post-listen-refresh-requires-preflight-ready-plan", "ready-source-aware-refined-stem-plan", post_listen_refresh.get("branchPreflightBranchAudioPlanStatus"), post_listen_refresh_path or "")
        add_check(checks, "post-listen-refresh-requires-preflight-three-stems", True, int_value(post_listen_refresh.get("branchPreflightBranchAudioPlanSelectedRefinedStemCount")) >= 3, post_listen_refresh_path or "")
        add_check(checks, "post-listen-refresh-requires-preflight-no-missing-roles", [], sorted(str(role) for role in (post_listen_refresh.get("branchPreflightBranchAudioPlanMissingRoleIds") or [])), post_listen_refresh_path or "")
        add_check(checks, "post-listen-refresh-requires-preflight-no-missing-paths", 0, int_value(post_listen_refresh.get("branchPreflightBranchAudioPlanMissingStemPathCount")), post_listen_refresh_path or "")
        add_check(checks, "post-listen-refresh-requires-preflight-stem-path-proof", True, bool_value(post_listen_refresh.get("branchPreflightSourceAwareBranchRenderStemPathsProved")), post_listen_refresh_path or "")
        add_check(checks, "post-listen-refresh-requires-executor-ready-plan", "ready-source-aware-refined-stem-plan", post_listen_refresh.get("branchExecutorBranchAudioPlanStatus"), post_listen_refresh_path or "")
        add_check(checks, "post-listen-refresh-requires-executor-three-stems", True, int_value(post_listen_refresh.get("branchExecutorBranchAudioPlanSelectedRefinedStemCount")) >= 3, post_listen_refresh_path or "")
        add_check(checks, "post-listen-refresh-requires-executor-no-missing-roles", [], sorted(str(role) for role in (post_listen_refresh.get("branchExecutorBranchAudioPlanMissingRoleIds") or [])), post_listen_refresh_path or "")
        add_check(checks, "post-listen-refresh-requires-executor-no-missing-paths", 0, int_value(post_listen_refresh.get("branchExecutorBranchAudioPlanMissingStemPathCount")), post_listen_refresh_path or "")
        add_check(checks, "post-listen-refresh-requires-executor-refined-stems", True, bool_value(post_listen_refresh.get("branchExecutorSourceAwareBranchRenderWillUseRefinedStems")), post_listen_refresh_path or "")
        add_check(checks, "post-listen-refresh-requires-executor-stem-path-proof", True, bool_value(post_listen_refresh.get("branchExecutorSourceAwareBranchRenderStemPathsProved")), post_listen_refresh_path or "")
        add_check(checks, "post-listen-refresh-approval-state-changed", bool_value(post_listen_refresh.get("approvalStateChanged")), bool_value(manifest.get("audioPostListenRefreshApprovalStateChanged")), post_listen_refresh_path or "")
        add_check(checks, "post-listen-refresh-render-attempted", False, bool_value(manifest.get("audioPostListenRefreshRenderAttempted")), post_listen_refresh_path or "")
        add_check(checks, "post-listen-refresh-upload-attempted", False, bool_value(manifest.get("audioPostListenRefreshUploadAttempted")), post_listen_refresh_path or "")
        add_check(checks, "post-listen-refresh-publication-attempted", False, bool_value(manifest.get("audioPostListenRefreshPublicationAttempted")), post_listen_refresh_path or "")
        add_check(checks, "post-listen-refresh-original-media-mutated", False, bool_value(manifest.get("audioPostListenRefreshOriginalMediaMutated")), post_listen_refresh_path or "")
    if spine_quality_gate:
        add_check(checks, "audio-spine-quality-gate-status", spine_quality_gate.get("status"), manifest.get("audioSpineQualityGateLatestStatus"), spine_quality_gate_path or "")
        add_check(checks, "audio-spine-quality-gate-score", spine_quality_gate.get("score"), manifest.get("audioSpineQualityGateScore"), spine_quality_gate_path or "")
        add_check(checks, "audio-spine-quality-gate-dimensions", int_value(spine_quality_gate.get("dimensionCount")), int_value(manifest.get("audioSpineQualityGateDimensionCount")), spine_quality_gate_path or "")
        add_check(checks, "audio-spine-quality-gate-pass-count", int_value(spine_quality_gate.get("passCount")), int_value(manifest.get("audioSpineQualityGatePassCount")), spine_quality_gate_path or "")
        add_check(checks, "audio-spine-quality-gate-attention-count", int_value(spine_quality_gate.get("attentionCount")), int_value(manifest.get("audioSpineQualityGateAttentionCount")), spine_quality_gate_path or "")
        add_check(checks, "audio-spine-quality-gate-fail-count", int_value(spine_quality_gate.get("failCount")), int_value(manifest.get("audioSpineQualityGateFailCount")), spine_quality_gate_path or "")
        add_check(checks, "audio-spine-quality-gate-review-risks", int_value(spine_quality_gate.get("reviewRiskCount")), int_value(manifest.get("audioSpineQualityGateReviewRiskCount")), spine_quality_gate_path or "")
        add_check(checks, "audio-spine-quality-gate-machine-ready", bool_value(spine_quality_gate.get("machineReadyForHumanListen")), bool_value(manifest.get("audioSpineQualityGateMachineReadyForHumanListen")), spine_quality_gate_path or "")
        add_check(checks, "audio-spine-quality-gate-human-listen-required", bool_value(spine_quality_gate.get("humanListenRequired")), bool_value(manifest.get("audioSpineQualityGateHumanListenRequired")), spine_quality_gate_path or "")
        add_check(checks, "audio-spine-quality-gate-publication-ready", bool_value(spine_quality_gate.get("publicationReady")), bool_value(manifest.get("audioSpineQualityGatePublicationReady")), spine_quality_gate_path or "")
        safety = spine_quality_gate.get("safety") if isinstance(spine_quality_gate.get("safety"), dict) else {}
        add_false_safety_check(checks, "audio-spine-quality-gate-approval-state-changed", safety, "approvalStateChanged", manifest, "audioSpineQualityGateApprovalStateChanged", spine_quality_gate_path or "")
        add_false_safety_check(checks, "audio-spine-quality-gate-branch-state-changed", safety, "branchStateChanged", manifest, "audioSpineQualityGateBranchStateChanged", spine_quality_gate_path or "")
        add_false_safety_check(checks, "audio-spine-quality-gate-render-attempted", safety, "renderAttempted", manifest, "audioSpineQualityGateRenderAttempted", spine_quality_gate_path or "")
        add_false_safety_check(checks, "audio-spine-quality-gate-upload-attempted", safety, "uploadAttempted", manifest, "audioSpineQualityGateUploadAttempted", spine_quality_gate_path or "")
        add_false_safety_check(checks, "audio-spine-quality-gate-publication-attempted", safety, "publicationAttempted", manifest, "audioSpineQualityGatePublicationAttempted", spine_quality_gate_path or "")
        add_false_safety_check(checks, "audio-spine-quality-gate-original-media-mutated", safety, "originalMediaMutated", manifest, "audioSpineQualityGateOriginalMediaMutated", spine_quality_gate_path or "")
    if machine_listen_sentinel:
        add_check(checks, "machine-listen-sentinel-status", machine_listen_sentinel.get("status"), manifest.get("audioMachineListenSentinelLatestStatus"), machine_listen_sentinel_path or "")
        add_check(checks, "machine-listen-sentinel-score", machine_listen_sentinel.get("score"), manifest.get("audioMachineListenSentinelScore"), machine_listen_sentinel_path or "")
        add_check(checks, "machine-listen-sentinel-metrics", int_value(machine_listen_sentinel.get("metricCount")), int_value(manifest.get("audioMachineListenSentinelMetricCount")), machine_listen_sentinel_path or "")
        add_check(checks, "machine-listen-sentinel-hard-stops", int_value(machine_listen_sentinel.get("hardStopCount")), int_value(manifest.get("audioMachineListenSentinelHardStopCount")), machine_listen_sentinel_path or "")
        add_check(checks, "machine-listen-sentinel-review-risks", int_value(machine_listen_sentinel.get("reviewRiskCount")), int_value(manifest.get("audioMachineListenSentinelReviewRiskCount")), machine_listen_sentinel_path or "")
        add_check(checks, "machine-listen-sentinel-machine-ready", bool_value(machine_listen_sentinel.get("machineReadyForHumanListen")), bool_value(manifest.get("audioMachineListenSentinelMachineReadyForHumanListen")), machine_listen_sentinel_path or "")
        add_check(checks, "machine-listen-sentinel-human-listen-required", bool_value(machine_listen_sentinel.get("humanListenRequired")), bool_value(manifest.get("audioMachineListenSentinelHumanListenRequired")), machine_listen_sentinel_path or "")
        add_check(checks, "machine-listen-sentinel-publication-ready", bool_value(machine_listen_sentinel.get("publicationReady")), bool_value(manifest.get("audioMachineListenSentinelPublicationReady")), machine_listen_sentinel_path or "")
        safety = machine_listen_sentinel.get("safety") if isinstance(machine_listen_sentinel.get("safety"), dict) else {}
        add_false_safety_check(checks, "machine-listen-sentinel-approval-state-changed", safety, "approvalStateChanged", manifest, "audioMachineListenSentinelApprovalStateChanged", machine_listen_sentinel_path or "")
        add_false_safety_check(checks, "machine-listen-sentinel-branch-state-changed", safety, "branchStateChanged", manifest, "audioMachineListenSentinelBranchStateChanged", machine_listen_sentinel_path or "")
        add_false_safety_check(checks, "machine-listen-sentinel-render-attempted", safety, "renderAttempted", manifest, "audioMachineListenSentinelRenderAttempted", machine_listen_sentinel_path or "")
        add_false_safety_check(checks, "machine-listen-sentinel-upload-attempted", safety, "uploadAttempted", manifest, "audioMachineListenSentinelUploadAttempted", machine_listen_sentinel_path or "")
        add_false_safety_check(checks, "machine-listen-sentinel-publication-attempted", safety, "publicationAttempted", manifest, "audioMachineListenSentinelPublicationAttempted", machine_listen_sentinel_path or "")
        add_false_safety_check(checks, "machine-listen-sentinel-original-media-mutated", safety, "originalMediaMutated", manifest, "audioMachineListenSentinelOriginalMediaMutated", machine_listen_sentinel_path or "")
    if master_smoothness:
        add_check(checks, "master-smoothness-audit-status", master_smoothness.get("status"), manifest.get("audioMasterSmoothnessAuditLatestStatus"), master_smoothness_path or "")
        add_check(checks, "master-smoothness-audit-passed", bool_value(master_smoothness.get("passed")), bool_value(manifest.get("audioMasterSmoothnessAuditPassed")), master_smoothness_path or "")
        add_check(checks, "master-smoothness-audit-hard-stops", int_value(master_smoothness.get("hardStopCount")), int_value(manifest.get("audioMasterSmoothnessAuditHardStopCount")), master_smoothness_path or "")
        add_check(checks, "master-smoothness-audit-review-risks", int_value(master_smoothness.get("reviewRiskCount")), int_value(manifest.get("audioMasterSmoothnessAuditReviewRiskCount")), master_smoothness_path or "")
        add_check(checks, "master-smoothness-audit-listen-checks", int_value(master_smoothness.get("listenCheckCount")), int_value(manifest.get("audioMasterSmoothnessAuditListenCheckCount")), master_smoothness_path or "")
        audio = master_smoothness.get("audio") if isinstance(master_smoothness.get("audio"), dict) else {}
        add_check(checks, "master-smoothness-audit-window-count", int_value(audio.get("windowCount")), int_value(manifest.get("audioMasterSmoothnessAuditWindowCount")), master_smoothness_path or "")
        add_check(checks, "master-smoothness-audit-transition-count", int_value(master_smoothness.get("transitionCount")), int_value(manifest.get("audioMasterSmoothnessAuditTransitionCount")), master_smoothness_path or "")
        add_check(checks, "master-smoothness-audit-long-silence-spans", int_value(master_smoothness.get("longSilenceSpanCount")), int_value(manifest.get("audioMasterSmoothnessAuditLongSilenceSpanCount")), master_smoothness_path or "")
        counts = master_smoothness.get("classificationCounts") if isinstance(master_smoothness.get("classificationCounts"), dict) else {}
        add_check(checks, "master-smoothness-audit-hard-silence-edge-checks", int_value(counts.get("hard-silence-edge-listen-check")), int_value(manifest.get("audioMasterSmoothnessAuditHardSilenceEdgeListenCheckCount")), master_smoothness_path or "")
        add_check(checks, "master-smoothness-audit-large-level-jump-checks", int_value(counts.get("large-level-jump-listen-check")), int_value(manifest.get("audioMasterSmoothnessAuditLargeLevelJumpListenCheckCount")), master_smoothness_path or "")
        add_check(checks, "master-smoothness-audit-moderate-level-jumps", int_value(counts.get("moderate-level-jump")), int_value(manifest.get("audioMasterSmoothnessAuditModerateLevelJumpCount")), master_smoothness_path or "")
        add_check(checks, "master-smoothness-audit-machine-ready", bool_value(master_smoothness.get("machineReadyForHumanListen")), bool_value(manifest.get("audioMasterSmoothnessAuditMachineReadyForHumanListen")), master_smoothness_path or "")
        add_check(checks, "master-smoothness-audit-human-listen-required", bool_value(master_smoothness.get("humanListenRequired")), bool_value(manifest.get("audioMasterSmoothnessAuditHumanListenRequired")), master_smoothness_path or "")
        add_check(checks, "master-smoothness-audit-publication-ready", bool_value(master_smoothness.get("publicationReady")), bool_value(manifest.get("audioMasterSmoothnessAuditPublicationReady")), master_smoothness_path or "")
        add_false_safety_check(checks, "master-smoothness-audit-approval-state-changed", master_smoothness, "approvalStateChanged", manifest, "audioMasterSmoothnessAuditApprovalStateChanged", master_smoothness_path or "")
        add_false_safety_check(checks, "master-smoothness-audit-branch-state-changed", master_smoothness, "branchStateChanged", manifest, "audioMasterSmoothnessAuditBranchStateChanged", master_smoothness_path or "")
        add_false_safety_check(checks, "master-smoothness-audit-render-attempted", master_smoothness, "renderAttempted", manifest, "audioMasterSmoothnessAuditRenderAttempted", master_smoothness_path or "")
        add_false_safety_check(checks, "master-smoothness-audit-original-media-mutated", master_smoothness, "originalMediaMutated", manifest, "audioMasterSmoothnessAuditOriginalMediaMutated", master_smoothness_path or "")
    if spectral_fatigue:
        add_check(checks, "spectral-fatigue-audit-status", spectral_fatigue.get("status"), manifest.get("audioSpectralFatigueAuditLatestStatus"), spectral_fatigue_path or "")
        add_check(checks, "spectral-fatigue-audit-window-count", int_value(spectral_fatigue.get("windowCount")), int_value(manifest.get("audioSpectralFatigueAuditWindowCount")), spectral_fatigue_path or "")
        add_check(checks, "spectral-fatigue-audit-band-count", int_value(spectral_fatigue.get("bandCount")), int_value(manifest.get("audioSpectralFatigueAuditBandCount")), spectral_fatigue_path or "")
        add_check(checks, "spectral-fatigue-audit-measurement-count", int_value(spectral_fatigue.get("measurementCount")), int_value(manifest.get("audioSpectralFatigueAuditMeasurementCount")), spectral_fatigue_path or "")
        add_check(checks, "spectral-fatigue-audit-failed-measurements", int_value(spectral_fatigue.get("failedMeasurementCount")), int_value(manifest.get("audioSpectralFatigueAuditFailedMeasurementCount")), spectral_fatigue_path or "")
        add_check(checks, "spectral-fatigue-audit-hard-stops", int_value(spectral_fatigue.get("hardStopCount")), int_value(manifest.get("audioSpectralFatigueAuditHardStopCount")), spectral_fatigue_path or "")
        add_check(checks, "spectral-fatigue-audit-risks", int_value(spectral_fatigue.get("reviewRiskCount")), int_value(manifest.get("audioSpectralFatigueAuditReviewRiskCount")), spectral_fatigue_path or "")
        add_check(checks, "spectral-fatigue-audit-machine-ready", bool_value(spectral_fatigue.get("machineReadyForHumanListen")), bool_value(manifest.get("audioSpectralFatigueAuditMachineReadyForHumanListen")), spectral_fatigue_path or "")
        add_check(checks, "spectral-fatigue-audit-human-listen-required", bool_value(spectral_fatigue.get("humanListenRequired")), bool_value(manifest.get("audioSpectralFatigueAuditHumanListenRequired")), spectral_fatigue_path or "")
        add_check(checks, "spectral-fatigue-audit-publication-ready", bool_value(spectral_fatigue.get("publicationReady")), bool_value(manifest.get("audioSpectralFatigueAuditPublicationReady")), spectral_fatigue_path or "")
        add_false_safety_check(checks, "spectral-fatigue-audit-approval-state-changed", spectral_fatigue, "approvalStateChanged", manifest, "audioSpectralFatigueAuditApprovalStateChanged", spectral_fatigue_path or "")
        add_false_safety_check(checks, "spectral-fatigue-audit-branch-state-changed", spectral_fatigue, "branchStateChanged", manifest, "audioSpectralFatigueAuditBranchStateChanged", spectral_fatigue_path or "")
        add_false_safety_check(checks, "spectral-fatigue-audit-render-attempted", spectral_fatigue, "renderAttempted", manifest, "audioSpectralFatigueAuditRenderAttempted", spectral_fatigue_path or "")
        add_false_safety_check(checks, "spectral-fatigue-audit-branch-render-attempted", spectral_fatigue, "branchRenderAttempted", manifest, "audioSpectralFatigueAuditBranchRenderAttempted", spectral_fatigue_path or "")
        add_false_safety_check(checks, "spectral-fatigue-audit-upload-attempted", spectral_fatigue, "uploadAttempted", manifest, "audioSpectralFatigueAuditUploadAttempted", spectral_fatigue_path or "")
        add_false_safety_check(checks, "spectral-fatigue-audit-publication-attempted", spectral_fatigue, "publicationAttempted", manifest, "audioSpectralFatigueAuditPublicationAttempted", spectral_fatigue_path or "")
        add_false_safety_check(checks, "spectral-fatigue-audit-original-media-mutated", spectral_fatigue, "originalMediaMutated", manifest, "audioSpectralFatigueAuditOriginalMediaMutated", spectral_fatigue_path or "")
    if translation_survival:
        add_check(checks, "translation-survival-audit-status", translation_survival.get("status"), manifest.get("audioTranslationSurvivalAuditLatestStatus"), translation_survival_path or "")
        add_check(checks, "translation-survival-audit-window-count", int_value(translation_survival.get("windowCount")), int_value(manifest.get("audioTranslationSurvivalAuditWindowCount")), translation_survival_path or "")
        add_check(checks, "translation-survival-audit-profile-count", int_value(translation_survival.get("profileCount")), int_value(manifest.get("audioTranslationSurvivalAuditProfileCount")), translation_survival_path or "")
        add_check(checks, "translation-survival-audit-render-count", int_value(translation_survival.get("translationRenderCount")), int_value(manifest.get("audioTranslationSurvivalAuditTranslationRenderCount")), translation_survival_path or "")
        add_check(checks, "translation-survival-audit-hard-stops", int_value(translation_survival.get("hardStopCount")), int_value(manifest.get("audioTranslationSurvivalAuditHardStopCount")), translation_survival_path or "")
        add_check(checks, "translation-survival-audit-risks", int_value(translation_survival.get("reviewRiskCount")), int_value(manifest.get("audioTranslationSurvivalAuditReviewRiskCount")), translation_survival_path or "")
        add_check(checks, "translation-survival-audit-derived-review-rendered", bool_value(translation_survival.get("derivedReviewMediaRendered")), bool_value(manifest.get("audioTranslationSurvivalAuditDerivedReviewMediaRendered")), translation_survival_path or "")
        add_false_safety_check(checks, "translation-survival-audit-approval-state-changed", translation_survival, "approvalStateChanged", manifest, "audioTranslationSurvivalAuditApprovalStateChanged", translation_survival_path or "")
        add_false_safety_check(checks, "translation-survival-audit-branch-state-changed", translation_survival, "branchStateChanged", manifest, "audioTranslationSurvivalAuditBranchStateChanged", translation_survival_path or "")
        add_false_safety_check(checks, "translation-survival-audit-render-attempted", translation_survival, "renderAttempted", manifest, "audioTranslationSurvivalAuditRenderAttempted", translation_survival_path or "")
        add_false_safety_check(checks, "translation-survival-audit-branch-render-attempted", translation_survival, "branchRenderAttempted", manifest, "audioTranslationSurvivalAuditBranchRenderAttempted", translation_survival_path or "")
        add_false_safety_check(checks, "translation-survival-audit-upload-attempted", translation_survival, "uploadAttempted", manifest, "audioTranslationSurvivalAuditUploadAttempted", translation_survival_path or "")
        add_false_safety_check(checks, "translation-survival-audit-publication-attempted", translation_survival, "publicationAttempted", manifest, "audioTranslationSurvivalAuditPublicationAttempted", translation_survival_path or "")
        add_false_safety_check(checks, "translation-survival-audit-original-media-mutated", translation_survival, "originalMediaMutated", manifest, "audioTranslationSurvivalAuditOriginalMediaMutated", translation_survival_path or "")

    if morning_launcher:
        add_check(checks, "morning-audio-review-launcher-status", morning_launcher.get("status"), manifest.get("audioMorningAudioReviewLauncherLatestStatus"), morning_launcher_path or "")
        add_check(checks, "morning-audio-review-launcher-review-target", morning_launcher.get("reviewTarget"), manifest.get("audioMorningAudioReviewLauncherReviewTarget"), morning_launcher_path or "")
        add_check(checks, "morning-audio-review-launcher-current-gate", morning_launcher.get("currentGate"), manifest.get("audioMorningAudioReviewLauncherCurrentGate"), morning_launcher_path or "")
        add_check(checks, "morning-audio-review-launcher-blocking-condition", morning_launcher.get("blockingCondition"), manifest.get("audioMorningAudioReviewLauncherBlockingCondition"), morning_launcher_path or "")
        add_check(checks, "morning-audio-review-launcher-being-judged-now", morning_launcher.get("beingJudgedNow"), manifest.get("audioMorningAudioReviewLauncherBeingJudgedNow"), morning_launcher_path or "")
        add_check(checks, "morning-audio-review-launcher-render-runway-status", morning_launcher.get("renderRunwayStatus"), manifest.get("audioMorningAudioReviewLauncherRenderRunwayStatus"), morning_launcher_path or "")
        add_check(checks, "morning-audio-review-launcher-render-runway-branches", int_value(morning_launcher.get("renderRunwayBranchCount")), int_value(manifest.get("audioMorningAudioReviewLauncherRenderRunwayBranchCount")), morning_launcher_path or "")
        add_check(checks, "morning-audio-review-launcher-render-runway-missing-inputs", int_value(morning_launcher.get("renderRunwayMissingInputCount")), int_value(manifest.get("audioMorningAudioReviewLauncherRenderRunwayMissingInputCount")), morning_launcher_path or "")
        add_check(checks, "morning-audio-review-launcher-render-runway-executor-status", morning_launcher.get("renderRunwayExecutorStatus"), manifest.get("audioMorningAudioReviewLauncherRenderRunwayExecutorStatus"), morning_launcher_path or "")
        add_check(checks, "morning-audio-review-launcher-render-runway-executor-can-execute", bool_value(morning_launcher.get("renderRunwayExecutorCanExecute")), bool_value(manifest.get("audioMorningAudioReviewLauncherRenderRunwayExecutorCanExecute")), morning_launcher_path or "")
        add_check(checks, "morning-audio-review-launcher-render-runway-commands-exposed", bool_value(morning_launcher.get("renderRunwayCommandsExposed")), bool_value(manifest.get("audioMorningAudioReviewLauncherRenderRunwayCommandsExposed")), morning_launcher_path or "")
        add_check(checks, "morning-audio-review-launcher-decision-rules", int_value(morning_launcher.get("decisionRuleCount")), int_value(manifest.get("audioMorningAudioReviewLauncherDecisionRuleCount")), morning_launcher_path or "")
        add_check(checks, "morning-audio-review-launcher-fast-readback-status", morning_launcher.get("fastReadbackStatus") or "", manifest.get("audioMorningAudioReviewLauncherFastReadbackStatus") or "", morning_launcher_path or "")
        add_check(checks, "morning-audio-review-launcher-fast-readback-passed", bool_value(morning_launcher.get("fastReadbackPassed")), bool_value(manifest.get("audioMorningAudioReviewLauncherFastReadbackPassed")), morning_launcher_path or "")
        add_check(checks, "morning-audio-review-launcher-fast-readback-hard-stops", int_value(morning_launcher.get("fastReadbackHardStopCount")), int_value(manifest.get("audioMorningAudioReviewLauncherFastReadbackHardStopCount")), morning_launcher_path or "")
        add_check(checks, "morning-audio-review-launcher-fast-readback-warnings", int_value(morning_launcher.get("fastReadbackWarningCount")), int_value(manifest.get("audioMorningAudioReviewLauncherFastReadbackWarningCount")), morning_launcher_path or "")
        add_check(checks, "morning-audio-review-launcher-fast-readback-checks", int_value(morning_launcher.get("fastReadbackCheckCount")), int_value(manifest.get("audioMorningAudioReviewLauncherFastReadbackCheckCount")), morning_launcher_path or "")
        add_check(checks, "morning-audio-review-launcher-source-aware-timing-status", morning_launcher.get("sourceAwareTimingContractStatus") or "", manifest.get("audioMorningAudioReviewLauncherSourceAwareTimingContractStatus") or "", morning_launcher_path or "")
        add_check(checks, "morning-audio-review-launcher-source-aware-timing-ready", bool_value(morning_launcher.get("sourceAwareTimingContractReady")), bool_value(manifest.get("audioMorningAudioReviewLauncherSourceAwareTimingContractReady")), morning_launcher_path or "")
        add_check(checks, "morning-audio-review-launcher-source-aware-timing-roles", int_value(morning_launcher.get("sourceAwareTimingContractReadyRoleCount")), int_value(manifest.get("audioMorningAudioReviewLauncherSourceAwareTimingContractReadyRoleCount")), morning_launcher_path or "")
        add_check(checks, "morning-audio-review-launcher-source-aware-timing-hard-stops", int_value(morning_launcher.get("sourceAwareTimingContractHardStopCount")), int_value(manifest.get("audioMorningAudioReviewLauncherSourceAwareTimingContractHardStopCount")), morning_launcher_path or "")
        add_check(checks, "morning-audio-review-launcher-source-aware-timing-max-delta", morning_launcher.get("sourceAwareTimingContractMaxDurationDeltaToMasterSeconds"), manifest.get("audioMorningAudioReviewLauncherSourceAwareTimingContractMaxDurationDeltaToMasterSeconds"), morning_launcher_path or "")
        add_check(checks, "morning-audio-review-launcher-post-approval-status", morning_launcher.get("postApprovalRenderRehearsalStatus") or "", manifest.get("audioMorningAudioReviewLauncherPostApprovalRenderRehearsalStatus") or "", morning_launcher_path or "")
        add_check(checks, "morning-audio-review-launcher-post-approval-branches", int_value(morning_launcher.get("postApprovalRenderRehearsalBranchCount")), int_value(manifest.get("audioMorningAudioReviewLauncherPostApprovalRenderRehearsalBranchCount")), morning_launcher_path or "")
        add_check(checks, "morning-audio-review-launcher-post-approval-missing-inputs", int_value(morning_launcher.get("postApprovalRenderRehearsalMissingInputCount")), int_value(manifest.get("audioMorningAudioReviewLauncherPostApprovalRenderRehearsalMissingInputCount")), morning_launcher_path or "")
        add_check(checks, "morning-audio-review-launcher-post-approval-hard-stops", int_value(morning_launcher.get("postApprovalRenderRehearsalHardStopCount")), int_value(manifest.get("audioMorningAudioReviewLauncherPostApprovalRenderRehearsalHardStopCount")), morning_launcher_path or "")
        add_check(checks, "morning-audio-review-launcher-post-approval-sandbox-passed", bool_value(morning_launcher.get("postApprovalApprovedSandboxPassed")), bool_value(manifest.get("audioMorningAudioReviewLauncherPostApprovalApprovedSandboxPassed")), morning_launcher_path or "")
        add_check(checks, "morning-audio-review-launcher-technical-audition-ready", bool_value(morning_launcher.get("technicalAuditionSnippetPackHtml")), bool_value(manifest.get("audioMorningAudioReviewLauncherTechnicalAuditionReady")), morning_launcher_path or "")
        add_check(checks, "morning-audio-review-launcher-hard-stops", int_value(morning_launcher.get("hardStopCount")), int_value(manifest.get("audioMorningAudioReviewLauncherHardStopCount")), morning_launcher_path or "")
        add_check(checks, "morning-audio-review-launcher-critical-fast-checks", int_value(morning_launcher.get("criticalFastCheckCount")), int_value(manifest.get("audioMorningAudioReviewLauncherCriticalFastCheckCount")), morning_launcher_path or "")
        add_check(checks, "morning-audio-review-launcher-spectral-fatigue-ready", bool_value(morning_launcher.get("spectralFatigueAuditReady")), bool_value(manifest.get("audioMorningAudioReviewLauncherSpectralFatigueReady")), morning_launcher_path or "")
        add_check(checks, "morning-audio-review-launcher-spectral-fatigue-status", morning_launcher.get("spectralFatigueAuditStatus") or "", manifest.get("audioMorningAudioReviewLauncherSpectralFatigueStatus") or "", morning_launcher_path or "")
        add_check(checks, "morning-audio-review-launcher-spectral-fatigue-hard-stops", int_value(morning_launcher.get("spectralFatigueAuditHardStopCount")), int_value(manifest.get("audioMorningAudioReviewLauncherSpectralFatigueHardStopCount")), morning_launcher_path or "")
        add_check(checks, "morning-audio-review-launcher-spectral-fatigue-risks", int_value(morning_launcher.get("spectralFatigueAuditReviewRiskCount")), int_value(manifest.get("audioMorningAudioReviewLauncherSpectralFatigueReviewRiskCount")), morning_launcher_path or "")
        add_check(checks, "morning-audio-review-launcher-translation-survival-ready", bool_value(morning_launcher.get("translationSurvivalAuditReady")), bool_value(manifest.get("audioMorningAudioReviewLauncherTranslationSurvivalReady")), morning_launcher_path or "")
        add_check(checks, "morning-audio-review-launcher-translation-survival-status", morning_launcher.get("translationSurvivalAuditStatus") or "", manifest.get("audioMorningAudioReviewLauncherTranslationSurvivalStatus") or "", morning_launcher_path or "")
        add_check(checks, "morning-audio-review-launcher-translation-survival-hard-stops", int_value(morning_launcher.get("translationSurvivalAuditHardStopCount")), int_value(manifest.get("audioMorningAudioReviewLauncherTranslationSurvivalHardStopCount")), morning_launcher_path or "")
        add_check(checks, "morning-audio-review-launcher-translation-survival-risks", int_value(morning_launcher.get("translationSurvivalAuditReviewRiskCount")), int_value(manifest.get("audioMorningAudioReviewLauncherTranslationSurvivalReviewRiskCount")), morning_launcher_path or "")
        add_false_safety_check(checks, "morning-audio-review-launcher-approval-state-changed", morning_launcher, "approvalStateChanged", manifest, "audioMorningAudioReviewLauncherApprovalStateChanged", morning_launcher_path or "")
    if post_listen_runway:
        add_check(checks, "post-listen-episode-runway-status", post_listen_runway.get("status"), manifest.get("audioPostListenEpisodeRunwayLatestStatus"), post_listen_runway_path or "")
        add_check(checks, "post-listen-episode-runway-hard-stops", int_value(post_listen_runway.get("hardStopCount")), int_value(manifest.get("audioPostListenEpisodeRunwayHardStopCount")), post_listen_runway_path or "")
        add_check(checks, "post-listen-episode-runway-risks", int_value(post_listen_runway.get("reviewRiskCount")), int_value(manifest.get("audioPostListenEpisodeRunwayReviewRiskCount")), post_listen_runway_path or "")
        add_check(checks, "post-listen-episode-runway-routes", int_value(post_listen_runway.get("routeCount")), int_value(manifest.get("audioPostListenEpisodeRunwayRouteCount")), post_listen_runway_path or "")
        gates = post_listen_runway.get("qualityGates") if isinstance(post_listen_runway.get("qualityGates"), dict) else {}
        audio_gate = gates.get("audioSpine") if isinstance(gates.get("audioSpine"), dict) else {}
        episode_gate = gates.get("finalEpisode") if isinstance(gates.get("finalEpisode"), dict) else {}
        shorts_gate = gates.get("shorts") if isinstance(gates.get("shorts"), dict) else {}
        add_check(checks, "post-listen-episode-runway-audio-gate", audio_gate.get("status"), manifest.get("audioPostListenEpisodeRunwayAudioSpineGateStatus"), post_listen_runway_path or "")
        add_check(checks, "post-listen-episode-runway-spectral-fatigue-status", audio_gate.get("spectralFatigueStatus") or "", manifest.get("audioPostListenEpisodeRunwaySpectralFatigueStatus") or "", post_listen_runway_path or "")
        add_check(checks, "post-listen-episode-runway-spectral-fatigue-hard-stops", int_value(audio_gate.get("spectralFatigueHardStopCount")), int_value(manifest.get("audioPostListenEpisodeRunwaySpectralFatigueHardStopCount")), post_listen_runway_path or "")
        add_check(checks, "post-listen-episode-runway-spectral-fatigue-risks", int_value(audio_gate.get("spectralFatigueReviewRiskCount")), int_value(manifest.get("audioPostListenEpisodeRunwaySpectralFatigueReviewRiskCount")), post_listen_runway_path or "")
        add_check(checks, "post-listen-episode-runway-final-episode-gate", episode_gate.get("status"), manifest.get("audioPostListenEpisodeRunwayFinalEpisodeGateStatus"), post_listen_runway_path or "")
        add_check(checks, "post-listen-episode-runway-shorts-gate", shorts_gate.get("status"), manifest.get("audioPostListenEpisodeRunwayShortsGateStatus"), post_listen_runway_path or "")
        add_false_safety_check(checks, "post-listen-episode-runway-approval-state-changed", post_listen_runway, "approvalStateChanged", manifest, "audioPostListenEpisodeRunwayApprovalStateChanged", post_listen_runway_path or "")
        add_false_safety_check(checks, "post-listen-episode-runway-branch-state-changed", post_listen_runway, "branchStateChanged", manifest, "audioPostListenEpisodeRunwayBranchStateChanged", post_listen_runway_path or "")
        add_false_safety_check(checks, "post-listen-episode-runway-render-attempted", post_listen_runway, "renderAttempted", manifest, "audioPostListenEpisodeRunwayRenderAttempted", post_listen_runway_path or "")
        add_false_safety_check(checks, "post-listen-episode-runway-upload-attempted", post_listen_runway, "uploadAttempted", manifest, "audioPostListenEpisodeRunwayUploadAttempted", post_listen_runway_path or "")
        add_false_safety_check(checks, "post-listen-episode-runway-publication-attempted", post_listen_runway, "publicationAttempted", manifest, "audioPostListenEpisodeRunwayPublicationAttempted", post_listen_runway_path or "")
        add_false_safety_check(checks, "post-listen-episode-runway-original-media-mutated", post_listen_runway, "originalMediaMutated", manifest, "audioPostListenEpisodeRunwayOriginalMediaMutated", post_listen_runway_path or "")
    if approved_branch_executor:
        add_check(checks, "approved-branch-render-executor-status", approved_branch_executor.get("status"), manifest.get("approvedBranchRenderExecutorStatus"), approved_branch_executor_path or "")
        add_check(checks, "approved-branch-render-executor-can-execute", bool_value(approved_branch_executor.get("canExecuteRealRenders")), bool_value(manifest.get("approvedBranchRenderExecutorCanExecuteRealRenders")), approved_branch_executor_path or "")
        add_check(checks, "approved-branch-render-executor-commands-exposed", bool_value(approved_branch_executor.get("commandsExposed")), bool_value(manifest.get("approvedBranchRenderCommandsExposed")), approved_branch_executor_path or "")
        add_check(checks, "approved-branch-render-executor-blockers", int_value(approved_branch_executor.get("blockerCount")), int_value(manifest.get("approvedBranchRenderExecutorBlockerCount")), approved_branch_executor_path or "")
        add_check(checks, "approved-branch-render-executor-results", int_value(approved_branch_executor.get("resultCount")), int_value(manifest.get("approvedBranchRenderExecutorResultCount")), approved_branch_executor_path or "")
        add_check(checks, "approved-branch-render-command-path", approved_branch_executor.get("renderCommand"), manifest.get("approvedBranchRenderCommandPath"), approved_branch_executor_path or "")
        add_check(checks, "approved-branch-render-command-present", bool_value(manifest.get("approvedBranchRenderCommandPresent")), True, approved_branch_executor_path or "")
        add_check(checks, "approved-branch-render-executor-audio-truth", approved_branch_executor.get("branchRenderAudioTruth"), manifest.get("approvedBranchRenderExecutorBranchRenderAudioTruth"), approved_branch_executor_path or "")
        add_check(checks, "approved-branch-render-executor-will-use-refined-stems", bool_value(approved_branch_executor.get("sourceAwareBranchRenderWillUseRefinedStems")), bool_value(manifest.get("approvedBranchRenderExecutorSourceAwareBranchRenderWillUseRefinedStems")), approved_branch_executor_path or "")
        add_check(checks, "approved-branch-render-executor-branch-audio-plan-status", approved_branch_executor.get("branchAudioPlanStatus"), manifest.get("approvedBranchRenderExecutorBranchAudioPlanStatus"), approved_branch_executor_path or "")
        add_check(checks, "approved-branch-render-executor-branch-audio-plan-stem-count", int_value(approved_branch_executor.get("branchAudioPlanSelectedRefinedStemCount")), int_value(manifest.get("approvedBranchRenderExecutorBranchAudioPlanSelectedRefinedStemCount")), approved_branch_executor_path or "")
        add_check(checks, "approved-branch-render-executor-branch-audio-plan-missing-roles", sorted(str(role) for role in (approved_branch_executor.get("branchAudioPlanMissingRoleIds") or [])), sorted(str(role) for role in (manifest.get("approvedBranchRenderExecutorBranchAudioPlanMissingRoleIds") or [])), approved_branch_executor_path or "")
        add_check(checks, "approved-branch-render-executor-branch-audio-plan-missing-paths", int_value(approved_branch_executor.get("branchAudioPlanMissingStemPathCount")), int_value(manifest.get("approvedBranchRenderExecutorBranchAudioPlanMissingStemPathCount")), approved_branch_executor_path or "")
        add_check(checks, "approved-branch-render-executor-stem-paths-proved", bool_value(approved_branch_executor.get("sourceAwareBranchRenderStemPathsProved")), bool_value(manifest.get("approvedBranchRenderExecutorSourceAwareBranchRenderStemPathsProved")), approved_branch_executor_path or "")
        add_check(checks, "approved-branch-render-executor-mix-output-name", approved_branch_executor.get("sourceAwareBranchRenderExpectedMixOutputName"), manifest.get("approvedBranchRenderExecutorSourceAwareBranchRenderExpectedMixOutputName"), approved_branch_executor_path or "")
        add_check(checks, "approved-branch-render-executor-requires-ready-branch-audio-plan", "ready-source-aware-refined-stem-plan", approved_branch_executor.get("branchAudioPlanStatus"), approved_branch_executor_path or "")
        add_check(checks, "approved-branch-render-executor-requires-three-refined-stems", True, int_value(approved_branch_executor.get("branchAudioPlanSelectedRefinedStemCount")) >= 3, approved_branch_executor_path or "")
        add_check(checks, "approved-branch-render-executor-requires-no-missing-roles", [], sorted(str(role) for role in (approved_branch_executor.get("branchAudioPlanMissingRoleIds") or [])), approved_branch_executor_path or "")
        add_check(checks, "approved-branch-render-executor-requires-no-missing-stem-paths", 0, int_value(approved_branch_executor.get("branchAudioPlanMissingStemPathCount")), approved_branch_executor_path or "")
        add_check(checks, "approved-branch-render-executor-requires-stem-path-proof", True, bool_value(approved_branch_executor.get("sourceAwareBranchRenderStemPathsProved")), approved_branch_executor_path or "")
        add_check(checks, "approved-branch-render-executor-mastered-spine-only-prevented", bool_value(approved_branch_executor.get("masteredSpineOnlyBranchRenderPrevented")), bool_value(manifest.get("approvedBranchRenderExecutorMasteredSpineOnlyBranchRenderPrevented")), approved_branch_executor_path or "")
        add_check(checks, "approved-branch-render-executor-mastered-spine-use", approved_branch_executor.get("masteredSpineUse"), manifest.get("approvedBranchRenderExecutorMasteredSpineUse"), approved_branch_executor_path or "")
        add_false_safety_check(checks, "approved-branch-render-executor-approval-state-changed", approved_branch_executor, "approvalStateChanged", manifest, "approvedBranchRenderExecutorApprovalStateChanged", approved_branch_executor_path or "")
        add_false_safety_check(checks, "approved-branch-render-executor-branch-state-changed", approved_branch_executor, "branchStateChanged", manifest, "approvedBranchRenderExecutorBranchStateChanged", approved_branch_executor_path or "")
        add_false_safety_check(checks, "approved-branch-render-executor-render-attempted", approved_branch_executor, "renderAttempted", manifest, "approvedBranchRenderExecutorRenderAttempted", approved_branch_executor_path or "")
        add_false_safety_check(checks, "approved-branch-render-executor-upload-attempted", approved_branch_executor, "uploadAttempted", manifest, "approvedBranchRenderExecutorUploadAttempted", approved_branch_executor_path or "")
        add_false_safety_check(checks, "approved-branch-render-executor-publication-attempted", approved_branch_executor, "publicationAttempted", manifest, "approvedBranchRenderExecutorPublicationAttempted", approved_branch_executor_path or "")
        add_false_safety_check(checks, "approved-branch-render-executor-original-media-mutated", approved_branch_executor, "originalMediaMutated", manifest, "approvedBranchRenderExecutorOriginalMediaMutated", approved_branch_executor_path or "")

    if post_approval_rehearsal:
        add_check(checks, "post-approval-render-rehearsal-status", post_approval_rehearsal.get("status"), manifest.get("audioPostApprovalRenderRehearsalLatestStatus"), post_approval_rehearsal_path or "")
        add_check(checks, "post-approval-render-rehearsal-branches", int_value(post_approval_rehearsal.get("branchCount")), int_value(manifest.get("audioPostApprovalRenderRehearsalBranchCount")), post_approval_rehearsal_path or "")
        add_check(checks, "post-approval-render-rehearsal-source-chunks", int_value(post_approval_rehearsal.get("branchChunkCount")), int_value(manifest.get("audioPostApprovalRenderRehearsalBranchChunkCount")), post_approval_rehearsal_path or "")
        add_check(checks, "post-approval-render-rehearsal-source-chunks-nonzero", True, int_value(post_approval_rehearsal.get("branchChunkCount")) > 0, post_approval_rehearsal_path or "")
        add_check(checks, "post-approval-render-rehearsal-whole-source-chunks", True, all(bool(branch.get("usesWholeSourceChunks")) for branch in (post_approval_rehearsal.get("branches") or [])), post_approval_rehearsal_path or "")
        add_check(checks, "post-approval-render-rehearsal-blank-gap-seconds", post_approval_rehearsal.get("branchBlankGapSeconds"), manifest.get("audioPostApprovalRenderRehearsalBranchBlankGapSeconds"), post_approval_rehearsal_path or "")
        add_check(checks, "post-approval-render-rehearsal-reference-clip-seconds", post_approval_rehearsal.get("branchReferenceClipSeconds"), manifest.get("audioPostApprovalRenderRehearsalBranchReferenceClipSeconds"), post_approval_rehearsal_path or "")
        add_check(checks, "post-approval-render-rehearsal-source-role-seconds", post_approval_rehearsal.get("branchSourceRoleSeconds"), manifest.get("audioPostApprovalRenderRehearsalBranchSourceRoleSeconds"), post_approval_rehearsal_path or "")
        source_roles = set((post_approval_rehearsal.get("branchSourceRoleSeconds") or {}).keys())
        add_check(checks, "post-approval-render-rehearsal-source-role-coverage", [], sorted({"charlie_camera", "homer_camera", "reference_clip"} - source_roles), post_approval_rehearsal_path or "")
        add_check(checks, "post-approval-render-rehearsal-branch-audio-truth", post_approval_rehearsal.get("branchAudioTruth"), manifest.get("audioPostApprovalRenderRehearsalBranchAudioTruth"), post_approval_rehearsal_path or "")
        add_check(checks, "post-approval-render-rehearsal-source-aware-stems-after-approval", bool_value(post_approval_rehearsal.get("branchAudioWillUseSourceAwareStemsAfterApproval")), bool_value(manifest.get("audioPostApprovalRenderRehearsalBranchAudioWillUseSourceAwareStemsAfterApproval")), post_approval_rehearsal_path or "")
        add_check(checks, "post-approval-render-rehearsal-mastered-spine-only-render", bool_value(post_approval_rehearsal.get("branchAudioRenderedFromMasteredSpineOnly")), bool_value(manifest.get("audioPostApprovalRenderRehearsalBranchAudioRenderedFromMasteredSpineOnly")), post_approval_rehearsal_path or "")
        add_check(checks, "post-approval-render-rehearsal-mastered-spine-only-editing", bool_value(post_approval_rehearsal.get("branchMasteredSpineOnlyEditingAllowed")), bool_value(manifest.get("audioPostApprovalRenderRehearsalBranchMasteredSpineOnlyEditingAllowed")), post_approval_rehearsal_path or "")
        add_check(checks, "post-approval-render-rehearsal-requires-source-aware-audio-truth", "source-aware-refined-stems", post_approval_rehearsal.get("branchAudioTruth"), post_approval_rehearsal_path or "")
        add_check(checks, "post-approval-render-rehearsal-requires-source-aware-stems-after-approval", True, bool_value(post_approval_rehearsal.get("branchAudioWillUseSourceAwareStemsAfterApproval")), post_approval_rehearsal_path or "")
        add_check(checks, "post-approval-render-rehearsal-forbids-mastered-spine-only-render", False, bool_value(post_approval_rehearsal.get("branchAudioRenderedFromMasteredSpineOnly")), post_approval_rehearsal_path or "")
        add_check(checks, "post-approval-render-rehearsal-forbids-mastered-spine-only-editing", False, bool_value(post_approval_rehearsal.get("branchMasteredSpineOnlyEditingAllowed")), post_approval_rehearsal_path or "")
        add_check(checks, "post-approval-render-rehearsal-missing-inputs", int_value(post_approval_rehearsal.get("missingInputCount")), int_value(manifest.get("audioPostApprovalRenderRehearsalMissingInputCount")), post_approval_rehearsal_path or "")
        add_check(checks, "post-approval-render-rehearsal-hard-stops", int_value(post_approval_rehearsal.get("hardStopCount")), int_value(manifest.get("audioPostApprovalRenderRehearsalHardStopCount")), post_approval_rehearsal_path or "")
        add_check(checks, "post-approval-render-rehearsal-expected-blocked", bool_value(post_approval_rehearsal.get("expectedBlockedUntilHumanListen")), bool_value(manifest.get("audioPostApprovalRenderRehearsalExpectedBlockedUntilHumanListen")), post_approval_rehearsal_path or "")
        add_check(checks, "post-approval-render-rehearsal-dry-run-status", post_approval_rehearsal.get("rendererDryRunStatus"), manifest.get("audioPostApprovalRenderRehearsalRendererDryRunStatus"), post_approval_rehearsal_path or "")
        add_check(checks, "post-approval-render-rehearsal-dry-run-blocked", bool_value(post_approval_rehearsal.get("rendererDryRunBlocked")), bool_value(manifest.get("audioPostApprovalRenderRehearsalRendererDryRunBlocked")), post_approval_rehearsal_path or "")
        add_check(checks, "post-approval-render-rehearsal-dry-run-blockers", int_value(post_approval_rehearsal.get("rendererDryRunBlockerCount")), int_value(manifest.get("audioPostApprovalRenderRehearsalRendererDryRunBlockerCount")), post_approval_rehearsal_path or "")
        add_check(checks, "post-approval-render-rehearsal-approved-sandbox-status", post_approval_rehearsal.get("approvedStateSandboxStatus"), manifest.get("audioPostApprovalRenderRehearsalApprovedSandboxStatus"), post_approval_rehearsal_path or "")
        add_check(checks, "post-approval-render-rehearsal-approved-sandbox-passed", bool_value(post_approval_rehearsal.get("approvedStateSandboxPassed")), bool_value(manifest.get("audioPostApprovalRenderRehearsalApprovedSandboxPassed")), post_approval_rehearsal_path or "")
        add_check(checks, "post-approval-render-rehearsal-approved-sandbox-state-preserved", bool_value(post_approval_rehearsal.get("approvedStateSandboxRealApprovalStatePreserved")), bool_value(manifest.get("audioPostApprovalRenderRehearsalApprovedSandboxRealApprovalStatePreserved")), post_approval_rehearsal_path or "")
        add_check(checks, "post-approval-render-rehearsal-approved-sandbox-renderer-status", post_approval_rehearsal.get("approvedStateSandboxRendererDryRunStatus"), manifest.get("audioPostApprovalRenderRehearsalApprovedSandboxRendererDryRunStatus"), post_approval_rehearsal_path or "")
        add_check(checks, "post-approval-render-rehearsal-approved-sandbox-renderer-blocked", bool_value(post_approval_rehearsal.get("approvedStateSandboxRendererDryRunBlocked")), bool_value(manifest.get("audioPostApprovalRenderRehearsalApprovedSandboxRendererDryRunBlocked")), post_approval_rehearsal_path or "")
        add_check(checks, "post-approval-render-rehearsal-approved-sandbox-renderer-blockers", int_value(post_approval_rehearsal.get("approvedStateSandboxRendererDryRunBlockerCount")), int_value(manifest.get("audioPostApprovalRenderRehearsalApprovedSandboxRendererDryRunBlockerCount")), post_approval_rehearsal_path or "")
        add_check(checks, "post-approval-render-rehearsal-approved-sandbox-missing-inputs", int_value(post_approval_rehearsal.get("approvedStateSandboxRendererMissingInputCount")), int_value(manifest.get("audioPostApprovalRenderRehearsalApprovedSandboxRendererMissingInputCount")), post_approval_rehearsal_path or "")
        add_check(checks, "post-approval-render-rehearsal-approved-sandbox-branches", int_value(post_approval_rehearsal.get("approvedStateSandboxRendererBranchCount")), int_value(manifest.get("audioPostApprovalRenderRehearsalApprovedSandboxRendererBranchCount")), post_approval_rehearsal_path or "")
        add_check(checks, "post-approval-render-rehearsal-approved-sandbox-executor-status", post_approval_rehearsal.get("approvedStateSandboxExecutorStatus"), manifest.get("audioPostApprovalRenderRehearsalApprovedSandboxExecutorStatus"), post_approval_rehearsal_path or "")
        add_check(checks, "post-approval-render-rehearsal-approved-sandbox-executor-can-execute", bool_value(post_approval_rehearsal.get("approvedStateSandboxExecutorCanExecuteRealRenders")), bool_value(manifest.get("audioPostApprovalRenderRehearsalApprovedSandboxExecutorCanExecuteRealRenders")), post_approval_rehearsal_path or "")
        add_check(checks, "post-approval-render-rehearsal-approved-sandbox-executor-commands", bool_value(post_approval_rehearsal.get("approvedStateSandboxExecutorCommandsExposed")), bool_value(manifest.get("audioPostApprovalRenderRehearsalApprovedSandboxExecutorCommandsExposed")), post_approval_rehearsal_path or "")
        add_false_safety_check(checks, "post-approval-render-rehearsal-approved-sandbox-executor-render-attempted", post_approval_rehearsal, "approvedStateSandboxExecutorRenderAttempted", manifest, "audioPostApprovalRenderRehearsalApprovedSandboxExecutorRenderAttempted", post_approval_rehearsal_path or "")
        add_false_safety_check(checks, "post-approval-render-rehearsal-approved-sandbox-executor-upload-attempted", post_approval_rehearsal, "approvedStateSandboxExecutorUploadAttempted", manifest, "audioPostApprovalRenderRehearsalApprovedSandboxExecutorUploadAttempted", post_approval_rehearsal_path or "")
        add_false_safety_check(checks, "post-approval-render-rehearsal-approved-sandbox-executor-publication-attempted", post_approval_rehearsal, "approvedStateSandboxExecutorPublicationAttempted", manifest, "audioPostApprovalRenderRehearsalApprovedSandboxExecutorPublicationAttempted", post_approval_rehearsal_path or "")
        add_false_safety_check(checks, "post-approval-render-rehearsal-approved-sandbox-executor-original-media-mutated", post_approval_rehearsal, "approvedStateSandboxExecutorOriginalMediaMutated", manifest, "audioPostApprovalRenderRehearsalApprovedSandboxExecutorOriginalMediaMutated", post_approval_rehearsal_path or "")
        add_false_safety_check(checks, "post-approval-render-rehearsal-approval-state-changed", post_approval_rehearsal, "approvalStateChanged", manifest, "audioPostApprovalRenderRehearsalApprovalStateChanged", post_approval_rehearsal_path or "")
        add_false_safety_check(checks, "post-approval-render-rehearsal-branch-state-changed", post_approval_rehearsal, "branchStateChanged", manifest, "audioPostApprovalRenderRehearsalBranchStateChanged", post_approval_rehearsal_path or "")
        add_false_safety_check(checks, "post-approval-render-rehearsal-render-attempted", post_approval_rehearsal, "renderAttempted", manifest, "audioPostApprovalRenderRehearsalRenderAttempted", post_approval_rehearsal_path or "")
        add_false_safety_check(checks, "post-approval-render-rehearsal-branch-render-attempted", post_approval_rehearsal, "branchRenderAttempted", manifest, "audioPostApprovalRenderRehearsalBranchRenderAttempted", post_approval_rehearsal_path or "")
        add_false_safety_check(checks, "post-approval-render-rehearsal-upload-attempted", post_approval_rehearsal, "uploadAttempted", manifest, "audioPostApprovalRenderRehearsalUploadAttempted", post_approval_rehearsal_path or "")
        add_false_safety_check(checks, "post-approval-render-rehearsal-publication-attempted", post_approval_rehearsal, "publicationAttempted", manifest, "audioPostApprovalRenderRehearsalPublicationAttempted", post_approval_rehearsal_path or "")
        add_false_safety_check(checks, "post-approval-render-rehearsal-original-media-mutated", post_approval_rehearsal, "originalMediaMutated", manifest, "audioPostApprovalRenderRehearsalOriginalMediaMutated", post_approval_rehearsal_path or "")

    if post_approval_runway_packet:
        add_check(checks, "post-approval-branch-runway-packet-status", post_approval_runway_packet.get("status"), manifest.get("audioPostApprovalBranchRunwayPacketLatestStatus"), post_approval_runway_packet_path or "")
        add_check(checks, "post-approval-branch-runway-packet-ready-when-human-approved", bool_value(post_approval_runway_packet.get("readyWhenHumanApproved")), bool_value(manifest.get("audioPostApprovalBranchRunwayPacketReadyWhenHumanApproved")), post_approval_runway_packet_path or "")
        add_check(checks, "post-approval-branch-runway-packet-missing-inputs", int_value(post_approval_runway_packet.get("missingInputCount")), int_value(manifest.get("audioPostApprovalBranchRunwayPacketMissingInputCount")), post_approval_runway_packet_path or "")
        add_check(checks, "post-approval-branch-runway-packet-missing-artifacts", int_value(post_approval_runway_packet.get("missingArtifactCount")), int_value(manifest.get("audioPostApprovalBranchRunwayPacketMissingArtifactCount")), post_approval_runway_packet_path or "")
        add_check(checks, "post-approval-branch-runway-packet-planned-branches", int_value(post_approval_runway_packet.get("plannedBranchCount")), int_value(manifest.get("audioPostApprovalBranchRunwayPacketPlannedBranchCount")), post_approval_runway_packet_path or "")
        add_check(checks, "post-approval-branch-runway-packet-asr-risks", int_value(post_approval_runway_packet.get("asrFocusReviewRiskCount")), int_value(manifest.get("audioPostApprovalBranchRunwayPacketAsrFocusReviewRiskCount")), post_approval_runway_packet_path or "")
        add_check(checks, "post-approval-branch-runway-packet-source-aware-edit-ready", bool_value(post_approval_runway_packet.get("sourceAwareBranchEditReady")), bool_value(manifest.get("audioPostApprovalBranchRunwayPacketSourceAwareBranchEditReady")), post_approval_runway_packet_path or "")
        add_check(checks, "post-approval-branch-runway-packet-source-aware-branch-count", int_value(post_approval_runway_packet.get("sourceAwareBranchCount")), int_value(manifest.get("audioPostApprovalBranchRunwayPacketSourceAwareBranchCount")), post_approval_runway_packet_path or "")
        add_check(checks, "post-approval-branch-runway-packet-source-aware-roles", sorted(str(role) for role in (post_approval_runway_packet.get("sourceAwareBranchRoleIds") or [])), sorted(str(role) for role in (manifest.get("audioPostApprovalBranchRunwayPacketSourceAwareBranchRoleIds") or [])), post_approval_runway_packet_path or "")
        add_check(checks, "post-approval-branch-runway-packet-source-aware-timing-status", post_approval_runway_packet.get("sourceAwareTimingContractStatus"), manifest.get("audioPostApprovalBranchRunwayPacketSourceAwareTimingContractStatus"), post_approval_runway_packet_path or "")
        add_check(checks, "post-approval-branch-runway-packet-source-aware-timing-hard-stops", int_value(post_approval_runway_packet.get("sourceAwareTimingContractHardStopCount")), int_value(manifest.get("audioPostApprovalBranchRunwayPacketSourceAwareTimingHardStopCount")), post_approval_runway_packet_path or "")
        add_check(checks, "post-approval-branch-runway-packet-source-aware-stems", int_value(post_approval_runway_packet.get("sourceAwareStemReadyCount")), int_value(manifest.get("audioPostApprovalBranchRunwayPacketSourceAwareStemReadyCount")), post_approval_runway_packet_path or "")
        add_check(checks, "post-approval-branch-runway-packet-mastered-spine-only-forbidden", bool_value(post_approval_runway_packet.get("sourceAwareMasteredSpineOnlyEditingAllowed")), bool_value(manifest.get("audioPostApprovalBranchRunwayPacketSourceAwareMasteredSpineOnlyEditingAllowed")), post_approval_runway_packet_path or "")
        add_false_safety_check(checks, "post-approval-branch-runway-packet-approval-state-changed", post_approval_runway_packet, "approvalStateChanged", manifest, "audioPostApprovalBranchRunwayPacketApprovalStateChanged", post_approval_runway_packet_path or "")
        add_false_safety_check(checks, "post-approval-branch-runway-packet-branch-state-changed", post_approval_runway_packet, "branchStateChanged", manifest, "audioPostApprovalBranchRunwayPacketBranchStateChanged", post_approval_runway_packet_path or "")
        add_false_safety_check(checks, "post-approval-branch-runway-packet-render-attempted", post_approval_runway_packet, "renderAttempted", manifest, "audioPostApprovalBranchRunwayPacketRenderAttempted", post_approval_runway_packet_path or "")
        add_false_safety_check(checks, "post-approval-branch-runway-packet-branch-render-attempted", post_approval_runway_packet, "branchRenderAttempted", manifest, "audioPostApprovalBranchRunwayPacketBranchRenderAttempted", post_approval_runway_packet_path or "")
        add_false_safety_check(checks, "post-approval-branch-runway-packet-upload-attempted", post_approval_runway_packet, "uploadAttempted", manifest, "audioPostApprovalBranchRunwayPacketUploadAttempted", post_approval_runway_packet_path or "")
        add_false_safety_check(checks, "post-approval-branch-runway-packet-publication-attempted", post_approval_runway_packet, "publicationAttempted", manifest, "audioPostApprovalBranchRunwayPacketPublicationAttempted", post_approval_runway_packet_path or "")
        add_false_safety_check(checks, "post-approval-branch-runway-packet-original-media-mutated", post_approval_runway_packet, "originalMediaMutated", manifest, "audioPostApprovalBranchRunwayPacketOriginalMediaMutated", post_approval_runway_packet_path or "")

    if post_failure_rehearsal:
        add_check(checks, "post-failure-repair-rehearsal-status", post_failure_rehearsal.get("status"), manifest.get("audioPostFailureRepairRehearsalLatestStatus"), post_failure_rehearsal_path or "")
        add_check(checks, "post-failure-repair-rehearsal-passed", bool_value(post_failure_rehearsal.get("passed")), bool_value(manifest.get("audioPostFailureRepairRehearsalPassed")), post_failure_rehearsal_path or "")
        add_check(checks, "post-failure-repair-rehearsal-scenarios", int_value(post_failure_rehearsal.get("scenarioCount")), int_value(manifest.get("audioPostFailureRepairRehearsalScenarioCount")), post_failure_rehearsal_path or "")
        add_check(checks, "post-failure-repair-rehearsal-proof-ready", bool_value(post_failure_rehearsal.get("proofScenarioReady")), bool_value(manifest.get("audioPostFailureRepairRehearsalProofScenarioReady")), post_failure_rehearsal_path or "")
        add_check(checks, "post-failure-repair-rehearsal-repair-ready", bool_value(post_failure_rehearsal.get("repairScenarioReady")), bool_value(manifest.get("audioPostFailureRepairRehearsalRepairScenarioReady")), post_failure_rehearsal_path or "")
        add_check(checks, "post-failure-repair-rehearsal-mixed-ready", bool_value(post_failure_rehearsal.get("mixedScenarioReady")), bool_value(manifest.get("audioPostFailureRepairRehearsalMixedScenarioReady")), post_failure_rehearsal_path or "")
        add_check(checks, "post-failure-repair-rehearsal-failures", int_value(post_failure_rehearsal.get("failureCount")), int_value(manifest.get("audioPostFailureRepairRehearsalFailureCount")), post_failure_rehearsal_path or "")
        add_check(checks, "post-failure-repair-rehearsal-real-approval-preserved", bool_value(post_failure_rehearsal.get("realApprovalStatePreserved")), bool_value(manifest.get("audioPostFailureRepairRehearsalRealApprovalStatePreserved")), post_failure_rehearsal_path or "")
        add_check(checks, "post-failure-repair-rehearsal-real-branch-preserved", bool_value(post_failure_rehearsal.get("realBranchStatePreserved")), bool_value(manifest.get("audioPostFailureRepairRehearsalRealBranchStatePreserved")), post_failure_rehearsal_path or "")
        add_false_safety_check(checks, "post-failure-repair-rehearsal-approval-state-changed", post_failure_rehearsal, "approvalStateChanged", manifest, "audioPostFailureRepairRehearsalApprovalStateChanged", post_failure_rehearsal_path or "")
        add_false_safety_check(checks, "post-failure-repair-rehearsal-branch-state-changed", post_failure_rehearsal, "branchStateChanged", manifest, "audioPostFailureRepairRehearsalBranchStateChanged", post_failure_rehearsal_path or "")
        add_false_safety_check(checks, "post-failure-repair-rehearsal-render-attempted", post_failure_rehearsal, "renderAttempted", manifest, "audioPostFailureRepairRehearsalRenderAttempted", post_failure_rehearsal_path or "")
        add_false_safety_check(checks, "post-failure-repair-rehearsal-branch-render-attempted", post_failure_rehearsal, "branchRenderAttempted", manifest, "audioPostFailureRepairRehearsalBranchRenderAttempted", post_failure_rehearsal_path or "")
        add_false_safety_check(checks, "post-failure-repair-rehearsal-upload-attempted", post_failure_rehearsal, "uploadAttempted", manifest, "audioPostFailureRepairRehearsalUploadAttempted", post_failure_rehearsal_path or "")
        add_false_safety_check(checks, "post-failure-repair-rehearsal-publication-attempted", post_failure_rehearsal, "publicationAttempted", manifest, "audioPostFailureRepairRehearsalPublicationAttempted", post_failure_rehearsal_path or "")
        add_false_safety_check(checks, "post-failure-repair-rehearsal-original-media-mutated", post_failure_rehearsal, "originalMediaMutated", manifest, "audioPostFailureRepairRehearsalOriginalMediaMutated", post_failure_rehearsal_path or "")

    if episode_rollout_board:
        add_check(checks, "episode-rollout-board-status", episode_rollout_board.get("status"), manifest.get("audioEpisodeRolloutReadinessLatestStatus"), episode_rollout_board_path or "")
        add_check(checks, "episode-rollout-board-episode-count", int_value(episode_rollout_board.get("episodeCount")), int_value(manifest.get("audioEpisodeRolloutReadinessEpisodeCount")), episode_rollout_board_path or "")
        add_check(checks, "episode-rollout-board-ready-count", int_value(episode_rollout_board.get("readyForIntakeCount")), int_value(manifest.get("audioEpisodeRolloutReadinessReadyForIntakeCount")), episode_rollout_board_path or "")
        add_check(checks, "episode-rollout-board-proof-target-count", int_value(episode_rollout_board.get("currentProofTargetCount")), int_value(manifest.get("audioEpisodeRolloutReadinessCurrentProofTargetCount")), episode_rollout_board_path or "")
        add_check(checks, "episode-rollout-board-needs-media-count", int_value(episode_rollout_board.get("needsMediaCount")), int_value(manifest.get("audioEpisodeRolloutReadinessNeedsMediaCount")), episode_rollout_board_path or "")
        add_check(checks, "episode-rollout-board-hard-stops", int_value(episode_rollout_board.get("hardStopCount")), int_value(manifest.get("audioEpisodeRolloutReadinessHardStopCount")), episode_rollout_board_path or "")
        add_false_safety_check(checks, "episode-rollout-board-approval-state-changed", episode_rollout_board, "approvalStateChanged", manifest, "audioEpisodeRolloutReadinessApprovalStateChanged", episode_rollout_board_path or "")
        add_false_safety_check(checks, "episode-rollout-board-branch-state-changed", episode_rollout_board, "branchStateChanged", manifest, "audioEpisodeRolloutReadinessBranchStateChanged", episode_rollout_board_path or "")
        add_false_safety_check(checks, "episode-rollout-board-render-attempted", episode_rollout_board, "renderAttempted", manifest, "audioEpisodeRolloutReadinessRenderAttempted", episode_rollout_board_path or "")
        add_false_safety_check(checks, "episode-rollout-board-upload-attempted", episode_rollout_board, "uploadAttempted", manifest, "audioEpisodeRolloutReadinessUploadAttempted", episode_rollout_board_path or "")
        add_false_safety_check(checks, "episode-rollout-board-publication-attempted", episode_rollout_board, "publicationAttempted", manifest, "audioEpisodeRolloutReadinessPublicationAttempted", episode_rollout_board_path or "")
        add_false_safety_check(checks, "episode-rollout-board-original-media-mutated", episode_rollout_board, "originalMediaMutated", manifest, "audioEpisodeRolloutReadinessOriginalMediaMutated", episode_rollout_board_path or "")

    if episode_media_inventory:
        add_check(checks, "episode-media-inventory-status", episode_media_inventory.get("status"), manifest.get("audioEpisodeMediaInventoryPreflightLatestStatus"), episode_media_inventory_path or "")
        add_check(checks, "episode-media-inventory-episode-count", int_value(episode_media_inventory.get("episodeCount")), int_value(manifest.get("audioEpisodeMediaInventoryPreflightEpisodeCount")), episode_media_inventory_path or "")
        add_check(checks, "episode-media-inventory-file-count", int_value(episode_media_inventory.get("scannedFileCount")), int_value(manifest.get("audioEpisodeMediaInventoryPreflightScannedFileCount")), episode_media_inventory_path or "")
        add_check(checks, "episode-media-inventory-audio-count", int_value(episode_media_inventory.get("audioFileCount")), int_value(manifest.get("audioEpisodeMediaInventoryPreflightAudioFileCount")), episode_media_inventory_path or "")
        add_check(checks, "episode-media-inventory-video-count", int_value(episode_media_inventory.get("videoFileCount")), int_value(manifest.get("audioEpisodeMediaInventoryPreflightVideoFileCount")), episode_media_inventory_path or "")
        add_check(checks, "episode-media-inventory-spine-candidates", int_value(episode_media_inventory.get("candidateSpineCount")), int_value(manifest.get("audioEpisodeMediaInventoryPreflightCandidateSpineCount")), episode_media_inventory_path or "")
        add_check(checks, "episode-media-inventory-probe-errors", int_value(episode_media_inventory.get("probeErrorCount")), int_value(manifest.get("audioEpisodeMediaInventoryPreflightProbeErrorCount")), episode_media_inventory_path or "")
        add_check(checks, "episode-media-inventory-hard-stops", int_value(episode_media_inventory.get("hardStopCount")), int_value(manifest.get("audioEpisodeMediaInventoryPreflightHardStopCount")), episode_media_inventory_path or "")
        add_false_safety_check(checks, "episode-media-inventory-approval-state-changed", episode_media_inventory, "approvalStateChanged", manifest, "audioEpisodeMediaInventoryPreflightApprovalStateChanged", episode_media_inventory_path or "")
        add_false_safety_check(checks, "episode-media-inventory-branch-state-changed", episode_media_inventory, "branchStateChanged", manifest, "audioEpisodeMediaInventoryPreflightBranchStateChanged", episode_media_inventory_path or "")
        add_false_safety_check(checks, "episode-media-inventory-render-attempted", episode_media_inventory, "renderAttempted", manifest, "audioEpisodeMediaInventoryPreflightRenderAttempted", episode_media_inventory_path or "")
        add_false_safety_check(checks, "episode-media-inventory-upload-attempted", episode_media_inventory, "uploadAttempted", manifest, "audioEpisodeMediaInventoryPreflightUploadAttempted", episode_media_inventory_path or "")
        add_false_safety_check(checks, "episode-media-inventory-publication-attempted", episode_media_inventory, "publicationAttempted", manifest, "audioEpisodeMediaInventoryPreflightPublicationAttempted", episode_media_inventory_path or "")
        add_false_safety_check(checks, "episode-media-inventory-original-media-mutated", episode_media_inventory, "originalMediaMutated", manifest, "audioEpisodeMediaInventoryPreflightOriginalMediaMutated", episode_media_inventory_path or "")
        add_false_safety_check(checks, "morning-audio-review-launcher-branch-state-changed", morning_launcher, "branchStateChanged", manifest, "audioMorningAudioReviewLauncherBranchStateChanged", morning_launcher_path or "")
        add_false_safety_check(checks, "morning-audio-review-launcher-render-attempted", morning_launcher, "renderAttempted", manifest, "audioMorningAudioReviewLauncherRenderAttempted", morning_launcher_path or "")
        add_false_safety_check(checks, "morning-audio-review-launcher-upload-attempted", morning_launcher, "uploadAttempted", manifest, "audioMorningAudioReviewLauncherUploadAttempted", morning_launcher_path or "")
        add_false_safety_check(checks, "morning-audio-review-launcher-publication-attempted", morning_launcher, "publicationAttempted", manifest, "audioMorningAudioReviewLauncherPublicationAttempted", morning_launcher_path or "")
        add_false_safety_check(checks, "morning-audio-review-launcher-original-media-mutated", morning_launcher, "originalMediaMutated", manifest, "audioMorningAudioReviewLauncherOriginalMediaMutated", morning_launcher_path or "")

    failure_count = sum(1 for check in checks if not check.passed)
    status = "passed" if failure_count == 0 else "needs-refresh"
    return {
        "schema": "quipsly.audio-workbench.manifest-readback-consistency-smoke.v1",
        "generatedAt": generated_at,
        "baselineDir": str(baseline_dir),
        "baselineId": manifest.get("baselineId"),
        "status": status,
        "passed": failure_count == 0,
        "checkCount": len(checks),
        "failureCount": failure_count,
        "approvalStatus": manifest.get("approvalStatus"),
        "packageReadyForHumanListen": bool_value(manifest.get("packageReadyForHumanListen")),
        "branchInheritanceReady": bool_value(manifest.get("branchInheritanceReady")),
        "branchRenderReady": bool_value(manifest.get("branchRenderReady")),
        "checks": [check.__dict__ for check in checks],
        "approvalStateChanged": False,
        "branchStateChanged": False,
        "renderAttempted": False,
        "uploadAttempted": False,
        "publicationAttempted": False,
        "originalMediaMutated": False,
    }


def render_markdown(report: dict[str, Any]) -> str:
    lines = [
        f"# Manifest Readback Consistency Smoke: {report['baselineId']}",
        "",
        f"Generated: `{report['generatedAt']}`",
        "",
        "This smoke proves the manifest's promoted top-level readback fields agree with the latest reports they summarize. It does not approve audio, unlock branches, render media, upload, publish, or mutate original media.",
        "",
        "## Result",
        "",
        f"- Status: `{report['status']}`",
        f"- Passed: `{str(report['passed']).lower()}`",
        f"- Checks: `{report['checkCount']}`",
        f"- Failures: `{report['failureCount']}`",
        f"- Approval status: `{report['approvalStatus']}`",
        f"- Branch inheritance ready: `{str(report['branchInheritanceReady']).lower()}`",
        f"- Branch render ready: `{str(report['branchRenderReady']).lower()}`",
        "",
        "## Checks",
        "",
        "| Check | Result | Expected | Actual | Detail |",
        "|---|---:|---|---|---|",
    ]
    for check in report["checks"]:
        result = "pass" if check["passed"] else "FAIL"
        lines.append(
            "| "
            + " | ".join(
                [
                    str(check["name"]),
                    result,
                    f"`{str(check['expected'])}`",
                    f"`{str(check['actual'])}`",
                    str(check.get("detail") or ""),
                ]
            )
            + " |"
        )
    return "\n".join(lines) + "\n"


def render_html(report: dict[str, Any]) -> str:
    rows = []
    for check in report["checks"]:
        cls = "ok" if check["passed"] else "bad"
        rows.append(
            f"<tr class='{cls}'><td>{html.escape(str(check['name']))}</td><td>{'pass' if check['passed'] else 'FAIL'}</td><td><code>{html.escape(str(check['expected']))}</code></td><td><code>{html.escape(str(check['actual']))}</code></td><td>{html.escape(str(check.get('detail') or ''))}</td></tr>"
        )
    return f"""<!doctype html>
<html lang=\"en\">
<head>
<meta charset=\"utf-8\" />
<title>Manifest Readback Consistency Smoke</title>
<style>
body {{ font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; margin: 32px; background: #141812; color: #f5eddc; }}
.card {{ border: 1px solid rgba(245, 237, 220, .18); border-radius: 18px; padding: 20px; background: rgba(255,255,255,.045); margin-bottom: 18px; }}
table {{ border-collapse: collapse; width: 100%; font-size: 13px; }}
th, td {{ border-bottom: 1px solid rgba(255,255,255,.12); padding: 8px; text-align: left; vertical-align: top; }}
.ok td:nth-child(2) {{ color: #8ee59a; font-weight: 700; }}
.bad td:nth-child(2) {{ color: #ff7d7d; font-weight: 700; }}
code {{ color: #ffe08a; }}
</style>
</head>
<body>
<div class=\"card\">
<h1>Manifest Readback Consistency Smoke</h1>
<p><strong>Status:</strong> {html.escape(str(report['status']))} · <strong>Passed:</strong> {str(report['passed']).lower()} · <strong>Failures:</strong> {report['failureCount']} / {report['checkCount']}</p>
<p>This verifies that manifest readback fields match the latest front-door reports. It does not approve audio, unlock branches, render, upload, publish, or mutate original media.</p>
</div>
<div class=\"card\">
<table><thead><tr><th>Check</th><th>Result</th><th>Expected</th><th>Actual</th><th>Detail</th></tr></thead><tbody>{''.join(rows)}</tbody></table>
</div>
</body>
</html>
"""


def write_open_command(path: Path, html_path: Path, md_path: Path) -> None:
    path.write_text(
        "#!/usr/bin/env bash\n"
        "set -euo pipefail\n"
        f"open {shell_quote(str(html_path))}\n"
        f"open {shell_quote(str(md_path))}\n",
        encoding="utf-8",
    )
    path.chmod(0o755)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--baseline-dir", required=True, type=Path)
    args = parser.parse_args()

    baseline_dir = resolve_baseline_dir(args.baseline_dir)
    manifest_path = baseline_dir / "manifest.json"
    manifest_before = read_json(manifest_path)
    baseline_id = str(manifest_before.get("baselineId") or "audio-baseline")
    slug = safe_slug(baseline_id.replace("episode-4-conformed-production-baseline-", ""))
    generated_at = datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S")

    report = build_report(manifest_before, baseline_dir, generated_at)
    output_dir = baseline_dir / f"audio-manifest-readback-consistency-smoke-{slug}-{generated_at}"
    output_dir.mkdir(parents=True, exist_ok=True)
    versioned_json = output_dir / "manifest-readback-consistency-smoke.json"
    versioned_md = output_dir / "manifest-readback-consistency-smoke.md"
    versioned_html = output_dir / "manifest-readback-consistency-smoke.html"
    versioned_open = output_dir / "open-manifest-readback-consistency-smoke.command"
    stable_json = baseline_dir / "AUDIO_MANIFEST_READBACK_CONSISTENCY_SMOKE.json"
    stable_md = baseline_dir / "AUDIO_MANIFEST_READBACK_CONSISTENCY_SMOKE.md"
    stable_html = baseline_dir / "AUDIO_MANIFEST_READBACK_CONSISTENCY_SMOKE.html"
    stable_open = baseline_dir / "OPEN_AUDIO_MANIFEST_READBACK_CONSISTENCY_SMOKE.command"

    markdown = render_markdown(report)
    html_doc = render_html(report)
    write_json(versioned_json, report)
    versioned_md.write_text(markdown, encoding="utf-8")
    versioned_html.write_text(html_doc, encoding="utf-8")
    write_open_command(versioned_open, versioned_html, versioned_md)
    write_json(stable_json, report)
    stable_md.write_text(markdown, encoding="utf-8")
    stable_html.write_text(html_doc, encoding="utf-8")
    write_open_command(stable_open, stable_html, stable_md)

    manifest_after = read_json(manifest_path)
    outputs = manifest_after.setdefault("outputs", {})
    entry = {
        "path": str(stable_json),
        "jsonPath": str(stable_json),
        "markdownPath": str(stable_md),
        "htmlPath": str(stable_html),
        "openCommand": str(stable_open),
        "versionedPath": str(versioned_json),
        "versionedJsonPath": str(versioned_json),
        "versionedMarkdownPath": str(versioned_md),
        "versionedHtmlPath": str(versioned_html),
        "versionedOpenCommand": str(versioned_open),
        "generatedAt": generated_at,
        "schema": report["schema"],
        "status": report["status"],
        "passed": report["passed"],
        "checkCount": report["checkCount"],
        "failureCount": report["failureCount"],
        "approvalStateChanged": False,
        "branchStateChanged": False,
        "renderAttempted": False,
        "uploadAttempted": False,
        "publicationAttempted": False,
        "originalMediaMutated": False,
    }
    history = outputs.setdefault("audioManifestReadbackConsistencySmokes", [])
    history.append(entry)
    outputs["latestAudioManifestReadbackConsistencySmoke"] = entry
    outputs["latestAudioManifestReadbackConsistencySmokeMarkdown"] = str(stable_md)
    outputs["latestAudioManifestReadbackConsistencySmokeHtml"] = str(stable_html)
    outputs["latestAudioManifestReadbackConsistencySmokeOpenCommand"] = str(stable_open)
    manifest_after["audioManifestReadbackConsistencySmokeCount"] = len(history)
    manifest_after["audioManifestReadbackConsistencySmokeLatestStatus"] = report["status"]
    manifest_after["audioManifestReadbackConsistencySmokePassed"] = report["passed"]
    manifest_after["audioManifestReadbackConsistencySmokeCheckCount"] = report["checkCount"]
    manifest_after["audioManifestReadbackConsistencySmokeFailureCount"] = report["failureCount"]
    manifest_after["audioManifestReadbackConsistencySmokeLatestGeneratedAt"] = generated_at
    manifest_after["audioManifestReadbackConsistencySmokeLatestMarkdown"] = str(stable_md)
    manifest_after["audioManifestReadbackConsistencySmokeOriginalMediaMutated"] = False
    manifest_after["audioManifestReadbackConsistencySmokeApprovalStateChanged"] = False
    manifest_after["audioManifestReadbackConsistencySmokeBranchStateChanged"] = False
    manifest_after["audioManifestReadbackConsistencySmokeRenderAttempted"] = False
    manifest_after["audioManifestReadbackConsistencySmokeUploadAttempted"] = False
    manifest_after["audioManifestReadbackConsistencySmokePublicationAttempted"] = False
    write_json(manifest_path, manifest_after)
    print(json.dumps(entry, indent=2, sort_keys=True))


if __name__ == "__main__":
    main()
