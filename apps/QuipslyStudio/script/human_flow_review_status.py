#!/usr/bin/env python3
"""Summarize human-flow review sessions and sidecar decisions.

This reads generated review-session artifacts and decision sidecars. It does
not mutate source media, timeline metadata, exports, or publication state.
"""

from __future__ import annotations

import argparse
import datetime as dt
import json
from pathlib import Path
from typing import Any


DEFAULT_SESSIONS_DIR = Path("/Users/wall-e/Movies/QuipslyExports/human-flow-review/sessions")


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


def session_dirs(root: Path, limit: int) -> list[Path]:
    if not root.exists():
        return []
    candidates = [
        path for path in root.iterdir()
        if path.is_dir() and (path / "review-session.json").exists()
    ]
    return sorted(candidates, key=lambda path: path.stat().st_mtime, reverse=True)[:limit]


def summarize_session(path: Path) -> dict[str, Any]:
    session = read_json(path / "review-session.json")
    receipts = session.get("receipts") if isinstance(session.get("receipts"), list) else []
    decisions = read_jsonl(path / "review-decisions.jsonl")
    promotion_plan_path = path / "review-promotion-plan.json"
    approvals_path = path / "review-promotion-approvals.jsonl"
    approved_packet_path = path / "review-approved-patch-packet.json"
    promotion_plan = read_json(promotion_plan_path) if promotion_plan_path.exists() else {}
    approvals = read_jsonl(approvals_path)
    approved_packet = read_json(approved_packet_path) if approved_packet_path.exists() else {}
    reviewed_ids = {
        text(row.get("boundaryId"))
        for row in decisions
        if text(row.get("boundaryId"))
    }
    pending_receipts = []
    for receipt in receipts:
        if not isinstance(receipt, dict):
            continue
        card = receipt.get("sourceCard") if isinstance(receipt.get("sourceCard"), dict) else {}
        boundary_id = text(card.get("id"))
        if boundary_id and boundary_id not in reviewed_ids:
            pending_receipts.append({
                "boundaryId": boundary_id,
                "label": text(card.get("label"), "Untitled cut"),
                "timeLabel": text(card.get("timeLabel"), ""),
                "technique": text(card.get("technique"), ""),
                "risk": text(card.get("risk"), ""),
            })
    outcome_counts: dict[str, int] = {}
    reviewer_counts: dict[str, int] = {}
    approval_counts: dict[str, int] = {}
    approved_for_apply = 0
    for decision in decisions:
        outcome = text(decision.get("chosenOutcome"), "unknown")
        reviewer = text(decision.get("reviewer"), "unknown")
        outcome_counts[outcome] = outcome_counts.get(outcome, 0) + 1
        reviewer_counts[reviewer] = reviewer_counts.get(reviewer, 0) + 1
    for approval in approvals:
        approval_decision = text(approval.get("decision"), "unknown")
        approval_counts[approval_decision] = approval_counts.get(approval_decision, 0) + 1
        if approval.get("approvedForApply"):
            approved_for_apply += 1
    receipt_count = len([receipt for receipt in receipts if isinstance(receipt, dict)])
    decision_count = len(decisions)
    promotion_action_count = int(promotion_plan.get("actionCount", 0)) if promotion_plan else 0
    approved_patch_count = int(approved_packet.get("approvedPatchCount", 0)) if approved_packet else 0
    pending_count = max(0, receipt_count - len(reviewed_ids))
    if receipt_count == 0:
        status = "empty"
    elif pending_count == receipt_count:
        status = "not_started"
    elif pending_count > 0:
        status = "in_progress"
    else:
        status = "reviewed"
    return {
        "sessionId": text(session.get("sessionId"), path.name),
        "path": str(path),
        "generatedAt": text(session.get("generatedAt"), ""),
        "status": status,
        "receiptCount": receipt_count,
        "decisionCount": decision_count,
        "pendingCount": pending_count,
        "promotionPlanExists": promotion_plan_path.exists(),
        "promotionActionCount": promotion_action_count,
        "approvalCount": len(approvals),
        "approvedForApplyCount": approved_for_apply,
        "approvedPatchPacketExists": approved_packet_path.exists(),
        "approvedPatchCount": approved_patch_count,
        "outcomeCounts": outcome_counts,
        "reviewerCounts": reviewer_counts,
        "approvalCounts": approval_counts,
        "nextPending": pending_receipts[:5],
        "nextAction": next_action_for(
            status,
            pending_receipts,
            promotion_plan_path.exists(),
            len(approvals),
            approved_for_apply,
            approved_packet_path.exists(),
        ),
        "truth": "Status over sidecar review artifacts only. It does not prove timeline edits changed or external publication happened.",
    }


