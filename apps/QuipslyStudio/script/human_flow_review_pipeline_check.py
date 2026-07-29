#!/usr/bin/env python3
"""Check the human-flow review sidecar pipeline.

This reports which review artifacts exist and which next safe command should be
run. It never mutates source media, timeline metadata, exports, or publication
state.
"""

from __future__ import annotations

import argparse
import datetime as dt
import json
from pathlib import Path
from typing import Any


DEFAULT_ROOT = Path("/Users/wall-e/Movies/QuipslyExports/human-flow-review")


def text(value: Any, default: str = "") -> str:
    if value is None:
        return default
    result = str(value).strip()
    return result or default


def read_json(path: Path) -> dict[str, Any]:
    with path.open("r", encoding="utf-8") as handle:
        payload = json.load(handle)
    if not isinstance(payload, dict):
        raise ValueError(f"Expected JSON object at {path}")
    return payload


def count_jsonl(path: Path) -> int:
    if not path.exists():
        return 0
    count = 0
    with path.open("r", encoding="utf-8") as handle:
        for line in handle:
            if line.strip():
                count += 1
    return count


def latest_session_dir(root: Path) -> Path | None:
    sessions_root = root / "sessions"
    if not sessions_root.exists():
        return None
    candidates = [
        path for path in sessions_root.iterdir()
        if path.is_dir() and (path / "review-session.json").exists()
    ]
    if not candidates:
        return None
    return max(candidates, key=lambda path: path.stat().st_mtime)


def file_status(path: Path) -> dict[str, Any]:
    return {
        "path": str(path),
        "exists": path.exists(),
        "sizeBytes": path.stat().st_size if path.exists() else 0,
    }


def build_check(root: Path, session_ref: str) -> dict[str, Any]:
    board_path = root / "human-flow-cut-review-board.json"
    if session_ref == "latest":
        session_dir = latest_session_dir(root)
    else:
        candidate = Path(session_ref).expanduser()
        session_dir = candidate.parent if candidate.is_file() else candidate
    session_files: dict[str, dict[str, Any]] = {}
    session_id = ""
    receipt_count = 0
    decision_count = 0
    approved_count = 0
    if session_dir:
        session_path = session_dir / "review-session.json"
        session_files = {
            "session": file_status(session_path),
            "receiptsJsonl": file_status(session_dir / "review-receipts.jsonl"),
            "decisionsJsonl": file_status(session_dir / "review-decisions.jsonl"),
            "decisionsSummary": file_status(session_dir / "review-decisions-summary.json"),
            "promotionPlan": file_status(session_dir / "review-promotion-plan.json"),
            "approvalsJsonl": file_status(session_dir / "review-promotion-approvals.jsonl"),
            "approvalsSummary": file_status(session_dir / "review-promotion-approvals-summary.json"),
            "approvedPatchPacket": file_status(session_dir / "review-approved-patch-packet.json"),
        }
        if session_path.exists():
            try:
                session = read_json(session_path)
                session_id = text(session.get("sessionId"), session_dir.name)
                receipts = session.get("receipts")
                receipt_count = len(receipts) if isinstance(receipts, list) else 0
            except Exception:
                session_id = session_dir.name
        decision_count = count_jsonl(session_dir / "review-decisions.jsonl")
        approvals_path = session_dir / "review-promotion-approvals.jsonl"
        if approvals_path.exists():
            with approvals_path.open("r", encoding="utf-8") as handle:
                for line in handle:
                    line = line.strip()
                    if not line:
                        continue
                    try:
                        row = json.loads(line)
                    except json.JSONDecodeError:
                        continue
                    if isinstance(row, dict) and row.get("approvedForApply"):
                        approved_count += 1
    steps = [
        {
            "name": "board",
            "ready": board_path.exists(),
            "command": "script/agentctl.sh decision-human-flow-board",
            "purpose": "Generate candidate cut review cards from the live app agent endpoint.",
        },
        {
            "name": "session",
            "ready": bool(session_files.get("session", {}).get("exists")),
            "command": "script/agentctl.sh human-flow-review-session",
            "purpose": "Turn the board into timestamped review receipts.",
        },
        {
            "name": "decisions",
            "ready": decision_count > 0,
            "command": "script/agentctl.sh human-flow-review-decision latest <boundary-id> <outcome> <reviewer> [notes]",
            "purpose": "Record sidecar review judgments for cut boundaries.",
        },
        {
            "name": "promotionPlan",
            "ready": bool(session_files.get("promotionPlan", {}).get("exists")),
            "command": "script/agentctl.sh human-flow-review-promotion-plan",
            "purpose": "Map review decisions into proposed metadata patches without applying them.",
        },
        {
            "name": "approvals",
            "ready": approved_count > 0,
            "command": "script/agentctl.sh human-flow-review-approval latest <action-ref> approve <reviewer> [notes]",
            "purpose": "Approve, reject, or hold proposed metadata actions as sidecar evidence.",
        },
        {
            "name": "approvedPatchPacket",
            "ready": bool(session_files.get("approvedPatchPacket", {}).get("exists")),
            "command": "script/agentctl.sh human-flow-approved-patch-packet",
            "purpose": "Gather approved metadata patches into a dry-run packet for future explicit apply.",
        },
    ]
    next_step = next((step for step in steps if not step["ready"]), None)
    return {
        "model": "quipsly-human-flow-review-pipeline-check",
        "generatedAt": dt.datetime.now(dt.timezone.utc).astimezone().isoformat(timespec="seconds"),
        "root": str(root),
        "board": file_status(board_path),
        "sessionDir": str(session_dir) if session_dir else "",
        "sessionId": session_id,
        "sessionFiles": session_files,
        "receiptCount": receipt_count,
        "decisionCount": decision_count,
        "approvedForApplyCount": approved_count,
        "steps": steps,
        "nextSafeCommand": next_step["command"] if next_step else "No missing sidecar step. Inspect approved patch packet before any explicit apply work.",
        "nextSafePurpose": next_step["purpose"] if next_step else "Review is sidecar-complete for this session.",
        "truth": "Pipeline check only. It reads sidecar artifacts and does not mutate media, timeline metadata, exports, or publication state.",
    }


def render_markdown(check: dict[str, Any]) -> str:
    lines = [
        "# Quipsly human-flow review pipeline check",
        "",
        f"- Generated: `{check['generatedAt']}`",
        f"- Root: `{check['root']}`",
        f"- Session: `{check['sessionId'] or 'none'}`",
        f"- Receipts: `{check['receiptCount']}`",
        f"- Decisions: `{check['decisionCount']}`",
        f"- Approved for apply: `{check['approvedForApplyCount']}`",
        f"- Truth: {check['truth']}",
        "",
        "## Next safe command",
        "",
        "```bash",
        check["nextSafeCommand"],
        "```",
        "",
        check["nextSafePurpose"],
        "",
        "## Steps",
        "",
    ]
    for step in check["steps"]:
        mark = "ready" if step["ready"] else "missing"
        lines.extend([
            f"### {step['name']} - {mark}",
            "",
            f"- Purpose: {step['purpose']}",
            "",
            "```bash",
            step["command"],
            "```",
            "",
        ])
    return "\n".join(lines)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--root", default=str(DEFAULT_ROOT))
    parser.add_argument("--session", default="latest")
    parser.add_argument("--markdown", action="store_true")
    args = parser.parse_args()

    check = build_check(Path(args.root).expanduser(), args.session)
    if args.markdown:
        print(render_markdown(check))
    else:
        print(json.dumps(check, indent=2, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
