#!/usr/bin/env python3
"""Build a calm Nest writing sprint companion.

This creates one focused writing-session surface from the current Author Desk,
daily packet, draft packet, momentum board, and publication runway. It does not
edit source files, replace canonical manuscript text, publish, upload, schedule,
or create receipt truth.
"""

from __future__ import annotations

import argparse
import csv
import datetime as dt
import html
import json
import shlex
from pathlib import Path
from typing import Any


DEFAULT_NEST_ROOT = Path("/Volumes/My Passport/Quipsly Media Workspace/NestWriting")
LATEST_POINTER = "latest-nest-writing-sprint-companion.json"
LATEST_ALIAS_POINTERS = [
    "latest-nest-writing-sprint.json",
]
SCHEMA = "quipsly.nest-writing.sprint-companion.v1"


def utc_now() -> str:
    return dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z")


def stamp() -> str:
    return dt.datetime.now(dt.timezone.utc).strftime("%Y%m%d-%H%M%S-%f")


def load_json(path: Path) -> dict[str, Any]:
    try:
        if path.exists():
            payload = json.loads(path.read_text(encoding="utf-8"))
            return payload if isinstance(payload, dict) else {}
    except Exception:
        return {}
    return {}


def write_json(path: Path, payload: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, indent=2, sort_keys=True) + "\n", encoding="utf-8")


def esc(value: Any) -> str:
    return html.escape(str(value or ""))


def shell_quote(value: str) -> str:
    return shlex.quote(value)


def as_int(value: Any) -> int:
    try:
        return int(value or 0)
    except Exception:
        return 0


def pointer(nest_root: Path, name: str) -> dict[str, Any]:
    return load_json(nest_root / name)


def packet_from_pointer(pointer_payload: dict[str, Any]) -> dict[str, Any]:
    path = Path(str(pointer_payload.get("jsonPath") or ""))
    return load_json(path) if path else {}


def first_task_from_author(author_packet: dict[str, Any], daily_packet: dict[str, Any]) -> dict[str, Any]:
    first = author_packet.get("firstTask") if isinstance(author_packet.get("firstTask"), dict) else {}
    if first:
        return first
    tasks = daily_packet.get("dailyTasks") if isinstance(daily_packet.get("dailyTasks"), list) else []
    return tasks[0] if tasks and isinstance(tasks[0], dict) else {}


def task_row(task: dict[str, Any], index: int) -> dict[str, Any]:
    commands = task.get("safeLocalCommands") if isinstance(task.get("safeLocalCommands"), dict) else {}
    list_commands = task.get("safeLocalCommands") if isinstance(task.get("safeLocalCommands"), list) else []
    generate_command = str(commands.get("generateDraftPacket") or task.get("draftPacketCommand") or "")
    if not generate_command and list_commands and isinstance(list_commands[0], dict):
        generate_command = str(list_commands[0].get("command") or "")
    open_draft = str(commands.get("openExistingDraftPacket") or task.get("openExistingDraftPacket") or "")
    open_source = str(commands.get("openFirstSource") or task.get("openFirstSource") or "")
    return {
        "rank": index,
        "taskId": task.get("taskId") or "",
        "title": task.get("title") or task.get("taskId") or "Untitled writing task",
        "type": task.get("type") or task.get("focus") or "writing",
        "status": task.get("status") or "ready-to-draft-with-provenance",
        "wordCount": as_int(task.get("wordCount")),
        "sourceCount": as_int(task.get("sourceCount")),
        "safeNextAction": task.get("safeNextAction") or "Open source trail, then make one source-backed writing move.",
        "humanAsk": task.get("humanAsk") or "Read the source trail and decide whether to draft, rewrite, expand, cut, cite, promote, or hold.",
        "agentSafeParallelWork": task.get("agentSafeParallelWork") or "Prepare outlines, draft variants, source comparisons, citation trails, and platform copy without mutating source or canon.",
        "openSourceCommand": open_source,
        "openDraftCommand": open_draft,
        "generateDraftCommand": generate_command,
        "commandSafety": task.get("commandSafety") or "Local source/draft opening only. No source files, manuscripts, publications, schedules, uploads, or receipts are changed.",
        "writingContract": task.get("writingContract") or {},
    }


