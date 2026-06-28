#!/usr/bin/env python3
"""Generate a broad Episodes 1-3 shorts listen-through review board.

This board intentionally reads the broad readiness artifact instead of the
active app queue. It is the bridge from machine evidence to human/agent
editorial judgment: exported file + contact sheet + audio sanity exist, but the
short still needs an actual watch/listen-through before keep/refine/reject.
"""

from __future__ import annotations

import html
import json
import os
import shlex
import sys
from datetime import datetime
from pathlib import Path
from typing import Any


def repo_root() -> Path:
    return Path(__file__).resolve().parents[2]


def current_state_dir() -> Path:
    return repo_root() / "docs" / "quipsly" / "current-state"


def shell_quote(value: object) -> str:
    return shlex.quote(str(value))


def load_readiness(output_dir: Path) -> dict[str, Any]:
    candidates = [
        output_dir / "episodes-1-3-shorts-readiness.json",
        current_state_dir() / "episodes-1-3-shorts-readiness.json",
    ]
    for path in candidates:
        if path.exists():
            return json.loads(path.read_text())
    raise SystemExit(
        "Missing episodes-1-3-shorts-readiness.json. Run "
        "`script/shortsctl.sh episodes-readiness --json` first."
    )


def cards_from_readiness(readiness: dict[str, Any]) -> list[dict[str, Any]]:
    cards: list[dict[str, Any]] = []
    for episode in readiness.get("episodes", []):
        for raw in episode.get("cards", []):
            if not isinstance(raw, dict):
                continue
            card = dict(raw)
            card.setdefault("episodeKey", episode.get("episodeKey"))
            card.setdefault("episodeLabel", episode.get("episodeLabel"))
            cards.append(card)
    return cards


def safe_float(value: Any) -> float:
    try:
        return float(value)
    except Exception:
        return 0.0


def review_rank(card: dict[str, Any]) -> tuple[int, str, float, str]:
    stage = str(card.get("stage") or "")
    if stage == "exported-needs-listen-through":
        stage_rank = 0
    elif stage == "exported-needs-visual-review":
        stage_rank = 1
    elif stage == "needs-text-review":
        stage_rank = 2
    else:
        stage_rank = 3
    episode = str(card.get("episodeKey") or card.get("episodeLabel") or "")
    start = 0.0
    ranges = card.get("timelineRanges")
    if isinstance(ranges, list) and ranges:
        first = ranges[0]
        if isinstance(first, dict):
            start = safe_float(first.get("sequenceStartTime"))
    return (stage_rank, episode, start, str(card.get("title") or ""))


def session_load_command(card: dict[str, Any]) -> str:
    session = str(card.get("sourceSessionName") or "").strip()
    if not session:
        return "# source session missing; open the matching episode session before selecting"
    return f"QUIPSLY_AGENT_TIMEOUT=60 script/agentctl.sh load-session {shell_quote(session)}"


def select_command(card: dict[str, Any]) -> str:
    short_id = str(card.get("id") or "").strip()
    if not short_id:
        return "# short id missing"
    return f"{session_load_command(card)} && script/agentctl.sh shorts-select id {shell_quote(short_id)}"


