#!/usr/bin/env python3
"""Create a producer command center for the active audio baseline.

This is a calm, current-state front door for humans and agents. It summarizes
what the current mastered audio candidate is, which review surfaces matter most,
what is intentionally locked, and what the next safe action is. It does not
approve audio, fail audio, render branches, upload files, publish, or mutate
original media.
"""

from __future__ import annotations

import argparse
import html
import json
import os
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
    raise FileNotFoundError(f"Could not find baseline manifest under {input_path}")


def output_path(value: Any) -> str | None:
    if isinstance(value, str) and value:
        return value
    if isinstance(value, dict):
        for key in ("path", "markdownPath", "htmlPath", "openCommand", "m4aPath", "playlistPath"):
            subvalue = value.get(key)
            if isinstance(subvalue, str) and subvalue:
                return subvalue
    return None


def load_output_report(outputs: dict[str, Any], key: str) -> dict[str, Any]:
    path = output_path(outputs.get(key))
    if not path or not Path(path).exists() or Path(path).suffix.lower() != ".json":
        return {}
    try:
        return read_json(Path(path))
    except json.JSONDecodeError:
        return {}


def safe_slug(value: str) -> str:
    out = "".join(ch.lower() if ch.isalnum() else "-" for ch in str(value))
    while "--" in out:
        out = out.replace("--", "-")
    return out.strip("-") or "audio-baseline"


def shell_quote(value: str) -> str:
    return "'" + value.replace("'", "'\\''") + "'"


def e(value: Any) -> str:
    return html.escape(str(value))


def int_value(value: Any) -> int:
    try:
        return int(value)
    except (TypeError, ValueError):
        return 0


def artifact(outputs: dict[str, Any], label: str, key: str, *, why: str, kind: str = "review") -> dict[str, Any]:
    path = output_path(outputs.get(key))
    return {
        "label": label,
        "key": key,
        "path": path,
        "exists": bool(path and Path(path).exists()),
        "kind": kind,
        "why": why,
    }


def find_check(report: dict[str, Any], name: str) -> dict[str, Any]:
    for check in report.get("checks") or []:
        if check.get("name") == name:
            return check
    return {}


def check_detail(report: dict[str, Any], name: str, fallback: str = "not checked") -> str:
    check = find_check(report, name)
    detail = check.get("detail")
    if isinstance(detail, str) and detail:
        return detail
    return fallback


def stable_launcher_summary(detail: str) -> str:
    if "open-producer-command-center.command" in detail:
        return "firstOpen=open-producer-command-center.command"
    return detail


def open_command_lines(artifacts: list[dict[str, Any]], limit: int = 8) -> list[str]:
    lines = ["#!/bin/zsh", "set -euo pipefail"]
    for item in artifacts[:limit]:
        path = item.get("path")
        if path and item.get("exists"):
            lines.append(f"open {shell_quote(path)}")
    return lines


