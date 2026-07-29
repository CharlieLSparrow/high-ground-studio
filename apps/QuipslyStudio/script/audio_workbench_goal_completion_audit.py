#!/usr/bin/env python3
"""Audit the active Episode 4 audio goal against current v006 evidence.

This is a requirements ledger, not an approval tool. It maps the goal's explicit
acceptance criteria to existing manifest evidence so the next step is obvious.
It does not approve audio, fail audio, render branches, upload files, or mutate
original media.
"""

from __future__ import annotations

import argparse
import hashlib
import json
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


@dataclass(frozen=True)
class ArtifactCheck:
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
    out = "".join(ch.lower() if ch.isalnum() else "-" for ch in str(value))
    while "--" in out:
        out = out.replace("--", "-")
    return out.strip("-") or "audio-baseline"


def artifact(outputs: dict[str, Any], label: str, key: str) -> ArtifactCheck:
    return ArtifactCheck(label=label, key=key, path=output_path(outputs.get(key)))


def check_names(checks: list[ArtifactCheck], keys: list[str]) -> list[ArtifactCheck]:
    by_key = {check.key: check for check in checks}
    return [by_key[key] for key in keys if key in by_key]


def all_present(checks: list[ArtifactCheck]) -> bool:
    return all(check.exists for check in checks)


def any_present(checks: list[ArtifactCheck]) -> bool:
    return any(check.exists for check in checks)


def status_counts(requirements: list[dict[str, Any]]) -> dict[str, int]:
    counts = {"proved": 0, "partial": 0, "locked": 0, "missing": 0}
    for req in requirements:
        status = str(req.get("status") or "missing")
        counts[status] = counts.get(status, 0) + 1
    return counts


def load_evidence_reports(outputs: dict[str, Any]) -> list[dict[str, Any]]:
    report_keys = [
        "latestSpeakerBleedGapProofAudit",
        "latestAudioMasterSourceBalanceAudit",
        "latestAudioSourceBalanceListenCompanion",
        "latestAudioSpeakerContributionLedger",
        "latestAudioSpeakerPreservationProofPack",
        "latestAudioSpeakerPreservationProofNotesInbox",
        "latestAudioFinalListenFastPass",
        "latestAudioFinalListenFastPassNotesInbox",
        "latestAudioSourceBalanceRepairWorkorder",
        "latestAudioSourceBalanceRepairPreflight",
        "latestAudioSourceBalanceRepairPreflightAudit",
        "latestAudioListenPrioritySnippetPackAudit",
        "latestAudioListenPriorityReviewReel",
        "latestAudioListenPriorityReviewReelNotesSmoke",
        "latestSpeakerCleanupProofPack",
        "latestSpeakerCleanupProofPackAudit",
        "latestSpeakerCleanupListenMap",
        "latestSpeakerCleanupDecisionMatrix",
        "latestSpeakerCleanupListenMapNotesInbox",
        "latestSpeakerCleanupListenMapNotesInboxSmoke",
        "latestSpeakerCleanupTriageBoard",
        "latestSpeakerCleanupAcceptanceBoard",
        "latestSpeakerCleanupListenReel",
        "latestSpeakerCleanupTriageNotesInbox",
        "latestSpeakerCleanupTriageNotesInboxSmoke",
        "latestAudioSpineListenSanityCheck",
        "latestAudioListenPriorityNotesInbox",
        "latestAudioListenPriorityNotesInboxSmoke",
        "latestAudioListenNotesRepairPlanner",
        "latestAudioListenNotesRepairPlannerSmoke",
        "latestMarkerReviewNotesInboxSmoke",
        "latestAudioReviewGateAudit",
        "latestHumanListenDecisionRehearsal",
        "latestAudioWorkbenchRepairTuningConsole",
        "latestAudioWorkbenchRepairTuningConsoleSmoke",
        "latestAudioWorkbenchParameterControlLedger",
        "latestAudioWorkbenchParameterControlLedgerSmoke",
        "latestAudioWorkbenchParameterSweepProofPlan",
        "latestAudioWorkbenchParameterSweepProofPlanSmoke",
        "latestAudioWorkbenchParameterSweepProofSnippetPack",
        "latestAudioWorkbenchParameterSweepProofSnippetPackSmoke",
        "latestAudioWorkbenchParameterSweepNotesInbox",
        "latestAudioWorkbenchParameterSweepNotesInboxSmoke",
        "latestAudioProducerGradeAudit",
        "latestAudioProducerGradeNotesInbox",
        "latestAudioProducerGradeNotesInboxSmoke",
        "latestAudioProducerGradeAuditSmoke",
        "latestAudioProducerCommandCenter",
        "latestAudioPlatformLoudnessAudit",
        "latestAudioBroadcastPolishScorecard",
        "latestAudioSmoothnessProofPack",
        "latestAudioSmoothnessProofNotesInbox",
        "latestAudioPostReviewActionQueue",
        "latestAudioListenProofCoverageMap",
        "latestAudioReviewGateAuditSmoke",
        "latestReviewReadinessVerification",
        "latestBranchRenderProof",
        "latestAudioProductionDoctrine",
        "latestAudioManifestReadbackConsistencySmoke",
        "latestAudioFinalListenMissionPacket",
        "latestAudioDefectAtlas",
        "latestAudioDefectAtlasNotesInbox",
        "latestAudioDefectAtlasNotesInboxSmoke",
        "latestAudioHumanListenMissionBoard",
        "latestAudioHumanListenMissionReel",
        "latestAudioHumanListenMissionReelNotesInbox",
        "latestAudioHumanListenMissionReelNotesInboxSmoke",
        "latestAudioStudioSoundControlRoom",
        "latestAudioStudioSoundNotesInbox",
        "latestAudioStudioSoundNotesInboxSmoke",
        "latestAudioStudioSoundRepairPlanner",
        "latestAudioStudioSoundRepairPlannerSmoke",
        "latestDxReviveReturnWorkbench",
    ]
    reports: list[dict[str, Any]] = []
    for key in report_keys:
        path = output_path(outputs.get(key))
        if not path or not Path(path).exists() or Path(path).suffix.lower() != ".json":
            continue
        try:
            payload = read_json(Path(path))
        except json.JSONDecodeError:
            continue
        payload["_manifestKey"] = key
        payload["_path"] = path
        reports.append(payload)
    return reports


def load_output_report(outputs: dict[str, Any], key: str) -> dict[str, Any]:
    path = output_path(outputs.get(key))
    if not path or not Path(path).exists() or Path(path).suffix.lower() != ".json":
        return {}
    try:
        return read_json(Path(path))
    except json.JSONDecodeError:
        return {}


def int_value(value: Any) -> int:
    try:
        return int(value)
    except (TypeError, ValueError):
        return 0


def count_or_len(payload: dict[str, Any], count_key: str, rows_key: str) -> int:
    value = payload.get(count_key)
    if value not in (None, ""):
        return int_value(value)
    rows = payload.get(rows_key)
    if isinstance(rows, list):
        return len(rows)
    return 0


def evidence_false_or_absent(reports: list[dict[str, Any]], key: str) -> bool:
    values = [report.get(key) for report in reports if key in report]
    return bool(values) and all(value is False for value in values)


def evidence_any_true(reports: list[dict[str, Any]], key: str) -> bool:
    return any(report.get(key) is True for report in reports if key in report)


def make_requirement(
    title: str,
    status: str,
    evidence: list[str],
    next_action: str,
    artifact_checks: list[ArtifactCheck],
) -> dict[str, Any]:
    missing = [check for check in artifact_checks if not check.exists]
    present = [check for check in artifact_checks if check.exists]
    return {
        "title": title,
        "status": status,
        "evidence": evidence,
        "nextAction": next_action,
        "presentArtifacts": [check.label for check in present],
        "missingArtifacts": [check.label for check in missing],
        "artifactKeys": [check.key for check in artifact_checks],
    }


