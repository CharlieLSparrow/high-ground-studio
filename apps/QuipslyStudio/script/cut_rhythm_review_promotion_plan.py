#!/usr/bin/env python3
"""Create a read-only promotion plan from a filled rhythm review packet.

The summary tells reviewers what happened. This plan proposes the next metadata
commands after a human/agent has reviewed the findings. It does not execute the
commands because current decision status commands operate on the selected
decision inside Quipsly Studio; a reviewer must select the matching span first.
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import Any


STATUS_TO_COMMAND = {
    "listen": "decision-listen",
    "refine": "decision-refine",
    "keep": "decision-keep",
    "hold": "decision-hold",
}

OUTCOME_TO_DEFAULT_STATUS = {
    "real-problem": "refine",
    "deliberate-choice": "keep",
    "false-positive": "keep",
    "needs-human-ear": "listen",
    "needs-source-check": "listen",
    "needs-edit-change": "refine",
    "unreviewed": "",
}


def dict_value(value: Any) -> dict[str, Any]:
    return value if isinstance(value, dict) else {}


def string_value(value: Any, default: str = "") -> str:
    if value is None:
        return default
    if isinstance(value, str):
        return value
    return str(value)


def load_ledger(packet_dir: Path) -> list[dict[str, Any]]:
    ledger_path = packet_dir / "REVIEW_LEDGER_TEMPLATE.json"
    try:
        value = json.loads(ledger_path.read_text(encoding="utf-8"))
    except Exception as exc:  # noqa: BLE001 - operator-facing helper.
        return [
            {
                "findingId": "ledger-read-failed",
                "outcome": "hold",
                "recommendedStatus": "hold",
                "followUp": f"Could not read {ledger_path}: {exc}",
            }
        ]
    if not isinstance(value, list):
        return []
    return [item for item in value if isinstance(item, dict)]


def shell_quote(value: str) -> str:
    return "'" + value.replace("'", "'\"'\"'") + "'"


def plan_item(entry: dict[str, Any]) -> dict[str, Any] | None:
    outcome = string_value(entry.get("outcome"), "unreviewed").strip() or "unreviewed"
    if outcome == "unreviewed":
        return None
    reviewer = string_value(entry.get("reviewer"), "reviewer").strip() or "reviewer"
    finding_id = string_value(entry.get("findingId"), "unknown-finding").strip() or "unknown-finding"
    queue_item = dict_value(entry.get("queueItem"))
    title = string_value(queue_item.get("title"), finding_id)
    status = string_value(entry.get("recommendedStatus")).strip().lower()
    if status not in STATUS_TO_COMMAND:
        status = OUTCOME_TO_DEFAULT_STATUS.get(outcome, "")
    if status not in STATUS_TO_COMMAND:
        return {
            "findingId": finding_id,
            "title": title,
            "outcome": outcome,
            "action": "skip",
            "reason": "Reviewed entry has no safe recommended status.",
        }

    notes = []
    for key, label in (
        ("listenNotes", "listen"),
        ("visualNotes", "visual"),
        ("cadenceNotes", "cadence"),
        ("tradeoff", "tradeoff"),
        ("followUp", "follow-up"),
    ):
        text = string_value(entry.get(key)).strip()
        if text:
            notes.append(f"{label}: {text}")
    if not notes:
        notes.append(f"review outcome: {outcome}")
    note = f"{finding_id} {title} | " + " | ".join(notes)
    command = STATUS_TO_COMMAND[status]
    return {
        "findingId": finding_id,
        "title": title,
        "outcome": outcome,
        "recommendedStatus": status,
        "requiresSelection": True,
        "selectionInstruction": "Select the matching SHOW/SKIP decision span in Quipsly Studio before running this command.",
        "command": f"script/agentctl.sh {command} {shell_quote(reviewer)} {shell_quote(note)}",
        "noteCommand": f"script/agentctl.sh decision-intent-note {shell_quote(note)} {shell_quote(reviewer)} rhythm-review 0.7",
        "truth": "Proposal only. Do not run until the matching decision is selected and the reviewer approves.",
    }


def make_plan(packet_dir: Path) -> dict[str, Any]:
    ledger = load_ledger(packet_dir)
    items = []
    skipped = []
    for entry in ledger:
        item = plan_item(entry)
        if item is None:
            skipped.append(
                {
                    "findingId": entry.get("findingId", ""),
                    "reason": "unreviewed",
                }
            )
        elif item.get("action") == "skip":
            skipped.append(item)
        else:
            items.append(item)

    first_focus = (
        "Select the first matching decision in Quipsly Studio, then run the proposed command only if approved."
        if items
        else "No reviewed ledger entries produced safe proposed commands yet."
    )
    return {
        "status": "cut_rhythm_review_promotion_plan",
        "packetDir": str(packet_dir),
        "proposalCount": len(items),
        "skippedCount": len(skipped),
        "firstFocus": first_focus,
        "items": items,
        "skipped": skipped,
        "truth": "Read-only promotion plan. It proposes commands but does not edit, approve, export, publish, delete, or mutate source media.",
    }


def render_markdown(plan: dict[str, Any]) -> str:
    lines = [
        "# Cut Rhythm Review Promotion Plan",
        "",
        f"- Status: `{plan.get('status', '')}`",
        f"- Truth: {plan.get('truth', '')}",
        f"- Packet: `{plan.get('packetDir', '')}`",
        f"- Proposed commands: {plan.get('proposalCount', 0)}",
        f"- Skipped entries: {plan.get('skippedCount', 0)}",
        f"- Start here: {plan.get('firstFocus', '')}",
        "",
        "## Proposed commands",
        "",
    ]
    items = plan.get("items", [])
    if not isinstance(items, list) or not items:
        lines.append("- No safe proposed commands yet.")
    else:
        for index, item in enumerate(items, start=1):
            if not isinstance(item, dict):
                continue
            lines.extend(
                [
                    f"### {index}. {item.get('title', '')}",
                    "",
                    f"- Finding ID: `{item.get('findingId', '')}`",
                    f"- Outcome: `{item.get('outcome', '')}`",
                    f"- Recommended status: `{item.get('recommendedStatus', '')}`",
                    f"- Requires selection: `{item.get('requiresSelection', False)}`",
                    f"- Selection instruction: {item.get('selectionInstruction', '')}",
                    f"- Status command: `{item.get('command', '')}`",
                    f"- Note command: `{item.get('noteCommand', '')}`",
                    "",
                ]
            )
    skipped = plan.get("skipped", [])
    if isinstance(skipped, list) and skipped:
        lines.extend(["## Skipped", ""])
        for item in skipped:
            if isinstance(item, dict):
                lines.append(f"- `{item.get('findingId', '')}`: {item.get('reason', '')}")
    return "\n".join(lines).rstrip() + "\n"


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Create a read-only cut rhythm review promotion plan.")
    parser.add_argument("packet_dir")
    parser.add_argument("--json", action="store_true")
    parser.add_argument("--markdown", action="store_true")
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    plan = make_plan(Path(args.packet_dir).expanduser())
    if args.json and not args.markdown:
        print(json.dumps(plan, indent=2, sort_keys=True))
    else:
        print(render_markdown(plan))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
