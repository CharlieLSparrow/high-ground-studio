#!/usr/bin/env python3
"""Build a practical local-export board for Quipsly shorts.

This is deliberately operator-facing. It does not approve, publish, schedule,
or mutate review state. Its job is to answer: what can we export, inspect,
listen to, and improve next?
"""

from __future__ import annotations

import os
import sys
from typing import Any

from shorts_board_common import (
    classify_short,
    emit_packet_outputs,
    episode_coverage,
    esc,
    html_episode_coverage,
    load_json,
    markdown_episode_coverage,
    now_iso,
    stage_rank,
    unique_shorts,
)


def build_board(queue_path: str, state_path: str, output_dir: str, basename: str) -> dict[str, Any]:
    queue_payload = load_json(queue_path)
    state_payload = load_json(state_path) if state_path and os.path.exists(state_path) else {}
    shorts = unique_shorts(queue_payload)
    cards = [classify_short(row, output_dir, index) for index, row in enumerate(shorts, start=1)]
    cards.sort(key=lambda item: (stage_rank(item["stage"]), item["index"]))

    counts: dict[str, int] = {}
    for card in cards:
        counts[card["stage"]] = counts.get(card["stage"], 0) + 1

    next_card = next((card for card in cards if card["stage"] != "rejected-learning-data"), None)
    local_files = [card for card in cards if card["primaryExportExists"]]
    missing_exports = [card for card in cards if card["stage"] in {"missing-export", "export-path-missing-file"}]
    quality_review = [
        card
        for card in cards
        if card["stage"] in {"exported-needs-visual-review", "exported-needs-listen-through", "needs-text-review", "ready-for-local-quality-decision"}
    ]

    json_path = os.path.join(output_dir, f"{basename}.json")
    html_path = os.path.join(output_dir, f"{basename}.html")
    md_path = os.path.join(output_dir, f"{basename}.md")
    board = {
        "packetType": "quipsly-shorts-local-export-board",
        "version": "2026-06-21.shorts-local-export-board.v1",
        "generatedAt": now_iso(),
        "json": json_path,
        "html": html_path,
        "markdown": md_path,
        "truth": "This board does not approve, publish, schedule, upload, or mutate review state. It exists to make local export and quality review obvious.",
        "operatorFocus": "Output first: export usable local files, watch them, listen to them, improve the edit, then hand off to publishing.",
        "outputDirectory": output_dir,
        "basename": basename,
        "shortCount": len(cards),
        "stageCounts": counts,
        "localExportedFileCount": len(local_files),
        "missingExportCount": len(missing_exports),
        "qualityReviewCount": len(quality_review),
        "episodeCoverage": episode_coverage(cards),
        "nextShort": next_card,
        "cards": cards,
        "sourceStateHints": {
            "selectedShortId": ((state_payload.get("shortsQueue") or {}).get("selectedId") if isinstance(state_payload, dict) else None),
            "exportStatus": ((state_payload.get("exportState") or {}).get("status") if isinstance(state_payload, dict) else None),
        },
    }
    return board