def derive_task_rows(author_packet: dict[str, Any], daily_packet: dict[str, Any], limit: int) -> list[dict[str, Any]]:
    raw_tasks = author_packet.get("tasks") if isinstance(author_packet.get("tasks"), list) else []
    if not raw_tasks:
        raw_tasks = daily_packet.get("dailyTasks") if isinstance(daily_packet.get("dailyTasks"), list) else []
    return [task_row(task, idx + 1) for idx, task in enumerate(raw_tasks[:limit]) if isinstance(task, dict)]


def review_triage_rows(review_packet: dict[str, Any], limit: int = 6) -> list[dict[str, Any]]:
    rows = review_packet.get("rows") if isinstance(review_packet.get("rows"), list) else []
    triage: list[dict[str, Any]] = []
    for row in rows:
        if not isinstance(row, dict):
            continue
        flags = row.get("reviewFlags") if isinstance(row.get("reviewFlags"), list) else []
        recommended = str(row.get("recommendedDecision") or row.get("reviewStatus") or "")
        if not flags and recommended in {"review-ready", "ready"}:
            continue
        triage.append({
            "rank": len(triage) + 1,
            "title": row.get("title") or row.get("draftTitle") or row.get("sourceTitle") or row.get("id") or "Writing review item",
            "status": row.get("reviewStatus") or row.get("status") or "needs-review",
            "recommendedDecision": recommended or "human-next-pass",
            "reviewFlagSummary": row.get("reviewFlagSummary") or ", ".join(str(flag) for flag in flags),
            "reviewFlags": flags,
            "sourceCount": as_int(row.get("sourceCount")),
            "platformCount": as_int(row.get("platformCount")),
            "openCommand": row.get("openCommand") or row.get("firstSafeActionCommand") or "",
            "nextSafestAction": row.get("nextSafestAction") or "Open source trail, inspect flags, then revise or hold without canon mutation.",
        })
        if len(triage) >= limit:
            break
    return triage


def review_lens(first_task: dict[str, Any]) -> list[dict[str, str]]:
    title = str(first_task.get("title") or "the selected writing task")
    return [
        {
            "label": "Source truth",
            "question": f"What does the source for {title} actually say, and what should remain uncertain?",
            "output": "source notes, citations, open questions",
        },
        {
            "label": "Human voice",
            "question": "What belongs in Homer's voice, Charlie's connective tissue, or a Quipsly-prepared draft?",
            "output": "authorship note, revision direction",
        },
        {
            "label": "Draft usefulness",
            "question": "Does the current draft create momentum, or should it be outlined, cut, expanded, or rewritten?",
            "output": "revise / expand / hold / promote recommendation",
        },
        {
            "label": "Publication boundary",
            "question": "What can become a platform packet later, and what still needs human approval?",
            "output": "platform hooks, receipt slots, approval blockers",
        },
    ]


def start_here_today(first_row: dict[str, Any], counts: dict[str, Any], review_triage: list[dict[str, Any]]) -> dict[str, Any]:
    flagged = as_int(counts.get("draftsWithReviewFlags"))
    pending_review = as_int(counts.get("pendingHumanReview"))
    if review_triage:
        first_flag = review_triage[0]
        return {
            "mode": "review-first",
            "title": first_flag.get("title") or "First flagged draft",
            "why": "A draft already exists with visible review flags. Cleaning one flagged draft is calmer and more useful than creating more unchecked draft material.",
            "recommendedMove": first_flag.get("recommendedDecision") or "revise",
            "safeCommand": first_flag.get("openCommand") or "",
            "humanQuestion": "Does this draft need revision, source checking, splitting, or a hold before it can become part of the real manuscript/publishing flow?",
            "agentMove": "Prepare a source-backed revision note and one improved draft variant, but do not replace canonical manuscript text.",
            "countsContext": {
                "draftsWithReviewFlags": flagged,
                "pendingHumanReview": pending_review,
            },
        }
    return {
        "mode": "draft-first",
        "title": first_row.get("title") or "First source-backed writing task",
        "why": "No flagged item is first in the triage slice, so the safest momentum move is one source-backed draft or outline with provenance visible.",
        "recommendedMove": "open-source-then-draft-or-outline",
        "safeCommand": first_row.get("openDraftCommand") or first_row.get("generateDraftCommand") or first_row.get("openSourceCommand") or "",
        "humanQuestion": first_row.get("humanAsk") or "Should this become an outline, draft, rewrite, cut, citation pass, or hold?",
        "agentMove": first_row.get("agentSafeParallelWork") or "Prepare source-backed draft material without mutating source or canon.",
        "countsContext": {
            "draftsWithReviewFlags": flagged,
            "pendingHumanReview": pending_review,
        },
    }


