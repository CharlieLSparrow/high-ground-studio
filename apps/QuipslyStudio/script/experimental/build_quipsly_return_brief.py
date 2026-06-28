#!/usr/bin/env python3
"""Build a calm return brief over the latest Quipsly OS board.

This is a human/agent handoff artifact: what to open first, what decisions are
waiting, and what has not happened. It reads existing board/packet truth only.
"""
from __future__ import annotations

import csv
import html
import json
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

DEFAULT_OS_ROOT = Path("/Volumes/My Passport/Quipsly Media Workspace/QuipslyOS")
DEFAULT_POINTER = DEFAULT_OS_ROOT / "latest-quipsly-os-board.json"
DEFAULT_BLOCKER_LEDGER_POINTER = DEFAULT_OS_ROOT / "latest-quipsly-blocker-decision-ledger.json"
DEFAULT_POINTER_CONTRACT_VALIDATION_POINTER = DEFAULT_OS_ROOT / "latest-quipsly-pointer-contract-validation.json"
DEFAULT_PHOTO_CONTACT_SHEET_POINTER = DEFAULT_OS_ROOT.parent / "PhotoGrove" / "latest-photo-grove-contact-sheet.json"
DEFAULT_PHOTO_CONTROL_ROOM_POINTER = DEFAULT_OS_ROOT.parent / "PhotoGrove" / "latest-photo-grove-control-room.json"
DEFAULT_PHOTO_CULL_REHEARSAL_POINTER = DEFAULT_OS_ROOT.parent / "PhotoGrove" / "latest-photo-grove-cull-rehearsal.json"
DEFAULT_PHOTO_OPERATOR_WORKBENCH_POINTER = DEFAULT_OS_ROOT.parent / "PhotoGrove" / "latest-photo-grove-operator-workbench.json"
DEFAULT_PHOTO_CULL_THEATER_POINTER = DEFAULT_OS_ROOT.parent / "PhotoGrove" / "latest-photo-grove-cull-theater.json"
DEFAULT_PHOTO_PROOF_DESK_POINTER = DEFAULT_OS_ROOT.parent / "PhotoGrove" / "latest-photo-grove-proof-desk.json"
DEFAULT_PHOTO_NEXT_CULL_BATCH_POINTER = DEFAULT_OS_ROOT.parent / "PhotoGrove" / "latest-photo-grove-next-cull-batch.json"
DEFAULT_PHOTO_FIRST_PASS_TRIAGE_POINTER = DEFAULT_OS_ROOT.parent / "PhotoGrove" / "latest-photo-grove-first-pass-triage.json"
DEFAULT_PHOTO_LIVE_INTAKE_STATUS_POINTER = DEFAULT_OS_ROOT.parent / "PhotoGrove" / "latest-photo-grove-live-intake-status.json"
DEFAULT_TOWER_PUBLICATION_CONTROL_ROOM_POINTER = Path("/Volumes/My Passport/Episode_and_Shorts_Test/tower-publication-control-room/latest-tower-publication-control-room.json")
DEFAULT_TOWER_OPERATOR_WORKBENCH_POINTER = Path("/Volumes/My Passport/Episode_and_Shorts_Test/tower-operator-workbench/latest-tower-operator-workbench.json")
DEFAULT_TOWER_NEXT_PUBLISHING_CARD_POINTER = Path("/Volumes/My Passport/Episode_and_Shorts_Test/tower-next-publishing-card/latest-tower-next-publishing-card.json")
DEFAULT_TOWER_NEXT_PUBLISHING_BATCH_POINTER = Path("/Volumes/My Passport/Episode_and_Shorts_Test/tower-next-publishing-batch/latest-tower-next-publishing-batch.json")
DEFAULT_STUDIO_REVIEW_WORK_SESSION_POINTER = Path("/Volumes/My Passport/Episode_and_Shorts_Test/review-board/studio-review-work-sessions/latest-studio-review-work-session.json")
DEFAULT_STUDIO_NEXT_REVIEW_CARD_POINTER = Path("/Volumes/My Passport/Episode_and_Shorts_Test/review-board/studio-next-review-card/latest-studio-next-review-card.json")
DEFAULT_STUDIO_TOP_REVIEW_COMPANION_POINTER = Path("/Volumes/My Passport/Episode_and_Shorts_Test/review-board/latest-studio-top-review-companion.json")
DEFAULT_STUDIO_PACKAGE_QUALITY_DESK_POINTER = Path("/Volumes/My Passport/Episode_and_Shorts_Test/review-board/latest-studio-package-quality-desk.json")
DEFAULT_STUDIO_PACKAGE_BLOCKER_TRIAGE_POINTER = Path("/Volumes/My Passport/Episode_and_Shorts_Test/review-board/latest-studio-package-blocker-triage.json")
DEFAULT_STUDIO_REVIEW_THEATER_POINTER = Path("/Volumes/My Passport/Episode_and_Shorts_Test/review-board/studio-review-theater/latest-studio-review-theater.json")
DEFAULT_STUDIO_NEXT_SHORTS_REVIEW_BATCH_POINTER = Path("/Volumes/My Passport/Episode_and_Shorts_Test/review-board/shorts-review-batches/latest-shorts-review-batch.json")
DEFAULT_STUDIO_WATCH_LISTEN_REVIEW_ROOM_POINTER = Path("/Volumes/My Passport/Episode_and_Shorts_Test/review-board/latest-studio-watch-listen-review-room.json")
DEFAULT_STUDIO_DURATION_WARNING_REVIEW_POINTER = Path("/Volumes/My Passport/Episode_and_Shorts_Test/review-board/duration-warning-packets/latest-duration-warning-review-packet.json")
DEFAULT_STUDIO_DURATION_EXPERIMENT_MATRIX_POINTER = Path("/Volumes/My Passport/Episode_and_Shorts_Test/review-board/duration-experiment-matrix/latest-duration-experiment-matrix.json")
DEFAULT_STUDIO_DURATION_VERSION_WORKORDERS_POINTER = Path("/Volumes/My Passport/Episode_and_Shorts_Test/review-board/duration-version-workorders/latest-duration-version-workorders.json")
DEFAULT_STUDIO_DURATION_EDIT_RECIPE_SKELETONS_POINTER = Path("/Volumes/My Passport/Episode_and_Shorts_Test/review-board/duration-edit-recipes/latest-duration-edit-recipe-skeletons.json")
DEFAULT_STUDIO_TRANSCRIPT_SOURCE_WORKORDERS_POINTER = Path("/Volumes/My Passport/Episode_and_Shorts_Test/review-board/transcript-source-workorders/latest-transcript-source-workorders.json")
DEFAULT_STUDIO_TRANSCRIPT_EXECUTION_READINESS_POINTER = Path("/Volumes/My Passport/Episode_and_Shorts_Test/review-board/transcript-execution-readiness/latest-transcript-execution-readiness.json")
DEFAULT_STUDIO_TRANSCRIPT_PILOT_POINTER = Path("/Volumes/My Passport/Episode_and_Shorts_Test/review-board/transcript-pilots/latest-transcript-pilot.json")
DEFAULT_STUDIO_TRANSCRIPT_REVIEW_WORKBENCH_POINTER = Path("/Volumes/My Passport/Episode_and_Shorts_Test/review-board/transcript-review-workbench/latest-transcript-review-workbench.json")
DEFAULT_STUDIO_TRANSCRIPT_REVIEW_DECISION_LEDGER_POINTER = Path("/Volumes/My Passport/Episode_and_Shorts_Test/review-board/latest-transcript-review-decision-ledger.json")
DEFAULT_TOWER_SOCIAL_COMMAND_POINTER = Path("/Volumes/My Passport/Episode_and_Shorts_Test/tower-social-command-center/latest-tower-social-command-center.json")
DEFAULT_STUDIO_SYNC_CONTROL_ROOM_POINTER = Path("/Volumes/My Passport/Episode_and_Shorts_Test/review-board/latest-sync-control-room.json")
DEFAULT_STUDIO_SYNC_DECISION_REHEARSAL_POINTER = Path("/Volumes/My Passport/Episode_and_Shorts_Test/review-board/latest-sync-decision-rehearsal.json")
DEFAULT_STUDIO_SYNC_DECISION_AID_POINTER = Path("/Volumes/My Passport/Episode_and_Shorts_Test/review-board/latest-studio-sync-decision-aid.json")
DEFAULT_SHORTS_REVIEW_COCKPIT_POINTER = Path("/Volumes/My Passport/Episode_and_Shorts_Test/latest-shorts-review-cockpit.json")
DEFAULT_NEST_WRITING_CONTROL_ROOM_POINTER = DEFAULT_OS_ROOT.parent / "NestWriting" / "latest-nest-writing-control-room.json"
DEFAULT_NEST_AUTHOR_DESK_POINTER = DEFAULT_OS_ROOT.parent / "NestWriting" / "latest-nest-writing-author-desk.json"
DEFAULT_NEST_REVIEW_DESK_POINTER = DEFAULT_OS_ROOT.parent / "NestWriting" / "latest-nest-writing-review-desk.json"
DEFAULT_NEST_DAILY_PACKET_POINTER = DEFAULT_OS_ROOT.parent / "NestWriting" / "latest-nest-writing-daily-packet.json"
DEFAULT_DAILY_WRITING_READINESS_POINTER = DEFAULT_OS_ROOT.parent / "NestWriting" / "latest-daily-writing-desk-readiness.json"
DEFAULT_NEST_WRITING_PUBLICATION_RUNWAY_POINTER = DEFAULT_OS_ROOT.parent / "NestWriting" / "latest-writing-publication-runway.json"
DEFAULT_NEST_WRITING_REVISION_BATCH_POINTER = DEFAULT_OS_ROOT.parent / "NestWriting" / "latest-nest-writing-next-revision-batch.json"
DEFAULT_NEST_WRITING_MOMENTUM_BOARD_POINTER = DEFAULT_OS_ROOT.parent / "NestWriting" / "latest-nest-writing-momentum-board.json"
DEFAULT_NEST_SMALL_WRITING_SESSION_POINTER = DEFAULT_OS_ROOT.parent / "NestWriting" / "latest-nest-writing-small-session.json"
DEFAULT_PHOTO_CULLING_SPRINT_POINTER = DEFAULT_OS_ROOT.parent / "PhotoGrove" / "latest-photo-grove-culling-sprint-companion.json"
DEFAULT_STUDIO360_PROOF_CONTROL_ROOM_POINTER = DEFAULT_OS_ROOT.parent / "Studio360" / "latest-studio360-proof-control-room.json"
DEFAULT_STUDIO360_LEGACY_PROOF_CONTROL_ROOM_POINTER = DEFAULT_OS_ROOT.parent / "Studio360" / "latest-360-proof-control-room.json"
DEFAULT_STUDIO360_NEXT_SOURCE_CARD_POINTER = DEFAULT_OS_ROOT.parent / "Studio360" / "latest-studio360-next-source-card.json"
DEFAULT_STUDIO360_OPERATOR_WORKBENCH_POINTER = DEFAULT_OS_ROOT.parent / "Studio360" / "latest-studio360-operator-workbench.json"
DEFAULT_STUDIO360_REPAIR_PREFLIGHT_POINTER = DEFAULT_OS_ROOT.parent / "Studio360" / "latest-360-repair-preflight.json"
DEFAULT_STUDIO360_SOURCE_DESK_POINTER = DEFAULT_OS_ROOT.parent / "Studio360" / "latest-360-source-desk.json"
SCHEMA = "quipsly.return-brief.v1"
HUMAN_ASK = (
    "Open the return brief, review the top queue, and choose one reversible local action. "
    "Do not publish, upload, schedule, mutate accounts, or capture receipts unless Charlie explicitly approves the exact external action."
)
AGENT_SAFE_PARALLEL_WORK = (
    "Codex can improve local packets, summaries, review queues, validation, and blocker precision. "
    "It must not mutate sources, approve, publish, upload, schedule, delete, or create receipt truth."
)
SPRINT_COMPANION_ORDER = [
    "studio-top-review-companion",
    "nest-writing-sprint-companion",
    "photo-grove-culling-sprint-companion",
    "360-proof-sprint-companion",
    "tower-publishing-sprint-companion",
]
PRODUCTION_COMPANION_POINTERS = [
    {
        "id": "studio",
        "lane": "Studio podcast/video",
        "label": "Studio top review",
        "path": Path("/Volumes/My Passport/Episode_and_Shorts_Test/review-board/latest-studio-top-review-companion.json"),
    },
    {
        "id": "nest-writing",
        "lane": "Nest writing/research",
        "label": "Nest writing control room",
        "path": DEFAULT_NEST_WRITING_CONTROL_ROOM_POINTER,
    },
    {
        "id": "photo-grove",
        "lane": "Photo Grove",
        "label": "Photo Grove control room",
        "path": DEFAULT_PHOTO_CONTROL_ROOM_POINTER,
    },
    {
        "id": "studio360",
        "lane": "360 workflow",
        "label": "Studio360 proof control room",
        "path": DEFAULT_STUDIO360_PROOF_CONTROL_ROOM_POINTER,
    },
    {
        "id": "tower",
        "lane": "Tower publishing/social",
        "label": "Tower publication control room",
        "path": DEFAULT_TOWER_PUBLICATION_CONTROL_ROOM_POINTER,
    },
]


def iso_now() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def stamp() -> str:
    return datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S-%f")


def load_json(path: Path) -> dict[str, Any]:
    if not path.exists():
        return {}
    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
        return payload if isinstance(payload, dict) else {}
    except json.JSONDecodeError:
        return {}


def load_pointer_target(path: Path) -> dict[str, Any]:
    pointer = load_json(path)
    target_path = Path(str(pointer.get("jsonPath") or "")) if pointer.get("jsonPath") else None
    if target_path and target_path.exists() and target_path != path:
        target = load_json(target_path)
        if target:
            return {**pointer, **target}
    return pointer


def current_workspace_row(
    *,
    lane: str,
    label: str,
    pointer_path: Path,
    path_fields: list[str],
    description: str,
    safety: str,
) -> dict[str, Any]:
    packet = load_pointer_target(pointer_path)
    chosen = ""
    chosen_field = ""
    related_paths: list[dict[str, str]] = []
    for field in path_fields:
        value = str(packet.get(field) or "")
        if value:
            related_paths.append({
                "field": field,
                "path": value,
                "openCommand": f"open {shell_quote(value)}",
            })
        if value:
            if not chosen:
                chosen = value
                chosen_field = field
    return {
        "lane": lane,
        "label": label,
        "status": str(packet.get("status") or "missing-pointer"),
        "pointerPath": str(pointer_path),
        "path": chosen,
        "pathExists": Path(chosen).exists() if chosen else False,
        "pathField": chosen_field,
        "openCommand": f"open {shell_quote(chosen)}" if chosen else "",
        "description": description,
        "safety": safety,
        "counts": packet.get("counts") if isinstance(packet.get("counts"), dict) else {},
        "relatedPaths": related_paths,
    }


def prefer_current_workspace_primary(
    row: dict[str, Any],
    pointer_path: Path,
    path_fields: list[str],
    *,
    label: str | None = None,
    description: str | None = None,
    safety: str | None = None,
) -> dict[str, Any]:
    packet = load_pointer_target(pointer_path)
    chosen = ""
    chosen_field = ""
    new_related: list[dict[str, str]] = []
    for field in path_fields:
        value = str(packet.get(field) or "")
        if not value:
            continue
        new_related.append({
            "field": field,
            "path": value,
            "openCommand": f"open {shell_quote(value)}",
        })
        if not chosen:
            chosen = value
            chosen_field = field
    if not chosen:
        return row
    existing_related = row.get("relatedPaths") if isinstance(row.get("relatedPaths"), list) else []
    existing_paths = {str(item.get("path") or "") for item in existing_related if isinstance(item, dict)}
    merged_related = new_related + [
        item for item in existing_related
        if isinstance(item, dict) and str(item.get("path") or "") not in existing_paths.intersection({related["path"] for related in new_related})
    ]
    updated = dict(row)
    updated.update({
        "label": label or str(packet.get("label") or row.get("label") or ""),
        "description": description or row.get("description") or "",
        "safety": safety or row.get("safety") or "",
        "status": str(packet.get("status") or row.get("status") or ""),
        "pointerPath": str(pointer_path),
        "fallbackPointerPath": row.get("pointerPath") or "",
        "path": chosen,
        "pathExists": Path(chosen).exists() if chosen else False,
        "pathField": chosen_field,
        "openCommand": f"open {shell_quote(chosen)}",
        "counts": packet.get("counts") if isinstance(packet.get("counts"), dict) else row.get("counts", {}),
        "relatedPaths": merged_related,
    })
    return updated


def local_next_action(
    *,
    lane: str,
    label: str,
    status: str,
    path: str = "",
    command: str = "",
    next_action: str = "",
    safety: str = "",
    source: str = "",
    counts: dict[str, Any] | None = None,
    first_dry_run_command: str = "",
    first_dry_run_decision: str = "",
    first_dry_run_safety: str = "",
    first_local_proof_command: str = "",
    first_local_proof_aspect: str = "",
    first_local_proof_safety: str = "",
    first_local_proof_output_exists: bool = False,
    first_local_proof_review_command: str = "",
    first_draft_packet_command: str = "",
    first_draft_packet_safety: str = "",
) -> dict[str, Any]:
    return {
        "lane": lane,
        "label": label,
        "status": status,
        "path": path,
        "pathExists": Path(path).exists() if path else False,
        "openCommand": command or (f"open {shell_quote(path)}" if path else ""),
        "nextAction": next_action,
        "safety": safety,
        "source": source,
        "counts": counts or {},
        "firstDryRunCommand": first_dry_run_command,
        "firstDryRunDecision": first_dry_run_decision,
        "firstDryRunSafety": first_dry_run_safety,
        "firstLocalProofCommand": first_local_proof_command,
        "firstLocalProofAspect": first_local_proof_aspect,
        "firstLocalProofOutputExists": first_local_proof_output_exists,
        "firstLocalProofReviewCommand": first_local_proof_review_command,
        "firstLocalProofSafety": first_local_proof_safety,
        "firstDraftPacketCommand": first_draft_packet_command,
        "firstDraftPacketSafety": first_draft_packet_safety,
    }


