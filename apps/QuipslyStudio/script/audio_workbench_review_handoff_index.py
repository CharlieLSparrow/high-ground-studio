#!/usr/bin/env python3
"""Generate a human review handoff index for a Quipsly audio baseline.

This is intentionally not an approval tool. It gathers the current manifest
truth, verifies the linked review artifacts, and writes a small Markdown/JSON
index that makes the next human-listen step obvious.
"""

from __future__ import annotations

import argparse
import json
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


@dataclass(frozen=True)
class Artifact:
    label: str
    key: str
    path: str | None

    @property
    def exists(self) -> bool:
        return bool(self.path) and Path(self.path).exists()

    @property
    def size(self) -> int | None:
        if not self.exists:
            return None
        return Path(self.path or "").stat().st_size


def output_path(value: Any) -> str | None:
    if value is None:
        return None
    if isinstance(value, str):
        return value
    if isinstance(value, dict):
        path = value.get("path")
        if isinstance(path, str):
            return path
    return None


def load_manifest(baseline_dir: Path) -> tuple[Path, dict[str, Any]]:
    manifest_path = baseline_dir / "manifest.json"
    if not manifest_path.exists():
        raise SystemExit(f"Missing manifest: {manifest_path}")
    return manifest_path, json.loads(manifest_path.read_text())


def slug_for(manifest: dict[str, Any]) -> str:
    baseline_id = str(manifest.get("baselineId") or "audio-baseline")
    slug = baseline_id.replace("episode-4-conformed-production-baseline-", "")
    return "".join(ch if ch.isalnum() or ch in "-_" else "-" for ch in slug).strip("-") or "audio-baseline"


