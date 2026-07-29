#!/usr/bin/env python3
"""Create a fillable human-flow review session from a generated board JSON.

This script is intentionally sidecar-only. It reads the read-only human-flow
board artifact and writes a timestamped review packet with blank receipts that
humans or agents can fill later. It never mutates source media, timeline data,
or publication state.
"""

from __future__ import annotations

import argparse
import datetime as dt
import json
import os
import re
from pathlib import Path
from typing import Any


DEFAULT_BOARD = "/Users/wall-e/Movies/QuipslyExports/human-flow-review/human-flow-cut-review-board.json"
DEFAULT_OUTPUT_DIR = "/Users/wall-e/Movies/QuipslyExports/human-flow-review/sessions"


def text(value: Any, default: str = "") -> str:
    if value is None:
        return default
    result = str(value).strip()
    return result or default


def slugify(value: str) -> str:
    slug = re.sub(r"[^a-zA-Z0-9]+", "-", value.strip().lower()).strip("-")
    return slug or "human-flow-review"


def read_board(path: str) -> dict[str, Any]:
    with open(path, "r", encoding="utf-8") as handle:
        payload = json.load(handle)
    if not isinstance(payload, dict):
        raise ValueError(f"Board JSON must be an object: {path}")
    return payload


def receipt_from_card(card: dict[str, Any], session_id: str) -> dict[str, Any]:
    template = card.get("learningEventTemplate")
    if not isinstance(template, dict):
        template = {
            "eventType": "human_flow_cut_review",
            "boundaryId": text(card.get("id"), "unknown-boundary"),
            "sequenceTime": card.get("sequenceTime", 0),
            "timeLabel": text(card.get("timeLabel"), "00:00.0"),
            "targetLaneName": text(card.get("targetLaneName"), "Unknown lane"),
            "recommendedTechnique": text(card.get("technique"), "straight-cut-review"),
            "reviewQuestion": text(card.get("reviewQuestion"), "Does this cut work by ear and eye?"),
            "doNotOptimizeAway": text(card.get("doNotOptimizeAway"), "Human timing."),
            "availableOutcomeLabels": [
                text(outcome.get("label"))
                for outcome in card.get("reviewOutcomes", [])
                if isinstance(outcome, dict) and text(outcome.get("label"))
            ],
        }
    receipt = {
        "sessionId": session_id,
        "status": "pending_review",
        "filledAt": "",
        "reviewer": "",
        "sourceCard": {
            "id": text(card.get("id"), text(template.get("boundaryId"), "unknown-boundary")),
            "label": text(card.get("label"), "Untitled cut"),
            "timeLabel": text(card.get("timeLabel"), text(template.get("timeLabel"), "00:00.0")),
            "targetLaneName": text(card.get("targetLaneName"), text(template.get("targetLaneName"), "Unknown lane")),
            "technique": text(card.get("technique"), text(template.get("recommendedTechnique"), "straight-cut-review")),
            "risk": text(card.get("risk"), "unknown"),
            "confidence": card.get("confidence", 0),
        },
        "suggestion": template,
        "reviewerFields": {
            "chosenOutcome": "",
            "reviewerNote": "",
            "audioContinuity": "",
            "visualContinuity": "",
            "cadenceJudgment": "",
            "actionTaken": "",
            "needsFollowUp": "",
        },
        "truth": "Blank review receipt. Fill after listening/watching; source media remains untouched.",
    }
    return receipt


def build_session(board: dict[str, Any], board_path: str, output_dir: str, name: str) -> dict[str, Any]:
    now = dt.datetime.now(dt.timezone.utc).astimezone()
    session_id = f"{now.strftime('%Y%m%d-%H%M%S')}-{slugify(name)}"
    recipes = board.get("recipes")
    if not isinstance(recipes, list):
        recipes = []
    receipts = [
        receipt_from_card(card, session_id)
        for card in recipes
        if isinstance(card, dict)
    ]
    session_dir = Path(output_dir) / session_id
    return {
        "sessionId": session_id,
        "sessionDir": str(session_dir),
        "generatedAt": now.isoformat(timespec="seconds"),
        "name": name,
        "sourceBoardPath": board_path,
        "sourceBoardStatus": board.get("sourceStatus", ""),
        "sourceBoardMode": board.get("mode", ""),
        "sourceBoardGeneratedAt": board.get("generatedAt", ""),
        "receiptCount": len(receipts),
        "reviewProtocol": board.get("reviewProtocol", []),
        "outcomeTruth": board.get("outcomeTruth", ""),
        "learningTruth": board.get("learningTruth", ""),
        "truth": "Review session packet only. It does not prove review happened and does not mutate media, decisions, exports, or publication state.",
        "outputs": {
            "session": str(session_dir / "review-session.json"),
            "receiptsJsonl": str(session_dir / "review-receipts.jsonl"),
            "markdown": str(session_dir / "review-session.md"),
            "summary": str(session_dir / "status-summary.json"),
        },
        "receipts": receipts,
    }


