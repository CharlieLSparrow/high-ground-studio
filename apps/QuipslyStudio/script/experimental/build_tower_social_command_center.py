#!/usr/bin/env python3
"""Build a Hootsuite-like local Tower social command center.

This is a derived operator view over the latest Tower runway. It does not
publish, upload, schedule, approve, or capture receipts. It makes local review,
manual-posting readiness, draft calendar intent, and receipt gaps visible in one
place.
"""

from __future__ import annotations

import argparse
import csv
import html
import json
import re
import shlex
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

DEFAULT_ROOT = Path("/Volumes/My Passport/Episode_and_Shorts_Test")
PLATFORM_ORDER = [
    "YouTube",
    "Podcast/RSS",
    "HighGroundOdyssey.com",
    "Patreon",
    "YouTube Shorts",
    "Instagram",
    "Facebook",
    "LinkedIn",
]
STATUS_PRIORITY = {
    "blocked-local-package": 5,
    "review-needs-work": 10,
    "diagnostic-review-hold": 15,
    "needs-human-review": 20,
    "reviewed-with-warnings-needs-decision": 25,
    "warning-decision-needed": 25,
    "metadata-ready-needs-approval": 40,
    "ready-for-approval": 40,
    "metadata-missing": 50,
    "receipt-captured": 90,
}


MANUAL_PUBLISHING_WORKFLOW = [
    {
        "step": "Review local evidence",
        "humanAsk": "Watch/listen/open the local artifact and decide approve, refine, hold, or pending.",
        "agentSafeParallelWork": "Prepare review summaries, dry-run review commands, platform copy checks, and warning explanations.",
        "blockedHere": "No external post, upload, schedule, approval execution, account mutation, or receipt capture.",
    },
    {
        "step": "Inspect platform packet",
        "humanAsk": "Confirm the title, description, thumbnail/asset list, tags, and platform fit.",
        "agentSafeParallelWork": "Prepare metadata comparisons, missing-field notes, platform-specific rewrite options, and checklist updates.",
        "blockedHere": "No platform account mutation or upload.",
    },
    {
        "step": "Explicit approval",
        "humanAsk": "Charlie or an authorized reviewer says this exact item may be manually published.",
        "agentSafeParallelWork": "Prepare a posting checklist and keep receipt slots ready.",
        "blockedHere": "Approval is not a receipt and not a claim that publication happened.",
    },
    {
        "step": "Manual post/upload outside this script",
        "humanAsk": "Publish through the real platform UI or approved connector only after explicit approval.",
        "agentSafeParallelWork": "Guide the operator and prepare copy/paste-safe packet material.",
        "blockedHere": "This command center does not perform the external action.",
    },
    {
        "step": "Capture receipt truth",
        "humanAsk": "Paste the real URL/provider ID/post time after the platform confirms publication.",
        "agentSafeParallelWork": "Prepare dry-run receipt commands and validate receipt fields.",
        "blockedHere": "No receipt exists without real external proof.",
    },
    {
        "step": "Analytics follow-up",
        "humanAsk": "Return later with real performance data, comments, and lessons.",
        "agentSafeParallelWork": "Prepare analytics placeholders and compare results across platforms.",
        "blockedHere": "No fake metrics or inferred audience response.",
    },
]


def iso_now() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def stamp_now() -> str:
    return datetime.now().strftime("%Y%m%d-%H%M%S-tower-social-command-center")


def load_json(path: Path) -> dict[str, Any]:
    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
        return payload if isinstance(payload, dict) else {}
    except Exception:
        return {}


def write_json(path: Path, payload: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, indent=2, sort_keys=True) + "\n", encoding="utf-8")


def safe_slug(value: str) -> str:
    lowered = value.lower().replace("/", "-").replace(".", "")
    return re.sub(r"[^a-z0-9]+", "-", lowered).strip("-") or "platform"


def shell_command(parts: list[Any]) -> str:
    return " ".join(shlex.quote(str(part)) for part in parts)


def file_uri(path_value: Any) -> str:
    path_text = str(path_value or "")
    if not path_text:
        return ""
    path = Path(path_text)
    if not path.is_absolute():
        return ""
    try:
        return path.as_uri()
    except ValueError:
        return ""


def open_command(path_value: Any) -> str:
    path_text = str(path_value or "")
    return shell_command(["open", path_text]) if path_text else ""


def platform_order(platform_item: dict[str, Any], platform: str) -> int:
    explicit = platform_item.get("order")
    if isinstance(explicit, int):
        return explicit
    if platform in PLATFORM_ORDER:
        return PLATFORM_ORDER.index(platform) + 1
    return 99


def load_latest_runway(root: Path) -> tuple[dict[str, Any], Path]:
    pointer = load_json(root / "tower-runway" / "latest-tower-runway.json")
    json_path = Path(str(pointer.get("jsonPath") or ""))
    runway = load_json(json_path) if json_path.exists() else {}
    if not runway:
        raise SystemExit(
            "No Tower runway found. Run ./script/agentctl.sh tower-runway before building the social command center."
        )
    return runway, json_path


def platform_packet_map(version_dir: Path) -> dict[str, dict[str, Any]]:
    prep_dir = version_dir / "platform-prep"
    packet = load_json(prep_dir / "platform-metadata-packet.json")
    platforms = packet.get("platforms") if isinstance(packet.get("platforms"), list) else []
    mapped: dict[str, dict[str, Any]] = {}
    for platform in platforms:
        if not isinstance(platform, dict):
            continue
        name = str(platform.get("platform") or "")
        slug = str(platform.get("slug") or safe_slug(name))
        metadata_path = prep_dir / f"{slug}-metadata.json"
        checklist_path = prep_dir / f"{slug}-checklist.md"
        upload_job_path = prep_dir / f"{slug}-upload-job.json"
        mapped[name] = {
            "platformPacket": platform,
            "slug": slug,
            "metadataPath": str(metadata_path) if metadata_path.exists() else "",
            "checklistPath": str(checklist_path) if checklist_path.exists() else "",
            "uploadJobPath": str(upload_job_path) if upload_job_path.exists() else "",
            "assetCount": len(platform.get("assets") or []),
            "copyKeys": sorted((platform.get("copy") or {}).keys()) if isinstance(platform.get("copy"), dict) else [],
            "kind": platform.get("kind") or "",
            "packetStatus": platform.get("status") or "",
        }
    return mapped


def stage_for_item(ep: dict[str, Any], platform_item: dict[str, Any]) -> tuple[str, str, str]:
    ep_status = str(ep.get("status") or "")
    has_receipt = bool(platform_item.get("url") or platform_item.get("providerId"))
    local_ready = bool(platform_item.get("localMetadataReady"))
    if has_receipt:
        return "receipt-captured", "Receipt captured", "Verify the URL/provider id and add analytics when available."
    if ep_status == "blocked-local-package":
        return "blocked-local-package", "Local package blocked", "Repair local package blockers before any platform work."
    if ep_status == "review-needs-work":
        return "review-needs-work", "Review needs work", "Resolve hold/refine/reject decisions before manual publishing."
    if ep_status == "diagnostic-review-hold":
        return "diagnostic-review-hold", "Diagnostic hold visible", "Open the local metadata/checklist packet, decide approve/refine/hold for this exact platform row, and leave publication receipts empty until a real external post exists."
    if ep_status == "needs-human-review":
        return "needs-human-review", "Needs human review", "Review long-form video, podcast audio, and shorts before approval."
    if ep_status == "reviewed-with-warnings-needs-decision" or ep.get("warnings"):
        return "warning-decision-needed", "Warning decision needed", "Decide documented warnings before upload trust."
    if local_ready:
        return "ready-for-approval", "Ready for approval", "After explicit approval, publish manually and capture the receipt."
    return "metadata-missing", "Metadata missing", "Regenerate or repair this platform packet before manual posting."


def posting_gate_for_stage(stage: str) -> dict[str, Any]:
    review_blocked = stage in {
        "blocked-local-package",
        "review-needs-work",
        "diagnostic-review-hold",
        "needs-human-review",
        "warning-decision-needed",
        "metadata-missing",
    }
    metadata_ready = stage in {"ready-for-approval", "receipt-captured"}
    receipt_captured = stage == "receipt-captured"
    return {
        "stage": stage,
        "reviewCleared": not review_blocked,
        "metadataReady": metadata_ready,
        "explicitApprovalStillRequired": not receipt_captured,
        "externalPostingAllowedNow": False,
        "receiptCaptureAllowedNow": False,
        "calendarIsDraftOnly": True,
        "blockedReason": {
            "blocked-local-package": "Local package blockers must be repaired before platform work.",
            "review-needs-work": "A prior review says this needs refinement before approval.",
            "diagnostic-review-hold": "This is a deliberate local hold. Convert it into approve/refine/hold after reviewing the exact packet.",
            "needs-human-review": "Human watch/listen/read review must happen before approval.",
            "warning-decision-needed": "Documented warnings need a human decision before upload trust.",
            "metadata-missing": "A local metadata packet is missing or incomplete.",
        }.get(stage, "This may be manually posted only after explicit human approval outside this script."),
        "nextGate": (
            "clear-local-review"
            if review_blocked
            else ("verify-receipt-and-analytics" if receipt_captured else "explicit-human-approval")
        ),
        "truth": "Posting gates are local guidance only. They do not publish, schedule, upload, approve, or capture receipts.",
    }


def build_social_runway(items: list[dict[str, Any]], by_stage: dict[str, int]) -> dict[str, Any]:
    ready_for_approval = by_stage.get("ready-for-approval", 0)
    receipt_captured = by_stage.get("receipt-captured", 0)
    blocked_or_review = sum(
        count
        for stage, count in by_stage.items()
        if stage in {"blocked-local-package", "review-needs-work", "diagnostic-review-hold", "needs-human-review", "warning-decision-needed", "metadata-missing"}
    )
    mode = "review-first" if ready_for_approval == 0 and receipt_captured == 0 else "approval-runway"
    return {
        "mode": mode,
        "summary": (
            f"{blocked_or_review} platform rows need review/warning/metadata work before manual posting. "
            f"{ready_for_approval} rows are ready for explicit approval. {receipt_captured} receipts are captured."
        ),
        "whatTowerCanDoNow": [
            "show local platform packets",
            "prepare copy/checklists",
            "show draft-only calendar order",
            "generate dry-run review and receipt commands",
            "hold receipt slots open for real external proof",
        ],
        "whatTowerCannotClaimYet": [
            "that a platform post happened",
            "that a calendar row was externally scheduled",
            "that a human approved publication",
            "that receipt truth exists without a real URL/provider ID",
        ],
        "nextOperatingMove": (
            "Clear the first review/warning row before treating the social queue like a publish queue."
            if mode == "review-first"
            else "Review ready-for-approval rows, get explicit human approval, then post manually and capture real receipts."
        ),
        "rowCounts": {
            "total": len(items),
            "blockedOrReview": blocked_or_review,
            "readyForApproval": ready_for_approval,
            "receiptCaptured": receipt_captured,
        },
    }


def build_publication_batches(items: list[dict[str, Any]]) -> list[dict[str, Any]]:
    stage_labels = {
        "blocked-local-package": "Repair local package blockers",
        "review-needs-work": "Resolve review holds",
        "diagnostic-review-hold": "Clear diagnostic holds",
        "needs-human-review": "Human review queue",
        "warning-decision-needed": "Decide warning rows",
        "metadata-missing": "Repair metadata packets",
        "ready-for-approval": "Ready after explicit approval",
        "receipt-captured": "Receipt verification",
    }
    grouped: dict[str, list[dict[str, Any]]] = {}
    for item in items:
        grouped.setdefault(str(item.get("stage") or "unknown"), []).append(item)
    batches: list[dict[str, Any]] = []
    for stage, rows in sorted(grouped.items(), key=lambda entry: STATUS_PRIORITY.get(entry[0], 60)):
        top_rows = rows[:5]
        is_ready = stage == "ready-for-approval"
        is_receipt = stage == "receipt-captured"
        is_blocked = not is_ready and not is_receipt
        batches.append({
            "stage": stage,
            "label": stage_labels.get(stage, stage.replace("-", " ").title()),
            "count": len(rows),
            "episodeCount": len({row.get("episode") for row in rows}),
            "platformCount": len({row.get("platform") for row in rows}),
            "humanAsk": (
                "Approve exact rows only after local review and platform packet inspection."
                if is_ready
                else (
                    "Verify the captured URL/provider id and add analytics later."
                    if is_receipt
                    else "Clear this batch before any manual posting depends on it."
                )
            ),
            "agentSafeParallelWork": (
                "Prepare copy/paste packets, checklist comparisons, and receipt dry-runs without posting."
                if is_ready
                else (
                    "Prepare receipt verification notes and analytics placeholders; do not invent metrics."
                    if is_receipt
                    else "Prepare review summaries, warning explanations, packet repair notes, and dry-run review commands."
                )
            ),
            "nextSafestAction": (
                top_rows[0].get("nextSafestAction") if top_rows else "No rows in this batch."
            ),
            "externalPostingAllowedNow": False,
            "receiptCaptureAllowedNow": False,
            "truth": "Publication batch summary only. No external publish, upload, schedule, approval, account mutation, or receipt capture occurred.",
            "rows": [
                {
                    "episode": row.get("episode"),
                    "platform": row.get("platform"),
                    "stageLabel": row.get("stageLabel"),
                    "episodeStatus": row.get("episodeStatus"),
                    "metadataPath": row.get("metadataPath"),
                    "checklistPath": row.get("checklistPath"),
                    "firstSafeActionCommand": row.get("firstSafeActionCommand"),
                    "reviewDryRunCommandTemplate": row.get("reviewDryRunCommandTemplate"),
                    "receiptDryRunCommandTemplate": row.get("receiptDryRunCommandTemplate"),
                    "nextSafestAction": row.get("nextSafestAction"),
                }
                for row in top_rows
            ],
        })
    return batches


def build_first_posting_rehearsal(start_here_queue: list[dict[str, Any]], shorts_social_runway: dict[str, Any]) -> dict[str, Any]:
    first_rows = start_here_queue[:3]
    shorts_rows = (shorts_social_runway.get("startHereQueue") or [])[:3] if isinstance(shorts_social_runway, dict) else []
    return {
        "schema": "quipsly.tower.first-posting-rehearsal.v1",
        "status": "review-rehearsal-ready",
        "goal": "Practice the exact manual-publishing path without publishing: open evidence, inspect packet, make a dry-run review decision, then stop before any external platform action.",
        "whyItExists": "Tower should reduce publishing anxiety by making the next three reversible reps obvious. A rehearsal lets humans and agents test the queue, copy, checklist, receipt boundary, and review commands without pretending anything has been posted.",
        "doneWhen": "A reviewer can explain the row status, local packet evidence, next gate, and receipt requirement for each rehearsal row.",
        "doNotDo": [
            "Do not upload, post, schedule, approve, or capture a receipt from the rehearsal.",
            "Do not treat draft calendar rows as external schedules.",
            "Do not call ready-for-approval the same thing as published.",
            "Do not use receipt commands unless a real platform URL/provider proof exists.",
        ],
        "steps": [
            "Open the first queue row evidence.",
            "Open the local metadata/checklist/upload draft if present.",
            "Run or inspect only the dry-run review command.",
            "Write the human decision needed next: approve, refine, hold, pending, or repair metadata.",
            "Leave receipt slots empty until real external proof exists.",
        ],
        "longFormRows": first_rows,
        "shortsRows": shorts_rows,
        "agentUse": "Agents may summarize row evidence, check packet completeness, draft native platform copy improvements, and prepare dry-run review notes. Agents must not publish, schedule, approve, upload, mutate accounts, or fill receipts.",
        "truth": "First posting rehearsal only. It is local review practice and packet inspection, not external posting, scheduling, approval, account mutation, or receipt capture.",
    }


