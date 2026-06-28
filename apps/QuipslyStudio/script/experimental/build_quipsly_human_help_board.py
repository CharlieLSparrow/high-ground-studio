#!/usr/bin/env python3
"""Build a calm human-help board across the Quipsly production OS.

This is a read-only dispatcher. It turns the latest Production Runway and
validation artifacts into a practical list of things Charlie, Mako, Homer, or
Codex can actually help with. It never publishes, uploads, schedules, deletes,
mutates originals, or marks anything externally complete.
"""
from __future__ import annotations

import csv
import html
import json
import re
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

DEFAULT_OS_ROOT = Path("/Volumes/My Passport/Quipsly Media Workspace/QuipslyOS")
DEFAULT_OS_BOARD_POINTER = DEFAULT_OS_ROOT / "latest-quipsly-os-board.json"
DEFAULT_PRODUCTION_RUNWAY_POINTER = DEFAULT_OS_ROOT.parent / "ProductionRunway" / "latest-quipsly-production-runway.json"
DEFAULT_VALIDATION_POINTER = DEFAULT_OS_ROOT / "latest-quipsly-os-validation.json"
DEFAULT_RETURN_BRIEF_POINTER = DEFAULT_OS_ROOT / "latest-quipsly-return-brief.json"
DEFAULT_PHOTO_CONTACT_SHEET_POINTER = DEFAULT_OS_ROOT.parent / "PhotoGrove" / "latest-photo-grove-contact-sheet.json"
DEFAULT_PHOTO_CONTROL_ROOM_POINTER = DEFAULT_OS_ROOT.parent / "PhotoGrove" / "latest-photo-grove-control-room.json"
DEFAULT_PHOTO_CULL_REHEARSAL_POINTER = DEFAULT_OS_ROOT.parent / "PhotoGrove" / "latest-photo-grove-cull-rehearsal.json"
DEFAULT_PHOTO_FIRST_PASS_POINTER = DEFAULT_OS_ROOT.parent / "PhotoGrove" / "latest-photo-grove-first-pass-triage.json"
DEFAULT_STUDIO360_CONTROL_ROOM_POINTER = DEFAULT_OS_ROOT.parent / "Studio360" / "latest-360-proof-control-room.json"
DEFAULT_STUDIO_TOP_REVIEW_COMPANION_POINTER = Path("/Volumes/My Passport/Episode_and_Shorts_Test/review-board/top-review-companions/latest-studio-top-review-companion.json")
DEFAULT_STUDIO_SYNC_CONTROL_ROOM_POINTER = Path("/Volumes/My Passport/Episode_and_Shorts_Test/review-board/latest-sync-control-room.json")
DEFAULT_STUDIO_SYNC_DECISION_REHEARSAL_POINTER = Path("/Volumes/My Passport/Episode_and_Shorts_Test/review-board/latest-sync-decision-rehearsal.json")
DEFAULT_TOWER_PUBLICATION_CONTROL_ROOM_POINTER = Path("/Volumes/My Passport/Episode_and_Shorts_Test/tower-publication-control-room/latest-tower-publication-control-room.json")
DEFAULT_NEST_WRITING_CONTROL_ROOM_POINTER = DEFAULT_OS_ROOT.parent / "NestWriting" / "latest-nest-writing-control-room.json"
DEFAULT_OUTPUT_ROOT = DEFAULT_OS_ROOT / "HumanHelpBoards"
LATEST_POINTER = DEFAULT_OS_ROOT / "latest-quipsly-human-help-board.json"
SCHEMA = "quipsly.os.human-help-board.v1"
HUMAN_ASK = (
    "Use this board to see what needs Charlie, Mako, Homer, or Codex attention. "
    "Start with the Studio gate classification deck: Episode 1 duration candidate first, "
    "then Episode 4 sync investigation, then work owner packets without external actions."
)
AGENT_SAFE_PARALLEL_WORK = (
    "Codex can refine blocker descriptions, create owner packets, summarize evidence, and prepare local review steps. "
    "It must not publish, upload, schedule, delete, mutate originals, overwrite versions, or capture receipts."
)


LANE_ALIASES = {
    "Studio360": "360 workflow",
    "Tower publishing": "Tower publishing/social",
}


def canonical_lane(value: Any) -> str:
    raw = str(value or "Unknown")
    return LANE_ALIASES.get(raw, raw)


LANE_KINDS = {
    "Studio podcast/video": "podcast-video",
    "Tower publishing/social": "tower-publishing",
    "Nest writing/research": "writing-research",
    "Photo Grove": "photo-culling",
    "360 workflow": "studio360",
    "Quipsly OS": "operating-system",
}


SEVERITY_RANK = {
    "blocker": 0,
    "sync-review": 1,
    "approval-needed": 2,
    "human-review": 3,
    "missing-media": 4,
    "operator-help": 5,
    "agent-safe": 6,
    "ready": 7,
}


def iso_now() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def stamp() -> str:
    return datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S-%f-human-help-board")


def load_json(path: Path, *, _depth: int = 0) -> dict[str, Any]:
    if not path.exists():
        return {}
    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
        if not isinstance(payload, dict):
            return {}
        if _depth == 0 and payload.get("jsonPath"):
            target = Path(str(payload.get("jsonPath") or ""))
            if target.exists() and target != path:
                resolved = load_json(target, _depth=1)
                if resolved:
                    return {**payload, **resolved}
        return payload
    except Exception:
        return {}


def write_json(path: Path, payload: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, indent=2, sort_keys=True) + "\n", encoding="utf-8")


def shell_quote(value: str) -> str:
    return "'" + value.replace("'", "'\\''") + "'"


def esc(value: Any) -> str:
    return html.escape(str(value or ""))


def file_uri(path: str) -> str:
    try:
        return Path(path).resolve().as_uri()
    except Exception:
        return ""


def safe_int(value: Any) -> int:
    try:
        return int(value or 0)
    except Exception:
        return 0


def safe_counts(payload: dict[str, Any]) -> dict[str, Any]:
    counts = payload.get("counts")
    return counts if isinstance(counts, dict) else {}


def first_action_from_card(card: dict[str, Any]) -> dict[str, str]:
    first = card.get("firstSafeAction") if isinstance(card.get("firstSafeAction"), dict) else {}
    path = str(first.get("path") or card.get("htmlPath") or card.get("markdownPath") or card.get("jsonPath") or "")
    command = str(first.get("command") or (f"open {shell_quote(path)}" if path else ""))
    return {
        "label": str(first.get("label") or f"Open {card.get('title') or 'local evidence'}"),
        "command": command,
        "path": path,
        "safety": str(first.get("safety") or "Opens local evidence only. No publish/upload/delete/schedule/account mutation."),
    }


def classify_card(card: dict[str, Any]) -> tuple[str, str, list[str]]:
    lane = canonical_lane(card.get("lane"))
    title = str(card.get("title") or "Untitled")
    priority = str(card.get("priority") or "review")
    status = str(card.get("status") or "")
    counts = safe_counts(card)
    notes = [str(note) for note in card.get("notes") or [] if str(note).strip()]
    title_lower = title.lower()
    status_lower = status.lower()

    if safe_int(counts.get("failures")) > 0:
        return "blocker", "Validation is failing and should be addressed before trusting downstream artifacts.", notes
    if "gate decision receipt" in title_lower or "gate receipt" in title_lower:
        return "human-review", "Studio gate options are ready to classify after evidence review. Recording one creates only local review metadata, not package promotion or publication truth.", notes
    if "sync" in title_lower or "duration" in title_lower:
        return "sync-review", "Timing/sync evidence needs human or focused agent review before treating this package as clean.", notes
    if safe_int(counts.get("missingFiles")) > 0 or safe_int(counts.get("outputsMissing")) > 0:
        return "missing-media", "Some expected local evidence is missing. Do not force approval; find or route around the missing artifact.", notes
    if "publisher" in title_lower or "manual publishing" in title_lower or "promotion" in title_lower:
        receipts = safe_int(counts.get("capturedReceipts"))
        ready = safe_int(counts.get("readyForApproval"))
        if receipts == 0 or ready == 0:
            return "approval-needed", "Publishing packets exist, but external publishing still needs explicit human approval and real receipts.", notes
    if lane == "Photo Grove":
        return "human-review", "Photo candidates are ready for culling/review. Decisions should start dry-run unless Charlie approves real cull ledgers.", notes
    if lane == "360 workflow" and safe_int(counts.get("repairTickets")) > 0:
        return "operator-help", "Some 360 assets need source/proxy/companion attention before the lane is fully clean.", notes
    if lane == "Nest writing/research":
        return "human-review", "Writing/research packets are ready for author review or safe drafting work; do not replace source manuscripts.", notes
    if lane == "Quipsly OS" and "validation" in title_lower and safe_int(counts.get("warnings")) == 0:
        return "ready", "The OS validation report is currently clean; keep it as confidence evidence, not a production receipt.", notes
    if priority == "attention" or "attention" in status_lower:
        return "operator-help", "This lane is asking for attention. Open the local evidence and take the smallest reversible next step.", notes
    return "agent-safe", "Useful local evidence exists. Codex can keep improving clarity, packets, validation, or review prep without external side effects.", notes


def suggested_owner(lane: str, title: str, severity: str) -> str:
    title_lower = title.lower()
    if severity in {"blocker", "missing-media"}:
        return "Charlie or Codex"
    if "sync" in title_lower or "episode" in title_lower or lane == "Studio podcast/video":
        return "Mako or Charlie"
    if lane == "Tower publishing/social":
        return "Charlie"
    if lane == "Nest writing/research":
        return "Charlie or Homer"
    if lane == "Photo Grove":
        return "Charlie"
    if lane == "360 workflow":
        if "proof review" in title_lower:
            return "Mako or Charlie"
        if "proof next" in title_lower or "renderer" in title_lower:
            return "Codex first, Charlie if source media looks wrong"
        return "Codex first, Charlie if source media is missing"
    if lane == "Quipsly OS":
        return "Codex"
    return "Charlie or Codex"


def human_ask(lane: str, title: str, severity: str) -> str:
    title_lower = title.lower()
    if severity == "sync-review":
        return "Review the timing evidence and decide whether this needs a versioned rebuild, a hold, or a human-approved workaround."
    if severity == "approval-needed":
        return "Approve, hold, or revise the prepared local packet before any external publishing happens."
    if severity == "human-review":
        if lane == "Photo Grove":
            return "Cull a small batch: keep, reject, favorite, or send to review without touching originals."
        if lane == "Nest writing/research":
            return "Read the draft/source packet and decide what should become a real writing session next."
        return "Inspect the evidence and leave a clear decision or note."
    if severity == "operator-help":
        if lane == "360 workflow":
            if "proof next" in title_lower:
                return "Choose one small proof render candidate, run only the proof command when appropriate, then inspect the proof before any full render."
            if "reframe" in title_lower:
                return "Review repair/proxy blockers before trusting the 360 reframe/export lane."
            if "source" in title_lower:
                return "Check whether blocked 360 sources need recopy, redownload, companion files, or parking."
            return "Use the local 360 evidence to resolve the smallest source/proxy/render blocker before continuing."
        return "Open the evidence and either solve the small missing context or leave a precise note for Codex."
    if lane == "360 workflow" and "proof review" in title_lower:
        return "Open proof outputs and inspect framing/audio before promoting any renderer path toward full renders."
    if severity == "ready":
        return "Use this as confidence evidence; no human action required unless something feels wrong."
    if severity == "blocker":
        return "Fix or route around this before trusting downstream output."
    return "Optional: review if this lane matters today; otherwise Codex can keep improving safe local prep."