def build_command_center(manifest: dict[str, Any], baseline_dir: Path, generated_at: str) -> dict[str, Any]:
    outputs = manifest.get("outputs") or {}
    baseline_id = str(manifest.get("baselineId") or "audio-baseline")
    approval_status = str(manifest.get("approvalStatus") or "unknown")
    package_ready = bool(manifest.get("packageReadyForHumanListen"))
    branch_inheritance_ready = bool(manifest.get("branchInheritanceReady"))
    branch_render_ready = bool(manifest.get("branchRenderReady"))

    final_fast_pass = load_output_report(outputs, "latestAudioFinalListenFastPass")
    final_fast_pass_inbox = load_output_report(outputs, "latestAudioFinalListenFastPassNotesInbox")
    broadcast_scorecard = load_output_report(outputs, "latestAudioBroadcastPolishScorecard")
    technical_audition = load_output_report(outputs, "latestAudioTechnicalAuditionAudit")
    technical_audition_snippets = load_output_report(outputs, "latestAudioTechnicalAuditionSnippetPack")
    technical_audition_inbox = load_output_report(outputs, "latestAudioTechnicalAuditionNotesInbox")
    smoothness_pack = load_output_report(outputs, "latestAudioSmoothnessProofPack")
    smoothness_inbox = load_output_report(outputs, "latestAudioSmoothnessProofNotesInbox")
    source_balance_companion = load_output_report(outputs, "latestAudioSourceBalanceListenCompanion")
    source_balance_triage = load_output_report(outputs, "latestAudioSourceBalanceTriage")
    speaker_preservation_pack = load_output_report(outputs, "latestAudioSpeakerPreservationProofPack")
    speaker_preservation_inbox = load_output_report(outputs, "latestAudioSpeakerPreservationProofNotesInbox")
    speaker_cleanup_decision_matrix = load_output_report(outputs, "latestSpeakerCleanupDecisionMatrix")
    speaker_cleanup_triage_board = load_output_report(outputs, "latestSpeakerCleanupTriageBoard")
    speaker_cleanup_acceptance_board = load_output_report(outputs, "latestSpeakerCleanupAcceptanceBoard")
    speaker_cleanup_listen_reel = load_output_report(outputs, "latestSpeakerCleanupListenReel")
    speaker_cleanup_triage_inbox = load_output_report(outputs, "latestSpeakerCleanupTriageNotesInbox")
    speaker_cleanup_triage_inbox_smoke = load_output_report(outputs, "latestSpeakerCleanupTriageNotesInboxSmoke")
    dxrevive_validation = load_output_report(outputs, "latestDxReviveBounceValidation")
    dxrevive_return_workbench = load_output_report(outputs, "latestDxReviveReturnWorkbench")
    dxrevive_planner = load_output_report(outputs, "latestDxReviveProofCandidatePlanner")
    post_review_queue = load_output_report(outputs, "latestAudioPostReviewActionQueue")
    scoped_v007_repair_plan = load_output_report(outputs, "latestAudioScopedV007RepairCandidatePlan")
    scoped_v007_repair_plan_smoke = load_output_report(outputs, "latestAudioScopedV007RepairCandidatePlanSmoke")
    platform_loudness = load_output_report(outputs, "latestAudioPlatformLoudnessAudit")
    stage_surface = load_output_report(outputs, "latestAudioWorkbenchStageControlSurface")
    goal_audit = load_output_report(outputs, "latestAudioGoalCompletionAudit")
    review_gate_audit = load_output_report(outputs, "latestAudioReviewGateAudit")
    review_gate_smoke = load_output_report(outputs, "latestAudioReviewGateAuditSmoke")
    human_approval_preflight = load_output_report(outputs, "latestAudioHumanApprovalPreflight")
    human_listen_decision_front_door = load_output_report(outputs, "latestHumanListenDecisionFrontDoor")
    human_listen_decision_front_door_smoke = load_output_report(outputs, "latestHumanListenDecisionFrontDoorSmoke")
    human_listen_mission_board = load_output_report(outputs, "latestAudioHumanListenMissionBoard")
    human_listen_mission_reel = load_output_report(outputs, "latestAudioHumanListenMissionReel")
    human_listen_mission_reel_notes_inbox = load_output_report(outputs, "latestAudioHumanListenMissionReelNotesInbox")
    human_listen_mission_reel_notes_inbox_smoke = load_output_report(outputs, "latestAudioHumanListenMissionReelNotesInboxSmoke")
    unresolved_review = load_output_report(outputs, "latestAudioUnresolvedRequirementReview")
    audio_runway_state = load_output_report(outputs, "latestAudioRunwayState")
    listen_proof_coverage = load_output_report(outputs, "latestAudioListenProofCoverageMap")
    production_doctrine = load_output_report(outputs, "latestAudioProductionDoctrine")
    transformation_lineage = load_output_report(outputs, "latestAudioTransformationLineageLedger")
    transformation_lineage_smoke = load_output_report(outputs, "latestAudioTransformationLineageLedgerSmoke")
    manifest_readback_smoke = load_output_report(outputs, "latestAudioManifestReadbackConsistencySmoke")
    final_listen_mission_packet = load_output_report(outputs, "latestAudioFinalListenMissionPacket")
    sound_director_scorecard = load_output_report(outputs, "latestAudioSoundDirectorScorecard")
    morning_publication_readiness = load_output_report(outputs, "latestAudioMorningPublicationReadinessPacket")
    quality_methods_matrix = load_output_report(outputs, "latestAudioQualityMethodsMatrix")
    blind_listen_sampler = load_output_report(outputs, "latestAudioBlindListenSampler")
    blind_listen_notes_inbox = load_output_report(outputs, "latestAudioBlindListenNotesInbox")
    blind_listen_notes_inbox_smoke = load_output_report(outputs, "latestAudioBlindListenNotesInboxSmoke")
    spine_quality_gate = load_output_report(outputs, "latestAudioSpineQualityGate")
    machine_listen_sentinel = load_output_report(outputs, "latestAudioMachineListenSentinel")
    spectral_fatigue_audit = load_output_report(outputs, "latestAudioSpectralFatigueAudit")
    translation_survival_audit = load_output_report(outputs, "latestAudioTranslationSurvivalAudit")
    morning_audio_review_launcher = load_output_report(outputs, "latestAudioMorningAudioReviewLauncher")
    post_listen_episode_runway = load_output_report(outputs, "latestAudioPostListenEpisodeRunway")
    episode_rollout_board = load_output_report(outputs, "latestAudioEpisodeRolloutReadinessBoard")
    episode_media_inventory = load_output_report(outputs, "latestAudioEpisodeMediaInventoryPreflight")
    defect_atlas = load_output_report(outputs, "latestAudioDefectAtlas")
    defect_atlas_notes_inbox = load_output_report(outputs, "latestAudioDefectAtlasNotesInbox")
    defect_atlas_notes_inbox_smoke = load_output_report(outputs, "latestAudioDefectAtlasNotesInboxSmoke")
    studio_sound_control_room = load_output_report(outputs, "latestAudioStudioSoundControlRoom")
    studio_sound_repair_planner = load_output_report(outputs, "latestAudioStudioSoundRepairPlanner")
    studio_sound_repair_planner_smoke = load_output_report(outputs, "latestAudioStudioSoundRepairPlannerSmoke")
    studio_sound_notes_inbox = load_output_report(outputs, "latestAudioStudioSoundNotesInbox")
    studio_sound_notes_inbox_smoke = load_output_report(outputs, "latestAudioStudioSoundNotesInboxSmoke")

    review_gate_error_count = int_value(review_gate_audit.get("errorCount"))
    review_gate_warning_count = int_value(review_gate_audit.get("warningCount"))
    review_gate_passed = bool(review_gate_audit.get("passed")) and review_gate_error_count == 0
    review_gate_smoke_passed = bool(review_gate_smoke.get("passed"))
    registered_launcher_detail = check_detail(review_gate_audit, "registered-review-launchers-executable")
    baseline_launcher_detail = check_detail(review_gate_audit, "baseline-review-launchers-executable")
    stable_launcher_detail = stable_launcher_summary(check_detail(review_gate_audit, "stable-start-here-launches-producer-command-center-first"))

    primary_artifacts = [
        artifact(outputs, "Open the stable START_HERE", "latestAudioReviewStartHereMarkdown", why="Full review doorway and command list."),
        artifact(outputs, "Audio runway state", "latestAudioRunwayStateHtml", why="One stable current-state readback for approval locks, review gate, unresolved requirements, handoff, and next safe action."),
        artifact(outputs, "Listen proof coverage map", "latestAudioListenProofCoverageMapHtml", why="Minimum sufficient human-listen path mapped to each remaining partial or locked requirement."),
        artifact(outputs, "Unresolved requirement review", "latestAudioUnresolvedRequirementReviewMarkdown", why="Direct action surface for partial and locked goal-audit requirements."),
        artifact(outputs, "Audio production doctrine", "latestAudioProductionDoctrineMarkdown", why="Reusable operating manual for source-aware cleanup, dxRevive fallback, mastering, review, and future noisy recordings."),
        artifact(outputs, "Audio transformation lineage ledger", "latestAudioTransformationLineageLedgerHtml", why="Stage-by-stage provenance map for what changes the sound, which evidence proves it, and which knobs own future repairs."),
        artifact(outputs, "Audio transformation lineage ledger smoke", "latestAudioTransformationLineageLedgerSmokeMarkdown", why="Contract smoke proving complete evidence, missing evidence, and real approval/branch locks stay honest."),
        artifact(outputs, "Manifest readback consistency smoke", "latestAudioManifestReadbackConsistencySmokeMarkdown", why="Control-plane smoke proving manifest readback fields agree with the latest front-door reports."),
        artifact(outputs, "Sound Director scorecard", "latestAudioSoundDirectorScorecardHtml", why="Aggregate machine-confidence and review-routing readout across loudness, polish, source balance, speaker cleanup, smoothness, technical audition, and notes routing."),
        artifact(outputs, "Morning publication readiness", "latestAudioMorningPublicationReadinessPacketHtml", why="Charlie-facing morning packet: recommended audio file, review steps, platform packet readiness, and remaining human gates."),
        artifact(outputs, "Quality methods matrix", "latestAudioQualityMethodsMatrixHtml", why="Separates audio-spine quality gates from final episode/short gates and records stronger next methods without pretending a single score proves quality."),
        artifact(outputs, "Audio spine quality gate", "latestAudioSpineQualityGateHtml", why="Top-level machine gate for the current mastered spine: file integrity, platform loudness, polish, speaker survival, reviewability, and branch truth."),
        artifact(outputs, "Machine listen sentinel", "latestAudioMachineListenSentinelHtml", why="Direct FFmpeg/PCM sentinel for loudness, true peak, silence/gap behavior, channel balance, and speaker-survival inheritance."),
        artifact(outputs, "Master smoothness audit", "latestAudioMasterSmoothnessAuditMarkdown", why="Full-spine envelope contour audit for abrupt jumps, hard silence edges, and long low-level spans that should be sampled before approval."),
        artifact(outputs, "Spectral fatigue audit", "latestAudioSpectralFatigueAuditHtml", why="Voice-band risk audit for rumble, mud, thinness, harshness, hiss, and over-squash fatigue before humans spend a full listen."),
        artifact(outputs, "Translation survival audit", "latestAudioTranslationSurvivalAuditHtml", why="Derived AAC/MP3/phone proof snippets showing whether critical windows survive practical platform and listening-device transformations."),
        artifact(outputs, "Morning audio review launcher", "latestAudioMorningAudioReviewLauncherHtml", why="One tired-human door that opens the listening M4A, reveals the WAV handoff, and points to the guarded review/decision flow."),
        artifact(outputs, "Post-listen episode runway", "latestAudioPostListenEpisodeRunwayHtml", why="Clarifies the pass/fail/needs-proof route from approved audio spine to final Episode 4 episode and shorts packages."),
        artifact(outputs, "Final listen mission packet", "latestAudioFinalListenMissionPacketHtml", why="Smallest sufficient reviewer mission: what to open, what to listen to, where notes return, and where guarded decisions happen."),
        artifact(outputs, "Audio defect atlas", "latestAudioDefectAtlasHtml", why="Stage-aware timeline map of machine-visible risks, owning stage, evidence, and safest next action."),
        artifact(outputs, "Audio defect atlas notes template", "latestAudioDefectAtlasNotesTemplate", why="Machine-readable return packet for scoped pass/proof/repair notes against atlas items."),
        artifact(outputs, "Audio defect atlas notes inbox", "latestAudioDefectAtlasNotesInboxHtml", why="Safe return path for defect-atlas notes; routes scoped repairs/proofs without approving the audio spine."),
        artifact(outputs, "Audio defect atlas notes inbox smoke", "latestAudioDefectAtlasNotesInboxSmokeMarkdown", why="Synthetic proof that atlas notes stay safe across no-notes, pass, proof, repair, mixed, wrong-baseline, and unknown-item scenarios."),
        artifact(outputs, "Source-balance triage", "latestAudioSourceBalanceTriageHtml", why="Condenses the large source-balance warning count into speaker-survival proof, representative listen windows, and scoped repair rules."),
        artifact(outputs, "Studio sound control room", "latestAudioStudioSoundControlRoomHtml", why="Window-by-window audio microscope with proof clips, waveforms, spectrograms, and repair-routing cues."),
        artifact(outputs, "Studio sound notes template", "latestAudioStudioSoundNotesTemplate", why="Machine-readable return packet for pass/proof/repair notes from the Studio Sound Control Room."),
        artifact(outputs, "Studio sound notes inbox", "latestAudioStudioSoundNotesInboxMarkdown", why="Safe return path for exported Studio Sound notes; routes focused sound symptoms without approving the audio spine."),
        artifact(outputs, "Studio sound notes inbox smoke", "latestAudioStudioSoundNotesInboxSmokeMarkdown", why="Synthetic proof that pass, proof-needed, repair-needed, no-notes, and wrong-baseline packets stay safe."),
        artifact(outputs, "Studio sound repair planner", "latestAudioStudioSoundRepairPlannerHtml", why="Stage-owned next actions for machine-visible sound flags, without rendering or unlocking branches."),
        artifact(outputs, "Studio sound repair planner smoke", "latestAudioStudioSoundRepairPlannerSmokeMarkdown", why="Synthetic proof that quiet intro, peak, channel imbalance, density, unknown, and no-flag routes stay safe."),
        artifact(outputs, "Review gate audit", "latestAudioReviewGateAuditMarkdown", why="Hard gate: package integrity, locked branch state, launcher integrity, and safe reviewer entry."),
        artifact(outputs, "Review gate smoke", "latestAudioReviewGateAuditSmokeMarkdown", why="Synthetic proof that the gate accepts safe locked review packages and rejects unsafe states."),
        artifact(outputs, "Human approval preflight", "latestAudioHumanApprovalPreflightHtml", why="Compact go/no-go surface for human listen notes, branch locks, dxRevive fallback, and next safe action."),
        artifact(outputs, "Human listen mission board", "latestAudioHumanListenMissionBoardHtml", why="Shortest calm reviewer mission: listen path, focus windows, repair flag, notes roundtrip, and locked decision route."),
        artifact(outputs, "Human listen mission reel", "latestAudioHumanListenMissionReelHtml", why="Ninety-second focused reel from the mission-board windows, with M4A and chapter CSV for fast first-pass review."),
        artifact(outputs, "Human listen mission reel notes template", "latestAudioHumanListenMissionReelNotesTemplate", why="Machine-readable return packet for focused Mission Reel notes."),
        artifact(outputs, "Human listen mission reel notes inbox", "latestAudioHumanListenMissionReelNotesInboxMarkdown", why="Safe return path for Mission Reel notes; routes focused review into repair/proof/pass-context evidence."),
        artifact(outputs, "Human listen mission reel notes inbox smoke", "latestAudioHumanListenMissionReelNotesInboxSmokeMarkdown", why="Synthetic proof that no-notes, pending, pass, proof, repair, and wrong-baseline Mission Reel notes stay safe."),
        artifact(outputs, "Human listen decision front door", "latestHumanListenDecisionFrontDoorHtml", why="One stable surface for listening, exporting notes, dry-running the decision route, recording a guarded decision, and refreshing gates."),
        artifact(outputs, "Human listen decision front-door smoke", "latestHumanListenDecisionFrontDoorSmokeMarkdown", why="Machine proof that the decision front door is linked, guarded, dry-runnable, and unable to approve the real baseline without human confirmation."),
        artifact(outputs, "Reviewer notes template", "latestReviewerNotesTemplateHtml", why="One stable human-note packet for capturing or importing review decisions without changing approval truth."),
        artifact(outputs, "Branch inheritance gate", "latestBranchInheritanceGateHtml", why="Post-approval readiness gate for whether edit branches may inherit the current mastered audio spine."),
        artifact(outputs, "Branch render preflight", "branchRenderPreflightHtml", why="Post-inheritance render readiness surface for long-form and shorts branches."),
        artifact(outputs, "Approved branch render executor", "latestApprovedBranchRenderExecutorMarkdown", why="Guarded post-listen render door. It stays blocked before human approval and exposes the exact branch render commands only after gates pass."),
        artifact(outputs, "Approval-path sandbox smoke", "latestApprovalPathSmokeMarkdown", why="Sandbox proof that post-approval branch inheritance, branch render preflight, and approved render command exposure work without changing the real baseline."),
        artifact(outputs, "Final-listen fast pass", "latestAudioFinalListenFastPassHtml", why="Shortest sane listen path: master player plus ranked jump checks."),
        artifact(outputs, "Broadcast polish scorecard", "latestAudioBroadcastPolishScorecardHtml", why="Producer score, delivery risk, smoothness risk, preservation risk."),
        artifact(outputs, "Technical audition audit", "latestAudioTechnicalAuditionAuditHtml", why="Full-spine listen map for channel balance, quiet-floor behavior, fatigue-risk sections, and first-listen priorities."),
        artifact(outputs, "Technical audition snippet pack", "latestAudioTechnicalAuditionSnippetPackHtml", why="Playable derived snippets for the technical audition's highest-priority listen sections."),
        artifact(outputs, "Technical audition notes inbox", "latestAudioTechnicalAuditionNotesInboxMarkdown", why="Return path for exported technical audition notes into the unified post-review action queue."),
        artifact(outputs, "Smoothness proof pack", "latestAudioSmoothnessProofPackHtml", why="Short clips for transitions, low-level spans, and cadence checks."),
        artifact(outputs, "Speaker preservation proof pack", "latestAudioSpeakerPreservationProofPackHtml", why="A/B proof clips that show whether Charlie/Homer survived cleanup."),
        artifact(outputs, "Speaker cleanup decision matrix", "latestSpeakerCleanupDecisionMatrixHtml", why="One decision table tying cleanup windows, A/B snippets, contribution markers, and preservation evidence together."),
        artifact(outputs, "Speaker cleanup triage board", "latestSpeakerCleanupTriageBoardHtml", why="Symptom-first listen board for deciding pass, scoped v007 repair, or focused proof without rerunning the whole chain."),
        artifact(outputs, "Speaker cleanup acceptance board", "latestSpeakerCleanupAcceptanceBoardHtml", why="Machine evidence bridge that says cleanup is armed for human listen while keeping branch locks honest."),
        artifact(outputs, "Speaker cleanup listen reel", "latestSpeakerCleanupListenReelHtml", why="Compact 15-window M4A route for checking speaker-cleanup naturalness without hunting individual snippets."),
        artifact(outputs, "Speaker cleanup triage notes inbox", "latestSpeakerCleanupTriageNotesInboxMarkdown", why="Safe return path for exported triage-board notes; dry-runs reviewer routing without approving the audio spine."),
        artifact(outputs, "Speaker cleanup triage notes inbox smoke", "latestSpeakerCleanupTriageNotesInboxSmokeMarkdown", why="Synthetic proof that pass, proof-needed, repair-needed, no-notes, and wrong-baseline packets stay safe."),
        artifact(outputs, "Source-balance companion", "latestAudioSourceBalanceListenCompanionMarkdown", why="Plain-English guide to master/source balance warnings."),
        artifact(outputs, "Post-review action queue", "latestAudioPostReviewActionQueueMarkdown", why="One board for exported notes, repair actions, proof actions, and pass context."),
        artifact(outputs, "Scoped v007 repair candidate plan", "latestAudioScopedV007RepairCandidatePlanHtml", why="Turns queued repair/proof notes into stage-owned v007 candidate plans without rendering, approving, or unlocking branches."),
        artifact(outputs, "Scoped v007 repair candidate plan smoke", "latestAudioScopedV007RepairCandidatePlanSmokeMarkdown", why="Synthetic missing/no-note/repair/proof/mixed-note coverage for the v007 planner."),
        artifact(outputs, "dxRevive manual bounce packet", "latestDxReviveManualBouncePacketMarkdown", why="Safe optional restoration bridge for derived stems only."),
        artifact(outputs, "dxRevive return workbench", "latestDxReviveReturnWorkbenchHtml", why="One surface for expected returns, validation state, planner state, and next safe restoration actions."),
        artifact(outputs, "Stage control surface", "latestAudioWorkbenchStageControlSurfaceHtml", why="Workbench map: source, sync, cleanup, repair, master, listen, branch gates."),
        artifact(outputs, "Human listen decision rehearsal", "latestHumanListenDecisionRehearsalMarkdown", why="Dry-run proof that approve/fail/needs-proof routes still preserve real truth."),
    ]

    review_cards = [
        {
            "name": "Current master candidate",
            "status": "human-listen-required" if approval_status != "human-approved-for-branch-inheritance" else "human-approved",
            "metric": f"packageReady={str(package_ready).lower()} / branchInheritance={str(branch_inheritance_ready).lower()} / branchRender={str(branch_render_ready).lower()}",
            "meaning": "The WAV/M4A can be reviewed now. It must not be inherited by edit branches until a real human listen decision is recorded.",
            "nextAction": "Listen through the fast pass and proof packs; record notes before touching branch gates.",
        },
        {
            "name": "Audio runway state",
            "status": audio_runway_state.get("status") or "missing",
            "metric": f"gate={str(bool(audio_runway_state.get('reviewGatePassed'))).lower()}; readyForHumanDecision={str(bool(audio_runway_state.get('readyForHumanDecision'))).lower()}; unresolved={audio_runway_state.get('unresolvedRequirementCount') or 0}; handoffMissing={audio_runway_state.get('handoffMissingLinkedArtifactCount') if audio_runway_state else 'n/a'}",
            "meaning": "This rolls up the review runway into one stable readback before anyone approves, branches, renders, uploads, or publishes.",
            "nextAction": audio_runway_state.get("nextSafeAction") or "Generate the audio runway state before routing human listen, approval, branch, or render decisions.",
        },
        {
            "name": "Listen proof coverage",
            "status": listen_proof_coverage.get("status") or "missing",
            "metric": f"steps={listen_proof_coverage.get('minimumPathStepCount') or 0}; requirements={listen_proof_coverage.get('requirementCoverageCount') or 0}; missingArtifacts={listen_proof_coverage.get('missingArtifactCount') if listen_proof_coverage else 'n/a'}",
            "meaning": "This maps the shortest defensible human-listen route to every remaining partial or locked requirement so approval notes are evidence, not vibes.",
            "nextAction": listen_proof_coverage.get("nextSafeAction") or "Generate the listen proof coverage map before asking a reviewer to approve or repair v006.",
        },
        {
            "name": "Review gate and launchers",
            "status": "passed" if review_gate_passed and review_gate_warning_count == 0 else "needs-attention",
            "metric": f"errors {review_gate_error_count}; warnings {review_gate_warning_count}; {registered_launcher_detail}; {baseline_launcher_detail}",
            "meaning": "The package is only reviewable if its required artifacts exist, branch locks remain honest, and the human-facing .command launchers are double-click safe.",
            "nextAction": "If this is anything but passed, refresh the gate before handing the package to a reviewer.",
        },
        {
            "name": "Manifest readback consistency",
            "status": manifest_readback_smoke.get("status") or "missing",
            "metric": f"passed={str(bool(manifest_readback_smoke.get('passed'))).lower()}; checks={manifest_readback_smoke.get('checkCount') or 0}; failures={manifest_readback_smoke.get('failureCount') if manifest_readback_smoke else 'n/a'}",
            "meaning": "The manifest is the control-plane API for humans and agents. This smoke proves its top-level readback fields agree with their source reports.",
            "nextAction": "If this is not passed, regenerate the stale front-door report before trusting readiness, approval, or next-action fields.",
        },
        {
            "name": "Studio sound control room",
            "status": studio_sound_control_room.get("status") or "missing",
            "metric": f"windows={studio_sound_control_room.get('windowCount') or 0}; snippets={studio_sound_control_room.get('snippetRenderOkCount') or 0}; spectrograms={studio_sound_control_room.get('spectrogramRenderOkCount') or 0}; flagged={studio_sound_control_room.get('riskWindowCount') or 0}",
            "meaning": "This makes the current master auditable as sound, not just as files and gates: every priority window gets metrics, waveform evidence, and playable proof.",
            "nextAction": "Use this before scoped v007 repair so the owning stage is obvious and the audio chain does not become a magic black box.",
        },
        {
            "name": "Studio sound repair planner",
            "status": studio_sound_repair_planner.get("status") or "missing",
            "metric": f"actions={studio_sound_repair_planner.get('actionCount') or 0}; proofWindows={studio_sound_repair_planner.get('proofWindowActionCount') or 0}; editBoundaries={studio_sound_repair_planner.get('editBoundaryActionCount') or 0}; smoke={str(bool(studio_sound_repair_planner_smoke.get('passed'))).lower()}",
            "meaning": "Machine-visible sound flags are now routed to the likely owning stage instead of becoming a vague full-chain repair request.",
            "nextAction": "If a human confirms a symptom, use this planner to choose focused proof, edit-boundary correction, or scoped v007 repair.",
        },
        {
            "name": "Studio sound notes",
            "status": studio_sound_notes_inbox.get("status") or "missing",
            "metric": f"candidates={studio_sound_notes_inbox.get('matchingCandidateCount') if studio_sound_notes_inbox else 'n/a'}; decision={studio_sound_notes_inbox.get('studioSoundDecision') if studio_sound_notes_inbox else 'n/a'}; smoke={str(bool(studio_sound_notes_inbox_smoke.get('passed'))).lower()}; scenarios={studio_sound_notes_inbox_smoke.get('scenarioCount') or 0}",
            "meaning": "Focused Studio Sound notes can now re-enter the audio workbench as repair/proof/pass-context evidence without pretending they are full-spine approval.",
            "nextAction": "If a reviewer exports Studio Sound notes, run this inbox before choosing a scoped repair, focused proof, or full human-listen decision route.",
        },
        {
            "name": "Speaker cleanup triage notes",
            "status": "passed" if bool(speaker_cleanup_triage_inbox_smoke.get("passed")) else "needs-smoke",
            "metric": f"candidates={speaker_cleanup_triage_inbox.get('matchingCandidateCount') if speaker_cleanup_triage_inbox else 'n/a'}; decision={speaker_cleanup_triage_inbox.get('speakerCleanupTriageDecision') or (speaker_cleanup_triage_inbox.get('selectedCandidate') or {}).get('speakerCleanupTriageDecision') if speaker_cleanup_triage_inbox else 'n/a'}; smoke={str(bool(speaker_cleanup_triage_inbox_smoke.get('passed'))).lower()}; scenarios={speaker_cleanup_triage_inbox_smoke.get('scenarioCount') or 0}",
            "meaning": "Exported triage-board notes can now re-enter the audio workbench as evidence without approving v006 or unlocking branch/render state.",
            "nextAction": "If a reviewer exports triage notes, run the inbox first; use the dry-run route before recording any guarded listen decision.",
        },
        {
            "name": "Human listen mission board",
            "status": human_listen_mission_board.get("status") or "missing",
            "metric": f"steps={human_listen_mission_board.get('missionStepCount') or 0}; focus={human_listen_mission_board.get('focusWindowCount') or 0}; missing={human_listen_mission_board.get('missingArtifactCount') if human_listen_mission_board else 'n/a'}; repairActions={human_listen_mission_board.get('repairActionCount') or 0}",
            "meaning": "This is the calm producer path from machine evidence to human listen notes without pretending focused notes are full approval.",
            "nextAction": human_listen_mission_board.get("nextSafeAction") or "Generate the listen mission board before asking Charlie or Mako to approve the audio spine.",
        },
        {
            "name": "Human listen mission reel",
            "status": human_listen_mission_reel.get("status") or "missing",
            "metric": f"items={human_listen_mission_reel.get('itemCount') or 0}; duration={human_listen_mission_reel.get('durationSeconds') or 0}s; missing={human_listen_mission_reel.get('missingSnippetCount') if human_listen_mission_reel else 'n/a'}",
            "meaning": "This is the fast first-pass audio reel from the mission-board focus windows. It reduces review friction without replacing the full-spine listen.",
            "nextAction": human_listen_mission_reel.get("nextSafeAction") or "Render the focused mission reel before asking for fast pass/fail notes.",
        },
        {
            "name": "Human listen mission reel notes",
            "status": human_listen_mission_reel_notes_inbox.get("status") or "missing",
            "metric": f"candidates={human_listen_mission_reel_notes_inbox.get('matchingCandidateCount') if human_listen_mission_reel_notes_inbox else 'n/a'}; decision={human_listen_mission_reel_notes_inbox.get('missionReelDecision') if human_listen_mission_reel_notes_inbox else 'n/a'}; smoke={str(bool(human_listen_mission_reel_notes_inbox_smoke.get('passed'))).lower()}; scenarios={human_listen_mission_reel_notes_inbox_smoke.get('scenarioCount') or 0}",
            "meaning": "Focused Mission Reel notes can now re-enter the audio workbench as repair/proof/pass-context evidence without pretending they are full-spine approval.",
            "nextAction": "If a reviewer returns Mission Reel notes, run this inbox before choosing scoped repair, focused proof, or the guarded full human-listen decision route.",
        },
        {
            "name": "Human approval preflight",
            "status": human_approval_preflight.get("preflightStatus") or "missing",
            "metric": f"readyForHumanDecision={str(bool(human_approval_preflight.get('readyForHumanDecision'))).lower()}; blockers={(human_approval_preflight.get('summary') or {}).get('blockerCount', 'n/a')}; technicalNotes={(human_approval_preflight.get('summary') or {}).get('technicalNotesCandidateCount', 'n/a')}; finalNotes={(human_approval_preflight.get('summary') or {}).get('finalFastPassNotesCandidateCount', 'n/a')}",
            "meaning": "This is the compact final runway check before a real human listen note is routed. It says what is ready, what remains locked, and what the next safe action is.",
            "nextAction": human_approval_preflight.get("safeNextAction") or "Generate the human approval preflight before routing approval or repair decisions.",
        },
        {
            "name": "Human listen decision front door",
            "status": human_listen_decision_front_door.get("status") or "missing",
            "metric": f"missingArtifacts={human_listen_decision_front_door.get('missingRequiredArtifactCount') if human_listen_decision_front_door else 'n/a'}; approval={human_listen_decision_front_door.get('approvalStatus') or approval_status}; branchInheritance={str(bool(human_listen_decision_front_door.get('branchInheritanceReady'))).lower() if human_listen_decision_front_door else str(branch_inheritance_ready).lower()}",
            "meaning": "This is the final human-facing routing page: listen, export/import notes, dry-run decision routing, record the guarded decision, then refresh gates.",
            "nextAction": human_listen_decision_front_door.get("nextSafeAction") or "Generate the decision front door before a reviewer records approval, failure, or focused-proof routing.",
        },
        {
            "name": "Unresolved requirement workbench",
            "status": unresolved_review.get("reviewStatus") or "missing",
            "metric": f"{unresolved_review.get('unresolvedRequirementCount') or 0} unresolved; partial {unresolved_review.get('partialRequirementCount') or 0}; locked {unresolved_review.get('lockedRequirementCount') or 0}; missing artifacts {unresolved_review.get('missingArtifactCount') if unresolved_review else 'n/a'}",
            "meaning": "This turns the goal audit's partial and locked items into direct reviewer action lanes so the edge of the system is visible, not implied.",
            "nextAction": "Open it after the command center when deciding whether the next step is listening, notes, dxRevive validation, or a scoped proof candidate.",
        },
        {
            "name": "Audio production doctrine",
            "status": production_doctrine.get("doctrineStatus") or "missing",
            "metric": f"stages {production_doctrine.get('stageCount') or 0}; missing artifacts {production_doctrine.get('stageMissingArtifactCount') if production_doctrine else 'n/a'}; dxRevive {production_doctrine.get('dxReviveStatus') or 'n/a'}; reuse {production_doctrine.get('reuseReadiness') or 'n/a'}",
            "meaning": "This is the reusable operating manual for the whole audio chain: source inventory, speaker-aware cleanup, dxRevive fallback, mastering, human listen, and future noisy episodes.",
            "nextAction": "Use it as the map before changing cleanup parameters or starting the next outdoor/noisy recording.",
        },
        {
            "name": "Transformation lineage",
            "status": transformation_lineage.get("lineageStatus") or "missing",
            "metric": f"stages {transformation_lineage.get('stageCount') or 0}; missing evidence {transformation_lineage.get('missingEvidenceCount') if transformation_lineage else 'n/a'}; locked stages {len(transformation_lineage.get('lockedStages') or []) if transformation_lineage else 'n/a'}",
            "meaning": "This is the provenance ledger for the current sound: what changed the audio, which artifacts prove each stage, and which controls own any future v007 repair.",
            "nextAction": "Use it before changing a parameter so repairs happen at the owning stage instead of through whole-pipeline guessing.",
        },
        {
            "name": "Transformation lineage smoke",
            "status": "passed" if transformation_lineage_smoke.get("passed") is True else "missing-or-failed",
            "metric": f"scenarios {transformation_lineage_smoke.get('scenarioCount') or 0}; failures {transformation_lineage_smoke.get('failedScenarioCount') if transformation_lineage_smoke else 'n/a'}; locks preserved {str(bool(transformation_lineage_smoke.get('realBranchStatePreserved'))).lower() if transformation_lineage_smoke else 'n/a'}",
            "meaning": "This contract smoke proves the lineage ledger can show complete evidence and missing evidence while preserving real approval and branch locks.",
            "nextAction": "Keep this passing before trusting the provenance ledger as the audio repair map.",
        },
        {
            "name": "Gate smoke suite",
            "status": "passed" if review_gate_smoke_passed else "needs-attention",
            "metric": f"{len(review_gate_smoke.get('scenarios') or [])} scenarios; approval preserved {str(bool(review_gate_smoke.get('realApprovalStatePreserved'))).lower()}; branch preserved {str(bool(review_gate_smoke.get('realBranchStatePreserved'))).lower()}; {stable_launcher_detail}",
            "meaning": "This proves the audit logic itself still rejects unsafe states and keeps the stable reviewer launcher pointed at the Producer Command Center first.",
            "nextAction": "Treat a failed smoke as a tooling blocker, not an audio blocker.",
        },
        {
            "name": "Final-listen fast pass",
            "status": "ready" if int_value(final_fast_pass.get("itemCount")) > 0 else "missing-or-stale",
            "metric": f"{final_fast_pass.get('itemCount') or 0} listen items; inbox candidates {final_fast_pass_inbox.get('matchingCandidateCount') or 0}",
            "meaning": "This is the shortest human listening path that still touches the risky sections.",
            "nextAction": "Open it first, export notes, then run the fast-pass notes inbox.",
        },
        {
            "name": "Broadcast polish",
            "status": broadcast_scorecard.get("overallStatus") or "not-generated",
            "metric": f"score {broadcast_scorecard.get('overallScore') or 'n/a'}; platform hard gates {(platform_loudness.get('summary') or {}).get('hardGateAttentionCount') if platform_loudness else 'n/a'}",
            "meaning": "Delivery loudness looks machine-ready, but smoothness/listen-check density still needs ear proof.",
            "nextAction": "Use the scorecard as a producer map, not as an approval stamp.",
        },
        {
            "name": "Sound Director scorecard",
            "status": sound_director_scorecard.get("status") or "not-generated",
            "metric": f"score {sound_director_scorecard.get('machineConfidenceScore') or 'n/a'}; hard stops {sound_director_scorecard.get('hardStopCount') or 0}; risks {sound_director_scorecard.get('reviewRiskCount') or 0}; missing {sound_director_scorecard.get('missingEvidenceCount') or 0}",
            "meaning": "This aggregates the audio proof surfaces into one machine-confidence/readiness view while keeping approval human-gated.",
            "nextAction": sound_director_scorecard.get("nextSafeAction") or "Generate the Sound Director scorecard before final human listen routing.",
        },
        {
            "name": "Morning publication readiness",
            "status": morning_publication_readiness.get("status") or "not-generated",
            "metric": f"ready {str(bool(morning_publication_readiness.get('readyForMorningReview'))).lower()}; Premiere use {str(bool(morning_publication_readiness.get('machineReadyForManualPremiereUse'))).lower()}; hard stops {morning_publication_readiness.get('hardStopCount') or 0}; platforms {morning_publication_readiness.get('platformCount') or 0}",
            "meaning": "This is the tired-human morning packet: which audio file to use, what can be reviewed, and what still cannot be called published.",
            "nextAction": morning_publication_readiness.get("nextSafeAction") or "Generate the morning readiness packet before Charlie tries to use the spine in Premiere or prepare platform packets.",
        },
        {
            "name": "Quality methods matrix",
            "status": quality_methods_matrix.get("status") or "not-generated",
            "metric": f"methods {quality_methods_matrix.get('methodCount') or 0}; implemented {quality_methods_matrix.get('implementedMethodCount') or 0}; next {quality_methods_matrix.get('recommendedNextMethodCount') or 0}; risks {quality_methods_matrix.get('reviewRiskCount') or 0}",
            "meaning": "This keeps the target honest: Episode 4 audio-spine quality first, then final episode/short editorial quality after the spine passes.",
            "nextAction": quality_methods_matrix.get("nextSafeAction") or "Generate the quality methods matrix before deciding whether to improve scoring or render final episode branches.",
        },
        {
            "name": "Blind listen sampler",
            "status": blind_listen_sampler.get("status") or "not-generated",
            "metric": f"samples {blind_listen_sampler.get('sampleCount') or 0}; notes {blind_listen_notes_inbox.get('matchingCandidateCount') or 0}; repair/proof/pass {blind_listen_notes_inbox.get('repairActionCount') or 0}/{blind_listen_notes_inbox.get('focusedProofActionCount') or 0}/{blind_listen_notes_inbox.get('passContextCount') or 0}; smoke failures {blind_listen_notes_inbox_smoke.get('failureCount') if blind_listen_notes_inbox_smoke else 'n/a'}",
            "meaning": "This gives Charlie/Mako a randomized, label-hidden listen path and a safe return inbox that maps notes back to Defect Atlas items without unlocking branches.",
            "nextAction": blind_listen_notes_inbox.get("route", {}).get("nextAction") if isinstance(blind_listen_notes_inbox.get("route"), dict) else blind_listen_sampler.get("nextSafeAction") or "Generate the blind listen sampler after the Defect Atlas and before recording guarded human approval.",
        },
        {
            "name": "Machine listen sentinel",
            "status": machine_listen_sentinel.get("status") or "not-generated",
            "metric": f"score {machine_listen_sentinel.get('score') or 'n/a'}; hard stops {machine_listen_sentinel.get('hardStopCount') or 0}; risks {machine_listen_sentinel.get('reviewRiskCount') or 0}",
            "meaning": "This adds direct machine-listening evidence over the mastered spine: loudness, peak, silence/gap behavior, channel balance, and inherited speaker survival.",
            "nextAction": machine_listen_sentinel.get("nextSafeAction") or "Generate the machine listen sentinel before relying on the spine for final episode branches.",
        },
        {
            "name": "Spectral fatigue",
            "status": spectral_fatigue_audit.get("status") or "not-generated",
            "metric": f"windows {spectral_fatigue_audit.get('windowCount') or 0}; measurements {spectral_fatigue_audit.get('measurementCount') or 0}; hard stops {spectral_fatigue_audit.get('hardStopCount') or 0}; risks {spectral_fatigue_audit.get('reviewRiskCount') or 0}",
            "meaning": "This adds voice-band evidence for rumble, mud, thinness, harshness, hiss, and over-squash fatigue before a human spends a full listen.",
            "nextAction": "Keep this free of hard stops before guarded spine approval; treat review risks as listen targets, not automatic repair orders.",
        },
        {
            "name": "Translation survival",
            "status": translation_survival_audit.get("status") or "not-generated",
            "metric": f"renders {translation_survival_audit.get('translationRenderCount') or 0}; hard stops {translation_survival_audit.get('hardStopCount') or 0}; risks {translation_survival_audit.get('reviewRiskCount') or 0}",
            "meaning": "This proves critical proof windows survive AAC, MP3, and phone-style listening transforms before final branches inherit the spine.",
            "nextAction": "Keep this green before recording guarded spine approval; if it turns yellow/red, inspect the translated snippets before branch renders.",
        },
        {
            "name": "Morning audio review launcher",
            "status": morning_audio_review_launcher.get("status") or "not-generated",
            "metric": f"hard stops {morning_audio_review_launcher.get('hardStopCount') or 0}; listen file {((morning_audio_review_launcher.get('recommendedListeningFile') or {}).get('exists')) if morning_audio_review_launcher else 'n/a'}; wav {((morning_audio_review_launcher.get('recommendedAudioFile') or {}).get('exists')) if morning_audio_review_launcher else 'n/a'}",
            "meaning": "This is the practical morning door: listen, reveal WAV, then approve/fail through guarded review.",
            "nextAction": morning_audio_review_launcher.get("nextSafeAction") or "Generate the morning audio review launcher before Charlie's morning listen.",
        },
        {
            "name": "Post-listen episode runway",
            "status": post_listen_episode_runway.get("status") or "not-generated",
            "metric": f"routes {post_listen_episode_runway.get('routeCount') or 0}; hard stops {post_listen_episode_runway.get('hardStopCount') or 0}; episode gate {(post_listen_episode_runway.get('qualityGates') or {}).get('finalEpisode', {}).get('status') if post_listen_episode_runway else 'n/a'}",
            "meaning": "This keeps the post-listen move clear: pass routes to branch gates, fail routes to scoped v007 repair/proof, final episodes/shorts stay downstream.",
            "nextAction": post_listen_episode_runway.get("nextSafeAction") or "Generate the post-listen runway before rendering Episode 4 packages.",
        },
        {
            "name": "Final listen mission",
            "status": final_listen_mission_packet.get("status") or "missing",
            "metric": f"steps={final_listen_mission_packet.get('missionStepCount') or 0}; missing={final_listen_mission_packet.get('missingRequiredArtifactCount') if final_listen_mission_packet else 'n/a'}",
            "meaning": "This is the minimal human mission packet so reviewers do not need to manually choose among every proof surface.",
            "nextAction": final_listen_mission_packet.get("nextSafeAction") or "Generate the final listen mission packet before routing tired humans through the full proof maze.",
        },
        {
            "name": "Technical audition",
            "status": technical_audition.get("status") or "not-generated",
            "metric": f"{technical_audition.get('sectionCount') or 0} sections; {technical_audition.get('listenMomentCount') or 0} listen priorities",
            "meaning": "This is the full-spine engineering map for where the master deserves ears before branch inheritance.",
            "nextAction": "Use it to choose listening sections and scoped repair targets; do not treat it as approval.",
        },
        {
            "name": "Technical audition snippets",
            "status": technical_audition_snippets.get("status") or "not-generated",
            "metric": f"{technical_audition_snippets.get('snippetCount') or 0} snippets; failures {technical_audition_snippets.get('renderFailureCount') or 0}",
            "meaning": "This makes the technical audition map playable without asking a reviewer to scrub the full master.",
            "nextAction": "Listen to these clips before deciding whether v006 needs a scoped v007 repair or can proceed to full human listen approval.",
        },
        {
            "name": "Technical audition notes",
            "status": "ready" if technical_audition_inbox.get("schema") else "not-generated",
            "metric": f"{technical_audition_inbox.get('matchingCandidateCount') or 0} candidates; repair/proof/pass {technical_audition_inbox.get('repairActionCount') or 0}/{technical_audition_inbox.get('focusedProofActionCount') or 0}/{technical_audition_inbox.get('passContextCount') or 0}",
            "meaning": "This is the return path from technical snippet review into the unified post-review action queue.",
            "nextAction": "After exporting notes from the technical audition snippet pack, rerun the inbox and post-review queue before any repair decision.",
        },
        {
            "name": "Smoothness/cadence proof",
            "status": "ready" if int_value(smoothness_pack.get("snippetCount")) > 0 and int_value(smoothness_pack.get("renderFailureCount")) == 0 else "needs-attention",
            "metric": f"{smoothness_pack.get('snippetCount') or 0} snippets; failures {smoothness_pack.get('renderFailureCount') if smoothness_pack else 'n/a'}; notes {smoothness_inbox.get('matchingCandidateCount') or 0}",
            "meaning": "This is where gate snap, robotic pauses, abrupt cadence, and dead-air concerns should be proved by ear.",
            "nextAction": "Pass it if it feels natural; otherwise route exact timestamps to scoped v007 repair.",
        },
        {
            "name": "Speaker preservation",
            "status": "ready" if int_value(speaker_preservation_pack.get("renderFailureCount")) == 0 and int_value(speaker_preservation_pack.get("itemCount")) > 0 else "needs-attention",
            "metric": f"{speaker_preservation_pack.get('itemCount') or 0} items; {speaker_preservation_pack.get('renderedSnippetCount') or 0} snippets; notes {speaker_preservation_inbox.get('matchingCandidateCount') or 0}",
            "meaning": "This proves whether cleanup preserved both speakers instead of flattening conversation into one voice or muting reactions.",
            "nextAction": "Listen to A/B snippets before accepting the spine as natural.",
        },
        {
            "name": "Speaker cleanup decision matrix",
            "status": speaker_cleanup_decision_matrix.get("decisionStatus") or "missing",
            "metric": f"{speaker_cleanup_decision_matrix.get('windowCount') or 0} windows; {speaker_cleanup_decision_matrix.get('proofSnippetCount') or 0} snippets; {speaker_cleanup_decision_matrix.get('missingSnippetCount') or 0} missing; {speaker_cleanup_decision_matrix.get('relatedContributionMarkerCount') or 0} contribution markers",
            "meaning": "This is the single review table for deciding whether speaker-aware cleanup sounds natural or needs scoped v007 repair.",
            "nextAction": "Use it when the proof pack and ledger feel too scattered; it keeps every cleanup decision attached to the evidence that supports it.",
        },
        {
            "name": "Speaker cleanup triage board",
            "status": speaker_cleanup_triage_board.get("status") or "missing",
            "metric": f"{speaker_cleanup_triage_board.get('windowCount') or 0} windows; {speaker_cleanup_triage_board.get('mustListenCount') or 0} must-listen; {speaker_cleanup_triage_board.get('missingSnippetCount') or 0} missing snippets",
            "meaning": "This is the fastest symptom-first pass/fail board for speaker cleanup. It keeps snippets, pass bars, fail lines, and safe repair actions in one place.",
            "nextAction": "Open it before approving or failing v006; use its notes template if scoped v007 repair or focused proof is needed.",
        },
        {
            "name": "Speaker cleanup acceptance",
            "status": speaker_cleanup_acceptance_board.get("status") or "missing",
            "metric": f"{speaker_cleanup_acceptance_board.get('machineCheckPassedCount') or 0}/{speaker_cleanup_acceptance_board.get('machineCheckCount') or 0} checks; {speaker_cleanup_acceptance_board.get('missingArtifactCount') if speaker_cleanup_acceptance_board else 'n/a'} missing artifacts; {speaker_cleanup_acceptance_board.get('mustListenCount') or 0} must-listen",
            "meaning": "This is the bridge from machine proof to human ears: it can say the cleanup evidence is complete, but it cannot approve v006.",
            "nextAction": "If it is green, listen and route notes. If it is not green, repair evidence before asking anyone to approve the spine.",
        },
        {
            "name": "Source-balance warnings",
            "status": source_balance_triage.get("status") or ("represented" if source_balance_companion else "missing"),
            "metric": (
                f"warnings {source_balance_triage.get('machineWarningCount') or manifest.get('audioMasterSourceBalanceLatestWarningCount') or 'n/a'}; "
                f"triage windows {source_balance_triage.get('triageWindowCount') or 0}; "
                f"speakers survive {str(bool(source_balance_triage.get('allSpeakersSurviveInMaster'))).lower()}"
            ),
            "meaning": "This separates speaker-survival proof from threshold, room, overlap, and queue-balance listen checks.",
            "nextAction": source_balance_triage.get("nextSafeAction")
            or "If a warning sounds real, use source-balance repair preflight or notes routing instead of whole-spine guessing.",
        },
        {
            "name": "dxRevive fallback",
            "status": dxrevive_return_workbench.get("status") or dxrevive_validation.get("status") or "not-generated",
            "metric": f"expected {dxrevive_return_workbench.get('expectedCount') or dxrevive_validation.get('expectedCount') or 0}; validated {dxrevive_return_workbench.get('validatedCount') or dxrevive_validation.get('validatedCount') or 0}; missing {dxrevive_return_workbench.get('missingCount') if dxrevive_return_workbench else dxrevive_validation.get('missingCount') or 0}; planner {dxrevive_return_workbench.get('plannerStatus') or dxrevive_planner.get('status') or 'n/a'}",
            "meaning": "The optional restoration bridge is safe and inspectable. The return workbench now shows exactly what is waiting, valid, or blocked.",
            "nextAction": "Open the dxRevive return workbench before any restoration decision; only use returned audio after validation and proof comparison against v006.",
        },
        {
            "name": "Unified post-review actions",
            "status": "ready" if post_review_queue.get("schema") else "missing",
            "metric": f"repair/proof/pass {post_review_queue.get('repairActionCount') or 0}/{post_review_queue.get('focusedProofActionCount') or 0}/{post_review_queue.get('passContextCount') or 0}",
            "meaning": "Reviewer notes will not be stranded in separate inboxes once exported.",
            "nextAction": "After any note export, regenerate the post-review queue and follow the smallest safe action.",
        },
        {
            "name": "Scoped v007 repair planning",
            "status": scoped_v007_repair_plan.get("status") or "missing",
            "metric": f"repair/proof/plans {scoped_v007_repair_plan.get('repairActionCount') or 0}/{scoped_v007_repair_plan.get('focusedProofActionCount') or 0}/{scoped_v007_repair_plan.get('plannedItemCount') or 0}; smoke {str(bool(scoped_v007_repair_plan_smoke.get('passed'))).lower()} ({scoped_v007_repair_plan_smoke.get('scenarioCount') or 0} scenarios)",
            "meaning": "This is where returned human notes become exact v007 proof or repair candidates instead of a whole-pipeline retune. The smoke proves future repair/proof notes route without touching the real baseline.",
            "nextAction": scoped_v007_repair_plan.get("nextSafeAction") or "Run the scoped v007 repair planner after the post-review action queue, then follow only stage-owned candidate plans.",
        },
        {
            "name": "Reviewer notes packet",
            "status": "ready" if output_path(outputs.get("latestReviewerNotesTemplateHtml")) and output_path(outputs.get("latestReviewerNotesTemplateOpenCommand")) else "missing",
            "metric": f"template {'ready' if output_path(outputs.get('latestReviewerNotesTemplateHtml')) else 'missing'}; launcher {'ready' if output_path(outputs.get('latestReviewerNotesTemplateOpenCommand')) else 'missing'}",
            "meaning": "This is the simplest durable place for human listen notes to land before any guarded pass/fail/needs-proof decision is recorded.",
            "nextAction": "Open it after listening, or import exported notes through the packet commands; never treat the template itself as approval.",
        },
        {
            "name": "Branch inheritance gate",
            "status": (load_output_report(outputs, "latestBranchInheritanceGate").get("status") if output_path(outputs.get("latestBranchInheritanceGate")) else "missing"),
            "metric": f"can inherit {str(bool(load_output_report(outputs, 'latestBranchInheritanceGate').get('canInheritForBranches'))).lower() if output_path(outputs.get('latestBranchInheritanceGate')) else 'missing'}",
            "meaning": "This is the gate that keeps long-form and shorts branches from inheriting an unapproved audio spine.",
            "nextAction": "After human approval, regenerate this gate before branch render work; before approval, leave it blocked.",
        },
        {
            "name": "Branch render preflight",
            "status": (load_output_report(outputs, "branchRenderPreflight").get("status") if output_path(outputs.get("branchRenderPreflight")) else "missing"),
            "metric": f"can render {str(bool(load_output_report(outputs, 'branchRenderPreflight').get('canRenderBranches'))).lower() if output_path(outputs.get('branchRenderPreflight')) else 'missing'}",
            "meaning": "This keeps real long-form and shorts renders behind approval and branch inheritance, while showing the exact commands that will become valid later.",
            "nextAction": "After approval and branch-gate refresh, regenerate this preflight before running the approved render executor.",
        },
        {
            "name": "Approved branch render executor",
            "status": (load_output_report(outputs, "latestApprovedBranchRenderExecutor").get("status") if output_path(outputs.get("latestApprovedBranchRenderExecutor")) else "missing"),
            "metric": (
                "commands exposed "
                f"{str(bool(load_output_report(outputs, 'latestApprovedBranchRenderExecutor').get('commandsExposed'))).lower() if output_path(outputs.get('latestApprovedBranchRenderExecutor')) else 'missing'}; "
                "can execute "
                f"{str(bool(load_output_report(outputs, 'latestApprovedBranchRenderExecutor').get('canExecuteRealRenders'))).lower() if output_path(outputs.get('latestApprovedBranchRenderExecutor')) else 'missing'}"
            ),
            "meaning": "This is the executable bridge from approved audio to actual Episode 4 long-form and shorts renders. Before human listen approval it should be visibly locked, not absent or stale.",
            "nextAction": "After human approval and branch-gate refresh, regenerate this executor and run only the branch commands it exposes.",
        },
        {
            "name": "Goal audit",
            "status": "tracked" if goal_audit else "missing",
            "metric": f"proved/partial/locked/missing {(goal_audit.get('statusCounts') or {}).get('proved', 0)}/{(goal_audit.get('statusCounts') or {}).get('partial', 0)}/{(goal_audit.get('statusCounts') or {}).get('locked', 0)}/{(goal_audit.get('statusCounts') or {}).get('missing', 0)}",
            "meaning": "This remains the requirement ledger. It should say what is truly proved, not what we wish was proved.",
            "nextAction": "Use the partial/locked items to avoid fake completion.",
        },
        {
            "name": "Stage map",
            "status": "ready" if stage_surface else "missing",
            "metric": f"stages {stage_surface.get('stageCount') if stage_surface else 'n/a'}; missing artifacts {stage_surface.get('missingArtifactCount') if stage_surface else 'n/a'}",
            "meaning": "This is the map that prevents knob folklore: each symptom routes to the stage that owns it.",
            "nextAction": "Use it before creating any new repair or enhancement path.",
        },
    ]

    next_safe_actions = [
        "Open the producer command center, then the final-listen fast pass.",
        "Listen for three things: natural conversation cadence, both speakers preserved, and no distracting echo/noise under the active speaker.",
        "If fast-pass clips feel good, sample the smoothness and speaker-preservation proof packs before approving.",
        "If anything feels wrong, export notes and route them into the post-review action queue; do not overwrite v006.",
        "Only after explicit human listen pass should branch inheritance and long-form renders unlock.",
    ]

    unresolved_requirements = []
    for item in goal_audit.get("requirements") or []:
        status = str(item.get("status") or "unknown")
        if status == "proved":
            continue
        evidence = item.get("evidence") if isinstance(item.get("evidence"), list) else []
        unresolved_requirements.append(
            {
                "title": str(item.get("title") or "Untitled requirement"),
                "status": status,
                "nextAction": str(item.get("nextAction") or "No next action recorded."),
                "evidence": [str(value) for value in evidence[:4]],
                "presentArtifactCount": len(item.get("presentArtifacts") or []),
                "missingArtifactCount": len(item.get("missingArtifacts") or []),
            }
        )

    missing_links = [item for item in primary_artifacts if not item["exists"]]
    if missing_links or not package_ready:
        command_center_status = "needs-artifact-refresh"
    elif not review_gate_passed:
        command_center_status = "needs-review-gate-repair"
    elif review_gate_warning_count > 0 or not review_gate_smoke_passed:
        command_center_status = "needs-review-gate-attention"
    else:
        command_center_status = "ready-for-human-listen"

    return {
        "schema": "quipsly.audio-workbench.producer-command-center.v1",
        "generatedAt": generated_at,
        "baselineDir": str(baseline_dir),
        "baselineId": baseline_id,
        "status": command_center_status,
        "approvalStatus": approval_status,
        "packageReadyForHumanListen": package_ready,
        "branchInheritanceReady": branch_inheritance_ready,
        "branchRenderReady": branch_render_ready,
        "humanListenStillRequired": approval_status != "human-approved-for-branch-inheritance",
        "commandCenterStatus": command_center_status,
        "primaryArtifactCount": len(primary_artifacts),
        "missingPrimaryArtifactCount": len(missing_links),
        "reviewCardCount": len(review_cards),
        "reviewGatePassed": review_gate_passed,
        "reviewGateSmokePassed": review_gate_smoke_passed,
        "reviewGateErrorCount": review_gate_error_count,
        "reviewGateWarningCount": review_gate_warning_count,
        "registeredReviewLauncherDetail": registered_launcher_detail,
        "baselineReviewLauncherDetail": baseline_launcher_detail,
        "stableStartHereLauncherDetail": stable_launcher_detail,
        "unresolvedRequirementCount": len(unresolved_requirements),
        "unresolvedRequirements": unresolved_requirements,
        "primaryArtifacts": primary_artifacts,
        "reviewCards": review_cards,
        "nextSafeActions": next_safe_actions,
        "safety": {
            "approvalStateChanged": False,
            "branchStateChanged": False,
            "renderAttempted": False,
            "uploadAttempted": False,
            "publicationAttempted": False,
            "originalMediaMutated": False,
        },
    }