def review_week_slot(
    day: int,
    lane: str,
    title: str,
    row: dict[str, Any] | None,
    action: str,
    command: str,
    platform: str = "",
) -> dict[str, Any]:
    row = row or {}
    return {
        "day": day,
        "lane": lane,
        "title": title,
        "episode": row.get("episode") or row.get("episodeKey") or "",
        "version": row.get("version") or "",
        "platform": platform or row.get("platform") or "",
        "stage": row.get("stage") or "draft-review-slot",
        "sourceTitle": row.get("reviewObject") or row.get("title") or row.get("stageLabel") or "",
        "action": action,
        "command": command,
        "nextSafestAction": row.get("nextSafestAction") or action,
        "postingAllowed": False,
        "receiptCaptureAllowed": False,
        "draftOnly": True,
        "truth": "Draft review-week slot only. It does not publish, upload, schedule externally, approve, mutate accounts, or capture receipts.",
    }


def build_review_week_plan(
    start_here_queue: list[dict[str, Any]],
    shorts_social_runway: dict[str, Any],
    review_sheet_command: str,
) -> dict[str, Any]:
    shorts_rows = (shorts_social_runway.get("startHereQueue") or []) if isinstance(shorts_social_runway, dict) else []
    long_rows = start_here_queue[:8]
    slots = [
        review_week_slot(
            1,
            "long-form review",
            "Open the first Tower row and classify the blocker",
            long_rows[0] if len(long_rows) > 0 else {},
            "Open the Tower review command sheet and inspect the first platform row before any manual publishing thought.",
            review_sheet_command,
        ),
        review_week_slot(
            1,
            "long-form review",
            "Inspect the first metadata/checklist packet",
            long_rows[0] if len(long_rows) > 0 else {},
            "Open the row metadata and checklist packets, then write the exact review decision needed.",
            (long_rows[0].get("openMetadataCommand") or long_rows[0].get("openChecklistCommand") or review_sheet_command) if long_rows else review_sheet_command,
        ),
        review_week_slot(
            2,
            "shorts review",
            "Watch/listen to the first social short candidate",
            shorts_rows[0] if len(shorts_rows) > 0 else {},
            "Open the local short export with sound on and decide keep/refine/reject before platform approval.",
            shorts_rows[0].get("openExportCommand") if len(shorts_rows) > 0 else "",
        ),
        review_week_slot(
            2,
            "shorts review",
            "Compare the next two shorts for platform fit",
            shorts_rows[1] if len(shorts_rows) > 1 else {},
            "Open the next local short export and note whether the title/caption/platform fit is strong enough.",
            shorts_rows[1].get("openExportCommand") if len(shorts_rows) > 1 else "",
        ),
        review_week_slot(
            3,
            "long-form review",
            "Resolve the next episode/platform row",
            long_rows[1] if len(long_rows) > 1 else {},
            "Use the dry-run review command first, then leave the real decision to an explicitly approved reviewer action.",
            long_rows[1].get("reviewDryRunCommandTemplate") if len(long_rows) > 1 else review_sheet_command,
        ),
        review_week_slot(
            3,
            "metadata repair",
            "Repair or explain missing platform packet evidence",
            long_rows[2] if len(long_rows) > 2 else {},
            "If metadata/checklist/upload draft is missing, document that exact gap instead of marking the row ready.",
            (long_rows[2].get("openMetadataCommand") or long_rows[2].get("openChecklistCommand") or review_sheet_command) if len(long_rows) > 2 else review_sheet_command,
        ),
        review_week_slot(
            4,
            "shorts review",
            "Create the first platform-native shorts notes",
            shorts_rows[2] if len(shorts_rows) > 2 else {},
            "Draft platform-specific improvements for the short title/caption without posting or scheduling.",
            shorts_rows[2].get("openExportCommand") if len(shorts_rows) > 2 else "",
        ),
        review_week_slot(
            4,
            "shorts review",
            "Prepare a small shortlist for human approval",
            shorts_rows[3] if len(shorts_rows) > 3 else {},
            "Group a few reviewable shorts by platform and mark what a human needs to approve later.",
            shorts_rows[3].get("openExportCommand") if len(shorts_rows) > 3 else "",
        ),
        review_week_slot(
            5,
            "receipt rehearsal",
            "Practice receipt capture with dry-run only",
            long_rows[0] if len(long_rows) > 0 else {},
            "Use only the receipt dry-run template; real receipt capture requires a real platform URL/provider proof.",
            long_rows[0].get("receiptDryRunCommandTemplate") if long_rows else "",
        ),
        review_week_slot(
            5,
            "Tower cleanup",
            "Regenerate the Tower command center after review work",
            {},
            "Refresh the derived Tower views so queue truth, review status, and receipt slots are current.",
            "./script/agentctl.sh tower-social-command-center && ./script/agentctl.sh quipsly-os-refresh",
        ),
    ]
    filled_slots = [slot for slot in slots if slot.get("command") or slot.get("sourceTitle") or slot.get("action")]
    return {
        "schema": "quipsly.tower.review-week-plan.v1",
        "status": "draft-review-plan-ready",
        "title": "Five-day local review plan",
        "goal": "Turn review-blocked Tower rows and shorts candidates into explicit human decisions and packet notes without publishing anything.",
        "mode": "draft-only-not-scheduled",
        "slots": filled_slots,
        "counts": {
            "slots": len(filled_slots),
            "days": len({slot.get("day") for slot in filled_slots}),
            "longFormSourceRows": len(long_rows),
            "shortsSourceRows": len(shorts_rows),
            "externalSchedulesCreated": 0,
            "externalPostsCreated": 0,
            "receiptsCaptured": 0,
        },
        "nextSafestAction": "Work Day 1 first: inspect one long-form platform row and write the exact local review decision needed.",
        "truth": "Review week plan only. It is draft local work sequencing, not an external calendar, schedule, publication approval, platform post, upload, account mutation, or receipt.",
    }


def build_manual_publishing_runway(
    start_here_queue: list[dict[str, Any]],
    items: list[dict[str, Any]],
    publication_batches: list[dict[str, Any]],
    review_week_plan: dict[str, Any],
) -> dict[str, Any]:
    review_stages = {
        "blocked-local-package",
        "review-needs-work",
        "diagnostic-review-hold",
        "needs-human-review",
        "warning-decision-needed",
    }
    approval_rows = [item for item in items if item.get("stage") == "ready-for-approval"]
    review_rows = [item for item in items if item.get("stage") in review_stages]
    receipt_rows = [item for item in items if item.get("stage") == "receipt-captured"]
    packet_repair_rows = [
        item for item in items
        if not item.get("metadataPath") or not item.get("checklistPath") or not item.get("uploadJobPath")
    ]
    runway_rows: list[dict[str, Any]] = []
    for row in start_here_queue:
        packet_status = row.get("localPacketStatus") if isinstance(row.get("localPacketStatus"), dict) else {}
        gate = row.get("postingGate") if isinstance(row.get("postingGate"), dict) else {}
        runway_rows.append({
            "rank": row.get("rank") or "",
            "episode": row.get("episode") or "",
            "version": row.get("version") or "",
            "platform": row.get("platform") or "",
            "stage": row.get("stage") or "",
            "stageLabel": row.get("stageLabel") or "",
            "reviewObject": row.get("reviewObject") or "",
            "humanStep": row.get("humanAsk") or "",
            "agentStep": row.get("agentSafeParallelWork") or "",
            "nextSafestAction": row.get("nextSafestAction") or "",
            "packetReady": bool(packet_status.get("metadataReady")) and bool(packet_status.get("checklistReady")),
            "uploadDraftReady": bool(packet_status.get("uploadDraftReady")),
            "assetCount": packet_status.get("assetCount") or 0,
            "nextGate": gate.get("nextGate") or "",
            "blockedReason": gate.get("blockedReason") or "",
            "openMetadataCommand": row.get("openMetadataCommand") or "",
            "openChecklistCommand": row.get("openChecklistCommand") or "",
            "openUploadJobCommand": row.get("openUploadJobCommand") or "",
            "reviewDryRunCommandTemplate": row.get("reviewDryRunCommandTemplate") or "",
            "receiptDryRunCommandTemplate": row.get("receiptDryRunCommandTemplate") or "",
            "truth": row.get("truth") or "Manual publishing runway row only. No external action occurred.",
        })
    return {
        "schema": "quipsly.tower.manual-publishing-runway.v1",
        "mode": "manual-review-approval-receipt-runway",
        "truth": "Local runway only. It prepares review, approval, manual publishing, and receipt-capture handoffs without posting, uploading, scheduling, approving, mutating accounts, or claiming receipts.",
        "currentOperatingPosition": (
            "Review-blocked. Clear local review/warning rows before asking for any exact manual publishing approval."
            if review_rows else
            "Approval-ready rows exist. Human approval is still required before any external manual publishing."
            if approval_rows else
            "No approval-ready rows. Continue packet and review preparation."
        ),
        "operatorSteps": [
            {
                "step": "1. Review local evidence",
                "human": "Watch/listen/read the current package and decide approve, refine, hold, or pending.",
                "agent": "Summarize local evidence, compare checklist/metadata, and prepare dry-run review commands.",
                "blockedUntil": "A real human review decision exists for the exact package/platform row.",
            },
            {
                "step": "2. Approve exact platform packet",
                "human": "Approve one specific episode/version/platform packet after local review is clear.",
                "agent": "Prepare copy, upload checklist, thumbnails/assets, and manual posting notes.",
                "blockedUntil": "Charlie or an approved reviewer explicitly approves that exact external action.",
            },
            {
                "step": "3. Manual publish outside Quipsly",
                "human": "Post/upload/schedule on the real platform only after explicit approval.",
                "agent": "Can provide packet material and stay out of external accounts unless explicitly authorized.",
                "blockedUntil": "A real URL, provider id, or external platform proof exists.",
            },
            {
                "step": "4. Capture receipt truth",
                "human": "Paste or approve the real platform URL/provider proof.",
                "agent": "Dry-run the receipt command first, then capture only exact approved receipt data.",
                "blockedUntil": "Receipt command is run with real external proof, not a local readiness guess.",
            },
        ],
        "rows": runway_rows,
        "batches": publication_batches,
        "reviewWeekPlanSummary": {
            "mode": review_week_plan.get("mode") if isinstance(review_week_plan, dict) else "",
            "slotCount": (review_week_plan.get("counts") or {}).get("slots", 0) if isinstance(review_week_plan, dict) else 0,
            "nextSafestAction": review_week_plan.get("nextSafestAction") if isinstance(review_week_plan, dict) else "",
        },
        "counts": {
            "rows": len(runway_rows),
            "reviewBlockedRows": len(review_rows),
            "approvalReadyRows": len(approval_rows),
            "packetRepairRows": len(packet_repair_rows),
            "receiptCapturedRows": len(receipt_rows),
            "draftScheduleRows": len(items),
            "publicationBatches": len(publication_batches),
        },
        "nextSafestAction": "Open row 1, inspect local metadata/checklist, record a local review decision, then regenerate Tower evidence. Do not publish or capture receipts from this runway.",
    }


def action_for_stage(row: dict[str, Any]) -> str:
    stage = str(row.get("stage") or "")
    packet_status = row.get("localPacketStatus") if isinstance(row.get("localPacketStatus"), dict) else {}
    if stage == "ready-for-approval":
        return "request-approval"
    if stage == "receipt-captured":
        return "verify-receipt"
    if stage == "metadata-missing" or not packet_status.get("metadataReady") or not packet_status.get("checklistReady"):
        return "repair-packet"
    if stage in {"blocked-local-package", "review-needs-work", "diagnostic-review-hold", "needs-human-review", "warning-decision-needed"}:
        return "review-packet"
    return "hold"


def build_local_posting_note_yaml(row: dict[str, Any], action: str) -> str:
    packet_status = row.get("localPacketStatus") if isinstance(row.get("localPacketStatus"), dict) else {}
    blocking = row.get("blockingEvidence") if isinstance(row.get("blockingEvidence"), dict) else {}
    return "\n".join([
        "tower_local_publishing_note:",
        f"  episode: {row.get('episode') or ''}",
        f"  version: \"{row.get('version') or ''}\"",
        f"  platform: \"{row.get('platform') or ''}\"",
        f"  stage: \"{row.get('stage') or ''}\"",
        f"  local_action: \"{action}\"",
        "  human_decision: \"pending\"",
        "  reviewer: \"\"",
        "  notes: \"\"",
        f"  metadata_ready: {str(bool(packet_status.get('metadataReady'))).lower()}",
        f"  checklist_ready: {str(bool(packet_status.get('checklistReady'))).lower()}",
        f"  upload_draft_ready: {str(bool(packet_status.get('uploadDraftReady'))).lower()}",
        f"  receipt_status: \"{blocking.get('receiptStatus') or 'not_published'}\"",
        "  external_publish_approved: false",
        "  external_url_or_provider_id: \"\"",
    ])


