#!/usr/bin/env python3
"""Build a single calm start-here runway across Quipsly production lanes.

This is a dispatcher, not a new source of truth. It reads latest local packets
from Studio, Tower, Nest Writing, Photo Grove, Studio360, and Quipsly OS, then
creates one human/agent opening surface. It never mutates media, reviews,
receipts, schedules, exports, or source files.
"""

from __future__ import annotations

import csv
import html
import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

DEFAULT_RELEASE_ROOT = Path("/Volumes/My Passport/Episode_and_Shorts_Test")
DEFAULT_OS_ROOT = Path("/Volumes/My Passport/Quipsly Media Workspace/QuipslyOS")
DEFAULT_OUTPUT_ROOT = Path("/Volumes/My Passport/Quipsly Media Workspace/ProductionRunway")
SCHEMA = "quipsly.production-runway.v1"
HUMAN_ASK = (
    "Treat this as the cross-lane production runway: resolve the first attention card, keep local readiness separate from approval and receipts, "
    "and do not publish until approval is explicit."
)
AGENT_SAFE_PARALLEL_WORK = (
    "Codex can improve runway cards, packet clarity, validation, and local artifacts across lanes while preserving source/readiness/approval/receipt boundaries."
)


def iso_now() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def stamp() -> str:
    return datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S-%f")


def load_json(path: Path, *, _depth: int = 0) -> dict[str, Any]:
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


def safe_counts(payload: dict[str, Any]) -> dict[str, Any]:
    counts = payload.get("counts")
    return counts if isinstance(counts, dict) else {}


def first_action(payload: dict[str, Any], fallback_path: str = "") -> dict[str, str]:
    first = payload.get("firstSafeAction") if isinstance(payload.get("firstSafeAction"), dict) else {}
    path = str(first.get("path") or payload.get("htmlPath") or payload.get("markdownPath") or fallback_path or "")
    command = str(first.get("command") or (f"open {shell_quote(path)}" if path else ""))
    return {
        "label": str(first.get("label") or "Open local evidence"),
        "command": command,
        "path": path,
        "safety": str(first.get("safety") or "Opens local evidence only. No mutation."),
    }


def collect_operating_loops(return_brief: dict[str, Any]) -> list[dict[str, Any]]:
    loops = return_brief.get("operatingLoops")
    if not isinstance(loops, list):
        return []
    collected: list[dict[str, Any]] = []
    for loop in loops:
        if not isinstance(loop, dict):
            continue
        steps = loop.get("steps")
        safe_steps = [step for step in steps if isinstance(step, dict)] if isinstance(steps, list) else []
        first_step = safe_steps[0] if safe_steps else {}
        collected.append({
            "lane": str(loop.get("lane") or "Quipsly"),
            "label": str(loop.get("label") or "Operating loop"),
            "status": str(loop.get("status") or ""),
            "humanAsk": str(loop.get("humanAsk") or ""),
            "nextSafestAction": str(loop.get("nextSafestAction") or ""),
            "openCommand": str(loop.get("openCommand") or ""),
            "htmlPath": str(loop.get("htmlPath") or ""),
            "jsonPath": str(loop.get("jsonPath") or ""),
            "stepCount": int(loop.get("stepCount") or len(safe_steps)),
            "firstStepLabel": str(loop.get("firstStepLabel") or first_step.get("label") or ""),
            "firstStepCommand": str(loop.get("firstStepCommand") or first_step.get("command") or ""),
            "firstStepSafety": str(loop.get("firstStepSafety") or first_step.get("safety") or ""),
            "steps": safe_steps[:5],
            "truth": str(loop.get("truth") or "Local operating loop only. No external publication, account mutation, source mutation, or receipt truth."),
        })
    return collected


def make_card(
    lane: str,
    title: str,
    payload: dict[str, Any],
    *,
    status: str = "",
    next_action: str = "",
    priority: str = "review",
    fallback_path: str = "",
    notes: list[str] | None = None,
    deck_sort_key: str = "",
) -> dict[str, Any]:
    action = first_action(payload, fallback_path)
    html_path = str(payload.get("htmlPath") or fallback_path or action.get("path") or "")
    json_path = str(payload.get("jsonPath") or "")
    markdown_path = str(payload.get("markdownPath") or "")
    card = {
        "lane": lane,
        "title": title,
        "priority": priority,
        "status": status or str(payload.get("status") or "ready"),
        "counts": safe_counts(payload),
        "primaryPath": html_path or action.get("path") or "",
        "primaryCommand": f"open {shell_quote(html_path)}" if html_path else action["command"],
        "nextAction": next_action or str(payload.get("nextSafestAction") or "Open local evidence and choose the next reversible action."),
        "nextSafestAction": next_action or str(payload.get("nextSafestAction") or "Open local evidence and choose the next reversible action."),
        "firstSafeAction": action,
        "htmlPath": html_path,
        "jsonPath": json_path,
        "markdownPath": markdown_path,
        "openCommand": f"open {shell_quote(html_path)}" if html_path else action["command"],
        "notes": notes or [],
        "deckSortKey": deck_sort_key or title,
        "truth": "Local read/review artifact only. This is not publication, approval, upload, schedule, or receipt truth.",
    }
    for extra_key in (
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
        "ownerPacketPaths",
        "approvalRunwaySummary",
        "approvalRunwayTruth",
        "writingSessionRecipe",
        "writingMoveMenu",
        "firstWritingTask",
        "firstDraftReview",
        "firstReviewTarget",
        "firstReviewNoteTemplate",
        "firstProofCandidate",
        "proofReviewRecipe",
        "selectedGroups",
        "selectedAspects",
        "firstStarterCandidate",
        "firstCandidateStarter",
        "starterReviewDeck",
        "firstCullSuggestionGroup",
        "cullSuggestionSummary",
        "sourceCullSuggestions",
        "proofPrepRecipe",
        "dailyWritingFirstTask",
        "dailyWritingTruth",
        "twentyFiveMinuteWritingPlan",
        "machineTriageSummary",
        "readyContinuationPlan",
        "repairLaneBoundary",
        "approvalRequestTemplate",
        "receiptCaptureTemplate",
        "productionWorkSessionLaunchers",
        "externalControlRoomArtifacts",
        "nextDecisionDeck",
        "gateClassificationDeck",
        "firstGateClassification",
        "firstGateReceipt",
        "gateReceiptOptions",
        "publishingApprovalGate",
        "receiptCaptureLadder",
        "workSessionPlan",
        "firstWorkSessionTask",
        "workTasks",
    ):
        if payload.get(extra_key):
            card[extra_key] = payload[extra_key]
    return card


