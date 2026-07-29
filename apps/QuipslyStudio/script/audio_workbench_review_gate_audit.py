#!/usr/bin/env python3
"""Audit the Episode audio review gate as one control plane.

This script checks that the manifest, status board, smoke report, handoff index,
and core review artifacts agree about the current state. It is deliberately not
an approval tool.

It does not approve audio, fail audio, render branches, upload files, or mutate
original media. It only registers an audit report on the manifest.
"""

from __future__ import annotations

import argparse
import json
import os
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


@dataclass(frozen=True)
class Check:
    name: str
    passed: bool
    severity: str
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
    raise FileNotFoundError(
        "Could not find manifest.json at "
        f"{input_path}/manifest.json or {nested}/manifest.json"
    )


def output_path(value: Any) -> str | None:
    if isinstance(value, str):
        return value
    if isinstance(value, dict):
        path = value.get("path")
        if isinstance(path, str):
            return path
    return None


def safe_slug(value: str) -> str:
    out = "".join(ch.lower() if ch.isalnum() else "-" for ch in value)
    while "--" in out:
        out = out.replace("--", "-")
    return out.strip("-") or "audio-baseline"


def path_exists(path: str | None) -> bool:
    return bool(path) and Path(path).exists()


def path_size(path: str | None) -> int:
    if not path_exists(path):
        return 0
    return Path(path or "").stat().st_size


def first_open_target(path: str | None) -> str | None:
    if not path_exists(path):
        return None
    for line in Path(path or "").read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if line.startswith("open "):
            return line
    return None


def iter_output_paths(value: Any) -> list[str]:
    if isinstance(value, str):
        return [value]
    if isinstance(value, dict):
        path = value.get("path")
        return [path] if isinstance(path, str) else []
    if isinstance(value, list):
        paths: list[str] = []
        for item in value:
            paths.extend(iter_output_paths(item))
        return paths
    return []


def add_check(checks: list[Check], name: str, passed: bool, detail: str, severity: str = "error") -> None:
    checks.append(Check(name=name, passed=passed, detail=detail, severity=severity))


def check_artifact(checks: list[Check], outputs: dict[str, Any], key: str, label: str) -> str | None:
    path = output_path(outputs.get(key))
    exists = path_exists(path)
    add_check(
        checks,
        f"artifact:{key}",
        exists and path_size(path) > 0,
        f"{label}: {path or 'not registered'}",
    )
    return path


