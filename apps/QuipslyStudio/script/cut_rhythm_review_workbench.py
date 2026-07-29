#!/usr/bin/env python3
"""Read-only workbench for Cut Rhythm review.

The packet index finds folders. Start-here focuses one item. The summary and
promotion plan help after review. This workbench puts the current state and the
next safe commands in one place so reviewers do not need to remember the whole
ritual.
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import Any

from cut_rhythm_focus_item import make_focus
from cut_rhythm_packet_index import make_index
from cut_rhythm_review_summary import make_summary


def dict_value(value: Any) -> dict[str, Any]:
    return value if isinstance(value, dict) else {}


def list_value(value: Any) -> list[Any]:
    return value if isinstance(value, list) else []


def latest_entry(index: dict[str, Any]) -> dict[str, Any]:
    entries = list_value(index.get("entries"))
    return dict_value(entries[0]) if entries else {}


def make_workbench(root: Path, base_url: str, selector: str, scrub: bool, pre_roll: float) -> dict[str, Any]:
    index = make_index(root, limit=5)
    latest = latest_entry(index)
    if not latest:
        return {
            "status": "cut_rhythm_review_workbench",
            "root": str(root.expanduser()),
            "packetAvailable": False,
            "nextSafeAction": "Create a packet from the current Studio state.",
            "safeCommands": {
                "createPacket": "script/agentctl.sh cut-rhythm-review-packet",
                "audit": "script/agentctl.sh cut-rhythm-audit --markdown",
                "queue": "script/agentctl.sh cut-rhythm-review-queue high 10 --markdown",
            },
            "truth": "Read-only workbench. It does not edit, approve, export, publish, delete, or mutate source media.",
        }

    packet_dir = str(latest.get("path", ""))
    focus = make_focus(
        packet_dir=Path(packet_dir),
        selector=selector,
        base_url=base_url,
        should_scrub=scrub,
        pre_roll=pre_roll,
    )
    summary = make_summary(Path(packet_dir))
    return {
        "status": "cut_rhythm_review_workbench",
        "root": str(root.expanduser()),
        "packetAvailable": True,
        "latestPacket": latest,
        "focus": focus,
        "summary": summary,
        "nextSafeAction": summary.get("firstFocus", "Open the focused queue item and listen at normal speed."),
        "safeCommands": {
            "startHere": "script/agentctl.sh cut-rhythm-start-here --markdown",
            "startHereAndScrub": "script/agentctl.sh cut-rhythm-start-here --scrub --markdown",
            "focusFirst": f"script/agentctl.sh cut-rhythm-focus-item {json.dumps(packet_dir)} {json.dumps(selector)} --markdown",
            "focusFirstAndScrub": f"script/agentctl.sh cut-rhythm-focus-item {json.dumps(packet_dir)} {json.dumps(selector)} --scrub --markdown",
            "recordReview": "Use a cut-rhythm-record-review command from the focused item after listening.",
            "summary": f"script/agentctl.sh cut-rhythm-review-summary {json.dumps(packet_dir)} --markdown",
            "promotionPlan": f"script/agentctl.sh cut-rhythm-review-promotion-plan {json.dumps(packet_dir)} --markdown",
            "packetIndex": "script/agentctl.sh cut-rhythm-packet-index --markdown",
        },
        "truth": "Read-only workbench. It may navigate with --scrub, but it does not edit, approve, export, publish, delete, or mutate source media.",
    }


def render_markdown(workbench: dict[str, Any]) -> str:
    commands = dict_value(workbench.get("safeCommands"))
    lines = [
        "# Cut Rhythm Review Workbench",
        "",
        f"- Status: `{workbench.get('status', '')}`",
        f"- Truth: {workbench.get('truth', '')}",
        f"- Root: `{workbench.get('root', '')}`",
        f"- Packet available: `{workbench.get('packetAvailable', False)}`",
        f"- Next safe action: {workbench.get('nextSafeAction', '')}",
        "",
    ]
    if not workbench.get("packetAvailable"):
        lines.extend(["## No packet yet", ""])
    else:
        latest = dict_value(workbench.get("latestPacket"))
        focus = dict_value(workbench.get("focus"))
        focus_item = dict_value(focus.get("item"))
        summary = dict_value(workbench.get("summary"))
        lines.extend(
            [
                "## Latest packet",
                "",
                f"- Name: {latest.get('name', '')}",
                f"- Path: `{latest.get('path', '')}`",
                f"- Queue count: {latest.get('queueCount', 0)}",
                "",
                "## Current focus",
                "",
                f"- Finding ID: `{focus_item.get('id', '')}`",
                f"- Title: {focus_item.get('title', '')}",
                f"- Severity: `{focus_item.get('severity', '')}`",
                f"- Review mode: `{focus_item.get('reviewMode', '')}`",
                f"- First action: {focus_item.get('firstAction', '')}",
                f"- Scrubbed: `{focus.get('scrubbed', False)}`",
                "",
                "## Review state",
                "",
                f"- Ledger entries: {summary.get('entryCount', 0)}",
                f"- Reviewed: {summary.get('reviewedCount', 0)}",
                f"- Unreviewed: {summary.get('unreviewedCount', 0)}",
            ]
        )
    if commands:
        lines.extend(["", "## Safe commands", ""])
        for key, command in commands.items():
            lines.append(f"- `{key}`: `{command}`")
    return "\n".join(lines).rstrip() + "\n"


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Render a read-only cut rhythm review workbench.")
    parser.add_argument("--root", default=str(Path.home() / "Movies/QuipslyExports/CutRhythmPackets"))
    parser.add_argument("--base-url", default="http://127.0.0.1:8080")
    parser.add_argument("--selector", default="1")
    parser.add_argument("--scrub", action="store_true")
    parser.add_argument("--pre-roll", type=float, default=2.0)
    parser.add_argument("--json", action="store_true")
    parser.add_argument("--markdown", action="store_true")
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    workbench = make_workbench(
        root=Path(args.root),
        base_url=args.base_url,
        selector=args.selector,
        scrub=args.scrub,
        pre_roll=max(0.0, args.pre_roll),
    )
    if args.json and not args.markdown:
        print(json.dumps(workbench, indent=2, sort_keys=True))
    else:
        print(render_markdown(workbench))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
