#!/usr/bin/env python3
"""Create a non-mutating proof-watch decision template for a short recipe repair.

This sits between transcript alignment evidence and recipe mutation. It gives a
human or Codex editor a place to record what was actually seen/heard in the
running Studio monitor wall before any short recipe metadata is repaired.
"""
from __future__ import annotations

import argparse
import json
import re
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

DEFAULT_NEXT_PACKET = Path("docs/quipsly/current-state/episode-1-shorts-recipe-repair-next.md")
DEFAULT_JSON = Path("docs/quipsly/current-state/episode-1-shorts-recipe-repair-decision-template.json")
DEFAULT_MARKDOWN = Path("docs/quipsly/current-state/episode-1-shorts-recipe-repair-decision-template.md")


def clean(value: str) -> str:
    return value.replace("`", "").strip()


def line_value(text: str, prefix: str) -> str:
    for raw_line in text.splitlines():
        line = raw_line.strip()
        if line.startswith(prefix):
            return clean(line[len(prefix):])
    return ""


def section_bullets(text: str, heading: str) -> list[str]:
    lines = text.splitlines()
    try:
        start = next(index for index, line in enumerate(lines) if line.strip() == heading)
    except StopIteration:
        return []

    bullets: list[str] = []
    for line in lines[start + 1:]:
        stripped = line.strip()
        if stripped.startswith("## "):
            break
        if stripped.startswith("- "):
            bullets.append(clean(stripped[2:]))
    return bullets


def range_value(text: str, prefix: str) -> dict[str, float | str]:
    value = line_value(text, prefix)
    match = re.search(r"([0-9]+(?:\.[0-9]+)?)\s*->\s*([0-9]+(?:\.[0-9]+)?)", value)
    if not match:
        return {"start": 0.0, "end": 0.0, "duration": 0.0, "label": value}
    start = float(match.group(1))
    end = float(match.group(2))
    return {
        "start": start,
        "end": end,
        "duration": max(0.0, end - start),
        "label": f"{start:.3f}s -> {end:.3f}s",
    }


def command_dictionary(text: str) -> dict[str, str]:
    commands: dict[str, str] = {}
    for bullet in section_bullets(text, "## Safe commands"):
        if ":" not in bullet:
            continue
        key, value = bullet.split(":", 1)
        commands[clean(key)] = clean(value)
    return commands


def packet_to_template(source_path: Path) -> dict[str, Any]:
    text = source_path.read_text()
    current = range_value(text, "- Current range:")
    candidate = range_value(text, "- Candidate range:")
    allowed_outcomes = section_bullets(text, "## Allowed outcomes")
    return {
        "model": "quipsly-shorts-recipe-repair-proof-watch-decision-template",
        "version": "2026-07-04.v1",
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "sourcePath": str(source_path),
        "truth": "Decision template only. It records proof-watch intent and does not mutate sessions, short recipes, exports, source media, uploads, approvals, publications, or receipts.",
        "short": {
            "sequence": line_value(text, "- Sequence:"),
            "shortId": line_value(text, "- Short:"),
            "rank": line_value(text, "- Rank:"),
            "title": line_value(text, "- Title:"),
            "status": line_value(text, "- Status:"),
            "diagnosis": line_value(text, "- Diagnosis:"),
            "scoreImprovement": line_value(text, "- Score improvement:"),
            "globalOffset": line_value(text, "- Global offset:"),
        },
        "ranges": {
            "current": current,
            "candidate": candidate,
        },
        "alignment": {
            "current": line_value(text, "- Current alignment:"),
            "candidate": line_value(text, "- Candidate alignment:"),
        },
        "storyPreview": {
            "hook": line_value(text, "- Hook:"),
            "turn": line_value(text, "- Turn:"),
            "payoff": line_value(text, "- Payoff:"),
            "caption": line_value(text, "- Caption:"),
            "overlay": line_value(text, "- Overlay:"),
        },
        "risks": section_bullets(text, "## Risks"),
        "watchPlan": section_bullets(text, "## Watch plan"),
        "allowedOutcomes": allowed_outcomes,
        "safeCommands": command_dictionary(text),
        "decision": {
            "selectedOutcome": "hold-for-human-review",
            "allowedOutcomes": allowed_outcomes,
            "reviewer": "",
            "reviewedAt": "",
            "currentRangeContains": "",
            "candidateRangeContains": "",
            "chosenRange": "",
            "cadenceNotes": "",
            "framingNotes": "",
            "captionNotes": "",
            "humanFeelingRisk": "",
            "nextAction": "Proof-watch current and candidate ranges in Studio before applying any recipe metadata repair.",
            "applyMutationAllowed": False,
        },
    }


