#!/usr/bin/env python3
"""Route the next Audio Workbench action from the current listen outcome.

This is deliberately a dispatcher, not an approval tool:
- it reads the manifest's current approval/branch state;
- it writes a timestamped report and registers it in the manifest;
- it exposes only the commands that are safe for that state;
- it never records approval, renders branches, publishes, or mutates source media.
"""

from __future__ import annotations

import argparse
import html
import json
import os
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


APPROVED_STATUSES = {
    "human-approved-for-branch-inheritance",
    "human-approved-for-publication",
    "approved-for-branch-inheritance",
}

FAILED_OR_REPAIR_STATUSES = {
    "failed-human-listen",
    "human-listen-failed",
    "rejected-human-listen",
    "needs-focused-proof",
}


def load_json(path: Path) -> dict[str, Any]:
    return json.loads(path.read_text(encoding="utf-8"))


def write_json(path: Path, payload: dict[str, Any]) -> None:
    path.write_text(json.dumps(payload, indent=2, sort_keys=True) + "\n", encoding="utf-8")


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


def safe_slug(value: str) -> str:
    out = "".join(ch.lower() if ch.isalnum() else "-" for ch in value)
    while "--" in out:
        out = out.replace("--", "-")
    return out.strip("-") or "audio-baseline"


def shell_quote(path: str) -> str:
    return "'" + path.replace("'", "'\\''") + "'"


def command_block(commands: list[str] | None) -> str:
    if not commands:
        return "_No command exposed for the current state._"
    return "```bash\n" + "\n".join(commands) + "\n```"


def command_block_html(commands: list[str] | None) -> str:
    if not commands:
        return '<p class="empty">No command exposed for the current state.</p>'
    return "<pre><code>" + html.escape("\n".join(commands)) + "</code></pre>"


def existing_path_commands(paths: list[str | None]) -> list[str]:
    commands: list[str] = []
    for path in paths:
        if path and Path(path).exists():
            commands.append(f"open {shell_quote(path)}")
    return commands


def normalize_commands(value: Any) -> list[str]:
    if value is None:
        return []
    if isinstance(value, str):
        return [value]
    if isinstance(value, list):
        return [str(item) for item in value]
    if isinstance(value, dict):
        lines: list[str] = []
        for key, command in value.items():
            lines.append(f"# {key}")
            if isinstance(command, list):
                lines.extend(str(item) for item in command)
            else:
                lines.append(str(command))
        return lines
    return [str(value)]


def load_optional_json(path_text: str | None) -> dict[str, Any]:
    if not path_text:
        return {}
    path = Path(path_text)
    if not path.exists():
        return {}
    return load_json(path)


def int_value(value: Any) -> int:
    try:
        return int(value)
    except (TypeError, ValueError):
        return 0


