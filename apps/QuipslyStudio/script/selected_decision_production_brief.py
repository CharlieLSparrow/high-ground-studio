#!/usr/bin/env python3
"""Bundle selected-decision workbench, edit-flow contract, and cover brief.

This is the one-command read-only "what should I do with this cut?" surface for
humans and agents. It does not edit, export, publish, relink, insert cover media,
or mutate source files.
"""

from __future__ import annotations

import argparse
import json
import sys
from typing import Any

from decision_flow_contract_common import build_decision_flow_contract, dict_value, list_value
from decision_review_workbench import DEFAULT_BASE_URL, build_workbench
from selected_decision_cover_brief import build_cover_brief


def recommended_action(flow_contract: dict[str, Any], cover_brief: dict[str, Any]) -> dict[str, Any]:
    flow_label = str(flow_contract.get("label", "unknown"))
    needs_cover = bool(cover_brief.get("needsCover"))
    candidates = list_value(cover_brief.get("candidates"))
    if flow_label == "decision-flow-blocked":
        return {
            "label": "hold-or-refine",
            "why": "The edit-flow contract has a high-risk missing check.",
            "nextCommand": 'script/agentctl.sh decision-record-review refine "high-risk flow check needs review" --apply',
        }
    if needs_cover and candidates:
        top = dict_value(candidates[0])
        return {
            "label": "review-cover-candidate",
            "why": f"Cover appears useful; top candidate is {top.get('name', 'unnamed source')}.",
            "nextCommand": 'script/agentctl.sh decision-record-review needs-listen "cue cover candidate and proof-listen before changing metadata"',
        }
    if needs_cover:
        return {
            "label": "recover-or-hold-cover",
            "why": "Cover appears useful, but no usable candidate is visible from current state.",
            "nextCommand": 'script/agentctl.sh decision-record-review hold "cover needed but no safe candidate is ready"',
        }
    if flow_label == "decision-flow-ready":
        return {
            "label": "ear-pass-then-keep-or-refine",
            "why": "The metadata checks look ready, but a normal-speed proof-listen is still required.",
            "nextCommand": 'script/agentctl.sh decision-record-review keep "proof-listened; cut currently works" --apply',
        }
    return {
        "label": "ear-pass-needed",
        "why": "The cut has advisory checks that still need human/agent listening context.",
        "nextCommand": 'script/agentctl.sh decision-record-review needs-listen "proof-listen cadence, jump risk, and cover need"',
    }


def build_payload(base_url: str) -> dict[str, Any]:
    workbench = build_workbench(base_url)
    flow_contract = build_decision_flow_contract(workbench, source="selected-decision-production-brief")
    cover_brief = build_cover_brief(base_url)
    human_cut_guidance = dict_value(workbench.get("humanCutGuidance"))
    action = recommended_action(flow_contract, cover_brief)
    return {
        "ok": True,
        "model": "quipsly-selected-decision-production-brief",
        "version": "2026-06-30.selected-decision-production-brief.v1",
        "baseUrl": base_url,
        "workbenchStatus": workbench.get("status", ""),
        "selectedDecision": workbench.get("selectedDecision", {}),
        "why": workbench.get("why", ""),
        "tradeoff": workbench.get("tradeoff", ""),
        "nextReviewAction": workbench.get("nextReviewAction", ""),
        "humanCutGuidance": human_cut_guidance,
        "editFlowContract": flow_contract,
        "coverBrief": cover_brief,
        "recommendedAction": action,
        "safeCommands": {
            "fullWorkbench": "script/agentctl.sh decision-review-workbench",
            "flowContract": "script/agentctl.sh selected-decision-flow-contract --markdown",
            "coverBrief": "script/agentctl.sh selected-decision-cover-brief --markdown",
            "recordNeedsListen": 'script/agentctl.sh decision-record-review needs-listen "proof-listen cadence, jump risk, and cover need"',
            "recordRefine": 'script/agentctl.sh decision-record-review refine "needs timing, cover, cadence, or source-choice refinement"',
            "recordHold": 'script/agentctl.sh decision-record-review hold "hold for human context or uncertain source evidence"',
            "recordKeep": 'script/agentctl.sh decision-record-review keep "proof-listened; cut currently works"',
        },
        "truth": "Read-only production brief. It does not approve, insert cover media, change timeline metadata, export, publish, relink, or mutate source files.",
    }