def build_packet(nest_root: Path, limit: int) -> dict[str, Any]:
    author_pointer = pointer(nest_root, "latest-nest-writing-author-desk.json")
    daily_pointer = pointer(nest_root, "latest-nest-writing-daily-packet.json")
    source_pointer = pointer(nest_root, "latest-nest-writing-source-packet.json")
    draft_pointer = pointer(nest_root, "latest-nest-writing-draft-packet.json")
    momentum_pointer = pointer(nest_root, "latest-nest-writing-momentum-board.json")
    runway_pointer = pointer(nest_root, "latest-writing-publication-runway.json")
    session_pointer = pointer(nest_root, "latest-nest-writing-session-cockpit.json")
    review_pointer = pointer(nest_root, "latest-nest-writing-review-desk.json")

    author_packet = packet_from_pointer(author_pointer)
    daily_packet = packet_from_pointer(daily_pointer)
    momentum_packet = packet_from_pointer(momentum_pointer)
    runway_packet = packet_from_pointer(runway_pointer)
    draft_packet = packet_from_pointer(draft_pointer)
    review_packet = packet_from_pointer(review_pointer)
    review_triage = review_triage_rows(review_packet)

    first_task = first_task_from_author(author_packet, daily_packet)
    tasks = derive_task_rows(author_packet, daily_packet, max(1, limit))
    first_row = task_row(first_task, 1) if first_task else (tasks[0] if tasks else {})
    author_counts = author_pointer.get("counts") if isinstance(author_pointer.get("counts"), dict) else {}
    daily_counts = daily_pointer.get("counts") if isinstance(daily_pointer.get("counts"), dict) else {}
    momentum_counts = momentum_pointer.get("counts") if isinstance(momentum_pointer.get("counts"), dict) else {}
    runway_counts = runway_pointer.get("counts") if isinstance(runway_pointer.get("counts"), dict) else {}
    draft_counts = draft_pointer.get("counts") if isinstance(draft_pointer.get("counts"), dict) else {}
    review_counts = review_pointer.get("counts") if isinstance(review_pointer.get("counts"), dict) else {}

    counts = {
        "sprintTasks": len(tasks),
        "availableDailyTasks": as_int(author_counts.get("availableDailyTasks") or daily_counts.get("selectedTasks")),
        "tasksWithExistingDraftPackets": as_int(author_counts.get("tasksWithExistingDraftPackets")),
        "currentDrafts": as_int(momentum_counts.get("currentDrafts") or runway_counts.get("currentDrafts")),
        "pendingHumanReview": as_int(momentum_counts.get("pendingHumanReview") or runway_counts.get("pendingHumanReview")),
        "platformDraftItems": as_int(momentum_counts.get("platformDraftItems") or runway_counts.get("platformDraftItems")),
        "receiptSlots": as_int(momentum_counts.get("receiptSlots") or runway_counts.get("receiptSlots") or draft_counts.get("receiptSlots")),
        "capturedReceipts": as_int(momentum_counts.get("capturedReceipts") or runway_counts.get("capturedReceipts")),
        "sourceWords": as_int(momentum_counts.get("sourceWords")),
        "reviewQueueRows": as_int(review_counts.get("reviewRows")),
        "reviewNeedsHuman": as_int(review_counts.get("needsHumanReview")),
        "draftsWithReviewFlags": as_int(review_counts.get("draftsWithReviewFlags")),
        "recommendedRevise": as_int(review_counts.get("recommendedRevise")),
        "recommendedSplit": as_int(review_counts.get("recommendedSplit")),
        "recommendedSourceCheck": as_int(review_counts.get("recommendedSourceCheck")),
        "sourceFilesMutated": False,
        "canonicalManuscriptReplaced": False,
        "externalPublishing": False,
        "receiptTruthCreated": False,
        "versionsOverwritten": False,
    }
    writing_output_plan = {
        "currentStage": "source-backed-drafting",
        "stageTruth": "This sprint can create or review local writing artifacts. It cannot silently replace canonical manuscript text, approve publication, publish, upload, schedule, or create receipt truth.",
        "aiDraftingAllowed": True,
        "blackBoxWritingAllowedButNotOpaque": True,
        "safeOutputs": [
            {
                "label": "Source notes",
                "means": "Extract claims, context, uncertainties, citations, and open questions from source material.",
                "canonEffect": "none",
            },
            {
                "label": "Draft variant",
                "means": "Create a usable passage, rewrite, outline, bridge paragraph, or example voice pass for human editing.",
                "canonEffect": "local draft only until explicitly promoted by a human.",
            },
            {
                "label": "Revision brief",
                "means": "Explain what changed, why it changed, and what should be checked before canon.",
                "canonEffect": "none",
            },
            {
                "label": "Publication packet preview",
                "means": "Prepare article/social/email/podcast-page copy candidates after a draft exists.",
                "canonEffect": "packet prep only; no publication or receipt truth.",
            },
        ],
        "humanReviewGate": [
            "Does this preserve the intended human voice rather than normalizing it?",
            "Do the review flags point to source, split, scaffold, or thin-draft work before canon?",
            "Are source claims traceable, quoted/paraphrased honestly, and uncertainty preserved?",
            "Is AI-written prose useful enough to edit, or should it be discarded/reworked?",
            "Should this remain a draft, become a revision task, or be promoted into canonical manuscript work?",
        ],
        "doNotDo": [
            "Do not silently replace canonical manuscript text.",
            "Do not flatten Homer/Charlie voice into generic professional prose.",
            "Do not treat a polished draft as fact without checking the source trail.",
            "Do not publish, schedule, upload, or create receipts from this sprint.",
        ],
        "nextIfDraftReady": "Route the draft to human review with source notes and a revision brief.",
        "nextIfBlocked": "Create a clearer outline, source trail, or question list instead of forcing prose.",
    }
    today = start_here_today(first_row, counts, review_triage)

    packet = {
        "schema": SCHEMA,
        "status": "nest-writing-sprint-ready",
        "generatedAt": utc_now(),
        "nestRoot": str(nest_root),
        "counts": counts,
        "humanAsk": "Run one source-backed writing sprint: open the first task, keep the source trail visible, improve or review a draft, and stop before canon/publication claims.",
        "nextSafestAction": "Open this writing sprint companion, start with the first task, and generate or review a draft packet without mutating source or canonical manuscript text.",
        "startHereToday": today,
        "firstTask": first_row,
        "taskRows": tasks,
        "reviewLens": review_lens(first_row),
        "reviewTriageRows": review_triage,
        "reviewDeskCounts": review_counts,
        "reviewDeskNextSafestAction": review_pointer.get("nextSafestAction") or review_packet.get("nextSafestAction") or "Open the writing review desk and inspect source-backed flags before canon or publication work.",
        "writingOutputPlan": writing_output_plan,
        "sprintPlan": [
            "Open the first source trail or existing draft packet.",
            "Spend one focused session making one real writing move: outline, draft, rewrite, cite, cut, expand, or hold.",
            "Keep AI-written prose allowed but inspectable; do not secretly replace canonical manuscript text.",
            "Record publication hooks as packet prep only; receipts require real external URLs later.",
        ],
        "writingContract": author_packet.get("writingContract") or momentum_packet.get("writingContract") or {
            "assistantMayDraft": True,
            "assistantMayRewrite": True,
            "assistantMustKeepSourceTrailVisible": True,
            "humanOwnsCanonicalText": True,
            "canonicalWriteBlocked": True,
            "publicationBlocked": True,
        },
        "sourcePointers": {
            "sourcePacketHtml": source_pointer.get("htmlPath") or "",
            "sourcePacketJson": source_pointer.get("packetPath") or source_pointer.get("jsonPath") or "",
            "sessionCockpitHtml": session_pointer.get("htmlPath") or "",
            "dailyPacketHtml": daily_pointer.get("htmlPath") or "",
            "authorDeskHtml": author_pointer.get("htmlPath") or "",
            "momentumBoardHtml": momentum_pointer.get("htmlPath") or "",
            "draftPacketHtml": draft_pointer.get("htmlPath") or "",
            "draftPacketJson": draft_pointer.get("jsonPath") or "",
            "reviewDeskHtml": review_pointer.get("htmlPath") or "",
            "reviewDeskJson": review_pointer.get("jsonPath") or "",
            "publicationRunwayHtml": runway_pointer.get("htmlPath") or "",
            "publicationRunwayJson": runway_pointer.get("jsonPath") or "",
        },
        "agentSafeParallelWork": "Prepare source-backed draft variants, outlines, comparison notes, platform packet copy, and revision questions. Do not mutate source, replace canon, publish, schedule, upload, or create receipts.",
        "truth": "Nest writing sprint companion only. It reads local source/draft/runway evidence and writes versioned local guidance; it does not edit source files, replace canonical manuscript text, publish, upload, schedule, or create receipt truth.",
    }
    return packet