def source_aware_branch_contract(manifest: dict[str, Any]) -> dict[str, Any]:
    branch_audio_truth = str(manifest.get("branchRenderAudioTruth") or "")
    mastered_spine_only_allowed = bool(manifest.get("masteredSpineOnlyEditingAllowed"))
    gate_mastered_spine_only_allowed = bool(
        manifest.get("branchInheritanceGatePostApprovalMasteredSpineOnlyEditingAllowed")
    )
    stem_ready_count = int_value(manifest.get("branchInheritanceGateSourceAwareStemReadyCount"))
    stem_resolved_count = int_value(manifest.get("branchInheritanceGateSourceAwareStemResolvedCount"))
    timing_hard_stop_count = int_value(
        manifest.get("branchInheritanceGateSourceAwareTimingContractHardStopCount")
    )
    contract_ready = (
        bool(manifest.get("branchInheritanceGateSourceAwareBranchContractReady"))
        and str(manifest.get("branchInheritanceGateSourceAwareBranchContractStatus") or "")
        == "ready-source-aware-branch-inheritance"
        and stem_ready_count >= 3
        and stem_resolved_count >= 3
        and bool(manifest.get("branchInheritanceGateSourceAwareTimingContractReady"))
        and timing_hard_stop_count == 0
        and bool(manifest.get("branchInheritanceGatePostApprovalInheritsSourceAwareAudioTruth"))
        and str(manifest.get("branchInheritanceGatePostApprovalSourceAwareAudioContractStatus") or "")
        == "ready-source-aware-editable"
        and branch_audio_truth == "source-aware-refined-stems"
        and not mastered_spine_only_allowed
        and not gate_mastered_spine_only_allowed
    )
    return {
        "sourceAwareBranchGateRequired": True,
        "sourceAwareBranchGateReady": contract_ready,
        "sourceAwareBranchGateStatus": manifest.get("branchInheritanceGateStatus"),
        "sourceAwareBranchContractStatus": manifest.get(
            "branchInheritanceGateSourceAwareBranchContractStatus"
        ),
        "sourceAwareStemReadyCount": stem_ready_count,
        "sourceAwareStemResolvedCount": stem_resolved_count,
        "sourceAwareTimingContractReady": bool(
            manifest.get("branchInheritanceGateSourceAwareTimingContractReady")
        ),
        "sourceAwareTimingHardStopCount": timing_hard_stop_count,
        "postApprovalInheritsSourceAwareAudioTruth": bool(
            manifest.get("branchInheritanceGatePostApprovalInheritsSourceAwareAudioTruth")
        ),
        "postApprovalSourceAwareAudioContractStatus": manifest.get(
            "branchInheritanceGatePostApprovalSourceAwareAudioContractStatus"
        ),
        "branchRenderAudioTruth": branch_audio_truth,
        "masteredSpineOnlyEditingAllowed": mastered_spine_only_allowed,
        "branchGateMasteredSpineOnlyEditingAllowed": gate_mastered_spine_only_allowed,
    }


def determine_route(manifest: dict[str, Any], latest_decision: dict[str, Any]) -> dict[str, Any]:
    approval_status = str(manifest.get("approvalStatus") or "")
    decision_status = str(
        latest_decision.get("decisionStatus")
        or latest_decision.get("status")
        or ""
    )
    package_ready = bool(manifest.get("packageReadyForHumanListen"))
    branch_inheritance_ready = bool(manifest.get("branchInheritanceReady"))
    branch_render_ready = bool(manifest.get("branchRenderReady"))
    source_contract = source_aware_branch_contract(manifest)
    source_aware_ready = bool(source_contract["sourceAwareBranchGateReady"])
    publication_approved = bool(manifest.get("publicationApproved")) or bool(
        latest_decision.get("publicationApproved")
    )

    combined_statuses = {approval_status, decision_status}
    if combined_statuses & FAILED_OR_REPAIR_STATUSES:
        route_status = "repair-needed-after-human-listen"
        next_action = (
            "Use the recorded human listen issue(s) to run the locked repair preflight "
            "or create a v007/timestamped candidate. Do not overwrite v006."
        )
    elif approval_status in APPROVED_STATUSES and branch_render_ready and source_aware_ready:
        route_status = "approved-ready-for-branch-render"
        next_action = (
            "Run approved branch render commands from source-aware refined stems, then "
            "QC each branch before publication."
        )
    elif approval_status in APPROVED_STATUSES and branch_render_ready and not source_aware_ready:
        route_status = "approved-source-aware-gate-blocked"
        next_action = (
            "Do not render yet. A stale branch-render-ready flag exists, but the "
            "source-aware refined-stem/timing contract is not proven. Refresh the "
            "source-aware branch gate and preflight before exposing render commands."
        )
    elif approval_status in APPROVED_STATUSES and branch_inheritance_ready and source_aware_ready:
        route_status = "approved-refresh-branch-preflight"
        next_action = (
            "Refresh branch render preflight/executor so approved branch commands "
            "are generated from current source-aware refined-stem truth."
        )
    elif approval_status in APPROVED_STATUSES:
        route_status = "approved-refresh-source-aware-branch-gate"
        next_action = (
            "Refresh the source-aware branch inheritance gate. Approval exists, but "
            "editable branch readiness has not been recalculated from Charlie, Homer, "
            "and clip/source refined stems."
        )
    elif package_ready:
        route_status = "waiting-for-human-listen"
        next_action = (
            "Open the listen session or reviewer console, complete a real listen pass, "
            "then record pass/fail through the guarded decision recorder."
        )
    else:
        route_status = "repair-review-package-first"
        next_action = (
            "Repair missing review artifacts or readiness errors before asking for a "
            "human listen decision."
        )

    route = {
        "routeStatus": route_status,
        "nextSafestAction": next_action,
        "approvalStatus": approval_status,
        "decisionStatus": decision_status,
        "packageReadyForHumanListen": package_ready,
        "branchInheritanceReady": branch_inheritance_ready,
        "branchRenderReady": branch_render_ready,
        "publicationApproved": publication_approved,
    }
    route.update(source_contract)
    route["postApprovalNextGateSequence"] = [
        "record guarded human listen decision",
        "refresh source-aware branch gate",
        "refresh branch render preflight",
        "regenerate approved branch render executor",
        "render candidate branches from refined stems only",
        "QC branches and prepare manual publication packets",
    ]
    return route


