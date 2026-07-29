#!/usr/bin/env python3
"""Render a human-flow cut review board from Quipsly Studio's agent endpoint.

This is intentionally read-only. It turns the existing Cut Intelligence recipe
queue into reviewer-friendly JSON, Markdown, and HTML so humans and agents can
choose the next boundary that deserves ears without mutating media or edit data.
"""

from __future__ import annotations

import argparse
import datetime as dt
import html
import json
import os
import urllib.parse
import urllib.request
from typing import Any


TECHNIQUE_GUIDANCE: dict[str, dict[str, str]] = {
    "j-cut": {
        "plainEnglish": "Let the next speaker's audio arrive a little before their picture.",
        "useWhen": "Use when a reply, laugh, or interruption should feel conversational instead of mechanically sequential.",
        "watchOut": "Do not make the incoming speaker feel like they are talking over a thought that needed room to land.",
    },
    "l-cut": {
        "plainEnglish": "Let the current speaker's audio continue briefly over the next picture.",
        "useWhen": "Use when the outgoing voice should carry meaning while the viewer sees the listener, b-roll, or a reaction.",
        "watchOut": "Do not hide a confusing visual switch behind audio if the viewer still needs to know who is speaking.",
    },
    "reaction-cover": {
        "plainEnglish": "Use a listener reaction or alternate source to cover a jump or make a beat feel more human.",
        "useWhen": "Use when the reaction genuinely adds context, tension, warmth, humor, or attention.",
        "watchOut": "Do not cover every jump by reflex. Some jumps are honest energy and should stay visible.",
    },
    "context-cover": {
        "plainEnglish": "Use a referenced clip, b-roll, or supporting visual while the main audio continues.",
        "useWhen": "Use when the viewer benefits from seeing the thing being discussed.",
        "watchOut": "Do not replace a face when the point lives in delivery, uncertainty, or relationship texture.",
    },
    "preserve-air-audit": {
        "plainEnglish": "Pause before tightening. Decide whether the quiet is dead air or meaningful air.",
        "useWhen": "Use around breath, awkward warmth, comic timing, thinking pauses, or emotionally loaded silence.",
        "watchOut": "Do not optimize away humanity just because a waveform looks empty.",
    },
    "cadence-sensitive-hold": {
        "plainEnglish": "Keep the timing if the rhythm is doing useful work.",
        "useWhen": "Use when a pause, stumble, or delayed response makes the exchange feel real.",
        "watchOut": "Do not make the conversation sound artificially sped up or over-cleaned.",
    },
    "hold-for-ear-pass": {
        "plainEnglish": "Listen at normal speed before trusting an automated cut suggestion.",
        "useWhen": "Use when the metadata is uncertain or the cut might change meaning, tone, or warmth.",
        "watchOut": "Do not approve by sight alone. Podcast rhythm is judged by ear first.",
    },
    "straight-cut-review": {
        "plainEnglish": "A normal visual/audio cut that still deserves a quick watch and listen.",
        "useWhen": "Use when no special split edit or cover appears necessary.",
        "watchOut": "Do not assume boring means safe. A plain cut can still clip a word or kill a joke.",
    },
}


def fetch_json(base_url: str, mode: str, limit: int) -> dict[str, Any]:
    query = urllib.parse.urlencode({"mode": mode, "limit": str(limit)})
    url = f"{base_url.rstrip('/')}/decision_human_flow_queue?{query}"
    with urllib.request.urlopen(url, timeout=4) as response:
        payload = json.loads(response.read().decode("utf-8", errors="replace"))
    if isinstance(payload, dict):
        payload["_sourceUrl"] = url
        return payload
    return {"status": "unexpected_payload", "recipes": [], "_sourceUrl": url}


def text(value: Any, default: str = "") -> str:
    if value is None:
        return default
    result = str(value).strip()
    return result or default


def number(value: Any, default: float = 0.0) -> float:
    try:
        return float(value)
    except (TypeError, ValueError):
        return default


