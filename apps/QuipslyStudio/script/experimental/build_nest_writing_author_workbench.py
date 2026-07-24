#!/usr/bin/env python3
"""Build a focused Nest Writing Author Workbench.

This is the "sit down and write" surface. It reads the existing Nest writing
packets, chooses a small source-backed writing target, and creates a fresh
local scratchpad for drafting/revision notes. It does not mutate source files,
replace canonical manuscript text, publish, upload, schedule, approve, or create
receipt truth.
"""

from __future__ import annotations

import html
import json
import shlex
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


DEFAULT_NEST_ROOT = Path("/Volumes/My Passport/Quipsly Media Workspace/NestWriting")
LATEST_POINTER = "latest-nest-writing-author-workbench.json"
SCHEMA = "quipsly.nest-writing.author-workbench.v1"

POINTERS = {
    "startHere": "latest-nest-writing-start-here.json",
    "momentumBoard": "latest-nest-writing-momentum-board.json",
    "controlRoom": "latest-nest-writing-control-room.json",
    "authorDesk": "latest-nest-writing-author-desk.json",
    "revisionBatch": "latest-nest-writing-next-revision-batch.json",
    "nextCard": "latest-nest-writing-next-card.json",
    "ideaRouter": "latest-nest-idea-output-router.json",
    "draftPacket": "latest-nest-writing-draft-packet.json",
    "sourcePacket": "latest-nest-writing-source-packet.json",
    "publicationRunway": "latest-writing-publication-runway.json",
}


def iso_now() -> str:
    return datetime.now(timezone.utc).astimezone().isoformat(timespec="seconds")


def stamp() -> str:
    return datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S-%f-nest-writing-author-workbench")


def shell_quote(value: str) -> str:
    return shlex.quote(str(value))


def slugify(value: str) -> str:
    out: list[str] = []
    for char in value.lower():
        if char.isalnum():
            out.append(char)
        elif out and out[-1] != "-":
            out.append("-")
    return "".join(out).strip("-") or "writing-session"


def load_json(path: Path) -> dict[str, Any]:
    if not path.exists():
        return {}
    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        return {}
    if not isinstance(payload, dict):
        return {}
    target = payload.get("jsonPath") or payload.get("packetPath") or payload.get("latest")
    if target:
        target_path = Path(str(target))
        if target_path.exists() and target_path != path:
            target_payload = load_json(target_path)
            if target_payload:
                return {**payload, **target_payload}
    return payload


def write_json(path: Path, payload: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, indent=2, sort_keys=True) + "\n", encoding="utf-8")


def load_parts(root: Path) -> dict[str, dict[str, Any]]:
    return {key: load_json(root / filename) for key, filename in POINTERS.items()}


def counts_from(parts: dict[str, dict[str, Any]]) -> dict[str, Any]:
    control_counts = parts["controlRoom"].get("counts") if isinstance(parts["controlRoom"].get("counts"), dict) else {}
    start_counts = parts["startHere"].get("counts") if isinstance(parts["startHere"].get("counts"), dict) else {}
    momentum_counts = parts["momentumBoard"].get("counts") if isinstance(parts["momentumBoard"].get("counts"), dict) else {}
    revision_counts = parts["revisionBatch"].get("counts") if isinstance(parts["revisionBatch"].get("counts"), dict) else {}
    return {
        "sourceDocuments": int(control_counts.get("sourceDocuments") or start_counts.get("sourceDocuments") or momentum_counts.get("sourceDocuments") or 0),
        "sourceWords": int(control_counts.get("sourceWords") or start_counts.get("sourceWords") or momentum_counts.get("sourceWords") or 0),
        "draftPackets": int(control_counts.get("draftPackets") or start_counts.get("draftPackets") or momentum_counts.get("draftPackets") or 0),
        "pendingHumanReview": int(control_counts.get("pendingHumanReview") or start_counts.get("pendingHumanReview") or momentum_counts.get("pendingHumanReview") or 0),
        "dailyTasks": int(momentum_counts.get("dailyTasks") or start_counts.get("availableDailyTasks") or 0),
        "revisionBatchRows": int(revision_counts.get("batchRows") or start_counts.get("revisionBatchRows") or 0),
        "platformDraftItems": int(control_counts.get("platformDraftItems") or start_counts.get("platformDraftItems") or momentum_counts.get("platformDraftItems") or 0),
        "receiptSlots": int(control_counts.get("receiptSlots") or start_counts.get("receiptSlots") or momentum_counts.get("receiptSlots") or 0),
        "sourceFilesMutated": False,
        "canonicalManuscriptReplaced": False,
        "externalPublishing": False,
        "receiptTruthCreated": False,
    }


