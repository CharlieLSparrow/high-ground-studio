#!/usr/bin/env python3
"""Build the Episode 4 production start-here board.

This board gathers the current Episode 4 transcript, cue, edit-intelligence,
review-ledger, and source-clip-intake surfaces into one calm control surface.
It is intentionally not an apply tool.

Safety boundary: read-only artifact aggregation. This command never imports
clips, writes timeline decisions, creates shorts, renders exports, publishes,
uploads, deletes, overwrites prior sessions, or mutates source media.
"""
from __future__ import annotations

import html
import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

RELEASE_ROOT = Path("/Volumes/My Passport/Episode_and_Shorts_Test")
OUT_ROOT = RELEASE_ROOT / "review-board/episode4-start-here"
LATEST_POINTER = OUT_ROOT / "latest-episode4-start-here.json"
SCHEMA = "quipsly.episode4-start-here.v1"

POINTERS = {
    "transcriptChunks": RELEASE_ROOT / "review-board/transcript-full-asr/episode-04/latest-episode-04-transcript-chunks.json",
    "transcriptSpine": RELEASE_ROOT / "review-board/transcript-spines/latest-episode-04-transcript-spine.json",
    "transcriptCues": RELEASE_ROOT / "review-board/episode4-transcript-cues/latest-episode4-transcript-cues.json",
    "editIntelligence": RELEASE_ROOT / "review-board/episode4-edit-intelligence/latest-episode4-edit-intelligence.json",
    "editRehearsal": RELEASE_ROOT / "review-board/episode4-edit-rehearsal/latest-episode4-edit-rehearsal.json",
    "editReviewLedger": RELEASE_ROOT / "review-board/episode4-edit-intelligence-review/latest-episode4-edit-review-ledger.json",
    "recipeProofListenQueue": RELEASE_ROOT / "review-board/episode4-recipe-proof-listen-queue/latest-episode4-recipe-proof-listen-queue.json",
    "recipeProofListenNext": RELEASE_ROOT / "review-board/episode4-recipe-proof-listen-queue/latest-episode4-recipe-proof-listen-next.json",
    "sourceClipShoppingList": RELEASE_ROOT / "review-board/episode4-source-clip-shopping-list/latest-episode4-source-clip-shopping-list.json",
    "watchedSourceRecovery": RELEASE_ROOT / "review-board/episode4-watched-source-recovery-packet/latest-episode4-watched-source-recovery-packet.json",
    "foundClipValidation": RELEASE_ROOT / "review-board/episode4-found-clip-manifest-validation/latest-episode4-found-clip-manifest-validation.json",
    "sourceClipIntake": RELEASE_ROOT / "review-board/episode4-source-clip-intake/latest-episode4-source-clip-intake.json",
}
FALLBACK_GLOBS = {
    "transcriptChunks": RELEASE_ROOT / "review-board/transcript-full-asr/episode-04/*-transcript-chunks/episode-04-transcript-chunks.json",
}


def iso_now() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def stamp() -> str:
    return datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S-%f-start-here")


def esc(value: Any) -> str:
    return html.escape(str(value if value is not None else ""))


def load_json(path: Path) -> dict[str, Any]:
    if not path.exists():
        return {}
    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
        return payload if isinstance(payload, dict) else {}
    except Exception as exc:
        return {"status": "unreadable", "error": str(exc), "path": str(path)}


def newest_fallback(key: str) -> Path | None:
    pattern = FALLBACK_GLOBS.get(key)
    if not pattern:
        return None
    matches = sorted(pattern.parent.parent.glob(f"{pattern.parent.name}/{pattern.name}"))
    return matches[-1] if matches else None


def load_pointer(key: str, pointer_path: Path) -> dict[str, Any]:
    pointer = load_json(pointer_path)
    if not pointer and not pointer_path.exists():
        fallback = newest_fallback(key)
        if fallback and fallback.exists():
            payload = load_json(fallback)
            payload["pointerPath"] = str(pointer_path)
            payload["pointerExists"] = False
            payload["fallbackPath"] = str(fallback)
            payload["fallbackUsed"] = True
            return payload
    merged = dict(pointer)
    for key in ("jsonPath", "ledgerPath", "manifestPath"):
        target_text = str(pointer.get(key) or "")
        if not target_text:
            continue
        target = Path(target_text)
        if target.exists() and target != pointer_path:
            target_payload = load_json(target)
            if target_payload:
                merged = {**pointer, **target_payload}
                break
    merged["pointerPath"] = str(pointer_path)
    merged["pointerExists"] = pointer_path.exists()
    return merged


