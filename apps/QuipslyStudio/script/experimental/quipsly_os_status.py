#!/usr/bin/env python3
"""Print the latest Quipsly OS board status.

This is an operator convenience layer over the generated board. It does not
generate new artifacts, approve work, publish, upload, delete, or mutate source
files.
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import Any


DEFAULT_POINTER = Path("/Volumes/My Passport/Quipsly Media Workspace/QuipslyOS/latest-quipsly-os-board.json")


def load_json(path: Path) -> dict[str, Any]:
    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
        return payload if isinstance(payload, dict) else {}
    except Exception:
        return {}


def build_summary(pointer_path: Path, limit: int) -> dict[str, Any]:
    pointer = load_json(pointer_path)
    board_path = Path(str(pointer.get("jsonPath") or ""))
    board = load_json(board_path) if board_path else {}
    lanes = board.get("lanes") if isinstance(board.get("lanes"), list) else []
    queue = board.get("priorityQueue") if isinstance(board.get("priorityQueue"), list) else []
    return {
        "ok": bool(pointer and board),
        "pointerPath": str(pointer_path),
        "htmlPath": pointer.get("htmlPath") or "",
        "markdownPath": pointer.get("markdownPath") or "",
        "jsonPath": pointer.get("jsonPath") or "",
        "generatedAt": board.get("generatedAt") or pointer.get("updatedAt") or "",
        "truth": board.get("truth") or "",
        "laneStatuses": [
            {
                "lane": lane.get("lane"),
                "status": lane.get("status"),
                "actionCards": len(lane.get("actionCards") or []),
                "nextSafestAction": lane.get("nextSafestAction"),
            }
            for lane in lanes
            if isinstance(lane, dict)
        ],
        "priorityQueue": queue[:limit],
        "priorityQueueCount": len(queue),
    }


def print_text(summary: dict[str, Any]) -> None:
    if not summary.get("ok"):
        print("Quipsly OS board is not available yet.")
        print(f"Pointer checked: {summary.get('pointerPath')}")
        return

    print("Quipsly OS latest board")
    print(f"Generated: {summary.get('generatedAt')}")
    print(f"HTML: {summary.get('htmlPath')}")
    print(f"Markdown: {summary.get('markdownPath')}")
    print(f"JSON: {summary.get('jsonPath')}")
    print()
    print("Start-here priority queue")
    for index, card in enumerate(summary.get("priorityQueue") or [], start=1):
        if not isinstance(card, dict):
            continue
        lane = card.get("sourceLane") or card.get("lane") or ""
        priority = card.get("priority") or "review"
        status = card.get("status") or card.get("reframeStatus") or ""
        action = card.get("action") or "Review action"
        why = card.get("explanation") or ""
        subject = card.get("episode") or card.get("groupKey") or card.get("id") or ""
        print(f"{index:02d}. [{priority}] {lane} {subject} - {action}")
        if status:
            print(f"    Status: {status}")
        if why:
            print(f"    Why: {why}")
    print()
    print("Lane card counts")
    for lane in summary.get("laneStatuses") or []:
        print(f"- {lane.get('lane')}: {lane.get('status')} ({lane.get('actionCards')} cards)")
    print()
    print("Boundary: local guidance only; no publish/upload/delete/source mutation/approval action was performed.")


def main() -> int:
    parser = argparse.ArgumentParser(description="Print the latest Quipsly OS board status.")
    parser.add_argument("--pointer", default=str(DEFAULT_POINTER))
    parser.add_argument("--limit", type=int, default=12)
    parser.add_argument("--json", action="store_true")
    args = parser.parse_args()
    summary = build_summary(Path(args.pointer), max(1, args.limit))
    if args.json:
        print(json.dumps(summary, indent=2, sort_keys=True))
    else:
        print_text(summary)
    return 0 if summary.get("ok") else 1


if __name__ == "__main__":
    raise SystemExit(main())
