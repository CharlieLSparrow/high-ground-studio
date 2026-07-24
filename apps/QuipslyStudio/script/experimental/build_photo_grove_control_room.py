#!/usr/bin/env python3
"""Build a single calm Photo Grove control room.

This is the front door for the local photo culling/proof lane. It joins the
existing contact sheets, first-keeper candidates, proof desks, command sheets,
and decision desks into one operator surface without executing any cull command.

Truth boundary:
- originals stay untouched
- review/cull commands are recommendations unless explicitly executed later
- selected-for-proof is local metadata/readiness, not client approval/delivery
"""
from __future__ import annotations

import csv
import html
import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

DEFAULT_PHOTO_ROOT = Path("/Volumes/My Passport/Quipsly Media Workspace/PhotoGrove")
SCHEMA = "quipsly.photo-grove.control-room.v1"
LATEST_POINTER = "latest-photo-grove-control-room.json"

SOURCE_POINTERS = {
    "cardBackupReceipt": "latest-photo-grove-card-backup-receipt.json",
    "cardIntakeRunway": "latest-photo-grove-card-intake-runway.json",
    "cloudDuplicationPlan": "latest-photo-grove-cloud-duplication-plan.json",
    "readyFolderPacket": "latest-photo-grove-ready-folder-packet.json",
    "readyFolderSampler": "latest-photo-grove-ready-folder-sampler.json",
    "readyCullWorksheet": "latest-photo-grove-ready-cull-worksheet.json",
    "readyCullDecisionDraft": "latest-photo-grove-ready-cull-decision-draft.json",
    "readyCullReceiptPreview": "latest-photo-grove-ready-cull-receipt-preview.json",
    "review": "latest-photo-grove-review.json",
    "sourceIntegrity": "latest-photo-grove-source-integrity.json",
    "reviewBatch": "latest-photo-grove-review-batch.json",
    "cullSuggestions": "latest-photo-grove-cull-suggestions.json",
    "firstKeepers": "latest-photo-grove-first-keepers.json",
    "contactSheet": "latest-photo-grove-contact-sheet.json",
    "reviewSession": "latest-photo-grove-review-session.json",
    "cullingSprint": "latest-photo-grove-culling-sprint-companion.json",
    "commandSheet": "latest-photo-grove-command-sheet.json",
    "keeperDesk": "latest-photo-grove-keeper-desk.json",
    "proofDesk": "latest-photo-grove-proof-desk.json",
    "decisionDesk": "latest-photo-grove-decision-desk.json",
    "cullBoard": "latest-photo-grove-cull-board.json",
    "clientProof": "latest-photo-grove-client-proof-packet.json",
    "exportPrep": "latest-photo-grove-export-prep.json",
    "cullRehearsal": "latest-photo-grove-cull-rehearsal.json",
    "firstPassTriage": "latest-photo-grove-first-pass-triage.json",
    "nextCullCard": "latest-photo-grove-next-cull-card.json",
}


def iso_now() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def stamp() -> str:
    return datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S-%f-photo-grove-control-room")


def load_json(path: Path, *, _depth: int = 0) -> dict[str, Any]:
    if not path.exists():
        return {}
    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        return {}
    if not isinstance(payload, dict):
        return {}
    if _depth == 0 and payload.get("jsonPath"):
        target = Path(str(payload.get("jsonPath") or ""))
        if target.exists() and target != path:
            target_payload = load_json(target, _depth=1)
            if target_payload:
                return {**payload, **target_payload}
    return payload


def write_json(path: Path, payload: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, indent=2, sort_keys=True) + "\n", encoding="utf-8")


def shell_quote(value: str) -> str:
    return "'" + value.replace("'", "'\\''") + "'"


def safe_count(payload: dict[str, Any], *keys: str) -> int:
    counts = payload.get("counts") if isinstance(payload.get("counts"), dict) else {}
    for key in keys:
        value = counts.get(key)
        if isinstance(value, bool):
            continue
        if isinstance(value, (int, float)):
            return int(value)
    return 0


def first_truthy(*values: Any) -> Any:
    for value in values:
        if value not in (None, "", [], {}):
            return value
    return ""


def collect_parts(photo_root: Path) -> tuple[dict[str, dict[str, Any]], dict[str, str]]:
    parts: dict[str, dict[str, Any]] = {}
    pointer_paths: dict[str, str] = {}
    for key, filename in SOURCE_POINTERS.items():
        path = photo_root / filename
        pointer_paths[key] = str(path)
        parts[key] = load_json(path)
    return parts, pointer_paths


def build_counts(parts: dict[str, dict[str, Any]]) -> dict[str, Any]:
    card_backup = parts.get("cardBackupReceipt", {})
    card_intake = parts.get("cardIntakeRunway", {})
    cloud_plan = parts.get("cloudDuplicationPlan", {})
    ready_folder = parts.get("readyFolderPacket", {})
    ready_sampler = parts.get("readyFolderSampler", {})
    ready_cull = parts.get("readyCullWorksheet", {})
    ready_cull_draft = parts.get("readyCullDecisionDraft", {})
    ready_cull_preview = parts.get("readyCullReceiptPreview", {})
    review = parts.get("review", {})
    source_integrity = parts.get("sourceIntegrity", {})
    contact = parts.get("contactSheet", {})
    proof = parts.get("proofDesk", {})
    client = parts.get("clientProof", {})
    export_prep = parts.get("exportPrep", {})
    first_keepers = parts.get("firstKeepers", {})
    culling_sprint = parts.get("cullingSprint", {})
    command_sheet = parts.get("commandSheet", {})
    decision_desk = parts.get("decisionDesk", {})
    review_session = parts.get("reviewSession", {})
    cull_rehearsal = parts.get("cullRehearsal", {})
    cull_board = parts.get("cullBoard", {})
    first_pass = parts.get("firstPassTriage", {})
    return {
        "sourcePhotos": first_truthy(
            safe_count(culling_sprint, "sourcePhotos"),
            safe_count(proof, "sourcePhotos"),
            safe_count(review, "total"),
            safe_count(contact, "totalPhotos"),
        ),
        "pending": first_truthy(
            safe_count(culling_sprint, "pending"),
            safe_count(client, "pending"),
            safe_count(contact, "pending"),
            safe_count(review, "pendingReview", "pending"),
        ),
        "review": first_truthy(
            safe_count(culling_sprint, "review"),
            safe_count(client, "review"),
            safe_count(contact, "review"),
            safe_count(review, "review"),
        ),
        "selectedForClientProof": first_truthy(
            safe_count(export_prep, "selectedForClientProof"),
            safe_count(culling_sprint, "selectedForClientProof"),
            safe_count(client, "selectedForClientProof", "selected"),
            safe_count(contact, "selectedForClientProof"),
        ),
        "firstKeeperCandidates": first_truthy(
            safe_count(first_keepers, "candidatePhotos"),
            safe_count(proof, "firstKeeperCandidates"),
        ),
        "firstKeeperGroups": first_truthy(
            safe_count(first_keepers, "candidateGroups"),
            safe_count(proof, "sourceGroups"),
        ),
        "contactSheetGroups": safe_count(contact, "contactSheetGroups"),
        "contactSheetSamples": safe_count(contact, "contactSheetSamples"),
        "qualityAttention": first_truthy(
            safe_count(client, "qualityAttention"),
            safe_count(review, "problemOrReviewFlags"),
            safe_count(contact, "qualityReviewCandidates"),
        ),
        "commandRows": first_truthy(
            safe_count(command_sheet, "commands"),
            safe_count(proof, "metadataCommandRows"),
        ),
        "dryRunCommands": safe_count(review_session, "dryRunCommands"),
        "reviewSessionRows": safe_count(review_session, "sessionRows"),
        "reviewSessionGroups": safe_count(review_session, "groups"),
        "reviewSessionSourceExists": safe_count(review_session, "sourceExists"),
        "reviewSessionThumbnailsPresent": safe_count(review_session, "thumbnailsPresent"),
        "decisionEvents": safe_count(decision_desk, "events"),
        "decisionReceiptJsonFiles": safe_count(decision_desk, "decisionReceiptJsonFiles"),
        "cullBoardCandidateRows": safe_count(cull_board, "candidateRows"),
        "cullRehearsalRows": safe_count(cull_rehearsal, "rehearsalRows"),
        "cullRehearsalDryRunPreviews": safe_count(cull_rehearsal, "dryRunPreviews"),
        "cullRehearsalErrors": safe_count(cull_rehearsal, "dryRunPreviewErrors"),
        "firstPassTriageGroups": safe_count(first_pass, "groups"),
        "firstPassTriageSamples": safe_count(first_pass, "samples"),
        "firstPassTriageDryRunDirections": safe_count(first_pass, "dryRunDirections"),
        "cardBackupMatched": safe_count(card_backup, "matched"),
        "cardBackupMissingDestination": safe_count(card_backup, "missingDestination"),
        "cardBackupSizeMismatch": safe_count(card_backup, "sizeMismatch"),
        "cardBackupExtraDestination": safe_count(card_backup, "extraDestination"),
        "cardBackupFolderCount": safe_count(card_backup, "folderCount"),
        "cardBackupReadyFolderCount": safe_count(card_backup, "readyFolderCount"),
        "cardBackupIncompleteFolderCount": safe_count(card_backup, "incompleteFolderCount"),
        "cardBackupActiveProcesses": safe_count(card_backup, "activeBackupProcesses"),
        "cardBackupComplete": bool((card_backup.get("counts") or {}).get("backupComplete")) if isinstance(card_backup, dict) else False,
        "cardIntakeMissingDestination": safe_count(card_intake, "missingDestination"),
        "cardIntakeWorksheetRows": safe_count(card_intake, "readyCullWorksheetRows"),
        "cloudDuplicationMissingDestination": safe_count(cloud_plan, "missingDestination"),
        "cloudDuplicationSizeMismatch": safe_count(cloud_plan, "sizeMismatch"),
        "readyFolderPacketReadyFolders": safe_count(ready_folder, "readyFolders"),
        "readyFolderPacketQuarantinedFolders": safe_count(ready_folder, "quarantinedFolders"),
        "readyFolderPacketReadyMediaRows": safe_count(ready_folder, "readyMediaRows"),
        "readyFolderPacketQuarantinedMissingDestination": safe_count(ready_folder, "quarantinedMissingDestination"),
        "readyFolderSamplerSampledFiles": safe_count(ready_sampler, "sampledFiles"),
        "readyFolderSamplerThumbnailsPresent": safe_count(ready_sampler, "thumbnailsPresent"),
        "readyFolderSamplerThumbnailFailures": safe_count(ready_sampler, "thumbnailFailures"),
        "readyCullWorksheetRows": safe_count(ready_cull, "worksheetRows"),
        "readyCullUnreviewedRows": safe_count(ready_cull, "unreviewedRows"),
        "readyCullThumbnailsPresent": safe_count(ready_cull, "thumbnailsPresent"),
        "readyCullAppliedDecisions": safe_count(ready_cull, "appliedDecisions"),
        "readyCullDraftRows": safe_count(ready_cull_draft, "draftRows"),
        "readyCullDraftActionableDecisionRows": safe_count(ready_cull_draft, "actionableDecisionRows"),
        "readyCullDraftUnknownWorksheetIds": safe_count(ready_cull_draft, "unknownWorksheetIds"),
        "readyCullPreviewDecisionRows": safe_count(ready_cull_preview, "decisionRows"),
        "readyCullPreviewActionableDecisionRows": safe_count(ready_cull_preview, "actionableDecisionRows"),
        "readyCullPreviewInvalidRows": safe_count(ready_cull_preview, "invalidRows"),
        "readyCullPreviewMissingSourceRows": safe_count(ready_cull_preview, "missingSourceRows"),
        "sourceIntegrityTotal": safe_count(source_integrity, "total"),
        "sourceIntegrityPresent": safe_count(source_integrity, "sourceExists"),
        "sourceIntegrityMissing": safe_count(source_integrity, "sourceMissing"),
        "sourceIntegrityDuplicateGroups": safe_count(source_integrity, "duplicateHashGroups"),
        "clientDeliveryCreated": False,
        "externalPublishing": False,
        "metadataChanged": False,
        "originalsMutated": False,
        "selectedProofItems": safe_count(proof, "clientProofItems"),
        "exportPrepSelectedForClientProof": safe_count(export_prep, "selectedForClientProof"),
        "exportPrepNeedsHumanAttention": safe_count(export_prep, "needsHumanAttention"),
        "exportPrepQualityReviewCandidates": safe_count(export_prep, "qualityReviewCandidates"),
        "exportPrepCopyPlanRows": int(export_prep.get("copyPlanRows") or safe_count(export_prep, "copyPlanRows") or 0),
        "exportPrepCopyPlanExecuted": bool(export_prep.get("copyPlanExecuted")) if isinstance(export_prep, dict) else False,
    }


def artifact_row(key: str, payload: dict[str, Any]) -> dict[str, Any]:
    counts = payload.get("counts") if isinstance(payload.get("counts"), dict) else {}
    return {
        "key": key,
        "status": payload.get("status") or "missing",
        "htmlPath": payload.get("htmlPath") or "",
        "jsonPath": payload.get("jsonPath") or "",
        "markdownPath": payload.get("markdownPath") or "",
        "csvPath": payload.get("csvPath") or payload.get("worksheetPath") or "",
        "counts": counts,
    }


