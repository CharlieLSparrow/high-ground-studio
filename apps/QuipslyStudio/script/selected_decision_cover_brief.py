#!/usr/bin/env python3
"""Suggest reversible cover candidates for the selected Quipsly Studio decision.

This is read-only. It does not insert clips, move timeline decisions, export,
publish, relink media, or mutate source files.
"""

from __future__ import annotations

import argparse
import json
import sys
from typing import Any

from decision_flow_contract_common import build_decision_flow_contract, dict_value, float_value, list_value, text_value
from decision_review_workbench import DEFAULT_BASE_URL, build_workbench, fetch_json


def first_present(*values: Any, fallback: Any = None) -> Any:
    for value in values:
        if value not in (None, "", [], {}):
            return value
    return fallback


def compact(value: Any) -> str:
    return text_value(value).lower()


def selected_boundary(workbench: dict[str, Any]) -> dict[str, Any]:
    decision = dict_value(workbench.get("selectedDecision"))
    return dict_value(decision.get("boundary"))


def extract_lanes(state: dict[str, Any]) -> list[dict[str, Any]]:
    candidates = [
        state.get("lanes"),
        dict_value(state.get("sequence")).get("lanes"),
        dict_value(state.get("activeSequence")).get("lanes"),
        dict_value(state.get("timeline")).get("lanes"),
        dict_value(state.get("mediaSequence")).get("lanes"),
    ]
    for candidate in candidates:
        lanes = list_value(candidate)
        if lanes:
            return [dict_value(lane) for lane in lanes if dict_value(lane)]
    return []


def source_video_for(lane: dict[str, Any]) -> dict[str, Any]:
    return dict_value(
        lane.get("sourceVideo")
        or lane.get("source")
        or lane.get("asset")
        or lane.get("media")
        or {}
    )


def lane_name(lane: dict[str, Any]) -> str:
    source = source_video_for(lane)
    return text_value(first_present(lane.get("name"), source.get("name"), source.get("fileName"), fallback="Unnamed source"))


def lane_id(lane: dict[str, Any]) -> str:
    source = source_video_for(lane)
    return text_value(first_present(lane.get("id"), source.get("id"), fallback=""))


def source_offset(lane: dict[str, Any]) -> float:
    source = source_video_for(lane)
    return float_value(first_present(lane.get("offset"), lane.get("sequenceOffset"), source.get("offset"), source.get("sequenceOffset"), fallback=0))


def source_duration(lane: dict[str, Any]) -> float:
    source = source_video_for(lane)
    return float_value(first_present(lane.get("duration"), source.get("duration"), source.get("assetDuration"), fallback=0))


def has_proxy(lane: dict[str, Any]) -> bool:
    source = source_video_for(lane)
    text = " ".join(
        compact(value)
        for value in [
            lane.get("status"),
            lane.get("readiness"),
            lane.get("proxyStatus"),
            source.get("status"),
            source.get("readiness"),
            source.get("proxyStatus"),
            source.get("proxyPath"),
            source.get("proxyURL"),
        ]
    )
    return "proxy ready" in text or "proxy-safe" in text or "ready" in text or ".mp4" in text or ".mov" in text


def source_kind(lane: dict[str, Any]) -> str:
    source = source_video_for(lane)
    text = " ".join(
        compact(value)
        for value in [
            lane.get("role"),
            lane.get("kind"),
            lane.get("type"),
            source.get("role"),
            source.get("kind"),
            source.get("type"),
            lane_name(lane),
        ]
    )
    if any(token in text for token in ["reference", "source clip", "clip", "b-roll", "broll"]):
        return "source-clip-cover"
    if any(token in text for token in ["360", "insta"]):
        return "360-reframe-cover"
    if any(token in text for token in ["charlie", "homer", "camera"]):
        return "reaction-or-camera-cover"
    if "audio" in text:
        return "audio-only-context"
    return "context-cover"


def overlap_seconds(lane: dict[str, Any], start: float, end: float) -> float:
    offset = source_offset(lane)
    duration = source_duration(lane)
    if duration <= 0:
        return 0
    lane_start = offset
    lane_end = offset + duration
    return max(0.0, min(end, lane_end) - max(start, lane_start))


