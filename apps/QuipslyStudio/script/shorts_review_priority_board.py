#!/usr/bin/env python3
"""Generate a review-priority board for Quipsly short recipes.

This board is intentionally boring in the best possible way: it reads the
selected shorts queue, groups candidates by the same review class used inside
Studio, and emits a packet humans and agents can use without mutating media,
review state, or publication receipts.
"""

from __future__ import annotations

import os
import sys
from typing import Any

from shorts_board_common import (
    command_quote,
    duration_seconds,
    emit_packet_outputs,
    esc,
    load_json,
    unique_shorts,
)


def text_value(row: dict[str, Any], key: str, default: str = "") -> str:
    value = row.get(key)
    if value is None:
        return default
    return str(value).strip() or default


def nested(row: dict[str, Any], *keys: str) -> Any:
    value: Any = row
    for key in keys:
        if not isinstance(value, dict):
            return None
        value = value.get(key)
    return value


def int_value(value: Any, default: int = 0) -> int:
    try:
        return int(float(value))
    except (TypeError, ValueError):
        return default


def float_value(value: Any, default: float = 0.0) -> float:
    try:
        return float(value)
    except (TypeError, ValueError):
        return default


def first_non_empty(*values: Any, default: str = "") -> str:
    for value in values:
        if value is None:
            continue
        text = str(value).strip()
        if text:
            return text
    return default


def first_dict(*values: Any) -> dict[str, Any]:
    for value in values:
        if isinstance(value, dict) and value:
            return value
    return {}


def ready_fraction(summary: dict[str, Any]) -> tuple[int, int]:
    ready = summary.get("readyCount", 0)
    total = summary.get("totalCount", 0)
    if isinstance(ready, str) and "/" in ready:
        left, _, right = ready.partition("/")
        return int_value(left), int_value(right)
    return int_value(ready), int_value(total)


def fraction_label(summary: dict[str, Any]) -> str:
    ready, total = ready_fraction(summary)
    return f"{ready}/{total}"


def cut_evidence_has_risk(evidence: dict[str, Any]) -> bool:
    if str(evidence.get("hasRisk", "")).lower() in {"true", "yes", "1", "risk"}:
        return True
    return any(
        int_value(evidence.get(key)) > 0
        for key in [
            "highSeverityCount",
            "cadenceWarningCount",
            "jumpCutRiskCount",
            "overlappedFindingCount",
        ]
    )


def review_class_id(row: dict[str, Any]) -> str:
    return first_non_empty(
        row.get("reviewClass"),
        nested(row, "creatorQuality", "reviewClass"),
        nested(row, "creatorQuality", "qualityPacketSummary", "reviewClass"),
        nested(row, "publicationPassport", "reviewClass"),
        default="unclassified",
    )


def review_class_label(row: dict[str, Any]) -> str:
    return first_non_empty(
        row.get("reviewClassLabel"),
        nested(row, "creatorQuality", "reviewClassLabel"),
        nested(row, "creatorQuality", "qualityPacketSummary", "reviewClassLabel"),
        nested(row, "publicationPassport", "reviewClassLabel"),
        default=review_class_id(row).replace("_", " ").title(),
    )


def review_priority(row: dict[str, Any]) -> int:
    return int_value(
        first_non_empty(
            row.get("reviewPriority"),
            nested(row, "creatorQuality", "reviewPriority"),
            nested(row, "creatorQuality", "qualityPacketSummary", "reviewPriority"),
            nested(row, "publicationPassport", "reviewPriority"),
            default="0",
        )
    )


def review_explanation(row: dict[str, Any]) -> str:
    return first_non_empty(
        row.get("reviewClassExplanation"),
        nested(row, "creatorQuality", "reviewClassExplanation"),
        nested(row, "creatorQuality", "qualityPacketSummary", "reviewClassExplanation"),
        nested(row, "publicationPassport", "reviewClassExplanation"),
        default="No review-class explanation is attached yet.",
    )