def render_task(row: dict[str, Any]) -> str:
    return f"""
    <article class="task-card">
      <p class="eyebrow">Task {esc(row.get('rank'))} · {esc(row.get('type'))}</p>
      <h3>{esc(row.get('title'))}</h3>
      <p class="muted">{esc(row.get('status'))} · {esc(row.get('wordCount'))} words · {esc(row.get('sourceCount'))} source(s)</p>
      <p><strong>Next:</strong> {esc(row.get('safeNextAction'))}</p>
      <p>{esc(row.get('humanAsk'))}</p>
      <details open><summary>Safe commands</summary><pre>{esc(json.dumps({
          'openSource': row.get('openSourceCommand'),
          'openDraft': row.get('openDraftCommand'),
          'generateDraft': row.get('generateDraftCommand'),
          'safety': row.get('commandSafety'),
      }, indent=2))}</pre></details>
    </article>
    """


def render_lens(row: dict[str, str]) -> str:
    return f"""
    <article class="lens-card">
      <h3>{esc(row.get('label'))}</h3>
      <p>{esc(row.get('question'))}</p>
      <p class="muted">Output: {esc(row.get('output'))}</p>
    </article>
    """


def render_html(packet: dict[str, Any]) -> str:
    counts = packet.get("counts") or {}
    tasks = "".join(render_task(row) for row in packet.get("taskRows") or [])
    lens = "".join(render_lens(row) for row in packet.get("reviewLens") or [])
    triage = "".join(
        f"<article class='lens-card triage-card'><h3>{esc(row.get('title'))}</h3><p><strong>{esc(row.get('recommendedDecision'))}</strong> · {esc(row.get('status'))}</p><p>{esc(row.get('reviewFlagSummary'))}</p><p class='muted'>Sources: {esc(row.get('sourceCount'))} · Platforms: {esc(row.get('platformCount'))}</p><pre>{esc(row.get('openCommand'))}</pre></article>"
        for row in packet.get("reviewTriageRows") or []
    )
    sprint_steps = "".join(f"<li>{esc(step)}</li>" for step in packet.get("sprintPlan") or [])
    first = packet.get("firstTask") if isinstance(packet.get("firstTask"), dict) else {}
    today = packet.get("startHereToday") if isinstance(packet.get("startHereToday"), dict) else {}
    output_plan = packet.get("writingOutputPlan") if isinstance(packet.get("writingOutputPlan"), dict) else {}
    safe_outputs = "".join(
        f"<article class='mini-card'><h3>{esc(row.get('label'))}</h3><p>{esc(row.get('means'))}</p><p class='truth'>Canon effect: {esc(row.get('canonEffect'))}</p></article>"
        for row in output_plan.get("safeOutputs") or []
    )
    review_gate = "".join(f"<li>{esc(item)}</li>" for item in output_plan.get("humanReviewGate") or [])
    do_not = "".join(f"<li>{esc(item)}</li>" for item in output_plan.get("doNotDo") or [])
    return f"""<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Nest writing sprint companion</title>
  <style>
    :root {{ --bg:#15130e; --panel:#241f16; --card:#30291c; --ink:#fff4dc; --muted:#c8b994; --gold:#edc957; --leaf:#92d27a; --water:#86d4df; --clay:#d67a58; --line:#564a2d; }}
    * {{ box-sizing:border-box; }}
    body {{ margin:0; color:var(--ink); background:radial-gradient(circle at top left, rgba(146,210,122,.18), transparent 34rem), var(--bg); font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, sans-serif; line-height:1.45; }}
    main {{ max-width:1240px; margin:0 auto; padding:34px 24px 68px; }}
    header, section {{ border:1px solid var(--line); border-radius:26px; background:rgba(36,31,22,.9); padding:24px; margin-bottom:20px; box-shadow:0 20px 80px rgba(0,0,0,.28); }}
    h1 {{ margin:.1rem 0 .5rem; font-size:clamp(2.3rem, 6vw, 5rem); line-height:.94; }}
    h2, h3 {{ margin:.2rem 0 .5rem; }}
    .eyebrow {{ color:var(--gold); font-size:12px; letter-spacing:.2em; text-transform:uppercase; font-weight:900; }}
    .summary, .muted, p, li {{ color:var(--muted); }}
    .metrics {{ display:grid; grid-template-columns:repeat(auto-fit,minmax(140px,1fr)); gap:10px; margin:18px 0; }}
    .metric {{ border:1px solid var(--line); border-radius:16px; padding:12px; background:rgba(255,255,255,.055); }}
    .metric strong {{ display:block; color:var(--leaf); font-size:1.5rem; }}
    .grid {{ display:grid; grid-template-columns:repeat(auto-fit,minmax(260px,1fr)); gap:14px; }}
    .mini-grid {{ display:grid; grid-template-columns:repeat(auto-fit,minmax(220px,1fr)); gap:12px; }}
    .mini-card {{ border:1px solid var(--line); border-radius:16px; padding:14px; background:rgba(0,0,0,.16); }}
    .task-card, .lens-card {{ border:1px solid var(--line); border-radius:18px; padding:16px; background:var(--card); }}
    .first {{ border-color:rgba(237,201,87,.62); background:linear-gradient(135deg, rgba(48,41,28,.98), rgba(42,56,31,.86)); }}
    pre {{ white-space:pre-wrap; overflow:auto; border-radius:14px; padding:12px; background:#0d0f0b; color:#ffe89a; }}
    code {{ color:#ffe89a; overflow-wrap:anywhere; }}
    .truth {{ color:var(--water); }}
    .danger {{ color:var(--clay); }}
  </style>
</head>
<body><main>
  <header>
    <p class="eyebrow">Quipsly Nest · writing sprint</p>
    <h1>Write seriously. Keep the trail visible.</h1>
    <p class="summary">{esc(packet.get('humanAsk'))}</p>
    <div class="metrics">
      <div class="metric"><strong>{esc(counts.get('sprintTasks'))}</strong> sprint tasks</div>
      <div class="metric"><strong>{esc(counts.get('currentDrafts'))}</strong> current drafts</div>
      <div class="metric"><strong>{esc(counts.get('pendingHumanReview'))}</strong> pending review</div>
      <div class="metric"><strong>{esc(counts.get('draftsWithReviewFlags'))}</strong> flagged drafts</div>
      <div class="metric"><strong>{esc(counts.get('platformDraftItems'))}</strong> platform draft items</div>
      <div class="metric"><strong>{esc(counts.get('capturedReceipts'))}</strong> receipts</div>
    </div>
    <p><strong>Next safest action:</strong> {esc(packet.get('nextSafestAction'))}</p>
    <ol>{sprint_steps}</ol>
    <p class="danger">This companion does not replace canonical manuscript text or publish anything.</p>
  </header>
  <section class="first">
    <p class="eyebrow">Start here today · {esc(today.get('mode'))}</p>
    <h2>{esc(today.get('title') or first.get('title'))}</h2>
    <p>{esc(today.get('why') or first.get('safeNextAction'))}</p>
    <p><strong>Recommended move:</strong> {esc(today.get('recommendedMove'))}</p>
    <p><strong>Human question:</strong> {esc(today.get('humanQuestion'))}</p>
    <p><strong>Codex-safe move:</strong> {esc(today.get('agentMove'))}</p>
    <pre>{esc(today.get('safeCommand'))}</pre>
    <h3>First task commands</h3>
    <pre>{esc(json.dumps({
      'openSource': first.get('openSourceCommand'),
      'openDraft': first.get('openDraftCommand'),
      'generateDraft': first.get('generateDraftCommand'),
      'safety': first.get('commandSafety'),
    }, indent=2))}</pre>
  </section>
  <section>
    <h2>What this sprint can produce</h2>
    <p class="summary">{esc(output_plan.get('stageTruth'))}</p>
    <div class="metrics">
      <div class="metric"><strong>{esc(output_plan.get('aiDraftingAllowed'))}</strong> AI drafting allowed</div>
      <div class="metric"><strong>{esc(output_plan.get('blackBoxWritingAllowedButNotOpaque'))}</strong> no opaque drafts</div>
      <div class="metric"><strong>{esc(counts.get('canonicalManuscriptReplaced'))}</strong> canon replaced</div>
      <div class="metric"><strong>{esc(counts.get('externalPublishing'))}</strong> external publish</div>
    </div>
    <div class="mini-grid">{safe_outputs}</div>
    <h3>Human review gate</h3>
    <ul>{review_gate}</ul>
    <h3>Do not do</h3>
    <ul>{do_not}</ul>
  </section>
  <section>
    <h2>Review triage</h2>
    <p class="summary">{esc(packet.get('reviewDeskNextSafestAction'))}</p>
    <div class="lens-grid">{triage or "<article class='lens-card'><h3>No flagged drafts in the first triage slice</h3><p>Use the review desk for the full queue, but the sprint can continue source-backed drafting.</p></article>"}</div>
  </section>
  <section>
    <h2>Writing review lens</h2>
    <div class="grid">{lens}</div>
  </section>
  <section>
    <h2>Task queue</h2>
    <div class="grid">{tasks}</div>
  </section>
  <section>
    <h2>Source and runway pointers</h2>
    <pre>{esc(json.dumps(packet.get('sourcePointers') or {}, indent=2))}</pre>
  </section>
  <section>
    <h2>Safety truth</h2>
    <p class="truth">{esc(packet.get('truth'))}</p>
  </section>
</main></body></html>"""


