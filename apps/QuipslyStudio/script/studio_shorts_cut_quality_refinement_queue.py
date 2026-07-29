#!/usr/bin/env python3
"""Rank shorts for the next cut-quality refinement pass.

This queue reads merged review packets and recommends what to inspect first. It
is routing/evidence only: no approvals, edits, exports, uploads, publications,
or receipt truth.
"""
from __future__ import annotations

import argparse
import html
import json
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


DEFAULT_ROOT = Path("/Volumes/My Passport/Episode_and_Shorts_Test")
DEFAULT_PACKET_INDEX_JSON = (
    DEFAULT_ROOT
    / "shorts-command-room"
    / "cut-quality-review-packets"
    / "index"
    / "quipsly-studio-shorts-cut-quality-review-packet-index.json"
)
DEFAULT_OUTPUT_DIR = DEFAULT_ROOT / "shorts-command-room" / "cut-quality-refinement-queue"
DEFAULT_BASENAME = "quipsly-studio-shorts-cut-quality-refinement-queue"
SCHEMA = "quipsly.studio.shorts-cut-quality-refinement-queue.v1"
VERSION = "2026-07-02.v1"


def iso_now() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat()


def esc(value: Any) -> str:
    return html.escape(str(value if value is not None else ""))


def shell_quote(value: str) -> str:
    return "'" + value.replace("'", "'\"'\"'") + "'"


def file_uri(path: str | Path) -> str:
    try:
        return Path(path).expanduser().resolve().as_uri()
    except ValueError:
        return ""


def read_json(path: Path) -> dict[str, Any]:
    if not path.exists():
        raise SystemExit(f"Review-packet index not found: {path}\nRun: script/agentctl.sh studio-shorts-cut-quality-review-packet-index --all")
    with path.open("r", encoding="utf-8") as handle:
        data = json.load(handle)
    if not isinstance(data, dict):
        raise SystemExit(f"Expected JSON object: {path}")
    return data


def score_row(row: dict[str, Any]) -> tuple[int, list[str], str]:
    cadence = str(row.get("cadenceLabel") or "unknown")
    readiness = str(row.get("readinessLevel") or "unknown")
    meaningful = int(row.get("meaningfulPauseCount") or 0)
    long_pauses = int(row.get("longPauseCount") or 0)
    missing = row.get("missingEvidence") if isinstance(row.get("missingEvidence"), list) else []
    score = 0
    reasons: list[str] = []
    if not missing and row.get("visualStatus") == "available" and row.get("audioStatus") == "available":
        score += 30
        reasons.append("complete visual/audio evidence")
    if readiness == "caption-timing-review":
        score += 18
        reasons.append("caption/timing review is already the next useful layer")
    elif readiness == "watch-listen-first":
        score += 8
        reasons.append("needs human watch/listen but has enough evidence to start")
    if cadence == "rhythm-plausible":
        score += 24
        reasons.append("cadence looks plausible enough to polish first")
    elif cadence == "cadence-review":
        score += 8
        reasons.append("cadence needs review before polish")
    if long_pauses == 0:
        score += 14
        reasons.append("no long pauses detected")
    elif long_pauses <= 2:
        score += 8
        reasons.append("only a few long pauses detected")
    elif long_pauses >= 8:
        score -= 12
        reasons.append("many long pauses: likely needs cadence surgery before platform polish")
    if meaningful <= 5:
        score += 8
        reasons.append("pause density is manageable")
    elif meaningful >= 12:
        score -= 6
        reasons.append("high pause density needs careful human-feel review")
    if missing:
        score -= 40
        reasons.append("missing evidence blocks refinement")
    if score >= 70:
        lane = "polish-first"
    elif score >= 50:
        lane = "review-then-polish"
    elif score >= 35:
        lane = "cadence-review-first"
    else:
        lane = "hold-for-human-feel-review"
    return score, reasons, lane


