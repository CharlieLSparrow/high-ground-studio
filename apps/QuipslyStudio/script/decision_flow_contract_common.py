#!/usr/bin/env python3
"""Shared selected-decision edit-flow contract helpers for Quipsly Studio."""

from __future__ import annotations

from typing import Any


GENERIC_REASON = "no plain-english reason is attached yet."
GENERIC_TRADEOFF = "no tradeoff note is attached yet."
GENERIC_NEXT_ACTION = (
    "cue the boundary, compare play edit and play through, then mark keep, refine, hold, or needs-listen with a note."
)


def dict_value(value: Any) -> dict[str, Any]:
    return value if isinstance(value, dict) else {}


def list_value(value: Any) -> list[Any]:
    return value if isinstance(value, list) else []


def text_value(value: Any) -> str:
    return str(value or "").strip()


def float_value(value: Any, fallback: float = 0.0) -> float:
    try:
        return float(value)
    except Exception:
        return fallback


def contains_any(text: str, needles: list[str]) -> bool:
    lowered = text.lower()
    return any(needle in lowered for needle in needles)


def meaningful_text(value: Any, generic: str = "") -> bool:
    text = text_value(value).lower()
    if not text:
        return False
    return text != generic.lower()


def selected_decision(workbench: dict[str, Any]) -> dict[str, Any]:
    return dict_value(workbench.get("selectedDecision"))


def selected_boundary(workbench: dict[str, Any]) -> dict[str, Any]:
    return dict_value(selected_decision(workbench).get("boundary"))


def check_item(check_id: str, ready: bool, explanation: str, *, risk: str = "low") -> dict[str, Any]:
    return {
        "id": check_id,
        "ready": bool(ready),
        "risk": risk,
        "explanation": explanation,
    }