def build_actions(parts: dict[str, dict[str, Any]], counts: dict[str, Any]) -> list[dict[str, Any]]:
    def open_action(key: str, label: str, why: str, safety: str) -> dict[str, Any]:
        payload = parts.get(key, {})
        path = str(payload.get("htmlPath") or payload.get("markdownPath") or payload.get("jsonPath") or "")
        return {
            "id": f"photo-grove-{key}",
            "label": label,
            "why": why,
            "path": path,
            "command": f"open {shell_quote(path)}" if path else "",
            "safety": safety,
        }

    actions = [
        open_action(
            "cardBackupReceipt",
            "Open card backup receipt",
            f"Check whether the mounted card has fully landed on the external backup: {counts.get('cardBackupMatched', 0)} matched, {counts.get('cardBackupMissingDestination', 0)} missing, {counts.get('cardBackupSizeMismatch', 0)} size mismatch, {counts.get('cardBackupActiveProcesses', 0)} active copy process(es).",
            "Read-only backup receipt. No copy, deletion, metadata, originals, exports, deliveries, uploads, or publication state change.",
        ),
        open_action(
            "cardIntakeRunway",
            "Open card intake runway",
            f"See the calm operator runway for this memory card: {counts.get('cardIntakeMissingDestination', 0)} files still missing from backup and {counts.get('cardIntakeWorksheetRows', 0)} sampled cull row(s) ready now.",
            "Read-only coordination artifact. It does not copy media, mutate originals, write metadata, upload, publish, delete, or approve cull decisions.",
        ),
        open_action(
            "cloudDuplicationPlan",
            "Open cloud duplication plan",
            f"Prepare Google Drive, Google Photos, and GCS duplication routes without uploading partial media; local missing={counts.get('cloudDuplicationMissingDestination', 0)}, mismatches={counts.get('cloudDuplicationSizeMismatch', 0)}.",
            "Planning artifact only. No cloud upload, album creation, bucket object creation, external mutation, publication receipt, metadata write, delete, or approval action is performed.",
        ),
        open_action(
            "readyFolderPacket",
            "Open ready folder packet",
            f"Use {counts.get('readyFolderPacketReadyFolders', 0)} complete folder(s) now and keep {counts.get('readyFolderPacketQuarantinedFolders', 0)} folder(s) quarantined until backup completes.",
            "Read-only ready-folder surface. No copy, deletion, metadata, originals, exports, deliveries, uploads, or publication state change.",
        ),
        open_action(
            "readyFolderSampler",
            "Open ready folder sampler",
            f"Review {counts.get('readyFolderSamplerSampledFiles', 0)} sampled image(s) from complete backup folders; thumbnails present: {counts.get('readyFolderSamplerThumbnailsPresent', 0)}.",
            "Read-only sampler. Writes only Photo Grove-managed thumbnails and reports; no metadata, originals, exports, deliveries, uploads, or publication state change.",
        ),
        open_action(
            "readyCullWorksheet",
            "Open ready cull worksheet",
            f"Review {counts.get('readyCullWorksheetRows', 0)} sampled row(s) with a sidecar-only keep/reject/review/favorite vocabulary; applied decisions: {counts.get('readyCullAppliedDecisions', 0)}.",
            "Read-only/sidecar worksheet. No metadata, originals, exports, deliveries, uploads, publication state, keep/reject truth, or approval state is changed.",
        ),
        open_action(
            "readyCullDecisionDraft",
            "Open ready cull decision draft",
            f"Inspect sidecar cull intent before any receipt preview: {counts.get('readyCullDraftRows', 0)} draft row(s), {counts.get('readyCullDraftActionableDecisionRows', 0)} actionable, {counts.get('readyCullDraftUnknownWorksheetIds', 0)} unknown ids.",
            "Sidecar draft only. No originals, metadata, review ledger, proof selections, exports, uploads, publication state, keep/reject truth, or approval state is changed.",
        ),
        open_action(
            "readyCullReceiptPreview",
            "Open ready cull receipt preview",
            f"Validate sidecar cull decisions before any review-ledger write: {counts.get('readyCullPreviewActionableDecisionRows', 0)} actionable, {counts.get('readyCullPreviewInvalidRows', 0)} invalid, {counts.get('readyCullPreviewMissingSourceRows', 0)} missing source.",
            "Receipt preview only. No originals, metadata, review ledger, proof selections, exports, uploads, publication state, keep/reject truth, or approval state is changed.",
        ),
        open_action(
            "nextCullCard",
            "Open next tiny cull card",
            "Start with one source-backed cull question, one thumbnail/source comparison, and dry-run commands only.",
            "Read-only next-card surface. No metadata, originals, exports, deliveries, uploads, or publication state change.",
        ),
        open_action(
            "firstPassTriage",
            "Open first-pass triage",
            f"Start with {counts.get('firstPassTriageGroups', 0)} small group(s), {counts.get('firstPassTriageSamples', 0)} sample frame(s), and {counts.get('firstPassTriageDryRunDirections', 0)} dry-run direction(s) before any metadata decision.",
            "Read-only first culling deck. No metadata, originals, exports, deliveries, uploads, or publication state change.",
        ),
        open_action(
            "cullBoard",
            "Open cull board",
            f"Start with {counts.get('cullBoardCandidateRows', 0)} candidate card(s), compare visually, and keep dry-run commands close.",
            "Read-only cull front door. No metadata or originals change.",
        ),
        open_action(
            "contactSheet",
            "Open grouped contact sheet",
            f"Compare {counts.get('contactSheetGroups', 0)} groups and {counts.get('contactSheetSamples', 0)} samples before culling.",
            "Read-only visual review. No metadata or originals change.",
        ),
        open_action(
            "firstKeepers",
            "Review first-keeper candidates",
            f"Start with {counts.get('firstKeeperCandidates', 0)} likely keeper candidates across {counts.get('firstKeeperGroups', 0)} groups.",
            "Candidate review only. No client proof or delivery state changes.",
        ),
        open_action(
            "reviewSession",
            "Open focused review session",
            f"{counts.get('reviewSessionRows', 0)} focused row(s), {counts.get('reviewSessionThumbnailsPresent', 0)} thumbnail(s), and {counts.get('dryRunCommands', 0)} dry-run commands are available for safe decision rehearsal.",
            "Dry-run / review surface only unless a later explicit command is approved.",
        ),
        open_action(
            "cullRehearsal",
            "Rehearse cull decisions first",
            f"{counts.get('cullRehearsalRows', 0)} photo row(s) have {counts.get('cullRehearsalDryRunPreviews', 0)} dry-run keep/review/reject/favorite previews.",
            "Dry-run only. Does not write ledger decisions, copy files, deliver proofs, or mutate originals.",
        ),
        open_action(
            "commandSheet",
            "Inspect cull command sheet",
            f"{counts.get('commandRows', 0)} metadata-only suggested commands are staged for inspection.",
            "Inspect only. Does not execute keep/reject/favorite decisions.",
        ),
        open_action(
            "proofDesk",
            "Open proof desk",
            "Shows how culling evidence would become a proof packet after human approval.",
            "No client delivery, upload, publication, or approval is created.",
        ),
        open_action(
            "exportPrep",
            "Open export prep packet",
            f"Review selected keep/favorite rows, {counts.get('exportPrepNeedsHumanAttention', 0)} attention item(s), and {counts.get('exportPrepCopyPlanRows', 0)} copy-plan row(s) before any delivery.",
            "Local review/export preparation only. Does not copy originals, mutate metadata, deliver, upload, publish, schedule, or create receipts.",
        ),
        open_action(
            "decisionDesk",
            "Open decision desk",
            f"{counts.get('decisionEvents', 0)} recorded event(s) and {counts.get('decisionReceiptJsonFiles', 0)} decision receipt file(s) exist.",
            "Local cull ledger evidence only. No source media mutation.",
        ),
    ]
    return [action for action in actions if action.get("path")]


def build_photo_delivery_runway(parts: dict[str, dict[str, Any]], counts: dict[str, Any]) -> dict[str, Any]:
    export_prep = parts.get("exportPrep", {})
    client_proof = parts.get("clientProof", {})
    proof_desk = parts.get("proofDesk", {})
    keeper_desk = parts.get("keeperDesk", {})

    def path_for(payload: dict[str, Any]) -> str:
        return str(payload.get("htmlPath") or payload.get("markdownPath") or payload.get("jsonPath") or "")

    export_prep_path = path_for(export_prep)
    client_proof_path = path_for(client_proof)
    proof_desk_path = path_for(proof_desk)
    keeper_desk_path = path_for(keeper_desk)
    compare_paths = [path for path in [keeper_desk_path, proof_desk_path] if path]

    steps = [
        {
            "step": "1",
            "label": "Refresh export-prep truth",
            "why": "Delivery prep should start from the latest sidecar review ledger, not stale memory.",
            "command": "./script/agentctl.sh photo-grove-export-prep latest",
            "doneWhen": "The latest export-prep packet reports selected, review, pending, reject, and copy-plan counts.",
            "safety": "Builds local packet artifacts only; no originals are copied or mutated.",
        },
        {
            "step": "2",
            "label": "Open export prep and inspect selected rows",
            "why": "Selected-for-proof means candidate evidence, not client approval.",
            "command": f"open {shell_quote(export_prep_path)}" if export_prep_path else "./script/agentctl.sh photo-grove-export-prep latest",
            "doneWhen": "Keep/favorite rows and quality-triage groups are understood before proof prep.",
            "safety": "Local review/export-prep evidence only.",
        },
        {
            "step": "3",
            "label": "Compare against keeper/proof desks",
            "why": "The proof packet should agree with cull decisions and quality flags before anyone sees it.",
            "command": " && ".join(f"open {shell_quote(path)}" for path in compare_paths) or "./script/agentctl.sh photo-grove-keeper-desk && ./script/agentctl.sh photo-grove-client-proof latest",
            "doneWhen": "Keeper counts, proof candidates, and export-prep selected rows are not contradicting each other.",
            "safety": "Read-only comparison unless a later explicit metadata command is approved.",
        },
        {
            "step": "4",
            "label": "Prepare client proof packet locally",
            "why": "A client proof packet is a review packet, not delivery.",
            "command": f"open {shell_quote(client_proof_path)}" if client_proof_path else "./script/agentctl.sh photo-grove-client-proof latest",
            "doneWhen": "There is a local proof packet with selected images and unresolved issues visible.",
            "safety": "No client delivery, upload, publication, schedule, or receipt truth.",
        },
        {
            "step": "5",
            "label": "Stop at the delivery gate",
            "why": "Sending work to a client is an external action and needs explicit approval.",
            "command": "",
            "doneWhen": "The next action says review, refine, approve-for-delivery-later, or hold.",
            "safety": "Does not copy/export/deliver/upload/publish/schedule/create receipts.",
        },
    ]

    return {
        "schema": "quipsly.photo-grove.delivery-runway.v1",
        "headline": "Photo delivery runway: selected is not shipped.",
        "plainEnglish": "This connects Photo Grove culling to client-proof/export preparation while keeping delivery truth honest. It can show what is promising, what needs review, and what a copy plan would do, but it does not execute delivery.",
        "currentState": {
            "sourcePhotos": counts.get("sourcePhotos", 0),
            "decisionEvents": counts.get("decisionEvents", 0),
            "selectedForClientProof": counts.get("selectedForClientProof", 0),
            "exportPrepSelectedForClientProof": counts.get("exportPrepSelectedForClientProof", 0),
            "exportPrepNeedsHumanAttention": counts.get("exportPrepNeedsHumanAttention", 0),
            "exportPrepQualityReviewCandidates": counts.get("exportPrepQualityReviewCandidates", 0),
            "exportPrepCopyPlanRows": counts.get("exportPrepCopyPlanRows", 0),
            "exportPrepCopyPlanExecuted": counts.get("exportPrepCopyPlanExecuted", False),
            "clientDeliveryCreated": counts.get("clientDeliveryCreated", False),
        },
        "steps": steps,
        "startHerePath": export_prep_path or client_proof_path or proof_desk_path,
        "doNow": [
            "Refresh export-prep truth if the review ledger changed.",
            "Inspect keep/favorite rows and quality-triage groups.",
            "Prepare or open a local client proof packet only after enough reviewed keepers exist.",
            "Stop at the delivery gate until explicit approval exists.",
        ],
        "doNotDo": [
            "Do not treat selected-for-proof as client approval.",
            "Do not copy originals from this runway.",
            "Do not deliver, upload, publish, or schedule anything.",
            "Do not create receipt truth without a real external receipt.",
        ],
        "truth": "Photo delivery runway only. It does not mutate originals, write metadata, copy files, export, deliver, upload, publish, schedule, overwrite versions, delete files, or create receipts.",
    }


def build_review_loop(payload_paths: dict[str, str] | None = None) -> list[dict[str, str]]:
    payload_paths = payload_paths or {}
    first_pass = payload_paths.get("firstPassTriage", "")
    contact_sheet = payload_paths.get("contactSheet", "")
    cull_rehearsal = payload_paths.get("cullRehearsal", "")
    decision_desk = payload_paths.get("decisionDesk", "")
    keeper_desk = payload_paths.get("keeperDesk", "")
    client_proof = payload_paths.get("clientProof", "")
    return [
        {
            "step": "1",
            "label": "Start with first-pass triage",
            "why": "Culling works best when similar frames sit side-by-side, but the first move should be small enough to prevent overwhelm.",
            "command": f"open {shell_quote(first_pass)}" if first_pass else (f"open {shell_quote(contact_sheet)}" if contact_sheet else "./script/agentctl.sh photo-grove-first-pass-triage"),
            "doneWhen": "A human or agent can name the first keep/review/reject direction for one small group.",
            "safety": "Opens local visual evidence only; originals and metadata stay untouched.",
        },
        {
            "step": "2",
            "label": "Rehearse the metadata decision",
            "why": "Practice the keep/review/reject/favorite intent before writing even sidecar metadata.",
            "command": f"open {shell_quote(cull_rehearsal)}" if cull_rehearsal else "./script/agentctl.sh photo-grove-cull-rehearsal",
            "doneWhen": "The before/after dry-run preview matches the intended cull direction.",
            "safety": "Dry-run only; no ledger writes, copies, exports, deliveries, uploads, or source changes.",
        },
        {
            "step": "3",
            "label": "Record one metadata-only decision",
            "why": "One small durable cull receipt is better than a giant unclear batch. Build trust by making each decision inspectable.",
            "command": "./script/agentctl.sh photo-grove-decision PHOTO_ID keep|reject|review|favorite|pending [rating|-] [tag1,tag2] [actor] [note]",
            "doneWhen": "Decision Desk shows one new local decision receipt and the source file remains untouched.",
            "safety": "Writes Quipsly sidecar/ledger intent only after explicit command approval; does not alter original photos.",
        },
        {
            "step": "4",
            "label": "Rebuild cull/readiness surfaces",
            "why": "After each decision, refresh the surfaces so humans and agents see current truth instead of stale guesses.",
            "command": "./script/agentctl.sh photo-grove-status latest && ./script/agentctl.sh photo-grove-decision-desk && ./script/agentctl.sh photo-grove-control-room",
            "doneWhen": "Control Room counts and Decision Desk receipts agree.",
            "safety": "Read-model rebuild only; no source media or client delivery changes.",
        },
        {
            "step": "5",
            "label": "Prepare proof only after enough keepers exist",
            "why": "Client proof packets should be a consequence of reviewed keepers, not a disguised cull shortcut.",
            "command": f"open {shell_quote(keeper_desk)} && open {shell_quote(client_proof)}" if keeper_desk and client_proof else "./script/agentctl.sh photo-grove-keeper-desk && ./script/agentctl.sh photo-grove-client-proof latest",
            "doneWhen": "Keeper Desk and client proof packet agree on selected-for-proof readiness.",
            "safety": "Local proof prep only; no client delivery, upload, publishing, schedule, or receipt truth.",
        },
    ]


