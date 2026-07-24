#!/usr/bin/env python3
"""Build one calm Tower publication control room.

This is a local operator front door over Tower's existing publishing runway,
review sheet, publisher desk, manual packet board, calendar, social command
center, and receipt slots. It never publishes, uploads, schedules, approves,
mutates accounts, overwrites versions, or creates receipt truth.
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

DEFAULT_RELEASE_ROOT = Path("/Volumes/My Passport/Episode_and_Shorts_Test")
SCHEMA = "quipsly.tower.publication-control-room.v1"
LATEST_NAME = "latest-tower-publication-control-room.json"

SOURCE_POINTERS = [
    ("publishingSprint", "Tower publishing sprint", "tower-publishing-sprint/latest-tower-publishing-sprint-companion.json"),
    ("publisherDesk", "Publisher desk", "tower-publisher-desk/latest-tower-publisher-desk.json"),
    ("manualPacketBoard", "Manual packet board", "tower-manual-packet-board/latest-tower-manual-packet-board.json"),
    ("socialCommandCenter", "Social command center", "tower-social-command-center/latest-tower-social-command-center.json"),
    ("manualCalendar", "Manual publishing calendar", "tower-manual-calendar/latest-tower-manual-calendar.json"),
    ("reviewCommandSheet", "Review command sheet", "review-board/tower-review-command-sheets/latest-tower-review-command-sheet.json"),
    ("reviewUnblockBrief", "Review unblock brief", "tower-review-unblock-brief/latest-tower-review-unblock-brief.json"),
    ("reviewAnomalies", "Review anomalies", "review-board/tower-review-anomalies/latest-tower-review-anomalies.json"),
    ("studioTopReview", "Studio top review gate", "review-board/latest-studio-top-review-companion.json"),
    ("studioReviewWorkSession", "Studio episode package runway", "review-board/studio-review-work-sessions/latest-studio-review-work-session.json"),
    ("studioSyncControl", "Studio sync control room", "review-board/latest-sync-control-room.json"),
]

EXTERNAL_CONTROL_ROOMS = [
    (
        "nestWritingControl",
        "Nest writing first session",
        Path("/Volumes/My Passport/Quipsly Media Workspace/NestWriting/latest-nest-writing-control-room.json"),
    ),
    (
        "photoGroveControl",
        "Photo Grove 20-minute cull sprint",
        Path("/Volumes/My Passport/Quipsly Media Workspace/PhotoGrove/latest-photo-grove-control-room.json"),
    ),
    (
        "studio360Control",
        "Studio360 proof continuation",
        Path("/Volumes/My Passport/Quipsly Media Workspace/Studio360/latest-studio360-proof-control-room.json"),
    ),
]


def iso_now() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def stamp() -> str:
    return datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S-%f-tower-publication-control-room")


def load_json(path: Path) -> dict[str, Any]:
    if not path.exists():
        return {}
    try:
        value = json.loads(path.read_text(encoding="utf-8"))
        return value if isinstance(value, dict) else {}
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
    target_text = str(pointer.get("jsonPath") or "")
    target_path = Path(target_text) if target_text else None
    target = load_json(target_path) if target_path and target_path.exists() else {}
    packet = {**pointer, **target} if target else pointer
    return pointer, packet, target_path


def first_open(payload: dict[str, Any]) -> dict[str, str]:
    first = payload.get("firstSafeAction") if isinstance(payload.get("firstSafeAction"), dict) else {}
    path = str(first.get("path") or payload.get("worksheetPath") or payload.get("htmlPath") or payload.get("markdownPath") or payload.get("jsonPath") or "")
    command = str(first.get("command") or (f"open {shell_quote(path)}" if path else ""))
    return {
        "label": str(first.get("label") or "Open local Tower evidence"),
        "command": command,
        "path": path,
        "safety": str(first.get("safety") or "Opens local Tower evidence only. No publish, upload, schedule, approval, account mutation, overwrite, or receipt capture occurs."),
    }


def load_sources(release_root: Path) -> dict[str, dict[str, Any]]:
    sources: dict[str, dict[str, Any]] = {}
    for source_id, label, rel in SOURCE_POINTERS:
        pointer_path = release_root / rel
        pointer, packet, target_path = resolve_pointer(pointer_path)
        counts = packet.get("counts") if isinstance(packet.get("counts"), dict) else {}
        sources[source_id] = {
            "id": source_id,
            "label": label,
            "pointerPath": str(pointer_path),
            "targetJsonPath": str(target_path or ""),
            "exists": bool(pointer),
            "status": packet.get("status") or ("missing" if not pointer_path.exists() else "unknown"),
            "htmlPath": packet.get("htmlPath") or pointer.get("htmlPath") or "",
            "jsonPath": packet.get("jsonPath") or pointer.get("jsonPath") or str(target_path or ""),
            "markdownPath": packet.get("markdownPath") or pointer.get("markdownPath") or "",
            "csvPath": packet.get("csvPath") or pointer.get("csvPath") or "",
            "worksheetPath": packet.get("worksheetPath") or pointer.get("worksheetPath") or "",
            "counts": counts,
            "priorityReviewQueue": packet.get("priorityReviewQueue") if isinstance(packet.get("priorityReviewQueue"), list) else [],
            "episodePackageRunway": packet.get("episodePackageRunway") if isinstance(packet.get("episodePackageRunway"), list) else [],
            "episodePackageRunwayPath": packet.get("episodePackageRunwayPath") or "",
            "humanReviewerRunwayPath": packet.get("humanReviewerRunwayPath") or "",
            "reviewerReturnHandoffPath": packet.get("reviewerReturnHandoffPath") or "",
            "reviewDecisionCardsPath": packet.get("reviewDecisionCardsPath") or "",
            "reviewWorksheetPath": packet.get("reviewWorksheetPath") or "",
            "workTasks": packet.get("workTasks") if isinstance(packet.get("workTasks"), list) else [],
            "studioUnblockCockpit": packet.get("studioUnblockCockpit") if isinstance(packet.get("studioUnblockCockpit"), dict) else {},
            "reviewStateMachine": packet.get("reviewStateMachine") if isinstance(packet.get("reviewStateMachine"), dict) else {},
            "towerBoundary": packet.get("towerBoundary") if isinstance(packet.get("towerBoundary"), dict) else {},
            "nextSafestAction": packet.get("nextSafestAction") or "Open local evidence and keep publication truth separate from review truth.",
            "firstSafeAction": first_open(packet),
            "truth": packet.get("truth") or "Local Tower evidence only. Not an external publication receipt.",
        }
    return sources


def load_external_control_rooms() -> dict[str, dict[str, Any]]:
    rooms: dict[str, dict[str, Any]] = {}
    for room_id, label, pointer_path in EXTERNAL_CONTROL_ROOMS:
        pointer = load_json(pointer_path)
        target_text = str(pointer.get("jsonPath") or "")
        target_path = Path(target_text) if target_text else None
        target = load_json(target_path) if target_path and target_path.exists() else {}
        packet = {**pointer, **target} if target else pointer
        rooms[room_id] = {
            "id": room_id,
            "label": label,
            "pointerPath": str(pointer_path),
            "targetJsonPath": str(target_path or ""),
            "exists": bool(pointer),
            "status": packet.get("status") or ("missing" if not pointer_path.exists() else "unknown"),
            "stage": packet.get("stage") or "",
            "htmlPath": packet.get("htmlPath") or pointer.get("htmlPath") or "",
            "jsonPath": packet.get("jsonPath") or pointer.get("jsonPath") or str(target_path or ""),
            "markdownPath": packet.get("markdownPath") or pointer.get("markdownPath") or "",
            "firstWritingSessionNotePath": packet.get("firstWritingSessionNotePath") or pointer.get("firstWritingSessionNotePath") or "",
            "firstLocalDecisionNoteTemplate": packet.get("firstLocalDecisionNoteTemplate") if isinstance(packet.get("firstLocalDecisionNoteTemplate"), dict) else {},
            "twentyMinuteCullSprint": packet.get("twentyMinuteCullSprint") if isinstance(packet.get("twentyMinuteCullSprint"), dict) else {},
            "readyContinuationPlan": packet.get("readyContinuationPlan") if isinstance(packet.get("readyContinuationPlan"), dict) else {},
            "firstSafeAction": first_open(packet),
            "nextSafestAction": packet.get("nextSafestAction") or "Open local control-room evidence and continue safely.",
            "humanAsk": packet.get("humanAsk") or "",
            "agentSafeParallelWork": packet.get("agentSafeParallelWork") or "",
            "counts": packet.get("counts") if isinstance(packet.get("counts"), dict) else {},
            "truth": packet.get("truth") or packet.get("truthDescription") or "Local control-room evidence only.",
        }
    return rooms


def count_from_sources(sources: dict[str, dict[str, Any]], key: str) -> int:
    values = []
    for source in sources.values():
        counts = source.get("counts") if isinstance(source.get("counts"), dict) else {}
        if key in counts:
            values.append(safe_int(counts.get(key)))
    return max(values) if values else 0


def derive_stage(counts: dict[str, int]) -> tuple[str, str, str]:
    if counts["capturedReceipts"]:
        return (
            "receipt-review",
            "Some receipts are captured. Verify those URLs/provider IDs before analytics or public claims.",
            "Verify receipts and add analytics placeholders. Do not infer performance without data.",
        )
    if counts["readyForApproval"]:
        return (
            "explicit-approval-needed",
            "Some packets are locally ready, but external publishing still needs Charlie's exact approval.",
            "Prepare copy/paste packets and receipt slots; wait for explicit approval before any external action.",
        )
    if counts["studioGateItems"] or counts["pendingRows"] or counts["warningRows"] or counts["blockedOrReview"]:
        return (
            "review-gated",
            "Tower has useful packets, but local review/sync/warning evidence must be classified before approval.",
            "Open the review gate first, then keep platform packets as draft/manual prep.",
        )
    return (
        "packet-prep",
        "No approval-ready rows or receipt truth are present. Prepare packets and keep receipts empty.",
        "Improve packet clarity, metadata, and calendar intent without external actions.",
    )


def start_here_today(stage: str, sources: dict[str, dict[str, Any]], counts: dict[str, int]) -> dict[str, Any]:
    if stage == "review-gated":
        top_review = sources.get("studioTopReview") or {}
        unblock = sources.get("reviewUnblockBrief") or {}
        source = top_review if (top_review.get("htmlPath") or top_review.get("jsonPath")) else unblock
        action = source.get("firstSafeAction") if isinstance(source.get("firstSafeAction"), dict) else {}
        priority_queue = top_review.get("priorityReviewQueue") if isinstance(top_review.get("priorityReviewQueue"), list) else []
        unblock_cockpit = top_review.get("studioUnblockCockpit") if isinstance(top_review.get("studioUnblockCockpit"), dict) else {}
        boundary = top_review.get("towerBoundary") if isinstance(top_review.get("towerBoundary"), dict) else {}
        return {
            "mode": "clear-review-gate",
            "title": source.get("label") or "Studio review gate",
            "why": "Tower has useful platform packets, but they stay draft-only until Studio review/sync/duration evidence is classified.",
            "recommendedMove": "open-review-evidence-before-platform-packets",
            "safeCommand": action.get("command") or (f"open {shell_quote(str(source.get('htmlPath') or ''))}" if source.get("htmlPath") else ""),
            "humanQuestion": "Should the current review blocker be promoted, refined, held, or investigated before any platform packet becomes approval-ready?",
            "agentMove": "Summarize review evidence, improve packet clarity, and prepare dry-run review/receipt commands without external action.",
            "reviewGateQueue": priority_queue,
            "studioUnblockCockpit": unblock_cockpit,
            "towerBoundary": boundary,
            "countsContext": {
                "blockedOrReview": counts.get("blockedOrReview", 0),
                "pendingRows": counts.get("pendingRows", 0),
                "warningRows": counts.get("warningRows", 0),
                "readyForApproval": counts.get("readyForApproval", 0),
                "capturedReceipts": counts.get("capturedReceipts", 0),
            },
        }
    if stage == "explicit-approval-needed":
        publisher = sources.get("publisherDesk") or {}
        action = publisher.get("firstSafeAction") if isinstance(publisher.get("firstSafeAction"), dict) else {}
        return {
            "mode": "ask-explicit-approval",
            "title": "Approval-ready local packets",
            "why": "Some local packets appear ready, but Tower still needs exact human approval for item/platform/version before any posting.",
            "recommendedMove": "request-specific-human-approval",
            "safeCommand": action.get("command") or (f"open {shell_quote(str(publisher.get('htmlPath') or ''))}" if publisher.get("htmlPath") else ""),
            "humanQuestion": "Which exact item, platform, and version is approved for manual posting?",
            "agentMove": "Prepare copy/paste packet and receipt slot; do not post, schedule, upload, or create receipt truth.",
            "countsContext": {
                "readyForApproval": counts.get("readyForApproval", 0),
                "receiptSlots": counts.get("receiptSlots", 0),
                "capturedReceipts": counts.get("capturedReceipts", 0),
            },
        }
    if stage == "receipt-review":
        publisher = sources.get("publisherDesk") or {}
        action = publisher.get("firstSafeAction") if isinstance(publisher.get("firstSafeAction"), dict) else {}
        return {
            "mode": "verify-receipts",
            "title": "Captured receipt review",
            "why": "Receipt rows exist; verify real URLs/provider IDs before analytics or public claims.",
            "recommendedMove": "verify-provider-receipts",
            "safeCommand": action.get("command") or (f"open {shell_quote(str(publisher.get('htmlPath') or ''))}" if publisher.get("htmlPath") else ""),
            "humanQuestion": "Does each receipt point to a real external platform artifact?",
            "agentMove": "Validate receipt fields and prepare analytics placeholders without inventing performance data.",
            "countsContext": {
                "capturedReceipts": counts.get("capturedReceipts", 0),
                "receiptSlots": counts.get("receiptSlots", 0),
            },
        }
    sprint = sources.get("publishingSprint") or {}
    action = sprint.get("firstSafeAction") if isinstance(sprint.get("firstSafeAction"), dict) else {}
    return {
        "mode": "packet-prep",
        "title": "Publishing sprint",
        "why": "Keep improving local packets, copy, metadata, and calendar intent while receipt truth remains empty.",
        "recommendedMove": "improve-local-packets",
        "safeCommand": action.get("command") or (f"open {shell_quote(str(sprint.get('htmlPath') or ''))}" if sprint.get("htmlPath") else ""),
        "humanQuestion": "What packet/copy/calendar artifact would make later publishing calmer?",
        "agentMove": "Improve metadata, packet clarity, and validation without external platform action.",
        "countsContext": {
            "socialItems": counts.get("socialItems", 0),
            "calendarRows": counts.get("calendarRows", 0),
            "capturedReceipts": counts.get("capturedReceipts", 0),
        },
    }


def build_artifact_cards(sources: dict[str, dict[str, Any]]) -> list[dict[str, Any]]:
    order = [source_id for source_id, _, _ in SOURCE_POINTERS]
    cards: list[dict[str, Any]] = []
    for source_id in order:
        source = sources.get(source_id, {})
        if not source:
            continue
        counts = source.get("counts") if isinstance(source.get("counts"), dict) else {}
        cards.append({
            "id": source_id,
            "label": source.get("label") or source_id,
            "status": source.get("status") or "unknown",
            "htmlPath": source.get("htmlPath") or "",
            "jsonPath": source.get("jsonPath") or "",
            "markdownPath": source.get("markdownPath") or "",
            "worksheetPath": source.get("worksheetPath") or "",
            "counts": counts,
            "firstSafeAction": source.get("firstSafeAction") or {},
            "nextSafestAction": source.get("nextSafestAction") or "Open local evidence and continue safely.",
            "whyItMatters": why_it_matters(source_id),
            "truth": source.get("truth") or "Local evidence only.",
        })
    return cards


def why_it_matters(source_id: str) -> str:
    return {
        "publishingSprint": "One joined sprint view for the launch runway.",
        "publisherDesk": "Publisher-facing summary of review, platform packet, calendar, and receipt truth.",
        "manualPacketBoard": "Human-readable manual posting packets once review and approval are clear.",
        "socialCommandCenter": "Hootsuite-like draft queue without external scheduling claims.",
        "manualCalendar": "Draft calendar intent only; no external schedule exists.",
        "reviewCommandSheet": "Local artifact decisions before any platform trust.",
        "reviewUnblockBrief": "The current review blockers, not a generic todo list.",
        "reviewAnomalies": "Smoke/test holds and suspicious review states that need cleanup.",
        "studioTopReview": "Studio quality gate before Tower gets to pretend it is close to launch.",
        "studioReviewWorkSession": "One row per episode showing package readiness, review target, safe action, and receipt boundary before Tower approval.",
        "studioSyncControl": "Episode sync/tail classification evidence before publish trust.",
    }.get(source_id, "Local Tower evidence.")


def build_production_launchers(sources: dict[str, dict[str, Any]], external_rooms: dict[str, dict[str, Any]]) -> list[dict[str, Any]]:
    launchers: list[dict[str, Any]] = []
    studio = sources.get("studioTopReview") or {}
    studio_template = studio.get("firstLocalDecisionNoteTemplate") if isinstance(studio.get("firstLocalDecisionNoteTemplate"), dict) else {}
    studio_first = studio.get("firstSafeAction") if isinstance(studio.get("firstSafeAction"), dict) else {}
    launchers.append({
        "id": "studio-review-decision-note",
        "lane": "Studio",
        "label": "Record the next Studio review decision",
        "status": studio.get("status") or "missing",
        "path": studio.get("worksheetPath") or studio.get("htmlPath") or "",
        "command": studio_first.get("command") or (f"open {shell_quote(str(studio.get('htmlPath') or ''))}" if studio.get("htmlPath") else ""),
        "whatItDoes": "Opens the Studio review gate and gives reviewers a copyable local decision note for Episode 1/4 blockers.",
        "firstHumanQuestion": studio_template.get("title") or "Which local review decision is supported by the evidence?",
        "agentSafeWork": studio.get("nextSafestAction") or "Summarize review evidence without changing package/publication truth.",
        "explicitNonClaims": ["not published", "not approved", "not scheduled", "no receipt truth"],
        "truth": "Local Studio review evidence only. Does not promote, publish, upload, schedule, capture receipts, overwrite, delete, or mutate media.",
    })
    nest = external_rooms.get("nestWritingControl") or {}
    launchers.append({
        "id": "nest-first-writing-session",
        "lane": "Nest",
        "label": "Open the first source-backed writing session",
        "status": nest.get("status") or "missing",
        "path": nest.get("firstWritingSessionNotePath") or nest.get("htmlPath") or "",
        "command": f"open {shell_quote(str(nest.get('firstWritingSessionNotePath')))}" if nest.get("firstWritingSessionNotePath") else (nest.get("firstSafeAction") or {}).get("command", ""),
        "whatItDoes": "Starts one 25-minute book/article writing pass with source trail visible.",
        "firstHumanQuestion": "What should change in this source-backed draft before canon or publication?",
        "agentSafeWork": nest.get("agentSafeParallelWork") or "Draft, compare, outline, and prepare revision notes without replacing canon.",
        "explicitNonClaims": ["not canonical manuscript replacement", "not published", "not approved", "no receipt truth"],
        "truth": "Local writing session only. Drafting/rewriting is allowed, but source files and canonical manuscript truth remain separate.",
    })
    photo = external_rooms.get("photoGroveControl") or {}
    sprint = photo.get("twentyMinuteCullSprint") if isinstance(photo.get("twentyMinuteCullSprint"), dict) else {}
    launchers.append({
        "id": "photo-grove-cull-sprint",
        "lane": "Photo Grove",
        "label": "Run a 20-minute photo cull sprint",
        "status": photo.get("status") or "missing",
        "path": photo.get("htmlPath") or "",
        "command": (photo.get("firstSafeAction") or {}).get("command", ""),
        "whatItDoes": sprint.get("headline") or "Routes first cull candidates through visual review and dry-run metadata decisions.",
        "firstHumanQuestion": "Which candidate should be keep/review/reject/favorite after seeing source/neighbor context?",
        "agentSafeWork": photo.get("agentSafeParallelWork") or "Improve cull grouping and dry-run evidence without writing metadata.",
        "explicitNonClaims": ["not delivered", "not selected for proof", "no metadata write", "no original mutation"],
        "truth": "Photo cull sprint only. It does not mutate originals, execute cull decisions, deliver, upload, publish, schedule, or create receipts.",
    })
    studio360 = external_rooms.get("studio360Control") or {}
    continuation = studio360.get("readyContinuationPlan") if isinstance(studio360.get("readyContinuationPlan"), dict) else {}
    launchers.append({
        "id": "studio360-proof-continuation",
        "lane": "360",
        "label": "Continue 360 proof work while repair tickets stay parked",
        "status": studio360.get("status") or "missing",
        "path": studio360.get("htmlPath") or "",
        "command": (studio360.get("firstSafeAction") or {}).get("command", "") or (f"open {shell_quote(str(studio360.get('htmlPath') or ''))}" if studio360.get("htmlPath") else ""),
        "whatItDoes": continuation.get("headline") or "Opens ready 360 proof/reframe work without forcing damaged assets through the lane.",
        "firstHumanQuestion": "Which ready 360 proof should be watched before full render approval?",
        "agentSafeWork": studio360.get("agentSafeParallelWork") or "Create/review local proof evidence while repair tickets remain visible.",
        "explicitNonClaims": ["not final render approved", "not published", "repair tickets not resolved", "no receipt truth"],
        "truth": "360 proof continuation only. Does not mutate originals, force damaged assets, publish, upload, schedule, or create receipts.",
    })
    return launchers


def approval_request_template(stage: str, counts: dict[str, Any], today: dict[str, Any], gate: dict[str, Any]) -> dict[str, Any]:
    queue = gate.get("queue") if isinstance(gate.get("queue"), list) else []
    blockers = []
    for item in queue[:5]:
        if not isinstance(item, dict):
            continue
        title = str(item.get("title") or "Review item")
        question = str(item.get("humanQuestion") or "")
        done_when = str(item.get("doneWhen") or "")
        blockers.append({
            "title": title,
            "humanQuestion": question,
            "doneWhen": done_when,
        })
    approval_allowed = stage == "explicit-approval-needed"
    status_line = "APPROVAL-READY PACKET" if approval_allowed else "NOT READY FOR APPROVAL YET"
    blocker_lines = "\n".join(
        f"- {item['title']}: {item['humanQuestion']} Done when: {item['doneWhen']}"
        for item in blockers
    ) or "- No Studio blocker list was available in this control room."
    markdown = f"""# Quipsly Tower approval request

