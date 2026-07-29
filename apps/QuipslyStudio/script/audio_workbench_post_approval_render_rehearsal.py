#!/usr/bin/env python3
"""Create a non-rendering rehearsal for post-approval Episode 4 branch renders.

This sits between the human-listen gate and the guarded branch executor. It lets
humans and agents inspect the planned Episode 4 branch set before approval, but
it does not expose executable render commands, run renders, upload, publish, or
mutate original media.
"""

from __future__ import annotations

import argparse
import json
import os
import shutil
import shlex
import subprocess
import sys
from datetime import datetime, timezone
from html import escape
from pathlib import Path
from typing import Any


BRANCH_LABELS = {
    "tight-30-45": "Tight 30-45 minute episode candidate",
    "main-45-60": "Primary 45-60 minute episode candidate",
    "extended-60-80": "Extended 60-80 minute episode candidate",
}
OUTPUT_STEM = "EPISODE_4_POST_APPROVAL_RENDER_REHEARSAL"
REQUIRED_SOURCE_AWARE_ROLES = {"charlie", "homer", "clip-source"}


def read_json(path: Path) -> dict[str, Any]:
    return json.loads(path.read_text(encoding="utf-8"))


def write_json(path: Path, payload: dict[str, Any]) -> None:
    path.write_text(json.dumps(payload, indent=2, sort_keys=True) + "\n", encoding="utf-8")


def repo_root() -> Path:
    return Path(__file__).resolve().parents[3]


def shell_quote(value: str) -> str:
    return shlex.quote(value)


def safe_slug(value: Any) -> str:
    out = "".join(ch.lower() if ch.isalnum() else "-" for ch in str(value))
    while "--" in out:
        out = out.replace("--", "-")
    return out.strip("-") or "episode-4"


def output_path(value: Any) -> str | None:
    if isinstance(value, str) and value:
        return value
    if isinstance(value, dict):
        for key in ("path", "jsonPath", "markdownPath", "htmlPath", "openCommand", "openCommandPath"):
            candidate = value.get(key)
            if isinstance(candidate, str) and candidate:
                return candidate
    return None


def existing_output(outputs: dict[str, Any], key: str) -> str | None:
    path = output_path(outputs.get(key))
    if path and Path(path).exists():
        return path
    return None


def file_summary(path: str | None) -> dict[str, Any]:
    if not path:
        return {"path": None, "exists": False, "sizeBytes": 0, "sizeMb": 0}
    p = Path(path)
    exists = p.exists()
    size = p.stat().st_size if exists else 0
    return {"path": path, "exists": exists, "sizeBytes": size, "sizeMb": round(size / (1024 * 1024), 2) if exists else 0}


def run_renderer_dry_run(root: Path, baseline_dir: Path, output_root: str | None) -> dict[str, Any]:
    command = [
        sys.executable or "python3",
        str(root / "apps" / "QuipslyStudio" / "script" / "episode4_full_sync_export.py"),
        "--dry-run",
        "--conformed-baseline-dir",
        str(baseline_dir),
    ]
    if output_root:
        command.extend(["--output-root", output_root])
    result = subprocess.run(command, cwd=root, text=True, capture_output=True, check=False)
    parsed: dict[str, Any] = {}
    if result.stdout.strip():
        try:
            parsed = json.loads(result.stdout)
        except json.JSONDecodeError:
            parsed = {}
    return {
        "commandRedacted": ["python3", "episode4_full_sync_export.py", "--dry-run", "--conformed-baseline-dir", "<v006-baseline>"],
        "returncode": result.returncode,
        "stdoutParsed": bool(parsed),
        "stderrTail": result.stderr[-2400:],
        "payload": parsed,
    }


def run_approved_executor_dry_run(root: Path, baseline_dir: Path, output_root: str | None) -> dict[str, Any]:
    command = [
        sys.executable or "python3",
        str(root / "apps" / "QuipslyStudio" / "script" / "audio_workbench_approved_branch_render_executor.py"),
        "--baseline-dir",
        str(baseline_dir),
    ]
    if output_root:
        command.extend(["--output-root", output_root])
    result = subprocess.run(command, cwd=root, text=True, capture_output=True, check=False)
    manifest: dict[str, Any] = {}
    manifest_path = baseline_dir / "manifest.json"
    if manifest_path.exists():
        try:
            manifest = read_json(manifest_path)
        except json.JSONDecodeError:
            manifest = {}
    outputs = manifest.get("outputs") if isinstance(manifest.get("outputs"), dict) else {}
    executor_path = output_path(outputs.get("latestApprovedBranchRenderExecutor"))
    executor: dict[str, Any] = {}
    if executor_path and Path(executor_path).exists():
        try:
            executor = read_json(Path(executor_path))
        except json.JSONDecodeError:
            executor = {}
    return {
        "commandRedacted": ["python3", "audio_workbench_approved_branch_render_executor.py", "--baseline-dir", "<approved-sandbox>"],
        "returncode": result.returncode,
        "stderrTail": result.stderr[-2400:],
        "executorPath": executor_path,
        "executor": executor,
    }


def build_approved_sandbox(real_manifest: dict[str, Any], sandbox_dir: Path) -> Path:
    if sandbox_dir.exists():
        shutil.rmtree(sandbox_dir)
    sandbox_dir.mkdir(parents=True, exist_ok=True)

    manifest = json.loads(json.dumps(real_manifest))
    outputs = manifest.setdefault("outputs", {})
    gate_path = sandbox_dir / "sandbox-branch-inheritance-gate.json"
    gate = {
        "schema": "quipsly.audio-workbench.branch-inheritance-gate.sandbox.v1",
        "status": "ready-for-branch-inheritance",
        "baselineId": manifest.get("baselineId"),
        "decisionStatus": "human-approved-for-branch-inheritance",
        "approvalStatus": "human-approved-for-branch-inheritance",
        "branchInheritanceReadyBefore": False,
        "branchInheritanceReadyAfter": True,
        "branchStateChanged": True,
        "canInheritForBranches": True,
        "publicationApproved": False,
        "artifactChecks": {},
        "blockers": [],
        "warnings": [],
        "approvalStateChanged": False,
        "renderAttempted": False,
        "uploadAttempted": False,
        "publicationAttempted": False,
        "originalMediaMutated": False,
        "sandboxOnly": True,
    }
    write_json(gate_path, gate)
    outputs["latestBranchInheritanceGate"] = str(gate_path)
    manifest["approvalStatus"] = "human-approved-for-branch-inheritance"
    manifest["branchInheritanceReady"] = True
    manifest["branchRenderReady"] = True
    manifest["sandboxApprovalRehearsalOnly"] = True
    manifest["sandboxApprovalSource"] = "audio_workbench_post_approval_render_rehearsal.py"
    write_json(sandbox_dir / "manifest.json", manifest)
    return sandbox_dir


