#!/usr/bin/env python3
"""Focused selected-short human review guidance.

Reads the selected-short quality passport and renders the small review card a
human or agent needs before marking Keep, Refine, or Reject. It is read-only:
no exports, publishing, timeline mutation, or source-media changes.
"""

from __future__ import annotations

import argparse
import json
import sys
import urllib.error
import urllib.request
from typing import Any


DEFAULT_BASE_URL = "http://127.0.0.1:8765"
APP_NATIVE_MODEL = "quipslystudio-selected-short-human-review-guidance"
CLI_FALLBACK_MODEL = "quipsly-selected-short-human-review-guidance"


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


def float_value(value: Any) -> float:
    try:
        return float(value)
    except (TypeError, ValueError):
        return 0.0


def has_items(value: Any) -> bool:
    if isinstance(value, list):
        return len(value) > 0
    if isinstance(value, dict):
        return len(value) > 0
    if isinstance(value, str):
        return bool(value.strip())
    return False


def bool_value(value: Any) -> bool:
    if isinstance(value, bool):
        return value
    if isinstance(value, (int, float)):
        return value != 0
    if isinstance(value, str):
        return value.strip().lower() in {"1", "true", "yes", "risk", "warning"}
    return False


def int_value(value: Any) -> int:
    try:
        return int(float(value))
    except (TypeError, ValueError):
        return 0


def cut_evidence_has_risk(evidence: dict[str, Any]) -> bool:
    return (
        bool_value(evidence.get("hasRisk"))
        or int_value(evidence.get("highSeverityCount")) > 0
        or int_value(evidence.get("cadenceWarningCount")) > 0
        or int_value(evidence.get("jumpCutRiskCount")) > 0
        or int_value(evidence.get("overlappedFindingCount")) > 0
    )


def checklist_status(quality: dict[str, Any], item_id: str) -> str:
    for item in list_value(quality.get("reviewChecklist")):
        item = dict_value(item)
        if item.get("id") == item_id:
            return text_value(item.get("status"), "unknown")
    return "unknown"


def build_guidance(quality: dict[str, Any]) -> dict[str, Any]:
    hook = text_value(quality.get("hook"))
    caption = text_value(quality.get("captionDraft"))
    overlay = text_value(quality.get("primaryOverlayText"))
    duration = float_value(quality.get("recipeDuration"))
    review_mode = dict_value(quality.get("recommendedReviewMode"))
    structure = dict_value(quality.get("shortRecipeStructure"))
    transition_review = list_value(quality.get("shortTransitionReview"))
    cut_evidence = dict_value(quality.get("cutIntelligenceEvidence"))
    platform_variants = quality.get("platformVariants")
    export_status = text_value(quality.get("exportStatus"))

    hook_missing = not hook
    caption_missing = not caption and not overlay
    long_short = duration > 65
    structure_name = text_value(structure.get("structure") or structure.get("status")).lower()
    multi_segment = "multi" in structure_name or len(transition_review) > 0
    cut_risk = cut_evidence_has_risk(cut_evidence)
    platforms_missing = not has_items(platform_variants)
    export_missing = not export_status

    if hook_missing:
        review_read = "hook-first"
        primary_question = "Does this short make a clear promise, tension, mistake, or question in the first few seconds?"
    elif multi_segment:
        review_read = "join-rhythm"
        primary_question = "Do the internal joins feel intentional, or do they clip thought, reset captions, or fake momentum?"
    elif cut_risk:
        review_read = "cut-risk-proof"
        primary_question = "Does Cut Intelligence point to a cadence, jump-cut, or reaction issue that changes whether this should be kept?"
    elif caption_missing:
        review_read = "caption-framing"
        primary_question = "Can someone understand and want this short without audio, and does text stay off faces?"
    elif platforms_missing:
        review_read = "platform-fit"
        primary_question = "What native promise does this short make on YouTube Shorts, Instagram, Facebook, or LinkedIn?"
    elif long_short:
        review_read = "duration-tradeoff"
        primary_question = "Is the longer duration earning attention, or should this become a tighter short or a separate clip?"
    elif export_missing:
        review_read = "export-proof"
        primary_question = "Does the actual rendered file prove pacing, audio, captions, and framing, or is this still only metadata?"
    else:
        review_read = "human-final-pass"
        primary_question = "Would a real viewer keep watching, understand the point, and feel the people rather than the edit?"

    do_not_post_if = [
        "The hook is vague, missing, or starts after the viewer would scroll away.",
        "A jump or join makes the speaker feel chopped up or falsely frantic.",
        "Captions, overlays, or crop land on faces or hide the emotional cue.",
        "The payoff does not reward the hook.",
        "The clip is technically exportable but not emotionally worth posting.",
    ]
    refine_if = [
        "The first sentence can be tightened without losing warmth.",
        "A reaction, cover, or B-roll moment clarifies the emotional beat.",
        "The caption can become a clearer promise instead of a summary.",
        "A boundary nudge preserves breath while removing pure reset noise.",
        "A platform variant needs a more native title, caption, or framing choice.",
    ]
    keep_if = [
        "The first three seconds create curiosity or useful tension.",
        "The edit sounds like a person talking, not a machine removing silence.",
        "The visual crop, captions, and payoff all support the same idea.",
        "The platform packet tells a human exactly what to post and why.",
    ]

    return {
        "reviewRead": review_read,
        "primaryQuestion": primary_question,
        "proofInstruction": "Watch the short at normal speed before Keep. Scrub for repairs, but judge the viewer experience in playback.",
        "doNotPostIf": do_not_post_if,
        "refineIf": refine_if,
        "keepIf": keep_if,
        "signals": {
            "hookMissing": hook_missing,
            "captionOrOverlayMissing": caption_missing,
            "multiSegment": multi_segment,
            "cutRiskEvidencePresent": cut_risk,
            "platformVariantsMissing": platforms_missing,
            "exportProofMissing": export_missing,
            "longerThan65Seconds": long_short,
            "recommendedMode": review_mode.get("mode", ""),
            "hookStatus": checklist_status(quality, "hook"),
            "pacingStatus": checklist_status(quality, "pacing"),
            "captionFramingStatus": checklist_status(quality, "caption-framing"),
            "platformStatus": checklist_status(quality, "platform-variants"),
            "exportStatus": checklist_status(quality, "export-proof"),
        },
        "agentRule": "Optimize for viewer attention and human cadence together. Do not turn people into hyper-clean clip paste.",
    }