def command_packet(card: dict[str, Any]) -> dict[str, str]:
    short_id = str(card.get("id") or "").strip()
    title = str(card.get("title") or "short")
    select = select_command(card)
    export_path = str(card.get("primaryExportPath") or "")
    contact_sheet = str(card.get("contactSheetPath") or "")
    audio_sanity = str(card.get("audioSanityPath") or "")
    open_export = f"open {shell_quote(export_path)}" if export_path else ""
    open_contact_sheet = f"open {shell_quote(contact_sheet)}" if contact_sheet else ""
    open_evidence = " && ".join(command for command in [open_export, open_contact_sheet] if command)
    return {
        "loadAndSelect": select,
        "openExport": open_export,
        "openContactSheet": open_contact_sheet,
        "openEvidence": open_evidence,
        "inspectAudioSanity": f"cat {shell_quote(audio_sanity)}" if audio_sanity else "",
        "previewInApp": f"{select} && script/agentctl.sh shorts-preview-selected play",
        "jumpToSource": f"{select} && script/agentctl.sh shorts-jump-selected",
        "markListened": (
            f"{select} && script/agentctl.sh shorts-listen-through "
            f"{shell_quote('listen-through reviewed; note timing, audio, crop, and whether the moment works')}"
        ),
        "keep": (
            f"{select} && script/agentctl.sh shorts-review-selected keep "
            f"{shell_quote('listen-through passed; ready for platform copy/refinement')}"
            if short_id
            else ""
        ),
        "refine": (
            f"{select} && script/agentctl.sh shorts-review-selected refine "
            f"{shell_quote('listen-through found an issue; describe trim/crop/audio/hook fix')}"
            if short_id
            else ""
        ),
        "reject": (
            f"{select} && script/agentctl.sh shorts-review-selected reject "
            f"{shell_quote('listen-through rejected; preserve as learning data')}"
            if short_id
            else ""
        ),
        "rename": f"{select} && script/agentctl.sh shorts-rename-selected {shell_quote(title)}",
    }


def platform_summary(card: dict[str, Any]) -> str:
    targets = card.get("platformTargets")
    if isinstance(targets, list) and targets:
        names = []
        for target in targets[:6]:
            if isinstance(target, dict):
                platform = str(target.get("platform") or "").strip()
                status = str(target.get("status") or "").strip()
                if platform:
                    names.append(f"{platform}: {status or 'needs review'}")
        if names:
            return "; ".join(names)
    readiness = card.get("platformReadinessSummary")
    return str(readiness or "platform package needs review")


def evidence_status(card: dict[str, Any]) -> dict[str, Any]:
    export_ok = bool(card.get("primaryExportExists"))
    sheet_ok = bool(card.get("contactSheetExists"))
    audio_ok = bool(card.get("audioSanityExists"))
    listened = str(card.get("listenThroughStatus") or "").lower()
    listened_ok = any(word in listened for word in ["done", "review", "pass", "approved", "listened"])
    ready_for_listen = export_ok and sheet_ok and audio_ok and not listened_ok
    return {
        "exportOk": export_ok,
        "contactSheetOk": sheet_ok,
        "audioSanityOk": audio_ok,
        "listenThroughOk": listened_ok,
        "readyForListenThrough": ready_for_listen,
    }


def normalize_card(card: dict[str, Any], index: int) -> dict[str, Any]:
    evidence = evidence_status(card)
    commands = command_packet(card)
    next_action = str(card.get("nextAction") or "")
    if evidence["readyForListenThrough"]:
        next_action = "Open the export and contact sheet, listen through for meaning/timing/crop, then mark keep/refine/reject."
    elif not evidence["exportOk"]:
        next_action = "Export this short before listen-through review."
    elif not evidence["contactSheetOk"] or not evidence["audioSanityOk"]:
        next_action = "Generate missing visual/audio evidence before judging the short."
    elif evidence["listenThroughOk"]:
        next_action = "Listen-through is recorded. Move to keep/refine/reject or platform copy."

    return {
        "index": index,
        "id": card.get("id"),
        "title": card.get("title"),
        "episodeKey": card.get("episodeKey"),
        "episodeLabel": card.get("episodeLabel"),
        "sourceSessionName": card.get("sourceSessionName"),
        "sourceSequenceName": card.get("sourceSequenceName"),
        "sourceRangeLabel": card.get("sourceRangeLabel"),
        "durationSeconds": card.get("durationSeconds"),
        "hookText": card.get("hookText"),
        "overlayText": card.get("overlayText"),
        "reviewStatus": card.get("reviewStatus"),
        "exportStatus": card.get("exportStatus"),
        "stage": card.get("stage"),
        "nextAction": next_action,
        "platformSummary": platform_summary(card),
        "timelineRanges": card.get("timelineRanges") or [],
        "primaryExportPath": card.get("primaryExportPath"),
        "contactSheetPath": card.get("contactSheetPath"),
        "audioSanityPath": card.get("audioSanityPath"),
        "evidence": evidence,
        "commands": commands,
    }