def run_sandbox_approval_trial(
    root: Path,
    baseline_dir: Path,
    real_manifest: dict[str, Any],
    output_root: str | None,
    sandbox_dir: Path,
) -> dict[str, Any]:
    real_before = {
        "approvalStatus": real_manifest.get("approvalStatus"),
        "branchInheritanceReady": real_manifest.get("branchInheritanceReady"),
        "branchRenderReady": real_manifest.get("branchRenderReady"),
    }
    sandbox_baseline = build_approved_sandbox(real_manifest, sandbox_dir)
    renderer = run_renderer_dry_run(root, sandbox_baseline, output_root)
    renderer_payload = renderer.get("payload") if isinstance(renderer.get("payload"), dict) else {}
    executor = run_approved_executor_dry_run(root, sandbox_baseline, output_root)
    executor_payload = executor.get("executor") if isinstance(executor.get("executor"), dict) else {}
    real_after_manifest = read_json(baseline_dir / "manifest.json")
    real_after = {
        "approvalStatus": real_after_manifest.get("approvalStatus"),
        "branchInheritanceReady": real_after_manifest.get("branchInheritanceReady"),
        "branchRenderReady": real_after_manifest.get("branchRenderReady"),
    }
    renderer_missing = renderer_payload.get("missingInputs") if isinstance(renderer_payload.get("missingInputs"), list) else []
    renderer_blockers = renderer_payload.get("renderBlockers") if isinstance(renderer_payload.get("renderBlockers"), list) else []
    renderer_branches = renderer_payload.get("branches") if isinstance(renderer_payload.get("branches"), list) else []
    hard_stops: list[str] = []
    if not renderer.get("stdoutParsed"):
        hard_stops.append("approved sandbox renderer dry-run did not return parseable JSON")
    if renderer.get("returncode") != 0:
        hard_stops.append(f"approved sandbox renderer dry-run exited {renderer.get('returncode')}")
    if renderer_missing:
        hard_stops.append(f"approved sandbox renderer reports {len(renderer_missing)} missing input(s)")
    if renderer_blockers:
        hard_stops.append(f"approved sandbox renderer reports {len(renderer_blockers)} render blocker(s)")
    if len(renderer_branches) < 3:
        hard_stops.append(f"approved sandbox renderer planned only {len(renderer_branches)} branch(es)")
    if executor.get("returncode") != 0:
        hard_stops.append(f"approved sandbox executor exited {executor.get('returncode')}")
    if executor_payload.get("status") != "ready-dry-run":
        hard_stops.append(f"approved sandbox executor status is {executor_payload.get('status')}")
    if executor_payload.get("commandsExposed") is not True:
        hard_stops.append("approved sandbox executor did not expose dry-run commands")
    if executor_payload.get("canExecuteRealRenders") is not True:
        hard_stops.append("approved sandbox executor cannot execute after simulated approval")
    if executor_payload.get("sourceAwareRenderContractReady") is not True:
        hard_stops.append("approved sandbox executor did not inherit a ready source-aware render contract")
    if executor_payload.get("sourceAwareAudioContractStatus") != "ready-source-aware-editable":
        hard_stops.append(
            "approved sandbox executor source-aware contract is "
            f"{executor_payload.get('sourceAwareAudioContractStatus')}"
        )
    executor_roles = set(str(role) for role in (executor_payload.get("sourceAwareAudioRoleIds") or []))
    missing_executor_roles = sorted(REQUIRED_SOURCE_AWARE_ROLES - executor_roles)
    if missing_executor_roles:
        hard_stops.append(
            "approved sandbox executor is missing source-aware roles: "
            + ", ".join(missing_executor_roles)
        )
    if executor_payload.get("masteredSpineOnlyEditingAllowed") is not False:
        hard_stops.append("approved sandbox executor would allow mastered-spine-only editing")
    if executor_payload.get("renderAttempted") is not False:
        hard_stops.append("approved sandbox executor attempted a render during dry-run rehearsal")
    if real_before != real_after:
        hard_stops.append("real baseline approval or branch state changed during sandbox approval trial")

    return {
        "schema": "quipsly.audio-workbench.post-approval-sandbox-trial.v1",
        "sandboxDir": str(sandbox_baseline),
        "status": "approved-sandbox-ready" if not hard_stops else "approved-sandbox-needs-attention",
        "passed": not hard_stops,
        "realStateBefore": real_before,
        "realStateAfter": real_after,
        "realApprovalStatePreserved": real_before == real_after,
        "rendererDryRunStatus": renderer_payload.get("status") or "missing-json",
        "rendererDryRunBlocked": bool(renderer_payload.get("renderBlocked")),
        "rendererDryRunBlockerCount": len(renderer_blockers),
        "rendererMissingInputCount": len(renderer_missing),
        "rendererBranchCount": len(renderer_branches),
        "executorStatus": executor_payload.get("status"),
        "executorCanExecuteRealRenders": bool(executor_payload.get("canExecuteRealRenders")),
        "executorCommandsExposed": bool(executor_payload.get("commandsExposed")),
        "executorSourceAwareRenderContractReady": bool(executor_payload.get("sourceAwareRenderContractReady")),
        "executorInheritsSourceAwareAudioTruth": bool(executor_payload.get("inheritsSourceAwareAudioTruth")),
        "executorSourceAwareAudioContractStatus": executor_payload.get("sourceAwareAudioContractStatus"),
        "executorSourceAwareAudioRoleIds": executor_payload.get("sourceAwareAudioRoleIds") or [],
        "executorSourceAwareAudioReadyStemCount": int(executor_payload.get("sourceAwareAudioReadyStemCount") or 0),
        "executorMasteredSpineOnlyEditingAllowed": bool(executor_payload.get("masteredSpineOnlyEditingAllowed")),
        "executorRenderAttempted": bool(executor_payload.get("renderAttempted")),
        "executorUploadAttempted": bool(executor_payload.get("uploadAttempted")),
        "executorPublicationAttempted": bool(executor_payload.get("publicationAttempted")),
        "executorOriginalMediaMutated": bool(executor_payload.get("originalMediaMutated")),
        "executorPath": executor.get("executorPath"),
        "hardStopCount": len(hard_stops),
        "hardStops": hard_stops,
        "rendererDryRunStderrTail": renderer.get("stderrTail"),
        "executorDryRunStderrTail": executor.get("stderrTail"),
    }