def build_manual_publishing_action_cards(start_here_queue: list[dict[str, Any]]) -> dict[str, Any]:
    allowed_actions = [
        "review-packet",
        "request-approval",
        "hold",
        "repair-packet",
        "manual-post-after-approval",
        "capture-receipt-after-post",
        "verify-receipt",
    ]
    cards: list[dict[str, Any]] = []
    for row in start_here_queue:
        action = action_for_stage(row)
        gate = row.get("postingGate") if isinstance(row.get("postingGate"), dict) else {}
        packet_status = row.get("localPacketStatus") if isinstance(row.get("localPacketStatus"), dict) else {}
        blocking = row.get("blockingEvidence") if isinstance(row.get("blockingEvidence"), dict) else {}
        warnings = blocking.get("warnings") if isinstance(blocking.get("warnings"), list) else []
        blockers = blocking.get("blockers") if isinstance(blocking.get("blockers"), list) else []
        card_id = "-".join([
            "tower",
            f"episode-{int(row.get('episode') or 0):02d}",
            safe_slug(str(row.get("platform") or "platform")),
            str(row.get("stage") or "stage"),
        ])
        cards.append({
            "id": card_id,
            "rank": row.get("rank") or "",
            "episode": row.get("episode") or "",
            "version": row.get("version") or "",
            "platform": row.get("platform") or "",
            "stage": row.get("stage") or "",
            "stageLabel": row.get("stageLabel") or "",
            "suggestedLocalAction": action,
            "approvalState": "not-approved-for-external-action",
            "publicationState": "not-published",
            "receiptSlot": "empty-until-real-platform-url-or-provider-id",
            "packetEvidence": {
                "metadataReady": bool(packet_status.get("metadataReady")),
                "checklistReady": bool(packet_status.get("checklistReady")),
                "uploadDraftReady": bool(packet_status.get("uploadDraftReady")),
                "assetCount": packet_status.get("assetCount") or 0,
                "warnings": len(warnings),
                "blockers": len(blockers),
            },
            "humanDecisionNeeded": row.get("humanAsk") or "",
            "codexSafeMove": row.get("agentSafeParallelWork") or "",
            "nextSafestAction": row.get("nextSafestAction") or "",
            "manualChecklist": [
                "Open the local metadata packet.",
                "Open the local checklist packet.",
                "Record approve, refine, hold, or pending as a local review decision.",
                "If explicitly approved later, post manually on the real platform outside this artifact.",
                "After posting, capture only a real URL/provider ID/post time as receipt truth.",
            ],
            "commands": {
                "openMetadata": row.get("openMetadataCommand") or "",
                "openChecklist": row.get("openChecklistCommand") or "",
                "openUploadDraft": row.get("openUploadJobCommand") or "",
                "reviewDryRun": row.get("reviewDryRunCommandTemplate") or "",
                "receiptDryRun": row.get("receiptDryRunCommandTemplate") or "",
            },
            "postingGate": gate,
            "localPostingNoteYaml": build_local_posting_note_yaml(row, action),
            "truth": "Tower action card only. It does not publish, upload, schedule, approve, mutate accounts, or create receipt truth.",
        })
    return {
        "schema": "quipsly.tower.manual-publishing-action-cards.v1",
        "mode": "local-review-before-external-action",
        "allowedLocalActions": allowed_actions,
        "cards": cards,
        "counts": {
            "cards": len(cards),
            "reviewPacket": sum(1 for card in cards if card.get("suggestedLocalAction") == "review-packet"),
            "repairPacket": sum(1 for card in cards if card.get("suggestedLocalAction") == "repair-packet"),
            "requestApproval": sum(1 for card in cards if card.get("suggestedLocalAction") == "request-approval"),
            "receiptSlots": len(cards),
        },
        "nextSafestAction": "Copy one local publishing note, inspect its packet evidence, and record a local review decision. Stop before external posting.",
        "truth": "Local Tower publishing action cards only. They prepare review, packet repair, approval requests, manual posting handoff, and receipt slots without performing or claiming any external action.",
    }


def build_short_local_posting_note_yaml(row: dict[str, Any], action: str) -> str:
    return "\n".join([
        "tower_short_local_note:",
        f"  short_id: \"{row.get('shortId') or ''}\"",
        f"  episode_key: \"{row.get('episodeKey') or ''}\"",
        f"  short_index: {row.get('shortIndex') or ''}",
        f"  platform: \"{row.get('platform') or ''}\"",
        f"  local_action: \"{action}\"",
        "  watch_listen_decision: \"pending\"",
        "  reviewer: \"\"",
        "  hook_note: \"\"",
        "  caption_note: \"\"",
        "  notes: \"\"",
        f"  title_draft: \"{str(row.get('titleDraft') or row.get('title') or '').replace('\"', '\\\"')}\"",
        "  external_publish_approved: false",
        "  external_url_or_provider_id: \"\"",
    ])


def build_shorts_publishing_action_cards(shorts_social_runway: dict[str, Any]) -> dict[str, Any]:
    rows = shorts_social_runway.get("startHereQueue") if isinstance(shorts_social_runway.get("startHereQueue"), list) else []
    counts = shorts_social_runway.get("counts") if isinstance(shorts_social_runway.get("counts"), dict) else {}
    allowed_actions = [
        "watch-listen-review",
        "refine-title-caption",
        "hold",
        "request-approval",
        "manual-post-after-approval",
        "capture-receipt-after-post",
    ]
    cards: list[dict[str, Any]] = []
    for row in rows:
        gate = row.get("postingGate") if isinstance(row.get("postingGate"), dict) else {}
        review_commands = row.get("shortReviewCommands") if isinstance(row.get("shortReviewCommands"), dict) else {}
        action = "watch-listen-review"
        if not row.get("captionDraft") or not row.get("titleDraft"):
            action = "refine-title-caption"
        card_id = "-".join([
            "short",
            safe_slug(str(row.get("episodeKey") or "episode")),
            str(row.get("shortIndex") or "0"),
            safe_slug(str(row.get("platform") or "platform")),
        ])
        cards.append({
            "id": card_id,
            "episodeKey": row.get("episodeKey") or "",
            "shortIndex": row.get("shortIndex") or "",
            "shortId": row.get("shortId") or "",
            "platform": row.get("platform") or "",
            "stage": row.get("stage") or "",
            "suggestedLocalAction": action,
            "approvalState": "not-approved-for-external-action",
            "publicationState": "not-published",
            "receiptSlot": "empty-until-real-platform-url-or-provider-id",
            "reviewPath": row.get("reviewPath") or "",
            "durationSeconds": row.get("durationSeconds") or 0,
            "aspectFit": row.get("aspectFit") or "",
            "titleDraft": row.get("titleDraft") or row.get("title") or "",
            "captionDraft": row.get("captionDraft") or "",
            "platformCheck": row.get("check") or "",
            "humanDecisionNeeded": "Watch/listen to the local short, then decide keep, refine, reject, or hold before any platform approval.",
            "codexSafeMove": "Open or reveal the export, compare title/caption/platform fit, record only local keep/refine/reject review state, and keep the receipt slot empty.",
            "nextSafestAction": row.get("nextSafestAction") or "",
            "manualChecklist": [
                "Open the local short export with sound on.",
                "Check the first second, ending, captions/title fit, and vertical framing.",
                "Record keep, refine, reject, or hold as a local review decision.",
                "If explicitly approved later, post manually on the real platform outside this artifact.",
                "After posting, capture only a real URL/provider ID/post time as receipt truth.",
            ],
            "commands": {
                "openExport": review_commands.get("openExport") or row.get("openExportCommand") or "",
                "revealExport": review_commands.get("revealExport") or row.get("revealExportCommand") or "",
                "keepLocalReview": review_commands.get("keep") or "",
                "refineLocalReview": review_commands.get("refine") or "",
                "rejectLocalReview": review_commands.get("reject") or "",
            },
            "commandSafety": "Short review commands update local Quipsly review metadata only. They do not post, upload, schedule, approve external action, mutate accounts, or create publication receipt truth.",
            "postingGate": gate,
            "localPostingNoteYaml": build_short_local_posting_note_yaml(row, action),
            "truth": "Tower short action card only. It does not publish, upload, schedule, approve, mutate accounts, or create receipt truth.",
        })
    return {
        "schema": "quipsly.tower.shorts-publishing-action-cards.v1",
        "mode": "local-short-review-before-external-action",
        "allowedLocalActions": allowed_actions,
        "cards": cards,
        "counts": {
            "cards": len(cards),
            "sourcePlatformRows": int(counts.get("platformRows") or 0),
            "reviewableShorts": int(counts.get("reviewableShorts") or 0),
            "receiptSlots": len(cards),
            "cardsWithLocalReviewCommands": sum(1 for card in cards if (card.get("commands") or {}).get("keepLocalReview")),
        },
        "nextSafestAction": "Open one local short export, review with sound on, copy the local note, and stop before external posting.",
        "truth": "Local Tower shorts action cards only. They prepare watch/listen review, platform copy refinement, approval requests, manual posting handoff, and receipt slots without performing or claiming any external action.",
    }


def load_shorts_review_packet(root: Path) -> tuple[dict[str, Any], dict[str, Any]]:
    pointer = load_json(root / "review-board" / "shorts-review-cockpit" / "latest-shorts-review-cockpit.json")
    packet_path = Path(str(pointer.get("jsonPath") or ""))
    packet = load_json(packet_path) if packet_path.exists() else {}
    return pointer, packet


def build_shorts_social_runway(root: Path) -> dict[str, Any]:
    pointer, packet = load_shorts_review_packet(root)
    source_rows = packet.get("rows") if isinstance(packet.get("rows"), list) else []
    if not source_rows:
        source_rows = pointer.get("rows") if isinstance(pointer.get("rows"), list) else []
    platform_rows: list[dict[str, Any]] = []
    for short in source_rows:
        if not isinstance(short, dict):
            continue
        commands = short.get("commands") if isinstance(short.get("commands"), dict) else {}
        short_id = str(short.get("id") or "")
        fallback_title = str(short.get("displayTitle") or short.get("title") or "short")
        short_review_commands = {
            "openExport": commands.get("openExport") or "",
            "revealExport": commands.get("revealExport") or "",
            "keep": commands.get("keep") or (shell_command([
                "./script/agentctl.sh",
                "shorts-review",
                short_id,
                "keep",
                f"Local Tower review: keep {fallback_title}; ready for platform packet review.",
            ]) if short_id else ""),
            "refine": commands.get("refine") or (shell_command([
                "./script/agentctl.sh",
                "shorts-review",
                short_id,
                "refine",
                f"Local Tower review: refine {fallback_title}; note trim/crop/audio/hook fix.",
            ]) if short_id else ""),
            "reject": commands.get("reject") or (shell_command([
                "./script/agentctl.sh",
                "shorts-review",
                short_id,
                "reject",
                f"Local Tower review: reject {fallback_title}; preserve as learning data.",
            ]) if short_id else ""),
        }
        platforms = short.get("platforms") if isinstance(short.get("platforms"), list) else []
        if not platforms:
            title = short.get("displayTitle") or short.get("title") or ""
            platforms = [
                {"platform": "YouTube Shorts", "status": "review-fit", "titleDraft": title, "captionDraft": "", "check": "Review platform packet."},
                {"platform": "Instagram Reels", "status": "review-fit", "titleDraft": title, "captionDraft": "", "check": "Review platform packet."},
                {"platform": "Facebook Reels", "status": "review-fit", "titleDraft": title, "captionDraft": "", "check": "Review platform packet."},
            ]
        for platform in platforms:
            if not isinstance(platform, dict):
                continue
            platform_rows.append({
                "episodeKey": short.get("episodeKey") or "",
                "shortIndex": short.get("index") or "",
                "shortId": short.get("id") or "",
                "title": short.get("displayTitle") or short.get("title") or "",
                "platform": platform.get("platform") or "",
                "stage": "needs-short-review",
                "platformStatus": platform.get("status") or "review-fit",
                "durationSeconds": short.get("durationSeconds") or 0,
                "aspectFit": short.get("aspectFit") or "",
                "reviewPath": short.get("reviewPath") or "",
                "openExportCommand": short_review_commands.get("openExport") or "",
                "revealExportCommand": short_review_commands.get("revealExport") or "",
                "shortReviewCommands": short_review_commands,
                "captionDraft": platform.get("captionDraft") or "",
                "titleDraft": platform.get("titleDraft") or "",
                "check": platform.get("check") or "",
                "postingGate": {
                    "reviewCleared": False,
                    "metadataReady": bool(platform.get("captionDraft") or platform.get("titleDraft")),
                    "explicitApprovalStillRequired": True,
                    "externalPostingAllowedNow": False,
                    "receiptCaptureAllowedNow": False,
                    "calendarIsDraftOnly": True,
                    "nextGate": "watch-listen-review",
                    "blockedReason": "Shorts need human/agent watch-listen review before platform approval.",
                    "truth": "Short platform row is local prep only. It does not approve, upload, schedule, publish, or capture receipts.",
                },
                "nextSafestAction": "Open the local short export, review with sound on, then decide keep/refine/reject before platform approval.",
                "truth": "Local short social-prep row only. No external publish, upload, schedule, approval, account mutation, or receipt capture occurred.",
            })
    by_platform: dict[str, int] = {}
    for row in platform_rows:
        platform = str(row.get("platform") or "unknown")
        by_platform[platform] = by_platform.get(platform, 0) + 1
    return {
        "schema": "quipsly.tower.shorts-social-runway.v1",
        "sourcePointer": str(root / "review-board" / "shorts-review-cockpit" / "latest-shorts-review-cockpit.json"),
        "sourceJsonPath": pointer.get("jsonPath") or "",
        "counts": {
            "shorts": len(source_rows),
            "platformRows": len(platform_rows),
            "startHereRows": min(12, len(platform_rows)),
            "reviewableShorts": (pointer.get("counts") or {}).get("reviewable", 0) if isinstance(pointer.get("counts"), dict) else 0,
            "needsAttention": (pointer.get("counts") or {}).get("needsAttention", 0) if isinstance(pointer.get("counts"), dict) else 0,
        },
        "byPlatform": by_platform,
        "startHereQueue": platform_rows[:12],
        "platformRows": platform_rows,
        "nextSafestAction": "Review exported shorts with sound on before treating social rows as approval candidates.",
        "truth": "Shorts social runway is local preparation only. It does not publish, upload, schedule, approve, mutate accounts, or capture receipts.",
    }