def render_markdown(report: dict[str, Any]) -> str:
    lines = [
        f"# Episode 4 Audio Producer Command Center",
        "",
        f"Generated: `{report['generatedAt']}`",
        f"Baseline: `{report['baselineId']}`",
        "",
        "This is the calm producer front door for the current Episode 4 v006 audio candidate. It does not approve audio, fail audio, render branches, upload files, publish, or touch original media.",
        "",
        "## Current truth",
        "",
        f"- Status: `{report['commandCenterStatus']}`",
        f"- Approval: `{report['approvalStatus']}`",
        f"- Package ready for human listen: `{str(report['packageReadyForHumanListen']).lower()}`",
        f"- Human listen still required: `{str(report['humanListenStillRequired']).lower()}`",
        f"- Branch inheritance ready: `{str(report['branchInheritanceReady']).lower()}`",
        f"- Branch render ready: `{str(report['branchRenderReady']).lower()}`",
        f"- Primary artifacts: `{report['primaryArtifactCount']}`; missing `{report['missingPrimaryArtifactCount']}`",
        "",
        "## Producer review cards",
        "",
        "| Area | Status | Metric | Meaning | Next safe action |",
        "|---|---:|---|---|---|",
    ]
    for card in report["reviewCards"]:
        lines.append(f"| {card['name']} | `{card['status']}` | {card['metric']} | {card['meaning']} | {card['nextAction']} |")
    lines.extend(["", "## Open these first", ""])
    for item in report["primaryArtifacts"]:
        marker = "OK" if item["exists"] else "MISSING"
        lines.append(f"- `{marker}` {item['label']}: `{item.get('path') or 'not registered'}`")
        lines.append(f"  - Why: {item['why']}")
    lines.extend(["", "## Next safe actions", ""])
    for action in report["nextSafeActions"]:
        lines.append(f"- {action}")
    lines.extend(["", "## Still partial or locked", ""])
    if report.get("unresolvedRequirements"):
        for item in report["unresolvedRequirements"]:
            lines.append(f"### {item['title']}")
            lines.append("")
            lines.append(f"- Status: `{item['status']}`")
            lines.append(f"- Present artifacts: `{item['presentArtifactCount']}`; missing artifacts: `{item['missingArtifactCount']}`")
            lines.append(f"- Next safe action: {item['nextAction']}")
            if item.get("evidence"):
                lines.append("- Evidence:")
                for evidence in item["evidence"]:
                    lines.append(f"  - {evidence}")
            lines.append("")
    else:
        lines.append("- No partial or locked requirements were reported by the latest goal audit.")
    lines.extend(
        [
            "",
            "## Guardrails",
            "",
            f"- Approval state changed: `{str(report['safety']['approvalStateChanged']).lower()}`",
            f"- Branch state changed: `{str(report['safety']['branchStateChanged']).lower()}`",
            f"- Render attempted: `{str(report['safety']['renderAttempted']).lower()}`",
            f"- Upload attempted: `{str(report['safety']['uploadAttempted']).lower()}`",
            f"- Publication attempted: `{str(report['safety']['publicationAttempted']).lower()}`",
            f"- Original media mutated: `{str(report['safety']['originalMediaMutated']).lower()}`",
            "",
        ]
    )
    return "\n".join(lines)


