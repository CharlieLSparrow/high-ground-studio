#!/usr/bin/env python3
"""Build a read-only Episode 4 cut-intelligence state packet.

This is intentionally CLI-side instead of app-HTTP-side because the artifacts
live on an external drive. The app exposes canonical paths; the CLI has the
filesystem permission to enrich those paths into cue and blocker state.
"""

from __future__ import annotations

import argparse
import json
import os
import re
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


DEFAULT_START_POINTER = Path(
    "/Volumes/My Passport/Episode_and_Shorts_Test/review-board/episode4-start-here/latest-episode4-start-here.json"
)
DEFAULT_APPLY_POINTER = Path(
    "/Volumes/My Passport/Episode_and_Shorts_Test/review-board/episode4-apply-preview/latest-episode4-apply-preview.json"
)
DEFAULT_INTAKE_POINTER = Path(
    "/Volumes/My Passport/Episode_and_Shorts_Test/review-board/episode4-source-clip-intake/latest-episode4-source-clip-intake.json"
)
DEFAULT_CUE_REVIEW_POINTER = Path(
    "/Volumes/My Passport/Episode_and_Shorts_Test/review-board/episode4-source-clip-cue-review/latest-episode4-source-clip-cue-review.json"
)
DEFAULT_EDIT_INTELLIGENCE_POINTER = Path(
    "/Volumes/My Passport/Episode_and_Shorts_Test/review-board/episode4-edit-intelligence/latest-episode4-edit-intelligence.json"
)
DEFAULT_EDIT_REVIEW_LEDGER_POINTER = Path(
    "/Volumes/My Passport/Episode_and_Shorts_Test/review-board/episode4-edit-intelligence-review/latest-episode4-edit-review-ledger.json"
)
DEFAULT_EDIT_REHEARSAL_POINTER = Path(
    "/Volumes/My Passport/Episode_and_Shorts_Test/review-board/episode4-edit-rehearsal/latest-episode4-edit-rehearsal.json"
)
DEFAULT_SOURCE_PLACEHOLDER_POINTER = Path(
    "/Volumes/My Passport/Episode_and_Shorts_Test/review-board/episode4-source-placeholder-workbench/latest-episode4-source-placeholder-workbench.json"
)
DEFAULT_WATCHED_SOURCE_RECOVERY_POINTER = Path(
    "/Volumes/My Passport/Episode_and_Shorts_Test/review-board/episode4-watched-source-recovery-packet/latest-episode4-watched-source-recovery-packet.json"
)
DEFAULT_HOST_SPINE_DURATION_POINTER = Path(
    "/Volumes/My Passport/Episode_and_Shorts_Test/review-board/episode4-host-spine-duration-workbench/latest-episode4-host-spine-duration-workbench.json"
)
DEFAULT_YOUTUBE_STANDARD_RECIPE_POINTER = Path(
    "/Volumes/My Passport/Episode_and_Shorts_Test/review-board/episode4-youtube-standard-recipe/latest-episode4-youtube-standard-recipe.json"
)
DEFAULT_YOUTUBE_RECIPE_REVIEW_POINTER = Path(
    "/Volumes/My Passport/Episode_and_Shorts_Test/review-board/episode4-youtube-standard-recipe-review/latest-episode4-youtube-standard-recipe-review-ledger.json"
)
DEFAULT_RECIPE_PROOF_LISTEN_QUEUE_POINTER = Path(
    "/Volumes/My Passport/Episode_and_Shorts_Test/review-board/episode4-recipe-proof-listen-queue/latest-episode4-recipe-proof-listen-queue.json"
)
DEFAULT_DROPBOX = Path(
    "/Volumes/My Passport/Episode_and_Shorts_Test/Episode_04_Watched_Source_Clip_Dropbox/needs-human-identification"
)
DEFAULT_HANDOFF_PATH = Path(
    "/Volumes/My Passport/Episode_and_Shorts_Test/review-board/episode4-control-room-state/latest-episode4-cut-intelligence-handoff.md"
)
DROPBOX_MEDIA_SUFFIXES = {
    ".3gp",
    ".aac",
    ".aif",
    ".aiff",
    ".flac",
    ".m4a",
    ".m4v",
    ".mov",
    ".mp3",
    ".mp4",
    ".mpe",
    ".mpeg",
    ".mpg",
    ".mts",
    ".mxf",
    ".wav",
    ".webm",
}


def load_json(path: Path) -> dict[str, Any]:
    try:
        with path.open("r", encoding="utf-8") as handle:
            value = json.load(handle)
        return value if isinstance(value, dict) else {}
    except Exception:
        return {}


def pointed_payload(pointer: dict[str, Any]) -> dict[str, Any]:
    for key in ("jsonPath", "ledgerPath", "manifestPath"):
        value = pointer.get(key)
        if isinstance(value, str) and value:
            payload = load_json(Path(value))
            if payload:
                return payload
    return pointer


def dict_list(value: Any) -> list[dict[str, Any]]:
    return value if isinstance(value, list) and all(isinstance(item, dict) for item in value) else []


def as_dict(value: Any) -> dict[str, Any]:
    return value if isinstance(value, dict) else {}


def as_text(value: Any, fallback: str = "") -> str:
    if value is None:
        return fallback
    return str(value)


def dropbox_files(path: Path) -> list[str]:
    try:
        return sorted(
            [
                name
                for name in os.listdir(path)
                if not name.startswith(".") and (path / name).is_file() and Path(name).suffix.casefold() in DROPBOX_MEDIA_SUFFIXES
            ],
            key=lambda item: item.casefold(),
        )
    except Exception:
        return []


def parse_clip_recovery_items(markdown_path: str) -> list[dict[str, Any]]:
    if not markdown_path:
        return []
    try:
        text = Path(markdown_path).read_text(encoding="utf-8")
    except Exception:
        return []

    items: list[dict[str, Any]] = []
    cue_id = ""
    confidence = ""
    time_window = ""
    hit_count = ""
    evidence: list[str] = []

    def flush() -> None:
        nonlocal cue_id, confidence, time_window, hit_count, evidence
        if not cue_id:
            return
        items.append(
            {
                "cueId": cue_id,
                "confidence": confidence,
                "timeWindow": time_window or "time unknown",
                "reviewWindowLabel": time_window or "time unknown",
                "hitCount": hit_count,
                "evidence": evidence[:3],
                "suggestedFilename": f"{cue_id}-short-description.mp4",
            }
        )

    for raw_line in text.splitlines():
        line = raw_line.strip()
        if line.startswith("### ep4-cue-"):
            flush()
            title = line.replace("### ", "", 1)
            parts = title.split(" - ")
            cue_id = parts[0] if parts else ""
            confidence = parts[-1].replace(" confidence", "") if parts else ""
            time_window = ""
            hit_count = ""
            evidence = []
            continue

        if not cue_id:
            continue

        if line.startswith("- Episode review window:"):
            time_window = line.replace("- Episode review window:", "", 1).replace("`", "").strip()
        elif line.startswith("- Hit count:"):
            hit_count = line.replace("- Hit count:", "", 1).replace("`", "").strip()
        elif line.startswith("- `"):
            cleaned = re.sub(r"^- `", "", line).replace("`", "").strip()
            if "evidence words:" not in cleaned.casefold():
                evidence.append(cleaned)

    flush()
    return items