def first_path(payload: dict[str, Any]) -> str:
    first = payload.get("firstSafeAction") if isinstance(payload.get("firstSafeAction"), dict) else {}
    for key in ("htmlPath", "markdownPath", "jsonPath", "packetPath", "workbenchHtmlPath"):
        value = payload.get(key)
        if value:
            return str(value)
    value = first.get("path")
    return str(value) if value else ""


def first_command(payload: dict[str, Any]) -> str:
    first = payload.get("firstSafeAction") if isinstance(payload.get("firstSafeAction"), dict) else {}
    command = first.get("command")
    if command:
        return str(command)
    path = first_path(payload)
    return f"open {shell_quote(path)}" if path else ""


def first_task(parts: dict[str, dict[str, Any]]) -> dict[str, Any]:
    for source_name in ("authorDesk", "momentumBoard", "startHere", "controlRoom"):
        source = parts[source_name]
        for key in ("firstTask", "firstWritingTask", "dailyWritingFirstTask", "firstReviewTarget"):
            value = source.get(key)
            if isinstance(value, dict) and value:
                copied = dict(value)
                copied.setdefault("sourceSurface", source_name)
                return copied
    return {"title": "Open the next source-backed writing task", "taskId": "first", "sourceSurface": "fallback"}


def revision_items(parts: dict[str, dict[str, Any]], limit: int = 5) -> list[dict[str, Any]]:
    revision = parts["revisionBatch"]
    rows = revision.get("items") if isinstance(revision.get("items"), list) else revision.get("rows") if isinstance(revision.get("rows"), list) else []
    out: list[dict[str, Any]] = []
    for row in rows[:limit]:
        if not isinstance(row, dict):
            continue
        path = str(row.get("path") or row.get("htmlPath") or row.get("markdownPath") or "")
        out.append(
            {
                "title": str(row.get("title") or row.get("label") or row.get("id") or "Untitled revision card"),
                "queue": str(row.get("queue") or row.get("reviewStatus") or "review"),
                "nextSafestAction": str(row.get("nextSafestAction") or row.get("humanPrompt") or "Review against source and write one useful revision note."),
                "path": path,
                "openCommand": f"open {shell_quote(path)}" if path else "",
            }
        )
    return out


def surface_rows(parts: dict[str, dict[str, Any]]) -> list[dict[str, str]]:
    labels = {
        "startHere": "Writing Start Here",
        "momentumBoard": "Momentum board",
        "controlRoom": "Control room",
        "authorDesk": "Author desk",
        "revisionBatch": "Next revision batch",
        "nextCard": "Next card",
        "ideaRouter": "Idea/output router",
        "draftPacket": "Draft packet",
        "sourcePacket": "Source packet",
        "publicationRunway": "Publication runway",
    }
    rows: list[dict[str, str]] = []
    for key, label in labels.items():
        payload = parts[key]
        path = first_path(payload)
        rows.append(
            {
                "key": key,
                "label": label,
                "status": str(payload.get("status") or "missing"),
                "path": path,
                "openCommand": first_command(payload),
            }
        )
    return rows


