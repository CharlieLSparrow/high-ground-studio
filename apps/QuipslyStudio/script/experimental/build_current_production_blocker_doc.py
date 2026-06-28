#!/usr/bin/env python3
"""Write the current Quipsly production blocker sheet.

This replaces stale export-folder-only blocker language with current review
runway truth. It reads local pointers and writes a Desktop Markdown handoff.
It does not repair, export, approve, publish, upload, schedule, mutate sources,
overwrite versions, delete files, mutate accounts, or create receipt truth.
"""
from __future__ import annotations

import argparse
import json
import shlex
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

DEFAULT_RELEASE_ROOT = Path("/Volumes/My Passport/Episode_and_Shorts_Test")
DEFAULT_BRIEF_POINTER = Path("/Volumes/My Passport/Quipsly Media Workspace/QuipslyOS/latest-quipsly-return-brief.json")
DEFAULT_REVIEW_POINTER = DEFAULT_RELEASE_ROOT / "review-board/studio-review-work-sessions/latest-studio-review-work-session.json"
DEFAULT_PACKAGE_QUALITY_DESK_POINTER = DEFAULT_RELEASE_ROOT / "review-board/latest-studio-package-quality-desk.json"
DEFAULT_DURATION_WARNING_REVIEW_POINTER = DEFAULT_RELEASE_ROOT / "review-board/duration-warning-packets/latest-duration-warning-review-packet.json"
DEFAULT_DURATION_EXPERIMENT_MATRIX_POINTER = DEFAULT_RELEASE_ROOT / "review-board/duration-experiment-matrix/latest-duration-experiment-matrix.json"
DEFAULT_DURATION_VERSION_WORKORDERS_POINTER = DEFAULT_RELEASE_ROOT / "review-board/duration-version-workorders/latest-duration-version-workorders.json"
DEFAULT_DURATION_EDIT_RECIPE_SKELETONS_POINTER = DEFAULT_RELEASE_ROOT / "review-board/duration-edit-recipes/latest-duration-edit-recipe-skeletons.json"
DEFAULT_TRANSCRIPT_SOURCE_WORKORDERS_POINTER = DEFAULT_RELEASE_ROOT / "review-board/transcript-source-workorders/latest-transcript-source-workorders.json"
DEFAULT_TRANSCRIPT_EXECUTION_READINESS_POINTER = DEFAULT_RELEASE_ROOT / "review-board/transcript-execution-readiness/latest-transcript-execution-readiness.json"
DEFAULT_TRANSCRIPT_PILOT_POINTER = DEFAULT_RELEASE_ROOT / "review-board/transcript-pilots/latest-transcript-pilot.json"
DEFAULT_TRANSCRIPT_REVIEW_WORKBENCH_POINTER = DEFAULT_RELEASE_ROOT / "review-board/transcript-review-workbench/latest-transcript-review-workbench.json"
DEFAULT_TRANSCRIPT_REVIEW_DECISION_LEDGER_POINTER = DEFAULT_RELEASE_ROOT / "review-board/latest-transcript-review-decision-ledger.json"
DEFAULT_DAILY_WRITING_READINESS_POINTER = Path("/Volumes/My Passport/Quipsly Media Workspace/NestWriting/latest-daily-writing-desk-readiness.json")
DEFAULT_OUTPUT = Path("/Users/wall-e/Desktop/Quipsly_Episode_Export_Blockers.md")
DEFAULT_OS_BLOCKER_POINTER = Path("/Volumes/My Passport/Quipsly Media Workspace/QuipslyOS/latest-current-production-blockers.json")
DEFAULT_POINTER_CONTRACT_VALIDATION_POINTER = Path("/Volumes/My Passport/Quipsly Media Workspace/QuipslyOS/latest-quipsly-pointer-contract-validation.json")
SCHEMA = "quipsly.current-production-blocker-doc.v1"


def iso_now() -> str:
    return datetime.now(timezone.utc).astimezone().isoformat(timespec="seconds")


def load_json(path: Path) -> dict[str, Any]:
    if not path.exists():
        return {}
    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
        return payload if isinstance(payload, dict) else {}
    except Exception:
        return {}


def load_pointer_target(path: Path) -> dict[str, Any]:
    pointer = load_json(path)
    target_path = Path(str(pointer.get("jsonPath") or "")) if pointer.get("jsonPath") else None
    target = load_json(target_path) if target_path and target_path.exists() else {}
    return {**pointer, **target} if target else pointer


def shell_quote(value: str) -> str:
    return shlex.quote(value)


def first_existing_path(paths: list[dict[str, Any]], label_contains: str = "") -> str:
    for item in paths:
        if not isinstance(item, dict):
            continue
        label = str(item.get("label") or "").lower()
        path = str(item.get("path") or "")
        if label_contains and label_contains not in label:
            continue
        if path:
            return path
    return ""


def episode_status(card: dict[str, Any]) -> str:
    severity = str(card.get("durationSeverity") or "").lower()
    default = str(card.get("defaultLocalDecision") or "").lower()
    if "major" in severity:
        return "Needs sync investigation before publication."
    if "duration" in severity or "warning" in severity:
        return "Needs duration review before publication."
    if default == "hold":
        return "Review hold: artifacts exist, human/agent watch-listen review needed."
    return "Needs local review decision."


def duration_episode_summary(packet: dict[str, Any]) -> dict[int, dict[str, Any]]:
    summaries: dict[int, dict[str, Any]] = {}
    for row in packet.get("episodes") or []:
        if not isinstance(row, dict):
            continue
        try:
            episode_number = int(row.get("episode") or 0)
        except (TypeError, ValueError):
            continue
        if not episode_number:
            continue
        summaries[episode_number] = {
            "episode": episode_number,
            "version": row.get("version") or "",
            "urgency": row.get("urgency") or "",
            "spreadLabel": row.get("spreadLabel") or "",
            "spreadSeconds": row.get("spreadSeconds") or 0,
            "plainEnglish": row.get("plainEnglish") or "",
            "shortestArtifact": row.get("shortestArtifact") or {},
            "longestArtifact": row.get("longestArtifact") or {},
            "nextSafestAction": row.get("nextSafestAction") or "",
            "safeReviewCommands": row.get("safeReviewCommands") or [],
        }
    return summaries


