#!/usr/bin/env python3
"""Build the Shorts Review Start Here board.

This is the front door for the current native shorts review ladder. It does not
create a new review system; it points humans and agents at the existing command
room, theater, focused packet, evidence drafts, index, and ledger with honest
truth boundaries.
"""
from __future__ import annotations

import argparse
import html
import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


DEFAULT_ROOT = Path("/Volumes/My Passport/Episode_and_Shorts_Test")
DEFAULT_OUTPUT_DIR = DEFAULT_ROOT / "shorts-command-room" / "start-here"
DEFAULT_COMMAND_ROOM_JSON = DEFAULT_ROOT / "shorts-command-room" / "quipsly-studio-shorts-command-room.json"
DEFAULT_THEATER_JSON = (
    DEFAULT_ROOT
    / "shorts-command-room"
    / "recommended-review-theater"
    / "quipsly-studio-recommended-shorts-review-theater.json"
)
DEFAULT_THEATER_HTML = DEFAULT_THEATER_JSON.with_suffix(".html")
DEFAULT_EVIDENCE_INDEX_JSON = (
    DEFAULT_ROOT
    / "shorts-command-room"
    / "recommended-review-packets"
    / "evidence-draft-index"
    / "quipsly-studio-short-evidence-draft-index.json"
)
DEFAULT_EVIDENCE_INDEX_HTML = DEFAULT_EVIDENCE_INDEX_JSON.with_suffix(".html")
DEFAULT_TRANSCRIPT_READINESS_JSON = (
    DEFAULT_ROOT
    / "shorts-command-room"
    / "transcript-readiness"
    / "quipsly-studio-shorts-transcript-readiness.json"
)
DEFAULT_TRANSCRIPT_READINESS_HTML = DEFAULT_TRANSCRIPT_READINESS_JSON.with_suffix(".html")
DEFAULT_TRANSCRIPT_WORKORDERS_JSON = (
    DEFAULT_ROOT
    / "shorts-command-room"
    / "transcript-workorders"
    / "quipsly-studio-shorts-transcript-workorders.json"
)
DEFAULT_TRANSCRIPT_WORKORDERS_HTML = DEFAULT_TRANSCRIPT_WORKORDERS_JSON.with_suffix(".html")
DEFAULT_TRANSCRIPT_INTAKE_INDEX_JSON = (
    DEFAULT_ROOT
    / "shorts-command-room"
    / "transcript-intake"
    / "index"
    / "quipsly-studio-shorts-transcript-intake-index.json"
)
DEFAULT_TRANSCRIPT_INTAKE_INDEX_HTML = DEFAULT_TRANSCRIPT_INTAKE_INDEX_JSON.with_suffix(".html")
DEFAULT_TRANSCRIPT_INTAKE_WORKBENCH_JSON = (
    DEFAULT_ROOT
    / "shorts-command-room"
    / "transcript-intake"
    / "workbench"
    / "quipsly-studio-shorts-transcript-intake-workbench.json"
)
DEFAULT_TRANSCRIPT_INTAKE_WORKBENCH_HTML = DEFAULT_TRANSCRIPT_INTAKE_WORKBENCH_JSON.with_suffix(".html")
DEFAULT_TRANSCRIPT_REVIEW_COCKPIT_JSON = (
    DEFAULT_ROOT
    / "shorts-command-room"
    / "transcript-review-cockpit"
    / "quipsly-studio-shorts-transcript-review-cockpit.json"
)
DEFAULT_TRANSCRIPT_REVIEW_COCKPIT_HTML = DEFAULT_TRANSCRIPT_REVIEW_COCKPIT_JSON.with_suffix(".html")
DEFAULT_CUT_QUALITY_JSON = (
    DEFAULT_ROOT
    / "shorts-command-room"
    / "cut-quality-workbench"
    / "quipsly-studio-shorts-cut-quality-workbench.json"
)
DEFAULT_CUT_QUALITY_HTML = DEFAULT_CUT_QUALITY_JSON.with_suffix(".html")
DEFAULT_SEMANTIC_REVIEW_QUEUE_JSON = (
    DEFAULT_ROOT
    / "shorts-command-room"
    / "semantic-review-queue"
    / "quipsly-studio-shorts-semantic-review-queue.json"
)
DEFAULT_SEMANTIC_REVIEW_QUEUE_HTML = DEFAULT_SEMANTIC_REVIEW_QUEUE_JSON.with_suffix(".html")
DEFAULT_SEMANTIC_EDIT_CANDIDATES_JSON = (
    DEFAULT_ROOT
    / "shorts-command-room"
    / "semantic-edit-candidates"
    / "quipsly-studio-shorts-semantic-edit-candidates.json"
)
DEFAULT_SEMANTIC_EDIT_CANDIDATES_HTML = DEFAULT_SEMANTIC_EDIT_CANDIDATES_JSON.with_suffix(".html")
DEFAULT_SEMANTIC_EDIT_AUDITION_INDEX_JSON = (
    DEFAULT_ROOT
    / "shorts-command-room"
    / "semantic-edit-auditions"
    / "index"
    / "quipsly-studio-shorts-semantic-edit-audition-index.json"
)
DEFAULT_SEMANTIC_EDIT_AUDITION_INDEX_HTML = DEFAULT_SEMANTIC_EDIT_AUDITION_INDEX_JSON.with_suffix(".html")
DEFAULT_RECIPE_REPAIR_QUEUE_JSON = (
    DEFAULT_ROOT
    / "shorts-command-room"
    / "recipe-repair-queue"
    / "quipsly-studio-shorts-recipe-repair-queue.json"
)
DEFAULT_RECIPE_REPAIR_QUEUE_HTML = DEFAULT_RECIPE_REPAIR_QUEUE_JSON.with_suffix(".html")
DEFAULT_LINEAGE_AUDIT_JSON = (
    DEFAULT_ROOT
    / "shorts-command-room"
    / "lineage-audit"
    / "quipsly-studio-shorts-lineage-audit.json"
)
DEFAULT_LINEAGE_AUDIT_HTML = DEFAULT_LINEAGE_AUDIT_JSON.with_suffix(".html")
DEFAULT_LINEAGE_BACKFILL_JSON = (
    DEFAULT_ROOT
    / "shorts-command-room"
    / "lineage-backfill"
    / "quipsly-studio-shorts-lineage-backfill.json"
)
DEFAULT_LINEAGE_BACKFILL_HTML = DEFAULT_LINEAGE_BACKFILL_JSON.with_suffix(".html")
DEFAULT_CONTACT_SHEET_INDEX_JSON = (
    DEFAULT_ROOT
    / "shorts-command-room"
    / "cut-quality-contact-sheets"
    / "index"
    / "quipsly-studio-shorts-cut-quality-contact-sheet-index.json"
)
DEFAULT_CONTACT_SHEET_INDEX_HTML = DEFAULT_CONTACT_SHEET_INDEX_JSON.with_suffix(".html")
DEFAULT_AUDIO_PROBE_INDEX_JSON = (
    DEFAULT_ROOT
    / "shorts-command-room"
    / "cut-quality-audio-probes"
    / "index"
    / "quipsly-studio-shorts-cut-quality-audio-probe-index.json"
)
DEFAULT_AUDIO_PROBE_INDEX_HTML = DEFAULT_AUDIO_PROBE_INDEX_JSON.with_suffix(".html")
DEFAULT_REVIEW_PACKET_INDEX_JSON = (
    DEFAULT_ROOT
    / "shorts-command-room"
    / "cut-quality-review-packets"
    / "index"
    / "quipsly-studio-shorts-cut-quality-review-packet-index.json"
)
DEFAULT_REVIEW_PACKET_INDEX_HTML = DEFAULT_REVIEW_PACKET_INDEX_JSON.with_suffix(".html")
DEFAULT_POLISH_COCKPIT_INDEX_JSON = (
    DEFAULT_ROOT
    / "shorts-command-room"
    / "cut-quality-polish-cockpits"
    / "index"
    / "quipsly-studio-shorts-cut-quality-polish-cockpit-index.json"
)
DEFAULT_POLISH_COCKPIT_INDEX_HTML = DEFAULT_POLISH_COCKPIT_INDEX_JSON.with_suffix(".html")
DEFAULT_POLISH_TRIAGE_JSON = (
    DEFAULT_ROOT
    / "shorts-command-room"
    / "cut-quality-polish-triage"
    / "quipsly-studio-shorts-cut-quality-polish-triage.json"
)
DEFAULT_POLISH_TRIAGE_HTML = DEFAULT_POLISH_TRIAGE_JSON.with_suffix(".html")
DEFAULT_WORKSHEET_INDEX_JSON = (
    DEFAULT_ROOT
    / "shorts-command-room"
    / "cut-quality-worksheets"
    / "index"
    / "quipsly-studio-shorts-cut-quality-worksheet-index.json"
)
DEFAULT_WORKSHEET_INDEX_HTML = DEFAULT_WORKSHEET_INDEX_JSON.with_suffix(".html")
DEFAULT_EVIDENCE_PREVIEW_INDEX_JSON = (
    DEFAULT_ROOT
    / "shorts-command-room"
    / "cut-quality-evidence-previews"
    / "index"
    / "quipsly-studio-shorts-cut-quality-evidence-preview-index.json"
)
DEFAULT_EVIDENCE_PREVIEW_INDEX_HTML = DEFAULT_EVIDENCE_PREVIEW_INDEX_JSON.with_suffix(".html")
DEFAULT_LEDGER_JSON = (
    DEFAULT_ROOT
    / "review-board"
    / "studio-short-review-decision-ledger"
    / "studio-short-review-decision-ledger.json"
)
DEFAULT_LEDGER_HTML = DEFAULT_LEDGER_JSON.with_suffix(".html")
DEFAULT_ACTIVE_SOURCE_MAP = Path("/Users/wall-e/Dev/high-ground-studio/apps/QuipslyStudio/docs/coordination/active-source-map.md")
SCHEMA = "quipsly.studio.shorts-review-start-here.v1"
VERSION = "2026-07-02.v1"


