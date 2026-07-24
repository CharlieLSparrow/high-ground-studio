#!/usr/bin/env python3
"""Create or append non-decisional notes for the Episode 1 selected review loop.

Notes are observations, not approvals. They help humans and agents capture what
was seen, heard, confusing, promising, or scary while review is in progress.
"""

from __future__ import annotations

import html
import json
import os
import sys
from datetime import datetime, timezone
from typing import Any
from urllib.parse import quote


def now_iso() -> str:
    return datetime.now(timezone.utc).astimezone().isoformat(timespec="seconds")


def load_json(path: str) -> dict[str, Any]:
    with open(path, "r", encoding="utf-8") as handle:
        return json.load(handle)


def load_optional_json(path: str) -> dict[str, Any]:
    if not path or not os.path.exists(path):
        return {}
    try:
        return load_json(path)
    except Exception as error:
        return {"_loadError": str(error), "_path": path}


def load_jsonl(path: str) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    if not os.path.exists(path):
        return rows
    with open(path, "r", encoding="utf-8") as handle:
        for line in handle:
            line = line.strip()
            if not line:
                continue
            try:
                rows.append(json.loads(line))
            except Exception as error:
                rows.append({"_loadError": str(error), "raw": line})
    return rows


def append_jsonl(path: str, payload: dict[str, Any]) -> None:
    os.makedirs(os.path.dirname(path) or ".", exist_ok=True)
    with open(path, "a", encoding="utf-8") as handle:
        handle.write(json.dumps(payload, sort_keys=True) + "\n")


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


def file_url(path: str | None) -> str:
    if not path:
        return ""
    return "file://" + quote(os.path.abspath(path))


def note_id(segment_id: str, index: int) -> str:
    stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    return f"episode1-{segment_id}-note-{stamp}-{index:03d}"


def build_add_record(cockpit: dict[str, Any], notes_path: str, actor: str, scope: str, note: str) -> dict[str, Any]:
    segment = cockpit.get("segment") or {}
    existing_count = len(load_jsonl(notes_path))
    clean_actor = actor.strip() or "Codex"
    clean_scope = scope.strip() or "segment"
    clean_note = note.strip()
    if not clean_note:
        raise ValueError("note cannot be empty")
    return {
        "id": note_id(str(segment.get("segmentId") or "unknown"), existing_count + 1),
        "createdAt": now_iso(),
        "projectSlug": cockpit.get("projectSlug"),
        "episodeSlug": cockpit.get("episodeSlug"),
        "segmentId": segment.get("segmentId"),
        "segmentLabel": segment.get("label"),
        "actor": clean_actor,
        "scope": clean_scope,
        "note": clean_note,
        "source": "selected-review-notes-command",
        "stateImpact": "non-decisional-observation",
        "doesNotMarkReviewComplete": True,
        "doesNotApproveArtifacts": True,
        "doesNotPublish": True,
    }


def build_packet(cockpit_path: str, notes_path: str, output_json: str, output_html: str, output_md: str) -> dict[str, Any]:
    cockpit = load_optional_json(cockpit_path)
    notes = load_jsonl(notes_path)
    segment = cockpit.get("segment") or {}
    segment_id = segment.get("segmentId")
    segment_notes = [note for note in notes if note.get("segmentId") == segment_id]
    other_notes = [note for note in notes if note.get("segmentId") != segment_id]
    media = cockpit.get("media") or {}
    review_state = cockpit.get("reviewState") or {}
    return {
        "packetType": "quipsly-episode1-selected-review-notes",
        "version": "2026-06-20.selected-review-notes.v1",
        "projectSlug": cockpit.get("projectSlug"),
        "episodeSlug": cockpit.get("episodeSlug"),
        "generatedAt": now_iso(),
        "json": output_json,
        "html": output_html,
        "markdown": output_md,
        "sourceCockpitPath": cockpit_path if os.path.exists(cockpit_path) else None,
        "notesLedgerPath": notes_path,
        "segment": segment,
        "reviewState": review_state,
        "mediaSummary": {
            "clipCount": media.get("clipCount"),
            "readyClipCount": media.get("readyClipCount"),
            "contactSheetCount": media.get("contactSheetCount"),
            "audioProbeCount": media.get("audioProbeCount"),
        },
        "currentSegmentNotes": segment_notes,
        "allNoteCount": len(notes),
        "otherSegmentNoteCount": len(other_notes),
        "safeCommands": {
            "openNotes": "script/agentctl.sh episode1-selected-review-notes --html",
            "openCockpit": "script/agentctl.sh episode1-selected-review-cockpit --html",
            "addObservationTemplate": 'script/agentctl.sh episode1-selected-review-note-add "Codex" "visual|audio|story|cut|risk|idea" "Write the observation here. This does not mark review complete."',
            "markSegmentReviewedAfterActualReview": next((row.get("command") for row in cockpit.get("safeCommands") or [] if row.get("label") == "Mark segment reviewed"), None),
        },
        "truth": "These notes are non-decisional review observations. They do not mark review complete, approve artifacts, publish, upload, schedule, or capture receipts.",
    }


