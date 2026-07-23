#!/usr/bin/env python3
"""Score short candidates for practical social-growth quality.

This is not a promise of views. It is a production aide: find the shorts most
worth exporting, improving, and packaging for vertical platforms.
"""

from __future__ import annotations

import json
import os
import re
import sys
from datetime import datetime, timezone
from typing import Any

from shorts_board_common import (
    classify_short,
    command_quote,
    duration_seconds,
    emit_packet_outputs,
    episode_coverage,
    esc,
    html_episode_coverage,
    html_platform_readiness_coverage,
    load_json,
    markdown_episode_coverage,
    markdown_platform_readiness_coverage,
    platform_readiness,
    platform_readiness_coverage,
    platform_readiness_summary,
    stage_rank,
    unique_shorts,
)


HOOK_WORDS = {
    "why",
    "how",
    "what",
    "when",
    "truth",
    "mistake",
    "lesson",
    "rule",
    "secret",
    "problem",
    "better",
    "story",
    "change",
    "start",
    "stop",
    "learn",
    "work",
    "identity",
    "attention",
    "mentor",
    "steward",
}

def now_iso() -> str:
    return datetime.now(timezone.utc).astimezone().isoformat(timespec="seconds")


def text_value(row: dict[str, Any], keys: list[str]) -> str:
    pieces: list[str] = []
    for key in keys:
        value = row.get(key)
        if isinstance(value, str) and value.strip():
            pieces.append(value.strip())
    return " ".join(pieces).strip()


def word_count(value: str) -> int:
    return len(re.findall(r"[A-Za-z0-9']+", value))


def clamp(value: float, low: float = 0.0, high: float = 100.0) -> float:
    return max(low, min(high, value))


def duration_score(duration: float) -> tuple[float, str]:
    if duration <= 0:
        return 15.0, "No reliable duration yet."
    if 18 <= duration <= 42:
        return 100.0, "Strong vertical-short length."
    if 8 <= duration < 18:
        return 78.0, "Punchy, but may need enough context."
    if 42 < duration <= 65:
        return 72.0, "Usable, but needs pacing discipline."
    if 65 < duration <= 90:
        return 48.0, "Long for a short; needs a strong payoff."
    return 28.0, "Duration is outside the current short-form sweet spot."


def hook_score(title: str, hook: str, overlay: str) -> tuple[float, list[str]]:
    combined = " ".join([title, hook, overlay]).strip()
    lower_words = {word.lower() for word in re.findall(r"[A-Za-z0-9']+", combined)}
    notes: list[str] = []
    score = 20.0
    if word_count(title) >= 3:
        score += 18
        notes.append("Title has enough shape to be more than a label.")
    else:
        notes.append("Title is probably too generic.")
    if hook.strip():
        score += 26
        notes.append("Hook text exists.")
    else:
        notes.append("Needs a clear opening hook.")
    if overlay.strip():
        score += 12
        notes.append("Overlay/caption prompt exists.")
    if lower_words.intersection(HOOK_WORDS):
        score += 16
        notes.append("Contains high-signal hook language.")
    if "?" in combined:
        score += 8
        notes.append("Question framing can work well in a feed.")
    return clamp(score), notes


def platform_score(destinations: list[str], title: str, hook: str) -> tuple[float, list[str]]:
    notes: list[str] = []
    normalized = " ".join(destinations).lower()
    score = 24.0
    if any(key in normalized for key in ["youtube", "instagram", "facebook", "tiktok", "reel", "short"]):
        score += 34
        notes.append("Has an obvious vertical-social destination.")
    else:
        notes.append("Destination is not clearly mapped to vertical platforms.")
    if any(key in normalized for key in ["linkedin", "patreon"]):
        score += 8
        notes.append("Has a reuse destination beyond pure shorts.")
    if 4 <= word_count(title) <= 12:
        score += 18
        notes.append("Title length is usable for packaging.")
    if hook and word_count(hook) <= 18:
        score += 16
        notes.append("Hook looks short enough to test as opening text.")
    return clamp(score), notes


