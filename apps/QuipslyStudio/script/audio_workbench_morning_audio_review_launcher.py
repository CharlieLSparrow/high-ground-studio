#!/usr/bin/env python3
"""Create the simplest morning launcher for Episode 4 audio review.

This artifact is intentionally tiny and practical: open one calm instruction
surface plus the listening M4A. Deeper evidence stays linked behind that first
surface instead of spraying a cockpit of windows at a tired human. It does not
approve audio, unlock branches, render, upload, publish, or mutate source
media.
"""

from __future__ import annotations

import argparse
import json
import os
import shlex
from datetime import datetime, timezone
from html import escape
from pathlib import Path
from typing import Any


def read_json(path: Path) -> dict[str, Any]:
    return json.loads(path.read_text(encoding="utf-8"))


def write_json(path: Path, payload: dict[str, Any]) -> None:
    path.write_text(json.dumps(payload, indent=2, sort_keys=True) + "\n", encoding="utf-8")


def shell_quote(value: str) -> str:
    return shlex.quote(value)


def output_path(value: Any) -> str | None:
    if not value:
        return None
    if isinstance(value, dict):
        for key in ("path", "jsonPath", "markdownPath", "htmlPath", "openCommand"):
            candidate = value.get(key)
            if candidate and Path(str(candidate)).exists():
                return str(candidate)
        return None
    path = Path(str(value))
    return str(path) if path.exists() else None


def file_summary(path: str | None) -> dict[str, Any]:
    if not path:
        return {"path": None, "exists": False, "sizeBytes": 0, "sizeMb": 0}
    p = Path(path)
    exists = p.exists()
    return {
        "path": path,
        "exists": exists,
        "sizeBytes": p.stat().st_size if exists else 0,
        "sizeMb": round(p.stat().st_size / (1024 * 1024), 2) if exists else 0,
    }


def load_json_if_exists(path: str | None) -> dict[str, Any]:
    if not path:
        return {}
    json_path = Path(path)
    if not json_path.exists() or json_path.suffix.lower() != ".json":
        return {}
    try:
        return read_json(json_path)
    except json.JSONDecodeError:
        return {}


def critical_fast_checks(outputs: dict[str, Any], limit: int = 4) -> list[dict[str, Any]]:
    queue_report = load_json_if_exists(output_path(outputs.get("latestAudioListenPriorityQueue")))
    rows = queue_report.get("queue") if isinstance(queue_report.get("queue"), list) else []
    checks: list[dict[str, Any]] = []
    for row in rows:
        classifications = row.get("classifications") if isinstance(row.get("classifications"), list) else []
        if "critical-listen" not in classifications:
            continue
        questions = row.get("listenQuestions") if isinstance(row.get("listenQuestions"), list) else []
        actions = row.get("safeActionsIfFails") if isinstance(row.get("safeActionsIfFails"), list) else []
        checks.append(
            {
                "priority": row.get("priority"),
                "time": row.get("time"),
                "timeSec": row.get("timeSec"),
                "title": row.get("title"),
                "listenQuestion": questions[0] if questions else "Does this moment sound natural and publishable?",
                "safeActionIfFails": actions[0] if actions else "If it fails, keep v006 locked and route this exact window into scoped v007 repair/proof work.",
            }
        )
        if len(checks) >= limit:
            break
    return checks


