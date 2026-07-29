#!/usr/bin/env python3
"""Build an Episode 4 YouTube-standard edit recipe over the intact host spine.

This is a metadata-only draft branch. It does not cut media, write app session
state, render exports, or publish. The purpose is to turn transcript/edit
intelligence into a reviewable first-pass map: SHOW islands, SKIP candidates,
cadence checks, reaction-cover notes, and source-placeholder slots.
"""
from __future__ import annotations

import argparse
import html
import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

RELEASE_ROOT = Path("/Volumes/My Passport/Episode_and_Shorts_Test")
SPINE_POINTER = RELEASE_ROOT / "review-board/transcript-spines/latest-episode-04-transcript-spine.json"
EDIT_POINTER = RELEASE_ROOT / "review-board/episode4-edit-intelligence/latest-episode4-edit-intelligence.json"
DURATION_POINTER = RELEASE_ROOT / "review-board/episode4-host-spine-duration-workbench/latest-episode4-host-spine-duration-workbench.json"
PLACEHOLDER_POINTER = RELEASE_ROOT / "review-board/episode4-source-placeholder-workbench/latest-episode4-source-placeholder-workbench.json"
OUT_ROOT = RELEASE_ROOT / "review-board/episode4-youtube-standard-recipe"
LATEST_POINTER = OUT_ROOT / "latest-episode4-youtube-standard-recipe.json"
SCHEMA = "quipsly.episode4-youtube-standard-recipe.v1"


def iso_now() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def stamp() -> str:
    return datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S-%f-youtube-standard-recipe")


def load_json(path: Path) -> dict[str, Any]:
    try:
        value = json.loads(path.read_text(encoding="utf-8"))
        return value if isinstance(value, dict) else {}
    except Exception:
        return {}


def load_pointer(path: Path) -> dict[str, Any]:
    pointer = load_json(path)
    target = pointer.get("jsonPath")
    if isinstance(target, str) and target:
        payload = load_json(Path(target))
        if payload:
            return {**pointer, **payload, "pointerPath": str(path)}
    return {**pointer, "pointerPath": str(path)}


def write_json(path: Path, payload: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, indent=2, sort_keys=True) + "\n", encoding="utf-8")


def dict_list(value: Any) -> list[dict[str, Any]]:
    return value if isinstance(value, list) and all(isinstance(item, dict) for item in value) else []


def as_float(value: Any, fallback: float = 0.0) -> float:
    try:
        return float(value)
    except Exception:
        return fallback


def fmt_time(seconds: Any) -> str:
    value = max(0.0, as_float(seconds))
    whole = int(value)
    return f"{whole // 3600:02d}:{(whole % 3600) // 60:02d}:{whole % 60:02d}"


def esc(value: Any) -> str:
    return html.escape(str(value if value is not None else ""))


def duration_seconds(spine: dict[str, Any]) -> float:
    counts = spine.get("counts") if isinstance(spine.get("counts"), dict) else {}
    return as_float(counts.get("durationSeconds") or spine.get("durationSeconds"))


def segment_start(segment: dict[str, Any]) -> float:
    return as_float(segment.get("start", segment.get("startSeconds")))


def segment_end(segment: dict[str, Any]) -> float:
    return as_float(segment.get("end", segment.get("endSeconds")))


def clamp_range(start: float, end: float, duration: float) -> tuple[float, float]:
    lo = max(0.0, min(start, duration))
    hi = max(lo, min(end, duration))
    return lo, hi


def candidate_range(row: dict[str, Any], duration: float, before: float, after: float) -> tuple[float, float]:
    start = as_float(row.get("startSeconds"))
    end = as_float(row.get("endSeconds"))
    return clamp_range(start - before, end + after, duration)