def build_commands(
    baseline_dir: Path,
    manifest: dict[str, Any],
    route: dict[str, Any],
    preflight: dict[str, Any],
) -> dict[str, list[str]]:
    outputs = manifest.get("outputs") or {}
    route_status = route["routeStatus"]
    preflight_commands = preflight.get("commands") or {}

    open_review = existing_path_commands(
        [
            output_path(outputs.get("latestHumanListenSessionReadme")),
            output_path(outputs.get("latestAudioReviewerConsoleHtml")),
            output_path(outputs.get("latestReviewerNotesTemplateMarkdown")),
            output_path(outputs.get("latestReviewHandoffIndexMarkdown")),
        ]
    )

    record_pass = [
        f"OUT={shell_quote(str(baseline_dir))}",
        "python3 apps/QuipslyStudio/script/audio_workbench_record_listen_decision.py \\",
        '  --baseline-dir "$OUT" \\',
        "  --status human-approved-for-branch-inheritance \\",
        '  --reviewer "Charlie or Mako" \\',
        '  --notes "Human listened to v006 bundle and approved the audio spine for source-aware branch-gate review. Branch inheritance still requires refined-stem/timing proof." \\',
        "  --confirm-human-listened",
        'python3 apps/QuipslyStudio/script/audio_workbench_post_listen_refresh.py --baseline-dir "$OUT"',
    ]

    record_fail = [
        f"OUT={shell_quote(str(baseline_dir))}",
        "python3 apps/QuipslyStudio/script/audio_workbench_record_listen_decision.py \\",
        '  --baseline-dir "$OUT" \\',
        "  --status failed-human-listen \\",
        '  --reviewer "Charlie or Mako" \\',
        '  --notes "Human listen found an issue; render v007/timestamped repair candidate instead of overwriting v006." \\',
        '  --issue "Describe the failing proof window or audio artifact here" \\',
        "  --confirm-human-listened",
        'python3 apps/QuipslyStudio/script/audio_workbench_post_listen_refresh.py --baseline-dir "$OUT"',
    ]

    refresh_branch_gate = [
        f"OUT={shell_quote(str(baseline_dir))}",
        'python3 apps/QuipslyStudio/script/audio_workbench_post_listen_refresh.py --baseline-dir "$OUT"',
    ]
    refresh_branch_preflight = [
        f"OUT={shell_quote(str(baseline_dir))}",
        'python3 apps/QuipslyStudio/script/audio_workbench_post_listen_refresh.py --baseline-dir "$OUT"',
    ]
    repair_preflight = [
        f"OUT={shell_quote(str(baseline_dir))}",
        'python3 apps/QuipslyStudio/script/audio_workbench_bleed_repair_executor.py --baseline-dir "$OUT" --render-proof',
    ]

    approved_render: list[str] = []
    if route_status == "approved-ready-for-branch-render" and route.get("sourceAwareBranchGateReady"):
        approved_render = normalize_commands(preflight_commands.get("renderAfterApproval"))

    return {
        "openReview": open_review,
        "recordPassAfterHumanListen": record_pass if route_status == "waiting-for-human-listen" else [],
        "recordFailAfterHumanListen": record_fail if route_status == "waiting-for-human-listen" else [],
        "refreshBranchGate": (
            refresh_branch_gate
            if route_status
            in {"approved-refresh-source-aware-branch-gate", "approved-source-aware-gate-blocked"}
            else []
        ),
        "refreshBranchPreflight": (
            refresh_branch_preflight
            if route_status == "approved-refresh-branch-preflight"
            else []
        ),
        "repairPreflight": repair_preflight if route_status == "repair-needed-after-human-listen" else [],
        "approvedBranchRender": approved_render,
    }