def write_markdown(path: Path, packet: dict[str, Any]) -> None:
    counts = packet.get("counts") or {}
    first = packet.get("firstTask") if isinstance(packet.get("firstTask"), dict) else {}
    today = packet.get("startHereToday") if isinstance(packet.get("startHereToday"), dict) else {}
    lines = [
        "# Nest writing sprint companion",
        "",
        packet.get("humanAsk") or "",
        "",
        "## Current truth",
        "",
        f"- Status: `{packet.get('status')}`",
        f"- Sprint tasks: `{counts.get('sprintTasks')}`",
        f"- Current drafts: `{counts.get('currentDrafts')}`",
        f"- Pending human review: `{counts.get('pendingHumanReview')}`",
        f"- Platform draft items: `{counts.get('platformDraftItems')}`",
        f"- Receipt slots: `{counts.get('receiptSlots')}`",
        f"- Captured receipts: `{counts.get('capturedReceipts')}`",
        f"- Source files mutated: `{counts.get('sourceFilesMutated')}`",
        f"- Canonical manuscript replaced: `{counts.get('canonicalManuscriptReplaced')}`",
        "",
        "## What this sprint can produce",
        "",
        (packet.get("writingOutputPlan") or {}).get("stageTruth") or "",
        "",
        f"- AI drafting allowed: `{(packet.get('writingOutputPlan') or {}).get('aiDraftingAllowed')}`",
        f"- Black-box writing allowed but not opaque: `{(packet.get('writingOutputPlan') or {}).get('blackBoxWritingAllowedButNotOpaque')}`",
        f"- Next if draft-ready: {(packet.get('writingOutputPlan') or {}).get('nextIfDraftReady')}",
        f"- Next if blocked: {(packet.get('writingOutputPlan') or {}).get('nextIfBlocked')}",
        "",
        "### Safe outputs",
        "",
    ]
    for output in (packet.get("writingOutputPlan") or {}).get("safeOutputs") or []:
        lines.append(f"- **{output.get('label')}**: {output.get('means')} Canon effect: `{output.get('canonEffect')}`")
    lines.extend([
        "",
        "### Human review gate",
        "",
    ])
    for gate in (packet.get("writingOutputPlan") or {}).get("humanReviewGate") or []:
        lines.append(f"- [ ] {gate}")
    lines.extend([
        "",
        "### Do not do",
        "",
    ])
    for warning in (packet.get("writingOutputPlan") or {}).get("doNotDo") or []:
        lines.append(f"- {warning}")
    lines.extend([
        "",
        "## Start here",
        "",
        f"- Mode: `{today.get('mode')}`",
        f"- Today task: `{today.get('title') or first.get('title')}`",
        f"- Why: {today.get('why') or first.get('safeNextAction')}",
        f"- Recommended move: `{today.get('recommendedMove')}`",
        f"- Human question: {today.get('humanQuestion')}",
        f"- Codex-safe move: {today.get('agentMove')}",
        f"- Today safe command: `{today.get('safeCommand')}`",
        "",
        "## First task commands",
        "",
        f"- Task: `{first.get('title')}`",
        f"- Open source: `{first.get('openSourceCommand')}`",
        f"- Open draft: `{first.get('openDraftCommand')}`",
        f"- Generate draft: `{first.get('generateDraftCommand')}`",
        f"- Safety: {first.get('commandSafety')}",
        "",
        "## Sprint plan",
        "",
    ])
    lines.extend(f"{idx}. {step}" for idx, step in enumerate(packet.get("sprintPlan") or [], start=1))
    lines.extend(["", "## Review lens", ""])
    for row in packet.get("reviewLens") or []:
        lines.extend([f"### {row.get('label')}", "", row.get("question") or "", "", f"Output: `{row.get('output')}`", ""])
    lines.extend(["## Safety", "", packet.get("truth") or "", ""])
    path.write_text("\n".join(lines).rstrip() + "\n", encoding="utf-8")