def merge_ranges(ranges: list[dict[str, Any]], gap: float = 18.0) -> list[dict[str, Any]]:
    ordered = sorted(ranges, key=lambda item: (as_float(item.get("startSeconds")), as_float(item.get("endSeconds"))))
    merged: list[dict[str, Any]] = []
    for item in ordered:
        start = as_float(item.get("startSeconds"))
        end = as_float(item.get("endSeconds"))
        if not merged or start > as_float(merged[-1].get("endSeconds")) + gap:
            merged.append({**item, "evidenceIds": list(item.get("evidenceIds") or [])})
            continue
        current = merged[-1]
        current["endSeconds"] = max(as_float(current.get("endSeconds")), end)
        current["durationSeconds"] = round(as_float(current.get("endSeconds")) - as_float(current.get("startSeconds")), 3)
        current["confidence"] = "mixed"
        current["reason"] = "Merged nearby Episode 4 candidate evidence into one review island."
        current["priorityScore"] = max(as_float(current.get("priorityScore")), as_float(item.get("priorityScore")))
        current["evidenceIds"] = list(dict.fromkeys(list(current.get("evidenceIds") or []) + list(item.get("evidenceIds") or [])))
    return merged


def total_duration(ranges: list[dict[str, Any]]) -> float:
    return sum(max(0.0, as_float(item.get("endSeconds")) - as_float(item.get("startSeconds"))) for item in ranges)


def expand_to_target(ranges: list[dict[str, Any]], target_low: float, duration: float) -> list[dict[str, Any]]:
    if not ranges or total_duration(ranges) >= target_low:
        return ranges
    needed = target_low - total_duration(ranges)
    per_side = min(90.0, needed / max(1, len(ranges)) / 2)
    expanded = []
    for item in ranges:
        start, end = clamp_range(as_float(item.get("startSeconds")) - per_side, as_float(item.get("endSeconds")) + per_side, duration)
        expanded.append({**item, "startSeconds": round(start, 3), "endSeconds": round(end, 3), "durationSeconds": round(end - start, 3)})
    return merge_ranges(expanded, gap=12.0)


def confidence_score(value: Any) -> float:
    text = str(value or "").casefold()
    if text == "high":
        return 3.0
    if text == "medium":
        return 2.0
    if text == "low":
        return 1.0
    return 1.5


def select_ranges_for_target(raw: list[dict[str, Any]], target_low: float, target_high: float) -> list[dict[str, Any]]:
    if not raw:
        return []
    selected: list[dict[str, Any]] = []
    for item in sorted(raw, key=lambda row: (as_float(row.get("priorityScore")), -as_float(row.get("startSeconds"))), reverse=True):
        trial = merge_ranges(selected + [item], gap=18.0)
        trial_total = total_duration(trial)
        selected_total = total_duration(merge_ranges(selected, gap=18.0))
        must_include = bool(item.get("mustInclude"))
        if must_include or trial_total <= target_high or selected_total < target_low:
            selected.append(item)
        if total_duration(merge_ranges(selected, gap=18.0)) >= target_low:
            optional_remaining = [
                row
                for row in raw
                if row not in selected and as_float(row.get("priorityScore")) >= 8.0 and total_duration(merge_ranges(selected + [row], gap=18.0)) <= target_high
            ]
            if not optional_remaining:
                break
    return merge_ranges(selected, gap=18.0)


def transcript_context(segments: list[dict[str, Any]], start: float, end: float, limit: int = 4) -> list[dict[str, Any]]:
    hits = []
    for segment in segments:
        seg_start = segment_start(segment)
        seg_end = segment_end(segment)
        if seg_end < start or seg_start > end:
            continue
        text = str(segment.get("text") or "").strip()
        if not text:
            continue
        hits.append(
            {
                "segmentId": segment.get("segmentId"),
                "timeLabel": segment.get("timeLabel") or fmt_time(seg_start),
                "startSeconds": seg_start,
                "endSeconds": seg_end,
                "speaker": segment.get("speaker"),
                "text": text,
            }
        )
        if len(hits) >= limit:
            break
    return hits


def pick_youtube_variant(duration_payload: dict[str, Any]) -> dict[str, Any]:
    for variant in dict_list(duration_payload.get("variants")):
        if variant.get("id") == "ep4-host-spine-youtube-standard":
            return variant
    return {}


def base_truth() -> dict[str, Any]:
    return {
        "metadataOnly": True,
        "sourceFilesMutated": False,
        "timelineDecisionsWritten": False,
        "clipsImported": False,
        "exportsRendered": False,
        "externalPublishing": False,
        "versionsOverwritten": False,
        "safeToReview": True,
        "safeToAutoApply": False,
    }


