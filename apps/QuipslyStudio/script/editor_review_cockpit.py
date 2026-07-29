#!/usr/bin/env python3
"""Render a read-only Quipsly Studio review cockpit.

This helper gathers the compact editor-loop proof, selected-decision evidence,
and selected-short quality passport into one operator-facing summary. It exists
so humans and agents can decide what to inspect first without treating advice as
approval, export proof, publication, or source-media mutation.
"""

from __future__ import annotations

import argparse
import json
import os
import urllib.request
from typing import Any

from cut_rhythm_audit import make_audit as make_cut_rhythm_audit


def fetch_json(base_url: str, path: str) -> dict[str, Any]:
    url = base_url.rstrip("/") + path
    try:
        with urllib.request.urlopen(url, timeout=8) as response:
            return json.loads(response.read().decode("utf-8", errors="replace"))
    except Exception as exc:  # noqa: BLE001 - operator-facing helper.
        return {
            "status": "request_failed",
            "url": url,
            "error": str(exc),
            "truth": "Read-only request failed before any edit, export, publish, approval, or source-media mutation.",
        }


def dict_value(value: Any) -> dict[str, Any]:
    return value if isinstance(value, dict) else {}


def list_value(value: Any) -> list[Any]:
    return value if isinstance(value, list) else []


def string_value(value: Any, default: str = "") -> str:
    if value is None:
        return default
    if isinstance(value, str):
        return value
    return str(value)


def first_nonempty(*values: Any) -> str:
    for value in values:
        text = string_value(value).strip()
        if text:
            return text
    return ""


def status_line(payload: dict[str, Any]) -> str:
    status = string_value(payload.get("status"))
    if status == "request_failed":
        return f"request_failed: {payload.get('error', '')}"
    return status or "unknown"