def agent_parallel_action(lane: str, title: str, severity: str) -> str:
    title_lower = title.lower()
    if lane == "360 workflow":
        if "proof next" in title_lower:
            return "Codex can keep preparing proof queues and, when explicitly appropriate, run a single versioned proof render without mutating originals."
        if "proof review" in title_lower:
            return "Codex can index proof outputs and prepare review packets, but visual approval still needs a human or explicit reviewed evidence."
        if "reframe" in title_lower or "source" in title_lower:
            return "Codex can refine repair tickets, proxy status, and source routing while waiting on missing-media decisions."
    if severity in {"approval-needed", "human-review"}:
        return "Codex can improve packets, metadata, validation, and review UI while waiting for the human decision."
    if severity == "sync-review":
        return "Codex can prepare comparison evidence and non-destructive rebuild candidates, but should not pretend sync is approved."
    if severity == "missing-media":
        return "Codex can create missing-media tasks and continue another lane without forcing bad evidence."
    if severity == "ready":
        return "Codex can keep this as supporting evidence and move to a higher-friction lane."
    return "Codex can take the smallest reversible local action and regenerate the board."


def item_from_card(card: dict[str, Any], index: int) -> dict[str, Any]:
    lane = canonical_lane(card.get("lane"))
    title = str(card.get("title") or "Untitled")
    severity, explanation, notes = classify_card(card)
    action = first_action_from_card(card)
    next_safest = str(card.get("nextSafestAction") or "Open the local evidence, then choose the smallest reversible next action.")
    counts = safe_counts(card)
    return {
        "id": f"help-{index:03d}",
        "lane": lane,
        "laneKind": LANE_KINDS.get(lane, "other"),
        "title": title,
        "severity": severity,
        "suggestedOwner": suggested_owner(lane, title, severity),
        "status": str(card.get("status") or "ready"),
        "plainEnglish": explanation,
        "humanAsk": human_ask(lane, title, severity),
        "agentCanContinueWith": agent_parallel_action(lane, title, severity),
        "counts": counts,
        "notes": notes,
        "primaryPath": str(card.get("primaryPath") or action.get("path") or card.get("htmlPath") or card.get("markdownPath") or card.get("jsonPath") or ""),
        "primaryCommand": str(card.get("primaryCommand") or action.get("command") or ""),
        "firstSafeAction": action,
        "nextAction": next_safest,
        "nextSafestAction": next_safest,
        "source": {
            "priority": card.get("priority") or "",
            "htmlPath": card.get("htmlPath") or "",
            "jsonPath": card.get("jsonPath") or "",
            "markdownPath": card.get("markdownPath") or "",
            "worksheetPath": card.get("worksheetPath") or "",
        },
        "truth": str(card.get("truth") or "Local evidence only. Not external publication, approval, upload, schedule, or receipt truth."),
        "safety": "Local review/help routing only. No original files are mutated and no external publication/account action is performed.",
    }


def collect_validation_items(validation: dict[str, Any], start_index: int) -> list[dict[str, Any]]:
    checks = validation.get("checks") if isinstance(validation.get("checks"), list) else []
    items: list[dict[str, Any]] = []
    for check in checks:
        if not isinstance(check, dict) or check.get("status") == "pass":
            continue
        severity = "blocker" if check.get("status") == "fail" else "operator-help"
        items.append({
            "id": f"help-{start_index + len(items):03d}",
            "lane": str(check.get("lane") or "Quipsly OS"),
            "laneKind": "operating-system",
            "title": str(check.get("message") or check.get("id") or "Validation item"),
            "severity": severity,
            "suggestedOwner": "Codex",
            "status": str(check.get("status") or "warn"),
            "plainEnglish": "Validation found a system-level issue that should be reviewed before treating the runway as clean.",
            "humanAsk": "No human review needed unless Codex cannot resolve the validation issue safely.",
            "agentCanContinueWith": "Codex should fix or route around the validation issue, then regenerate the board.",
            "counts": {},
            "notes": [str(check.get("id") or ""), str(check.get("evidence") or "")],
            "firstSafeAction": first_action_from_card(validation),
            "nextSafestAction": "Open the validation report and fix or route around this specific check.",
            "source": {"jsonPath": validation.get("jsonPath") or ""},
            "safety": "Local validation evidence only. No external action.",
        })
    return items


def severity_from_matrix_readiness(readiness: str) -> str:
    if readiness in {"review-needed", "blocked-by-studio-review", "proof-review-needed", "culling-needed"}:
        return "human-review"
    if readiness in {"approval-needed"}:
        return "approval-needed"
    if readiness in {"render-plan-ready", "proof-prep-ready", "drafting-ready"}:
        return "agent-safe"
    return "operator-help"


def matrix_owner(lane: str, readiness: str) -> str:
    if "Studio podcast" in lane:
        return "Mako or Charlie"
    if "Nest writing" in lane:
        return "Charlie or Homer"
    if "Photo Grove" in lane:
        return "Charlie"
    if "Studio360" in lane or "360 workflow" in lane:
        return "Mako or Charlie"
    if "Tower" in lane:
        return "Charlie"
    if readiness == "agent-safe":
        return "Codex"
    return "Charlie or Codex"


def matrix_human_ask(row: dict[str, Any]) -> str:
    lane = str(row.get("lane") or "")
    readiness = str(row.get("readiness") or "")
    if readiness == "review-needed":
        return "Open the Studio review worksheet and classify the current Episode 1/Episode 4 evidence before publishing work moves forward."
    if readiness == "blocked-by-studio-review":
        return "Do not approve platform packets yet; clear the Studio review gate first or leave Tower blocked with a precise note."
    if readiness == "drafting-ready":
        return "Open the writing sprint and either review an existing source-backed draft or choose one writing move for the book/articles."
    if readiness == "culling-needed":
        return "Open the culling sprint and compare one photo group before recording any metadata-only keep/review/reject intent."
    if readiness == "proof-review-needed":
        return "Open the 360 proof sprint and inspect existing proof clips before any full-render planning."
    if "Tower" in lane:
        return "Prepare packets and receipt slots only; external posting still requires explicit Charlie approval."
    return "Open the companion evidence and choose the smallest reversible local action."


def matrix_agent_action(row: dict[str, Any]) -> str:
    readiness = str(row.get("readiness") or "")
    if readiness == "review-needed":
        return "Codex can prepare clearer comparison evidence and rebuild-plan previews, but cannot approve sync or duration candidates."
    if readiness == "blocked-by-studio-review":
        return "Codex can keep platform packets and receipt slots organized while preserving the Studio gate."
    if readiness == "drafting-ready":
        return "Codex can draft, outline, compare sources, and prepare revision briefs without replacing canonical manuscript text."
    if readiness == "culling-needed":
        return "Codex can prepare contact sheets, dry-run metadata commands, and group comparison notes without touching originals."
    if readiness == "proof-review-needed":
        return "Codex can index proofs, tighten repair tasks, and prepare one-proof plans without running full renders."
    return "Codex can improve packets, validation, and local evidence without external side effects."


def collect_matrix_items(return_brief: dict[str, Any], start_index: int) -> list[dict[str, Any]]:
    matrix = return_brief.get("productionReadinessMatrix") if isinstance(return_brief.get("productionReadinessMatrix"), list) else []
    items: list[dict[str, Any]] = []
    for row in matrix:
        if not isinstance(row, dict):
            continue
        readiness = str(row.get("readiness") or "operator-help")
        lane = canonical_lane(row.get("lane") or "Unknown")
        first_action = {
            "label": f"Open {row.get('label') or lane}",
            "command": str(row.get("openCommand") or ""),
            "path": str(row.get("worksheetPath") or row.get("htmlPath") or ""),
            "safety": "Opens local lane companion evidence only. It does not mutate sources, publish, upload, schedule, approve, or create receipts.",
        }
        details = [
            f"Readiness: {readiness}",
            f"Counts: {row.get('countSummary') or ''}",
            f"Gate: {row.get('gateSummary') or ''}",
        ]
        if row.get("worksheetPath"):
            details.append(f"Worksheet: {row.get('worksheetPath')}")
        item_id = str(row.get("id") or f"{start_index + len(items):03d}")
        items.append({
            "id": f"matrix-{item_id}",
            "lane": lane,
            "laneKind": LANE_KINDS.get(lane, str(row.get("id") or "matrix")),
            "title": f"{row.get('label') or lane}: {readiness}",
            "severity": severity_from_matrix_readiness(readiness),
            "suggestedOwner": matrix_owner(lane, readiness),
            "status": str(row.get("status") or "ready"),
            "plainEnglish": str(row.get("gateSummary") or row.get("countSummary") or ""),
            "humanAsk": matrix_human_ask(row),
            "agentCanContinueWith": matrix_agent_action(row),
            "counts": {},
            "notes": [str(row.get("countSummary") or "")],
            "handoffDetails": details,
            "primaryPath": first_action["path"],
            "primaryCommand": first_action["command"],
            "firstSafeAction": first_action,
            "nextAction": str(row.get("nextSafestAction") or row.get("gateSummary") or ""),
            "nextSafestAction": str(row.get("nextSafestAction") or row.get("gateSummary") or ""),
            "source": {
                "htmlPath": row.get("htmlPath") or "",
                "jsonPath": row.get("jsonPath") or "",
                "markdownPath": row.get("markdownPath") or "",
                "worksheetPath": row.get("worksheetPath") or "",
                "returnBriefJson": return_brief.get("jsonPath") or "",
            },
            "truth": str(row.get("truth") or "Production matrix item only. Local evidence, not external truth."),
            "safety": "Local production-matrix routing only. No original files are mutated and no external publication/account action is performed.",
        })
    return items


def collect_photo_contact_sheet_item(start_index: int) -> list[dict[str, Any]]:
    pointer = load_json(DEFAULT_PHOTO_CONTACT_SHEET_POINTER)
    if not pointer or not pointer.get("htmlPath"):
        return []
    counts = pointer.get("counts") if isinstance(pointer.get("counts"), dict) else {}
    first = pointer.get("firstSafeAction") if isinstance(pointer.get("firstSafeAction"), dict) else {}
    first_action = {
        "label": str(first.get("label") or "Open Photo Grove contact sheet"),
        "command": str(first.get("command") or f"open {shell_quote(str(pointer.get('htmlPath') or ''))}"),
        "path": str(first.get("path") or pointer.get("htmlPath") or ""),
        "safety": str(first.get("safety") or "Opens local contact sheet evidence only. No originals, metadata, exports, uploads, or delivery state are changed."),
    }
    return [{
        "id": f"photo-contact-{start_index:03d}",
        "lane": "Photo Grove",
        "laneKind": "photo-culling",
        "title": "Photo Grove contact sheet: grouped visual cull review",
        "severity": "human-review",
        "suggestedOwner": "Charlie",
        "status": str(pointer.get("status") or "photo-contact-sheet-ready"),
        "plainEnglish": (
            f"Open the contact sheet to compare {counts.get('contactSheetGroups', 0)} grouped sequences "
            f"with {counts.get('contactSheetSamples', 0)} thumbnail/source samples before making metadata decisions."
        ),
        "humanAsk": "Compare one contact-sheet group visually, reveal source when thumbnails look suspect, then choose a metadata-only review/keep/favorite/reject intent.",
        "agentCanContinueWith": "Codex can improve grouping, contact sheets, comparison notes, path checks, and dry-run commands without executing live metadata decisions.",
        "counts": counts,
        "notes": [
            f"Total photos: {counts.get('totalPhotos', 0)}",
            f"Pending: {counts.get('pending', 0)}",
            f"Review: {counts.get('review', 0)}",
            f"Selected for client proof: {counts.get('selectedForClientProof', 0)}",
        ],
        "handoffDetails": [
            f"Contact sheet groups: {counts.get('contactSheetGroups', 0)}",
            f"Contact sheet samples: {counts.get('contactSheetSamples', 0)}",
            f"Mode counts: {counts.get('modeCounts', {})}",
            f"Priority counts: {counts.get('priorityCounts', {})}",
        ],
        "primaryPath": str(pointer.get("htmlPath") or ""),
        "primaryCommand": first_action["command"],
        "firstSafeAction": first_action,
        "nextAction": str(pointer.get("nextSafestAction") or "Open the contact sheet and compare one group before metadata decisions."),
        "nextSafestAction": str(pointer.get("nextSafestAction") or "Open the contact sheet and compare one group before metadata decisions."),
        "source": {
            "htmlPath": pointer.get("htmlPath") or "",
            "jsonPath": pointer.get("jsonPath") or "",
            "markdownPath": pointer.get("markdownPath") or "",
        },
        "truth": "Photo Grove contact sheet routing only. Local evidence, not cull approval, client delivery, export, upload, or publication truth.",
        "safety": "Local contact-sheet routing only. No original files are mutated and no external publication/account action is performed.",
    }]