def next_review_action(row: dict[str, Any]) -> str:
    return first_non_empty(
        row.get("nextReviewAction"),
        nested(row, "creatorQuality", "nextReviewAction"),
        nested(row, "publicationPassport", "nextReviewAction"),
        row.get("nextSafeAction"),
        nested(row, "creatorQuality", "qualityPacketSummary", "nextSafeAction"),
        default="Select the short, inspect the quality passport, and decide the next safe metadata-only action.",
    )


def creative_readiness(row: dict[str, Any]) -> dict[str, Any]:
    quality = row.get("creatorQuality") if isinstance(row.get("creatorQuality"), dict) else {}
    passport = row.get("publicationPassport") if isinstance(row.get("publicationPassport"), dict) else {}
    summary = quality.get("qualityPacketSummary") if isinstance(quality.get("qualityPacketSummary"), dict) else {}
    readiness = quality.get("creativeReadiness") if isinstance(quality.get("creativeReadiness"), dict) else {}
    if not readiness and isinstance(passport.get("creativeReadiness"), dict):
        readiness = passport.get("creativeReadiness") or {}

    score = int_value(
        first_non_empty(
            readiness.get("score"),
            summary.get("creativeReadinessScore"),
            passport.get("creativeReadinessScore"),
            default="0",
        )
    )
    label = first_non_empty(
        readiness.get("label"),
        summary.get("creativeReadinessLabel"),
        passport.get("creativeReadinessLabel"),
        default="Not scored",
    )
    next_action = first_non_empty(
        readiness.get("nextAction"),
        summary.get("creativeReadinessNextAction"),
        passport.get("creativeReadinessNextAction"),
        default="Open the short quality passport and do a hook, pacing, crop, caption, payoff watch pass.",
    )
    blocker = first_non_empty(
        readiness.get("primaryBlocker"),
        default="unknown",
    )
    return {
        "score": score,
        "label": label,
        "summary": first_non_empty(readiness.get("summary"), default="Creative readiness has not been generated for this short yet."),
        "nextAction": next_action,
        "primaryBlocker": blocker,
        "agentInstruction": first_non_empty(readiness.get("agentInstruction"), summary.get("agentInstruction"), default=next_action),
        "hookStatus": first_non_empty(readiness.get("hookStatus"), default="unknown"),
        "pacingStatus": first_non_empty(readiness.get("pacingStatus"), default="unknown"),
        "captionStatus": first_non_empty(readiness.get("captionStatus"), default="unknown"),
        "framingStatus": first_non_empty(readiness.get("framingStatus"), default="unknown"),
        "proofStatus": first_non_empty(readiness.get("proofStatus"), default="unknown"),
        "platformStatus": first_non_empty(readiness.get("platformStatus"), default="unknown"),
    }


def selected_flag(row: dict[str, Any]) -> bool:
    return bool(row.get("selected"))


def command_for(row: dict[str, Any], name: str, fallback: str = "") -> str:
    commands = row.get("commands") if isinstance(row.get("commands"), dict) else {}
    value = commands.get(name) if isinstance(commands, dict) else None
    if value:
        return str(value)
    if name == "select":
        short_id = text_value(row, "id")
        return f"script/agentctl.sh shorts-select id {command_quote(short_id)}" if short_id else fallback
    return fallback


