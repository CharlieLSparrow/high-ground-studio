#!/usr/bin/env python3
"""Plan safe audio repair actions from exported human listen notes.

This is a planning layer between human review evidence and v007/timestamped audio
repair work. It accepts listen-priority console notes or marker-review notes,
validates that they belong to the current baseline, and writes scoped repair or
focused-proof guidance.

It does not approve audio, fail audio, render media, upload files, or mutate
original media. It may register its report in the baseline manifest.
"""

from __future__ import annotations

import argparse
import json
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


LISTEN_PRIORITY_SCHEMA = "quipsly.audio-workbench.listen-priority-notes.v1"
MARKER_REVIEW_SCHEMA = "quipsly.audio-workbench.marker-review-notes.v1"
CONTROL_ROOM_SCHEMA = "quipsly.audio-workbench.human-listen-control-room-notes.v1"
ACCEPTED_NOTE_SCHEMAS = {LISTEN_PRIORITY_SCHEMA, MARKER_REVIEW_SCHEMA, CONTROL_ROOM_SCHEMA}
REPAIR_DECISIONS = {"needs-repair", "fail", "failed"}
PROOF_DECISIONS = {"needs-proof", "more-proof"}
PASS_DECISIONS = {"pass"}


@dataclass(frozen=True)
class ReviewItem:
    source_schema: str
    source_path: Path
    item_id: str
    label: str
    decision: str
    timecode: str
    sequence_start_seconds: float | None
    duration_seconds: float | None
    notes: str
    severity: str


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


def output_path(value: Any) -> str | None:
    if isinstance(value, str):
        return value
    if isinstance(value, dict):
        path = value.get("path")
        if isinstance(path, str):
            return path
    return None


def safe_slug(value: str) -> str:
    out = "".join(ch if ch.isalnum() or ch in "-_" else "-" for ch in value.lower())
    while "--" in out:
        out = out.replace("--", "-")
    return out.strip("-") or "audio-baseline"


def shell_quote(value: str) -> str:
    return "'" + value.replace("'", "'\\''") + "'"


def coerce_float(value: Any) -> float | None:
    if value is None or value == "":
        return None
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def selected_candidate_path(report_path: str | None) -> Path | None:
    if not report_path:
        return None
    path = Path(report_path)
    if not path.exists():
        return None
    report = read_json(path)
    selected = report.get("selectedCandidate")
    if isinstance(selected, dict) and selected.get("path"):
        candidate_path = Path(str(selected["path"])).expanduser()
        return candidate_path if candidate_path.exists() else None
    return None


def default_notes_packets(manifest: dict[str, Any]) -> list[Path]:
    outputs = manifest.get("outputs") or {}
    candidates: list[Path] = []
    for key in ["latestAudioListenPriorityNotesInbox", "latestMarkerReviewNotesInbox"]:
        path = selected_candidate_path(output_path(outputs.get(key)))
        if path and path not in candidates:
            candidates.append(path)
    return candidates


def normalize_decision(value: Any) -> str:
    decision = str(value or "undecided").strip()
    if decision in {"fail", "failed"}:
        return "needs-repair"
    if decision == "more-proof":
        return "needs-proof"
    return decision or "undecided"


