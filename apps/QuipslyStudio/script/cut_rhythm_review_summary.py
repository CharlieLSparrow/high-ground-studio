#!/usr/bin/env python3
"""Summarize a filled Cut Rhythm Review Packet.

This is a read-only bridge from review notes to actionable clarity. It reads a
packet folder, especially REVIEW_LEDGER_TEMPLATE.json after a reviewer has
filled it in, and reports what is reviewed, what still needs ears, and what
could become future edit-decision revision notes.
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import Any


def dict_value(value: Any) -> dict[str, Any]:
    return value if isinstance(value, dict) else {}


def list_value(value: Any) -> list[Any]:
    return value if isinstance(value, list) else []


def string_value(value: Any, default: str = "") -> str:
    if value is None:
        return default
    if isinstance(value, str):
        return value
    return str(value)


def load_json(path: Path) -> Any:
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except Exception as exc:  # noqa: BLE001 - operator-facing helper.
        return {
            "status": "read_failed",
            "path": str(path),
            "error": str(exc),
        }


def ledger_entries(packet_dir: Path) -> list[dict[str, Any]]:
    ledger_path = packet_dir / "REVIEW_LEDGER_TEMPLATE.json"
    value = load_json(ledger_path)
    if isinstance(value, list):
        return [item for item in value if isinstance(item, dict)]
    return []


def make_summary(packet_dir: Path) -> dict[str, Any]:
    entries = ledger_entries(packet_dir)
    outcome_counts: dict[str, int] = {}
    status_counts: dict[str, int] = {}
    edit_change_needed = []
    needs_human_ear = []
    reviewed = []
    unreviewed = []

    for entry in entries:
        outcome = string_value(entry.get("outcome"), "unreviewed").strip() or "unreviewed"
        status = string_value(entry.get("recommendedStatus")).strip() or "unset"
        outcome_counts[outcome] = outcome_counts.get(outcome, 0) + 1
        status_counts[status] = status_counts.get(status, 0) + 1

        compact = {
            "findingId": entry.get("findingId", ""),
            "outcome": outcome,
            "recommendedStatus": status,
            "editChangeNeeded": bool(entry.get("editChangeNeeded")),
            "listenNotes": entry.get("listenNotes", ""),
            "visualNotes": entry.get("visualNotes", ""),
            "cadenceNotes": entry.get("cadenceNotes", ""),
            "tradeoff": entry.get("tradeoff", ""),
            "followUp": entry.get("followUp", ""),
            "queueTitle": dict_value(entry.get("queueItem")).get("title", ""),
            "queueKind": dict_value(entry.get("queueItem")).get("kind", ""),
            "queueSeverity": dict_value(entry.get("queueItem")).get("severity", ""),
        }

        if outcome == "unreviewed":
            unreviewed.append(compact)
        else:
            reviewed.append(compact)
        if outcome == "needs-human-ear":
            needs_human_ear.append(compact)
        if bool(entry.get("editChangeNeeded")) or outcome == "needs-edit-change":
            edit_change_needed.append(compact)

    if edit_change_needed:
        first_focus = "Review edit-change-needed items and convert accepted changes into explicit metadata/revision notes."
    elif needs_human_ear:
        first_focus = "Route needs-human-ear items to a person before changing the cut."
    elif unreviewed:
        first_focus = "Continue the review queue; unreviewed rhythm items remain."
    elif reviewed:
        first_focus = "All ledger items are reviewed. Promote only the items with clear Keep/Refine/Hold intent."
    else:
        first_focus = "No review ledger entries found. Use the packet queue or regenerate the packet."

    return {
        "status": "cut_rhythm_review_summary",
        "packetDir": str(packet_dir),
        "entryCount": len(entries),
        "reviewedCount": len(reviewed),
        "unreviewedCount": len(unreviewed),
        "outcomeCounts": outcome_counts,
        "recommendedStatusCounts": status_counts,
        "editChangeNeeded": edit_change_needed,
        "needsHumanEar": needs_human_ear,
        "firstFocus": first_focus,
        "safeNextCommands": {
            "openWorkOrder": f"open {json.dumps(str(packet_dir / 'AGENT_WORK_ORDER.md'))}",
            "openQueue": f"open {json.dumps(str(packet_dir / 'queue.md'))}",
            "openLedger": f"open {json.dumps(str(packet_dir / 'REVIEW_LEDGER_TEMPLATE.json'))}",
        },
        "truth": "Read-only packet summary. It does not edit, approve, export, publish, delete, or mutate source media.",
    }


def render_markdown(summary: dict[str, Any]) -> str:
    outcome_counts = dict_value(summary.get("outcomeCounts"))
    status_counts = dict_value(summary.get("recommendedStatusCounts"))
    edit_change_needed = list_value(summary.get("editChangeNeeded"))
    needs_human_ear = list_value(summary.get("needsHumanEar"))
    safe_commands = dict_value(summary.get("safeNextCommands"))

    lines = [
        "# Cut Rhythm Review Summary",
        "",
        f"- Status: `{summary.get('status', '')}`",
        f"- Truth: {summary.get('truth', '')}",
        f"- Packet: `{summary.get('packetDir', '')}`",
        f"- Entries: {summary.get('entryCount', 0)}",
        f"- Reviewed: {summary.get('reviewedCount', 0)}",
        f"- Unreviewed: {summary.get('unreviewedCount', 0)}",
        f"- Outcomes: {', '.join(f'{key}={value}' for key, value in sorted(outcome_counts.items())) or 'none'}",
        f"- Recommended statuses: {', '.join(f'{key}={value}' for key, value in sorted(status_counts.items())) or 'none'}",
        f"- Start here: {summary.get('firstFocus', '')}",
        "",
    ]

    if edit_change_needed:
        lines.extend(["## Edit changes to consider", ""])
        for item in edit_change_needed:
            if not isinstance(item, dict):
                continue
            lines.extend(
                [
                    f"### {item.get('findingId', '')}: {item.get('queueTitle', '')}",
                    "",
                    f"- Outcome: `{item.get('outcome', '')}`",
                    f"- Recommended status: `{item.get('recommendedStatus', '')}`",
                    f"- Tradeoff: {item.get('tradeoff', '')}",
                    f"- Follow-up: {item.get('followUp', '')}",
                    "",
                ]
            )

    if needs_human_ear:
        lines.extend(["## Needs human ear", ""])
        for item in needs_human_ear:
            if not isinstance(item, dict):
                continue
            lines.append(f"- `{item.get('findingId', '')}` {item.get('queueTitle', '')}: {item.get('followUp', '')}")

    if safe_commands:
        lines.extend(["", "## Safe next commands", ""])
        for key, command in safe_commands.items():
            lines.append(f"- `{key}`: `{command}`")

    return "\n".join(lines).rstrip() + "\n"


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Summarize a filled cut rhythm review packet.")
    parser.add_argument("packet_dir")
    parser.add_argument("--json", action="store_true")
    parser.add_argument("--markdown", action="store_true")
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    summary = make_summary(Path(args.packet_dir).expanduser())
    if args.json and not args.markdown:
        print(json.dumps(summary, indent=2, sort_keys=True))
    else:
        print(render_markdown(summary))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