def build_cards(queue_payload: dict[str, Any]) -> list[dict[str, Any]]:
    rows = unique_shorts(queue_payload)
    cards: list[dict[str, Any]] = []
    for index, row in enumerate(rows, start=1):
        quality = row.get("creatorQuality") if isinstance(row.get("creatorQuality"), dict) else {}
        summary = quality.get("qualityPacketSummary") if isinstance(quality.get("qualityPacketSummary"), dict) else {}
        passport = row.get("publicationPassport") if isinstance(row.get("publicationPassport"), dict) else {}
        story_contract = first_dict(
            row.get("shortStoryContract"),
            quality.get("shortStoryContract"),
            passport.get("shortStoryContract"),
        )
        platform_draft_summary = first_dict(
            row.get("platformDraftSummary"),
            quality.get("platformDraftSummary"),
            passport.get("platformDraftSummary"),
        )
        platform_target_summary = first_dict(
            row.get("platformTargetSummary"),
            quality.get("platformTargetSummary"),
            passport.get("platformTargetSummary"),
        )
        cut_evidence = first_dict(
            row.get("cutIntelligenceEvidence"),
            quality.get("cutIntelligenceEvidence"),
            passport.get("cutIntelligenceEvidence"),
        )
        cut_has_risk = cut_evidence_has_risk(cut_evidence)
        duration = duration_seconds(row)
        if duration <= 0:
            duration = float_value(row.get("recipeDuration") or row.get("duration") or 0)
        review_id = review_class_id(row)
        review_label = review_class_label(row)
        priority = review_priority(row)
        short_id = text_value(row, "id")
        creative = creative_readiness(row)
        card = {
            "index": index,
            "id": short_id,
            "title": text_value(row, "title", f"Short {index}"),
            "selected": selected_flag(row),
            "reviewClass": review_id,
            "reviewClassLabel": review_label,
            "reviewClassExplanation": review_explanation(row),
            "reviewPriority": priority,
            "nextReviewAction": next_review_action(row),
            "reviewStatus": text_value(row, "reviewStatus", "draft"),
            "exportStatus": text_value(row, "exportStatus", "not-exported"),
            "qualityScore": int_value(quality.get("score"), int_value(row.get("qualityScore"), 0)),
            "attentionScore": int_value(quality.get("attentionScore"), int_value(row.get("attentionScore"), 0)),
            "creativeReadiness": creative,
            "creativeReadinessScore": creative["score"],
            "creativeReadinessLabel": creative["label"],
            "creativeReadinessNextAction": creative["nextAction"],
            "creativePrimaryBlocker": creative["primaryBlocker"],
            "storyContractLabel": first_non_empty(story_contract.get("label"), default="story-contract-unknown"),
            "storyContractReady": f"{int_value(story_contract.get('readyCount'))}/{int_value(story_contract.get('totalCount'))}",
            "storyContractNextAction": first_non_empty(story_contract.get("nextAction"), default="Open the selected-short review packet and name hook, turn, payoff, and proof state."),
            "platformDraftReady": fraction_label(platform_draft_summary),
            "platformDraftNextAction": first_non_empty(platform_draft_summary.get("nextAction"), default="Draft or review native platform copy."),
            "platformTargetReady": fraction_label(platform_target_summary),
            "platformTargetNextAction": first_non_empty(platform_target_summary.get("nextAction"), default="Not ready for Tower handoff until human review and receipt slots are clear."),
            "cutRiskStatus": "review" if cut_has_risk else ("clear" if cut_evidence else "not-attached"),
            "cutRiskNextAction": first_non_empty(
                cut_evidence.get("nextAction"),
                default=("Review cadence, jump-cut, or preserved-air warnings before Keep." if cut_has_risk else "Proof-listen once; no cut-risk detour is required unless the edit feels odd."),
            ),
            "readinessLabel": first_non_empty(quality.get("readinessLabel"), passport.get("readinessLabel"), default=""),
            "publishReadinessLabel": first_non_empty(nested(quality, "publishReadiness", "label"), passport.get("publishReadinessLabel"), default=""),
            "qualityHeadline": first_non_empty(summary.get("headline"), default=""),
            "qualityReason": first_non_empty(summary.get("reason"), default=""),
            "durationSeconds": round(duration, 3),
            "segmentCount": int_value(row.get("segmentCount"), len(row.get("segments") or [])),
            "hookText": text_value(row, "hookText"),
            "captionDraft": text_value(row, "captionDraft"),
            "primaryOverlayText": text_value(row, "primaryOverlayText"),
            "primaryPlatform": first_non_empty(quality.get("primaryPlatform"), passport.get("primaryPlatform"), default=""),
            "missingPlatformVariantTargets": quality.get("missingPlatformVariantTargets") or [],
            "commands": {
                "select": command_for(row, "select"),
                "quality": "script/agentctl.sh selected-short-quality",
                "reviewPacket": f"script/agentctl.sh shorts-select id {command_quote(short_id)} && script/agentctl.sh selected-short-review-brief --markdown" if short_id else "",
                "contract": f"script/agentctl.sh shorts-select id {command_quote(short_id)} && script/agentctl.sh selected-short-state-contract-check --markdown" if short_id else "",
                "storyRepair": f"script/agentctl.sh shorts-select id {command_quote(short_id)} && script/agentctl.sh selected-short-story-repair --markdown" if short_id else "",
                "preview": command_for(row, "preview", command_for(row, "select")),
                "export": command_for(row, "export", text_value(row, "exportCommand")),
                "keep": command_for(row, "reviewKeep", f"script/agentctl.sh shorts-review-target id {command_quote(short_id)} keep \"reviewed; ready for next handoff\""),
                "refine": command_for(row, "reviewRefine", f"script/agentctl.sh shorts-review-target id {command_quote(short_id)} refine \"needs another pass\""),
                "reject": command_for(row, "reviewReject", f"script/agentctl.sh shorts-review-target id {command_quote(short_id)} reject \"not strong enough\""),
            },
        }
        cards.append(card)
    return sorted(cards, key=lambda card: (-int(card["reviewPriority"]), int(card.get("creativeReadinessScore") or 0), card["reviewClassLabel"], card["index"]))