def is_duration_warning_card(card: dict[str, Any], duration_episode_numbers: set[int]) -> bool:
    try:
        episode_number = int(card.get("episode") or 0)
    except (TypeError, ValueError):
        episode_number = 0
    severity = str(card.get("durationSeverity") or "").lower()
    spread_label = str(card.get("durationSpreadLabel") or "").strip().lower()
    has_nonzero_spread = bool(spread_label and spread_label not in {"0", "0s", "0:00", "0:00.0", "0:00.00"})
    if "aligned" in severity and not has_nonzero_spread:
        return False
    return (
        episode_number in duration_episode_numbers
        or ("duration" in severity and has_nonzero_spread)
        or ("spread" in severity and has_nonzero_spread)
        or ("warning" in severity and has_nonzero_spread)
    )


def enrich_review_cards(review_cards: list[dict[str, Any]], duration_warning: dict[str, Any]) -> list[dict[str, Any]]:
    action = duration_warning.get("firstSafeAction") if isinstance(duration_warning.get("firstSafeAction"), dict) else {}
    html_path = str(action.get("path") or duration_warning.get("htmlPath") or "")
    command = str(action.get("command") or (f"open {shell_quote(html_path)}" if html_path else ""))
    safety = str(action.get("safety") or "Opens local duration warning evidence only. No repair, approval, publication, upload, schedule, overwrite, source mutation, delete, or receipt truth.")
    episode_summaries = duration_episode_summary(duration_warning)
    duration_episode_numbers = set(episode_summaries.keys())
    enriched: list[dict[str, Any]] = []
    for card in review_cards:
        item = dict(card)
        if html_path and is_duration_warning_card(item, duration_episode_numbers):
            try:
                episode_number = int(item.get("episode") or 0)
            except (TypeError, ValueError):
                episode_number = 0
            item["durationWarningReview"] = {
                "status": duration_warning.get("status") or "",
                "htmlPath": html_path,
                "jsonPath": duration_warning.get("jsonPath") or "",
                "markdownPath": duration_warning.get("markdownPath") or "",
                "command": command,
                "safety": safety,
                "episodeSummary": episode_summaries.get(episode_number, {}),
                "nextSafestAction": (
                    (episode_summaries.get(episode_number) or {}).get("nextSafestAction")
                    or duration_warning.get("nextSafestAction")
                    or "Open the duration warning evidence packet before any repair, approval, or publishing decision."
                ),
            }
        enriched.append(item)
    return enriched


