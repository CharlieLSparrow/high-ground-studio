#!/usr/bin/env python3
"""Create a reviewer-ready packet from the live shorts quality board.

The quality board answers "what is true across the queue?" This packet answers
"what should a human/agent reviewer do next?" It is local sidecar evidence only:
no selection change, edit, export, approval, upload, publication, receipt, or
source-media mutation.
"""
from __future__ import annotations

import argparse
import json
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

SCRIPT_DIR = Path(__file__).resolve().parent
sys.path.insert(0, str(SCRIPT_DIR))

from shorts_queue_quality_board import DEFAULT_BASE_URL, build_board, slug  # noqa: E402


DEFAULT_OUTPUT_ROOT = Path("/Volumes/My Passport/Quipsly/QuipslyExports/ShortsReviewQueuePackets")
SCHEMA = "quipsly.studio.shorts-review-queue-packet.v1"


def iso_now() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat()


def stamp() -> str:
    return datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")


def compact_item(item: dict[str, Any]) -> dict[str, Any]:
    commands = item.get("safeCommands") if isinstance(item.get("safeCommands"), dict) else {}
    return {
        "index": item.get("index"),
        "id": item.get("id"),
        "title": item.get("title"),
        "durationSeconds": item.get("durationSeconds"),
        "hook": item.get("hook"),
        "captionOrOverlay": item.get("captionOrOverlay"),
        "score": item.get("score"),
        "class": item.get("class"),
        "reviewStatus": item.get("reviewStatus"),
        "exportProofReady": item.get("exportProofReady"),
        "transcriptStatus": item.get("transcriptStatus"),
        "transcript": item.get("transcript") if isinstance(item.get("transcript"), dict) else {},
        "segmentCount": item.get("segmentCount"),
        "platformVariantCount": item.get("platformVariantCount"),
        "cutRiskCount": item.get("cutRiskCount"),
        "blockers": item.get("blockers") if isinstance(item.get("blockers"), list) else [],
        "nextSafeAction": item.get("nextSafeAction"),
        "selectWithProof": commands.get("selectWithProof"),
        "selectedBrief": commands.get("selectedBrief"),
        "selectedPlatformPacket": commands.get("selectedPlatformPacket"),
    }


def classify_lanes(items: list[dict[str, Any]], per_lane: int) -> dict[str, list[dict[str, Any]]]:
    watch_first: list[dict[str, Any]] = []
    refine_next: list[dict[str, Any]] = []
    needs_export: list[dict[str, Any]] = []
    hold: list[dict[str, Any]] = []

    for item in items:
        item_class = str(item.get("class") or "")
        blockers = item.get("blockers") if isinstance(item.get("blockers"), list) else []
        if not item.get("exportProofReady") or item_class == "needs-export-proof":
            needs_export.append(compact_item(item))
        elif item_class == "strong-review-candidate" and not blockers:
            watch_first.append(compact_item(item))
        elif "rejected" in item_class:
            hold.append(compact_item(item))
        else:
            refine_next.append(compact_item(item))

    return {
        "watchFirst": watch_first[:per_lane],
        "refineNext": refine_next[:per_lane],
        "needsExportProof": needs_export[:per_lane],
        "holdOrReject": hold[:per_lane],
    }


def packet_from_board(board: dict[str, Any], per_lane: int) -> dict[str, Any]:
    items = board.get("topItems") if isinstance(board.get("topItems"), list) else []
    lanes = classify_lanes([row for row in items if isinstance(row, dict)], per_lane)
    first_watch = lanes["watchFirst"][0] if lanes["watchFirst"] else None
    if first_watch:
        next_safe_action = f"Watch '{first_watch['title']}' once as a viewer, then mark Keep, Refine, or Reject."
    elif lanes["refineNext"]:
        first_refine = lanes["refineNext"][0]
        next_safe_action = f"Refine '{first_refine['title']}': {first_refine['nextSafeAction']}"
    elif lanes["needsExportProof"]:
        first_export = lanes["needsExportProof"][0]
        next_safe_action = f"Create or locate export proof for '{first_export['title']}' before review."
    else:
        next_safe_action = "No queued shorts were available in the live quality board."

    return {
        "schema": SCHEMA,
        "status": "shorts_review_queue_packet",
        "generatedAt": iso_now(),
        "activeSessionName": board.get("activeSessionName"),
        "sourceBoardStatus": board.get("status"),
        "sourceSummary": board.get("summary"),
        "reviewLaneCounts": {key: len(value) for key, value in lanes.items()},
        "reviewLanes": lanes,
        "nextSafeAction": next_safe_action,
        "reviewInstructions": [
            "Watch candidates at normal speed before marking Keep.",
            "Use scrub/selection only to diagnose a problem after a viewer-speed pass.",
            "Treat export proof, human review, and publication receipts as separate states.",
            "If a short feels machine-clean or emotionally false, mark Refine and name the cadence issue.",
            "Do not publish from this packet; it is review routing only.",
        ],
        "safeCommands": {
            "qualityBoard": "script/agentctl.sh shorts-queue-quality-board --markdown",
            "saveQualityBoard": "script/agentctl.sh shorts-queue-quality-board --save --markdown",
            "reviewQueuePacket": "script/agentctl.sh shorts-review-queue-packet --save --markdown",
            "platformPacketBatch": "script/agentctl.sh shorts-platform-packet-batch --limit 5",
        },
        "truth": (
            "Local reviewer packet derived from the live shorts quality board. It does not select shorts, edit recipes, "
            "export, approve, upload, publish, create receipts, or mutate source media."
        ),
    }


