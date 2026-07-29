#!/usr/bin/env python3
"""Create a branch-render preflight for an Audio Workbench baseline.

This is the handoff between an approved conformed audio spine and Episode 4
long-form/short branch rendering. It is intentionally read-only: it explains
whether branches may inherit the spine, which commands to run after approval,
and why rendering is currently blocked if the listen gate has not passed.
"""
from __future__ import annotations

import argparse
import html
import json
import sys
from dataclasses import asdict
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

SCRIPT_DIR = Path(__file__).resolve().parent
sys.path.insert(0, str(SCRIPT_DIR))

import episode4_full_sync_export as exporter  # noqa: E402


def write_json(path: Path, value: dict[str, Any]) -> None:
    path.write_text(json.dumps(value, indent=2, sort_keys=True, default=str), encoding="utf-8")


def shell_quote(text: str) -> str:
    return "'" + text.replace("'", "'\"'\"'") + "'"


def write_open_command(path: Path, target: Path) -> None:
    path.write_text(
        "\n".join(["#!/bin/sh", "set -e", "open " + shell_quote(str(target)), ""]),
        encoding="utf-8",
    )
    path.chmod(0o755)


def output_suffix(baseline_id: str) -> str:
    marker = "episode-4-conformed-production-baseline-"
    return baseline_id.replace(marker, "") if baseline_id.startswith(marker) else baseline_id


def branch_payload(branch: exporter.BranchPlan) -> dict[str, Any]:
    return {
        "id": branch.id,
        "title": branch.title,
        "target": branch.target,
        "plannedDurationSeconds": round(branch.duration, 3),
        "plannedDurationMinutes": round(branch.duration / 60, 2),
        "intendedPlatformUse": branch.intended_platform_use,
        "editorialTradeoff": branch.editorial_tradeoff,
        "warning": branch.warning,
        "ranges": [asdict(item) | {"duration": round(item.duration, 3)} for item in branch.ranges],
    }