def craft_focus(row: dict[str, Any], lane: str) -> dict[str, Any]:
    cadence = str(row.get("cadenceLabel") or "unknown")
    readiness = str(row.get("readinessLevel") or "unknown")
    meaningful = int(row.get("meaningfulPauseCount") or 0)
    long_pauses = int(row.get("longPauseCount") or 0)
    missing = row.get("missingEvidence") if isinstance(row.get("missingEvidence"), list) else []
    focus: list[str] = []
    questions: list[dict[str, str]] = [
        {
            "dimension": "hook",
            "question": "Does the first 1-2 seconds create a reason to keep watching?",
            "watchFor": "A concrete claim, tension, surprise, visual cue, or emotional turn. If the short opens with throat-clearing, move the in-point.",
        },
        {
            "dimension": "j-cut-l-cut",
            "question": "Would an audio lead or audio tail make this feel less chopped?",
            "watchFor": "Let reactions, breaths, or thought handoffs overlap when a hard butt-cut makes the speaker feel robotic.",
        },
        {
            "dimension": "jump-cut-cover",
            "question": "Does a same-speaker jump cut need a crop punch-in, reaction cover, B-roll, or a held pause?",
            "watchFor": "A jump cut is fine when energetic and intentional; it is a problem when it feels like a missing word or broken thought.",
        },
        {
            "dimension": "reaction",
            "question": "Is there a reaction or listening beat that should be preserved?",
            "watchFor": "Do not cut all quiet. Some silence is the human meaning landing.",
        },
        {
            "dimension": "caption-framing",
            "question": "Will captions fit without covering faces or the emotional center of the shot?",
            "watchFor": "Keep face-safe caption space, especially in 9:16 crops.",
        },
        {
            "dimension": "platform-fit",
            "question": "Is this one complete social idea, or should it become a teaser/thread/split short?",
            "watchFor": "Shorts need a clean promise and payoff. Nuance is good; wandering is expensive.",
        },
    ]
    if missing:
        focus.append("repair-evidence")
        questions.insert(0, {
            "dimension": "evidence",
            "question": "What evidence is missing before this can be judged fairly?",
            "watchFor": ", ".join(str(item) for item in missing),
        })
    if readiness == "caption-timing-review":
        focus.append("caption-timing")
    if cadence == "cadence-review":
        focus.append("cadence")
    if long_pauses >= 3:
        focus.append("pause-trim-vs-preserve")
    elif long_pauses == 0 and meaningful <= 5:
        focus.append("platform-polish")
    if lane == "polish-first":
        stance = "This is a good candidate for platform polish after one watch/listen pass."
    elif lane == "review-then-polish":
        stance = "This has enough evidence to review now; polish only after specific human-feel notes."
    elif lane == "cadence-review-first":
        stance = "Do not polish yet. First decide what pauses are meaningful, what can tighten, and where J/L cuts would preserve flow."
    else:
        stance = "Treat this as review material, not an output candidate, until the missing evidence or human-feel problem is resolved."
    return {
        "focus": focus or ["watch-listen"],
        "stance": stance,
        "editorQuestions": questions,
        "agentInstruction": (
            "Open the review packet, watch/listen before recording intent, then explain any proposed refinement as metadata: "
            "what changes, why it helps hook/cadence/meaning/platform fit, and what tradeoff it makes. Do not mutate source media."
        ),
        "decisionModel": "whole-source-safe-short-refinement",
    }


def safe_commands_for(row: dict[str, Any]) -> dict[str, str]:
    short_id = str(row.get("shortId") or "")
    quoted_short = shell_quote(short_id)
    return {
        "openReviewPacket": str(row.get("openHtmlCommand") or ""),
        "makePolishWorkorder": f"script/agentctl.sh studio-shorts-cut-quality-polish-workorder --short-id {quoted_short} --json",
        "previewPolishNotes": f"script/agentctl.sh studio-shorts-cut-quality-polish-note-preview --short-id {quoted_short} --json",
        "indexWorksheets": "script/agentctl.sh studio-shorts-cut-quality-worksheet-index --all",
        "previewEvidenceDraft": f"script/agentctl.sh studio-shorts-cut-quality-evidence-preview --short-id {quoted_short} --outcome refine",
        "recordHookNoteTemplate": f"script/agentctl.sh studio-shorts-cut-quality-note --short-id {quoted_short} --field hook --note '<watch/listen evidence>' --reviewer Codex",
        "recordCadenceNoteTemplate": f"script/agentctl.sh studio-shorts-cut-quality-note --short-id {quoted_short} --field cadence --note '<watch/listen evidence>' --reviewer Codex",
        "recordCaptionNoteTemplate": f"script/agentctl.sh studio-shorts-cut-quality-note --short-id {quoted_short} --field captionPlan --note '<watch/listen evidence>' --reviewer Codex",
    }