def build_cards(release_root: Path, os_root: Path) -> list[dict[str, Any]]:
    cards: list[dict[str, Any]] = []
    top_review_companion = load_json(release_root / "review-board" / "top-review-companions" / "latest-studio-top-review-companion.json")
    studio_review_work_session = load_json(release_root / "review-board" / "studio-review-work-sessions" / "latest-studio-review-work-session.json")
    watch_listen_review_room = load_json(release_root / "review-board" / "latest-studio-watch-listen-review-room.json")
    studio_review_decision_ledger = load_json(release_root / "review-board" / "latest-studio-review-decision-ledger.json")
    studio_review_command_sheet = load_json(release_root / "review-board" / "latest-studio-review-command-sheet.json")
    studio_gate_decision_receipts = load_json(release_root / "review-board" / "latest-studio-gate-decision-receipt-packet.json")
    package_quality = load_json(release_root / "review-board" / "studio-package-quality-desk" / "latest-studio-package-quality-desk.json")
    shorts = load_json(release_root / "latest-shorts-review-cockpit.json")
    candidate_promotion = load_json(release_root / "review-board" / "duration-candidate-promotions" / "latest-duration-candidate-promotion-plan.json")
    sync_investigation = load_json(release_root / "review-board" / "sync-investigations" / "latest-sync-investigation.json")
    sync_stack = load_json(release_root / "review-board" / "sync-stacks" / "latest-episode-04-sync-stack.json")
    tower_publisher = load_json(release_root / "tower-publisher-desk" / "latest-tower-publisher-desk.json")
    tower_unblock = load_json(release_root / "tower-review-unblock-brief" / "latest-tower-review-unblock-brief.json")
    tower_gate = load_json(release_root / "tower-review-gate-board" / "latest-tower-review-gate-board.json")
    tower_command = load_json(release_root / "review-board" / "tower-review-command-sheets" / "latest-tower-review-command-sheet.json")
    tower_manual_packet = load_json(release_root / "tower-manual-packet-board" / "latest-tower-manual-packet-board.json")
    tower_control = load_json(release_root / "latest-tower-publication-control-room.json")
    tower_social = load_json(release_root / "tower-social-command-center" / "latest-tower-social-command-center.json")
    tower_receipt_readiness = load_json(release_root / "tower-receipt-readiness" / "latest-tower-receipt-readiness-packet.json")
    nest_control = load_json(Path("/Volumes/My Passport/Quipsly Media Workspace/NestWriting/latest-nest-writing-control-room.json"))
    nest_author = load_json(Path("/Volumes/My Passport/Quipsly Media Workspace/NestWriting/latest-nest-writing-author-desk.json"))
    writing_runway = load_json(Path("/Volumes/My Passport/Quipsly Media Workspace/NestWriting/latest-writing-publication-runway.json"))
    writing_momentum = load_json(Path("/Volumes/My Passport/Quipsly Media Workspace/NestWriting/latest-nest-writing-momentum-board.json"))
    writing_daily = load_json(Path("/Volumes/My Passport/Quipsly Media Workspace/NestWriting/latest-nest-writing-daily-packet.json"))
    writing_review = load_json(Path("/Volumes/My Passport/Quipsly Media Workspace/NestWriting/latest-nest-writing-review-desk.json"))
    writing_sprint = load_json(Path("/Volumes/My Passport/Quipsly Media Workspace/NestWriting/latest-nest-writing-sprint-companion.json"))
    writing_small_session = load_json(Path("/Volumes/My Passport/Quipsly Media Workspace/NestWriting/latest-nest-writing-small-session.json"))
    photo_control = load_json(Path("/Volumes/My Passport/Quipsly Media Workspace/PhotoGrove/latest-photo-grove-control-room.json"))
    photo_decision = load_json(Path("/Volumes/My Passport/Quipsly Media Workspace/PhotoGrove/latest-photo-grove-decision-desk.json"))
    photo_cull = load_json(Path("/Volumes/My Passport/Quipsly Media Workspace/PhotoGrove/latest-photo-grove-cull-board.json"))
    photo_culling_sprint = load_json(Path("/Volumes/My Passport/Quipsly Media Workspace/PhotoGrove/latest-photo-grove-culling-sprint-companion.json"))
    photo_first_pass = load_json(Path("/Volumes/My Passport/Quipsly Media Workspace/PhotoGrove/latest-photo-grove-first-pass-triage.json"))
    photo_command_sheet = load_json(Path("/Volumes/My Passport/Quipsly Media Workspace/PhotoGrove/latest-photo-grove-command-sheet.json"))
    photo_first_keepers = load_json(Path("/Volumes/My Passport/Quipsly Media Workspace/PhotoGrove/latest-photo-grove-first-keepers.json"))
    photo_keeper_desk = load_json(Path("/Volumes/My Passport/Quipsly Media Workspace/PhotoGrove/latest-photo-grove-keeper-desk.json"))
    photo_review_session = load_json(Path("/Volumes/My Passport/Quipsly Media Workspace/PhotoGrove/latest-photo-grove-review-session.json"))
    photo_proof = load_json(Path("/Volumes/My Passport/Quipsly Media Workspace/PhotoGrove/latest-photo-grove-proof-desk.json"))
    photo_client_packet = load_json(Path("/Volumes/My Passport/Quipsly Media Workspace/PhotoGrove/latest-photo-grove-client-proof-packet.json"))
    studio360_control = load_json(Path("/Volumes/My Passport/Quipsly Media Workspace/Studio360/latest-studio360-proof-control-room.json"))
    studio360_source_desk = load_json(Path("/Volumes/My Passport/Quipsly Media Workspace/Studio360/latest-360-source-desk.json"))
    studio360 = load_json(Path("/Volumes/My Passport/Quipsly Media Workspace/Studio360/latest-360-reframe-export-desk.json"))
    renderer = load_json(Path("/Volumes/My Passport/Quipsly Media Workspace/Studio360/latest-360-renderer-preflight.json"))
    proof_next = load_json(Path("/Volumes/My Passport/Quipsly Media Workspace/Studio360/latest-360-proof-next-brief.json"))
    proof_review = load_json(Path("/Volumes/My Passport/Quipsly Media Workspace/Studio360/latest-360-proof-review-desk.json"))
    return_brief = load_json(os_root / "latest-quipsly-return-brief.json")
    human_help = load_json(os_root / "latest-quipsly-human-help-board.json")
    validation = load_json(os_root / "latest-quipsly-os-validation.json")

    if studio_review_work_session:
        counts = safe_counts(studio_review_work_session)
        first_task = studio_review_work_session.get("firstWorkSessionTask") if isinstance(studio_review_work_session.get("firstWorkSessionTask"), dict) else {}
        cards.append(make_card(
            "Studio podcast/video",
            "Studio review work session",
            studio_review_work_session,
            priority="attention",
            deck_sort_key="00-studio-review-work-session",
            next_action=studio_review_work_session.get("nextSafestAction") or first_task.get("doneWhen") or "Open the Studio review work session and complete one local classification.",
            notes=[
                f"{counts.get('workTasks', 0)} work-session tasks",
                f"{counts.get('currentBestPackages', 0)} current-best packages",
                f"{counts.get('readyShorts', 0)} ready shorts",
                f"{counts.get('publishBlockedPackages', 0)} publish-blocked packages",
                f"{counts.get('capturedReceipts', 0)} captured receipts",
                f"first task: {first_task.get('title') or 'none'}",
                "One calm local review session; no approval, promotion, publication, upload, schedule, overwrite, source mutation, or receipt truth.",
            ],
        ))
    if top_review_companion:
        counts = safe_counts(top_review_companion)
        gate_deck = top_review_companion.get("gateClassificationDeck") if isinstance(top_review_companion.get("gateClassificationDeck"), list) else []
        first_gate = top_review_companion.get("firstGateClassification") if isinstance(top_review_companion.get("firstGateClassification"), dict) else {}
        cards.append(make_card(
            "Studio podcast/video",
            "Studio top review companion",
            top_review_companion,
            priority="attention" if int(counts.get("reviewItems") or 0) else "review",
            deck_sort_key="00-studio-top-review-companion",
            next_action=top_review_companion.get("nextSafestAction") or first_gate.get("recommendedFirstMove") or "Open the Studio top review companion and classify the first gate.",
            notes=[
                f"{counts.get('reviewItems', 0)} top review items",
                f"{counts.get('durationCandidateItems', 0)} duration candidate",
                f"{counts.get('syncInvestigationItems', 0)} sync investigation",
                f"{counts.get('localDecisionNoteTemplates', 0)} local decision templates",
                f"{counts.get('gateClassificationRows', len(gate_deck))} gate classification rows",
                f"{counts.get('gateClassificationOptions', sum(len(card.get('decisionOptions') or []) for card in gate_deck))} classification options",
                f"first gate: {first_gate.get('title') or 'none'}",
                f"first gate state: {first_gate.get('state') or 'unknown'}",
                "Review evidence only; no package approval, promotion, publication, or receipt truth.",
            ],
        ))
    if studio_gate_decision_receipts:
        counts = safe_counts(studio_gate_decision_receipts)
        first_gate = studio_gate_decision_receipts.get("firstGateReceipt") if isinstance(studio_gate_decision_receipts.get("firstGateReceipt"), dict) else {}
        cards.append(make_card(
            "Studio podcast/video",
            "Studio gate decision receipt packet",
            studio_gate_decision_receipts,
            priority="attention" if int(counts.get("gates") or 0) else "review",
            deck_sort_key="01-studio-gate-decision-receipts",
            next_action=studio_gate_decision_receipts.get("nextSafestAction") or "Open evidence, choose one gate classification, dry-run the receipt, then record only local gate metadata after human review.",
            notes=[
                f"{counts.get('gates', 0)} Studio gate(s)",
                f"{counts.get('decisionOptions', 0)} receipt option(s)",
                f"{counts.get('receiptsRecorded', 0)} local gate receipt(s) recorded",
                f"first gate: {first_gate.get('title') or 'none'}",
                f"first gate receipt: {first_gate.get('receiptStatus') or 'not-recorded'}",
                "Gate receipt guidance only; no package promotion, Tower approval, publication, upload, schedule, source mutation, overwrite, or external receipt truth.",
            ],
        ))
    if watch_listen_review_room:
        counts = safe_counts(watch_listen_review_room)
        cards.append(make_card(
            "Studio podcast/video",
            "Studio watch/listen review room",
            watch_listen_review_room,
            priority="attention" if int(counts.get("reviewItems") or 0) else "review",
            deck_sort_key="05-studio-watch-listen-review-room",
            notes=[
                f"{counts.get('reviewItems', 0)} watch/listen review items",
                f"{counts.get('mediaEvidenceRows', 0)} media evidence rows",
                f"{counts.get('embeddableMediaRows', 0)} embeddable media rows",
                f"{counts.get('localDecisionNoteTemplates', 0)} local decision templates",
                "Local evidence room only; no approval, promotion, publication, upload, schedule, overwrite, source mutation, or receipt truth.",
            ],
        ))
    if studio_review_decision_ledger:
        counts = safe_counts(studio_review_decision_ledger)
        cards.append(make_card(
            "Studio podcast/video",
            "Studio review decision ledger",
            studio_review_decision_ledger,
            priority="attention" if int(counts.get("pending") or 0) else "review",
            deck_sort_key="07-studio-review-decision-ledger",
            notes=[
                f"{counts.get('items', 0)} Studio review items",
                f"{counts.get('pending', 0)} pending decisions",
                f"{counts.get('decisionsRecorded', 0)} recorded decisions",
                f"{counts.get('needsAction', 0)} still need local action",
                "Records local Studio watch/listen decisions only; no package promotion, Tower approval, publication, upload, schedule, source mutation, overwrite, or receipt truth.",
            ],
        ))
    if studio_review_command_sheet:
        counts = safe_counts(studio_review_command_sheet)
        cards.append(make_card(
            "Studio podcast/video",
            "Studio review command sheet",
            studio_review_command_sheet,
            priority="attention" if int(counts.get("pending") or 0) else "review",
            deck_sort_key="08-studio-review-command-sheet",
            notes=[
                f"{counts.get('items', 0)} command-sheet items",
                f"{counts.get('pending', 0)} pending decisions",
                f"{counts.get('commands', 0)} dry-run/record commands",
                f"First dry-run: {studio_review_command_sheet.get('firstDryRunCommand') or 'open sheet'}",
                "Command guidance only; generating it records no decision and changes no package, Tower, publication, or receipt truth.",
            ],
        ))
    if package_quality:
        counts = safe_counts(package_quality)
        cards.append(make_card(
            "Studio podcast/video",
            "Episode package quality",
            package_quality,
            priority="attention",
            deck_sort_key="10-episode-package-quality",
            notes=[
                f"{counts.get('currentBestPackages', 0)} current-best packages",
                f"{counts.get('readyShorts', 0)} ready shorts",
                f"{counts.get('warningEpisodes', 0)} warning episodes",
                f"{counts.get('capturedReceipts', 0)} captured receipts",
            ],
        ))
    if shorts:
        counts = safe_counts(shorts)
        cards.append(make_card(
            "Studio podcast/video",
            "Shorts review cockpit",
            shorts,
            priority="attention" if int(counts.get("reviewable") or 0) else "review",
            deck_sort_key="20-shorts-review-cockpit",
            notes=[
                f"{counts.get('shorts', 0)} packaged shorts",
                f"{counts.get('reviewable', 0)} reviewable",
                f"{counts.get('missingFiles', 0)} missing files",
                f"{counts.get('durationWarnings', 0)} duration warnings",
            ],
        ))
    if candidate_promotion:
        cards.append(make_card(
            "Studio podcast/video",
            "Episode 1 v004 promotion plan",
            candidate_promotion,
            priority="attention",
            deck_sort_key="50-episode-1-v004-promotion-plan",
            next_action="Review the v004 candidate evidence first. Execute promotion only after explicit human approval.",
            notes=["Dry-run plan only by default", "Does not make v004 current-best without --execute and approval"],
        ))
    if sync_investigation:
        sync_notes = ["Treat as sync/restack evidence", "Do not blind-trim into approval"]
        if sync_investigation.get("plainEnglishDurationSummary"):
            sync_notes.insert(0, str(sync_investigation.get("plainEnglishDurationSummary")))
        cards.append(make_card(
            "Studio podcast/video",
            "Episode 4 sync investigation",
            sync_investigation,
            priority="attention",
            deck_sort_key="30-episode-4-sync-investigation",
            notes=sync_notes,
        ))
    if sync_stack:
        counts = safe_counts(sync_stack)
        cards.append(make_card(
            "Studio podcast/video",
            "Episode 4 native sync stack",
            sync_stack,
            priority="attention",
            deck_sort_key="40-episode-4-native-sync-stack",
            next_action=sync_stack.get("nextSafestAction") or "Open the Episode 4 sync stack, confirm candidate/held lanes, then continue sync-control review before edit/export/publishing decisions.",
            notes=[
                f"{counts.get('candidateLanes', 0)} candidate lanes",
                f"{counts.get('heldLanes', 0)} held/questionable lanes",
                f"{counts.get('proxyReadyLanes', 0)} proxy-ready lanes",
                f"{counts.get('needsProxyLanes', 0)} candidate proxy gaps",
                "Whole-source stack only; not a final edit or approval.",
            ],
        ))
    if tower_publisher:
        counts = safe_counts(tower_publisher)
        cards.append(make_card(
            "Tower publishing/social",
            "Publisher desk",
            tower_publisher,
            priority="attention",
            notes=[
                f"{counts.get('socialItems', 0)} social rows",
                f"{counts.get('approvalRunwayRows', 0)} approval runway rows",
                f"{counts.get('approvalRunwayBlocked', 0)} approval rows blocked",
                f"{counts.get('approvalRunwayReadyForApproval', 0)} approval-ready rows",
                f"{counts.get('receiptSlots', 0)} receipt slots",
                f"{counts.get('capturedReceipts', 0)} captured receipts",
            ],
        ))
    if tower_unblock:
        counts = safe_counts(tower_unblock)
        cards.append(make_card(
            "Tower publishing/social",
            "Review unblock brief",
            tower_unblock,
            priority="attention" if int(counts.get("reviewRows") or 0) else "review",
            notes=[
                f"{counts.get('reviewRows', 0)} focused review rows",
                f"{counts.get('blockers', 0)} blockers summarized",
                f"{counts.get('warningRows', 0)} warning rows",
                f"{counts.get('readyForApproval', 0)} ready for approval",
            ],
        ))
    if tower_gate:
        counts = safe_counts(tower_gate)
        cards.append(make_card(
            "Tower publishing/social",
            "Review gate board",
            tower_gate,
            priority="attention" if int(counts.get("reviewGatedEpisodes") or 0) else "review",
            deck_sort_key="00-review-gate-board",
            notes=[
                f"{counts.get('reviewGatedEpisodes', 0)} review-gated episodes",
                f"{counts.get('platformRowsWaiting', 0)} platform rows waiting",
                f"{counts.get('unblockItems', 0)} unblock items",
                f"{counts.get('warningRows', 0)} warning rows",
                f"{counts.get('receiptSlots', 0)} receipt slots",
                "No platform packet becomes approval-ready until local review gates are cleared.",
            ],
        ))
    if tower_command:
        cards.append(make_card(
            "Tower publishing/social",
            "Review command sheet",
            tower_command,
            priority="review",
            notes=["Dry-run commands first", "Local review ledger only unless receipts are real"],
        ))
    if tower_manual_packet:
        counts = safe_counts(tower_manual_packet)
        cards.append(make_card(
            "Tower publishing/social",
            "Manual publishing packet board",
            tower_manual_packet,
            priority="attention",
            notes=[
                f"{counts.get('artifactReviewRows', 0)} artifact review rows",
                f"{counts.get('calendarRows', 0)} platform packet rows",
                f"{counts.get('receiptSlots', 0)} receipt slots",
                f"{counts.get('capturedReceipts', 0)} captured receipts",
            ],
        ))
    if tower_receipt_readiness:
        counts = safe_counts(tower_receipt_readiness)
        cards.append(make_card(
            "Tower publishing/social",
            "Receipt readiness packet",
            tower_receipt_readiness,
            priority="attention" if int(counts.get("reviewBlockedWithPacket") or 0) or int(counts.get("packetNeedsRepair") or 0) else "review",
            deck_sort_key="01.5-tower-receipt-readiness",
            next_action=tower_receipt_readiness.get("nextSafestAction") or "Open the receipt readiness packet and keep readiness, approval, posting, and receipt truth separate.",
            notes=[
                f"{counts.get('receiptSlots', 0)} receipt slots",
                f"{counts.get('reviewBlockedWithPacket', 0)} review-blocked packet rows",
                f"{counts.get('readyForExplicitApproval', 0)} rows ready for explicit approval",
                f"{counts.get('packetNeedsRepair', 0)} packet repair rows",
                f"{counts.get('receiptCaptured', 0)} captured receipts",
                "This packet is a handoff map only; it never publishes or creates receipt truth.",
            ],
        ))
    if tower_social:
        counts = safe_counts(tower_social)
        cards.append(make_card(
            "Tower publishing/social",
            "Social command center",
            tower_social,
            priority="attention" if int(counts.get("blockedOrReview") or 0) else "review",
            deck_sort_key="01-tower-social-command-center",
            next_action=tower_social.get("nextSafestAction") or "Open the social command center and work the queue top-down without external posting.",
            notes=[
                f"{counts.get('items', 0)} platform queue rows",
                f"{counts.get('platforms', 0)} platforms",
                f"{counts.get('startHereRows', 0)} start-here rows",
                f"{counts.get('readyForApproval', 0)} ready for approval",
                f"{counts.get('capturedReceipts', 0)} captured receipts",
                "Queue and calendar are local intent only; receipts require real external proof.",
            ],
        ))
    if tower_control:
        counts = safe_counts(tower_control)
        decision_deck = tower_control.get("nextDecisionDeck") if isinstance(tower_control.get("nextDecisionDeck"), list) else []
        first_decision = decision_deck[0] if decision_deck and isinstance(decision_deck[0], dict) else {}
        cards.append(make_card(
            "Tower publishing/social",
            "Publication control room",
            tower_control,
            priority="attention" if str(tower_control.get("stage") or "").endswith("gated") or int(counts.get("blockedOrReview") or 0) else "review",
            next_action=tower_control.get("nextSafestAction") or first_decision.get("canDoNow") or "Open the Tower publication control room and work the next decision deck without external action.",
            notes=[
                f"stage: {tower_control.get('stage') or 'unknown'}",
                f"{counts.get('blockedOrReview', 0)} blocked/review rows",
                f"{counts.get('readyForApproval', 0)} ready for approval",
                f"{counts.get('receiptSlots', 0)} receipt slots",
                f"{counts.get('capturedReceipts', 0)} captured receipts",
                f"{counts.get('nextDecisionDeckRows', len(decision_deck))} next-decision rows",
                f"first decision: {first_decision.get('title') or 'none'}",
                f"first decision state: {first_decision.get('state') or 'unknown'}",
                f"{counts.get('productionLaunchers', 0)} production work-session launchers",
                f"{counts.get('firstSessionArtifacts', 0)} first-session artifacts",
                "approval and receipt templates are handoffs, not state changes",
            ],
        ))
    if writing_small_session:
        counts = safe_counts(writing_small_session)
        source_slice = writing_small_session.get("sourceSlice") if isinstance(writing_small_session.get("sourceSlice"), dict) else {}
        cards.append(make_card(
            "Nest writing/research",
            "Small writing session",
            writing_small_session,
            priority="attention",
            deck_sort_key="00-0-small-writing-session",
            next_action=writing_small_session.get("nextSafestAction") or "Open one source-backed writing block and make one draft/review move.",
            notes=[
                f"selected block: {source_slice.get('title') or 'none'}",
                f"voice: {source_slice.get('voice') or 'unknown'}",
                f"{counts.get('selectedBlockWords', 0)} selected words",
                f"{counts.get('manuscriptBlocks', 0)} manuscript blocks indexed",
                "One source-backed block; no source mutation or canonical replacement.",
            ],
        ))
    if nest_control:
        counts = safe_counts(nest_control)
        cards.append(make_card(
            "Nest writing/research",
            "Writing control room",
            nest_control,
            priority="attention" if int(counts.get("pendingHumanReview") or 0) else "review",
            notes=[
                f"{counts.get('sourceWords', 0)} source words",
                f"{counts.get('currentDrafts', 0)} draft packets",
                f"{counts.get('pendingHumanReview', 0)} pending human review",
                f"{counts.get('draftsWithReviewFlags', 0)} flagged drafts",
                "25-minute plan keeps book work small and non-canonical until approved",
            ],
        ))
    if writing_sprint:
        counts = safe_counts(writing_sprint)
        start_here = writing_sprint.get("startHereToday") if isinstance(writing_sprint.get("startHereToday"), dict) else {}
        first_task = writing_sprint.get("firstTask") if isinstance(writing_sprint.get("firstTask"), dict) else {}
        card = make_card(
            "Nest writing/research",
            "Writing sprint companion",
            writing_sprint,
            priority="attention" if int(counts.get("pendingHumanReview") or 0) else "review",
            deck_sort_key="00-writing-sprint-companion",
            notes=[
                f"{counts.get('availableDailyTasks', 0)} available daily tasks",
                f"{counts.get('currentDrafts', 0)} current drafts",
                f"{counts.get('pendingHumanReview', 0)} pending human review",
                f"{counts.get('platformDraftItems', 0)} platform draft items",
                f"start: {start_here.get('label') or start_here.get('headline') or 'open sprint companion'}",
                "AI drafting is allowed, but source trails and human approval stay visible",
            ],
        )
        if first_task:
            card["firstWritingTask"] = first_task
        if writing_sprint.get("firstReviewTarget"):
            card["firstWritingReviewTarget"] = writing_sprint.get("firstReviewTarget")
        if writing_sprint.get("firstReviewNoteTemplate"):
            card["writingReviewNoteTemplate"] = writing_sprint.get("firstReviewNoteTemplate")
        if writing_sprint.get("writingOutputPlan"):
            card["writingOutputPlan"] = writing_sprint.get("writingOutputPlan")
        if writing_sprint.get("twentyFiveMinuteWritingPlan"):
            card["twentyFiveMinuteWritingPlan"] = writing_sprint.get("twentyFiveMinuteWritingPlan")
        cards.append(card)
    if nest_author:
        counts = safe_counts(nest_author)
        cards.append(make_card(
            "Nest writing/research",
            "Author desk",
            nest_author,
            priority="review",
            notes=[
                f"{counts.get('deskTasks', 0)} author tasks",
                f"{counts.get('sourceFilesLinked', 0)} source files linked",
                f"{counts.get('tasksWithExistingDraftPackets', 0)} draft packets already exist",
            ],
        ))
    if writing_runway:
        cards.append(make_card(
            "Nest writing/research",
            "Writing publication runway",
            writing_runway,
            priority="review",
            notes=["Draft-to-publication packet visibility", "No manuscript overwrite"],
        ))
    if writing_momentum:
        counts = safe_counts(writing_momentum)
        cards.append(make_card(
            "Nest writing/research",
            "Writing momentum board",
            writing_momentum,
            priority="review",
            notes=[
                f"{counts.get('sourceDocuments', 0)} source documents",
                f"{counts.get('sourceWords', 0)} source words",
                f"{counts.get('draftPackets', 0)} draft packets",
                f"{counts.get('pendingHumanReview', 0)} pending review",
                f"{len(writing_momentum.get('writingSessionRecipe') or [])} writing recipe steps",
                f"first task: {(writing_momentum.get('firstWritingTask') or {}).get('taskId') or 'none'}",
            ],
        ))
    if writing_review:
        counts = safe_counts(writing_review)
        cards.append(make_card(
            "Nest writing/research",
            "Writing review desk",
            writing_review,
            priority="attention" if int(counts.get("needsHumanReview") or 0) or int(counts.get("draftsWithReviewFlags") or 0) else "review",
            notes=[
                f"{counts.get('reviewRows', 0)} review rows",
                f"{counts.get('needsHumanReview', 0)} need human review",
                f"{counts.get('draftsWithReviewFlags', 0)} flagged drafts",
                f"{counts.get('reviewNoteTemplates', 0)} review note templates",
                "Canon/publication unchanged",
            ],
        ))
    if writing_daily:
        counts = safe_counts(writing_daily)
        card = make_card(
            "Nest writing/research",
            "Daily writing packet",
            writing_daily,
            priority="attention" if int(counts.get("selectedTasks") or 0) else "review",
            deck_sort_key="00-daily-writing-packet",
            notes=[
                f"{counts.get('selectedTasks', 0)} selected tasks",
                f"{counts.get('availableSessions', 0)} available sessions",
                f"{counts.get('humanReviewRequired', 0)} need human review",
                f"first task: {(writing_daily.get('firstTask') or {}).get('taskId') or 'none'}",
                "Source trail visible; no manuscript replacement",
            ],
        )
        if writing_daily.get("firstTask"):
            card["dailyWritingFirstTask"] = writing_daily.get("firstTask")
        if writing_daily.get("truth"):
            card["dailyWritingTruth"] = writing_daily.get("truth")
        cards.append(card)
    if photo_control:
        counts = safe_counts(photo_control)
        cards.append(make_card(
            "Photo Grove",
            "Photo Grove control room",
            photo_control,
            priority="attention" if int(counts.get("cullBoardCandidateRows") or 0) else "review",
            notes=[
                f"{counts.get('sourcePhotos', 0)} source photos",
                f"{counts.get('cullBoardCandidateRows', 0)} cull candidates",
                f"{counts.get('qualityAttention', 0)} quality attention hints",
                f"{counts.get('decisionEvents', 0)} metadata decision events",
                "machine triage routes attention; humans/agents still decide",
            ],
        ))
    if photo_first_pass:
        counts = safe_counts(photo_first_pass)
        cards.append(make_card(
            "Photo Grove",
            "Photo first-pass triage",
            photo_first_pass,
            priority="attention" if int(counts.get("groups") or 0) else "review",
            deck_sort_key="00-photo-first-pass-triage",
            next_action=photo_first_pass.get("nextSafestAction") or "Open first-pass triage, compare one small group, and rehearse metadata-only direction before any cull decision.",
            notes=[
                f"{counts.get('groups', 0)} first-pass groups",
                f"{counts.get('samples', 0)} sample frames",
                f"{counts.get('dryRunDirections', 0)} dry-run directions",
                "First-pass triage reduces review overwhelm; it does not execute culls.",
                "Original photos stay untouched; any later decision is explicit sidecar metadata.",
            ],
        ))
    if photo_culling_sprint:
        counts = safe_counts(photo_culling_sprint)
        cards.append(make_card(
            "Photo Grove",
            "Culling sprint companion",
            photo_culling_sprint,
            priority="attention" if int(counts.get("sprintCandidateRows") or 0) else "review",
            deck_sort_key="00-culling-sprint-companion",
            notes=[
                f"{counts.get('sprintCandidateRows', 0)} sprint candidates",
                f"{counts.get('comparisonGroups', 0)} comparison groups",
                f"{counts.get('comparisonSamples', 0)} comparison samples",
                f"{counts.get('pending', 0)} pending",
                f"{counts.get('selectedForClientProof', 0)} selected for proof",
                "Culling sprint only; metadata decisions remain explicit and sidecar-only.",
            ],
        ))
    if photo_command_sheet:
        counts = safe_counts(photo_command_sheet)
        cards.append(make_card(
            "Photo Grove",
            "Photo Grove command sheet",
            photo_command_sheet,
            priority="attention" if int(counts.get("safeFirstActions") or counts.get("commands") or 0) else "review",
            deck_sort_key="05-photo-grove-command-sheet",
            next_action=photo_command_sheet.get("nextSafestAction") or "Open source evidence first, dry-run any metadata command, and only write sidecar metadata after review intent is explicit.",
            notes=[
                f"{counts.get('commands', 0)} metadata command suggestions",
                f"{counts.get('groups', 0)} review groups",
                f"{counts.get('safeFirstActions', 0)} source-evidence first actions",
                "Command sheet only; it does not execute culls.",
                "Original photos stay untouched; any decision is sidecar metadata.",
            ],
        ))
    if photo_first_keepers:
        counts = safe_counts(photo_first_keepers)
        cards.append(make_card(
            "Photo Grove",
            "First keepers",
            photo_first_keepers,
            priority="attention" if int(counts.get("candidatePhotos") or 0) else "review",
            deck_sort_key="03-photo-first-keepers",
            next_action=photo_first_keepers.get("nextSafestAction") or "Open likely keeper evidence and compare visually before changing any metadata.",
            notes=[
                f"{counts.get('candidatePhotos', 0)} first-keeper candidates",
                f"{counts.get('candidateGroups', 0)} candidate groups",
                f"{counts.get('pending', 0)} pending",
                "Attention narrowing only; not an auto-cull.",
                "Original photos and metadata decisions stay unchanged.",
            ],
        ))
    if photo_keeper_desk:
        counts = safe_counts(photo_keeper_desk)
        cards.append(make_card(
            "Photo Grove",
            "Keeper Desk",
            photo_keeper_desk,
            priority="attention" if int(counts.get("firstKeeperCandidates") or 0) else "review",
            deck_sort_key="02-photo-keeper-desk",
            next_action=photo_keeper_desk.get("nextSafestAction") or "Use the Keeper Desk as the Photo Grove start-here surface.",
            notes=[
                f"{counts.get('sourcePhotos', 0)} source photos",
                f"{counts.get('firstKeeperCandidates', 0)} keeper candidates",
                f"{counts.get('cullSuggestionGroups', 0)} suggestion groups",
                f"{counts.get('metadataCommandRows', 0)} metadata command rows",
                "Local evidence desk only; no delivery or publication truth.",
            ],
        ))
    if photo_decision:
        counts = safe_counts(photo_decision)
        cards.append(make_card(
            "Photo Grove",
            "Decision desk",
            photo_decision,
            priority="attention",
            notes=[
                f"{counts.get('total', 0)} indexed photos",
                f"{counts.get('nextCandidateRows', 0)} next candidates",
                f"{counts.get('visualCandidateRows', 0)} visual candidates",
                f"{counts.get('pending', 0)} pending",
                f"{counts.get('review', 0)} review",
            ],
        ))
    if photo_cull:
        counts = safe_counts(photo_cull)
        cards.append(make_card(
            "Photo Grove",
            "Cull board",
            photo_cull,
            priority="attention" if int(counts.get("candidateRows") or 0) else "review",
            notes=[
                f"{counts.get('candidateRows', 0)} candidate cards",
                f"{counts.get('pending', 0)} pending",
                f"{counts.get('review', 0)} review-routed",
                "Dry-run decisions first",
            ],
        ))
    if photo_review_session:
        counts = safe_counts(photo_review_session)
        cards.append(make_card(
            "Photo Grove",
            "Focused review session",
            photo_review_session,
            priority="attention" if int(counts.get("sessionRows") or 0) else "review",
            notes=[
                f"{counts.get('sessionRows', 0)} review rows",
                f"{counts.get('groups', 0)} groups",
                f"{counts.get('thumbnailsPresent', 0)} thumbnails present",
                f"{counts.get('dryRunCommands', 0)} dry-run commands",
            ],
        ))
    if photo_proof:
        cards.append(make_card(
            "Photo Grove",
            "Client proof prep",
            photo_proof,
            priority="review",
            notes=["Proof packet prep only", "Originals preserved"],
        ))
    if photo_client_packet:
        counts = safe_counts(photo_client_packet)
        selected_count = int(counts.get("selected") or 0)
        starter_rows = int(counts.get("starterReviewDeckRows") or photo_client_packet.get("starterReviewDeckCount") or counts.get("candidateStarterSet") or 0)
        cards.append(make_card(
            "Photo Grove",
            "Starter review deck" if selected_count == 0 else "Client proof packet",
            photo_client_packet,
            priority="attention" if selected_count == 0 else "review",
            notes=[
                f"{counts.get('total', 0)} photos tracked",
                f"{counts.get('candidateStarterSet', 0)} starter candidates",
                f"{starter_rows} starter review rows",
                f"{selected_count} selected",
                f"{counts.get('review', 0)} review",
                f"{len(photo_client_packet.get('proofPrepRecipe') or [])} proof prep steps",
                "Starter deck only; not client-facing" if selected_count == 0 else "Selected set exists; still needs approval",
                "No client delivery until explicit approval",
            ],
        ))
    if studio360_control:
        counts = safe_counts(studio360_control)
        cards.append(make_card(
            "360 workflow",
            "Studio360 proof control room",
            studio360_control,
            priority="attention" if int(counts.get("repairTickets") or 0) or int(counts.get("readyToRunProofRows") or 0) else "review",
            deck_sort_key="00-studio360-proof-control-room",
            notes=[
                f"{counts.get('readyGroupsCanContinue', 0)} ready groups can continue",
                f"{counts.get('readyRenderRecipesCanContinue', 0)} ready render recipes",
                f"{counts.get('repairTickets', 0)} repair tickets parked",
                f"{counts.get('proofOutputsPresent', 0)} proof outputs present",
                "repairs stay visible without freezing ready 360 proof work",
            ],
        ))
    if studio360_source_desk:
        counts = safe_counts(studio360_source_desk)
        cards.append(make_card(
            "360 workflow",
            "Studio360 Source Desk",
            studio360_source_desk,
            priority="attention" if int(counts.get("repairTickets") or 0) or int(counts.get("readyToRunProofRows") or 0) else "review",
            deck_sort_key="01-studio360-source-desk",
            next_action=studio360_source_desk.get("nextSafestAction") or "Open the Studio360 Source Desk before repair, proof, reframe, or export decisions.",
            notes=[
                f"{counts.get('assets', 0)} assets",
                f"{counts.get('groups', 0)} groups",
                f"{counts.get('reframeReady', 0)} reframe-ready groups",
                f"{counts.get('repairTickets', 0)} repair tickets",
                f"{counts.get('readyToRunProofRows', 0)} proof rows ready",
                "Desk opens first; operator runway stays inside it.",
            ],
        ))
    if studio360:
        counts = safe_counts(studio360)
        cards.append(make_card(
            "360 workflow",
            "Reframe/export desk",
            studio360,
            priority="attention",
            deck_sort_key="20-reframe-export-desk",
            notes=[
                f"{counts.get('assets', 0)} assets",
                f"{counts.get('readyRecipes', 0)} ready recipes",
                f"{counts.get('repairTickets', 0)} repair tickets",
                f"{counts.get('proofRenderReceipts', 0)} proof receipts",
            ],
        ))
    if renderer:
        cards.append(make_card(
            "360 workflow",
            "Renderer preflight",
            renderer,
            priority="review",
            notes=["Run proof renders before full renders", "No upload/publication"],
        ))
    if proof_next:
        counts = safe_counts(proof_next)
        cards.append(make_card(
            "360 workflow",
            "Proof next brief",
            proof_next,
            priority="attention" if int(counts.get("proofOutputsNotYetRendered") or 0) else "review",
            deck_sort_key="10-proof-next-brief",
            notes=[
                f"{counts.get('selectedRows', 0)} proof candidates",
                f"{counts.get('readyToRunProofRows', 0)} ready-to-run proofs",
                f"{counts.get('proofOutputsNotYetRendered', 0)} not yet rendered",
                f"{counts.get('proofSourceRowsPresent', 0)} sources present",
                f"first candidate: {(proof_next.get('firstProofCandidate') or {}).get('candidateId') or 'none'}",
                "Operator-run proof commands only",
            ],
        ))
    if proof_review:
        counts = safe_counts(proof_review)
        cards.append(make_card(
            "360 workflow",
            "Proof review desk",
            proof_review,
            priority="review",
            notes=[
                f"{counts.get('outputsPresent', 0)}/{counts.get('entries', 0)} proof outputs present",
                f"{counts.get('outputsMissing', 0)} missing proof outputs",
                "Review proof derivatives before full renders",
            ],
        ))
    if return_brief:
        return_counts = safe_counts(return_brief)
        cards.append(make_card(
            "Quipsly OS",
            "Return brief",
            return_brief,
            priority="review",
            deck_sort_key="00-return-brief",
            notes=[
                f"{return_counts.get('topQueue', 0)} top-queue items",
                f"{return_counts.get('returnReviewPathSteps', 0)} first-calm-hour steps",
                "Use this as the re-entry front door before acting on attention cards.",
            ],
        ))
    if human_help:
        counts = safe_counts(human_help)
        cards.append(make_card(
            "Quipsly OS",
            "Human help board",
            human_help,
            priority="attention" if int(counts.get("blockers") or 0) or int(counts.get("syncReviewNeeded") or 0) else "review",
            notes=[
                f"{counts.get('helpItems', 0)} help items",
                f"{counts.get('blockers', 0)} blockers",
                f"{counts.get('syncReviewNeeded', 0)} sync reviews",
                f"{counts.get('externalApprovalNeeded', 0)} approval-needed items",
            ],
        ))
    if validation:
        counts = safe_counts(validation)
        cards.append(make_card(
            "Quipsly OS",
            "Validation report",
            validation,
            priority="ready" if int(counts.get("failures") or 0) == 0 else "attention",
            notes=[
                f"{counts.get('passed', 0)} passed checks",
                f"{counts.get('failures', 0)} failures",
                f"{counts.get('warnings', 0)} warnings",
            ],
        ))
    return cards