def iso_now() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat()


def esc(value: Any) -> str:
    return html.escape(str(value if value is not None else ""))


def read_json(path: Path) -> dict[str, Any]:
    if not path.exists():
        return {}
    with path.open("r", encoding="utf-8") as handle:
        data = json.load(handle)
    return data if isinstance(data, dict) else {}


def shell_quote(value: str) -> str:
    return "'" + value.replace("'", "'\"'\"'") + "'"


def file_uri(path: Path) -> str:
    try:
        return path.expanduser().resolve().as_uri()
    except ValueError:
        return ""


def artifact_status(path: Path) -> dict[str, Any]:
    return {
        "path": str(path),
        "exists": path.exists(),
        "openCommand": f"open {shell_quote(str(path))}" if path.exists() else "",
        "fileUri": file_uri(path) if path.exists() else "",
    }


def first_recommendation(command_room: dict[str, Any], theater: dict[str, Any]) -> dict[str, Any]:
    for item in theater.get("items", []):
        if isinstance(item, dict):
            return item
    for item in command_room.get("recommendedNextShorts", []):
        if isinstance(item, dict):
            return item
    return {}


def first_evidence(index: dict[str, Any]) -> dict[str, Any]:
    for item in index.get("latestByShort", []):
        if isinstance(item, dict):
            return item
    return {}


def packet_paths(root: Path, short_id: str) -> dict[str, dict[str, Any]]:
    if not short_id:
        return {}
    packet_dir = root / "shorts-command-room" / "recommended-review-packets" / short_id
    return {
        "folder": artifact_status(packet_dir),
        "json": artifact_status(packet_dir / "recommended-short-review-packet.json"),
        "markdown": artifact_status(packet_dir / "recommended-short-review-packet.md"),
        "html": artifact_status(packet_dir / "recommended-short-review-packet.html"),
    }


def counts_from(command_room: dict[str, Any], theater: dict[str, Any], transcript: dict[str, Any], workorders: dict[str, Any], transcript_intake_index: dict[str, Any], transcript_intake_workbench: dict[str, Any], transcript_review_cockpit: dict[str, Any], cut_quality: dict[str, Any], semantic_queue: dict[str, Any], semantic_candidates: dict[str, Any], semantic_audition_index: dict[str, Any], recipe_repair: dict[str, Any], lineage_audit: dict[str, Any], lineage_backfill: dict[str, Any], contact_sheet_index: dict[str, Any], audio_probe_index: dict[str, Any], review_packet_index: dict[str, Any], polish_cockpit_index: dict[str, Any], polish_triage: dict[str, Any], worksheet_index: dict[str, Any], evidence_preview_index: dict[str, Any], index: dict[str, Any], ledger: dict[str, Any]) -> dict[str, Any]:
    totals = command_room.get("totals") if isinstance(command_room.get("totals"), dict) else {}
    theater_counts = theater.get("counts") if isinstance(theater.get("counts"), dict) else {}
    transcript_counts = transcript.get("counts") if isinstance(transcript.get("counts"), dict) else {}
    workorder_counts = workorders.get("counts") if isinstance(workorders.get("counts"), dict) else {}
    transcript_intake_counts = transcript_intake_index.get("counts") if isinstance(transcript_intake_index.get("counts"), dict) else {}
    transcript_intake_workbench_counts = transcript_intake_workbench.get("counts") if isinstance(transcript_intake_workbench.get("counts"), dict) else {}
    transcript_review_cockpit_counts = transcript_review_cockpit.get("counts") if isinstance(transcript_review_cockpit.get("counts"), dict) else {}
    cut_quality_counts = cut_quality.get("counts") if isinstance(cut_quality.get("counts"), dict) else {}
    semantic_counts = semantic_queue.get("counts") if isinstance(semantic_queue.get("counts"), dict) else {}
    semantic_candidate_counts = semantic_candidates.get("counts") if isinstance(semantic_candidates.get("counts"), dict) else {}
    semantic_audition_counts = semantic_audition_index.get("counts") if isinstance(semantic_audition_index.get("counts"), dict) else {}
    recipe_repair_counts = recipe_repair.get("counts") if isinstance(recipe_repair.get("counts"), dict) else {}
    lineage_counts = lineage_audit.get("counts") if isinstance(lineage_audit.get("counts"), dict) else {}
    lineage_backfill_counts = lineage_backfill.get("counts") if isinstance(lineage_backfill.get("counts"), dict) else {}
    contact_sheet_counts = contact_sheet_index.get("counts") if isinstance(contact_sheet_index.get("counts"), dict) else {}
    audio_probe_counts = audio_probe_index.get("counts") if isinstance(audio_probe_index.get("counts"), dict) else {}
    review_packet_counts = review_packet_index.get("counts") if isinstance(review_packet_index.get("counts"), dict) else {}
    cockpit_counts = polish_cockpit_index.get("counts") if isinstance(polish_cockpit_index.get("counts"), dict) else {}
    polish_triage_counts = polish_triage.get("counts") if isinstance(polish_triage.get("counts"), dict) else {}
    worksheet_counts = worksheet_index.get("counts") if isinstance(worksheet_index.get("counts"), dict) else {}
    preview_counts = evidence_preview_index.get("counts") if isinstance(evidence_preview_index.get("counts"), dict) else {}
    index_counts = index.get("counts") if isinstance(index.get("counts"), dict) else {}
    ledger_counts = ledger.get("counts") if isinstance(ledger.get("counts"), dict) else {}
    return {
        "episodesInCommandRoom": len(command_room.get("episodes", [])) if isinstance(command_room.get("episodes"), list) else 0,
        "nativeShorts": totals.get("nativeShorts") or totals.get("shorts") or 0,
        "recommendedShorts": len(command_room.get("recommendedNextShorts", [])) if isinstance(command_room.get("recommendedNextShorts"), list) else theater_counts.get("items", 0),
        "theaterItems": theater_counts.get("items", 0),
        "playableTheaterItems": theater_counts.get("playable", 0),
        "transcriptReadinessItems": transcript_counts.get("items", 0),
        "timedCaptionsAvailable": transcript_counts.get("timedCaptionsAvailable", 0),
        "normalizedTranscriptEditReview": transcript_counts.get("normalizedTranscriptEditReview", 0),
        "machineDraftWordEvidence": transcript_counts.get("machineDraftWordEvidence", 0),
        "missingWordEvidence": transcript_counts.get("missingWordEvidence", 0),
        "placeholderWordEvidence": transcript_counts.get("placeholderWordEvidence", 0),
        "transcriptWorkorders": workorder_counts.get("workorders", 0),
        "createOrLinkWordEvidence": workorder_counts.get("createOrLinkWordEvidence", 0),
        "useNormalizedTranscriptForEditReview": workorder_counts.get("useNormalizedTranscriptForEditReview", 0),
        "reviewMachineDraftWordEvidence": workorder_counts.get("reviewMachineDraftWordEvidence", 0),
        "transcriptIntakeShorts": transcript_intake_counts.get("shortsWithIntake", 0),
        "transcriptIntakeAudioReady": transcript_intake_counts.get("audioReadyForAsr", 0),
        "transcriptIntakeNeedsAudio": transcript_intake_counts.get("needsAudioIntake", 0),
        "transcriptIntakeWorkbenchItems": transcript_intake_workbench_counts.get("items", 0),
        "transcriptIntakeWorksheets": transcript_intake_workbench_counts.get("worksheetsExisting", 0),
        "transcriptAsrDrafts": transcript_intake_workbench_counts.get("asrDraftTranscriptsExisting", 0),
        "transcriptReviewCockpitItems": transcript_review_cockpit_counts.get("items", 0),
        "transcriptAcceptedForEditReview": transcript_review_cockpit_counts.get("acceptedForEditReview", 0),
        "transcriptMachineDraftNeedsReview": transcript_review_cockpit_counts.get("machineDraftNeedsReview", 0),
        "transcriptReviewLedgerEvents": transcript_review_cockpit_counts.get("ledgerEvents", 0),
        "cutQualityItems": cut_quality_counts.get("items", 0),
        "watchListenFirst": cut_quality_counts.get("watchListenFirst", 0),
        "captionTimingReview": cut_quality_counts.get("captionTimingReview", 0),
        "semanticReviewQueueItems": semantic_counts.get("items", 0),
        "semanticGenericOpenerRisk": semantic_counts.get("genericOpenerRisk", 0),
        "semanticAbruptEndingRisk": semantic_counts.get("abruptEndingRisk", 0),
        "semanticReviewableHookCandidate": semantic_counts.get("reviewableHookCandidate", 0),
        "semanticEditCandidateItems": semantic_candidate_counts.get("items", 0),
        "semanticTestStrongerInPoint": semantic_candidate_counts.get("testStrongerInPoint", 0),
        "semanticCheckEarlierOutPoint": semantic_candidate_counts.get("checkEarlierOutPoint", 0),
        "semanticEditAuditions": semantic_audition_counts.get("auditions", 0),
        "semanticRenderedAuditions": semantic_audition_counts.get("renderedPreviews", 0),
        "semanticWarningAuditions": semantic_audition_counts.get("warningAuditions", 0),
        "recipeRepairItems": recipe_repair_counts.get("items", 0),
        "recipeNeedsNewSourceSpan": recipe_repair_counts.get("needsNewSourceSpan", 0),
        "recipeNeedsAuditionPreview": recipe_repair_counts.get("needsAuditionPreview", 0),
        "recipeMissingSourceRange": recipe_repair_counts.get("missingSourceRange", 0),
        "lineageAuditItems": lineage_counts.get("items", 0),
        "lineageTraceableShorts": lineage_counts.get("traceableShorts", 0),
        "lineageMissingSourceRange": lineage_counts.get("missingSourceRange", 0),
        "lineageNeedsBackfill": lineage_counts.get("needsBackfill", 0),
        "lineageBackfillItems": lineage_backfill_counts.get("items", 0),
        "lineageBackfilled": lineage_backfill_counts.get("backfilled", 0),
        "lineageInferredBackfill": lineage_backfill_counts.get("inferredBackfill", 0),
        "lineagePartialBackfill": lineage_backfill_counts.get("partialBackfill", 0),
        "lineageBackfillWithSequenceRange": lineage_backfill_counts.get("withSequenceRange", 0),
        "lineageBackfillWithSourceLane": lineage_backfill_counts.get("withSourceLane", 0),
        "lineageBackfillWithInferredSourceLane": lineage_backfill_counts.get("withInferredSourceLane", 0),
        "lineageHighConfidenceInference": lineage_backfill_counts.get("highConfidenceInference", 0),
        "lineageMediumConfidenceInference": lineage_backfill_counts.get("mediumConfidenceInference", 0),
        "cutQualityContactSheets": contact_sheet_counts.get("contactSheets", 0),
        "shortsWithCutQualityContactSheets": contact_sheet_counts.get("shortsWithContactSheets", 0),
        "cutQualityContactSheetFrames": contact_sheet_counts.get("latestFramesCreated", 0),
        "cutQualityAudioProbes": audio_probe_counts.get("audioProbes", 0),
        "shortsWithCutQualityAudioProbes": audio_probe_counts.get("shortsWithAudioProbes", 0),
        "cutQualityAudioProbeWarnings": audio_probe_counts.get("latestWarnings", 0),
        "cutQualityReviewPackets": review_packet_counts.get("reviewPackets", 0),
        "shortsWithCutQualityReviewPackets": review_packet_counts.get("shortsWithReviewPackets", 0),
        "cutQualityReviewPacketsEvidenceComplete": review_packet_counts.get("latestEvidenceComplete", 0),
        "cutQualityPolishCockpits": cockpit_counts.get("cockpits", 0),
        "shortsWithCutQualityPolishCockpits": cockpit_counts.get("shortsWithCockpits", 0),
        "cutQualityPolishCockpitsCompleteDoors": cockpit_counts.get("latestCompleteDoors", 0),
        "cutQualityPolishCockpitNotesRecorded": cockpit_counts.get("latestNotesRecorded", 0),
        "cutQualityPolishCockpitDecisionsRecorded": cockpit_counts.get("latestDecisionsRecorded", 0),
        "cutQualityPolishTriageItems": polish_triage_counts.get("items", 0),
        "cutQualityPolishTriageNotesRecorded": polish_triage_counts.get("notesRecorded", 0),
        "cutQualityPolishTriageDecisionsRecorded": polish_triage_counts.get("decisionsRecorded", 0),
        "cutQualityWorksheets": worksheet_counts.get("worksheets", 0),
        "shortsWithCutQualityWorksheets": worksheet_counts.get("shortsWithWorksheets", 0),
        "cutQualityReviewEvidenceNotes": worksheet_counts.get("reviewEvidenceNotes", 0),
        "cutQualitySystemCheckNotes": worksheet_counts.get("systemCheckNotes", 0),
        "cutQualityEvidencePreviews": preview_counts.get("previews", 0),
        "shortsWithCutQualityEvidencePreviews": preview_counts.get("shortsWithPreviews", 0),
        "cutQualityEvidencePreviewsReady": preview_counts.get("latestReadyForEvidenceDraft", 0),
        "cutQualityEvidencePreviewsNeedNotes": preview_counts.get("latestNeedsReviewEvidenceNotes", 0),
        "evidenceDrafts": index_counts.get("drafts", 0),
        "shortsWithEvidenceDrafts": index_counts.get("shortsWithDrafts", 0),
        "evidenceReadyForRecordedIntent": index_counts.get("specificEnoughForRecordedIntent", 0),
        "ledgerItems": ledger_counts.get("items", 0),
        "ledgerPending": ledger_counts.get("pending", 0),
        "ledgerRecorded": ledger_counts.get("decisionsRecorded", 0),
        "approvalCreated": False,
        "externalPublishing": False,
        "receiptTruthCreated": False,
    }


