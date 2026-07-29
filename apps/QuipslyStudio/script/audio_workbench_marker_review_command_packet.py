#!/usr/bin/env python3
"""Generate guarded command paths from a marker-review notes packet.

This is not an approval tool. It creates a reviewer-facing Markdown/JSON packet
with exact dry-run, failure, approval, branch-gate, and outcome-router commands
for the existing guarded notes-to-decision bridge.

The packet may be generated from the blank marker-review notes template or from
an exported marker-review notes JSON file. If the input is still a template or
has undecided markers, the generated approval command is intentionally framed as
locked guidance, not as something to run blindly.
"""

from __future__ import annotations

import argparse
import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


MARKER_REVIEW_SCHEMA = "quipsly.audio-workbench.marker-review-notes.v1"


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


def safe_slug(value: str) -> str:
    out = "".join(ch.lower() if ch.isalnum() else "-" for ch in value)
    while "--" in out:
        out = out.replace("--", "-")
    return out.strip("-") or "audio-baseline"


def output_path(value: Any) -> str | None:
    if isinstance(value, str):
        return value
    if isinstance(value, dict):
        path = value.get("path")
        if isinstance(path, str):
            return path
    return None


def shell_quote(value: str) -> str:
    return "'" + value.replace("'", "'\\''") + "'"


def classify_marker_notes(packet: dict[str, Any]) -> dict[str, Any]:
    markers = packet.get("markers") or []
    counts = {
        "markerCount": 0,
        "passCount": 0,
        "needsRepairCount": 0,
        "needsProofCount": 0,
        "undecidedCount": 0,
        "criticalUndecidedCount": 0,
    }
    critical_categories = {"critical-listen", "bleed-check", "approval-gate"}
    needs_attention: list[dict[str, Any]] = []
    for marker in markers:
        counts["markerCount"] += 1
        marker_id = str(marker.get("markerId") or "").strip() or "unknown-marker"
        category = str(marker.get("category") or "").strip()
        decision = str(marker.get("decision") or "undecided").strip()
        notes = str(marker.get("notes") or "").strip()
        if decision == "pass":
            counts["passCount"] += 1
        elif decision in {"needs-repair", "fail", "failed"}:
            counts["needsRepairCount"] += 1
            needs_attention.append(
                {
                    "markerId": marker_id,
                    "category": category,
                    "decision": decision,
                    "notes": notes,
                }
            )
        elif decision in {"more-proof", "needs-proof"}:
            counts["needsProofCount"] += 1
            needs_attention.append(
                {
                    "markerId": marker_id,
                    "category": category,
                    "decision": decision,
                    "notes": notes,
                }
            )
        else:
            counts["undecidedCount"] += 1
            if category in critical_categories:
                counts["criticalUndecidedCount"] += 1
                needs_attention.append(
                    {
                        "markerId": marker_id,
                        "category": category,
                        "decision": "undecided",
                        "notes": notes,
                    }
                )
    suggested = "pending-human-listen"
    if counts["needsRepairCount"] > 0:
        suggested = "failed-human-listen"
    elif counts["needsProofCount"] > 0 or counts["criticalUndecidedCount"] > 0:
        suggested = "needs-focused-proof"
    elif counts["markerCount"] > 0 and counts["undecidedCount"] == 0:
        suggested = "human-approved-for-branch-inheritance"
    return {
        "counts": counts,
        "needsAttention": needs_attention,
        "suggestedDecisionStatus": suggested,
    }


def command_lines(
    *,
    baseline_dir: Path,
    notes_packet: str,
    reviewer: str,
    status: str | None = None,
    dry_run: bool = False,
    confirm: bool = False,
) -> list[str]:
    lines = [
        "OUT=" + shell_quote(str(baseline_dir)),
        "NOTES_PACKET=" + shell_quote(notes_packet),
        "python3 apps/QuipslyStudio/script/audio_workbench_record_listen_decision_from_notes.py \\",
        '  --baseline-dir "$OUT" \\',
        '  --notes-packet "$NOTES_PACKET" \\',
        "  --reviewer " + shell_quote(reviewer) + " \\",
    ]
    if status:
        lines.append("  --status " + shell_quote(status) + " \\")
    if confirm:
        lines.append("  --confirm-human-listened \\")
    if dry_run:
        lines.append("  --dry-run")
    else:
        lines[-1] = lines[-1].rstrip(" \\")
    return lines