def build_command_center(root: Path) -> dict[str, Any]:
    runway, runway_path = load_latest_runway(root)
    items: list[dict[str, Any]] = []
    review_sheet_command = shell_command(["./script/agentctl.sh", "tower-review-command-sheet", root])
    episodes = runway.get("episodes") if isinstance(runway.get("episodes"), list) else []
    for ep in episodes:
        if not isinstance(ep, dict):
            continue
        episode = int(ep.get("episode") or 0)
        version_dir = Path(str(ep.get("versionDir") or ""))
        packet_map = platform_packet_map(version_dir) if version_dir.exists() else {}
        platform_queue = ep.get("platformQueue") if isinstance(ep.get("platformQueue"), list) else []
        for platform_item in platform_queue:
            if not isinstance(platform_item, dict):
                continue
            platform = str(platform_item.get("platform") or "")
            stage, stage_label, next_action = stage_for_item(ep, platform_item)
            packet_info = packet_map.get(platform, {})
            receipt_template = shell_command([
                "./script/agentctl.sh",
                "tower-receipt",
                episode,
                platform,
                "<real-url>",
                "<provider-id>",
                "<posted-at-iso>",
                "<captured-by>",
                "<notes>",
            ])
            receipt_dry_run_template = shell_command([
                "./script/agentctl.sh",
                "tower-receipt-dry-run",
                episode,
                platform,
                "<real-url>",
                "<provider-id>",
                "<posted-at-iso>",
                "<captured-by>",
                "<notes>",
            ])
            review_template = shell_command([
                "./script/agentctl.sh",
                "tower-review-decision",
                episode,
                "longForm16x9",
                "approve|refine|hold|pending",
                "<reviewer>",
                "<notes>",
            ])
            review_dry_run_template = shell_command([
                "./script/agentctl.sh",
                "tower-review-decision-dry-run",
                episode,
                "longForm16x9",
                "approve|refine|hold|pending",
                "<reviewer>",
                "<notes>",
            ])
            item = {
                "episode": episode,
                "version": ep.get("version") or "",
                "versionDir": str(version_dir) if version_dir else "",
                "episodeStatus": ep.get("status") or "",
                "platform": platform,
                "platformOrder": platform_order(platform_item, platform),
                "stage": stage,
                "stageLabel": stage_label,
                "statusPriority": STATUS_PRIORITY.get(stage, 60),
                "warnings": ep.get("warnings") or [],
                "blockers": ep.get("blockers") or [],
                "localMetadataReady": bool(platform_item.get("localMetadataReady")),
                "receiptStatus": platform_item.get("receiptStatus") or "not_published",
                "url": platform_item.get("url") or "",
                "providerId": platform_item.get("providerId") or "",
                "postedAt": platform_item.get("postedAt") or "",
                "metadataPath": packet_info.get("metadataPath") or "",
                "checklistPath": packet_info.get("checklistPath") or "",
                "uploadJobPath": packet_info.get("uploadJobPath") or "",
                "metadataUri": file_uri(packet_info.get("metadataPath") or ""),
                "checklistUri": file_uri(packet_info.get("checklistPath") or ""),
                "uploadJobUri": file_uri(packet_info.get("uploadJobPath") or ""),
                "openMetadataCommand": open_command(packet_info.get("metadataPath") or ""),
                "openChecklistCommand": open_command(packet_info.get("checklistPath") or ""),
                "openUploadJobCommand": open_command(packet_info.get("uploadJobPath") or ""),
                "platformKind": packet_info.get("kind") or "",
                "assetCount": packet_info.get("assetCount") or 0,
                "copyKeys": packet_info.get("copyKeys") or [],
                "packetStatus": packet_info.get("packetStatus") or platform_item.get("status") or "",
                "draftScheduleStatus": "draft-only-not-scheduled",
                "postingGate": posting_gate_for_stage(stage),
                "externalActionTaken": False,
                "nextSafestAction": next_action,
                "firstSafeAction": {
                    "label": "Open the Tower review command sheet before this platform row",
                    "command": review_sheet_command,
                    "safety": "Creates a local review command sheet only; it does not approve, publish, upload, schedule, mutate accounts, or capture receipts.",
                },
                "firstSafeActionCommand": review_sheet_command,
                "reviewCommandTemplate": review_template,
                "reviewDryRunCommandTemplate": review_dry_run_template,
                "receiptDryRunCommandTemplate": receipt_dry_run_template,
                "receiptCommandTemplate": receipt_template,
                "receiptCommandSafety": "Dry-run first. Execute receipt capture only after explicit human approval and a real external post/upload returns a URL or provider id.",
                "truth": "Local Tower queue row only. No external publish, upload, schedule, approval, account mutation, or receipt capture occurred.",
            }
            items.append(item)
    items.sort(key=lambda item: (item["statusPriority"], item["episode"], item["platformOrder"], item["platform"]))
    by_stage: dict[str, int] = {}
    by_platform: dict[str, int] = {}
    for item in items:
        by_stage[item["stage"]] = by_stage.get(item["stage"], 0) + 1
        by_platform[item["platform"]] = by_platform.get(item["platform"], 0) + 1
    social_runway = build_social_runway(items, by_stage)
    publication_batches = build_publication_batches(items)
    shorts_social_runway = build_shorts_social_runway(root)
    shorts_publishing_action_cards = build_shorts_publishing_action_cards(shorts_social_runway)
    start_here_queue: list[dict[str, Any]] = []
    for rank, item in enumerate(items[:12], start=1):
        stage = str(item.get("stage") or "")
        if stage in {"blocked-local-package", "review-needs-work", "diagnostic-review-hold", "needs-human-review", "warning-decision-needed"}:
            human_ask = "Review or resolve this row before any platform publishing work depends on it."
            agent_work = "Prepare summaries, dry-run review commands, platform packet checks, and warning explanations without posting."
        elif stage == "ready-for-approval":
            human_ask = "Approve this exact platform item before any manual post/upload happens."
            agent_work = "Prepare copy/paste packet material, checklist comparisons, and receipt dry-run commands."
        elif stage == "metadata-missing":
            human_ask = "Decide whether this platform matters for this episode, then repair the missing packet if it does."
            agent_work = "Regenerate or inspect local metadata packet files and report what is missing."
        else:
            human_ask = "Verify captured receipt truth and add later analytics when real platform data exists."
            agent_work = "Prepare receipt verification notes and analytics placeholders; do not invent metrics."
        start_here_queue.append({
            "rank": rank,
            "episode": item.get("episode") or "",
            "version": item.get("version") or "",
            "platform": item.get("platform") or "",
            "stage": stage,
            "stageLabel": item.get("stageLabel") or "",
            "episodeStatus": item.get("episodeStatus") or "",
            "reviewObject": f"Episode {int(item.get('episode') or 0):02d} {item.get('version') or ''} -> {item.get('platform') or ''}".strip(),
            "localPacketStatus": {
                "metadataReady": bool(item.get("metadataPath")),
                "checklistReady": bool(item.get("checklistPath")),
                "uploadDraftReady": bool(item.get("uploadJobPath")),
                "assetCount": item.get("assetCount") or 0,
                "copyKeys": item.get("copyKeys") or [],
                "packetStatus": item.get("packetStatus") or "",
            },
            "blockingEvidence": {
                "warnings": item.get("warnings") or [],
                "blockers": item.get("blockers") or [],
                "postingGate": item.get("postingGate") or {},
                "receiptStatus": item.get("receiptStatus") or "",
                "localMetadataReady": bool(item.get("localMetadataReady")),
            },
            "humanAsk": human_ask,
            "agentSafeParallelWork": agent_work,
            "nextSafestAction": item.get("nextSafestAction") or "",
            "firstSafeActionCommand": item.get("firstSafeActionCommand") or "",
            "openMetadataCommand": item.get("openMetadataCommand") or "",
            "openChecklistCommand": item.get("openChecklistCommand") or "",
            "openUploadJobCommand": item.get("openUploadJobCommand") or "",
            "reviewDryRunCommandTemplate": item.get("reviewDryRunCommandTemplate") or "",
            "receiptDryRunCommandTemplate": item.get("receiptDryRunCommandTemplate") or "",
            "postingGate": item.get("postingGate") or {},
            "truth": "Start-here row only. No external publish, upload, schedule, approval, account mutation, or receipt capture occurred.",
        })
    first_posting_rehearsal = build_first_posting_rehearsal(start_here_queue, shorts_social_runway)
    review_week_plan = build_review_week_plan(start_here_queue, shorts_social_runway, review_sheet_command)
    manual_publishing_runway = build_manual_publishing_runway(
        start_here_queue,
        items,
        publication_batches,
        review_week_plan,
    )
    manual_publishing_action_cards = build_manual_publishing_action_cards(start_here_queue)
    return {
        "schema": "quipsly.tower.social-command-center.v1",
        "generatedAt": iso_now(),
        "root": str(root),
        "sourceTowerRunway": str(runway_path),
        "truth": "Social command center is local manual-publishing prep only. It does not publish, upload, schedule, approve, mutate accounts, or claim receipts.",
        "humanAsk": "Work the queue from the top: clear review/warning rows, inspect platform packets, get explicit approval, then capture receipts only after real external proof exists.",
        "agentSafeParallelWork": "Prepare platform copy, checklist notes, warning explanations, dry-run review commands, dry-run receipt commands, and analytics placeholders. Do not post, upload, schedule, approve, mutate accounts, or capture receipts.",
        "manualPublishingWorkflow": MANUAL_PUBLISHING_WORKFLOW,
        "socialPublishingRunway": social_runway,
        "publicationBatches": publication_batches,
        "firstPostingRehearsal": first_posting_rehearsal,
        "manualPublishingRunway": manual_publishing_runway,
        "manualPublishingActionCards": manual_publishing_action_cards,
        "shortsPublishingActionCards": shorts_publishing_action_cards,
        "reviewWeekPlan": review_week_plan,
        "shortsSocialRunway": shorts_social_runway,
        "publicationTruthContract": {
            "localReadinessIsNotPublication": True,
            "approvalIsNotReceipt": True,
            "receiptRequiresExternalProof": True,
            "calendarRowsAreDraftOnly": True,
            "summary": "Tower can organize and prepare publishing work, but only real platform URLs/provider IDs prove publication.",
        },
        "counts": {
            "items": len(items),
            "episodes": len({item["episode"] for item in items}),
            "platforms": len({item["platform"] for item in items}),
            "capturedReceipts": sum(1 for item in items if item["stage"] == "receipt-captured"),
            "readyForApproval": sum(1 for item in items if item["stage"] == "ready-for-approval"),
            "blockedOrReview": sum(1 for item in items if item["stage"] in {"blocked-local-package", "review-needs-work", "diagnostic-review-hold", "needs-human-review", "warning-decision-needed"}),
            "draftOnlySchedules": len(items),
            "startHereRows": len(start_here_queue),
            "publicationBatches": len(publication_batches),
            "rehearsalLongFormRows": len(first_posting_rehearsal.get("longFormRows") or []),
            "rehearsalShortRows": len(first_posting_rehearsal.get("shortsRows") or []),
            "reviewWeekPlanSlots": (review_week_plan.get("counts") or {}).get("slots", 0),
            "reviewWeekPlanDays": (review_week_plan.get("counts") or {}).get("days", 0),
            "manualPublishingRunwayRows": (manual_publishing_runway.get("counts") or {}).get("rows", 0),
            "manualPublishingReviewBlockedRows": (manual_publishing_runway.get("counts") or {}).get("reviewBlockedRows", 0),
            "manualPublishingApprovalReadyRows": (manual_publishing_runway.get("counts") or {}).get("approvalReadyRows", 0),
            "manualPublishingPacketRepairRows": (manual_publishing_runway.get("counts") or {}).get("packetRepairRows", 0),
            "manualPublishingReceiptCapturedRows": (manual_publishing_runway.get("counts") or {}).get("receiptCapturedRows", 0),
            "manualPublishingDraftScheduleRows": (manual_publishing_runway.get("counts") or {}).get("draftScheduleRows", 0),
            "manualPublishingActionCards": (manual_publishing_action_cards.get("counts") or {}).get("cards", 0),
            "shortsPublishingActionCards": (shorts_publishing_action_cards.get("counts") or {}).get("cards", 0),
            "shortsPublishingCardsWithLocalReviewCommands": (shorts_publishing_action_cards.get("counts") or {}).get("cardsWithLocalReviewCommands", 0),
            "shortsPlatformRows": (shorts_social_runway.get("counts") or {}).get("platformRows", 0),
            "shortsReadyForReview": (shorts_social_runway.get("counts") or {}).get("reviewableShorts", 0),
        },
        "byStage": by_stage,
        "byPlatform": by_platform,
        "startHereQueue": start_here_queue,
        "items": items,
        "nextSafestAction": "Work top-down: clear review/warning rows first, then use metadata-ready rows for explicit human-approved manual posting, then capture real receipts.",
        "firstSafeAction": {
            "label": "Open or regenerate the Tower review command sheet",
            "command": review_sheet_command,
            "safety": "Local review-sheet generation only. No external publishing, scheduling, approval, account mutation, or receipt capture.",
        },
        "reviewCommandTemplate": shell_command([
            "./script/agentctl.sh",
            "tower-review-decision",
            "EPISODE",
            "artifact_id",
            "approve|refine|hold|pending",
            "<reviewer>",
            "<notes>",
        ]),
        "reviewDryRunCommandTemplate": shell_command([
            "./script/agentctl.sh",
            "tower-review-decision-dry-run",
            "EPISODE",
            "artifact_id",
            "approve|refine|hold|pending",
            "<reviewer>",
            "<notes>",
        ]),
        "receiptCommandSafety": "Receipt commands are intentionally second-stage. Use them only after explicit approval and a real external URL/provider receipt exists.",
    }


def prepare_session_dir(root: Path) -> Path:
    base = root / "tower-social-command-center" / stamp_now()
    counter = 2
    session_dir = base
    while session_dir.exists():
        session_dir = Path(f"{base}-{counter}")
        counter += 1
    session_dir.mkdir(parents=True, exist_ok=False)
    return session_dir


def write_csv(path: Path, packet: dict[str, Any]) -> None:
    fields = [
        "queueRank",
        "episode",
        "version",
        "episodeStatus",
        "platform",
        "stage",
        "stageLabel",
        "localMetadataReady",
        "receiptStatus",
        "metadataPath",
        "checklistPath",
        "uploadJobPath",
        "openMetadataCommand",
        "openChecklistCommand",
        "openUploadJobCommand",
        "nextSafestAction",
        "firstSafeActionCommand",
        "reviewDryRunCommandTemplate",
        "reviewCommandTemplate",
        "receiptDryRunCommandTemplate",
        "receiptCommandTemplate",
        "receiptCommandSafety",
    ]
    with path.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=fields)
        writer.writeheader()
        for index, item in enumerate(packet.get("items") or [], start=1):
            writer.writerow({field: item.get(field, "") for field in fields if field != "queueRank"} | {"queueRank": index})