def collect_photo_control_room_item(start_index: int) -> list[dict[str, Any]]:
    pointer = load_json(DEFAULT_PHOTO_CONTROL_ROOM_POINTER)
    if not pointer or not pointer.get("htmlPath"):
        return []
    counts = pointer.get("counts") if isinstance(pointer.get("counts"), dict) else {}
    first = pointer.get("firstSafeAction") if isinstance(pointer.get("firstSafeAction"), dict) else {}
    first_action = {
        "label": str(first.get("label") or "Open Photo Grove control room"),
        "command": str(first.get("command") or f"open {shell_quote(str(pointer.get('htmlPath') or ''))}"),
        "path": str(first.get("path") or pointer.get("htmlPath") or ""),
        "safety": str(first.get("safety") or "Opens local Photo Grove culling/proof evidence only. No originals, metadata, exports, uploads, or delivery state are changed."),
    }
    return [{
        "id": f"photo-control-{start_index:03d}",
        "lane": "Photo Grove",
        "laneKind": "photo-culling",
        "title": "Photo Grove control room: cull calmly, preserve everything",
        "severity": "human-review",
        "suggestedOwner": "Charlie",
        "status": str(pointer.get("status") or "photo-grove-control-room-needs-cull"),
        "plainEnglish": (
            f"Photo Grove has {counts.get('sourcePhotos', 0)} source photo(s), "
            f"{counts.get('pending', 0)} pending, {counts.get('firstKeeperCandidates', 0)} first-keeper candidate(s), "
            f"and {counts.get('selectedForClientProof', 0)} selected proof item(s). Open the control room before making cull decisions."
        ),
        "humanAsk": "Open the Photo Grove control room, compare one contact-sheet group, and only then record metadata-only keep/review/reject intent.",
        "agentCanContinueWith": "Codex can improve grouping, candidate summaries, path checks, command sheets, and proof packets without executing cull decisions.",
        "counts": counts,
        "notes": [
            f"Source photos: {counts.get('sourcePhotos', 0)}",
            f"Pending: {counts.get('pending', 0)}",
            f"First keeper candidates: {counts.get('firstKeeperCandidates', 0)}",
            f"Selected for proof: {counts.get('selectedForClientProof', 0)}",
        ],
        "handoffDetails": [
            f"Contact sheet groups: {counts.get('contactSheetGroups', 0)}",
            f"Contact sheet samples: {counts.get('contactSheetSamples', 0)}",
            f"Command rows: {counts.get('commandRows', 0)}",
            f"Decision events: {counts.get('decisionEvents', 0)}",
        ],
        "primaryPath": str(pointer.get("htmlPath") or ""),
        "primaryCommand": first_action["command"],
        "firstSafeAction": first_action,
        "nextAction": str(pointer.get("nextSafestAction") or "Open the Photo Grove control room and compare one grouped contact-sheet sequence."),
        "nextSafestAction": str(pointer.get("nextSafestAction") or "Open the Photo Grove control room and compare one grouped contact-sheet sequence."),
        "source": {
            "photoControlRoomPointer": str(DEFAULT_PHOTO_CONTROL_ROOM_POINTER),
            "jsonPath": pointer.get("jsonPath") or "",
            "htmlPath": pointer.get("htmlPath") or "",
        },
        "truth": str(pointer.get("truth") or "Photo Grove control-room routing only. Local evidence, not cull approval, client delivery, export, upload, or publication truth."),
        "safety": "Local photo review only. No originals, metadata, exports, uploads, publication, account, or client delivery state are changed.",
    }]


def collect_photo_cull_rehearsal_item(start_index: int) -> list[dict[str, Any]]:
    pointer = load_json(DEFAULT_PHOTO_CULL_REHEARSAL_POINTER)
    if not pointer or not pointer.get("htmlPath"):
        return []
    counts = pointer.get("counts") if isinstance(pointer.get("counts"), dict) else {}
    first = pointer.get("firstSafeAction") if isinstance(pointer.get("firstSafeAction"), dict) else {}
    first_action = {
        "label": str(first.get("label") or "Open Photo Grove cull rehearsal"),
        "command": str(first.get("command") or f"open {shell_quote(str(pointer.get('htmlPath') or ''))}"),
        "path": str(first.get("path") or pointer.get("htmlPath") or ""),
        "safety": str(first.get("safety") or "Opens local dry-run cull evidence only. No originals, metadata, exports, uploads, or delivery state are changed."),
    }
    preview_errors = int(counts.get("dryRunPreviewErrors") or 0)
    return [{
        "id": f"photo-cull-rehearsal-{start_index:03d}",
        "lane": "Photo Grove",
        "laneKind": "photo-culling",
        "title": "Photo Grove cull rehearsal: practice before writing metadata",
        "severity": "human-review" if preview_errors == 0 else "operator-help",
        "suggestedOwner": "Charlie",
        "status": str(pointer.get("status") or "photo-cull-rehearsal-needs-attention"),
        "plainEnglish": (
            f"Preview {counts.get('dryRunPreviews', 0)} dry-run keep/review/favorite/reject outcomes "
            f"across {counts.get('rehearsalRows', 0)} photo(s) before any cull metadata is written."
        ),
        "humanAsk": "Open the rehearsal, compare thumbnails/source files, and use it as a practice lane before executing any metadata-only cull decision.",
        "agentCanContinueWith": "Codex can regenerate rehearsal rows, add comparison notes, and improve dry-run coverage without writing the review ledger or touching originals.",
        "counts": counts,
        "notes": [
            f"Dry-run previews: {counts.get('dryRunPreviews', 0)}",
            f"Preview errors: {counts.get('dryRunPreviewErrors', 0)}",
            f"Originals mutated: {counts.get('originalsMutated', False)}",
            f"Metadata changed: {counts.get('metadataChanged', False)}",
        ],
        "handoffDetails": [
            f"Rehearsal rows: {counts.get('rehearsalRows', 0)}",
            f"Source rows: {counts.get('sourceRows', 0)}",
            f"Decision receipts created: {counts.get('decisionReceiptsCreated', False)}",
        ],
        "primaryPath": str(pointer.get("htmlPath") or ""),
        "primaryCommand": first_action["command"],
        "firstSafeAction": first_action,
        "nextAction": str(pointer.get("nextSafestAction") or "Open the cull rehearsal and inspect one row before writing cull metadata."),
        "nextSafestAction": str(pointer.get("nextSafestAction") or "Open the cull rehearsal and inspect one row before writing cull metadata."),
        "source": {
            "photoCullRehearsalPointer": str(DEFAULT_PHOTO_CULL_REHEARSAL_POINTER),
            "jsonPath": pointer.get("jsonPath") or "",
            "htmlPath": pointer.get("htmlPath") or "",
        },
        "truth": str(pointer.get("truthDescription") or "Photo Grove cull rehearsal routing only. Local dry-run evidence, not cull approval, client delivery, export, upload, or publication truth."),
        "safety": "Local dry-run rehearsal only. No originals, metadata, exports, uploads, publication, account, or client delivery state are changed.",
    }]


def collect_photo_first_pass_item(start_index: int) -> list[dict[str, Any]]:
    pointer = load_json(DEFAULT_PHOTO_FIRST_PASS_POINTER)
    if not pointer or not pointer.get("htmlPath"):
        return []
    counts = pointer.get("counts") if isinstance(pointer.get("counts"), dict) else {}
    first = pointer.get("firstSafeAction") if isinstance(pointer.get("firstSafeAction"), dict) else {}
    first_action = {
        "label": str(first.get("label") or "Open Photo Grove first-pass triage"),
        "command": str(first.get("command") or f"open {shell_quote(str(pointer.get('htmlPath') or ''))}"),
        "path": str(first.get("path") or pointer.get("htmlPath") or ""),
        "safety": str(first.get("safety") or "Opens local first-pass culling evidence only. No originals, metadata, exports, uploads, or delivery state are changed."),
    }
    return [{
        "id": f"photo-first-pass-{start_index:03d}",
        "lane": "Photo Grove",
        "laneKind": "photo-culling",
        "title": "Photo Grove first-pass triage: start small",
        "severity": "human-review",
        "suggestedOwner": "Charlie",
        "status": str(pointer.get("status") or "photo-grove-first-pass-triage-ready"),
        "plainEnglish": (
            f"Start culling with {counts.get('groups', 0)} small group(s), "
            f"{counts.get('samples', 0)} sample frame(s), and {counts.get('dryRunDirections', 0)} dry-run direction(s), "
            "instead of confronting the full photo set at once."
        ),
        "humanAsk": "Open first-pass triage, compare one small group, and only rehearse a metadata-only keep/review/reject/favorite direction if the intent is obvious.",
        "agentCanContinueWith": "Codex can improve grouping, prompts, sample visibility, and dry-run cull packets without executing metadata decisions.",
        "counts": counts,
        "notes": [
            f"Groups: {counts.get('groups', 0)}",
            f"Samples: {counts.get('samples', 0)}",
            f"Dry-run directions: {counts.get('dryRunDirections', 0)}",
            f"Originals mutated: {counts.get('originalsMutated', False)}",
            f"Metadata changed: {counts.get('metadataChanged', False)}",
        ],
        "handoffDetails": [
            f"Source command rows: {counts.get('sourceCommandRows', 0)}",
            f"Client delivery created: {counts.get('clientDeliveryCreated', False)}",
            f"External publishing: {counts.get('externalPublishing', False)}",
        ],
        "primaryPath": str(pointer.get("htmlPath") or ""),
        "primaryCommand": first_action["command"],
        "firstSafeAction": first_action,
        "nextAction": str(pointer.get("nextSafestAction") or "Open first-pass triage and compare one small group before metadata decisions."),
        "nextSafestAction": str(pointer.get("nextSafestAction") or "Open first-pass triage and compare one small group before metadata decisions."),
        "source": {
            "photoFirstPassPointer": str(DEFAULT_PHOTO_FIRST_PASS_POINTER),
            "jsonPath": pointer.get("jsonPath") or "",
            "htmlPath": pointer.get("htmlPath") or "",
        },
        "truth": str(pointer.get("truth") or "Photo Grove first-pass routing only. Local evidence, not cull approval, client delivery, export, upload, or publication truth."),
        "safety": "Local first-pass review only. No originals, metadata, exports, uploads, publication, account, or client delivery state are changed.",
    }]