def decision_needs_cover(workbench: dict[str, Any], contract: dict[str, Any]) -> tuple[bool, str]:
    decision = dict_value(workbench.get("selectedDecision"))
    text = " ".join(
        compact(value)
        for value in [
            decision.get("risk"),
            decision.get("cutStyle"),
            decision.get("coverStrategy"),
            workbench.get("why"),
            workbench.get("tradeoff"),
            workbench.get("nextReviewAction"),
            contract.get("label"),
            contract.get("safeAction"),
        ]
    )
    missing = [
        dict_value(check).get("id")
        for check in list_value(contract.get("checks"))
        if dict_value(check) and not dict_value(check).get("ready")
    ]
    if "jump" in missing or "cover" in missing:
        return True, "edit-flow contract says jump/cover readiness still needs work"
    if any(token in text for token in ["jump", "harsh", "abrupt", "reaction", "cover", "b-roll", "broll"]):
        return True, "selected decision mentions jump, reaction, cover, or B-roll risk"
    return False, "no explicit cover need is signaled; only use a cover if it clarifies the story"


def score_candidate(lane: dict[str, Any], workbench: dict[str, Any], overlap: float, selected_lane_id: str) -> tuple[int, list[str]]:
    score = 0
    reasons: list[str] = []
    kind = source_kind(lane)
    name = compact(lane_name(lane))
    if lane_id(lane) == selected_lane_id:
        return -100, ["same lane as selected decision"]
    if overlap > 0:
        score += 35
        reasons.append(f"overlaps selected boundary by {overlap:.2f}s")
    else:
        score -= 20
        reasons.append("not present at the selected boundary")
    if has_proxy(lane):
        score += 20
        reasons.append("proxy/readiness appears available")
    else:
        score -= 25
        reasons.append("proxy/readiness is uncertain")
    if kind == "reaction-or-camera-cover":
        score += 18
        reasons.append("camera/reaction source can cover same-speaker jump cuts")
    elif kind == "source-clip-cover":
        score += 14
        reasons.append("source/reference clip may clarify the spoken point")
    elif kind == "360-reframe-cover":
        score += 10
        reasons.append("360 source can create a new composition without chopping media")
    elif kind == "audio-only-context":
        score -= 15
        reasons.append("audio-only lanes help sync/cadence but cannot visually cover a jump")
    decision_name = compact(dict_value(workbench.get("selectedDecision")).get("laneName"))
    if decision_name and name and decision_name not in name:
        score += 8
        reasons.append("different source than the selected lane")
    return score, reasons


