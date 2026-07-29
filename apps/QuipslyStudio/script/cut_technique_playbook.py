#!/usr/bin/env python3
"""Export Quipsly Studio's Cut Technique playbook for agents/reviewers.

The source of truth is the Swift `CutTechniqueGuidance.defaultPlaybook()`
definition in `Sources/QuipslyVideoCore/CutIntelligence.swift`. This script
extracts that playbook without launching the app and prints JSON or Markdown.
It is read-only: no media, sessions, exports, or timeline metadata are touched.
"""

from __future__ import annotations

import argparse
import json
import re
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parents[1]
SWIFT_SOURCE = ROOT / "Sources" / "QuipslyVideoCore" / "CutIntelligence.swift"


FIELD_NAMES = [
    "id",
    "title",
    "bestUse",
    "avoidWhen",
    "audioMove",
    "visualMove",
    "reviewQuestion",
    "agentRule",
]


def _swift_string_arg(block: str, name: str) -> str:
    pattern = rf"{re.escape(name)}:\s*\"((?:[^\"\\]|\\.)*)\""
    match = re.search(pattern, block, flags=re.DOTALL)
    if not match:
        return ""
    return bytes(match.group(1), "utf-8").decode("unicode_escape")


def extract_playbook(source: str) -> list[dict[str, str]]:
    start = source.find("public static func defaultPlaybook()")
    if start < 0:
        raise SystemExit("Could not find CutTechniqueGuidance.defaultPlaybook()")

    snippet = source[start:]
    blocks = re.findall(
        r"CutTechniqueGuidance\(\s*(.*?)\s*\)",
        snippet,
        flags=re.DOTALL,
    )
    if not blocks:
        raise SystemExit("Could not extract any CutTechniqueGuidance entries")

    entries: list[dict[str, str]] = []
    for block in blocks:
        entry = {name: _swift_string_arg(block, name) for name in FIELD_NAMES}
        if entry["id"] and entry["title"]:
            entry["truth"] = (
                "Craft guidance only. It explains metadata decisions; it does not "
                "mutate media, timing, exports, publication state, or source files."
            )
            entries.append(entry)

    if not entries:
        raise SystemExit("No usable technique guidance entries found")
    return entries


def playbook_payload(entries: list[dict[str, str]]) -> dict[str, Any]:
    return {
        "model": "quipsly-cut-technique-playbook",
        "source": str(SWIFT_SOURCE),
        "count": len(entries),
        "techniques": entries,
        "useFor": [
            "explaining why a cut recipe exists",
            "reviewing J-cut/L-cut/reaction/context/quiet-gap tradeoffs",
            "keeping human and agent editing vocabulary aligned",
            "avoiding over-cleaned robotic podcast pacing",
        ],
        "safeCommands": {
            "json": "script/agentctl.sh cut-technique-playbook",
            "markdown": "script/agentctl.sh cut-technique-playbook --markdown",
        },
        "truth": (
            "Read-only craft playbook extracted from the current Cut Intelligence "
            "source. It is not an edit, export, publication receipt, approval, or apply path."
        ),
    }


def render_markdown(payload: dict[str, Any]) -> str:
    lines = [
        "# Quipsly Cut Technique Playbook",
        "",
        payload["truth"],
        "",
        f"Source: `{payload['source']}`",
        f"Technique count: {payload['count']}",
        "",
    ]
    for technique in payload["techniques"]:
        lines.extend(
            [
                f"## {technique['title']}",
                "",
                f"- `id`: `{technique['id']}`",
                f"- `best use`: {technique['bestUse']}",
                f"- `avoid when`: {technique['avoidWhen']}",
                f"- `audio move`: {technique['audioMove']}",
                f"- `visual move`: {technique['visualMove']}",
                f"- `review question`: {technique['reviewQuestion']}",
                f"- `agent rule`: {technique['agentRule']}",
                "",
            ]
        )
    return "\n".join(lines)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--markdown", action="store_true", help="Print Markdown instead of JSON.")
    args = parser.parse_args()

    entries = extract_playbook(SWIFT_SOURCE.read_text())
    payload = playbook_payload(entries)
    if args.markdown:
        print(render_markdown(payload))
    else:
        print(json.dumps(payload, indent=2, sort_keys=True))


if __name__ == "__main__":
    main()