def build_machine_triage(parts: dict[str, dict[str, Any]], counts: dict[str, Any], limit: int = 8) -> dict[str, Any]:
    cull_board = parts.get("cullBoard", {})
    candidates = cull_board.get("candidateRows") if isinstance(cull_board.get("candidateRows"), list) else []
    routes = cull_board.get("attentionRoutes") if isinstance(cull_board.get("attentionRoutes"), list) else []
    route_summary: list[dict[str, Any]] = []
    for route in routes:
        if not isinstance(route, dict):
            continue
        route_summary.append({
            "id": route.get("id") or "",
            "label": route.get("label") or "",
            "count": route.get("count") or 0,
            "why": route.get("why") or "",
            "humanQuestion": route.get("humanQuestion") or "",
            "safeNextAction": route.get("safeNextAction") or "",
            "sampleFilenames": route.get("sampleFilenames") or [],
            "truth": route.get("truth") or "Attention lane only. No metadata or originals changed.",
        })
    first_rows: list[dict[str, Any]] = []
    for index, row in enumerate(candidates[:limit], 1):
        if not isinstance(row, dict):
            continue
        first_rows.append({
            "rank": index,
            "photoId": row.get("photoId") or "",
            "filename": row.get("filename") or "",
            "status": row.get("status") or "pending",
            "attentionRoute": row.get("attentionRoute") or "",
            "attentionReasons": row.get("attentionReasons") or [],
            "qualityFlags": row.get("qualityFlags") or [],
            "qualityNote": row.get("qualityNote") or "",
            "reviewGroupId": row.get("reviewGroupId") or "",
            "thumbnailPath": row.get("thumbnailPath") or "",
            "thumbnailUri": row.get("thumbnailUri") or "",
            "sourcePath": row.get("sourcePath") or "",
            "openSourceCommand": row.get("openSourceCommand") or "",
            "dryRunKeep4Command": row.get("dryRunKeep4Command") or "",
            "dryRunFavorite5Command": row.get("dryRunFavorite5Command") or "",
            "dryRunReviewCommand": row.get("dryRunReviewCommand") or "",
            "dryRunRejectCommand": row.get("dryRunRejectCommand") or "",
            "decisionBias": row.get("decisionBias") or "Inspect visually before writing metadata.",
            "truth": row.get("truth") or "Candidate row only. No keep/reject verdict and no metadata written.",
        })
    return {
        "schema": "quipsly.photo-grove.machine-triage.v1",
        "headline": f"{counts.get('cullBoardCandidateRows', 0)} cull candidates need human/agent visual review before metadata decisions.",
        "plainEnglish": "Photo Grove can notice likely duplicates, technical problem hints, and source-inspection needs, but these are routes for attention, not verdicts. Human review or explicit agent review comes before keep/reject/favorite metadata.",
        "counts": {
            "sourcePhotos": counts.get("sourcePhotos", 0),
            "candidateRows": counts.get("cullBoardCandidateRows", 0),
            "qualityAttention": counts.get("qualityAttention", 0),
            "nearDuplicateSequence": safe_count(cull_board, "nearDuplicateSequence"),
            "qualityProblemReview": safe_count(cull_board, "qualityProblemReview"),
            "sourceInspectionNeeded": safe_count(cull_board, "sourceInspectionNeeded"),
            "decisionEvents": counts.get("decisionEvents", 0),
            "selectedForClientProof": counts.get("selectedForClientProof", 0),
        },
        "reviewOrder": [
            "Open grouped contact sheets and compare visually.",
            "Start with quality-problem and near-duplicate routes because they teach the culler fastest.",
            "Use dry-run keep/review/reject/favorite commands before writing metadata.",
            "Record one metadata-only decision at a time once the visual choice is clear.",
            "Only prepare client proof packets after enough keepers exist.",
        ],
        "routeSummary": route_summary,
        "firstCullReviewSet": first_rows,
        "doNotDo": [
            "Do not reject photos from thumbnail analysis alone.",
            "Do not treat likely duplicates as automatic rejects.",
            "Do not write metadata without explicit command approval.",
            "Do not copy, deliver, upload, or publish client proof material from this board.",
        ],
        "truth": "Machine triage is attention routing only. It does not mutate originals, write metadata, select proof images, export, upload, deliver, publish, or create receipts.",
    }


def build_twenty_minute_cull_sprint(machine_triage: dict[str, Any], counts: dict[str, Any], limit: int = 12) -> dict[str, Any]:
    rows = [
        row
        for row in (machine_triage.get("firstCullReviewSet") if isinstance(machine_triage.get("firstCullReviewSet"), list) else [])
        if isinstance(row, dict)
    ][:limit]
    sprint_rows: list[dict[str, Any]] = []
    for index, row in enumerate(rows, start=1):
        default_command = row.get("dryRunReviewCommand") or row.get("dryRunKeep4Command") or row.get("dryRunRejectCommand") or ""
        sprint_rows.append({
            "position": index,
            "photoId": row.get("photoId") or "",
            "filename": row.get("filename") or "",
            "route": row.get("attentionRoute") or "review",
            "reviewQuestion": "Is this a keeper, a reject, a review-hold, or a possible favorite after seeing the source/neighbor context?",
            "sourceCommand": row.get("openSourceCommand") or "",
            "dryRunReviewCommand": row.get("dryRunReviewCommand") or "",
            "dryRunKeepCommand": row.get("dryRunKeep4Command") or "",
            "dryRunFavoriteCommand": row.get("dryRunFavorite5Command") or "",
            "dryRunRejectCommand": row.get("dryRunRejectCommand") or "",
            "recommendedFirstCommand": default_command,
            "notePrompt": f"{row.get('filename') or row.get('photoId')}: choose keep/review/reject/favorite only after source comparison. Reason:",
            "truth": "Sprint row only. Commands are dry-run previews unless an explicit later metadata command is approved.",
        })
    return {
        "schema": "quipsly.photo-grove.twenty-minute-cull-sprint.v1",
        "headline": f"20-minute cull sprint: inspect {len(sprint_rows)} candidate(s), rehearse decisions, stop before real metadata writes.",
        "timeboxMinutes": 20,
        "candidateCount": len(sprint_rows),
        "sourcePhotoCount": counts.get("sourcePhotos", 0),
        "decisionEventsAtStart": counts.get("decisionEvents", 0),
        "selectedForClientProofAtStart": counts.get("selectedForClientProof", 0),
        "steps": [
            {"minute": "0-2", "label": "Orient", "instruction": "Open the control room and contact sheet. Pick one small visual group or start at row 1 below."},
            {"minute": "2-10", "label": "Compare", "instruction": "Open source/neighbor context. Ignore proof/export/publishing thoughts. Just classify attention."},
            {"minute": "10-16", "label": "Dry-run decisions", "instruction": "Use dry-run keep/review/reject/favorite commands for likely choices. Confirm the preview matches intent."},
            {"minute": "16-20", "label": "Write the review note", "instruction": "Record the intended decisions in notes. Do not execute metadata writes unless Charlie explicitly approves that action."},
        ],
        "reviewRows": sprint_rows,
        "stopConditions": [
            "Stop if the source file looks wrong or unrelated.",
            "Stop if thumbnail and source disagree.",
            "Stop if two candidates look similar but no neighbor context is visible.",
            "Stop before real metadata writes unless explicitly approved.",
            "Stop before any copy/export/client delivery/upload/publication step.",
        ],
        "successLooksLike": [
            "A human or agent can say which row should be keep/review/reject/favorite and why.",
            "At least one dry-run decision preview exists for the chosen row.",
            "No original photo, delivery packet, upload, or receipt truth changed.",
        ],
        "truth": "This sprint is a reversible review workflow. It is not a cull verdict batch, client delivery, metadata write, export, upload, publication, or receipt.",
    }


def build_first_review_recipe(machine_triage: dict[str, Any], counts: dict[str, Any], limit: int = 6) -> dict[str, Any]:
    rows = [
        row
        for row in (machine_triage.get("firstCullReviewSet") if isinstance(machine_triage.get("firstCullReviewSet"), list) else [])
        if isinstance(row, dict)
    ][:limit]
    recipe_rows: list[dict[str, Any]] = []
    for index, row in enumerate(rows, start=1):
        photo_id = row.get("photoId") or ""
        recommended = row.get("dryRunReviewCommand") or row.get("dryRunKeep4Command") or row.get("dryRunRejectCommand") or ""
        recipe_rows.append({
            "position": index,
            "photoId": photo_id,
            "filename": row.get("filename") or "",
            "route": row.get("attentionRoute") or "review",
            "group": row.get("reviewGroupId") or "",
            "thumbnailUri": row.get("thumbnailUri") or "",
            "hasThumbnail": bool(row.get("thumbnailUri")),
            "hasSourcePath": bool(row.get("sourcePath")),
            "sourceCommand": row.get("openSourceCommand") or "",
            "firstDryRunCommand": recommended,
            "sidecarDecisionTemplate": f"./script/agentctl.sh photo-grove-decision {photo_id} keep|reject|review|favorite 0 photo-grove-first-sprint codex \"reason from visual comparison\"" if photo_id else "",
            "reviewPrompt": "Compare source and neighbors. Is this a keeper, reject, review hold, or possible favorite? Record the reason before any metadata write.",
            "doNotDecideFrom": "Do not decide from quality hint or thumbnail alone.",
            "truth": "Recipe row only. Dry-run commands preview intent; sidecar decisions require explicit execution.",
        })
    workable = sum(1 for row in recipe_rows if row.get("hasThumbnail") and row.get("hasSourcePath"))
    return {
        "schema": "quipsly.photo-grove.first-review-recipe.v1",
        "headline": f"First review recipe: work {len(recipe_rows)} photo(s), one visible reason at a time.",
        "state": "ready-for-review-sprint" if recipe_rows else "needs-cull-candidates",
        "oneSittingGoal": "Finish a tiny, reversible cull pass that teaches the reviewer how Quipsly thinks without touching originals.",
        "batchCounts": {
            "recipeRows": len(recipe_rows),
            "workableRows": workable,
            "missingThumbnailOrSourceRows": len(recipe_rows) - workable,
            "decisionEventsAtStart": counts.get("decisionEvents", 0),
            "sourcePhotos": counts.get("sourcePhotos", 0),
        },
        "operatorSteps": [
            "Open the first recipe row source and thumbnail evidence.",
            "Compare only the visible group/context; do not think about final delivery yet.",
            "Run a dry-run keep/review/reject/favorite command for the likely intent.",
            "If the preview matches the human judgment, optionally record one sidecar decision with explicit approval.",
            "Refresh Photo Grove status/control room after any sidecar decision.",
        ],
        "reviewRows": recipe_rows,
        "escapeHatches": [
            "If a source path is missing, skip that row and keep the missing-source task visible.",
            "If thumbnail and source disagree, stop and mark the row for investigation.",
            "If everything feels ambiguous, record review-hold instead of reject.",
            "If too many photos are flagged quality-attention, use this recipe to sample and improve hints rather than bulk rejecting.",
        ],
        "refreshCommands": [
            "./script/agentctl.sh photo-grove-status latest",
            "./script/agentctl.sh photo-grove-decision-desk",
            "./script/agentctl.sh photo-grove-control-room",
        ],
        "truth": "This is a human/agent culling recipe. It does not mutate originals, write metadata automatically, select client proof images, export, upload, deliver, publish, or create receipts.",
    }


def build_suggested_first_pass_decisions(machine_triage: dict[str, Any], limit: int = 10) -> dict[str, Any]:
    source_rows = [
        row
        for row in (machine_triage.get("firstCullReviewSet") if isinstance(machine_triage.get("firstCullReviewSet"), list) else [])
        if isinstance(row, dict)
    ][:limit]
    rows: list[dict[str, Any]] = []
    for index, row in enumerate(source_rows, start=1):
        route = str(row.get("attentionRoute") or "normal-review")
        flags = [str(flag) for flag in (row.get("qualityFlags") or [])]
        if route == "quality-problem-review" or any("suspect" in flag or "blank" in flag for flag in flags):
            intent = "review"
            confidence = "attention-high-decision-low"
            reason = "Quality hints or suspect preview mean this needs source-aware review before any reject/keep call."
            first_command = row.get("dryRunReviewCommand") or row.get("dryRunRejectCommand") or ""
            human_question = "Is the issue real in the source, only a thumbnail artifact, or recoverable?"
        elif route == "near-duplicate-sequence":
            intent = "compare"
            confidence = "group-context-needed"
            reason = "This looks like a sequence/near-duplicate candidate; compare neighbors before choosing a keeper."
            first_command = row.get("dryRunReviewCommand") or row.get("dryRunKeep4Command") or ""
            human_question = "Which frame carries the moment best, and should the others remain review or become rejects?"
        elif route in {"keeper-proof-candidate", "possible-keeper-proof"}:
            intent = "keep-candidate"
            confidence = "candidate-not-approved"
            reason = "Existing hints suggest this could become a keeper after visual confirmation."
            first_command = row.get("dryRunKeep4Command") or row.get("dryRunReviewCommand") or ""
            human_question = "Is this strong enough to become a keep/favorite candidate after source comparison?"
        else:
            intent = "review"
            confidence = "normal-review"
            reason = "No safe automated verdict; use a review dry-run and decide from visual comparison."
            first_command = row.get("dryRunReviewCommand") or ""
            human_question = "Keep, favorite, reject, or leave for review after seeing the source?"
        rows.append({
            "rank": index,
            "photoId": row.get("photoId") or "",
            "filename": row.get("filename") or "",
            "reviewGroupId": row.get("reviewGroupId") or "",
            "attentionRoute": route,
            "suggestedIntent": intent,
            "confidence": confidence,
            "reason": reason,
            "humanQuestion": human_question,
            "thumbnailUri": row.get("thumbnailUri") or "",
            "openSourceCommand": row.get("openSourceCommand") or "",
            "firstDryRunCommand": first_command,
            "alternateDryRunCommands": {
                "keep": row.get("dryRunKeep4Command") or "",
                "favorite": row.get("dryRunFavorite5Command") or "",
                "review": row.get("dryRunReviewCommand") or "",
                "reject": row.get("dryRunRejectCommand") or "",
            },
            "truth": "Suggested first-pass decision only. It routes attention and dry-run intent; it does not write metadata, select client proof images, reject, export, deliver, upload, publish, delete, or mutate originals.",
        })
    by_intent: dict[str, int] = {}
    for row in rows:
        key = str(row.get("suggestedIntent") or "review")
        by_intent[key] = by_intent.get(key, 0) + 1
    return {
        "schema": "quipsly.photo-grove.suggested-first-pass-decisions.v1",
        "headline": f"Suggested first-pass tray: {len(rows)} reversible intent(s), zero automatic verdicts.",
        "plainEnglish": "This is Photo Grove's Aftershoot-like moment, kept honest: it proposes the first safe intent for a small set, but every row remains a dry-run until a human or explicitly approved agent action writes metadata.",
        "rows": rows,
        "counts": {
            "rows": len(rows),
            "byIntent": by_intent,
            "metadataChanged": False,
            "originalsMutated": False,
            "clientDeliveryCreated": False,
        },
        "guardrails": [
            "Review means inspect source evidence; it is not a rejection.",
            "Compare means choose within a group; it is not duplicate deletion.",
            "Keep-candidate means worth inspecting; it is not client proof approval.",
            "Every command here is dry-run unless an exact live metadata-sidecar write is explicitly approved later.",
        ],
        "truth": "Suggested first-pass tray only. It does not mutate originals, write metadata, choose final keep/reject/favorite state, export, deliver, upload, publish, schedule, delete, or create receipts.",
    }