def truth() -> dict[str, Any]:
    return {
        "readOnlyAggregation": True,
        "clipsImported": False,
        "timelineDecisionsWritten": False,
        "shortsCreated": False,
        "transcriptImported": False,
        "sourceFilesMutated": False,
        "exportsRendered": False,
        "externalPublishing": False,
        "versionsOverwritten": False,
        "filesDeleted": False,
    }


def status_level(status: str, counts: dict[str, Any] | None = None) -> str:
    counts = counts or {}
    lowered = status.lower()
    if not status or "missing" in lowered or "empty" in lowered:
        return "needs-attention"
    if (
        counts.get("unreviewed")
        or counts.get("unmatched")
        or counts.get("waitingForFile")
        or counts.get("blocked")
        or counts.get("files") == 0
    ):
        return "needs-review"
    if "ready" in lowered or "complete" in lowered or "in-progress" in lowered:
        return "ready"
    return "info"


def link_for(payload: dict[str, Any]) -> str:
    for key in ("htmlPath", "markdownPath", "jsonPath", "ledgerPath", "fallbackPath"):
        text = str(payload.get(key) or "")
        if text:
            return text
    return str(payload.get("pointerPath") or "")


def build_cards(surfaces: dict[str, dict[str, Any]]) -> list[dict[str, Any]]:
    def card(key: str, label: str, why: str, safe_action: str) -> dict[str, Any]:
        payload = surfaces.get(key) or {}
        counts = payload.get("counts") if isinstance(payload.get("counts"), dict) else {}
        status = str(payload.get("status") or ("missing" if not payload.get("pointerExists") else "unknown"))
        return {
            "key": key,
            "label": label,
            "status": status,
            "level": status_level(status, counts),
            "counts": counts,
            "link": link_for(payload),
            "whyItMatters": why,
            "safeAction": safe_action,
        }

    return [
        card(
            "transcriptChunks",
            "Full ASR transcript chunks",
            "The draft transcript lets Quipsly reason about pacing, hooks, source-clip mentions, and cadence before cutting.",
            "Use as evidence only until reviewed; do not treat speaker labels or wording as canonical.",
        ),
        card(
            "transcriptSpine",
            "Draft transcript spine",
            "The spine turns chunked ASR into one time-ordered text layer for edit intelligence.",
            "Review ranges visually before converting suggestions into timeline metadata.",
        ),
        card(
            "transcriptCues",
            "Watched/source clip cue board",
            "Cue windows tell Charlie where likely watched/reference clips are mentioned, so he does not re-watch blind.",
            "Start with high-confidence cues, especially clip language like 'hit the clip'.",
        ),
        card(
            "editIntelligence",
            "Edit intelligence proposals",
            "These are candidate clip-weaves, shorts, cadence gaps, and reaction covers with explanations and tradeoffs.",
            "Review and mark each proposal before applying anything to the timeline.",
        ),
        card(
            "editRehearsal",
            "Edit rehearsal moves",
            "Rehearsal turns proposals into concrete, reversible program moves so humans and agents can scrub one decision before it becomes metadata.",
            "Open the top rehearsal move, scrub it in Studio, then record keep/refine/reject notes before apply-preview.",
        ),
        card(
            "editReviewLedger",
            "Proposal review ledger",
            "The ledger separates proposal, human/agent review, and future apply steps.",
            "Record keep/refine/reject/needs-source/needs-listen decisions as sidecar metadata.",
        ),
        card(
            "recipeProofListenQueue",
            "Host-spine proof-listen runway",
            "This filters reviewable cadence, reaction, show/skip, and duration decisions away from watched/source blockers so the main edit can improve now.",
            "Proof-listen the top host-spine item, then record a sidecar review decision before any branch metadata promotion.",
        ),
        card(
            "recipeProofListenNext",
            "Next host-spine proof card",
            "This is the one-decision review card: one proof question, one audio window, one rich-note command path.",
            "Open this card when you want to review the next host-spine cut without scanning the full queue.",
        ),
        card(
            "sourceClipShoppingList",
            "Source clip shopping list",
            "This tells Charlie what clips to look for and where to drop them.",
            "Drop likely files into the intake folder with cue IDs in filenames when possible.",
        ),
        card(
            "watchedSourceRecovery",
            "Watched/source recovery packet",
            "This turns missing watched clips into one cue-by-cue recovery workflow with audio review, a scratchpad, and a found-clip manifest template.",
            "Use this while re-watching Episode 4; record rough clip identity notes instead of blocking the host-spine edit.",
        ),
        card(
            "foundClipValidation",
            "Found-clip validation",
            "This checks whether identified watched/source candidates point to real files before intake or clip-weave promotion.",
            "If rows are waiting for files, recover or drop files first. If rows are ready, run source intake and review cue matches.",
        ),
        card(
            "sourceClipIntake",
            "Source clip intake",
            "The intake scanner proves which source clips are actually present before clip-weave editing.",
            "If empty, do not weave clips yet. If cue-matched, review before creating metadata branches.",
        ),
    ]


