#!/usr/bin/env python3
"""Create a stable current-state runway report for an audio baseline.

This script is deliberately a readback/control-plane tool. It gathers the
existing Episode audio review surfaces into one stable report so humans and
agents can see the next safe action before approving, branching, rendering,
uploading, publishing, or touching source media.
"""

from __future__ import annotations

import argparse
import html
import json
import os
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


DEFAULT_BASELINE_DIR = Path(
    "/Volumes/My Passport/Episode_and_Shorts_Test/Episode_4_Sync_Producer_Takes/"
    "20260709-episode4-conformed-audio-baseline-v005-20260709-183059/work/"
    "conformed-production-baseline/profile-promotion-v005-to-v006-homer-preserving-clean-20260710-030310"
)


def read_json(path: Path) -> dict[str, Any]:
    return json.loads(path.read_text(encoding="utf-8"))


def write_json(path: Path, payload: dict[str, Any]) -> None:
    path.write_text(json.dumps(payload, indent=2, sort_keys=True) + "\n", encoding="utf-8")


def resolve_baseline_dir(input_path: Path) -> Path:
    path = input_path.expanduser().resolve()
    if (path / "manifest.json").exists():
        return path
    nested = path / "work" / "conformed-production-baseline"
    if (nested / "manifest.json").exists():
        return nested.resolve()
    raise FileNotFoundError(f"Could not find manifest.json under {input_path}")


def safe_slug(value: str) -> str:
    out = "".join(ch.lower() if ch.isalnum() else "-" for ch in str(value))
    while "--" in out:
        out = out.replace("--", "-")
    return out.strip("-") or "audio-baseline"


def shell_quote(value: str) -> str:
    return "'" + value.replace("'", "'\"'\"'") + "'"


def first_path(value: Any) -> str | None:
    if isinstance(value, str) and value:
        return value
    if isinstance(value, list):
        for item in reversed(value):
            path = first_path(item)
            if path:
                return path
    if isinstance(value, dict):
        for key in (
            "path",
            "jsonPath",
            "markdownPath",
            "htmlPath",
            "openCommand",
            "versionedPath",
            "versionedJsonPath",
            "versionedMarkdownPath",
            "versionedHtmlPath",
            "versionedOpenCommand",
            "m4aPath",
            "wavPath",
            "playlistPath",
        ):
            subvalue = value.get(key)
            if isinstance(subvalue, str) and subvalue:
                return subvalue
    return None


def output_path(value: Any) -> str | None:
    return first_path(value)


def count_value(value: Any) -> int:
    try:
        if value is None:
            return 0
        return int(value)
    except (TypeError, ValueError):
        return 0


def bool_value(value: Any) -> bool:
    return bool(value)


def load_json_path(path: str | None) -> dict[str, Any]:
    if not path:
        return {}
    candidate = Path(path)
    if not candidate.exists() or candidate.suffix.lower() != ".json":
        return {}
    try:
        return read_json(candidate)
    except json.JSONDecodeError:
        return {}


def load_output_report(outputs: dict[str, Any], keys: str | list[str], fallback: Path | None = None) -> dict[str, Any]:
    key_list = [keys] if isinstance(keys, str) else keys
    for key in key_list:
        report = load_json_path(output_path(outputs.get(key)))
        if report:
            return report
    if fallback and fallback.exists():
        try:
            return read_json(fallback)
        except json.JSONDecodeError:
            return {}
    return {}


def artifact(outputs: dict[str, Any], key: str, label: str) -> dict[str, Any]:
    path = output_path(outputs.get(key))
    exists = bool(path and Path(path).exists())
    size = Path(path).stat().st_size if exists else 0
    return {
        "key": key,
        "label": label,
        "path": path,
        "exists": exists,
        "nonzero": bool(size > 0),
        "sizeBytes": size,
    }


def status_text(report: dict[str, Any], *keys: str, default: str = "missing") -> str:
    for key in keys:
        value = report.get(key)
        if isinstance(value, str) and value:
            return value
    return default


def path_link(path: str | None, label: str | None = None) -> str:
    if not path:
        return "missing"
    return f"[{html.escape(label or Path(path).name)}](file://{html.escape(path)})"


def markdown_path(path: str | None) -> str:
    return f"`{path}`" if path else "`missing`"


def summary_counts(goal_audit: dict[str, Any]) -> dict[str, int]:
    counts = goal_audit.get("statusCounts") if isinstance(goal_audit.get("statusCounts"), dict) else {}
    if counts:
        return {str(key): count_value(value) for key, value in counts.items()}
    requirements = goal_audit.get("requirements") if isinstance(goal_audit.get("requirements"), list) else []
    out: dict[str, int] = {}
    for item in requirements:
        status = str(item.get("status") or "unknown") if isinstance(item, dict) else "unknown"
        out[status] = out.get(status, 0) + 1
    return out