def command_ladder(root: Path, first_short_id: str) -> list[dict[str, Any]]:
    root_arg = str(root)
    short_flag = f" --short-id {shell_quote(first_short_id)}" if first_short_id else ""
    return [
        {
            "step": "0",
            "label": "Check the active-source map",
            "intent": "Confirm the active product surface before following an old path or prompt.",
            "command": "script/agentctl.sh active-source-map",
            "mutates": "Nothing. Orientation only.",
        },
        {
            "step": "1",
            "label": "Refresh the command room",
            "intent": "Rebuild the cross-episode native shorts map.",
            "command": f"script/agentctl.sh studio-shorts-command-room --root {shell_quote(root_arg)} --max-embed-per-episode 8",
            "mutates": "Generated local review artifacts only.",
        },
        {
            "step": "2",
            "label": "Open the recommended shorts theater",
            "intent": "Watch the recommended shorts in one place before deciding.",
            "command": "script/agentctl.sh studio-recommended-shorts-review-theater",
            "mutates": "Generated local review artifacts only.",
        },
        {
            "step": "3",
            "label": "Ask what to watch next",
            "intent": "Get one short with media facts and a watch-first checklist.",
            "command": "script/agentctl.sh studio-recommended-short-next",
            "mutates": "Nothing. Routing only.",
        },
        {
            "step": "4",
            "label": "Build a focused review packet",
            "intent": "Open one short with structured quality questions.",
            "command": f"script/agentctl.sh studio-recommended-short-review-packet{short_flag}",
            "mutates": "Generated local review artifacts only.",
        },
        {
            "step": "5",
            "label": "Check transcript and caption readiness",
            "intent": "See whether recommended shorts have word evidence before caption-aware review.",
            "command": "script/agentctl.sh studio-shorts-transcript-readiness",
            "mutates": "Generated local readiness artifacts only.",
        },
        {
            "step": "6",
            "label": "Build transcript and caption workorders",
            "intent": "Turn missing or weak word evidence into sidecar tasks with clear destinations.",
            "command": "script/agentctl.sh studio-shorts-transcript-workorders",
            "mutates": "Generated local workorder artifacts only.",
        },
        {
            "step": "6a",
            "label": "Prepare transcript intake audio",
            "intent": "Extract safe local audio sidecars from current short exports so ASR/manual transcript work has concrete inputs.",
            "command": "script/agentctl.sh studio-shorts-transcript-intake-batch --limit 12",
            "mutates": "Generated local transcript-intake audio sidecars and manifests only. Source media is not mutated.",
        },
        {
            "step": "6a-index",
            "label": "Index transcript intake packets",
            "intent": "Make the latest audio sidecar per short visible before running ASR or manual transcript work.",
            "command": "script/agentctl.sh studio-shorts-transcript-intake-index",
            "mutates": "Generated local transcript-intake index artifacts only.",
        },
        {
            "step": "6a-next",
            "label": "Pick the next transcript target",
            "intent": "Select one audio-ready short that still needs normalized transcript truth.",
            "command": "script/agentctl.sh studio-shorts-transcript-intake-next --json",
            "mutates": "Nothing. Routing only.",
        },
        {
            "step": "6a-workbench",
            "label": "Open transcript intake workbench",
            "intent": "Listen to ASR-ready audio sidecars and see the planned transcript/caption sidecar destinations without treating intake as truth.",
            "command": "script/agentctl.sh studio-shorts-transcript-intake-workbench --all",
            "mutates": "Generated local workbench and missing worksheet files only. Source media and transcript truth are not mutated.",
        },
        {
            "step": "6a-asr-draft",
            "label": "Create one ASR draft",
            "intent": "Run local Whisper on one audio-ready short to create raw provider output and draft transcript/caption sidecars for review.",
            "command": "script/agentctl.sh studio-shorts-transcript-asr-draft --run-asr --model base",
            "mutates": "Generated local ASR draft sidecars only. Reviewed transcript truth, source media, approvals, and publication receipts are not mutated.",
        },
        {
            "step": "6a-review-promote",
            "label": "Review/promote one transcript draft",
            "intent": "Record whether one machine transcript draft is accepted for edit review, needs correction, or should be held.",
            "command": "script/agentctl.sh studio-shorts-transcript-review-promote --record-review --outcome accept-for-edit-review --json",
            "mutates": "Writes a local review ledger event and, only for accept-for-edit-review, a normalized transcript sidecar. Source media, final caption approval, and publication receipts are not mutated.",
        },
        {
            "step": "6a-review-cockpit",
            "label": "Open transcript review cockpit",
            "intent": "Review all ASR drafts in one place with audio, draft text, normalized sidecar state, and copyable accept/hold/correction commands.",
            "command": "script/agentctl.sh studio-shorts-transcript-review-cockpit --all",
            "mutates": "Generated local cockpit artifacts only. It records no review by itself and mutates no source media.",
        },
        {
            "step": "6b",
            "label": "Open the cut-quality workbench",
            "intent": "Ask better watch/listen questions about hook, cadence, J/L cuts, jump cuts, reactions, captions, crop, and platform fit.",
            "command": "script/agentctl.sh studio-shorts-cut-quality-workbench",
            "mutates": "Generated local editorial-question artifacts only.",
        },
        {
            "step": "6c",
            "label": "Pick the next cut-quality target",
            "intent": "Get one short with exact watch/listen questions and safe evidence-draft commands.",
            "command": "script/agentctl.sh studio-shorts-cut-quality-next",
            "mutates": "Nothing. Routing only.",
        },
        {
            "step": "6c-semantic",
            "label": "Open semantic review queue",
            "intent": "Use ASR samples and cut-quality evidence to spot weak hooks, abrupt endings, cadence risks, and caption-review needs without treating machine text as final truth.",
            "command": "script/agentctl.sh studio-shorts-semantic-review-queue --all",
            "mutates": "Generated local semantic review artifacts only. It records no decisions and changes no edits.",
        },
        {
            "step": "6c-candidates",
            "label": "Open semantic edit candidates",
            "intent": "Convert semantic risks into timestamped in/out tests that can be auditioned before any timeline decision changes.",
            "command": "script/agentctl.sh studio-shorts-semantic-edit-candidates --all",
            "mutates": "Generated local edit-candidate artifacts only. It records no decisions and changes no edits.",
        },
        {
            "step": "6c-audition",
            "label": "Create/index semantic audition preview",
            "intent": "Render a versioned local preview for one candidate only after dry-run review, then index the audition so humans and agents can inspect it without treating it as a final export.",
            "command": "script/agentctl.sh studio-shorts-semantic-edit-audition --dry-run && script/agentctl.sh studio-shorts-semantic-edit-audition-index --all",
            "mutates": "Dry-run mutates nothing; index generates local index artifacts only. Rendering requires explicit --render-preview and still does not mutate source media or timeline decisions.",
        },
        {
            "step": "6c-repair",
            "label": "Open short recipe repair queue",
            "intent": "Turn failed auditions and missing source-range evidence into calm next actions, such as choosing a better source span instead of polishing a doomed short.",
            "command": "script/agentctl.sh studio-shorts-recipe-repair-queue --all",
            "mutates": "Generated local repair-queue artifacts only. It records no decisions and changes no edits.",
        },
        {
            "step": "6d",
            "label": "Create a visual contact sheet",
            "intent": "Extract timestamped review frames for hook, crop, caption safety, jump-cut risk, reaction beats, and platform fit.",
            "command": "script/agentctl.sh studio-shorts-cut-quality-contact-sheet",
            "mutates": "Creates versioned local visual review artifacts only.",
        },
        {
            "step": "6e",
            "label": "Index visual contact sheets",
            "intent": "Find the latest visual evidence packet per short so reviewers do not dig through timestamped folders.",
            "command": "script/agentctl.sh studio-shorts-cut-quality-contact-sheet-index",
            "mutates": "Generated local contact-sheet index artifacts only.",
        },
        {
            "step": "6f",
            "label": "Create an audio/cadence probe",
            "intent": "Measure pause density, loudness, waveform shape, and cadence risks before deciding whether a short feels human or over-tight.",
            "command": "script/agentctl.sh studio-shorts-cut-quality-audio-probe",
            "mutates": "Creates versioned local audio/cadence evidence artifacts only.",
        },
        {
            "step": "6g",
            "label": "Index audio/cadence probes",
            "intent": "Find the latest cadence evidence per short so reviewers can compare pause/loudness facts without digging through folders.",
            "command": "script/agentctl.sh studio-shorts-cut-quality-audio-probe-index",
            "mutates": "Generated local audio-probe index artifacts only.",
        },
        {
            "step": "6h",
            "label": "Build one-short review packet",
            "intent": "Merge playable media, visual frames, waveform, pause facts, questions, and note commands into one review cockpit.",
            "command": "script/agentctl.sh studio-shorts-cut-quality-review-packet",
            "mutates": "Creates a versioned local review packet only.",
        },
        {
            "step": "6i",
            "label": "Index one-short review packets",
            "intent": "Find the latest merged review cockpit per short so reviewers start from the clearest evidence surface.",
            "command": "script/agentctl.sh studio-shorts-cut-quality-review-packet-index",
            "mutates": "Generated local review-packet index artifacts only.",
        },
        {
            "step": "6j",
            "label": "Batch-build cut-quality evidence",
            "intent": "Generate missing contact sheets, audio probes, merged review packets, and indexes for the next ranked shorts without approving or publishing anything.",
            "command": "script/agentctl.sh studio-shorts-cut-quality-batch --limit 4",
            "mutates": "Generated local evidence artifacts and batch report artifacts only.",
        },
        {
            "step": "6k",
            "label": "Rank refinement candidates",
            "intent": "Use completed review packets to choose which shorts should be polished first, which need cadence surgery, and which should wait for human-feel review.",
            "command": "script/agentctl.sh studio-shorts-cut-quality-refinement-queue",
            "mutates": "Generated local refinement queue artifacts only.",
        },
        {
            "step": "6l",
            "label": "Create polish workorder",
            "intent": "Turn one ranked short's frames, waveform, cadence facts, and platform checks into concrete hook/crop/caption/audio/cadence refinement tasks.",
            "command": "script/agentctl.sh studio-shorts-cut-quality-polish-workorder",
            "mutates": "Generated local polish workorder artifacts only.",
        },
        {
            "step": "6m",
            "label": "Preview polish note commands",
            "intent": "Show suggested worksheet note commands from the polish workorder without recording them, so reviewers only copy commands after watch/listen confirmation.",
            "command": "script/agentctl.sh studio-shorts-cut-quality-polish-note-preview",
            "mutates": "Generated local note-preview artifacts only.",
        },
        {
            "step": "6n",
            "label": "Open one-short polish cockpit",
            "intent": "Put the playable short, frame, waveform, workorder tasks, note-preview commands, and review doors into one review surface.",
            "command": "script/agentctl.sh studio-shorts-cut-quality-polish-cockpit",
            "mutates": "Generated local polish cockpit artifacts only.",
        },
        {
            "step": "6n-index",
            "label": "Index polish cockpits",
            "intent": "Find the latest one-short polish cockpit per short so humans and agents can open the next review door without digging through timestamped folders.",
            "command": "script/agentctl.sh studio-shorts-cut-quality-polish-cockpit-index",
            "mutates": "Generated local polish-cockpit index artifacts only.",
        },
        {
            "step": "6n-batch",
            "label": "Batch-prepare polish cockpits",
            "intent": "Create missing polish workorders, worksheets, note-preview bridges, cockpits, and cockpit indexes for the next ranked shorts without recording decisions.",
            "command": "script/agentctl.sh studio-shorts-cut-quality-polish-batch --limit 4",
            "mutates": "Generated local polish batch, worksheet, workorder, note-preview, cockpit, and index artifacts only.",
        },
        {
            "step": "6n-triage",
            "label": "Open polish triage",
            "intent": "Group cockpit-ready shorts by polish lane and show what to inspect first without recording decisions.",
            "command": "script/agentctl.sh studio-shorts-cut-quality-polish-triage",
            "mutates": "Generated local polish triage artifacts only.",
        },
        {
            "step": "6o",
            "label": "Create a cut-quality worksheet",
            "intent": "Make a versioned worksheet for hook, cadence, J/L cut, jump-cut, reaction, caption, crop, audio, ending, platform, and tradeoff notes.",
            "command": "script/agentctl.sh studio-shorts-cut-quality-worksheet",
            "mutates": "Creates a versioned local worksheet artifact only.",
        },
        {
            "step": "6p",
            "label": "Index cut-quality worksheets",
            "intent": "Find the latest worksheet per short and see which review fields are still empty.",
            "command": "script/agentctl.sh studio-shorts-cut-quality-worksheet-index",
            "mutates": "Generated local worksheet index artifacts only.",
        },
        {
            "step": "6q",
            "label": "Capture a cut-quality field note",
            "intent": "Create a versioned sidecar note for a specific worksheet field without recording approval.",
            "command": "script/agentctl.sh studio-shorts-cut-quality-note --field hook --note '<specific watch/listen evidence>'",
            "mutates": "Creates a versioned local note sidecar only.",
        },
        {
            "step": "6r",
            "label": "Preview evidence from worksheet notes",
            "intent": "Summarize captured review-evidence notes into an evidence-draft command preview without recording intent.",
            "command": "script/agentctl.sh studio-shorts-cut-quality-evidence-preview",
            "mutates": "Creates a versioned local preview artifact only.",
        },
        {
            "step": "6s",
            "label": "Index evidence previews",
            "intent": "Find the latest evidence preview per short and see whether it is ready or waiting on notes.",
            "command": "script/agentctl.sh studio-shorts-cut-quality-evidence-preview-index",
            "mutates": "Generated local evidence-preview index artifacts only.",
        },
        {
            "step": "7",
            "label": "Write an evidence draft",
            "intent": "Turn watch/listen observations into reusable editing intelligence.",
            "command": f"script/agentctl.sh studio-recommended-short-evidence-draft{short_flag} --outcome refine --summary 'Specific watch/listen evidence goes here.'",
            "mutates": "Creates a versioned evidence draft beside the packet.",
        },
        {
            "step": "8",
            "label": "Index evidence drafts",
            "intent": "See which drafts are ready for dry-run or recorded local intent.",
            "command": "script/agentctl.sh studio-short-evidence-draft-index",
            "mutates": "Generated local index artifacts only.",
        },
        {
            "step": "9",
            "label": "Preflight the next draft",
            "intent": "Preview the exact ledger command and mutation contract.",
            "command": "script/agentctl.sh studio-short-evidence-draft-record --json",
            "mutates": "Nothing. Preflight does not invoke the ledger.",
        },
        {
            "step": "9b",
            "label": "Audit source lineage",
            "intent": "Check whether playable shorts can still be traced back to whole-source episode timing and recipe identity.",
            "command": "script/agentctl.sh studio-shorts-lineage-audit --all",
            "mutates": "Nothing. Lineage audit creates local navigation artifacts only.",
        },
        {
            "step": "9c",
            "label": "Backfill lineage from saved sessions",
            "intent": "Recover sequence ranges and recipe identity from saved shortClipQueue sidecars without touching rendered files.",
            "command": "script/agentctl.sh studio-shorts-lineage-backfill --all",
            "mutates": "Nothing. Backfill writes sidecar evidence only.",
        },
        {
            "step": "10",
            "label": "Dry-run the local ledger",
            "intent": "Ask ledger code what would happen without changing it.",
            "command": "script/agentctl.sh studio-short-evidence-draft-record --dry-run --json",
            "mutates": "Nothing expected. Dry-run should report no ledger mutation.",
        },
        {
            "step": "11",
            "label": "Record local review intent only when ready",
            "intent": "Store keep/refine/hold/reject/needs-more-evidence in the local ledger.",
            "command": "script/agentctl.sh studio-short-evidence-draft-record --record --json",
            "mutates": "Local short review decision ledger only.",
        },
    ]


