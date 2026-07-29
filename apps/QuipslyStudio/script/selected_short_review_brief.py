#!/usr/bin/env python3
"""Render a read-only selected-short review brief from Quipsly Studio.

Shorts are where fast edits can get too clever too quickly. This helper turns
the currently selected short quality passport into a compact review packet so a
human or agent can check hook, pacing, captions, framing, cut-risk, and platform
readiness before treating a short as publishable.
"""

from __future__ import annotations

import argparse
import json
import os
import urllib.request
from typing import Any

from short_story_contract_common import build_short_story_contract, short_story_contract_markdown_lines


DEFAULT_BASE_URL = os.environ.get("QUIPSLY_STUDIO_AGENT_URL", "http://127.0.0.1:8765")


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
            "truth": "Read-only request failed before any export, publish, approval, or source-media mutation.",
        }


def list_value(value: Any) -> list[Any]:
    return value if isinstance(value, list) else []


def dict_value(value: Any) -> dict[str, Any]:
    return value if isinstance(value, dict) else {}


def count_text(value: Any) -> str:
    if isinstance(value, bool):
        return "1" if value else "0"
    if value is None:
        return "0"
    return str(value)


def make_brief(base_url: str) -> dict[str, Any]:
    quality = fetch_json(base_url, "/selected_short_quality")
    production = fetch_json(base_url, "/selected_short_production_brief")
    human_guidance = fetch_json(base_url, "/selected_short_human_review_guidance")
    human_guidance_payload = dict_value(human_guidance.get("humanReviewGuidance")) or human_guidance
    selected = dict_value(quality.get("selectedShort")) or dict_value(quality.get("short"))
    if not selected and quality.get("selectedShortId"):
        selected = {
            "id": quality.get("selectedShortId", ""),
            "title": quality.get("title", ""),
            "duration": quality.get("recipeDuration") or quality.get("duration", 0),
            "sequenceStart": quality.get("sequenceStart", 0),
            "sequenceEnd": quality.get("sequenceEnd", 0),
            "reviewStatus": quality.get("reviewStatus", ""),
            "exportStatus": quality.get("exportStatus", ""),
            "hookText": quality.get("hook", ""),
            "captionDraft": quality.get("captionDraft", ""),
            "primaryOverlayText": quality.get("primaryOverlayText", ""),
            "platforms": quality.get("platforms", []),
            "platformVariants": quality.get("platformVariants", []),
            "platformDraftSummary": quality.get("platformDraftSummary", {}),
            "platformTargetSummary": quality.get("platformTargetSummary", {}),
        }
    proof = dict_value(quality.get("selectedShortProof")) or dict_value(quality.get("proof"))
    passport = dict_value(quality.get("qualityPassport")) or dict_value(quality.get("passport"))
    recommended_review_mode = dict_value(quality.get("recommendedReviewMode"))
    recommended_action = dict_value(production.get("recommendedAction"))
    recipe_structure = dict_value(quality.get("shortRecipeStructure"))
    transition_review = list_value(quality.get("shortTransitionReview"))
    safe_commands = dict_value(quality.get("safeCommands"))
    if production.get("safeCommands"):
        safe_commands = {**dict_value(production.get("safeCommands")), **safe_commands}
    cut_evidence = (
        dict_value(quality.get("cutIntelligenceEvidence"))
        or dict_value(quality.get("selectedShortCutIntelligenceEvidence"))
        or dict_value(proof.get("cutIntelligenceEvidence"))
        or dict_value(selected.get("cutIntelligenceEvidence"))
    )
    selected_for_contract = dict(selected)
    if not selected_for_contract.get("hookText"):
        selected_for_contract["hookText"] = selected.get("hook") or passport.get("hook") or quality.get("hook", "")
    story_contract = proof.get("shortStoryContract") or selected.get("shortStoryContract") or build_short_story_contract(
        selected_for_contract,
        proof,
        cut_evidence,
        source="selected-short-review-brief",
    )

    return {
        "status": "selected_short_review_brief",
        "model": "quipslystudio-selected-short-review-brief",
        "baseUrl": base_url.rstrip("/"),
        "qualityStatus": quality.get("status", ""),
        "shortId": selected.get("id") or quality.get("selectedShortId", ""),
        "title": selected.get("title") or quality.get("title", ""),
        "duration": selected.get("duration") or selected.get("durationSeconds") or quality.get("recipeDuration") or quality.get("duration", 0),
        "sequenceStart": selected.get("sequenceStart") or selected.get("start") or quality.get("sequenceStart", 0),
        "sequenceEnd": selected.get("sequenceEnd") or selected.get("end") or quality.get("sequenceEnd", 0),
        "hook": selected.get("hook") or passport.get("hook") or quality.get("hook", ""),
        "captionDraft": selected.get("captionDraft") or quality.get("captionDraft", ""),
        "primaryOverlayText": selected.get("primaryOverlayText") or quality.get("primaryOverlayText", ""),
        "platforms": selected.get("platforms") or quality.get("platforms", []),
        "recommendedReviewMode": recommended_review_mode,
        "recommendedAction": recommended_action,
        "platformDraftSummary": production.get("platformDraftSummary") or quality.get("platformDraftSummary") or selected.get("platformDraftSummary") or {},
        "platformTargetSummary": production.get("platformTargetSummary") or quality.get("platformTargetSummary") or selected.get("platformTargetSummary") or {},
        "shortRecipeStructure": recipe_structure,
        "shortTransitionReview": transition_review,
        "humanReviewGuidance": human_guidance_payload,
        "humanReviewGuidanceEnvelope": human_guidance,
        "qualityPassport": passport,
        "proof": proof,
        "shortStoryContract": story_contract,
        "cutIntelligenceEvidence": cut_evidence,
        "cutRisk": quality.get("cutRisk") or passport.get("cutRisk") or proof.get("cutRisk") or "",
        "publicationReadiness": quality.get("publicationReadiness") or proof.get("publicationReadiness") or "",
        "textBurnPolicy": quality.get("textBurnPolicy") or proof.get("textBurnPolicy") or {},
        "humanCheck": quality.get("humanCheck") or selected.get("humanCheck") or "Watch once before posting.",
        "warnings": list_value(quality.get("warnings")) + list_value(passport.get("warnings")) + list_value(proof.get("warnings")),
        "reviewChecklist": list_value(quality.get("reviewChecklist")) or [
            "Watch the short end to end at normal speed.",
            "Confirm the hook is understandable without episode context.",
            "Check the crop/framing does not hide faces or important source material.",
            "Confirm captions or overlay text do not cover faces or platform UI safe zones.",
            "Check cut rhythm: no robotic cadence, clipped breaths, or false reaction covers.",
            "Mark Keep, Refine, or Reject before treating it as posting-ready.",
        ],
        "safeCommands": safe_commands,
        "truth": "Read-only selected-short brief. It does not approve, export, publish, burn captions, trim, delete, or mutate source media.",
    }