def render_markdown(report: dict[str, Any]) -> str:
    route = report["route"]
    commands = report["commands"]
    lines = [
        f"# Post-Listen Outcome Router: {report['baselineId']}",
        "",
        f"Generated: `{report['generatedAt']}`",
        "",
        "This is a state router, not an approval or render tool. It registers evidence only.",
        "",
        "## Current route",
        "",
        f"- Route status: `{route['routeStatus']}`",
        f"- Approval status: `{route['approvalStatus'] or 'unknown'}`",
        f"- Listen decision status: `{route['decisionStatus'] or 'unknown'}`",
        f"- Package ready for human listen: `{str(route['packageReadyForHumanListen']).lower()}`",
        f"- Branch inheritance ready: `{str(route['branchInheritanceReady']).lower()}`",
        f"- Branch render ready: `{str(route['branchRenderReady']).lower()}`",
        f"- Source-aware branch gate required: `{str(route['sourceAwareBranchGateRequired']).lower()}`",
        f"- Source-aware branch gate ready: `{str(route['sourceAwareBranchGateReady']).lower()}`",
        f"- Source-aware branch contract: `{route['sourceAwareBranchContractStatus'] or 'unknown'}`",
        f"- Source-aware stem readiness: `{route['sourceAwareStemReadyCount']}` ready / `{route['sourceAwareStemResolvedCount']}` resolved",
        f"- Source-aware timing ready: `{str(route['sourceAwareTimingContractReady']).lower()}` with `{route['sourceAwareTimingHardStopCount']}` hard stops",
        f"- Branch render audio truth: `{route['branchRenderAudioTruth'] or 'unknown'}`",
        f"- Mastered-spine-only editing allowed: `{str(route['masteredSpineOnlyEditingAllowed']).lower()}`",
        f"- Publication approved: `{str(route['publicationApproved']).lower()}`",
        "",
        "## Required post-approval gate sequence",
        "",
        *[f"{index}. {step}" for index, step in enumerate(route["postApprovalNextGateSequence"], start=1)],
        "",
        "## Safety assertions",
        "",
        f"- Approval state changed by this router: `{str(report['approvalStateChanged']).lower()}`",
        f"- Render attempted by this router: `{str(report['renderAttempted']).lower()}`",
        f"- Original media mutated by this router: `{str(report['originalMediaMutated']).lower()}`",
        f"- Real branch render commands exposed: `{str(report['realBranchRenderCommandsExposed']).lower()}`",
        "",
        "## Next safest action",
        "",
        route["nextSafestAction"],
        "",
        "## Open current review surface",
        "",
        command_block(commands["openReview"]),
        "",
        "## If human listen passes",
        "",
        command_block(commands["recordPassAfterHumanListen"]),
        "",
        "## If human listen fails",
        "",
        command_block(commands["recordFailAfterHumanListen"]),
        "",
        "## If approval was recorded but branch gate needs refresh",
        "",
        command_block(commands["refreshBranchGate"]),
        "",
        "## If approval was recorded and branch preflight needs refresh",
        "",
        command_block(commands["refreshBranchPreflight"]),
        "",
        "## If human listen failed and repair needs preflight",
        "",
        command_block(commands["repairPreflight"]),
        "",
        "## Approved branch render commands",
        "",
        command_block(commands["approvedBranchRender"]),
        "",
    ]
    return "\n".join(lines)