def build_board(
    root: Path,
    output_dir: Path,
    command_room_json: Path,
    theater_json: Path,
    theater_html: Path,
    transcript_readiness_json: Path,
    transcript_readiness_html: Path,
    transcript_workorders_json: Path,
    transcript_workorders_html: Path,
    transcript_intake_index_json: Path,
    transcript_intake_index_html: Path,
    transcript_intake_workbench_json: Path,
    transcript_intake_workbench_html: Path,
    transcript_review_cockpit_json: Path,
    transcript_review_cockpit_html: Path,
    cut_quality_json: Path,
    cut_quality_html: Path,
    semantic_review_queue_json: Path,
    semantic_review_queue_html: Path,
    semantic_edit_candidates_json: Path,
    semantic_edit_candidates_html: Path,
    semantic_edit_audition_index_json: Path,
    semantic_edit_audition_index_html: Path,
    recipe_repair_queue_json: Path,
    recipe_repair_queue_html: Path,
    lineage_audit_json: Path,
    lineage_audit_html: Path,
    lineage_backfill_json: Path,
    lineage_backfill_html: Path,
    contact_sheet_index_json: Path,
    contact_sheet_index_html: Path,
    audio_probe_index_json: Path,
    audio_probe_index_html: Path,
    review_packet_index_json: Path,
    review_packet_index_html: Path,
    polish_cockpit_index_json: Path,
    polish_cockpit_index_html: Path,
    polish_triage_json: Path,
    polish_triage_html: Path,
    worksheet_index_json: Path,
    worksheet_index_html: Path,
    evidence_preview_index_json: Path,
    evidence_preview_index_html: Path,
    evidence_index_json: Path,
    evidence_index_html: Path,
    ledger_json: Path,
    ledger_html: Path,
    active_source_map: Path,
) -> dict[str, Any]:
    command_room = read_json(command_room_json)
    theater = read_json(theater_json)
    transcript = read_json(transcript_readiness_json)
    workorders = read_json(transcript_workorders_json)
    transcript_intake_index = read_json(transcript_intake_index_json)
    transcript_intake_workbench = read_json(transcript_intake_workbench_json)
    transcript_review_cockpit = read_json(transcript_review_cockpit_json)
    cut_quality = read_json(cut_quality_json)
    semantic_queue = read_json(semantic_review_queue_json)
    semantic_candidates = read_json(semantic_edit_candidates_json)
    semantic_audition_index = read_json(semantic_edit_audition_index_json)
    recipe_repair = read_json(recipe_repair_queue_json)
    lineage_audit = read_json(lineage_audit_json)
    lineage_backfill = read_json(lineage_backfill_json)
    contact_sheet_index = read_json(contact_sheet_index_json)
    audio_probe_index = read_json(audio_probe_index_json)
    review_packet_index = read_json(review_packet_index_json)
    polish_cockpit_index = read_json(polish_cockpit_index_json)
    polish_triage = read_json(polish_triage_json)
    worksheet_index = read_json(worksheet_index_json)
    evidence_preview_index = read_json(evidence_preview_index_json)
    index = read_json(evidence_index_json)
    ledger = read_json(ledger_json)
    recommendation = first_recommendation(command_room, theater)
    evidence = first_evidence(index)
    short_id = str(recommendation.get("shortId") or evidence.get("shortId") or "")
    counts = counts_from(command_room, theater, transcript, workorders, transcript_intake_index, transcript_intake_workbench, transcript_review_cockpit, cut_quality, semantic_queue, semantic_candidates, semantic_audition_index, recipe_repair, lineage_audit, lineage_backfill, contact_sheet_index, audio_probe_index, review_packet_index, polish_cockpit_index, polish_triage, worksheet_index, evidence_preview_index, index, ledger)
    artifacts = {
        "commandRoomJson": artifact_status(command_room_json),
        "commandRoomHtml": artifact_status(command_room_json.with_suffix(".html")),
        "recommendedTheaterJson": artifact_status(theater_json),
        "recommendedTheaterHtml": artifact_status(theater_html),
        "transcriptReadinessJson": artifact_status(transcript_readiness_json),
        "transcriptReadinessHtml": artifact_status(transcript_readiness_html),
        "transcriptWorkordersJson": artifact_status(transcript_workorders_json),
        "transcriptWorkordersHtml": artifact_status(transcript_workorders_html),
        "transcriptIntakeIndexJson": artifact_status(transcript_intake_index_json),
        "transcriptIntakeIndexHtml": artifact_status(transcript_intake_index_html),
        "transcriptIntakeWorkbenchJson": artifact_status(transcript_intake_workbench_json),
        "transcriptIntakeWorkbenchHtml": artifact_status(transcript_intake_workbench_html),
        "transcriptReviewCockpitJson": artifact_status(transcript_review_cockpit_json),
        "transcriptReviewCockpitHtml": artifact_status(transcript_review_cockpit_html),
        "cutQualityJson": artifact_status(cut_quality_json),
        "cutQualityHtml": artifact_status(cut_quality_html),
        "semanticReviewQueueJson": artifact_status(semantic_review_queue_json),
        "semanticReviewQueueHtml": artifact_status(semantic_review_queue_html),
        "semanticEditCandidatesJson": artifact_status(semantic_edit_candidates_json),
        "semanticEditCandidatesHtml": artifact_status(semantic_edit_candidates_html),
        "semanticEditAuditionIndexJson": artifact_status(semantic_edit_audition_index_json),
        "semanticEditAuditionIndexHtml": artifact_status(semantic_edit_audition_index_html),
        "recipeRepairQueueJson": artifact_status(recipe_repair_queue_json),
        "recipeRepairQueueHtml": artifact_status(recipe_repair_queue_html),
        "lineageAuditJson": artifact_status(lineage_audit_json),
        "lineageAuditHtml": artifact_status(lineage_audit_html),
        "lineageBackfillJson": artifact_status(lineage_backfill_json),
        "lineageBackfillHtml": artifact_status(lineage_backfill_html),
        "cutQualityContactSheetIndexJson": artifact_status(contact_sheet_index_json),
        "cutQualityContactSheetIndexHtml": artifact_status(contact_sheet_index_html),
        "cutQualityAudioProbeIndexJson": artifact_status(audio_probe_index_json),
        "cutQualityAudioProbeIndexHtml": artifact_status(audio_probe_index_html),
        "cutQualityReviewPacketIndexJson": artifact_status(review_packet_index_json),
        "cutQualityReviewPacketIndexHtml": artifact_status(review_packet_index_html),
        "cutQualityPolishCockpitIndexJson": artifact_status(polish_cockpit_index_json),
        "cutQualityPolishCockpitIndexHtml": artifact_status(polish_cockpit_index_html),
        "cutQualityPolishTriageJson": artifact_status(polish_triage_json),
        "cutQualityPolishTriageHtml": artifact_status(polish_triage_html),
        "cutQualityWorksheetIndexJson": artifact_status(worksheet_index_json),
        "cutQualityWorksheetIndexHtml": artifact_status(worksheet_index_html),
        "cutQualityEvidencePreviewIndexJson": artifact_status(evidence_preview_index_json),
        "cutQualityEvidencePreviewIndexHtml": artifact_status(evidence_preview_index_html),
        "focusedPacket": packet_paths(root, short_id),
        "evidenceIndexJson": artifact_status(evidence_index_json),
        "evidenceIndexHtml": artifact_status(evidence_index_html),
        "shortReviewLedgerJson": artifact_status(ledger_json),
        "shortReviewLedgerHtml": artifact_status(ledger_html),
        "activeSourceMap": artifact_status(active_source_map),
    }
    paths_to_refresh = [
        label
        for label, status in artifacts.items()
        if isinstance(status, dict) and not status.get("exists")
    ]
    packet_html = artifacts.get("focusedPacket", {}).get("html", {}) if isinstance(artifacts.get("focusedPacket"), dict) else {}
    if short_id and not packet_html.get("exists"):
        paths_to_refresh.append("focusedPacket")
    return {
        "schema": SCHEMA,
        "version": VERSION,
        "generatedAt": iso_now(),
        "root": str(root),
        "outputDir": str(output_dir),
        "counts": counts,
        "firstRecommendedShort": recommendation,
        "firstEvidenceDraft": evidence,
        "artifactStatus": artifacts,
        "pathsToRefresh": sorted(set(paths_to_refresh)),
        "commandLadder": command_ladder(root, short_id),
        "currentActiveSurfaces": [
            "apps/QuipslyStudio is the active native Studio product surface for local editing, review, shorts, and production runway work.",
            "The external review/export root is /Volumes/My Passport/Episode_and_Shorts_Test for current Episode 1-6 proof packages.",
            "Shorts review truth flows through command room -> theater/next selector -> packet -> evidence draft -> evidence index -> preflight/dry-run -> explicit local ledger record.",
            "Transcript/caption readiness is evidence only: it helps hook, cadence, caption, and timing review without making text canonical.",
            "Transcript/caption workorders turn missing or weak word evidence into sidecar tasks without running ASR or creating fake transcript truth.",
            "Transcript intake packets are ASR/manual-transcript inputs only: audio sidecars do not create transcript truth until a normalized transcript sidecar is reviewed or linked.",
            "Transcript intake workbench is a review surface for sidecar routing and worksheets, not a canonical transcript store.",
            "Transcript review cockpit is generated workflow UI: it helps accept, hold, or mark correction-needed, but records no review by itself.",
            "The active-source contract lives in docs/coordination/active-source-map.md and is exposed by the running editor through agentctl active-source-map.",
            "Older app names or paths may remain as archaeological evidence, but new review work should route through these current surfaces unless an intentional migration note says otherwise.",
            "Changing the active surface is allowed when it is deliberate, documented, and proven through the narrowest useful running-app, endpoint, or script evidence.",
            "Shorts lineage audit records whether playable shorts remain traceable to whole-source sequence/source truth before we treat them as repairable production objects.",
            "Shorts lineage backfill reads saved session shortClipQueue recipes into sidecars so traceability can improve without rewriting exports or pretending rendered MP4s are canonical.",
        ],
        "truth": "Shorts Review Start Here is a local navigation board only. It records no review decision, approves nothing, publishes nothing, uploads nothing, schedules nothing, mutates no accounts, mutates no media, overwrites no exports, deletes nothing, and creates no platform receipt truth.",
        "nextSafestAction": next_action(short_id, bool(packet_html.get("exists")), bool(evidence), bool(ledger), counts),
    }