def html_page(packet: dict[str, Any]) -> str:
    segment = packet.get("segment") or {}
    review = packet.get("reviewState") or {}
    notes = packet.get("currentSegmentNotes") or []
    commands = packet.get("safeCommands") or {}
    note_cards = "".join(
        f"""
        <article class="note-card">
          <span>{esc(note.get('scope'))} · {esc(note.get('actor'))} · {esc(note.get('createdAt'))}</span>
          <p>{esc(note.get('note'))}</p>
          <small>{esc(note.get('stateImpact'))}</small>
        </article>
        """
        for note in notes
    ) or '<article class="note-card empty"><span>No notes yet</span><p>Add observations while reviewing. Notes are useful; they are not approval.</p></article>'
    command_rows = "".join(
        f"""
        <div class="command-row">
          <div><strong>{esc(label)}</strong><code>{esc(command)}</code></div>
          <button data-copy="{esc(command)}">Copy</button>
        </div>
        """
        for label, command in commands.items() if command
    )
    return f"""<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Episode 1 Selected Review Notes</title>
  <style>
    :root {{ --bg:#efe8d8; --paper:#fff9ed; --ink:#2e251e; --muted:#76695d; --line:rgba(63,45,31,.16); --fern:#2f7656; --gold:#d8ac31; --clay:#a34d38; --river:#2e6f84; --shadow:0 24px 76px rgba(47,34,23,.16); }}
    * {{ box-sizing:border-box; }}
    body {{ margin:0; color:var(--ink); background:radial-gradient(circle at 12% 0%,rgba(216,172,49,.25),transparent 34rem),radial-gradient(circle at 86% 8%,rgba(47,118,86,.18),transparent 34rem),linear-gradient(135deg,#fbf6ea,var(--bg)); font-family:ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif; }}
    main {{ width:min(1180px,calc(100% - 40px)); margin:0 auto; padding:44px 0 70px; }}
    .hero,.panel,.note-card {{ background:rgba(255,249,237,.94); border:1px solid var(--line); border-radius:28px; box-shadow:var(--shadow); }}
    .hero,.panel {{ padding:28px; }}
    .kicker {{ color:#a97524; font-size:.74rem; font-weight:950; letter-spacing:.2em; text-transform:uppercase; }}
    h1 {{ margin:8px 0 10px; font-size:clamp(2.1rem,5.4vw,5rem); line-height:.9; letter-spacing:-.06em; }}
    h2 {{ margin:8px 0; letter-spacing:-.035em; }}
    p,li {{ color:var(--muted); line-height:1.45; }}
    .stats,.grid {{ display:grid; gap:12px; }}
    .stats {{ grid-template-columns:repeat(auto-fit,minmax(150px,1fr)); margin-top:18px; }}
    .stat {{ background:rgba(46,111,132,.11); border:1px solid rgba(46,111,132,.18); border-radius:18px; padding:12px; }}
    .stat strong {{ display:block; font-size:1.25rem; }}
    .grid {{ grid-template-columns:minmax(0,1fr) minmax(320px,.55fr); margin-top:18px; align-items:start; }}
    .note-list,.commands {{ display:grid; gap:10px; }}
    .note-card {{ padding:16px; box-shadow:none; }}
    .note-card span {{ color:var(--river); font-size:.72rem; font-weight:950; letter-spacing:.12em; text-transform:uppercase; }}
    .note-card small {{ color:var(--fern); font-weight:900; }}
    .empty {{ border-style:dashed; }}
    .command-row {{ display:flex; gap:12px; justify-content:space-between; align-items:center; background:rgba(59,45,33,.06); border:1px solid var(--line); border-radius:18px; padding:12px; }}
    code {{ display:block; margin-top:6px; color:#4d3a2c; white-space:pre-wrap; overflow-wrap:anywhere; font-size:.78rem; }}
    button {{ appearance:none; border:0; background:#3b2d21; color:#fff6e8; border-radius:999px; padding:9px 12px; font-weight:950; font-size:.74rem; letter-spacing:.07em; text-transform:uppercase; cursor:pointer; }}
    button.copied {{ background:var(--fern); }}
    @media (max-width:900px) {{ .grid {{ grid-template-columns:1fr; }} }}
  </style>
</head>
<body>
  <main>
    <section class="hero">
      <span class="kicker">Quipsly review observations</span>
      <h1>Notes are not approval.</h1>
      <p>{esc(packet.get('truth'))}</p>
      <div class="stats">
        <div class="stat"><span>Segment</span><strong>{esc(segment.get('segmentId'))}</strong><small>{esc(segment.get('label'))}</small></div>
        <div class="stat"><span>Current notes</span><strong>{esc(len(notes))}</strong></div>
        <div class="stat"><span>Pending review</span><strong>{esc(review.get('pendingReviewItems'))}</strong></div>
        <div class="stat"><span>Reviewed</span><strong>{esc(review.get('reviewedItems'))}</strong></div>
      </div>
    </section>
    <section class="grid">
      <div class="panel">
        <span class="kicker">Current segment notes</span>
        <h2>Capture what you notice</h2>
        <div class="note-list">{note_cards}</div>
      </div>
      <aside class="panel">
        <span class="kicker">Commands</span>
        <h2>Observation first, decision later</h2>
        <div class="commands">{command_rows}</div>
      </aside>
    </section>
  </main>
  <script>
    document.querySelectorAll('button[data-copy]').forEach((button) => {{
      button.addEventListener('click', async () => {{
        const text = button.getAttribute('data-copy') || '';
        try {{
          await navigator.clipboard.writeText(text);
          const old = button.textContent;
          button.textContent = 'Copied';
          button.classList.add('copied');
          setTimeout(() => {{ button.textContent = old; button.classList.remove('copied'); }}, 1300);
        }} catch (error) {{
          window.prompt('Copy command', text);
        }}
      }});
    }});
  </script>
</body>
</html>
"""