def write_markdown(path: Path, packet: dict[str, Any]) -> None:
    runway = packet.get("socialPublishingRunway") if isinstance(packet.get("socialPublishingRunway"), dict) else {}
    lines = [
        "# Quipsly Tower social command center",
        "",
        f"Generated: `{packet['generatedAt']}`",
        "",
        packet["truth"],
        "",
        f"Human ask: {packet.get('humanAsk')}",
        "",
        f"Agent-safe parallel work: {packet.get('agentSafeParallelWork')}",
        "",
        f"Next safest action: {packet['nextSafestAction']}",
        "",
        "## Social publishing runway",
        "",
        f"- Mode: `{runway.get('mode') or 'unknown'}`",
        f"- Summary: {runway.get('summary') or ''}",
        f"- Next operating move: {runway.get('nextOperatingMove') or ''}",
        "",
        "**Tower can do now**",
        "",
    ]
    for item in runway.get("whatTowerCanDoNow") or []:
        lines.append(f"- {item}")
    lines.extend(["", "**Tower cannot claim yet**", ""])
    for item in runway.get("whatTowerCannotClaimYet") or []:
        lines.append(f"- {item}")
    rehearsal = packet.get("firstPostingRehearsal") if isinstance(packet.get("firstPostingRehearsal"), dict) else {}
    lines.extend([
        "",
        "## First posting rehearsal",
        "",
        rehearsal.get("goal") or "",
        "",
        f"- Why it exists: {rehearsal.get('whyItExists')}",
        f"- Done when: {rehearsal.get('doneWhen')}",
        f"- Agent use: {rehearsal.get('agentUse')}",
        f"- Truth: {rehearsal.get('truth')}",
        "",
        "### Rehearsal steps",
        "",
    ])
    for step in rehearsal.get("steps") or []:
        lines.append(f"- {step}")
    lines.extend(["", "### Do not do", ""])
    for item in rehearsal.get("doNotDo") or []:
        lines.append(f"- {item}")
    lines.extend(["", "### Long-form rehearsal rows", ""])
    for item in rehearsal.get("longFormRows") or []:
        lines.extend([
            f"#### {item.get('rank')}. {item.get('reviewObject')}",
            f"- Stage: `{item.get('stage')}` ({item.get('stageLabel')})",
            f"- Next: {item.get('nextSafestAction')}",
            f"- Open metadata: `{item.get('openMetadataCommand')}`",
            f"- Open checklist: `{item.get('openChecklistCommand')}`",
            f"- Review dry-run: `{item.get('reviewDryRunCommandTemplate')}`",
            "",
        ])
    lines.extend(["", "### Shorts rehearsal rows", ""])
    for row in rehearsal.get("shortsRows") or []:
        lines.extend([
            f"#### {row.get('episodeKey')} / Short {row.get('shortIndex')} / {row.get('platform')}",
            f"- Title: {row.get('title')}",
            f"- Open: `{row.get('openExportCommand')}`",
            f"- Next: {row.get('nextSafestAction')}",
            "",
        ])
    lines.extend([
        "",
        "## Manual publishing workflow",
        "",
    ])
    for step in packet.get("manualPublishingWorkflow") or []:
        lines.extend([
            f"### {step.get('step')}",
            "",
            f"- Human: {step.get('humanAsk')}",
            f"- Agent-safe: {step.get('agentSafeParallelWork')}",
            f"- Blocked here: {step.get('blockedHere')}",
            "",
        ])
    review_week = packet.get("reviewWeekPlan") if isinstance(packet.get("reviewWeekPlan"), dict) else {}
    lines.extend([
        "## Five-day local review plan",
        "",
        review_week.get("truth") or "Draft review plan only.",
        "",
        f"- Status: `{review_week.get('status') or 'unknown'}`",
        f"- Mode: `{review_week.get('mode') or 'draft-only-not-scheduled'}`",
        f"- Goal: {review_week.get('goal') or ''}",
        f"- Next: {review_week.get('nextSafestAction') or ''}",
        "",
    ])
    for slot in review_week.get("slots") or []:
        lines.extend([
            f"### Day {slot.get('day')} - {slot.get('lane')} - {slot.get('title')}",
            "",
            f"- Source: {slot.get('sourceTitle') or 'No source row'}",
            f"- Episode/version/platform: `{slot.get('episode')}` `{slot.get('version')}` `{slot.get('platform')}`",
            f"- Stage: `{slot.get('stage')}`",
            f"- Action: {slot.get('action')}",
            f"- Command: `{slot.get('command')}`",
            f"- Truth: {slot.get('truth')}",
            "",
        ])
    lines.extend([
        "## Counts",
        "",
        f"- Queue rows: `{packet['counts']['items']}`",
        f"- Episodes: `{packet['counts']['episodes']}`",
        f"- Platforms: `{packet['counts']['platforms']}`",
        f"- Ready for approval/manual publish after approval: `{packet['counts']['readyForApproval']}`",
        f"- Blocked/review/warning rows: `{packet['counts']['blockedOrReview']}`",
        f"- Captured receipts: `{packet['counts']['capturedReceipts']}`",
        f"- Start-here rows: `{packet['counts'].get('startHereRows', 0)}`",
        f"- Publication batches: `{packet['counts'].get('publicationBatches', 0)}`",
        f"- Review week plan slots: `{packet['counts'].get('reviewWeekPlanSlots', 0)}`",
        "",
        "## Publication batches",
        "",
    ])
    for batch in packet.get("publicationBatches") or []:
        lines.extend([
            f"### {batch.get('label')}",
            "",
            f"- Stage: `{batch.get('stage')}`",
            f"- Rows: `{batch.get('count')}` across `{batch.get('episodeCount')}` episode(s) and `{batch.get('platformCount')}` platform(s)",
            f"- Human: {batch.get('humanAsk')}",
            f"- Agent-safe: {batch.get('agentSafeParallelWork')}",
            f"- Next: {batch.get('nextSafestAction')}",
            f"- External posting allowed now: `{batch.get('externalPostingAllowedNow', False)}`",
            f"- Receipt capture allowed now: `{batch.get('receiptCaptureAllowedNow', False)}`",
            "",
        ])
        for row in batch.get("rows") or []:
            lines.append(f"  - Episode {int(row.get('episode') or 0):02d} / {row.get('platform')}: {row.get('nextSafestAction')}")
        lines.append("")
    lines.extend([
        "",
        "## Start here",
        "",
    ])
    for item in packet.get("startHereQueue") or []:
        gate = item.get("postingGate") if isinstance(item.get("postingGate"), dict) else {}
        packet_status = item.get("localPacketStatus") if isinstance(item.get("localPacketStatus"), dict) else {}
        blocking = item.get("blockingEvidence") if isinstance(item.get("blockingEvidence"), dict) else {}
        warnings = blocking.get("warnings") if isinstance(blocking.get("warnings"), list) else []
        blockers = blocking.get("blockers") if isinstance(blocking.get("blockers"), list) else []
        lines.extend([
            f"### {item.get('rank')}. {item.get('reviewObject') or ('Episode ' + str(item.get('episode')) + ' - ' + str(item.get('platform')))}",
            "",
            f"- Version: `{item.get('version')}`",
            f"- Stage: `{item.get('stage')}` ({item.get('stageLabel')})",
            f"- Posting gate: `{gate.get('nextGate') or ''}` - {gate.get('blockedReason') or ''}",
            f"- Local packets: metadata=`{packet_status.get('metadataReady', False)}`, checklist=`{packet_status.get('checklistReady', False)}`, uploadDraft=`{packet_status.get('uploadDraftReady', False)}`, assets=`{packet_status.get('assetCount', 0)}`",
            f"- Warnings: `{len(warnings)}`; blockers: `{len(blockers)}`; receipt: `{blocking.get('receiptStatus', '')}`",
            f"- Human: {item.get('humanAsk')}",
            f"- Agent-safe: {item.get('agentSafeParallelWork')}",
            f"- Next: {item.get('nextSafestAction')}",
            f"- First safe action: `{item.get('firstSafeActionCommand')}`",
            f"- Open metadata: `{item.get('openMetadataCommand')}`",
            f"- Open checklist: `{item.get('openChecklistCommand')}`",
            f"- Open upload draft: `{item.get('openUploadJobCommand')}`",
            f"- Review dry-run: `{item.get('reviewDryRunCommandTemplate')}`",
            f"- Receipt dry-run: `{item.get('receiptDryRunCommandTemplate')}`",
            "",
        ])
    shorts_runway = packet.get("shortsSocialRunway") if isinstance(packet.get("shortsSocialRunway"), dict) else {}
    shorts_counts = shorts_runway.get("counts") if isinstance(shorts_runway.get("counts"), dict) else {}
    lines.extend([
        "## Shorts social runway",
        "",
        f"- Shorts: `{shorts_counts.get('shorts', 0)}`",
        f"- Platform rows: `{shorts_counts.get('platformRows', 0)}`",
        f"- Reviewable shorts: `{shorts_counts.get('reviewableShorts', 0)}`",
        f"- Needs attention: `{shorts_counts.get('needsAttention', 0)}`",
        f"- Next: {shorts_runway.get('nextSafestAction') or ''}",
        "",
    ])
    for row in (shorts_runway.get("startHereQueue") or [])[:8]:
        lines.extend([
            f"### {row.get('episodeKey')} / Short {row.get('shortIndex')} / {row.get('platform')}",
            "",
            f"- Title: {row.get('title')}",
            f"- Duration: `{row.get('durationSeconds')}`",
            f"- Aspect: `{row.get('aspectFit')}`",
            f"- Caption draft: {row.get('captionDraft')}",
            f"- Open: `{row.get('openExportCommand')}`",
            f"- Next: {row.get('nextSafestAction')}",
            "",
        ])
    lines.extend([
        "## Full platform queue",
        "",
    ])
    for index, item in enumerate(packet.get("items") or [], start=1):
        gate = item.get("postingGate") if isinstance(item.get("postingGate"), dict) else {}
        lines.extend([
            f"### {index}. Episode {int(item['episode']):02d} - {item['platform']}",
            "",
            f"- Stage: `{item['stage']}` ({item['stageLabel']})",
            f"- Posting gate: `{gate.get('nextGate') or ''}` - {gate.get('blockedReason') or ''}",
            f"- External posting allowed now: `{gate.get('externalPostingAllowedNow', False)}`",
            f"- Receipt capture allowed now: `{gate.get('receiptCaptureAllowedNow', False)}`",
            f"- Episode status: `{item['episodeStatus']}`",
            f"- Metadata: `{item['metadataPath'] or 'missing'}`",
            f"- Checklist: `{item['checklistPath'] or 'missing'}`",
            f"- Upload job draft: `{item['uploadJobPath'] or 'missing'}`",
            f"- Open metadata: `{item['openMetadataCommand'] or 'missing'}`",
            f"- Open checklist: `{item['openChecklistCommand'] or 'missing'}`",
            f"- Open upload draft: `{item['openUploadJobCommand'] or 'missing'}`",
            f"- Receipt: `{item['receiptStatus']}` `{item['url'] or item['providerId'] or ''}`",
            f"- Next: {item['nextSafestAction']}",
            f"- First safe action: `{item['firstSafeActionCommand']}`",
            f"- Review dry-run template: `{item['reviewDryRunCommandTemplate']}`",
            f"- Review command template: `{item['reviewCommandTemplate']}`",
            f"- Receipt dry-run template, before local receipt capture: `{item['receiptDryRunCommandTemplate']}`",
            f"- Receipt command template, after real external proof only: `{item['receiptCommandTemplate']}`",
            f"- Receipt safety: {item['receiptCommandSafety']}",
            "",
        ])
    path.write_text("\n".join(lines).rstrip() + "\n", encoding="utf-8")


def write_review_week_plan_markdown(path: Path, packet: dict[str, Any]) -> None:
    review_week = packet.get("reviewWeekPlan") if isinstance(packet.get("reviewWeekPlan"), dict) else {}
    lines = [
        "# Tower draft social calendar / five-day local review plan",
        "",
        f"Generated: `{packet.get('generatedAt')}`",
        "",
        review_week.get("truth") or "Draft review plan only.",
        "",
        f"Mode: `{review_week.get('mode') or 'draft-only-not-scheduled'}`",
        f"Goal: {review_week.get('goal') or ''}",
        f"Next safest action: {review_week.get('nextSafestAction') or ''}",
        f"Calendar truth: draft local sequencing only; no platform schedule exists until a real platform receipt or scheduled-post proof is captured after explicit approval.",
        "",
        "## Safety",
        "",
        "- This is not an external calendar.",
        "- This does not approve publication.",
        "- This does not upload, post, schedule, mutate accounts, or capture receipts.",
        "- Receipt commands stay dry-run only until a real external URL/provider proof exists.",
        "",
        "## Slots",
        "",
    ]
    for slot in review_week.get("slots") or []:
        lines.extend([
            f"### Day {slot.get('day')} - {slot.get('title')}",
            "",
            f"- Lane: `{slot.get('lane')}`",
            f"- Platform: `{slot.get('platform') or '-'}`",
            f"- Source: {slot.get('sourceTitle') or '-'}",
            f"- Stage: `{slot.get('stage')}`",
            f"- Action: {slot.get('action')}",
            f"- Command: `{slot.get('command') or '-'}`",
            f"- Posting allowed: `{slot.get('postingAllowed', False)}`",
            f"- Receipt capture allowed: `{slot.get('receiptCaptureAllowed', False)}`",
            "",
            "Review note:",
            "",
            "> ",
            "",
        ])
    lines.extend([
        "## After any real local review decision",
        "",
        "Run:",
        "",
        "```bash",
        "./script/agentctl.sh tower-social-command-center && ./script/agentctl.sh quipsly-os-refresh",
        "```",
        "",
    ])
    path.write_text("\n".join(lines).rstrip() + "\n", encoding="utf-8")


def write_manual_publishing_runway_markdown(path: Path, packet: dict[str, Any]) -> None:
    runway = packet.get("manualPublishingRunway") if isinstance(packet.get("manualPublishingRunway"), dict) else {}
    counts = runway.get("counts") if isinstance(runway.get("counts"), dict) else {}
    lines = [
        "# Tower manual publishing runway",
        "",
        f"Generated: `{packet.get('generatedAt')}`",
        "",
        runway.get("truth") or "Local manual publishing runway only.",
        "",
        f"Current operating position: {runway.get('currentOperatingPosition') or ''}",
        "",
        f"Next safest action: {runway.get('nextSafestAction') or ''}",
        "",
        "## Counts",
        "",
        f"- Runway rows: `{counts.get('rows', 0)}`",
        f"- Review-blocked rows: `{counts.get('reviewBlockedRows', 0)}`",
        f"- Approval-ready rows: `{counts.get('approvalReadyRows', 0)}`",
        f"- Packet repair rows: `{counts.get('packetRepairRows', 0)}`",
        f"- Receipt-captured rows: `{counts.get('receiptCapturedRows', 0)}`",
        f"- Draft schedule rows: `{counts.get('draftScheduleRows', 0)}`",
        "",
        "## Four separate stations",
        "",
    ]
    for step in runway.get("operatorSteps") or []:
        lines.extend([
            f"### {step.get('step')}",
            "",
            f"- Human: {step.get('human')}",
            f"- Codex-safe: {step.get('agent')}",
            f"- Blocked until: {step.get('blockedUntil')}",
            "",
        ])
    lines.extend([
        "## Start here rows",
        "",
        "These rows are local review and packet-prep work only. They are not scheduled posts, approvals, uploads, publications, analytics, or receipt truth.",
        "",
    ])
    for row in runway.get("rows") or []:
        lines.extend([
            f"### {row.get('rank')}. {row.get('reviewObject')}",
            "",
            f"- Stage: `{row.get('stage')}` ({row.get('stageLabel')})",
            f"- Packet ready: `{row.get('packetReady', False)}`; upload draft ready: `{row.get('uploadDraftReady', False)}`; assets: `{row.get('assetCount', 0)}`",
            f"- Gate: `{row.get('nextGate')}` - {row.get('blockedReason')}",
            f"- Human: {row.get('humanStep')}",
            f"- Codex-safe: {row.get('agentStep')}",
            f"- Next: {row.get('nextSafestAction')}",
            f"- Open metadata: `{row.get('openMetadataCommand')}`",
            f"- Open checklist: `{row.get('openChecklistCommand')}`",
            f"- Open upload draft: `{row.get('openUploadJobCommand')}`",
            f"- Review dry-run: `{row.get('reviewDryRunCommandTemplate')}`",
            f"- Receipt dry-run: `{row.get('receiptDryRunCommandTemplate')}`",
            f"- Truth: {row.get('truth')}",
            "",
        ])
    review_week = runway.get("reviewWeekPlanSummary") if isinstance(runway.get("reviewWeekPlanSummary"), dict) else {}
    lines.extend([
        "## Review-week summary",
        "",
        f"- Mode: `{review_week.get('mode') or 'draft-only-not-scheduled'}`",
        f"- Slots: `{review_week.get('slotCount', 0)}`",
        f"- Next: {review_week.get('nextSafestAction') or ''}",
        "",
        "## Regenerate after local review",
        "",
        "```bash",
        "./script/agentctl.sh tower-social-command-center && ./script/agentctl.sh quipsly-os-refresh",
        "```",
        "",
    ])
    path.write_text("\n".join(lines).rstrip() + "\n", encoding="utf-8")