def visual_score(card: dict[str, Any], row: dict[str, Any]) -> tuple[float, list[str]]:
    notes: list[str] = []
    score = 20.0
    if card.get("primaryExportExists"):
        score += 30
        notes.append("Local export exists for visual review.")
    else:
        notes.append("Export before judging visual quality.")
    raw = json.dumps(row, default=str).lower()
    if "9:16" in raw or "vertical" in raw:
        score += 18
        notes.append("Vertical format signal exists.")
    else:
        notes.append("Needs explicit vertical format/crop confidence.")
    if "caption" in raw or "overlay" in raw or "hooktext" in raw:
        score += 14
        notes.append("Text/caption surface exists.")
    if "contact sheet" in raw or "visualreview" in raw:
        score += 18
        notes.append("Visual proof signal exists.")
    return clamp(score), notes


def audio_score(card: dict[str, Any], row: dict[str, Any]) -> tuple[float, list[str]]:
    notes: list[str] = []
    score = 22.0
    if card.get("primaryExportExists"):
        score += 22
        notes.append("Exported file exists for audio sanity.")
    raw = json.dumps(row, default=str).lower()
    if "listenthrough" in raw or "audio sanity" in raw or "audiosanity" in raw:
        score += 34
        notes.append("Audio/listen review signal exists.")
    else:
        notes.append("Needs a real listen-through before posting.")
    duration = float(card.get("durationSeconds") or 0)
    d_score, d_note = duration_score(duration)
    score += d_score * 0.22
    notes.append(d_note)
    return clamp(score), notes


def standalone_score(row: dict[str, Any], title: str, hook: str, duration: float) -> tuple[float, list[str]]:
    notes: list[str] = []
    segment_count = len(row.get("segments") or []) if isinstance(row.get("segments"), list) else 0
    score = 30.0
    if segment_count <= 1:
        score += 14
        notes.append("Single segment is easy for viewers to follow.")
    elif segment_count <= 3:
        score += 10
        notes.append("Multi-segment short is still manageable.")
    else:
        notes.append("Many segments may need extra coherence checks.")
    if hook:
        score += 20
        notes.append("Hook can establish context quickly.")
    if 15 <= duration <= 55:
        score += 24
        notes.append("Duration gives enough room for setup and payoff.")
    if word_count(title) >= 4:
        score += 12
        notes.append("Title suggests the clip can stand alone.")
    return clamp(score), notes


