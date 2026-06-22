#!/usr/bin/env python3
"""Summarize agent-visible Episode 1 selected review observations.

This packet is deliberately not a review decision. It separates what Codex could
inspect from what still requires actual watch/listen review.
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


def notes_by_scope(notes: list[dict[str, Any]]) -> dict[str, list[dict[str, Any]]]:
    grouped: dict[str, list[dict[str, Any]]] = {}
    for note in notes:
        grouped.setdefault(str(note.get("scope") or "observation"), []).append(note)
    return grouped


def build_packet(cockpit_path: str, notes_path: str, output_json: str, output_html: str, output_md: str) -> dict[str, Any]:
    cockpit = load_json(cockpit_path)
    notes_packet = load_json(notes_path)
    notes = notes_packet.get("currentSegmentNotes") or []
    scoped = notes_by_scope(notes)
    visual_notes = scoped.get("visual", [])
    audio_notes = scoped.get("audio", [])
    tooling_notes = scoped.get("tooling", [])
    segment = cockpit.get("segment") or {}
    media = cockpit.get("media") or {}
    gate = cockpit.get("gate") or {}
    review_state = cockpit.get("reviewState") or {}
    return {
        "packetType": "quipsly-episode1-selected-machine-review-summary",
        "version": "2026-06-20.selected-machine-review-summary.v1",
        "projectSlug": cockpit.get("projectSlug"),
        "episodeSlug": cockpit.get("episodeSlug"),
        "generatedAt": now_iso(),
        "json": output_json,
        "html": output_html,
        "markdown": output_md,
        "sourceCockpitPath": cockpit_path,
        "sourceNotesPath": notes_path,
        "segment": segment,
        "gateState": gate.get("humanState"),
        "allowedToRecordFinalPass": gate.get("allowedToRecordFinalPass"),
        "reviewState": review_state,
        "agentObservationScope": {
            "didInspectContactSheets": len(visual_notes) > 0,
            "didInspectAudioProbe": len(audio_notes) > 0,
            "didWatchFullPlayback": False,
            "didListenFullAudio": False,
            "didMarkReviewComplete": False,
            "didApproveArtifacts": False,
            "didPublish": False,
        },
        "mediaSummary": {
            "readyClipCount": media.get("readyClipCount"),
            "clipCount": media.get("clipCount"),
            "contactSheetCount": media.get("contactSheetCount"),
            "audioProbeCount": media.get("audioProbeCount"),
        },
        "observations": {
            "visual": [note.get("note") for note in visual_notes],
            "audio": [note.get("note") for note in audio_notes],
            "tooling": [note.get("note") for note in tooling_notes],
        },
        "recommendedHumanReviewQuestions": [
            "Does the early source/reference footage in the 16:9 contact sheet belong in this selected segment?",
            "Is the segment too dark for comfortable publication, or acceptable given the episode style?",
            "Does the 9:16 tight crop keep the speaker's face comfortably placed during real playback?",
            "Does the audio sound intelligible and comfortable despite the max-volume probe reaching -0.0 dB?",
            "Are there any story/cut issues that contact sheets cannot reveal?",
        ],
        "safeCommands": {
            "openCockpit": "script/agentctl.sh episode1-selected-review-cockpit --html",
            "openNotes": "script/agentctl.sh episode1-selected-review-notes --html",
            "openMachineSummary": "script/agentctl.sh episode1-selected-machine-review-summary --html",
            "markSegmentReviewedAfterActualPlaybackReview": next((row.get("command") for row in cockpit.get("safeCommands") or [] if row.get("label") == "Mark segment reviewed"), None),
        },
        "truth": "This is an agent-visible observation summary from contact sheets, metadata, and notes. It is not full playback review, not approval, not publication readiness, and not a receipt.",
    }


def html_page(packet: dict[str, Any]) -> str:
    segment = packet.get("segment") or {}
    scope = packet.get("agentObservationScope") or {}
    observations = packet.get("observations") or {}
    questions = "".join(f"<li>{esc(q)}</li>" for q in packet.get("recommendedHumanReviewQuestions") or [])
    obs_html = "".join(
        f"""
        <article class="obs-card">
          <span>{esc(kind)}</span>
          <ul>{''.join(f'<li>{esc(note)}</li>' for note in notes)}</ul>
        </article>
        """
        for kind, notes in observations.items() if notes
    )
    scope_html = "".join(f"<li><code>{esc(key)}</code>: {esc(value)}</li>" for key, value in scope.items())
    return f"""<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Episode 1 Machine Observation Summary</title>
  <style>
    :root {{ --bg:#efe8d8; --paper:#fff9ed; --ink:#2e251e; --muted:#76695d; --line:rgba(63,45,31,.16); --fern:#2f7656; --gold:#d8ac31; --clay:#a34d38; --river:#2e6f84; --shadow:0 24px 76px rgba(47,34,23,.16); }}
    * {{ box-sizing:border-box; }}
    body {{ margin:0; color:var(--ink); background:radial-gradient(circle at 12% 0%,rgba(216,172,49,.25),transparent 34rem),radial-gradient(circle at 86% 8%,rgba(47,118,86,.18),transparent 34rem),linear-gradient(135deg,#fbf6ea,var(--bg)); font-family:ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif; }}
    main {{ width:min(1160px,calc(100% - 40px)); margin:0 auto; padding:44px 0 70px; }}
    .hero,.panel,.obs-card {{ background:rgba(255,249,237,.94); border:1px solid var(--line); border-radius:28px; box-shadow:var(--shadow); }}
    .hero,.panel {{ padding:28px; }}
    .kicker,.obs-card span {{ color:#a97524; font-size:.74rem; font-weight:950; letter-spacing:.2em; text-transform:uppercase; }}
    h1 {{ margin:8px 0 10px; font-size:clamp(2.1rem,5.4vw,5rem); line-height:.9; letter-spacing:-.06em; }}
    h2 {{ margin:8px 0; letter-spacing:-.035em; }}
    p,li {{ color:var(--muted); line-height:1.45; }}
    .grid {{ display:grid; grid-template-columns:1fr 1fr; gap:14px; margin-top:18px; }}
    .obs-card {{ padding:16px; box-shadow:none; }}
    .truth {{ border-left:10px solid var(--clay); }}
    code {{ color:#4d3a2c; overflow-wrap:anywhere; }}
    @media (max-width:900px) {{ .grid {{ grid-template-columns:1fr; }} }}
  </style>
</head>
<body>
  <main>
    <section class="hero truth">
      <span class="kicker">Quipsly machine observation summary</span>
      <h1>Useful notes, not a pass.</h1>
      <p>{esc(packet.get('truth'))}</p>
      <p><strong>Segment:</strong> {esc(segment.get('segmentId'))} · {esc(segment.get('label'))}</p>
      <p><strong>Limits:</strong> full playback watched = {esc(scope.get('didWatchFullPlayback'))}; full audio listened = {esc(scope.get('didListenFullAudio'))}; review complete = {esc(scope.get('didMarkReviewComplete'))}</p>
      <ul>{scope_html}</ul>
    </section>
    <section class="grid">
      <div class="panel">
        <span class="kicker">Agent observations</span>
        <h2>What Codex could inspect</h2>
        {obs_html}
      </div>
      <aside class="panel">
        <span class="kicker">Human/playback questions</span>
        <h2>What still needs real review</h2>
        <ul>{questions}</ul>
      </aside>
    </section>
  </main>
</body>
</html>
"""


def markdown(packet: dict[str, Any]) -> str:
    segment = packet.get("segment") or {}
    lines = [
        "# Episode 1 machine observation summary",
        "",
        f"Generated: {packet['generatedAt']}",
        f"Segment: `{segment.get('segmentId')}` {segment.get('label') or ''}",
        "",
        packet["truth"],
        "",
        "## Agent observation limits",
        "",
    ]
    for key, value in (packet.get("agentObservationScope") or {}).items():
        lines.append(f"- `{key}`: `{value}`")
    lines.extend(["", "## Observations", ""])
    for kind, notes in (packet.get("observations") or {}).items():
        if notes:
            lines.append(f"### {kind}")
            for note in notes:
                lines.append(f"- {note}")
            lines.append("")
    lines.extend(["## Human/playback questions", ""])
    for question in packet.get("recommendedHumanReviewQuestions") or []:
        lines.append(f"- {question}")
    return "\n".join(lines)


def main() -> int:
    if len(sys.argv) != 6:
        print("usage: episode1_selected_machine_review_summary.py cockpit.json notes.json output.json output.html output.md", file=sys.stderr)
        return 2
    cockpit_path, notes_path, output_json, output_html, output_md = sys.argv[1:6]
    packet = build_packet(cockpit_path, notes_path, output_json, output_html, output_md)
    write_json(output_json, packet)
    write_text(output_html, html_page(packet))
    write_text(output_md, markdown(packet))
    print(output_json)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