def branch_summary(branches: list[dict[str, Any]]) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    for branch in branches:
        ranges = branch.get("ranges") if isinstance(branch.get("ranges"), list) else []
        chunk_summary = branch.get("chunkSummary") if isinstance(branch.get("chunkSummary"), dict) else {}
        rows.append(
            {
                "id": branch.get("id"),
                "label": BRANCH_LABELS.get(str(branch.get("id")), str(branch.get("title") or branch.get("id"))),
                "title": branch.get("title"),
                "target": branch.get("target"),
                "plannedDurationSeconds": branch.get("plannedDurationSeconds"),
                "plannedDurationMinutes": branch.get("plannedDurationMinutes"),
                "rangeCount": len(ranges),
                "chunkCount": int(chunk_summary.get("chunkCount") or 0),
                "blankGapSeconds": float(chunk_summary.get("blankGapSeconds") or 0.0),
                "referenceClipSeconds": float(chunk_summary.get("referenceClipSeconds") or 0.0),
                "sourceRoleSeconds": chunk_summary.get("sourceRoleSeconds") or {},
                "sourceIdSeconds": chunk_summary.get("sourceIdSeconds") or {},
                "usesWholeSourceChunks": bool(chunk_summary.get("usesWholeSourceChunks")),
                "chunkingRule": chunk_summary.get("chunkingRule"),
                "firstRange": ranges[0] if ranges else None,
                "lastRange": ranges[-1] if ranges else None,
            }
        )
    return rows