def build_packet(readiness: dict[str, Any]) -> dict[str, Any]:
    raw_cards = sorted(cards_from_readiness(readiness), key=review_rank)
    cards = [normalize_card(card, idx) for idx, card in enumerate(raw_cards, start=1)]
    next_ready_card = next((card for card in cards if card["evidence"]["readyForListenThrough"]), None)
    counts = {
        "shorts": len(cards),
        "exports": sum(1 for card in cards if card["evidence"]["exportOk"]),
        "contactSheets": sum(1 for card in cards if card["evidence"]["contactSheetOk"]),
        "audioSanity": sum(1 for card in cards if card["evidence"]["audioSanityOk"]),
        "readyForListenThrough": sum(1 for card in cards if card["evidence"]["readyForListenThrough"]),
        "listenThroughRecorded": sum(1 for card in cards if card["evidence"]["listenThroughOk"]),
    }
    return {
        "packetType": "quipsly-shorts-listen-review-board",
        "version": "2026-06-23.shorts-listen-review-board.v1",
        "generatedAt": datetime.now().astimezone().isoformat(timespec="seconds"),
        "counts": counts,
        "cards": cards,
        "nextReadyCard": next_ready_card,
        "nextAction": (
            "Start with the first ready card: open export/contact sheet, listen through, "
            "then mark keep/refine/reject. Do not approve publishing from machine evidence alone."
        ),
        "truth": (
            "This board reads exported derivatives and evidence artifacts. It does not mutate "
            "original media, does not mark listen-through complete, and does not approve publishing."
        ),
    }


def render_markdown(packet: dict[str, Any]) -> str:
    lines = [
        "# Episodes 1-3 Shorts Listen-Through Review",
        "",
        packet["truth"],
        "",
        "## Counts",
        "",
    ]
    for key, value in packet["counts"].items():
        lines.append(f"- `{key}`: {value}")
    lines.extend(["", "## Review Queue", ""])
    for card in packet["cards"]:
        evidence = card["evidence"]
        lines.extend(
            [
                f"### {card['index']}. {card.get('title') or 'Untitled short'}",
                "",
                f"- Episode: `{card.get('episodeKey') or card.get('episodeLabel') or 'unknown'}`",
                f"- Source range: `{card.get('sourceRangeLabel') or 'unknown'}`",
                f"- Duration: `{card.get('durationSeconds')}` seconds",
                f"- Stage: `{card.get('stage')}`",
                f"- Evidence: export `{evidence['exportOk']}`, contact sheet `{evidence['contactSheetOk']}`, audio sanity `{evidence['audioSanityOk']}`, listened `{evidence['listenThroughOk']}`",
                f"- Hook: {card.get('hookText') or '_Needs hook_'}",
                f"- Platforms: {card.get('platformSummary')}",
                f"- Next: {card.get('nextAction')}",
                "",
                "Commands:",
                "",
            ]
        )
        for label in ["openExport", "openContactSheet", "previewInApp", "jumpToSource", "markListened", "keep", "refine", "reject"]:
            command = card["commands"].get(label)
            if command:
                lines.append(f"- `{label}`: `{command}`")
        lines.append("")
    return "\n".join(lines).rstrip() + "\n"