def status_summary(session: dict[str, Any]) -> dict[str, Any]:
    receipts = session.get("receipts") if isinstance(session.get("receipts"), list) else []
    techniques: dict[str, int] = {}
    risks: dict[str, int] = {}
    for receipt in receipts:
        if not isinstance(receipt, dict):
            continue
        card = receipt.get("sourceCard") if isinstance(receipt.get("sourceCard"), dict) else {}
        technique = text(card.get("technique"), "unknown")
        risk = text(card.get("risk"), "unknown")
        techniques[technique] = techniques.get(technique, 0) + 1
        risks[risk] = risks.get(risk, 0) + 1
    return {
        "sessionId": session["sessionId"],
        "generatedAt": session["generatedAt"],
        "receiptCount": len(receipts),
        "pendingReviewCount": len(receipts),
        "techniqueCounts": techniques,
        "riskCounts": risks,
        "nextAction": "Open review-session.md, review each boundary by ear/eye, then fill review-receipts.jsonl or copy notes back through Quipsly Studio.",
        "truth": session["truth"],
    }


def render_markdown(session: dict[str, Any]) -> str:
    lines = [
        "# Quipsly human-flow review session",
        "",
        f"- Session: `{session['sessionId']}`",
        f"- Generated: `{session['generatedAt']}`",
        f"- Source board: `{session['sourceBoardPath']}`",
        f"- Receipt count: `{session['receiptCount']}`",
        f"- Truth: {session['truth']}",
        "",
        "## Review protocol",
        "",
    ]
    for step in session.get("reviewProtocol") or []:
        lines.append(f"- {step}")
    lines.extend(["", "## Receipts to fill", ""])
    for receipt in session.get("receipts") or []:
        card = receipt["sourceCard"]
        suggestion = receipt["suggestion"]
        fields = receipt["reviewerFields"]
        lines.extend([
            f"### {card['timeLabel']} - {card['technique']} - {card['label']}",
            "",
            f"- Lane: `{card['targetLaneName']}`",
            f"- Risk/confidence: `{card['risk']}` / `{card['confidence']}`",
            f"- Review question: {text(suggestion.get('reviewQuestion'), 'Does this cut work?')}",
            f"- Do not optimize away: {text(suggestion.get('doNotOptimizeAway'), 'Human timing.')}",
            "",
            "Fill after review:",
        ])
        for key in fields:
            lines.append(f"- `{key}`: ")
        lines.extend(["", "Suggested outcome labels:"])
        for label in suggestion.get("availableOutcomeLabels") or []:
            lines.append(f"- {label}")
        lines.append("")
    return "\n".join(lines)


def write_session(session: dict[str, Any]) -> None:
    session_dir = Path(session["sessionDir"])
    session_dir.mkdir(parents=True, exist_ok=False)
    outputs = session["outputs"]
    serializable = {key: value for key, value in session.items() if key != "receipts"}
    serializable["receipts"] = session["receipts"]
    with open(outputs["session"], "w", encoding="utf-8") as handle:
        json.dump(serializable, handle, indent=2, sort_keys=True)
        handle.write("\n")
    with open(outputs["receiptsJsonl"], "w", encoding="utf-8") as handle:
        for receipt in session["receipts"]:
            handle.write(json.dumps(receipt, sort_keys=True))
            handle.write("\n")
    with open(outputs["markdown"], "w", encoding="utf-8") as handle:
        handle.write(render_markdown(session))
        handle.write("\n")
    with open(outputs["summary"], "w", encoding="utf-8") as handle:
        json.dump(status_summary(session), handle, indent=2, sort_keys=True)
        handle.write("\n")


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--board", default=DEFAULT_BOARD)
    parser.add_argument("--output-dir", default=DEFAULT_OUTPUT_DIR)
    parser.add_argument("--name", default="human-flow-review")
    args = parser.parse_args()

    board = read_board(args.board)
    session = build_session(board, args.board, args.output_dir, args.name)
    write_session(session)
    print(json.dumps(session["outputs"], indent=2, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