def summarize_cut_style_guide(guide: dict[str, Any]) -> dict[str, Any]:
    principles = dict_list(guide.get("principles"))
    techniques = dict_list(guide.get("techniques"))
    not_allowed = guide.get("notAllowedYet") if isinstance(guide.get("notAllowedYet"), list) else []
    return {
        "status": as_text(guide.get("status"), "missing-cut-style-guide"),
        "principleCount": len(principles),
        "techniqueCount": len(techniques),
        "principles": [
            {
                "key": as_text(item.get("key")),
                "label": as_text(item.get("label")),
                "rule": as_text(item.get("rule")),
                "riskIfIgnored": as_text(item.get("riskIfIgnored")),
            }
            for item in principles[:8]
        ],
        "techniques": [
            {
                "key": as_text(item.get("key")),
                "label": as_text(item.get("label")),
                "defaultRange": as_text(item.get("defaultRange")),
                "reviewQuestion": as_text(item.get("reviewQuestion")),
            }
            for item in techniques[:8]
        ],
        "notAllowedYet": [as_text(item) for item in not_allowed[:8]],
    }


def summarize_short_candidate(item: dict[str, Any]) -> dict[str, Any]:
    caption = as_dict(item.get("captionPlan"))
    variants = dict_list(item.get("platformVariants"))
    return {
        "id": as_text(item.get("id")),
        "rank": item.get("rank"),
        "timeLabel": as_text(item.get("timeLabel")),
        "durationSeconds": item.get("durationSeconds"),
        "confidence": as_text(item.get("confidence")),
        "score": item.get("score"),
        "summary": as_text(item.get("summary")),
        "hookType": as_text(item.get("hookType")),
        "hookDraft": as_text(item.get("hookDraft")),
        "pacingRisk": as_text(item.get("pacingRisk")),
        "captionPlan": {
            "density": as_text(caption.get("density")),
            "estimatedWords": caption.get("estimatedWords"),
            "estimatedWordsPerSecond": caption.get("estimatedWordsPerSecond"),
            "firstCaptionDraft": as_text(caption.get("firstCaptionDraft")),
            "guidance": as_text(caption.get("guidance")),
            "needsManualCaptionReview": bool(caption.get("needsManualCaptionReview")),
        },
        "platformVariants": [
            {
                "platform": as_text(variant.get("platform")),
                "targetShape": as_text(variant.get("targetShape")),
                "fit": as_text(variant.get("fit")),
                "captionStyle": as_text(variant.get("captionStyle")),
                "variantNote": as_text(variant.get("variantNote")),
            }
            for variant in variants[:6]
        ],
        "cutTechnique": as_text(item.get("cutTechnique")),
        "reviewChecklist": [as_text(row) for row in (item.get("reviewChecklist") if isinstance(item.get("reviewChecklist"), list) else [])[:8]],
        "reasons": [as_text(row) for row in (item.get("reasons") if isinstance(item.get("reasons"), list) else [])[:8]],
        "cautions": [as_text(row) for row in (item.get("cautions") if isinstance(item.get("cautions"), list) else [])[:8]],
    }


def summarize_short_review(review_payload: dict[str, Any], proposal_id: str) -> dict[str, Any]:
    reviews = as_dict(review_payload.get("reviews"))
    review = as_dict(reviews.get(proposal_id)) if proposal_id else {}
    if not review:
        return {
            "proposalId": proposal_id,
            "status": "not-reviewed",
            "decision": "pending",
            "hasTargetedShortNotes": False,
            "missingShortNoteLanes": ["hookNote", "captionNote", "platformNote", "framingNote"],
        }
    note_keys = ["hookNote", "captionNote", "platformNote", "framingNote"]
    missing = [key for key in note_keys if not as_text(review.get(key)).strip()]
    return {
        "proposalId": proposal_id,
        "status": as_text(review.get("status"), "unknown"),
        "decision": as_text(review.get("decision"), "pending"),
        "reviewer": as_text(review.get("reviewer")),
        "lastReviewedAt": as_text(review.get("lastReviewedAt")),
        "notes": as_text(review.get("notes")),
        "hookNote": as_text(review.get("hookNote")),
        "captionNote": as_text(review.get("captionNote")),
        "platformNote": as_text(review.get("platformNote")),
        "framingNote": as_text(review.get("framingNote")),
        "nextAction": as_text(review.get("nextAction")),
        "hasTargetedShortNotes": len(missing) < len(note_keys),
        "missingShortNoteLanes": missing,
    }


def summarize_rehearsal_move(move: dict[str, Any]) -> dict[str, Any]:
    caption = as_dict(move.get("captionPlan"))
    cadence = as_dict(move.get("cadenceProfile"))
    review_brief = as_dict(move.get("reviewBrief"))
    scrub_window = as_dict(review_brief.get("scrubWindow"))
    note_lanes = dict_list(review_brief.get("noteLanes"))
    decision_options = dict_list(review_brief.get("decisionOptions"))
    human_questions = review_brief.get("humanQuestions") if isinstance(review_brief.get("humanQuestions"), list) else []
    agent_evidence = (
        review_brief.get("agentEvidenceToCapture")
        if isinstance(review_brief.get("agentEvidenceToCapture"), list)
        else []
    )
    return {
        "proposalId": as_text(move.get("proposalId")),
        "rehearsalKind": as_text(move.get("rehearsalKind")),
        "proposalGroup": as_text(move.get("proposalGroup")),
        "timeLabel": as_text(move.get("timeLabel")),
        "confidence": as_text(move.get("confidence")),
        "reviewStatus": as_text(move.get("reviewStatus"), "unreviewed"),
        "reviewDecision": as_text(move.get("reviewDecision"), "pending"),
        "wouldCreate": as_text(move.get("wouldCreate")),
        "intent": as_text(move.get("intent")),
        "programMove": as_text(move.get("programMove")),
        "tradeoff": as_text(move.get("tradeoff")),
        "cadenceGuardrail": as_text(move.get("cadenceGuardrail")),
        "reviewQuestion": as_text(move.get("reviewQuestion")),
        "dryRunReviewCommand": as_text(move.get("dryRunReviewCommand")),
        "reviewCommand": as_text(move.get("reviewCommand")),
        "captionPlan": {
            "density": as_text(caption.get("density")),
            "estimatedWords": caption.get("estimatedWords"),
            "estimatedWordsPerSecond": caption.get("estimatedWordsPerSecond"),
            "guidance": as_text(caption.get("guidance")),
            "needsManualCaptionReview": bool(caption.get("needsManualCaptionReview")),
        },
        "cadenceProfile": {
            "classification": as_text(cadence.get("classification")),
            "requiresAudioReview": bool(cadence.get("requiresAudioReview")),
            "requiresVisualReview": bool(cadence.get("requiresVisualReview")),
            "recommendedMinimumBreathSeconds": cadence.get("recommendedMinimumBreathSeconds"),
            "noCutRationale": as_text(cadence.get("noCutRationale")),
        },
        "reviewBrief": {
            "status": as_text(review_brief.get("status"), "review-needed"),
            "scrubWindow": {
                "label": as_text(scrub_window.get("label")),
                "startSeconds": scrub_window.get("startSeconds"),
                "proposalStartSeconds": scrub_window.get("proposalStartSeconds"),
                "proposalEndSeconds": scrub_window.get("proposalEndSeconds"),
                "endSeconds": scrub_window.get("endSeconds"),
                "why": as_text(scrub_window.get("why")),
            },
            "noteLanes": [
                {
                    "id": as_text(lane.get("id")),
                    "label": as_text(lane.get("label")),
                    "prompt": as_text(lane.get("prompt")),
                    "flag": as_text(lane.get("flag")),
                }
                for lane in note_lanes[:8]
            ],
            "humanQuestions": [as_text(question) for question in human_questions[:8]],
            "agentEvidenceToCapture": [as_text(row) for row in agent_evidence[:8]],
            "decisionOptions": [
                {
                    "decision": as_text(option.get("decision")),
                    "whenToUse": as_text(option.get("whenToUse")),
                    "dryRunCommand": as_text(option.get("dryRunCommand")),
                    "recordCommand": as_text(option.get("recordCommand")),
                }
                for option in decision_options[:4]
            ],
            "shortcutCommands": [
                {
                    "decision": as_text(option.get("decision")),
                    "dryRun": (
                        f"./script/agentctl.sh episode4-edit-rehearsal-next-decision-dry-run {as_text(option.get('decision'))} "
                        f"--proposal-id {as_text(move.get('proposalId'))} --markdown"
                    ),
                    "record": (
                        f"./script/agentctl.sh episode4-edit-rehearsal-next-decision {as_text(option.get('decision'))} "
                        f"--proposal-id {as_text(move.get('proposalId'))} --markdown"
                    ),
                }
                for option in decision_options[:4]
                if as_text(option.get("decision"))
            ],
        },
        "rehearsalChecklist": [
            as_text(row)
            for row in (move.get("rehearsalChecklist") if isinstance(move.get("rehearsalChecklist"), list) else [])[:8]
        ],
    }