def render_html(report: dict[str, Any]) -> str:
    route = report["route"]
    commands = report["commands"]
    route_status = str(route["routeStatus"])
    safety_items = [
        ("Approval changed", report["approvalStateChanged"]),
        ("Render attempted", report["renderAttempted"]),
        ("Original media mutated", report["originalMediaMutated"]),
        ("Branch render commands exposed", report["realBranchRenderCommandsExposed"]),
    ]
    safety_html = "\n".join(
        f'<span class="pill {"bad" if value else "good"}">{html.escape(label)}: {str(value).lower()}</span>'
        for label, value in safety_items
    )
    sections = [
        ("Open current review surface", "Start here if the spine has not been judged yet.", commands["openReview"]),
        ("If human listen passes", "Use only after a real listen pass. This records approval, then refreshes the source-aware post-listen gates in order.", commands["recordPassAfterHumanListen"]),
        ("If human listen fails", "Use when a specific audible issue is found. This routes toward v007 repair without overwriting v006.", commands["recordFailAfterHumanListen"]),
        ("Refresh source-aware branch gate", "Use after approval exists but refined-stem/timing branch readiness has not been recalculated. This runs the full post-listen refresh sequence.", commands["refreshBranchGate"]),
        ("Refresh branch preflight", "Use after source-aware branch inheritance is ready but render commands need regeneration. This runs the full post-listen refresh sequence.", commands["refreshBranchPreflight"]),
        ("Repair preflight", "Use after a failed listen has been recorded.", commands["repairPreflight"]),
        ("Approved branch render", "Only appears after approval, source-aware branch gate, and render preflight are all true.", commands["approvedBranchRender"]),
    ]
    section_html = "\n".join(
        f"""
        <section>
          <h2>{html.escape(title)}</h2>
          <p>{html.escape(description)}</p>
          {command_block_html(command_list)}
        </section>
        """
        for title, description, command_list in sections
    )
    return f"""<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Episode 4 Audio Post-Listen Router</title>
  <style>
    :root {{
      color-scheme: light;
      --ink: #35281f;
      --muted: #746757;
      --paper: #fffaf0;
      --panel: #fffdf7;
      --line: #e6d5ad;
      --moss: #4f6d45;
      --gold: #c78b2c;
      --clay: #b64e3c;
      --sky: #2c6478;
      --shadow: 0 18px 55px rgba(65, 42, 18, 0.14);
    }}
    * {{ box-sizing: border-box; }}
    body {{
      margin: 0;
      font-family: ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      color: var(--ink);
      background:
        radial-gradient(circle at top left, rgba(199, 139, 44, 0.22), transparent 34rem),
        radial-gradient(circle at bottom right, rgba(79, 109, 69, 0.18), transparent 30rem),
        var(--paper);
      line-height: 1.5;
    }}
    main {{ max-width: 1120px; margin: 0 auto; padding: 44px 24px 80px; }}
    .hero {{
      border: 1px solid var(--line);
      border-radius: 30px;
      background: rgba(255, 253, 247, 0.9);
      box-shadow: var(--shadow);
      padding: 34px;
    }}
    .kicker {{
      color: var(--gold);
      font-size: 12px;
      font-weight: 900;
      letter-spacing: 0.28em;
      text-transform: uppercase;
    }}
    h1 {{
      margin: 10px 0 12px;
      font-family: Georgia, "Times New Roman", serif;
      font-size: clamp(34px, 6vw, 62px);
      line-height: 0.96;
    }}
    .status {{
      display: inline-flex;
      align-items: center;
      gap: 10px;
      margin-top: 12px;
      padding: 12px 16px;
      border-radius: 999px;
      background: rgba(199, 139, 44, 0.16);
      border: 1px solid rgba(199, 139, 44, 0.32);
      color: var(--ink);
      font-weight: 800;
    }}
    .grid {{
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
      gap: 14px;
      margin-top: 22px;
    }}
    .metric {{
      border: 1px solid var(--line);
      border-radius: 18px;
      padding: 15px;
      background: #fffaf2;
    }}
    .metric strong {{ display: block; font-size: 12px; color: var(--muted); text-transform: uppercase; letter-spacing: .12em; }}
    .metric span {{ display: block; margin-top: 5px; font-weight: 850; }}
    .safety {{ display: flex; flex-wrap: wrap; gap: 10px; margin: 22px 0 8px; }}
    .pill {{
      display: inline-flex;
      padding: 8px 11px;
      border-radius: 999px;
      font-size: 12px;
      font-weight: 850;
      border: 1px solid transparent;
    }}
    .pill.good {{ color: #23613c; background: rgba(61, 137, 83, 0.13); border-color: rgba(61, 137, 83, 0.25); }}
    .pill.bad {{ color: #8d2f24; background: rgba(182, 78, 60, 0.13); border-color: rgba(182, 78, 60, 0.25); }}
    section {{
      margin-top: 22px;
      border: 1px solid var(--line);
      border-radius: 24px;
      background: rgba(255, 253, 247, 0.88);
      box-shadow: 0 8px 30px rgba(65, 42, 18, 0.08);
      padding: 24px;
    }}
    h2 {{
      margin: 0 0 6px;
      font-family: Georgia, "Times New Roman", serif;
      font-size: 25px;
    }}
    p {{ color: var(--muted); margin: 0 0 13px; }}
    pre {{
      white-space: pre-wrap;
      overflow-x: auto;
      margin: 0;
      padding: 16px;
      border-radius: 16px;
      background: #241d17;
      color: #fff3d5;
      border: 1px solid rgba(255, 255, 255, 0.12);
      font-size: 13px;
    }}
    .empty {{
      margin: 0;
      padding: 14px 16px;
      border-radius: 16px;
      background: rgba(116, 101, 82, 0.10);
      color: var(--muted);
      font-weight: 700;
    }}
    .next {{
      margin-top: 20px;
      padding: 18px;
      border-radius: 20px;
      background: rgba(44, 100, 120, 0.10);
      border: 1px solid rgba(44, 100, 120, 0.22);
    }}
  </style>
</head>
<body>
  <main>
    <div class="hero">
      <div class="kicker">Quipsly Audio Workbench</div>
      <h1>Episode 4 post-listen router</h1>
      <p>This page answers one question: what is the safest next action after the v006 audio-spine listen?</p>
      <div class="status">Route: {html.escape(route_status)}</div>
      <div class="grid">
        <div class="metric"><strong>Approval</strong><span>{html.escape(str(route["approvalStatus"] or "unknown"))}</span></div>
        <div class="metric"><strong>Human listen package</strong><span>{str(route["packageReadyForHumanListen"]).lower()}</span></div>
        <div class="metric"><strong>Branch inheritance</strong><span>{str(route["branchInheritanceReady"]).lower()}</span></div>
        <div class="metric"><strong>Branch render</strong><span>{str(route["branchRenderReady"]).lower()}</span></div>
        <div class="metric"><strong>Source-aware gate</strong><span>{str(route["sourceAwareBranchGateReady"]).lower()}</span></div>
        <div class="metric"><strong>Audio truth</strong><span>{html.escape(str(route["branchRenderAudioTruth"] or "unknown"))}</span></div>
        <div class="metric"><strong>Flat master editable</strong><span>{str(route["masteredSpineOnlyEditingAllowed"]).lower()}</span></div>
      </div>
      <div class="next"><strong>Next safest action:</strong> {html.escape(str(route["nextSafestAction"]))}</div>
      <div class="safety">{safety_html}</div>
    </div>
    {section_html}
  </main>
</body>
</html>
"""