def html_page(board: dict[str, Any]) -> str:
    counts = board.get("stageCounts") or {}
    next_card = board.get("nextShort") or {}
    count_cards = "".join(
        f"<article><strong>{esc(value)}</strong><span>{esc(key)}</span></article>"
        for key, value in sorted(counts.items(), key=lambda item: stage_rank(item[0]))
    )
    rows = []
    for card in board.get("cards") or []:
        commands = card.get("commands") or {}
        primary = card.get("primaryExportPath") or "No local export path yet"
        exists = "present" if card.get("primaryExportExists") else "missing"
        destinations = ", ".join(str(item) for item in (card.get("destinations") or [])) or "No platform targets yet"
        hook = card.get("hookText") or "No hook text yet"
        overlay = card.get("overlayText") or "No overlay/caption plan yet"
        rows.append(
            f"""
            <section class="short {esc(card.get('stage'))}">
              <div>
                <p class="eyebrow">{esc(card.get('stage'))}</p>
                <h2>{esc(card.get('title'))}</h2>
                <p>{esc(card.get('nextAction'))}</p>
                <dl>
                  <div><dt>Duration</dt><dd>{esc(card.get('durationSeconds'))}s</dd></div>
                  <div><dt>Source range</dt><dd>{esc(card.get('sourceRangeLabel'))}</dd></div>
                  <div><dt>Episode</dt><dd>{esc(card.get('episodeLabel'))} ({esc(card.get('episodeInference'))})</dd></div>
                  <div><dt>Segments</dt><dd>{esc(card.get('segmentCount'))}</dd></div>
                  <div><dt>Export</dt><dd>{esc(exists)} - {esc(primary)}</dd></div>
                  <div><dt>Review</dt><dd>{esc(card.get('reviewStatus'))}</dd></div>
                  <div><dt>Platforms</dt><dd>{esc(destinations)}</dd></div>
                  <div><dt>Hook</dt><dd>{esc(hook)}</dd></div>
                  <div><dt>Overlay</dt><dd>{esc(overlay)}</dd></div>
                </dl>
              </div>
              <div class="commands">
                <label>Do next</label>
                <code>{esc(commands.get('exportLocal') if card.get('stage') in {'missing-export', 'export-path-missing-file'} else commands.get('contactSheet') or commands.get('audioSanity') or commands.get('select'))}</code>
                <label>Audio sanity</label>
                <code>{esc(commands.get('audioSanity') or 'Export first')}</code>
                <label>Decision after watching</label>
                <code>{esc(commands.get('keep'))}</code>
              </div>
            </section>
            """
        )

    next_command = ""
    episode_html = html_episode_coverage(board.get("episodeCoverage"))
    if next_card:
        commands = next_card.get("commands") or {}
        if next_card.get("stage") in {"missing-export", "export-path-missing-file"}:
            next_command = commands.get("exportLocal") or ""
        elif next_card.get("stage") == "exported-needs-visual-review":
            next_command = commands.get("contactSheet") or commands.get("select") or ""
        elif next_card.get("stage") == "exported-needs-listen-through":
            next_command = commands.get("audioSanity") or commands.get("select") or ""
        else:
            next_command = commands.get("select") or ""

    return f"""<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Quipsly shorts local export board</title>
  <style>
    :root {{
      color-scheme: dark;
      --bg: #111712;
      --panel: #192219;
      --panel-2: #223020;
      --ink: #f4efd8;
      --muted: #b9ad91;
      --gold: #f1c84d;
      --moss: #7dbb64;
      --clay: #c97946;
      --red: #e26363;
      --line: rgba(244, 239, 216, 0.16);
    }}
    * {{ box-sizing: border-box; }}
    body {{
      margin: 0;
      background:
        radial-gradient(circle at 10% 10%, rgba(125, 187, 100, 0.18), transparent 28rem),
        radial-gradient(circle at 85% 0%, rgba(241, 200, 77, 0.12), transparent 24rem),
        var(--bg);
      color: var(--ink);
      font: 15px/1.5 ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    }}
    main {{ max-width: 1180px; margin: 0 auto; padding: 42px 24px 64px; }}
    .hero {{
      border: 1px solid var(--line);
      border-radius: 28px;
      padding: 30px;
      background: linear-gradient(135deg, rgba(25, 34, 25, 0.94), rgba(34, 48, 32, 0.84));
      box-shadow: 0 24px 80px rgba(0, 0, 0, 0.32);
    }}
    .eyebrow {{
      margin: 0 0 8px;
      color: var(--gold);
      text-transform: uppercase;
      letter-spacing: 0.22em;
      font-size: 0.72rem;
      font-weight: 800;
    }}
    h1 {{ margin: 0; font-size: clamp(2.2rem, 6vw, 4.6rem); line-height: 0.94; letter-spacing: -0.06em; }}
    h2 {{ margin: 0 0 6px; font-size: 1.1rem; }}
    p {{ color: var(--muted); max-width: 760px; }}
    code {{
      display: block;
      white-space: pre-wrap;
      word-break: break-word;
      padding: 10px 12px;
      border-radius: 12px;
      background: rgba(0, 0, 0, 0.28);
      color: #fff7c4;
      border: 1px solid rgba(241, 200, 77, 0.18);
      font-size: 0.8rem;
    }}
    .counts {{ display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 12px; margin: 22px 0; }}
    .counts article {{
      border: 1px solid var(--line);
      background: rgba(255, 255, 255, 0.04);
      border-radius: 18px;
      padding: 14px;
    }}
    .counts strong {{ display: block; font-size: 2rem; color: var(--gold); }}
    .counts span {{ color: var(--muted); font-size: 0.82rem; }}
    .episode-coverage {{ margin-top: 18px; }}
    .episode-coverage-grid {{ display: grid; grid-template-columns: repeat(auto-fit, minmax(190px, 1fr)); gap: 10px; }}
    .episode-coverage article {{ border: 1px solid var(--line); border-radius: 16px; padding: 12px; background: rgba(125, 187, 100, 0.07); }}
    .episode-coverage strong {{ display: block; color: var(--moss); text-transform: uppercase; letter-spacing: 0.08em; }}
    .episode-coverage span, .episode-coverage small {{ display: block; color: var(--muted); }}
    .coverage-warning {{ color: var(--gold); margin: 8px 0 0; }}
    .next {{
      margin-top: 22px;
      border-left: 4px solid var(--moss);
      padding: 14px 16px;
      background: rgba(125, 187, 100, 0.08);
      border-radius: 16px;
    }}
    .shorts {{ display: grid; gap: 16px; margin-top: 22px; }}
    .short {{
      display: grid;
      grid-template-columns: minmax(0, 1fr) minmax(280px, 0.9fr);
      gap: 18px;
      border: 1px solid var(--line);
      border-radius: 22px;
      padding: 18px;
      background: rgba(25, 34, 25, 0.82);
    }}
    .missing-export, .export-path-missing-file {{ border-color: rgba(226, 99, 99, 0.5); }}
    .exported-needs-visual-review, .exported-needs-listen-through, .needs-text-review {{ border-color: rgba(241, 200, 77, 0.45); }}
    .ready-for-social-queue {{ border-color: rgba(125, 187, 100, 0.55); }}
    dl {{ display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 10px; margin: 14px 0 0; }}
    dt {{ color: var(--muted); font-size: 0.72rem; text-transform: uppercase; letter-spacing: 0.12em; }}
    dd {{ margin: 0; overflow-wrap: anywhere; }}
    .commands {{ display: grid; gap: 8px; align-content: start; }}
    label {{ color: var(--moss); font-weight: 800; text-transform: uppercase; letter-spacing: 0.12em; font-size: 0.7rem; }}
    @media (max-width: 860px) {{ .short {{ grid-template-columns: 1fr; }} }}
  </style>
</head>
<body>
  <main>
    <section class="hero">
      <p class="eyebrow">Quipsly Studio - local shorts export</p>
      <h1>Make the shorts real files.</h1>
      <p>{esc(board.get('operatorFocus'))}</p>
      <div class="counts">{count_cards}</div>
      {episode_html}
      <section class="next">
        <p class="eyebrow">Next practical move</p>
        <h2>{esc(next_card.get('title') if next_card else 'No shorts found')}</h2>
        <p>{esc(next_card.get('nextAction') if next_card else 'Open the Studio shorts panel and create a short candidate.')}</p>
        <code>{esc(next_command or 'No command available')}</code>
      </section>
    </section>
    <section class="shorts">
      {''.join(rows)}
    </section>
  </main>
</body>
</html>
"""