def render_next_markdown(packet: dict[str, Any]) -> str:
    card = packet.get("nextReadyCard")
    if not isinstance(card, dict):
        return "\n".join(
            [
                "# Next Shorts Listen-Through Target",
                "",
                "No broad Episodes 1-3 short is currently ready for listen-through.",
                "",
                f"Counts: `{json.dumps(packet.get('counts') or {}, sort_keys=True)}`",
                "",
                packet.get("truth") or "",
                "",
            ]
        )

    commands = card.get("commands") or {}
    lines = [
        "# Next Shorts Listen-Through Target",
        "",
        f"## {card.get('index')}. {card.get('title') or 'Untitled short'}",
        "",
        f"- Episode: `{card.get('episodeKey') or card.get('episodeLabel') or 'unknown'}`",
        f"- Source range: `{card.get('sourceRangeLabel') or 'unknown'}`",
        f"- Duration: `{card.get('durationSeconds')}` seconds",
        f"- Hook: {card.get('hookText') or '_Needs hook_'}",
        f"- Platforms: {card.get('platformSummary') or 'platform package needs review'}",
        "",
        "## Review order",
        "",
        "1. Open the exported short.",
        "2. Open the contact sheet.",
        "3. Listen/watch for meaning, timing, crop, audio, and platform fit.",
        "4. Only after that, run mark-listened plus keep/refine/reject.",
        "",
        "## Commands",
        "",
    ]
    for label in [
        "loadAndSelect",
        "openEvidence",
        "openExport",
        "openContactSheet",
        "inspectAudioSanity",
        "previewInApp",
        "jumpToSource",
        "markListened",
        "keep",
        "refine",
        "reject",
    ]:
        command = commands.get(label)
        if command:
            lines.append(f"- `{label}`: `{command}`")
    lines.extend(["", f"Truth: {packet.get('truth') or ''}", ""])
    return "\n".join(lines)


def pill(label: str, ok: bool) -> str:
    cls = "ok" if ok else "missing"
    text = "yes" if ok else "no"
    return f'<span class="pill {cls}">{html.escape(label)}: {text}</span>'


