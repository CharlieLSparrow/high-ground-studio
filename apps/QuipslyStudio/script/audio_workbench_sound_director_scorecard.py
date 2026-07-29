#!/usr/bin/env python3
"""Build a Sound Director scorecard for a Quipsly audio baseline.

The Sound Director scorecard aggregates existing mastering, delivery, speaker,
smoothness, technical-audition, review-gate, and notes-queue evidence into one
plain-English readout. It is not an approval tool. It does not render episode
branches, upload, publish, approve audio, or mutate original media.
"""

from __future__ import annotations

import argparse
import html
import json
from dataclasses import dataclass, asdict
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


@dataclass(frozen=True)
class Category:
    id: str
    label: str
    score: float
    status: str
    evidence: list[str]
    risks: list[str]
    nextAction: str
    artifactKey: str | None = None
    artifactPath: str | None = None


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


def safe_slug(value: str) -> str:
    out = "".join(ch.lower() if ch.isalnum() else "-" for ch in str(value))
    while "--" in out:
        out = out.replace("--", "-")
    return out.strip("-") or "audio-baseline"


def shell_quote(value: str) -> str:
    return "'" + value.replace("'", "'\\''") + "'"


def utc_stamp() -> str:
    return datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S")


def iso_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def output_path(value: Any) -> str | None:
    if isinstance(value, str) and value:
        return value
    if isinstance(value, dict):
        for key in (
            "path",
            "json",
            "jsonPath",
            "markdown",
            "markdownPath",
            "html",
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
    p = Path(path)
    if not p.exists() or p.suffix.lower() != ".json":
        return {}, path
    try:
        return read_json(p), path
    except json.JSONDecodeError:
        return {}, path


def file_exists(path: str | None) -> bool:
    return bool(path) and Path(path).exists()


def int_value(value: Any) -> int:
    try:
        return int(value)
    except (TypeError, ValueError):
        return 0


def float_value(value: Any, default: float = 0.0) -> float:
    try:
        return float(value)
    except (TypeError, ValueError):
        return default


def bool_value(value: Any) -> bool:
    return bool(value)


def clamp_score(value: float) -> float:
    return max(0.0, min(100.0, round(value, 1)))


def category_path(outputs: dict[str, Any], *keys: str) -> tuple[str | None, str | None]:
    for key in keys:
        path = output_path(outputs.get(key))
        if path:
            return key, path
    return None, None


def category_from_conditions(
    *,
    id: str,
    label: str,
    score: float,
    status: str,
    evidence: list[str],
    risks: list[str],
    next_action: str,
    artifact_key: str | None = None,
    artifact_path: str | None = None,
) -> Category:
    return Category(
        id=id,
        label=label,
        score=clamp_score(score),
        status=status,
        evidence=evidence,
        risks=risks,
        nextAction=next_action,
        artifactKey=artifact_key,
        artifactPath=artifact_path,
    )


def build_report(manifest: dict[str, Any], baseline_dir: Path, generated_at: str) -> dict[str, Any]:
    outputs = manifest.get("outputs") if isinstance(manifest.get("outputs"), dict) else {}
    baseline_id = str(manifest.get("baselineId") or "audio-baseline")
    approval_status = str(manifest.get("approvalStatus") or "unknown")
    package_ready = bool(manifest.get("packageReadyForHumanListen"))
    branch_inheritance_ready = bool(manifest.get("branchInheritanceReady"))
    branch_render_ready = bool(manifest.get("branchRenderReady"))

    platform, platform_path = load_output_report(outputs, "latestAudioPlatformLoudnessAudit")
    broadcast, broadcast_path = load_output_report(outputs, "latestAudioBroadcastPolishScorecard")
    producer, producer_path = load_output_report(outputs, "latestAudioProducerGradeAudit")
    technical, technical_path = load_output_report(outputs, "latestAudioTechnicalAuditionAuditJson")
    technical_snippets, technical_snippets_path = load_output_report(outputs, "latestAudioTechnicalAuditionSnippetPackJson")
    smoothness, smoothness_path = load_output_report(outputs, "latestAudioMasterSmoothnessAudit")
    smoothness_pack, smoothness_pack_path = load_output_report(outputs, "latestAudioSmoothnessProofPack")
    source_balance, source_balance_path = load_output_report(outputs, "latestAudioMasterSourceBalanceAudit")
    source_balance_triage, source_balance_triage_path = load_output_report(outputs, "latestAudioSourceBalanceTriage")
    speaker_acceptance, speaker_acceptance_path = load_output_report(outputs, "latestSpeakerCleanupAcceptanceBoard")
    post_queue, post_queue_path = load_output_report(outputs, "latestAudioPostReviewActionQueue")
    control, control_path = load_output_report(outputs, "latestAudioControlPlaneSequentialRefresh")
    command_center, command_center_path = load_output_report(outputs, "latestAudioProducerCommandCenter")
    review_gate, review_gate_path = load_output_report(outputs, "latestAudioReviewGateAudit")
    manifest_smoke, manifest_smoke_path = load_output_report(outputs, "latestAudioManifestReadbackConsistencySmoke")
    goal_audit, goal_audit_path = load_output_report(outputs, "latestAudioGoalCompletionAudit")

    categories: list[Category] = []

    control_errors = int_value(manifest.get("audioControlPlaneSequentialRefreshStepFailureCount")) + int_value(manifest.get("audioControlPlaneSequentialRefreshPostCheckFailureCount"))
    review_gate_errors = int_value(manifest.get("audioReviewGateAuditLatestErrorCount"))
    manifest_smoke_failures = int_value(manifest.get("audioManifestReadbackConsistencySmokeFailureCount"))
    command_missing = int_value(manifest.get("audioProducerCommandCenterMissingPrimaryArtifactCount"))
    control_ok = (
        manifest.get("audioControlPlaneSequentialRefreshLatestStatus") == "passed"
        and control_errors == 0
        and bool_value(manifest.get("audioReviewGateAuditLatestPassed"))
        and review_gate_errors == 0
        and bool_value(manifest.get("audioManifestReadbackConsistencySmokePassed"))
        and manifest_smoke_failures == 0
        and manifest.get("audioProducerCommandCenterLatestStatus") == "ready-for-human-listen"
        and command_missing == 0
    )
    control_artifact_key, control_artifact_path = category_path(outputs, "latestAudioControlPlaneSequentialRefreshMarkdown")
    categories.append(
        category_from_conditions(
            id="control-plane",
            label="Control plane truth",
            score=100 if control_ok else 35,
            status="coherent" if control_ok else "needs-refresh-or-repair",
            evidence=[
                f"Sequential refresh: {manifest.get('audioControlPlaneSequentialRefreshLatestStatus')}",
                f"Review gate errors: {review_gate_errors}",
                f"Manifest smoke failures: {manifest_smoke_failures}",
                f"Command center missing artifacts: {command_missing}",
            ],
            risks=[] if control_ok else ["Do not trust readiness fields until the control plane passes."],
            next_action="Use the sequential refresh runner before any human decision, repair, branch, or render path." if not control_ok else "Control plane is coherent; proceed to listening evidence, not rendering.",
            artifact_key=control_artifact_key,
            artifact_path=control_artifact_path,
        )
    )

    hard_gate_attention = int_value(manifest.get("audioPlatformLoudnessHardGateAttentionCount"))
    podcast_ready = bool_value(manifest.get("audioPlatformLoudnessPodcastProfilesMachineReady"))
    platform_key, platform_artifact = category_path(outputs, "latestAudioPlatformLoudnessAuditHtml", "latestAudioPlatformLoudnessAuditMarkdown")
    categories.append(
        category_from_conditions(
            id="delivery-loudness",
            label="Delivery loudness",
            score=100 if hard_gate_attention == 0 and podcast_ready else 65,
            status="machine-ready" if hard_gate_attention == 0 and podcast_ready else "needs-platform-attention",
            evidence=[
                f"Hard-gate attention count: {hard_gate_attention}",
                f"Podcast profiles machine ready: {str(podcast_ready).lower()}",
                f"Platform audit: {platform_path or 'missing'}",
            ],
            risks=[] if hard_gate_attention == 0 else ["One or more platform loudness gates need attention before delivery."],
            next_action="Keep this as delivery evidence inside the human listen packet; it is not publication approval.",
            artifact_key=platform_key,
            artifact_path=platform_artifact,
        )
    )

    broadcast_score = float_value(manifest.get("audioBroadcastPolishOverallScore"), float_value(broadcast.get("overallScore"), 0))
    broadcast_status = str(manifest.get("audioBroadcastPolishOverallStatus") or broadcast.get("overallStatus") or "missing")
    broadcast_key, broadcast_artifact = category_path(outputs, "latestAudioBroadcastPolishScorecardHtml", "latestAudioBroadcastPolishScorecardMarkdown")
    categories.append(
        category_from_conditions(
            id="broadcast-polish",
            label="Broadcast polish",
            score=broadcast_score if broadcast_score else 0,
            status=broadcast_status,
            evidence=[
                f"Broadcast polish score: {broadcast_score or 'n/a'}",
                f"Broadcast status: {broadcast_status}",
            ],
            risks=["Scorecard still calls for focused proof or repair."] if "proof" in broadcast_status or "repair" in broadcast_status else [],
            next_action="Use the polish scorecard as the producer overview, then listen to the mission/fast-pass proof surfaces.",
            artifact_key=broadcast_key,
            artifact_path=broadcast_artifact,
        )
    )

    producer_score = float_value(manifest.get("audioProducerGradeAuditScore"), float_value(producer.get("producerScore"), 0))
    producer_status = str(producer.get("status") or "missing")
    producer_risk = str(producer.get("riskLevel") or "unknown")
    producer_key, producer_artifact = category_path(outputs, "latestAudioProducerGradeAuditHtml", "latestAudioProducerGradeAuditMarkdown")
    categories.append(
        category_from_conditions(
            id="producer-grade",
            label="Producer-grade editorial listen",
            score=producer_score if producer_score else 0,
            status=producer_status,
            evidence=[f"Producer score: {producer_score or 'n/a'}", f"Risk level: {producer_risk}"],
            risks=["Producer audit calls this high-review-risk; it deserves ears before approval."] if "high" in producer_risk else [],
            next_action="Use this to guide the subjective listen: pacing, fatigue, naturalness, and show-quality feel.",
            artifact_key=producer_key,
            artifact_path=producer_artifact,
        )
    )

    speaker_checks = int_value(speaker_acceptance.get("machineCheckCount"))
    speaker_passed = int_value(speaker_acceptance.get("machineCheckPassedCount"))
    speaker_missing = int_value(speaker_acceptance.get("missingArtifactCount")) + int_value(speaker_acceptance.get("missingSnippetCount"))
    speaker_must_listen = int_value(speaker_acceptance.get("mustListenCount"))
    source_warnings = int_value(manifest.get("audioMasterSourceBalanceLatestWarningCount")) or int_value(source_balance.get("machineWarningCount"))
    source_triage_windows = int_value(source_balance_triage.get("triageWindowCount"))
    source_triage_missing = int_value(source_balance_triage.get("missingEvidenceCount"))
    source_speakers_survive = bool_value(source_balance_triage.get("allSpeakersSurviveInMaster"))
    speaker_score = 100 if speaker_checks and speaker_checks == speaker_passed and speaker_missing == 0 else 55
    if source_warnings:
        speaker_score -= min(12, source_warnings / 120)
    if source_speakers_survive and source_triage_windows and source_triage_missing == 0:
        speaker_score = min(100, speaker_score + 4)
    speaker_key, speaker_artifact = category_path(outputs, "latestSpeakerCleanupAcceptanceBoardHtml", "latestSpeakerCleanupAcceptanceBoardMarkdown")
    categories.append(
        category_from_conditions(
            id="speaker-cleanup",
            label="Speaker cleanup and source balance",
            score=speaker_score,
            status=speaker_acceptance.get("status") or "missing",
            evidence=[
                f"Speaker cleanup checks: {speaker_passed}/{speaker_checks}",
                f"Missing cleanup evidence: {speaker_missing}",
                f"Must-listen cleanup windows: {speaker_must_listen}",
                f"Source-balance warning windows: {source_warnings}",
                f"Source-balance triage windows: {source_triage_windows}",
                f"All speakers survive in master: {str(source_speakers_survive).lower()}",
            ],
            risks=["Source-balance triage still requires ears; speaker survival is machine-proved, but threshold/room/overlap checks are not approval."] if source_warnings else [],
            next_action=source_balance_triage.get("nextSafeAction") or "Listen to the speaker cleanup board and A/B proof before approving natural conversation flow.",
            artifact_key="latestAudioSourceBalanceTriageHtml" if source_balance_triage_path else speaker_key,
            artifact_path=source_balance_triage_path or speaker_artifact,
        )
    )

    smoothness_passed = bool_value(smoothness.get("passed"))
    smoothness_snippets = int_value(manifest.get("audioSmoothnessProofPackLatestSnippetCount")) or int_value(smoothness_pack.get("snippetCount"))
    smoothness_failures = int_value(manifest.get("audioSmoothnessProofPackLatestFailureCount")) or int_value(smoothness_pack.get("renderFailureCount"))
    smoothness_key, smoothness_artifact = category_path(outputs, "latestAudioSmoothnessProofPackHtml", "latestAudioSmoothnessProofPackMarkdown")
    categories.append(
        category_from_conditions(
            id="smoothness-cadence",
            label="Smoothness and cadence",
            score=94 if smoothness_passed and smoothness_snippets and smoothness_failures == 0 else 62,
            status="proof-ready" if smoothness_passed and smoothness_snippets and smoothness_failures == 0 else "needs-smoothness-proof",
            evidence=[
                f"Master smoothness audit passed: {str(smoothness_passed).lower()}",
                f"Smoothness snippets: {smoothness_snippets}",
                f"Smoothness render failures: {smoothness_failures}",
                f"Transition count: {smoothness.get('transitionCount') or 'n/a'}",
            ],
            risks=["Machine smoothness cannot prove human cadence; listen for robotic pauses, gate snap, and jump-cut harshness."],
            next_action="Use smoothness proof clips for cadence checks before approving or planning scoped v007 repair.",
            artifact_key=smoothness_key,
            artifact_path=smoothness_artifact,
        )
    )

    tech_status = str(technical.get("status") or "missing")
    tech_moments = int_value(technical.get("listenMomentCount"))
    tech_missing = int_value(technical.get("missingEvidenceCount"))
    tech_snippets = int_value(manifest.get("outputs", {}).get("audioTechnicalAuditionSnippetPackLatestSnippetCount")) if isinstance(manifest.get("outputs"), dict) else 0
    tech_snippets = tech_snippets or int_value(technical_snippets.get("snippetCount"))
    tech_failures = int_value(manifest.get("outputs", {}).get("audioTechnicalAuditionSnippetPackRenderFailureCount")) if isinstance(manifest.get("outputs"), dict) else 0
    tech_failures = tech_failures or int_value(technical_snippets.get("renderFailureCount"))
    tech_key, tech_artifact = category_path(outputs, "latestAudioTechnicalAuditionAuditHtml", "latestAudioTechnicalAuditionAuditMarkdown")
    categories.append(
        category_from_conditions(
            id="technical-audition",
            label="Technical audition",
            score=96 if tech_status == "ready-for-human-technical-audition" and tech_missing == 0 and tech_failures == 0 else 60,
            status=tech_status,
            evidence=[
                f"Listen moments: {tech_moments}",
                f"Missing evidence: {tech_missing}",
                f"Snippet count: {tech_snippets}",
                f"Snippet render failures: {tech_failures}",
            ],
            risks=[] if tech_missing == 0 and tech_failures == 0 else ["Technical audition evidence is incomplete."],
            next_action="Use technical audition snippets for channel, floor, fatigue, and artifact checks.",
            artifact_key=tech_key,
            artifact_path=tech_artifact,
        )
    )

    queue_status = str(post_queue.get("status") or "missing")
    repair_actions = int_value(post_queue.get("repairActionCount"))
    proof_actions = int_value(post_queue.get("focusedProofActionCount"))
    pass_context = int_value(post_queue.get("passContextCount"))
    source_notes = int_value(post_queue.get("sourceWithNotesCandidateCount"))
    queue_key, queue_artifact = category_path(outputs, "latestAudioPostReviewActionQueueMarkdown")
    categories.append(
        category_from_conditions(
            id="review-notes-routing",
            label="Review notes and repair routing",
            score=96 if queue_status == "ready-for-review-actions" and repair_actions == 0 and proof_actions == 0 else 72,
            status=queue_status,
            evidence=[
                f"Notes sources: {source_notes}",
                f"Repair actions: {repair_actions}",
                f"Focused-proof actions: {proof_actions}",
                f"Pass-context notes: {pass_context}",
            ],
            risks=["Existing reviewer-note candidates are context only; new human notes still need import before decisions."] if source_notes else [],
            next_action="After any exported notes, refresh the post-review action queue before approving, repairing, or rendering.",
            artifact_key=queue_key,
            artifact_path=queue_artifact,
        )
    )

    missing_evidence = [
        {"key": key, "path": path}
        for key, path in [
            ("latestAudioPlatformLoudnessAudit", platform_path),
            ("latestAudioBroadcastPolishScorecard", broadcast_path),
            ("latestAudioProducerGradeAudit", producer_path),
            ("latestAudioTechnicalAuditionAuditJson", technical_path),
            ("latestAudioSmoothnessProofPack", smoothness_pack_path),
            ("latestSpeakerCleanupAcceptanceBoard", speaker_acceptance_path),
            ("latestAudioPostReviewActionQueue", post_queue_path),
            ("latestAudioControlPlaneSequentialRefresh", control_path),
        ]
        if not file_exists(path)
    ]

    hard_stops: list[str] = []
    if not package_ready:
        hard_stops.append("packageReadyForHumanListen is false")
    if approval_status != "machine-candidate-needs-human-listen-proof" and not approval_status.startswith("human-"):
        hard_stops.append(f"unexpected approval status: {approval_status}")
    if branch_inheritance_ready and not approval_status.startswith("human-approved"):
        hard_stops.append("branch inheritance is unlocked before human approval")
    if branch_render_ready and not branch_inheritance_ready:
        hard_stops.append("branch render is unlocked before branch inheritance")
    if not control_ok:
        hard_stops.append("control plane is not coherent")
    if missing_evidence:
        hard_stops.append(f"missing {len(missing_evidence)} required evidence artifacts")

    review_risks: list[str] = []
    for category in categories:
        review_risks.extend(category.risks)
    if repair_actions:
        review_risks.append("Post-review queue has repair actions waiting.")
    if proof_actions:
        review_risks.append("Post-review queue has focused-proof actions waiting.")
    if approval_status == "machine-candidate-needs-human-listen-proof":
        review_risks.append("Full human listen proof is still required before branch inheritance.")

    weighted_total = sum(category.score for category in categories)
    machine_confidence_score = clamp_score(weighted_total / max(1, len(categories)))
    if hard_stops:
        status = "needs-control-plane-repair"
        next_safe_action = "Fix the hard-stop items, then rerun the sequential control-plane refresh. Do not approve, render, upload, or publish."
    elif repair_actions or proof_actions:
        status = "review-actions-ready"
        next_safe_action = "Use the post-review action queue to choose the smallest scoped v007 repair or focused proof path before approval."
    elif approval_status == "machine-candidate-needs-human-listen-proof":
        status = "machine-sound-director-ready-human-listen-required"
        next_safe_action = "Open the Producer Command Center or Human Listen Mission Board, listen, export/import notes, then record a guarded human decision."
    else:
        status = "human-decision-recorded-refresh-branch-gates"
        next_safe_action = "Regenerate branch inheritance and branch-render gates before rendering production episode branches."

    listen_priority = [
        {
            "label": "Producer Command Center",
            "reason": "Start here for the current source of truth and safe actions.",
            "path": output_path(outputs.get("latestAudioProducerCommandCenterHtml")) or output_path(outputs.get("latestAudioProducerCommandCenterMarkdown")),
        },
        {
            "label": "Human Listen Mission Board",
            "reason": "Shortest focused human listen route before full decision.",
            "path": output_path(outputs.get("latestAudioHumanListenMissionBoardHtml")),
        },
        {
            "label": "Sound Director Scorecard",
            "reason": "This aggregate scorecard and category map.",
            "path": str(baseline_dir / "AUDIO_SOUND_DIRECTOR_SCORECARD.html"),
        },
        {
            "label": "Speaker Cleanup Acceptance Board",
            "reason": "Verify cleanup evidence is complete and listen to the 15 critical windows.",
            "path": output_path(outputs.get("latestSpeakerCleanupAcceptanceBoardHtml")),
        },
        {
            "label": "Technical Audition Snippet Pack",
            "reason": "Listen to highest-priority technical snippets before approval.",
            "path": output_path(outputs.get("latestAudioTechnicalAuditionSnippetPackHtml")),
        },
        {
            "label": "Smoothness Proof Pack",
            "reason": "Check cadence, gating, pauses, and transition feel.",
            "path": output_path(outputs.get("latestAudioSmoothnessProofPackHtml")),
        },
    ]

    return {
        "schema": "quipsly.audio-workbench.sound-director-scorecard.v1",
        "generatedAt": generated_at,
        "generatedIso": iso_now(),
        "baselineDir": str(baseline_dir),
        "baselineId": baseline_id,
        "approvalStatus": approval_status,
        "packageReadyForHumanListen": package_ready,
        "branchInheritanceReady": branch_inheritance_ready,
        "branchRenderReady": branch_render_ready,
        "status": status,
        "machineConfidenceScore": machine_confidence_score,
        "categoryCount": len(categories),
        "hardStopCount": len(hard_stops),
        "reviewRiskCount": len(review_risks),
        "missingEvidenceCount": len(missing_evidence),
        "repairActionCount": repair_actions,
        "focusedProofActionCount": proof_actions,
        "humanListenRequired": approval_status == "machine-candidate-needs-human-listen-proof",
        "nextSafeAction": next_safe_action,
        "hardStops": hard_stops,
        "reviewRisks": review_risks,
        "missingEvidence": missing_evidence,
        "categories": [asdict(category) for category in categories],
        "listenPriority": listen_priority,
        "sourceReports": {
            "platformLoudness": platform_path,
            "broadcastPolish": broadcast_path,
            "producerGrade": producer_path,
            "technicalAudition": technical_path,
            "technicalAuditionSnippets": technical_snippets_path,
            "smoothnessAudit": smoothness_path,
            "smoothnessProofPack": smoothness_pack_path,
            "sourceBalanceAudit": source_balance_path,
            "speakerCleanupAcceptance": speaker_acceptance_path,
            "postReviewActionQueue": post_queue_path,
            "controlPlaneSequentialRefresh": control_path,
            "producerCommandCenter": command_center_path,
            "reviewGate": review_gate_path,
            "manifestReadbackSmoke": manifest_smoke_path,
            "goalAudit": goal_audit_path,
        },
        "approvalStateChanged": False,
        "branchStateChanged": False,
        "renderAttempted": False,
        "uploadAttempted": False,
        "publicationAttempted": False,
        "originalMediaMutated": False,
    }


def render_markdown(report: dict[str, Any]) -> str:
    lines = [
        f"# Sound Director Scorecard: {report['baselineId']}",
        "",
        f"Generated: `{report['generatedAt']}`",
        "",
        "This is a machine-confidence and review-routing scorecard. It is not audio approval.",
        "",
        "## Summary",
        "",
        f"- Status: `{report['status']}`",
        f"- Machine confidence score: `{report['machineConfidenceScore']}`",
        f"- Hard stops: `{report['hardStopCount']}`",
        f"- Review risks: `{report['reviewRiskCount']}`",
        f"- Missing evidence: `{report['missingEvidenceCount']}`",
        f"- Repair actions: `{report['repairActionCount']}`",
        f"- Focused-proof actions: `{report['focusedProofActionCount']}`",
        f"- Human listen required: `{str(report['humanListenRequired']).lower()}`",
        f"- Approval status: `{report['approvalStatus']}`",
        f"- Branch inheritance ready: `{str(report['branchInheritanceReady']).lower()}`",
        f"- Branch render ready: `{str(report['branchRenderReady']).lower()}`",
        "",
        "## Next safe action",
        "",
        report["nextSafeAction"],
        "",
        "## Categories",
        "",
        "| Category | Score | Status | Evidence | Risks | Next action |",
        "|---|---:|---|---|---|---|",
    ]
    for category in report["categories"]:
        evidence = "<br>".join(category.get("evidence") or [])
        risks = "<br>".join(category.get("risks") or []) or "None"
        artifact = category.get("artifactPath")
        label = category["label"]
        if artifact:
            label = f"[{label}]({artifact})"
        lines.append(
            f"| {label} | `{category['score']}` | `{category['status']}` | {evidence} | {risks} | {category['nextAction']} |"
        )
    if report["hardStops"]:
        lines.extend(["", "## Hard stops", ""])
        for item in report["hardStops"]:
            lines.append(f"- {item}")
    if report["reviewRisks"]:
        lines.extend(["", "## Review risks", ""])
        for item in report["reviewRisks"]:
            lines.append(f"- {item}")
    lines.extend(["", "## Listen priority", ""])
    for item in report["listenPriority"]:
        path = item.get("path")
        label = item.get("label")
        if path:
            lines.append(f"- [{label}]({path}) - {item.get('reason')}")
        else:
            lines.append(f"- {label} - missing path - {item.get('reason')}")
    lines.extend(
        [
            "",
            "## Guardrails",
            "",
            "- This scorecard does not approve the master.",
            "- It does not unlock branch inheritance or branch rendering.",
            "- It does not render, upload, publish, or mutate original media.",
            "- Use it to decide what to listen to next and where any scoped v007 repair should start.",
            "",
        ]
    )
    return "\n".join(lines)


def render_html(report: dict[str, Any]) -> str:
    status_class = "ok" if not report["hardStops"] else "bad"
    category_cards = []
    for category in report["categories"]:
        risks = category.get("risks") or []
        evidence_items = "".join(f"<li>{html.escape(item)}</li>" for item in category.get("evidence") or [])
        risk_items = "".join(f"<li>{html.escape(item)}</li>" for item in risks) or "<li>None</li>"
        link = category.get("artifactPath")
        title = html.escape(category["label"])
        if link:
            title = f"<a href=\"file://{html.escape(link)}\">{title}</a>"
        category_cards.append(
            f"""
            <article class=\"card\">
              <h3>{title}</h3>
              <div class=\"score\">{category['score']}</div>
              <p><strong>Status:</strong> <code>{html.escape(category['status'])}</code></p>
              <h4>Evidence</h4><ul>{evidence_items}</ul>
              <h4>Risks</h4><ul>{risk_items}</ul>
              <p><strong>Next:</strong> {html.escape(category['nextAction'])}</p>
            </article>
            """
        )
    priority_links = []
    for item in report["listenPriority"]:
        path = item.get("path")
        label = html.escape(str(item.get("label") or "Untitled"))
        reason = html.escape(str(item.get("reason") or ""))
        if path:
            priority_links.append(f"<li><a href=\"file://{html.escape(path)}\">{label}</a><br><small>{reason}</small></li>")
        else:
            priority_links.append(f"<li>{label}<br><small>Missing path. {reason}</small></li>")
    return f"""<!doctype html>
<html>
<head>
<meta charset=\"utf-8\" />
<title>Sound Director Scorecard</title>
<style>
:root {{ --bg:#15170f; --panel:#232719; --panel2:#2d3221; --ink:#f6ecd0; --muted:#c5b890; --gold:#f3c74e; --moss:#86c979; --bad:#ff8068; --line:#504326; }}
body {{ margin: 0; padding: 32px; background: radial-gradient(circle at top left, #30351e, var(--bg) 46%); color: var(--ink); font-family: -apple-system, BlinkMacSystemFont, sans-serif; }}
a {{ color: var(--gold); }}
.hero {{ border: 1px solid var(--line); background: rgba(35,39,25,.94); border-radius: 24px; padding: 24px; margin-bottom: 20px; }}
.pills {{ display:flex; flex-wrap:wrap; gap:10px; margin-top: 16px; }}
.pill {{ background: var(--panel2); border:1px solid var(--line); border-radius:999px; padding:8px 12px; }}
.ok {{ color: var(--moss); font-weight: 900; }} .bad {{ color: var(--bad); font-weight:900; }}
.grid {{ display:grid; grid-template-columns: repeat(auto-fit, minmax(320px, 1fr)); gap: 14px; }}
.card {{ border:1px solid var(--line); background: rgba(35,39,25,.88); border-radius:20px; padding:18px; }}
.score {{ float:right; font-size: 36px; color: var(--gold); font-weight: 900; }}
small, .muted {{ color: var(--muted); }}
code {{ color: var(--gold); }}
li {{ margin: 6px 0; }}
</style>
</head>
<body>
<section class=\"hero\">
  <p class=\"muted\">QUIPSLY AUDIO WORKBENCH</p>
  <h1>Sound Director Scorecard</h1>
  <p>Status: <span class=\"{status_class}\">{html.escape(report['status'])}</span></p>
  <p>Machine confidence score: <strong>{report['machineConfidenceScore']}</strong>. This is not approval; it tells us how armed the human listen is.</p>
  <p><strong>Next safe action:</strong> {html.escape(report['nextSafeAction'])}</p>
  <div class=\"pills\">
    <div class=\"pill\">Hard stops: {report['hardStopCount']}</div>
    <div class=\"pill\">Review risks: {report['reviewRiskCount']}</div>
    <div class=\"pill\">Repair actions: {report['repairActionCount']}</div>
    <div class=\"pill\">Focused proof: {report['focusedProofActionCount']}</div>
    <div class=\"pill\">Human listen required: {str(report['humanListenRequired']).lower()}</div>
  </div>
</section>
<section class=\"hero\">
  <h2>Listen priority</h2>
  <ol>{''.join(priority_links)}</ol>
</section>
<section class=\"grid\">{''.join(category_cards)}</section>
</body>
</html>
"""


def write_open_command(path: Path, target: Path) -> None:
    path.write_text(f"#!/bin/zsh\nopen {shell_quote(str(target))}\n", encoding="utf-8")
    path.chmod(0o755)


def update_manifest(baseline_dir: Path, report: dict[str, Any], stable_json: Path, stable_md: Path, stable_html: Path, stable_open: Path, versioned_json: Path, versioned_md: Path, versioned_html: Path, versioned_open: Path) -> None:
    manifest_path = baseline_dir / "manifest.json"
    manifest = read_json(manifest_path)
    outputs = manifest.setdefault("outputs", {})
    outputs["latestAudioSoundDirectorScorecard"] = str(stable_json)
    outputs["latestAudioSoundDirectorScorecardMarkdown"] = str(stable_md)
    outputs["latestAudioSoundDirectorScorecardHtml"] = str(stable_html)
    outputs["latestAudioSoundDirectorScorecardOpenCommand"] = str(stable_open)
    outputs["latestAudioSoundDirectorScorecardVersioned"] = str(versioned_json)
    outputs["latestAudioSoundDirectorScorecardVersionedMarkdown"] = str(versioned_md)
    outputs["latestAudioSoundDirectorScorecardVersionedHtml"] = str(versioned_html)
    outputs["latestAudioSoundDirectorScorecardVersionedOpenCommand"] = str(versioned_open)
    history = outputs.setdefault("audioSoundDirectorScorecards", [])
    if isinstance(history, list):
        history.append(str(versioned_json))
    manifest["audioSoundDirectorScorecardLatestStatus"] = report["status"]
    manifest["audioSoundDirectorScorecardLatestGeneratedAt"] = report["generatedAt"]
    manifest["audioSoundDirectorScorecardMachineConfidenceScore"] = report["machineConfidenceScore"]
    manifest["audioSoundDirectorScorecardCategoryCount"] = report["categoryCount"]
    manifest["audioSoundDirectorScorecardHardStopCount"] = report["hardStopCount"]
    manifest["audioSoundDirectorScorecardReviewRiskCount"] = report["reviewRiskCount"]
    manifest["audioSoundDirectorScorecardMissingEvidenceCount"] = report["missingEvidenceCount"]
    manifest["audioSoundDirectorScorecardRepairActionCount"] = report["repairActionCount"]
    manifest["audioSoundDirectorScorecardFocusedProofActionCount"] = report["focusedProofActionCount"]
    manifest["audioSoundDirectorScorecardHumanListenRequired"] = report["humanListenRequired"]
    manifest["audioSoundDirectorScorecardNextSafeAction"] = report["nextSafeAction"]
    manifest["audioSoundDirectorScorecardApprovalStateChanged"] = False
    manifest["audioSoundDirectorScorecardBranchStateChanged"] = False
    manifest["audioSoundDirectorScorecardRenderAttempted"] = False
    manifest["audioSoundDirectorScorecardUploadAttempted"] = False
    manifest["audioSoundDirectorScorecardPublicationAttempted"] = False
    manifest["audioSoundDirectorScorecardOriginalMediaMutated"] = False
    write_json(manifest_path, manifest)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--baseline-dir", required=True, type=Path)
    args = parser.parse_args()

    baseline_dir = resolve_baseline_dir(args.baseline_dir)
    manifest = read_json(baseline_dir / "manifest.json")
    baseline_id = str(manifest.get("baselineId") or "audio-baseline")
    slug = safe_slug(baseline_id.replace("episode-4-conformed-production-baseline-", ""))
    generated = utc_stamp()
    report = build_report(manifest, baseline_dir, generated)

    versioned_dir = baseline_dir / f"audio-sound-director-scorecard-{slug}-{generated}"
    versioned_dir.mkdir(parents=True, exist_ok=True)
    versioned_json = versioned_dir / "sound-director-scorecard.json"
    versioned_md = versioned_dir / "sound-director-scorecard.md"
    versioned_html = versioned_dir / "sound-director-scorecard.html"
    versioned_open = versioned_dir / "open-sound-director-scorecard.command"

    stable_json = baseline_dir / "AUDIO_SOUND_DIRECTOR_SCORECARD.json"
    stable_md = baseline_dir / "AUDIO_SOUND_DIRECTOR_SCORECARD.md"
    stable_html = baseline_dir / "AUDIO_SOUND_DIRECTOR_SCORECARD.html"
    stable_open = baseline_dir / "OPEN_AUDIO_SOUND_DIRECTOR_SCORECARD.command"

    report.update(
        {
            "path": str(stable_json),
            "markdownPath": str(stable_md),
            "htmlPath": str(stable_html),
            "openCommand": str(stable_open),
            "versionedPath": str(versioned_json),
            "versionedMarkdownPath": str(versioned_md),
            "versionedHtmlPath": str(versioned_html),
            "versionedOpenCommand": str(versioned_open),
        }
    )
    markdown = render_markdown(report)
    html_doc = render_html(report)
    for path in (stable_json, versioned_json):
        write_json(path, report)
    for path in (stable_md, versioned_md):
        path.write_text(markdown, encoding="utf-8")
    for path in (stable_html, versioned_html):
        path.write_text(html_doc, encoding="utf-8")
    write_open_command(stable_open, stable_html)
    write_open_command(versioned_open, versioned_html)
    update_manifest(baseline_dir, report, stable_json, stable_md, stable_html, stable_open, versioned_json, versioned_md, versioned_html, versioned_open)
    print(str(stable_md))


if __name__ == "__main__":
    main()