def next_action(short_id: str, packet_exists: bool, evidence_exists: bool, ledger_exists: bool, counts: dict[str, Any]) -> str:
    if int(counts.get("createOrLinkWordEvidence") or 0) > 0:
        return f"Create or link real transcript/caption word evidence for {int(counts.get('createOrLinkWordEvidence') or 0)} current recommended shorts before recording caption-aware or semantic review intent."
    if int(counts.get("reviewMachineDraftWordEvidence") or 0) > 0:
        return f"Review machine ASR/caption drafts for {int(counts.get('reviewMachineDraftWordEvidence') or 0)} current recommended shorts before promoting words into transcript truth or caption-aware edit intent."
    if not short_id:
        return "Refresh the command room and recommended shorts theater so there is a visible first short to review."
    if not packet_exists:
        return f"Generate the focused packet for {short_id}, then watch/listen before writing evidence."
    if not evidence_exists:
        return f"Open the focused packet for {short_id} and write a versioned evidence draft with specific review notes."
    if not ledger_exists:
        return "Build the local short review decision ledger before recording any review intent."
    return "Use the evidence-draft record helper in preflight mode, then dry-run, then record local intent only if the preview still matches the evidence."


def render_markdown(board: dict[str, Any]) -> str:
    lines = [
        "# Quipsly Studio shorts review: start here",
        "",
        f"Generated: `{board.get('generatedAt')}`",
        f"Root: `{board.get('root')}`",
        "",
        board.get("truth", ""),
        "",
        f"Next safest action: {board.get('nextSafestAction')}",
        "",
        "## Current active surfaces",
        "",
    ]
    for item in board.get("currentActiveSurfaces", []):
        lines.append(f"- {item}")
    lines.extend(["", "## Counts", ""])
    for key, value in board.get("counts", {}).items():
        lines.append(f"- {key}: `{value}`")
    lines.extend(["", "## First short in the lane", ""])
    rec = board.get("firstRecommendedShort") if isinstance(board.get("firstRecommendedShort"), dict) else {}
    if rec:
        lines.extend([
            f"- Short: `{rec.get('shortId')}`",
            f"- Title: {rec.get('title') or rec.get('relativePath') or 'untitled'}",
            f"- Episode: `{rec.get('episode')}`",
            f"- Duration: `{rec.get('durationLabel') or rec.get('durationSeconds')}`",
            f"- Platform fit: `{rec.get('platformFit')}`",
            f"- Reason: {rec.get('reviewPriorityReason') or rec.get('reason') or 'none'}",
        ])
    else:
        lines.append("- No recommendation found yet.")
    lines.extend(["", "## Review ladder", ""])
    for command in board.get("commandLadder", []):
        lines.extend([
            f"### {command.get('step')}. {command.get('label')}",
            "",
            command.get("intent", ""),
            "",
            f"```bash\n{command.get('command')}\n```",
            "",
            f"Mutation boundary: {command.get('mutates')}",
            "",
        ])
    lines.extend(["## Artifact doors", ""])
    for label, status in flat_artifacts(board.get("artifactStatus", {})):
        lines.append(f"- {label}: `{status.get('path')}` exists=`{status.get('exists')}`")
    return "\n".join(lines).rstrip() + "\n"


