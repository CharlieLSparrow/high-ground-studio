#!/usr/bin/env python3
"""Open the safest first step for Cut Rhythm review.

This helper finds the latest Cut Rhythm packet and focuses the first queue item.
With --scrub it moves the shared playhead near that item. It does not edit,
approve, export, publish, delete, or mutate source media.
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import Any

from cut_rhythm_focus_item import make_focus, render_markdown as render_focus_markdown
from cut_rhythm_packet_index import make_index


def dict_value(value: Any) -> dict[str, Any]:
    return value if isinstance(value, dict) else {}


def list_value(value: Any) -> list[Any]:
    return value if isinstance(value, list) else []


def latest_packet(root: Path) -> str:
    index = make_index(root, limit=1)
    entries = list_value(index.get("entries"))
    if not entries:
        return ""
    first = dict_value(entries[0])
    return str(first.get("path", ""))


def make_start_here(root: Path, base_url: str, selector: str, should_scrub: bool, pre_roll: float) -> dict[str, Any]:
    packet = latest_packet(root)
    if not packet:
        return {
            "status": "cut_rhythm_start_here_no_packets",
            "root": str(root.expanduser()),
            "nextAction": "Run script/agentctl.sh cut-rhythm-review-packet after loading a Studio session.",
            "truth": "No edit, export, publish, delete, or source-media mutation occurred.",
        }
    focus = make_focus(
        packet_dir=Path(packet),
        selector=selector,
        base_url=base_url,
        should_scrub=should_scrub,
        pre_roll=pre_roll,
    )
    return {
        "status": "cut_rhythm_start_here",
        "root": str(root.expanduser()),
        "packetDir": packet,
        "selector": selector,
        "focus": focus,
        "safeNext": {
            "openWorkOrder": f"open {json.dumps(str(Path(packet) / 'AGENT_WORK_ORDER.md'))}",
            "recordReview": "Use one of the focus output's cut-rhythm-record-review commands after listening.",
            "summarizeAfterReview": f"script/agentctl.sh cut-rhythm-review-summary {json.dumps(packet)} --markdown",
            "promotionPlanAfterReview": f"script/agentctl.sh cut-rhythm-review-promotion-plan {json.dumps(packet)} --markdown",
        },
        "truth": "Read-only start-here helper. It may navigate with --scrub, but it does not edit, approve, export, publish, delete, or mutate source media.",
    }


def render_markdown(start: dict[str, Any]) -> str:
    if start.get("status") != "cut_rhythm_start_here":
        return "\n".join(
            [
                "# Cut Rhythm Start Here",
                "",
                f"- Status: `{start.get('status', '')}`",
                f"- Truth: {start.get('truth', '')}",
                f"- Root: `{start.get('root', '')}`",
                f"- Next action: {start.get('nextAction', '')}",
            ]
        ).rstrip() + "\n"

    focus = dict_value(start.get("focus"))
    safe_next = dict_value(start.get("safeNext"))
    lines = [
        "# Cut Rhythm Start Here",
        "",
        f"- Status: `{start.get('status', '')}`",
        f"- Truth: {start.get('truth', '')}",
        f"- Latest packet: `{start.get('packetDir', '')}`",
        f"- Selector: `{start.get('selector', '')}`",
        "",
        "## Focused item",
        "",
        render_focus_markdown(focus).rstrip(),
        "",
        "## After listening",
        "",
    ]
    for key, value in safe_next.items():
        lines.append(f"- `{key}`: {value}")
    return "\n".join(lines).rstrip() + "\n"


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Find latest rhythm packet and focus the first queue item.")
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
    start = make_start_here(
        root=Path(args.root),
        base_url=args.base_url,
        selector=args.selector,
        should_scrub=args.scrub,
        pre_roll=max(0.0, args.pre_roll),
    )
    if args.json and not args.markdown:
        print(json.dumps(start, indent=2, sort_keys=True))
    else:
        print(render_markdown(start))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
