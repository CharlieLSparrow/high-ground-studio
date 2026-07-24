#!/usr/bin/env python3
"""Build a calm author desk over the current Nest writing packets.

This is not a writing engine and not a manuscript mutator. It reads the latest
daily writing packet, source packet, draft pointer, and publication runway, then
creates one human/agent work surface that answers: what should I open, draft,
review, or ask next?
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
DEFAULT_SOURCE_ROOT = Path("/Users/wall-e/Dev/high-ground-studio/apps/web/content/books/learning-to-lead")
SCHEMA = "quipsly.nest-writing.author-desk.v1"
LATEST_POINTER = "latest-nest-writing-author-desk.json"


def iso_now() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def stamp() -> str:
    return datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S-author-desk")


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


def shell_quote(value: str) -> str:
    return "'" + value.replace("'", "'\\''") + "'"


def esc(value: Any) -> str:
    return html.escape(str(value or ""))


def read_text_excerpt(path: Path, max_chars: int = 1100) -> str:
    if not path.exists() or not path.is_file():
        return ""
    try:
        text = path.read_text(encoding="utf-8", errors="replace")
    except Exception:
        return ""
    clean = "\n".join(line.rstrip() for line in text.splitlines()).strip()
    if len(clean) <= max_chars:
        return clean
    return clean[:max_chars].rstrip() + "..."


def load_daily_packet(nest_root: Path) -> tuple[dict[str, Any], dict[str, Any]]:
    pointer = load_json(nest_root / "latest-nest-writing-daily-packet.json")
    packet = load_json(Path(str(pointer.get("jsonPath") or ""))) if pointer.get("jsonPath") else {}
    if not pointer or not packet:
        raise SystemExit("No daily writing packet found. Run ./script/agentctl.sh nest-writing-daily-packet first.")
    return pointer, packet


def latest_drafts_by_task(nest_root: Path) -> dict[str, dict[str, Any]]:
    drafts_root = nest_root / "DraftPackets"
    by_task: dict[str, dict[str, Any]] = {}
    if not drafts_root.exists():
        return by_task
    for packet_path in drafts_root.glob("*/draft-packet.json"):
        packet = load_json(packet_path)
        task_id = str(packet.get("taskId") or "")
        if not task_id:
            continue
        current = by_task.get(task_id)
        if not current or packet_path.stat().st_mtime > Path(str(current.get("jsonPath") or packet_path)).stat().st_mtime:
            by_task[task_id] = {
                "taskId": task_id,
                "title": packet.get("title") or "",
                "jsonPath": str(packet_path),
                "htmlPath": str(packet_path.parent / "index.html"),
                "markdownPath": str(packet_path.parent / "START-HERE-draft-packet.md"),
                "status": packet.get("status") or "draft-preview-needs-human-review",
                "sourceCount": len(packet.get("sources") or []),
                "nextSafestAction": packet.get("nextSafestAction") or "",
            }
    return by_task


def source_summary(source_root: Path, source_trail: list[dict[str, Any]]) -> list[dict[str, Any]]:
    sources: list[dict[str, Any]] = []
    for source in source_trail:
        if not isinstance(source, dict):
            continue
        relative_path = str(source.get("relativePath") or "")
        source_path = source_root / relative_path if relative_path else Path("")
        sources.append({
            "id": source.get("id") or "",
            "title": source.get("title") or Path(relative_path).stem,
            "relativePath": relative_path,
            "sourcePath": str(source_path) if relative_path else "",
            "wordCount": source.get("wordCount") or 0,
            "tags": source.get("tags") or [],
            "excerpt": read_text_excerpt(source_path),
            "openCommand": f"open {shell_quote(str(source_path))}" if relative_path else "",
        })
    return sources


def author_desk_contract(counts: dict[str, Any], first_task: dict[str, Any]) -> dict[str, Any]:
    return {
        "mode": "source-backed-authoring",
        "humanOwnsCanonicalText": True,
        "assistantMayDraft": True,
        "assistantMayRewrite": True,
        "assistantMustKeepSourceTrailVisible": True,
        "canonicalWriteBlocked": True,
        "publicationBlocked": True,
        "receiptTruthRequiresExternalUrl": True,
        "firstTaskTitle": first_task.get("title") or "",
        "summary": "Quipsly can draft, rewrite, and prepare serious publishable material here; it cannot secretly replace the living manuscript or pretend publication happened.",
        "counts": counts,
    }


def author_source_tasks(first_task: dict[str, Any]) -> list[dict[str, str]]:
    title = str(first_task.get("title") or "the first source-backed task")
    return [
        {
            "label": "Open Author Desk",
            "why": f"Start with {title} and its visible source trail.",
            "safety": "Local writing task evidence only.",
        },
        {
            "label": "Generate or open draft packet",
            "why": "Create enough text to actually work with instead of waiting on blank-page courage.",
            "safety": "Draft packet only; no canonical manuscript replacement.",
        },
        {
            "label": "Compare draft to sources",
            "why": "Catch assumptions, missing citations, tone drift, or places where AI prose needs human ownership.",
            "safety": "Review/analysis only.",
        },
        {
            "label": "Choose revise/promote/hold",
            "why": "Human decides what becomes part of the living book, article, or publication packet.",
            "safety": "Requires a separate explicit save/publish path.",
        },
    ]


def small_session_plan(task: dict[str, Any], sources: list[dict[str, Any]]) -> dict[str, Any]:
    word_count = int(task.get("wordCount") or 0)
    estimated_sessions = max(1, min(24, (word_count + 1799) // 1800))
    if word_count >= 20000:
        session_shape = "split-before-rewrite"
        first_goal = "Find the first natural boundary and create a smaller revision target before drafting new prose."
    elif word_count >= 8000:
        session_shape = "section-map"
        first_goal = "Map the section into scenes/claims/moves, then choose one subsection for a source-backed draft pass."
    else:
        session_shape = "draft-or-revise"
        first_goal = "Draft, rewrite, or revise one complete subsection with the source trail visible."
    first_source = sources[0] if sources else {}
    return {
        "sessionShape": session_shape,
        "estimatedTwentyFiveMinuteSessions": estimated_sessions,
        "firstGoal": first_goal,
        "startHere": [
            "Open the first source and existing draft packet.",
            "Write a 5-bullet map of what this section is trying to do.",
            "Choose one subsection or claim, not the whole document.",
            "Draft or rewrite a small passage with source uncertainty visible.",
            "End by writing a next-pass note instead of polishing forever.",
        ],
        "twentyFiveMinutePlan": [
            "0-3 min: open source trail and draft packet",
            "3-8 min: mark the smallest useful target",
            "8-20 min: draft/rewrite/outline that target",
            "20-24 min: compare against source and flag uncertainty",
            "24-25 min: record next action",
        ],
        "sourceToOpenFirst": first_source.get("sourcePath") or "",
        "openFirstSourceCommand": first_source.get("openCommand") or "",
        "truth": "Small-session plan only. It does not mutate sources, replace canonical manuscript text, publish, upload, schedule, or create receipts.",
    }


def normalize_task(rank: int, task: dict[str, Any], source_root: Path, drafts_by_task: dict[str, dict[str, Any]]) -> dict[str, Any]:
    task_id = str(task.get("taskId") or "")
    draft = drafts_by_task.get(task_id, {})
    commands = task.get("safeLocalCommands") if isinstance(task.get("safeLocalCommands"), list) else []
    draft_command = ""
    for command in commands:
        if isinstance(command, dict) and command.get("command"):
            draft_command = str(command["command"])
            break
    if not draft_command and task_id:
        draft_command = f"./script/agentctl.sh nest-writing-draft-packet {task_id}"
    sources = source_summary(source_root, [s for s in (task.get("sourceTrail") or []) if isinstance(s, dict)])
    session_plan = small_session_plan(task, sources)
    task_type = task.get("type") or task.get("focus") or "writing"
    safe_next = task.get("safeNextAction") or ""
    human_ask = (
        "Read the source excerpt and draft packet, then decide whether the next useful move is outline, rewrite, expand, cut, cite, or hold. "
        "Treat generated prose as inspectable draft material, not canonical manuscript replacement."
    )
    agent_safe_parallel_work = (
        "Prepare outline options, source-backed revision notes, quote/citation trails, platform draft packets, and comparison summaries. "
        "Do not write back to source files, replace canonical manuscript text, publish, schedule, upload, or create receipt truth."
    )
    writing_contract = {
        "mode": "source-backed-drafting",
        "humanOwnsCanonicalText": True,
        "assistantMayDraft": True,
        "assistantMustKeepSourceTrailVisible": True,
        "canonicalWriteBlocked": True,
        "publicationBlocked": True,
        "summary": "Draft freely, but never secretly. Every draft should make its source trail and human approval boundary visible.",
    }
    return {
        "rank": rank,
        "taskId": task_id,
        "title": task.get("title") or task_id,
        "type": task_type,
        "status": task.get("status") or "ready-to-draft-with-provenance",
        "wordCount": task.get("wordCount") or 0,
        "sourceCount": task.get("sourceCount") or len(sources),
        "safeNextAction": safe_next,
        "humanAsk": human_ask,
        "agentSafeParallelWork": agent_safe_parallel_work,
        "writingContract": writing_contract,
        "writingPrompt": task.get("writingPrompt") or "",
        "researchPrompt": task.get("researchPrompt") or "",
        "smallSessionPlan": session_plan,
        "blockedActions": task.get("blockedActions") or [],
        "humanReviewRequired": bool(task.get("humanReviewRequired", True)),
        "sources": sources,
        "draftPacket": draft,
        "safeLocalCommands": {
            "generateDraftPacket": draft_command,
            "openExistingDraftPacket": f"open {shell_quote(str(draft.get('htmlPath')))}" if draft.get("htmlPath") else "",
            "openFirstSource": sources[0]["openCommand"] if sources else "",
        },
        "truth": "Author Desk task only. It does not mutate sources, replace canonical manuscript, publish, schedule, upload, or create receipts.",
    }


def build_packet(nest_root: Path, source_root: Path, limit: int) -> dict[str, Any]:
    daily_pointer, daily_packet = load_daily_packet(nest_root)
    drafts_by_task = latest_drafts_by_task(nest_root)
    source_pointer = load_json(nest_root / "latest-nest-writing-source-packet.json")
    runway_pointer = load_json(nest_root / "latest-writing-publication-runway.json")
    session_pointer = load_json(nest_root / "latest-nest-writing-session-cockpit.json")
    tasks = [task for task in daily_packet.get("dailyTasks") or [] if isinstance(task, dict)]
    desk_tasks = [normalize_task(rank, task, source_root, drafts_by_task) for rank, task in enumerate(tasks[: max(1, limit)], start=1)]
    existing_drafts = sum(1 for task in desk_tasks if task.get("draftPacket"))
    source_files = sum(len(task.get("sources") or []) for task in desk_tasks)
    first_task = desk_tasks[0] if desk_tasks else {}
    first_task_commands = first_task.get("safeLocalCommands") if isinstance(first_task.get("safeLocalCommands"), dict) else {}
    first_task_draft = first_task.get("draftPacket") if isinstance(first_task.get("draftPacket"), dict) else {}
    first_task_summary = {
        "rank": first_task.get("rank") or 0,
        "taskId": first_task.get("taskId") or "",
        "title": first_task.get("title") or "",
        "type": first_task.get("type") or "",
        "status": first_task.get("status") or "",
        "wordCount": first_task.get("wordCount") or 0,
        "sourceCount": first_task.get("sourceCount") or 0,
        "smallSessionPlan": first_task.get("smallSessionPlan") or {},
        "safeNextAction": first_task.get("safeNextAction") or "",
        "humanAsk": first_task.get("humanAsk") or "",
        "agentSafeParallelWork": first_task.get("agentSafeParallelWork") or "",
        "writingContract": first_task.get("writingContract") or {},
        "draftPacketCommand": first_task_commands.get("generateDraftPacket") or "",
        "openExistingDraftPacket": first_task_commands.get("openExistingDraftPacket") or "",
        "openFirstSource": first_task_commands.get("openFirstSource") or "",
        "existingDraftPacketHtml": first_task_draft.get("htmlPath") or "",
        "commandSafety": "Local draft packet/source opening only. No source files, manuscripts, publications, schedules, uploads, or receipts are changed.",
    }
    counts = {
        "deskTasks": len(desk_tasks),
        "availableDailyTasks": len(tasks),
        "tasksWithExistingDraftPackets": existing_drafts,
        "sourceFilesLinked": source_files,
        "sourceFilesMutated": False,
        "canonicalManuscriptReplaced": False,
        "externalPublishing": False,
        "receiptTruthCreated": False,
    }
    contract = author_desk_contract(counts, first_task_summary)
    source_tasks = author_source_tasks(first_task_summary)
    return {
        "schema": SCHEMA,
        "generatedAt": iso_now(),
        "status": "author-desk-ready",
        "nestRoot": str(nest_root),
        "sourceRoot": str(source_root),
        "sourceDailyPacketPointer": str(nest_root / "latest-nest-writing-daily-packet.json"),
        "sourceDailyPacketJson": daily_pointer.get("jsonPath") or daily_packet.get("jsonPath") or "",
        "sourceDailyPacketHtml": daily_pointer.get("htmlPath") or daily_packet.get("htmlPath") or "",
        "sourceWorkbenchHtml": source_pointer.get("workbenchHtmlPath") or "",
        "sourceRunwayHtml": runway_pointer.get("htmlPath") or "",
        "sourceSessionCockpitHtml": session_pointer.get("htmlPath") or "",
        "truth": "Author Desk only. It opens and arranges source-backed writing tasks; it never mutates sources, publishes, uploads, schedules, replaces manuscripts, or creates receipts.",
        "humanAsk": "Open the first task, read the source trail, then decide whether to draft, rewrite, expand, cut, cite, promote, or hold.",
        "agentSafeParallelWork": "Draft examples, rewrite variants, outline options, source comparisons, citation trails, and platform copy. Do not mutate sources, replace canonical manuscript text, publish, schedule, upload, or create receipts.",
        "writingContract": contract,
        "sourceContract": contract,
        "sourceTasks": source_tasks,
        "counts": counts,
        "tasks": desk_tasks,
        "firstTask": first_task_summary,
        "nextSafestAction": "Open the first Author Desk task, read its source excerpt, then generate or review a draft packet with the source trail visible.",
    }


def prepare_output_dir(nest_root: Path) -> Path:
    base = nest_root / "AuthorDesk" / stamp()
    out_dir = base
    counter = 2
    while out_dir.exists():
        out_dir = Path(f"{base}-{counter}")
        counter += 1
    out_dir.mkdir(parents=True, exist_ok=False)
    return out_dir


def write_csv(path: Path, packet: dict[str, Any]) -> None:
    fields = ["rank", "taskId", "title", "type", "wordCount", "sourceCount", "sessionShape", "estimatedTwentyFiveMinuteSessions", "firstGoal", "existingDraftPacket", "safeNextAction", "humanAsk", "agentSafeParallelWork", "writingMode", "generateDraftPacketCommand", "openExistingDraftCommand", "openFirstSourceCommand"]
    with path.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=fields)
        writer.writeheader()
        for task in packet.get("tasks") or []:
            commands = task.get("safeLocalCommands") if isinstance(task.get("safeLocalCommands"), dict) else {}
            plan = task.get("smallSessionPlan") if isinstance(task.get("smallSessionPlan"), dict) else {}
            writer.writerow({
                "rank": task.get("rank", ""),
                "taskId": task.get("taskId", ""),
                "title": task.get("title", ""),
                "type": task.get("type", ""),
                "wordCount": task.get("wordCount", ""),
                "sourceCount": task.get("sourceCount", ""),
                "sessionShape": plan.get("sessionShape", ""),
                "estimatedTwentyFiveMinuteSessions": plan.get("estimatedTwentyFiveMinuteSessions", ""),
                "firstGoal": plan.get("firstGoal", ""),
                "existingDraftPacket": (task.get("draftPacket") or {}).get("htmlPath", "") if isinstance(task.get("draftPacket"), dict) else "",
                "safeNextAction": task.get("safeNextAction", ""),
                "humanAsk": task.get("humanAsk", ""),
                "agentSafeParallelWork": task.get("agentSafeParallelWork", ""),
                "writingMode": (task.get("writingContract") or {}).get("mode", "") if isinstance(task.get("writingContract"), dict) else "",
                "generateDraftPacketCommand": commands.get("generateDraftPacket", ""),
                "openExistingDraftCommand": commands.get("openExistingDraftPacket", ""),
                "openFirstSourceCommand": commands.get("openFirstSource", ""),
            })


def render_task(task: dict[str, Any]) -> str:
    commands = task.get("safeLocalCommands") if isinstance(task.get("safeLocalCommands"), dict) else {}
    draft = task.get("draftPacket") if isinstance(task.get("draftPacket"), dict) else {}
    blocked = "".join(f"<span>{esc(action)}</span>" for action in task.get("blockedActions") or [])
    sources = []
    for source in task.get("sources") or []:
        tags = " ".join(f"<span>{esc(tag)}</span>" for tag in source.get("tags") or [])
        excerpt = esc(source.get("excerpt") or "No source excerpt available.")
        sources.append(f"""
        <article class="source">
          <div class="source-top"><strong>{esc(source.get('title'))}</strong><small>{esc(source.get('wordCount'))} words</small></div>
          <div class="tags">{tags}</div>
          <p>{excerpt}</p>
          <pre>{esc(source.get('openCommand'))}</pre>
        </article>
        """)
    draft_html = (
        f"<a class=\"pill primary\" href=\"file://{esc(draft.get('htmlPath'))}\">Open current draft packet</a>"
        if draft.get("htmlPath")
        else "<span class=\"pill muted\">No current draft packet yet</span>"
    )
    contract = task.get("writingContract") if isinstance(task.get("writingContract"), dict) else {}
    session_plan = task.get("smallSessionPlan") if isinstance(task.get("smallSessionPlan"), dict) else {}
    twenty_five = "".join(f"<li>{esc(step)}</li>" for step in session_plan.get("twentyFiveMinutePlan") or [])
    start_here = "".join(f"<li>{esc(step)}</li>" for step in session_plan.get("startHere") or [])
    return f"""
    <section class="task">
      <div class="rank">#{esc(task.get('rank'))}</div>
      <div class="task-main">
        <div class="topline">
          <div>
            <p class="eyebrow">{esc(task.get('type'))} · {esc(task.get('status'))}</p>
            <h2>{esc(task.get('title'))}</h2>
          </div>
          <div class="metric">{esc(task.get('wordCount'))}<small>words</small></div>
        </div>
        <p class="next">{esc(task.get('safeNextAction'))}</p>
        <div class="contract">
          <h3>Writing contract</h3>
          <p>{esc(contract.get('summary') or 'Draft with the source trail visible; do not mutate canonical text from this desk.')}</p>
          <div class="actions">
            <span class="pill">Assistant may draft: {esc(contract.get('assistantMayDraft'))}</span>
            <span class="pill">Source trail visible: {esc(contract.get('assistantMustKeepSourceTrailVisible'))}</span>
            <span class="pill">Canonical write blocked: {esc(contract.get('canonicalWriteBlocked'))}</span>
          </div>
        </div>
        <div class="session-plan">
          <h3>Small-session plan</h3>
          <p><strong>{esc(session_plan.get('sessionShape'))}</strong> · about {esc(session_plan.get('estimatedTwentyFiveMinuteSessions'))} focused 25-minute pass(es)</p>
          <p>{esc(session_plan.get('firstGoal'))}</p>
          <div class="prompts">
            <article><h3>Start here</h3><ol>{start_here}</ol></article>
            <article><h3>25-minute rhythm</h3><ol>{twenty_five}</ol></article>
          </div>
          <p class="truth">{esc(session_plan.get('truth'))}</p>
        </div>
        <div class="prompts">
          <article><h3>Human ask</h3><p>{esc(task.get('humanAsk'))}</p></article>
          <article><h3>Agent-safe parallel work</h3><p>{esc(task.get('agentSafeParallelWork'))}</p></article>
        </div>
        <div class="actions">
          {draft_html}
          <span class="pill">Sources: {esc(task.get('sourceCount'))}</span>
          <span class="pill">Human review required</span>
        </div>
        <div class="blocked">{blocked}</div>
        <div class="prompts">
          <article><h3>Writing prompt</h3><p>{esc(task.get('writingPrompt'))}</p></article>
          <article><h3>Research prompt</h3><p>{esc(task.get('researchPrompt'))}</p></article>
        </div>
        <h3>Source trail</h3>
        <div class="sources">{''.join(sources) if sources else '<p>No source trail carried.</p>'}</div>
        <details>
          <summary>Safe local commands</summary>
          <p class="label">Generate/review draft packet</p><pre>{esc(commands.get('generateDraftPacket'))}</pre>
          <p class="label">Open existing draft packet</p><pre>{esc(commands.get('openExistingDraftPacket'))}</pre>
          <p class="label">Open first source</p><pre>{esc(commands.get('openFirstSource'))}</pre>
        </details>
      </div>
    </section>
    """


def render_html(packet: dict[str, Any]) -> str:
    counts = packet.get("counts") if isinstance(packet.get("counts"), dict) else {}
    tasks = "\n".join(render_task(task) for task in packet.get("tasks") or [])
    return f"""<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>Nest Author Desk</title>
  <style>
    :root {{ --bg:#f5efe2; --ink:#3f3025; --muted:#796b5a; --leaf:#2f7d52; --moss:#78915f; --gold:#b7893f; --panel:#fffaf0; --line:rgba(63,48,37,.16); --shadow:0 24px 80px rgba(63,48,37,.12); }}
    * {{ box-sizing:border-box; }}
    body {{ margin:0; color:var(--ink); background:radial-gradient(circle at 8% 0%, rgba(120,145,95,.28), transparent 34%), radial-gradient(circle at 96% 0%, rgba(183,137,63,.18), transparent 32%), var(--bg); font-family:Avenir Next, Helvetica Neue, sans-serif; }}
    header {{ padding:40px clamp(20px,5vw,76px) 28px; }}
    .eyebrow {{ margin:0; color:var(--gold); text-transform:uppercase; letter-spacing:.22em; font-size:12px; font-weight:900; }}
    h1 {{ margin:10px 0; max-width:960px; font-size:clamp(42px,7vw,86px); line-height:.9; }}
    header p {{ max-width:900px; color:var(--muted); line-height:1.55; font-size:18px; }}
    .stats,.actions,.blocked,.tags {{ display:flex; flex-wrap:wrap; gap:8px; }}
    .stats span,.pill,.blocked span,.tags span {{ display:inline-flex; border:1px solid var(--line); border-radius:999px; padding:7px 11px; font-size:12px; font-weight:900; color:var(--muted); background:rgba(255,255,255,.55); }}
    .pill.primary {{ color:white; background:var(--leaf); text-decoration:none; }}
    .pill.muted {{ color:var(--muted); }}
    .blocked span {{ color:#9b4a37; background:rgba(155,74,55,.08); }}
    main {{ display:grid; gap:18px; padding:0 clamp(16px,4vw,64px) 72px; }}
    .task {{ display:grid; grid-template-columns:72px 1fr; gap:18px; border:1px solid var(--line); border-radius:28px; background:linear-gradient(145deg, rgba(255,250,240,.96), rgba(238,226,203,.92)); box-shadow:var(--shadow); padding:20px; }}
    .rank {{ display:grid; place-items:center; align-self:start; height:58px; border-radius:20px; color:white; background:linear-gradient(135deg, var(--leaf), var(--moss)); font-weight:1000; }}
    .topline {{ display:flex; justify-content:space-between; gap:20px; align-items:start; }}
    h2 {{ margin:4px 0 8px; font-size:clamp(26px,4vw,46px); }}
    .metric {{ min-width:92px; border-radius:22px; padding:12px; color:var(--leaf); background:rgba(47,125,82,.1); text-align:center; font-size:24px; font-weight:1000; }}
    .metric small {{ display:block; color:var(--muted); font-size:11px; text-transform:uppercase; letter-spacing:.12em; }}
    .next {{ color:var(--ink); font-weight:800; }}
    .prompts {{ display:grid; grid-template-columns:repeat(auto-fit,minmax(260px,1fr)); gap:12px; margin-top:16px; }}
    .prompts article,.source,details {{ border:1px solid var(--line); border-radius:18px; padding:14px; background:rgba(255,255,255,.5); }}
    .contract {{ border:1px solid rgba(47,125,82,.22); border-radius:18px; padding:14px; background:rgba(47,125,82,.08); margin:14px 0; }}
    .session-plan {{ border:1px solid rgba(183,137,63,.24); border-radius:18px; padding:14px; background:rgba(183,137,63,.09); margin:14px 0; }}
    h3 {{ margin:10px 0 6px; }}
    .sources {{ display:grid; gap:12px; }}
    .source-top {{ display:flex; justify-content:space-between; gap:10px; }}
    .source p {{ white-space:pre-wrap; color:var(--muted); line-height:1.45; max-height:240px; overflow:auto; }}
    pre {{ white-space:pre-wrap; overflow-wrap:anywhere; border-radius:14px; padding:10px; background:rgba(63,48,37,.08); color:var(--ink); }}
    summary {{ color:var(--leaf); font-weight:1000; cursor:pointer; }}
    .label {{ color:var(--gold); text-transform:uppercase; letter-spacing:.12em; font-size:11px; font-weight:900; }}
    @media (max-width:800px) {{ .task {{ grid-template-columns:1fr; }} .rank {{ width:72px; }} .topline {{ display:block; }} }}
  </style>
</head>
<body>
  <header>
    <p class="eyebrow">Nest · Author Desk</p>
    <h1>Write from the trail, not from the void.</h1>
    <p>This desk turns the current source-backed writing queue into a practical work surface. Quipsly may draft, rewrite, and prepare serious prose here, but it does not mutate source files, replace canonical manuscript text, publish, schedule, upload, or create receipts.</p>
    <div class="stats">
      <span>{esc(counts.get('deskTasks'))} desk tasks</span>
      <span>{esc(counts.get('tasksWithExistingDraftPackets'))} existing draft packets</span>
      <span>{esc(counts.get('sourceFilesLinked'))} source links</span>
      <span>0 source mutations</span>
      <span>0 external publications</span>
    </div>
  </header>
  <main>{tasks or '<section class="task"><div class="task-main"><h2>No tasks</h2><p>Generate the daily writing packet first.</p></div></section>'}</main>
</body>
</html>"""


def write_markdown(path: Path, packet: dict[str, Any]) -> None:
    lines = [
        "# Nest Author Desk",
        "",
        f"Generated: `{packet['generatedAt']}`",
        "",
        packet["truth"],
        "",
        "## Next safest action",
        "",
        packet["nextSafestAction"],
        "",
        "## Human/agent contract",
        "",
        f"- Human ask: {packet.get('humanAsk')}",
        f"- Agent-safe parallel work: {packet.get('agentSafeParallelWork')}",
        f"- Contract: {(packet.get('writingContract') or {}).get('summary') if isinstance(packet.get('writingContract'), dict) else ''}",
        "",
    ]
    for task in packet.get("tasks") or []:
        commands = task.get("safeLocalCommands") if isinstance(task.get("safeLocalCommands"), dict) else {}
        lines.extend([
            f"## #{task.get('rank')} {task.get('title')}",
            "",
            f"- Task: `{task.get('taskId')}`",
            f"- Type: `{task.get('type')}`",
            f"- Status: `{task.get('status')}`",
            f"- Safe next action: {task.get('safeNextAction') or ''}",
            f"- Small-session shape: `{(task.get('smallSessionPlan') or {}).get('sessionShape') if isinstance(task.get('smallSessionPlan'), dict) else ''}`",
            f"- First small-session goal: {(task.get('smallSessionPlan') or {}).get('firstGoal') if isinstance(task.get('smallSessionPlan'), dict) else ''}",
            f"- Human ask: {task.get('humanAsk') or ''}",
            f"- Agent-safe parallel work: {task.get('agentSafeParallelWork') or ''}",
            f"- Writing contract: {(task.get('writingContract') or {}).get('summary') if isinstance(task.get('writingContract'), dict) else ''}",
            f"- Source count: `{task.get('sourceCount')}`",
            f"- Existing draft packet: `{(task.get('draftPacket') or {}).get('htmlPath') if isinstance(task.get('draftPacket'), dict) else ''}`",
            "",
            "Generate/review draft packet:",
            "",
            f"```bash\n{commands.get('generateDraftPacket') or ''}\n```",
            "",
        ])
    path.write_text("\n".join(lines).rstrip() + "\n", encoding="utf-8")


def main() -> None:
    parser = argparse.ArgumentParser(description="Build a Nest Author Desk packet.")
    parser.add_argument("limit", nargs="?", type=int, default=12)
    parser.add_argument("--nest-root", default=str(DEFAULT_NEST_ROOT))
    parser.add_argument("--source-root", default=str(DEFAULT_SOURCE_ROOT))
    args = parser.parse_args()

    nest_root = Path(args.nest_root)
    source_root = Path(args.source_root)
    packet = build_packet(nest_root, source_root, args.limit)
    output_dir = prepare_output_dir(nest_root)
    json_path = output_dir / "nest-author-desk.json"
    html_path = output_dir / "index.html"
    markdown_path = output_dir / "START-HERE-nest-author-desk.md"
    csv_path = output_dir / "nest-author-desk.csv"
    packet.update({
        "outputDir": str(output_dir),
        "jsonPath": str(json_path),
        "htmlPath": str(html_path),
        "markdownPath": str(markdown_path),
        "csvPath": str(csv_path),
        "firstSafeAction": {
            "label": "Open Nest Author Desk",
            "path": str(html_path),
            "command": f"open {shell_quote(str(html_path))}",
            "safety": "Opens local writing task evidence only. No source files, manuscripts, publications, schedules, uploads, or receipts are changed.",
        },
    })
    write_json(json_path, packet)
    write_csv(csv_path, packet)
    html_path.write_text(render_html(packet), encoding="utf-8")
    write_markdown(markdown_path, packet)
    pointer = {
        "schema": "quipsly.nest-writing.latest-author-desk.v1",
        "status": packet["status"],
        "updatedAt": iso_now(),
        "sessionDir": str(output_dir),
        "jsonPath": str(json_path),
        "htmlPath": str(html_path),
        "markdownPath": str(markdown_path),
        "csvPath": str(csv_path),
        "counts": packet["counts"],
        "truth": packet["truth"],
        "humanAsk": packet.get("humanAsk"),
        "agentSafeParallelWork": packet.get("agentSafeParallelWork"),
        "writingContract": packet.get("writingContract"),
        "sourceContract": packet.get("sourceContract"),
        "sourceTasks": packet.get("sourceTasks"),
        "firstSafeAction": packet["firstSafeAction"],
        "firstTask": packet.get("firstTask") or {},
        "firstWritingTask": packet.get("firstTask") or {},
        "dailyWritingFirstTask": packet.get("firstTask") or {},
        "dailyWritingTruth": {
            "sourceFilesMutated": False,
            "canonicalManuscriptReplaced": False,
            "externalPublishing": False,
            "receiptTruthCreated": False,
            "humanReviewRequired": True,
        },
        "nextSafestAction": packet["nextSafestAction"],
        "sourceFilesMutated": False,
        "canonicalManuscriptReplaced": False,
        "externalPublishing": False,
        "receiptTruthCreated": False,
    }
    write_json(nest_root / LATEST_POINTER, pointer)
    print(json.dumps(pointer, indent=2, sort_keys=True))


if __name__ == "__main__":
    main()