def build_runway_state(manifest: dict[str, Any], baseline_dir: Path, generated_at: str) -> dict[str, Any]:
    outputs = manifest.get("outputs") or {}
    baseline_id = str(manifest.get("baselineId") or "audio-baseline")
    approval_status = str(manifest.get("approvalStatus") or "unknown")
    package_ready = bool(manifest.get("packageReadyForHumanListen"))
    branch_inheritance_ready = bool(manifest.get("branchInheritanceReady"))
    branch_render_ready = bool(manifest.get("branchRenderReady"))
    original_media_mutated = bool(manifest.get("originalMediaMutated"))

    preflight = load_output_report(outputs, "latestAudioHumanApprovalPreflight", baseline_dir / "HUMAN_APPROVAL_PREFLIGHT.json")
    unresolved = load_output_report(outputs, "latestAudioUnresolvedRequirementReview", baseline_dir / "UNRESOLVED_REQUIREMENT_REVIEW.json")
    command_center = load_output_report(outputs, "latestAudioProducerCommandCenter", baseline_dir / "PRODUCER_COMMAND_CENTER.json")
    review_gate = load_output_report(outputs, "latestAudioReviewGateAudit", baseline_dir / "AUDIO_REVIEW_GATE_AUDIT.json")
    handoff = load_output_report(
        outputs,
        ["latestReviewHandoffIndex", "latestAudioReviewHandoffIndex"],
        baseline_dir / "REVIEW_HANDOFF_INDEX.json",
    )
    goal_audit = load_output_report(outputs, "latestAudioGoalCompletionAudit", baseline_dir / "AUDIO_GOAL_COMPLETION_AUDIT.json")
    post_queue = load_output_report(outputs, "latestAudioPostReviewActionQueue", baseline_dir / "AUDIO_POST_REVIEW_ACTION_QUEUE.json")
    post_listen_runway = load_output_report(outputs, "latestAudioPostListenEpisodeRunway", baseline_dir / "EPISODE_4_POST_LISTEN_RUNWAY.json")
    post_approval_rehearsal = load_output_report(
        outputs,
        "latestAudioPostApprovalRenderRehearsal",
        baseline_dir / "EPISODE_4_POST_APPROVAL_RENDER_REHEARSAL.json",
    )
    approved_branch_executor = load_output_report(outputs, "latestApprovedBranchRenderExecutor")
    morning_readiness = load_output_report(outputs, "latestAudioMorningPublicationReadinessPacket")

    gate_errors = count_value(review_gate.get("errorCount"))
    gate_warnings = count_value(review_gate.get("warningCount"))
    gate_passed = bool(review_gate.get("passed")) and gate_errors == 0
    preflight_status = status_text(preflight, "status", "preflightStatus")
    command_status = status_text(command_center, "status", "commandCenterStatus")
    unresolved_status = status_text(unresolved, "status", "reviewStatus")
    goal_counts = summary_counts(goal_audit)
    unresolved_count = count_value(
        unresolved.get("unresolvedRequirementCount")
        or unresolved.get("unresolvedCount")
        or manifest.get("audioUnresolvedRequirementReviewUnresolvedCount")
    )
    partial_count = count_value(unresolved.get("partialRequirementCount") or unresolved.get("unlockedReviewCount"))
    locked_count = count_value(unresolved.get("lockedRequirementCount") or unresolved.get("lockedCount"))
    unresolved_missing_artifacts = count_value(unresolved.get("missingArtifactCount"))
    handoff_missing = count_value(handoff.get("missingLinkedArtifactCount") or handoff.get("missingCount"))
    command_missing_primary = count_value(command_center.get("missingPrimaryArtifactCount"))
    post_queue_repairs = count_value(post_queue.get("repairActionCount") or post_queue.get("repairActions"))
    post_queue_proofs = count_value(post_queue.get("focusedProofActionCount") or post_queue.get("proofActionCount"))
    post_queue_pass = count_value(post_queue.get("passContextCount") or post_queue.get("passContextItems"))

    required_artifacts = [
        artifact(outputs, "masterWav", "Master WAV handoff"),
        artifact(outputs, "masterM4a", "Master M4A listen copy"),
        artifact(outputs, "latestAudioReviewStartHereMarkdown", "Stable START_HERE"),
        artifact(outputs, "latestAudioProducerCommandCenterHtml", "Producer Command Center"),
        artifact(outputs, "latestAudioHumanApprovalPreflightHtml", "Human approval preflight"),
        artifact(outputs, "latestAudioUnresolvedRequirementReviewHtml", "Unresolved requirement review"),
        artifact(outputs, "latestAudioReviewGateAuditMarkdown", "Review gate audit"),
        artifact(outputs, "latestReviewHandoffIndexMarkdown", "Review handoff index"),
    ]
    missing_required = [item for item in required_artifacts if not (item["exists"] and item["nonzero"])]

    human_approved = approval_status in {
        "human-approved",
        "human-approved-for-branch-inheritance",
        "approved-for-branch-inheritance",
    }
    blockers: list[str] = []
    if original_media_mutated:
        blockers.append("manifest says originalMediaMutated=true")
    if not package_ready:
        blockers.append("packageReadyForHumanListen=false")
    if not gate_passed:
        blockers.append(f"review gate not passing: errors={gate_errors}, passed={str(bool(review_gate.get('passed'))).lower()}")
    if missing_required:
        blockers.append(f"{len(missing_required)} required review artifact(s) missing or empty")

    if blockers:
        status = "blocked-before-human-listen"
        blocking_condition = "review-package-integrity-blocker"
        current_gate = "repair-review-package-before-human-listen"
        next_safe_action = "Repair the missing/gate-blocking review artifacts, then rerun the runway state before any human approval or branch work."
    elif human_approved and branch_inheritance_ready and not branch_render_ready:
        status = "ready-for-branch-inheritance"
        blocking_condition = "branch-render-preflight-not-ready"
        current_gate = "refresh-branch-render-preflight"
        next_safe_action = "Human approval is recorded and branch inheritance is ready. Run the branch inheritance gate before any render."
    elif human_approved:
        status = "human-approved-branch-locked"
        blocking_condition = "branch-inheritance-gate-not-ready"
        current_gate = "refresh-branch-inheritance-gate"
        next_safe_action = "Human approval is recorded, but branch/render gates are still locked. Run the explicit branch gate, not a render shortcut."
    else:
        status = "ready-for-human-listen-notes"
        blocking_condition = "waiting-for-human-listen-proof"
        current_gate = "audio-spine-human-listen"
        next_safe_action = "Open START_HERE or the Producer Command Center, listen to the current master, record notes, and do not unlock branches or render yet."

    ready_for_human_decision = status == "ready-for-human-listen-notes" or human_approved

    paths = {
        "startHere": output_path(outputs.get("latestAudioReviewStartHereMarkdown")),
        "producerCommandCenter": output_path(outputs.get("latestAudioProducerCommandCenterHtml")) or output_path(outputs.get("latestAudioProducerCommandCenterMarkdown")),
        "humanApprovalPreflight": output_path(outputs.get("latestAudioHumanApprovalPreflightHtml")) or output_path(outputs.get("latestAudioHumanApprovalPreflightMarkdown")),
        "unresolvedRequirementReview": output_path(outputs.get("latestAudioUnresolvedRequirementReviewHtml")) or output_path(outputs.get("latestAudioUnresolvedRequirementReviewMarkdown")),
        "reviewGateAudit": output_path(outputs.get("latestAudioReviewGateAuditMarkdown")),
        "handoffIndex": output_path(outputs.get("latestReviewHandoffIndexMarkdown")),
        "postReviewActionQueue": output_path(outputs.get("latestAudioPostReviewActionQueueMarkdown")),
        "postListenEpisodeRunway": output_path(outputs.get("latestAudioPostListenEpisodeRunwayHtml")) or output_path(outputs.get("latestAudioPostListenEpisodeRunwayMarkdown")),
        "postApprovalRenderRehearsal": output_path(outputs.get("latestAudioPostApprovalRenderRehearsalHtml")) or output_path(outputs.get("latestAudioPostApprovalRenderRehearsalMarkdown")),
        "approvedBranchRenderExecutor": output_path(outputs.get("latestApprovedBranchRenderExecutorMarkdown")),
        "masterWav": output_path(outputs.get("masterWav")),
        "masterM4a": output_path(outputs.get("masterM4a")),
    }
    final_episode_gate = post_listen_runway.get("finalEpisodeGate") if isinstance(post_listen_runway.get("finalEpisodeGate"), dict) else {}
    shorts_gate = post_listen_runway.get("shortsGate") if isinstance(post_listen_runway.get("shortsGate"), dict) else {}
    render_runway = {
        "target": "Episode 4 final long-form video, podcast audio, and shorts branches",
        "status": "locked-until-human-listen" if not human_approved else "ready-for-gated-refresh",
        "finalEpisodeGateStatus": final_episode_gate.get("status") or "missing",
        "shortsGateStatus": shorts_gate.get("status") or "missing",
        "postListenRunwayStatus": post_listen_runway.get("status") or "missing",
        "postApprovalRehearsalStatus": post_approval_rehearsal.get("status") or "missing",
        "postApprovalBranchCount": count_value(post_approval_rehearsal.get("branchCount")),
        "postApprovalMissingInputCount": count_value(post_approval_rehearsal.get("missingInputCount")),
        "postApprovalRendererDryRunBlocked": bool(post_approval_rehearsal.get("rendererDryRunBlocked")),
        "approvedBranchExecutorStatus": approved_branch_executor.get("status") or "missing",
        "approvedBranchExecutorCanExecute": bool(approved_branch_executor.get("canExecuteRealRenders")),
        "approvedBranchExecutorCommandsExposed": bool(approved_branch_executor.get("commandsExposed")),
        "approvedBranchExecutorBlockerCount": count_value(approved_branch_executor.get("blockerCount")),
        "whyLocked": "The current approved asset is not a final episode. It is a machine-ready audio spine candidate awaiting human listen proof.",
    }
    active_decision = {
        "beingJudgedNow": "Episode 4 high-quality mastered audio spine",
        "recommendedListenFile": (
            morning_readiness.get("recommendedListeningFile")
            or morning_readiness.get("recommendedAudioFile")
            or output_path(outputs.get("masterM4a"))
            or output_path(outputs.get("masterWav"))
        ),
        "notBeingJudgedYet": [
            "Final YouTube/Spotify/Apple episode render",
            "Final podcast RSS audio branch",
            "Final social shorts branch package",
        ],
        "blockingCondition": blocking_condition,
        "currentGate": current_gate,
        "passRoute": "Record guarded human-listen pass, refresh branch inheritance/render gates, then use the guarded branch executor.",
        "failRoute": "Record exact notes, preserve v006, and route only scoped issues into v007 repair/proof planning.",
        "needsProofRoute": "Record the specific uncertain moment and create focused proof without approving or rerendering the whole branch family.",
    }

    return {
        "schema": "quipsly.audio-workbench.runway-state.v1",
        "status": status,
        "runwayStateStatus": status,
        "generatedAt": generated_at,
        "baselineId": baseline_id,
        "baselineDir": str(baseline_dir),
        "approvalStatus": approval_status,
        "packageReadyForHumanListen": package_ready,
        "branchInheritanceReady": branch_inheritance_ready,
        "branchRenderReady": branch_render_ready,
        "currentGate": current_gate,
        "blockingCondition": blocking_condition,
        "activeDecision": active_decision,
        "renderRunway": render_runway,
        "readyForHumanDecision": ready_for_human_decision,
        "reviewGatePassed": gate_passed,
        "reviewGateErrorCount": gate_errors,
        "reviewGateWarningCount": gate_warnings,
        "preflightStatus": preflight_status,
        "preflightReadyForHumanDecision": bool(preflight.get("readyForHumanDecision")),
        "preflightBlockerCount": count_value((preflight.get("summary") or {}).get("blockerCount")),
        "unresolvedRequirementReviewStatus": unresolved_status,
        "unresolvedRequirementCount": unresolved_count,
        "partialRequirementCount": partial_count,
        "lockedRequirementCount": locked_count,
        "unresolvedMissingArtifactCount": unresolved_missing_artifacts,
        "producerCommandCenterStatus": command_status,
        "producerCommandCenterMissingPrimaryArtifactCount": command_missing_primary,
        "handoffMissingLinkedArtifactCount": handoff_missing,
        "goalAuditStatusCounts": goal_counts,
        "postReviewActionQueueRepairCount": post_queue_repairs,
        "postReviewActionQueueProofCount": post_queue_proofs,
        "postReviewActionQueuePassContextCount": post_queue_pass,
        "requiredArtifacts": required_artifacts,
        "missingRequiredArtifactCount": len(missing_required),
        "blockers": blockers,
        "nextSafeAction": next_safe_action,
        "paths": paths,
        "safety": {
            "approvesAudio": False,
            "failsAudio": False,
            "unlocksBranches": False,
            "rendersBranches": False,
            "uploadsFiles": False,
            "publishesExternally": False,
            "mutatesOriginalMedia": False,
            "changesApprovalState": False,
            "changesBranchState": False,
        },
    }