def markdown(packet: dict[str, Any]) -> str:
    lines = [
        "# Shorts Review Queue Packet",
        "",
        f"- Session: `{packet.get('activeSessionName') or 'unknown'}`",
        f"- Next safest action: {packet['nextSafeAction']}",
        "",
        "## Review instructions",
        "",
    ]
    for instruction in packet["reviewInstructions"]:
        lines.append(f"- {instruction}")

    lane_labels = {
        "watchFirst": "Watch first",
        "refineNext": "Refine next",
        "needsExportProof": "Needs export proof",
        "holdOrReject": "Hold or rejected",
    }
    for lane_key, label in lane_labels.items():
        lines.extend(["", f"## {label}", ""])
        lane = packet["reviewLanes"].get(lane_key, [])
        if not lane:
            lines.append("- None in this packet.")
            continue
        for item in lane:
            blockers = "; ".join(item.get("blockers") or []) or "none reported"
            lines.extend([
                f"### {item.get('index')}. {item.get('title')}",
                "",
                f"- Score: `{item.get('score')}`",
                f"- Duration: `{item.get('durationSeconds')}s`",
            f"- Class: `{item.get('class')}`",
            f"- Review: `{item.get('reviewStatus') or 'unknown'}`",
            f"- Export proof: `{item.get('exportProofReady')}`",
            f"- Hook: {item.get('hook') or 'missing'}",
            f"- Caption/overlay: {item.get('captionOrOverlay') or 'missing'}",
            f"- Transcript: `{item.get('transcriptStatus')}` / speakers `{item.get('transcript', {}).get('speakers') or 'unknown'}` / segments `{item.get('transcript', {}).get('segmentCount') or 0}`",
            f"- Transcript excerpt: {item.get('transcript', {}).get('excerpt') or 'missing'}",
            f"- Blockers: {blockers}",
            f"- Next: {item.get('nextSafeAction')}",
            f"- Select with proof: `{item.get('selectWithProof')}`",
                "",
            ])

    lines.extend(["## Safe commands", ""])
    for label, command in packet["safeCommands"].items():
        lines.append(f"- `{label}`: `{command}`")
    if packet.get("artifact"):
        lines.extend([
            "",
            "## Saved artifact",
            "",
            f"- JSON: `{packet['artifact']['jsonPath']}`",
            f"- Markdown: `{packet['artifact']['markdownPath']}`",
        ])
    lines.extend(["", f"Truth: {packet['truth']}"])
    return "\n".join(lines)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--base-url", default=DEFAULT_BASE_URL)
    parser.add_argument("--output-root", type=Path, default=DEFAULT_OUTPUT_ROOT)
    parser.add_argument("--limit", type=int, default=20, help="How many quality-board items to inspect.")
    parser.add_argument("--per-lane", type=int, default=5, help="Maximum items per review lane.")
    parser.add_argument("--save", action="store_true")
    parser.add_argument("--json", action="store_true")
    parser.add_argument("--markdown", action="store_true")
    args = parser.parse_args()

    board_args = argparse.Namespace(
        base_url=args.base_url,
        output_root=args.output_root,
        limit=args.limit,
        save=False,
    )
    board = build_board(board_args)
    packet = packet_from_board(board, max(1, args.per_lane))
    if args.save:
        folder = args.output_root / slug(str(packet.get("activeSessionName") or "unknown-session")) / f"{stamp()}-shorts-review-queue-packet"
        folder.mkdir(parents=True, exist_ok=False)
        json_path = folder / "shorts-review-queue-packet.json"
        markdown_path = folder / "shorts-review-queue-packet.md"
        json_path.write_text(json.dumps(packet, indent=2, sort_keys=True) + "\n", encoding="utf-8")
        markdown_path.write_text(markdown(packet) + "\n", encoding="utf-8")
        packet["artifact"] = {"jsonPath": str(json_path), "markdownPath": str(markdown_path)}

    if args.markdown and not args.json:
        print(markdown(packet))
    else:
        print(json.dumps(packet, indent=2, sort_keys=True))


if __name__ == "__main__":
    main()
