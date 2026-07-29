#!/usr/bin/env python3
"""Read-only Quipsly Studio review conductor.

This script gives humans and agents one compact "what next?" brief across the
current editor cockpit, selected cut, selected short, and session state. It is a
router for attention, not an editor: it never exports, publishes, approves,
mutates media, or changes edit metadata.
"""

from __future__ import annotations

import argparse
import json
import os
import sys
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime
from pathlib import Path
from typing import Any


DEFAULT_BASE_URL = os.environ.get("QUIPSLY_STUDIO_AGENT_URL", "http://127.0.0.1:8765")


def fetch_json(base_url: str, endpoint: str) -> tuple[dict[str, Any], str]:
    url = urllib.parse.urljoin(base_url.rstrip("/") + "/", endpoint.lstrip("/"))
    try:
        with urllib.request.urlopen(url, timeout=4) as response:
            payload = json.loads(response.read().decode("utf-8"))
            return payload if isinstance(payload, dict) else {"value": payload}, ""
    except urllib.error.HTTPError as error:
        return {}, f"{endpoint}: HTTP {error.code}"
    except Exception as error:  # noqa: BLE001 - diagnostic script.
        return {}, f"{endpoint}: {error}"


def dict_value(value: Any) -> dict[str, Any]:
    return value if isinstance(value, dict) else {}


def list_value(value: Any) -> list[Any]:
    return value if isinstance(value, list) else []


def text_value(value: Any, fallback: str = "") -> str:
    if value is None:
        return fallback
    text = str(value).strip()
    return text if text else fallback


def int_value(value: Any, fallback: int = 0) -> int:
    try:
        return int(value)
    except Exception:
        return fallback


def first_present(*values: Any, fallback: Any = None) -> Any:
    for value in values:
        if value not in (None, "", [], {}):
            return value
    return fallback


def selected_short_payload(short_quality: dict[str, Any], cockpit: dict[str, Any], state: dict[str, Any]) -> dict[str, Any]:
    selected = dict_value(first_present(
        short_quality.get("selectedShort"),
        short_quality.get("selectedShortClip"),
        cockpit.get("selectedShort"),
        cockpit.get("selectedShortClip"),
        state.get("selectedShort"),
        state.get("selectedShortClip"),
        fallback={},
    ))
    quality = dict_value(first_present(
        short_quality.get("selectedShortQuality"),
        short_quality.get("quality"),
        short_quality.get("brief"),
        cockpit.get("selectedShortQuality"),
        selected.get("creatorQuality"),
        fallback={},
    ))
    creative = dict_value(first_present(
        quality.get("creativeReadiness"),
        short_quality.get("creativeReadiness"),
        selected.get("creativeReadiness"),
        fallback={},
    ))
    return {
        "id": text_value(selected.get("id")),
        "title": text_value(first_present(selected.get("title"), selected.get("label"), selected.get("hookText"), fallback="No selected short")),
        "hook": text_value(first_present(selected.get("hookText"), selected.get("hook"), fallback="")),
        "reviewStatus": text_value(first_present(selected.get("reviewStatus"), quality.get("recommendedReviewStatus"), fallback="unknown")),
        "score": int_value(first_present(quality.get("score"), creative.get("score"), fallback=0)),
        "reviewClass": text_value(quality.get("reviewClass")),
        "reviewClassLabel": text_value(quality.get("reviewClassLabel")),
        "nextAction": text_value(first_present(
            quality.get("nextReviewAction"),
            creative.get("nextAction"),
            short_quality.get("nextAction"),
            fallback="Select or review a short; verify hook, turn, payoff, captions, crop, platform fit, and Cut Intelligence overlap.",
        )),
    }


def selected_decision_payload(decision: dict[str, Any], cockpit: dict[str, Any], state: dict[str, Any]) -> dict[str, Any]:
    selected = dict_value(first_present(
        decision,
        decision.get("selectedDecisionCutIntelligence"),
        decision.get("selectedDecision"),
        cockpit.get("selectedDecision"),
        cockpit.get("selectedDecisionCutIntelligence"),
        state.get("selectedDecision"),
        state.get("selectedDecisionCutIntelligence"),
        fallback={},
    ))
    status = text_value(selected.get("status"))
    if status == "no_selected_decision":
        selected = {}
    return {
        "laneName": text_value(first_present(selected.get("selectedLaneName"), selected.get("laneName"), fallback="No selected decision")),
        "tagType": text_value(first_present(selected.get("selectedTagType"), selected.get("tagType"), fallback="")),
        "intentStatus": text_value(first_present(selected.get("intentStatus"), selected.get("status"), fallback="unknown")),
        "hasStoredIntent": bool(selected.get("hasStoredIntent")),
        "risk": text_value(selected.get("risk"), "unknown"),
        "cutStyle": text_value(selected.get("cutStyle"), "unclassified"),
        "why": text_value(selected.get("whyThisCutExists"), ""),
        "nextAction": text_value(first_present(
            selected.get("nextReviewAction"),
            dict_value(selected.get("humanFlowRecommendation")).get("safeAction"),
            fallback="Select a decision, cue the boundary, compare Play Edit and Play Through, and record a review note.",
        )),
    }