def build_report(baseline_dir: Path) -> dict[str, Any]:
    manifest = read_json(baseline_dir / "manifest.json")
    outputs = manifest.get("outputs") if isinstance(manifest.get("outputs"), dict) else {}
    generated_at = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    morning_packet = output_path(outputs.get("latestAudioMorningPublicationReadinessPacketHtml"))
    morning_command = output_path(outputs.get("latestAudioMorningPublicationReadinessPacketOpenCommand"))
    final_mission = output_path(outputs.get("latestAudioFinalListenMissionPacketHtml"))
    final_mission_command = output_path(outputs.get("latestAudioFinalListenMissionPacketOpenCommand"))
    fast_readback = output_path(outputs.get("latestAudioFastReadbackCheckHtml"))
    fast_readback_report = load_json_if_exists(output_path(outputs.get("latestAudioFastReadbackCheck")))
    post_approval_rehearsal = output_path(outputs.get("latestAudioPostApprovalRenderRehearsalHtml"))
    post_approval_rehearsal_report = load_json_if_exists(output_path(outputs.get("latestAudioPostApprovalRenderRehearsal")))
    post_approval_runway = output_path(outputs.get("latestAudioPostApprovalBranchRunwayPacketHtml"))
    decision_front_door = output_path(outputs.get("latestHumanListenDecisionFrontDoorHtml"))
    decision_command = output_path(outputs.get("latestHumanListenDecisionFrontDoorOpenCommand"))
    command_center = output_path(outputs.get("latestAudioProducerCommandCenterHtml"))
    technical_audition = output_path(outputs.get("latestAudioTechnicalAuditionSnippetPackHtml"))
    spectral_fatigue = output_path(outputs.get("latestAudioSpectralFatigueAuditHtml"))
    spectral_fatigue_report = load_json_if_exists(output_path(outputs.get("latestAudioSpectralFatigueAudit")))
    translation_survival = output_path(outputs.get("latestAudioTranslationSurvivalAuditHtml"))
    translation_survival_report = load_json_if_exists(output_path(outputs.get("latestAudioTranslationSurvivalAudit")))
    asr_review_focus = output_path(outputs.get("latestAudioAsrReviewFocusPacketHtml"))
    asr_review_focus_report = load_json_if_exists(output_path(outputs.get("latestAudioAsrReviewFocusPacket")))
    source_aware_timing_contract = output_path(outputs.get("latestAudioSourceAwareTimingContractHtml"))
    source_aware_timing_contract_report = load_json_if_exists(output_path(outputs.get("latestAudioSourceAwareTimingContract")))
    runway_state = load_json_if_exists(output_path(outputs.get("latestAudioRunwayState")))
    runway_state_html = output_path(outputs.get("latestAudioRunwayStateHtml"))
    runway_state_open = output_path(outputs.get("latestAudioRunwayStateOpenCommand"))
    active_decision = runway_state.get("activeDecision") if isinstance(runway_state.get("activeDecision"), dict) else {}
    render_runway = runway_state.get("renderRunway") if isinstance(runway_state.get("renderRunway"), dict) else {}
    listen_file = manifest.get("audioMorningPublicationReadinessRecommendedListeningFile")
    audio_file = manifest.get("audioMorningPublicationReadinessRecommendedAudioFile")
    if not listen_file:
        listen_file = output_path(outputs.get("masterM4a")) or str(baseline_dir / "episode4-mastered-audio-spine-v006.m4a")
    if not audio_file:
        audio_file = output_path(outputs.get("masterWav")) or str(baseline_dir / "episode4-mastered-audio-spine-v006.wav")
    listen_summary = file_summary(str(listen_file) if listen_file else None)
    audio_summary = file_summary(str(audio_file) if audio_file else None)
    fast_checks = critical_fast_checks(outputs)
    hard_stops = []
    if not listen_summary["exists"]:
        hard_stops.append("Listening M4A is missing.")
    if not audio_summary["exists"]:
        hard_stops.append("Premiere handoff WAV is missing.")
    if not morning_packet:
        hard_stops.append("Morning publication-readiness packet is missing.")
    if not final_mission:
        hard_stops.append("Final listen mission packet is missing.")
    if not fast_readback:
        hard_stops.append("Fast readback check is missing.")
    if not post_approval_rehearsal:
        hard_stops.append("Post-approval render rehearsal is missing.")
    if not decision_front_door:
        hard_stops.append("Human listen decision front door is missing.")
    if not technical_audition:
        hard_stops.append("Technical audition snippet pack is missing.")
    if not spectral_fatigue:
        hard_stops.append("Spectral fatigue audit is missing.")
    if not translation_survival:
        hard_stops.append("Translation survival audit is missing.")
    if not asr_review_focus:
        hard_stops.append("ASR review focus packet is missing.")
    if not source_aware_timing_contract:
        hard_stops.append("Source-aware timing contract is missing.")
    status = "ready-for-morning-audio-review" if not hard_stops else "needs-audio-review-launcher-attention"
    decision_rules = [
        {
            "name": "Pass means",
            "detail": "The mastered Episode 4 v006 audio spine sounds natural, intelligible, emotionally human, and good enough to send into the source-aware branch gate for final episode and shorts branches.",
        },
        {
            "name": "Pass does not mean",
            "detail": "The YouTube video, Spotify/Apple podcast package, shorts, captions, metadata, thumbnails, clips, or publication receipts are finished.",
        },
        {
            "name": "If it passes",
            "detail": "Record the guarded pass through the human decision front door, refresh the source-aware branch gate and preflight, then render Episode 4 publication candidates from refined stems plus timing metadata.",
        },
        {
            "name": "If it fails",
            "detail": "Do not retune the whole chain. Record exact timestamps and symptoms, keep v006 locked, and route a scoped v007 repair/proof pass.",
        },
    ]
    return {
        "schema": "quipsly.audio-workbench.morning-audio-review-launcher.v1",
        "generatedAt": generated_at,
        "baselineId": manifest.get("baselineId"),
        "status": status,
        "reviewTarget": "episode-4-v006-high-quality-audio-spine",
        "decisionRuleCount": len(decision_rules),
        "decisionRules": decision_rules,
        "hardStopCount": len(hard_stops),
        "hardStops": hard_stops,
        "approvalStatus": manifest.get("approvalStatus"),
        "currentGate": runway_state.get("currentGate") or manifest.get("audioRunwayStateCurrentGate") or "audio-spine-human-listen",
        "blockingCondition": runway_state.get("blockingCondition") or manifest.get("audioRunwayStateBlockingCondition") or "waiting-for-human-listen-proof",
        "beingJudgedNow": active_decision.get("beingJudgedNow") or "Episode 4 high-quality mastered audio spine",
        "notBeingJudgedYet": active_decision.get("notBeingJudgedYet")
        if isinstance(active_decision.get("notBeingJudgedYet"), list)
        else [
            "Final YouTube/Spotify/Apple episode render",
            "Final podcast RSS audio branch",
            "Final social shorts branch package",
        ],
        "renderRunwayStatus": render_runway.get("status") or "locked-until-human-listen",
        "renderRunwayBranchCount": int(render_runway.get("postApprovalBranchCount") or 0),
        "renderRunwayMissingInputCount": int(render_runway.get("postApprovalMissingInputCount") or 0),
        "renderRunwayExecutorStatus": render_runway.get("approvedBranchExecutorStatus") or "blocked-waiting-for-human-listen",
        "renderRunwayExecutorCanExecute": bool(render_runway.get("approvedBranchExecutorCanExecute")),
        "renderRunwayCommandsExposed": bool(render_runway.get("approvedBranchExecutorCommandsExposed")),
        "audioRunwayStateHtml": runway_state_html,
        "audioRunwayStateOpenCommand": runway_state_open,
        "packageReadyForHumanListen": bool(manifest.get("packageReadyForHumanListen")),
        "branchInheritanceReady": bool(manifest.get("branchInheritanceReady")),
        "branchRenderReady": bool(manifest.get("branchRenderReady")),
        "recommendedListeningFile": listen_summary,
        "recommendedAudioFile": audio_summary,
        "graveShiftFastPath": [
            {
                "step": 1,
                "title": "Confirm fast readback is green",
                "detail": "This proves the current listen package is coherent, gates are locked, post-approval runway rehearsal is present, and no render/upload/publication/original-mutation flags changed.",
                "artifact": fast_readback,
            },
            {
                "step": 2,
                "title": "Confirm the gate",
                "detail": "This review judges the audio spine only. Final episode, podcast RSS, and shorts branches stay locked until the guarded human-listen decision is recorded.",
                "artifact": runway_state_html,
            },
            {
                "step": 3,
                "title": "Open the listening M4A",
                "detail": "Use this file for the first human listen. Do not judge final episode/video readiness here.",
                "artifact": listen_summary.get("path"),
            },
            {
                "step": 4,
                "title": "Check the four critical moments",
                "detail": "If these fail, do not approve the spine. Route the exact failing window into scoped v007 repair/proof work.",
                "artifact": output_path(outputs.get("latestAudioListenPriorityReviewReelHtml"))
                or output_path(outputs.get("latestAudioListenPriorityConsoleHtml")),
            },
            {
                "step": 5,
                "title": "Check ASR source/master focus",
                "detail": "Use this to target any proof-window transcript drift where the master may not match source/raw evidence. Risks are listen targets, not automatic failures.",
                "artifact": asr_review_focus,
            },
            {
                "step": 6,
                "title": "Check spectral fatigue",
                "detail": "Use this to target rumble, mud, thinness, harshness, hiss, and over-squash risks. Risks are listen targets, not automatic repair orders.",
                "artifact": spectral_fatigue,
            },
            {
                "step": 7,
                "title": "Check translation survival",
                "detail": "Confirm the AAC/MP3/phone proof snippets have zero hard stops before treating the spine as branch-inheritance material.",
                "artifact": translation_survival,
            },
            {
                "step": 8,
                "title": "Confirm source-aware timing before branches",
                "detail": "This proves Charlie, Homer, and clip/source refined stems remain full length on one sequence clock. The mastered spine can be judged by ears, but branch edits should inherit the source-aware timing layer.",
                "artifact": source_aware_timing_contract,
            },
            {
                "step": 9,
                "title": "If the full listen passes, record approval",
                "detail": "Use the guarded human decision front door. This is the only route that should allow the source-aware branch gate to unlock inheritance.",
                "artifact": decision_front_door,
            },
            {
                "step": 10,
                "title": "Preview what approval may unlock after the branch gate",
                "detail": "This is a dry-run/sandbox rehearsal only. It should prove planned branch renders are ready from source-aware refined stems without exposing real render commands before approval.",
                "artifact": post_approval_rehearsal,
            },
            {
                "step": 11,
                "title": "If anything feels off, record notes instead",
                "detail": "Keep v006 locked. Capture the timestamp and symptom so repair is scoped, not a whole-chain retune.",
                "artifact": output_path(outputs.get("latestAudioPostReviewActionQueueMarkdown"))
                or output_path(outputs.get("latestAudioListenPriorityNotesInboxMarkdown")),
            },
        ],
        "criticalFastCheckCount": len(fast_checks),
        "criticalFastChecks": fast_checks,
        "morningPacketHtml": morning_packet,
        "morningPacketOpenCommand": morning_command,
        "finalMissionHtml": final_mission,
        "finalMissionOpenCommand": final_mission_command,
        "fastReadbackHtml": fast_readback,
        "fastReadbackStatus": fast_readback_report.get("status") if fast_readback_report else "not-generated",
        "fastReadbackPassed": bool(fast_readback_report.get("passed")) if fast_readback_report else False,
        "fastReadbackHardStopCount": int(fast_readback_report.get("hardStopCount") or 0) if fast_readback_report else None,
        "fastReadbackWarningCount": int(fast_readback_report.get("warningCount") or 0) if fast_readback_report else None,
        "fastReadbackCheckCount": int(fast_readback_report.get("checkCount") or 0) if fast_readback_report else None,
        "sourceAwareTimingContractHtml": source_aware_timing_contract,
        "sourceAwareTimingContractStatus": source_aware_timing_contract_report.get("status") if source_aware_timing_contract_report else "not-generated",
        "sourceAwareTimingContractReady": bool(source_aware_timing_contract_report.get("sourceAwareTimingReady")) if source_aware_timing_contract_report else False,
        "sourceAwareTimingContractReadyRoleCount": int(source_aware_timing_contract_report.get("readyRoleCount") or 0) if source_aware_timing_contract_report else None,
        "sourceAwareTimingContractHardStopCount": int(source_aware_timing_contract_report.get("hardStopCount") or 0) if source_aware_timing_contract_report else None,
        "sourceAwareTimingContractMaxDurationDeltaToMasterSeconds": source_aware_timing_contract_report.get("maxDurationDeltaToMasterSeconds") if source_aware_timing_contract_report else None,
        "postApprovalRenderRehearsalHtml": post_approval_rehearsal,
        "postApprovalRenderRehearsalStatus": post_approval_rehearsal_report.get("status") if post_approval_rehearsal_report else "not-generated",
        "postApprovalRenderRehearsalBranchCount": int(post_approval_rehearsal_report.get("branchCount") or 0) if post_approval_rehearsal_report else None,
        "postApprovalRenderRehearsalMissingInputCount": int(post_approval_rehearsal_report.get("missingInputCount") or 0) if post_approval_rehearsal_report else None,
        "postApprovalRenderRehearsalHardStopCount": int(post_approval_rehearsal_report.get("hardStopCount") or 0) if post_approval_rehearsal_report else None,
        "postApprovalApprovedSandboxPassed": bool(post_approval_rehearsal_report.get("approvedStateSandboxPassed")) if post_approval_rehearsal_report else False,
        "postApprovalBranchRunwayHtml": post_approval_runway,
        "technicalAuditionSnippetPackHtml": technical_audition,
        "asrReviewFocusPacketHtml": asr_review_focus,
        "asrReviewFocusPacketStatus": asr_review_focus_report.get("status") if asr_review_focus_report else "not-generated",
        "asrReviewFocusPacketFocusWindowCount": int(asr_review_focus_report.get("focusWindowCount") or 0) if asr_review_focus_report else None,
        "asrReviewFocusPacketHardStopCount": int(asr_review_focus_report.get("hardStopCount") or 0) if asr_review_focus_report else None,
        "asrReviewFocusPacketReviewRiskCount": int(asr_review_focus_report.get("reviewRiskCount") or 0) if asr_review_focus_report else None,
        "asrReviewFocusPacketReady": bool(asr_review_focus_report.get("status") in {"asr-review-focus-ready", "asr-review-focus-ready-with-review-risks"} and int(asr_review_focus_report.get("hardStopCount") or 0) == 0) if asr_review_focus_report else False,
        "spectralFatigueAuditHtml": spectral_fatigue,
        "spectralFatigueAuditStatus": spectral_fatigue_report.get("status") if spectral_fatigue_report else "not-generated",
        "spectralFatigueAuditHardStopCount": int(spectral_fatigue_report.get("hardStopCount") or 0) if spectral_fatigue_report else None,
        "spectralFatigueAuditReviewRiskCount": int(spectral_fatigue_report.get("reviewRiskCount") or 0) if spectral_fatigue_report else None,
        "spectralFatigueAuditReady": bool(spectral_fatigue_report.get("status") in {"spectral-fatigue-ready", "spectral-fatigue-ready-with-review-risks"} and int(spectral_fatigue_report.get("hardStopCount") or 0) == 0) if spectral_fatigue_report else False,
        "translationSurvivalAuditHtml": translation_survival,
        "translationSurvivalAuditStatus": translation_survival_report.get("status") if translation_survival_report else "not-generated",
        "translationSurvivalAuditHardStopCount": int(translation_survival_report.get("hardStopCount") or 0) if translation_survival_report else None,
        "translationSurvivalAuditReviewRiskCount": int(translation_survival_report.get("reviewRiskCount") or 0) if translation_survival_report else None,
        "translationSurvivalAuditReady": bool(translation_survival_report.get("status") == "translation-survival-audit-ready") if translation_survival_report else False,
        "humanDecisionFrontDoorHtml": decision_front_door,
        "humanDecisionFrontDoorOpenCommand": decision_command,
        "producerCommandCenterHtml": command_center,
        "nextSafeAction": "Listen to the M4A. If it passes, use the guarded human decision front door before branch rendering. If it fails, return exact notes and keep v006 locked.",
        "approvalStateChanged": False,
        "branchStateChanged": False,
        "renderAttempted": False,
        "uploadAttempted": False,
        "publicationAttempted": False,
        "originalMediaMutated": False,
    }


