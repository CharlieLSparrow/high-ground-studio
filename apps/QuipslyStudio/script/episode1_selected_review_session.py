#!/usr/bin/env python3
"""Build an interactive guided review session for the current Episode 1 segment.

The session is a local operator surface. It can help a human or agent track that
review steps were performed, but it does not mutate the review ledger. The only
state-changing action remains the explicit copied agentctl command.
"""

from __future__ import annotations

import html
import json
import os
import shlex
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


def shell_quote(value: Any) -> str:
    return shlex.quote("" if value is None else str(value))


def draft_response_command(item: dict[str, Any]) -> str:
    kind = "answer" if item.get("kind") == "question" else "check"
    target = item.get("id")
    if kind == "answer":
        text = f"Answer after actual review: {item.get('label')}"
    else:
        text = f"Completed after actual review: {item.get('label')}"
    return " ".join([
        "script/agentctl.sh",
        "episode1-selected-review-session-draft-add",
        shell_quote("Reviewer Name"),
        shell_quote(kind),
        shell_quote(target),
        shell_quote(text),
    ])


def file_url(path: str | None) -> str:
    if not path:
        return ""
    return "file://" + quote(os.path.abspath(path))


def exists(path: str | None) -> bool:
    return bool(path) and os.path.exists(path)


def media_type(path: str | None, kind: str | None) -> str:
    if kind == "audio":
        if path and path.lower().endswith(".mp3"):
            return "audio/mpeg"
        return "audio/mp4"
    if path and path.lower().endswith(".mov"):
        return "video/quicktime"
    return "video/mp4"


def find_command(cockpit: dict[str, Any], label: str) -> str | None:
    for row in cockpit.get("safeCommands") or []:
        if row.get("label") == label:
            return row.get("command")
    return None


def build_packet(cockpit_path: str, notes_path: str, summary_path: str, output_json: str, output_html: str, output_md: str) -> dict[str, Any]:
    cockpit = load_json(cockpit_path)
    notes = load_optional_json(notes_path)
    summary = load_optional_json(summary_path)
    segment = cockpit.get("segment") or {}
    media = cockpit.get("media") or {}
    clips = media.get("clips") or []
    video_clips = [clip for clip in clips if clip.get("kind") == "video"]
    audio_clips = [clip for clip in clips if clip.get("kind") == "audio"]
    questions = summary.get("recommendedHumanReviewQuestions") or []
    check_items: list[dict[str, Any]] = []
    for clip in video_clips:
        check_items.append({
            "id": f"watch-{clip.get('artifactId')}",
            "label": f"Watch {clip.get('artifactId')} review clip",
            "kind": "video",
            "artifactId": clip.get("artifactId"),
            "required": True,
        })
    for clip in audio_clips:
        check_items.append({
            "id": f"listen-{clip.get('artifactId')}",
            "label": f"Listen to {clip.get('artifactId')} review clip",
            "kind": "audio",
            "artifactId": clip.get("artifactId"),
            "required": True,
        })
    for index, question in enumerate(questions, start=1):
        check_items.append({
            "id": f"question-{index}",
            "label": question,
            "kind": "question",
            "required": True,
        })
    mark_command = find_command(cockpit, "Mark segment reviewed")
    issue_commands = [row for row in cockpit.get("safeCommands") or [] if str(row.get("label", "")).startswith("Mark flagged item issue")]
    return {
        "packetType": "quipsly-episode1-selected-review-session",
        "version": "2026-06-20.selected-review-session.v1",
        "projectSlug": cockpit.get("projectSlug"),
        "episodeSlug": cockpit.get("episodeSlug"),
        "generatedAt": now_iso(),
        "json": output_json,
        "html": output_html,
        "markdown": output_md,
        "sourceCockpitPath": cockpit_path,
        "sourceNotesPath": notes_path if os.path.exists(notes_path) else None,
        "sourceMachineSummaryPath": summary_path if os.path.exists(summary_path) else None,
        "segment": segment,
        "gate": cockpit.get("gate"),
        "reviewState": cockpit.get("reviewState"),
        "media": media,
        "currentSegmentNotes": notes.get("currentSegmentNotes") or [],
        "machineObservationScope": summary.get("agentObservationScope") or {},
        "machineObservations": summary.get("observations") or {},
        "reviewQuestions": questions,
        "checkItems": check_items,
        "safeCommands": {
            "openSession": "script/agentctl.sh episode1-selected-review-session --html",
            "openCockpit": "script/agentctl.sh episode1-selected-review-cockpit --html",
            "openNotes": "script/agentctl.sh episode1-selected-review-notes --html",
            "openDraftResponses": "script/agentctl.sh episode1-selected-review-session-draft --html",
            "addObservation": 'script/agentctl.sh episode1-selected-review-note-add "Reviewer Name" "visual|audio|story|cut|risk|idea" "Observation from actual review."',
            "addDraftResponse": 'script/agentctl.sh episode1-selected-review-session-draft-add "Reviewer Name" note general "Observation or answer from actual review."',
            "markSegmentReviewedAfterChecklistAndActualReview": mark_command,
            "markIssueCommands": issue_commands,
        },
        "truth": "This guided session helps track actual review work locally. It does not mark the segment reviewed, approve artifacts, publish, upload, schedule, or capture receipts. Copy and run a state-changing command only after the review is truly done.",
    }