def collect_artifacts(manifest: dict[str, Any]) -> list[Artifact]:
    outputs = manifest.get("outputs") or {}
    artifact_specs = [
        ("Review cockpit", "audioReviewCockpitHtml"),
        ("Editor handoff packet", "latestEditorHandoffPacketMarkdown"),
        ("Editor marker packet", "latestEditorMarkerPacketMarkdown"),
        ("Editor marker CSV", "latestEditorMarkerPacketCsv"),
        ("Editor marker playlist", "latestEditorMarkerPacketPlaylist"),
        ("Editor marker review console", "latestEditorMarkerReviewConsoleHtml"),
        ("Editor marker review notes template", "latestEditorMarkerReviewConsoleNotesTemplate"),
        ("Marker review command packet", "latestMarkerReviewCommandPacketMarkdown"),
        ("Marker review command packet JSON", "latestMarkerReviewCommandPacket"),
        ("Marker review notes inbox", "latestMarkerReviewNotesInboxMarkdown"),
        ("Marker review notes inbox smoke", "latestMarkerReviewNotesInboxSmokeMarkdown"),
        ("Stable audio review START HERE", "latestAudioReviewStartHereMarkdown"),
        ("Stable audio review open command", "latestAudioReviewStartHereOpenCommand"),
        ("Human listen decision brief", "latestAudioHumanListenDecisionBriefMarkdown"),
        ("Human-listen decision rehearsal", "latestHumanListenDecisionRehearsalMarkdown"),
        ("Human-listen decision rehearsal open command", "latestHumanListenDecisionRehearsalOpenCommand"),
        ("Stable audio review status board", "latestAudioReviewStatusBoardStableMarkdown"),
        ("Audio review status check command", "latestAudioReviewStatusCheckCommand"),
        ("Latest timestamped audio review status board", "latestAudioReviewStatusBoardMarkdown"),
        ("Audio review status board smoke", "latestAudioReviewStatusBoardSmokeMarkdown"),
        ("Audio review gate audit", "latestAudioReviewGateAuditMarkdown"),
        ("Audio review gate audit smoke", "latestAudioReviewGateAuditSmokeMarkdown"),
        ("Audio workbench stage control surface", "latestAudioWorkbenchStageControlSurfaceMarkdown"),
        ("Audio workbench stage control surface HTML", "latestAudioWorkbenchStageControlSurfaceHtml"),
        ("Audio workbench stage control surface open command", "latestAudioWorkbenchStageControlSurfaceOpenCommand"),
        ("Audio producer-grade audit", "latestAudioProducerGradeAuditMarkdown"),
        ("Audio producer-grade audit HTML", "latestAudioProducerGradeAuditHtml"),
        ("Audio producer-grade audit open command", "latestAudioProducerGradeAuditOpenCommand"),
        ("Audio producer-grade notes template", "latestAudioProducerGradeNotesTemplate"),
        ("Audio producer-grade notes inbox", "latestAudioProducerGradeNotesInboxMarkdown"),
        ("Audio producer-grade notes inbox JSON", "latestAudioProducerGradeNotesInbox"),
        ("Audio producer-grade notes inbox smoke", "latestAudioProducerGradeNotesInboxSmokeMarkdown"),
        ("Audio producer-grade audit smoke", "latestAudioProducerGradeAuditSmokeMarkdown"),
        ("Audio producer command center", "latestAudioProducerCommandCenterMarkdown"),
        ("Audio producer command center HTML", "latestAudioProducerCommandCenterHtml"),
        ("Audio producer command center open command", "latestAudioProducerCommandCenterOpenCommand"),
        ("Audio runway state", "latestAudioRunwayStateMarkdown"),
        ("Audio runway state HTML", "latestAudioRunwayStateHtml"),
        ("Audio runway state open command", "latestAudioRunwayStateOpenCommand"),
        ("Audio listen proof coverage map", "latestAudioListenProofCoverageMapMarkdown"),
        ("Audio listen proof coverage map HTML", "latestAudioListenProofCoverageMapHtml"),
        ("Audio listen proof coverage map open command", "latestAudioListenProofCoverageMapOpenCommand"),
        ("Audio human approval preflight", "latestAudioHumanApprovalPreflightMarkdown"),
        ("Audio human approval preflight HTML", "latestAudioHumanApprovalPreflightHtml"),
        ("Audio human approval preflight open command", "latestAudioHumanApprovalPreflightOpenCommand"),
        ("Human listen decision front door", "latestHumanListenDecisionFrontDoorMarkdown"),
        ("Human listen decision front door HTML", "latestHumanListenDecisionFrontDoorHtml"),
        ("Human listen decision front door open command", "latestHumanListenDecisionFrontDoorOpenCommand"),
        ("Human listen decision front-door smoke", "latestHumanListenDecisionFrontDoorSmokeMarkdown"),
        ("Audio unresolved requirement review", "latestAudioUnresolvedRequirementReviewMarkdown"),
        ("Audio unresolved requirement review HTML", "latestAudioUnresolvedRequirementReviewHtml"),
        ("Audio unresolved requirement review open command", "latestAudioUnresolvedRequirementReviewOpenCommand"),
        ("Audio production doctrine", "latestAudioProductionDoctrineMarkdown"),
        ("Audio production doctrine HTML", "latestAudioProductionDoctrineHtml"),
        ("Audio production doctrine open command", "latestAudioProductionDoctrineOpenCommand"),
        ("Audio transformation lineage ledger", "latestAudioTransformationLineageLedgerMarkdown"),
        ("Audio transformation lineage ledger HTML", "latestAudioTransformationLineageLedgerHtml"),
        ("Audio transformation lineage ledger open command", "latestAudioTransformationLineageLedgerOpenCommand"),
        ("Audio transformation lineage ledger smoke", "latestAudioTransformationLineageLedgerSmokeMarkdown"),
        ("Audio transformation lineage ledger smoke open command", "latestAudioTransformationLineageLedgerSmokeOpenCommand"),
        ("Audio final listen fast pass", "latestAudioFinalListenFastPassMarkdown"),
        ("Audio final listen fast pass HTML", "latestAudioFinalListenFastPassHtml"),
        ("Audio final listen fast pass open command", "latestAudioFinalListenFastPassOpenCommand"),
        ("Audio final listen fast pass notes template", "latestAudioFinalListenFastPassNotesTemplate"),
        ("Audio final listen fast pass notes inbox", "latestAudioFinalListenFastPassNotesInboxMarkdown"),
        ("Audio platform loudness audit", "latestAudioPlatformLoudnessAuditMarkdown"),
        ("Audio platform loudness audit HTML", "latestAudioPlatformLoudnessAuditHtml"),
        ("Audio platform loudness audit open command", "latestAudioPlatformLoudnessAuditOpenCommand"),
        ("Audio broadcast polish scorecard", "latestAudioBroadcastPolishScorecardMarkdown"),
        ("Audio broadcast polish scorecard HTML", "latestAudioBroadcastPolishScorecardHtml"),
        ("Audio broadcast polish scorecard open command", "latestAudioBroadcastPolishScorecardOpenCommand"),
        ("Audio technical audition snippet pack", "latestAudioTechnicalAuditionSnippetPackMarkdown"),
        ("Audio technical audition snippet pack HTML", "latestAudioTechnicalAuditionSnippetPackHtml"),
        ("Audio technical audition snippet pack open command", "latestAudioTechnicalAuditionSnippetPackOpenCommand"),
        ("Audio technical audition snippet notes template", "latestAudioTechnicalAuditionSnippetPackNotesTemplate"),
        ("Audio technical audition notes inbox", "latestAudioTechnicalAuditionNotesInboxMarkdown"),
        ("Audio technical audition notes inbox JSON", "latestAudioTechnicalAuditionNotesInbox"),
        ("Audio smoothness proof pack", "latestAudioSmoothnessProofPackMarkdown"),
        ("Audio smoothness proof pack HTML", "latestAudioSmoothnessProofPackHtml"),
        ("Audio smoothness proof pack playlist", "latestAudioSmoothnessProofPackPlaylist"),
        ("Audio smoothness proof pack notes template", "latestAudioSmoothnessProofPackNotesTemplate"),
        ("Audio smoothness proof pack open command", "latestAudioSmoothnessProofPackOpenCommand"),
        ("Audio smoothness proof notes inbox", "latestAudioSmoothnessProofNotesInboxMarkdown"),
        ("Audio smoothness proof notes inbox JSON", "latestAudioSmoothnessProofNotesInbox"),
        ("Audio post-review action queue", "latestAudioPostReviewActionQueueMarkdown"),
        ("Audio post-review action queue JSON", "latestAudioPostReviewActionQueue"),
        ("Audio repair/tuning console", "latestAudioWorkbenchRepairTuningConsoleMarkdown"),
        ("Audio repair/tuning console HTML", "latestAudioWorkbenchRepairTuningConsoleHtml"),
        ("Audio repair/tuning console open command", "latestAudioWorkbenchRepairTuningConsoleOpenCommand"),
        ("Audio repair/tuning console smoke", "latestAudioWorkbenchRepairTuningConsoleSmokeMarkdown"),
        ("Audio parameter control ledger", "latestAudioWorkbenchParameterControlLedgerMarkdown"),
        ("Audio parameter control ledger HTML", "latestAudioWorkbenchParameterControlLedgerHtml"),
        ("Audio parameter control ledger open command", "latestAudioWorkbenchParameterControlLedgerOpenCommand"),
        ("Audio parameter control ledger smoke", "latestAudioWorkbenchParameterControlLedgerSmokeMarkdown"),
        ("Audio parameter sweep proof plan", "latestAudioWorkbenchParameterSweepProofPlanMarkdown"),
        ("Audio parameter sweep proof plan HTML", "latestAudioWorkbenchParameterSweepProofPlanHtml"),
        ("Audio parameter sweep proof plan open command", "latestAudioWorkbenchParameterSweepProofPlanOpenCommand"),
        ("Audio parameter sweep proof plan smoke", "latestAudioWorkbenchParameterSweepProofPlanSmokeMarkdown"),
        ("Audio parameter sweep proof snippet pack", "latestAudioWorkbenchParameterSweepProofSnippetPackMarkdown"),
        ("Audio parameter sweep proof snippet pack HTML", "latestAudioWorkbenchParameterSweepProofSnippetPackHtml"),
        ("Audio parameter sweep proof snippet playlist", "latestAudioWorkbenchParameterSweepProofSnippetPackPlaylist"),
        ("Audio parameter sweep proof snippet pack open command", "latestAudioWorkbenchParameterSweepProofSnippetPackOpenCommand"),
        ("Audio parameter sweep proof snippet pack smoke", "latestAudioWorkbenchParameterSweepProofSnippetPackSmokeMarkdown"),
        ("Audio parameter sweep proof notes inbox", "latestAudioWorkbenchParameterSweepNotesInboxMarkdown"),
        ("Audio parameter sweep proof notes inbox JSON", "latestAudioWorkbenchParameterSweepNotesInbox"),
        ("Audio parameter sweep proof notes inbox smoke", "latestAudioWorkbenchParameterSweepNotesInboxSmokeMarkdown"),
        ("Audio master visual overview", "latestAudioMasterVisualOverviewMarkdown"),
        ("Audio master visual overview HTML", "latestAudioMasterVisualOverviewHtml"),
        ("Audio master full waveform", "latestAudioMasterVisualOverviewFullWaveformPng"),
        ("Speaker bleed/gap proof audit", "latestSpeakerBleedGapProofAuditMarkdown"),
        ("Audio goal completion audit", "latestAudioGoalCompletionAuditMarkdown"),
        ("Audio master smoothness audit", "latestAudioMasterSmoothnessAuditMarkdown"),
        ("Audio master/source balance audit", "latestAudioMasterSourceBalanceAuditMarkdown"),
        ("Audio source-balance listen companion", "latestAudioSourceBalanceListenCompanionMarkdown"),
        ("Audio source-balance listen companion open command", "latestAudioSourceBalanceListenCompanionOpenCommand"),
        ("Audio speaker contribution ledger", "latestAudioSpeakerContributionLedgerMarkdown"),
        ("Audio speaker contribution ledger HTML", "latestAudioSpeakerContributionLedgerHtml"),
        ("Audio speaker contribution review markers CSV", "latestAudioSpeakerContributionLedgerCsv"),
        ("Audio speaker contribution ledger open command", "latestAudioSpeakerContributionLedgerOpenCommand"),
        ("Audio speaker preservation proof pack", "latestAudioSpeakerPreservationProofPackMarkdown"),
        ("Audio speaker preservation proof pack HTML", "latestAudioSpeakerPreservationProofPackHtml"),
        ("Audio speaker preservation proof pack playlist", "latestAudioSpeakerPreservationProofPackPlaylist"),
        ("Audio speaker preservation proof notes template", "latestAudioSpeakerPreservationProofPackNotesTemplate"),
        ("Audio speaker preservation proof pack open command", "latestAudioSpeakerPreservationProofPackOpenCommand"),
        ("Audio speaker preservation proof notes inbox", "latestAudioSpeakerPreservationProofNotesInboxMarkdown"),
        ("Audio speaker preservation proof notes inbox JSON", "latestAudioSpeakerPreservationProofNotesInbox"),
        ("Audio speaker activity review board", "latestAudioSpeakerActivityReviewBoardMarkdown"),
        ("Audio speaker activity review board HTML", "latestAudioSpeakerActivityReviewBoardHtml"),
        ("Audio speaker cleanup proof pack", "latestSpeakerCleanupProofPackMarkdown"),
        ("Audio speaker cleanup proof pack HTML", "latestSpeakerCleanupProofPackHtml"),
        ("Audio speaker cleanup proof pack playlist", "latestSpeakerCleanupProofPackPlaylist"),
        ("Audio speaker cleanup proof pack audit", "latestSpeakerCleanupProofPackAuditMarkdown"),
        ("Audio speaker cleanup listen map", "latestSpeakerCleanupListenMapMarkdown"),
        ("Audio speaker cleanup listen map HTML", "latestSpeakerCleanupListenMapHtml"),
        ("Audio speaker cleanup listen map open command", "latestSpeakerCleanupListenMapOpenCommand"),
        ("Audio speaker cleanup decision matrix", "latestSpeakerCleanupDecisionMatrixMarkdown"),
        ("Audio speaker cleanup decision matrix HTML", "latestSpeakerCleanupDecisionMatrixHtml"),
        ("Audio speaker cleanup decision matrix open command", "latestSpeakerCleanupDecisionMatrixOpenCommand"),
        ("Audio spine listen sanity check", "latestAudioSpineListenSanityCheckMarkdown"),
        ("Reusable audio production profile", "latestReusableAudioProductionProfileMarkdown"),
        ("Stable reusable audio production profile", "stableReusableAudioProductionProfileMarkdown"),
        ("Reusable audio production profile smoke", "latestReusableAudioProductionProfileSmokeMarkdown"),
        ("Reusable audio profile intake packet", "latestReusableAudioProfileIntakePacketMarkdown"),
        ("Reusable audio profile intake packet open command", "latestReusableAudioProfileIntakePacketOpenCommand"),
        ("Reusable audio profile intake packet smoke", "latestReusableAudioProfileIntakePacketSmokeMarkdown"),
        ("dxRevive manual bounce packet", "latestDxReviveManualBouncePacketMarkdown"),
        ("dxRevive manual bounce packet open command", "latestDxReviveManualBouncePacketOpenCommand"),
        ("dxRevive return workbench", "latestDxReviveReturnWorkbenchMarkdown"),
        ("dxRevive return workbench HTML", "latestDxReviveReturnWorkbenchHtml"),
        ("dxRevive return workbench open command", "latestDxReviveReturnWorkbenchOpenCommand"),
        ("dxRevive bounce validation", "latestDxReviveBounceValidationMarkdown"),
        ("dxRevive bounce validator smoke", "latestDxReviveBounceValidatorSmokeMarkdown"),
        ("dxRevive proof candidate planner", "latestDxReviveProofCandidatePlannerMarkdown"),
        ("dxRevive proof candidate planner smoke", "latestDxReviveProofCandidatePlannerSmokeMarkdown"),
        ("Audio source-balance repair workorder", "latestAudioSourceBalanceRepairWorkorderMarkdown"),
        ("Audio source-balance repair preflight", "latestAudioSourceBalanceRepairPreflightMarkdown"),
        ("Audio source-balance repair preflight audit", "latestAudioSourceBalanceRepairPreflightAuditMarkdown"),
        ("Audio source-balance repair proof playlist", "latestAudioSourceBalanceRepairProofPlaylist"),
        ("Audio listen-priority console", "latestAudioListenPriorityConsoleMarkdown"),
        ("Audio listen-priority console HTML", "latestAudioListenPriorityConsoleHtml"),
        ("Audio listen-priority console open command", "latestAudioListenPriorityConsoleOpenCommand"),
        ("Audio listen-priority queue", "latestAudioListenPriorityQueueMarkdown"),
        ("Audio listen-priority snippet pack", "latestAudioListenPrioritySnippetPackMarkdown"),
        ("Audio listen-priority snippet pack HTML", "latestAudioListenPrioritySnippetPackHtml"),
        ("Audio listen-priority snippet pack playlist", "latestAudioListenPrioritySnippetPackPlaylist"),
        ("Audio listen-priority snippet pack open command", "latestAudioListenPrioritySnippetPackOpenCommand"),
        ("Audio human listen control room", "latestAudioHumanListenControlRoomHtml"),
        ("Audio human listen control room Markdown", "latestAudioHumanListenControlRoomMarkdown"),
        ("Audio human listen control room open command", "latestAudioHumanListenControlRoomOpenCommand"),
        ("Audio human listen control room notes template", "latestAudioHumanListenControlRoomNotesTemplate"),
        ("Audio listen-priority review reel", "latestAudioListenPriorityReviewReelMarkdown"),
        ("Audio listen-priority review reel HTML", "latestAudioListenPriorityReviewReelHtml"),
        ("Audio listen-priority review reel M4A", "latestAudioListenPriorityReviewReelM4a"),
        ("Audio listen-priority review reel open command", "latestAudioListenPriorityReviewReelOpenCommand"),
        ("Audio listen-priority review reel notes template", "latestAudioListenPriorityReviewReelNotesTemplate"),
        ("Audio listen-priority review reel notes smoke", "latestAudioListenPriorityReviewReelNotesSmokeMarkdown"),
        ("Audio listen-priority review reel chapter CSV", "latestAudioListenPriorityReviewReelChapterCsv"),
        ("Audio listen-priority snippet pack audit", "latestAudioListenPrioritySnippetPackAuditMarkdown"),
        ("Audio listen-priority notes inbox", "latestAudioListenPriorityNotesInboxMarkdown"),
        ("Audio listen-priority notes inbox smoke", "latestAudioListenPriorityNotesInboxSmokeMarkdown"),
        ("Speaker cleanup listen-map notes inbox", "latestSpeakerCleanupListenMapNotesInboxMarkdown"),
        ("Speaker cleanup listen-map notes inbox smoke", "latestSpeakerCleanupListenMapNotesInboxSmokeMarkdown"),
        ("Audio listen-notes repair planner", "latestAudioListenNotesRepairPlannerMarkdown"),
        ("Audio listen-notes repair planner smoke", "latestAudioListenNotesRepairPlannerSmokeMarkdown"),
        ("Listen review packet", "listenReviewPacketMarkdown"),
        ("Listen decision matrix", "latestListenDecisionMatrixMarkdown"),
        ("Proof-window audio lab", "latestProofWindowAudioLabMarkdown"),
        ("Reviewer notes template", "latestReviewerNotesTemplateMarkdown"),
        ("Reviewer notes template HTML", "latestReviewerNotesTemplateHtml"),
        ("Reviewer notes template open command", "latestReviewerNotesTemplateOpenCommand"),
        ("Reviewer notes decision bridge smoke", "latestReviewerNotesDecisionBridgeSmokeMarkdown"),
        ("Audio reviewer console", "latestAudioReviewerConsoleHtml"),
        ("Visual proof-window QC page", "latestVisualProofWindowsHtml"),
        ("Visual proof-window QC report", "latestVisualProofWindowsMarkdown"),
        ("Review readiness verification", "latestReviewReadinessVerificationMarkdown"),
        ("Post-listen next-actions plan", "latestPostListenNextActionsMarkdown"),
        ("Post-listen outcome router", "latestPostListenOutcomeRouterMarkdown"),
        ("Post-listen outcome router smoke", "latestPostListenOutcomeRouterSmokeMarkdown"),
        ("Listen-decision command verification", "latestListenDecisionCommandVerificationMarkdown"),
        ("Approved branch-render executor", "latestApprovedBranchRenderExecutorMarkdown"),
        ("Approval-path sandbox smoke", "latestApprovalPathSmokeMarkdown"),
        ("Approval-path sandbox smoke open command", "latestApprovalPathSmokeOpenCommand"),
        ("Branch inheritance gate HTML", "latestBranchInheritanceGateHtml"),
        ("Branch inheritance gate open command", "latestBranchInheritanceGateOpenCommand"),
        ("Branch render preflight HTML", "branchRenderPreflightHtml"),
        ("Branch render preflight open command", "branchRenderPreflightOpenCommand"),
        ("Bleed management audit", "latestBleedManagementAuditMarkdown"),
        ("Bleed repair workorder", "latestBleedRepairWorkorderMarkdown"),
        ("Bleed repair preflight", "latestBleedRepairPreflightMarkdown"),
        ("Bleed repair executor", "latestBleedRepairExecutorMarkdown"),
        ("Bleed repair executor smoke", "latestBleedRepairExecutorSmokeMarkdown"),
        ("Human listen session", "latestHumanListenSessionReadme"),
        ("Human review bundle", "latestHumanReviewBundleReadme"),
        ("Listen-proof bundle folder", "listenProofBundle"),
        ("Listen-proof bundle manifest", "listenProofBundleManifest"),
        ("Listen decision template", "latestListenDecisionTemplateMarkdown"),
        ("Branch inheritance gate", "latestBranchInheritanceGateMarkdown"),
        ("Branch render preflight", "branchRenderPreflightMarkdown"),
        ("Branch render preflight HTML", "branchRenderPreflightHtml"),
        ("Branch render preflight open command", "branchRenderPreflightOpenCommand"),
        ("Branch render proof evidence", "latestBranchRenderProofMarkdown"),
        ("QC report", "qualityReportMarkdown"),
        ("Source activity report", "sourceActivityMarkdown"),
        ("Source contribution report", "sourceContributionMarkdown"),
        ("Handoff WAV", "masterWav"),
        ("Listening M4A", "masterM4a"),
    ]
    artifacts: list[Artifact] = []
    seen: set[tuple[str, str | None]] = set()
    for label, key in artifact_specs:
        path = output_path(outputs.get(key))
        item = Artifact(label=label, key=key, path=str(path) if path else None)
        dedupe = (label, item.path)
        if dedupe not in seen:
            artifacts.append(item)
            seen.add(dedupe)
    return artifacts


