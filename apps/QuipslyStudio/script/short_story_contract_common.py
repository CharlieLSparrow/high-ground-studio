#!/usr/bin/env python3
"""Shared hook-turn-payoff contract helpers for Quipsly short review tooling."""

from __future__ import annotations

from typing import Any


MIDDLE_TURN_CUES = [
    "turn",
    "but ",
    "because",
    "realize",
    "shift",
    "then ",
    "instead",
    "however",
    "lesson",
]

PAYOFF_CUES = [
    "payoff",
    "lesson",
    "result",
    "so ",
    "therefore",
    "why",
    "takeaway",
    "ending",
    "loop",
]

PROOF_CUES = [
    "exported",
    "exists",
    "ready",
    ".mp4",
    ".mov",
    ".m4a",
]


def has_text(value: Any) -> bool:
    return bool(str(value or "").strip())


def dict_value(value: Any) -> dict[str, Any]:
    return value if isinstance(value, dict) else {}


def joined_short_text(short: dict[str, Any]) -> str:
    short = dict_value(short)
    return " ".join(
        str(short.get(key, "") or "")
        for key in (
            "title",
            "hookText",
            "captionDraft",
            "primaryOverlayText",
            "notes",
            "publishNotes",
        )
    ).lower()


def contains_any(text: str, needles: list[str]) -> bool:
    lowered = text.lower()
    return any(needle in lowered for needle in needles)


def int_value(value: Any, fallback: int = 0) -> int:
    try:
        return int(value)
    except Exception:
        return fallback


def proof_exists(short: dict[str, Any], proof: dict[str, Any] | None = None) -> bool:
    short = dict_value(short)
    proof = dict_value(proof)
    proof_text = " ".join(
        str(value or "")
        for value in (
            short.get("exportStatus"),
            short.get("lastExportedPath"),
            short.get("exportPath"),
            short.get("proofPath"),
            proof.get("exportProofLabel"),
            proof.get("proofStatus"),
        )
    ).lower()
    return contains_any(proof_text, PROOF_CUES)


def build_short_story_contract(
    short: dict[str, Any],
    proof: dict[str, Any] | None = None,
    cut_evidence: dict[str, Any] | None = None,
    *,
    source: str = "derived-from-selected-short",
) -> dict[str, Any]:
    """Build conservative hook-turn-payoff review guidance from short metadata."""
    short = dict_value(short)
    proof = dict_value(proof)
    cut_evidence = dict_value(cut_evidence)
    text = joined_short_text(short)
    has_hook_promise = has_text(short.get("hookText"))
    has_middle_turn = contains_any(text, MIDDLE_TURN_CUES)
    has_payoff = contains_any(text, PAYOFF_CUES)
    has_sound_off_plan = has_text(short.get("captionDraft")) or has_text(short.get("primaryOverlayText"))
    has_proof = proof_exists(short, proof)
    has_cut_risk = bool(cut_evidence.get("hasRisk")) or any(
        int_value(cut_evidence.get(key)) > 0
        for key in (
            "overlappedFindingCount",
            "cadenceWarningCount",
            "jumpCutRiskCount",
        )
    )
    has_cut_evidence = bool(cut_evidence)
    human_flow_ready = has_cut_evidence and not has_cut_risk
    human_flow_explanation = (
        "Cut evidence has no cadence or jump-cut risks; still listen once before Keep."
        if human_flow_ready
        else (
            str(cut_evidence.get("nextAction"))
            if has_cut_evidence and cut_evidence.get("nextAction")
            else "Proof-listen for cadence, jump cuts, clipped breaths, missing reaction cover, and sync drift."
        )
    )
    checks = [
        {
            "id": "openingPromise",
            "ready": has_hook_promise,
            "explanation": "Hook/promise is named."
            if has_hook_promise
            else "Name the first-second promise: why should a stranger stop?",
        },
        {
            "id": "middleTurn",
            "ready": has_middle_turn,
            "explanation": "A middle turn is hinted in metadata."
            if has_middle_turn
            else "Name what changes, escalates, or becomes clearer.",
        },
        {
            "id": "payoff",
            "ready": has_payoff,
            "explanation": "A viewer reward or takeaway is hinted."
            if has_payoff
            else "Name the payoff or ending reward.",
        },
        {
            "id": "soundOffPlan",
            "ready": has_sound_off_plan,
            "explanation": "Caption or overlay metadata exists."
            if has_sound_off_plan
            else "Add a face-safe caption or overlay plan.",
        },
        {
            "id": "proof",
            "ready": has_proof,
            "explanation": "Export proof exists."
            if has_proof
            else "Attach or render proof before review is trusted.",
        },
        {
            "id": "humanEditFlow",
            "ready": human_flow_ready,
            "explanation": human_flow_explanation,
        },
    ]
    ready_count = sum(1 for check in checks if check["ready"])
    next_action = next(
        (str(check["explanation"]) for check in checks if not check["ready"]),
        "Watch the proof once as a viewer: hook, turn, payoff, crop, captions, ending.",
    )
    return {
        "label": "story-contract-ready"
        if ready_count >= 4
        else ("story-contract-needs-review" if ready_count >= 2 else "story-contract-weak"),
        "source": source,
        "readyCount": ready_count,
        "totalCount": len(checks),
        "nextAction": next_action,
        "checks": checks,
        "agentInstruction": "Verify the short has hook -> turn -> payoff, works muted, has proof evidence, and still feels human before Keep/Refine/Reject. Do not publish from this payload.",
    }


def short_story_contract_markdown_lines(
    contract: dict[str, Any],
    *,
    selected_short_title: str = "Untitled short",
) -> list[str]:
    """Render a short story contract as human-readable Markdown lines."""
    contract = dict_value(contract)
    if not contract:
        return [
            "# Selected short story contract",
            "",
            "- State: no selected short story contract found.",
            "- Next: select a short in Quipsly Studio, then rerun this command.",
        ]

    lines = [
        "# Selected short story contract",
        "",
        f"- Short: {selected_short_title or 'Untitled short'}",
        (
            f"- Contract: {contract.get('label', 'unknown')} "
            f"({contract.get('readyCount', 0)}/{contract.get('totalCount', 0)})"
        ),
    ]
    if contract.get("source"):
        lines.append(f"- Source: {contract.get('source')}")
    lines.extend(
        [
            f"- Next: {contract.get('nextAction', '')}",
            "",
            "## Checks",
        ]
    )
    checks = contract.get("checks", [])
    if not isinstance(checks, list):
        checks = []
    for check in checks:
        check = dict_value(check)
        status = "ready" if check.get("ready") else "needs work"
        lines.append(f"- {check.get('id', 'check')}: {status} - {check.get('explanation', '')}")
    lines.extend(
        [
            "",
            f"Agent instruction: {contract.get('agentInstruction', '')}",
        ]
    )
    return lines