def make_cockpit(base_url: str) -> dict[str, Any]:
    editor = fetch_json(base_url, "/editor_loop_proof")
    decision = fetch_json(base_url, "/selected_decision_intent_evidence")
    short = fetch_json(base_url, "/selected_short_quality")
    rhythm = make_cut_rhythm_audit(base_url)

    editor_decision = dict_value(dict_value(editor.get("decisionTruth")).get("selectedDecisionIntentEvidence"))
    if not editor_decision:
        editor_decision = dict_value(editor.get("selectedDecisionIntentEvidence"))

    decision_mode = dict_value(decision.get("recommendedReviewMode")) or dict_value(
        editor_decision.get("recommendedReviewMode")
    )
    short_mode = dict_value(short.get("recommendedReviewMode"))
    short_structure = dict_value(short.get("shortRecipeStructure"))
    short_joins = list_value(short.get("shortTransitionReview"))
    rhythm_counts = dict_value(rhythm.get("findingCounts"))
    rhythm_findings = list_value(rhythm.get("findings"))
    first_rhythm_finding = dict_value(rhythm_findings[0]) if rhythm_findings and isinstance(rhythm_findings[0], dict) else {}
    first_rhythm_action = dict_value(first_rhythm_finding.get("reviewAction"))

    recommended_focus: dict[str, Any]
    if decision_mode and decision_mode.get("mode") in {
        "preserve-air",
        "cadence-hold",
        "high-care",
        "split-timing",
    }:
        recommended_focus = {
            "lane": "long-form-decision",
            "mode": decision_mode.get("mode", ""),
            "label": decision_mode.get("label", ""),
            "firstAction": decision_mode.get("firstAction", ""),
            "reason": decision_mode.get("reason", ""),
        }
    elif (rhythm_counts.get("high", 0) or 0) > 0:
        recommended_focus = {
            "lane": "cut-rhythm",
            "mode": first_rhythm_action.get("mode", "rhythm-risk-pass"),
            "label": first_rhythm_action.get("label", first_rhythm_finding.get("title", "Review high-risk cut rhythm")),
            "firstAction": first_rhythm_action.get("firstAction", rhythm.get("firstFocus", "")),
            "reason": first_rhythm_finding.get("why", rhythm.get("firstFocus", "")),
        }
    elif short_mode:
        recommended_focus = {
            "lane": "selected-short",
            "mode": short_mode.get("mode", ""),
            "label": short_mode.get("label", ""),
            "firstAction": short_mode.get("firstAction", ""),
            "reason": short_mode.get("reason", ""),
        }
    elif decision_mode:
        recommended_focus = {
            "lane": "long-form-decision",
            "mode": decision_mode.get("mode", ""),
            "label": decision_mode.get("label", ""),
            "firstAction": decision_mode.get("firstAction", ""),
            "reason": decision_mode.get("reason", ""),
        }
    else:
        recommended_focus = {
            "lane": "session",
            "mode": "load-or-select",
            "label": "Load a session and select a decision or short",
            "firstAction": "Open Quipsly Studio, load a session, then select a SHOW/SKIP decision or short recipe.",
            "reason": "No selected review target exposed a recommendation yet.",
        }

    focus_mode = string_value(recommended_focus.get("mode"))
    focus_lane = string_value(recommended_focus.get("lane"))
    action_ladder = [
        {
            "step": 1,
            "label": "Inspect first",
            "action": recommended_focus.get("firstAction", "Open the relevant review target and inspect it before changing status."),
            "command": "script/agentctl.sh selected-decision-review-mode"
            if focus_lane == "long-form-decision"
            else (
                "script/agentctl.sh selected-short-review-mode"
                if focus_lane == "selected-short"
                else (
                    "script/agentctl.sh cut-rhythm-audit --markdown"
                    if focus_lane == "cut-rhythm"
                    else "script/agentctl.sh editor-loop-proof"
                )
            ),
        },
        {
            "step": 2,
            "label": "Capture evidence",
            "action": "Save a timestamped cockpit or focused brief before handing work to another human/agent.",
            "command": "script/agentctl.sh editor-review-cockpit-save",
        },
        {
            "step": 3,
            "label": "Change review status only after inspection",
            "action": "Use Listen, Refine, Keep, or Hold for decisions; Keep, Refine, or Reject for shorts. Do not treat guidance as approval.",
            "command": "script/agentctl.sh decision-listen Codex \"needs an ear pass\"",
        },
    ]
    if focus_lane == "selected-short":
        action_ladder[2]["command"] = 'script/agentctl.sh shorts-review-selected refine "needs hook, pacing, caption, framing, or cut-overlap refinement"'
    if focus_lane == "cut-rhythm":
        action_ladder[1]["command"] = "script/agentctl.sh cut-rhythm-audit-save"
        action_ladder[2]["command"] = first_rhythm_action.get(
            "statusCommand",
            'script/agentctl.sh decision-listen Codex "rhythm audit needs normal-speed review"',
        )

    do_not_do_yet = [
        "Do not publish, schedule, upload, or claim receipt-backed status from this cockpit.",
        "Do not overwrite existing exports or source media.",
        "Do not mark Keep just because a review mode exists; review mode is guidance, not approval.",
    ]
    if focus_mode in {"preserve-air", "cadence-hold"}:
        do_not_do_yet.append("Do not tighten or hide the span until a normal-speed listen proves the human beat is safe to remove or shape.")
    if focus_mode == "split-timing":
        do_not_do_yet.append("Do not adjust visual timing alone; listen to the J/L audio move around the boundary.")
    if focus_mode == "join-rhythm-pass":
        do_not_do_yet.append("Do not judge the short by hook copy until every internal segment join has been proofed.")
    if focus_lane == "cut-rhythm":
        do_not_do_yet.append("Do not auto-fix rhythm findings; they are places to listen, compare monitors, and make intent explicit.")

    return {
        "status": "editor_review_cockpit",
        "model": "quipslystudio-editor-review-cockpit",
        "baseUrl": base_url.rstrip("/"),
        "editorStatus": status_line(editor),
        "decisionStatus": status_line(decision),
        "shortStatus": status_line(short),
        "activeSessionName": first_nonempty(editor.get("activeSessionName"), editor.get("sequenceTitle")),
        "sharedPlayhead": dict_value(editor.get("sharedPlayhead")),
        "recommendedFocus": recommended_focus,
        "actionLadder": action_ladder,
        "doNotDoYet": do_not_do_yet,
        "selectedDecision": {
            "lane": first_nonempty(decision.get("selectedLaneName"), editor_decision.get("selectedLaneName")),
            "type": first_nonempty(decision.get("selectedTagType"), editor_decision.get("selectedTagType")),
            "start": decision.get("selectedTagStart", editor_decision.get("selectedTagStart", 0)),
            "duration": decision.get("selectedTagDuration", editor_decision.get("selectedTagDuration", 0)),
            "reviewMode": decision_mode,
            "nextReviewAction": first_nonempty(decision.get("nextReviewAction"), editor_decision.get("nextReviewAction")),
            "safeCommands": dict_value(decision.get("safeCommands")),
        },
        "selectedShort": {
            "id": short.get("selectedShortId", ""),
            "title": short.get("title", ""),
            "duration": short.get("recipeDuration", 0),
            "reviewMode": short_mode,
            "recipeStructure": short_structure,
            "joinCount": len(short_joins),
            "nextSafeAction": short.get("nextSafeAction", ""),
            "safeCommands": dict_value(short.get("safeCommands")),
        },
        "cutRhythm": {
            "status": rhythm.get("status", ""),
            "decisionCount": rhythm.get("decisionCount", 0),
            "findingCounts": rhythm_counts,
            "firstFocus": rhythm.get("firstFocus", ""),
            "firstFinding": first_rhythm_finding,
            "safeCommands": dict_value(rhythm.get("safeCommands")),
        },
        "safeCommands": {
            "editorLoopProof": "script/agentctl.sh editor-loop-proof",
            "cutRhythmAudit": "script/agentctl.sh cut-rhythm-audit --markdown",
            "cutRhythmAuditSave": "script/agentctl.sh cut-rhythm-audit-save",
            "cutRhythmQueue": "script/agentctl.sh cut-rhythm-review-queue high 10 --markdown",
            "cutRhythmQueueSave": "script/agentctl.sh cut-rhythm-review-queue-save",
            "cutRhythmPacket": "script/agentctl.sh cut-rhythm-review-packet",
            "cutRhythmPacketIndex": "script/agentctl.sh cut-rhythm-packet-index --markdown",
            "cutRhythmStartHere": "script/agentctl.sh cut-rhythm-start-here --markdown",
            "cutRhythmWorkbench": "script/agentctl.sh cut-rhythm-review-workbench --markdown",
            "cutRhythmStatus": "script/agentctl.sh cut-rhythm-review-status --markdown",
            "decisionReviewMode": "script/agentctl.sh selected-decision-review-mode",
            "decisionBrief": "script/agentctl.sh decision-review-brief --markdown",
            "shortReviewMode": "script/agentctl.sh selected-short-review-mode",
            "shortBrief": "script/agentctl.sh selected-short-review-brief --markdown",
        },
        "truth": "Read-only review cockpit. It does not approve, export, publish, trim, delete, or mutate source media.",
    }