def write_scratchpad(path: Path, payload: dict[str, Any]) -> None:
    task = payload["firstTask"]
    counts = payload["counts"]
    source_command = task.get("openFirstSource") or payload["commands"]["openSourcePacket"]
    draft_command = task.get("openExistingDraftPacket") or payload["commands"]["openDraftPacket"]
    lines = [
        "# Quipsly writing scratchpad",
        "",
        f"Created: {payload['generatedAt']}",
        f"Focus: {task.get('title') or 'Untitled writing task'}",
        f"Task id: {task.get('taskId') or 'first'}",
        "",
        "This file is intentionally a scratchpad. It is not canonical manuscript truth.",
        "",
        "## Open first",
        "",
        f"- Source/evidence: `{source_command or 'open source packet from workbench'}`",
        f"- Draft/revision packet: `{draft_command or 'open draft packet from workbench'}`",
        "",
        "## Session contract",
        "",
        "- Draft freely, but never secretly.",
        "- Preserve the source trail.",
        "- Keep canon, scratch drafts, review notes, and publication packets separate.",
        "- Do not treat this file as published, approved, or final.",
        "",
        "## Current context",
        "",
        f"- Source documents: {counts['sourceDocuments']}",
        f"- Source words: {counts['sourceWords']}",
        f"- Draft packets: {counts['draftPackets']}",
        f"- Pending review: {counts['pendingHumanReview']}",
        f"- Platform draft items: {counts['platformDraftItems']}",
        "",
        "## Fresh writing",
        "",
        "<write here>",
        "",
        "## Revision notes",
        "",
        "- ",
        "",
        "## Source questions / checks",
        "",
        "- ",
        "",
        "## Tags and output routes",
        "",
        "- Book section:",
        "- Article:",
        "- Episode page:",
        "- Short/social:",
        "- Quote card:",
        "- Research note:",
        "",
        "## Next action when done",
        "",
        "- Decide whether this scratchpad should become: hold, revise, source-check, draft packet, or canon candidate.",
        "",
    ]
    path.write_text("\n".join(lines), encoding="utf-8")


def build_payload(root: Path) -> dict[str, Any]:
    parts = load_parts(root)
    task = first_task(parts)
    counts = counts_from(parts)
    out_dir = root / "AuthorWorkbenches" / stamp()
    out_dir.mkdir(parents=True, exist_ok=True)
    scratchpad_path = out_dir / f"{slugify(str(task.get('title') or task.get('taskId') or 'writing-session'))}-scratchpad.md"
    commands = {
        "openScratchpad": f"open {shell_quote(str(scratchpad_path))}",
        "openSourcePacket": first_command(parts["sourcePacket"]),
        "openDraftPacket": first_command(parts["draftPacket"]),
        "openRevisionBatch": first_command(parts["revisionBatch"]),
        "openIdeaRouter": first_command(parts["ideaRouter"]),
        "openPublicationRunway": first_command(parts["publicationRunway"]),
    }
    payload = {
        "schema": SCHEMA,
        "generatedAt": iso_now(),
        "status": "nest-writing-author-workbench-ready",
        "nestRoot": str(root),
        "sessionDir": str(out_dir),
        "scratchpadPath": str(scratchpad_path),
        "scratchpadOpenCommand": commands["openScratchpad"],
        "firstTask": task,
        "counts": counts,
        "commands": commands,
        "surfaces": surface_rows(parts),
        "revisionItems": revision_items(parts),
        "humanAsk": "Open the scratchpad and source trail, then write or revise one small useful piece without replacing canonical manuscript text.",
        "nextSafestAction": "Open the scratchpad, open the source trail, write one focused draft/revision, and leave canon/publication decisions explicit.",
        "truth": "Author workbench only. It creates a new local scratchpad and reads local writing packets; it does not mutate source files, replace canonical manuscript text, publish, upload, schedule, approve, overwrite, delete, mutate accounts, or create receipt truth.",
        "safety": {
            "sourceFilesMutated": False,
            "canonicalManuscriptReplaced": False,
            "externalPublishing": False,
            "externalSchedulesCreated": False,
            "accountMutation": False,
            "receiptTruthCreated": False,
            "versionsOverwritten": False,
        },
    }
    write_scratchpad(scratchpad_path, payload)
    return payload


