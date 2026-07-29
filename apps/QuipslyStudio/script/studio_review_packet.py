#!/usr/bin/env python3
"""Create one read-only Quipsly Studio review packet.

The packet combines the current review conductor, selected decision workbench,
and selected short workbench into one timestamped folder. It is meant for
Charlie, Mako, Homer, and Codex to review the same evidence without changing
media, edit decisions, exports, or publication state.
"""

from __future__ import annotations

import argparse
import json
import os
import sys
from datetime import datetime
from pathlib import Path
from typing import Any

from decision_review_workbench import build_workbench as build_decision_workbench
from decision_review_workbench import render_markdown as render_decision_markdown
from shorts_review_workbench import build_workbench as build_shorts_workbench
from shorts_review_workbench import render_markdown as render_shorts_markdown
from studio_review_conductor import build_workbench as build_conductor_workbench
from studio_review_conductor import render_markdown as render_conductor_markdown


DEFAULT_BASE_URL = os.environ.get("QUIPSLY_STUDIO_AGENT_URL", "http://127.0.0.1:8765")


def dict_value(value: Any) -> dict[str, Any]:
    return value if isinstance(value, dict) else {}


def text_value(value: Any, fallback: str = "") -> str:
    if value is None:
        return fallback
    text = str(value).strip()
    return text if text else fallback


def safe_slug(raw: str, fallback: str = "studio-review") -> str:
    slug = "".join(char.lower() if char.isalnum() else "-" for char in raw).strip("-")
    slug = "-".join(part for part in slug.split("-") if part)[:90]
    return slug or fallback


def build_packet(base_url: str) -> dict[str, Any]:
    conductor = build_conductor_workbench(base_url)
    decision = build_decision_workbench(base_url)
    shorts = build_shorts_workbench(base_url)
    focus = dict_value(conductor.get("recommendedFocus"))
    selected_decision = dict_value(decision.get("selectedDecision"))
    selected_short = dict_value(shorts.get("selectedShort"))
    warnings = []
    for payload in [conductor, decision, shorts]:
        warnings.extend(payload.get("endpointWarnings") if isinstance(payload.get("endpointWarnings"), list) else [])

    return {
        "model": "quipsly-studio-review-packet",
        "generatedAt": datetime.now().isoformat(timespec="seconds"),
        "baseUrl": base_url,
        "recommendedFocus": focus,
        "selectedDecisionSummary": {
            "laneName": text_value(selected_decision.get("laneName")),
            "tagType": text_value(selected_decision.get("tagType")),
            "intentStatus": text_value(selected_decision.get("intentStatus")),
            "risk": text_value(selected_decision.get("risk")),
            "cutStyle": text_value(selected_decision.get("cutStyle")),
            "nextReviewAction": text_value(decision.get("nextReviewAction")),
        },
        "selectedShortSummary": {
            "title": text_value(selected_short.get("title")),
            "hook": text_value(selected_short.get("hook")),
            "reviewStatus": text_value(selected_short.get("reviewStatus")),
            "qualityScore": dict_value(shorts.get("quality")).get("score", 0),
            "nextAction": text_value(shorts.get("nextAction")),
        },
        "endpointWarnings": warnings,
        "truth": "Read-only packet. It does not export, publish, approve, mutate source media, or change edit decisions.",
        "packetFiles": [
            "README.md",
            "studio-review-conductor.md",
            "studio-review-conductor.json",
            "decision-review-workbench.md",
            "decision-review-workbench.json",
            "shorts-review-workbench.md",
            "shorts-review-workbench.json",
            "AGENT_NEXT_ACTION.md",
        ],
        "_payloads": {
            "conductor": conductor,
            "decision": decision,
            "shorts": shorts,
        },
    }