def render_markdown(brief: dict[str, Any]) -> str:
    proof = dict_value(brief.get("proof"))
    story_contract = dict_value(brief.get("shortStoryContract"))
    passport = dict_value(brief.get("qualityPassport"))
    recommended_review_mode = dict_value(brief.get("recommendedReviewMode"))
    recommended_action = dict_value(brief.get("recommendedAction"))
    platform_drafts = dict_value(brief.get("platformDraftSummary"))
    platform_targets = dict_value(brief.get("platformTargetSummary"))
    human_guidance = dict_value(brief.get("humanReviewGuidance"))
    recipe_structure = dict_value(brief.get("shortRecipeStructure"))
    transition_review = list_value(brief.get("shortTransitionReview"))
    text_burn = dict_value(brief.get("textBurnPolicy"))
    safe_commands = dict_value(brief.get("safeCommands"))

    lines: list[str] = [
        "# Quipsly Selected Short Brief",
        "",
        f"- Status: `{brief.get('qualityStatus', '')}`",
        f"- Base URL: `{brief.get('baseUrl', '')}`",
        f"- Truth: {brief.get('truth', '')}",
        "",
        "## Short",
        "",
        f"- ID: `{brief.get('shortId', '')}`",
        f"- Title: {brief.get('title', '')}",
        f"- Duration: {brief.get('duration', 0)}",
        f"- Sequence range: {brief.get('sequenceStart', 0)} -> {brief.get('sequenceEnd', 0)}",
        f"- Platforms: {brief.get('platforms', [])}",
        "",
        "## Creative review",
        "",
        f"- Hook: {brief.get('hook', '')}",
        f"- Caption draft: {brief.get('captionDraft', '')}",
        f"- Primary overlay: {brief.get('primaryOverlayText', '')}",
        f"- Cut risk: {brief.get('cutRisk', '')}",
        f"- Human check: {brief.get('humanCheck', '')}",
        f"- Publication readiness: {brief.get('publicationReadiness', '')}",
    ]

    if recommended_action:
        lines.extend(["", "## Next safest action", ""])
        lines.append(f"- Action: `{recommended_action.get('label', '')}`")
        lines.append(f"- Why: {recommended_action.get('why', '')}")
        lines.append(f"- Command: `{recommended_action.get('nextCommand') or recommended_action.get('command', '')}`")

    if platform_drafts or platform_targets:
        lines.extend(["", "## Platform packet truth", ""])
        if platform_drafts:
            lines.append(
                f"- Draft copy: {count_text(platform_drafts.get('readyCount'))}/{count_text(platform_drafts.get('totalCount'))}. "
                f"{platform_drafts.get('nextAction', '')}"
            )
        if platform_targets:
            lines.append(
                f"- Handoff targets: {count_text(platform_targets.get('readyCount'))}/{count_text(platform_targets.get('totalCount'))}. "
                f"{platform_targets.get('nextAction', '')}"
            )

    contract_lines = short_story_contract_markdown_lines(
        story_contract,
        selected_short_title=str(brief.get("title", "No selected short")),
    )
    if contract_lines and contract_lines[0].startswith("# "):
        contract_lines = ["## Short story contract", *contract_lines[2:]]
    lines.extend(["", *contract_lines])

    if recommended_review_mode:
        lines.extend(["", "## Recommended review mode", ""])
        lines.append(f"- Mode: `{recommended_review_mode.get('mode', '')}`")
        lines.append(f"- Label: {recommended_review_mode.get('label', '')}")
        lines.append(f"- Reason: {recommended_review_mode.get('reason', '')}")
        lines.append(f"- First action: {recommended_review_mode.get('firstAction', '')}")

    if human_guidance and human_guidance.get("status") != "request_failed":
        lines.extend(["", "## Human review read", ""])
        lines.append(f"- Review read: `{human_guidance.get('reviewRead', '')}`")
        lines.append(f"- Primary question: {human_guidance.get('primaryQuestion', '')}")
        lines.append(f"- Proof instruction: {human_guidance.get('proofInstruction', '')}")

    if recipe_structure:
        lines.extend(["", "## Recipe structure", ""])
        lines.append(f"- Structure: {recipe_structure.get('structure', '')}")
        lines.append(f"- Segment count: {recipe_structure.get('segmentCount', 0)}")
        lines.append(f"- Editing implication: {recipe_structure.get('editingImplication', '')}")
        segments = list_value(recipe_structure.get("segments"))
        if segments:
            lines.extend(["", "| # | Sequence start | Sequence end | Duration | Source |", "|---|---:|---:|---:|---|"])
            for segment in segments:
                segment_dict = dict_value(segment)
                lines.append(
                    "| {index} | {start} | {end} | {duration} | {source} |".format(
                        index=segment_dict.get("index", ""),
                        start=segment_dict.get("sequenceStart", 0),
                        end=segment_dict.get("sequenceEnd", 0),
                        duration=segment_dict.get("duration", 0),
                        source=segment_dict.get("source", ""),
                    )
                )

    if transition_review:
        lines.extend(["", "## Segment join checks", ""])
        lines.extend([
            "| Join | Type | Out | In | Gap | Risk |",
            "|---|---|---:|---:|---:|---|",
        ])
        for join in transition_review:
            join_dict = dict_value(join)
            lines.append(
                "| {join} | {join_type} | {out_time} | {in_time} | {gap} | {risk} |".format(
                    join=join_dict.get("joinIndex", ""),
                    join_type=join_dict.get("joinType", ""),
                    out_time=join_dict.get("outSequenceTime", 0),
                    in_time=join_dict.get("inSequenceTime", 0),
                    gap=join_dict.get("sequenceGap", 0),
                    risk=join_dict.get("risk", ""),
                )
            )

    if passport:
        lines.extend(["", "## Quality passport", ""])
        for key, value in passport.items():
            if isinstance(value, (dict, list)):
                continue
            lines.append(f"- {key}: {value}")

    if proof:
        lines.extend(["", "## Proof", ""])
        for key, value in proof.items():
            if isinstance(value, (dict, list)):
                continue
            lines.append(f"- {key}: {value}")

    if text_burn:
        lines.extend(["", "## Text/caption safety", ""])
        for key, value in text_burn.items():
            if isinstance(value, (dict, list)):
                continue
            lines.append(f"- {key}: {value}")

    warnings = list_value(brief.get("warnings"))
    if warnings:
        lines.extend(["", "## Warnings", ""])
        lines.extend(f"- {warning}" for warning in warnings)

    lines.extend(["", "## Review checklist", ""])
    for item in list_value(brief.get("reviewChecklist")):
        if isinstance(item, dict):
            label = item.get("label") or item.get("id") or "check"
            status = item.get("status", "")
            next_action = item.get("nextAction", "")
            lines.append(f"- {label}: `{status}`. {next_action}")
        else:
            lines.append(f"- {item}")

    if safe_commands:
        lines.extend(["", "## Safe next commands", ""])
        for key, value in safe_commands.items():
            lines.append(f"- {key}: `{value}`")

    lines.append("")
    return "\n".join(lines)


def main() -> int:
    parser = argparse.ArgumentParser(description="Create a selected-short review brief from Quipsly Studio.")
    parser.add_argument("--base-url", default=DEFAULT_BASE_URL)
    parser.add_argument("--json", action="store_true", help="Print JSON instead of Markdown.")
    parser.add_argument("--markdown", action="store_true", help="Print Markdown. Default.")
    args = parser.parse_args()

    brief = make_brief(args.base_url)
    if args.json:
        print(json.dumps(brief, indent=2, sort_keys=True))
    else:
        print(render_markdown(brief))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
