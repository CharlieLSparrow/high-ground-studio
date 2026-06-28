#!/usr/bin/env python3
"""Build a Nest writing momentum board.

This joins source inventory, author tasks, daily task focus, and draft/publication
runway state into one low-anxiety writing surface. It does not rewrite source
files, replace manuscripts, publish, schedule, upload, or create receipts.
"""

from __future__ import annotations

import argparse
import csv
import html
import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

DEFAULT_NEST_ROOT = Path("/Volumes/My Passport/Quipsly Media Workspace/NestWriting")
SCHEMA = "quipsly.nest-writing.momentum-board.v1"


def iso_now() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def stamp() -> str:
    return datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S-%f-writing-momentum-board")


def load_json(path: Path) -> dict[str, Any]:
    if not path.exists():
        return {}
    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
        return payload if isinstance(payload, dict) else {}
    except Exception:
        return {}


def write_json(path: Path, payload: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, indent=2, sort_keys=True) + "\n", encoding="utf-8")


def esc(value: Any) -> str:
    return html.escape(str(value or ""))


def shell_quote(value: str) -> str:
    return "'" + value.replace("'", "'\\''") + "'"


def load_packet(root: Path, filename: str) -> dict[str, Any]:
    return load_json(root / filename)


def build_writing_session_recipe(first_task: dict[str, Any], first_draft: dict[str, Any]) -> list[dict[str, Any]]:
    source_command = str(first_task.get("openFirstSource") or "")
    existing_draft_command = str(first_task.get("openExistingDraftPacket") or first_draft.get("openCommand") or "")
    draft_packet_command = str(first_task.get("draftPacketCommand") or "")
    return [
        {
            "step": 1,
            "label": "Open the source trail",
            "why": "Read the source before touching draft copy so the work stays source-backed instead of black-box.",
            "command": source_command,
            "safety": "Opens source evidence only. Do not write back to the source file from this board.",
        },
        {
            "step": 2,
            "label": "Open the existing draft packet",
            "why": "Use the draft packet as editable thinking material: useful prose, review questions, platform hooks, and visible source trail.",
            "command": existing_draft_command,
            "safety": "Opens local draft evidence only. It does not replace canonical manuscript text.",
        },
        {
            "step": 3,
            "label": "Refresh the draft packet if needed",
            "why": "Generate a fresh source-backed packet when the current packet is stale, confusing, or too thin to work from.",
            "command": draft_packet_command,
            "safety": "Creates a new local draft packet version. It does not mutate source files, publish, upload, schedule, or create receipts.",
        },
        {
            "step": 4,
            "label": "Choose a writing move",
            "why": "Pick one mode at a time: outline, expand, cut, rewrite, cite, compare, promote, or hold.",
            "command": "",
            "safety": "Decision guidance only. Canonical manuscript writes still require a separate explicit save/edit path.",
        },
        {
            "step": 5,
            "label": "Promote only after human review",
            "why": "Platform packets and publication runway are downstream of writing review, not substitutes for it.",
            "command": str(first_draft.get("command") or first_draft.get("openCommand") or ""),
            "safety": "Review/promotion prep only. External publication truth still requires real receipts.",
        },
    ]