def next_action_for(
    status: str,
    pending_receipts: list[dict[str, Any]],
    has_promotion_plan: bool,
    approval_count: int,
    approved_for_apply: int,
    has_approved_patch_packet: bool,
) -> str:
    if status == "empty":
        return "Generate a human-flow review workbench after the app agent server is running."
    if status == "not_started" and pending_receipts:
        return f"Start with {pending_receipts[0]['boundaryId']} at {pending_receipts[0]['timeLabel']}."
    if status == "in_progress" and pending_receipts:
        return f"Continue with {pending_receipts[0]['boundaryId']} at {pending_receipts[0]['timeLabel']}."
    if status == "reviewed" and not has_promotion_plan:
        return "Review decisions exist for every receipt. Generate a promotion plan before considering any metadata mutation."
    if status == "reviewed" and has_promotion_plan and approval_count == 0:
        return "Promotion plan exists. Approve, reject, or hold proposed actions before building an approved patch packet."
    if status == "reviewed" and approved_for_apply > 0 and not has_approved_patch_packet:
        return "Approved actions exist. Build the dry-run approved patch packet before any explicit apply design."
    if status == "reviewed" and has_approved_patch_packet:
        return "Approved patch packet exists. Inspect it before building or running any explicit apply command."
    return "Inspect the session artifacts before taking action."


def render_markdown(summary: dict[str, Any]) -> str:
    lines = [
        "# Quipsly human-flow review status",
        "",
        f"- Generated: `{summary['generatedAt']}`",
        f"- Sessions root: `{summary['sessionsRoot']}`",
        f"- Sessions shown: `{len(summary['sessions'])}`",
        f"- Truth: {summary['truth']}",
        "",
    ]
    for session in summary["sessions"]:
        lines.extend([
            f"## {session['sessionId']}",
            "",
            f"- Status: `{session['status']}`",
            f"- Receipts: `{session['receiptCount']}`",
            f"- Decisions: `{session['decisionCount']}`",
            f"- Pending: `{session['pendingCount']}`",
            f"- Promotion plan actions: `{session['promotionActionCount']}`",
            f"- Approvals: `{session['approvalCount']}`",
            f"- Approved for apply: `{session['approvedForApplyCount']}`",
            f"- Approved patch packet patches: `{session['approvedPatchCount']}`",
            f"- Next action: {session['nextAction']}",
            f"- Path: `{session['path']}`",
            "",
            "Next pending:",
        ])
        for row in session.get("nextPending") or []:
            lines.append(
                f"- `{row['boundaryId']}` at `{row['timeLabel']}`: "
                f"{row['technique']} / {row['risk']} / {row['label']}"
            )
        lines.append("")
    return "\n".join(lines)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--sessions-dir", default=str(DEFAULT_SESSIONS_DIR))
    parser.add_argument("--limit", type=int, default=8)
    parser.add_argument("--markdown", action="store_true")
    args = parser.parse_args()

    root = Path(args.sessions_dir).expanduser()
    sessions = [summarize_session(path) for path in session_dirs(root, max(1, args.limit))]
    summary = {
        "model": "quipsly-human-flow-review-status",
        "generatedAt": dt.datetime.now(dt.timezone.utc).astimezone().isoformat(timespec="seconds"),
        "sessionsRoot": str(root),
        "sessionCount": len(sessions),
        "sessions": sessions,
        "truth": "Review status summarizes sidecar artifacts. Source media, timeline metadata, exports, and publication state are untouched.",
    }
    if args.markdown:
        print(render_markdown(summary))
    else:
        print(json.dumps(summary, indent=2, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