def build_show_islands(edit: dict[str, Any], segments: list[dict[str, Any]], duration: float, target_low: float, target_high: float) -> list[dict[str, Any]]:
    raw: list[dict[str, Any]] = [
        {
            "operationId": "ep4-ys-show-opening-context",
            "operationKind": "show-range-review",
            "startSeconds": 0.0,
            "endSeconds": min(300.0, duration),
            "confidence": "medium",
            "reason": "Keep enough opening context for the episode promise, then tighten setup after human review.",
            "evidenceIds": ["opening-context"],
            "priorityScore": 10.0,
            "mustInclude": True,
        }
    ]
    for index, row in enumerate(dict_list(edit.get("shortCandidates"))[:12], start=1):
        start, end = candidate_range(row, duration, before=35.0, after=25.0)
        raw.append(
            {
                "operationId": f"ep4-ys-show-from-{row.get('id')}",
                "operationKind": "show-range-review",
                "startSeconds": round(start, 3),
                "endSeconds": round(end, 3),
                "confidence": row.get("confidence") or "medium",
                "reason": "Short candidate suggests a strong standalone idea worth preserving in the long-form spine.",
                "tradeoff": row.get("tradeoff"),
                "evidenceIds": [row.get("id")],
                "priorityScore": round(7.5 + confidence_score(row.get("confidence")) - (index * 0.18), 3),
            }
        )
    for index, row in enumerate(dict_list(edit.get("clipWeaveWorkorders"))[:12], start=1):
        start, end = candidate_range(row, duration, before=55.0, after=45.0)
        raw.append(
            {
                "operationId": f"ep4-ys-show-around-{row.get('id')}",
                "operationKind": "show-range-review",
                "startSeconds": round(start, 3),
                "endSeconds": round(end, 3),
                "confidence": row.get("confidence") or "medium",
                "reason": "Clip-weave candidate marks setup/reaction material that should stay visible even while the source clip is missing.",
                "tradeoff": row.get("tradeoff"),
                "evidenceIds": [row.get("id")],
                "priorityScore": round(7.0 + confidence_score(row.get("confidence")) - (index * 0.16), 3),
            }
        )
    merged = expand_to_target(select_ranges_for_target(raw, target_low, target_high=target_high), target_low, duration)
    for index, item in enumerate(merged, start=1):
        item["operationId"] = f"ep4-ys-show-island-{index:03d}"
        item["sequenceLabel"] = f"{fmt_time(item.get('startSeconds'))} -> {fmt_time(item.get('endSeconds'))}"
        item["durationSeconds"] = round(as_float(item.get("endSeconds")) - as_float(item.get("startSeconds")), 3)
        item["transcriptContext"] = transcript_context(segments, as_float(item.get("startSeconds")), as_float(item.get("endSeconds")))
    return merged


def build_skip_gaps(show_islands: list[dict[str, Any]], duration: float) -> list[dict[str, Any]]:
    gaps: list[dict[str, Any]] = []
    cursor = 0.0
    for item in show_islands:
        start = as_float(item.get("startSeconds"))
        end = as_float(item.get("endSeconds"))
        if start - cursor >= 45.0:
            gaps.append(
                {
                    "operationId": f"ep4-ys-skip-gap-{len(gaps) + 1:03d}",
                    "operationKind": "skip-range-review",
                    "startSeconds": round(cursor, 3),
                    "endSeconds": round(start, 3),
                    "durationSeconds": round(start - cursor, 3),
                    "sequenceLabel": f"{fmt_time(cursor)} -> {fmt_time(start)}",
                    "confidence": "low",
                    "reason": "Gap between selected story islands. Review before applying; this may include context, reaction texture, or callbacks.",
                    "tradeoff": "This is where over-clean editing can damage human flow. Treat as a candidate, not an instruction.",
                }
            )
        cursor = max(cursor, end)
    if duration - cursor >= 45.0:
        gaps.append(
            {
                "operationId": f"ep4-ys-skip-gap-{len(gaps) + 1:03d}",
                "operationKind": "skip-range-review",
                "startSeconds": round(cursor, 3),
                "endSeconds": round(duration, 3),
                "durationSeconds": round(duration - cursor, 3),
                "sequenceLabel": f"{fmt_time(cursor)} -> {fmt_time(duration)}",
                "confidence": "low",
                "reason": "Tail gap after selected story islands. Review for closing value before applying.",
                "tradeoff": "Could contain a better ending than the transcript-score path found.",
            }
        )
    return gaps