def render_markdown(report: dict[str, Any]) -> str:
    listen = report["recommendedListeningFile"]
    wav = report["recommendedAudioFile"]
    lines = [
        f"# Episode 4 morning audio review launcher: {report['baselineId']}",
        "",
        "## Human path",
        "",
        "1. Listen to the M4A listed below.",
        "2. If it sounds good, tell Codex: `Approve v006 audio spine`.",
        "3. If it sounds wrong, paste rough timestamp notes to Codex, for example `34:22 Charlie sounds gated`.",
        "4. If you are uncertain, tell Codex: `Needs proof` plus the timestamp or symptom.",
        "",
        "That is enough. The command-line decision recorder is for guarded bookkeeping after the listen, not something you need to wrestle with first.",
        "",
        f"- Status: `{report['status']}`",
        f"- Review target: `{report['reviewTarget']}`",
        f"- Approval status: `{report['approvalStatus']}`",
        f"- Current gate: `{report['currentGate']}`",
        f"- Blocking condition: `{report['blockingCondition']}`",
        f"- Branch inheritance ready: `{str(report['branchInheritanceReady']).lower()}`",
        f"- Branch render ready: `{str(report['branchRenderReady']).lower()}`",
        f"- Hard stops: `{report['hardStopCount']}`",
        "",
        "## What this review decides",
        "",
        f"- Being judged now: `{report['beingJudgedNow']}`",
        f"- Not being judged yet: {', '.join(report['notBeingJudgedYet'])}",
        f"- Render runway: `{report['renderRunwayStatus']}`",
        f"- Planned downstream branches: `{report['renderRunwayBranchCount']}`",
        f"- Missing downstream render inputs: `{report['renderRunwayMissingInputCount']}`",
        f"- Guarded executor: `{report['renderRunwayExecutorStatus']}`; can execute `{str(report['renderRunwayExecutorCanExecute']).lower()}`; commands exposed `{str(report['renderRunwayCommandsExposed']).lower()}`",
        f"- Audio runway state: `{report.get('audioRunwayStateHtml')}`",
        f"- Fast readback: `{report.get('fastReadbackStatus')}`; passed `{str(report.get('fastReadbackPassed')).lower()}`; hard stops `{report.get('fastReadbackHardStopCount')}`; checks `{report.get('fastReadbackCheckCount')}`",
        f"- Source-aware timing: `{report.get('sourceAwareTimingContractStatus')}`; ready `{str(report.get('sourceAwareTimingContractReady')).lower()}`; ready roles `{report.get('sourceAwareTimingContractReadyRoleCount')}`; hard stops `{report.get('sourceAwareTimingContractHardStopCount')}`; max delta `{report.get('sourceAwareTimingContractMaxDurationDeltaToMasterSeconds')}s`",
        f"- Post-approval rehearsal: `{report.get('postApprovalRenderRehearsalStatus')}`; branches `{report.get('postApprovalRenderRehearsalBranchCount')}`; missing inputs `{report.get('postApprovalRenderRehearsalMissingInputCount')}`; hard stops `{report.get('postApprovalRenderRehearsalHardStopCount')}`; approved sandbox passed `{str(report.get('postApprovalApprovedSandboxPassed')).lower()}`",
        "",
        "## Decision contract",
        "",
    ]
    for rule in report.get("decisionRules") or []:
        lines.extend([f"### {rule.get('name')}", "", str(rule.get("detail") or ""), ""])
    lines.extend(
        [
        "## Open first",
        "",
        f"- Listen file, judge this first: `{listen.get('path')}` ({listen.get('sizeMb')} MB)",
        f"- Premiere WAV: `{wav.get('path')}` ({wav.get('sizeMb')} MB)",
        f"- Fast readback: `{report.get('fastReadbackHtml')}`",
            f"- Source-aware timing contract: `{report.get('sourceAwareTimingContractHtml')}`",
            f"- Technical audition snippets: `{report.get('technicalAuditionSnippetPackHtml')}`",
        f"- Audio runway state: `{report.get('audioRunwayStateHtml')}`",
        f"- Post-approval render rehearsal: `{report.get('postApprovalRenderRehearsalHtml')}`",
        f"- Post-approval branch runway: `{report.get('postApprovalBranchRunwayHtml')}`",
        f"- Spectral fatigue audit: `{report.get('spectralFatigueAuditHtml')}`",
        f"- Spectral fatigue status: `{report.get('spectralFatigueAuditStatus')}`; hard stops `{report.get('spectralFatigueAuditHardStopCount')}`; risks `{report.get('spectralFatigueAuditReviewRiskCount')}`",
        f"- Translation survival audit: `{report.get('translationSurvivalAuditHtml')}`",
        f"- Translation survival status: `{report.get('translationSurvivalAuditStatus')}`; hard stops `{report.get('translationSurvivalAuditHardStopCount')}`; risks `{report.get('translationSurvivalAuditReviewRiskCount')}`",
        "",
        "## Grave-shift fast path",
        "",
    ]
    )
    for step in report.get("graveShiftFastPath") or []:
        lines.extend(
            [
                f"### {step.get('step')}. {step.get('title')}",
                "",
                str(step.get("detail") or ""),
                "",
                f"Artifact: `{step.get('artifact')}`",
                "",
            ]
        )
    lines.extend(
        [
            "## Four critical checks",
            "",
            "| Time | What to decide | If it fails |",
            "|---|---|---|",
        ]
    )
    for check in report.get("criticalFastChecks") or []:
        lines.append(
            f"| `{check.get('time')}` | {check.get('title')}: {check.get('listenQuestion')} | {check.get('safeActionIfFails')} |"
        )
    lines.extend(
        [
            "",
            "## Review doors",
            "",
            f"- Morning packet: `{report.get('morningPacketHtml')}`",
            f"- Final listen mission: `{report.get('finalMissionHtml')}`",
            f"- Fast readback: `{report.get('fastReadbackHtml')}`",
            f"- Source-aware timing contract: `{report.get('sourceAwareTimingContractHtml')}`",
            f"- Technical audition snippets: `{report.get('technicalAuditionSnippetPackHtml')}`",
            f"- ASR review focus packet: `{report.get('asrReviewFocusPacketHtml')}`",
            f"- Spectral fatigue audit: `{report.get('spectralFatigueAuditHtml')}`",
            f"- Translation survival audit: `{report.get('translationSurvivalAuditHtml')}`",
            f"- Human decision front door: `{report.get('humanDecisionFrontDoorHtml')}`",
            f"- Post-approval render rehearsal: `{report.get('postApprovalRenderRehearsalHtml')}`",
            f"- Post-approval branch runway: `{report.get('postApprovalBranchRunwayHtml')}`",
            "",
            "## Next safe action",
            "",
            report["nextSafeAction"],
            "",
        ]
    )
    if report["hardStops"]:
        lines.extend(["## Hard stops", ""])
        lines.extend(f"- {item}" for item in report["hardStops"])
    return "\n".join(lines)


