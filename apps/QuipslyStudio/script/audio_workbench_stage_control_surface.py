#!/usr/bin/env python3
"""Build a studio-style stage control surface for an audio baseline.

This is a visibility surface, not an approval tool. It gathers the current
Episode audio workbench into explicit stages: raw sources, sync, speaker
activity, cleanup, restoration, mix/master, proof review, human listen gate, and
branch inheritance. Each stage names its inputs, evidence, current status,
adjustable controls, failure symptoms, and next safe action.

It does not approve audio, fail audio, render media, upload files, or mutate
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
        for key in ("path", "markdownPath", "htmlPath", "openCommand"):
            path = value.get(key)
            if isinstance(path, str) and path:
                return path
    return None


def artifact(outputs: dict[str, Any], key: str, label: str | None = None) -> dict[str, Any]:
    path = output_path(outputs.get(key))
    exists = bool(path) and Path(path).exists()
    return {
        "key": key,
        "label": label or key,
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


def bool_status(value: Any) -> str:
    return "yes" if bool(value) else "no"


def load_report(outputs: dict[str, Any], key: str) -> dict[str, Any]:
    path = output_path(outputs.get(key))
    if not path or not Path(path).exists() or Path(path).suffix.lower() != ".json":
        return {}
    try:
        return read_json(Path(path))
    except json.JSONDecodeError:
        return {}


def status_from_artifacts(artifacts: list[dict[str, Any]], *, locked: bool = False, human_gate: bool = False) -> str:
    if locked:
        return "locked-waiting-for-human-listen"
    if human_gate:
        return "ready-for-human-listen"
    if all(item["exists"] for item in artifacts):
        return "evidence-present"
    if any(item["exists"] for item in artifacts):
        return "partial-evidence"
    return "missing-evidence"


def stage(
    *,
    stage_id: str,
    name: str,
    purpose: str,
    status: str,
    controls: list[str],
    artifacts: list[dict[str, Any]],
    risks: list[str],
    next_action: str,
    machine_checks: list[str],
    human_checks: list[str],
) -> dict[str, Any]:
    return {
        "id": stage_id,
        "name": name,
        "purpose": purpose,
        "status": status,
        "controls": controls,
        "artifacts": artifacts,
        "artifactCount": len(artifacts),
        "missingArtifactCount": sum(1 for item in artifacts if not item["exists"]),
        "risks": risks,
        "nextSafeAction": next_action,
        "machineChecks": machine_checks,
        "humanChecks": human_checks,
    }


def build_surface(manifest: dict[str, Any], baseline_dir: Path, generated_at: str) -> dict[str, Any]:
    outputs = manifest.get("outputs") or {}
    approval_status = manifest.get("approvalStatus")
    branch_inheritance_ready = bool(manifest.get("branchInheritanceReady"))
    branch_render_ready = bool(manifest.get("branchRenderReady"))
    package_ready = bool(manifest.get("packageReadyForHumanListen"))
    raw_sources = manifest.get("rawSources") if isinstance(manifest.get("rawSources"), list) else []
    source_activity = load_report(outputs, "sourceActivity")
    source_balance = load_report(outputs, "latestAudioMasterSourceBalanceAudit")
    spine_sanity = load_report(outputs, "latestAudioSpineListenSanityCheck")
    dx_validation = load_report(outputs, "latestDxReviveBounceValidation")
    goal_audit = load_report(outputs, "latestAudioGoalCompletionAudit")

    stages = [
        stage(
            stage_id="raw-source-layer",
            name="Raw Source Layer",
            purpose="Name every original audio/video/reference source while keeping it read-only.",
            status="source-inventory-present" if raw_sources else "source-inventory-missing",
            controls=["source role", "production vs evidence-only", "missing-media state", "raw path replacement for future episodes"],
            artifacts=[artifact(outputs, "sourceActivityMarkdown", "source activity report")],
            risks=["wrong file matched to the episode", "scratch/camera audio accidentally promoted", "original media mutation"],
            next_action="Keep production sources explicit; park uncertain sources instead of forcing them into the mix.",
            machine_checks=[f"raw source count: {len(raw_sources)}", f"original media mutated: {bool_status(manifest.get('originalMediaMutated'))}"],
            human_checks=["Confirm the named source list matches the episode."],
        ),
        stage(
            stage_id="sync-layer",
            name="Sync Layer",
            purpose="Align every usable source to one sequence-time spine before cleanup or editing.",
            status="conformed-baseline-present" if manifest.get("baselineId") else "needs-sync-baseline",
            controls=["sequenceStartSeconds", "sourceStartSeconds", "known breaks", "parked sources", "duration tolerance"],
            artifacts=[artifact(outputs, "latestEditorHandoffPacketMarkdown", "editor handoff packet"), artifact(outputs, "latestEditorMarkerPacketMarkdown", "editor marker packet")],
            risks=["all audio playing over itself", "stale Premiere reference", "zero-duration metadata", "timeline length drift"],
            next_action="Do not branch-edit from sources until the conformed baseline and duration evidence agree.",
            machine_checks=[f"baseline id: {manifest.get('baselineId')}", f"duration seconds: {(manifest.get('masterWav') or {}).get('duration') if isinstance(manifest.get('masterWav'), dict) else 'see probe'}"],
            human_checks=["Spot-check obvious lipsync/response moments before approving the spine."],
        ),
        stage(
            stage_id="speaker-activity-map",
            name="Speaker Activity Map",
            purpose="Detect where Charlie, Homer, reference clips, reactions, gaps, and bleed likely contribute.",
            status=status_from_artifacts([artifact(outputs, "latestAudioSpeakerActivityReviewBoardMarkdown", "speaker activity board"), artifact(outputs, "latestSpeakerBleedGapProofAuditMarkdown", "bleed/gap proof audit")]),
            controls=["speaker threshold", "reaction preservation", "minimum gap", "overlap treatment", "uncertain window flags"],
            artifacts=[artifact(outputs, "latestAudioSpeakerActivityReviewBoardMarkdown", "speaker activity board"), artifact(outputs, "latestAudioSpeakerActivityReviewBoardHtml", "speaker activity board HTML"), artifact(outputs, "latestSpeakerBleedGapProofAuditMarkdown", "bleed/gap proof audit")],
            risks=["muting laughter/reactions", "leaving phone-call echo", "gating outdoor ambience too hard"],
            next_action="Use speaker-cleanup proof windows before changing a full master.",
            machine_checks=[f"source activity rows: {source_activity.get('rowCount') or manifest.get('sourceActivityRowCount') or 'unknown'}", f"focus windows: {manifest.get('audioSpeakerActivityReviewBoardFocusWindowCount') or 0}"],
            human_checks=["Listen for clipped consonants, chopped laughs, and missing low-volume reactions."],
        ),
        stage(
            stage_id="source-aware-cleanup",
            name="Source-Aware Cleanup",
            purpose="Duck, gate, or retain each duplicated treatment stem based on speaker contribution instead of muting the full mix blindly.",
            status=status_from_artifacts([artifact(outputs, "latestSpeakerCleanupProofPackMarkdown", "speaker cleanup proof pack"), artifact(outputs, "latestSpeakerCleanupListenMapMarkdown", "speaker cleanup listen map")], human_gate=True),
            controls=["gate threshold", "release", "duck depth", "crossfade smoothing", "speaker-specific preservation"],
            artifacts=[artifact(outputs, "latestSpeakerCleanupProofPackMarkdown", "speaker cleanup proof pack"), artifact(outputs, "latestSpeakerCleanupProofPackHtml", "speaker cleanup proof pack HTML"), artifact(outputs, "latestSpeakerCleanupProofPackAuditMarkdown", "speaker cleanup proof pack audit"), artifact(outputs, "latestSpeakerCleanupListenMapMarkdown", "speaker cleanup listen map")],
            risks=["robotic gating", "lost Homer", "remaining Charlie call echo", "park voices under Charlie"],
            next_action="If a proof window sounds wrong, repair only that scoped treatment stage and render a timestamped proof candidate.",
            machine_checks=[f"cleanup snippets rendered: {manifest.get('speakerCleanupProofPackRenderedSnippetCount') or manifest.get('speakerCleanupProofPackSnippetCount') or 'unknown'}", f"spine sanity passed: {bool_status(spine_sanity.get('passed')) if spine_sanity else 'unknown'}"],
            human_checks=["Compare raw, gated contribution, source-aware mix, and mastered spine for the same windows."],
        ),
        stage(
            stage_id="restoration-lane",
            name="Restoration Lane",
            purpose="Use dxRevive/Logic/iZotope-style restoration only on duplicated derived stems, never as an uninspected post-mix spell.",
            status=dx_validation.get("status") or status_from_artifacts([artifact(outputs, "latestDxReviveManualBouncePacketMarkdown", "dxRevive manual bounce packet"), artifact(outputs, "latestDxReviveBounceValidationMarkdown", "dxRevive bounce validation")]),
            controls=["stem selection", "restoration intensity", "manual bounce return folder", "duration/sample-rate/channel validation", "proof candidate comparison"],
            artifacts=[artifact(outputs, "latestDxReviveManualBouncePacketMarkdown", "dxRevive manual bounce packet"), artifact(outputs, "latestDxReviveManualBouncePacketOpenCommand", "dxRevive open command"), artifact(outputs, "latestDxReviveBounceValidationMarkdown", "dxRevive validation"), artifact(outputs, "latestDxReviveBounceValidatorSmokeMarkdown", "dxRevive validator smoke"), artifact(outputs, "latestDxReviveProofCandidatePlannerMarkdown", "dxRevive proof candidate planner")],
            risks=["fake shiny voice", "revived bleed", "duration drift", "restored stem silently replacing approved mix"],
            next_action=dx_validation.get("nextAction") or "Use restoration only when proof listening shows the current source-aware path is insufficient.",
            machine_checks=[f"expected bounces: {dx_validation.get('expectedCount') or 0}", f"validated bounces: {dx_validation.get('validatedCount') or 0}", f"missing bounces: {dx_validation.get('missingCount') or 0}"],
            human_checks=["A/B restored proof candidates against v006 before promoting any restoration behavior."],
        ),
        stage(
            stage_id="mix-master-loudness",
            name="Mix, Master, Loudness",
            purpose="Create a normal stereo WAV/M4A handoff that is useful in Premiere and Quipsly while retaining the evidence trail.",
            status="machine-qc-ready-human-listen-required" if package_ready else "not-ready-for-human-listen",
            controls=["per-speaker balance", "bus compression", "limiter", "integrated LUFS", "true peak", "long-silence advisory"],
            artifacts=[artifact(outputs, "masterWav", "master WAV"), artifact(outputs, "masterM4a", "listening M4A"), artifact(outputs, "qualityReportMarkdown", "QC report"), artifact(outputs, "latestAudioMasterVisualOverviewMarkdown", "visual waveform overview"), artifact(outputs, "latestAudioMasterSmoothnessAuditMarkdown", "smoothness audit"), artifact(outputs, "latestAudioMasterSourceBalanceAuditMarkdown", "master/source balance audit")],
            risks=["Homer too low", "Charlie too hot", "over-compression", "harsh limiter", "dead air treated as failure instead of edit material"],
            next_action="Use the listening M4A/WAV plus proof snippets for human approval; do not unlock branches by loudness alone.",
            machine_checks=[f"source-balance queue coverage: {bool_status(manifest.get('audioSourceBalanceQueueCoverage'))}", f"master/source warnings: {source_balance.get('warningCount') or manifest.get('audioMasterSourceBalanceWarningCount') or 'see audit'}"],
            human_checks=["Listen on headphones and laptop/phone speakers for intelligibility and fatigue."],
        ),
        stage(
            stage_id="human-listen-gate",
            name="Human Listen Gate",
            purpose="Collect actual reviewer decisions before approval, failure, focused proof, branch inheritance, or publication readiness.",
            status="waiting-for-human-listen" if approval_status == "machine-candidate-needs-human-listen-proof" else str(approval_status),
            controls=["pass", "needs repair", "needs focused proof", "review notes import", "decision rehearsal"],
            artifacts=[artifact(outputs, "latestAudioHumanListenControlRoomMarkdown", "human listen control room"), artifact(outputs, "latestAudioHumanListenDecisionBriefMarkdown", "decision brief"), artifact(outputs, "latestHumanListenDecisionRehearsalMarkdown", "decision rehearsal"), artifact(outputs, "latestAudioListenPriorityReviewReelMarkdown", "listen-priority review reel"), artifact(outputs, "latestAudioListenPriorityNotesInboxMarkdown", "notes inbox"), artifact(outputs, "latestAudioListenNotesRepairPlannerMarkdown", "repair planner")],
            risks=["machine approval by accident", "notes from wrong baseline", "repair hidden as success"],
            next_action="Open START_HERE, listen to priority material, export notes, then run the post-human-listen roundtrip.",
            machine_checks=[f"approval status: {approval_status}", f"goal audit counts: {goal_audit.get('statusCounts') or 'unknown'}"],
            human_checks=["Approve only after listening to the actual v006 master and priority snippets."],
        ),
        stage(
            stage_id="branch-inheritance-export",
            name="Branch Inheritance and Export",
            purpose="Let long-form edits and shorts inherit one approved audio spine instead of repeating cleanup.",
            status=status_from_artifacts([artifact(outputs, "latestBranchInheritanceGateMarkdown", "branch inheritance gate"), artifact(outputs, "branchRenderPreflightMarkdown", "branch render preflight")], locked=not branch_inheritance_ready or not branch_render_ready),
            controls=["inherit approved baseline", "render branch", "proof-only override", "duration target", "shorts branch"],
            artifacts=[artifact(outputs, "latestBranchInheritanceGateMarkdown", "branch inheritance gate"), artifact(outputs, "branchRenderPreflightMarkdown", "branch render preflight"), artifact(outputs, "latestBranchRenderProofMarkdown", "branch render proof evidence"), artifact(outputs, "latestApprovedBranchRenderExecutorMarkdown", "approved branch render executor")],
            risks=["rendering against stale audio", "publishing proof-only media", "branch export before listen approval"],
            next_action="Keep locked until human listen approval is recorded; then render versioned branches from v006 or newer.",
            machine_checks=[f"branch inheritance ready: {bool_status(branch_inheritance_ready)}", f"branch render ready: {bool_status(branch_render_ready)}"],
            human_checks=["Confirm branch outputs inherit the approved spine and are not proof-only artifacts."],
        ),
    ]

    return {
        "schema": "quipsly.audio-workbench.stage-control-surface.v1",
        "generatedAt": generated_at,
        "baselineDir": str(baseline_dir),
        "baselineId": manifest.get("baselineId"),
        "approvalStatus": approval_status,
        "packageReadyForHumanListen": package_ready,
        "branchInheritanceReady": branch_inheritance_ready,
        "branchRenderReady": branch_render_ready,
        "originalMediaMutated": False,
        "renderAttempted": False,
        "stageCount": len(stages),
        "missingArtifactCount": sum(stage["missingArtifactCount"] for stage in stages),
        "lockedStageCount": sum(1 for stage in stages if str(stage["status"]).startswith("locked")),
        "humanGateStageCount": sum(1 for stage in stages if "human" in stage["id"] or "human" in stage["status"]),
        "stages": stages,
        "nextSafestAction": "Use this control surface to choose the smallest next stage-specific move. The current v006 spine still needs real human listen approval before branch inheritance or publication-grade renders.",
    }


def render_markdown(surface: dict[str, Any]) -> str:
    lines = [
        f"# Audio Workbench Stage Control Surface: {surface['baselineId']}",
        "",
        f"Generated: `{surface['generatedAt']}`",
        "",
        "This is a stage-by-stage studio console for the current audio baseline. It does not approve audio, fail audio, render branches, publish, upload, or touch original media.",
        "",
        "## Current truth",
        "",
        f"- Approval status: `{surface['approvalStatus']}`",
        f"- Package ready for human listen: `{str(surface['packageReadyForHumanListen']).lower()}`",
        f"- Branch inheritance ready: `{str(surface['branchInheritanceReady']).lower()}`",
        f"- Branch render ready: `{str(surface['branchRenderReady']).lower()}`",
        f"- Original media mutated: `{str(surface['originalMediaMutated']).lower()}`",
        f"- Stages: `{surface['stageCount']}`",
        f"- Missing linked artifacts across stages: `{surface['missingArtifactCount']}`",
        "",
        "## Stage map",
        "",
        "| Stage | Status | Purpose | Next safe action |",
        "|---|---:|---|---|",
    ]
    for item in surface["stages"]:
        lines.append(f"| {item['name']} | `{item['status']}` | {item['purpose']} | {item['nextSafeAction']} |")
    for item in surface["stages"]:
        lines.extend(["", f"## {item['name']}", "", f"Status: `{item['status']}`", "", item["purpose"], "", "### Controls", ""])
        for control in item["controls"]:
            lines.append(f"- {control}")
        lines.extend(["", "### Machine checks", ""])
        for check in item["machineChecks"]:
            lines.append(f"- {check}")
        lines.extend(["", "### Human checks", ""])
        for check in item["humanChecks"]:
            lines.append(f"- {check}")
        lines.extend(["", "### Risks", ""])
        for risk in item["risks"]:
            lines.append(f"- {risk}")
        lines.extend(["", "### Artifacts", "", "| Artifact | Exists | Path |", "|---|---:|---|"])
        for art in item["artifacts"]:
            lines.append(f"| {art['label']} | `{str(art['exists']).lower()}` | `{art['path'] or 'not registered'}` |")
    lines.extend(["", "## Next safest action", "", surface["nextSafestAction"], ""])
    return "\n".join(lines)


def render_html(surface: dict[str, Any]) -> str:
    cards = []
    for item in surface["stages"]:
        artifacts = "".join(
            f"<li class='{ 'ok' if art['exists'] else 'missing' }'><strong>{html.escape(str(art['label']))}</strong><br><code>{html.escape(str(art['path'] or 'not registered'))}</code></li>"
            for art in item["artifacts"]
        )
        controls = "".join(f"<li>{html.escape(control)}</li>" for control in item["controls"])
        machine = "".join(f"<li>{html.escape(check)}</li>" for check in item["machineChecks"])
        human = "".join(f"<li>{html.escape(check)}</li>" for check in item["humanChecks"])
        risks = "".join(f"<li>{html.escape(risk)}</li>" for risk in item["risks"])
        cards.append(
            f"""
            <section class="stage">
              <header><span>{html.escape(item['id'])}</span><h2>{html.escape(item['name'])}</h2><b>{html.escape(item['status'])}</b></header>
              <p>{html.escape(item['purpose'])}</p>
              <div class="grid">
                <div><h3>Controls</h3><ul>{controls}</ul></div>
                <div><h3>Machine checks</h3><ul>{machine}</ul></div>
                <div><h3>Human checks</h3><ul>{human}</ul></div>
                <div><h3>Risks</h3><ul>{risks}</ul></div>
              </div>
              <h3>Next safe action</h3><p>{html.escape(item['nextSafeAction'])}</p>
              <h3>Artifacts</h3><ul class="artifacts">{artifacts}</ul>
            </section>
            """
        )
    return f"""<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>Audio Workbench Stage Control Surface</title>