def build_board(queue_path: str, state_path: str, output_dir: str, basename: str) -> dict[str, Any]:
    queue_payload = load_json(queue_path)
    state_payload = load_json(state_path) if os.path.exists(state_path) else {}
    cards = build_cards(queue_payload if isinstance(queue_payload, dict) else {"clips": queue_payload})
    class_counts: dict[str, int] = {}
    creative_blocker_counts: dict[str, int] = {}
    for card in cards:
        label = str(card["reviewClassLabel"])
        class_counts[label] = class_counts.get(label, 0) + 1
        blocker = str(card.get("creativePrimaryBlocker") or "unknown")
        creative_blocker_counts[blocker] = creative_blocker_counts.get(blocker, 0) + 1

    selected = next((card for card in cards if card.get("selected")), None)
    top = cards[0] if cards else None
    packet = {
        "model": "quipsly-shorts-review-priority-board",
        "version": "2026-06-30.short-review-priority-board.v1",
        "generatedAt": __import__("datetime").datetime.now(__import__("datetime").timezone.utc).astimezone().isoformat(timespec="seconds"),
        "json": os.path.join(output_dir, f"{basename}.json"),
        "html": os.path.join(output_dir, f"{basename}.html"),
        "markdown": os.path.join(output_dir, f"{basename}.md"),
        "shortCount": len(cards),
        "reviewClassCounts": class_counts,
        "creativeBlockerCounts": creative_blocker_counts,
        "selectedShort": selected or {},
        "topPriorityShort": top or {},
        "cards": cards,
        "source": {
            "queuePath": queue_path,
            "statePath": state_path,
            "queueModel": queue_payload.get("model") if isinstance(queue_payload, dict) else "",
            "stateSession": state_payload.get("sessionName") if isinstance(state_payload, dict) else "",
        },
        "safeUse": "Read-only review board. Commands select, preview, export, or update short metadata only when the operator explicitly runs them. This packet does not publish or mutate source media.",
        "truth": "Shorts are metadata recipes over whole synced sources. Review classes and creative readiness are explainable routing labels, not publication approval.",
    }
    return packet