def shell_quote(value: Any) -> str:
    """Return a conservative single-quoted shell argument for copyable commands."""
    return "'" + text(value).replace("'", "'\"'\"'") + "'"


def rows_from_payload(payload: dict[str, Any]) -> list[dict[str, Any]]:
    recipes = payload.get("recipes")
    if not isinstance(recipes, list):
        recipes = []
    rows: list[dict[str, Any]] = []
    for index, recipe in enumerate(recipes, start=1):
        if not isinstance(recipe, dict):
            continue
        confidence = number(recipe.get("confidence"))
        priority = int(number(recipe.get("reviewPriority")))
        sequence_time = number(recipe.get("sequenceTime"))
        row = {
            "index": index,
            "id": text(recipe.get("id"), f"recipe-{index}"),
            "label": text(recipe.get("label"), "Untitled cut recipe"),
            "sequenceTime": sequence_time,
            "timeLabel": seconds_label(sequence_time),
            "targetLaneName": text(recipe.get("targetLaneName"), "Unknown lane"),
            "technique": text(recipe.get("technique") or recipe.get("recommendedTechnique"), "straight-cut-review"),
            "reviewClass": text(recipe.get("reviewClass"), "unclassified"),
            "reviewClassExplanation": text(recipe.get("reviewClassExplanation"), "No review-class explanation attached yet."),
            "reviewPriority": priority,
            "risk": text(recipe.get("risk"), "unknown"),
            "confidence": confidence,
            "confidencePercent": int(round(confidence * 100)),
            "cutStyle": text(recipe.get("cutStyle"), "unknown"),
            "coverStrategy": text(recipe.get("coverStrategy"), "none"),
            "nextReviewAction": text(recipe.get("nextReviewAction"), "Preview and listen before applying metadata."),
            "previewCommand": text(recipe.get("previewCommand"), f"script/agentctl.sh cut-recipe-preview {text(recipe.get('id'))}"),
            "truth": text(recipe.get("truth"), "Review card only. Source media stays untouched."),
        }
        row["reviewQuestion"] = review_question_for(row)
        row["doNotOptimizeAway"] = do_not_optimize_away_for(row)
        row["techniqueGuidance"] = technique_guidance_for(row["technique"])
        row["evidenceChecklist"] = evidence_checklist_for(row)
        row["reviewOutcomes"] = review_outcomes_for(row)
        row["learningEventTemplate"] = learning_event_template_for(row)
        note_text = (
            f"Human-flow review needed at {row['timeLabel']}: {row['reviewQuestion']} "
            f"Do not optimize away: {row['doNotOptimizeAway']}"
        )
        row["safeCommands"] = {
            "cueBoundary": f"script/agentctl.sh scrub {row['sequenceTime']:.3f}",
            "preview": row["previewCommand"],
            "nextHumanFlow": "script/agentctl.sh decision-human-flow-next any",
            "addReviewNoteAfterSelecting": (
                "script/agentctl.sh decision-intent-note "
                f"{shell_quote(note_text)} Codex cadence 0.5"
            ),
            "markNeedsListenAfterSelecting": (
                "script/agentctl.sh decision-intent-status needs-listen Codex "
                f"{shell_quote('Human-flow board flagged this boundary for normal-speed review.')}"
            ),
        }
        rows.append(row)
    return sorted(rows, key=lambda row: (-int(row["reviewPriority"]), row["sequenceTime"], row["id"]))


def technique_guidance_for(technique: str) -> dict[str, str]:
    normalized = technique.strip().lower()
    if normalized in TECHNIQUE_GUIDANCE:
        return TECHNIQUE_GUIDANCE[normalized]
    for key, guidance in TECHNIQUE_GUIDANCE.items():
        if key in normalized:
            return guidance
    return {
        "plainEnglish": "Review this as a craft decision, not just a technical cut.",
        "useWhen": "Use when the boundary needs a human ear or eye before it becomes trusted metadata.",
        "watchOut": "Do not let the tool turn uncertainty into false confidence.",
    }