def render_markdown(report: dict[str, Any]) -> str:
    lines = [
        f"# Audio Review Gate Audit: {report['baselineId']}",
        "",
        f"Generated: `{report['generatedAt']}`",
        "",
        "This audit checks the review-control plane. It does not approve audio, fail audio, render branches, upload files, or mutate source media.",
        "",
        "## Summary",
        "",
        f"- Passed: `{str(report['passed']).lower()}`",
        f"- Error count: `{report['errorCount']}`",
        f"- Warning count: `{report['warningCount']}`",
        f"- Approval status: `{report['approvalStatus']}`",
        f"- Branch inheritance ready: `{str(report['branchInheritanceReady']).lower()}`",
        f"- Branch render ready: `{str(report['branchRenderReady']).lower()}`",
        f"- Package ready for human listen: `{str(report['packageReadyForHumanListen']).lower()}`",
        "",
        "## Gate interpretation",
        "",
        report["gateInterpretation"],
        "",
        "## Checks",
        "",
        "| Check | Severity | Passed | Detail |",
        "|---|---:|---:|---|",
    ]
    for check in report["checks"]:
        lines.append(
            f"| {check['name']} | `{check['severity']}` | `{str(check['passed']).lower()}` | {check['detail']} |"
        )
    lines.extend(
        [
            "",
            "## Guardrail",
            "",
            "If this audit passes, the review package is internally coherent. It still is not human approval. The branch gate remains locked until a real human listen decision is recorded through the guarded path.",
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
    manifest = read_json(manifest_path)
    outputs = manifest.setdefault("outputs", {})
    baseline_id = str(manifest.get("baselineId") or "audio-baseline")
    slug = safe_slug(baseline_id.replace("episode-4-conformed-production-baseline-", ""))
    generated_at = datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S")
    generated_iso = datetime.now(timezone.utc).isoformat()

    checks: list[Check] = []
    approval_status = str(manifest.get("approvalStatus") or "")
    branch_inheritance_ready = bool(manifest.get("branchInheritanceReady"))
    branch_render_ready = bool(manifest.get("branchRenderReady"))
    package_ready = bool(manifest.get("packageReadyForHumanListen"))
    human_approved = approval_status in {
        "human-approved-for-branch-inheritance",
        "human-approved-for-publication",
    }

    add_check(
        checks,
        "package-ready-for-human-listen",
        package_ready,
        f"packageReadyForHumanListen={package_ready}",
    )
    add_check(
        checks,
        "pending-audio-keeps-branch-inheritance-locked",
        human_approved or not branch_inheritance_ready,
        f"approvalStatus={approval_status}; branchInheritanceReady={branch_inheritance_ready}",
    )
    add_check(
        checks,
        "pending-audio-keeps-branch-render-locked",
        human_approved or not branch_render_ready,
        f"approvalStatus={approval_status}; branchRenderReady={branch_render_ready}",
    )

    required_artifacts = [
        ("masterWav", "handoff WAV"),
        ("masterM4a", "listening M4A"),
        ("latestAudioReviewStartHereMarkdown", "stable START_HERE markdown"),
        ("latestAudioReviewStartHereOpenCommand", "stable START_HERE open command"),
        ("latestAudioReviewStatusBoardStableMarkdown", "stable status board"),
        ("latestAudioReviewStatusCheckCommand", "stable status check command"),
        ("latestAudioReviewStatusBoardSmokeMarkdown", "status board smoke"),
        ("latestReviewHandoffIndexMarkdown", "latest handoff index"),
        ("latestReviewReadinessVerificationMarkdown", "readiness verification"),
        ("latestAudioProducerCommandCenterMarkdown", "producer command center"),
        ("latestAudioProducerCommandCenterHtml", "producer command center HTML"),
        ("latestAudioProducerCommandCenterOpenCommand", "producer command center open command"),
        ("latestAudioRunwayStateMarkdown", "audio runway state"),
        ("latestAudioRunwayStateHtml", "audio runway state HTML"),
        ("latestAudioRunwayStateOpenCommand", "audio runway state open command"),
        ("latestAudioListenProofCoverageMapMarkdown", "listen proof coverage map"),
        ("latestAudioListenProofCoverageMapHtml", "listen proof coverage map HTML"),
        ("latestAudioListenProofCoverageMapOpenCommand", "listen proof coverage map open command"),
        ("latestAudioHumanApprovalPreflightMarkdown", "human approval preflight"),
        ("latestAudioHumanApprovalPreflightHtml", "human approval preflight HTML"),
        ("latestAudioHumanApprovalPreflightOpenCommand", "human approval preflight open command"),
        ("latestHumanListenDecisionFrontDoorMarkdown", "human listen decision front door"),
        ("latestHumanListenDecisionFrontDoorHtml", "human listen decision front door HTML"),
        ("latestHumanListenDecisionFrontDoorOpenCommand", "human listen decision front door open command"),
        ("latestHumanListenDecisionFrontDoorSmokeMarkdown", "human listen decision front-door smoke"),
        ("latestAudioUnresolvedRequirementReviewMarkdown", "unresolved requirement review"),
        ("latestAudioUnresolvedRequirementReviewHtml", "unresolved requirement review HTML"),
        ("latestAudioUnresolvedRequirementReviewOpenCommand", "unresolved requirement review open command"),
        ("latestAudioProductionDoctrineMarkdown", "audio production doctrine"),
        ("latestAudioProductionDoctrineHtml", "audio production doctrine HTML"),
        ("latestAudioProductionDoctrineOpenCommand", "audio production doctrine open command"),
        ("latestAudioTransformationLineageLedgerMarkdown", "audio transformation lineage ledger"),
        ("latestAudioTransformationLineageLedgerHtml", "audio transformation lineage ledger HTML"),
        ("latestAudioTransformationLineageLedgerOpenCommand", "audio transformation lineage ledger open command"),
        ("latestAudioTransformationLineageLedgerSmokeMarkdown", "audio transformation lineage ledger smoke"),
        ("latestAudioTransformationLineageLedgerSmokeOpenCommand", "audio transformation lineage ledger smoke open command"),
        ("latestAudioManifestReadbackConsistencySmokeMarkdown", "manifest readback consistency smoke"),
        ("latestAudioManifestReadbackConsistencySmokeOpenCommand", "manifest readback consistency smoke open command"),
        ("latestAudioStudioSoundControlRoomMarkdown", "studio sound control room"),
        ("latestAudioStudioSoundControlRoomHtml", "studio sound control room HTML"),
        ("latestAudioStudioSoundControlRoomOpenCommand", "studio sound control room open command"),
        ("latestAudioStudioSoundNotesTemplate", "studio sound notes template"),
        ("latestAudioStudioSoundNotesInboxMarkdown", "studio sound notes inbox"),
        ("latestAudioStudioSoundNotesInboxSmokeMarkdown", "studio sound notes inbox smoke"),
        ("latestAudioStudioSoundRepairPlannerMarkdown", "studio sound repair planner"),
        ("latestAudioStudioSoundRepairPlannerHtml", "studio sound repair planner HTML"),
        ("latestAudioStudioSoundRepairPlannerOpenCommand", "studio sound repair planner open command"),
        ("latestAudioStudioSoundRepairPlannerSmokeMarkdown", "studio sound repair planner smoke"),
        ("latestAudioHumanListenMissionBoardMarkdown", "human listen mission board"),
        ("latestAudioHumanListenMissionBoardHtml", "human listen mission board HTML"),
        ("latestAudioHumanListenMissionBoardOpenCommand", "human listen mission board open command"),
        ("latestAudioHumanListenMissionReelMarkdown", "human listen mission reel"),
        ("latestAudioHumanListenMissionReelHtml", "human listen mission reel HTML"),
        ("latestAudioHumanListenMissionReelM4a", "human listen mission reel M4A"),
        ("latestAudioHumanListenMissionReelOpenCommand", "human listen mission reel open command"),
        ("latestAudioHumanListenMissionReelNotesTemplate", "human listen mission reel notes template"),
        ("latestAudioHumanListenMissionReelNotesTemplateMarkdown", "human listen mission reel notes template Markdown"),
        ("latestAudioHumanListenMissionReelNotesInboxMarkdown", "human listen mission reel notes inbox"),
        ("latestAudioHumanListenMissionReelNotesInboxSmokeMarkdown", "human listen mission reel notes inbox smoke"),
        ("latestAudioPostReviewActionQueueMarkdown", "post-review action queue"),
        ("latestSpeakerCleanupTriageBoardMarkdown", "speaker cleanup triage board"),
        ("latestSpeakerCleanupTriageBoardHtml", "speaker cleanup triage board HTML"),
        ("latestSpeakerCleanupTriageBoardOpenCommand", "speaker cleanup triage board open command"),
        ("latestSpeakerCleanupAcceptanceBoardMarkdown", "speaker cleanup acceptance board"),
        ("latestSpeakerCleanupAcceptanceBoardHtml", "speaker cleanup acceptance board HTML"),
        ("latestSpeakerCleanupAcceptanceBoardOpenCommand", "speaker cleanup acceptance board open command"),
        ("latestSpeakerCleanupTriageNotesInboxMarkdown", "speaker cleanup triage notes inbox"),
        ("latestSpeakerCleanupTriageNotesInboxSmokeMarkdown", "speaker cleanup triage notes inbox smoke"),
        ("latestEditorMarkerReviewConsoleHtml", "marker review console"),
        ("latestMarkerReviewNotesInboxMarkdown", "marker review notes inbox"),
        ("latestMarkerReviewNotesInboxSmokeMarkdown", "marker review notes inbox smoke"),
        ("latestReviewerNotesTemplateMarkdown", "reviewer notes template"),
        ("latestReviewerNotesTemplateHtml", "reviewer notes template HTML"),
        ("latestReviewerNotesTemplateOpenCommand", "reviewer notes template open command"),
        ("latestBranchInheritanceGateMarkdown", "branch inheritance gate"),
        ("latestBranchInheritanceGateHtml", "branch inheritance gate HTML"),
        ("latestBranchInheritanceGateOpenCommand", "branch inheritance gate open command"),
        ("branchRenderPreflightMarkdown", "branch render preflight"),
        ("branchRenderPreflightHtml", "branch render preflight HTML"),
        ("branchRenderPreflightOpenCommand", "branch render preflight open command"),
        ("latestApprovalPathSmokeMarkdown", "approval-path sandbox smoke"),
        ("latestApprovalPathSmokeOpenCommand", "approval-path sandbox smoke open command"),
        ("latestReviewerNotesDecisionBridgeSmokeMarkdown", "reviewer notes decision bridge smoke"),
        ("latestPostListenOutcomeRouterSmokeMarkdown", "post-listen outcome router smoke"),
        ("latestBleedRepairExecutorSmokeMarkdown", "bleed repair executor smoke"),
        ("latestListenDecisionMatrixMarkdown", "listen decision matrix"),
        ("latestProofWindowAudioLabMarkdown", "proof-window audio lab"),
    ]
    paths: dict[str, str | None] = {}
    for key, label in required_artifacts:
        paths[key] = check_artifact(checks, outputs, key, label)

    triage_inbox_path = output_path(outputs.get("latestSpeakerCleanupTriageNotesInbox"))
    triage_inbox = read_json(Path(triage_inbox_path)) if path_exists(triage_inbox_path) else {}
    triage_inbox_candidate_count = int(triage_inbox.get("matchingCandidateCount") or 0) if triage_inbox else 0
    triage_inbox_dry_run_ok = bool((triage_inbox.get("decisionDryRun") or {}).get("ok")) if triage_inbox else False
    triage_inbox_flags_safe = bool(triage_inbox) and all(
        triage_inbox.get(key) is False
        for key in (
            "approvalStateChanged",
            "branchStateChanged",
            "renderAttempted",
            "uploadAttempted",
            "publicationAttempted",
            "originalMediaMutated",
        )
    )
    add_check(
        checks,
        "speaker-cleanup-triage-notes-inbox-safe",
        triage_inbox_flags_safe and (triage_inbox_candidate_count == 0 or triage_inbox_dry_run_ok),
        f"candidateCount={triage_inbox_candidate_count}; dryRunOk={triage_inbox_dry_run_ok}; safeFlags={triage_inbox_flags_safe}",
    )

    triage_inbox_smoke_path = output_path(outputs.get("latestSpeakerCleanupTriageNotesInboxSmoke"))
    triage_inbox_smoke = read_json(Path(triage_inbox_smoke_path)) if path_exists(triage_inbox_smoke_path) else {}
    triage_inbox_smoke_passed = bool(triage_inbox_smoke.get("passed"))
    triage_inbox_smoke_scenarios = int(triage_inbox_smoke.get("scenarioCount") or 0) if triage_inbox_smoke else 0
    triage_inbox_smoke_failures = int(triage_inbox_smoke.get("failureCount") or 0) if triage_inbox_smoke else 0
    triage_inbox_smoke_flags_safe = bool(triage_inbox_smoke) and all(
        triage_inbox_smoke.get(key) is False
        for key in (
            "approvalStateChanged",
            "branchStateChanged",
            "renderAttempted",
            "uploadAttempted",
            "publicationAttempted",
            "originalMediaMutated",
        )
    )
    add_check(
        checks,
        "speaker-cleanup-triage-notes-inbox-smoke-passed",
        triage_inbox_smoke_passed and triage_inbox_smoke_scenarios >= 5 and triage_inbox_smoke_failures == 0 and triage_inbox_smoke_flags_safe,
        f"passed={triage_inbox_smoke_passed}; scenarios={triage_inbox_smoke_scenarios}; failures={triage_inbox_smoke_failures}; safeFlags={triage_inbox_smoke_flags_safe}",
    )

    studio_sound_path = output_path(outputs.get("latestAudioStudioSoundControlRoom"))
    studio_sound = read_json(Path(studio_sound_path)) if path_exists(studio_sound_path) else {}
    studio_status = studio_sound.get("status")
    studio_windows = int(studio_sound.get("windowCount") or 0) if studio_sound else 0
    studio_snippets = int(studio_sound.get("snippetRenderOkCount") or 0) if studio_sound else 0
    studio_branch_safe = bool(studio_sound) and all(
        studio_sound.get(key) is False
        for key in (
            "approvalStateChanged",
            "branchStateChanged",
            "branchRenderAttempted",
            "uploadAttempted",
            "publicationAttempted",
            "originalMediaMutated",
        )
    )
    add_check(
        checks,
        "studio-sound-control-room-ready",
        studio_status == "ready-for-studio-sound-review" and studio_windows > 0 and studio_snippets > 0 and studio_branch_safe,
        f"status={studio_status}; windows={studio_windows}; snippets={studio_snippets}; branchSafe={studio_branch_safe}",
    )

    studio_notes_inbox_path = output_path(outputs.get("latestAudioStudioSoundNotesInbox"))
    studio_notes_inbox = read_json(Path(studio_notes_inbox_path)) if path_exists(studio_notes_inbox_path) else {}
    studio_notes_candidate_count = int(studio_notes_inbox.get("matchingCandidateCount") or 0) if studio_notes_inbox else 0
    studio_notes_safe = bool(studio_notes_inbox) and all(
        studio_notes_inbox.get(key) is False
        for key in (
            "approvalStateChanged",
            "branchStateChanged",
            "renderAttempted",
            "uploadAttempted",
            "publicationAttempted",
            "originalMediaMutated",
        )
    )
    add_check(
        checks,
        "studio-sound-notes-inbox-safe",
        studio_notes_safe,
        f"candidateCount={studio_notes_candidate_count}; decision={studio_notes_inbox.get('studioSoundDecision') if studio_notes_inbox else 'n/a'}; safeFlags={studio_notes_safe}",
    )

    studio_notes_smoke_path = output_path(outputs.get("latestAudioStudioSoundNotesInboxSmoke"))
    studio_notes_smoke = read_json(Path(studio_notes_smoke_path)) if path_exists(studio_notes_smoke_path) else {}
    studio_notes_smoke_passed = bool(studio_notes_smoke.get("passed"))
    studio_notes_smoke_scenarios = int(studio_notes_smoke.get("scenarioCount") or 0) if studio_notes_smoke else 0
    studio_notes_smoke_failures = int(studio_notes_smoke.get("failureCount") or 0) if studio_notes_smoke else 0
    studio_notes_smoke_safe = bool(studio_notes_smoke) and all(
        studio_notes_smoke.get(key) is False
        for key in (
            "approvalStateChanged",
            "branchStateChanged",
            "renderAttempted",
            "branchRenderAttempted",
            "uploadAttempted",
            "publicationAttempted",
            "originalMediaMutated",
        )
    )
    add_check(
        checks,
        "studio-sound-notes-inbox-smoke-passed",
        studio_notes_smoke_passed and studio_notes_smoke_scenarios >= 5 and studio_notes_smoke_failures == 0 and studio_notes_smoke_safe,
        f"passed={studio_notes_smoke_passed}; scenarios={studio_notes_smoke_scenarios}; failures={studio_notes_smoke_failures}; safeFlags={studio_notes_smoke_safe}",
    )

    studio_planner_path = output_path(outputs.get("latestAudioStudioSoundRepairPlanner"))
    studio_planner = read_json(Path(studio_planner_path)) if path_exists(studio_planner_path) else {}
    studio_planner_status = studio_planner.get("status")
    studio_planner_actions = int(studio_planner.get("actionCount") or 0) if studio_planner else 0
    studio_planner_safe = bool(studio_planner) and all(
        studio_planner.get(key) is False
        for key in (
            "approvalStateChanged",
            "branchStateChanged",
            "renderAttempted",
            "branchRenderAttempted",
            "uploadAttempted",
            "publicationAttempted",
            "originalMediaMutated",
        )
    )
    add_check(
        checks,
        "studio-sound-repair-planner-safe",
        studio_planner_status in {"ready-for-scoped-sound-repair-triage", "no-machine-repair-actions-human-listen-still-required"} and studio_planner_safe,
        f"status={studio_planner_status}; actions={studio_planner_actions}; safeFlags={studio_planner_safe}",
    )

    studio_planner_smoke_path = output_path(outputs.get("latestAudioStudioSoundRepairPlannerSmoke"))
    studio_planner_smoke = read_json(Path(studio_planner_smoke_path)) if path_exists(studio_planner_smoke_path) else {}
    studio_planner_smoke_passed = bool(studio_planner_smoke.get("passed"))
    studio_planner_smoke_scenarios = int(studio_planner_smoke.get("scenarioCount") or 0) if studio_planner_smoke else 0
    studio_planner_smoke_failures = int(studio_planner_smoke.get("failureCount") or 0) if studio_planner_smoke else 0
    studio_planner_smoke_safe = bool(studio_planner_smoke) and all(
        studio_planner_smoke.get(key) is False
        for key in (
            "approvalStateChanged",
            "branchStateChanged",
            "renderAttempted",
            "branchRenderAttempted",
            "uploadAttempted",
            "publicationAttempted",
            "originalMediaMutated",
        )
    )
    add_check(
        checks,
        "studio-sound-repair-planner-smoke-passed",
        studio_planner_smoke_passed and studio_planner_smoke_scenarios >= 6 and studio_planner_smoke_failures == 0 and studio_planner_smoke_safe,
        f"passed={studio_planner_smoke_passed}; scenarios={studio_planner_smoke_scenarios}; failures={studio_planner_smoke_failures}; safeFlags={studio_planner_smoke_safe}",
    )

    post_review_queue_path = output_path(outputs.get("latestAudioPostReviewActionQueue"))
    post_review_queue = read_json(Path(post_review_queue_path)) if path_exists(post_review_queue_path) else {}
    post_review_queue_status = post_review_queue.get("status")
    post_review_queue_source_count = int(post_review_queue.get("sourceWithNotesCandidateCount") or 0) if post_review_queue else 0
    post_review_queue_repair_count = int(post_review_queue.get("repairActionCount") or 0) if post_review_queue else 0
    post_review_queue_proof_count = int(post_review_queue.get("focusedProofActionCount") or 0) if post_review_queue else 0
    post_review_queue_safe = bool(post_review_queue) and all(
        post_review_queue.get(key) is False
        for key in (
            "approvalStateChanged",
            "branchStateChanged",
            "renderAttempted",
            "originalMediaMutated",
        )
    )
    add_check(
        checks,
        "post-review-action-queue-ready-and-safe",
        post_review_queue_status == "ready-for-review-actions" and post_review_queue_safe,
        f"status={post_review_queue_status}; sourcesWithNotes={post_review_queue_source_count}; repair={post_review_queue_repair_count}; proof={post_review_queue_proof_count}; safeFlags={post_review_queue_safe}",
    )

    registered_command_files = sorted(
        {
            Path(path)
            for value in outputs.values()
            for path in iter_output_paths(value)
            if path.endswith(".command")
        }
    )
    non_executable_registered_commands = [
        str(path)
        for path in registered_command_files
        if not path.exists() or not os.access(path, os.X_OK)
    ]
    add_check(
        checks,
        "registered-review-launchers-executable",
        bool(registered_command_files) and not non_executable_registered_commands,
        f"registeredCommandCount={len(registered_command_files)}; missingOrNonExecutableCount={len(non_executable_registered_commands)}",
    )
    command_files = sorted(baseline_dir.rglob("*.command"))
    non_executable_commands = [
        str(path)
        for path in command_files
        if not os.access(path, os.X_OK)
    ]
    add_check(
        checks,
        "baseline-review-launchers-executable",
        not non_executable_commands,
        f"commandCount={len(command_files)}; nonExecutableCount={len(non_executable_commands)}",
        severity="warning",
    )
    start_here_text = ""
    if path_exists(paths.get("latestAudioReviewStartHereMarkdown")):
        start_here_text = Path(paths["latestAudioReviewStartHereMarkdown"] or "").read_text(encoding="utf-8").lower()
    producer_index = start_here_text.find("producer command center")
    stage_index = start_here_text.find("stage control surface")
    add_check(
        checks,
        "start-here-producer-command-center-first",
        producer_index >= 0 and stage_index >= 0 and producer_index < stage_index,
        f"producerIndex={producer_index}; stageControlIndex={stage_index}",
    )
    first_start_here_open = first_open_target(paths.get("latestAudioReviewStartHereOpenCommand"))
    producer_command_launcher_names = (
        "open-producer-command-center.command",
        "open_producer_command_center.command",
    )
    add_check(
        checks,
        "stable-start-here-launches-producer-command-center-first",
        bool(first_start_here_open) and any(name in first_start_here_open.lower() for name in producer_command_launcher_names),
        f"firstOpen={first_start_here_open or 'not found'}",
    )

    status_json_path = output_path(outputs.get("latestAudioReviewStatusBoardStableJson"))
    status_json: dict[str, Any] | None = None
    if path_exists(status_json_path):
        status_json = read_json(Path(status_json_path or ""))
        add_check(
            checks,
            "status-board-review-state-safe",
            str(status_json.get("reviewState")) in {
                "waiting-for-human-notes",
                "exported-notes-ready-for-guarded-approval",
                "exported-notes-say-repair-needed",
                "exported-notes-say-more-proof-needed",
                "exported-notes-incomplete",
                "human-listen-failed",
                "human-approved",
            },
            f"reviewState={status_json.get('reviewState')}",
        )
        add_check(
            checks,
            "status-board-non-mutating",
            status_json.get("approvalStateChanged") is False
            and status_json.get("branchStateChanged") is False
            and status_json.get("renderAttempted") is False
            and status_json.get("originalMediaMutated") is False,
            "status board mutation flags are false",
        )
    else:
        add_check(checks, "status-board-json-present", False, f"{status_json_path or 'not registered'}")

    smoke_json_path = output_path(outputs.get("latestAudioReviewStatusBoardSmoke"))
    if path_exists(smoke_json_path):
        smoke_json = read_json(Path(smoke_json_path or ""))
        add_check(
            checks,
            "status-board-smoke-passed",
            smoke_json.get("passed") is True and len(smoke_json.get("scenarios") or []) >= 5,
            f"passed={smoke_json.get('passed')}; scenarios={len(smoke_json.get('scenarios') or [])}",
        )
        add_check(
            checks,
            "status-board-smoke-preserved-real-state",
            smoke_json.get("realApprovalStatePreserved") is True
            and smoke_json.get("approvalStateChanged") is False
            and smoke_json.get("branchStateChanged") is False
            and smoke_json.get("renderAttempted") is False
            and smoke_json.get("originalMediaMutated") is False,
            "smoke mutation flags are false and real state preserved",
        )
    else:
        add_check(checks, "status-board-smoke-json-present", False, f"{smoke_json_path or 'not registered'}")

    manifest_smoke_json_path = output_path(outputs.get("latestAudioManifestReadbackConsistencySmoke"))
    if path_exists(manifest_smoke_json_path):
        manifest_smoke_json = read_json(Path(manifest_smoke_json_path or ""))
        add_check(
            checks,
            "manifest-readback-smoke-passed",
            manifest_smoke_json.get("passed") is True and int(manifest_smoke_json.get("failureCount") or 0) == 0,
            f"status={manifest_smoke_json.get('status')}; passed={manifest_smoke_json.get('passed')}; failures={manifest_smoke_json.get('failureCount')}",
        )
        add_check(
            checks,
            "manifest-readback-smoke-non-mutating",
            manifest_smoke_json.get("approvalStateChanged") is False
            and manifest_smoke_json.get("branchStateChanged") is False
            and manifest_smoke_json.get("renderAttempted") is False
            and manifest_smoke_json.get("uploadAttempted") is False
            and manifest_smoke_json.get("publicationAttempted") is False
            and manifest_smoke_json.get("originalMediaMutated") is False,
            "manifest readback smoke mutation flags are false",
        )
    else:
        add_check(checks, "manifest-readback-smoke-json-present", False, f"{manifest_smoke_json_path or 'not registered'}")

    speaker_triage_json_path = output_path(outputs.get("latestSpeakerCleanupTriageBoard"))
    if path_exists(speaker_triage_json_path):
        speaker_triage_json = read_json(Path(speaker_triage_json_path or ""))
        add_check(
            checks,
            "speaker-cleanup-triage-board-ready",
            speaker_triage_json.get("status") == "ready-for-human-triage"
            and int(speaker_triage_json.get("windowCount") or 0) >= 10
            and int(speaker_triage_json.get("missingSnippetCount") or 0) == 0
            and int(speaker_triage_json.get("missingEvidenceCount") or 0) == 0,
            f"status={speaker_triage_json.get('status')}; windows={speaker_triage_json.get('windowCount')}; missingSnippets={speaker_triage_json.get('missingSnippetCount')}; missingEvidence={speaker_triage_json.get('missingEvidenceCount')}",
        )
        add_check(
            checks,
            "speaker-cleanup-triage-board-non-mutating",
            speaker_triage_json.get("approvalStateChanged") is False
            and speaker_triage_json.get("branchStateChanged") is False
            and speaker_triage_json.get("renderAttempted") is False
            and speaker_triage_json.get("uploadAttempted") is False
            and speaker_triage_json.get("publicationAttempted") is False
            and speaker_triage_json.get("originalMediaMutated") is False,
            "speaker cleanup triage board mutation flags are false",
        )
    else:
        add_check(checks, "speaker-cleanup-triage-board-json-present", False, f"{speaker_triage_json_path or 'not registered'}")

    speaker_acceptance_json_path = output_path(outputs.get("latestSpeakerCleanupAcceptanceBoard"))
    if path_exists(speaker_acceptance_json_path):
        speaker_acceptance_json = read_json(Path(speaker_acceptance_json_path or ""))
        add_check(
            checks,
            "speaker-cleanup-acceptance-board-ready",
            speaker_acceptance_json.get("status") == "machine-evidence-ready-human-listen-required"
            and int(speaker_acceptance_json.get("machineCheckNeedsAttentionCount") or 0) == 0
            and int(speaker_acceptance_json.get("missingArtifactCount") or 0) == 0
            and int(speaker_acceptance_json.get("missingSnippetCount") or 0) == 0
            and speaker_acceptance_json.get("humanListenRequired") is True,
            f"status={speaker_acceptance_json.get('status')}; checks={speaker_acceptance_json.get('machineCheckPassedCount')}/{speaker_acceptance_json.get('machineCheckCount')}; missingArtifacts={speaker_acceptance_json.get('missingArtifactCount')}; missingSnippets={speaker_acceptance_json.get('missingSnippetCount')}; humanListenRequired={speaker_acceptance_json.get('humanListenRequired')}",
        )
        add_check(
            checks,
            "speaker-cleanup-acceptance-board-non-mutating",
            speaker_acceptance_json.get("approvalStateChanged") is False
            and speaker_acceptance_json.get("branchStateChanged") is False
            and speaker_acceptance_json.get("renderAttempted") is False
            and speaker_acceptance_json.get("uploadAttempted") is False
            and speaker_acceptance_json.get("publicationAttempted") is False
            and speaker_acceptance_json.get("originalMediaMutated") is False,
            "speaker cleanup acceptance board mutation flags are false",
        )
    else:
        add_check(checks, "speaker-cleanup-acceptance-board-json-present", False, f"{speaker_acceptance_json_path or 'not registered'}")

    index_json_path = output_path(outputs.get("latestReviewHandoffIndex"))
    if path_exists(index_json_path):
        index_json = read_json(Path(index_json_path or ""))
        add_check(
            checks,
            "handoff-index-complete",
            int(index_json.get("artifactCount") or 0) >= 50
            and int(index_json.get("missingArtifactCount") or 0) == 0,
            f"artifactCount={index_json.get('artifactCount')}; missingArtifactCount={index_json.get('missingArtifactCount')}",
        )
        add_check(
            checks,
            "handoff-index-gates-match-manifest",
            index_json.get("approvalStatus") == approval_status
            and bool(index_json.get("branchInheritanceReady")) == branch_inheritance_ready
            and bool(index_json.get("branchRenderReady")) == branch_render_ready,
            "handoff index approval/branch gates match manifest",
        )
    else:
        add_check(checks, "handoff-index-json-present", False, f"{index_json_path or 'not registered'}")

    error_count = sum(1 for check in checks if not check.passed and check.severity == "error")
    warning_count = sum(1 for check in checks if not check.passed and check.severity == "warning")
    error_checks = [
        {
            "name": check.name,
            "severity": check.severity,
            "detail": check.detail,
        }
        for check in checks
        if not check.passed and check.severity == "error"
    ]
    warning_checks = [
        {
            "name": check.name,
            "severity": check.severity,
            "detail": check.detail,
        }
        for check in checks
        if not check.passed and check.severity == "warning"
    ]
    passed = error_count == 0
    if human_approved:
        gate_interpretation = "Human approval is recorded; branch gate/preflight may be evaluated before renders."
    else:
        gate_interpretation = "The package is internally coherent for human review, but branch inheritance and real branch rendering remain locked until human listen proof is recorded."

    report = {
        "schema": "quipsly.audio-workbench.review-gate-audit.v1",
        "generatedAt": generated_iso,
        "baselineDir": str(baseline_dir),
        "baselineId": baseline_id,
        "approvalStatus": approval_status,
        "branchInheritanceReady": branch_inheritance_ready,
        "branchRenderReady": branch_render_ready,
        "packageReadyForHumanListen": package_ready,
        "gateInterpretation": gate_interpretation,
        "status": "passed" if passed else "needs-attention",
        "passed": passed,
        "errorCount": error_count,
        "warningCount": warning_count,
        "errors": error_checks,
        "warnings": warning_checks,
        "checks": [
            {
                "name": check.name,
                "passed": check.passed,
                "severity": check.severity,
                "detail": check.detail,
            }
            for check in checks
        ],
        "approvalStateChanged": False,
        "branchStateChanged": False,
        "renderAttempted": False,
        "originalMediaMutated": False,
    }

    output_json = baseline_dir / f"audio-review-gate-audit-{slug}-{generated_at}.json"
    output_md = baseline_dir / f"audio-review-gate-audit-{slug}-{generated_at}.md"
    report["json"] = str(output_json)
    report["markdown"] = str(output_md)
    write_json(output_json, report)
    output_md.write_text(render_markdown(report), encoding="utf-8")

    outputs["latestAudioReviewGateAudit"] = str(output_json)
    outputs["latestAudioReviewGateAuditMarkdown"] = str(output_md)
    history = outputs.setdefault("audioReviewGateAudits", [])
    if str(output_json) not in history:
        history.append(str(output_json))
    manifest["audioReviewGateAuditCount"] = len(history)
    manifest["audioReviewGateAuditLatestStatus"] = report["status"]
    manifest["audioReviewGateAuditLatestPassed"] = passed
    manifest["audioReviewGateAuditLatestErrorCount"] = error_count
    manifest["audioReviewGateAuditLatestWarningCount"] = warning_count
    manifest["audioReviewGateAuditLatestGeneratedAt"] = generated_iso
    manifest["audioReviewGateAuditLatestMarkdown"] = str(output_md)
    write_json(manifest_path, manifest)

    print(
        json.dumps(
            {
                "baselineId": baseline_id,
                "passed": passed,
                "errorCount": error_count,
                "warningCount": warning_count,
                "approvalStatus": approval_status,
                "branchInheritanceReady": branch_inheritance_ready,
                "branchRenderReady": branch_render_ready,
                "markdown": str(output_md),
                "approvalStateChanged": False,
                "branchStateChanged": False,
                "renderAttempted": False,
                "originalMediaMutated": False,
            },
            indent=2,
            sort_keys=True,
        )
    )


if __name__ == "__main__":
    main()
