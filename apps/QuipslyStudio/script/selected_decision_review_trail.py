#!/usr/bin/env python3
"""Render the current selected-decision review trail.

This is intentionally read-only. Quipsly Studio owns the selected decision state;
this helper only formats /selected_decision_review_trail for humans and agents.
"""

from __future__ import annotations

import argparse
import json
import sys
import urllib.error
import urllib.request
from typing import Any


DEFAULT_BASE_URL = "http://127.0.0.1:8765"


def fetch_json(base_url: str, path: str) -> dict[str, Any]:
    url = f"{base_url.rstrip('/')}{path}"
    request = urllib.request.Request(url, headers={"Accept": "application/json"})
    try:
        with urllib.request.urlopen(request, timeout=4) as response:
            return json.loads(response.read().decode("utf-8"))
    except urllib.error.URLError as exc:
        return {
            "status": "unreachable",
            "model": "quipslystudio-selected-decision-review-trail-renderer",
            "error": str(exc),
            "truth": "Could not reach the running Quipsly Studio agent server. No media or session state was changed.",
            "nextAction": "Launch Quipsly Studio, load an episode session, select a SHOW/SKIP decision, then rerun this command.",
        }
    except json.JSONDecodeError as exc:
        return {
            "status": "invalid_json",
            "model": "quipslystudio-selected-decision-review-trail-renderer",
            "error": str(exc),
            "truth": "The agent server responded, but not with valid JSON. No media or session state was changed.",
        }


def stringify(value: Any) -> str:
    if value is None:
        return ""
    if isinstance(value, str):
        return value
    return str(value)


def number(value: Any) -> float:
    if isinstance(value, (int, float)):
        return float(value)
    if isinstance(value, str):
        try:
            return float(value)
        except ValueError:
            return 0.0
    return 0.0


def format_time(value: Any) -> str:
    seconds = number(value)
    minutes = int(seconds // 60)
    remainder = seconds - minutes * 60
    return f"{minutes}:{remainder:05.2f}"


def markdown(payload: dict[str, Any]) -> str:
    status = stringify(payload.get("status"))
    if status != "selected_decision_review_trail":
        lines = [
            "# Selected Decision Review Trail",
            "",
            f"Status: `{status or 'unknown'}`",
            "",
            stringify(payload.get("truth") or "No selected decision trail is available."),
        ]
        next_action = stringify(payload.get("nextAction"))
        if next_action:
            lines.extend(["", f"Next action: {next_action}"])
        error = stringify(payload.get("error"))
        if error:
            lines.extend(["", f"Error: `{error}`"])
        return "\n".join(lines).rstrip() + "\n"

    selected = payload.get("selectedDecision") or {}
    summary = payload.get("workingSummary") or {}
    trail = payload.get("reviewTrail") or {}
    review_mode = payload.get("reviewMode") or {}
    cadence_guard = payload.get("cadenceGuard") or {}
    events = trail.get("structuredEvents") or []
    evidence = trail.get("reviewEvidence") or []
    notes = trail.get("humanAgentNotes") or []

    lines: list[str] = [
        "# Selected Decision Review Trail",
        "",
        "Read-only review memory for the selected SHOW/SKIP metadata decision. Source media stays untouched.",
        "",
        "## Selected decision",
        f"- Lane: {stringify(selected.get('laneName')) or 'unknown'}",
        f"- Type: {stringify(selected.get('tagType')) or 'unknown'}",
        f"- Time: {format_time(selected.get('start'))} for {number(selected.get('duration')):.2f}s",
        f"- Tag ID: `{stringify(selected.get('tagId')) or 'unknown'}`",
        "",
        "## Working summary",
        f"- Status: `{stringify(summary.get('intentStatus')) or 'unknown'}`",
        f"- Confidence: {number(summary.get('confidence')):.0%}",
        f"- Risk: `{stringify(summary.get('risk')) or 'unknown'}`",
        f"- Structured events: {int(number(summary.get('structuredRevisionCount')))}",
        f"- Latest actor: {stringify(summary.get('latestActor')) or 'none'} ({stringify(summary.get('latestActorType')) or 'unknown'})",
        f"- Latest action: {stringify(summary.get('latestAction')) or 'none'}",
        f"- Status transition: {stringify(summary.get('statusTransition')) or 'not recorded'}",
        f"- Training readiness: `{stringify(summary.get('trainingReadiness')) or 'unknown'}`",
        f"- Next safe action: {stringify(summary.get('nextSafeAction')) or 'Select, listen, and add a review note.'}",
        "",
        "## Review mode",
        f"- Label: {stringify(review_mode.get('label')) or 'none'}",
        f"- Reason: {stringify(review_mode.get('reason')) or 'No mode reason recorded.'}",
        f"- First action: {stringify(review_mode.get('firstAction')) or 'Listen at normal speed before trusting the cut.'}",
        "",
        "## Cadence guard",
        f"- {stringify(cadence_guard.get('title')) or 'Cadence check'}: {stringify(cadence_guard.get('detail')) or 'Listen for breath, pause, reaction, and human flow.'}",
        "",
        "## Recent structured events",
    ]

    if not events:
        lines.append("- No structured events yet. Mark Keep, Refine, Hold, or add a note before treating this decision as training-quality evidence.")
    else:
        for event in list(events)[-5:]:
            actor = stringify(event.get("actor")) or "Unknown"
            actor_type = stringify(event.get("actorType")) or "unknown"
            action = stringify(event.get("action")) or "noted"
            note = stringify(event.get("note")) or "No note recorded."
            previous = stringify(event.get("previousStatus")) or "new"
            next_status = stringify(event.get("nextStatus")) or "noted"
            lines.append(f"- {actor} ({actor_type}) `{action}`: {note} [{previous} -> {next_status}]")

    lines.extend(["", "## Evidence"])
    if evidence:
        for item in evidence[:8]:
            lines.append(f"- {stringify(item)}")
    else:
        lines.append("- No evidence lines recorded yet.")

    if notes:
        lines.extend(["", "## Human/agent notes"])
        for note in notes[-5:]:
            lines.append(f"- {stringify(note)}")

    lines.extend([
        "",
        "Truth: read-only selected-decision review trail. This does not approve, export, publish, trim, delete, or mutate source media.",
    ])
    return "\n".join(lines).rstrip() + "\n"


def main() -> int:
    parser = argparse.ArgumentParser(description="Render the current Quipsly Studio selected-decision review trail.")
    parser.add_argument("--base-url", default=DEFAULT_BASE_URL)
    parser.add_argument("--json", action="store_true", help="Print raw JSON payload.")
    parser.add_argument("--markdown", action="store_true", help="Print markdown. This is the default.")
    args = parser.parse_args()

    payload = fetch_json(args.base_url, "/selected_decision_review_trail")
    if args.json:
        print(json.dumps(payload, indent=2, sort_keys=True))
    else:
        sys.stdout.write(markdown(payload))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