def score_short(row: dict[str, Any], card: dict[str, Any]) -> dict[str, Any]:
    title = str(card.get("title") or "")
    hook = text_value(row, ["hookText", "hook", "openingHook", "socialHook"])
    overlay = text_value(row, ["overlayText", "captionText", "titleOverlay", "textOverlay"])
    destinations = [str(item) for item in card.get("destinations") or []]
    duration = float(card.get("durationSeconds") or duration_seconds(row))

    hook_points, hook_notes = hook_score(title, hook, overlay)
    duration_points, duration_note = duration_score(duration)
    platform_points, platform_notes = platform_score(destinations, title, hook)
    visual_points, visual_notes = visual_score(card, row)
    audio_points, audio_notes = audio_score(card, row)
    standalone_points, standalone_notes = standalone_score(row, title, hook, duration)

    score = (
        hook_points * 0.24
        + duration_points * 0.15
        + platform_points * 0.16
        + visual_points * 0.18
        + audio_points * 0.12
        + standalone_points * 0.15
    )
    score = round(clamp(score), 1)
    if score >= 82:
        tier = "strong-post-candidate"
    elif score >= 68:
        tier = "promising-needs-polish"
    elif score >= 52:
        tier = "needs-sharper-hook-or-proof"
    else:
        tier = "low-confidence-for-now"

    missing: list[str] = []
    if not hook:
        missing.append("hook")
    if not overlay:
        missing.append("caption-or-overlay-plan")
    if not card.get("primaryExportExists"):
        missing.append("local-export")
    if "listen" not in " ".join(audio_notes).lower() and not card.get("primaryExportExists"):
        missing.append("listen-through")

    dimensions = [
        {
            "id": "hook",
            "name": "Opening hook",
            "score": round(hook_points, 1),
            "label": "hook-ready" if hook else "needs-hook",
            "rationale": "The first second needs a concrete stop signal for a feed viewer.",
            "nextAction": "Watch the first 3 seconds and sharpen the promise, tension, question, or payoff.",
            "evidence": hook_notes,
        },
        {
            "id": "duration",
            "name": "Pacing window",
            "score": round(duration_points, 1),
            "label": duration_note,
            "rationale": "Duration controls whether the short can carry setup and payoff without dragging.",
            "nextAction": "Split, trim, or justify the length with a stronger payoff.",
            "evidence": [f"duration={duration:.1f}s"],
        },
        {
            "id": "platform-pack",
            "name": "Native platform pack",
            "score": round(platform_points, 1),
            "label": "platform-mapped" if destinations else "needs-destination",
            "rationale": "Shorts, Reels, Facebook, LinkedIn, Patreon, and site embeds each need native framing.",
            "nextAction": "Draft platform-specific title, caption, hashtags, and posting note.",
            "evidence": platform_notes,
        },
        {
            "id": "visual",
            "name": "Visual proof",
            "score": round(visual_points, 1),
            "label": "proof-visible" if card.get("primaryExportExists") else "needs-export-proof",
            "rationale": "Crop, face safety, captions, and platform UI cannot be trusted from metadata alone.",
            "nextAction": "Export locally and inspect proof/contact-sheet frames.",
            "evidence": visual_notes,
        },
        {
            "id": "audio",
            "name": "Audio/listen proof",
            "score": round(audio_points, 1),
            "label": "listen-signal-present" if "listen" in " ".join(audio_notes).lower() else "needs-listen-through",
            "rationale": "A short can look right and still fail if cadence, noise, or cuts feel unnatural.",
            "nextAction": "Listen through once before Keep or Tower handoff.",
            "evidence": audio_notes,
        },
        {
            "id": "coherence",
            "name": "Self-contained idea",
            "score": round(standalone_points, 1),
            "label": "standalone-check",
            "rationale": "A good short should feel like one complete mini-thought, even with multiple segments.",
            "nextAction": "Confirm setup, turn, and payoff are understandable without episode context.",
            "evidence": standalone_notes,
        },
    ]

    return {
        "qualityPassport": {
            "model": "quipsly-short-quality-passport",
            "version": "2026-06-30.batch-projection.v1",
            "truth": "Batch projection of the same visible quality-passport dimensions used by Quipsly Studio. It is a heuristic for choosing what to polish next, not a promise of performance or approval.",
            "dimensions": dimensions,
        },
        "qualityDimensions": dimensions,
        "growthScore": score,
        "growthTier": tier,
        "subscores": {
            "hook": round(hook_points, 1),
            "duration": round(duration_points, 1),
            "platform": round(platform_points, 1),
            "visual": round(visual_points, 1),
            "audio": round(audio_points, 1),
            "standalone": round(standalone_points, 1),
        },
        "notes": {
            "hook": hook_notes,
            "duration": [duration_note],
            "platform": platform_notes,
            "visual": visual_notes,
            "audio": audio_notes,
            "standalone": standalone_notes,
        },
        "missingQualitySignals": missing,
        "hookText": hook,
        "overlayText": overlay,
    }


def next_growth_action(card: dict[str, Any], score: dict[str, Any], output_dir: str) -> str:
    stage = card.get("stage")
    if stage in {"missing-export", "export-path-missing-file"}:
        return "Export locally first so the decision is based on a real file."
    if "hook" in score.get("missingQualitySignals", []):
        return "Write a sharper opening hook before packaging."
    if "caption-or-overlay-plan" in score.get("missingQualitySignals", []):
        return "Add or approve a readable caption/overlay plan."
    if stage == "exported-needs-visual-review":
        return "Generate a contact sheet and check face/caption safety."
    if stage == "exported-needs-listen-through":
        return "Run audio sanity and listen through once."
    if score.get("growthScore", 0) >= 82:
        return "Strong candidate: do final local review and prepare platform copy."
    return "Polish hook, crop, pacing, or caption plan before promoting."