def render_html(report: dict[str, Any]) -> str:
    listen = report["recommendedListeningFile"]
    wav = report["recommendedAudioFile"]
    hard = "".join(f"<li>{escape(item)}</li>" for item in report["hardStops"]) or "<li>None</li>"
    rules = "".join(
        "<li>"
        f"<strong>{escape(str(rule.get('name') or ''))}</strong>"
        f"<p>{escape(str(rule.get('detail') or ''))}</p>"
        "</li>"
        for rule in report.get("decisionRules") or []
    )
    fast_path = "".join(
        "<li>"
        f"<strong>{escape(str(step.get('title')))}</strong>"
        f"<p>{escape(str(step.get('detail') or ''))}</p>"
        f"<code>{escape(str(step.get('artifact') or ''))}</code>"
        "</li>"
        for step in report.get("graveShiftFastPath") or []
    )
    checks = "".join(
        "<tr>"
        f"<td><code>{escape(str(check.get('time') or ''))}</code></td>"
        f"<td><strong>{escape(str(check.get('title') or ''))}</strong><br>{escape(str(check.get('listenQuestion') or ''))}</td>"
        f"<td>{escape(str(check.get('safeActionIfFails') or ''))}</td>"
        "</tr>"
        for check in report.get("criticalFastChecks") or []
    )
    human_path = f"""
  <div class=\"hero card\">
    <p class=\"eyebrow\">Start here</p>
    <h1>Listen to one file. Tell Codex what you hear.</h1>
    <p class=\"big\">This is not the final YouTube, Spotify, Apple, or shorts package. This only decides whether the Episode 4 v006 audio spine is good enough to build those branches from.</p>
    <ol class=\"simple\">
      <li><strong>Listen:</strong> <a href=\"file://{escape(str(listen.get('path') or ''))}\">episode4-mastered-audio-spine-v006.m4a</a></li>
      <li><strong>If it passes:</strong> tell Codex <code>Approve v006 audio spine</code></li>
      <li><strong>If it fails:</strong> paste timestamp notes, like <code>34:22 Charlie sounds gated</code></li>
      <li><strong>If unsure:</strong> tell Codex <code>Needs proof</code> plus the time or symptom</li>
    </ol>
    <p class=\"calm\">You do not need to run terminal commands first. Codex can record the guarded decision after your listen notes.</p>
  </div>
"""
    return f"""<!doctype html>
<html lang=\"en\">
<head>
  <meta charset=\"utf-8\">
  <title>Episode 4 morning audio review</title>
  <style>
    body {{ font-family: -apple-system, BlinkMacSystemFont, sans-serif; margin: 32px; color: #2b241c; background: #fbf4e5; }}
    .hero {{ background: linear-gradient(135deg, #fff7de, #e8f0d6); border-color:#b69b42; }}
    .eyebrow {{ color:#6d5a18; font-size:12px; font-weight:800; text-transform:uppercase; letter-spacing:.18em; margin:0 0 6px; }}
    .big {{ font-size:18px; color:#4b4030; }}
    .simple {{ font-size:18px; line-height:1.55; }}
    .calm {{ color:#35513e; font-weight:700; }}
    .card {{ background: #fffaf0; border: 1px solid #dcc89f; border-radius: 18px; padding: 18px; margin: 16px 0; box-shadow: 0 8px 24px rgba(48,40,28,.08); }}
    code {{ background: #efe2c2; padding: 2px 6px; border-radius: 6px; }}
    a {{ color: #0b6a52; font-weight: 700; }}
    .pill {{ display: inline-block; background: #244c3d; color: #fff; padding: 8px 12px; border-radius: 999px; margin-right: 8px; }}
    table {{ border-collapse: collapse; width: 100%; }}
    td {{ border-top: 1px solid #dcc89f; padding: 12px; vertical-align: top; }}
  </style>
</head>
<body>
  {human_path}
  <div class=\"card\">
    <span class=\"pill\">{escape(report['status'])}</span>
    <span class=\"pill\">{escape(report['currentGate'])}</span>
    <span class=\"pill\">hard stops {report['hardStopCount']}</span>
    <h1>Episode 4 morning audio review</h1>
    <p>This is the tired-human door for one target: <strong>{escape(report['reviewTarget'])}</strong>. Listen to the M4A, reveal the WAV if it passes, then use the guarded human-decision front door.</p>
    <p><strong>Blocking condition:</strong> {escape(report['blockingCondition'])}</p>
  </div>
  <div class=\"card\">
    <h2>What this review decides</h2>
    <ul>
      <li><strong>Being judged now:</strong> {escape(report['beingJudgedNow'])}</li>
      <li><strong>Not being judged yet:</strong> {escape(', '.join(report['notBeingJudgedYet']))}</li>
      <li><strong>Render runway:</strong> {escape(report['renderRunwayStatus'])}</li>
      <li><strong>Downstream branches:</strong> {report['renderRunwayBranchCount']} planned, {report['renderRunwayMissingInputCount']} missing inputs</li>
      <li><strong>Guarded executor:</strong> {escape(report['renderRunwayExecutorStatus'])}; can execute {str(report['renderRunwayExecutorCanExecute']).lower()}; commands exposed {str(report['renderRunwayCommandsExposed']).lower()}</li>
      <li><strong>Fast readback:</strong> {escape(str(report.get('fastReadbackStatus')))}; passed {str(report.get('fastReadbackPassed')).lower()}; hard stops {escape(str(report.get('fastReadbackHardStopCount')))}; checks {escape(str(report.get('fastReadbackCheckCount')))}</li>
      <li><strong>Source-aware timing:</strong> {escape(str(report.get('sourceAwareTimingContractStatus')))}; ready {str(report.get('sourceAwareTimingContractReady')).lower()}; roles {escape(str(report.get('sourceAwareTimingContractReadyRoleCount')))}; hard stops {escape(str(report.get('sourceAwareTimingContractHardStopCount')))}; max delta {escape(str(report.get('sourceAwareTimingContractMaxDurationDeltaToMasterSeconds')))}s</li>
      <li><strong>Post-approval rehearsal:</strong> {escape(str(report.get('postApprovalRenderRehearsalStatus')))}; branches {escape(str(report.get('postApprovalRenderRehearsalBranchCount')))}; missing {escape(str(report.get('postApprovalRenderRehearsalMissingInputCount')))}; hard stops {escape(str(report.get('postApprovalRenderRehearsalHardStopCount')))}</li>
    </ul>
    <p><a href=\"file://{escape(str(report.get('audioRunwayStateHtml') or ''))}\">Open audio runway state</a></p>
  </div>
  <div class=\"card\">
    <h2>Decision contract</h2>
    <ol>{rules}</ol>
  </div>
  <div class=\"card\">
    <h2>Listen first</h2>
    <p><a href=\"file://{escape(str(listen.get('path') or ''))}\">Open listening M4A</a> <code>{escape(str(listen.get('sizeMb')))} MB</code></p>
    <p><a href=\"file://{escape(str(wav.get('path') or ''))}\">Reveal/use Premiere WAV</a> <code>{escape(str(wav.get('sizeMb')))} MB</code></p>
    <p><a href=\"file://{escape(str(report.get('fastReadbackHtml') or ''))}\">Open fast readback</a></p>
    <p><a href=\"file://{escape(str(report.get('sourceAwareTimingContractHtml') or ''))}\">Open source-aware timing contract</a></p>
    <p><a href=\"file://{escape(str(report.get('technicalAuditionSnippetPackHtml') or ''))}\">Open technical audition snippets</a></p>
    <p><a href=\"file://{escape(str(report.get('audioRunwayStateHtml') or ''))}\">Open audio runway state</a></p>
    <p><a href=\"file://{escape(str(report.get('postApprovalRenderRehearsalHtml') or ''))}\">Open post-approval render rehearsal</a></p>
  </div>
  <div class=\"card\">
    <h2>Grave-shift fast path</h2>
    <ol>{fast_path}</ol>
  </div>
  <div class=\"card\">
    <h2>Four critical checks</h2>
    <p>If these moments sound wrong, do not approve v006. Keep the spine locked and route the exact timestamp into scoped v007 repair/proof work.</p>
    <table><tbody>{checks}</tbody></table>
  </div>
  <div class=\"card\">
    <h2>Review doors</h2>
    <p><a href=\"file://{escape(str(report.get('morningPacketHtml') or ''))}\">Morning packet</a></p>
    <p><a href=\"file://{escape(str(report.get('finalMissionHtml') or ''))}\">Final listen mission</a></p>
    <p><a href=\"file://{escape(str(report.get('fastReadbackHtml') or ''))}\">Fast readback</a></p>
    <p><a href=\"file://{escape(str(report.get('sourceAwareTimingContractHtml') or ''))}\">Source-aware timing contract</a></p>
    <p><a href=\"file://{escape(str(report.get('technicalAuditionSnippetPackHtml') or ''))}\">Technical audition snippets</a></p>
    <p><a href=\"file://{escape(str(report.get('humanDecisionFrontDoorHtml') or ''))}\">Human decision front door</a></p>
    <p><a href=\"file://{escape(str(report.get('postApprovalRenderRehearsalHtml') or ''))}\">Post-approval render rehearsal</a></p>
    <p><a href=\"file://{escape(str(report.get('postApprovalBranchRunwayHtml') or ''))}\">Post-approval branch runway</a></p>
  </div>
  <div class=\"card\"><h2>Hard stops</h2><ul>{hard}</ul></div>
  <div class=\"card\"><h2>Next safe action</h2><p>{escape(report['nextSafeAction'])}</p></div>
</body>
</html>
"""