def build_packet(root: Path) -> dict[str, Any]:
    source = load_packet(root, "latest-nest-writing-source-packet.json")
    session = load_packet(root, "latest-nest-writing-session-cockpit.json")
    daily = load_packet(root, "latest-nest-writing-daily-packet.json")
    author = load_packet(root, "latest-nest-writing-author-desk.json")
    runway = load_packet(root, "latest-writing-publication-runway.json")
    source_counts = source.get("counts") if isinstance(source.get("counts"), dict) else {}
    session_counts = session.get("counts") if isinstance(session.get("counts"), dict) else {}
    daily_counts = daily.get("counts") if isinstance(daily.get("counts"), dict) else {}
    author_counts = author.get("counts") if isinstance(author.get("counts"), dict) else {}
    runway_counts = runway.get("counts") if isinstance(runway.get("counts"), dict) else {}
    first_task = author.get("firstTask") if isinstance(author.get("firstTask"), dict) else daily.get("firstTask") if isinstance(daily.get("firstTask"), dict) else {}
    first_draft = runway.get("firstSafeAction") if isinstance(runway.get("firstSafeAction"), dict) else {}
    human_ask = (
        author.get("humanAsk")
        or source.get("humanAsk")
        or "Open the first source-backed writing task and decide whether to draft, rewrite, outline, compare, promote, or hold."
    )
    agent_safe_work = (
        author.get("agentSafeParallelWork")
        or source.get("agentSafeParallelWork")
        or "Draft examples, rewrites, outlines, comparisons, and platform packets without mutating sources, replacing manuscripts, publishing, scheduling, uploading, or creating receipts."
    )
    writing_contract = (
        author.get("writingContract")
        if isinstance(author.get("writingContract"), dict)
        else source.get("sourceContract")
        if isinstance(source.get("sourceContract"), dict)
        else {
            "mode": "writing-momentum",
            "assistantMayDraft": True,
            "humanOwnsCanonicalText": True,
            "canonicalWriteBlocked": True,
            "externalPublishingBlocked": True,
            "summary": "Draft freely, but never secretly. The momentum board opens local evidence and keeps source/promotion boundaries visible.",
        }
    )
    source_tasks = (
        author.get("sourceTasks")
        if isinstance(author.get("sourceTasks"), list)
        else source.get("sourceTasks")
        if isinstance(source.get("sourceTasks"), list)
        else []
    )
    writing_session_recipe = build_writing_session_recipe(first_task, first_draft)
    return {
        "schema": SCHEMA,
        "generatedAt": iso_now(),
        "status": "writing-momentum-ready",
        "nestRoot": str(root),
        "truth": "Writing momentum board only. It opens local evidence and draft packets; it does not rewrite source files, replace manuscripts, publish, schedule, upload, or create receipts.",
        "humanAsk": human_ask,
        "agentSafeParallelWork": agent_safe_work,
        "writingContract": writing_contract,
        "sourceContract": writing_contract,
        "sourceTasks": source_tasks,
        "sourcePointers": {
            "sourcePacket": str(root / "latest-nest-writing-source-packet.json"),
            "sessionCockpit": str(root / "latest-nest-writing-session-cockpit.json"),
            "dailyPacket": str(root / "latest-nest-writing-daily-packet.json"),
            "authorDesk": str(root / "latest-nest-writing-author-desk.json"),
            "publicationRunway": str(root / "latest-writing-publication-runway.json"),
        },
        "counts": {
            "sourceDocuments": source_counts.get("documents", 0),
            "sourceWords": source_counts.get("words", 0),
            "readyForReview": source_counts.get("readyForReview", 0),
            "availableSessions": session_counts.get("availableDraftQueue", session_counts.get("selectedSessions", 0)),
            "dailyTasks": daily_counts.get("selectedTasks", 0),
            "authorTasks": author_counts.get("deskTasks", 0),
            "draftPackets": runway_counts.get("draftPackets", 0),
            "currentDrafts": runway_counts.get("currentDrafts", 0),
            "pendingHumanReview": runway_counts.get("pendingHumanReview", 0),
            "platformDraftItems": runway_counts.get("platformDraftItems", 0),
            "receiptSlots": runway_counts.get("receiptSlots", 0),
            "capturedReceipts": runway_counts.get("capturedReceipts", 0),
            "sourceFilesMutated": False,
            "canonicalManuscriptReplaced": False,
            "externalPublishing": False,
            "receiptTruthCreated": False,
        },
        "firstWritingTask": first_task,
        "firstDraftReview": first_draft,
        "writingSessionRecipe": writing_session_recipe,
        "writingMoveMenu": [
            {"label": "Outline", "meaning": "Turn source material into structure before prose gets heavy."},
            {"label": "Expand", "meaning": "Add examples, transitions, and context while keeping the source trail visible."},
            {"label": "Cut", "meaning": "Reduce clutter without normalizing the author voice."},
            {"label": "Rewrite", "meaning": "Generate alternate passes as inspectable draft material, not secret replacement."},
            {"label": "Cite", "meaning": "Add source notes, quote trails, and confidence checks."},
            {"label": "Compare", "meaning": "Put draft claims beside source evidence and find mismatches."},
            {"label": "Promote", "meaning": "Move a reviewed draft toward publication packets only after human review."},
            {"label": "Hold", "meaning": "Park the task without losing context when it is not ready."},
        ],
        "surfaces": [
            {"label": "Source packet", "path": source.get("htmlPath") or source.get("workbenchHtmlPath") or "", "why": "See what book/article/source material exists before drafting."},
            {"label": "Author desk", "path": author.get("htmlPath") or "", "why": "Choose the next source-backed writing task."},
            {"label": "Daily packet", "path": daily.get("htmlPath") or "", "why": "Keep today's writing loop small enough to start."},
            {"label": "Publication runway", "path": runway.get("htmlPath") or "", "why": "Review draft packets and platform copy without pretending publication happened."},
        ],
        "nextSafestAction": "Open the first writing task or existing draft packet, write/review with the source trail visible, and preserve publication receipts for real external URLs only.",
    }


