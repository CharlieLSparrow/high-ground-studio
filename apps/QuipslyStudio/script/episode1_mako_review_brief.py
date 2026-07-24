#!/usr/bin/env python3
"""Build a Mako-facing Episode 1 review brief.

This is a reviewer/editor experience layer over the existing Quipsly truth
packets. It should feel like an editing pass, not a compliance workflow.
"""

from __future__ import annotations

import html
import json
import os
import sys
from datetime import datetime, timezone
from typing import Any


def now_iso() -> str:
    return datetime.now(timezone.utc).astimezone().isoformat(timespec="seconds")


def load_json(path: str) -> dict[str, Any]:
    with open(path, "r", encoding="utf-8") as handle:
        return json.load(handle)


def load_optional(path: str) -> dict[str, Any]:
    if not os.path.exists(path):
        return {"_missing": True, "_path": path}
    try:
        return load_json(path)
    except Exception as error:
        return {"_loadError": str(error), "_path": path}


def write_json(path: str, payload: dict[str, Any]) -> None:
    os.makedirs(os.path.dirname(path) or ".", exist_ok=True)
    with open(path, "w", encoding="utf-8") as handle:
        json.dump(payload, handle, indent=2, sort_keys=True)
        handle.write("\n")


def write_text(path: str, text: str) -> None:
    os.makedirs(os.path.dirname(path) or ".", exist_ok=True)
    with open(path, "w", encoding="utf-8") as handle:
        handle.write(text)
        if not text.endswith("\n"):
            handle.write("\n")


def esc(value: Any) -> str:
    return html.escape("" if value is None else str(value))


def mako_outcome_summary(notes: list[dict[str, Any]]) -> dict[str, Any]:
    parsed: list[dict[str, Any]] = []
    for row in notes:
        target = str(row.get("target") or "")
        parts = target.split(":", 3)
        if len(parts) == 4 and parts[0] == "mako":
            parsed.append(
                {
                    "outcome": parts[1],
                    "category": parts[2],
                    "target": parts[3],
                    "text": row.get("text"),
                    "createdAt": row.get("createdAt"),
                }
            )

    counts: dict[str, int] = {}
    category_counts: dict[str, int] = {}
    for item in parsed:
        counts[item["outcome"]] = counts.get(item["outcome"], 0) + 1
        category_counts[item["category"]] = category_counts.get(item["category"], 0) + 1

    if not parsed:
        status = "no-editor-outcome-yet"
        recommendation = "Do an editor pass first. Watch, listen, crop-check, then leave a plain-English outcome note."
    elif counts.get("blocked"):
        status = "blocked"
        recommendation = "Route the blocker back to Studio before any official review or Tower move."
    elif counts.get("needs-edit"):
        status = "needs-edit"
        recommendation = "Turn Mako's notes into concrete Studio fixes, then re-run the editor review pass."
    elif counts.get("looks-good"):
        status = "looks-good"
        recommendation = "If the actual watch/listen pass happened, this is ready to consider official review ledger action."
    else:
        status = "notes-only"
        recommendation = "Read the notes and keep reviewing until there is a clear looks-good, needs-edit, or blocked outcome."

    return {
        "status": status,
        "recommendation": recommendation,
        "noteCount": len(notes),
        "structuredNoteCount": len(parsed),
        "countsByOutcome": counts,
        "countsByCategory": category_counts,
        "latestStructuredNote": parsed[-1] if parsed else None,
    }