def collect_studio_gate_classification_items(start_index: int) -> list[dict[str, Any]]:
    pointer = load_json(DEFAULT_STUDIO_TOP_REVIEW_COMPANION_POINTER)
    gates = pointer.get("gateClassificationDeck") if isinstance(pointer.get("gateClassificationDeck"), list) else []
    if not pointer or not gates:
        return []
    html_path = str(pointer.get("htmlPath") or "")
    worksheet_path = str(pointer.get("worksheetPath") or pointer.get("markdownPath") or "")
    counts = pointer.get("counts") if isinstance(pointer.get("counts"), dict) else {}
    items: list[dict[str, Any]] = []
    for gate in gates:
        if not isinstance(gate, dict):
            continue
        options = [option for option in gate.get("decisionOptions") or [] if isinstance(option, dict)]
        option_notes = [
            f"Option {idx}: {option.get('label') or option.get('id') or 'decision'} - {option.get('means') or option.get('plainEnglish') or option.get('codexMayDo') or 'review evidence first'}"
            for idx, option in enumerate(options, start=1)
        ]
        state = str(gate.get("state") or "queued")
        item_id = str(gate.get("id") or f"studio-gate-{start_index + len(items):03d}")
        first_action = {
            "label": "Open Studio gate classification deck",
            "command": f"open {shell_quote(html_path)}" if html_path else "",
            "path": html_path,
            "safety": "Opens local Studio gate evidence only. No promotion, repair, export, publish, upload, schedule, overwrite, receipt, or source mutation occurs.",
        }
        evidence_command = str(gate.get("openEvidenceCommand") or gate.get("firstEvidenceCommand") or "")
        dry_run_command = str(gate.get("dryRunDecisionCommand") or "")
        items.append({
            "id": f"studio-gate-classification-{start_index + len(items):03d}",
            "lane": "Studio podcast/video",
            "laneKind": "podcast-video",
            "title": f"Studio gate: {gate.get('title') or 'classify review evidence'}",
            "severity": "sync-review" if state == "active" else "human-review",
            "suggestedOwner": str(gate.get("owner") or "Mako or Charlie"),
            "status": f"gate-classification-{state}",
            "plainEnglish": str(gate.get("plainEnglish") or "Choose the local evidence classification before Tower treats this package as ready."),
            "humanAsk": str(gate.get("humanQuestion") or "Classify this local Studio gate before any package promotion or Tower approval."),
            "agentCanContinueWith": str(gate.get("agentSafeParallelWork") or pointer.get("agentSafeParallelWork") or "Codex can prepare evidence and dry-run packets while waiting for the human classification."),
            "counts": {
                "gateClassificationRows": counts.get("gateClassificationRows", len(gates)),
                "gateClassificationOptions": counts.get("gateClassificationOptions", sum(len(g.get("decisionOptions") or []) for g in gates if isinstance(g, dict))),
                "decisionOptions": len(options),
            },
            "notes": [
                f"Gate state: {state}",
                f"Gate type: {gate.get('classificationType') or gate.get('gate') or 'review'}",
                f"Recommended first move: {gate.get('recommendedFirstMove') or 'open evidence'}",
                f"Done when: {gate.get('doneWhen') or 'classification is recorded in local review truth'}",
                f"Tower impact: {gate.get('towerImpact') or 'Tower remains review-gated until this is classified'}",
                f"Not allowed yet: {gate.get('notAllowedYet') or 'promotion, external publication, receipts'}",
                f"Evidence command: {evidence_command}" if evidence_command else "Evidence command: open local Studio gate deck",
                f"Dry-run command: {dry_run_command}" if dry_run_command else "Dry-run command: not provided yet",
                *option_notes,
            ],
            "decisionOptions": options,
            "reviewItemId": str(gate.get("reviewItemId") or item_id),
            "classificationType": str(gate.get("classificationType") or "studio-gate"),
            "recommendedFirstMove": str(gate.get("recommendedFirstMove") or "Open local evidence and choose one classification."),
            "firstSafeAction": first_action,
            "primaryPath": html_path,
            "primaryCommand": f"open {shell_quote(html_path)}" if html_path else "",
            "nextAction": str(gate.get("recommendedFirstMove") or "Open local evidence and choose one classification."),
            "nextSafestAction": str(gate.get("recommendedFirstMove") or "Open local evidence and choose one classification."),
            "source": {
                "htmlPath": html_path,
                "jsonPath": str(pointer.get("jsonPath") or ""),
                "markdownPath": str(pointer.get("markdownPath") or ""),
                "worksheetPath": worksheet_path,
            },
            "truth": str(gate.get("receiptTruth") or "Studio gate classification only. Not package approval, Tower approval, external publication, upload, schedule, account mutation, or receipt truth."),
            "safety": "Local review/help routing only. No original files are mutated and no external publication/account action is performed.",
        })
    return items



def collect_studio_sync_control_room_item(start_index: int) -> list[dict[str, Any]]:
    pointer = load_json(DEFAULT_STUDIO_SYNC_CONTROL_ROOM_POINTER)
    if not pointer or not pointer.get("htmlPath"):
        return []
    counts = pointer.get("counts") if isinstance(pointer.get("counts"), dict) else {}
    tail = pointer.get("tailClassification") if isinstance(pointer.get("tailClassification"), dict) else {}
    first = pointer.get("firstSafeAction") if isinstance(pointer.get("firstSafeAction"), dict) else {}
    first_action = {
        "label": str(first.get("label") or "Open Studio sync control room"),
        "command": str(first.get("command") or f"open {shell_quote(str(pointer.get('htmlPath') or ''))}"),
        "path": str(first.get("path") or pointer.get("htmlPath") or ""),
        "safety": str(first.get("safety") or "Opens local sync evidence only. No trim, re-stack, render, publish, upload, schedule, overwrite, delete, approval, receipt, or source mutation occurs."),
    }
    return [{
        "id": f"studio-sync-control-{start_index:03d}",
        "lane": "Studio podcast/video",
        "laneKind": "podcast-video",
        "title": f"Episode {pointer.get('episode') or 4} sync control room: classify audio tail",
        "severity": "sync-review",
        "suggestedOwner": "Mako or Charlie",
        "status": str(pointer.get("status") or "sync-control-room-ready"),
        "plainEnglish": (
            f"Episode {pointer.get('episode') or 4} has {counts.get('comparisonRows', 0)} comparison row(s), "
            f"{counts.get('snippets', 0)} snippet(s), and a {tail.get('tailLabel', 'tail')} podcast-audio tail to classify."
        ),
        "humanAsk": str(pointer.get("humanAsk") or "Compare sync snippets and classify the podcast-audio tail before any publish, trim, or rebuild decision."),
        "agentCanContinueWith": str(pointer.get("agentSafeParallelWork") or "Codex can summarize evidence and prepare dry-run review commands without executing live decisions."),
        "counts": counts,
        "notes": [
            f"Tail: {tail.get('tailLabel', '')} ({tail.get('urgency', '')})",
            f"Artifacts: {counts.get('artifacts', 0)}",
            f"Comparison rows: {counts.get('comparisonRows', 0)}",
            f"Snippet errors: {counts.get('snippetErrors', 0)}",
        ],
        "handoffDetails": [
            f"Tail meaning: {tail.get('meaning', '')}",
            f"Version: {pointer.get('version', '')}",
            f"Truth: {pointer.get('truth', {}).get('description') if isinstance(pointer.get('truth'), dict) else pointer.get('truth', '')}",
        ],
        "primaryPath": str(pointer.get("htmlPath") or ""),
        "primaryCommand": first_action["command"],
        "firstSafeAction": first_action,
        "nextAction": str(pointer.get("nextSafestAction") or "Classify the audio tail before publishing or repair."),
        "nextSafestAction": str(pointer.get("nextSafestAction") or "Classify the audio tail before publishing or repair."),
        "source": {
            "htmlPath": pointer.get("htmlPath") or "",
            "jsonPath": pointer.get("jsonPath") or "",
            "markdownPath": pointer.get("markdownPath") or "",
        },
        "truth": "Studio sync control-room routing only. Local evidence, not sync approval, trim approval, publishing approval, or receipt truth.",
        "safety": "Local sync routing only. No original media is mutated and no external publication/account action is performed.",
    }]

def collect_studio_sync_decision_rehearsal_item(start_index: int) -> list[dict[str, Any]]:
    pointer = load_json(DEFAULT_STUDIO_SYNC_DECISION_REHEARSAL_POINTER)
    if not pointer or not pointer.get("htmlPath"):
        return []
    counts = pointer.get("counts") if isinstance(pointer.get("counts"), dict) else {}
    tail = pointer.get("tailClassification") if isinstance(pointer.get("tailClassification"), dict) else {}
    first = pointer.get("firstSafeAction") if isinstance(pointer.get("firstSafeAction"), dict) else {}
    first_action = {
        "label": str(first.get("label") or "Open Studio sync decision rehearsal"),
        "command": str(first.get("command") or f"open {shell_quote(str(pointer.get('htmlPath') or ''))}"),
        "path": str(first.get("path") or pointer.get("htmlPath") or ""),
        "safety": str(first.get("safety") or "Opens local sync decision rehearsal only. No live decisions, exports, publishing, uploads, schedules, overwrites, receipts, or source mutations occur."),
    }
    return [{
        "id": f"studio-sync-rehearsal-{start_index:03d}",
        "lane": "Studio podcast/video",
        "laneKind": "podcast-video",
        "title": f"Episode {pointer.get('episode') or 4} sync decision rehearsal: choose the safe path before acting",
        "severity": "sync-review",
        "suggestedOwner": "Mako or Charlie",
        "status": str(pointer.get("status") or "sync-decision-rehearsal-ready"),
        "plainEnglish": (
            f"Rehearses {counts.get('rehearsalScenarios', 0)} sync outcomes and {counts.get('decisionDryRuns', 0)} dry-run decision command(s) "
            f"before anyone writes a live hold/re-stack/trim decision for the {tail.get('tailLabel', 'audio tail')} tail."
        ),
        "humanAsk": str(pointer.get("humanAsk") or "Use the rehearsal beside the sync control room to choose hold/re-stack, trim-candidate, source-needed, or continue-review."),
        "agentCanContinueWith": str(pointer.get("agentSafeParallelWork") or "Codex can expand evidence notes and versioned rebuild plans without executing a live decision."),
        "counts": counts,
        "notes": [
            f"Tail: {tail.get('tailLabel', '')} ({tail.get('urgency', '')})",
            f"Scenarios: {counts.get('rehearsalScenarios', 0)}",
            f"Dry-runs: {counts.get('decisionDryRuns', 0)}",
            f"Decisions written: {counts.get('decisionsWritten', False)}",
        ],
        "primaryPath": str(pointer.get("htmlPath") or ""),
        "primaryCommand": first_action["command"],
        "firstSafeAction": first_action,
        "nextAction": str(pointer.get("nextSafestAction") or "Open the rehearsal and pick the evidence-backed sync path before any live decision."),
        "nextSafestAction": str(pointer.get("nextSafestAction") or "Open the rehearsal and pick the evidence-backed sync path before any live decision."),
        "source": {
            "studioSyncDecisionRehearsalPointer": str(DEFAULT_STUDIO_SYNC_DECISION_REHEARSAL_POINTER),
            "jsonPath": pointer.get("jsonPath") or "",
            "htmlPath": pointer.get("htmlPath") or "",
            "markdownPath": pointer.get("markdownPath") or "",
        },
        "truth": "Studio sync decision rehearsal routing only. Local dry-run evidence, not sync approval, package repair, publishing, upload, schedule, or receipt truth.",
        "safety": "Local sync rehearsal only. No decisions, exports, originals, uploads, publication, account, receipts, or version state are changed.",
    }]