def html_page(board: dict[str, Any]) -> str:
    counts = "".join(
        f"<span><b>{esc(label)}</b> {count}</span>"
        for label, count in sorted((board.get("reviewClassCounts") or {}).items())
    )
    blocker_counts = "".join(
        f"<span><b>{esc(label)}</b> {count}</span>"
        for label, count in sorted((board.get("creativeBlockerCounts") or {}).items())
    )
    cards = []
    for card in board.get("cards") or []:
        commands = card.get("commands") or {}
        creative = card.get("creativeReadiness") if isinstance(card.get("creativeReadiness"), dict) else {}
        cards.append(
            f"""
            <article class="card {'selected' if card.get('selected') else ''}">
              <div class="rank">P{esc(card.get('reviewPriority'))}</div>
              <div>
                <p class="eyebrow">{esc(card.get('reviewClassLabel'))}</p>
                <h2>{esc(card.get('title'))}</h2>
                <p>{esc(card.get('reviewClassExplanation'))}</p>
                <p><b>Next:</b> {esc(card.get('nextReviewAction'))}</p>
                <p><b>Creative:</b> {esc(card.get('creativeReadinessLabel'))} ({esc(card.get('creativeReadinessScore'))}/100). {esc(creative.get('summary') or '')}</p>
                <p><b>Creative next:</b> {esc(card.get('creativeReadinessNextAction'))}</p>
                <p><b>Story:</b> {esc(card.get('storyContractLabel'))} {esc(card.get('storyContractReady'))}. {esc(card.get('storyContractNextAction'))}</p>
                <p><b>Cut flow:</b> {esc(card.get('cutRiskStatus'))}. {esc(card.get('cutRiskNextAction'))}</p>
                <p><b>Platform:</b> drafts {esc(card.get('platformDraftReady'))}; handoff {esc(card.get('platformTargetReady'))}. {esc(card.get('platformTargetNextAction'))}</p>
                <div class="meta">
                  <span>{esc(card.get('durationSeconds'))}s</span>
                  <span>{esc(card.get('reviewStatus'))}</span>
                  <span>{esc(card.get('exportStatus'))}</span>
                  <span>Q {esc(card.get('qualityScore'))}</span>
                  <span>A {esc(card.get('attentionScore'))}</span>
                  <span>C {esc(card.get('creativeReadinessScore'))}</span>
                  <span>story {esc(card.get('storyContractReady'))}</span>
                  <span>draft {esc(card.get('platformDraftReady'))}</span>
                  <span>handoff {esc(card.get('platformTargetReady'))}</span>
                  <span>cut {esc(card.get('cutRiskStatus'))}</span>
                  <span>{esc(card.get('creativePrimaryBlocker'))}</span>
                </div>
                <code>{esc(commands.get('select') or '')}</code>
                <code>{esc(commands.get('reviewPacket') or '')}</code>
                <code>{esc(commands.get('storyRepair') or '')}</code>
              </div>
            </article>
            """
        )
    return f"""<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title>Quipsly shorts review priority board</title>
  <style>
    body {{ margin: 0; background: #18231f; color: #f4edda; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }}
    main {{ max-width: 1180px; margin: 0 auto; padding: 32px; }}
    .hero {{ border: 1px solid rgba(227, 187, 87, .35); border-radius: 28px; padding: 28px; background: linear-gradient(135deg, rgba(49, 84, 66, .72), rgba(43, 34, 22, .72)); box-shadow: 0 20px 80px rgba(0, 0, 0, .25); }}
    .eyebrow {{ margin: 0 0 6px; color: #e3bb57; text-transform: uppercase; letter-spacing: .16em; font-size: 12px; font-weight: 900; }}
    h1 {{ margin: 0 0 10px; font-size: clamp(32px, 5vw, 58px); line-height: .95; }}
    h2 {{ margin: 0 0 8px; font-size: 20px; }}
    .counts, .meta {{ display: flex; flex-wrap: wrap; gap: 8px; margin-top: 14px; }}
    .counts span, .meta span {{ background: rgba(244, 237, 218, .10); border: 1px solid rgba(244, 237, 218, .14); border-radius: 999px; padding: 6px 10px; }}
    .grid {{ display: grid; gap: 14px; margin-top: 18px; }}
    .card {{ display: grid; grid-template-columns: 72px 1fr; gap: 14px; padding: 18px; background: rgba(12, 18, 16, .74); border: 1px solid rgba(244, 237, 218, .12); border-radius: 22px; }}
    .card.selected {{ border-color: #e3bb57; box-shadow: 0 0 0 2px rgba(227, 187, 87, .16); }}
    .rank {{ align-self: start; justify-self: center; min-width: 46px; text-align: center; border-radius: 16px; padding: 10px; background: #e3bb57; color: #1d241c; font-weight: 950; }}
    code {{ display: block; white-space: pre-wrap; margin-top: 12px; padding: 10px; border-radius: 12px; background: rgba(0, 0, 0, .28); color: #b7e4cf; }}
  </style>
</head>
<body>
  <main>
    <section class="hero">
      <p class="eyebrow">Quipsly Studio - shorts review priority</p>
      <h1>Review the right short for the right reason.</h1>
      <p>This board groups short recipes by the same review class and creative-readiness blockers used inside Studio. It is a compass for review work, not publication approval.</p>
      <div class="counts">{counts}</div>
      <p class="eyebrow" style="margin-top:18px">Creative blockers</p>
      <div class="counts">{blocker_counts}</div>
    </section>
    <section class="grid">{''.join(cards)}</section>
  </main>
</body>
</html>
"""