def render_markdown(report: dict[str, Any]) -> str:
    status_counts_payload = report["statusCounts"]
    lines = [
        f"# Audio Goal Completion Audit: {report['baselineId']}",
        "",
        f"Generated: `{report['generatedAt']}`",
        "",
        "This is a requirement-level ledger for the active Episode 4 audio goal. It is machine evidence only. It does not approve v006, fail v006, unlock branch inheritance, render branches, publish, upload, or touch original media.",
        "",
        "## Current truth",
        "",
        f"- Approval status: `{report['approvalStatus']}`",
        f"- Package ready for human listen: `{str(report['packageReadyForHumanListen']).lower()}`",
        f"- Branch inheritance ready: `{str(report['branchInheritanceReady']).lower()}`",
        f"- Branch render ready: `{str(report['branchRenderReady']).lower()}`",
        f"- Human listen required before branch inheritance: `{str(report['humanListenRequired']).lower()}`",
        f"- Proved requirements: `{status_counts_payload.get('proved', 0)}`",
        f"- Partial requirements: `{status_counts_payload.get('partial', 0)}`",
        f"- Locked requirements: `{status_counts_payload.get('locked', 0)}`",
        f"- Missing requirements: `{status_counts_payload.get('missing', 0)}`",
        "",
        "## Requirement ledger",
        "",
        "| Requirement | Status | Evidence | Next action |",
        "|---|---:|---|---|",
    ]
    for req in report["requirements"]:
        evidence = "<br>".join(req["evidence"])
        lines.append(f"| {req['title']} | `{req['status']}` | {evidence} | {req['nextAction']} |")
    lines.extend(
        [
            "",
            "## Missing artifact detail",
            "",
        ]
    )
    missing_any = False
    for req in report["requirements"]:
        if req["missingArtifacts"]:
            missing_any = True
            lines.append(f"- {req['title']}: `{', '.join(req['missingArtifacts'])}`")
    if not missing_any:
        lines.append("- No requirement-critical artifacts are missing from the current machine-evidence set.")
    lines.extend(
        [
            "",
            "## Guardrails",
            "",
            f"- Approval state changed: `{str(report['approvalStateChanged']).lower()}`",
            f"- Branch state changed: `{str(report['branchStateChanged']).lower()}`",
            f"- Render attempted: `{str(report['renderAttempted']).lower()}`",
            f"- Original media mutated: `{str(report['originalMediaMutated']).lower()}`",
            "",
            "## Next safest step",
            "",
            report["nextSafestStep"],
            "",
        ]
    )
    return "\n".join(lines)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--baseline-dir", required=True, type=Path)
    parser.add_argument("--goal-file", required=True, type=Path)
    args = parser.parse_args()

    baseline_dir = resolve_baseline_dir(args.baseline_dir)
    manifest_path = baseline_dir / "manifest.json"
    manifest = read_json(manifest_path)
    outputs = manifest.setdefault("outputs", {})
    baseline_id = str(manifest.get("baselineId") or "audio-baseline")
    slug = safe_slug(baseline_id.replace("episode-4-conformed-production-baseline-", ""))
    generated_at = datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S")

    goal_file = args.goal_file.expanduser().resolve()
    goal_text = goal_file.read_text(encoding="utf-8")
    goal_hash = hashlib.sha256(goal_text.encode("utf-8")).hexdigest()

    checks = [
        artifact(outputs, "Handoff WAV", "masterWav"),
        artifact(outputs, "Listening M4A", "masterM4a"),
        artifact(outputs, "QC report", "qualityReportMarkdown"),
        artifact(outputs, "Source activity report", "sourceActivityMarkdown"),
        artifact(outputs, "Source contribution report", "sourceContributionMarkdown"),
        artifact(outputs, "Listen review packet", "listenReviewPacketMarkdown"),
        artifact(outputs, "Listen-proof bundle folder", "listenProofBundle"),
        artifact(outputs, "Listen-proof bundle manifest", "listenProofBundleManifest"),
        artifact(outputs, "Audio review cockpit", "audioReviewCockpitHtml"),
        artifact(outputs, "Audio workbench stage control surface", "latestAudioWorkbenchStageControlSurfaceMarkdown"),
        artifact(outputs, "Audio workbench stage control surface HTML", "latestAudioWorkbenchStageControlSurfaceHtml"),
        artifact(outputs, "Audio workbench stage control surface open command", "latestAudioWorkbenchStageControlSurfaceOpenCommand"),
        artifact(outputs, "Audio producer-grade audit", "latestAudioProducerGradeAuditMarkdown"),
        artifact(outputs, "Audio producer-grade audit HTML", "latestAudioProducerGradeAuditHtml"),
        artifact(outputs, "Audio producer-grade audit open command", "latestAudioProducerGradeAuditOpenCommand"),
        artifact(outputs, "Audio producer-grade notes template", "latestAudioProducerGradeNotesTemplate"),
        artifact(outputs, "Audio producer-grade notes inbox", "latestAudioProducerGradeNotesInboxMarkdown"),
        artifact(outputs, "Audio producer-grade notes inbox smoke", "latestAudioProducerGradeNotesInboxSmokeMarkdown"),
        artifact(outputs, "Audio producer-grade audit smoke", "latestAudioProducerGradeAuditSmokeMarkdown"),
        artifact(outputs, "Audio producer command center", "latestAudioProducerCommandCenterMarkdown"),
        artifact(outputs, "Audio producer command center HTML", "latestAudioProducerCommandCenterHtml"),
        artifact(outputs, "Audio producer command center open command", "latestAudioProducerCommandCenterOpenCommand"),
        artifact(outputs, "Audio morning publication readiness packet", "latestAudioMorningPublicationReadinessPacketMarkdown"),
        artifact(outputs, "Audio morning publication readiness packet HTML", "latestAudioMorningPublicationReadinessPacketHtml"),
        artifact(outputs, "Audio morning publication readiness packet open command", "latestAudioMorningPublicationReadinessPacketOpenCommand"),
        artifact(outputs, "Audio quality methods matrix", "latestAudioQualityMethodsMatrixMarkdown"),
        artifact(outputs, "Audio quality methods matrix HTML", "latestAudioQualityMethodsMatrixHtml"),
        artifact(outputs, "Audio quality methods matrix open command", "latestAudioQualityMethodsMatrixOpenCommand"),
        artifact(outputs, "Machine listen sentinel", "latestAudioMachineListenSentinelMarkdown"),
        artifact(outputs, "Machine listen sentinel HTML", "latestAudioMachineListenSentinelHtml"),
        artifact(outputs, "Machine listen sentinel open command", "latestAudioMachineListenSentinelOpenCommand"),
        artifact(outputs, "Audio morning review launcher", "latestAudioMorningAudioReviewLauncherMarkdown"),
        artifact(outputs, "Audio morning review launcher HTML", "latestAudioMorningAudioReviewLauncherHtml"),
        artifact(outputs, "Audio morning review launcher open command", "latestAudioMorningAudioReviewLauncherOpenCommand"),
        artifact(outputs, "Audio post-listen episode runway", "latestAudioPostListenEpisodeRunwayMarkdown"),
        artifact(outputs, "Audio post-listen episode runway HTML", "latestAudioPostListenEpisodeRunwayHtml"),
        artifact(outputs, "Audio post-listen episode runway open command", "latestAudioPostListenEpisodeRunwayOpenCommand"),
        artifact(outputs, "Audio production doctrine", "latestAudioProductionDoctrineMarkdown"),
        artifact(outputs, "Audio production doctrine HTML", "latestAudioProductionDoctrineHtml"),
        artifact(outputs, "Audio production doctrine open command", "latestAudioProductionDoctrineOpenCommand"),
        artifact(outputs, "Audio manifest readback consistency smoke", "latestAudioManifestReadbackConsistencySmokeMarkdown"),
        artifact(outputs, "Audio manifest readback consistency smoke HTML", "latestAudioManifestReadbackConsistencySmokeHtml"),
        artifact(outputs, "Audio manifest readback consistency smoke open command", "latestAudioManifestReadbackConsistencySmokeOpenCommand"),
        artifact(outputs, "Final listen mission packet", "latestAudioFinalListenMissionPacketMarkdown"),
        artifact(outputs, "Final listen mission packet HTML", "latestAudioFinalListenMissionPacketHtml"),
        artifact(outputs, "Final listen mission packet open command", "latestAudioFinalListenMissionPacketOpenCommand"),
        artifact(outputs, "Scoped v007 repair candidate plan", "latestAudioScopedV007RepairCandidatePlanMarkdown"),
        artifact(outputs, "Scoped v007 repair candidate plan HTML", "latestAudioScopedV007RepairCandidatePlanHtml"),
        artifact(outputs, "Scoped v007 repair candidate plan open command", "latestAudioScopedV007RepairCandidatePlanOpenCommand"),
        artifact(outputs, "Scoped v007 repair candidate plan smoke", "latestAudioScopedV007RepairCandidatePlanSmokeMarkdown"),
        artifact(outputs, "Scoped v007 repair candidate plan smoke HTML", "latestAudioScopedV007RepairCandidatePlanSmokeHtml"),
        artifact(outputs, "Scoped v007 repair candidate plan smoke open command", "latestAudioScopedV007RepairCandidatePlanSmokeOpenCommand"),
        artifact(outputs, "Audio defect atlas", "latestAudioDefectAtlasMarkdown"),
        artifact(outputs, "Audio defect atlas HTML", "latestAudioDefectAtlasHtml"),
        artifact(outputs, "Audio defect atlas open command", "latestAudioDefectAtlasOpenCommand"),
        artifact(outputs, "Audio defect atlas notes template", "latestAudioDefectAtlasNotesTemplate"),
        artifact(outputs, "Audio defect atlas notes template Markdown", "latestAudioDefectAtlasNotesTemplateMarkdown"),
        artifact(outputs, "Audio defect atlas notes inbox", "latestAudioDefectAtlasNotesInboxMarkdown"),
        artifact(outputs, "Audio defect atlas notes inbox HTML", "latestAudioDefectAtlasNotesInboxHtml"),
        artifact(outputs, "Audio defect atlas notes inbox smoke", "latestAudioDefectAtlasNotesInboxSmokeMarkdown"),
        artifact(outputs, "Human listen mission board", "latestAudioHumanListenMissionBoardMarkdown"),
        artifact(outputs, "Human listen mission board HTML", "latestAudioHumanListenMissionBoardHtml"),
        artifact(outputs, "Human listen mission board open command", "latestAudioHumanListenMissionBoardOpenCommand"),
        artifact(outputs, "Human listen mission reel", "latestAudioHumanListenMissionReelMarkdown"),
        artifact(outputs, "Human listen mission reel HTML", "latestAudioHumanListenMissionReelHtml"),
        artifact(outputs, "Human listen mission reel M4A", "latestAudioHumanListenMissionReelM4a"),
        artifact(outputs, "Human listen mission reel open command", "latestAudioHumanListenMissionReelOpenCommand"),
        artifact(outputs, "Studio sound control room", "latestAudioStudioSoundControlRoomMarkdown"),
        artifact(outputs, "Studio sound control room HTML", "latestAudioStudioSoundControlRoomHtml"),
        artifact(outputs, "Studio sound control room open command", "latestAudioStudioSoundControlRoomOpenCommand"),
        artifact(outputs, "Studio sound notes template", "latestAudioStudioSoundNotesTemplate"),
        artifact(outputs, "Studio sound notes inbox", "latestAudioStudioSoundNotesInboxMarkdown"),
        artifact(outputs, "Studio sound notes inbox smoke", "latestAudioStudioSoundNotesInboxSmokeMarkdown"),
        artifact(outputs, "Studio sound repair planner", "latestAudioStudioSoundRepairPlannerMarkdown"),
        artifact(outputs, "Studio sound repair planner HTML", "latestAudioStudioSoundRepairPlannerHtml"),
        artifact(outputs, "Studio sound repair planner open command", "latestAudioStudioSoundRepairPlannerOpenCommand"),
        artifact(outputs, "Studio sound repair planner smoke", "latestAudioStudioSoundRepairPlannerSmokeMarkdown"),
        artifact(outputs, "Audio post-review action queue", "latestAudioPostReviewActionQueueMarkdown"),
        artifact(outputs, "Speaker cleanup listen reel", "latestSpeakerCleanupListenReelMarkdown"),
        artifact(outputs, "Speaker cleanup listen reel HTML", "latestSpeakerCleanupListenReelHtml"),
        artifact(outputs, "Speaker cleanup listen reel M4A", "latestSpeakerCleanupListenReelM4a"),
        artifact(outputs, "Speaker cleanup triage notes inbox", "latestSpeakerCleanupTriageNotesInboxMarkdown"),
        artifact(outputs, "Speaker cleanup triage notes inbox smoke", "latestSpeakerCleanupTriageNotesInboxSmokeMarkdown"),
        artifact(outputs, "Audio repair/tuning console", "latestAudioWorkbenchRepairTuningConsoleMarkdown"),
        artifact(outputs, "Audio repair/tuning console HTML", "latestAudioWorkbenchRepairTuningConsoleHtml"),
        artifact(outputs, "Audio repair/tuning console open command", "latestAudioWorkbenchRepairTuningConsoleOpenCommand"),
        artifact(outputs, "Audio repair/tuning console smoke", "latestAudioWorkbenchRepairTuningConsoleSmokeMarkdown"),
        artifact(outputs, "Audio parameter control ledger", "latestAudioWorkbenchParameterControlLedgerMarkdown"),
        artifact(outputs, "Audio parameter control ledger HTML", "latestAudioWorkbenchParameterControlLedgerHtml"),
        artifact(outputs, "Audio parameter control ledger open command", "latestAudioWorkbenchParameterControlLedgerOpenCommand"),
        artifact(outputs, "Audio parameter control ledger smoke", "latestAudioWorkbenchParameterControlLedgerSmokeMarkdown"),
        artifact(outputs, "Audio parameter sweep proof plan", "latestAudioWorkbenchParameterSweepProofPlanMarkdown"),
        artifact(outputs, "Audio parameter sweep proof plan HTML", "latestAudioWorkbenchParameterSweepProofPlanHtml"),
        artifact(outputs, "Audio parameter sweep proof plan open command", "latestAudioWorkbenchParameterSweepProofPlanOpenCommand"),
        artifact(outputs, "Audio parameter sweep proof plan smoke", "latestAudioWorkbenchParameterSweepProofPlanSmokeMarkdown"),
        artifact(outputs, "Audio parameter sweep proof snippet pack", "latestAudioWorkbenchParameterSweepProofSnippetPackMarkdown"),
        artifact(outputs, "Audio parameter sweep proof snippet pack HTML", "latestAudioWorkbenchParameterSweepProofSnippetPackHtml"),
        artifact(outputs, "Audio parameter sweep proof snippet playlist", "latestAudioWorkbenchParameterSweepProofSnippetPackPlaylist"),
        artifact(outputs, "Audio parameter sweep proof snippet pack open command", "latestAudioWorkbenchParameterSweepProofSnippetPackOpenCommand"),
        artifact(outputs, "Audio parameter sweep proof snippet pack smoke", "latestAudioWorkbenchParameterSweepProofSnippetPackSmokeMarkdown"),
        artifact(outputs, "Audio parameter sweep proof notes inbox", "latestAudioWorkbenchParameterSweepNotesInboxMarkdown"),
        artifact(outputs, "Audio parameter sweep proof notes inbox smoke", "latestAudioWorkbenchParameterSweepNotesInboxSmokeMarkdown"),
        artifact(outputs, "Audio master visual overview", "latestAudioMasterVisualOverviewMarkdown"),
        artifact(outputs, "Audio listen-priority queue", "latestAudioListenPriorityQueueMarkdown"),
        artifact(outputs, "Audio listen-priority console", "latestAudioListenPriorityConsoleHtml"),
        artifact(outputs, "Audio listen-priority snippet pack", "latestAudioListenPrioritySnippetPackMarkdown"),
        artifact(outputs, "Audio listen-priority snippet pack audit", "latestAudioListenPrioritySnippetPackAuditMarkdown"),
        artifact(outputs, "Audio human listen control room", "latestAudioHumanListenControlRoomHtml"),
        artifact(outputs, "Audio listen-priority review reel", "latestAudioListenPriorityReviewReelMarkdown"),
        artifact(outputs, "Audio listen-priority review reel notes smoke", "latestAudioListenPriorityReviewReelNotesSmokeMarkdown"),
        artifact(outputs, "Audio listen-priority/control-room notes inbox", "latestAudioListenPriorityNotesInboxMarkdown"),
        artifact(outputs, "Audio marker-review notes inbox", "latestMarkerReviewNotesInboxMarkdown"),
        artifact(outputs, "Audio post-human-listen notes roundtrip smoke", "latestAudioPostHumanListenNotesRoundtripSmokeMarkdown"),
        artifact(outputs, "Audio master/source balance audit", "latestAudioMasterSourceBalanceAuditMarkdown"),
        artifact(outputs, "Audio source-balance listen companion", "latestAudioSourceBalanceListenCompanionMarkdown"),
        artifact(outputs, "Audio source-balance listen companion open command", "latestAudioSourceBalanceListenCompanionOpenCommand"),
        artifact(outputs, "Audio speaker contribution ledger", "latestAudioSpeakerContributionLedgerMarkdown"),
        artifact(outputs, "Audio speaker contribution ledger HTML", "latestAudioSpeakerContributionLedgerHtml"),
        artifact(outputs, "Audio speaker contribution review markers CSV", "latestAudioSpeakerContributionLedgerCsv"),
        artifact(outputs, "Audio speaker preservation proof pack", "latestAudioSpeakerPreservationProofPackMarkdown"),
        artifact(outputs, "Audio speaker preservation proof pack HTML", "latestAudioSpeakerPreservationProofPackHtml"),
        artifact(outputs, "Audio speaker preservation proof pack playlist", "latestAudioSpeakerPreservationProofPackPlaylist"),
        artifact(outputs, "Audio speaker preservation proof notes template", "latestAudioSpeakerPreservationProofPackNotesTemplate"),
        artifact(outputs, "Audio speaker preservation proof notes inbox", "latestAudioSpeakerPreservationProofNotesInboxMarkdown"),
        artifact(outputs, "Audio final listen fast pass", "latestAudioFinalListenFastPassMarkdown"),
        artifact(outputs, "Audio final listen fast pass HTML", "latestAudioFinalListenFastPassHtml"),
        artifact(outputs, "Audio final listen fast pass notes template", "latestAudioFinalListenFastPassNotesTemplate"),
        artifact(outputs, "Audio final listen fast pass notes inbox", "latestAudioFinalListenFastPassNotesInboxMarkdown"),
        artifact(outputs, "Audio platform loudness audit", "latestAudioPlatformLoudnessAuditMarkdown"),
        artifact(outputs, "Audio platform loudness audit HTML", "latestAudioPlatformLoudnessAuditHtml"),
        artifact(outputs, "Audio platform loudness audit open command", "latestAudioPlatformLoudnessAuditOpenCommand"),
        artifact(outputs, "Audio broadcast polish scorecard", "latestAudioBroadcastPolishScorecardMarkdown"),
        artifact(outputs, "Audio broadcast polish scorecard HTML", "latestAudioBroadcastPolishScorecardHtml"),
        artifact(outputs, "Audio broadcast polish scorecard open command", "latestAudioBroadcastPolishScorecardOpenCommand"),
        artifact(outputs, "Audio smoothness proof pack", "latestAudioSmoothnessProofPackMarkdown"),
        artifact(outputs, "Audio smoothness proof pack HTML", "latestAudioSmoothnessProofPackHtml"),
        artifact(outputs, "Audio smoothness proof pack playlist", "latestAudioSmoothnessProofPackPlaylist"),
        artifact(outputs, "Audio smoothness proof pack notes template", "latestAudioSmoothnessProofPackNotesTemplate"),
        artifact(outputs, "Audio smoothness proof pack open command", "latestAudioSmoothnessProofPackOpenCommand"),
        artifact(outputs, "Audio smoothness proof notes inbox", "latestAudioSmoothnessProofNotesInboxMarkdown"),
        artifact(outputs, "Audio source-balance repair workorder", "latestAudioSourceBalanceRepairWorkorderMarkdown"),
        artifact(outputs, "Audio source-balance repair preflight", "latestAudioSourceBalanceRepairPreflightMarkdown"),
        artifact(outputs, "Audio source-balance repair preflight audit", "latestAudioSourceBalanceRepairPreflightAuditMarkdown"),
        artifact(outputs, "Audio source-balance repair proof playlist", "latestAudioSourceBalanceRepairProofPlaylist"),
        artifact(outputs, "Speaker bleed/gap proof audit", "latestSpeakerBleedGapProofAuditMarkdown"),
        artifact(outputs, "Audio speaker activity review board", "latestAudioSpeakerActivityReviewBoardMarkdown"),
        artifact(outputs, "Audio speaker activity review board HTML", "latestAudioSpeakerActivityReviewBoardHtml"),
        artifact(outputs, "Audio speaker cleanup proof pack", "latestSpeakerCleanupProofPackMarkdown"),
        artifact(outputs, "Audio speaker cleanup proof pack HTML", "latestSpeakerCleanupProofPackHtml"),
        artifact(outputs, "Audio speaker cleanup proof pack audit", "latestSpeakerCleanupProofPackAuditMarkdown"),
        artifact(outputs, "Audio speaker cleanup listen map", "latestSpeakerCleanupListenMapMarkdown"),
        artifact(outputs, "Audio speaker cleanup listen map HTML", "latestSpeakerCleanupListenMapHtml"),
        artifact(outputs, "Audio speaker cleanup decision matrix", "latestSpeakerCleanupDecisionMatrixMarkdown"),
        artifact(outputs, "Audio speaker cleanup decision matrix HTML", "latestSpeakerCleanupDecisionMatrixHtml"),
        artifact(outputs, "Audio speaker cleanup decision matrix open command", "latestSpeakerCleanupDecisionMatrixOpenCommand"),
        artifact(outputs, "Audio speaker cleanup triage board", "latestSpeakerCleanupTriageBoardMarkdown"),
        artifact(outputs, "Audio speaker cleanup triage board HTML", "latestSpeakerCleanupTriageBoardHtml"),
        artifact(outputs, "Audio speaker cleanup triage board open command", "latestSpeakerCleanupTriageBoardOpenCommand"),
        artifact(outputs, "Audio speaker cleanup acceptance board", "latestSpeakerCleanupAcceptanceBoardMarkdown"),
        artifact(outputs, "Audio speaker cleanup acceptance board HTML", "latestSpeakerCleanupAcceptanceBoardHtml"),
        artifact(outputs, "Audio speaker cleanup acceptance board open command", "latestSpeakerCleanupAcceptanceBoardOpenCommand"),
        artifact(outputs, "Audio speaker cleanup listen reel", "latestSpeakerCleanupListenReelMarkdown"),
        artifact(outputs, "Audio speaker cleanup listen reel HTML", "latestSpeakerCleanupListenReelHtml"),
        artifact(outputs, "Audio speaker cleanup listen reel M4A", "latestSpeakerCleanupListenReelM4a"),
        artifact(outputs, "Audio speaker cleanup listen reel open command", "latestSpeakerCleanupListenReelOpenCommand"),
        artifact(outputs, "Speaker cleanup listen-map notes inbox", "latestSpeakerCleanupListenMapNotesInboxMarkdown"),
        artifact(outputs, "Speaker cleanup listen-map notes inbox smoke", "latestSpeakerCleanupListenMapNotesInboxSmokeMarkdown"),
        artifact(outputs, "Audio spine listen sanity check", "latestAudioSpineListenSanityCheckMarkdown"),
        artifact(outputs, "Reusable audio production profile", "latestReusableAudioProductionProfileMarkdown"),
        artifact(outputs, "Stable reusable audio production profile", "stableReusableAudioProductionProfileMarkdown"),
        artifact(outputs, "Reusable audio production profile smoke", "latestReusableAudioProductionProfileSmokeMarkdown"),
        artifact(outputs, "dxRevive manual bounce packet", "latestDxReviveManualBouncePacketMarkdown"),
        artifact(outputs, "dxRevive manual bounce packet open command", "latestDxReviveManualBouncePacketOpenCommand"),
        artifact(outputs, "dxRevive return workbench", "latestDxReviveReturnWorkbenchMarkdown"),
        artifact(outputs, "dxRevive return workbench HTML", "latestDxReviveReturnWorkbenchHtml"),
        artifact(outputs, "dxRevive return workbench open command", "latestDxReviveReturnWorkbenchOpenCommand"),
        artifact(outputs, "dxRevive bounce validation", "latestDxReviveBounceValidationMarkdown"),
        artifact(outputs, "dxRevive bounce validator smoke", "latestDxReviveBounceValidatorSmokeMarkdown"),
        artifact(outputs, "dxRevive proof candidate planner", "latestDxReviveProofCandidatePlannerMarkdown"),
        artifact(outputs, "dxRevive proof candidate planner smoke", "latestDxReviveProofCandidatePlannerSmokeMarkdown"),
        artifact(outputs, "Stable START HERE", "latestAudioReviewStartHereMarkdown"),
        artifact(outputs, "Human listen decision brief", "latestAudioHumanListenDecisionBriefMarkdown"),
        artifact(outputs, "Human-listen decision rehearsal", "latestHumanListenDecisionRehearsalMarkdown"),
        artifact(outputs, "Human-listen decision rehearsal open command", "latestHumanListenDecisionRehearsalOpenCommand"),
        artifact(outputs, "Human listen decision front door", "latestHumanListenDecisionFrontDoorMarkdown"),
        artifact(outputs, "Human listen decision front door HTML", "latestHumanListenDecisionFrontDoorHtml"),
        artifact(outputs, "Human listen decision front door open command", "latestHumanListenDecisionFrontDoorOpenCommand"),
        artifact(outputs, "Human listen decision front-door smoke", "latestHumanListenDecisionFrontDoorSmokeMarkdown"),
        artifact(outputs, "Review handoff index", "latestReviewHandoffIndexMarkdown"),
        artifact(outputs, "Listen decision template", "latestListenDecisionTemplateMarkdown"),
        artifact(outputs, "Branch inheritance gate", "latestBranchInheritanceGateMarkdown"),
        artifact(outputs, "Branch inheritance gate HTML", "latestBranchInheritanceGateHtml"),
        artifact(outputs, "Branch inheritance gate open command", "latestBranchInheritanceGateOpenCommand"),
        artifact(outputs, "Branch render preflight", "branchRenderPreflightMarkdown"),
        artifact(outputs, "Branch render preflight HTML", "branchRenderPreflightHtml"),
        artifact(outputs, "Branch render preflight open command", "branchRenderPreflightOpenCommand"),
        artifact(outputs, "Approval-path sandbox smoke", "latestApprovalPathSmokeMarkdown"),
        artifact(outputs, "Approval-path sandbox smoke open command", "latestApprovalPathSmokeOpenCommand"),
        artifact(outputs, "Branch render proof evidence", "latestBranchRenderProofMarkdown"),
        artifact(outputs, "Bleed management audit", "latestBleedManagementAuditMarkdown"),
        artifact(outputs, "Bleed repair workorder", "latestBleedRepairWorkorderMarkdown"),
        artifact(outputs, "Audio listen-notes repair planner", "latestAudioListenNotesRepairPlannerMarkdown"),
        artifact(outputs, "Audio master smoothness audit", "latestAudioMasterSmoothnessAuditMarkdown"),
    ]

    reports = load_evidence_reports(outputs)
    source_balance_companion = load_output_report(outputs, "latestAudioSourceBalanceListenCompanion")
    source_balance_summary = source_balance_companion.get("summary") if isinstance(source_balance_companion.get("summary"), dict) else {}
    source_balance_focus_flags = source_balance_summary.get("flagCountsInFocusRows") if isinstance(source_balance_summary.get("flagCountsInFocusRows"), dict) else {}
    source_balance_full_flags = source_balance_summary.get("flagCountsInFullAudit") if isinstance(source_balance_summary.get("flagCountsInFullAudit"), dict) else {}
    required_source_balance_flags = [
        "charlie_homer_overlap_present",
        "master_loud_with_aligned_source_but_no_contribution",
        "master_loud_without_registered_source",
    ]
    source_balance_flag_coverage = all(
        int_value(source_balance_focus_flags.get(flag)) > 0
        for flag in required_source_balance_flags
    )
    source_balance_queue_item_count = int_value(source_balance_companion.get("queueBalanceItemCount"))
    review_reel_report = load_output_report(outputs, "latestAudioListenPriorityReviewReel")
    review_reel_notes_smoke = load_output_report(outputs, "latestAudioListenPriorityReviewReelNotesSmoke")
    post_human_roundtrip_smoke = load_output_report(outputs, "latestAudioPostHumanListenNotesRoundtripSmoke")
    post_human_roundtrip_smoke_rehearsal_registered = bool(post_human_roundtrip_smoke.get("humanListenDecisionRehearsalRegistered"))
    post_human_roundtrip_smoke_rehearsal_step_ok = bool(post_human_roundtrip_smoke.get("humanListenDecisionRehearsalStepOk"))
    post_human_roundtrip_smoke_rehearsal_passed = bool(post_human_roundtrip_smoke.get("humanListenDecisionRehearsalPassed"))
    post_human_roundtrip_smoke_rehearsal_manifest_unchanged = bool(post_human_roundtrip_smoke.get("humanListenDecisionRehearsalManifestUnchanged"))
    post_human_roundtrip_smoke_rehearsal_ok = (
        post_human_roundtrip_smoke_rehearsal_registered
        and post_human_roundtrip_smoke_rehearsal_step_ok
        and post_human_roundtrip_smoke_rehearsal_passed
        and post_human_roundtrip_smoke_rehearsal_manifest_unchanged
    )
    reusable_profile = load_output_report(outputs, "latestReusableAudioProductionProfile")
    stage_control_surface = load_output_report(outputs, "latestAudioWorkbenchStageControlSurface")
    reusable_profile_intake = load_output_report(outputs, "latestReusableAudioProfileIntakePacket")
    reusable_profile_intake_smoke = load_output_report(outputs, "latestReusableAudioProfileIntakePacketSmoke")
    dxrevive_validation = load_output_report(outputs, "latestDxReviveBounceValidation")
    dxrevive_return_workbench = load_output_report(outputs, "latestDxReviveReturnWorkbench")
    dxrevive_smoke = load_output_report(outputs, "latestDxReviveBounceValidatorSmoke")
    dxrevive_planner = load_output_report(outputs, "latestDxReviveProofCandidatePlanner")
    dxrevive_planner_smoke = load_output_report(outputs, "latestDxReviveProofCandidatePlannerSmoke")
    reusable_profile_smoke = load_output_report(outputs, "latestReusableAudioProductionProfileSmoke")
    spine_listen_sanity = load_output_report(outputs, "latestAudioSpineListenSanityCheck")
    speaker_cleanup_proof_pack = load_output_report(outputs, "latestSpeakerCleanupProofPack")
    speaker_cleanup_proof_pack_audit = load_output_report(outputs, "latestSpeakerCleanupProofPackAudit")
    speaker_cleanup_listen_map = load_output_report(outputs, "latestSpeakerCleanupListenMap")
    speaker_cleanup_decision_matrix = load_output_report(outputs, "latestSpeakerCleanupDecisionMatrix")
    speaker_cleanup_triage_board = load_output_report(outputs, "latestSpeakerCleanupTriageBoard")
    speaker_cleanup_acceptance_board = load_output_report(outputs, "latestSpeakerCleanupAcceptanceBoard")
    speaker_cleanup_listen_reel = load_output_report(outputs, "latestSpeakerCleanupListenReel")
    speaker_cleanup_notes_inbox = load_output_report(outputs, "latestSpeakerCleanupListenMapNotesInbox")
    speaker_cleanup_notes_inbox_smoke = load_output_report(outputs, "latestSpeakerCleanupListenMapNotesInboxSmoke")
    speaker_contribution_ledger = load_output_report(outputs, "latestAudioSpeakerContributionLedger")
    speaker_preservation_proof_pack = load_output_report(outputs, "latestAudioSpeakerPreservationProofPack")
    speaker_preservation_notes_inbox = load_output_report(outputs, "latestAudioSpeakerPreservationProofNotesInbox")
    final_listen_fast_pass = load_output_report(outputs, "latestAudioFinalListenFastPass")
    final_listen_fast_pass_notes_inbox = load_output_report(outputs, "latestAudioFinalListenFastPassNotesInbox")
    platform_loudness_audit = load_output_report(outputs, "latestAudioPlatformLoudnessAudit")
    broadcast_polish_scorecard = load_output_report(outputs, "latestAudioBroadcastPolishScorecard")
    smoothness_proof_pack = load_output_report(outputs, "latestAudioSmoothnessProofPack")
    smoothness_proof_notes_inbox = load_output_report(outputs, "latestAudioSmoothnessProofNotesInbox")
    producer_command_center = load_output_report(outputs, "latestAudioProducerCommandCenter")
    morning_publication_readiness = load_output_report(outputs, "latestAudioMorningPublicationReadinessPacket")
    quality_methods_matrix = load_output_report(outputs, "latestAudioQualityMethodsMatrix")
    spine_quality_gate = load_output_report(outputs, "latestAudioSpineQualityGate")
    machine_listen_sentinel = load_output_report(outputs, "latestAudioMachineListenSentinel")
    morning_audio_review_launcher = load_output_report(outputs, "latestAudioMorningAudioReviewLauncher")
    post_listen_episode_runway = load_output_report(outputs, "latestAudioPostListenEpisodeRunway")
    episode_rollout_board = load_output_report(outputs, "latestAudioEpisodeRolloutReadinessBoard")
    episode_media_inventory = load_output_report(outputs, "latestAudioEpisodeMediaInventoryPreflight")
    production_doctrine = load_output_report(outputs, "latestAudioProductionDoctrine")
    transformation_lineage = load_output_report(outputs, "latestAudioTransformationLineageLedger")
    transformation_lineage_smoke = load_output_report(outputs, "latestAudioTransformationLineageLedgerSmoke")
    manifest_readback_smoke = load_output_report(outputs, "latestAudioManifestReadbackConsistencySmoke")
    final_listen_mission_packet = load_output_report(outputs, "latestAudioFinalListenMissionPacket")
    scoped_v007_repair_plan = load_output_report(outputs, "latestAudioScopedV007RepairCandidatePlan")
    scoped_v007_repair_plan_smoke = load_output_report(outputs, "latestAudioScopedV007RepairCandidatePlanSmoke")
    defect_atlas = load_output_report(outputs, "latestAudioDefectAtlas")
    defect_atlas_notes_inbox = load_output_report(outputs, "latestAudioDefectAtlasNotesInbox")
    defect_atlas_notes_inbox_smoke = load_output_report(outputs, "latestAudioDefectAtlasNotesInboxSmoke")
    human_listen_mission_board = load_output_report(outputs, "latestAudioHumanListenMissionBoard")
    human_listen_mission_reel = load_output_report(outputs, "latestAudioHumanListenMissionReel")
    human_listen_mission_reel_notes_inbox = load_output_report(outputs, "latestAudioHumanListenMissionReelNotesInbox")
    human_listen_mission_reel_notes_inbox_smoke = load_output_report(outputs, "latestAudioHumanListenMissionReelNotesInboxSmoke")
    studio_sound_notes_inbox = load_output_report(outputs, "latestAudioStudioSoundNotesInbox")
    studio_sound_notes_inbox_smoke = load_output_report(outputs, "latestAudioStudioSoundNotesInboxSmoke")
    listen_proof_coverage_map = load_output_report(outputs, "latestAudioListenProofCoverageMap")
    reusable_intake_source_rows = count_or_len(reusable_profile_intake, "sourceMappingRowCount", "sourceMappingWorksheet")
    reusable_intake_stage_count = count_or_len(reusable_profile_intake, "stageChecklistCount", "stageChecklist")
    reusable_intake_group_count = count_or_len(reusable_profile_intake, "requiredInputGroupCount", "requiredFutureEpisodeInputs")
    review_reel_complete = (
        int_value(review_reel_report.get("includedSnippetCount")) >= 40
        and int_value(review_reel_report.get("missingSnippetCount")) == 0
    )
    review_reel_notes_smoke_passed = review_reel_notes_smoke.get("passed") is True
    post_human_roundtrip_smoke_passed = (
        post_human_roundtrip_smoke.get("passed") is True
        and post_human_roundtrip_smoke.get("artifactTableComplete") is True
        and post_human_roundtrip_smoke.get("postListenRouterRegistered") is True
    )
    original_media_mutated = evidence_any_true(reports, "originalMediaMutated")
    approval_status = str(manifest.get("approvalStatus") or "unknown")
    package_ready = bool(manifest.get("packageReadyForHumanListen"))
    branch_inheritance_ready = bool(manifest.get("branchInheritanceReady"))
    branch_render_ready = bool(manifest.get("branchRenderReady"))
    human_listen_required = approval_status != "human-approved-for-branch-inheritance"
    start_here_markdown_path = output_path(outputs.get("latestAudioReviewStartHereMarkdown"))
    start_here_text = ""
    if start_here_markdown_path and Path(start_here_markdown_path).exists():
        start_here_text = Path(start_here_markdown_path).read_text(encoding="utf-8").lower()
    producer_front_door_present = "producer command center" in start_here_text
    stage_control_present = "stage control surface" in start_here_text
    producer_front_door_first = (
        producer_front_door_present
        and stage_control_present
        and start_here_text.find("producer command center") < start_here_text.find("stage control surface")
    )

    baseline_checks = check_names(
        checks,
        [
            "masterWav",
            "masterM4a",
            "qualityReportMarkdown",
            "sourceActivityMarkdown",
            "sourceContributionMarkdown",
            "latestReviewHandoffIndexMarkdown",
        ],
    )
    proof_checks = check_names(
        checks,
        [
            "listenReviewPacketMarkdown",
            "listenProofBundle",
            "audioReviewCockpitHtml",
            "latestAudioListenPriorityConsoleHtml",
            "latestAudioListenPrioritySnippetPackMarkdown",
            "latestAudioListenPrioritySnippetPackAuditMarkdown",
            "latestAudioHumanListenControlRoomHtml",
            "latestAudioListenPriorityReviewReelMarkdown",
            "latestAudioListenPriorityReviewReelNotesSmokeMarkdown",
            "latestAudioSourceBalanceListenCompanionMarkdown",
            "latestSpeakerBleedGapProofAuditMarkdown",
        ],
    )
    bleed_checks = check_names(
        checks,
        [
            "sourceActivityMarkdown",
            "latestSpeakerBleedGapProofAuditMarkdown",
            "latestBleedManagementAuditMarkdown",
            "latestBleedRepairWorkorderMarkdown",
            "latestAudioListenPriorityQueueMarkdown",
            "latestAudioMasterSourceBalanceAuditMarkdown",
            "latestAudioSourceBalanceListenCompanionMarkdown",
            "latestAudioSpeakerContributionLedgerMarkdown",
            "latestAudioSpeakerContributionLedgerHtml",
            "latestAudioSpeakerContributionLedgerCsv",
            "latestAudioSpeakerPreservationProofPackMarkdown",
            "latestAudioSpeakerPreservationProofPackHtml",
            "latestAudioSpeakerPreservationProofPackPlaylist",
            "latestAudioSpeakerPreservationProofPackNotesTemplate",
            "latestAudioSpeakerPreservationProofNotesInboxMarkdown",
            "latestAudioSourceBalanceRepairWorkorderMarkdown",
            "latestAudioSourceBalanceRepairPreflightMarkdown",
            "latestAudioSourceBalanceRepairPreflightAuditMarkdown",
            "latestAudioSpeakerActivityReviewBoardMarkdown",
            "latestAudioSpeakerActivityReviewBoardHtml",
            "latestSpeakerCleanupProofPackMarkdown",
            "latestSpeakerCleanupProofPackHtml",
            "latestSpeakerCleanupDecisionMatrixMarkdown",
            "latestSpeakerCleanupDecisionMatrixHtml",
            "latestSpeakerCleanupDecisionMatrixOpenCommand",
            "latestSpeakerCleanupTriageBoardMarkdown",
            "latestSpeakerCleanupTriageBoardHtml",
            "latestSpeakerCleanupTriageBoardOpenCommand",
            "latestSpeakerCleanupAcceptanceBoardMarkdown",
            "latestSpeakerCleanupAcceptanceBoardHtml",
            "latestSpeakerCleanupAcceptanceBoardOpenCommand",
        ],
    )
    workflow_checks = check_names(
        checks,
        [
            "latestAudioReviewStartHereMarkdown",
            "latestAudioHumanListenControlRoomHtml",
            "latestAudioFinalListenFastPassMarkdown",
            "latestAudioFinalListenFastPassHtml",
            "latestAudioFinalListenFastPassNotesTemplate",
            "latestAudioFinalListenFastPassNotesInboxMarkdown",
            "latestAudioPlatformLoudnessAuditMarkdown",
            "latestAudioPlatformLoudnessAuditHtml",
            "latestAudioPlatformLoudnessAuditOpenCommand",
            "latestAudioBroadcastPolishScorecardMarkdown",
            "latestAudioBroadcastPolishScorecardHtml",
            "latestAudioBroadcastPolishScorecardOpenCommand",
            "latestAudioSmoothnessProofPackMarkdown",
            "latestAudioSmoothnessProofPackHtml",
            "latestAudioSmoothnessProofPackPlaylist",
            "latestAudioSmoothnessProofPackNotesTemplate",
            "latestAudioSmoothnessProofPackOpenCommand",
            "latestAudioSmoothnessProofNotesInboxMarkdown",
            "latestSpeakerCleanupDecisionMatrixMarkdown",
            "latestSpeakerCleanupDecisionMatrixHtml",
            "latestSpeakerCleanupDecisionMatrixOpenCommand",
            "latestSpeakerCleanupTriageBoardMarkdown",
            "latestSpeakerCleanupTriageBoardHtml",
            "latestSpeakerCleanupTriageBoardOpenCommand",
            "latestAudioHumanListenDecisionBriefMarkdown",
            "latestHumanListenDecisionRehearsalMarkdown",
            "latestHumanListenDecisionFrontDoorMarkdown",
            "latestHumanListenDecisionFrontDoorHtml",
            "latestHumanListenDecisionFrontDoorOpenCommand",
            "latestHumanListenDecisionFrontDoorSmokeMarkdown",
            "latestReviewerNotesTemplateMarkdown",
            "latestReviewerNotesTemplateHtml",
            "latestReviewerNotesTemplateOpenCommand",
            "latestReviewHandoffIndexMarkdown",
            "latestListenDecisionTemplateMarkdown",
            "latestAudioListenNotesRepairPlannerMarkdown",
            "latestAudioPostHumanListenNotesRoundtripSmokeMarkdown",
            "latestAudioWorkbenchStageControlSurfaceMarkdown",
            "latestAudioWorkbenchStageControlSurfaceHtml",
            "latestAudioWorkbenchStageControlSurfaceOpenCommand",
            "latestAudioProducerGradeAuditMarkdown",
            "latestAudioProducerGradeAuditHtml",
            "latestAudioProducerGradeAuditOpenCommand",
            "latestAudioProducerGradeNotesTemplate",
            "latestAudioProducerGradeNotesInboxMarkdown",
            "latestAudioProducerGradeNotesInboxSmokeMarkdown",
            "latestAudioProducerGradeAuditSmokeMarkdown",
            "latestAudioProducerCommandCenterMarkdown",
            "latestAudioProducerCommandCenterHtml",
            "latestAudioProducerCommandCenterOpenCommand",
            "latestAudioMorningPublicationReadinessPacketMarkdown",
            "latestAudioMorningPublicationReadinessPacketHtml",
            "latestAudioMorningPublicationReadinessPacketOpenCommand",
            "latestAudioQualityMethodsMatrixMarkdown",
            "latestAudioQualityMethodsMatrixHtml",
            "latestAudioQualityMethodsMatrixOpenCommand",
            "latestAudioMorningAudioReviewLauncherMarkdown",
            "latestAudioMorningAudioReviewLauncherHtml",
            "latestAudioMorningAudioReviewLauncherOpenCommand",
            "latestAudioPostListenEpisodeRunwayMarkdown",
            "latestAudioPostListenEpisodeRunwayHtml",
            "latestAudioPostListenEpisodeRunwayOpenCommand",
            "latestAudioProductionDoctrineMarkdown",
            "latestAudioProductionDoctrineHtml",
            "latestAudioProductionDoctrineOpenCommand",
            "latestAudioTransformationLineageLedgerMarkdown",
            "latestAudioTransformationLineageLedgerHtml",
            "latestAudioTransformationLineageLedgerOpenCommand",
            "latestAudioTransformationLineageLedgerSmokeMarkdown",
            "latestAudioTransformationLineageLedgerSmokeOpenCommand",
            "latestAudioManifestReadbackConsistencySmokeMarkdown",
            "latestAudioManifestReadbackConsistencySmokeHtml",
            "latestAudioManifestReadbackConsistencySmokeOpenCommand",
            "latestAudioFinalListenMissionPacketMarkdown",
            "latestAudioFinalListenMissionPacketHtml",
            "latestAudioFinalListenMissionPacketOpenCommand",
            "latestAudioScopedV007RepairCandidatePlanMarkdown",
            "latestAudioScopedV007RepairCandidatePlanHtml",
            "latestAudioScopedV007RepairCandidatePlanOpenCommand",
            "latestAudioScopedV007RepairCandidatePlanSmokeMarkdown",
            "latestAudioScopedV007RepairCandidatePlanSmokeHtml",
            "latestAudioScopedV007RepairCandidatePlanSmokeOpenCommand",
            "latestAudioHumanListenMissionReelNotesTemplate",
            "latestAudioHumanListenMissionReelNotesTemplateMarkdown",
            "latestAudioHumanListenMissionReelNotesInboxMarkdown",
            "latestAudioHumanListenMissionReelNotesInboxSmokeMarkdown",
            "latestAudioStudioSoundControlRoomMarkdown",
            "latestAudioStudioSoundControlRoomHtml",
            "latestAudioStudioSoundControlRoomOpenCommand",
            "latestAudioDefectAtlasNotesTemplate",
            "latestAudioDefectAtlasNotesTemplateMarkdown",
            "latestAudioDefectAtlasNotesInboxMarkdown",
            "latestAudioDefectAtlasNotesInboxHtml",
            "latestAudioDefectAtlasNotesInboxSmokeMarkdown",
            "latestAudioStudioSoundNotesTemplate",
            "latestAudioStudioSoundNotesInboxMarkdown",
            "latestAudioStudioSoundNotesInboxSmokeMarkdown",
            "latestAudioStudioSoundRepairPlannerMarkdown",
            "latestAudioStudioSoundRepairPlannerHtml",
            "latestAudioStudioSoundRepairPlannerOpenCommand",
            "latestAudioStudioSoundRepairPlannerSmokeMarkdown",
            "latestAudioPostReviewActionQueueMarkdown",
            "latestAudioListenProofCoverageMapMarkdown",
            "latestAudioListenProofCoverageMapHtml",
            "latestAudioListenProofCoverageMapOpenCommand",
            "latestAudioWorkbenchRepairTuningConsoleMarkdown",
            "latestAudioWorkbenchRepairTuningConsoleHtml",
            "latestAudioWorkbenchRepairTuningConsoleOpenCommand",
            "latestAudioWorkbenchRepairTuningConsoleSmokeMarkdown",
            "latestAudioWorkbenchParameterControlLedgerMarkdown",
            "latestAudioWorkbenchParameterControlLedgerHtml",
            "latestAudioWorkbenchParameterControlLedgerOpenCommand",
            "latestAudioWorkbenchParameterControlLedgerSmokeMarkdown",
            "latestAudioWorkbenchParameterSweepProofPlanMarkdown",
            "latestAudioWorkbenchParameterSweepProofPlanHtml",
            "latestAudioWorkbenchParameterSweepProofPlanOpenCommand",
            "latestAudioWorkbenchParameterSweepProofPlanSmokeMarkdown",
            "latestAudioWorkbenchParameterSweepProofSnippetPackMarkdown",
            "latestAudioWorkbenchParameterSweepProofSnippetPackHtml",
            "latestAudioWorkbenchParameterSweepProofSnippetPackPlaylist",
            "latestAudioWorkbenchParameterSweepProofSnippetPackOpenCommand",
            "latestAudioWorkbenchParameterSweepProofSnippetPackSmokeMarkdown",
            "latestAudioWorkbenchParameterSweepNotesInboxMarkdown",
            "latestAudioWorkbenchParameterSweepNotesInboxSmokeMarkdown",
            "latestAudioMasterVisualOverviewMarkdown",
            "latestAudioListenPriorityReviewReelMarkdown",
            "latestAudioSourceBalanceListenCompanionMarkdown",
            "latestAudioSourceBalanceRepairWorkorderMarkdown",
            "latestAudioSourceBalanceRepairPreflightMarkdown",
            "latestAudioSourceBalanceRepairPreflightAuditMarkdown",
            "latestAudioSpeakerActivityReviewBoardMarkdown",
            "latestAudioSpeakerActivityReviewBoardHtml",
            "latestAudioSpineListenSanityCheckMarkdown",
            "latestReusableAudioProductionProfileMarkdown",
            "stableReusableAudioProductionProfileMarkdown",
            "latestAudioProductionDoctrineMarkdown",
            "latestDxReviveManualBouncePacketMarkdown",
            "latestDxReviveReturnWorkbenchMarkdown",
            "latestDxReviveReturnWorkbenchHtml",
            "latestDxReviveReturnWorkbenchOpenCommand",
            "latestDxReviveBounceValidationMarkdown",
            "latestDxReviveBounceValidatorSmokeMarkdown",
            "latestDxReviveProofCandidatePlannerMarkdown",
            "latestDxReviveProofCandidatePlannerSmokeMarkdown",
        ],
    )
    branch_checks = check_names(
        checks,
        [
            "latestBranchInheritanceGateMarkdown",
            "latestBranchInheritanceGateHtml",
            "latestBranchInheritanceGateOpenCommand",
            "branchRenderPreflightMarkdown",
            "branchRenderPreflightHtml",
            "branchRenderPreflightOpenCommand",
            "latestApprovalPathSmokeMarkdown",
            "latestApprovalPathSmokeOpenCommand",
            "latestBranchRenderProofMarkdown",
        ],
    )
    source_balance_checks = check_names(
        checks,
        [
            "latestAudioMasterSourceBalanceAuditMarkdown",
            "latestAudioSourceBalanceListenCompanionMarkdown",
            "latestAudioSourceBalanceListenCompanionOpenCommand",
            "latestAudioSourceBalanceRepairWorkorderMarkdown",
            "latestAudioSourceBalanceRepairPreflightMarkdown",
            "latestAudioSourceBalanceRepairPreflightAuditMarkdown",
            "latestAudioSourceBalanceRepairProofPlaylist",
            "latestAudioListenPriorityQueueMarkdown",
            "latestAudioListenPriorityReviewReelMarkdown",
            "latestAudioListenPriorityReviewReelNotesSmokeMarkdown",
            "latestAudioSpineListenSanityCheckMarkdown",
            "latestReviewHandoffIndexMarkdown",
        ],
    )
    reusable_profile_checks = check_names(
        checks,
        [
            "sourceActivityMarkdown",
            "latestBleedRepairWorkorderMarkdown",
            "latestAudioMasterSmoothnessAuditMarkdown",
            "latestAudioSpeakerActivityReviewBoardMarkdown",
            "latestReusableAudioProductionProfileMarkdown",
            "stableReusableAudioProductionProfileMarkdown",
            "latestReusableAudioProductionProfileSmokeMarkdown",
            "latestReusableAudioProfileIntakePacketMarkdown",
            "latestReusableAudioProfileIntakePacketSmokeMarkdown",
            "latestAudioProductionDoctrineMarkdown",
            "latestAudioProductionDoctrineHtml",
            "latestAudioProductionDoctrineOpenCommand",
        ],
    )
    dxrevive_checks = check_names(
        checks,
        [
            "latestDxReviveManualBouncePacketMarkdown",
            "latestDxReviveManualBouncePacketOpenCommand",
            "latestDxReviveReturnWorkbenchMarkdown",
            "latestDxReviveReturnWorkbenchHtml",
            "latestDxReviveReturnWorkbenchOpenCommand",
            "latestDxReviveBounceValidationMarkdown",
            "latestDxReviveBounceValidatorSmokeMarkdown",
            "latestDxReviveProofCandidatePlannerMarkdown",
            "latestDxReviveProofCandidatePlannerSmokeMarkdown",
            "latestAudioProductionDoctrineMarkdown",
        ],
    )

    requirements = [
        make_requirement(
            "Clear conformed production baseline audio package",
            "proved" if all_present(baseline_checks) and package_ready else "partial" if any_present(baseline_checks) else "missing",
            [
                "Master WAV/M4A, QC, source activity, source contribution, and handoff index are present." if all_present(baseline_checks) else "Some baseline package artifacts are missing.",
                f"Package ready for human listen is `{str(package_ready).lower()}`.",
            ],
            "Use the stable START_HERE cockpit for human listening; do not branch-inherit until approval is recorded.",
            baseline_checks,
        ),
        make_requirement(
            "Reviewers can compare proof snippets and understand what changed",
            "proved" if all_present(proof_checks) else "partial" if any_present(proof_checks) else "missing",
            [
                "Listen-priority console, snippet pack, snippet audit, human listen control room, proof bundle/cockpit, and speaker proof audit are available." if all_present(proof_checks) else "Review surfaces exist but are incomplete.",
                "Snippet pack audit has already reported 40 snippets, 0 errors, 0 warnings." if manifest.get("audioListenPrioritySnippetPackLatestAuditErrorCount") == 0 else "Snippet pack audit needs review.",
            ],
            "Reviewer listens to priority snippets first, exports notes, then routes pass/fail through guarded inbox commands.",
            proof_checks,
        ),
        make_requirement(
            "Source-balance/Homer-preservation warnings are represented in the human listen path",
            "proved"
            if all_present(source_balance_checks)
            and source_balance_flag_coverage
            and source_balance_queue_item_count > 0
            and review_reel_complete
            and review_reel_notes_smoke_passed
            else "partial"
            if any_present(source_balance_checks)
            else "missing",
            [
                "Focus rows cover every full-audit source-balance warning family." if source_balance_flag_coverage else "Source-balance focus rows do not yet cover every warning family.",
                f"Focus flag counts: `{source_balance_focus_flags}`.",
                f"Full-audit flag counts: `{source_balance_full_flags}`.",
                f"Source-balance queue items: `{source_balance_queue_item_count}`.",
                f"Review reel complete: `{str(review_reel_complete).lower()}`; notes smoke passed: `{str(review_reel_notes_smoke_passed).lower()}`.",
                f"Audio spine listen sanity passed: `{str(bool(spine_listen_sanity.get('passed'))).lower() if spine_listen_sanity else 'not generated'}`.",
            ],
            "Use the source-balance companion while listening to the review reel so Homer-preservation and phantom-energy warnings are checked by ear.",
            source_balance_checks,
        ),
        make_requirement(
            "Raw sources remain untouched",
            "proved" if reports and not original_media_mutated else "missing" if original_media_mutated else "partial",
            [
                "Loaded audit reports report no original-media mutation." if reports and not original_media_mutated else "No audit report claims original media mutation, but evidence is thin." if not original_media_mutated else "At least one evidence report claims original media mutation.",
                f"Evidence reports scanned: `{len(reports)}`.",
            ],
            "Keep all future repairs on derived stems/snippets and keep writing original-media mutation flags into every audit.",
            [],
        ),
        make_requirement(
            "Speaker-aware silence/bleed cleanup is inspectable",
            "partial" if all_present(bleed_checks) else "missing" if not any_present(bleed_checks) else "partial",
            [
                "Speaker bleed/gap proof audit exists and focuses the cleanup promise." if output_path(outputs.get("latestSpeakerBleedGapProofAuditMarkdown")) else "Speaker bleed/gap proof audit is missing.",
                "Speaker activity review board exists and joins activity, automation, focus windows, and listen questions." if output_path(outputs.get("latestAudioSpeakerActivityReviewBoardMarkdown")) else "Speaker activity review board is missing.",
                f"Speaker cleanup proof pack rendered `{speaker_cleanup_proof_pack.get('renderSuccessCount') or 0}` / `{speaker_cleanup_proof_pack.get('renderAttemptCount') or 0}` review snippets across `{speaker_cleanup_proof_pack.get('focusWindowCount') or 0}` focus windows.",
                f"Speaker cleanup proof pack audit passed: `{str(speaker_cleanup_proof_pack_audit.get('passed')).lower()}`; audited snippets `{speaker_cleanup_proof_pack_audit.get('snippetCount') or 0}`; errors `{speaker_cleanup_proof_pack_audit.get('errorCount') or 0}`; warnings `{speaker_cleanup_proof_pack_audit.get('warningCount') or 0}`.",
                f"Speaker cleanup listen map windows: `{speaker_cleanup_listen_map.get('windowCount') or 0}`; proof pack audit linked: `{str(speaker_cleanup_listen_map.get('proofPackAuditPassed')).lower()}`.",
                f"Speaker cleanup decision matrix status/windows/snippets/missing: `{speaker_cleanup_decision_matrix.get('decisionStatus') or 'not generated'}` / `{speaker_cleanup_decision_matrix.get('windowCount') or 0}` / `{speaker_cleanup_decision_matrix.get('proofSnippetCount') or 0}` / `{speaker_cleanup_decision_matrix.get('missingSnippetCount') or 0}`.",
                f"Speaker cleanup decision matrix related contribution/preservation evidence: `{speaker_cleanup_decision_matrix.get('relatedContributionMarkerCount') or 0}` contribution markers; `{speaker_cleanup_decision_matrix.get('relatedPreservationItemCount') or 0}` preservation items.",
                f"Speaker cleanup triage board: `{speaker_cleanup_triage_board.get('status') or 'not generated'}`; windows `{speaker_cleanup_triage_board.get('windowCount') or 0}`; must-listen `{speaker_cleanup_triage_board.get('mustListenCount') or 0}`; missing snippets `{speaker_cleanup_triage_board.get('missingSnippetCount') or 0}`; missing evidence `{speaker_cleanup_triage_board.get('missingEvidenceCount') or 0}`.",
                f"Speaker cleanup acceptance board: `{speaker_cleanup_acceptance_board.get('status') or 'not generated'}`; machine checks `{speaker_cleanup_acceptance_board.get('machineCheckPassedCount') or 0}` / `{speaker_cleanup_acceptance_board.get('machineCheckCount') or 0}`; missing artifacts `{speaker_cleanup_acceptance_board.get('missingArtifactCount') or 0}`; missing snippets `{speaker_cleanup_acceptance_board.get('missingSnippetCount') or 0}`; human listen required `{str(bool(speaker_cleanup_acceptance_board.get('humanListenRequired'))).lower()}`.",
                f"Speaker cleanup listen reel: `{speaker_cleanup_listen_reel.get('status') or 'not generated'}`; items `{speaker_cleanup_listen_reel.get('itemCount') or 0}`; rendered `{speaker_cleanup_listen_reel.get('renderedItemCount') or 0}`; missing snippets `{speaker_cleanup_listen_reel.get('missingSnippetCount') or 0}`; duration `{speaker_cleanup_listen_reel.get('durationSeconds') or 0}s`.",
                f"Speaker contribution ledger markers: `{speaker_contribution_ledger.get('reviewMarkerCount') or 0}`; Charlie/Homer summaries: `{len(speaker_contribution_ledger.get('speakerSummaries') or [])}`.",
                f"Speaker cleanup notes inbox candidates: `{speaker_cleanup_notes_inbox.get('matchingCandidateCount') if speaker_cleanup_notes_inbox else 0}`; inbox smoke passed: `{str(speaker_cleanup_notes_inbox_smoke.get('passed')).lower()}`.",
                f"Speaker preservation proof pack items/snippets/failures: `{speaker_preservation_proof_pack.get('itemCount') or 0}` items; `{speaker_preservation_proof_pack.get('renderedSnippetCount') or 0}` rendered snippets; `{speaker_preservation_proof_pack.get('renderFailureCount') or 0}` failures.",
                f"Speaker preservation notes inbox candidates/actions: `{speaker_preservation_notes_inbox.get('matchingCandidateCount') if speaker_preservation_notes_inbox else 0}` candidates; repair `{speaker_preservation_notes_inbox.get('repairActionCount') if speaker_preservation_notes_inbox else 0}`; proof `{speaker_preservation_notes_inbox.get('focusedProofActionCount') if speaker_preservation_notes_inbox else 0}`; pass/context `{speaker_preservation_notes_inbox.get('passContextCount') if speaker_preservation_notes_inbox else 0}`.",
                "Human listen is still required to prove the conversation does not sound chopped or echo-heavy.",
            ],
            "Start with the compact Speaker Cleanup Listen Reel, then use the 15 focus windows, 40 priority snippets, and speaker-preservation A/B pack to decide whether v006 passes or needs a scoped v007 repair.",
            bleed_checks,
        ),
        make_requirement(
            "Edit branches inherit one clean production baseline",
            "proved" if branch_inheritance_ready else "locked" if all_present(check_names(checks, ["latestBranchInheritanceGateMarkdown", "latestBranchInheritanceGateHtml", "latestBranchInheritanceGateOpenCommand"])) else "missing",
            [
                f"branchInheritanceReady is `{str(branch_inheritance_ready).lower()}`.",
                f"Approval status is `{approval_status}`.",
                "Approval-path sandbox smoke exists and proves the post-approval branch route without changing real v006." if output_path(outputs.get("latestApprovalPathSmokeMarkdown")) else "Approval-path sandbox smoke is not registered.",
            ],
            "Record an explicit human listen pass before unlocking inheritance; do not hand-edit manifest truth.",
            check_names(checks, ["latestBranchInheritanceGateMarkdown", "latestBranchInheritanceGateHtml", "latestBranchInheritanceGateOpenCommand", "latestApprovalPathSmokeMarkdown", "latestApprovalPathSmokeOpenCommand", "latestListenDecisionTemplateMarkdown"]),
        ),
        make_requirement(
            "At least one Episode 4 long-form render uses the conformed baseline",
            "proved" if branch_render_ready else "locked" if any_present(branch_checks) else "missing",
            [
                f"branchRenderReady is `{str(branch_render_ready).lower()}`.",
                "A proof-only branch render evidence packet exists, but it is not publication or branch approval." if output_path(outputs.get("latestBranchRenderProofMarkdown")) else "No branch render proof evidence is registered.",
                "Approval-path sandbox smoke proves approved render command exposure in a sandbox." if output_path(outputs.get("latestApprovalPathSmokeMarkdown")) else "No approval-path sandbox smoke is registered.",
            ],
            "After human listen approval, render full branch outputs with v006 or newer as the inherited spine.",
            branch_checks,
        ),
        make_requirement(
            "dxRevive/manual restoration fallback is inspectable",
            "partial" if all_present(dxrevive_checks) else "missing" if not any_present(dxrevive_checks) else "partial",
            [
                "Manual dxRevive packet and return validator exist for derived stems only." if all_present(dxrevive_checks) else "Manual dxRevive fallback surfaces are incomplete.",
                f"dxRevive validation status: `{dxrevive_validation.get('status') or 'not generated'}`.",
                f"dxRevive return workbench status: `{dxrevive_return_workbench.get('status') or 'not generated'}`; expected/validated/missing `{dxrevive_return_workbench.get('expectedCount') or 0}` / `{dxrevive_return_workbench.get('validatedCount') or 0}` / `{dxrevive_return_workbench.get('missingCount') or 0}`.",
                f"dxRevive validator smoke passed: `{str(bool(dxrevive_smoke.get('passed'))).lower() if dxrevive_smoke else 'not generated'}`.",
                f"Expected bounces: `{dxrevive_validation.get('expectedCount') or 0}`; validated: `{dxrevive_validation.get('validatedCount') or 0}`; missing: `{dxrevive_validation.get('missingCount') or 0}`.",
                f"dxRevive proof candidate planner status: `{dxrevive_planner.get('status') or 'not generated'}`.",
                f"dxRevive proof candidate planner smoke passed: `{str(bool(dxrevive_planner_smoke.get('passed'))).lower() if dxrevive_planner_smoke else 'not generated'}`.",
                f"Audio production doctrine status: `{production_doctrine.get('doctrineStatus') if production_doctrine else 'not generated'}`; dxRevive stage status carried as `{production_doctrine.get('dxReviveStatus') if production_doctrine else 'not generated'}`.",
                "This remains partial until returned bounces exist and at least one proof candidate safely compares them against v006.",
            ],
            "If restoration is needed, bounce the packet stems manually, validate returned files, and only then create a timestamped proof candidate.",
            dxrevive_checks,
        ),
        make_requirement(
            "Reusable for future noisy/outdoor Homer recordings",
            "partial" if all_present(reusable_profile_checks) else "partial" if any_present(reusable_profile_checks) else "missing",
            [
                "The current pipeline has reusable source-activity, bleed audit, repair workorder, smoothness audit, speaker activity board, and exported reusable profile surfaces." if all_present(reusable_profile_checks) else "Reusable noisy-source evidence is present but incomplete.",
                f"Reusable profile readiness: `{reusable_profile.get('reuseReadiness') or 'not generated'}`.",
                f"Reusable profile focus windows: `{reusable_profile.get('focusWindowCount') or 0}`; listen queue items: `{reusable_profile.get('listenPriorityQueueCount') or 0}`.",
                f"Reusable profile smoke passed: `{str(bool(reusable_profile_smoke.get('passed'))).lower() if reusable_profile_smoke else 'not generated'}`.",
                f"Reusable profile smoke failed scenario count: `{reusable_profile_smoke.get('failedScenarioCount') if reusable_profile_smoke else 'not generated'}`.",
                f"Reusable intake readiness: `{reusable_profile_intake.get('futureEpisodeReadiness') if reusable_profile_intake else 'not generated'}`.",
                f"Reusable intake smoke passed: `{str(bool(reusable_profile_intake_smoke.get('passed'))).lower() if reusable_profile_intake_smoke else 'not generated'}`.",
                f"Reusable intake source rows/stages/input groups: `{reusable_intake_source_rows}` / `{reusable_intake_stage_count}` / `{reusable_intake_group_count}`.",
                f"Episodes 1-6 rollout board: `{episode_rollout_board.get('status') if episode_rollout_board else 'not generated'}`; episodes `{episode_rollout_board.get('episodeCount') if episode_rollout_board else 'not generated'}`; intake-ready `{episode_rollout_board.get('readyForIntakeCount') if episode_rollout_board else 'not generated'}`; proof targets `{episode_rollout_board.get('currentProofTargetCount') if episode_rollout_board else 'not generated'}`.",
                f"Episodes 1-6 media inventory: `{episode_media_inventory.get('status') if episode_media_inventory else 'not generated'}`; files `{episode_media_inventory.get('scannedFileCount') if episode_media_inventory else 'not generated'}`; audio `{episode_media_inventory.get('audioFileCount') if episode_media_inventory else 'not generated'}`; video `{episode_media_inventory.get('videoFileCount') if episode_media_inventory else 'not generated'}`; spine candidates `{episode_media_inventory.get('candidateSpineCount') if episode_media_inventory else 'not generated'}`.",
                f"Audio production doctrine stages/missing artifacts: `{production_doctrine.get('stageCount') if production_doctrine else 0}` / `{production_doctrine.get('stageMissingArtifactCount') if production_doctrine else 'not generated'}`.",
                "Reuse is not fully proved until the workflow handles another messy/outdoor episode without bespoke surgery.",
            ],
            "Use the intake packet to start the next noisy Homer recording with explicit sources, sync evidence, speaker activity, proof windows, and human-listen notes before calling the profile production-default.",
            reusable_profile_checks,
        ),
        make_requirement(
            "Workflow feels like a grown-up audio production pipeline",
            "partial" if all_present(workflow_checks) and post_human_roundtrip_smoke_passed and post_human_roundtrip_smoke_rehearsal_ok else "missing" if not any_present(workflow_checks) else "partial",
            [
                "Stable START_HERE, producer command center, human listen control room, listen proof coverage map, reviewer notes template, human listen decision brief, handoff index, decision template, repair planner, repair/tuning console, parameter control ledger, parameter sweep proof plan, roundtrip smoke, stage control surface, and visual overview are wired." if all_present(workflow_checks) and post_human_roundtrip_smoke_passed else "Some workflow surfaces exist, but the reviewer path is incomplete or its smoke has not passed.",
                f"Stage control surface stages/missing artifacts: `{stage_control_surface.get('stageCount') if stage_control_surface else 0}` / `{stage_control_surface.get('missingArtifactCount') if stage_control_surface else 'not generated'}`.",
                f"Post-human-listen notes roundtrip smoke passed: `{str(post_human_roundtrip_smoke_passed).lower()}`.",
                f"Human-listen rehearsal in roundtrip smoke registered: `{str(post_human_roundtrip_smoke_rehearsal_registered).lower()}`; step OK: `{str(post_human_roundtrip_smoke_rehearsal_step_ok).lower()}`; passed: `{str(post_human_roundtrip_smoke_rehearsal_passed).lower()}`; manifest unchanged: `{str(post_human_roundtrip_smoke_rehearsal_manifest_unchanged).lower()}`.",
                f"Final-listen fast pass items: `{final_listen_fast_pass.get('itemCount') or 0}`; notes inbox candidates/actions: `{final_listen_fast_pass_notes_inbox.get('matchingCandidateCount') if final_listen_fast_pass_notes_inbox else 0}` candidates; repair `{final_listen_fast_pass_notes_inbox.get('repairActionCount') if final_listen_fast_pass_notes_inbox else 0}`; proof `{final_listen_fast_pass_notes_inbox.get('focusedProofActionCount') if final_listen_fast_pass_notes_inbox else 0}`; pass/context `{final_listen_fast_pass_notes_inbox.get('passContextCount') if final_listen_fast_pass_notes_inbox else 0}`.",
                f"Platform loudness podcast machine-ready: `{str((platform_loudness_audit.get('summary') or {}).get('podcastProfilesMachineReady')).lower() if platform_loudness_audit else 'not generated'}`; hard-gate attention `{(platform_loudness_audit.get('summary') or {}).get('hardGateAttentionCount') if platform_loudness_audit else 'not generated'}`; advisory attention `{(platform_loudness_audit.get('summary') or {}).get('advisoryAttentionCount') if platform_loudness_audit else 'not generated'}`.",
                f"Broadcast polish scorecard: `{broadcast_polish_scorecard.get('overallStatus') if broadcast_polish_scorecard else 'not generated'}`; overall score `{broadcast_polish_scorecard.get('overallScore') if broadcast_polish_scorecard else 'not generated'}`.",
                f"Smoothness proof pack: `{smoothness_proof_pack.get('snippetCount') if smoothness_proof_pack else 'not generated'}` snippets; render failures `{smoothness_proof_pack.get('renderFailureCount') if smoothness_proof_pack else 'not generated'}`.",
                f"Smoothness notes inbox: `{smoothness_proof_notes_inbox.get('matchingCandidateCount') if smoothness_proof_notes_inbox else 'not generated'}` candidates; repair/proof/pass counts `{smoothness_proof_notes_inbox.get('repairActionCount') if smoothness_proof_notes_inbox else 'not generated'}` / `{smoothness_proof_notes_inbox.get('focusedProofActionCount') if smoothness_proof_notes_inbox else 'not generated'}` / `{smoothness_proof_notes_inbox.get('passContextCount') if smoothness_proof_notes_inbox else 'not generated'}`.",
                f"Speaker cleanup decision matrix: `{speaker_cleanup_decision_matrix.get('decisionStatus') or 'not generated'}`; windows `{speaker_cleanup_decision_matrix.get('windowCount') or 0}`; missing snippets `{speaker_cleanup_decision_matrix.get('missingSnippetCount') or 0}`.",
                f"Speaker cleanup triage board: `{speaker_cleanup_triage_board.get('status') or 'not generated'}`; must-listen `{speaker_cleanup_triage_board.get('mustListenCount') if speaker_cleanup_triage_board else 'not generated'}`; missing evidence `{speaker_cleanup_triage_board.get('missingEvidenceCount') if speaker_cleanup_triage_board else 'not generated'}`.",
                f"Speaker cleanup listen reel: `{speaker_cleanup_listen_reel.get('status') or 'not generated'}`; items `{speaker_cleanup_listen_reel.get('itemCount') or 0}`; missing snippets `{speaker_cleanup_listen_reel.get('missingSnippetCount') or 0}`.",
                f"Producer command center: `{producer_command_center.get('commandCenterStatus') if producer_command_center else 'not generated'}`; cards `{producer_command_center.get('reviewCardCount') if producer_command_center else 'not generated'}`; missing primary artifacts `{producer_command_center.get('missingPrimaryArtifactCount') if producer_command_center else 'not generated'}`.",
                f"Morning publication readiness: `{morning_publication_readiness.get('status') if morning_publication_readiness else 'not generated'}`; ready `{str(bool(morning_publication_readiness.get('readyForMorningReview'))).lower() if morning_publication_readiness else 'not generated'}`; Premiere use `{str(bool(morning_publication_readiness.get('machineReadyForManualPremiereUse'))).lower() if morning_publication_readiness else 'not generated'}`; hard stops `{morning_publication_readiness.get('hardStopCount') if morning_publication_readiness else 'not generated'}`.",
                f"Quality methods matrix: `{quality_methods_matrix.get('status') if quality_methods_matrix else 'not generated'}`; target `{quality_methods_matrix.get('qualityTargetInThisGoal') if quality_methods_matrix else 'not generated'}`; methods `{quality_methods_matrix.get('methodCount') if quality_methods_matrix else 'not generated'}`; recommended next `{quality_methods_matrix.get('recommendedNextMethodCount') if quality_methods_matrix else 'not generated'}`.",
                f"Morning audio review launcher: `{morning_audio_review_launcher.get('status') if morning_audio_review_launcher else 'not generated'}`; hard stops `{morning_audio_review_launcher.get('hardStopCount') if morning_audio_review_launcher else 'not generated'}`; listen file exists `{str(bool((morning_audio_review_launcher.get('recommendedListeningFile') or {}).get('exists'))).lower() if morning_audio_review_launcher else 'not generated'}`; WAV exists `{str(bool((morning_audio_review_launcher.get('recommendedAudioFile') or {}).get('exists'))).lower() if morning_audio_review_launcher else 'not generated'}`.",
                f"Post-listen episode runway: `{post_listen_episode_runway.get('status') if post_listen_episode_runway else 'not generated'}`; routes `{post_listen_episode_runway.get('routeCount') if post_listen_episode_runway else 'not generated'}`; final episode gate `{(post_listen_episode_runway.get('qualityGates') or {}).get('finalEpisode', {}).get('status') if post_listen_episode_runway else 'not generated'}`; shorts gate `{(post_listen_episode_runway.get('qualityGates') or {}).get('shorts', {}).get('status') if post_listen_episode_runway else 'not generated'}`.",
                f"Listen proof coverage map: `{listen_proof_coverage_map.get('coverageStatus') if listen_proof_coverage_map else 'not generated'}`; steps `{listen_proof_coverage_map.get('minimumListenStepCount') if listen_proof_coverage_map else 'not generated'}`; remaining requirement coverage `{listen_proof_coverage_map.get('remainingRequirementCoverageCount') if listen_proof_coverage_map else 'not generated'}`; missing artifacts `{listen_proof_coverage_map.get('missingArtifactCount') if listen_proof_coverage_map else 'not generated'}`.",
                f"Audio production doctrine: `{production_doctrine.get('doctrineStatus') if production_doctrine else 'not generated'}`; stages `{production_doctrine.get('stageCount') if production_doctrine else 'not generated'}`; missing stage artifacts `{production_doctrine.get('stageMissingArtifactCount') if production_doctrine else 'not generated'}`.",
                f"Audio transformation lineage ledger: `{transformation_lineage.get('lineageStatus') if transformation_lineage else 'not generated'}`; stages `{transformation_lineage.get('stageCount') if transformation_lineage else 'not generated'}`; missing evidence `{transformation_lineage.get('missingEvidenceCount') if transformation_lineage else 'not generated'}`.",
                f"Audio transformation lineage ledger smoke passed: `{str(bool(transformation_lineage_smoke.get('passed'))).lower() if transformation_lineage_smoke else 'not generated'}`; scenarios `{transformation_lineage_smoke.get('scenarioCount') if transformation_lineage_smoke else 'not generated'}`; failures `{transformation_lineage_smoke.get('failedScenarioCount') if transformation_lineage_smoke else 'not generated'}`.",
                f"Audio manifest readback consistency smoke passed: `{str(bool(manifest_readback_smoke.get('passed'))).lower() if manifest_readback_smoke else 'not generated'}`; checks `{manifest_readback_smoke.get('checkCount') if manifest_readback_smoke else 'not generated'}`; failures `{manifest_readback_smoke.get('failureCount') if manifest_readback_smoke else 'not generated'}`.",
                f"Final listen mission packet: `{final_listen_mission_packet.get('status') if final_listen_mission_packet else 'not generated'}`; steps `{final_listen_mission_packet.get('missionStepCount') if final_listen_mission_packet else 'not generated'}`; missing required artifacts `{final_listen_mission_packet.get('missingRequiredArtifactCount') if final_listen_mission_packet else 'not generated'}`.",
                f"Audio Defect Atlas: `{defect_atlas.get('status') or 'not generated'}`; items `{(defect_atlas.get('summary') or {}).get('itemCount') or 0}`; timed `{(defect_atlas.get('summary') or {}).get('timedItemCount') or 0}`; missing evidence `{(defect_atlas.get('summary') or {}).get('missingEvidenceCount') or 0}`.",
                f"Human listen mission board: `{human_listen_mission_board.get('status') if human_listen_mission_board else 'not generated'}`; steps `{human_listen_mission_board.get('missionStepCount') if human_listen_mission_board else 'not generated'}`; focus windows `{human_listen_mission_board.get('focusWindowCount') if human_listen_mission_board else 'not generated'}`; missing artifacts `{human_listen_mission_board.get('missingArtifactCount') if human_listen_mission_board else 'not generated'}`.",
                f"Human listen mission reel: `{human_listen_mission_reel.get('status') if human_listen_mission_reel else 'not generated'}`; items `{human_listen_mission_reel.get('itemCount') if human_listen_mission_reel else 'not generated'}`; duration `{human_listen_mission_reel.get('durationSeconds') if human_listen_mission_reel else 'not generated'}`; missing snippets `{human_listen_mission_reel.get('missingSnippetCount') if human_listen_mission_reel else 'not generated'}`.",
                f"Human listen mission reel notes inbox: `{human_listen_mission_reel_notes_inbox.get('matchingCandidateCount') if human_listen_mission_reel_notes_inbox else 'not generated'}` candidates; repair/proof/pass counts `{human_listen_mission_reel_notes_inbox.get('repairActionCount') if human_listen_mission_reel_notes_inbox else 'not generated'}` / `{human_listen_mission_reel_notes_inbox.get('focusedProofActionCount') if human_listen_mission_reel_notes_inbox else 'not generated'}` / `{human_listen_mission_reel_notes_inbox.get('passContextCount') if human_listen_mission_reel_notes_inbox else 'not generated'}`; smoke passed `{str(bool(human_listen_mission_reel_notes_inbox_smoke.get('passed'))).lower() if human_listen_mission_reel_notes_inbox_smoke else 'not generated'}`.",
                f"Studio Sound notes inbox: `{studio_sound_notes_inbox.get('matchingCandidateCount') if studio_sound_notes_inbox else 'not generated'}` candidates; repair/proof/pass counts `{studio_sound_notes_inbox.get('repairActionCount') if studio_sound_notes_inbox else 'not generated'}` / `{studio_sound_notes_inbox.get('focusedProofActionCount') if studio_sound_notes_inbox else 'not generated'}` / `{studio_sound_notes_inbox.get('passContextCount') if studio_sound_notes_inbox else 'not generated'}`; smoke passed `{str(bool(studio_sound_notes_inbox_smoke.get('passed'))).lower() if studio_sound_notes_inbox_smoke else 'not generated'}`.",
                "Human usability still needs actual listen/review feedback before calling this proved.",
            ],
            "Have Charlie/Mako use the cockpit once and feed back confusing points; improve the cockpit rather than adding hidden magic.",
            workflow_checks,
        ),
        make_requirement(
            "Morning publication handoff is explicit",
            "proved" if all_present(check_names(checks, ["latestAudioMorningPublicationReadinessPacketMarkdown", "latestAudioMorningPublicationReadinessPacketHtml", "latestAudioMorningPublicationReadinessPacketOpenCommand"])) and bool(morning_publication_readiness.get("readyForMorningReview")) and int_value(morning_publication_readiness.get("hardStopCount")) == 0 else "partial",
            [
                f"Morning packet status: `{morning_publication_readiness.get('status') if morning_publication_readiness else 'not generated'}`.",
                f"Ready for morning review: `{str(bool(morning_publication_readiness.get('readyForMorningReview'))).lower() if morning_publication_readiness else 'not generated'}`.",
                f"Machine ready for manual Premiere use: `{str(bool(morning_publication_readiness.get('machineReadyForManualPremiereUse'))).lower() if morning_publication_readiness else 'not generated'}`.",
                f"Human listen required: `{str(bool(morning_publication_readiness.get('humanListenRequired'))).lower() if morning_publication_readiness else 'not generated'}`.",
                f"Hard stops: `{morning_publication_readiness.get('hardStopCount') if morning_publication_readiness else 'not generated'}`.",
                f"Recommended audio file: `{morning_publication_readiness.get('recommendedAudioFile') if morning_publication_readiness else 'not generated'}`.",
                f"Recommended listening file: `{morning_publication_readiness.get('recommendedListeningFile') if morning_publication_readiness else 'not generated'}`.",
                "This proves the morning handoff is clear; it does not approve audio, unlock branches, render, upload, publish, or mutate originals.",
            ],
            "Use the morning packet when Charlie wants the practical answer: listen to the M4A, pull the WAV into Premiere if it passes human review, and keep public publishing behind explicit approval/receipts.",
            check_names(checks, ["latestAudioMorningPublicationReadinessPacketMarkdown", "latestAudioMorningPublicationReadinessPacketHtml", "latestAudioMorningPublicationReadinessPacketOpenCommand"]),
        ),
        make_requirement(
            "Quality methods are explicit enough to guide the next production pass",
            "proved" if all_present(check_names(checks, ["latestAudioQualityMethodsMatrixMarkdown", "latestAudioQualityMethodsMatrixHtml", "latestAudioQualityMethodsMatrixOpenCommand"])) and int_value(quality_methods_matrix.get("methodCount")) >= 5 and str(quality_methods_matrix.get("currentQuestion")) == "high-quality-audio-spine-first" else "partial",
            [
                f"Quality matrix status: `{quality_methods_matrix.get('status') if quality_methods_matrix else 'not generated'}`.",
                f"Current question: `{quality_methods_matrix.get('currentQuestion') if quality_methods_matrix else 'not generated'}`.",
                f"Goal target: `{quality_methods_matrix.get('qualityTargetInThisGoal') if quality_methods_matrix else 'not generated'}`.",
                f"Not yet the same as: `{quality_methods_matrix.get('notYetTheSameAs') if quality_methods_matrix else 'not generated'}`.",
                f"Method count: `{quality_methods_matrix.get('methodCount') if quality_methods_matrix else 'not generated'}`.",
                f"Recommended next method count: `{quality_methods_matrix.get('recommendedNextMethodCount') if quality_methods_matrix else 'not generated'}`.",
                f"Machine listen sentinel status: `{machine_listen_sentinel.get('status') if machine_listen_sentinel else 'not generated'}`.",
                f"Machine listen sentinel score: `{machine_listen_sentinel.get('score') if machine_listen_sentinel else 'not generated'}`; hard stops `{machine_listen_sentinel.get('hardStopCount') if machine_listen_sentinel else 'not generated'}`; review risks `{machine_listen_sentinel.get('reviewRiskCount') if machine_listen_sentinel else 'not generated'}`.",
                "This keeps final episode/short quality separate from audio-spine quality while giving future agents a concrete scoring roadmap and a direct machine-listen sentinel.",
            ],
            "Use the matrix and sentinel to decide whether the next improvement is spine QC, perceptual speech scoring, final edit-flow QA, or platform render/package QA.",
            check_names(checks, ["latestAudioQualityMethodsMatrixMarkdown", "latestAudioQualityMethodsMatrixHtml", "latestAudioQualityMethodsMatrixOpenCommand", "latestAudioMachineListenSentinelMarkdown", "latestAudioMachineListenSentinelHtml", "latestAudioMachineListenSentinelOpenCommand"]),
        ),
        make_requirement(
            "Morning audio review can be opened without path hunting",
            "proved" if all_present(check_names(checks, ["latestAudioMorningAudioReviewLauncherMarkdown", "latestAudioMorningAudioReviewLauncherHtml", "latestAudioMorningAudioReviewLauncherOpenCommand"])) and int_value(morning_audio_review_launcher.get("hardStopCount")) == 0 and bool((morning_audio_review_launcher.get("recommendedListeningFile") or {}).get("exists")) and bool((morning_audio_review_launcher.get("recommendedAudioFile") or {}).get("exists")) else "partial",
            [
                f"Launcher status: `{morning_audio_review_launcher.get('status') if morning_audio_review_launcher else 'not generated'}`.",
                f"Hard stops: `{morning_audio_review_launcher.get('hardStopCount') if morning_audio_review_launcher else 'not generated'}`.",
                f"Listening file: `{(morning_audio_review_launcher.get('recommendedListeningFile') or {}).get('path') if morning_audio_review_launcher else 'not generated'}`.",
                f"Premiere WAV: `{(morning_audio_review_launcher.get('recommendedAudioFile') or {}).get('path') if morning_audio_review_launcher else 'not generated'}`.",
                "The launcher opens the practical review door only; it does not approve, unlock branches, render, upload, publish, or mutate originals.",
            ],
            "Open `OPEN_EPISODE_4_MORNING_AUDIO_REVIEW.command` after the grave shift. Listen to the M4A, reveal the WAV for Premiere if it passes, then use the guarded decision front door.",
            check_names(checks, ["latestAudioMorningAudioReviewLauncherMarkdown", "latestAudioMorningAudioReviewLauncherHtml", "latestAudioMorningAudioReviewLauncherOpenCommand"]),
        ),
        make_requirement(
            "Post-listen episode runway separates spine approval from episode and shorts rendering",
            "proved" if all_present(check_names(checks, ["latestAudioPostListenEpisodeRunwayMarkdown", "latestAudioPostListenEpisodeRunwayHtml", "latestAudioPostListenEpisodeRunwayOpenCommand"])) and int_value(post_listen_episode_runway.get("hardStopCount")) == 0 and int_value(post_listen_episode_runway.get("routeCount")) >= 3 else "partial",
            [
                f"Runway status: `{post_listen_episode_runway.get('status') if post_listen_episode_runway else 'not generated'}`.",
                f"Hard stops: `{post_listen_episode_runway.get('hardStopCount') if post_listen_episode_runway else 'not generated'}`.",
                f"Routes: `{post_listen_episode_runway.get('routeCount') if post_listen_episode_runway else 'not generated'}`.",
                f"Audio-spine gate: `{(post_listen_episode_runway.get('qualityGates') or {}).get('audioSpine', {}).get('status') if post_listen_episode_runway else 'not generated'}`.",
                f"Final episode gate: `{(post_listen_episode_runway.get('qualityGates') or {}).get('finalEpisode', {}).get('status') if post_listen_episode_runway else 'not generated'}`.",
                f"Shorts gate: `{(post_listen_episode_runway.get('qualityGates') or {}).get('shorts', {}).get('status') if post_listen_episode_runway else 'not generated'}`.",
                "This proves the path after listening is explicit; it still does not approve audio, render, upload, publish, or mutate originals.",
            ],
            "After Charlie listens, use this runway to choose pass, fail, or needs-proof. Only a pass should refresh branch gates and lead to Episode 4 package renders.",
            check_names(checks, ["latestAudioPostListenEpisodeRunwayMarkdown", "latestAudioPostListenEpisodeRunwayHtml", "latestAudioPostListenEpisodeRunwayOpenCommand"]),
        ),
        make_requirement(
            "Next safe action is unambiguous",
            "proved" if producer_front_door_first and output_path(outputs.get("latestAudioFinalListenMissionPacketHtml")) and output_path(outputs.get("latestAudioFinalListenMissionPacketOpenCommand")) and output_path(outputs.get("latestAudioProducerCommandCenterOpenCommand")) and output_path(outputs.get("latestAudioMorningPublicationReadinessPacketOpenCommand")) and output_path(outputs.get("latestAudioQualityMethodsMatrixOpenCommand")) and output_path(outputs.get("latestAudioSpineQualityGateOpenCommand")) and output_path(outputs.get("latestAudioMorningAudioReviewLauncherOpenCommand")) and output_path(outputs.get("latestAudioPostListenEpisodeRunwayOpenCommand")) and output_path(outputs.get("latestAudioListenProofCoverageMapOpenCommand")) and output_path(outputs.get("latestAudioHumanListenControlRoomHtml")) and output_path(outputs.get("latestAudioHumanListenDecisionBriefMarkdown")) and output_path(outputs.get("latestHumanListenDecisionRehearsalMarkdown")) and output_path(outputs.get("latestHumanListenDecisionFrontDoorHtml")) and output_path(outputs.get("latestHumanListenDecisionFrontDoorSmokeMarkdown")) and output_path(outputs.get("latestReviewHandoffIndexMarkdown")) else "missing",
            [
                "START_HERE opens the Producer Command Center before the stage-control surface." if producer_front_door_first else "START_HERE does not yet prove Producer Command Center as the first review surface.",
                "Final listen mission packet, Producer Command Center, morning publication packet, quality methods matrix, morning audio review launcher, post-listen episode runway, listen proof coverage map, human listen control room, human decision brief, decision rehearsal, decision front-door smoke, and handoff index list current artifacts and keep branch inheritance locked." if output_path(outputs.get("latestReviewHandoffIndexMarkdown")) else "Handoff index is missing.",
            ],
            "Open START_HERE, begin with the Producer Command Center, complete human listen proof, and if it fails create a scoped repair candidate instead of overwriting v006.",
            check_names(checks, ["latestAudioReviewStartHereMarkdown", "latestAudioFinalListenMissionPacketHtml", "latestAudioFinalListenMissionPacketOpenCommand", "latestAudioProducerCommandCenterOpenCommand", "latestAudioMorningPublicationReadinessPacketOpenCommand", "latestAudioQualityMethodsMatrixOpenCommand", "latestAudioSpineQualityGateOpenCommand", "latestAudioMorningAudioReviewLauncherOpenCommand", "latestAudioPostListenEpisodeRunwayOpenCommand", "latestAudioListenProofCoverageMapOpenCommand", "latestAudioHumanListenControlRoomHtml", "latestAudioHumanListenDecisionBriefMarkdown", "latestHumanListenDecisionRehearsalMarkdown", "latestHumanListenDecisionFrontDoorHtml", "latestHumanListenDecisionFrontDoorSmokeMarkdown", "latestReviewHandoffIndexMarkdown"]),
        ),
    ]

    output_json = baseline_dir / f"audio-goal-completion-audit-{slug}-{generated_at}.json"
    output_md = baseline_dir / f"audio-goal-completion-audit-{slug}-{generated_at}.md"

    parameter_sweep_proof_plan_checks = check_names(
        checks,
        [
            "latestAudioWorkbenchParameterSweepProofPlanMarkdown",
            "latestAudioWorkbenchParameterSweepProofPlanHtml",
            "latestAudioWorkbenchParameterSweepProofPlanOpenCommand",
            "latestAudioWorkbenchParameterSweepProofPlanSmokeMarkdown",
        ],
    )
    requirements.append(
        make_requirement(
            title="Parameter changes have conservative/standard/aggressive proof plans",
            status="proved" if all_present(parameter_sweep_proof_plan_checks) else "partial",
            evidence=[
                "The parameter sweep proof plan converts risky controls into proof-only conservative, standard, and aggressive variant recipes.",
                "The smoke proves all required sweep plans are generated without approving audio, unlocking branches, rendering media, or mutating originals.",
            ],
            next_action="After human listen feedback identifies a real symptom, render the matching proof-only sweep snippets before promoting any v007 candidate.",
            artifact_checks=parameter_sweep_proof_plan_checks,
        )
    )

    parameter_sweep_notes_inbox_checks = check_names(
        checks,
        [
            "latestAudioWorkbenchParameterSweepProofSnippetPackMarkdown",
            "latestAudioWorkbenchParameterSweepProofSnippetPackHtml",
            "latestAudioWorkbenchParameterSweepProofSnippetPackPlaylist",
            "latestAudioWorkbenchParameterSweepProofSnippetPackOpenCommand",
            "latestAudioWorkbenchParameterSweepProofSnippetPackSmokeMarkdown",
            "latestAudioWorkbenchParameterSweepNotesInboxMarkdown",
            "latestAudioWorkbenchParameterSweepNotesInboxSmokeMarkdown",
        ],
    )
    parameter_sweep_notes_inbox = load_output_report(outputs, "latestAudioWorkbenchParameterSweepNotesInbox")
    parameter_sweep_notes_smoke = load_output_report(outputs, "latestAudioWorkbenchParameterSweepNotesInboxSmoke")
    requirements.append(
        make_requirement(
            title="Parameter sweep reviewer notes route to scoped repair/proof actions",
            status="proved" if all_present(parameter_sweep_notes_inbox_checks) and bool(parameter_sweep_notes_smoke.get("passed")) else "partial",
            evidence=[
                "The parameter sweep proof notes inbox accepts exported proof-snippet notes and turns winners, repair notes, and proof requests into scoped next actions.",
                f"Matching human notes candidates: `{parameter_sweep_notes_inbox.get('matchingCandidateCount') or 0}`.",
                f"Repair/proof action counts: `{parameter_sweep_notes_inbox.get('repairActionCount') or 0}` / `{parameter_sweep_notes_inbox.get('focusedProofActionCount') or 0}`.",
                f"Inbox smoke passed: `{str(bool(parameter_sweep_notes_smoke.get('passed'))).lower()}`.",
                "The inbox does not approve v006, fail v006 by itself, render media, unlock branches, or mutate original media.",
            ],
            next_action="If a reviewer prefers a sweep variant, use the inbox output to render a real timestamped v007 proof candidate for that owning-stage repair.",
            artifact_checks=parameter_sweep_notes_inbox_checks,
        )
    )

    producer_grade_checks = check_names(
        checks,
        [
            "latestAudioProducerGradeAuditMarkdown",
            "latestAudioProducerGradeAuditHtml",
            "latestAudioProducerGradeAuditOpenCommand",
            "latestAudioProducerGradeNotesTemplate",
            "latestAudioProducerGradeNotesInboxMarkdown",
            "latestAudioProducerGradeNotesInboxSmokeMarkdown",
            "latestAudioProducerGradeAuditSmokeMarkdown",
            "latestAudioListenPriorityQueueMarkdown",
            "latestAudioMasterSmoothnessAuditMarkdown",
            "latestAudioMasterSourceBalanceAuditMarkdown",
            "latestAudioSpineListenSanityCheckMarkdown",
        ],
    )
    producer_grade_audit = load_output_report(outputs, "latestAudioProducerGradeAudit")
    producer_grade_notes_inbox = load_output_report(outputs, "latestAudioProducerGradeNotesInbox")
    producer_grade_notes_smoke = load_output_report(outputs, "latestAudioProducerGradeNotesInboxSmoke")
    producer_grade_smoke = load_output_report(outputs, "latestAudioProducerGradeAuditSmoke")
    post_review_action_queue = load_output_report(outputs, "latestAudioPostReviewActionQueue")
    requirements.append(
        make_requirement(
            title="Producer-grade machine audit focuses human listening",
            status="proved" if all_present(producer_grade_checks) and bool(producer_grade_smoke.get("passed")) and bool(producer_grade_notes_smoke.get("passed")) and int_value(producer_grade_audit.get("producerScore")) >= 70 else "partial",
            evidence=[
                f"Producer score: `{producer_grade_audit.get('producerScore') or 0}` / 100.",
                f"Risk level: `{producer_grade_audit.get('riskLevel') or 'not generated'}`.",
                f"Producer listen moments: `{len(producer_grade_audit.get('producerListenMoments') or [])}`.",
                f"Producer audit smoke passed: `{str(bool(producer_grade_smoke.get('passed'))).lower()}`.",
                f"Producer notes inbox matching candidates: `{producer_grade_notes_inbox.get('matchingCandidateCount') or 0}`.",
                f"Producer notes inbox smoke passed: `{str(bool(producer_grade_notes_smoke.get('passed'))).lower()}`.",
                "The audit consolidates smoothness, source-balance, speaker sanity, listen-priority, handoff, and notes-routing evidence without approving audio or unlocking branches.",
            ],
            next_action="Use the producer-grade HTML audit as the first machine-guided listen map, export producer notes, and route them through the producer notes inbox before any whole-spine pass/fail decision.",
            artifact_checks=producer_grade_checks,
        )
    )

    post_review_action_queue_checks = check_names(
        checks,
        [
            "latestAudioPostReviewActionQueueMarkdown",
            "latestAudioListenPriorityNotesInboxMarkdown",
            "latestSpeakerCleanupListenMapNotesInboxMarkdown",
            "latestAudioWorkbenchParameterSweepNotesInboxMarkdown",
            "latestMarkerReviewNotesInboxMarkdown",
            "latestAudioProducerGradeNotesInboxMarkdown",
            "latestAudioListenNotesRepairPlannerMarkdown",
            "latestAudioDefectAtlasNotesInboxMarkdown",
            "latestAudioDefectAtlasNotesInboxSmokeMarkdown",
            "latestAudioStudioSoundNotesInboxMarkdown",
            "latestAudioStudioSoundNotesInboxSmokeMarkdown",
        ],
    )
    requirements.append(
        make_requirement(
            title="Post-review action queue prevents stranded reviewer notes",
            status="proved" if all_present(post_review_action_queue_checks) and post_review_action_queue.get("schema") == "quipsly.audio-workbench.post-review-action-queue.v1" else "partial",
            evidence=[
                "The post-review action queue gathers listen-priority, speaker-cleanup, studio-sound, smoothness, parameter-sweep, marker-review, producer-grade, and repair-planner surfaces into one repair/proof/pass-context board.",
                f"Sources scanned: `{post_review_action_queue.get('sourceCount') or 0}`.",
                f"Sources with notes candidates: `{post_review_action_queue.get('sourceWithNotesCandidateCount') or 0}`.",
                f"Repair/proof/pass-context counts: `{post_review_action_queue.get('repairActionCount') or 0}` / `{post_review_action_queue.get('focusedProofActionCount') or 0}` / `{post_review_action_queue.get('passContextCount') or 0}`.",
                "The queue does not approve v006, fail v006 by itself, render media, unlock branches, or mutate original media.",
            ],
            next_action="After any reviewer exports notes, run the post-human-listen roundtrip and open the post-review action queue before choosing a repair or proof path.",
            artifact_checks=post_review_action_queue_checks,
        )
    )

    scoped_v007_repair_plan_checks = check_names(
        checks,
        [
            "latestAudioScopedV007RepairCandidatePlanMarkdown",
            "latestAudioScopedV007RepairCandidatePlanHtml",
            "latestAudioScopedV007RepairCandidatePlanOpenCommand",
            "latestAudioScopedV007RepairCandidatePlanSmokeMarkdown",
            "latestAudioScopedV007RepairCandidatePlanSmokeHtml",
            "latestAudioScopedV007RepairCandidatePlanSmokeOpenCommand",
            "latestAudioPostReviewActionQueueMarkdown",
        ],
    )
    requirements.append(
        make_requirement(
            title="Scoped v007 repair planning is ready when human notes fail or need proof",
            status="proved" if all_present(scoped_v007_repair_plan_checks) and scoped_v007_repair_plan.get("schema") == "quipsly.audio-workbench.scoped-v007-repair-candidate-planner.v1" and bool(scoped_v007_repair_plan_smoke.get("passed")) else "partial",
            evidence=[
                "The scoped v007 planner consumes the unified post-review action queue and turns repair/proof notes into stage-owned candidate plans.",
                f"Planner status: `{scoped_v007_repair_plan.get('status') or 'not generated'}`.",
                f"Repair/proof/planned counts: `{scoped_v007_repair_plan.get('repairActionCount') or 0}` / `{scoped_v007_repair_plan.get('focusedProofActionCount') or 0}` / `{scoped_v007_repair_plan.get('plannedItemCount') or 0}`.",
                f"Queue status: `{scoped_v007_repair_plan.get('queueStatus') or 'not generated'}`; sources with notes `{scoped_v007_repair_plan.get('sourceWithNotesCandidateCount') or 0}`.",
                f"Planner smoke passed: `{str(bool(scoped_v007_repair_plan_smoke.get('passed'))).lower()}` across `{scoped_v007_repair_plan_smoke.get('scenarioCount') or 0}` scenarios with `{scoped_v007_repair_plan_smoke.get('failureCount') or 0}` failures.",
                "The planner does not approve v006, fail v006 by itself, render media, unlock branches, upload, publish, or mutate original media.",
            ],
            next_action="If a human note requests proof or repair, open the scoped v007 plan and create proof-window candidates from the owning stage rather than rerunning the whole audio chain.",
            artifact_checks=scoped_v007_repair_plan_checks,
        )
    )

    parameter_control_ledger_checks = check_names(
        checks,
        [
            "latestAudioWorkbenchParameterControlLedgerMarkdown",
            "latestAudioWorkbenchParameterControlLedgerHtml",
            "latestAudioWorkbenchParameterControlLedgerOpenCommand",
            "latestAudioWorkbenchParameterControlLedgerSmokeMarkdown",
            "latestAudioWorkbenchParameterSweepProofPlanMarkdown",
            "latestAudioWorkbenchParameterSweepProofPlanHtml",
            "latestAudioWorkbenchParameterSweepProofPlanOpenCommand",
            "latestAudioWorkbenchParameterSweepProofPlanSmokeMarkdown",
        ],
    )
    requirements.append(
        make_requirement(
            title="Audio tuning knobs are explicit, bounded, and proof-gated",
            status="proved" if all_present(parameter_control_ledger_checks) else "partial",
            evidence=[
                "The parameter control ledger names stage-specific knobs, legal ranges, risk notes, symptoms, and proof requirements.",
                "The smoke proves the ledger can be generated without approving audio, unlocking branches, rendering media, or mutating originals.",
            ],
            next_action="Use the parameter ledger with the repair/tuning console when human listening identifies the next focused repair.",
            artifact_checks=parameter_control_ledger_checks,
        )
    )

    repair_tuning_console_checks = check_names(
        checks,
        [
            "latestAudioWorkbenchRepairTuningConsoleMarkdown",
            "latestAudioWorkbenchRepairTuningConsoleHtml",
            "latestAudioWorkbenchRepairTuningConsoleOpenCommand",
            "latestAudioWorkbenchRepairTuningConsoleSmokeMarkdown",
            "latestAudioWorkbenchParameterControlLedgerMarkdown",
            "latestAudioWorkbenchParameterControlLedgerHtml",
            "latestAudioWorkbenchParameterControlLedgerOpenCommand",
            "latestAudioWorkbenchParameterControlLedgerSmokeMarkdown",
            "latestAudioWorkbenchParameterSweepProofPlanMarkdown",
            "latestAudioWorkbenchParameterSweepProofPlanHtml",
            "latestAudioWorkbenchParameterSweepProofPlanOpenCommand",
            "latestAudioWorkbenchParameterSweepProofPlanSmokeMarkdown",
        ],
    )
    requirements.append(
        make_requirement(
            title="Repair/tuning decisions route to the owning audio stage",
            status="proved" if all_present(repair_tuning_console_checks) else "partial",
            evidence=[
                "The repair/tuning console maps common listen failures to source, sync, speaker cleanup, restoration, mix/master, human gate, or branch-render stages.",
                "The smoke proves the console can be generated without approving audio, unlocking branches, rendering media, or mutating originals.",
            ],
            next_action="Use the console after human listening identifies a symptom, then render only a scoped timestamped proof candidate for the owning stage.",
            artifact_checks=repair_tuning_console_checks,
        )
    )

    counts = status_counts(requirements)

    report = {
        "generatedAt": generated_at,
        "baselineDir": str(baseline_dir),
        "baselineId": baseline_id,
        "goalFile": str(goal_file),
        "goalFileSha256": goal_hash,
        "approvalStatus": approval_status,
        "packageReadyForHumanListen": package_ready,
        "branchInheritanceReady": branch_inheritance_ready,
        "branchRenderReady": branch_render_ready,
        "humanListenRequired": human_listen_required,
        "statusCounts": counts,
        "provedCount": counts.get("proved", 0),
        "partialCount": counts.get("partial", 0),
        "lockedCount": counts.get("locked", 0),
        "missingCount": counts.get("missing", 0),
        "requirements": requirements,
        "artifactChecks": [
            {"label": check.label, "key": check.key, "path": check.path, "exists": check.exists, "size": check.size}
            for check in checks
        ],
        "evidenceReportCount": len(reports),
        "sourceBalanceFocusFlagCounts": source_balance_focus_flags,
        "sourceBalanceFullAuditFlagCounts": source_balance_full_flags,
        "sourceBalanceQueueItemCount": source_balance_queue_item_count,
        "sourceBalanceFlagCoverage": source_balance_flag_coverage,
        "reviewReelComplete": review_reel_complete,
        "reviewReelNotesSmokePassed": review_reel_notes_smoke_passed,
        "postHumanListenNotesRoundtripSmokePassed": post_human_roundtrip_smoke_passed,
        "approvalStateChanged": False,
        "branchStateChanged": False,
        "renderAttempted": False,
        "originalMediaMutated": original_media_mutated,
        "nextSafestStep": "Open START_HERE_EPISODE_4_AUDIO_REVIEW.md, begin at the Producer Command Center, listen through the priority snippets/focus windows, export notes, and only then record pass/fail through the guarded decision flow.",
        "markdown": str(output_md),
    }

    write_json(output_json, report)
    output_md.write_text(render_markdown(report) + "\n", encoding="utf-8")

    previous_approval = manifest.get("approvalStatus")
    previous_branch_inheritance = bool(manifest.get("branchInheritanceReady"))
    previous_branch_render = bool(manifest.get("branchRenderReady"))

    outputs["latestAudioGoalCompletionAudit"] = str(output_json)
    outputs["latestAudioGoalCompletionAuditMarkdown"] = str(output_md)
    history = outputs.setdefault("audioGoalCompletionAudits", [])
    if str(output_json) not in history:
        history.append(str(output_json))
    manifest["audioGoalCompletionAuditCount"] = len(history)
    manifest["audioGoalCompletionAuditProvedCount"] = report["provedCount"]
    manifest["audioGoalCompletionAuditPartialCount"] = report["partialCount"]
    manifest["audioGoalCompletionAuditLockedCount"] = report["lockedCount"]
    manifest["audioGoalCompletionAuditMissingCount"] = report["missingCount"]
    manifest["latestAudioGoalCompletionAuditGeneratedAt"] = generated_at
    manifest["approvalStatus"] = previous_approval
    manifest["branchInheritanceReady"] = previous_branch_inheritance
    manifest["branchRenderReady"] = previous_branch_render
    write_json(manifest_path, manifest)

    print(str(output_json))
    print(str(output_md))
    print(json.dumps({"statusCounts": counts, "approvalStatus": previous_approval, "branchInheritanceReady": previous_branch_inheritance, "branchRenderReady": previous_branch_render}, indent=2))


if __name__ == "__main__":
    main()