def status_value(manifest: dict[str, Any], key: str, fallback: Any = None) -> Any:
    value = manifest.get(key, fallback)
    if value is None:
        return fallback
    return value


def shell_quote(path: str) -> str:
    return "'" + path.replace("'", "'\\''") + "'"


def build_markdown(
    baseline_dir: Path,
    manifest: dict[str, Any],
    artifacts: list[Artifact],
    generated_at: str,
) -> str:
    outputs = manifest.get("outputs") or {}
    approval_status = status_value(manifest, "approvalStatus", "unknown")
    branch_inheritance_ready = bool(manifest.get("branchInheritanceReady"))
    branch_render_ready = bool(manifest.get("branchRenderReady"))
    branch_render_proof_count = int(manifest.get("branchRenderProofCount") or 0)
    baseline_id = str(manifest.get("baselineId") or "unknown")
    cockpit = outputs.get("audioReviewCockpitHtml") or outputs.get("audioReviewCockpit")
    decision_template = outputs.get("latestListenDecisionTemplateMarkdown")
    decision_rehearsal = outputs.get("latestHumanListenDecisionRehearsalMarkdown")
    decision_rehearsal_open_command = outputs.get("latestHumanListenDecisionRehearsalOpenCommand")

    pass_command = "\n".join(
        [
            "OUT=" + shell_quote(str(baseline_dir)),
            "python3 apps/QuipslyStudio/script/audio_workbench_record_listen_decision.py \\",
            '  --baseline-dir "$OUT" \\',
            '  --status human-approved-for-branch-inheritance \\',
            '  --reviewer "Charlie or Mako" \\',
            '  --notes "Human listened to v006 bundle and approved it for edit branch inheritance." \\',
            "  --confirm-human-listened",
            'python3 apps/QuipslyStudio/script/audio_workbench_post_listen_refresh.py --baseline-dir "$OUT"',
        ]
    )
    fail_command = "\n".join(
        [
            "OUT=" + shell_quote(str(baseline_dir)),
            "python3 apps/QuipslyStudio/script/audio_workbench_record_listen_decision.py \\",
            '  --baseline-dir "$OUT" \\',
            "  --status failed-human-listen \\",
            '  --reviewer "Charlie or Mako" \\',
            '  --notes "Human listen found an issue; render v007/timestamped repair candidate instead of overwriting v006." \\',
            '  --issue "Describe the failing window or artifact here" \\',
            "  --confirm-human-listened",
        ]
    )

    missing = [artifact for artifact in artifacts if not artifact.exists]
    artifact_rows = []
    for artifact in artifacts:
        status = "present" if artifact.exists else "missing"
        size = "" if artifact.size is None else f" ({artifact.size} bytes)"
        path = artifact.path or ""
        artifact_rows.append(f"| {artifact.label} | `{artifact.key}` | {status}{size} | `{path}` |")

    lines = [
        f"# Audio Review Handoff Index: {baseline_id}",
        "",
        f"Generated: `{generated_at}`",
        "",
        "## Current truth",
        "",
        f"- Approval status: `{approval_status}`",
        f"- Branch inheritance ready: `{str(branch_inheritance_ready).lower()}`",
        f"- Branch render ready: `{str(branch_render_ready).lower()}`",
        f"- Branch render proof count: `{branch_render_proof_count}`",
        "- Publication approved: `false` unless a later manifest explicitly says otherwise",
        "",
        "This handoff index does not approve v006. It exists to make the human listen decision easier and safer.",
        "",
        "## What to open first",
        "",
    ]
    if cockpit:
        lines.append(f"- Review cockpit: `{cockpit}`")
        lines.append("")
        lines.append("```bash")
        lines.append(f"open {shell_quote(str(cockpit))}")
        lines.append("```")
    if decision_template:
        lines.extend(["", f"- Decision template: `{decision_template}`"])
    if decision_rehearsal:
        lines.extend(["", f"- Human-listen decision rehearsal: `{decision_rehearsal}`"])
        if decision_rehearsal_open_command:
            lines.extend(["", "```bash", f"open {shell_quote(str(decision_rehearsal_open_command))}", "```"])
    decision_matrix = outputs.get("latestListenDecisionMatrixMarkdown")
    if decision_matrix:
        lines.extend(["", f"- Listen decision matrix: `{decision_matrix}`"])
    audio_lab = outputs.get("latestProofWindowAudioLabMarkdown")
    if audio_lab:
        lines.extend(["", f"- Proof-window audio lab: `{audio_lab}`"])
    reviewer_console = outputs.get("latestAudioReviewerConsoleHtml")
    if reviewer_console:
        lines.extend(["", f"- Audio reviewer console: `{reviewer_console}`"])
    marker_command_packet = outputs.get("latestMarkerReviewCommandPacketMarkdown")
    if marker_command_packet:
        lines.extend(["", f"- Marker review command packet: `{marker_command_packet}`"])
    marker_notes_inbox = outputs.get("latestMarkerReviewNotesInboxMarkdown")
    if marker_notes_inbox:
        lines.extend(["", f"- Marker review notes inbox: `{marker_notes_inbox}`"])
    lines.extend(
        [
            "",
            "## Artifact checklist",
            "",
            "| Artifact | Manifest key | Status | Path |",
            "|---|---:|---:|---|",
            *artifact_rows,
            "",
            "## Decision gate",
            "",
            "Human approval can only be recorded after someone listens to the review cockpit/proof bundle and decides the warnings are harmless or acceptable.",
            "",
            "If it passes:",
            "",
            "```bash",
            pass_command,
            "```",
            "",
            "If it fails:",
            "",
            "```bash",
            fail_command,
            "```",
            "",
            "## Branch render caution",
            "",
            "The existing branch proof render is useful renderer evidence, not publication truth. It used the explicit proof-only unapproved override. Do not inherit v006 for real long-form or shorts branch renders until `branchInheritanceReady` is true.",
            "",
        ]
    )
    if missing:
        lines.extend(
            [
                "## Missing linked artifacts",
                "",
                "These should be repaired before a reviewer is asked to make a final decision:",
                "",
                *[f"- {artifact.label}: `{artifact.key}` -> `{artifact.path or ''}`" for artifact in missing],
                "",
            ]
        )
    return "\n".join(lines)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--baseline-dir", required=True, type=Path)
    args = parser.parse_args()

    baseline_dir = args.baseline_dir.expanduser().resolve()
    manifest_path, manifest = load_manifest(baseline_dir)
    generated_at = datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S")
    slug = slug_for(manifest)
    artifacts = collect_artifacts(manifest)

    output_json = baseline_dir / f"audio-review-handoff-index-{slug}-{generated_at}.json"
    output_md = baseline_dir / f"audio-review-handoff-index-{slug}-{generated_at}.md"

    payload = {
        "generatedAt": generated_at,
        "baselineDir": str(baseline_dir),
        "baselineId": manifest.get("baselineId"),
        "approvalStatus": manifest.get("approvalStatus"),
        "branchInheritanceReady": bool(manifest.get("branchInheritanceReady")),
        "branchRenderReady": bool(manifest.get("branchRenderReady")),
        "branchRenderProofCount": int(manifest.get("branchRenderProofCount") or 0),
        "publicationApproved": False,
        "artifactCount": len(artifacts),
        "missingArtifactCount": sum(1 for artifact in artifacts if not artifact.exists),
        "artifacts": [
            {
                "label": artifact.label,
                "key": artifact.key,
                "path": artifact.path,
                "exists": artifact.exists,
                "size": artifact.size,
            }
            for artifact in artifacts
        ],
        "markdown": str(output_md),
    }

    output_json.write_text(json.dumps(payload, indent=2) + "\n")
    output_md.write_text(build_markdown(baseline_dir, manifest, artifacts, generated_at) + "\n")

    outputs = manifest.setdefault("outputs", {})
    outputs["latestReviewHandoffIndex"] = str(output_json)
    outputs["latestReviewHandoffIndexMarkdown"] = str(output_md)
    history = outputs.setdefault("reviewHandoffIndexes", [])
    if str(output_json) not in history:
        history.append(str(output_json))
    manifest["latestReviewHandoffIndexGeneratedAt"] = generated_at
    manifest["reviewHandoffIndexCount"] = len(history)
    manifest["reviewHandoffIndexLatestStatus"] = "complete" if payload["missingArtifactCount"] == 0 else "needs-attention"
    manifest["reviewHandoffIndexArtifactCount"] = payload["artifactCount"]
    manifest["reviewHandoffIndexMissingArtifactCount"] = payload["missingArtifactCount"]
    manifest["reviewHandoffIndexLatestMarkdown"] = str(output_md)
    manifest_path.write_text(json.dumps(manifest, indent=2) + "\n")

    print(f"Wrote {output_md}")
    print(f"Wrote {output_json}")
    print(f"Missing linked artifacts: {payload['missingArtifactCount']}")


if __name__ == "__main__":
    main()