def write_csv(path: Path, packet: dict[str, Any]) -> None:
    fieldnames = ["rank", "taskId", "title", "type", "status", "wordCount", "sourceCount", "safeNextAction", "openSourceCommand", "openDraftCommand", "generateDraftCommand", "commandSafety"]
    with path.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=fieldnames)
        writer.writeheader()
        for row in packet.get("taskRows") or []:
            writer.writerow({field: row.get(field, "") for field in fieldnames})


def write_session_note_template(path: Path, packet: dict[str, Any]) -> None:
    first = packet.get("firstTask") if isinstance(packet.get("firstTask"), dict) else {}
    lines = [
        "# Writing sprint notes",
        "",
        f"Generated: `{packet.get('generatedAt')}`",
        f"Task: `{first.get('title')}`",
        "",
        "## What changed?",
        "",
        "- ",
        "",
        "## Source/citation questions",
        "",
        "- ",
        "",
        "## Draft decision",
        "",
        "- [ ] revise",
        "- [ ] expand",
        "- [ ] cut",
        "- [ ] cite",
        "- [ ] hold",
        "- [ ] promote for human review",
        "",
        "## Safety reminder",
        "",
        "This note is local guidance only. It does not replace canonical manuscript text or publish anything.",
        "",
    ]
    path.write_text("\n".join(lines), encoding="utf-8")


