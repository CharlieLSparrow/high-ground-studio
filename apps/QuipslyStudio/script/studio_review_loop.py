#!/usr/bin/env python3
"""Create a Studio review packet and print the next safe review loop.

This is the "start work here" command for humans and agents. It creates a fresh
read-only packet, then points to the most relevant workbench/recorder commands
without applying metadata, exporting, publishing, or mutating source media.
"""

from __future__ import annotations

import argparse
import json
import os
import sys
from pathlib import Path
from typing import Any

from studio_review_packet import build_packet, write_packet


DEFAULT_BASE_URL = os.environ.get("QUIPSLY_STUDIO_AGENT_URL", "http://127.0.0.1:8765")


def dict_value(value: Any) -> dict[str, Any]:
    return value if isinstance(value, dict) else {}


def text_value(value: Any, fallback: str = "") -> str:
    if value is None:
        return fallback
    text = str(value).strip()
    return text if text else fallback


def recommended_commands(focus_lane: str) -> list[dict[str, str]]:
    if focus_lane == "cut-rhythm":
        return [
            {
                "label": "Open the packet's next-action note",
                "command": "open AGENT_NEXT_ACTION.md",
                "purpose": "Read the packet-local focus and first action.",
            },
            {
                "label": "Run rhythm focus",
                "command": "/Users/wall-e/Dev/high-ground-studio/apps/QuipslyStudio/script/agentctl.sh cut-rhythm-start-here --markdown",
                "purpose": "Find the first risky rhythm finding and listen at normal speed.",
            },
            {
                "label": "Record decision review after listening",
                "command": "/Users/wall-e/Dev/high-ground-studio/apps/QuipslyStudio/script/decision-record-review needs-listen \"normal-speed rhythm review needed\"",
                "purpose": "Dry-run the metadata note/status before applying.",
            },
        ]
    if focus_lane == "selected-decision":
        return [
            {
                "label": "Inspect selected decision",
                "command": "/Users/wall-e/Dev/high-ground-studio/apps/QuipslyStudio/script/decision-review-workbench",
                "purpose": "Review why, tradeoff, rhythm note, evidence, and next action.",
            },
            {
                "label": "Record refine/listen/keep metadata",
                "command": "/Users/wall-e/Dev/high-ground-studio/apps/QuipslyStudio/script/decision-record-review refine \"describe what felt off\"",
                "purpose": "Dry-run a selected-decision review note before applying.",
            },
        ]
    if focus_lane == "selected-short":
        return [
            {
                "label": "Inspect selected short",
                "command": "/Users/wall-e/Dev/high-ground-studio/apps/QuipslyStudio/script/shorts-review-workbench",
                "purpose": "Review hook, turn, payoff, captions, crop, platform fit, and Cut Intelligence overlap.",
            },
            {
                "label": "Record short refine/prep action",
                "command": "/Users/wall-e/Dev/high-ground-studio/apps/QuipslyStudio/script/shorts-record-review needs-refine --note \"describe hook, bridge, crop, or payoff issue\"",
                "purpose": "Dry-run a selected-short review/prep action before applying.",
            },
        ]
    return [
        {
            "label": "Run conductor again after app focus changes",
            "command": "/Users/wall-e/Dev/high-ground-studio/apps/QuipslyStudio/script/studio-review-conductor",
            "purpose": "Refresh the safest next focus after selecting a cut or short.",
        },
        {
            "label": "Create another packet after meaningful changes",
            "command": "/Users/wall-e/Dev/high-ground-studio/apps/QuipslyStudio/script/studio-review-packet",
            "purpose": "Capture fresh review evidence instead of editing old packets into fake freshness.",
        },
    ]


def render_markdown(packet: dict[str, Any], folder: Path) -> str:
    focus = dict_value(packet.get("recommendedFocus"))
    focus_lane = text_value(focus.get("lane"), "unknown")
    lines = [
        "# Quipsly Studio review loop",
        "",
        f"- Packet: `{folder}`",
        f"- Focus lane: `{focus_lane}`",
        f"- Focus: {text_value(focus.get('label'), 'unknown')}",
        f"- Reason: {text_value(focus.get('reason'), 'No reason reported.')}",
        f"- First action: {text_value(focus.get('firstAction'), 'Open AGENT_NEXT_ACTION.md.')}",
        "",
        "## Open first",
        "",
        f"`{folder / 'AGENT_NEXT_ACTION.md'}`",
        "",
        "## Suggested commands",
        "",
    ]
    for item in recommended_commands(focus_lane):
        lines.extend([
            f"### {item['label']}",
            "",
            f"Purpose: {item['purpose']}",
            "",
            f"```bash\n{item['command']}\n```",
            "",
        ])
    lines.extend([
        "## Safety",
        "",
        "- This loop creates review evidence only.",
        "- Recorder commands are dry-run until `--apply` is explicitly added.",
        "- Do not publish, export over old files, move clips, or mutate source media from this loop.",
        "- Create a new packet after meaningful app state changes.",
        "",
    ])
    return "\n".join(lines).strip() + "\n"


def main() -> int:
    parser = argparse.ArgumentParser(description="Create a fresh Studio review packet and print the next safe review loop.")
    parser.add_argument("--base-url", default=DEFAULT_BASE_URL)
    parser.add_argument("--output-root", default=None)
    parser.add_argument("--json", action="store_true")
    args = parser.parse_args()

    packet = build_packet(args.base_url)
    folder = write_packet(packet, args.output_root)
    focus = dict_value(packet.get("recommendedFocus"))
    payload = {
        "model": "quipsly-studio-review-loop",
        "packet": str(folder),
        "recommendedFocus": focus,
        "openFirst": str(folder / "AGENT_NEXT_ACTION.md"),
        "suggestedCommands": recommended_commands(text_value(focus.get("lane"), "unknown")),
        "truth": "Review loop evidence only. It does not apply metadata, export, publish, move clips, or mutate source media.",
    }
    if args.json:
        print(json.dumps(payload, indent=2, sort_keys=True))
    else:
        print(render_markdown(packet, folder))
    return 0


if __name__ == "__main__":
    sys.exit(main())