def build_cull_decision_cards(payload: dict[str, Any], limit: int = 8) -> dict[str, Any]:
    suggested = payload.get("suggestedFirstPassDecisions") if isinstance(payload.get("suggestedFirstPassDecisions"), dict) else {}
    recipe = payload.get("firstReviewRecipe") if isinstance(payload.get("firstReviewRecipe"), dict) else {}
    recipe_rows = recipe.get("reviewRows") if isinstance(recipe.get("reviewRows"), list) else []
    recipe_by_photo = {
        str(row.get("photoId") or ""): row
        for row in recipe_rows
        if isinstance(row, dict) and row.get("photoId")
    }
    cards: list[dict[str, Any]] = []
    for index, row in enumerate((suggested.get("rows") if isinstance(suggested.get("rows"), list) else [])[:limit], start=1):
        if not isinstance(row, dict):
            continue
        photo_id = str(row.get("photoId") or "")
        recipe_row = recipe_by_photo.get(photo_id, {})
        filename = str(row.get("filename") or recipe_row.get("filename") or photo_id or "photo")
        suggested_intent = str(row.get("suggestedIntent") or "review")
        recommended_decision = {
            "keep-candidate": "keep",
            "compare": "review",
            "review": "review",
        }.get(suggested_intent, "review")
        dry_runs = row.get("alternateDryRunCommands") if isinstance(row.get("alternateDryRunCommands"), dict) else {}
        local_note = "\n".join([
            f"photoId: {photo_id}",
            f"filename: {filename}",
            f"reviewGroupId: {row.get('reviewGroupId') or recipe_row.get('group') or ''}",
            "decision: review # keep | favorite | reject | review | pending",
            "rating: null # optional 0-5 after visual comparison",
            "tags: []",
            f"suggestedIntent: {suggested_intent}",
            f"recommendedFirstDecision: {recommended_decision}",
            f"confidence: {row.get('confidence') or 'review'}",
            "reason: \"\"",
            "reviewer: \"\"",
            "source: photo-grove-cull-decision-card",
            "approval: local-intent-only-not-metadata-write",
        ])
        cards.append({
            "rank": index,
            "photoId": photo_id,
            "filename": filename,
            "reviewGroupId": row.get("reviewGroupId") or recipe_row.get("group") or "",
            "suggestedIntent": suggested_intent,
            "recommendedFirstDecision": recommended_decision,
            "confidence": row.get("confidence") or "review",
            "reason": row.get("reason") or "Inspect visually before deciding.",
            "humanQuestion": row.get("humanQuestion") or recipe_row.get("reviewPrompt") or "Keep, favorite, reject, or leave for review after seeing source evidence?",
            "thumbnailUri": row.get("thumbnailUri") or recipe_row.get("thumbnailUri") or "",
            "openSourceCommand": row.get("openSourceCommand") or recipe_row.get("sourceCommand") or "",
            "firstDryRunCommand": row.get("firstDryRunCommand") or recipe_row.get("firstDryRunCommand") or "",
            "dryRunCommands": {
                "keep": dry_runs.get("keep") or "",
                "favorite": dry_runs.get("favorite") or "",
                "review": dry_runs.get("review") or "",
                "reject": dry_runs.get("reject") or "",
            },
            "optionalSidecarDecisionTemplate": recipe_row.get("sidecarDecisionTemplate") or "",
            "localReviewNoteYaml": local_note,
            "safeNextAction": "Compare the source/neighbor evidence, copy this local review note, and only later execute an explicit sidecar metadata write if approved.",
            "truth": "Cull decision card only. It records review intent language and dry-run options; it does not mutate originals, write metadata, select proof images, copy, export, deliver, upload, publish, schedule, delete, or create receipts.",
        })
    by_decision: dict[str, int] = {}
    for card in cards:
        key = str(card.get("recommendedFirstDecision") or "review")
        by_decision[key] = by_decision.get(key, 0) + 1
    return {
        "schema": "quipsly.photo-grove.cull-decision-cards.v1",
        "headline": f"Cull decision cards: {len(cards)} tiny, reversible review notes ready for human/agent culling.",
        "plainEnglish": "These cards are the Photo Grove equivalent of Studio review decision cards: they turn machine attention routes into small, copyable, local notes without writing metadata or touching originals.",
        "cards": cards,
        "counts": {
            "cards": len(cards),
            "byRecommendedFirstDecision": by_decision,
            "metadataChanged": False,
            "originalsMutated": False,
            "clientDeliveryCreated": False,
        },
        "allowedLocalClassifications": [
            "keep",
            "favorite",
            "reject",
            "review",
            "pending",
        ],
        "doNotDo": [
            "Do not treat a card as a metadata write.",
            "Do not reject photos from the suggested intent alone.",
            "Do not copy/export/deliver client proof packets from these cards.",
            "Do not create receipt truth from local review intent.",
        ],
        "truth": "Cull decision cards are local review intent only. They do not mutate originals, write metadata, select proof images, copy, export, deliver, upload, publish, schedule, delete, overwrite, or create receipt truth.",
    }


def build_quality_evidence_cards(payload: dict[str, Any], limit: int = 12) -> dict[str, Any]:
    machine = payload.get("machineTriageSummary") if isinstance(payload.get("machineTriageSummary"), dict) else {}
    rows = machine.get("firstCullReviewSet") if isinstance(machine.get("firstCullReviewSet"), list) else []
    cards: list[dict[str, Any]] = []
    for index, row in enumerate(rows[:limit], start=1):
        if not isinstance(row, dict):
            continue
        flags = [str(flag) for flag in (row.get("qualityFlags") or []) if flag]
        reasons = [str(reason) for reason in (row.get("attentionReasons") or []) if reason]
        photo_id = str(row.get("photoId") or "")
        filename = str(row.get("filename") or photo_id or "photo")
        route = str(row.get("attentionRoute") or "visual-review")
        note = "\n".join([
            "photo_quality_evidence_note:",
            f"  photoId: {photo_id}",
            f"  filename: \"{filename}\"",
            f"  attentionRoute: \"{route}\"",
            f"  qualityFlags: [{', '.join(flags)}]",
            f"  reviewGroupId: \"{row.get('reviewGroupId') or ''}\"",
            "  evidenceConclusion: \"needs-human-eyes\"",
            "  humanObservation: \"\"",
            "  nextLocalMove: \"compare-source-and-neighbors\"",
            "  metadataWriteApproved: false",
        ])
        cards.append({
            "rank": index,
            "photoId": photo_id,
            "filename": filename,
            "reviewGroupId": row.get("reviewGroupId") or "",
            "attentionRoute": route,
            "qualityFlags": flags,
            "attentionReasons": reasons,
            "qualityNote": row.get("qualityNote") or "",
            "thumbnailUri": row.get("thumbnailUri") or "",
            "thumbnailPath": row.get("thumbnailPath") or "",
            "sourcePath": row.get("sourcePath") or "",
            "openSourceCommand": row.get("openSourceCommand") or "",
            "firstDryRunReviewCommand": row.get("dryRunReviewCommand") or "",
            "humanQuestion": "Does the full source/neighbor context confirm a real quality issue, or is this only an attention hint?",
            "codexSafeMove": "Summarize the visible evidence, compare nearby frames, and leave the row as review unless a human-approved metadata write happens later.",
            "localEvidenceNoteYaml": note,
            "truth": "Quality evidence card only. It routes attention and does not mutate originals, write metadata, select proof images, copy, export, deliver, upload, publish, schedule, delete, overwrite, or create receipt truth.",
        })
    route_counts: dict[str, int] = {}
    flag_counts: dict[str, int] = {}
    for card in cards:
        route = str(card.get("attentionRoute") or "visual-review")
        route_counts[route] = route_counts.get(route, 0) + 1
        for flag in card.get("qualityFlags") or []:
            key = str(flag)
            flag_counts[key] = flag_counts.get(key, 0) + 1
    return {
        "schema": "quipsly.photo-grove.quality-evidence-cards.v1",
        "headline": f"Quality evidence cards: {len(cards)} attention hints ready for source-aware review.",
        "plainEnglish": "These cards explain why Photo Grove is asking for eyes on a photo. They are evidence notes, not keep/reject verdicts.",
        "cards": cards,
        "counts": {
            "cards": len(cards),
            "byAttentionRoute": route_counts,
            "byQualityFlag": flag_counts,
            "metadataChanged": False,
            "originalsMutated": False,
            "clientDeliveryCreated": False,
        },
        "allowedEvidenceRoutes": sorted(route_counts),
        "doNotDo": [
            "Do not reject from quality evidence alone.",
            "Do not treat thumbnail problems as source truth without opening the source.",
            "Do not write metadata from this card without a later explicit command.",
            "Do not copy, export, deliver, upload, publish, delete, overwrite, or create receipt truth.",
        ],
        "truth": "Quality evidence cards are local attention evidence only. They do not mutate originals, write metadata, select proof images, copy, export, deliver, upload, publish, schedule, delete, overwrite, or create receipt truth.",
    }


def build_proof_candidate_cards(payload: dict[str, Any], limit: int = 12) -> dict[str, Any]:
    decision_cards = payload.get("cullDecisionCards") if isinstance(payload.get("cullDecisionCards"), dict) else {}
    quality_cards = payload.get("qualityEvidenceCards") if isinstance(payload.get("qualityEvidenceCards"), dict) else {}
    quality_by_photo = {
        str(card.get("photoId") or ""): card
        for card in (quality_cards.get("cards") if isinstance(quality_cards.get("cards"), list) else [])
        if isinstance(card, dict) and card.get("photoId")
    }
    ranked_cards = sorted(
        [card for card in (decision_cards.get("cards") if isinstance(decision_cards.get("cards"), list) else []) if isinstance(card, dict)],
        key=lambda card: (
            0 if str(card.get("suggestedIntent") or "") == "keep-candidate" else 1,
            0 if str(card.get("recommendedFirstDecision") or "") == "keep" else 1,
            int(card.get("rank") or 999),
        ),
    )
    cards: list[dict[str, Any]] = []
    for index, card in enumerate(ranked_cards[:limit], start=1):
        photo_id = str(card.get("photoId") or "")
        quality = quality_by_photo.get(photo_id, {})
        filename = str(card.get("filename") or quality.get("filename") or photo_id or "photo")
        recommended = str(card.get("recommendedFirstDecision") or "review")
        suggested = str(card.get("suggestedIntent") or "review")
        if recommended == "keep" or suggested == "keep-candidate":
            route = "proof-candidate-after-source-review"
            proof_fit = "likely-proof-candidate-not-approved"
            human_question = "After opening the source, is this strong enough to become a client-proof keeper?"
        elif suggested == "compare":
            route = "sequence-compare-before-proof"
            proof_fit = "needs-neighbor-comparison"
            human_question = "Is this the strongest frame in its sequence, or should a neighbor become the keeper?"
        else:
            route = "hold-for-review-before-proof"
            proof_fit = "review-before-proof"
            human_question = "Does source evidence justify moving this toward proof, or should it stay review?"
        note = "\n".join([
            "photo_proof_candidate_note:",
            f"  photoId: {photo_id}",
            f"  filename: \"{filename}\"",
            f"  reviewGroupId: \"{card.get('reviewGroupId') or quality.get('reviewGroupId') or ''}\"",
            f"  proofRoute: \"{route}\"",
            f"  proofFit: \"{proof_fit}\"",
            f"  suggestedIntent: \"{suggested}\"",
            f"  recommendedFirstDecision: \"{recommended}\"",
            "  selectedForClientProof: false",
            "  clientDeliveryApproved: false",
            "  humanProofNote: \"\"",
            "  nextLocalMove: \"open-source-and-compare-before-any-proof-selection\"",
        ])
        cards.append({
            "rank": index,
            "photoId": photo_id,
            "filename": filename,
            "reviewGroupId": card.get("reviewGroupId") or quality.get("reviewGroupId") or "",
            "proofRoute": route,
            "proofFit": proof_fit,
            "suggestedIntent": suggested,
            "recommendedFirstDecision": recommended,
            "qualityFlags": quality.get("qualityFlags") or [],
            "qualityNote": quality.get("qualityNote") or "",
            "thumbnailUri": card.get("thumbnailUri") or quality.get("thumbnailUri") or "",
            "openSourceCommand": card.get("openSourceCommand") or quality.get("openSourceCommand") or "",
            "firstDryRunCommand": card.get("firstDryRunCommand") or quality.get("firstDryRunReviewCommand") or "",
            "humanQuestion": human_question,
            "codexSafeMove": "Compare source and neighbor evidence, then leave a local proof-candidate note. Do not select, copy, export, or deliver.",
            "localProofCandidateNoteYaml": note,
            "truth": "Proof candidate card only. It does not select proof images, mutate originals, write metadata, copy, export, deliver, upload, publish, schedule, delete, overwrite, or create receipt truth.",
        })
    by_route: dict[str, int] = {}
    for card in cards:
        route = str(card.get("proofRoute") or "review-before-proof")
        by_route[route] = by_route.get(route, 0) + 1
    return {
        "schema": "quipsly.photo-grove.proof-candidate-cards.v1",
        "headline": f"Proof candidate cards: {len(cards)} local candidates for a future human-approved proof set.",
        "plainEnglish": "These cards bridge culling and client proof prep without jumping the fence. They help a reviewer decide what might become a proof image later, but every card is still local intent only.",
        "cards": cards,
        "counts": {
            "cards": len(cards),
            "byProofRoute": by_route,
            "selectedForClientProof": 0,
            "copyPlanExecuted": False,
            "metadataChanged": False,
            "originalsMutated": False,
            "clientDeliveryCreated": False,
        },
        "allowedLocalActions": [
            "open-source-and-compare",
            "copy-proof-candidate-note",
            "hold-for-review",
            "mark-ready-for-human-proof-decision",
        ],
        "doNotDo": [
            "Do not treat proof candidates as selected client proofs.",
            "Do not copy/export/deliver images from this deck.",
            "Do not write metadata or ratings without a later explicit approved command.",
            "Do not upload, publish, schedule, delete, overwrite, or create receipt truth.",
        ],
        "truth": "Proof candidate cards are local proof-prep evidence only. They do not mutate originals, write metadata, select proof images, copy, export, deliver, upload, publish, schedule, delete, overwrite, or create receipt truth.",
    }


