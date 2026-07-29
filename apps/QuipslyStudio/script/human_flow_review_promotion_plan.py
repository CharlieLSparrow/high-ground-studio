#!/usr/bin/env python3
"""Create a non-mutating promotion plan from human-flow review decisions.

This reads a review session and its sidecar review decisions, then writes a
proposed metadata-update plan. It never mutates source media, timeline metadata,
exports, or publication state.
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


def action_for_decision(decision: dict[str, Any]) -> dict[str, Any]:
    outcome = text(decision.get("chosenOutcome")).lower()
    boundary_id = text(decision.get("boundaryId"), "unknown-boundary")
    note = text(decision.get("reviewerNote"))
    base = {
        "boundaryId": boundary_id,
        "sourceDecision": decision,
        "safeToAutoApply": False,
        "requiresExplicitApproval": True,
        "truth": "Proposed metadata action only. It is not applied to the edit.",
    }
    if "keep" in outcome and "cadence" in outcome:
        base.update({
            "actionType": "mark_preserve_cadence",
            "label": "Preserve cadence",
            "metadataPatch": {
                "reviewStatus": "reviewed",
                "cadenceIntent": "preserve",
                "humanFlowOutcome": decision.get("chosenOutcome"),
                "reviewNote": note,
            },
            "reason": "Reviewer judged the timing as human/useful rather than dead air.",
        })
    elif "tighten" in outcome:
        base.update({
            "actionType": "propose_gentle_tighten",
            "label": "Propose gentle tighten",
            "metadataPatch": {
                "reviewStatus": "reviewed",
                "cadenceIntent": "tighten-gently",
                "humanFlowOutcome": decision.get("chosenOutcome"),
                "reviewNote": note,
            },
            "reason": "Reviewer judged the pause as removable if cadence survives.",
        })
    elif "cover" in outcome or "context visual" in outcome:
        base.update({
            "actionType": "propose_visual_cover",
            "label": "Propose visual cover",
            "metadataPatch": {
                "reviewStatus": "reviewed",
                "coverIntent": "reaction-or-context-cover",
                "humanFlowOutcome": decision.get("chosenOutcome"),
                "reviewNote": note,
            },
            "reason": "Reviewer wants a visual cover or context visual instead of a raw cut.",
        })
    elif "split" in outcome or "j-cut" in outcome or "l-cut" in outcome:
        base.update({
            "actionType": "propose_split_edit",
            "label": "Propose J/L split edit",
            "metadataPatch": {
                "reviewStatus": "reviewed",
                "splitEditIntent": "j-or-l-cut",
                "humanFlowOutcome": decision.get("chosenOutcome"),
                "reviewNote": note,
            },
            "reason": "Reviewer judged audio/visual handoff should be adjusted by ear.",
        })
    elif "needs" in outcome or "listen" in outcome:
        base.update({
            "actionType": "hold_for_human_listen",
            "label": "Hold for human listen",
            "metadataPatch": {
                "reviewStatus": "needs-listen",
                "humanFlowOutcome": decision.get("chosenOutcome"),
                "reviewNote": note,
            },
            "reason": "Reviewer marked this boundary as ambiguous or needing another ear pass.",
        })
    else:
        base.update({
            "actionType": "record_review_note",
            "label": "Record review note",
            "metadataPatch": {
                "reviewStatus": "reviewed",
                "humanFlowOutcome": decision.get("chosenOutcome"),
                "reviewNote": note,
            },
            "reason": "Reviewer provided an outcome that needs explicit interpretation before timeline changes.",
        })
    return base


def build_plan(session_dir: Path) -> dict[str, Any]:
    session = read_json(session_dir / "review-session.json")
    decisions = read_jsonl(session_dir / "review-decisions.jsonl")
    actions = [action_for_decision(decision) for decision in decisions]
    action_counts: dict[str, int] = {}
    for action in actions:
        key = text(action.get("actionType"), "unknown")
        action_counts[key] = action_counts.get(key, 0) + 1
    return {
        "model": "quipsly-human-flow-review-promotion-plan",
        "version": "2026-06-30.human-flow-promotion-plan.v1",
        "generatedAt": dt.datetime.now(dt.timezone.utc).astimezone().isoformat(timespec="seconds"),
        "sessionId": text(session.get("sessionId"), session_dir.name),
        "sessionDir": str(session_dir),
        "decisionCount": len(decisions),
        "actionCount": len(actions),
        "actionCounts": action_counts,
        "actions": actions,
        "nextAction": "Review this plan, then build or run an explicit apply command only for approved metadata patches.",
        "truth": "Promotion plan only. No source media, timeline metadata, exports, or publication state changed.",
    }


def render_markdown(plan: dict[str, Any]) -> str:
    lines = [
        "# Quipsly human-flow review promotion plan",
        "",
        f"- Session: `{plan['sessionId']}`",
        f"- Generated: `{plan['generatedAt']}`",
        f"- Decisions: `{plan['decisionCount']}`",
        f"- Actions: `{plan['actionCount']}`",
        f"- Truth: {plan['truth']}",
        "",
        "## Action counts",
        "",
    ]
    for label, count in sorted(plan.get("actionCounts", {}).items()):
        lines.append(f"- `{label}`: `{count}`")
    lines.extend(["", "## Proposed actions", ""])
    for action in plan.get("actions") or []:
        source = action.get("sourceDecision") if isinstance(action.get("sourceDecision"), dict) else {}
        lines.extend([
            f"### {action['label']} - {action['boundaryId']}",
            "",
            f"- Type: `{action['actionType']}`",
            f"- Requires approval: `{action['requiresExplicitApproval']}`",
            f"- Reviewer: `{text(source.get('reviewer'), 'unknown')}`",
            f"- Outcome: `{text(source.get('chosenOutcome'), 'unknown')}`",
            f"- Reason: {action['reason']}",
            f"- Note: {text(source.get('reviewerNote'), 'No note.')}",
            "",
            "Metadata patch preview:",
            "",
            "```json",
            json.dumps(action["metadataPatch"], indent=2, sort_keys=True),
            "```",
            "",
        ])
    return "\n".join(lines)


def write_plan(session_dir: Path, plan: dict[str, Any]) -> dict[str, str]:
    json_path = session_dir / "review-promotion-plan.json"
    md_path = session_dir / "review-promotion-plan.md"
    with json_path.open("w", encoding="utf-8") as handle:
        json.dump(plan, handle, indent=2, sort_keys=True)
        handle.write("\n")
    with md_path.open("w", encoding="utf-8") as handle:
        handle.write(render_markdown(plan))
        handle.write("\n")
    return {"json": str(json_path), "markdown": str(md_path)}


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--session", default="latest", help="Session folder, review-session.json path, or 'latest'.")
    args = parser.parse_args()

    session_dir = resolve_session_path(args.session)
    plan = build_plan(session_dir)
    outputs = write_plan(session_dir, plan)
    print(json.dumps({"outputs": outputs, "plan": plan}, indent=2, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
