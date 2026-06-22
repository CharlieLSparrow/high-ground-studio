#!/usr/bin/env python3
"""Build a reviewer-facing handoff for the current Episode 1 selected review segment."""

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


def first_existing(*values: Any) -> str | None:
    for value in values:
        if value:
            return str(value)
    return None


def build_packet(session_path: str, draft_path: str, progress_path: str, brief_path: str, output_json: str, output_html: str, output_md: str) -> dict[str, Any]:
    session = load_json(session_path)
    draft = load_json(draft_path)
    progress = load_json(progress_path)
    brief = load_json(brief_path)
    segment = session.get("segment") or {}
    draft_summary = draft.get("summary") or {}
    progress_summary = progress.get("summary") or {}
    official_command = (draft.get("safeCommands") or {}).get("officialLedgerCommand") or (session.get("safeCommands") or {}).get("markSegmentReviewedAfterChecklistAndActualReview")
    return {
        "packetType": "quipsly-episode1-selected-review-handoff",
        "version": "2026-06-20.selected-review-handoff.v1",
        "projectSlug": session.get("projectSlug") or brief.get("projectSlug"),
        "episodeSlug": session.get("episodeSlug") or brief.get("episodeSlug"),
        "generatedAt": now_iso(),
        "json": output_json,
        "html": output_html,
        "markdown": output_md,
        "segment": segment,
        "truth": "This handoff helps a reviewer complete the selected Episode 1 segment review. It does not mark review complete, approve artifacts, publish, upload, schedule, or capture receipts.",
        "sourcePackets": {
            "session": session_path,
            "draftResponses": draft_path,
            "progress": progress_path,
            "verticalSliceBrief": brief_path,
        },
        "currentState": {
            "officialReviewPending": progress_summary.get("pending"),
            "officialReviewReviewed": progress_summary.get("reviewed"),
            "officialReviewIssues": progress_summary.get("issue"),
            "draftEntryCount": draft_summary.get("draftEntryCount"),
            "checkedDraftItems": draft_summary.get("checkedItemCount"),
            "totalChecklistItems": draft_summary.get("checkItemCount"),
            "answeredQuestions": draft_summary.get("answeredQuestionCount"),
            "totalQuestions": draft_summary.get("questionCount"),
            "draftReadyToConsiderOfficialLedgerCommand": draft_summary.get("readyToConsiderOfficialLedgerCommand"),
        },
        "reviewSteps": [
            "Open the guided review session.",
            "Watch every selected video review clip and listen to the selected audio review clip.",
            "Use the per-row draft-response commands to record what was actually reviewed.",
            "Answer the human review questions in the durable draft response ledger.",
            "If there is a problem, copy an issue command instead of marking reviewed.",
            "Only after real review and durable notes should the official review ledger command be considered.",
        ],
        "safeCommands": {
            "openHandoff": "script/agentctl.sh episode1-selected-review-handoff --html",
            "openGuidedSession": first_existing((session.get("safeCommands") or {}).get("openSession"), "script/agentctl.sh episode1-selected-review-session --html"),
            "openWorksheet": "script/agentctl.sh episode1-selected-review-worksheet --html",
            "copyMarkdownWorksheet": "script/agentctl.sh episode1-selected-review-worksheet --md",
            "openDraftResponses": first_existing((draft.get("safeCommands") or {}).get("openDraft"), "script/agentctl.sh episode1-selected-review-session-draft --html"),
            "addGeneralDraftResponse": (draft.get("safeCommands") or {}).get("addNote"),
            "addRecommendation": (draft.get("safeCommands") or {}).get("addRecommendation"),
            "officialLedgerCommandAfterActualReview": official_command,
            "refreshVerticalSlice": "script/agentctl.sh episode1-vertical-slice-refresh && script/agentctl.sh episode1-vertical-slice-next --json",
        },
        "blockedClaims": [
            "Do not call Episode 1 artifact-ready until selected watch/listen review is complete.",
            "Do not treat draft responses as official review ledger mutations.",
            "Do not claim publication readiness until Studio review, destination copy, writing/canon state, selected shorts, queue state, and receipt targets are reviewed.",
            "Do not claim published until external receipt proof exists.",
        ],
    }