def render_html(payload: dict[str, Any]) -> str:
    counts = payload["counts"]
    task = payload["firstTask"]
    command_cards = "\n".join(
        f"""
        <article class="card action">
          <div class="pill">{html.escape(key.replace('open', '') or 'open')}</div>
          <h3>{html.escape(label)}</h3>
          <code>{html.escape(command or 'No command available')}</code>
        </article>
        """
        for key, label, command in [
            ("openScratchpad", "Open scratchpad", payload["commands"]["openScratchpad"]),
            ("openSourcePacket", "Open source trail", payload["commands"]["openSourcePacket"]),
            ("openDraftPacket", "Open draft packet", payload["commands"]["openDraftPacket"]),
            ("openRevisionBatch", "Open revision batch", payload["commands"]["openRevisionBatch"]),
            ("openIdeaRouter", "Open idea router", payload["commands"]["openIdeaRouter"]),
        ]
    )
    revision_cards = "\n".join(
        f"""
        <article class="card">
          <div class="pill">{html.escape(row['queue'])}</div>
          <h3>{html.escape(row['title'])}</h3>
          <p>{html.escape(row['nextSafestAction'])}</p>
          <code>{html.escape(row['openCommand'] or row['path'] or 'No path')}</code>
        </article>
        """
        for row in payload["revisionItems"]
    ) or '<article class="card"><div class="pill">revision</div><h3>No revision cards found</h3><p>Use the scratchpad and source packet for a fresh writing session.</p></article>'
    surface_rows = "\n".join(
        f"<tr><th>{html.escape(row['label'])}</th><td>{html.escape(row['status'])}</td><td>{html.escape(row['openCommand'] or row['path'])}</td></tr>"
        for row in payload["surfaces"]
    )
    return f"""<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Nest Writing Author Workbench</title>
  <style>
    :root {{ color-scheme: light dark; --bg:#f5eddd; --ink:#31291f; --muted:#776b58; --card:rgba(255,252,242,.93); --leaf:#2f6f4e; --honey:#d49a31; }}
    body {{ margin:0; color:var(--ink); font-family:ui-rounded,"Avenir Next","Gill Sans",system-ui,sans-serif; background:radial-gradient(circle at 8% 8%,rgba(47,111,78,.17),transparent 28rem),radial-gradient(circle at 88% 10%,rgba(212,154,49,.22),transparent 30rem),linear-gradient(180deg,#fff8ea,var(--bg)); }}
    main {{ max-width:1240px; margin:auto; padding:42px 24px 72px; }}
    .eyebrow {{ color:var(--leaf); font-size:.75rem; font-weight:950; letter-spacing:.18em; text-transform:uppercase; }}
    h1 {{ margin:.3rem 0 1rem; font-size:clamp(2.8rem,6vw,5.7rem); line-height:.9; letter-spacing:-.065em; }}
    .deck {{ max-width:880px; color:var(--muted); font-size:1.12rem; line-height:1.6; }}
    .hero {{ display:grid; grid-template-columns:minmax(0,1fr) 320px; gap:18px; align-items:stretch; }}
    .panel,.card,.stat {{ background:var(--card); border:1px solid rgba(49,41,31,.13); border-radius:28px; padding:22px; box-shadow:0 18px 44px rgba(49,41,31,.08); }}
    .stats,.grid {{ display:grid; grid-template-columns:repeat(auto-fit,minmax(220px,1fr)); gap:14px; margin-top:20px; }}
    .stat strong {{ display:block; font-size:2.1rem; letter-spacing:-.05em; }}
    .pill {{ display:inline-flex; padding:5px 9px; border-radius:999px; background:rgba(47,111,78,.13); color:var(--leaf); text-transform:uppercase; font-weight:950; font-size:.72rem; letter-spacing:.08em; }}
    .primary {{ background:linear-gradient(135deg,rgba(47,111,78,.16),rgba(212,154,49,.16)); }}
    code {{ display:block; border-radius:14px; padding:12px; background:rgba(49,41,31,.08); overflow-wrap:anywhere; }}
    table {{ width:100%; border-collapse:collapse; margin-top:16px; border-radius:18px; overflow:hidden; background:var(--card); }}
    th,td {{ padding:11px 12px; border-bottom:1px solid rgba(49,41,31,.1); text-align:left; vertical-align:top; }}
    th {{ width:230px; }}
    @media (max-width:900px) {{ .hero {{ grid-template-columns:1fr; }} }}
  </style>
</head>
<body>
<main>
  <div class="eyebrow">Quipsly Nest</div>
  <h1>Author Workbench</h1>
  <p class="deck">A focused place to begin real writing: open the source trail, write in a fresh scratchpad, route ideas, and keep canon/publication truth separate.</p>
  <section class="hero">
    <article class="panel primary">
      <div class="pill">write now</div>
      <h2>{html.escape(str(task.get('title') or 'Open the next writing task'))}</h2>
      <p>{html.escape(payload['humanAsk'])}</p>
      <code>{html.escape(payload['scratchpadOpenCommand'])}</code>
      <p><strong>Scratchpad:</strong> {html.escape(payload['scratchpadPath'])}</p>
    </article>
    <aside class="panel">
      <div class="pill">boundary</div>
      <p>{html.escape(payload['truth'])}</p>
    </aside>
  </section>
  <section class="stats">
    <div class="stat"><div class="pill">sources</div><strong>{counts['sourceDocuments']}</strong><span>{counts['sourceWords']} source words</span></div>
    <div class="stat"><div class="pill">drafts</div><strong>{counts['draftPackets']}</strong><span>{counts['pendingHumanReview']} pending review</span></div>
    <div class="stat"><div class="pill">today</div><strong>{counts['dailyTasks']}</strong><span>daily task(s)</span></div>
    <div class="stat"><div class="pill">routes</div><strong>{counts['platformDraftItems']}</strong><span>platform draft items, no receipts</span></div>
  </section>
  <h2>Open your tools</h2>
  <section class="grid">{command_cards}</section>
  <h2>Revision cards worth touching</h2>
  <section class="grid">{revision_cards}</section>
  <h2>Artifact map</h2>
  <table>{surface_rows}</table>
</main>
</body>
</html>
"""


