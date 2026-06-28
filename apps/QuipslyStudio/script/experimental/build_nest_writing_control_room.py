#!/usr/bin/env python3
"""Build one calm Nest writing control room.

This is a local front door over Nest writing/research source packets, writing
sessions, daily tasks, author desk, draft packets, review desk, publication
runway, momentum board, and sprint companion. It never mutates source files,
replaces canonical manuscript text, publishes, uploads, schedules, approves, or
creates receipt truth.
"""
from __future__ import annotations

import argparse
import csv
import html
import json
import shlex
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

DEFAULT_NEST_ROOT = Path("/Volumes/My Passport/Quipsly Media Workspace/NestWriting")
SCHEMA = "quipsly.nest-writing.control-room.v1"
LATEST_NAME = "latest-nest-writing-control-room.json"

SOURCE_POINTERS = [
    ("nextWritingCard", "Next writing card", "latest-nest-writing-next-card.json"),
    ("sprint", "Writing sprint companion", "latest-nest-writing-sprint-companion.json"),
    ("momentum", "Writing momentum board", "latest-nest-writing-momentum-board.json"),
    ("reviewDesk", "Writing review desk", "latest-nest-writing-review-desk.json"),
    ("authorDesk", "Author desk", "latest-nest-writing-author-desk.json"),
    ("dailyPacket", "Daily writing packet", "latest-nest-writing-daily-packet.json"),
    ("sessionCockpit", "Writing session cockpit", "latest-nest-writing-session-cockpit.json"),
    ("draftPacket", "Draft packet", "latest-nest-writing-draft-packet.json"),
    ("publicationRunway", "Writing publication runway", "latest-writing-publication-runway.json"),
    ("sourcePacket", "Source packet", "latest-nest-writing-source-packet.json"),
    ("researchPacket", "Research packet", "latest-nest-research-packet.json"),
]


def iso_now() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def stamp() -> str:
    return datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S-%f-nest-writing-control-room")


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
    return shlex.quote(value)


def safe_int(value: Any) -> int:
    try:
        return int(value or 0)
    except Exception:
        return 0


def resolve_pointer(path: Path) -> tuple[dict[str, Any], dict[str, Any], Path | None]:
    pointer = load_json(path)
    candidate = str(pointer.get("jsonPath") or pointer.get("packetPath") or pointer.get("workbenchJsonPath") or "")
    target_path = Path(candidate) if candidate else None
    target = load_json(target_path) if target_path and target_path.exists() and target_path != path else {}
    packet = {**pointer, **target} if target else pointer
    return pointer, packet, target_path


def first_open(payload: dict[str, Any]) -> dict[str, str]:
    first = payload.get("firstSafeAction") if isinstance(payload.get("firstSafeAction"), dict) else {}
    path = str(first.get("path") or payload.get("htmlPath") or payload.get("markdownPath") or payload.get("packetPath") or payload.get("jsonPath") or "")
    return {
        "label": str(first.get("label") or "Open Nest writing evidence"),
        "command": str(first.get("command") or (f"open {shell_quote(path)}" if path else "")),
        "path": path,
        "safety": str(first.get("safety") or "Opens local writing/research evidence only. No source mutation, canonical manuscript replacement, publication, upload, schedule, approval, or receipt capture occurs."),
    }


def load_sources(nest_root: Path) -> dict[str, dict[str, Any]]:
    sources: dict[str, dict[str, Any]] = {}
    for source_id, label, rel in SOURCE_POINTERS:
        pointer_path = nest_root / rel
        pointer, packet, target_path = resolve_pointer(pointer_path)
        counts = packet.get("counts") if isinstance(packet.get("counts"), dict) else {}
        sources[source_id] = {
            "id": source_id,
            "label": label,
            "pointerPath": str(pointer_path),
            "targetJsonPath": str(target_path or ""),
            "exists": bool(pointer),
            "status": packet.get("status") or pointer.get("status") or ("missing" if not pointer_path.exists() else "unknown"),
            "htmlPath": packet.get("htmlPath") or pointer.get("htmlPath") or "",
            "jsonPath": packet.get("jsonPath") or pointer.get("jsonPath") or pointer.get("packetPath") or str(target_path or ""),
            "markdownPath": packet.get("markdownPath") or pointer.get("markdownPath") or "",
            "csvPath": packet.get("csvPath") or pointer.get("csvPath") or "",
            "counts": counts,
            "startHereToday": packet.get("startHereToday") if isinstance(packet.get("startHereToday"), dict) else {},
            "writingOutputPlan": packet.get("writingOutputPlan") if isinstance(packet.get("writingOutputPlan"), dict) else {},
            "firstTask": packet.get("firstTask") if isinstance(packet.get("firstTask"), dict) else {},
            "firstReviewTarget": packet.get("firstReviewTarget") if isinstance(packet.get("firstReviewTarget"), dict) else {},
            "firstReviewNoteTemplate": packet.get("firstReviewNoteTemplate") if isinstance(packet.get("firstReviewNoteTemplate"), dict) else {},
            "startHereQueue": packet.get("startHereQueue") if isinstance(packet.get("startHereQueue"), list) else [],
            "reviewRows": packet.get("reviewRows") if isinstance(packet.get("reviewRows"), list) else [],
            "reviewTriageRows": packet.get("reviewTriageRows") if isinstance(packet.get("reviewTriageRows"), list) else [],
            "dailyTasks": packet.get("dailyTasks") if isinstance(packet.get("dailyTasks"), list) else [],
            "taskRows": packet.get("taskRows") if isinstance(packet.get("taskRows"), list) else [],
            "nextSafestAction": packet.get("nextSafestAction") or "Open local writing evidence and keep source, draft, approval, and publication states separate.",
            "firstSafeAction": first_open(packet),
            "truth": packet.get("truth") or "Local writing evidence only. Not canonical replacement or publication truth.",
        }
    return sources


def count_from_sources(sources: dict[str, dict[str, Any]], key: str) -> int:
    values = []
    for source in sources.values():
        counts = source.get("counts") if isinstance(source.get("counts"), dict) else {}
        if key in counts:
            values.append(safe_int(counts.get(key)))
    return max(values) if values else 0


def derive_stage(counts: dict[str, Any]) -> tuple[str, str, str]:
    if safe_int(counts.get("pendingHumanReview")):
        return (
            "drafts-need-human-review",
            "Source-backed drafts exist, but human review is still required before anything becomes canonical or publishable.",
            "Open the first draft/review packet, compare it with its source trail, and record a revision or approval note without replacing the manuscript.",
        )
    if safe_int(counts.get("currentDrafts")):
        return (
            "drafting-ready",
            "Draft packets exist and can be refined into book/article work while preserving source truth.",
            "Continue source-backed drafting and platform packet prep; keep receipts empty until real publication occurs.",
        )
    return (
        "source-ready",
        "Source packets exist, but the next useful move is to create or refresh a source-backed draft packet.",
        "Open the Author Desk or Daily Packet and create one versioned draft packet from source evidence.",
    )


def why_it_matters(source_id: str) -> str:
    return {
        "sprint": "The current front door for authoring sessions and draft review.",
        "momentum": "A quick health board for source words, drafts, pending review, and receipt truth.",
        "reviewDesk": "The safest place to compare drafts and source trails before canon or publication decisions.",
        "authorDesk": "A writer-facing desk for starting one focused source-backed task.",
        "dailyPacket": "The 25-minute writing packet that keeps work practical instead of bureaucratic.",
        "sessionCockpit": "Session planning for turning source material into draft packets.",
        "draftPacket": "One concrete draft preview with source trail and platform packet hooks.",
        "publicationRunway": "Draft/platform readiness without pretending publication happened.",
        "sourcePacket": "The source/context packet that must remain untouched and visible.",
    }.get(source_id, "Local writing evidence.")


def artifact_cards(sources: dict[str, dict[str, Any]]) -> list[dict[str, Any]]:
    cards: list[dict[str, Any]] = []
    for source_id, _, _ in SOURCE_POINTERS:
        source = sources.get(source_id, {})
        cards.append({
            "id": source_id,
            "label": source.get("label") or source_id,
            "status": source.get("status") or "unknown",
            "htmlPath": source.get("htmlPath") or "",
            "jsonPath": source.get("jsonPath") or "",
            "markdownPath": source.get("markdownPath") or "",
            "csvPath": source.get("csvPath") or "",
            "counts": source.get("counts") or {},
            "firstSafeAction": source.get("firstSafeAction") or {},
            "nextSafestAction": source.get("nextSafestAction") or "Open local writing evidence and continue safely.",
            "whyItMatters": why_it_matters(source_id),
            "truth": source.get("truth") or "Local evidence only.",
        })
    return cards


def build_25_minute_writing_plan(first_review_target: dict[str, Any], note_template: dict[str, Any], counts: dict[str, Any]) -> dict[str, Any]:
    title = str(first_review_target.get("title") or "first source-backed draft")
    open_command = str(first_review_target.get("openCommand") or "")
    return {
        "schema": "quipsly.nest-writing.twenty-five-minute-plan.v1",
        "headline": f"One calm 25-minute pass: review `{title}` without replacing canon.",
        "plainEnglish": "The useful writing unit is not 'fix the whole book.' It is one visible source-backed pass: open the draft packet, compare source trail, write a review note, prepare a revision direction, and stop before canonical manuscript replacement.",
        "counts": {
            "pendingHumanReview": counts.get("pendingHumanReview", 0),
            "draftsWithReviewFlags": counts.get("draftsWithReviewFlags", 0),
            "reviewRows": counts.get("reviewRows", 0),
            "sourceWords": counts.get("sourceWords", 0),
        },
        "firstReviewTarget": first_review_target,
        "firstReviewNoteTemplate": note_template,
        "steps": [
            {
                "label": "Open the exact draft packet",
                "minutes": 3,
                "command": open_command,
                "doneWhen": "The reviewer can see draft copy, source trail, flags, and recommended decision.",
                "safety": "Opens local review evidence only; no source or manuscript text changes.",
            },
            {
                "label": "Compare source trail before judging style",
                "minutes": 7,
                "command": open_command,
                "doneWhen": "The reviewer knows whether the issue is source accuracy, structure, voice, scaffold noise, or section size.",
                "safety": "Reading/comparison only.",
            },
            {
                "label": "Write a revision note, not a canon replacement",
                "minutes": 7,
                "command": "",
                "doneWhen": "The note says revise, approve-for-human-next-pass, hold, split, or source-check with a reason.",
                "safety": "Local review note guidance only. Canonical manuscript remains unchanged.",
            },
            {
                "label": "Prepare the next draft/revision direction",
                "minutes": 6,
                "command": "",
                "doneWhen": "There is a clear next action for Codex or Charlie: rewrite, expand, cut, split, cite, or hold.",
                "safety": "Planning/draft-prep only; no publication or receipt truth.",
            },
            {
                "label": "Stop with truth separated",
                "minutes": 2,
                "command": "",
                "doneWhen": "Source, draft, review, canon, and publication states are still visibly separate.",
                "safety": "No canonical replacement, upload, schedule, approval, or receipt capture.",
            },
        ],
        "doNotDo": [
            "Do not replace canonical manuscript text from this control room.",
            "Do not normalize Homer/Charlie voice silently.",
            "Do not treat platform copy packets as publish-ready.",
            "Do not let 'review needed' become a vague shame cloud; pick one draft and write one note.",
        ],
        "truth": "Twenty-five-minute writing plan only. It guides local review/draft work and does not mutate source files, replace canon, publish, upload, schedule, approve, or create receipts.",
    }