def collect_tower_publication_control_room_item(start_index: int) -> list[dict[str, Any]]:
    pointer = load_json(DEFAULT_TOWER_PUBLICATION_CONTROL_ROOM_POINTER)
    if not pointer or not pointer.get("htmlPath"):
        return []
    counts = pointer.get("counts") if isinstance(pointer.get("counts"), dict) else {}
    first = pointer.get("firstSafeAction") if isinstance(pointer.get("firstSafeAction"), dict) else {}
    first_action = {
        "label": str(first.get("label") or "Open Tower publication control room"),
        "command": str(first.get("command") or f"open {shell_quote(str(pointer.get('htmlPath') or ''))}"),
        "path": str(first.get("path") or pointer.get("htmlPath") or ""),
        "safety": str(first.get("safety") or "Opens local Tower launch evidence only. No publish, upload, schedule, approval, account mutation, overwrite, source mutation, or receipt capture occurs."),
    }
    stage = str(pointer.get("stage") or "review-gated")
    ready = safe_int(counts.get("readyForApproval"))
    receipts = safe_int(counts.get("capturedReceipts"))
    review_rows = max(
        safe_int(counts.get("blockedOrReview")),
        safe_int(counts.get("pendingRows")) + safe_int(counts.get("warningRows")),
    )
    decision_deck = pointer.get("nextDecisionDeck") if isinstance(pointer.get("nextDecisionDeck"), list) else []
    first_decision = decision_deck[0] if decision_deck and isinstance(decision_deck[0], dict) else {}
    severity = "approval-needed" if ready else "human-review" if review_rows else "agent-safe"
    return [{
        "id": f"tower-publication-control-{start_index:03d}",
        "lane": "Tower publishing/social",
        "laneKind": "tower-publishing",
        "title": "Tower publication control room: launch packets without fake receipts",
        "severity": severity,
        "suggestedOwner": "Charlie",
        "status": str(pointer.get("status") or "tower-publication-control-room-ready"),
        "plainEnglish": (
            f"Tower has {counts.get('socialItems', 0)} platform row(s), {ready} approval-ready row(s), "
            f"{receipts} receipt(s), {review_rows} local review/warning row(s), and "
            f"{counts.get('nextDecisionDeckRows', len(decision_deck))} decision-deck row(s) that must stay separate from publication truth."
        ),
        "humanAsk": str(pointer.get("humanAsk") or "Open the Tower publication control room, review local gates, and approve nothing externally unless Charlie explicitly approves the exact action."),
        "agentCanContinueWith": str(pointer.get("agentSafeParallelWork") or "Codex can improve packets, copy, metadata, validation, calendars, and receipt slots without external account actions."),
        "counts": counts,
        "notes": [
            f"Stage: {stage}",
            f"Platform rows: {counts.get('socialItems', 0)}",
            f"Ready for approval: {ready}",
            f"Captured receipts: {receipts}",
            f"Blocked/review rows: {counts.get('blockedOrReview', 0)}",
            f"Decision deck rows: {counts.get('nextDecisionDeckRows', len(decision_deck))}",
            f"First decision: {first_decision.get('title') or 'none'} ({first_decision.get('state') or 'unknown'})",
        ],
        "handoffDetails": [
            f"Review rows: {counts.get('reviewRows', 0)}",
            f"Pending rows: {counts.get('pendingRows', 0)}",
            f"Warning rows: {counts.get('warningRows', 0)}",
            f"Calendar rows: {counts.get('calendarRows', 0)}",
            f"Receipt slots: {counts.get('receiptSlots', 0)}",
            f"First decision owner: {first_decision.get('owner') or 'unknown'}",
            f"First decision question: {first_decision.get('humanQuestion') or 'unknown'}",
        ],
        "nextDecisionDeck": decision_deck,
        "firstDecision": first_decision,
        "primaryPath": str(pointer.get("htmlPath") or ""),
        "primaryCommand": first_action["command"],
        "firstSafeAction": first_action,
        "nextAction": str(pointer.get("nextSafestAction") or "Open the Tower control room and keep review, approval, and receipt truth separate."),
        "nextSafestAction": str(pointer.get("nextSafestAction") or "Open the Tower control room and keep review, approval, and receipt truth separate."),
        "source": {
            "htmlPath": pointer.get("htmlPath") or "",
            "jsonPath": pointer.get("jsonPath") or "",
            "markdownPath": pointer.get("markdownPath") or "",
        },
        "truth": "Tower control-room routing only. Local packets and receipt slots are not external publication, approval, or receipt truth.",
        "safety": "Local Tower routing only. No original files are mutated and no external publication/account action is performed.",
    }]

def collect_nest_writing_control_room_item(start_index: int) -> list[dict[str, Any]]:
    pointer = load_json(DEFAULT_NEST_WRITING_CONTROL_ROOM_POINTER)
    if not pointer or not pointer.get("htmlPath"):
        return []
    counts = pointer.get("counts") if isinstance(pointer.get("counts"), dict) else {}
    first = pointer.get("firstSafeAction") if isinstance(pointer.get("firstSafeAction"), dict) else {}
    first_action = {
        "label": str(first.get("label") or "Open Nest writing control room"),
        "command": str(first.get("command") or f"open {shell_quote(str(pointer.get('htmlPath') or ''))}"),
        "path": str(first.get("path") or pointer.get("htmlPath") or ""),
        "safety": str(first.get("safety") or "Opens local writing/research evidence only. No source mutation, manuscript replacement, publication, upload, schedule, approval, or receipt capture occurs."),
    }
    pending = safe_int(counts.get("pendingHumanReview"))
    drafts = safe_int(counts.get("currentDrafts"))
    severity = "human-review" if pending else "agent-safe"
    return [{
        "id": f"nest-writing-control-{start_index:03d}",
        "lane": "Nest writing/research",
        "laneKind": "writing-research",
        "title": "Nest writing control room: write from sources",
        "severity": severity,
        "suggestedOwner": "Charlie or Homer",
        "status": str(pointer.get("status") or "nest-writing-control-room-ready"),
        "plainEnglish": (
            f"Nest has {counts.get('sourceWords', 0)} source word(s), {drafts} current draft(s), "
            f"{pending} pending human review item(s), and {counts.get('platformDraftItems', 0)} platform draft item(s)."
        ),
        "humanAsk": str(pointer.get("humanAsk") or "Open the Nest writing control room, choose one source-backed writing task, and keep the source trail visible."),
        "agentCanContinueWith": str(pointer.get("agentSafeParallelWork") or "Codex can draft, outline, compare sources, and prepare revision notes without replacing canonical manuscript text."),
        "counts": counts,
        "notes": [
            f"Stage: {pointer.get('stage', '')}",
            f"Source words: {counts.get('sourceWords', 0)}",
            f"Drafts: {drafts}",
            f"Pending review: {pending}",
            f"Receipt slots: {counts.get('receiptSlots', 0)}",
        ],
        "handoffDetails": [
            f"Review rows: {counts.get('reviewRows', 0)}",
            f"Review ready: {counts.get('reviewReady', 0)}",
            f"Available daily tasks: {counts.get('availableDailyTasks', 0)}",
            f"Platform drafts: {counts.get('platformDraftItems', 0)}",
            f"Captured receipts: {counts.get('capturedReceipts', 0)}",
        ],
        "primaryPath": str(pointer.get("htmlPath") or ""),
        "primaryCommand": first_action["command"],
        "firstSafeAction": first_action,
        "nextAction": str(pointer.get("nextSafestAction") or "Open the Nest writing control room and choose one source-backed draft/review task."),
        "nextSafestAction": str(pointer.get("nextSafestAction") or "Open the Nest writing control room and choose one source-backed draft/review task."),
        "source": {
            "htmlPath": pointer.get("htmlPath") or "",
            "jsonPath": pointer.get("jsonPath") or "",
            "markdownPath": pointer.get("markdownPath") or "",
        },
        "truth": "Nest writing control-room routing only. Local drafts and source trails are not canonical replacement, external publication, approval, or receipt truth.",
        "safety": "Local Nest writing routing only. No source files are mutated and no external publication/account action is performed.",
    }]

def collect_studio360_control_room_item(start_index: int) -> list[dict[str, Any]]:
    pointer = load_json(DEFAULT_STUDIO360_CONTROL_ROOM_POINTER)
    if not pointer or not pointer.get("htmlPath"):
        return []
    counts = pointer.get("counts") if isinstance(pointer.get("counts"), dict) else {}
    first = pointer.get("firstSafeAction") if isinstance(pointer.get("firstSafeAction"), dict) else {}
    first_action = {
        "label": str(first.get("label") or "Open Studio360 proof control room"),
        "command": str(first.get("command") or f"open {shell_quote(str(pointer.get('htmlPath') or ''))}"),
        "path": str(first.get("path") or pointer.get("htmlPath") or ""),
        "safety": str(first.get("safety") or "Opens local 360 proof/reframe evidence only. No render, export, upload, publication, overwrite, delete, or source mutation occurs."),
    }
    blocked = safe_int(counts.get("blockedMediaRepair")) + safe_int(counts.get("blockedNeedsProxy")) + safe_int(counts.get("damagedAssets"))
    severity = "operator-help" if blocked else "human-review"
    return [{
        "id": f"studio360-control-{start_index:03d}",
        "lane": "360 workflow",
        "laneKind": "studio360",
        "title": "Studio360 proof control room: review, repair, or proof next",
        "severity": severity,
        "suggestedOwner": "Mako or Charlie" if severity == "human-review" else "Codex first, Charlie if source media looks wrong",
        "status": str(pointer.get("status") or "studio360-control-room-ready"),
        "plainEnglish": (
            f"Open the 360 control room to inspect {counts.get('proofOutputsPresent', 0)} existing proof output(s), "
            f"{counts.get('nextProofRows', 0)} next-proof candidate(s), and {blocked} repair/proxy/damaged-source blocker(s)."
        ),
        "humanAsk": "Inspect existing 360 proofs first. If blocked, decide whether source/proxy repair is needed; if not, approve at most one small proof or mark it ready for later full-render planning.",
        "agentCanContinueWith": "Codex can summarize proofs, prepare repair tasks, improve packets, and regenerate control surfaces without rendering, mutating originals, or publishing.",
        "counts": counts,
        "notes": [
            f"Existing proofs: {counts.get('proofOutputsPresent', 0)} present / {counts.get('proofOutputsMissing', 0)} missing",
            f"Next proof rows: {counts.get('nextProofRows', 0)}",
            f"Reframe-ready groups: {counts.get('reframeReady', 0)}",
            f"Repair/proxy/damaged blockers: {blocked}",
        ],
        "handoffDetails": [
            f"Renderer dry-run rows: {counts.get('rendererDryRunReadyRows', 0)}",
            f"Asset groups: {counts.get('assetGroups', 0)}",
            f"Assets: {counts.get('assets', 0)}",
            f"Truth: {pointer.get('truth', {}).get('description') if isinstance(pointer.get('truth'), dict) else pointer.get('truth', '')}",
        ],
        "primaryPath": str(pointer.get("htmlPath") or ""),
        "primaryCommand": first_action["command"],
        "firstSafeAction": first_action,
        "nextAction": str(pointer.get("nextSafestAction") or "Open the control room and choose one reversible 360 action."),
        "nextSafestAction": str(pointer.get("nextSafestAction") or "Open the control room and choose one reversible 360 action."),
        "source": {
            "htmlPath": pointer.get("htmlPath") or "",
            "jsonPath": pointer.get("jsonPath") or "",
            "markdownPath": pointer.get("markdownPath") or "",
        },
        "truth": "Studio360 control-room routing only. Local proof/reframe evidence, not full-render approval, upload truth, publication truth, or receipt truth.",
        "safety": "Local 360 routing only. No original media is mutated and no external publication/account action is performed.",
    }]

def summarize(items: list[dict[str, Any]], production_runway: dict[str, Any], validation: dict[str, Any]) -> dict[str, Any]:
    counts_by_severity: dict[str, int] = {}
    counts_by_lane: dict[str, int] = {}
    counts_by_owner: dict[str, int] = {}
    for item in items:
        counts_by_severity[item["severity"]] = counts_by_severity.get(item["severity"], 0) + 1
        counts_by_lane[item["lane"]] = counts_by_lane.get(item["lane"], 0) + 1
        counts_by_owner[item["suggestedOwner"]] = counts_by_owner.get(item["suggestedOwner"], 0) + 1
    return {
        "helpItems": len(items),
        "blockers": counts_by_severity.get("blocker", 0),
        "studioGateClassificationItems": sum(1 for item in items if str(item.get("id") or "").startswith("studio-gate-classification")),
        "studioGateClassificationOptions": sum(len(item.get("decisionOptions") or []) for item in items if str(item.get("id") or "").startswith("studio-gate-classification")),
        "syncReviewNeeded": counts_by_severity.get("sync-review", 0),
        "externalApprovalNeeded": counts_by_severity.get("approval-needed", 0),
        "missingMedia": counts_by_severity.get("missing-media", 0),
        "operatorHelp": counts_by_severity.get("operator-help", 0),
        "humanReview": counts_by_severity.get("human-review", 0),
        "agentSafe": counts_by_severity.get("agent-safe", 0),
        "ready": counts_by_severity.get("ready", 0),
        "lanes": len(counts_by_lane),
        "sourceRunwayCards": safe_int((production_runway.get("counts") or {}).get("cards")),
        "sourceRunwayAttentionCards": safe_int((production_runway.get("counts") or {}).get("attentionCards")),
        "validationFailures": safe_int((validation.get("counts") or {}).get("failures")),
        "validationWarnings": safe_int((validation.get("counts") or {}).get("warnings")),
        "matrixItems": sum(1 for item in items if str(item.get("id") or "").startswith("matrix-")),
        "photoControlRoomItems": sum(1 for item in items if str(item.get("id") or "").startswith("photo-control-")),
        "photoCullRehearsalItems": sum(1 for item in items if str(item.get("id") or "").startswith("photo-cull-rehearsal-")),
        "photoContactSheetItems": sum(1 for item in items if str(item.get("id") or "").startswith("photo-contact-")),
        "photoFirstPassItems": sum(1 for item in items if str(item.get("id") or "").startswith("photo-first-pass-")),
        "nestWritingControlRoomItems": sum(1 for item in items if str(item.get("id") or "").startswith("nest-writing-control-")),
        "studio360ControlRoomItems": sum(1 for item in items if str(item.get("id") or "").startswith("studio360-control-")),
        "studioSyncControlRoomItems": sum(1 for item in items if str(item.get("id") or "").startswith("studio-sync-control-")),
        "studioSyncDecisionRehearsalItems": sum(1 for item in items if str(item.get("id") or "").startswith("studio-sync-rehearsal-")),
        "towerPublicationControlRoomItems": sum(1 for item in items if str(item.get("id") or "").startswith("tower-publication-control-")),
        "bySeverity": counts_by_severity,
        "byLane": counts_by_lane,
        "byOwner": counts_by_owner,
    }


