#!/usr/bin/env python3
"""Record a human-flow review decision as sidecar evidence.

This appends a decision receipt to a generated human-flow review session. It is
deliberately non-destructive: it does not mutate source media, session source
receipts, timeline metadata, exports, or publication state.
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


def resolve_session_path(value: str) -> Path:
    if value == "latest":
        if not DEFAULT_SESSIONS_DIR.exists():
            raise FileNotFoundError(f"No review sessions folder exists yet: {DEFAULT_SESSIONS_DIR}")
        candidates = [
            path for path in DEFAULT_SESSIONS_DIR.iterdir()
            if path.is_dir() and (path / "review-session.json").exists()
        ]
        if not candidates:
            raise FileNotFoundError(f"No review-session.json files found under: {DEFAULT_SESSIONS_DIR}")
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


def matching_receipt(session: dict[str, Any], boundary_id: str) -> dict[str, Any] | None:
    receipts = session.get("receipts")
    if not isinstance(receipts, list):
        return None
    for receipt in receipts:
        if not isinstance(receipt, dict):
            continue
        card = receipt.get("sourceCard") if isinstance(receipt.get("sourceCard"), dict) else {}
        suggestion = receipt.get("suggestion") if isinstance(receipt.get("suggestion"), dict) else {}
        identifiers = {
            text(card.get("id")),
            text(suggestion.get("boundaryId")),
            text(receipt.get("boundaryId")),
        }
        if boundary_id in identifiers:
            return receipt
    return None


def allowed_outcomes(receipt: dict[str, Any] | None) -> list[str]:
    if not receipt:
        return []
    suggestion = receipt.get("suggestion") if isinstance(receipt.get("suggestion"), dict) else {}
    labels = suggestion.get("availableOutcomeLabels")
    if not isinstance(labels, list):
        return []
    return [text(label) for label in labels if text(label)]


def build_decision(args: argparse.Namespace, session: dict[str, Any], receipt: dict[str, Any] | None) -> dict[str, Any]:
    now = dt.datetime.now(dt.timezone.utc).astimezone().isoformat(timespec="seconds")
    card = receipt.get("sourceCard") if isinstance(receipt, dict) and isinstance(receipt.get("sourceCard"), dict) else {}
    labels = allowed_outcomes(receipt)
    return {
        "eventType": "human_flow_review_decision",
        "recordedAt": now,
        "sessionId": text(session.get("sessionId"), "unknown-session"),
        "boundaryId": args.boundary_id,
        "matchedReceipt": receipt is not None,
        "sourceCard": {
            "id": text(card.get("id"), args.boundary_id),
            "label": text(card.get("label"), "Unknown cut"),
            "timeLabel": text(card.get("timeLabel"), ""),
            "targetLaneName": text(card.get("targetLaneName"), ""),
            "technique": text(card.get("technique"), ""),
            "risk": text(card.get("risk"), ""),
            "confidence": card.get("confidence", ""),
        },
        "chosenOutcome": args.outcome,
        "outcomeWasSuggested": args.outcome in labels if labels else False,
        "availableOutcomeLabels": labels,
        "reviewer": args.reviewer,
        "reviewerNote": args.notes,
        "audioContinuity": args.audio_continuity,
        "visualContinuity": args.visual_continuity,
        "cadenceJudgment": args.cadence_judgment,
        "actionTaken": args.action_taken,
        "needsFollowUp": args.needs_follow_up,
        "truth": "Sidecar review decision only. It does not mutate source media, timeline decisions, exports, or publication state.",
    }


def write_jsonl(path: Path, row: dict[str, Any]) -> None:
    with path.open("a", encoding="utf-8") as handle:
        handle.write(json.dumps(row, sort_keys=True))
        handle.write("\n")


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


def write_summary(session_dir: Path, session: dict[str, Any], rows: list[dict[str, Any]]) -> Path:
    outcome_counts: dict[str, int] = {}
    reviewer_counts: dict[str, int] = {}
    unmatched = 0
    for row in rows:
        outcome = text(row.get("chosenOutcome"), "unknown")
        reviewer = text(row.get("reviewer"), "unknown")
        outcome_counts[outcome] = outcome_counts.get(outcome, 0) + 1
        reviewer_counts[reviewer] = reviewer_counts.get(reviewer, 0) + 1
        if not row.get("matchedReceipt"):
            unmatched += 1
    summary = {
        "sessionId": text(session.get("sessionId"), "unknown-session"),
        "updatedAt": dt.datetime.now(dt.timezone.utc).astimezone().isoformat(timespec="seconds"),
        "decisionCount": len(rows),
        "unmatchedDecisionCount": unmatched,
        "outcomeCounts": outcome_counts,
        "reviewerCounts": reviewer_counts,
        "nextAction": "Use these sidecar decisions as evidence for later timeline metadata updates; do not treat them as edit mutations by themselves.",
        "truth": "Derived summary of review-decision sidecars. Review decisions are evidence, not source or publication truth.",
    }
    path = session_dir / "review-decisions-summary.json"
    with path.open("w", encoding="utf-8") as handle:
        json.dump(summary, handle, indent=2, sort_keys=True)
        handle.write("\n")
    return path


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--session", default="latest", help="Session folder, review-session.json path, or 'latest'.")
    parser.add_argument("--boundary-id", required=True)
    parser.add_argument("--outcome", required=True)
    parser.add_argument("--reviewer", default="Codex")
    parser.add_argument("--notes", default="")
    parser.add_argument("--audio-continuity", default="")
    parser.add_argument("--visual-continuity", default="")
    parser.add_argument("--cadence-judgment", default="")
    parser.add_argument("--action-taken", default="")
    parser.add_argument("--needs-follow-up", default="")
    args = parser.parse_args()

    session_dir = resolve_session_path(args.session)
    session_path = session_dir / "review-session.json"
    session = read_json(session_path)
    receipt = matching_receipt(session, args.boundary_id)
    decision = build_decision(args, session, receipt)
    decisions_path = session_dir / "review-decisions.jsonl"
    write_jsonl(decisions_path, decision)
    summary_path = write_summary(session_dir, session, read_jsonl(decisions_path))
    print(json.dumps({
        "decision": decision,
        "outputs": {
            "decisionsJsonl": str(decisions_path),
            "summary": str(summary_path),
        },
    }, indent=2, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