def main() -> int:
    parser = argparse.ArgumentParser(description="Build a Nest writing sprint companion.")
    parser.add_argument("nest_root", nargs="?", default=str(DEFAULT_NEST_ROOT))
    parser.add_argument("--limit", type=int, default=8)
    args = parser.parse_args()

    nest_root = Path(args.nest_root)
    packet = build_packet(nest_root, max(1, args.limit))
    out_dir = nest_root / "WritingSprints" / f"{stamp()}-nest-writing-sprint"
    out_dir.mkdir(parents=True, exist_ok=True)
    html_path = out_dir / "index.html"
    json_path = out_dir / "nest-writing-sprint-companion.json"
    markdown_path = out_dir / "START-HERE-nest-writing-sprint.md"
    csv_path = out_dir / "nest-writing-sprint-tasks.csv"
    notes_path = out_dir / "writing-sprint-notes-template.md"

    packet.update({
        "outputDir": str(out_dir),
        "htmlPath": str(html_path),
        "jsonPath": str(json_path),
        "markdownPath": str(markdown_path),
        "csvPath": str(csv_path),
        "notesTemplatePath": str(notes_path),
    })
    packet["firstSafeAction"] = {
        "label": "Open Nest writing sprint companion",
        "command": f"open {shell_quote(str(html_path))}",
        "path": str(html_path),
        "safety": "Opens local writing sprint evidence only. No source files, canonical manuscript text, publications, schedules, uploads, or receipts are changed.",
    }

    write_json(json_path, packet)
    html_path.write_text(render_html(packet), encoding="utf-8")
    write_markdown(markdown_path, packet)
    write_csv(csv_path, packet)
    write_session_note_template(notes_path, packet)

    pointer_payload = {
        "schema": SCHEMA,
        "status": packet["status"],
        "generatedAt": packet["generatedAt"],
        "outputDir": str(out_dir),
        "htmlPath": str(html_path),
        "jsonPath": str(json_path),
        "markdownPath": str(markdown_path),
        "csvPath": str(csv_path),
        "notesTemplatePath": str(notes_path),
        "counts": packet["counts"],
        "humanAsk": packet["humanAsk"],
        "nextSafestAction": packet["nextSafestAction"],
        "startHereToday": packet["startHereToday"],
        "firstSafeAction": packet["firstSafeAction"],
        "firstTask": packet["firstTask"],
        "writingOutputPlan": packet["writingOutputPlan"],
        "agentSafeParallelWork": packet["agentSafeParallelWork"],
        "truth": packet["truth"],
    }
    write_json(nest_root / LATEST_POINTER, pointer_payload)
    for alias in LATEST_ALIAS_POINTERS:
        write_json(nest_root / alias, pointer_payload)
    print(json.dumps(pointer_payload, indent=2, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