def evidence_checklist_for(row: dict[str, Any]) -> list[str]:
    haystack = " ".join(
        text(row.get(key)).lower()
        for key in ("technique", "reviewClass", "reviewClassExplanation", "cutStyle", "coverStrategy", "nextReviewAction")
    )
    checks = [
        "Cue the boundary and listen at normal speed from a few seconds before to a few seconds after.",
        "Watch the source wall, not just Program Output, so reactions and alternate covers stay visible.",
    ]
    if "pause" in haystack or "air" in haystack or "cadence" in haystack or "breath" in haystack:
        checks.append("Decide whether the pause is dead air or meaning-bearing air before tightening it.")
    if "jump" in haystack:
        checks.append("If the cut jumps on the same face, try a reaction, clip, or honest visible jump instead of auto-hiding it.")
    if "reaction" in haystack:
        checks.append("Confirm the reaction changes the story beat; do not use it only as wallpaper over a cut.")
    if "j-cut" in haystack or "l-cut" in haystack or "split" in haystack:
        checks.append("Judge the split edit by ear first: the handoff should feel conversational, not clever.")
    if "clip" in haystack or "b-roll" in haystack or "context" in haystack:
        checks.append("Check whether the viewer needs the referenced visual now, or whether the speaker's face carries the moment better.")
    checks.append("If uncertain, leave a review note instead of promoting the cut to trusted metadata.")
    return checks


def review_outcomes_for(row: dict[str, Any]) -> list[dict[str, str]]:
    haystack = " ".join(
        text(row.get(key)).lower()
        for key in ("technique", "reviewClass", "reviewClassExplanation", "cutStyle", "coverStrategy", "nextReviewAction")
    )
    outcomes: list[dict[str, str]] = [
        {
            "label": "Keep the cadence",
            "whenToUse": "The timing feels human, funny, thoughtful, or emotionally honest.",
            "metadataHint": "Mark as reviewed/preserve-cadence rather than tightening.",
        },
        {
            "label": "Tighten gently",
            "whenToUse": "The pause is only dead air and tightening does not clip breath, reaction, or meaning.",
            "metadataHint": "Shorten or add a SKIP decision with a note that the cadence survived.",
        },
    ]
    if "jump" in haystack or "reaction" in haystack or "cover" in haystack:
        outcomes.append({
            "label": "Cover the jump",
            "whenToUse": "The cut calls attention to itself and a real reaction/source cover improves the story beat.",
            "metadataHint": "Prefer reaction-cover/context-cover metadata over chopping source media.",
        })
    if "j-cut" in haystack or "l-cut" in haystack or "split" in haystack:
        outcomes.append({
            "label": "Use a split edit",
            "whenToUse": "Audio leading or trailing makes the handoff feel more conversational by ear.",
            "metadataHint": "Record J-cut/L-cut intent and keep the visual/audio offset inspectable.",
        })
    if "clip" in haystack or "b-roll" in haystack or "context" in haystack:
        outcomes.append({
            "label": "Use context visual",
            "whenToUse": "The viewer needs to see the referenced clip, object, quote, or example now.",
            "metadataHint": "Attach context-cover intent and keep the speaker audio as the spine.",
        })
    outcomes.append({
        "label": "Needs human listen",
        "whenToUse": "The boundary is ambiguous, funny, delicate, or meaning-changing.",
        "metadataHint": "Leave a review note instead of promoting the cut.",
    })
    return outcomes