def build_payload(args: argparse.Namespace) -> dict[str, Any]:
    start_pointer = load_json(args.start_pointer)
    start_payload = pointed_payload(start_pointer)
    apply_pointer = load_json(args.apply_pointer)
    apply_payload = pointed_payload(apply_pointer)
    intake_pointer = load_json(args.intake_pointer)
    intake_payload = pointed_payload(intake_pointer)
    cue_review_pointer = load_json(args.cue_review_pointer)
    cue_review_payload = pointed_payload(cue_review_pointer)
    edit_intelligence_pointer = load_json(args.edit_intelligence_pointer)
    edit_intelligence_payload = pointed_payload(edit_intelligence_pointer)
    edit_review_ledger_pointer = load_json(args.edit_review_ledger_pointer)
    edit_review_ledger_payload = pointed_payload(edit_review_ledger_pointer)
    edit_rehearsal_pointer = load_json(args.edit_rehearsal_pointer)
    edit_rehearsal_payload = pointed_payload(edit_rehearsal_pointer)
    source_placeholder_pointer = load_json(args.source_placeholder_pointer)
    source_placeholder_payload = pointed_payload(source_placeholder_pointer)
    watched_source_recovery_pointer = load_json(args.watched_source_recovery_pointer)
    watched_source_recovery_payload = pointed_payload(watched_source_recovery_pointer)
    host_spine_duration_pointer = load_json(args.host_spine_duration_pointer)
    host_spine_duration_payload = pointed_payload(host_spine_duration_pointer)
    youtube_standard_recipe_pointer = load_json(args.youtube_standard_recipe_pointer)
    youtube_standard_recipe_payload = pointed_payload(youtube_standard_recipe_pointer)
    youtube_recipe_review_pointer = load_json(args.youtube_recipe_review_pointer)
    youtube_recipe_review_payload = pointed_payload(youtube_recipe_review_pointer)
    recipe_proof_listen_queue_pointer = load_json(args.recipe_proof_listen_queue_pointer)
    recipe_proof_listen_queue_payload = pointed_payload(recipe_proof_listen_queue_pointer)

    cards = dict_list(start_payload.get("cards"))
    shopping_card = next((card for card in cards if card.get("key") == "sourceClipShoppingList"), {})
    intake_card = next((card for card in cards if card.get("key") == "sourceClipIntake"), {})
    shopping_path = as_text(shopping_card.get("link"))
    cue_items = parse_clip_recovery_items(shopping_path)
    files = dropbox_files(args.dropbox)
    operations = dict_list(apply_payload.get("operations"))
    blocked_operations = [
        operation for operation in operations if "blocked" in as_text(operation.get("operationStatus")).casefold()
    ]
    placeholder_operations = [
        operation for operation in operations if as_text(operation.get("operationStatus")).casefold() == "source-placeholder"
    ]
    top_short_candidates = dict_list(edit_intelligence_payload.get("shortCandidates"))
    top_short_candidate = summarize_short_candidate(top_short_candidates[0]) if top_short_candidates else {}
    rehearsal_moves = dict_list(edit_rehearsal_payload.get("moves"))
    top_rehearsal_move = summarize_rehearsal_move(rehearsal_moves[0]) if rehearsal_moves else {}

    return {
        "status": "episode4_cut_intelligence_state",
        "episode": "episode-4",
        "truth": {
            "readOnly": True,
            "clipsImported": False,
            "timelineDecisionsWritten": False,
            "exportsRendered": False,
            "externalPublishing": False,
            "sourceFilesMutated": False,
            "versionsOverwritten": False,
            "sourceClipIntakeIsEvidenceGate": True,
        },
        "startHere": {
            "status": as_text(start_payload.get("status"), as_text(start_pointer.get("status"), "missing")),
            "htmlPath": as_text(start_payload.get("htmlPath"), as_text(start_pointer.get("htmlPath"))),
            "jsonPath": as_text(start_pointer.get("jsonPath")),
            "markdownPath": as_text(start_payload.get("markdownPath"), as_text(start_pointer.get("markdownPath"))),
            "nextActions": dict_list(start_payload.get("nextActions")),
        },
        "sourceClipRecovery": {
            "status": as_text(shopping_card.get("status"), "missing-source-clip-shopping-list"),
            "shoppingListPath": shopping_path,
            "dropboxPath": str(args.dropbox),
            "dropboxFileCount": len(files),
            "dropboxFiles": files[:50],
            "cueCount": len(cue_items),
            "nextCue": cue_items[0] if cue_items else {},
            "highPriorityCues": cue_items[:8],
            "safeAction": (
                "Drop likely watched/source clips into the dropbox with cue IDs in filenames, "
                "then rerun source clip intake and apply preview."
            ),
        },
        "sourceClipIntake": {
            "status": as_text(intake_payload.get("status"), as_text(intake_card.get("status"), "missing-source-clip-intake-card")),
            "htmlPath": as_text(intake_payload.get("htmlPath"), as_text(intake_pointer.get("htmlPath"))),
            "recoveryHtmlPath": as_text(intake_payload.get("recoveryHtmlPath"), as_text(intake_pointer.get("recoveryHtmlPath"))),
            "recoveryMarkdownPath": as_text(
                intake_payload.get("recoveryMarkdownPath"),
                as_text(intake_pointer.get("recoveryMarkdownPath")),
            ),
            "jsonPath": as_text(intake_pointer.get("jsonPath")),
            "counts": as_dict(intake_payload.get("counts")) or as_dict(intake_card.get("counts")),
            "nextActions": dict_list(intake_payload.get("nextActions")) or dict_list(intake_pointer.get("nextActions")),
            "cueRecoveryChecklist": dict_list(intake_payload.get("cueRecoveryChecklist"))[:12]
            or dict_list(intake_pointer.get("cueRecoveryChecklist"))[:12],
            "safeAction": as_text(intake_card.get("safeAction"), "If empty, do not weave clips yet."),
        },
        "sourceClipCueReview": {
            "status": as_text(cue_review_payload.get("status"), as_text(cue_review_pointer.get("status"), "missing-source-clip-cue-review")),
            "htmlPath": as_text(cue_review_payload.get("htmlPath"), as_text(cue_review_pointer.get("htmlPath"))),
            "markdownPath": as_text(cue_review_payload.get("markdownPath"), as_text(cue_review_pointer.get("markdownPath"))),
            "jsonPath": as_text(cue_review_pointer.get("jsonPath")),
            "dropRoot": as_text(cue_review_payload.get("dropRoot"), as_text(cue_review_pointer.get("dropRoot"), str(args.dropbox.parent))),
            "needsHumanIdentificationFolder": as_text(
                cue_review_payload.get("needsHumanIdentificationFolder"),
                as_text(cue_review_pointer.get("needsHumanIdentificationFolder"), str(args.dropbox)),
            ),
            "reviewItemCount": cue_review_payload.get("reviewItemCount", cue_review_pointer.get("reviewItemCount", len(dict_list(cue_review_payload.get("reviewItems"))))),
            "extractAudio": cue_review_payload.get("extractAudio", cue_review_pointer.get("extractAudio")),
            "audioReviewClipCount": sum(1 for item in dict_list(cue_review_payload.get("reviewItems")) if as_dict(item.get("audioReviewClip")).get("ok")),
            "firstReviewItem": summarize_cue_review_items(cue_review_payload, limit=1)[0]
            if summarize_cue_review_items(cue_review_payload, limit=1)
            else {},
            "reviewItems": summarize_cue_review_items(cue_review_payload),
            "safeAction": "Open cue review to hear/read the transcript windows and identify missing watched/source clips.",
        },
        "editIntelligence": {
            "status": as_text(
                edit_intelligence_payload.get("status"),
                as_text(edit_intelligence_pointer.get("status"), "missing-edit-intelligence"),
            ),
            "htmlPath": as_text(edit_intelligence_payload.get("htmlPath"), as_text(edit_intelligence_pointer.get("htmlPath"))),
            "markdownPath": as_text(
                edit_intelligence_payload.get("markdownPath"),
                as_text(edit_intelligence_pointer.get("markdownPath")),
            ),
            "jsonPath": as_text(edit_intelligence_pointer.get("jsonPath")),
            "counts": as_dict(edit_intelligence_payload.get("counts")) or as_dict(edit_intelligence_pointer.get("counts")),
            "cutStyleGuide": summarize_cut_style_guide(as_dict(edit_intelligence_payload.get("cutStyleGuide"))),
            "topShortCandidate": top_short_candidate,
            "topShortReview": summarize_short_review(edit_review_ledger_payload, as_text(top_short_candidate.get("id"))),
            "reviewLedger": {
                "status": as_text(
                    edit_review_ledger_payload.get("status"),
                    as_text(edit_review_ledger_pointer.get("status"), "missing-edit-review-ledger"),
                ),
                "htmlPath": as_text(edit_review_ledger_payload.get("htmlPath"), as_text(edit_review_ledger_pointer.get("htmlPath"))),
                "markdownPath": as_text(
                    edit_review_ledger_payload.get("markdownPath"),
                    as_text(edit_review_ledger_pointer.get("markdownPath")),
                ),
                "ledgerPath": as_text(
                    edit_review_ledger_payload.get("ledgerPath"),
                    as_text(edit_review_ledger_pointer.get("ledgerPath")),
                ),
                "counts": as_dict(edit_review_ledger_payload.get("counts")) or as_dict(edit_review_ledger_pointer.get("counts")),
            },
            "nextSafestAction": as_text(
                edit_intelligence_payload.get("nextSafestAction"),
                as_text(edit_intelligence_pointer.get("nextSafestAction")),
            ),
            "safeAction": "Use this board to review suggested edit moves, technique labels, tradeoffs, and human-feeling cut rules before writing metadata.",
        },
        "editRehearsal": {
            "status": as_text(
                edit_rehearsal_payload.get("status"),
                as_text(edit_rehearsal_pointer.get("status"), "missing-edit-rehearsal"),
            ),
            "htmlPath": as_text(edit_rehearsal_payload.get("htmlPath"), as_text(edit_rehearsal_pointer.get("htmlPath"))),
            "markdownPath": as_text(
                edit_rehearsal_payload.get("markdownPath"),
                as_text(edit_rehearsal_pointer.get("markdownPath")),
            ),
            "jsonPath": as_text(edit_rehearsal_pointer.get("jsonPath")),
            "counts": as_dict(edit_rehearsal_payload.get("counts")) or as_dict(edit_rehearsal_pointer.get("counts")),
            "truth": as_dict(edit_rehearsal_payload.get("truth")) or as_dict(edit_rehearsal_pointer.get("truth")),
            "topMove": top_rehearsal_move,
            "nextSafestAction": as_text(
                edit_rehearsal_payload.get("nextSafestAction"),
                as_text(
                    edit_rehearsal_pointer.get("nextSafestAction"),
                    "Open the edit rehearsal board and review one reversible move before applying metadata.",
                ),
            ),
            "safeAction": (
                "Use rehearsal to scrub and explain one concrete program move at a time; "
                "record review decisions before apply-preview promotion."
            ),
        },
        "sourcePlaceholderWorkbench": {
            "status": as_text(
                source_placeholder_payload.get("status"),
                as_text(source_placeholder_pointer.get("status"), "missing-source-placeholder-workbench"),
            ),
            "htmlPath": as_text(source_placeholder_payload.get("htmlPath"), as_text(source_placeholder_pointer.get("htmlPath"))),
            "markdownPath": as_text(
                source_placeholder_payload.get("markdownPath"),
                as_text(source_placeholder_pointer.get("markdownPath")),
            ),
            "jsonPath": as_text(source_placeholder_pointer.get("jsonPath")),
            "counts": as_dict(source_placeholder_payload.get("counts")) or as_dict(source_placeholder_pointer.get("counts")),
            "itemCount": len(dict_list(source_placeholder_payload.get("items"))),
            "nextSafestAction": as_text(
                source_placeholder_payload.get("nextSafestAction"),
                as_text(source_placeholder_pointer.get("nextSafestAction")),
            ),
            "safeAction": "Open the placeholder workbench to keep Episode 4 edit intent visible while watched clips are recovered.",
        },
        "watchedSourceRecoveryPacket": {
            "status": as_text(
                watched_source_recovery_payload.get("status"),
                as_text(watched_source_recovery_pointer.get("status"), "missing-watched-source-recovery-packet"),
            ),
            "htmlPath": as_text(watched_source_recovery_payload.get("htmlPath"), as_text(watched_source_recovery_pointer.get("htmlPath"))),
            "markdownPath": as_text(
                watched_source_recovery_payload.get("markdownPath"),
                as_text(watched_source_recovery_pointer.get("markdownPath")),
            ),
            "jsonPath": as_text(watched_source_recovery_payload.get("jsonPath"), as_text(watched_source_recovery_pointer.get("jsonPath"))),
            "dropboxPath": as_text(
                watched_source_recovery_payload.get("dropboxPath"),
                as_text(watched_source_recovery_pointer.get("dropboxPath"), str(args.dropbox)),
            ),
            "counts": as_dict(watched_source_recovery_payload.get("counts")) or as_dict(watched_source_recovery_pointer.get("counts")),
            "nextSafestAction": as_text(
                watched_source_recovery_payload.get("nextSafestAction"),
                as_text(watched_source_recovery_pointer.get("nextSafestAction")),
            ),
            "safeAction": "Open the recovery packet while re-watching Episode 4; copy confirmed watched/source clips into the dropbox with cue IDs.",
        },
        "hostSpineDurationWorkbench": {
            "status": as_text(
                host_spine_duration_payload.get("status"),
                as_text(host_spine_duration_pointer.get("status"), "missing-host-spine-duration-workbench"),
            ),
            "htmlPath": as_text(host_spine_duration_payload.get("htmlPath"), as_text(host_spine_duration_pointer.get("htmlPath"))),
            "markdownPath": as_text(
                host_spine_duration_payload.get("markdownPath"),
                as_text(host_spine_duration_pointer.get("markdownPath")),
            ),
            "jsonPath": as_text(host_spine_duration_pointer.get("jsonPath")),
            "variantCount": host_spine_duration_payload.get(
                "variantCount",
                host_spine_duration_pointer.get("variantCount", len(dict_list(host_spine_duration_payload.get("variants")))),
            ),
            "spine": as_dict(host_spine_duration_payload.get("spine")),
            "nextSafestAction": as_text(
                host_spine_duration_payload.get("nextSafestAction"),
                as_text(host_spine_duration_pointer.get("nextSafestAction")),
            ),
            "safeAction": (
                "Open the duration workbench to choose a metadata-only Episode 4 length recipe "
                "without waiting on missing watched/source clips."
            ),
        },
        "youtubeStandardRecipe": {
            "status": as_text(
                youtube_standard_recipe_payload.get("status"),
                as_text(youtube_standard_recipe_pointer.get("status"), "missing-youtube-standard-recipe"),
            ),
            "htmlPath": as_text(youtube_standard_recipe_payload.get("htmlPath"), as_text(youtube_standard_recipe_pointer.get("htmlPath"))),
            "markdownPath": as_text(
                youtube_standard_recipe_payload.get("markdownPath"),
                as_text(youtube_standard_recipe_pointer.get("markdownPath")),
            ),
            "jsonPath": as_text(youtube_standard_recipe_pointer.get("jsonPath")),
            "branch": as_dict(youtube_standard_recipe_payload.get("branch"))
            or as_dict(youtube_standard_recipe_pointer.get("branch")),
            "durationPlan": as_dict(youtube_standard_recipe_payload.get("durationPlan"))
            or as_dict(youtube_standard_recipe_pointer.get("durationPlan")),
            "operationCounts": as_dict(youtube_standard_recipe_payload.get("operationCounts"))
            or as_dict(youtube_standard_recipe_pointer.get("operationCounts")),
            "nextSafestAction": as_text(
                youtube_standard_recipe_payload.get("nextSafestAction"),
                as_text(youtube_standard_recipe_pointer.get("nextSafestAction")),
            ),
            "safeAction": (
                "Open the YouTube-standard recipe to review metadata-only SHOW/SKIP/cadence/reaction/source-placeholder operations."
            ),
        },
        "youtubeRecipeReviewLedger": {
            "status": as_text(
                youtube_recipe_review_payload.get("status"),
                as_text(youtube_recipe_review_pointer.get("status"), "missing-youtube-recipe-review-ledger"),
            ),
            "htmlPath": as_text(youtube_recipe_review_payload.get("htmlPath"), as_text(youtube_recipe_review_pointer.get("htmlPath"))),
            "markdownPath": as_text(
                youtube_recipe_review_payload.get("markdownPath"),
                as_text(youtube_recipe_review_pointer.get("markdownPath")),
            ),
            "ledgerPath": as_text(
                youtube_recipe_review_payload.get("ledgerPath"),
                as_text(youtube_recipe_review_pointer.get("ledgerPath")),
            ),
            "branch": as_dict(youtube_recipe_review_payload.get("branch"))
            or as_dict(youtube_recipe_review_pointer.get("branch")),
            "durationPlan": as_dict(youtube_recipe_review_payload.get("durationPlan"))
            or as_dict(youtube_recipe_review_pointer.get("durationPlan")),
            "counts": as_dict(youtube_recipe_review_payload.get("counts"))
            or as_dict(youtube_recipe_review_pointer.get("counts")),
            "nextSafestAction": as_text(
                youtube_recipe_review_payload.get("nextSafestAction"),
                as_text(youtube_recipe_review_pointer.get("nextSafestAction")),
            ),
            "safeAction": (
                "Record keep/refine/reject/needs-listen decisions in the sidecar ledger before any recipe operation becomes branch metadata."
            ),
        },
        "recipeProofListenQueue": {
            "status": as_text(
                recipe_proof_listen_queue_payload.get("status"),
                as_text(recipe_proof_listen_queue_pointer.get("status"), "missing-recipe-proof-listen-queue"),
            ),
            "htmlPath": as_text(recipe_proof_listen_queue_payload.get("htmlPath"), as_text(recipe_proof_listen_queue_pointer.get("htmlPath"))),
            "markdownPath": as_text(
                recipe_proof_listen_queue_payload.get("markdownPath"),
                as_text(recipe_proof_listen_queue_pointer.get("markdownPath")),
            ),
            "jsonPath": as_text(recipe_proof_listen_queue_payload.get("jsonPath"), as_text(recipe_proof_listen_queue_pointer.get("jsonPath"))),
            "branch": as_dict(recipe_proof_listen_queue_payload.get("branch"))
            or as_dict(recipe_proof_listen_queue_pointer.get("branch")),
            "counts": as_dict(recipe_proof_listen_queue_payload.get("counts"))
            or as_dict(recipe_proof_listen_queue_pointer.get("counts")),
            "nextSafestAction": as_text(
                recipe_proof_listen_queue_payload.get("nextSafestAction"),
                as_text(recipe_proof_listen_queue_pointer.get("nextSafestAction")),
            ),
            "safeAction": "Open the proof-listen queue to review cadence, reaction covers, J/L cut hints, and when not to cut.",
        },
        "applyPreview": {
            "status": as_text(apply_payload.get("status"), as_text(apply_pointer.get("status"), "missing")),
            "htmlPath": as_text(apply_payload.get("htmlPath"), as_text(apply_pointer.get("htmlPath"))),
            "jsonPath": as_text(apply_pointer.get("jsonPath")),
            "counts": as_dict(apply_payload.get("counts")),
            "blockedOperationCount": len(blocked_operations),
            "blockedOperations": blocked_operations[:8],
            "sourcePlaceholderOperationCount": len(placeholder_operations),
            "sourcePlaceholderOperations": placeholder_operations[:8],
            "nextSafestAction": as_text(
                apply_payload.get("nextSafestAction"),
                as_text(apply_pointer.get("nextSafestAction"), "Recover source clips before applying clip-weave metadata."),
            ),
        },
        "agentNextActions": [
            "Open the Cuts workbench and review Episode 4 Control Room.",
            "If dropboxFileCount is zero, ask for or locate watched/source clips rather than inventing them.",
            "Use `script/agentctl.sh episode4-watched-source-recovery-packet` while re-watching Episode 4 to identify missing watched/source clips.",
            "Use `script/agentctl.sh episode4-source-clip-review --extract-audio` for the direct cue audio/text review packet.",
            "After files are dropped, run `script/agentctl.sh episode4-source-clip-intake` then `script/agentctl.sh episode4-apply-preview`.",
            "Use `script/agentctl.sh episode4-host-spine-duration-workbench` to plan Episode 4 length variants while source placeholders remain unresolved.",
            "Use `script/agentctl.sh episode4-youtube-standard-recipe` to generate the first 35-45 minute metadata-only recipe.",
            "Use `script/agentctl.sh episode4-youtube-recipe-review-ledger` to preserve review decisions for recipe operations.",
            "Use `script/agentctl.sh episode4-recipe-proof-listen-queue` to review human-feeling cut rhythm before branch promotion.",
            "Use `script/agentctl.sh episode4-edit-rehearsal` to turn top proposals into concrete reversible moves before apply-preview.",
            "Only convert reviewed operations into metadata branches after source intake confirms the media.",
        ],
    }