def sort_items(items: list[dict[str, Any]]) -> list[dict[str, Any]]:
    lane_order = {
        "Studio podcast/video": 0,
        "Tower publishing/social": 1,
        "Nest writing/research": 2,
        "Photo Grove": 3,
        "360 workflow": 4,
        "Quipsly OS": 5,
    }

    def rank(item: dict[str, Any]) -> tuple[float, int, int, str]:
        severity = str(item.get("severity") or "")
        base = float(SEVERITY_RANK.get(severity, 99))
        item_id = str(item.get("id") or "")
        status = str(item.get("status") or "")
        if item_id.startswith("studio-gate-classification"):
            base = 0.5 if status.endswith("active") else 0.6
        return (base, lane_order.get(str(item.get("lane") or ""), 99), safe_int(item.get("rank")), str(item.get("title") or ""))

    return sorted(items, key=rank)


DETAIL_KEYS = (
    "worksheetPath",
    "durationSpreadSeconds",
    "spreadLabel",
    "plainEnglishDurationSummary",
    "videoDurationSeconds",
    "audioDurationSeconds",
    "diagnosis",
    "reviewWorksheet",
    "dryRunReviewCommands",
    "reviewCommandsAfterPreview",
    "firstDryRunReviewCommand",
    "unblocksWhen",
    "approvalRunwaySummary",
    "approvalRunwayTruth",
    "writingSessionRecipe",
    "writingMoveMenu",
    "firstWritingTask",
    "firstDraftReview",
    "dailyWritingFirstTask",
    "dailyWritingTruth",
    "firstProofCandidate",
    "proofReviewRecipe",
    "selectedGroups",
    "selectedAspects",
    "firstStarterCandidate",
    "firstCandidateStarter",
    "firstCullSuggestionGroup",
    "cullSuggestionSummary",
    "sourceCullSuggestions",
    "proofPrepRecipe",
)


def compact_value(value: Any) -> str:
    if value is None:
        return ""
    if isinstance(value, (str, int, float, bool)):
        return str(value)
    if isinstance(value, list):
        pieces = [compact_value(item) for item in value[:4]]
        pieces = [piece for piece in pieces if piece]
        if len(value) > 4:
            pieces.append(f"+{len(value) - 4} more")
        return "; ".join(pieces)
    if isinstance(value, dict):
        preferred = ["title", "label", "name", "episode", "platform", "status", "id", "path", "command"]
        pieces: list[str] = []
        for key in preferred:
            raw = value.get(key)
            if raw not in (None, "", [], {}):
                pieces.append(f"{key}: {compact_value(raw)}")
            if len(pieces) >= 4:
                break
        if not pieces:
            for key, raw in list(value.items())[:4]:
                if raw not in (None, "", [], {}):
                    pieces.append(f"{key}: {compact_value(raw)}")
        return " | ".join(pieces)
    return str(value)


def add_detail(details: list[str], label: str, value: Any) -> None:
    text = compact_value(value)
    if text:
        details.append(f"{label}: {text}")


def handoff_details(item: dict[str, Any]) -> list[str]:
    details: list[str] = []
    add_detail(details, "Sync duration summary", item.get("plainEnglishDurationSummary"))
    add_detail(details, "Sync spread", item.get("durationSpreadSeconds"))
    add_detail(details, "Sync spread label", item.get("spreadLabel"))
    add_detail(details, "Video duration", item.get("videoDurationSeconds"))
    add_detail(details, "Audio duration", item.get("audioDurationSeconds"))
    add_detail(details, "Sync diagnosis", item.get("diagnosis"))
    add_detail(details, "Sync worksheet", item.get("worksheetPath") or item.get("reviewWorksheet"))
    add_detail(details, "First sync dry-run command", item.get("firstDryRunReviewCommand"))
    add_detail(details, "Sync review commands", item.get("dryRunReviewCommands") or item.get("reviewCommandsAfterPreview"))
    add_detail(details, "Unblocks when", item.get("unblocksWhen"))
    add_detail(details, "Approval runway", item.get("approvalRunwaySummary"))
    add_detail(details, "Approval truth", item.get("approvalRunwayTruth"))
    add_detail(details, "First writing task", item.get("firstWritingTask"))
    add_detail(details, "Daily writing first task", item.get("dailyWritingFirstTask"))
    add_detail(details, "Daily writing truth", item.get("dailyWritingTruth"))
    add_detail(details, "Writing session recipe", item.get("writingSessionRecipe"))
    add_detail(details, "Writing move menu", item.get("writingMoveMenu"))
    add_detail(details, "First draft review", item.get("firstDraftReview"))
    add_detail(details, "First 360 proof candidate", item.get("firstProofCandidate"))
    add_detail(details, "360 proof review recipe", item.get("proofReviewRecipe"))
    add_detail(details, "360 selected groups", item.get("selectedGroups"))
    add_detail(details, "360 selected aspects", item.get("selectedAspects"))
    add_detail(details, "First Photo Grove starter", item.get("firstStarterCandidate") or item.get("firstCandidateStarter"))
    add_detail(details, "First Photo Grove cull group", item.get("firstCullSuggestionGroup"))
    add_detail(details, "Photo cull suggestion summary", item.get("cullSuggestionSummary"))
    add_detail(details, "Photo cull suggestion source", item.get("sourceCullSuggestions"))
    add_detail(details, "Photo proof prep recipe", item.get("proofPrepRecipe"))
    return details


def enrich_item_with_card_details(item: dict[str, Any], card: dict[str, Any]) -> dict[str, Any]:
    enriched = dict(item)
    for key in DETAIL_KEYS:
        value = card.get(key)
        if value not in (None, "", [], {}):
            enriched[key] = value

    details = handoff_details(enriched)
    if details:
        enriched["handoffDetails"] = details

    title = str(enriched.get("title") or "")
    lane = str(enriched.get("lane") or "")
    has_approval = bool(enriched.get("approvalRunwaySummary") or enriched.get("approvalRunwayTruth"))
    has_writing = bool(enriched.get("firstWritingTask") or enriched.get("dailyWritingFirstTask") or enriched.get("writingSessionRecipe"))
    has_360 = bool(enriched.get("firstProofCandidate") or enriched.get("proofReviewRecipe"))
    has_photo = bool(
        enriched.get("firstStarterCandidate")
        or enriched.get("firstCandidateStarter")
        or enriched.get("firstCullSuggestionGroup")
        or enriched.get("cullSuggestionSummary")
        or enriched.get("proofPrepRecipe")
    )
    has_sync = bool(enriched.get("plainEnglishDurationSummary") or enriched.get("durationSpreadSeconds") or enriched.get("reviewWorksheet") or enriched.get("worksheetPath"))

    if has_sync and "sync" not in str(enriched.get("humanAsk") or "").lower():
        enriched["humanAsk"] = "Open the sync worksheet, compare the prepared audio/video evidence, and decide whether this episode needs re-sync, re-stack, hold, or versioned rebuild."
        enriched["agentCanContinueWith"] = "Keep packaging other lanes and preparing review evidence; do not trim, publish, or mark this episode ready until sync intent is clear."
    elif has_approval and "approval" not in str(enriched.get("humanAsk") or "").lower():
        enriched["humanAsk"] = "Review the approval runway rows and unblock local review before any platform packet is treated as approval-ready."
        enriched["agentCanContinueWith"] = "Keep preparing local packets, metadata, validation, and receipt slots without publishing or creating fake receipts."
    elif has_writing and "writing" not in str(enriched.get("humanAsk") or "").lower():
        enriched["humanAsk"] = "Open the first source-backed writing task, choose one writing move, and do a short human review or drafting pass with source context visible."
        enriched["agentCanContinueWith"] = "Keep preparing source-backed draft packets, outlines, and research notes without replacing manuscript truth."
    elif has_360 and "proof" not in str(enriched.get("humanAsk") or "").lower():
        enriched["humanAsk"] = "Watch the first 360 proof candidate and mark approve, refine, or hold based on framing and source confidence."
        enriched["agentCanContinueWith"] = "Keep generating local proof candidates, proxy-safe diagnostics, and review packets without mutating originals."
    elif has_photo and "photo" not in str(enriched.get("humanAsk") or "").lower():
        enriched["humanAsk"] = "Compare the first Photo Grove cull group and starter candidate, then make metadata-only keep/review/reject notes."
        enriched["agentCanContinueWith"] = "Keep indexing, grouping, and preparing review/export packets without touching original photos."

    if has_sync:
        enriched["nextSafestAction"] = "Open the sync investigation packet and worksheet, compare the prepared snippets, then record hold/refine/rebuild intent without touching source media."
    elif has_writing and ("Writing" in title or "writing" in lane.lower()):
        enriched["nextSafestAction"] = "Open the first writing task, compare it to the source-backed draft packet, and record one small human decision before expanding the draft."
    elif has_360 and "360" in lane:
        enriched["nextSafestAction"] = "Open the first 360 proof candidate, watch the local proof clip, and record whether the framing is approve, refine, or hold."
    elif has_photo and "Photo" in lane:
        enriched["nextSafestAction"] = "Open the Photo Grove proof packet, compare the first cull group/starter candidate, and make one metadata-only review decision."
    elif has_approval:
        enriched["nextSafestAction"] = "Open the Tower publisher desk, clear local-review blockers first, and leave receipt fields empty until a real platform action happens."

    return enriched


