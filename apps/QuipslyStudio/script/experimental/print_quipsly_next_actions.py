#!/usr/bin/env python3
"""Print the smallest safe next Quipsly action by production lane.

This is intentionally read-only. It reads the latest return brief pointer and
prints the bite-sized next-action cards already generated there. It never opens
files, executes commands, publishes, uploads, schedules, mutates accounts, or
captures receipt truth.
"""
from __future__ import annotations

import json
import sys
from pathlib import Path
from typing import Any

DEFAULT_POINTER = Path("/Volumes/My Passport/Quipsly Media Workspace/QuipslyOS/latest-quipsly-return-brief.json")


def load_json(path: Path) -> dict[str, Any]:
    if not path.exists():
        return {}
    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError:
        return {}
    return payload if isinstance(payload, dict) else {}


def normalize(value: str) -> str:
    return "".join(ch.lower() for ch in value if ch.isalnum())


def load_actions(pointer_path: Path) -> tuple[dict[str, Any], list[dict[str, Any]]]:
    pointer = load_json(pointer_path)
    target_path = Path(str(pointer.get("jsonPath") or "")) if pointer.get("jsonPath") else None
    payload = load_json(target_path) if target_path and target_path.exists() else pointer
    actions = payload.get("biteSizedNextActionsByLane")
    actions = actions if isinstance(actions, list) else []
    return payload, [item for item in actions if isinstance(item, dict)]


def usage() -> str:
    return """Usage:
  script/agentctl.sh quipsly-next-action [--json] [lane]

Examples:
  script/agentctl.sh quipsly-next-action
  script/agentctl.sh quipsly-next-action studio
  script/agentctl.sh quipsly-next-action photo --json

Read-only. Prints local next-action commands; it does not execute them."""


def main(argv: list[str]) -> int:
    json_mode = False
    lane_query = ""
    for arg in argv:
        if arg == "--help":
            print(usage())
            return 0
        if arg == "--json":
            json_mode = True
        elif arg:
            lane_query = arg

    payload, actions = load_actions(DEFAULT_POINTER)
    if lane_query:
        query = normalize(lane_query)
        actions = [
            action for action in actions
            if query in normalize(str(action.get("lane") or "")) or query in normalize(str(action.get("label") or ""))
        ]

    result = {
        "schema": "quipsly.next-actions.readonly.v1",
        "status": "ready" if actions else "empty",
        "sourceReturnBrief": payload.get("htmlPath") or payload.get("jsonPath") or str(DEFAULT_POINTER),
        "count": len(actions),
        "actions": actions,
        "truth": {
            "readOnly": True,
            "externalPublishing": False,
            "externalUpload": False,
            "externalSchedulesCreated": False,
            "receiptTruthCreated": False,
            "accountMutation": False,
            "sourceFilesMutated": False,
            "versionsOverwritten": False,
            "commandsExecuted": False,
        },
    }
    if json_mode:
        print(json.dumps(result, indent=2, sort_keys=True))
        return 0 if actions else 1

    if not actions:
        print("No bite-sized Quipsly next actions found. Run: script/agentctl.sh quipsly-return-brief")
        return 1

    print("Quipsly next safe local actions")
    print(f"Source: {result['sourceReturnBrief']}")
    print("Boundary: read-only listing; commands are printed, not executed.")
    print("")
    for index, action in enumerate(actions, start=1):
        print(f"{index}. {action.get('lane')}: {action.get('label')}")
        print(f"   status: {action.get('status') or ''}")
        print(f"   next: {action.get('nextAction') or ''}")
        if action.get("openCommand"):
            print(f"   command: {action.get('openCommand')}")
        if action.get("firstDryRunCommand"):
            decision = f" ({action.get('firstDryRunDecision')})" if action.get("firstDryRunDecision") else ""
            print(f"   safe dry-run{decision}: {action.get('firstDryRunCommand')}")
        if action.get("firstLocalProofCommand"):
            aspect = f" ({action.get('firstLocalProofAspect')})" if action.get("firstLocalProofAspect") else ""
            print(f"   local proof command{aspect}: {action.get('firstLocalProofCommand')}")
        if action.get("firstLocalProofReviewCommand"):
            aspect = f" ({action.get('firstLocalProofAspect')})" if action.get("firstLocalProofAspect") else ""
            print(f"   review existing local proof{aspect}: {action.get('firstLocalProofReviewCommand')}")
        if action.get("firstDraftPacketCommand"):
            print(f"   draft preview command: {action.get('firstDraftPacketCommand')}")
        if action.get("path"):
            print(f"   path: {action.get('path')}")
        print(f"   safety: {action.get('safety') or 'Local evidence only.'}")
        if action.get("firstDryRunSafety"):
            print(f"   dry-run safety: {action.get('firstDryRunSafety')}")
        if action.get("firstLocalProofSafety"):
            print(f"   local proof safety: {action.get('firstLocalProofSafety')}")
        if action.get("firstDraftPacketSafety"):
            print(f"   draft preview safety: {action.get('firstDraftPacketSafety')}")
        print("")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