def build_payload(
    release_root: Path,
    brief: dict[str, Any],
    review: dict[str, Any],
    duration_warning: dict[str, Any],
    pointer_validation: dict[str, Any],
    review_theater: dict[str, Any],
    package_desk: dict[str, Any],
    shorts_batch: dict[str, Any],
    duration_matrix: dict[str, Any],
    duration_workorders: dict[str, Any],
    duration_recipes: dict[str, Any],
    transcript_sources: dict[str, Any],
    transcript_execution: dict[str, Any],
    transcript_pilot: dict[str, Any],
    transcript_review_workbench: dict[str, Any],
    transcript_review_decision_ledger: dict[str, Any],
    daily_writing_readiness: dict[str, Any],
    output: Path,
) -> dict[str, Any]:
    workspaces = brief.get("currentWorkspaces") if isinstance(brief.get("currentWorkspaces"), list) else []
    review_cards = review.get("reviewDecisionCards") if isinstance(review.get("reviewDecisionCards"), list) else []
    review_cards = enrich_review_cards(review_cards, duration_warning)
    review_counts = review.get("counts") if isinstance(review.get("counts"), dict) else {}
    package_counts = package_desk.get("counts") if isinstance(package_desk.get("counts"), dict) else {}
    counts = {**review_counts, **package_counts}
    pointer_contract_counts = pointer_validation.get("counts") if isinstance(pointer_validation.get("counts"), dict) else {}
    if not pointer_contract_counts:
        pointer_contract_counts = brief.get("latestPointerContractValidationCounts") if isinstance(brief.get("latestPointerContractValidationCounts"), dict) else {}
    review_theater_counts = review_theater.get("counts") if isinstance(review_theater.get("counts"), dict) else {}
    if not review_theater_counts:
        review_theater_counts = brief.get("latestStudioReviewTheaterCounts") if isinstance(brief.get("latestStudioReviewTheaterCounts"), dict) else {}
    shorts_batch_counts = shorts_batch.get("counts") if isinstance(shorts_batch.get("counts"), dict) else {}
    if not shorts_batch_counts:
        shorts_batch_counts = brief.get("latestStudioNextShortsReviewBatchCounts") if isinstance(brief.get("latestStudioNextShortsReviewBatchCounts"), dict) else {}
    bite_sized_actions = brief.get("biteSizedNextActionsByLane") if isinstance(brief.get("biteSizedNextActionsByLane"), list) else []
    duration_action = duration_warning.get("firstSafeAction") if isinstance(duration_warning.get("firstSafeAction"), dict) else {}
    duration_path = str(duration_action.get("path") or duration_warning.get("htmlPath") or "")
    duration_command = str(duration_action.get("command") or (f"open {shell_quote(duration_path)}" if duration_path else ""))
    warning_episode_numbers = sorted(duration_episode_summary(duration_warning).keys())
    first_warning_action = {
        "label": "Open duration warning review packet",
        "command": duration_command,
        "path": duration_path,
        "safety": str(duration_action.get("safety") or "Opens local duration warning evidence only. No repair, approval, publication, upload, schedule, overwrite, source mutation, delete, or receipt truth."),
        "nextSafestAction": str(duration_warning.get("nextSafestAction") or "Review duration warning evidence before any repair, approval, promotion, or publication decision."),
    } if duration_path else {}
    return {
        "schema": SCHEMA,
        "generatedAt": iso_now(),
        "status": "current-production-blocker-doc-ready" if review_cards else "current-production-blocker-doc-needs-review-session",
        "releaseRoot": str(release_root),
        "outputPath": str(output),
        "sourceReturnBriefPath": str(brief.get("htmlPath") or brief.get("jsonPath") or DEFAULT_BRIEF_POINTER),
        "counts": {
            "episodes": len(review_cards),
            "currentBestPackages": counts.get("currentBestPackages", 0),
            "reviewablePackages": counts.get("reviewablePackages", 0),
            "readyShorts": counts.get("readyShorts", 0),
            "warningEpisodes": counts.get("warningEpisodes", 0),
            "durationWarningPacketEpisodes": duration_warning.get("episodeCount", 0),
            "receiptSlots": counts.get("receiptSlots", 0),
            "capturedReceipts": counts.get("capturedReceipts", 0),
            "biteSizedNextActionsByLane": len(bite_sized_actions),
        },
        "workspaces": workspaces,
        "biteSizedNextActionsByLane": bite_sized_actions,
        "pointerContractValidation": {
            "status": str(pointer_validation.get("status") or brief.get("latestPointerContractValidationStatus") or "not-run"),
            "htmlPath": str(pointer_validation.get("htmlPath") or brief.get("latestPointerContractValidationHtml") or ""),
            "jsonPath": str(pointer_validation.get("jsonPath") or brief.get("latestPointerContractValidationJson") or ""),
            "counts": pointer_contract_counts,
        },
        "reviewTheater": {
            "status": str(review_theater.get("status") or brief.get("latestStudioReviewTheaterStatus") or "not-run"),
            "htmlPath": str(review_theater.get("htmlPath") or brief.get("latestStudioReviewTheaterHtml") or ""),
            "jsonPath": str(review_theater.get("jsonPath") or brief.get("latestStudioReviewTheaterJson") or ""),
            "counts": review_theater_counts,
        },
        "studioNextShortsReviewBatch": {
            "status": str(shorts_batch.get("status") or brief.get("latestStudioNextShortsReviewBatchStatus") or "not-run"),
            "htmlPath": str(shorts_batch.get("htmlPath") or brief.get("latestStudioNextShortsReviewBatchHtml") or ""),
            "jsonPath": str(shorts_batch.get("jsonPath") or brief.get("latestStudioNextShortsReviewBatchJson") or ""),
            "counts": shorts_batch_counts,
            "nextSafestAction": str(shorts_batch.get("nextSafestAction") or "Watch the shorts top-down, mark only local intent, and leave all external receipt slots empty."),
        },
        "durationExperimentMatrix": {
            "status": str(duration_matrix.get("status") or brief.get("latestStudioDurationExperimentMatrixStatus") or "not-run"),
            "htmlPath": str(duration_matrix.get("htmlPath") or brief.get("latestStudioDurationExperimentMatrixHtml") or ""),
            "jsonPath": str(duration_matrix.get("jsonPath") or brief.get("latestStudioDurationExperimentMatrixJson") or ""),
            "markdownPath": str(duration_matrix.get("markdownPath") or ""),
            "episodeCount": len(duration_matrix.get("episodes") or []) or int(brief.get("latestStudioDurationExperimentMatrixEpisodes") or 0),
            "nextSafestAction": str(duration_matrix.get("nextSafestAction") or "Pick one target duration per episode, then generate versioned edit recipes before rendering any new files."),
            "truth": "Review-only duration planning. No render, approval, upload, publication, schedule, overwrite, source mutation, delete, or receipt truth.",
        },
        "durationVersionWorkorders": {
            "status": str(duration_workorders.get("status") or brief.get("latestStudioDurationVersionWorkordersStatus") or "not-run"),
            "htmlPath": str(duration_workorders.get("htmlPath") or brief.get("latestStudioDurationVersionWorkordersHtml") or ""),
            "jsonPath": str(duration_workorders.get("jsonPath") or brief.get("latestStudioDurationVersionWorkordersJson") or ""),
            "markdownPath": str(duration_workorders.get("markdownPath") or ""),
            "counts": duration_workorders.get("counts") or brief.get("latestStudioDurationVersionWorkordersCounts") or {},
            "nextSafestAction": str(duration_workorders.get("nextSafestAction") or "Pick one work order per episode and create edit recipes before rendering any new duration versions."),
            "truth": "Review-only work orders. No edit recipe, render, approval, upload, publication, schedule, overwrite, source mutation, delete, or receipt truth.",
        },
        "durationEditRecipeSkeletons": {
            "status": str(duration_recipes.get("status") or brief.get("latestStudioDurationEditRecipeSkeletonsStatus") or "not-run"),
            "htmlPath": str(duration_recipes.get("htmlPath") or brief.get("latestStudioDurationEditRecipeSkeletonsHtml") or ""),
            "jsonPath": str(duration_recipes.get("jsonPath") or brief.get("latestStudioDurationEditRecipeSkeletonsJson") or ""),
            "markdownPath": str(duration_recipes.get("markdownPath") or ""),
            "counts": duration_recipes.get("counts") or brief.get("latestStudioDurationEditRecipeSkeletonsCounts") or {},
            "nextSafestAction": str(duration_recipes.get("nextSafestAction") or "Pick one recipe skeleton and run the boundary/transcript pass before writing timeline decisions or rendering files."),
            "truth": "Review-only recipe skeletons. No timeline decisions, render, approval, upload, publication, schedule, overwrite, source mutation, delete, or receipt truth.",
        },
        "transcriptSourceWorkorders": {
            "status": str(transcript_sources.get("status") or brief.get("latestStudioTranscriptSourceWorkordersStatus") or "not-run"),
            "htmlPath": str(transcript_sources.get("htmlPath") or brief.get("latestStudioTranscriptSourceWorkordersHtml") or ""),
            "jsonPath": str(transcript_sources.get("jsonPath") or brief.get("latestStudioTranscriptSourceWorkordersJson") or ""),
            "markdownPath": str(transcript_sources.get("markdownPath") or ""),
            "counts": transcript_sources.get("counts") or brief.get("latestStudioTranscriptSourceWorkordersCounts") or {},
            "nextSafestAction": str(transcript_sources.get("nextSafestAction") or "Run ASR only after choosing high-priority sources; keep source transcripts separate until reconciliation."),
            "truth": "Inventory-only transcript work orders. No ASR, sidecar write, transcript import, timeline decision, render, approval, upload, publication, schedule, overwrite, source mutation, delete, or receipt truth.",
        },
        "transcriptExecutionReadiness": {
            "status": str(transcript_execution.get("status") or brief.get("latestStudioTranscriptExecutionReadinessStatus") or "not-run"),
            "htmlPath": str(transcript_execution.get("htmlPath") or brief.get("latestStudioTranscriptExecutionReadinessHtml") or ""),
            "jsonPath": str(transcript_execution.get("jsonPath") or brief.get("latestStudioTranscriptExecutionReadinessJson") or ""),
            "markdownPath": str(transcript_execution.get("markdownPath") or ""),
            "counts": transcript_execution.get("counts") or brief.get("latestStudioTranscriptExecutionReadinessCounts") or {},
            "providerAvailable": bool(transcript_execution.get("providerAvailable")),
            "nextSafestAction": str(transcript_execution.get("nextSafestAction") or "Run one high-priority ASR command only after provider doctor is available, then normalize/review before importing."),
            "truth": "Execution-readiness planning only. No ASR, sidecar write, transcript import, timeline decision, render, approval, upload, publication, schedule, overwrite, source mutation, delete, or receipt truth.",
        },
        "transcriptPilot": {
            "status": str(transcript_pilot.get("status") or brief.get("latestStudioTranscriptPilotStatus") or "not-run"),
            "htmlPath": str(transcript_pilot.get("htmlPath") or brief.get("latestStudioTranscriptPilotHtml") or ""),
            "jsonPath": str(transcript_pilot.get("jsonPath") or brief.get("latestStudioTranscriptPilotJson") or ""),
            "markdownPath": str(transcript_pilot.get("markdownPath") or ""),
            "counts": transcript_pilot.get("counts") or brief.get("latestStudioTranscriptPilotCounts") or {},
            "providerAvailable": bool(transcript_pilot.get("providerAvailable")),
            "nextSafestAction": str(transcript_pilot.get("nextSafestAction") or "Run or review exactly one transcript pilot before batch ASR, then keep normalized draft transcripts separate from import/reconciliation."),
            "truth": "One-source transcript pilot receipt. It may run ASR and write raw/normalized draft sidecars, but does not import, reconcile, write timeline decisions, render, approve, upload, publish, schedule, overwrite, mutate sources, delete, or create receipt truth.",
        },
        "transcriptReviewWorkbench": {
            "status": str(transcript_review_workbench.get("status") or brief.get("latestStudioTranscriptReviewWorkbenchStatus") or "not-run"),
            "htmlPath": str(transcript_review_workbench.get("htmlPath") or brief.get("latestStudioTranscriptReviewWorkbenchHtml") or ""),
            "jsonPath": str(transcript_review_workbench.get("jsonPath") or brief.get("latestStudioTranscriptReviewWorkbenchJson") or ""),
            "markdownPath": str(transcript_review_workbench.get("markdownPath") or ""),
            "counts": transcript_review_workbench.get("counts") or brief.get("latestStudioTranscriptReviewWorkbenchCounts") or {},
            "nextSafestAction": str(transcript_review_workbench.get("nextSafestAction") or "Review normalized ASR drafts for speaker/timing quality before importing, reconciling, or using them for captions/quotes."),
            "truth": "Transcript review workbench only. No transcript edit, import, reconciliation, timeline decision, render, approval, upload, publication, schedule, overwrite, source mutation, delete, or receipt truth.",
        },
        "transcriptReviewDecisionLedger": {
            "status": str(transcript_review_decision_ledger.get("status") or brief.get("latestStudioTranscriptReviewDecisionLedgerStatus") or "not-run"),
            "htmlPath": str(transcript_review_decision_ledger.get("htmlPath") or brief.get("latestStudioTranscriptReviewDecisionLedgerHtml") or ""),
            "jsonPath": str(transcript_review_decision_ledger.get("jsonPath") or brief.get("latestStudioTranscriptReviewDecisionLedgerJson") or ""),
            "markdownPath": str(transcript_review_decision_ledger.get("markdownPath") or ""),
            "csvPath": str(transcript_review_decision_ledger.get("csvPath") or ""),
            "counts": transcript_review_decision_ledger.get("counts") or brief.get("latestStudioTranscriptReviewDecisionLedgerCounts") or {},
            "nextSafestAction": str(transcript_review_decision_ledger.get("nextSafestAction") or "Record local transcript review intent before reconciliation/import."),
            "truth": "Transcript review decision ledger only. Ready means local eligibility for reconciliation prep, not canonical import, captions, quotes, publication, upload, schedule, overwrite, source mutation, delete, or receipt truth.",
        },
        "dailyWritingReadiness": {
            "status": str(daily_writing_readiness.get("status") or brief.get("latestDailyWritingReadinessStatus") or "not-run"),
            "htmlPath": str(daily_writing_readiness.get("htmlPath") or brief.get("latestDailyWritingReadinessHtml") or ""),
            "jsonPath": str(daily_writing_readiness.get("jsonPath") or brief.get("latestDailyWritingReadinessJson") or ""),
            "markdownPath": str(daily_writing_readiness.get("markdownPath") or ""),
            "counts": daily_writing_readiness.get("counts") or brief.get("latestDailyWritingReadinessCounts") or {},
            "recommendation": (
                daily_writing_readiness.get("recommendation", {}).get("decision")
                if isinstance(daily_writing_readiness.get("recommendation"), dict)
                else "Start daily serious book writing in web/Nest first; build native local-first writing next; keep one manuscript truth."
            ),
            "nextSafestAction": str(daily_writing_readiness.get("nextSafestAction") or "Make the web/Nest Daily Writing Desk the immediate daily driver, then build native local-first capture/drafting without creating a second manuscript truth."),
            "truth": "Readiness/planning-only writing surface decision. No manuscript mutation, canonical replacement, source mutation, publication, upload, schedule, approval, overwrite, delete, or receipt truth.",
        },
        "durationWarningReview": {
            "status": str(duration_warning.get("status") or ("missing" if not DEFAULT_DURATION_WARNING_REVIEW_POINTER.exists() else "unknown")),
            "htmlPath": duration_path,
            "jsonPath": str(duration_warning.get("jsonPath") or ""),
            "markdownPath": str(duration_warning.get("markdownPath") or ""),
            "episodeCount": duration_warning.get("episodeCount", 0),
            "episodeNumbers": warning_episode_numbers,
            "firstSafeAction": first_warning_action,
            "nextSafestAction": str(duration_warning.get("nextSafestAction") or ""),
            "truth": str(duration_warning.get("truth") or "Duration warning pointer only. No repair, approval, publication, upload, schedule, overwrite, source mutation, delete, or receipt truth."),
        },
        "reviewCards": review_cards,
        "firstWarningAction": first_warning_action,
        "firstSafeAction": {
            "label": "Open current production blocker sheet",
            "command": f"open {shell_quote(str(output))}",
            "path": str(output),
            "safety": "Opens local blocker sheet only. No repair, export, approval, publication, upload, schedule, account mutation, receipt capture, source mutation, delete, or overwrite.",
        },
        "truth": {
            "externalPublishing": False,
            "externalUpload": False,
            "externalSchedulesCreated": False,
            "approvalCreated": False,
            "receiptTruthCreated": False,
            "accountMutation": False,
            "sourceFilesMutated": False,
            "versionsOverwritten": False,
        },
    }