def learning_event_template_for(row: dict[str, Any]) -> dict[str, Any]:
    return {
        "eventType": "human_flow_cut_review",
        "boundaryId": row["id"],
        "sequenceTime": row["sequenceTime"],
        "timeLabel": row["timeLabel"],
        "targetLaneName": row["targetLaneName"],
        "recommendedTechnique": row["technique"],
        "reviewClass": row["reviewClass"],
        "reviewPriority": row["reviewPriority"],
        "risk": row["risk"],
        "confidence": row["confidence"],
        "reviewQuestion": row["reviewQuestion"],
        "doNotOptimizeAway": row["doNotOptimizeAway"],
        "evidenceChecklist": row["evidenceChecklist"],
        "availableOutcomeLabels": [outcome["label"] for outcome in row["reviewOutcomes"]],
        "reviewerFields": {
            "chosenOutcome": "",
            "reviewerNote": "",
            "audioContinuity": "",
            "visualContinuity": "",
            "cadenceJudgment": "",
            "actionTaken": "",
        },
        "truth": "Template only. Fill after review; do not mutate source media.",
    }


def seconds_label(seconds: float) -> str:
    seconds = max(0.0, seconds)
    whole = int(seconds)
    return f"{whole // 60:02d}:{whole % 60:02d}.{int((seconds - whole) * 10):01d}"


def review_question_for(row: dict[str, Any]) -> str:
    haystack = " ".join(
        text(row.get(key)).lower()
        for key in ("technique", "reviewClass", "reviewClassExplanation", "cutStyle", "coverStrategy", "nextReviewAction")
    )
    if "jump" in haystack:
        return "Does this boundary need a reaction/clip cover, or is the jump honest enough to leave visible?"
    if "reaction" in haystack or "cover" in haystack:
        return "Does the reaction add human context, or is it only hiding the edit?"
    if "pause" in haystack or "air" in haystack or "cadence" in haystack or "breath" in haystack:
        return "Is this dead air, or is the pause doing social, comic, emotional, or thinking work?"
    if "j-cut" in haystack or "l-cut" in haystack or "split" in haystack:
        return "Does the audio lead or tail make the speaker handoff feel more natural by ear?"
    return "Does this cut disappear, or does the viewer feel the machinery?"


def do_not_optimize_away_for(row: dict[str, Any]) -> str:
    haystack = " ".join(
        text(row.get(key)).lower()
        for key in ("technique", "reviewClass", "reviewClassExplanation", "cutStyle", "coverStrategy", "nextReviewAction")
    )
    if "pause" in haystack or "air" in haystack or "cadence" in haystack or "breath" in haystack:
        return "Breath, hesitation, comic timing, awkward warmth, and meaning-bearing pauses."
    if "reaction" in haystack:
        return "Real listener texture or emotional response."
    if "clip" in haystack or "b-roll" in haystack:
        return "The speaker's face when the point lives in delivery rather than illustration."
    if "jump" in haystack:
        return "Honest energy; not every visible jump needs to be hidden."
    return "A clean cut that already works."


def build_board(payload: dict[str, Any], rows: list[dict[str, Any]], output_dir: str, basename: str) -> dict[str, Any]:
    counts: dict[str, int] = {}
    technique_counts: dict[str, int] = {}
    for row in rows:
        counts[row["reviewClass"]] = counts.get(row["reviewClass"], 0) + 1
        technique_counts[row["technique"]] = technique_counts.get(row["technique"], 0) + 1
    return {
        "model": "quipsly-human-flow-cut-review-board",
        "version": "2026-06-30.human-flow-board.v1",
        "generatedAt": dt.datetime.now(dt.timezone.utc).astimezone().isoformat(timespec="seconds"),
        "sourceUrl": payload.get("_sourceUrl", ""),
        "sourceStatus": payload.get("status", ""),
        "mode": payload.get("mode", ""),
        "returnedCount": len(rows),
        "totalRecipeCount": payload.get("totalRecipeCount", len(rows)),
        "reviewClassCounts": counts,
        "techniqueCounts": technique_counts,
        "nextRecipe": rows[0] if rows else {},
        "recipes": rows,
        "outputs": {
            "json": os.path.join(output_dir, f"{basename}.json"),
            "markdown": os.path.join(output_dir, f"{basename}.md"),
            "html": os.path.join(output_dir, f"{basename}.html"),
        },
        "safeUse": "Read-only review board. Preview and listen before applying metadata. This board does not mutate media, exports, timeline decisions, or publication state.",
        "reviewProtocol": [
            "Cue the boundary.",
            "Listen at normal speed before trusting the waveform or recommendation.",
            "Watch Program Output and the synced source wall together.",
            "Prefer human cadence over maximum tightness unless the chosen style explicitly asks for speed.",
            "Leave metadata notes when a boundary needs human or later-agent judgment.",
        ],
        "outcomeTruth": "Review outcomes are labels for the next judgment. They are not publication claims and they never mutate source media.",
        "learningTruth": "Learning event templates are blank review receipts. They prepare training-quality evidence without forcing a reviewer to fill them out before editing can continue.",
        "commandSafety": {
            "cueBoundary": "Safe read/navigation action. Moves the app playhead to the candidate boundary.",
            "preview": "Safe preview action. Opens or describes the candidate without mutating source media.",
            "nextHumanFlow": "Safe queue action. Selects the next candidate using the app's existing agent command seam.",
            "addReviewNoteAfterSelecting": "Metadata action. Use only after selecting/previewing the intended boundary.",
            "markNeedsListenAfterSelecting": "Metadata action. Use only after selecting/previewing the intended boundary.",
        },
        "truth": "Human-flow review is a craft queue over whole source lanes and transparent metadata decisions."
    }