def build_writing_loop(sources: dict[str, dict[str, Any]], author_action_board: dict[str, Any]) -> list[dict[str, str]]:
    def open_command(source_id: str, fallback: str) -> str:
        source = sources.get(source_id) or {}
        path = str(source.get("htmlPath") or source.get("markdownPath") or source.get("jsonPath") or "")
        return f"open {shell_quote(path)}" if path else fallback

    first_task = author_action_board.get("firstTask") if isinstance(author_action_board.get("firstTask"), dict) else {}
    task_id = str(first_task.get("id") or first_task.get("taskId") or "first")
    return [
        {
            "step": "1",
            "label": "Choose one source-backed task",
            "why": "Start from source context so a writing session has roots, not vibes.",
            "command": open_command("authorDesk", "./script/agentctl.sh nest-writing-author-desk"),
            "doneWhen": "The author can name the exact source-backed task to draft or review next.",
            "safety": "Opens local writing guidance only; no source, manuscript, publication, schedule, upload, approval, or receipt changes.",
        },
        {
            "step": "2",
            "label": "Create or open one draft packet",
            "why": "A draft packet is allowed to be real AI/human writing, but it stays inspectable and source-linked.",
            "command": f"./script/agentctl.sh nest-writing-draft-packet {shell_quote(task_id)}",
            "doneWhen": "A versioned draft packet exists with source trail and review questions.",
            "safety": "Creates local draft/review evidence only; it does not replace canonical manuscript text.",
        },
        {
            "step": "3",
            "label": "Review draft against sources",
            "why": "The key Quipsly move is not forbidding AI drafting; it is making the trail visible enough to revise with confidence.",
            "command": open_command("reviewDesk", "./script/agentctl.sh nest-writing-review-desk"),
            "doneWhen": "One draft has a clear keep/revise/split/source-check decision and notes.",
            "safety": "Review guidance only; no approval, canon replacement, publication, or receipt truth.",
        },
        {
            "step": "4",
            "label": "Turn review into a revision note",
            "why": "Revision notes preserve human judgment and help agents improve without silently normalizing the author's voice.",
            "command": open_command("momentum", "./script/agentctl.sh nest-writing-momentum-board"),
            "doneWhen": "The next revision move is explicit: rewrite, expand, split, source-check, or hold.",
            "safety": "Local planning only; no manuscript mutation or external action.",
        },
        {
            "step": "5",
            "label": "Prepare publication packets only after review",
            "why": "Platform copy and article packets are useful early, but they should not imply publish readiness.",
            "command": open_command("publicationRunway", "./script/agentctl.sh writing-publication-runway"),
            "doneWhen": "Publication runway shows draft packets, receipt slots, and unresolved review gates separately.",
            "safety": "Packet prep only; no upload, schedule, external post, approval, or receipt capture.",
        },
    ]


def build_writing_start_queue(sources: dict[str, dict[str, Any]]) -> list[dict[str, Any]]:
    review_desk = sources.get("reviewDesk") or {}
    daily_packet = sources.get("dailyPacket") or {}
    queue: list[dict[str, Any]] = []

    review_rows = review_desk.get("reviewRows") if isinstance(review_desk.get("reviewRows"), list) else []
    for row in review_rows[:5]:
        if not isinstance(row, dict):
            continue
        flags = row.get("reviewFlags") if isinstance(row.get("reviewFlags"), list) else []
        title = str(row.get("title") or row.get("taskId") or "Untitled draft packet")
        queue.append({
            "kind": "review-draft",
            "label": "Review a source-backed draft",
            "title": title,
            "status": row.get("reviewStatus") or row.get("recommendedDecision") or "needs-human-review",
            "priority": row.get("rank") or len(queue) + 1,
            "why": (
                "This draft already exists and needs a visible decision before it can become canon or platform copy."
                if flags
                else "This draft packet is ready for a calm source check and human/agent review pass."
            ),
            "safeCommand": row.get("openCommand") or (f"open {shell_quote(str(row.get('htmlPath')))}" if row.get("htmlPath") else "./script/agentctl.sh nest-writing-review-desk"),
            "humanDecision": "Choose one: revise, split, source-check, hold, or approve-for-human-next-pass.",
            "codexCanDo": row.get("codexCanContinueWith") or "Prepare source comparisons, revision notes, alternate openings, and questions without replacing canonical text.",
            "sourceTrail": f"{row.get('sourceCount', 0)} source(s), {row.get('platformPacketCount', 0)} platform packet(s), {row.get('receiptSlots', 0)} receipt slot(s).",
            "flags": flags,
            "nextSafestAction": row.get("nextSafestAction") or "Open the draft packet and compare it with visible source context.",
            "safety": row.get("truth") or "Draft review only. Does not mutate sources, replace canon, publish, upload, schedule, approve, or create receipts.",
            "htmlPath": row.get("htmlPath") or "",
            "markdownPath": row.get("markdownPath") or "",
        })

    daily_tasks = daily_packet.get("dailyTasks") if isinstance(daily_packet.get("dailyTasks"), list) else []
    for task in daily_tasks[:3]:
        if not isinstance(task, dict):
            continue
        commands = task.get("safeLocalCommands") if isinstance(task.get("safeLocalCommands"), list) else []
        first_command = commands[0] if commands and isinstance(commands[0], dict) else {}
        queue.append({
            "kind": "write-from-source",
            "label": "Do a 25-minute writing sprint",
            "title": task.get("title") or task.get("taskId") or "Source-backed writing task",
            "status": task.get("status") or "ready-to-write",
            "priority": task.get("rank") or len(queue) + 1,
            "why": "This is a small, source-backed writing unit: useful enough to move the book/article forward, bounded enough to avoid systems anxiety.",
            "safeCommand": first_command.get("command") or "./script/agentctl.sh nest-writing-daily-packet",
            "humanDecision": "Pick a small paragraph, outline move, source question, or revision direction. Stop before making it canon.",
            "codexCanDo": "Create or refresh a draft packet, outline, comparison, alternate pass, question list, or platform-copy preview with the source trail visible.",
            "sourceTrail": f"{task.get('sourceCount', 0)} source(s), {task.get('wordCount', 0)} source words.",
            "flags": [],
            "nextSafestAction": task.get("safeNextAction") or task.get("writingPrompt") or "Create/review one local draft packet with provenance visible.",
            "safety": task.get("truth") or "Daily writing task only. Does not approve, publish, replace, or mutate source material.",
            "htmlPath": "",
            "markdownPath": "",
        })

    for index, row in enumerate(queue, start=1):
        row["queueRank"] = index
    return queue


def build_writing_production_runway(writing_start_queue: list[dict[str, Any]], writing_plan: dict[str, Any], counts: dict[str, Any]) -> dict[str, Any]:
    rows: list[dict[str, Any]] = []
    for row in writing_start_queue[:8]:
        if not isinstance(row, dict):
            continue
        flags = row.get("flags") if isinstance(row.get("flags"), list) else []
        kind = str(row.get("kind") or "")
        status = str(row.get("status") or "")
        needs_review = "review" in status or kind == "review-draft" or bool(flags)
        source_check = any("source" in str(flag) for flag in flags) or "source" in status
        publication_blocked = needs_review or source_check
        rows.append({
            "rank": row.get("queueRank") or len(rows) + 1,
            "lane": "Review existing draft" if kind == "review-draft" else "Create or refresh draft",
            "title": row.get("title") or "Source-backed writing task",
            "status": status or "ready",
            "focus": row.get("label") or "Writing task",
            "whyThisNow": row.get("why") or "This is the next bounded source-backed writing move.",
            "openCommand": row.get("safeCommand") or "",
            "openPath": row.get("htmlPath") or row.get("markdownPath") or "",
            "sourceTrail": row.get("sourceTrail") or "Source trail unavailable.",
            "humanMove": row.get("humanDecision") or "Choose revise, split, source-check, hold, or approve-for-human-next-pass.",
            "codexMove": row.get("codexCanDo") or "Prepare inspectable drafts, comparisons, outlines, or revision questions without replacing canon.",
            "nextSafestAction": row.get("nextSafestAction") or "Open the evidence and make one small source-backed move.",
            "flags": flags,
            "canonicalBoundary": "Not canonical. A draft/review row cannot replace manuscript text without explicit human approval.",
            "towerBoundary": "Not publish-ready." if publication_blocked else "Can feed platform packet prep, but still needs explicit publication approval and real receipts.",
            "reviewState": "needs-review" if needs_review else "ready-for-writing-pass",
            "sourceCheckState": "needs-source-check" if source_check else "source-trail-visible",
            "safety": row.get("safety") or "Local writing/review evidence only; no source mutation, canonical replacement, publication, upload, schedule, approval, or receipt creation.",
        })

    first = rows[0] if rows else {}
    return {
        "schema": "quipsly.nest-writing.production-runway.v1",
        "plainEnglish": "A returning writer should not have to decode ten artifacts. Start with one row: open the evidence, do one source-backed writing/review move, and keep source, draft, canon, platform, and receipt truth separate.",
        "firstMove": first.get("nextSafestAction") or writing_plan.get("headline") or "Open the author desk or daily packet and create one bounded source-backed draft/review move.",
        "recommendedOpenCommand": first.get("openCommand") or "",
        "rows": rows,
        "counts": {
            "rows": len(rows),
            "needsReview": sum(1 for row in rows if row.get("reviewState") == "needs-review"),
            "needsSourceCheck": sum(1 for row in rows if row.get("sourceCheckState") == "needs-source-check"),
            "drafts": counts.get("currentDrafts", 0),
            "pendingHumanReview": counts.get("pendingHumanReview", 0),
            "platformDraftItems": counts.get("platformDraftItems", 0),
            "capturedReceipts": counts.get("capturedReceipts", 0),
        },
        "truth": "Writing production runway only. It points to local evidence and does not mutate sources, replace canonical manuscript text, approve, publish, upload, schedule, overwrite versions, or create receipts.",
    }


