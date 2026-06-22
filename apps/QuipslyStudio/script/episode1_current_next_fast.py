#!/usr/bin/env python3
"""Build a fast cached Episode 1 current-next board.

This intentionally reads existing truth artifacts only. It does not regenerate
review packets, touch the official review ledger, approve artifacts, mutate Nest
writing state, publish, schedule, upload, or capture receipts.
"""

from __future__ import annotations

import html
import json
import os
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


def now() -> datetime:
    return datetime.now(timezone.utc).astimezone()


def now_iso() -> str:
    return now().isoformat(timespec="seconds")


def load_json(path: str) -> dict[str, Any]:
    with open(path, "r", encoding="utf-8") as handle:
        return json.load(handle)


def load_optional(path: str) -> tuple[dict[str, Any], dict[str, Any]]:
    freshness = source_freshness(path)
    if not os.path.exists(path):
        return {}, freshness | {"loadStatus": "missing"}
    try:
        return load_json(path), freshness | {"loadStatus": "loaded"}
    except Exception as error:
        return {"_loadError": str(error), "_path": path}, freshness | {"loadStatus": "error", "error": str(error)}


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


def source_freshness(path: str) -> dict[str, Any]:
    packet: dict[str, Any] = {
        "path": path,
        "exists": os.path.exists(path),
    }
    if not packet["exists"]:
        return packet
    stat = os.stat(path)
    modified = datetime.fromtimestamp(stat.st_mtime, timezone.utc).astimezone()
    age = max(0, int((now() - modified).total_seconds()))
    packet.update(
        {
            "modifiedAt": modified.isoformat(timespec="seconds"),
            "ageSeconds": age,
            "ageLabel": age_label(age),
            "sizeBytes": stat.st_size,
        }
    )
    return packet


def age_label(seconds: int) -> str:
    if seconds < 60:
        return f"{seconds}s"
    minutes = seconds // 60
    if minutes < 60:
        return f"{minutes}m"
    hours = minutes // 60
    if hours < 48:
        return f"{hours}h {minutes % 60}m"
    days = hours // 24
    return f"{days}d {hours % 24}h"


def lane_actions(brief: dict[str, Any]) -> list[dict[str, Any]]:
    return [
        {
            "laneId": lane.get("id"),
            "lens": lane.get("lens"),
            "status": lane.get("status"),
            "action": lane.get("nextSafeAction"),
            "command": lane.get("nextCommand"),
            "fallbackCommand": lane.get("fallbackCommand"),
            "humanDecisionNeeded": lane.get("humanDecisionNeeded"),
        }
        for lane in brief.get("lanes", [])
    ]


def chosen_action(brief: dict[str, Any], handoff: dict[str, Any], draft: dict[str, Any], progress: dict[str, Any]) -> dict[str, Any]:
    handoff_state = handoff.get("currentState") or {}
    draft_summary = draft.get("summary") or {}
    official_pending = int(handoff_state.get("officialReviewPending") or 0)
    official_reviewed = int(handoff_state.get("officialReviewReviewed") or 0)
    official_issues = int(handoff_state.get("officialReviewIssues") or 0)
    draft_ready = bool(
        handoff_state.get("draftReadyToConsiderOfficialLedgerCommand")
        or draft_summary.get("readyToConsiderOfficialLedgerCommand")
    )
    safe_commands = handoff.get("safeCommands") or {}

    if official_issues:
        return {
            "lens": "Studio",
            "status": "review-issues-need-studio-fix",
            "action": "Inspect selected review issues before any Tower publication move.",
            "command": safe_commands.get("openHandoff") or "script/agentctl.sh episode1-selected-review-handoff --html",
            "why": "The official selected review ledger has issue rows.",
            "humanDecisionNeeded": True,
        }
    if official_pending and not draft_ready:
        return {
            "lens": "Studio",
            "status": "selected-segment-needs-real-review",
            "action": "Open the selected review handoff, watch/listen to the current segment, and record draft notes before touching the official ledger.",
            "command": safe_commands.get("openHandoff") or "script/agentctl.sh episode1-selected-review-handoff --html",
            "why": "The official ledger is still pending and the durable draft review packet is incomplete.",
            "humanDecisionNeeded": True,
        }
    if official_pending and draft_ready:
        return {
            "lens": "Studio",
            "status": "draft-review-complete-needs-official-decision",
            "action": "After confirming actual review happened, choose reviewed or issue in the official selected review ledger.",
            "command": safe_commands.get("officialLedgerCommandAfterActualReview"),
            "why": "Draft responses are complete enough to consider an official review ledger mutation.",
            "humanDecisionNeeded": True,
        }
    if official_reviewed and not official_pending:
        tower = next((lane for lane in brief.get("lanes", []) if lane.get("id") == "tower-publication-readiness"), {})
        return {
            "lens": tower.get("lens") or "Tower",
            "status": tower.get("status") or "studio-review-complete-needs-tower",
            "action": tower.get("nextSafeAction") or "Move to Tower publication packet, destination readiness, and receipt targets.",
            "command": tower.get("nextCommand") or "script/agentctl.sh episode1-publication-action-queue --json",
            "why": "Selected Studio review is complete enough to move to publication readiness work.",
            "humanDecisionNeeded": bool(tower.get("humanDecisionNeeded")),
        }

    lanes = brief.get("lanes", [])
    for preferred in ("studio-edit-export-proof", "nest-writing-capture", "tower-publication-readiness", "codex-agent-control"):
        lane = next((item for item in lanes if item.get("id") == preferred), None)
        if lane:
            return {
                "lens": lane.get("lens"),
                "status": lane.get("status"),
                "action": lane.get("nextSafeAction"),
                "command": lane.get("nextCommand"),
                "fallbackCommand": lane.get("fallbackCommand"),
                "why": "Fell back to the current cached vertical-slice lane order.",
                "humanDecisionNeeded": lane.get("humanDecisionNeeded"),
            }

    return {
        "lens": None,
        "status": "no-cached-action",
        "action": "No cached action found. Run a full vertical-slice refresh.",
        "command": "script/agentctl.sh episode1-vertical-slice-refresh && script/agentctl.sh episode1-current-next --html",
        "why": "No lane data was available in the cached brief.",
        "humanDecisionNeeded": False,
    }


