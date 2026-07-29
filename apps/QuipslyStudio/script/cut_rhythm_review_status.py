#!/usr/bin/env python3
"""Summarize recent Cut Rhythm review packet progress.

This is a read-only status board across packet ledgers. It answers:
which rhythm packets exist, how much has been reviewed, what still needs ears,
and where the next safest reviewer action lives.
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import Any

from cut_rhythm_packet_index import make_index
from cut_rhythm_review_summary import make_summary


def dict_value(value: Any) -> dict[str, Any]:
    return value if isinstance(value, dict) else {}


def list_value(value: Any) -> list[Any]:
    return value if isinstance(value, list) else []


def packet_status(entry: dict[str, Any]) -> dict[str, Any]:
    path = Path(str(entry.get("path", "")))
    summary = make_summary(path)
    finding_counts = dict_value(entry.get("findingCounts"))
    return {
        "name": entry.get("name", ""),
        "path": str(path),
        "decisionCount": entry.get("decisionCount", 0),
        "findingCounts": finding_counts,
        "queueCount": entry.get("queueCount", 0),
        "reviewedCount": summary.get("reviewedCount", 0),
        "unreviewedCount": summary.get("unreviewedCount", 0),
        "outcomeCounts": summary.get("outcomeCounts", {}),
        "recommendedStatusCounts": summary.get("recommendedStatusCounts", {}),
        "editChangeNeededCount": len(list_value(summary.get("editChangeNeeded"))),
        "needsHumanEarCount": len(list_value(summary.get("needsHumanEar"))),
        "firstFocus": summary.get("firstFocus", entry.get("firstFocus", "")),
        "safeCommands": {
            "workbench": "script/agentctl.sh cut-rhythm-review-workbench --markdown",
            "focusFirst": f"script/agentctl.sh cut-rhythm-focus-item {json.dumps(str(path))} 1 --markdown",
            "focusFirstAndScrub": f"script/agentctl.sh cut-rhythm-focus-item {json.dumps(str(path))} 1 --scrub --markdown",
            "summary": f"script/agentctl.sh cut-rhythm-review-summary {json.dumps(str(path))} --markdown",
            "promotionPlan": f"script/agentctl.sh cut-rhythm-review-promotion-plan {json.dumps(str(path))} --markdown",
        },
    }


def make_status(root: Path, limit: int) -> dict[str, Any]:
    index = make_index(root, limit=limit)
    entries = [entry for entry in list_value(index.get("entries")) if isinstance(entry, dict)]
    packets = [packet_status(entry) for entry in entries]
    totals = {
        "packetCount": len(packets),
        "reviewedCount": sum(int(packet.get("reviewedCount", 0)) for packet in packets),
        "unreviewedCount": sum(int(packet.get("unreviewedCount", 0)) for packet in packets),
        "editChangeNeededCount": sum(int(packet.get("editChangeNeededCount", 0)) for packet in packets),
        "needsHumanEarCount": sum(int(packet.get("needsHumanEarCount", 0)) for packet in packets),
    }
    if totals["editChangeNeededCount"]:
        first_focus = "Review edit-change-needed packet items and generate promotion plans only after matching decisions are selected."
    elif totals["needsHumanEarCount"]:
        first_focus = "Route needs-human-ear items to Charlie, Mako, or Homer before changing edit metadata."
    elif totals["unreviewedCount"]:
        first_focus = "Continue reviewing unreviewed rhythm queue items."
    elif packets:
        first_focus = "Recent rhythm packets are fully reviewed. Use summaries/promotion plans only for approved metadata moves."
    else:
        first_focus = "No rhythm packets found. Create one from the current Studio state."
    return {
        "status": "cut_rhythm_review_status",
        "root": str(root.expanduser()),
        "totals": totals,
        "firstFocus": first_focus,
        "packets": packets,
        "safeCommands": {
            "createPacket": "script/agentctl.sh cut-rhythm-review-packet",
            "workbench": "script/agentctl.sh cut-rhythm-review-workbench --markdown",
            "packetIndex": "script/agentctl.sh cut-rhythm-packet-index --markdown",
        },
        "truth": "Read-only rhythm review status. It does not edit, approve, export, publish, delete, or mutate source media.",
    }


def render_markdown(status: dict[str, Any]) -> str:
    totals = dict_value(status.get("totals"))
    packets = list_value(status.get("packets"))
    safe_commands = dict_value(status.get("safeCommands"))
    lines = [
        "# Cut Rhythm Review Status",
        "",
        f"- Status: `{status.get('status', '')}`",
        f"- Truth: {status.get('truth', '')}",
        f"- Root: `{status.get('root', '')}`",
        f"- Packets: {totals.get('packetCount', 0)}",
        f"- Reviewed items: {totals.get('reviewedCount', 0)}",
        f"- Unreviewed items: {totals.get('unreviewedCount', 0)}",
        f"- Needs human ear: {totals.get('needsHumanEarCount', 0)}",
        f"- Edit change needed: {totals.get('editChangeNeededCount', 0)}",
        f"- Start here: {status.get('firstFocus', '')}",
        "",
    ]
    if packets:
        lines.extend(["## Recent packets", ""])
    else:
        lines.extend(["## Recent packets", "", "- No packets found."])
    for index, packet in enumerate(packets, start=1):
        finding_counts = dict_value(packet.get("findingCounts"))
        lines.extend(
            [
                f"### {index}. {packet.get('name', '')}",
                "",
                f"- Path: `{packet.get('path', '')}`",
                f"- Findings: high={finding_counts.get('high', 0)}, medium={finding_counts.get('medium', 0)}, low={finding_counts.get('low', 0)}, total={finding_counts.get('total', 0)}",
                f"- Reviewed: {packet.get('reviewedCount', 0)}",
                f"- Unreviewed: {packet.get('unreviewedCount', 0)}",
                f"- Needs human ear: {packet.get('needsHumanEarCount', 0)}",
                f"- Edit change needed: {packet.get('editChangeNeededCount', 0)}",
                f"- First focus: {packet.get('firstFocus', '')}",
                "",
            ]
        )
    if safe_commands:
        lines.extend(["## Safe commands", ""])
        for key, command in safe_commands.items():
            lines.append(f"- `{key}`: `{command}`")
    return "\n".join(lines).rstrip() + "\n"


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Render rhythm review status across recent packets.")
    parser.add_argument("--root", default=str(Path.home() / "Movies/QuipslyExports/CutRhythmPackets"))
    parser.add_argument("--limit", type=int, default=8)
    parser.add_argument("--json", action="store_true")
    parser.add_argument("--markdown", action="store_true")
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    status = make_status(Path(args.root), limit=max(1, min(args.limit, 50)))
    if args.json and not args.markdown:
        print(json.dumps(status, indent=2, sort_keys=True))
    else:
        print(render_markdown(status))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
