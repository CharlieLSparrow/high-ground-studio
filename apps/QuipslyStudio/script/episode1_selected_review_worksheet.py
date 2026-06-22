#!/usr/bin/env python3
"""Generate a fill-in worksheet for the current Episode 1 selected review segment."""

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


def command_for_item(item: dict[str, Any]) -> str:
    item_id = item.get("id") or "unknown"
    label = item.get("label") or item_id
    if item.get("kind") == "question":
        return f'script/agentctl.sh episode1-selected-review-session-draft-add "Reviewer Name" answer "{item_id}" "Answer after actual review: {label}"'
    return f'script/agentctl.sh episode1-selected-review-session-draft-add "Reviewer Name" check "{item_id}" "Completed after actual review: {label}"'


def build_packet(handoff_path: str, session_path: str, draft_path: str, output_json: str, output_html: str, output_md: str) -> dict[str, Any]:
    handoff = load_json(handoff_path)
    session = load_json(session_path)
    draft = load_json(draft_path)
    check_items = session.get("checkItems") or []
    worksheet_items = []
    for item in check_items:
        worksheet_items.append({
            "id": item.get("id"),
            "kind": item.get("kind"),
            "label": item.get("label"),
            "artifactId": item.get("artifactId"),
            "draftCommand": command_for_item(item),
            "blankPrompt": "Notes / answer / timestamp:",
        })
    return {
        "packetType": "quipsly-episode1-selected-review-worksheet",
        "version": "2026-06-20.selected-review-worksheet.v1",
        "projectSlug": handoff.get("projectSlug") or session.get("projectSlug"),
        "episodeSlug": handoff.get("episodeSlug") or session.get("episodeSlug"),
        "generatedAt": now_iso(),
        "json": output_json,
        "html": output_html,
        "markdown": output_md,
        "segment": handoff.get("segment") or session.get("segment"),
        "truth": "This worksheet helps a reviewer perform and record review. It does not mutate review state, approve artifacts, publish, upload, schedule, or capture receipts.",
        "sourcePackets": {
            "handoff": handoff_path,
            "session": session_path,
            "draftResponses": draft_path,
        },
        "currentState": handoff.get("currentState") or {},
        "items": worksheet_items,
        "safeCommands": {
            "openHandoff": (handoff.get("safeCommands") or {}).get("openHandoff"),
            "openGuidedSession": (handoff.get("safeCommands") or {}).get("openGuidedSession"),
            "openDraftResponses": (handoff.get("safeCommands") or {}).get("openDraftResponses"),
            "addRecommendation": (handoff.get("safeCommands") or {}).get("addRecommendation"),
            "officialLedgerCommandAfterActualReview": (handoff.get("safeCommands") or {}).get("officialLedgerCommandAfterActualReview"),
        },
        "blockedClaims": handoff.get("blockedClaims") or [],
        "draftSummary": draft.get("summary") or {},
    }


def markdown_page(packet: dict[str, Any]) -> str:
    segment = packet.get("segment") or {}
    state = packet.get("currentState") or {}
    lines = [
        "# Episode 1 selected review worksheet",
        "",
        packet.get("truth", ""),
        "",
        f"- Segment: `{segment.get('segmentId')}` {segment.get('label') or ''}",
        f"- Official reviewed: `{state.get('officialReviewReviewed')}`",
        f"- Official pending: `{state.get('officialReviewPending')}`",
        f"- Draft entries: `{state.get('draftEntryCount')}`",
        f"- Draft checks: `{state.get('checkedDraftItems')}` / `{state.get('totalChecklistItems')}`",
        f"- Draft answers: `{state.get('answeredQuestions')}` / `{state.get('totalQuestions')}`",
        "",
        "## Reviewer instructions",
        "",
        "1. Open the guided session and perform the real watch/listen review.",
        "2. For each item below, write a short answer or timestamped note.",
        "3. Copy the matching draft-response command after each item is actually reviewed.",
        "4. Add a final recommendation only after the segment has really been reviewed.",
        "5. Use the official ledger command only after the worksheet and draft responses reflect actual review.",
        "",
        "## Review items",
        "",
    ]
    for index, item in enumerate(packet.get("items") or [], start=1):
        lines.extend([
            f"### {index}. {item.get('label')}",
            "",
            f"- Type: `{item.get('kind')}`",
            f"- Artifact: `{item.get('artifactId') or ''}`",
            "- Notes / answer / timestamp:",
            "",
            "> ",
            "",
            "Draft-response command after actual review:",
            "",
            f"```bash\n{item.get('draftCommand')}\n```",
            "",
        ])
    lines.extend(["## Final recommendation", "", "Write reviewed, issue, or skip plus why.", ""])
    recommendation = (packet.get("safeCommands") or {}).get("addRecommendation")
    if recommendation:
        lines.extend(["```bash", recommendation, "```", ""])
    lines.extend(["## Official ledger command", "", "Do not run this until real review is complete and draft responses are recorded.", ""])
    official = (packet.get("safeCommands") or {}).get("officialLedgerCommandAfterActualReview")
    if official:
        lines.extend(["```bash", official, "```", ""])
    lines.extend(["## Blocked claims", ""])
    for claim in packet.get("blockedClaims") or []:
        lines.append(f"- {claim}")
    return "\n".join(lines)


