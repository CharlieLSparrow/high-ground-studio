#!/usr/bin/env python3
"""Evaluate whether an audio candidate can be inherited by edit branches.

This is a safety/readiness gate. It does not render, approve, or mutate source
media. It records whether long-form and shorts branches may inherit the current
source-aware refined stems plus timing metadata, and why.

The mastered spine is useful as a human listen/review/export artifact. It is
not enough editable truth for branch timing, conversation spacing, clip weaving,
reaction cuts, J/L cuts, or shorts.
"""
from __future__ import annotations

import argparse
import html
import json
import re
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


APPROVED_STATUSES = {
    "human-approved-for-branch-inheritance",
    "human-approved-for-publication",
}
REQUIRED_SOURCE_AWARE_STEM_ROLES = {"charlie", "homer", "clip-source"}


def read_json(path: Path) -> dict[str, Any]:
    return json.loads(path.read_text(encoding="utf-8"))


def write_json(path: Path, value: dict[str, Any]) -> None:
    path.write_text(json.dumps(value, indent=2, sort_keys=True), encoding="utf-8")


def shell_quote(value: str) -> str:
    return "'" + value.replace("'", "'\"'\"'") + "'"


def write_open_command(path: Path, target: Path) -> None:
    path.write_text(
        "\n".join(["#!/bin/sh", "set -e", "open " + shell_quote(str(target)), ""]),
        encoding="utf-8",
    )
    path.chmod(0o755)


def resolve_baseline_dir(input_path: Path) -> Path:
    if (input_path / "manifest.json").exists():
        return input_path
    nested = input_path / "work" / "conformed-production-baseline"
    if (nested / "manifest.json").exists():
        return nested
    raise FileNotFoundError(
        "Could not find a conformed production baseline manifest at "
        f"{input_path}/manifest.json or {nested}/manifest.json"
    )


def version_from_baseline_id(baseline_id: str) -> str:
    match = re.search(r"(v\d+(?:-[A-Za-z0-9-]+)?)$", baseline_id)
    return match.group(1) if match else "unknown"


def exists(path_text: str | None) -> bool:
    return bool(path_text) and Path(path_text).exists()


def output_path(outputs: dict[str, Any], key: str) -> str | None:
    value = outputs.get(key)
    if isinstance(value, str):
        return value
    if isinstance(value, dict):
        return value.get("path")
    return None


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


