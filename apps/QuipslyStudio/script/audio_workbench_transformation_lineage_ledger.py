#!/usr/bin/env python3
"""Generate an audio transformation lineage ledger for a conformed baseline.

The lineage ledger answers the question we keep tripping over:

    What changed the sound, what evidence proves it, and what knob owns the
    next repair?

It is deliberately evidence-only. It does not approve audio, fail audio, render
branches, upload files, publish, or mutate original media. It writes stable
root-level aliases so the ledger can be opened from the baseline folder without
chasing timestamped history.
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
    raise FileNotFoundError(
        "Could not find manifest.json at "
        f"{input_path}/manifest.json or {nested}/manifest.json"
    )


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
            "wavPath",
            "m4aPath",
            "playlistPath",
        ):
            subvalue = value.get(key)
            if isinstance(subvalue, str) and subvalue:
                return subvalue
    return None


def load_report(outputs: dict[str, Any], key: str) -> dict[str, Any]:
    path = output_path(outputs.get(key))
    if not path:
        return {}
    candidate = Path(path)
    if candidate.suffix.lower() != ".json" or not candidate.exists():
        return {}
    try:
        return read_json(candidate)
    except json.JSONDecodeError:
        return {}


def artifact(outputs: dict[str, Any], key: str, label: str, purpose: str) -> dict[str, Any]:
    path = output_path(outputs.get(key))
    exists = bool(path and Path(path).exists())
    return {
        "key": key,
        "label": label,
        "purpose": purpose,
        "path": path,
        "exists": exists,
        "sizeBytes": Path(path).stat().st_size if exists else None,
    }


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


def bool_text(value: Any) -> str:
    return "true" if bool(value) else "false"


def stage(
    *,
    stage_id: str,
    label: str,
    status: str,
    intent: str,
    sound_changes: list[str],
    evidence: list[dict[str, Any]],
    controls: list[str],
    repair_knobs: list[str],
    risks: list[str],
    next_action: str,
    approval_gate: str,
) -> dict[str, Any]:
    missing = [item for item in evidence if not item["exists"]]
    return {
        "id": stage_id,
        "label": label,
        "status": status,
        "intent": intent,
        "soundChanges": sound_changes,
        "evidence": evidence,
        "evidenceCount": len(evidence),
        "missingEvidenceCount": len(missing),
        "controls": controls,
        "repairKnobs": repair_knobs,
        "risks": risks,
        "nextAction": next_action,
        "approvalGate": approval_gate,
    }


def status_from_evidence(evidence: list[dict[str, Any]], *, locked: bool = False, waiting: str | None = None) -> str:
    if locked:
        return "locked"
    if waiting:
        return waiting
    if all(item["exists"] for item in evidence):
        return "evidence-present"
    if any(item["exists"] for item in evidence):
        return "partial-evidence"
    return "missing-evidence"


def build_ledger(manifest: dict[str, Any], baseline_dir: Path, generated_at: str) -> dict[str, Any]:
    outputs = manifest.get("outputs") or {}
    baseline_id = str(manifest.get("baselineId") or "audio-baseline")
    approval_status = str(manifest.get("approvalStatus") or "unknown")
    package_ready = bool(manifest.get("packageReadyForHumanListen"))
    branch_inheritance_ready = bool(manifest.get("branchInheritanceReady"))
    branch_render_ready = bool(manifest.get("branchRenderReady"))
    dx_return = load_report(outputs, "latestDxReviveReturnWorkbench")
    goal_audit = load_report(outputs, "latestAudioGoalCompletionAudit")
    producer_audit = load_report(outputs, "latestAudioProducerGradeAudit")
    platform_loudness = load_report(outputs, "latestAudioPlatformLoudnessAudit")
    speaker_matrix = load_report(outputs, "latestSpeakerCleanupDecisionMatrix")

    raw_evidence = [
        artifact(outputs, "sourceActivityMarkdown", "Source activity report", "Raw/source activity map for aligned media."),
        artifact(outputs, "latestAudioProductionDoctrineHtml", "Audio production doctrine", "Reusable rules for raw-source handling and derived-only processing."),
    ]
    sync_evidence = [
        artifact(outputs, "latestEditorHandoffPacketMarkdown", "Editor handoff packet", "Duration and handoff evidence for editor use."),
        artifact(outputs, "latestEditorMarkerPacketMarkdown", "Editor marker packet", "Markers that locate known review and approval points."),
    ]
    activity_evidence = [
        artifact(outputs, "latestAudioSpeakerActivityReviewBoardHtml", "Speaker activity review board", "Where sources are active, retained, gated, or suspicious."),
        artifact(outputs, "latestSpeakerBleedGapProofAuditMarkdown", "Speaker bleed/gap audit", "Machine-selected cleanup focus windows."),
        artifact(outputs, "latestAudioSpeakerContributionLedgerHtml", "Speaker contribution ledger", "Contribution and preservation markers across the spine."),
    ]
    cleanup_evidence = [
        artifact(outputs, "latestSpeakerCleanupProofPackHtml", "Speaker cleanup proof pack", "A/B snippets for raw, gated, and mastered windows."),
        artifact(outputs, "latestSpeakerCleanupProofPackAuditMarkdown", "Speaker cleanup proof-pack audit", "Mechanical proof that cleanup snippets exist and are sane."),
        artifact(outputs, "latestSpeakerCleanupDecisionMatrixHtml", "Speaker cleanup decision matrix", "Decision surface tying snippets, contribution markers, and safe repairs together."),
    ]
    restoration_evidence = [
        artifact(outputs, "latestDxReviveManualBouncePacketMarkdown", "dxRevive manual bounce packet", "Derived stems and return contract for optional restoration."),
        artifact(outputs, "latestDxReviveReturnWorkbenchHtml", "dxRevive return workbench", "Return state, missing bounces, validation, and planner status."),
        artifact(outputs, "latestDxReviveBounceValidationMarkdown", "dxRevive bounce validation", "Validates duration, sample rate, channels, and expected files."),
        artifact(outputs, "latestDxReviveProofCandidatePlannerMarkdown", "dxRevive proof candidate planner", "Blocks proof candidate generation until returned bounces validate."),
    ]
    master_evidence = [
        artifact(outputs, "masterWav", "Master WAV", "Full-length stereo spine for Premiere/Quipsly handoff."),
        artifact(outputs, "masterM4a", "Listening M4A", "Compressed full-length listening copy."),
        artifact(outputs, "qualityReportMarkdown", "Quality report", "Codec, duration, peak/loudness, and delivery facts."),
        artifact(outputs, "latestAudioPlatformLoudnessAuditHtml", "Platform loudness audit", "Podcast/social loudness profile checks."),
        artifact(outputs, "latestAudioBroadcastPolishScorecardHtml", "Broadcast polish scorecard", "Producer-level score and risk summary."),
    ]
    review_evidence = [
        artifact(outputs, "latestAudioProducerCommandCenterHtml", "Producer Command Center", "Current front door for review and safe next actions."),
        artifact(outputs, "latestAudioFinalListenFastPassHtml", "Final-listen fast pass", "Shortest sane human review route."),
        artifact(outputs, "latestAudioPostReviewActionQueueMarkdown", "Post-review action queue", "One board for notes, repairs, proof actions, and pass context."),
        artifact(outputs, "latestAudioUnresolvedRequirementReviewHtml", "Unresolved requirement review", "Partial and locked requirement action lanes."),
    ]
    branch_evidence = [
        artifact(outputs, "latestBranchInheritanceGateMarkdown", "Branch inheritance gate", "Whether edit branches may inherit this spine."),
        artifact(outputs, "latestApprovedBranchRenderExecutorMarkdown", "Approved branch-render executor", "Commands exposed only after human approval."),
        artifact(outputs, "latestBranchRenderProofMarkdown", "Branch render proof", "Proof-only render evidence where available."),
    ]

    stages = [
        stage(
            stage_id="raw-source",
            label="Raw Source Layer",
            status=status_from_evidence(raw_evidence),
            intent="Keep original camera/audio/reference files as read-only evidence and identify which sources are production, reference, or parked.",
            sound_changes=["None. This layer must not change sound."],
            evidence=raw_evidence,
            controls=["source role", "production inclusion", "parked/evidence-only state", "raw path replacement"],
            repair_knobs=["Correct source mapping only; do not process originals."],
            risks=["Wrong file promoted into the mix", "original media mutation", "camera scratch audio treated as production audio"],
            next_action="If source identity is wrong, create a new sync/conform version rather than editing this baseline in place.",
            approval_gate="No approval can be based on raw inventory alone.",
        ),
        stage(
            stage_id="sync-conform",
            label="Sync and Conform",
            status=status_from_evidence(sync_evidence),
            intent="Align usable sources to one sequence-time spine while preserving timeline length.",
            sound_changes=["No creative processing. Timing alignment determines which derived stems line up with the episode spine."],
            evidence=sync_evidence,
            controls=["sequence offset", "source offset", "duration tolerance", "known breaks", "parked mismatches"],
            repair_knobs=["Rebuild sync metadata from verified media; never hide sync drift inside cleanup."],
            risks=["All audio stacked on top of itself", "zero-duration metadata", "wrong Premiere reference", "silent timing drift"],
            next_action="Before any v007 audio repair, verify the failing moment is not actually a sync/conform problem.",
            approval_gate="Sync can be machine-checked, but lipsync/response sanity still benefits from human spot checks.",
        ),
        stage(
            stage_id="speaker-activity",
            label="Speaker Activity and Contribution",
            status=status_from_evidence(activity_evidence),
            intent="Detect where Charlie, Homer, reference clips, laughter, reactions, overlap, bleed, and gaps matter.",
            sound_changes=["Analysis only. It controls later duck/gate choices but should not itself alter audio."],
            evidence=activity_evidence,
            controls=["speaker activity threshold", "reaction preservation", "overlap handling", "minimum gap length"],
            repair_knobs=["Adjust activity thresholds or mark uncertain windows for proof snippets before changing a full master."],
            risks=["Quiet reactions classified as silence", "outdoor noise classified as speech", "overlap treated as damage"],
            next_action="Use the speaker cleanup decision matrix when human review finds missing reactions or lingering bleed.",
            approval_gate="Machine evidence can focus listening; it cannot decide that a conversation feels natural.",
        ),
        stage(
            stage_id="source-aware-cleanup",
            label="Source-Aware Cleanup Automation",
            status=status_from_evidence(cleanup_evidence, waiting="ready-for-human-listen"),
            intent="Duck or retain derived aligned stems based on who is actually contributing, preserving useful humanity while removing echo/park noise.",
            sound_changes=["Speaker-specific gain automation", "ducking during non-contributing gaps", "smooth fades/noise floors", "retention of useful overlap and reactions"],
            evidence=cleanup_evidence,
            controls=["duck depth", "gate/duck release", "crossfade length", "noise-floor blend", "speaker-specific preservation rules"],
            repair_knobs=["Create a scoped proof-window v007 candidate for the failing cleanup family, then A/B it before promotion."],
            risks=["Robotic gating", "lost Homer", "clipped Charlie laughs", "remaining Charlie call echo", "Homer park voices under Charlie"],
            next_action="A real reviewer should pass/fail the cleanup decision matrix before branch inheritance.",
            approval_gate="Partial until human listening proves cleanup is natural.",
        ),
        stage(
            stage_id="restoration",
            label="Optional Restoration Lane",
            status=dx_return.get("status") or status_from_evidence(restoration_evidence),
            intent="Let dxRevive or similar tools improve duplicated derived stems only after validation, never as a hidden post-mix spell.",
            sound_changes=["None yet for v006; returned dxRevive bounces are missing and have not entered the candidate."],
            evidence=restoration_evidence,
            controls=["selected duplicated stem", "restoration strength", "return folder", "duration/sample-rate/channel validation"],
            repair_knobs=["Return validated bounces, render proof candidates only, then compare against v006 before any promotion."],
            risks=["Uncanny shiny voice", "restored bleed", "duration mismatch", "manual bounce silently replacing current spine"],
            next_action="Wait for the three returned bounces or continue without dxRevive; do not fake restoration.",
            approval_gate="Restoration cannot influence a baseline until returned bounces validate and pass A/B proof listening.",
        ),
        stage(
            stage_id="mix-master",
            label="Mix, Master, and Delivery Spine",
            status="machine-review-ready-human-listen-required" if package_ready else "not-ready",
            intent="Produce a normal stereo WAV/M4A that Charlie can use in Premiere and Quipsly can inherit after approval.",
            sound_changes=["per-speaker balance", "bus compression", "limiting", "loudness shaping", "master delivery encoding"],
            evidence=master_evidence,
            controls=["Charlie gain", "Homer gain", "reference clip gain", "bus compression", "limiter ceiling", "LUFS target"],
            repair_knobs=["Fix source/stem balance before the limiter; do not use mastering to hide bad cleanup."],
            risks=["Homer too low", "Charlie too hot", "fatiguing compression", "lifted park ambience", "long silence left for editor decision"],
            next_action="Use the final-listen fast pass and broadcast scorecard as maps, not approval stamps.",
            approval_gate="Machine delivery checks are necessary, not sufficient.",
        ),
        stage(
            stage_id="review-repair",
            label="Human/Agent Review and Repair Routing",
            status=status_from_evidence(review_evidence, waiting="waiting-for-human-listen-notes"),
            intent="Turn listen observations into pass context, focused proof requests, or scoped repair actions without overwriting v006.",
            sound_changes=["None directly. Review notes choose whether future proof repairs are needed."],
            evidence=review_evidence,
            controls=["review decision", "notes packet", "repair action family", "focused proof window", "pass context"],
            repair_knobs=["Route exported notes through inboxes; generate scoped v007 proof candidates only for confirmed symptoms."],
            risks=["Approving without listening", "repairing the wrong stage", "losing notes in separate consoles", "turning a review worry into a whole-pipeline rerun"],
            next_action="Use the Producer Command Center first, then export notes through the relevant notes inbox.",
            approval_gate="Real approval requires explicit human listen proof.",
        ),
        stage(
            stage_id="branch-inheritance",
            label="Edit Branch Inheritance",
            status=status_from_evidence(branch_evidence, locked=not branch_inheritance_ready or not branch_render_ready),
            intent="Let long-form and shorts branches inherit one approved clean production baseline instead of repeating audio cleanup.",
            sound_changes=["None until human-approved branch renders are allowed."],
            evidence=branch_evidence,
            controls=["approval status", "branch inheritance gate", "branch render executor", "proof-only override"],
            repair_knobs=["If v006 passes, record the human decision; if it fails, repair the owning stage and create v007."],
            risks=["Rendering branches from unapproved audio", "duplicating cleanup per edit", "publishing a machine-only candidate"],
            next_action="Keep branch rendering locked until human listen approval changes manifest truth.",
            approval_gate="Locked while approvalStatus is not human-approved and branch flags are false.",
        ),
    ]

    missing_evidence = sum(stage_item["missingEvidenceCount"] for stage_item in stages)
    locked_stages = [stage_item["id"] for stage_item in stages if stage_item["status"] == "locked"]
    partial_stages = [
        stage_item["id"]
        for stage_item in stages
        if stage_item["status"] in {"partial-evidence", "waiting-for-bounces", "waiting-for-human-listen-notes", "ready-for-human-listen"}
    ]

    return {
        "schema": "quipsly.audioTransformationLineageLedger.v1",
        "generatedAt": generated_at,
        "baselineId": baseline_id,
        "baselineDir": str(baseline_dir),
        "approvalStatus": approval_status,
        "packageReadyForHumanListen": package_ready,
        "branchInheritanceReady": branch_inheritance_ready,
        "branchRenderReady": branch_render_ready,
        "humanListenStillRequired": approval_status != "human-approved-for-branch-inheritance",
        "lineageStatus": "ready-for-review-locked-before-branch-render",
        "stageCount": len(stages),
        "missingEvidenceCount": missing_evidence,
        "lockedStages": locked_stages,
        "partialOrWaitingStages": partial_stages,
        "summary": {
            "goalAuditProved": goal_audit.get("statusCounts", {}).get("proved") or goal_audit.get("provedCount") or manifest.get("audioGoalCompletionAuditProvedCount"),
            "goalAuditPartial": goal_audit.get("statusCounts", {}).get("partial") or goal_audit.get("partialCount") or manifest.get("audioGoalCompletionAuditPartialCount"),
            "goalAuditLocked": goal_audit.get("statusCounts", {}).get("locked") or goal_audit.get("lockedCount") or manifest.get("audioGoalCompletionAuditLockedCount"),
            "producerScore": producer_audit.get("score") or producer_audit.get("overallScore") or manifest.get("audioProducerGradeAuditScore"),
            "speakerCleanupWindows": speaker_matrix.get("windowCount") or manifest.get("speakerCleanupDecisionMatrixWindowCount"),
            "speakerCleanupSnippets": speaker_matrix.get("proofSnippetCount") or manifest.get("speakerCleanupDecisionMatrixProofSnippetCount"),
            "platformHardGateAttentionCount": (platform_loudness.get("summary") or {}).get("hardGateAttentionCount")
            if platform_loudness
            else manifest.get("audioPlatformLoudnessHardGateAttentionCount"),
            "dxReviveStatus": dx_return.get("status") or manifest.get("dxReviveReturnWorkbenchStatus"),
            "dxReviveExpected": dx_return.get("expectedCount") or manifest.get("dxReviveReturnWorkbenchExpectedCount"),
            "dxReviveValidated": dx_return.get("validatedCount") or manifest.get("dxReviveReturnWorkbenchValidatedCount"),
            "dxReviveMissing": dx_return.get("missingCount") or manifest.get("dxReviveReturnWorkbenchMissingCount"),
        },
        "stages": stages,
        "safeNextActions": [
            "Do human listen proof before any branch inheritance.",
            "If a symptom is confirmed, route it to the owning stage and render a proof-window v007 candidate.",
            "Do not let dxRevive influence audio until returned bounces validate.",
            "Keep final handoff simple: normal stereo WAV/M4A plus diagnostics, not split channels Charlie has to repair in Premiere.",
        ],
        "approvalStateChanged": False,
        "branchStateChanged": False,
        "renderAttempted": False,
        "uploadAttempted": False,
        "publicationAttempted": False,
        "originalMediaMutated": False,
    }


def render_markdown(report: dict[str, Any]) -> str:
    lines = [
        f"# Audio Transformation Lineage Ledger: {report['baselineId']}",
        "",
        f"Generated: `{report['generatedAt']}`",
        "",
        "This ledger is the audio workbench provenance map. It explains what can change the sound, which artifacts prove each stage, which knobs own repairs, and which gates are still locked. It does not approve audio, render branches, upload, publish, or mutate source media.",
        "",
        "## Current truth",
        "",
        f"- Approval status: `{report['approvalStatus']}`",
        f"- Package ready for human listen: `{bool_text(report['packageReadyForHumanListen'])}`",
        f"- Human listen still required: `{bool_text(report['humanListenStillRequired'])}`",
        f"- Branch inheritance ready: `{bool_text(report['branchInheritanceReady'])}`",
        f"- Branch render ready: `{bool_text(report['branchRenderReady'])}`",
        f"- Lineage status: `{report['lineageStatus']}`",
        f"- Stages: `{report['stageCount']}`",
        f"- Missing evidence links: `{report['missingEvidenceCount']}`",
        "",
        "## Summary",
        "",
    ]
    for key, value in report["summary"].items():
        lines.append(f"- {key}: `{value}`")
    lines.extend(
        [
            "",
            "## Stage ledger",
            "",
            "| Stage | Status | What changes sound | Main controls | Next safe action |",
            "|---|---:|---|---|---|",
        ]
    )
    for item in report["stages"]:
        changes = "<br>".join(item["soundChanges"])
        controls = "<br>".join(item["controls"])
        lines.append(
            f"| {item['label']} | `{item['status']}` | {changes} | {controls} | {item['nextAction']} |"
        )
    lines.extend(["", "## Evidence by stage", ""])
    for item in report["stages"]:
        lines.extend(
            [
                f"### {item['label']}",
                "",
                f"- Status: `{item['status']}`",
                f"- Intent: {item['intent']}",
                f"- Approval gate: {item['approvalGate']}",
                f"- Missing evidence: `{item['missingEvidenceCount']}`",
                "",
                "| Evidence | Exists | Purpose | Path |",
                "|---|---:|---|---|",
            ]
        )
        for evidence in item["evidence"]:
            lines.append(
                f"| {evidence['label']} | `{bool_text(evidence['exists'])}` | {evidence['purpose']} | `{evidence['path'] or 'not registered'}` |"
            )
        lines.extend(["", "Repair knobs:", ""])
        for knob in item["repairKnobs"]:
            lines.append(f"- {knob}")
        lines.extend(["", "Risks:", ""])
        for risk in item["risks"]:
            lines.append(f"- {risk}")
        lines.append("")
    lines.extend(["## Safe next actions", ""])
    for action in report["safeNextActions"]:
        lines.append(f"- {action}")
    return "\n".join(lines) + "\n"


def render_html(report: dict[str, Any]) -> str:
    cards = []
    for item in report["stages"]:
        evidence_rows = []
        for evidence in item["evidence"]:
            path = evidence["path"]
            link = f'<a href="file://{e(path)}">{evidence["label"]}</a>' if path and evidence["exists"] else e(evidence["label"])
            evidence_rows.append(
                f"<tr><td>{link}</td><td>{e(bool_text(evidence['exists']))}</td><td>{e(evidence['purpose'])}</td></tr>"
            )
        cards.append(
            f"""
            <section class="stage">
              <div class="stage-head">
                <h2>{e(item['label'])}</h2>
                <span class="status">{e(item['status'])}</span>
              </div>
              <p>{e(item['intent'])}</p>
              <h3>What changes sound</h3>
              <ul>{''.join(f'<li>{e(change)}</li>' for change in item['soundChanges'])}</ul>
              <h3>Controls</h3>
              <ul>{''.join(f'<li>{e(control)}</li>' for control in item['controls'])}</ul>
              <h3>Repair knobs</h3>
              <ul>{''.join(f'<li>{e(knob)}</li>' for knob in item['repairKnobs'])}</ul>
              <h3>Risks</h3>
              <ul>{''.join(f'<li>{e(risk)}</li>' for risk in item['risks'])}</ul>
              <h3>Evidence</h3>
              <table><thead><tr><th>Artifact</th><th>Exists</th><th>Purpose</th></tr></thead><tbody>{''.join(evidence_rows)}</tbody></table>
              <div class="next"><strong>Next:</strong> {e(item['nextAction'])}</div>
              <div class="gate"><strong>Gate:</strong> {e(item['approvalGate'])}</div>
            </section>
            """
        )
    summary_items = "".join(f"<li><strong>{e(k)}</strong>: {e(v)}</li>" for k, v in report["summary"].items())
    actions = "".join(f"<li>{e(action)}</li>" for action in report["safeNextActions"])
    return f"""<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title>Audio Transformation Lineage Ledger</title>
  <style>
    :root {{
      color-scheme: dark;
      --bg: #101812;
      --panel: #17251c;
      --panel2: #203323;
      --ink: #f4eedc;
      --muted: #b6ad91;
      --leaf: #78d27d;
      --gold: #efd15d;
      --clay: #d8794d;
      --line: rgba(244, 238, 220, 0.14);
    }}
    body {{ margin: 0; background: radial-gradient(circle at top left, #263a28, var(--bg) 44%); color: var(--ink); font: 15px/1.5 -apple-system, BlinkMacSystemFont, "Avenir Next", sans-serif; }}
    main {{ max-width: 1180px; margin: 0 auto; padding: 36px 24px 72px; }}
    .hero {{ border: 1px solid var(--line); border-radius: 24px; padding: 28px; background: linear-gradient(135deg, rgba(120,210,125,.14), rgba(239,209,93,.08)); box-shadow: 0 18px 60px rgba(0,0,0,.28); }}
    .eyebrow {{ color: var(--gold); font-weight: 800; letter-spacing: .18em; text-transform: uppercase; font-size: 12px; }}
    h1 {{ margin: 8px 0 10px; font-size: clamp(34px, 6vw, 64px); line-height: .95; }}
    .truth {{ display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 10px; margin-top: 20px; }}
    .pill {{ background: rgba(0,0,0,.28); border: 1px solid var(--line); border-radius: 16px; padding: 12px; }}
    .pill b {{ display: block; color: var(--muted); font-size: 12px; text-transform: uppercase; letter-spacing: .08em; }}
    .pill span {{ color: var(--leaf); font-weight: 800; }}
    .summary, .stage {{ margin-top: 18px; background: rgba(23,37,28,.86); border: 1px solid var(--line); border-radius: 22px; padding: 22px; }}
    .stage-head {{ display: flex; justify-content: space-between; gap: 12px; align-items: center; }}
    h2 {{ margin: 0; }}
    h3 {{ color: var(--gold); font-size: 13px; text-transform: uppercase; letter-spacing: .12em; margin-top: 20px; }}
    .status {{ background: rgba(239,209,93,.13); color: var(--gold); border: 1px solid rgba(239,209,93,.35); border-radius: 999px; padding: 6px 10px; font-weight: 800; white-space: nowrap; }}
    table {{ width: 100%; border-collapse: collapse; margin-top: 10px; overflow: hidden; border-radius: 14px; }}
    th, td {{ border-bottom: 1px solid var(--line); padding: 10px; vertical-align: top; text-align: left; }}
    th {{ color: var(--muted); font-size: 12px; text-transform: uppercase; letter-spacing: .08em; }}
    a {{ color: var(--leaf); text-decoration: none; }}
    .next, .gate {{ margin-top: 12px; padding: 12px; border-radius: 14px; background: rgba(0,0,0,.2); }}
    .gate {{ color: var(--muted); }}
  </style>
</head>
<body>
<main>
  <section class="hero">
    <div class="eyebrow">Quipsly Audio Workbench</div>
    <h1>Transformation lineage ledger</h1>
    <p>This is the “no haunted audio soup” map: every stage that can change the sound, the evidence that proves it, and the knobs that own future repairs.</p>
    <div class="truth">
      <div class="pill"><b>Baseline</b><span>{e(report['baselineId'])}</span></div>
      <div class="pill"><b>Approval</b><span>{e(report['approvalStatus'])}</span></div>
      <div class="pill"><b>Human listen</b><span>{e(bool_text(report['humanListenStillRequired']))}</span></div>
      <div class="pill"><b>Branch render</b><span>{e(bool_text(report['branchRenderReady']))}</span></div>
      <div class="pill"><b>Missing evidence</b><span>{e(report['missingEvidenceCount'])}</span></div>
    </div>
  </section>
  <section class="summary">
    <h2>Summary</h2>
    <ul>{summary_items}</ul>
    <h3>Safe next actions</h3>
    <ul>{actions}</ul>
  </section>
  {''.join(cards)}
</main>
</body>
</html>
"""


def write_open_command(path: Path, html_path: Path) -> None:
    path.write_text(
        "#!/bin/zsh\nset -euo pipefail\nopen " + shell_quote(str(html_path)) + "\n",
        encoding="utf-8",
    )
    path.chmod(0o755)


def register_outputs(manifest_path: Path, report: dict[str, Any], json_path: Path, md_path: Path, html_path: Path, command_path: Path) -> None:
    manifest = read_json(manifest_path)
    outputs = manifest.setdefault("outputs", {})
    outputs["latestAudioTransformationLineageLedger"] = str(json_path)
    outputs["latestAudioTransformationLineageLedgerJson"] = str(json_path)
    outputs["latestAudioTransformationLineageLedgerMarkdown"] = str(md_path)
    outputs["latestAudioTransformationLineageLedgerHtml"] = str(html_path)
    outputs["latestAudioTransformationLineageLedgerOpenCommand"] = str(command_path)
    manifest["audioTransformationLineageLedgerCount"] = int_value(manifest.get("audioTransformationLineageLedgerCount")) + 1
    manifest["audioTransformationLineageLedgerLatestStatus"] = report["lineageStatus"]
    manifest["audioTransformationLineageLedgerStageCount"] = report["stageCount"]
    manifest["audioTransformationLineageLedgerMissingEvidenceCount"] = report["missingEvidenceCount"]
    manifest["audioTransformationLineageLedgerLockedStages"] = report["lockedStages"]
    manifest["audioTransformationLineageLedgerPartialOrWaitingStages"] = report["partialOrWaitingStages"]
    write_json(manifest_path, manifest)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--baseline-dir", type=Path, required=True)
    args = parser.parse_args()

    baseline_dir = resolve_baseline_dir(args.baseline_dir)
    manifest_path = baseline_dir / "manifest.json"
    manifest = read_json(manifest_path)
    generated_at = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    timestamp = datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S")
    baseline_id = str(manifest.get("baselineId") or "audio-baseline")
    slug = safe_slug(baseline_id)

    report = build_ledger(manifest, baseline_dir, generated_at)
    out_dir = baseline_dir / f"audio-transformation-lineage-ledger-{slug}-{timestamp}"
    out_dir.mkdir(parents=True, exist_ok=True)

    json_path = out_dir / "audio-transformation-lineage-ledger.json"
    md_path = out_dir / "audio-transformation-lineage-ledger.md"
    html_path = out_dir / "audio-transformation-lineage-ledger.html"
    command_path = out_dir / "open-audio-transformation-lineage-ledger.command"
    write_json(json_path, report)
    md_path.write_text(render_markdown(report), encoding="utf-8")
    html_path.write_text(render_html(report), encoding="utf-8")
    write_open_command(command_path, html_path)

    stable_json = baseline_dir / "AUDIO_TRANSFORMATION_LINEAGE_LEDGER.json"
    stable_md = baseline_dir / "AUDIO_TRANSFORMATION_LINEAGE_LEDGER.md"
    stable_html = baseline_dir / "AUDIO_TRANSFORMATION_LINEAGE_LEDGER.html"
    stable_command = baseline_dir / "OPEN_AUDIO_TRANSFORMATION_LINEAGE_LEDGER.command"
    write_json(stable_json, report)
    stable_md.write_text(render_markdown(report), encoding="utf-8")
    stable_html.write_text(render_html(report), encoding="utf-8")
    write_open_command(stable_command, stable_html)

    register_outputs(manifest_path, report, stable_json, stable_md, stable_html, stable_command)
    print(json.dumps({
        "baselineId": report["baselineId"],
        "lineageStatus": report["lineageStatus"],
        "stageCount": report["stageCount"],
        "missingEvidenceCount": report["missingEvidenceCount"],
        "stableHtml": str(stable_html),
        "versionedHtml": str(html_path),
    }, indent=2, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