def build_packet(
    current_next_path: str,
    handoff_path: str,
    worksheet_path: str,
    draft_path: str,
    output_json: str,
    output_html: str,
    output_md: str,
) -> dict[str, Any]:
    current = load_optional(current_next_path)
    handoff = load_optional(handoff_path)
    worksheet = load_optional(worksheet_path)
    draft = load_optional(draft_path)
    review_state = current.get("reviewState") or handoff.get("currentState") or {}
    segment = review_state.get("segment") or handoff.get("segment") or {}
    action = current.get("recommendedImmediateAction") or {}
    check_items = worksheet.get("reviewItems") or worksheet.get("checkItems") or []
    if not check_items:
        check_items = (handoff.get("reviewSteps") or [])
    editing_steps = [
        {
            "id": "watch-program",
            "label": "Watch the selected segment in Program Output.",
            "plainEnglish": "Treat this like an edit review. Does the episode feel watchable, coherent, and not weirdly paced?",
        },
        {
            "id": "check-vertical",
            "label": "Check the 9:16 cut for face placement and caption safety.",
            "plainEnglish": "If the crop puts words or faces in awkward places, leave a note instead of fighting the ledger.",
        },
        {
            "id": "listen-audio",
            "label": "Listen for comfort, clipping, obvious level problems, or distracting noise.",
            "plainEnglish": "Audio can pass even if it is imperfect; the question is whether a real viewer/listener will bounce.",
        },
        {
            "id": "mark-friction",
            "label": "Drop notes where the tool slows you down.",
            "plainEnglish": "Quipsly is learning the workflow too. If the editor makes review harder, that is a product bug.",
        },
        {
            "id": "finish-pass",
            "label": "End with one outcome: looks good, needs edit, or blocked.",
            "plainEnglish": "The system will translate that into official review state later. The human job is judgment.",
        },
    ]
    draft_entries = draft.get("entries") or []
    mako_notes = [
        entry for entry in draft_entries
        if str(entry.get("actor") or "").lower() == "mako"
        or str(entry.get("target") or "").startswith("mako:")
    ]
    editor_outcome = mako_outcome_summary(mako_notes)
    packet = {
        "packetType": "quipsly-episode1-mako-review-brief",
        "version": "2026-06-20.mako-review-brief.v1",
        "projectSlug": current.get("projectSlug") or handoff.get("projectSlug"),
        "episodeSlug": current.get("episodeSlug") or handoff.get("episodeSlug"),
        "generatedAt": now_iso(),
        "json": output_json,
        "html": output_html,
        "markdown": output_md,
        "truth": "This is an editor-facing review brief. It does not mutate the official review ledger, approve artifacts, publish, schedule, upload, or capture receipts.",
        "northStar": "Mako edits. Quipsly remembers. Codex learns. Tower proves.",
        "reviewerPromise": "You are not being asked to operate a review bureaucracy. Watch the work, adjust or note what feels wrong, and let Quipsly keep the receipts underneath.",
        "segment": segment,
        "currentRecommendation": action,
        "reviewState": review_state,
        "editingPassSteps": editing_steps,
        "makoNotes": mako_notes,
        "makoEditorOutcome": editor_outcome,
        "underlyingReviewPrompts": check_items,
        "suggestedOutcomes": [
            {"label": "Looks good", "meaning": "The segment feels publishable from this pass."},
            {"label": "Needs edit", "meaning": "The content is usable but needs cut, crop, audio, caption, or pacing changes."},
            {"label": "Blocked", "meaning": "Something prevents fair review, such as missing media, wrong export, broken audio, or unusable playback."},
        ],
        "safeCommands": {
            "openThisBrief": "script/agentctl.sh episode1-mako-review-brief --html",
            "openFastBoard": "script/agentctl.sh episode1-current-next --html",
            "openGuidedSession": "script/agentctl.sh episode1-selected-review-session --html",
            "openWorksheet": "script/agentctl.sh episode1-selected-review-worksheet --html",
            "addQuickNote": 'script/agentctl.sh episode1-mako-review-note note tool general "What I noticed while editing/reviewing."',
            "addCropNeedsEdit": 'script/agentctl.sh episode1-mako-review-note needs-edit crop 01:02:30 "Crop/framing note."',
            "addAudioNeedsEdit": 'script/agentctl.sh episode1-mako-review-note needs-edit audio 01:02:30 "Audio comfort note."',
            "addLooksGood": 'script/agentctl.sh episode1-mako-review-note looks-good overall segment-005 "Looks good from editor review."',
            "addBlocked": 'script/agentctl.sh episode1-mako-review-note blocked media segment-005 "Blocked because..."',
        },
        "sourcePackets": {
            "currentNext": current_next_path,
            "selectedReviewHandoff": handoff_path,
            "selectedReviewWorksheet": worksheet_path,
            "selectedReviewDraft": draft_path,
        },
    }
    return packet