def build_writing_work_cards(packet: dict[str, Any], limit: int = 8) -> dict[str, Any]:
    runway = packet.get("writingProductionRunway") if isinstance(packet.get("writingProductionRunway"), dict) else {}
    rows = runway.get("rows") if isinstance(runway.get("rows"), list) else []
    cards: list[dict[str, Any]] = []
    for index, row in enumerate(rows[:limit], start=1):
        if not isinstance(row, dict):
            continue
        title = str(row.get("title") or f"Writing work row {index}")
        review_state = str(row.get("reviewState") or "")
        source_state = str(row.get("sourceCheckState") or "")
        if source_state == "needs-source-check":
            recommended_move = "source-check"
        elif review_state == "needs-review":
            recommended_move = "revise"
        else:
            recommended_move = "draft"
        local_note = "\n".join([
            f"title: {title}",
            f"rank: {row.get('rank') or index}",
            f"status: {row.get('status') or ''}",
            f"recommendedMove: {recommended_move}",
            "decision: revise # draft | revise | split | source-check | hold | approve-for-human-next-pass",
            "sourceConfidence: unchecked # checked | needs-source-check | blocked",
            "canonEffect: none",
            "publicationEffect: none",
            "reason: \"\"",
            "reviewer: \"\"",
            "source: nest-writing-work-card",
            "approval: local-intent-only-not-canon-replacement",
        ])
        cards.append({
            "rank": index,
            "title": title,
            "lane": row.get("lane") or "Writing task",
            "status": row.get("status") or "",
            "recommendedMove": recommended_move,
            "sourceTrail": row.get("sourceTrail") or "Source trail unavailable.",
            "humanQuestion": row.get("humanMove") or "What should happen next: draft, revise, split, source-check, hold, or approve for human next pass?",
            "codexCanDo": row.get("codexMove") or "Prepare source comparisons, draft options, revision notes, and questions without replacing canon.",
            "openCommand": row.get("openCommand") or "",
            "openPath": row.get("openPath") or "",
            "whyThisNow": row.get("whyThisNow") or "This is the next bounded source-backed writing move.",
            "nextSafestAction": row.get("nextSafestAction") or "Open the evidence, compare the source trail, and make one local writing/review note.",
            "flags": row.get("flags") if isinstance(row.get("flags"), list) else [],
            "canonicalBoundary": row.get("canonicalBoundary") or "Not canonical. This card cannot replace manuscript text.",
            "towerBoundary": row.get("towerBoundary") or "Not publish-ready. Publication requires explicit approval and real receipts.",
            "localWorkNoteYaml": local_note,
            "safeNextAction": "Copy this local work note, do one source-backed writing/review move, and stop before canon or publication state changes.",
            "truth": "Writing work card only. It records local writing/review intent; it does not mutate sources, replace canonical manuscript text, approve, publish, upload, schedule, overwrite versions, or create receipts.",
        })
    by_move: dict[str, int] = {}
    for card in cards:
        key = str(card.get("recommendedMove") or "revise")
        by_move[key] = by_move.get(key, 0) + 1
    return {
        "schema": "quipsly.nest-writing.work-cards.v1",
        "headline": f"Writing work cards: {len(cards)} source-backed local moves ready for author/agent review.",
        "plainEnglish": "These cards turn the writing runway into a practical author workflow: open one source-backed item, make one local note or draft move, and keep source, draft, canon, platform, and receipt truth separate.",
        "cards": cards,
        "counts": {
            "cards": len(cards),
            "byRecommendedMove": by_move,
            "sourceFilesMutated": False,
            "canonicalManuscriptReplaced": False,
            "externalPublishing": False,
            "receiptTruthCreated": False,
        },
        "allowedLocalMoves": [
            "draft",
            "revise",
            "split",
            "source-check",
            "hold",
            "approve-for-human-next-pass",
        ],
        "doNotDo": [
            "Do not treat a card as canonical manuscript replacement.",
            "Do not silently normalize Homer or Charlie's voice.",
            "Do not treat platform packet text as published.",
            "Do not approve, upload, schedule, publish, or create receipt truth from these cards.",
        ],
        "truth": "Writing work cards are local writing/review intent only. They do not mutate sources, replace canon, approve, publish, upload, schedule, overwrite versions, mutate accounts, or create receipts.",
    }


def build_publishable_draft_prep_cards(packet: dict[str, Any], limit: int = 8) -> dict[str, Any]:
    work_cards = packet.get("writingWorkCards") if isinstance(packet.get("writingWorkCards"), dict) else {}
    source_cards = work_cards.get("cards") if isinstance(work_cards.get("cards"), list) else []
    cards: list[dict[str, Any]] = []
    for index, card in enumerate([row for row in source_cards if isinstance(row, dict)][:limit], start=1):
        title = str(card.get("title") or f"Draft prep row {index}")
        recommended_move = str(card.get("recommendedMove") or "revise")
        flags = [str(flag) for flag in (card.get("flags") if isinstance(card.get("flags"), list) else [])]
        if recommended_move == "source-check" or any("source" in flag.lower() for flag in flags):
            prep_route = "source-check-before-platform-prep"
            readiness = "not-ready-needs-source-check"
            first_output = "source-check-note"
        elif recommended_move in {"revise", "split"} or flags:
            prep_route = "revise-before-platform-prep"
            readiness = "draft-prep-needs-revision"
            first_output = "revision-brief"
        else:
            prep_route = "package-after-human-review"
            readiness = "candidate-after-human-review"
            first_output = "article-or-book-section-outline"
        note = "\n".join([
            "publishable_draft_prep_note:",
            f"  title: \"{title}\"",
            f"  sourceTrail: \"{card.get('sourceTrail') or ''}\"",
            f"  prepRoute: \"{prep_route}\"",
            f"  readiness: \"{readiness}\"",
            f"  firstOutput: \"{first_output}\"",
            "  canonicalReplacementApproved: false",
            "  externalPublicationApproved: false",
            "  receiptCaptured: false",
            "  humanReviewNote: \"\"",
            "  nextLocalMove: \"prepare-source-backed-draft-or-platform-preview\"",
        ])
        cards.append({
            "rank": index,
            "title": title,
            "prepRoute": prep_route,
            "readiness": readiness,
            "recommendedMove": recommended_move,
            "firstOutput": first_output,
            "sourceTrail": card.get("sourceTrail") or "Source trail unavailable.",
            "openCommand": card.get("openCommand") or "",
            "humanQuestion": "What would make this safe and useful as a book/article/social draft without canonizing it yet?",
            "codexSafeMove": "Prepare source-backed outlines, alternate draft passes, platform-copy previews, and questions while leaving canon/publication state unchanged.",
            "candidateOutputs": [
                "book-section-draft",
                "article-draft",
                "podcast-episode-page-copy",
                "social-caption-pack",
                "research/source-note",
            ],
            "canonBoundary": "Not canonical. This card cannot replace manuscript text.",
            "towerBoundary": "Not publish-ready. Tower may receive packet previews only after review, approval, and receipt slots stay explicit.",
            "localPrepNoteYaml": note,
            "truth": "Publishable draft prep card only. It can prepare source-backed drafts and platform previews, but it does not mutate sources, replace canon, approve, upload, schedule, publish, overwrite versions, mutate accounts, or create receipts.",
        })
    by_route: dict[str, int] = {}
    for card in cards:
        route = str(card.get("prepRoute") or "draft-prep")
        by_route[route] = by_route.get(route, 0) + 1
    return {
        "schema": "quipsly.nest-writing.publishable-draft-prep-cards.v1",
        "headline": f"Publishable draft prep cards: {len(cards)} source-backed draft/package candidates without canon or publication claims.",
        "plainEnglish": "These cards let Quipsly help create real book, article, episode-page, and social draft material while keeping source, draft, canon, Tower approval, and receipt truth separate.",
        "cards": cards,
        "counts": {
            "cards": len(cards),
            "byPrepRoute": by_route,
            "sourceFilesMutated": False,
            "canonicalManuscriptReplaced": False,
            "externalPublishing": False,
            "externalSchedulesCreated": False,
            "receiptTruthCreated": False,
        },
        "allowedLocalOutputs": [
            "source-check-note",
            "revision-brief",
            "book-section-draft",
            "article-draft",
            "podcast-episode-page-copy",
            "social-caption-pack",
        ],
        "doNotDo": [
            "Do not call prep cards publish-ready.",
            "Do not replace canonical manuscript text from this deck.",
            "Do not publish, upload, schedule, approve, mutate accounts, overwrite versions, or create receipt truth.",
        ],
        "truth": "Publishable draft prep cards are local draft/package prep only. They do not mutate sources, replace canon, approve, publish, upload, schedule, overwrite versions, mutate accounts, or create receipts.",
    }