def review_ops(edit: dict[str, Any], placeholders: list[dict[str, Any]]) -> list[dict[str, Any]]:
    ops: list[dict[str, Any]] = []
    for row in dict_list(edit.get("cadenceCandidates"))[:10]:
        ops.append(
            {
                "operationId": f"ep4-ys-cadence-review-{row.get('id')}",
                "operationKind": "cadence-tighten-review",
                "startSeconds": row.get("startSeconds"),
                "endSeconds": row.get("endSeconds"),
                "sequenceLabel": row.get("timeLabel"),
                "confidence": row.get("confidence"),
                "reason": "Listen for dead-air cleanup, but preserve pauses that carry thought, humor, or warmth.",
                "tradeoff": row.get("tradeoff"),
            }
        )
    for row in dict_list(edit.get("reactionCoverCandidates"))[:10]:
        ops.append(
            {
                "operationId": f"ep4-ys-reaction-cover-{row.get('id')}",
                "operationKind": "reaction-cover-review",
                "startSeconds": row.get("startSeconds"),
                "endSeconds": row.get("endSeconds"),
                "sequenceLabel": row.get("timeLabel"),
                "confidence": row.get("confidence"),
                "reason": "Possible reaction cover to hide a harsh jump cut while keeping the conversation feeling human.",
                "tradeoff": row.get("tradeoff"),
            }
        )
    for item in placeholders:
        cue = item.get("cueReview") if isinstance(item.get("cueReview"), dict) else {}
        ops.append(
            {
                "operationId": f"ep4-ys-source-placeholder-{item.get('cueId')}",
                "operationKind": "source-placeholder-slot",
                "cueId": item.get("cueId"),
                "sequenceLabel": item.get("timeLabel") or cue.get("reviewWindowLabel"),
                "suggestedFilename": item.get("suggestedFilename"),
                "canContinueMainEpisodeEdit": item.get("canContinueMainEpisodeEdit", True),
                "canWriteRealClipInsert": item.get("canWriteRealClipInsert", False),
                "reason": item.get("explanation") or "Watched/source clip is missing; keep the host setup/reaction shell but do not fake the insert.",
                "tradeoff": item.get("tradeoff"),
                "jCutHint": item.get("jCutHint"),
                "lCutHint": item.get("lCutHint"),
                "audioReviewClipPath": cue.get("audioReviewClipPath"),
            }
        )
    return ops