def build_queue(index_path: Path, output_dir: Path, limit: int) -> dict[str, Any]:
    index = read_json(index_path)
    rows = [row for row in index.get("latestByShort", []) if isinstance(row, dict)]
    ranked = []
    for row in rows:
        score, reasons, lane = score_row(row)
        craft = craft_focus(row, lane)
        commands = safe_commands_for(row)
        paths = row.get("artifactPaths") if isinstance(row.get("artifactPaths"), dict) else {}
        ranked.append({
            "shortId": row.get("shortId"),
            "episode": row.get("episode"),
            "episodeVersion": row.get("episodeVersion"),
            "title": row.get("title"),
            "readinessLevel": row.get("readinessLevel"),
            "score": score,
            "lane": lane,
            "reasons": reasons,
            "cadenceLabel": row.get("cadenceLabel"),
            "meaningfulPauseCount": row.get("meaningfulPauseCount"),
            "longPauseCount": row.get("longPauseCount"),
            "visualStatus": row.get("visualStatus"),
            "audioStatus": row.get("audioStatus"),
            "craftFocus": craft.get("focus"),
            "craftStance": craft.get("stance"),
            "editorQuestions": craft.get("editorQuestions"),
            "agentInstruction": craft.get("agentInstruction"),
            "decisionModel": craft.get("decisionModel"),
            "safeCommands": commands,
            "reviewPacketHtml": paths.get("html"),
            "openReviewPacketCommand": commands["openReviewPacket"] or (f"open {shell_quote(str(paths.get('html') or ''))}" if paths.get("html") else ""),
            "worksheetCommand": f"script/agentctl.sh studio-shorts-cut-quality-worksheet --short-id {shell_quote(str(row.get('shortId') or ''))}",
            "nextSafestAction": next_action(lane),
        })
    ranked.sort(key=lambda row: (-int(row.get("score") or 0), int(row.get("episode") or 999), str(row.get("shortId") or "")))
    if limit > 0:
        ranked = ranked[:limit]
    lanes = Counter(str(row.get("lane") or "unknown") for row in ranked)
    return {
        "schema": SCHEMA,
        "version": VERSION,
        "generatedAt": iso_now(),
        "sourceReviewPacketIndexJson": str(index_path),
        "outputDir": str(output_dir),
        "counts": {
            "items": len(ranked),
            "lanes": dict(sorted(lanes.items())),
            "externalPublishing": False,
            "approvalCreated": False,
            "receiptTruthCreated": False,
        },
        "items": ranked,
        "nextSafestAction": "Open the top review packet, watch/listen, then record specific worksheet notes before any keep/refine/hold intent.",
        "truth": "Refinement queue only. It ranks evidence for review, records no decision, edits no timeline, exports no media, publishes nothing, uploads nothing, mutates no source media, overwrites nothing, deletes nothing, and creates no approval or receipt truth.",
    }


def next_action(lane: str) -> str:
    if lane == "polish-first":
        return "Watch/listen for final polish: hook, crop, captions, audio feel, and ending payoff."
    if lane == "review-then-polish":
        return "Watch/listen once, mark exact refinements, then decide if it deserves a polish pass."
    if lane == "cadence-review-first":
        return "Inspect pauses and J/L cut opportunities before treating this as platform-ready."
    return "Use as human-feel review material, not a polish-first candidate yet."