def render_markdown(board: dict[str, Any]) -> str:
    lines = [
        "# Quipsly human-flow cut review board",
        "",
        "Use this board to choose the next cut boundary that deserves a normal-speed ear pass.",
        "",
        f"- Generated: `{board['generatedAt']}`",
        f"- Mode: `{board.get('mode') or 'any'}`",
        f"- Cards: `{board['returnedCount']}`",
        f"- Truth: {board['truth']}",
        "",
        "## Review protocol",
        "",
    ]
    for step in board.get("reviewProtocol") or []:
        lines.append(f"- {step}")
    lines.extend([
        "",
        "## Technique counts",
        "",
    ])
    for label, count in sorted((board.get("techniqueCounts") or {}).items()):
        lines.append(f"- `{label}`: `{count}`")
    lines.extend(["", "## Review queue", ""])
    for row in board.get("recipes") or []:
        lines.extend([
            f"### P{row['reviewPriority']} - {row['timeLabel']} - {row['technique']} - {row['label']}",
            "",
            f"- Lane: `{row['targetLaneName']}`",
            f"- Risk/confidence: `{row['risk']}` / `{row['confidencePercent']}%`",
            f"- Why: {row['reviewClassExplanation']}",
            f"- Technique in plain English: {row['techniqueGuidance']['plainEnglish']}",
            f"- Use when: {row['techniqueGuidance']['useWhen']}",
            f"- Watch out: {row['techniqueGuidance']['watchOut']}",
            f"- Review question: {row['reviewQuestion']}",
            f"- Do not optimize away: {row['doNotOptimizeAway']}",
            f"- Next: {row['nextReviewAction']}",
            "",
            "Evidence checklist:",
        ])
        for check in row.get("evidenceChecklist") or []:
            lines.append(f"- [ ] {check}")
        lines.extend([
            "",
            "Possible review outcomes:",
        ])
        for outcome in row.get("reviewOutcomes") or []:
            lines.append(
                f"- **{outcome['label']}**: {outcome['whenToUse']} "
                f"_Metadata hint:_ {outcome['metadataHint']}"
            )
        lines.extend([
            "",
            "Learning event template:",
            "",
            "```json",
            json.dumps(row["learningEventTemplate"], indent=2, sort_keys=True),
            "```",
            "",
            "```bash",
            f"# Cue the playhead to this boundary.",
            row["safeCommands"]["cueBoundary"],
            "",
            f"# Preview/listen before applying metadata.",
            row["safeCommands"]["preview"],
            "",
            f"# Optional after the intended boundary is selected.",
            row["safeCommands"]["addReviewNoteAfterSelecting"],
            row["safeCommands"]["markNeedsListenAfterSelecting"],
            "```",
            "",
        ])
    return "\n".join(lines)