def prepare_output(root: Path) -> Path:
    out_dir = root / "MomentumBoard" / stamp()
    base = out_dir
    counter = 2
    while out_dir.exists():
        out_dir = Path(f"{base}-{counter}")
        counter += 1
    out_dir.mkdir(parents=True, exist_ok=False)
    return out_dir


def write_csv(path: Path, packet: dict[str, Any]) -> None:
    fields = ["kind", "label", "path", "why", "command", "safety"]
    with path.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=fields)
        writer.writeheader()
        for row in packet.get("surfaces") or []:
            writer.writerow({
                "kind": "surface",
                "label": row.get("label", ""),
                "path": row.get("path", ""),
                "why": row.get("why", ""),
                "command": f"open {shell_quote(str(row.get('path')))}" if row.get("path") else "",
                "safety": "Open local evidence only.",
            })
        for row in packet.get("writingSessionRecipe") or []:
            writer.writerow({
                "kind": "writing-session-step",
                "label": row.get("label", ""),
                "path": "",
                "why": row.get("why", ""),
                "command": row.get("command", ""),
                "safety": row.get("safety", ""),
            })


def write_markdown(path: Path, packet: dict[str, Any]) -> None:
    counts = packet["counts"]
    first = packet.get("firstWritingTask") or {}
    lines = [
        "# Nest Writing Momentum Board",
        "",
        f"- Generated: `{packet['generatedAt']}`",
        f"- Status: `{packet['status']}`",
        f"- Source documents: `{counts['sourceDocuments']}`",
        f"- Source words: `{counts['sourceWords']}`",
        f"- Draft packets: `{counts['draftPackets']}`",
        f"- Pending human review: `{counts['pendingHumanReview']}`",
        "",
        packet["truth"],
        "",
        "## Human/agent contract",
        "",
        f"- Human ask: {packet.get('humanAsk')}",
        f"- Agent-safe parallel work: {packet.get('agentSafeParallelWork')}",
        f"- Contract: {(packet.get('writingContract') or {}).get('summary') if isinstance(packet.get('writingContract'), dict) else ''}",
        "",
        "## Start writing",
        "",
        f"- First task: `{first.get('title') or 'none'}`",
        f"- Safe action: {first.get('safeNextAction') or packet['nextSafestAction']}",
        f"- Draft packet command: `{first.get('draftPacketCommand') or ''}`",
        f"- Existing draft: `{first.get('existingDraftPacketHtml') or ''}`",
        "",
        "## Writing session recipe",
        "",
        "Use this like a small, calm workbench. Open the source, open the draft, make one writing move, then decide whether to revise, promote, or hold.",
        "",
    ]
    for step in packet.get("writingSessionRecipe") or []:
        lines.extend([
            f"### {step.get('step')}. {step.get('label')}",
            "",
            f"- Why: {step.get('why')}",
            f"- Command: `{step.get('command') or ''}`",
            f"- Safety: {step.get('safety')}",
            "",
        ])
    lines.extend([
        "## Writing move menu",
        "",
    ])
    for move in packet.get("writingMoveMenu") or []:
        lines.append(f"- **{move.get('label')}**: {move.get('meaning')}")
    lines.extend([
        "",
        "## Surfaces",
        "",
    ])
    for surface in packet.get("surfaces") or []:
        lines.append(f"- {surface.get('label')}: `{surface.get('path')}` - {surface.get('why')}")
    path.write_text("\n".join(lines) + "\n", encoding="utf-8")