def build_decision_flow_contract(workbench: dict[str, Any], *, source: str = "selected-decision-workbench") -> dict[str, Any]:
    """Build conservative edit-flow guidance from selected-decision evidence.

    This contract is intentionally advisory. It should help a human or agent know
    what to listen/watch for before changing a cut, not claim the cut is correct.
    """
    workbench = dict_value(workbench)
    decision = selected_decision(workbench)
    boundary = selected_boundary(workbench)
    cadence = dict_value(workbench.get("cadenceGuard"))
    human_flow = dict_value(workbench.get("humanFlowRecommendation"))
    split = dict_value(workbench.get("splitEditRecommendation"))
    preserve_air = dict_value(workbench.get("preserveAirProtocol"))
    technique = dict_value(workbench.get("techniqueGuidance"))
    verdict = dict_value(workbench.get("verdict"))
    review_evidence = list_value(workbench.get("reviewEvidence"))
    checklist = list_value(workbench.get("humanReviewChecklist"))
    notes = list_value(workbench.get("humanAgentNotes"))
    ledger = list_value(workbench.get("revisionLedger"))

    duration = float_value(boundary.get("duration"))
    tag_type = text_value(decision.get("tagType")).lower()
    risk = text_value(decision.get("risk")).lower()
    cut_style = text_value(decision.get("cutStyle")).lower()
    cover_strategy = text_value(decision.get("coverStrategy")).lower()
    cadence_mode = text_value(decision.get("cadenceMode")).lower()
    why = text_value(workbench.get("why"))
    tradeoff = text_value(workbench.get("tradeoff"))
    next_action = text_value(workbench.get("nextReviewAction"))

    flow_text = " ".join(
        text_value(value)
        for value in [
            tag_type,
            risk,
            cut_style,
            cover_strategy,
            cadence_mode,
            why,
            tradeoff,
            next_action,
            cadence.get("title"),
            cadence.get("detail"),
            cadence.get("preserveAir"),
            human_flow.get("technique"),
            human_flow.get("reason"),
            human_flow.get("audioMove"),
            human_flow.get("visualMove"),
            split.get("technique"),
            split.get("timingIntent"),
            split.get("audioTreatment"),
            split.get("visualTreatment"),
            preserve_air.get("stance"),
            preserve_air.get("safeAction"),
            technique.get("title"),
            verdict.get("title"),
            verdict.get("detail"),
        ]
    ).lower()

    has_selected_decision = bool(decision) and workbench.get("status") == "ready"
    has_boundary = duration > 0
    has_intent = meaningful_text(why, GENERIC_REASON) or meaningful_text(tradeoff, GENERIC_TRADEOFF)
    has_cadence_guard = bool(cadence) or bool(preserve_air) or contains_any(flow_text, [
        "breath",
        "pause",
        "cadence",
        "laughter",
        "hesitation",
        "preserve air",
        "do not optimize away",
    ])
    has_split_awareness = bool(split) or contains_any(flow_text, [
        "j-cut",
        "l-cut",
        "split edit",
        "lead audio",
        "trail audio",
        "audio move",
    ])
    jump_risk_signaled = contains_any(flow_text, ["jump", "abrupt", "harsh", "same speaker", "hard cut"])
    has_jump_handling = (not jump_risk_signaled) or contains_any(flow_text, [
        "reaction",
        "cover",
        "b-roll",
        "source",
        "hold",
        "needs-listen",
        "refine",
    ])
    needs_reaction_cover = contains_any(flow_text, ["reaction", "same speaker", "jump"])
    has_reaction_cover = (not needs_reaction_cover) or contains_any(flow_text, [
        "reaction",
        "cover",
        "b-roll",
        "homer",
        "charlie",
        "both",
    ])
    has_review_path = meaningful_text(next_action, GENERIC_NEXT_ACTION) or bool(checklist) or bool(notes) or bool(ledger)

    checks = [
        check_item(
            "selectedDecision",
            has_selected_decision,
            "A SHOW/SKIP/source decision is selected." if has_selected_decision else "Select a SHOW/SKIP/source decision before judging flow.",
            risk="high",
        ),
        check_item(
            "knownBoundary",
            has_boundary,
            f"Decision duration is {duration:.2f}s." if has_boundary else "Decision needs a known start/end/duration before review.",
            risk="high",
        ),
        check_item(
            "plainEnglishIntent",
            has_intent,
            "Decision has a plain-English reason or tradeoff." if has_intent else "Add why this cut exists and what tradeoff it makes.",
            risk="medium",
        ),
        check_item(
            "cadenceProtected",
            has_cadence_guard,
            "Cadence/breath/pause preservation is represented." if has_cadence_guard else "Listen for clipped breaths, laughter, hesitation, and useful silence before tightening.",
            risk="medium",
        ),
        check_item(
            "splitEditConsidered",
            has_split_awareness,
            "J/L/split-edit awareness is represented." if has_split_awareness else "Consider whether the audio should lead or trail the visual cut.",
            risk="medium",
        ),
        check_item(
            "jumpCutHandled",
            has_jump_handling,
            "No jump risk is signaled, or a cover/hold/refine path exists." if has_jump_handling else "Same-speaker or abrupt cut risk needs reaction cover, b-roll, hold, or refine guidance.",
            risk="high",
        ),
        check_item(
            "reactionCoverConsidered",
            has_reaction_cover,
            "Reaction/cover need is satisfied or not signaled." if has_reaction_cover else "If the cut jumps on one speaker, consider a reaction, b-roll, or source cover.",
            risk="medium",
        ),
        check_item(
            "humanReviewPath",
            has_review_path,
            "There is a next review path or review ledger." if has_review_path else "Add a review note/status so the next human or agent knows what to check.",
            risk="medium",
        ),
    ]

    ready_count = sum(1 for check in checks if check["ready"])
    high_risk_missing = [check for check in checks if not check["ready"] and check["risk"] == "high"]
    medium_missing = [check for check in checks if not check["ready"] and check["risk"] == "medium"]
    if high_risk_missing:
        label = "decision-flow-blocked"
    elif medium_missing:
        label = "decision-flow-needs-ear-pass"
    elif ready_count == len(checks):
        label = "decision-flow-ready"
    else:
        label = "decision-flow-needs-review"

    first_missing = next((check for check in checks if not check["ready"]), None)
    safe_action = (
        text_value(first_missing["explanation"])
        if first_missing
        else "Cue the boundary, compare Play Edit and Play Through, then record Keep/Refine/Hold with a note."
    )

    return {
        "model": "quipsly-selected-decision-edit-flow-contract",
        "version": "2026-06-30.decision-flow-contract.v1",
        "source": source,
        "label": label,
        "readyCount": ready_count,
        "totalCount": len(checks),
        "safeAction": safe_action,
        "checks": checks,
        "heuristicBasis": [
            "J/L cuts are treated as split-edit timing questions, not mandatory polish.",
            "Jump-cut risk is advisory; reaction cover, b-roll, a hold, or a human ear pass can all be valid outcomes.",
            "Cadence preservation matters because not every pause is dead air.",
            "This contract never edits media or moves timeline decisions.",
        ],
        "selectedDecision": {
            "laneName": decision.get("laneName", ""),
            "tagType": decision.get("tagType", ""),
            "cutStyle": decision.get("cutStyle", ""),
            "risk": decision.get("risk", ""),
            "coverStrategy": decision.get("coverStrategy", ""),
            "cadenceMode": decision.get("cadenceMode", ""),
            "boundary": boundary,
        },
        "agentInstruction": "Before revising this cut, satisfy the high-risk checks, proof-listen the boundary, then record a note/status. Preserve human cadence unless the chosen edit intentionally tightens it.",
        "truth": "Advisory metadata contract only. It does not approve, export, publish, trim, or mutate source media.",
    }


def decision_flow_contract_markdown_lines(contract: dict[str, Any]) -> list[str]:
    contract = dict_value(contract)
    decision = dict_value(contract.get("selectedDecision"))
    boundary = dict_value(decision.get("boundary"))
    lines = [
        "# Selected decision edit-flow contract",
        "",
        f"- Contract: `{contract.get('label', 'unknown')}` ({contract.get('readyCount', 0)}/{contract.get('totalCount', 0)})",
        f"- Lane: {decision.get('laneName', '') or 'none selected'}",
        f"- Decision: `{decision.get('tagType', '')}` / `{decision.get('cutStyle', '')}`",
        f"- Span: {boundary.get('start', 0)} -> {boundary.get('end', 0)} ({boundary.get('duration', 0)}s)",
        f"- Safe action: {contract.get('safeAction', '')}",
        "",
        "## Checks",
    ]
    for check in list_value(contract.get("checks")):
        check = dict_value(check)
        status = "ready" if check.get("ready") else "needs work"
        lines.append(
            f"- {check.get('id', 'check')}: {status} ({check.get('risk', 'low')} risk) - {check.get('explanation', '')}"
        )
    lines.extend(["", "## Heuristic basis"])
    lines.extend(f"- {item}" for item in list_value(contract.get("heuristicBasis")))
    lines.extend(["", f"Agent instruction: {contract.get('agentInstruction', '')}", "", f"Truth: {contract.get('truth', '')}"])
    return lines