def render_html(packet: dict[str, Any]) -> str:
    cards_html = []
    next_ready_card = packet.get("nextReadyCard") if isinstance(packet.get("nextReadyCard"), dict) else None
    if next_ready_card:
        next_commands = next_ready_card.get("commands") or {}
        next_title = str(next_ready_card.get("title") or "Untitled short")
        next_episode = str(next_ready_card.get("episodeKey") or next_ready_card.get("episodeLabel") or "unknown")
        next_range = str(next_ready_card.get("sourceRangeLabel") or "unknown range")
        next_command_rows = []
        for label in ["openEvidence", "previewInApp", "markListened", "keep", "refine", "reject"]:
            command = next_commands.get(label)
            if command:
                next_command_rows.append(f"<dt>{html.escape(label)}</dt><dd><code>{html.escape(command)}</code></dd>")
        next_ready_html = f"""
        <section class="next-ready">
          <p class="eyebrow">Next ready listen-through</p>
          <h2>{html.escape(next_title)}</h2>
          <p>{html.escape(next_episode)} · {html.escape(next_range)} · {html.escape(str(next_ready_card.get('durationSeconds') or '?'))}s</p>
          <p><strong>First action:</strong> open the export and contact sheet, then listen/watch before changing review state.</p>
          <details open>
            <summary>Next-card commands</summary>
            <dl>{''.join(next_command_rows)}</dl>
          </details>
        </section>
        """
    else:
        next_ready_html = """
        <section class="next-ready">
          <p class="eyebrow">Next ready listen-through</p>
          <h2>No ready card found.</h2>
          <p>Generate missing export/contact/audio evidence or review already-listened cards.</p>
        </section>
        """
    for card in packet["cards"]:
        evidence = card["evidence"]
        commands = card["commands"]
        command_rows = []
        for label in ["openEvidence", "openExport", "openContactSheet", "previewInApp", "jumpToSource", "markListened", "keep", "refine", "reject"]:
            command = commands.get(label)
            if command:
                command_rows.append(
                    f"<dt>{html.escape(label)}</dt><dd><code>{html.escape(command)}</code></dd>"
                )
        cards_html.append(
            f"""
            <article class="card {html.escape(str(card.get('stage') or ''))}">
              <header>
                <span class="index">#{card['index']}</span>
                <div>
                  <h2>{html.escape(str(card.get('title') or 'Untitled short'))}</h2>
                  <p>{html.escape(str(card.get('episodeKey') or card.get('episodeLabel') or 'unknown'))} · {html.escape(str(card.get('sourceRangeLabel') or 'unknown range'))} · {html.escape(str(card.get('durationSeconds') or '?'))}s</p>
                </div>
              </header>
              <div class="evidence">
                {pill('export', bool(evidence['exportOk']))}
                {pill('contact sheet', bool(evidence['contactSheetOk']))}
                {pill('audio sanity', bool(evidence['audioSanityOk']))}
                {pill('listened', bool(evidence['listenThroughOk']))}
              </div>
              <p class="next"><strong>Next:</strong> {html.escape(str(card.get('nextAction') or 'Review this short.'))}</p>
              <p><strong>Hook:</strong> {html.escape(str(card.get('hookText') or 'Needs a sharper hook.'))}</p>
              <p><strong>Platforms:</strong> {html.escape(str(card.get('platformSummary') or 'Needs platform review.'))}</p>
              <p><strong>Export:</strong> <code>{html.escape(str(card.get('primaryExportPath') or 'missing'))}</code></p>
              <p><strong>Contact sheet:</strong> <code>{html.escape(str(card.get('contactSheetPath') or 'missing'))}</code></p>
              <details>
                <summary>Commands</summary>
                <dl>{''.join(command_rows)}</dl>
              </details>
            </article>
            """
        )
    counts = packet["counts"]
    return f"""<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Quipsly Shorts Listen-Through Review</title>
  <style>
    :root {{
      --bg: #f6efe1;
      --ink: #33281e;
      --muted: #7b6a58;
      --card: #fffaf0;
      --line: #dfcfb4;
      --leaf: #315f45;
      --gold: #c58a2b;
      --red: #a4473f;
      --blue: #286a84;
    }}
    * {{ box-sizing: border-box; }}
    body {{
      margin: 0;
      background: radial-gradient(circle at top left, #fff8e8, var(--bg) 46%, #e8dcc5);
      color: var(--ink);
      font: 15px/1.5 ui-sans-serif, -apple-system, BlinkMacSystemFont, "SF Pro Text", sans-serif;
    }}
    main {{ max-width: 1180px; margin: 0 auto; padding: 32px 22px 72px; }}
    .hero {{
      border: 1px solid var(--line);
      border-radius: 28px;
      background: rgba(255, 250, 240, 0.84);
      padding: 28px;
      box-shadow: 0 20px 70px rgba(72, 52, 28, 0.10);
    }}
    .next-ready {{
      margin-top: 18px;
      border: 1px solid rgba(197, 138, 43, 0.42);
      border-radius: 22px;
      background: linear-gradient(135deg, rgba(255, 248, 226, 0.94), rgba(236, 226, 198, 0.72));
      padding: 18px;
    }}
    .eyebrow {{
      margin: 0 0 4px;
      color: var(--gold);
      font-size: 12px;
      font-weight: 900;
      letter-spacing: 0.14em;
      text-transform: uppercase;
    }}
    h1 {{ margin: 0 0 8px; font-size: clamp(32px, 5vw, 56px); letter-spacing: -0.04em; }}
    .next-ready h2 {{ margin: 0; font-size: 26px; letter-spacing: -0.035em; }}
    .counts {{ display: flex; flex-wrap: wrap; gap: 10px; margin-top: 18px; }}
    .count {{ border: 1px solid var(--line); border-radius: 999px; padding: 8px 12px; background: #fffdf7; color: var(--muted); }}
    .queue {{ display: grid; grid-template-columns: repeat(auto-fit, minmax(340px, 1fr)); gap: 18px; margin-top: 24px; }}
    .card {{
      border: 1px solid var(--line);
      border-radius: 24px;
      background: var(--card);
      padding: 18px;
      box-shadow: 0 14px 34px rgba(64, 48, 30, 0.08);
    }}
    .card header {{ display: flex; gap: 12px; align-items: flex-start; }}
    .index {{ flex: 0 0 auto; background: var(--ink); color: #fff7e8; padding: 6px 10px; border-radius: 999px; font-weight: 800; }}
    h2 {{ margin: 0; font-size: 20px; letter-spacing: -0.02em; }}
    header p {{ margin: 3px 0 0; color: var(--muted); }}
    .evidence {{ display: flex; flex-wrap: wrap; gap: 8px; margin: 16px 0; }}
    .pill {{ border-radius: 999px; padding: 5px 9px; font-size: 12px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.06em; }}
    .pill.ok {{ background: rgba(49, 95, 69, 0.15); color: var(--leaf); }}
    .pill.missing {{ background: rgba(164, 71, 63, 0.14); color: var(--red); }}
    .next {{ border-left: 4px solid var(--gold); padding-left: 12px; }}
    code {{ white-space: pre-wrap; word-break: break-word; font-size: 12px; }}
    details {{ margin-top: 12px; }}
    dt {{ margin-top: 10px; font-weight: 800; color: var(--blue); }}
    dd {{ margin: 2px 0 0; }}
  </style>
</head>
<body>
  <main>
    <section class="hero">
      <p><strong>Quipsly Studio</strong> · evidence-backed shorts review</p>
      <h1>Listen through the harvest.</h1>
      <p>{html.escape(packet['truth'])}</p>
      <div class="counts">
        <span class="count">{counts['shorts']} shorts</span>
        <span class="count">{counts['exports']} exports</span>
        <span class="count">{counts['contactSheets']} contact sheets</span>
        <span class="count">{counts['audioSanity']} audio sanity receipts</span>
        <span class="count">{counts['readyForListenThrough']} ready for listen-through</span>
        <span class="count">{counts['listenThroughRecorded']} listened</span>
      </div>
      {next_ready_html}
    </section>
    <section class="queue">
      {''.join(cards_html)}
    </section>
  </main>
</body>
</html>
"""