Status: {status_line}

Request:
Please approve one exact item/platform/version only after reviewing the linked local packet.

Exact artifact:
- Artifact or short ID:
- Episode:
- Version:
- Platform:
- Requested action:
- Local packet path:

Current review context:
- Tower stage: {stage}
- Ready for approval count: {counts.get('readyForApproval', 0)}
- Blocked or review count: {counts.get('blockedOrReview', 0)}
- Warning rows: {counts.get('warningRows', 0)}
- Human question: {today.get('humanQuestion') or ''}

Known blockers before approval:
{blocker_lines}

Approval language, if and only if reviewed:
I approve this exact artifact/version/platform for manual publication. I understand this approval does not publish anything by itself.

Safety:
This template is a copy/paste request only. It does not approve, publish, schedule, upload, mutate accounts, or create receipt truth.
"""
    return {
        "schema": "quipsly.tower.approval-request-template.v1",
        "stage": stage,
        "approvalAllowedNow": approval_allowed,
        "readyForApproval": counts.get("readyForApproval", 0),
        "blockedOrReview": counts.get("blockedOrReview", 0),
        "warningRows": counts.get("warningRows", 0),
        "humanQuestion": today.get("humanQuestion") or "",
        "blockers": blockers,
        "markdownTemplate": markdown,
        "truth": "Template only. It does not approve, publish, schedule, upload, mutate accounts, or create receipts.",
    }


def receipt_capture_template(counts: dict[str, Any]) -> dict[str, Any]:
    markdown = """# Quipsly Tower receipt capture