def render_html(board: dict[str, Any]) -> str:
    counts = "".join(
        f"<span><b>{html.escape(label)}</b> {count}</span>"
        for label, count in sorted((board.get("techniqueCounts") or {}).items())
    )
    cards = []
    for row in board.get("recipes") or []:
        cards.append(f"""
        <article class="card">
          <div class="priority">P{html.escape(str(row['reviewPriority']))}</div>
          <div>
            <p class="eyebrow">{html.escape(row['timeLabel'])} - {html.escape(row['targetLaneName'])}</p>
            <h2>{html.escape(row['technique'])}: {html.escape(row['label'])}</h2>
            <p>{html.escape(row['reviewClassExplanation'])}</p>
            <div class="guidance">
              <p><b>Plain English:</b> {html.escape(row['techniqueGuidance']['plainEnglish'])}</p>
              <p><b>Use when:</b> {html.escape(row['techniqueGuidance']['useWhen'])}</p>
              <p><b>Watch out:</b> {html.escape(row['techniqueGuidance']['watchOut'])}</p>
            </div>
            <p><b>Listen for:</b> {html.escape(row['reviewQuestion'])}</p>
            <p><b>Do not optimize away:</b> {html.escape(row['doNotOptimizeAway'])}</p>
            <p><b>Next:</b> {html.escape(row['nextReviewAction'])}</p>
            <ul class="checklist">
              {''.join(f"<li>{html.escape(check)}</li>" for check in (row.get('evidenceChecklist') or []))}
            </ul>
            <div class="outcomes">
              <h3>Possible outcomes</h3>
              {''.join(f"<p><b>{html.escape(outcome['label'])}</b>: {html.escape(outcome['whenToUse'])}<br><span>{html.escape(outcome['metadataHint'])}</span></p>" for outcome in (row.get('reviewOutcomes') or []))}
            </div>
            <details class="learning-template">
              <summary>Learning event template</summary>
              <code>{html.escape(json.dumps(row['learningEventTemplate'], indent=2, sort_keys=True))}</code>
            </details>
            <div class="meta">
              <span>{html.escape(row['risk'])}</span>
              <span>{html.escape(str(row['confidencePercent']))}% confidence</span>
              <span>{html.escape(row['reviewClass'])}</span>
            </div>
            <div class="commands">
              <p><b>1. Cue</b></p>
              <code>{html.escape(row['safeCommands']['cueBoundary'])}</code>
              <p><b>2. Preview/listen</b></p>
              <code>{html.escape(row['safeCommands']['preview'])}</code>
              <p><b>3. Optional metadata after selecting the intended boundary</b></p>
              <code>{html.escape(row['safeCommands']['addReviewNoteAfterSelecting'])}</code>
              <code>{html.escape(row['safeCommands']['markNeedsListenAfterSelecting'])}</code>
            </div>
          </div>
        </article>
        """)
    return f"""<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title>Quipsly human-flow cut review board</title>
  <style>
    body {{ margin: 0; background: #14221c; color: #f6edd9; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }}
    main {{ max-width: 1180px; margin: 0 auto; padding: 32px; }}
    .hero {{ border: 1px solid rgba(222, 184, 94, .35); border-radius: 28px; padding: 28px; background: linear-gradient(135deg, rgba(43, 75, 58, .82), rgba(42, 34, 24, .76)); }}
    .eyebrow {{ margin: 0 0 7px; color: #e7bd55; text-transform: uppercase; letter-spacing: .15em; font-size: 12px; font-weight: 900; }}
    h1 {{ margin: 0 0 10px; font-size: clamp(32px, 5vw, 58px); line-height: .95; }}
    h2 {{ margin: 0 0 8px; font-size: 20px; }}
    .counts, .meta {{ display: flex; flex-wrap: wrap; gap: 8px; margin-top: 14px; }}
    .counts span, .meta span {{ background: rgba(246, 237, 217, .10); border: 1px solid rgba(246, 237, 217, .14); border-radius: 999px; padding: 6px 10px; }}
    .grid {{ display: grid; gap: 14px; margin-top: 18px; }}
    .card {{ display: grid; grid-template-columns: 72px 1fr; gap: 14px; padding: 18px; background: rgba(8, 15, 12, .72); border: 1px solid rgba(246, 237, 217, .13); border-radius: 22px; }}
    .priority {{ align-self: start; justify-self: center; min-width: 46px; text-align: center; border-radius: 16px; padding: 10px; background: #e7bd55; color: #172019; font-weight: 950; }}
    .guidance {{ margin: 12px 0; padding: 12px 14px; border-radius: 16px; background: rgba(189, 231, 208, .08); border: 1px solid rgba(189, 231, 208, .15); }}
    .guidance p {{ margin: 6px 0; }}
    .checklist {{ margin: 12px 0; padding-left: 20px; color: #dfd5bf; }}
    .checklist li {{ margin: 6px 0; }}
    .outcomes {{ margin: 12px 0; padding: 12px 14px; border-radius: 16px; background: rgba(231, 189, 85, .08); border: 1px solid rgba(231, 189, 85, .18); }}
    .outcomes h3 {{ margin: 0 0 8px; color: #e7bd55; font-size: 13px; text-transform: uppercase; letter-spacing: .10em; }}
    .outcomes p {{ margin: 8px 0; }}
    .outcomes span {{ color: #bde7d0; }}
    .learning-template {{ margin: 12px 0; padding: 12px 14px; border-radius: 16px; background: rgba(0, 0, 0, .18); border: 1px solid rgba(246, 237, 217, .12); }}
    .learning-template summary {{ cursor: pointer; color: #e7bd55; font-weight: 850; }}
    .commands p {{ margin: 12px 0 4px; color: #e7bd55; font-size: 12px; text-transform: uppercase; letter-spacing: .08em; font-weight: 850; }}
    code {{ display: block; white-space: pre-wrap; margin-top: 12px; padding: 10px; border-radius: 12px; background: rgba(0, 0, 0, .30); color: #bde7d0; }}
  </style>
</head>
<body>
  <main>
    <section class="hero">
      <p class="eyebrow">Quipsly Studio - human-flow cut review</p>
      <h1>Find the cuts that need ears.</h1>
      <p>Whole sources stay intact. This board only helps choose which boundary to preview, listen to, and annotate next.</p>
      <div class="counts">{counts}</div>
    </section>
    <section class="grid">{''.join(cards)}</section>
  </main>
</body>
</html>
"""


