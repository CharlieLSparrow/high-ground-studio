#!/usr/bin/env python3
"""Record a guarded listen decision from an imported reviewer-notes packet.

This is a contract adapter between the browser reviewer console and the
existing listen-decision recorder. It does not create a second approval system:
it converts structured reviewer notes into the same decision artifact and
manifest fields produced by audio_workbench_record_listen_decision.py.

Approval still requires --confirm-human-listened.
"""

from __future__ import annotations

import argparse
import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from audio_workbench_record_listen_decision import (
    APPROVAL_STATUSES,
    DECISION_STATUSES,
    build_decision,
    render_markdown,
    resolve_baseline_dir,
    validate_source_aware_approval_preflight,
    version_from_baseline_id,
    write_json,
)

REVIEWER_NOTES_SCHEMA = "quipsly.audio-workbench.reviewer-notes-packet.v1"
MARKER_REVIEW_SCHEMA = "quipsly.audio-workbench.marker-review-notes.v1"


def read_json(path: Path) -> dict[str, Any]:
    return json.loads(path.read_text(encoding="utf-8"))


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


def load_marker_lookup(manifest: dict[str, Any]) -> dict[str, dict[str, Any]]:
    outputs = manifest.get("outputs") or {}
    marker_packet_path = output_path(outputs.get("latestEditorMarkerPacket"))
    if not marker_packet_path or not Path(marker_packet_path).exists():
        return {}
    packet = read_json(Path(marker_packet_path))
    lookup: dict[str, dict[str, Any]] = {}
    for marker in packet.get("markers") or []:
        marker_id = str(marker.get("markerId") or "").strip()
        if marker_id:
            lookup[marker_id] = marker
    return lookup


def marker_label(marker: dict[str, Any], lookup: dict[str, dict[str, Any]]) -> str:
    marker_id = str(marker.get("markerId") or "").strip()
    source = lookup.get(marker_id) or {}
    name = str(source.get("name") or "").strip()
    timecode = str(marker.get("timecodeIn") or source.get("timecodeIn") or "").strip()
    category = str(marker.get("category") or source.get("category") or "").strip()
    parts = [part for part in [marker_id, name or category, timecode] if part]
    return " / ".join(parts) or "unknown-marker"


def split_window_decisions(packet: dict[str, Any]) -> tuple[list[str], list[str], list[str]]:
    passed: list[str] = []
    failed: list[str] = []
    issues: list[str] = []
    for window in packet.get("windows") or []:
        label = str(window.get("label") or "").strip()
        if not label:
            continue
        decision = str(window.get("decision") or "undecided").strip()
        notes = str(window.get("notes") or "").strip()
        if decision == "pass":
            passed.append(label)
        elif decision == "fail":
            failed.append(label)
            issues.append(f"{label}: {notes or 'failed in reviewer notes packet'}")
        elif decision == "more-proof":
            issues.append(f"{label}: needs more proof. {notes}".strip())
        else:
            issues.append(f"{label}: undecided in reviewer notes packet")
    return passed, failed, issues


def split_marker_decisions(
    packet: dict[str, Any],
    marker_lookup: dict[str, dict[str, Any]],
) -> tuple[list[str], list[str], list[str]]:
    passed: list[str] = []
    failed: list[str] = []
    issues: list[str] = []
    for marker in packet.get("markers") or []:
        label = marker_label(marker, marker_lookup)
        decision = str(marker.get("decision") or "undecided").strip()
        notes = str(marker.get("notes") or "").strip()
        category = str(marker.get("category") or marker_lookup.get(str(marker.get("markerId") or ""), {}).get("category") or "").strip()
        if decision == "pass":
            passed.append(label)
        elif decision in ("needs-repair", "fail", "failed"):
            failed.append(label)
            issues.append(f"{label}: {notes or 'marked needs-repair in marker review notes'}")
        elif decision in ("more-proof", "needs-proof"):
            issues.append(f"{label}: needs more proof. {notes}".strip())
        elif category in ("critical-listen", "bleed-check") and decision == "undecided":
            issues.append(f"{label}: undecided critical marker in marker review notes")
    return passed, failed, issues