def build_preflight(
    baseline_dir: Path,
    *,
    output_root: Path,
    branches: list[str],
) -> dict[str, Any]:
    resolved_dir = exporter.resolve_conformed_baseline_dir(baseline_dir)
    baseline = exporter.load_conformed_audio_baseline(resolved_dir, allow_unapproved=False)
    assert baseline is not None
    selected = [
        branch
        for branch in exporter.BRANCHES
        if not branches or branch.id in set(branches)
    ]
    blockers = list(baseline.get("blockers", []))
    missing_inputs = exporter.require_files(
        [
            exporter.REFERENCE_PROJECT,
            exporter.TRANSCRIPT_SPINE,
            *[source.path for source in exporter.VIDEO_SOURCES],
            Path(baseline["masterAudioPath"]) if baseline.get("masterAudioPath") else Path("__missing_audio_spine__"),
        ]
    )
    blockers.extend([f"missing input: {item}" for item in missing_inputs])

    base_command = (
        "python3 apps/QuipslyStudio/script/episode4_full_sync_export.py "
        f"--output-root {shell_quote(str(output_root))} "
        f"--conformed-baseline-dir {shell_quote(str(resolved_dir))}"
    )
    branch_args = " ".join(f"--branch {shell_quote(branch.id)}" for branch in selected)
    render_command = f"{base_command} {branch_args}".strip()
    real_render_commands_exposed = not blockers
    render_after_approval_command = (
        render_command
        if real_render_commands_exposed
        else "# Real branch render command hidden until human approval, source-aware branch gate, and preflight all pass."
    )
    proof_command = (
        f"{base_command} {branch_args} "
        "--allow-unapproved-conformed-baseline-proof --proof-seconds 60 "
        "--run-label proof-unapproved-conformed-audio-spine"
    ).strip()

    source_aware_contract = baseline.get("sourceAwareAudioContract") if isinstance(baseline.get("sourceAwareAudioContract"), dict) else {}
    source_aware_ready = bool(baseline.get("inheritsSourceAwareAudioTruth")) and bool(
        source_aware_contract.get("ready")
    )
    mastered_spine_only_allowed = bool(source_aware_contract.get("masteredSpineOnlyEditingAllowed"))
    branch_audio_plan = exporter.branch_audio_plan(baseline)
    selected_stems = [
        stem
        for stem in (branch_audio_plan.get("selectedRefinedStems") or [])
        if isinstance(stem, dict)
    ]
    branch_audio_plan_missing_roles = sorted(
        exporter.REQUIRED_SOURCE_AWARE_STEM_ROLES
        - {str(stem.get("roleId")) for stem in selected_stems if stem.get("roleId")}
    )
    branch_audio_plan_missing_paths = [
        f"{stem.get('roleId') or 'unknown'}: {stem.get('path')}"
        for stem in selected_stems
        if not stem.get("path") or not Path(str(stem.get("path"))).exists()
    ]
    branch_audio_plan_ready = (
        branch_audio_plan.get("branchAudioTruth") == "source-aware-refined-stems"
        and bool(branch_audio_plan.get("branchAudioWillUseSourceAwareStemsAfterApproval"))
        and not bool(branch_audio_plan.get("branchAudioRenderedFromMasteredSpineOnly"))
        and not bool(branch_audio_plan.get("masteredSpineOnlyEditingAllowed"))
        and len(selected_stems) >= len(exporter.REQUIRED_SOURCE_AWARE_STEM_ROLES)
        and not branch_audio_plan_missing_roles
        and not branch_audio_plan_missing_paths
    )
    if not branch_audio_plan_ready:
        blockers.append("branch audio plan is not ready for source-aware refined-stem rendering")
    if branch_audio_plan.get("branchAudioTruth") != "source-aware-refined-stems":
        blockers.append(f"branch audio plan truth is not source-aware-refined-stems: {branch_audio_plan.get('branchAudioTruth')}")
    if not bool(branch_audio_plan.get("branchAudioWillUseSourceAwareStemsAfterApproval")):
        blockers.append("branch audio plan does not promise source-aware stems after approval")
    if bool(branch_audio_plan.get("branchAudioRenderedFromMasteredSpineOnly")):
        blockers.append("branch audio plan would render from the mastered spine only")
    if bool(branch_audio_plan.get("masteredSpineOnlyEditingAllowed")):
        blockers.append("branch audio plan allows mastered-spine-only editing")
    if branch_audio_plan_missing_roles:
        blockers.append("branch audio plan missing required stem roles: " + ", ".join(branch_audio_plan_missing_roles))
    if branch_audio_plan_missing_paths:
        blockers.append("branch audio plan has missing stem paths: " + "; ".join(branch_audio_plan_missing_paths))

    status = "ready-after-human-listen-approval" if not blockers else "blocked-before-branch-render"
    return {
        "schema": "quipsly.audio-workbench.branch-render-preflight.v1",
        "status": status,
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "baselineDir": str(resolved_dir),
        "baseline": baseline,
        "sourceAwareAudioContract": source_aware_contract,
        "sourceAwareAudioTruthRequired": True,
        "sourceAwareAudioTruthReady": source_aware_ready,
        "sourceAwareAudioContractStatus": source_aware_contract.get("status"),
        "sourceAwareAudioRoleIds": source_aware_contract.get("roleIds") or [],
        "sourceAwareAudioReadyStemCount": source_aware_contract.get("readyStemCount") or 0,
        "branchAudioPlan": branch_audio_plan,
        "branchAudioPlanStatus": "ready-source-aware-refined-stem-plan" if branch_audio_plan_ready else "blocked-source-aware-refined-stem-plan",
        "branchAudioPlanSelectedRefinedStemCount": len(selected_stems),
        "branchAudioPlanSelectedRefinedStems": selected_stems,
        "branchAudioPlanMissingRoleIds": branch_audio_plan_missing_roles,
        "branchAudioPlanMissingStemPathCount": len(branch_audio_plan_missing_paths),
        "branchAudioPlanMissingStemPaths": branch_audio_plan_missing_paths,
        "branchRenderAudioTruth": "source-aware-refined-stems",
        "sourceAwareBranchRenderWillUseRefinedStems": branch_audio_plan_ready,
        "sourceAwareBranchRenderStemPathsProved": branch_audio_plan_ready,
        "sourceAwareBranchRenderExpectedMixOutputName": "episode4-source-aware-branch-audio.wav",
        "inheritsSourceAwareAudioTruth": bool(baseline.get("inheritsSourceAwareAudioTruth")),
        "masteredSpineOnlyEditingAllowed": mastered_spine_only_allowed,
        "branchAudioRenderedFromMasteredSpineOnly": False,
        "masteredSpineUse": "review-export-premiere-final-podcast-convenience-not-editable-branch-truth",
        "canRenderBranches": not blockers,
        "realBranchRenderCommandsExposed": real_render_commands_exposed,
        "blockerCount": len(blockers),
        "blockers": blockers,
        "outputRoot": str(output_root),
        "selectedBranches": [branch_payload(branch) for branch in selected],
        "commands": {
            "renderAfterApproval": render_after_approval_command,
            "blockedRenderCommandPreview": render_command,
            "proofOnlyUnapproved60s": proof_command,
            "recordBranchInheritanceApproval": (
                "python3 apps/QuipslyStudio/script/audio_workbench_record_listen_decision.py "
                f"--baseline-dir {shell_quote(str(resolved_dir))} "
                "--status human-approved-for-branch-inheritance "
                "--reviewer 'Charlie or Mako' "
                "--notes 'Human listened to the audio review cockpit and approved this candidate for branch inheritance.' "
                "--confirm-human-listened"
            ),
            "refreshBranchGate": (
                "python3 apps/QuipslyStudio/script/audio_workbench_branch_gate.py "
                f"--baseline-dir {shell_quote(str(resolved_dir))}"
            ),
        },
        "truth": {
            "originalMediaMutated": False,
            "versionsOverwritten": False,
            "externalPublicationReceipt": None,
            "humanApprovalClaimed": False,
            "renderExecuted": False,
            "approvalStateChanged": False,
            "branchStateChanged": False,
            "sourceAwareAudioTruthRequired": True,
            "sourceAwareAudioTruthReady": source_aware_ready,
            "branchRenderAudioTruth": "source-aware-refined-stems",
            "branchAudioPlanStatus": "ready-source-aware-refined-stem-plan" if branch_audio_plan_ready else "blocked-source-aware-refined-stem-plan",
            "branchAudioPlanSelectedRefinedStemCount": len(selected_stems),
            "sourceAwareBranchRenderWillUseRefinedStems": branch_audio_plan_ready,
            "sourceAwareBranchRenderStemPathsProved": branch_audio_plan_ready,
            "sourceAwareBranchRenderExpectedMixOutputName": "episode4-source-aware-branch-audio.wav",
            "branchAudioRenderedFromMasteredSpineOnly": False,
            "masteredSpineOnlyEditingAllowed": mastered_spine_only_allowed,
            "realBranchRenderCommandsExposed": real_render_commands_exposed,
            "purpose": "Preflight only. It prepares branch rendering and blocks unsafe inheritance.",
        },
        "nextSafestAction": (
            "Open the audio review cockpit, complete human listen proof, record branch-inheritance approval, "
            "refresh the branch gate, then run renderAfterApproval."
            if blockers
            else "Run renderAfterApproval to create versioned branch outputs that inherit the conformed audio spine."
        ),
    }