def blocked_claims(*packets: dict[str, Any]) -> list[str]:
    claims: set[str] = set()
    for packet in packets:
        for claim in packet.get("blockedClaims") or []:
            claims.add(str(claim))
        for lane in packet.get("lanes") or []:
            for claim in lane.get("blockedClaims") or []:
                claims.add(str(claim))
    return sorted(claims)


def mako_outcome_summary(draft: dict[str, Any]) -> dict[str, Any]:
    notes = [
        entry for entry in draft.get("entries") or []
        if str(entry.get("actor") or "").lower() == "mako"
        or str(entry.get("target") or "").startswith("mako:")
    ]
    structured = []
    for row in notes:
        target = str(row.get("target") or "")
        parts = target.split(":", 3)
        if len(parts) == 4 and parts[0] == "mako":
            structured.append(
                {
                    "outcome": parts[1],
                    "category": parts[2],
                    "target": parts[3],
                    "text": row.get("text"),
                    "createdAt": row.get("createdAt"),
                }
            )
    counts: dict[str, int] = {}
    for item in structured:
        counts[item["outcome"]] = counts.get(item["outcome"], 0) + 1
    if not structured:
        status = "no-editor-outcome-yet"
        recommendation = "Open the Mako review brief and capture an editor-shaped note after actual review."
    elif counts.get("blocked"):
        status = "blocked"
        recommendation = "Resolve the Mako blocker in Studio before official review or Tower readiness."
    elif counts.get("needs-edit"):
        status = "needs-edit"
        recommendation = "Use Mako's notes as Studio fix instructions, then re-review."
    elif counts.get("looks-good"):
        status = "looks-good"
        recommendation = "If actual watch/listen review happened, consider the official review ledger command."
    else:
        status = "notes-only"
        recommendation = "Keep reviewing until a clear looks-good, needs-edit, or blocked outcome exists."
    return {
        "status": status,
        "recommendation": recommendation,
        "noteCount": len(notes),
        "structuredNoteCount": len(structured),
        "countsByOutcome": counts,
        "latestStructuredNote": structured[-1] if structured else None,
    }


