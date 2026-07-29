#!/usr/bin/env python3
"""Read-only selected-decision review workbench for Quipsly Studio.

This gives a human or agent one compact briefing for the currently selected
SHOW/SKIP decision: why it exists, what risk/tradeoff it carries, what evidence
supports it, and what the next safe review action is. It never edits, exports,
publishes, or touches source media.
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

from decision_flow_contract_common import build_decision_flow_contract


DEFAULT_BASE_URL = os.environ.get("QUIPSLY_STUDIO_AGENT_URL", "http://127.0.0.1:8765")


def fetch_json(base_url: str, endpoint: str) -> tuple[dict[str, Any] | None, str]:
    url = urllib.parse.urljoin(base_url.rstrip("/") + "/", endpoint.lstrip("/"))
    try:
        with urllib.request.urlopen(url, timeout=4) as response:
            payload = json.loads(response.read().decode("utf-8"))
            if isinstance(payload, dict):
                return payload, ""
            return {"value": payload}, ""
    except urllib.error.HTTPError as error:
        return None, f"{endpoint}: HTTP {error.code}"
    except Exception as error:  # noqa: BLE001 - diagnostic script.
        return None, f"{endpoint}: {error}"


def dict_value(value: Any) -> dict[str, Any]:
    return value if isinstance(value, dict) else {}


def list_value(value: Any) -> list[Any]:
    return value if isinstance(value, list) else []


def text_value(value: Any, fallback: str = "") -> str:
    if value is None:
        return fallback
    text = str(value).strip()
    return text if text else fallback


def first_present(*values: Any, fallback: Any = None) -> Any:
    for value in values:
        if value not in (None, "", [], {}):
            return value
    return fallback


def decision_from_sources(evidence: dict[str, Any], cockpit: dict[str, Any], state: dict[str, Any]) -> dict[str, Any]:
    candidates = [
        evidence,
        evidence.get("selectedDecisionCutIntelligence"),
        evidence.get("selectedDecision"),
        dict_value(cockpit.get("selectedDecision")),
        dict_value(cockpit.get("selectedDecisionCutIntelligence")),
        dict_value(state.get("selectedDecisionCutIntelligence")),
        dict_value(state.get("selectedDecision")),
    ]
    for candidate in candidates:
        candidate_dict = dict_value(candidate)
        status = text_value(candidate_dict.get("status"))
        if candidate_dict and status != "no_selected_decision":
            return candidate_dict
    return {}


def selected_boundary(decision: dict[str, Any]) -> dict[str, Any]:
    start = first_present(
        decision.get("selectedSequenceStart"),
        decision.get("sequenceStart"),
        decision.get("selectedTagStart"),
        decision.get("start"),
        fallback=0,
    )
    end = first_present(
        decision.get("selectedSequenceEnd"),
        decision.get("sequenceEnd"),
        fallback=None,
    )
    duration = first_present(
        decision.get("selectedTagDuration"),
        decision.get("duration"),
        decision.get("selectedDuration"),
        fallback=0,
    )
    if end in (None, ""):
        try:
            end = float(start) + float(duration)
        except Exception:
            end = duration
    return {
        "start": start,
        "end": end,
        "duration": duration,
    }


def build_workbench(base_url: str) -> dict[str, Any]:
    evidence, evidence_error = fetch_json(base_url, "/selected_decision_intent_evidence")
    cockpit, cockpit_error = fetch_json(base_url, "/editor_review_cockpit")
    state, state_error = fetch_json(base_url, "/state")

    evidence = evidence or {}
    cockpit = cockpit or {}
    state = state or {}
    decision = decision_from_sources(evidence, cockpit, state)

    verdict = dict_value(first_present(decision.get("verdict"), evidence.get("verdict"), fallback={}))
    cadence_guard = dict_value(first_present(decision.get("cadenceGuard"), evidence.get("cadenceGuard"), fallback={}))
    human_flow = dict_value(first_present(decision.get("humanFlowRecommendation"), evidence.get("humanFlowRecommendation"), fallback={}))
    split = dict_value(first_present(decision.get("splitEditRecommendation"), evidence.get("splitEditRecommendation"), fallback={}))
    provenance = dict_value(first_present(decision.get("reviewProvenance"), evidence.get("reviewProvenance"), fallback={}))
    technique = dict_value(first_present(decision.get("techniqueGuidance"), evidence.get("techniqueGuidance"), fallback={}))
    preserve_air = dict_value(first_present(decision.get("preserveAirProtocol"), evidence.get("preserveAirProtocol"), fallback={}))
    human_cut_guidance = dict_value(first_present(decision.get("humanCutGuidance"), evidence.get("humanCutGuidance"), fallback={}))
    boundary = selected_boundary(decision)

    review_evidence = list_value(first_present(decision.get("reviewEvidence"), evidence.get("reviewEvidence"), fallback=[]))
    checklist = list_value(first_present(decision.get("humanReviewChecklist"), evidence.get("humanReviewChecklist"), fallback=[]))
    ledger = list_value(first_present(decision.get("revisionLedger"), evidence.get("revisionLedger"), fallback=[]))
    revision_history = list_value(first_present(decision.get("revisionHistory"), evidence.get("revisionHistory"), fallback=[]))
    human_agent_notes = list_value(first_present(decision.get("humanAgentNotes"), evidence.get("humanAgentNotes"), fallback=[]))

    status = text_value(decision.get("status"), "needs-selected-decision")
    selected = bool(decision)
    workbench = {
        "model": "quipsly-selected-decision-review-workbench",
        "generatedAt": datetime.now().isoformat(timespec="seconds"),
        "baseUrl": base_url,
        "status": "ready" if selected else "needs-selected-decision",
        "selectedDecision": {
            "laneName": text_value(first_present(decision.get("selectedLaneName"), decision.get("laneName"), fallback="")),
            "laneId": text_value(first_present(decision.get("selectedLaneId"), decision.get("laneId"), fallback="")),
            "tagId": text_value(first_present(decision.get("selectedTagId"), decision.get("tagId"), fallback="")),
            "tagType": text_value(first_present(decision.get("selectedTagType"), decision.get("tagType"), fallback="")),
            "boundary": boundary,
            "hasStoredIntent": bool(decision.get("hasStoredIntent")),
            "intentStatus": text_value(decision.get("intentStatus"), status),
            "risk": text_value(decision.get("risk"), "unknown"),
            "confidence": first_present(decision.get("confidence"), fallback=0),
            "cutStyle": text_value(decision.get("cutStyle"), "unclassified"),
            "coverStrategy": text_value(decision.get("coverStrategy"), "none"),
            "cadenceMode": text_value(decision.get("cadenceMode"), "unknown"),
        },
        "why": text_value(decision.get("whyThisCutExists"), "No plain-English reason is attached yet."),
        "tradeoff": text_value(decision.get("tradeoffExplanation"), "No tradeoff note is attached yet."),
        "humanRhythmNote": text_value(decision.get("humanRhythmNote"), "Listen for breath, laughter, hesitation, and whether the pause is doing useful work."),
        "nextReviewAction": text_value(first_present(
            decision.get("nextReviewAction"),
            human_flow.get("safeAction"),
            cadence_guard.get("detail"),
            fallback="Cue the boundary, compare Play Edit and Play Through, then mark Keep, Refine, Hold, or needs-listen with a note.",
        )),
        "verdict": verdict,
        "cadenceGuard": cadence_guard,
        "humanFlowRecommendation": human_flow,
        "splitEditRecommendation": split,
        "preserveAirProtocol": preserve_air,
        "techniqueGuidance": technique,
        "humanCutGuidance": human_cut_guidance,
        "reviewEvidence": review_evidence[:10],
        "humanReviewChecklist": checklist[:10],
        "revisionLedger": ledger[:8],
        "revisionHistory": revision_history[-8:],
        "humanAgentNotes": human_agent_notes[-8:],
        "reviewProvenance": provenance,
        "safeCommands": {
            "selectAtPlayhead": "GET /select_decision?mode=at_playhead&scope=video",
            "intentEvidence": "GET /selected_decision_intent_evidence",
            "editFlowContract": "script/agentctl.sh selected-decision-flow-contract --markdown",
            "coverBrief": "script/agentctl.sh selected-decision-cover-brief --markdown",
            "addNote": "GET /selected_decision_intent_note?note=<what-to-check>&actor=Codex&actor_type=agent&category=cut-choice",
            "markListen": "GET /selected_decision_intent_status?status=needs-listen&actor=Codex&actor_type=agent&note=needs%20an%20ear%20pass",
            "markRefine": "GET /selected_decision_intent_status?status=refine&actor=Codex&actor_type=agent&note=needs%20timing%20or%20cover%20refinement",
            "markKeep": "GET /selected_decision_intent_status?status=keep&actor=Codex&actor_type=agent&note=reviewed%20as%20usable",
            "cutRhythmFocus": "script/agentctl.sh cut-rhythm-start-here --markdown",
        },
        "endpointWarnings": [error for error in [evidence_error, cockpit_error, state_error] if error],
        "truth": "Read-only decision review workbench. It does not export, publish, approve, mutate source media, or change edit decisions.",
    }
    workbench["editFlowContract"] = build_decision_flow_contract(workbench, source="decision-review-workbench")
    return workbench


def render_markdown(workbench: dict[str, Any]) -> str:
    selected = dict_value(workbench.get("selectedDecision"))
    boundary = dict_value(selected.get("boundary"))
    verdict = dict_value(workbench.get("verdict"))
    cadence = dict_value(workbench.get("cadenceGuard"))
    human_flow = dict_value(workbench.get("humanFlowRecommendation"))
    split = dict_value(workbench.get("splitEditRecommendation"))
    preserve_air = dict_value(workbench.get("preserveAirProtocol"))
    technique = dict_value(workbench.get("techniqueGuidance"))
    edit_flow_contract = dict_value(workbench.get("editFlowContract"))

    lines = [
        "# Selected decision review workbench",
        "",
        f"- Status: `{workbench.get('status', '')}`",
        f"- Lane: {selected.get('laneName', '') or 'none selected'}",
        f"- Decision: `{selected.get('tagType', '')}` / `{selected.get('cutStyle', '')}`",
        f"- Span: {boundary.get('start', 0)} -> {boundary.get('end', 0)} ({boundary.get('duration', 0)}s)",
        f"- Intent: `{selected.get('intentStatus', '')}` stored={selected.get('hasStoredIntent', False)}",
        f"- Risk: `{selected.get('risk', '')}` confidence={selected.get('confidence', 0)}",
        "",
        "## Why this cut exists",
        workbench.get("why", ""),
        "",
        "## Tradeoff",
        workbench.get("tradeoff", ""),
        "",
        "## Human rhythm note",
        workbench.get("humanRhythmNote", ""),
        "",
        "## Next safe review action",
        workbench.get("nextReviewAction", ""),
        "",
    ]

    if edit_flow_contract:
        lines.extend([
            "## Edit-flow contract",
            (
                f"- `{edit_flow_contract.get('label', 'unknown')}` "
                f"({edit_flow_contract.get('readyCount', 0)}/{edit_flow_contract.get('totalCount', 0)})"
            ),
            f"- Safe action: {edit_flow_contract.get('safeAction', '')}",
            "",
        ])
        for check in list_value(edit_flow_contract.get("checks")):
            if isinstance(check, dict):
                state = "ready" if check.get("ready") else "needs work"
                lines.append(
                    f"- {check.get('id', 'check')}: {state} "
                    f"({check.get('risk', 'low')} risk) - {check.get('explanation', '')}"
                )
        lines.extend([
            "",
            f"Agent instruction: {edit_flow_contract.get('agentInstruction', '')}",
            "",
        ])

    if verdict:
        lines.extend([
            "## Verdict",
            f"- {verdict.get('title', '')}: {verdict.get('detail', '')}",
            "",
        ])
    if cadence:
        lines.extend([
            "## Cadence guard",
            f"- {cadence.get('title', '')}: {cadence.get('detail', '')}",
            f"- Preserve air: {cadence.get('preserveAir', '')}",
            "",
        ])
    if human_flow:
        lines.extend([
            "## Human-flow recommendation",
            f"- Technique: {human_flow.get('technique', '')}",
            f"- Reason: {human_flow.get('reason', '')}",
            f"- Audio move: {human_flow.get('audioMove', '')}",
            f"- Visual move: {human_flow.get('visualMove', '')}",
            f"- Review question: {human_flow.get('reviewQuestion', '')}",
            f"- Do not optimize away: {human_flow.get('doNotOptimizeAway', '')}",
            "",
        ])
    if split:
        lines.extend([
            "## Split-edit recommendation",
            f"- Technique: {split.get('technique', '')}",
            f"- Timing intent: {split.get('timingIntent', '')}",
            f"- Audio: {split.get('audioTreatment', '')}",
            f"- Visual: {split.get('visualTreatment', '')}",
            f"- Review question: {split.get('reviewQuestion', '')}",
            "",
        ])
    if preserve_air:
        lines.extend([
            "## Preserve-air protocol",
            f"- Stance: {preserve_air.get('stance', '')}",
            f"- Safe action: {preserve_air.get('safeAction', '')}",
            "",
        ])
        for key, title in [
            ("triggers", "Triggers"),
            ("listenFor", "Listen for"),
            ("doNot", "Do not"),
        ]:
            items = list_value(preserve_air.get(key))
            if items:
                lines.extend([f"### {title}", ""])
                lines.extend(f"- {item}" for item in items)
                lines.append("")
    if technique:
        lines.extend([
            "## Technique guide",
            f"- {technique.get('title', '')}",
            f"- Best use: {technique.get('bestUse', '')}",
            f"- Avoid when: {technique.get('avoidWhen', '')}",
            f"- Agent rule: {technique.get('agentRule', '')}",
            "",
        ])

    for key, title in [
        ("reviewEvidence", "Review evidence"),
        ("humanReviewChecklist", "Human review checklist"),
        ("humanAgentNotes", "Human/agent notes"),
        ("revisionHistory", "Legacy revision trail"),
        ("revisionLedger", "Revision ledger"),
    ]:
        items = list_value(workbench.get(key))
        lines.extend([f"## {title}", ""])
        if not items:
            lines.append("- none reported")
        for item in items:
            if isinstance(item, dict):
                label = text_value(first_present(item.get("action"), item.get("title"), item.get("note"), fallback="item"))
                detail = text_value(first_present(item.get("note"), item.get("detail"), item.get("nextStatus"), fallback=""))
                lines.append(f"- {label}: {detail}" if detail and detail != label else f"- {label}")
            else:
                lines.append(f"- {item}")
        lines.append("")

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
    root = Path(output_root or "~/Movies/QuipslyExports/DecisionReviewWorkbenches").expanduser()
    root.mkdir(parents=True, exist_ok=True)
    stamp = datetime.now().strftime("%Y%m%d-%H%M%S")
    selected = dict_value(workbench.get("selectedDecision"))
    lane = text_value(selected.get("laneName"), "selected-decision")
    slug = "".join(char.lower() if char.isalnum() else "-" for char in lane).strip("-")
    slug = "-".join(part for part in slug.split("-") if part)[:80] or "selected-decision"
    folder = root / f"{stamp}-{slug}"
    folder.mkdir(parents=True, exist_ok=False)
    (folder / "decision-review-workbench.json").write_text(json.dumps(workbench, indent=2, sort_keys=True), encoding="utf-8")
    (folder / "decision-review-workbench.md").write_text(markdown, encoding="utf-8")
    return folder


def main() -> int:
    parser = argparse.ArgumentParser(description="Read-only Quipsly Studio selected decision review workbench.")
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