def md_line(value: Any, fallback: str = "unknown") -> str:
    text = as_text(value, fallback).strip()
    return text if text else fallback


def render_evidence(lines: list[Any], limit: int = 3) -> list[str]:
    result: list[str] = []
    for item in lines[:limit]:
        text = md_line(item, "").replace("\n", " ").strip()
        if text:
            result.append(f"  - {text}")
    return result or ["  - No transcript evidence recorded yet."]


def summarize_cue_review_items(payload: dict[str, Any], limit: int = 8) -> list[dict[str, Any]]:
    items: list[dict[str, Any]] = []
    for item in dict_list(payload.get("reviewItems"))[:limit]:
        audio = as_dict(item.get("audioReviewClip"))
        contexts = dict_list(item.get("contexts"))
        items.append(
            {
                "cueId": as_text(item.get("cueId"), "unknown-cue"),
                "confidence": as_text(item.get("confidence"), "unknown"),
                "cueType": as_text(item.get("cueType")),
                "reviewWindowLabel": as_text(item.get("reviewWindowLabel"), "time unknown"),
                "suggestedFilename": as_text(item.get("suggestedFilename"), "ep4-cue-id-short-description.mp4"),
                "dropInstruction": as_text(item.get("dropInstruction")),
                "reviewPrompt": as_text(item.get("reviewPrompt")),
                "searchHints": item.get("searchHints") if isinstance(item.get("searchHints"), list) else [],
                "audioReviewClipPath": as_text(audio.get("path")),
                "audioReviewClipOk": bool(audio.get("ok")),
                "evidence": [
                    f"{as_text(context.get('timeLabel'))} {as_text(context.get('text'))}".strip()
                    for context in contexts[:4]
                    if as_text(context.get("text")).strip()
                ],
            }
        )
    return items