def build_report(baseline_dir: Path, output_root: str | None, sandbox_dir: Path) -> dict[str, Any]:
    manifest = read_json(baseline_dir / "manifest.json")
    outputs = manifest.get("outputs") if isinstance(manifest.get("outputs"), dict) else {}
    root = repo_root()
    dry = run_renderer_dry_run(root, baseline_dir, output_root)
    sandbox_trial = run_sandbox_approval_trial(root, baseline_dir, manifest, output_root, sandbox_dir)
    payload = dry.get("payload") if isinstance(dry.get("payload"), dict) else {}
    audio_baseline = payload.get("conformedProductionBaseline") if isinstance(payload.get("conformedProductionBaseline"), dict) else {}
    source_aware_contract = (
        audio_baseline.get("sourceAwareAudioContract")
        if isinstance(audio_baseline.get("sourceAwareAudioContract"), dict)
        else {}
    )
    branches = branch_summary(payload.get("branches") if isinstance(payload.get("branches"), list) else [])
    branch_chunk_count = sum(int(branch.get("chunkCount") or 0) for branch in branches)
    branch_blank_gap_seconds = round(sum(float(branch.get("blankGapSeconds") or 0.0) for branch in branches), 3)
    branch_reference_clip_seconds = round(sum(float(branch.get("referenceClipSeconds") or 0.0) for branch in branches), 3)
    branch_role_seconds: dict[str, float] = {}
    for branch in branches:
        role_seconds = branch.get("sourceRoleSeconds") if isinstance(branch.get("sourceRoleSeconds"), dict) else {}
        for role, seconds in role_seconds.items():
            branch_role_seconds[str(role)] = round(branch_role_seconds.get(str(role), 0.0) + float(seconds or 0.0), 3)
    audio_plan = payload.get("branchAudioPlan") if isinstance(payload.get("branchAudioPlan"), dict) else {}
    missing_inputs = payload.get("missingInputs") if isinstance(payload.get("missingInputs"), list) else []
    render_blockers = payload.get("renderBlockers") if isinstance(payload.get("renderBlockers"), list) else []
    approval_status = str(manifest.get("approvalStatus") or "")
    branch_inheritance_ready = bool(manifest.get("branchInheritanceReady"))
    branch_render_ready = bool(manifest.get("branchRenderReady"))
    expected_blocked = approval_status not in {"human-approved-for-branch-inheritance", "human-approved-for-publication"} or not branch_inheritance_ready or not branch_render_ready
    hard_stops: list[str] = []
    if not dry["stdoutParsed"]:
        hard_stops.append("Renderer dry-run did not return parseable JSON.")
    if missing_inputs:
        hard_stops.append(f"Renderer dry-run reports {len(missing_inputs)} missing input(s).")
    if not branches:
        hard_stops.append("Renderer dry-run returned no branch plans.")
    if not sandbox_trial.get("passed"):
        hard_stops.append("Approved-state sandbox trial did not prove post-approval render readiness.")
    if not audio_baseline.get("inheritsSourceAwareAudioTruth"):
        hard_stops.append("Renderer dry-run did not inherit source-aware audio truth.")
    if source_aware_contract.get("status") != "ready-source-aware-editable":
        hard_stops.append(f"Source-aware audio contract is not ready: {source_aware_contract.get('status')}")
    required_roles = {"charlie", "homer", "clip-source"}
    role_ids = {str(item) for item in source_aware_contract.get("roleIds") or []}
    missing_roles = sorted(required_roles - role_ids)
    if missing_roles:
        hard_stops.append("Renderer source-aware contract missing role(s): " + ", ".join(missing_roles))
    status = "post-approval-render-rehearsal-ready-blocked-as-expected"
    if hard_stops:
        status = "post-approval-render-rehearsal-needs-attention"
    elif not expected_blocked and bool(payload.get("renderBlocked")):
        status = "post-approval-render-rehearsal-unexpectedly-blocked"
    elif not expected_blocked:
        status = "post-approval-render-rehearsal-ready-after-approval"
    return {
        "schema": "quipsly.audio-workbench.post-approval-render-rehearsal.v1",
        "generatedAt": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "baselineId": manifest.get("baselineId"),
        "baselineDir": str(baseline_dir),
        "status": status,
        "approvalStatus": approval_status,
        "packageReadyForHumanListen": bool(manifest.get("packageReadyForHumanListen")),
        "branchInheritanceReady": branch_inheritance_ready,
        "branchRenderReady": branch_render_ready,
        "expectedBlockedUntilHumanListen": expected_blocked,
        "rendererDryRunStatus": payload.get("status") or "missing-json",
        "rendererDryRunReturncode": dry["returncode"],
        "rendererDryRunBlocked": bool(payload.get("renderBlocked")),
        "rendererDryRunBlockerCount": len(render_blockers),
        "rendererDryRunBlockers": render_blockers,
        "inheritsSourceAwareAudioTruth": bool(audio_baseline.get("inheritsSourceAwareAudioTruth")),
        "sourceAwareAudioContractStatus": source_aware_contract.get("status"),
        "sourceAwareAudioRoleIds": list(source_aware_contract.get("roleIds") or []),
        "sourceAwareAudioReadyStemCount": source_aware_contract.get("readyStemCount"),
        "sourceAwareAudioStemDurations": source_aware_contract.get("stemDurations") or {},
        "sourceAwareAudioRegistryPath": source_aware_contract.get("registryPath"),
        "sourceAwareAudioMasteredSpineUse": source_aware_contract.get("masteredSpineUse"),
        "sourceAwareAudioEditorTruthUse": source_aware_contract.get("editorTruthUse"),
        "branchAudioTruth": payload.get("branchAudioTruth") or audio_plan.get("branchAudioTruth"),
        "branchAudioWillUseSourceAwareStemsAfterApproval": bool(
            payload.get("branchAudioWillUseSourceAwareStemsAfterApproval")
            or audio_plan.get("branchAudioWillUseSourceAwareStemsAfterApproval")
        ),
        "branchAudioRenderedFromMasteredSpineOnly": bool(
            payload.get("branchAudioRenderedFromMasteredSpineOnly")
            or audio_plan.get("branchAudioRenderedFromMasteredSpineOnly")
        ),
        "branchMasteredSpineOnlyEditingAllowed": bool(
            payload.get("masteredSpineOnlyEditingAllowed")
            or audio_plan.get("masteredSpineOnlyEditingAllowed")
        ),
        "branchAudioPlan": audio_plan,
        "masteredSpineOnlyEditingAllowed": False,
        "approvedStateSandbox": sandbox_trial,
        "approvedStateSandboxStatus": sandbox_trial.get("status"),
        "approvedStateSandboxPassed": bool(sandbox_trial.get("passed")),
        "approvedStateSandboxRealApprovalStatePreserved": bool(sandbox_trial.get("realApprovalStatePreserved")),
        "approvedStateSandboxRendererDryRunStatus": sandbox_trial.get("rendererDryRunStatus"),
        "approvedStateSandboxRendererDryRunBlocked": bool(sandbox_trial.get("rendererDryRunBlocked")),
        "approvedStateSandboxRendererDryRunBlockerCount": int(sandbox_trial.get("rendererDryRunBlockerCount") or 0),
        "approvedStateSandboxRendererMissingInputCount": int(sandbox_trial.get("rendererMissingInputCount") or 0),
        "approvedStateSandboxRendererBranchCount": int(sandbox_trial.get("rendererBranchCount") or 0),
        "approvedStateSandboxExecutorStatus": sandbox_trial.get("executorStatus"),
        "approvedStateSandboxExecutorCanExecuteRealRenders": bool(sandbox_trial.get("executorCanExecuteRealRenders")),
        "approvedStateSandboxExecutorCommandsExposed": bool(sandbox_trial.get("executorCommandsExposed")),
        "approvedStateSandboxExecutorSourceAwareRenderContractReady": bool(sandbox_trial.get("executorSourceAwareRenderContractReady")),
        "approvedStateSandboxExecutorInheritsSourceAwareAudioTruth": bool(sandbox_trial.get("executorInheritsSourceAwareAudioTruth")),
        "approvedStateSandboxExecutorSourceAwareAudioContractStatus": sandbox_trial.get("executorSourceAwareAudioContractStatus"),
        "approvedStateSandboxExecutorSourceAwareAudioRoleIds": sandbox_trial.get("executorSourceAwareAudioRoleIds") or [],
        "approvedStateSandboxExecutorSourceAwareAudioReadyStemCount": int(sandbox_trial.get("executorSourceAwareAudioReadyStemCount") or 0),
        "approvedStateSandboxExecutorMasteredSpineOnlyEditingAllowed": bool(sandbox_trial.get("executorMasteredSpineOnlyEditingAllowed")),
        "approvedStateSandboxExecutorRenderAttempted": bool(sandbox_trial.get("executorRenderAttempted")),
        "approvedStateSandboxExecutorUploadAttempted": bool(sandbox_trial.get("executorUploadAttempted")),
        "approvedStateSandboxExecutorPublicationAttempted": bool(sandbox_trial.get("executorPublicationAttempted")),
        "approvedStateSandboxExecutorOriginalMediaMutated": bool(sandbox_trial.get("executorOriginalMediaMutated")),
        "missingInputCount": len(missing_inputs),
        "missingInputs": missing_inputs,
        "branchCount": len(branches),
        "branchChunkCount": branch_chunk_count,
        "branchBlankGapSeconds": branch_blank_gap_seconds,
        "branchReferenceClipSeconds": branch_reference_clip_seconds,
        "branchSourceRoleSeconds": dict(sorted(branch_role_seconds.items())),
        "branches": branches,
        "plannedOutputRoot": payload.get("outputRoot") or output_root,
        "audioSpine": file_summary(str(baseline_dir / "episode4-mastered-audio-spine-v006.wav")),
        "reviewDoors": {
            "morningAudioReview": existing_output(outputs, "latestAudioMorningAudioReviewLauncherHtml"),
            "humanDecisionFrontDoor": existing_output(outputs, "latestHumanListenDecisionFrontDoorHtml"),
            "postListenRunway": existing_output(outputs, "latestAudioPostListenEpisodeRunwayHtml"),
            "approvedBranchRenderExecutor": existing_output(outputs, "latestApprovedBranchRenderExecutorMarkdown"),
        },
        "nextSafeAction": "If v006 passes human listen, record guarded approval and refresh branch gates; then regenerate this rehearsal and use the guarded executor for real branch renders.",
        "dryRunCommandRedacted": dry["commandRedacted"],
        "dryRunStderrTail": dry["stderrTail"],
        "approvalStateChanged": False,
        "branchStateChanged": False,
        "renderAttempted": False,
        "branchRenderAttempted": False,
        "uploadAttempted": False,
        "publicationAttempted": False,
        "originalMediaMutated": False,
        "hardStopCount": len(hard_stops),
        "hardStops": hard_stops,
    }