def write_html(path: Path, packet: dict[str, Any]) -> None:
    counts = packet["counts"]
    first = packet.get("firstWritingTask") or {}
    draft = packet.get("firstDraftReview") or {}
    surface_cards = []
    for surface in packet.get("surfaces") or []:
        p = surface.get("path") or ""
        command = f"open {shell_quote(str(p))}" if p else ""
        surface_cards.append(f"""
        <article class="surface">
          <h3>{esc(surface.get('label'))}</h3>
          <p>{esc(surface.get('why'))}</p>
          <code>{esc(p)}</code>
          <code>{esc(command)}</code>
        </article>
        """)
    recipe_cards = []
    for step in packet.get("writingSessionRecipe") or []:
        recipe_cards.append(f"""
        <article class="surface recipe-step">
          <div class="step-number">{esc(step.get('step'))}</div>
          <h3>{esc(step.get('label'))}</h3>
          <p>{esc(step.get('why'))}</p>
          <code>{esc(step.get('command') or 'No command needed for this step.')}</code>
          <p class="safety">{esc(step.get('safety'))}</p>
        </article>
        """)
    move_chips = "".join(
        f"<span title=\"{esc(move.get('meaning'))}\">{esc(move.get('label'))}</span>"
        for move in packet.get("writingMoveMenu") or []
    )
    html_text = f"""<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Nest Writing Momentum Board</title>
  <style>
    :root {{ color-scheme:dark; --bg:#111810; --panel:#1c281d; --ink:#fff1d6; --muted:#d1c09f; --gold:#ecca64; --moss:#93bd75; --fern:#4f9161; --line:rgba(255,241,214,.15); }}
    body {{ margin:0; font-family:Avenir Next, Helvetica Neue, sans-serif; color:var(--ink); background:radial-gradient(circle at 15% 0%, rgba(147,189,117,.22), transparent 32%), linear-gradient(180deg,#162015,#0b1009); }}
    header {{ padding:44px clamp(22px,5vw,82px); border-bottom:1px solid var(--line); }}
    .eyebrow {{ color:var(--gold); letter-spacing:.22em; text-transform:uppercase; font-weight:900; font-size:12px; }}
    h1 {{ margin:10px 0; font-size:clamp(42px,7vw,88px); line-height:.9; max-width:980px; }}
    p {{ color:var(--muted); line-height:1.52; }}
    code {{ display:block; color:var(--gold); overflow-wrap:anywhere; font-size:11px; margin-top:8px; }}
    .stats {{ display:grid; grid-template-columns:repeat(auto-fit,minmax(130px,1fr)); gap:12px; padding:22px clamp(16px,4vw,58px); }}
    .stat {{ border:1px solid var(--line); border-radius:24px; padding:16px; background:linear-gradient(180deg,rgba(28,40,29,.96),rgba(11,16,9,.96)); }}
    .stat b {{ display:block; font-size:32px; }}
    .stat span {{ color:var(--muted); text-transform:uppercase; letter-spacing:.12em; font-weight:900; font-size:11px; }}
    main {{ padding:0 clamp(16px,4vw,58px) 72px; display:grid; gap:20px; }}
    section {{ border:1px solid var(--line); border-radius:28px; padding:22px; background:rgba(0,0,0,.18); }}
    .focus {{ background:linear-gradient(135deg,rgba(147,189,117,.16),rgba(236,202,100,.08)); }}
    .surfaces {{ display:grid; grid-template-columns:repeat(auto-fit,minmax(260px,1fr)); gap:12px; }}
    .surface {{ border:1px solid var(--line); border-radius:20px; padding:16px; background:rgba(255,255,255,.045); }}
    .recipe-step {{ position:relative; padding-top:38px; }}
    .step-number {{ position:absolute; top:12px; right:14px; width:30px; height:30px; border-radius:999px; display:grid; place-items:center; color:#142015; background:var(--gold); font-weight:950; }}
    .safety {{ color:var(--moss); font-size:13px; font-weight:800; }}
    .moves {{ display:flex; gap:8px; flex-wrap:wrap; margin-top:14px; }}
    .moves span {{ border:1px solid var(--line); border-radius:999px; padding:8px 11px; color:var(--ink); background:rgba(147,189,117,.13); font-size:12px; font-weight:900; }}
    .truth {{ color:var(--moss); font-weight:850; }}
  </style>
</head>
<body>
  <header>
    <div class="eyebrow">Quipsly Nest</div>
    <h1>Start writing without losing the source trail.</h1>
    <p>One board for source material, next writing task, draft packets, and publication runway. Quipsly may draft real text, but the board keeps source trails, promotion boundaries, and receipt truth visible.</p>
    <p><strong>Human ask:</strong> {esc(packet.get('humanAsk'))}</p>
    <p><strong>Agent-safe work:</strong> {esc(packet.get('agentSafeParallelWork'))}</p>
  </header>
  <section class="stats">
    <div class="stat"><b>{esc(counts.get('sourceDocuments'))}</b><span>Sources</span></div>
    <div class="stat"><b>{esc(counts.get('sourceWords'))}</b><span>Words</span></div>
    <div class="stat"><b>{esc(counts.get('authorTasks'))}</b><span>Author tasks</span></div>
    <div class="stat"><b>{esc(counts.get('draftPackets'))}</b><span>Draft packets</span></div>
    <div class="stat"><b>{esc(counts.get('platformDraftItems'))}</b><span>Platform drafts</span></div>
    <div class="stat"><b>{esc(counts.get('capturedReceipts'))}</b><span>Receipts</span></div>
  </section>
  <main>
    <section class="focus">
      <h2>First writing move</h2>
      <p><b>{esc(first.get('title') or 'No task selected')}</b></p>
      <p>{esc(first.get('safeNextAction') or packet.get('nextSafestAction'))}</p>
      <code>{esc(first.get('draftPacketCommand') or '')}</code>
      <code>{esc(first.get('openExistingDraftPacket') or draft.get('openCommand') or '')}</code>
    </section>
    <section>
      <h2>Writing session recipe</h2>
      <p>Use this as the actual work loop: source first, draft second, one writing move at a time, then explicit human review before anything becomes canonical or publishable.</p>
      <div class="surfaces">{''.join(recipe_cards)}</div>
      <div class="moves">{move_chips}</div>
    </section>
    <section>
      <h2>Open the right surface</h2>
      <div class="surfaces">{''.join(surface_cards)}</div>
    </section>
    <section><p class="truth">{esc(packet.get('truth'))}</p></section>
  </main>
</body>
</html>
"""
    path.write_text(html_text, encoding="utf-8")