def html_page(packet: dict[str, Any]) -> str:
    state = packet.get("currentState") or {}
    segment = packet.get("segment") or {}
    commands = packet.get("safeCommands") or {}
    steps = "".join(f"<li>{esc(step)}</li>" for step in packet.get("reviewSteps") or [])
    blocked = "".join(f"<li>{esc(item)}</li>" for item in packet.get("blockedClaims") or [])
    command_rows = "".join(
        f"""
        <div class="command-row">
          <div><strong>{esc(label)}</strong><code>{esc(command)}</code></div>
          <button data-copy="{esc(command)}">Copy</button>
        </div>
        """
        for label, command in commands.items()
        if command
    )
    source_rows = "".join(f"<li><strong>{esc(label)}</strong>: <code>{esc(path)}</code></li>" for label, path in (packet.get("sourcePackets") or {}).items())
    ready = bool(state.get("draftReadyToConsiderOfficialLedgerCommand"))
    return f"""<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Episode 1 Selected Review Handoff</title>
  <style>
    :root {{ --bg:#f0e7d6; --paper:#fff9ee; --ink:#2c231d; --muted:#786a5c; --line:rgba(74,52,34,.16); --fern:#2f7656; --clay:#a34d38; --gold:#d4a62d; --river:#2e6f84; }}
    * {{ box-sizing:border-box; }}
    body {{ margin:0; color:var(--ink); background:radial-gradient(circle at 14% 4%,rgba(212,166,45,.22),transparent 30rem),radial-gradient(circle at 90% 0%,rgba(47,118,86,.18),transparent 34rem),linear-gradient(135deg,#fbf6ea,var(--bg)); font-family:ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif; }}
    main {{ width:min(1220px,calc(100% - 34px)); margin:0 auto; padding:34px 0 72px; }}
    section {{ background:rgba(255,249,238,.95); border:1px solid var(--line); border-radius:28px; padding:24px; margin:16px 0; box-shadow:0 22px 64px rgba(50,35,22,.13); }}
    .hero {{ border-left:10px solid var(--fern); }}
    .kicker {{ color:#a97524; font-size:.72rem; font-weight:950; letter-spacing:.2em; text-transform:uppercase; }}
    h1 {{ margin:8px 0 12px; font-size:clamp(2.2rem,5vw,4.6rem); line-height:.92; letter-spacing:-.06em; }}
    h2 {{ margin:8px 0; letter-spacing:-.035em; }}
    p,li {{ color:var(--muted); line-height:1.48; }}
    .grid {{ display:grid; grid-template-columns:minmax(0,1fr) minmax(360px,.78fr); gap:16px; align-items:start; }}
    .cards {{ display:grid; grid-template-columns:repeat(auto-fit,minmax(180px,1fr)); gap:10px; }}
    .card,.command-row {{ border:1px solid var(--line); border-radius:18px; padding:12px; background:rgba(67,49,33,.055); }}
    .card strong {{ display:block; font-size:1.35rem; color:var(--ink); }}
    .pill {{ display:inline-flex; border-radius:999px; padding:8px 12px; font-weight:950; color:{'#2f7656' if ready else '#a34d38'}; background:{'rgba(47,118,86,.14)' if ready else 'rgba(163,77,56,.14)'}; }}
    .command-row {{ display:flex; justify-content:space-between; gap:12px; align-items:center; margin:10px 0; }}
    code {{ display:block; margin-top:6px; white-space:pre-wrap; overflow-wrap:anywhere; color:#4a382a; font-size:.78rem; }}
    button {{ border:0; border-radius:999px; padding:8px 12px; font-weight:950; background:#3b2d21; color:#fff6e8; cursor:pointer; }}
    button.copied {{ background:var(--fern); }}
    .danger {{ border-left:8px solid var(--clay); }}
    @media (max-width:900px) {{ .grid {{ grid-template-columns:1fr; }} }}
  </style>
</head>
<body>
<main>
  <section class="hero">
    <span class="kicker">Quipsly selected review handoff</span>
    <h1>One segment. Actual review. No fake readiness.</h1>
    <p>{esc(packet.get('truth'))}</p>
    <p><strong>Segment:</strong> {esc(segment.get('segmentId'))} · {esc(segment.get('label'))}</p>
    <span class="pill">{'Draft responses complete enough to consider official ledger' if ready else 'Draft responses still incomplete'}</span>
  </section>
  <section>
    <span class="kicker">Current state</span>
    <h2>Review progress</h2>
    <div class="cards">
      <div class="card"><span>Official pending</span><strong>{esc(state.get('officialReviewPending'))}</strong></div>
      <div class="card"><span>Official reviewed</span><strong>{esc(state.get('officialReviewReviewed'))}</strong></div>
      <div class="card"><span>Draft entries</span><strong>{esc(state.get('draftEntryCount'))}</strong></div>
      <div class="card"><span>Checklist draft checks</span><strong>{esc(state.get('checkedDraftItems'))}/{esc(state.get('totalChecklistItems'))}</strong></div>
      <div class="card"><span>Question answers</span><strong>{esc(state.get('answeredQuestions'))}/{esc(state.get('totalQuestions'))}</strong></div>
    </div>
  </section>
  <div class="grid">
    <section>
      <span class="kicker">Reviewer path</span>
      <h2>Do this in order</h2>
      <ol>{steps}</ol>
    </section>
    <section>
      <span class="kicker">Commands</span>
      <h2>Safe operator commands</h2>
      {command_rows}
    </section>
  </div>
  <section class="danger">
    <span class="kicker">Blocked claims</span>
    <h2>Do not say these are true yet</h2>
    <ul>{blocked}</ul>
  </section>
  <section>
    <span class="kicker">Source packets</span>
    <h2>Where this handoff came from</h2>
    <ul>{source_rows}</ul>
  </section>
</main>
<script>
  document.querySelectorAll('[data-copy]').forEach((button) => {{
    button.addEventListener('click', async () => {{
      const old = button.textContent;
      await navigator.clipboard.writeText(button.dataset.copy || '');
      button.textContent = 'Copied';
      button.classList.add('copied');
      setTimeout(() => {{ button.textContent = old; button.classList.remove('copied'); }}, 1300);
    }});
  }});
</script>
</body>
</html>"""