def build_payload() -> dict[str, Any]:
    os_board = load_json(DEFAULT_OS_BOARD_POINTER)
    production_runway = load_json(DEFAULT_PRODUCTION_RUNWAY_POINTER)
    validation = load_json(DEFAULT_VALIDATION_POINTER)
    return_brief = load_json(DEFAULT_RETURN_BRIEF_POINTER)
    os_priority_cards = os_board.get("priorityQueue") if isinstance(os_board.get("priorityQueue"), list) else []
    runway_cards = production_runway.get("cards") if isinstance(production_runway.get("cards"), list) else []
    cards: list[dict[str, Any]] = []
    seen_cards: set[tuple[str, str]] = set()
    for card in [item for item in os_priority_cards if isinstance(item, dict)] + [item for item in runway_cards if isinstance(item, dict)]:
        first = card.get("firstSafeAction") if isinstance(card.get("firstSafeAction"), dict) else {}
        path = str(
            card.get("primaryPath")
            or first.get("path")
            or card.get("htmlPath")
            or card.get("markdownPath")
            or card.get("jsonPath")
            or ""
        )
        title = str(card.get("title") or card.get("label") or "")
        key = ("path", path) if path else ("title", title)
        if key in seen_cards:
            continue
        seen_cards.add(key)
        cards.append(card)
    items: list[dict[str, Any]] = []
    for index, card in enumerate(cards):
        if not isinstance(card, dict):
            continue
        items.append(enrich_item_with_card_details(item_from_card(card, index + 1), card))
    items.extend(collect_matrix_items(return_brief, len(items) + 1))
    items.extend(collect_studio_gate_classification_items(len(items) + 1))
    items.extend(collect_studio_sync_control_room_item(len(items) + 1))
    items.extend(collect_studio_sync_decision_rehearsal_item(len(items) + 1))
    items.extend(collect_tower_publication_control_room_item(len(items) + 1))
    items.extend(collect_nest_writing_control_room_item(len(items) + 1))
    items.extend(collect_photo_first_pass_item(len(items) + 1))
    items.extend(collect_photo_control_room_item(len(items) + 1))
    items.extend(collect_photo_cull_rehearsal_item(len(items) + 1))
    items.extend(collect_photo_contact_sheet_item(len(items) + 1))
    items.extend(collect_studio360_control_room_item(len(items) + 1))
    items.extend(collect_validation_items(validation, len(items) + 1))
    items = sort_items(items)
    counts = summarize(items, production_runway, validation)
    first = items[0]["firstSafeAction"] if items else {
        "label": "Open Production Runway",
        "path": str(production_runway.get("htmlPath") or ""),
        "command": f"open {shell_quote(str(production_runway.get('htmlPath') or ''))}" if production_runway.get("htmlPath") else "",
        "safety": "Opens local evidence only.",
    }
    return {
        "schema": SCHEMA,
        "generatedAt": iso_now(),
        "status": "human-help-board-ready" if items else "human-help-board-empty",
        "sourcePointers": {
            "osBoard": str(DEFAULT_OS_BOARD_POINTER),
            "productionRunway": str(DEFAULT_PRODUCTION_RUNWAY_POINTER),
            "validation": str(DEFAULT_VALIDATION_POINTER),
            "returnBrief": str(DEFAULT_RETURN_BRIEF_POINTER),
            "photoControlRoom": str(DEFAULT_PHOTO_CONTROL_ROOM_POINTER),
            "photoCullRehearsal": str(DEFAULT_PHOTO_CULL_REHEARSAL_POINTER),
            "photoContactSheet": str(DEFAULT_PHOTO_CONTACT_SHEET_POINTER),
            "photoFirstPass": str(DEFAULT_PHOTO_FIRST_PASS_POINTER),
            "studioTopReviewCompanion": str(DEFAULT_STUDIO_TOP_REVIEW_COMPANION_POINTER),
            "towerPublicationControlRoom": str(DEFAULT_TOWER_PUBLICATION_CONTROL_ROOM_POINTER),
            "nestWritingControlRoom": str(DEFAULT_NEST_WRITING_CONTROL_ROOM_POINTER),
        },
        "sourceArtifacts": {
            "osBoardHtml": os_board.get("htmlPath") or "",
            "osBoardJson": os_board.get("jsonPath") or "",
            "productionRunwayHtml": production_runway.get("htmlPath") or "",
            "productionRunwayJson": production_runway.get("jsonPath") or "",
            "validationHtml": validation.get("htmlPath") or "",
            "validationJson": validation.get("jsonPath") or "",
            "returnBriefHtml": return_brief.get("htmlPath") or "",
            "returnBriefJson": return_brief.get("jsonPath") or "",
            "photoControlRoomHtml": load_json(DEFAULT_PHOTO_CONTROL_ROOM_POINTER).get("htmlPath") or "",
            "photoControlRoomJson": load_json(DEFAULT_PHOTO_CONTROL_ROOM_POINTER).get("jsonPath") or "",
            "photoCullRehearsalHtml": load_json(DEFAULT_PHOTO_CULL_REHEARSAL_POINTER).get("htmlPath") or "",
            "photoCullRehearsalJson": load_json(DEFAULT_PHOTO_CULL_REHEARSAL_POINTER).get("jsonPath") or "",
            "photoContactSheetHtml": load_json(DEFAULT_PHOTO_CONTACT_SHEET_POINTER).get("htmlPath") or "",
            "photoContactSheetJson": load_json(DEFAULT_PHOTO_CONTACT_SHEET_POINTER).get("jsonPath") or "",
            "photoFirstPassHtml": load_json(DEFAULT_PHOTO_FIRST_PASS_POINTER).get("htmlPath") or "",
            "photoFirstPassJson": load_json(DEFAULT_PHOTO_FIRST_PASS_POINTER).get("jsonPath") or "",
            "towerPublicationControlRoomHtml": load_json(DEFAULT_TOWER_PUBLICATION_CONTROL_ROOM_POINTER).get("htmlPath") or "",
            "towerPublicationControlRoomJson": load_json(DEFAULT_TOWER_PUBLICATION_CONTROL_ROOM_POINTER).get("jsonPath") or "",
            "nestWritingControlRoomHtml": load_json(DEFAULT_NEST_WRITING_CONTROL_ROOM_POINTER).get("htmlPath") or "",
            "nestWritingControlRoomJson": load_json(DEFAULT_NEST_WRITING_CONTROL_ROOM_POINTER).get("jsonPath") or "",
        },
        "counts": counts,
        "items": items,
        "firstSafeAction": first,
        "nextSafestAction": items[0]["nextSafestAction"] if items else "Refresh the Quipsly OS runway, then rebuild this board.",
        "truth": {
            "localReviewOnly": True,
            "originalsMutated": False,
            "versionsOverwritten": False,
            "externalPublishing": False,
            "externalSchedulesCreated": False,
            "receiptTruthCreated": False,
            "accountMutation": False,
        },
        "safety": "This board opens and summarizes local evidence only. It does not publish, upload, schedule, delete, mutate originals, overwrite versions, create receipts, or change accounts.",
    }




def decision_option_lines(item: dict[str, Any]) -> list[str]:
    options = item.get("decisionOptions") if isinstance(item.get("decisionOptions"), list) else []
    lines: list[str] = []
    for index, option in enumerate(options, start=1):
        if not isinstance(option, dict):
            continue
        label = str(option.get("label") or option.get("id") or f"Option {index}")
        means = str(option.get("means") or option.get("plainEnglish") or "")
        codex_may_do = str(option.get("codexMayDo") or "")
        danger = str(option.get("danger") or option.get("watchFor") or "")
        parts = [f"{index}. {label}"]
        if means:
            parts.append(f"means: {means}")
        if codex_may_do:
            parts.append(f"Codex may: {codex_may_do}")
        if danger:
            parts.append(f"Watch for: {danger}")
        lines.append("; ".join(parts))
    return lines


def decision_option_html(item: dict[str, Any]) -> str:
    options = item.get("decisionOptions") if isinstance(item.get("decisionOptions"), list) else []
    if not options:
        return ""
    rows: list[str] = []
    for index, option in enumerate(options, start=1):
        if not isinstance(option, dict):
            continue
        label = esc(option.get("label") or option.get("id") or f"Option {index}")
        means = esc(option.get("means") or option.get("plainEnglish") or "")
        codex_may_do = esc(option.get("codexMayDo") or "")
        danger = esc(option.get("danger") or option.get("watchFor") or "")
        details = "".join([
            f"<p><b>Means:</b> {means}</p>" if means else "",
            f"<p><b>Codex may:</b> {codex_may_do}</p>" if codex_may_do else "",
            f"<p><b>Watch for:</b> {danger}</p>" if danger else "",
        ])
        rows.append(f"<li><strong>{label}</strong>{details}</li>")
    return f"<div class='action decision-options'><strong>Decision options</strong><ol>{''.join(rows)}</ol></div>"

def write_csv(path: Path, items: list[dict[str, Any]]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=["id", "severity", "suggestedOwner", "lane", "title", "status", "plainEnglish", "humanAsk", "agentCanContinueWith", "firstCommand", "nextSafestAction"])
        writer.writeheader()
        for item in items:
            first = item.get("firstSafeAction") if isinstance(item.get("firstSafeAction"), dict) else {}
            writer.writerow({
                "id": item.get("id") or "",
                "severity": item.get("severity") or "",
                "suggestedOwner": item.get("suggestedOwner") or "",
                "lane": item.get("lane") or "",
                "title": item.get("title") or "",
                "status": item.get("status") or "",
                "plainEnglish": item.get("plainEnglish") or "",
                "humanAsk": item.get("humanAsk") or "",
                "agentCanContinueWith": item.get("agentCanContinueWith") or "",
                "firstCommand": first.get("command") or "",
                "nextSafestAction": item.get("nextSafestAction") or "",
            })


def write_markdown(path: Path, payload: dict[str, Any]) -> None:
    lines = [
        "# Quipsly human help board",
        "",
        f"- Updated: `{payload['generatedAt']}`",
        f"- Status: `{payload['status']}`",
        f"- Help items: `{payload['counts']['helpItems']}`",
        f"- Blockers: `{payload['counts']['blockers']}`",
        f"- Human review: `{payload['counts']['humanReview']}`",
        f"- External approval needed: `{payload['counts']['externalApprovalNeeded']}`",
        "",
        "This is a local help-routing board. It does not publish, upload, schedule, delete, mutate originals, overwrite versions, create receipts, or change accounts.",
        "",
        "## Start here",
        "",
        f"- First safe action: `{payload['firstSafeAction'].get('label', '')}`",
        f"- Command: `{payload['firstSafeAction'].get('command', '')}`",
        f"- Next safest action: {payload['nextSafestAction']}",
        f"- Human ask: {payload.get('humanAsk') or ''}",
        f"- Codex can keep going: {payload.get('agentSafeParallelWork') or ''}",
        "",
        "## Owner packets",
        "",
    ]
    owner_paths = payload.get("ownerPacketPaths") if isinstance(payload.get("ownerPacketPaths"), dict) else {}
    if owner_paths:
        for owner, owner_path in sorted(owner_paths.items()):
            lines.append(f"- `{owner}`: `{owner_path}`")
    else:
        lines.append("- No owner packets generated.")
    lines.extend([
        "",
        "## Help items",
        "",
    ])
    for item in payload["items"]:
        first = item.get("firstSafeAction") if isinstance(item.get("firstSafeAction"), dict) else {}
        notes = item.get("notes") if isinstance(item.get("notes"), list) else []
        details = item.get("handoffDetails") if isinstance(item.get("handoffDetails"), list) else []
        lines.extend([
            f"### {item['id']} - {item['title']}",
            "",
            f"- Lane: `{item['lane']}`",
            f"- Severity: `{item['severity']}`",
            f"- Suggested owner: `{item['suggestedOwner']}`",
            f"- Status: `{item['status']}`",
            f"- What it means: {item['plainEnglish']}",
            f"- Human ask: {item['humanAsk']}",
            f"- Codex can continue with: {item['agentCanContinueWith']}",
            f"- First safe action: `{first.get('command', '')}`",
            f"- Next safest action: {item['nextSafestAction']}",
        ])
        option_lines = decision_option_lines(item)
        if option_lines:
            lines.append("- Decision options:")
            for option_line in option_lines:
                lines.append(f"  - {option_line}")
        for detail in details[:10]:
            lines.append(f"- Detail: {detail}")
        for note in notes[:6]:
            lines.append(f"- Note: {note}")
        lines.append("")
    path.write_text("\n".join(lines), encoding="utf-8")