def html_page(packet: dict[str, Any]) -> str:
    segment = packet.get("segment") or {}
    review = packet.get("reviewState") or {}
    action = packet.get("currentRecommendation") or {}
    editor_outcome = packet.get("makoEditorOutcome") or {}
    steps = "".join(
        f"""
        <article class="step">
          <span>{esc(item.get('id'))}</span>
          <strong>{esc(item.get('label'))}</strong>
          <p>{esc(item.get('plainEnglish'))}</p>
        </article>
        """
        for item in packet.get("editingPassSteps") or []
    )
    outcomes = "".join(
        f"""
        <article class="outcome">
          <strong>{esc(item.get('label'))}</strong>
          <p>{esc(item.get('meaning'))}</p>
        </article>
        """
        for item in packet.get("suggestedOutcomes") or []
    )
    commands = "".join(
        f"""
        <div class="command">
          <div>
            <strong>{esc(label)}</strong>
            <code>{esc(command)}</code>
          </div>
          <button data-copy="{esc(command)}">Copy</button>
        </div>
        """
        for label, command in (packet.get("safeCommands") or {}).items()
        if command
    )
    note_rows = "".join(
        f"""
        <article class="note">
          <strong>{esc(row.get('target'))}</strong>
          <p>{esc(row.get('text'))}</p>
          <small>{esc(row.get('createdAt'))}</small>
        </article>
        """
        for row in packet.get("makoNotes") or []
    ) or "<p>No Mako editor notes recorded yet.</p>"
    prompts = "".join(
        f"<li>{esc(item.get('label') if isinstance(item, dict) else item)}</li>"
        for item in packet.get("underlyingReviewPrompts") or []
    )
    return f"""<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Mako Episode 1 Review Brief</title>
  <style>
    :root {{ --bg:#efe6d3; --paper:#fff9ec; --ink:#2a231c; --muted:#74675a; --line:rgba(72,51,33,.16); --fern:#2f7656; --moss:#5b6f3b; --clay:#a34d38; --gold:#d4a62d; --river:#2e6f84; }}
    * {{ box-sizing:border-box; }}
    body {{ margin:0; color:var(--ink); background:radial-gradient(circle at 15% 4%,rgba(212,166,45,.22),transparent 28rem),radial-gradient(circle at 86% 0%,rgba(47,118,86,.18),transparent 34rem),linear-gradient(135deg,#fbf7ed,var(--bg)); font-family:ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif; }}
    main {{ width:min(1180px,calc(100% - 34px)); margin:0 auto; padding:34px 0 72px; }}
    section {{ background:rgba(255,249,236,.96); border:1px solid var(--line); border-radius:30px; padding:24px; margin:16px 0; box-shadow:0 22px 64px rgba(49,35,22,.13); }}
    .hero {{ border-left:10px solid var(--fern); }}
    .action {{ border-left:8px solid var(--gold); }}
    .machine {{ border-left:8px solid var(--river); }}
    .kicker {{ color:#a97524; font-size:.72rem; font-weight:950; letter-spacing:.2em; text-transform:uppercase; }}
    h1 {{ margin:8px 0 12px; font-size:clamp(2.25rem,5.3vw,4.8rem); line-height:.92; letter-spacing:-.065em; }}
    h2 {{ margin:8px 0; letter-spacing:-.035em; }}
    p,li {{ color:var(--muted); line-height:1.5; }}
    .grid {{ display:grid; grid-template-columns:minmax(0,1fr) minmax(340px,.72fr); gap:16px; align-items:start; }}
    .cards {{ display:grid; grid-template-columns:repeat(auto-fit,minmax(165px,1fr)); gap:10px; }}
    .card,.step,.outcome,.command,.note {{ border:1px solid var(--line); border-radius:18px; padding:12px; background:rgba(67,49,33,.055); }}
    .card strong {{ display:block; font-size:1.6rem; color:var(--ink); }}
    .step,.outcome,.command,.note {{ margin:10px 0; }}
    .step span {{ color:#a97524; font-size:.68rem; font-weight:950; letter-spacing:.16em; text-transform:uppercase; }}
    code {{ display:block; margin-top:6px; white-space:pre-wrap; overflow-wrap:anywhere; color:#4a382a; font-size:.78rem; }}
    .command {{ display:flex; justify-content:space-between; gap:12px; align-items:center; }}
    button {{ border:0; border-radius:999px; padding:8px 12px; font-weight:950; background:#3b2d21; color:#fff6e8; cursor:pointer; }}
    button.copied {{ background:var(--fern); }}
    @media (max-width:900px) {{ .grid {{ grid-template-columns:1fr; }} }}
  </style>
</head>
<body>
<main>
  <section class="hero">
    <span class="kicker">Mako editor review</span>
    <h1>This should feel like editing.</h1>
    <p>{esc(packet.get('reviewerPromise'))}</p>
    <p><strong>{esc(packet.get('northStar'))}</strong></p>
  </section>
  <section class="action">
    <span class="kicker">Current pass</span>
    <h2>{esc(segment.get('segmentId'))} · {esc(segment.get('label'))}</h2>
    <p>{esc(action.get('action'))}</p>
    <code>{esc(action.get('command'))}</code>
  </section>
  <section>
    <span class="kicker">Review truth</span>
    <h2>Still honest underneath</h2>
    <div class="cards">
      <div class="card"><span>Official pending</span><strong>{esc(review.get('officialReviewPending'))}</strong></div>
      <div class="card"><span>Official reviewed</span><strong>{esc(review.get('officialReviewReviewed'))}</strong></div>
      <div class="card"><span>Draft entries</span><strong>{esc(review.get('draftEntryCount'))}</strong></div>
      <div class="card"><span>Draft checks</span><strong>{esc(review.get('checkedDraftItems'))}/{esc(review.get('totalChecklistItems'))}</strong></div>
    </div>
  </section>
  <section class="action">
    <span class="kicker">Editor outcome</span>
    <h2>{esc(editor_outcome.get('status'))}</h2>
    <p>{esc(editor_outcome.get('recommendation'))}</p>
    <div class="cards">
      <div class="card"><span>Mako notes</span><strong>{esc(editor_outcome.get('noteCount'))}</strong></div>
      <div class="card"><span>Structured</span><strong>{esc(editor_outcome.get('structuredNoteCount'))}</strong></div>
    </div>
  </section>
  <div class="grid">
    <section>
      <span class="kicker">Editing pass</span>
      <h2>What to do</h2>
      {steps}
    </section>
    <section>
      <span class="kicker">Outcome</span>
      <h2>Pick the closest ending</h2>
      {outcomes}
      <h2>Safe commands</h2>
      {commands}
    </section>
  </div>
  <section>
    <span class="kicker">Editor notes</span>
    <h2>Mako notes captured so far</h2>
    {note_rows}
  </section>
  <section class="machine">
    <span class="kicker">Under the floorboards</span>
    <h2>What Quipsly is tracking for us</h2>
    <p>{esc(packet.get('truth'))}</p>
    <ul>{prompts}</ul>
  </section>
</main>
<script>
  document.querySelectorAll('[data-copy]').forEach((button) => {{
    button.addEventListener('click', async () => {{
      await navigator.clipboard.writeText(button.dataset.copy || '');
      button.classList.add('copied');
      button.textContent = 'Copied';
      setTimeout(() => {{ button.classList.remove('copied'); button.textContent = 'Copy'; }}, 1300);
    }});
  }});
</script>
</body>
</html>"""


