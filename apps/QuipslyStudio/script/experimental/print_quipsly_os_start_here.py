#!/usr/bin/env python3
"""Print the safest first action for each Quipsly production lane.

This is intentionally read-only. It does not regenerate boards, create
receipts, approve review items, publish, upload, or mutate source artifacts.
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import Any


DEFAULT_POINTER = Path(
    "/Volumes/My Passport/Quipsly Media Workspace/QuipslyOS/latest-quipsly-os-board.json"
)


def load_json(path: Path) -> dict[str, Any]:
    return json.loads(path.read_text(encoding="utf-8"))


def load_board(pointer_path: Path) -> tuple[dict[str, Any], dict[str, Any]]:
    pointer = load_json(pointer_path)
    board_path = Path(pointer.get("jsonPath") or "")
    if board_path.exists():
        return pointer, load_json(board_path)
    return pointer, pointer


def failure_payload(pointer_path: Path, message: str) -> dict[str, Any]:
    return {
        "ok": False,
        "pointerPath": str(pointer_path),
        "message": message,
        "nextCommand": "script/agentctl.sh quipsly-os-board",
        "safety": "read-only status; no source, approval, receipt, upload, publish, or account mutation",
    }


def build_payload(pointer_path: Path) -> dict[str, Any]:
    if not pointer_path.exists():
        return failure_payload(
            pointer_path,
            "No latest Quipsly OS board pointer exists yet.",
        )

    try:
        pointer, board = load_board(pointer_path)
    except Exception as exc:  # pragma: no cover - user-facing CLI guard
        return failure_payload(pointer_path, f"Could not read latest OS board: {exc}")

    first_actions = board.get("firstActionsByLane") or pointer.get("firstActionsByLane") or []
    lane_statuses = board.get("laneStatuses") or pointer.get("laneStatuses") or {}
    if not first_actions:
        return failure_payload(
            pointer_path,
            "Latest OS board has no firstActionsByLane index. Regenerate the board.",
        )

    return {
        "ok": True,
        "pointerPath": str(pointer_path),
        "htmlPath": pointer.get("htmlPath") or board.get("htmlPath"),
        "markdownPath": pointer.get("markdownPath") or board.get("markdownPath"),
        "jsonPath": pointer.get("jsonPath"),
        "laneStatuses": lane_statuses,
        "firstActionsByLane": first_actions,
        "safety": "read-only status; no source, approval, receipt, upload, publish, or account mutation",
    }


def print_text(payload: dict[str, Any]) -> int:
    print("Quipsly OS: start here")
    print("=" * 24)

    if not payload.get("ok"):
        print(f"Status: needs board refresh")
        print(f"Why: {payload.get('message')}")
        print(f"Next: {payload.get('nextCommand')}")
        print(f"Safety: {payload.get('safety')}")
        return 1

    print(f"Board: {payload.get('htmlPath')}")
    print(f"Markdown: {payload.get('markdownPath')}")
    print(f"Safety: {payload.get('safety')}")
    print()

    lane_statuses = payload.get("laneStatuses") or {}
    for index, action in enumerate(payload.get("firstActionsByLane") or [], start=1):
        lane = action.get("lane") or "Unknown lane"
        status = action.get("status") or lane_statuses.get(lane) or "unknown"
        title = action.get("action") or "Open lane board"
        reason = action.get("reason") or action.get("why") or "Safest visible next action."
        command = action.get("openCommand") or action.get("command") or ""
        print(f"{index}. {lane} [{status}]")
        print(f"   First action: {title}")
        print(f"   Why: {reason}")
        if command:
            print(f"   Open: {command}")
        print()

    return 0


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--json", action="store_true", help="Emit machine-readable JSON")
    parser.add_argument(
        "--pointer",
        default=str(DEFAULT_POINTER),
        help="Path to latest-quipsly-os-board.json",
    )
    args = parser.parse_args()

    payload = build_payload(Path(args.pointer))
    if args.json:
        print(json.dumps(payload, indent=2, sort_keys=True))
        return 0 if payload.get("ok") else 1
    return print_text(payload)


if __name__ == "__main__":
    raise SystemExit(main())