def flat_artifacts(artifacts: dict[str, Any]) -> list[tuple[str, dict[str, Any]]]:
    rows: list[tuple[str, dict[str, Any]]] = []
    for label, value in artifacts.items():
        if isinstance(value, dict) and "exists" in value:
            rows.append((label, value))
        elif isinstance(value, dict):
            for child_label, child in value.items():
                if isinstance(child, dict) and "exists" in child:
                    rows.append((f"{label}.{child_label}", child))
    return rows


def render_html(board: dict[str, Any]) -> str:
    counts = "".join(
        f"<div><strong>{esc(value)}</strong><span>{esc(key)}</span></div>"
        for key, value in board.get("counts", {}).items()
        if key
        in {
            "nativeShorts",
            "recommendedShorts",
            "theaterItems",
            "timedCaptionsAvailable",
            "normalizedTranscriptEditReview",
            "machineDraftWordEvidence",
            "missingWordEvidence",
            "placeholderWordEvidence",
            "transcriptIntakeAudioReady",
            "transcriptIntakeWorkbenchItems",
            "transcriptIntakeWorksheets",
            "transcriptAsrDrafts",
            "useNormalizedTranscriptForEditReview",
            "reviewMachineDraftWordEvidence",
            "transcriptReviewCockpitItems",
            "transcriptAcceptedForEditReview",
            "transcriptMachineDraftNeedsReview",
            "transcriptReviewLedgerEvents",
            "semanticReviewQueueItems",
            "semanticGenericOpenerRisk",
            "semanticAbruptEndingRisk",
            "semanticReviewableHookCandidate",
            "semanticEditCandidateItems",
            "semanticTestStrongerInPoint",
            "semanticCheckEarlierOutPoint",
            "semanticEditAuditions",
            "semanticRenderedAuditions",
            "semanticWarningAuditions",
            "recipeRepairItems",
            "recipeNeedsNewSourceSpan",
            "recipeNeedsAuditionPreview",
            "recipeMissingSourceRange",
            "lineageAuditItems",
            "lineageTraceableShorts",
            "lineageMissingSourceRange",
            "lineageNeedsBackfill",
            "lineageBackfillItems",
            "lineageBackfilled",
            "lineageInferredBackfill",
            "lineagePartialBackfill",
            "lineageBackfillWithSequenceRange",
            "lineageBackfillWithSourceLane",
            "lineageBackfillWithInferredSourceLane",
            "lineageHighConfidenceInference",
            "lineageMediumConfidenceInference",
            "cutQualityReviewEvidenceNotes",
            "cutQualityEvidencePreviewsReady",
            "evidenceDrafts",
            "evidenceReadyForRecordedIntent",
            "ledgerRecorded",
            "ledgerPending",
        }
    )
    surfaces = "".join(f"<li>{esc(item)}</li>" for item in board.get("currentActiveSurfaces", []))
    ladder = "".join(render_step(step) for step in board.get("commandLadder", []))
    artifact_links = "".join(render_artifact(label, status) for label, status in flat_artifacts(board.get("artifactStatus", {})))
    rec = board.get("firstRecommendedShort") if isinstance(board.get("firstRecommendedShort"), dict) else {}
    first_short = render_first_short(rec)
    return f"""<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Quipsly Studio Shorts Review Start Here</title>
  <style>
    :root {{ color-scheme: dark; --soil:#17120c; --moss:#18271d; --grove:#223927; --leaf:#8ee39a; --honey:#f3ce54; --cream:#fff1d4; --clay:#d86f57; --water:#82dce5; --line:rgba(255,241,212,.16); }}
    * {{ box-sizing:border-box; }}
    body {{ margin:0; font-family:ui-sans-serif,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif; color:var(--cream); background:radial-gradient(circle at 15% -10%,rgba(142,227,154,.2),transparent 30%),radial-gradient(circle at 90% 10%,rgba(243,206,84,.14),transparent 28%),linear-gradient(135deg,var(--moss),var(--soil)); }}
    main {{ width:min(1480px,calc(100vw - 36px)); margin:0 auto; padding:34px 0 90px; }}
    header,.panel,.step,.artifact,.truth {{ border:1px solid var(--line); border-radius:30px; background:rgba(255,241,212,.07); box-shadow:0 24px 80px rgba(0,0,0,.28); }}
    header {{ padding:32px; margin-bottom:16px; }}
    .eyebrow {{ color:var(--honey); letter-spacing:.18em; text-transform:uppercase; font-size:.78rem; font-weight:950; margin:0 0 8px; }}
    h1 {{ margin:0 0 12px; font-size:clamp(2.5rem,7vw,6rem); line-height:.88; max-width:980px; }}
    h2 {{ margin:0 0 12px; }} h3 {{ margin:0 0 8px; }}
    p,li {{ color:#e0d1b4; line-height:1.55; }} code {{ color:#ffeaa3; overflow-wrap:anywhere; }}
    .metrics {{ display:grid; grid-template-columns:repeat(auto-fit,minmax(160px,1fr)); gap:10px; margin-top:18px; }}
    .metrics div {{ border:1px solid var(--line); border-radius:18px; padding:13px; background:rgba(0,0,0,.22); }}
    .metrics strong {{ display:block; color:var(--leaf); font-size:2rem; }}
    .metrics span {{ color:#cdbf9e; text-transform:uppercase; letter-spacing:.09em; font-size:.72rem; font-weight:900; }}
    .grid {{ display:grid; grid-template-columns:minmax(320px,.9fr) minmax(420px,1.5fr); gap:16px; align-items:start; }}
    .panel,.truth {{ padding:22px; margin-bottom:16px; }}
    .truth {{ border-color:rgba(243,206,84,.34); }}
    .ladder {{ display:grid; gap:12px; }}
    .step {{ padding:18px; display:grid; grid-template-columns:56px minmax(0,1fr); gap:14px; align-items:start; }}
    .badge {{ width:44px; height:44px; border-radius:16px; display:grid; place-items:center; background:rgba(243,206,84,.18); color:var(--honey); font-weight:950; border:1px solid rgba(243,206,84,.32); }}
    .command {{ display:flex; gap:8px; align-items:center; margin-top:10px; }}
    .command code {{ flex:1; display:block; padding:11px 12px; border-radius:14px; background:rgba(0,0,0,.35); border:1px solid var(--line); }}
    button,a.button {{ border:1px solid var(--line); border-radius:999px; padding:9px 12px; background:rgba(0,0,0,.25); color:var(--cream); text-decoration:none; font-weight:900; cursor:pointer; white-space:nowrap; }}
    button:hover,a.button:hover {{ color:var(--honey); border-color:rgba(243,206,84,.55); }}
    .artifacts {{ display:grid; gap:8px; }}
    .artifact {{ padding:12px; display:grid; grid-template-columns:minmax(0,1fr) auto; gap:10px; align-items:center; }}
    .artifact strong {{ display:block; }} .artifact small {{ color:#cdbf9e; overflow-wrap:anywhere; }}
    .ok {{ color:var(--leaf); }} .missing {{ color:var(--clay); }}
    .short-card {{ border:1px solid rgba(130,220,229,.34); border-radius:22px; padding:16px; background:rgba(130,220,229,.08); }}
    .pills {{ display:flex; flex-wrap:wrap; gap:7px; margin-top:10px; }}
    .pill {{ border:1px solid var(--line); border-radius:999px; padding:7px 10px; background:rgba(0,0,0,.24); color:var(--cream); font-weight:900; font-size:.82rem; }}
    .toast {{ position:fixed; right:20px; bottom:20px; padding:12px 16px; border-radius:16px; background:rgba(24,39,29,.96); border:1px solid rgba(142,227,154,.42); color:var(--leaf); opacity:0; transform:translateY(8px); transition:.2s; }}
    .toast.show {{ opacity:1; transform:translateY(0); }}
    @media (max-width:900px) {{ .grid {{ grid-template-columns:1fr; }} .step {{ grid-template-columns:1fr; }} .command {{ flex-direction:column; align-items:stretch; }} }}
  </style>
</head>
<body>
<main>
  <header>
    <p class="eyebrow">Quipsly Studio · shorts review</p>
    <h1>Start here, then follow the honey trail.</h1>
    <p>This board is the current map for native shorts review. It tells reviewers and agents where to go next without pretending navigation is approval.</p>
    <div class="metrics">{counts}</div>
  </header>
  <section class="truth"><p><strong>Truth boundary:</strong> {esc(board.get('truth'))}</p><p><strong>Next safest action:</strong> {esc(board.get('nextSafestAction'))}</p></section>
  <section class="grid">
    <aside>
      <section class="panel">
        <p class="eyebrow">Current active surfaces</p>
        <ul>{surfaces}</ul>
      </section>
      {first_short}
      <section class="panel">
        <p class="eyebrow">Artifact doors</p>
        <div class="artifacts">{artifact_links}</div>
      </section>
    </aside>
    <section class="ladder">{ladder}</section>
  </section>
</main>
<div class="toast" id="toast">Copied</div>
<script>
const toast = document.getElementById('toast');
document.querySelectorAll('[data-copy]').forEach((button) => {{
  button.addEventListener('click', async () => {{
    const value = button.getAttribute('data-copy') || '';
    try {{
      await navigator.clipboard.writeText(value);
      toast.textContent = 'Copied command';
      toast.classList.add('show');
      setTimeout(() => toast.classList.remove('show'), 1400);
    }} catch (error) {{
      toast.textContent = 'Copy failed';
      toast.classList.add('show');
      setTimeout(() => toast.classList.remove('show'), 1400);
    }}
  }});
}});
</script>
</body>
</html>
"""