def existing_script_command(script_name: str, baseline_dir: Path) -> list[str]:
    return [
        "OUT=" + shell_quote(str(baseline_dir)),
        f'python3 apps/QuipslyStudio/script/{script_name} --baseline-dir "$OUT"',
    ]


def render_markdown(report: dict[str, Any]) -> str:
    commands = report["commands"]
    counts = report["notesAnalysis"]["counts"]
    attention = report["notesAnalysis"]["needsAttention"]
    lines = [
        f"# Marker Review Command Packet: {report['baselineId']}",
        "",
        f"Generated: `{report['generatedAt']}`",
        "",
        "This packet is a map, not a magic wand. It does not approve audio, fail audio, render branches, upload files, or mutate original media.",
        "",
        "## Current truth",
        "",
        f"- Approval status: `{report['approvalStatus']}`",
        f"- Branch inheritance ready: `{str(report['branchInheritanceReady']).lower()}`",
        f"- Branch render ready: `{str(report['branchRenderReady']).lower()}`",
        f"- Human listen still required: `{str(report['humanListenStillRequired']).lower()}`",
        f"- Notes input: `{report['notesPacket']}`",
        f"- Notes input mode: `{report['notesInputMode']}`",
        "",
        "## Marker notes analysis",
        "",
        f"- Marker count: `{counts['markerCount']}`",
        f"- Pass: `{counts['passCount']}`",
        f"- Needs repair: `{counts['needsRepairCount']}`",
        f"- Needs proof: `{counts['needsProofCount']}`",
        f"- Undecided: `{counts['undecidedCount']}`",
        f"- Critical undecided: `{counts['criticalUndecidedCount']}`",
        f"- Suggested decision status: `{report['notesAnalysis']['suggestedDecisionStatus']}`",
        "",
    ]
    if attention:
        lines.extend(["## Markers still needing attention", ""])
        for item in attention:
            lines.append(
                f"- `{item['markerId']}` `{item['category']}` `{item['decision']}`"
                + (f": {item['notes']}" if item["notes"] else "")
            )
        lines.append("")
    lines.extend(
        [
            "## Step 1: dry-run the notes bridge",
            "",
            "Run this first. It should print planned decision output and leave the manifest unchanged.",
            "",
            "```bash",
            *commands["dryRunNotesBridge"],
            "```",
            "",
            "## Step 2A: if human listen found a real problem",
            "",
            "Use this after someone actually listened and the notes identify a failure or focused-proof need. The existing bridge records the failure and keeps branch renders locked.",
            "",
            "```bash",
            *commands["recordFailedHumanListen"],
            "```",
            "",
            "## Step 2B: if human listen passes",
            "",
            "Use this only after an actual human listen pass. The confirmation flag is intentionally required.",
            "",
            "```bash",
            *commands["recordHumanApproval"],
            "```",
            "",
            "Then re-run the branch gate:",
            "",
            "```bash",
            *commands["branchGate"],
            "```",
            "",
            "And route the post-listen outcome:",
            "",
            "```bash",
            *commands["postListenOutcomeRouter"],
            "```",
            "",
            "## Guardrail",
            "",
            "If this packet was generated from the blank template or still has undecided critical markers, do not run the approval command. Export real marker notes from the review console first. Quipsly is allowed to be powerful; it is not allowed to pretend ears happened.",
            "",
        ]
    )
    return "\n".join(lines)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--baseline-dir", required=True, type=Path)
    parser.add_argument("--notes-packet", type=Path)
    parser.add_argument("--reviewer", default="Charlie or Mako")
    args = parser.parse_args()

    baseline_dir = resolve_baseline_dir(args.baseline_dir)
    manifest_path = baseline_dir / "manifest.json"
    manifest = read_json(manifest_path)
    outputs = manifest.setdefault("outputs", {})
    baseline_id = str(manifest.get("baselineId") or "unknown-baseline")
    slug = safe_slug(baseline_id.replace("episode-4-conformed-production-baseline-", ""))
    generated_at = datetime.now(timezone.utc).isoformat()
    timestamp = datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S")

    default_notes = output_path(outputs.get("latestEditorMarkerReviewConsoleNotesTemplate"))
    notes_packet_path = args.notes_packet.expanduser().resolve() if args.notes_packet else None
    if notes_packet_path is None and default_notes:
        notes_packet_path = Path(default_notes).expanduser().resolve()
    if notes_packet_path is None or not notes_packet_path.exists():
        raise FileNotFoundError("No marker review notes packet/template was provided or registered.")

    notes_packet = read_json(notes_packet_path)
    if notes_packet.get("schema") != MARKER_REVIEW_SCHEMA:
        raise ValueError(f"Expected schema {MARKER_REVIEW_SCHEMA}, got {notes_packet.get('schema')}")
    if notes_packet.get("baselineId") != baseline_id:
        raise ValueError(
            "Marker review notes baselineId does not match manifest baselineId: "
            f"{notes_packet.get('baselineId')} != {baseline_id}"
        )

    notes_input_mode = "provided-exported-notes" if args.notes_packet else "registered-template-or-latest"
    notes_analysis = classify_marker_notes(notes_packet)
    if not args.notes_packet:
        notes_analysis["suggestedDecisionStatus"] = "pending-human-listen"
        notes_analysis["templateModeReason"] = (
            "This packet was generated from the registered notes template, so "
            "undecided markers mean the review has not happened yet."
        )
    notes_for_commands = (
        str(notes_packet_path)
        if args.notes_packet
        else "<replace with exported marker-review-notes JSON from the review console>"
    )
    report = {
        "schema": "quipsly.audio-workbench.marker-review-command-packet.v1",
        "generatedAt": generated_at,
        "baselineDir": str(baseline_dir),
        "baselineId": baseline_id,
        "approvalStatus": manifest.get("approvalStatus"),
        "branchInheritanceReady": bool(manifest.get("branchInheritanceReady")),
        "branchRenderReady": bool(manifest.get("branchRenderReady")),
        "humanListenStillRequired": not bool(manifest.get("branchInheritanceReady")),
        "notesPacket": str(notes_packet_path),
        "notesInputMode": notes_input_mode,
        "notesAnalysis": notes_analysis,
        "approvalStateChanged": False,
        "branchStateChanged": False,
        "renderAttempted": False,
        "originalMediaMutated": False,
        "commands": {
            "dryRunNotesBridge": command_lines(
                baseline_dir=baseline_dir,
                notes_packet=notes_for_commands,
                reviewer=args.reviewer,
                dry_run=True,
            ),
            "recordFailedHumanListen": command_lines(
                baseline_dir=baseline_dir,
                notes_packet=notes_for_commands,
                reviewer=args.reviewer,
                status="failed-human-listen",
                confirm=True,
            ),
            "recordHumanApproval": command_lines(
                baseline_dir=baseline_dir,
                notes_packet=notes_for_commands,
                reviewer=args.reviewer,
                status="human-approved-for-branch-inheritance",
                confirm=True,
            ),
            "branchGate": existing_script_command("audio_workbench_branch_gate.py", baseline_dir),
            "postListenOutcomeRouter": existing_script_command(
                "audio_workbench_post_listen_outcome_router.py",
                baseline_dir,
            ),
        },
    }

    json_path = baseline_dir / f"audio-marker-review-command-packet-{slug}-{timestamp}.json"
    md_path = baseline_dir / f"audio-marker-review-command-packet-{slug}-{timestamp}.md"
    write_json(json_path, report)
    md_path.write_text(render_markdown(report), encoding="utf-8")

    outputs["latestMarkerReviewCommandPacket"] = str(json_path)
    outputs["latestMarkerReviewCommandPacketMarkdown"] = str(md_path)
    history = outputs.setdefault("markerReviewCommandPackets", [])
    if str(json_path) not in history:
        history.append(str(json_path))
    manifest["markerReviewCommandPacketCount"] = len(history)
    write_json(manifest_path, manifest)

    print(
        json.dumps(
            {
                "baselineId": baseline_id,
                "markdown": str(md_path),
                "json": str(json_path),
                "approvalStateChanged": False,
                "branchStateChanged": False,
                "renderAttempted": False,
                "originalMediaMutated": False,
                "notesInputMode": notes_input_mode,
                "suggestedDecisionStatus": notes_analysis["suggestedDecisionStatus"],
                "markerCount": notes_analysis["counts"]["markerCount"],
                "criticalUndecidedCount": notes_analysis["counts"]["criticalUndecidedCount"],
            },
            indent=2,
            sort_keys=True,
        )
    )


if __name__ == "__main__":
    main()