def build_packet(nest_root: Path) -> dict[str, Any]:
    sources = load_sources(nest_root)
    counts = {
        "sourceWords": count_from_sources(sources, "sourceWords"),
        "sourceDocuments": count_from_sources(sources, "sourceDocuments") or count_from_sources(sources, "sourceFilesLinked"),
        "currentDrafts": count_from_sources(sources, "currentDrafts") or count_from_sources(sources, "draftPackets"),
        "draftPackets": count_from_sources(sources, "draftPackets") or count_from_sources(sources, "currentDrafts"),
        "pendingHumanReview": count_from_sources(sources, "pendingHumanReview") or count_from_sources(sources, "humanReviewRequired") or count_from_sources(sources, "needsHumanReview"),
        "reviewRows": count_from_sources(sources, "reviewRows") or count_from_sources(sources, "reviewQueueRows"),
        "reviewReady": count_from_sources(sources, "reviewReady") or count_from_sources(sources, "readyForReview"),
        "draftsWithReviewFlags": count_from_sources(sources, "draftsWithReviewFlags"),
        "recommendedRevise": count_from_sources(sources, "recommendedRevise"),
        "recommendedSplit": count_from_sources(sources, "recommendedSplit"),
        "recommendedSourceCheck": count_from_sources(sources, "recommendedSourceCheck"),
        "availableDailyTasks": count_from_sources(sources, "availableDailyTasks") or count_from_sources(sources, "selectedTasks"),
        "platformDraftItems": count_from_sources(sources, "platformDraftItems"),
        "platformPackets": count_from_sources(sources, "platformPackets") or count_from_sources(sources, "platformPacketCount"),
        "receiptSlots": count_from_sources(sources, "receiptSlots"),
        "capturedReceipts": count_from_sources(sources, "capturedReceipts"),
        "sourceBoardsPresent": sum(1 for source in sources.values() if source.get("htmlPath") or source.get("jsonPath")),
        "sourceFilesMutated": False,
        "canonicalManuscriptReplaced": False,
        "versionsOverwritten": False,
        "externalPublishing": False,
        "externalSchedulesCreated": False,
        "receiptTruthCreated": False,
        "accountMutation": False,
    }
    stage, plain, next_action = derive_stage(counts)
    if safe_int(counts.get("draftsWithReviewFlags")):
        plain = f"{plain} Review flags are visible: {counts.get('draftsWithReviewFlags')} draft(s) need source/split/scaffold/thin-draft attention before canon or publication."
        next_action = "Open the review desk or sprint triage, address one flagged draft, and keep canonical manuscript/publication state unchanged."
    sprint = sources.get("sprint") or {}
    review_desk = sources.get("reviewDesk") or {}
    first_review_target = review_desk.get("firstReviewTarget") if isinstance(review_desk.get("firstReviewTarget"), dict) else {}
    first_review_note_template = (
        review_desk.get("firstReviewNoteTemplate")
        if isinstance(review_desk.get("firstReviewNoteTemplate"), dict)
        else {}
    )
    author_action_board = {
        "mode": "author-next-action",
        "startHereToday": sprint.get("startHereToday") if isinstance(sprint.get("startHereToday"), dict) else {},
        "firstTask": sprint.get("firstTask") if isinstance(sprint.get("firstTask"), dict) else {},
        "firstReviewTarget": first_review_target,
        "firstReviewNoteTemplate": first_review_note_template,
        "reviewTriageRows": sprint.get("reviewTriageRows") if isinstance(sprint.get("reviewTriageRows"), list) else [],
        "taskRows": sprint.get("taskRows") if isinstance(sprint.get("taskRows"), list) else [],
        "writingOutputPlan": sprint.get("writingOutputPlan") if isinstance(sprint.get("writingOutputPlan"), dict) else {},
        "firstSafeAction": sprint.get("firstSafeAction") if isinstance(sprint.get("firstSafeAction"), dict) else {},
        "nextSafestAction": sprint.get("nextSafestAction") or next_action,
        "truth": sprint.get("truth") or "Author action board reads local writing sprint evidence only.",
    }
    writing_loop = build_writing_loop(sources, author_action_board)
    writing_start_queue = build_writing_start_queue(sources)
    counts["writingStartQueueRows"] = len(writing_start_queue)
    writing_plan = build_25_minute_writing_plan(first_review_target, first_review_note_template, counts)
    writing_runway = build_writing_production_runway(writing_start_queue, writing_plan, counts)
    runway_counts = writing_runway.get("counts") if isinstance(writing_runway.get("counts"), dict) else {}
    counts["writingRunwayRows"] = runway_counts.get("rows", 0)
    counts["writingRunwayNeedsReviewRows"] = runway_counts.get("needsReview", 0)
    counts["writingRunwayNeedsSourceCheckRows"] = runway_counts.get("needsSourceCheck", 0)
    writing_work_cards_seed = {"writingProductionRunway": writing_runway}
    writing_work_cards = build_writing_work_cards(writing_work_cards_seed, limit=8)
    counts["writingWorkCards"] = (writing_work_cards.get("counts") or {}).get("cards", 0)
    publishable_draft_prep_cards = build_publishable_draft_prep_cards({"writingWorkCards": writing_work_cards}, limit=8)
    counts["publishableDraftPrepCards"] = (publishable_draft_prep_cards.get("counts") or {}).get("cards", 0)
    next_writing_card = sources.get("nextWritingCard") or {}
    next_writing_card_path = str(next_writing_card.get("htmlPath") or "")
    return {
        "schema": SCHEMA,
        "generatedAt": iso_now(),
        "status": f"nest-writing-control-room-{stage}",
        "stage": stage,
        "nestRoot": str(nest_root),
        "plainEnglish": plain,
        "counts": counts,
        "humanAsk": "Use this as the Nest writing front door: choose one source-backed writing/review task, keep the source trail visible, and do not replace canonical manuscript text without explicit human approval.",
        "agentSafeParallelWork": "Codex can draft, outline, compare sources, prepare revision notes, generate platform copy packets, and improve review surfaces. It must not mutate source files, replace canonical manuscript text, publish, upload, schedule, approve, or create receipt truth.",
        "nextSafestAction": next_action,
        "firstReviewTarget": first_review_target,
        "firstReviewNoteTemplate": first_review_note_template,
        "twentyFiveMinuteWritingPlan": writing_plan,
        "writingProductionRunway": writing_runway,
        "writingWorkCards": writing_work_cards,
        "publishableDraftPrepCards": publishable_draft_prep_cards,
        "nextWritingCardPath": next_writing_card_path,
        "authorActionBoard": author_action_board,
        "writingStartQueue": writing_start_queue,
        "writingLoop": writing_loop,
        "artifactCards": artifact_cards(sources),
        "writingTruthContract": {
            "source": "Imported/source material remains preserved and visible.",
            "draft": "AI/human generated text is a versioned draft packet with source trail, not canonical replacement.",
            "humanReview": "Human review or explicit approval is required before canonical manuscript or publication state changes.",
            "published": "Only real external URLs/provider receipts count as publication truth.",
        },
        "sourcePointers": {source_id: source.get("pointerPath") or "" for source_id, source in sources.items()},
        "sourceArtifacts": {source_id: {key: source.get(key) or "" for key in ("htmlPath", "jsonPath", "markdownPath", "csvPath")} for source_id, source in sources.items()},
        "truth": {
            "description": "Nest writing control room only. It reads local writing/research/draft/review evidence; it does not mutate sources, replace canonical manuscript text, publish, upload, schedule, approve, overwrite versions, or create receipt truth.",
            "sourceFilesMutated": False,
            "originalsMutated": False,
            "canonicalManuscriptReplaced": False,
            "versionsOverwritten": False,
            "externalPublishing": False,
            "externalSchedulesCreated": False,
            "receiptTruthCreated": False,
            "accountMutation": False,
            "approvalCreated": False,
        },
        "safety": "Local Nest writing control room only. No source mutation, no canonical manuscript replacement, no external account action, no upload, no schedule, no publish, no approval, no receipt capture.",
    }


def prepare_output_dir(nest_root: Path) -> Path:
    out_dir = nest_root / "ControlRooms" / stamp()
    base = out_dir
    counter = 2
    while out_dir.exists():
        out_dir = Path(f"{base}-{counter}")
        counter += 1
    out_dir.mkdir(parents=True, exist_ok=False)
    return out_dir


def write_csv(path: Path, packet: dict[str, Any]) -> None:
    fields = ["id", "label", "status", "htmlPath", "jsonPath", "nextSafestAction"]
    with path.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=fields)
        writer.writeheader()
        for card in packet.get("artifactCards") or []:
            writer.writerow({field: card.get(field, "") for field in fields})


def write_markdown(path: Path, packet: dict[str, Any]) -> None:
    lines = [
        "# Nest writing control room",
        "",
        f"Generated: `{packet['generatedAt']}`",
        f"Status: `{packet['status']}`",
        "",
        packet["plainEnglish"],
        "",
        packet["safety"],
        "",
        "## Counts",
        "",
    ]
    for key, value in packet.get("counts", {}).items():
        lines.append(f"- {key}: `{value}`")
    runway = packet.get("writingProductionRunway") if isinstance(packet.get("writingProductionRunway"), dict) else {}
    runway_rows = runway.get("rows") if isinstance(runway.get("rows"), list) else []
    lines.extend(["", "## Writing production runway", "", runway.get("plainEnglish", ""), ""])
    lines.append(f"- First move: {runway.get('firstMove', '')}")
    lines.append(f"- Open: `{runway.get('recommendedOpenCommand', '')}`")
    lines.append(f"- Work cards: `{packet.get('writingWorkCardsPath', '')}`")
    lines.append(f"- Publishable draft prep cards: `{packet.get('publishableDraftPrepCardsPath', '')}`")
    lines.append(f"- Truth: {runway.get('truth', '')}")
    if runway_rows:
        for row in runway_rows:
            if not isinstance(row, dict):
                continue
            flags = ", ".join(str(flag) for flag in (row.get("flags") if isinstance(row.get("flags"), list) else [])) or "none"
            lines.extend([
                "",
                f"### {row.get('rank', '')}. {row.get('title', '')}",
                "",
                f"- Lane: `{row.get('lane', '')}`",
                f"- Status: `{row.get('status', '')}`",
                f"- Focus: {row.get('focus', '')}",
                f"- Why this now: {row.get('whyThisNow', '')}",
                f"- Open command: `{row.get('openCommand', '')}`",
                f"- Source trail: {row.get('sourceTrail', '')}",
                f"- Human move: {row.get('humanMove', '')}",
                f"- Codex move: {row.get('codexMove', '')}",
                f"- Canon boundary: {row.get('canonicalBoundary', '')}",
                f"- Tower boundary: {row.get('towerBoundary', '')}",
                f"- Flags: `{flags}`",
            ])
    work_cards = packet.get("writingWorkCards") if isinstance(packet.get("writingWorkCards"), dict) else {}
    if work_cards:
        lines.extend([
            "",
            "## Writing work cards",
            "",
            work_cards.get("headline", ""),
            "",
            work_cards.get("plainEnglish", ""),
            "",
            f"Cards file: `{packet.get('writingWorkCardsPath', '')}`",
            "",
            "Cards:",
        ])
        for card in work_cards.get("cards") or []:
            if not isinstance(card, dict):
                continue
            lines.extend([
                f"- {card.get('rank')}. `{card.get('title')}` move=`{card.get('recommendedMove')}` status=`{card.get('status')}`",
                f"  - Question: {card.get('humanQuestion')}",
                f"  - Open: `{card.get('openCommand')}`",
                f"  - Safe next: {card.get('safeNextAction')}",
            ])
    start_queue = packet.get("writingStartQueue") if isinstance(packet.get("writingStartQueue"), list) else []
    lines.extend(["", "## Start here: writing/review queue", ""])
    if start_queue:
        for row in start_queue[:8]:
            if not isinstance(row, dict):
                continue
            flags = ", ".join(str(flag) for flag in (row.get("flags") if isinstance(row.get("flags"), list) else [])) or "none"
            lines.extend([
                f"### {row.get('queueRank', '')}. {row.get('label', '')}",
                "",
                f"- Title: `{row.get('title', '')}`",
                f"- Status: `{row.get('status', '')}`",
                f"- Why: {row.get('why', '')}",
                f"- Safe command: `{row.get('safeCommand', '')}`",
                f"- Human decision: {row.get('humanDecision', '')}",
                f"- Codex can do: {row.get('codexCanDo', '')}",
                f"- Source trail: {row.get('sourceTrail', '')}",
                f"- Flags: `{flags}`",
                f"- Safety: {row.get('safety', '')}",
                "",
            ])
    else:
        lines.append("No start queue rows are available yet. Open the review desk or daily packet.")
    board = packet.get("authorActionBoard") if isinstance(packet.get("authorActionBoard"), dict) else {}
    today = board.get("startHereToday") if isinstance(board.get("startHereToday"), dict) else {}
    plan = board.get("writingOutputPlan") if isinstance(board.get("writingOutputPlan"), dict) else {}
    first_review = packet.get("firstReviewTarget") if isinstance(packet.get("firstReviewTarget"), dict) else {}
    note_template = packet.get("firstReviewNoteTemplate") if isinstance(packet.get("firstReviewNoteTemplate"), dict) else {}
    lines.extend(["", "## Author next action", ""])
    lines.extend([
        f"- Mode: `{today.get('mode', '')}`",
        f"- Today: `{today.get('title', '')}`",
        f"- Why: {today.get('why', '')}",
        f"- Recommended move: `{today.get('recommendedMove', '')}`",
        f"- Safe command: `{today.get('safeCommand', '')}`",
        f"- Human question: {today.get('humanQuestion', '')}",
        f"- Codex-safe move: {today.get('agentMove', '')}",
        "",
        "### Safe writing outputs",
        "",
    ])
    for output in plan.get("safeOutputs", []) if isinstance(plan.get("safeOutputs"), list) else []:
        lines.append(f"- **{output.get('label', '')}**: {output.get('means', '')} Canon effect: `{output.get('canonEffect', '')}`")
    lines.extend(["", "### Human review gate", ""])
    for gate in plan.get("humanReviewGate", []) if isinstance(plan.get("humanReviewGate"), list) else []:
        lines.append(f"- [ ] {gate}")
    lines.extend(["", "### Review triage", ""])
    for row in board.get("reviewTriageRows", [])[:6] if isinstance(board.get("reviewTriageRows"), list) else []:
        lines.append(f"- **{row.get('title', '')}** `{row.get('recommendedDecision', '')}` - {row.get('nextSafestAction', '')}")
    if first_review:
        lines.extend(["", "## First review target", ""])
        lines.append(f"- Title: `{first_review.get('title')}`")
        lines.append(f"- Recommended decision: `{first_review.get('recommendedDecision')}`")
        lines.append(f"- Primary move: `{first_review.get('primaryWritingMove')}`")
        lines.append(f"- Open: `{first_review.get('openCommand')}`")
        lines.append(f"- Flags: `{first_review.get('reviewFlagSummary')}`")
        if note_template.get("markdownTemplate"):
            lines.append("")
            lines.append("### Review note template")
            lines.append("```md")
            lines.append(str(note_template.get("markdownTemplate")))
            lines.append("```")
    writing_plan = packet.get("twentyFiveMinuteWritingPlan") if isinstance(packet.get("twentyFiveMinuteWritingPlan"), dict) else {}
    if writing_plan:
        lines.extend(["", "## 25-minute writing plan", "", writing_plan.get("headline", ""), "", writing_plan.get("plainEnglish", ""), ""])
        for step in writing_plan.get("steps") or []:
            if isinstance(step, dict):
                lines.append(f"- {step.get('minutes')} min - {step.get('label')}: `{step.get('command')}`")
                lines.append(f"  - Done when: {step.get('doneWhen')}")
                lines.append(f"  - Safety: {step.get('safety')}")
        lines.extend(["", "Do not do:"])
        for item in writing_plan.get("doNotDo") or []:
            lines.append(f"- {item}")
    lines.extend(["", "## Writing loop", ""])
    for step in packet.get("writingLoop") or []:
        lines.append(f"- {step.get('step')}. {step.get('label')}: `{step.get('command')}`")
        lines.append(f"  - Done when: {step.get('doneWhen')}")
        lines.append(f"  - Safety: {step.get('safety')}")
    lines.extend(["", "## Front doors", ""])
    for card in packet.get("artifactCards") or []:
        lines.append(f"- **{card.get('label')}** `{card.get('status')}` - {card.get('nextSafestAction')}")
        if card.get("htmlPath"):
            lines.append(f"  - HTML: `{card.get('htmlPath')}`")
    path.write_text("\n".join(lines).rstrip() + "\n", encoding="utf-8")