def render_markdown(payload: dict[str, Any]) -> str:
    task = payload["firstTask"]
    counts = payload["counts"]
    lines = [
        "# Nest Writing Author Workbench",
        "",
        f"Status: `{payload['status']}`",
        f"Generated: `{payload['generatedAt']}`",
        "",
        "## Write now",
        "",
        f"- Focus: `{task.get('title') or 'Open the next writing task'}`",
        f"- Scratchpad: `{payload['scratchpadPath']}`",
        f"- Open scratchpad: `{payload['scratchpadOpenCommand']}`",
        "",
        "## Counts",
        "",
        f"- Source documents: `{counts['sourceDocuments']}`",
        f"- Source words: `{counts['sourceWords']}`",
        f"- Draft packets: `{counts['draftPackets']}`",
        f"- Pending review: `{counts['pendingHumanReview']}`",
        f"- Platform draft items: `{counts['platformDraftItems']}`",
        "",
        "## Commands",
    ]
    for key, command in payload["commands"].items():
        lines.append(f"- {key}: `{command or 'missing'}`")
    lines += ["", "## Boundary", payload["truth"], ""]
    return "\n".join(lines)


def main() -> int:
    root = Path(sys.argv[1]) if len(sys.argv) > 1 and sys.argv[1] else DEFAULT_NEST_ROOT
    payload = build_payload(root)
    out_dir = Path(payload["sessionDir"])
    json_path = out_dir / "nest-writing-author-workbench.json"
    html_path = out_dir / "index.html"
    markdown_path = out_dir / "START-HERE-nest-writing-author-workbench.md"
    payload.update({"jsonPath": str(json_path), "htmlPath": str(html_path), "markdownPath": str(markdown_path)})
    write_json(json_path, payload)
    html_path.write_text(render_html(payload), encoding="utf-8")
    markdown_path.write_text(render_markdown(payload), encoding="utf-8")
    pointer = {
        "schema": "quipsly.nest-writing.authorWorkbenchPointer.v1",
        "updatedAt": payload["generatedAt"],
        "status": payload["status"],
        "htmlPath": str(html_path),
        "markdownPath": str(markdown_path),
        "jsonPath": str(json_path),
        "scratchpadPath": payload["scratchpadPath"],
        "scratchpadOpenCommand": payload["scratchpadOpenCommand"],
        "counts": payload["counts"],
        "firstSafeAction": {
            "label": "Open Author Workbench",
            "command": f"open {shell_quote(str(html_path))}",
            "path": str(html_path),
            "safety": "Opens local writing workbench only. No source/canon/publication mutation.",
        },
        "truth": payload["truth"],
    }
    write_json(root / LATEST_POINTER, pointer)
    print(json.dumps(pointer, indent=2, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