def build_cover_brief(base_url: str) -> dict[str, Any]:
    workbench = build_workbench(base_url)
    state, state_error = fetch_json(base_url, "/state")
    state = state or {}
    contract = build_decision_flow_contract(workbench, source="selected-decision-cover-brief")
    boundary = selected_boundary(workbench)
    start = float_value(boundary.get("start"))
    duration = float_value(boundary.get("duration"))
    end = float_value(boundary.get("end"), start + duration)
    if end <= start and duration > 0:
        end = start + duration
    selected = dict_value(workbench.get("selectedDecision"))
    selected_lane_id = text_value(selected.get("laneId"))
    needs_cover, cover_reason = decision_needs_cover(workbench, contract)

    candidates: list[dict[str, Any]] = []
    for lane in extract_lanes(state):
        overlap = overlap_seconds(lane, start, end)
        score, reasons = score_candidate(lane, workbench, overlap, selected_lane_id)
        if score <= -80:
            continue
        kind = source_kind(lane)
        ready = has_proxy(lane)
        action = "Cue as possible cover, then proof-listen before applying metadata."
        if not ready:
            action = "Recover or attach a proxy before using this as visual cover."
        elif kind == "source-clip-cover":
            action = "Use only if it clarifies the sentence being spoken; avoid wallpaper."
        elif kind == "360-reframe-cover":
            action = "Try a reframe/keyframe cover without mutating the original 360 source."
        elif kind == "audio-only-context":
            action = "Use for cadence/sync evidence, not visual cover."
        candidates.append({
            "laneId": lane_id(lane),
            "name": lane_name(lane),
            "kind": kind,
            "score": score,
            "overlapSeconds": round(overlap, 3),
            "proxyReady": ready,
            "sequenceOffset": source_offset(lane),
            "duration": source_duration(lane),
            "reasons": reasons,
            "safeAction": action,
        })

    candidates.sort(key=lambda item: (item["score"], item["overlapSeconds"], item["name"]), reverse=True)
    top = candidates[:8]
    return {
        "ok": True,
        "model": "quipsly-selected-decision-cover-brief",
        "version": "2026-06-30.cover-brief.v1",
        "baseUrl": base_url,
        "selectedDecision": selected,
        "boundary": boundary,
        "needsCover": needs_cover,
        "coverReason": cover_reason,
        "editFlowContract": contract,
        "candidateCount": len(candidates),
        "candidates": top,
        "nextAction": (
            top[0]["safeAction"]
            if needs_cover and top
            else "No cover is required by current evidence. Preserve the clean decision unless a human review finds a visual jump or story need."
        ),
        "endpointWarnings": [state_error] if state_error else [],
        "agentInstruction": "If the selected decision feels visually harsh, choose a candidate that is present at the boundary, proxy-ready, and story-relevant. Do not insert or publish from this brief; record a review note first.",
        "truth": "Read-only cover brief over whole source lanes. It suggests reversible metadata strategies and never inserts clips, mutates media, exports, publishes, or changes timeline decisions.",
    }


def render_markdown(payload: dict[str, Any]) -> str:
    boundary = dict_value(payload.get("boundary"))
    lines = [
        "# Selected decision cover brief",
        "",
        f"- Needs cover: `{payload.get('needsCover', False)}`",
        f"- Reason: {payload.get('coverReason', '')}",
        f"- Boundary: {boundary.get('start', 0)} -> {boundary.get('end', 0)} ({boundary.get('duration', 0)}s)",
        f"- Candidates: {payload.get('candidateCount', 0)}",
        f"- Next: {payload.get('nextAction', '')}",
        "",
        "## Candidate covers",
    ]
    for index, candidate in enumerate(list_value(payload.get("candidates")), start=1):
        candidate = dict_value(candidate)
        lines.extend([
            f"### {index}. {candidate.get('name', 'Unnamed source')}",
            f"- Kind: `{candidate.get('kind', '')}`",
            f"- Score: {candidate.get('score', 0)}",
            f"- Overlap: {candidate.get('overlapSeconds', 0)}s",
            f"- Proxy ready: {candidate.get('proxyReady', False)}",
            f"- Safe action: {candidate.get('safeAction', '')}",
        ])
        reasons = list_value(candidate.get("reasons"))
        if reasons:
            lines.append("- Reasons:")
            lines.extend(f"  - {reason}" for reason in reasons)
        lines.append("")
    if not payload.get("candidates"):
        lines.append("- No cover candidates were visible from current state. If the cut needs cover, relink/recover sources or use the source wall.")
        lines.append("")
    warnings = list_value(payload.get("endpointWarnings"))
    if warnings:
        lines.extend(["## Endpoint warnings", ""])
        lines.extend(f"- {warning}" for warning in warnings)
        lines.append("")
    lines.extend([f"Agent instruction: {payload.get('agentInstruction', '')}", "", f"Truth: {payload.get('truth', '')}"])
    return "\n".join(lines).strip() + "\n"


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--base-url", default=DEFAULT_BASE_URL)
    parser.add_argument("--markdown", action="store_true")
    parser.add_argument("--json", action="store_true")
    args = parser.parse_args()

    try:
        payload = build_cover_brief(args.base_url)
    except Exception as exc:  # noqa: BLE001 - diagnostic CLI.
        payload = {
            "ok": False,
            "error": f"Could not build selected-decision cover brief: {exc}",
            "nextAction": "Launch Quipsly Studio, select a decision, then rerun selected-decision-cover-brief.",
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