def write_writing_runway_markdown(path: Path, packet: dict[str, Any]) -> None:
    runway = packet.get("writingProductionRunway") if isinstance(packet.get("writingProductionRunway"), dict) else {}
    rows = runway.get("rows") if isinstance(runway.get("rows"), list) else []
    lines = [
        "# Nest writing production runway",
        "",
        "Start here when the book, article, or source-note workflow feels foggy.",
        "",
        f"- Generated: `{packet.get('generatedAt', '')}`",
        f"- Control room: `{packet.get('htmlPath', '')}`",
        f"- Status: `{packet.get('status', '')}`",
        f"- First move: {runway.get('firstMove', '')}",
        f"- Open: `{runway.get('recommendedOpenCommand', '')}`",
        "",
        runway.get("plainEnglish", ""),
        "",
        "## Truth contract",
        "",
        "- Sources stay preserved.",
        "- Drafts and rewrites are allowed, but they stay inspectable and source-linked.",
        "- Canonical manuscript replacement requires explicit human approval.",
        "- Platform packets are prep, not publication.",
        "- Receipts require real external evidence.",
        "",
        "## Runway rows",
        "",
    ]
    if not rows:
        lines.append("No runway rows exist yet. Open the Author Desk or Daily Packet and create one bounded source-backed draft packet.")
    for row in rows:
        if not isinstance(row, dict):
            continue
        flags = ", ".join(str(flag) for flag in (row.get("flags") if isinstance(row.get("flags"), list) else [])) or "none"
        lines.extend([
            f"### {row.get('rank', '')}. {row.get('title', '')}",
            "",
            f"- Lane: `{row.get('lane', '')}`",
            f"- Status: `{row.get('status', '')}`",
            f"- Focus: {row.get('focus', '')}",
            f"- Why this now: {row.get('whyThisNow', '')}",
            f"- Open command: `{row.get('openCommand', '')}`",
            f"- Source trail: {row.get('sourceTrail', '')}",
            f"- Human move: {row.get('humanMove', '')}",
            f"- Codex move: {row.get('codexMove', '')}",
            f"- Next safest action: {row.get('nextSafestAction', '')}",
            f"- Review state: `{row.get('reviewState', '')}`",
            f"- Source-check state: `{row.get('sourceCheckState', '')}`",
            f"- Canon boundary: {row.get('canonicalBoundary', '')}",
            f"- Tower boundary: {row.get('towerBoundary', '')}",
            f"- Flags: `{flags}`",
            f"- Safety: {row.get('safety', '')}",
            "",
        ])
    lines.extend([
        "## What Codex can safely do from here",
        "",
        "- Prepare source comparisons.",
        "- Draft alternate openings or revision passes as sidecars.",
        "- Build article/social packet previews.",
        "- Create question lists for Charlie/Homer/Mako.",
        "- Improve this runway when the work feels scary or unclear.",
        "",
        "## What this file cannot do",
        "",
        "- It cannot replace the manuscript.",
        "- It cannot publish.",
        "- It cannot approve.",
        "- It cannot create receipt truth.",
    ])
    path.write_text("\n".join(lines).rstrip() + "\n", encoding="utf-8")


def write_writing_work_cards_markdown(path: Path, packet: dict[str, Any]) -> None:
    work_cards = packet.get("writingWorkCards") if isinstance(packet.get("writingWorkCards"), dict) else {}
    lines = [
        "# Nest writing work cards",
        "",
        work_cards.get("headline", ""),
        "",
        work_cards.get("plainEnglish", ""),
        "",
        "These cards are local writing/review intent only. They are not canonical manuscript replacement, approval, upload, schedule, publication, account mutation, overwrite, or receipt truth.",
        "",
        "## Allowed local moves",
    ]
    for item in work_cards.get("allowedLocalMoves") or []:
        lines.append(f"- `{item}`")
    lines.extend(["", "## Cards"])
    for card in work_cards.get("cards") or []:
        if not isinstance(card, dict):
            continue
        flags = ", ".join(str(flag) for flag in (card.get("flags") if isinstance(card.get("flags"), list) else [])) or "none"
        lines.extend([
            "",
            f"### {card.get('rank')}. {card.get('title')}",
            "",
            f"- Lane: `{card.get('lane')}`",
            f"- Status: `{card.get('status')}`",
            f"- Recommended move: `{card.get('recommendedMove')}`",
            f"- Source trail: {card.get('sourceTrail')}",
            f"- Why this now: {card.get('whyThisNow')}",
            f"- Human question: {card.get('humanQuestion')}",
            f"- Codex can do: {card.get('codexCanDo')}",
            f"- Open: `{card.get('openCommand')}`",
            f"- Flags: `{flags}`",
            f"- Canon boundary: {card.get('canonicalBoundary')}",
            f"- Tower boundary: {card.get('towerBoundary')}",
            f"- Safe next action: {card.get('safeNextAction')}",
            "",
            "Copyable local work note:",
            "",
            "```yaml",
            card.get("localWorkNoteYaml") or "",
            "```",
            "",
            f"Truth: {card.get('truth')}",
        ])
    lines.extend(["", "## Do not do"])
    for item in work_cards.get("doNotDo") or []:
        lines.append(f"- {item}")
    lines.extend(["", "## Truth", "", work_cards.get("truth", "")])
    path.write_text("\n".join(str(line) for line in lines).rstrip() + "\n", encoding="utf-8")


def write_publishable_draft_prep_cards_markdown(path: Path, packet: dict[str, Any]) -> None:
    prep_cards = packet.get("publishableDraftPrepCards") if isinstance(packet.get("publishableDraftPrepCards"), dict) else {}
    lines = [
        "# Nest publishable draft prep cards",
        "",
        prep_cards.get("headline", ""),
        "",
        prep_cards.get("plainEnglish", ""),
        "",
        "These cards help create useful book, article, episode-page, and social draft material. They are not canon approval, external publication, upload, schedule, or receipt truth.",
        "",
        "## Allowed local outputs",
    ]
    for item in prep_cards.get("allowedLocalOutputs") or []:
        lines.append(f"- `{item}`")
    lines.extend(["", "## Cards"])
    for card in prep_cards.get("cards") or []:
        if not isinstance(card, dict):
            continue
        lines.extend([
            "",
            f"### {card.get('rank')}. {card.get('title')}",
            "",
            f"- Prep route: `{card.get('prepRoute')}`",
            f"- Readiness: `{card.get('readiness')}`",
            f"- Recommended move: `{card.get('recommendedMove')}`",
            f"- First output: `{card.get('firstOutput')}`",
            f"- Source trail: {card.get('sourceTrail')}",
            f"- Open evidence: `{card.get('openCommand')}`",
            f"- Human question: {card.get('humanQuestion')}",
            f"- Codex-safe move: {card.get('codexSafeMove')}",
            f"- Candidate outputs: `{', '.join(card.get('candidateOutputs') or [])}`",
            f"- Canon boundary: {card.get('canonBoundary')}",
            f"- Tower boundary: {card.get('towerBoundary')}",
            "",
            "Copyable draft prep note:",
            "",
            "```yaml",
            card.get("localPrepNoteYaml") or "",
            "```",
            "",
            f"Truth: {card.get('truth')}",
        ])
    lines.extend(["", "## Do not do"])
    for item in prep_cards.get("doNotDo") or []:
        lines.append(f"- {item}")
    lines.extend(["", "## Truth", "", prep_cards.get("truth", "")])
    path.write_text("\n".join(str(line) for line in lines).rstrip() + "\n", encoding="utf-8")