def render_markdown(report: dict[str, Any]) -> str:
    lines = [
        f"# Episode 4 post-approval render rehearsal: {report['baselineId']}",
        "",
        f"- Status: `{report['status']}`",
        f"- Approval status: `{report['approvalStatus']}`",
        f"- Expected blocked until human listen: `{str(report['expectedBlockedUntilHumanListen']).lower()}`",
        f"- Renderer dry-run status: `{report['rendererDryRunStatus']}`",
        f"- Renderer dry-run blocked: `{str(report['rendererDryRunBlocked']).lower()}`",
        f"- Inherits source-aware audio truth: `{str(report['inheritsSourceAwareAudioTruth']).lower()}`",
        f"- Source-aware audio contract: `{report['sourceAwareAudioContractStatus']}`",
        f"- Source-aware roles: `{', '.join(report['sourceAwareAudioRoleIds'])}`",
        f"- Branch audio truth: `{report.get('branchAudioTruth')}`",
        f"- Source-aware stems after approval: `{str(report.get('branchAudioWillUseSourceAwareStemsAfterApproval')).lower()}`",
        f"- Branch audio rendered from mastered spine only: `{str(report.get('branchAudioRenderedFromMasteredSpineOnly')).lower()}`",
        f"- Approved sandbox status: `{report['approvedStateSandboxStatus']}`",
        f"- Approved sandbox passed: `{str(report['approvedStateSandboxPassed']).lower()}`",
        f"- Approved sandbox executor: `{report['approvedStateSandboxExecutorStatus']}`",
        f"- Branches planned: `{report['branchCount']}`",
        f"- Source chunks planned: `{report.get('branchChunkCount')}`",
        f"- Blank-gap seconds across branches: `{report.get('branchBlankGapSeconds')}`",
        f"- Reference-clip seconds across branches: `{report.get('branchReferenceClipSeconds')}`",
        f"- Missing inputs: `{report['missingInputCount']}`",
        f"- Hard stops: `{report['hardStopCount']}`",
        "",
        "This rehearsal uses the real Episode 4 renderer in dry-run mode. It does not expose executable render commands before approval and does not render, upload, publish, or mutate originals.",
        "",
        "## Planned branches after approval",
        "",
    ]
    for branch in report.get("branches") or []:
        lines.extend(
            [
                f"### {branch.get('id')} - {branch.get('label')}",
                "",
                f"- Title: {branch.get('title')}",
                f"- Target: {branch.get('target')}",
                f"- Planned duration: `{branch.get('plannedDurationMinutes')}` minutes",
                f"- Range count: `{branch.get('rangeCount')}`",
                f"- Source chunks: `{branch.get('chunkCount')}`",
                f"- Blank gaps: `{branch.get('blankGapSeconds')}s`",
                f"- Reference clip: `{branch.get('referenceClipSeconds')}s`",
                f"- Source role seconds: `{branch.get('sourceRoleSeconds')}`",
                f"- Whole-source chunking: `{str(bool(branch.get('usesWholeSourceChunks'))).lower()}`",
                "",
            ]
        )
    if report.get("rendererDryRunBlockers"):
        lines.extend(["## Expected blockers", ""])
        lines.extend(f"- {item}" for item in report["rendererDryRunBlockers"])
        lines.append("")
    sandbox = report.get("approvedStateSandbox") if isinstance(report.get("approvedStateSandbox"), dict) else {}
    lines.extend(
        [
            "## Approved-state sandbox trial",
            "",
            "This copies only manifest truth into a local sandbox, flips approval/branch fields there, and dry-runs the real renderer/executor. The real v006 manifest remains locked.",
            "",
            f"- Sandbox status: `{sandbox.get('status')}`",
            f"- Passed: `{str(bool(sandbox.get('passed'))).lower()}`",
            f"- Real approval state preserved: `{str(bool(sandbox.get('realApprovalStatePreserved'))).lower()}`",
            f"- Renderer dry-run status: `{sandbox.get('rendererDryRunStatus')}`",
            f"- Renderer blocked: `{str(bool(sandbox.get('rendererDryRunBlocked'))).lower()}`",
            f"- Renderer branches: `{sandbox.get('rendererBranchCount')}`",
            f"- Renderer missing inputs: `{sandbox.get('rendererMissingInputCount')}`",
            f"- Executor status: `{sandbox.get('executorStatus')}`",
            f"- Executor can execute after approval: `{str(bool(sandbox.get('executorCanExecuteRealRenders'))).lower()}`",
            f"- Executor commands exposed in sandbox: `{str(bool(sandbox.get('executorCommandsExposed'))).lower()}`",
            f"- Executor source-aware contract ready: `{str(bool(sandbox.get('executorSourceAwareRenderContractReady'))).lower()}`",
            f"- Executor source-aware contract: `{sandbox.get('executorSourceAwareAudioContractStatus')}`",
            f"- Executor source-aware roles: `{', '.join(sandbox.get('executorSourceAwareAudioRoleIds') or [])}`",
            f"- Executor mastered-spine-only allowed: `{str(bool(sandbox.get('executorMasteredSpineOnlyEditingAllowed'))).lower()}`",
            f"- Executor render attempted: `{str(bool(sandbox.get('executorRenderAttempted'))).lower()}`",
            "",
        ]
    )
    if sandbox.get("hardStops"):
        lines.extend(["### Sandbox hard stops", ""])
        lines.extend(f"- {item}" for item in sandbox["hardStops"])
        lines.append("")
    if report.get("missingInputs"):
        lines.extend(["## Missing inputs", ""])
        lines.extend(f"- `{item}`" for item in report["missingInputs"])
        lines.append("")
    lines.extend(
        [
            "## Review doors",
            "",
            f"- Morning audio review: `{report['reviewDoors'].get('morningAudioReview')}`",
            f"- Human decision front door: `{report['reviewDoors'].get('humanDecisionFrontDoor')}`",
            f"- Post-listen runway: `{report['reviewDoors'].get('postListenRunway')}`",
            f"- Guarded branch executor: `{report['reviewDoors'].get('approvedBranchRenderExecutor')}`",
            "",
            "## Guardrails",
            "",
            "- Approval state changed: `false`",
            "- Branch state changed: `false`",
            "- Render attempted: `false`",
            "- Branch render attempted: `false`",
            "- Upload attempted: `false`",
            "- Publication attempted: `false`",
            "- Original media mutated: `false`",
            "- Mastered spine only editing allowed: `false`",
            "- Branches inherit source-aware Charlie/Homer/clip-source stems plus metadata decisions before final mix/export.",
            "",
            "## Next safe action",
            "",
            report["nextSafeAction"],
            "",
        ]
    )
    return "\n".join(lines)