Use this only after a human-approved manual publication actually happened.

Receipt fields:
- Platform:
- Artifact or short ID:
- Episode:
- Version:
- Public URL:
- Provider receipt/post/video ID:
- Published at:
- Published by:
- Approval evidence:
- Notes:

Truth boundary:
This template is not a receipt. Receipt truth begins only when a real external URL or provider ID from the platform is captured after the approved manual publication.
"""
    return {
        "schema": "quipsly.tower.receipt-capture-template.v1",
        "receiptSlots": counts.get("receiptSlots", 0),
        "capturedReceipts": counts.get("capturedReceipts", 0),
        "requiredFields": [
            "platform",
            "artifactId",
            "episode",
            "version",
            "publicUrl",
            "providerReceiptId",
            "publishedAt",
            "publishedBy",
            "approvalEvidence",
            "notes",
        ],
        "markdownTemplate": markdown,
        "truth": "Template only. Receipt truth begins only when a real external URL/provider ID is captured after approved manual publication.",
    }


def build_publication_approval_gate(
    stage: str,
    counts: dict[str, Any],
    today: dict[str, Any],
    studio_review_gate: dict[str, Any],
) -> dict[str, Any]:
    review_count = safe_int(counts.get("blockedOrReview")) + safe_int(counts.get("pendingRows")) + safe_int(counts.get("warningRows")) + safe_int(counts.get("studioGateItems"))
    ready_count = safe_int(counts.get("readyForApproval"))
    receipt_count = safe_int(counts.get("capturedReceipts"))
    approval_allowed = stage == "explicit-approval-needed" and ready_count > 0
    receipt_review = receipt_count > 0
    if receipt_review:
        state = "receipt-review"
        message = "Some real receipt rows appear to exist. Verify provider URLs/IDs before analytics or public claims."
    elif approval_allowed:
        state = "approval-request-ready"
        message = "Local packets may be ready for a specific human approval request. This still does not publish anything."
    elif review_count:
        state = "review-gated-no-approval"
        message = "Tower packets stay draft-only until Studio review, sync, warning, or blocker evidence is resolved."
    else:
        state = "packet-prep-no-approval"
        message = "Packets can be improved locally, but no external action should happen until exact approval is requested."
    return {
        "schema": "quipsly.tower.publication-approval-gate.v1",
        "state": state,
        "message": message,
        "stage": stage,
        "humanApprovalRequired": True,
        "approvalAllowedNow": approval_allowed,
        "receiptCaptureAllowedNow": receipt_review,
        "reviewEvidenceStillMatters": review_count > 0,
        "countsContext": {
            "readyForApproval": ready_count,
            "blockedOrReview": counts.get("blockedOrReview", 0),
            "pendingRows": counts.get("pendingRows", 0),
            "warningRows": counts.get("warningRows", 0),
            "studioGateItems": counts.get("studioGateItems", 0),
            "receiptSlots": counts.get("receiptSlots", 0),
            "capturedReceipts": receipt_count,
        },
        "requiredBeforeExternalAction": [
            "Open the current Studio/Tower evidence linked by startHereToday.",
            "Resolve or explicitly hold review blockers, sync questions, duration warnings, and platform-copy concerns.",
            "Identify one exact artifact, version, platform, and requested manual action.",
            "Get Charlie or another authorized human to approve that exact item/action in plain language.",
            "Only after the real external action occurs, capture a receipt with a public URL or provider ID.",
        ],
        "receiptTruthBoundary": "A calendar row, queue row, packet, local export, or approval template is not receipt truth. Receipt truth starts only after a real external platform URL/provider ID exists.",
        "doNotDo": [
            "Do not upload, post, schedule, publish, send, or mutate accounts from this board.",
            "Do not infer approval from local readiness.",
            "Do not mark scheduled because a manual calendar draft exists.",
            "Do not create fake receipt rows for placeholders, local files, or intentions.",
            "Do not claim analytics or performance without platform evidence.",
        ],
        "humanQuestion": today.get("humanQuestion") or "What exact review or approval decision is safe next?",
        "studioGateStatus": studio_review_gate.get("status") or "missing",
        "truth": "Approval gate only. It blocks external claims/actions until exact approval and real receipt evidence exist.",
    }


def build_receipt_capture_ladder(
    stage: str,
    counts: dict[str, Any],
    sources: dict[str, dict[str, Any]],
    gate: dict[str, Any],
) -> list[dict[str, Any]]:
    def command_for(source_id: str) -> str:
        source = sources.get(source_id) or {}
        first = source.get("firstSafeAction") if isinstance(source.get("firstSafeAction"), dict) else {}
        return str(first.get("command") or "")

    def path_for(source_id: str) -> str:
        source = sources.get(source_id) or {}
        return str(source.get("htmlPath") or source.get("jsonPath") or "")

    review_gated = stage == "review-gated"
    approval_ready = stage == "explicit-approval-needed" and safe_int(counts.get("readyForApproval")) > 0
    receipt_review = safe_int(counts.get("capturedReceipts")) > 0
    return [
        {
            "step": 1,
            "lane": "Studio review",
            "label": "Classify review blockers before launch language",
            "state": "active" if review_gated else "watch",
            "meaning": "This is where duration, sync, and warning evidence prevents Tower from pretending packets are ready.",
            "safeCommand": command_for("studioTopReview") or command_for("reviewUnblockBrief"),
            "evidencePath": path_for("studioTopReview") or path_for("reviewUnblockBrief"),
            "doneWhen": "Each blocker is promoted, refined, held, or investigated with evidence.",
            "unsafeShortcut": "Treating platform packets as approval-ready while Studio evidence is unresolved.",
        },
        {
            "step": 2,
            "lane": "Packet review",
            "label": "Open manual packet board and platform copy",
            "state": "draft-ready" if safe_int(counts.get("socialItems")) else "needs-packets",
            "meaning": "This is copy/paste preparation only: platform metadata, copy, assets, and notes.",
            "safeCommand": command_for("manualPacketBoard") or command_for("socialCommandCenter"),
            "evidencePath": path_for("manualPacketBoard") or path_for("socialCommandCenter"),
            "doneWhen": "A human can tell what artifact/version/platform the packet is for.",
            "unsafeShortcut": "Using a draft packet as proof that anything has been posted or scheduled.",
        },
        {
            "step": 3,
            "lane": "Approval request",
            "label": "Ask for one exact human approval",
            "state": "available" if approval_ready else "locked",
            "meaning": "The request must name one artifact, version, platform, and action. Broad approval is not enough.",
            "safeCommand": command_for("publisherDesk"),
            "evidencePath": path_for("publisherDesk"),
            "doneWhen": "Charlie or an authorized human approves the exact item/action in reviewable text.",
            "unsafeShortcut": "Assuming approval because a packet looks good or a calendar row exists.",
        },
        {
            "step": 4,
            "lane": "Manual publishing",
            "label": "Perform the external action outside Tower only after approval",
            "state": "human-only-after-approval",
            "meaning": "Tower can guide the human, but this script still does not upload, schedule, post, or mutate external accounts.",
            "safeCommand": command_for("manualCalendar"),
            "evidencePath": path_for("manualCalendar"),
            "doneWhen": "The external platform confirms the artifact exists or is scheduled with a real URL/provider ID.",
            "unsafeShortcut": "Letting automation cross the account boundary without exact approval.",
        },
        {
            "step": 5,
            "lane": "Receipt truth",
            "label": "Capture the real URL/provider ID after publication",
            "state": "review-receipts" if receipt_review else "empty-slots",
            "meaning": "Receipt truth is evidence from a platform, not a local intention.",
            "safeCommand": command_for("publisherDesk"),
            "evidencePath": path_for("publisherDesk"),
            "doneWhen": "Receipt rows contain real public URLs/provider IDs, approval evidence, and notes.",
            "unsafeShortcut": "Creating receipt truth for local files, placeholders, or planned posts.",
        },
    ]


def build_next_decision_deck(
    stage: str,
    counts: dict[str, Any],
    sources: dict[str, dict[str, Any]],
    gate: dict[str, Any],
    today: dict[str, Any],
) -> list[dict[str, Any]]:
    def source_open(source_id: str) -> tuple[str, str]:
        source = sources.get(source_id) or {}
        first = source.get("firstSafeAction") if isinstance(source.get("firstSafeAction"), dict) else {}
        command = str(first.get("command") or "")
        path = str(source.get("htmlPath") or source.get("worksheetPath") or source.get("jsonPath") or "")
        if not command and path:
            command = f"open {shell_quote(path)}"
        return command, path

    review_queue = gate.get("queue") if isinstance(gate.get("queue"), list) else []
    first_review = review_queue[0] if review_queue and isinstance(review_queue[0], dict) else {}
    review_command = str(first_review.get("firstEvidenceCommand") or today.get("safeCommand") or source_open("studioTopReview")[0] or source_open("reviewUnblockBrief")[0])
    review_path = str(gate.get("htmlPath") or source_open("studioTopReview")[1] or source_open("reviewUnblockBrief")[1])
    manual_packet_command, manual_packet_path = source_open("manualPacketBoard")
    social_command, social_path = source_open("socialCommandCenter")
    publisher_command, publisher_path = source_open("publisherDesk")
    calendar_command, calendar_path = source_open("manualCalendar")

    review_count = safe_int(counts.get("blockedOrReview")) + safe_int(counts.get("pendingRows")) + safe_int(counts.get("warningRows")) + safe_int(counts.get("studioGateItems"))
    ready_count = safe_int(counts.get("readyForApproval"))
    receipt_slots = safe_int(counts.get("receiptSlots"))
    captured_receipts = safe_int(counts.get("capturedReceipts"))
    approval_unlocked = stage == "explicit-approval-needed" and ready_count > 0 and review_count == 0

    return [
        {
            "rank": 1,
            "id": "classify-studio-review-gate",
            "title": "Classify the first Studio review gate",
            "state": "active" if review_count else "watch",
            "owner": "Mako or Charlie",
            "canDoNow": "Open the evidence and decide promote, refine, hold, or investigate for the first blocker.",
            "notAllowedYet": "Do not approve platform publishing while review/sync/duration warnings are unresolved.",
            "humanQuestion": first_review.get("humanQuestion") or today.get("humanQuestion") or "What evidence-supported review decision is safest next?",
            "doneWhen": first_review.get("doneWhen") or "The current blocker has a clear local decision and next action.",
            "safeCommand": review_command,
            "evidencePath": review_path,
            "receiptTruth": "none",
        },
        {
            "rank": 2,
            "id": "inspect-platform-packet",
            "title": "Inspect platform copy and manual packet",
            "state": "draft-ready" if safe_int(counts.get("socialItems")) else "needs-packet-work",
            "owner": "Charlie or Codex",
            "canDoNow": "Read/edit local title, description, captions, hashtags, calendar intent, and receipt-slot fields.",
            "notAllowedYet": "Do not treat draft copy, queue rows, or calendar rows as approved, scheduled, posted, or published.",
            "humanQuestion": "Can a human tell exactly what artifact, version, platform, and action this packet is for?",
            "doneWhen": "The packet is understandable enough to request one exact approval.",
            "safeCommand": manual_packet_command or social_command,
            "evidencePath": manual_packet_path or social_path,
            "receiptTruth": "none",
        },
        {
            "rank": 3,
            "id": "request-exact-approval",
            "title": "Request one exact approval",
            "state": "unlocked" if approval_unlocked else "locked",
            "owner": "Charlie",
            "canDoNow": "Use the approval template only when the exact artifact/version/platform/action is ready for a human yes/no.",
            "notAllowedYet": "Do not infer approval from readiness, prior conversation, local exports, or a good-looking packet.",
            "humanQuestion": "Which exact artifact, version, platform, and action is approved?",
            "doneWhen": "A human approval note names the exact artifact/version/platform/action.",
            "safeCommand": publisher_command,
            "evidencePath": publisher_path,
            "receiptTruth": "none",
        },
        {
            "rank": 4,
            "id": "manual-external-action",
            "title": "Perform the external action manually",
            "state": "human-only-after-approval",
            "owner": "Charlie",
            "canDoNow": "After exact approval, the human can use the prepared packet on the real platform outside this script.",
            "notAllowedYet": "This control room must not upload, post, schedule, send, or mutate accounts.",
            "humanQuestion": "Did the real platform create a public URL, scheduled-post proof, or provider ID?",
            "doneWhen": "The platform returns real evidence that can be recorded as a receipt.",
            "safeCommand": calendar_command,
            "evidencePath": calendar_path,
            "receiptTruth": "not yet",
        },
        {
            "rank": 5,
            "id": "capture-real-receipt",
            "title": "Capture receipt truth after the fact",
            "state": "ready-to-verify" if captured_receipts else "empty-slots",
            "owner": "Charlie or Codex after Charlie provides proof",
            "canDoNow": "Validate real URLs/provider IDs if they exist; otherwise keep receipt slots empty and honest.",
            "notAllowedYet": "Do not create receipt rows for placeholders, local files, intentions, or manual-calendar drafts.",
            "humanQuestion": "What real URL/provider ID proves the external action happened?",
            "doneWhen": "Receipt rows contain real platform evidence, approval evidence, and notes.",
            "safeCommand": publisher_command,
            "evidencePath": publisher_path,
            "receiptTruth": f"{captured_receipts} captured of {receipt_slots} slot(s)",
        },
    ]


def build_studio_tower_episode_handoff(sources: dict[str, dict[str, Any]]) -> dict[str, Any]:
    studio = sources.get("studioReviewWorkSession") or {}
    rows = studio.get("episodePackageRunway") if isinstance(studio.get("episodePackageRunway"), list) else []
    handoff_rows: list[dict[str, Any]] = []
    for raw in rows:
        if not isinstance(raw, dict):
            continue
        episode = safe_int(raw.get("episode"))
        readiness_status = str(raw.get("publishReadinessStatus") or "")
        publish_readiness = str(raw.get("publishReadiness") or "Needs review")
        duration_spread = safe_int(raw.get("durationSpreadSeconds"))
        pending_review = safe_int(raw.get("pendingReview"))
        warnings = safe_int(raw.get("warnings"))
        blockers = safe_int(raw.get("blockers"))
        if "duration" in readiness_status or duration_spread >= 2:
            tower_state = "duration-review-before-publish"
            next_gate = "Classify duration evidence before platform approval."
        elif "sync" in readiness_status:
            tower_state = "sync-review-before-publish"
            next_gate = "Resolve sync evidence before platform approval."
        elif blockers or warnings:
            tower_state = "warning-review-before-publish"
            next_gate = "Clear blockers/warnings or explicitly hold the package."
        elif pending_review or "human-review" in readiness_status or "review" in readiness_status:
            tower_state = "human-review-before-approval"
            next_gate = "Watch/listen and record a local review decision."
        elif "ready" in readiness_status:
            tower_state = "packet-ready-needs-explicit-approval"
            next_gate = "Request exact human approval before manual posting."
        else:
            tower_state = "review-state-unclear"
            next_gate = "Open the package and classify the local review state."

        receipt_status = str(raw.get("publicationReceiptStatus") or "no platform receipts captured")
        handoff_rows.append({
            "episode": episode,
            "label": raw.get("label") or f"Episode {episode}",
            "versionDisplay": raw.get("versionDisplay") or raw.get("currentBestVersion") or "",
            "currentBestVersion": raw.get("currentBestVersion") or "",
            "reviewTargetVersion": raw.get("reviewTargetVersion") or "",
            "towerState": tower_state,
            "publishReadiness": publish_readiness,
            "publishReadinessStatus": readiness_status,
            "reviewReadiness": raw.get("reviewReadiness") or "",
            "durationSpreadLabel": raw.get("durationSpreadLabel") or "",
            "durationSpreadSeconds": raw.get("durationSpreadSeconds") or 0,
            "pendingReview": pending_review,
            "warnings": warnings,
            "blockers": blockers,
            "readyShorts": safe_int(raw.get("readyShorts")),
            "receiptStatus": receipt_status,
            "hasReceiptTruth": receipt_status not in {"", "no platform receipts captured", "not_published", "not published"},
            "primaryActionLabel": raw.get("primaryActionLabel") or "Open package evidence",
            "primaryActionCommand": raw.get("primaryActionCommand") or raw.get("openPackageCommand") or "",
            "primaryActionPath": raw.get("primaryActionPath") or raw.get("versionDir") or "",
            "openPackageCommand": raw.get("openPackageCommand") or "",
            "manifestPath": raw.get("manifestPath") or "",
            "notesPath": raw.get("notesPath") or "",
            "video16x9Path": raw.get("video16x9Path") or "",
            "video9x16Path": raw.get("video9x16Path") or "",
            "podcastAudioPath": raw.get("podcastAudioPath") or "",
            "shortsDir": raw.get("shortsDir") or "",
            "dryRunReviewCommand": raw.get("dryRunReviewCommand") or "",
            "humanAsk": raw.get("humanAsk") or "Review local package evidence before Tower approval.",
            "nextGate": next_gate,
            "towerImplication": (
                "Tower can prepare platform packets and receipt slots, but cannot approve, post, schedule, upload, "
                "or claim publication until this row is reviewed and explicitly approved."
            ),
            "truth": raw.get("truth") or "Local Studio/Tower handoff row only. No publish, upload, approval, schedule, or receipt truth.",
        })

    counts = {
        "episodes": len(handoff_rows),
        "durationReviewRows": sum(1 for row in handoff_rows if row["towerState"] == "duration-review-before-publish"),
        "syncReviewRows": sum(1 for row in handoff_rows if row["towerState"] == "sync-review-before-publish"),
        "warningReviewRows": sum(1 for row in handoff_rows if row["towerState"] == "warning-review-before-publish"),
        "humanReviewRows": sum(1 for row in handoff_rows if row["towerState"] == "human-review-before-approval"),
        "packetReadyNeedsApprovalRows": sum(1 for row in handoff_rows if row["towerState"] == "packet-ready-needs-explicit-approval"),
        "receiptTruthRows": sum(1 for row in handoff_rows if row["hasReceiptTruth"]),
        "readyShorts": sum(safe_int(row.get("readyShorts")) for row in handoff_rows),
    }
    if counts["durationReviewRows"] or counts["syncReviewRows"] or counts["warningReviewRows"]:
        first_move = "Clear duration/sync/warning evidence before treating any episode as approval-ready."
    elif counts["humanReviewRows"]:
        first_move = "Watch/listen reviewable episodes and record local review decisions before Tower approval."
    elif counts["packetReadyNeedsApprovalRows"]:
        first_move = "Prepare exact approval requests for packet-ready rows; still do not publish from this board."
    else:
        first_move = "Open the Studio episode package runway and classify the current package evidence."
    return {
        "schema": "quipsly.tower.studio-episode-handoff.v1",
        "headline": "Studio package truth drives Tower launch readiness.",
        "plainEnglish": "Each episode remains a local package until human review and exact approval promote it. Tower may prepare platform packets, calendars, and receipt slots, but these rows prevent local readiness from becoming fake publication truth.",
        "sourceStatus": studio.get("status") or "missing",
        "sourceRunwayPath": studio.get("episodePackageRunwayPath") or "",
        "sourceReviewWorksheetPath": studio.get("reviewWorksheetPath") or "",
        "sourceHtmlPath": studio.get("htmlPath") or "",
        "firstSafeAction": studio.get("firstSafeAction") if isinstance(studio.get("firstSafeAction"), dict) else {},
        "counts": counts,
        "rows": handoff_rows,
        "firstMove": first_move,
        "truth": "Studio/Tower episode handoff only. It reads local package/review evidence and does not approve, publish, upload, schedule, mutate accounts, overwrite versions, mutate sources, or capture receipts.",
    }


def build_packet(release_root: Path) -> dict[str, Any]:
    sources = load_sources(release_root)
    external_rooms = load_external_control_rooms()
    production_launchers = build_production_launchers(sources, external_rooms)
    counts = {
        "episodes": count_from_sources(sources, "episodes"),
        "reviewRows": count_from_sources(sources, "reviewRows"),
        "pendingRows": count_from_sources(sources, "pendingRows"),
        "warningRows": count_from_sources(sources, "warningRows"),
        "blockedOrReview": count_from_sources(sources, "blockedOrReview"),
        "socialItems": count_from_sources(sources, "socialItems") or count_from_sources(sources, "items"),
        "calendarRows": count_from_sources(sources, "calendarRows"),
        "receiptSlots": count_from_sources(sources, "receiptSlots"),
        "capturedReceipts": count_from_sources(sources, "capturedReceipts"),
        "readyForApproval": count_from_sources(sources, "readyForApproval"),
        "studioGateItems": count_from_sources(sources, "studioTopReviewItems") or count_from_sources(sources, "reviewItems"),
        "durationCandidateItems": count_from_sources(sources, "studioTopReviewDurationCandidates") or count_from_sources(sources, "durationCandidateItems") or count_from_sources(sources, "durationCandidateReviewPackets"),
        "syncInvestigationItems": count_from_sources(sources, "studioTopReviewSyncInvestigations") or count_from_sources(sources, "syncInvestigationItems") or count_from_sources(sources, "syncInvestigationPackets"),
        "sourceBoardsPresent": sum(1 for source in sources.values() if source.get("htmlPath") or source.get("jsonPath")),
        "externalControlRoomsPresent": sum(1 for room in external_rooms.values() if room.get("htmlPath") or room.get("jsonPath")),
        "productionLaunchers": len(production_launchers),
        "firstSessionArtifacts": sum(1 for launcher in production_launchers if launcher.get("path")),
        "externalPublishing": False,
        "externalSchedulesCreated": False,
        "receiptTruthCreated": False,
        "accountMutation": False,
        "versionsOverwritten": False,
        "sourceFilesMutated": False,
    }
    stage, plain, next_action = derive_stage(counts)
    today = start_here_today(stage, sources, counts)
    top_review = sources.get("studioTopReview") or {}
    studio_work_session = sources.get("studioReviewWorkSession") or {}
    studio_work_counts = studio_work_session.get("counts") if isinstance(studio_work_session.get("counts"), dict) else {}
    studio_review_gate = {
        "status": top_review.get("status") or "missing",
        "htmlPath": top_review.get("htmlPath") or "",
        "jsonPath": top_review.get("jsonPath") or "",
        "workSessionHtmlPath": studio_work_session.get("htmlPath") or "",
        "workSessionJsonPath": studio_work_session.get("jsonPath") or "",
        "reviewerReturnHandoffPath": studio_work_session.get("reviewerReturnHandoffPath") or "",
        "humanReviewerRunwayPath": studio_work_session.get("humanReviewerRunwayPath") or "",
        "reviewDecisionCardsPath": studio_work_session.get("reviewDecisionCardsPath") or "",
        "reviewDecisionCards": safe_int(studio_work_counts.get("reviewDecisionCards")),
        "queue": top_review.get("priorityReviewQueue") if isinstance(top_review.get("priorityReviewQueue"), list) else [],
        "unblockCockpit": top_review.get("studioUnblockCockpit") if isinstance(top_review.get("studioUnblockCockpit"), dict) else {},
        "stateMachine": top_review.get("reviewStateMachine") if isinstance(top_review.get("reviewStateMachine"), dict) else {},
        "towerBoundary": top_review.get("towerBoundary") if isinstance(top_review.get("towerBoundary"), dict) else {},
        "nextSafestAction": top_review.get("nextSafestAction") or "",
        "firstSafeAction": top_review.get("firstSafeAction") if isinstance(top_review.get("firstSafeAction"), dict) else {},
        "truth": top_review.get("truth") or "Studio review gate evidence only.",
    }
    first_source = sources.get("publishingSprint") or sources.get("publisherDesk") or next(iter(sources.values()), {})
    first_safe = first_source.get("firstSafeAction") if isinstance(first_source.get("firstSafeAction"), dict) else {}
    approval_template = approval_request_template(stage, counts, today, studio_review_gate)
    receipt_template = receipt_capture_template(counts)
    publishing_approval_gate = build_publication_approval_gate(stage, counts, today, studio_review_gate)
    receipt_capture_ladder = build_receipt_capture_ladder(stage, counts, sources, studio_review_gate)
    next_decision_deck = build_next_decision_deck(stage, counts, sources, studio_review_gate, today)
    studio_tower_episode_handoff = build_studio_tower_episode_handoff(sources)
    counts["receiptCaptureLadderRows"] = len(receipt_capture_ladder)
    counts["nextDecisionDeckRows"] = len(next_decision_deck)
    counts["studioTowerHandoffRows"] = (studio_tower_episode_handoff.get("counts") or {}).get("episodes", 0)
    counts["studioTowerHandoffReceiptTruthRows"] = (studio_tower_episode_handoff.get("counts") or {}).get("receiptTruthRows", 0)
    counts["studioTowerHandoffReadyShorts"] = (studio_tower_episode_handoff.get("counts") or {}).get("readyShorts", 0)
    counts["studioReviewDecisionCards"] = safe_int(studio_work_counts.get("reviewDecisionCards"))
    counts["publicationApprovalGateNeedsHumanApproval"] = bool(publishing_approval_gate.get("humanApprovalRequired"))
    counts["publicationApprovalAllowedNow"] = bool(publishing_approval_gate.get("approvalAllowedNow"))
    counts["receiptCaptureAllowedNow"] = bool(publishing_approval_gate.get("receiptCaptureAllowedNow"))
    return {
        "schema": SCHEMA,
        "generatedAt": iso_now(),
        "status": f"tower-publication-control-room-{stage}",
        "releaseRoot": str(release_root),
        "stage": stage,
        "plainEnglish": plain,
        "counts": counts,
        "humanAsk": "Start here for Tower: clear local review gates, inspect packets, request explicit approval, then capture real receipts only after manual publication.",
        "agentSafeParallelWork": "Codex can improve packets, copy, metadata, validation, calendars, and review summaries. It must not publish, upload, schedule, approve, mutate accounts, or create receipt truth.",
        "nextSafestAction": next_action,
        "startHereToday": today,
        "studioReviewGate": studio_review_gate,
        "publishingApprovalGate": publishing_approval_gate,
        "receiptCaptureLadder": receipt_capture_ladder,
        "nextDecisionDeck": next_decision_deck,
        "studioTowerEpisodeHandoff": studio_tower_episode_handoff,
        "productionWorkSessionLaunchers": production_launchers,
        "externalControlRooms": external_rooms,
        "approvalRequestTemplate": approval_template,
        "receiptCaptureTemplate": receipt_template,
        "firstSafeAction": first_safe or {
            "label": "Open Tower publication control room",
            "command": "",
            "path": "",
            "safety": "Local control room only. No external action.",
        },
        "artifactCards": build_artifact_cards(sources),
        "publicationTruthContract": {
            "localPacketReady": "Local files and metadata exist and can be reviewed.",
            "humanApproved": "A human explicitly approved a specific artifact/platform/action.",
            "published": "A real platform URL, provider ID, or receipt exists after actual external publication.",
            "neverClaimFromThisBoard": [
                "external publication",
                "external schedule creation",
                "approval by implication",
                "receipt truth without a real URL/provider proof",
            ],
        },
        "sourcePointers": {source_id: source.get("pointerPath") or "" for source_id, source in sources.items()},
        "sourceArtifacts": {source_id: {key: source.get(key) or "" for key in ("htmlPath", "jsonPath", "markdownPath", "csvPath", "worksheetPath")} for source_id, source in sources.items()},
        "externalControlRoomArtifacts": {room_id: {key: room.get(key) or "" for key in ("htmlPath", "jsonPath", "markdownPath", "firstWritingSessionNotePath")} for room_id, room in external_rooms.items()},
        "truth": {
            "description": "Tower publication control room only. It reads local Tower/Studio review and packet evidence; it does not publish, upload, schedule, approve, mutate accounts, overwrite versions, mutate sources, or create receipt truth.",
            "sourceFilesMutated": False,
            "originalsMutated": False,
            "versionsOverwritten": False,
            "externalPublishing": False,
            "externalSchedulesCreated": False,
            "receiptTruthCreated": False,
            "accountMutation": False,
            "approvalCreated": False,
        },
        "safety": "Local Tower control room only. No original/source media mutation, no external account action, no upload, no schedule, no publish, no approval, no receipt capture.",
    }


def prepare_output_dir(release_root: Path) -> Path:
    out_dir = release_root / "tower-publication-control-room" / stamp()
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
        "# Tower publication control room",
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
    studio_handoff = packet.get("studioTowerEpisodeHandoff") if isinstance(packet.get("studioTowerEpisodeHandoff"), dict) else {}
    if studio_handoff:
        handoff_counts = studio_handoff.get("counts") if isinstance(studio_handoff.get("counts"), dict) else {}
        lines.extend([
            "",
            "## Studio -> Tower episode package handoff",
            "",
            studio_handoff.get("headline", ""),
            "",
            studio_handoff.get("plainEnglish", ""),
            "",
            f"- Source runway: `{studio_handoff.get('sourceRunwayPath', '')}`",
            f"- Review worksheet: `{studio_handoff.get('sourceReviewWorksheetPath', '')}`",
            f"- First move: {studio_handoff.get('firstMove', '')}",
            f"- Episodes: `{handoff_counts.get('episodes', 0)}`",
            f"- Ready shorts: `{handoff_counts.get('readyShorts', 0)}`",
            f"- Receipt truth rows: `{handoff_counts.get('receiptTruthRows', 0)}`",
            "",
        ])
        for row in studio_handoff.get("rows") or []:
            if not isinstance(row, dict):
                continue
            lines.extend([
                f"### Episode {row.get('episode', '')}: {row.get('versionDisplay', '')}",
                f"- Tower state: `{row.get('towerState', '')}`",
                f"- Publish readiness: {row.get('publishReadiness', '')}",
                f"- Review readiness: {row.get('reviewReadiness', '')}",
                f"- Duration spread: `{row.get('durationSpreadLabel', '')}`",
                f"- Shorts ready: `{row.get('readyShorts', 0)}`",
                f"- Receipt status: `{row.get('receiptStatus', '')}`",
                f"- Human ask: {row.get('humanAsk', '')}",
                f"- Next gate: {row.get('nextGate', '')}",
                f"- Tower implication: {row.get('towerImplication', '')}",
                f"- Primary action: `{row.get('primaryActionCommand', '')}`",
                f"- Package: `{row.get('openPackageCommand', '')}`",
                f"- Dry-run review: `{row.get('dryRunReviewCommand', '')}`",
                "",
            ])
    publication_gate = packet.get("publishingApprovalGate") if isinstance(packet.get("publishingApprovalGate"), dict) else {}
    receipt_ladder = packet.get("receiptCaptureLadder") if isinstance(packet.get("receiptCaptureLadder"), list) else []
    decision_deck = packet.get("nextDecisionDeck") if isinstance(packet.get("nextDecisionDeck"), list) else []
    lines.extend([
        "",
        "## Publication approval gate",
        "",
        f"- State: `{publication_gate.get('state', '')}`",
        f"- Message: {publication_gate.get('message', '')}",
        f"- Approval allowed now: `{publication_gate.get('approvalAllowedNow', False)}`",
        f"- Receipt capture allowed now: `{publication_gate.get('receiptCaptureAllowedNow', False)}`",
        f"- Receipt truth boundary: {publication_gate.get('receiptTruthBoundary', '')}",
        "",
        "Required before any external action:",
    ])
    for requirement in publication_gate.get("requiredBeforeExternalAction", []) if isinstance(publication_gate.get("requiredBeforeExternalAction"), list) else []:
        lines.append(f"- {requirement}")
    lines.append("")
    lines.append("Do not do:")
    for item in publication_gate.get("doNotDo", []) if isinstance(publication_gate.get("doNotDo"), list) else []:
        lines.append(f"- {item}")
    lines.extend(["", "## Next decision deck", ""])
    for item in decision_deck:
        if not isinstance(item, dict):
            continue
        lines.extend([
            f"### {item.get('rank', '')}. {item.get('title', '')}",
            f"- State: `{item.get('state', '')}`",
            f"- Owner: {item.get('owner', '')}",
            f"- Can do now: {item.get('canDoNow', '')}",
            f"- Not allowed yet: {item.get('notAllowedYet', '')}",
            f"- Human question: {item.get('humanQuestion', '')}",
            f"- Done when: {item.get('doneWhen', '')}",
            f"- Receipt truth: {item.get('receiptTruth', '')}",
            f"- Open: `{item.get('safeCommand', '')}`",
            f"- Evidence path: `{item.get('evidencePath', '')}`",
            "",
        ])
    lines.extend(["", "## Receipt capture ladder", ""])
    for step in receipt_ladder:
        if not isinstance(step, dict):
            continue
        lines.extend([
            f"### {step.get('step', '')}. {step.get('label', '')}",
            f"- Lane: `{step.get('lane', '')}`",
            f"- State: `{step.get('state', '')}`",
            f"- Meaning: {step.get('meaning', '')}",
            f"- Done when: {step.get('doneWhen', '')}",
            f"- Avoid: {step.get('unsafeShortcut', '')}",
            f"- Open: `{step.get('safeCommand', '')}`",
            f"- Evidence path: `{step.get('evidencePath', '')}`",
            "",
        ])
    gate = packet.get("studioReviewGate") if isinstance(packet.get("studioReviewGate"), dict) else {}
    lines.extend(["", "## Studio review gate before Tower approval", ""])
    lines.append(f"- Status: `{gate.get('status', '')}`")
    lines.append(f"- Next safest action: {gate.get('nextSafestAction', '')}")
    lines.append(f"- Open: `{(gate.get('firstSafeAction') or {}).get('command', '') if isinstance(gate.get('firstSafeAction'), dict) else ''}`")
    if gate.get("reviewDecisionCardsPath"):
        lines.append(f"- Studio review decision cards: `{gate.get('reviewDecisionCardsPath')}`")
        lines.append(f"- Studio review decision card count: `{gate.get('reviewDecisionCards', 0)}`")
    if gate.get("reviewerReturnHandoffPath"):
        lines.append(f"- Studio reviewer handoff: `{gate.get('reviewerReturnHandoffPath')}`")
    lines.append("")
    cockpit = gate.get("unblockCockpit") if isinstance(gate.get("unblockCockpit"), dict) else {}
    if cockpit:
        lines.extend([
            "### Studio unblock cockpit",
            "",
            f"- Headline: {cockpit.get('headline', '')}",
            f"- Meaning: {cockpit.get('plainEnglish', '')}",
            "",
            "Current gates:",
        ])
        for item in cockpit.get("currentGates", []):
            lines.extend([
                f"- **Episode {item.get('episode', '')}: {item.get('gate', '')}**",
                f"  - Human question: {item.get('humanQuestion', '')}",
                f"  - Tower impact: {item.get('towerImpact', '')}",
                f"  - Done when: {item.get('doneWhen', '')}",
                f"  - Evidence command: `{item.get('firstEvidenceCommand', '')}`",
            ])
        lines.append("")
        lines.append("Agent-safe work while gated:")
        for action in cockpit.get("agentSafeParallelWork", []):
            lines.append(f"- {action}")
        lines.append("")
        lines.append("Tower unlock conditions:")
        for condition in cockpit.get("towerUnlockConditions", []):
            lines.append(f"- {condition}")
        lines.append("")
    for item in gate.get("queue", []) if isinstance(gate.get("queue"), list) else []:
        lines.extend([
            f"### {item.get('position', '')}. {item.get('title', 'Review item')}",
            f"- Human question: {item.get('humanQuestion', '')}",
            f"- Tower impact: {item.get('towerImpact', '')}",
            f"- Done when: {item.get('doneWhen', '')}",
            f"- Avoid: {item.get('unsafeShortcut', '')}",
            f"- First evidence command: `{item.get('firstEvidenceCommand', '')}`",
            f"- Dry-run decision command: `{item.get('dryRunDecisionCommand', '')}`",
            "",
        ])
    boundary = gate.get("towerBoundary") if isinstance(gate.get("towerBoundary"), dict) else {}
    if boundary:
        lines.append(f"- Tower boundary: {boundary.get('plain', '')}")
        for action in boundary.get("towerCannotDoWithoutExplicitApproval", []):
            lines.append(f"  - Cannot do without explicit approval: {action}")
    lines.extend(["", "## Open first", ""])
    today = packet.get("startHereToday") if isinstance(packet.get("startHereToday"), dict) else {}
    lines.extend([
        f"- Mode: `{today.get('mode', '')}`",
        f"- Today: `{today.get('title', '')}`",
        f"- Why: {today.get('why', '')}",
        f"- Recommended move: `{today.get('recommendedMove', '')}`",
        f"- Safe command: `{today.get('safeCommand', '')}`",
        f"- Human question: {today.get('humanQuestion', '')}",
        f"- Codex-safe move: {today.get('agentMove', '')}",
        "",
        "## First safe action",
        "",
    ])
    first = packet.get("firstSafeAction") if isinstance(packet.get("firstSafeAction"), dict) else {}
    lines.append(f"- `{first.get('command', '')}`")
    lines.extend(["", "## Production work-session launchers", ""])
    for launcher in packet.get("productionWorkSessionLaunchers") or []:
        if not isinstance(launcher, dict):
            continue
        lines.extend([
            f"### {launcher.get('lane', '')}: {launcher.get('label', '')}",
            f"- Status: `{launcher.get('status', '')}`",
            f"- What it does: {launcher.get('whatItDoes', '')}",
            f"- First human question: {launcher.get('firstHumanQuestion', '')}",
            f"- Agent-safe work: {launcher.get('agentSafeWork', '')}",
            f"- Open: `{launcher.get('command', '')}`",
            f"- Path: `{launcher.get('path', '')}`",
            f"- Truth: {launcher.get('truth', '')}",
            "- Explicit non-claims:",
        ])
        for claim in launcher.get("explicitNonClaims") or []:
            lines.append(f"  - {claim}")
        lines.append("")
    approval_template = packet.get("approvalRequestTemplate") if isinstance(packet.get("approvalRequestTemplate"), dict) else {}
    receipt_template = packet.get("receiptCaptureTemplate") if isinstance(packet.get("receiptCaptureTemplate"), dict) else {}
    lines.extend([
        "",
        "## Explicit approval request template",
        "",
        f"- Approval allowed now: `{approval_template.get('approvalAllowedNow', False)}`",
        f"- Truth: {approval_template.get('truth', '')}",
        "",
        "```md",
        approval_template.get("markdownTemplate", "").rstrip(),
        "```",
        "",
        "## Receipt capture template",
        "",
        f"- Captured receipts: `{receipt_template.get('capturedReceipts', 0)}`",
        f"- Receipt slots: `{receipt_template.get('receiptSlots', 0)}`",
        f"- Truth: {receipt_template.get('truth', '')}",
        "",
        "```md",
        receipt_template.get("markdownTemplate", "").rstrip(),
        "```",
    ])
    lines.extend(["", "## Evidence front doors", ""])
    for card in packet.get("artifactCards") or []:
        lines.append(f"- **{card.get('label')}** `{card.get('status')}` - {card.get('nextSafestAction')}")
        if card.get("htmlPath"):
            lines.append(f"  - HTML: `{card.get('htmlPath')}`")
    path.write_text("\n".join(lines).rstrip() + "\n", encoding="utf-8")


def write_html(path: Path, packet: dict[str, Any]) -> None:
    counts = packet.get("counts") or {}
    metrics = "".join(
        f"<span><strong>{esc(value)}</strong>{esc(label)}</span>"
        for label, value in [
            ("episodes", counts.get("episodes", 0)),
            ("pending", counts.get("pendingRows", 0)),
            ("warnings", counts.get("warningRows", 0)),
            ("platform rows", counts.get("socialItems", 0)),
            ("ready approval", counts.get("readyForApproval", 0)),
            ("receipts", counts.get("capturedReceipts", 0)),
        ]
    )
    cards = []
    for card in packet.get("artifactCards") or []:
        first = card.get("firstSafeAction") if isinstance(card.get("firstSafeAction"), dict) else {}
        counts_text = ", ".join(f"{key}: {value}" for key, value in (card.get("counts") or {}).items() if isinstance(value, (str, int, float, bool)) and key in {"episodes", "reviewRows", "pendingRows", "warningRows", "blockedOrReview", "items", "calendarRows", "receiptSlots", "capturedReceipts", "readyForApproval"})
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
    first = packet.get("firstSafeAction") if isinstance(packet.get("firstSafeAction"), dict) else {}
    today = packet.get("startHereToday") if isinstance(packet.get("startHereToday"), dict) else {}
    contract = packet.get("publicationTruthContract") if isinstance(packet.get("publicationTruthContract"), dict) else {}
    gate = packet.get("studioReviewGate") if isinstance(packet.get("studioReviewGate"), dict) else {}
    publication_gate = packet.get("publishingApprovalGate") if isinstance(packet.get("publishingApprovalGate"), dict) else {}
    receipt_ladder_items = packet.get("receiptCaptureLadder") if isinstance(packet.get("receiptCaptureLadder"), list) else []
    decision_deck_items = packet.get("nextDecisionDeck") if isinstance(packet.get("nextDecisionDeck"), list) else []
    studio_handoff = packet.get("studioTowerEpisodeHandoff") if isinstance(packet.get("studioTowerEpisodeHandoff"), dict) else {}
    approval_template = packet.get("approvalRequestTemplate") if isinstance(packet.get("approvalRequestTemplate"), dict) else {}
    receipt_template = packet.get("receiptCaptureTemplate") if isinstance(packet.get("receiptCaptureTemplate"), dict) else {}
    cockpit = gate.get("unblockCockpit") if isinstance(gate.get("unblockCockpit"), dict) else {}
    gate_queue = "".join(
        f"<li><b>{esc(str(item.get('position')))}. {esc(str(item.get('title') or 'Review item'))}</b><br>{esc(str(item.get('humanQuestion') or ''))}<br>{esc(str(item.get('doneWhen') or ''))}<br><em>Tower: {esc(str(item.get('towerImpact') or ''))}</em><br><em>Avoid: {esc(str(item.get('unsafeShortcut') or ''))}</em><code>{esc(str(item.get('firstEvidenceCommand') or ''))}</code></li>"
        for item in (gate.get("queue") if isinstance(gate.get("queue"), list) else [])
    )
    cockpit_gates = "".join(
        f"<li><b>Episode {esc(str(item.get('episode') or ''))}: {esc(str(item.get('gate') or 'gate'))}</b><br>{esc(str(item.get('humanQuestion') or ''))}<br><em>{esc(str(item.get('towerImpact') or ''))}</em><code>{esc(str(item.get('firstEvidenceCommand') or ''))}</code></li>"
        for item in cockpit.get("currentGates", [])
    )
    cockpit_safe = "".join(f"<li>{esc(str(item))}</li>" for item in cockpit.get("agentSafeParallelWork", []))
    cockpit_unlock = "".join(f"<li>{esc(str(item))}</li>" for item in cockpit.get("towerUnlockConditions", []))
    gate_boundary = gate.get("towerBoundary") if isinstance(gate.get("towerBoundary"), dict) else {}
    gate_cannot = "".join(f"<li>{esc(str(action))}</li>" for action in gate_boundary.get("towerCannotDoWithoutExplicitApproval", []))
    approval_allowed = "yes" if approval_template.get("approvalAllowedNow") else "not yet"
    gate_requirements = "".join(f"<li>{esc(str(item))}</li>" for item in publication_gate.get("requiredBeforeExternalAction", []))
    gate_do_not = "".join(f"<li>{esc(str(item))}</li>" for item in publication_gate.get("doNotDo", []))
    ladder_cards = "".join(
        f"""
        <article class="ladder-step">
          <div class="card-top"><span>Step {esc(str(step.get('step') or ''))} · {esc(str(step.get('state') or ''))}</span><b>{esc(str(step.get('lane') or ''))}</b></div>
          <h3>{esc(str(step.get('label') or 'Receipt step'))}</h3>
          <p>{esc(str(step.get('meaning') or ''))}</p>
          <p><strong>Done when:</strong> {esc(str(step.get('doneWhen') or ''))}</p>
          <p><strong>Avoid:</strong> {esc(str(step.get('unsafeShortcut') or ''))}</p>
          <pre>{esc(str(step.get('safeCommand') or ''))}</pre>
        </article>
        """
        for step in receipt_ladder_items
        if isinstance(step, dict)
    )
    decision_cards = "".join(
        f"""
        <article class="decision-card decision-{esc(str(item.get('state') or 'unknown'))}">
          <div class="card-top"><span>{esc(str(item.get('state') or 'unknown'))}</span><b>{esc(str(item.get('owner') or 'Owner'))}</b></div>
          <h3>{esc(str(item.get('rank') or ''))}. {esc(str(item.get('title') or 'Decision'))}</h3>
          <p><strong>Can do now:</strong> {esc(str(item.get('canDoNow') or ''))}</p>
          <p><strong>Not allowed yet:</strong> {esc(str(item.get('notAllowedYet') or ''))}</p>
          <p><strong>Question:</strong> {esc(str(item.get('humanQuestion') or ''))}</p>
          <p><strong>Done when:</strong> {esc(str(item.get('doneWhen') or ''))}</p>
          <p><strong>Receipt truth:</strong> {esc(str(item.get('receiptTruth') or 'none'))}</p>
          <pre>{esc(str(item.get('safeCommand') or ''))}</pre>
        </article>
        """
        for item in decision_deck_items
        if isinstance(item, dict)
    )
    handoff_counts = studio_handoff.get("counts") if isinstance(studio_handoff.get("counts"), dict) else {}
    handoff_cards = "".join(
        f"""
        <article class="episode-handoff {esc(str(row.get('towerState') or 'unknown'))}">
          <div class="card-top"><span>Episode {esc(str(row.get('episode') or ''))} · {esc(str(row.get('towerState') or 'state'))}</span><b>{esc(str(row.get('versionDisplay') or 'version'))}</b></div>
          <h3>{esc(str(row.get('publishReadiness') or 'Package readiness'))}</h3>
          <p><strong>Review:</strong> {esc(str(row.get('reviewReadiness') or ''))} · <strong>Duration:</strong> {esc(str(row.get('durationSpreadLabel') or ''))} · <strong>Shorts:</strong> {esc(str(row.get('readyShorts') or 0))}</p>
          <p><strong>Receipt:</strong> {esc(str(row.get('receiptStatus') or 'none'))}</p>
          <p><strong>Human ask:</strong> {esc(str(row.get('humanAsk') or ''))}</p>
          <p><strong>Next gate:</strong> {esc(str(row.get('nextGate') or ''))}</p>
          <p>{esc(str(row.get('towerImplication') or ''))}</p>
          <pre>{esc(str(row.get('primaryActionCommand') or row.get('openPackageCommand') or ''))}</pre>
          <details><summary>Package evidence and dry-run review</summary>
            <code>{esc(str(row.get('manifestPath') or ''))}</code>
            <code>{esc(str(row.get('notesPath') or ''))}</code>
            <code>{esc(str(row.get('video16x9Path') or ''))}</code>
            <code>{esc(str(row.get('video9x16Path') or ''))}</code>
            <code>{esc(str(row.get('podcastAudioPath') or ''))}</code>
            <code>{esc(str(row.get('shortsDir') or ''))}</code>
            <code>{esc(str(row.get('dryRunReviewCommand') or ''))}</code>
          </details>
        </article>
        """
        for row in (studio_handoff.get("rows") if isinstance(studio_handoff.get("rows"), list) else [])
        if isinstance(row, dict)
    )
    launcher_cards = "".join(
        f"""
        <article class="launcher">
          <div class="eyebrow">{esc(str(launcher.get('lane') or 'Lane'))}</div>
          <h3>{esc(str(launcher.get('label') or 'Work session'))}</h3>
          <p><strong>Status:</strong> {esc(str(launcher.get('status') or 'unknown'))}</p>
          <p>{esc(str(launcher.get('whatItDoes') or ''))}</p>
          <p><strong>First question:</strong> {esc(str(launcher.get('firstHumanQuestion') or ''))}</p>
          <p><strong>Agent-safe:</strong> {esc(str(launcher.get('agentSafeWork') or ''))}</p>
          <pre>{esc(str(launcher.get('command') or ''))}</pre>
          <p>{esc(str(launcher.get('truth') or ''))}</p>
        </article>
        """
        for launcher in (packet.get("productionWorkSessionLaunchers") or [])
        if isinstance(launcher, dict)
    )
    html_text = f"""<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Tower publication control room</title>
  <style>
    :root {{ color-scheme:dark; --bg:#0f150d; --panel:#1d2819; --card:#292313; --ink:#fff1d1; --muted:#cdbb93; --honey:#ecc65d; --moss:#9bd27a; --creek:#7ed0dc; --clay:#d77b5a; --line:rgba(255,241,209,.16); }}
    * {{ box-sizing:border-box; }}
    body {{ margin:0; color:var(--ink); font-family:Avenir Next, Helvetica Neue, sans-serif; background:radial-gradient(circle at top left, rgba(126,208,220,.18), transparent 34rem), linear-gradient(180deg,#172213,#070a06); }}
    main {{ max-width:1320px; margin:0 auto; padding:38px clamp(18px,4vw,60px) 80px; }}
    header {{ border:1px solid var(--line); border-radius:32px; padding:30px; background:linear-gradient(135deg, rgba(29,40,25,.96), rgba(41,35,19,.92)); box-shadow:0 30px 90px rgba(0,0,0,.38); }}
    .eyebrow {{ color:var(--honey); text-transform:uppercase; letter-spacing:.24em; font-size:12px; font-weight:950; }}
    h1 {{ margin:10px 0; font-size:clamp(42px,7vw,86px); line-height:.9; max-width:980px; }}
    p {{ color:var(--muted); line-height:1.48; }}
    .metrics {{ display:flex; flex-wrap:wrap; gap:10px; margin-top:18px; }}
    .metrics span {{ border:1px solid var(--line); background:rgba(255,255,255,.055); border-radius:18px; padding:11px 13px; color:var(--muted); min-width:118px; }}
    .metrics strong {{ display:block; color:var(--moss); font-size:27px; }}
    .first {{ margin-top:18px; border:1px solid rgba(236,198,93,.34); border-radius:20px; padding:14px; background:rgba(236,198,93,.08); }}
    .today {{ margin-top:18px; border:1px solid rgba(155,210,122,.3); border-radius:20px; padding:14px; background:rgba(155,210,122,.08); }}
    .grid {{ display:grid; grid-template-columns:repeat(auto-fit,minmax(310px,1fr)); gap:16px; margin-top:22px; }}
    .card {{ border:1px solid var(--line); border-radius:22px; padding:17px; background:linear-gradient(180deg, rgba(41,35,19,.96), rgba(10,12,7,.92)); }}
    .card-top {{ display:flex; justify-content:space-between; gap:12px; align-items:start; }}
    .card-top span {{ color:var(--honey); font-size:11px; text-transform:uppercase; letter-spacing:.1em; font-weight:900; }}
    .card-top b {{ color:var(--ink); text-align:right; }}
    pre {{ white-space:pre-wrap; overflow-wrap:anywhere; color:var(--creek); background:rgba(0,0,0,.28); border-radius:14px; padding:12px; }}
    code {{ display:block; color:var(--creek); overflow-wrap:anywhere; margin-top:6px; }}
    summary {{ cursor:pointer; color:var(--moss); font-weight:900; }}
    .contract {{ margin-top:22px; border:1px solid var(--line); border-radius:24px; padding:18px; background:rgba(0,0,0,.18); }}
    .handoff {{ margin-top:18px; display:grid; grid-template-columns:repeat(auto-fit,minmax(320px,1fr)); gap:14px; }}
    .handoff article {{ border:1px solid var(--line); border-radius:22px; padding:16px; background:rgba(0,0,0,.2); }}
	    .launcher {{ border:1px solid rgba(126,208,220,.26); border-radius:22px; padding:17px; background:linear-gradient(180deg, rgba(126,208,220,.08), rgba(0,0,0,.18)); }}
	    .gate {{ margin-top:18px; border:1px solid rgba(215,123,90,.38); border-radius:24px; padding:18px; background:linear-gradient(135deg, rgba(215,123,90,.12), rgba(0,0,0,.2)); }}
	    .gate-state {{ color:var(--honey); font-weight:950; text-transform:uppercase; letter-spacing:.12em; }}
    .ladder-step {{ border:1px solid rgba(236,198,93,.28); border-radius:22px; padding:17px; background:linear-gradient(180deg, rgba(236,198,93,.08), rgba(0,0,0,.18)); }}
    .decision-card {{ border:1px solid rgba(126,208,220,.28); border-radius:22px; padding:17px; background:linear-gradient(180deg, rgba(126,208,220,.08), rgba(0,0,0,.18)); }}
    .episode-handoff {{ border:1px solid rgba(236,198,93,.30); border-radius:22px; padding:17px; background:linear-gradient(180deg, rgba(236,198,93,.08), rgba(0,0,0,.18)); }}
    .decision-locked {{ border-color:rgba(215,123,90,.38); }}
    .decision-active, .decision-unlocked {{ border-color:rgba(155,210,122,.42); }}
    .duration-review-before-publish, .sync-review-before-publish, .warning-review-before-publish {{ border-color:rgba(215,123,90,.50); }}
    .human-review-before-approval {{ border-color:rgba(236,198,93,.44); }}
    .packet-ready-needs-explicit-approval {{ border-color:rgba(155,210,122,.50); }}
	  </style>
</head>
<body>
<main>
  <header>
    <div class="eyebrow">Quipsly Tower</div>
    <h1>One launch room. Zero fake receipts.</h1>
    <p>{esc(packet.get('plainEnglish'))}</p>
    <p>{esc(packet.get('safety'))}</p>
    <div class="metrics">{metrics}</div>
    <div class="today">
      <b>Start here today · {esc(today.get('mode'))}</b>
      <p>{esc(today.get('why'))}</p>
      <p><strong>Recommended move:</strong> {esc(today.get('recommendedMove'))}</p>
      <p><strong>Human question:</strong> {esc(today.get('humanQuestion'))}</p>
      <p><strong>Codex-safe move:</strong> {esc(today.get('agentMove'))}</p>
      <pre>{esc(today.get('safeCommand'))}</pre>
    </div>
	    <div class="today">
	      <b>Studio review gate before Tower approval</b>
      <p>{esc(gate.get('nextSafestAction') or 'Open Studio review evidence before treating platform packets as approval-ready.')}</p>
      <p><strong>Studio review decision cards:</strong> {esc(gate.get('reviewDecisionCards') or 0)} · <code>{esc(gate.get('reviewDecisionCardsPath') or '')}</code></p>
      <p><strong>Studio reviewer handoff:</strong> <code>{esc(gate.get('reviewerReturnHandoffPath') or '')}</code></p>
      <p><strong>{esc(cockpit.get('headline') or '')}</strong> {esc(cockpit.get('plainEnglish') or '')}</p>
      <h3>Current Studio gates</h3>
      <ul>{cockpit_gates}</ul>
      <h3>Agent-safe work while gated</h3>
      <ul>{cockpit_safe}</ul>
      <h3>Tower unlock conditions</h3>
      <ul>{cockpit_unlock}</ul>
      <h3>Priority review queue</h3>
      <ul>{gate_queue}</ul>
      <p><strong>Tower boundary:</strong> {esc(gate_boundary.get('plain') or '')}</p>
	      <ul>{gate_cannot}</ul>
	    </div>
	    <div class="gate">
	      <div class="eyebrow">Publication approval gate</div>
	      <p class="gate-state">{esc(str(publication_gate.get('state') or 'unknown'))}</p>
	      <p>{esc(str(publication_gate.get('message') or ''))}</p>
	      <p><strong>Approval allowed now:</strong> {esc(str(publication_gate.get('approvalAllowedNow', False)))} · <strong>Receipt capture allowed now:</strong> {esc(str(publication_gate.get('receiptCaptureAllowedNow', False)))}</p>
	      <p>{esc(str(publication_gate.get('receiptTruthBoundary') or ''))}</p>
	      <h3>Required before external action</h3>
	      <ul>{gate_requirements}</ul>
	      <h3>Do not do</h3>
	      <ul>{gate_do_not}</ul>
	    </div>
	    <div class="contract">
	      <div class="eyebrow">Studio -> Tower handoff</div>
	      <p><strong>{esc(str(studio_handoff.get('headline') or 'Studio package truth drives Tower launch readiness.'))}</strong></p>
	      <p>{esc(str(studio_handoff.get('plainEnglish') or ''))}</p>
	      <p><strong>First move:</strong> {esc(str(studio_handoff.get('firstMove') or ''))}</p>
	      <div class="metrics">
	        <span><strong>{esc(str(handoff_counts.get('episodes', 0)))}</strong>episodes</span>
	        <span><strong>{esc(str(handoff_counts.get('durationReviewRows', 0)))}</strong>duration gates</span>
	        <span><strong>{esc(str(handoff_counts.get('humanReviewRows', 0)))}</strong>human review</span>
	        <span><strong>{esc(str(handoff_counts.get('readyShorts', 0)))}</strong>ready shorts</span>
	        <span><strong>{esc(str(handoff_counts.get('receiptTruthRows', 0)))}</strong>receipt rows</span>
	      </div>
	      <p><a href="{html.escape(str(studio_handoff.get('sourceRunwayPath') or ''), quote=True)}">Open Studio episode runway</a></p>
	      <div class="grid">{handoff_cards}</div>
	    </div>
	    <div class="contract">
	      <div class="eyebrow">Next decision deck</div>
	      <p>The exact path from local review to packet inspection to approval to receipt truth. This is a map, not permission to cross account boundaries.</p>
	      <div class="grid">{decision_cards}</div>
	    </div>
	    <div class="first"><b>First safe action</b><pre>{esc(first.get('command') or '')}</pre><p>{esc(first.get('safety') or '')}</p></div>
    <div class="handoff">
      <article>
        <div class="eyebrow">Approval handoff</div>
        <p><strong>Approval allowed now:</strong> {esc(approval_allowed)}</p>
        <p>{esc(approval_template.get('truth') or '')}</p>
        <pre>{esc(approval_template.get('markdownTemplate') or '')}</pre>
      </article>
      <article>
        <div class="eyebrow">Receipt handoff</div>
        <p><strong>Captured receipts:</strong> {esc(str(receipt_template.get('capturedReceipts') or 0))} of {esc(str(receipt_template.get('receiptSlots') or 0))} slots</p>
        <p>{esc(receipt_template.get('truth') or '')}</p>
        <pre>{esc(receipt_template.get('markdownTemplate') or '')}</pre>
      </article>
    </div>
  </header>
	  <section class="contract">
	    <div class="eyebrow">Truth contract</div>
	    <p><b>Local packet ready:</b> {esc(contract.get('localPacketReady'))}</p>
	    <p><b>Human approved:</b> {esc(contract.get('humanApproved'))}</p>
	    <p><b>Published:</b> {esc(contract.get('published'))}</p>
	  </section>
	  <section class="contract">
	    <div class="eyebrow">Receipt capture ladder</div>
	    <p>One calm path from local review to exact approval to real receipt evidence. This board still performs no external action.</p>
	    <div class="grid">{ladder_cards}</div>
	  </section>
	  <section class="contract">
    <div class="eyebrow">Production work-session launchers</div>
    <p>Tower can route humans and agents into the next real work session. It still cannot publish, upload, schedule, approve, mutate accounts, or create receipt truth.</p>
    <div class="grid">{launcher_cards}</div>
  </section>
  <section class="grid">{''.join(cards)}</section>
</main>
</body>
</html>
"""
    path.write_text(html_text, encoding="utf-8")


def update_pointers(release_root: Path, out_dir: Path, packet: dict[str, Any], html_path: Path, json_path: Path, markdown_path: Path, csv_path: Path) -> None:
    pointer = {
        "schema": "quipsly.tower.latest-publication-control-room.v1",
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
        "startHereToday": packet.get("startHereToday") or {},
        "studioReviewGate": packet.get("studioReviewGate") or {},
        "studioTowerEpisodeHandoff": packet.get("studioTowerEpisodeHandoff") or {},
        "publishingApprovalGate": packet.get("publishingApprovalGate") or {},
        "receiptCaptureLadder": packet.get("receiptCaptureLadder") or [],
        "nextDecisionDeck": packet.get("nextDecisionDeck") or [],
        "approvalRequestTemplate": packet.get("approvalRequestTemplate") or {},
        "receiptCaptureTemplate": packet.get("receiptCaptureTemplate") or {},
        "productionWorkSessionLaunchers": packet.get("productionWorkSessionLaunchers") or [],
        "externalControlRoomArtifacts": packet.get("externalControlRoomArtifacts") or {},
        "firstSafeAction": {
            "label": "Open Tower publication control room",
            "command": f"open {shell_quote(str(html_path))}",
            "path": str(html_path),
            "safety": "Opens local Tower launch evidence only. Does not publish, upload, schedule, approve, mutate accounts, overwrite versions, mutate sources, or create receipts.",
        },
        "nextSafestAction": packet.get("nextSafestAction") or "",
        "truth": packet.get("truth") or {},
    }
    write_json(release_root / LATEST_NAME, pointer)
    write_json(release_root / "tower-publication-control-room" / LATEST_NAME, pointer)
    write_json(release_root / "review-board" / LATEST_NAME, pointer)
    write_json(release_root / "review-board" / "latest-tower-publication-control-room.json", pointer)


def main() -> int:
    parser = argparse.ArgumentParser(description="Build Tower publication control room.")
    parser.add_argument("release_root", nargs="?", default=str(DEFAULT_RELEASE_ROOT))
    args = parser.parse_args()
    release_root = Path(args.release_root).expanduser()
    packet = build_packet(release_root)
    out_dir = prepare_output_dir(release_root)
    json_path = out_dir / "tower-publication-control-room.json"
    markdown_path = out_dir / "START-HERE-tower-publication-control-room.md"
    csv_path = out_dir / "tower-publication-control-room.csv"
    html_path = out_dir / "index.html"
    packet.update({
        "sessionDir": str(out_dir),
        "jsonPath": str(json_path),
        "markdownPath": str(markdown_path),
        "csvPath": str(csv_path),
        "htmlPath": str(html_path),
    })
    packet["firstSafeAction"] = {
        "label": "Open Tower publication control room",
        "command": f"open {shell_quote(str(html_path))}",
        "path": str(html_path),
        "safety": "Opens local Tower launch evidence only. Does not publish, upload, schedule, approve, mutate accounts, overwrite versions, mutate sources, or create receipts.",
    }
    write_json(json_path, packet)
    write_markdown(markdown_path, packet)
    write_csv(csv_path, packet)
    write_html(html_path, packet)
    update_pointers(release_root, out_dir, packet, html_path, json_path, markdown_path, csv_path)
    print(json.dumps({
        "status": packet["status"],
        "stage": packet["stage"],
        "counts": packet["counts"],
        "htmlPath": str(html_path),
        "jsonPath": str(json_path),
        "markdownPath": str(markdown_path),
        "csvPath": str(csv_path),
        "truth": packet["truth"],
    }, indent=2, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
