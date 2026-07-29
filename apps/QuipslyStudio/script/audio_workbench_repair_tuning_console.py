#!/usr/bin/env python3
"""Generate a repair/tuning console for the current audio workbench baseline.

This is not an approval tool and not a renderer. It turns common human-listen
failure symptoms into stage-specific repair paths so audio work stays
inspectable: what sounds wrong, which stage owns it, which evidence to open,
which knobs are safe to adjust, and which shortcuts are forbidden.
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
        for key in ("path", "markdownPath", "htmlPath", "openCommand", "playlistPath"):
            path = value.get(key)
            if isinstance(path, str) and path:
                return path
    return None


def load_report(outputs: dict[str, Any], key: str) -> dict[str, Any]:
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


def artifact(outputs: dict[str, Any], key: str, label: str) -> dict[str, Any]:
    path = output_path(outputs.get(key))
    exists = bool(path) and Path(path).exists()
    return {
        "key": key,
        "label": label,
        "path": path,
        "exists": exists,
        "sizeBytes": Path(path).stat().st_size if exists else None,
    }


def make_symptom(
    *,
    symptom_id: str,
    title: str,
    stage_owner: str,
    what_it_sounds_like: str,
    evidence: list[dict[str, Any]],
    tuning_knobs: list[str],
    safe_next_action: str,
    forbidden_shortcut: str,
    proof_window_source: str,
    dxrevive_use: str,
    requires_human_failure: bool,
    branch_locked_until: str,
) -> dict[str, Any]:
    return {
        "id": symptom_id,
        "title": title,
        "stageOwner": stage_owner,
        "whatItSoundsLike": what_it_sounds_like,
        "evidenceArtifacts": evidence,
        "missingEvidenceCount": sum(1 for item in evidence if not item["exists"]),
        "tuningKnobs": tuning_knobs,
        "safeNextAction": safe_next_action,
        "forbiddenShortcut": forbidden_shortcut,
        "proofWindowSource": proof_window_source,
        "dxReviveUse": dxrevive_use,
        "requiresHumanFailureBeforeRealRepair": requires_human_failure,
        "branchLockedUntil": branch_locked_until,
    }


def build_console(manifest: dict[str, Any], baseline_dir: Path, generated_at: str) -> dict[str, Any]:
    outputs = manifest.get("outputs") or {}
    approval_status = manifest.get("approvalStatus")
    package_ready = bool(manifest.get("packageReadyForHumanListen"))
    branch_inheritance_ready = bool(manifest.get("branchInheritanceReady"))
    branch_render_ready = bool(manifest.get("branchRenderReady"))

    source_balance = load_report(outputs, "latestAudioMasterSourceBalanceAudit")
    bleed_gap = load_report(outputs, "latestSpeakerBleedGapProofAudit")
    dx_validation = load_report(outputs, "latestDxReviveBounceValidation")
    repair_workorder = load_report(outputs, "latestAudioSourceBalanceRepairWorkorder")

    common_branch_lock = "real human listen approval recorded for this exact baseline"
    symptoms = [
        make_symptom(
            symptom_id="homer-low-or-missing",
            title="Homer is missing, too low, or disappears under Charlie",
            stage_owner="mix/master plus source-aware cleanup",
            what_it_sounds_like="The master feels like mostly Charlie, or Homer's contribution drops out even when his source is active.",
            evidence=[
                artifact(outputs, "latestAudioMasterSourceBalanceAuditMarkdown", "master/source balance audit"),
                artifact(outputs, "latestAudioSourceBalanceListenCompanionMarkdown", "source-balance listen companion"),
                artifact(outputs, "latestAudioSourceBalanceRepairWorkorderMarkdown", "source-balance repair workorder"),
                artifact(outputs, "latestSpeakerCleanupProofPackHtml", "speaker cleanup A/B proof pack"),
            ],
            tuning_knobs=[
                "Homer contribution threshold before gating",
                "Homer stem gain before mix bus",
                "Charlie duck depth while Homer is primary",
                "crossfade/release around Homer starts and stops",
                "source-balance proof pair selection for the failing window",
            ],
            safe_next_action="Open the source-balance listen companion, confirm the failing window, then use the source-balance repair workorder for a focused v007 proof candidate.",
            forbidden_shortcut="Do not boost the entire stereo master just to make Homer louder; that raises bleed, noise, and Charlie too.",
            proof_window_source="source-balance proof pairs plus speaker cleanup proof pack",
            dxrevive_use="Usually not first. Use dxRevive only if Homer's isolated stem is objectively damaged after level and gating are fixed.",
            requires_human_failure=True,
            branch_locked_until=common_branch_lock,
        ),
        make_symptom(
            symptom_id="charlie-echo-under-homer",
            title="Charlie call echo remains while Homer is speaking",
            stage_owner="speaker activity map plus source-aware cleanup",
            what_it_sounds_like="Homer sounds doubled, phasey, or shadowed because Charlie's recording still contains Homer from the call.",
            evidence=[
                artifact(outputs, "latestSpeakerBleedGapProofAuditMarkdown", "speaker bleed/gap proof audit"),
                artifact(outputs, "latestSpeakerCleanupListenMapMarkdown", "speaker cleanup listen map"),
                artifact(outputs, "latestSpeakerCleanupProofPackHtml", "speaker cleanup A/B proof pack"),
                artifact(outputs, "latestBleedRepairWorkorderMarkdown", "bleed repair workorder"),
            ],
            tuning_knobs=[
                "Charlie-under-Homer gate threshold",
                "Charlie-under-Homer duck amount",
                "release smoothing so reactions are preserved",
                "minimum reaction length before Charlie is retained",
                "per-window exception for real overlap or laughter",
            ],
            safe_next_action="Use the cleanup proof pack to compare raw Charlie, gated Charlie, mixed proof, and master at the same window; repair only the confirmed failing window.",
            forbidden_shortcut="Do not mute Charlie globally whenever Homer speaks; that clips laughs and real conversational overlap.",
            proof_window_source="speaker bleed/gap audit focus windows",
            dxrevive_use="Not first. Restoration can make echo prettier instead of removing it; fix source contribution first.",
            requires_human_failure=True,
            branch_locked_until=common_branch_lock,
        ),
        make_symptom(
            symptom_id="homer-park-noise-under-charlie",
            title="Homer's park noise or background voices remain under Charlie",
            stage_owner="source-aware cleanup, then restoration lane if needed",
            what_it_sounds_like="Outdoor ambience, handling noise, or background speech rides underneath Charlie's cleaner mic.",
            evidence=[
                artifact(outputs, "latestSpeakerBleedGapProofAuditMarkdown", "speaker bleed/gap proof audit"),
                artifact(outputs, "latestSpeakerCleanupProofPackHtml", "speaker cleanup A/B proof pack"),
                artifact(outputs, "latestDxReviveManualBouncePacketMarkdown", "dxRevive manual bounce packet"),
                artifact(outputs, "latestDxReviveProofCandidatePlannerMarkdown", "dxRevive proof candidate planner"),
            ],
            tuning_knobs=[
                "Homer-under-Charlie duck depth",
                "Homer ambience hold/release",
                "noise floor threshold on the Homer derived stem",
                "restoration intensity on duplicated Homer stem only",
                "A/B proof duration before promoting restoration",
            ],
            safe_next_action="First reduce the Homer contribution only where Charlie is primary; if the remaining Homer stem still sounds rough when Homer speaks, prepare a dxRevive proof candidate.",
            forbidden_shortcut="Do not run the final stereo mix through restoration to hide park noise; that can damage both voices and hide what changed.",
            proof_window_source="speaker cleanup listen map and dxRevive proof candidate planner",
            dxrevive_use="Appropriate on duplicated Homer stems after source-aware gating/ducking is verified.",
            requires_human_failure=True,
            branch_locked_until=common_branch_lock,
        ),
        make_symptom(
            symptom_id="robotic-gating-or-clipped-reactions",
            title="Gating sounds robotic or clips laughter/reactions",
            stage_owner="speaker activity map and cleanup envelope shaping",
            what_it_sounds_like="Words start late, syllables end abruptly, laughs vanish, or the room tone pumps unnaturally.",
            evidence=[
                artifact(outputs, "latestAudioSpeakerActivityReviewBoardHtml", "speaker activity review board"),
                artifact(outputs, "latestSpeakerCleanupListenMapMarkdown", "speaker cleanup listen map"),
                artifact(outputs, "latestAudioMasterSmoothnessAuditMarkdown", "master smoothness audit"),
                artifact(outputs, "latestAudioListenPriorityReviewReelMarkdown", "listen-priority review reel"),
            ],
            tuning_knobs=[
                "gate attack and release",
                "minimum retained reaction length",
                "crossfade duration around speaker changes",
                "overlap-preservation rule",
                "low-confidence windows routed to human proof instead of automatic gating",
            ],
            safe_next_action="Tune the envelope on the smallest failing proof window and compare current master vs candidate before touching the full baseline.",
            forbidden_shortcut="Do not lower thresholds until every noise becomes speech; that defeats the cleanup and hides the real issue.",
            proof_window_source="listen-priority review reel plus cleanup proof pack",
            dxrevive_use="Usually unrelated. If a voice is damaged by gating, fix the gate before restoration.",
            requires_human_failure=True,
            branch_locked_until=common_branch_lock,
        ),
        make_symptom(
            symptom_id="restoration-fake-or-shiny",
            title="Restoration sounds fake, shiny, watery, or over-processed",
            stage_owner="restoration lane",
            what_it_sounds_like="The voice is intelligible but uncanny: metallic consonants, smeared room tone, or AI-cleaned harshness.",
            evidence=[
                artifact(outputs, "latestDxReviveManualBouncePacketMarkdown", "dxRevive manual bounce packet"),
                artifact(outputs, "latestDxReviveBounceValidationMarkdown", "dxRevive bounce validation"),
                artifact(outputs, "latestDxReviveProofCandidatePlannerMarkdown", "dxRevive proof candidate planner"),
                artifact(outputs, "latestDxReviveProofCandidatePlannerSmokeMarkdown", "dxRevive proof candidate planner smoke"),
            ],
            tuning_knobs=[
                "restoration strength",
                "which derived stem gets restored",
                "blend amount between clean source-aware stem and restored stem",
                "duration/sample-rate/channel validation before A/B",
                "proof-only promotion until human approval",
            ],
            safe_next_action="Keep restoration as an A/B proof candidate until human listening prefers it over the source-aware cleanup version.",
            forbidden_shortcut="Do not silently replace the approved stem with a returned restoration bounce just because validation passed.",
            proof_window_source="dxRevive proof candidate planner and proof-window A/B snippets",
            dxrevive_use="Central, but only on duplicated derived stems with explicit validation and listen proof.",
            requires_human_failure=True,
            branch_locked_until=common_branch_lock,
        ),
        make_symptom(
            symptom_id="long-silence-or-structural-gap",
            title="Long silence or a structural gap is present in the spine",
            stage_owner="sync/edit layer, not source cleanup",
            what_it_sounds_like="The audio is technically clean, but the show has dead air, setup pauses, or a place that should be skipped in the episode edit.",
            evidence=[
                artifact(outputs, "latestAudioMasterVisualOverviewMarkdown", "audio master visual overview"),
                artifact(outputs, "latestAudioMasterSmoothnessAuditMarkdown", "master smoothness audit"),
                artifact(outputs, "latestEditorMarkerPacketMarkdown", "editor marker packet"),
                artifact(outputs, "branchRenderPreflightMarkdown", "branch render preflight"),
            ],
            tuning_knobs=[
                "episode edit SHOW/SKIP decision",
                "branch duration target",
                "silence marker handoff",
                "proof-only branch render window",
                "not an audio gate threshold unless source noise is the real problem",
            ],
            safe_next_action="Keep the conformed audio spine intact; route the silence to edit-branch decisions or marker notes instead of destructively deleting it from the baseline.",
            forbidden_shortcut="Do not shorten the clean audio spine to remove silence; that breaks sync inheritance for branches and shorts.",
            proof_window_source="visual overview and editor marker packet",
            dxrevive_use="Not useful; this is an edit decision unless the silence contains bad noise.",
            requires_human_failure=False,
            branch_locked_until=common_branch_lock,
        ),
        make_symptom(
            symptom_id="master-harsh-compressed-or-unbalanced",
            title="Master is harsh, fatiguing, too compressed, or uneven",
            stage_owner="mix/master/loudness",
            what_it_sounds_like="The spine is intelligible but tiring, too hot, boomy, brittle, or inconsistent between speakers.",
            evidence=[
                artifact(outputs, "qualityReportMarkdown", "QC report"),
                artifact(outputs, "latestAudioMasterSourceBalanceAuditMarkdown", "master/source balance audit"),
                artifact(outputs, "latestAudioMasterSmoothnessAuditMarkdown", "master smoothness audit"),
                artifact(outputs, "latestAudioListenPrioritySnippetPackAuditMarkdown", "listen-priority snippet-pack audit"),
            ],
            tuning_knobs=[
                "per-speaker stem gain before bus compression",
                "compressor ratio/attack/release",
                "limiter ceiling and drive",
                "loudness target",
                "speaker-specific EQ before master bus",
            ],
            safe_next_action="Adjust mix/master parameters after source cleanup is stable; render a new timestamped candidate and compare priority snippets.",
            forbidden_shortcut="Do not use loudness success as approval. A master can hit -16 LUFS and still sound wrong.",
            proof_window_source="QC report plus listen-priority snippets",
            dxrevive_use="Only if harshness comes from a damaged source stem, not from bus compression or limiter settings.",
            requires_human_failure=True,
            branch_locked_until=common_branch_lock,
        ),
        make_symptom(
            symptom_id="wrong-source-or-bad-sync",
            title="A source is wrong, missing, or out of sync",
            stage_owner="raw source layer and sync layer",
            what_it_sounds_like="The right voice appears at the wrong time, lips do not match, or the master includes the wrong take/source.",
            evidence=[
                artifact(outputs, "sourceActivityMarkdown", "source activity report"),
                artifact(outputs, "latestEditorHandoffPacketMarkdown", "editor handoff packet"),
                artifact(outputs, "latestEditorMarkerPacketMarkdown", "editor marker packet"),
                artifact(outputs, "latestAudioSpineListenSanityCheckMarkdown", "audio spine listen sanity check"),
            ],
            tuning_knobs=[
                "source role assignment",
                "sync offset",
                "parked vs production source state",
                "duration tolerance",
                "spine sanity proof windows",
            ],
            safe_next_action="Fix the source/sync baseline before doing cleanup, restoration, or branch rendering. Bad sync poisons everything downstream.",
            forbidden_shortcut="Do not repair bad sync with audio cleanup or by nudging only one rendered edit branch.",
            proof_window_source="editor handoff packet and spine sanity check",
            dxrevive_use="Not applicable until the source is correct and synced.",
            requires_human_failure=False,
            branch_locked_until=common_branch_lock,
        ),
        make_symptom(
            symptom_id="branch-render-before-approval",
            title="A long-form or shorts branch wants to render before audio approval",
            stage_owner="human listen gate and branch inheritance/export",
            what_it_sounds_like="The edit is ready, but the audio baseline has not been approved for branch inheritance.",
            evidence=[
                artifact(outputs, "latestBranchInheritanceGateMarkdown", "branch inheritance gate"),
                artifact(outputs, "branchRenderPreflightMarkdown", "branch render preflight"),
                artifact(outputs, "latestApprovedBranchRenderExecutorMarkdown", "approved branch-render executor"),
                artifact(outputs, "latestAudioReviewGateAuditMarkdown", "audio review gate audit"),
            ],
            tuning_knobs=[
                "human listen decision",
                "proof-only override for tiny validation renders",
                "branch inheritance gate",
                "render target duration",
                "receipt/proof labeling",
            ],
            safe_next_action="Use proof-only renders only for validation. Keep publication-grade branches locked until the real listen decision approves the exact baseline.",
            forbidden_shortcut="Do not label proof-only branch renders as publishable or use them as platform-ready assets.",
            proof_window_source="branch gate, branch preflight, and audio review gate audit",
            dxrevive_use="Not relevant unless the baseline itself fails listen and a repair candidate uses restoration.",
            requires_human_failure=False,
            branch_locked_until=common_branch_lock,
        ),
    ]

    all_artifacts = [artifact for symptom in symptoms for artifact in symptom["evidenceArtifacts"]]
    missing_evidence_count = sum(1 for item in all_artifacts if not item["exists"])
    unique_missing_keys = sorted({item["key"] for item in all_artifacts if not item["exists"]})

    return {
        "schema": "quipsly.audio-workbench.repair-tuning-console.v1",
        "generatedAt": generated_at,
        "baselineDir": str(baseline_dir),
        "baselineId": manifest.get("baselineId"),
        "approvalStatus": approval_status,
        "packageReadyForHumanListen": package_ready,
        "branchInheritanceReady": branch_inheritance_ready,
        "branchRenderReady": branch_render_ready,
        "humanListenStillRequired": approval_status == "machine-candidate-needs-human-listen-proof",
        "originalMediaMutated": False,
        "renderAttempted": False,
        "approvalStateChanged": False,
        "branchStateChanged": False,
        "sourceBalanceWarningCount": source_balance.get("warningCount") or manifest.get("audioMasterSourceBalanceWarningCount"),
        "speakerBleedGapFocusWindowCount": bleed_gap.get("focusWindowCount") or manifest.get("speakerBleedGapProofAuditFocusWindowCount"),
        "sourceBalanceRepairActionCount": repair_workorder.get("repairActionCount") or manifest.get("audioSourceBalanceRepairActionCount"),
        "dxReviveValidationStatus": dx_validation.get("status") or "not-available-or-not-needed",
        "symptomCount": len(symptoms),
        "missingEvidenceCount": missing_evidence_count,
        "uniqueMissingEvidenceKeys": unique_missing_keys,
        "symptoms": symptoms,
        "nextSafestAction": "Use this console after human listening identifies a problem. Pick the symptom, open its evidence, tune the owning stage, and render only a scoped timestamped proof candidate unless the exact baseline is approved.",
    }


def render_markdown(console: dict[str, Any]) -> str:
    lines = [
        f"# Audio Workbench Repair/Tuning Console: {console['baselineId']}",
        "",
        f"Generated: `{console['generatedAt']}`",
        "",
        "This console converts listen failures into scoped audio-workbench repairs. It does not approve audio, fail audio, render branches, upload files, or mutate original media.",
        "",
        "## Current truth",
        "",
        f"- Approval status: `{console['approvalStatus']}`",
        f"- Human listen still required: `{str(console['humanListenStillRequired']).lower()}`",
        f"- Package ready for human listen: `{str(console['packageReadyForHumanListen']).lower()}`",
        f"- Branch inheritance ready: `{str(console['branchInheritanceReady']).lower()}`",
        f"- Branch render ready: `{str(console['branchRenderReady']).lower()}`",
        f"- Render attempted by this console: `{str(console['renderAttempted']).lower()}`",
        f"- Original media mutated: `{str(console['originalMediaMutated']).lower()}`",
        f"- Symptoms mapped: `{console['symptomCount']}`",
        f"- Missing evidence links: `{console['missingEvidenceCount']}`",
        "",
        "## Symptom router",
        "",
        "| Symptom | Stage owner | Safe next action | Forbidden shortcut |",
        "|---|---|---|---|",
    ]
    for symptom in console["symptoms"]:
        lines.append(
            f"| {symptom['title']} | `{symptom['stageOwner']}` | {symptom['safeNextAction']} | {symptom['forbiddenShortcut']} |"
        )
    lines.extend(["", "## Detail", ""])
    for symptom in console["symptoms"]:
        lines.extend(
            [
                f"### {symptom['title']}",
                "",
                f"- ID: `{symptom['id']}`",
                f"- Stage owner: `{symptom['stageOwner']}`",
                f"- What it sounds like: {symptom['whatItSoundsLike']}",
                f"- Proof-window source: {symptom['proofWindowSource']}",
                f"- dxRevive use: {symptom['dxReviveUse']}",
                f"- Requires human failure before real repair: `{str(symptom['requiresHumanFailureBeforeRealRepair']).lower()}`",
                f"- Branch locked until: {symptom['branchLockedUntil']}",
                "",
                "Tuning knobs:",
                "",
            ]
        )
        lines.extend(f"- {knob}" for knob in symptom["tuningKnobs"])
        lines.extend(["", "Evidence:", ""])
        for item in symptom["evidenceArtifacts"]:
            status = "present" if item["exists"] else "missing"
            lines.append(f"- {item['label']}: `{status}` `{item['path'] or item['key']}`")
        lines.extend(["", f"Safe next action: {symptom['safeNextAction']}", ""])
    lines.extend(["## Next safest action", "", console["nextSafestAction"], ""])
    return "\n".join(lines)


def render_html(console: dict[str, Any]) -> str:
    cards = []
    for symptom in console["symptoms"]:
        evidence_items = "".join(
            f"<li><span class='{ 'ok' if item['exists'] else 'missing' }'>{html.escape('present' if item['exists'] else 'missing')}</span> "
            f"<code>{html.escape(item['label'])}</code><br><small>{html.escape(item['path'] or item['key'])}</small></li>"
            for item in symptom["evidenceArtifacts"]
        )
        knob_items = "".join(f"<li>{html.escape(knob)}</li>" for knob in symptom["tuningKnobs"])
        cards.append(
            f"""
            <article class=\"card\">
              <div class=\"card-top\"><span class=\"stage\">{html.escape(symptom['stageOwner'])}</span><span class=\"gate\">{'human failure first' if symptom['requiresHumanFailureBeforeRealRepair'] else 'safe to plan now'}</span></div>
              <h2>{html.escape(symptom['title'])}</h2>
              <p class=\"sounds\">{html.escape(symptom['whatItSoundsLike'])}</p>
              <h3>Safe move</h3>
              <p>{html.escape(symptom['safeNextAction'])}</p>
              <h3>Forbidden shortcut</h3>
              <p class=\"danger\">{html.escape(symptom['forbiddenShortcut'])}</p>
              <details open><summary>Tuning knobs</summary><ul>{knob_items}</ul></details>
              <details><summary>Evidence</summary><ul>{evidence_items}</ul></details>
              <p class=\"tiny\">dxRevive: {html.escape(symptom['dxReviveUse'])}</p>
            </article>
            """
        )
    return f"""<!doctype html>