def build_packet(
    brief_path: str,
    handoff_path: str,
    draft_path: str,
    progress_path: str,
    output_json: str,
    output_html: str,
    output_md: str,
) -> dict[str, Any]:
    brief, brief_freshness = load_optional(brief_path)
    handoff, handoff_freshness = load_optional(handoff_path)
    draft, draft_freshness = load_optional(draft_path)
    progress, progress_freshness = load_optional(progress_path)
    action = chosen_action(brief, handoff, draft, progress)
    editor_outcome = mako_outcome_summary(draft)
    handoff_state = handoff.get("currentState") or {}
    draft_summary = draft.get("summary") or {}
    progress_items = progress.get("reviewItems") or []
    pending_items = [item for item in progress_items if item.get("status") == "pending"]
    reviewed_items = [item for item in progress_items if item.get("status") == "reviewed"]
    issue_items = [item for item in progress_items if item.get("status") == "issue"]
    packet = {
        "packetType": "quipsly-episode1-current-next-fast",
        "version": "2026-06-20.current-next-fast.v1",
        "projectSlug": brief.get("projectSlug") or handoff.get("projectSlug") or progress.get("projectSlug"),
        "episodeSlug": brief.get("episodeSlug") or handoff.get("episodeSlug") or progress.get("episodeSlug"),
        "generatedAt": now_iso(),
        "json": output_json,
        "html": output_html,
        "markdown": output_md,
        "truth": "This fast board reads cached Quipsly truth artifacts only. It does not refresh evidence, mutate review ledgers, approve media, canonize writing, publish, upload, schedule, or capture receipts.",
        "uxPrinciple": "Mako edits. Quipsly remembers. Codex learns. Tower proves.",
        "recommendedImmediateAction": action,
        "makoEditorOutcome": editor_outcome,
        "reviewState": {
            "segment": handoff.get("segment") or draft.get("segment"),
            "officialReviewPending": handoff_state.get("officialReviewPending", len(pending_items)),
            "officialReviewReviewed": handoff_state.get("officialReviewReviewed", len(reviewed_items)),
            "officialReviewIssues": handoff_state.get("officialReviewIssues", len(issue_items)),
            "draftEntryCount": handoff_state.get("draftEntryCount", draft_summary.get("draftEntryCount", 0)),
            "checkedDraftItems": handoff_state.get("checkedDraftItems", draft_summary.get("checkedItemCount", 0)),
            "totalChecklistItems": handoff_state.get("totalChecklistItems", draft_summary.get("checkItemCount", 0)),
            "answeredQuestions": handoff_state.get("answeredQuestions", draft_summary.get("answeredQuestionCount", 0)),
            "totalQuestions": handoff_state.get("totalQuestions", draft_summary.get("questionCount", 0)),
            "draftReadyToConsiderOfficialLedgerCommand": bool(
                handoff_state.get("draftReadyToConsiderOfficialLedgerCommand")
                or draft_summary.get("readyToConsiderOfficialLedgerCommand")
            ),
        },
        "laneActions": lane_actions(brief),
        "sourceFreshness": {
            "verticalSliceBrief": brief_freshness,
            "selectedReviewHandoff": handoff_freshness,
            "selectedReviewDraft": draft_freshness,
            "selectedReviewProgress": progress_freshness,
        },
        "safeCommands": {
            "openFastBoard": "script/agentctl.sh episode1-current-next --html",
            "readFastJson": "script/agentctl.sh episode1-current-next --json",
            "openMakoReviewBrief": "script/agentctl.sh episode1-mako-review-brief --html",
            "addMakoEditorNote": 'script/agentctl.sh episode1-mako-review-note needs-edit crop 01:02:30 "Crop/framing note."',
            "openHandoff": (handoff.get("safeCommands") or {}).get("openHandoff") or "script/agentctl.sh episode1-selected-review-handoff --html",
            "openGuidedSession": (handoff.get("safeCommands") or {}).get("openGuidedSession") or "script/agentctl.sh episode1-selected-review-session --html",
            "openWorksheet": (handoff.get("safeCommands") or {}).get("openWorksheet") or "script/agentctl.sh episode1-selected-review-worksheet --html",
            "openDraftResponses": (handoff.get("safeCommands") or {}).get("openDraftResponses") or "script/agentctl.sh episode1-selected-review-session-draft --html",
            "refreshFullEvidence": "script/agentctl.sh episode1-vertical-slice-refresh && script/agentctl.sh episode1-current-next --html",
            "officialLedgerCommandAfterActualReview": (handoff.get("safeCommands") or {}).get("officialLedgerCommandAfterActualReview"),
        },
        "blockedClaims": blocked_claims(brief, handoff, progress),
    }
    return packet


