#!/usr/bin/env python3
"""Build a read-only cut-review brief from the running Quipsly Studio agent API.

This helper is intentionally conservative: it queries only read-only endpoints
and prints a compact brief that helps an agent or human review one suggested
cut without treating recipe planning as export or publication proof.
"""

from __future__ import annotations

import argparse
import json
import sys
import urllib.parse
import urllib.request
from typing import Any


def fetch_json(base_url: str, path: str) -> dict[str, Any]:
    url = base_url.rstrip("/") + path
    try:
        with urllib.request.urlopen(url, timeout=8) as response:
            return json.loads(response.read().decode("utf-8", errors="replace"))
    except Exception as exc:  # noqa: BLE001 - operator-facing diagnostic helper.
        return {
            "status": "request_failed",
            "url": url,
            "error": str(exc),
            "truth": "Read-only request failed before any edit, export, publish, or source-media mutation.",
        }


def string_value(value: Any, default: str = "") -> str:
    if value is None:
        return default
    if isinstance(value, str):
        return value
    return str(value)


def list_value(value: Any) -> list[Any]:
    return value if isinstance(value, list) else []


def dict_value(value: Any) -> dict[str, Any]:
    return value if isinstance(value, dict) else {}


def make_brief(base_url: str, mode: str) -> dict[str, Any]:
    encoded_mode = urllib.parse.quote(mode or "any")
    craft = fetch_json(base_url, "/cut_craft_guidance")
    playbook = fetch_json(base_url, "/cut_technique_playbook")
    next_recipe = fetch_json(base_url, f"/cut_recipe_next?mode={encoded_mode}")
    selected = fetch_json(base_url, "/selected_decision_intent_evidence")

    recipe_checklist = list_value(next_recipe.get("humanReviewChecklist"))
    selected_checklist = list_value(selected.get("humanReviewChecklist"))
    next_recipe_safe = dict_value(next_recipe.get("safeCommands"))
    selected_safe = dict_value(selected.get("safeCommands"))

    next_safe_action = (
        string_value(next_recipe_safe.get("cueBoundary"))
        or string_value(selected_safe.get("selectAtPlayhead"))
        or string_value(selected_safe.get("markListen"))
        or "Open Quipsly Studio, select a decision, then rerun this brief."
    )

    return {
        "status": "cut_review_brief",
        "model": "quipslystudio-cut-review-brief",
        "baseUrl": base_url.rstrip("/"),
        "mode": mode or "any",
        "craft": {
            "status": craft.get("status", ""),
            "sequenceTitle": craft.get("sequenceTitle", ""),
            "cadenceMode": craft.get("cadenceMode", ""),
            "humanFlowStance": craft.get("humanFlowStance", ""),
            "nextFocus": craft.get("nextFocus", ""),
            "counts": craft.get("counts", {}),
            "warnings": craft.get("craftWarnings", []),
        },
        "nextRecipe": {
            "status": next_recipe.get("status", ""),
            "id": next_recipe.get("recipeId") or next_recipe.get("id", ""),
            "label": next_recipe.get("label", ""),
            "sequenceTime": next_recipe.get("sequenceTime", 0),
            "targetLaneName": next_recipe.get("targetLaneName", ""),
            "recommendedTechnique": next_recipe.get("recommendedTechnique", ""),
            "reviewPriority": next_recipe.get("reviewPriority", 0),
            "tradeoff": next_recipe.get("techniqueTradeoffExplanation", ""),
            "reviewQuestion": next_recipe.get("techniqueReviewQuestion", ""),
            "agentRule": next_recipe.get("agentTechniqueRule", ""),
            "preservationWarning": next_recipe.get("preservationWarning", ""),
            "checklist": recipe_checklist,
            "safeCommands": next_recipe_safe,
        },
        "selectedDecision": {
            "status": selected.get("status", ""),
            "selectedLaneName": selected.get("selectedLaneName", ""),
            "selectedTagType": selected.get("selectedTagType", ""),
            "selectedTagStart": selected.get("selectedTagStart", 0),
            "selectedTagDuration": selected.get("selectedTagDuration", 0),
            "cutStyle": selected.get("cutStyle", ""),
            "coverStrategy": selected.get("coverStrategy", ""),
            "reviewQuestion": selected.get("techniqueReviewQuestion", ""),
            "agentRule": selected.get("agentTechniqueRule", ""),
            "preservationWarning": selected.get("preservationWarning", ""),
            "checklist": selected_checklist,
            "safeCommands": selected_safe,
        },
        "techniquePlaybook": {
            "status": playbook.get("status", ""),
            "techniqueCount": len(list_value(playbook.get("techniques"))),
            "techniques": [
                {
                    "id": technique.get("id", ""),
                    "title": technique.get("title", ""),
                    "reviewQuestion": technique.get("reviewQuestion", ""),
                    "agentRule": technique.get("agentRule", ""),
                }
                for technique in list_value(playbook.get("techniques"))
                if isinstance(technique, dict)
            ],
        },
        "nextSafeAction": next_safe_action,
        "truth": "Read-only cut review brief. It does not approve, apply, export, publish, trim, delete, or mutate source media.",
    }