def write_first_writing_session_note(path: Path, packet: dict[str, Any]) -> None:
    first_review = packet.get("firstReviewTarget") if isinstance(packet.get("firstReviewTarget"), dict) else {}
    note_template = packet.get("firstReviewNoteTemplate") if isinstance(packet.get("firstReviewNoteTemplate"), dict) else {}
    writing_plan = packet.get("twentyFiveMinuteWritingPlan") if isinstance(packet.get("twentyFiveMinuteWritingPlan"), dict) else {}
    board = packet.get("authorActionBoard") if isinstance(packet.get("authorActionBoard"), dict) else {}
    today = board.get("startHereToday") if isinstance(board.get("startHereToday"), dict) else {}
    title = first_review.get("title") or today.get("title") or "First source-backed writing session"
    lines = [
        "# First writing session note",
        "",
        "This is a working note, not canon. Use it to do one calm source-backed pass, then decide the next revision move.",
        "",
        f"- Generated: `{packet.get('generatedAt', '')}`",
        f"- Control room: `{packet.get('htmlPath', '')}`",
        f"- Target: `{title}`",
        f"- Recommended move: `{first_review.get('primaryWritingMove') or today.get('recommendedMove') or ''}`",
        f"- Open evidence: `{first_review.get('openCommand') or today.get('safeCommand') or ''}`",
        "",
        "## Session rule",
        "",
        "- Source stays preserved.",
        "- Draft text is allowed.",
        "- Rewrites are allowed.",
        "- Canonical manuscript replacement is not automatic.",
        "- Publication, upload, scheduling, approval, and receipt truth stay separate.",
        "",
        "## 25-minute plan",
        "",
        writing_plan.get("plainEnglish", ""),
        "",
    ]
    for step in writing_plan.get("steps") or []:
        if not isinstance(step, dict):
            continue
        lines.extend([
            f"### {step.get('minutes')} min - {step.get('label')}",
            "",
            f"- Command: `{step.get('command')}`",
            f"- Done when: {step.get('doneWhen')}",
            f"- Safety: {step.get('safety')}",
            "",
        ])
    if first_review:
        lines.extend([
            "## First review target",
            "",
            f"- Title: `{first_review.get('title', '')}`",
            f"- Recommended decision: `{first_review.get('recommendedDecision', '')}`",
            f"- Primary writing move: `{first_review.get('primaryWritingMove', '')}`",
            f"- Flags: `{first_review.get('reviewFlagSummary', '')}`",
            "",
        ])
    template_text = str(note_template.get("markdownTemplate") or "").strip()
    if template_text:
        lines.extend([
            "## Source-backed review note template",
            "",
            "```md",
            template_text,
            "```",
            "",
        ])
    lines.extend([
        "## Working note",
        "",
        "### What source says",
        "",
        "- ",
        "",
        "### What the draft currently does",
        "",
        "- ",
        "",
        "### What should change",
        "",
        "- ",
        "",
        "### Draft/rewrite attempt",
        "",
        "",
        "### Next action",
        "",
        "- [ ] revise",
        "- [ ] approve for human next pass",
        "- [ ] split",
        "- [ ] source-check",
        "- [ ] hold",
        "",
        "## Explicit non-claims",
        "",
        "- This note did not mutate source files.",
        "- This note did not replace the canonical manuscript.",
        "- This note did not publish, upload, schedule, approve, or create a receipt.",
    ])
    path.write_text("\n".join(lines).rstrip() + "\n", encoding="utf-8")


def write_writer_return_handoff(path: Path, packet: dict[str, Any]) -> None:
    """Write the smallest useful return-to-writing handoff for a tired human.

    The control room is intentionally complete. This file is intentionally not:
    it answers "what do I open first, what is safe, and what is not true yet?"
    without making the author decode every artifact.
    """
    counts = packet.get("counts") if isinstance(packet.get("counts"), dict) else {}
    runway = packet.get("writingProductionRunway") if isinstance(packet.get("writingProductionRunway"), dict) else {}
    runway_rows = runway.get("rows") if isinstance(runway.get("rows"), list) else []
    start_queue = packet.get("writingStartQueue") if isinstance(packet.get("writingStartQueue"), list) else []
    work_cards = packet.get("writingWorkCards") if isinstance(packet.get("writingWorkCards"), dict) else {}
    writing_work_cards_path = str(packet.get("writingWorkCardsPath") or "")
    publishable_draft_prep_cards_path = str(packet.get("publishableDraftPrepCardsPath") or "")
    first_session_note_path = str(packet.get("firstWritingSessionNotePath") or "")
    writing_runway_path = str(packet.get("writingRunwayPath") or "")
    html_path = str(packet.get("htmlPath") or "")
    first_move = str(runway.get("firstMove") or packet.get("nextSafestAction") or "Open one source-backed writing task and make one visible review/draft move.")
    first_command = f"open {shell_quote(writing_work_cards_path)}" if writing_work_cards_path else str(runway.get("recommendedOpenCommand") or "")
    if not first_command and first_session_note_path:
        first_command = f"open {shell_quote(first_session_note_path)}"
    elif not first_command and html_path:
        first_command = f"open {shell_quote(html_path)}"

    lines = [
        "# Nest writer return handoff",
        "",
        "This is the calm re-entry point for book, article, notes, and research work. It is meant to be read before opening the larger control room.",
        "",
        f"- Generated: `{packet.get('generatedAt', '')}`",
        f"- Status: `{packet.get('status', '')}`",
        f"- First move: {first_move}",
        f"- Open first: `{first_command}`",
        f"- Writing work cards: `{writing_work_cards_path}`",
        f"- Publishable draft prep cards: `{publishable_draft_prep_cards_path}`",
        f"- Writing runway: `{writing_runway_path}`",
        f"- First session note: `{first_session_note_path}`",
        f"- Full control room: `{html_path}`",
        "",
        "## Current writing truth",
        "",
        f"- Source words visible: `{counts.get('sourceWords', 0)}`",
        f"- Source documents visible: `{counts.get('sourceDocuments', 0)}`",
        f"- Draft packets visible: `{counts.get('currentDrafts', 0) or counts.get('draftPackets', 0)}`",
        f"- Pending human review: `{counts.get('pendingHumanReview', 0)}`",
        f"- Review rows: `{counts.get('reviewRows', 0)}`",
        f"- Platform draft items: `{counts.get('platformDraftItems', 0)}`",
        f"- Captured receipts: `{counts.get('capturedReceipts', 0)}`",
        "",
        "## What to do next",
        "",
        "1. Open the first row below.",
        "2. Compare the draft/work item to its source trail.",
        "3. Make one small decision: revise, split, source-check, hold, or approve-for-human-next-pass.",
        "4. Stop before treating draft material as canon or publication truth.",
        "",
        "## First useful rows",
        "",
    ]
    if work_cards:
        lines.extend([
            "Open the work cards when you want the smallest possible next move. They contain copyable local notes and do not change canon or publication truth.",
            "",
        ])
    rows = runway_rows[:5] if runway_rows else start_queue[:5]
    if not rows:
        lines.append("No rows are available yet. Run `./script/agentctl.sh nest-writing-daily-packet` then `./script/agentctl.sh nest-writing-control-room`.")
    for row in rows:
        if not isinstance(row, dict):
            continue
        title = row.get("title") or row.get("label") or "Writing row"
        command = row.get("openCommand") or row.get("safeCommand") or ""
        human_move = row.get("humanMove") or row.get("humanDecision") or "Choose the next visible writing/review move."
        codex_move = row.get("codexMove") or row.get("codexCanDo") or "Prepare source comparisons, drafts, revision notes, and questions without replacing canon."
        lines.extend([
            f"### {row.get('rank') or row.get('queueRank') or ''}. {title}",
            "",
            f"- Status: `{row.get('status', '')}`",
            f"- Open: `{command}`",
            f"- Human move: {human_move}",
            f"- Codex move: {codex_move}",
            f"- Next safest action: {row.get('nextSafestAction', '')}",
            "",
        ])

    lines.extend([
        "## Clear boundaries",
        "",
        "- Drafting and rewriting are allowed.",
        "- Source trails must stay visible.",
        "- Canonical manuscript replacement has not happened here.",
        "- Publishing, uploading, scheduling, approval, and receipt capture have not happened here.",
        "- If a row feels scary or vague, make it smaller instead of forcing a fake decision.",
        "",
        "## Safe Codex work while Charlie is away",
        "",
        "- Prepare source-backed draft packets.",
        "- Draft alternate openings or revision passes as sidecars.",
        "- Summarize source trails and questions.",
        "- Prepare platform-copy packets with receipt slots empty.",
        "- Prepare publishable draft prep cards without canon or publication claims.",
        "- Improve this handoff if the writing lane feels maze-like.",
        "",
        "## Explicit non-claims",
        "",
        "- No source files were mutated.",
        "- No manuscript text was canonized.",
        "- No publication happened.",
        "- No external account was changed.",
        "- No receipt truth was created.",
    ])
    path.write_text("\n".join(lines).rstrip() + "\n", encoding="utf-8")


