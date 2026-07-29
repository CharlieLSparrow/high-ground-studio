#!/usr/bin/env python3
"""Print the selected short's hook-turn-payoff review contract from Quipsly Studio state."""

from __future__ import annotations

import argparse
import json
import sys
import urllib.request
from typing import Any

from short_story_contract_common import build_short_story_contract, short_story_contract_markdown_lines


def read_state(base_url: str) -> dict[str, Any]:
    with urllib.request.urlopen(base_url.rstrip("/") + "/state", timeout=2.0) as response:
        return json.loads(response.read().decode("utf-8"))


def as_dict(value: Any) -> dict[str, Any]:
    return value if isinstance(value, dict) else {}


def extract_cut_evidence(selected_short: dict[str, Any], selected_proof: dict[str, Any]) -> dict[str, Any]:
    creator_quality = as_dict(selected_short.get("creatorQuality"))
    publication_passport = as_dict(selected_short.get("publicationPassport"))
    return as_dict(
        selected_proof.get("cutIntelligenceEvidence")
        or selected_proof.get("selectedShortCutIntelligenceEvidence")
        or selected_short.get("cutIntelligenceEvidence")
        or creator_quality.get("cutIntelligenceEvidence")
        or publication_passport.get("cutIntelligenceEvidence")
        or {}
    )


def contract_has_check(contract: dict[str, Any], check_id: str) -> bool:
    checks = as_dict(contract).get("checks", [])
    if not isinstance(checks, list):
        return False
    return any(as_dict(check).get("id") == check_id for check in checks)


def build_payload(state: dict[str, Any]) -> dict[str, Any]:
    selected_short = as_dict(state.get("selectedShortClip"))
    selected_proof = as_dict(state.get("selectedShortProof"))
    cut_evidence = extract_cut_evidence(selected_short, selected_proof)
    contract = as_dict(selected_proof.get("shortStoryContract") or selected_short.get("shortStoryContract"))
    if selected_short and (not contract or not contract_has_check(contract, "humanEditFlow")):
        contract = build_short_story_contract(
            selected_short,
            selected_proof,
            cut_evidence,
            source="derived-from-selected-short-command",
        )
    return {
        "ok": bool(contract),
        "model": "quipslystudio-selected-short-story-contract",
        "selectedShort": {
            "id": selected_short.get("id", ""),
            "title": selected_short.get("title", ""),
            "reviewStatus": selected_short.get("reviewStatus", ""),
            "exportStatus": selected_short.get("exportStatus", ""),
        },
        "shortStoryContract": contract,
        "cutIntelligenceEvidence": cut_evidence,
        "cutEvidenceSummary": {
            "hasRisk": bool(cut_evidence.get("hasRisk")),
            "overlappedFindingCount": cut_evidence.get("overlappedFindingCount", 0),
            "cadenceWarningCount": cut_evidence.get("cadenceWarningCount", 0),
            "jumpCutRiskCount": cut_evidence.get("jumpCutRiskCount", 0),
            "nextAction": cut_evidence.get("nextAction", ""),
        },
        "nextAction": (
            contract.get("nextAction")
            if isinstance(contract, dict) and contract
            else "Select a short and rerun selected-short-story-contract."
        ),
        "agentInstruction": (
            contract.get("agentInstruction")
            if isinstance(contract, dict) and contract
            else "Select a short, then inspect hook-turn-payoff readiness before editing or exporting."
        ),
    }


def print_markdown(payload: dict[str, Any]) -> None:
    contract = payload.get("shortStoryContract") or {}
    selected_short = payload.get("selectedShort") or {}
    title = selected_short.get("title") or "Untitled short"
    lines = short_story_contract_markdown_lines(contract, selected_short_title=title)
    cut_summary = payload.get("cutEvidenceSummary") or {}
    if cut_summary:
        lines.extend(
            [
                "",
                "## Cut flow evidence",
                f"- Risk present: {cut_summary.get('hasRisk', False)}",
                f"- Overlap findings: {cut_summary.get('overlappedFindingCount', 0)}",
                f"- Cadence warnings: {cut_summary.get('cadenceWarningCount', 0)}",
                f"- Jump-cut risks: {cut_summary.get('jumpCutRiskCount', 0)}",
                f"- Next cut-flow action: {cut_summary.get('nextAction', '') or 'Proof-listen before Keep.'}",
            ]
        )
    print("\n".join(lines))


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--base-url", default="http://127.0.0.1:8080")
    parser.add_argument("--markdown", action="store_true")
    parser.add_argument("--json", action="store_true")
    args = parser.parse_args()

    try:
        payload = build_payload(read_state(args.base_url))
    except Exception as exc:
        payload = {
            "ok": False,
            "error": f"Could not read Quipsly Studio state: {exc}",
            "nextAction": "Launch Quipsly Studio, confirm the agent server is healthy, then rerun selected-short-story-contract.",
        }
        print(json.dumps(payload, indent=2))
        return 1

    if args.markdown:
        print_markdown(payload)
    else:
        print(json.dumps(payload, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