def build_markdown(report: dict[str, Any]) -> str:
    counts = report["goalAuditStatusCounts"]
    lines = [
        "# Episode 4 Audio Runway State",
        "",
        f"Generated: `{report['generatedAt']}`",
        "",
        "This is a stable current-state readback. It does not approve audio, fail audio, unlock branches, render, upload, publish, or mutate source media.",
        "",
        "## Current runway",
        "",
        f"- Status: `{report['status']}`",
        f"- Baseline: `{report['baselineId']}`",
        f"- Approval status: `{report['approvalStatus']}`",
        f"- Current gate: `{report['currentGate']}`",
        f"- Blocking condition: `{report['blockingCondition']}`",
        f"- Package ready for human listen: `{str(report['packageReadyForHumanListen']).lower()}`",
        f"- Review gate passed: `{str(report['reviewGatePassed']).lower()}` (`{report['reviewGateErrorCount']}` errors, `{report['reviewGateWarningCount']}` warnings)",
        f"- Human decision runway ready: `{str(report['readyForHumanDecision']).lower()}`",
        f"- Branch inheritance ready: `{str(report['branchInheritanceReady']).lower()}`",
        f"- Branch render ready: `{str(report['branchRenderReady']).lower()}`",
        "",
        "## Next safest action",
        "",
        report["nextSafeAction"],
        "",
        "## What is being judged",
        "",
        f"- Now: `{report['activeDecision']['beingJudgedNow']}`",
        f"- Recommended listen file: {markdown_path(report['activeDecision'].get('recommendedListenFile'))}",
        f"- Not yet: {', '.join(report['activeDecision']['notBeingJudgedYet'])}",
        f"- Pass route: {report['activeDecision']['passRoute']}",
        f"- Fail route: {report['activeDecision']['failRoute']}",
        f"- Needs-proof route: {report['activeDecision']['needsProofRoute']}",
        "",
        "## Downstream render runway",
        "",
        f"- Status: `{report['renderRunway']['status']}`",
        f"- Final episode gate: `{report['renderRunway']['finalEpisodeGateStatus']}`",
        f"- Shorts gate: `{report['renderRunway']['shortsGateStatus']}`",
        f"- Post-listen runway: `{report['renderRunway']['postListenRunwayStatus']}`",
        f"- Post-approval rehearsal: `{report['renderRunway']['postApprovalRehearsalStatus']}`",
        f"- Planned branches: `{report['renderRunway']['postApprovalBranchCount']}`",
        f"- Missing render inputs: `{report['renderRunway']['postApprovalMissingInputCount']}`",
        f"- Guarded executor: `{report['renderRunway']['approvedBranchExecutorStatus']}`; can execute `{str(report['renderRunway']['approvedBranchExecutorCanExecute']).lower()}`; commands exposed `{str(report['renderRunway']['approvedBranchExecutorCommandsExposed']).lower()}`",
        f"- Why locked: {report['renderRunway']['whyLocked']}",
        "",
        "## Review surfaces",
        "",
        f"- START_HERE: {markdown_path(report['paths'].get('startHere'))}",
        f"- Producer Command Center: {markdown_path(report['paths'].get('producerCommandCenter'))}",
        f"- Human approval preflight: {markdown_path(report['paths'].get('humanApprovalPreflight'))}",
        f"- Unresolved requirement review: {markdown_path(report['paths'].get('unresolvedRequirementReview'))}",
        f"- Review gate audit: {markdown_path(report['paths'].get('reviewGateAudit'))}",
        f"- Handoff index: {markdown_path(report['paths'].get('handoffIndex'))}",
        f"- Post-review action queue: {markdown_path(report['paths'].get('postReviewActionQueue'))}",
        f"- Post-listen episode runway: {markdown_path(report['paths'].get('postListenEpisodeRunway'))}",
        f"- Post-approval render rehearsal: {markdown_path(report['paths'].get('postApprovalRenderRehearsal'))}",
        f"- Guarded branch render executor: {markdown_path(report['paths'].get('approvedBranchRenderExecutor'))}",
        "",
        "## Readback counts",
        "",
        f"- Preflight: `{report['preflightStatus']}`; blockers `{report['preflightBlockerCount']}`",
        f"- Unresolved requirements: `{report['unresolvedRequirementCount']}` total; `{report['partialRequirementCount']}` partial; `{report['lockedRequirementCount']}` locked; `{report['unresolvedMissingArtifactCount']}` missing linked artifacts",
        f"- Command center: `{report['producerCommandCenterStatus']}`; missing primary artifacts `{report['producerCommandCenterMissingPrimaryArtifactCount']}`",
        f"- Handoff missing linked artifacts: `{report['handoffMissingLinkedArtifactCount']}`",
        f"- Goal audit: proved `{counts.get('proved', 0)}`; partial `{counts.get('partial', 0)}`; locked `{counts.get('locked', 0)}`; missing `{counts.get('missing', 0)}`",
        f"- Post-review queue: repairs `{report['postReviewActionQueueRepairCount']}`; proof `{report['postReviewActionQueueProofCount']}`; pass context `{report['postReviewActionQueuePassContextCount']}`",
        "",
        "## Blockers",
        "",
    ]
    if report["blockers"]:
        lines.extend([f"- {item}" for item in report["blockers"]])
    else:
        lines.append("- None for human listen. Branch/render still require explicit human approval and branch gates.")
    lines.extend(
        [
            "",
            "## Safety locks",
            "",
            "- Approves audio: `false`",
            "- Unlocks branches: `false`",
            "- Renders branches: `false`",
            "- Uploads files: `false`",
            "- Publishes externally: `false`",
            "- Mutates original media: `false`",
        ]
    )
    return "\n".join(lines) + "\n"