def source_aware_branch_contract(manifest: dict[str, Any]) -> dict[str, Any]:
    timing_roles = {str(role) for role in (manifest.get("audioSourceAwareTimingContractRoleIds") or [])}
    post_approval_roles = {
        str(role)
        for role in (manifest.get("audioPostApprovalRenderRehearsalSourceAwareAudioRoleIds") or [])
    }
    executor_roles = {
        str(role)
        for role in (manifest.get("approvedBranchRenderExecutorSourceAwareAudioRoleIds") or [])
    }
    observed_roles = timing_roles | post_approval_roles | executor_roles
    missing_roles = sorted(REQUIRED_SOURCE_AWARE_STEM_ROLES - observed_roles)

    stem_status = str(manifest.get("audioSourceAwareStemManifestLatestStatus") or "")
    stem_ready_count = int_value(manifest.get("audioSourceAwareStemManifestReadyStemCount"))
    stem_resolved_count = int_value(manifest.get("audioSourceAwareStemManifestResolvedStemCount"))
    stem_warning_count = int_value(manifest.get("audioSourceAwareStemManifestWarningCount"))

    timing_status = str(manifest.get("audioSourceAwareTimingContractLatestStatus") or "")
    timing_ready = bool(manifest.get("audioSourceAwareTimingContractReady"))
    timing_ready_roles = int_value(manifest.get("audioSourceAwareTimingContractReadyRoleCount"))
    timing_full_length_stems = int_value(manifest.get("audioSourceAwareTimingContractFullLengthStemCount"))
    timing_hard_stops = int_value(manifest.get("audioSourceAwareTimingContractHardStopCount"))
    timing_missing_roles = [
        str(role) for role in (manifest.get("audioSourceAwareTimingContractMissingRoleIds") or [])
    ]
    timing_delta = float_value(
        manifest.get("audioSourceAwareTimingContractMaxDurationDeltaToMasterSeconds"),
        default=999999.0,
    )
    timing_tolerance = float_value(
        manifest.get("audioSourceAwareTimingContractDurationToleranceSeconds"),
        default=0.0,
    )

    post_status = str(
        manifest.get("audioPostApprovalRenderRehearsalSourceAwareAudioContractStatus")
        or manifest.get("audioSourceAwareTimingContractPostApprovalSourceAwareAudioContractStatus")
        or ""
    )
    post_inherits = bool(
        manifest.get("audioPostApprovalRenderRehearsalInheritsSourceAwareAudioTruth")
        or manifest.get("audioSourceAwareTimingContractPostApprovalInheritsSourceAwareAudioTruth")
    )
    post_ready_stem_count = int_value(
        manifest.get("audioPostApprovalRenderRehearsalSourceAwareAudioReadyStemCount")
    )
    post_master_only_allowed = bool(
        manifest.get("audioPostApprovalRenderRehearsalMasteredSpineOnlyEditingAllowed", True)
    )
    executor_ready = bool(manifest.get("approvedBranchRenderExecutorSourceAwareRenderContractReady"))
    executor_will_use_refined_stems = bool(
        manifest.get("approvedBranchRenderExecutorSourceAwareBranchRenderWillUseRefinedStems")
    )
    executor_master_only_prevented = bool(
        manifest.get("approvedBranchRenderExecutorMasteredSpineOnlyBranchRenderPrevented")
    )

    blockers: list[str] = []
    warnings: list[str] = []

    if not stem_status.startswith("source-aware-stems-ready"):
        blockers.append(f"source-aware stem manifest is not ready: {stem_status or 'missing'}")
    if stem_ready_count < len(REQUIRED_SOURCE_AWARE_STEM_ROLES):
        blockers.append(f"source-aware stem manifest has too few ready stems: {stem_ready_count}")
    if stem_resolved_count < len(REQUIRED_SOURCE_AWARE_STEM_ROLES):
        blockers.append(f"source-aware stem manifest has too few resolved stems: {stem_resolved_count}")
    if stem_warning_count:
        blockers.append(f"source-aware stem manifest has warnings: {stem_warning_count}")

    if timing_status != "source-aware-timing-contract-ready-human-listen-gated":
        blockers.append(f"source-aware timing contract has unexpected status: {timing_status or 'missing'}")
    if not timing_ready:
        blockers.append("source-aware timing contract is not ready")
    if timing_ready_roles < len(REQUIRED_SOURCE_AWARE_STEM_ROLES):
        blockers.append(f"source-aware timing contract has too few ready roles: {timing_ready_roles}")
    if timing_full_length_stems < len(REQUIRED_SOURCE_AWARE_STEM_ROLES):
        blockers.append(
            f"source-aware timing contract has too few full-length stems: {timing_full_length_stems}"
        )
    if timing_hard_stops:
        blockers.append(f"source-aware timing contract has hard stops: {timing_hard_stops}")
    if timing_missing_roles:
        blockers.append(
            "source-aware timing contract is missing roles: " + ", ".join(timing_missing_roles)
        )
    if timing_tolerance and timing_delta > timing_tolerance:
        blockers.append(
            "source-aware timing contract duration delta exceeds tolerance: "
            f"{timing_delta} > {timing_tolerance}"
        )
    if missing_roles:
        blockers.append("source-aware branch contract missing roles: " + ", ".join(missing_roles))

    if not post_inherits:
        blockers.append("post-approval branch path does not inherit source-aware audio truth")
    if post_status != "ready-source-aware-editable":
        blockers.append(f"post-approval source-aware contract is not ready: {post_status or 'missing'}")
    if post_ready_stem_count < len(REQUIRED_SOURCE_AWARE_STEM_ROLES):
        blockers.append(f"post-approval source-aware contract has too few ready stems: {post_ready_stem_count}")
    if post_master_only_allowed:
        blockers.append("mastered-spine-only branch editing is still allowed")

    if not executor_ready:
        warnings.append("approved branch executor has not yet recorded a ready source-aware contract")
    if not executor_will_use_refined_stems:
        warnings.append("approved branch executor has not yet recorded refined-stem branch truth")
    if not executor_master_only_prevented:
        warnings.append("approved branch executor has not yet recorded mastered-spine-only prevention")

    ready = not blockers
    return {
        "ready": ready,
        "status": "ready-source-aware-branch-inheritance" if ready else "blocked-source-aware-branch-inheritance",
        "requiredRoleIds": sorted(REQUIRED_SOURCE_AWARE_STEM_ROLES),
        "observedRoleIds": sorted(observed_roles),
        "missingRoleIds": missing_roles,
        "stemStatus": stem_status,
        "stemReadyCount": stem_ready_count,
        "stemResolvedCount": stem_resolved_count,
        "stemWarningCount": stem_warning_count,
        "timingStatus": timing_status,
        "timingReady": timing_ready,
        "timingReadyRoleCount": timing_ready_roles,
        "timingFullLengthStemCount": timing_full_length_stems,
        "timingHardStopCount": timing_hard_stops,
        "timingMaxDurationDeltaToMasterSeconds": timing_delta,
        "timingDurationToleranceSeconds": timing_tolerance,
        "postApprovalInheritsSourceAwareAudioTruth": post_inherits,
        "postApprovalSourceAwareAudioContractStatus": post_status,
        "postApprovalSourceAwareAudioReadyStemCount": post_ready_stem_count,
        "postApprovalMasteredSpineOnlyEditingAllowed": post_master_only_allowed,
        "approvedExecutorSourceAwareRenderContractReady": executor_ready,
        "approvedExecutorWillUseRefinedStems": executor_will_use_refined_stems,
        "approvedExecutorMasteredSpineOnlyPrevented": executor_master_only_prevented,
        "blockers": blockers,
        "warnings": warnings,
    }