def render_html(report: dict[str, Any]) -> str:
    branches = "".join(
        f"""
        <article class=\"branch\">
          <div class=\"eyebrow\">{escape(str(branch.get('id')))}</div>
          <h2>{escape(str(branch.get('label')))}</h2>
          <p>{escape(str(branch.get('target')))}</p>
          <p><strong>{escape(str(branch.get('plannedDurationMinutes')))} min</strong> · {escape(str(branch.get('rangeCount')))} ranges · {escape(str(branch.get('chunkCount')))} chunks</p>
          <p>Gaps: <code>{escape(str(branch.get('blankGapSeconds')))}s</code> · Reference: <code>{escape(str(branch.get('referenceClipSeconds')))}s</code></p>
        </article>
        """
        for branch in report.get("branches") or []
    )
    blockers = "".join(f"<li>{escape(str(item))}</li>" for item in report.get("rendererDryRunBlockers") or []) or "<li>None</li>"
    missing = "".join(f"<li><code>{escape(str(item))}</code></li>" for item in report.get("missingInputs") or []) or "<li>None</li>"
    doors = "".join(
        f"<li><strong>{escape(str(key))}</strong><br><code>{escape(str(value or 'not registered'))}</code></li>"
        for key, value in report.get("reviewDoors", {}).items()
    )
    sandbox = report.get("approvedStateSandbox") if isinstance(report.get("approvedStateSandbox"), dict) else {}
    sandbox_items = "".join(f"<li>{escape(str(item))}</li>" for item in sandbox.get("hardStops", [])) or "<li>None</li>"
    return f"""<!doctype html>
<html lang=\"en\">
<head>
  <meta charset=\"utf-8\">
  <title>Episode 4 post-approval render rehearsal</title>
  <style>
    :root {{ color-scheme: dark; --bg:#111813; --panel:#1a281f; --ink:#f7ecd5; --muted:#b7aa8d; --gold:#f1c84b; --moss:#80c990; --clay:#d27452; --line:rgba(247,236,213,.16); }}
    body {{ margin:0; background:radial-gradient(circle at 8% 0%,rgba(128,201,144,.18),transparent 36rem),var(--bg); color:var(--ink); font:15px/1.5 -apple-system,BlinkMacSystemFont,\"Segoe UI\",sans-serif; }}
    main {{ width:min(1180px,calc(100vw - 48px)); margin:34px auto 70px; }}
    .hero,.panel,.branch {{ border:1px solid var(--line); border-radius:24px; background:linear-gradient(180deg,rgba(255,255,255,.04),rgba(0,0,0,.10)),var(--panel); padding:22px; box-shadow:0 24px 70px rgba(0,0,0,.26); }}
    h1 {{ font-size:clamp(34px,6vw,68px); line-height:.92; margin:.2em 0; }}
    .eyebrow {{ color:var(--gold); letter-spacing:.16em; text-transform:uppercase; font-size:12px; font-weight:900; }}
    .truth,.branches {{ display:grid; grid-template-columns:repeat(auto-fit,minmax(230px,1fr)); gap:12px; }}
    .pill {{ border:1px solid var(--line); border-radius:999px; padding:10px 13px; background:rgba(0,0,0,.18); color:var(--muted); }}
    .pill strong,.branch strong {{ color:var(--gold); }}
    .branch {{ margin-top:12px; }}
    code {{ color:var(--moss); word-break:break-all; }}
    li {{ margin:8px 0; }}
  </style>
</head>
<body>
<main>
  <section class=\"hero\">
    <div class=\"eyebrow\">Quipsly Audio Workbench</div>
    <h1>Post-approval render rehearsal</h1>
    <p>This is a dry-run plan for what happens after the v006 audio spine passes human listen. It does not render or publish.</p>
    <div class=\"truth\">
      <div class=\"pill\"><strong>Status</strong> {escape(report['status'])}</div>
      <div class=\"pill\"><strong>Dry run</strong> {escape(report['rendererDryRunStatus'])}</div>
      <div class=\"pill\"><strong>Source audio</strong> {escape(str(report['sourceAwareAudioContractStatus']))}</div>
      <div class=\"pill\"><strong>Branch audio</strong> {escape(str(report.get('branchAudioTruth') or 'unknown'))}</div>
      <div class=\"pill\"><strong>Stem roles</strong> {escape(', '.join(report['sourceAwareAudioRoleIds']))}</div>
      <div class=\"pill\"><strong>Branches</strong> {report['branchCount']}</div>
      <div class=\"pill\"><strong>Chunks</strong> {escape(str(report.get('branchChunkCount')))}</div>
      <div class=\"pill\"><strong>Blank gaps</strong> {escape(str(report.get('branchBlankGapSeconds')))}s</div>
      <div class=\"pill\"><strong>Missing</strong> {report['missingInputCount']}</div>
      <div class=\"pill\"><strong>Approved sandbox</strong> {escape(str(sandbox.get('status') or 'unknown'))}</div>
      <div class=\"pill\"><strong>Executor</strong> {escape(str(sandbox.get('executorStatus') or 'unknown'))}</div>
    </div>
  </section>
  <section>
    <h2>Planned branches</h2>
    <div class=\"branches\">{branches}</div>
  </section>
  <section class=\"panel\"><h2>Expected blockers</h2><ul>{blockers}</ul></section>
  <section class=\"panel\"><h2>Approved-state sandbox</h2><p>This proves what should happen after human approval without changing real v006 approval truth.</p><ul>
    <li>Passed: <code>{escape(str(bool(sandbox.get('passed'))).lower())}</code></li>
    <li>Real state preserved: <code>{escape(str(bool(sandbox.get('realApprovalStatePreserved'))).lower())}</code></li>
    <li>Renderer status: <code>{escape(str(sandbox.get('rendererDryRunStatus') or 'unknown'))}</code></li>
    <li>Renderer blocked: <code>{escape(str(bool(sandbox.get('rendererDryRunBlocked'))).lower())}</code></li>
    <li>Renderer branches: <code>{escape(str(sandbox.get('rendererBranchCount') or 0))}</code></li>
    <li>Executor status: <code>{escape(str(sandbox.get('executorStatus') or 'unknown'))}</code></li>
    <li>Executor commands exposed: <code>{escape(str(bool(sandbox.get('executorCommandsExposed'))).lower())}</code></li>
    <li>Executor source-aware contract: <code>{escape(str(sandbox.get('executorSourceAwareAudioContractStatus') or 'unknown'))}</code></li>
    <li>Executor source-aware roles: <code>{escape(', '.join(sandbox.get('executorSourceAwareAudioRoleIds') or []))}</code></li>
    <li>Executor mastered-spine-only allowed: <code>{escape(str(bool(sandbox.get('executorMasteredSpineOnlyEditingAllowed'))).lower())}</code></li>
    <li>Executor render attempted: <code>{escape(str(bool(sandbox.get('executorRenderAttempted'))).lower())}</code></li>
  </ul><h3>Sandbox hard stops</h3><ul>{sandbox_items}</ul></section>
  <section class=\"panel\"><h2>Missing inputs</h2><ul>{missing}</ul></section>
  <section class=\"panel\"><h2>Review doors</h2><ul>{doors}</ul></section>
  <section class=\"panel\"><h2>Next safe action</h2><p>{escape(report['nextSafeAction'])}</p></section>
</main>
</body>
</html>
"""


