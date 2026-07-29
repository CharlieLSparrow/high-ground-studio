#!/usr/bin/env python3
"""Bundle selected-short story, quality, cut-flow, and platform readiness.

This is the one-command read-only "what should I do with this short?" surface
for humans and agents. It does not export, publish, approve, mutate source
media, or change short metadata.
"""

from __future__ import annotations

import argparse
import json
import sys
from typing import Any

from decision_review_workbench import DEFAULT_BASE_URL, fetch_json
from selected_short_story_contract import build_payload as build_story_contract_payload


def dict_value(value: Any) -> dict[str, Any]:
    return value if isinstance(value, dict) else {}


def list_value(value: Any) -> list[Any]:
    return value if isinstance(value, list) else []


def text_value(value: Any, fallback: str = "") -> str:
    text = str(value or "").strip()
    return text if text else fallback


def number_value(value: Any, fallback: float = 0.0) -> float:
    try:
        return float(value)
    except Exception:
        return fallback


def selected_short_from_state(state: dict[str, Any]) -> dict[str, Any]:
    return dict_value(
        state.get("selectedShortClip")
        or state.get("selectedShort")
        or dict_value(state.get("shorts")).get("selected")
        or {}
    )


def selected_proof_from_state(state: dict[str, Any]) -> dict[str, Any]:
    return dict_value(
        state.get("selectedShortProof")
        or dict_value(state.get("shorts")).get("selectedProof")
        or {}
    )


def first_dict(*values: Any) -> dict[str, Any]:
    for value in values:
        item = dict_value(value)
        if item:
            return item
    return {}


def first_text(*values: Any, fallback: str = "") -> str:
    for value in values:
        text = text_value(value)
        if text:
            return text
    return fallback


def extract_quality(selected: dict[str, Any]) -> dict[str, Any]:
    return first_dict(
        selected.get("creatorQuality"),
        selected.get("quality"),
        selected.get("shortCreatorQuality"),
    )


def extract_passport(selected: dict[str, Any], quality: dict[str, Any]) -> dict[str, Any]:
    return first_dict(
        selected.get("publicationPassport"),
        quality.get("publicationPassport"),
        selected.get("passport"),
    )


def extract_platform_summary(selected: dict[str, Any], quality: dict[str, Any], passport: dict[str, Any]) -> dict[str, Any]:
    return first_dict(
        selected.get("platformTargetSummary"),
        quality.get("platformTargetSummary"),
        passport.get("platformTargetSummary"),
        dict_value(quality.get("qualityPacketSummary")).get("platformTargetSummary"),
    )


def extract_platform_draft_summary(selected: dict[str, Any], quality: dict[str, Any]) -> dict[str, Any]:
    summary = first_dict(
        selected.get("platformDraftSummary"),
        quality.get("platformDraftSummary"),
    )
    if summary:
        return summary

    variants = list_value(
        selected.get("platformVariants")
        or selected.get("destinationPresets")
        or quality.get("platformVariants")
        or quality.get("destinationPresets")
    )
    if variants:
        return {
            "readyCount": len(variants),
            "totalCount": len(variants),
            "nextAction": "drafts present; proof-watch before publication",
            "raw": {"source": "platformVariants"},
        }
    return {}


def is_truthy_ready(value: Any) -> bool:
    text = text_value(value).lower()
    return text in {"ready", "true", "yes", "exported", "proof-ready", "exists", "complete"} or bool(value is True)


def export_proof_ready(selected: dict[str, Any], proof: dict[str, Any], quality: dict[str, Any], passport: dict[str, Any]) -> bool:
    if any(
        is_truthy_ready(value)
        for value in [
            selected.get("exportProofReady"),
            proof.get("exportProofReady"),
            quality.get("exportProofReady"),
            passport.get("exportProofReady"),
        ]
    ):
        return True
    export_status = first_text(
        selected.get("exportStatus"),
        proof.get("exportStatus"),
        passport.get("exportStatus"),
        fallback="",
    ).lower()
    path_text = first_text(
        selected.get("lastExportedPath"),
        proof.get("lastExportedPath"),
        selected.get("exportPath"),
        proof.get("exportPath"),
        fallback="",
    ).lower()
    return export_status in {"exported", "ready", "proof-ready"} or path_text.endswith((".mp4", ".mov", ".m4v"))


def cut_evidence_summary(selected: dict[str, Any], proof: dict[str, Any], quality: dict[str, Any], passport: dict[str, Any]) -> dict[str, Any]:
    evidence = first_dict(
        proof.get("cutIntelligenceEvidence"),
        selected.get("cutIntelligenceEvidence"),
        quality.get("cutIntelligenceEvidence"),
        passport.get("cutIntelligenceEvidence"),
    )
    return {
        "hasRisk": bool(evidence.get("hasRisk")),
        "hasOpportunity": bool(evidence.get("hasOpportunity")),
        "overlappedFindingCount": evidence.get("overlappedFindingCount", 0),
        "cadenceWarningCount": evidence.get("cadenceWarningCount", 0),
        "jumpCutRiskCount": evidence.get("jumpCutRiskCount", 0),
        "nextAction": evidence.get("nextAction", ""),
        "raw": evidence,
    }