def markdown(packet: dict[str, Any]) -> str:
    segment = packet.get("segment") or {}
    lines = [
        "# Episode 1 selected review notes",
        "",
        f"Generated: {packet['generatedAt']}",
        f"Segment: `{segment.get('segmentId')}` {segment.get('label') or ''}",
        "",
        "These notes are observations, not approval.",
        "",
        "## Current segment notes",
        "",
    ]
    notes = packet.get("currentSegmentNotes") or []
    if notes:
        for note in notes:
            lines.append(f"- `{note.get('scope')}` by `{note.get('actor')}` at `{note.get('createdAt')}`: {note.get('note')}")
    else:
        lines.append("- No notes yet.")
    lines.extend(["", "## Truth boundary", "", packet["truth"], ""])
    return "\n".join(lines)


def main() -> int:
    if len(sys.argv) < 6:
        print("usage: episode1_selected_review_notes.py cockpit.json notes.jsonl output.json output.html output.md [--add actor scope note]", file=sys.stderr)
        return 2
    cockpit_path, notes_path, output_json, output_html, output_md = sys.argv[1:6]
    args = sys.argv[6:]
    if args:
        if len(args) != 4 or args[0] != "--add":
            print("usage: episode1_selected_review_notes.py cockpit.json notes.jsonl output.json output.html output.md [--add actor scope note]", file=sys.stderr)
            return 2
        cockpit = load_json(cockpit_path)
        record = build_add_record(cockpit, notes_path, args[1], args[2], args[3])
        append_jsonl(notes_path, record)
    packet = build_packet(cockpit_path, notes_path, output_json, output_html, output_md)
    write_json(output_json, packet)
    write_text(output_html, html_page(packet))
    write_text(output_md, markdown(packet))
    print(output_json)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