def build_first_cull_runway(payload: dict[str, Any]) -> dict[str, Any]:
    counts = payload.get("counts") if isinstance(payload.get("counts"), dict) else {}
    actions = payload.get("safeActions") if isinstance(payload.get("safeActions"), list) else []
    loop = payload.get("reviewLoop") if isinstance(payload.get("reviewLoop"), list) else []
    recipe = payload.get("firstReviewRecipe") if isinstance(payload.get("firstReviewRecipe"), dict) else {}
    sprint = payload.get("twentyMinuteCullSprint") if isinstance(payload.get("twentyMinuteCullSprint"), dict) else {}
    suggested = payload.get("suggestedFirstPassDecisions") if isinstance(payload.get("suggestedFirstPassDecisions"), dict) else {}

    def action_command(label_text: str) -> str:
        for action in actions:
            if not isinstance(action, dict):
                continue
            label = str(action.get("label") or "").lower()
            if label_text.lower() in label:
                return str(action.get("command") or "")
        return ""

    def loop_command(step_prefix: str) -> str:
        for step in loop:
            if not isinstance(step, dict):
                continue
            if str(step.get("step") or "") == step_prefix:
                return str(step.get("command") or "")
        return ""

    recipe_rows = recipe.get("reviewRows") if isinstance(recipe.get("reviewRows"), list) else []
    first_recipe = recipe_rows[0] if recipe_rows and isinstance(recipe_rows[0], dict) else {}
    first_dry_run = str(first_recipe.get("firstDryRunCommand") or "")
    sprint_rows = sprint.get("reviewRows") if isinstance(sprint.get("reviewRows"), list) else []
    if not first_dry_run and sprint_rows and isinstance(sprint_rows[0], dict):
        first_dry_run = str(sprint_rows[0].get("recommendedFirstCommand") or "")

    steps = [
        {
            "step": "1",
            "label": "Open the smallest visual evidence set",
            "why": "Start with one tiny group so culling feels like comparing photos, not wrestling a database.",
            "command": action_command("first-pass triage") or action_command("cull board"),
            "humanQuestion": "Can I name one obviously better, worse, or uncertain photo after seeing its neighbors?",
            "safeStop": "If the first group is confusing, stop with a review-hold note instead of forcing a verdict.",
        },
        {
            "step": "2",
            "label": "Compare one source photo and its neighbors",
            "why": "Thumbnail hints route attention; source comparison earns the decision.",
            "command": str(first_recipe.get("sourceCommand") or action_command("grouped contact sheet")),
            "humanQuestion": "Does the full photo confirm what the thumbnail suggested?",
            "safeStop": "If thumbnail and source disagree, mark the row for investigation.",
        },
        {
            "step": "3",
            "label": "Dry-run one cull intent",
            "why": "Preview the metadata-sidecar result before writing anything durable.",
            "command": str(first_dry_run or loop_command("2")),
            "humanQuestion": "Does the dry-run preview match the cull intent I would be comfortable explaining?",
            "safeStop": "If the preview feels wrong, do not execute a live decision; return to comparison.",
        },
        {
            "step": "4",
            "label": "Optionally write one sidecar decision",
            "why": "One inspectable cull receipt proves the loop without making culling feel like a batch job.",
            "command": loop_command("3"),
            "humanQuestion": "Do we have explicit approval to write this metadata-sidecar decision?",
            "safeStop": "No approval means no write. Keep the dry-run and notes only.",
        },
        {
            "step": "5",
            "label": "Refresh proof/readiness truth",
            "why": "The board should teach the next person what changed and what is still pending.",
            "command": loop_command("4"),
            "humanQuestion": "Do Control Room counts and Decision Desk receipts agree?",
            "safeStop": "If counts disagree, keep the decision receipt and investigate before proof prep.",
        },
        {
            "step": "6",
            "label": "Only then prepare proof packets",
            "why": "Proof packets should be a calm consequence of reviewed keepers, not a disguised culling shortcut.",
            "command": loop_command("5"),
            "humanQuestion": "Are there enough reviewed keepers to make a client proof useful?",
            "safeStop": "No client delivery/upload/publish happens from this runway.",
        },
    ]

    return {
        "schema": "quipsly.photo-grove.first-cull-runway.v1",
        "headline": "First cull runway: one small comparison, one dry-run, one optional sidecar receipt.",
        "plainEnglish": "This is the front door for Photo Grove. It keeps the first cull tiny, visible, reversible, and honest: compare source evidence, rehearse the intent, write nothing unless explicitly approved.",
        "currentState": {
            "sourcePhotos": counts.get("sourcePhotos", 0),
            "pending": counts.get("pending", 0),
            "decisionEvents": counts.get("decisionEvents", 0),
            "firstReviewRecipeRows": counts.get("firstReviewRecipeRows", 0),
            "firstReviewRecipeWorkableRows": counts.get("firstReviewRecipeWorkableRows", 0),
            "suggestedFirstPassRows": (suggested.get("counts") or {}).get("rows", 0),
            "clientProofSelected": counts.get("selectedForClientProof", 0),
        },
        "suggestedFirstPassDecisions": suggested,
        "steps": steps,
        "doNow": [
            "Open the first-pass triage or cull board.",
            "Compare only one small photo group.",
            "Use dry-run commands before any live sidecar decision.",
            "Prefer review-hold over reject when uncertain.",
        ],
        "doNotDo": [
            "Do not reject from thumbnails alone.",
            "Do not batch-write metadata from this runway.",
            "Do not copy, export, deliver, upload, publish, schedule, or create receipt truth.",
            "Do not treat selected-for-proof as client approval.",
        ],
        "agentAccessibility": [
            "Codex can open the runway, read the first recipe row, run dry-run previews, compare generated evidence, and report exact blockers.",
            "Codex should not execute live keep/reject/favorite decisions unless Charlie explicitly approves that exact metadata-sidecar write.",
        ],
        "truth": "First cull runway only. It does not mutate originals, write metadata automatically, select proof images, export, upload, deliver, publish, schedule, or create receipts.",
    }


def write_first_cull_runway_markdown(path: Path, payload: dict[str, Any]) -> None:
    runway = payload.get("firstCullRunway") if isinstance(payload.get("firstCullRunway"), dict) else {}
    decision_cards = payload.get("cullDecisionCards") if isinstance(payload.get("cullDecisionCards"), dict) else {}
    lines = [
        "# Photo Grove first cull runway",
        "",
        runway.get("headline", ""),
        "",
        runway.get("plainEnglish", ""),
        "",
        "## Current state",
    ]
    for key, value in (runway.get("currentState") or {}).items():
        lines.append(f"- {key}: `{value}`")
    lines.extend(["", "## Do now"])
    for item in runway.get("doNow") or []:
        lines.append(f"- {item}")
    suggested = runway.get("suggestedFirstPassDecisions") if isinstance(runway.get("suggestedFirstPassDecisions"), dict) else {}
    if suggested:
        lines.extend([
            "",
            "## Suggested first-pass tray",
            "",
            suggested.get("headline", ""),
            "",
            suggested.get("plainEnglish", ""),
            "",
        ])
        suggested_counts = suggested.get("counts") if isinstance(suggested.get("counts"), dict) else {}
        lines.append(f"- Rows: `{suggested_counts.get('rows', 0)}`")
        for row in suggested.get("rows") or []:
            if not isinstance(row, dict):
                continue
            lines.extend([
                "",
                f"### {row.get('rank')}. {row.get('filename') or row.get('photoId')}",
                "",
                f"- Suggested intent: `{row.get('suggestedIntent')}`",
                f"- Confidence: `{row.get('confidence')}`",
                f"- Group: `{row.get('reviewGroupId')}`",
                f"- Why: {row.get('reason')}",
                f"- Human question: {row.get('humanQuestion')}",
                f"- Open source: `{row.get('openSourceCommand')}`",
                f"- First dry-run: `{row.get('firstDryRunCommand')}`",
                f"- Truth: {row.get('truth')}",
            ])
        lines.extend(["", "Guardrails:"])
        for item in suggested.get("guardrails") or []:
            lines.append(f"- {item}")
    if decision_cards:
        lines.extend([
            "",
            "## Cull decision cards",
            "",
            decision_cards.get("headline", ""),
            "",
            decision_cards.get("plainEnglish", ""),
            "",
            f"Cards file: `{payload.get('cullDecisionCardsPath') or ''}`",
        ])
    lines.extend(["", "## Steps"])
    for step in runway.get("steps") or []:
        if not isinstance(step, dict):
            continue
        lines.extend([
            f"### {step.get('step')}. {step.get('label')}",
            "",
            step.get("why", ""),
            "",
            f"- Command: `{step.get('command')}`",
            f"- Human question: {step.get('humanQuestion')}",
            f"- Safe stop: {step.get('safeStop')}",
            "",
        ])
    lines.extend(["## Do not do"])
    for item in runway.get("doNotDo") or []:
        lines.append(f"- {item}")
    lines.extend(["", "## Agent accessibility"])
    for item in runway.get("agentAccessibility") or []:
        lines.append(f"- {item}")
    lines.extend(["", "## Truth", "", runway.get("truth", "")])
    path.write_text("\n".join(str(line) for line in lines).rstrip() + "\n", encoding="utf-8")


def write_cull_decision_cards_markdown(path: Path, payload: dict[str, Any]) -> None:
    decision_cards = payload.get("cullDecisionCards") if isinstance(payload.get("cullDecisionCards"), dict) else {}
    lines = [
        "# Photo Grove cull decision cards",
        "",
        decision_cards.get("headline", ""),
        "",
        decision_cards.get("plainEnglish", ""),
        "",
        "These cards are local review intent only. They are not metadata writes, proof approval, delivery, upload, publication, schedule, delete, overwrite, or receipt truth.",
        "",
        "## Allowed local classifications",
    ]
    for item in decision_cards.get("allowedLocalClassifications") or []:
        lines.append(f"- `{item}`")
    lines.extend(["", "## Cards"])
    for card in decision_cards.get("cards") or []:
        if not isinstance(card, dict):
            continue
        lines.extend([
            "",
            f"### {card.get('rank')}. {card.get('filename') or card.get('photoId')}",
            "",
            f"- Photo ID: `{card.get('photoId')}`",
            f"- Group: `{card.get('reviewGroupId')}`",
            f"- Suggested intent: `{card.get('suggestedIntent')}`",
            f"- Recommended first decision: `{card.get('recommendedFirstDecision')}`",
            f"- Confidence: `{card.get('confidence')}`",
            f"- Why: {card.get('reason')}",
            f"- Human question: {card.get('humanQuestion')}",
            f"- Open source: `{card.get('openSourceCommand')}`",
            f"- First dry-run: `{card.get('firstDryRunCommand')}`",
            f"- Optional sidecar template: `{card.get('optionalSidecarDecisionTemplate')}`",
            f"- Safe next action: {card.get('safeNextAction')}",
            "",
            "Copyable local review note:",
            "",
            "```yaml",
            card.get("localReviewNoteYaml") or "",
            "```",
            "",
            f"Truth: {card.get('truth')}",
        ])
    lines.extend(["", "## Do not do"])
    for item in decision_cards.get("doNotDo") or []:
        lines.append(f"- {item}")
    lines.extend(["", "## Truth", "", decision_cards.get("truth", "")])
    path.write_text("\n".join(str(line) for line in lines).rstrip() + "\n", encoding="utf-8")


def write_quality_evidence_cards_markdown(path: Path, payload: dict[str, Any]) -> None:
    evidence_cards = payload.get("qualityEvidenceCards") if isinstance(payload.get("qualityEvidenceCards"), dict) else {}
    lines = [
        "# Photo Grove quality evidence cards",
        "",
        evidence_cards.get("headline", ""),
        "",
        evidence_cards.get("plainEnglish", ""),
        "",
        "These cards explain why Photo Grove wants a human/agent to look closer. They do not decide keep/reject/favorite state.",
        "",
        "## Counts",
    ]
    for key, value in (evidence_cards.get("counts") or {}).items():
        lines.append(f"- {key}: `{value}`")
    lines.extend(["", "## Cards", ""])
    for card in evidence_cards.get("cards") or []:
        if not isinstance(card, dict):
            continue
        lines.extend([
            f"### {card.get('rank')}. {card.get('filename')}",
            "",
            f"- Photo ID: `{card.get('photoId')}`",
            f"- Review group: `{card.get('reviewGroupId')}`",
            f"- Attention route: `{card.get('attentionRoute')}`",
            f"- Quality flags: `{', '.join(card.get('qualityFlags') or []) or 'none'}`",
            f"- Attention reasons: `{', '.join(card.get('attentionReasons') or []) or 'none'}`",
            f"- Quality note: {card.get('qualityNote') or ''}",
            f"- Open source: `{card.get('openSourceCommand')}`",
            f"- Dry-run review: `{card.get('firstDryRunReviewCommand')}`",
            f"- Human question: {card.get('humanQuestion')}",
            f"- Codex-safe move: {card.get('codexSafeMove')}",
            "",
            "#### Copyable evidence note",
            "",
            "```yaml",
            card.get("localEvidenceNoteYaml") or "",
            "```",
            "",
            f"Truth: {card.get('truth')}",
            "",
        ])
    lines.extend(["## Do not do"])
    for item in evidence_cards.get("doNotDo") or []:
        lines.append(f"- {item}")
    lines.extend(["", "## Truth", "", evidence_cards.get("truth", "")])
    path.write_text("\n".join(str(line) for line in lines).rstrip() + "\n", encoding="utf-8")


def write_proof_candidate_cards_markdown(path: Path, payload: dict[str, Any]) -> None:
    proof_cards = payload.get("proofCandidateCards") if isinstance(payload.get("proofCandidateCards"), dict) else {}
    lines = [
        "# Photo Grove proof candidate cards",
        "",
        proof_cards.get("headline", ""),
        "",
        proof_cards.get("plainEnglish", ""),
        "",
        "These cards are a bridge from culling toward a future client proof. They are not proof selections, delivery, copies, exports, or approvals.",
        "",
        "## Counts",
    ]
    for key, value in (proof_cards.get("counts") or {}).items():
        lines.append(f"- {key}: `{value}`")
    lines.extend(["", "## Cards", ""])
    for card in proof_cards.get("cards") or []:
        if not isinstance(card, dict):
            continue
        lines.extend([
            f"### {card.get('rank')}. {card.get('filename')}",
            "",
            f"- Photo ID: `{card.get('photoId')}`",
            f"- Review group: `{card.get('reviewGroupId')}`",
            f"- Proof route: `{card.get('proofRoute')}`",
            f"- Proof fit: `{card.get('proofFit')}`",
            f"- Suggested intent: `{card.get('suggestedIntent')}`",
            f"- Recommended first decision: `{card.get('recommendedFirstDecision')}`",
            f"- Quality flags: `{', '.join(card.get('qualityFlags') or []) or 'none'}`",
            f"- Quality note: {card.get('qualityNote') or ''}",
            f"- Open source: `{card.get('openSourceCommand')}`",
            f"- First dry-run command: `{card.get('firstDryRunCommand')}`",
            f"- Human question: {card.get('humanQuestion')}",
            f"- Codex-safe move: {card.get('codexSafeMove')}",
            "",
            "#### Copyable proof candidate note",
            "",
            "```yaml",
            card.get("localProofCandidateNoteYaml") or "",
            "```",
            "",
            f"Truth: {card.get('truth')}",
            "",
        ])
    lines.extend(["## Allowed local actions"])
    for item in proof_cards.get("allowedLocalActions") or []:
        lines.append(f"- {item}")
    lines.extend(["", "## Do not do"])
    for item in proof_cards.get("doNotDo") or []:
        lines.append(f"- {item}")
    lines.extend(["", "## Truth", "", proof_cards.get("truth", "")])
    path.write_text("\n".join(str(line) for line in lines).rstrip() + "\n", encoding="utf-8")