<html lang=\"en\">
<head>
  <meta charset=\"utf-8\">
  <title>Audio Repair/Tuning Console</title>
  <style>
    :root {{ color-scheme: dark; --bg:#121713; --panel:#1b231d; --leaf:#8fbe71; --moss:#456d42; --honey:#e8be47; --clay:#d06b47; --text:#f4f1e8; --muted:#b9b19d; }}
    body {{ margin:0; font:15px/1.45 -apple-system, BlinkMacSystemFont, "Avenir Next", sans-serif; background:radial-gradient(circle at 20% 0%, #233527, var(--bg) 38%); color:var(--text); }}
    header {{ padding:32px 40px 20px; border-bottom:1px solid rgba(232,190,71,.25); position:sticky; top:0; background:rgba(18,23,19,.92); backdrop-filter:blur(16px); z-index:2; }}
    h1 {{ margin:0 0 8px; font-size:31px; letter-spacing:.02em; }}
    .truth {{ display:flex; flex-wrap:wrap; gap:10px; margin-top:18px; }}
    .pill {{ border:1px solid rgba(232,190,71,.28); background:rgba(232,190,71,.11); padding:8px 10px; border-radius:999px; color:#f8e7a4; }}
    main {{ padding:28px 40px 48px; display:grid; grid-template-columns:repeat(auto-fit, minmax(360px, 1fr)); gap:18px; }}
    .card {{ background:linear-gradient(145deg, rgba(27,35,29,.97), rgba(30,27,21,.94)); border:1px solid rgba(143,190,113,.22); border-radius:22px; padding:20px; box-shadow:0 18px 60px rgba(0,0,0,.25); }}
    .card-top {{ display:flex; justify-content:space-between; gap:12px; align-items:center; }}
    .stage, .gate {{ font-size:11px; letter-spacing:.12em; text-transform:uppercase; padding:5px 8px; border-radius:999px; }}
    .stage {{ background:rgba(143,190,113,.14); color:#bff09a; }}
    .gate {{ background:rgba(232,190,71,.14); color:#f3d779; }}
    h2 {{ margin:14px 0 10px; font-size:21px; }} h3 {{ margin:16px 0 6px; font-size:13px; color:#f3d779; text-transform:uppercase; letter-spacing:.12em; }}
    .sounds {{ color:var(--muted); }} .danger {{ color:#ffb09a; }} .tiny, small {{ color:var(--muted); font-size:12px; }}
    code {{ color:#d9f7c4; word-break:break-all; }} li {{ margin:7px 0; }} summary {{ cursor:pointer; color:#d9f7c4; }}
    .ok {{ color:#98e66c; font-weight:700; }} .missing {{ color:#ff9278; font-weight:700; }}
  </style>
</head>
<body>
<header>
  <h1>Audio Repair/Tuning Console</h1>
  <div>{html.escape(str(console['baselineId']))}</div>
  <div class=\"truth\">
    <span class=\"pill\">approval: {html.escape(str(console['approvalStatus']))}</span>
    <span class=\"pill\">human listen required: {str(console['humanListenStillRequired']).lower()}</span>
    <span class=\"pill\">branch inheritance: {str(console['branchInheritanceReady']).lower()}</span>
    <span class=\"pill\">branch render: {str(console['branchRenderReady']).lower()}</span>
    <span class=\"pill\">symptoms: {console['symptomCount']}</span>
    <span class=\"pill\">missing evidence: {console['missingEvidenceCount']}</span>
  </div>
</header>
<main>{''.join(cards)}</main>
</body>
</html>
"""


def write_open_command(path: Path, target: Path) -> None:
    path.write_text(f"#!/bin/zsh\nopen {shell_quote(str(target))}\n", encoding="utf-8")
    os.chmod(path, 0o755)


def register_outputs(manifest: dict[str, Any], report: dict[str, Any], json_path: Path, md_path: Path, html_path: Path, open_command: Path) -> None:
    outputs = manifest.setdefault("outputs", {})
    outputs["latestAudioWorkbenchRepairTuningConsole"] = str(json_path)
    outputs["latestAudioWorkbenchRepairTuningConsoleMarkdown"] = str(md_path)
    outputs["latestAudioWorkbenchRepairTuningConsoleHtml"] = str(html_path)
    outputs["latestAudioWorkbenchRepairTuningConsoleOpenCommand"] = str(open_command)
    history = outputs.setdefault("audioWorkbenchRepairTuningConsoleHistory", [])
    if isinstance(history, list):
        history.append(str(json_path))
    manifest["audioWorkbenchRepairTuningConsoleCount"] = int(manifest.get("audioWorkbenchRepairTuningConsoleCount") or 0) + 1
    manifest["audioWorkbenchRepairTuningConsoleSymptomCount"] = report["symptomCount"]
    manifest["audioWorkbenchRepairTuningConsoleMissingEvidenceCount"] = report["missingEvidenceCount"]
    manifest["audioWorkbenchRepairTuningConsoleApprovalStateChanged"] = False
    manifest["audioWorkbenchRepairTuningConsoleBranchStateChanged"] = False
    manifest["audioWorkbenchRepairTuningConsoleRenderAttempted"] = False
    manifest["audioWorkbenchRepairTuningConsoleOriginalMediaMutated"] = False


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--baseline-dir", required=True, type=Path)
    args = parser.parse_args()

    baseline_dir = resolve_baseline_dir(args.baseline_dir)
    manifest_path = baseline_dir / "manifest.json"
    manifest = read_json(manifest_path)
    baseline_id = str(manifest.get("baselineId") or "audio-baseline")
    slug = safe_slug(baseline_id.replace("episode-4-conformed-production-baseline-", ""))
    generated_at = datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S")

    report = build_console(manifest, baseline_dir, generated_at)
    out_dir = baseline_dir / f"audio-workbench-repair-tuning-console-{slug}-{generated_at}"
    out_dir.mkdir(parents=True, exist_ok=True)
    json_path = out_dir / "repair-tuning-console.json"
    md_path = out_dir / f"audio-workbench-repair-tuning-console-{slug}-{generated_at}.md"
    html_path = out_dir / "repair-tuning-console.html"
    open_command = out_dir / "open-repair-tuning-console.command"

    write_json(json_path, report)
    md_path.write_text(render_markdown(report), encoding="utf-8")
    html_path.write_text(render_html(report), encoding="utf-8")
    write_open_command(open_command, html_path)
    register_outputs(manifest, report, json_path, md_path, html_path, open_command)
    write_json(manifest_path, manifest)

    print(f"Repair/tuning console: {md_path}")
    print(f"Repair/tuning console HTML: {html_path}")
    print(f"Symptoms mapped: {report['symptomCount']}")
    print(f"Missing evidence links: {report['missingEvidenceCount']}")
    print("Approval state changed: false")
    print("Branch state changed: false")
    print("Render attempted: false")
    print("Original media mutated: false")


if __name__ == "__main__":
    main()