def write_manual_publishing_action_cards_markdown(path: Path, packet: dict[str, Any]) -> None:
    deck = packet.get("manualPublishingActionCards") if isinstance(packet.get("manualPublishingActionCards"), dict) else {}
    counts = deck.get("counts") if isinstance(deck.get("counts"), dict) else {}
    allowed = deck.get("allowedLocalActions") if isinstance(deck.get("allowedLocalActions"), list) else []
    lines = [
        "# Tower publishing action cards",
        "",
        f"Generated: `{packet.get('generatedAt')}`",
        "",
        deck.get("truth") or "Local publishing action cards only.",
        "",
        "These cards are the safe handoff between local packets and real platforms. They are not approvals, scheduled posts, uploads, publications, analytics, or receipt truth.",
        "",
        f"Next safest action: {deck.get('nextSafestAction') or ''}",
        "",
        "## Counts",
        "",
        f"- Cards: `{counts.get('cards', 0)}`",
        f"- Review packet cards: `{counts.get('reviewPacket', 0)}`",
        f"- Repair packet cards: `{counts.get('repairPacket', 0)}`",
        f"- Approval request cards: `{counts.get('requestApproval', 0)}`",
        f"- Empty receipt slots: `{counts.get('receiptSlots', 0)}`",
        "",
        "## Shorts companion",
        "",
        f"- Shorts publishing action cards: `{packet.get('shortsPublishingActionCardsPath') or 'not generated yet'}`",
        "",
        "## Allowed local actions",
        "",
    ]
    lines.extend(f"- `{action}`" for action in allowed)
    lines.extend(["", "## Cards", ""])
    for card in deck.get("cards") or []:
        evidence = card.get("packetEvidence") if isinstance(card.get("packetEvidence"), dict) else {}
        commands = card.get("commands") if isinstance(card.get("commands"), dict) else {}
        gate = card.get("postingGate") if isinstance(card.get("postingGate"), dict) else {}
        lines.extend([
            f"### {card.get('rank')}. Episode {int(card.get('episode') or 0):02d} / {card.get('platform')} / {card.get('suggestedLocalAction')}",
            "",
            f"- ID: `{card.get('id')}`",
            f"- Version: `{card.get('version')}`",
            f"- Stage: `{card.get('stage')}` ({card.get('stageLabel')})",
            f"- Approval state: `{card.get('approvalState')}`",
            f"- Publication state: `{card.get('publicationState')}`",
            f"- Receipt slot: `{card.get('receiptSlot')}`",
            f"- Packet evidence: metadata=`{evidence.get('metadataReady', False)}`, checklist=`{evidence.get('checklistReady', False)}`, uploadDraft=`{evidence.get('uploadDraftReady', False)}`, assets=`{evidence.get('assetCount', 0)}`, warnings=`{evidence.get('warnings', 0)}`, blockers=`{evidence.get('blockers', 0)}`",
            f"- Gate: `{gate.get('nextGate') or ''}` - {gate.get('blockedReason') or ''}",
            f"- Human decision: {card.get('humanDecisionNeeded')}",
            f"- Codex-safe move: {card.get('codexSafeMove')}",
            f"- Next: {card.get('nextSafestAction')}",
            "",
            "#### Manual checklist",
            "",
        ])
        lines.extend(f"- {item}" for item in card.get("manualChecklist") or [])
        lines.extend([
            "",
            "#### Safe commands",
            "",
            f"- Open metadata: `{commands.get('openMetadata') or ''}`",
            f"- Open checklist: `{commands.get('openChecklist') or ''}`",
            f"- Open upload draft: `{commands.get('openUploadDraft') or ''}`",
            f"- Review dry-run: `{commands.get('reviewDryRun') or ''}`",
            f"- Receipt dry-run: `{commands.get('receiptDryRun') or ''}`",
            "",
            "#### Copyable local note",
            "",
            "```yaml",
            str(card.get("localPostingNoteYaml") or "").strip(),
            "```",
            "",
            f"Truth: {card.get('truth')}",
            "",
        ])
    path.write_text("\n".join(lines).rstrip() + "\n", encoding="utf-8")


def write_shorts_publishing_action_cards_markdown(path: Path, packet: dict[str, Any]) -> None:
    deck = packet.get("shortsPublishingActionCards") if isinstance(packet.get("shortsPublishingActionCards"), dict) else {}
    counts = deck.get("counts") if isinstance(deck.get("counts"), dict) else {}
    allowed = deck.get("allowedLocalActions") if isinstance(deck.get("allowedLocalActions"), list) else []
    lines = [
        "# Tower shorts publishing action cards",
        "",
        f"Generated: `{packet.get('generatedAt')}`",
        "",
        deck.get("truth") or "Local shorts publishing action cards only.",
        "",
        "These cards are for watch/listen review, caption/title fit, and manual posting prep. They are not approvals, scheduled posts, uploads, publications, analytics, or receipt truth.",
        "",
        f"Next safest action: {deck.get('nextSafestAction') or ''}",
        "",
        "## Counts",
        "",
        f"- Cards: `{counts.get('cards', 0)}`",
        f"- Source platform rows: `{counts.get('sourcePlatformRows', 0)}`",
        f"- Reviewable shorts: `{counts.get('reviewableShorts', 0)}`",
        f"- Empty receipt slots: `{counts.get('receiptSlots', 0)}`",
        "",
        "## Allowed local actions",
        "",
    ]
    lines.extend(f"- `{action}`" for action in allowed)
    lines.extend(["", "## Cards", ""])
    for card in deck.get("cards") or []:
        commands = card.get("commands") if isinstance(card.get("commands"), dict) else {}
        gate = card.get("postingGate") if isinstance(card.get("postingGate"), dict) else {}
        lines.extend([
            f"### {card.get('episodeKey')} / Short {card.get('shortIndex')} / {card.get('platform')}",
            "",
            f"- ID: `{card.get('id')}`",
            f"- Stage: `{card.get('stage')}`",
            f"- Suggested local action: `{card.get('suggestedLocalAction')}`",
            f"- Approval state: `{card.get('approvalState')}`",
            f"- Publication state: `{card.get('publicationState')}`",
            f"- Receipt slot: `{card.get('receiptSlot')}`",
            f"- Duration: `{card.get('durationSeconds')}` seconds",
            f"- Aspect: `{card.get('aspectFit')}`",
            f"- Gate: `{gate.get('nextGate') or ''}` - {gate.get('blockedReason') or ''}",
            f"- Title draft: {card.get('titleDraft')}",
            f"- Caption draft: {card.get('captionDraft')}",
            f"- Platform check: {card.get('platformCheck')}",
            f"- Human decision: {card.get('humanDecisionNeeded')}",
            f"- Codex-safe move: {card.get('codexSafeMove')}",
            f"- Next: {card.get('nextSafestAction')}",
            "",
            "#### Manual checklist",
            "",
        ])
        lines.extend(f"- {item}" for item in card.get("manualChecklist") or [])
        lines.extend([
            "",
            "#### Safe commands",
            "",
            f"- Open export: `{commands.get('openExport') or ''}`",
            f"- Reveal export: `{commands.get('revealExport') or ''}`",
            f"- Keep local review: `{commands.get('keepLocalReview') or ''}`",
            f"- Refine local review: `{commands.get('refineLocalReview') or ''}`",
            f"- Reject local review: `{commands.get('rejectLocalReview') or ''}`",
            f"- Command safety: {card.get('commandSafety') or ''}",
            "",
            "#### Copyable local note",
            "",
            "```yaml",
            str(card.get("localPostingNoteYaml") or "").strip(),
            "```",
            "",
            f"Truth: {card.get('truth')}",
            "",
        ])
    path.write_text("\n".join(lines).rstrip() + "\n", encoding="utf-8")


def esc(value: Any) -> str:
    return html.escape(str(value or ""))