def render_markdown(payload: dict[str, Any]) -> str:
    decision = dict_value(payload.get("selectedDecision"))
    boundary = dict_value(decision.get("boundary"))
    flow = dict_value(payload.get("editFlowContract"))
    cover = dict_value(payload.get("coverBrief"))
    action = dict_value(payload.get("recommendedAction"))
    guidance = dict_value(payload.get("humanCutGuidance"))
    lines = [
        "# Selected decision production brief",
        "",
        f"- Workbench status: `{payload.get('workbenchStatus', '')}`",
        f"- Lane: {decision.get('laneName', '') or 'none selected'}",
        f"- Decision: `{decision.get('tagType', '')}` / `{decision.get('cutStyle', '')}`",
        f"- Span: {boundary.get('start', 0)} -> {boundary.get('end', 0)} ({boundary.get('duration', 0)}s)",
        f"- Flow: `{flow.get('label', 'unknown')}` ({flow.get('readyCount', 0)}/{flow.get('totalCount', 0)})",
        f"- Cover needed: `{cover.get('needsCover', False)}` ({cover.get('candidateCount', 0)} candidates)",
        f"- Recommended action: `{action.get('label', 'review')}`",
        f"- Why: {action.get('why', '')}",
        f"- Next command: `{action.get('nextCommand', '')}`",
        "",
        "## Why and tradeoff",
        f"- Why: {payload.get('why', '')}",
        f"- Tradeoff: {payload.get('tradeoff', '')}",
        f"- Next review action: {payload.get('nextReviewAction', '')}",
        "",
        "## Human cut guidance",
        f"- Edit read: `{guidance.get('editRead', 'unknown')}`",
        f"- Primary question: {guidance.get('primaryQuestion', 'Listen at normal speed and decide whether this cut still feels human.')}",
        f"- Proof instruction: {guidance.get('proofInstruction', 'Proof-listen before marking Keep or Refine.')}",
        f"- Agent rule: {guidance.get('agentRule', 'Optimize for listener trust, clarity, energy, and human cadence.')}",
        "",
        "### Do not cut if",
    ]
    dont_cut = list_value(guidance.get("shouldNotCutIf"))
    if not dont_cut:
        lines.append("- no guidance reported")
    else:
        for item in dont_cut[:5]:
            lines.append(f"- {item}")
    lines.extend([
        "",
        "### Tighten if",
    ])
    tighten = list_value(guidance.get("shouldTightenIf"))
    if not tighten:
        lines.append("- no guidance reported")
    else:
        for item in tighten[:5]:
            lines.append(f"- {item}")
    lines.extend([
        "",
        "## Edit-flow missing checks",
    ])
    missing = [
        dict_value(check)
        for check in list_value(flow.get("checks"))
        if dict_value(check) and not dict_value(check).get("ready")
    ]
    if not missing:
        lines.append("- none reported")
    else:
        for check in missing:
            lines.append(f"- {check.get('id', 'check')} ({check.get('risk', 'risk')}): {check.get('explanation', '')}")
    lines.extend(["", "## Top cover candidates"])
    candidates = list_value(cover.get("candidates"))[:5]
    if not candidates:
        lines.append("- none visible from current state")
    else:
        for index, candidate in enumerate(candidates, start=1):
            candidate = dict_value(candidate)
            lines.append(
                f"- {index}. {candidate.get('name', 'Unnamed source')} "
                f"`{candidate.get('kind', '')}` score={candidate.get('score', 0)} "
                f"overlap={candidate.get('overlapSeconds', 0)}s proxy={candidate.get('proxyReady', False)}"
            )
    lines.extend(["", "## Safe commands"])
    for label, command in dict_value(payload.get("safeCommands")).items():
        lines.append(f"- `{label}`: `{command}`")
    lines.extend(["", f"Truth: {payload.get('truth', '')}"])
    return "\n".join(lines).strip() + "\n"


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--base-url", default=DEFAULT_BASE_URL)
    parser.add_argument("--markdown", action="store_true")
    parser.add_argument("--json", action="store_true")
    args = parser.parse_args()

    try:
        payload = build_payload(args.base_url)
    except Exception as exc:  # noqa: BLE001 - diagnostic CLI.
        payload = {
            "ok": False,
            "error": f"Could not build selected-decision production brief: {exc}",
            "nextAction": "Launch Quipsly Studio, select a decision, then rerun selected-decision-production-brief.",
            "truth": "Diagnostic failure only; no source media or edit metadata changed.",
        }
        print(json.dumps(payload, indent=2, sort_keys=True))
        return 1

    if args.markdown:
        print(render_markdown(payload))
    else:
        print(json.dumps(payload, indent=2, sort_keys=True))
    return 0


if __name__ == "__main__":
    sys.exit(main())