def render_agent_next_action(packet: dict[str, Any]) -> str:
    focus = dict_value(packet.get("recommendedFocus"))
    decision = dict_value(packet.get("selectedDecisionSummary"))
    short = dict_value(packet.get("selectedShortSummary"))
    lines = [
        "# Agent next action",
        "",
        "This packet is evidence, not permission. Do not publish, export over old files, mutate originals, or approve an edit just because this packet exists.",
        "",
        "## Start here",
        f"- Focus lane: `{focus.get('lane', '')}`",
        f"- Focus: {focus.get('label', '')}",
        f"- Reason: {focus.get('reason', '')}",
        f"- First action: {focus.get('firstAction', '')}",
        "",
        "## Selected decision snapshot",
        f"- Lane: {decision.get('laneName', '') or 'none'}",
        f"- Type/style: `{decision.get('tagType', '')}` / `{decision.get('cutStyle', '')}`",
        f"- Intent: `{decision.get('intentStatus', '')}`",
        f"- Risk: `{decision.get('risk', '')}`",
        f"- Next: {decision.get('nextReviewAction', '')}",
        "",
        "## Selected short snapshot",
        f"- Title: {short.get('title', '') or 'none'}",
        f"- Hook: {short.get('hook', '') or 'missing'}",
        f"- Review: `{short.get('reviewStatus', '')}`",
        f"- Score: {short.get('qualityScore', 0)}",
        f"- Next: {short.get('nextAction', '')}",
        "",
        "## Safe loop",
        "1. Read `studio-review-conductor.md` for the current focus.",
        "2. If focus is a cut, read `decision-review-workbench.md` and listen at normal speed before status changes.",
        "3. If focus is a short, read `shorts-review-workbench.md` and verify hook -> turn -> payoff before export or posting prep.",
        "4. Record notes as metadata or packet notes; keep whole source media untouched.",
        "5. If the packet is stale, create a new packet instead of editing this one into fake freshness.",
        "",
    ]
    warnings = packet.get("endpointWarnings") if isinstance(packet.get("endpointWarnings"), list) else []
    if warnings:
        lines.extend(["## Endpoint warnings", ""])
        lines.extend(f"- {warning}" for warning in warnings)
        lines.append("")
    return "\n".join(lines).strip() + "\n"


def render_readme(packet: dict[str, Any]) -> str:
    focus = dict_value(packet.get("recommendedFocus"))
    return "\n".join([
        "# Quipsly Studio review packet",
        "",
        f"Generated: `{packet.get('generatedAt', '')}`",
        f"Base URL: `{packet.get('baseUrl', '')}`",
        "",
        "## Recommended focus",
        f"- Lane: `{focus.get('lane', '')}`",
        f"- Label: {focus.get('label', '')}",
        f"- Reason: {focus.get('reason', '')}",
        f"- First action: {focus.get('firstAction', '')}",
        "",
        "## Files",
        "- `studio-review-conductor.md`: top-level what-next brief.",
        "- `decision-review-workbench.md`: selected SHOW/SKIP decision evidence.",
        "- `shorts-review-workbench.md`: selected short quality evidence.",
        "- `AGENT_NEXT_ACTION.md`: safe operating loop for Codex/agents.",
        "",
        "Truth: read-only review evidence. This packet does not prove publication readiness, export success, approval, or source-media mutation.",
        "",
    ]).strip() + "\n"


def write_packet(packet: dict[str, Any], output_root: str | None) -> Path:
    payloads = dict_value(packet.pop("_payloads", {}))
    conductor = dict_value(payloads.get("conductor"))
    decision = dict_value(payloads.get("decision"))
    shorts = dict_value(payloads.get("shorts"))
    focus = dict_value(packet.get("recommendedFocus"))
    root = Path(output_root or "~/Movies/QuipslyExports/StudioReviewPackets").expanduser()
    root.mkdir(parents=True, exist_ok=True)
    stamp = datetime.now().strftime("%Y%m%d-%H%M%S")
    folder = root / f"{stamp}-{safe_slug(text_value(focus.get('lane'), 'review-packet'))}"
    folder.mkdir(parents=True, exist_ok=False)

    (folder / "README.md").write_text(render_readme(packet), encoding="utf-8")
    (folder / "AGENT_NEXT_ACTION.md").write_text(render_agent_next_action(packet), encoding="utf-8")
    (folder / "studio-review-packet.json").write_text(json.dumps(packet, indent=2, sort_keys=True), encoding="utf-8")
    (folder / "studio-review-conductor.json").write_text(json.dumps(conductor, indent=2, sort_keys=True), encoding="utf-8")
    (folder / "studio-review-conductor.md").write_text(render_conductor_markdown(conductor), encoding="utf-8")
    (folder / "decision-review-workbench.json").write_text(json.dumps(decision, indent=2, sort_keys=True), encoding="utf-8")
    (folder / "decision-review-workbench.md").write_text(render_decision_markdown(decision), encoding="utf-8")
    (folder / "shorts-review-workbench.json").write_text(json.dumps(shorts, indent=2, sort_keys=True), encoding="utf-8")
    (folder / "shorts-review-workbench.md").write_text(render_shorts_markdown(shorts), encoding="utf-8")
    return folder


def main() -> int:
    parser = argparse.ArgumentParser(description="Create a read-only Quipsly Studio review packet.")
    parser.add_argument("--base-url", default=DEFAULT_BASE_URL)
    parser.add_argument("--output-root", default=None)
    parser.add_argument("--json", action="store_true", help="Print packet JSON summary instead of the folder path.")
    args = parser.parse_args()

    packet = build_packet(args.base_url)
    folder = write_packet(packet, args.output_root)
    if args.json:
        packet["savedTo"] = str(folder)
        print(json.dumps(packet, indent=2, sort_keys=True))
    else:
        print(f"Saved Studio review packet: {folder}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