def launcher_script(report: dict[str, Any], html_path: Path) -> str:
    listen = report["recommendedListeningFile"].get("path")
    lines = [
        "#!/bin/zsh",
        "set -e",
        f"open {shell_quote(str(html_path))}",
    ]
    if listen:
        lines.append(f"open {shell_quote(str(listen))}")
    return "\n".join(lines) + "\n"


def update_manifest(baseline_dir: Path, report: dict[str, Any], json_path: Path, md_path: Path, html_path: Path, open_path: Path) -> None:
    manifest_path = baseline_dir / "manifest.json"
    manifest = read_json(manifest_path)
    outputs = manifest.setdefault("outputs", {})
    outputs["latestAudioMorningAudioReviewLauncher"] = str(json_path)
    outputs["latestAudioMorningAudioReviewLauncherMarkdown"] = str(md_path)
    outputs["latestAudioMorningAudioReviewLauncherHtml"] = str(html_path)
    outputs["latestAudioMorningAudioReviewLauncherOpenCommand"] = str(open_path)
    history = outputs.setdefault("audioMorningAudioReviewLaunchers", [])
    if isinstance(history, list):
        history.append(str(json_path))
        history[:] = history[-20:]
    manifest["audioMorningAudioReviewLauncherLatestStatus"] = report["status"]
    manifest["audioMorningAudioReviewLauncherReviewTarget"] = report["reviewTarget"]
    manifest["audioMorningAudioReviewLauncherCurrentGate"] = report["currentGate"]
    manifest["audioMorningAudioReviewLauncherBlockingCondition"] = report["blockingCondition"]
    manifest["audioMorningAudioReviewLauncherBeingJudgedNow"] = report["beingJudgedNow"]
    manifest["audioMorningAudioReviewLauncherRenderRunwayStatus"] = report["renderRunwayStatus"]
    manifest["audioMorningAudioReviewLauncherRenderRunwayBranchCount"] = report["renderRunwayBranchCount"]
    manifest["audioMorningAudioReviewLauncherRenderRunwayMissingInputCount"] = report["renderRunwayMissingInputCount"]
    manifest["audioMorningAudioReviewLauncherRenderRunwayExecutorStatus"] = report["renderRunwayExecutorStatus"]
    manifest["audioMorningAudioReviewLauncherRenderRunwayExecutorCanExecute"] = report["renderRunwayExecutorCanExecute"]
    manifest["audioMorningAudioReviewLauncherRenderRunwayCommandsExposed"] = report["renderRunwayCommandsExposed"]
    manifest["audioMorningAudioReviewLauncherDecisionRuleCount"] = report["decisionRuleCount"]
    manifest["audioMorningAudioReviewLauncherFastReadbackStatus"] = report.get("fastReadbackStatus") or ""
    manifest["audioMorningAudioReviewLauncherFastReadbackPassed"] = bool(report.get("fastReadbackPassed"))
    manifest["audioMorningAudioReviewLauncherFastReadbackHardStopCount"] = int(report.get("fastReadbackHardStopCount") or 0)
    manifest["audioMorningAudioReviewLauncherFastReadbackWarningCount"] = int(report.get("fastReadbackWarningCount") or 0)
    manifest["audioMorningAudioReviewLauncherFastReadbackCheckCount"] = int(report.get("fastReadbackCheckCount") or 0)
    manifest["audioMorningAudioReviewLauncherSourceAwareTimingContractReady"] = bool(report.get("sourceAwareTimingContractReady"))
    manifest["audioMorningAudioReviewLauncherSourceAwareTimingContractStatus"] = report.get("sourceAwareTimingContractStatus") or ""
    manifest["audioMorningAudioReviewLauncherSourceAwareTimingContractReadyRoleCount"] = int(report.get("sourceAwareTimingContractReadyRoleCount") or 0)
    manifest["audioMorningAudioReviewLauncherSourceAwareTimingContractHardStopCount"] = int(report.get("sourceAwareTimingContractHardStopCount") or 0)
    manifest["audioMorningAudioReviewLauncherSourceAwareTimingContractMaxDurationDeltaToMasterSeconds"] = report.get("sourceAwareTimingContractMaxDurationDeltaToMasterSeconds")
    manifest["audioMorningAudioReviewLauncherPostApprovalRenderRehearsalStatus"] = report.get("postApprovalRenderRehearsalStatus") or ""
    manifest["audioMorningAudioReviewLauncherPostApprovalRenderRehearsalBranchCount"] = int(report.get("postApprovalRenderRehearsalBranchCount") or 0)
    manifest["audioMorningAudioReviewLauncherPostApprovalRenderRehearsalMissingInputCount"] = int(report.get("postApprovalRenderRehearsalMissingInputCount") or 0)
    manifest["audioMorningAudioReviewLauncherPostApprovalRenderRehearsalHardStopCount"] = int(report.get("postApprovalRenderRehearsalHardStopCount") or 0)
    manifest["audioMorningAudioReviewLauncherPostApprovalApprovedSandboxPassed"] = bool(report.get("postApprovalApprovedSandboxPassed"))
    manifest["audioMorningAudioReviewLauncherTechnicalAuditionReady"] = bool(report.get("technicalAuditionSnippetPackHtml"))
    manifest["audioMorningAudioReviewLauncherAsrReviewFocusReady"] = bool(report.get("asrReviewFocusPacketReady"))
    manifest["audioMorningAudioReviewLauncherAsrReviewFocusStatus"] = report.get("asrReviewFocusPacketStatus") or ""
    manifest["audioMorningAudioReviewLauncherAsrReviewFocusWindowCount"] = int(report.get("asrReviewFocusPacketFocusWindowCount") or 0)
    manifest["audioMorningAudioReviewLauncherAsrReviewFocusHardStopCount"] = int(report.get("asrReviewFocusPacketHardStopCount") or 0)
    manifest["audioMorningAudioReviewLauncherAsrReviewFocusReviewRiskCount"] = int(report.get("asrReviewFocusPacketReviewRiskCount") or 0)
    manifest["audioMorningAudioReviewLauncherHardStopCount"] = report["hardStopCount"]
    manifest["audioMorningAudioReviewLauncherCriticalFastCheckCount"] = report["criticalFastCheckCount"]
    manifest["audioMorningAudioReviewLauncherSpectralFatigueReady"] = bool(report.get("spectralFatigueAuditReady"))
    manifest["audioMorningAudioReviewLauncherSpectralFatigueStatus"] = report.get("spectralFatigueAuditStatus") or ""
    manifest["audioMorningAudioReviewLauncherSpectralFatigueHardStopCount"] = int(report.get("spectralFatigueAuditHardStopCount") or 0)
    manifest["audioMorningAudioReviewLauncherSpectralFatigueReviewRiskCount"] = int(report.get("spectralFatigueAuditReviewRiskCount") or 0)
    manifest["audioMorningAudioReviewLauncherTranslationSurvivalReady"] = bool(report.get("translationSurvivalAuditReady"))
    manifest["audioMorningAudioReviewLauncherTranslationSurvivalStatus"] = report.get("translationSurvivalAuditStatus") or ""
    manifest["audioMorningAudioReviewLauncherTranslationSurvivalHardStopCount"] = int(report.get("translationSurvivalAuditHardStopCount") or 0)
    manifest["audioMorningAudioReviewLauncherTranslationSurvivalReviewRiskCount"] = int(report.get("translationSurvivalAuditReviewRiskCount") or 0)
    manifest["audioMorningAudioReviewLauncherApprovalStateChanged"] = False
    manifest["audioMorningAudioReviewLauncherBranchStateChanged"] = False
    manifest["audioMorningAudioReviewLauncherRenderAttempted"] = False
    manifest["audioMorningAudioReviewLauncherUploadAttempted"] = False
    manifest["audioMorningAudioReviewLauncherPublicationAttempted"] = False
    manifest["audioMorningAudioReviewLauncherOriginalMediaMutated"] = False
    write_json(manifest_path, manifest)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--baseline-dir", required=True)
    args = parser.parse_args()
    baseline_dir = Path(args.baseline_dir).expanduser().resolve()
    report = build_report(baseline_dir)
    stamp = datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S")
    slug = str(report.get("baselineId") or "audio-baseline").replace("/", "-")
    versioned_dir = baseline_dir / f"audio-morning-audio-review-launcher-{slug}-{stamp}"
    versioned_dir.mkdir(parents=True, exist_ok=True)
    stable_json = baseline_dir / "EPISODE_4_MORNING_AUDIO_REVIEW.json"
    stable_md = baseline_dir / "EPISODE_4_MORNING_AUDIO_REVIEW.md"
    stable_html = baseline_dir / "EPISODE_4_MORNING_AUDIO_REVIEW.html"
    stable_open = baseline_dir / "OPEN_EPISODE_4_MORNING_AUDIO_REVIEW.command"
    versioned_json = versioned_dir / "morning-audio-review-launcher.json"
    versioned_md = versioned_dir / "morning-audio-review-launcher.md"
    versioned_html = versioned_dir / "morning-audio-review-launcher.html"
    versioned_open = versioned_dir / "open-morning-audio-review-launcher.command"
    for path in (stable_json, versioned_json):
        write_json(path, report)
    markdown = render_markdown(report)
    for path in (stable_md, versioned_md):
        path.write_text(markdown, encoding="utf-8")
    html = render_html(report)
    for path in (stable_html, versioned_html):
        path.write_text(html, encoding="utf-8")
    stable_open.write_text(launcher_script(report, stable_html), encoding="utf-8")
    versioned_open.write_text(launcher_script(report, versioned_html), encoding="utf-8")
    desktop_open = Path("/Users/wall-e/Desktop/EPISODE_4_LISTEN_NOW.command")
    desktop_open.write_text(launcher_script(report, stable_html), encoding="utf-8")
    os.chmod(stable_open, 0o755)
    os.chmod(versioned_open, 0o755)
    os.chmod(desktop_open, 0o755)
    update_manifest(baseline_dir, report, stable_json, stable_md, stable_html, stable_open)
    print(str(stable_html))


if __name__ == "__main__":
    main()