def notes_for_reviewer_packet(packet: dict[str, Any]) -> str:
    lines = [
        f"Imported reviewer notes packet: {packet.get('sourcePacketPath') or ''}",
        f"Packet generated: {packet.get('generatedAt')}",
        f"Packet suggested decision: {packet.get('suggestedDecisionStatus')}",
        "",
        "Whole episode notes:",
        str(packet.get("wholeEpisodeNotes") or "_No whole-episode notes recorded._"),
        "",
        "Proof-window notes:",
    ]
    for window in packet.get("windows") or []:
        label = str(window.get("label") or "unknown-window")
        decision = str(window.get("decision") or "undecided")
        note = str(window.get("notes") or "")
        lines.append(f"- {label}: {decision}. {note}".rstrip())
    return "\n".join(lines).strip()


def notes_for_marker_packet(packet: dict[str, Any], marker_lookup: dict[str, dict[str, Any]]) -> str:
    lines = [
        f"Imported marker review notes packet: {packet.get('sourcePacketPath') or ''}",
        f"Packet exported: {packet.get('exportedAt') or packet.get('generatedAt')}",
        f"Packet suggested decision: {packet.get('suggestedDecision')}",
        "",
        "Overall notes:",
        str(packet.get("overallNotes") or "_No overall notes recorded._"),
        "",
        "Marker notes:",
    ]
    for marker in packet.get("markers") or []:
        label = marker_label(marker, marker_lookup)
        decision = str(marker.get("decision") or "undecided")
        note = str(marker.get("notes") or "")
        lines.append(f"- {label}: {decision}. {note}".rstrip())
    return "\n".join(lines).strip()