def render_markdown(brief: dict[str, Any]) -> str:
    craft = dict_value(brief.get("craft"))
    recipe = dict_value(brief.get("nextRecipe"))
    selected = dict_value(brief.get("selectedDecision"))
    playbook = dict_value(brief.get("techniquePlaybook"))
    craft_counts = dict_value(craft.get("counts"))

    lines: list[str] = [
        "# Quipsly Cut Review Brief",
        "",
        f"- Mode: `{brief.get('mode', 'any')}`",
        f"- Base URL: `{brief.get('baseUrl', '')}`",
        f"- Truth: {brief.get('truth', '')}",
        "",
        "## Craft stance",
        "",
        f"- Status: `{craft.get('status', '')}`",
        f"- Sequence: {craft.get('sequenceTitle', '')}",
        f"- Cadence lens: {craft.get('cadenceMode', '')}",
        f"- Human-flow stance: {craft.get('humanFlowStance', '')}",
        f"- Next focus: {craft.get('nextFocus', '')}",
        f"- Preservation-risk cuts: {craft_counts.get('preservationReviewCount', 0)}",
        f"- Pause-review cuts: {craft_counts.get('pauseReviewCount', 0)}",
        f"- Cover-needed cuts: {craft_counts.get('coverNeededCount', 0)}",
    ]

    warnings = list_value(craft.get("warnings"))
    if warnings:
        lines.extend(["", "Warnings:"])
        lines.extend(f"- {warning}" for warning in warnings)

    lines.extend([
        "",
        "## Next recipe to review",
        "",
        f"- Status: `{recipe.get('status', '')}`",
        f"- ID: `{recipe.get('id', '')}`",
        f"- Label: {recipe.get('label', '')}",
        f"- Time: {recipe.get('sequenceTime', 0)}",
        f"- Lane: {recipe.get('targetLaneName', '')}",
        f"- Technique: {recipe.get('recommendedTechnique', '')}",
        f"- Priority: {recipe.get('reviewPriority', 0)}",
        f"- Tradeoff: {recipe.get('tradeoff', '')}",
        f"- Review question: {recipe.get('reviewQuestion', '')}",
        f"- Codex rule: {recipe.get('agentRule', '')}",
        f"- Preservation warning: {recipe.get('preservationWarning', '')}",
        "",
        "Checklist:",
    ])
    checklist = list_value(recipe.get("checklist"))
    lines.extend(f"- {item}" for item in (checklist or ["Cue and listen before changing metadata."]))

    lines.extend([
        "",
        "## Selected decision",
        "",
        f"- Status: `{selected.get('status', '')}`",
        f"- Lane: {selected.get('selectedLaneName', '')}",
        f"- Type: {selected.get('selectedTagType', '')}",
        f"- Start: {selected.get('selectedTagStart', 0)}",
        f"- Duration: {selected.get('selectedTagDuration', 0)}",
        f"- Cut style: {selected.get('cutStyle', '')}",
        f"- Cover strategy: {selected.get('coverStrategy', '')}",
        f"- Review question: {selected.get('reviewQuestion', '')}",
        f"- Codex rule: {selected.get('agentRule', '')}",
        f"- Preservation warning: {selected.get('preservationWarning', '')}",
        "",
        "Selected checklist:",
    ])
    selected_checklist = list_value(selected.get("checklist"))
    lines.extend(f"- {item}" for item in (selected_checklist or ["Select a decision before reviewing selected-boundary evidence."]))

    lines.extend([
        "",
        "## Technique playbook",
        "",
        f"- Status: `{playbook.get('status', '')}`",
        f"- Technique count: {playbook.get('techniqueCount', 0)}",
    ])
    for technique in list_value(playbook.get("techniques")):
        if not isinstance(technique, dict):
            continue
        lines.extend([
            "",
            f"### {technique.get('title', technique.get('id', 'Technique'))}",
            f"- Review question: {technique.get('reviewQuestion', '')}",
            f"- Codex rule: {technique.get('agentRule', '')}",
        ])

    lines.extend([
        "",
        "## Next safe action",
        "",
        f"`{brief.get('nextSafeAction', '')}`",
        "",
    ])
    return "\n".join(lines)


def main() -> int:
    parser = argparse.ArgumentParser(description="Create a read-only cut review brief from Quipsly Studio.")
    parser.add_argument("--base-url", default="http://127.0.0.1:8080")
    parser.add_argument("--mode", default="any")
    parser.add_argument("--json", action="store_true", help="Print JSON instead of Markdown.")
    parser.add_argument("--markdown", action="store_true", help="Print Markdown. Default.")
    args = parser.parse_args()

    brief = make_brief(args.base_url, args.mode)
    if args.json:
        print(json.dumps(brief, indent=2, sort_keys=True))
    else:
        print(render_markdown(brief))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