def build_next_actions(cards: list[dict[str, Any]]) -> list[dict[str, str]]:
    by_key = {card["key"]: card for card in cards}
    actions: list[dict[str, str]] = []
    intake_counts = by_key.get("sourceClipIntake", {}).get("counts") or {}
    validation_counts = by_key.get("foundClipValidation", {}).get("counts") or {}
    recovery_counts = by_key.get("watchedSourceRecovery", {}).get("counts") or {}
    proof_counts = by_key.get("recipeProofListenQueue", {}).get("counts") or {}
    review_counts = by_key.get("editReviewLedger", {}).get("counts") or {}
    rehearsal_counts = by_key.get("editRehearsal", {}).get("counts") or {}
    cue_counts = by_key.get("transcriptCues", {}).get("counts") or {}
    intelligence_counts = by_key.get("editIntelligence", {}).get("counts") or {}

    if validation_counts.get("readyForSourceIntakeReview"):
        actions.append({
            "priority": "1",
            "title": "Run source intake for validated found clips",
            "why": f"{validation_counts.get('readyForSourceIntakeReview')} watched/source candidate(s) point at real files and are ready for intake review.",
            "command": "./script/agentctl.sh episode4-source-clip-intake && ./script/agentctl.sh episode4-apply-preview",
        })
    elif validation_counts.get("waitingForFile") or recovery_counts.get("dropboxFiles") == 0:
        actions.append({
            "priority": "1",
            "title": "Recover the watched/source clips without blocking the host-spine edit",
            "why": "Transcript cues and placeholders identify the clip moments, but the actual watched/source files are still missing or unvalidated.",
            "command": "./script/agentctl.sh episode4-watched-source-next --markdown && ./script/agentctl.sh episode4-found-clip-validation --markdown",
        })
    elif not intake_counts.get("files"):
        actions.append({
            "priority": "1",
            "title": "Run source intake after files appear",
            "why": "The dropbox or manifest has source-clip evidence, but intake has not yet confirmed cue matches.",
            "command": "./script/agentctl.sh episode4-source-clip-intake",
        })
    else:
        actions.append({
            "priority": "1",
            "title": "Review cue-matched source clips",
            "why": "Files exist now; the next safe step is confirming which cue/workorder each one serves before edit apply.",
            "command": "./script/agentctl.sh episode4-source-clip-intake",
        })

    if rehearsal_counts.get("unreviewedMoves"):
        actions.append({
            "priority": "2",
            "title": "Rehearse one edit move before apply-preview",
            "why": f"{rehearsal_counts.get('unreviewedMoves')} rehearsal move(s) still need listen/visual review. This is the safest place to test cuts without writing timeline metadata.",
            "command": "./script/agentctl.sh episode4-edit-rehearsal",
        })

    if proof_counts.get("hostSpineReviewableNow"):
        actions.append({
            "priority": "2",
            "title": "Proof-listen host-spine cuts while source clips are missing",
            "why": f"{proof_counts.get('hostSpineReviewableNow')} host-spine review task(s) can move forward without watched/source files.",
            "command": "./script/agentctl.sh episode4-recipe-proof-listen-next --markdown",
        })

    if review_counts.get("unreviewed"):
        actions.append({
            "priority": "3",
            "title": "Review proposals before applying them",
            "why": f"{review_counts.get('unreviewed')} proposal(s) are still unreviewed. Proposal review is the safety seam before timeline metadata.",
            "command": "./script/agentctl.sh episode4-edit-review-ledger",
        })

    if cue_counts:
        actions.append({
            "priority": "4",
            "title": "Use cue windows to avoid re-watching blind",
            "why": "Cue windows are transcript-derived places where source media is likely discussed.",
            "command": "Open the cue board, then start with high-confidence clip/source language.",
        })

    if intelligence_counts:
        actions.append({
            "priority": "5",
            "title": "Pick the first visual review target",
            "why": "Shorts and cadence suggestions need visual/audio review so the output stays human instead of mechanically chopped.",
            "command": "Open edit intelligence and choose one short or cadence candidate for listen/visual review.",
        })

    return actions