def build_packet(args: argparse.Namespace) -> dict[str, Any]:
    spine = load_pointer(Path(args.spine_pointer))
    edit = load_pointer(Path(args.edit_pointer))
    duration_workbench = load_pointer(Path(args.duration_pointer))
    placeholder = load_pointer(Path(args.placeholder_pointer))
    duration = duration_seconds(spine)
    variant = pick_youtube_variant(duration_workbench)
    target = variant.get("target") if isinstance(variant.get("target"), dict) else {}
    target_range = target.get("targetSecondsRange") if isinstance(target.get("targetSecondsRange"), list) else [2100.0, 2700.0]
    target_low = as_float(target_range[0], 2100.0)
    target_high = as_float(target_range[-1], 2700.0)
    segments = dict_list(spine.get("segments"))
    placeholders = dict_list(placeholder.get("items"))
    show_islands = build_show_islands(edit, segments, duration, target_low, target_high)
    skip_gaps = build_skip_gaps(show_islands, duration)
    specialist_ops = review_ops(edit, placeholders)
    estimated_keep = total_duration(show_islands)
    session_dir = Path(args.out_root) / stamp()
    packet = {
        "schema": SCHEMA,
        "generatedAt": iso_now(),
        "status": "episode4-youtube-standard-recipe-ready" if duration > 0 else "episode4-youtube-standard-recipe-needs-spine",
        "episode": "episode-4",
        "branch": {
            "branchId": "episode-4-youtube-standard-v001",
            "parentBranchId": "episode-4-host-spine-sync-baseline",
            "branchKind": "metadata-only-edit-recipe",
            "targetAudience": "YouTube long-form public review",
            "targetDurationLabel": target.get("targetLabel") or "35-45 min",
        },
        "sessionDir": str(session_dir),
        "sourcePointers": {
            "transcriptSpine": str(args.spine_pointer),
            "editIntelligence": str(args.edit_pointer),
            "durationWorkbench": str(args.duration_pointer),
            "sourcePlaceholderWorkbench": str(args.placeholder_pointer),
        },
        "durationPlan": {
            "sourceDurationSeconds": round(duration, 3),
            "sourceDurationLabel": fmt_time(duration),
            "targetSecondsRange": [round(target_low, 3), round(target_high, 3)],
            "targetLabel": target.get("targetLabel") or "35-45 min",
            "estimatedKeepSeconds": round(estimated_keep, 3),
            "estimatedKeepLabel": fmt_time(estimated_keep),
            "estimatedRemoveSeconds": round(max(0.0, duration - estimated_keep), 3),
            "estimatedRemoveLabel": fmt_time(max(0.0, duration - estimated_keep)),
            "inTargetWindow": target_low <= estimated_keep <= target_high,
            "cutPressure": target.get("cutPressure") or "heavy",
        },
        "operationCounts": {
            "showRangeReviews": len(show_islands),
            "skipRangeReviews": len(skip_gaps),
            "specialistReviews": len(specialist_ops),
            "sourcePlaceholders": len(placeholders),
        },
        "metadataOperations": show_islands + skip_gaps + specialist_ops,
        "showRangeReviews": show_islands,
        "skipRangeReviews": skip_gaps,
        "specialistReviews": specialist_ops,
        "humanFeelingRules": [
            "Cut technical waste before cutting human breath.",
            "Use transcript evidence to create review targets, not unquestioned cuts.",
            "When a same-speaker jump feels harsh, consider reaction cover before deleting more words.",
            "Use J-cuts and L-cuts to make ideas arrive naturally by ear, not to show off.",
            "Keep pauses that sound like thought, warmth, laughter, or relationship texture.",
            "If a missing watched clip is part of the moment, preserve the host setup/reaction shell and mark the source slot.",
        ],
        "agentControlHints": [
            "Start review at the first show island, not at 00:00 if the goal is efficient YouTube shaping.",
            "For each skip gap, scrub the first and last 10 seconds before deciding whether to keep, shorten, or skip.",
            "For cadence reviews, listen before tightening; do not apply silence trimming from transcript alone.",
            "For source-placeholder slots, do not write real insert metadata until a cue-matched source file exists.",
        ],
        "nextSafestAction": "Review show islands and skip gaps in Quipsly Studio, then promote accepted ranges into a branch-specific metadata ledger.",
        "truth": base_truth(),
    }
    write_surfaces(session_dir, packet, Path(args.latest_pointer))
    return packet