def render_markdown(payload: dict[str, Any]) -> str:
    counts = payload.get("counts") if isinstance(payload.get("counts"), dict) else {}
    pointer_contract = payload.get("pointerContractValidation") if isinstance(payload.get("pointerContractValidation"), dict) else {}
    pointer_counts = pointer_contract.get("counts") if isinstance(pointer_contract.get("counts"), dict) else {}
    review_theater = payload.get("reviewTheater") if isinstance(payload.get("reviewTheater"), dict) else {}
    review_theater_counts = review_theater.get("counts") if isinstance(review_theater.get("counts"), dict) else {}
    shorts_batch = payload.get("studioNextShortsReviewBatch") if isinstance(payload.get("studioNextShortsReviewBatch"), dict) else {}
    shorts_batch_counts = shorts_batch.get("counts") if isinstance(shorts_batch.get("counts"), dict) else {}
    duration_matrix = payload.get("durationExperimentMatrix") if isinstance(payload.get("durationExperimentMatrix"), dict) else {}
    duration_workorders = payload.get("durationVersionWorkorders") if isinstance(payload.get("durationVersionWorkorders"), dict) else {}
    duration_recipes = payload.get("durationEditRecipeSkeletons") if isinstance(payload.get("durationEditRecipeSkeletons"), dict) else {}
    transcript_sources = payload.get("transcriptSourceWorkorders") if isinstance(payload.get("transcriptSourceWorkorders"), dict) else {}
    transcript_execution = payload.get("transcriptExecutionReadiness") if isinstance(payload.get("transcriptExecutionReadiness"), dict) else {}
    transcript_pilot = payload.get("transcriptPilot") if isinstance(payload.get("transcriptPilot"), dict) else {}
    transcript_review_workbench = payload.get("transcriptReviewWorkbench") if isinstance(payload.get("transcriptReviewWorkbench"), dict) else {}
    transcript_review_decision_ledger = payload.get("transcriptReviewDecisionLedger") if isinstance(payload.get("transcriptReviewDecisionLedger"), dict) else {}
    daily_writing_readiness = payload.get("dailyWritingReadiness") if isinstance(payload.get("dailyWritingReadiness"), dict) else {}
    duration_warning = payload.get("durationWarningReview") if isinstance(payload.get("durationWarningReview"), dict) else {}
    duration_action = duration_warning.get("firstSafeAction") if isinstance(duration_warning.get("firstSafeAction"), dict) else {}
    lines = [
        "# Quipsly Episode Export Blockers",
        "",
        f"Last updated: {payload.get('generatedAt')}",
        "",
        f"Export workspace: `{payload.get('releaseRoot')}`",
        "",
        "This is the current review-runway blocker sheet. It is intentionally local and receipt-honest: a package can be reviewable without being approved, published, uploaded, scheduled, or receipted.",
        "",
        "## Current front doors",
        "",
    ]
    for row in payload.get("workspaces") or []:
        if not isinstance(row, dict):
            continue
        lines.append(f"- **{row.get('lane')}**: {row.get('label')} -> `{row.get('path')}`")
    if review_theater.get("htmlPath"):
        lines.extend([
            "",
            "## Best first reviewer surface",
            "",
            f"- **Studio review theater**: `{review_theater.get('htmlPath')}`",
            f"- Theater status: `{review_theater.get('status')}`",
            f"- Episodes embedded: `{review_theater_counts.get('episodes', 0)}`",
            f"- Video rows: `{review_theater_counts.get('videoRows', 0)}`",
            f"- Audio rows: `{review_theater_counts.get('audioRows', 0)}`",
            f"- Shorts linked: `{review_theater_counts.get('shortRows', 0)}`",
            "- Use this when Charlie/Mako/Homer want to watch/listen from one calm place. It is not approval, publication, upload, schedule, or receipt truth.",
        ])
    if shorts_batch.get("htmlPath"):
        lines.extend([
            "",
            "## Best first shorts review surface",
            "",
            f"- **Studio next shorts review batch**: `{shorts_batch.get('htmlPath')}`",
            f"- Batch status: `{shorts_batch.get('status')}`",
            f"- Source shorts: `{shorts_batch_counts.get('sourceShortRows', 0)}`",
            f"- Batch rows: `{shorts_batch_counts.get('batchRows', 0)}`",
            f"- Playable rows: `{shorts_batch_counts.get('playableRows', 0)}`",
            f"- Warning-episode rows in default batch: `{shorts_batch_counts.get('warningEpisodeRows', 0)}`",
            f"- Dry-run rows: `{shorts_batch_counts.get('dryRunRows', 0)}`",
            f"- Receipt slots: `{shorts_batch_counts.get('receiptSlots', 0)}`",
            f"- Captured receipts: `{shorts_batch_counts.get('capturedReceipts', 0)}`",
            f"- Next: {shorts_batch.get('nextSafestAction')}",
            "- Use this when the next job is reviewing shorts for social platforms. It is not approval, publication, upload, schedule, or receipt truth.",
        ])
    if duration_matrix.get("htmlPath"):
        lines.extend([
            "",
            "## Duration experiment matrix",
            "",
            f"- **Episode duration experiments**: `{duration_matrix.get('htmlPath')}`",
            f"- Matrix status: `{duration_matrix.get('status')}`",
            f"- Episodes covered: `{duration_matrix.get('episodeCount')}`",
            f"- Next: {duration_matrix.get('nextSafestAction')}",
            "- Use this before rendering alternate duration versions. It is not an export, approval, publication, upload, schedule, or receipt.",
        ])
    if duration_workorders.get("htmlPath"):
        duration_workorder_counts = duration_workorders.get("counts") if isinstance(duration_workorders.get("counts"), dict) else {}
        lines.extend([
            "",
            "## Duration version work orders",
            "",
            f"- **Episode duration version work orders**: `{duration_workorders.get('htmlPath')}`",
            f"- Work-order status: `{duration_workorders.get('status')}`",
            f"- Work orders: `{duration_workorder_counts.get('workOrders', 0)}`",
            f"- First-priority work orders: `{duration_workorder_counts.get('firstPriorityWorkOrders', 0)}`",
            f"- Warning work orders: `{duration_workorder_counts.get('warningWorkOrders', 0)}`",
            f"- Next: {duration_workorders.get('nextSafestAction')}",
            "- Use this when turning duration ideas into versioned edit recipes. It is not an export, approval, publication, upload, schedule, or receipt.",
        ])
    if duration_recipes.get("htmlPath"):
        duration_recipe_counts = duration_recipes.get("counts") if isinstance(duration_recipes.get("counts"), dict) else {}
        lines.extend([
            "",
            "## Duration edit-recipe skeletons",
            "",
            f"- **Episode duration edit-recipe skeletons**: `{duration_recipes.get('htmlPath')}`",
            f"- Recipe status: `{duration_recipes.get('status')}`",
            f"- Recipes: `{duration_recipe_counts.get('recipes', 0)}`",
            f"- First-priority recipes: `{duration_recipe_counts.get('firstPriorityRecipes', 0)}`",
            f"- Recipes with cautions: `{duration_recipe_counts.get('recipesWithCautions', 0)}`",
            f"- Next: {duration_recipes.get('nextSafestAction')}",
            "- Use this when starting boundary/story/timeline decision passes. It is not timeline mutation, export, approval, publication, upload, schedule, or receipt truth.",
        ])
    if transcript_sources.get("htmlPath"):
        transcript_counts = transcript_sources.get("counts") if isinstance(transcript_sources.get("counts"), dict) else {}
        lines.extend([
            "",
            "## Transcript source work orders",
            "",
            f"- **Episode transcript source work orders**: `{transcript_sources.get('htmlPath')}`",
            f"- Source status: `{transcript_sources.get('status')}`",
            f"- Audio-bearing sources: `{transcript_counts.get('sources', 0)}`",
            f"- Episodes covered: `{transcript_counts.get('episodes', 0)}`",
            f"- High-priority sources: `{transcript_counts.get('highPrioritySources', 0)}`",
            f"- Next: {transcript_sources.get('nextSafestAction')}",
            "- Use this before automatic transcription. It is not ASR, transcript import, timeline mutation, export, approval, publication, upload, schedule, or receipt truth.",
        ])
    if transcript_execution.get("htmlPath"):
        transcript_execution_counts = transcript_execution.get("counts") if isinstance(transcript_execution.get("counts"), dict) else {}
        lines.extend([
            "",
            "## Transcript execution readiness",
            "",
            f"- **Episode transcript execution readiness**: `{transcript_execution.get('htmlPath')}`",
            f"- Execution status: `{transcript_execution.get('status')}`",
            f"- Selected sources: `{transcript_execution_counts.get('selectedSources', 0)}`",
            f"- ASR commands ready: `{transcript_execution_counts.get('asrCommandsReady', 0)}`",
            f"- Provider available: `{transcript_execution.get('providerAvailable')}`",
            f"- Next: {transcript_execution.get('nextSafestAction')}",
            "- Use this after source work orders and before running ASR. It is not ASR, transcript import, timeline mutation, export, approval, publication, upload, schedule, or receipt truth.",
        ])
    if transcript_pilot.get("htmlPath"):
        transcript_pilot_counts = transcript_pilot.get("counts") if isinstance(transcript_pilot.get("counts"), dict) else {}
        lines.extend([
            "",
            "## Transcript pilot",
            "",
            f"- **Episode transcript pilot**: `{transcript_pilot.get('htmlPath')}`",
            f"- Pilot status: `{transcript_pilot.get('status')}`",
            f"- ASR runs: `{transcript_pilot_counts.get('asrRun', 0)}`",
            f"- Raw provider outputs written: `{transcript_pilot_counts.get('rawProviderOutputsWritten', 0)}`",
            f"- Normalized transcripts written: `{transcript_pilot_counts.get('normalizedTranscriptsWritten', 0)}`",
            f"- Next: {transcript_pilot.get('nextSafestAction')}",
            "- Use this to prove one transcript path at a time. It is not transcript import, reconciliation, timeline mutation, export, approval, publication, upload, schedule, overwrite, source mutation, delete, or receipt truth.",
        ])
    if transcript_review_workbench.get("htmlPath"):
        transcript_review_counts = transcript_review_workbench.get("counts") if isinstance(transcript_review_workbench.get("counts"), dict) else {}
        lines.extend([
            "",
            "## Transcript review workbench",
            "",
            f"- **Episode transcript review workbench**: `{transcript_review_workbench.get('htmlPath')}`",
            f"- Workbench status: `{transcript_review_workbench.get('status')}`",
            f"- Normalized transcripts: `{transcript_review_counts.get('normalizedTranscripts', 0)}`",
            f"- Draft segments: `{transcript_review_counts.get('segments', 0)}`",
            f"- Timed words: `{transcript_review_counts.get('timedWords', 0)}`",
            f"- Next: {transcript_review_workbench.get('nextSafestAction')}",
            "- Use this to review ASR drafts before import/reconciliation. It is not transcript editing, import, reconciliation, timeline mutation, export, approval, publication, upload, schedule, overwrite, source mutation, delete, or receipt truth.",
        ])
    if transcript_review_decision_ledger.get("htmlPath"):
        transcript_decision_counts = transcript_review_decision_ledger.get("counts") if isinstance(transcript_review_decision_ledger.get("counts"), dict) else {}
        lines.extend([
            "",
            "## Transcript review decision ledger",
            "",
            f"- **Episode transcript review decision ledger**: `{transcript_review_decision_ledger.get('htmlPath')}`",
            f"- Ledger status: `{transcript_review_decision_ledger.get('status')}`",
            f"- Transcript drafts: `{transcript_decision_counts.get('items', 0)}`",
            f"- Ready for reconciliation: `{transcript_decision_counts.get('readyForReconciliation', 0)}`",
            f"- Needs speaker review: `{transcript_decision_counts.get('needsSpeakerReview', 0)}`",
            f"- Needs timing review: `{transcript_decision_counts.get('needsTimingReview', 0)}`",
            f"- Next: {transcript_review_decision_ledger.get('nextSafestAction')}",
            "- Use this to record local review intent only. It is not transcript editing, import, reconciliation, timeline mutation, export, approval, publication, upload, schedule, overwrite, source mutation, delete, or receipt truth.",
        ])
    if daily_writing_readiness.get("htmlPath"):
        daily_counts = daily_writing_readiness.get("counts") if isinstance(daily_writing_readiness.get("counts"), dict) else {}
        lines.extend([
            "",
            "## Daily Writing Desk readiness",
            "",
            f"- **Daily Writing Desk readiness**: `{daily_writing_readiness.get('htmlPath')}`",
            f"- Readiness status: `{daily_writing_readiness.get('status')}`",
            f"- Requirements: `{daily_counts.get('requirements', 0)}`",
            f"- Web ready/partial: `{daily_counts.get('webReadyOrPartial', 0)}`",
            f"- Native ready/partial/natural-fit: `{daily_counts.get('nativeReadyOrPartial', 0)}`",
            f"- Recommendation: {daily_writing_readiness.get('recommendation')}",
            f"- Next: {daily_writing_readiness.get('nextSafestAction')}",
            "- Use this to decide where Charlie should write the book now. It is not manuscript mutation, canonical replacement, publication, upload, schedule, approval, or receipt truth.",
        ])
    lines.extend([
        "",
        "## Front-door validation",
        "",
        f"- Pointer contract status: `{pointer_contract.get('status') or 'not-run'}`",
        f"- Pointer contract checks: `{pointer_counts.get('checks', 0)}`",
        f"- Pointer contract failures: `{pointer_counts.get('failures', 0)}`",
        f"- Pointer contract report: `{pointer_contract.get('htmlPath') or ''}`",
        "",
        "## Current counts",
        "",
        f"- Current-best packages: `{counts.get('currentBestPackages')}`",
        f"- Reviewable packages: `{counts.get('reviewablePackages')}`",
        f"- Ready shorts: `{counts.get('readyShorts')}`",
        f"- Warning episodes: `{counts.get('warningEpisodes')}`",
        f"- Duration warning packet episodes: `{counts.get('durationWarningPacketEpisodes')}`",
        f"- Receipt slots: `{counts.get('receiptSlots')}`",
        f"- Captured receipts: `{counts.get('capturedReceipts')}`",
    ])
    if duration_warning.get("htmlPath"):
        lines.extend([
            "",
            "## Duration warning review packet",
            "",
            f"- Status: `{duration_warning.get('status')}`",
            f"- Episode(s): `{', '.join(str(item) for item in duration_warning.get('episodeNumbers') or [])}`",
            f"- Open: `{duration_warning.get('htmlPath')}`",
            f"- Command: `{duration_action.get('command') or ''}`",
            f"- Next: {duration_warning.get('nextSafestAction') or ''}",
            f"- Safety: {duration_action.get('safety') or duration_warning.get('truth') or ''}",
            "- Meaning: review the mismatch evidence before any repair, approval, promotion, Tower handoff, upload, schedule, publication, or receipt claim.",
        ])
    lines.extend([
        "",
        "## If one lane stalls, keep this moving",
        "",
    ])
    for action in payload.get("biteSizedNextActionsByLane") or []:
        if not isinstance(action, dict):
            continue
        lines.extend([
            f"- **{action.get('lane')}**: {action.get('label')} (`{action.get('status')}`)",
            f"  - Next: {action.get('nextAction')}",
            f"  - Command: `{action.get('openCommand') or ''}`",
            f"  - Safety: {action.get('safety')}",
        ])
    lines.extend([
        "",
        "## Episode review blockers and next actions",
        "",
    ])
    for card in sorted((c for c in payload.get("reviewCards") or [] if isinstance(c, dict)), key=lambda item: int(item.get("episode") or 999)):
        evidence = card.get("evidencePaths") if isinstance(card.get("evidencePaths"), list) else []
        duration_card = card.get("durationWarningReview") if isinstance(card.get("durationWarningReview"), dict) else {}
        duration_summary = duration_card.get("episodeSummary") if isinstance(duration_card.get("episodeSummary"), dict) else {}
        lines.extend([
            f"### Episode {card.get('episode')}",
            "",
            f"- Status: {episode_status(card)}",
            f"- Duration status: `{card.get('durationSeverity') or 'unknown'}` / `{card.get('durationSpreadLabel') or ''}`",
            f"- Suggested local decision: `{card.get('defaultLocalDecision') or 'needs-more-evidence'}`",
            f"- Decision prompt: {card.get('decisionPrompt') or ''}",
        ])
        if duration_card:
            lines.extend([
                f"- Warning packet: `{duration_card.get('htmlPath')}`",
                f"- Warning command: `{duration_card.get('command')}`",
                f"- Warning next action: {duration_card.get('nextSafestAction')}",
                f"- Mismatch summary: {duration_summary.get('plainEnglish') or 'Duration evidence needs local review.'}",
                f"- Shortest artifact: `{(duration_summary.get('shortestArtifact') or {}).get('label') or ''}` `{(duration_summary.get('shortestArtifact') or {}).get('durationLabel') or ''}`",
                f"- Longest artifact: `{(duration_summary.get('longestArtifact') or {}).get('label') or ''}` `{(duration_summary.get('longestArtifact') or {}).get('durationLabel') or ''}`",
            ])
        lines.extend([
            f"- First evidence: `{first_existing_path(evidence)}`",
            f"- 16:9 video: `{first_existing_path(evidence, '16:9')}`",
            f"- Podcast/audio: `{first_existing_path(evidence, 'audio')}`",
            f"- Shorts folder/evidence: `{first_existing_path(evidence, 'short')}`",
            "- What Codex can do: open local evidence, summarize risks, improve notes/cards/packets, refine local review clarity, and continue other lanes if blocked.",
            "- What Charlie/Mako/Homer can do: watch/listen and mark keep/refine/hold/needs-more-evidence. This is not publication approval.",
            "- What nobody should infer: no upload, publish, schedule, approval, or platform receipt exists unless a real external URL/provider receipt is recorded.",
            "",
        ])
    lines.extend([
        "## Safety boundary",
        "",
        "- No original media or manuscripts were mutated by this blocker sheet.",
        "- No previous versions were overwritten.",
        "- No external platform action was taken.",
        "- No approval or receipt truth was created.",
        "",
    ])
    return "\n".join(lines)