def write_html(path: Path, packet: dict[str, Any]) -> None:
    counts = packet.get("counts") or {}
    metrics = "".join(
        f"<span><strong>{esc(value)}</strong>{esc(label)}</span>"
        for label, value in [
            ("source words", counts.get("sourceWords", 0)),
            ("drafts", counts.get("currentDrafts", 0)),
            ("needs review", counts.get("pendingHumanReview", 0)),
            ("review rows", counts.get("reviewRows", 0)),
            ("flagged drafts", counts.get("draftsWithReviewFlags", 0)),
            ("platform drafts", counts.get("platformDraftItems", 0)),
            ("receipts", counts.get("capturedReceipts", 0)),
        ]
    )
    cards = []
    for card in packet.get("artifactCards") or []:
        first = card.get("firstSafeAction") if isinstance(card.get("firstSafeAction"), dict) else {}
        counts_text = ", ".join(f"{key}: {value}" for key, value in (card.get("counts") or {}).items() if isinstance(value, (str, int, float, bool)) and key in {"sourceWords", "currentDrafts", "pendingHumanReview", "reviewRows", "reviewReady", "selectedTasks", "platformDraftItems", "receiptSlots", "capturedReceipts"})
        cards.append(f"""
        <article class="card">
          <div class="card-top"><span>{esc(card.get('status'))}</span><b>{esc(card.get('label'))}</b></div>
          <p>{esc(card.get('whyItMatters'))}</p>
          <p class="muted">{esc(counts_text)}</p>
          <p><strong>Next:</strong> {esc(card.get('nextSafestAction'))}</p>
          <pre>{esc(first.get('command') or '')}</pre>
          <details><summary>Paths</summary><code>{esc(card.get('htmlPath'))}</code><code>{esc(card.get('jsonPath'))}</code></details>
        </article>
        """)
    contract = packet.get("writingTruthContract") if isinstance(packet.get("writingTruthContract"), dict) else {}
    board = packet.get("authorActionBoard") if isinstance(packet.get("authorActionBoard"), dict) else {}
    today = board.get("startHereToday") if isinstance(board.get("startHereToday"), dict) else {}
    plan = board.get("writingOutputPlan") if isinstance(board.get("writingOutputPlan"), dict) else {}
    first_review = packet.get("firstReviewTarget") if isinstance(packet.get("firstReviewTarget"), dict) else {}
    note_template = packet.get("firstReviewNoteTemplate") if isinstance(packet.get("firstReviewNoteTemplate"), dict) else {}
    writing_plan = packet.get("twentyFiveMinuteWritingPlan") if isinstance(packet.get("twentyFiveMinuteWritingPlan"), dict) else {}
    safe_outputs = "".join(
        f"<article class='mini-card'><h3>{esc(row.get('label'))}</h3><p>{esc(row.get('means'))}</p><p><b>Canon effect:</b> {esc(row.get('canonEffect'))}</p></article>"
        for row in (plan.get("safeOutputs") if isinstance(plan.get("safeOutputs"), list) else [])
    )
    review_gate = "".join(f"<li>{esc(item)}</li>" for item in (plan.get("humanReviewGate") if isinstance(plan.get("humanReviewGate"), list) else []))
    triage = "".join(
        f"<li><b>{esc(row.get('title'))}</b><br>{esc(row.get('recommendedDecision'))} · {esc(row.get('nextSafestAction'))}</li>"
        for row in ((board.get("reviewTriageRows") if isinstance(board.get("reviewTriageRows"), list) else [])[:6])
    )
    review_target = ""
    if first_review:
        review_target = f"""
        <section class="review-target">
          <div class="eyebrow">First review target</div>
          <h3>{esc(first_review.get('title'))}</h3>
          <p><b>Recommended decision:</b> {esc(first_review.get('recommendedDecision'))} · <b>Move:</b> {esc(first_review.get('primaryWritingMove'))}</p>
          <p><b>Flags:</b> {esc(first_review.get('reviewFlagSummary'))}</p>
          <pre>{esc(first_review.get('openCommand'))}</pre>
          <details open><summary>Review note template</summary><pre>{esc(note_template.get('markdownTemplate'))}</pre></details>
        </section>
        """
    writing_loop = "".join(
        f"""
        <article class='loop-card'>
          <b>{esc(step.get('step'))}</b>
          <h3>{esc(step.get('label'))}</h3>
          <p>{esc(step.get('why'))}</p>
          <pre>{esc(step.get('command'))}</pre>
          <p><strong>Done when:</strong> {esc(step.get('doneWhen'))}</p>
          <p>{esc(step.get('safety'))}</p>
        </article>
        """
        for step in (packet.get("writingLoop") or [])
    )
    writing_plan_steps = "".join(
        f"""
        <article class='mini-card'>
          <h3>{esc(step.get('minutes'))} min · {esc(step.get('label'))}</h3>
          <p><strong>Done when:</strong> {esc(step.get('doneWhen'))}</p>
          <pre>{esc(step.get('command'))}</pre>
          <p>{esc(step.get('safety'))}</p>
        </article>
        """
        for step in (writing_plan.get("steps") if isinstance(writing_plan.get("steps"), list) else [])
        if isinstance(step, dict)
    )
    writing_plan_donts = "".join(f"<li>{esc(item)}</li>" for item in (writing_plan.get("doNotDo") if isinstance(writing_plan.get("doNotDo"), list) else []))
    start_queue = "".join(
        f"""
        <article class='start-card {esc(str(row.get("kind") or ""))}'>
          <div class="queue-rank">{esc(row.get('queueRank'))}</div>
          <div>
            <span class="pill">{esc(row.get('kind'))}</span>
            <h3>{esc(row.get('title'))}</h3>
            <p><b>{esc(row.get('label'))}</b> · {esc(row.get('status'))}</p>
            <p>{esc(row.get('why'))}</p>
            <p><strong>Human decision:</strong> {esc(row.get('humanDecision'))}</p>
            <p><strong>Codex can do:</strong> {esc(row.get('codexCanDo'))}</p>
            <p><strong>Source trail:</strong> {esc(row.get('sourceTrail'))}</p>
            <p><strong>Flags:</strong> {esc(', '.join(str(flag) for flag in row.get('flags')) if isinstance(row.get('flags'), list) and row.get('flags') else 'none')}</p>
            <pre>{esc(row.get('safeCommand'))}</pre>
            <p class="muted">{esc(row.get('safety'))}</p>
          </div>
        </article>
        """
        for row in (packet.get("writingStartQueue") if isinstance(packet.get("writingStartQueue"), list) else [])[:8]
        if isinstance(row, dict)
    )
    runway = packet.get("writingProductionRunway") if isinstance(packet.get("writingProductionRunway"), dict) else {}
    runway_rows = "".join(
        f"""
        <article class='runway-row'>
          <div class="queue-rank">{esc(row.get('rank'))}</div>
          <div>
            <span class="pill">{esc(row.get('lane'))}</span>
            <h3>{esc(row.get('title'))}</h3>
            <p>{esc(row.get('whyThisNow'))}</p>
            <p><strong>Open:</strong></p><pre>{esc(row.get('openCommand'))}</pre>
            <p><strong>Human move:</strong> {esc(row.get('humanMove'))}</p>
            <p><strong>Codex move:</strong> {esc(row.get('codexMove'))}</p>
            <p><strong>Canon boundary:</strong> {esc(row.get('canonicalBoundary'))}</p>
            <p><strong>Tower boundary:</strong> {esc(row.get('towerBoundary'))}</p>
          </div>
        </article>
        """
        for row in (runway.get("rows") if isinstance(runway.get("rows"), list) else [])[:8]
        if isinstance(row, dict)
    )
    work_cards = packet.get("writingWorkCards") if isinstance(packet.get("writingWorkCards"), dict) else {}
    work_cards_html = "".join(
        f"""
        <article class='work-card'>
          <div class="queue-rank">{esc(card.get('rank'))}</div>
          <div>
            <span class="pill">{esc(card.get('recommendedMove'))}</span>
            <h3>{esc(card.get('title'))}</h3>
            <p>{esc(card.get('whyThisNow'))}</p>
            <p><strong>Human question:</strong> {esc(card.get('humanQuestion'))}</p>
            <p><strong>Codex can do:</strong> {esc(card.get('codexCanDo'))}</p>
            <p><strong>Source trail:</strong> {esc(card.get('sourceTrail'))}</p>
            <pre>{esc(card.get('openCommand'))}</pre>
            <details><summary>Copy local work note</summary><pre>{esc(card.get('localWorkNoteYaml'))}</pre></details>
            <p class="muted">{esc(card.get('truth'))}</p>
          </div>
        </article>
        """
        for card in (work_cards.get("cards") if isinstance(work_cards.get("cards"), list) else [])[:8]
        if isinstance(card, dict)
    )
    work_cards_donts = "".join(f"<li>{esc(item)}</li>" for item in (work_cards.get("doNotDo") if isinstance(work_cards.get("doNotDo"), list) else []))
    first_command = f"open {shell_quote(str(path))}"
    first_session_note_path = str(packet.get("firstWritingSessionNotePath") or "")
    writing_runway_path = str(packet.get("writingRunwayPath") or "")
    writing_work_cards_path = str(packet.get("writingWorkCardsPath") or "")
    html_text = f"""<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Nest writing control room</title>
  <style>
    :root {{ color-scheme:dark; --bg:#10170f; --panel:#1c2a19; --card:#241f13; --ink:#fff2d8; --muted:#ccb995; --honey:#edc862; --moss:#9bd47e; --creek:#81d2de; --line:rgba(255,242,216,.16); }}
    * {{ box-sizing:border-box; }}
    body {{ margin:0; color:var(--ink); font-family:Avenir Next, Helvetica Neue, sans-serif; background:radial-gradient(circle at 10% 0%, rgba(155,212,126,.18), transparent 34rem), linear-gradient(180deg,#162313,#080c07); }}
    main {{ max-width:1320px; margin:0 auto; padding:38px clamp(18px,4vw,60px) 80px; }}
    header {{ border:1px solid var(--line); border-radius:32px; padding:30px; background:linear-gradient(135deg, rgba(28,42,25,.96), rgba(36,31,19,.92)); box-shadow:0 30px 90px rgba(0,0,0,.38); }}
    .eyebrow {{ color:var(--honey); text-transform:uppercase; letter-spacing:.24em; font-size:12px; font-weight:950; }}
    h1 {{ margin:10px 0; font-size:clamp(42px,7vw,86px); line-height:.9; max-width:980px; }}
    p {{ color:var(--muted); line-height:1.5; }}
    .metrics {{ display:flex; flex-wrap:wrap; gap:10px; margin-top:18px; }}
    .metrics span {{ border:1px solid var(--line); background:rgba(255,255,255,.055); border-radius:18px; padding:11px 13px; color:var(--muted); min-width:118px; }}
    .metrics strong {{ display:block; color:var(--moss); font-size:27px; }}
    .contract {{ margin-top:22px; border:1px solid var(--line); border-radius:24px; padding:18px; background:rgba(0,0,0,.18); }}
    .author-move {{ margin-top:22px; border:1px solid rgba(237,200,98,.32); border-radius:24px; padding:18px; background:rgba(237,200,98,.08); }}
    .review-target {{ margin-top:18px; border:1px solid rgba(129,210,222,.34); border-radius:22px; padding:16px; background:rgba(129,210,222,.07); }}
    .start-grid {{ display:grid; grid-template-columns:repeat(auto-fit,minmax(360px,1fr)); gap:14px; margin-top:16px; }}
    .start-card {{ display:grid; grid-template-columns:46px 1fr; gap:14px; align-items:start; border:1px solid rgba(237,200,98,.28); border-radius:22px; padding:16px; background:rgba(237,200,98,.07); }}
    .start-card.write-from-source {{ border-color:rgba(155,212,126,.32); background:rgba(155,212,126,.06); }}
    .runway-row {{ display:grid; grid-template-columns:46px 1fr; gap:14px; align-items:start; border:1px solid rgba(129,210,222,.28); border-radius:22px; padding:16px; background:rgba(129,210,222,.07); }}
    .work-card {{ display:grid; grid-template-columns:46px 1fr; gap:14px; align-items:start; border:1px solid rgba(155,212,126,.36); border-radius:22px; padding:16px; background:linear-gradient(180deg, rgba(155,212,126,.10), rgba(237,200,98,.055)); }}
    .queue-rank {{ display:grid; place-items:center; width:42px; height:42px; border-radius:16px; color:#10170f; background:var(--honey); font-weight:950; }}
    .pill {{ display:inline-block; border:1px solid var(--line); border-radius:999px; padding:5px 9px; color:var(--creek); background:rgba(129,210,222,.08); text-transform:uppercase; font-size:10px; letter-spacing:.13em; font-weight:900; }}
    .grid {{ display:grid; grid-template-columns:repeat(auto-fit,minmax(310px,1fr)); gap:16px; margin-top:22px; }}
    .mini-grid {{ display:grid; grid-template-columns:repeat(auto-fit,minmax(220px,1fr)); gap:12px; margin-top:12px; }}
    .mini-card {{ border:1px solid var(--line); border-radius:16px; padding:14px; background:rgba(0,0,0,.16); }}
    .loop-card {{ border:1px solid rgba(155,212,126,.28); border-radius:18px; padding:16px; background:rgba(155,212,126,.06); }}
    .loop-card b {{ display:inline-grid; place-items:center; width:30px; height:30px; border-radius:999px; color:var(--moss); background:rgba(155,212,126,.16); }}
    .card {{ border:1px solid var(--line); border-radius:22px; padding:17px; background:linear-gradient(180deg, rgba(36,31,19,.96), rgba(10,12,7,.92)); }}
    .card-top {{ display:flex; justify-content:space-between; gap:12px; align-items:start; }}
    .card-top span {{ color:var(--honey); font-size:11px; text-transform:uppercase; letter-spacing:.1em; font-weight:900; }}
    .card-top b {{ color:var(--ink); text-align:right; }}
    pre {{ white-space:pre-wrap; overflow-wrap:anywhere; color:var(--creek); background:rgba(0,0,0,.28); border-radius:14px; padding:12px; }}
    code {{ display:block; color:var(--creek); overflow-wrap:anywhere; margin-top:6px; }}
    summary {{ cursor:pointer; color:var(--moss); font-weight:900; }}
  </style>
</head>
<body>
<main>
  <header>
    <div class="eyebrow">Quipsly Nest</div>
    <h1>Write from sources. Keep the trail visible.</h1>
    <p>{esc(packet.get('plainEnglish'))}</p>
    <p>{esc(packet.get('safety'))}</p>
    <div class="metrics">{metrics}</div>
    <pre>{esc(first_command)}</pre>
    <pre>{esc('open ' + shell_quote(writing_work_cards_path) if writing_work_cards_path else '')}</pre>
    <pre>{esc('open ' + shell_quote(first_session_note_path) if first_session_note_path else '')}</pre>
    <pre>{esc('open ' + shell_quote(writing_runway_path) if writing_runway_path else '')}</pre>
  </header>
  <section class="author-move">
    <div class="eyebrow">Writing production runway</div>
    <h2>Start with one visible source-backed move.</h2>
    <p>{esc(runway.get('plainEnglish'))}</p>
    <p><b>First move:</b> {esc(runway.get('firstMove'))}</p>
    <pre>{esc(runway.get('recommendedOpenCommand'))}</pre>
    <div class="start-grid">{runway_rows or '<article class="mini-card"><h3>No runway rows yet</h3><p>Open the Author Desk or Daily Packet to create the next safe writing move.</p></article>'}</div>
  </section>
  <section class="author-move">
    <div class="eyebrow">Writing work cards</div>
    <h2>{esc(work_cards.get('headline') or 'One source-backed move at a time.')}</h2>
    <p>{esc(work_cards.get('plainEnglish') or 'Cards turn the writing runway into copyable local review/draft intent.')}</p>
    <pre>{esc('open ' + shell_quote(writing_work_cards_path) if writing_work_cards_path else '')}</pre>
    <ul>{work_cards_donts}</ul>
    <div class="start-grid">{work_cards_html or '<article class="mini-card"><h3>No work cards yet</h3><p>Regenerate the control room after creating runway rows.</p></article>'}</div>
  </section>
  <section class="author-move">
    <div class="eyebrow">Author next action</div>
    <h2>{esc(today.get('title') or 'Open the next source-backed writing task')}</h2>
    <p>{esc(today.get('why') or packet.get('nextSafestAction'))}</p>
    <p><b>Recommended move:</b> {esc(today.get('recommendedMove'))}</p>
    <p><b>Human question:</b> {esc(today.get('humanQuestion'))}</p>
    <p><b>Codex-safe move:</b> {esc(today.get('agentMove'))}</p>
    <pre>{esc(today.get('safeCommand'))}</pre>
    <h3>Safe writing outputs</h3>
    <div class="mini-grid">{safe_outputs}</div>
    <h3>Human review gate</h3>
    <ul>{review_gate}</ul>
    <h3>Start here queue</h3>
    <p>Open one row, make one visible decision, and stop before pretending the draft is canon. This is the anti-maze.</p>
    <div class="start-grid">{start_queue or '<article class="mini-card"><h3>No queue rows yet</h3><p>Open the review desk or daily packet to create the next safe writing move.</p></article>'}</div>
    <h3>Review triage</h3>
    <ul>{triage or '<li>No flagged drafts in the first triage slice.</li>'}</ul>
    {review_target}
    <h3>25-minute writing plan</h3>
    <p>{esc(writing_plan.get('plainEnglish') or '')}</p>
    <div class="mini-grid">{writing_plan_steps}</div>
    <ul>{writing_plan_donts}</ul>
    <h3>Writing loop</h3>
    <div class="mini-grid">{writing_loop}</div>
  </section>
  <section class="contract">
    <div class="eyebrow">Writing truth contract</div>
    <p><b>Source:</b> {esc(contract.get('source'))}</p>
    <p><b>Draft:</b> {esc(contract.get('draft'))}</p>
    <p><b>Human review:</b> {esc(contract.get('humanReview'))}</p>
    <p><b>Published:</b> {esc(contract.get('published'))}</p>
  </section>
  <section class="grid">{''.join(cards)}</section>
</main>
</body>
</html>
"""
    path.write_text(html_text, encoding="utf-8")