def render_markdown(packet: dict[str, Any]) -> str:
    plan = packet.get("durationPlan") if isinstance(packet.get("durationPlan"), dict) else {}
    lines = [
        "# Episode 4 YouTube-standard edit recipe",
        "",
        f"Status: `{packet.get('status')}`",
        f"Generated: `{packet.get('generatedAt')}`",
        "",
        "This is a metadata-only branch recipe over the intact Episode 4 host spine.",
        "",
        "## Duration plan",
        "",
        f"- Source: `{plan.get('sourceDurationLabel')}`",
        f"- Target: `{plan.get('targetLabel')}`",
        f"- Estimated keep: `{plan.get('estimatedKeepLabel')}`",
        f"- Estimated remove: `{plan.get('estimatedRemoveLabel')}`",
        f"- In target window: `{plan.get('inTargetWindow')}`",
        "",
        "## SHOW review islands",
        "",
    ]
    for item in packet.get("showRangeReviews") or []:
        lines += [
            f"### {item.get('operationId')} - {item.get('sequenceLabel')}",
            "",
            f"- Duration: `{fmt_time(item.get('durationSeconds'))}`",
            f"- Confidence: `{item.get('confidence')}`",
            f"- Reason: {item.get('reason')}",
            f"- Evidence: `{', '.join(str(value) for value in item.get('evidenceIds') or [])}`",
            "",
        ]
        contexts = item.get("transcriptContext") if isinstance(item.get("transcriptContext"), list) else []
        if contexts:
            lines.append("Transcript context:")
            lines += [f"- `{context.get('timeLabel')}` {context.get('text')}" for context in contexts[:3]]
            lines.append("")
    lines += ["## SKIP review gaps", ""]
    for item in packet.get("skipRangeReviews") or []:
        lines += [
            f"- `{item.get('operationId')}` `{item.get('sequenceLabel')}` `{fmt_time(item.get('durationSeconds'))}` - {item.get('reason')}",
        ]
    lines += ["", "## Specialist reviews", ""]
    for item in packet.get("specialistReviews") or []:
        lines.append(f"- `{item.get('operationKind')}` `{item.get('sequenceLabel')}` - {item.get('reason')}")
    lines += [
        "",
        "## Safety",
        "",
        "- No source media is mutated.",
        "- No app timeline/session state is written.",
        "- No exports are rendered.",
        "- No publishing happens.",
        "",
    ]
    return "\n".join(lines)


def card(title: str, body: str, meta: str = "") -> str:
    return f"<article class='card'><h3>{esc(title)}</h3>{meta}<p>{esc(body)}</p></article>"


def render_html(packet: dict[str, Any]) -> str:
    plan = packet.get("durationPlan") if isinstance(packet.get("durationPlan"), dict) else {}
    show_cards = "\n".join(
        card(
            f"{item.get('operationId')} - {item.get('sequenceLabel')}",
            str(item.get("reason") or ""),
            f"<p class='meta'>{esc(fmt_time(item.get('durationSeconds')))} · {esc(item.get('confidence'))} · {esc(', '.join(str(value) for value in item.get('evidenceIds') or []))}</p>",
        )
        for item in packet.get("showRangeReviews") or []
    )
    skip_cards = "\n".join(
        card(
            f"{item.get('operationId')} - {item.get('sequenceLabel')}",
            str(item.get("reason") or ""),
            f"<p class='meta'>{esc(fmt_time(item.get('durationSeconds')))} · review before applying</p>",
        )
        for item in packet.get("skipRangeReviews") or []
    )
    review_cards = "\n".join(
        card(
            f"{item.get('operationKind')} - {item.get('sequenceLabel')}",
            str(item.get("reason") or ""),
            f"<p class='meta'>{esc(item.get('confidence'))}</p>",
        )
        for item in packet.get("specialistReviews") or []
    )
    return f"""<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>Episode 4 YouTube-standard edit recipe</title>
  <style>
    :root {{
      color-scheme: dark;
      --bg: #121611;
      --panel: #1d261d;
      --ink: #f7f0dc;
      --muted: #beb396;
      --honey: #f2c94c;
      --moss: #5ec27d;
      --clay: #d66b55;
      --blue: #65b7d9;
    }}
    * {{ box-sizing: border-box; }}
    body {{
      margin: 0;
      background: radial-gradient(circle at top left, #293923, var(--bg) 46%);
      color: var(--ink);
      font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      line-height: 1.45;
    }}
    main {{ width: min(1180px, calc(100vw - 48px)); margin: 0 auto; padding: 36px 0 64px; }}
    header {{
      border: 1px solid rgba(242, 201, 76, 0.28);
      background: linear-gradient(135deg, rgba(29, 38, 29, 0.92), rgba(35, 29, 18, 0.84));
      border-radius: 28px;
      padding: 28px;
      box-shadow: 0 22px 80px rgba(0,0,0,0.28);
    }}
    h1 {{ margin: 0; font-size: clamp(2rem, 4vw, 4.6rem); letter-spacing: -0.05em; }}
    h2 {{ margin-top: 34px; color: var(--honey); letter-spacing: 0.12em; text-transform: uppercase; font-size: 0.92rem; }}
    .metrics {{ display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 14px; margin-top: 22px; }}
    .metric, .card {{
      border: 1px solid rgba(247, 240, 220, 0.12);
      background: rgba(18, 22, 17, 0.7);
      border-radius: 18px;
      padding: 16px;
    }}
    .metric strong {{ display: block; font-size: 1.45rem; color: var(--honey); }}
    .metric span, .meta {{ color: var(--muted); font-size: 0.88rem; }}
    .grid {{ display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 14px; }}
    .card h3 {{ margin: 0 0 8px; color: var(--ink); }}
    .show {{ border-color: rgba(242, 201, 76, 0.35); }}
    .skip {{ border-color: rgba(214, 107, 85, 0.35); }}
    .review {{ border-color: rgba(101, 183, 217, 0.35); }}
    code {{ color: var(--moss); }}
    @media (max-width: 800px) {{ .metrics, .grid {{ grid-template-columns: 1fr; }} }}
  </style>
</head>
<body>
  <main>
    <header>
      <p class="meta">Quipsly Studio · metadata-only branch recipe</p>
      <h1>Episode 4 YouTube-standard recipe</h1>
      <p>{esc(packet.get("nextSafestAction"))}</p>
      <div class="metrics">
        <div class="metric"><strong>{esc(plan.get("sourceDurationLabel"))}</strong><span>intact source spine</span></div>
        <div class="metric"><strong>{esc(plan.get("targetLabel"))}</strong><span>target duration</span></div>
        <div class="metric"><strong>{esc(plan.get("estimatedKeepLabel"))}</strong><span>estimated keep</span></div>
        <div class="metric"><strong>{esc(plan.get("estimatedRemoveLabel"))}</strong><span>estimated remove</span></div>
      </div>
    </header>
    <h2>Show review islands</h2>
    <section class="grid show">{show_cards}</section>
    <h2>Skip review gaps</h2>
    <section class="grid skip">{skip_cards}</section>
    <h2>Cadence, reaction cover, and source-placeholder reviews</h2>
    <section class="grid review">{review_cards}</section>
  </main>
</body>
</html>
"""