def markdown_page(board: dict[str, Any]) -> str:
    lines = [
        "# Quipsly shorts local export board",
        "",
        board.get("operatorFocus", ""),
        "",
        f"- Generated: `{board.get('generatedAt')}`",
        f"- Shorts: `{board.get('shortCount')}`",
        f"- Local exported files found: `{board.get('localExportedFileCount')}`",
        f"- Missing exports: `{board.get('missingExportCount')}`",
        f"- Quality review candidates: `{board.get('qualityReviewCount')}`",
        "",
        "## Stage counts",
        "",
    ]
    for key, value in sorted((board.get("stageCounts") or {}).items(), key=lambda item: stage_rank(item[0])):
        lines.append(f"- `{key}`: `{value}`")
    lines.extend(["", *markdown_episode_coverage(board.get("episodeCoverage"))])
    next_card = board.get("nextShort") or {}
    if next_card:
        commands = next_card.get("commands") or {}
        if next_card.get("stage") in {"missing-export", "export-path-missing-file"}:
            command = commands.get("exportLocal") or ""
        elif next_card.get("stage") == "exported-needs-visual-review":
            command = commands.get("contactSheet") or commands.get("select") or ""
        elif next_card.get("stage") == "exported-needs-listen-through":
            command = commands.get("audioSanity") or commands.get("select") or ""
        else:
            command = commands.get("select") or ""
        lines.extend([
            "",
            "## Next practical move",
            "",
            f"- Short: `{next_card.get('title')}`",
            f"- Stage: `{next_card.get('stage')}`",
            f"- Why: {next_card.get('nextAction')}",
            "",
            "```bash",
            command,
            "```",
        ])
    lines.extend(["", "## Shorts", ""])
    for card in board.get("cards") or []:
        commands = card.get("commands") or {}
        lines.extend([
            f"### {card.get('title')}",
            "",
            f"- Episode: `{card.get('episodeKey')}` (`{card.get('episodeInference')}`)",
            f"- Stage: `{card.get('stage')}`",
            f"- Duration: `{card.get('durationSeconds')}s`",
            f"- Source range: `{card.get('sourceRangeLabel')}`",
            f"- Segments: `{card.get('segmentCount')}`",
            f"- Platforms: `{', '.join(str(item) for item in (card.get('destinations') or [])) or 'none yet'}`",
            f"- Hook: {card.get('hookText') or 'none yet'}",
            f"- Overlay: {card.get('overlayText') or 'none yet'}",
            f"- Local export: `{card.get('primaryExportPath') or 'none yet'}`",
            f"- Export file present: `{card.get('primaryExportExists')}`",
            f"- Next: {card.get('nextAction')}",
            "",
            "```bash",
            commands.get("exportLocal") or "",
            commands.get("contactSheet") or "",
            commands.get("audioSanity") or "",
            commands.get("keep") or "",
            "```",
            "",
        ])
    return "\n".join(lines)


def main(argv: list[str]) -> int:
    if len(argv) < 5:
        print(
            "Usage: shorts_local_export_board.py SHORTS_QUEUE_JSON STATE_JSON OUTPUT_DIR BASENAME [--json|--html|--md]",
            file=sys.stderr,
        )
        return 2
    queue_path, state_path, output_dir, basename = argv[1:5]
    mode = argv[5] if len(argv) > 5 else "--md"
    board = build_board(queue_path, state_path, output_dir, basename)
    emit_packet_outputs(board, html_page(board), markdown_page(board), mode)
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