def build_payload() -> dict[str, Any]:
    surfaces = {key: load_pointer(key, path) for key, path in POINTERS.items()}
    cards = build_cards(surfaces)
    actions = build_next_actions(cards)
    session_dir = OUT_ROOT / stamp()
    payload = {
        "schema": SCHEMA,
        "generatedAt": iso_now(),
        "status": "episode4-start-here-ready",
        "episode": 4,
        "episodeLabel": "Episode 4",
        "sessionDir": str(session_dir),
        "cards": cards,
        "nextActions": actions,
        "truth": truth(),
    }
    write_surfaces(session_dir, payload)
    return payload


def write_json(path: Path, payload: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, indent=2, sort_keys=True) + "\n", encoding="utf-8")


def render_markdown(payload: dict[str, Any]) -> str:
    lines = [
        "# Episode 4 Start Here",
        "",
        f"Generated: `{payload.get('generatedAt')}`",
        "",
        "This is the current production control surface for Episode 4. It aggregates evidence; it does not apply edits.",
        "",
        "## Next safest actions",
        "",
    ]
    for action in payload.get("nextActions") or []:
        lines += [
            f"{action.get('priority')}. **{action.get('title')}**",
            f"   - Why: {action.get('why')}",
            f"   - Command/action: `{action.get('command')}`",
            "",
        ]
    lines += ["## Surfaces", ""]
    for card in payload.get("cards") or []:
        lines += [
            f"### {card.get('label')}",
            "",
            f"- Status: `{card.get('status')}`",
            f"- Link: `{card.get('link')}`",
            f"- Why: {card.get('whyItMatters')}",
            f"- Safe action: {card.get('safeAction')}",
            f"- Counts: `{json.dumps(card.get('counts') or {}, sort_keys=True)}`",
            "",
        ]
    return "\n".join(lines)