def build_board(queue_path: str, state_path: str, output_dir: str, basename: str) -> dict[str, Any]:
    queue_payload = load_json(queue_path)
    state_payload = load_json(state_path) if state_path and os.path.exists(state_path) else {}
    rows = unique_shorts(queue_payload)
    cards: list[dict[str, Any]] = []
    for index, row in enumerate(rows, start=1):
        local_card = classify_short(row, output_dir, index)
        score = score_short(row, local_card)
        commands = local_card.get("commands") or {}
        local_card.update(score)
        local_card["nextGrowthAction"] = next_growth_action(local_card, score, output_dir)
        local_card["platformReadiness"] = platform_readiness(local_card)
        local_card["platformReadinessSummary"] = platform_readiness_summary(local_card.get("platformReadiness"))
        local_card["commands"] = {
            **commands,
            "writeHook": f"script/agentctl.sh shorts-select id {command_quote(local_card['id'])} && script/agentctl.sh shorts-update-selected hook {command_quote('Replace with a sharper opening hook.')}",
            "requestCaptionReview": f"script/agentctl.sh shorts-overlay-burn-in request_review {command_quote('Check captions/overlay for face safety and readability.')}",
        }
        cards.append(local_card)

    cards.sort(key=lambda item: (-float(item.get("growthScore") or 0), stage_rank(str(item.get("stage") or "")), item.get("index") or 999))
    tier_counts: dict[str, int] = {}
    for card in cards:
        tier = str(card.get("growthTier") or "unknown")
        tier_counts[tier] = tier_counts.get(tier, 0) + 1

    json_path = os.path.join(output_dir, f"{basename}.json")
    html_path = os.path.join(output_dir, f"{basename}.html")
    md_path = os.path.join(output_dir, f"{basename}.md")
    top = cards[0] if cards else None
    return {
        "packetType": "quipsly-shorts-growth-quality-board",
        "version": "2026-06-21.shorts-growth-quality-board.v1",
        "generatedAt": now_iso(),
        "json": json_path,
        "html": html_path,
        "markdown": md_path,
        "truth": "Growth score is a practical heuristic, not a promise of performance. Use it to choose what to polish next.",
        "shortCount": len(cards),
        "tierCounts": tier_counts,
        "episodeCoverage": episode_coverage(cards),
        "platformReadinessCoverage": platform_readiness_coverage(cards),
        "topCandidate": top,
        "cards": cards,
        "researchFeaturePrinciples": [
            "Find promising moments automatically, then let humans/agents refine them.",
            "Make vertical presentation feel native: crop, captions, layout, brand, and safe zones.",
            "Package each short for the platform: title, hook, description, hashtags, and destination notes.",
            "Close the loop with exports and analytics instead of pretending a queued clip is finished.",
        ],
        "sourceStateHints": {
            "selectedShortId": ((state_payload.get("shortsQueue") or {}).get("selectedId") if isinstance(state_payload, dict) else None),
            "exportStatus": ((state_payload.get("exportState") or {}).get("status") if isinstance(state_payload, dict) else None),
        },
    }