def build_gate(baseline_dir: Path) -> dict[str, Any]:
    manifest_path = baseline_dir / "manifest.json"
    manifest = read_json(manifest_path)
    outputs = manifest.get("outputs", {})
    baseline_id = manifest.get("baselineId", "unknown-baseline")
    decision_path = outputs.get("latestListenDecision") or outputs.get("latestListenDecisionTemplate")
    decision = read_json(Path(decision_path)) if exists(decision_path) else {}
    quality = manifest.get("qualitySummary", {})
    branch_inheritance_ready_before = bool(manifest.get("branchInheritanceReady"))
    source_aware_contract = source_aware_branch_contract(manifest)

    blockers: list[str] = []
    warnings: list[str] = []
    required_artifacts = {
        "masterWav": output_path(outputs, "masterWav"),
        "masterM4a": output_path(outputs, "masterM4a"),
        "qualityReport": outputs.get("qualityReport"),
        "listenReviewPacket": outputs.get("listenReviewPacket"),
        "listenProofBundle": outputs.get("listenProofBundle"),
        "proofWindowComparison": outputs.get("proofWindowComparison"),
        "sourceActivity": outputs.get("sourceActivity"),
        "latestListenDecision": decision_path,
    }
    if outputs.get("proofWindowComparison"):
        required_artifacts["proofWindowListenWorkorder"] = outputs.get("proofWindowListenWorkorder")
    if outputs.get("proofWindowListenWorkorder"):
        required_artifacts["audioReviewCockpit"] = outputs.get("audioReviewCockpit")
    artifact_checks = {}
    for key, path_text in required_artifacts.items():
        ok = exists(path_text)
        artifact_checks[key] = {"path": path_text, "exists": ok}
        if not ok:
            blockers.append(f"missing required artifact: {key}")

    decision_status = decision.get("decisionStatus") or manifest.get("approvalStatus")
    if decision_status not in APPROVED_STATUSES:
        blockers.append(f"human listen proof pending: decisionStatus={decision_status}")
    if quality.get("readyForHumanListenProof") is not True:
        blockers.append("machine QC is not ready for human listen proof")
    if quality.get("warnings"):
        blockers.extend([f"machine QC warning: {warning}" for warning in quality.get("warnings", [])])
    if quality.get("advisories"):
        warnings.extend([f"machine QC advisory: {advisory}" for advisory in quality.get("advisories", [])])
    if decision.get("publicationApproved") is True and decision_status != "human-approved-for-publication":
        warnings.append("decision publicationApproved=true without publication approval status")
    blockers.extend(source_aware_contract["blockers"])
    warnings.extend(source_aware_contract["warnings"])

    can_inherit = not blockers
    if can_inherit:
        status = "ready-for-branch-inheritance"
    elif any("human listen proof pending" in blocker for blocker in blockers):
        status = "blocked-waiting-for-human-listen-proof"
    else:
        status = "blocked-before-branch-inheritance"

    return {
        "schema": "quipsly.audio-workbench.branch-inheritance-gate.v1",
        "status": status,
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "baselineDir": str(baseline_dir),
        "baselineId": baseline_id,
        "decisionStatus": decision_status,
        "approvalStatus": manifest.get("approvalStatus"),
        "branchInheritanceReadyBefore": branch_inheritance_ready_before,
        "branchInheritanceReadyAfter": can_inherit,
        "branchStateChanged": branch_inheritance_ready_before != can_inherit,
        "canInheritForBranches": can_inherit,
        "sourceAwareBranchContractReady": bool(source_aware_contract["ready"]),
        "sourceAwareBranchContractStatus": source_aware_contract["status"],
        "sourceAwareRequiredRoleIds": source_aware_contract["requiredRoleIds"],
        "sourceAwareObservedRoleIds": source_aware_contract["observedRoleIds"],
        "sourceAwareMissingRoleIds": source_aware_contract["missingRoleIds"],
        "sourceAwareStemStatus": source_aware_contract["stemStatus"],
        "sourceAwareStemReadyCount": source_aware_contract["stemReadyCount"],
        "sourceAwareStemResolvedCount": source_aware_contract["stemResolvedCount"],
        "sourceAwareStemWarningCount": source_aware_contract["stemWarningCount"],
        "sourceAwareTimingContractStatus": source_aware_contract["timingStatus"],
        "sourceAwareTimingContractReady": bool(source_aware_contract["timingReady"]),
        "sourceAwareTimingContractReadyRoleCount": source_aware_contract["timingReadyRoleCount"],
        "sourceAwareTimingContractFullLengthStemCount": source_aware_contract["timingFullLengthStemCount"],
        "sourceAwareTimingContractHardStopCount": source_aware_contract["timingHardStopCount"],
        "sourceAwareTimingContractMaxDurationDeltaToMasterSeconds": source_aware_contract["timingMaxDurationDeltaToMasterSeconds"],
        "sourceAwareTimingContractDurationToleranceSeconds": source_aware_contract["timingDurationToleranceSeconds"],
        "postApprovalInheritsSourceAwareAudioTruth": bool(source_aware_contract["postApprovalInheritsSourceAwareAudioTruth"]),
        "postApprovalSourceAwareAudioContractStatus": source_aware_contract["postApprovalSourceAwareAudioContractStatus"],
        "postApprovalSourceAwareAudioReadyStemCount": source_aware_contract["postApprovalSourceAwareAudioReadyStemCount"],
        "postApprovalMasteredSpineOnlyEditingAllowed": bool(source_aware_contract["postApprovalMasteredSpineOnlyEditingAllowed"]),
        "branchRenderAudioTruth": "source-aware-refined-stems",
        "masteredSpineUse": "review-export-premiere-final-podcast-convenience-not-editable-branch-truth",
        "masteredSpineOnlyEditingAllowed": False,
        "publicationApproved": decision_status == "human-approved-for-publication",
        "artifactChecks": artifact_checks,
        "qualitySummary": quality,
        "blockers": blockers,
        "warnings": warnings,
        "approvalStateChanged": False,
        "renderAttempted": False,
        "uploadAttempted": False,
        "publicationAttempted": False,
        "originalMediaMutated": False,
        "nextSafestAction": (
            "Complete the human listen-decision template before rendering long-form or shorts branches "
            "from this source-aware spine."
            if blockers
            else "This source-aware refined-stem spine may be used as the inherited baseline for long-form and shorts branch renders."
        ),
    }