def update_pointer(nest_root: Path, out_dir: Path, packet: dict[str, Any], html_path: Path, json_path: Path, markdown_path: Path, csv_path: Path, writing_runway_path: Path, writer_return_handoff_path: Path, writing_work_cards_path: Path, publishable_draft_prep_cards_path: Path) -> None:
    pointer = {
        "schema": "quipsly.nest-writing.latest-control-room.v1",
        "updatedAt": iso_now(),
        "status": packet.get("status") or "unknown",
        "stage": packet.get("stage") or "unknown",
        "counts": packet.get("counts") or {},
        "htmlPath": str(html_path),
        "jsonPath": str(json_path),
        "markdownPath": str(markdown_path),
        "csvPath": str(csv_path),
        "sessionDir": str(out_dir),
        "humanAsk": packet.get("humanAsk") or "",
        "agentSafeParallelWork": packet.get("agentSafeParallelWork") or "",
        "authorActionBoard": packet.get("authorActionBoard") or {},
        "firstReviewTarget": packet.get("firstReviewTarget") or {},
        "firstReviewNoteTemplate": packet.get("firstReviewNoteTemplate") or {},
        "nextWritingCardPath": packet.get("nextWritingCardPath") or "",
        "firstWritingSessionNotePath": packet.get("firstWritingSessionNotePath") or "",
        "writingRunwayPath": str(writing_runway_path),
        "writerReturnHandoffPath": str(writer_return_handoff_path),
        "writingWorkCardsPath": str(writing_work_cards_path),
        "publishableDraftPrepCardsPath": str(publishable_draft_prep_cards_path),
        "writingProductionRunway": packet.get("writingProductionRunway") or {},
        "writingWorkCards": packet.get("writingWorkCards") or {},
        "publishableDraftPrepCards": packet.get("publishableDraftPrepCards") or {},
        "twentyFiveMinuteWritingPlan": packet.get("twentyFiveMinuteWritingPlan") or {},
        "writingStartQueue": packet.get("writingStartQueue") or [],
        "writingLoop": packet.get("writingLoop") or [],
        "firstSafeAction": {
            "label": "Open next Nest writing card" if packet.get("nextWritingCardPath") else "Open Nest writing work cards",
            "command": f"open {shell_quote(str(packet.get('nextWritingCardPath') or writing_work_cards_path))}",
            "path": str(packet.get("nextWritingCardPath") or writing_work_cards_path),
            "safety": "Opens local writing/research evidence only. Does not mutate sources, replace manuscripts, publish, upload, schedule, approve, overwrite versions, or create receipts.",
        },
        "nextSafestAction": packet.get("nextSafestAction") or "",
        "truth": packet.get("truth") or {},
    }
    write_json(nest_root / LATEST_NAME, pointer)


def main() -> int:
    parser = argparse.ArgumentParser(description="Build Nest writing control room.")
    parser.add_argument("nest_root", nargs="?", default=str(DEFAULT_NEST_ROOT))
    args = parser.parse_args()
    nest_root = Path(args.nest_root).expanduser()
    packet = build_packet(nest_root)
    out_dir = prepare_output_dir(nest_root)
    json_path = out_dir / "nest-writing-control-room.json"
    markdown_path = out_dir / "START-HERE-nest-writing-control-room.md"
    csv_path = out_dir / "nest-writing-control-room.csv"
    html_path = out_dir / "index.html"
    first_session_note_path = out_dir / "FIRST-WRITING-SESSION-NOTE.md"
    writing_runway_path = out_dir / "WRITING-RUNWAY.md"
    writer_return_handoff_path = out_dir / "WRITER-RETURN-HANDOFF.md"
    writing_work_cards_path = out_dir / "WRITING-WORK-CARDS.md"
    publishable_draft_prep_cards_path = out_dir / "PUBLISHABLE-DRAFT-PREP-CARDS.md"
    packet.update({
        "sessionDir": str(out_dir),
        "jsonPath": str(json_path),
        "markdownPath": str(markdown_path),
        "csvPath": str(csv_path),
        "htmlPath": str(html_path),
        "firstWritingSessionNotePath": str(first_session_note_path),
        "writingRunwayPath": str(writing_runway_path),
        "writerReturnHandoffPath": str(writer_return_handoff_path),
        "writingWorkCardsPath": str(writing_work_cards_path),
        "publishableDraftPrepCardsPath": str(publishable_draft_prep_cards_path),
        "nextWritingCardPath": packet.get("nextWritingCardPath") or "",
        "firstSafeAction": {
            "label": "Open next Nest writing card" if packet.get("nextWritingCardPath") else "Open Nest writing work cards",
            "command": f"open {shell_quote(str(packet.get('nextWritingCardPath') or writing_work_cards_path))}",
            "path": str(packet.get("nextWritingCardPath") or writing_work_cards_path),
            "safety": "Opens local writing/research evidence only. Does not mutate sources, replace manuscripts, publish, upload, schedule, approve, overwrite versions, or create receipts.",
        },
    })
    write_json(json_path, packet)
    write_markdown(markdown_path, packet)
    write_writing_runway_markdown(writing_runway_path, packet)
    write_writing_work_cards_markdown(writing_work_cards_path, packet)
    write_publishable_draft_prep_cards_markdown(publishable_draft_prep_cards_path, packet)
    write_first_writing_session_note(first_session_note_path, packet)
    write_writer_return_handoff(writer_return_handoff_path, packet)
    write_csv(csv_path, packet)
    write_html(html_path, packet)
    update_pointer(nest_root, out_dir, packet, html_path, json_path, markdown_path, csv_path, writing_runway_path, writer_return_handoff_path, writing_work_cards_path, publishable_draft_prep_cards_path)
    print(json.dumps({
        "status": packet["status"],
        "stage": packet["stage"],
        "counts": packet["counts"],
        "htmlPath": str(html_path),
        "jsonPath": str(json_path),
        "markdownPath": str(markdown_path),
        "csvPath": str(csv_path),
        "writerReturnHandoffPath": str(writer_return_handoff_path),
        "writingWorkCardsPath": str(writing_work_cards_path),
        "publishableDraftPrepCardsPath": str(publishable_draft_prep_cards_path),
        "nextWritingCardPath": packet.get("nextWritingCardPath") or "",
        "firstWritingSessionNotePath": str(first_session_note_path),
        "firstReviewTarget": packet.get("firstReviewTarget") or {},
        "firstSafeAction": packet.get("firstSafeAction") or {},
        "nextSafestAction": packet.get("nextSafestAction") or "",
        "humanAsk": packet.get("humanAsk") or "",
        "agentSafeParallelWork": packet.get("agentSafeParallelWork") or "",
        "truth": packet["truth"],
    }, indent=2, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
