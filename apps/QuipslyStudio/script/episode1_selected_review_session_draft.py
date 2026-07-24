#!/usr/bin/env python3
"""Build and update a durable draft response packet for the Episode 1 selected review session.

This is deliberately non-decisional. It records reviewer notes, checklist claims,
question answers, and draft recommendations before any official review ledger
mutation happens.
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


def load_ledger(path: str) -> list[dict[str, Any]]:
    if not os.path.exists(path):
        return []
    rows: list[dict[str, Any]] = []
    with open(path, "r", encoding="utf-8") as handle:
        for line in handle:
            line = line.strip()
            if not line:
                continue
            try:
                rows.append(json.loads(line))
            except Exception as error:
                rows.append({"kind": "ledger-parse-error", "text": str(error), "raw": line})
    return rows


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


def append_ledger(path: str, row: dict[str, Any]) -> None:
    os.makedirs(os.path.dirname(path) or ".", exist_ok=True)
    with open(path, "a", encoding="utf-8") as handle:
        handle.write(json.dumps(row, sort_keys=True))
        handle.write("\n")


def esc(value: Any) -> str:
    return html.escape("" if value is None else str(value))


def build_packet(session_path: str, ledger_path: str, output_json: str, output_html: str, output_md: str) -> dict[str, Any]:
    session = load_json(session_path)
    segment = session.get("segment") or {}
    all_rows = load_ledger(ledger_path)
    segment_id = segment.get("segmentId")
    rows = [row for row in all_rows if row.get("segmentId") == segment_id]
    check_items = session.get("checkItems") or []
    question_items = [item for item in check_items if item.get("kind") == "question"]
    checked_ids = {row.get("checkItemId") for row in rows if row.get("kind") == "check" and row.get("checkItemId")}
    answered_count = sum(1 for row in rows if row.get("kind") == "answer")
    return {
        "packetType": "quipsly-episode1-selected-review-session-draft",
        "version": "2026-06-20.selected-review-session-draft.v1",
        "projectSlug": session.get("projectSlug"),
        "episodeSlug": session.get("episodeSlug"),
        "generatedAt": now_iso(),
        "json": output_json,
        "html": output_html,
        "markdown": output_md,
        "sourceSessionPath": session_path,
        "sourceLedgerPath": ledger_path,
        "segment": segment,
        "truth": "This packet records draft review responses only. It does not mark selected artifacts reviewed, approve media, canonize writing, publish, upload, schedule, or capture receipts.",
        "summary": {
            "segmentId": segment_id,
            "draftEntryCount": len(rows),
            "checkItemCount": len(check_items),
            "checkedItemCount": len(checked_ids),
            "questionCount": len(question_items),
            "answeredQuestionCount": answered_count,
            "hasDraftRecommendation": any(row.get("kind") == "recommendation" for row in rows),
            "readyToConsiderOfficialLedgerCommand": bool(check_items) and len(checked_ids) >= len(check_items) and answered_count >= len(question_items),
        },
        "checkItems": check_items,
        "entries": rows,
        "safeCommands": {
            "openDraft": "script/agentctl.sh episode1-selected-review-session-draft --html",
            "openSession": "script/agentctl.sh episode1-selected-review-session --html",
            "addCheck": 'script/agentctl.sh episode1-selected-review-session-draft-add "Reviewer Name" check "watch-episode-16x9-master" "I watched this clip."',
            "addAnswer": 'script/agentctl.sh episode1-selected-review-session-draft-add "Reviewer Name" answer "question-1" "Answer the question after actual review."',
            "addNote": 'script/agentctl.sh episode1-selected-review-session-draft-add "Reviewer Name" note general "Observation from actual review."',
            "addRecommendation": 'script/agentctl.sh episode1-selected-review-session-draft-add "Reviewer Name" recommendation final "reviewed|issue|skip plus why"',
            "officialLedgerCommand": (session.get("safeCommands") or {}).get("markSegmentReviewedAfterChecklistAndActualReview"),
        },
    }


def html_page(packet: dict[str, Any]) -> str:
    segment = packet.get("segment") or {}
    summary = packet.get("summary") or {}
    entries = packet.get("entries") or []
    commands = packet.get("safeCommands") or {}
    entry_html = "".join(
        f"""
        <article class="entry">
          <div><strong>{esc(row.get('kind'))}</strong> · {esc(row.get('actor'))} · {esc(row.get('createdAt'))}</div>
          <p><code>{esc(row.get('target'))}</code></p>
          <p>{esc(row.get('text'))}</p>
        </article>
        """
        for row in entries
    ) or "<p>No draft review responses recorded yet.</p>"
    check_html = "".join(
        f"<li><code>{esc(item.get('id'))}</code> {esc(item.get('label'))}</li>"
        for item in packet.get("checkItems") or []
    )
    command_html = "".join(
        f"""
        <div class="command-row">
          <div><strong>{esc(label)}</strong><code>{esc(command)}</code></div>
          <button data-copy="{esc(command)}">Copy</button>
        </div>
        """
        for label, command in commands.items()
        if command
    )
    readiness_class = "ready" if summary.get("readyToConsiderOfficialLedgerCommand") else "hold"
    readiness_text = "Draft responses complete enough to consider official ledger command" if readiness_class == "ready" else "Draft responses incomplete"
    return f"""<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Episode 1 Draft Review Responses</title>
  <style>
    :root {{ --bg:#f3ead8; --paper:#fff9ec; --ink:#2d241d; --muted:#786b5e; --line:rgba(73,52,35,.17); --fern:#2f7656; --clay:#a34d38; --gold:#d8ac31; }}
    body {{ margin:0; font-family:ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif; color:var(--ink); background:linear-gradient(135deg,#fbf5e8,var(--bg)); }}
    main {{ width:min(1180px,calc(100% - 32px)); margin:0 auto; padding:32px 0 70px; }}
    section {{ background:rgba(255,249,236,.95); border:1px solid var(--line); border-radius:26px; padding:22px; margin:16px 0; box-shadow:0 20px 56px rgba(51,35,22,.12); }}
    .kicker {{ color:#a97524; font-size:.74rem; font-weight:950; letter-spacing:.2em; text-transform:uppercase; }}
    h1 {{ margin:8px 0 10px; font-size:clamp(2rem,5vw,4rem); line-height:.94; letter-spacing:-.055em; }}
    p,li {{ color:var(--muted); line-height:1.45; }}
    .pill {{ display:inline-flex; border-radius:999px; padding:8px 12px; font-weight:950; }}
    .pill.ready {{ color:var(--fern); background:rgba(47,118,86,.14); }}
    .pill.hold {{ color:var(--clay); background:rgba(163,77,56,.14); }}
    .grid {{ display:grid; grid-template-columns:minmax(0,1fr) minmax(340px,.72fr); gap:16px; align-items:start; }}
    .entry,.command-row {{ border:1px solid var(--line); border-radius:18px; padding:12px; background:rgba(69,49,32,.055); margin:10px 0; }}
    .command-row {{ display:flex; justify-content:space-between; gap:12px; align-items:center; }}
    code {{ display:block; white-space:pre-wrap; overflow-wrap:anywhere; font-size:.78rem; color:#4c392b; margin-top:6px; }}
    button {{ border:0; border-radius:999px; background:#3b2d21; color:#fff6e8; padding:8px 11px; font-weight:950; cursor:pointer; }}
    button.copied {{ background:var(--fern); }}
    @media (max-width:900px) {{ .grid {{ grid-template-columns:1fr; }} }}
  </style>
</head>
<body>
<main>
  <section>
    <span class="kicker">Quipsly draft review responses</span>
    <h1>Write the review down before changing the ledger.</h1>
    <p>{esc(packet.get('truth'))}</p>
    <p><strong>Segment:</strong> {esc(segment.get('segmentId'))} · {esc(segment.get('label'))}</p>
    <span class="pill {readiness_class}">{readiness_text}</span>
  </section>
  <div class="grid">
    <section>
      <span class="kicker">Draft responses</span>
      <h2>Recorded entries</h2>
      {entry_html}
    </section>
    <section>
      <span class="kicker">Checklist</span>
      <h2>Review prompts</h2>
      <ul>{check_html}</ul>
      <h2>Safe commands</h2>
      {command_html}
    </section>
  </div>
</main>
<script>
  document.querySelectorAll('[data-copy]').forEach((button) => {{
    button.addEventListener('click', async () => {{
      await navigator.clipboard.writeText(button.dataset.copy || '');
      button.classList.add('copied');
      button.textContent = 'Copied';
      setTimeout(() => {{ button.classList.remove('copied'); button.textContent = 'Copy'; }}, 1400);
    }});
  }});
</script>
</body>
</html>"""


def markdown_page(packet: dict[str, Any]) -> str:
    lines = [
        "# Episode 1 draft review responses",
        "",
        packet.get("truth", ""),
        "",
        f"- Segment: `{(packet.get('segment') or {}).get('segmentId')}`",
        f"- Draft entries: `{(packet.get('summary') or {}).get('draftEntryCount')}`",
        f"- Checked items: `{(packet.get('summary') or {}).get('checkedItemCount')}` / `{(packet.get('summary') or {}).get('checkItemCount')}`",
        f"- Answered questions: `{(packet.get('summary') or {}).get('answeredQuestionCount')}` / `{(packet.get('summary') or {}).get('questionCount')}`",
        f"- Ready to consider official ledger command: `{(packet.get('summary') or {}).get('readyToConsiderOfficialLedgerCommand')}`",
        "",
        "## Entries",
        "",
    ]
    entries = packet.get("entries") or []
    if not entries:
        lines.append("No draft review responses recorded yet.")
    for row in entries:
        lines.extend([
            f"### {row.get('kind')} - {row.get('target')}",
            "",
            f"- Actor: `{row.get('actor')}`",
            f"- Created: `{row.get('createdAt')}`",
            "",
            str(row.get("text") or ""),
            "",
        ])
    lines.extend([
        "## Safe commands",
        "",
    ])
    for label, command in (packet.get("safeCommands") or {}).items():
        if command:
            lines.extend([f"- {label}:", "", f"```bash\n{command}\n```", ""])
    return "\n".join(lines)


def main() -> int:
    if len(sys.argv) < 6:
        print("usage: episode1_selected_review_session_draft.py SESSION_JSON LEDGER_JSONL OUTPUT_JSON OUTPUT_HTML OUTPUT_MD [--add ACTOR KIND TARGET TEXT]", file=sys.stderr)
        return 2
    session_path, ledger_path, output_json, output_html, output_md = sys.argv[1:6]
    args = sys.argv[6:]
    if args:
        if len(args) != 5 or args[0] != "--add":
            print("usage: --add ACTOR KIND TARGET TEXT", file=sys.stderr)
            return 2
        session = load_json(session_path)
        segment = session.get("segment") or {}
        actor, kind, target, text = args[1:]
        if kind not in {"check", "answer", "note", "recommendation", "issue"}:
            print("kind must be one of: check, answer, note, recommendation, issue", file=sys.stderr)
            return 2
        append_ledger(ledger_path, {
            "createdAt": now_iso(),
            "actor": actor,
            "kind": kind,
            "target": target,
            "checkItemId": target if kind == "check" else None,
            "segmentId": segment.get("segmentId"),
            "episodeSlug": session.get("episodeSlug"),
            "projectSlug": session.get("projectSlug"),
            "text": text,
            "truth": "Draft response only; official review ledger unchanged.",
        })
    packet = build_packet(session_path, ledger_path, output_json, output_html, output_md)
    write_json(output_json, packet)
    write_text(output_html, html_page(packet))
    write_text(output_md, markdown_page(packet))
    print(json.dumps(packet, indent=2, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