def priority_rank(priority: str) -> int:
    return {"attention": 0, "review": 1, "ready": 2}.get(priority, 3)


def lane_rank(lane: str) -> int:
    order = {
        "Studio podcast/video": 0,
        "Tower publishing/social": 1,
        "Nest writing/research": 2,
        "Photo Grove": 3,
        "360 workflow": 4,
        "Quipsly OS": 5,
    }
    return order.get(lane, 99)


def card_rank(title: str) -> int:
    order = {
        "Episode package quality": 0,
        "Shorts review cockpit": 1,
        "Episode 1 v004 promotion plan": 2,
        "Episode 4 sync investigation": 3,
        "Publisher desk": 0,
        "Review unblock brief": 1,
        "Review command sheet": 2,
        "Author desk": 0,
        "Writing publication runway": 1,
        "Decision desk": 0,
        "Focused review session": 1,
        "Client proof prep": 2,
        "Reframe/export desk": 0,
        "Renderer preflight": 1,
        "Proof next brief": 2,
        "Proof review desk": 3,
        "Human help board": 0,
        "Return brief": 1,
        "Validation report": 2,
    }
    return order.get(title, 99)


def summarize(cards: list[dict[str, Any]]) -> dict[str, Any]:
    lanes = sorted({str(card.get("lane") or "Unknown") for card in cards})
    return {
        "cards": len(cards),
        "lanes": len(lanes),
        "attentionCards": sum(1 for card in cards if card.get("priority") == "attention"),
        "reviewCards": sum(1 for card in cards if card.get("priority") == "review"),
        "readyCards": sum(1 for card in cards if card.get("priority") == "ready"),
        "externalPublishing": False,
        "externalSchedulesCreated": False,
        "receiptTruthCreated": False,
        "originalsMutated": False,
        "versionsOverwritten": False,
    }