def build_bite_sized_next_actions_by_lane(
    *,
    studio_watch_listen_review_room_pointer: dict[str, Any],
    studio_duration_warning_review_pointer: dict[str, Any],
    nest_daily_packet_pointer: dict[str, Any],
    nest_writing_momentum_board_pointer: dict[str, Any],
    nest_writing_revision_batch_pointer: dict[str, Any],
    photo_proof_desk_pointer: dict[str, Any],
    photo_next_cull_batch_pointer: dict[str, Any],
    photo_first_pass_triage_pointer: dict[str, Any],
    studio360_source_desk_pointer: dict[str, Any],
    tower_social_command_pointer: dict[str, Any],
) -> list[dict[str, Any]]:
    actions: list[dict[str, Any]] = []

    studio_item = studio_watch_listen_review_room_pointer.get("firstReviewItem")
    studio_item = studio_item if isinstance(studio_item, dict) else {}
    studio_command = str(studio_item.get("firstSafeCommand") or studio_item.get("decisionCommand") or "")
    studio_review_path = str(studio_watch_listen_review_room_pointer.get("htmlPath") or "")
    duration_action = (
        studio_duration_warning_review_pointer.get("firstSafeAction")
        if isinstance(studio_duration_warning_review_pointer.get("firstSafeAction"), dict)
        else {}
    )
    duration_episode_count = int(studio_duration_warning_review_pointer.get("episodeCount") or 0)
    duration_review_path = str(duration_action.get("path") or studio_duration_warning_review_pointer.get("htmlPath") or "")
    if duration_episode_count and duration_review_path:
        actions.append(local_next_action(
            lane="Studio podcast/video",
            label=f"Review duration warning packet ({duration_episode_count} episode{'s' if duration_episode_count != 1 else ''})",
            status=str(studio_duration_warning_review_pointer.get("status") or "duration-warning-review-ready"),
            path=duration_review_path,
            command=str(duration_action.get("command") or f"open {shell_quote(duration_review_path)}"),
            next_action=str(studio_duration_warning_review_pointer.get("nextSafestAction") or "Open the duration warning packet, review the evidence snippets, then record only a local decision."),
            safety=str(duration_action.get("safety") or "Opens local duration warning evidence. No repair, package promotion, publishing, upload, schedule, source mutation, overwrite, account mutation, or receipt truth."),
            source="duration-warning-review-packet.firstSafeAction",
            counts={
                "durationWarningPacketEpisodes": duration_episode_count,
                "warningEpisodes": duration_episode_count,
            },
            first_dry_run_command=studio_command,
            first_dry_run_decision="pending",
            first_dry_run_safety=str(studio_item.get("decisionSafety") or "Dry-run only. No ledger mutation, package promotion, publishing, upload, schedule, source mutation, overwrite, account mutation, or receipt truth."),
        ))
    else:
        actions.append(local_next_action(
            lane="Studio podcast/video",
            label=str(studio_item.get("title") or "Review one watch/listen item"),
            status=str(studio_item.get("status") or studio_watch_listen_review_room_pointer.get("status") or ""),
            path=studio_review_path,
            command=f"open {shell_quote(studio_review_path)}" if studio_review_path else "",
            next_action=str(studio_item.get("nextSafestAction") or "Watch/listen to one review item, then record only a local decision if the evidence is clear."),
            safety="Opens local watch/listen review evidence. No package promotion, publishing, upload, schedule, source mutation, overwrite, account mutation, or receipt truth.",
            source="studio-watch-listen-review-room.firstReviewItem",
            counts=studio_watch_listen_review_room_pointer.get("counts") if isinstance(studio_watch_listen_review_room_pointer.get("counts"), dict) else {},
            first_dry_run_command=studio_command,
            first_dry_run_decision="pending",
            first_dry_run_safety=str(studio_item.get("decisionSafety") or "Dry-run only. No ledger mutation, package promotion, publishing, upload, schedule, source mutation, overwrite, account mutation, or receipt truth."),
        ))

    momentum_action = nest_writing_momentum_board_pointer.get("firstSafeAction") if isinstance(nest_writing_momentum_board_pointer.get("firstSafeAction"), dict) else {}
    momentum_counts = nest_writing_momentum_board_pointer.get("counts") if isinstance(nest_writing_momentum_board_pointer.get("counts"), dict) else {}
    momentum_first_task = nest_writing_momentum_board_pointer.get("firstWritingTask") if isinstance(nest_writing_momentum_board_pointer.get("firstWritingTask"), dict) else {}
    momentum_path = str(momentum_action.get("path") or nest_writing_momentum_board_pointer.get("htmlPath") or "")
    if momentum_path:
        actions.append(local_next_action(
            lane="Nest writing/research",
            label="Open source-first writing momentum board",
            status=str(nest_writing_momentum_board_pointer.get("status") or ""),
            path=momentum_path,
            command=str(momentum_action.get("command") or f"open {shell_quote(momentum_path)}"),
            next_action=str(nest_writing_momentum_board_pointer.get("nextSafestAction") or "Open the writing momentum board, follow the source-first recipe, and prepare one draft/revision move without replacing canon."),
            safety=str(momentum_action.get("safety") or "Local writing momentum board only. No source mutation, canon replacement, publication, upload, schedule, approval, overwrite, account mutation, delete, or receipt truth."),
            source="nest-writing-momentum-board",
            counts=momentum_counts,
            first_draft_packet_command=str(momentum_first_task.get("draftPacketCommand") or ""),
            first_draft_packet_safety=str(momentum_first_task.get("commandSafety") or "Creates or opens a local source-backed draft packet only. No canonical manuscript replacement, source mutation, publication, upload, schedule, approval, overwrite, account mutation, or receipt truth."),
        ))

    revision_batch_action = nest_writing_revision_batch_pointer.get("firstSafeAction") if isinstance(nest_writing_revision_batch_pointer.get("firstSafeAction"), dict) else {}
    revision_batch_counts = nest_writing_revision_batch_pointer.get("counts") if isinstance(nest_writing_revision_batch_pointer.get("counts"), dict) else {}
    revision_batch_path = str(revision_batch_action.get("path") or nest_writing_revision_batch_pointer.get("htmlPath") or "")
    if revision_batch_path:
        actions.append(local_next_action(
            lane="Nest writing/research",
            label=f"Review next writing revision batch ({revision_batch_counts.get('batchRows') or 0} drafts)",
            status=str(nest_writing_revision_batch_pointer.get("status") or ""),
            path=revision_batch_path,
            command=str(revision_batch_action.get("command") or revision_batch_action.get("openCommand") or ""),
            next_action=str(nest_writing_revision_batch_pointer.get("nextSafestAction") or "Open the next writing revision batch, compare source trails, and prepare one reversible revision/source-check note without replacing canon."),
            safety=str(revision_batch_action.get("safety") or "Local Nest writing revision batch only. No source mutation, canon replacement, publication, upload, schedule, approval, overwrite, account mutation, delete, or receipt truth."),
            source="nest-writing-next-revision-batch",
            counts=revision_batch_counts,
        ))

    writing_card = nest_daily_packet_pointer.get("nextWritingCard")
    writing_card = writing_card if isinstance(writing_card, dict) else {}
    writing_action = writing_card.get("firstSafeAction") if isinstance(writing_card.get("firstSafeAction"), dict) else {}
    actions.append(local_next_action(
        lane="Nest writing/research",
        label=str(writing_card.get("label") or "Open one writing card"),
        status=str(writing_card.get("status") or nest_daily_packet_pointer.get("status") or ""),
        path=str(writing_action.get("path") or writing_card.get("htmlPath") or nest_daily_packet_pointer.get("htmlPath") or ""),
        command=str(writing_action.get("command") or ""),
        next_action=str(writing_card.get("codexCanContinueWith") or "Open one source-backed writing card and prepare revision notes without replacing canon."),
        safety=str(writing_action.get("safety") or "Local writing/research card only. No source mutation, canon replacement, publication, upload, schedule, overwrite, account mutation, or receipt truth."),
        source="nest-daily-writing-packet.nextWritingCard",
        counts=nest_daily_packet_pointer.get("counts") if isinstance(nest_daily_packet_pointer.get("counts"), dict) else {},
        first_draft_packet_command=str(writing_card.get("safeDraftPacketCommand") or ""),
        first_draft_packet_safety=str(writing_card.get("safeDraftPacketSafety") or "Creates a local source-backed draft preview packet only. No canonical manuscript replacement, source mutation, publication, upload, schedule, approval, overwrite, account mutation, or receipt truth."),
    ))

    triage_action = photo_first_pass_triage_pointer.get("firstSafeAction") if isinstance(photo_first_pass_triage_pointer.get("firstSafeAction"), dict) else {}
    triage_counts = photo_first_pass_triage_pointer.get("counts") if isinstance(photo_first_pass_triage_pointer.get("counts"), dict) else {}
    triage_path = str(triage_action.get("path") or photo_first_pass_triage_pointer.get("htmlPath") or "")
    if triage_path:
        actions.append(local_next_action(
            lane="Photo Grove",
            label=f"Open Photo Grove first-pass triage ({triage_counts.get('groups', 0)} groups)",
            status=str(photo_first_pass_triage_pointer.get("status") or ""),
            path=triage_path,
            command=str(triage_action.get("command") or f"open {shell_quote(triage_path)}"),
            next_action=str(photo_first_pass_triage_pointer.get("nextSafestAction") or "Open the first-pass triage deck, compare one group, and use dry-run commands only."),
            safety=str(triage_action.get("safety") or "First-pass cull evidence only. No metadata write, proof selection, export, delivery, upload, publication, source mutation, delete, overwrite, account mutation, or receipt truth."),
            source="photo-grove-first-pass-triage",
            counts=triage_counts,
            first_dry_run_command=str(photo_first_pass_triage_pointer.get("firstDryRunCommand") or ""),
            first_dry_run_decision="review",
            first_dry_run_safety="Dry-run only. No metadata write, source mutation, proof export, delivery, upload, publication, approval, account mutation, or receipt truth.",
        ))

    batch_action = photo_next_cull_batch_pointer.get("firstSafeAction") if isinstance(photo_next_cull_batch_pointer.get("firstSafeAction"), dict) else {}
    batch_counts = photo_next_cull_batch_pointer.get("counts") if isinstance(photo_next_cull_batch_pointer.get("counts"), dict) else {}
    batch_path = str(batch_action.get("path") or photo_next_cull_batch_pointer.get("htmlPath") or "")
    if batch_path:
        actions.append(local_next_action(
            lane="Photo Grove",
            label=f"Review next Photo Grove cull batch ({batch_counts.get('batchRows', 0)} photos)",
            status=str(photo_next_cull_batch_pointer.get("status") or ""),
            path=batch_path,
            command=str(batch_action.get("command") or f"open {shell_quote(batch_path)}"),
            next_action=str(photo_next_cull_batch_pointer.get("nextSafestAction") or "Open the next cull batch, compare one group, and use dry-run commands only."),
            safety=str(batch_action.get("safety") or "Batch cull evidence only. No metadata write, proof selection, export, delivery, upload, publication, source mutation, delete, overwrite, account mutation, or receipt truth."),
            source="photo-grove-next-cull-batch",
            counts=batch_counts,
            first_dry_run_command=str(photo_next_cull_batch_pointer.get("firstDryRunCommand") or ""),
            first_dry_run_decision=str(photo_next_cull_batch_pointer.get("firstDryRunDecision") or ""),
            first_dry_run_safety=str(photo_next_cull_batch_pointer.get("firstDryRunSafety") or "Dry-run only. No metadata write, source mutation, proof export, delivery, upload, publication, approval, account mutation, or receipt truth."),
        ))
    else:
        proof_rows = photo_proof_desk_pointer.get("rows") if isinstance(photo_proof_desk_pointer.get("rows"), list) else []
        next_cull = next((row for row in proof_rows if isinstance(row, dict) and row.get("id") == "next-cull-card"), proof_rows[0] if proof_rows and isinstance(proof_rows[0], dict) else {})
        actions.append(local_next_action(
            lane="Photo Grove",
            label=str(next_cull.get("title") or "Open one next cull card"),
            status=str(next_cull.get("status") or photo_proof_desk_pointer.get("status") or ""),
            path=str(next_cull.get("htmlPath") or photo_proof_desk_pointer.get("htmlPath") or ""),
            next_action=str(next_cull.get("nextSafestAction") or next_cull.get("why") or "Inspect one photo card, compare evidence, and stop before live metadata writes."),
            safety=str(next_cull.get("safety") or "One-card cull evidence only. No metadata write, proof selection, export, delivery, upload, publication, source mutation, delete, overwrite, account mutation, or receipt truth."),
            source="photo-grove-proof-desk.rows.next-cull-card",
            counts=photo_proof_desk_pointer.get("counts") if isinstance(photo_proof_desk_pointer.get("counts"), dict) else {},
            first_dry_run_command=str(next_cull.get("firstDryRunCommand") or ""),
            first_dry_run_decision=str(next_cull.get("firstDryRunDecision") or ""),
            first_dry_run_safety=str(next_cull.get("firstDryRunSafety") or "Dry-run only. No metadata write, source mutation, proof export, delivery, upload, publication, approval, account mutation, or receipt truth."),
        ))

    runway = studio360_source_desk_pointer.get("operatorRunway") if isinstance(studio360_source_desk_pointer.get("operatorRunway"), list) else []
    next_source = runway[0] if runway and isinstance(runway[0], dict) else {}
    source_action = next_source.get("firstSafeAction") if isinstance(next_source.get("firstSafeAction"), dict) else {}
    actions.append(local_next_action(
        lane="360 workflow",
        label=str(next_source.get("label") or "Inspect one 360 source card"),
        status=str(next_source.get("status") or studio360_source_desk_pointer.get("status") or ""),
        path=str(source_action.get("path") or studio360_source_desk_pointer.get("htmlPath") or ""),
        command=str(source_action.get("command") or ""),
        next_action=str(next_source.get("nextAction") or "Inspect one 360 source group and confirm source/proxy/reframe readiness before any render."),
        safety=str(source_action.get("safety") or "Local 360 source inspection only. No proxy generation, repair, render, export, upload, publication, schedule, metadata write, source mutation, delete, overwrite, account mutation, or receipt truth."),
        source="studio360-source-desk.operatorRunway[0]",
        counts=studio360_source_desk_pointer.get("counts") if isinstance(studio360_source_desk_pointer.get("counts"), dict) else {},
        first_local_proof_command=str(next_source.get("firstLocalProofCommand") or ""),
        first_local_proof_aspect=str(next_source.get("firstLocalProofAspect") or ""),
        first_local_proof_output_exists=bool(next_source.get("firstLocalProofOutputExists")),
        first_local_proof_review_command=str(next_source.get("firstLocalProofReviewCommand") or ""),
        first_local_proof_safety=str(next_source.get("firstLocalProofSafety") or "Local proof command only. It is visible for review, not executed by the next-action command."),
    ))

    tower_next_batch = load_pointer_target(DEFAULT_TOWER_NEXT_PUBLISHING_BATCH_POINTER)
    tower_next_card = load_pointer_target(DEFAULT_TOWER_NEXT_PUBLISHING_CARD_POINTER)
    tower_action = tower_next_batch if tower_next_batch else tower_next_card
    tower_source = "tower-next-publishing-batch" if tower_next_batch else "tower-next-publishing-card"
    tower_path = str(tower_action.get("htmlPath") or tower_social_command_pointer.get("nextPublishingCardPath") or tower_social_command_pointer.get("htmlPath") or "")
    actions.append(local_next_action(
        lane="Tower publishing/social",
        label=str(tower_action.get("title") or tower_action.get("label") or "Open Tower next publishing batch"),
        status=str(tower_action.get("status") or tower_social_command_pointer.get("status") or ""),
        path=tower_path,
        next_action=str(tower_action.get("nextSafestAction") or "Open a local publishing batch, prepare or inspect platform packet evidence, and stop before approval, scheduling, upload, publication, or receipt capture."),
        safety=str(tower_action.get("firstDryRunSafety") or "Local Tower packet/review batch only. No external publishing, upload, schedule, approval, account mutation, source mutation, delete, overwrite, or receipt truth."),
        source=tower_source,
        counts=tower_action.get("counts") if isinstance(tower_action.get("counts"), dict) else tower_social_command_pointer.get("counts") if isinstance(tower_social_command_pointer.get("counts"), dict) else {},
        first_dry_run_command=str(tower_action.get("firstDryRunCommand") or ""),
        first_dry_run_decision=str(tower_action.get("firstDryRunDecision") or ""),
        first_dry_run_safety=str(tower_action.get("firstDryRunSafety") or "Dry-run only. No external publication, upload, schedule, approval, account mutation, source mutation, overwrite, delete, or receipt truth."),
    ))

    return actions


def write_json(path: Path, payload: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, indent=2, sort_keys=True) + "\n", encoding="utf-8")


def resolve_board(pointer_path: Path) -> tuple[dict[str, Any], Path, dict[str, Any]]:
    pointer = load_json(pointer_path)
    board_path = Path(str(pointer.get("jsonPath") or "")) if pointer.get("jsonPath") else pointer_path
    board = load_json(board_path)
    return board, board_path, pointer


def priority_rank(value: str) -> int:
    return {"attention": 0, "review": 1, "ready": 2}.get(value, 3)


def shell_quote(value: str) -> str:
    return "'" + value.replace("'", "'\\''") + "'"


def plain_text(value: Any, fallback: str = "") -> str:
    if isinstance(value, dict):
        return str(value.get("description") or value.get("truthDescription") or value.get("label") or fallback)
    if isinstance(value, list):
        return "; ".join(str(item) for item in value if item)
    return str(value or fallback)


def collect_open_targets(board: dict[str, Any]) -> list[dict[str, str]]:
    def lane_label(lane_name: str, key: str, fallback: str) -> str:
        if key == "latestPacketHtml":
            if lane_name == "Nest writing/research":
                return "Nest source packet"
            if lane_name == "360 workflow":
                return "Studio360 workflow packet"
            return f"{lane_name} packet"
        return fallback

    targets: list[dict[str, str]] = []
    for key, label in [
        ("latestQuipslyOSRefreshHtml", "Quipsly OS refresh run"),
        ("latestQuipslyOSValidationHtml", "Quipsly OS validation report"),
    ]:
        path = board.get(key)
        if path:
            targets.append({"lane": "Quipsly OS", "label": label, "path": str(path), "openCommand": f"open {shell_quote(str(path))}"})
    for lane in board.get("lanes") or []:
        if not isinstance(lane, dict):
            continue
        lane_name = str(lane.get("lane") or "Lane")
        for key, label in [
            ("latestDurationDecisionSheetHtml", "Studio duration decision sheet"),
            ("latestDurationRepairQueueHtml", "Studio duration repair queue"),
            ("latestDurationRepairWorkorderHtml", "Studio duration repair work orders"),
            ("latestTowerReviewAnomalyHtml", "Tower review anomaly sheet"),
            ("latestClientProofHtml", "Photo Grove client proof packet"),
            ("latestReviewBatchHtml", "Photo Grove focused review batch"),
            ("latestCullSuggestionHtml", "Photo Grove first-pass cull suggestions"),
            ("latestPhotoGroveCommandSheetHtml", "Photo Grove cull command sheet"),
            ("latestPhotoGroveOperatorWorkbenchHtml", "Photo Grove operator workbench"),
            ("latest360RepairPreflightHtml", "Studio360 repair preflight"),
            ("latestReframeHtml", "Studio360 reframe packet"),
            ("latestPacketHtml", "Nest source packet"),
            ("latestWritingSessionCockpitHtml", "Nest writing session cockpit"),
            ("latestWritingDailyPacketHtml", "Nest daily writing packet"),
            ("latestWritingSprintHtml", "Nest writing sprint companion"),
            ("latestNestWritingControlRoomHtml", "Nest writing control room"),
            ("latestNestAuthorDeskHtml", "Nest author desk"),
            ("latestNestReviewDeskHtml", "Nest writing review desk"),
            ("latestTowerSocialCommandCenterHtml", "Tower social command center"),
            ("latestTowerNextPublishingBatchHtml", "Tower next publishing batch"),
            ("latestTowerManualCalendarHtml", "Tower manual publishing calendar"),
            ("latestTowerReviewCommandSheetHtml", "Tower review command sheet"),
            ("latestTowerPublicationControlRoomHtml", "Tower publication control room"),
            ("latestTowerOperatorWorkbenchHtml", "Tower operator workbench"),
            ("latestStudioSyncControlRoomHtml", "Studio sync control room"),
            ("latestStudioSyncDecisionRehearsalHtml", "Studio sync decision rehearsal"),
            ("latestStudioSyncDecisionAidHtml", "Studio sync decision aid"),
            ("latestStudio360ProofControlRoomHtml", "Studio360 proof control room"),
            ("latestStudio360OperatorWorkbenchHtml", "Studio360 operator workbench"),
            ("latestStudio360RepairPreflightHtml", "Studio360 repair preflight"),
            ("latest360ExportCandidateQueueHtml", "Studio360 export candidate queue"),
            ("latestTowerRunwayHtml", "Tower publishing runway"),
        ]:
            path = lane.get(key)
            if path:
                targets.append({"lane": lane_name, "label": lane_label(lane_name, key, label), "path": str(path), "openCommand": f"open {shell_quote(str(path))}"})
    return targets


def summarize_lanes(board: dict[str, Any], open_targets: list[dict[str, str]]) -> list[dict[str, Any]]:
    lanes: list[dict[str, Any]] = []
    for lane in board.get("lanes") or []:
        if not isinstance(lane, dict):
            continue
        lane_name = str(lane.get("lane") or "")
        action_cards = lane.get("actionCards") if isinstance(lane.get("actionCards"), list) else []
        top = [enrich_action_card(card) for card in sorted(action_cards, key=lambda card: (
            priority_rank(str(card.get("priority") or "")),
            int(card.get("queueSortRank") or 50),
            str(card.get("id") or ""),
        ))[:3] if isinstance(card, dict)]
        lane_targets = [target for target in open_targets if target.get("lane") == lane_name]
        lanes.append({
            "lane": lane_name,
            "status": lane.get("status") or "",
            "nextSafestAction": lane.get("nextSafestAction") or "",
            "actionCardCount": len(action_cards),
            "openTargetCount": len(lane_targets),
            "openTargets": lane_targets[:8],
            "topCards": top,
        })
    return lanes


def build_away_mode_runway(top_queue: list[dict[str, Any]], lane_summaries: list[dict[str, Any]], open_targets: list[dict[str, str]]) -> dict[str, Any]:
    first_card = top_queue[0] if top_queue else {}
    first_action = first_action_summary(first_card) if first_card else {}
    lane_statuses = [
        {
            "lane": lane.get("lane") or "",
            "status": lane.get("status") or "",
            "nextSafestAction": lane.get("nextSafestAction") or "",
            "firstOpenTarget": (lane.get("openTargets") or [{}])[0] if lane.get("openTargets") else {},
        }
        for lane in lane_summaries
    ]
    return {
        "title": "Away-mode return runway",
        "purpose": "Let Charlie, Mako, Homer, or Codex restart production calmly without mistaking local readiness for publication truth.",
        "firstFifteenMinutes": [
            "Open this return brief and the first top-queue evidence item.",
            "Read only the safety boundary and the top three queue cards.",
            "Choose one reversible local action: review, refine, validate, or mark a blocker.",
            "Do not publish, upload, schedule, delete, or create receipt truth during re-entry unless Charlie explicitly approves that exact external action.",
        ],
        "firstHour": [
            "Clear or refine one Studio podcast/video review item.",
            "Move one Nest writing task through a 25-minute source-backed writing sprint.",
            "Compare one Photo Grove starter review group and record metadata-only intent only after visual inspection.",
            "Use Tower packets to prepare copy and receipt slots, not to claim publication.",
        ],
        "codexCanContinue": [
            "Regenerate local boards, packets, manifests, validation reports, and review decks.",
            "Prepare metadata packets, platform copy, transcript/source trails, and proof/readiness summaries.",
            "Improve UI/tooling where the review loop creates friction.",
            "Route around a stalled lane and record the blocker precisely.",
        ],
        "explicitApprovalRequired": [
            "public posting or scheduling",
            "uploads to external services",
            "account or credential mutation",
            "deleting source files",
            "marking publication receipts as real without a real URL/proof",
        ],
        "firstQueueAction": {
            "title": first_card.get("title") or first_card.get("action") or "",
            "lane": first_card.get("lane") or "",
            "openCommand": first_action.get("openCommand") or "",
            "firstSafeCommand": first_action.get("firstSafeCommand") or "",
            "safety": first_action.get("safety") or "",
        },
        "laneStatuses": lane_statuses,
        "openTargetCount": len(open_targets),
        "topQueueCount": len(top_queue),
    }


