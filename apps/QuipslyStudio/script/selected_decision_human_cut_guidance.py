#!/usr/bin/env python3
"""Focused selected-decision human cut guidance.

This is the small "what am I listening for?" card for the currently selected
SHOW/SKIP decision. It reads Quipsly Studio's selected decision evidence and
renders the human cadence guidance without editing, exporting, publishing, or
touching source media.
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
    url = base_url.rstrip("/") + path
    with urllib.request.urlopen(url, timeout=3.0) as response:
        payload = json.loads(response.read().decode("utf-8"))
    if not isinstance(payload, dict):
        raise ValueError(f"{path} did not return a JSON object")
    return payload


def dict_value(value: Any) -> dict[str, Any]:
    return value if isinstance(value, dict) else {}


def list_value(value: Any) -> list[Any]:
    return value if isinstance(value, list) else []


def text_value(value: Any, fallback: str = "") -> str:
    if value is None:
        return fallback
    text = str(value).strip()
    return text if text else fallback


def derived_guidance_from_evidence(evidence: dict[str, Any]) -> dict[str, Any]:
    guidance = dict_value(evidence.get("humanCutGuidance"))
    if guidance:
        return guidance

    flow = dict_value(evidence.get("humanFlowRecommendation"))
    cadence = dict_value(evidence.get("cadenceGuard"))
    preserve = dict_value(evidence.get("preserveAirProtocol"))
    technique = dict_value(evidence.get("techniqueGuidance"))
    split = dict_value(evidence.get("splitEditRecommendation"))

    dont_cut = list_value(preserve.get("doNot"))
    listen_for = list_value(preserve.get("listenFor"))
    if listen_for:
        dont_cut.extend(f"Presence of {item} may mean this air is useful." for item in listen_for[:4])

    tighten: list[Any] = []
    best_use = text_value(technique.get("bestUse"))
    if best_use:
        tighten.append(best_use)
    timing = text_value(split.get("timingIntent"))
    if timing:
        tighten.append(timing)
    if not tighten:
        tighten.extend(
            [
                "The span is truly dead air, reset noise, or repeated setup.",
                "The listener gets the same meaning faster without losing warmth.",
                "A source switch or reaction cover makes the seam feel intentional."
            ]
        )

    edit_read = text_value(
        flow.get("technique"),
        text_value(cadence.get("riskLevel"), "normal-human-proof"),
    )
    primary_question = text_value(
        flow.get("reviewQuestion"),
        text_value(
            cadence.get("detail"),
            "Does the boundary feel like a person edited it after listening at normal speed?",
        ),
    )
    return {
        "editRead": edit_read,
        "primaryQuestion": primary_question,
        "proofInstruction": "Listen at normal speed before marking Keep, Refine, or Hold. Scrubbing proves timing; normal playback proves humanity.",
        "shouldNotCutIf": dont_cut[:8],
        "shouldTightenIf": tighten[:6],
        "signals": {
            "preserveAir": bool(cadence.get("preserveAir")),
            "cadenceRisk": text_value(cadence.get("riskLevel")),
            "technique": edit_read,
            "hasReviewEvidence": bool(list_value(evidence.get("reviewEvidence"))),
            "hasStructuredRevision": bool(dict_value(evidence.get("reviewTrailSummary")).get("hasStructuredTrail")),
        },
        "agentRule": text_value(
            evidence.get("agentTechniqueRule"),
            text_value(flow.get("agentInstruction"), "Optimize for listener trust, clarity, energy, and human cadence."),
        ),
        "reviewerLanguage": "Keep if it feels natural. Refine if timing or cover feels off. Hold if the removed air may carry meaning.",
    }


def build_payload(base_url: str) -> dict[str, Any]:
    try:
        focused = fetch_json(base_url, "/selected_decision_human_cut_guidance")
        if (
            focused.get("model") == "quipslystudio-selected-decision-human-cut-guidance"
            and dict_value(focused.get("humanCutGuidance"))
        ):
            focused["source"] = "app-native-selected-decision-human-cut-guidance"
            return focused
    except (OSError, urllib.error.URLError, json.JSONDecodeError, ValueError):
        pass

    evidence = fetch_json(base_url, "/selected_decision_intent_evidence")
    guidance = derived_guidance_from_evidence(evidence)
    selected = {
        "tagId": evidence.get("selectedTagId", ""),
        "laneName": evidence.get("selectedLaneName", ""),
        "tagType": evidence.get("selectedTagType", ""),
        "intentStatus": evidence.get("intentStatus", ""),
        "risk": evidence.get("risk", ""),
        "confidence": evidence.get("confidence", 0),
        "cutStyle": evidence.get("cutStyle", ""),
        "coverStrategy": evidence.get("coverStrategy", ""),
        "cadenceMode": evidence.get("cadenceMode", ""),
    }
    status = "ready" if guidance else "needs-selected-decision"
    next_action = text_value(
        guidance.get("primaryQuestion"),
        "Select a SHOW/SKIP decision, then listen at normal speed before changing metadata.",
    )
    return {
        "ok": bool(guidance),
        "status": status,
        "model": "quipsly-selected-decision-human-cut-guidance",
        "version": "2026-06-30.selected-decision-human-cut-guidance.v1",
        "source": "selected-decision-intent-evidence-derived-guidance",
        "baseUrl": base_url,
        "selectedDecision": selected,
        "humanCutGuidance": guidance,
        "nextAction": next_action,
        "safeCommands": {
            "stateContract": "script/agentctl.sh selected-decision-state-contract-check --markdown",
            "productionBrief": "script/agentctl.sh selected-decision-production-brief --markdown",
            "markListen": 'script/agentctl.sh decision-record-review needs-listen "proof-listen before changing this boundary"',
            "markRefine": 'script/agentctl.sh decision-record-review refine "human-cut guidance suggests timing or cover refinement"',
            "markHold": 'script/agentctl.sh decision-record-review hold "human cadence may carry meaning here"',
        },
        "truth": "Read-only human cut guidance. It does not approve, edit, export, publish, relink, or mutate source media.",
    }


def render_markdown(payload: dict[str, Any]) -> str:
    selected = dict_value(payload.get("selectedDecision"))
    guidance = dict_value(payload.get("humanCutGuidance"))
    lines = [
        "# Selected decision human cut guidance",
        "",
        f"- Status: `{payload.get('status', '')}`",
        f"- Lane: {selected.get('laneName') or 'none selected'}",
        f"- Decision: `{selected.get('tagType', '')}` / `{selected.get('cutStyle', '')}`",
        f"- Intent: `{selected.get('intentStatus', '')}` risk=`{selected.get('risk', '')}` confidence={selected.get('confidence', 0)}",
        f"- Edit read: `{guidance.get('editRead', 'unknown')}`",
        "",
        "## Primary question",
        text_value(guidance.get("primaryQuestion"), text_value(payload.get("nextAction"))),
        "",
        "## Proof instruction",
        text_value(guidance.get("proofInstruction"), "Listen at normal speed before marking Keep, Refine, or Hold."),
        "",
        "## Do not cut if",
    ]
    dont_cut = list_value(guidance.get("shouldNotCutIf"))
    if dont_cut:
        lines.extend(f"- {item}" for item in dont_cut[:6])
    else:
        lines.append("- no guidance reported")

    lines.extend(["", "## Tighten if"])
    tighten = list_value(guidance.get("shouldTightenIf"))
    if tighten:
        lines.extend(f"- {item}" for item in tighten[:6])
    else:
        lines.append("- no guidance reported")

    signals = dict_value(guidance.get("signals"))
    if signals:
        lines.extend(["", "## Signals"])
        for key in sorted(signals):
            lines.append(f"- `{key}`: `{signals[key]}`")

    lines.extend([
        "",
        "## Agent rule",
        text_value(guidance.get("agentRule"), "Optimize for listener trust, clarity, energy, and human cadence."),
        "",
        "## Safe commands",
    ])
    for label, command in dict_value(payload.get("safeCommands")).items():
        lines.append(f"- `{label}`: `{command}`")
    lines.extend(["", f"Truth: {payload.get('truth', '')}"])
    return "\n".join(lines).strip() + "\n"


def main(argv: list[str]) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--base-url", default=DEFAULT_BASE_URL)
    parser.add_argument("--markdown", action="store_true")
    parser.add_argument("--json", action="store_true")
    args = parser.parse_args(argv)

    try:
        payload = build_payload(args.base_url)
    except (OSError, urllib.error.URLError, json.JSONDecodeError, ValueError) as exc:
        payload = {
            "ok": False,
            "status": "unavailable",
            "error": f"Could not read selected-decision human cut guidance: {exc}",
            "nextAction": "Launch Quipsly Studio, select a decision, then rerun selected-decision-human-cut-guidance.",
            "truth": "Diagnostic failure only; no source media or edit metadata changed.",
        }
        print(json.dumps(payload, indent=2, sort_keys=True))
        return 1

    if args.markdown or not args.json:
        print(render_markdown(payload), end="")
    else:
        print(json.dumps(payload, indent=2, sort_keys=True))
    return 0 if payload.get("ok") else 1


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