def markdown(payload: dict[str, Any]) -> str:
    short = payload["short"]
    ranges = payload["ranges"]
    story = payload["storyPreview"]
    decision = payload["decision"]
    commands = payload["safeCommands"]

    outcomes = "\n".join(f"- [ ] `{outcome}`" for outcome in payload["allowedOutcomes"])
    watch_plan = "\n".join(f"- {item}" for item in payload["watchPlan"])
    risks = "\n".join(f"- {item}" for item in payload["risks"])
    command_lines = "\n".join(f"- {key}: `{value}`" for key, value in sorted(commands.items()))

    return f"""# Shorts recipe repair decision template

- Sequence: {short.get("sequence", "")}
- Short: `{short.get("shortId", "")}`
- Title: {short.get("title", "")}
- Status: `{short.get("status", "")}`
- Diagnosis: `{short.get("diagnosis", "")}`
- Truth: {payload["truth"]}

## Proof-watch ranges

- Current: `{ranges["current"].get("label", "")}`  
  Alignment: {payload["alignment"].get("current", "")}
- Candidate: `{ranges["candidate"].get("label", "")}`  
  Alignment: {payload["alignment"].get("candidate", "")}

## Candidate story preview

- Hook: {story.get("hook", "")}
- Turn: {story.get("turn", "")}
- Payoff: {story.get("payoff", "")}
- Caption: {story.get("caption", "")}
- Overlay: {story.get("overlay", "")}

## Watch plan

{watch_plan or "- Watch current and candidate ranges in Studio."}

## Risks

{risks or "- No packet-specific risks recorded."}

## Decision checklist

{outcomes or "- [ ] `hold-for-human-review`"}

## Reviewer notes

- Reviewer: `{decision["reviewer"]}`
- Reviewed at: `{decision["reviewedAt"]}`
- Current range contains:
- Candidate range contains:
- Chosen range:
- Cadence notes:
- Framing notes:
- Caption notes:
- Human-feeling risk:
- Next action: {decision["nextAction"]}
- Apply mutation allowed: `{decision["applyMutationAllowed"]}`

## Safe commands

{command_lines or f"- regenerate: `{DEFAULT_NEXT_PACKET}`"}

## How to use this

1. Open Quipsly Studio and switch to the Shorts workbench.
2. Use the Proof-watch repair card to jump to Current and Candidate.
3. Watch/listen through the shared monitor wall and decision timeline.
4. Fill this template or copy it into a review note.
5. Only after a human/Codex proof-watch decision should a separate recipe-repair mutation be proposed.
"""


def main() -> int:
    parser = argparse.ArgumentParser(description="Generate a non-mutating shorts recipe repair proof-watch decision template.")
    parser.add_argument("--source", default=str(DEFAULT_NEXT_PACKET), help="Path to the shorts recipe repair next markdown packet.")
    parser.add_argument("--json", action="store_true", help="Print JSON payload to stdout.")
    parser.add_argument("--markdown", action="store_true", help="Print Markdown template to stdout.")
    parser.add_argument("--save-json", default="", help=f"Write JSON payload. Default with --save is {DEFAULT_JSON}.")
    parser.add_argument("--save-markdown", default="", help=f"Write Markdown payload. Default with --save is {DEFAULT_MARKDOWN}.")
    parser.add_argument("--save", action="store_true", help="Save both JSON and Markdown to current-state defaults.")
    args = parser.parse_args()

    source_path = Path(args.source).expanduser()
    if not source_path.exists():
        raise SystemExit(f"Missing source packet: {source_path}")

    payload = packet_to_template(source_path)
    markdown_text = markdown(payload)

    if args.save or args.save_json:
        json_path = Path(args.save_json or DEFAULT_JSON)
        json_path.parent.mkdir(parents=True, exist_ok=True)
        json_path.write_text(json.dumps(payload, indent=2, sort_keys=True) + "\n")

    if args.save or args.save_markdown:
        markdown_path = Path(args.save_markdown or DEFAULT_MARKDOWN)
        markdown_path.parent.mkdir(parents=True, exist_ok=True)
        markdown_path.write_text(markdown_text)

    if args.json:
        print(json.dumps(payload, indent=2, sort_keys=True))
    elif args.markdown or not args.save:
        print(markdown_text)

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