def write_open_command(path: Path, target: Path) -> None:
    path.write_text("#!/bin/zsh\nopen " + shell_quote(str(target)) + "\n", encoding="utf-8")
    os.chmod(path, 0o755)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--baseline-dir", required=True, type=Path)
    args = parser.parse_args()

    baseline_dir = resolve_baseline_dir(args.baseline_dir)
    manifest_path = baseline_dir / "manifest.json"
    manifest_before = load_json(manifest_path)
    manifest = dict(manifest_before)
    outputs = manifest.setdefault("outputs", {})

    latest_decision = load_optional_json(output_path(outputs.get("latestListenDecision")))
    branch_preflight = load_optional_json(output_path(outputs.get("branchRenderPreflight")))
    route = determine_route(manifest, latest_decision)
    commands = build_commands(baseline_dir, manifest, route, branch_preflight)
    generated_at = datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S")
    baseline_id = str(manifest.get("baselineId") or "audio-baseline")
    slug = safe_slug(baseline_id.replace("episode-4-conformed-production-baseline-", ""))

    output_json = baseline_dir / f"audio-post-listen-outcome-router-{slug}-{generated_at}.json"
    output_md = baseline_dir / f"audio-post-listen-outcome-router-{slug}-{generated_at}.md"
    output_html = baseline_dir / f"audio-post-listen-outcome-router-{slug}-{generated_at}.html"
    stable_json = baseline_dir / "POST_LISTEN_OUTCOME_ROUTER.json"
    stable_md = baseline_dir / "POST_LISTEN_OUTCOME_ROUTER.md"
    stable_html = baseline_dir / "POST_LISTEN_OUTCOME_ROUTER.html"
    stable_open_command = baseline_dir / "OPEN_POST_LISTEN_OUTCOME_ROUTER.command"

    report = {
        "schema": "quipsly.audio-workbench.post-listen-outcome-router.v1",
        "generatedAt": generated_at,
        "baselineDir": str(baseline_dir),
        "baselineId": baseline_id,
        "route": route,
        "commands": commands,
        "approvalStateChanged": False,
        "renderAttempted": False,
        "originalMediaMutated": False,
        "realBranchRenderCommandsExposed": bool(commands["approvedBranchRender"]),
        "manifest": {
            "approvalStatus": manifest.get("approvalStatus"),
            "branchInheritanceReady": bool(manifest.get("branchInheritanceReady")),
            "branchRenderReady": bool(manifest.get("branchRenderReady")),
            "packageReadyForHumanListen": bool(manifest.get("packageReadyForHumanListen")),
            "sourceAwareBranchGateReady": bool(route.get("sourceAwareBranchGateReady")),
            "branchRenderAudioTruth": route.get("branchRenderAudioTruth"),
            "masteredSpineOnlyEditingAllowed": route.get("masteredSpineOnlyEditingAllowed"),
        },
    }

    write_json(output_json, report)
    markdown = render_markdown(report) + "\n"
    html_page = render_html(report)
    output_md.write_text(markdown, encoding="utf-8")
    output_html.write_text(html_page, encoding="utf-8")
    write_json(stable_json, report)
    stable_md.write_text(markdown, encoding="utf-8")
    stable_html.write_text(html_page, encoding="utf-8")
    write_open_command(stable_open_command, stable_html)

    outputs["latestPostListenOutcomeRouter"] = str(output_json)
    outputs["latestPostListenOutcomeRouterMarkdown"] = str(output_md)
    outputs["latestPostListenOutcomeRouterHtml"] = str(output_html)
    outputs["latestPostListenOutcomeRouterStableJson"] = str(stable_json)
    outputs["latestPostListenOutcomeRouterStableMarkdown"] = str(stable_md)
    outputs["latestPostListenOutcomeRouterStableHtml"] = str(stable_html)
    outputs["latestPostListenOutcomeRouterOpenCommand"] = str(stable_open_command)
    outputs["latestAudioPostListenOutcomeRouter"] = str(output_json)
    outputs["latestAudioPostListenOutcomeRouterMarkdown"] = str(output_md)
    outputs["latestAudioPostListenOutcomeRouterHtml"] = str(output_html)
    outputs["latestAudioPostListenOutcomeRouterStableJson"] = str(stable_json)
    outputs["latestAudioPostListenOutcomeRouterStableMarkdown"] = str(stable_md)
    outputs["latestAudioPostListenOutcomeRouterStableHtml"] = str(stable_html)
    outputs["latestAudioPostListenOutcomeRouterOpenCommand"] = str(stable_open_command)
    history = outputs.setdefault("postListenOutcomeRouters", [])
    if str(output_json) not in history:
        history.append(str(output_json))
    manifest["latestPostListenOutcomeRouterGeneratedAt"] = generated_at
    manifest["latestAudioPostListenOutcomeRouterGeneratedAt"] = generated_at
    manifest["postListenOutcomeRouterCount"] = len(history)
    manifest["postListenOutcomeRouterStatus"] = route["routeStatus"]
    manifest["audioPostListenOutcomeRouterLatestStatus"] = route["routeStatus"]
    manifest["audioPostListenOutcomeRouterApprovalStatus"] = route["approvalStatus"]
    manifest["audioPostListenOutcomeRouterPackageReadyForHumanListen"] = route["packageReadyForHumanListen"]
    manifest["audioPostListenOutcomeRouterBranchInheritanceReady"] = route["branchInheritanceReady"]
    manifest["audioPostListenOutcomeRouterBranchRenderReady"] = route["branchRenderReady"]
    manifest["audioPostListenOutcomeRouterSourceAwareBranchGateRequired"] = route[
        "sourceAwareBranchGateRequired"
    ]
    manifest["audioPostListenOutcomeRouterSourceAwareBranchGateReady"] = route[
        "sourceAwareBranchGateReady"
    ]
    manifest["audioPostListenOutcomeRouterSourceAwareBranchContractStatus"] = route[
        "sourceAwareBranchContractStatus"
    ]
    manifest["audioPostListenOutcomeRouterSourceAwareStemReadyCount"] = route[
        "sourceAwareStemReadyCount"
    ]
    manifest["audioPostListenOutcomeRouterSourceAwareStemResolvedCount"] = route[
        "sourceAwareStemResolvedCount"
    ]
    manifest["audioPostListenOutcomeRouterSourceAwareTimingContractReady"] = route[
        "sourceAwareTimingContractReady"
    ]
    manifest["audioPostListenOutcomeRouterSourceAwareTimingHardStopCount"] = route[
        "sourceAwareTimingHardStopCount"
    ]
    manifest["audioPostListenOutcomeRouterBranchRenderAudioTruth"] = route[
        "branchRenderAudioTruth"
    ]
    manifest["audioPostListenOutcomeRouterMasteredSpineOnlyEditingAllowed"] = route[
        "masteredSpineOnlyEditingAllowed"
    ]
    manifest["audioPostListenOutcomeRouterPostApprovalNextGateSequence"] = route[
        "postApprovalNextGateSequence"
    ]
    manifest["postListenOutcomeRouterApprovalStatePreserved"] = (
        manifest_before.get("approvalStatus") == manifest.get("approvalStatus")
        and bool(manifest_before.get("branchInheritanceReady")) == bool(manifest.get("branchInheritanceReady"))
        and bool(manifest_before.get("branchRenderReady")) == bool(manifest.get("branchRenderReady"))
    )
    manifest["audioPostListenOutcomeRouterApprovalStatePreserved"] = manifest["postListenOutcomeRouterApprovalStatePreserved"]
    manifest["postListenOutcomeRouterRenderAttempted"] = False
    manifest["audioPostListenOutcomeRouterRenderAttempted"] = False
    manifest["postListenOutcomeRouterOriginalMediaMutated"] = False
    manifest["audioPostListenOutcomeRouterOriginalMediaMutated"] = False
    manifest["postListenOutcomeRouterRealBranchRenderCommandsExposed"] = bool(
        commands["approvedBranchRender"]
    )
    manifest["audioPostListenOutcomeRouterRealBranchRenderCommandsExposed"] = bool(
        commands["approvedBranchRender"]
    )
    manifest["audioPostListenOutcomeRouterHtmlPresent"] = output_html.exists() and stable_html.exists()
    manifest["audioPostListenOutcomeRouterOpenCommandPresent"] = stable_open_command.exists()
    write_json(manifest_path, manifest)

    print(f"Wrote {output_md}")
    print(f"Wrote {output_json}")
    print(f"Wrote {output_html}")
    print(f"Wrote {stable_open_command}")
    print(f"Route status: {route['routeStatus']}")
    print(f"Approval state preserved: {manifest['postListenOutcomeRouterApprovalStatePreserved']}")
    print(f"Real branch render commands exposed: {bool(commands['approvedBranchRender'])}")


if __name__ == "__main__":
    main()