def cut_rhythm_payload(cockpit: dict[str, Any]) -> dict[str, Any]:
    rhythm = dict_value(cockpit.get("cutRhythm"))
    counts = dict_value(rhythm.get("findingCounts"))
    first = dict_value(rhythm.get("firstFinding"))
    action = dict_value(first.get("reviewAction"))
    return {
        "status": text_value(rhythm.get("status"), "unknown"),
        "high": int_value(counts.get("high")),
        "medium": int_value(counts.get("medium")),
        "low": int_value(counts.get("low")),
        "total": int_value(counts.get("total")),
        "firstFocus": text_value(rhythm.get("firstFocus")),
        "firstFinding": text_value(first.get("title")),
        "firstAction": text_value(first_present(action.get("firstAction"), rhythm.get("firstFocus"), fallback="Run cut rhythm queue and listen at normal speed.")),
    }


def choose_focus(cockpit: dict[str, Any], rhythm: dict[str, Any], decision: dict[str, Any], short: dict[str, Any]) -> dict[str, Any]:
    recommended = dict_value(cockpit.get("recommendedFocus"))
    lane = text_value(recommended.get("lane"))
    if lane:
        return {
            "lane": lane,
            "label": text_value(recommended.get("label"), "Follow cockpit recommended focus"),
            "reason": text_value(recommended.get("reason"), "The editor cockpit identified this as the safest next review focus."),
            "firstAction": text_value(first_present(recommended.get("firstAction"), recommended.get("command"), fallback="Open the cockpit and follow the first safe action.")),
        }

    if int_value(rhythm.get("high")) > 0:
        return {
            "lane": "cut-rhythm",
            "label": "Review high-risk cut rhythm",
            "reason": "High-risk jump, cadence, or ambiguity findings exist. These need ears before more tightening.",
            "firstAction": text_value(rhythm.get("firstAction"), "Run cut rhythm start-here and listen at normal speed."),
        }

    if decision.get("laneName") != "No selected decision" and not decision.get("hasStoredIntent"):
        return {
            "lane": "selected-decision",
            "label": "Explain the selected decision",
            "reason": "The selected SHOW/SKIP span has no stored intent, which makes it weak training/review evidence.",
            "firstAction": "Add or apply intent metadata: why it exists, tradeoff, rhythm note, and next review action.",
        }

    if short.get("title") != "No selected short" and text_value(short.get("reviewClass")) not in ("", "ready_for_human_posting_review"):
        return {
            "lane": "selected-short",
            "label": "Improve selected short",
            "reason": text_value(short.get("reviewClassLabel"), "The selected short has unresolved quality or platform-readiness work."),
            "firstAction": text_value(short.get("nextAction")),
        }

    return {
        "lane": "normal-review",
        "label": "Do a normal-speed human-feel pass",
        "reason": "No urgent conductor signal was found. The next gain is a real listen/watch pass.",
        "firstAction": "Play through one boundary or one short at normal speed and record Keep, Refine, Hold, or needs-listen.",
    }


def build_workbench(base_url: str) -> dict[str, Any]:
    cockpit, cockpit_error = fetch_json(base_url, "/editor_review_cockpit")
    decision, decision_error = fetch_json(base_url, "/selected_decision_intent_evidence")
    short_quality, short_error = fetch_json(base_url, "/selected_short_quality")
    state, state_error = fetch_json(base_url, "/state")

    rhythm = cut_rhythm_payload(cockpit)
    selected_decision = selected_decision_payload(decision, cockpit, state)
    selected_short = selected_short_payload(short_quality, cockpit, state)
    focus = choose_focus(cockpit, rhythm, selected_decision, selected_short)

    return {
        "model": "quipsly-studio-review-conductor",
        "generatedAt": datetime.now().isoformat(timespec="seconds"),
        "baseUrl": base_url,
        "status": "ready" if not cockpit_error else "degraded",
        "recommendedFocus": focus,
        "cutRhythm": rhythm,
        "selectedDecision": selected_decision,
        "selectedShort": selected_short,
        "safeCommands": {
            "reviewCockpit": "GET /editor_review_cockpit",
            "decisionWorkbench": "script/decision-review-workbench",
            "shortsWorkbench": "script/shorts-review-workbench",
            "cutRhythmStartHere": "script/agentctl.sh cut-rhythm-start-here --markdown",
            "cutRhythmStatus": "script/agentctl.sh cut-rhythm-review-status --markdown",
            "selectDecisionAtPlayhead": "GET /select_decision?mode=at_playhead&scope=video",
        },
        "endpointWarnings": [error for error in [cockpit_error, decision_error, short_error, state_error] if error],
        "truth": "Read-only attention router. It does not export, publish, approve, mutate source media, or change edit decisions.",
    }