def write_photo_delivery_runway_markdown(path: Path, payload: dict[str, Any]) -> None:
    runway = payload.get("photoDeliveryRunway") if isinstance(payload.get("photoDeliveryRunway"), dict) else {}
    lines = [
        "# Photo Grove delivery runway",
        "",
        runway.get("headline", ""),
        "",
        runway.get("plainEnglish", ""),
        "",
        "## Current state",
    ]
    for key, value in (runway.get("currentState") or {}).items():
        lines.append(f"- {key}: `{value}`")
    lines.extend(["", "## Do now"])
    for item in runway.get("doNow") or []:
        lines.append(f"- {item}")
    lines.extend(["", "## Steps"])
    for step in runway.get("steps") or []:
        if not isinstance(step, dict):
            continue
        lines.extend([
            f"### {step.get('step')}. {step.get('label')}",
            "",
            step.get("why", ""),
            "",
            f"- Command: `{step.get('command')}`",
            f"- Done when: {step.get('doneWhen')}",
            f"- Safety: {step.get('safety')}",
            "",
        ])
    lines.extend(["## Do not do"])
    for item in runway.get("doNotDo") or []:
        lines.append(f"- {item}")
    lines.extend(["", "## Truth", "", runway.get("truth", "")])
    path.write_text("\n".join(str(line) for line in lines).rstrip() + "\n", encoding="utf-8")


def status_for(counts: dict[str, Any]) -> tuple[str, str, str]:
    card_missing = int(counts.get("cardBackupMissingDestination") or 0)
    card_mismatch = int(counts.get("cardBackupSizeMismatch") or 0)
    card_active = int(counts.get("cardBackupActiveProcesses") or 0)
    selected = int(counts.get("selectedForClientProof") or 0)
    pending = int(counts.get("pending") or 0)
    first_keepers = int(counts.get("firstKeeperCandidates") or 0)
    if card_missing or card_mismatch or card_active:
        return (
            "photo-grove-control-room-card-backup-in-progress",
            "backup-in-progress",
            f"Card backup is not complete yet: {card_missing} missing destination file(s), {card_mismatch} size mismatch(es), {card_active} active copy process(es). Use existing proof artifacts only; do not treat the new card as cull-ready.",
        )
    if selected:
        return (
            "photo-grove-control-room-proof-review",
            "proof-review",
            f"{selected} photo(s) are selected for proof; review before delivery.",
        )
    if first_keepers:
        return (
            "photo-grove-control-room-cull-ready",
            "cull-ready",
            f"{first_keepers} first-keeper candidate(s) are ready for visual cull decisions.",
        )
    if pending:
        return (
            "photo-grove-control-room-needs-cull",
            "needs-cull",
            f"{pending} photo(s) are pending cull/review.",
        )
    return ("photo-grove-control-room-ready", "ready", "Photo Grove has no obvious pending cull count.")


def write_markdown(path: Path, payload: dict[str, Any]) -> None:
    lines = [
        "# Photo Grove control room",
        "",
        payload.get("summary", ""),
        "",
        "## Open first",
    ]
    for action in payload.get("safeActions") or []:
        lines.append(f"- {action.get('label')}: `{action.get('command')}`")
    lines.extend([
        "",
        "## Counts",
    ])
    for key, value in (payload.get("counts") or {}).items():
        lines.append(f"- {key}: `{value}`")
    runway = payload.get("firstCullRunway") if isinstance(payload.get("firstCullRunway"), dict) else {}
    if runway:
        lines.extend([
            "",
            "## First cull runway",
            "",
            runway.get("headline", ""),
            "",
            runway.get("plainEnglish", ""),
            "",
            f"Runway file: `{payload.get('firstCullRunwayPath') or ''}`",
            f"Cull decision cards: `{payload.get('cullDecisionCardsPath') or ''}`",
            f"Quality evidence cards: `{payload.get('qualityEvidenceCardsPath') or ''}`",
            f"Proof candidate cards: `{payload.get('proofCandidateCardsPath') or ''}`",
            "",
            "Do now:",
        ])
        for item in runway.get("doNow") or []:
            lines.append(f"- {item}")
        suggested = runway.get("suggestedFirstPassDecisions") if isinstance(runway.get("suggestedFirstPassDecisions"), dict) else {}
        if suggested:
            lines.extend(["", "Suggested first-pass tray:", ""])
            lines.append(suggested.get("headline", ""))
            for row in suggested.get("rows") or []:
                if not isinstance(row, dict):
                    continue
                lines.extend([
                    f"- `{row.get('photoId')}` `{row.get('filename')}` intent=`{row.get('suggestedIntent')}` confidence=`{row.get('confidence')}`",
                    f"  - Why: {row.get('reason')}",
                    f"  - Question: {row.get('humanQuestion')}",
                    f"  - First dry-run: `{row.get('firstDryRunCommand')}`",
                ])
        lines.extend(["", "Steps:"])
        for step in runway.get("steps") or []:
            if not isinstance(step, dict):
                continue
            lines.append(f"- {step.get('step')}. {step.get('label')}: `{step.get('command')}`")
            lines.append(f"  - Question: {step.get('humanQuestion')}")
            lines.append(f"  - Safe stop: {step.get('safeStop')}")
    decision_cards = payload.get("cullDecisionCards") if isinstance(payload.get("cullDecisionCards"), dict) else {}
    if decision_cards:
        lines.extend([
            "",
            "## Cull decision cards",
            "",
            decision_cards.get("headline", ""),
            "",
            decision_cards.get("plainEnglish", ""),
            "",
            f"Cards file: `{payload.get('cullDecisionCardsPath') or ''}`",
            "",
            "Cards:",
        ])
        for card in decision_cards.get("cards") or []:
            if not isinstance(card, dict):
                continue
            lines.extend([
                f"- {card.get('rank')}. `{card.get('photoId')}` `{card.get('filename')}` decision=`{card.get('recommendedFirstDecision')}` confidence=`{card.get('confidence')}`",
                f"  - Question: {card.get('humanQuestion')}",
                f"  - Open source: `{card.get('openSourceCommand')}`",
                f"  - First dry-run: `{card.get('firstDryRunCommand')}`",
                f"  - Safe next: {card.get('safeNextAction')}",
            ])
    delivery = payload.get("photoDeliveryRunway") if isinstance(payload.get("photoDeliveryRunway"), dict) else {}
    if delivery:
        lines.extend([
            "",
            "## Photo delivery runway",
            "",
            delivery.get("headline", ""),
            "",
            delivery.get("plainEnglish", ""),
            "",
            f"Runway file: `{payload.get('photoDeliveryRunwayPath') or ''}`",
            "",
            "Do now:",
        ])
        for item in delivery.get("doNow") or []:
            lines.append(f"- {item}")
        lines.extend(["", "Steps:"])
        for step in delivery.get("steps") or []:
            if not isinstance(step, dict):
                continue
            lines.append(f"- {step.get('step')}. {step.get('label')}: `{step.get('command')}`")
            lines.append(f"  - Done when: {step.get('doneWhen')}")
            lines.append(f"  - Safety: {step.get('safety')}")
    lines.extend([
        "",
        "## Cull loop",
    ])
    for step in payload.get("reviewLoop") or []:
        lines.append(f"- {step.get('step')}. {step.get('label')}: `{step.get('command')}`")
        lines.append(f"  - Done when: {step.get('doneWhen')}")
        lines.append(f"  - Safety: {step.get('safety')}")
    triage = payload.get("machineTriageSummary") if isinstance(payload.get("machineTriageSummary"), dict) else {}
    if triage:
        lines.extend([
            "",
            "## Machine triage: attention routes, not verdicts",
            "",
            triage.get("headline", ""),
            "",
            triage.get("plainEnglish", ""),
            "",
            "Review order:",
        ])
        for item in triage.get("reviewOrder") or []:
            lines.append(f"- {item}")
        lines.extend(["", "First cull review set:"])
        for row in triage.get("firstCullReviewSet") or []:
            if not isinstance(row, dict):
                continue
            lines.extend([
                f"- `{row.get('photoId')}` `{row.get('filename')}` route=`{row.get('attentionRoute')}` group=`{row.get('reviewGroupId')}`",
                f"  - Note: {row.get('qualityNote') or row.get('decisionBias')}",
                f"  - Open source: `{row.get('openSourceCommand')}`",
                f"  - Dry-run review: `{row.get('dryRunReviewCommand')}`",
            ])
        lines.extend(["", "Do not do:"])
        for item in triage.get("doNotDo") or []:
            lines.append(f"- {item}")
    sprint = payload.get("twentyMinuteCullSprint") if isinstance(payload.get("twentyMinuteCullSprint"), dict) else {}
    if sprint:
        lines.extend([
            "",
            "## 20-minute cull sprint",
            "",
            sprint.get("headline", ""),
            "",
            "Steps:",
        ])
        for step in sprint.get("steps") or []:
            if not isinstance(step, dict):
                continue
            lines.append(f"- {step.get('minute')}: {step.get('label')} - {step.get('instruction')}")
        lines.extend(["", "Rows:"])
        for row in sprint.get("reviewRows") or []:
            if not isinstance(row, dict):
                continue
            lines.extend([
                f"- {row.get('position')}. `{row.get('photoId')}` `{row.get('filename')}` route=`{row.get('route')}`",
                f"  - Question: {row.get('reviewQuestion')}",
                f"  - Open source: `{row.get('sourceCommand')}`",
                f"  - Recommended dry-run first: `{row.get('recommendedFirstCommand')}`",
                f"  - Note prompt: {row.get('notePrompt')}",
            ])
        lines.extend(["", "Stop conditions:"])
        for item in sprint.get("stopConditions") or []:
            lines.append(f"- {item}")
    recipe = payload.get("firstReviewRecipe") if isinstance(payload.get("firstReviewRecipe"), dict) else {}
    if recipe:
        lines.extend([
            "",
            "## First review recipe",
            "",
            recipe.get("headline", ""),
            "",
            f"- State: `{recipe.get('state', '')}`",
            f"- One-sitting goal: {recipe.get('oneSittingGoal', '')}",
            "",
            "Operator steps:",
        ])
        for item in recipe.get("operatorSteps") or []:
            lines.append(f"- {item}")
        lines.extend(["", "Recipe rows:"])
        for row in recipe.get("reviewRows") or []:
            if not isinstance(row, dict):
                continue
            lines.extend([
                f"- {row.get('position')}. `{row.get('photoId')}` `{row.get('filename')}` route=`{row.get('route')}` group=`{row.get('group')}`",
                f"  - Prompt: {row.get('reviewPrompt')}",
                f"  - Open source: `{row.get('sourceCommand')}`",
                f"  - First dry run: `{row.get('firstDryRunCommand')}`",
                f"  - Optional sidecar decision: `{row.get('sidecarDecisionTemplate')}`",
                f"  - Avoid: {row.get('doNotDecideFrom')}",
            ])
        lines.extend(["", "Escape hatches:"])
        for item in recipe.get("escapeHatches") or []:
            lines.append(f"- {item}")
    lines.extend([
        "",
        "## Truth boundary",
    ])
    for boundary in payload.get("boundary") or []:
        lines.append(f"- {boundary}")
    path.write_text("\n".join(lines).rstrip() + "\n", encoding="utf-8")


def write_csv(path: Path, payload: dict[str, Any]) -> None:
    with path.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=["key", "status", "htmlPath", "jsonPath", "counts"])
        writer.writeheader()
        for row in payload.get("sourceBoards") or []:
            writer.writerow({
                "key": row.get("key") or "",
                "status": row.get("status") or "",
                "htmlPath": row.get("htmlPath") or "",
                "jsonPath": row.get("jsonPath") or "",
                "counts": json.dumps(row.get("counts") or {}, sort_keys=True),
            })