def markdown_page(board: dict[str, Any]) -> str:
    lines = [
        "# Quipsly shorts review priority board",
        "",
        "This board groups short recipes by review class and priority. It is read-only: use it to choose the next safe review action.",
        "",
        f"- Generated: `{board.get('generatedAt')}`",
        f"- Shorts: `{board.get('shortCount')}`",
        "",
        "## Review class counts",
        "",
    ]
    for label, count in sorted((board.get("reviewClassCounts") or {}).items()):
        lines.append(f"- `{label}`: `{count}`")
    lines.extend(["", "## Creative blocker counts", ""])
    for label, count in sorted((board.get("creativeBlockerCounts") or {}).items()):
        lines.append(f"- `{label}`: `{count}`")
    lines.extend(["", "## Priority queue", ""])
    for card in board.get("cards") or []:
        commands = card.get("commands") or {}
        selected = " selected" if card.get("selected") else ""
        creative = card.get("creativeReadiness") if isinstance(card.get("creativeReadiness"), dict) else {}
        lines.extend([
            f"### P{card.get('reviewPriority')} - {card.get('reviewClassLabel')} - {card.get('title')}{selected}",
            "",
            f"- Why: {card.get('reviewClassExplanation')}",
            f"- Next: {card.get('nextReviewAction')}",
            f"- Creative readiness: `{card.get('creativeReadinessScore')}/100` `{card.get('creativeReadinessLabel')}`",
            f"- Creative blocker: {card.get('creativePrimaryBlocker')}",
            f"- Creative next: {card.get('creativeReadinessNextAction')}",
            f"- Creative summary: {creative.get('summary') or ''}",
            f"- Story contract: `{card.get('storyContractLabel')}` `{card.get('storyContractReady')}` - {card.get('storyContractNextAction')}",
            f"- Cut flow: `{card.get('cutRiskStatus')}` - {card.get('cutRiskNextAction')}",
            f"- Platform drafts: `{card.get('platformDraftReady')}` - {card.get('platformDraftNextAction')}",
            f"- Platform handoff: `{card.get('platformTargetReady')}` - {card.get('platformTargetNextAction')}",
            f"- Status: `{card.get('reviewStatus')}` / `{card.get('exportStatus')}`",
            f"- Duration: `{card.get('durationSeconds')}s`; segments: `{card.get('segmentCount')}`",
            f"- Quality: `{card.get('qualityScore')}`; attention: `{card.get('attentionScore')}`",
            f"- Platform: `{card.get('primaryPlatform') or 'unknown'}`",
            "",
            "```bash",
            commands.get("select") or "",
            commands.get("quality") or "",
            commands.get("reviewPacket") or "",
            commands.get("contract") or "",
            commands.get("storyRepair") or "",
            commands.get("preview") or "",
            commands.get("export") or "",
            "```",
            "",
        ])
    return "\n".join(lines)


def main(argv: list[str]) -> int:
    if len(argv) < 5:
        print(
            "Usage: shorts_review_priority_board.py SHORTS_QUEUE_JSON STATE_JSON OUTPUT_DIR BASENAME [--json|--html|--md]",
            file=sys.stderr,
        )
        return 2
    queue_path, state_path, output_dir, basename = argv[1:5]
    mode = argv[5] if len(argv) > 5 else "--md"
    board = build_board(queue_path, state_path, output_dir, basename)
    emit_packet_outputs(board, html_page(board), markdown_page(board), mode)
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