def render_markdown(gate: dict[str, Any]) -> str:
    lines = [
        "# Audio Workbench branch inheritance gate",
        "",
        f"- Baseline: `{gate.get('baselineId')}`",
        f"- Status: `{gate.get('status')}`",
        f"- Decision status: `{gate.get('decisionStatus')}`",
        f"- Can inherit for branches: `{gate.get('canInheritForBranches')}`",
        f"- Source-aware branch contract ready: `{gate.get('sourceAwareBranchContractReady')}`",
        f"- Source-aware branch contract: `{gate.get('sourceAwareBranchContractStatus')}`",
        f"- Source-aware roles: `{', '.join(gate.get('sourceAwareObservedRoleIds') or [])}`",
        f"- Branch render audio truth: `{gate.get('branchRenderAudioTruth')}`",
        f"- Mastered-spine-only editing allowed: `{gate.get('masteredSpineOnlyEditingAllowed')}`",
        f"- Publication approved: `{gate.get('publicationApproved')}`",
        f"- Branch inheritance before: `{gate.get('branchInheritanceReadyBefore')}`",
        f"- Branch inheritance after gate: `{gate.get('branchInheritanceReadyAfter')}`",
        f"- Branch state changed by this gate: `{gate.get('branchStateChanged')}`",
        f"- Original media mutated: `{gate.get('originalMediaMutated')}`",
        f"- Render attempted: `{gate.get('renderAttempted')}`",
        "",
        "## Artifact checks",
        "",
        "| Artifact | Exists | Path |",
        "|---|---:|---|",
    ]
    for key, check in gate.get("artifactChecks", {}).items():
        lines.append(f"| {key} | `{check.get('exists')}` | `{check.get('path')}` |")

    lines.extend(["", "## Blockers", ""])
    blockers = gate.get("blockers", [])
    lines.extend([f"- {item}" for item in blockers] or ["- none"])
    lines.extend(["", "## Warnings", ""])
    warnings = gate.get("warnings", [])
    lines.extend([f"- {item}" for item in warnings] or ["- none"])
    lines.extend(["", "## Next safest action", "", gate.get("nextSafestAction", ""), ""])
    return "\n".join(lines)