def collect_sprint_companions(priority_queue: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Return the stable cross-lane sprint front doors.

    The top queue can legitimately change depending on human-help or review
    urgency. These companions should stay visible because they are the current
    working front doors for Studio, Photo Grove, 360, and Tower.
    """
    by_id = {
        str(card.get("id") or ""): enrich_action_card(card)
        for card in priority_queue
        if isinstance(card, dict)
    }
    return [by_id[item_id] for item_id in SPRINT_COMPANION_ORDER if item_id in by_id]


def matrix_count_summary(companion_id: str, counts: dict[str, Any], packet: dict[str, Any]) -> str:
    if companion_id == "studio":
        return (
            f"{counts.get('reviewItems', 0)} review item(s): "
            f"{counts.get('durationCandidateItems', 0)} duration candidate(s), "
            f"{counts.get('syncInvestigationItems', 0)} sync investigation(s)."
        )
    if companion_id == "nest-writing":
        return (
            f"{counts.get('sourceWords', 0)} source words, {counts.get('currentDrafts', 0)} draft(s), "
            f"{counts.get('pendingHumanReview', 0)} pending human review item(s)."
        )
    if companion_id == "photo-grove":
        plan = packet.get("reviewOutputPlan") if isinstance(packet.get("reviewOutputPlan"), dict) else {}
        return (
            f"{counts.get('sourcePhotos', 0)} source photo(s), {counts.get('pending', 0)} pending, "
            f"{counts.get('review', 0)} review, {counts.get('selectedForClientProof', 0)} selected; "
            f"client proof ready: {plan.get('readyForClientProof', False)}."
        )
    if companion_id == "studio360":
        gate = packet.get("renderGate") if isinstance(packet.get("renderGate"), dict) else {}
        return (
            f"{counts.get('proofOutputsPresent', 0)} proof output(s), {counts.get('proofNextRows', 0)} next proof row(s), "
            f"{counts.get('exportCandidateRows', 0)} export candidate row(s), "
            f"{counts.get('reframeReady', 0)} reframe-ready, {counts.get('blockedMediaRepair', 0)} repair blocker(s), "
            f"{counts.get('damagedAssets', 0)} damaged asset(s); full render ready: {gate.get('readyForFullRender', False)}."
        )
    if companion_id == "tower":
        return (
            f"{counts.get('episodes', 0)} episode(s), {counts.get('blockedOrReview', 0)} blocked/review row(s), "
            f"{counts.get('readyForApproval', 0)} ready-for-approval row(s), {counts.get('publicationBatches', 0)} publication batch(es), "
            f"{counts.get('capturedReceipts', 0)} receipt(s)."
        )
    return ", ".join(f"{key}: {value}" for key, value in sorted(counts.items())[:6])


def matrix_gate_summary(companion_id: str, counts: dict[str, Any], packet: dict[str, Any]) -> tuple[str, str]:
    if companion_id == "studio":
        review_items = int(counts.get("reviewItems") or 0)
        if review_items:
            return "review-needed", "Classify Episode 1 candidate and Episode 4 sync evidence before Tower approval."
        return "review-clear", "No top Studio review items reported by the companion."
    if companion_id == "nest-writing":
        drafts = int(counts.get("currentDrafts") or 0)
        pending = int(counts.get("pendingHumanReview") or 0)
        if drafts:
            return "drafting-ready", f"{drafts} draft(s) are available; {pending} still need human review before publication."
        return "source-ready", "Source-backed writing packet exists; create or refine a draft next."
    if companion_id == "photo-grove":
        plan = packet.get("reviewOutputPlan") if isinstance(packet.get("reviewOutputPlan"), dict) else {}
        if plan.get("readyForClientProof"):
            return "proof-prep-ready", str(plan.get("nextIfReady") or "Prepare proof packet for human approval.")
        return "culling-needed", str(plan.get("nextIfBlocked") or "Continue culling before client proof prep.")
    if companion_id == "studio360":
        gate = packet.get("renderGate") if isinstance(packet.get("renderGate"), dict) else {}
        if gate.get("readyForFullRender"):
            return "render-plan-ready", str(gate.get("nextIfReady") or "Prepare versioned full-render plan for approval.")
        return "proof-review-needed", str(gate.get("nextIfBlocked") or "Review proofs and resolve blockers before full render.")
    if companion_id == "tower":
        ready = int(counts.get("readyForApproval") or 0)
        receipts = int(counts.get("capturedReceipts") or 0)
        studio_gate = int(counts.get("studioTopReviewItems") or counts.get("studioGateItems") or 0)
        review_pressure = int(counts.get("blockedOrReview") or counts.get("pendingRows") or counts.get("warningRows") or 0)
        if ready:
            return "approval-needed", f"{ready} row(s) need explicit human approval before posting; receipts captured so far: {receipts}."
        if studio_gate:
            return "blocked-by-studio-review", f"Tower has platform packets, but Studio still has {studio_gate} gate item(s)."
        if review_pressure:
            return "blocked-by-studio-review", f"Tower has platform packets, but {review_pressure} local review/warning row(s) still need classification."
        return "packet-prep", "Prepare packets and receipt slots; no external publication is implied."
    return "unknown", "Open companion for current lane truth."


def collect_production_readiness_matrix() -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    for definition in PRODUCTION_COMPANION_POINTERS:
        pointer_path = definition["path"]
        packet = load_pointer_target(pointer_path)
        counts = packet.get("counts") if isinstance(packet.get("counts"), dict) else {}
        readiness, gate_summary = matrix_gate_summary(str(definition["id"]), counts, packet)
        rows.append({
            "id": definition["id"],
            "lane": definition["lane"],
            "label": definition["label"],
            "status": packet.get("status") or ("missing" if not pointer_path.exists() else "unknown"),
            "readiness": readiness,
            "countSummary": matrix_count_summary(str(definition["id"]), counts, packet),
            "gateSummary": gate_summary,
            "nextSafestAction": packet.get("nextSafestAction") or gate_summary,
            "htmlPath": packet.get("htmlPath") or "",
            "jsonPath": packet.get("jsonPath") or "",
            "markdownPath": packet.get("markdownPath") or "",
            "worksheetPath": packet.get("worksheetPath") or "",
            "openCommand": f"open {shell_quote(str(packet.get('worksheetPath') or packet.get('htmlPath') or ''))}" if packet.get("worksheetPath") or packet.get("htmlPath") else "",
            "pointerPath": str(pointer_path),
            "truth": plain_text(packet.get("truth"), "Companion pointer only. No external or source mutation implied."),
        })
    return rows


def preferred_pointer(primary: Path, fallback: Path | None = None) -> dict[str, Any]:
    packet = load_pointer_target(primary)
    if packet or primary.exists() or fallback is None:
        return packet
    return load_pointer_target(fallback)


def normalize_loop_step(index: int, step: dict[str, Any]) -> dict[str, str]:
    command = str(step.get("command") or step.get("openCommand") or "")
    return {
        "index": str(index),
        "label": str(step.get("label") or step.get("title") or f"Step {index}"),
        "status": str(step.get("status") or ""),
        "command": command,
        "path": str(step.get("path") or ""),
        "description": str(step.get("description") or step.get("why") or step.get("plainEnglish") or step.get("next") or ""),
        "safety": str(step.get("safety") or "Local/operator guidance only. No source, approval, receipt, upload, schedule, or publication mutation."),
    }


def summarize_operating_loop(lane: str, label: str, packet: dict[str, Any], loop_key: str) -> dict[str, Any]:
    loop = packet.get(loop_key) if isinstance(packet.get(loop_key), list) else []
    if not loop:
        return {}
    steps = [
        normalize_loop_step(index, step)
        for index, step in enumerate(loop, 1)
        if isinstance(step, dict)
    ]
    first = steps[0] if steps else {}
    first_safe_action = packet.get("firstSafeAction") if isinstance(packet.get("firstSafeAction"), dict) else {}
    first_command = first.get("command") or str(first_safe_action.get("command") or "")
    return {
        "lane": lane,
        "label": label,
        "loopKey": loop_key,
        "status": str(packet.get("status") or "unknown"),
        "stepCount": len(steps),
        "firstStepLabel": first.get("label") or "",
        "firstStepCommand": first_command,
        "firstStepSafety": first.get("safety") or str(first_safe_action.get("safety") or ""),
        "nextSafestAction": str(packet.get("nextSafestAction") or ""),
        "humanAsk": str(packet.get("humanAsk") or ""),
        "htmlPath": str(packet.get("htmlPath") or ""),
        "jsonPath": str(packet.get("jsonPath") or ""),
        "openCommand": f"open {shell_quote(str(packet.get('htmlPath')))}" if packet.get("htmlPath") else "",
        "steps": steps[:8],
        "truth": plain_text(packet.get("truth"), "Operating-loop summary only. It does not approve, publish, upload, schedule, delete, mutate sources, or capture receipts."),
    }


def summarize_tower_gate(packet: dict[str, Any]) -> dict[str, Any]:
    gate = packet.get("studioReviewGate") if isinstance(packet.get("studioReviewGate"), dict) else {}
    if not gate:
        return {}
    first_safe_action = packet.get("firstSafeAction") if isinstance(packet.get("firstSafeAction"), dict) else {}
    open_command = str(first_safe_action.get("command") or (f"open {shell_quote(str(packet.get('htmlPath')))}" if packet.get("htmlPath") else ""))
    steps = [
        {
            "index": "1",
            "label": "Open Tower publication control room",
            "status": str(packet.get("status") or ""),
            "command": open_command,
            "path": str(packet.get("htmlPath") or ""),
            "description": "Start from Tower's local control surface without implying anything has been published.",
            "safety": str(first_safe_action.get("safety") or "Opens local publication runway evidence only."),
        },
        {
            "index": "2",
            "label": "Clear Studio review gates first",
            "status": str(gate.get("status") or ""),
            "command": "",
            "path": str(gate.get("htmlPath") or ""),
            "description": str(gate.get("nextSafestAction") or "Resolve Studio package questions before approval or receipt work."),
            "safety": "Readiness gate only. It does not publish or create receipt truth.",
        },
        {
            "index": "3",
            "label": "Prepare packets, not publication claims",
            "status": "packet-prep",
            "command": "",
            "path": "",
            "description": str(packet.get("nextSafestAction") or "Prepare platform packets and receipt slots while waiting for explicit external approval."),
            "safety": "No external posting, scheduling, upload, account mutation, or fake receipt capture.",
        },
    ]
    return {
        "lane": "Tower publishing/social",
        "label": "Tower publication gate loop",
        "loopKey": "studioReviewGate",
        "status": str(packet.get("status") or gate.get("status") or "unknown"),
        "stepCount": len(steps),
        "firstStepLabel": steps[0]["label"],
        "firstStepCommand": open_command,
        "firstStepSafety": steps[0]["safety"],
        "nextSafestAction": str(packet.get("nextSafestAction") or gate.get("nextSafestAction") or ""),
        "humanAsk": str(packet.get("humanAsk") or ""),
        "htmlPath": str(packet.get("htmlPath") or ""),
        "jsonPath": str(packet.get("jsonPath") or ""),
        "openCommand": open_command,
        "steps": steps,
        "truth": plain_text(packet.get("truth"), "Tower gate summary only. No external publication or receipt truth is implied."),
    }


def collect_work_session_launchers(tower_publication_control_room_pointer: dict[str, Any]) -> list[dict[str, Any]]:
    raw = tower_publication_control_room_pointer.get("productionWorkSessionLaunchers")
    if not isinstance(raw, list):
        return []
    launchers: list[dict[str, Any]] = []
    for item in raw:
        if not isinstance(item, dict):
            continue
        path = str(item.get("path") or "")
        command = str(item.get("command") or (f"open {shell_quote(path)}" if path else ""))
        if str(item.get("id") or "") == "photo-grove-cull-sprint":
            photo_packet = load_pointer_target(DEFAULT_PHOTO_CONTROL_ROOM_POINTER)
            latest_path = str(
                photo_packet.get("cullDecisionCardsPath")
                or photo_packet.get("firstCullRunwayPath")
                or photo_packet.get("htmlPath")
                or path
            )
            if latest_path:
                path = latest_path
                command = f"open {shell_quote(latest_path)}"
        if str(item.get("id") or "") == "nest-first-writing-session":
            nest_packet = load_pointer_target(DEFAULT_NEST_WRITING_CONTROL_ROOM_POINTER)
            latest_path = str(
                nest_packet.get("nextWritingCardPath")
                or nest_packet.get("writingWorkCardsPath")
                or nest_packet.get("firstWritingSessionNotePath")
                or nest_packet.get("htmlPath")
                or path
            )
            if latest_path:
                path = latest_path
                command = f"open {shell_quote(latest_path)}"
        if str(item.get("id") or "") == "studio360-proof-continuation":
            studio360_packet = load_pointer_target(DEFAULT_STUDIO360_PROOF_CONTROL_ROOM_POINTER)
            latest_path = str(
                studio360_packet.get("next360SourceCardPath")
                or studio360_packet.get("sourceRoutingCardsPath")
                or studio360_packet.get("proofRunwayPath")
                or studio360_packet.get("reframeExportRunwayPath")
                or studio360_packet.get("htmlPath")
                or path
            )
            if latest_path:
                path = latest_path
                command = f"open {shell_quote(latest_path)}"
        launchers.append({
            "id": str(item.get("id") or ""),
            "lane": str(item.get("lane") or "Quipsly"),
            "label": (
                "Run a Photo Grove cull-card review"
                if str(item.get("id") or "") == "photo-grove-cull-sprint"
                else "Open next Nest writing card"
                if str(item.get("id") or "") == "nest-first-writing-session"
                else "Open next Studio360 source card"
                if str(item.get("id") or "") == "studio360-proof-continuation"
                else str(item.get("label") or "Open work session")
            ),
            "status": str(item.get("status") or ""),
            "path": path,
            "command": command,
            "whatItDoes": (
                "Opens the latest Photo Grove cull decision cards for one reversible local review note."
                if str(item.get("id") or "") == "photo-grove-cull-sprint"
                else "Opens the latest Nest writing card for one source-backed local writing/review note; the larger work-card deck remains linked for deeper review."
                if str(item.get("id") or "") == "nest-first-writing-session"
                else "Opens the latest Studio360 next source card for one reversible source/proxy/companion truth check; the larger routing deck remains linked for deeper review."
                if str(item.get("id") or "") == "studio360-proof-continuation"
                else str(item.get("whatItDoes") or "")
            ),
            "firstHumanQuestion": (
                "Which candidate should be keep/review/reject/favorite after source evidence, without writing metadata yet?"
                if str(item.get("id") or "") == "photo-grove-cull-sprint"
                else "Which source-backed writing move should happen next without replacing canon?"
                if str(item.get("id") or "") == "nest-first-writing-session"
                else "Which 360 source group is safe to inspect next before proof, proxy prep, or full render work?"
                if str(item.get("id") or "") == "studio360-proof-continuation"
                else str(item.get("firstHumanQuestion") or "")
            ),
            "agentSafeWork": str(item.get("agentSafeWork") or ""),
            "explicitNonClaims": item.get("explicitNonClaims") if isinstance(item.get("explicitNonClaims"), list) else [],
            "truth": (
                "Local Photo Grove cull-card launcher only. No metadata write, proof delivery, upload, publication, source mutation, delete, overwrite, or receipt truth."
                if str(item.get("id") or "") == "photo-grove-cull-sprint"
                else "Local Nest writing work-card launcher only. No source mutation, canon replacement, upload, publication, schedule, approval, overwrite, or receipt truth."
                if str(item.get("id") or "") == "nest-first-writing-session"
                else "Local Studio360 next-source-card launcher only. No proxy generation, render, full export, upload, publication, schedule, source mutation, metadata write, delete, overwrite, or receipt truth."
                if str(item.get("id") or "") == "studio360-proof-continuation"
                else str(item.get("truth") or "Local work-session launcher only. No external publication or source mutation implied.")
            ),
        })
    return launchers


def collect_operating_loops(
    photo_control_room_pointer: dict[str, Any],
    nest_writing_control_room_pointer: dict[str, Any],
    studio360_proof_control_room_pointer: dict[str, Any],
    tower_publication_control_room_pointer: dict[str, Any],
) -> list[dict[str, Any]]:
    loops = [
        summarize_operating_loop("Photo Grove", "Photo Grove cull loop", photo_control_room_pointer, "reviewLoop"),
        summarize_operating_loop("Nest writing/research", "Nest source-backed writing loop", nest_writing_control_room_pointer, "writingLoop"),
        summarize_operating_loop("360 workflow", "Studio360 proof loop", studio360_proof_control_room_pointer, "proofLoop"),
        summarize_tower_gate(tower_publication_control_room_pointer),
    ]
    return [loop for loop in loops if loop]


def return_path_open_action(packet: dict[str, Any] | None, fallback_label: str = "Open local evidence") -> dict[str, str]:
    if not isinstance(packet, dict):
        return {"label": fallback_label, "command": "", "path": "", "safety": ""}
    first = packet.get("firstSafeAction") if isinstance(packet.get("firstSafeAction"), dict) else {}
    path = str(
        first.get("path")
        or packet.get("worksheetPath")
        or packet.get("htmlPath")
        or packet.get("markdownPath")
        or packet.get("jsonPath")
        or ""
    )
    command = str(first.get("command") or packet.get("openCommand") or (f"open {shell_quote(path)}" if path else ""))
    return {
        "label": str(first.get("label") or fallback_label),
        "command": command,
        "path": path,
        "safety": str(first.get("safety") or packet.get("actionSafety") or packet.get("truth") or ""),
    }


def matrix_row_by_id(rows: list[dict[str, Any]], row_id: str) -> dict[str, Any]:
    for row in rows:
        if str(row.get("id") or "") == row_id:
            return row
    return {}


def build_return_review_path(
    return_html_path: Path,
    top_queue: list[dict[str, Any]],
    production_readiness_matrix: list[dict[str, Any]],
    shorts_review_cockpit_pointer: dict[str, Any],
    action_deck_pointer: dict[str, Any],
    human_help_pointer: dict[str, Any],
) -> list[dict[str, Any]]:
    """A human-first path for Charlie's first calm hour back in the system.

    This is deliberately a sequence, not another dashboard. It points at
    already-generated truth surfaces and repeats the non-mutation boundary so
    return-from-away review work stays calm and local.
    """
    first_queue = top_queue[0] if top_queue else {}
    first_queue_action = first_action_summary(first_queue) if first_queue else {}
    first_queue_first_safe = first_queue.get("firstSafeAction") if isinstance(first_queue.get("firstSafeAction"), dict) else {}
    shorts_counts = shorts_review_cockpit_pointer.get("counts") if isinstance(shorts_review_cockpit_pointer.get("counts"), dict) else {}
    studio_row = matrix_row_by_id(production_readiness_matrix, "studio")
    tower_row = matrix_row_by_id(production_readiness_matrix, "tower")
    nest_row = matrix_row_by_id(production_readiness_matrix, "nest-writing")
    photo_row = matrix_row_by_id(production_readiness_matrix, "photo-grove")
    studio360_row = matrix_row_by_id(production_readiness_matrix, "studio360")
    shorts_action = return_path_open_action(shorts_review_cockpit_pointer, "Open Shorts Review Cockpit")
    action_deck_action = return_path_open_action(action_deck_pointer, "Open Safe Action Deck")
    human_help_action = return_path_open_action(human_help_pointer, "Open Human Help Board")

    steps: list[dict[str, Any]] = [
        {
            "index": 1,
            "lane": "Quipsly OS",
            "label": "Open this return brief first",
            "why": "Start from one calm map instead of spelunking through many generated packets.",
            "openCommand": f"open {shell_quote(str(return_html_path))}",
            "path": str(return_html_path),
            "proof": "This is the generated start-here artifact for the current OS board.",
            "safety": "Opens local handoff evidence only. No source, approval, receipt, upload, schedule, or publication mutation.",
        },
        {
            "index": 2,
            "lane": str(first_queue.get("lane") or "Top queue"),
            "label": "Classify the first waiting decision",
            "why": str(first_queue.get("humanAsk") or first_queue.get("action") or "Resolve the highest-priority local review item before pretending anything is ready."),
            "openCommand": first_queue_action.get("openCommand") or first_queue_action.get("firstSafeCommand") or "",
            "path": str(first_queue_first_safe.get("path") or first_queue.get("htmlPath") or first_queue.get("jsonPath") or ""),
            "proof": str(first_queue.get("status") or first_queue.get("priority") or "Top queue item"),
            "safety": first_queue_action.get("safety") or "Local evidence only. Do not approve, publish, upload, schedule, delete, overwrite, or create receipt truth.",
        },
        {
            "index": 3,
            "lane": "Studio podcast/video",
            "label": "Review Studio before Tower",
            "why": str(studio_row.get("gateSummary") or "Long-form/shorts evidence should be classified before platform packets are treated as approval-ready."),
            "openCommand": str(studio_row.get("openCommand") or ""),
            "path": str(studio_row.get("worksheetPath") or studio_row.get("htmlPath") or ""),
            "proof": str(studio_row.get("countSummary") or ""),
            "safety": str(studio_row.get("truth") or "Studio review evidence only. No publication or receipt truth."),
        },
        {
            "index": 4,
            "lane": "Studio shorts",
            "label": "Watch/listen through exported shorts",
            "why": "Shorts are the fastest proof that edit, audio, platform shape, and human review are converging.",
            "openCommand": shorts_action["command"],
            "path": shorts_action["path"],
            "proof": f"{shorts_counts.get('reviewable', 0)} reviewable short(s), {shorts_counts.get('missingFiles', 0)} missing file(s).",
            "safety": shorts_action["safety"] or "Local watch/listen review only. No upload, schedule, approval, or receipt mutation.",
        },
        {
            "index": 5,
            "lane": "Tower publishing/social",
            "label": "Prepare packets, do not publish",
            "why": str(tower_row.get("gateSummary") or "Tower is for packet/readiness/receipt truth. It should wait for explicit approval after local review."),
            "openCommand": str(tower_row.get("openCommand") or ""),
            "path": str(tower_row.get("worksheetPath") or tower_row.get("htmlPath") or ""),
            "proof": str(tower_row.get("countSummary") or ""),
            "safety": str(tower_row.get("truth") or "Manual publishing runway only. No external posting or fake receipts."),
        },
        {
            "index": 6,
            "lane": "Parallel proof lanes",
            "label": "Use Nest, Photo Grove, and 360 as safe parallel lanes",
            "why": "If Studio review stalls, there is still productive local work: writing review, photo culling, 360 proofing, validation, and packet cleanup.",
            "openCommand": action_deck_action["command"] or human_help_action["command"],
            "path": action_deck_action["path"] or human_help_action["path"],
            "proof": "Nest: " + str(nest_row.get("readiness") or "unknown") + "; Photo: " + str(photo_row.get("readiness") or "unknown") + "; 360: " + str(studio360_row.get("readiness") or "unknown"),
            "safety": "Use only local evidence, sidecars, packets, validation, and reversible review prep. Do not mutate sources or external accounts.",
        },
        {
            "index": 7,
            "lane": "Blockers",
            "label": "If something feels scary, write the blocker precisely and move lanes",
            "why": "A blocked lane should not stop the whole operating system. Make the next reversible thing more true, more visible, or more useful.",
            "openCommand": human_help_action["command"] or action_deck_action["command"],
            "path": human_help_action["path"] or action_deck_action["path"],
            "proof": str((human_help_pointer.get("counts") or {}).get("helpItems", 0) if isinstance(human_help_pointer.get("counts"), dict) else "Human help board"),
            "safety": "Documentation/review routing only. No deletion, publishing, upload, schedule, account mutation, or receipt capture.",
        },
    ]
    return steps


def build_payload(board: dict[str, Any], board_path: Path, pointer: dict[str, Any], out_dir: Path) -> dict[str, Any]:
    priority_queue = board.get("priorityQueue") if isinstance(board.get("priorityQueue"), list) else []
    first_actions_by_lane = board.get("firstActionsByLane") if isinstance(board.get("firstActionsByLane"), list) else []
    if not first_actions_by_lane and isinstance(pointer.get("firstActionsByLane"), list):
        first_actions_by_lane = pointer.get("firstActionsByLane") or []
    open_targets = collect_open_targets(board)
    action_deck_pointer = load_pointer_target(DEFAULT_OS_ROOT / "latest-quipsly-action-deck.json")
    human_help_pointer = load_pointer_target(DEFAULT_OS_ROOT / "latest-quipsly-human-help-board.json")
    blocker_ledger_pointer = load_pointer_target(DEFAULT_BLOCKER_LEDGER_POINTER)
    pointer_contract_validation_pointer = load_pointer_target(DEFAULT_POINTER_CONTRACT_VALIDATION_POINTER)
    photo_contact_sheet_pointer = load_pointer_target(DEFAULT_PHOTO_CONTACT_SHEET_POINTER)
    photo_control_room_pointer = load_pointer_target(DEFAULT_PHOTO_CONTROL_ROOM_POINTER)
    photo_cull_rehearsal_pointer = load_pointer_target(DEFAULT_PHOTO_CULL_REHEARSAL_POINTER)
    photo_operator_workbench_pointer = load_pointer_target(DEFAULT_PHOTO_OPERATOR_WORKBENCH_POINTER)
    photo_cull_theater_pointer = load_pointer_target(DEFAULT_PHOTO_CULL_THEATER_POINTER)
    photo_proof_desk_pointer = load_pointer_target(DEFAULT_PHOTO_PROOF_DESK_POINTER)
    photo_next_cull_batch_pointer = load_pointer_target(DEFAULT_PHOTO_NEXT_CULL_BATCH_POINTER)
    photo_first_pass_triage_pointer = load_pointer_target(DEFAULT_PHOTO_FIRST_PASS_TRIAGE_POINTER)
    photo_live_intake_status_pointer = load_pointer_target(DEFAULT_PHOTO_LIVE_INTAKE_STATUS_POINTER)
    tower_publication_control_room_pointer = load_pointer_target(DEFAULT_TOWER_PUBLICATION_CONTROL_ROOM_POINTER)
    tower_social_command_pointer = load_pointer_target(DEFAULT_TOWER_SOCIAL_COMMAND_POINTER)
    tower_next_publishing_batch_pointer = load_pointer_target(DEFAULT_TOWER_NEXT_PUBLISHING_BATCH_POINTER)
    tower_operator_workbench_pointer = load_pointer_target(DEFAULT_TOWER_OPERATOR_WORKBENCH_POINTER)
    nest_writing_control_room_pointer = load_pointer_target(DEFAULT_NEST_WRITING_CONTROL_ROOM_POINTER)
    nest_author_desk_pointer = load_pointer_target(DEFAULT_NEST_AUTHOR_DESK_POINTER)
    nest_review_desk_pointer = load_pointer_target(DEFAULT_NEST_REVIEW_DESK_POINTER)
    nest_daily_packet_pointer = load_pointer_target(DEFAULT_NEST_DAILY_PACKET_POINTER)
    daily_writing_readiness_pointer = load_pointer_target(DEFAULT_DAILY_WRITING_READINESS_POINTER)
    nest_writing_publication_runway_pointer = load_pointer_target(DEFAULT_NEST_WRITING_PUBLICATION_RUNWAY_POINTER)
    nest_writing_momentum_board_pointer = load_pointer_target(DEFAULT_NEST_WRITING_MOMENTUM_BOARD_POINTER)
    nest_writing_revision_batch_pointer = load_pointer_target(DEFAULT_NEST_WRITING_REVISION_BATCH_POINTER)
    studio_sync_control_room_pointer = load_pointer_target(DEFAULT_STUDIO_SYNC_CONTROL_ROOM_POINTER)
    studio_sync_decision_rehearsal_pointer = load_pointer_target(DEFAULT_STUDIO_SYNC_DECISION_REHEARSAL_POINTER)
    studio_sync_decision_aid_pointer = load_pointer_target(DEFAULT_STUDIO_SYNC_DECISION_AID_POINTER)
    studio_top_review_companion_pointer = load_pointer_target(DEFAULT_STUDIO_TOP_REVIEW_COMPANION_POINTER)
    studio_package_quality_desk_pointer = load_pointer_target(DEFAULT_STUDIO_PACKAGE_QUALITY_DESK_POINTER)
    studio_package_blocker_triage_pointer = load_pointer_target(DEFAULT_STUDIO_PACKAGE_BLOCKER_TRIAGE_POINTER)
    studio_review_theater_pointer = load_pointer_target(DEFAULT_STUDIO_REVIEW_THEATER_POINTER)
    studio_next_shorts_review_batch_pointer = load_pointer_target(DEFAULT_STUDIO_NEXT_SHORTS_REVIEW_BATCH_POINTER)
    studio_watch_listen_review_room_pointer = load_pointer_target(DEFAULT_STUDIO_WATCH_LISTEN_REVIEW_ROOM_POINTER)
    studio_duration_warning_review_pointer = load_pointer_target(DEFAULT_STUDIO_DURATION_WARNING_REVIEW_POINTER)
    studio_duration_experiment_matrix_pointer = load_pointer_target(DEFAULT_STUDIO_DURATION_EXPERIMENT_MATRIX_POINTER)
    studio_duration_version_workorders_pointer = load_pointer_target(DEFAULT_STUDIO_DURATION_VERSION_WORKORDERS_POINTER)
    studio_duration_edit_recipe_skeletons_pointer = load_pointer_target(DEFAULT_STUDIO_DURATION_EDIT_RECIPE_SKELETONS_POINTER)
    studio_transcript_source_workorders_pointer = load_pointer_target(DEFAULT_STUDIO_TRANSCRIPT_SOURCE_WORKORDERS_POINTER)
    studio_transcript_execution_readiness_pointer = load_pointer_target(DEFAULT_STUDIO_TRANSCRIPT_EXECUTION_READINESS_POINTER)
    studio_transcript_pilot_pointer = load_pointer_target(DEFAULT_STUDIO_TRANSCRIPT_PILOT_POINTER)
    studio_transcript_review_workbench_pointer = load_pointer_target(DEFAULT_STUDIO_TRANSCRIPT_REVIEW_WORKBENCH_POINTER)
    studio_transcript_review_decision_ledger_pointer = load_pointer_target(DEFAULT_STUDIO_TRANSCRIPT_REVIEW_DECISION_LEDGER_POINTER)
    shorts_review_cockpit_pointer = load_pointer_target(DEFAULT_SHORTS_REVIEW_COCKPIT_POINTER)
    studio360_proof_control_room_pointer = preferred_pointer(DEFAULT_STUDIO360_PROOF_CONTROL_ROOM_POINTER, DEFAULT_STUDIO360_LEGACY_PROOF_CONTROL_ROOM_POINTER)
    studio360_operator_workbench_pointer = load_pointer_target(DEFAULT_STUDIO360_OPERATOR_WORKBENCH_POINTER)
    studio360_repair_preflight_pointer = load_pointer_target(DEFAULT_STUDIO360_REPAIR_PREFLIGHT_POINTER)
    studio360_source_desk_pointer = load_pointer_target(DEFAULT_STUDIO360_SOURCE_DESK_POINTER)
    current_workspaces = [
        current_workspace_row(
            lane="Studio podcast/video",
            label="Studio next review card",
            pointer_path=DEFAULT_STUDIO_NEXT_REVIEW_CARD_POINTER,
            path_fields=["nextStudioReviewCardPath", "htmlPath", "reviewerDailyChecklistPath", "durationWarningCardsPath", "reviewerReturnHandoffPath", "reviewDecisionCardsPath", "humanReviewerRunwayPath", "reviewWorksheetPath", "workSessionHtmlPath"],
            description="Start with one Episode 1-6 review card, then use the checklist, duration warnings, decisions, and reviewer handoff as deeper local evidence before Tower or publishing work.",
            safety="Local next-review card only. No approval, promotion, repair, export, upload, publication, schedule, account mutation, receipt capture, source mutation, delete, or overwrite.",
        ),
        current_workspace_row(
            lane="Nest writing/research",
            label="Nest writing next card",
            pointer_path=DEFAULT_NEST_WRITING_CONTROL_ROOM_POINTER,
            path_fields=["nextWritingCardPath", "writingWorkCardsPath", "publishableDraftPrepCardsPath", "writerReturnHandoffPath", "writingRunwayPath", "firstWritingSessionNotePath", "htmlPath", "markdownPath"],
            description="Start the next book/article pass from tiny source-backed work cards, then use publishable draft prep cards to shape book/article/social packets without canon or publication claims.",
            safety="Local writing next-card/work-card launcher only. No source mutation, canon replacement, publication, upload, schedule, account mutation, receipt capture, delete, or overwrite.",
        ),
        current_workspace_row(
            lane="Photo Grove",
            label="Photo cull decision cards",
            pointer_path=DEFAULT_PHOTO_CONTROL_ROOM_POINTER,
            path_fields=["nextCullCardPath", "cullDecisionCardsPath", "qualityEvidenceCardsPath", "proofCandidateCardsPath", "firstCullRunwayPath", "photoDeliveryRunwayPath", "markdownPath", "htmlPath"],
            description="Start Photo Grove from tiny cull decision cards, then use quality evidence and proof-candidate cards to prepare a future proof set without selecting or delivering.",
            safety="Local cull decision cards only. No live metadata write, client delivery, export, upload, publication, schedule, receipt capture, source mutation, delete, or overwrite.",
        ),
        current_workspace_row(
            lane="360 workflow",
            label="Studio360 next source card",
            pointer_path=DEFAULT_STUDIO360_PROOF_CONTROL_ROOM_POINTER,
            path_fields=["next360SourceCardPath", "sourceRoutingCardsPath", "renderDryRunCardsPath", "reframeExportRunwayPath", "proofRunwayPath", "htmlPath", "markdownPath"],
            description="Start with one calm Studio360 source card, then use source routing and render dry-run cards for deeper source/proxy decisions without creating proof or render claims.",
            safety="Local next-source/source-routing guidance only. No render, full export, upload, publication, schedule, repair, source mutation, metadata write, receipt capture, delete, or overwrite.",
        ),
        current_workspace_row(
            lane="Tower publishing/social",
            label="Tower next publishing card",
            pointer_path=DEFAULT_TOWER_SOCIAL_COMMAND_POINTER,
            path_fields=["nextPublishingCardPath", "manualPublishingActionCardsPath", "shortsPublishingActionCardsPath", "draftSocialCalendarPath", "reviewWeekPlanPath", "manualPublishingRunwayPath", "htmlPath", "markdownPath"],
            description="Start Tower from tiny publishing action cards, then use the draft social calendar as local sequencing support. Keep approval/publication/receipt truth separate.",
            safety="Local next-publishing/action-card launcher only. No external publish, upload, schedule, approval, account mutation, receipt capture, delete, or overwrite.",
        ),
    ]
    current_workspaces = [
        prefer_current_workspace_primary(
            row,
            DEFAULT_STUDIO360_NEXT_SOURCE_CARD_POINTER,
            ["next360SourceCardPath", "htmlPath", "markdownPath", "jsonPath"],
            label="Studio360 next source card",
            description="Inspect one source group when the full 360 operator workbench needs a narrower starting point.",
        )
        if row.get("lane") == "360 workflow" else prefer_current_workspace_primary(
            row,
            DEFAULT_NEST_AUTHOR_DESK_POINTER,
            ["htmlPath", "markdownPath", "csvPath", "jsonPath"],
            label="Nest author desk",
            description="Start book/article work from a small source-backed author desk: daily writing tasks, linked evidence, and publishable draft prep without replacing canon.",
        )
        if row.get("lane") == "Nest writing/research" else prefer_current_workspace_primary(
            row,
            DEFAULT_PHOTO_OPERATOR_WORKBENCH_POINTER,
            ["htmlPath", "markdownPath", "csvPath", "jsonPath"],
            label="Photo Grove operator workbench",
            description="Start photo work from a calm cull/review workbench with source evidence, thumbnails, dry-run decisions, and proof candidates without touching originals.",
        )
        if row.get("lane") == "Photo Grove" else prefer_current_workspace_primary(
            row,
            DEFAULT_TOWER_SOCIAL_COMMAND_POINTER,
            ["htmlPath", "markdownPath", "csvPath", "jsonPath"],
            label="Tower social command center",
            description="Start publishing work from the Hootsuite-like Tower social command center: platform rows, draft calendar, shorts queues, action cards, review slots, and receipt placeholders without external publishing claims.",
        )
        if row.get("lane") == "Tower publishing/social" else row
        for row in current_workspaces
    ]
    current_workspaces = [
        prefer_current_workspace_primary(
            row,
            DEFAULT_STUDIO_PACKAGE_QUALITY_DESK_POINTER,
            ["htmlPath", "markdownPath", "jsonPath"],
            label="Studio package quality desk",
            description="Start podcast/video review from all six current packages, shorts, warnings, review rows, and receipt slots before any Tower approval or publishing work.",
            safety="Local package quality desk only. No approval, promotion, repair, export, publish, upload, schedule, account mutation, receipt capture, source mutation, delete, or overwrite.",
        )
        if row.get("lane") == "Studio podcast/video" else row
        for row in current_workspaces
    ]
    current_workspaces = [
        prefer_current_workspace_primary(
            row,
            DEFAULT_NEST_REVIEW_DESK_POINTER,
            ["htmlPath", "markdownPath", "csvPath", "jsonPath"],
            label="Nest writing review desk",
            description="Start book/article work from the full draft review desk: source trails, draft packets, platform packets, review flags, and canon boundaries in one calm surface.",
            safety="Local writing review desk only. No source mutation, canon replacement, publication, upload, schedule, account mutation, receipt capture, delete, or overwrite.",
        )
        if row.get("lane") == "Nest writing/research" else row
        for row in current_workspaces
    ]
    current_workspaces = [
        prefer_current_workspace_primary(
            row,
            DEFAULT_NEST_DAILY_PACKET_POINTER,
            ["htmlPath", "markdownPath", "csvPath", "jsonPath"],
            label="Nest daily writing packet",
            description="Start book/article work from one source-backed writing sprint: pick a draft move, keep provenance visible, and create or review a draft packet without replacing canon.",
            safety="Local daily writing packet only. No source mutation, canon replacement, publication, upload, schedule, account mutation, receipt capture, delete, or overwrite.",
        )
        if row.get("lane") == "Nest writing/research" else row
        for row in current_workspaces
    ]
    current_workspaces = [
        prefer_current_workspace_primary(
            row,
            DEFAULT_NEST_WRITING_REVISION_BATCH_POINTER,
            ["htmlPath", "markdownPath", "csvPath", "jsonPath"],
            label="Nest writing revision batch",
            description="Start book/article work from a compact source-backed revision batch: source checks, revision candidates, platform draft counts, and receipt slots stay visible without replacing canon.",
            safety="Local writing revision batch only. No source mutation, canon replacement, publication, upload, schedule, approval, account mutation, receipt capture, delete, or overwrite.",
        )
        if row.get("lane") == "Nest writing/research" else row
        for row in current_workspaces
    ]
    current_workspaces = [
        prefer_current_workspace_primary(
            row,
            DEFAULT_PHOTO_CULL_THEATER_POINTER,
            ["htmlPath", "markdownPath", "csvPath", "jsonPath"],
            label="Photo Grove cull theater",
            description="Start broader photo review from a calm cull theater with group context, thumbnails, dry-run decisions, and source evidence without touching originals.",
            safety="Local Photo Grove cull theater only. No metadata write, proof selection, copy, export, delivery, upload, publication, schedule, account mutation, receipt capture, source mutation, delete, or overwrite.",
        )
        if row.get("lane") == "Photo Grove" else row
        for row in current_workspaces
    ]
    current_workspaces = [
        prefer_current_workspace_primary(
            row,
            DEFAULT_PHOTO_PROOF_DESK_POINTER,
            ["htmlPath", "markdownPath", "csvPath", "jsonPath"],
            label="Photo Grove proof desk",
            description="Start Photo Grove from an Aftershoot-like proof desk: candidate starter set, review groups, metadata-only decision commands, and client-proof readiness stay visible without touching originals.",
            safety="Local Photo Grove proof desk only. No metadata write, proof selection, copy, export, delivery, upload, publication, schedule, account mutation, receipt capture, source mutation, delete, or overwrite.",
        )
        if row.get("lane") == "Photo Grove" else row
        for row in current_workspaces
    ]
    current_workspaces = [
        prefer_current_workspace_primary(
            row,
            DEFAULT_STUDIO360_OPERATOR_WORKBENCH_POINTER,
            ["htmlPath", "markdownPath", "csvPath", "jsonPath"],
            label="Studio360 operator workbench",
            description="Start 360 work from one source/proxy/proof/reframe/export control surface, with repair blockers visible and no render/export claims.",
        )
        if row.get("lane") == "360 workflow" else row
        for row in current_workspaces
    ]
    current_workspaces = [
        prefer_current_workspace_primary(
            row,
            DEFAULT_STUDIO360_REPAIR_PREFLIGHT_POINTER,
            ["htmlPath", "markdownPath", "csvPath", "jsonPath"],
            label="Studio360 repair preflight",
            description="Start 360 work from the repair preflight when damaged media is the visible blocker; keep ready proof/reframe work moving in parallel.",
            safety="Local 360 repair preflight only. No source repair, render, export, upload, publication, schedule, metadata decision, source mutation, delete, or overwrite.",
        )
        if row.get("lane") == "360 workflow" and str(studio360_operator_workbench_pointer.get("status") or "").endswith("repair-first") else row
        for row in current_workspaces
    ]
    current_workspaces = [
        prefer_current_workspace_primary(
            row,
            DEFAULT_STUDIO360_SOURCE_DESK_POINTER,
            ["htmlPath", "markdownPath", "csvPath", "jsonPath"],
            label="Studio360 source desk",
            description="Start 360 work from the whole source desk: repair tickets, proxy/reframe-ready groups, proof outputs, and export-candidate rows stay visible without claiming renders or repairs.",
            safety="Local Studio360 source desk only. No proxy generation, repair, render, export, upload, publication, schedule, metadata write, source mutation, delete, overwrite, or receipt truth.",
        )
        if row.get("lane") == "360 workflow" else row
        for row in current_workspaces
    ]
    human_help_items = human_help_pointer.get("items") if isinstance(human_help_pointer.get("items"), list) else []
    top_queue = (
        [enrich_help_item(item) for item in human_help_items[:12] if isinstance(item, dict)]
        if human_help_items
        else [enrich_action_card(card) for card in priority_queue[:12] if isinstance(card, dict)]
    )
    if human_help_pointer.get("htmlPath"):
        open_targets.insert(0, {
            "lane": "Quipsly OS",
            "label": "Human help board",
            "path": str(human_help_pointer.get("htmlPath")),
            "openCommand": f"open {shell_quote(str(human_help_pointer.get('htmlPath')))}",
        })
    if blocker_ledger_pointer.get("htmlPath"):
        open_targets.insert(0, {
            "lane": "Quipsly OS",
            "label": "Blocker and decision ledger",
            "path": str(blocker_ledger_pointer.get("htmlPath")),
            "openCommand": f"open {shell_quote(str(blocker_ledger_pointer.get('htmlPath')))}",
        })
    if pointer_contract_validation_pointer.get("htmlPath"):
        open_targets.insert(0, {
            "lane": "Quipsly OS",
            "label": "Pointer contract validation",
            "path": str(pointer_contract_validation_pointer.get("htmlPath")),
            "openCommand": f"open {shell_quote(str(pointer_contract_validation_pointer.get('htmlPath')))}",
        })
    if studio_sync_decision_aid_pointer.get("htmlPath"):
        open_targets.insert(0, {
            "lane": "Studio podcast/video",
            "label": "Episode sync decision aid",
            "path": str(studio_sync_decision_aid_pointer.get("htmlPath")),
            "openCommand": f"open {shell_quote(str(studio_sync_decision_aid_pointer.get('htmlPath')))}",
        })
    if studio_top_review_companion_pointer.get("htmlPath"):
        open_targets.insert(0, {
            "lane": "Studio podcast/video",
            "label": "Studio top review companion",
            "path": str(studio_top_review_companion_pointer.get("htmlPath")),
            "openCommand": f"open {shell_quote(str(studio_top_review_companion_pointer.get('htmlPath')))}",
        })
    if studio_package_quality_desk_pointer.get("htmlPath"):
        open_targets.insert(0, {
            "lane": "Studio podcast/video",
            "label": "Studio package quality desk",
            "path": str(studio_package_quality_desk_pointer.get("htmlPath")),
            "openCommand": f"open {shell_quote(str(studio_package_quality_desk_pointer.get('htmlPath')))}",
        })
    if studio_package_blocker_triage_pointer.get("htmlPath"):
        open_targets.insert(0, {
            "lane": "Studio podcast/video",
            "label": "Studio package blocker triage",
            "path": str(studio_package_blocker_triage_pointer.get("htmlPath")),
            "openCommand": f"open {shell_quote(str(studio_package_blocker_triage_pointer.get('htmlPath')))}",
        })
    if studio_review_theater_pointer.get("htmlPath"):
        open_targets.insert(0, {
            "lane": "Studio podcast/video",
            "label": "Studio review theater",
            "path": str(studio_review_theater_pointer.get("htmlPath")),
            "openCommand": f"open {shell_quote(str(studio_review_theater_pointer.get('htmlPath')))}",
        })
    if studio_next_shorts_review_batch_pointer.get("htmlPath"):
        open_targets.insert(0, {
            "lane": "Studio podcast/video",
            "label": "Studio next shorts review batch",
            "path": str(studio_next_shorts_review_batch_pointer.get("htmlPath")),
            "openCommand": f"open {shell_quote(str(studio_next_shorts_review_batch_pointer.get('htmlPath')))}",
        })
    if studio_duration_experiment_matrix_pointer.get("htmlPath"):
        open_targets.insert(0, {
            "lane": "Studio podcast/video",
            "label": "Studio duration experiment matrix",
            "path": str(studio_duration_experiment_matrix_pointer.get("htmlPath")),
            "openCommand": f"open {shell_quote(str(studio_duration_experiment_matrix_pointer.get('htmlPath')))}",
        })
    if studio_duration_version_workorders_pointer.get("htmlPath"):
        open_targets.insert(0, {
            "lane": "Studio podcast/video",
            "label": "Studio duration version work orders",
            "path": str(studio_duration_version_workorders_pointer.get("htmlPath")),
            "openCommand": f"open {shell_quote(str(studio_duration_version_workorders_pointer.get('htmlPath')))}",
        })
    if studio_duration_edit_recipe_skeletons_pointer.get("htmlPath"):
        open_targets.insert(0, {
            "lane": "Studio podcast/video",
            "label": "Studio duration edit-recipe skeletons",
            "path": str(studio_duration_edit_recipe_skeletons_pointer.get("htmlPath")),
            "openCommand": f"open {shell_quote(str(studio_duration_edit_recipe_skeletons_pointer.get('htmlPath')))}",
        })
    if studio_transcript_source_workorders_pointer.get("htmlPath"):
        open_targets.insert(0, {
            "lane": "Studio podcast/video",
            "label": "Studio transcript source work orders",
            "path": str(studio_transcript_source_workorders_pointer.get("htmlPath")),
            "openCommand": f"open {shell_quote(str(studio_transcript_source_workorders_pointer.get('htmlPath')))}",
        })
    if studio_transcript_execution_readiness_pointer.get("htmlPath"):
        open_targets.insert(0, {
            "lane": "Studio podcast/video",
            "label": "Studio transcript execution readiness",
            "path": str(studio_transcript_execution_readiness_pointer.get("htmlPath")),
            "openCommand": f"open {shell_quote(str(studio_transcript_execution_readiness_pointer.get('htmlPath')))}",
        })
    if studio_transcript_pilot_pointer.get("htmlPath"):
        open_targets.insert(0, {
            "lane": "Studio podcast/video",
            "label": "Studio transcript pilot",
            "path": str(studio_transcript_pilot_pointer.get("htmlPath")),
            "openCommand": f"open {shell_quote(str(studio_transcript_pilot_pointer.get('htmlPath')))}",
        })
    if studio_transcript_review_workbench_pointer.get("htmlPath"):
        open_targets.insert(0, {
            "lane": "Studio podcast/video",
            "label": "Studio transcript review workbench",
            "path": str(studio_transcript_review_workbench_pointer.get("htmlPath")),
            "openCommand": f"open {shell_quote(str(studio_transcript_review_workbench_pointer.get('htmlPath')))}",
        })
    if studio_transcript_review_decision_ledger_pointer.get("htmlPath"):
        open_targets.insert(0, {
            "lane": "Studio podcast/video",
            "label": "Studio transcript review decision ledger",
            "path": str(studio_transcript_review_decision_ledger_pointer.get("htmlPath")),
            "openCommand": f"open {shell_quote(str(studio_transcript_review_decision_ledger_pointer.get('htmlPath')))}",
        })
    if daily_writing_readiness_pointer.get("htmlPath"):
        open_targets.insert(0, {
            "lane": "Nest writing/research",
            "label": "Daily Writing Desk readiness",
            "path": str(daily_writing_readiness_pointer.get("htmlPath")),
            "openCommand": f"open {shell_quote(str(daily_writing_readiness_pointer.get('htmlPath')))}",
        })
    if studio_watch_listen_review_room_pointer.get("htmlPath"):
        open_targets.insert(0, {
            "lane": "Studio podcast/video",
            "label": "Studio watch/listen review room",
            "path": str(studio_watch_listen_review_room_pointer.get("htmlPath")),
            "openCommand": f"open {shell_quote(str(studio_watch_listen_review_room_pointer.get('htmlPath')))}",
        })
    if studio360_operator_workbench_pointer.get("htmlPath"):
        open_targets.insert(0, {
            "lane": "360 workflow",
            "label": "Studio360 operator workbench",
            "path": str(studio360_operator_workbench_pointer.get("htmlPath")),
            "openCommand": f"open {shell_quote(str(studio360_operator_workbench_pointer.get('htmlPath')))}",
        })
    if studio360_repair_preflight_pointer.get("htmlPath"):
        open_targets.insert(0, {
            "lane": "360 workflow",
            "label": "Studio360 repair preflight",
            "path": str(studio360_repair_preflight_pointer.get("htmlPath")),
            "openCommand": f"open {shell_quote(str(studio360_repair_preflight_pointer.get('htmlPath')))}",
        })
    if photo_contact_sheet_pointer.get("htmlPath"):
        open_targets.append({
            "lane": "Photo Grove",
            "label": "Photo Grove contact sheet",
            "path": str(photo_contact_sheet_pointer.get("htmlPath")),
            "openCommand": f"open {shell_quote(str(photo_contact_sheet_pointer.get('htmlPath')))}",
        })
    if photo_control_room_pointer.get("htmlPath"):
        open_targets.insert(0, {
            "lane": "Photo Grove",
            "label": "Photo Grove control room",
            "path": str(photo_control_room_pointer.get("htmlPath")),
            "openCommand": f"open {shell_quote(str(photo_control_room_pointer.get('htmlPath')))}",
        })
    if photo_cull_theater_pointer.get("htmlPath"):
        open_targets.insert(0, {
            "lane": "Photo Grove",
            "label": "Photo Grove cull theater",
            "path": str(photo_cull_theater_pointer.get("htmlPath")),
            "openCommand": f"open {shell_quote(str(photo_cull_theater_pointer.get('htmlPath')))}",
        })
    if photo_next_cull_batch_pointer.get("htmlPath"):
        open_targets.insert(0, {
            "lane": "Photo Grove",
            "label": "Photo Grove next cull batch",
            "path": str(photo_next_cull_batch_pointer.get("htmlPath")),
            "openCommand": f"open {shell_quote(str(photo_next_cull_batch_pointer.get('htmlPath')))}",
        })
    if photo_first_pass_triage_pointer.get("htmlPath"):
        open_targets.insert(0, {
            "lane": "Photo Grove",
            "label": "Photo Grove first-pass triage",
            "path": str(photo_first_pass_triage_pointer.get("htmlPath")),
            "openCommand": f"open {shell_quote(str(photo_first_pass_triage_pointer.get('htmlPath')))}",
        })
    if photo_live_intake_status_pointer.get("htmlPath"):
        open_targets.insert(0, {
            "lane": "Photo Grove",
            "label": "Photo Grove live intake status",
            "path": str(photo_live_intake_status_pointer.get("htmlPath")),
            "openCommand": f"open {shell_quote(str(photo_live_intake_status_pointer.get('htmlPath')))}",
        })
    if photo_proof_desk_pointer.get("htmlPath"):
        open_targets.insert(0, {
            "lane": "Photo Grove",
            "label": "Photo Grove proof desk",
            "path": str(photo_proof_desk_pointer.get("htmlPath")),
            "openCommand": f"open {shell_quote(str(photo_proof_desk_pointer.get('htmlPath')))}",
        })
    if photo_operator_workbench_pointer.get("htmlPath"):
        open_targets.insert(0, {
            "lane": "Photo Grove",
            "label": "Photo Grove operator workbench",
            "path": str(photo_operator_workbench_pointer.get("htmlPath")),
            "openCommand": f"open {shell_quote(str(photo_operator_workbench_pointer.get('htmlPath')))}",
        })
    if photo_cull_rehearsal_pointer.get("htmlPath"):
        open_targets.insert(0, {
            "lane": "Photo Grove",
            "label": "Photo Grove cull rehearsal",
            "path": str(photo_cull_rehearsal_pointer.get("htmlPath")),
            "openCommand": f"open {shell_quote(str(photo_cull_rehearsal_pointer.get('htmlPath')))}",
        })
    if nest_writing_publication_runway_pointer.get("htmlPath"):
        open_targets.insert(0, {
            "lane": "Nest writing/research",
            "label": "Writing publication runway",
            "path": str(nest_writing_publication_runway_pointer.get("htmlPath")),
            "openCommand": f"open {shell_quote(str(nest_writing_publication_runway_pointer.get('htmlPath')))}",
        })
    if nest_writing_revision_batch_pointer.get("htmlPath"):
        open_targets.insert(0, {
            "lane": "Nest writing/research",
            "label": "Nest writing revision batch",
            "path": str(nest_writing_revision_batch_pointer.get("htmlPath")),
            "openCommand": f"open {shell_quote(str(nest_writing_revision_batch_pointer.get('htmlPath')))}",
        })
    if nest_writing_momentum_board_pointer.get("htmlPath"):
        open_targets.insert(0, {
            "lane": "Nest writing/research",
            "label": "Nest writing momentum board",
            "path": str(nest_writing_momentum_board_pointer.get("htmlPath")),
            "openCommand": f"open {shell_quote(str(nest_writing_momentum_board_pointer.get('htmlPath')))}",
        })
    if action_deck_pointer.get("htmlPath"):
        open_targets.insert(0, {
            "lane": "Quipsly OS",
            "label": "Safe action deck",
            "path": str(action_deck_pointer.get("htmlPath")),
            "openCommand": f"open {shell_quote(str(action_deck_pointer.get('htmlPath')))}",
        })
    if nest_writing_control_room_pointer.get("writerReturnHandoffPath"):
        open_targets.insert(0, {
            "lane": "Nest writing/research",
            "label": "Nest writer return handoff",
            "path": str(nest_writing_control_room_pointer.get("writerReturnHandoffPath")),
            "openCommand": f"open {shell_quote(str(nest_writing_control_room_pointer.get('writerReturnHandoffPath')))}",
        })
    elif nest_writing_control_room_pointer.get("htmlPath"):
        open_targets.insert(0, {
            "lane": "Nest writing/research",
            "label": "Nest writing control room",
            "path": str(nest_writing_control_room_pointer.get("htmlPath")),
            "openCommand": f"open {shell_quote(str(nest_writing_control_room_pointer.get('htmlPath')))}",
        })
    if nest_author_desk_pointer.get("htmlPath"):
        open_targets.insert(0, {
            "lane": "Nest writing/research",
            "label": "Nest author desk",
            "path": str(nest_author_desk_pointer.get("htmlPath")),
            "openCommand": f"open {shell_quote(str(nest_author_desk_pointer.get('htmlPath')))}",
        })
    if nest_review_desk_pointer.get("htmlPath"):
        open_targets.insert(0, {
            "lane": "Nest writing/research",
            "label": "Nest writing review desk",
            "path": str(nest_review_desk_pointer.get("htmlPath")),
            "openCommand": f"open {shell_quote(str(nest_review_desk_pointer.get('htmlPath')))}",
        })
    if nest_daily_packet_pointer.get("htmlPath"):
        open_targets.insert(0, {
            "lane": "Nest writing/research",
            "label": "Nest daily writing packet",
            "path": str(nest_daily_packet_pointer.get("htmlPath")),
            "openCommand": f"open {shell_quote(str(nest_daily_packet_pointer.get('htmlPath')))}",
        })
    if studio360_source_desk_pointer.get("htmlPath"):
        open_targets.insert(0, {
            "lane": "360 workflow",
            "label": "Studio360 source desk",
            "path": str(studio360_source_desk_pointer.get("htmlPath")),
            "openCommand": f"open {shell_quote(str(studio360_source_desk_pointer.get('htmlPath')))}",
        })
    if tower_operator_workbench_pointer.get("htmlPath"):
        open_targets.insert(0, {
            "lane": "Tower publishing/social",
            "label": "Tower operator workbench",
            "path": str(tower_operator_workbench_pointer.get("htmlPath")),
            "openCommand": f"open {shell_quote(str(tower_operator_workbench_pointer.get('htmlPath')))}",
        })
    if tower_publication_control_room_pointer.get("htmlPath"):
        open_targets.insert(0, {
            "lane": "Tower publishing/social",
            "label": "Tower publication control room",
            "path": str(tower_publication_control_room_pointer.get("htmlPath")),
            "openCommand": f"open {shell_quote(str(tower_publication_control_room_pointer.get('htmlPath')))}",
        })
    if tower_social_command_pointer.get("htmlPath"):
        open_targets.insert(0, {
            "lane": "Tower publishing/social",
            "label": "Tower social command center",
            "path": str(tower_social_command_pointer.get("htmlPath")),
            "openCommand": f"open {shell_quote(str(tower_social_command_pointer.get('htmlPath')))}",
        })
    if tower_next_publishing_batch_pointer.get("htmlPath"):
        open_targets.insert(0, {
            "lane": "Tower publishing/social",
            "label": "Tower next publishing batch",
            "path": str(tower_next_publishing_batch_pointer.get("htmlPath")),
            "openCommand": f"open {shell_quote(str(tower_next_publishing_batch_pointer.get('htmlPath')))}",
        })
    work_session_launchers = collect_work_session_launchers(tower_publication_control_room_pointer)
    for launcher in reversed(work_session_launchers):
        if launcher.get("path"):
            open_targets.insert(0, {
                "lane": str(launcher.get("lane") or "Quipsly"),
                "label": f"Work session: {launcher.get('label') or 'Open'}",
                "path": str(launcher.get("path") or ""),
                "openCommand": str(launcher.get("command") or ""),
            })
    sprint_companions = collect_sprint_companions(priority_queue)
    production_readiness_matrix = collect_production_readiness_matrix()
    operating_loops = collect_operating_loops(
        photo_control_room_pointer,
        nest_writing_control_room_pointer,
        studio360_proof_control_room_pointer,
        tower_publication_control_room_pointer,
    )
    lane_summaries = summarize_lanes(board, open_targets)
    away_mode = build_away_mode_runway(top_queue, lane_summaries, open_targets)
    return_review_path = build_return_review_path(
        out_dir / "index.html",
        top_queue,
        production_readiness_matrix,
        shorts_review_cockpit_pointer,
        action_deck_pointer,
        human_help_pointer,
    )
    production_conveyor_path = out_dir / "PRODUCTION-CONVEYOR.md"
    production_conveyor = build_production_conveyor(
        out_dir / "index.html",
        current_workspaces,
        return_review_path,
        operating_loops,
        production_readiness_matrix,
        top_queue,
    )
    front_door_actions_by_lane = [
        {
            "lane": str(row.get("lane") or ""),
            "label": str(row.get("label") or ""),
            "status": str(row.get("status") or ""),
            "path": str(row.get("path") or ""),
            "openCommand": str(row.get("openCommand") or ""),
            "description": str(row.get("description") or ""),
            "safety": str(row.get("safety") or ""),
        }
        for row in current_workspaces
        if row.get("lane") and row.get("path")
    ]
    bite_sized_next_actions_by_lane = build_bite_sized_next_actions_by_lane(
        studio_watch_listen_review_room_pointer=studio_watch_listen_review_room_pointer,
        studio_duration_warning_review_pointer=studio_duration_warning_review_pointer,
        nest_daily_packet_pointer=nest_daily_packet_pointer,
        nest_writing_momentum_board_pointer=nest_writing_momentum_board_pointer,
        nest_writing_revision_batch_pointer=nest_writing_revision_batch_pointer,
        photo_proof_desk_pointer=photo_proof_desk_pointer,
        photo_next_cull_batch_pointer=photo_next_cull_batch_pointer,
        photo_first_pass_triage_pointer=photo_first_pass_triage_pointer,
        studio360_source_desk_pointer=studio360_source_desk_pointer,
        tower_social_command_pointer=tower_social_command_pointer,
    )
    boundary = [
        "Local review/readiness only unless Charlie explicitly approves an external action.",
        "No external publishing, uploading, deleting, scheduling, account mutation, or fake receipt capture is implied by this brief.",
        "Sources stay whole; decisions live as metadata, sidecars, manifests, ledgers, packets, and versioned exports.",
        "If one lane stalls, move to another lane and record the blocker precisely.",
    ]
    return {
        "schema": SCHEMA,
        "generatedAt": iso_now(),
        "sourceBoardPointer": str(DEFAULT_POINTER),
        "sourceBoardJson": str(board_path),
        "sourceBoardHtml": pointer.get("htmlPath") or board.get("htmlPath") or "",
        "latestActionDeckHtml": action_deck_pointer.get("htmlPath") or "",
        "latestActionDeckJson": action_deck_pointer.get("jsonPath") or "",
        "latestHumanHelpHtml": human_help_pointer.get("htmlPath") or "",
        "latestHumanHelpJson": human_help_pointer.get("jsonPath") or "",
        "latestBlockerDecisionLedgerHtml": blocker_ledger_pointer.get("htmlPath") or "",
        "latestBlockerDecisionLedgerJson": blocker_ledger_pointer.get("jsonPath") or "",
        "latestPointerContractValidationHtml": pointer_contract_validation_pointer.get("htmlPath") or "",
        "latestPointerContractValidationJson": pointer_contract_validation_pointer.get("jsonPath") or "",
        "latestPointerContractValidationStatus": pointer_contract_validation_pointer.get("status") or "",
        "latestPointerContractValidationCounts": pointer_contract_validation_pointer.get("counts") or {},
        "latestPhotoGroveContactSheetHtml": photo_contact_sheet_pointer.get("htmlPath") or "",
        "latestPhotoGroveContactSheetJson": photo_contact_sheet_pointer.get("jsonPath") or "",
        "latestPhotoGroveControlRoomHtml": photo_control_room_pointer.get("htmlPath") or "",
        "latestPhotoGroveControlRoomJson": photo_control_room_pointer.get("jsonPath") or "",
        "latestPhotoGroveCullRehearsalHtml": photo_cull_rehearsal_pointer.get("htmlPath") or "",
        "latestPhotoGroveCullRehearsalJson": photo_cull_rehearsal_pointer.get("jsonPath") or "",
        "latestPhotoGroveOperatorWorkbenchHtml": photo_operator_workbench_pointer.get("htmlPath") or "",
        "latestPhotoGroveOperatorWorkbenchJson": photo_operator_workbench_pointer.get("jsonPath") or "",
        "latestPhotoGroveOperatorWorkbenchStatus": photo_operator_workbench_pointer.get("status") or "",
        "latestPhotoGroveOperatorWorkbenchCounts": photo_operator_workbench_pointer.get("counts") or {},
        "latestPhotoGroveCullTheaterHtml": photo_cull_theater_pointer.get("htmlPath") or "",
        "latestPhotoGroveCullTheaterJson": photo_cull_theater_pointer.get("jsonPath") or "",
        "latestPhotoGroveCullTheaterStatus": photo_cull_theater_pointer.get("status") or "",
        "latestPhotoGroveCullTheaterCounts": photo_cull_theater_pointer.get("counts") or {},
        "latestPhotoGroveProofDeskHtml": photo_proof_desk_pointer.get("htmlPath") or "",
        "latestPhotoGroveProofDeskJson": photo_proof_desk_pointer.get("jsonPath") or "",
        "latestPhotoGroveProofDeskStatus": photo_proof_desk_pointer.get("status") or "",
        "latestPhotoGroveProofDeskCounts": photo_proof_desk_pointer.get("counts") or {},
        "latestPhotoGroveNextCullBatchHtml": photo_next_cull_batch_pointer.get("htmlPath") or "",
        "latestPhotoGroveNextCullBatchJson": photo_next_cull_batch_pointer.get("jsonPath") or "",
        "latestPhotoGroveNextCullBatchStatus": photo_next_cull_batch_pointer.get("status") or "",
        "latestPhotoGroveNextCullBatchCounts": photo_next_cull_batch_pointer.get("counts") or {},
        "latestPhotoGroveLiveIntakeStatusHtml": photo_live_intake_status_pointer.get("htmlPath") or "",
        "latestPhotoGroveLiveIntakeStatusJson": photo_live_intake_status_pointer.get("jsonPath") or "",
        "latestPhotoGroveLiveIntakeStatusStatus": photo_live_intake_status_pointer.get("status") or "",
        "latestPhotoGroveLiveIntakeStatusCounts": photo_live_intake_status_pointer.get("counts") or {},
        "latestNestWritingControlRoomHtml": nest_writing_control_room_pointer.get("htmlPath") or "",
        "latestNestWritingControlRoomJson": nest_writing_control_room_pointer.get("jsonPath") or "",
        "latestNestAuthorDeskHtml": nest_author_desk_pointer.get("htmlPath") or "",
        "latestNestAuthorDeskJson": nest_author_desk_pointer.get("jsonPath") or "",
        "latestNestAuthorDeskStatus": nest_author_desk_pointer.get("status") or "",
        "latestNestAuthorDeskCounts": nest_author_desk_pointer.get("counts") or {},
        "latestNestReviewDeskHtml": nest_review_desk_pointer.get("htmlPath") or "",
        "latestNestReviewDeskJson": nest_review_desk_pointer.get("jsonPath") or "",
        "latestNestReviewDeskStatus": nest_review_desk_pointer.get("status") or "",
        "latestNestReviewDeskCounts": nest_review_desk_pointer.get("counts") or {},
        "latestNestDailyWritingPacketHtml": nest_daily_packet_pointer.get("htmlPath") or "",
        "latestNestDailyWritingPacketJson": nest_daily_packet_pointer.get("jsonPath") or "",
        "latestNestDailyWritingPacketStatus": nest_daily_packet_pointer.get("status") or "",
        "latestNestDailyWritingPacketCounts": nest_daily_packet_pointer.get("counts") or {},
        "latestDailyWritingReadinessHtml": daily_writing_readiness_pointer.get("htmlPath") or "",
        "latestDailyWritingReadinessJson": daily_writing_readiness_pointer.get("jsonPath") or "",
        "latestDailyWritingReadinessStatus": daily_writing_readiness_pointer.get("status") or "",
        "latestDailyWritingReadinessCounts": daily_writing_readiness_pointer.get("counts") or {},
        "latestWritingPublicationRunwayHtml": nest_writing_publication_runway_pointer.get("htmlPath") or "",
        "latestWritingPublicationRunwayJson": nest_writing_publication_runway_pointer.get("jsonPath") or "",
        "latestWritingPublicationRunwayStatus": nest_writing_publication_runway_pointer.get("status") or "",
        "latestWritingPublicationRunwayCounts": nest_writing_publication_runway_pointer.get("counts") or {},
        "latestNestWritingRevisionBatchHtml": nest_writing_revision_batch_pointer.get("htmlPath") or "",
        "latestNestWritingRevisionBatchJson": nest_writing_revision_batch_pointer.get("jsonPath") or "",
        "latestNestWritingRevisionBatchStatus": nest_writing_revision_batch_pointer.get("status") or "",
        "latestNestWritingRevisionBatchCounts": nest_writing_revision_batch_pointer.get("counts") or {},
        "latestNestWritingMomentumBoardHtml": nest_writing_momentum_board_pointer.get("htmlPath") or "",
        "latestNestWritingMomentumBoardJson": nest_writing_momentum_board_pointer.get("jsonPath") or "",
        "latestNestWritingMomentumBoardStatus": nest_writing_momentum_board_pointer.get("status") or "",
        "latestNestWritingMomentumBoardCounts": nest_writing_momentum_board_pointer.get("counts") or {},
        "latestStudio360SourceDeskHtml": studio360_source_desk_pointer.get("htmlPath") or "",
        "latestStudio360SourceDeskJson": studio360_source_desk_pointer.get("jsonPath") or "",
        "latestStudio360SourceDeskStatus": studio360_source_desk_pointer.get("status") or "",
        "latestStudio360SourceDeskCounts": studio360_source_desk_pointer.get("counts") or {},
        "latestTowerPublicationControlRoomHtml": tower_publication_control_room_pointer.get("htmlPath") or "",
        "latestTowerPublicationControlRoomJson": tower_publication_control_room_pointer.get("jsonPath") or "",
        "latestTowerSocialCommandCenterHtml": tower_social_command_pointer.get("htmlPath") or "",
        "latestTowerSocialCommandCenterJson": tower_social_command_pointer.get("jsonPath") or "",
        "latestTowerSocialCommandCenterStatus": tower_social_command_pointer.get("status") or "",
        "latestTowerSocialCommandCenterCounts": tower_social_command_pointer.get("counts") or {},
        "latestTowerNextPublishingBatchHtml": tower_next_publishing_batch_pointer.get("htmlPath") or "",
        "latestTowerNextPublishingBatchJson": tower_next_publishing_batch_pointer.get("jsonPath") or "",
        "latestTowerNextPublishingBatchStatus": tower_next_publishing_batch_pointer.get("status") or "",
        "latestTowerNextPublishingBatchCounts": tower_next_publishing_batch_pointer.get("counts") or {},
        "latestTowerOperatorWorkbenchHtml": tower_operator_workbench_pointer.get("htmlPath") or "",
        "latestTowerOperatorWorkbenchJson": tower_operator_workbench_pointer.get("jsonPath") or "",
        "latestTowerOperatorWorkbenchStatus": tower_operator_workbench_pointer.get("status") or "",
        "latestTowerOperatorWorkbenchCounts": tower_operator_workbench_pointer.get("counts") or {},
        "latestStudioSyncControlRoomHtml": studio_sync_control_room_pointer.get("htmlPath") or "",
        "latestStudioSyncControlRoomJson": studio_sync_control_room_pointer.get("jsonPath") or "",
        "latestStudioSyncDecisionRehearsalHtml": studio_sync_decision_rehearsal_pointer.get("htmlPath") or "",
        "latestStudioSyncDecisionRehearsalJson": studio_sync_decision_rehearsal_pointer.get("jsonPath") or "",
        "latestStudioSyncDecisionAidHtml": studio_sync_decision_aid_pointer.get("htmlPath") or "",
        "latestStudioSyncDecisionAidJson": studio_sync_decision_aid_pointer.get("jsonPath") or "",
        "latestStudioSyncDecisionAidStatus": studio_sync_decision_aid_pointer.get("status") or "",
        "latestStudioSyncDecisionAidCounts": studio_sync_decision_aid_pointer.get("counts") or {},
        "latestStudioSyncDecisionAidHumanAsk": studio_sync_decision_aid_pointer.get("humanAsk") or "",
        "latestStudioSyncDecisionAidNextSafestAction": studio_sync_decision_aid_pointer.get("nextSafestAction") or "",
        "latestStudioTopReviewCompanionHtml": studio_top_review_companion_pointer.get("htmlPath") or "",
        "latestStudioTopReviewCompanionJson": studio_top_review_companion_pointer.get("jsonPath") or "",
        "latestStudioTopReviewCompanionStatus": studio_top_review_companion_pointer.get("status") or "",
        "latestStudioTopReviewCompanionCounts": studio_top_review_companion_pointer.get("counts") or {},
        "latestStudioPackageQualityDeskHtml": studio_package_quality_desk_pointer.get("htmlPath") or "",
        "latestStudioPackageQualityDeskJson": studio_package_quality_desk_pointer.get("jsonPath") or "",
        "latestStudioPackageQualityDeskStatus": studio_package_quality_desk_pointer.get("status") or "",
        "latestStudioPackageQualityDeskCounts": studio_package_quality_desk_pointer.get("counts") or {},
        "latestStudioPackageBlockerTriageHtml": studio_package_blocker_triage_pointer.get("htmlPath") or "",
        "latestStudioPackageBlockerTriageJson": studio_package_blocker_triage_pointer.get("jsonPath") or "",
        "latestStudioPackageBlockerTriageStatus": studio_package_blocker_triage_pointer.get("status") or "",
        "latestStudioPackageBlockerTriageCounts": studio_package_blocker_triage_pointer.get("counts") or {},
        "latestStudioReviewTheaterHtml": studio_review_theater_pointer.get("htmlPath") or "",
        "latestStudioReviewTheaterJson": studio_review_theater_pointer.get("jsonPath") or "",
        "latestStudioReviewTheaterStatus": studio_review_theater_pointer.get("status") or "",
        "latestStudioReviewTheaterCounts": studio_review_theater_pointer.get("counts") or {},
        "latestStudioNextShortsReviewBatchHtml": studio_next_shorts_review_batch_pointer.get("htmlPath") or "",
        "latestStudioNextShortsReviewBatchJson": studio_next_shorts_review_batch_pointer.get("jsonPath") or "",
        "latestStudioNextShortsReviewBatchStatus": studio_next_shorts_review_batch_pointer.get("status") or "",
        "latestStudioNextShortsReviewBatchCounts": studio_next_shorts_review_batch_pointer.get("counts") or {},
        "latestStudioWatchListenReviewRoomHtml": studio_watch_listen_review_room_pointer.get("htmlPath") or "",
        "latestStudioWatchListenReviewRoomJson": studio_watch_listen_review_room_pointer.get("jsonPath") or "",
        "latestStudioWatchListenReviewRoomStatus": studio_watch_listen_review_room_pointer.get("status") or "",
        "latestStudioWatchListenReviewRoomCounts": studio_watch_listen_review_room_pointer.get("counts") or {},
        "latestStudioDurationWarningReviewHtml": studio_duration_warning_review_pointer.get("htmlPath") or "",
        "latestStudioDurationWarningReviewJson": studio_duration_warning_review_pointer.get("jsonPath") or "",
        "latestStudioDurationWarningReviewStatus": studio_duration_warning_review_pointer.get("status") or "",
        "latestStudioDurationWarningReviewEpisodeCount": studio_duration_warning_review_pointer.get("episodeCount") or 0,
        "latestStudioDurationExperimentMatrixHtml": studio_duration_experiment_matrix_pointer.get("htmlPath") or "",
        "latestStudioDurationExperimentMatrixJson": studio_duration_experiment_matrix_pointer.get("jsonPath") or "",
        "latestStudioDurationExperimentMatrixStatus": studio_duration_experiment_matrix_pointer.get("status") or "",
        "latestStudioDurationExperimentMatrixEpisodes": len(studio_duration_experiment_matrix_pointer.get("episodes") or []),
        "latestStudioDurationVersionWorkordersHtml": studio_duration_version_workorders_pointer.get("htmlPath") or "",
        "latestStudioDurationVersionWorkordersJson": studio_duration_version_workorders_pointer.get("jsonPath") or "",
        "latestStudioDurationVersionWorkordersStatus": studio_duration_version_workorders_pointer.get("status") or "",
        "latestStudioDurationVersionWorkordersCounts": studio_duration_version_workorders_pointer.get("counts") or {},
        "latestStudioDurationEditRecipeSkeletonsHtml": studio_duration_edit_recipe_skeletons_pointer.get("htmlPath") or "",
        "latestStudioDurationEditRecipeSkeletonsJson": studio_duration_edit_recipe_skeletons_pointer.get("jsonPath") or "",
        "latestStudioDurationEditRecipeSkeletonsStatus": studio_duration_edit_recipe_skeletons_pointer.get("status") or "",
        "latestStudioDurationEditRecipeSkeletonsCounts": studio_duration_edit_recipe_skeletons_pointer.get("counts") or {},
        "latestStudioTranscriptSourceWorkordersHtml": studio_transcript_source_workorders_pointer.get("htmlPath") or "",
        "latestStudioTranscriptSourceWorkordersJson": studio_transcript_source_workorders_pointer.get("jsonPath") or "",
        "latestStudioTranscriptSourceWorkordersStatus": studio_transcript_source_workorders_pointer.get("status") or "",
        "latestStudioTranscriptSourceWorkordersCounts": studio_transcript_source_workorders_pointer.get("counts") or {},
        "latestStudioTranscriptExecutionReadinessHtml": studio_transcript_execution_readiness_pointer.get("htmlPath") or "",
        "latestStudioTranscriptExecutionReadinessJson": studio_transcript_execution_readiness_pointer.get("jsonPath") or "",
        "latestStudioTranscriptExecutionReadinessStatus": studio_transcript_execution_readiness_pointer.get("status") or "",
        "latestStudioTranscriptExecutionReadinessCounts": studio_transcript_execution_readiness_pointer.get("counts") or {},
        "latestStudioTranscriptPilotHtml": studio_transcript_pilot_pointer.get("htmlPath") or "",
        "latestStudioTranscriptPilotJson": studio_transcript_pilot_pointer.get("jsonPath") or "",
        "latestStudioTranscriptPilotStatus": studio_transcript_pilot_pointer.get("status") or "",
        "latestStudioTranscriptPilotCounts": studio_transcript_pilot_pointer.get("counts") or {},
        "latestStudioTranscriptReviewWorkbenchHtml": studio_transcript_review_workbench_pointer.get("htmlPath") or "",
        "latestStudioTranscriptReviewWorkbenchJson": studio_transcript_review_workbench_pointer.get("jsonPath") or "",
        "latestStudioTranscriptReviewWorkbenchStatus": studio_transcript_review_workbench_pointer.get("status") or "",
        "latestStudioTranscriptReviewWorkbenchCounts": studio_transcript_review_workbench_pointer.get("counts") or {},
        "latestStudioTranscriptReviewDecisionLedgerHtml": studio_transcript_review_decision_ledger_pointer.get("htmlPath") or "",
        "latestStudioTranscriptReviewDecisionLedgerJson": studio_transcript_review_decision_ledger_pointer.get("jsonPath") or "",
        "latestStudioTranscriptReviewDecisionLedgerStatus": studio_transcript_review_decision_ledger_pointer.get("status") or "",
        "latestStudioTranscriptReviewDecisionLedgerCounts": studio_transcript_review_decision_ledger_pointer.get("counts") or {},
        "latestStudio360ProofControlRoomHtml": studio360_proof_control_room_pointer.get("htmlPath") or "",
        "latestStudio360ProofControlRoomJson": studio360_proof_control_room_pointer.get("jsonPath") or "",
        "latestStudio360OperatorWorkbenchHtml": studio360_operator_workbench_pointer.get("htmlPath") or "",
        "latestStudio360OperatorWorkbenchJson": studio360_operator_workbench_pointer.get("jsonPath") or "",
        "latestStudio360OperatorWorkbenchStatus": studio360_operator_workbench_pointer.get("status") or "",
        "latestStudio360OperatorWorkbenchCounts": studio360_operator_workbench_pointer.get("counts") or {},
        "latestStudio360RepairPreflightHtml": studio360_repair_preflight_pointer.get("htmlPath") or "",
        "latestStudio360RepairPreflightJson": studio360_repair_preflight_pointer.get("jsonPath") or "",
        "latestStudio360RepairPreflightStatus": studio360_repair_preflight_pointer.get("status") or "",
        "latestStudio360RepairPreflightCounts": studio360_repair_preflight_pointer.get("counts") or {},
        "sessionDir": str(out_dir),
        "topQueue": top_queue,
        "firstActionsByLane": first_actions_by_lane,
        "frontDoorActionsByLane": front_door_actions_by_lane,
        "biteSizedNextActionsByLane": bite_sized_next_actions_by_lane,
        "sprintCompanions": sprint_companions,
        "productionWorkSessionLaunchers": work_session_launchers,
        "productionReadinessMatrix": production_readiness_matrix,
        "operatingLoops": operating_loops,
        "currentWorkspaces": current_workspaces,
        "productionConveyor": production_conveyor,
        "productionConveyorPath": str(production_conveyor_path),
        "returnReviewPath": return_review_path,
        "laneSummaries": lane_summaries,
        "openTargets": open_targets,
        "awayModeRunway": away_mode,
        "boundary": boundary,
        "counts": {
            "topQueue": len(top_queue),
            "firstActionsByLane": len(first_actions_by_lane),
            "frontDoorActionsByLane": len(front_door_actions_by_lane),
            "biteSizedNextActionsByLane": len(bite_sized_next_actions_by_lane),
            "lanes": len(lane_summaries),
            "openTargets": len(open_targets),
            "attentionItems": sum(1 for card in priority_queue if card.get("priority") == "attention"),
            "reviewItems": sum(1 for card in priority_queue if card.get("priority") == "review"),
            "humanHelpItems": len(human_help_items),
            "sprintCompanions": len(sprint_companions),
            "productionWorkSessionLaunchers": len(work_session_launchers),
            "productionMatrixRows": len(production_readiness_matrix),
            "operatingLoops": len(operating_loops),
            "currentWorkspaces": len([row for row in current_workspaces if row.get("path")]),
            "productionConveyorRows": len(production_conveyor.get("rows") or []),
            "returnReviewPathSteps": len(return_review_path),
            "blockerDecisionLedgerRows": int((blocker_ledger_pointer.get("counts") or {}).get("rows") or 0) if isinstance(blocker_ledger_pointer.get("counts"), dict) else 0,
            "pointerContractValidationChecks": int((pointer_contract_validation_pointer.get("counts") or {}).get("checks") or 0) if isinstance(pointer_contract_validation_pointer.get("counts"), dict) else 0,
            "pointerContractValidationFailures": int((pointer_contract_validation_pointer.get("counts") or {}).get("failures") or 0) if isinstance(pointer_contract_validation_pointer.get("counts"), dict) else 0,
            "awayModeFirstHourSteps": len(away_mode.get("firstHour") or []),
        },
        "truth": "Return brief only. It reads current OS board evidence and does not mutate sources, approvals, receipts, schedules, uploads, or publications.",
    }


def build_production_conveyor(
    return_html_path: Path,
    current_workspaces: list[dict[str, Any]],
    return_review_path: list[dict[str, Any]],
    operating_loops: list[dict[str, Any]],
    production_readiness_matrix: list[dict[str, Any]],
    top_queue: list[dict[str, Any]],
) -> dict[str, Any]:
    loop_by_lane = {
        str(loop.get("lane") or ""): loop
        for loop in operating_loops
        if isinstance(loop, dict) and loop.get("lane")
    }
    matrix_by_lane = {
        str(row.get("lane") or ""): row
        for row in production_readiness_matrix
        if isinstance(row, dict) and row.get("lane")
    }
    queue_by_lane: dict[str, dict[str, Any]] = {}
    for card in top_queue:
        lane = str(card.get("lane") or "")
        if lane and lane not in queue_by_lane:
            queue_by_lane[lane] = card

    rows: list[dict[str, Any]] = []
    for index, row in enumerate([item for item in current_workspaces if item.get("path")], start=1):
        lane = str(row.get("lane") or "Quipsly")
        matrix = matrix_by_lane.get(lane, {})
        loop = loop_by_lane.get(lane, {})
        queue_card = queue_by_lane.get(lane, {})
        queue_action = first_action_summary(queue_card) if queue_card else {"nextAction": "", "openCommand": "", "safety": ""}
        related_paths = [
            item
            for item in (row.get("relatedPaths") if isinstance(row.get("relatedPaths"), list) else [])
            if isinstance(item, dict) and item.get("path")
        ]
        next_move = (
            str(matrix.get("nextSafestAction") or "")
            or str(loop.get("nextSafestAction") or "")
            or str(queue_action.get("nextAction") or "")
            or str(row.get("description") or "")
            or "Open local evidence and make the next reversible improvement."
        )
        micro_action_by_lane = {
            "Studio podcast/video": "Open the checklist or duration card, watch/listen only the named artifact if needed, then record a local review classification or clearer blocker.",
            "Nest writing/research": "Open one writing or draft-prep card, verify its source trail, then improve or classify exactly one draft packet without replacing canon.",
            "Photo Grove": "Open one cull/proof card, compare the preview evidence, then mark the next reversible cull/proof decision in sidecar truth.",
            "360 workflow": "Open source routing first, then render dry-run cards; inspect one source/proxy/candidate pair and stop before render execution.",
            "Tower publishing/social": "Open one publishing action card or draft calendar row, prepare platform copy/metadata locally, and leave receipt slots empty until real posting proof exists.",
        }
        rows.append({
            "index": index,
            "lane": lane,
            "label": row.get("label") or "Current workspace",
            "status": row.get("status") or matrix.get("status") or "local-evidence-ready",
            "readiness": matrix.get("readiness") or "",
            "nextMove": next_move,
            "operatorMicroAction": micro_action_by_lane.get(lane, "Open local evidence, make one reversible improvement, and keep claims smaller than the artifact truth."),
            "path": row.get("path") or "",
            "openCommand": row.get("openCommand") or queue_action.get("openCommand") or "",
            "relatedPaths": related_paths,
            "firstLoopStep": loop.get("firstStepLabel") or "",
            "firstLoopCommand": loop.get("firstStepCommand") or "",
            "countSummary": matrix.get("countSummary") or "",
            "ifStalls": "Record the blocker precisely, leave existing sidecars intact, then move to the next conveyor row.",
            "safety": row.get("safety") or queue_action.get("safety") or "Local evidence only. No original/source mutation and no external publishing action.",
        })

    return {
        "schema": "quipsly.production-conveyor.v1",
        "purpose": "Turn the OS return brief into a concrete operator board: open one lane, make one reversible local improvement, then move forward without re-solving the entire system.",
        "status": "conveyor-ready" if rows else "no-workspaces-found",
        "firstMove": {
            "label": "Open Quipsly Return Brief",
            "command": f"open {shell_quote(str(return_html_path))}",
            "path": str(return_html_path),
            "safety": "Opens local evidence only. It does not approve, publish, upload, schedule, mutate accounts, or create receipts.",
        },
        "rows": rows,
        "returnReviewPath": return_review_path,
        "operatingRule": "If a lane stalls, make the blocker visible and continue another lane. The conveyor optimizes for durable progress, not heroic single-lane wrestling.",
        "truth": "Production conveyor only. It routes local sidecar work and does not mutate sources, approvals, receipts, schedules, uploads, or publications.",
    }


def first_action_summary(card: dict[str, Any]) -> dict[str, str]:
    first = card.get("firstSafeAction") if isinstance(card.get("firstSafeAction"), dict) else {}
    first_command = str(first.get("command") or "")
    receipt_command = str(card.get("firstReceiptTemplate") or "")
    runway_target = str(
        card.get("runwayHtml")
        or card.get("htmlPath")
        or card.get("runwayJson")
        or card.get("jsonPath")
        or ""
    )
    first_is_open = first_command.strip().startswith("open ")
    receipt_is_open = receipt_command.strip().startswith("open ")
    open_command = (
        str(card.get("firstOpenCommand") or "")
        or str(first.get("firstOpenCommand") or "")
        or str(first.get("openCommand") or "")
        or (first_command if first_is_open else "")
        or (receipt_command if receipt_is_open else "")
        or (f"open {shell_quote(runway_target)}" if runway_target else "")
    )
    decision_command = (
        str(card.get("firstReviewDecisionCommand") or "")
        or str(first.get("firstDecisionCommand") or "")
        or str(first.get("firstReviewCommand") or "")
        or (receipt_command if receipt_command and not receipt_is_open else "")
    )
    first_safe_command = first_command or open_command or decision_command
    next_action = str(card.get("nextSafestAction") or first.get("nextSafestAction") or card.get("explanation") or "")
    safety = str(first.get("safety") or card.get("safety") or "")
    decision_safety = str(
        card.get("decisionSafety")
        or card.get("metadataCommandSafety")
        or card.get("repairDecisionSafety")
        or card.get("receiptCommandSafety")
        or first.get("decisionSafety")
        or ""
    )
    return {
        "nextAction": next_action,
        "openCommand": open_command,
        "decisionCommand": decision_command,
        "firstSafeCommand": first_safe_command,
        "safety": safety,
        "decisionSafety": decision_safety,
    }


def enrich_action_card(card: dict[str, Any]) -> dict[str, Any]:
    first_action = first_action_summary(card)
    enriched = dict(card)
    enriched["nextAction"] = first_action["nextAction"]
    enriched["openCommand"] = first_action["openCommand"]
    enriched["decisionCommand"] = first_action["decisionCommand"]
    enriched["firstSafeCommand"] = first_action["firstSafeCommand"]
    enriched["actionSafety"] = first_action["safety"]
    enriched["decisionSafety"] = first_action["decisionSafety"]
    return enriched


def priority_from_severity(severity: str) -> str:
    if severity in {"blocker", "sync-review", "approval-needed", "human-review", "missing-media", "operator-help"}:
        return "attention"
    if severity == "ready":
        return "ready"
    return "review"


def enrich_help_item(item: dict[str, Any]) -> dict[str, Any]:
    first = item.get("firstSafeAction") if isinstance(item.get("firstSafeAction"), dict) else {}
    primary_path = str(item.get("primaryPath") or first.get("path") or "")
    first_safe_action = {
        "label": str(first.get("label") or f"Open {item.get('title') or 'local evidence'}"),
        "command": str(item.get("primaryCommand") or first.get("command") or (f"open {shell_quote(primary_path)}" if primary_path else "")),
        "path": primary_path,
        "safety": str(first.get("safety") or item.get("safety") or "Opens local evidence only. No external or source mutation."),
    }
    enriched = {
        "id": item.get("id") or "",
        "lane": item.get("lane") or "Unknown",
        "priority": priority_from_severity(str(item.get("severity") or "")),
        "severity": item.get("severity") or "",
        "title": item.get("title") or "",
        "action": item.get("humanAsk") or item.get("title") or "Open next item",
        "status": item.get("status") or "",
        "suggestedOwner": item.get("suggestedOwner") or "",
        "humanAsk": item.get("humanAsk") or "",
        "agentCanContinueWith": item.get("agentCanContinueWith") or "",
        "plainEnglish": item.get("plainEnglish") or "",
        "nextSafestAction": item.get("nextSafestAction") or item.get("nextAction") or "",
        "nextAction": item.get("nextAction") or item.get("nextSafestAction") or "",
        "firstSafeAction": first_safe_action,
        "htmlPath": primary_path,
        "jsonPath": (item.get("source") or {}).get("jsonPath") if isinstance(item.get("source"), dict) else "",
        "markdownPath": (item.get("source") or {}).get("markdownPath") if isinstance(item.get("source"), dict) else "",
        "truth": item.get("truth") or "",
        "safety": item.get("safety") or first_safe_action["safety"],
        "notes": item.get("notes") or [],
        "counts": item.get("counts") or {},
    }
    details = item.get("handoffDetails") if isinstance(item.get("handoffDetails"), list) else []
    if details:
        enriched["handoffDetails"] = details
    return enrich_action_card(enriched)


def render_markdown(payload: dict[str, Any]) -> str:
    away = payload.get("awayModeRunway") if isinstance(payload.get("awayModeRunway"), dict) else {}
    lines = [
        "# Quipsly return brief",
        "",
        f"Generated: `{payload['generatedAt']}`",
        "",
        payload["truth"],
        "",
        f"Human ask: {payload.get('humanAsk') or ''}",
        "",
        f"Codex can keep going: {payload.get('agentSafeParallelWork') or ''}",
        "",
        "## First open",
        "",
        f"- OS board: `{payload.get('sourceBoardHtml') or payload.get('sourceBoardJson')}`",
        "",
        "## Away-mode runway",
        "",
        away.get("purpose") or "Restart production calmly without confusing local readiness with publication truth.",
        "",
        "### First 15 minutes",
        "",
    ]
    for item in away.get("firstFifteenMinutes") or []:
        lines.append(f"- {item}")
    lines.extend(["", "### First hour", ""])
    for item in away.get("firstHour") or []:
        lines.append(f"- {item}")
    lines.extend(["", "### Codex can keep going", ""])
    for item in away.get("codexCanContinue") or []:
        lines.append(f"- {item}")
    lines.extend(["", "### Explicit approval required", ""])
    for item in away.get("explicitApprovalRequired") or []:
        lines.append(f"- {item}")
    if payload.get("firstActionsByLane"):
        lines.extend(["", "## Five front doors", ""])
        lines.append("These are the safest first local openings for each production lane. They do not approve, publish, upload, schedule, mutate accounts, or create receipt truth.")
        lines.append("")
        for index, action in enumerate(payload["firstActionsByLane"], start=1):
            lines.append(f"{index}. **{action.get('lane')} - {action.get('action')}**")
            lines.append(f"   - Status: `{action.get('status') or ''}`")
            lines.append(f"   - Why: {action.get('reason') or action.get('why') or ''}")
            if action.get("openCommand"):
                lines.append(f"   - Open: `{action.get('openCommand')}`")
    if payload.get("biteSizedNextActionsByLane"):
        lines.extend(["", "## Bite-sized next actions", ""])
        lines.append("These are the smallest safe actions currently surfaced by each lane. They are meant for one calm work loop, not sweeping approval or publication.")
        lines.append("")
        for index, action in enumerate(payload["biteSizedNextActionsByLane"], start=1):
            lines.append(f"{index}. **{action.get('lane')} - {action.get('label')}**")
            lines.append(f"   - Status: `{action.get('status') or ''}`")
            lines.append(f"   - Next: {action.get('nextAction') or ''}")
            if action.get("openCommand"):
                lines.append(f"   - Command: `{action.get('openCommand')}`")
            if action.get("firstDryRunCommand"):
                lines.append(f"   - Safe dry-run: `{action.get('firstDryRunCommand')}`")
            if action.get("firstLocalProofCommand"):
                aspect = f" ({action.get('firstLocalProofAspect')})" if action.get("firstLocalProofAspect") else ""
                lines.append(f"   - Local proof command{aspect}: `{action.get('firstLocalProofCommand')}`")
            if action.get("firstLocalProofReviewCommand"):
                aspect = f" ({action.get('firstLocalProofAspect')})" if action.get("firstLocalProofAspect") else ""
                lines.append(f"   - Review existing local proof{aspect}: `{action.get('firstLocalProofReviewCommand')}`")
            if action.get("firstDraftPacketCommand"):
                lines.append(f"   - Draft preview command: `{action.get('firstDraftPacketCommand')}`")
            if action.get("path"):
                lines.append(f"   - Path: `{action.get('path')}`")
            lines.append(f"   - Safety: {action.get('safety') or ''}")
    first_queue_action = away.get("firstQueueAction") if isinstance(away.get("firstQueueAction"), dict) else {}
    if first_queue_action:
        lines.extend([
            "",
            f"First queue action: `{first_queue_action.get('lane')}` - {first_queue_action.get('title')}",
            f"- Open: `{first_queue_action.get('openCommand')}`",
            f"- Safety: {first_queue_action.get('safety')}",
        ])
    lines.extend([
        "",
        "## Safety boundary",
        "",
    ])
    for item in payload["boundary"]:
        lines.append(f"- {item}")
    conveyor = payload.get("productionConveyor") if isinstance(payload.get("productionConveyor"), dict) else {}
    if conveyor:
        lines.extend(["", "## Production conveyor", ""])
        lines.append(conveyor.get("purpose") or "Open one lane, make one reversible local improvement, then move forward.")
        lines.append("")
        if payload.get("productionConveyorPath"):
            lines.append(f"- Conveyor handoff: `{payload.get('productionConveyorPath')}`")
        first_move = conveyor.get("firstMove") if isinstance(conveyor.get("firstMove"), dict) else {}
        if first_move.get("command"):
            lines.append(f"- First move: `{first_move.get('command')}`")
        if conveyor.get("operatingRule"):
            lines.append(f"- Operating rule: {conveyor.get('operatingRule')}")
        lines.append("")
        for row in conveyor.get("rows") or []:
            lines.append(f"{row.get('index')}. **{row.get('lane')} - {row.get('label')}** (`{row.get('status')}`)")
            lines.append(f"   - Next: {row.get('nextMove')}")
            if row.get("countSummary"):
                lines.append(f"   - Counts: {row.get('countSummary')}")
            if row.get("openCommand"):
                lines.append(f"   - Open: `{row.get('openCommand')}`")
            if row.get("path"):
                lines.append(f"   - Path: `{row.get('path')}`")
            if row.get("operatorMicroAction"):
                lines.append(f"   - Micro-action: {row.get('operatorMicroAction')}")
            related = [item for item in row.get("relatedPaths") or [] if isinstance(item, dict) and item.get("path") != row.get("path")]
            if related:
                lines.append("   - Related local surfaces:")
                for item in related:
                    lines.append(f"     - `{item.get('field')}`: `{item.get('path')}`")
            if row.get("firstLoopStep"):
                lines.append(f"   - Loop start: {row.get('firstLoopStep')}")
            if row.get("firstLoopCommand"):
                lines.append(f"   - Loop command: `{row.get('firstLoopCommand')}`")
            lines.append(f"   - If stalls: {row.get('ifStalls')}")
            lines.append(f"   - Safety: {row.get('safety')}")
    if payload.get("returnReviewPath"):
        lines.extend(["", "## Charlie's first calm hour", ""])
        lines.append("Use this sequence when returning to the system. It opens existing evidence only; it does not publish, approve, upload, schedule, mutate accounts, or create receipt truth.")
        lines.append("")
        for step in payload["returnReviewPath"]:
            lines.append(f"{step.get('index')}. **{step.get('lane')} - {step.get('label')}**")
            lines.append(f"   - Why: {step.get('why')}")
            if step.get("proof"):
                lines.append(f"   - Proof: {step.get('proof')}")
            if step.get("openCommand"):
                lines.append(f"   - Open: `{step.get('openCommand')}`")
            if step.get("path"):
                lines.append(f"   - Path: `{step.get('path')}`")
            lines.append(f"   - Safety: {step.get('safety')}")
    if payload.get("currentWorkspaces"):
        lines.extend(["", "## Current workspaces", ""])
        lines.append("These are the concrete sidecar/workbench surfaces created for doing useful local work without mutating source truth.")
        lines.append("")
        for row in payload["currentWorkspaces"]:
            lines.append(f"### {row.get('lane')} - {row.get('label')}")
            lines.append("")
            lines.append(f"- Status: `{row.get('status')}`")
            lines.append(f"- Description: {row.get('description')}")
            if row.get("openCommand"):
                lines.append(f"- Open: `{row.get('openCommand')}`")
            if row.get("path"):
                lines.append(f"- Path: `{row.get('path')}`")
            related = [item for item in row.get("relatedPaths") or [] if isinstance(item, dict) and item.get("path") != row.get("path")]
            if related:
                lines.append("- Related local surfaces:")
                for item in related:
                    lines.append(f"  - `{item.get('field')}`: `{item.get('path')}`")
            lines.append(f"- Safety: {row.get('safety')}")
            lines.append("")
    if payload.get("sprintCompanions"):
        lines.extend(["", "## Cross-lane sprint companions", ""])
        for card in payload["sprintCompanions"]:
            title = card.get("title") or card.get("action") or card.get("id") or "Sprint companion"
            first_action = first_action_summary(card)
            lines.append(f"- {card.get('lane')} - {title} (`{card.get('status') or ''}`)")
            if first_action["openCommand"]:
                lines.append(f"  - Open: `{first_action['openCommand']}`")
            if first_action["nextAction"]:
                lines.append(f"  - Next: {first_action['nextAction']}")
            if first_action["safety"]:
                lines.append(f"  - Safety: {first_action['safety']}")
    if payload.get("productionWorkSessionLaunchers"):
        lines.extend(["", "## Production work-session launchers", ""])
        for launcher in payload["productionWorkSessionLaunchers"]:
            lines.append(f"### {launcher.get('lane')} - {launcher.get('label')}")
            lines.append("")
            lines.append(f"- Status: `{launcher.get('status')}`")
            lines.append(f"- What it does: {launcher.get('whatItDoes')}")
            lines.append(f"- First human question: {launcher.get('firstHumanQuestion')}")
            lines.append(f"- Agent-safe work: {launcher.get('agentSafeWork')}")
            if launcher.get("command"):
                lines.append(f"- Open: `{launcher.get('command')}`")
            if launcher.get("path"):
                lines.append(f"- Path: `{launcher.get('path')}`")
            lines.append(f"- Truth: {launcher.get('truth')}")
            claims = launcher.get("explicitNonClaims") if isinstance(launcher.get("explicitNonClaims"), list) else []
            if claims:
                lines.append("- Explicit non-claims:")
                for claim in claims:
                    lines.append(f"  - {claim}")
            lines.append("")
    if payload.get("productionReadinessMatrix"):
        lines.extend(["", "## Production readiness matrix", ""])
        for row in payload["productionReadinessMatrix"]:
            lines.append(f"### {row.get('lane')} - `{row.get('readiness')}`")
            lines.append("")
            lines.append(f"- Status: `{row.get('status')}`")
            lines.append(f"- Counts: {row.get('countSummary')}")
            lines.append(f"- Gate: {row.get('gateSummary')}")
            lines.append(f"- Next: {row.get('nextSafestAction')}")
            if row.get("openCommand"):
                lines.append(f"- Open: `{row.get('openCommand')}`")
            if row.get("worksheetPath"):
                lines.append(f"- Worksheet: `{row.get('worksheetPath')}`")
            lines.append("")
    if payload.get("operatingLoops"):
        lines.extend(["", "## Operating loops", ""])
        for loop in payload["operatingLoops"]:
            lines.append(f"### {loop.get('lane')} - {loop.get('label')}")
            lines.append("")
            lines.append(f"- Status: `{loop.get('status')}`")
            lines.append(f"- Steps: {loop.get('stepCount')}")
            lines.append(f"- First step: {loop.get('firstStepLabel')}")
            if loop.get("firstStepCommand"):
                lines.append(f"- First command: `{loop.get('firstStepCommand')}`")
            if loop.get("nextSafestAction"):
                lines.append(f"- Next: {loop.get('nextSafestAction')}")
            if loop.get("humanAsk"):
                lines.append(f"- Human ask: {loop.get('humanAsk')}")
            if loop.get("truth"):
                lines.append(f"- Truth: {loop.get('truth')}")
            lines.append("")
            for step in loop.get("steps") or []:
                lines.append(f"{step.get('index')}. {step.get('label')}")
                if step.get("description"):
                    lines.append(f"   - {step.get('description')}")
                if step.get("command"):
                    lines.append(f"   - Command: `{step.get('command')}`")
                if step.get("safety"):
                    lines.append(f"   - Safety: {step.get('safety')}")
            lines.append("")
    lines.extend(["", "## Top queue", ""])
    for i, card in enumerate(payload["topQueue"], 1):
        title = card.get("title") or card.get("action") or "Open next item"
        owner = f" - Owner: `{card.get('suggestedOwner')}`" if card.get("suggestedOwner") else ""
        lines.append(f"{i}. [{card.get('priority')}] {card.get('lane')} - {title} (`{card.get('status') or card.get('reframeStatus') or ''}`){owner}")
        if card.get("humanAsk") and card.get("humanAsk") != title:
            lines.append(f"   - Human ask: {card.get('humanAsk')}")
        if card.get("agentCanContinueWith"):
            lines.append(f"   - Codex can keep going: {card.get('agentCanContinueWith')}")
        details = card.get("handoffDetails") if isinstance(card.get("handoffDetails"), list) else []
        for detail in details[:6]:
            lines.append(f"   - Detail: {detail}")
        first_action = first_action_summary(card)
        explanation = first_action["nextAction"]
        if explanation:
            lines.append(f"   - {explanation}")
        if first_action["openCommand"]:
            lines.append(f"   - Open evidence: `{first_action['openCommand']}`")
        if first_action["firstSafeCommand"]:
            lines.append(f"   - First safe command: `{first_action['firstSafeCommand']}`")
        if first_action["decisionCommand"] and first_action["decisionCommand"] != first_action["firstSafeCommand"]:
            lines.append(f"   - Decision command: `{first_action['decisionCommand']}`")
            if first_action["decisionSafety"]:
                lines.append(f"   - Decision safety: {first_action['decisionSafety']}")
        if first_action["safety"]:
            lines.append(f"   - Safety: {first_action['safety']}")
    lines.extend(["", "## Useful things to open", ""])
    for target in payload["openTargets"][:24]:
        lines.append(f"- {target['lane']} - {target['label']}: `{target['path']}`")
    lines.extend(["", "## Lane summaries", ""])
    for lane in payload["laneSummaries"]:
        lines.append(f"### {lane['lane']} - `{lane['status']}`")
        lines.append("")
        lines.append(lane.get("nextSafestAction") or "No next action recorded.")
        lines.append("")
        for target in lane.get("openTargets") or []:
            lines.append(f"- Open {target['label']}: `{target['path']}`")
        if lane.get("openTargets"):
            lines.append("")
    return "\n".join(lines).rstrip() + "\n"


def write_production_conveyor_markdown(path: Path, payload: dict[str, Any]) -> None:
    conveyor = payload.get("productionConveyor") if isinstance(payload.get("productionConveyor"), dict) else {}
    lines = [
        "# Quipsly production conveyor",
        "",
        f"Generated: `{payload['generatedAt']}`",
        "",
        conveyor.get("purpose") or "Open one lane, make one reversible local improvement, then move forward.",
        "",
        conveyor.get("truth") or payload.get("truth") or "Local evidence only.",
        "",
        "## How to use this",
        "",
        "1. Open the first row that is not blocked.",
        "2. Make the next reversible local improvement.",
        "3. If the lane stalls, record the blocker and continue the next row.",
        "4. Do not publish, upload, schedule, delete, mutate accounts, overwrite versions, or capture receipt truth without explicit approval.",
        "",
    ]
    first_move = conveyor.get("firstMove") if isinstance(conveyor.get("firstMove"), dict) else {}
    if first_move:
        lines.extend([
            "## First move",
            "",
            f"- Label: {first_move.get('label')}",
            f"- Open: `{first_move.get('command') or ''}`",
            f"- Path: `{first_move.get('path') or ''}`",
            f"- Safety: {first_move.get('safety') or ''}",
            "",
        ])
    lines.extend(["## Conveyor rows", ""])
    for row in conveyor.get("rows") or []:
        lines.append(f"### {row.get('index')}. {row.get('lane')} - {row.get('label')}")
        lines.append("")
        lines.append(f"- Status: `{row.get('status')}`")
        if row.get("readiness"):
            lines.append(f"- Readiness: `{row.get('readiness')}`")
        lines.append(f"- Next move: {row.get('nextMove')}")
        if row.get("operatorMicroAction"):
            lines.append(f"- Micro-action: {row.get('operatorMicroAction')}")
        if row.get("countSummary"):
            lines.append(f"- Counts: {row.get('countSummary')}")
        if row.get("openCommand"):
            lines.append(f"- Open: `{row.get('openCommand')}`")
        if row.get("path"):
            lines.append(f"- Path: `{row.get('path')}`")
        related = [item for item in row.get("relatedPaths") or [] if isinstance(item, dict) and item.get("path") != row.get("path")]
        if related:
            lines.append("- Related local surfaces:")
            for item in related:
                lines.append(f"  - `{item.get('field')}`: `{item.get('path')}`")
        if row.get("firstLoopStep"):
            lines.append(f"- Loop start: {row.get('firstLoopStep')}")
        if row.get("firstLoopCommand"):
            lines.append(f"- Loop command: `{row.get('firstLoopCommand')}`")
        lines.append(f"- If stalls: {row.get('ifStalls')}")
        lines.append(f"- Safety: {row.get('safety')}")
        lines.append("")
    if conveyor.get("operatingRule"):
        lines.extend(["## Operating rule", "", conveyor["operatingRule"], ""])
    path.write_text("\n".join(lines).rstrip() + "\n", encoding="utf-8")


def render_html(payload: dict[str, Any]) -> str:
    away = payload.get("awayModeRunway") if isinstance(payload.get("awayModeRunway"), dict) else {}
    first_15 = "".join(f"<li>{html.escape(str(item))}</li>" for item in away.get("firstFifteenMinutes") or [])
    first_hour = "".join(f"<li>{html.escape(str(item))}</li>" for item in away.get("firstHour") or [])
    codex_can = "".join(f"<li>{html.escape(str(item))}</li>" for item in away.get("codexCanContinue") or [])
    approval_required = "".join(f"<li>{html.escape(str(item))}</li>" for item in away.get("explicitApprovalRequired") or [])
    first_queue_action = away.get("firstQueueAction") if isinstance(away.get("firstQueueAction"), dict) else {}
    front_door_cards = []
    for action in payload.get("firstActionsByLane") or []:
        front_door_cards.append(f"""
        <article class="companion-card ready">
          <p class="eyebrow">{html.escape(str(action.get('lane') or 'Quipsly'))}</p>
          <h2>{html.escape(str(action.get('action') or 'Open first safe action'))}</h2>
          <p class="status">{html.escape(str(action.get('status') or ''))}</p>
          <p>{html.escape(str(action.get('reason') or action.get('why') or 'Safest visible first action.'))}</p>
          {f'<p><b>Open</b><br><code>{html.escape(str(action.get("openCommand") or ""))}</code></p>' if action.get("openCommand") else ''}
        </article>
        """)
    bite_action_cards = []
    for action in payload.get("biteSizedNextActionsByLane") or []:
        bite_action_cards.append(f"""
        <article class="companion-card ready">
          <p class="eyebrow">{html.escape(str(action.get('lane') or 'Quipsly'))}</p>
          <h2>{html.escape(str(action.get('label') or 'Next safe action'))}</h2>
          <p class="status">{html.escape(str(action.get('status') or ''))}</p>
          <p>{html.escape(str(action.get('nextAction') or 'Open local evidence and make one reversible improvement.'))}</p>
          {f'<p><b>Command</b><br><code>{html.escape(str(action.get("openCommand") or ""))}</code></p>' if action.get("openCommand") else ''}
          {f'<p><b>Safe dry-run</b><br><code>{html.escape(str(action.get("firstDryRunCommand") or ""))}</code></p>' if action.get("firstDryRunCommand") else ''}
          {f'<p><b>Local proof command</b><br><code>{html.escape(str(action.get("firstLocalProofCommand") or ""))}</code></p>' if action.get("firstLocalProofCommand") else ''}
          {f'<p><b>Review existing local proof</b><br><code>{html.escape(str(action.get("firstLocalProofReviewCommand") or ""))}</code></p>' if action.get("firstLocalProofReviewCommand") else ''}
          {f'<p><b>Draft preview command</b><br><code>{html.escape(str(action.get("firstDraftPacketCommand") or ""))}</code></p>' if action.get("firstDraftPacketCommand") else ''}
          <p class="safety">{html.escape(str(action.get('safety') or 'Local evidence only.'))}</p>
        </article>
        """)
    workspace_cards = []
    for row in payload.get("currentWorkspaces") or []:
        related_items = [
            item for item in row.get("relatedPaths") or []
            if isinstance(item, dict) and item.get("path") and item.get("path") != row.get("path")
        ]
        related_html = "".join(
            f"<li><b>{html.escape(str(item.get('field') or 'related'))}</b><br><code>{html.escape(str(item.get('openCommand') or ''))}</code></li>"
            for item in related_items[:5]
        )
        workspace_cards.append(f"""
        <article class="workspace-card">
          <p class="eyebrow">{html.escape(str(row.get('lane') or 'Quipsly'))}</p>
          <h2>{html.escape(str(row.get('label') or 'Current workspace'))}</h2>
          <p class="status">{html.escape(str(row.get('status') or ''))}</p>
          <p>{html.escape(str(row.get('description') or ''))}</p>
          {f'<p><b>Open</b><br><code>{html.escape(str(row.get("openCommand") or ""))}</code></p>' if row.get("openCommand") else ''}
          {f'<details><summary>Related local surfaces</summary><ul>{related_html}</ul></details>' if related_html else ''}
          <p class="safety">{html.escape(str(row.get('safety') or ''))}</p>
        </article>
        """)
    conveyor = payload.get("productionConveyor") if isinstance(payload.get("productionConveyor"), dict) else {}
    conveyor_cards = []
    for row in conveyor.get("rows") or []:
        conveyor_cards.append(f"""
        <article class="conveyor-card">
          <div class="number">{html.escape(str(row.get('index') or ''))}</div>
          <div>
            <p class="eyebrow">{html.escape(str(row.get('lane') or 'Quipsly'))}</p>
            <h2>{html.escape(str(row.get('label') or 'Current workspace'))}</h2>
            <p class="status">{html.escape(str(row.get('status') or ''))}</p>
            <p>{html.escape(str(row.get('nextMove') or 'Open local evidence and make one reversible improvement.'))}</p>
            {f'<p><b>Micro-action</b> {html.escape(str(row.get("operatorMicroAction") or ""))}</p>' if row.get("operatorMicroAction") else ''}
            {f'<p><b>Counts</b> {html.escape(str(row.get("countSummary") or ""))}</p>' if row.get("countSummary") else ''}
            {f'<p><b>Open</b><br><code>{html.escape(str(row.get("openCommand") or ""))}</code></p>' if row.get("openCommand") else ''}
            {f'<details><summary>Related local surfaces</summary><ul>{"".join(f"<li><code>{html.escape(str(item.get("field") or ""))}</code>: <code>{html.escape(str(item.get("path") or ""))}</code></li>" for item in (row.get("relatedPaths") if isinstance(row.get("relatedPaths"), list) else []) if isinstance(item, dict) and item.get("path") and item.get("path") != row.get("path"))}</ul></details>' if row.get("relatedPaths") else ''}
            <p><b>If stalls</b> {html.escape(str(row.get('ifStalls') or 'Record the blocker and move to another lane.'))}</p>
            <p class="safety">{html.escape(str(row.get('safety') or 'Local evidence only.'))}</p>
          </div>
        </article>
        """)
    return_path_cards = []
    for step in payload.get("returnReviewPath") or []:
        return_path_cards.append(f"""
        <article class="return-step">
          <div class="number">{html.escape(str(step.get('index') or ''))}</div>
          <div>
            <p class="eyebrow">{html.escape(str(step.get('lane') or 'Quipsly'))}</p>
            <h2>{html.escape(str(step.get('label') or 'Open local evidence'))}</h2>
            <p>{html.escape(str(step.get('why') or ''))}</p>
            {f'<p><b>Proof</b> {html.escape(str(step.get("proof") or ""))}</p>' if step.get("proof") else ''}
            {f'<p><b>Open</b><br><code>{html.escape(str(step.get("openCommand") or ""))}</code></p>' if step.get("openCommand") else ''}
            <p class="safety">{html.escape(str(step.get('safety') or ''))}</p>
          </div>
        </article>
        """)
    companion_cards = []
    for card in payload.get("sprintCompanions") or []:
        title = str(card.get("title") or card.get("action") or card.get("id") or "Sprint companion")
        first_action = first_action_summary(card)
        companion_cards.append(f"""
        <article class="companion-card {html.escape(str(card.get('priority') or ''))}">
          <p class="eyebrow">{html.escape(str(card.get('lane') or ''))}</p>
          <h2>{html.escape(title)}</h2>
          <p class="status">{html.escape(str(card.get('status') or ''))}</p>
          <p>{html.escape(first_action['nextAction'])}</p>
          {f'<p><b>Open</b><br><code>{html.escape(first_action["openCommand"])}</code></p>' if first_action["openCommand"] else ''}
          {f'<p class="safety">{html.escape(first_action["safety"])}</p>' if first_action["safety"] else ''}
        </article>
        """)
    launcher_cards = []
    for launcher in payload.get("productionWorkSessionLaunchers") or []:
        claims = "".join(f"<li>{html.escape(str(claim))}</li>" for claim in (launcher.get("explicitNonClaims") or []))
        launcher_cards.append(f"""
        <article class="launcher-card">
          <p class="eyebrow">{html.escape(str(launcher.get('lane') or 'Quipsly'))}</p>
          <h2>{html.escape(str(launcher.get('label') or 'Open work session'))}</h2>
          <p class="status">{html.escape(str(launcher.get('status') or ''))}</p>
          <p>{html.escape(str(launcher.get('whatItDoes') or ''))}</p>
          <p><b>First question</b> {html.escape(str(launcher.get('firstHumanQuestion') or ''))}</p>
          <p><b>Agent-safe</b> {html.escape(str(launcher.get('agentSafeWork') or ''))}</p>
          {f'<p><b>Open</b><br><code>{html.escape(str(launcher.get("command") or ""))}</code></p>' if launcher.get("command") else ''}
          {f'<details><summary>Explicit non-claims</summary><ul>{claims}</ul></details>' if claims else ''}
          <p class="safety">{html.escape(str(launcher.get('truth') or ''))}</p>
        </article>
        """)
    matrix_cards = []
    for row in payload.get("productionReadinessMatrix") or []:
        matrix_cards.append(f"""
        <article class="matrix-card {html.escape(str(row.get('readiness') or ''))}">
          <p class="eyebrow">{html.escape(str(row.get('lane') or ''))}</p>
          <h2>{html.escape(str(row.get('readiness') or 'unknown'))}</h2>
          <p class="status">{html.escape(str(row.get('status') or ''))}</p>
          <p>{html.escape(str(row.get('countSummary') or ''))}</p>
          <p><b>Gate</b> {html.escape(str(row.get('gateSummary') or ''))}</p>
          <p><b>Next</b> {html.escape(str(row.get('nextSafestAction') or ''))}</p>
          {f'<p><b>Open</b><br><code>{html.escape(str(row.get("openCommand") or ""))}</code></p>' if row.get("openCommand") else ''}
          <p class="safety">{html.escape(str(row.get('truth') or ''))}</p>
        </article>
        """)
    loop_cards = []
    for loop in payload.get("operatingLoops") or []:
        step_rows = []
        for step in loop.get("steps") or []:
            description_html = f"<br><span>{html.escape(str(step.get('description') or ''))}</span>" if step.get("description") else ""
            command_html = f"<br><code>{html.escape(str(step.get('command') or ''))}</code>" if step.get("command") else ""
            step_rows.append(
                f"<li><b>{html.escape(str(step.get('index') or ''))}. {html.escape(str(step.get('label') or ''))}</b>"
                f"{description_html}{command_html}</li>"
            )
        steps = "".join(step_rows)
        loop_cards.append(f"""
        <article class="loop-card">
          <p class="eyebrow">{html.escape(str(loop.get('lane') or ''))}</p>
          <h2>{html.escape(str(loop.get('label') or 'Operating loop'))}</h2>
          <p class="status">{html.escape(str(loop.get('status') or ''))} · {html.escape(str(loop.get('stepCount') or 0))} step(s)</p>
          <p><b>First</b> {html.escape(str(loop.get('firstStepLabel') or ''))}</p>
          {f'<p><b>First command</b><br><code>{html.escape(str(loop.get("firstStepCommand") or ""))}</code></p>' if loop.get("firstStepCommand") else ''}
          <p><b>Next</b> {html.escape(str(loop.get('nextSafestAction') or ''))}</p>
          <details open><summary>Loop steps</summary><ol>{steps}</ol></details>
          <p class="safety">{html.escape(str(loop.get('truth') or ''))}</p>
        </article>
        """)
    top_cards = []
    for index, card in enumerate(payload["topQueue"], 1):
        priority = str(card.get("priority") or "")
        status = str(card.get("status") or card.get("reframeStatus") or "")
        title = str(card.get("title") or card.get("action") or "Open next item")
        first_action = first_action_summary(card)
        command_bits = []
        if first_action["openCommand"]:
            command_bits.append(f"<p><b>Open evidence</b><br><code>{html.escape(first_action['openCommand'])}</code></p>")
        if first_action["firstSafeCommand"]:
            command_bits.append(f"<p><b>First safe command</b><br><code>{html.escape(first_action['firstSafeCommand'])}</code></p>")
        if first_action["decisionCommand"] and first_action["decisionCommand"] != first_action["firstSafeCommand"]:
            command_bits.append(f"<p><b>Decision command</b><br><code>{html.escape(first_action['decisionCommand'])}</code></p>")
            if first_action["decisionSafety"]:
                command_bits.append(f"<p><b>Decision safety</b><br>{html.escape(first_action['decisionSafety'])}</p>")
        if first_action["safety"]:
            command_bits.append(f"<p class=\"safety\">{html.escape(first_action['safety'])}</p>")
        details = card.get("handoffDetails") if isinstance(card.get("handoffDetails"), list) else []
        detail_html = ""
        if details:
            detail_html = "<details open><summary>Specific handoff details</summary><ul>" + "".join(
                f"<li>{html.escape(str(detail))}</li>" for detail in details[:6]
            ) + "</ul></details>"
        top_cards.append(f"""
        <article class="queue {html.escape(priority)}">
          <div class="number">{index}</div>
          <div>
            <p class="eyebrow">{html.escape(priority)} · {html.escape(str(card.get('lane') or ''))}</p>
            <h2>{html.escape(title)}</h2>
            <p class="status">{html.escape(status)}</p>
            {f'<p><b>Owner</b> {html.escape(str(card.get("suggestedOwner") or ""))}</p>' if card.get("suggestedOwner") else ''}
            {f'<p><b>Human ask</b> {html.escape(str(card.get("humanAsk") or ""))}</p>' if card.get("humanAsk") else ''}
            {f'<p><b>Codex can keep going</b> {html.escape(str(card.get("agentCanContinueWith") or ""))}</p>' if card.get("agentCanContinueWith") else ''}
            <p>{html.escape(first_action['nextAction'])}</p>
            {detail_html}
            {''.join(command_bits)}
          </div>
        </article>
        """)
    lane_cards = []
    for lane in payload["laneSummaries"]:
        mini = "".join(f"<li>{html.escape(str(card.get('action') or card.get('id') or 'action'))}</li>" for card in lane.get("topCards") or [])
        targets = "".join(
            f"<li><b>{html.escape(str(target.get('label') or 'Open'))}</b><br><code>{html.escape(str(target.get('path') or ''))}</code></li>"
            for target in lane.get("openTargets") or []
        )
        lane_cards.append(f"""
        <section class="lane">
          <p class="eyebrow">{html.escape(str(lane['status']))}</p>
          <h2>{html.escape(str(lane['lane']))}</h2>
          <p>{html.escape(str(lane.get('nextSafestAction') or ''))}</p>
          <p class="status">{html.escape(str(lane.get('openTargetCount') or 0))} open targets</p>
          <ul>{mini}</ul>
          <details><summary>Open lane artifacts</summary><ul>{targets}</ul></details>
        </section>
        """)
    target_rows = []
    for target in payload["openTargets"][:32]:
        target_rows.append(f"<tr><td>{html.escape(target['lane'])}</td><td>{html.escape(target['label'])}</td><td><code>{html.escape(target['path'])}</code></td></tr>")
    boundary = "".join(f"<li>{html.escape(item)}</li>" for item in payload["boundary"])
    return f"""<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Quipsly Return Brief</title>
<style>
  :root {{ color-scheme:dark; --bg:#10150f; --panel:#1c2419; --panel2:#222c1d; --ink:#f6efd9; --muted:#b9ad8d; --gold:#ecc84d; --leaf:#6bd37f; --water:#79ccd6; --clay:#cf7456; --line:#3b4930; }}
  * {{ box-sizing:border-box; }}
  body {{ margin:0; color:var(--ink); font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif; background:radial-gradient(circle at 10% 0%,rgba(107,211,127,.18),transparent 32%),radial-gradient(circle at 90% 10%,rgba(121,204,214,.14),transparent 28%),var(--bg); }}
  main {{ max-width:1240px; margin:0 auto; padding:36px 26px 70px; }}
  header {{ border:1px solid var(--line); border-radius:30px; padding:30px; background:linear-gradient(135deg,rgba(28,36,25,.96),rgba(34,44,29,.86)); box-shadow:0 24px 80px rgba(0,0,0,.32); }}
  .eyebrow {{ color:var(--gold); letter-spacing:.2em; text-transform:uppercase; font-size:12px; font-weight:900; margin:0 0 8px; }}
  h1 {{ font-size:clamp(40px,7vw,82px); line-height:.9; margin:0 0 14px; }}
  h2 {{ margin:0 0 8px; }}
  p, li, td {{ color:var(--muted); line-height:1.45; }}
  code {{ color:#ffe89a; overflow-wrap:anywhere; }}
  .grid {{ display:grid; grid-template-columns:1.05fr .95fr; gap:18px; margin-top:20px; }}
  .runway {{ display:grid; grid-template-columns:repeat(4,minmax(0,1fr)); gap:12px; margin-top:20px; }}
  .runway-card {{ border:1px solid var(--line); background:rgba(28,36,25,.9); border-radius:22px; padding:16px; }}
  .runway-card h2 {{ font-size:18px; }}
  .companions {{ display:grid; grid-template-columns:repeat(auto-fit,minmax(240px,1fr)); gap:12px; margin-top:20px; }}
  .companion-card {{ border:1px solid rgba(236,200,77,.45); background:linear-gradient(135deg,rgba(44,54,30,.92),rgba(28,36,25,.92)); border-radius:22px; padding:16px; }}
  .workspace-card {{ border:1px solid rgba(107,211,127,.55); background:linear-gradient(135deg,rgba(22,52,34,.94),rgba(28,36,25,.92)); border-radius:22px; padding:16px; }}
  .conveyor-card {{ display:grid; grid-template-columns:44px 1fr; gap:14px; border:1px solid rgba(236,200,77,.58); background:linear-gradient(135deg,rgba(45,42,24,.95),rgba(22,35,28,.94)); border-radius:22px; padding:16px; }}
  .launcher-card {{ border:1px solid rgba(121,204,214,.55); background:linear-gradient(135deg,rgba(18,38,36,.96),rgba(28,36,25,.92)); border-radius:22px; padding:16px; }}
  .matrix {{ display:grid; grid-template-columns:repeat(auto-fit,minmax(260px,1fr)); gap:12px; margin-top:20px; }}
  .matrix-card {{ border:1px solid var(--line); background:linear-gradient(135deg,rgba(27,39,30,.95),rgba(20,29,22,.94)); border-radius:22px; padding:16px; }}
  .matrix-card.review-needed,.matrix-card.blocked-by-studio-review,.matrix-card.proof-review-needed,.matrix-card.culling-needed {{ border-color:rgba(236,200,77,.6); }}
  .matrix-card.approval-needed {{ border-color:rgba(207,116,86,.75); }}
  .matrix-card.drafting-ready,.matrix-card.proof-prep-ready,.matrix-card.render-plan-ready {{ border-color:rgba(107,211,127,.65); }}
	  .loops {{ display:grid; grid-template-columns:repeat(auto-fit,minmax(270px,1fr)); gap:12px; margin-top:20px; }}
	  .loop-card {{ border:1px solid rgba(121,204,214,.45); background:linear-gradient(135deg,rgba(18,38,36,.94),rgba(28,36,25,.94)); border-radius:22px; padding:16px; }}
	  .loop-card ol {{ padding-left:1.2rem; }}
	  .loop-card li {{ margin:.55rem 0; }}
	  .loop-card span {{ color:var(--muted); }}
	  .return-path {{ display:grid; grid-template-columns:repeat(auto-fit,minmax(290px,1fr)); gap:12px; margin-top:20px; }}
	  .return-step {{ display:grid; grid-template-columns:44px 1fr; gap:14px; border:1px solid rgba(236,200,77,.48); background:linear-gradient(135deg,rgba(46,43,23,.94),rgba(22,35,28,.94)); border-radius:22px; padding:16px; }}
	  .queue, .lane, .panel {{ border:1px solid var(--line); background:rgba(28,36,25,.92); border-radius:24px; padding:18px; }}
  .queue {{ display:grid; grid-template-columns:44px 1fr; gap:14px; margin-bottom:12px; }}
  .queue.attention {{ border-color:rgba(207,116,86,.75); }}
  .queue.review {{ border-color:rgba(236,200,77,.5); }}
  .queue.ready {{ border-color:rgba(107,211,127,.5); }}
  .number {{ width:38px; height:38px; display:grid; place-items:center; border-radius:50%; background:#2f3c29; color:var(--ink); font-weight:900; }}
  .status {{ color:#dce9c8; margin:.15rem 0; }}
  .safety {{ color:var(--leaf); font-size:13px; }}
  .lanes {{ display:grid; grid-template-columns:repeat(auto-fit,minmax(260px,1fr)); gap:14px; margin-top:20px; }}
  table {{ width:100%; border-collapse:collapse; margin-top:12px; }}
  td, th {{ padding:10px; border-bottom:1px solid var(--line); text-align:left; vertical-align:top; }}
  th {{ color:var(--leaf); text-transform:uppercase; letter-spacing:.12em; font-size:12px; }}
  @media (max-width:1100px) {{ .runway {{ grid-template-columns:repeat(2,minmax(0,1fr)); }} }}
  @media (max-width:960px) {{ .grid {{ grid-template-columns:1fr; }} }}
  @media (max-width:700px) {{ .runway {{ grid-template-columns:1fr; }} }}
</style>
</head>
<body><main>
<header>
  <p class="eyebrow">Quipsly OS · return brief</p>
  <h1>Start here, then touch only what is safe.</h1>
  <p>Generated {html.escape(payload['generatedAt'])}. This brief is a calm re-entry layer over the live OS board. It does not approve, publish, upload, delete, schedule, or mutate anything.</p>
  <p><b>Human ask:</b> {html.escape(str(payload.get('humanAsk') or ''))}</p>
  <p><b>Codex can keep going:</b> {html.escape(str(payload.get('agentSafeParallelWork') or ''))}</p>
  <p><b>OS board:</b> <code>{html.escape(str(payload.get('sourceBoardHtml') or payload.get('sourceBoardJson') or ''))}</code></p>
  <p><b>First queue action:</b> {html.escape(str(first_queue_action.get('lane') or ''))} · {html.escape(str(first_queue_action.get('title') or ''))}</p>
  <p><code>{html.escape(str(first_queue_action.get('openCommand') or ''))}</code></p>
</header>
    <section class="panel" style="margin-top:20px">
      <p class="eyebrow">Five front doors</p>
      <h2>Open one lane without re-solving the whole system</h2>
      <p>These are local evidence doors only. They reduce re-entry anxiety without approving publication, upload, schedule, account changes, or receipt truth.</p>
      <div class="companions">{''.join(front_door_cards)}</div>
    </section>
    <section class="panel" style="margin-top:20px">
      <p class="eyebrow">Bite-sized next actions</p>
      <h2>One smallest safe move per lane</h2>
      <p>Use these when the system feels too large. Each card points to a reversible local step and keeps approval, publication, upload, schedules, accounts, and receipt truth out of bounds.</p>
      <div class="companions">{''.join(bite_action_cards)}</div>
    </section>
    <section class="panel" style="margin-top:20px">
      <p class="eyebrow">Current workspaces</p>
      <h2>Do useful local work without mutating source truth</h2>
      <p>These are the concrete sidecar/workbench surfaces for review, writing, culling, 360 proofing, and publishing rehearsal.</p>
      <div class="companions">{''.join(workspace_cards)}</div>
    </section>
    <section class="panel" style="margin-top:20px">
      <p class="eyebrow">Production conveyor</p>
      <h2>Open one lane, move one real thing, keep going</h2>
      <p>{html.escape(str(conveyor.get('purpose') or 'A cross-lane local work sequence for making reversible progress without re-solving the whole system.'))}</p>
      {f'<p><b>Conveyor handoff</b><br><code>{html.escape(str(payload.get("productionConveyorPath") or ""))}</code></p>' if payload.get("productionConveyorPath") else ''}
      <div class="return-path">{''.join(conveyor_cards)}</div>
    </section>
	<section class="runway">
	  <article class="runway-card"><p class="eyebrow">First 15 minutes</p><h2>Re-enter calmly</h2><ul>{first_15}</ul></article>
	  <article class="runway-card"><p class="eyebrow">First hour</p><h2>Move one real thing</h2><ul>{first_hour}</ul></article>
	  <article class="runway-card"><p class="eyebrow">Codex can continue</p><h2>Safe parallel work</h2><ul>{codex_can}</ul></article>
	  <article class="runway-card"><p class="eyebrow">Needs approval</p><h2>No fake shipping</h2><ul>{approval_required}</ul></article>
	</section>
	<section class="panel" style="margin-top:20px">
	  <p class="eyebrow">Charlie's first calm hour</p>
	  <h2>Open these in order</h2>
	  <p>These are local evidence doors only. They are meant to reduce re-entry anxiety, not to approve publishing or mutate any source.</p>
	  <div class="return-path">{''.join(return_path_cards)}</div>
	</section>
	<section class="companions">{''.join(launcher_cards)}</section>
<section class="companions">{''.join(companion_cards)}</section>
<section class="matrix">{''.join(matrix_cards)}</section>
<section class="loops">{''.join(loop_cards)}</section>
<div class="grid">
  <section class="panel"><p class="eyebrow">Top queue</p>{''.join(top_cards)}</section>
  <aside class="panel"><p class="eyebrow">Safety boundary</p><ul>{boundary}</ul></aside>
</div>
<section class="lanes">{''.join(lane_cards)}</section>
<section class="panel" style="margin-top:20px"><p class="eyebrow">Useful things to open</p><table><thead><tr><th>Lane</th><th>Artifact</th><th>Path</th></tr></thead><tbody>{''.join(target_rows)}</tbody></table></section>
</main></body></html>"""


def write_csv(path: Path, payload: dict[str, Any]) -> None:
    with path.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=["rank", "priority", "lane", "title", "suggestedOwner", "humanAsk", "agentCanContinueWith", "action", "status", "explanation", "openCommand", "firstSafeCommand", "decisionCommand", "decisionSafety", "safety"])
        writer.writeheader()
        for rank, card in enumerate(payload["topQueue"], 1):
            first_action = first_action_summary(card)
            writer.writerow({
                "rank": rank,
                "priority": card.get("priority") or "",
                "lane": card.get("lane") or "",
                "title": card.get("title") or "",
                "suggestedOwner": card.get("suggestedOwner") or "",
                "humanAsk": card.get("humanAsk") or "",
                "agentCanContinueWith": card.get("agentCanContinueWith") or "",
                "action": card.get("action") or "",
                "status": card.get("status") or card.get("reframeStatus") or "",
                "explanation": first_action["nextAction"],
                "openCommand": first_action["openCommand"],
                "firstSafeCommand": first_action["firstSafeCommand"],
                "decisionCommand": first_action["decisionCommand"],
                "decisionSafety": first_action["decisionSafety"],
                "safety": first_action["safety"],
            })


def make_unique_session_dir(root: Path, basename: str) -> Path:
    root.mkdir(parents=True, exist_ok=True)
    candidate = root / basename
    if not candidate.exists():
        candidate.mkdir()
        return candidate
    for index in range(2, 100):
        candidate = root / f"{basename}-{index:02d}"
        if not candidate.exists():
            candidate.mkdir()
            return candidate
    raise RuntimeError(f"Could not allocate unique return brief directory for {basename}")


def main() -> int:
    pointer_path = Path(sys.argv[1]) if len(sys.argv) > 1 and sys.argv[1] else DEFAULT_POINTER
    board, board_path, pointer = resolve_board(pointer_path)
    if not board.get("lanes"):
        print(json.dumps({"ok": False, "error": f"No full OS board found via {pointer_path}"}, indent=2))
        return 1
    out_dir = make_unique_session_dir(DEFAULT_OS_ROOT / "ReturnBriefs", f"{stamp()}-quipsly-return-brief")
    payload = build_payload(board, board_path, pointer, out_dir)
    payload["status"] = "return-brief-ready"
    payload["humanAsk"] = HUMAN_ASK
    payload["agentSafeParallelWork"] = AGENT_SAFE_PARALLEL_WORK
    payload["nextSafestAction"] = "Open the return brief, start with the top queue, and only use local review/readiness actions unless Charlie explicitly approves external publication or receipt capture."
    html_path = out_dir / "index.html"
    json_path = out_dir / "quipsly-return-brief.json"
    markdown_path = out_dir / "START-HERE-Quipsly-return-brief.md"
    production_conveyor_path = out_dir / "PRODUCTION-CONVEYOR.md"
    csv_path = out_dir / "quipsly-return-queue.csv"
    payload.update({
        "htmlPath": str(html_path),
        "jsonPath": str(json_path),
        "markdownPath": str(markdown_path),
        "productionConveyorPath": str(production_conveyor_path),
        "csvPath": str(csv_path),
    })
    payload["firstSafeAction"] = {
        "label": "Open Quipsly Return Brief",
        "command": f"open {shell_quote(str(html_path))}",
        "path": str(html_path),
        "safety": "Opens local handoff evidence only. It does not mutate sources, approvals, receipts, schedules, uploads, or publications.",
    }
    html_path.write_text(render_html(payload), encoding="utf-8")
    markdown_path.write_text(render_markdown(payload), encoding="utf-8")
    write_production_conveyor_markdown(production_conveyor_path, payload)
    write_csv(csv_path, payload)
    write_json(json_path, payload)
    pointer_payload = {
        "schema": SCHEMA,
        "updatedAt": payload["generatedAt"],
        "status": payload["status"],
        "htmlPath": str(html_path),
        "jsonPath": str(json_path),
        "markdownPath": str(markdown_path),
        "productionConveyorPath": str(production_conveyor_path),
        "csvPath": str(csv_path),
        "sessionDir": str(out_dir),
        "counts": payload["counts"],
        "operatingLoops": payload.get("operatingLoops") or [],
        "openTargets": payload.get("openTargets") or [],
        "topQueue": payload.get("topQueue") or [],
        "firstActionsByLane": payload.get("firstActionsByLane") or [],
        "frontDoorActionsByLane": payload.get("frontDoorActionsByLane") or [],
        "biteSizedNextActionsByLane": payload.get("biteSizedNextActionsByLane") or [],
        "currentWorkspaces": payload.get("currentWorkspaces") or [],
        "productionConveyor": payload.get("productionConveyor") or {},
        "productionWorkSessionLaunchers": payload.get("productionWorkSessionLaunchers") or [],
        "returnReviewPath": payload.get("returnReviewPath") or [],
        "latestPointerContractValidationHtml": payload.get("latestPointerContractValidationHtml") or "",
        "latestPointerContractValidationJson": payload.get("latestPointerContractValidationJson") or "",
        "latestPointerContractValidationStatus": payload.get("latestPointerContractValidationStatus") or "",
        "latestPointerContractValidationCounts": payload.get("latestPointerContractValidationCounts") or {},
        "latestStudioSyncDecisionAidHtml": payload.get("latestStudioSyncDecisionAidHtml") or "",
        "latestStudioSyncDecisionAidJson": payload.get("latestStudioSyncDecisionAidJson") or "",
        "latestStudioSyncDecisionAidStatus": payload.get("latestStudioSyncDecisionAidStatus") or "",
        "latestStudioSyncDecisionAidCounts": payload.get("latestStudioSyncDecisionAidCounts") or {},
        "latestStudioSyncDecisionAidHumanAsk": payload.get("latestStudioSyncDecisionAidHumanAsk") or "",
        "latestStudioSyncDecisionAidNextSafestAction": payload.get("latestStudioSyncDecisionAidNextSafestAction") or "",
        "latestStudioWatchListenReviewRoomHtml": payload.get("latestStudioWatchListenReviewRoomHtml") or "",
        "latestStudioWatchListenReviewRoomJson": payload.get("latestStudioWatchListenReviewRoomJson") or "",
        "latestStudioWatchListenReviewRoomStatus": payload.get("latestStudioWatchListenReviewRoomStatus") or "",
        "latestStudioWatchListenReviewRoomCounts": payload.get("latestStudioWatchListenReviewRoomCounts") or {},
        "latestPhotoGroveOperatorWorkbenchHtml": payload.get("latestPhotoGroveOperatorWorkbenchHtml") or "",
        "latestPhotoGroveOperatorWorkbenchJson": payload.get("latestPhotoGroveOperatorWorkbenchJson") or "",
        "latestPhotoGroveOperatorWorkbenchStatus": payload.get("latestPhotoGroveOperatorWorkbenchStatus") or "",
        "latestPhotoGroveOperatorWorkbenchCounts": payload.get("latestPhotoGroveOperatorWorkbenchCounts") or {},
        "latestPhotoGroveCullTheaterHtml": payload.get("latestPhotoGroveCullTheaterHtml") or "",
        "latestPhotoGroveCullTheaterJson": payload.get("latestPhotoGroveCullTheaterJson") or "",
        "latestPhotoGroveCullTheaterStatus": payload.get("latestPhotoGroveCullTheaterStatus") or "",
        "latestPhotoGroveCullTheaterCounts": payload.get("latestPhotoGroveCullTheaterCounts") or {},
        "latestPhotoGroveProofDeskHtml": payload.get("latestPhotoGroveProofDeskHtml") or "",
        "latestPhotoGroveProofDeskJson": payload.get("latestPhotoGroveProofDeskJson") or "",
        "latestPhotoGroveProofDeskStatus": payload.get("latestPhotoGroveProofDeskStatus") or "",
        "latestPhotoGroveProofDeskCounts": payload.get("latestPhotoGroveProofDeskCounts") or {},
        "latestTowerSocialCommandCenterHtml": payload.get("latestTowerSocialCommandCenterHtml") or "",
        "latestTowerSocialCommandCenterJson": payload.get("latestTowerSocialCommandCenterJson") or "",
        "latestTowerSocialCommandCenterStatus": payload.get("latestTowerSocialCommandCenterStatus") or "",
        "latestTowerSocialCommandCenterCounts": payload.get("latestTowerSocialCommandCenterCounts") or {},
        "latestTowerNextPublishingBatchHtml": payload.get("latestTowerNextPublishingBatchHtml") or "",
        "latestTowerNextPublishingBatchJson": payload.get("latestTowerNextPublishingBatchJson") or "",
        "latestTowerNextPublishingBatchStatus": payload.get("latestTowerNextPublishingBatchStatus") or "",
        "latestTowerNextPublishingBatchCounts": payload.get("latestTowerNextPublishingBatchCounts") or {},
        "latestStudioNextShortsReviewBatchHtml": payload.get("latestStudioNextShortsReviewBatchHtml") or "",
        "latestStudioNextShortsReviewBatchJson": payload.get("latestStudioNextShortsReviewBatchJson") or "",
        "latestStudioNextShortsReviewBatchStatus": payload.get("latestStudioNextShortsReviewBatchStatus") or "",
        "latestStudioNextShortsReviewBatchCounts": payload.get("latestStudioNextShortsReviewBatchCounts") or {},
        "latestStudioDurationExperimentMatrixHtml": payload.get("latestStudioDurationExperimentMatrixHtml") or "",
        "latestStudioDurationExperimentMatrixJson": payload.get("latestStudioDurationExperimentMatrixJson") or "",
        "latestStudioDurationExperimentMatrixStatus": payload.get("latestStudioDurationExperimentMatrixStatus") or "",
        "latestStudioDurationExperimentMatrixEpisodes": payload.get("latestStudioDurationExperimentMatrixEpisodes") or 0,
        "latestStudioDurationVersionWorkordersHtml": payload.get("latestStudioDurationVersionWorkordersHtml") or "",
        "latestStudioDurationVersionWorkordersJson": payload.get("latestStudioDurationVersionWorkordersJson") or "",
        "latestStudioDurationVersionWorkordersStatus": payload.get("latestStudioDurationVersionWorkordersStatus") or "",
        "latestStudioDurationVersionWorkordersCounts": payload.get("latestStudioDurationVersionWorkordersCounts") or {},
        "latestStudioDurationEditRecipeSkeletonsHtml": payload.get("latestStudioDurationEditRecipeSkeletonsHtml") or "",
        "latestStudioDurationEditRecipeSkeletonsJson": payload.get("latestStudioDurationEditRecipeSkeletonsJson") or "",
        "latestStudioDurationEditRecipeSkeletonsStatus": payload.get("latestStudioDurationEditRecipeSkeletonsStatus") or "",
        "latestStudioDurationEditRecipeSkeletonsCounts": payload.get("latestStudioDurationEditRecipeSkeletonsCounts") or {},
        "latestStudioTranscriptSourceWorkordersHtml": payload.get("latestStudioTranscriptSourceWorkordersHtml") or "",
        "latestStudioTranscriptSourceWorkordersJson": payload.get("latestStudioTranscriptSourceWorkordersJson") or "",
        "latestStudioTranscriptSourceWorkordersStatus": payload.get("latestStudioTranscriptSourceWorkordersStatus") or "",
        "latestStudioTranscriptSourceWorkordersCounts": payload.get("latestStudioTranscriptSourceWorkordersCounts") or {},
        "latestStudioTranscriptExecutionReadinessHtml": payload.get("latestStudioTranscriptExecutionReadinessHtml") or "",
        "latestStudioTranscriptExecutionReadinessJson": payload.get("latestStudioTranscriptExecutionReadinessJson") or "",
        "latestStudioTranscriptExecutionReadinessStatus": payload.get("latestStudioTranscriptExecutionReadinessStatus") or "",
        "latestStudioTranscriptExecutionReadinessCounts": payload.get("latestStudioTranscriptExecutionReadinessCounts") or {},
        "latestStudioTranscriptPilotHtml": payload.get("latestStudioTranscriptPilotHtml") or "",
        "latestStudioTranscriptPilotJson": payload.get("latestStudioTranscriptPilotJson") or "",
        "latestStudioTranscriptPilotStatus": payload.get("latestStudioTranscriptPilotStatus") or "",
        "latestStudioTranscriptPilotCounts": payload.get("latestStudioTranscriptPilotCounts") or {},
        "latestStudioTranscriptReviewWorkbenchHtml": payload.get("latestStudioTranscriptReviewWorkbenchHtml") or "",
        "latestStudioTranscriptReviewWorkbenchJson": payload.get("latestStudioTranscriptReviewWorkbenchJson") or "",
        "latestStudioTranscriptReviewWorkbenchStatus": payload.get("latestStudioTranscriptReviewWorkbenchStatus") or "",
        "latestStudioTranscriptReviewWorkbenchCounts": payload.get("latestStudioTranscriptReviewWorkbenchCounts") or {},
        "latestStudioTranscriptReviewDecisionLedgerHtml": payload.get("latestStudioTranscriptReviewDecisionLedgerHtml") or "",
        "latestStudioTranscriptReviewDecisionLedgerJson": payload.get("latestStudioTranscriptReviewDecisionLedgerJson") or "",
        "latestStudioTranscriptReviewDecisionLedgerStatus": payload.get("latestStudioTranscriptReviewDecisionLedgerStatus") or "",
        "latestStudioTranscriptReviewDecisionLedgerCounts": payload.get("latestStudioTranscriptReviewDecisionLedgerCounts") or {},
        "latestDailyWritingReadinessHtml": payload.get("latestDailyWritingReadinessHtml") or "",
        "latestDailyWritingReadinessJson": payload.get("latestDailyWritingReadinessJson") or "",
        "latestDailyWritingReadinessStatus": payload.get("latestDailyWritingReadinessStatus") or "",
        "latestDailyWritingReadinessCounts": payload.get("latestDailyWritingReadinessCounts") or {},
        "latestTowerOperatorWorkbenchHtml": payload.get("latestTowerOperatorWorkbenchHtml") or "",
        "latestTowerOperatorWorkbenchJson": payload.get("latestTowerOperatorWorkbenchJson") or "",
        "latestTowerOperatorWorkbenchStatus": payload.get("latestTowerOperatorWorkbenchStatus") or "",
        "latestTowerOperatorWorkbenchCounts": payload.get("latestTowerOperatorWorkbenchCounts") or {},
        "latestNestAuthorDeskHtml": payload.get("latestNestAuthorDeskHtml") or "",
        "latestNestAuthorDeskJson": payload.get("latestNestAuthorDeskJson") or "",
        "latestNestAuthorDeskStatus": payload.get("latestNestAuthorDeskStatus") or "",
        "latestNestAuthorDeskCounts": payload.get("latestNestAuthorDeskCounts") or {},
        "latestNestReviewDeskHtml": payload.get("latestNestReviewDeskHtml") or "",
        "latestNestReviewDeskJson": payload.get("latestNestReviewDeskJson") or "",
        "latestNestReviewDeskStatus": payload.get("latestNestReviewDeskStatus") or "",
        "latestNestReviewDeskCounts": payload.get("latestNestReviewDeskCounts") or {},
        "latestWritingPublicationRunwayHtml": payload.get("latestWritingPublicationRunwayHtml") or "",
        "latestWritingPublicationRunwayJson": payload.get("latestWritingPublicationRunwayJson") or "",
        "latestWritingPublicationRunwayStatus": payload.get("latestWritingPublicationRunwayStatus") or "",
        "latestWritingPublicationRunwayCounts": payload.get("latestWritingPublicationRunwayCounts") or {},
        "latestStudio360OperatorWorkbenchHtml": payload.get("latestStudio360OperatorWorkbenchHtml") or "",
        "latestStudio360OperatorWorkbenchJson": payload.get("latestStudio360OperatorWorkbenchJson") or "",
        "latestStudio360OperatorWorkbenchStatus": payload.get("latestStudio360OperatorWorkbenchStatus") or "",
        "latestStudio360OperatorWorkbenchCounts": payload.get("latestStudio360OperatorWorkbenchCounts") or {},
        "latestStudio360RepairPreflightHtml": payload.get("latestStudio360RepairPreflightHtml") or "",
        "latestStudio360RepairPreflightJson": payload.get("latestStudio360RepairPreflightJson") or "",
        "latestStudio360RepairPreflightStatus": payload.get("latestStudio360RepairPreflightStatus") or "",
        "latestStudio360RepairPreflightCounts": payload.get("latestStudio360RepairPreflightCounts") or {},
        "firstSafeAction": payload["firstSafeAction"],
        "humanAsk": payload["humanAsk"],
        "agentSafeParallelWork": payload["agentSafeParallelWork"],
        "nextSafestAction": payload["nextSafestAction"],
        "truth": payload["truth"],
    }
    write_json(DEFAULT_OS_ROOT / "latest-quipsly-return-brief.json", pointer_payload)
    print(json.dumps({"ok": True, **pointer_payload}, indent=2, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