def write_html(path: Path, packet: dict[str, Any]) -> None:
    runway = packet.get("socialPublishingRunway") if isinstance(packet.get("socialPublishingRunway"), dict) else {}
    rehearsal = packet.get("firstPostingRehearsal") if isinstance(packet.get("firstPostingRehearsal"), dict) else {}
    action_deck = packet.get("manualPublishingActionCards") if isinstance(packet.get("manualPublishingActionCards"), dict) else {}
    shorts_action_deck = packet.get("shortsPublishingActionCards") if isinstance(packet.get("shortsPublishingActionCards"), dict) else {}
    runway_can = "".join(f"<li>{esc(item)}</li>" for item in runway.get("whatTowerCanDoNow") or [])
    runway_cannot = "".join(f"<li>{esc(item)}</li>" for item in runway.get("whatTowerCannotClaimYet") or [])
    action_cards_html = "".join(
        f"""
        <article class=\"action-card {esc(card.get('suggestedLocalAction'))}\">
          <div class=\"eyebrow\">#{esc(card.get('rank'))} · Episode {int(card.get('episode') or 0):02d} · {esc(card.get('platform'))}</div>
          <h2>{esc(card.get('suggestedLocalAction'))}</h2>
          <p>{esc(card.get('nextSafestAction'))}</p>
          <div class=\"chips\">
            <span>{esc(card.get('approvalState'))}</span>
            <span>{esc(card.get('publicationState'))}</span>
            <span>{esc(card.get('receiptSlot'))}</span>
          </div>
          <p><strong>Human:</strong> {esc(card.get('humanDecisionNeeded'))}</p>
          <p><strong>Codex-safe:</strong> {esc(card.get('codexSafeMove'))}</p>
          <details open><summary>Copyable local note</summary><pre><code>{esc(card.get('localPostingNoteYaml'))}</code></pre></details>
          <p><strong>Truth:</strong> {esc(card.get('truth'))}</p>
        </article>
        """
        for card in action_deck.get("cards") or []
    )
    shorts_action_cards_html = "".join(
        f"""
        <article class=\"action-card watch-listen-review\">
          <div class=\"eyebrow\">{esc(card.get('episodeKey'))} · Short {esc(card.get('shortIndex'))} · {esc(card.get('platform'))}</div>
          <h2>{esc(card.get('titleDraft'))}</h2>
          <p>{esc(card.get('nextSafestAction'))}</p>
          <div class=\"chips\">
            <span>{esc(card.get('suggestedLocalAction'))}</span>
            <span>{esc(card.get('aspectFit'))}</span>
            <span>{esc(card.get('publicationState'))}</span>
            <span>{esc(card.get('receiptSlot'))}</span>
          </div>
          <p><strong>Caption:</strong> {esc(card.get('captionDraft'))}</p>
          <details open><summary>Safe local review commands</summary>
            <pre><code>{esc((card.get('commands') or {}).get('openExport'))}</code></pre>
            <pre><code>{esc((card.get('commands') or {}).get('revealExport'))}</code></pre>
            <pre><code>{esc((card.get('commands') or {}).get('keepLocalReview'))}</code></pre>
            <pre><code>{esc((card.get('commands') or {}).get('refineLocalReview'))}</code></pre>
            <pre><code>{esc((card.get('commands') or {}).get('rejectLocalReview'))}</code></pre>
            <p>{esc(card.get('commandSafety'))}</p>
          </details>
          <details><summary>Copyable local note</summary><pre><code>{esc(card.get('localPostingNoteYaml'))}</code></pre></details>
          <p><strong>Truth:</strong> {esc(card.get('truth'))}</p>
        </article>
        """
        for card in shorts_action_deck.get("cards") or []
    )
    workflow_html = "".join(
        f"""
        <article class=\"workflow-step\">
          <h2>{esc(step.get('step'))}</h2>
          <p><strong>Human:</strong> {esc(step.get('humanAsk'))}</p>
          <p><strong>Agent-safe:</strong> {esc(step.get('agentSafeParallelWork'))}</p>
          <p><strong>Blocked here:</strong> {esc(step.get('blockedHere'))}</p>
        </article>
        """
        for step in packet.get("manualPublishingWorkflow") or []
    )
    start_here_html = "".join(
        f"""
        <article class=\"start-card {esc(item.get('stage'))}\">
          <div class=\"rank\">#{esc(item.get('rank'))}</div>
          <div>
            <div class=\"eyebrow\">{esc(item.get('reviewObject') or ('Episode ' + str(int(item.get('episode') or 0)).zfill(2) + ' · ' + str(item.get('platform'))))}</div>
            <h2>{esc(item.get('stageLabel'))}</h2>
            <div class=\"chips\">
              <span>{esc(item.get('version'))}</span>
              <span>{'metadata packet' if (item.get('localPacketStatus') or {}).get('metadataReady') else 'metadata gap'}</span>
              <span>{'checklist' if (item.get('localPacketStatus') or {}).get('checklistReady') else 'checklist gap'}</span>
              <span>{esc((item.get('localPacketStatus') or {}).get('assetCount'))} assets</span>
              <span>{esc((item.get('blockingEvidence') or {}).get('receiptStatus'))}</span>
            </div>
            <p><strong>Posting gate:</strong> {esc((item.get('postingGate') or {}).get('nextGate'))} · {esc((item.get('postingGate') or {}).get('blockedReason'))}</p>
            <p><strong>Human:</strong> {esc(item.get('humanAsk'))}</p>
            <p><strong>Codex-safe:</strong> {esc(item.get('agentSafeParallelWork'))}</p>
            <p>{esc(item.get('nextSafestAction'))}</p>
            <details open><summary>Safe commands</summary>
              <pre><code>{esc(item.get('firstSafeActionCommand'))}</code></pre>
              <pre><code>{esc(item.get('openMetadataCommand'))}</code></pre>
              <pre><code>{esc(item.get('openChecklistCommand'))}</code></pre>
              <pre><code>{esc(item.get('openUploadJobCommand'))}</code></pre>
              <pre><code>{esc(item.get('reviewDryRunCommandTemplate'))}</code></pre>
              <pre><code>{esc(item.get('receiptDryRunCommandTemplate'))}</code></pre>
            </details>
          </div>
        </article>
        """
        for item in packet.get("startHereQueue") or []
    )
    batches_html = "".join(
        f"""
        <article class=\"batch-card {esc(batch.get('stage'))}\">
          <div class=\"eyebrow\">{esc(batch.get('stage'))}</div>
          <h2>{esc(batch.get('label'))}</h2>
          <p><strong>{esc(batch.get('count'))}</strong> row(s) across {esc(batch.get('episodeCount'))} episode(s) and {esc(batch.get('platformCount'))} platform(s).</p>
          <p><strong>Human:</strong> {esc(batch.get('humanAsk'))}</p>
          <p><strong>Codex-safe:</strong> {esc(batch.get('agentSafeParallelWork'))}</p>
          <p><strong>Next:</strong> {esc(batch.get('nextSafestAction'))}</p>
          <p><strong>Truth:</strong> {esc(batch.get('truth'))}</p>
        </article>
        """
        for batch in packet.get("publicationBatches") or []
    )
    rehearsal_steps_html = "".join(f"<li>{esc(step)}</li>" for step in rehearsal.get("steps") or [])
    rehearsal_do_not_html = "".join(f"<li>{esc(item)}</li>" for item in rehearsal.get("doNotDo") or [])
    rehearsal_long_html = "".join(
        f"""
        <article class=\"rehearsal-card {esc(item.get('stage'))}\">
          <div class=\"eyebrow\">{esc(item.get('reviewObject'))}</div>
          <h2>{esc(item.get('stageLabel'))}</h2>
          <p>{esc(item.get('nextSafestAction'))}</p>
          <pre><code>{esc(item.get('openMetadataCommand'))}</code></pre>
          <pre><code>{esc(item.get('openChecklistCommand'))}</code></pre>
          <pre><code>{esc(item.get('reviewDryRunCommandTemplate'))}</code></pre>
        </article>
        """
        for item in rehearsal.get("longFormRows") or []
    )
    rehearsal_shorts_html = "".join(
        f"""
        <article class=\"rehearsal-card short\">
          <div class=\"eyebrow\">{esc(row.get('episodeKey'))} · Short {esc(row.get('shortIndex'))} · {esc(row.get('platform'))}</div>
          <h2>{esc(row.get('title'))}</h2>
          <p>{esc(row.get('nextSafestAction'))}</p>
          <pre><code>{esc(row.get('openExportCommand'))}</code></pre>
          <pre><code>{esc((row.get('shortReviewCommands') or {}).get('keep'))}</code></pre>
          <pre><code>{esc((row.get('shortReviewCommands') or {}).get('refine'))}</code></pre>
          <pre><code>{esc((row.get('shortReviewCommands') or {}).get('reject'))}</code></pre>
        </article>
        """
        for row in rehearsal.get("shortsRows") or []
    )
    shorts_runway = packet.get("shortsSocialRunway") if isinstance(packet.get("shortsSocialRunway"), dict) else {}
    shorts_counts = shorts_runway.get("counts") if isinstance(shorts_runway.get("counts"), dict) else {}
    shorts_html = "".join(
        f"""
        <article class=\"short-social-card\">
          <div class=\"eyebrow\">{esc(row.get('episodeKey'))} · Short {esc(row.get('shortIndex'))} · {esc(row.get('platform'))}</div>
          <h2>{esc(row.get('title'))}</h2>
          <p><strong>Gate:</strong> {esc((row.get('postingGate') or {}).get('nextGate'))} · {esc((row.get('postingGate') or {}).get('blockedReason'))}</p>
          <p><strong>Caption draft:</strong> {esc(row.get('captionDraft'))}</p>
          <p><strong>Check:</strong> {esc(row.get('check'))}</p>
          <p>{esc(row.get('nextSafestAction'))}</p>
          <pre><code>{esc(row.get('openExportCommand'))}</code></pre>
          <pre><code>{esc((row.get('shortReviewCommands') or {}).get('keep'))}</code></pre>
          <pre><code>{esc((row.get('shortReviewCommands') or {}).get('refine'))}</code></pre>
          <pre><code>{esc((row.get('shortReviewCommands') or {}).get('reject'))}</code></pre>
        </article>
        """
        for row in (shorts_runway.get("startHereQueue") or [])[:12]
    )
    review_week = packet.get("reviewWeekPlan") if isinstance(packet.get("reviewWeekPlan"), dict) else {}
    review_week_html = "".join(
        f"""
        <article class=\"review-week-card\">
          <div class=\"eyebrow\">Day {esc(slot.get('day'))} · {esc(slot.get('lane'))}</div>
          <h2>{esc(slot.get('title'))}</h2>
          <p>{esc(slot.get('action'))}</p>
          <p><strong>Source:</strong> {esc(slot.get('sourceTitle') or '-')}</p>
          <p><strong>Stage:</strong> {esc(slot.get('stage'))}</p>
          <pre><code>{esc(slot.get('command') or '-')}</code></pre>
        </article>
        """
        for slot in review_week.get("slots") or []
    )
    cards = []
    for index, item in enumerate(packet.get("items") or [], start=1):
        warnings = "".join(f"<li>{esc(w)}</li>" for w in item.get("warnings") or []) or "<li>none</li>"
        gate = item.get("postingGate") if isinstance(item.get("postingGate"), dict) else {}
        links = []
        for label, key, uri_key in [("metadata", "metadataPath", "metadataUri"), ("checklist", "checklistPath", "checklistUri"), ("upload draft", "uploadJobPath", "uploadJobUri")]:
            value = item.get(key) or ""
            uri = item.get(uri_key) or ""
            if value and uri:
                links.append(f"<a href=\"{esc(uri)}\">{label}</a>")
            else:
                links.append(f"<span>{label}: missing</span>")
        open_commands = [
            ("metadata", item.get("openMetadataCommand") or ""),
            ("checklist", item.get("openChecklistCommand") or ""),
            ("upload draft", item.get("openUploadJobCommand") or ""),
        ]
        open_command_html = "".join(
            f"<li><strong>{esc(label)}</strong><code>{esc(command)}</code></li>"
            for label, command in open_commands
            if command
        ) or "<li>No local packet files found yet.</li>"
        cards.append(f"""
        <article class=\"queue-card {esc(item['stage'])}\">
          <div class=\"rank\">#{index}</div>
          <div>
            <div class=\"eyebrow\">Episode {int(item['episode']):02d} · {esc(item['platform'])}</div>
            <h2>{esc(item['stageLabel'])}</h2>
            <p>{esc(item['nextSafestAction'])}</p>
            <p><strong>Posting gate:</strong> {esc(gate.get('nextGate'))} · {esc(gate.get('blockedReason'))}</p>
            <div class=\"chips\">
              <span>{esc(item['episodeStatus'])}</span>
              <span>{esc(item['receiptStatus'])}</span>
              <span>{'metadata ready' if item.get('localMetadataReady') else 'metadata gap'}</span>
              <span>{esc(item.get('assetCount'))} assets</span>
              <span>{'posting blocked' if not gate.get('externalPostingAllowedNow') else 'posting allowed'}</span>
            </div>
            <div class=\"links\">{' · '.join(links)}</div>
            <details><summary>Local open commands</summary><ul class=\"commands\">{open_command_html}</ul></details>
            <details open><summary>First safe review action</summary><pre><code>{esc(item['firstSafeActionCommand'])}</code></pre><pre><code>{esc(item['reviewDryRunCommandTemplate'])}</code></pre><pre><code>{esc(item['reviewCommandTemplate'])}</code></pre></details>
            <details><summary>Warnings</summary><ul>{warnings}</ul></details>
            <details><summary>Receipt commands: dry-run before local receipt capture</summary><p>{esc(item['receiptCommandSafety'])}</p><pre><code>{esc(item['receiptDryRunCommandTemplate'])}</code></pre><pre><code>{esc(item['receiptCommandTemplate'])}</code></pre></details>
          </div>
        </article>
        """)
    html_text = f"""<!doctype html>
<html lang=\"en\">
<head>
  <meta charset=\"utf-8\">
  <meta name=\"viewport\" content=\"width=device-width, initial-scale=1\">
  <title>Quipsly Tower Social Command Center</title>
  <style>
    :root {{ color-scheme:dark; --bg:#0d1517; --panel:#17272b; --ink:#fbf3df; --muted:#cabc9d; --sky:#8dccd9; --gold:#e7c45e; --moss:#8dbb73; --clay:#c87858; --line:rgba(251,243,223,.15); }}
    * {{ box-sizing:border-box; }}
    body {{ margin:0; font-family:Avenir Next, Helvetica Neue, sans-serif; color:var(--ink); background:radial-gradient(circle at top right, rgba(141,204,217,.2), transparent 35%), linear-gradient(180deg,#102022,#0d1517); }}
    header {{ padding:42px clamp(22px,5vw,76px); border-bottom:1px solid var(--line); }}
    .eyebrow {{ color:var(--gold); text-transform:uppercase; letter-spacing:.2em; font-size:12px; font-weight:900; }}
    h1 {{ margin:8px 0; font-size:clamp(42px,7vw,86px); line-height:.92; max-width:1100px; }}
    h2 {{ margin:6px 0 8px; font-size:26px; }}
    p {{ color:var(--muted); line-height:1.5; max-width:980px; }}
    .summary {{ display:flex; flex-wrap:wrap; gap:10px; margin-top:20px; }}
    .summary span, .chips span {{ border:1px solid var(--line); border-radius:999px; padding:8px 11px; background:rgba(255,255,255,.05); color:var(--muted); font-weight:800; }}
    .runway {{ margin-top:24px; display:grid; grid-template-columns:minmax(0,1fr) minmax(280px,.7fr); gap:14px; }}
    .runway-card {{ border:1px solid rgba(231,196,94,.36); border-radius:24px; padding:16px; background:rgba(231,196,94,.07); }}
    .runway-card li {{ color:var(--muted); margin:6px 0; }}
    main {{ padding:26px clamp(16px,4vw,58px) 70px; display:grid; grid-template-columns:repeat(auto-fit,minmax(360px,1fr)); gap:16px; }}
    .start-here {{ grid-column:1 / -1; border:1px solid rgba(231,196,94,.32); border-radius:28px; padding:18px; background:rgba(231,196,94,.06); }}
    .start-here h2 {{ margin:0 0 12px; }}
    .start-grid {{ display:grid; grid-template-columns:repeat(auto-fit,minmax(320px,1fr)); gap:12px; }}
    .action-deck {{ grid-column:1 / -1; border:1px solid rgba(231,196,94,.32); border-radius:28px; padding:18px; background:rgba(231,196,94,.055); }}
    .action-grid {{ display:grid; grid-template-columns:repeat(auto-fit,minmax(320px,1fr)); gap:12px; }}
    .action-card {{ border:1px solid var(--line); border-radius:22px; padding:16px; background:rgba(255,255,255,.045); }}
    .action-card.review-packet, .action-card.repair-packet {{ border-color:rgba(200,120,88,.62); }}
    .action-card.request-approval {{ border-color:rgba(141,187,115,.6); }}
    .rehearsal {{ grid-column:1 / -1; border:1px solid rgba(141,204,217,.36); border-radius:28px; padding:18px; background:rgba(141,204,217,.06); }}
    .rehearsal-layout {{ display:grid; grid-template-columns:minmax(260px,.7fr) minmax(0,1.3fr); gap:14px; }}
    .rehearsal-grid {{ display:grid; grid-template-columns:repeat(auto-fit,minmax(280px,1fr)); gap:12px; }}
    .rehearsal-card {{ border:1px solid var(--line); border-radius:22px; padding:16px; background:rgba(255,255,255,.045); }}
    .rehearsal-card.short {{ border-color:rgba(141,187,115,.45); }}
    .batches {{ grid-column:1 / -1; border:1px solid rgba(141,204,217,.24); border-radius:28px; padding:18px; background:rgba(141,204,217,.045); }}
    .batch-grid {{ display:grid; grid-template-columns:repeat(auto-fit,minmax(260px,1fr)); gap:12px; }}
    .batch-card {{ border:1px solid var(--line); border-radius:22px; padding:16px; background:rgba(255,255,255,.045); }}
    .review-week {{ grid-column:1 / -1; border:1px solid rgba(141,187,115,.32); border-radius:28px; padding:18px; background:rgba(141,187,115,.06); }}
    .review-week-grid {{ display:grid; grid-template-columns:repeat(auto-fit,minmax(280px,1fr)); gap:12px; }}
    .review-week-card {{ border:1px solid var(--line); border-radius:22px; padding:16px; background:rgba(255,255,255,.045); }}
    .batch-card.ready-for-approval {{ border-color:rgba(141,187,115,.6); }}
    .batch-card.receipt-captured {{ border-color:rgba(141,204,217,.6); }}
    .batch-card.warning-decision-needed, .batch-card.blocked-local-package, .batch-card.review-needs-work, .batch-card.needs-human-review {{ border-color:rgba(200,120,88,.68); }}
    .start-card, .queue-card {{ display:grid; grid-template-columns:auto 1fr; gap:14px; border:1px solid var(--line); border-radius:24px; padding:18px; background:linear-gradient(180deg,rgba(23,39,43,.97),rgba(9,14,15,.97)); box-shadow:0 20px 56px rgba(0,0,0,.25); }}
    .queue-card.warning-decision-needed, .queue-card.blocked-local-package, .queue-card.review-needs-work {{ border-color:rgba(200,120,88,.68); }}
    .queue-card.ready-for-approval {{ border-color:rgba(141,187,115,.6); }}
    .queue-card.receipt-captured {{ border-color:rgba(141,204,217,.6); }}
    .start-card.warning-decision-needed, .start-card.blocked-local-package, .start-card.review-needs-work, .start-card.needs-human-review {{ border-color:rgba(200,120,88,.68); }}
    .start-card.ready-for-approval {{ border-color:rgba(141,187,115,.6); }}
    .start-card.receipt-captured {{ border-color:rgba(141,204,217,.6); }}
    .rank {{ color:var(--gold); font-weight:900; padding-top:3px; }}
    .chips {{ display:flex; flex-wrap:wrap; gap:8px; margin:12px 0; }}
    .links {{ color:var(--muted); margin:10px 0; }}
    a {{ color:var(--sky); }}
    details {{ color:var(--muted); margin-top:10px; }}
    pre {{ white-space:pre-wrap; overflow-wrap:anywhere; border:1px solid var(--line); border-radius:14px; padding:10px; background:rgba(0,0,0,.23); color:var(--sky); }}
    .commands {{ padding-left:18px; }}
    .commands li {{ display:grid; gap:5px; }}
    .commands strong {{ color:var(--gold); text-transform:uppercase; letter-spacing:.08em; font-size:11px; }}
    .workflow {{ grid-column:1 / -1; display:grid; grid-template-columns:repeat(auto-fit,minmax(260px,1fr)); gap:12px; }}
    .workflow-step {{ border-color:rgba(231,196,94,.32); }}
    .shorts-runway {{ grid-column:1 / -1; border:1px solid rgba(141,187,115,.28); border-radius:28px; padding:18px; background:rgba(141,187,115,.055); }}
    .shorts-grid {{ display:grid; grid-template-columns:repeat(auto-fit,minmax(300px,1fr)); gap:12px; }}
    .short-social-card {{ border:1px solid var(--line); border-radius:22px; padding:16px; background:rgba(255,255,255,.04); }}
    @media (max-width:900px) {{ .runway, .rehearsal-layout {{ grid-template-columns:1fr; }} }}
  </style>
</head>
<body>
  <header>
    <div class=\"eyebrow\">Quipsly Tower</div>
    <h1>Social queue with receipts kept honest.</h1>
    <p>{esc(packet['truth'])}</p>
    <p><strong>Human ask:</strong> {esc(packet.get('humanAsk'))}</p>
    <p><strong>Agent-safe work:</strong> {esc(packet.get('agentSafeParallelWork'))}</p>
    <p>{esc(packet['nextSafestAction'])}</p>
    <div class=\"summary\">
      <span>{packet['counts']['items']} queue rows</span>
      <span>{packet['counts']['readyForApproval']} ready for approval</span>
      <span>{packet['counts']['blockedOrReview']} review/warning rows</span>
      <span>{packet['counts']['capturedReceipts']} receipts captured</span>
      <span>{packet['counts']['draftOnlySchedules']} draft-only schedule rows</span>
      <span>{packet['counts'].get('publicationBatches', 0)} publication batches</span>
    </div>
    <div class=\"runway\">
      <article class=\"runway-card\">
        <div class=\"eyebrow\">Social publishing runway</div>
        <h2>{esc(runway.get('mode'))}</h2>
        <p>{esc(runway.get('summary'))}</p>
        <p><strong>Next:</strong> {esc(runway.get('nextOperatingMove'))}</p>
      </article>
      <article class=\"runway-card\">
        <div class=\"eyebrow\">Truth locks</div>
        <h2>Prepare, do not pretend</h2>
        <p><strong>Can do now</strong></p><ul>{runway_can}</ul>
        <p><strong>Cannot claim yet</strong></p><ul>{runway_cannot}</ul>
      </article>
    </div>
  </header>
  <main><section class=\"action-deck\"><h2>Tower publishing action cards</h2><p>{esc(action_deck.get('truth'))}</p><p>{esc(action_deck.get('nextSafestAction'))}</p><div class=\"summary\"><span>{esc((action_deck.get('counts') or {}).get('cards', 0))} cards</span><span>{esc((action_deck.get('counts') or {}).get('reviewPacket', 0))} review</span><span>{esc((action_deck.get('counts') or {}).get('repairPacket', 0))} repair</span><span>{esc((action_deck.get('counts') or {}).get('requestApproval', 0))} approval requests</span><span>0 external posts</span></div><div class=\"action-grid\">{action_cards_html}</div></section><section class=\"action-deck\"><h2>Shorts publishing action cards</h2><p>{esc(shorts_action_deck.get('truth'))}</p><p>{esc(shorts_action_deck.get('nextSafestAction'))}</p><div class=\"summary\"><span>{esc((shorts_action_deck.get('counts') or {}).get('cards', 0))} cards</span><span>{esc((shorts_action_deck.get('counts') or {}).get('sourcePlatformRows', 0))} platform rows known</span><span>{esc((shorts_action_deck.get('counts') or {}).get('reviewableShorts', 0))} reviewable shorts</span><span>0 external posts</span></div><div class=\"action-grid\">{shorts_action_cards_html}</div></section><section class=\"rehearsal\"><h2>First posting rehearsal: practice without posting</h2><div class=\"rehearsal-layout\"><div><p>{esc(rehearsal.get('goal'))}</p><p>{esc(rehearsal.get('whyItExists'))}</p><p><strong>Done when:</strong> {esc(rehearsal.get('doneWhen'))}</p><p><strong>Truth:</strong> {esc(rehearsal.get('truth'))}</p><h3>Steps</h3><ul>{rehearsal_steps_html}</ul><h3>Do not do</h3><ul>{rehearsal_do_not_html}</ul></div><div class=\"rehearsal-grid\">{rehearsal_long_html}{rehearsal_shorts_html}</div></div></section><section class=\"review-week\"><h2>{esc(review_week.get('title') or 'Five-day local review plan')}</h2><p>{esc(review_week.get('truth'))}</p><p>{esc(review_week.get('goal'))}</p><div class=\"summary\"><span>{esc((review_week.get('counts') or {}).get('slots', 0))} slots</span><span>{esc((review_week.get('counts') or {}).get('days', 0))} days</span><span>0 external schedules</span><span>0 receipts</span></div><div class=\"review-week-grid\">{review_week_html}</div></section><section class=\"batches\"><h2>Publication batches: work the safest stage first</h2><div class=\"batch-grid\">{batches_html}</div></section><section class=\"shorts-runway\"><h2>Shorts social runway</h2><p>{esc(shorts_runway.get('truth'))}</p><div class=\"summary\"><span>{esc(shorts_counts.get('shorts', 0))} shorts</span><span>{esc(shorts_counts.get('platformRows', 0))} platform rows</span><span>{esc(shorts_counts.get('reviewableShorts', 0))} reviewable</span><span>{esc(shorts_counts.get('needsAttention', 0))} need attention</span></div><div class=\"shorts-grid\">{shorts_html}</div></section><section class=\"start-here\"><h2>Start here: the next reversible publishing actions</h2><div class=\"start-grid\">{start_here_html}</div></section><section class=\"workflow\">{workflow_html}</section>{''.join(cards)}</main>
</body>
</html>
"""
    path.write_text(html_text, encoding="utf-8")