def render_first_short(row: dict[str, Any]) -> str:
    if not row:
        return """
      <section class="panel">
        <p class="eyebrow">First short</p>
        <p>No recommended short is visible yet. Refresh the command room and theater first.</p>
      </section>
"""
    fields = [
        ("Short", row.get("shortId")),
        ("Episode", row.get("episode")),
        ("Duration", row.get("durationLabel") or row.get("durationSeconds")),
        ("Platform", row.get("platformFit")),
        ("Priority", row.get("reviewPriority")),
    ]
    pills = "".join(
        f"<span class=\"pill\">{esc(label)}: {esc(value)}</span>"
        for label, value in fields
        if value is not None and value != ""
    )
    return f"""
      <section class="panel short-card">
        <p class="eyebrow">First short in the lane</p>
        <h2>{esc(row.get('title') or row.get('relativePath') or row.get('shortId'))}</h2>
        <p>{esc(row.get('reviewPriorityReason') or row.get('reason') or 'Watch before deciding.')}</p>
        <div class="pills">{pills}</div>
      </section>
"""


def render_step(step: dict[str, Any]) -> str:
    command = str(step.get("command") or "")
    return f"""
      <article class="step">
        <div class="badge">{esc(step.get('step'))}</div>
        <div>
          <h3>{esc(step.get('label'))}</h3>
          <p>{esc(step.get('intent'))}</p>
          <div class="command"><code>{esc(command)}</code><button data-copy="{esc(command)}">Copy</button></div>
          <p><strong>Mutation boundary:</strong> {esc(step.get('mutates'))}</p>
        </div>
      </article>
"""


def render_artifact(label: str, status: dict[str, Any]) -> str:
    exists = bool(status.get("exists"))
    path = str(status.get("path") or "")
    open_command = str(status.get("openCommand") or "")
    link = f"<a class=\"button\" href=\"{esc(status.get('fileUri'))}\">Open</a>" if status.get("fileUri") else ""
    copy = f"<button data-copy=\"{esc(open_command)}\">Copy open</button>" if open_command else ""
    state = "ready" if exists else "missing"
    return f"""
      <div class="artifact">
        <div><strong>{esc(label)} <span class="{state}">{'ready' if exists else 'missing'}</span></strong><small>{esc(path)}</small></div>
        <div>{link}{copy}</div>
      </div>
"""