def render_html(payload: dict[str, Any]) -> str:
    action_html = []
    for action in payload.get("nextActions") or []:
        action_html.append(
            f"""
            <article class="action">
              <b>{esc(action.get('priority'))}</b>
              <div>
                <h2>{esc(action.get('title'))}</h2>
                <p>{esc(action.get('why'))}</p>
                <code>{esc(action.get('command'))}</code>
              </div>
            </article>
            """
        )
    card_html = []
    for card in payload.get("cards") or []:
        counts = json.dumps(card.get("counts") or {}, sort_keys=True)
        link = str(card.get("link") or "")
        link_html = f'<a href="file://{esc(link)}">{esc(link)}</a>' if link else "<span>missing</span>"
        card_html.append(
            f"""
            <article class="card {esc(card.get('level'))}">
              <p class="eyebrow">{esc(card.get('key'))} · {esc(card.get('status'))}</p>
              <h2>{esc(card.get('label'))}</h2>
              <p>{esc(card.get('whyItMatters'))}</p>
              <p><strong>Safe action:</strong> {esc(card.get('safeAction'))}</p>
              <p class="link">{link_html}</p>
              <pre>{esc(counts)}</pre>
            </article>
            """
        )
    return f"""<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>Episode 4 Start Here</title>
  <style>
    :root {{
      --soil: #171d18;
      --moss: #253525;
      --leaf: #71b66b;
      --honey: #f0bd4f;
      --cream: #f5ecd2;
      --muted: #c8bfa8;
      --clay: #d86f4d;
      --water: #61bfd0;
    }}
    body {{ margin: 0; background: radial-gradient(circle at top left, rgba(113,182,107,.18), transparent 34%), var(--soil); color: var(--cream); font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }}
    main {{ max-width: 1240px; margin: 0 auto; padding: 44px 24px 72px; }}
    .hero {{ border: 1px solid rgba(240,189,79,.28); border-radius: 28px; padding: 32px; background: linear-gradient(135deg, rgba(37,53,37,.95), rgba(27,31,27,.96)); box-shadow: 0 22px 70px rgba(0,0,0,.28); }}
    .eyebrow {{ margin: 0 0 8px; color: var(--honey); letter-spacing: .18em; text-transform: uppercase; font-weight: 900; font-size: 12px; }}
    h1 {{ margin: 0; font-family: Georgia, serif; font-size: clamp(40px, 6vw, 72px); line-height: .94; }}
    h2 {{ margin: 0 0 8px; }}
    p {{ color: var(--muted); line-height: 1.5; }}
    .grid {{ display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 16px; margin-top: 22px; }}
    .action, .card {{ border: 1px solid rgba(255,255,255,.10); border-radius: 22px; padding: 18px; background: rgba(255,255,255,.055); }}
    .action {{ display: grid; grid-template-columns: 44px 1fr; gap: 14px; align-items: start; }}
    .action b {{ display: grid; place-items: center; width: 36px; height: 36px; border-radius: 50%; background: rgba(240,189,79,.18); color: var(--honey); }}
    code, pre {{ color: #ffe28a; white-space: pre-wrap; overflow-wrap: anywhere; }}
    a {{ color: var(--water); overflow-wrap: anywhere; }}
    .cards {{ display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 16px; margin-top: 16px; }}
    .ready {{ border-color: rgba(113,182,107,.5); }}
    .needs-review {{ border-color: rgba(240,189,79,.55); }}
    .needs-attention {{ border-color: rgba(216,111,77,.6); }}
    @media (max-width: 960px) {{ .grid, .cards {{ grid-template-columns: 1fr; }} }}
  </style>
</head>
<body>
<main>
  <section class="hero">
    <p class="eyebrow">Quipsly Studio · Episode 4</p>
    <h1>Start here, then cut smarter.</h1>
    <p>This board connects transcript evidence, clip cues, edit intelligence, proposal review, and source-clip intake without pretending proposals are finished edits.</p>
    <div class="grid">{''.join(action_html)}</div>
  </section>
  <section class="cards">{''.join(card_html)}</section>
</main>
</body>
</html>
"""


def write_surfaces(session_dir: Path, payload: dict[str, Any]) -> None:
    json_path = session_dir / "episode4-start-here.json"
    markdown_path = session_dir / "episode4-start-here.md"
    html_path = session_dir / "index.html"
    payload.update({"jsonPath": str(json_path), "markdownPath": str(markdown_path), "htmlPath": str(html_path)})
    write_json(json_path, payload)
    markdown_path.write_text(render_markdown(payload), encoding="utf-8")
    html_path.write_text(render_html(payload), encoding="utf-8")
    write_json(LATEST_POINTER, {
        "schema": "quipsly.episode4-start-here-pointer.v1",
        "generatedAt": iso_now(),
        "status": payload.get("status"),
        "jsonPath": str(json_path),
        "markdownPath": str(markdown_path),
        "htmlPath": str(html_path),
        "nextActions": payload.get("nextActions"),
        "truth": payload.get("truth"),
    })


def main() -> None:
    payload = build_payload()
    print(f"Episode 4 start-here board: {payload.get('status')}")
    print(f"  Board: {payload.get('htmlPath')}")
    print(f"  Manifest: {payload.get('jsonPath')}")
    print(f"  Next: {payload.get('nextActions', [{}])[0].get('title') if payload.get('nextActions') else 'Review board'}")


if __name__ == "__main__":
    main()
