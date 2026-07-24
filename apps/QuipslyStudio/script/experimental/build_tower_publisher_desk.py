#!/usr/bin/env python3
"""Build a Tower Publisher Desk front door.

This packet combines the local review sheet, Tower social command center,
draft-only manual calendar, runway packet, and receipt slots into one calm
operator surface. It does not publish, upload, schedule, approve, mutate
accounts, capture receipts, or overwrite prior versions.
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
SCHEMA = "quipsly.tower.publisher-desk.v1"

TOWER_OPERATOR_LADDER = [
    {
        "label": "1. Review local evidence",
        "humanAsk": "Open the review command sheet and inspect local video/audio/shorts evidence before trusting any platform packet.",
        "agentSafeParallelWork": "Summarize review warnings, prepare approve/refine/hold/pending dry-run commands, and identify blockers.",
        "stateTruth": "Review decisions are local until recorded; they are not publication receipts.",
    },
    {
        "label": "2. Inspect platform packet",
        "humanAsk": "Open platform metadata, checklist, and upload-job draft; confirm the packet fits the target platform.",
        "agentSafeParallelWork": "Prepare copy edits, tag/description suggestions, missing-field notes, and platform-specific checklists.",
        "stateTruth": "Platform packets are draft/manual-post prep, not uploads.",
    },
    {
        "label": "3. Plan calendar slot",
        "humanAsk": "Use the manual calendar as intent only after review blockers are clear.",
        "agentSafeParallelWork": "Prepare draft timing options and cross-platform sequencing notes.",
        "stateTruth": "Calendar rows are not external schedules.",
    },
    {
        "label": "4. Explicit manual publishing approval",
        "humanAsk": "Approve the exact item, platform, version, and packet before any external action.",
        "agentSafeParallelWork": "Keep the posting checklist and receipt fields ready.",
        "stateTruth": "Approval is required before publishing, but approval is not a receipt.",
    },
    {
        "label": "5. Capture real receipt",
        "humanAsk": "After the real platform confirms publication, capture URL/provider ID/post time.",
        "agentSafeParallelWork": "Prepare receipt dry-run commands and verify receipt fields.",
        "stateTruth": "External publication is not true until a real receipt exists.",
    },
]


def iso_now() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def stamp() -> str:
    return datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S-%f-tower-publisher-desk")


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


def command(parts: list[Any]) -> str:
    return " ".join(shlex.quote(str(part)) for part in parts)


def open_command(path_value: Any) -> str:
    path_text = str(path_value or "")
    return command(["open", path_text]) if path_text else ""


def load_pointer_and_packet(pointer_path: Path) -> tuple[dict[str, Any], dict[str, Any], Path | None]:
    pointer = load_json(pointer_path)
    packet_path_text = str(pointer.get("jsonPath") or "")
    packet_path = Path(packet_path_text) if packet_path_text else None
    packet = load_json(packet_path) if packet_path and packet_path.exists() else {}
    return pointer, packet, packet_path


def bool_count(rows: list[dict[str, Any]], key: str) -> int:
    return sum(1 for row in rows if row.get(key))


def group_counts(rows: list[dict[str, Any]], key: str) -> dict[str, int]:
    counts: dict[str, int] = {}
    for row in rows:
        value = str(row.get(key) or "Unknown")
        counts[value] = counts.get(value, 0) + 1
    return dict(sorted(counts.items(), key=lambda item: (-item[1], item[0])))


def load_release_status(release_root: Path) -> dict[str, Any]:
    return load_json(release_root / "release-status.json")


def episode_rows_from_release_status(release_status: dict[str, Any]) -> list[dict[str, Any]]:
    episodes = release_status.get("episodes") if isinstance(release_status.get("episodes"), list) else []
    rows: list[dict[str, Any]] = []
    for episode in episodes:
        if not isinstance(episode, dict):
            continue
        warnings = episode.get("warnings") if isinstance(episode.get("warnings"), list) else []
        rows.append({
            "episode": episode.get("episode") or episode.get("episodeNumber") or "",
            "version": episode.get("version") or "",
            "status": episode.get("status") or "",
            "versionDir": episode.get("versionDir") or "",
            "warnings": warnings,
            "warningCount": len(warnings),
            "readyShortCount": episode.get("readyShortCount") or episode.get("shortsReady") or 0,
            "shortCount": episode.get("shortCount") or episode.get("shortsTotal") or 0,
            "longFormDurationSpreadSeconds": episode.get("longFormDurationSpreadSeconds") or 0,
        })
    return sorted(rows, key=lambda row: int(row.get("episode") or 0) if str(row.get("episode") or "").isdigit() else 999)


def review_episode_counts(review_rows: list[dict[str, Any]]) -> dict[str, dict[str, int]]:
    counts: dict[str, dict[str, int]] = {}
    for row in review_rows:
        episode = str(row.get("episode") or "unknown")
        bucket = counts.setdefault(episode, {"reviewRows": 0, "pending": 0, "warnings": 0, "syncInvestigationRows": 0, "durationCandidateRows": 0})
        bucket["reviewRows"] += 1
        if row.get("currentDecision") == "pending":
            bucket["pending"] += 1
        if row.get("warnings"):
            bucket["warnings"] += 1
        if row.get("syncInvestigationHtml") or row.get("syncInvestigationJson"):
            bucket["syncInvestigationRows"] += 1
        if row.get("durationCandidateReviewHtml") or row.get("durationCandidateReviewJson"):
            bucket["durationCandidateRows"] += 1
    return counts


def social_episode_counts(social_items: list[dict[str, Any]]) -> dict[str, dict[str, int]]:
    counts: dict[str, dict[str, int]] = {}
    for item in social_items:
        episode = str(item.get("episode") or "unknown")
        bucket = counts.setdefault(episode, {"platformRows": 0, "blockedOrReview": 0, "readyForApproval": 0, "capturedReceipts": 0})
        bucket["platformRows"] += 1
        stage = str(item.get("stage") or "")
        if stage in {"ready-for-approval", "approved-local-ready-no-receipts", "metadata-ready-needs-approval"}:
            bucket["readyForApproval"] += 1
        elif stage == "receipt-captured" or item.get("receiptStatus") not in {"", None, "not_published"}:
            bucket["capturedReceipts"] += 1
        else:
            bucket["blockedOrReview"] += 1
    return counts


def build_episode_cards(
    release_rows: list[dict[str, Any]],
    review_counts: dict[str, dict[str, int]],
    social_counts: dict[str, dict[str, int]],
) -> list[dict[str, Any]]:
    cards: list[dict[str, Any]] = []
    episode_numbers = sorted({str(row.get("episode")) for row in release_rows if row.get("episode")} | set(review_counts) | set(social_counts), key=lambda value: int(value) if value.isdigit() else 999)
    release_by_episode = {str(row.get("episode")): row for row in release_rows}
    for episode in episode_numbers:
        release = release_by_episode.get(episode, {})
        review = review_counts.get(episode, {})
        social = social_counts.get(episode, {})
        warning_count = int(release.get("warningCount") or 0) + int(review.get("warnings") or 0)
        if int(review.get("pending") or 0) or warning_count:
            next_action = "Review local artifacts and warnings before any platform packet is trusted."
            status = "needs-local-review"
            gate_reason = "Local review is not complete. Platform packets must stay draft-only until pending rows and warnings are resolved."
        elif int(social.get("readyForApproval") or 0):
            next_action = "Packet can be approved for manual posting only after Charlie explicitly says yes."
            status = "ready-for-explicit-approval"
            gate_reason = "Local packet metadata is ready, but publishing still needs explicit human approval and later receipt capture."
        else:
            next_action = "Keep receipt slots honest; do not call it published until a real URL/provider receipt exists."
            status = "receipt-truth-needed"
            gate_reason = "Publishing cannot be claimed until an actual platform URL/provider receipt is captured."
        cards.append({
            "episode": episode,
            "version": release.get("version") or "",
            "status": status,
            "versionDir": release.get("versionDir") or "",
            "reviewRows": review.get("reviewRows", 0),
            "pendingReviewRows": review.get("pending", 0),
            "warningRows": warning_count,
            "durationCandidateRows": review.get("durationCandidateRows", 0),
            "syncInvestigationRows": review.get("syncInvestigationRows", 0),
            "platformRows": social.get("platformRows", 0),
            "blockedPlatformRows": social.get("blockedOrReview", 0),
            "readyForApprovalRows": social.get("readyForApproval", 0),
            "capturedReceipts": social.get("capturedReceipts", 0),
            "readyShortCount": release.get("readyShortCount") or 0,
            "shortCount": release.get("shortCount") or 0,
            "nextSafestAction": next_action,
            "reviewGateReason": gate_reason,
            "publicationStateTruth": "Draft/review/planning only. Local readiness is not external publication and receipt slots are not receipts.",
            "humanAsk": "Review local artifacts and warnings, then decide whether this episode should remain pending, be refined, be held, or move toward explicit approval.",
            "agentSafeParallelWork": "Prepare metadata packets, calendar drafts, review summaries, and dry-run receipt/review commands only. Do not publish, upload, schedule, approve, mutate accounts, or create receipt truth.",
            "warnings": release.get("warnings") or [],
        })
    return cards


def build_platform_cards(social_items: list[dict[str, Any]]) -> list[dict[str, Any]]:
    platforms = sorted({str(item.get("platform") or "Unknown") for item in social_items})
    cards: list[dict[str, Any]] = []
    for platform in platforms:
        rows = [item for item in social_items if str(item.get("platform") or "Unknown") == platform]
        stages = group_counts(rows, "stage")
        cards.append({
            "platform": platform,
            "rows": len(rows),
            "episodes": len({str(item.get("episode") or "") for item in rows if item.get("episode")}),
            "blockedOrReview": sum(1 for item in rows if str(item.get("stage") or "") not in {"ready-for-approval", "approved-local-ready-no-receipts", "metadata-ready-needs-approval", "receipt-captured"}),
            "readyForApproval": sum(1 for item in rows if str(item.get("stage") or "") in {"ready-for-approval", "approved-local-ready-no-receipts", "metadata-ready-needs-approval"}),
            "capturedReceipts": sum(1 for item in rows if str(item.get("stage") or "") == "receipt-captured" or item.get("receiptStatus") not in {"", None, "not_published"}),
            "stages": stages,
            "nextSafestAction": "Prepare/review local packet only; manual post and receipt capture require explicit approval and real external proof.",
            "humanAsk": "Confirm this platform packet fits the platform and the episode has explicit approval before any manual posting step.",
            "agentSafeParallelWork": "Prepare platform copy, descriptions, tags, thumbnails, and receipt-slot checklists; do not post, schedule, upload, or capture receipts without explicit approval.",
            "publicationStateTruth": "Platform rows are local planning rows until an approved human action creates a real external URL or provider receipt.",
        })
    return cards


def load_studio_quality_by_episode(release_root: Path) -> dict[str, dict[str, Any]]:
    pointer = load_json(release_root / "review-board" / "studio-package-quality-desk" / "latest-studio-package-quality-desk.json")
    packet_path = Path(str(pointer.get("jsonPath") or ""))
    packet = load_json(packet_path) if packet_path.exists() else pointer
    indexed: dict[str, dict[str, Any]] = {}
    for card in packet.get("episodes") or []:
        if not isinstance(card, dict):
            continue
        episode = str(card.get("episode") or "")
        if not episode:
            continue
        checklist = card.get("mediaReviewChecklist") if isinstance(card.get("mediaReviewChecklist"), dict) else {}
        primary = card.get("primaryReviewAction") if isinstance(card.get("primaryReviewAction"), dict) else {}
        review_steps = []
        for step in checklist.get("reviewSequence") or []:
            if not isinstance(step, dict):
                continue
            review_steps.append({
                "label": step.get("label") or "",
                "path": step.get("path") or "",
                "exists": bool(step.get("exists")),
                "check": step.get("check") or "",
            })
        indexed[episode] = {
            "studioStatus": card.get("status") or "",
            "reviewTargetVersion": card.get("reviewTargetVersion") or "",
            "currentBestVersion": card.get("currentBestVersion") or card.get("version") or "",
            "primaryReviewAction": primary,
            "allPrimaryMediaExists": bool(checklist.get("allPrimaryMediaExists")),
            "manifestPath": checklist.get("manifestPath") or "",
            "shortsDir": checklist.get("shortsDir") or "",
            "reviewSequence": review_steps,
            "packageQualityDeskHtml": packet.get("htmlPath") or pointer.get("htmlPath") or "",
        }
    return indexed


def build_approval_runway(
    episode_cards: list[dict[str, Any]],
    social_items: list[dict[str, Any]],
    studio_quality_by_episode: dict[str, dict[str, Any]],
) -> list[dict[str, Any]]:
    episode_by_id = {str(card.get("episode")): card for card in episode_cards}
    rows: list[dict[str, Any]] = []
    for item in social_items:
        episode = str(item.get("episode") or "")
        if not episode:
            continue
        episode_card = episode_by_id.get(episode, {})
        studio_quality = studio_quality_by_episode.get(episode, {})
        stage = str(item.get("stage") or "")
        platform = str(item.get("platform") or "Unknown")
        if episode_card.get("status") == "needs-local-review":
            gate = "blocked-by-local-review"
            next_action = "Open the episode watch-listen checklist, resolve pending/warning rows, then return to this platform packet."
        elif episode_card.get("status") == "ready-for-explicit-approval" and stage in {"ready-for-approval", "metadata-ready-needs-approval", "approved-local-ready-no-receipts"}:
            gate = "ready-for-explicit-approval"
            next_action = "Get explicit approval for this exact platform/version before manual posting."
        elif item.get("url") or item.get("providerId"):
            gate = "receipt-captured"
            next_action = "Verify receipt truth and add analytics later from real performance data."
        else:
            gate = "draft-packet-not-approved"
            next_action = "Keep this as draft packet material until local review and explicit approval are both true."
        primary = studio_quality.get("primaryReviewAction") if isinstance(studio_quality.get("primaryReviewAction"), dict) else {}
        rows.append({
            "episode": episode,
            "platform": platform,
            "stage": stage,
            "gate": gate,
            "version": episode_card.get("version") or item.get("version") or "",
            "episodeStatus": episode_card.get("status") or item.get("episodeStatus") or "",
            "pendingReviewRows": episode_card.get("pendingReviewRows", 0),
            "warningRows": episode_card.get("warningRows", 0),
            "capturedReceipts": episode_card.get("capturedReceipts", 0),
            "metadataPath": item.get("metadataPath") or "",
            "checklistPath": item.get("checklistPath") or "",
            "uploadJobPath": item.get("uploadJobPath") or "",
            "reviewChecklistCommand": primary.get("command") or open_command(studio_quality.get("packageQualityDeskHtml") or ""),
            "reviewChecklistPath": primary.get("path") or studio_quality.get("packageQualityDeskHtml") or "",
            "studioQualityStatus": studio_quality.get("studioStatus") or "",
            "allPrimaryMediaExists": studio_quality.get("allPrimaryMediaExists", False),
            "reviewTargetVersion": studio_quality.get("reviewTargetVersion") or "",
            "nextSafestAction": next_action,
            "humanAsk": "Do the local watch-listen review first; approve manual posting only for this exact platform/version after blockers are clear.",
            "agentSafeParallelWork": "Prepare copy/checklists/receipt dry-runs and summarize blockers. Do not publish, upload, schedule, approve, mutate accounts, or capture receipt truth.",
            "truth": "Approval runway row only. It is draft/review/planning truth, not a platform action or receipt.",
        })
    rows.sort(key=lambda row: (str(row.get("gate")), int(row.get("episode") or 999), str(row.get("platform"))))
    return rows


def build_packet(release_root: Path) -> dict[str, Any]:
    review_pointer, review_packet, review_packet_path = load_pointer_and_packet(
        release_root / "review-board" / "tower-review-command-sheets" / "latest-tower-review-command-sheet.json"
    )
    social_pointer, social_packet, social_packet_path = load_pointer_and_packet(
        release_root / "tower-social-command-center" / "latest-tower-social-command-center.json"
    )
    calendar_pointer, calendar_packet, calendar_packet_path = load_pointer_and_packet(
        release_root / "tower-manual-calendar" / "latest-tower-manual-calendar.json"
    )
    runway_pointer, runway_packet, runway_packet_path = load_pointer_and_packet(
        release_root / "tower-runway" / "latest-tower-runway.json"
    )
    release_status = load_release_status(release_root)

    review_rows = [row for row in (review_packet.get("reviewRows") or []) if isinstance(row, dict)]
    if not review_rows:
        review_rows = [row for row in (review_packet.get("rows") or []) if isinstance(row, dict)]
    social_items = [item for item in (social_packet.get("items") or []) if isinstance(item, dict)]
    calendar_rows = [row for row in (calendar_packet.get("rows") or []) if isinstance(row, dict)]
    release_rows = episode_rows_from_release_status(release_status)
    studio_quality_by_episode = load_studio_quality_by_episode(release_root)
    episode_cards = build_episode_cards(release_rows, review_episode_counts(review_rows), social_episode_counts(social_items))
    platform_cards = build_platform_cards(social_items)
    approval_runway = build_approval_runway(episode_cards, social_items, studio_quality_by_episode)

    review_counts = review_pointer.get("counts") if isinstance(review_pointer.get("counts"), dict) else {}
    social_counts = social_pointer.get("counts") if isinstance(social_pointer.get("counts"), dict) else {}
    calendar_counts = calendar_pointer.get("counts") if isinstance(calendar_pointer.get("counts"), dict) else {}
    runway_counts = runway_pointer.get("counts") if isinstance(runway_pointer.get("counts"), dict) else {}

    counts = {
        "episodes": len(episode_cards) or int(review_counts.get("episodes") or social_counts.get("episodes") or 0),
        "reviewRows": int(review_counts.get("reviewRows") or len(review_rows)),
        "pendingRows": int(review_counts.get("pendingRows") or sum(1 for row in review_rows if row.get("currentDecision") == "pending")),
        "warningRows": int(review_counts.get("warningRows") or sum(1 for row in review_rows if row.get("warnings"))),
        "durationCandidateReviewRows": int(review_counts.get("durationCandidateReviewRows") or 0),
        "syncInvestigationRows": int(review_counts.get("syncInvestigationRows") or 0),
        "socialItems": int(social_counts.get("items") or len(social_items)),
        "blockedOrReview": int(social_counts.get("blockedOrReview") or 0),
        "readyForApproval": int(social_counts.get("readyForApproval") or 0),
        "receiptSlots": int(review_counts.get("receiptSlots") or runway_counts.get("receiptSlots") or len(social_items)),
        "capturedReceipts": int(review_counts.get("capturedReceipts") or social_counts.get("capturedReceipts") or runway_counts.get("capturedReceipts") or 0),
        "calendarRows": int(calendar_counts.get("calendarRows") or len(calendar_rows)),
        "draftDates": int(calendar_counts.get("dates") or len({row.get("slotDate") for row in calendar_rows if row.get("slotDate")})),
        "platforms": len(platform_cards) or int(social_counts.get("platforms") or 0),
        "approvalRunwayRows": len(approval_runway),
        "approvalRunwayBlocked": sum(1 for row in approval_runway if row.get("gate") == "blocked-by-local-review"),
        "approvalRunwayReadyForApproval": sum(1 for row in approval_runway if row.get("gate") == "ready-for-explicit-approval"),
        "approvalRunwayReceiptsCaptured": sum(1 for row in approval_runway if row.get("gate") == "receipt-captured"),
        "externalPublishing": False,
        "externalSchedulesCreated": False,
        "receiptTruthCreated": False,
    }

    blockers: list[str] = []
    if not review_packet:
        blockers.append("No Tower review command sheet packet was found.")
    if not social_packet:
        blockers.append("No Tower social command center packet was found.")
    if not calendar_packet:
        blockers.append("No Tower manual calendar packet was found.")
    if counts["pendingRows"]:
        blockers.append(f"{counts['pendingRows']} local review rows still need approve/refine/hold/pending decisions.")
    if counts["warningRows"]:
        blockers.append(f"{counts['warningRows']} warning rows need explicit review before publishing trust.")
    if counts["capturedReceipts"] == 0:
        blockers.append("No external publication receipts or URLs have been captured yet.")

    missing_source_packets = not review_packet or not social_packet or not calendar_packet
    needs_review_before_platform = bool(
        counts["pendingRows"]
        or counts["warningRows"]
        or counts["durationCandidateReviewRows"]
        or counts["syncInvestigationRows"]
    )
    if missing_source_packets:
        desk_status = "publisher-desk-missing-source-packets"
    elif needs_review_before_platform:
        desk_status = "publisher-desk-review-first"
    elif counts["readyForApproval"]:
        desk_status = "publisher-desk-ready-for-approval"
    else:
        desk_status = "publisher-desk-receipt-capture-needed"

    first_safe_path = review_pointer.get("htmlPath") or social_pointer.get("htmlPath") or calendar_pointer.get("htmlPath") or runway_pointer.get("htmlPath") or ""
    first_safe_label = "Open Tower review command sheet" if review_pointer.get("htmlPath") else "Open Tower social command center"
    return {
        "schema": SCHEMA,
        "generatedAt": iso_now(),
        "releaseRoot": str(release_root),
        "status": desk_status,
        "truth": "Local Publisher Desk only. It summarizes review, draft calendar, platform packet, and receipt-slot truth without publishing, scheduling, uploading, approving, mutating accounts, or capturing receipts.",
        "humanAsk": "Start with review blockers and warnings, then inspect platform packets and draft calendar intent. Only after explicit approval should manual publication happen, and only real external URLs/provider IDs become receipts.",
        "agentSafeParallelWork": "Prepare summaries, platform metadata checks, calendar intent notes, dry-run review commands, dry-run receipt commands, and analytics placeholders. Do not publish, upload, schedule, approve, mutate accounts, overwrite versions, or create receipt truth.",
        "operatorLadder": TOWER_OPERATOR_LADDER,
        "counts": counts,
        "sourcePointers": {
            "reviewCommandSheetPointer": str(release_root / "review-board" / "tower-review-command-sheets" / "latest-tower-review-command-sheet.json"),
            "reviewCommandSheetJson": str(review_packet_path or ""),
            "reviewCommandSheetHtml": review_pointer.get("htmlPath") or "",
            "socialCommandCenterPointer": str(release_root / "tower-social-command-center" / "latest-tower-social-command-center.json"),
            "socialCommandCenterJson": str(social_packet_path or ""),
            "socialCommandCenterHtml": social_pointer.get("htmlPath") or "",
            "manualCalendarPointer": str(release_root / "tower-manual-calendar" / "latest-tower-manual-calendar.json"),
            "manualCalendarJson": str(calendar_packet_path or ""),
            "manualCalendarHtml": calendar_pointer.get("htmlPath") or "",
            "towerRunwayPointer": str(release_root / "tower-runway" / "latest-tower-runway.json"),
            "towerRunwayJson": str(runway_packet_path or ""),
            "towerRunwayHtml": runway_pointer.get("htmlPath") or "",
            "releaseStatusJson": str(release_root / "release-status.json"),
        },
        "blockers": blockers,
        "publicationTruthContract": {
            "localReadinessIsNotPublication": True,
            "approvalIsNotReceipt": True,
            "receiptRequiresExternalProof": True,
            "calendarRowsAreDraftIntentOnly": True,
            "manualPublishingRequiresExplicitApproval": True,
            "summary": "Tower may prepare packets and calendars, but only a real platform URL/provider receipt can mark something externally published.",
        },
        "nextSafestAction": "Open the Publisher Desk, review warnings/pending rows first, then use platform packets only after explicit human approval and real receipt capture.",
        "firstSafeAction": {
            "label": first_safe_label,
            "command": open_command(first_safe_path),
            "path": first_safe_path,
            "safety": "Opens a local review/planning artifact only. No publish, upload, schedule, approve, account mutation, source mutation, overwrite, or receipt capture.",
        },
        "reviewSummary": {
            "counts": review_counts,
            "htmlPath": review_pointer.get("htmlPath") or "",
            "jsonPath": str(review_packet_path or ""),
        },
        "socialSummary": {
            "counts": social_counts,
            "htmlPath": social_pointer.get("htmlPath") or "",
            "jsonPath": str(social_packet_path or ""),
            "byPlatform": group_counts(social_items, "platform"),
            "byStage": group_counts(social_items, "stage"),
        },
        "calendarSummary": {
            "counts": calendar_counts,
            "htmlPath": calendar_pointer.get("htmlPath") or "",
            "jsonPath": str(calendar_packet_path or ""),
        },
        "episodeCards": episode_cards,
        "platformCards": platform_cards,
        "studioQualityByEpisode": studio_quality_by_episode,
        "approvalRunway": approval_runway,
        "reviewRowsSample": review_rows[:8],
        "socialItemsSample": social_items[:8],
        "calendarRowsSample": calendar_rows[:8],
        "safety": {
            "externalPublishing": False,
            "externalSchedulesCreated": False,
            "receiptTruthCreated": False,
            "sourceMutations": False,
            "versionOverwrites": False,
            "accountMutations": False,
        },
    }


def prepare_output_dir(release_root: Path) -> Path:
    out_dir = release_root / "tower-publisher-desk" / stamp()
    base = out_dir
    counter = 2
    while out_dir.exists():
        out_dir = Path(f"{base}-{counter}")
        counter += 1
    out_dir.mkdir(parents=True, exist_ok=False)
    return out_dir


def write_csv(path: Path, packet: dict[str, Any]) -> None:
    fields = ["kind", "episode", "platform", "status", "gate", "count", "warningCount", "nextSafestAction", "reviewGateReason", "humanAsk", "publicationStateTruth", "path"]
    with path.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=fields)
        writer.writeheader()
        for card in packet.get("episodeCards") or []:
            writer.writerow({
                "kind": "episode",
                "episode": card.get("episode", ""),
                "platform": "",
                "status": card.get("status", ""),
                "gate": "",
                "count": card.get("platformRows", 0),
                "warningCount": card.get("warningRows", 0),
                "nextSafestAction": card.get("nextSafestAction", ""),
                "reviewGateReason": card.get("reviewGateReason", ""),
                "humanAsk": card.get("humanAsk", ""),
                "publicationStateTruth": card.get("publicationStateTruth", ""),
                "path": card.get("versionDir", ""),
            })
        for card in packet.get("platformCards") or []:
            writer.writerow({
                "kind": "platform",
                "episode": "",
                "platform": card.get("platform", ""),
                "status": "local-packet-review",
                "gate": "",
                "count": card.get("rows", 0),
                "warningCount": card.get("blockedOrReview", 0),
                "nextSafestAction": card.get("nextSafestAction", ""),
                "reviewGateReason": "",
                "humanAsk": card.get("humanAsk", ""),
                "publicationStateTruth": card.get("publicationStateTruth", ""),
                "path": "",
            })
        for row in packet.get("approvalRunway") or []:
            writer.writerow({
                "kind": "approval-runway",
                "episode": row.get("episode", ""),
                "platform": row.get("platform", ""),
                "status": row.get("stage", ""),
                "gate": row.get("gate", ""),
                "count": 1,
                "warningCount": row.get("warningRows", 0),
                "nextSafestAction": row.get("nextSafestAction", ""),
                "reviewGateReason": row.get("gate", ""),
                "humanAsk": row.get("humanAsk", ""),
                "publicationStateTruth": row.get("truth", ""),
                "path": row.get("metadataPath") or row.get("checklistPath") or row.get("reviewChecklistPath") or "",
            })


def write_markdown(path: Path, packet: dict[str, Any]) -> None:
    counts = packet.get("counts") or {}
    lines = [
        "# Tower Publisher Desk",
        "",
        f"Generated: `{packet.get('generatedAt')}`",
        "",
        str(packet.get("truth") or ""),
        "",
        "## Start here",
        "",
        f"Next safest action: {packet.get('nextSafestAction')}",
        "",
        "## Human/agent operating contract",
        "",
        f"- Human ask: {packet.get('humanAsk')}",
        f"- Agent-safe parallel work: {packet.get('agentSafeParallelWork')}",
        f"- Truth contract: {(packet.get('publicationTruthContract') or {}).get('summary') if isinstance(packet.get('publicationTruthContract'), dict) else ''}",
        "",
        "## Operator ladder",
        "",
    ]
    for step in packet.get("operatorLadder") or []:
        lines.extend([
            f"### {step.get('label')}",
            "",
            f"- Human: {step.get('humanAsk')}",
            f"- Agent-safe: {step.get('agentSafeParallelWork')}",
            f"- State truth: {step.get('stateTruth')}",
            "",
        ])
    lines.extend([
        "",
        "## Counts",
        "",
    ])
    for key in ["episodes", "reviewRows", "pendingRows", "warningRows", "socialItems", "blockedOrReview", "readyForApproval", "receiptSlots", "capturedReceipts", "calendarRows", "draftDates", "platforms", "approvalRunwayRows", "approvalRunwayBlocked", "approvalRunwayReadyForApproval", "approvalRunwayReceiptsCaptured"]:
        lines.append(f"- `{key}`: `{counts.get(key, 0)}`")
    lines.extend(["", "## Blockers / attention", ""])
    blockers = packet.get("blockers") if isinstance(packet.get("blockers"), list) else []
    if blockers:
        for blocker in blockers:
            lines.append(f"- {blocker}")
    else:
        lines.append("- No local blocker surfaced by the Publisher Desk.")
    lines.extend(["", "## Source packets", ""])
    for key, value in (packet.get("sourcePointers") or {}).items():
        lines.append(f"- `{key}`: `{value}`")
    lines.extend(["", "## Episodes", ""])
    for card in packet.get("episodeCards") or []:
        lines.extend([
            f"### Episode {card.get('episode')} - {card.get('status')}",
            f"- Version: `{card.get('version')}`",
            f"- Review rows: `{card.get('reviewRows')}` pending `{card.get('pendingReviewRows')}` warnings `{card.get('warningRows')}`",
            f"- Platform rows: `{card.get('platformRows')}` blocked/review `{card.get('blockedPlatformRows')}` ready-for-approval `{card.get('readyForApprovalRows')}` receipts `{card.get('capturedReceipts')}`",
            f"- Shorts: `{card.get('readyShortCount')}` ready of `{card.get('shortCount')}`",
            f"- Next: {card.get('nextSafestAction')}",
            f"- Review gate: {card.get('reviewGateReason')}",
            f"- Human ask: {card.get('humanAsk')}",
            f"- Publication truth: {card.get('publicationStateTruth')}",
            "",
        ])
    lines.extend(["## Approval runway", ""])
    for row in packet.get("approvalRunway") or []:
        lines.extend([
            f"### Episode {row.get('episode')} - {row.get('platform')} - {row.get('gate')}",
            f"- Stage: `{row.get('stage')}`",
            f"- Studio quality: `{row.get('studioQualityStatus')}`",
            f"- Pending review rows: `{row.get('pendingReviewRows')}` warnings `{row.get('warningRows')}`",
            f"- Review checklist: `{row.get('reviewChecklistPath')}`",
            f"- Metadata: `{row.get('metadataPath') or 'missing'}`",
            f"- Checklist: `{row.get('checklistPath') or 'missing'}`",
            f"- Upload draft: `{row.get('uploadJobPath') or 'missing'}`",
            f"- Next: {row.get('nextSafestAction')}",
            f"- Human ask: {row.get('humanAsk')}",
            f"- Agent-safe: {row.get('agentSafeParallelWork')}",
            "```bash",
            str(row.get("reviewChecklistCommand") or ""),
            "```",
            "",
        ])
    lines.extend(["## Platforms", ""])
    for card in packet.get("platformCards") or []:
        lines.extend([
            f"- `{card.get('platform')}`: `{card.get('rows')}` rows, `{card.get('blockedOrReview')}` blocked/review, `{card.get('readyForApproval')}` ready-for-approval, `{card.get('capturedReceipts')}` receipts",
        ])
    path.write_text("\n".join(lines).rstrip() + "\n", encoding="utf-8")


def write_html(path: Path, packet: dict[str, Any]) -> None:
    counts = packet.get("counts") or {}
    source = packet.get("sourcePointers") if isinstance(packet.get("sourcePointers"), dict) else {}
    blockers = packet.get("blockers") if isinstance(packet.get("blockers"), list) else []
    blocker_html = "".join(f"<li>{esc(blocker)}</li>" for blocker in blockers) or "<li>No local blocker surfaced by the Publisher Desk.</li>"
    ladder_html = "".join(
        f"""
        <article class=\"ladder-card\">
          <div class=\"topline\"><span>{esc(step.get('label'))}</span></div>
          <p><strong>Human:</strong> {esc(step.get('humanAsk'))}</p>
          <p><strong>Agent-safe:</strong> {esc(step.get('agentSafeParallelWork'))}</p>
          <p><strong>Truth:</strong> {esc(step.get('stateTruth'))}</p>
        </article>
        """
        for step in packet.get("operatorLadder") or []
    )
    episode_html = []
    for card in packet.get("episodeCards") or []:
        status = str(card.get("status") or "")
        episode_html.append(f"""
        <article class="episode-card {esc(status)}">
          <div class="topline"><span>Episode {esc(card.get('episode'))}</span><strong>{esc(status)}</strong></div>
          <h3>{esc(card.get('version') or 'current best')}</h3>
          <p>{esc(card.get('nextSafestAction'))}</p>
          <p><strong>Gate:</strong> {esc(card.get('reviewGateReason'))}</p>
          <p><strong>Human ask:</strong> {esc(card.get('humanAsk'))}</p>
          <p><strong>Truth:</strong> {esc(card.get('publicationStateTruth'))}</p>
          <div class="stats">
            <span>{esc(card.get('pendingReviewRows'))} pending</span>
            <span>{esc(card.get('warningRows'))} warnings</span>
            <span>{esc(card.get('platformRows'))} platform rows</span>
            <span>{esc(card.get('capturedReceipts'))} receipts</span>
          </div>
          <details><summary>Episode details</summary><pre>{esc(json.dumps(card, indent=2))}</pre></details>
        </article>
        """)
    platform_html = []
    for card in packet.get("platformCards") or []:
        platform_html.append(f"""
        <article class="platform-card">
          <div class="topline"><span>{esc(card.get('platform'))}</span><strong>{esc(card.get('rows'))} rows</strong></div>
          <p>{esc(card.get('nextSafestAction'))}</p>
          <p><strong>Human ask:</strong> {esc(card.get('humanAsk'))}</p>
          <p><strong>Truth:</strong> {esc(card.get('publicationStateTruth'))}</p>
          <div class="stats">
            <span>{esc(card.get('blockedOrReview'))} blocked/review</span>
            <span>{esc(card.get('readyForApproval'))} ready</span>
            <span>{esc(card.get('capturedReceipts'))} receipts</span>
          </div>
          <details><summary>Stage counts</summary><pre>{esc(json.dumps(card.get('stages') or {}, indent=2))}</pre></details>
        </article>
        """)
    approval_html = []
    for row in packet.get("approvalRunway") or []:
        gate = str(row.get("gate") or "draft-packet-not-approved")
        gate_class = "".join(ch if ch.isalnum() or ch == "-" else "-" for ch in gate.lower())
        command_lines = "\n".join(
            line for line in [
                str(row.get("reviewChecklistCommand") or ""),
                open_command(row.get("metadataPath")),
                open_command(row.get("checklistPath")),
                open_command(row.get("uploadJobPath")),
            ]
            if line
        )
        approval_html.append(f"""
        <article class="approval-card {esc(gate_class)}">
          <div class="topline"><span>Episode {esc(row.get('episode'))} · {esc(row.get('platform'))}</span><strong>{esc(gate)}</strong></div>
          <h3>{esc(row.get('nextSafestAction'))}</h3>
          <p><strong>Studio quality:</strong> {esc(row.get('studioQualityStatus'))} · primary media {esc('present' if row.get('allPrimaryMediaExists') else 'needs review')}</p>
          <p><strong>Truth:</strong> {esc(row.get('truth'))}</p>
          <p><strong>Human ask:</strong> {esc(row.get('humanAsk'))}</p>
          <div class="stats">
            <span>{esc(row.get('stage'))} platform stage</span>
            <span>{esc(row.get('pendingReviewRows'))} pending</span>
            <span>{esc(row.get('warningRows'))} warnings</span>
            <span>{esc(row.get('capturedReceipts'))} receipts</span>
            <span>{esc(row.get('reviewTargetVersion') or row.get('version') or 'unknown version')}</span>
          </div>
          <details open><summary>Open review + packet evidence</summary><pre>{esc(command_lines or 'No local open commands available for this row.')}</pre></details>
          <details><summary>Approval row JSON</summary><pre>{esc(json.dumps(row, indent=2))}</pre></details>
        </article>
        """)
    html_text = f"""<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Tower Publisher Desk</title>
  <style>
    :root {{ color-scheme:dark; --bg:#101710; --panel:#1b271d; --panel2:#263321; --ink:#fff3d8; --muted:#d7c6a0; --gold:#f0c94d; --moss:#8ebd72; --water:#7bc8d4; --clay:#ca7654; --line:rgba(255,243,216,.15); }}
    * {{ box-sizing:border-box; }}
    body {{ margin:0; color:var(--ink); font-family:Avenir Next, Helvetica Neue, sans-serif; background:radial-gradient(circle at 18% -12%, rgba(142,189,114,.24), transparent 35%), radial-gradient(circle at 86% 0%, rgba(123,200,212,.18), transparent 32%), linear-gradient(180deg,#121d12,#070b07); }}
    header {{ padding:48px clamp(20px,5vw,82px); border-bottom:1px solid var(--line); }}
    .eyebrow {{ color:var(--gold); text-transform:uppercase; letter-spacing:.24em; font-size:12px; font-weight:950; }}
    h1 {{ max-width:1100px; margin:10px 0; font-size:clamp(42px,7vw,86px); line-height:.92; }}
    p {{ color:var(--muted); line-height:1.48; }}
    header p {{ max-width:920px; font-size:18px; }}
    .summary {{ display:flex; gap:10px; flex-wrap:wrap; margin-top:20px; }}
    .summary span {{ border:1px solid var(--line); border-radius:999px; padding:9px 12px; background:rgba(255,255,255,.06); color:var(--ink); font-weight:850; }}
    .summary span.warn {{ color:var(--gold); border-color:rgba(240,201,77,.36); }}
    .summary span.receipts {{ color:var(--water); }}
    main {{ padding:28px clamp(16px,4vw,58px) 72px; display:grid; gap:20px; }}
    section {{ border:1px solid var(--line); border-radius:28px; padding:22px; background:linear-gradient(180deg,rgba(27,39,29,.95),rgba(10,15,10,.98)); box-shadow:0 18px 46px rgba(0,0,0,.22); }}
    h2 {{ margin:0 0 12px; color:var(--gold); }}
    .actions {{ display:grid; grid-template-columns:repeat(auto-fit,minmax(260px,1fr)); gap:12px; }}
    .action {{ border:1px solid var(--line); border-radius:18px; padding:14px; background:rgba(255,255,255,.05); }}
    .action strong {{ display:block; color:var(--ink); margin-bottom:6px; }}
    code {{ display:block; color:var(--water); overflow-wrap:anywhere; margin-top:6px; }}
    ul {{ margin:0; padding-left:20px; color:var(--muted); }}
    .grid {{ display:grid; grid-template-columns:repeat(auto-fill,minmax(280px,1fr)); gap:14px; }}
    article {{ border:1px solid var(--line); border-radius:18px; padding:14px; background:rgba(0,0,0,.18); }}
    .episode-card.needs-local-review {{ border-color:rgba(202,118,84,.54); }}
    .episode-card.ready-for-explicit-approval {{ border-color:rgba(142,189,114,.54); }}
    .approval-card.blocked-by-local-review {{ border-color:rgba(202,118,84,.66); background:linear-gradient(180deg,rgba(72,35,24,.48),rgba(0,0,0,.18)); }}
    .approval-card.ready-for-explicit-approval {{ border-color:rgba(142,189,114,.66); background:linear-gradient(180deg,rgba(38,72,42,.42),rgba(0,0,0,.18)); }}
    .approval-card.receipt-captured {{ border-color:rgba(123,200,212,.66); background:linear-gradient(180deg,rgba(22,64,72,.42),rgba(0,0,0,.18)); }}
    .topline {{ display:flex; justify-content:space-between; gap:12px; align-items:center; color:var(--gold); text-transform:uppercase; letter-spacing:.12em; font-size:11px; font-weight:950; }}
    h3 {{ margin:10px 0 6px; }}
    .stats {{ display:flex; gap:8px; flex-wrap:wrap; margin-top:12px; }}
    .stats span {{ border-radius:999px; padding:6px 9px; background:rgba(0,0,0,.22); color:var(--muted); font-size:12px; font-weight:850; }}
    details {{ margin-top:12px; }}
    summary {{ cursor:pointer; color:var(--water); font-weight:850; }}
    pre {{ white-space:pre-wrap; overflow-wrap:anywhere; color:var(--muted); font-size:12px; }}
    .ladder {{ display:grid; grid-template-columns:repeat(auto-fit,minmax(260px,1fr)); gap:14px; }}
    .ladder-card {{ border-color:rgba(240,201,77,.34); }}
  </style>
</head>
<body>
  <header>
    <div class="eyebrow">Quipsly Tower Publisher Desk</div>
    <h1>The calm bridge between local readiness and real publication.</h1>
    <p>{esc(packet.get('truth'))}</p>
    <p><strong>Human ask:</strong> {esc(packet.get('humanAsk'))}</p>
    <p><strong>Agent-safe work:</strong> {esc(packet.get('agentSafeParallelWork'))}</p>
    <p><strong>Next safest action:</strong> {esc(packet.get('nextSafestAction'))}</p>
    <div class="summary">
      <span>{esc(counts.get('episodes'))} episodes</span>
      <span class="warn">{esc(counts.get('pendingRows'))} pending review rows</span>
      <span class="warn">{esc(counts.get('warningRows'))} warnings</span>
      <span>{esc(counts.get('socialItems'))} platform rows</span>
      <span>{esc(counts.get('calendarRows'))} calendar rows</span>
      <span class="receipts">{esc(counts.get('capturedReceipts'))}/{esc(counts.get('receiptSlots'))} receipts</span>
      <span class="warn">{esc(counts.get('approvalRunwayBlocked'))}/{esc(counts.get('approvalRunwayRows'))} approval rows blocked</span>
      <span>{esc(counts.get('approvalRunwayReadyForApproval'))} approval-ready rows</span>
    </div>
  </header>
  <main>
    <section>
      <h2>Start here</h2>
      <div class="actions">
        <div class="action"><strong>Review truth</strong><p>Open the review command sheet first. Local approve/refine/hold decisions come before platform action.</p><code>{esc(open_command(source.get('reviewCommandSheetHtml')))}</code></div>
        <div class="action"><strong>Platform runway</strong><p>Use the social command center to see platform packets, stages, and receipt slots without claiming publication.</p><code>{esc(open_command(source.get('socialCommandCenterHtml')))}</code></div>
        <div class="action"><strong>Draft calendar</strong><p>Use the manual calendar as planning only. It is not an external schedule.</p><code>{esc(open_command(source.get('manualCalendarHtml')))}</code></div>
      </div>
    </section>
    <section><h2>Operator ladder</h2><div class=\"ladder\">{ladder_html}</div></section>
    <section><h2>Attention queue</h2><ul>{blocker_html}</ul></section>
    <section>
      <h2>Approval runway</h2>
      <p>This is the anti-chaos bridge: each platform packet is tied back to the episode review gate and Studio checklist. It prepares approval; it does not create approval or receipt truth.</p>
      <div class="grid">{''.join(approval_html)}</div>
    </section>
    <section><h2>Episode cards</h2><div class="grid">{''.join(episode_html)}</div></section>
    <section><h2>Platform cards</h2><div class="grid">{''.join(platform_html)}</div></section>
    <section><h2>Source packet paths</h2><pre>{esc(json.dumps(source, indent=2))}</pre></section>
  </main>
</body>
</html>
"""
    path.write_text(html_text, encoding="utf-8")


def update_pointer(release_root: Path, out_dir: Path, packet: dict[str, Any], html_path: Path, json_path: Path, markdown_path: Path, csv_path: Path) -> None:
    approval_runway_summary = []
    for row in (packet.get("approvalRunway") or [])[:12]:
        approval_runway_summary.append({
            "episode": row.get("episode"),
            "platform": row.get("platform"),
            "stage": row.get("stage"),
            "gate": row.get("gate"),
            "studioQualityStatus": row.get("studioQualityStatus"),
            "pendingReviewRows": row.get("pendingReviewRows"),
            "warningRows": row.get("warningRows"),
            "capturedReceipts": row.get("capturedReceipts"),
            "nextSafestAction": row.get("nextSafestAction"),
            "humanAsk": row.get("humanAsk"),
            "reviewChecklistPath": row.get("reviewChecklistPath"),
            "metadataPath": row.get("metadataPath"),
            "checklistPath": row.get("checklistPath"),
            "uploadJobPath": row.get("uploadJobPath"),
        })
    episode_cards_summary = []
    for card in packet.get("episodeCards") or []:
        episode_cards_summary.append({
            "episode": card.get("episode"),
            "version": card.get("version"),
            "status": card.get("status"),
            "pendingReviewRows": card.get("pendingReviewRows"),
            "warningRows": card.get("warningRows"),
            "platformRows": card.get("platformRows"),
            "readyForApprovalRows": card.get("readyForApprovalRows"),
            "capturedReceipts": card.get("capturedReceipts"),
            "nextSafestAction": card.get("nextSafestAction"),
            "reviewGateReason": card.get("reviewGateReason"),
        })
    platform_cards_summary = []
    for card in packet.get("platformCards") or []:
        platform_cards_summary.append({
            "platform": card.get("platform"),
            "rows": card.get("rows"),
            "blockedOrReview": card.get("blockedOrReview"),
            "readyForApproval": card.get("readyForApproval"),
            "capturedReceipts": card.get("capturedReceipts"),
            "nextSafestAction": card.get("nextSafestAction"),
        })
    pointer = {
        "schema": "quipsly.tower.latest-publisher-desk.v1",
        "updatedAt": iso_now(),
        "status": packet.get("status") or "publisher-desk-ready",
        "htmlPath": str(html_path),
        "jsonPath": str(json_path),
        "markdownPath": str(markdown_path),
        "csvPath": str(csv_path),
        "sessionDir": str(out_dir),
        "counts": packet.get("counts") or {},
        "truth": packet.get("truth") or "",
        "humanAsk": packet.get("humanAsk") or "",
        "agentSafeParallelWork": packet.get("agentSafeParallelWork") or "",
        "operatorLadder": packet.get("operatorLadder") or [],
        "publicationTruthContract": packet.get("publicationTruthContract") or {},
        "nextSafestAction": packet.get("nextSafestAction") or "Open local review/planning evidence before any publication work.",
        "firstSafeAction": packet.get("firstSafeAction") or {},
        "sourcePointers": packet.get("sourcePointers") or {},
        "episodeCardsSummary": episode_cards_summary,
        "platformCardsSummary": platform_cards_summary,
        "approvalRunwaySummary": approval_runway_summary,
        "approvalRunwayTruth": "These rows prepare explicit human approval. They are not approvals, uploads, schedules, or publication receipts.",
        "externalPublishing": False,
        "externalSchedulesCreated": False,
        "receiptTruthCreated": False,
    }
    write_json(release_root / "tower-publisher-desk" / "latest-tower-publisher-desk.json", pointer)


def main() -> None:
    parser = argparse.ArgumentParser(description="Build a local-only Tower Publisher Desk.")
    parser.add_argument("release_root", nargs="?", default=str(DEFAULT_RELEASE_ROOT))
    args = parser.parse_args()
    release_root = Path(args.release_root)
    packet = build_packet(release_root)
    out_dir = prepare_output_dir(release_root)
    json_path = out_dir / "tower-publisher-desk.json"
    html_path = out_dir / "index.html"
    markdown_path = out_dir / "START-HERE-tower-publisher-desk.md"
    csv_path = out_dir / "tower-publisher-desk.csv"
    first_evidence_action = packet.get("firstSafeAction") or {}
    packet.update({
        "sessionDir": str(out_dir),
        "htmlPath": str(html_path),
        "jsonPath": str(json_path),
        "markdownPath": str(markdown_path),
        "csvPath": str(csv_path),
        "firstSafeAction": {
            "label": "Open Tower Publisher Desk",
            "command": open_command(html_path),
            "path": str(html_path),
            "safety": "Opens the local Tower Publisher Desk only. No publish, upload, schedule, approval, account mutation, overwrite, source mutation, or receipt capture occurs.",
        },
        "firstPublisherEvidenceAction": first_evidence_action,
    })
    write_json(json_path, packet)
    write_markdown(markdown_path, packet)
    write_csv(csv_path, packet)
    write_html(html_path, packet)
    update_pointer(release_root, out_dir, packet, html_path, json_path, markdown_path, csv_path)
    print(json.dumps({
        "status": packet.get("status"),
        "htmlPath": str(html_path),
        "jsonPath": str(json_path),
        "markdownPath": str(markdown_path),
        "csvPath": str(csv_path),
        "counts": packet.get("counts"),
    }, indent=2, sort_keys=True))


if __name__ == "__main__":
    main()
