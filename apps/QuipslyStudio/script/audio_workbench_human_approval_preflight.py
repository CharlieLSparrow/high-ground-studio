#!/usr/bin/env python3
"""Create a guarded human-approval preflight for an audio baseline.

This is deliberately not an approval tool. It answers one narrow question:
"Is this audio package ready for a real human listen decision, and what is the
next safest action?" It writes review artifacts and registers them in the
baseline manifest, but it does not approve audio, unlock branch inheritance,
render branches, upload, publish, or mutate source media.
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
            "markdownPath",
            "htmlPath",
            "jsonPath",
            "openCommand",
            "m4aPath",
            "wavPath",
            "playlistPath",
        ):
            subvalue = value.get(key)
            if isinstance(subvalue, str) and subvalue:
                return subvalue
    return None


def load_output_report(outputs: dict[str, Any], key: str) -> dict[str, Any]:
    path = first_path(outputs.get(key))
    if not path:
        return {}
    file_path = Path(path)
    if not file_path.exists() or file_path.suffix.lower() != ".json":
        return {}
    try:
        return read_json(file_path)
    except json.JSONDecodeError:
        return {}


def load_report_with_stable_fallback(outputs: dict[str, Any], key: str, stable_path: Path) -> dict[str, Any]:
    report = load_output_report(outputs, key)
    if report:
        return report
    if stable_path.exists():
        try:
            return read_json(stable_path)
        except json.JSONDecodeError:
            return {}
    return {}


def path_status(label: str, path: str | None, *, required: bool, purpose: str) -> dict[str, Any]:
    exists = bool(path and Path(path).exists())
    size = Path(path).stat().st_size if exists else 0
    return {
        "label": label,
        "path": path,
        "required": required,
        "exists": exists,
        "nonzero": bool(size > 0),
        "sizeBytes": size,
        "purpose": purpose,
        "ok": bool(exists and (size > 0 or not required)),
    }


def report_bool(value: Any) -> bool | None:
    if isinstance(value, bool):
        return value
    return None


def count_value(value: Any) -> int:
    try:
        return int(value)
    except (TypeError, ValueError):
        return 0


def build_preflight(manifest: dict[str, Any], baseline_dir: Path, generated_at: str) -> dict[str, Any]:
    outputs = manifest.get("outputs") or {}
    baseline_id = str(manifest.get("baselineId") or "audio-baseline")
    approval_status = str(manifest.get("approvalStatus") or "unknown")
    package_ready = bool(manifest.get("packageReadyForHumanListen"))
    branch_inheritance_ready = bool(manifest.get("branchInheritanceReady"))
    branch_render_ready = bool(manifest.get("branchRenderReady"))

    review_gate = load_output_report(outputs, "latestAudioReviewGateAudit")
    technical_snippets = load_report_with_stable_fallback(
        outputs,
        "latestAudioTechnicalAuditionSnippetPack",
        baseline_dir / "AUDIO_TECHNICAL_AUDITION_SNIPPET_PACK.json",
    )
    technical_inbox = load_output_report(outputs, "latestAudioTechnicalAuditionNotesInbox")
    final_inbox = load_output_report(outputs, "latestAudioFinalListenFastPassNotesInbox")
    post_queue = load_output_report(outputs, "latestAudioPostReviewActionQueue")
    dxrevive_validation = load_report_with_stable_fallback(
        outputs,
        "latestDxReviveBounceValidation",
        baseline_dir / "DXREVIVE_RETURN_WORKBENCH.json",
    )
    fast_readback = load_report_with_stable_fallback(
        outputs,
        "latestAudioFastReadbackCheck",
        baseline_dir / "AUDIO_FAST_READBACK_CHECK.json",
    )
    goal_audit = load_output_report(outputs, "latestAudioGoalCompletionAudit")
    handoff_index = load_output_report(outputs, "latestAudioReviewHandoffIndex")

    master_wav = first_path(outputs.get("masterWav")) or str(baseline_dir / "episode4-mastered-audio-spine-v006.wav")
    master_m4a = first_path(outputs.get("masterM4a")) or str(baseline_dir / "episode4-mastered-audio-spine-v006.m4a")
    start_here = first_path(outputs.get("latestAudioReviewStartHereMarkdown")) or str(baseline_dir / "START_HERE_EPISODE_4_AUDIO_REVIEW.md")
    producer_center = first_path(outputs.get("latestAudioProducerCommandCenterHtml")) or str(baseline_dir / "PRODUCER_COMMAND_CENTER.html")
    technical_snippet_pack = first_path(outputs.get("latestAudioTechnicalAuditionSnippetPackHtml")) or str(
        baseline_dir / "AUDIO_TECHNICAL_AUDITION_SNIPPET_PACK.html"
    )
    post_review_queue = first_path(outputs.get("latestAudioPostReviewActionQueueMarkdown"))
    process_notes_command = first_path(outputs.get("latestAudioPostHumanListenNotesRoundtripCommand")) or str(
        baseline_dir / "PROCESS_EPISODE_4_AUDIO_REVIEW_NOTES.command"
    )

    artifacts = [
        path_status("Master WAV handoff", master_wav, required=True, purpose="Premiere/editor spine and archival handoff."),
        path_status("Master M4A listen copy", master_m4a, required=True, purpose="Fast human listening."),
        path_status("Stable START_HERE", start_here, required=True, purpose="Human review entry point."),
        path_status("Producer Command Center", producer_center, required=True, purpose="Calm current-state front door."),
        path_status("Technical audition snippets", technical_snippet_pack, required=True, purpose="Short clips for targeted technical listening."),
        path_status("Post-review action queue", post_review_queue, required=False, purpose="Unified notes to repair/proof/pass queue."),
        path_status("Process notes command", process_notes_command, required=False, purpose="Safe notes roundtrip command."),
    ]

    required_artifact_errors = [
        f"{item['label']} missing or empty"
        for item in artifacts
        if item["required"] and not (item["exists"] and item["nonzero"])
    ]

    review_gate_passed = bool(review_gate.get("passed")) and count_value(review_gate.get("errorCount")) == 0
    review_gate_warnings = count_value(review_gate.get("warningCount"))
    technical_snippet_count = count_value(
        technical_snippets.get("snippetCount")
        or technical_snippets.get("renderedSnippetCount")
        or technical_snippets.get("renderSuccessCount")
    )
    technical_failures = count_value(
        technical_snippets.get("failureCount")
        or technical_snippets.get("renderFailureCount")
        or technical_snippets.get("failedSnippetCount")
    )
    technical_notes = count_value(technical_inbox.get("matchingCandidateCount"))
    final_notes = count_value(final_inbox.get("matchingCandidateCount"))
    post_queue_repairs = count_value(post_queue.get("repairActionCount") or post_queue.get("repairActions"))
    post_queue_proofs = count_value(post_queue.get("focusedProofActionCount") or post_queue.get("proofActionCount"))
    post_queue_pass = count_value(post_queue.get("passContextCount") or post_queue.get("passContextItems"))

    dx_status = str(dxrevive_validation.get("status") or dxrevive_validation.get("validationStatus") or "not-registered")
    dx_missing = count_value(dxrevive_validation.get("missingBounceCount") or dxrevive_validation.get("missingCount"))
    dx_errors = count_value(dxrevive_validation.get("errorCount"))
    fast_readback_passed = bool(fast_readback.get("passed"))
    fast_readback_hard_stops = count_value(fast_readback.get("hardStopCount"))
    fast_readback_status = str(fast_readback.get("status") or "not-registered")
    source_timing_ready = bool(fast_readback.get("sourceAwareTimingContractReady"))
    source_timing_roles = count_value(fast_readback.get("sourceAwareTimingContractReadyRoleCount"))
    source_timing_hard_stops = count_value(fast_readback.get("sourceAwareTimingContractHardStopCount"))
    approved_sandbox_source_ready = bool(
        fast_readback.get("postApprovalApprovedSandboxExecutorSourceAwareRenderContractReady")
    )
    approved_sandbox_inherits_source_truth = bool(
        fast_readback.get("postApprovalApprovedSandboxExecutorInheritsSourceAwareAudioTruth")
    )
    approved_sandbox_master_only_allowed = bool(
        fast_readback.get("postApprovalApprovedSandboxExecutorMasteredSpineOnlyEditingAllowed")
    )
    post_approval_master_only_allowed = bool(fast_readback.get("postApprovalRenderRehearsalMasteredSpineOnlyEditingAllowed"))
    post_listen_master_only_allowed = bool(fast_readback.get("postListenOutcomeRouterMasteredSpineOnlyEditingAllowed"))
    branch_preflight_master_only_allowed = bool(fast_readback.get("branchRenderPreflightMasteredSpineOnlyEditingAllowed"))

    goal_counts = goal_audit.get("statusCounts") if isinstance(goal_audit.get("statusCounts"), dict) else {}
    handoff_missing = count_value(handoff_index.get("missingCount") or handoff_index.get("missingLinkedArtifactCount"))

    checks = [
        {
            "name": "package-ready-for-human-listen",
            "status": "pass" if package_ready else "fail",
            "detail": f"packageReadyForHumanListen={str(package_ready).lower()}",
            "blocksDecision": not package_ready,
        },
        {
            "name": "approval-still-human-required",
            "status": "pass" if approval_status != "human-approved-for-branch-inheritance" else "info",
            "detail": f"approvalStatus={approval_status}",
            "blocksDecision": False,
        },
        {
            "name": "branch-gates-still-locked",
            "status": "pass" if not branch_inheritance_ready and not branch_render_ready else "fail",
            "detail": f"branchInheritanceReady={str(branch_inheritance_ready).lower()}; branchRenderReady={str(branch_render_ready).lower()}",
            "blocksDecision": bool(branch_inheritance_ready or branch_render_ready),
        },
        {
            "name": "required-review-artifacts-present",
            "status": "pass" if not required_artifact_errors else "fail",
            "detail": "; ".join(required_artifact_errors) if required_artifact_errors else "all required review artifacts exist and are nonzero",
            "blocksDecision": bool(required_artifact_errors),
        },
        {
            "name": "review-gate-clean",
            "status": "pass" if review_gate_passed and review_gate_warnings == 0 else "fail",
            "detail": f"passed={str(review_gate_passed).lower()}; warnings={review_gate_warnings}",
            "blocksDecision": not (review_gate_passed and review_gate_warnings == 0),
        },
        {
            "name": "technical-audition-snippets-ready",
            "status": "pass" if technical_snippet_count > 0 and technical_failures == 0 else "fail",
            "detail": f"snippets={technical_snippet_count}; failures={technical_failures}",
            "blocksDecision": not (technical_snippet_count > 0 and technical_failures == 0),
        },
        {
            "name": "human-notes-state",
            "status": "waiting" if technical_notes == 0 and final_notes == 0 else "notes-present",
            "detail": f"technicalNotes={technical_notes}; finalFastPassNotes={final_notes}",
            "blocksDecision": False,
        },
        {
            "name": "post-review-action-queue-state",
            "status": "waiting" if post_queue_repairs == 0 and post_queue_proofs == 0 and post_queue_pass == 0 else "actions-present",
            "detail": f"repairActions={post_queue_repairs}; focusedProofActions={post_queue_proofs}; passContext={post_queue_pass}",
            "blocksDecision": False,
        },
        {
            "name": "dxrevive-fallback-state",
            "status": "open-fallback" if dx_status == "waiting-for-bounces" else "info",
            "detail": f"status={dx_status}; missingBounces={dx_missing}; errors={dx_errors}",
            "blocksDecision": dx_errors > 0,
        },
        {
            "name": "goal-audit-state",
            "status": "info",
            "detail": f"proved={goal_counts.get('proved', 'n/a')}; partial={goal_counts.get('partial', 'n/a')}; locked={goal_counts.get('locked', 'n/a')}; missing={goal_counts.get('missing', 'n/a')}",
            "blocksDecision": False,
        },
        {
            "name": "handoff-index-state",
            "status": "pass" if handoff_missing == 0 else "fail",
            "detail": f"missingLinkedArtifacts={handoff_missing}",
            "blocksDecision": handoff_missing > 0,
        },
        {
            "name": "fast-readback-source-aware-package",
            "status": "pass" if fast_readback_passed and fast_readback_hard_stops == 0 else "fail",
            "detail": f"status={fast_readback_status}; passed={str(fast_readback_passed).lower()}; hardStops={fast_readback_hard_stops}",
            "blocksDecision": not (fast_readback_passed and fast_readback_hard_stops == 0),
        },
        {
            "name": "source-aware-timing-contract",
            "status": "pass" if source_timing_ready and source_timing_roles >= 3 and source_timing_hard_stops == 0 else "fail",
            "detail": f"ready={str(source_timing_ready).lower()}; readyRoles={source_timing_roles}; hardStops={source_timing_hard_stops}",
            "blocksDecision": not (source_timing_ready and source_timing_roles >= 3 and source_timing_hard_stops == 0),
        },
        {
            "name": "approved-sandbox-source-aware-render-contract",
            "status": "pass" if approved_sandbox_source_ready and approved_sandbox_inherits_source_truth else "fail",
            "detail": (
                f"sourceAwareRenderReady={str(approved_sandbox_source_ready).lower()}; "
                f"inheritsSourceAwareAudioTruth={str(approved_sandbox_inherits_source_truth).lower()}"
            ),
            "blocksDecision": not (approved_sandbox_source_ready and approved_sandbox_inherits_source_truth),
        },
        {
            "name": "flat-master-editing-forbidden",
            "status": (
                "pass"
                if not (
                    approved_sandbox_master_only_allowed
                    or post_approval_master_only_allowed
                    or post_listen_master_only_allowed
                    or branch_preflight_master_only_allowed
                )
                else "fail"
            ),
            "detail": (
                f"approvedSandbox={str(approved_sandbox_master_only_allowed).lower()}; "
                f"postApproval={str(post_approval_master_only_allowed).lower()}; "
                f"postListen={str(post_listen_master_only_allowed).lower()}; "
                f"branchPreflight={str(branch_preflight_master_only_allowed).lower()}"
            ),
            "blocksDecision": bool(
                approved_sandbox_master_only_allowed
                or post_approval_master_only_allowed
                or post_listen_master_only_allowed
                or branch_preflight_master_only_allowed
            ),
        },
    ]

    blockers = [check for check in checks if check["blocksDecision"]]
    waiting_for_human_notes = technical_notes == 0 and final_notes == 0
    ready_for_human_decision = not blockers and package_ready and approval_status != "human-approved-for-branch-inheritance"

    if blockers:
        status = "blocked-before-human-decision"
        next_action = "Fix the blocking preflight checks before asking a human to approve or fail the baseline."
    elif waiting_for_human_notes:
        status = "ready-for-human-listen-notes"
        next_action = "Open START_HERE or the Producer Command Center, audition the fast-pass and technical snippets, export notes, then run the notes roundtrip."
    else:
        status = "ready-for-human-decision-routing"
        next_action = "Run the post-human-listen notes roundtrip and route pass, needs-proof, or needs-repair without unlocking branches unless explicit approval is recorded."

    return {
        "schema": "quipsly.audio-workbench.human-approval-preflight.v1",
        "generatedAt": generated_at,
        "baselineDir": str(baseline_dir),
        "baselineId": baseline_id,
        "status": status,
        "approvalStatus": approval_status,
        "packageReadyForHumanListen": package_ready,
        "branchInheritanceReady": branch_inheritance_ready,
        "branchRenderReady": branch_render_ready,
        "preflightStatus": status,
        "readyForHumanDecision": ready_for_human_decision,
        "safeNextAction": next_action,
        "checks": checks,
        "artifacts": artifacts,
        "summary": {
            "blockerCount": len(blockers),
            "waitingForHumanNotes": waiting_for_human_notes,
            "technicalSnippetCount": technical_snippet_count,
            "technicalFailureCount": technical_failures,
            "technicalNotesCandidateCount": technical_notes,
            "finalFastPassNotesCandidateCount": final_notes,
            "postReviewRepairActionCount": post_queue_repairs,
            "postReviewFocusedProofActionCount": post_queue_proofs,
            "postReviewPassContextCount": post_queue_pass,
            "dxReviveStatus": dx_status,
            "dxReviveMissingBounceCount": dx_missing,
            "goalStatusCounts": goal_counts,
            "handoffMissingLinkedArtifacts": handoff_missing,
            "fastReadbackStatus": fast_readback_status,
            "fastReadbackPassed": fast_readback_passed,
            "fastReadbackHardStopCount": fast_readback_hard_stops,
            "sourceAwareTimingContractReady": source_timing_ready,
            "sourceAwareTimingContractReadyRoleCount": source_timing_roles,
            "approvedSandboxSourceAwareRenderContractReady": approved_sandbox_source_ready,
            "approvedSandboxInheritsSourceAwareAudioTruth": approved_sandbox_inherits_source_truth,
            "masteredSpineOnlyEditingAllowed": bool(
                approved_sandbox_master_only_allowed
                or post_approval_master_only_allowed
                or post_listen_master_only_allowed
                or branch_preflight_master_only_allowed
            ),
        },
        "commands": {
            "openStartHere": f"open {shell_quote(start_here)}",
            "openProducerCommandCenter": f"open {shell_quote(producer_center)}",
            "openTechnicalAuditionSnippetPack": f"open {shell_quote(technical_snippet_pack)}",
            "processReviewNotes": f"open {shell_quote(process_notes_command)}",
        },
        "guardrails": {
            "approvalStateChanged": False,
            "branchStateChanged": False,
            "branchRenderAttempted": False,
            "originalMediaMutated": False,
            "publicUploadOrPublishAttempted": False,
        },
    }


def markdown_report(report: dict[str, Any]) -> str:
    lines = [
        "# Episode 4 Audio Human Approval Preflight",
        "",
        f"Generated: `{report['generatedAt']}`",
        "",
        "This preflight does not approve audio, unlock branches, render branches, upload, publish, or mutate source media.",
        "",
        "## Verdict",
        "",
        f"- Baseline: `{report['baselineId']}`",
        f"- Status: `{report['preflightStatus']}`",
        f"- Ready for human decision routing: `{str(report['readyForHumanDecision']).lower()}`",
        f"- Safe next action: {report['safeNextAction']}",
        "",
        "## Current locks",
        "",
        f"- Approval status: `{report['approvalStatus']}`",
        f"- Package ready for human listen: `{str(report['packageReadyForHumanListen']).lower()}`",
        f"- Branch inheritance ready: `{str(report['branchInheritanceReady']).lower()}`",
        f"- Branch render ready: `{str(report['branchRenderReady']).lower()}`",
        "",
        "## Checks",
        "",
        "| Check | Status | Detail | Blocks decision |",
        "| --- | --- | --- | --- |",
    ]
    for check in report["checks"]:
        lines.append(
            f"| `{check['name']}` | `{check['status']}` | {check['detail']} | `{str(check['blocksDecision']).lower()}` |"
        )
    lines.extend(["", "## Review artifacts", "", "| Artifact | Required | Exists | Purpose | Path |", "| --- | --- | --- | --- | --- |"])
    for item in report["artifacts"]:
        lines.append(
            f"| {item['label']} | `{str(item['required']).lower()}` | `{str(item['exists']).lower()}` | {item['purpose']} | `{item['path'] or 'not registered'}` |"
        )
    lines.extend(
        [
            "",
            "## Open commands",
            "",
            "```bash",
            report["commands"]["openStartHere"],
            report["commands"]["openProducerCommandCenter"],
            report["commands"]["openTechnicalAuditionSnippetPack"],
            report["commands"]["processReviewNotes"],
            "```",
            "",
            "## Guardrails",
            "",
        ]
    )
    for key, value in report["guardrails"].items():
        lines.append(f"- {key}: `{str(value).lower()}`")
    lines.append("")
    return "\n".join(lines)


def html_report(report: dict[str, Any]) -> str:
    cards = []
    for check in report["checks"]:
        status = str(check["status"])
        cards.append(
            f"""
            <article class="card {html.escape(status)}">
              <h3>{html.escape(str(check["name"]))}</h3>
              <p><strong>{html.escape(status)}</strong></p>
              <p>{html.escape(str(check["detail"]))}</p>
              <p>Blocks decision: {html.escape(str(check["blocksDecision"]).lower())}</p>
            </article>
            """
        )
    artifacts = []
    for item in report["artifacts"]:
        path = item["path"]
        link = f'<a href="file://{html.escape(path)}">{html.escape(path)}</a>' if path else "not registered"
        artifacts.append(
            f"<li><strong>{html.escape(str(item['label']))}</strong>: exists {html.escape(str(item['exists']).lower())}; {link}</li>"
        )
    return f"""<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title>Episode 4 Audio Human Approval Preflight</title>
  <style>
    body {{
      margin: 0;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      background: #111814;
      color: #f3ead7;
    }}
    main {{
      max-width: 1180px;
      margin: 0 auto;
      padding: 42px 28px 70px;
    }}
    .hero {{
      border: 1px solid rgba(241, 205, 106, .28);
      border-radius: 28px;
      padding: 28px;
      background: radial-gradient(circle at top left, rgba(241, 205, 106, .17), transparent 38%),
                  linear-gradient(135deg, rgba(40, 78, 58, .62), rgba(24, 29, 25, .92));
      box-shadow: 0 24px 80px rgba(0, 0, 0, .28);
    }}
    .eyebrow {{
      color: #f1cd6a;
      text-transform: uppercase;
      letter-spacing: .18em;
      font-weight: 800;
      font-size: 12px;
    }}
    h1 {{
      font-size: clamp(34px, 5vw, 64px);
      line-height: .98;
      margin: 12px 0 18px;
    }}
    .verdict {{
      display: inline-flex;
      gap: 10px;
      align-items: center;
      padding: 10px 14px;
      border-radius: 999px;
      background: rgba(241, 205, 106, .14);
      color: #f1cd6a;
      font-weight: 800;
    }}
    .grid {{
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
      gap: 14px;
      margin-top: 22px;
    }}
    .card {{
      border-radius: 18px;
      background: rgba(255, 255, 255, .06);
      border: 1px solid rgba(255, 255, 255, .09);
      padding: 16px;
    }}
    .card.pass {{ border-color: rgba(80, 200, 120, .42); }}
    .card.fail {{ border-color: rgba(255, 102, 102, .56); }}
    .card.waiting, .card.open-fallback {{ border-color: rgba(241, 205, 106, .42); }}
    code, pre {{
      background: rgba(0, 0, 0, .28);
      border-radius: 8px;
      padding: 2px 6px;
    }}
    pre {{
      padding: 14px;
      overflow: auto;
    }}
    a {{ color: #8ce3ff; }}
    li {{ margin: 8px 0; }}
  </style>
</head>
<body>
<main>
  <section class="hero">
    <div class="eyebrow">Quipsly Audio Workbench</div>
    <h1>Human approval preflight</h1>
    <div class="verdict">{html.escape(report['preflightStatus'])}</div>
    <p><strong>Baseline:</strong> {html.escape(report['baselineId'])}</p>
    <p><strong>Safe next action:</strong> {html.escape(report['safeNextAction'])}</p>
    <p>This page is a guardrail, not a magic wand. It keeps v006 reviewable while branch inheritance remains locked until a real human listen decision exists.</p>
  </section>
  <section>
    <h2>Checks</h2>
    <div class="grid">{''.join(cards)}</div>
  </section>
  <section>
    <h2>Review artifacts</h2>
    <ul>{''.join(artifacts)}</ul>
  </section>
  <section>
    <h2>Commands</h2>
    <pre>{html.escape(chr(10).join(report['commands'].values()))}</pre>
  </section>
</main>
</body>
</html>
"""


def update_manifest(manifest_path: Path, report: dict[str, Any], paths: dict[str, str]) -> None:
    manifest = read_json(manifest_path)
    outputs = manifest.setdefault("outputs", {})
    outputs["latestAudioHumanApprovalPreflight"] = paths["json"]
    outputs["latestAudioHumanApprovalPreflightJson"] = paths["json"]
    outputs["latestAudioHumanApprovalPreflightMarkdown"] = paths["markdown"]
    outputs["latestAudioHumanApprovalPreflightHtml"] = paths["html"]
    outputs["latestAudioHumanApprovalPreflightOpenCommand"] = paths["openCommand"]
    outputs.setdefault("audioHumanApprovalPreflights", []).append(paths["json"])
    manifest["updatedAt"] = report["generatedAt"]
    summary = report.get("summary") if isinstance(report.get("summary"), dict) else {}
    guardrails = report.get("guardrails") if isinstance(report.get("guardrails"), dict) else {}
    manifest["audioHumanApprovalPreflightLatestStatus"] = report["preflightStatus"]
    manifest["audioHumanApprovalPreflightReadyForHumanDecision"] = report["readyForHumanDecision"]
    manifest["audioHumanApprovalPreflightApprovalStatus"] = report["approvalStatus"]
    manifest["audioHumanApprovalPreflightPackageReadyForHumanListen"] = report["packageReadyForHumanListen"]
    manifest["audioHumanApprovalPreflightBranchInheritanceReady"] = report["branchInheritanceReady"]
    manifest["audioHumanApprovalPreflightBranchRenderReady"] = report["branchRenderReady"]
    manifest["audioHumanApprovalPreflightBlockerCount"] = summary.get("blockerCount", 0)
    manifest["audioHumanApprovalPreflightFastReadbackStatus"] = summary.get("fastReadbackStatus")
    manifest["audioHumanApprovalPreflightFastReadbackPassed"] = bool(summary.get("fastReadbackPassed"))
    manifest["audioHumanApprovalPreflightFastReadbackHardStopCount"] = summary.get("fastReadbackHardStopCount", 0)
    manifest["audioHumanApprovalPreflightSourceAwareTimingContractReady"] = bool(
        summary.get("sourceAwareTimingContractReady")
    )
    manifest["audioHumanApprovalPreflightSourceAwareTimingContractReadyRoleCount"] = summary.get(
        "sourceAwareTimingContractReadyRoleCount", 0
    )
    manifest["audioHumanApprovalPreflightApprovedSandboxSourceAwareRenderContractReady"] = bool(
        summary.get("approvedSandboxSourceAwareRenderContractReady")
    )
    manifest["audioHumanApprovalPreflightApprovedSandboxInheritsSourceAwareAudioTruth"] = bool(
        summary.get("approvedSandboxInheritsSourceAwareAudioTruth")
    )
    manifest["audioHumanApprovalPreflightMasteredSpineOnlyEditingAllowed"] = bool(
        summary.get("masteredSpineOnlyEditingAllowed")
    )
    manifest["audioHumanApprovalPreflightApprovalStateChanged"] = bool(guardrails.get("approvalStateChanged"))
    manifest["audioHumanApprovalPreflightBranchStateChanged"] = bool(guardrails.get("branchStateChanged"))
    manifest["audioHumanApprovalPreflightBranchRenderAttempted"] = bool(guardrails.get("branchRenderAttempted"))
    manifest["audioHumanApprovalPreflightOriginalMediaMutated"] = bool(guardrails.get("originalMediaMutated"))
    manifest["audioHumanApprovalPreflightPublicUploadOrPublishAttempted"] = bool(
        guardrails.get("publicUploadOrPublishAttempted")
    )
    manifest.setdefault("reviewState", {})["latestHumanApprovalPreflightStatus"] = report["preflightStatus"]
    manifest.setdefault("reviewState", {})["latestHumanApprovalPreflightReadyForHumanDecision"] = report[
        "readyForHumanDecision"
    ]
    write_json(manifest_path, manifest)


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--baseline-dir", type=Path, default=DEFAULT_BASELINE_DIR)
    parser.add_argument("--no-manifest-update", action="store_true")
    args = parser.parse_args()

    baseline_dir = resolve_baseline_dir(args.baseline_dir)
    manifest_path = baseline_dir / "manifest.json"
    manifest = read_json(manifest_path)
    generated_at = datetime.now(timezone.utc).replace(microsecond=0).isoformat()
    report = build_preflight(manifest, baseline_dir, generated_at)

    slug = safe_slug(str(manifest.get("baselineId") or "audio-baseline"))
    timestamp = datetime.now().strftime("%Y%m%d-%H%M%S")
    base_name = f"audio-human-approval-preflight-{slug}-{timestamp}"
    json_path = baseline_dir / f"{base_name}.json"
    md_path = baseline_dir / f"{base_name}.md"
    html_path = baseline_dir / f"{base_name}.html"
    stable_json = baseline_dir / "HUMAN_APPROVAL_PREFLIGHT.json"
    stable_md = baseline_dir / "HUMAN_APPROVAL_PREFLIGHT.md"
    stable_html = baseline_dir / "HUMAN_APPROVAL_PREFLIGHT.html"
    open_command = baseline_dir / "OPEN_HUMAN_APPROVAL_PREFLIGHT.command"

    write_json(json_path, report)
    write_json(stable_json, report)
    md = markdown_report(report)
    html_doc = html_report(report)
    md_path.write_text(md, encoding="utf-8")
    stable_md.write_text(md, encoding="utf-8")
    html_path.write_text(html_doc, encoding="utf-8")
    stable_html.write_text(html_doc, encoding="utf-8")
    open_command.write_text(
        "#!/bin/zsh\nset -euo pipefail\n"
        f"open {shell_quote(str(stable_html))}\n"
        f"open {shell_quote(str(stable_md))}\n",
        encoding="utf-8",
    )
    os.chmod(open_command, 0o755)

    paths = {
        "json": str(stable_json),
        "markdown": str(stable_md),
        "html": str(stable_html),
        "openCommand": str(open_command),
        "timestampedJson": str(json_path),
        "timestampedMarkdown": str(md_path),
        "timestampedHtml": str(html_path),
    }
    if not args.no_manifest_update:
        update_manifest(manifest_path, report, paths)

    print(json.dumps({"status": report["preflightStatus"], "readyForHumanDecision": report["readyForHumanDecision"], "paths": paths}, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