def markdown_page(packet: dict[str, Any]) -> str:
    state = packet.get("currentState") or {}
    segment = packet.get("segment") or {}
    lines = [
        "# Episode 1 selected review handoff",
        "",
        packet.get("truth", ""),
        "",
        f"- Segment: `{segment.get('segmentId')}` {segment.get('label') or ''}",
        f"- Official pending: `{state.get('officialReviewPending')}`",
        f"- Official reviewed: `{state.get('officialReviewReviewed')}`",
        f"- Draft entries: `{state.get('draftEntryCount')}`",
        f"- Draft checks: `{state.get('checkedDraftItems')}` / `{state.get('totalChecklistItems')}`",
        f"- Draft answers: `{state.get('answeredQuestions')}` / `{state.get('totalQuestions')}`",
        f"- Draft ready to consider official ledger: `{state.get('draftReadyToConsiderOfficialLedgerCommand')}`",
        "",
        "## Reviewer path",
        "",
    ]
    for index, step in enumerate(packet.get("reviewSteps") or [], start=1):
        lines.append(f"{index}. {step}")
    lines.extend(["", "## Safe commands", ""])
    for label, command in (packet.get("safeCommands") or {}).items():
        if command:
            lines.extend([f"### {label}", "", f"```bash\n{command}\n```", ""])
    lines.extend(["## Blocked claims", ""])
    for claim in packet.get("blockedClaims") or []:
        lines.append(f"- {claim}")
    lines.extend(["", "## Source packets", ""])
    for label, path in (packet.get("sourcePackets") or {}).items():
        lines.append(f"- `{label}`: `{path}`")
    return "\n".join(lines)


def main() -> int:
    if len(sys.argv) != 8:
        print("usage: episode1_selected_review_handoff.py session.json draft.json progress.json brief.json output.json output.html output.md", file=sys.stderr)
        return 2
    session_path, draft_path, progress_path, brief_path, output_json, output_html, output_md = sys.argv[1:8]
    packet = build_packet(session_path, draft_path, progress_path, brief_path, output_json, output_html, output_md)
    write_json(output_json, packet)
    write_text(output_html, html_page(packet))
    write_text(output_md, markdown_page(packet))
    print(json.dumps(packet, indent=2, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