def html_page(packet: dict[str, Any]) -> str:
    md = markdown_page(packet)
    command_buttons = "".join(
        f"""
        <article class="item">
          <h3>{esc(index)}. {esc(item.get('label'))}</h3>
          <p>{esc(item.get('kind'))} · {esc(item.get('artifactId') or '')}</p>
          <textarea placeholder="Notes / answer / timestamp"></textarea>
          <code>{esc(item.get('draftCommand'))}</code>
          <button data-copy="{esc(item.get('draftCommand'))}">Copy draft command</button>
        </article>
        """
        for index, item in enumerate(packet.get("items") or [], start=1)
    )
    official = (packet.get("safeCommands") or {}).get("officialLedgerCommandAfterActualReview") or ""
    open_session = (packet.get("safeCommands") or {}).get("openGuidedSession") or ""
    open_draft = (packet.get("safeCommands") or {}).get("openDraftResponses") or ""
    segment = packet.get("segment") or {}
    return f"""<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Episode 1 Selected Review Worksheet</title>
  <style>
    :root {{ --bg:#f1e8d7; --paper:#fff9ee; --ink:#2d241d; --muted:#776a5d; --line:rgba(72,51,34,.16); --fern:#2f7656; --clay:#a34d38; --gold:#d5a72e; }}
    body {{ margin:0; color:var(--ink); background:linear-gradient(135deg,#fcf7eb,var(--bg)); font-family:ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif; }}
    main {{ width:min(1160px,calc(100% - 32px)); margin:0 auto; padding:32px 0 70px; }}
    section,.item {{ background:rgba(255,249,238,.96); border:1px solid var(--line); border-radius:24px; padding:20px; margin:14px 0; box-shadow:0 20px 54px rgba(50,35,22,.12); }}
    .kicker {{ color:#a97524; font-size:.72rem; font-weight:950; letter-spacing:.2em; text-transform:uppercase; }}
    h1 {{ margin:8px 0 10px; font-size:clamp(2rem,5vw,4.3rem); line-height:.93; letter-spacing:-.055em; }}
    p {{ color:var(--muted); line-height:1.45; }}
    textarea {{ width:100%; min-height:92px; border:1px solid var(--line); border-radius:14px; padding:12px; background:#fffdf7; color:var(--ink); }}
    code {{ display:block; margin:10px 0; white-space:pre-wrap; overflow-wrap:anywhere; color:#4a382a; background:rgba(67,49,33,.055); border:1px solid var(--line); border-radius:14px; padding:10px; font-size:.8rem; }}
    button {{ border:0; border-radius:999px; padding:9px 12px; background:#3b2d21; color:#fff6e8; font-weight:950; cursor:pointer; }}
    button.copied {{ background:var(--fern); }}
    .danger {{ border-left:8px solid var(--clay); }}
  </style>
</head>
<body>
<main>
  <section>
    <span class="kicker">Quipsly review worksheet</span>
    <h1>Fill this out while you review.</h1>
    <p>{esc(packet.get('truth'))}</p>
    <p><strong>Segment:</strong> {esc(segment.get('segmentId'))} · {esc(segment.get('label'))}</p>
    <button data-copy="{esc(open_session)}">Copy open guided session</button>
    <button data-copy="{esc(open_draft)}">Copy open draft responses</button>
  </section>
  <section>
    <span class="kicker">Review items</span>
    <h2>Watch, listen, answer, then record durable draft responses</h2>
    {command_buttons}
  </section>
  <section class="danger">
    <span class="kicker">Official ledger command</span>
    <h2>Only after actual review</h2>
    <p>Do not run this until real review is complete and durable draft responses are recorded.</p>
    <code>{esc(official)}</code>
    <button data-copy="{esc(official)}">Copy official command</button>
  </section>
  <section>
    <span class="kicker">Markdown worksheet</span>
    <h2>Copyable text version</h2>
    <textarea style="min-height:360px;">{esc(md)}</textarea>
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


def main() -> int:
    if len(sys.argv) != 7:
        print("usage: episode1_selected_review_worksheet.py handoff.json session.json draft.json output.json output.html output.md", file=sys.stderr)
        return 2
    handoff_path, session_path, draft_path, output_json, output_html, output_md = sys.argv[1:7]
    packet = build_packet(handoff_path, session_path, draft_path, output_json, output_html, output_md)
    write_json(output_json, packet)
    write_text(output_md, markdown_page(packet))
    write_text(output_html, html_page(packet))
    print(json.dumps(packet, indent=2, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