def build_html(report: dict[str, Any]) -> str:
    counts = report["goalAuditStatusCounts"]
    status_class = "good" if report["status"] == "ready-for-human-listen-notes" else "warn"
    required_rows = "\n".join(
        f"<tr><td>{html.escape(item['label'])}</td><td>{'yes' if item['exists'] else 'no'}</td><td><code>{html.escape(str(item['path']))}</code></td></tr>"
        for item in report["requiredArtifacts"]
    )
    blocker_items = "".join(f"<li>{html.escape(item)}</li>" for item in report["blockers"]) or "<li>None for human listen. Branch/render still require explicit gates.</li>"
    return f"""<!doctype html>
<html lang=\"en\">
<head>
<meta charset=\"utf-8\" />
<title>Episode 4 Audio Runway State</title>
<style>
:root {{ color-scheme: dark; --bg: #101713; --panel: #17231c; --panel2: #203126; --ink: #f4eddb; --muted: #b7a98f; --gold: #e5b949; --green: #65d287; --red: #f26b63; }}
body {{ margin: 0; padding: 32px; background: radial-gradient(circle at top left, #23372a, var(--bg) 46%); color: var(--ink); font: 15px/1.55 -apple-system, BlinkMacSystemFont, \"Avenir Next\", sans-serif; }}
main {{ max-width: 1120px; margin: 0 auto; }}
h1 {{ margin: 0 0 8px; font-size: 38px; letter-spacing: -0.03em; }}
h2 {{ margin-top: 28px; color: var(--gold); text-transform: uppercase; font-size: 14px; letter-spacing: 0.16em; }}
.card {{ background: color-mix(in srgb, var(--panel) 88%, black); border: 1px solid rgba(229,185,73,.22); border-radius: 22px; padding: 22px; box-shadow: 0 18px 70px rgba(0,0,0,.28); margin: 18px 0; }}
.badge {{ display: inline-flex; align-items: center; border-radius: 999px; padding: 7px 11px; font-weight: 800; text-transform: uppercase; letter-spacing: .08em; font-size: 12px; }}
.good {{ background: rgba(101,210,135,.16); color: var(--green); border: 1px solid rgba(101,210,135,.32); }}
.warn {{ background: rgba(229,185,73,.16); color: var(--gold); border: 1px solid rgba(229,185,73,.32); }}
.grid {{ display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 12px; }}
.metric {{ background: var(--panel2); border-radius: 16px; padding: 14px; }}
.metric strong {{ display: block; font-size: 24px; }}
code {{ color: #d9caa6; overflow-wrap: anywhere; }}
table {{ width: 100%; border-collapse: collapse; }}
td, th {{ border-bottom: 1px solid rgba(244,237,219,.11); padding: 9px; text-align: left; vertical-align: top; }}
a {{ color: #8fdaa8; }}
</style>
</head>
<body>
<main>
<p class=\"badge {status_class}\">{html.escape(report['status'])}</p>
<h1>Episode 4 Audio Runway State</h1>
<p>This stable readback tells humans and agents what is safe next. It does not approve audio, unlock branches, render, upload, publish, or mutate media.</p>
<div class=\"card\"><h2>Next safest action</h2><p>{html.escape(report['nextSafeAction'])}</p></div>
<div class=\"grid\">
  <div class=\"metric\"><span>Approval</span><strong>{html.escape(report['approvalStatus'])}</strong></div>
  <div class=\"metric\"><span>Current gate</span><strong>{html.escape(report['currentGate'])}</strong><small>{html.escape(report['blockingCondition'])}</small></div>
  <div class=\"metric\"><span>Review gate</span><strong>{'passed' if report['reviewGatePassed'] else 'blocked'}</strong><small>{report['reviewGateErrorCount']} errors / {report['reviewGateWarningCount']} warnings</small></div>
  <div class=\"metric\"><span>Preflight</span><strong>{html.escape(report['preflightStatus'])}</strong><small>{report['preflightBlockerCount']} blockers</small></div>
  <div class=\"metric\"><span>Unresolved</span><strong>{report['unresolvedRequirementCount']}</strong><small>{report['partialRequirementCount']} partial / {report['lockedRequirementCount']} locked</small></div>
</div>
<div class=\"card\"><h2>What is being judged now</h2>
<ul>
<li><strong>Now:</strong> {html.escape(report['activeDecision']['beingJudgedNow'])}</li>
<li><strong>Recommended listen file:</strong> <code>{html.escape(str(report['activeDecision'].get('recommendedListenFile')))}</code></li>
<li><strong>Not yet:</strong> {html.escape(', '.join(report['activeDecision']['notBeingJudgedYet']))}</li>
<li><strong>Pass:</strong> {html.escape(report['activeDecision']['passRoute'])}</li>
<li><strong>Fail:</strong> {html.escape(report['activeDecision']['failRoute'])}</li>
<li><strong>Needs proof:</strong> {html.escape(report['activeDecision']['needsProofRoute'])}</li>
</ul></div>
<div class=\"card\"><h2>Downstream render runway</h2>
<div class=\"grid\">
  <div class=\"metric\"><span>Runway</span><strong>{html.escape(report['renderRunway']['status'])}</strong></div>
  <div class=\"metric\"><span>Final episode</span><strong>{html.escape(str(report['renderRunway']['finalEpisodeGateStatus']))}</strong></div>
  <div class=\"metric\"><span>Shorts</span><strong>{html.escape(str(report['renderRunway']['shortsGateStatus']))}</strong></div>
  <div class=\"metric\"><span>Branches</span><strong>{report['renderRunway']['postApprovalBranchCount']}</strong><small>{report['renderRunway']['postApprovalMissingInputCount']} missing inputs</small></div>
  <div class=\"metric\"><span>Executor</span><strong>{html.escape(str(report['renderRunway']['approvedBranchExecutorStatus']))}</strong><small>can execute {str(report['renderRunway']['approvedBranchExecutorCanExecute']).lower()} / commands exposed {str(report['renderRunway']['approvedBranchExecutorCommandsExposed']).lower()}</small></div>
</div>
<p>{html.escape(report['renderRunway']['whyLocked'])}</p>
</div>
<div class=\"card\"><h2>Review surfaces</h2>
<ul>
<li>START_HERE: {path_link(report['paths'].get('startHere'))}</li>
<li>Producer Command Center: {path_link(report['paths'].get('producerCommandCenter'))}</li>
<li>Human approval preflight: {path_link(report['paths'].get('humanApprovalPreflight'))}</li>
<li>Unresolved requirement review: {path_link(report['paths'].get('unresolvedRequirementReview'))}</li>
<li>Post-review action queue: {path_link(report['paths'].get('postReviewActionQueue'))}</li>
<li>Post-listen episode runway: {path_link(report['paths'].get('postListenEpisodeRunway'))}</li>
<li>Post-approval render rehearsal: {path_link(report['paths'].get('postApprovalRenderRehearsal'))}</li>
<li>Guarded branch render executor: {path_link(report['paths'].get('approvedBranchRenderExecutor'))}</li>
</ul></div>
<div class=\"card\"><h2>Goal and handoff counts</h2>
<ul>
<li>Goal audit: proved {counts.get('proved', 0)}, partial {counts.get('partial', 0)}, locked {counts.get('locked', 0)}, missing {counts.get('missing', 0)}</li>
<li>Command center missing primary artifacts: {report['producerCommandCenterMissingPrimaryArtifactCount']}</li>
<li>Handoff missing linked artifacts: {report['handoffMissingLinkedArtifactCount']}</li>
<li>Post-review queue: {report['postReviewActionQueueRepairCount']} repairs, {report['postReviewActionQueueProofCount']} proof actions, {report['postReviewActionQueuePassContextCount']} pass-context items</li>
</ul></div>
<div class=\"card\"><h2>Blockers</h2><ul>{blocker_items}</ul></div>
<div class=\"card\"><h2>Required artifacts</h2><table><thead><tr><th>Artifact</th><th>Exists</th><th>Path</th></tr></thead><tbody>{required_rows}</tbody></table></div>
</main>
</body>
</html>
"""