def main() -> int:
    parser = argparse.ArgumentParser(description="Build current production blocker doc.")
    parser.add_argument("release_root", nargs="?", default=str(DEFAULT_RELEASE_ROOT))
    parser.add_argument("--output", default=str(DEFAULT_OUTPUT))
    args = parser.parse_args()
    release_root = Path(args.release_root).expanduser().resolve()
    output = Path(args.output).expanduser().resolve()
    brief = load_pointer_target(DEFAULT_BRIEF_POINTER)
    review = load_json(DEFAULT_REVIEW_POINTER)
    duration_warning = load_pointer_target(release_root / "review-board/duration-warning-packets/latest-duration-warning-review-packet.json")
    pointer_validation = load_pointer_target(DEFAULT_POINTER_CONTRACT_VALIDATION_POINTER)
    review_theater = load_pointer_target(release_root / "review-board/studio-review-theater/latest-studio-review-theater.json")
    package_desk = load_pointer_target(release_root / "review-board/latest-studio-package-quality-desk.json")
    shorts_batch = load_pointer_target(release_root / "review-board/shorts-review-batches/latest-shorts-review-batch.json")
    duration_matrix = load_pointer_target(release_root / "review-board/duration-experiment-matrix/latest-duration-experiment-matrix.json")
    duration_workorders = load_pointer_target(release_root / "review-board/duration-version-workorders/latest-duration-version-workorders.json")
    duration_recipes = load_pointer_target(release_root / "review-board/duration-edit-recipes/latest-duration-edit-recipe-skeletons.json")
    transcript_sources = load_pointer_target(release_root / "review-board/transcript-source-workorders/latest-transcript-source-workorders.json")
    transcript_execution = load_pointer_target(DEFAULT_TRANSCRIPT_EXECUTION_READINESS_POINTER)
    transcript_pilot = load_pointer_target(DEFAULT_TRANSCRIPT_PILOT_POINTER)
    transcript_review_workbench = load_pointer_target(DEFAULT_TRANSCRIPT_REVIEW_WORKBENCH_POINTER)
    transcript_review_decision_ledger = load_pointer_target(DEFAULT_TRANSCRIPT_REVIEW_DECISION_LEDGER_POINTER)
    daily_writing_readiness = load_pointer_target(DEFAULT_DAILY_WRITING_READINESS_POINTER)
    payload = build_payload(release_root, brief, review, duration_warning, pointer_validation, review_theater, package_desk, shorts_batch, duration_matrix, duration_workorders, duration_recipes, transcript_sources, transcript_execution, transcript_pilot, transcript_review_workbench, transcript_review_decision_ledger, daily_writing_readiness, output)
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(render_markdown(payload) + "\n", encoding="utf-8")
    json_path = release_root / "review-board" / "current-production-blockers.json"
    json_path.parent.mkdir(parents=True, exist_ok=True)
    payload["jsonPath"] = str(json_path)
    payload["markdownPath"] = str(output)
    json_path.write_text(json.dumps(payload, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    DEFAULT_OS_BLOCKER_POINTER.parent.mkdir(parents=True, exist_ok=True)
    DEFAULT_OS_BLOCKER_POINTER.write_text(json.dumps(payload, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    print(json.dumps(payload, indent=2, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