def media_card(clip: dict[str, Any]) -> str:
    kind = clip.get("kind")
    review_path = clip.get("reviewPath")
    contact_path = clip.get("contactSheetPath")
    status = "ready" if clip.get("status") == "exists" and exists(review_path) else "missing"
    if kind == "audio":
        player = f'<audio controls preload="metadata"><source src="{file_url(review_path)}" type="{media_type(review_path, kind)}"></audio>' if status == "ready" else '<div class="missing">Audio clip missing</div>'
    else:
        player = f'<video controls preload="metadata"><source src="{file_url(review_path)}" type="{media_type(review_path, kind)}"></video>' if status == "ready" else '<div class="missing">Video clip missing</div>'
    sheet = f'<a href="{file_url(contact_path)}"><img src="{file_url(contact_path)}" alt="Contact sheet for {esc(clip.get("artifactId"))}"></a>' if exists(contact_path) else ''
    probe = clip.get("audioProbe") or {}
    probe_html = f'<p class="probe">Audio probe: mean {esc(probe.get("meanVolumeDb"))} dB, max {esc(probe.get("maxVolumeDb"))} dB</p>' if probe else ''
    return f"""
    <article class="media-card {esc(status)}">
      <h3>{esc(clip.get('artifactId'))}</h3>
      <p>{esc(kind)} · {esc(status)}</p>
      {player}
      {sheet}
      {probe_html}
    </article>
    """