def render_markdown(payload: dict[str, Any]) -> str:
    counts = payload.get("counts") if isinstance(payload.get("counts"), dict) else {}
    lines = [
        "# Shorts cut-quality refinement queue",
        "",
        payload.get("truth", ""),
        "",
        "## Counts",
        "",
        f"- Items: `{counts.get('items', 0)}`",
        f"- Lanes: `{counts.get('lanes', {})}`",
        "",
        f"Next safest action: {payload.get('nextSafestAction')}",
        "",
        "## Ranked queue",
        "",
    ]
    for row in payload.get("items", []):
        reasons = "; ".join(row.get("reasons") or [])
        lines.extend([
        f"### {row.get('shortId')} - {row.get('title')}",
        "",
        f"- Episode: `{row.get('episode')}`",
        f"- Score/lane: `{row.get('score')}` / `{row.get('lane')}`",
        f"- Craft focus: `{', '.join(row.get('craftFocus') or [])}`",
        f"- Cadence: `{row.get('cadenceLabel')}`; pauses `{row.get('meaningfulPauseCount')}` meaningful / `{row.get('longPauseCount')}` long",
        f"- Reasons: {reasons}",
        f"- Stance: {row.get('craftStance')}",
        f"- Agent instruction: {row.get('agentInstruction')}",
        f"- Review packet: `{row.get('reviewPacketHtml')}`",
        f"- Next: {row.get('nextSafestAction')}",
        f"- Open: `{row.get('openReviewPacketCommand')}`",
        f"- Worksheet: `{row.get('worksheetCommand')}`",
        f"- Polish workorder: `{(row.get('safeCommands') or {}).get('makePolishWorkorder')}`",
        f"- Note preview: `{(row.get('safeCommands') or {}).get('previewPolishNotes')}`",
        f"- Evidence preview: `{(row.get('safeCommands') or {}).get('previewEvidenceDraft')}`",
        "",
    ])
        for question in row.get("editorQuestions") or []:
            lines.append(
                f"  - `{question.get('dimension')}`: {question.get('question')} Watch for: {question.get('watchFor')}"
            )
        lines.append("")
    return "\n".join(lines).rstrip() + "\n"


def render_html(payload: dict[str, Any]) -> str:
    cards = []
    for row in payload.get("items", []):
        reasons = "".join(f"<li>{esc(reason)}</li>" for reason in row.get("reasons", []))
        packet = str(row.get("reviewPacketHtml") or "")
        cards.append(f"""
        <article class="card {esc(row.get('lane'))}">
          <p class="eyebrow">Episode {esc(row.get('episode'))} · score {esc(row.get('score'))}</p>
          <h2>{esc(row.get('shortId'))}</h2>
          <p>{esc(row.get('title'))}</p>
          <div class="pills"><span>{esc(row.get('lane'))}</span><span>{esc(row.get('cadenceLabel'))}</span><span>{esc(row.get('meaningfulPauseCount'))} pauses</span><span>{esc(row.get('longPauseCount'))} long</span></div>
          <p><strong>Craft focus:</strong> {esc(', '.join(row.get('craftFocus') or []))}</p>
          <p>{esc(row.get('craftStance'))}</p>
          <ul>{reasons}</ul>
          <p>{esc(row.get('nextSafestAction'))}</p>
          <a class="button" href="{esc(file_uri(packet))}">Open review packet</a>
          <p><strong>Next commands:</strong></p>
          <code>{esc((row.get('safeCommands') or {}).get('makePolishWorkorder'))}</code>
          <code>{esc((row.get('safeCommands') or {}).get('previewPolishNotes'))}</code>
          <code>{esc((row.get('safeCommands') or {}).get('previewEvidenceDraft'))}</code>
          <code>{esc(packet)}</code>
        </article>
        """)
    counts = payload.get("counts") if isinstance(payload.get("counts"), dict) else {}
    return f"""<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Quipsly shorts refinement queue</title>
  <style>
    :root {{ color-scheme: dark; --soil:#15110b; --moss:#203522; --leaf:#8edc89; --honey:#f3ce54; --cream:#fff1d4; --line:rgba(255,241,212,.16); --clay:#df6a4f; }}
    * {{ box-sizing:border-box; }}
    body {{ margin:0; font-family:ui-sans-serif,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif; color:var(--cream); background:radial-gradient(circle at 10% -8%,rgba(142,220,137,.25),transparent 32rem),linear-gradient(135deg,var(--moss),var(--soil)); }}
    main {{ width:min(1440px,calc(100vw - 40px)); margin:0 auto; padding:36px 0 80px; }}
    header,.card {{ border:1px solid var(--line); border-radius:28px; background:rgba(255,241,212,.07); box-shadow:0 24px 80px rgba(0,0,0,.26); }}
    header {{ padding:32px; margin-bottom:18px; }}
    .eyebrow {{ color:var(--honey); letter-spacing:.16em; text-transform:uppercase; font-size:.76rem; font-weight:950; margin:0 0 8px; }}
    h1 {{ margin:0 0 12px; font-size:clamp(2.3rem,7vw,5.5rem); line-height:.9; }}
    h2 {{ margin:0 0 8px; }}
    p, li {{ color:#e0d1b4; line-height:1.55; }}
    .grid {{ display:grid; grid-template-columns:repeat(auto-fit,minmax(360px,1fr)); gap:14px; }}
    .card {{ padding:18px; }}
    .polish-first {{ border-color:rgba(142,220,137,.52); }}
    .cadence-review-first,.hold-for-human-feel-review {{ border-color:rgba(223,106,79,.46); }}
    .pills {{ display:flex; flex-wrap:wrap; gap:7px; margin:10px 0 14px; }}
    .pills span {{ border:1px solid var(--line); border-radius:999px; padding:7px 10px; background:rgba(0,0,0,.24); font-weight:900; }}
    .button {{ display:inline-block; border:1px solid rgba(243,206,84,.5); border-radius:999px; padding:9px 13px; color:var(--honey); text-decoration:none; font-weight:950; margin:10px 0; }}
    code {{ display:block; color:#ffeaa3; overflow-wrap:anywhere; }}
  </style>
</head>
<body>
<main>
  <header>
    <p class="eyebrow">Quipsly Studio · refinement queue</p>
    <h1>What should we polish first?</h1>
    <p>{esc(payload.get('truth'))}</p>
    <p>Lane counts: <code>{esc(counts.get('lanes'))}</code></p>
  </header>
  <section class="grid">{''.join(cards)}</section>
</main>
</body>
</html>"""