def write_open_command(path: Path, html_path: Path, markdown_path: Path) -> None:
    path.write_text(
        "#!/bin/zsh\n"
        "set -euo pipefail\n"
        f"open {shell_quote(str(html_path))}\n"
        f"open {shell_quote(str(markdown_path))}\n",
        encoding="utf-8",
    )
    os.chmod(path, 0o755)


def main() -> None:
    parser = argparse.ArgumentParser(description="Create a stable audio runway state report.")
    parser.add_argument("--baseline-dir", type=Path, default=DEFAULT_BASELINE_DIR)
    args = parser.parse_args()

    baseline_dir = resolve_baseline_dir(args.baseline_dir)
    manifest_path = baseline_dir / "manifest.json"
    manifest = read_json(manifest_path)
    generated_at = datetime.now(timezone.utc).isoformat()
    baseline_slug = safe_slug(str(manifest.get("baselineId") or baseline_dir.name))
    timestamp = datetime.now().strftime("%Y%m%d-%H%M%S")

    output_dir = baseline_dir / f"audio-runway-state-{baseline_slug}-{timestamp}"
    output_dir.mkdir(parents=True, exist_ok=True)
    stable_json = baseline_dir / "AUDIO_RUNWAY_STATE.json"
    stable_md = baseline_dir / "AUDIO_RUNWAY_STATE.md"
    stable_html = baseline_dir / "AUDIO_RUNWAY_STATE.html"
    stable_open_command = baseline_dir / "OPEN_AUDIO_RUNWAY_STATE.command"
    output_json = output_dir / "AUDIO_RUNWAY_STATE.json"
    output_md = output_dir / "AUDIO_RUNWAY_STATE.md"
    output_html = output_dir / "AUDIO_RUNWAY_STATE.html"
    output_open_command = output_dir / "OPEN_AUDIO_RUNWAY_STATE.command"

    report = build_runway_state(manifest, baseline_dir, generated_at)
    markdown = build_markdown(report)
    html_doc = build_html(report)
    for path in (stable_json, output_json):
        write_json(path, report)
    for path in (stable_md, output_md):
        path.write_text(markdown, encoding="utf-8")
    for path in (stable_html, output_html):
        path.write_text(html_doc, encoding="utf-8")
    write_open_command(stable_open_command, stable_html, stable_md)
    write_open_command(output_open_command, output_html, output_md)

    manifest_after = read_json(manifest_path)
    outputs = manifest_after.setdefault("outputs", {})
    entry = {
        "path": str(stable_json),
        "jsonPath": str(stable_json),
        "markdownPath": str(stable_md),
        "htmlPath": str(stable_html),
        "openCommand": str(stable_open_command),
        "versionedPath": str(output_json),
        "versionedJsonPath": str(output_json),
        "versionedMarkdownPath": str(output_md),
        "versionedHtmlPath": str(output_html),
        "versionedOpenCommand": str(output_open_command),
        "generatedAt": generated_at,
        "schema": report["schema"],
        "status": report["status"],
        "currentGate": report["currentGate"],
        "blockingCondition": report["blockingCondition"],
        "postApprovalBranchCount": report["renderRunway"]["postApprovalBranchCount"],
        "postApprovalMissingInputCount": report["renderRunway"]["postApprovalMissingInputCount"],
        "approvedBranchExecutorStatus": report["renderRunway"]["approvedBranchExecutorStatus"],
        "approvedBranchExecutorCanExecute": report["renderRunway"]["approvedBranchExecutorCanExecute"],
        "approvedBranchExecutorCommandsExposed": report["renderRunway"]["approvedBranchExecutorCommandsExposed"],
        "reviewGatePassed": report["reviewGatePassed"],
        "readyForHumanDecision": report["readyForHumanDecision"],
        "missingRequiredArtifactCount": report["missingRequiredArtifactCount"],
        "nextSafeAction": report["nextSafeAction"],
        "approvalStateChanged": False,
        "branchStateChanged": False,
        "renderAttempted": False,
        "uploadAttempted": False,
        "publicationAttempted": False,
        "originalMediaMutated": False,
    }
    history = outputs.setdefault("audioRunwayStates", [])
    history.append(entry)
    outputs["latestAudioRunwayState"] = entry
    outputs["latestAudioRunwayStateJson"] = str(stable_json)
    outputs["latestAudioRunwayStateMarkdown"] = str(stable_md)
    outputs["latestAudioRunwayStateHtml"] = str(stable_html)
    outputs["latestAudioRunwayStateOpenCommand"] = str(stable_open_command)
    outputs["latestAudioRunwayStateVersionedJson"] = str(output_json)
    outputs["latestAudioRunwayStateVersionedMarkdown"] = str(output_md)
    outputs["latestAudioRunwayStateVersionedHtml"] = str(output_html)
    outputs["latestAudioRunwayStateVersionedOpenCommand"] = str(output_open_command)
    manifest_after["audioRunwayStateCount"] = len(history)
    manifest_after["audioRunwayStateLatestStatus"] = report["status"]
    manifest_after["audioRunwayStateReviewGatePassed"] = report["reviewGatePassed"]
    manifest_after["audioRunwayStateReadyForHumanDecision"] = report["readyForHumanDecision"]
    manifest_after["audioRunwayStateMissingRequiredArtifactCount"] = report["missingRequiredArtifactCount"]
    manifest_after["audioRunwayStateUnresolvedRequirementCount"] = report["unresolvedRequirementCount"]
    manifest_after["audioRunwayStatePartialRequirementCount"] = report["partialRequirementCount"]
    manifest_after["audioRunwayStateLockedRequirementCount"] = report["lockedRequirementCount"]
    manifest_after["audioRunwayStateUnresolvedMissingArtifactCount"] = report["unresolvedMissingArtifactCount"]
    manifest_after["audioRunwayStateHandoffMissingLinkedArtifactCount"] = report["handoffMissingLinkedArtifactCount"]
    manifest_after["audioRunwayStateCurrentGate"] = report["currentGate"]
    manifest_after["audioRunwayStateBlockingCondition"] = report["blockingCondition"]
    manifest_after["audioRunwayStatePostListenRunwayStatus"] = report["renderRunway"]["postListenRunwayStatus"]
    manifest_after["audioRunwayStatePostApprovalRehearsalStatus"] = report["renderRunway"]["postApprovalRehearsalStatus"]
    manifest_after["audioRunwayStatePostApprovalBranchCount"] = report["renderRunway"]["postApprovalBranchCount"]
    manifest_after["audioRunwayStatePostApprovalMissingInputCount"] = report["renderRunway"]["postApprovalMissingInputCount"]
    manifest_after["audioRunwayStateApprovedBranchExecutorStatus"] = report["renderRunway"]["approvedBranchExecutorStatus"]
    manifest_after["audioRunwayStateApprovedBranchExecutorCanExecute"] = report["renderRunway"]["approvedBranchExecutorCanExecute"]
    manifest_after["audioRunwayStateApprovedBranchExecutorCommandsExposed"] = report["renderRunway"]["approvedBranchExecutorCommandsExposed"]
    manifest_after["audioRunwayStateLatestGeneratedAt"] = generated_at
    manifest_after["audioRunwayStateLatestMarkdown"] = str(stable_md)
    manifest_after["audioRunwayStateNextSafeAction"] = report["nextSafeAction"]
    manifest_after["audioRunwayStateOriginalMediaMutated"] = False
    manifest_after["audioRunwayStateApprovalStateChanged"] = False
    manifest_after["audioRunwayStateBranchStateChanged"] = False
    manifest_after["audioRunwayStateRenderAttempted"] = False
    manifest_after["audioRunwayStateUploadAttempted"] = False
    manifest_after["audioRunwayStatePublicationAttempted"] = False
    write_json(manifest_path, manifest_after)
    print(json.dumps(entry, indent=2, sort_keys=True))


if __name__ == "__main__":
    main()