def render_html(gate: dict[str, Any]) -> str:
    blockers = gate.get("blockers") or []
    warnings = gate.get("warnings") or []
    artifact_rows = []
    for key, check in (gate.get("artifactChecks") or {}).items():
        artifact_rows.append(
            "<tr>"
            f"<td>{html.escape(str(key))}</td>"
            f"<td>{html.escape(str(bool(check.get('exists'))).lower())}</td>"
            f"<td>{html.escape(str(check.get('path') or ''))}</td>"
            "</tr>"
        )
    blocker_items = "".join(f"<li>{html.escape(str(item))}</li>" for item in blockers) or "<li>none</li>"
    warning_items = "".join(f"<li>{html.escape(str(item))}</li>" for item in warnings) or "<li>none</li>"
    return f"""<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>Branch inheritance gate: {html.escape(str(gate.get('baselineId')))}</title>
  <style>
    :root {{
      color-scheme: light dark;
      --bg: #f4eddb;
      --card: #fffaf0;
      --ink: #2e241b;
      --muted: #75664f;
      --line: #dfcda7;
      --accent: #8a5b25;
      --danger: #b34040;
      --safe: #267a52;
    }}
    @media (prefers-color-scheme: dark) {{
      :root {{
        --bg: #151b17;
        --card: #202820;
        --ink: #f4eddb;
        --muted: #c8b895;
        --line: #3e4d3f;
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
    main {{ max-width: 1100px; margin: 0 auto; padding: 42px 24px 64px; }}
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
  </style>
</head>
<body>
  <main>
    <p class="kicker">Quipsly audio workbench</p>
    <h1>Branch inheritance gate</h1>
    <p>This gate decides whether edit branches may inherit the current mastered audio spine. It does not render, upload, publish, or mutate original media.</p>
    <section class="card grid">
      <div class="pill"><strong>Status</strong>{html.escape(str(gate.get('status')))}</div>
      <div class="pill"><strong>Decision status</strong>{html.escape(str(gate.get('decisionStatus')))}</div>
      <div class="pill"><strong>Can inherit</strong><span class="{'ok' if gate.get('canInheritForBranches') else 'no'}">{str(gate.get('canInheritForBranches')).lower()}</span></div>
      <div class="pill"><strong>Source-aware contract</strong>{html.escape(str(gate.get('sourceAwareBranchContractStatus')))}</div>
      <div class="pill"><strong>Stem roles</strong>{html.escape(', '.join(gate.get('sourceAwareObservedRoleIds') or []))}</div>
      <div class="pill"><strong>Audio truth</strong>{html.escape(str(gate.get('branchRenderAudioTruth')))}</div>
      <div class="pill"><strong>Master-only editing</strong>{str(gate.get('masteredSpineOnlyEditingAllowed')).lower()}</div>
      <div class="pill"><strong>Branch state changed</strong>{str(gate.get('branchStateChanged')).lower()}</div>
      <div class="pill"><strong>Render attempted</strong>{str(gate.get('renderAttempted')).lower()}</div>
      <div class="pill"><strong>Original media mutated</strong>{str(gate.get('originalMediaMutated')).lower()}</div>
    </section>
    <section class="card">
      <h2>Blockers</h2>
      <ul>{blocker_items}</ul>
    </section>
    <section class="card">
      <h2>Warnings</h2>
      <ul>{warning_items}</ul>
    </section>
    <section class="card">
      <h2>Artifact checks</h2>
      <table>
        <thead><tr><th>Artifact</th><th>Exists</th><th>Path</th></tr></thead>
        <tbody>{''.join(artifact_rows)}</tbody>
      </table>
    </section>
    <section class="card">
      <h2>Next safest action</h2>
      <p>{html.escape(str(gate.get('nextSafestAction') or ''))}</p>
    </section>
  </main>
</body>
</html>
"""


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--baseline-dir", required=True, type=Path)
    args = parser.parse_args()

    baseline_dir = resolve_baseline_dir(args.baseline_dir)
    gate = build_gate(baseline_dir)
    version = version_from_baseline_id(gate.get("baselineId", "unknown"))
    timestamp = datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S")
    json_path = baseline_dir / f"audio-branch-inheritance-gate-{version}-{timestamp}.json"
    md_path = baseline_dir / f"audio-branch-inheritance-gate-{version}-{timestamp}.md"
    html_path = baseline_dir / f"audio-branch-inheritance-gate-{version}-{timestamp}.html"
    open_command_path = baseline_dir / f"open-audio-branch-inheritance-gate-{version}-{timestamp}.command"
    write_json(json_path, gate)
    md_path.write_text(render_markdown(gate), encoding="utf-8")
    html_path.write_text(render_html(gate), encoding="utf-8")
    write_open_command(open_command_path, html_path)

    stable_json_path = baseline_dir / "BRANCH_INHERITANCE_GATE.json"
    stable_md_path = baseline_dir / "BRANCH_INHERITANCE_GATE.md"
    stable_html_path = baseline_dir / "BRANCH_INHERITANCE_GATE.html"
    stable_open_command_path = baseline_dir / "OPEN_BRANCH_INHERITANCE_GATE.command"
    write_json(stable_json_path, gate)
    stable_md_path.write_text(render_markdown(gate), encoding="utf-8")
    stable_html_path.write_text(render_html(gate), encoding="utf-8")
    write_open_command(stable_open_command_path, stable_html_path)

    manifest_path = baseline_dir / "manifest.json"
    manifest = read_json(manifest_path)
    outputs = manifest.setdefault("outputs", {})
    outputs["latestBranchInheritanceGate"] = str(stable_json_path)
    outputs["latestBranchInheritanceGateMarkdown"] = str(stable_md_path)
    outputs["latestBranchInheritanceGateHtml"] = str(stable_html_path)
    outputs["latestBranchInheritanceGateOpenCommand"] = str(stable_open_command_path)
    outputs["latestBranchInheritanceGateVersioned"] = str(json_path)
    outputs["latestBranchInheritanceGateVersionedMarkdown"] = str(md_path)
    outputs["latestBranchInheritanceGateVersionedHtml"] = str(html_path)
    outputs["latestBranchInheritanceGateVersionedOpenCommand"] = str(open_command_path)
    history = outputs.setdefault("branchInheritanceGates", [])
    if str(json_path) not in history:
        history.append(str(json_path))
    manifest["branchInheritanceGateStatus"] = gate["status"]
    manifest["branchInheritanceReady"] = gate["canInheritForBranches"]
    if not gate["canInheritForBranches"]:
        manifest["branchRenderReady"] = False
    manifest["branchInheritanceGateSourceAwareBranchContractReady"] = gate["sourceAwareBranchContractReady"]
    manifest["branchInheritanceGateSourceAwareBranchContractStatus"] = gate["sourceAwareBranchContractStatus"]
    manifest["branchInheritanceGateSourceAwareRequiredRoleIds"] = gate["sourceAwareRequiredRoleIds"]
    manifest["branchInheritanceGateSourceAwareObservedRoleIds"] = gate["sourceAwareObservedRoleIds"]
    manifest["branchInheritanceGateSourceAwareMissingRoleIds"] = gate["sourceAwareMissingRoleIds"]
    manifest["branchInheritanceGateSourceAwareStemStatus"] = gate["sourceAwareStemStatus"]
    manifest["branchInheritanceGateSourceAwareStemReadyCount"] = gate["sourceAwareStemReadyCount"]
    manifest["branchInheritanceGateSourceAwareStemResolvedCount"] = gate["sourceAwareStemResolvedCount"]
    manifest["branchInheritanceGateSourceAwareStemWarningCount"] = gate["sourceAwareStemWarningCount"]
    manifest["branchInheritanceGateSourceAwareTimingContractStatus"] = gate["sourceAwareTimingContractStatus"]
    manifest["branchInheritanceGateSourceAwareTimingContractReady"] = gate["sourceAwareTimingContractReady"]
    manifest["branchInheritanceGateSourceAwareTimingContractReadyRoleCount"] = gate["sourceAwareTimingContractReadyRoleCount"]
    manifest["branchInheritanceGateSourceAwareTimingContractFullLengthStemCount"] = gate["sourceAwareTimingContractFullLengthStemCount"]
    manifest["branchInheritanceGateSourceAwareTimingContractHardStopCount"] = gate["sourceAwareTimingContractHardStopCount"]
    manifest["branchInheritanceGateSourceAwareTimingContractMaxDurationDeltaToMasterSeconds"] = gate["sourceAwareTimingContractMaxDurationDeltaToMasterSeconds"]
    manifest["branchInheritanceGateSourceAwareTimingContractDurationToleranceSeconds"] = gate["sourceAwareTimingContractDurationToleranceSeconds"]
    manifest["branchInheritanceGatePostApprovalInheritsSourceAwareAudioTruth"] = gate["postApprovalInheritsSourceAwareAudioTruth"]
    manifest["branchInheritanceGatePostApprovalSourceAwareAudioContractStatus"] = gate["postApprovalSourceAwareAudioContractStatus"]
    manifest["branchInheritanceGatePostApprovalSourceAwareAudioReadyStemCount"] = gate["postApprovalSourceAwareAudioReadyStemCount"]
    manifest["branchInheritanceGatePostApprovalMasteredSpineOnlyEditingAllowed"] = gate["postApprovalMasteredSpineOnlyEditingAllowed"]
    manifest["branchRenderAudioTruth"] = gate["branchRenderAudioTruth"]
    manifest["masteredSpineUse"] = gate["masteredSpineUse"]
    manifest["masteredSpineOnlyEditingAllowed"] = gate["masteredSpineOnlyEditingAllowed"]
    write_json(manifest_path, manifest)

    print(json.dumps({"json": str(stable_json_path), "markdown": str(stable_md_path), "html": str(stable_html_path), "openCommand": str(stable_open_command_path), "status": gate["status"]}, indent=2))


if __name__ == "__main__":
    main()