def render_html(report: dict[str, Any]) -> str:
    card_html = []
    for card in report["reviewCards"]:
        card_html.append(
            f"""
            <article class=\"card\">
              <div class=\"status\">{e(card['status'])}</div>
              <h3>{e(card['name'])}</h3>
              <p class=\"metric\">{e(card['metric'])}</p>
              <p>{e(card['meaning'])}</p>
              <p class=\"next\">{e(card['nextAction'])}</p>
            </article>
            """
        )
    artifact_html = []
    for item in report["primaryArtifacts"]:
        label = e(item["label"])
        path = item.get("path")
        exists = item["exists"]
        href = Path(path).as_uri() if path and exists else "#"
        artifact_html.append(
            f"""
            <li class=\"artifact {'ok' if exists else 'missing'}\">
              <a href=\"{e(href)}\">{label}</a>
              <span>{'ready' if exists else 'missing'}</span>
              <small>{e(item['why'])}</small>
            </li>
            """
        )
    actions = "".join(f"<li>{e(action)}</li>" for action in report["nextSafeActions"])
    unresolved = []
    for item in report.get("unresolvedRequirements") or []:
        evidence_items = "".join(f"<li>{e(value)}</li>" for value in item.get("evidence") or [])
        unresolved.append(
            f"""
            <article class=\"unresolved {e(item['status'])}\">
              <div class=\"status\">{e(item['status'])}</div>
              <h3>{e(item['title'])}</h3>
              <p class=\"metric\">Artifacts: {item['presentArtifactCount']} present / {item['missingArtifactCount']} missing</p>
              <p class=\"next\">{e(item['nextAction'])}</p>
              <ul>{evidence_items}</ul>
            </article>
            """
        )
    return f"""<!doctype html>
<html lang=\"en\">
<head>
<meta charset=\"utf-8\" />
<title>Episode 4 Audio Producer Command Center</title>
<style>
:root {{
  color-scheme: dark;
  --bg: #101712;
  --panel: #17231b;
  --panel2: #203024;
  --ink: #f5ead2;
  --muted: #b7ad97;
  --gold: #e7c24a;
  --moss: #75c78b;
  --clay: #cf7252;
  --line: rgba(245,234,210,.14);
}}
* {{ box-sizing: border-box; }}
body {{ margin: 0; font-family: ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; background: radial-gradient(circle at top left, #263922, var(--bg) 42%); color: var(--ink); }}
main {{ width: min(1380px, calc(100vw - 48px)); margin: 32px auto 64px; }}
.hero {{ border: 1px solid var(--line); background: linear-gradient(135deg, rgba(231,194,74,.16), rgba(117,199,139,.08)), var(--panel); border-radius: 28px; padding: 28px; box-shadow: 0 28px 80px rgba(0,0,0,.35); }}
.eyebrow {{ color: var(--gold); letter-spacing: .18em; text-transform: uppercase; font-weight: 800; font-size: 12px; }}
h1 {{ font-size: clamp(36px, 5vw, 72px); line-height: .9; margin: 10px 0 14px; max-width: 900px; }}
.truth {{ display: flex; flex-wrap: wrap; gap: 10px; margin-top: 18px; }}
.pill {{ border: 1px solid var(--line); background: rgba(0,0,0,.22); border-radius: 999px; padding: 10px 14px; color: var(--muted); }}
.pill strong {{ color: var(--ink); }}
section {{ margin-top: 24px; }}
.grid {{ display: grid; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); gap: 14px; }}
.card {{ border: 1px solid var(--line); background: linear-gradient(180deg, rgba(255,255,255,.035), rgba(0,0,0,.08)), var(--panel); border-radius: 22px; padding: 18px; min-height: 210px; }}
.card h3 {{ margin: 8px 0; font-size: 22px; }}
.status {{ display: inline-flex; border-radius: 999px; background: rgba(231,194,74,.14); color: var(--gold); padding: 6px 10px; font-size: 12px; font-weight: 800; text-transform: uppercase; letter-spacing: .08em; }}
.metric {{ color: var(--moss); font-weight: 800; }}
.next {{ color: var(--ink); border-left: 3px solid var(--gold); padding-left: 12px; }}
.artifacts {{ display: grid; grid-template-columns: repeat(auto-fit, minmax(330px, 1fr)); gap: 10px; list-style: none; padding: 0; }}
.artifact {{ border: 1px solid var(--line); background: var(--panel2); border-radius: 18px; padding: 14px; display: grid; gap: 6px; }}
.artifact a {{ color: var(--ink); text-decoration: none; font-weight: 900; }}
.artifact span {{ width: fit-content; border-radius: 999px; padding: 4px 8px; font-size: 11px; text-transform: uppercase; font-weight: 900; }}
.artifact.ok span {{ background: rgba(117,199,139,.16); color: var(--moss); }}
.artifact.missing span {{ background: rgba(207,114,82,.16); color: var(--clay); }}
.artifact small {{ color: var(--muted); line-height: 1.4; }}
.actions {{ border: 1px solid var(--line); border-radius: 24px; padding: 22px; background: rgba(0,0,0,.22); }}
.actions li {{ margin: 10px 0; }}
.unresolved {{ border: 1px solid var(--line); background: rgba(0,0,0,.18); border-radius: 22px; padding: 18px; }}
.unresolved.partial {{ border-color: rgba(231,194,74,.34); }}
.unresolved.locked {{ border-color: rgba(207,114,82,.34); }}
.unresolved ul {{ color: var(--muted); line-height: 1.5; padding-left: 20px; }}
footer {{ color: var(--muted); margin-top: 28px; }}
</style>
</head>
<body>
<main>
  <div class=\"hero\">
    <div class=\"eyebrow\">Quipsly Audio Workbench</div>
    <h1>Episode 4 Producer Command Center</h1>
    <p>This is the calm front door for the current v006 candidate. It makes the next safe action visible without approving, rendering, uploading, publishing, or mutating source media.</p>
    <div class=\"truth\">
      <div class=\"pill\"><strong>Status</strong> {e(report['commandCenterStatus'])}</div>
      <div class=\"pill\"><strong>Approval</strong> {e(report['approvalStatus'])}</div>
      <div class=\"pill\"><strong>Human listen required</strong> {str(report['humanListenStillRequired']).lower()}</div>
      <div class=\"pill\"><strong>Branch inheritance</strong> {str(report['branchInheritanceReady']).lower()}</div>
      <div class=\"pill\"><strong>Missing primary artifacts</strong> {report['missingPrimaryArtifactCount']}</div>
    </div>
  </div>
  <section>
    <h2>Producer review cards</h2>
    <div class=\"grid\">{''.join(card_html)}</div>
  </section>
  <section>
    <h2>Open these first</h2>
    <ul class=\"artifacts\">{''.join(artifact_html)}</ul>
  </section>
  <section class=\"actions\">
    <h2>Next safe actions</h2>
    <ol>{actions}</ol>
  </section>
  <section>
    <h2>Still partial or locked</h2>
    <p>These are not failures. They are the honest edge of the current proof: what still needs ears, returned bounces, another messy episode, or explicit approval before Quipsly is allowed to move downstream.</p>
    <div class=\"grid\">{''.join(unresolved) if unresolved else '<p>No partial or locked requirements reported.</p>'}</div>
  </section>
  <footer>Generated {e(report['generatedAt'])}. Original media mutated: false.</footer>
</main>
</body>
</html>
"""