def main() -> int:
    parser = argparse.ArgumentParser(description="Build Nest writing momentum board.")
    parser.add_argument("nest_root", nargs="?", default=str(DEFAULT_NEST_ROOT))
    args = parser.parse_args()
    root = Path(args.nest_root).expanduser()
    packet = build_packet(root)
    out_dir = prepare_output(root)
    json_path = out_dir / "nest-writing-momentum-board.json"
    csv_path = out_dir / "nest-writing-momentum-board.csv"
    markdown_path = out_dir / "START-HERE-nest-writing-momentum-board.md"
    html_path = out_dir / "index.html"
    packet.update({
        "sessionDir": str(out_dir),
        "jsonPath": str(json_path),
        "csvPath": str(csv_path),
        "markdownPath": str(markdown_path),
        "htmlPath": str(html_path),
        "firstSafeAction": {
            "label": "Open Nest Writing Momentum Board",
            "command": f"open {shell_quote(str(html_path))}",
            "path": str(html_path),
            "safety": "Opens local writing momentum evidence only. No source files, manuscripts, publications, schedules, uploads, or receipts are changed.",
        },
    })
    write_json(json_path, packet)
    write_csv(csv_path, packet)
    write_markdown(markdown_path, packet)
    write_html(html_path, packet)
    pointer = root / "latest-nest-writing-momentum-board.json"
    write_json(pointer, packet)
    print(json.dumps({
        "status": packet["status"],
        "counts": packet["counts"],
        "htmlPath": str(html_path),
        "jsonPath": str(json_path),
        "latestPointer": str(pointer),
    }, indent=2, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