def sorted_cards(cards: list[dict[str, Any]]) -> list[dict[str, Any]]:
    return sorted(
        cards,
        key=lambda card: (
            priority_rank(str(card.get("priority"))),
            lane_rank(str(card.get("lane"))),
            card_rank(str(card.get("title"))),
            str(card.get("lane")),
            str(card.get("title")),
        ),
    )


def runway_status(counts: dict[str, Any]) -> str:
    if int(counts.get("attentionCards") or 0) > 0:
        return "production-runway-attention-first"
    if int(counts.get("reviewCards") or 0) > 0:
        return "production-runway-review-first"
    return "production-runway-ready"


def render_html(payload: dict[str, Any]) -> str:
    counts = payload["counts"]
    cards = sorted_cards(payload["cards"])
    loops = payload.get("operatingLoops") if isinstance(payload.get("operatingLoops"), list) else []
    loop_html = []
    for loop in loops:
        steps = "".join(
            "<li>"
            f"<strong>{html.escape(str(step.get('label') or 'Step'))}</strong>"
            f"<span>{html.escape(str(step.get('description') or ''))}</span>"
            f"<code>{html.escape(str(step.get('command') or ''))}</code>"
            f"<em>{html.escape(str(step.get('safety') or 'Local/reversible step.'))}</em>"
            "</li>"
            for step in (loop.get("steps") or [])
            if isinstance(step, dict)
        )
        loop_html.append(f"""
        <article class="loop-card">
          <div class="card-head">
            <div>
              <p class="eyebrow">{html.escape(str(loop.get('lane') or 'Quipsly'))}</p>
              <h2>{html.escape(str(loop.get('label') or 'Operating loop'))}</h2>
            </div>
            <span class="pill">{html.escape(str(loop.get('status') or 'ready'))}</span>
          </div>
          <p class="next">{html.escape(str(loop.get('nextSafestAction') or loop.get('humanAsk') or 'Open the local evidence and make one reversible move.'))}</p>
          <code>{html.escape(str(loop.get('firstStepCommand') or loop.get('openCommand') or ''))}</code>
          <p class="safety">{html.escape(str(loop.get('firstStepSafety') or loop.get('truth') or 'Local evidence only.'))}</p>
          {f"<ol>{steps}</ol>" if steps else ""}
        </article>
        """)
    card_html = []
    for card in cards:
        notes = "".join(f"<li>{html.escape(str(note))}</li>" for note in card.get("notes") or [])
        action = card.get("firstSafeAction") or {}
        command = html.escape(str(action.get("command") or card.get("openCommand") or ""))
        detail_blocks: list[str] = []
        if card.get("approvalRunwaySummary"):
            detail_blocks.append(
                "<details><summary>Approval runway summary</summary><pre>"
                + html.escape(json.dumps(card.get("approvalRunwaySummary")[:8], indent=2))
                + "</pre></details>"
            )
        if card.get("plainEnglishDurationSummary") or card.get("durationSpreadSeconds"):
            sync_detail = {
                "plainEnglishDurationSummary": card.get("plainEnglishDurationSummary"),
                "durationSpreadSeconds": card.get("durationSpreadSeconds"),
                "spreadLabel": card.get("spreadLabel"),
                "videoDurationSeconds": card.get("videoDurationSeconds"),
                "audioDurationSeconds": card.get("audioDurationSeconds"),
                "worksheetPath": card.get("worksheetPath"),
                "firstDryRunReviewCommand": card.get("firstDryRunReviewCommand"),
                "unblocksWhen": card.get("unblocksWhen"),
            }
            detail_blocks.append(
                "<details open><summary>Sync investigation evidence</summary><pre>"
                + html.escape(json.dumps({k: v for k, v in sync_detail.items() if v not in (None, "", [], {})}, indent=2))
                + "</pre></details>"
            )
        if card.get("writingSessionRecipe"):
            detail_blocks.append(
                "<details><summary>Writing session recipe</summary><pre>"
                + html.escape(json.dumps(card.get("writingSessionRecipe"), indent=2))
                + "</pre></details>"
            )
        if card.get("dailyWritingFirstTask"):
            detail_blocks.append(
                "<details open><summary>Daily writing first task</summary><pre>"
                + html.escape(json.dumps(card.get("dailyWritingFirstTask"), indent=2))
                + "</pre></details>"
            )
        if card.get("firstWritingTask"):
            detail_blocks.append(
                "<details><summary>First writing task</summary><pre>"
                + html.escape(json.dumps(card.get("firstWritingTask"), indent=2))
                + "</pre></details>"
            )
        if card.get("firstReviewTarget"):
            detail_blocks.append(
                "<details open><summary>First writing review target</summary><pre>"
                + html.escape(json.dumps(card.get("firstReviewTarget"), indent=2))
                + "</pre></details>"
            )
        if card.get("firstReviewNoteTemplate"):
            detail_blocks.append(
                "<details><summary>Writing review note template</summary><pre>"
                + html.escape(json.dumps(card.get("firstReviewNoteTemplate"), indent=2))
                + "</pre></details>"
            )
        if card.get("firstProofCandidate"):
            detail_blocks.append(
                "<details open><summary>First proof candidate</summary><pre>"
                + html.escape(json.dumps(card.get("firstProofCandidate"), indent=2))
                + "</pre></details>"
            )
        if card.get("proofReviewRecipe"):
            detail_blocks.append(
                "<details><summary>Proof review recipe</summary><pre>"
                + html.escape(json.dumps(card.get("proofReviewRecipe"), indent=2))
                + "</pre></details>"
            )
        if card.get("firstStarterCandidate") or card.get("firstCandidateStarter"):
            detail_blocks.append(
                "<details open><summary>First Photo Grove starter</summary><pre>"
                + html.escape(json.dumps(card.get("firstStarterCandidate") or card.get("firstCandidateStarter"), indent=2))
                + "</pre></details>"
            )
        if card.get("starterReviewDeck"):
            detail_blocks.append(
                "<details><summary>Photo Grove starter review deck</summary><pre>"
                + html.escape(json.dumps(card.get("starterReviewDeck"), indent=2))
                + "</pre></details>"
            )
        if card.get("firstCullSuggestionGroup"):
            detail_blocks.append(
                "<details open><summary>First Photo Grove cull group</summary><pre>"
                + html.escape(json.dumps(card.get("firstCullSuggestionGroup"), indent=2))
                + "</pre></details>"
            )
        if card.get("cullSuggestionSummary"):
            detail_blocks.append(
                "<details><summary>Photo cull suggestion summary</summary><pre>"
                + html.escape(json.dumps(card.get("cullSuggestionSummary"), indent=2))
                + "</pre></details>"
            )
        if card.get("proofPrepRecipe"):
            detail_blocks.append(
                "<details><summary>Photo proof prep recipe</summary><pre>"
                + html.escape(json.dumps(card.get("proofPrepRecipe"), indent=2))
                + "</pre></details>"
            )
        for key, title, open_attr in [
            ("twentyFiveMinuteWritingPlan", "25-minute writing plan", " open"),
            ("machineTriageSummary", "Photo Grove machine triage", " open"),
            ("readyContinuationPlan", "360 ready continuation plan", " open"),
            ("repairLaneBoundary", "360 repair/ready lane boundary", ""),
            ("approvalRequestTemplate", "Tower approval request template", " open"),
            ("receiptCaptureTemplate", "Tower receipt capture template", ""),
            ("productionWorkSessionLaunchers", "Tower production work-session launchers", " open"),
            ("externalControlRoomArtifacts", "External control-room artifacts", ""),
        ]:
            if card.get(key):
                detail_blocks.append(
                    f"<details{open_attr}><summary>{html.escape(title)}</summary><pre>"
                    + html.escape(json.dumps(card.get(key), indent=2))
                    + "</pre></details>"
                )
        card_html.append(f"""
        <article class="card {html.escape(str(card.get('priority') or 'review'))}">
          <div class="card-head">
            <div>
              <p class="eyebrow">{html.escape(str(card.get('lane') or 'Quipsly'))}</p>
              <h2>{html.escape(str(card.get('title') or 'Open evidence'))}</h2>
            </div>
            <span class="pill">{html.escape(str(card.get('status') or 'ready'))}</span>
          </div>
          <p class="next">{html.escape(str(card.get('nextSafestAction') or 'Open evidence and choose the next reversible action.'))}</p>
          {f"<ul>{notes}</ul>" if notes else ""}
          <code>{command}</code>
          <p class="safety">{html.escape(str(action.get('safety') or card.get('truth') or 'Local evidence only.'))}</p>
          {''.join(detail_blocks)}
        </article>
        """)
    return f"""<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Quipsly Production Runway</title>
<style>
:root {{
  --soil:#1f1812; --moss:#6f8f5d; --fern:#9fbd80; --honey:#f3c557; --clay:#df7b52;
  --cream:#f7eedc; --muted:#c8b99f; --panel:rgba(255,248,229,.08); --line:rgba(255,248,229,.16);
  --creek:#69c7d1;
}}
* {{ box-sizing:border-box; }}
body {{ margin:0; color:var(--cream); font-family:Avenir Next, ui-sans-serif, system-ui, sans-serif;
  background: radial-gradient(circle at 10% 5%, rgba(111,143,93,.26), transparent 32rem),
              radial-gradient(circle at 95% 8%, rgba(243,197,87,.12), transparent 28rem),
              linear-gradient(135deg,#111712,var(--soil));
}}
main {{ max-width:1240px; margin:0 auto; padding:42px 24px 70px; }}
.hero {{ padding:34px; border:1px solid var(--line); border-radius:30px; background:rgba(18,22,16,.76); box-shadow:0 24px 80px rgba(0,0,0,.34); }}
.eyebrow {{ margin:0 0 8px; color:var(--honey); letter-spacing:.24em; text-transform:uppercase; font-weight:900; font-size:12px; }}
h1 {{ margin:0; font-size:clamp(38px,7vw,82px); line-height:.91; letter-spacing:-.06em; }}
h2 {{ margin:0; font-size:24px; letter-spacing:-.03em; }}
p {{ color:var(--muted); line-height:1.55; }}
.metrics {{ display:grid; grid-template-columns:repeat(auto-fit,minmax(130px,1fr)); gap:12px; margin-top:24px; }}
.metric {{ border:1px solid var(--line); background:var(--panel); border-radius:18px; padding:14px; }}
.metric strong {{ display:block; font-size:28px; color:var(--fern); }}
.metric span {{ text-transform:uppercase; letter-spacing:.12em; font-size:10px; color:var(--muted); font-weight:900; }}
.loops {{ margin-top:24px; display:grid; grid-template-columns:repeat(auto-fit,minmax(360px,1fr)); gap:18px; }}
.loop-card {{ padding:20px; border-radius:24px; border:1px solid rgba(105,199,209,.32); background:linear-gradient(140deg,rgba(105,199,209,.09),rgba(0,0,0,.22)); }}
.loop-card ol {{ padding-left:21px; color:var(--muted); }}
.loop-card li {{ margin:12px 0; }}
.loop-card li strong {{ display:block; color:var(--cream); }}
.loop-card li span, .loop-card li em {{ display:block; margin:4px 0; color:var(--muted); }}
.cards {{ display:grid; grid-template-columns:repeat(auto-fit,minmax(330px,1fr)); gap:18px; margin-top:26px; }}
.card {{ padding:20px; border-radius:24px; border:1px solid var(--line); background:rgba(0,0,0,.25); }}
.card.attention {{ border-color:rgba(223,123,82,.70); box-shadow:inset 0 0 0 1px rgba(223,123,82,.14); }}
.card.review {{ border-color:rgba(243,197,87,.42); }}
.card.ready {{ border-color:rgba(159,189,128,.45); }}
.card-head {{ display:flex; justify-content:space-between; gap:14px; align-items:flex-start; }}
.pill {{ border-radius:999px; padding:7px 10px; background:rgba(255,255,255,.08); color:var(--honey); font-size:10px; font-weight:900; text-transform:uppercase; letter-spacing:.12em; }}
.next {{ color:var(--cream); font-weight:700; }}
ul {{ color:var(--muted); padding-left:19px; }}
code {{ display:block; white-space:pre-wrap; word-break:break-word; background:rgba(0,0,0,.34); color:var(--creek); border-radius:14px; padding:12px; font-size:12px; }}
.safety {{ font-size:12px; color:#a99c87; }}
details {{ margin-top:12px; }}
summary {{ cursor:pointer; color:var(--honey); font-weight:900; }}
pre {{ white-space:pre-wrap; word-break:break-word; color:var(--muted); background:rgba(0,0,0,.2); border-radius:14px; padding:12px; font-size:11px; }}
</style>
</head>
<body>
<main>
  <section class="hero">
	    <p class="eyebrow">Quipsly Production OS</p>
	    <h1>Start here. Then open the right specialist desk.</h1>
	    <p>This runway reads the latest Studio, Tower, Nest, Photo Grove, 360, and OS evidence. It is a local dispatcher only: it does not approve, publish, upload, schedule, overwrite, delete, capture fake receipts, or mutate originals.</p>
	    <p><strong>Status:</strong> {html.escape(str(payload.get('status') or 'production-runway-ready'))}</p>
	    <p><strong>Human ask:</strong> {html.escape(str(payload.get('humanAsk') or ''))}</p>
	    <p><strong>Codex can keep going:</strong> {html.escape(str(payload.get('agentSafeParallelWork') or ''))}</p>
	    <p><strong>Next safe action:</strong> {html.escape(str(payload.get('nextSafestAction') or 'Open the first specialist desk.'))}</p>
    <div class="metrics">
      <div class="metric"><strong>{counts['cards']}</strong><span>cards</span></div>
      <div class="metric"><strong>{counts['lanes']}</strong><span>lanes</span></div>
      <div class="metric"><strong>{counts['attentionCards']}</strong><span>attention</span></div>
      <div class="metric"><strong>{counts['reviewCards']}</strong><span>review</span></div>
      <div class="metric"><strong>{counts['readyCards']}</strong><span>ready</span></div>
      <div class="metric"><strong>{counts.get('operatingLoops', 0)}</strong><span>loops</span></div>
    </div>
    <p>Generated {html.escape(str(payload['updatedAt']))}. First principle: make the next reversible thing more true, more visible, or more useful.</p>
  </section>
  <section class="loops">{''.join(loop_html)}</section>
  <section class="cards">{''.join(card_html)}</section>
</main>
</body>
</html>"""