def validate_packet(packet: dict[str, Any], manifest: dict[str, Any], notes_packet_path: Path) -> str:
    schema = packet.get("schema")
    if schema not in (REVIEWER_NOTES_SCHEMA, MARKER_REVIEW_SCHEMA):
        raise ValueError("Notes packet has the wrong schema.")
    if schema == REVIEWER_NOTES_SCHEMA and packet.get("mode") != "imported-notes":
        raise ValueError("Use an imported-notes packet, not the blank reviewer notes template.")
    if packet.get("baselineId") != manifest.get("baselineId"):
        raise ValueError(
            "Notes packet baselineId does not match manifest baselineId: "
            f"{packet.get('baselineId')} != {manifest.get('baselineId')}"
        )
    packet["sourcePacketPath"] = str(notes_packet_path)
    return str(schema)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--baseline-dir", required=True, type=Path)
    parser.add_argument("--notes-packet", required=True, type=Path)
    parser.add_argument("--reviewer", default="")
    parser.add_argument("--status", choices=sorted(DECISION_STATUSES))
    parser.add_argument("--confirm-human-listened", action="store_true")
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    baseline_dir = resolve_baseline_dir(args.baseline_dir.expanduser()).resolve()
    manifest_path = baseline_dir / "manifest.json"
    manifest = read_json(manifest_path)
    notes_packet_path = args.notes_packet.expanduser().resolve()
    packet = read_json(notes_packet_path)
    schema = validate_packet(packet, manifest, notes_packet_path)
    marker_lookup = load_marker_lookup(manifest)

    suggested_status = str(
        packet.get("suggestedDecisionStatus")
        or packet.get("suggestedDecision")
        or "pending-human-listen"
    )
    status = args.status or suggested_status
    if status not in DECISION_STATUSES:
        raise ValueError(f"Unsupported listen decision status from notes packet: {status}")

    if schema == MARKER_REVIEW_SCHEMA:
        passed_windows, failed_windows, issues = split_marker_decisions(packet, marker_lookup)
        notes = notes_for_marker_packet(packet, marker_lookup)
        source_kind = "marker-review-notes"
    else:
        passed_windows, failed_windows, issues = split_window_decisions(packet)
        notes = notes_for_reviewer_packet(packet)
        source_kind = "reviewer-window-notes"
    reviewer = args.reviewer or str(packet.get("reviewer") or "").strip() or "reviewer-notes-packet"
    decision = build_decision(
        baseline_dir,
        status=status,
        reviewer=reviewer,
        notes=notes,
        passed_windows=passed_windows,
        failed_windows=failed_windows,
        issues=issues,
        confirm_human_listened=args.confirm_human_listened,
    )
    approval_preflight = validate_source_aware_approval_preflight(
        baseline_dir,
        status=decision["decisionStatus"],
        regenerate_fast_readback=not args.dry_run,
    )
    decision["sourceAwareApprovalPreflight"] = approval_preflight

    baseline_id = str(decision.get("baselineId") or "unknown")
    version = version_from_baseline_id(baseline_id)
    timestamp = datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S")
    json_path = baseline_dir / f"audio-listen-decision-from-notes-{version}-{timestamp}.json"
    md_path = baseline_dir / f"audio-listen-decision-from-notes-{version}-{timestamp}.md"

    planned = {
        "json": str(json_path),
        "markdown": str(md_path),
        "notesPacket": str(notes_packet_path),
        "notesPacketSchema": schema,
        "notesPacketKind": source_kind,
        "decisionStatus": decision["decisionStatus"],
        "publicationApproved": decision["publicationApproved"],
        "confirmHumanListened": decision["confirmHumanListened"],
        "dryRun": args.dry_run,
        "sourceAwareApprovalPreflightStatus": approval_preflight["status"],
        "sourceAwareApprovalPreflightPassed": approval_preflight["passed"],
        "approvalStateWouldChange": decision["decisionStatus"] in APPROVAL_STATUSES
        or decision["decisionStatus"] in ("failed-human-listen", "needs-focused-proof"),
    }
    if args.dry_run:
        print(json.dumps(planned, indent=2, sort_keys=True))
        return

    write_json(json_path, decision)
    md_path.write_text(render_markdown(decision), encoding="utf-8")

    outputs = manifest.setdefault("outputs", {})
    outputs["latestListenDecision"] = str(json_path)
    outputs["latestListenDecisionMarkdown"] = str(md_path)
    outputs["latestListenDecisionFromReviewerNotes"] = str(json_path)
    outputs["latestListenDecisionFromReviewerNotesMarkdown"] = str(md_path)
    history = outputs.setdefault("listenDecisionsFromReviewerNotes", [])
    if str(json_path) not in history:
        history.append(str(json_path))
    manifest["listenDecisionFromReviewerNotesCount"] = len(history)

    if decision["decisionStatus"] in APPROVAL_STATUSES:
        manifest["approvalStatus"] = decision["decisionStatus"]
    elif decision["decisionStatus"] in ("failed-human-listen", "needs-focused-proof"):
        manifest["approvalStatus"] = decision["decisionStatus"]
    # Approval from imported notes is still only a human-listen decision. Keep
    # branch readiness locked until the source-aware post-listen refresh proves
    # Charlie/Homer/clip-source stems, timing, and render preflight. This must
    # match the direct recorder so reviewer-note imports cannot bypass the
    # source-aware gate.
    manifest["branchInheritanceReady"] = False
    manifest["branchRenderReady"] = False
    manifest["branchReadinessRefreshRequired"] = decision["decisionStatus"] in APPROVAL_STATUSES
    manifest["branchReadinessRequiresSourceAwareGate"] = True
    manifest["branchReadinessLastListenDecisionStatus"] = decision["decisionStatus"]
    manifest["branchRenderAudioTruth"] = "source-aware-refined-stems"
    manifest["masteredSpineUse"] = "review-export-premiere-final-podcast-convenience-not-editable-branch-truth"
    manifest["masteredSpineOnlyEditingAllowed"] = False
    manifest["branchReadinessNextAction"] = (
        "Run audio_workbench_post_listen_refresh.py so the source-aware branch "
        "gate, branch render preflight, approved executor, runway, and router "
        "refresh in order. Do not render from the mastered spine alone."
    )
    write_json(manifest_path, manifest)

    print(json.dumps(planned, indent=2, sort_keys=True))


if __name__ == "__main__":
    main()