def html_page(board: dict[str, Any]) -> str:
    episode_html = html_episode_coverage(board.get("episodeCoverage"))
    platform_html = html_platform_readiness_coverage(board.get("platformReadinessCoverage"))
    tier_cards = "".join(
        f"<article><strong>{esc(value)}</strong><span>{esc(key)}</span></article>"
        for key, value in sorted((board.get("tierCounts") or {}).items())
    )
    rows = []
    for card in board.get("cards") or []:
        subs = card.get("subscores") or {}
        notes = card.get("notes") or {}
        commands = card.get("commands") or {}
        subs_html = "".join(
            f"<span><b>{esc(key)}</b>{esc(value)}</span>"
            for key, value in subs.items()
        )
        notes_html = "".join(
            f"<li>{esc(note)}</li>"
            for group in notes.values()
            for note in (group if isinstance(group, list) else [group])
        )
        next_command = commands.get("exportLocal")
        if card.get("primaryExportExists"):
            next_command = commands.get("contactSheet") or commands.get("audioSanity") or commands.get("writeHook")
        if "hook" in (card.get("missingQualitySignals") or []):
            next_command = commands.get("writeHook")
        rows.append(
            f"""
            <section class="short {esc(card.get('growthTier'))}">
              <div class="score">
                <strong>{esc(card.get('growthScore'))}</strong>
                <span>{esc(card.get('growthTier'))}</span>
              </div>
              <div>
                <p class="eyebrow">{esc(card.get('stage'))}</p>
                <h2>{esc(card.get('title'))}</h2>
                <p><strong>{esc(card.get('episodeLabel'))}</strong> - {esc(card.get('nextGrowthAction'))}</p>
                <p><strong>Platform readiness:</strong> {esc(card.get('platformReadinessSummary'))}</p>
                <div class="subs">{subs_html}</div>
                <ul>{notes_html}</ul>
              </div>
              <div class="commands">
                <label>Next command</label>
                <code>{esc(next_command or commands.get('select') or '')}</code>
                <label>Export file</label>
                <code>{esc(card.get('primaryExportPath') or 'none yet')}</code>
              </div>
            </section>
            """
        )
    top = board.get("topCandidate") or {}
    top_command = ((top.get("commands") or {}).get("exportLocal") if top else "") or ((top.get("commands") or {}).get("select") if top else "")
    return f"""<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Quipsly shorts growth quality board</title>
  <style>
    :root {{
      color-scheme: dark;
      --bg: #101711;
      --panel: #18231a;
      --ink: #f8f0d8;
      --muted: #b9ae94;
      --gold: #f4d35e;
      --moss: #8cc56e;
      --cyan: #5ec6d5;
      --line: rgba(248, 240, 216, 0.16);
    }}
    * {{ box-sizing: border-box; }}
    body {{
      margin: 0;
      background:
        radial-gradient(circle at 12% 6%, rgba(140,197,110,.22), transparent 24rem),
        radial-gradient(circle at 88% 0%, rgba(244,211,94,.14), transparent 28rem),
        linear-gradient(180deg, #101711, #0b100c);
      color: var(--ink);
      font: 15px/1.5 ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    }}
    main {{ max-width: 1220px; margin: 0 auto; padding: 42px 24px 72px; }}
    .hero, .short {{
      border: 1px solid var(--line);
      background: rgba(24,35,26,.86);
      border-radius: 28px;
      box-shadow: 0 28px 90px rgba(0,0,0,.28);
    }}
    .hero {{ padding: 32px; }}
    .eyebrow {{ color: var(--gold); text-transform: uppercase; letter-spacing: .22em; font-size: .72rem; font-weight: 900; margin: 0 0 8px; }}
    h1 {{ font-size: clamp(2.4rem, 6vw, 5rem); line-height: .92; letter-spacing: -.07em; margin: 0; }}
    h2 {{ margin: 0 0 8px; }}
    p {{ color: var(--muted); max-width: 760px; }}
    .counts {{ display: grid; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); gap: 12px; margin: 24px 0; }}
    .counts article {{ border: 1px solid var(--line); border-radius: 18px; padding: 14px; background: rgba(255,255,255,.04); }}
    .counts strong {{ display: block; color: var(--gold); font-size: 2.1rem; }}
    .counts span {{ color: var(--muted); }}
    .episode-coverage {{ margin-top: 18px; }}
    .episode-coverage-grid {{ display: grid; grid-template-columns: repeat(auto-fit, minmax(190px, 1fr)); gap: 10px; }}
    .episode-coverage article {{ border: 1px solid var(--line); border-radius: 16px; padding: 12px; background: rgba(140,197,110,.07); }}
    .episode-coverage strong {{ display: block; color: var(--moss); text-transform: uppercase; letter-spacing: .08em; }}
    .episode-coverage span, .episode-coverage small {{ display: block; color: var(--muted); }}
    .coverage-warning {{ color: var(--gold); margin: 8px 0 0; }}
    .platform-readiness-coverage {{ margin-top: 18px; }}
    .platform-readiness-grid {{ display: grid; grid-template-columns: repeat(auto-fit, minmax(190px, 1fr)); gap: 10px; }}
    .platform-readiness-coverage article {{ border: 1px solid var(--line); border-radius: 16px; padding: 12px; background: rgba(94,198,213,.07); }}
    .platform-readiness-coverage strong {{ display: block; color: var(--cyan); letter-spacing: .03em; }}
    .platform-readiness-coverage span, .platform-readiness-coverage small {{ display: block; color: var(--muted); }}
    .shorts {{ display: grid; gap: 16px; margin-top: 22px; }}
    .short {{ display: grid; grid-template-columns: 100px minmax(0, 1fr) minmax(280px, .85fr); gap: 18px; padding: 18px; }}
    .score {{ display: grid; place-items: center; align-content: center; border-radius: 22px; background: rgba(244,211,94,.1); border: 1px solid rgba(244,211,94,.22); }}
    .score strong {{ font-size: 2.7rem; color: var(--gold); }}
    .score span {{ text-align: center; color: var(--muted); font-size: .75rem; }}
    .subs {{ display: flex; flex-wrap: wrap; gap: 8px; margin: 10px 0; }}
    .subs span {{ padding: 5px 8px; border: 1px solid var(--line); border-radius: 999px; color: var(--muted); background: rgba(255,255,255,.04); }}
    .subs b {{ color: var(--cyan); margin-right: 6px; }}
    ul {{ margin: 10px 0 0; padding-left: 18px; color: var(--muted); }}
    .commands {{ display: grid; gap: 8px; align-content: start; }}
    label {{ color: var(--moss); font-size: .7rem; font-weight: 900; text-transform: uppercase; letter-spacing: .14em; }}
    code {{ display: block; white-space: pre-wrap; word-break: break-word; padding: 10px 12px; border-radius: 12px; background: rgba(0,0,0,.32); color: #fff6c2; border: 1px solid rgba(244,211,94,.18); font-size: .8rem; }}
    @media (max-width: 900px) {{ .short {{ grid-template-columns: 1fr; }} .score {{ min-height: 90px; }} }}
  </style>
</head>
<body>
  <main>
    <section class="hero">
      <p class="eyebrow">Quipsly Studio - shorts growth board</p>
      <h1>Pick clips for attention, not just completion.</h1>
      <p>Score the queue for hook, pacing, vertical presentation, audio confidence, platform packaging, and standalone clarity. This is a compass, not a prophecy.</p>
      <div class="counts">{tier_cards}</div>
      {episode_html}
      {platform_html}
      <p class="eyebrow">Top candidate</p>
      <h2>{esc(top.get('title') if top else 'No candidates found')}</h2>
      <p>{esc(top.get('nextGrowthAction') if top else 'Create or import short candidates first.')}</p>
      <code>{esc(top_command or 'No command available')}</code>
    </section>
    <section class="shorts">{''.join(rows)}</section>
  </main>
</body>
</html>
"""