def write_outputs(board: dict[str, Any], output_dir: Path, basename: str) -> dict[str, str]:
    output_dir.mkdir(parents=True, exist_ok=True)
    json_path = output_dir / f"{basename}.json"
    md_path = output_dir / f"{basename}.md"
    html_path = output_dir / f"{basename}.html"
    board["artifactPaths"] = {
        "folder": str(output_dir),
        "json": str(json_path),
        "markdown": str(md_path),
        "html": str(html_path),
    }
    json_path.write_text(json.dumps(board, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    md_path.write_text(render_markdown(board), encoding="utf-8")
    html_path.write_text(render_html(board), encoding="utf-8")
    return board["artifactPaths"]


def main() -> int:
    parser = argparse.ArgumentParser(description="Build the Quipsly Studio shorts review Start Here board.")
    parser.add_argument("--root", default=str(DEFAULT_ROOT), help="Episode export/review root.")
    parser.add_argument("--output-dir", default=str(DEFAULT_OUTPUT_DIR), help="Output folder.")
    parser.add_argument("--basename", default="quipsly-studio-shorts-review-start-here")
    parser.add_argument("--command-room", default=str(DEFAULT_COMMAND_ROOM_JSON), help="Command room JSON.")
    parser.add_argument("--theater", default=str(DEFAULT_THEATER_JSON), help="Recommended theater JSON.")
    parser.add_argument("--theater-html", default=str(DEFAULT_THEATER_HTML), help="Recommended theater HTML.")
    parser.add_argument("--transcript-readiness", default=str(DEFAULT_TRANSCRIPT_READINESS_JSON), help="Transcript readiness JSON.")
    parser.add_argument("--transcript-readiness-html", default=str(DEFAULT_TRANSCRIPT_READINESS_HTML), help="Transcript readiness HTML.")
    parser.add_argument("--transcript-workorders", default=str(DEFAULT_TRANSCRIPT_WORKORDERS_JSON), help="Transcript workorders JSON.")
    parser.add_argument("--transcript-workorders-html", default=str(DEFAULT_TRANSCRIPT_WORKORDERS_HTML), help="Transcript workorders HTML.")
    parser.add_argument("--transcript-intake-index", default=str(DEFAULT_TRANSCRIPT_INTAKE_INDEX_JSON), help="Transcript intake index JSON.")
    parser.add_argument("--transcript-intake-index-html", default=str(DEFAULT_TRANSCRIPT_INTAKE_INDEX_HTML), help="Transcript intake index HTML.")
    parser.add_argument("--transcript-intake-workbench", default=str(DEFAULT_TRANSCRIPT_INTAKE_WORKBENCH_JSON), help="Transcript intake workbench JSON.")
    parser.add_argument("--transcript-intake-workbench-html", default=str(DEFAULT_TRANSCRIPT_INTAKE_WORKBENCH_HTML), help="Transcript intake workbench HTML.")
    parser.add_argument("--transcript-review-cockpit", default=str(DEFAULT_TRANSCRIPT_REVIEW_COCKPIT_JSON), help="Transcript review cockpit JSON.")
    parser.add_argument("--transcript-review-cockpit-html", default=str(DEFAULT_TRANSCRIPT_REVIEW_COCKPIT_HTML), help="Transcript review cockpit HTML.")
    parser.add_argument("--cut-quality", default=str(DEFAULT_CUT_QUALITY_JSON), help="Cut-quality workbench JSON.")
    parser.add_argument("--cut-quality-html", default=str(DEFAULT_CUT_QUALITY_HTML), help="Cut-quality workbench HTML.")
    parser.add_argument("--semantic-review-queue", default=str(DEFAULT_SEMANTIC_REVIEW_QUEUE_JSON), help="Semantic review queue JSON.")
    parser.add_argument("--semantic-review-queue-html", default=str(DEFAULT_SEMANTIC_REVIEW_QUEUE_HTML), help="Semantic review queue HTML.")
    parser.add_argument("--semantic-edit-candidates", default=str(DEFAULT_SEMANTIC_EDIT_CANDIDATES_JSON), help="Semantic edit candidates JSON.")
    parser.add_argument("--semantic-edit-candidates-html", default=str(DEFAULT_SEMANTIC_EDIT_CANDIDATES_HTML), help="Semantic edit candidates HTML.")
    parser.add_argument("--semantic-edit-audition-index", default=str(DEFAULT_SEMANTIC_EDIT_AUDITION_INDEX_JSON), help="Semantic edit audition index JSON.")
    parser.add_argument("--semantic-edit-audition-index-html", default=str(DEFAULT_SEMANTIC_EDIT_AUDITION_INDEX_HTML), help="Semantic edit audition index HTML.")
    parser.add_argument("--recipe-repair-queue", default=str(DEFAULT_RECIPE_REPAIR_QUEUE_JSON), help="Short recipe repair queue JSON.")
    parser.add_argument("--recipe-repair-queue-html", default=str(DEFAULT_RECIPE_REPAIR_QUEUE_HTML), help="Short recipe repair queue HTML.")
    parser.add_argument("--lineage-audit", default=str(DEFAULT_LINEAGE_AUDIT_JSON), help="Short source-lineage audit JSON.")
    parser.add_argument("--lineage-audit-html", default=str(DEFAULT_LINEAGE_AUDIT_HTML), help="Short source-lineage audit HTML.")
    parser.add_argument("--lineage-backfill", default=str(DEFAULT_LINEAGE_BACKFILL_JSON), help="Short source-lineage backfill JSON.")
    parser.add_argument("--lineage-backfill-html", default=str(DEFAULT_LINEAGE_BACKFILL_HTML), help="Short source-lineage backfill HTML.")
    parser.add_argument("--contact-sheet-index", default=str(DEFAULT_CONTACT_SHEET_INDEX_JSON), help="Cut-quality contact-sheet index JSON.")
    parser.add_argument("--contact-sheet-index-html", default=str(DEFAULT_CONTACT_SHEET_INDEX_HTML), help="Cut-quality contact-sheet index HTML.")
    parser.add_argument("--audio-probe-index", default=str(DEFAULT_AUDIO_PROBE_INDEX_JSON), help="Cut-quality audio-probe index JSON.")
    parser.add_argument("--audio-probe-index-html", default=str(DEFAULT_AUDIO_PROBE_INDEX_HTML), help="Cut-quality audio-probe index HTML.")
    parser.add_argument("--review-packet-index", default=str(DEFAULT_REVIEW_PACKET_INDEX_JSON), help="Cut-quality review-packet index JSON.")
    parser.add_argument("--review-packet-index-html", default=str(DEFAULT_REVIEW_PACKET_INDEX_HTML), help="Cut-quality review-packet index HTML.")
    parser.add_argument("--polish-cockpit-index", default=str(DEFAULT_POLISH_COCKPIT_INDEX_JSON), help="Cut-quality polish-cockpit index JSON.")
    parser.add_argument("--polish-cockpit-index-html", default=str(DEFAULT_POLISH_COCKPIT_INDEX_HTML), help="Cut-quality polish-cockpit index HTML.")
    parser.add_argument("--polish-triage", default=str(DEFAULT_POLISH_TRIAGE_JSON), help="Cut-quality polish triage JSON.")
    parser.add_argument("--polish-triage-html", default=str(DEFAULT_POLISH_TRIAGE_HTML), help="Cut-quality polish triage HTML.")
    parser.add_argument("--worksheet-index", default=str(DEFAULT_WORKSHEET_INDEX_JSON), help="Cut-quality worksheet index JSON.")
    parser.add_argument("--worksheet-index-html", default=str(DEFAULT_WORKSHEET_INDEX_HTML), help="Cut-quality worksheet index HTML.")
    parser.add_argument("--evidence-preview-index", default=str(DEFAULT_EVIDENCE_PREVIEW_INDEX_JSON), help="Cut-quality evidence preview index JSON.")
    parser.add_argument("--evidence-preview-index-html", default=str(DEFAULT_EVIDENCE_PREVIEW_INDEX_HTML), help="Cut-quality evidence preview index HTML.")
    parser.add_argument("--evidence-index", default=str(DEFAULT_EVIDENCE_INDEX_JSON), help="Evidence index JSON.")
    parser.add_argument("--evidence-index-html", default=str(DEFAULT_EVIDENCE_INDEX_HTML), help="Evidence index HTML.")
    parser.add_argument("--ledger", default=str(DEFAULT_LEDGER_JSON), help="Short review ledger JSON.")
    parser.add_argument("--ledger-html", default=str(DEFAULT_LEDGER_HTML), help="Short review ledger HTML.")
    parser.add_argument("--active-source-map", default=str(DEFAULT_ACTIVE_SOURCE_MAP), help="Active source map Markdown.")
    parser.add_argument("--format", choices=["markdown", "json", "html", "all"], default="markdown")
    parser.add_argument("--markdown", dest="format", action="store_const", const="markdown")
    parser.add_argument("--json", dest="format", action="store_const", const="json")
    parser.add_argument("--html", dest="format", action="store_const", const="html")
    parser.add_argument("--all", dest="format", action="store_const", const="all")
    args = parser.parse_args()

    root = Path(args.root).expanduser()
    output_dir = Path(args.output_dir).expanduser()
    board = build_board(
        root=root,
        output_dir=output_dir,
        command_room_json=Path(args.command_room).expanduser(),
        theater_json=Path(args.theater).expanduser(),
        theater_html=Path(args.theater_html).expanduser(),
        transcript_readiness_json=Path(args.transcript_readiness).expanduser(),
        transcript_readiness_html=Path(args.transcript_readiness_html).expanduser(),
        transcript_workorders_json=Path(args.transcript_workorders).expanduser(),
        transcript_workorders_html=Path(args.transcript_workorders_html).expanduser(),
        transcript_intake_index_json=Path(args.transcript_intake_index).expanduser(),
        transcript_intake_index_html=Path(args.transcript_intake_index_html).expanduser(),
        transcript_intake_workbench_json=Path(args.transcript_intake_workbench).expanduser(),
        transcript_intake_workbench_html=Path(args.transcript_intake_workbench_html).expanduser(),
        transcript_review_cockpit_json=Path(args.transcript_review_cockpit).expanduser(),
        transcript_review_cockpit_html=Path(args.transcript_review_cockpit_html).expanduser(),
        cut_quality_json=Path(args.cut_quality).expanduser(),
        cut_quality_html=Path(args.cut_quality_html).expanduser(),
        semantic_review_queue_json=Path(args.semantic_review_queue).expanduser(),
        semantic_review_queue_html=Path(args.semantic_review_queue_html).expanduser(),
        semantic_edit_candidates_json=Path(args.semantic_edit_candidates).expanduser(),
        semantic_edit_candidates_html=Path(args.semantic_edit_candidates_html).expanduser(),
        semantic_edit_audition_index_json=Path(args.semantic_edit_audition_index).expanduser(),
        semantic_edit_audition_index_html=Path(args.semantic_edit_audition_index_html).expanduser(),
        recipe_repair_queue_json=Path(args.recipe_repair_queue).expanduser(),
        recipe_repair_queue_html=Path(args.recipe_repair_queue_html).expanduser(),
        lineage_audit_json=Path(args.lineage_audit).expanduser(),
        lineage_audit_html=Path(args.lineage_audit_html).expanduser(),
        lineage_backfill_json=Path(args.lineage_backfill).expanduser(),
        lineage_backfill_html=Path(args.lineage_backfill_html).expanduser(),
        contact_sheet_index_json=Path(args.contact_sheet_index).expanduser(),
        contact_sheet_index_html=Path(args.contact_sheet_index_html).expanduser(),
        audio_probe_index_json=Path(args.audio_probe_index).expanduser(),
        audio_probe_index_html=Path(args.audio_probe_index_html).expanduser(),
        review_packet_index_json=Path(args.review_packet_index).expanduser(),
        review_packet_index_html=Path(args.review_packet_index_html).expanduser(),
        polish_cockpit_index_json=Path(args.polish_cockpit_index).expanduser(),
        polish_cockpit_index_html=Path(args.polish_cockpit_index_html).expanduser(),
        polish_triage_json=Path(args.polish_triage).expanduser(),
        polish_triage_html=Path(args.polish_triage_html).expanduser(),
        worksheet_index_json=Path(args.worksheet_index).expanduser(),
        worksheet_index_html=Path(args.worksheet_index_html).expanduser(),
        evidence_preview_index_json=Path(args.evidence_preview_index).expanduser(),
        evidence_preview_index_html=Path(args.evidence_preview_index_html).expanduser(),
        evidence_index_json=Path(args.evidence_index).expanduser(),
        evidence_index_html=Path(args.evidence_index_html).expanduser(),
        ledger_json=Path(args.ledger).expanduser(),
        ledger_html=Path(args.ledger_html).expanduser(),
        active_source_map=Path(args.active_source_map).expanduser(),
    )
    paths = write_outputs(board, output_dir, args.basename)
    if args.format == "json":
        print(json.dumps(board, indent=2, sort_keys=True))
    elif args.format == "html":
        print(render_html(board), end="")
    elif args.format == "all":
        print(json.dumps({"ok": True, "artifactPaths": paths, "truth": board["truth"]}, indent=2, sort_keys=True))
    else:
        print(render_markdown(board), end="")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