def update_pointer(root: Path, session_dir: Path, packet: dict[str, Any]) -> None:
    items = packet.get("items") if isinstance(packet.get("items"), list) else []
    first_item = items[0] if items and isinstance(items[0], dict) else {}
    next_publishing_card_path = str(packet.get("nextPublishingCardPath") or "")
    pointer = {
        "schema": "quipsly.tower.latest-social-command-center.v1",
        "updatedAt": iso_now(),
        "status": "social-command-center-ready",
        "sessionDir": str(session_dir),
        "htmlPath": str(session_dir / "index.html"),
        "jsonPath": str(session_dir / "tower-social-command-center.json"),
        "markdownPath": str(session_dir / "START-HERE-Tower-social-command-center.md"),
        "manualPublishingRunwayPath": str(session_dir / "MANUAL-PUBLISHING-RUNWAY.md"),
        "nextPublishingCardPath": next_publishing_card_path,
        "manualPublishingActionCardsPath": str(session_dir / "TOWER-PUBLISHING-ACTION-CARDS.md"),
        "shortsPublishingActionCardsPath": str(session_dir / "SHORTS-PUBLISHING-ACTION-CARDS.md"),
        "csvPath": str(session_dir / "tower-social-queue.csv"),
        "reviewWeekPlanPath": str(session_dir / "tower-five-day-local-review-plan.md"),
        "draftSocialCalendarPath": str(session_dir / "tower-five-day-local-review-plan.md"),
        "counts": packet.get("counts") or {},
        "byStage": packet.get("byStage") or {},
        "byPlatform": packet.get("byPlatform") or {},
        "humanAsk": packet.get("humanAsk") or "",
        "agentSafeParallelWork": packet.get("agentSafeParallelWork") or "",
        "startHereQueue": (packet.get("startHereQueue") or [])[:12],
        "manualPublishingWorkflow": packet.get("manualPublishingWorkflow") or [],
        "manualPublishingRunway": packet.get("manualPublishingRunway") or {},
        "manualPublishingRunwayPath": str(session_dir / "MANUAL-PUBLISHING-RUNWAY.md"),
        "manualPublishingActionCards": packet.get("manualPublishingActionCards") or {},
        "manualPublishingActionCardsPath": str(session_dir / "TOWER-PUBLISHING-ACTION-CARDS.md"),
        "shortsPublishingActionCards": packet.get("shortsPublishingActionCards") or {},
        "shortsPublishingActionCardsPath": str(session_dir / "SHORTS-PUBLISHING-ACTION-CARDS.md"),
        "socialPublishingRunway": packet.get("socialPublishingRunway") or {},
        "publicationBatches": packet.get("publicationBatches") or [],
        "firstPostingRehearsal": packet.get("firstPostingRehearsal") or {},
        "reviewWeekPlan": packet.get("reviewWeekPlan") or {},
        "reviewWeekPlanPath": str(session_dir / "tower-five-day-local-review-plan.md"),
        "draftSocialCalendarPath": str(session_dir / "tower-five-day-local-review-plan.md"),
        "shortsSocialRunway": packet.get("shortsSocialRunway") or {},
        "publicationTruthContract": packet.get("publicationTruthContract") or {},
        "nextSafestAction": packet.get("nextSafestAction") or "Open the social command center and work the first review-blocked row before any manual publishing.",
        "firstSafeAction": packet.get("firstSafeAction") or {},
        "reviewCommandTemplate": packet.get("reviewCommandTemplate") or "",
        "reviewDryRunCommandTemplate": packet.get("reviewDryRunCommandTemplate") or "",
        "receiptCommandSafety": packet.get("receiptCommandSafety") or "",
        "sourceTowerRunway": packet.get("sourceTowerRunway") or "",
        "firstQueueItem": {
            "episode": first_item.get("episode") or "",
            "platform": first_item.get("platform") or "",
            "stage": first_item.get("stage") or "",
            "stageLabel": first_item.get("stageLabel") or "",
            "episodeStatus": first_item.get("episodeStatus") or "",
            "receiptStatus": first_item.get("receiptStatus") or "",
            "metadataPath": first_item.get("metadataPath") or "",
            "checklistPath": first_item.get("checklistPath") or "",
            "uploadJobPath": first_item.get("uploadJobPath") or "",
            "postingGate": first_item.get("postingGate") or {},
            "openMetadataCommand": first_item.get("openMetadataCommand") or "",
            "openChecklistCommand": first_item.get("openChecklistCommand") or "",
            "firstSafeAction": first_item.get("firstSafeAction") or {},
            "firstSafeActionCommand": first_item.get("firstSafeActionCommand") or "",
            "reviewCommandTemplate": first_item.get("reviewCommandTemplate") or "",
            "reviewDryRunCommandTemplate": first_item.get("reviewDryRunCommandTemplate") or "",
            "receiptCommandTemplate": first_item.get("receiptCommandTemplate") or "",
            "receiptDryRunCommandTemplate": first_item.get("receiptDryRunCommandTemplate") or "",
            "receiptCommandSafety": first_item.get("receiptCommandSafety") or "",
            "nextSafestAction": first_item.get("nextSafestAction") or "",
            "truth": first_item.get("truth") or "",
        },
        "truth": "Pointer only. Command-center sessions are versioned and preserved. No external publish, upload, schedule, approval, account mutation, or receipt capture occurred.",
    }
    write_json(root / "tower-social-command-center" / "latest-tower-social-command-center.json", pointer)


def main() -> int:
    parser = argparse.ArgumentParser(description="Build Quipsly Tower social command center.")
    parser.add_argument("root", nargs="?", type=Path, default=DEFAULT_ROOT)
    args = parser.parse_args()
    root = args.root.expanduser().resolve()
    packet = build_command_center(root)
    session_dir = prepare_session_dir(root)
    packet["sessionDir"] = str(session_dir)
    packet["htmlPath"] = str(session_dir / "index.html")
    packet["jsonPath"] = str(session_dir / "tower-social-command-center.json")
    packet["markdownPath"] = str(session_dir / "START-HERE-Tower-social-command-center.md")
    packet["manualPublishingRunwayPath"] = str(session_dir / "MANUAL-PUBLISHING-RUNWAY.md")
    packet["manualPublishingActionCardsPath"] = str(session_dir / "TOWER-PUBLISHING-ACTION-CARDS.md")
    packet["shortsPublishingActionCardsPath"] = str(session_dir / "SHORTS-PUBLISHING-ACTION-CARDS.md")
    packet["csvPath"] = str(session_dir / "tower-social-queue.csv")
    packet["reviewWeekPlanPath"] = str(session_dir / "tower-five-day-local-review-plan.md")
    packet["draftSocialCalendarPath"] = str(session_dir / "tower-five-day-local-review-plan.md")
    next_card_pointer = load_json(root / "tower-next-publishing-card" / "latest-tower-next-publishing-card.json")
    packet["nextPublishingCardPath"] = str(next_card_pointer.get("htmlPath") or "")
    packet["reviewSheetFirstSafeAction"] = packet.get("firstSafeAction") or {}
    first_path = packet["nextPublishingCardPath"] or packet["htmlPath"]
    packet["firstSafeAction"] = {
        "label": "Open Tower next publishing card" if packet["nextPublishingCardPath"] else "Open Tower Social Command Center",
        "path": first_path,
        "command": shell_command(["open", first_path]),
        "safety": "Opens the local social queue and receipt-gap desk only. No external publish, upload, schedule, approval, account mutation, source mutation, overwrite, or receipt capture occurs.",
    }
    write_json(session_dir / "tower-social-command-center.json", packet)
    write_csv(session_dir / "tower-social-queue.csv", packet)
    write_markdown(session_dir / "START-HERE-Tower-social-command-center.md", packet)
    write_manual_publishing_runway_markdown(session_dir / "MANUAL-PUBLISHING-RUNWAY.md", packet)
    write_manual_publishing_action_cards_markdown(session_dir / "TOWER-PUBLISHING-ACTION-CARDS.md", packet)
    write_shorts_publishing_action_cards_markdown(session_dir / "SHORTS-PUBLISHING-ACTION-CARDS.md", packet)
    write_review_week_plan_markdown(session_dir / "tower-five-day-local-review-plan.md", packet)
    write_html(session_dir / "index.html", packet)
    update_pointer(root, session_dir, packet)
    print(json.dumps({
        "ok": True,
        "htmlPath": packet["htmlPath"],
        "jsonPath": packet["jsonPath"],
        "markdownPath": packet["markdownPath"],
        "manualPublishingRunwayPath": packet["manualPublishingRunwayPath"],
        "nextPublishingCardPath": packet.get("nextPublishingCardPath") or "",
        "manualPublishingActionCardsPath": packet["manualPublishingActionCardsPath"],
        "shortsPublishingActionCardsPath": packet["shortsPublishingActionCardsPath"],
        "csvPath": packet["csvPath"],
        "reviewWeekPlanPath": packet["reviewWeekPlanPath"],
        "draftSocialCalendarPath": packet["draftSocialCalendarPath"],
        "counts": packet["counts"],
        "nextSafestAction": packet["nextSafestAction"],
        "firstSafeAction": packet["firstSafeAction"],
        "truth": packet["truth"],
    }, indent=2, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