def write_outputs(board: dict[str, Any], output_dir: str, basename: str) -> None:
    os.makedirs(output_dir, exist_ok=True)
    with open(os.path.join(output_dir, f"{basename}.json"), "w", encoding="utf-8") as handle:
        json.dump(board, handle, indent=2, sort_keys=True)
        handle.write("\n")
    with open(os.path.join(output_dir, f"{basename}.md"), "w", encoding="utf-8") as handle:
        handle.write(render_markdown(board))
        handle.write("\n")
    with open(os.path.join(output_dir, f"{basename}.html"), "w", encoding="utf-8") as handle:
        handle.write(render_html(board))


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--base-url", default=os.environ.get("QUIPSLY_AGENT_URL", "http://127.0.0.1:8080"))
    parser.add_argument("--mode", default="any")
    parser.add_argument("--limit", type=int, default=12)
    parser.add_argument("--output-dir", default="/Users/wall-e/Movies/QuipslyExports/human-flow-review")
    parser.add_argument("--basename", default="human-flow-cut-review-board")
    args = parser.parse_args()

    payload = fetch_json(args.base_url, args.mode, max(1, args.limit))
    rows = rows_from_payload(payload)
    board = build_board(payload, rows, args.output_dir, args.basename)
    write_outputs(board, args.output_dir, args.basename)
    print(json.dumps(board["outputs"], indent=2, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