def item_timecode(item: dict[str, Any]) -> str:
    for key in ["timecode", "startTimecode", "sequenceTimecode", "start", "sequenceStart"]:
        value = item.get(key)
        if value not in (None, ""):
            return str(value)
    seconds = coerce_float(
        item.get("sequenceStartSeconds")
        or item.get("sequenceTimeSeconds")
        or item.get("startSeconds")
        or item.get("start")
    )
    if seconds is not None:
        hours = int(seconds // 3600)
        minutes = int((seconds % 3600) // 60)
        secs = seconds % 60
        return f"{hours:02d}:{minutes:02d}:{secs:06.3f}"
    return "unknown"


def extract_review_items(packet_path: Path, packet: dict[str, Any]) -> list[ReviewItem]:
    schema = str(packet.get("schema") or "")
    rows: list[dict[str, Any]] = []
    if schema == LISTEN_PRIORITY_SCHEMA:
        rows = [dict(item) for item in packet.get("items") or []]
    elif schema == MARKER_REVIEW_SCHEMA:
        rows = [dict(item) for item in packet.get("markers") or []]
    elif schema == CONTROL_ROOM_SCHEMA:
        rows = [
            {
                "id": note.get("id") or f"control-room-note-{index}",
                "label": note.get("label") or note.get("title") or note.get("id") or f"Control room note {index}",
                "decision": note.get("decision"),
                "notes": note.get("notes") or note.get("note"),
                "kind": "human-listen-control-room-note",
            }
            for index, note in enumerate(packet.get("notes") or [], start=1)
            if isinstance(note, dict)
        ]
    else:
        raise ValueError(f"Unsupported notes schema: {schema}")

    items: list[ReviewItem] = []
    for index, row in enumerate(rows, start=1):
        decision = normalize_decision(row.get("decision"))
        start_seconds = coerce_float(
            row.get("sequenceStartSeconds")
            or row.get("sequenceTimeSeconds")
            or row.get("startSeconds")
            or row.get("start")
        )
        duration = coerce_float(row.get("durationSeconds") or row.get("duration") or row.get("windowDurationSeconds"))
        label = str(row.get("label") or row.get("title") or row.get("kind") or row.get("name") or f"review item {index}")
        notes = str(row.get("notes") or row.get("note") or "").strip()
        severity = "repair" if decision in REPAIR_DECISIONS else "proof" if decision in PROOF_DECISIONS else "pass" if decision in PASS_DECISIONS else "undecided"
        items.append(
            ReviewItem(
                source_schema=schema,
                source_path=packet_path,
                item_id=str(row.get("id") or row.get("markerId") or f"{schema}-{index}"),
                label=label,
                decision=decision,
                timecode=item_timecode(row),
                sequence_start_seconds=start_seconds,
                duration_seconds=duration,
                notes=notes,
                severity=severity,
            )
        )
    return items


def validate_notes_packet(path: Path, baseline_id: str) -> tuple[dict[str, Any] | None, dict[str, Any] | None]:
    try:
        packet = read_json(path)
    except Exception as exc:  # noqa: BLE001 - report bad notes instead of crashing all planning.
        return None, {"path": str(path), "reason": f"not readable JSON: {exc}"}
    schema = packet.get("schema")
    if schema not in ACCEPTED_NOTE_SCHEMAS:
        return None, {"path": str(path), "reason": f"unsupported schema: {schema}"}
    if packet.get("baselineId") != baseline_id:
        return None, {"path": str(path), "reason": f"wrong baselineId: {packet.get('baselineId')} != {baseline_id}"}
    if not packet.get("exportedAt"):
        return None, {"path": str(path), "reason": "notes packet has no exportedAt"}
    return packet, None


def action_for_item(item: ReviewItem) -> dict[str, Any]:
    if item.severity == "repair":
        action_type = "v007-proof-window-repair"
        first_move = "Record failed-human-listen with this item as an issue, then render a timestamped proof-window candidate before any full-length rerender."
        treatment = [
            "Locate the item in raw aligned stems, conformed master, and source-activity report.",
            "Tune the smallest relevant stage: speaker gate release/threshold, bleed ducking depth, denoise/restoration intensity, or crossfade smoothing.",
            "Render proof-window variants only: current v006, conservative repair, stronger repair.",
            "Promote to a new full candidate only if the proof-window comparison sounds more natural without reintroducing distracting bleed or park noise.",
        ]
    elif item.severity == "proof":
        action_type = "focused-proof-needed"
        first_move = "Create or open proof-window evidence for this item before recording approval or failure."
        treatment = [
            "Generate a focused proof snippet around the sequence time if one does not already exist.",
            "Compare raw/source-aware/conformed versions and record a pass or needs-repair decision.",
            "Do not unlock branch inheritance from a proof request alone.",
        ]
    else:
        action_type = "no-repair-action"
        first_move = "No repair action requested for this item."
        treatment = ["Keep as review context only."]
    return {
        "actionType": action_type,
        "sourceSchema": item.source_schema,
        "sourceNotesPacket": str(item.source_path),
        "itemId": item.item_id,
        "label": item.label,
        "decision": item.decision,
        "severity": item.severity,
        "timecode": item.timecode,
        "sequenceStartSeconds": item.sequence_start_seconds,
        "durationSeconds": item.duration_seconds,
        "reviewerNotes": item.notes,
        "firstMove": first_move,
        "safeTreatmentPath": treatment,
        "doNotDo": [
            "Do not overwrite v006.",
            "Do not mutate source media.",
            "Do not shift timeline length or sync offsets unless creating a new explicit sync/conform version.",
            "Do not unlock branch inheritance until a real human pass is recorded after repair/proof.",
        ],
    }


def issue_args(actions: list[dict[str, Any]]) -> list[str]:
    issues: list[str] = []
    for action in actions:
        if action["actionType"] not in {"v007-proof-window-repair", "focused-proof-needed"}:
            continue
        issues.append(
            f"{action['timecode']}: {action['label']}: {action['decision']}: {action.get('reviewerNotes') or 'no notes'}"
        )
    return issues


def command_lines_for_failure(baseline_dir: Path, actions: list[dict[str, Any]], reviewer: str) -> list[str]:
    lines = [
        "OUT=" + shell_quote(str(baseline_dir)),
        "python3 apps/QuipslyStudio/script/audio_workbench_record_listen_decision.py \\",
        '  --baseline-dir "$OUT" \\',
        "  --status failed-human-listen \\",
        "  --reviewer " + shell_quote(reviewer) + " \\",
        "  --notes " + shell_quote("Human listen notes require a v007/timestamped repair or focused proof before branch inheritance.") + " \\",
    ]
    for issue in issue_args(actions):
        lines.append("  --issue " + shell_quote(issue) + " \\")
    lines.append("  --confirm-human-listened")
    return lines


def command_lines_for_refresh(baseline_dir: Path) -> list[str]:
    return [
        "OUT=" + shell_quote(str(baseline_dir)),
        'python3 apps/QuipslyStudio/script/audio_workbench_bleed_repair_workorder.py --baseline-dir "$OUT"',
        'python3 apps/QuipslyStudio/script/audio_workbench_bleed_repair_preflight.py --baseline-dir "$OUT"',
        'python3 apps/QuipslyStudio/script/audio_workbench_post_listen_outcome_router.py --baseline-dir "$OUT"',
    ]


def command_block(lines: list[str]) -> list[str]:
    return ["```bash", *lines, "```"]


def render_markdown(report: dict[str, Any]) -> str:
    lines = [
        f"# Audio Listen Notes Repair Planner: {report['baselineId']}",
        "",
        f"Generated: `{report['generatedAt']}`",
        "",
        "This planner turns exported human listen notes into scoped repair/focused-proof actions. It does not approve audio, fail audio, render media, upload files, or mutate source media.",
        "",
        "## Current truth",
        "",
        f"- Approval status: `{report['approvalStatus']}`",
        f"- Branch inheritance ready: `{str(report['branchInheritanceReady']).lower()}`",
        f"- Branch render ready: `{str(report['branchRenderReady']).lower()}`",
        f"- Valid notes packets: `{report['validNotesPacketCount']}`",
        f"- Repair action count: `{report['repairActionCount']}`",
        f"- Focused proof action count: `{report['focusedProofActionCount']}`",
        f"- Pass/context item count: `{report['passOrContextItemCount']}`",
        "",
        "## Next safest action",
        "",
        report["nextSafestAction"],
        "",
    ]
    if report["validNotesPackets"]:
        lines.extend(["## Notes packets", ""])
        for packet in report["validNotesPackets"]:
            lines.append(f"- `{packet}`")
        lines.append("")
    if report["repairActions"]:
        lines.extend(["## Repair / proof actions", ""])
        for index, action in enumerate(report["repairActions"], start=1):
            lines.extend(
                [
                    f"### {index}. {action['label']}",
                    "",
                    f"- Type: `{action['actionType']}`",
                    f"- Decision: `{action['decision']}`",
                    f"- Time: `{action['timecode']}`",
                    f"- Sequence seconds: `{action['sequenceStartSeconds']}`",
                    f"- Reviewer notes: {action['reviewerNotes'] or '_none_'}",
                    f"- First move: {action['firstMove']}",
                    "",
                    "Safe treatment path:",
                    "",
                    *[f"- {step}" for step in action["safeTreatmentPath"]],
                    "",
                ]
            )
    else:
        lines.extend(
            [
                "## No repair actions yet",
                "",
                "No exported notes requiring repair or focused proof were found. Keep v006 locked and complete human listening.",
                "",
            ]
        )
    if report["ignoredNotesPackets"]:
        lines.extend(["## Ignored notes packets", "", "| Path | Reason |", "|---|---|"])
        for item in report["ignoredNotesPackets"]:
            lines.append(f"| `{item['path']}` | {item['reason']} |")
        lines.append("")
    if report["commands"]["recordFailure"]:
        lines.extend(
            [
                "## Guarded command if these notes are intended as failure evidence",
                "",
                *command_block(report["commands"]["recordFailure"]),
                "",
            ]
        )
    lines.extend(
        [
            "## Refresh supporting repair controls",
            "",
            *command_block(report["commands"]["refreshRepairControls"]),
            "",
            "## Guardrails",
            "",
            f"- Approval state changed: `{str(report['approvalStateChanged']).lower()}`",
            f"- Branch state changed: `{str(report['branchStateChanged']).lower()}`",
            f"- Render attempted: `{str(report['renderAttempted']).lower()}`",
            f"- Original media mutated: `{str(report['originalMediaMutated']).lower()}`",
            "",
        ]
    )
    return "\n".join(lines)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--baseline-dir", required=True, type=Path)
    parser.add_argument("--notes-packet", action="append", type=Path, default=[])
    parser.add_argument("--reviewer", default="Charlie or Mako")
    args = parser.parse_args()

    baseline_dir = resolve_baseline_dir(args.baseline_dir)
    manifest_path = baseline_dir / "manifest.json"
    manifest = read_json(manifest_path)
    baseline_id = str(manifest.get("baselineId") or "unknown-baseline")
    slug = safe_slug(baseline_id.replace("episode-4-conformed-production-baseline-", ""))
    generated_at = datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S")

    packet_paths = [path.expanduser().resolve() for path in args.notes_packet]
    if not packet_paths:
        packet_paths = default_notes_packets(manifest)

    ignored: list[dict[str, Any]] = []
    valid_packets: list[str] = []
    review_items: list[ReviewItem] = []
    for packet_path in packet_paths:
        packet, reason = validate_notes_packet(packet_path, baseline_id)
        if not packet:
            ignored.append(reason or {"path": str(packet_path), "reason": "unknown validation failure"})
            continue
        valid_packets.append(str(packet_path))
        review_items.extend(extract_review_items(packet_path, packet))

    repair_actions = [action_for_item(item) for item in review_items if item.severity in {"repair", "proof"}]
    repair_count = sum(1 for action in repair_actions if action["actionType"] == "v007-proof-window-repair")
    proof_count = sum(1 for action in repair_actions if action["actionType"] == "focused-proof-needed")
    pass_or_context_count = len([item for item in review_items if item.severity not in {"repair", "proof"}])

    if repair_count:
        next_action = "Record failed-human-listen with the exported notes as evidence, then render scoped proof-window repair candidates before any full rerender."
    elif proof_count:
        next_action = "Generate or open focused proof for the requested moments; keep branch inheritance locked until each is resolved."
    elif valid_packets:
        next_action = "No repair/proof items found in the selected notes. If every required item passed, use the guarded approval command from the notes inbox."
    else:
        next_action = "No valid exported notes found. Open the listen-priority console, export notes, run the inbox, then rerun this planner."

    commands = {
        "recordFailure": command_lines_for_failure(baseline_dir, repair_actions, args.reviewer) if repair_actions else [],
        "refreshRepairControls": command_lines_for_refresh(baseline_dir),
    }
    output_json = baseline_dir / f"audio-listen-notes-repair-planner-{slug}-{generated_at}.json"
    output_md = baseline_dir / f"audio-listen-notes-repair-planner-{slug}-{generated_at}.md"
    report = {
        "schema": "quipsly.audio-workbench.listen-notes-repair-planner.v1",
        "generatedAt": generated_at,
        "baselineDir": str(baseline_dir),
        "baselineId": baseline_id,
        "approvalStatus": manifest.get("approvalStatus"),
        "branchInheritanceReady": bool(manifest.get("branchInheritanceReady")),
        "branchRenderReady": bool(manifest.get("branchRenderReady")),
        "validNotesPacketCount": len(valid_packets),
        "validNotesPackets": valid_packets,
        "ignoredNotesPackets": ignored,
        "reviewItemCount": len(review_items),
        "repairActionCount": repair_count,
        "focusedProofActionCount": proof_count,
        "passOrContextItemCount": pass_or_context_count,
        "repairActions": repair_actions,
        "nextSafestAction": next_action,
        "commands": commands,
        "markdown": str(output_md),
        "approvalStateChanged": False,
        "branchStateChanged": False,
        "renderAttempted": False,
        "originalMediaMutated": False,
    }
    write_json(output_json, report)
    output_md.write_text(render_markdown(report) + "\n", encoding="utf-8")

    outputs = manifest.setdefault("outputs", {})
    outputs["latestAudioListenNotesRepairPlanner"] = str(output_json)
    outputs["latestAudioListenNotesRepairPlannerMarkdown"] = str(output_md)
    history = outputs.setdefault("audioListenNotesRepairPlanners", [])
    if str(output_json) not in history:
        history.append(str(output_json))
    manifest["audioListenNotesRepairPlannerCount"] = len(history)
    write_json(manifest_path, manifest)

    print(
        json.dumps(
            {
                "baselineId": baseline_id,
                "markdown": str(output_md),
                "json": str(output_json),
                "validNotesPacketCount": len(valid_packets),
                "repairActionCount": repair_count,
                "focusedProofActionCount": proof_count,
                "approvalStateChanged": False,
                "branchStateChanged": False,
                "renderAttempted": False,
                "originalMediaMutated": False,
            },
            indent=2,
            sort_keys=True,
        )
    )


if __name__ == "__main__":
    main()