def render_markdown(workbench: dict[str, Any]) -> str:
    focus = dict_value(workbench.get("recommendedFocus"))
    rhythm = dict_value(workbench.get("cutRhythm"))
    decision = dict_value(workbench.get("selectedDecision"))
    short = dict_value(workbench.get("selectedShort"))

    lines = [
        "# Quipsly Studio review conductor",
        "",
        f"- Status: `{workbench.get('status', '')}`",
        f"- Focus lane: `{focus.get('lane', '')}`",
        f"- Focus: {focus.get('label', '')}",
        f"- Reason: {focus.get('reason', '')}",
        f"- First action: {focus.get('firstAction', '')}",
        "",
        "## Cut rhythm",
        f"- Status: `{rhythm.get('status', '')}`",
        f"- Findings: high={rhythm.get('high', 0)}, medium={rhythm.get('medium', 0)}, low={rhythm.get('low', 0)}, total={rhythm.get('total', 0)}",
        f"- First finding: {rhythm.get('firstFinding', '')}",
        f"- First action: {rhythm.get('firstAction', '')}",
        "",
        "## Selected decision",
        f"- Lane: {decision.get('laneName', '')}",
        f"- Type/style: `{decision.get('tagType', '')}` / `{decision.get('cutStyle', '')}`",
        f"- Intent: `{decision.get('intentStatus', '')}` stored={decision.get('hasStoredIntent', False)}",
        f"- Risk: `{decision.get('risk', '')}`",
        f"- Why: {decision.get('why', '') or 'needs plain-English reason'}",
        f"- Next: {decision.get('nextAction', '')}",
        "",
        "## Selected short",
        f"- Title: {short.get('title', '')}",
        f"- Hook: {short.get('hook', '') or 'missing'}",
        f"- Score: {short.get('score', 0)}",
        f"- Review: `{short.get('reviewStatus', '')}` / `{short.get('reviewClass', '')}` {short.get('reviewClassLabel', '')}",
        f"- Next: {short.get('nextAction', '')}",
        "",
    ]

    warnings = list_value(workbench.get("endpointWarnings"))
    if warnings:
        lines.extend(["## Endpoint warnings", ""])
        lines.extend(f"- {warning}" for warning in warnings)
        lines.append("")

    lines.extend(["## Safe commands", ""])
    for label, command in dict_value(workbench.get("safeCommands")).items():
        lines.append(f"- `{label}`: `{command}`")
    lines.extend(["", f"Truth: {workbench.get('truth', '')}"])
    return "\n".join(lines).strip() + "\n"


def save_workbench(workbench: dict[str, Any], markdown: str, output_root: str | None) -> Path:
    root = Path(output_root or "~/Movies/QuipslyExports/StudioReviewConductors").expanduser()
    root.mkdir(parents=True, exist_ok=True)
    stamp = datetime.now().strftime("%Y%m%d-%H%M%S")
    lane = text_value(dict_value(workbench.get("recommendedFocus")).get("lane"), "review-conductor")
    slug = "".join(char.lower() if char.isalnum() else "-" for char in lane).strip("-")
    slug = "-".join(part for part in slug.split("-") if part)[:80] or "review-conductor"
    folder = root / f"{stamp}-{slug}"
    folder.mkdir(parents=True, exist_ok=False)
    (folder / "studio-review-conductor.json").write_text(json.dumps(workbench, indent=2, sort_keys=True), encoding="utf-8")
    (folder / "studio-review-conductor.md").write_text(markdown, encoding="utf-8")
    return folder


def main() -> int:
    parser = argparse.ArgumentParser(description="Read-only Quipsly Studio review conductor.")
    parser.add_argument("--base-url", default=DEFAULT_BASE_URL)
    parser.add_argument("--json", action="store_true", help="Print JSON instead of Markdown.")
    parser.add_argument("--save", action="store_true", help="Save JSON and Markdown packet under QuipslyExports.")
    parser.add_argument("--output-root", default=None, help="Optional output root for --save.")
    args = parser.parse_args()

    workbench = build_workbench(args.base_url)
    markdown = render_markdown(workbench)
    if args.save:
        folder = save_workbench(workbench, markdown, args.output_root)
        workbench["savedTo"] = str(folder)
        markdown += f"\nSaved to: `{folder}`\n"

    if args.json:
        print(json.dumps(workbench, indent=2, sort_keys=True))
    else:
        print(markdown)
    return 0


if __name__ == "__main__":
    sys.exit(main())