<style>
:root {{ color-scheme: dark; --bg:#101512; --panel:#172019; --panel2:#202b20; --line:#3d4b37; --gold:#e7c74c; --green:#74d486; --red:#f26d6d; --ink:#f3efe1; --muted:#b5b09f; --blue:#6ec6ff; }}
body {{ margin:0; font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, sans-serif; background: radial-gradient(circle at top left,#24351f,#101512 42%,#070908); color:var(--ink); }}
main {{ width:min(1500px, calc(100vw - 48px)); margin:24px auto 80px; }}
.hero {{ border:1px solid var(--line); background:linear-gradient(135deg,rgba(36,52,30,.92),rgba(20,24,18,.92)); border-radius:28px; padding:28px; box-shadow:0 20px 90px rgba(0,0,0,.35); }}
.kicker {{ color:var(--gold); letter-spacing:.22em; font-weight:800; text-transform:uppercase; font-size:12px; }}
h1 {{ margin:8px 0 10px; font-size:clamp(34px,5vw,76px); line-height:.9; }}
.truth {{ display:flex; flex-wrap:wrap; gap:10px; margin-top:20px; }}
.truth span {{ background:#111814; border:1px solid var(--line); border-radius:999px; padding:10px 14px; color:var(--muted); }}
.truth b {{ color:var(--ink); }}
.stage {{ margin-top:18px; background:rgba(23,32,25,.92); border:1px solid var(--line); border-radius:24px; padding:22px; }}
.stage header {{ display:flex; align-items:center; gap:14px; flex-wrap:wrap; }}
.stage header span {{ color:var(--blue); font-size:12px; font-weight:800; letter-spacing:.14em; text-transform:uppercase; }}
.stage h2 {{ margin:0; font-size:28px; }}
.stage header b {{ margin-left:auto; color:#101512; background:var(--gold); border-radius:999px; padding:7px 10px; font-size:12px; text-transform:uppercase; }}
p, li {{ color:var(--muted); line-height:1.45; }}
.grid {{ display:grid; grid-template-columns:repeat(4,minmax(0,1fr)); gap:14px; }}
.grid > div {{ background:rgba(255,255,255,.035); border:1px solid rgba(255,255,255,.08); border-radius:18px; padding:14px; }}
h3 {{ color:var(--ink); margin-bottom:8px; }}
ul {{ padding-left:18px; }}
.artifacts {{ display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:10px; list-style:none; padding:0; }}
.artifacts li {{ border:1px solid var(--line); border-radius:14px; padding:12px; background:rgba(0,0,0,.16); overflow-wrap:anywhere; }}
.artifacts li.ok strong {{ color:var(--green); }}
.artifacts li.missing strong {{ color:var(--red); }}
code {{ color:#dfd6b8; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size:12px; }}
@media (max-width:1000px) {{ .grid {{ grid-template-columns:1fr 1fr; }} .artifacts {{ grid-template-columns:1fr; }} }}
@media (max-width:700px) {{ main {{ width:calc(100vw - 24px); }} .grid {{ grid-template-columns:1fr; }} }}
</style>
</head>
<body><main>
<section class="hero">
<div class="kicker">Quipsly Studio Audio Workbench</div>
<h1>Stage control surface</h1>
<p>One inspectable map for source truth, sync, cleanup, restoration, mastering, review, and branch gates. This page does not approve anything; it makes the right next move visible.</p>
<div class="truth">
<span>Baseline <b>{html.escape(str(surface['baselineId']))}</b></span>
<span>Approval <b>{html.escape(str(surface['approvalStatus']))}</b></span>
<span>Human listen ready <b>{str(surface['packageReadyForHumanListen']).lower()}</b></span>
<span>Branch inheritance <b>{str(surface['branchInheritanceReady']).lower()}</b></span>
<span>Branch render <b>{str(surface['branchRenderReady']).lower()}</b></span>
<span>Missing artifacts <b>{surface['missingArtifactCount']}</b></span>
</div>
</section>
{''.join(cards)}
</main></body></html>"""


def write_open_command(path: Path, html_path: Path, md_path: Path) -> None:
    lines = ["#!/bin/zsh", "set -euo pipefail", f"open {shell_quote(str(html_path))}", f"open {shell_quote(str(md_path))}"]
    path.write_text("\n".join(lines) + "\n", encoding="utf-8")
    os.chmod(path, 0o755)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--baseline-dir", required=True, type=Path)
    args = parser.parse_args()

    baseline_dir = resolve_baseline_dir(args.baseline_dir)
    manifest_path = baseline_dir / "manifest.json"
    manifest_before = read_json(manifest_path)
    approval_before = manifest_before.get("approvalStatus")
    branch_before = (manifest_before.get("branchInheritanceReady"), manifest_before.get("branchRenderReady"))

    baseline_id = str(manifest_before.get("baselineId") or "audio-baseline")
    slug = safe_slug(baseline_id.replace("episode-4-conformed-production-baseline-", ""))
    generated_at = datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S")
    output_dir = baseline_dir / f"audio-workbench-stage-control-surface-{slug}-{generated_at}"
    output_dir.mkdir(parents=True, exist_ok=True)
    output_json = output_dir / "audio-workbench-stage-control-surface.json"
    output_md = output_dir / "audio-workbench-stage-control-surface.md"
    output_html = output_dir / "audio-workbench-stage-control-surface.html"
    open_command = output_dir / "open-audio-workbench-stage-control-surface.command"

    surface = build_surface(manifest_before, baseline_dir, generated_at)
    write_json(output_json, surface)
    output_md.write_text(render_markdown(surface), encoding="utf-8")
    output_html.write_text(render_html(surface), encoding="utf-8")
    write_open_command(open_command, output_html, output_md)

    manifest_after = read_json(manifest_path)
    outputs = manifest_after.setdefault("outputs", {})
    entry = {
        "path": str(output_json),
        "markdownPath": str(output_md),
        "htmlPath": str(output_html),
        "openCommand": str(open_command),
        "generatedAt": generated_at,
        "schema": surface["schema"],
        "stageCount": surface["stageCount"],
        "missingArtifactCount": surface["missingArtifactCount"],
        "lockedStageCount": surface["lockedStageCount"],
        "approvalStateChanged": approval_before != manifest_after.get("approvalStatus"),
        "branchStateChanged": branch_before != (manifest_after.get("branchInheritanceReady"), manifest_after.get("branchRenderReady")),
        "renderAttempted": False,
        "originalMediaMutated": False,
    }
    history = outputs.setdefault("audioWorkbenchStageControlSurfaces", [])
    history.append(entry)
    outputs["latestAudioWorkbenchStageControlSurface"] = entry
    outputs["latestAudioWorkbenchStageControlSurfaceMarkdown"] = str(output_md)
    outputs["latestAudioWorkbenchStageControlSurfaceHtml"] = str(output_html)
    outputs["latestAudioWorkbenchStageControlSurfaceOpenCommand"] = str(open_command)
    manifest_after["audioWorkbenchStageControlSurfaceCount"] = len(history)
    manifest_after["audioWorkbenchStageControlSurfaceStageCount"] = surface["stageCount"]
    manifest_after["audioWorkbenchStageControlSurfaceMissingArtifactCount"] = surface["missingArtifactCount"]
    manifest_after["audioWorkbenchStageControlSurfaceLockedStageCount"] = surface["lockedStageCount"]
    manifest_after["audioWorkbenchStageControlSurfaceApprovalStateChanged"] = entry["approvalStateChanged"]
    manifest_after["audioWorkbenchStageControlSurfaceBranchStateChanged"] = entry["branchStateChanged"]
    manifest_after["audioWorkbenchStageControlSurfaceOriginalMediaMutated"] = False
    write_json(manifest_path, manifest_after)

    print(json.dumps(entry, indent=2, sort_keys=True))


if __name__ == "__main__":
    main()