def render_markdown(payload: dict[str, Any]) -> str:
    lines = [
        "# Quipsly Production Runway",
        "",
        "Start here, then open the right specialist desk.",
        "",
        f"Generated: `{payload['updatedAt']}`",
        "",
        f"Human ask: {payload.get('humanAsk') or ''}",
        "",
        f"Codex can keep going: {payload.get('agentSafeParallelWork') or ''}",
        "",
        "This artifact is local/read-only. It does not approve, publish, upload, schedule, overwrite, delete, capture fake receipts, or mutate originals.",
        "",
        "## Cards",
        "",
    ]
    lines.extend([
        f"- Status: `{payload.get('status')}`",
        f"- Next safe action: {payload.get('nextSafestAction')}",
        f"- Operating loops: `{len(payload.get('operatingLoops') or [])}`",
        "",
    ])
    if payload.get("operatingLoops"):
        lines.extend(["## Operating loops", ""])
        for loop in payload.get("operatingLoops") or []:
            lines.extend([
                f"### {loop.get('lane')} - {loop.get('label')}",
                "",
                f"- Status: `{loop.get('status')}`",
                f"- Next: {loop.get('nextSafestAction') or loop.get('humanAsk')}",
                "",
                "```bash",
                str(loop.get("firstStepCommand") or loop.get("openCommand") or ""),
                "```",
                "",
                f"Safety: {loop.get('firstStepSafety') or loop.get('truth')}",
                "",
            ])
            for step in loop.get("steps") or []:
                if not isinstance(step, dict):
                    continue
                lines.extend([
                    f"- {step.get('index') or ''} {step.get('label') or 'Step'}: {step.get('description') or ''}",
                ])
            lines.append("")
        lines.extend(["## Cards", ""])
    for card in sorted_cards(payload["cards"]):
        action = card.get("firstSafeAction") or {}
        lines.extend([
            f"### {card.get('lane')} - {card.get('title')}",
            "",
            f"- Priority: `{card.get('priority')}`",
            f"- Status: `{card.get('status')}`",
            f"- Next: {card.get('nextSafestAction')}",
            "",
            "```bash",
            str(action.get("command") or card.get("openCommand") or ""),
            "```",
            "",
            f"Safety: {action.get('safety') or card.get('truth')}",
            "",
        ])
        if card.get("approvalRunwaySummary"):
            lines.extend([
                "Approval runway summary:",
                "```json",
                json.dumps(card.get("approvalRunwaySummary")[:8], indent=2),
                "```",
                "",
            ])
        if card.get("plainEnglishDurationSummary") or card.get("durationSpreadSeconds"):
            sync_detail = {
                "plainEnglishDurationSummary": card.get("plainEnglishDurationSummary"),
                "durationSpreadSeconds": card.get("durationSpreadSeconds"),
                "spreadLabel": card.get("spreadLabel"),
                "videoDurationSeconds": card.get("videoDurationSeconds"),
                "audioDurationSeconds": card.get("audioDurationSeconds"),
                "worksheetPath": card.get("worksheetPath"),
                "firstDryRunReviewCommand": card.get("firstDryRunReviewCommand"),
                "unblocksWhen": card.get("unblocksWhen"),
            }
            lines.extend([
                "Sync investigation evidence:",
                "```json",
                json.dumps({k: v for k, v in sync_detail.items() if v not in (None, "", [], {})}, indent=2),
                "```",
                "",
            ])
        if card.get("writingSessionRecipe"):
            lines.extend([
                "Writing session recipe:",
                "```json",
                json.dumps(card.get("writingSessionRecipe"), indent=2),
                "```",
                "",
            ])
        if card.get("dailyWritingFirstTask"):
            lines.extend([
                "Daily writing first task:",
                "```json",
                json.dumps(card.get("dailyWritingFirstTask"), indent=2),
                "```",
                "",
            ])
        if card.get("firstWritingTask"):
            lines.extend([
                "First writing task:",
                "```json",
                json.dumps(card.get("firstWritingTask"), indent=2),
                "```",
                "",
            ])
        if card.get("firstReviewTarget"):
            lines.extend([
                "First writing review target:",
                "```json",
                json.dumps(card.get("firstReviewTarget"), indent=2),
                "```",
                "",
            ])
        if card.get("firstReviewNoteTemplate"):
            lines.extend([
                "Writing review note template:",
                "```json",
                json.dumps(card.get("firstReviewNoteTemplate"), indent=2),
                "```",
                "",
            ])
        if card.get("firstProofCandidate"):
            lines.extend([
                "First proof candidate:",
                "```json",
                json.dumps(card.get("firstProofCandidate"), indent=2),
                "```",
                "",
            ])
        if card.get("proofReviewRecipe"):
            lines.extend([
                "Proof review recipe:",
                "```json",
                json.dumps(card.get("proofReviewRecipe"), indent=2),
                "```",
                "",
            ])
        if card.get("firstStarterCandidate") or card.get("firstCandidateStarter"):
            lines.extend([
                "First Photo Grove starter:",
                "```json",
                json.dumps(card.get("firstStarterCandidate") or card.get("firstCandidateStarter"), indent=2),
                "```",
                "",
            ])
        if card.get("starterReviewDeck"):
            lines.extend([
                "Photo Grove starter review deck:",
                "```json",
                json.dumps(card.get("starterReviewDeck"), indent=2),
                "```",
                "",
            ])
        if card.get("firstCullSuggestionGroup"):
            lines.extend([
                "First Photo Grove cull group:",
                "```json",
                json.dumps(card.get("firstCullSuggestionGroup"), indent=2),
                "```",
                "",
            ])
        if card.get("cullSuggestionSummary"):
            lines.extend([
                "Photo cull suggestion summary:",
                "```json",
                json.dumps(card.get("cullSuggestionSummary"), indent=2),
                "```",
                "",
            ])
        if card.get("proofPrepRecipe"):
            lines.extend([
                "Photo proof prep recipe:",
                "```json",
                json.dumps(card.get("proofPrepRecipe"), indent=2),
                "```",
                "",
            ])
        for key, title in [
            ("twentyFiveMinuteWritingPlan", "25-minute writing plan"),
            ("machineTriageSummary", "Photo Grove machine triage"),
            ("readyContinuationPlan", "360 ready continuation plan"),
            ("repairLaneBoundary", "360 repair/ready lane boundary"),
            ("approvalRequestTemplate", "Tower approval request template"),
            ("receiptCaptureTemplate", "Tower receipt capture template"),
            ("productionWorkSessionLaunchers", "Tower production work-session launchers"),
            ("externalControlRoomArtifacts", "External control-room artifacts"),
        ]:
            if card.get(key):
                lines.extend([
                    f"{title}:",
                    "```json",
                    json.dumps(card.get(key), indent=2),
                    "```",
                    "",
                ])
    return "\n".join(lines)