def render_html(payload: dict[str, Any]) -> str:
    esc = html.escape
    counts = payload.get("counts") or {}
    metrics = [
        ("photos", counts.get("sourcePhotos")),
        ("pending", counts.get("pending")),
        ("review", counts.get("review")),
        ("first keepers", counts.get("firstKeeperCandidates")),
        ("first pass", counts.get("firstPassTriageGroups")),
        ("cull board", counts.get("cullBoardCandidateRows")),
        ("decision cards", counts.get("cullDecisionCards")),
        ("rehearsal rows", counts.get("cullRehearsalRows")),
        ("proof selected", counts.get("selectedForClientProof")),
        ("groups", counts.get("contactSheetGroups")),
    ]
    metric_html = "\n".join(
        f"<div class=\"metric\"><strong>{esc(str(value))}</strong><span>{esc(label)}</span></div>"
        for label, value in metrics
    )
    actions_html = "\n".join(
        f"""
        <article class="action-card">
          <h3>{esc(str(action.get('label') or 'Open'))}</h3>
          <p>{esc(str(action.get('why') or ''))}</p>
          <code>{esc(str(action.get('command') or ''))}</code>
          <small>{esc(str(action.get('safety') or ''))}</small>
        </article>
        """
        for action in payload.get("safeActions") or []
    )
    loop_html = "\n".join(
        f"""
        <article class="loop-card">
          <b>{esc(str(step.get('step') or ''))}</b>
          <h3>{esc(str(step.get('label') or ''))}</h3>
          <p>{esc(str(step.get('why') or ''))}</p>
          <code>{esc(str(step.get('command') or ''))}</code>
          <small><strong>Done when:</strong> {esc(str(step.get('doneWhen') or ''))}</small>
          <small>{esc(str(step.get('safety') or ''))}</small>
        </article>
        """
        for step in payload.get("reviewLoop") or []
    )
    triage = payload.get("machineTriageSummary") if isinstance(payload.get("machineTriageSummary"), dict) else {}
    triage_counts = triage.get("counts") if isinstance(triage.get("counts"), dict) else {}
    triage_metric_html = "\n".join(
        f"<div class=\"metric\"><strong>{esc(str(value))}</strong><span>{esc(str(label))}</span></div>"
        for label, value in [
            ("candidates", triage_counts.get("candidateRows", 0)),
            ("quality hints", triage_counts.get("qualityProblemReview", 0)),
            ("near duplicates", triage_counts.get("nearDuplicateSequence", 0)),
            ("decisions", triage_counts.get("decisionEvents", 0)),
        ]
    )
    first_cull_html = "\n".join(
        f"""
        <article class="photo-card">
          <img src="{esc(str(row.get('thumbnailUri') or ''))}" alt="{esc(str(row.get('filename') or 'photo'))}" />
          <h3>{esc(str(row.get('filename') or 'Photo'))}</h3>
          <p><strong>{esc(str(row.get('attentionRoute') or 'attention'))}</strong> · group {esc(str(row.get('reviewGroupId') or 'none'))}</p>
          <p>{esc(str(row.get('qualityNote') or row.get('decisionBias') or 'Inspect visually before metadata.'))}</p>
          <code>{esc(str(row.get('openSourceCommand') or ''))}</code>
          <details><summary>Dry-run metadata commands</summary>
            <code>{esc(str(row.get('dryRunKeep4Command') or ''))}</code>
            <code>{esc(str(row.get('dryRunFavorite5Command') or ''))}</code>
            <code>{esc(str(row.get('dryRunReviewCommand') or ''))}</code>
            <code>{esc(str(row.get('dryRunRejectCommand') or ''))}</code>
          </details>
        </article>
        """
        for row in (triage.get("firstCullReviewSet") if isinstance(triage.get("firstCullReviewSet"), list) else [])
        if isinstance(row, dict)
    )
    triage_route_html = "\n".join(
        f"<li><strong>{esc(str(route.get('label') or route.get('id') or 'Route'))}</strong> · {esc(str(route.get('count') or 0))}<br><span>{esc(str(route.get('humanQuestion') or route.get('safeNextAction') or ''))}</span></li>"
        for route in (triage.get("routeSummary") if isinstance(triage.get("routeSummary"), list) else [])
        if isinstance(route, dict)
    )
    sprint = payload.get("twentyMinuteCullSprint") if isinstance(payload.get("twentyMinuteCullSprint"), dict) else {}
    sprint_steps_html = "\n".join(
        f"<li><strong>{esc(str(step.get('minute') or ''))} · {esc(str(step.get('label') or 'Step'))}</strong><br>{esc(str(step.get('instruction') or ''))}</li>"
        for step in (sprint.get("steps") if isinstance(sprint.get("steps"), list) else [])
        if isinstance(step, dict)
    )
    sprint_rows_html = "\n".join(
        f"""
        <article class="sprint-card">
          <p class="rank">#{esc(str(row.get('position') or ''))}</p>
          <h3>{esc(str(row.get('filename') or row.get('photoId') or 'Photo'))}</h3>
          <p>{esc(str(row.get('route') or 'review'))}</p>
          <p>{esc(str(row.get('reviewQuestion') or ''))}</p>
          <code>{esc(str(row.get('sourceCommand') or ''))}</code>
          <code>{esc(str(row.get('recommendedFirstCommand') or ''))}</code>
          <small>{esc(str(row.get('truth') or 'Dry-run only.'))}</small>
        </article>
        """
        for row in (sprint.get("reviewRows") if isinstance(sprint.get("reviewRows"), list) else [])
        if isinstance(row, dict)
    )
    sprint_stop_html = "\n".join(f"<li>{esc(str(item))}</li>" for item in (sprint.get("stopConditions") if isinstance(sprint.get("stopConditions"), list) else []))
    recipe = payload.get("firstReviewRecipe") if isinstance(payload.get("firstReviewRecipe"), dict) else {}
    runway = payload.get("firstCullRunway") if isinstance(payload.get("firstCullRunway"), dict) else {}
    delivery = payload.get("photoDeliveryRunway") if isinstance(payload.get("photoDeliveryRunway"), dict) else {}
    runway_steps_html = "\n".join(
        f"""
        <article class="runway-card">
          <p class="rank">{esc(str(step.get('step') or ''))}</p>
          <h3>{esc(str(step.get('label') or 'Step'))}</h3>
          <p>{esc(str(step.get('why') or ''))}</p>
          <code>{esc(str(step.get('command') or ''))}</code>
          <small><strong>Question:</strong> {esc(str(step.get('humanQuestion') or ''))}</small>
          <small><strong>Safe stop:</strong> {esc(str(step.get('safeStop') or ''))}</small>
        </article>
        """
        for step in (runway.get("steps") if isinstance(runway.get("steps"), list) else [])
        if isinstance(step, dict)
    )
    suggested = runway.get("suggestedFirstPassDecisions") if isinstance(runway.get("suggestedFirstPassDecisions"), dict) else {}
    suggested_rows_html = "\n".join(
        f"""
        <article class="suggestion-card">
          <p class="rank">#{esc(str(row.get('rank') or ''))} · {esc(str(row.get('suggestedIntent') or 'review'))}</p>
          <img src="{esc(str(row.get('thumbnailUri') or ''))}" alt="{esc(str(row.get('filename') or 'photo'))}" />
          <h3>{esc(str(row.get('filename') or row.get('photoId') or 'Photo'))}</h3>
          <p><strong>{esc(str(row.get('confidence') or 'review'))}</strong> · group {esc(str(row.get('reviewGroupId') or 'none'))}</p>
          <p>{esc(str(row.get('reason') or 'Inspect visually before deciding.'))}</p>
          <small><strong>Question:</strong> {esc(str(row.get('humanQuestion') or ''))}</small>
          <code>{esc(str(row.get('openSourceCommand') or ''))}</code>
          <code>{esc(str(row.get('firstDryRunCommand') or ''))}</code>
          <small>{esc(str(row.get('truth') or 'Dry-run only.'))}</small>
        </article>
        """
        for row in (suggested.get("rows") if isinstance(suggested.get("rows"), list) else [])
        if isinstance(row, dict)
    )
    suggested_guardrails_html = "\n".join(f"<li>{esc(str(item))}</li>" for item in (suggested.get("guardrails") if isinstance(suggested.get("guardrails"), list) else []))
    decision_cards = payload.get("cullDecisionCards") if isinstance(payload.get("cullDecisionCards"), dict) else {}
    decision_cards_html = "\n".join(
        f"""
        <article class="decision-card">
          <p class="rank">#{esc(str(card.get('rank') or ''))} · {esc(str(card.get('recommendedFirstDecision') or 'review'))}</p>
          <img src="{esc(str(card.get('thumbnailUri') or ''), quote=True)}" alt="{esc(str(card.get('filename') or 'photo'))}" />
          <h3>{esc(str(card.get('filename') or card.get('photoId') or 'Photo'))}</h3>
          <p><strong>{esc(str(card.get('confidence') or 'review'))}</strong> · group {esc(str(card.get('reviewGroupId') or 'none'))}</p>
          <p>{esc(str(card.get('humanQuestion') or ''))}</p>
          <code>{esc(str(card.get('openSourceCommand') or ''))}</code>
          <code>{esc(str(card.get('firstDryRunCommand') or ''))}</code>
          <details><summary>Copy local review note</summary><code>{esc(str(card.get('localReviewNoteYaml') or ''))}</code></details>
          <small>{esc(str(card.get('truth') or 'Local review intent only.'))}</small>
        </article>
        """
        for card in (decision_cards.get("cards") if isinstance(decision_cards.get("cards"), list) else [])
        if isinstance(card, dict)
    )
    decision_cards_do_not_html = "\n".join(f"<li>{esc(str(item))}</li>" for item in (decision_cards.get("doNotDo") if isinstance(decision_cards.get("doNotDo"), list) else []))
    runway_do_html = "\n".join(f"<li>{esc(str(item))}</li>" for item in (runway.get("doNow") if isinstance(runway.get("doNow"), list) else []))
    runway_dont_html = "\n".join(f"<li>{esc(str(item))}</li>" for item in (runway.get("doNotDo") if isinstance(runway.get("doNotDo"), list) else []))
    delivery_do_html = "\n".join(f"<li>{esc(str(item))}</li>" for item in (delivery.get("doNow") if isinstance(delivery.get("doNow"), list) else []))
    delivery_dont_html = "\n".join(f"<li>{esc(str(item))}</li>" for item in (delivery.get("doNotDo") if isinstance(delivery.get("doNotDo"), list) else []))
    delivery_steps_html = "\n".join(
        f"""
        <article class="runway-card">
          <p class="rank">{esc(str(step.get('step') or ''))}</p>
          <h3>{esc(str(step.get('label') or 'Step'))}</h3>
          <p>{esc(str(step.get('why') or ''))}</p>
          <code>{esc(str(step.get('command') or ''))}</code>
          <small><strong>Done when:</strong> {esc(str(step.get('doneWhen') or ''))}</small>
          <small><strong>Safety:</strong> {esc(str(step.get('safety') or ''))}</small>
        </article>
        """
        for step in (delivery.get("steps") if isinstance(delivery.get("steps"), list) else [])
        if isinstance(step, dict)
    )
    recipe_steps_html = "\n".join(f"<li>{esc(str(item))}</li>" for item in (recipe.get("operatorSteps") if isinstance(recipe.get("operatorSteps"), list) else []))
    recipe_escape_html = "\n".join(f"<li>{esc(str(item))}</li>" for item in (recipe.get("escapeHatches") if isinstance(recipe.get("escapeHatches"), list) else []))
    recipe_rows_html = "\n".join(
        f"""
        <article class="recipe-card">
          <p class="rank">#{esc(str(row.get('position') or ''))} · {esc(str(row.get('route') or 'review'))}</p>
          <h3>{esc(str(row.get('filename') or row.get('photoId') or 'Photo'))}</h3>
          <p>{esc(str(row.get('reviewPrompt') or ''))}</p>
          <code>{esc(str(row.get('sourceCommand') or ''))}</code>
          <code>{esc(str(row.get('firstDryRunCommand') or ''))}</code>
          <details><summary>Optional sidecar decision template</summary><code>{esc(str(row.get('sidecarDecisionTemplate') or ''))}</code></details>
          <small>{esc(str(row.get('truth') or 'Recipe row only.'))}</small>
        </article>
        """
        for row in (recipe.get("reviewRows") if isinstance(recipe.get("reviewRows"), list) else [])
        if isinstance(row, dict)
    )
    boards_html = "\n".join(
        f"""
        <tr>
          <td>{esc(str(row.get('key') or ''))}</td>
          <td>{esc(str(row.get('status') or ''))}</td>
          <td>{esc(str((row.get('counts') or {}).get('sourcePhotos') or (row.get('counts') or {}).get('totalPhotos') or (row.get('counts') or {}).get('total') or ''))}</td>
          <td>{'<a href="' + esc(str(row.get('htmlPath')), quote=True) + '">open</a>' if row.get('htmlPath') else ''}</td>
        </tr>
        """
        for row in payload.get("sourceBoards") or []
    )
    boundary_html = "\n".join(f"<li>{esc(str(item))}</li>" for item in payload.get("boundary") or [])
    return f"""<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title>Photo Grove control room</title>
  <style>
    :root {{
      color-scheme: dark;
      --bg: #101812;
      --panel: #18261c;
      --panel-2: #213324;
      --ink: #f3ead8;
      --muted: #b7ad99;
      --leaf: #7fd07a;
      --honey: #f2c14e;
      --clay: #d1744f;
      --line: rgba(243,234,216,.14);
    }}
    body {{
      margin: 0;
      background: radial-gradient(circle at 10% 0%, rgba(127,208,122,.16), transparent 35%),
                  radial-gradient(circle at 80% 10%, rgba(242,193,78,.10), transparent 32%),
                  var(--bg);
      color: var(--ink);
      font: 15px/1.5 -apple-system, BlinkMacSystemFont, "SF Pro Text", sans-serif;
    }}
    main {{ max-width: 1180px; margin: 0 auto; padding: 48px 24px 72px; }}
    .hero {{ border: 1px solid var(--line); border-radius: 28px; background: linear-gradient(135deg, rgba(24,38,28,.96), rgba(33,51,36,.82)); padding: 34px; box-shadow: 0 22px 70px rgba(0,0,0,.32); }}
    .eyebrow {{ color: var(--honey); letter-spacing: .22em; font-weight: 800; text-transform: uppercase; font-size: 12px; }}
    h1 {{ font-size: clamp(38px, 5vw, 72px); line-height: .92; margin: 12px 0 18px; letter-spacing: -.05em; }}
    p {{ color: var(--muted); max-width: 780px; }}
    .metrics {{ display: grid; grid-template-columns: repeat(auto-fit, minmax(130px, 1fr)); gap: 12px; margin: 28px 0; }}
    .metric {{ background: rgba(255,255,255,.06); border: 1px solid var(--line); border-radius: 18px; padding: 16px; }}
    .metric strong {{ display:block; font-size: 28px; color: var(--leaf); }}
    .metric span {{ color: var(--muted); text-transform: uppercase; font-size: 11px; letter-spacing: .12em; }}
    .grid {{ display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 14px; margin-top: 22px; }}
    .action-card {{ border: 1px solid var(--line); border-radius: 18px; padding: 18px; background: rgba(255,255,255,.045); }}
    .photo-card {{ border: 1px solid var(--line); border-radius: 18px; padding: 14px; background: rgba(255,255,255,.045); }}
	    .sprint-card {{ border: 1px solid rgba(242,193,78,.25); border-radius: 18px; padding: 16px; background: rgba(242,193,78,.07); }}
	    .recipe-card {{ border: 1px solid rgba(127,208,122,.28); border-radius: 18px; padding: 16px; background: linear-gradient(180deg, rgba(127,208,122,.10), rgba(255,255,255,.035)); }}
    .suggestion-card {{ border: 1px solid rgba(242,193,78,.34); border-radius: 20px; padding: 16px; background: linear-gradient(180deg, rgba(242,193,78,.13), rgba(127,208,122,.055)); }}
    .decision-card {{ border: 1px solid rgba(127,208,122,.38); border-radius: 20px; padding: 16px; background: linear-gradient(180deg, rgba(127,208,122,.14), rgba(242,193,78,.06)); }}
    .rank {{ color: var(--honey); font-weight: 900; }}
    .photo-card img {{ width: 100%; aspect-ratio: 4/3; object-fit: cover; border-radius: 14px; background: rgba(0,0,0,.3); }}
    .suggestion-card img {{ width: 100%; aspect-ratio: 4/3; object-fit: cover; border-radius: 14px; background: rgba(0,0,0,.3); }}
    .decision-card img {{ width: 100%; aspect-ratio: 4/3; object-fit: cover; border-radius: 14px; background: rgba(0,0,0,.3); }}
    .loop-card {{ position: relative; border: 1px solid var(--line); border-radius: 18px; padding: 20px; background: rgba(127,208,122,.055); }}
    .runway-card {{ position: relative; border: 1px solid rgba(127,208,122,.32); border-radius: 20px; padding: 18px; background: linear-gradient(180deg, rgba(127,208,122,.12), rgba(242,193,78,.06)); }}
    .loop-card b {{ display: inline-grid; place-items: center; width: 30px; height: 30px; border-radius: 999px; background: rgba(127,208,122,.18); color: var(--leaf); margin-bottom: 8px; }}
    h2 {{ margin-top: 44px; }}
    h3 {{ margin: 0 0 8px; }}
    code {{ display:block; white-space: pre-wrap; background: rgba(0,0,0,.28); border-radius: 12px; padding: 10px; color: var(--honey); }}
    small {{ display:block; color: var(--muted); margin-top: 10px; }}
    table {{ width: 100%; border-collapse: collapse; overflow: hidden; border-radius: 18px; background: rgba(255,255,255,.04); }}
    th, td {{ text-align: left; padding: 12px 14px; border-bottom: 1px solid var(--line); vertical-align: top; }}
    th {{ color: var(--honey); font-size: 12px; letter-spacing: .12em; text-transform: uppercase; }}
    a {{ color: var(--leaf); }}
    .boundary {{ background: rgba(209,116,79,.10); border: 1px solid rgba(209,116,79,.24); border-radius: 18px; padding: 18px; }}
  </style>
</head>
<body>
  <main>
    <section class="hero">
      <div class="eyebrow">Photo Grove</div>
      <h1>Cull calmly. Preserve everything.</h1>
      <p>{esc(str(payload.get('summary') or ''))}</p>
      <div class="metrics">{metric_html}</div>
      <p><strong>Status:</strong> {esc(str(payload.get('status') or ''))} · <strong>Stage:</strong> {esc(str(payload.get('stage') or ''))}</p>
    </section>
    <h2>First cull runway</h2>
    <section class="boundary">
      <p><strong>{esc(str(runway.get('headline') or ''))}</strong></p>
      <p>{esc(str(runway.get('plainEnglish') or ''))}</p>
      <p><strong>Do now</strong></p>
      <ul>{runway_do_html}</ul>
      <p><strong>Do not do</strong></p>
      <ul>{runway_dont_html}</ul>
      <p><a href="{esc(str(payload.get('firstCullRunwayPath') or ''), quote=True)}">Open the Markdown runway</a></p>
    </section>
    <h2>Delivery runway</h2>
    <section class="boundary">
      <p><strong>{esc(str(delivery.get('headline') or 'Selected is not shipped.'))}</strong></p>
      <p>{esc(str(delivery.get('plainEnglish') or 'Delivery prep stays local until explicit approval.'))}</p>
      <p><strong>Do now</strong></p>
      <ul>{delivery_do_html}</ul>
      <p><strong>Do not do</strong></p>
      <ul>{delivery_dont_html}</ul>
      <p><a href="{esc(str(payload.get('photoDeliveryRunwayPath') or ''), quote=True)}">Open the delivery runway</a></p>
    </section>
    <section class="grid">{delivery_steps_html or '<p>No delivery runway steps available yet.</p>'}</section>
    <h2>Suggested first-pass tray</h2>
    <section class="boundary">
      <p><strong>{esc(str(suggested.get('headline') or 'No suggested tray generated yet.'))}</strong></p>
      <p>{esc(str(suggested.get('plainEnglish') or 'Suggestions are dry-run routing only, never automatic verdicts.'))}</p>
      <ul>{suggested_guardrails_html}</ul>
    </section>
    <section class="grid">{suggested_rows_html or '<p>No suggested first-pass rows available yet.</p>'}</section>
    <h2>Cull decision cards</h2>
    <section class="boundary">
      <p><strong>{esc(str(decision_cards.get('headline') or 'No cull decision cards generated yet.'))}</strong></p>
      <p>{esc(str(decision_cards.get('plainEnglish') or 'Decision cards are local review notes only.'))}</p>
      <p><a href="{esc(str(payload.get('cullDecisionCardsPath') or ''), quote=True)}">Open the cull decision cards</a></p>
      <ul>{decision_cards_do_not_html}</ul>
    </section>
    <section class="grid">{decision_cards_html or '<p>No cull decision cards available yet.</p>'}</section>
    <section class="grid">{runway_steps_html or '<p>No first-cull runway steps available yet.</p>'}</section>
    <h2>Safe next actions</h2>
    <section class="grid">{actions_html}</section>
    <h2>Cull loop</h2>
    <section class="grid">{loop_html}</section>
    <h2>Machine triage: attention routes, not verdicts</h2>
    <section class="boundary">
      <p>{esc(str(triage.get('plainEnglish') or ''))}</p>
      <div class="metrics">{triage_metric_html}</div>
      <ul>{triage_route_html}</ul>
    </section>
    <h2>20-minute cull sprint</h2>
    <section class="boundary">
      <p>{esc(str(sprint.get('headline') or ''))}</p>
      <ul>{sprint_steps_html}</ul>
      <p><strong>Stop before real metadata writes unless explicitly approved.</strong></p>
      <ul>{sprint_stop_html}</ul>
    </section>
	    <section class="grid">{sprint_rows_html or '<p>No sprint rows available yet.</p>'}</section>
	    <h2>First review recipe</h2>
	    <section class="boundary">
	      <p><strong>{esc(str(recipe.get('headline') or ''))}</strong></p>
	      <p>{esc(str(recipe.get('oneSittingGoal') or ''))}</p>
	      <ul>{recipe_steps_html}</ul>
	      <p><strong>Escape hatches</strong></p>
	      <ul>{recipe_escape_html}</ul>
	    </section>
	    <section class="grid">{recipe_rows_html or '<p>No recipe rows available yet.</p>'}</section>
	    <h2>First cull review set</h2>
    <section class="grid">{first_cull_html or '<p>No cull candidates carried into this control room.</p>'}</section>
    <h2>Truth boundary</h2>
    <section class="boundary"><ul>{boundary_html}</ul></section>
    <h2>Source boards</h2>
    <table>
      <thead><tr><th>Board</th><th>Status</th><th>Photo count hint</th><th>Open</th></tr></thead>
      <tbody>{boards_html}</tbody>
    </table>
  </main>
</body>
</html>
"""