def markdown_page(packet: dict[str, Any]) -> str:
    segment = packet.get("segment") or {}
    review = packet.get("reviewState") or {}
    action = packet.get("currentRecommendation") or {}
    editor_outcome = packet.get("makoEditorOutcome") or {}
    lines = [
        "# Mako Episode 1 review brief",
        "",
        packet.get("reviewerPromise", ""),
        "",
        f"**North star:** {packet.get('northStar')}",
        "",
        "## Current pass",
        "",
        f"- Segment: `{segment.get('segmentId')}` {segment.get('label') or ''}",
        f"- Action: {action.get('action')}",
        f"- Command: `{action.get('command')}`",
        "",
        "## Honest state underneath",
        "",
        f"- Official pending: `{review.get('officialReviewPending')}`",
        f"- Official reviewed: `{review.get('officialReviewReviewed')}`",
        f"- Draft entries: `{review.get('draftEntryCount')}`",
        f"- Draft checks: `{review.get('checkedDraftItems')}` / `{review.get('totalChecklistItems')}`",
        "",
        "## Editor outcome",
        "",
        f"- Status: `{editor_outcome.get('status')}`",
        f"- Recommendation: {editor_outcome.get('recommendation')}",
        f"- Mako notes: `{editor_outcome.get('noteCount')}`",
        f"- Structured notes: `{editor_outcome.get('structuredNoteCount')}`",
        "",
        "## Editing pass steps",
        "",
    ]
    for item in packet.get("editingPassSteps") or []:
        lines.extend([f"### {item.get('label')}", "", str(item.get("plainEnglish") or ""), ""])
    lines.extend(["## Suggested outcomes", ""])
    for item in packet.get("suggestedOutcomes") or []:
        lines.append(f"- `{item.get('label')}`: {item.get('meaning')}")
    lines.extend(["", "## Mako editor notes captured so far", ""])
    notes = packet.get("makoNotes") or []
    if not notes:
        lines.append("No Mako editor notes recorded yet.")
    for row in notes:
        lines.extend([
            f"### {row.get('target')}",
            "",
            str(row.get("text") or ""),
            "",
            f"- Created: `{row.get('createdAt')}`",
            "",
        ])
    lines.extend(["", "## Safe commands", ""])
    for label, command in (packet.get("safeCommands") or {}).items():
        if command:
            lines.extend([f"### {label}", "", f"```bash\n{command}\n```", ""])
    return "\n".join(lines)


def main() -> int:
    if len(sys.argv) != 8:
        print(
            "usage: episode1_mako_review_brief.py current-next.json handoff.json worksheet.json draft.json output.json output.html output.md",
            file=sys.stderr,
        )
        return 2
    current_next_path, handoff_path, worksheet_path, draft_path, output_json, output_html, output_md = sys.argv[1:8]
    packet = build_packet(current_next_path, handoff_path, worksheet_path, draft_path, output_json, output_html, output_md)
    write_json(output_json, packet)
    write_text(output_html, html_page(packet))
    write_text(output_md, markdown_page(packet))
    print(f"Wrote {output_json}")
    print(f"Wrote {output_html}")
    print(f"Wrote {output_md}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