def write_outputs(payload: dict[str, Any], output_dir: Path, basename: str) -> dict[str, str]:
    output_dir.mkdir(parents=True, exist_ok=True)
    paths = {
        "json": output_dir / f"{basename}.json",
        "markdown": output_dir / f"{basename}.md",
        "html": output_dir / f"{basename}.html",
    }
    paths["json"].write_text(json.dumps(payload, indent=2, sort_keys=True), encoding="utf-8")
    paths["markdown"].write_text(render_markdown(payload), encoding="utf-8")
    paths["html"].write_text(render_html(payload), encoding="utf-8")
    return {key: str(path) for key, path in paths.items()}


def main() -> None:
    parser = argparse.ArgumentParser(description="Rank shorts for cut-quality refinement review.")
    parser.add_argument("--packet-index", default=str(DEFAULT_PACKET_INDEX_JSON), help="Review packet index JSON.")
    parser.add_argument("--output-dir", default=str(DEFAULT_OUTPUT_DIR), help="Output folder.")
    parser.add_argument("--basename", default=DEFAULT_BASENAME, help="Output basename.")
    parser.add_argument("--limit", type=int, default=0, help="Limit queue length; 0 means all.")
    parser.add_argument("--format", choices=["markdown", "json", "html", "all"], default="markdown")
    parser.add_argument("--markdown", dest="format", action="store_const", const="markdown")
    parser.add_argument("--json", dest="format", action="store_const", const="json")
    parser.add_argument("--html", dest="format", action="store_const", const="html")
    parser.add_argument("--all", dest="format", action="store_const", const="all")
    args = parser.parse_args()

    payload = build_queue(Path(args.packet_index).expanduser(), Path(args.output_dir).expanduser(), args.limit)
    paths = write_outputs(payload, Path(args.output_dir).expanduser(), args.basename)
    payload["artifactPaths"] = paths
    Path(paths["json"]).write_text(json.dumps(payload, indent=2, sort_keys=True), encoding="utf-8")

    if args.format == "json":
        print(json.dumps(payload, indent=2, sort_keys=True))
    elif args.format == "html":
        print(paths["html"])
    elif args.format == "all":
        print(json.dumps(payload, indent=2, sort_keys=True))
    else:
        print(render_markdown(payload), end="")


if __name__ == "__main__":
    main()