def render_markdown(cockpit: dict[str, Any]) -> str:
    focus = dict_value(cockpit.get("recommendedFocus"))
    decision = dict_value(cockpit.get("selectedDecision"))
    decision_mode = dict_value(decision.get("reviewMode"))
    short = dict_value(cockpit.get("selectedShort"))
    short_mode = dict_value(short.get("reviewMode"))
    short_structure = dict_value(short.get("recipeStructure"))
    rhythm = dict_value(cockpit.get("cutRhythm"))
    rhythm_counts = dict_value(rhythm.get("findingCounts"))
    rhythm_first = dict_value(rhythm.get("firstFinding"))
    rhythm_action = dict_value(rhythm_first.get("reviewAction"))
    shared_playhead = dict_value(cockpit.get("sharedPlayhead"))
    safe_commands = dict_value(cockpit.get("safeCommands"))
    action_ladder = list_value(cockpit.get("actionLadder"))
    do_not_do_yet = list_value(cockpit.get("doNotDoYet"))

    lines = [
        "# Quipsly Studio Review Cockpit",
        "",
        f"- Status: `{cockpit.get('status', '')}`",
        f"- Base URL: `{cockpit.get('baseUrl', '')}`",
        f"- Truth: {cockpit.get('truth', '')}",
        f"- Editor status: `{cockpit.get('editorStatus', '')}`",
        f"- Decision status: `{cockpit.get('decisionStatus', '')}`",
        f"- Short status: `{cockpit.get('shortStatus', '')}`",
        f"- Active session: {cockpit.get('activeSessionName', '')}",
        f"- Shared playhead: {shared_playhead.get('sequenceTime', '')} ({shared_playhead.get('playbackMode', '')})",
        "",
        "## Start here",
        "",
        f"- Lane: `{focus.get('lane', '')}`",
        f"- Mode: `{focus.get('mode', '')}`",
        f"- Label: {focus.get('label', '')}",
        f"- Reason: {focus.get('reason', '')}",
        f"- First action: {focus.get('firstAction', '')}",
    ]

    if action_ladder:
        lines.extend(["", "## Action ladder", ""])
        for item in action_ladder:
            if not isinstance(item, dict):
                continue
            lines.append(f"{item.get('step', '')}. **{item.get('label', '')}**: {item.get('action', '')}")
            if item.get("command"):
                lines.append(f"   - Command: `{item.get('command')}`")

    if do_not_do_yet:
        lines.extend(["", "## Do not do yet", ""])
        lines.extend(f"- {item}" for item in do_not_do_yet)

    lines.extend([
        "",
        "## Selected decision",
        "",
        f"- Lane: {decision.get('lane', '')}",
        f"- Type: {decision.get('type', '')}",
        f"- Start: {decision.get('start', 0)}",
        f"- Duration: {decision.get('duration', 0)}",
        f"- Review mode: `{decision_mode.get('mode', '')}`",
        f"- First action: {decision_mode.get('firstAction', '')}",
        f"- Next review action: {decision.get('nextReviewAction', '')}",
        "",
        "## Selected short",
        "",
        f"- ID: `{short.get('id', '')}`",
        f"- Title: {short.get('title', '')}",
        f"- Duration: {short.get('duration', 0)}",
        f"- Review mode: `{short_mode.get('mode', '')}`",
        f"- First action: {short_mode.get('firstAction', '')}",
        f"- Structure: {short_structure.get('structure', '')}",
        f"- Segment count: {short_structure.get('segmentCount', 0)}",
        f"- Join count: {short.get('joinCount', 0)}",
        f"- Next safe action: {short.get('nextSafeAction', '')}",
        "",
        "## Cut rhythm audit",
        "",
        f"- Status: `{rhythm.get('status', '')}`",
        f"- Decisions inspected: {rhythm.get('decisionCount', 0)}",
        f"- Findings: high={rhythm_counts.get('high', 0)}, medium={rhythm_counts.get('medium', 0)}, low={rhythm_counts.get('low', 0)}, total={rhythm_counts.get('total', 0)}",
        f"- First focus: {rhythm.get('firstFocus', '')}",
        f"- First finding: {rhythm_first.get('title', '')}",
        f"- Review mode: `{rhythm_action.get('mode', '')}`",
        f"- First action: {rhythm_action.get('firstAction', '')}",
    ])

    if safe_commands:
        lines.extend(["", "## Safe next commands", ""])
        for key, value in safe_commands.items():
            lines.append(f"- {key}: `{value}`")

    lines.append("")
    return "\n".join(lines)


def main() -> int:
    parser = argparse.ArgumentParser(description="Create a read-only Quipsly Studio review cockpit.")
    parser.add_argument("--base-url", default=os.environ.get("QUIPSLY_AGENT_BASE_URL", "http://127.0.0.1:8080"))
    parser.add_argument("--json", action="store_true", help="Print JSON instead of Markdown.")
    parser.add_argument("--markdown", action="store_true", help="Print Markdown. Default.")
    args = parser.parse_args()

    cockpit = make_cockpit(args.base_url)
    if args.json:
        print(json.dumps(cockpit, indent=2, sort_keys=True))
    else:
        print(render_markdown(cockpit))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