def write_open_command(path: Path, html_path: Path) -> None:
    path.write_text(f"#!/bin/zsh\nopen {shell_quote(str(html_path))}\n", encoding="utf-8")
    path.chmod(0o755)


def update_manifest(baseline_dir: Path, report: dict[str, Any], paths: dict[str, Path]) -> None:
    manifest_path = baseline_dir / "manifest.json"
    manifest = read_json(manifest_path)
    outputs = manifest.setdefault("outputs", {})
    outputs["latestAudioPostApprovalRenderRehearsal"] = str(paths["json"])
    outputs["latestAudioPostApprovalRenderRehearsalMarkdown"] = str(paths["markdown"])
    outputs["latestAudioPostApprovalRenderRehearsalHtml"] = str(paths["html"])
    outputs["latestAudioPostApprovalRenderRehearsalOpenCommand"] = str(paths["open"])
    history = outputs.setdefault("audioPostApprovalRenderRehearsals", [])
    if isinstance(history, list):
        history.append(str(paths["json"]))
        history[:] = history[-20:]
    manifest["audioPostApprovalRenderRehearsalLatestStatus"] = report["status"]
    manifest["audioPostApprovalRenderRehearsalBranchCount"] = report["branchCount"]
    manifest["audioPostApprovalRenderRehearsalBranchChunkCount"] = report["branchChunkCount"]
    manifest["audioPostApprovalRenderRehearsalBranchBlankGapSeconds"] = report["branchBlankGapSeconds"]
    manifest["audioPostApprovalRenderRehearsalBranchReferenceClipSeconds"] = report["branchReferenceClipSeconds"]
    manifest["audioPostApprovalRenderRehearsalBranchSourceRoleSeconds"] = report["branchSourceRoleSeconds"]
    manifest["audioPostApprovalRenderRehearsalMissingInputCount"] = report["missingInputCount"]
    manifest["audioPostApprovalRenderRehearsalHardStopCount"] = report["hardStopCount"]
    manifest["audioPostApprovalRenderRehearsalExpectedBlockedUntilHumanListen"] = report["expectedBlockedUntilHumanListen"]
    manifest["audioPostApprovalRenderRehearsalRendererDryRunStatus"] = report["rendererDryRunStatus"]
    manifest["audioPostApprovalRenderRehearsalRendererDryRunBlocked"] = report["rendererDryRunBlocked"]
    manifest["audioPostApprovalRenderRehearsalRendererDryRunBlockerCount"] = report["rendererDryRunBlockerCount"]
    manifest["audioPostApprovalRenderRehearsalInheritsSourceAwareAudioTruth"] = report["inheritsSourceAwareAudioTruth"]
    manifest["audioPostApprovalRenderRehearsalSourceAwareAudioContractStatus"] = report["sourceAwareAudioContractStatus"]
    manifest["audioPostApprovalRenderRehearsalSourceAwareAudioRoleIds"] = report["sourceAwareAudioRoleIds"]
    manifest["audioPostApprovalRenderRehearsalSourceAwareAudioReadyStemCount"] = report["sourceAwareAudioReadyStemCount"]
    manifest["audioPostApprovalRenderRehearsalBranchAudioTruth"] = report["branchAudioTruth"]
    manifest["audioPostApprovalRenderRehearsalBranchAudioWillUseSourceAwareStemsAfterApproval"] = report[
        "branchAudioWillUseSourceAwareStemsAfterApproval"
    ]
    manifest["audioPostApprovalRenderRehearsalBranchAudioRenderedFromMasteredSpineOnly"] = report[
        "branchAudioRenderedFromMasteredSpineOnly"
    ]
    manifest["audioPostApprovalRenderRehearsalBranchMasteredSpineOnlyEditingAllowed"] = report[
        "branchMasteredSpineOnlyEditingAllowed"
    ]
    manifest["audioPostApprovalRenderRehearsalMasteredSpineOnlyEditingAllowed"] = False
    manifest["audioPostApprovalRenderRehearsalApprovedSandboxStatus"] = report["approvedStateSandboxStatus"]
    manifest["audioPostApprovalRenderRehearsalApprovedSandboxPassed"] = report["approvedStateSandboxPassed"]
    manifest["audioPostApprovalRenderRehearsalApprovedSandboxRealApprovalStatePreserved"] = report["approvedStateSandboxRealApprovalStatePreserved"]
    manifest["audioPostApprovalRenderRehearsalApprovedSandboxRendererDryRunStatus"] = report["approvedStateSandboxRendererDryRunStatus"]
    manifest["audioPostApprovalRenderRehearsalApprovedSandboxRendererDryRunBlocked"] = report["approvedStateSandboxRendererDryRunBlocked"]
    manifest["audioPostApprovalRenderRehearsalApprovedSandboxRendererDryRunBlockerCount"] = report["approvedStateSandboxRendererDryRunBlockerCount"]
    manifest["audioPostApprovalRenderRehearsalApprovedSandboxRendererMissingInputCount"] = report["approvedStateSandboxRendererMissingInputCount"]
    manifest["audioPostApprovalRenderRehearsalApprovedSandboxRendererBranchCount"] = report["approvedStateSandboxRendererBranchCount"]
    manifest["audioPostApprovalRenderRehearsalApprovedSandboxExecutorStatus"] = report["approvedStateSandboxExecutorStatus"]
    manifest["audioPostApprovalRenderRehearsalApprovedSandboxExecutorCanExecuteRealRenders"] = report["approvedStateSandboxExecutorCanExecuteRealRenders"]
    manifest["audioPostApprovalRenderRehearsalApprovedSandboxExecutorCommandsExposed"] = report["approvedStateSandboxExecutorCommandsExposed"]
    manifest["audioPostApprovalRenderRehearsalApprovedSandboxExecutorSourceAwareRenderContractReady"] = report["approvedStateSandboxExecutorSourceAwareRenderContractReady"]
    manifest["audioPostApprovalRenderRehearsalApprovedSandboxExecutorInheritsSourceAwareAudioTruth"] = report["approvedStateSandboxExecutorInheritsSourceAwareAudioTruth"]
    manifest["audioPostApprovalRenderRehearsalApprovedSandboxExecutorSourceAwareAudioContractStatus"] = report["approvedStateSandboxExecutorSourceAwareAudioContractStatus"]
    manifest["audioPostApprovalRenderRehearsalApprovedSandboxExecutorSourceAwareAudioRoleIds"] = report["approvedStateSandboxExecutorSourceAwareAudioRoleIds"]
    manifest["audioPostApprovalRenderRehearsalApprovedSandboxExecutorSourceAwareAudioReadyStemCount"] = report["approvedStateSandboxExecutorSourceAwareAudioReadyStemCount"]
    manifest["audioPostApprovalRenderRehearsalApprovedSandboxExecutorMasteredSpineOnlyEditingAllowed"] = report["approvedStateSandboxExecutorMasteredSpineOnlyEditingAllowed"]
    manifest["audioPostApprovalRenderRehearsalApprovedSandboxExecutorRenderAttempted"] = report["approvedStateSandboxExecutorRenderAttempted"]
    manifest["audioPostApprovalRenderRehearsalApprovedSandboxExecutorUploadAttempted"] = report["approvedStateSandboxExecutorUploadAttempted"]
    manifest["audioPostApprovalRenderRehearsalApprovedSandboxExecutorPublicationAttempted"] = report["approvedStateSandboxExecutorPublicationAttempted"]
    manifest["audioPostApprovalRenderRehearsalApprovedSandboxExecutorOriginalMediaMutated"] = report["approvedStateSandboxExecutorOriginalMediaMutated"]
    manifest["audioPostApprovalRenderRehearsalApprovalStateChanged"] = False
    manifest["audioPostApprovalRenderRehearsalBranchStateChanged"] = False
    manifest["audioPostApprovalRenderRehearsalRenderAttempted"] = False
    manifest["audioPostApprovalRenderRehearsalBranchRenderAttempted"] = False
    manifest["audioPostApprovalRenderRehearsalUploadAttempted"] = False
    manifest["audioPostApprovalRenderRehearsalPublicationAttempted"] = False
    manifest["audioPostApprovalRenderRehearsalOriginalMediaMutated"] = False
    write_json(manifest_path, manifest)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--baseline-dir", required=True)
    parser.add_argument("--output-root", default=None)
    args = parser.parse_args()
    baseline_dir = Path(args.baseline_dir).expanduser().resolve()
    stamp = datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S")
    initial_manifest = read_json(baseline_dir / "manifest.json")
    slug = safe_slug(initial_manifest.get("baselineId") or "episode-4")
    versioned_dir = baseline_dir / f"audio-post-approval-render-rehearsal-{slug}-{stamp}"
    versioned_dir.mkdir(parents=True, exist_ok=True)
    report = build_report(baseline_dir, args.output_root, versioned_dir / "approved-state-sandbox")
    paths = {
        "json": baseline_dir / f"{OUTPUT_STEM}.json",
        "markdown": baseline_dir / f"{OUTPUT_STEM}.md",
        "html": baseline_dir / f"{OUTPUT_STEM}.html",
        "open": baseline_dir / f"OPEN_{OUTPUT_STEM}.command",
    }
    versioned = {
        "json": versioned_dir / "post-approval-render-rehearsal.json",
        "markdown": versioned_dir / "post-approval-render-rehearsal.md",
        "html": versioned_dir / "post-approval-render-rehearsal.html",
        "open": versioned_dir / "open-post-approval-render-rehearsal.command",
    }
    for path in (paths["json"], versioned["json"]):
        write_json(path, report)
    md = render_markdown(report)
    for path in (paths["markdown"], versioned["markdown"]):
        path.write_text(md, encoding="utf-8")
    html = render_html(report)
    for path in (paths["html"], versioned["html"]):
        path.write_text(html, encoding="utf-8")
    write_open_command(paths["open"], paths["html"])
    write_open_command(versioned["open"], versioned["html"])
    update_manifest(baseline_dir, report, paths)
    print(json.dumps({"status": report["status"], "branchCount": report["branchCount"], "missingInputCount": report["missingInputCount"], "html": str(paths["html"])}, indent=2))


if __name__ == "__main__":
    main()