def ready_fraction(summary: dict[str, Any]) -> tuple[int, int]:
    ready = summary.get("readyCount", 0)
    total = summary.get("totalCount", 0)
    if isinstance(ready, str) and "/" in ready:
        left, _, right = ready.partition("/")
        return int(number_value(left)), int(number_value(right))
    return int(number_value(ready)), int(number_value(total))


def recommended_action(
    selected: dict[str, Any],
    story_contract: dict[str, Any],
    cut_summary: dict[str, Any],
    platform_summary: dict[str, Any],
    platform_draft_summary: dict[str, Any],
    proof_ready: bool,
) -> dict[str, Any]:
    if not selected:
        return {
            "label": "select-short",
            "why": "No selected short is visible in current Studio state.",
            "nextCommand": "script/agentctl.sh shorts-review-next",
        }
    story_label = text_value(story_contract.get("label"), "story-contract-unknown")
    if story_label in {"story-contract-weak", "story-contract-needs-review"}:
        return {
            "label": "repair-story-contract",
            "why": text_value(story_contract.get("nextAction"), "Hook, turn, payoff, muted plan, or proof is incomplete."),
            "nextCommand": 'script/agentctl.sh shorts-record-review refine --note "repair hook-turn-payoff story contract"',
        }
    if cut_summary.get("hasRisk"):
        return {
            "label": "proof-listen-cut-flow",
            "why": text_value(cut_summary.get("nextAction"), "Cut evidence flags cadence, jump, or overlap risk."),
            "nextCommand": 'script/agentctl.sh shorts-record-review refine --note "proof-listen cut flow before Keep"',
        }
    if not proof_ready:
        return {
            "label": "render-or-attach-proof",
            "why": "No export proof is attached to this selected short.",
            "nextCommand": "script/agentctl.sh shorts-export-selected <output-dir> <basename>",
        }
    draft_ready_count, draft_total_count = ready_fraction(platform_draft_summary)
    if draft_total_count and draft_ready_count < draft_total_count:
        return {
            "label": "finish-platform-packet",
            "why": text_value(platform_draft_summary.get("nextAction"), "Platform variants or metadata are incomplete."),
            "nextCommand": "script/agentctl.sh shorts-quality-action draft-platform-pack",
        }
    review_status = text_value(selected.get("reviewStatus")).lower()
    if review_status == "refine":
        return {
            "label": "resolve-refinement",
            "why": "Platform drafts exist, but the short is marked Refine. Resolve the latest edit/caption/framing note, then proof-watch before Keep.",
            "nextCommand": "script/agentctl.sh selected-short-human-review-guidance --markdown",
        }
    if review_status != "keep":
        return {
            "label": "human-review-then-keep",
            "why": "Story, cut-flow, proof, and platform drafts are present. Watch the export at normal speed before Keep, Refine, or Reject.",
            "nextCommand": 'script/agentctl.sh shorts-review-selected keep "proof-watched; ready for Tower handoff review"',
        }
    ready_count, total_count = ready_fraction(platform_summary)
    if total_count and ready_count < total_count:
        return {
            "label": "tower-handoff-review",
            "why": text_value(platform_summary.get("nextAction"), "Platform handoff still needs a final receipt/readiness pass."),
            "nextCommand": "script/agentctl.sh selected-short-quality",
        }
    return {
        "label": "tower-handoff-review",
        "why": "Story, cut-flow, proof, review, and platform packet look ready enough for Tower/manual upload queue review.",
        "nextCommand": 'script/agentctl.sh shorts-record-review keep --note "proof-watched; ready for Tower handoff review"',
    }