def render_markdown(preflight: dict[str, Any]) -> str:
    lines = [
        "# Audio Workbench branch-render preflight",
        "",
        f"- Status: `{preflight.get('status')}`",
        f"- Can render branches: `{preflight.get('canRenderBranches')}`",
        f"- Baseline: `{(preflight.get('baseline') or {}).get('baselineId')}`",
        f"- Approval status: `{(preflight.get('baseline') or {}).get('approvalStatus')}`",
        f"- Inherits source-aware audio truth: `{str(preflight.get('inheritsSourceAwareAudioTruth')).lower()}`",
        f"- Source-aware roles: `{', '.join((preflight.get('sourceAwareAudioContract') or {}).get('roleIds') or [])}`",
        f"- Source-aware contract: `{(preflight.get('sourceAwareAudioContract') or {}).get('status')}`",
        f"- Source-aware truth ready: `{str(preflight.get('sourceAwareAudioTruthReady')).lower()}`",
        f"- Branch audio plan: `{preflight.get('branchAudioPlanStatus')}`",
        f"- Branch audio plan stem count: `{preflight.get('branchAudioPlanSelectedRefinedStemCount')}`",
        f"- Branch audio plan missing roles: `{', '.join(preflight.get('branchAudioPlanMissingRoleIds') or []) or 'none'}`",
        f"- Branch audio plan missing paths: `{preflight.get('branchAudioPlanMissingStemPathCount')}`",
        f"- Source-aware branch stem paths proved: `{str(preflight.get('sourceAwareBranchRenderStemPathsProved')).lower()}`",
        f"- Source-aware branch mix output: `{preflight.get('sourceAwareBranchRenderExpectedMixOutputName')}`",
        f"- Branch render audio truth: `{preflight.get('branchRenderAudioTruth')}`",
        f"- Branch render will use source-aware refined stems: `{str(preflight.get('sourceAwareBranchRenderWillUseRefinedStems')).lower()}`",
        f"- Mastered-spine-only editing allowed: `{str(preflight.get('masteredSpineOnlyEditingAllowed')).lower()}`",
        f"- Real branch render commands exposed: `{str(preflight.get('realBranchRenderCommandsExposed')).lower()}`",
        f"- Audio review cockpit: `{(preflight.get('baseline') or {}).get('audioReviewCockpitHtml')}`",
        f"- Output root: `{preflight.get('outputRoot')}`",
        "",
        "## Blockers",
        "",
    ]
    blockers = preflight.get("blockers", [])
    lines.extend([f"- {item}" for item in blockers] or ["- none"])
    lines.extend(["", "## Branches prepared", ""])
    for branch in preflight.get("selectedBranches", []):
        lines.extend(
            [
                f"### {branch.get('id')}",
                "",
                f"- Title: {branch.get('title')}",
                f"- Target: {branch.get('target')}",
                f"- Planned runtime: `{branch.get('plannedDurationMinutes')}` minutes",
                f"- Intended use: {branch.get('intendedPlatformUse')}",
                f"- Editorial tradeoff: {branch.get('editorialTradeoff')}",
                "",
            ]
        )
    lines.extend(
        [
            "## Commands",
            "",
            "### Record approval after real listen",
            "",
            "```bash",
            preflight.get("commands", {}).get("recordBranchInheritanceApproval", ""),
            preflight.get("commands", {}).get("refreshBranchGate", ""),
            "```",
            "",
            "### Render after approval",
            "",
            "```bash",
            preflight.get("commands", {}).get("renderAfterApproval", ""),
            "```",
            "",
            "### Optional 60-second internal proof render before approval",
            "",
            "```bash",
            preflight.get("commands", {}).get("proofOnlyUnapproved60s", ""),
            "```",
            "",
            "## Truth",
            "",
            "- This preflight does not render, publish, approve, mutate source media, or overwrite prior versions.",
            "- Branch renders must inherit source-aware Charlie/Homer/clip stems plus metadata decisions; the mastered spine alone is not enough editing truth.",
            "- Real branch render commands stay hidden until human listen approval, the source-aware branch gate, and render preflight all pass.",
            "- The mastered spine is allowed as a review/export/Premiere convenience, not as editable branch truth.",
            "",
            "## Next safest action",
            "",
            preflight.get("nextSafestAction", ""),
            "",
        ]
    )
    return "\n".join(lines)


