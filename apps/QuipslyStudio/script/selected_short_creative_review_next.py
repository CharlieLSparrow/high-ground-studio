#!/usr/bin/env python3
"""Choose the next saved selected-short creative review packet to inspect.

Saved packets are review artifacts, not rendered export proof or publication
receipts. This helper reads the saved packet index and turns it into one calm
next action for a human or agent reviewer.
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from typing import Any


SCRIPT_DIR = Path(__file__).resolve().parent
if str(SCRIPT_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPT_DIR))

from selected_short_creative_review_packet_index import (  # noqa: E402
    DEFAULT_ROOT,
    build_index,
    n,
    s,
)


WEAK_READINESS = {
    "",
    "unknown",
    "risk-heavy",
    "needs-review",
    "needs review",
    "needs-human-review",
    "needs-human-review-before-posting",
    "needs-hook",
    "needs-caption",
    "needs-framing",
    "not-ready",
}


def lower(value: Any) -> str:
    return s(value).lower()


def needs_hook(packet: dict[str, Any]) -> bool:
    hook = lower(packet.get("hook"))
    return not hook or hook.startswith("no explicit hook") or hook.startswith("no hook")


def needs_caption(packet: dict[str, Any]) -> bool:
    caption = lower(packet.get("captionDraft"))
    return not caption or caption.startswith("no caption") or caption.startswith("no text")


def is_empty_diagnostic_packet(packet: dict[str, Any]) -> bool:
    title = lower(packet.get("title"))
    return (
        (not title or title.startswith("untitled") or title.startswith("no selected"))
        and n(packet.get("duration")) <= 0
        and needs_hook(packet)
        and needs_caption(packet)
    )


def score_packet(packet: dict[str, Any]) -> tuple[int, list[str]]:
    score = 0
    reasons: list[str] = []

    readiness = lower(packet.get("readiness")) or "unknown"
    if readiness in WEAK_READINESS:
        score += 40
        reasons.append(f"readiness is `{readiness}`")
    elif readiness in {"reviewable-candidate", "candidate", "ready-for-human-review"}:
        score += 12
        reasons.append(f"readiness is `{readiness}`, so it still deserves human eyes")
    elif readiness in {"ready", "kept", "approved"}:
        score -= 20

    duration = n(packet.get("duration"))
    if duration <= 0:
        score += 35
        reasons.append("duration is missing or zero")
    elif duration < 7:
        score += 18
        reasons.append(f"duration is very short at {duration:.1f}s")
    elif duration > 75:
        score += 10
        reasons.append(f"duration is long for most short-form platforms at {duration:.1f}s")

    if needs_hook(packet):
        score += 30
        reasons.append("hook needs review")

    if needs_caption(packet):
        score += 24
        reasons.append("caption or text overlay needs review")

    risk_count = int(n(packet.get("riskCount")))
    if risk_count:
        score += min(20, risk_count * 4)
        reasons.append(f"{risk_count} creative risk item(s) were recorded")

    next_action_count = int(n(packet.get("nextActionCount")))
    if next_action_count:
        score += min(12, next_action_count * 2)
        reasons.append(f"{next_action_count} next action(s) are already attached")

    if not reasons:
        reasons.append("newest packet is the safest review candidate")

    return score, reasons


def choose_next(index: dict[str, Any]) -> dict[str, Any] | None:
    packets = index.get("packets") or []
    if not packets:
        return None
    usable_packets = [packet for packet in packets if not is_empty_diagnostic_packet(packet)]
    if usable_packets:
        packets = usable_packets
    ranked = []
    for packet in packets:
        score, reasons = score_packet(packet)
        ranked.append((score, n(packet.get("modifiedAt")), packet, reasons))
    ranked.sort(key=lambda item: (item[0], item[1]), reverse=True)
    _, _, packet, reasons = ranked[0]
    return {
        "packet": packet,
        "priorityReasons": reasons,
        "score": ranked[0][0],
    }


def build_next_action(root: Path, limit: int) -> dict[str, Any]:
    index = build_index(root, max(1, limit))
    selection = choose_next(index)

    if selection is None:
        return {
            "status": "selected_short_creative_review_next",
            "model": "quipslystudio-selected-short-creative-review-next",
            "root": index.get("root"),
            "count": 0,
            "nextPacket": None,
            "priorityReasons": ["No saved selected-short creative review packets were found."],
            "reviewChecklist": [
                "Save the currently selected short creative packet.",
                "Re-run the index so the queue has artifacts to sort.",
                "Remember that packets are metadata review aids, not rendered export proof.",
            ],
            "safeCommands": {
                "savePacket": "script/agentctl.sh selected-short-creative-review-packet-save",
                "indexPackets": "script/agentctl.sh selected-short-creative-review-packet-index",
                "currentPacket": "script/agentctl.sh selected-short-creative-review-packet",
            },
            "truth": "Read-only queue recommendation. No app state, source media, exports, or publication receipts were changed.",
        }

    packet = selection["packet"]
    checklist = [
        "Watch the first three seconds and confirm the hook promises a specific payoff.",
        "Check whether the caption/text overlay helps without covering faces or the emotional center.",
        "Scrub the source moment against the exported/reviewable cut before treating this as platform-ready.",
        "If the pacing feels too clean or robotic, preserve human cadence instead of compressing every pause.",
        "If the short is strong, mark the review decision in the editor or save a newer packet after refinement.",
    ]
    if needs_hook(packet):
        checklist.insert(0, "Draft or sharpen the first-line hook before any platform handoff.")
    if needs_caption(packet):
        checklist.insert(1, "Draft a caption or on-screen text note with face-safe 9:16 placement.")

    return {
        "status": "selected_short_creative_review_next",
        "model": "quipslystudio-selected-short-creative-review-next",
        "root": index.get("root"),
        "count": index.get("count"),
        "readinessCounts": index.get("readinessCounts"),
        "nextPacket": packet,
        "priorityScore": selection["score"],
        "priorityReasons": selection["priorityReasons"],
        "reviewChecklist": checklist,
        "safeCommands": {
            "openIndex": "script/agentctl.sh selected-short-creative-review-packet-index",
            "saveCurrentPacket": "script/agentctl.sh selected-short-creative-review-packet-save",
            "currentPacket": "script/agentctl.sh selected-short-creative-review-packet",
        },
        "truth": "Read-only queue recommendation over saved metadata packets. This does not prove a rendered export, approve publication, or mutate source media.",
    }


def render_markdown(payload: dict[str, Any]) -> str:
    lines = [
        "# Next Selected Short Creative Review",
        "",
        s(payload.get("truth")) or "Read-only queue recommendation.",
        "",
        f"Root: `{s(payload.get('root'))}`",
        f"Packets indexed: {int(n(payload.get('count')))}",
    ]

    packet = payload.get("nextPacket")
    if not isinstance(packet, dict):
        lines.extend(
            [
                "",
                "## Next packet",
                "No saved packets found yet.",
                "",
                "## What to do now",
            ]
        )
    else:
        lines.extend(
            [
                "",
                "## Next packet",
                f"- Title: {s(packet.get('title')) or s(packet.get('fileName'))}",
                f"- File: `{s(packet.get('fileName'))}`",
                f"- Path: `{s(packet.get('path'))}`",
                f"- Readiness: `{s(packet.get('readiness')) or 'unknown'}`",
                f"- Duration: {n(packet.get('duration')):.1f}s",
                f"- Hook: {s(packet.get('hook')) or 'No hook recorded.'}",
                f"- Caption/text: {s(packet.get('captionDraft')) or 'No caption recorded.'}",
                "",
                "## Why this one",
            ]
        )
        for reason in payload.get("priorityReasons") or []:
            lines.append(f"- {s(reason)}")
        lines.append("")
        lines.append("## What to do now")

    for item in payload.get("reviewChecklist") or []:
        lines.append(f"- {s(item)}")

    lines.extend(
        [
            "",
            "## Safe commands",
        ]
    )
    commands = payload.get("safeCommands") or {}
    for label, command in commands.items():
        lines.append(f"- {label}: `{command}`")

    return "\n".join(lines).rstrip() + "\n"


def main() -> int:
    parser = argparse.ArgumentParser(description="Pick the next selected-short creative review packet.")
    parser.add_argument("root", nargs="?", default=str(DEFAULT_ROOT))
    parser.add_argument("--limit", type=int, default=50)
    parser.add_argument("--json", action="store_true")
    parser.add_argument("--markdown", action="store_true")
    args = parser.parse_args()

    payload = build_next_action(Path(args.root), args.limit)
    if args.json:
        print(json.dumps(payload, indent=2, sort_keys=True))
    else:
        print(render_markdown(payload), end="")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