def build_payload(base_url: str) -> dict[str, Any]:
    try:
        focused = fetch_json(base_url, "/selected_short_human_review_guidance")
        if focused.get("model") == APP_NATIVE_MODEL and "humanReviewGuidance" in focused:
            focused["source"] = "app-native-selected-short-human-review-guidance"
            return focused
    except (OSError, ValueError, json.JSONDecodeError, urllib.error.URLError):
        pass

    quality = fetch_json(base_url, "/selected_short_quality")
    if quality.get("status") not in {"selected_short_quality", "selected_short_quality_fallback"} and not quality.get("selectedShortId"):
        return {
            "ok": False,
            "status": "needs-selected-short",
            "model": CLI_FALLBACK_MODEL,
            "version": "2026-06-30.selected-short-human-review-guidance.v1",
            "baseUrl": base_url,
            "nextAction": quality.get("nextAction", "Select a short recipe, then rerun selected-short-human-review-guidance."),
            "qualityStatus": quality.get("status", ""),
            "truth": "Read-only selected-short review guidance. No media, timeline, export, or publication state changed.",
        }

    guidance = build_guidance(quality)
    return {
        "ok": True,
        "status": "ready",
        "model": CLI_FALLBACK_MODEL,
        "version": "2026-06-30.selected-short-human-review-guidance.v1",
        "baseUrl": base_url,
        "selectedShort": {
            "id": quality.get("selectedShortId", ""),
            "title": quality.get("title", ""),
            "sequenceStart": quality.get("sequenceStart", 0),
            "sequenceEnd": quality.get("sequenceEnd", 0),
            "recipeDuration": quality.get("recipeDuration", 0),
            "reviewStatus": quality.get("reviewStatus", ""),
            "exportStatus": quality.get("exportStatus", ""),
            "primaryPlatform": quality.get("primaryPlatform", ""),
        },
        "humanReviewGuidance": guidance,
        "nextAction": guidance["primaryQuestion"],
        "safeCommands": {
            "quality": "script/agentctl.sh selected-short-quality",
            "productionBrief": "script/agentctl.sh selected-short-production-brief --markdown",
            "stateContract": "script/agentctl.sh selected-short-state-contract-check --markdown",
            "previewSelected": "script/agentctl.sh shorts-preview-selected true",
            "markKeep": 'script/agentctl.sh shorts-review-selected keep "human-reviewed for viewer attention and cadence"',
            "markRefine": 'script/agentctl.sh shorts-review-selected refine "needs hook, pacing, caption, framing, or cut-risk refinement"',
            "markReject": 'script/agentctl.sh shorts-review-selected reject "not strong enough for this platform batch"',
        },
        "truth": "Read-only selected-short human review guidance. It does not approve, export, publish, relink, move timeline decisions, or mutate source media.",
    }


def render_markdown(payload: dict[str, Any]) -> str:
    selected = dict_value(payload.get("selectedShort"))
    guidance = dict_value(payload.get("humanReviewGuidance"))
    lines = [
        "# Selected short human review guidance",
        "",
        f"- Status: `{payload.get('status', '')}`",
        f"- Short: {selected.get('title') or selected.get('id') or 'none selected'}",
        f"- Duration: {selected.get('recipeDuration', 0)}s",
        f"- Review status: `{selected.get('reviewStatus', '')}`",
        f"- Export status: `{selected.get('exportStatus', '')}`",
        f"- Review read: `{guidance.get('reviewRead', 'unknown')}`",
        "",
        "## Primary question",
        text_value(guidance.get("primaryQuestion"), text_value(payload.get("nextAction"))),
        "",
        "## Proof instruction",
        text_value(guidance.get("proofInstruction"), "Watch at normal speed before Keep, Refine, or Reject."),
        "",
        "## Do not post if",
    ]
    for item in list_value(guidance.get("doNotPostIf"))[:6] or ["no guidance reported"]:
        lines.append(f"- {item}")
    lines.extend(["", "## Refine if"])
    for item in list_value(guidance.get("refineIf"))[:6] or ["no guidance reported"]:
        lines.append(f"- {item}")
    lines.extend(["", "## Keep if"])
    for item in list_value(guidance.get("keepIf"))[:6] or ["no guidance reported"]:
        lines.append(f"- {item}")

    signals = dict_value(guidance.get("signals"))
    if signals:
        lines.extend(["", "## Signals"])
        for key in sorted(signals):
            lines.append(f"- `{key}`: `{signals[key]}`")

    lines.extend([
        "",
        "## Agent rule",
        text_value(guidance.get("agentRule"), "Optimize for viewer attention and human cadence together."),
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
            "error": f"Could not read selected-short human review guidance: {exc}",
            "nextAction": "Launch Quipsly Studio, select a short, then rerun selected-short-human-review-guidance.",
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