def build_payload(base_url: str) -> dict[str, Any]:
    state, state_error = fetch_json(base_url, "/state")
    state = state or {}
    selected = selected_short_from_state(state)
    proof = selected_proof_from_state(state)
    quality = extract_quality(selected)
    passport = extract_passport(selected, quality)
    platform_summary = extract_platform_summary(selected, quality, passport)
    platform_draft_summary = extract_platform_draft_summary(selected, quality)
    story_payload = build_story_contract_payload(state)
    story_contract = dict_value(story_payload.get("shortStoryContract"))
    cut_summary = cut_evidence_summary(selected, proof, quality, passport)
    proof_ready = export_proof_ready(selected, proof, quality, passport)
    action = recommended_action(selected, story_contract, cut_summary, platform_summary, platform_draft_summary, proof_ready)
    duration = number_value(
        selected.get("recipeDuration")
        or selected.get("duration")
        or passport.get("recipeDuration")
        or passport.get("duration")
    )
    ready_count, total_count = ready_fraction(platform_summary)
    draft_ready_count, draft_total_count = ready_fraction(platform_draft_summary)
    return {
        "ok": bool(selected),
        "model": "quipsly-selected-short-production-brief",
        "version": "2026-06-30.selected-short-production-brief.v1",
        "baseUrl": base_url,
        "selectedShort": {
            "id": selected.get("id", ""),
            "title": selected.get("title", ""),
            "duration": duration,
            "reviewStatus": selected.get("reviewStatus", ""),
            "exportStatus": selected.get("exportStatus", ""),
            "destinations": selected.get("destinations", []),
        },
        "storyContract": story_contract,
        "cutEvidenceSummary": cut_summary,
        "proofReady": proof_ready,
        "qualitySummary": first_dict(quality.get("qualityPacketSummary"), quality.get("summary")),
        "platformTargetSummary": {
            "readyCount": ready_count,
            "totalCount": total_count,
            "nextAction": platform_summary.get("nextAction", ""),
            "raw": platform_summary,
        },
        "platformDraftSummary": {
            "readyCount": draft_ready_count,
            "totalCount": draft_total_count,
            "nextAction": platform_draft_summary.get("nextAction", ""),
            "raw": platform_draft_summary,
        },
        "recommendedAction": action,
        "safeCommands": {
            "storyContract": "script/agentctl.sh selected-short-story-contract --markdown",
            "reviewBrief": "script/agentctl.sh selected-short-review-brief --markdown",
            "workbench": "script/agentctl.sh shorts-review-workbench",
            "recordRefine": 'script/agentctl.sh shorts-record-review refine --note "needs hook, pacing, caption, framing, or cut-flow refinement"',
            "recordKeep": 'script/agentctl.sh shorts-record-review keep --note "proof-watched; ready for Tower handoff review"',
            "recordReject": 'script/agentctl.sh shorts-record-review reject --note "not strong enough for this publication batch"',
        },
        "endpointWarnings": [state_error] if state_error else [],
        "truth": "Read-only selected-short production brief. It does not export, publish, approve, mutate source media, or change short metadata.",
    }


def render_markdown(payload: dict[str, Any]) -> str:
    selected = dict_value(payload.get("selectedShort"))
    story = dict_value(payload.get("storyContract"))
    cut_summary = dict_value(payload.get("cutEvidenceSummary"))
    platform = dict_value(payload.get("platformTargetSummary"))
    platform_drafts = dict_value(payload.get("platformDraftSummary"))
    action = dict_value(payload.get("recommendedAction"))
    lines = [
        "# Selected short production brief",
        "",
        f"- Short: {selected.get('title', '') or 'none selected'}",
        f"- Duration: {selected.get('duration', 0):.1f}s",
        f"- Review/export: `{selected.get('reviewStatus', '')}` / `{selected.get('exportStatus', '')}`",
        f"- Story: `{story.get('label', 'unknown')}` ({story.get('readyCount', 0)}/{story.get('totalCount', 0)})",
        f"- Cut risk: `{cut_summary.get('hasRisk', False)}`",
        f"- Proof ready: `{payload.get('proofReady', False)}`",
        f"- Platform drafts: {platform_drafts.get('readyCount', 0)}/{platform_drafts.get('totalCount', 0)}",
        f"- Platform targets: {platform.get('readyCount', 0)}/{platform.get('totalCount', 0)}",
        f"- Recommended action: `{action.get('label', 'review')}`",
        f"- Why: {action.get('why', '')}",
        f"- Next command: `{action.get('nextCommand', '')}`",
        "",
        "## Story contract missing checks",
    ]
    missing = [
        dict_value(check)
        for check in list_value(story.get("checks"))
        if dict_value(check) and not dict_value(check).get("ready")
    ]
    if not missing:
        lines.append("- none reported")
    else:
        for check in missing:
            lines.append(f"- {check.get('id', 'check')}: {check.get('explanation', '')}")
    lines.extend([
        "",
        "## Cut-flow evidence",
        f"- Overlap findings: {cut_summary.get('overlappedFindingCount', 0)}",
        f"- Cadence warnings: {cut_summary.get('cadenceWarningCount', 0)}",
        f"- Jump-cut risks: {cut_summary.get('jumpCutRiskCount', 0)}",
        f"- Next: {cut_summary.get('nextAction', '') or 'Proof-watch before Keep.'}",
        "",
        "## Safe commands",
    ])
    for label, command in dict_value(payload.get("safeCommands")).items():
        lines.append(f"- `{label}`: `{command}`")
    warnings = list_value(payload.get("endpointWarnings"))
    if warnings:
        lines.extend(["", "## Endpoint warnings"])
        lines.extend(f"- {warning}" for warning in warnings)
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
            "error": f"Could not build selected-short production brief: {exc}",
            "nextAction": "Launch Quipsly Studio, select a short, then rerun selected-short-production-brief.",
            "truth": "Diagnostic failure only; no source media or short metadata changed.",
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
