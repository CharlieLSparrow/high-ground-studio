#!/usr/bin/env python3
"""Approve, reject, or hold a human-flow promotion-plan action as sidecar evidence.

This records reviewer intent for a proposed metadata patch. It does not apply
the patch and does not mutate source media, timeline metadata, exports, or
publication state.
"""

from __future__ import annotations

import argparse
import datetime as dt
import json
from pathlib import Path
from typing import Any


DEFAULT_SESSIONS_DIR = Path("/Users/wall-e/Movies/QuipslyExports/human-flow-review/sessions")
VALID_DECISIONS = {"approve", "reject", "hold", "needs-more-evidence"}


def text(value: Any, default: str = "") -> str:
    if value is None:
        return default
    result = str(value).strip()
    return result or default


def resolve_session_path(value: str) -> Path:
    if value == "latest":
        if not DEFAULT_SESSIONS_DIR.exists():
            raise FileNotFoundError(f"No review sessions folder exists yet: {DEFAULT_SESSIONS_DIR}")
        candidates = [
            path for path in DEFAULT_SESSIONS_DIR.iterdir()
            if path.is_dir() and (path / "review-session.json").exists()
        ]
        if not candidates:
            raise FileNotFoundError(f"No review sessions found under: {DEFAULT_SESSIONS_DIR}")
        return max(candidates, key=lambda path: path.stat().st_mtime)
    path = Path(value).expanduser()
    if path.is_file():
        return path.parent
    return path


def read_json(path: Path) -> dict[str, Any]:
    with path.open("r", encoding="utf-8") as handle:
        payload = json.load(handle)
    if not isinstance(payload, dict):
        raise ValueError(f"Expected JSON object at {path}")
    return payload


def read_jsonl(path: Path) -> list[dict[str, Any]]:
    if not path.exists():
        return []
    rows: list[dict[str, Any]] = []
    with path.open("r", encoding="utf-8") as handle:
        for line in handle:
            line = line.strip()
            if not line:
                continue
            payload = json.loads(line)
            if isinstance(payload, dict):
                rows.append(payload)
    return rows


def write_jsonl(path: Path, row: dict[str, Any]) -> None:
    with path.open("a", encoding="utf-8") as handle:
        handle.write(json.dumps(row, sort_keys=True))
        handle.write("\n")


def action_matches(action: dict[str, Any], action_ref: str) -> bool:
    if text(action.get("boundaryId")) == action_ref:
        return True
    if text(action.get("actionType")) == action_ref:
        return True
    label = text(action.get("label")).lower().replace(" ", "-")
    return label == action_ref.lower()


def find_action(plan: dict[str, Any], action_ref: str) -> dict[str, Any] | None:
    actions = plan.get("actions")
    if not isinstance(actions, list):
        return None
    for action in actions:
        if isinstance(action, dict) and action_matches(action, action_ref):
            return action
    return None


def build_approval(args: argparse.Namespace, session_dir: Path, plan: dict[str, Any], action: dict[str, Any] | None) -> dict[str, Any]:
    decision = args.decision.strip().lower()
    if decision not in VALID_DECISIONS:
        raise ValueError(f"Invalid approval decision '{args.decision}'. Expected one of: {', '.join(sorted(VALID_DECISIONS))}")
    return {
        "eventType": "human_flow_promotion_action_approval",
        "recordedAt": dt.datetime.now(dt.timezone.utc).astimezone().isoformat(timespec="seconds"),
        "sessionId": text(plan.get("sessionId"), session_dir.name),
        "sessionDir": str(session_dir),
        "actionRef": args.action_ref,
        "matchedAction": action is not None,
        "decision": decision,
        "reviewer": args.reviewer,
        "notes": args.notes,
        "approvedForApply": decision == "approve",
        "actionSnapshot": action or {},
        "truth": "Approval ledger entry only. It does not apply metadata patches or mutate media/timeline/export/publication state.",
    }


def write_summary(session_dir: Path, approvals: list[dict[str, Any]]) -> Path:
    decision_counts: dict[str, int] = {}
    reviewer_counts: dict[str, int] = {}
    approved = 0
    unmatched = 0
    for approval in approvals:
        decision = text(approval.get("decision"), "unknown")
        reviewer = text(approval.get("reviewer"), "unknown")
        decision_counts[decision] = decision_counts.get(decision, 0) + 1
        reviewer_counts[reviewer] = reviewer_counts.get(reviewer, 0) + 1
        if approval.get("approvedForApply"):
            approved += 1
        if not approval.get("matchedAction"):
            unmatched += 1
    summary = {
        "updatedAt": dt.datetime.now(dt.timezone.utc).astimezone().isoformat(timespec="seconds"),
        "approvalCount": len(approvals),
        "approvedForApplyCount": approved,
        "unmatchedApprovalCount": unmatched,
        "decisionCounts": decision_counts,
        "reviewerCounts": reviewer_counts,
        "nextAction": "Only approved actions should be eligible for a future explicit apply command. This summary is not an apply command.",
        "truth": "Derived summary of promotion approval sidecars. No timeline metadata has changed.",
    }
    path = session_dir / "review-promotion-approvals-summary.json"
    with path.open("w", encoding="utf-8") as handle:
        json.dump(summary, handle, indent=2, sort_keys=True)
        handle.write("\n")
    return path


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--session", default="latest", help="Session folder, review-session.json path, or 'latest'.")
    parser.add_argument("--action-ref", required=True, help="Boundary id, action type, or label slug from review-promotion-plan.json.")
    parser.add_argument("--decision", required=True, help="approve, reject, hold, or needs-more-evidence.")
    parser.add_argument("--reviewer", default="Codex")
    parser.add_argument("--notes", default="")
    args = parser.parse_args()

    session_dir = resolve_session_path(args.session)
    plan_path = session_dir / "review-promotion-plan.json"
    plan = read_json(plan_path)
    action = find_action(plan, args.action_ref)
    approval = build_approval(args, session_dir, plan, action)
    approvals_path = session_dir / "review-promotion-approvals.jsonl"
    write_jsonl(approvals_path, approval)
    summary_path = write_summary(session_dir, read_jsonl(approvals_path))
    print(json.dumps({
        "approval": approval,
        "outputs": {
            "approvalsJsonl": str(approvals_path),
            "summary": str(summary_path),
        },
    }, indent=2, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