def html_page(packet: dict[str, Any]) -> str:
    segment = packet.get("segment") or {}
    media = packet.get("media") or {}
    clips = media.get("clips") or []
    commands = packet.get("safeCommands") or {}
    check_html = "".join(
        f"""
        <div class="check-row">
          <input type="checkbox" data-review-check="{esc(item.get('id'))}">
          <div>
            <span>{esc(item.get('label'))}</span>
            <div class="draft-command">
              <code>{esc(draft_response_command(item))}</code>
              <button data-copy="{esc(draft_response_command(item))}">Copy draft response</button>
            </div>
          </div>
        </div>
        """
        for item in packet.get("checkItems") or []
    )
    notes_html = "".join(f"<li><strong>{esc(note.get('scope'))}</strong>: {esc(note.get('note'))}</li>" for note in packet.get("currentSegmentNotes") or []) or "<li>No notes yet.</li>"
    observations = packet.get("machineObservations") or {}
    scope = packet.get("machineObservationScope") or {}
    obs_html = "".join(
        f"<article class='mini-card'><span>{esc(kind)}</span><ul>{''.join(f'<li>{esc(note)}</li>' for note in notes)}</ul></article>"
        for kind, notes in observations.items()
        if notes
    ) or "<p>No machine observations yet.</p>"
    scope_html = "".join(f"<li><code>{esc(key)}</code>: {esc(value)}</li>" for key, value in scope.items())
    issue_command_html = "".join(
        f"""
        <div class="command-row">
          <div><strong>{esc(row.get('label'))}</strong><code>{esc(row.get('command'))}</code><p>{esc(row.get('caution'))}</p></div>
          <button data-copy="{esc(row.get('command'))}">Copy issue command</button>
        </div>
        """
        for row in commands.get("markIssueCommands") or []
    )
    mark_command = commands.get("markSegmentReviewedAfterChecklistAndActualReview") or ""
    add_note_command = commands.get("addObservation") or ""
    open_draft_command = commands.get("openDraftResponses") or ""
    add_draft_command = commands.get("addDraftResponse") or ""
    storage_key = f"quipsly-review-session-{packet.get('episodeSlug')}-{segment.get('segmentId')}"
    return f"""<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Episode 1 Guided Review Session</title>
  <style>
    :root {{ --bg:#efe8d8; --paper:#fff9ed; --ink:#2e251e; --muted:#76695d; --line:rgba(63,45,31,.16); --fern:#2f7656; --gold:#d8ac31; --clay:#a34d38; --river:#2e6f84; --shadow:0 24px 76px rgba(47,34,23,.16); }}
    * {{ box-sizing:border-box; }}
    body {{ margin:0; color:var(--ink); background:radial-gradient(circle at 12% 0%,rgba(216,172,49,.25),transparent 34rem),radial-gradient(circle at 86% 8%,rgba(47,118,86,.18),transparent 34rem),linear-gradient(135deg,#fbf6ea,var(--bg)); font-family:ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif; }}
    main {{ width:min(1440px,calc(100% - 36px)); margin:0 auto; padding:34px 0 70px; }}
    .hero,.panel,.media-card,.mini-card {{ background:rgba(255,249,237,.94); border:1px solid var(--line); border-radius:28px; box-shadow:var(--shadow); }}
    .hero,.panel {{ padding:24px; }}
    .hero {{ border-left:10px solid var(--clay); }}
    .kicker {{ color:#a97524; font-size:.74rem; font-weight:950; letter-spacing:.2em; text-transform:uppercase; }}
    h1 {{ margin:8px 0 10px; font-size:clamp(2.1rem,5vw,4.7rem); line-height:.9; letter-spacing:-.06em; }}
    h2,h3 {{ margin:8px 0; letter-spacing:-.035em; }}
    p,li,.check-row span {{ color:var(--muted); line-height:1.45; }}
    .grid {{ display:grid; grid-template-columns:minmax(0,1.2fr) minmax(360px,.8fr); gap:18px; align-items:start; margin-top:18px; }}
    .media-grid {{ display:grid; grid-template-columns:repeat(auto-fit,minmax(280px,1fr)); gap:14px; }}
    .media-card,.mini-card {{ padding:14px; box-shadow:none; }}
    video,audio,img {{ width:100%; border-radius:18px; background:#181513; border:1px solid rgba(255,255,255,.12); }}
    img {{ margin-top:10px; }}
    .check-list,.commands {{ display:grid; gap:10px; }}
    .check-row {{ display:grid; grid-template-columns:auto 1fr; gap:10px; align-items:start; padding:12px; border-radius:18px; border:1px solid var(--line); background:rgba(59,45,33,.06); }}
    .check-row input {{ margin-top:4px; transform:scale(1.25); }}
    .draft-command {{ display:grid; grid-template-columns:minmax(0,1fr) auto; gap:10px; align-items:center; margin-top:8px; }}
    .status-pill {{ display:inline-flex; border-radius:999px; padding:8px 12px; font-weight:950; background:rgba(163,77,56,.14); color:var(--clay); }}
    .status-pill.ready {{ background:rgba(47,118,86,.14); color:var(--fern); }}
    .command-row {{ display:flex; gap:12px; justify-content:space-between; align-items:center; background:rgba(59,45,33,.06); border:1px solid var(--line); border-radius:18px; padding:12px; }}
    code {{ display:block; margin-top:6px; color:#4d3a2c; white-space:pre-wrap; overflow-wrap:anywhere; font-size:.78rem; }}
    button {{ appearance:none; border:0; background:#3b2d21; color:#fff6e8; border-radius:999px; padding:9px 12px; font-weight:950; font-size:.74rem; letter-spacing:.07em; text-transform:uppercase; cursor:pointer; }}
    button:disabled {{ opacity:.4; cursor:not-allowed; }}
    button.copied {{ background:var(--fern); }}
    .probe {{ color:var(--river); font-weight:900; }}
    @media (max-width:980px) {{ .grid {{ grid-template-columns:1fr; }} }}
  </style>
</head>
<body>
  <main>
    <section class="hero">
      <span class="kicker">Quipsly guided review session</span>
      <h1>Review first. Ledger second.</h1>
      <p>{esc(packet.get('truth'))}</p>
      <p><strong>Segment:</strong> {esc(segment.get('segmentId'))} · {esc(segment.get('label'))}</p>
      <span id="review-status" class="status-pill">Checklist incomplete</span>
    </section>
    <section class="grid">
      <div class="panel">
        <span class="kicker">Media to review</span>
        <h2>Watch and listen here</h2>
        <div class="media-grid">{''.join(media_card(clip) for clip in clips)}</div>
        <section class="panel" style="margin-top:18px; box-shadow:none;">
          <span class="kicker">Codex observations</span>
          <h2>Useful notes, not a pass</h2>
          {obs_html}
          <h3>Agent limits</h3>
          <ul>{scope_html}</ul>
        </section>
      </div>
      <aside class="panel">
        <span class="kicker">Actual review checklist</span>
        <h2>Do these before changing state</h2>
        <p>Each row has two jobs: the checkbox tracks this browser session, and the draft-response command records durable review evidence without changing the official ledger.</p>
        <div class="check-list">{check_html}</div>
        <section style="margin-top:18px;">
          <h2>Notes already captured</h2>
          <ul>{notes_html}</ul>
          <div class="command-row">
            <div><strong>Open durable draft responses</strong><code>{esc(open_draft_command)}</code></div>
            <button data-copy="{esc(open_draft_command)}">Copy draft page command</button>
          </div>
          <div class="command-row">
            <div><strong>Add general draft response</strong><code>{esc(add_draft_command)}</code></div>
            <button data-copy="{esc(add_draft_command)}">Copy draft command</button>
          </div>
          <div class="command-row">
            <div><strong>Add observation</strong><code>{esc(add_note_command)}</code></div>
            <button data-copy="{esc(add_note_command)}">Copy note command</button>
          </div>
        </section>
        <section style="margin-top:18px;">
          <h2>If review is clean</h2>
          <div class="command-row">
            <div><strong>Mark segment reviewed</strong><code>{esc(mark_command)}</code><p>Enabled only after this page's checklist is complete. Still use judgment.</p></div>
            <button id="copy-reviewed" data-copy="{esc(mark_command)}" disabled>Copy reviewed command</button>
          </div>
        </section>
        <section style="margin-top:18px;">
          <h2>If review finds a problem</h2>
          <div class="commands">{issue_command_html or '<p>No issue commands generated for this segment.</p>'}</div>
        </section>
      </aside>
    </section>
  </main>
  <script>
    const storageKey = {json.dumps(storage_key)};
    const boxes = Array.from(document.querySelectorAll('[data-review-check]'));
    const status = document.getElementById('review-status');
    const reviewedButton = document.getElementById('copy-reviewed');
    function loadState() {{
      try {{ return JSON.parse(localStorage.getItem(storageKey) || '{{}}'); }} catch (error) {{ return {{}}; }}
    }}
    function saveState(state) {{ localStorage.setItem(storageKey, JSON.stringify(state)); }}
    function render() {{
      const state = loadState();
      boxes.forEach((box) => {{ box.checked = Boolean(state[box.dataset.reviewCheck]); }});
      const complete = boxes.length > 0 && boxes.every((box) => box.checked);
      status.textContent = complete ? 'Checklist complete; command may be copied' : `Checklist incomplete (${{boxes.filter((box) => box.checked).length}}/${{boxes.length}})`;
      status.classList.toggle('ready', complete);
      reviewedButton.disabled = !complete;
    }}
    boxes.forEach((box) => {{
      box.addEventListener('change', () => {{
        const state = loadState();
        state[box.dataset.reviewCheck] = box.checked;
        saveState(state);
        render();
      }});
    }});
    document.querySelectorAll('button[data-copy]').forEach((button) => {{
      button.addEventListener('click', async () => {{
        if (button.disabled) return;
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
    render();
  </script>
</body>
</html>
"""


def markdown(packet: dict[str, Any]) -> str:
    segment = packet.get("segment") or {}
    lines = [
        "# Episode 1 guided selected review session",
        "",
        f"Generated: {packet['generatedAt']}",
        f"Segment: `{segment.get('segmentId')}` {segment.get('label') or ''}",
        "",
        packet["truth"],
        "",
        "## Checklist",
        "",
    ]
    for item in packet.get("checkItems") or []:
        lines.append(f"- [ ] {item.get('label')}")
    lines.extend(["", "## Commands", "", f"- Open session: `{packet.get('safeCommands', {}).get('openSession')}`"])
    return "\n".join(lines)


def main() -> int:
    if len(sys.argv) != 7:
        print("usage: episode1_selected_review_session.py cockpit.json notes.json machine-summary.json output.json output.html output.md", file=sys.stderr)
        return 2
    cockpit_path, notes_path, summary_path, output_json, output_html, output_md = sys.argv[1:7]
    packet = build_packet(cockpit_path, notes_path, summary_path, output_json, output_html, output_md)
    write_json(output_json, packet)
    write_text(output_html, html_page(packet))
    write_text(output_md, markdown(packet))
    print(output_json)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