def write_html(path: Path, payload: dict[str, Any]) -> None:
    owner_paths = payload.get("ownerPacketPaths") if isinstance(payload.get("ownerPacketPaths"), dict) else {}
    owner_links: list[str] = []
    for owner, owner_path in sorted(owner_paths.items()):
        uri = file_uri(str(owner_path))
        href = uri or "#"
        owner_links.append(
            f"<a class='owner-link' href='{esc(href)}'><span>{esc(owner)}</span><code>{esc(owner_path)}</code></a>"
        )
    cards = []
    for item in payload["items"]:
        first = item.get("firstSafeAction") if isinstance(item.get("firstSafeAction"), dict) else {}
        notes = item.get("notes") if isinstance(item.get("notes"), list) else []
        details = item.get("handoffDetails") if isinstance(item.get("handoffDetails"), list) else []
        note_html = "".join(f"<li>{esc(note)}</li>" for note in notes[:5])
        detail_html = "".join(f"<li>{esc(detail)}</li>" for detail in details[:8])
        option_html = decision_option_html(item)
        command = first.get("command") or ""
        cards.append(f"""
        <article class="card {esc(item['severity'])}">
          <div class="meta"><span>{esc(item['severity'])}</span><span>{esc(item['lane'])}</span><span>{esc(item['status'])}</span></div>
          <h2>{esc(item['title'])}</h2>
          <p>{esc(item['plainEnglish'])}</p>
          <div class="action"><strong>Suggested owner</strong><p>{esc(item['suggestedOwner'])}</p></div>
          <div class="action"><strong>Human ask</strong><p>{esc(item['humanAsk'])}</p></div>
          <div class="action"><strong>Codex can continue with</strong><p>{esc(item['agentCanContinueWith'])}</p></div>
          <div class="action"><strong>First safe action</strong><code>{esc(command)}</code></div>
          <div class="action"><strong>Next</strong><p>{esc(item['nextSafestAction'])}</p></div>
          {option_html}
          {f'<div class="action details"><strong>Specific handoff details</strong><ul>{detail_html}</ul></div>' if detail_html else ''}
          {f'<ul>{note_html}</ul>' if note_html else ''}
        </article>
        """)
    counts = payload["counts"]
    html_text = f"""<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Quipsly human help board</title>
  <style>
    :root {{
      color-scheme: dark;
      --bg: #101710;
      --panel: #172419;
      --panel2: #211d12;
      --ink: #f7f0d6;
      --muted: #b9ad8b;
      --line: rgba(247, 240, 214, 0.16);
      --moss: #7bd88f;
      --honey: #e6c15a;
      --clay: #e8795f;
      --creek: #5ec2d0;
      --violet: #c9a7ff;
    }}
    * {{ box-sizing: border-box; }}
    body {{ margin: 0; background: radial-gradient(circle at top left, rgba(123,216,143,.22), transparent 32rem), linear-gradient(180deg, #121b12, #0b0f0c 70%); color: var(--ink); font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }}
    main {{ max-width: 1240px; margin: 0 auto; padding: 42px 24px 72px; }}
    .hero {{ border: 1px solid var(--line); border-radius: 30px; padding: 30px; background: linear-gradient(135deg, rgba(23,36,25,.96), rgba(33,29,18,.9)); box-shadow: 0 28px 90px rgba(0,0,0,.36); }}
    .eyebrow {{ color: var(--honey); font-size: 12px; letter-spacing: .26em; text-transform: uppercase; font-weight: 900; }}
    h1 {{ font-size: clamp(42px, 7vw, 84px); line-height: .92; margin: 10px 0 12px; max-width: 940px; }}
    .hero p {{ color: var(--muted); max-width: 860px; font-size: 18px; line-height: 1.55; }}
    .stats {{ display: flex; flex-wrap: wrap; gap: 10px; margin-top: 22px; }}
    .stat {{ border: 1px solid var(--line); border-radius: 18px; padding: 12px 15px; background: rgba(255,255,255,.055); min-width: 118px; }}
    .stat strong {{ display: block; font-size: 26px; color: var(--moss); }}
    .owners {{ margin-top: 22px; border: 1px solid var(--line); border-radius: 22px; padding: 16px; background: rgba(0,0,0,.16); }}
    .owners h2 {{ margin: 0 0 10px; color: var(--honey); font-size: 16px; text-transform: uppercase; letter-spacing: .14em; }}
    .owner-grid {{ display: grid; grid-template-columns: repeat(auto-fit, minmax(230px, 1fr)); gap: 10px; }}
    .owner-link {{ display: block; border: 1px solid var(--line); border-radius: 16px; padding: 12px; background: rgba(255,255,255,.045); color: var(--ink); text-decoration: none; }}
    .owner-link span {{ display: block; font-weight: 900; margin-bottom: 5px; }}
    .owner-link code {{ color: var(--creek); font-size: 11px; }}
    .grid {{ display: grid; grid-template-columns: repeat(auto-fit, minmax(320px, 1fr)); gap: 16px; margin-top: 24px; }}
    .card {{ border: 1px solid var(--line); border-radius: 24px; background: rgba(255,255,255,.055); padding: 20px; box-shadow: 0 16px 48px rgba(0,0,0,.24); }}
    .card.blocker, .card.sync-review {{ border-color: rgba(232,121,95,.5); background: linear-gradient(160deg, rgba(232,121,95,.16), rgba(255,255,255,.045)); }}
    .card.approval-needed {{ border-color: rgba(230,193,90,.46); background: linear-gradient(160deg, rgba(230,193,90,.14), rgba(255,255,255,.045)); }}
    .card.human-review {{ border-color: rgba(123,216,143,.36); }}
    .card.agent-safe, .card.ready {{ border-color: rgba(94,194,208,.34); }}
    .meta {{ display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 10px; }}
    .meta span {{ border-radius: 999px; background: rgba(0,0,0,.24); color: var(--muted); padding: 5px 9px; font-size: 11px; font-weight: 900; text-transform: uppercase; letter-spacing: .08em; }}
    h2 {{ margin: 8px 0 8px; font-size: 24px; }}
    p, li {{ color: var(--muted); line-height: 1.45; }}
    .action {{ border: 1px solid var(--line); border-radius: 15px; padding: 11px; margin-top: 10px; background: rgba(0,0,0,.18); }}
    .action strong {{ color: var(--honey); display: block; margin-bottom: 4px; }}
    .decision-options ol {{ margin: 8px 0 0; padding-left: 22px; }}
    .decision-options li {{ margin: 10px 0; }}
    .decision-options li strong {{ color: var(--ink); display: inline; }}
    .decision-options p {{ margin: 3px 0; font-size: 13px; }}
    code {{ display: block; color: var(--creek); white-space: pre-wrap; word-break: break-word; font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace; }}
  </style>
</head>
<body>
<main>
  <section class="hero">
    <div class="eyebrow">Quipsly OS</div>
    <h1>What can a human help with right now?</h1>
    <p>This board gathers the latest local runway evidence and turns it into specific help requests, review work, blockers, and safe next actions. It is deliberately boring about safety: no external publishing, no account mutation, no source changes, no fake receipts.</p>
    <div class="stats">
      <div class="stat"><strong>{counts['helpItems']}</strong>Help items</div>
      <div class="stat"><strong>{counts['blockers']}</strong>Blockers</div>
      <div class="stat"><strong>{counts['syncReviewNeeded']}</strong>Sync reviews</div>
      <div class="stat"><strong>{counts['externalApprovalNeeded']}</strong>Approvals</div>
      <div class="stat"><strong>{counts['humanReview']}</strong>Human reviews</div>
      <div class="stat"><strong>{counts['validationFailures']}</strong>Validation failures</div>
    </div>
    <div class="owners">
      <h2>Owner packets</h2>
      <div class="owner-grid">{''.join(owner_links) if owner_links else '<p>No owner packets generated.</p>'}</div>
    </div>
  </section>
  <section class="grid">
    {''.join(cards)}
  </section>
</main>
</body>
</html>
"""
    path.write_text(html_text, encoding="utf-8")


def slugify(value: str) -> str:
    slug = re.sub(r"[^a-z0-9]+", "-", value.lower()).strip("-")
    return slug or "owner"


def write_owner_packets(session_dir: Path, payload: dict[str, Any]) -> dict[str, str]:
    owners: dict[str, list[dict[str, Any]]] = {}
    for item in payload["items"]:
        owner = str(item.get("suggestedOwner") or "Unassigned")
        owners.setdefault(owner, []).append(item)

    packet_dir = session_dir / "owner-packets"
    packet_dir.mkdir(parents=True, exist_ok=True)
    packet_paths: dict[str, str] = {}
    for owner, items in sorted(owners.items()):
        path = packet_dir / f"START-HERE-{slugify(owner)}.md"
        packet_paths[owner] = str(path)
        lines = [
            f"# Quipsly help packet: {owner}",
            "",
            f"- Updated: `{payload['generatedAt']}`",
            f"- Items: `{len(items)}`",
            "",
            "This packet is local review/help routing only. It does not publish, upload, schedule, delete, mutate originals, overwrite versions, create receipts, or change accounts.",
            "",
        ]
        for item in items:
            first = item.get("firstSafeAction") if isinstance(item.get("firstSafeAction"), dict) else {}
            details = item.get("handoffDetails") if isinstance(item.get("handoffDetails"), list) else []
            lines.extend([
                f"## {item['title']}",
                "",
                f"- Lane: `{item['lane']}`",
                f"- Severity: `{item['severity']}`",
                f"- Status: `{item['status']}`",
                f"- What it means: {item['plainEnglish']}",
                f"- Human ask: {item['humanAsk']}",
                f"- Codex can continue with: {item['agentCanContinueWith']}",
                f"- First safe action: `{first.get('command', '')}`",
                f"- Next safest action: {item['nextSafestAction']}",
                "",
            ])
            option_lines = decision_option_lines(item)
            if option_lines:
                lines.append("- Decision options:")
                for option_line in option_lines:
                    lines.append(f"  - {option_line}")
            for detail in details[:10]:
                lines.append(f"- Detail: {detail}")
            if option_lines or details:
                lines.append("")
        path.write_text("\n".join(lines), encoding="utf-8")
    return packet_paths


def main() -> None:
    payload = build_payload()
    payload["humanAsk"] = HUMAN_ASK
    payload["agentSafeParallelWork"] = AGENT_SAFE_PARALLEL_WORK
    output_root = DEFAULT_OUTPUT_ROOT if DEFAULT_OS_ROOT.exists() else Path("/tmp/quipslystudio-human-help-board")
    session_dir = output_root / stamp()
    json_path = session_dir / "quipsly-human-help-board.json"
    markdown_path = session_dir / "START-HERE-quipsly-human-help-board.md"
    csv_path = session_dir / "quipsly-human-help-board.csv"
    html_path = session_dir / "index.html"
    payload.update({
        "sessionDir": str(session_dir),
        "jsonPath": str(json_path),
        "markdownPath": str(markdown_path),
        "csvPath": str(csv_path),
        "htmlPath": str(html_path),
        "pointerPath": str(LATEST_POINTER),
    })
    payload["ownerPacketPaths"] = write_owner_packets(session_dir, payload)
    payload["firstSafeAction"] = {
        "label": "Open Quipsly human help board",
        "command": f"open {shell_quote(str(html_path))}",
        "path": str(html_path),
        "safety": "Opens local help/review evidence only. Does not publish, upload, schedule, delete, mutate originals, overwrite versions, create receipts, or change accounts.",
    }
    session_dir.mkdir(parents=True, exist_ok=True)
    write_json(json_path, payload)
    write_markdown(markdown_path, payload)
    write_csv(csv_path, payload["items"])
    write_html(html_path, payload)
    pointer = {
        "schema": SCHEMA,
        "updatedAt": payload["generatedAt"],
        "status": payload["status"],
        "counts": payload["counts"],
        "jsonPath": str(json_path),
        "markdownPath": str(markdown_path),
        "csvPath": str(csv_path),
        "htmlPath": str(html_path),
        "sessionDir": str(session_dir),
        "ownerPacketPaths": payload["ownerPacketPaths"],
        "firstSafeAction": payload["firstSafeAction"],
        "humanAsk": payload["humanAsk"],
        "agentSafeParallelWork": payload["agentSafeParallelWork"],
        "nextSafestAction": payload["nextSafestAction"],
        "truth": payload["truth"],
    }
    write_json(LATEST_POINTER, pointer)
    print(json.dumps(pointer, indent=2, sort_keys=True))


if __name__ == "__main__":
    main()