def build(photo_root: Path) -> tuple[Path, dict[str, Any]]:
    parts, pointer_paths = collect_parts(photo_root)
    counts = build_counts(parts)
    status, stage, summary = status_for(counts)
    out_dir = photo_root / "ControlRooms" / stamp()
    out_dir.mkdir(parents=True, exist_ok=True)
    source_boards = [artifact_row(key, payload) for key, payload in parts.items()]
    payload: dict[str, Any] = {
        "schema": SCHEMA,
        "generatedAt": iso_now(),
        "status": status,
        "stage": stage,
        "summary": summary,
        "photoRoot": str(photo_root),
        "sessionDir": str(out_dir),
        "htmlPath": str(out_dir / "index.html"),
        "jsonPath": str(out_dir / "photo-grove-control-room.json"),
        "markdownPath": str(out_dir / "START-HERE-photo-grove-control-room.md"),
        "csvPath": str(out_dir / "photo-grove-control-room.csv"),
        "firstCullRunwayPath": str(out_dir / "FIRST-CULL-RUNWAY.md"),
        "cullDecisionCardsPath": str(out_dir / "CULL-DECISION-CARDS.md"),
        "qualityEvidenceCardsPath": str(out_dir / "QUALITY-EVIDENCE-CARDS.md"),
        "proofCandidateCardsPath": str(out_dir / "PROOF-CANDIDATE-CARDS.md"),
        "nextCullCardPath": str((parts.get("nextCullCard") or {}).get("htmlPath") or (parts.get("nextCullCard") or {}).get("markdownPath") or (parts.get("nextCullCard") or {}).get("jsonPath") or ""),
        "photoDeliveryRunwayPath": str(out_dir / "PHOTO-DELIVERY-RUNWAY.md"),
        "counts": counts,
        "safeActions": build_actions(parts, counts),
        "reviewLoop": [],
        "machineTriageSummary": {},
        "suggestedFirstPassDecisions": {},
        "cullDecisionCards": {},
        "qualityEvidenceCards": {},
        "proofCandidateCards": {},
        "firstReviewRecipe": {},
        "sourcePointerPaths": pointer_paths,
        "sourceBoards": source_boards,
        "nextSafestAction": "Open Photo Grove first-pass triage first, compare one small group visually, then use cull rehearsal before any real metadata decision.",
        "humanAsk": "Compare one first-pass triage group, choose only a metadata-only keep/review/reject/favorite direction if the intent is obvious, and do not treat any local packet as client delivery.",
        "agentSafeParallelWork": "Codex can improve grouping, quality hints, contact sheets, command sheets, proof packets, path validation, and review packets without executing cull commands or mutating originals.",
        "firstSafeAction": {},
        "boundary": [
            "Original photos are not moved, deleted, rewritten, exported, uploaded, or delivered.",
            "Cull suggestions are metadata/readiness guidance, not approved edits.",
            "Client proof packets are local review packets until an explicit approved delivery happens.",
            "Keep, reject, favorite, rating, and tag changes require a later explicit metadata command or human approval.",
            "External publication/delivery receipts remain separate from local readiness.",
        ],
        "safety": {
            "originalsMutated": False,
            "metadataChanged": False,
            "clientDeliveryCreated": False,
            "externalPublishing": False,
            "externalSchedulesCreated": False,
            "versionsOverwritten": False,
            "sourceDeletes": False,
            "copyPlanExecuted": False,
            "receiptTruthCreated": False,
        },
        "truth": "Photo Grove control room only. It aggregates local culling/proof evidence and safe next actions without mutating originals, executing metadata decisions, exporting, uploading, publishing, scheduling, or creating client-delivery truth.",
    }
    html_paths = {
        key: str(value.get("htmlPath") or "")
        for key, value in parts.items()
        if isinstance(value, dict)
    }
    payload["reviewLoop"] = build_review_loop(html_paths)
    payload["machineTriageSummary"] = build_machine_triage(parts, counts, limit=12)
    payload["suggestedFirstPassDecisions"] = build_suggested_first_pass_decisions(payload["machineTriageSummary"], limit=10)
    payload["twentyMinuteCullSprint"] = build_twenty_minute_cull_sprint(payload["machineTriageSummary"], counts)
    payload["firstReviewRecipe"] = build_first_review_recipe(payload["machineTriageSummary"], counts)
    counts["suggestedFirstPassRows"] = (payload["suggestedFirstPassDecisions"].get("counts") or {}).get("rows", 0)
    counts["firstReviewRecipeRows"] = (payload["firstReviewRecipe"].get("batchCounts") or {}).get("recipeRows", 0)
    counts["firstReviewRecipeWorkableRows"] = (payload["firstReviewRecipe"].get("batchCounts") or {}).get("workableRows", 0)
    payload["cullDecisionCards"] = build_cull_decision_cards(payload, limit=8)
    counts["cullDecisionCards"] = (payload["cullDecisionCards"].get("counts") or {}).get("cards", 0)
    payload["qualityEvidenceCards"] = build_quality_evidence_cards(payload, limit=12)
    counts["qualityEvidenceCards"] = (payload["qualityEvidenceCards"].get("counts") or {}).get("cards", 0)
    payload["proofCandidateCards"] = build_proof_candidate_cards(payload, limit=12)
    counts["proofCandidateCards"] = (payload["proofCandidateCards"].get("counts") or {}).get("cards", 0)
    payload["firstCullRunway"] = build_first_cull_runway(payload)
    payload["photoDeliveryRunway"] = build_photo_delivery_runway(parts, counts)
    first_action_path = payload["nextCullCardPath"] or payload["htmlPath"]
    payload["firstSafeAction"] = {
        "label": "Open next Photo Grove cull card" if payload["nextCullCardPath"] else "Open Photo Grove control room",
        "command": f"open {shell_quote(first_action_path)}",
        "path": first_action_path,
        "safety": "Opens one local Photo Grove cull card first. No originals, metadata, exports, uploads, delivery state, source mutation, delete, overwrite, approval, or receipt truth is changed.",
    }
    write_json(out_dir / "photo-grove-control-room.json", payload)
    write_first_cull_runway_markdown(out_dir / "FIRST-CULL-RUNWAY.md", payload)
    write_cull_decision_cards_markdown(out_dir / "CULL-DECISION-CARDS.md", payload)
    write_quality_evidence_cards_markdown(out_dir / "QUALITY-EVIDENCE-CARDS.md", payload)
    write_proof_candidate_cards_markdown(out_dir / "PROOF-CANDIDATE-CARDS.md", payload)
    write_photo_delivery_runway_markdown(out_dir / "PHOTO-DELIVERY-RUNWAY.md", payload)
    write_markdown(out_dir / "START-HERE-photo-grove-control-room.md", payload)
    write_csv(out_dir / "photo-grove-control-room.csv", payload)
    (out_dir / "index.html").write_text(render_html(payload), encoding="utf-8")
    latest = {
        "schema": "quipsly.photo-grove.control-room.latest-pointer.v1",
        "generatedAt": payload["generatedAt"],
        "status": payload["status"],
        "stage": payload["stage"],
        "photoRoot": str(photo_root),
        "sessionDir": str(out_dir),
        "htmlPath": payload["htmlPath"],
        "jsonPath": payload["jsonPath"],
        "markdownPath": payload["markdownPath"],
        "csvPath": payload["csvPath"],
        "firstCullRunwayPath": payload["firstCullRunwayPath"],
        "cullDecisionCardsPath": payload["cullDecisionCardsPath"],
        "qualityEvidenceCardsPath": payload["qualityEvidenceCardsPath"],
        "proofCandidateCardsPath": payload["proofCandidateCardsPath"],
        "nextCullCardPath": payload["nextCullCardPath"],
        "photoDeliveryRunwayPath": payload["photoDeliveryRunwayPath"],
        "counts": counts,
        "firstSafeAction": payload["firstSafeAction"],
        "reviewLoop": payload["reviewLoop"],
        "machineTriageSummary": payload["machineTriageSummary"],
        "suggestedFirstPassDecisions": payload["suggestedFirstPassDecisions"],
        "cullDecisionCards": payload["cullDecisionCards"],
        "qualityEvidenceCards": payload["qualityEvidenceCards"],
        "proofCandidateCards": payload["proofCandidateCards"],
        "twentyMinuteCullSprint": payload["twentyMinuteCullSprint"],
        "firstReviewRecipe": payload["firstReviewRecipe"],
        "firstCullRunway": payload["firstCullRunway"],
        "photoDeliveryRunway": payload["photoDeliveryRunway"],
        "nextSafestAction": payload["nextSafestAction"],
        "humanAsk": payload["humanAsk"],
        "agentSafeParallelWork": payload["agentSafeParallelWork"],
        "safety": payload["safety"],
        "truth": payload["safety"],
        "truthDescription": payload["truth"],
    }
    write_json(photo_root / LATEST_POINTER, latest)
    return out_dir, payload


def main() -> None:
    import argparse

    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("photo_root", nargs="?", default=str(DEFAULT_PHOTO_ROOT))
    args = parser.parse_args()
    out_dir, payload = build(Path(args.photo_root).expanduser())
    print(json.dumps({
        "status": payload["status"],
        "htmlPath": str(out_dir / "index.html"),
        "jsonPath": str(out_dir / "photo-grove-control-room.json"),
        "counts": payload["counts"],
    }, indent=2, sort_keys=True))


if __name__ == "__main__":
    main()