def write_csv(path: Path, cards: list[dict[str, Any]]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    fields = ["lane", "title", "priority", "status", "nextSafestAction", "openCommand", "htmlPath"]
    with path.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=fields)
        writer.writeheader()
        for card in cards:
            writer.writerow({key: card.get(key, "") for key in fields})


def build_runway(release_root: Path, os_root: Path, output_root: Path) -> dict[str, Any]:
    cards = build_cards(release_root, os_root)
    counts = summarize(cards)
    return_brief = load_json(os_root / "latest-quipsly-return-brief.json")
    operating_loops = collect_operating_loops(return_brief)
    return_review_path = return_brief.get("returnReviewPath") if isinstance(return_brief.get("returnReviewPath"), list) else []
    return_action = first_action(return_brief) if return_brief else {}
    counts["operatingLoops"] = len(operating_loops)
    counts["returnReviewPathSteps"] = len(return_review_path)
    first_card = sorted_cards(cards)[0] if cards else {}
    first_action_payload = first_card.get("firstSafeAction") if isinstance(first_card.get("firstSafeAction"), dict) else {}
    session_dir = output_root / f"{stamp()}-production-runway"
    json_path = session_dir / "quipsly-production-runway.json"
    html_path = session_dir / "index.html"
    markdown_path = session_dir / "START-HERE-quipsly-production-runway.md"
    csv_path = session_dir / "quipsly-production-runway.csv"
    payload = {
        "schema": SCHEMA,
        "updatedAt": iso_now(),
        "releaseRoot": str(release_root),
        "osRoot": str(os_root),
        "sessionDir": str(session_dir),
        "jsonPath": str(json_path),
        "htmlPath": str(html_path),
        "markdownPath": str(markdown_path),
        "csvPath": str(csv_path),
        "status": runway_status(counts),
        "humanAsk": HUMAN_ASK,
        "agentSafeParallelWork": AGENT_SAFE_PARALLEL_WORK,
        "cards": cards,
        "operatingLoops": operating_loops,
        "returnReviewPath": return_review_path,
        "counts": counts,
        "firstSafeAction": {
            "label": str(return_action.get("label") or (f"Open {first_card.get('lane')}: {first_card.get('title')}" if first_card else "Open Quipsly validation report")),
            "command": str(return_action.get("command") or first_action_payload.get("command") or ""),
            "path": str(return_action.get("path") or first_action_payload.get("path") or first_card.get("htmlPath") or ""),
            "safety": str(return_action.get("safety") or first_action_payload.get("safety") or "Opens local evidence only. No mutation."),
        },
        "nextSafestAction": str(return_brief.get("nextSafestAction") or first_card.get("nextSafestAction") or "Open the first specialist desk and make the next reversible thing more true."),
        "truth": {
            "dispatcherOnly": True,
            "localReadinessIsNotPublication": True,
            "reviewRowsAreNotApprovals": True,
            "receiptSlotsAreNotReceipts": True,
            "noOriginalMutation": True,
        },
        "safety": {
            "externalPublishing": False,
            "externalSchedulesCreated": False,
            "receiptTruthCreated": False,
            "originalsMutated": False,
            "versionsOverwritten": False,
            "exportsCreated": False,
        },
    }
    write_json(json_path, payload)
    html_path.parent.mkdir(parents=True, exist_ok=True)
    html_path.write_text(render_html(payload), encoding="utf-8")
    markdown_path.write_text(render_markdown(payload), encoding="utf-8")
    write_csv(csv_path, cards)
    pointer = output_root / "latest-quipsly-production-runway.json"
    payload["pointerPath"] = str(pointer)
    write_json(json_path, payload)
    write_json(pointer, payload)
    return payload


def main() -> None:
    import argparse

    parser = argparse.ArgumentParser(description="Build a cross-lane Quipsly Production Runway.")
    parser.add_argument("release_root", nargs="?", default=str(DEFAULT_RELEASE_ROOT))
    parser.add_argument("--os-root", default=str(DEFAULT_OS_ROOT))
    parser.add_argument("--output-root", default=str(DEFAULT_OUTPUT_ROOT))
    args = parser.parse_args()
    payload = build_runway(Path(args.release_root), Path(args.os_root), Path(args.output_root))
    print(json.dumps({
        "status": payload["status"],
        "counts": payload["counts"],
        "firstSafeAction": payload["firstSafeAction"],
        "nextSafestAction": payload["nextSafestAction"],
        "returnReviewPathSteps": len(payload.get("returnReviewPath") or []),
        "htmlPath": payload["htmlPath"],
        "jsonPath": payload["jsonPath"],
        "markdownPath": payload["markdownPath"],
        "csvPath": payload["csvPath"],
        "pointerPath": payload["pointerPath"],
        "safety": payload["safety"],
    }, indent=2, sort_keys=True))


if __name__ == "__main__":
    main()
