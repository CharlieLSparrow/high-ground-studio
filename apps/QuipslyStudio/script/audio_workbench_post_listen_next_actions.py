#!/usr/bin/env python3
"""Generate guarded next actions after an audio listen review.

The planner is deliberately conservative:
- before human approval, it refuses real branch render commands;
- after approval and refreshed branch gate, it exposes the approved branch
  render commands from the branch preflight artifact;
- on failed review, it routes toward v007/timestamped repair work.
"""

from __future__ import annotations

import argparse
import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


APPROVED_STATUSES = {
    "human-approved-for-branch-inheritance",
    "approved-for-branch-inheritance",
}


FAILED_STATUSES = {
    "failed-human-listen",
    "human-listen-failed",
    "rejected-human-listen",
}


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


def load_json(path: Path) -> dict[str, Any]:
    return json.loads(path.read_text())


def safe_slug(value: str) -> str:
    out = "".join(ch.lower() if ch.isalnum() else "-" for ch in value)
    while "--" in out:
        out = out.replace("--", "-")
    return out.strip("-") or "audio-baseline"


def command_block(commands: list[str] | str | None) -> str:
    if not commands:
        return "_No command available in current preflight artifact._"
    if isinstance(commands, str):
        return f"```bash\n{commands}\n```"
    return "```bash\n" + "\n".join(commands) + "\n```"


def normalize_commands(value: Any) -> list[str] | str | None:
    if value is None:
        return None
    if isinstance(value, str):
        return value
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
    return str(value)


def determine_state(manifest: dict[str, Any], listen_decision: dict[str, Any] | None) -> dict[str, Any]:
    approval_status = str(manifest.get("approvalStatus") or "")
    decision_status = ""
    publication_approved = False
    if listen_decision:
        decision_status = str(listen_decision.get("decisionStatus") or listen_decision.get("status") or "")
        publication_approved = bool(listen_decision.get("publicationApproved"))

    branch_ready = bool(manifest.get("branchInheritanceReady"))
    branch_render_ready = bool(manifest.get("branchRenderReady"))
    package_ready = bool(manifest.get("packageReadyForHumanListen"))

    if approval_status in APPROVED_STATUSES and branch_ready:
        status = "ready-for-approved-branch-render"
    elif approval_status in FAILED_STATUSES or decision_status in FAILED_STATUSES:
        status = "listen-failed-render-repair-candidate"
    elif package_ready:
        status = "waiting-for-human-listen"
    else:
        status = "repair-review-package-first"

    return {
        "approvalStatus": approval_status,
        "decisionStatus": decision_status,
        "publicationApproved": publication_approved,
        "branchInheritanceReady": branch_ready,
        "branchRenderReady": branch_render_ready,
        "packageReadyForHumanListen": package_ready,
        "status": status,
    }


