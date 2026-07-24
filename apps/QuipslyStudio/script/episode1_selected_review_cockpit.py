#!/usr/bin/env python3
"""Build a single human/agent cockpit for Episode 1 selected artifact review.

The cockpit is an operator surface, not a reviewer. It gathers the strict gate,
next-step packet, review index, and current focused segment pack into one calm
page with playable derived clips and copyable safe commands.
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


def exists(path: str | None) -> bool:
    return bool(path) and os.path.exists(path)


def media_type(path: str | None, kind: str | None) -> str:
    if kind == "audio":
        return "audio/mp4"
    if not path:
        return "video/mp4"
    lower = path.lower()
    if lower.endswith(".mov"):
        return "video/quicktime"
    if lower.endswith(".m4a"):
        return "audio/mp4"
    if lower.endswith(".mp3"):
        return "audio/mpeg"
    return "video/mp4"


def collect_commands(gate: dict[str, Any], pack: dict[str, Any], index: dict[str, Any]) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []

    def add(label: str, command: Any, caution: str = "") -> None:
        if not command:
            return
        if isinstance(command, list):
            for index_, item in enumerate(command, start=1):
                if item:
                    rows.append({"label": f"{label} {index_}", "command": item, "caution": caution})
        else:
            rows.append({"label": label, "command": command, "caution": caution})

    gate_commands = gate.get("safeCommands") or {}
    pack_commands = pack.get("safeCommands") or {}
    index_commands = index.get("safeCommands") or {}
    add("Open cockpit", "script/agentctl.sh episode1-selected-review-cockpit --html")
    add("Open guided review session", "script/agentctl.sh episode1-selected-review-session --html")
    add("Open machine summary", "script/agentctl.sh episode1-selected-machine-review-summary --html")
    add("Open review notes", "script/agentctl.sh episode1-selected-review-notes --html")
    add("Add observation", 'script/agentctl.sh episode1-selected-review-note-add "Codex" "visual|audio|story|cut|risk|idea" "Write the observation here. This does not mark review complete."')
    add("Open strict gate", gate_commands.get("openGate"))
    add("Open review index", gate_commands.get("openReviewIndex") or index_commands.get("openIndex"))
    add("Open focused tray", gate_commands.get("openCurrentRecommendedPack") or pack_commands.get("openPack"))
    add("Mark segment reviewed", gate_commands.get("markRecommendedSegmentReviewedAfterRealReview") or pack_commands.get("markSegmentReviewedAfterRealReview"), "Only after actual watch/listen review.")
    add("Mark flagged item issue", gate_commands.get("markFlaggedItemsIssueAfterRealReview") or pack_commands.get("markIssueAfterRealReview"), "Only after actual watch/listen review finds the issue.")
    add("Record final pass", gate_commands.get("recordFinalArtifactPassIfAllowed"), "Only appears when the gate allows it.")
    return rows


def build_packet(gate_path: str, next_path: str, index_path: str, pack_path: str, output_json: str, output_html: str, output_md: str) -> dict[str, Any]:
    gate = load_optional_json(gate_path)
    next_packet = load_optional_json(next_path)
    index = load_optional_json(index_path)
    pack = load_optional_json(pack_path)
    review_state = gate.get("reviewState") or {}
    gate_state = gate.get("gate") or {}
    segment_id = pack.get("segmentId") or review_state.get("recommendedSegmentId") or (next_packet.get("nextStep") or {}).get("recommendedSegmentId")
    segment_label = pack.get("segmentLabel") or review_state.get("recommendedSegmentLabel") or (next_packet.get("nextStep") or {}).get("recommendedSegmentLabel")
    clips = pack.get("clips") or []
    ready_clips = [clip for clip in clips if clip.get("status") == "exists" and exists(clip.get("reviewPath"))]
    contact_sheets = [clip.get("contactSheetPath") for clip in clips if exists(clip.get("contactSheetPath"))]
    audio_probes = [clip for clip in clips if clip.get("audioProbe")]
    machine_summary_path = os.path.join(os.path.dirname(output_json), "episode-1-selected-machine-review-summary.json")
    machine_summary = load_optional_json(machine_summary_path)
    return {
        "packetType": "quipsly-episode1-selected-review-cockpit",
        "version": "2026-06-20.selected-review-cockpit.v1",
        "projectSlug": gate.get("projectSlug") or pack.get("projectSlug"),
        "episodeSlug": gate.get("episodeSlug") or pack.get("episodeSlug"),
        "generatedAt": now_iso(),
        "json": output_json,
        "html": output_html,
        "markdown": output_md,
        "sourceGatePath": gate_path if os.path.exists(gate_path) else None,
        "sourceNextPath": next_path if os.path.exists(next_path) else None,
        "sourceIndexPath": index_path if os.path.exists(index_path) else None,
        "sourcePackPath": pack_path if os.path.exists(pack_path) else None,
        "sourceMachineReviewSummaryPath": machine_summary_path if machine_summary and not machine_summary.get("_loadError") else None,
        "gate": gate_state,
        "reviewState": review_state,
        "nextStep": next_packet.get("nextStep"),
        "segment": {
            "segmentId": segment_id,
            "label": segment_label,
            "startSeconds": pack.get("startSeconds"),
            "endSeconds": pack.get("endSeconds"),
            "durationSeconds": None if pack.get("startSeconds") is None or pack.get("endSeconds") is None else round(float(pack.get("endSeconds")) - float(pack.get("startSeconds")), 3),
        },
        "media": {
            "clipCount": len(clips),
            "readyClipCount": len(ready_clips),
            "contactSheetCount": len(contact_sheets),
            "audioProbeCount": len(audio_probes),
            "clips": clips,
        },
        "machineReviewSummary": {
            "available": bool(machine_summary and not machine_summary.get("_loadError")),
            "path": machine_summary_path if machine_summary and not machine_summary.get("_loadError") else None,
            "agentObservationScope": machine_summary.get("agentObservationScope") or {},
            "observations": machine_summary.get("observations") or {},
            "recommendedHumanReviewQuestions": machine_summary.get("recommendedHumanReviewQuestions") or [],
            "truth": machine_summary.get("truth"),
            "loadError": machine_summary.get("_loadError"),
        },
        "safeCommands": collect_commands(gate, pack, index),
        "truth": "This cockpit gathers current selected-review evidence into one operator surface. It does not watch or listen for you, mark review complete, approve artifacts, publish, upload, schedule, or capture receipts.",
    }


def media_card(clip: dict[str, Any]) -> str:
    kind = clip.get("kind")
    review_path = clip.get("reviewPath")
    contact_path = clip.get("contactSheetPath")
    source_path = clip.get("sourcePath")
    status = "ready" if clip.get("status") == "exists" and exists(review_path) else "missing"
    if kind == "audio":
        player = f'<audio controls preload="metadata"><source src="{file_url(review_path)}" type="{media_type(review_path, kind)}"></audio>' if status == "ready" else '<div class="missing">Audio review clip missing</div>'
    else:
        player = f'<video controls preload="metadata"><source src="{file_url(review_path)}" type="{media_type(review_path, kind)}"></video>' if status == "ready" else '<div class="missing">Video review clip missing</div>'
    sheet = f'<a href="{file_url(contact_path)}"><img src="{file_url(contact_path)}" alt="Contact sheet for {esc(clip.get("artifactId"))}"></a>' if exists(contact_path) else ''
    probe = clip.get("audioProbe") or {}
    probe_html = ''
    if probe:
        probe_html = f'<p class="probe">Audio: mean {esc(probe.get("meanVolumeDb"))} dB, max {esc(probe.get("maxVolumeDb"))} dB</p>'
    return f"""
    <article class="media-card {esc(status)}">
      <div class="media-head">
        <span>{esc(kind)}</span>
        <strong>{esc(clip.get('artifactId'))}</strong>
        <em>{esc(status)}</em>
      </div>
      {player}
      {sheet}
      {probe_html}
      <p class="path">Review: {esc(review_path)}</p>
      <p class="path">Source: {esc(source_path)}</p>
    </article>
    """


def html_page(packet: dict[str, Any]) -> str:
    gate = packet.get("gate") or {}
    review = packet.get("reviewState") or {}
    segment = packet.get("segment") or {}
    media = packet.get("media") or {}
    machine = packet.get("machineReviewSummary") or {}
    clips = media.get("clips") or []
    command_html = "".join(
        f"""
        <div class="command-row">
          <div><strong>{esc(row.get('label'))}</strong><code>{esc(row.get('command'))}</code>{f'<p>{esc(row.get("caution"))}</p>' if row.get('caution') else ''}</div>
          <button data-copy="{esc(row.get('command'))}">Copy</button>
        </div>
        """
        for row in packet.get("safeCommands") or []
    )
    blocker_html = "".join(f"<li><strong>{esc(b.get('code'))}</strong>: {esc(b.get('message'))}</li>" for b in gate.get("blockers") or [])
    machine_observations = machine.get("observations") or {}
    machine_obs_html = "".join(
        f"""
        <article class="machine-card">
          <span>{esc(kind)}</span>
          <ul>{''.join(f'<li>{esc(note)}</li>' for note in notes)}</ul>
        </article>
        """
        for kind, notes in machine_observations.items()
        if notes
    )
    machine_questions_html = "".join(f"<li>{esc(question)}</li>" for question in machine.get("recommendedHumanReviewQuestions") or [])
    machine_scope_html = "".join(f"<li><code>{esc(key)}</code>: {esc(value)}</li>" for key, value in (machine.get("agentObservationScope") or {}).items())
    machine_panel = ""
    if machine.get("available"):
        machine_panel = f"""
      <div class="panel machine-panel">
        <span class="kicker">Codex observation summary</span>
        <h2>Useful notes, not a pass</h2>
        <p>{esc(machine.get('truth'))}</p>
        <div class="machine-grid">
          <div>
            <h3>Observed</h3>
            {machine_obs_html or '<p>No machine observations yet.</p>'}
          </div>
          <div>
            <h3>Still needs playback review</h3>
            <ul>{machine_questions_html or '<li>No questions recorded yet.</li>'}</ul>
            <h3>Agent limits</h3>
            <ul>{machine_scope_html}</ul>
          </div>
        </div>
      </div>
        """
    state_class = "allowed" if gate.get("allowedToRecordFinalPass") else "blocked"
    return f"""<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Episode 1 Selected Review Cockpit</title>
  <style>
    :root {{ --bg:#efe8d8; --paper:#fff9ed; --ink:#2e251e; --muted:#76695d; --line:rgba(63,45,31,.16); --fern:#2f7656; --moss:#4d6f3d; --gold:#d8ac31; --clay:#a34d38; --river:#2e6f84; --shadow:0 24px 76px rgba(47,34,23,.16); }}
    * {{ box-sizing:border-box; }}
    body {{ margin:0; color:var(--ink); background:radial-gradient(circle at 12% 0%,rgba(216,172,49,.25),transparent 34rem),radial-gradient(circle at 86% 8%,rgba(47,118,86,.2),transparent 34rem),linear-gradient(135deg,#fbf6ea,var(--bg)); font-family:ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif; }}
    main {{ width:min(1440px,calc(100% - 36px)); margin:0 auto; padding:34px 0 70px; }}
    .hero,.panel,.media-card {{ background:rgba(255,249,237,.94); border:1px solid var(--line); border-radius:28px; box-shadow:var(--shadow); }}
    .hero {{ padding:28px; border-left:10px solid var(--clay); }}
    .hero.allowed {{ border-left-color:var(--fern); }}
    .kicker {{ color:#a97524; font-size:.74rem; font-weight:950; letter-spacing:.2em; text-transform:uppercase; }}
    h1 {{ margin:8px 0 10px; font-size:clamp(2.1rem,5.4vw,5rem); line-height:.9; letter-spacing:-.06em; }}
    h2 {{ margin:6px 0; letter-spacing:-.035em; }}
    p,li {{ color:var(--muted); line-height:1.45; }}
    .stats {{ display:grid; grid-template-columns:repeat(auto-fit,minmax(150px,1fr)); gap:10px; margin-top:18px; }}
    .stat {{ background:rgba(46,111,132,.11); border:1px solid rgba(46,111,132,.18); border-radius:18px; padding:12px; }}
    .stat strong {{ display:block; font-size:1.25rem; }}
    .grid {{ display:grid; grid-template-columns:minmax(0,1.45fr) minmax(320px,.55fr); gap:18px; align-items:start; margin-top:18px; }}
    .panel {{ padding:18px; }}
    .media-grid {{ display:grid; grid-template-columns:repeat(auto-fit,minmax(280px,1fr)); gap:14px; }}
    .media-card {{ padding:14px; box-shadow:none; }}
    .media-card video,.media-card audio,.media-card img {{ width:100%; border-radius:18px; background:#181513; border:1px solid rgba(255,255,255,.12); }}
    .media-card img {{ margin-top:10px; }}
    .media-head {{ display:grid; grid-template-columns:auto 1fr auto; gap:8px; align-items:center; margin-bottom:10px; }}
    .media-head span,.media-head em {{ border-radius:999px; padding:5px 8px; font-size:.68rem; font-weight:950; letter-spacing:.12em; text-transform:uppercase; background:rgba(47,118,86,.14); color:var(--fern); font-style:normal; }}
    .media-head em {{ background:rgba(216,172,49,.18); color:#806215; }}
    .media-card.missing .media-head em {{ background:rgba(163,77,56,.16); color:var(--clay); }}
    .path {{ font-size:.72rem; overflow-wrap:anywhere; }}
    .probe {{ font-size:.85rem; font-weight:850; color:var(--moss); }}
    .missing {{ min-height:180px; display:grid; place-items:center; border-radius:18px; background:rgba(163,77,56,.1); color:var(--clay); font-weight:950; }}
    .commands {{ display:grid; gap:10px; }}
    .machine-panel {{ margin-top:18px; }}
    .machine-grid {{ display:grid; grid-template-columns:1fr 1fr; gap:14px; }}
    .machine-card {{ background:rgba(59,45,33,.06); border:1px solid var(--line); border-radius:18px; padding:12px; margin-bottom:10px; }}
    .machine-card span {{ color:var(--river); font-size:.7rem; font-weight:950; letter-spacing:.14em; text-transform:uppercase; }}
    .command-row {{ display:flex; gap:12px; justify-content:space-between; align-items:center; background:rgba(59,45,33,.06); border:1px solid var(--line); border-radius:18px; padding:12px; }}
    code {{ display:block; margin-top:6px; color:#4d3a2c; white-space:pre-wrap; overflow-wrap:anywhere; font-size:.78rem; }}
    button {{ appearance:none; border:0; background:#3b2d21; color:#fff6e8; border-radius:999px; padding:9px 12px; font-weight:950; font-size:.74rem; letter-spacing:.07em; text-transform:uppercase; cursor:pointer; }}
    button.copied {{ background:var(--fern); }}
    @media (max-width:980px) {{ .grid,.machine-grid {{ grid-template-columns:1fr; }} }}
  </style>
</head>
<body>
  <main>
    <section class="hero {esc(state_class)}">
      <span class="kicker">Quipsly selected review cockpit</span>
      <h1>{esc(gate.get('humanState'))}</h1>
      <p>{esc(packet.get('truth'))}</p>
      <div class="stats">
        <div class="stat"><span>Next segment</span><strong>{esc(segment.get('segmentId'))}</strong><small>{esc(segment.get('label'))}</small></div>
        <div class="stat"><span>Pending</span><strong>{esc(review.get('pendingReviewItems'))}</strong></div>
        <div class="stat"><span>Reviewed</span><strong>{esc(review.get('reviewedItems'))}</strong></div>
        <div class="stat"><span>Issues</span><strong>{esc(review.get('issueItems'))}</strong></div>
        <div class="stat"><span>Clips</span><strong>{esc(media.get('readyClipCount'))}/{esc(media.get('clipCount'))}</strong></div>
      </div>
    </section>
    <section class="grid">
      <div class="panel">
        <span class="kicker">Review media</span>
        <h2>Watch/listen before touching the ledger</h2>
        <div class="media-grid">{''.join(media_card(clip) for clip in clips)}</div>
        {machine_panel}
      </div>
      <aside class="panel">
        <span class="kicker">Gate and commands</span>
        <h2>Move from evidence</h2>
        <ul>{blocker_html or '<li>No blockers. Final artifact pass may be recorded, but publication is still separate.</li>'}</ul>
        <div class="commands">{command_html}</div>
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
    gate = packet.get("gate") or {}
    review = packet.get("reviewState") or {}
    segment = packet.get("segment") or {}
    media = packet.get("media") or {}
    machine = packet.get("machineReviewSummary") or {}
    lines = [
        "# Episode 1 selected review cockpit",
        "",
        f"Generated: {packet['generatedAt']}",
        "",
        f"State: **{gate.get('humanState')}**",
        f"Segment: `{segment.get('segmentId')}` {segment.get('label') or ''}",
        f"Pending: `{review.get('pendingReviewItems')}`, reviewed: `{review.get('reviewedItems')}`, issues: `{review.get('issueItems')}`",
        f"Ready clips: `{media.get('readyClipCount')}` / `{media.get('clipCount')}`",
        "",
        "## Review media",
        "",
    ]
    for clip in media.get("clips") or []:
        lines.append(f"- `{clip.get('artifactId')}` {clip.get('kind')} status `{clip.get('status')}` review `{clip.get('reviewPath')}`")
    if machine.get("available"):
        lines.extend(["", "## Codex observation summary", "", machine.get("truth") or ""])
        for kind, notes in (machine.get("observations") or {}).items():
            if notes:
                lines.append(f"### {kind}")
                for note in notes:
                    lines.append(f"- {note}")
        lines.extend(["", "### Still needs playback review"])
        for question in machine.get("recommendedHumanReviewQuestions") or []:
            lines.append(f"- {question}")
    lines.extend(["", "## Truth boundary", "", packet["truth"], ""])
    return "\n".join(lines)


def main() -> int:
    if len(sys.argv) != 8:
        print("usage: episode1_selected_review_cockpit.py gate.json next.json index.json pack.json output.json output.html output.md", file=sys.stderr)
        return 2
    gate_path, next_path, index_path, pack_path, output_json, output_html, output_md = sys.argv[1:8]
    packet = build_packet(gate_path, next_path, index_path, pack_path, output_json, output_html, output_md)
    write_json(output_json, packet)
    write_text(output_html, html_page(packet))
    write_text(output_md, markdown(packet))
    print(output_json)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