def html_page(packet: dict[str, Any]) -> str:
    action = packet.get("recommendedImmediateAction") or {}
    review = packet.get("reviewState") or {}
    segment = review.get("segment") or {}
    editor_outcome = packet.get("makoEditorOutcome") or {}
    freshness_rows = "".join(
        f"""
        <div class="fresh">
          <strong>{esc(label)}</strong>
          <span>{esc((info or {}).get('loadStatus'))} · {esc((info or {}).get('ageLabel', 'missing'))}</span>
          <code>{esc((info or {}).get('path'))}</code>
        </div>
        """
        for label, info in (packet.get("sourceFreshness") or {}).items()
    )
    lanes = "".join(
        f"""
        <article class="lane">
          <span>{esc(lane.get('lens'))}</span>
          <strong>{esc(lane.get('status'))}</strong>
          <p>{esc(lane.get('action'))}</p>
          <code>{esc(lane.get('command'))}</code>
        </article>
        """
        for lane in packet.get("laneActions") or []
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
    blocked = "".join(f"<li>{esc(claim)}</li>" for claim in packet.get("blockedClaims") or [])
    return f"""<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Episode 1 Current Next Fast Board</title>
  <style>
    :root {{ --bg:#efe5d1; --paper:#fff9ed; --ink:#2c241d; --muted:#75685a; --line:rgba(72,51,33,.17); --fern:#2f7656; --clay:#a34d38; --gold:#d4a62d; --river:#2e6f84; }}
    * {{ box-sizing:border-box; }}
    body {{ margin:0; color:var(--ink); background:radial-gradient(circle at 12% 4%,rgba(212,166,45,.22),transparent 28rem),radial-gradient(circle at 90% 0%,rgba(47,118,86,.18),transparent 32rem),linear-gradient(135deg,#fbf6ea,var(--bg)); font-family:ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif; }}
    main {{ width:min(1240px,calc(100% - 34px)); margin:0 auto; padding:34px 0 72px; }}
    section {{ background:rgba(255,249,237,.96); border:1px solid var(--line); border-radius:28px; padding:24px; margin:16px 0; box-shadow:0 22px 64px rgba(50,35,22,.13); }}
    .hero {{ border-left:10px solid var(--fern); }}
    .kicker {{ color:#a97524; font-size:.72rem; font-weight:950; letter-spacing:.2em; text-transform:uppercase; }}
    h1 {{ margin:8px 0 12px; font-size:clamp(2.1rem,5vw,4.4rem); line-height:.94; letter-spacing:-.06em; }}
    h2 {{ margin:8px 0; letter-spacing:-.035em; }}
    p,li {{ color:var(--muted); line-height:1.48; }}
    code {{ display:block; margin-top:6px; white-space:pre-wrap; overflow-wrap:anywhere; color:#4a382a; font-size:.78rem; }}
    .grid {{ display:grid; grid-template-columns:minmax(0,1fr) minmax(370px,.72fr); gap:16px; align-items:start; }}
    .cards {{ display:grid; grid-template-columns:repeat(auto-fit,minmax(165px,1fr)); gap:10px; }}
    .card,.lane,.fresh,.command {{ border:1px solid var(--line); border-radius:18px; padding:12px; background:rgba(67,49,33,.055); }}
    .card strong {{ display:block; font-size:1.7rem; color:var(--ink); }}
    .action {{ border-left:8px solid var(--gold); }}
    .command {{ display:flex; justify-content:space-between; gap:12px; align-items:center; margin:10px 0; }}
    .fresh {{ margin:10px 0; }}
    .lane {{ margin:10px 0; }}
    .lane span {{ color:#a97524; font-size:.72rem; font-weight:950; letter-spacing:.16em; text-transform:uppercase; }}
    button {{ border:0; border-radius:999px; padding:8px 12px; font-weight:950; background:#3b2d21; color:#fff6e8; cursor:pointer; }}
    button.copied {{ background:var(--fern); }}
    .truth {{ border-left:8px solid var(--river); }}
    .danger {{ border-left:8px solid var(--clay); }}
    @media (max-width:920px) {{ .grid {{ grid-template-columns:1fr; }} }}
  </style>
</head>
<body>
<main>
  <section class="hero">
    <span class="kicker">Quipsly fast current-next</span>
    <h1>Read the board. Do the next honest thing.</h1>
    <p>{esc(packet.get('truth'))}</p>
    <p><strong>{esc(packet.get('uxPrinciple'))}</strong></p>
  </section>
  <section class="action">
    <span class="kicker">Recommended next action</span>
    <h2>{esc(action.get('lens'))}: {esc(action.get('status'))}</h2>
    <p>{esc(action.get('action'))}</p>
    <p><strong>Why:</strong> {esc(action.get('why'))}</p>
    <code>{esc(action.get('command'))}</code>
  </section>
  <section>
    <span class="kicker">Selected review state</span>
    <h2>{esc(segment.get('segmentId'))} · {esc(segment.get('label'))}</h2>
    <div class="cards">
      <div class="card"><span>Official pending</span><strong>{esc(review.get('officialReviewPending'))}</strong></div>
      <div class="card"><span>Official reviewed</span><strong>{esc(review.get('officialReviewReviewed'))}</strong></div>
      <div class="card"><span>Official issues</span><strong>{esc(review.get('officialReviewIssues'))}</strong></div>
      <div class="card"><span>Draft entries</span><strong>{esc(review.get('draftEntryCount'))}</strong></div>
      <div class="card"><span>Checks</span><strong>{esc(review.get('checkedDraftItems'))}/{esc(review.get('totalChecklistItems'))}</strong></div>
      <div class="card"><span>Answers</span><strong>{esc(review.get('answeredQuestions'))}/{esc(review.get('totalQuestions'))}</strong></div>
    </div>
  </section>
  <section class="action">
    <span class="kicker">Mako editor outcome</span>
    <h2>{esc(editor_outcome.get('status'))}</h2>
    <p>{esc(editor_outcome.get('recommendation'))}</p>
  </section>
  <div class="grid">
    <section>
      <span class="kicker">Lanes</span>
      <h2>Nest, Studio, Tower, Agent</h2>
      {lanes}
    </section>
    <section>
      <span class="kicker">Commands</span>
      <h2>Safe controls</h2>
      {commands}
    </section>
  </div>
  <section class="truth">
    <span class="kicker">Freshness</span>
    <h2>Cached source packets</h2>
    {freshness_rows}
  </section>
  <section class="danger">
    <span class="kicker">Blocked claims</span>
    <h2>Do not say these yet</h2>
    <ul>{blocked}</ul>
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
    action = packet.get("recommendedImmediateAction") or {}
    review = packet.get("reviewState") or {}
    segment = review.get("segment") or {}
    editor_outcome = packet.get("makoEditorOutcome") or {}
    lines = [
        "# Episode 1 current-next fast board",
        "",
        packet.get("truth", ""),
        "",
        f"**UX principle:** {packet.get('uxPrinciple')}",
        "",
        "## Recommended next action",
        "",
        f"- Lens: `{action.get('lens')}`",
        f"- Status: `{action.get('status')}`",
        f"- Action: {action.get('action')}",
        f"- Why: {action.get('why')}",
        f"- Command: `{action.get('command')}`",
        "",
        "## Selected review state",
        "",
        f"- Segment: `{segment.get('segmentId')}` {segment.get('label') or ''}",
        f"- Official pending: `{review.get('officialReviewPending')}`",
        f"- Official reviewed: `{review.get('officialReviewReviewed')}`",
        f"- Official issues: `{review.get('officialReviewIssues')}`",
        f"- Draft entries: `{review.get('draftEntryCount')}`",
        f"- Draft checks: `{review.get('checkedDraftItems')}` / `{review.get('totalChecklistItems')}`",
        f"- Draft answers: `{review.get('answeredQuestions')}` / `{review.get('totalQuestions')}`",
        f"- Draft ready for official ledger consideration: `{review.get('draftReadyToConsiderOfficialLedgerCommand')}`",
        "",
        "## Mako editor outcome",
        "",
        f"- Status: `{editor_outcome.get('status')}`",
        f"- Recommendation: {editor_outcome.get('recommendation')}",
        f"- Notes: `{editor_outcome.get('noteCount')}`",
        "",
        "## Lane actions",
        "",
    ]
    for lane in packet.get("laneActions") or []:
        lines.extend(
            [
                f"- `{lane.get('lens')}` / `{lane.get('status')}`: {lane.get('action')}",
                f"  `{lane.get('command')}`",
            ]
        )
    lines.extend(["", "## Freshness", ""])
    for label, info in (packet.get("sourceFreshness") or {}).items():
        lines.append(f"- `{label}`: `{(info or {}).get('loadStatus')}` · `{(info or {}).get('ageLabel', 'missing')}` · `{(info or {}).get('path')}`")
    lines.extend(["", "## Safe commands", ""])
    for label, command in (packet.get("safeCommands") or {}).items():
        if command:
            lines.extend([f"### {label}", "", f"```bash\n{command}\n```", ""])
    lines.extend(["## Blocked claims", ""])
    for claim in packet.get("blockedClaims") or []:
        lines.append(f"- {claim}")
    return "\n".join(lines)


def main() -> int:
    if len(sys.argv) != 8:
        print(
            "usage: episode1_current_next_fast.py brief.json handoff.json draft.json progress.json output.json output.html output.md",
            file=sys.stderr,
        )
        return 2
    brief_path, handoff_path, draft_path, progress_path, output_json, output_html, output_md = sys.argv[1:8]
    packet = build_packet(brief_path, handoff_path, draft_path, progress_path, output_json, output_html, output_md)
    write_json(output_json, packet)
    write_text(output_html, html_page(packet))
    write_text(output_md, markdown_page(packet))
    print(f"Wrote {output_json}")
    print(f"Wrote {output_html}")
    print(f"Wrote {output_md}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