def build_markdown(report: dict[str, Any]) -> str:
    lines = [
        f"# Post-Listen Next Actions: {report['baselineId']}",
        "",
        f"Generated: `{report['generatedAt']}`",
        "",
        "This is a guarded action plan. It does not approve audio and it does not render branches by itself.",
        "",
        "## Current gate state",
        "",
        f"- Status: `{report['status']}`",
        f"- Approval status: `{report['approvalStatus']}`",
        f"- Listen decision status: `{report['decisionStatus'] or 'unknown'}`",
        f"- Package ready for human listen: `{str(report['packageReadyForHumanListen']).lower()}`",
        f"- Branch inheritance ready: `{str(report['branchInheritanceReady']).lower()}`",
        f"- Branch render ready: `{str(report['branchRenderReady']).lower()}`",
        f"- Publication approved: `{str(report['publicationApproved']).lower()}`",
        "",
        "## Next safest action",
        "",
        report["nextSafestAction"],
        "",
    ]
    if report["openReviewCommands"]:
        lines.extend(["## Open review artifacts", "", command_block(report["openReviewCommands"]), ""])
    if report["approvalCommands"]:
        lines.extend(["## If human listen passes", "", command_block(report["approvalCommands"]), ""])
    if report["failureCommands"]:
        lines.extend(["## If human listen fails", "", command_block(report["failureCommands"]), ""])
    if report["approvedRenderCommands"]:
        lines.extend(["## Approved branch render commands", "", command_block(report["approvedRenderCommands"]), ""])
    else:
        lines.extend(
            [
                "## Approved branch render commands",
                "",
                "Real branch render commands are intentionally hidden until approval status and branch inheritance gates pass.",
                "",
            ]
        )
    if report["proofOnlyCommands"]:
        lines.extend(
            [
                "## Proof-only commands",
                "",
                "These are for tiny internal proof renders only. They must not be used as publication truth.",
                "",
                command_block(report["proofOnlyCommands"]),
                "",
            ]
        )
    return "\n".join(lines)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--baseline-dir", required=True, type=Path)
    args = parser.parse_args()

    baseline_dir = args.baseline_dir.expanduser().resolve()
    manifest_path = baseline_dir / "manifest.json"
    if not manifest_path.exists():
        raise SystemExit(f"Missing manifest: {manifest_path}")
    manifest = load_json(manifest_path)
    outputs = manifest.setdefault("outputs", {})

    preflight_path_value = output_path(outputs.get("branchRenderPreflight"))
    preflight = load_json(Path(preflight_path_value)) if preflight_path_value and Path(preflight_path_value).exists() else {}
    preflight_commands = preflight.get("commands") or {}

    listen_decision_path_value = output_path(outputs.get("latestListenDecisionTemplate"))
    listen_decision = (
        load_json(Path(listen_decision_path_value))
        if listen_decision_path_value and Path(listen_decision_path_value).exists()
        else None
    )

    state = determine_state(manifest, listen_decision)
    generated_at = datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S")
    baseline_id = str(manifest.get("baselineId") or "audio-baseline")
    slug = safe_slug(baseline_id.replace("episode-4-conformed-production-baseline-", ""))

    handoff = output_path(outputs.get("latestReviewHandoffIndexMarkdown"))
    cockpit = output_path(outputs.get("audioReviewCockpitHtml"))
    visual = output_path(outputs.get("latestVisualProofWindowsHtml"))
    open_commands = [f"open '{path}'" for path in [handoff, cockpit, visual] if path]

    approved_render_commands = None
    if state["status"] == "ready-for-approved-branch-render":
        approved_render_commands = normalize_commands(preflight_commands.get("renderAfterApproval"))

    if state["status"] == "waiting-for-human-listen":
        next_action = "Open the handoff/cockpit, complete the human listen pass, then record pass or fail. Do not render real branches yet."
    elif state["status"] == "ready-for-approved-branch-render":
        next_action = "Run the approved branch render commands, then QC each branch output before publication use."
    elif state["status"] == "listen-failed-render-repair-candidate":
        next_action = "Use the failed listen notes to tune the failing stage and render a v007 or timestamped repair candidate. Do not overwrite v006."
    else:
        next_action = "Repair review package coherence first, then regenerate readiness verification and handoff index."

    report = {
        "schema": "quipsly.audio-workbench.post-listen-next-actions.v1",
        "generatedAt": generated_at,
        "baselineDir": str(baseline_dir),
        "baselineId": baseline_id,
        **state,
        "preflightPath": preflight_path_value,
        "listenDecisionPath": listen_decision_path_value,
        "openReviewCommands": open_commands,
        "approvalCommands": normalize_commands(preflight_commands.get("recordBranchInheritanceApproval")),
        "failureCommands": [
            f"OUT='{baseline_dir}'",
            "python3 apps/QuipslyStudio/script/audio_workbench_record_listen_decision.py \\",
            '  --baseline-dir \"$OUT\" \\',
            "  --status failed-human-listen \\",
            '  --reviewer \"Charlie or Mako\" \\',
            '  --notes \"Human listen found an issue; render v007/timestamped repair candidate instead of overwriting v006.\" \\',
            '  --issue \"Describe the failing proof window or audio artifact here\" \\',
            "  --confirm-human-listened",
        ],
        "approvedRenderCommands": approved_render_commands,
        "proofOnlyCommands": normalize_commands(preflight_commands.get("proofOnlyUnapproved60s")),
        "nextSafestAction": next_action,
    }

    output_json = baseline_dir / f"audio-post-listen-next-actions-{slug}-{generated_at}.json"
    output_md = baseline_dir / f"audio-post-listen-next-actions-{slug}-{generated_at}.md"
    output_json.write_text(json.dumps(report, indent=2) + "\n")
    output_md.write_text(build_markdown(report) + "\n")

    outputs["latestPostListenNextActions"] = str(output_json)
    outputs["latestPostListenNextActionsMarkdown"] = str(output_md)
    history = outputs.setdefault("postListenNextActions", [])
    if str(output_json) not in history:
        history.append(str(output_json))
    manifest["latestPostListenNextActionsGeneratedAt"] = generated_at
    manifest["postListenNextActionsCount"] = len(history)
    manifest_path.write_text(json.dumps(manifest, indent=2) + "\n")

    print(f"Wrote {output_md}")
    print(f"Wrote {output_json}")
    print(f"Status: {report['status']}")
    print(f"Approved render commands exposed: {bool(report['approvedRenderCommands'])}")


if __name__ == "__main__":
    main()