def write_open_command(path: Path, html_path: Path, markdown_path: Path) -> None:
    path.write_text("\n".join(["#!/bin/zsh", "set -euo pipefail", f"open {shell_quote(str(html_path))}", f"open {shell_quote(str(markdown_path))}"]) + "\n", encoding="utf-8")
    os.chmod(path, 0o755)


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
    output_dir = baseline_dir / f"audio-producer-command-center-{slug}-{generated_at}"
    output_dir.mkdir(parents=True, exist_ok=True)
    output_json = output_dir / "producer-command-center.json"
    output_md = output_dir / "producer-command-center.md"
    output_html = output_dir / "producer-command-center.html"
    open_command = output_dir / "open-producer-command-center.command"
    stable_json = baseline_dir / "PRODUCER_COMMAND_CENTER.json"
    stable_md = baseline_dir / "PRODUCER_COMMAND_CENTER.md"
    stable_html = baseline_dir / "PRODUCER_COMMAND_CENTER.html"
    stable_open_command = baseline_dir / "OPEN_PRODUCER_COMMAND_CENTER.command"

    report = build_command_center(manifest_before, baseline_dir, generated_at)
    write_json(output_json, report)
    markdown = render_markdown(report)
    html_doc = render_html(report)
    output_md.write_text(markdown, encoding="utf-8")
    output_html.write_text(html_doc, encoding="utf-8")
    write_open_command(open_command, output_html, output_md)
    write_json(stable_json, report)
    stable_md.write_text(markdown, encoding="utf-8")
    stable_html.write_text(html_doc, encoding="utf-8")
    write_open_command(stable_open_command, stable_html, stable_md)

    manifest_after = read_json(manifest_path)
    outputs = manifest_after.setdefault("outputs", {})
    entry = {
        "path": str(stable_json),
        "markdownPath": str(stable_md),
        "htmlPath": str(stable_html),
        "openCommand": str(stable_open_command),
        "versionedPath": str(output_json),
        "versionedMarkdownPath": str(output_md),
        "versionedHtmlPath": str(output_html),
        "versionedOpenCommand": str(open_command),
        "generatedAt": generated_at,
        "schema": report["schema"],
        "status": report["commandCenterStatus"],
        "reviewCardCount": report["reviewCardCount"],
        "primaryArtifactCount": report["primaryArtifactCount"],
        "missingPrimaryArtifactCount": report["missingPrimaryArtifactCount"],
        "approvalStateChanged": False,
        "branchStateChanged": False,
        "renderAttempted": False,
        "uploadAttempted": False,
        "publicationAttempted": False,
        "originalMediaMutated": False,
    }
    history = outputs.setdefault("audioProducerCommandCenters", [])
    history.append(entry)
    outputs["latestAudioProducerCommandCenter"] = entry
    outputs["latestAudioProducerCommandCenterMarkdown"] = str(stable_md)
    outputs["latestAudioProducerCommandCenterHtml"] = str(stable_html)
    outputs["latestAudioProducerCommandCenterOpenCommand"] = str(stable_open_command)
    outputs["latestAudioProducerCommandCenterVersionedJson"] = str(output_json)
    outputs["latestAudioProducerCommandCenterVersionedMarkdown"] = str(output_md)
    outputs["latestAudioProducerCommandCenterVersionedHtml"] = str(output_html)
    outputs["latestAudioProducerCommandCenterVersionedOpenCommand"] = str(open_command)
    manifest_after["audioProducerCommandCenterCount"] = len(history)
    manifest_after["audioProducerCommandCenterLatestStatus"] = report["commandCenterStatus"]
    manifest_after["audioProducerCommandCenterPrimaryArtifactCount"] = report["primaryArtifactCount"]
    manifest_after["audioProducerCommandCenterReviewCardCount"] = report["reviewCardCount"]
    manifest_after["audioProducerCommandCenterMissingPrimaryArtifactCount"] = report["missingPrimaryArtifactCount"]
    manifest_after["audioProducerCommandCenterLatestGeneratedAt"] = generated_at
    manifest_after["audioProducerCommandCenterLatestMarkdown"] = str(stable_md)
    manifest_after["audioCommandCenterLatestStatus"] = report["commandCenterStatus"]
    manifest_after["audioCommandCenterPrimaryArtifactCount"] = report["primaryArtifactCount"]
    manifest_after["audioCommandCenterReviewCardCount"] = report["reviewCardCount"]
    manifest_after["audioCommandCenterMissingPrimaryArtifactCount"] = report["missingPrimaryArtifactCount"]
    manifest_after["audioCommandCenterLatestGeneratedAt"] = generated_at
    manifest_after["audioCommandCenterLatestMarkdown"] = str(stable_md)
    manifest_after["audioProducerCommandCenterOriginalMediaMutated"] = False
    manifest_after["audioProducerCommandCenterApprovalStateChanged"] = False
    manifest_after["audioProducerCommandCenterBranchStateChanged"] = False
    write_json(manifest_path, manifest_after)
    print(json.dumps(entry, indent=2, sort_keys=True))


if __name__ == "__main__":
    main()