def render_html(preflight: dict[str, Any]) -> str:
    baseline = preflight.get("baseline") or {}
    source_aware = preflight.get("sourceAwareAudioContract") if isinstance(preflight.get("sourceAwareAudioContract"), dict) else {}
    blockers = preflight.get("blockers") or []
    branch_rows = []
    for branch in preflight.get("selectedBranches") or []:
        branch_rows.append(
            "<tr>"
            f"<td>{html.escape(str(branch.get('id') or ''))}</td>"
            f"<td>{html.escape(str(branch.get('target') or ''))}</td>"
            f"<td>{html.escape(str(branch.get('plannedDurationMinutes') or ''))}</td>"
            f"<td>{html.escape(str(branch.get('intendedPlatformUse') or ''))}</td>"
            "</tr>"
        )
    blocker_items = "".join(f"<li>{html.escape(str(item))}</li>" for item in blockers) or "<li>none</li>"
    command_rows = []
    for label, key in [
        ("Record approval after real listen", "recordBranchInheritanceApproval"),
        ("Refresh branch gate", "refreshBranchGate"),
        ("Render after approval", "renderAfterApproval"),
        ("Optional proof-only unapproved render", "proofOnlyUnapproved60s"),
    ]:
        command_rows.append(
            f"<h3>{html.escape(label)}</h3><pre>{html.escape(str((preflight.get('commands') or {}).get(key) or ''))}</pre>"
        )
    return f"""<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>Branch render preflight: {html.escape(str(baseline.get('baselineId') or 'audio-baseline'))}</title>
  <style>
    :root {{
      color-scheme: light dark;
      --bg: #f5edda;
      --card: #fffaf0;
      --ink: #2f241b;
      --muted: #74644d;
      --line: #decba4;
      --accent: #8a5b25;
      --danger: #b34040;
      --safe: #27794f;
    }}
    @media (prefers-color-scheme: dark) {{
      :root {{
        --bg: #141b17;
        --card: #202920;
        --ink: #f4eddb;
        --muted: #c8b895;
        --line: #42513f;
        --accent: #e2b35c;
        --danger: #ff7d7d;
        --safe: #6dd49b;
      }}
    }}
    body {{
      margin: 0;
      background: radial-gradient(circle at top left, rgba(138,91,37,.18), transparent 34rem), var(--bg);
      color: var(--ink);
      font: 16px/1.55 -apple-system, BlinkMacSystemFont, "Avenir Next", sans-serif;
    }}
    main {{ max-width: 1120px; margin: 0 auto; padding: 42px 24px 64px; }}
    h1 {{ font-size: clamp(34px, 6vw, 58px); line-height: .98; margin: 0 0 14px; }}
    .kicker {{ color: var(--accent); font-weight: 800; letter-spacing: .16em; text-transform: uppercase; }}
    .card {{
      background: color-mix(in srgb, var(--card) 92%, transparent);
      border: 1px solid var(--line);
      border-radius: 22px;
      padding: 24px;
      margin: 18px 0;
      box-shadow: 0 14px 34px rgba(0,0,0,.12);
    }}
    .grid {{ display: grid; grid-template-columns: repeat(auto-fit, minmax(230px, 1fr)); gap: 12px; }}
    .pill {{ border: 1px solid var(--line); border-radius: 18px; padding: 12px 14px; background: rgba(255,255,255,.18); }}
    .pill strong {{ display: block; color: var(--muted); font-size: 12px; letter-spacing: .08em; text-transform: uppercase; }}
    .ok {{ color: var(--safe); font-weight: 800; }}
    .no {{ color: var(--danger); font-weight: 800; }}
    table {{ width: 100%; border-collapse: collapse; }}
    th, td {{ border-bottom: 1px solid var(--line); padding: 10px; text-align: left; vertical-align: top; }}
    th {{ color: var(--muted); font-size: 12px; letter-spacing: .08em; text-transform: uppercase; }}
    pre {{ white-space: pre-wrap; background: rgba(0,0,0,.10); border-radius: 14px; padding: 14px; overflow-x: auto; }}
  </style>
</head>
<body>
  <main>
    <p class="kicker">Quipsly audio workbench</p>
    <h1>Branch render preflight</h1>
    <p>This preflight prepares long-form and shorts branch rendering, but it does not render. Real commands stay unsafe until human listen approval and branch inheritance are true.</p>
    <section class="card grid">
      <div class="pill"><strong>Status</strong>{html.escape(str(preflight.get('status')))}</div>
      <div class="pill"><strong>Can render</strong><span class="{'ok' if preflight.get('canRenderBranches') else 'no'}">{str(preflight.get('canRenderBranches')).lower()}</span></div>
      <div class="pill"><strong>Blockers</strong>{len(blockers)}</div>
      <div class="pill"><strong>Approval status</strong>{html.escape(str(baseline.get('approvalStatus')))}</div>
      <div class="pill"><strong>Source-aware audio</strong><span class="{'ok' if preflight.get('inheritsSourceAwareAudioTruth') else 'no'}">{html.escape(str(source_aware.get('status') or 'missing'))}</span></div>
      <div class="pill"><strong>Stem roles</strong>{html.escape(', '.join(source_aware.get('roleIds') or []))}</div>
      <div class="pill"><strong>Source-aware ready</strong>{str(preflight.get('sourceAwareAudioTruthReady')).lower()}</div>
      <div class="pill"><strong>Branch audio plan</strong>{html.escape(str(preflight.get('branchAudioPlanStatus') or 'missing'))}</div>
      <div class="pill"><strong>Refined stems</strong>{html.escape(str(preflight.get('branchAudioPlanSelectedRefinedStemCount') or 0))}</div>
      <div class="pill"><strong>Stem paths proved</strong>{str(preflight.get('sourceAwareBranchRenderStemPathsProved')).lower()}</div>
      <div class="pill"><strong>Mix output</strong>{html.escape(str(preflight.get('sourceAwareBranchRenderExpectedMixOutputName') or ''))}</div>
      <div class="pill"><strong>Audio truth</strong>{html.escape(str(preflight.get('branchRenderAudioTruth')))}</div>
      <div class="pill"><strong>Master-only editing</strong>{str(preflight.get('masteredSpineOnlyEditingAllowed')).lower()}</div>
      <div class="pill"><strong>Commands exposed</strong>{str(preflight.get('realBranchRenderCommandsExposed')).lower()}</div>
      <div class="pill"><strong>Branch inheritance</strong>{str(baseline.get('branchInheritanceReady')).lower()}</div>
      <div class="pill"><strong>Render executed</strong>{str((preflight.get('truth') or {}).get('renderExecuted')).lower()}</div>
    </section>
    <section class="card">
      <h2>Blockers</h2>
      <ul>{blocker_items}</ul>
    </section>
    <section class="card">
      <h2>Branches prepared</h2>
      <table>
        <thead><tr><th>Branch</th><th>Target</th><th>Minutes</th><th>Use</th></tr></thead>
        <tbody>{''.join(branch_rows)}</tbody>
      </table>
    </section>
    <section class="card">
      <h2>Commands</h2>
      {''.join(command_rows)}
    </section>
    <section class="card">
      <h2>Next safest action</h2>
      <p>{html.escape(str(preflight.get('nextSafestAction') or ''))}</p>
    </section>
  </main>
</body>
</html>
"""


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--baseline-dir", required=True, type=Path)
    parser.add_argument("--output-root", default=str(exporter.DEFAULT_OUTPUT_ROOT), type=Path)
    parser.add_argument("--branch", choices=[branch.id for branch in exporter.BRANCHES], action="append", default=[])
    args = parser.parse_args()

    baseline_dir = exporter.resolve_conformed_baseline_dir(args.baseline_dir)
    preflight = build_preflight(
        baseline_dir,
        output_root=args.output_root,
        branches=args.branch,
    )
    suffix = output_suffix(preflight["baseline"]["baselineId"])
    json_path = baseline_dir / f"audio-branch-render-preflight-{suffix}.json"
    md_path = baseline_dir / f"audio-branch-render-preflight-{suffix}.md"
    html_path = baseline_dir / f"audio-branch-render-preflight-{suffix}.html"
    open_command_path = baseline_dir / f"open-audio-branch-render-preflight-{suffix}.command"
    stable_json_path = baseline_dir / "BRANCH_RENDER_PREFLIGHT.json"
    stable_md_path = baseline_dir / "BRANCH_RENDER_PREFLIGHT.md"
    stable_html_path = baseline_dir / "BRANCH_RENDER_PREFLIGHT.html"
    stable_open_command_path = baseline_dir / "OPEN_BRANCH_RENDER_PREFLIGHT.command"
    preflight["outputs"] = {
        "json": str(stable_json_path),
        "markdown": str(stable_md_path),
        "html": str(stable_html_path),
        "openCommand": str(stable_open_command_path),
        "versionedJson": str(json_path),
        "versionedMarkdown": str(md_path),
        "versionedHtml": str(html_path),
        "versionedOpenCommand": str(open_command_path),
    }
    write_json(json_path, preflight)
    md_path.write_text(render_markdown(preflight), encoding="utf-8")
    html_path.write_text(render_html(preflight), encoding="utf-8")
    write_open_command(open_command_path, html_path)
    write_json(stable_json_path, preflight)
    stable_md_path.write_text(render_markdown(preflight), encoding="utf-8")
    stable_html_path.write_text(render_html(preflight), encoding="utf-8")
    write_open_command(stable_open_command_path, stable_html_path)

    manifest_path = baseline_dir / "manifest.json"
    manifest = exporter.read_json(manifest_path)
    outputs = manifest.setdefault("outputs", {})
    outputs["branchRenderPreflight"] = str(stable_json_path)
    outputs["branchRenderPreflightMarkdown"] = str(stable_md_path)
    outputs["branchRenderPreflightHtml"] = str(stable_html_path)
    outputs["branchRenderPreflightOpenCommand"] = str(stable_open_command_path)
    outputs["branchRenderPreflightVersioned"] = str(json_path)
    outputs["branchRenderPreflightVersionedMarkdown"] = str(md_path)
    outputs["branchRenderPreflightVersionedHtml"] = str(html_path)
    outputs["branchRenderPreflightVersionedOpenCommand"] = str(open_command_path)
    history = outputs.setdefault("branchRenderPreflights", [])
    if str(json_path) not in history:
        history.append(str(json_path))
    manifest["branchRenderReady"] = bool(preflight["canRenderBranches"])
    manifest["branchRenderPreflightStatus"] = preflight["status"]
    manifest["branchRenderBlockedReason"] = preflight["blockers"]
    manifest["branchRenderPreflightRequiresSourceAwareAudioTruth"] = True
    manifest["branchRenderPreflightInheritsSourceAwareAudioTruth"] = bool(preflight.get("inheritsSourceAwareAudioTruth"))
    manifest["branchRenderPreflightSourceAwareAudioContractStatus"] = (
        preflight.get("sourceAwareAudioContract") or {}
    ).get("status")
    manifest["branchRenderPreflightSourceAwareAudioRoleIds"] = (
        preflight.get("sourceAwareAudioContract") or {}
    ).get("roleIds") or []
    manifest["branchRenderPreflightSourceAwareAudioTruthReady"] = bool(
        preflight.get("sourceAwareAudioTruthReady")
    )
    manifest["branchRenderPreflightSourceAwareAudioReadyStemCount"] = (
        preflight.get("sourceAwareAudioContract") or {}
    ).get("readyStemCount") or 0
    manifest["branchRenderPreflightBranchAudioPlanStatus"] = preflight.get("branchAudioPlanStatus")
    manifest["branchRenderPreflightBranchAudioPlanSelectedRefinedStemCount"] = preflight.get(
        "branchAudioPlanSelectedRefinedStemCount"
    )
    manifest["branchRenderPreflightBranchAudioPlanSelectedRefinedStems"] = preflight.get(
        "branchAudioPlanSelectedRefinedStems"
    )
    manifest["branchRenderPreflightBranchAudioPlanMissingRoleIds"] = preflight.get(
        "branchAudioPlanMissingRoleIds"
    )
    manifest["branchRenderPreflightBranchAudioPlanMissingStemPathCount"] = preflight.get(
        "branchAudioPlanMissingStemPathCount"
    )
    manifest["branchRenderPreflightBranchRenderAudioTruth"] = preflight.get(
        "branchRenderAudioTruth"
    )
    manifest["branchRenderPreflightSourceAwareBranchRenderWillUseRefinedStems"] = bool(
        preflight.get("sourceAwareBranchRenderWillUseRefinedStems")
    )
    manifest["branchRenderPreflightSourceAwareBranchRenderStemPathsProved"] = bool(
        preflight.get("sourceAwareBranchRenderStemPathsProved")
    )
    manifest["branchRenderPreflightSourceAwareBranchRenderExpectedMixOutputName"] = preflight.get(
        "sourceAwareBranchRenderExpectedMixOutputName"
    )
    manifest["branchRenderPreflightBranchAudioRenderedFromMasteredSpineOnly"] = bool(
        preflight.get("branchAudioRenderedFromMasteredSpineOnly")
    )
    manifest["branchRenderPreflightMasteredSpineOnlyEditingAllowed"] = bool(
        preflight.get("masteredSpineOnlyEditingAllowed")
    )
    manifest["branchRenderPreflightRealBranchRenderCommandsExposed"] = bool(
        preflight.get("realBranchRenderCommandsExposed")
    )
    manifest["branchRenderPreflightMasteredSpineUse"] = preflight.get("masteredSpineUse")
    manifest_path.write_text(json.dumps(manifest, indent=2, sort_keys=True, default=str), encoding="utf-8")

    print(json.dumps(preflight["outputs"], indent=2))


if __name__ == "__main__":
    main()