def write_outputs(packet: dict[str, Any], output_dir: Path, basename: str, mode: str) -> None:
    output_dir.mkdir(parents=True, exist_ok=True)
    json_path = output_dir / f"{basename}.json"
    md_path = output_dir / f"{basename}.md"
    html_path = output_dir / f"{basename}.html"
    packet = dict(packet)
    packet["json"] = str(json_path)
    packet["markdown"] = str(md_path)
    packet["html"] = str(html_path)
    json_path.write_text(json.dumps(packet, indent=2, sort_keys=True) + "\n")
    md_path.write_text(render_markdown(packet))
    html_path.write_text(render_html(packet))
    if mode == "--next-json":
        print(
            json.dumps(
                {
                    "packetType": "quipsly-shorts-listen-review-next",
                    "version": packet["version"],
                    "generatedAt": packet["generatedAt"],
                    "counts": packet["counts"],
                    "nextReadyCard": packet.get("nextReadyCard"),
                    "truth": packet["truth"],
                },
                indent=2,
                sort_keys=True,
            )
        )
    elif mode == "--next-md":
        print(render_next_markdown(packet))
    elif mode == "--json":
        print(json.dumps(packet, indent=2, sort_keys=True))
    elif mode == "--html":
        print(html_path)
    else:
        print(md_path)


def main(argv: list[str]) -> int:
    if len(argv) == 6:
        _, _queue_path, _state_path, output_dir_raw, basename, mode = argv
    elif len(argv) == 4:
        _, output_dir_raw, basename, mode = argv
    else:
        print(
            "Usage: shorts_listen_review_board.py [queue state] output_dir basename --json|--html|--md|--next-json|--next-md",
            file=sys.stderr,
        )
        return 2
    output_dir = Path(output_dir_raw)
    readiness = load_readiness(output_dir)
    packet = build_packet(readiness)
    write_outputs(packet, output_dir, basename, mode)
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