def render_markdown(payload: dict[str, Any]) -> str:
    source = as_dict(payload.get("sourceClipRecovery"))
    intake = as_dict(payload.get("sourceClipIntake"))
    cue_review = as_dict(payload.get("sourceClipCueReview"))
    edit_intelligence = as_dict(payload.get("editIntelligence"))
    edit_rehearsal = as_dict(payload.get("editRehearsal"))
    cut_style = as_dict(edit_intelligence.get("cutStyleGuide"))
    top_short = as_dict(edit_intelligence.get("topShortCandidate"))
    top_short_review = as_dict(edit_intelligence.get("topShortReview"))
    placeholder_workbench = as_dict(payload.get("sourcePlaceholderWorkbench"))
    watched_source_packet = as_dict(payload.get("watchedSourceRecoveryPacket"))
    duration_workbench = as_dict(payload.get("hostSpineDurationWorkbench"))
    youtube_recipe = as_dict(payload.get("youtubeStandardRecipe"))
    youtube_review = as_dict(payload.get("youtubeRecipeReviewLedger"))
    proof_listen_queue = as_dict(payload.get("recipeProofListenQueue"))
    rehearsal_counts = as_dict(edit_rehearsal.get("counts"))
    top_rehearsal = as_dict(edit_rehearsal.get("topMove"))
    top_rehearsal_brief = as_dict(top_rehearsal.get("reviewBrief"))
    top_rehearsal_scrub = as_dict(top_rehearsal_brief.get("scrubWindow"))
    apply = as_dict(payload.get("applyPreview"))
    truth = as_dict(payload.get("truth"))
    intake_counts = as_dict(intake.get("counts"))
    apply_counts = as_dict(apply.get("counts"))
    next_cue = as_dict(source.get("nextCue"))
    intake_checklist = dict_list(intake.get("cueRecoveryChecklist"))
    if intake_checklist:
        next_cue = as_dict(intake_checklist[0])
    next_actions = dict_list(intake.get("nextActions"))
    blocked_ops = dict_list(apply.get("blockedOperations"))
    generated_at = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S UTC")

    dropbox_count = int(source.get("dropboxFileCount") or intake_counts.get("files") or 0)
    cue_count = int(source.get("cueCount") or len(intake_checklist) or 0)
    blocked_count = int(apply.get("blockedOperationCount") or apply_counts.get("blocked") or 0)
    current_status = md_line(intake.get("status"), md_line(source.get("status"), "missing"))

    lines = [
        "# Episode 4 Cut Intelligence Handoff",
        "",
        f"- Generated: `{generated_at}`",
        f"- Episode: `{md_line(payload.get('episode'), 'episode-4')}`",
        f"- Current status: `{current_status}`",
        f"- Dropbox files: `{dropbox_count}`",
        f"- Recovery cues: `{cue_count}`",
        f"- Blocked apply-preview operations: `{blocked_count}`",
        "",
        "## What this means",
        "",
    ]

    if dropbox_count == 0:
        lines.extend(
            [
                "Episode 4 real watched/source clip insertion is intentionally blocked because no watched/source clip files are in the intake dropbox.",
                "This is not a timeline failure. Main host-spine editing and duration planning can continue; the safety gate only prevents Quipsly from inventing missing source media.",
            ]
        )
    elif blocked_count > 0:
        lines.extend(
            [
                "Episode 4 has source files in intake, but at least one apply-preview operation still needs review before metadata can be written.",
            ]
        )
    else:
        lines.extend(
            [
                "No source-intake blocker is visible in this packet. Review the apply preview before writing any edit metadata.",
            ]
        )

    lines.extend(
        [
            "",
            "## Next missing watched/source clip",
            "",
            f"- Cue: `{md_line(next_cue.get('cueId'), 'none-found')}`",
            f"- Confidence: `{md_line(next_cue.get('confidence'), 'unknown')}`",
            f"- Review window: `{md_line(next_cue.get('reviewWindowLabel'), md_line(next_cue.get('timeWindow'), 'time unknown'))}`",
            f"- Suggested filename: `{md_line(next_cue.get('suggestedFilename'), 'ep4-cue-id-short-description.mp4')}`",
            "",
            "Evidence:",
        ]
    )
    lines.extend(render_evidence(next_cue.get("evidence") if isinstance(next_cue.get("evidence"), list) else []))

    lines.extend(
        [
            "",
            "## Safe commands",
            "",
            "```bash",
            "./script/agentctl.sh episode4-host-spine-duration-workbench",
            "./script/agentctl.sh episode4-youtube-standard-recipe",
            "./script/agentctl.sh episode4-youtube-recipe-review-ledger",
            "./script/agentctl.sh episode4-recipe-proof-listen-queue",
            "./script/agentctl.sh episode4-edit-rehearsal",
            "./script/agentctl.sh episode4-watched-source-recovery-packet",
            "./script/agentctl.sh episode4-source-clip-review --extract-audio",
            "./script/agentctl.sh episode4-source-placeholder-workbench",
            "./script/agentctl.sh episode4-source-clip-intake",
            "./script/agentctl.sh episode4-apply-preview",
            "./script/agentctl.sh episode4-cut-intelligence-state --markdown",
            "```",
            "",
            "## Human or agent next actions",
            "",
        ]
    )

    if next_actions:
        for action in next_actions:
            lines.extend(
                [
                    f"- Priority {md_line(action.get('priority'), '-')}: {md_line(action.get('title'), 'Review Episode 4 state')}",
                    f"  - Why: {md_line(action.get('why'), '')}",
                    f"  - Command: `{md_line(action.get('command'), '')}`",
                ]
            )
    else:
        for action in payload.get("agentNextActions", []):
            lines.append(f"- {md_line(action)}")

    lines.extend(
        [
            "",
            "## Host-spine duration workbench",
            "",
            f"- Status: `{md_line(duration_workbench.get('status'), 'missing-host-spine-duration-workbench')}`",
            f"- Variants: `{md_line(duration_workbench.get('variantCount'), '0')}`",
            f"- Spine: `{md_line(as_dict(duration_workbench.get('spine')).get('durationLabel'), 'unknown')}`",
            f"- Next: {md_line(duration_workbench.get('nextSafestAction'), 'Generate the duration workbench.')}",
            "",
            "## YouTube-standard recipe",
            "",
            f"- Status: `{md_line(youtube_recipe.get('status'), 'missing-youtube-standard-recipe')}`",
            f"- Branch: `{md_line(as_dict(youtube_recipe.get('branch')).get('branchId'), 'none')}`",
            f"- Target: `{md_line(as_dict(youtube_recipe.get('durationPlan')).get('targetLabel'), 'unknown')}`",
            f"- Estimated keep: `{md_line(as_dict(youtube_recipe.get('durationPlan')).get('estimatedKeepLabel'), 'unknown')}`",
            f"- Operations: `{md_line(youtube_recipe.get('operationCounts'), '{}')}`",
            f"- Next: {md_line(youtube_recipe.get('nextSafestAction'), 'Generate the YouTube-standard recipe.')}",
            "",
            "## YouTube recipe review ledger",
            "",
            f"- Status: `{md_line(youtube_review.get('status'), 'missing-youtube-recipe-review-ledger')}`",
            f"- Reviewed: `{md_line(as_dict(youtube_review.get('counts')).get('reviewed'), '0')}`",
            f"- Review needed: `{md_line(as_dict(youtube_review.get('counts')).get('reviewNeeded'), '0')}`",
            f"- Unreviewed: `{md_line(as_dict(youtube_review.get('counts')).get('unreviewed'), '0')}`",
            f"- Events: `{md_line(as_dict(youtube_review.get('counts')).get('events'), '0')}`",
            f"- Next: {md_line(youtube_review.get('nextSafestAction'), 'Build or review the recipe ledger.')}",
            "",
            "## Recipe proof-listen queue",
            "",
            f"- Status: `{md_line(proof_listen_queue.get('status'), 'missing-recipe-proof-listen-queue')}`",
            f"- Tasks: `{md_line(as_dict(proof_listen_queue.get('counts')).get('tasks'), '0')}`",
            f"- Listen-first: `{md_line(as_dict(proof_listen_queue.get('counts')).get('listenFirst'), '0')}`",
            f"- Visual review: `{md_line(as_dict(proof_listen_queue.get('counts')).get('visualReview'), '0')}`",
            f"- Source recovery: `{md_line(as_dict(proof_listen_queue.get('counts')).get('sourceRecovery'), '0')}`",
            f"- Next: {md_line(proof_listen_queue.get('nextSafestAction'), 'Generate the proof-listen queue.')}",
            "",
            "## Edit rehearsal packet",
            "",
            f"- Status: `{md_line(edit_rehearsal.get('status'), 'missing-edit-rehearsal')}`",
            f"- Moves: `{md_line(rehearsal_counts.get('moves'), '0')}`",
            f"- Unreviewed: `{md_line(rehearsal_counts.get('unreviewedMoves'), '0')}`",
            f"- Source-required: `{md_line(rehearsal_counts.get('sourceRequiredMoves'), '0')}`",
            f"- Top move: `{md_line(top_rehearsal.get('proposalId'), 'none')}` · `{md_line(top_rehearsal.get('rehearsalKind'), '')}` · `{md_line(top_rehearsal.get('timeLabel'), '')}`",
            f"- Would create: {md_line(top_rehearsal.get('wouldCreate'), 'No rehearsal move selected.')}",
            f"- Program move: {md_line(top_rehearsal.get('programMove'), 'Open the rehearsal packet.')}",
            f"- Cadence guardrail: {md_line(top_rehearsal.get('cadenceGuardrail'), 'Review audio/visual rhythm before applying.')}",
            f"- Review question: {md_line(top_rehearsal.get('reviewQuestion'), 'Does this move improve the episode?')}",
            f"- Scrub window: `{md_line(top_rehearsal_scrub.get('label'), 'open rehearsal board')}`",
            f"- Scrub why: {md_line(top_rehearsal_scrub.get('why'), 'Review context before deciding.')}",
            f"- Dry-run command: `{md_line(top_rehearsal.get('dryRunReviewCommand'), '')}`",
            f"- Next: {md_line(edit_rehearsal.get('nextSafestAction'), 'Generate or review the edit rehearsal packet.')}",
            "",
            "Top move note lanes:",
        ]
    )
    for lane in dict_list(top_rehearsal_brief.get("noteLanes")):
        lines.append(
            f"- **{md_line(lane.get('label'), md_line(lane.get('id'), 'note'))}** `{md_line(lane.get('flag'), '')}`: {md_line(lane.get('prompt'), '')}"
        )
    if not dict_list(top_rehearsal_brief.get("noteLanes")):
        lines.append("- No note lanes listed yet; open the rehearsal packet.")
    lines.extend(["", "Top move decision examples:", ""])
    for option in dict_list(top_rehearsal_brief.get("decisionOptions"))[:3]:
        lines.extend(
            [
                f"- `{md_line(option.get('decision'), 'decision')}`: {md_line(option.get('whenToUse'), '')}",
                f"  - Dry run: `{md_line(option.get('dryRunCommand'), '')}`",
            ]
        )
    if not dict_list(top_rehearsal_brief.get("decisionOptions")):
        lines.append("- No decision examples listed yet; open the rehearsal packet.")
    lines.extend(["", "Top move shortcut commands:", ""])
    for shortcut in dict_list(top_rehearsal_brief.get("shortcutCommands"))[:4]:
        lines.extend(
            [
                f"- `{md_line(shortcut.get('decision'), 'decision')}`",
                f"  - Dry run: `{md_line(shortcut.get('dryRun'), '')}`",
                f"  - Record after review: `{md_line(shortcut.get('record'), '')}`",
            ]
        )
    if not dict_list(top_rehearsal_brief.get("shortcutCommands")):
        lines.append("- No shortcut commands listed yet; use the full decision examples above.")
    lines.extend(
        [
            "",
            "## Cue audio/text review packet",
            "",
            f"- Status: `{md_line(cue_review.get('status'), 'missing-source-clip-cue-review')}`",
            f"- Review items: `{md_line(cue_review.get('reviewItemCount'), '0')}`",
            f"- Audio review clips: `{md_line(cue_review.get('audioReviewClipCount'), '0')}`",
            f"- Drop folder: `{md_line(cue_review.get('needsHumanIdentificationFolder'), md_line(source.get('dropboxPath'), ''))}`",
            f"- Next cue prompt: {md_line(as_dict(cue_review.get('firstReviewItem')).get('reviewPrompt'), 'Open the cue review packet and identify the first missing source clip.')}",
            "",
            "## Watched/source recovery packet",
            "",
            f"- Status: `{md_line(watched_source_packet.get('status'), 'missing-watched-source-recovery-packet')}`",
            f"- Cues: `{md_line(as_dict(watched_source_packet.get('counts')).get('cues'), '0')}`",
            f"- Audio review clips: `{md_line(as_dict(watched_source_packet.get('counts')).get('audioReviewClips'), '0')}`",
            f"- Dropbox files: `{md_line(as_dict(watched_source_packet.get('counts')).get('dropboxFiles'), '0')}`",
            f"- Next: {md_line(watched_source_packet.get('nextSafestAction'), 'Generate the watched/source recovery packet.')}",
            "",
            "## Blocked apply-preview operations",
            "",
        ]
    )

    if blocked_ops:
        for operation in blocked_ops:
            lines.extend(
                [
                    f"- `{md_line(operation.get('proposalId'), 'unknown-proposal')}`: `{md_line(operation.get('operationStatus'), 'blocked')}`",
                    f"  - Kind: `{md_line(operation.get('operationKind'), 'unknown')}`",
                    f"  - Reason: {md_line(operation.get('reason'), '')}",
                ]
            )
    else:
        lines.append("- No blocked apply-preview operations listed in this packet.")

    lines.extend(
        [
            "",
            "## Artifact paths",
            "",
            f"- Start Here board: `{md_line(as_dict(payload.get('startHere')).get('htmlPath'), '')}`",
            f"- Source clip intake board: `{md_line(intake.get('htmlPath'), '')}`",
            f"- Watched/source clip recovery board: `{md_line(intake.get('recoveryHtmlPath'), '')}`",
            f"- Watched/source clip recovery Markdown: `{md_line(intake.get('recoveryMarkdownPath'), '')}`",
            f"- Cue audio/text review board: `{md_line(cue_review.get('htmlPath'), '')}`",
            f"- Cue audio/text review Markdown: `{md_line(cue_review.get('markdownPath'), '')}`",
            f"- Source placeholder workbench: `{md_line(placeholder_workbench.get('htmlPath'), '')}`",
            f"- Watched/source recovery packet: `{md_line(watched_source_packet.get('htmlPath'), '')}`",
            f"- Watched/source recovery Markdown: `{md_line(watched_source_packet.get('markdownPath'), '')}`",
            f"- Host-spine duration workbench: `{md_line(duration_workbench.get('htmlPath'), '')}`",
            f"- Host-spine duration Markdown: `{md_line(duration_workbench.get('markdownPath'), '')}`",
            f"- YouTube-standard recipe: `{md_line(youtube_recipe.get('htmlPath'), '')}`",
            f"- YouTube-standard recipe Markdown: `{md_line(youtube_recipe.get('markdownPath'), '')}`",
            f"- YouTube recipe review ledger: `{md_line(youtube_review.get('htmlPath'), '')}`",
            f"- YouTube recipe review Markdown: `{md_line(youtube_review.get('markdownPath'), '')}`",
            f"- Recipe proof-listen queue: `{md_line(proof_listen_queue.get('htmlPath'), '')}`",
            f"- Recipe proof-listen Markdown: `{md_line(proof_listen_queue.get('markdownPath'), '')}`",
            f"- Edit rehearsal board: `{md_line(edit_rehearsal.get('htmlPath'), '')}`",
            f"- Edit rehearsal Markdown: `{md_line(edit_rehearsal.get('markdownPath'), '')}`",
            f"- Edit intelligence board: `{md_line(edit_intelligence.get('htmlPath'), '')}`",
            f"- Edit intelligence Markdown: `{md_line(edit_intelligence.get('markdownPath'), '')}`",
            f"- Source clip shopping list: `{md_line(source.get('shoppingListPath'), '')}`",
            f"- Apply preview board: `{md_line(apply.get('htmlPath'), '')}`",
            f"- Source clip dropbox: `{md_line(source.get('dropboxPath'), '')}`",
            "",
            "## Safety boundary",
            "",
            f"- Read-only: `{truth.get('readOnly', True)}`",
            f"- Timeline decisions written: `{truth.get('timelineDecisionsWritten', False)}`",
            f"- Source files mutated: `{truth.get('sourceFilesMutated', False)}`",
            f"- Versions overwritten: `{truth.get('versionsOverwritten', False)}`",
            f"- External publishing: `{truth.get('externalPublishing', False)}`",
            "",
            "Do not apply clip-weave metadata until source intake confirms real media. Whole source media stays intact; edits remain transparent metadata.",
            "",
            "## Human-feeling cut style",
            "",
            f"- Style status: `{md_line(cut_style.get('status'), 'missing')}`",
            f"- Principles: `{cut_style.get('principleCount', 0)}`",
            f"- Techniques: `{cut_style.get('techniqueCount', 0)}`",
            "",
        ]
    )
    for principle in dict_list(cut_style.get("principles")):
        lines.append(f"- **{md_line(principle.get('label'))}**: {md_line(principle.get('rule'))}")
    if cut_style.get("notAllowedYet"):
        lines.extend(["", "Still not allowed:", ""])
        for rule in cut_style.get("notAllowedYet") or []:
            lines.append(f"- {md_line(rule)}")
        lines.append("")
    if top_short:
        caption = as_dict(top_short.get("captionPlan"))
        lines.extend(
            [
                "## Top short candidate review loop",
                "",
                f"- Candidate: `{md_line(top_short.get('id'))}`",
                f"- Time: `{md_line(top_short.get('timeLabel'))}`",
                f"- Hook: `{md_line(top_short.get('hookType'))}`",
                f"- Captions: `{md_line(caption.get('density'))}` · `{caption.get('estimatedWordsPerSecond')}` w/s",
                f"- Pacing risk: `{md_line(top_short.get('pacingRisk'))}`",
                f"- Review status: `{md_line(top_short_review.get('status'), 'not-reviewed')}`",
                f"- Decision: `{md_line(top_short_review.get('decision'), 'pending')}`",
                f"- Missing targeted note lanes: `{', '.join(top_short_review.get('missingShortNoteLanes') or [])}`",
                "",
            ]
        )
    return "\n".join(lines)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--start-pointer", type=Path, default=DEFAULT_START_POINTER)
    parser.add_argument("--apply-pointer", type=Path, default=DEFAULT_APPLY_POINTER)
    parser.add_argument("--intake-pointer", type=Path, default=DEFAULT_INTAKE_POINTER)
    parser.add_argument("--cue-review-pointer", type=Path, default=DEFAULT_CUE_REVIEW_POINTER)
    parser.add_argument("--edit-intelligence-pointer", type=Path, default=DEFAULT_EDIT_INTELLIGENCE_POINTER)
    parser.add_argument("--edit-review-ledger-pointer", type=Path, default=DEFAULT_EDIT_REVIEW_LEDGER_POINTER)
    parser.add_argument("--edit-rehearsal-pointer", type=Path, default=DEFAULT_EDIT_REHEARSAL_POINTER)
    parser.add_argument("--source-placeholder-pointer", type=Path, default=DEFAULT_SOURCE_PLACEHOLDER_POINTER)
    parser.add_argument("--watched-source-recovery-pointer", type=Path, default=DEFAULT_WATCHED_SOURCE_RECOVERY_POINTER)
    parser.add_argument("--host-spine-duration-pointer", type=Path, default=DEFAULT_HOST_SPINE_DURATION_POINTER)
    parser.add_argument("--youtube-standard-recipe-pointer", type=Path, default=DEFAULT_YOUTUBE_STANDARD_RECIPE_POINTER)
    parser.add_argument("--youtube-recipe-review-pointer", type=Path, default=DEFAULT_YOUTUBE_RECIPE_REVIEW_POINTER)
    parser.add_argument("--recipe-proof-listen-queue-pointer", type=Path, default=DEFAULT_RECIPE_PROOF_LISTEN_QUEUE_POINTER)
    parser.add_argument("--dropbox", type=Path, default=DEFAULT_DROPBOX)
    parser.add_argument("--compact", action="store_true")
    parser.add_argument("--json", action="store_true", help="Render JSON. This is the default; the flag is accepted for agentctl consistency.")
    parser.add_argument("--markdown", action="store_true", help="Render a human/agent handoff packet instead of JSON.")
    parser.add_argument(
        "--save-markdown",
        nargs="?",
        const=str(DEFAULT_HANDOFF_PATH),
        help="Write the Markdown handoff to a path. Defaults to the Episode 4 control-room state folder.",
    )
    args = parser.parse_args()
    payload = build_payload(args)
    if args.markdown or args.save_markdown:
        output = render_markdown(payload)
        if args.save_markdown:
            output_path = Path(args.save_markdown)
            output_path.parent.mkdir(parents=True, exist_ok=True)
            output_path.write_text(output, encoding="utf-8")
        print(output)
    else:
        print(json.dumps(payload, indent=None if args.compact else 2, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