def write_surfaces(session_dir: Path, packet: dict[str, Any], latest_pointer: Path) -> None:
    session_dir.mkdir(parents=True, exist_ok=True)
    json_path = session_dir / "episode4-youtube-standard-recipe.json"
    markdown_path = session_dir / "episode4-youtube-standard-recipe.md"
    html_path = session_dir / "index.html"
    packet.update({"jsonPath": str(json_path), "markdownPath": str(markdown_path), "htmlPath": str(html_path)})
    write_json(json_path, packet)
    markdown_path.write_text(render_markdown(packet), encoding="utf-8")
    html_path.write_text(render_html(packet), encoding="utf-8")
    write_json(
        latest_pointer,
        {
            "schema": SCHEMA + ".pointer",
            "status": packet.get("status"),
            "generatedAt": packet.get("generatedAt"),
            "jsonPath": str(json_path),
            "markdownPath": str(markdown_path),
            "htmlPath": str(html_path),
            "branch": packet.get("branch"),
            "durationPlan": packet.get("durationPlan"),
            "operationCounts": packet.get("operationCounts"),
            "nextSafestAction": packet.get("nextSafestAction"),
        },
    )


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--spine-pointer", default=str(SPINE_POINTER))
    parser.add_argument("--edit-pointer", default=str(EDIT_POINTER))
    parser.add_argument("--duration-pointer", default=str(DURATION_POINTER))
    parser.add_argument("--placeholder-pointer", default=str(PLACEHOLDER_POINTER))
    parser.add_argument("--out-root", default=str(OUT_ROOT))
    parser.add_argument("--latest-pointer", default=str(LATEST_POINTER))
    parser.add_argument("--json", action="store_true", help="Print JSON. This is the default.")
    parser.add_argument("--markdown", action="store_true", help="Print Markdown instead of JSON.")
    args = parser.parse_args()
    packet = build_packet(args)
    if args.markdown:
        print(render_markdown(packet))
    else:
        print(json.dumps(packet, indent=2, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