def markdown_page(board: dict[str, Any]) -> str:
    lines = [
        "# Quipsly shorts growth quality board",
        "",
        "This board ranks candidates by practical social-short quality: hook, duration, platform packaging, visual readiness, audio readiness, and standalone clarity.",
        "",
        f"- Generated: `{board.get('generatedAt')}`",
        f"- Shorts: `{board.get('shortCount')}`",
        "",
        "## Tier counts",
        "",
    ]
    for key, value in sorted((board.get("tierCounts") or {}).items()):
        lines.append(f"- `{key}`: `{value}`")
    lines.extend(["", *markdown_episode_coverage(board.get("episodeCoverage"))])
    lines.extend(["", *markdown_platform_readiness_coverage(board.get("platformReadinessCoverage"))])
    lines.extend(["", "## Ranked candidates", ""])
    for card in board.get("cards") or []:
        commands = card.get("commands") or {}
        lines.extend([
            f"### {card.get('growthScore')} - {card.get('title')}",
            "",
            f"- Episode: `{card.get('episodeKey')}` (`{card.get('episodeInference')}`)",
            f"- Tier: `{card.get('growthTier')}`",
            f"- Stage: `{card.get('stage')}`",
            f"- Next: {card.get('nextGrowthAction')}",
            f"- Platform readiness: `{card.get('platformReadinessSummary')}`",
            f"- Missing: `{', '.join(card.get('missingQualitySignals') or []) or 'none'}`",
            "",
            "```bash",
            commands.get("exportLocal") or "",
            commands.get("writeHook") or "",
            commands.get("contactSheet") or "",
            commands.get("audioSanity") or "",
            "```",
            "",
        ])
    return "\n".join(lines)


def main(argv: list[str]) -> int:
    if len(argv) < 5:
        print(
            "Usage: shorts_growth_quality_board.py SHORTS_QUEUE_JSON STATE_JSON OUTPUT_DIR BASENAME [--json|--html|--md]",
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
